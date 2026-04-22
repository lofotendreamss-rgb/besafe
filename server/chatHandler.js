// ============================================================
// chatHandler — Express handler for BeSafe's POST /api/chat
// ============================================================
//
// Step 2a scope: stateless infrastructure sanity check.
//   * Anthropic call: claude-haiku-4-5, single-turn, no system prompt
//   * Audit log:      one row per Anthropic call (success OR error)
//   * NO conversations / messages table writes (Step 2b owns history)
//   * NO tool calling (Step 2c)
//   * NO multi-language (Step 2b)
//
// Factory pattern — accepts the anthropic + supabase clients so this
// module:
//   1. doesn't import from besafe-server.js (avoids circular deps)
//   2. is trivially unit-testable (inject stubs)
//
// Middleware chain — MUST be wired after authLicense + chatRateLimit:
//
//   app.post('/api/chat',
//     authLicense,        // 1. populates req.license
//     chatRateLimit,      // 2. enforces 20/min/license_key
//     chatHandler,        // 3. this module
//   );
//
// Security posture:
//   - Defensive 500 if req.license is missing (misrouted mount)
//   - 4xx validation errors return FAST, before Anthropic is called —
//     protects the API budget from malformed clients
//   - AbortController bounds every Anthropic round-trip to 30s — a
//     hung upstream cannot tie up a response slot indefinitely
//   - Fire-and-forget audit write — response latency never depends on
//     Supabase insert (mirrors rateLimit.js FIX #1)
//   - Validation 4xx / 500 misconfig do NOT audit. Reason: those are
//     client-side programming errors or deployment bugs, not security
//     events. rateLimit + authLicense already cover abuse pattern
//     detection. Only Anthropic success/error rows land in audit —
//     which is what quota tracking (Step 2c+) will read.
//
// Error mapping (Anthropic call failed):
//   AbortError / signal.aborted   → 504  'timeout'
//   err.status 4xx                → 502  'upstream_error'
//   err.status 5xx / network / ?  → 503  'service_unavailable'
//
// TODO(step-2b): wire conversation_id — create/look-up conversations
//                row, insert user + assistant messages, thread the id
//                through audit.
// TODO(step-2c): enforce per-conversation daily_message_count quota
//                from the conversations table before the Anthropic
//                call; 429 with quota_exceeded if over.

// ============================================================
// Module constants — global product decisions, not per-call knobs.
// ============================================================

// Claude Haiku 4.5 — fast, cheap, good enough for Step 2a smoke test.
// Upgrade path (Step 2b+): route complex queries to Sonnet 4.6.
const MODEL = 'claude-haiku-4-5-20251001';

// Hard cap on Anthropic output. 500 tokens ≈ 1500-2000 chars —
// covers smoke-test replies without letting a prompt-injection probe
// burn through budget on a multi-page response.
const MAX_OUTPUT_TOKENS = 500;

// Hard cap on user input length (characters, NOT tokens). Keeps
// prompts predictable-sized + prevents megabyte-payload DoS before the
// request reaches Anthropic. Tokens are ~3-4 chars on average so 2000
// chars ≈ 500-700 input tokens.
const MAX_MESSAGE_LENGTH = 2000;

// Bound every Anthropic round-trip. AbortController-based; the
// 504 response fires on abort AND the timer is always cleared in the
// happy path so there is no orphan timeout holding the event loop open.
const ANTHROPIC_TIMEOUT_MS = 30_000;

// Mirrors MAX_FINGERPRINT_LENGTH in authLicense.js + rateLimit.js.
// Centralizing to a shared constants module is a future refactor; for
// now the three modules agree on 256.
const MAX_FINGERPRINT_LENGTH = 256;

// ============================================================
// Factory
// ============================================================

