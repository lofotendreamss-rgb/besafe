// ============================================================
// chatHandler — Express handler for BeSafe's POST /api/chat
// ============================================================
//
// Step 2a–2c scope: stateless single-turn chat with a finance-scoped
// system prompt and per-request language routing via X-Language.
//   * Anthropic call: claude-haiku-4-5, single-turn, SYSTEM_PROMPT_TEMPLATE
//   * X-Language header → {LANGUAGE} placeholder in the template
//   * Audit log:      one row per Anthropic call (success OR error)
//   * NO conversations / messages table writes (future step owns history)
//
// Phase 3 step 2/6 (2026-04-28): tool calling wired in. Anthropic
// receives the schema list from server/ai/tools.js; tool_use blocks in
// the response are parsed into a `toolCalls` array on the JSON reply.
// Execution + confirmation UI live in steps 3/6 and 4/6 respectively —
// this step only builds the rails. Backward compatible: clients that
// don't know about toolCalls see the same `response` text field they
// always saw.
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
// Language routing — maps 2-char codes from the X-Language header
// to full English names that are substituted into the system
// prompt's {LANGUAGE} placeholder. Mirrors the 14 languages
// shipped in js/core/i18n.js. Anything missing / unknown /
// malformed degrades silently to English.
// ============================================================
const LANG_NAMES = {
  lt: 'Lithuanian',
  en: 'English',
  de: 'German',
  es: 'Spanish',
  fr: 'French',
  it: 'Italian',
  no: 'Norwegian',
  pl: 'Polish',
  pt: 'Portuguese',
  sv: 'Swedish',
  ru: 'Russian',
  uk: 'Ukrainian',
  zh: 'Chinese',
  ja: 'Japanese',
};
const DEFAULT_LANGUAGE = 'English';

// Header values are normally 2-char codes. Cap the slice so an
// attacker can't smuggle a megabyte header into our Map lookup.
const MAX_LANG_CODE_LENGTH = 8;

// Hard cap on the serialised financeContext block we accept from
// the client. At 50 KB we drop the block, log a warning, and still
// serve the chat reply without context — fail-open for UX, fail-closed
// for the Anthropic bill (oversized prompts balloon token usage).
const MAX_FINANCE_CONTEXT_BYTES = 50_000;

// Hard caps on conversation history from client. 20 messages covers
// any realistic multi-turn window; 30 KB blocks accidental/malicious
// payloads without clipping normal conversations (~1.5 KB per message
// on average). MAX_HISTORY_MESSAGE_LENGTH mirrors MAX_MESSAGE_LENGTH
// so prior turns can't smuggle prompts longer than the current-turn cap.
const MAX_HISTORY_MESSAGES       = 20;
const MAX_HISTORY_BYTES          = 30_000;
const MAX_HISTORY_MESSAGE_LENGTH = 2000;

// ============================================================
// System prompt template — allocated once at module load. The
// {LANGUAGE} placeholder is filled per-request from the
// X-Language header (see resolveLanguage below).
// ============================================================
const SYSTEM_PROMPT_TEMPLATE = `You are BeSafe Assistant — a friendly, privacy-first personal finance helper built into the BeSafe app.

Your scope:
- Personal budgeting, saving strategies, and expense tracking
- Explaining financial concepts clearly (interest, compound growth, tax basics, etc.)
- Helping users understand their own financial situation and make informed decisions
- Practical money habits for everyday life, families, and small businesses

User data:
- When a <user_finance_context> block is present in this prompt, it contains the user's real financial snapshot (current month totals, top categories, recent transactions). Use it to give personalized, data-driven answers — reference specific amounts and categories when relevant. If the block is empty, missing, or the numbers are all zero, acknowledge the user hasn't added transactions yet and gently suggest they start tracking.

Your personality:
- Warm, calm, and practical — not preachy or alarmist
- Concrete and action-oriented (give examples with real numbers when helpful)
- Privacy-respecting: you never ask for account numbers, passwords, card details, or government IDs
- Honest about limits: if a question requires professional legal/tax/investment advice, say so and recommend a qualified advisor

Hard rules:
- You do NOT help with: software development, programming, code writing, general IT support, legal document drafting, medical advice, or any topic outside personal finance. If asked, briefly and politely redirect: "I'm BeSafe's finance assistant, so I can only help with money-related questions. For {topic}, please use a dedicated tool or professional."
- You do NOT make specific investment recommendations (no "buy X stock"). You can explain concepts (diversification, index funds, risk levels) in general terms.
- You do NOT give tax or legal advice as if from a licensed professional. You can explain general principles.

Language:
- Respond in the same language the user writes in
- If unclear, default to {LANGUAGE}
- Keep responses concise by default (3-8 sentences). Expand with lists and headings only when the user explicitly asks for detail or when a structured breakdown genuinely helps.

Formatting:
- Use markdown: **bold** for emphasis, bullet lists for enumerations, ## for headings only when the answer is long
- Currency: use the € symbol by default unless the user writes in another currency
- Numbers: use the user's locale conventions when obvious (1 000,50 € for most EU; $1,000.50 for US English)`;

