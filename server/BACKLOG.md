# BeSafe Server — Backlog

## Infrastructure improvements

### [ ] Set Express trust proxy for Render deployment

**Priority:** Medium
**Effort:** Low (1 line)
**Impact:** All endpoints get correct client IP via req.ip

**Problem:**
`besafe-server.js` does not call `app.set('trust proxy', ...)`.
When deployed behind Render's reverse proxy, `req.ip` returns
the load balancer IP, not the client IP. Workarounds exist in
middleware (authLicense parses `X-Forwarded-For` manually) but
ideally all endpoints should have access to `req.ip` = real
client IP.

**Solution:**
Add near the top of besafe-server.js, after `app = express()`:

```javascript
// Render puts our app behind a reverse proxy. Setting trust
// proxy to 1 means "trust exactly one hop" — the Render proxy.
app.set('trust proxy', 1);
```

**Why separate sprint:**
- Affects ALL endpoints, not just AI
- Needs testing with actual Render deployment
- Risk of mis-parsing X-Forwarded-For if already manually handled
- Should be done as standalone infrastructure PR

**Related:**
- `server/middleware/authLicense.js` has a TODO(infra) comment referencing
  this backlog item (see Step 8 + writeAuditFailure helper in that file).
- `server/middleware/rateLimit.js` mirrors the same XFF parsing.
- After this lands, both middlewares can be simplified to use `req.ip`
  directly instead of the manual XFF parse — but that refactor is also
  deferred to the same sprint for test isolation.

### [ ] /api/verify-license trial expiry silently broken — trial_ends_at column missing

**Priority:** Medium
**Effort:** Low (add column OR remove logic)
**Impact:** Trial licenses never expire via /api/verify-license

**Problem:**
`/api/verify-license` ([besafe-server.js:556-637](server/besafe-server.js#L556-L637))
reads `license.trial_ends_at` to detect expired trials and transition
them to `read_only` / `expired`. The `licenses` table in the current
Supabase schema does NOT have a `trial_ends_at` column
(confirmed via `information_schema.columns` query 2026-04-22).

Because `.select("*")` silently returns `undefined` for missing
columns, `license.trial_ends_at` is `undefined` and the branch
`if (license.status === "trial" && license.trial_ends_at)` is
never true — trials keep responding as `active` forever.

Discovered while fixing a related bug in `authLicense.js` where
`.select('... trial_ends_at')` produced a PostgREST error that
mis-surfaced as `license_not_found` (fixed: column removed from
SELECT list in that middleware).

**Solution (pick one):**
1. Add `trial_ends_at timestamptz` column to `licenses` via migration,
   and backfill existing trial rows from `users.trial_ends_at`.
2. Delete the trial-expiry branch from `/api/verify-license` and rely
   on `/api/check-trials` cron + `users.trial_ends_at` for status
   transitions.

**Why separate sprint:**
- Schema migration needs coordination with `/api/check-trials` cron
- Decision between "add column" vs "delete dead code" is a product call
- Live trial licenses are not impacted in a user-visible way today
  (they show as active, which is the intended pre-expiry behavior)

## Security follow-ups

### [ ] Rate-limit /api/webhook if Stripe-signature brute force attempts appear

**Priority:** Low — Stripe signature verification already rejects
invalid requests quickly, and the webhook endpoint is not user-facing.

If `ai_audit_log` ever records repeated webhook-related errors from a
single IP, wrap the `/api/webhook` endpoint with
`createRateLimit({ keyExtractor: keyByIp, ... })`. Keep the raw-body
middleware chain ordering intact — rate limiter must run AFTER
`express.raw(...)` so Stripe signature verification still sees the
untouched body.
