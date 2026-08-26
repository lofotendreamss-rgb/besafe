// ============================================================
// api.base — resolves where the BeSafe API lives.
// ============================================================
//
// BeSafe ships the same index.html in two very different contexts,
// and a bare relative fetch("/api/...") is only correct in one:
//
//   Web (Express serves /app AND /api) → same origin, relative works
//   Electron desktop (win.loadFile)    → the page is file://, so a
//                                         relative /api/... resolves to
//                                         file:///api/... and the
//                                         request always fails
//
// Every module that talks to the API must therefore build an absolute
// URL from API_BASE rather than relying on the page's origin.
//
// Note on the older isLocal ? "http://127.0.0.1:3001" : ... pattern in
// license.checker.js / receipt-scanner.js / system.boot.js /
// api.service.js: those are correct in Electron (hostname is "" there,
// so they fall through to production), but they hardcode port 3001
// while server/.env sets PORT=4000. This module inherits
// location.origin for local dev instead, so the port can never drift.
// ============================================================

const PRODUCTION_API      = "https://besafe-oga3.onrender.com";
const PRODUCTION_API_HOST = "besafe-oga3.onrender.com";

export function resolveApiBase() {
  const loc = typeof window !== "undefined" ? window.location : null;
  if (!loc) return PRODUCTION_API;

  // file: (Electron) and anything else exotic — no origin to inherit.
  if (loc.protocol !== "http:" && loc.protocol !== "https:") {
    return PRODUCTION_API;
  }

  // Served by our own Express, locally or on Render: /api lives on the
  // very origin this page came from, whatever port that happens to be.
  const host = loc.hostname;
  if (host === "127.0.0.1" || host === "localhost") return loc.origin;
  if (host === PRODUCTION_API_HOST)                 return loc.origin;

  // Some other host (marketing site, future CDN) — be explicit rather
  // than assuming /api is co-located.
  return PRODUCTION_API;
}

export const API_BASE = resolveApiBase();
