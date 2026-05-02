/**
 * BeSafe Upgrade Prompt Modal — Mode Separation A3 gating
 *
 * Shown when a Personal-licensed user clicks the "Business" plan switch.
 * Mirrors the structure of license-modal.js (vanilla JS, lazy singleton,
 * inline styles, ESC + backdrop close).
 *
 * Public API:
 *   showUpgradePrompt({ onUpgrade, onClose })
 *   closeUpgradePrompt()
 *
 * i18n keys (delivered in A3b session — for now EN/LT inline fallbacks):
 *   upgrade.modal.title
 *   upgrade.modal.subtitle
 *   upgrade.modal.upgradeButton
 *   upgrade.modal.closeButton
 *
 * Spec: see memory/besafe_mode_separation_principle.md Q3.
 */

import { createTranslator, getCurrentLanguage } from "../core/i18n.js";

let modalEl = null;
let upgradeBtn = null;
let closeBtn = null;
let currentOnUpgrade = null;
let currentOnClose = null;
let escListenerAttached = false;

function getLang() {
  try { return String(getCurrentLanguage?.() || "en").toLowerCase(); }
  catch { return "en"; }
}

// BeSafe i18n API is (key, params), NOT (key, fallback). The translator
// returns the key itself when no translation exists (i18n.js:10185 ?? key
// fallback chain). We detect that case here and return our supplied
// fallback instead. Same pattern as home.page.js:60-69 and
// categories.page.js:67-86.
function t(key, fallback) {
  try {
    const result = createTranslator(getLang())(key);
    if (typeof result === "string" && result.trim() && result !== key) {
      return result;
    }
  } catch {}
  return fallback;
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
  if (document.getElementById("upgrade-prompt-styles")) return;
  const style = document.createElement("style");
  style.id = "upgrade-prompt-styles";
  style.textContent = `
    .upgrade-prompt{position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;background:rgba(8,13,11,0.75);backdrop-filter:blur(8px)}
    .upgrade-prompt.is-open{display:flex}
    .upgrade-prompt__panel{background:#0f1812;border:1px solid rgba(46,204,138,0.2);border-radius:16px;padding:2rem;max-width:420px;width:90%;color:#f2f8f4;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,0.5);text-align:center}
    .upgrade-prompt__title{font-size:1.4rem;margin:0 0 0.75rem;color:#2ecc8a;font-weight:600}
    .upgrade-prompt__subtitle{font-size:0.95rem;color:#9dc4a8;margin:0 0 1.75rem;line-height:1.5}
    .upgrade-prompt__actions{display:flex;gap:0.75rem;align-items:center;justify-content:center;flex-wrap:wrap}
    .upgrade-prompt__upgrade{flex:1;min-width:140px;padding:0.85rem 1.5rem;background:#2ecc8a;color:#030d07;border:none;border-radius:2rem;font-weight:600;cursor:pointer;font-size:0.9rem;transition:all 0.2s}
    .upgrade-prompt__upgrade:hover{background:#1a9e66;transform:translateY(-1px)}
    .upgrade-prompt__close{padding:0.85rem 1rem;background:transparent;color:#9dc4a8;border:none;cursor:pointer;font-size:0.85rem}
    .upgrade-prompt__close:hover{color:#f2f8f4}
  `;
  document.head.appendChild(style);
}

function buildModal() {
  ensureStyles();
  const wrap = document.createElement("div");
  wrap.className = "upgrade-prompt";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.innerHTML =
    '<div class="upgrade-prompt__panel">' +
      '<h2 class="upgrade-prompt__title" data-upgrade-title></h2>' +
      '<p class="upgrade-prompt__subtitle" data-upgrade-subtitle></p>' +
      '<div class="upgrade-prompt__actions">' +
        '<button type="button" class="upgrade-prompt__upgrade" data-upgrade-confirm></button>' +
        '<button type="button" class="upgrade-prompt__close" data-upgrade-cancel></button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(wrap);
  modalEl = wrap;
  upgradeBtn = wrap.querySelector("[data-upgrade-confirm]");
  closeBtn = wrap.querySelector("[data-upgrade-cancel]");

  upgradeBtn.addEventListener("click", () => {
    const cb = currentOnUpgrade;
    if (typeof cb === "function") {
      try { cb(); } catch (err) { console.warn("[UpgradePrompt] onUpgrade threw:", err); }
    } else {
      closeUpgradePrompt();
    }
  });

  closeBtn.addEventListener("click", () => {
    const cb = currentOnClose;
    if (typeof cb === "function") {
      try { cb(); } catch (err) { console.warn("[UpgradePrompt] onClose threw:", err); }
    } else {
      closeUpgradePrompt();
    }
  });

  // Backdrop click closes (panel click does not — comparing target to wrapper).
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) closeUpgradePrompt();
  });

  if (!escListenerAttached) {
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modalEl?.classList.contains("is-open")) {
        closeUpgradePrompt();
      }
    });
    escListenerAttached = true;
  }
}

function refreshLabels() {
  if (!modalEl) return;
  const title = modalEl.querySelector("[data-upgrade-title]");
  const subtitle = modalEl.querySelector("[data-upgrade-subtitle]");
  if (title) title.textContent = t("upgrade.modal.title", "Tik verslui.");
  if (subtitle) subtitle.textContent = t(
    "upgrade.modal.subtitle",
    "Verslo planas reikalingas šiai funkcijai pasiekti."
  );
  if (upgradeBtn) upgradeBtn.textContent = t("upgrade.modal.upgradeButton", "Atnaujinti planą");
  if (closeBtn) closeBtn.textContent = t("upgrade.modal.closeButton", "Uždaryti");
}

/**
 * Open the upgrade prompt modal.
 * @param {Object} [opts]
 * @param {Function} [opts.onUpgrade] - Called when user clicks the upgrade button.
 *   If omitted, the button just closes the modal.
 * @param {Function} [opts.onClose] - Called when user clicks close, ESC, or backdrop.
 *   If omitted, the modal just closes.
 */
export function showUpgradePrompt(opts = {}) {
  if (!modalEl) buildModal();
  currentOnUpgrade = typeof opts.onUpgrade === "function" ? opts.onUpgrade : null;
  currentOnClose = typeof opts.onClose === "function" ? opts.onClose : null;
  refreshLabels();
  modalEl.classList.add("is-open");
}

export function closeUpgradePrompt() {
  if (!modalEl) return;
  modalEl.classList.remove("is-open");
  currentOnUpgrade = null;
  currentOnClose = null;
}
