/**
 * BeSafe User Plan Module — active UI mode (Personal vs Business)
 *
 * Phase 4+ Mode Separation (Sesija A1, 2026-05-01). Reads + writes
 * the user's active plan mode from localStorage and dispatches a
 * `user-plan:changed` event when set.
 *
 * Storage:
 *   • localStorage key: `besafe:user-plan`
 *   • Two valid values: "personal" (default) and "business"
 *
 * Architectural role: this is the *active UI mode* signal. It tells
 * the rest of the app which dataset slice the user is currently
 * viewing / editing. transaction.service.js uses `getUserPlan()` to
 * default the `mode` field on freshly created records (transactions,
 * places, categories, savedCalculations).
 *
 * NOT to be confused with `license.plan` (server-side, in the
 * `licenses` Postgres table) which determines billing tier and is
 * the source of truth for *what features the user is entitled to*.
 * The two can — and frequently will — desync intentionally during
 * UI demos (e.g., a Business-licensed user toggling to Personal mode
 * to see their personal data only). Sesija A3 will add a UI-level
 * gate that prevents Personal-licensed users from toggling INTO
 * Business mode (modal upgrade prompt). See
 * `besafe_mode_separation_principle.md` Q3 for the full design.
 */

const VALID_PLANS = Object.freeze(["personal", "business"]);

/** Default plan when none is stored. Personal is the conservative
 *  starting point — also matches the migration default for legacy
 *  records (see runModeMigration in migration.js). */
export const DEFAULT_PLAN = "personal";

/** localStorage key. Not namespaced by license — the plan is a
 *  single user-level preference. */
export const USER_PLAN_STORAGE_KEY = "besafe:user-plan";

/** Event dispatched on `document` after a successful setUserPlan().
 *  UI components (HomePage, Reports, etc.) subscribe and refresh
 *  their data view. Convention: `<entity>:<verb>`. */
export const USER_PLAN_CHANGED_EVENT = "user-plan:changed";

export function isValidPlan(plan) {
  return VALID_PLANS.includes(String(plan || "").trim().toLowerCase());
}

/**
 * Read the user's active plan mode from localStorage. Falls back to
 * DEFAULT_PLAN ("personal") for first-run users, private browsing,
 * unknown stored values, or storage access errors.
 *
 * @returns {"personal"|"business"} always a valid plan string
 */
export function getUserPlan() {
  try {
    const stored = localStorage.getItem(USER_PLAN_STORAGE_KEY);
    if (stored && isValidPlan(stored)) {
      return String(stored).trim().toLowerCase();
    }
  } catch {
    // private browsing / disabled storage — fall through
  }
  return DEFAULT_PLAN;
}

/**
 * Persist the user's plan choice and notify subscribers via the
 * `user-plan:changed` event. Validates the value first; rejects
 * unknown plans with a console warning and returns false.
 *
 * @param {string} plan
 * @returns {boolean} true on success, false on validation or storage failure
 */
export function setUserPlan(plan) {
  const normalized = String(plan || "").trim().toLowerCase();
  if (!isValidPlan(normalized)) {
    console.warn("[UserPlan] Rejected invalid plan:", plan);
    return false;
  }
  try {
    localStorage.setItem(USER_PLAN_STORAGE_KEY, normalized);
  } catch (err) {
    console.warn("[UserPlan] localStorage write failed:", err?.message);
    return false;
  }
  try {
    document.dispatchEvent(new CustomEvent(USER_PLAN_CHANGED_EVENT, {
      detail: { plan: normalized },
    }));
  } catch {
    // no document (jsdom edge) — write succeeded, just no notification
  }
  return true;
}
