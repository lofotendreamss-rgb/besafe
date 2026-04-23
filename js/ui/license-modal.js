/**
 * BeSafe License Activation Modal
 *
 * Shown when the user tries to use a licensed feature (like AI chat)
 * without a license key saved in localStorage. Lets them paste the
 * key from their email and activates it by calling /api/verify-license.
 *
 * Flow:
 *   1. showLicenseModal(onSuccess) — builds & opens the modal
 *   2. User pastes their BSAFE-XXXX-XXXX-XXXX-XXXX key
 *   3. Click "Activate" → POST /api/verify-license
 *   4. On success → save to localStorage, close modal, call onSuccess callback
 *   5. On error → show inline error message (network, invalid, device_limit)
 *
 * i18n: uses the same createTranslator + getCurrentLanguage pattern as
 * smart-assistant.js so the modal renders in the user's active UI
 * language. Fallback Lithuanian strings are embedded inline so a missing
 * i18n entry never leaves the user staring at a raw key name.
 */

import { createTranslator, getCurrentLanguage } from "../core/i18n.js";

const LICENSE_KEY_PATTERN = /^BSAFE-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;

/**
 * Generate a device fingerprint and persist it to localStorage.
 * Matches the algorithm in license.checker.js so both modules
 * produce consistent values for the same device.
 *
 * Critical for /api/verify-license: the server rejects requests with
 * null/missing device_fingerprint as {"status":"invalid"} (400). In
 * fresh Incognito windows localStorage starts empty, so just reading
 * besafe_device_fp used to return null and the modal would mislead
 * the user with "Invalid key. Check your email." — this helper
 * ensures we always send a real value.
 *
 * Returns the fingerprint string. Never returns null — on rare
 * crypto/screen access failures, falls back to a timestamp-based ID.
 */
function generateDeviceFingerprint() {
  try {
    const stored = localStorage.getItem("besafe_device_fp");
    if (stored) return stored;

    const nav = window.navigator;
    const raw = [
      nav.userAgent,
      nav.language,
      nav.hardwareConcurrency,
      screen.width,
      screen.height,
      screen.colorDepth,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      nav.platform,
    ].join("|");

    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw.charCodeAt(i);
      hash = ((hash << 5) - hash) + ch;
      hash |= 0;
    }
    const fp = "fp_" + Math.abs(hash).toString(36) + "_" + Date.now().toString(36);
    localStorage.setItem("besafe_device_fp", fp);
    return fp;
  } catch (err) {
    console.warn("[LicenseModal] fingerprint generation failed:", err);
    // Last-resort fallback: pure timestamp. Still a non-null string
    // so the server's !device_fingerprint check doesn't reject us.
    return "fp_fallback_" + Date.now().toString(36);
  }
}

let modalEl = null;
let inputEl = null;
let submitBtn = null;
let errorEl = null;
let currentOnSuccess = null;
let isSubmitting = false;
let escListenerAttached = false;

function getLang() {
  try { return String(getCurrentLanguage?.() || "en").toLowerCase(); }
  catch { return "en"; }
}

