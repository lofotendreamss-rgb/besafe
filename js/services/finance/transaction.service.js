import { getUserCurrency } from "./currency.js";
import { getUserPlan, isValidPlan } from "./user-plan.js";
import { filterByMode } from "../data/local.db.js";

export class TransactionService {
  constructor({ apiService } = {}) {
    this.apiService = apiService || null;
    this.transactionsCache = [];
    this.categoriesCache = [];
    this.placesCache = [];
  }

  hasOwn(object, key) {
    return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
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
    return parsed;
  }

  normalizeText(value) {
    return String(value || "").trim();
  }

  normalizeOptionalText(value) {
    return this.normalizeText(value);
  }

  normalizeStringList(values = []) {
    if (!Array.isArray(values)) {
      return [];
    }

    return [
      ...new Set(
        values
          .map((value) => this.normalizeOptionalText(value))
          .filter(Boolean)
      ),
    ];
  }

  normalizeType(type) {
    const value = this.normalizeText(type).toLowerCase();
    return this.isSupportedType(value) ? value : null;
  }

  normalizeEntryPoint(meta = {}) {
    return this.normalizeText(meta.entryPoint || "") || "unknown";
  }

  normalizeSource(meta = {}) {
    const source = this.normalizeText(meta.source || "");
    return source || "manual";
  }

  normalizeOptionalId(value) {
    const normalized = this.normalizeText(value);
    return normalized || null;
  }

  getAllowedCategoriesByType(type) {
    if (type === "income") return this.getIncomeCategoryKeys();
    return this.getExpenseCategoryKeys();
  }

  normalizeCategory(type, category) {
    const value = this.normalizeText(category);
    return value || null;
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
    // Default fallback delegates to user's current currency preference
    // (Phase 4 Sesija 0b). getUserCurrency() reads localStorage and
    // itself falls back to "EUR" if no preference is set or storage
    // is unavailable — preserving the previous hardcoded default
    // behavior for first-run / private-browsing edge cases.
    return value || getUserCurrency();
  }

  normalizeMode(mode) {
    // Phase 4+ Mode Separation (Sesija A1, 2026-05-01). When a record
    // is created without an explicit mode, default to the user's
    // currently active plan (read from localStorage via getUserPlan).
    // Existing records lacking mode are backfilled to "personal" by
    // runModeMigration at boot. See besafe_mode_separation_principle.md.
    const value = this.normalizeText(mode).toLowerCase();
    if (isValidPlan(value)) return value;
    return getUserPlan();
  }

  normalizeLocale(locale) {
    const value = this.normalizeText(locale).toLowerCase();
    return value || "en";
  }

  normalizeScanConfidence(scanConfidence) {
    const value = this.normalizeText(scanConfidence).toLowerCase();
    if (!value) return null;

    const allowed = ["low", "medium", "high"];
    return allowed.includes(value) ? value : null;
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
      entryPoint: this.normalizeEntryPoint(meta),
    };

    if (
      typeof meta.originalAmountInput === "string" &&
      meta.originalAmountInput.trim()
    ) {
      normalized.originalAmountInput = meta.originalAmountInput.trim();
    } else {
      delete normalized.originalAmountInput;
    }

