# BeSafe

A privacy-first personal finance app. Your data stays on your device.

## What it is

BeSafe is a closed-source, subscription-based application for tracking
personal and business finances with a strict privacy posture:

- **Local-first.** Financial data lives in your browser's storage,
  not on remote servers.
- **No tracking.** Zero analytics, zero telemetry, zero third-party
  scripts.
- **Multilingual.** 14 languages supported as first-class citizens.
- **Mode separation.** Personal and business modes are fully isolated —
  no data leaks between contexts.

## Status

This repository contains proprietary source code. It is **not open
source.** Access is granted to subscription holders for reference and
audit purposes only.

For licensing terms, see [LICENSE](./LICENSE).

## Distribution

- **Web app** — primary distribution at https://besafe.fyi
- **Desktop wrapper** (Electron) — currently dormant; future Windows
  installer planned.

## Tech stack

- Frontend: Vanilla JS (ESM), no framework dependency
- Backend: Node.js + Express + Supabase + Stripe + Anthropic API
- Tests: Vitest (server-side, 87+ tests)
- Deployment: Render (web app), Vercel (marketing site)

## License inquiries

For licensing or commercial inquiries, contact via https://besafe.fyi.

---

© 2026 BeSafe. All rights reserved.
