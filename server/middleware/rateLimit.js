// ============================================================
// rateLimit — Express middleware for BeSafe's rate limiting
//             + multi-device observability detector
// ============================================================
//
// Two factories are exported from this module:
//
//   createRateLimit({...})
//     Per-endpoint rate limiter. Fixed window counter keyed by
//     whatever the caller's keyExtractor returns (license_key,
//     IP, body field, etc.). On limit hit, returns 429 with
//     Retry-After + X-RateLimit-* headers and writes an
//     ai_audit_log row (status='rate_limited'). On successful
//     requests, still sets X-RateLimit-* headers for clients
//     that want to self-throttle.
//
//   createMultiDeviceDetector({...})
//     Pure observability — does NOT enforce. Watches for a
//     single license_key presenting 3+ distinct device
//     fingerprints within the configured window and writes
//     one ai_audit_log row (status='suspicious') per NEW
//     fingerprint after the threshold is crossed. Never
//     blocks downstream handlers.
//
// Factory pattern — both accept the supabase client so this
// module:
//   1. doesn't import from besafe-server.js (no circular deps)
//   2. is trivially unit-testable (inject a stub)
//
// Security posture:
//   - Fail-closed on misconfiguration: factory throws at boot
//   - Fail-open on runtime errors: audit log failure is swallowed
//   - Bounded memory: lazy cleanup + hard cap (see MAX_STATE_SIZE)
//   - Input truncation: keys capped at MAX_KEY_LENGTH before use
//   - Format validation: license-key extractors reject non-BSAFE
//     values before they occupy rate-limit slots (FIX #3)
//   - Non-blocking audit: fire-and-forget to keep 429 response
//     latency deterministic (FIX #1, below)
//   - Log throttling: cap-exceeded warnings throttled to 1/min
//     per instance to prevent log flooding during memory-
//     exhaustion attacks (FIX #5)
//   - 429 responses carry Retry-After so clients self-throttle
//
// IMPORTANT — schema dependency:
//   createMultiDeviceDetector writes `status = 'suspicious'`.
//   Migration 002 (`20260421130000_audit_status_suspicious.sql`)
//   MUST be applied in Supabase before this middleware sees any
//   traffic that would trigger a suspicious event. Otherwise the
//   insert will fail the CHECK constraint and be swallowed by the
//   audit try/catch — no user impact, but forensic data is lost.
//
// Memory cleanup — lazy eviction on access:
//   We intentionally avoid setInterval / setTimeout sweepers so
//   that idle servers do zero work, tests have no timer leaks,
//   and cleanup cost scales with actual traffic. Each request
//   evicts up to CLEANUP_BATCH_SIZE stale entries from the Map.
//   For the MVP traffic envelope (<100 req/sec, <10k active
//   keys) this is amortized O(1) per request with guaranteed
//   forward progress — Map iteration is insertion-ordered, so
//   successive requests sweep different slices.
//
// TODO(redis): when BeSafe scales to >1 instance behind the
//              Render load balancer, per-instance Maps will
//              diverge and the effective limit becomes N×. Swap
//              in a Redis-backed store with INCR + EXPIRE; the
//              public factory API can stay the same.
//
// TODO(alerting): detectSuspiciousActivity() hook inside
//                 createMultiDeviceDetector currently just logs
//                 the forensic row. When notification plumbing
//                 exists (email / Slack / webhook) wire it here.

// ============================================================
// Constants
// ============================================================

// Upper bound on any Map key we store — defensive cap in case
// a client sends oversized headers or body fields.
const MAX_KEY_LENGTH = 256;

// FIX #2: MUST match authLicense.js — keep in sync.
// Centralizing to a shared constants module is a future refactor;
// for MVP the two modules agree on 256.
const MAX_FINGERPRINT_LENGTH = 256;

// How many stale Map entries we evict per request. Bounded so the
// per-request cost stays amortized O(1). Successive requests drain
// the rest.
const CLEANUP_BATCH_SIZE = 10;

