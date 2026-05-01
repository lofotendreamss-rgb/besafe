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

import {
  getTransactions, updateTransaction,
  getCategories, updateCategory,
  getPlaces, updatePlace,
  getSavedCalculations, updateSavedCalculation,
} from "../data/local.db.js";
import { getUserCurrency } from "./currency.js";

const LEGACY_MODE_DEFAULT = "personal";

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

/**
 * Backfill the `mode` field on records created before Phase 4+ Mode
 * Separation landed (Sesija A1, 2026-05-01). Covers four collections:
 * transactions, places, categories, savedCalculations.
 *
 * Behaviour:
 *   • For each collection, iterate records and find those lacking a
 *     non-empty string `mode` field.
 *   • Backfill missing `mode` to "personal" (LEGACY_MODE_DEFAULT).
 *     Hardcoded — NOT getUserPlan() — because legacy records were
 *     created in a no-mode era, and the conservative default is
 *     Personal regardless of the user's current plan choice. If the
 *     user later wants to reclassify, they can do so per-record via
 *     UI (future feature, not this migration's concern).
 *   • Per-record try/catch isolates failures so one bad record
 *     doesn't abort the whole migration. Same idempotency strategy as
 *     runCurrencyMigration: subsequent runs find no candidates.
 *
 * @returns {number} total count of records backfilled across all
 *   four collections this invocation (0 when nothing to do)
 */
export function runModeMigration() {
  const collections = [
    { name: "transactions",      get: getTransactions,      update: updateTransaction      },
    { name: "places",            get: getPlaces,            update: updatePlace            },
    { name: "categories",        get: getCategories,        update: updateCategory         },
    { name: "savedCalculations", get: getSavedCalculations, update: updateSavedCalculation },
  ];

  let totalBackfilled = 0;

  for (const { name, get, update } of collections) {
    let records;
    try {
      records = get();
    } catch (err) {
      console.warn(
        `[Migration] Mode: could not read ${name}:`,
        err?.message || err
      );
      continue;
    }

    if (!Array.isArray(records) || records.length === 0) continue;

    const candidates = records.filter(
      (r) =>
        r &&
        r.id &&
        (!r.mode || typeof r.mode !== "string" || !r.mode.trim())
    );

    if (candidates.length === 0) continue;

    let collectionBackfilled = 0;
    for (const record of candidates) {
      try {
        update(record.id, { mode: LEGACY_MODE_DEFAULT });
        collectionBackfilled++;
      } catch (err) {
        console.warn(
          `[Migration] Could not backfill mode for ${name}/${record.id}:`,
          err?.message || err
        );
      }
    }

    if (collectionBackfilled > 0) {
      console.info(
        `[Migration] Mode: backfilled ${collectionBackfilled}/${records.length} ${name} to "${LEGACY_MODE_DEFAULT}"`
      );
    }

    totalBackfilled += collectionBackfilled;
  }

  return totalBackfilled;
}
