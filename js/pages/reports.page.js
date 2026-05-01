import { createTranslator, getCurrentLanguage } from "../core/i18n.js";
import { registry } from "../core/service.registry.js";
import { generateReportPDF, generateSavedDocumentPDF } from "../utils/pdf-generator.js";
import { getCurrencySymbol, getUserCurrency } from "../services/finance/currency.js";

function getUserPlan() {
  try {
    return localStorage.getItem("besafe:user-plan") || "personal";
  } catch (_error) {
    return "personal";
  }
}

function isBusinessPlan() {
  return getUserPlan() === "business";
}

export class ReportsPage {
  constructor({ financialEngine } = {}) {
    this.financialEngine = financialEngine;
    this.transactionService = null;
    this.currentSummary = null;
    this.currentPeriod = "currentMonth";
    this.exportStatus = {
      type: "idle",
      message: "",
    };
    this.placesIndex = new Map();
    this.savedCalculations = [];
    this.container = null;

    this.handleClick = this.handleClick.bind(this);
  }

  getTranslator() {
    return createTranslator(getCurrentLanguage());
  }

  t(key, fallback) {
    if (!this._cachedTranslator || this._cachedLang !== getCurrentLanguage()) {
      this._cachedLang = getCurrentLanguage();
      this._cachedTranslator = this.getTranslator();
    }
    const value = this._cachedTranslator(key);
    return (typeof value === "string" && value.trim() && value !== key) ? value : (fallback || key);
  }

  getTransactionService() {
    if (this.transactionService) {
      return this.transactionService;
    }

    try {
      this.transactionService = registry.get("transactions");
      return this.transactionService;
    } catch (error) {
      console.warn("[ReportsPage] Failed to get transactions service:", error);
      return null;
    }
  }

  escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  normalizeNumber(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  normalizePeriod(value) {
    const allowed = new Set(["currentMonth", "lastMonth", "currentYear"]);
    const normalized = String(value || "").trim();
    return allowed.has(normalized) ? normalized : "currentMonth";
  }

  normalizeText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  getPlaceId(place = {}) {
    return this.normalizeText(place?.placeId || place?.id);
  }

  getBestPlaceLabelFromRecord(place = {}) {
    const candidates = [
      place?.name,
      place?.title,
      place?.merchantName,
      place?.stationName,
      place?.storeName,
      place?.displayName,
      place?.label,
      place?.placeName,
      place?.meta?.placeName,
      place?.receipt?.storeName,
    ];

    for (const candidate of candidates) {
      const safeValue = this.normalizeText(candidate);
      if (safeValue) {
        return safeValue;
      }
    }

    return "";
  }

  async loadPlacesIndex() {
    const transactionService = this.getTransactionService();
    this.placesIndex = new Map();

    if (
      !transactionService ||
      typeof transactionService.getPlaces !== "function"
    ) {
      return this.placesIndex;
    }

    try {
      const places = await transactionService.getPlaces();
      if (!Array.isArray(places)) {
        return this.placesIndex;
      }

      for (const place of places) {
        const placeId = this.getPlaceId(place);
        if (!placeId) continue;

        this.placesIndex.set(placeId, place);
      }
    } catch (error) {
      console.warn("[ReportsPage] Failed to load places index:", error);
    }

    return this.placesIndex;
  }

  resolvePlaceDisplayName(place = {}) {
    const directLabel = this.getBestPlaceLabelFromRecord(place);
    if (directLabel) {
      return directLabel;
    }

    const placeId = this.getPlaceId(place);
    if (placeId && this.placesIndex.has(placeId)) {
      const indexedPlace = this.placesIndex.get(placeId);
      const indexedLabel = this.getBestPlaceLabelFromRecord(indexedPlace);
      if (indexedLabel) {
        return indexedLabel;
      }
    }

    return placeId || "";
  }

  formatAmount(amount, currency = "EUR", locale = "en") {
    const numericAmount = this.normalizeNumber(amount);
    const safeCurrency =
      String(currency || "EUR").trim().toUpperCase() || "EUR";
    const safeLocale = String(locale || "en").trim() || "en";

    try {
      return new Intl.NumberFormat(safeLocale, {
        style: "currency",
        currency: safeCurrency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(numericAmount);
    } catch (_error) {
      try {
        return new Intl.NumberFormat("en", {
          style: "currency",
          currency: safeCurrency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(numericAmount);
      } catch (_nestedError) {
        return `${safeCurrency} ${numericAmount.toFixed(2)}`;
      }
    }
  }

  formatDate(value, locale = "en") {
    const safeValue = this.normalizeText(value);
    if (!safeValue) {
      return "";
    }

    const date = new Date(safeValue);
    if (Number.isNaN(date.getTime())) {
      return safeValue;
    }

    try {
      return new Intl.DateTimeFormat(locale || "en", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(date);
    } catch (_error) {
      return safeValue;
    }
  }

  getCategoryLabel(categoryKey) {
    const t = this.getTranslator();
    const normalized = String(categoryKey || "").trim().toLowerCase();

    if (!normalized) {
      return t("reports.summary.noCategory", "No category yet");
    }

    return t(
      `categories.${normalized}`,
      normalized.charAt(0).toUpperCase() + normalized.slice(1)
    );
  }

  getPeriodLabel(period) {
    const t = this.getTranslator();
    const safePeriod = this.normalizePeriod(period);

    if (safePeriod === "lastMonth") {
      return t("reports.period.lastMonth", "Last month");
    }

    if (safePeriod === "currentYear") {
      return t("reports.period.currentYear", "Current year");
    }

    return t("reports.period.currentMonth", "Current month");
  }

  getEntriesLabel(count) {
    const t = this.getTranslator();
    const safeCount = this.normalizeNumber(count);

    if (safeCount === 1) {
      return t("reports.places.entrySingle", "entry");
    }

    return t("reports.places.entriesPlural", "entries");
  }

  getViewSavedLabel() {
    const t = this.getTranslator();
    return t("reports.saved.view", "View");
  }

  getViewSavedDialogText(item = {}) {
    const t = this.getTranslator();

    const lines = [
      item.title || t("reports.saved.fallbackTitle", "Saved calculation"),
      "",
      `${t("reports.saved.amountLabel", "Amount")}: ${this.formatAmount(
        item.amount,
        item.currency,
        item.locale
      )}`,
    ];

    if (item.createdAt) {
      lines.push(
        `${t("reports.saved.dateLabel", "Date")}: ${this.formatDate(
          item.createdAt,
          item.locale
        )}`
      );
    }

    if (item.period) {
      lines.push(
        `${t("reports.saved.periodLabel", "Period")}: ${this.getPeriodLabel(
          item.period
        )}`
      );
    }

    if (item.formula) {
      lines.push(
        `${t("reports.saved.formulaLabel", "Formula")}: ${item.formula}`
      );
    }

    if (item.note) {
      lines.push(`${t("reports.saved.noteLabel", "Note")}: ${item.note}`);
    }

    return lines.join("\n");
  }

  buildSafeFallbackSummary() {
    return {
      period: this.currentPeriod,
      startDate: "",
      endDate: "",
      validPeriod: false,
      income: 0,
      expenses: 0,
      balance: 0,
      transactionCount: 0,
      incomeCount: 0,
      expenseCount: 0,
      recentTransactions: [],
      expenseCategories: [],
      topExpenseCategory: null,
      expensePlaces: [],
      topExpensePlace: null,
      incomePlaces: [],
      topIncomePlace: null,
      currency: "EUR",
      locale: getCurrentLanguage() || "en",
    };
  }

  async loadSummary() {
    if (
      !this.financialEngine ||
      typeof this.financialEngine.getReportSummary !== "function"
    ) {
      return this.buildSafeFallbackSummary();
    }

    try {
      const summary = await this.financialEngine.getReportSummary(
        this.currentPeriod
      );

      if (!summary || typeof summary !== "object") {
        return this.buildSafeFallbackSummary();
      }

      return {
        ...this.buildSafeFallbackSummary(),
        ...summary,
      };
    } catch (error) {
      console.warn("[ReportsPage] Failed to load report summary:", error);
      return this.buildSafeFallbackSummary();
    }
  }

  normalizeSavedCalculation(item = {}) {
    const locale = getCurrentLanguage() || "en";
    const title =
      this.normalizeText(item?.title) ||
      this.normalizeText(item?.name) ||
      this.normalizeText(item?.label) ||
      this.normalizeText(item?.resultName) ||
      "Saved calculation";

    const amount =
      item?.result ??
      item?.total ??
      item?.amount ??
      item?.value ??
      item?.finalAmount ??
      0;

    const currency =
      this.normalizeText(item?.currency) ||
      this.normalizeText(item?.resultCurrency) ||
      "EUR";

    const createdAt =
      this.normalizeText(item?.createdAt) ||
      this.normalizeText(item?.savedAt) ||
      this.normalizeText(item?.date) ||
      "";

    const period =
      this.normalizeText(item?.period) ||
      this.normalizeText(item?.periodKey) ||
      "";

    const formula =
      this.normalizeText(item?.formulaLabel) ||
      this.normalizeText(item?.formula) ||
      this.normalizeText(item?.calculationType) ||
      "";

    const note =
      this.normalizeText(item?.note) ||
      this.normalizeText(item?.description) ||
      "";

    const id = this.normalizeText(item?.id);

    return {
      id,
      title,
      amount: this.normalizeNumber(amount),
      currency,
      locale,
      createdAt,
      period,
      formula,
      note,
      raw: item,
    };
  }

  async loadSavedCalculations() {
    const transactionService = this.getTransactionService();
    this.savedCalculations = [];

    if (
      !transactionService ||
      typeof transactionService.getSavedCalculations !== "function"
    ) {
      return this.savedCalculations;
    }

    try {
      const items = await transactionService.getSavedCalculations();
      if (!Array.isArray(items)) {
        return this.savedCalculations;
      }

      this.savedCalculations = items
        .filter((item) => item && typeof item === "object")
        .map((item) => this.normalizeSavedCalculation(item))
        .sort((a, b) => {
          const aTime = new Date(a.createdAt || 0).getTime();
          const bTime = new Date(b.createdAt || 0).getTime();
          return bTime - aTime;
        });

      return this.savedCalculations;
    } catch (error) {
      console.warn("[ReportsPage] Failed to load saved calculations:", error);
      return this.savedCalculations;
    }
  }

  setStatus(type = "idle", message = "") {
    this.exportStatus = {
      type,
      message,
    };
  }

  renderStatus() {
    const message = this.exportStatus?.message || "";
    const type = this.exportStatus?.type || "idle";

    if (!message) {
      return "";
    }

    const statusClass =
      type === "error"
        ? "reports-status reports-status--error"
        : type === "success"
          ? "reports-status reports-status--success"
          : "reports-status reports-status--info";

    return `
      <div class="${statusClass}" role="status" aria-live="polite">
        ${this.escapeHtml(message)}
      </div>
    `;
  }

  getPlaceInfoFromTransaction(transaction = {}) {
    const placeId = this.normalizeText(transaction?.placeId);
    const candidates = [
      transaction?.placeName,
      transaction?.meta?.placeName,
      transaction?.receipt?.storeName,
      transaction?.storeName,
      transaction?.merchantName,
      transaction?.stationName,
      transaction?.title,
      transaction?.name,
    ];

    let displayName = "";
    for (const candidate of candidates) {
      const safeValue = this.normalizeText(candidate);
      if (safeValue) {
        displayName = safeValue;
        break;
      }
    }

    if (!displayName && placeId && this.placesIndex.has(placeId)) {
      displayName = this.getBestPlaceLabelFromRecord(
        this.placesIndex.get(placeId)
      );
    }

    return {
      placeId,
      displayName,
    };
  }

  getTransactionDateValue(transaction = {}) {
    const candidates = [
      transaction?.financialDate,
      transaction?.date,
      transaction?.transactionDate,
      transaction?.createdAt,
      transaction?.meta?.financialDate,
      transaction?.meta?.date,
      transaction?.receipt?.date,
    ];

    for (const candidate of candidates) {
      const safeValue = this.normalizeText(candidate);
      if (!safeValue) {
        continue;
      }

      const parsedDate = new Date(safeValue);
      if (!Number.isNaN(parsedDate.getTime())) {
        return parsedDate;
      }
    }

    return null;
  }

  isTransactionInPeriod(transaction = {}, period = this.currentPeriod) {
    const safePeriod = this.normalizePeriod(period);
    const date = this.getTransactionDateValue(transaction);

    if (!date) {
      return false;
    }

    const year = date.getFullYear();
    const month = date.getMonth();

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    if (safePeriod === "currentYear") {
      return year === currentYear;
    }

    if (safePeriod === "lastMonth") {
      const lastMonthDate = new Date(currentYear, currentMonth - 1, 1);
      return (
        year === lastMonthDate.getFullYear() &&
        month === lastMonthDate.getMonth()
      );
    }

    return year === currentYear && month === currentMonth;
  }

  async loadTransactionsForCurrentPeriod() {
    const transactionService = this.getTransactionService();

    if (
      !transactionService ||
      typeof transactionService.getTransactions !== "function"
    ) {
      return [];
    }

    try {
      const transactions = await transactionService.getTransactions();

      if (!Array.isArray(transactions)) {
        return [];
      }

      return transactions.filter((transaction) => {
        if (!transaction || typeof transaction !== "object") {
          return false;
        }

        return this.isTransactionInPeriod(transaction, this.currentPeriod);
      });
    } catch (error) {
      console.warn(
        "[ReportsPage] Failed to load transactions for places analysis:",
        error
      );
      return [];
    }
  }

  buildExpensePlacesFromTransactions(summary) {
    const transactions = Array.isArray(summary?.transactions)
      ? summary.transactions
      : Array.isArray(summary?.recentTransactions)
        ? summary.recentTransactions
        : [];

    const grouped = new Map();

    for (const transaction of transactions) {
      if (!transaction || typeof transaction !== "object") {
        continue;
      }

      const type = this.normalizeText(transaction?.type).toLowerCase();
      if (type !== "expense") {
        continue;
      }

      const { placeId, displayName } = this.getPlaceInfoFromTransaction(
        transaction
      );
      const key = placeId || this.normalizeText(displayName).toLowerCase();

      if (!key) {
        continue;
      }

      const amount = this.normalizeNumber(transaction?.amount ?? 0);
      const existing = grouped.get(key);

      if (!existing) {
        grouped.set(key, {
          placeId: placeId || "",
          displayName: displayName || placeId || "",
          amount,
          transactionCount: 1,
        });
        continue;
      }

      grouped.set(key, {
        ...existing,
        placeId: existing.placeId || placeId || "",
        displayName: existing.displayName || displayName || placeId || "",
        amount: existing.amount + amount,
        transactionCount: existing.transactionCount + 1,
      });
    }

    return Array.from(grouped.values());
  }

  buildIncomePlacesFromTransactions(summary) {
    const transactions = Array.isArray(summary?.transactions)
      ? summary.transactions
      : Array.isArray(summary?.recentTransactions)
        ? summary.recentTransactions
        : [];

    const grouped = new Map();

    for (const transaction of transactions) {
      if (!transaction || typeof transaction !== "object") {
        continue;
      }

      const type = this.normalizeText(transaction?.type).toLowerCase();
      if (type !== "income") {
        continue;
      }

      const { placeId, displayName } = this.getPlaceInfoFromTransaction(
        transaction
      );
      const key = placeId || this.normalizeText(displayName).toLowerCase();

      if (!key) {
        continue;
      }

      const amount = this.normalizeNumber(transaction?.amount ?? 0);
      const existing = grouped.get(key);

      if (!existing) {
        grouped.set(key, {
          placeId: placeId || "",
          displayName: displayName || placeId || "",
          amount,
          transactionCount: 1,
        });
        continue;
      }

      grouped.set(key, {
        ...existing,
        placeId: existing.placeId || placeId || "",
        displayName: existing.displayName || displayName || placeId || "",
        amount: existing.amount + amount,
        transactionCount: existing.transactionCount + 1,
      });
    }

    return Array.from(grouped.values());
  }

  buildExpensePlaces(summary) {
    const rawPlaces = [];
    const summaryPlaces = Array.isArray(summary?.expensePlaces)
      ? summary.expensePlaces
      : [];
    const transactionPlaces = this.buildExpensePlacesFromTransactions(summary);

    if (
      summary?.topExpensePlace &&
      typeof summary.topExpensePlace === "object"
    ) {
      rawPlaces.push(summary.topExpensePlace);
    }

    for (const place of summaryPlaces) {
      rawPlaces.push(place);
    }

    for (const place of transactionPlaces) {
      rawPlaces.push(place);
    }

    const deduped = new Map();

    for (const place of rawPlaces) {
      if (!place || typeof place !== "object") {
        continue;
      }

      const name = this.resolvePlaceDisplayName(place);
      const placeId = this.getPlaceId(place);
      const key = placeId || this.normalizeText(name).toLowerCase();

      if (!key) {
        continue;
      }

      const existing = deduped.get(key);

      if (!existing) {
        deduped.set(key, {
          ...place,
          placeId: placeId || "",
          displayName: name,
          amount: this.normalizeNumber(place?.amount ?? 0),
          transactionCount: this.normalizeNumber(place?.transactionCount ?? 0),
        });
        continue;
      }

      const nextAmount = this.normalizeNumber(place?.amount ?? 0);
      const nextCount = this.normalizeNumber(place?.transactionCount ?? 0);
      const nextDisplayName = name || existing.displayName;

      deduped.set(key, {
        ...existing,
        ...place,
        placeId: existing.placeId || placeId || "",
        displayName: nextDisplayName,
        amount: Math.max(existing.amount, nextAmount),
        transactionCount: Math.max(existing.transactionCount, nextCount),
      });
    }

    return Array.from(deduped.values()).sort((a, b) => {
      const amountDiff =
        this.normalizeNumber(b?.amount) - this.normalizeNumber(a?.amount);
      if (amountDiff !== 0) {
        return amountDiff;
      }

      return (
        this.normalizeNumber(b?.transactionCount) -
        this.normalizeNumber(a?.transactionCount)
      );
    });
  }

  buildIncomePlaces(summary) {
    const rawPlaces = [];
    const summaryPlaces = Array.isArray(summary?.incomePlaces)
      ? summary.incomePlaces
      : [];
    const transactionPlaces = this.buildIncomePlacesFromTransactions(summary);

    if (summary?.topIncomePlace && typeof summary.topIncomePlace === "object") {
      rawPlaces.push(summary.topIncomePlace);
    }

    for (const place of summaryPlaces) {
      rawPlaces.push(place);
    }

    for (const place of transactionPlaces) {
      rawPlaces.push(place);
    }

    const deduped = new Map();

    for (const place of rawPlaces) {
      if (!place || typeof place !== "object") {
        continue;
      }

      const name = this.resolvePlaceDisplayName(place);
      const placeId = this.getPlaceId(place);
      const key = placeId || this.normalizeText(name).toLowerCase();

      if (!key) {
        continue;
      }

      const existing = deduped.get(key);

      if (!existing) {
        deduped.set(key, {
          ...place,
          placeId: placeId || "",
          displayName: name,
          amount: this.normalizeNumber(place?.amount ?? 0),
          transactionCount: this.normalizeNumber(place?.transactionCount ?? 0),
        });
        continue;
      }

      const nextAmount = this.normalizeNumber(place?.amount ?? 0);
      const nextCount = this.normalizeNumber(place?.transactionCount ?? 0);
      const nextDisplayName = name || existing.displayName;

      deduped.set(key, {
        ...existing,
        ...place,
        placeId: existing.placeId || placeId || "",
        displayName: nextDisplayName,
        amount: Math.max(existing.amount, nextAmount),
        transactionCount: Math.max(existing.transactionCount, nextCount),
      });
    }

    return Array.from(deduped.values()).sort((a, b) => {
      const amountDiff =
        this.normalizeNumber(b?.amount) - this.normalizeNumber(a?.amount);
      if (amountDiff !== 0) {
        return amountDiff;
      }

      return (
        this.normalizeNumber(b?.transactionCount) -
        this.normalizeNumber(a?.transactionCount)
      );
    });
  }

  getTopFrequentPlace(places = []) {
    if (!Array.isArray(places) || !places.length) {
      return null;
    }

    const sorted = [...places].sort((a, b) => {
      const countDiff =
        this.normalizeNumber(b?.transactionCount) -
        this.normalizeNumber(a?.transactionCount);

      if (countDiff !== 0) {
        return countDiff;
      }

      return this.normalizeNumber(b?.amount) - this.normalizeNumber(a?.amount);
    });

    return sorted[0] || null;
  }

  async exportCsv() {
    const t = this.getTranslator();
    const transactionService = this.getTransactionService();

    if (
      !transactionService ||
      typeof transactionService.exportTransactions !== "function"
    ) {
      this.setStatus(
        "error",
        t(
          "transactions.error.exportUnavailable",
          "The export path is not connected yet."
        )
      );
      await this.refresh();
      return;
    }

    this.setStatus(
      "info",
      t("transactions.status.exporting", "Preparing export…")
    );
    await this.refresh();

    try {
      await transactionService.exportTransactions({
        period: this.currentPeriod,
      });

      this.setStatus(
        "success",
        t("transactions.status.exportReady", "Export is ready to download.")
      );
    } catch (error) {
      console.error("[ReportsPage] CSV export failed:", error);
      this.setStatus(
        "error",
        t(
          "transactions.status.exportFailed",
          "Could not prepare the export right now."
        )
      );
    }

    await this.refresh();
  }

  async deleteSavedReport(savedId) {
    const t = this.getTranslator();
    const safeId = this.normalizeText(savedId);
    const transactionService = this.getTransactionService();

    if (!safeId) {
      return;
    }

    if (
      !transactionService ||
      typeof transactionService.deleteSavedCalculation !== "function"
    ) {
      this.setStatus(
        "error",
        t(
          "reports.saved.deleteUnavailable",
          "Saved report deletion is not connected yet."
        )
      );
      await this.refresh();
      return;
    }

    try {
      await transactionService.deleteSavedCalculation(safeId);
      this.setStatus(
        "success",
        t("reports.saved.deleteSuccess", "Saved report was removed.")
      );
    } catch (error) {
      console.error("[ReportsPage] Failed to delete saved report:", error);
      this.setStatus(
        "error",
        t(
          "reports.saved.deleteError",
          "Could not remove the saved report right now."
        )
      );
    }

    await this.refresh();
  }

  openSavedCalculation(savedId) {
    const safeId = this.normalizeText(savedId);
    if (!safeId) {
      return;
    }

    const item = this.savedCalculations.find(
      (entry) => this.normalizeText(entry?.id) === safeId
    );

    if (!item) {
      return;
    }

    window.alert(this.getViewSavedDialogText(item));
  }

  async changePeriod(nextPeriod) {
    const safePeriod = this.normalizePeriod(nextPeriod);

    if (safePeriod === this.currentPeriod) {
      return;
    }

    this.currentPeriod = safePeriod;
    this.setStatus("idle", "");
    await this.refresh();
  }

  renderPeriodSelector() {
    const periods = [
      { value: "currentMonth", label: this.t("reports.period.currentMonth", "Current month") },
      { value: "lastMonth", label: this.t("reports.period.lastMonth", "Last month") },
      { value: "currentYear", label: this.t("reports.period.currentYear", "Current year") },
    ];

    return `
      <section class="section section--card" aria-label="${this.t("reports.summary.period", "Period")}">
        <div class="home-section-header home-section-header--compact">
          <h3 class="home-section-header__title">
            ${this.t("reports.summary.period", "Period")}
          </h3>

          <p class="home-section-header__subtitle">
            ${this.t("reports.info.dataBased", "This report is based only on the data you have recorded.")}
          </p>
        </div>

        <div class="button-row">
          ${periods
            .map((period) => {
              const isActive = this.currentPeriod === period.value;
              const activeClass = isActive ? " is-active" : "";

              return `
                <button
                  type="button"
                  class="shortcut-btn button-secondary${activeClass}"
                  data-reports-period="${this.escapeHtml(period.value)}"
                  aria-pressed="${isActive ? "true" : "false"}"
                >
                  ${this.escapeHtml(period.label)}
                </button>
              `;
            })
            .join("")}
        </div>
      </section>
    `;
  }

  renderSummaryCards(summary) {
    const t = this.getTranslator();

    const currency = summary?.currency || "EUR";
    const locale = summary?.locale || getCurrentLanguage() || "en";

    const incomeValue = this.formatAmount(
      summary?.income ?? 0,
      currency,
      locale
    );
    const expensesValue = this.formatAmount(
      summary?.expenses ?? 0,
      currency,
      locale
    );
    const balanceValue = this.formatAmount(
      summary?.balance ?? 0,
      currency,
      locale
    );
    const entriesValue = String(
      this.normalizeNumber(summary?.transactionCount ?? 0)
    );

    return `
      <section class="section section--card" aria-label="${this.t("reports.sections.current", "Current summary")}">
        <div class="home-section-header home-section-header--compact">
          <h3 class="home-section-header__title">
            ${this.t("reports.sections.current", "Current summary")}
          </h3>

          <p class="home-section-header__subtitle">
            ${this.t("reports.info.dataBased", "This report is based only on the data you have recorded.")}
          </p>
        </div>

        <div class="report-summary-grid">
          <article class="report-summary-card">
            <span class="report-summary-card__label">
              ${this.t("reports.summary.income", "Income")}
            </span>
            <strong class="report-summary-card__value">${this.escapeHtml(
              incomeValue
            )}</strong>
          </article>

          <article class="report-summary-card">
            <span class="report-summary-card__label">
              ${this.t("reports.summary.expenses", "Expenses")}
            </span>
            <strong class="report-summary-card__value">${this.escapeHtml(
              expensesValue
            )}</strong>
          </article>

          <article class="report-summary-card">
            <span class="report-summary-card__label">
              ${this.t("reports.summary.balance", "Balance")}
            </span>
            <strong class="report-summary-card__value">${this.escapeHtml(
              balanceValue
            )}</strong>
          </article>

          <article class="report-summary-card">
            <span class="report-summary-card__label">
              ${this.t("reports.summary.entries", "Entries")}
            </span>
            <strong class="report-summary-card__value">${this.escapeHtml(
              entriesValue
            )}</strong>
          </article>
        </div>
      </section>
    `;
  }

  renderPlacesSection(summary) {
    const t = this.getTranslator();
    const currency = summary?.currency || "EUR";
    const locale = summary?.locale || getCurrentLanguage() || "en";

    const places = this.buildExpensePlaces(summary);
    const topAmountPlace = places[0] || null;
    const topFrequentPlace = this.getTopFrequentPlace(places);
    const visiblePlaces = places.slice(0, 5);

    const topAmountPlaceName =
      this.resolvePlaceDisplayName(topAmountPlace) ||
      t("reports.places.noPlace", "No place data yet");

    const topAmountValue = this.formatAmount(
      topAmountPlace?.amount ?? 0,
      currency,
      locale
    );

    const topFrequentPlaceName =
      this.resolvePlaceDisplayName(topFrequentPlace) ||
      t("reports.places.noPlace", "No place data yet");

    const topFrequentCount = this.normalizeNumber(
      topFrequentPlace?.transactionCount ?? 0
    );

    const uniquePlacesCount = places.length;

    return `
      <section class="section section--card" aria-label="${this.escapeHtml(
        t("reports.sections.places", "Places")
      )}">
        <div class="home-section-header home-section-header--compact">
          <h3 class="home-section-header__title">
            ${this.escapeHtml(t("reports.sections.places", "Places"))}
          </h3>

          <p class="home-section-header__subtitle">
            ${this.escapeHtml(
              t(
                "reports.places.subtitle",
                "See where most of your recorded spending happened in this period."
              )
            )}
          </p>
        </div>

        <div class="dashboard-grid">
          <article class="summary-card">
            <p class="summary-card__label">
              ${this.escapeHtml(
                t("reports.places.topPlace", "Biggest spending place")
              )}
            </p>
            <strong class="summary-card__value">
              ${this.escapeHtml(topAmountPlaceName)}
            </strong>
            ${
              topAmountPlace
                ? `
                  <p class="summary-card__meta">
                    ${this.escapeHtml(topAmountValue)}
                  </p>
                `
                : ""
            }
          </article>

          <article class="summary-card">
            <p class="summary-card__label">
              ${this.escapeHtml(
                t("reports.places.mostFrequent", "Most visited place")
              )}
            </p>
            <strong class="summary-card__value">
              ${this.escapeHtml(topFrequentPlaceName)}
            </strong>
            ${
              topFrequentPlace
                ? `
                  <p class="summary-card__meta">
                    ${this.escapeHtml(
                      `${topFrequentCount} ${this.getEntriesLabel(
                        topFrequentCount
                      )}`
                    )}
                  </p>
                `
                : ""
            }
          </article>

          <article class="summary-card">
            <p class="summary-card__label">
              ${this.escapeHtml(
                t("reports.places.totalPlaces", "Places in this period")
              )}
            </p>
            <strong class="summary-card__value">
              ${this.escapeHtml(String(uniquePlacesCount))}
            </strong>
            <p class="summary-card__meta">
              ${this.escapeHtml(
                t(
                  "reports.places.totalPlacesHelp",
                  "How many different places appear in your records during this period."
                )
              )}
            </p>
          </article>
        </div>

        ${
          visiblePlaces.length
            ? `
              <div class="list-card">
                <div class="list-card__items">
                  ${visiblePlaces
                    .map((place) => {
                      const name =
                        this.resolvePlaceDisplayName(place) ||
                        t("reports.places.unknownPlace", "Unknown place");

                      const amount = this.formatAmount(
                        place?.amount ?? 0,
                        currency,
                        locale
                      );

                      const transactionCount = this.normalizeNumber(
                        place?.transactionCount ?? 0
                      );

                      return `
                        <article class="activity-item">
                          <div class="activity-item__content">
                            <strong class="activity-item__title">
                              ${this.escapeHtml(name)}
                            </strong>

                            <p class="activity-item__meta">
                              ${this.escapeHtml(amount)} · ${this.escapeHtml(
                                `${transactionCount} ${this.getEntriesLabel(
                                  transactionCount
                                )}`
                              )}
                            </p>
                          </div>
                        </article>
                      `;
                    })
                    .join("")}
                </div>
              </div>
            `
            : `
              <div class="module-placeholder">
                <div class="module-placeholder__content">
                  <p class="module-placeholder__text">
                    ${this.escapeHtml(
                      t(
                        "reports.places.empty",
                        "Place-based comparison will appear here after your records start using place data."
                      )
                    )}
                  </p>
                </div>
              </div>
            `
        }
      </section>
    `;
  }

  renderIncomePlacesSection(summary) {
    if (!isBusinessPlan()) {
      return "";
    }

    const t = this.getTranslator();
    const currency = summary?.currency || "EUR";
    const locale = summary?.locale || getCurrentLanguage() || "en";

    const places = this.buildIncomePlaces(summary);
    const topAmountPlace = places[0] || null;
    const topFrequentPlace = this.getTopFrequentPlace(places);
    const visiblePlaces = places.slice(0, 5);

    const topAmountPlaceName =
      this.resolvePlaceDisplayName(topAmountPlace) ||
      t("reports.incomePlaces.noPlace", "No income place data yet");

    const topAmountValue = this.formatAmount(
      topAmountPlace?.amount ?? 0,
      currency,
      locale
    );

    const topFrequentPlaceName =
      this.resolvePlaceDisplayName(topFrequentPlace) ||
      t("reports.incomePlaces.noPlace", "No income place data yet");

    const topFrequentCount = this.normalizeNumber(
      topFrequentPlace?.transactionCount ?? 0
    );

    const uniquePlacesCount = places.length;

    return `
      <section class="section section--card" aria-label="${this.escapeHtml(
        t("reports.incomePlaces.section", "Income places")
      )}">
        <div class="home-section-header home-section-header--compact">
          <h3 class="home-section-header__title">
            ${this.escapeHtml(
              t("reports.incomePlaces.section", "Income places")
            )}
          </h3>

          <p class="home-section-header__subtitle">
            ${this.escapeHtml(
              t(
                "reports.incomePlaces.subtitle",
                "See where your recorded income appears most often in this period."
              )
            )}
          </p>
        </div>

        <div class="dashboard-grid">
          <article class="summary-card">
            <p class="summary-card__label">
              ${this.escapeHtml(
                t("reports.incomePlaces.topPlace", "Biggest income place")
              )}
            </p>
            <strong class="summary-card__value">
              ${this.escapeHtml(topAmountPlaceName)}
            </strong>
            ${
              topAmountPlace
                ? `
                  <p class="summary-card__meta">
                    ${this.escapeHtml(topAmountValue)}
                  </p>
                `
                : ""
            }
          </article>

          <article class="summary-card">
            <p class="summary-card__label">
              ${this.escapeHtml(
                t("reports.incomePlaces.mostFrequent", "Most frequent income place")
              )}
            </p>
            <strong class="summary-card__value">
              ${this.escapeHtml(topFrequentPlaceName)}
            </strong>
            ${
              topFrequentPlace
                ? `
                  <p class="summary-card__meta">
                    ${this.escapeHtml(
                      `${topFrequentCount} ${this.getEntriesLabel(
                        topFrequentCount
                      )}`
                    )}
                  </p>
                `
                : ""
            }
          </article>

          <article class="summary-card">
            <p class="summary-card__label">
              ${this.escapeHtml(
                t("reports.incomePlaces.totalPlaces", "Income places in this period")
              )}
            </p>
            <strong class="summary-card__value">
              ${this.escapeHtml(String(uniquePlacesCount))}
            </strong>
            <p class="summary-card__meta">
              ${this.escapeHtml(
                t(
                  "reports.incomePlaces.totalPlacesHelp",
                  "Unique places connected to recorded income in this period."
                )
              )}
            </p>
          </article>
        </div>

        ${
          visiblePlaces.length
            ? `
              <div class="list-card">
                <div class="list-card__items">
                  ${visiblePlaces
                    .map((place) => {
                      const name =
                        this.resolvePlaceDisplayName(place) ||
                        t(
                          "reports.incomePlaces.unknownPlace",
                          "Unknown income place"
                        );

                      const amount = this.formatAmount(
                        place?.amount ?? 0,
                        currency,
                        locale
                      );

                      const transactionCount = this.normalizeNumber(
                        place?.transactionCount ?? 0
                      );

                      return `
                        <article class="activity-item">
                          <div class="activity-item__content">
                            <strong class="activity-item__title">
                              ${this.escapeHtml(name)}
                            </strong>

                            <p class="activity-item__meta">
                              ${this.escapeHtml(amount)} · ${this.escapeHtml(
                                `${transactionCount} ${this.getEntriesLabel(
                                  transactionCount
                                )}`
                              )}
                            </p>
                          </div>
                        </article>
                      `;
                    })
                    .join("")}
                </div>
              </div>
            `
            : `
              <div class="module-placeholder">
                <div class="module-placeholder__content">
                  <p class="module-placeholder__text">
                    ${this.escapeHtml(
                      t(
                        "reports.incomePlaces.empty",
                        "Income place comparison will appear here after your records start using income place data."
                      )
                    )}
                  </p>
                </div>
              </div>
            `
        }
      </section>
    `;
  }

  getSavedDocuments() {
    try {
      const stored = JSON.parse(localStorage.getItem("besafe:saved-reports") || "[]");
      const documents = Array.isArray(stored) ? stored : [];
      console.log("[ReportsPage] Loaded saved documents:", documents.length, documents.map((d) => d.id));
      return documents;
    } catch (_error) {
      console.log("[ReportsPage] No saved documents found or parse error");
      return [];
    }
  }

  deleteSavedDocument(documentId) {
    try {
      const stored = this.getSavedDocuments();
      const filtered = stored.filter((doc) => doc.id !== documentId);
      localStorage.setItem("besafe:saved-reports", JSON.stringify(filtered));
    } catch (error) {
      console.error("[ReportsPage] Failed to delete saved document:", error);
    }
  }

  previewSavedDocument(documentId) {
    const docs = this.getSavedDocuments();
    const doc = docs.find((d) => d.id === documentId);
    if (!doc || !doc.htmlContent) return;

    const previewWindow = window.open("", "_blank");
    if (previewWindow) {
      previewWindow.document.write(doc.htmlContent);
      previewWindow.document.close();
    }
  }

  printSavedDocument(documentId) {
    const docs = this.getSavedDocuments();
    const doc = docs.find((d) => d.id === documentId);
    if (!doc) return;

    const locale = getCurrentLanguage() || "en";
    generateSavedDocumentPDF(doc, locale);
  }

  async exportSavedDocument(documentId) {
    const docs = this.getSavedDocuments();
    const doc = docs.find((d) => d.id === documentId);
    if (!doc) return;

    const docName = doc.name || this.t("reports.header.title", "Reports");
    const total = doc.total != null ? Number(doc.total).toFixed(2) : "—";
    const date = doc.createdAt || "—";

    const baseAmount = doc.baseAmount != null ? Number(doc.baseAmount).toFixed(2) : "—";
    const pctAmount = doc.percentageAmount != null ? Number(doc.percentageAmount).toFixed(2) : "0.00";
    const vatAmountVal = doc.vatAmount != null ? Number(doc.vatAmount).toFixed(2) : "0.00";

    const lines = [
      "BeSafe - Finansinė ataskaita",
      "",
      `Pavadinimas: ${docName}`,
      `${this.t("reports.summary.period", "Period") + ": "}${doc.dateFrom || "—"} – ${doc.dateTo || "—"}`,
      `Tipas: ${doc.type || "—"}`,
      `Sukurta: ${date}`,
      "",
      `${this.t("advisor.workspace.calculator.summaryBase", "Full amount") + ": "}${baseAmount} ${getCurrencySymbol(getUserCurrency())}`,
      `${this.t("advisor.workspace.calculator.summaryPercentage", "Percentage") + ": "}${pctAmount} ${getCurrencySymbol(getUserCurrency())}`,
      `${this.t("advisor.workspace.calculator.summaryVat", "VAT") + ": "}${vatAmountVal} ${getCurrencySymbol(getUserCurrency())}`,
      `${this.t("advisor.workspace.calculator.summaryTotal", "Final amount") + ": "}${total} ${getCurrencySymbol(getUserCurrency())}`,
    ];

    if (doc.categories && doc.categories.length) {
      lines.push("", "Kategorijos:");
      for (const c of doc.categories) {
        lines.push(`  ${c.name}: ${Number(c.total).toFixed(2)} ${getCurrencySymbol(getUserCurrency())}`);
      }
    }

    const content = lines.join("\n");
    const filename = `besafe-ataskaita-${doc.dateFrom || "nuo"}-${doc.dateTo || "iki"}.csv`;

    if (window.electronAPI && window.electronAPI.exportDocument) {
      const result = await window.electronAPI.exportDocument({
        filename,
        content,
        type: "csv",
      });

      if (result.saved) {
        window.alert(this.t("reports.status.ready", "Report ready to download."));
      }
    } else {
      const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      window.alert(this.t("reports.status.ready", "Report ready to download."));
    }
  }

  downloadCurrentReportPDF() {
    const summary = this.currentSummary || this.buildSafeFallbackSummary();
    const locale = summary.locale || getCurrentLanguage() || "en";
    const currency = summary.currency || "EUR";
    const periodLabel = this.getPeriodLabel(this.currentPeriod);

    const transactions = Array.isArray(summary.transactions)
      ? summary.transactions
      : Array.isArray(summary.recentTransactions)
        ? summary.recentTransactions
        : [];

    generateReportPDF({
      title: this.t("reports.header.title", "Reports"),
      period: periodLabel,
      summary: {
        income: summary.income ?? 0,
        expenses: summary.expenses ?? 0,
        balance: summary.balance ?? 0,
        transactionCount: summary.transactionCount ?? 0,
      },
      transactions,
      locale,
      currency,
    });
  }

  downloadSavedDocumentPDF(documentId) {
    const docs = this.getSavedDocuments();
    const doc = docs.find((d) => d.id === documentId);
    if (!doc) return;

    const locale = getCurrentLanguage() || "en";
    generateSavedDocumentPDF(doc, locale);
  }

  renderSavedDocumentsSection() {
    const documents = this.getSavedDocuments();

    return `
      <section class="section section--card" aria-label="${this.t("reports.sections.saved", "Saved reports")}">
        <div class="home-section-header home-section-header--compact">
          <h3 class="home-section-header__title">
            ${this.t("reports.sections.saved", "Saved reports")}
          </h3>

          <p class="home-section-header__subtitle">
            ${this.t("reports.saved.emptyText", "When you generate or save reports, you will see them here.")}
          </p>
        </div>

        ${documents.length
          ? `
            <div class="list-card">
              <div class="list-card__items">
                ${documents.map((doc) => {
                  const locale = getCurrentLanguage() || "en";
                  const docName = doc.name || this.t("reports.header.title", "Reports");
                  const period = doc.title || ((doc.dateFrom || "—") + " – " + (doc.dateTo || "—"));
                  const dateLabel = doc.createdAt
                    ? this.formatDate(doc.createdAt, locale)
                    : "";

                  const userCcy = getUserCurrency();
                  const baseLabel = doc.baseAmount != null
                    ? this.t("advisor.workspace.calculator.summaryBase", "Full amount") + ": " + this.formatAmount(doc.baseAmount, userCcy, locale)
                    : "";
                  const pctLabel = doc.percentageAmount != null && doc.percentageAmount !== 0
                    ? this.t("advisor.workspace.calculator.summaryPercentage", "Percentage") + ": " + this.formatAmount(doc.percentageAmount, userCcy, locale)
                    : "";
                  const vatLabel = doc.vatAmount != null && doc.vatAmount !== 0
                    ? this.t("advisor.workspace.calculator.summaryVat", "VAT") + ": " + this.formatAmount(doc.vatAmount, userCcy, locale)
                    : "";
                  const totalLabel = doc.total != null
                    ? this.t("advisor.workspace.calculator.summaryTotal", "Final amount") + ": " + this.formatAmount(doc.total, userCcy, locale)
                    : "";

                  return `
                    <article class="activity-item">
                      <div class="activity-item__content">
                        <strong class="activity-item__title">
                          ${this.escapeHtml(docName)}
                        </strong>

                        <p class="activity-item__meta">
                          ${this.escapeHtml(period)}
                        </p>

                        <p class="activity-item__meta">
                          ${[baseLabel, pctLabel, vatLabel, totalLabel].filter(Boolean).map((l) => this.escapeHtml(l)).join("<br>")}
                        </p>
                      </div>

                      <div class="button-row">
                        <button
                          type="button"
                          class="shortcut-btn button-secondary"
                          data-reports-action="preview-doc"
                          data-doc-id="${this.escapeHtml(doc.id)}"
                        >
                          ${this.t("reports.saved.view", "View")}
                        </button>

                        <button
                          type="button"
                          class="shortcut-btn button-secondary"
                          data-reports-action="print-doc"
                          data-doc-id="${this.escapeHtml(doc.id)}"
                        >
                          ${this.t("reports.export.pdf", "Print")}
                        </button>

                        <button
                          type="button"
                          class="shortcut-btn button-secondary"
                          data-reports-action="pdf-doc"
                          data-doc-id="${this.escapeHtml(doc.id)}"
                        >
                          PDF
                        </button>

                        <button
                          type="button"
                          class="shortcut-btn button-secondary"
                          data-reports-action="export-doc"
                          data-doc-id="${this.escapeHtml(doc.id)}"
                        >
                          ${this.t("reports.export.csv", "Export")}
                        </button>

                        <button
                          type="button"
                          class="shortcut-btn button-secondary"
                          data-reports-action="delete-doc"
                          data-doc-id="${this.escapeHtml(doc.id)}"
                        >
                          ${this.t("common.delete", "Delete")}
                        </button>
                      </div>
                    </article>
                  `;
                }).join("")}
              </div>
            </div>
          `
          : `
            <div class="module-placeholder">
              <div class="module-placeholder__content">
                <p class="module-placeholder__text">
                  ${this.t("reports.saved.emptyTitle", "No saved reports yet.")}
                </p>
              </div>
            </div>
          `
        }
      </section>
    `;
  }

  renderSavedReportsSection() {
    if (!isBusinessPlan()) {
      return "";
    }

    const t = this.getTranslator();
    const items = Array.isArray(this.savedCalculations)
      ? this.savedCalculations
      : [];

    return `
      <section class="section section--card" aria-label="${this.escapeHtml(
        t("reports.saved.section", "Saved reports")
      )}">
        <div class="home-section-header home-section-header--compact">
          <div>
            <h3 class="home-section-header__title">
              ${this.escapeHtml(t("reports.saved.section", "Saved reports"))}
            </h3>

            <p class="home-section-header__subtitle">
              ${this.escapeHtml(
                t(
                  "reports.saved.subtitle",
                  "Review or remove calculations you saved earlier."
                )
              )}
            </p>
          </div>

          ${isBusinessPlan() ? `
            <div class="button-row">
              <button
                type="button"
                class="shortcut-btn button-secondary"
                data-reports-action="export"
              >
                ${this.escapeHtml(t("reports.actions.export", "Export CSV"))}
              </button>
            </div>
          ` : ""}

        ${isBusinessPlan() && items.length
          ? `
              <div class="list-card">
                <div class="list-card__items">
                  ${items
                    .map((item) => {
                      const title = item.title
                        ? item.title
                        : t(
                            "reports.saved.fallbackTitle",
                            "Saved calculation"
                          );

                      const amount = this.formatAmount(
                        item.amount,
                        item.currency,
                        item.locale
                      );

                      const dateLabel = item.createdAt
                        ? this.formatDate(item.createdAt, item.locale)
                        : "";

                      const periodLabel = item.period
                        ? this.getPeriodLabel(item.period)
                        : "";

                      const formulaLabel = item.formula || "";

                      const metaLine = [amount, periodLabel, dateLabel]
                        .filter(Boolean)
                        .join(" · ");

                      return `
                        <article class="activity-item">
                          <div class="activity-item__content">
                            <strong class="activity-item__title">
                              ${this.escapeHtml(title)}
                            </strong>

                            <p class="activity-item__meta">
                              ${this.escapeHtml(metaLine)}
                            </p>

                            ${
                              formulaLabel
                                ? `
                                  <p class="activity-item__meta">
                                    ${this.escapeHtml(formulaLabel)}
                                  </p>
                                `
                                : ""
                            }
                          </div>

                          <div class="button-row">
                            <button
                              type="button"
                              class="shortcut-btn button-secondary"
                              data-reports-action="view-saved"
                              data-saved-id="${this.escapeHtml(item.id)}"
                            >
                              ${this.escapeHtml(this.getViewSavedLabel())}
                            </button>

                            <button
                              type="button"
                              class="shortcut-btn button-secondary"
                              data-reports-action="delete-saved"
                              data-saved-id="${this.escapeHtml(item.id)}"
                            >
                              ${this.escapeHtml(
                                t("reports.saved.delete", "Delete")
                              )}
                            </button>
                          </div>
                        </article>
                      `;
                    })
                    .join("")}
                </div>
              </div>
            `
            : `
              <div class="module-placeholder">
                <div class="module-placeholder__content">
                  <p class="module-placeholder__text">
                    ${this.escapeHtml(
                      t(
                        "reports.saved.empty",
                        "Saved calculations will appear here after you save them."
                      )
                    )}
                  </p>
                </div>
              </div>
            `
        }
      </section>
    `;
  }


  async buildMarkup() {
    const [, , summary, fallbackTransactions] = await Promise.all([
      this.loadPlacesIndex(),
      this.loadSavedCalculations(),
      this.loadSummary(),
      this.loadTransactionsForCurrentPeriod(),
    ]);

    const mergedSummary = {
      ...summary,
      transactions: Array.isArray(summary?.transactions)
        ? summary.transactions
        : fallbackTransactions,
      recentTransactions: Array.isArray(summary?.recentTransactions)
        ? summary.recentTransactions
        : fallbackTransactions.slice(0, 8),
    };

    this.currentSummary = mergedSummary;

    return `
      <div class="page-shell reports-page">
        ${this.renderStatus()}
        ${this.renderPeriodSelector()}
        ${this.renderSummaryCards(mergedSummary)}

        <section class="section section--card" aria-label="Export">
          <div class="button-row">
            <button
              type="button"
              class="shortcut-btn button-secondary"
              data-reports-action="download-pdf"
            >
              ${this.t("reports.export.downloadPdf", "Download PDF")}
            </button>
          </div>
        </section>

        ${this.renderSavedDocumentsSection()}
      </div>
    `;
  }

  async refresh() {
    const markup = await this.buildMarkup();

    if (this.container) {
      this.container.innerHTML = markup;
    }

    return markup;
  }

  async handleClick(event) {
    const periodButton = event.target.closest("[data-reports-period]");
    if (periodButton) {
      const nextPeriod = periodButton.dataset.reportsPeriod;
      await this.changePeriod(nextPeriod);
      return;
    }

    const actionButton = event.target.closest("[data-reports-action]");
    if (!actionButton) {
      return;
    }

    const action = this.normalizeText(actionButton.dataset.reportsAction);
    const savedId = this.normalizeText(actionButton.dataset.savedId);
    const docId = this.normalizeText(actionButton.dataset.docId);
    const t = this.getTranslator();

    if (action === "preview-doc") {
      this.previewSavedDocument(docId);
      return;
    }

    if (action === "print-doc") {
      this.printSavedDocument(docId);
      return;
    }

    if (action === "pdf-doc") {
      this.downloadSavedDocumentPDF(docId);
      return;
    }

    if (action === "download-pdf") {
      this.downloadCurrentReportPDF();
      return;
    }

    if (action === "export-doc") {
      this.exportSavedDocument(docId);
      return;
    }

    if (action === "delete-doc") {
      const confirmed = window.confirm(
        "Ar tikrai norite ištrinti šį dokumentą?"
      );
      if (confirmed) {
        this.deleteSavedDocument(docId);
        await this.refresh();
      }
      return;
    }

    if (action === "export") {
      await this.exportCsv();
      return;
    }

    if (action === "view-saved") {
      this.openSavedCalculation(savedId);
      return;
    }

    if (action === "delete-saved") {
      const confirmed = window.confirm(
        t(
          "reports.saved.confirmDelete",
          "Are you sure you want to remove this saved report?"
        )
      );

      if (!confirmed) {
        return;
      }

      await this.deleteSavedReport(savedId);
    }
  }

    render() {
      return `<div class="page-shell reports-page">
        ${this.renderStatus()}
        ${this.renderPeriodSelector()}
      </div>`;
    }

  async onAfterEnter() {
    const pageEl = document.querySelector(".reports-page");
    if (pageEl) {
      pageEl.removeEventListener("click", this.handleClick);
      pageEl.addEventListener("click", this.handleClick);
      this.container = pageEl;
      // Užkrauti duomenis po pradinio render'io
      await this.refresh();
    }
  }

  async mount(container) {
    if (!container) {
      return;
    }

    if (this.container && this.container !== container) {
      this.destroy();
    }

    this.container = container;
    this.container.removeEventListener("click", this.handleClick);
    this.container.addEventListener("click", this.handleClick);

    await this.refresh();
  }

  destroy() {
    if (this.container) {
      this.container.removeEventListener("click", this.handleClick);
      this.container.innerHTML = "";
    }

    this.container = null;
  }
}
