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

// ============================================================
// Site pages
// ============================================================
//
// The marketing pages (upgrade.html, privacy.html, terms.html) are
// served from the same origin as /api — Express serves the website at
// root and the app under /app — so SITE_BASE equals API_BASE today.
// It is a separate constant so that moving the API to a dedicated
// host later cannot silently break page links.
export const SITE_BASE = API_BASE;

// True when running inside the Electron shell, judged by the preload
// bridge rather than the user agent.
function hasDesktopShell() {
  try {
    return typeof window !== "undefined"
      && typeof window.electronAPI?.openExternal === "function";
  } catch {
    return false;
  }
}

// Opens one of our own pages, given a root-relative path.
//
// In Electron the app runs from file:// inside a window with no
// browser chrome. Navigating that window to a website strands the
// user with no back button, and target="_blank" opens a second
// chrome-less Electron window. Both are wrong, so we hand the URL to
// the OS browser through the preload bridge instead — the same route
// electron/license.html already uses.
//
// On the web, `target` decides: callers that want the page in place
// (so the browser back button returns to the app) pass "_self";
// callers that want a new tab pass "_blank".
export function openSitePage(path, { target = "_self" } = {}) {
  const url = SITE_BASE + path;

  if (hasDesktopShell()) {
    window.electronAPI.openExternal(url);
    return url;
  }

  if (typeof window !== "undefined") {
    if (target === "_blank") window.open(url, "_blank", "noopener");
    else window.location.href = url;
  }
  return url;
}
