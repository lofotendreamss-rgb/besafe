export class TransactionService {
  constructor({ apiService } = {}) {
    this.apiService = apiService || null;
  }

  getSupportedTypes() {
    return ["expense", "income"];
  }

  getExpenseCategoryKeys() {
    return [
      "food",
      "transport",
      "housing",
      "health",
      "education",
      "entertainment",
      "shopping",
      "bills",
      "travel",
      "family",
      "pets",
      "gifts",
      "other",
    ];
  }

  getIncomeCategoryKeys() {
    return [
      "salary",
      "bonus",
      "additional_income",
      "refund",
      "other",
    ];
  }

  getSupportedPlaceTypes() {
    return [
      "store",
      "fuel_station",
      "restaurant",
      "cafe",
      "pharmacy",
      "market",
      "service",
      "online",
      "other",
    ];
  }

  isSupportedType(type) {
    return this.getSupportedTypes().includes(String(type || "").trim());
  }

  isValidDate(dateValue) {
    if (!dateValue || typeof dateValue !== "string") return false;
    return /^\d{4}-\d{2}-\d{2}$/.test(dateValue.trim());
  }

  normalizeNumber(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.round(parsed * 100) / 100;
  }

  normalizeText(value) {
    return String(value || "").trim();
  }

  normalizeOptionalId(value) {
    const safeId = String(value ?? "").trim();
    return safeId || null;
  }

  normalizeType(type) {
    const value = this.normalizeText(type).toLowerCase();
    return this.isSupportedType(value) ? value : null;
  }

  normalizeEntryPoint(meta = {}) {
    return this.normalizeText(meta.entryPoint || "");
  }

  normalizeSource(meta = {}) {
    const source = this.normalizeText(meta.source || "");
    return source || "manual";
  }

  getAllowedCategoriesByType(type) {
    if (type === "income") return this.getIncomeCategoryKeys();
    return this.getExpenseCategoryKeys();
  }

  normalizeCategory(type, category) {
    const value = this.normalizeText(category).toLowerCase();
    const allowed = this.getAllowedCategoriesByType(type);
    return allowed.includes(value) ? value : null;
  }

  normalizeCategoryDetail(category, categoryDetail) {
    if (category !== "other") return "";
    return this.normalizeText(categoryDetail);
  }

  normalizeNote(note) {
    return this.normalizeText(note);
  }

  normalizeCurrency(currency) {
    const value = this.normalizeText(currency).toUpperCase();
    return value || "EUR";
  }

  normalizeLocale(locale) {
    const value = this.normalizeText(locale);
    return value || "en";
  }

  normalizeScanConfidence(scanConfidence) {
    const value = this.normalizeText(scanConfidence).toLowerCase();
    if (!value) return null;

    const allowed = ["low", "medium", "high"];
    return allowed.includes(value) ? value : null;
  }

  normalizePlaceType(type) {
    const value = this.normalizeText(type).toLowerCase();
    return this.getSupportedPlaceTypes().includes(value) ? value : "other";
  }

  normalizeStringList(values) {
    if (!Array.isArray(values)) return [];

    return [...new Set(
      values
        .map((value) => this.normalizeText(value))
        .filter(Boolean)
    )];
  }

  normalizeMeta(meta = {}) {
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
      return {
        source: "manual",
        entryPoint: "unknown",
      };
    }

    const normalized = {
      ...meta,
      source: this.normalizeSource(meta),
      entryPoint: this.normalizeEntryPoint(meta) || "unknown",
    };

    if (
      typeof meta.originalAmountInput !== "string" ||
      !meta.originalAmountInput.trim()
    ) {
      delete normalized.originalAmountInput;
    } else {
      normalized.originalAmountInput = meta.originalAmountInput.trim();
    }

    return normalized;
  }

  normalizeReceiptItems(items) {
    if (!Array.isArray(items)) return [];

    return items
      .map((item) => {
        const name = this.normalizeText(item?.name);
        const price = this.normalizeNumber(item?.price);
        const quantity =
          item?.quantity == null ? null : this.normalizeNumber(item.quantity);
        const category = this.normalizeText(item?.category).toLowerCase();
        const confidence = this.normalizeScanConfidence(item?.confidence);

        if (!name && price == null) return null;

        return {
          name,
          price,
          quantity,
          category: category || null,
          confidence,
        };
      })
      .filter(Boolean);
  }

  normalizeCategorySummary(summary) {
    if (!Array.isArray(summary)) return [];

    return summary
      .map((item) => {
        const category = this.normalizeText(item?.category).toLowerCase();
        const amount = this.normalizeNumber(item?.amount);

        if (!category || amount == null) return null;

        return {
          category,
          amount,
        };
      })
      .filter(Boolean);
  }

  buildBaseRecord(payload = {}) {
    const type = this.normalizeType(payload.type);
    const amount = this.normalizeNumber(payload.amount);
    const date = this.normalizeText(payload.date);
    const financialDate = this.normalizeText(payload.financialDate || payload.date);
    const note = this.normalizeNote(payload.note);
    const meta = this.normalizeMeta(payload.meta);
    const placeId = this.normalizeOptionalId(payload.placeId);

    if (!type) {
      throw new Error("A valid transaction type is required.");
    }

    if (amount == null || amount <= 0) {
      throw new Error("A valid amount greater than zero is required.");
    }

    if (!this.isValidDate(date)) {
      throw new Error("A valid date in YYYY-MM-DD format is required.");
    }

    if (!this.isValidDate(financialDate)) {
      throw new Error("A valid financial date in YYYY-MM-DD format is required.");
    }

    const category = this.normalizeCategory(type, payload.category);
    if (!category) {
      throw new Error("A valid category is required.");
    }

    const categoryDetail = this.normalizeCategoryDetail(
      category,
      payload.categoryDetail
    );

    if (category === "other" && !categoryDetail) {
      throw new Error("A category detail is required when category is other.");
    }

    return {
      type,
      amount,
      category,
      categoryDetail,
      date,
      financialDate,
      note,
      currency: this.normalizeCurrency(payload.currency),
      locale: this.normalizeLocale(payload.locale),
      placeId,
      meta,
    };
  }

  buildReceiptFields(payload = {}, baseRecord = null) {
    const receipt =
      payload.receipt && typeof payload.receipt === "object" && !Array.isArray(payload.receipt)
        ? payload.receipt
        : {};

    const sourceMeta = baseRecord?.meta || this.normalizeMeta(payload.meta);
    const resolvedPlaceId =
      this.normalizeOptionalId(receipt.placeId) ??
      this.normalizeOptionalId(baseRecord?.placeId) ??
      this.normalizeOptionalId(payload.placeId);

    return {
      receiptId: this.normalizeText(receipt.receiptId) || null,
      source:
        this.normalizeText(receipt.source) ||
        this.normalizeSource(sourceMeta),
      placeId: resolvedPlaceId,
      storeName: this.normalizeText(receipt.storeName) || null,
      purchaseDate:
        this.normalizeText(receipt.purchaseDate) ||
        this.normalizeText(baseRecord?.financialDate || payload.financialDate || payload.date) ||
        null,
      totalAmount:
        receipt.totalAmount == null
          ? this.normalizeNumber(baseRecord?.amount ?? payload.amount)
          : this.normalizeNumber(receipt.totalAmount),
      currency: this.normalizeCurrency(
        receipt.currency || baseRecord?.currency || payload.currency
      ),
      locale: this.normalizeLocale(
        receipt.locale || baseRecord?.locale || payload.locale
      ),
      rawText: this.normalizeText(receipt.rawText) || null,
      scanConfidence: this.normalizeScanConfidence(receipt.scanConfidence),
      userConfirmed:
        typeof receipt.userConfirmed === "boolean" ? receipt.userConfirmed : null,
      items: this.normalizeReceiptItems(receipt.items),
      categorySummary: this.normalizeCategorySummary(receipt.categorySummary),
    };
  }

  buildCreatePayload(payload = {}) {
    const baseRecord = this.buildBaseRecord(payload);
    const isReceiptFlow =
      baseRecord.meta.entryPoint === "receipt" ||
      baseRecord.meta.entryPoint === "receipt-scanner" ||
      baseRecord.meta.source === "receipt_scan";

    const receiptFields = isReceiptFlow
      ? this.buildReceiptFields(payload, baseRecord)
      : null;

    return {
      ...baseRecord,
      createdAt: new Date().toISOString(),
      ...(receiptFields
        ? {
            receipt: {
              ...receiptFields,
              source: "receipt_scan",
            },
          }
        : {}),
    };
  }

  buildReplacePayload(payload = {}) {
    const baseRecord = this.buildBaseRecord(payload);
    const hasReceipt =
      payload.receipt &&
      typeof payload.receipt === "object" &&
      !Array.isArray(payload.receipt);

    return {
      ...baseRecord,
      ...(hasReceipt
        ? {
            receipt: this.buildReceiptFields(payload, baseRecord),
          }
        : {}),
    };
  }

  buildPatchPayload(payload = {}) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("A valid update payload is required.");
    }

    const patch = {};

    if (payload.type !== undefined) {
      const type = this.normalizeType(payload.type);
      if (!type) {
        throw new Error("A valid transaction type is required.");
      }
      patch.type = type;
    }

    if (payload.amount !== undefined) {
      const amount = this.normalizeNumber(payload.amount);
      if (amount == null || amount <= 0) {
        throw new Error("A valid amount greater than zero is required.");
      }
      patch.amount = amount;
    }

    if (payload.category !== undefined) {
      const effectiveType = patch.type || this.normalizeType(payload.type) || "expense";
      const category = this.normalizeCategory(effectiveType, payload.category);

      if (!category) {
        throw new Error("A valid category is required.");
      }

      patch.category = category;

      if (category !== "other") {
        patch.categoryDetail = "";
      }
    }

    if (payload.categoryDetail !== undefined) {
      const category = patch.category || this.normalizeText(payload.category).toLowerCase() || "other";
      const categoryDetail = this.normalizeCategoryDetail(category, payload.categoryDetail);

      if (category === "other" && !categoryDetail) {
        throw new Error("A category detail is required when category is other.");
      }

      patch.categoryDetail = category === "other" ? categoryDetail : "";
    }

    if (payload.note !== undefined) {
      patch.note = this.normalizeNote(payload.note);
    }

    if (payload.date !== undefined) {
      const date = this.normalizeText(payload.date);
      if (!this.isValidDate(date)) {
        throw new Error("A valid date in YYYY-MM-DD format is required.");
      }
      patch.date = date;
    }

    if (payload.financialDate !== undefined) {
      const financialDate = this.normalizeText(payload.financialDate);
      if (!this.isValidDate(financialDate)) {
        throw new Error("A valid financial date in YYYY-MM-DD format is required.");
      }
      patch.financialDate = financialDate;
    }

    if (payload.currency !== undefined) {
      patch.currency = this.normalizeCurrency(payload.currency);
    }

    if (payload.locale !== undefined) {
      patch.locale = this.normalizeLocale(payload.locale);
    }

    if (payload.placeId !== undefined) {
      patch.placeId = this.normalizeOptionalId(payload.placeId);
    }

    if (payload.meta !== undefined) {
      patch.meta = this.normalizeMeta(payload.meta);
    }

    if (payload.receipt !== undefined) {
      const helperBase = {
        amount: patch.amount ?? payload.amount,
        financialDate:
          patch.financialDate ?? patch.date ?? payload.financialDate ?? payload.date,
        date: patch.date ?? payload.date ?? payload.financialDate,
        currency: patch.currency ?? payload.currency,
        locale: patch.locale ?? payload.locale,
        placeId: patch.placeId ?? payload.placeId,
        meta: patch.meta ?? payload.meta,
      };

      patch.receipt = this.buildReceiptFields(payload, helperBase);
    }

    return patch;
  }

  normalizePlacePayload(payload = {}) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("A valid place payload is required.");
    }

    const name = this.normalizeText(payload.name);
    if (!name) {
      throw new Error("A place name is required.");
    }

    return {
      name,
      type: this.normalizePlaceType(payload.type),
      brand: this.normalizeText(payload.brand),
      country: this.normalizeText(payload.country).toUpperCase(),
      city: this.normalizeText(payload.city),
      address: this.normalizeText(payload.address),
      notes: this.normalizeText(payload.notes),
      aliases: this.normalizeStringList(payload.aliases),
      tags: this.normalizeStringList(payload.tags).map((tag) => tag.toLowerCase()),
      isFavorite: Boolean(payload.isFavorite),
      meta: this.normalizeMeta(payload.meta),
    };
  }

  normalizePartialPlacePayload(payload = {}) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("A valid place update payload is required.");
    }

    const patch = {};

    if (payload.name !== undefined) {
      const name = this.normalizeText(payload.name);
      if (!name) {
        throw new Error("A place name is required.");
      }
      patch.name = name;
    }

    if (payload.type !== undefined) {
      patch.type = this.normalizePlaceType(payload.type);
    }

    if (payload.brand !== undefined) {
      patch.brand = this.normalizeText(payload.brand);
    }

    if (payload.country !== undefined) {
      patch.country = this.normalizeText(payload.country).toUpperCase();
    }

    if (payload.city !== undefined) {
      patch.city = this.normalizeText(payload.city);
    }

    if (payload.address !== undefined) {
      patch.address = this.normalizeText(payload.address);
    }

    if (payload.notes !== undefined) {
      patch.notes = this.normalizeText(payload.notes);
    }

    if (payload.aliases !== undefined) {
      patch.aliases = this.normalizeStringList(payload.aliases);
    }

    if (payload.tags !== undefined) {
      patch.tags = this.normalizeStringList(payload.tags).map((tag) => tag.toLowerCase());
    }

    if (payload.isFavorite !== undefined) {
      patch.isFavorite = Boolean(payload.isFavorite);
    }

    if (payload.meta !== undefined) {
      patch.meta = this.normalizeMeta(payload.meta);
    }

    return patch;
  }

  async createTransaction(payload = {}) {
    const normalizedPayload = this.buildCreatePayload(payload);

    if (
      this.apiService &&
      typeof this.apiService.createTransaction === "function"
    ) {
      return this.apiService.createTransaction(normalizedPayload);
    }

    if (
      normalizedPayload.type === "expense" &&
      this.apiService &&
      typeof this.apiService.addExpense === "function"
    ) {
      return this.apiService.addExpense(normalizedPayload);
    }

    if (
      normalizedPayload.type === "income" &&
      this.apiService &&
      typeof this.apiService.addIncome === "function"
    ) {
      return this.apiService.addIncome(normalizedPayload);
    }

    throw new Error("Transaction saving is not available.");
  }

  async updateTransaction(transactionId, payload = {}) {
    const id = this.normalizeText(transactionId);
    if (!id) {
      throw new Error("A valid transaction id is required.");
    }

    const normalizedPayload = this.buildReplacePayload(payload);

    if (
      this.apiService &&
      typeof this.apiService.updateTransaction === "function"
    ) {
      return this.apiService.updateTransaction(id, normalizedPayload);
    }

    throw new Error("Transaction update is not available.");
  }

  async patchTransaction(transactionId, payload = {}) {
    const id = this.normalizeText(transactionId);
    if (!id) {
      throw new Error("A valid transaction id is required.");
    }

    const normalizedPayload = this.buildPatchPayload(payload);

    if (
      this.apiService &&
      typeof this.apiService.patchTransaction === "function"
    ) {
      return this.apiService.patchTransaction(id, normalizedPayload);
    }

    throw new Error("Transaction update is not available.");
  }

  async deleteTransactionById(transactionId) {
    const id = this.normalizeText(transactionId);

    if (!id) {
      throw new Error("A valid transaction id is required.");
    }

    if (
      this.apiService &&
      typeof this.apiService.deleteTransaction === "function"
    ) {
      return this.apiService.deleteTransaction(id);
    }

    if (
      this.apiService &&
      typeof this.apiService.deleteTransactionById === "function"
    ) {
      return this.apiService.deleteTransactionById(id);
    }

    throw new Error("Transaction deletion is not available.");
  }

  async getTransactions() {
    if (
      this.apiService &&
      typeof this.apiService.getTransactions === "function"
    ) {
      return this.apiService.getTransactions();
    }

    return [];
  }

  async getTransactionById(transactionId) {
    const id = this.normalizeText(transactionId);

    if (!id) {
      throw new Error("A valid transaction id is required.");
    }

    if (
      this.apiService &&
      typeof this.apiService.getTransactionById === "function"
    ) {
      return this.apiService.getTransactionById(id);
    }

    return null;
  }

  async getSummary() {
    if (
      this.apiService &&
      typeof this.apiService.getSummary === "function"
    ) {
      return this.apiService.getSummary();
    }

    return null;
  }

  async getPlaces() {
    if (
      this.apiService &&
      typeof this.apiService.getPlaces === "function"
    ) {
      return this.apiService.getPlaces();
    }

    return [];
  }

  async getPlaceById(placeId) {
    const id = this.normalizeText(placeId);

    if (!id) {
      throw new Error("A valid place id is required.");
    }

    if (
      this.apiService &&
      typeof this.apiService.getPlaceById === "function"
    ) {
      return this.apiService.getPlaceById(id);
    }

    return null;
  }

  async createPlace(payload = {}) {
    const normalizedPayload = this.normalizePlacePayload(payload);

    if (
      this.apiService &&
      typeof this.apiService.createPlace === "function"
    ) {
      return this.apiService.createPlace(normalizedPayload);
    }

    throw new Error("Place creation is not available.");
  }

  async updatePlace(placeId, payload = {}) {
    const id = this.normalizeText(placeId);

    if (!id) {
      throw new Error("A valid place id is required.");
    }

    const normalizedPayload = this.normalizePlacePayload(payload);

    if (
      this.apiService &&
      typeof this.apiService.updatePlace === "function"
    ) {
      return this.apiService.updatePlace(id, normalizedPayload);
    }

    throw new Error("Place update is not available.");
  }

  async patchPlace(placeId, payload = {}) {
    const id = this.normalizeText(placeId);

    if (!id) {
      throw new Error("A valid place id is required.");
    }

    const normalizedPayload = this.normalizePartialPlacePayload(payload);

    if (
      this.apiService &&
      typeof this.apiService.patchPlace === "function"
    ) {
      return this.apiService.patchPlace(id, normalizedPayload);
    }

    throw new Error("Place update is not available.");
  }

    openCategoryModal(options = {}) {
    const detail = {
      source: "transaction-service",
      mode: "create",
      ...options,
    };

    try {
      window.dispatchEvent(
        new CustomEvent("besafe:open-category-create", {
          detail,
        })
      );
      return true;
    } catch (error) {
      console.warn("[TransactionService] Failed to open category modal:", error);
      return false;
    }
  }

  async deletePlace(placeId) {
    const id = this.normalizeText(placeId);

    if (!id) {
      throw new Error("A valid place id is required.");
    }

    if (
      this.apiService &&
      typeof this.apiService.deletePlace === "function"
    ) {
      return this.apiService.deletePlace(id);
    }

    throw new Error("Place deletion is not available.");
  }
}