// ============================================================
// Tool calling — Phase 3 step 2/6.
//
// Schemas live in server/ai/tools.js (single source of truth, served
// from backend so frontend can't spoof). We pass the full list to
// every Anthropic call; Claude decides which tools (if any) to invoke
// based on the user's message. The decision flow remains 100% in
// Anthropic's hands — server/handler are dumb routers.
// ============================================================
import { tools as TOOLS } from './ai/tools.js';

// Extracts the full language name from the X-Language header.
// Missing / unknown / non-string values all resolve to English so
// the template always substitutes into something sensible.
function resolveLanguage(req) {
  const raw = req?.headers?.['x-language'];
  if (typeof raw !== 'string' || raw.length === 0) return DEFAULT_LANGUAGE;
  const code = raw.slice(0, MAX_LANG_CODE_LENGTH).toLowerCase();
  return LANG_NAMES[code] || DEFAULT_LANGUAGE;
}

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

    // Resolve the user's language BEFORE the Anthropic call so we can
    // build the system prompt with the correct fallback. Resolution is
    // O(1) — single header read + Map lookup.
    const language    = resolveLanguage(req);
    const basePrompt  = SYSTEM_PROMPT_TEMPLATE.replace('{LANGUAGE}', language);

    // Optional <user_finance_context> block — only injected when the
    // client sent a sane, bounded object. Placed BEFORE the base
    // prompt so the rules/guardrails remain the last thing Claude
    // reads (models weight the tail of the system message higher).
    let financeContextBlock = '';
    const rawContext = req?.body?.financeContext;
    if (rawContext && typeof rawContext === 'object' && !Array.isArray(rawContext)) {
      try {
        const serialized = JSON.stringify(rawContext, null, 2);
        if (serialized.length > MAX_FINANCE_CONTEXT_BYTES) {
          console.warn(
            '[chatHandler] financeContext too large (' +
            serialized.length + ' chars); dropping'
          );
        } else {
          financeContextBlock =
            '<user_finance_context>\n' +
            'Šis vartotojo finansinis snapshot\'as (EUR). Naudok šį kontekstą asmeniškiems atsakymams:\n\n' +
            serialized + '\n' +
            '</user_finance_context>\n\n';
        }
      } catch (err) {
        console.warn('[chatHandler] financeContext serialize failed:', err?.message);
      }
    }

    const systemPrompt = financeContextBlock + basePrompt;

    // Validate and sanitise conversation history from client. Multi-stage
    // guard mirrors the financeContext pattern: size cap first, then
    // count cap, then per-entry shape validation. Failing any size/count
    // gate drops the whole history (fail-open for the current turn);
    // failing per-entry validation drops just that entry.
    const rawHistory = req?.body?.history;
    let sanitizedHistory = [];

    if (Array.isArray(rawHistory) && rawHistory.length > 0) {
      try {
        const serialized = JSON.stringify(rawHistory);
        if (serialized.length > MAX_HISTORY_BYTES) {
          console.warn(
            '[chatHandler] history too large (' + serialized.length +
            ' chars); dropping'
          );
        } else if (rawHistory.length > MAX_HISTORY_MESSAGES) {
          console.warn(
            '[chatHandler] history too many messages (' + rawHistory.length +
            '); dropping'
          );
        } else {
          sanitizedHistory = rawHistory
            .filter((msg) =>
              msg &&
              typeof msg === 'object' &&
              (msg.role === 'user' || msg.role === 'assistant') &&
              typeof msg.content === 'string' &&
              msg.content.length > 0 &&
              msg.content.length <= MAX_HISTORY_MESSAGE_LENGTH
            )
            .map((msg) => ({ role: msg.role, content: msg.content }));
        }
      } catch (err) {
        console.warn('[chatHandler] history validation failed:', err?.message);
        sanitizedHistory = [];
      }
    }

    // Build Anthropic messages array: prior turns first, current turn last.
    const messages = [
      ...sanitizedHistory,
      { role: 'user', content: message },
    ];

    try {
      const response = await anthropic.messages.create(
        {
          model:      MODEL,
          max_tokens: MAX_OUTPUT_TOKENS,
          system:     systemPrompt,
          messages,
          tools:      TOOLS,
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

      // Claude can return three block types: `text` (regular reply),
      // `thinking` (reasoning models — ignored by us), and `tool_use`
      // (action requests). We split text vs tool_use so the client
      // gets a clean string reply AND a structured action list.
      //
      // Text blocks are joined with newlines: most replies have one
      // text block, but Anthropic explicitly allows multi-block
      // responses (e.g. text-then-tool_use-then-text). Defensive
      // fallback to empty string if no text block at all — sending ""
      // is better than 500.
      const contentBlocks  = response.content ?? [];
      const textBlocks     = contentBlocks.filter((b) => b.type === 'text');
      const toolUseBlocks  = contentBlocks.filter((b) => b.type === 'tool_use');

      const replyText = textBlocks.map((b) => b.text).join('\n');

      // Map each tool_use block into a frontend-shaped action. The
      // `requiresConfirmation` flag is looked up from our own schema
      // (not Claude's input) — Claude has no concept of "confirm
      // first", that's our security model. Unknown tool name (Claude
      // hallucinated a call) defaults to `true` so unauthorized
      // server-side mutations stay impossible. ToolExecutor (step 3/6)
      // will reject the call with an explicit error.
      const toolCalls = toolUseBlocks.map((b) => {
        const schemaEntry = TOOLS.find((t) => t.name === b.name);
        return {
          id:                   b.id,
          name:                 b.name,
          input:                b.input,
          requiresConfirmation: schemaEntry?.requiresConfirmation ?? true,
        };
      });

      // Dev observability — log tool_use occurrences (count + names
      // only, no args) so we can trace Claude's tool decisions in
      // production logs without leaking user data. Skipped on pure
      // text replies to keep happy-path logs quiet.
      if (toolCalls.length > 0) {
        console.log(
          '[chatHandler] tool_use:',
          toolCalls.length,
          'tools:',
          toolCalls.map((t) => t.name).join(', '),
          'stop_reason:',
          response.stop_reason
        );
      }

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

      // Fire-and-forget quota increment — user already has their
      // reply; a transient RPC failure is only a monitoring concern
      // and must not delay or block the response. Wrapped in
      // try/catch so a synchronous throw (e.g. rpc method missing on
      // a stub or misconfigured client) never bubbles into the outer
      // try/catch and mis-classifies a success as an error response.
      try {
        supabase.rpc('increment_ai_daily_usage', {
          p_license_id: req.license.id,
          p_tokens_in:  response.usage?.input_tokens  ?? 0,
          p_tokens_out: response.usage?.output_tokens ?? 0,
        }).then((result) => {
          if (result?.error) {
            console.warn('[chatHandler] quota RPC error:', result.error.message);
          }
        }).catch((err) => {
          console.warn('[chatHandler] quota RPC threw:', err?.message);
        });
      } catch (err) {
        console.warn('[chatHandler] quota RPC invocation failed:', err?.message);
      }

      return res.json({
        response:    replyText,
        tokens_used: tokensUsed,
        model:       MODEL,
        elapsed_ms,
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
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
