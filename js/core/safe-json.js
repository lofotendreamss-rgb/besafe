/**
 * Safe JSON.parse wrapper that returns a fallback value on parse failure.
 * Logs a warning with optional context string for debugging.
 *
 * Used to defend against corrupted localStorage / malformed inputs where
 * an uncaught SyntaxError would crash the calling flow. Server-side
 * JSON.parse calls (filesystem reads, webhook bodies) intentionally use
 * their own try/catch — different runtime contexts.
 *
 * @param {string|null|undefined} str - String to parse
 * @param {*} fallback - Value to return on parse failure (default: null)
 * @param {string} context - Optional identifier for debug logs (default: "")
 * @returns {*} Parsed value or fallback
 */
export function safeJsonParse(str, fallback = null, context = "") {
  if (str === null || str === undefined) return fallback;
  try {
    return JSON.parse(str);
  } catch (err) {
    console.warn(`[safeJsonParse] ${context || "parse failed"}:`, err.message);
    return fallback;
  }
}
