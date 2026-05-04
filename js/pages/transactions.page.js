import { createTranslator, getCurrentLanguage } from "../core/i18n.js";
import { parseLocalDate } from "../core/date.js";

export class TransactionsPage {
  constructor({ transactionService } = {}) {
    this.transactionService = transactionService;

    this.boundTransactionCreated = this.handleTransactionCreated.bind(this);
    this.boundTransactionUpdated = this.handleTransactionUpdated.bind(this);
    this.boundTransactionDeleted = this.handleTransactionDeleted.bind(this);
    this.boundTransactionsRefreshRequested =
      this.handleTransactionsRefreshRequested.bind(this);
    this.boundHomeRefreshRequested = this.handleHomeRefreshRequested.bind(this);
    this.boundActionClick = this.handleActionClick.bind(this);

    this.statusMessage = {
      text: "",
      state: "neutral",
    };

    this.latestTransactions = [];
    this.isUpdating = false;
    this.isActionBusy = false;
    this.pendingRefresh = false;
    this.ignoreNextDeletedEvent = false;
  }

  async onBeforeEnter() {
    return true;
  }

  t(key, fallback) {
    try {
      const translator = createTranslator(getCurrentLanguage());
      const value = translator(key, fallback);
      return typeof value === "string" && value.trim() ? value : fallback;
    } catch (_error) {
      return fallback;
    }
  }

  getCurrentLocale() {
    const lang = String(getCurrentLanguage?.() || "en").toLowerCase();
    const localeMap = { lt: "lt-LT", en: "en-GB", pl: "pl-PL", de: "de-DE", es: "es-ES", fr: "fr-FR", it: "it-IT", ru: "ru-RU", uk: "uk-UA", no: "nb-NO", sv: "sv-SE", ja: "ja-JP", zh: "zh-CN", pt: "pt-BR" };
    return localeMap[lang] || "en-GB";
  }

  escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  normalizeText(value, fallback = "") {
    if (typeof value !== "string") {
      return fallback;
    }

    const normalized = value.trim();
    return normalized || fallback;
  }

  normalizeCurrency(value, fallback = "EUR") {
    return this.normalizeText(value, fallback).toUpperCase();
  }

  normalizeCategoryKey(category = "") {
    const value = String(category || "").trim().toLowerCase();

    const aliasMap = {
      maistas: "food",
      food: "food",

      transportas: "transport",
      transport: "transport",

      būstas: "housing",
      bustas: "housing",
      housing: "housing",

      sveikata: "health",
      health: "health",

      mokslas: "education",
      education: "education",

      pirkiniai: "shopping",
      shopping: "shopping",

      pramogos: "entertainment",
      leisure: "entertainment",
      entertainment: "entertainment",

      sąskaitos: "bills",
      saskaitos: "bills",
      bills: "bills",

      kelionės: "travel",
      keliones: "travel",
      travel: "travel",

      šeima: "family",
      seima: "family",
      family: "family",

      augintiniai: "pets",
      pets: "pets",

      dovanos: "gifts",
      gifts: "gifts",

      alga: "salary",
      atlyginimas: "salary",
      salary: "salary",

      premija: "bonus",
      bonus: "bonus",

      papildomos_pajamos: "additional_income",
      papildomospajamos: "additional_income",
      additional_income: "additional_income",

      laisvai_samdoma: "additional_income",
      freelance: "additional_income",

      verslas: "additional_income",
      business: "additional_income",

      investicijos: "additional_income",
      investment: "additional_income",

      dovana: "other",
      gift: "other",

      išmoka: "other",
      ismoka: "other",
      benefit: "other",

      grąžinimas: "refund",
      grazinimas: "refund",
      refund: "refund",

      kita: "other",
      other: "other",

      general: "other",
    };

    return aliasMap[value] || value || "other";
  }

