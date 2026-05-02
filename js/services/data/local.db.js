/**
 * BeSafe Local Database
 * All data stored in browser localStorage — never leaves the device.
 * Each data type stored as separate key: besafe_transactions, besafe_categories, etc.
 */

function getLicenseKey() {
  try {
    return localStorage.getItem("besafe_license_key") || "local";
  } catch {
    return "local";
  }
}

function getKeys() {
  const lic = getLicenseKey();
  return {
    transactions: `besafe_transactions_${lic}`,
    categories: `besafe_categories_${lic}`,
    places: `besafe_places_${lic}`,
    savedCalculations: `besafe_saved_calculations_${lic}`,
  };
}

// Dynamic — always uses current license key
const KEYS = new Proxy({}, {
  get(_, prop) { return getKeys()[prop]; }
});

function generateId(prefix = "tx") {
  return `${prefix}_${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function readCollection(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCollection(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error("[LocalDB] Write failed:", key, e);
  }
}

/**
 * Filter a records array by `mode` field. Phase 4+ Mode Separation
 * (Sesija A2, 2026-05-01). Used by aggregator / context-builder
 * functions to scope their output to the user's active plan
 * (Personal vs Business).
 *
 * Contract:
 *   • mode = null/undefined → no filter, returns array as-is.
 *     Used by runModeMigration which must see ALL records to
 *     backfill the field. Callers that want filtering MUST pass
 *     a mode argument explicitly.
 *   • mode = "personal" | "business" → returns records whose
 *     `mode` field matches. Records without mode are excluded
 *     (they should have been backfilled by runModeMigration at
 *     boot, so missing mode is anomalous).
 *   • Non-array input → empty array (defensive).
 *
 * @param {Array} records
 * @param {string|null|undefined} mode
 * @returns {Array}
 */
export function filterByMode(records, mode) {
  if (mode == null) return Array.isArray(records) ? records : [];
  if (!Array.isArray(records)) return [];
  return records.filter((r) => r?.mode === mode);
}

// ============================================================
// Transactions
// ============================================================

export function getTransactions() {
  return readCollection(KEYS.transactions);
}

export function getTransactionById(id) {
  const all = getTransactions();
  return all.find((t) => t.id === id) || null;
}

export function createTransaction(payload) {
  const all = getTransactions();
  const transaction = {
    ...payload,
    id: payload.id || generateId("tx"),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  all.push(transaction);
  writeCollection(KEYS.transactions, all);
  return transaction;
}

export function updateTransaction(id, payload) {
  const all = getTransactions();
  const idx = all.findIndex((t) => t.id === id);
  if (idx === -1) throw new Error("Transaction not found");
  all[idx] = { ...all[idx], ...payload, id, updatedAt: nowIso() };
  writeCollection(KEYS.transactions, all);
  return all[idx];
}

export function deleteTransaction(id) {
  const all = getTransactions();
  const idx = all.findIndex((t) => t.id === id);
  if (idx === -1) throw new Error("Transaction not found");
  const removed = all.splice(idx, 1)[0];
  writeCollection(KEYS.transactions, all);
  return removed;
}

// ============================================================
// Categories
// ============================================================

export function getCategories() {
  return readCollection(KEYS.categories);
}

export function getCategoryById(id) {
  return getCategories().find((c) => c.id === id) || null;
}

export function createCategory(payload) {
  const all = getCategories();
  const category = {
    ...payload,
    id: payload.id || generateId("cat"),
    normalizedName: String(payload.name || "").trim().toLowerCase(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  all.push(category);
  writeCollection(KEYS.categories, all);
  return category;
}

export function updateCategory(id, payload) {
  const all = getCategories();
  const idx = all.findIndex((c) => c.id === id);
  if (idx === -1) throw new Error("Category not found");
  all[idx] = { ...all[idx], ...payload, id, updatedAt: nowIso() };
  writeCollection(KEYS.categories, all);
  return all[idx];
}

export function deleteCategory(id) {
  const all = getCategories();
  const idx = all.findIndex((c) => c.id === id);
  if (idx === -1) throw new Error("Category not found");
  const removed = all.splice(idx, 1)[0];
  writeCollection(KEYS.categories, all);
  return removed;
}

// ============================================================
// Places
// ============================================================

export function getPlaces() {
  return readCollection(KEYS.places);
}

export function getPlaceById(id) {
  return getPlaces().find((p) => p.id === id) || null;
}

export function createPlace(payload) {
  const all = getPlaces();
  const place = {
    ...payload,
    id: payload.id || generateId("place"),
    normalizedName: String(payload.name || "").trim().toLowerCase(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  all.push(place);
  writeCollection(KEYS.places, all);
  return place;
}

export function updatePlace(id, payload) {
  const all = getPlaces();
  const idx = all.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error("Place not found");
  all[idx] = { ...all[idx], ...payload, id, updatedAt: nowIso() };
  writeCollection(KEYS.places, all);
  return all[idx];
}

export function deletePlace(id) {
  const all = getPlaces();
  const idx = all.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error("Place not found");
  const removed = all.splice(idx, 1)[0];
  writeCollection(KEYS.places, all);
  return removed;
}

// ============================================================
// Saved Calculations
// ============================================================

export function getSavedCalculations() {
  return readCollection(KEYS.savedCalculations);
}

export function createSavedCalculation(payload) {
  const all = getSavedCalculations();
  const calc = {
    ...payload,
    id: payload.id || generateId("calc"),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  all.push(calc);
  writeCollection(KEYS.savedCalculations, all);
  return calc;
}

export function updateSavedCalculation(id, payload) {
  const all = getSavedCalculations();
  const idx = all.findIndex((c) => c.id === id);
  if (idx === -1) throw new Error("Saved calculation not found");
  all[idx] = { ...all[idx], ...payload, id, updatedAt: nowIso() };
  writeCollection(KEYS.savedCalculations, all);
  return all[idx];
}

export function deleteSavedCalculation(id) {
  const all = getSavedCalculations();
  const idx = all.findIndex((c) => c.id === id);
  if (idx === -1) throw new Error("Saved calculation not found");
  const removed = all.splice(idx, 1)[0];
  writeCollection(KEYS.savedCalculations, all);
  return removed;
}

// ============================================================
// Summary
// ============================================================

/**
 * Phase 4+ Mode Separation (Sesija A2): accepts optional `mode` arg
 * to scope the summary to Personal or Business records. When mode
 * is null/undefined, returns aggregate over ALL records (legacy
 * behavior — used by callers that haven't been mode-aware yet,
 * e.g., direct apiService.getSummary callers without a mode hint).
 */
export function getSummary(mode) {
  const transactions = filterByMode(getTransactions(), mode);
  const income = transactions
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const expenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + Number(t.amount || 0), 0);

  return {
    income: Math.round(income * 100) / 100,
    expenses: Math.round(expenses * 100) / 100,
    balance: Math.round((income - expenses) * 100) / 100,
    count: transactions.length,
    transactions,
  };
}

// ============================================================
// Export all transactions
// ============================================================

export function exportTransactions() {
  const transactions = getTransactions();
  return {
    filename: "besafe-transactions-export.json",
    type: "application/json",
    content: JSON.stringify({ exportedAt: nowIso(), count: transactions.length, transactions }, null, 2),
  };
}

// ============================================================
// Health check
// ============================================================

export function health() {
  return { ok: true, service: "BeSafe LocalDB", timestamp: nowIso() };
}
