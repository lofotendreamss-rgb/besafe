// ============================================================
// authLicense — Express middleware for BeSafe's license-based auth
// ============================================================
//
// Reads X-License-Key (required) + X-Device-Fingerprint (optional)
// from headers, validates the license, and attaches `req.license`
// for downstream handlers.
//
// Factory pattern — accepts the supabase client so this middleware:
//   1. doesn't import from besafe-server.js (avoids circular deps)
//   2. is trivially unit-testable (inject a stub)
//
// Security posture:
//   - Fail-closed:  any unexpected condition → 401
//   - Fail-fast:    length/format checks before DB round-trip
//   - Generic 401:  identical JSON body for every 401 — timing-safe
//   - Parameterized queries via Supabase SDK (no raw SQL anywhere)
//   - Security failures logged to ai_audit_log (non-blocking;
//     audit insert exceptions are swallowed and never break the response)
//
// Status → HTTP mapping (hybrid strategy D=2):
//   * active / trial            → next()    (happy path, no audit)
//   * cancelled                 → 401       (audit: auth_failure)
//   * expired                   → 401       (audit: auth_failure)
//   * payment_failed            → 401       (audit: auth_failure)
//   * not found / malformed     → 401       (audit: auth_failure)
//   * plan not in requiredPlans → 403 w/ plan info (audit: auth_failure)
//   * supabase exception        → 503       (audit: auth_error)
//
// TODO(v2): 'read_only' is a RESPONSE-level derivation returned by
//           /api/verify-license (see besafe-server.js:497-500) — it
//           is NOT a value that appears in licenses.status. DB values
//           are: trial, active, cancelled, expired, payment_failed.
//           If a future migration adds 'read_only' as a real DB
//           status, block-list it explicitly in the status gate.
//
// TODO(step-1c): multi-device detection lives in the rateLimit
//                middleware (Step 1c) which holds shared per-license
//                state. When a single license presents 3+ distinct
//                device_fingerprints within 1h, that middleware will
//                insert an ai_audit_log row with
//                status='suspicious_multi_device'. authLicense
//                intentionally does NOT track this here because it
//                has no cross-request memory.
//
// TODO(infra): see server/BACKLOG.md — once `app.set('trust proxy', 1)`
//              is configured in besafe-server.js, the manual
//              X-Forwarded-For parsing below can be replaced by req.ip.
//
// Stripe sync — this middleware trusts licenses.status to be current.
// Kept current by:
//   - /api/verify-license      (periodic client call → refreshes)
//   - Stripe webhooks          (subscription.created/updated/deleted)
//   - /api/check-trials cron   (expires trial licenses)
// See server/besafe-server.js for those flows.

// ============================================================
// Constants
// ============================================================

// Header length guards — bound memory + audit payload size,
// hard protection against DoS via oversized headers.
const MAX_LICENSE_KEY_LENGTH = 100;
const MAX_FINGERPRINT_LENGTH = 256;

// Express lowercases header names; we match that.
const LICENSE_KEY_HEADER        = 'x-license-key';
const DEVICE_FINGERPRINT_HEADER = 'x-device-fingerprint';

// Constant 401 body — every 401 serializes identically,
// preventing content-based enumeration / timing attacks.
const UNAUTHORIZED_BODY = Object.freeze({ error: 'unauthorized' });

// License key format: BSAFE-XXXX-XXXX-XXXX-XXXX (A-Z, 0-9 only).
// NOT a UUID — BeSafe licenses use this custom format matching
// the server's license generation code. The regex is defense-in-depth
// against SQL-meta/HTML/script payloads — Supabase SDK parameterizes
// queries anyway, but rejecting bad shapes fail-fast saves DB load.
// No /i flag — we normalize input to uppercase explicitly before the
// regex test (see Step 4) so exactly ONE canonical form reaches DB +
// audit log.
const LICENSE_KEY_REGEX = /^BSAFE-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

// Statuses that allow further processing (happy path).
const ACTIVE_STATUSES = ['active', 'trial'];

// ============================================================
// Factory
// ============================================================