  getCategoryLabel(category = "") {
    const key = this.normalizeCategoryKey(category);

    const categoryMap = {
      food: this.t("categories.food", "Food"),
      transport: this.t("categories.transport", "Transport"),
      housing: this.t("categories.housing", "Housing"),
      health: this.t("categories.health", "Health"),
      education: this.t("categories.education", "Education"),
      shopping: this.t("categories.shopping", "Shopping"),
      entertainment: this.t("categories.entertainment", "Leisure"),
      bills: this.t("categories.bills", "Bills"),
      travel: this.t("categories.travel", "Travel"),
      family: this.t("categories.family", "Family"),
      pets: this.t("categories.pets", "Pets"),
      gifts: this.t("categories.gifts", "Gifts"),
      salary: this.t("incomeCategories.salary", "Salary"),
      bonus: this.t("incomeCategories.bonus", "Bonus"),
      additional_income: this.t(
        "incomeCategories.additionalIncome",
        "Additional income"
      ),
      refund: this.t("incomeCategories.refund", "Refund"),
      other: this.t("categories.other", "Other"),
    };

    return (
      categoryMap[key] ||
      category ||
      this.t("home.transactions.uncategorized", "Uncategorized")
    );
  }

  formatAmount(amount = 0, type = "unknown", currency = "EUR") {
    const numericAmount = Math.abs(Number(amount || 0));
    const safeCurrency = this.normalizeCurrency(currency, "EUR");

    try {
      const formatted = new Intl.NumberFormat(this.getCurrentLocale(), {
        style: "currency",
        currency: safeCurrency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(numericAmount);

      if (type === "income") return `+${formatted}`;
      if (type === "expense") return `-${formatted}`;
      return formatted;
    } catch (_error) {
      const fallback = `${safeCurrency} ${numericAmount.toFixed(2)}`;

      if (type === "income") return `+${fallback}`;
      if (type === "expense") return `-${fallback}`;
      return fallback;
    }
  }

  formatDate(dateValue) {
    if (!dateValue) {
      return this.t("common.unknownDate", "Date not specified");
    }

    const date = parseLocalDate(dateValue) || new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
      return this.t("common.unknownDate", "Date not specified");
    }

    return new Intl.DateTimeFormat(this.getCurrentLocale(), {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
  }

  getTransactionDateValue(tx = {}) {
    return tx?.financialDate || tx?.date || "";
  }

  sortTransactions(transactions = []) {
    return [...transactions].sort((a, b) => {
      const aTime = new Date(this.getTransactionDateValue(a) || 0).getTime();
      const bTime = new Date(this.getTransactionDateValue(b) || 0).getTime();

      if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
      if (Number.isNaN(aTime)) return 1;
      if (Number.isNaN(bTime)) return -1;

      return bTime - aTime;
    });
  }

  buildSummary(transactions = []) {
    return transactions.reduce(
      (summary, tx) => {
        const amount = Math.abs(Number(tx?.amount || 0));

        if (tx?.type === "income") {
          summary.income += amount;
          summary.incomeCount += 1;
        } else if (tx?.type === "expense") {
          summary.expenses += amount;
          summary.expenseCount += 1;
        }

        summary.count += 1;
        return summary;
      },
      {
        income: 0,
        expenses: 0,
        count: 0,
        incomeCount: 0,
        expenseCount: 0,
      }
    );
  }

  setStatusMessage(text = "", state = "neutral") {
    this.statusMessage = { text, state };
  }

  getStatusMarkup() {
    if (!this.statusMessage?.text) {
      return `
        <p
          class="transactions-guidance__text transactions-guidance__text--neutral"
          role="status"
          aria-live="polite"
        >
          ${this.escapeHtml(
            this.t(
              "transactions.guidance.default",
              "Review your entries in one clear place and continue with the next step when needed."
            )
          )}
        </p>
      `;
    }

    return `
      <p
        class="transactions-guidance__text transactions-guidance__text--${this.escapeHtml(
          this.statusMessage.state || "neutral"
        )}"
        role="status"
        aria-live="polite"
      >
        ${this.escapeHtml(this.statusMessage.text)}
      </p>
    `;
  }

  getTransactionId(tx = {}) {
    return tx?.id ?? tx?._id ?? tx?.transactionId ?? "";
  }

  getTypeLabel(type = "unknown") {
    if (type === "income") return this.t("home.transactions.income", "Income");
    if (type === "expense")
      return this.t("home.transactions.expense", "Expense");
    return this.t("transactions.entry", "Entry");
  }

  getVisibleTransactions() {
    return this.latestTransactions;
  }

  normalizeTransactionNote(note = "") {
    const value = String(note || "").trim();
    const lower = value.toLowerCase();

    if (!value) return "";

    if (lower === "quick income") {
      return this.t("transactions.note.quickIncome", "Quick income");
    }

    if (lower === "quick expense") {
      return this.t("transactions.note.quickExpense", "Quick expense");
    }

    if (lower === "quick entry") {
      return this.t("transactions.note.quickEntry", "Quick entry");
    }

    if (lower === "income") {
      return this.t("home.transactions.income", "Income");
    }

    if (lower === "expense") {
      return this.t("home.transactions.expense", "Expense");
    }

    return value;
  }

  isTechnicalMetaValue(value = "") {
    const normalized = this.normalizeText(value).toLowerCase();

    if (!normalized) {
      return true;
    }

    const technicalValues = new Set([
      "quick-actions",
      "quickactions",
      "receipt-entry",
      "receiptentry",
      "manual",
      "scanner",
      "receipt",
      "receipt_scan",
      "source",
      "home",
      "advisor",
      "reports",
      "transactions",
    ]);

    return technicalValues.has(normalized);
  }

  looksLikeOpaqueId(value = "") {
    const normalized = this.normalizeText(value);

    if (!normalized) {
      return false;
    }

    if (normalized.length >= 24 && /^[a-zA-Z0-9_-]+$/.test(normalized)) {
      return true;
    }

    if (/^[0-9a-f]{8,}$/i.test(normalized.replaceAll("-", ""))) {
      return true;
    }

    return false;
  }

  getReceiptSourceLabel(source = "") {
    const rawValue = this.normalizeText(source);
    const normalized = rawValue.toLowerCase();

    if (!normalized) return "";

    const safeTranslate = (key, fallback) => {
      const translated = this.t(key, fallback);
      if (!translated) return fallback;

      const normalizedTranslated = String(translated).trim().toLowerCase();
      const normalizedKey = String(key).trim().toLowerCase();

      if (
        normalizedTranslated === normalizedKey ||
        normalizedTranslated === rawValue.trim().toLowerCase()
      ) {
        return fallback;
      }

      return translated;
    };

    const sourceMap = {
      manual: safeTranslate("transactions.receiptSource.manual", "Manual"),
      receipt: safeTranslate("transactions.receiptSource.receipt", "Receipt"),
      receipt_scan: safeTranslate(
        "transactions.receiptSource.receiptScan",
        "Receipt scan"
      ),
      scanner: safeTranslate("transactions.receiptSource.scanner", "Scanner"),
      "receipt-scanner": safeTranslate(
        "transactions.receiptSource.scanner",
        "Scanner"
      ),
      "receipt-entry": safeTranslate(
        "transactions.receiptSource.receipt",
        "Receipt"
      ),
      "transactions.receiptsource.manual": safeTranslate(
        "transactions.receiptSource.manual",
        "Manual"
      ),
      "transactions.receiptsource.receipt": safeTranslate(
        "transactions.receiptSource.receipt",
        "Receipt"
      ),
      "transactions.receiptsource.receiptscan": safeTranslate(
        "transactions.receiptSource.receiptScan",
        "Receipt scan"
      ),
      "transactions.receiptsource.scanner": safeTranslate(
        "transactions.receiptSource.scanner",
        "Scanner"
      ),
    };

    if (sourceMap[normalized]) {
      return sourceMap[normalized];
    }

    if (
      normalized.startsWith("transactions.receiptsource.") ||
      normalized.startsWith("transaction.receiptsource.")
    ) {
      if (normalized.endsWith(".scanner")) {
        return safeTranslate("transactions.receiptSource.scanner", "Scanner");
      }

      if (normalized.endsWith(".receipt")) {
        return safeTranslate("transactions.receiptSource.receipt", "Receipt");
      }

      if (normalized.endsWith(".receiptscan")) {
        return safeTranslate(
          "transactions.receiptSource.receiptScan",
          "Receipt scan"
        );
      }

      if (normalized.endsWith(".manual")) {
        return safeTranslate("transactions.receiptSource.manual", "Manual");
      }

      return "";
    }

    if (this.isTechnicalMetaValue(normalized)) {
      return "";
    }

    return "";
  }

  hasReceiptContext(tx = {}) {
    const hasReceiptObject =
      tx?.receipt && typeof tx.receipt === "object" && !Array.isArray(tx.receipt);

    const source = this.normalizeText(tx?.receipt?.source || tx?.meta?.source);
    const reviewStatus = this.normalizeText(tx?.receipt?.reviewStatus);

    return Boolean(hasReceiptObject || source || reviewStatus);
  }

  getTransactionTitle(tx = {}) {
    const detail = this.normalizeText(tx?.categoryDetail || "");
    if (detail) return detail;

    const category = this.normalizeText(tx?.category || "");
    if (category) return this.getCategoryLabel(category);

    return this.t("home.transactions.uncategorized", "Uncategorized");
  }

  getTransactionPlaceLabel(tx = {}) {
    const candidates = [
      tx?.placeName,
      tx?.meta?.placeName,
      tx?.place?.name,
      tx?.place?.title,
      tx?.receipt?.storeName,
      tx?.receipt?.placeName,
      tx?.storeName,
      tx?.merchantName,
      tx?.merchant,
      tx?.placeLabel,
    ];

    for (const candidate of candidates) {
      const value = this.normalizeText(candidate);
      if (!value) continue;
      if (this.isTechnicalMetaValue(value)) continue;
      return value;
    }

    const fallbackCandidates = [
      tx?.receipt?.placeId,
      tx?.placeId,
      tx?.place?.id,
      tx?.meta?.placeId,
    ];

    for (const candidate of fallbackCandidates) {
      const value = this.normalizeText(candidate);
      if (!value) continue;
      if (this.isTechnicalMetaValue(value)) continue;
      if (this.looksLikeOpaqueId(value)) continue;
      return value;
    }

    return "";
  }

  getTransactionMetaLine(tx = {}) {
    const parts = [];

    const dateLabel = this.formatDate(this.getTransactionDateValue(tx));
    if (dateLabel) {
      parts.push(dateLabel);
    }

    const categoryLabel = this.getCategoryLabel(tx?.category || "");
    if (categoryLabel) {
      parts.push(categoryLabel);
    }

    const receiptSourceLabel = this.getReceiptSourceLabel(
      tx?.receipt?.source || tx?.meta?.source || ""
    );

    if (this.hasReceiptContext(tx) && receiptSourceLabel) {
      parts.push(receiptSourceLabel);
    }

    return parts.join(" · ");
  }

  getTransactionSourceBadgeMarkup(tx = {}) {
    if (!this.hasReceiptContext(tx)) {
      return "";
    }

    const sourceLabel = this.getReceiptSourceLabel(
      tx?.receipt?.source || tx?.meta?.source || ""
    );

    if (!sourceLabel) {
      return "";
    }

    return `
      <span class="transaction-item__badge transaction-item__badge--receipt-source">
        ${this.escapeHtml(sourceLabel)}
      </span>
    `;
  }

  renderHeaderActions() {
    return "";
  }

  renderSummary(summary = {}) {
    return `
      <section class="transactions-summary" aria-label="${this.escapeHtml(
        this.t("transactions.summary.aria", "Transactions summary")
      )}">
        <article class="transactions-summary__card">
          <span class="transactions-summary__label">${this.escapeHtml(
            this.t("transactions.summary.totalEntries", "Entries")
          )}</span>
          <strong class="transactions-summary__value">${this.escapeHtml(
            String(summary.count || 0)
          )}</strong>
        </article>

        <article class="transactions-summary__card">
          <span class="transactions-summary__label">${this.escapeHtml(
            this.t("transactions.summary.totalIncome", "Income")
          )}</span>
          <strong class="transactions-summary__value transactions-summary__value--income">${this.escapeHtml(
            this.formatAmount(summary.income || 0, "income")
          )}</strong>
        </article>

        <article class="transactions-summary__card">
          <span class="transactions-summary__label">${this.escapeHtml(
            this.t("transactions.summary.totalExpenses", "Expenses")
          )}</span>
          <strong class="transactions-summary__value transactions-summary__value--expense">${this.escapeHtml(
            this.formatAmount(summary.expenses || 0, "expense")
          )}</strong>
        </article>
      </section>
    `;
  }

  renderPageGuidance(hasTransactions = false) {
    return `
      <section class="transactions-guidance">
        ${this.getStatusMarkup()}
        ${
          hasTransactions
            ? ""
            : `<p class="transactions-guidance__hint">${this.escapeHtml(
                this.t(
                  "transactions.guidance.emptyHint",
                  "Start from Home to add the first income or expense entry."
                )
              )}</p>`
        }
      </section>
    `;
  }

  renderEmptyState() {
    return `
      <div class="transactions-empty">
        <strong>${this.escapeHtml(
          this.t("transactions.empty.title", "No transactions yet")
        )}</strong>
        <p>${this.escapeHtml(
          this.t(
            "transactions.empty.text",
            "When you add income, expenses, or receipts, they will appear here in one clear list."
          )
        )}</p>
      </div>
    `;
  }

  renderErrorState(message) {
    return `
      <section class="page-transactions">
        <div class="transactions-shell">
          <section class="transactions-guidance">
            <p
              class="transactions-guidance__text transactions-guidance__text--error"
              role="status"
              aria-live="polite"
            >
              ${this.escapeHtml(
                this.t("transactions.error.title", "Something went wrong")
              )}
            </p>
            <p class="transactions-guidance__hint">${this.escapeHtml(message)}</p>
          </section>
        </div>
      </section>
    `;
  }

  triggerDownload(payload = {}) {
    const content =
      typeof payload?.content === "string"
        ? payload.content
        : JSON.stringify(payload, null, 2);
    const filename =
      typeof payload?.filename === "string" && payload.filename.trim()
        ? payload.filename.trim()
        : "transactions-export.json";
    const type =
      typeof payload?.type === "string" && payload.type.trim()
        ? payload.type.trim()
        : "application/json";

    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);
  }

  async deleteTransactionById(transactionId) {
    if (!this.transactionService) {
      throw new Error(
        this.t(
          "transactions.error.deleteUnavailable",
          "Delete action is not available right now."
        )
      );
    }

    if (typeof this.transactionService.deleteTransaction === "function") {
      return this.transactionService.deleteTransaction(transactionId);
    }

    if (typeof this.transactionService.deleteTransactionById === "function") {
      return this.transactionService.deleteTransactionById(transactionId);
    }

    throw new Error(
      this.t(
        "transactions.error.deleteUnavailable",
        "Delete action is not available right now."
      )
    );
  }

  async exportTransactions() {
    if (
      !this.transactionService ||
      typeof this.transactionService.exportTransactions !== "function"
    ) {
      throw new Error(
        this.t(
          "transactions.error.exportUnavailable",
          "Export action is not available right now."
        )
      );
    }

    return this.transactionService.exportTransactions();
  }

  renderTransactionActions(tx = {}) {
    const transactionId = this.escapeHtml(
      String(this.getTransactionId(tx) || "")
    );

    return `
      <div class="transaction-item__actions">
        <button
          type="button"
          class="button button--danger button--small"
          data-transaction-action="delete-one"
          data-transaction-id="${transactionId}"
          ${this.isActionBusy ? "disabled" : ""}
        >
          ${this.escapeHtml(this.t("transactions.actions.delete", "Delete"))}
        </button>
      </div>
    `;
  }

  renderTransactionItem(tx = {}) {
    const rawType = tx?.type === "income" ? "income" : "expense";
    const title = this.escapeHtml(this.getTransactionTitle(tx));
    const note = this.escapeHtml(this.normalizeTransactionNote(tx?.note || ""));
    const metaLine = this.escapeHtml(this.getTransactionMetaLine(tx));

    const placeLabelRaw = this.getTransactionPlaceLabel(tx);
    const placeLabel = placeLabelRaw ? this.escapeHtml(placeLabelRaw) : "";

    const amount = this.escapeHtml(
      this.formatAmount(tx?.amount || 0, rawType, tx?.currency || "EUR")
    );
    const typeLabel = this.escapeHtml(this.getTypeLabel(rawType));
    const sourceBadgeMarkup = this.getTransactionSourceBadgeMarkup(tx);

    return `
      <li
        class="transaction-item transaction-item--simple transaction-item--${this.escapeHtml(
          rawType
        )}"
      >
        <div class="transaction-item__row">
          <div class="transaction-item__main">
            <div class="transaction-item__topline">
              <strong class="transaction-item__title">${title}</strong>

              <div class="transaction-item__badges">
                <span class="transaction-item__badge transaction-item__badge--${this.escapeHtml(
                  rawType
                )}">
                  ${typeLabel}
                </span>
                ${sourceBadgeMarkup}
              </div>
            </div>

            <span class="transaction-item__meta">${metaLine}</span>

            ${placeLabel ? `<span class="transaction-item__place">${placeLabel}</span>` : ""}

            ${note ? `<small class="transaction-item__note">${note}</small>` : ""}
          </div>

          <div class="transaction-item__amount">
            ${amount}
          </div>
        </div>

        ${this.renderTransactionActions(tx)}
      </li>
    `;
  }

  renderTransactionGroup(title, transactions = []) {
    if (!Array.isArray(transactions) || !transactions.length) {
      return "";
    }

    return `
      <section class="transactions-group">
        <h3 class="transactions-group__title">${this.escapeHtml(title)}</h3>
        <ul class="transactions-list">
          ${transactions.map((tx) => this.renderTransactionItem(tx)).join("")}
        </ul>
      </section>
    `;
  }

  getPageRoot() {
    return document.getElementById("page-transactions");
  }

  isTransactionsActive() {
    const pageRoot = this.getPageRoot();
    if (!pageRoot) return false;
    if (pageRoot.hidden) return false;
    return !pageRoot.closest("[hidden]");
  }

  async refreshIfActive() {
    if (!this.isTransactionsActive()) {
      return false;
    }

    await this.requestRefresh();
    return true;
  }

  async requestRefresh() {
    if (this.isActionBusy || this.isUpdating) {
      this.pendingRefresh = true;
      return;
    }

    this.pendingRefresh = false;
    await this.update();
  }

  async handleDeleteAction(transactionId) {
    if (!transactionId) {
      this.setStatusMessage(
        this.t(
          "transactions.status.deleteTargetMissing",
          "Could not determine which transaction to remove."
        ),
        "error"
      );
      await this.update();
      return;
    }

    const shouldDelete = window.confirm(
      this.t(
        "transactions.confirm.delete",
        "Are you sure you want to remove this transaction?"
      )
    );

    if (!shouldDelete) {
      return;
    }

    try {
      this.isActionBusy = true;
      this.ignoreNextDeletedEvent = true;

      this.setStatusMessage(
        this.t("transactions.status.deleting", "Removing transaction…"),
        "neutral"
      );
      await this.update();

      await this.deleteTransactionById(transactionId);

      this.setStatusMessage(
        this.t("transactions.status.deleted", "Transaction removed."),
        "success"
      );
    } catch (error) {
      this.ignoreNextDeletedEvent = false;
      console.error("[TransactionsPage] delete failed:", error);
      this.setStatusMessage(
        error?.message ||
          this.t(
            "transactions.status.deleteFailed",
            "Could not remove the transaction right now."
          ),
        "error"
      );
    } finally {
      this.isActionBusy = false;
      await this.update();
    }
  }

  async handleExportAction() {
    try {
      this.isActionBusy = true;
      this.setStatusMessage(
        this.t("transactions.status.exporting", "Preparing export…"),
        "neutral"
      );
      await this.update();

      const exportedPayload = await this.exportTransactions();
      this.triggerDownload(exportedPayload);

      this.setStatusMessage(
        this.t("transactions.status.exportReady", "Export is ready to download."),
        "success"
      );
    } catch (error) {
      console.error("[TransactionsPage] export failed:", error);
      this.setStatusMessage(
        error?.message ||
          this.t(
            "transactions.status.exportFailed",
            "Could not prepare the export right now."
          ),
        "error"
      );
    } finally {
      this.isActionBusy = false;
      await this.update();
    }
  }

  async handleActionClick(event) {
    const actionButton = event.target.closest("[data-transaction-action]");
    if (!actionButton || this.isActionBusy) return;

    event.preventDefault();
    event.stopPropagation();

    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }

    const action = actionButton.dataset.transactionAction;
    const transactionId = actionButton.dataset.transactionId || "";

    if (action === "delete-one") {
      await this.handleDeleteAction(transactionId);
      return;
    }

    if (action === "export") {
      await this.handleExportAction();
    }
  }

  async render() {
    try {
      if (
        !this.transactionService ||
        typeof this.transactionService.getTransactions !== "function"
      ) {
        return this.renderErrorState(
          this.t(
            "transactions.error.serviceUnavailable",
            "Could not reach the transactions service."
          )
        );
      }

      const transactions = await this.transactionService.getTransactions();
      const safeTransactions = Array.isArray(transactions) ? transactions : [];
      const sortedTransactions = this.sortTransactions(safeTransactions);
      const summary = this.buildSummary(sortedTransactions);

      this.latestTransactions = sortedTransactions;

      const visibleTransactions = this.getVisibleTransactions();
      const incomeTransactions = visibleTransactions.filter(
        (tx) => tx?.type === "income"
      );
      const expenseTransactions = visibleTransactions.filter(
        (tx) => tx?.type === "expense"
      );

      let items = this.renderEmptyState();

      if (visibleTransactions.length > 0) {
        items = `
          ${this.renderTransactionGroup(
            this.t("home.transactions.income", "Income"),
            incomeTransactions
          )}
          ${this.renderTransactionGroup(
            this.t("home.transactions.expense", "Expenses"),
            expenseTransactions
          )}
        `;
      }

      return `
        <section class="page-transactions">
          <div class="transactions-shell">
            <div class="transactions-header transactions-header--content-only">
              ${this.renderHeaderActions()}
            </div>

            ${this.renderSummary(summary)}

            ${this.renderPageGuidance(sortedTransactions.length > 0)}

            <div
              class="transactions-groups"
              aria-label="${this.escapeHtml(
                this.t("transactions.list.aria", "Transactions list")
              )}"
            >
              ${items}
            </div>
          </div>
        </section>
      `;
    } catch (error) {
      console.error("[TransactionsPage] render failed:", error);
      return this.renderErrorState(
        error?.message ||
          this.t(
            "transactions.error.renderTitle",
            "Transactions could not be shown right now"
          )
      );
    }
  }

  addEventListeners() {
    document.removeEventListener(
      "transaction:created",
      this.boundTransactionCreated
    );
    document.removeEventListener(
      "transaction:updated",
      this.boundTransactionUpdated
    );
    document.removeEventListener(
      "transaction:deleted",
      this.boundTransactionDeleted
    );
    window.removeEventListener(
      "besafe:transactions-refresh-requested",
      this.boundTransactionsRefreshRequested
    );
    window.removeEventListener(
      "besafe:home-refresh-requested",
      this.boundHomeRefreshRequested
    );

    document.addEventListener("transaction:created", this.boundTransactionCreated);
    document.addEventListener("transaction:updated", this.boundTransactionUpdated);
    document.addEventListener("transaction:deleted", this.boundTransactionDeleted);
    window.addEventListener(
      "besafe:transactions-refresh-requested",
      this.boundTransactionsRefreshRequested
    );
    window.addEventListener(
      "besafe:home-refresh-requested",
      this.boundHomeRefreshRequested
    );

    const pageRoot = this.getPageRoot();
    if (!pageRoot) return;

    pageRoot.removeEventListener("click", this.boundActionClick);
    pageRoot.addEventListener("click", this.boundActionClick);
  }

  removeEventListeners() {
    document.removeEventListener(
      "transaction:created",
      this.boundTransactionCreated
    );
    document.removeEventListener(
      "transaction:updated",
      this.boundTransactionUpdated
    );
    document.removeEventListener(
      "transaction:deleted",
      this.boundTransactionDeleted
    );
    window.removeEventListener(
      "besafe:transactions-refresh-requested",
      this.boundTransactionsRefreshRequested
    );
    window.removeEventListener(
      "besafe:home-refresh-requested",
      this.boundHomeRefreshRequested
    );

    const pageRoot = this.getPageRoot();
    if (!pageRoot) return;

    pageRoot.removeEventListener("click", this.boundActionClick);
  }

  async onAfterEnter() {
    await this.update();
    this.addEventListeners();
  }

  async onLeave() {
    this.removeEventListeners();
    return true;
  }

  async handleTransactionCreated() {
    await this.refreshIfActive();
  }

  async handleTransactionUpdated() {
    await this.refreshIfActive();
  }

  async handleTransactionDeleted() {
    if (this.ignoreNextDeletedEvent) {
      this.ignoreNextDeletedEvent = false;
      return;
    }

    await this.refreshIfActive();
  }

  async handleTransactionsRefreshRequested() {
    await this.refreshIfActive();
  }

  async handleHomeRefreshRequested() {
    await this.refreshIfActive();
  }

  async update() {
    if (this.isUpdating) {
      this.pendingRefresh = true;
      return;
    }

    const pageRoot = this.getPageRoot();
    if (!pageRoot) return;

    this.isUpdating = true;

    try {
      pageRoot.innerHTML = await this.render();
      this.addEventListeners();
    } finally {
      this.isUpdating = false;

      if (this.pendingRefresh && !this.isActionBusy && this.isTransactionsActive()) {
        this.pendingRefresh = false;
        await this.update();
      }
    }
  }
}