// FIX #4: hard cap on per-middleware state size — defence-in-depth
// against memory-exhaustion attacks where an attacker spawns unique
// keys faster than lazy cleanup can evict them. Beyond this cap the
// middleware passes new keys through (see fresh-window branch
// below); the IP-keyed limiter chained on /api/verify-license
// catches abuse earlier, so this bulkhead just prevents OOM.
// 100k entries × ~150 B = ~15 MB worst case — fits Render Free Tier.
const MAX_STATE_SIZE = 100_000;

// Multi-device detector defaults
const DEFAULT_DETECTOR_THRESHOLD = 3;
const DEFAULT_DETECTOR_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// FIX #3: identical regex to authLicense.js LICENSE_KEY_REGEX.
// Validating in extractors prevents a client sending "AAAA" or
// "' OR 1=1 --" from occupying a rate-limit slot — the downstream
// handler would reject it anyway, but we'd still be counting towards
// the limit, which legitimate users on the same IP would then hit.
const LICENSE_KEY_REGEX = /^BSAFE-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

// ============================================================
// Key extractors — pure functions, (req) → string | null
//
// Return null when the relevant field is absent OR malformed.
// The rateLimit middleware treats null as "skip this request"
// (pass through), so callers can compose extractors (see
// keyByLicenseBodyOrIp) or chain multiple middleware instances
// for defence-in-depth (IP + license_key for /api/verify-license).
// ============================================================

// Reads X-License-Key from headers. Intended for endpoints behind
// authLicense (which already validated + normalized the key, but
// we re-validate here to keep the extractor self-contained).
export function keyByLicenseHeader(req) {
  const v = req?.headers?.['x-license-key'];
  if (typeof v !== 'string' || v.length === 0) return null;
  const normalized = v.slice(0, MAX_KEY_LENGTH).toUpperCase();
  // FIX #3: reject malformed keys at extractor level — they won't
  // reach a valid DB row anyway, so counting them wastes a slot.
  return LICENSE_KEY_REGEX.test(normalized) ? normalized : null;
}

// Reads req.body.license_key. Intended for /api/verify-license
// where the client posts credentials in the body.
// REQUIREMENT: express.json() must have run before this middleware.
export function keyByLicenseBody(req) {
  const v = req?.body?.license_key;
  if (typeof v !== 'string' || v.length === 0) return null;
  const normalized = v.slice(0, MAX_KEY_LENGTH).toUpperCase();
  // FIX #3: reject malformed keys at extractor level (same reason).
  return LICENSE_KEY_REGEX.test(normalized) ? normalized : null;
}

// Extracts the real client IP. Mirrors authLicense's XFF-first
// logic until TODO(infra) (trust proxy) lands — see BACKLOG.md.
export function keyByIp(req) {
  const xff = req?.headers?.['x-forwarded-for'];
  if (typeof xff === 'string') {
    const first = xff.split(',')[0].trim();
    if (first) return first.slice(0, MAX_KEY_LENGTH);
  }
  if (typeof req?.ip === 'string' && req.ip.length > 0) {
    return req.ip.slice(0, MAX_KEY_LENGTH);
  }
  return null;
}

// Composite — body first, IP fallback. Used for /api/verify-license
// so that botnets rotating IPs with unique body.license_key values
// still get caught by the IP limit when body-key enumeration leaves
// the body-keyed limiter unchallenged.
export function keyByLicenseBodyOrIp(req) {
  return keyByLicenseBody(req) ?? keyByIp(req);
}

// ============================================================
// createRateLimit — fixed-window counter middleware factory
// ============================================================
//
// options (all required):
//   limit         — max requests allowed per window
//   windowMs      — window duration in milliseconds
//   keyExtractor  — function (req) → string | null
//   action        — audit log `action` field on 429
//                   (e.g. 'rate_limit_chat', 'rate_limit_verify_key')
//   supabase      — supabase client (for audit writes)
//
// Returns an async Express middleware.

