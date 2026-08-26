# BeSafe — Backlog

Project-wide backlog: things known to be worth doing, and why they were
not done at the time they were found.

Server-internal items (webhooks, middleware, DB schema, the voice
assistant) live in [server/BACKLOG.md](server/BACKLOG.md). Anything that
spans the repo, the desktop build, or the marketing site belongs here.

---

## ✅ Done — 2026-08-26 repo review (PR #3, PR #4)

Context for whoever picks this up next: a full-repo review that started
as "let's look at the project" and turned up one live security hole and
a class of bugs that made the desktop build unusable.

**Billing access control** — `4ca0d04`
`/api/create-portal` had no authentication at all. It took an email
address and returned a working Stripe Customer Portal URL, so anyone who
knew a subscriber's address could open their billing portal, read their
invoices and payment method, and cancel their subscription. There was no
rate limit either. It now emails the link to the address on file, so
mailbox control is the authentication, and every outcome returns a
byte-identical body (the old code leaked customer existence through
`404` vs `400` vs `200`). `authLicense` was deliberately NOT used: it
rejects `cancelled` / `expired` / `payment_failed`, and those are exactly
the people who need the portal — confirmed in practice on 2026-08-26,
when the owner's own card was blocked and the portal was the only way to
fix it.

**Desktop link resolution** — `87cc351`, `477087d`, `ec89b9c`
The Electron app loads `index.html` through `win.loadFile()`, so the page
origin is `file://` and every root-relative URL resolved to
`file:///...`. Dead in the desktop build: `/api/chat`,
`/api/verify-license` (so desktop users could not activate a licence at
all), `/upgrade.html`, `/privacy.html`, `/terms.html`. New
[js/core/api.base.js](js/core/api.base.js) exports `API_BASE`,
`SITE_BASE` and `openSitePage()`. The last one also fixes *behaviour*,
not just resolution — Electron has no `setWindowOpenHandler` and no
`will-navigate` guard, so `_self` would navigate the app window to the
website with no way back and `_blank` would open a second chrome-less
Electron window. Links now go to the OS browser through the existing
preload bridge.

**Cancellation was unfindable** — `ec89b9c`, `a347c24`, `ce3862f`
Implemented, but unreachable: the only in-app route to `upgrade.html`
was the banner that appears *after* a subscription lapses, the marketing
site linked to it from nowhere, and `upgrade.html` had no i18n wiring at
all. Now there is a Subscription section on the Settings page, a footer
link on the site, and `upgrade.html` is translated into all 14 languages
with its own language switcher.

**Repo hygiene** — `0e6bcd8`, `1990de4`, `e603d05`
`.gitignore` covered `.env` but not `.env.txt` / `.env.local` / `*.env`,
and a stale copy holding live Stripe, Supabase and Anthropic credentials
was sitting untracked but committable. 70 MB of tracked electron-builder
artifacts untracked. 7 provably dead frontend modules removed.

Git history was checked and is clean: `server/.env` was in the original
local commit but `filter-branch` stripped it two minutes before the first
push, so the secrets never reached GitHub.

## ✅ Investigated — 2026-08-26: nobody had ever activated a licence

Kept because the numbers below are the baseline any future funnel work
is measured against, and because it took four wrong turns to reach the
right answer. Anyone re-running this should know where the traps are.

**The question:** is anyone actually interested in the app?

**What the database said** (queries in
[server/analytics.sql](server/analytics.sql)):

| | |
|---|---|
| Registered users | 30 |
| — of them tests | 19 (13 from the **FeeHunt** project, 3 `@example.com`, 3 with "test", 1 owner) |
| — genuinely real | **10**, all between 2026-04-13 and 2026-05-07 |
| Real users who activated a licence | **0** |
| Real users who became paying | **0** |
| Trials expired unused | 10 |

**Two causes, both real, both now fixed:**

1. **The key-bearing emails never reached the activation prompt.**
   `license-modal.js` opens the prompt only on `?activate=1`, and every
   "Open BeSafe →" button pointed at a bare `/app`. Register, receive a
   key, click through, and land in an app that never asks for it —
   `checkLicenseStatus()` finds no key, returns "free" without calling
   the server, and the trial is attached to nothing. Fixed in PR #6.