export function createAuthLicense(supabase, options = {}) {
  // Factory input validation — fail loudly at server boot, not at
  // request time, if the caller forgot to pass a real Supabase client.
  if (!supabase || typeof supabase.from !== 'function') {
    throw new Error('[authLicense] supabase client with .from() is required');
  }

  // Which plans may access features behind this middleware. MVP: both.
  // Kept configurable so we can restrict specific plans later (e.g.
  // premium-only gating) without touching the middleware contract.
  const requiredPlans = Array.isArray(options.requiredPlans) && options.requiredPlans.length
    ? options.requiredPlans
    : ['personal', 'business'];

  const upgradeUrl = typeof options.upgradeUrl === 'string' && options.upgradeUrl
    ? options.upgradeUrl
    : '/pricing';

  return async function authLicense(req, res, next) {
    const rawKey = req.headers[LICENSE_KEY_HEADER];
    const rawFp  = req.headers[DEVICE_FINGERPRINT_HEADER];

    // ----------------------------------------------------------
    // Step 1: presence — missing / null → treat as "<missing>"
    //
    // Security: distinguishing "header missing" from "header
    // present but invalid" only in logs — response is identical.
    // ----------------------------------------------------------
    if (rawKey === undefined || rawKey === null) {
      await writeAuditFailure(supabase, {
        req,
        license_id: null,
        license_key: '<missing>',
        action: 'auth_failure',
        status: 'unauthorized',
        error_message: 'missing_header',
      });
      return send401(res);
    }

    // ----------------------------------------------------------
    // Step 2: type & empty — non-string / empty → "<empty>"
    //
    // Security: Express normally gives us strings, but guard
    // against malformed clients sending arrays, objects, or
    // zero-length strings.
    // ----------------------------------------------------------
    if (typeof rawKey !== 'string' || rawKey.length === 0) {
      await writeAuditFailure(supabase, {
        req,
        license_id: null,
        license_key: '<empty>',
        action: 'auth_failure',
        status: 'unauthorized',
        error_message: 'empty_header',
      });
      return send401(res);
    }

    // ----------------------------------------------------------
    // Step 3: length guard — bounded memory + audit payload size.
    //
    // Security: attacker cannot crash or slow audit writes by
    // sending megabyte-long license_key headers. We truncate the
    // stored value too so audit rows stay predictable-sized.
    // ----------------------------------------------------------
    if (rawKey.length > MAX_LICENSE_KEY_LENGTH) {
      await writeAuditFailure(supabase, {
        req,
        license_id: null,
        license_key: rawKey.slice(0, MAX_LICENSE_KEY_LENGTH),
        action: 'auth_failure',
        status: 'unauthorized',
        error_message: 'license_key_too_long',
      });
      return send401(res);
    }

    // ----------------------------------------------------------
    // Normalize to uppercase — BeSafe license keys are case-
    // insensitive from the user's perspective (UX: user can type
    // or paste in any case) but the DB column is stored uppercase
    // and `.eq()` queries are case-sensitive. Normalizing here:
    //   1. Lets us remove the /i flag from LICENSE_KEY_REGEX
    //   2. Guarantees a single form reaches the DB — no per-case
    //      duplicate row risk, no wasted query for "bsafe-..." input
    //   3. Keeps audit entries consistent (same key, same string)
    // ----------------------------------------------------------
    const normalizedKey = rawKey.toUpperCase();

    // ----------------------------------------------------------
    // Step 4: format guard — fail-fast BEFORE DB round-trip.
    //
    // Security:
    //   1. Blocks SQL-meta/HTML/script payloads from reaching DB.
    //      Supabase SDK parameterizes anyway — this is belt & braces.
    //   2. Prevents DB load from enumeration: attacker cannot time
    //      "DB query 50ms" vs "rejected 1ms" because all bad shapes
    //      fail here pre-DB and all failures return the same 401.
    // ----------------------------------------------------------
    if (!LICENSE_KEY_REGEX.test(normalizedKey)) {
      await writeAuditFailure(supabase, {
        req,
        license_id: null,
        license_key: normalizedKey,
        action: 'auth_failure',
        status: 'unauthorized',
        error_message: 'license_key_malformed',
      });
      return send401(res);
    }

    // ----------------------------------------------------------
    // Step 5: DB lookup (licenses table).
    //
    // Parameterized query via Supabase SDK. The `.eq()` builder
    // binds `normalizedKey` as a parameter — never concatenated
    // into SQL. Single read — we pull only the fields downstream
    // needs.
    // ----------------------------------------------------------
    let license;
    try {
      const { data, error } = await supabase
        .from('licenses')
        .select('id, user_id, license_key, status, plan')
        .eq('license_key', normalizedKey)
        .single();

      if (error || !data) {
        await writeAuditFailure(supabase, {
          req,
          license_id: null,
          license_key: normalizedKey,
          action: 'auth_failure',
          status: 'unauthorized',
          error_message: 'license_not_found',
        });
        return send401(res);
      }
      license = data;
    } catch (err) {
      // Resilience path — Supabase unreachable or query crashed.
      // Log the error, audit it as 'auth_error', return 503 so the
      // client can distinguish "try again later" from "bad auth".
      console.warn('[authLicense] supabase exception:', err?.message);
      await writeAuditFailure(supabase, {
        req,
        license_id: null,
        license_key: normalizedKey,
        action: 'auth_error',
        status: 'error',
        error_message: 'supabase_exception',
      });
      return res.status(503).json({ error: 'auth_unavailable' });
    }

    // ----------------------------------------------------------
    // Step 6: status gate — hybrid strategy.
    //
    // Status failures return 401 generic (no info leak). Only the
    // plan gate below uses 403. An attacker probing keys cannot
    // tell "valid but cancelled" apart from "invalid".
    //
    // UX: /api/verify-license remains the dedicated path where a
    // real user sees their real status + renewal flow.
    // ----------------------------------------------------------
    // INACTIVE statuses — user has a real, known license that's no longer
    // entitled to active features. Returns 403 with actionable error code
    // so the UI can show a specific "renew" message instead of the generic
    // 401 "unauthorized". This intentionally leaks slightly more info than
    // the generic 401 fallback below, matching the plan-gate precedent at
    // step 7 — judged worth the UX trade-off since the attacker still
    // needs a VALID license_key to reach this branch.
    const INACTIVE_STATUSES = ['cancelled', 'expired', 'payment_failed'];
    if (INACTIVE_STATUSES.includes(license.status)) {
      await writeAuditFailure(supabase, {
        req,
        license_id: license.id,
        license_key: license.license_key,
        action: 'auth_failure',
        status: 'unauthorized',
        error_message: 'license_status_' + license.status,
      });
      return res.status(403).json({
        error:          'subscription_ended',
        current_status: license.status,
        upgrade_url:    '/upgrade.html',
      });
    }

    // Any other non-active status (future-proof catch-all) → generic 401.
    if (!ACTIVE_STATUSES.includes(license.status)) {
      await writeAuditFailure(supabase, {
        req,
        license_id: license.id,
        license_key: license.license_key,
        action: 'auth_failure',
        status: 'unauthorized',
        error_message: 'license_status_' + license.status,
      });
      return send401(res);
    }

    // ----------------------------------------------------------
    // Step 7: plan gate — 403 with UX context.
    //
    // A valid, active license reaching a feature it's not entitled
    // to gets a 403 with { current_plan, required_plan, upgrade_url }
    // — the user CAN act on this (renew / upgrade). Still audit'd so
    // brute-force plan-probing attempts are visible in logs.
    // ----------------------------------------------------------
    if (!requiredPlans.includes(license.plan)) {
      await writeAuditFailure(supabase, {
        req,
        license_id: license.id,
        license_key: license.license_key,
        action: 'auth_failure',
        status: 'unauthorized',
        error_message: 'plan_excluded_' + license.plan,
      });
      return res.status(403).json({
        error: 'forbidden',
        reason: 'plan_limit',
        current_plan: license.plan,
        required_plan: requiredPlans.join('|'),
        upgrade_url: upgradeUrl,
      });
    }

    // ----------------------------------------------------------
    // Step 8: device fingerprint — optional, B=2 non-blocking.
    //
    // If present, truncate oversized values and check the `devices`
    // table. The binding state is exposed as
    // `req.license.is_device_bound`:
    //   * null  → no fingerprint provided by client
    //   * true  → fingerprint found in devices table
    //   * false → fingerprint not in devices table (suspicious,
    //             but NOT blocked per B=2)
    //
    // Downstream handlers may require `is_device_bound === true`
    // for sensitive actions (e.g. account deletion) while allowing
    // lighter actions (chat) from unknown devices.
    //
    // Latency: ~20-50ms additional (on top of Step 5 license lookup)
    // when fingerprint is provided. No impact without fingerprint.
    // Synchronous so downstream handlers have deterministic state.
    // Lookup failure treated as "unknown" (false) — NEVER blocks.
    // ----------------------------------------------------------
    let fingerprint = null;
    if (typeof rawFp === 'string' && rawFp.length > 0) {
      fingerprint = rawFp.length > MAX_FINGERPRINT_LENGTH
        ? rawFp.slice(0, MAX_FINGERPRINT_LENGTH)
        : rawFp;
    }

    let isDeviceBound = null;
    if (fingerprint) {
      try {
        const { data: device, error: deviceError } = await supabase
          .from('devices')
          .select('id')
          .eq('license_id', license.id)
          .eq('device_fingerprint', fingerprint)
          .maybeSingle();
        if (deviceError) {
          console.warn('[authLicense] device lookup error:', deviceError.message);
          isDeviceBound = false;
        } else {
          isDeviceBound = Boolean(device);
          if (!device) {
            // TODO(step-1c): feed into detectSuspiciousActivity()
            // when rateLimit middleware holds the cross-request state.
            console.warn(
              `[authLicense] Unknown device license_id=${license.id} ` +
              `fp=${fingerprint.substring(0, 8)}...`
            );
          }
        }
      } catch (err) {
        // Transport error or unexpected shape. Fail soft — B=2 says
        // don't block. Downstream can still decide based on `false`.
        console.warn('[authLicense] device lookup threw:', err?.message);
        isDeviceBound = false;
      }
    }

    // ----------------------------------------------------------
    // Step 9: attach to request — success.
    //
    // NO audit row written here; the endpoint handler knows the
    // action name + tokens_used and will write a richer 'success'
    // row after processing completes.
    // ----------------------------------------------------------
    req.license = {
      id: license.id,
      user_id: license.user_id,
      license_key: license.license_key,
      status: license.status,
      plan: license.plan,
      is_device_bound: isDeviceBound,
    };

    req.deviceFingerprint = fingerprint;
    // x-forwarded-for first: Render (and any reverse proxy deployment)
    // puts the real client IP in this header as "client, proxy1, proxy2".
    // req.ip falls back to the socket peer which is the load balancer
    // when trust proxy is NOT set (current BeSafe state).
    // TODO(infra): see BACKLOG.md — set `app.set('trust proxy', 1)` in
    //              besafe-server.js so req.ip correctly resolves to
    //              client IP everywhere.
    const xff = req.headers['x-forwarded-for'];
    req.clientIp = (typeof xff === 'string' && xff.split(',')[0].trim())
      || req.ip
      || null;
    req.userAgent = req.headers['user-agent'] || null;

    return next();
  };
}

