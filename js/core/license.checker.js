// ============================================================
// BeSafe License Checker Module
// Checks license status on load and every 24 hours
// ============================================================

import { createTranslator, getCurrentLanguage } from "./i18n.js";
import { safeSetItem } from "./safe-storage.js";

function t(key, fallback) {
  try {
    return createTranslator(getCurrentLanguage())(key, fallback);
  } catch {
    return fallback;
  }
}

const API_URL = "https://besafe-oga3.onrender.com";
const UPGRADE_URL = "/upgrade.html";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

// localStorage key constants — DRY, single source of truth
const LICENSE_STATUS_KEY = "besafe_license_status";
const LICENSE_PLAN_KEY = "besafe_license_plan";
const LICENSE_LAST_CHECK_KEY = "besafe_license_last_check";
const DEVICE_FP_KEY = "besafe_device_fp";

// ---- State ----
let _licenseStatus = null; // null | "active" | "trial" | "read_only" | "expired" | "device_limit" | "free"
let _checkTimer = null;

/**
 * Update both in-memory _licenseStatus state and persisted
 * besafe_license_status localStorage key. DRY helper for the 6
 * status transitions inside checkLicenseStatus().
 */
function persistStatus(status) {
  _licenseStatus = status;
  safeSetItem(LICENSE_STATUS_KEY, status, "license:status");
}

// ============================================================
// Device fingerprint
// ============================================================

function generateDeviceFingerprint() {
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

  // Simple hash
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  const fp = "fp_" + Math.abs(hash).toString(36) + "_" + Date.now().toString(36);

  safeSetItem(DEVICE_FP_KEY, fp, "license:device-fp");
  return fp;
}

// ============================================================
// Check license status
// ============================================================

export async function checkLicenseStatus() {
  const licenseKey = localStorage.getItem("besafe_license_key");

  // No key saved — free user (not registered yet)
  if (!licenseKey) {
    persistStatus("free");
    removeUpgradeBanner();
    setReadOnlyMode(false);
    return _licenseStatus;
  }

  const deviceFp = generateDeviceFingerprint();

  try {
    const res = await fetch(`${API_URL}/api/verify-license`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        license_key: licenseKey,
        device_fingerprint: deviceFp,
      }),
    });

    const data = await res.json();
    const status = data.status || "error";

    console.log(`[License] Verify response: ${status}`, data);

    switch (status) {
      case "active":
      case "trial":
        persistStatus("active");
        removeUpgradeBanner();
        setReadOnlyMode(false);
        break;

      case "read_only":
        persistStatus("read_only");
        showUpgradeBanner(t("banner.subscriptionEnded", "Subscription ended. Renew your plan to continue."));
        setReadOnlyMode(true);
        break;

      case "expired":
        persistStatus("expired");
        showUpgradeBanner(t("banner.trialEnded", "Your trial has ended. Upgrade to continue."));
        setReadOnlyMode(true);
        break;

      case "payment_required":
        persistStatus("read_only");
        showUpgradeBanner(t("banner.paymentFailed", "Payment failed. Update your payment method."));
        setReadOnlyMode(true);
        break;

      case "device_limit":
        persistStatus("device_limit");
        showDeviceLimitError(data.max_devices || 2, data.current_devices || 0);
        break;

      default:
        // On error, use cached status if available
        const cached = localStorage.getItem("besafe_license_status");
        if (cached && cached !== "free") {
          _licenseStatus = cached;
        } else {
          _licenseStatus = "free";
        }
        console.warn("[License] Unexpected status, using cached:", _licenseStatus);
        break;
    }

    // Cache license plan separately from status. plan distinguishes
    // Personal-licensed vs Business-licensed users (used by Mode
    // Separation A3 — handlePlanSwitchClick gates Personal users from
    // toggling into Business mode without an upgrade).
    if (data.plan === "personal" || data.plan === "business") {
      safeSetItem(LICENSE_PLAN_KEY, data.plan, "license:plan");
    }

    safeSetItem(LICENSE_LAST_CHECK_KEY, Date.now().toString(), "license:last-check");
  } catch (err) {
    console.error("[License] Verification failed:", err.message);

    // Offline or network error — use cached status
    const cached = localStorage.getItem("besafe_license_status");
    _licenseStatus = cached || "free";
    console.log("[License] Using cached status:", _licenseStatus);
  }

  return _licenseStatus;
}

// ============================================================
// Upgrade banner
// ============================================================

export function showUpgradeBanner(customMessage) {
  // Remove existing banner if present
  removeUpgradeBanner();

  const banner = document.createElement("div");
  banner.id = "besafe-upgrade-banner";
  banner.style.cssText = [
    "position:fixed",
    "top:0",
    "left:0",
    "right:0",
    "z-index:9998",
    "background:linear-gradient(135deg, #b8860b, #d4a017, #c99a0c)",
    "color:#1a1000",
    "padding:10px 20px",
    "text-align:center",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "font-size:14px",
    "font-weight:500",
    "box-shadow:0 2px 8px rgba(0,0,0,0.3)",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "gap:12px",
  ].join(";");

  const message = customMessage || t("banner.subscriptionEnded", "Subscription ended. Renew your plan to continue.");

  banner.innerHTML = `
    <span>${message}</span>
    <a href="${UPGRADE_URL}" target="_blank" rel="noopener"
       style="background:#1a1000;color:#d4a017;padding:5px 16px;border-radius:20px;text-decoration:none;font-size:13px;font-weight:600;white-space:nowrap;transition:opacity .2s"
       onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
      Upgrade &rarr;
    </a>
    <button onclick="this.parentElement.style.display='none';document.body.style.paddingTop='0'"
       style="background:none;border:none;color:#1a1000;cursor:pointer;font-size:18px;line-height:1;padding:0 4px;margin-left:8px;opacity:0.6"
       title="Dismiss">&times;</button>
  `;

  document.body.prepend(banner);
  document.body.style.paddingTop = banner.offsetHeight + "px";
}

