# BeSafe Server — Backlog

## ✅ FIXED in b26335a (2026-04-26): Device tracking bug in /api/verify-license

**Original impact:** Personal plan users got locked out of their own license
after just 2 activations, even from the same browser. Bug existed since
initial implementation.

**Fix summary (commit b26335a):**
- `devices` table is now the source of truth — `realUsed` is computed via
  `SELECT count(*) FROM devices WHERE license_id = X`, not via the cached
  `licenses.devices_used` column.
- Fingerprint dedup: on verify, we look up `(license_id, device_fingerprint)`
  in `devices`. If found → only `last_seen_at` is updated, count does NOT
  change. If not found → INSERT new row, then enforce `realUsed >= maxDevices`.
- Same browser/device re-verifying never inflates the counter again.
- `licenses.devices_used` is still updated for backwards compat but is no
  longer authoritative.

**Follow-up (2026-04-28):**
- Restored `MAX_DEVICES` from temp value 10 back to **3** as the new product
  decision (phone + laptop + work computer for Personal plan).
- ✅ EXECUTED 2026-04-28: Variant A SQL rollback applied against Supabase.
  - Dry-run (BEGIN/ROLLBACK): `UPDATE 15`, `personal_still_at_10 = 0`.
  - Live (BEGIN/COMMIT):     `UPDATE 15`, `personal_still_at_10 = 0`.
  - Post-commit verification: `personal_at_10 = 0`, `personal_at_3 = 15`,
    `personal_total = 16` (the 15 rolled-back rows plus 1 that was
    already at devices_max=3 before the workaround).
  - 0 grandfathered licenses (no Personal license had >3 real devices
    registered, so Variant A's safety filter did not exclude anyone).
  - Migration is now fully consistent with commit 850764b
    (server-side `MAX_DEVICES = 3`).

---

## Infrastructure improvements

### [ ] Schema drift: setup-database.sql doesn't reflect live Supabase schema

**Priority:** Medium
**Effort:** Medium (one-off DDL audit + decision on path forward)
**Impact:** New dev environments bootstrapped from `setup-database.sql` will
diverge from production. Code that references column/table names not in the
file appears to "work by magic" because it only works against live Supabase.

**Discovered:** 2026-04-28, while restoring `MAX_DEVICES` to 3 after the
b26335a fix.

**Concrete drifts found:**

1. **`max_devices` vs `devices_max` (column rename).**
   - `setup-database.sql` declares `max_devices INTEGER DEFAULT 3` on the
     `licenses` table.
   - Runtime code in `server/besafe-server.js` reads `license.devices_max`
     (e.g. line ~693 in `/api/verify-license` handler) and writes
     `devices_max` on INSERT (line ~498).
   - Therefore prod schema has a `devices_max` column. The setup file is
     stale on the column name.

2. **`devices` JSONB column vs `devices` table.**
   - `setup-database.sql` declares `devices JSONB DEFAULT '[]'::jsonb`
     on the `licenses` table.
   - The b26335a fix uses `devices` as a **separate table** with columns
     `id`, `license_id` (FK → licenses.id), `device_fingerprint`,
     `device_name`, `first_seen_at`, `last_seen_at`.
   - Therefore prod has a `devices` table, not a JSONB column. Possibly
     both exist (table added later, JSONB never dropped) — needs audit.

3. **No migration file creates the `devices` table.**
   - `supabase/migrations/` contains only AI-assistant, audit-status,
     and ai-daily-usage migrations. Nothing creates `devices` or alters
     `licenses` to add `devices_max`.
   - The schema was likely changed via Supabase Dashboard SQL editor
     ad-hoc, with no checked-in migration. This is the root cause of the
     drift.

**Action (pick one):**

**A. Capture live schema as a migration (recommended).**
   - Use `pg_dump --schema-only` against prod Supabase to capture current
     DDL.
   - Diff against `setup-database.sql`, write a single
     `2026XXXXXX_capture_live_schema.sql` migration that brings a fresh
     DB from "setup-database.sql state" up to "live state".
   - Going forward, all DDL changes go through migrations. No more
     Dashboard ad-hoc SQL.

**B. Demote `setup-database.sql` to "fresh dev only".**
   - Add a banner: "DO NOT use against production — this is the
     pre-migrations bootstrap. Apply migrations after running this file."
   - Update column names (`max_devices` → `devices_max`) and replace
     `devices JSONB` with the proper `devices` table DDL, but make
     clear it's the dev-bootstrap baseline, not authoritative.

**Why separate sprint:**
- Requires DB access and prod-to-file diffing, not just code changes.
- Decision between A and B is a workflow call (do we want migrations
  to be the source of truth going forward, yes or no?).
- Touching schema files invites accidental DDL changes — keep isolated.

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

### [ ] Electron security upgrade (v36 → v41)

**Priority:** High — but defer to dedicated sprint, do not bundle with other work.
**Effort:** Medium (breaking change, needs end-to-end desktop QA)
**Impact:** Closes 18 high-severity Electron advisories surfaced by `npm audit`
on 2026-04-28 (ASAR integrity bypass, several use-after-free issues, AppleScript
injection in `app.moveToApplicationsFolder`, IPC reply spoofing via service
worker, registry key path injection in `app.setAsDefaultProtocolClient`,
HTTP response header injection, and others).

**What to upgrade:**
- `electron`: current `<=39.8.4` → `41.3.0` (breaking; drives the audit fix)
- `npm audit fix --force` will also bump the transitive chain:
  `tar` → 7.5.13, `cacache`, `node-gyp`, `@electron/rebuild`,
  `app-builder-lib`, `dmg-builder`, `electron-builder`,
  `electron-builder-squirrel-windows`, `make-fetch-happen`,
  `http-proxy-agent`, `@tootallnate/once`. These together close the
  remaining 12 audit findings (2 low, 10 high) recorded after the
  2026-04-28 non-breaking `npm audit fix` run.

**Why a separate sprint (do not bundle):**
- Major Electron bumps frequently change preload script sandbox semantics,
  contextIsolation defaults, and `webPreferences` validation. Need to retest
  `electron/preload.js` and every IPC channel.
- Licensing flow runs through Electron (`electron/license.html` +
  main-process IPC). Regression here locks users out of the desktop app —
  exactly the surface we just stabilized in commit b26335a.
- electron-builder major bumps have historically broken signing/notarization
  and the squirrel-windows installer. Need a clean test build on Windows
  before shipping.

**Test checklist before merging:**
- [ ] App launches on Windows (primary target) and macOS if applicable
- [ ] License activation flow: fresh install → enter key → verify → unlock
- [ ] License re-verify on relaunch does NOT trigger `device_limit` (this is
      the regression mode b26335a fixed at the server side; preload/IPC
      changes could re-introduce a client-side equivalent)
- [ ] Preload-exposed APIs in `electron/preload.js` still reachable from
      renderer with contextIsolation enabled
- [ ] `electron-builder` produces a working installer (not just a dev run)
- [ ] Auto-update path (if any) still works against the old installed base

**Files likely to need attention:**
- `electron/main.js` — `webPreferences`, `BrowserWindow` options, IPC handlers
- `electron/preload.js` — `contextBridge` exposures
- `package.json` — `electron`, `electron-builder` versions, build scripts
- `build/` — packaging config

**Recorded:** 2026-04-28 (deferred from same-day audit run).

### [ ] Rate-limit /api/webhook if Stripe-signature brute force attempts appear

**Priority:** Low — Stripe signature verification already rejects
invalid requests quickly, and the webhook endpoint is not user-facing.

If `ai_audit_log` ever records repeated webhook-related errors from a
single IP, wrap the `/api/webhook` endpoint with
`createRateLimit({ keyExtractor: keyByIp, ... })`. Keep the raw-body
middleware chain ordering intact — rate limiter must run AFTER
`express.raw(...)` so Stripe signature verification still sees the
untouched body.