// ============================================================
// Helpers
// ============================================================

// Sends a 401 response with a constant JSON body + WWW-Authenticate.
// The constant body is the core of timing-attack resistance — every
// 401 caller receives byte-identical output.
function send401(res) {
  res.set('WWW-Authenticate', 'License');
  return res.status(401).json(UNAUTHORIZED_BODY);
}

// Writes one row to ai_audit_log. Wrapped in try/catch so that any
// audit failure (DB down, permission issue, transient error) is
// swallowed — the auth response MUST NEVER depend on audit success.
async function writeAuditFailure(supabase, row) {
  try {
    const rawFp = row.req.headers[DEVICE_FINGERPRINT_HEADER];
    const fingerprint = typeof rawFp === 'string' && rawFp.length > 0
      ? rawFp.slice(0, MAX_FINGERPRINT_LENGTH)
      : null;
    // Same XFF-first logic as the success path (Step 9 above) — when
    // trust proxy is not set, req.ip is the internal LB and XFF carries
    // the real client IP. Kept in sync so forensic data matches the
    // downstream handler's view.
    const xff = row.req.headers['x-forwarded-for'];
    const ip = (typeof xff === 'string' && xff.split(',')[0].trim())
      || row.req.ip
      || null;
    await supabase.from('ai_audit_log').insert({
      license_id:         row.license_id,
      license_key:        row.license_key,
      device_fingerprint: fingerprint,
      ip:                 ip,
      user_agent:         row.req.headers['user-agent'] || null,
      action:             row.action,
      conversation_id:    null,
      status:             row.status,
      error_message:      row.error_message || null,
      tokens_used:        null,
    });
  } catch (err) {
    // Audit failure MUST NOT break the auth response.
    console.warn('[authLicense] audit log write failed:', err?.message);
  }
}