export function createRateLimit(options = {}) {
  const { limit, windowMs, keyExtractor, action, supabase } = options;

  // Fail-fast validation at server boot, not at request time.
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 1) {
    throw new Error('[rateLimit] limit must be a positive number');
  }
  if (typeof windowMs !== 'number' || !Number.isFinite(windowMs) || windowMs < 1) {
    throw new Error('[rateLimit] windowMs must be a positive number');
  }
  if (typeof keyExtractor !== 'function') {
    throw new Error('[rateLimit] keyExtractor must be a function');
  }
  if (typeof action !== 'string' || action.length === 0) {
    throw new Error('[rateLimit] action must be a non-empty string');
  }
  if (!supabase || typeof supabase.from !== 'function') {
    throw new Error('[rateLimit] supabase client with .from() is required');
  }

  // FIX #5: throttle bulkhead warnings to prevent log flooding during
  // memory-exhaustion attacks. Per-instance (not module-level) so each
  // rate limiter has its own throttle window — otherwise a busy /api/chat
  // limiter would silence legitimate /api/verify-license warnings.
  const WARN_THROTTLE_MS = 60_000;
  let lastCapWarnAt = 0;

  // Per-key state: Map<string, { count: number, windowStart: number }>
  // TODO(redis): externalize when multi-instance (see header).
  const state = new Map();

  const middleware = async (req, res, next) => {
    const now = Date.now();

    // Lazy cleanup — amortize eviction across requests. O(1)
    // amortized per request; details in header comment.
    sweepStaleEntries(state, now, windowMs);

    const rawKey = keyExtractor(req);

    // Extractor couldn't derive a key (absent or malformed — FIX #3).
    // Pass through. The endpoint is responsible for rejecting the
    // request if a key is required (e.g. /api/verify-license returns
    // 400 on missing body field).
    if (rawKey === null || rawKey === undefined) {
      return next();
    }

    const key = String(rawKey).slice(0, MAX_KEY_LENGTH);

    let entry = state.get(key);

    if (!entry || now - entry.windowStart >= windowMs) {
      // Fresh window — first request for this key, or previous window
      // expired. Reset counter and attach informational headers.

      // FIX #4: bulkhead — if the Map is at its hard cap AND this is
      // a brand-new key, pass through without allocating a slot.
      // `!state.has(key)` is true both when the entry was never set
      // AND when sweepStaleEntries above just evicted it (both safe
      // to skip). An IP-keyed limiter chained on the endpoint still
      // catches abuse — this just prevents OOM in pathological cases.
      if (!state.has(key) && state.size >= MAX_STATE_SIZE) {
        // FIX #5: throttled warning — at most once per WARN_THROTTLE_MS
        // per instance. During an attack we still log the first hit
        // immediately (forensic value) and then one follow-up per minute
        // so ops can confirm the pattern without drowning stdout.
        if (now - lastCapWarnAt >= WARN_THROTTLE_MS) {
          console.warn(
            `[rateLimit] state at MAX_STATE_SIZE (${MAX_STATE_SIZE}); ` +
            `passing through new keys. Investigate traffic pattern.`
          );
          lastCapWarnAt = now;
        }
        return next();
      }

      entry = { count: 1, windowStart: now };
      state.set(key, entry);
      setRateLimitHeaders(res, limit, limit - 1, entry.windowStart + windowMs);
      return next();
    }

    entry.count++;

    if (entry.count > limit) {
      // Limit hit — compute Retry-After and reject.
      const retryAfterMs  = entry.windowStart + windowMs - now;
      const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));

      setRateLimitHeaders(res, limit, 0, entry.windowStart + windowMs);
      res.set('Retry-After', String(retryAfterSec));

      // FIX #1: fire-and-forget — audit write must NEVER block the
      // 429 response latency. Any insert error is logged inside
      // writeAuditEvent and then swallowed via .catch(() => {}).
      writeAuditEvent(supabase, {
        req,
        license_id:    req?.license?.id ?? null,
        license_key:   req?.license?.license_key ?? key,
        action,
        status:        'rate_limited',
        error_message: `limit_exceeded_${limit}_per_${windowMs}ms`,
      }).catch(() => {});

      return res.status(429).json({
        error:               'rate_limited',
        retry_after_seconds: retryAfterSec,
      });
    }

    // Within limit — attach remaining-quota headers and continue.
    setRateLimitHeaders(res, limit, Math.max(0, limit - entry.count), entry.windowStart + windowMs);
    return next();
  };

  // Expose internal state for tests — DO NOT use from production code.
  // Underscore prefix signals "private, testing only" per common
  // Node.js convention.
  middleware._state = state;
  return middleware;
}

