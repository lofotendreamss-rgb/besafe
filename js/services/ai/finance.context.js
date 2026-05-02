/**
 * BeSafe Finance Context Builder
 *
 * Assembles a structured snapshot of the user's local finance data
 * (transactions, categories, places) for downstream use by the AI
 * assistant.
 *
 * IMPORTANT — this module NEVER transmits data anywhere. It only
 * reads from localStorage via local.db.js and returns a plain JS
 * object. The network call lives in smart-assistant.js, which will
 * decide what to include in the /api/chat request body on the
 * user's behalf. This separation keeps the "gather" step trivially
 * testable and the "send" step auditable in exactly one place.
 *
 * Returned shape is deterministic even when localStorage is empty —
 * every numeric field defaults to 0, every array field to [] — so
 * callers never need null-guarding. On catastrophic failure (e.g.
 * localStorage access throws in private browsing) a warning is
 * logged and the empty structure is returned; the surrounding SPA
 * keeps running.
 */

import {
  getTransactions,
  getCategories,
  getPlaces,
  filterByMode,
} from "../data/local.db.js";
import { getUserPlan } from "../finance/user-plan.js";

// ============================================================
// Constants
// ============================================================

const DEFAULT_CURRENCY                = "EUR";
const TOP_CATEGORIES_CURRENT_MONTH    = 10;
const TOP_CATEGORIES_90_DAYS          = 5;
const RECENT_TRANSACTIONS_LIMIT       = 10;
const MS_PER_DAY                      = 24 * 60 * 60 * 1000;

// ============================================================
// Empty-state builders — used both by the fallback path and to
// keep the happy-path output shape consistent.
// ============================================================

function emptyPeriod(label) {
  return {
    label,
    income:           0,
    expenses:         0,
    balance:          0,
    transactionCount: 0,
    byCategory:       [],
  };
}

function emptyLast90Days() {
  return {
    income:             0,
    expenses:           0,
    balance:            0,
    transactionCount:   0,
    avgMonthlyExpenses: 0,
    topCategories:      [],
  };
}

function emptyContext(currency) {
  const now = new Date();
  return {
    currency,
    generatedAt:            now.toISOString(),
    currentMonth:           emptyPeriod(monthLabel(now)),
    previousMonth:          emptyPeriod(monthLabel(previousMonthDate(now))),
    last90Days:             emptyLast90Days(),
    recentTransactions:     [],
    customCategoriesCount:  0,
    totalTransactionsCount: 0,
  };
}

// ============================================================
// Date helpers — all UTC so month boundaries match DB conventions.
// ============================================================

function monthLabel(date) {
  // ISO YYYY-MM in UTC (takes advantage of toISOString normalisation).
  return date.toISOString().slice(0, 7);
}

function previousMonthDate(date) {
  // Day 1 of the previous month in UTC. Day-of-month choice is
  // irrelevant — only year/month are read downstream.
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
}

function transactionDateString(tx) {
  // Prefer financialDate (user's intent) over date (entry timestamp).
  // Both are stored as YYYY-MM-DD strings by local.db.js.
  if (typeof tx?.financialDate === "string" && tx.financialDate) {
    return tx.financialDate;
  }
  if (typeof tx?.date === "string" && tx.date) {
    return tx.date;
  }
  return "";
}

function round2(value) {
  // Currency-safe rounding. Float summation accumulates errors past
  // ~16 digits — rounding at aggregation boundaries keeps outputs
  // stable to two decimals.
  return Math.round(Number(value) * 100) / 100;
}

// ============================================================
// Category resolution
// ============================================================

function resolveCategoryLabel(tx, customById) {
  // 1. categoryId → custom category name (if found).
  if (tx?.categoryId && customById.has(tx.categoryId)) {
    const custom = customById.get(tx.categoryId);
    if (custom?.name) return String(custom.name);
  }
  // 2. Fall back to the raw enum string. Backend does any translation.
  if (typeof tx?.category === "string" && tx.category) {
    return tx.category;
  }
  return "other";
}

