// ============================================================
// BeSafe License Checker Module
// Checks license status on load and every 24 hours
// ============================================================

const API_URL = "https://besafe-oga3.onrender.com";
const UPGRADE_URL = "https://www.besafe.fyi/#pricing";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ---- State ----
let _licenseStatus = null; // null | "active" | "trial" | "read_only" | "expired" | "device_limit" | "free"
let _checkTimer = null;

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

  localStorage.setItem("besafe_device_fp", fp);
  return fp;
}

// ============================================================
// Check license status
// ============================================================

export async function checkLicenseStatus() {
  const licenseKey = localStorage.getItem("besafe_license_key");

  // No key saved — free user (not registered yet)
  if (!licenseKey) {
    _licenseStatus = "free";
    localStorage.setItem("besafe_license_status", "free");
    removeUpgradeBanner();
    setReadOnlyMode(false);
    console.log("[License] No key found — free use mode");
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
        _licenseStatus = "active";
        localStorage.setItem("besafe_license_status", "active");
        removeUpgradeBanner();
        setReadOnlyMode(false);
        break;

      case "read_only":
        _licenseStatus = "read_only";
        localStorage.setItem("besafe_license_status", "read_only");
        showUpgradeBanner();
        setReadOnlyMode(true);
        break;

      case "expired":
        _licenseStatus = "expired";
        localStorage.setItem("besafe_license_status", "expired");
        showUpgradeBanner();
        setReadOnlyMode(true);
        break;

      case "payment_required":
        _licenseStatus = "read_only";
        localStorage.setItem("besafe_license_status", "read_only");
        showUpgradeBanner("Payment failed. Please update your payment method.");
        setReadOnlyMode(true);
        break;

      case "device_limit":
        _licenseStatus = "device_limit";
        localStorage.setItem("besafe_license_status", "device_limit");
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

    localStorage.setItem("besafe_license_last_check", Date.now().toString());
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

  const message = customMessage || "Your free trial has ended. Upgrade to continue using BeSafe";

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
    console.log("[License] Periodic re-check (24h)");
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
