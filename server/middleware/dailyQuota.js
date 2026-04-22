// ============================================================
// dailyQuota — Express middleware enforcing per-plan daily chat limits
// ============================================================
//
// Reads today's row from ai_daily_usage, compares `messages` to the
// plan limit, and either rejects with 429 or passes through with
// `req.quotaInfo` attached for downstream handlers / UI.
//
// IMPORTANT: this middleware does NOT increment the counter.
// Increment is fired by chatHandler AFTER a successful Anthropic
// response so network errors / Anthropic 5xx don't consume quota
// for the user. See the RPC call in chatHandler.js.
//
// Chain order — MUST sit between authLicense and chatRateLimit:
//
//   app.post('/api/chat',
//     authLicense,     // 1. populates req.license (id, plan, ...)
//     dailyQuota,      // 2. this module — reads today's usage
//     chatRateLimit,   // 3. 20/min/license_key burst guard
//     chatHandler,     // 4. Anthropic + RPC increment
//   );
//
// Factory pattern (mirrors authLicense, rateLimit, chatHandler):
//   1. no import from besafe-server.js (no circular deps)
//   2. trivially unit-testable (inject stubs)
//
// Resilience:
//   - Fail-open on DB errors (warn + next()). Rationale: a transient
//     Supabase glitch must not lock a paying user out of the
//     assistant. chatRateLimit still enforces burst protection even
//     when this quota check falls open.
//   - Fail-through when req.license is missing (silent next()).
//     chatHandler owns the defensive 500 `server_misconfigured` for
//     that case; we don't double-handle it here.
//   - Unknown plan → falls back to the personal limit. Safer than
//     refusing outright (existing users whose plan column ever drifts
//     should keep working).
//
// Timezone: quota windows align with DB `CURRENT_DATE` in UTC.
// Supabase default server TZ is UTC, so `new Date().toISOString()
// .slice(0, 10)` matches the DB view of "today".
//
// Response contract:
//   200 passthrough → req.quotaInfo = { used, limit, remaining }
//   429 rejection   → { error: 'daily_limit_reached', limit, used,
//                       resets_at: <ISO midnight UTC> }
//                     + Retry-After: <seconds until midnight UTC>

const DEFAULT_LIMITS = Object.freeze({ personal: 50, business: 100 });
const DEFAULT_TIMEZONE = 'UTC';              // reserved for future TZ-aware logic
const FALLBACK_PLAN_KEY = 'personal';        // unknown plan → personal cap

export function createDailyQuota(supabase, options = {}) {
  if (!supabase || typeof supabase.from !== 'function') {
    throw new Error('[dailyQuota] supabase client with .from() is required');
  }

  const limits = Object.freeze({
    ...DEFAULT_LIMITS,
    ...(options.limits && typeof options.limits === 'object' ? options.limits : {}),
  });
  const timezone = options.timezone || DEFAULT_TIMEZONE;

  const middleware = async (req, res, next) => {
    // Defensive pass-through: chatHandler owns the 500 for this case.
    if (!req.license || typeof req.license.id !== 'string') {
      return next();
    }

    const plan  = typeof req.license.plan === 'string' ? req.license.plan : '';
    const limit = (limits[plan] !== undefined ? limits[plan] : limits[FALLBACK_PLAN_KEY]);

    // YYYY-MM-DD in UTC — matches DB CURRENT_DATE when server TZ is UTC.
    const today = new Date().toISOString().slice(0, 10);

    let used = 0;
    try {
      const { data, error } = await supabase
        .from('ai_daily_usage')
        .select('messages')
        .eq('license_id', req.license.id)
        .eq('usage_date', today)
        .maybeSingle();
      if (error) {
        console.warn('[dailyQuota] usage lookup error:', error.message);
        return next();
      }
      used = Number(data?.messages ?? 0);
    } catch (err) {
      console.warn('[dailyQuota] usage lookup threw:', err?.message);
      return next();
    }

    if (used >= limit) {
      // Compute seconds until next midnight UTC for Retry-After.
      const now = new Date();
      const nextMidnight = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0, 0, 0, 0,
      ));
      const retryAfterSec = Math.max(
        1,
        Math.ceil((nextMidnight.getTime() - now.getTime()) / 1000),
      );

      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error:     'daily_limit_reached',
        limit,
        used,
        resets_at: nextMidnight.toISOString(),
      });
    }

    req.quotaInfo = Object.freeze({
      used,
      limit,
      remaining: Math.max(0, limit - used),
    });
    return next();
  };

  // Expose for tests — DO NOT use from production code.
  middleware._limits   = limits;
  middleware._timezone = timezone;
  return middleware;
}
