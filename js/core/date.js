/**
 * Date helpers with timezone-correct local time handling.
 *
 * Why: Date.toISOString() returns UTC, which causes off-by-one
 * day errors for users in UTC+X or UTC-X timezones (e.g.,
 * UTC+12 user adding evening expense at 23:30 local would get
 * tomorrow's date).
 *
 * These helpers use Date.getFullYear/getMonth/getDate which
 * respect the user's local timezone.
 *
 * Storage timestamps (createdAt, generatedAt) intentionally
 * keep using toISOString() — UTC is the correct convention
 * for serialized timestamps. AI context (finance.context.js)
 * also uses UTC by design (DB convention match).
 */

/**
 * Today's date as YYYY-MM-DD in local timezone.
 * @returns {string}
 */
export function todayLocal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * First day of the current month as YYYY-MM-DD in local timezone.
 * @returns {string}
 */
export function monthStartLocal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

/**
 * Parse YYYY-MM-DD as local date (NOT UTC midnight).
 *
 * JS spec parses "2026-05-04" as UTC midnight, so for users
 * in UTC-X timezones, new Date("2026-05-04") returns May 3
 * local. Use this helper to get May 4 local.
 *
 * @param {string} dateStr - YYYY-MM-DD format
 * @returns {Date|null} Local Date object, or null on invalid input
 */
export function parseLocalDate(dateStr) {
  if (typeof dateStr !== "string") return null;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

/**
 * Format YYYY-MM-DD or Date for display via Intl.DateTimeFormat
 * with correct local-time semantics.
 *
 * Strings matching YYYY-MM-DD are parsed as local dates to avoid
 * UTC-midnight shift. Other strings fall back to native Date parsing.
 *
 * @param {string|Date} value - YYYY-MM-DD string or Date object
 * @param {string} locale - BCP 47 locale (e.g., "lt-LT")
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date or original value if invalid
 */
export function formatDateLocal(value, locale, options = {}) {
  let date = null;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "string" && value) {
    date = parseLocalDate(value) || new Date(value);
  }
  if (!date || Number.isNaN(date.getTime())) return String(value || "");
  try {
    return new Intl.DateTimeFormat(locale || undefined, options).format(date);
  } catch {
    return String(value || "");
  }
}
