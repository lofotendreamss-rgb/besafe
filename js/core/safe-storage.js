/**
 * Safe localStorage wrapper helpers.
 *
 * Companion module to safe-json.js — both defend client-side storage
 * from edge-case failures (corrupted reads, quota writes, Safari
 * private mode access errors).
 *
 * setItem returns boolean (caller decides UX response on quota fail).
 * getItem returns value/fallback (null-safety + Safari private mode
 * protection).
 *
 * Server-side localStorage doesn't exist — these helpers are
 * client-only. Filesystem / DB writes use their own try/catch
 * patterns.
 */

/**
 * Safe localStorage.setItem wrapper.
 *
 * @param {string} key
 * @param {string} value
 * @param {string} context - Optional identifier for debug logs
 * @returns {boolean} true on success, false on quota exceeded /
 *                    write failure / storage access error
 */
export function safeSetItem(key, value, context = "") {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    const isQuota = err && (
      err.code === 22 ||
      err.code === 1014 ||
      err.name === "QuotaExceededError"
    );
    const errType = isQuota ? "quota exceeded" : "write failed";
    console.warn(`[safeSetItem] ${context || key}: ${errType}:`, err.message);
    return false;
  }
}

/**
 * Safe localStorage.getItem wrapper.
 *
 * @param {string} key
 * @param {*} fallback - Value to return on null / storage error (default: null)
 * @param {string} context - Optional identifier for debug logs
 * @returns {string|*} Stored value or fallback
 */
export function safeGetItem(key, fallback = null, context = "") {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch (err) {
    console.warn(`[safeGetItem] ${context || key}:`, err.message);
    return fallback;
  }
}