// ============================================================
// createMultiDeviceDetector — observability, NOT enforcement
// ============================================================
//
// options:
//   threshold  — distinct fingerprints required to trigger an
//                audit row (default 3)
//   windowMs   — rolling window for distinct-fingerprint count
//                (default 3_600_000 = 1h)
//   supabase   — supabase client (required; writes audit rows)
//
// Chain order must be AFTER authLicense so req.license and
// req.deviceFingerprint are populated. If either is missing, the
// middleware silently passes through — this makes it safe to attach
// to all authenticated endpoints without worrying about noise.
//
// Writes one ai_audit_log row per NEW fingerprint after the
// threshold has been crossed (i.e. FPs 3, 4, 5, ... each log; FPs
// 1, 2 and re-seen FPs do not).

export function createMultiDeviceDetector(options = {}) {
  const {
    threshold = DEFAULT_DETECTOR_THRESHOLD,
    windowMs  = DEFAULT_DETECTOR_WINDOW_MS,
    supabase,
  } = options;

  if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold < 2) {
    throw new Error('[multiDeviceDetector] threshold must be a number >= 2');
  }
  if (typeof windowMs !== 'number' || !Number.isFinite(windowMs) || windowMs < 1) {
    throw new Error('[multiDeviceDetector] windowMs must be a positive number');
  }
  if (!supabase || typeof supabase.from !== 'function') {
    throw new Error('[multiDeviceDetector] supabase client with .from() is required');
  }

  // state: Map<license_key, Map<fingerprint, last_seen_timestamp>>
  // Outer Map is per-license; inner Map is per-fingerprint under that
  // license. Both keyed by strings, both keys cap-truncated.
  const state = new Map();

  const middleware = async (req, res, next) => {
    const now = Date.now();

    // Prefer populated state from upstream authLicense; fall back to
    // raw headers so the detector also works if wired to endpoints
    // that don't run authLicense (rare, but possible).
    const licenseKeyRaw  = req?.license?.license_key ?? req?.headers?.['x-license-key'];
    const fingerprintRaw = req?.deviceFingerprint     ?? req?.headers?.['x-device-fingerprint'];

    if (typeof licenseKeyRaw  !== 'string' || licenseKeyRaw.length  === 0) return next();
    if (typeof fingerprintRaw !== 'string' || fingerprintRaw.length === 0) return next();

    const licenseKey  = licenseKeyRaw.slice(0, MAX_KEY_LENGTH).toUpperCase();
    const fingerprint = fingerprintRaw.slice(0, MAX_FINGERPRINT_LENGTH);

    let inner = state.get(licenseKey);
    if (!inner) {
      inner = new Map();
      state.set(licenseKey, inner);
    }

    // Lazy eviction on access — drop fingerprints older than windowMs
    // from THIS license's inner Map. Bounded by inner.size, which is
    // naturally small (typically 1-3). See module header for strategy.
    for (const [fp, ts] of inner) {
      if (now - ts >= windowMs) inner.delete(fp);
    }

    const isNewFingerprint = !inner.has(fingerprint);
    inner.set(fingerprint, now); // touch (or add) the fingerprint timestamp

    if (isNewFingerprint && inner.size >= threshold) {
      // Threshold crossed — write forensic audit row.
      // REQUIRES migration 002 (status enum includes 'suspicious').
      //
      // FIX #1: fire-and-forget — observability must never delay
      // the real request. If the CHECK constraint rejects the insert
      // (migration 002 not yet applied) the error is swallowed in
      // writeAuditEvent; no user-facing impact.
      writeAuditEvent(supabase, {
        req,
        license_id:    req?.license?.id ?? null,
        license_key:   req?.license?.license_key ?? licenseKey,
        action:        'suspicious_multi_device',
        status:        'suspicious',
        error_message: `fingerprint_count_${inner.size}_in_${windowMs}ms`,
      }).catch(() => {});

      // TODO(alerting): once notification plumbing exists, hook
      //                 detectSuspiciousActivity() here. Include
      //                 license_id, inner.size, and recent FP
      //                 timestamps so ops can investigate.
    }

    return next();
  };

  middleware._state = state;
  return middleware;
}