2. **Mail delivery was unreliable before 2026-04-25.** 8 of the 10
   registered while the server still used Gmail SMTP; one of those also
   predates `8389688`, which fixed a broken link in the same email. The
   Resend migration (`22dcfab`) fixed delivery, confirmed on 2026-08-26
   — a fresh registration reached the inbox immediately, not spam.

**Traps that produced wrong answers along the way:**

- `users` is polluted with another project's test registrations. Any
  headline count is meaningless until `email ILIKE '%feehunt%'` and the
  `@example.com` addresses are filtered out. See the open item below.
- `devices.last_seen_at` does NOT mean "opened the app". A device row is
  only written when `/api/verify-license` runs, and that only happens
  when a key is already in localStorage. It measures **activations**,
  not opens. The app tracks nothing otherwise, by design — so whether
  those 10 ever opened it is unknowable, and always will be.
- `users` had 30 rows but `licenses` only 28. Registration inserts the
  user first and the licence second, returning 500 if the second fails
  ([besafe-server.js:532-546](server/besafe-server.js#L532-L546)) — the
  user row survives. Two accounts exist with no licence.

**Still worth doing:**

- Write to those 10 by hand. Their keys are still valid and activation
  now works. It is also the cheapest possible user research — if they
  reply "I never got an email", cause 2 is confirmed outright.
- Check the Resend delivery log for the 2 who registered after
  2026-04-25 and still did not activate. Two is too few to conclude
  anything from, but the log would say plainly whether mail reached them.
- Confirm SPF/DKIM are complete for the domain in Resend.

---

### [ ] FeeHunt test registrations are landing in BeSafe's database

**Priority:** Medium — cosmetic today, potentially destructive
**Effort:** Low to diagnose, unknown to fix
**Impact:** Every BeSafe metric is wrong until this is separated

**Problem:**
13 of the 30 rows in `users` are FeeHunt test registrations —
`feehunt-test-<timestamp>@example.com`,
`feehunt-desktop-e2e-<timestamp>@example.com`, `support@feehunt.pro`.
They hold BeSafe licences and count toward every total.

Three possibilities, none yet ruled out: the two products share one
Supabase project; one project's `.env` points at the other; or FeeHunt's
end-to-end tests were pointed at production.

Today the cost is only distorted numbers. But a test suite that can
INSERT into this database can also UPDATE and DELETE, and BeSafe's rows
sit in the same tables.

**Next step:**
Compare `SUPABASE_URL` in the two projects' `.env` files (not recorded
here — this repository is public). If they match, decide whether to split
the projects apart or at minimum point FeeHunt's tests at a staging
instance. If they differ, the pollution came from somewhere else and the
test rows can simply be deleted.

**Why deferred:**
Diagnosing it means reading another project's configuration, which was
out of scope for the session that found it.

---

## Open

### [ ] Desktop build not exercised since the `file://` fixes

**Priority:** Low while the Electron wrapper stays dormant (see README),
High the moment a desktop release is planned again
**Effort:** Low (one manual run)
**Impact:** Three code paths were fixed blind

**Problem:**
`87cc351`, `477087d` and `ec89b9c` fix chat, licence activation and every
outbound link in the desktop build. All three were verified by unit-level
reasoning and by exercising `resolveApiBase()` / `openSitePage()` against
simulated contexts — not by running the packaged app. Nobody has
confirmed end-to-end that the assistant answers, that the licence modal
activates, or that "Manage subscription" opens the OS browser rather than
navigating the app window.

**Solution:**
`npm start` from the repo root and walk those three paths.

**Why deferred:**
The web app is the primary distribution; the README lists the desktop
wrapper as dormant. Worth doing before any Windows installer ships.

### [ ] `server/node_modules` is tracked — 2771 files

**Priority:** Low
**Effort:** Low (`git rm -r --cached server/node_modules`)
**Impact:** Clone size and diff noise

**Problem:**
2771 files under `server/node_modules/` are in the index. `.gitignore`
covers `node_modules/`, but that rule postdates the files and does not
untrack what is already indexed. Both lock files are tracked, so
`npm ci` can reproduce the tree.

**Why deferred:**
Render's Build Command was never confirmed. If the service has no build
step and relies on the committed `node_modules`, untracking them breaks
the next deploy of a live payments API. Evidence points the other way —
`0553a28` ("add @anthropic-ai/sdk to root package.json for Render
deploy") and `65914bf` ("restore server runtime deps to root
package.json") suggest Render deploys from the repo root and installs —
but "probably fine" is not enough for that endpoint.

**Next step:**
Render dashboard → Settings → Build & Deploy → Build Command. If it runs
`npm install` or `npm ci`, untracking is safe.

### [ ] `npm run server` starts the legacy server

**Priority:** Low
**Effort:** Trivial (one line, plus a decision)
**Impact:** A trap for anyone running the project locally

**Problem:**
Root `package.json` has `"server": "node server/server.js"`, which starts
the **old** 1734-line server. `server/package.json` already calls that
file `start:old` and points `start` at `besafe-server.js`, so the
migration happened — this script and `"main": "server.js"` were just
never updated.

**Solution:**
Point the root script at `besafe-server.js`. Separately decide whether
`server/server.js` still earns its place; it has not been the deployed
server for months.

**Why deferred:**
Deleting a 1734-line server is a product call, not a cleanup.

### [ ] Translations shipped without native review

**Priority:** Medium
**Effort:** Low per language
**Impact:** ~470 user-facing strings across 14 languages

**Problem:**
`a347c24` and `ce3862f` added 29 `up.*` keys and `settings.subscription.*`
across all 14 dictionaries, plus `ft.manage`. They are idiomatic but were
not written or checked by native speakers. `ja`, `zh` and `uk` deserve a
pass first — the repo already carries this caution, e.g. the
`// TODO: native review` note on the `ja` currency label in
`js/core/i18n.js`.

**Where:**
`js/core/i18n.js` (`settings.subscription.*`), `website/i18n.js`
(`up.*`, `ft.manage`).

### [ ] 14 unreachable modules left in `js/`

**Priority:** Low
**Effort:** Low to delete, Medium to wire up
**Impact:** Dead weight, or unfinished architecture — unclear which

**Problem:**
A reachability analysis from `index.html` (following `<script src>`,
static imports and the `import()` calls in its inline
`<script type="module">` blocks) found 21 of 66 `js/` files never load.
`e603d05` removed the 7 that were provably dead — byte-identical
duplicates, an empty file. The remaining 14 are dashboard widgets
(`balanceCard`, `budgetProgress`, `dailyLimit`, `miniCharts`,
`recentActivity`, `spending.chart`, `spending.insights`,
`transaction.input`), `state.controller`, `language.service`,
`data/database`, `data/product.api`, `transactions.view` and
`utils/language`.

**Why deferred:**
They look like planned-but-unwired architecture rather than rot — they
are what the (since deleted) `module.loader.js` registry tried to load.
Deleting them is a product call: either wire them up or drop them.

### [ ] `filter-branch` backup refs still hold the pre-rewrite history

**Priority:** Low — local clones only, nothing on GitHub
**Effort:** Low
**Impact:** Old objects keep `.git` at ~260 MB and hold real credentials

**Problem:**
`refs/original/refs/heads/main` and `refs/original/refs/stash` are the
backup refs `git filter-branch` left behind on 2026-04-14. They still
point at the pre-rewrite history, which contains `server/.env` with live
Stripe, Supabase and email credentials. Those commits are unreachable
from every `origin` ref and were never pushed — this is a local-disk
concern, not a published one. It also blocks `gc` from reclaiming the
untracked 70 MB of build artifacts.

**Solution:**
Delete the `refs/original/*` refs, expire the reflog, then
`git gc --prune=now --aggressive`.

**Why deferred:**
Raised on 2026-08-26 and explicitly declined for that session. Matters
before the repo is copied, archived or handed to anyone.

---

## See also

[server/BACKLOG.md](server/BACKLOG.md) — Express `trust proxy`, the
`setup-database.sql` schema drift, the silently-broken `trial_ends_at`
expiry, the Electron v36 → v41 security upgrade, the voice assistant's
Web Speech API problem, and `cancel_at_period_end` not being tracked.
