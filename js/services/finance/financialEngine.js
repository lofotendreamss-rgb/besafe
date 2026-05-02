import { filterByMode } from "../data/local.db.js";
import { getUserPlan } from "./user-plan.js";

export class FinancialEngine {
  constructor({ transactionService } = {}) {
    this.transactionService = transactionService;
  }

  ensureTransactionService() {
    if (!this.transactionService) {
      throw new Error("Nepavyko pasiekti transakcijų paslaugos.");
    }

    if (typeof this.transactionService.getTransactions !== "function") {
      throw new Error("Transakcijų paslauga šiuo metu neparuošta darbui.");
    }
  }

  normalizeNumber(value) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return 0;
    }

    return Number(numericValue.toFixed(2));
  }

  normalizeText(value, fallback = "") {
    if (typeof value !== "string") {
      return fallback;
    }

    const normalized = value.trim();
    return normalized || fallback;
  }

  normalizeOptionalId(value) {
    const normalized = String(value ?? "").trim();
    return normalized || null;
  }

  normalizeType(value) {
    if (value === "income") return "income";
    if (value === "expense") return "expense";
    return "unknown";
  }

  normalizeCategory(value) {
    return this.normalizeText(value, "other").toLowerCase();
  }

  normalizeCategoryDetail(value, category = "other") {
    const normalized = this.normalizeText(value, "");
    return category === "other" ? normalized : "";
  }

  normalizeDate(value) {
    if (typeof value !== "string" || !value.trim()) {
      return "";
    }

    const trimmed = value.trim();
    const parsed = new Date(trimmed);

    if (Number.isNaN(parsed.getTime())) {
      return "";
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    return parsed.toISOString().slice(0, 10);
  }

  normalizeCurrency(value) {
    return this.normalizeText(value, "EUR").toUpperCase();
  }

  normalizeLocale(value) {
    return this.normalizeText(value, "en").toLowerCase();
  }

  normalizeMeta(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
    );
  }

  normalizeReceipt(receipt = {}) {
    if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
      return null;
    }

    return {
      receiptId: this.normalizeText(receipt.receiptId, ""),
      source: this.normalizeText(receipt.source, ""),
      placeId: this.normalizeOptionalId(receipt.placeId),
      storeName: this.normalizeText(receipt.storeName, ""),
      purchaseDate: this.normalizeDate(receipt.purchaseDate),
      totalAmount: this.normalizeNumber(receipt.totalAmount),
      currency: this.normalizeCurrency(receipt.currency),
      locale: this.normalizeLocale(receipt.locale),
      rawText: this.normalizeText(receipt.rawText, ""),
      scanConfidence: this.normalizeText(receipt.scanConfidence, ""),
      userConfirmed:
        typeof receipt.userConfirmed === "boolean" ? receipt.userConfirmed : null,
      items: Array.isArray(receipt.items) ? receipt.items : [],
      categorySummary: Array.isArray(receipt.categorySummary)
        ? receipt.categorySummary
            .map((item) => {
              if (!item || typeof item !== "object") return null;

              const category = this.normalizeCategory(item.category);
              const amount = this.normalizeNumber(item.amount);

              return {
                category,
                amount,
              };
            })
            .filter(Boolean)
        : [],
    };
  }

  getTransactionDateValue(input = {}) {
    return this.normalizeDate(input?.financialDate || input?.date);
  }

  normalizeTransaction(input = {}) {
    const type = this.normalizeType(input?.type);
    const amount = Math.abs(this.normalizeNumber(input?.amount));
    const category = this.normalizeCategory(input?.category);
    const categoryDetail = this.normalizeCategoryDetail(
      input?.categoryDetail || input?.subcategory || input?.detail || "",
      category
    );
    const note = this.normalizeText(input?.note, "");
    const financialDate = this.getTransactionDateValue(input);
    const currency = this.normalizeCurrency(input?.currency);
    const locale = this.normalizeLocale(input?.locale);
    const placeId = this.normalizeOptionalId(input?.placeId);
    const meta = this.normalizeMeta(input?.meta);
    const receipt = this.normalizeReceipt(input?.receipt);

    const normalized = {
      ...input,
      type,
      amount,
      category,
      note,
      date: financialDate,
      financialDate,
      currency,
      locale,
      placeId,
      meta,
      receipt,
    };

    if (categoryDetail) {
      normalized.categoryDetail = categoryDetail;
    } else {
      delete normalized.categoryDetail;
    }

    return normalized;
  }

  sortTransactionsByDateDesc(transactions = []) {
    return [...transactions].sort((a, b) => {
      const aTime = new Date(this.getTransactionDateValue(a) || 0).getTime();
      const bTime = new Date(this.getTransactionDateValue(b) || 0).getTime();

      if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
      if (Number.isNaN(aTime)) return 1;
      if (Number.isNaN(bTime)) return -1;

      return bTime - aTime;
    });
  }

  buildTotals(transactions = []) {
    return transactions.reduce(
      (summary, transaction) => {
        const amount = Math.abs(this.normalizeNumber(transaction?.amount));

        if (transaction?.type === "income") {
          summary.income += amount;
          summary.incomeCount += 1;
        } else if (transaction?.type === "expense") {
          summary.expenses += amount;
          summary.expenseCount += 1;
        }

        summary.transactionCount += 1;
        return summary;
      },
      {
        income: 0,
        expenses: 0,
        transactionCount: 0,
        incomeCount: 0,
        expenseCount: 0,
      }
    );
  }

  buildExpenseCategories(transactions = []) {
    const grouped = transactions.reduce((accumulator, transaction) => {
      if (transaction?.type !== "expense") {
        return accumulator;
      }

      const categoryKey = this.normalizeCategory(transaction?.category);
      const amount = Math.abs(this.normalizeNumber(transaction?.amount));

      accumulator[categoryKey] = (accumulator[categoryKey] || 0) + amount;
      return accumulator;
    }, {});

    return Object.entries(grouped)
      .map(([category, amount]) => ({
        category,
        amount: Number(amount.toFixed(2)),
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  buildExpensePlaces(transactions = []) {
    const grouped = transactions.reduce((accumulator, transaction) => {
      if (transaction?.type !== "expense") {
        return accumulator;
      }

      const placeId =
        this.normalizeOptionalId(transaction?.placeId) ||
        this.normalizeOptionalId(transaction?.receipt?.placeId);

      if (!placeId) {
        return accumulator;
      }

      const amount = Math.abs(this.normalizeNumber(transaction?.amount));
      const storeName = this.normalizeText(transaction?.receipt?.storeName, "");

      if (!accumulator[placeId]) {
        accumulator[placeId] = {
          placeId,
          amount: 0,
          transactionCount: 0,
          lastUsedDate: "",
          storeName,
        };
      }

      accumulator[placeId].amount += amount;
      accumulator[placeId].transactionCount += 1;

      const dateValue = this.getTransactionDateValue(transaction);
      if (
        dateValue &&
        (!accumulator[placeId].lastUsedDate ||
          dateValue > accumulator[placeId].lastUsedDate)
      ) {
        accumulator[placeId].lastUsedDate = dateValue;
      }

      if (!accumulator[placeId].storeName && storeName) {
        accumulator[placeId].storeName = storeName;
      }

      return accumulator;
    }, {});

    return Object.values(grouped)
      .map((item) => ({
        placeId: item.placeId,
        storeName: item.storeName || "",
        amount: Number(item.amount.toFixed(2)),
        transactionCount: item.transactionCount,
        lastUsedDate: item.lastUsedDate || "",
      }))
      .sort((a, b) => {
        if (b.amount !== a.amount) {
          return b.amount - a.amount;
        }

        return b.transactionCount - a.transactionCount;
      });
  }

  buildTopExpenseCategory(transactions = []) {
    const expenseCategories = this.buildExpenseCategories(transactions);

    if (!expenseCategories.length) {
      return null;
    }

    return expenseCategories[0];
  }

  buildTopExpensePlace(transactions = []) {
    const expensePlaces = this.buildExpensePlaces(transactions);

    if (!expensePlaces.length) {
      return null;
    }

    return expensePlaces[0];
  }

  buildRecentTransactions(transactions = [], limit = 5) {
    return this.sortTransactionsByDateDesc(transactions)
      .slice(0, limit)
      .map((transaction) => this.normalizeTransaction(transaction));
  }

  normalizeDateInput(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }

    const normalized = this.normalizeDate(
      typeof value === "string" ? value : ""
    );

    if (!normalized) {
      return null;
    }

    const parsed = new Date(`${normalized}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  formatDateToIso(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return "";
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  createPeriodRange(period = "currentMonth", options = {}) {
    const today = this.normalizeDateInput(options.today) || new Date();
    const normalizedPeriod = this.normalizeText(period, "currentMonth");

    let startDate = null;
    let endDate = null;

    if (normalizedPeriod === "currentMonth") {
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else if (normalizedPeriod === "lastMonth") {
      startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      endDate = new Date(today.getFullYear(), today.getMonth(), 0);
    } else if (normalizedPeriod === "currentYear") {
      startDate = new Date(today.getFullYear(), 0, 1);
      endDate = new Date(today.getFullYear(), 11, 31);
    } else if (normalizedPeriod === "custom") {
      const customStart = this.normalizeDateInput(options.startDate);
      const customEnd = this.normalizeDateInput(options.endDate);

      if (!customStart || !customEnd) {
        return {
          period: "custom",
          startDate: "",
          endDate: "",
          valid: false,
        };
      }

      startDate = customStart;
      endDate = customEnd;
    } else {
      return this.createPeriodRange("currentMonth", options);
    }

    if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
      return {
        period: normalizedPeriod,
        startDate: "",
        endDate: "",
        valid: false,
      };
    }

    if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) {
      return {
        period: normalizedPeriod,
        startDate: "",
        endDate: "",
        valid: false,
      };
    }

    if (startDate.getTime() > endDate.getTime()) {
      return {
        period: normalizedPeriod,
        startDate: "",
        endDate: "",
        valid: false,
      };
    }

    return {
      period: normalizedPeriod,
      startDate: this.formatDateToIso(startDate),
      endDate: this.formatDateToIso(endDate),
      valid: true,
    };
  }

  isTransactionInPeriod(transaction = {}, range = {}) {
    if (!range?.valid) {
      return false;
    }

    const transactionDate = this.getTransactionDateValue(transaction);
    if (!transactionDate) {
      return false;
    }

    return transactionDate >= range.startDate && transactionDate <= range.endDate;
  }

  filterTransactionsByPeriod(transactions = [], period = "currentMonth", options = {}) {
    const range = this.createPeriodRange(period, options);

    if (!range.valid) {
      return {
        period: range.period,
        startDate: range.startDate,
        endDate: range.endDate,
        transactions: [],
        valid: false,
      };
    }

    const filteredTransactions = transactions.filter((transaction) =>
      this.isTransactionInPeriod(transaction, range)
    );

    return {
      period: range.period,
      startDate: range.startDate,
      endDate: range.endDate,
      transactions: this.sortTransactionsByDateDesc(filteredTransactions),
      valid: true,
    };
  }

  buildSummaryFromTransactions(transactions = [], options = {}) {
    const safeTransactions = Array.isArray(transactions)
      ? transactions.map((transaction) => this.normalizeTransaction(transaction))
      : [];

    const sortedTransactions = this.sortTransactionsByDateDesc(safeTransactions);
    const totals = this.buildTotals(sortedTransactions);

    const income = Number(totals.income.toFixed(2));
    const expenses = Number(totals.expenses.toFixed(2));
    const balance = Number((income - expenses).toFixed(2));
    const transactionCount = totals.transactionCount;
    const incomeCount = totals.incomeCount;
    const expenseCount = totals.expenseCount;
    const recentTransactions = this.buildRecentTransactions(
      sortedTransactions,
      options.recentLimit ?? 5
    );
    const expenseCategories = this.buildExpenseCategories(sortedTransactions);
    const topExpenseCategory = expenseCategories[0] || null;
    const expensePlaces = this.buildExpensePlaces(sortedTransactions);
    const topExpensePlace = expensePlaces[0] || null;
    const primaryCurrency = this.resolvePrimaryCurrency(sortedTransactions);
    const primaryLocale = this.resolvePrimaryLocale(sortedTransactions);

    return {
      income,
      expenses,
      balance,
      transactionCount,
      incomeCount,
      expenseCount,
      recentTransactions,
      expenseCategories,
      topExpenseCategory,
      expensePlaces,
      topExpensePlace,
      currency: primaryCurrency,
      locale: primaryLocale,
    };
  }

  resolvePrimaryCurrency(transactions = []) {
    const firstWithCurrency = transactions.find((transaction) =>
      this.normalizeText(transaction?.currency, "")
    );

    return this.normalizeCurrency(firstWithCurrency?.currency);
  }

  resolvePrimaryLocale(transactions = []) {
    const firstWithLocale = transactions.find((transaction) =>
      this.normalizeText(transaction?.locale, "")
    );

    return this.normalizeLocale(firstWithLocale?.locale);
  }

  buildReportSummary(transactions = [], period = "currentMonth", options = {}) {
    const normalizedTransactions = Array.isArray(transactions)
      ? transactions.map((transaction) => this.normalizeTransaction(transaction))
      : [];

    const filtered = this.filterTransactionsByPeriod(
      normalizedTransactions,
      period,
      options
    );

    const summary = this.buildSummaryFromTransactions(filtered.transactions, {
      recentLimit: options.recentLimit ?? 5,
    });

    return {
      period: filtered.period,
      startDate: filtered.startDate,
      endDate: filtered.endDate,
      validPeriod: filtered.valid,
      ...summary,
    };
  }

  async getReportSummary(period = "currentMonth", options = {}) {
    this.ensureTransactionService();

    // Phase 4+ Mode Separation (Sesija A2): scope to active plan
    // mode unless caller explicitly passes options.mode (including
    // null/undefined for unfiltered, e.g., admin/debug paths).
    const mode = options.hasOwnProperty("mode") ? options.mode : getUserPlan();

    const rawTransactions = await this.transactionService.getTransactions();
    const filteredTransactions = filterByMode(rawTransactions, mode);
    const safeTransactions = Array.isArray(filteredTransactions)
      ? filteredTransactions.map((transaction) => this.normalizeTransaction(transaction))
      : [];

    return this.buildReportSummary(safeTransactions, period, options);
  }

  async getSummary(modeArg) {
    this.ensureTransactionService();

    // Phase 4+ Mode Separation (Sesija A2): scope to active plan
    // mode unless caller explicitly passes a mode arg. Pass null
    // explicitly for unfiltered (admin/debug only).
    const mode = arguments.length > 0 ? modeArg : getUserPlan();

    const rawTransactions = await this.transactionService.getTransactions();
    const filteredTransactions = filterByMode(rawTransactions, mode);
    const safeTransactions = Array.isArray(filteredTransactions)
      ? filteredTransactions.map((transaction) => this.normalizeTransaction(transaction))
      : [];

    return this.buildSummaryFromTransactions(safeTransactions);
  }
}