function t(key, fallback) {
  try { return createTranslator(getLang())(key, fallback); }
  catch { return fallback; }
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ensureStyles() {
  if (document.getElementById("license-modal-styles")) return;
  const style = document.createElement("style");
  style.id = "license-modal-styles";
  style.textContent = `
    .license-modal{position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;background:rgba(8,13,11,0.75);backdrop-filter:blur(8px)}
    .license-modal.is-open{display:flex}
    .license-modal__panel{background:#0f1812;border:1px solid rgba(46,204,138,0.2);border-radius:16px;padding:2rem;max-width:440px;width:90%;color:#f2f8f4;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,0.5)}
    .license-modal__title{font-size:1.3rem;margin:0 0 0.5rem;color:#2ecc8a;font-weight:600}
    .license-modal__subtitle{font-size:0.9rem;color:#9dc4a8;margin:0 0 1.5rem;line-height:1.5}
    .license-modal__input{width:100%;padding:0.85rem 1rem;background:#0a1009;border:1px solid rgba(46,204,138,0.25);border-radius:8px;color:#f2f8f4;font-size:1rem;font-family:ui-monospace,monospace;letter-spacing:0.05em;margin-bottom:0.75rem;text-transform:uppercase}
    .license-modal__input:focus{outline:none;border-color:#2ecc8a;box-shadow:0 0 0 3px rgba(46,204,138,0.15)}
    .license-modal__error{color:#ff6b6b;font-size:0.85rem;min-height:1.2rem;margin-bottom:1rem}
    .license-modal__actions{display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap}
    .license-modal__submit{flex:1;min-width:140px;padding:0.85rem 1.5rem;background:#2ecc8a;color:#030d07;border:none;border-radius:2rem;font-weight:600;cursor:pointer;font-size:0.9rem;transition:all 0.2s}
    .license-modal__submit:hover:not(:disabled){background:#1a9e66;transform:translateY(-1px)}
    .license-modal__submit:disabled{opacity:0.5;cursor:not-allowed}
    .license-modal__cancel{padding:0.85rem 1rem;background:transparent;color:#9dc4a8;border:none;cursor:pointer;font-size:0.85rem}
    .license-modal__cancel:hover{color:#f2f8f4}
    .license-modal__footer{margin-top:1.25rem;padding-top:1.25rem;border-top:1px solid rgba(46,204,138,0.1);font-size:0.8rem;color:#9dc4a8;text-align:center}
    .license-modal__footer a{color:#2ecc8a;text-decoration:none}
    .license-modal__footer a:hover{text-decoration:underline}
  `;
  document.head.appendChild(style);
}

function buildModal() {
  ensureStyles();
  const wrap = document.createElement("div");
  wrap.className = "license-modal";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.innerHTML =
    '<div class="license-modal__panel">' +
      '<h2 class="license-modal__title">' + escapeHtml(t("license.title", "Aktyvuokite BeSafe")) + '</h2>' +
      '<p class="license-modal__subtitle">' + escapeHtml(t("license.subtitle", "Įveskite licencijos raktą, kurį gavote el. paštu po registracijos.")) + '</p>' +
      '<input type="text" class="license-modal__input" data-license-input placeholder="BSAFE-XXXX-XXXX-XXXX-XXXX" maxlength="29" autocomplete="off" spellcheck="false">' +
      '<div class="license-modal__error" data-license-error aria-live="polite"></div>' +
      '<div class="license-modal__actions">' +
        '<button type="button" class="license-modal__submit" data-license-submit>' + escapeHtml(t("license.activate", "Aktyvuoti")) + '</button>' +
        '<button type="button" class="license-modal__cancel" data-license-cancel>' + escapeHtml(t("license.cancel", "Atšaukti")) + '</button>' +
      '</div>' +
      '<div class="license-modal__footer">' +
        escapeHtml(t("license.noKey", "Neturite rakto?")) + ' ' +
        '<a href="https://www.besafe.fyi/#register" target="_blank" rel="noopener">' +
        escapeHtml(t("license.register", "Užsiregistruoti")) +
        '</a>' +
      '</div>' +
    '</div>';

  document.body.appendChild(wrap);
  modalEl   = wrap;
  inputEl   = wrap.querySelector("[data-license-input]");
  submitBtn = wrap.querySelector("[data-license-submit]");
  errorEl   = wrap.querySelector("[data-license-error]");

  const cancelBtn = wrap.querySelector("[data-license-cancel]");
  cancelBtn.addEventListener("click", closeLicenseModal);
  submitBtn.addEventListener("click", handleSubmit);

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  });

  // Backdrop click closes (panel click does not — stopPropagation not needed
  // because the panel is a nested element; we compare target to wrapper).
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) closeLicenseModal();
  });

  // One-time global ESC listener guarded against multiple attachments.
  if (!escListenerAttached) {
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modalEl?.classList.contains("is-open")) {
        closeLicenseModal();
      }
    });
    escListenerAttached = true;
  }
}