function resolveCategoryKey(tx) {
  // Stable grouping key. Custom categories are namespaced separately
  // so they never collide with enum categories of the same display
  // name.
  if (tx?.categoryId) return "custom:" + tx.categoryId;
  if (typeof tx?.category === "string" && tx.category) {
    return "enum:" + tx.category;
  }
  return "enum:other";
}

function aggregateByCategory(transactions, customById, limit) {
  // Map<key, { category, label, amount, count }>
  const agg = new Map();
  for (const tx of transactions) {
    const key = resolveCategoryKey(tx);
    const amt = Number(tx?.amount || 0);
    const existing = agg.get(key);
    if (existing) {
      existing.amount += amt;
      existing.count  += 1;
    } else {
      agg.set(key, {
        category: typeof tx?.category === "string" && tx.category ? tx.category : "other",
        label:    resolveCategoryLabel(tx, customById),
        amount:   amt,
        count:    1,
      });
    }
  }
  return Array.from(agg.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit)
    .map((row) => ({
      category: row.category,
      label:    row.label,
      amount:   round2(row.amount),
      count:    row.count,
    }));
}

// ============================================================
// Period summariser
// ============================================================

function summarizePeriod(transactions, label, customById, topLimit) {
  let income   = 0;
  let expenses = 0;
  const expenseTxs = [];
  for (const tx of transactions) {
    const amt = Number(tx?.amount || 0);
    if (tx?.type === "income") {
      income += amt;
    } else if (tx?.type === "expense") {
      expenses += amt;
      expenseTxs.push(tx);
    }
  }
  return {
    label,
    income:           round2(income),
    expenses:         round2(expenses),
    balance:          round2(income - expenses),
    transactionCount: transactions.length,
    byCategory:       aggregateByCategory(expenseTxs, customById, topLimit),
  };
}

// ============================================================
// Public API
// ============================================================

/**
 * Build a finance context snapshot from local storage.
 *
 * @param {object} [options]
 * @param {string} [options.currency="EUR"] ISO 4217 currency code. Only
 *   used as a hint in the output — the function does not convert
 *   amounts; sums respect whatever currency each transaction carries.
 * @returns {{
 *   currency: string,
 *   generatedAt: string,
 *   currentMonth: {
 *     label: string, income: number, expenses: number, balance: number,
 *     transactionCount: number,
 *     byCategory: Array<{category: string, label: string, amount: number, count: number}>
 *   },
 *   previousMonth: object,
 *   last90Days: {
 *     income: number, expenses: number, balance: number,
 *     transactionCount: number, avgMonthlyExpenses: number,
 *     topCategories: Array<object>
 *   },
 *   recentTransactions: Array<{
 *     id: string, type: string, amount: number, category: string,
 *     categoryLabel: string, date: string, note: string,
 *     placeName: string | null
 *   }>,
 *   customCategoriesCount: number,
 *   totalTransactionsCount: number,
 * }}
 */