    return Object.fromEntries(
      Object.entries(normalized).filter(([, value]) => value !== undefined)
    );
  }

  normalizeReceiptItems(items) {
    if (!Array.isArray(items)) return [];

    return items
      .map((item) => {
        const name = this.normalizeText(item?.name) || null;
        const price =
          item?.price == null ? null : this.normalizeNumber(item.price);
        const quantity =
          item?.quantity == null ? null : this.normalizeNumber(item.quantity);
        const category =
          this.normalizeText(item?.category).toLowerCase() || null;
        const confidence = this.normalizeScanConfidence(item?.confidence);

        if (!name && price == null) return null;

        return {
          name,
          price,
          quantity,
          category,
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

  resolveFinancialDate(payload = {}) {
    if (this.hasOwn(payload, "financialDate")) {
      return this.normalizeText(payload.financialDate);
    }

    if (this.hasOwn(payload, "date")) {
      return this.normalizeText(payload.date);
    }

    return "";
  }

  normalizePlaceType(type) {
    const value = this.normalizeText(type).toLowerCase();

    if (!value) {
      return null;
    }

    const compact = value.replaceAll("-", "_").replaceAll(" ", "_");

    if (
      compact === "store" ||
      compact === "shop" ||
      compact === "parduotuve" ||
      compact === "parduotuvė" ||
      compact === "apsipirkimas"
    ) {
      return "store";
    }

    if (
      compact === "goods" ||
      compact === "prekes" ||
      compact === "prekės"
    ) {
      return "goods";
    }

    if (
      compact === "transport" ||
      compact === "station" ||
      compact === "fuel_station" ||
      compact === "gas_station" ||
      compact === "petrol_station" ||
      compact === "degaline" ||
      compact === "degalinė" ||
      compact === "transportas"
    ) {
      return "transport";
    }

    if (
      compact === "housing" ||
      compact === "home" ||
      compact === "bustas" ||
      compact === "būstas"
    ) {
      return "housing";
    }

    if (
      compact === "utilities" ||
      compact === "komunalines_paslaugos" ||
      compact === "komunalinės_paslaugos"
    ) {
      return "utilities";
    }

    if (compact === "health" || compact === "sveikata") {
      return "health";
    }

    if (compact === "leisure" || compact === "laisvalaikis") {
      return "leisure";
    }

    if (compact === "bank" || compact === "bankas") {
      return "bank";
    }

    if (compact === "other" || compact === "kita") {
      return "other";
    }

    const allowed = [
      "store",
      "goods",
      "transport",
      "housing",
      "utilities",
      "health",
      "leisure",
      "bank",
      "other",
    ];

    return allowed.includes(compact) ? compact : null;
  }

  normalizeCategoryPayload(payload = {}) {
    const name = this.normalizeText(payload.name);
    const type = this.normalizeType(payload.type);

    if (!name) {
      throw new Error("Category name is required.");
    }

    if (!type) {
      throw new Error("Category type must be expense or income.");
    }

    return {
      id:
        this.normalizeText(payload.id) ||
        (typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `category_${Date.now()}_${Math.random()
              .toString(36)
              .slice(2, 10)}`),
      name,
      type,
      mode: this.normalizeMode(payload.mode),
      createdAt:
        this.normalizeText(payload.createdAt) || new Date().toISOString(),
    };
  }

  setCategoriesCache(categories = []) {
    this.categoriesCache = Array.isArray(categories) ? [...categories] : [];
    return this.categoriesCache;
  }

  getCategoriesCache() {
    return Array.isArray(this.categoriesCache) ? [...this.categoriesCache] : [];
  }

  updateCategoryCacheAfterCreate(createdCategory) {
    if (!createdCategory || typeof createdCategory !== "object") {
      return;
    }

    const current = this.getCategoriesCache();
    const createdId = this.normalizeText(createdCategory.id);

    if (createdId) {
      const filtered = current.filter(
        (item) => this.normalizeText(item?.id) !== createdId
      );
      this.setCategoriesCache([createdCategory, ...filtered]);
      return;
    }

    this.setCategoriesCache([createdCategory, ...current]);
  }

  updateCategoryCacheAfterDelete(categoryId) {
    const id = this.normalizeText(categoryId);

    if (!id) {
      return;
    }

    const nextCategories = this.getCategoriesCache().filter(
      (category) => this.normalizeText(category?.id) !== id
    );

    this.setCategoriesCache(nextCategories);
  }

  setPlacesCache(places = []) {
    this.placesCache = Array.isArray(places) ? [...places] : [];
    return this.placesCache;
  }

  getPlacesCache() {
    return Array.isArray(this.placesCache) ? [...this.placesCache] : [];
  }

  updatePlaceCacheAfterCreate(createdPlace) {
    if (!createdPlace || typeof createdPlace !== "object") {
      return;
    }

    const normalizedPlace = {
      ...createdPlace,
      purpose: this.normalizeText(
        createdPlace.purpose || "expense"
      ).toLowerCase(),
    };

    const current = this.getPlacesCache();
    const createdId = this.normalizeText(normalizedPlace.id);

    if (createdId) {
      const filtered = current.filter(
        (item) => this.normalizeText(item?.id) !== createdId
      );
      this.setPlacesCache([normalizedPlace, ...filtered]);
      return;
    }

    this.setPlacesCache([normalizedPlace, ...current]);
  }

  updatePlaceCacheAfterDelete(placeId) {
    const id = this.normalizeText(placeId);

    if (!id) {
      return;
    }

    const nextPlaces = this.getPlacesCache().filter(
      (place) => this.normalizeText(place?.id) !== id
    );

    this.setPlacesCache(nextPlaces);
  }

  buildBaseRecord(payload = {}) {
    const type = this.normalizeType(payload.type);
    const amount = this.normalizeNumber(payload.amount);
    const financialDate = this.resolveFinancialDate(payload);
    const note = this.normalizeNote(payload.note);
    const meta = this.normalizeMeta(payload.meta);

    if (!type) {
      throw new Error("A valid transaction type is required.");
    }

    if (amount == null || amount <= 0) {
      throw new Error("A valid amount greater than zero is required.");
    }

    if (!this.isValidDate(financialDate)) {
      throw new Error("A valid date in YYYY-MM-DD format is required.");
    }

    const categoryId = this.normalizeOptionalId(
      payload.categoryId || payload?.meta?.categoryId
    );

    const category = this.normalizeCategory(type, payload.category);

    if (!categoryId) {
      throw new Error("A valid categoryId is required.");
    }

    const resolvedCategory = category || "other";
    const categoryDetail = this.normalizeCategoryDetail(
      resolvedCategory,
      payload.categoryDetail
    );

    if (resolvedCategory === "other" && !categoryId && !categoryDetail) {
      throw new Error("A category detail is required when category is other.");
    }

    const placeId = this.normalizeOptionalId(
      payload.placeId || payload?.receipt?.placeId || meta.placeId
    );

    return {
      type,
      amount,
      mode: this.normalizeMode(payload.mode),
      ...(category ? { category } : {}),
      ...(categoryId ? { categoryId } : {}),
      categoryDetail,
      date: financialDate,
      financialDate,
      note,
      ...(placeId ? { placeId } : {}),
      meta: {
        ...meta,
        source: this.normalizeSource(meta),
        entryPoint: this.normalizeEntryPoint(meta),
        ...(placeId ? { placeId } : {}),
        ...(categoryId ? { categoryId } : {}),
      },
    };
  }

  buildReceiptFields(payload = {}) {
    if (payload.receipt === null) {
      return null;
    }

    const receipt =
      payload.receipt && typeof payload.receipt === "object"
        ? payload.receipt
        : null;

    if (!receipt) {
      return null;
    }

    const rootFinancialDate = this.resolveFinancialDate(payload);
    const rootPlaceId = this.normalizeOptionalId(
      payload.placeId || payload?.meta?.placeId
    );

    return {
      receiptId: this.normalizeText(receipt.receiptId) || null,
      storeName:
        this.normalizeText(receipt.storeName || receipt.placeName) || null,
      purchaseDate:
        this.normalizeText(receipt.purchaseDate) ||
        rootFinancialDate ||
        null,
      totalAmount:
        receipt.totalAmount == null
          ? payload.amount == null
            ? null
            : this.normalizeNumber(payload.amount)
          : this.normalizeNumber(receipt.totalAmount),
      currency: this.normalizeCurrency(receipt.currency || payload.currency),
      locale: this.normalizeLocale(receipt.locale || payload.locale),
      rawText: this.normalizeText(receipt.rawText) || null,
      scanConfidence: this.normalizeScanConfidence(receipt.scanConfidence),
      userConfirmed:
        typeof receipt.userConfirmed === "boolean" ? receipt.userConfirmed : null,
      items: this.normalizeReceiptItems(receipt.items),
      categorySummary: this.normalizeCategorySummary(receipt.categorySummary),
      placeId: this.normalizeOptionalId(receipt.placeId || rootPlaceId),
      source:
        this.normalizeText(receipt.source) ||
        this.normalizeSource(payload.meta),
    };
  }

  buildCreatePayload(payload = {}) {
    const baseRecord = this.buildBaseRecord(payload);
    const isReceiptFlow =
      baseRecord.meta.entryPoint === "receipt" ||
      baseRecord.meta.entryPoint === "receipt-scanner" ||
      baseRecord.meta.source === "receipt_scan";

    const receiptFields = isReceiptFlow ? this.buildReceiptFields(payload) : null;

    const normalizedPlaceId = this.normalizeOptionalId(
      payload.placeId ||
        baseRecord.placeId ||
        payload?.receipt?.placeId ||
        baseRecord?.meta?.placeId
    );

    const normalizedCategoryId = this.normalizeOptionalId(
      payload.categoryId ||
        baseRecord.categoryId ||
        payload?.meta?.categoryId
    );

    return {
      ...baseRecord,
      ...(normalizedPlaceId ? { placeId: normalizedPlaceId } : {}),
      ...(normalizedCategoryId ? { categoryId: normalizedCategoryId } : {}),
      currency: this.normalizeCurrency(payload.currency),
      locale: this.normalizeLocale(payload.locale),
      createdAt: new Date().toISOString(),
      meta: {
        ...(baseRecord.meta || {}),
        ...(normalizedPlaceId ? { placeId: normalizedPlaceId } : {}),
        ...(normalizedCategoryId ? { categoryId: normalizedCategoryId } : {}),
      },
      ...(receiptFields
        ? {
            receipt: {
              ...receiptFields,
              ...(normalizedPlaceId ? { placeId: normalizedPlaceId } : {}),
            },
          }
        : {}),
    };
  }

  normalizeDateInput(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }

    const normalized = this.normalizeText(value);
    if (!normalized) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      const parsed = new Date(`${normalized}T00:00:00`);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const parsed = new Date(normalized);
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

  normalizeExportOptions(options = {}) {
    if (!options || typeof options !== "object" || Array.isArray(options)) {
      return {
        period: "",
        startDate: "",
        endDate: "",
      };
    }

    return {
      period: this.normalizeText(options.period),
      startDate: this.normalizeText(options.startDate),
      endDate: this.normalizeText(options.endDate),
    };
  }

  isSupportedExportPeriod(period) {
    return ["currentMonth", "lastMonth", "currentYear", "custom"].includes(
      this.normalizeText(period)
    );
  }

  createPeriodRange(options = {}) {
    const normalized = this.normalizeExportOptions(options);
    const today = new Date();

    let startDate = null;
    let endDate = null;

    if (normalized.period === "currentMonth") {
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else if (normalized.period === "lastMonth") {
      startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      endDate = new Date(today.getFullYear(), today.getMonth(), 0);
    } else if (normalized.period === "currentYear") {
      startDate = new Date(today.getFullYear(), 0, 1);
      endDate = new Date(today.getFullYear(), 11, 31);
    } else if (normalized.period === "custom") {
      startDate = this.normalizeDateInput(normalized.startDate);
      endDate = this.normalizeDateInput(normalized.endDate);
    } else {
      return {
        period: "",
        startDate: "",
        endDate: "",
        valid: false,
      };
    }

    if (!startDate || !endDate) {
      return {
        period: normalized.period,
        startDate: "",
        endDate: "",
        valid: false,
      };
    }

    if (startDate.getTime() > endDate.getTime()) {
      return {
        period: normalized.period,
        startDate: "",
        endDate: "",
        valid: false,
      };
    }

    return {
      period: normalized.period,
      startDate: this.formatDateToIso(startDate),
      endDate: this.formatDateToIso(endDate),
      valid: true,
    };
  }

  getTransactionDateValue(transaction = {}) {
    return this.normalizeText(transaction?.financialDate || transaction?.date);
  }

  isTransactionInRange(transaction = {}, range = {}) {
    if (!range?.valid) return false;

    const transactionDate = this.getTransactionDateValue(transaction);
    if (!transactionDate || !this.isValidDate(transactionDate)) {
      return false;
    }

    return (
      transactionDate >= range.startDate &&
      transactionDate <= range.endDate
    );
  }

  filterTransactionsByPeriod(transactions = [], options = {}) {
    const range = this.createPeriodRange(options);

    if (!range.valid) {
      return Array.isArray(transactions) ? transactions : [];
    }

    return (Array.isArray(transactions) ? transactions : []).filter(
      (transaction) => this.isTransactionInRange(transaction, range)
    );
  }

  buildCsvValue(value) {
    const text = String(value ?? "");
    return `"${text.replaceAll('"', '""')}"`;
  }

  buildCsvRows(transactions = []) {
    const header = [
      "id",
      "type",
      "amount",
      "currency",
      "category",
      "categoryId",
      "categoryDetail",
      "note",
      "financialDate",
      "createdAt",
      "locale",
      "source",
      "entryPoint",
      "placeId",
      "storeName",
    ];

    const rows = transactions.map((transaction) => {
      const meta =
        transaction?.meta && typeof transaction.meta === "object"
          ? transaction.meta
          : {};

      return [
        transaction?.id || "",
        this.normalizeText(transaction?.type),
        this.normalizeNumber(transaction?.amount) ?? "",
        this.normalizeCurrency(transaction?.currency),
        this.normalizeText(transaction?.category),
        this.normalizeText(transaction?.categoryId || meta.categoryId),
        this.normalizeText(transaction?.categoryDetail),
        this.normalizeText(transaction?.note),
        this.getTransactionDateValue(transaction),
        this.normalizeText(transaction?.createdAt),
        this.normalizeLocale(transaction?.locale),
        this.normalizeText(meta.source),
        this.normalizeText(meta.entryPoint),
        this.normalizeText(transaction?.placeId || meta.placeId),
        this.normalizeText(transaction?.receipt?.storeName),
      ];
    });

    return [header, ...rows]
      .map((row) => row.map((cell) => this.buildCsvValue(cell)).join(","))
      .join("\n");
  }

  downloadCsv(filename, content) {
    if (typeof document === "undefined") {
      throw new Error("CSV download is not available in this environment.");
    }

    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const objectUrl = URL.createObjectURL(blob);

    try {
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.style.display = "none";

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  buildExportFilename(options = {}) {
    const range = this.createPeriodRange(options);

    if (range.valid) {
      return `besafe-transactions-${range.period}-${range.startDate}-to-${range.endDate}.csv`;
    }

    return "besafe-transactions.csv";
  }

  buildPlacePayload(payload = {}) {
    const name = this.normalizeText(payload.name);
    const type = this.normalizePlaceType(payload.type);

    const brand = this.normalizeText(payload.brand);
    const country = this.normalizeText(payload.country).toUpperCase();
    const city = this.normalizeText(payload.city);
    const address = this.normalizeText(payload.address);
    const purpose = this.normalizeText(payload.purpose || "expense").toLowerCase();
    const notes = this.normalizeText(payload.notes || payload.note);
    const aliases = this.normalizeStringList(payload.aliases);
    const tags = this.normalizeStringList(payload.tags).map((tag) =>
      tag.toLowerCase()
    );
    const isFavorite = Boolean(payload.isFavorite);
    const meta = this.normalizeMeta(payload.meta);

    if (!name) {
      throw new Error("A valid place name is required.");
    }

    if (!type) {
      throw new Error("A valid place type is required.");
    }

    return {
      name,
      type,
      mode: this.normalizeMode(payload.mode),
      brand,
      country,
      city,
      address,
      purpose,
      notes,
      aliases,
      tags,
      isFavorite,
      meta,
    };
  }

  setTransactionsCache(transactions = []) {
    this.transactionsCache = Array.isArray(transactions) ? [...transactions] : [];
    return this.transactionsCache;
  }

  getAllTransactions() {
    return Array.isArray(this.transactionsCache)
      ? [...this.transactionsCache]
      : [];
  }

  updateTransactionCacheAfterCreate(createdTransaction) {
    if (!createdTransaction || typeof createdTransaction !== "object") {
      return;
    }

    const current = this.getAllTransactions();
    const createdId = this.normalizeText(createdTransaction.id);

    if (createdId) {
      const filtered = current.filter(
        (item) => this.normalizeText(item?.id) !== createdId
      );
      this.setTransactionsCache([createdTransaction, ...filtered]);
      return;
    }

    this.setTransactionsCache([createdTransaction, ...current]);
  }

  updateTransactionCacheAfterDelete(transactionId) {
    const id = this.normalizeText(transactionId);

    if (!id) {
      return;
    }

    const nextTransactions = this.getAllTransactions().filter(
      (transaction) => this.normalizeText(transaction?.id) !== id
    );

    this.setTransactionsCache(nextTransactions);
  }

  /**
   * Fetch categories filtered by active plan mode.
   *
   * @param {string|null} [mode] — Active plan filter:
   *   - undefined (default): filters by getUserPlan() — most common path
   *   - "personal" or "business": explicit mode override
   *   - null: returns ALL records (no filter) — for migration/backfill use cases
   *
   * Cache stays unfiltered (full set); filter applied at return so mode
   * switches don't require cache invalidation. See A2 commit b4aea45 for
   * the parallel pattern in getSummary(mode).
   */
  async getCategories(mode = getUserPlan()) {
    if (!this.apiService) {
      return filterByMode(this.getCategoriesCache(), mode);
    }

    let categories = [];

    if (typeof this.apiService.getCategories === "function") {
      categories = await this.apiService.getCategories();
    } else if (typeof this.apiService.listCategories === "function") {
      categories = await this.apiService.listCategories();
    } else {
      return filterByMode(this.getCategoriesCache(), mode);
    }

    const normalizedCategories = Array.isArray(categories)
      ? categories
      : Array.isArray(categories?.categories)
        ? categories.categories
        : Array.isArray(categories?.data)
          ? categories.data
          : [];

    this.setCategoriesCache(normalizedCategories);
    return filterByMode(normalizedCategories, mode);
  }

  async createCategory(payload = {}) {
    const normalizedPayload = this.normalizeCategoryPayload(payload);

    if (!this.apiService) {
      this.updateCategoryCacheAfterCreate(normalizedPayload);
      return normalizedPayload;
    }

    let createdCategory = null;

    if (typeof this.apiService.createCategory === "function") {
      createdCategory = await this.apiService.createCategory(normalizedPayload);
    } else if (typeof this.apiService.addCategory === "function") {
      createdCategory = await this.apiService.addCategory(normalizedPayload);
    } else if (typeof this.apiService.saveCategory === "function") {
      createdCategory = await this.apiService.saveCategory(normalizedPayload);
    } else {
      this.updateCategoryCacheAfterCreate(normalizedPayload);
      return normalizedPayload;
    }

    const normalizedCreated =
      createdCategory?.data && typeof createdCategory.data === "object"
        ? createdCategory.data
        : createdCategory?.category && typeof createdCategory.category === "object"
          ? createdCategory.category
          : createdCategory;

    this.updateCategoryCacheAfterCreate(normalizedCreated);
    return normalizedCreated;
  }

  async deleteCategory(categoryId) {
    const id = this.normalizeText(categoryId);

    if (!id) {
      throw new Error("A valid category id is required.");
    }

    if (!this.apiService) {
      this.updateCategoryCacheAfterDelete(id);
      return { ok: true };
    }

    if (typeof this.apiService.deleteCategory === "function") {
      const result = await this.apiService.deleteCategory(id);
      this.updateCategoryCacheAfterDelete(id);
      return result;
    }

    if (typeof this.apiService.deleteCategoryById === "function") {
      const result = await this.apiService.deleteCategoryById(id);
      this.updateCategoryCacheAfterDelete(id);
      return result;
    }

    if (typeof this.apiService.removeCategory === "function") {
      const result = await this.apiService.removeCategory(id);
      this.updateCategoryCacheAfterDelete(id);
      return result;
    }

    this.updateCategoryCacheAfterDelete(id);
    return { ok: true };
  }

  async deleteCategoryById(categoryId) {
    return this.deleteCategory(categoryId);
  }

  /**
   * Fetch places filtered by active plan mode.
   *
   * @param {string|null} [mode] — Active plan filter:
   *   - undefined (default): filters by getUserPlan() — most common path
   *   - "personal" or "business": explicit mode override
   *   - null: returns ALL records (no filter) — for migration/backfill use cases
   *
   * Cache stays unfiltered (full set); filter applied at return so mode
   * switches don't require cache invalidation. See A2 commit b4aea45 for
   * the parallel pattern in getSummary(mode).
   */
  async getPlaces(mode = getUserPlan()) {
    if (!this.apiService) {
      return filterByMode(this.getPlacesCache(), mode);
    }

    let places = [];

    if (typeof this.apiService.getPlaces === "function") {
      places = await this.apiService.getPlaces();
    } else if (typeof this.apiService.listPlaces === "function") {
      places = await this.apiService.listPlaces();
    } else {
      return filterByMode(this.getPlacesCache(), mode);
    }

    if (!Array.isArray(places)) {
      return [];
    }

    const normalizedPlaces = places.map((place) => ({
      ...place,
      id: this.normalizeOptionalId(place?.id),
    }));

    this.setPlacesCache(normalizedPlaces);
    return filterByMode(normalizedPlaces, mode);
  }

  async createPlace(payload = {}) {
    const normalizedPayload = this.buildPlacePayload(payload);

    if (!this.apiService) {
      this.updatePlaceCacheAfterCreate(normalizedPayload);
      return normalizedPayload;
    }

    let createdPlace = null;

    if (typeof this.apiService.createPlace === "function") {
      createdPlace = await this.apiService.createPlace(normalizedPayload);
    } else if (typeof this.apiService.addPlace === "function") {
      createdPlace = await this.apiService.addPlace(normalizedPayload);
    } else if (typeof this.apiService.savePlace === "function") {
      createdPlace = await this.apiService.savePlace(normalizedPayload);
    } else {
      throw new Error("Place saving is not available.");
    }

    const mergedCreatedPlace = {
      ...normalizedPayload,
      ...(createdPlace && typeof createdPlace === "object" ? createdPlace : {}),
      purpose: this.normalizeText(
        createdPlace?.purpose || normalizedPayload.purpose || "expense"
      ).toLowerCase(),
    };

    this.updatePlaceCacheAfterCreate(mergedCreatedPlace);
    return mergedCreatedPlace;
  }

  openCategoryModal(options = {}) {
    try {
      if (window.location.hash !== "#/categories") {
        window.location.hash = "#/categories";
      }

      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("besafe:open-category-create", {
           detail: {
              source: options?.source || "quick-actions",
            },
          })
        );
      }, 50);

      return true;
    } catch (error) {
      console.warn("[TransactionService] openCategoryModal failed:", error);
      return false;
    }
  }

  async deletePlace(placeId) {
    const id = this.normalizeText(placeId);

    if (!id) {
      throw new Error("A valid place id is required.");
    }

    if (!this.apiService) {
      throw new Error("Place deletion is not available.");
    }

    if (typeof this.apiService.deletePlace === "function") {
      return this.apiService.deletePlace(id);
    }

    if (typeof this.apiService.deletePlaceById === "function") {
      return this.apiService.deletePlaceById(id);
    }

    if (typeof this.apiService.removePlace === "function") {
      return this.apiService.removePlace(id);
    }

    throw new Error("Place deletion is not available.");
  }

  async deletePlaceById(placeId) {
    return this.deletePlace(placeId);
  }

  async createTransaction(payload = {}) {
    const normalizedPayload = this.buildCreatePayload(payload);

    let createdTransaction = null;

    if (
      this.apiService &&
      typeof this.apiService.createTransaction === "function"
    ) {
      createdTransaction = await this.apiService.createTransaction(
        normalizedPayload
      );
      this.updateTransactionCacheAfterCreate(createdTransaction);
      return createdTransaction;
    }

    if (
      normalizedPayload.type === "expense" &&
      this.apiService &&
      typeof this.apiService.addExpense === "function"
    ) {
      createdTransaction = await this.apiService.addExpense(normalizedPayload);
      this.updateTransactionCacheAfterCreate(createdTransaction);
      return createdTransaction;
    }

    if (
      normalizedPayload.type === "income" &&
      this.apiService &&
      typeof this.apiService.addIncome === "function"
    ) {
      createdTransaction = await this.apiService.addIncome(normalizedPayload);
      this.updateTransactionCacheAfterCreate(createdTransaction);
      return createdTransaction;
    }

    throw new Error("Transaction saving is not available.");
  }

  async deleteTransaction(transactionId) {
    const id = this.normalizeText(transactionId);

    if (!id) {
      throw new Error("A valid transaction id is required.");
    }

    if (
      this.apiService &&
      typeof this.apiService.deleteTransaction === "function"
    ) {
      const result = await this.apiService.deleteTransaction(id);
      this.updateTransactionCacheAfterDelete(id);
      return result;
    }

    if (
      this.apiService &&
      typeof this.apiService.deleteTransactionById === "function"
    ) {
      const result = await this.apiService.deleteTransactionById(id);
      this.updateTransactionCacheAfterDelete(id);
      return result;
    }

    throw new Error("Transaction deletion is not available.");
  }

  async deleteTransactionById(transactionId) {
    return this.deleteTransaction(transactionId);
  }

  /**
   * Fetch transactions filtered by active plan mode.
   *
   * @param {string|null} [mode] — Active plan filter:
   *   - undefined (default): filters by getUserPlan() — most common path
   *   - "personal" or "business": explicit mode override
   *   - null: returns ALL records (no filter) — for migration/backfill use cases
   *
   * Cache stays unfiltered (full set); filter applied at return so mode
   * switches don't require cache invalidation. See A2 commit b4aea45 for
   * the parallel pattern in getSummary(mode).
   */
  async getTransactions(mode = getUserPlan()) {
    if (
      this.apiService &&
      typeof this.apiService.getTransactions === "function"
    ) {
      const transactions = await this.apiService.getTransactions();
      this.setTransactionsCache(transactions);
      return filterByMode(transactions, mode);
    }

    return filterByMode(this.getAllTransactions(), mode);
  }

  async getAll() {
    return this.getTransactions();
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

  async exportTransactions(options = {}) {
    const normalizedOptions = this.normalizeExportOptions(options);
    const hasPeriodFilter = this.isSupportedExportPeriod(
      normalizedOptions.period
    );
    const range = hasPeriodFilter
      ? this.createPeriodRange(normalizedOptions)
      : null;

    const hasValidRange =
      hasPeriodFilter &&
      normalizedOptions.period !== "custom"
        ? !!range?.valid
        : normalizedOptions.period === "custom"
          ? !!range?.valid
          : false;

    if (
      this.apiService &&
      typeof this.apiService.exportTransactions === "function"
    ) {
      try {
        if (hasPeriodFilter) {
          return await this.apiService.exportTransactions({
            period: normalizedOptions.period,
            startDate: range?.startDate || normalizedOptions.startDate || "",
            endDate: range?.endDate || normalizedOptions.endDate || "",
          });
        }

        return await this.apiService.exportTransactions();
      } catch (error) {
        console.warn(
          "[TransactionService] API export failed, falling back to local CSV export:",
          error
        );
      }
    }

    if (normalizedOptions.period === "custom" && !hasValidRange) {
      throw new Error("A valid custom export range is required.");
    }

    const transactions = await this.getTransactions();
    const filteredTransactions = hasPeriodFilter
      ? this.filterTransactionsByPeriod(transactions, normalizedOptions)
      : Array.isArray(transactions)
        ? transactions
        : [];

    const csvContent = this.buildCsvRows(filteredTransactions);
    const filename = this.buildExportFilename(normalizedOptions);

    this.downloadCsv(filename, csvContent);

    return {
      ok: true,
      format: "csv",
      filename,
      transactionCount: filteredTransactions.length,
      period: normalizedOptions.period || "",
      startDate: range?.startDate || "",
      endDate: range?.endDate || "",
    };
  }

  async getSavedCalculations(modeArg) {
    if (!this.apiService || typeof this.apiService.request !== "function") {
      return [];
    }

    // Phase 4+ Mode Separation (Sesija A2): scope to active plan
    // mode unless caller explicitly passes a mode arg (pass null
    // for unfiltered admin/debug paths). Q5 of mode separation
    // principle — Saved Calculations are mode-bucketed too.
    const mode = arguments.length > 0 ? modeArg : getUserPlan();

    const items = await this.apiService.request("/api/saved-calculations");
    if (!Array.isArray(items)) return [];
    return filterByMode(items, mode);
  }

  async createSavedCalculation(payload = {}) {
    if (!this.apiService || typeof this.apiService.request !== "function") {
      throw new Error("API service not available");
    }

    // Phase 4+ Mode Separation: stamp `mode` so saved calculations are
    // bucketed by the user's active plan (Personal vs Business).
    // No buildSavedCalculationPayload helper exists yet — inline the
    // mode injection here to avoid a wider refactor in Sesija A1.
    const payloadWithMode = {
      ...payload,
      mode: this.normalizeMode(payload?.mode),
    };

    return await this.apiService.request("/api/saved-calculations", {
      method: "POST",
      body: JSON.stringify(payloadWithMode),
    });
  }

  async deleteSavedCalculation(id) {
    const safeId = String(id ?? "").trim();

    if (!this.apiService || typeof this.apiService.request !== "function") {
      throw new Error("API service not available");
    }

    return await this.apiService.request(
      `/api/saved-calculations/${encodeURIComponent(safeId)}`,
      {
        method: "DELETE",
      }
    );
  }
}