async function handleSubmit() {
  if (isSubmitting) return;
  const raw = (inputEl.value || "").trim().toUpperCase();

  if (!raw) {
    showError(t("license.errorEmpty", "Įveskite licencijos raktą."));
    return;
  }
  if (!LICENSE_KEY_PATTERN.test(raw)) {
    showError(t("license.errorFormat", "Neteisingas formato raktas. Tikėtinas formatas: BSAFE-XXXX-XXXX-XXXX-XXXX"));
    return;
  }

  clearError();
  isSubmitting = true;
  submitBtn.disabled = true;
  const originalLabel = submitBtn.textContent;
  submitBtn.textContent = t("license.activating", "Aktyvuojama...");

  try {
    // Ensure we always have a fingerprint — generates one if missing,
    // reuses existing from localStorage otherwise. Server rejects
    // requests with null/missing device_fingerprint as {"status":"invalid"}
    // (400), which the modal would misreport as "Invalid key".
    const deviceFp = generateDeviceFingerprint();

    const res = await fetch("/api/verify-license", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        license_key:        raw,
        device_fingerprint: deviceFp,
      }),
    });

    let data = {};
    try { data = await res.json(); } catch {}

    if (!res.ok || data.status === "error" || data.status === "invalid" || data.status === "not_found") {
      showError(t("license.errorInvalid", "Neteisingas raktas. Patikrinkite el. paštą."));
      return;
    }

    if (data.status === "device_limit") {
      showError(t("license.errorDeviceLimit", "Pasiektas įrenginių limitas. Susisiekite su pagalba."));
      return;
    }

    // Any remaining status (active, trial, read_only, payment_required) counts
    // as "known to server" — persist the key and let downstream features
    // (license.checker.js) decide what to do with the status.
    try {
      localStorage.setItem("besafe_license_key", raw);
      if (data.status) localStorage.setItem("besafe_license_status", data.status);
    } catch (e) {
      console.warn("[LicenseModal] localStorage write failed:", e?.message);
    }

    closeLicenseModal();

    if (typeof currentOnSuccess === "function") {
      try { currentOnSuccess(); }
      catch (err) { console.warn("[LicenseModal] onSuccess threw:", err); }
    }
  } catch (err) {
    console.warn("[LicenseModal] verify failed:", err);
    showError(t("license.errorNetwork", "Nepavyko pasiekti serverio. Patikrinkite internetą."));
  } finally {
    isSubmitting = false;
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel || t("license.activate", "Aktyvuoti");
  }
}

function showError(msg) {
  if (errorEl) errorEl.textContent = msg;
}

function clearError() {
  if (errorEl) errorEl.textContent = "";
}

/**
 * Open the license activation modal.
 * @param {Function} [onSuccess] - Called after successful activation.
 */
export function showLicenseModal(onSuccess) {
  if (!modalEl) buildModal();
  currentOnSuccess = typeof onSuccess === "function" ? onSuccess : null;
  clearError();
  inputEl.value = "";
  modalEl.classList.add("is-open");
  // Small delay so the input focus doesn't fight the modal's open animation.
  setTimeout(() => inputEl?.focus(), 50);
}

export function closeLicenseModal() {
  if (!modalEl) return;
  modalEl.classList.remove("is-open");
  currentOnSuccess = null;
}

// Auto-open modal if URL has ?activate=1 (landing nav entry point for
// users who received a license key via email and need to activate it
// in a real browser — the besafe:// protocol handler only works in
// Electron desktop builds).
if (typeof window !== "undefined") {
  try {
    if (new URLSearchParams(window.location.search).get("activate") === "1") {
      const trigger = () => {
        showLicenseModal(() => {
          // After successful activation, strip the ?activate=1 from the URL
          // so a browser refresh doesn't re-open the modal.
          try {
            const url = new URL(window.location.href);
            url.searchParams.delete("activate");
            window.history.replaceState({}, "", url.toString());
          } catch {}
        });
      };
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", trigger);
      } else {
        setTimeout(trigger, 150);
      }
    }
  } catch (err) {
    console.warn("[LicenseModal] auto-trigger failed:", err);
  }
}