export function createChatHandler(anthropic, supabase) {
  // Fail-fast validation at server boot. A misconfigured handler
  // should crash at startup, not on the first real request.
  if (!anthropic || typeof anthropic?.messages?.create !== 'function') {
    throw new Error('[chatHandler] anthropic client with messages.create() is required');
  }
  if (!supabase || typeof supabase.from !== 'function') {
    throw new Error('[chatHandler] supabase client with .from() is required');
  }

  return async function chatHandler(req, res) {
    // ----------------------------------------------------------
    // Step 1: defensive — authLicense must have populated req.license.
    //
    // This branch ONLY fires if the handler was mounted without the
    // authLicense middleware in front of it (deployment bug). We return
    // 500, not 401, because the problem is server wiring, not the
    // caller's credentials. Intentionally NOT audit'd — this is a
    // deployment-time bug, not a security event.
    // ----------------------------------------------------------
    if (!req.license || typeof req.license.license_key !== 'string') {
      return res.status(500).json({ error: 'server_misconfigured' });
    }

    // ----------------------------------------------------------
    // Step 2: body validation — fail fast before touching Anthropic.
    //
    // Validation 4xx are NOT audit'd. Reason: they are client-side
    // programming errors (typo, forgot body, UI bug) that would flood
    // ai_audit_log with noise. Abuse patterns are already covered by
    // the upstream rate limiter.
    // ----------------------------------------------------------
    const message = req?.body?.message;

    if (typeof message !== 'string') {
      return res.status(400).json({ error: 'message_required' });
    }
    if (message.trim().length === 0) {
      return res.status(400).json({ error: 'message_empty' });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        error:      'message_too_long',
        max_length: MAX_MESSAGE_LENGTH,
      });
    }

    // ----------------------------------------------------------
    // Step 3: Anthropic call with AbortController timeout.
    //
    // We measure elapsed_ms from JUST BEFORE the call so network +
    // server compute time is what the client sees, not our validation
    // overhead. Client can use elapsed_ms to decide whether to show a
    // "response was slow" UX hint.
    // ----------------------------------------------------------
    const start      = Date.now();
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS);

    try {
      const response = await anthropic.messages.create(
        {
          model:      MODEL,
          max_tokens: MAX_OUTPUT_TOKENS,
          messages:   [{ role: 'user', content: message }],
        },
        { signal: controller.signal },
      );
      clearTimeout(timeoutId);

      const elapsed_ms = Date.now() - start;

      // Sum input + output for billing visibility. Optional chaining
      // in case Anthropic changes the usage shape in a future SDK
      // version — we degrade to 0 rather than crashing.
      const tokensUsed =
        (response.usage?.input_tokens  ?? 0) +
        (response.usage?.output_tokens ?? 0);

      // FIX: .find(type === 'text') instead of content[0] so we stay
      // correct when Claude returns mixed blocks (reasoning models
      // emit `thinking` blocks before `text`; tool calling adds
      // `tool_use` blocks). Haiku + single-turn doesn't hit this today,
      // but Step 2c will — worth the 1-line future-proofing now.
      // Defensive fallback to empty string if no text block at all —
      // better to send "" than 500.
      const textBlock = response.content?.find((b) => b.type === 'text');
      const replyText = textBlock?.text ?? '';

      // Fire-and-forget — response latency must NOT depend on the
      // audit write (mirrors rateLimit.js FIX #1).
      writeAuditEvent(supabase, {
        req,
        license_id:    req.license.id,
        license_key:   req.license.license_key,
        action:        'chat',
        status:        'success',
        error_message: null,
        tokens_used:   tokensUsed,
      }).catch(() => {});

      return res.json({
        response:    replyText,
        tokens_used: tokensUsed,
        model:       MODEL,
        elapsed_ms,
      });
    } catch (err) {
      clearTimeout(timeoutId);

      // Error classification. Check `controller.signal.aborted` first
      // because some SDK error wrappers lose the original `name` —
      // signal state is authoritative.
      const isAbort   = controller.signal.aborted || err?.name === 'AbortError';
      const errStatus = err?.status;

      let httpStatus, errorCode, auditMessage;
      if (isAbort) {
        httpStatus   = 504;
        errorCode    = 'timeout';
        auditMessage = 'anthropic_error: timeout';
      } else if (typeof errStatus === 'number' && errStatus >= 400 && errStatus < 500) {
        httpStatus   = 502;
        errorCode    = 'upstream_error';
        auditMessage = `anthropic_error: ${errStatus}`;
      } else {
        // 5xx, network failure, or unknown — all map to 503 so the
        // client distinguishes "Anthropic down / transient" (retry)
        // from "we rejected you" (4xx upstream_error, don't retry).
        httpStatus   = 503;
        errorCode    = 'service_unavailable';
        auditMessage = `anthropic_error: ${errStatus ?? 'network'}`;
      }

      writeAuditEvent(supabase, {
        req,
        license_id:    req.license.id,
        license_key:   req.license.license_key,
        action:        'chat',
        status:        'error',
        error_message: auditMessage,
        tokens_used:   null,
      }).catch(() => {});

      return res.status(httpStatus).json({ error: errorCode });
    }
  };
}

// ============================================================
// Internal helpers
// ============================================================

// Writes one row to ai_audit_log. Wrapped in try/catch so any audit
// failure (DB down, transient error, schema drift) is swallowed —
// the chat response MUST NEVER depend on audit success. Mirrors the
// helper in rateLimit.js so all three middlewares produce
// byte-compatible forensic rows.
//
// Callers should fire this FIRE-AND-FORGET — the function returns a
// Promise so `.catch(() => {})` can attach without awaiting, keeping
// response latency independent of Supabase round-trip time.
async function writeAuditEvent(supabase, row) {
  try {
    // Prefer populated state from upstream authLicense (req.deviceFingerprint,
    // req.clientIp, req.userAgent); fall back to raw headers so the helper
    // also works if wired downstream of a leaner middleware chain.
    const rawFp       = row.req?.deviceFingerprint ?? row.req?.headers?.['x-device-fingerprint'];
    const fingerprint = typeof rawFp === 'string' && rawFp.length > 0
      ? rawFp.slice(0, MAX_FINGERPRINT_LENGTH)
      : null;

    const xff = row.req?.headers?.['x-forwarded-for'];
    const ip  = (typeof xff === 'string' && xff.split(',')[0].trim())
      || row.req?.clientIp
      || row.req?.ip
      || null;

    const userAgent = row.req?.userAgent ?? row.req?.headers?.['user-agent'] ?? null;

    await supabase.from('ai_audit_log').insert({
      license_id:         row.license_id ?? null,
      license_key:        row.license_key,
      device_fingerprint: fingerprint,
      ip,
      user_agent:         userAgent,
      action:             row.action,
      conversation_id:    null,  // Step 2b will thread this through
      status:             row.status,
      error_message:      row.error_message ?? null,
      tokens_used:        row.tokens_used   ?? null,
    });
  } catch (err) {
    // Audit failure MUST NOT break the chat response.
    console.warn('[chatHandler] audit log write failed:', err?.message);
  }
}