// ============================================================
// Internal helpers
// ============================================================

// Lazy cleanup for a per-key Map<string, { count, windowStart }>.
// Iterates up to CLEANUP_BATCH_SIZE entries (Map iteration is
// insertion-ordered so consecutive calls sweep different slices)
// and deletes any whose window has already closed.
//
// Why bounded batch instead of full sweep:
//   Full sweep is O(n) where n = active keys. At 10k keys and
//   100 req/sec, that's 1M ops/sec — wasteful on idle keys.
//   Bounded batch keeps per-request cost constant while still
//   guaranteeing that an abandoned key is eventually evicted
//   (within n/BATCH requests worst case).
function sweepStaleEntries(state, now, windowMs) {
  let cleaned = 0;
  for (const [key, entry] of state) {
    if (cleaned >= CLEANUP_BATCH_SIZE) break;
    if (now - entry.windowStart >= windowMs) {
      state.delete(key);
      cleaned++;
    }
  }
}

// Attaches the standard informational headers recommended by the
// IETF draft-ietf-httpapi-ratelimit-headers spec and used by
// GitHub, Stripe, Discord, etc. Clients can read these to
// self-throttle without ever hitting a 429.
//
//   X-RateLimit-Limit      — the configured maximum
//   X-RateLimit-Remaining  — requests left in current window
//   X-RateLimit-Reset      — UNIX seconds when the window closes
function setRateLimitHeaders(res, limit, remaining, resetAt) {
  res.set('X-RateLimit-Limit',     String(limit));
  res.set('X-RateLimit-Remaining', String(remaining));
  res.set('X-RateLimit-Reset',     String(Math.ceil(resetAt / 1000)));
}

// Writes one ai_audit_log row. Wrapped in try/catch so that any
// audit failure (DB down, CHECK violation, transient error) is
// swallowed — the middleware response MUST NEVER depend on audit
// success. Mirrors the writeAuditFailure helper in authLicense.js
// but is parameterized for the broader action+status matrix rate
// limiter and detector produce.
//
// Callers should fire this FIRE-AND-FORGET (FIX #1) — the function
// returns a Promise so `.catch(() => {})` can attach without awaiting,
// keeping response latency independent of Supabase round-trip time.
async function writeAuditEvent(supabase, row) {
  try {
    const rawFp = row.req?.headers?.['x-device-fingerprint'];
    const fingerprint = typeof rawFp === 'string' && rawFp.length > 0
      ? rawFp.slice(0, MAX_FINGERPRINT_LENGTH)
      : null;
    // Same XFF-first IP extraction pattern as authLicense + BACKLOG.md
    // TODO(infra) — remove manual parse once trust proxy is set.
    const xff = row.req?.headers?.['x-forwarded-for'];
    const ip = (typeof xff === 'string' && xff.split(',')[0].trim())
      || row.req?.ip
      || null;
    await supabase.from('ai_audit_log').insert({
      license_id:         row.license_id ?? null,
      license_key:        row.license_key,
      device_fingerprint: fingerprint,
      ip,
      user_agent:         row.req?.headers?.['user-agent'] ?? null,
      action:             row.action,
      conversation_id:    null,
      status:             row.status,
      error_message:      row.error_message ?? null,
      tokens_used:        null,
    });
  } catch (err) {
    // Audit failure MUST NOT break the middleware response.
    console.warn('[rateLimit] audit log write failed:', err?.message);
  }
}
