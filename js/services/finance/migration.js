/**
 * BeSafe Finance Migrations — Phase 4 Sesija 0b (2026-04-30)
 *
 * One-shot data migrations that run at app boot to bring existing
 * localStorage data up to the current schema. All migrations here MUST
 * be idempotent — safe to call on every boot, no-op when data is
 * already in target shape.
 *
 * Strategy: per-record check (not a "migration done" flag).
 * Rationale: a flag in localStorage can desync from data state if the
 * user clears storage selectively, switches license keys (which BeSafe
 * does — see local.db.js getLicenseKey), or restores a backup. A
 * per-record check stays correct in all those scenarios at the cost of
 * iterating the tx list once per boot. For a personal-finance dataset
 * (~10–1000 transactions) the iteration is cheap.
 *
 * Currently here:
 *   • runCurrencyMigration() — backfill `currency` field on
 *     pre-Phase-4 transactions.
 *
 * Future migrations should follow the same pattern: pure function,
 * idempotent, returns count of records touched, never throws (logs
 * warnings instead).
 */

import { getTransactions, updateTransaction } from "../data/local.db.js";
import { getUserCurrency } from "./currency.js";

/**
 * Backfill the `currency` field on any transaction created before
 * Phase 4 currency support landed.
 *
 * Behaviour:
 *   • Reads all transactions via local.db.getTransactions()
 *   • For each transaction lacking a non-empty string `currency`,
 *     sets it to `getUserCurrency()` (which itself falls back to
 *     "EUR" when the user has no explicit preference)
 *   • Uses updateTransaction so the write goes through local.db's
 *     normal path (timestamps, license-keyed storage). updatedAt
 *     gets bumped on backfilled rows the first time — but since
 *     subsequent runs find no candidates, idempotency holds.
 *   • Per-tx try/catch isolates failures (e.g., rare tx without id)
 *     so one bad record doesn't abort the whole migration.
 *
 * @returns {number} count of transactions backfilled this invocation
 *   (0 when nothing to do — including first-run users with no
 *   transactions at all)
 */
export function runCurrencyMigration() {
  const transactions = getTransactions();
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return 0;
  }

  const candidates = transactions.filter(
    (tx) =>
      tx &&
      tx.id &&
      (!tx.currency ||
        typeof tx.currency !== "string" ||
        !tx.currency.trim())
  );

  if (candidates.length === 0) {
    return 0;
  }

  const userCurrency = getUserCurrency();
  let backfilled = 0;
  for (const tx of candidates) {
    try {
      updateTransaction(tx.id, { currency: userCurrency });
      backfilled++;
    } catch (err) {
      console.warn(
        `[Migration] Could not backfill currency for tx ${tx.id}:`,
        err?.message || err
      );
    }
  }

  if (backfilled > 0) {
    console.info(
      `[Migration] Currency: backfilled ${backfilled}/${transactions.length} transactions to ${userCurrency}`
    );
  }

  return backfilled;
}