function removeUpgradeBanner() {
  const existing = document.getElementById("besafe-upgrade-banner");
  if (existing) {
    existing.remove();
    document.body.style.paddingTop = "0";
  }
}

// ============================================================
// Device limit error
// ============================================================

function showDeviceLimitError(maxDevices, currentDevices) {
  removeUpgradeBanner();

  const banner = document.createElement("div");
  banner.id = "besafe-upgrade-banner";
  banner.style.cssText = [
    "position:fixed",
    "top:0",
    "left:0",
    "right:0",
    "z-index:9998",
    "background:linear-gradient(135deg, #cc4444, #e05555)",
    "color:#fff",
    "padding:10px 20px",
    "text-align:center",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "font-size:14px",
    "font-weight:500",
    "box-shadow:0 2px 8px rgba(0,0,0,0.3)",
  ].join(";");

  banner.innerHTML = `
    <span>Device limit reached (${currentDevices}/${maxDevices}). Please deactivate another device or contact support.</span>
    <button onclick="this.parentElement.style.display='none';document.body.style.paddingTop='0'"
       style="background:none;border:none;color:#fff;cursor:pointer;font-size:18px;line-height:1;padding:0 4px;margin-left:12px;opacity:0.7"
       title="Dismiss">&times;</button>
  `;

  document.body.prepend(banner);
  document.body.style.paddingTop = banner.offsetHeight + "px";
}

// ============================================================
// Read-only mode
// ============================================================

export function isReadOnly() {
  return _licenseStatus === "read_only" || _licenseStatus === "expired";
}

/**
 * Read the user's license tier (what they're entitled to).
 * Distinguishes from getUserPlan() which is the active UI mode.
 * Defaults to "personal" for free tier / unlicensed / fetch errors —
 * the conservative bucket that triggers the upgrade modal in A3 gating.
 *
 * @returns {"personal"|"business"}
 */
export function getLicensePlan() {
  try {
    const stored = localStorage.getItem(LICENSE_PLAN_KEY);
    if (stored === "business" || stored === "personal") return stored;
  } catch {}
  return "personal";
}

function setReadOnlyMode(enabled) {
  if (enabled) {
    document.body.classList.add("besafe-read-only");
    disableMutationButtons();
  } else {
    document.body.classList.remove("besafe-read-only");
    enableMutationButtons();
  }
}

function disableMutationButtons() {
  // Disable create/update/delete buttons
  const selectors = [
    'button[data-action="create"]',
    'button[data-action="update"]',
    'button[data-action="delete"]',
    'button[data-action="save"]',
    'button[data-action="add"]',
    '.btn-create',
    '.btn-update',
    '.btn-delete',
    '.btn-save',
    '.btn-add',
    '[data-mutation]',
  ];

  const buttons = document.querySelectorAll(selectors.join(","));
  buttons.forEach((btn) => {
    btn.classList.add("besafe-disabled");
    btn.setAttribute("disabled", "true");
    btn.title = "Upgrade to continue editing";
  });

  // Inject read-only CSS if not already present
  if (!document.getElementById("besafe-readonly-styles")) {
    const style = document.createElement("style");
    style.id = "besafe-readonly-styles";
    style.textContent = `
      .besafe-read-only .besafe-disabled {
        opacity: 0.4 !important;
        pointer-events: none !important;
        cursor: not-allowed !important;
      }
      .besafe-read-only input:not([readonly]),
      .besafe-read-only textarea:not([readonly]),
      .besafe-read-only select:not([disabled]) {
        opacity: 0.6;
      }
    `;
    document.head.appendChild(style);
  }
}

function enableMutationButtons() {
  const buttons = document.querySelectorAll(".besafe-disabled");
  buttons.forEach((btn) => {
    btn.classList.remove("besafe-disabled");
    btn.removeAttribute("disabled");
    btn.title = "";
  });

  const style = document.getElementById("besafe-readonly-styles");
  if (style) style.remove();
}

// ============================================================
// Auto-check on import + periodic re-check
// ============================================================

function schedulePeriodicCheck() {
  if (_checkTimer) clearInterval(_checkTimer);

  _checkTimer = setInterval(() => {
    checkLicenseStatus();
  }, CHECK_INTERVAL_MS);
}

// Auto-run on import
(async () => {
  try {
    await checkLicenseStatus();
    schedulePeriodicCheck();
  } catch (err) {
    console.error("[License] Initial check failed:", err);
  }
})();