export function buildFinanceContext(options = {}) {
  const currency = typeof options?.currency === "string" && options.currency
    ? options.currency
    : DEFAULT_CURRENCY;

  // Phase 4+ Mode Separation (Sesija A2): scope to active plan mode
  // unless caller explicitly passes options.mode (including null for
  // unfiltered, used by admin/debug paths). Q4 of mode separation
  // principle — AI sees only active mode's data, never cross-mode.
  const mode = options && options.hasOwnProperty("mode") ? options.mode : getUserPlan();

  try {
    const rawTx   = getTransactions();
    const rawCat  = getCategories();
    const rawPl   = getPlaces();

    const transactions = filterByMode(Array.isArray(rawTx)  ? rawTx  : [], mode);
    const categories   = filterByMode(Array.isArray(rawCat) ? rawCat : [], mode);
    const places       = filterByMode(Array.isArray(rawPl)  ? rawPl  : [], mode);

    // O(1) lookups by id.
    const customById = new Map(
      categories.filter((c) => c?.id).map((c) => [c.id, c])
    );
    const placesById = new Map(
      places.filter((p) => p?.id).map((p) => [p.id, p])
    );

    // Date boundaries (UTC).
    const now              = new Date();
    const currentLabel     = monthLabel(now);
    const prevLabel        = monthLabel(previousMonthDate(now));
    const ninetyCutoffStr  = new Date(now.getTime() - 90 * MS_PER_DAY)
      .toISOString()
      .slice(0, 10);

    // Single-pass partition — avoids iterating transactions three times.
    const current  = [];
    const previous = [];
    const last90   = [];
    for (const tx of transactions) {
      const dateStr = transactionDateString(tx);
      if (!dateStr) continue;
      const ym = dateStr.slice(0, 7);
      if (ym === currentLabel) current.push(tx);
      if (ym === prevLabel)    previous.push(tx);
      if (dateStr >= ninetyCutoffStr) last90.push(tx);
    }

    const currentMonth = summarizePeriod(
      current, currentLabel, customById, TOP_CATEGORIES_CURRENT_MONTH,
    );
    const previousMonth = summarizePeriod(
      previous, prevLabel, customById, TOP_CATEGORIES_CURRENT_MONTH,
    );

    // Last 90 days — same fields as a period + avgMonthlyExpenses and
    // the renamed `topCategories` instead of `byCategory`.
    let l90Income   = 0;
    let l90Expenses = 0;
    const l90ExpenseTxs = [];
    for (const tx of last90) {
      const amt = Number(tx?.amount || 0);
      if (tx?.type === "income") {
        l90Income += amt;
      } else if (tx?.type === "expense") {
        l90Expenses += amt;
        l90ExpenseTxs.push(tx);
      }
    }
    const last90Days = {
      income:             round2(l90Income),
      expenses:           round2(l90Expenses),
      balance:            round2(l90Income - l90Expenses),
      transactionCount:   last90.length,
      avgMonthlyExpenses: round2(l90Expenses / 3),
      topCategories:      aggregateByCategory(l90ExpenseTxs, customById, TOP_CATEGORIES_90_DAYS),
    };

    // Recent transactions — date DESC, tiebreak by updatedAt DESC.
    const sorted = [...transactions].sort((a, b) => {
      const da = transactionDateString(a);
      const db = transactionDateString(b);
      if (da !== db) return db.localeCompare(da);
      const ua = typeof a?.updatedAt === "string" ? a.updatedAt : "";
      const ub = typeof b?.updatedAt === "string" ? b.updatedAt : "";
      return ub.localeCompare(ua);
    });
    const recentTransactions = sorted
      .slice(0, RECENT_TRANSACTIONS_LIMIT)
      .map((tx) => {
        const placeName = tx?.placeId && placesById.has(tx.placeId)
          ? (placesById.get(tx.placeId)?.name ?? null)
          : null;
        return {
          id:            typeof tx?.id === "string" ? tx.id : null,
          type:          tx?.type === "income" ? "income" : "expense",
          amount:        round2(Number(tx?.amount || 0)),
          category:      typeof tx?.category === "string" && tx.category ? tx.category : "other",
          categoryLabel: resolveCategoryLabel(tx, customById),
          date:          transactionDateString(tx),
          note:          typeof tx?.note === "string" ? tx.note : "",
          placeName,
        };
      });

    return {
      currency,
      generatedAt:            new Date().toISOString(),
      currentMonth,
      previousMonth,
      last90Days,
      recentTransactions,
      customCategoriesCount:  categories.length,
      totalTransactionsCount: transactions.length,
    };
  } catch (err) {
    console.warn("[FinanceContext]", err);
    return emptyContext(currency);
  }
}
