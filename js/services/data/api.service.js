export class ApiService {
  constructor({ baseUrl, timeoutMs } = {}) {
    const isLocal = typeof window !== "undefined" &&
      (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost");
    this.baseUrl = baseUrl || (isLocal ? "http://127.0.0.1:3001" : "https://besafe-oga3.onrender.com");
    this.timeoutMs = Number(timeoutMs || 8000);
  }

  buildUrl(path = "") {
    return `${this.baseUrl}${path}`;
  }

  createHeaders(extraHeaders = {}, hasBody = false) {
    return {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...extraHeaders,
    };
  }

  async parseErrorResponse(response) {
    try {
      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const json = await response.json();
        return (
          json?.error ||
          json?.message ||
          JSON.stringify(json) ||
          "The server returned an unknown error."
        );
      }

      const text = await response.text();
      return text || "The server returned an empty error response.";
    } catch {
      return "The server error response could not be read.";
    }
  }

  async parseSuccessResponse(response) {
    if (response.status === 204) {
      return null;
    }

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      const text = await response.text();
      return text || null;
    }

    const rawText = await response.text();

    if (!rawText.trim()) {
      return null;
    }

    try {
      return JSON.parse(rawText);
    } catch {
      throw new Error("The server response could not be parsed as JSON.");
    }
  }

  async request(path, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    const hasBody = options.body !== undefined && options.body !== null;

    let response;

    try {
      response = await fetch(this.buildUrl(path), {
        ...options,
        headers: this.createHeaders(options.headers || {}, hasBody),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeoutId);

      const reason =
        error?.name === "AbortError"
          ? `The request exceeded the ${this.timeoutMs} ms timeout.`
          : error?.message || "Unknown network error.";

      throw new Error(
        `The backend server at ${this.baseUrl} could not be reached. Request to "${path}" failed. Reason: ${reason}`
      );
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      const message = await this.parseErrorResponse(response);

      throw new Error(
        `The server returned an error: ${response.status} ${response.statusText}. ${message}`
      );
    }

    return this.parseSuccessResponse(response);
  }

  hasOwn(object, key) {
    return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
  }

  normalizeId(recordId) {
    const safeId = String(recordId ?? "").trim();

    if (!safeId) {
      throw new Error("A valid record ID is required.");
    }

    return safeId;
  }

  normalizeOptionalId(value) {
    const safeId = String(value ?? "").trim();
    return safeId || null;
  }

  normalizeText(value, fallback = "") {
    if (typeof value !== "string") {
      return fallback;
    }

    const normalized = value.trim();
    return normalized || fallback;
  }

  normalizeOptionalText(value) {
    return this.normalizeText(value, "");
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

  roundCurrencyAmount(value) {
    if (!Number.isFinite(value)) {
      return Number.NaN;
    }

    return Math.round(value * 100) / 100;
  }

  parseAmountValue(value) {
    if (typeof value === "number") {
      return Number.isFinite(value)
        ? this.roundCurrencyAmount(value)
        : Number.NaN;
    }

    const raw = String(value ?? "").trim();
    if (!raw) {
      return Number.NaN;
    }

    const compact = raw
      .replace(/\s+/g, "")
      .replace(/[€$£¥₽₹]/g, "")
      .replace(/'/g, "");

    if (!compact) {
      return Number.NaN;
    }

    const signless = compact.replace(/(?!^)-/g, "");
    const cleaned = signless.replace(/[^\d,.-]/g, "");

    if (!cleaned) {
      return Number.NaN;
    }

    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    const decimalIndex = Math.max(lastComma, lastDot);

    let normalized = cleaned;

    if (decimalIndex !== -1) {
      const integerPart = cleaned.slice(0, decimalIndex).replace(/[.,]/g, "");
      const decimalPart = cleaned
        .slice(decimalIndex + 1)
        .replace(/[.,]/g, "");
      normalized = `${integerPart || "0"}.${decimalPart}`;

      if (cleaned.startsWith("-")) {
        normalized = `-${normalized}`;
      }
    } else {
      normalized = cleaned.replace(/[.,]/g, "");
    }

    const amount = Number(normalized);
    return Number.isFinite(amount)
      ? this.roundCurrencyAmount(amount)
      : Number.NaN;
  }

  normalizeAmount(value) {
    const amount = this.parseAmountValue(value);

    if (!Number.isFinite(amount)) {
      throw new Error("Amount must be a valid number.");
    }

    return amount;
  }

  normalizeNullableAmount(value) {
    if (value === undefined || value === null || value === "") {
      return null;
    }

    const amount = this.parseAmountValue(value);

    if (!Number.isFinite(amount)) {
      return null;
    }

    return amount;
  }

  normalizeNullableNumber(value) {
    if (value === undefined || value === null || value === "") {
      return null;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  normalizeType(value) {
    if (value === "income") return "income";
    if (value === "expense") return "expense";
    throw new Error("Transaction type must be either income or expense.");
  }

  normalizeDate(value) {
    if (typeof value !== "string" || !value.trim()) {
      return new Date().toISOString().slice(0, 10);
    }

    const trimmed = value.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    const parsed = new Date(trimmed);

    if (Number.isNaN(parsed.getTime())) {
      throw new Error("Date must be in a valid format.");
    }

    return parsed.toISOString().slice(0, 10);
  }

  resolveFinancialDate(payload = {}) {
    if (this.hasOwn(payload, "financialDate")) {
      return payload.financialDate;
    }

    if (this.hasOwn(payload, "date")) {
      return payload.date;
    }

    return undefined;
  }

  normalizeCurrency(value) {
    const safeValue = this.normalizeText(value, "").toUpperCase();
    return safeValue || "EUR";
  }

  normalizeLocale(value) {
    return this.normalizeText(value, "en").toLowerCase();
  }

  normalizeCategory(value, fallback = "other") {
    const normalized = this.normalizeText(value, fallback).toLowerCase();
    return normalized || fallback;
  }

  normalizeCategoryDetail(category, value) {
    const normalizedCategory = this.normalizeCategory(category, "other");
    if (normalizedCategory !== "other") return "";
    return this.normalizeText(value, "");
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
      source: this.normalizeText(meta.source, "manual"),
      entryPoint: this.normalizeText(meta.entryPoint, "unknown"),
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

  normalizeConfidence(value) {
    const normalized = this.normalizeText(value, "").toLowerCase();
    if (!normalized) return null;

    const allowed = ["low", "medium", "high"];
    return allowed.includes(normalized) ? normalized : null;
  }

  normalizePlaceType(value) {
    const normalized = this.normalizeText(value, "").toLowerCase();

    if (!normalized) {
      return "other";
    }

    const compact = normalized.replaceAll("-", "_").replaceAll(" ", "_");

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

    if (compact === "bank" || compact === "bankas") {
      return "bank";
    }

    const allowed = ["store", "transport", "housing", "bank", "other"];

    return allowed.includes(compact) ? compact : "other";
  }

  normalizeReceiptItems(items) {
    if (!Array.isArray(items)) return [];

    return items
      .map((item) => {
        const name = this.normalizeOptionalText(item?.name) || null;
        const price = this.normalizeNullableAmount(item?.price);
        const quantity = this.normalizeNullableNumber(item?.quantity);
        const category =
          this.normalizeOptionalText(item?.category).toLowerCase() || null;
        const confidence = this.normalizeConfidence(item?.confidence);

        if (!name && price === null) return null;

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

  normalizeCategorySummary(categorySummary) {
    if (!Array.isArray(categorySummary)) return [];

    return categorySummary
      .map((item) => {
        const category = this.normalizeOptionalText(item?.category).toLowerCase();
        const amount = this.normalizeNullableAmount(item?.amount);

        if (!category || amount === null) return null;

        return {
          category,
          amount,
        };
      })
      .filter(Boolean);
  }

  normalizeReceipt(receipt = {}, rootPayload = {}, options = {}) {
    const { fallbackReceipt = null } = options;

    if (receipt === null) {
      return null;
    }

    const safeReceipt =
      receipt && typeof receipt === "object" && !Array.isArray(receipt)
        ? receipt
        : null;

    const existingReceipt =
      fallbackReceipt &&
      typeof fallbackReceipt === "object" &&
      !Array.isArray(fallbackReceipt)
        ? fallbackReceipt
        : null;

    if (!safeReceipt && !existingReceipt) {
      return null;
    }

    const merged = existingReceipt
      ? { ...existingReceipt, ...(safeReceipt || {}) }
      : safeReceipt || null;

    if (!merged) {
      return null;
    }

    const rootFinancialDate = this.resolveFinancialDate(rootPayload);
    const rootMeta = this.normalizeMeta(rootPayload.meta);
    const resolvedPlaceId = this.normalizeOptionalId(
      merged.placeId ?? rootPayload.placeId ?? rootMeta.placeId
    );

    return {
      receiptId: this.normalizeOptionalText(merged.receiptId) || null,
      source:
        this.normalizeOptionalText(merged.source) ||
        rootMeta.source ||
        "manual",
      placeId: resolvedPlaceId,
      storeName:
        this.normalizeOptionalText(merged.storeName ?? merged.placeName) ||
        null,
      purchaseDate: merged.purchaseDate
        ? this.normalizeDate(merged.purchaseDate)
        : rootFinancialDate
          ? this.normalizeDate(rootFinancialDate)
          : null,
      totalAmount:
        merged.totalAmount !== undefined && merged.totalAmount !== null
          ? this.normalizeAmount(merged.totalAmount)
          : rootPayload.amount !== undefined && rootPayload.amount !== null
            ? this.normalizeAmount(rootPayload.amount)
            : null,
      currency: this.normalizeCurrency(merged.currency || rootPayload.currency),
      locale: this.normalizeLocale(merged.locale || rootPayload.locale),
      rawText: this.normalizeOptionalText(merged.rawText) || null,
      scanConfidence: this.normalizeConfidence(merged.scanConfidence),
      userConfirmed:
        typeof merged.userConfirmed === "boolean" ? merged.userConfirmed : null,
      items: this.normalizeReceiptItems(merged.items),
      categorySummary: this.normalizeCategorySummary(merged.categorySummary),
    };
  }

  normalizeCategoryPayload(payload = {}) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Category payload must be an object.");
    }

    const name = this.normalizeText(payload.name, "");
    if (!name) {
      throw new Error("Category name is required.");
    }

    const type = this.normalizeType(payload.type);

    const normalized = {
      name,
      type,
    };

    if (this.hasOwn(payload, "id")) {
      normalized.id = this.normalizeOptionalId(payload.id);
    }

    if (this.hasOwn(payload, "createdAt")) {
      normalized.createdAt = this.normalizeOptionalText(payload.createdAt);
    }

    return Object.fromEntries(
      Object.entries(normalized).filter(([, value]) => value !== undefined)
    );
  }

  normalizePartialCategoryPayload(payload = {}) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Category update payload must be an object.");
    }

    const normalized = {};

    if (this.hasOwn(payload, "name")) {
      const name = this.normalizeText(payload.name, "");
      if (!name) {
        throw new Error("Category name is required.");
      }
      normalized.name = name;
    }

    if (this.hasOwn(payload, "type")) {
      normalized.type = this.normalizeType(payload.type);
    }

    return normalized;
  }

  normalizeTransactionPayload(payload = {}) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Transaction payload must be an object.");
    }

    const financialDate = this.normalizeDate(this.resolveFinancialDate(payload));
    const meta = this.normalizeMeta(payload.meta);
    const placeId = this.normalizeOptionalId(payload.placeId ?? meta.placeId);
    const categoryId = this.normalizeOptionalId(
      payload.categoryId ?? meta.categoryId
    );

    const normalized = {
      type: this.normalizeType(payload.type),
      amount: this.normalizeAmount(payload.amount),
      category: this.normalizeCategory(payload.category, "other"),
      note: this.normalizeOptionalText(payload.note),
      date: financialDate,
      financialDate,
      currency: this.normalizeCurrency(payload.currency),
      locale: this.normalizeLocale(payload.locale),
      placeId,
      categoryId,
      meta: {
        ...meta,
        ...(placeId ? { placeId } : {}),
        ...(categoryId ? { categoryId } : {}),
      },
    };

    const categoryDetail = this.normalizeCategoryDetail(
      normalized.category,
      payload.categoryDetail
    );

    if (normalized.category === "other" && categoryDetail) {
      normalized.categoryDetail = categoryDetail;
    }

    const receipt = this.normalizeReceipt(
      payload.receipt,
      {
        ...payload,
        placeId: normalized.placeId,
        meta: normalized.meta,
        financialDate,
        date: financialDate,
        currency: normalized.currency,
        locale: normalized.locale,
        amount: normalized.amount,
      }
    );

    if (receipt !== null) {
      normalized.receipt = receipt;
    } else if (this.hasOwn(payload, "receipt")) {
      normalized.receipt = null;
    }

    return normalized;
  }

  normalizePartialTransactionPayload(payload = {}) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Transaction update payload must be an object.");
    }

    const normalized = {};
    const metaWasProvided = this.hasOwn(payload, "meta");
    const receiptWasProvided = this.hasOwn(payload, "receipt");

    if (this.hasOwn(payload, "type")) {
      normalized.type = this.normalizeType(payload.type);
    }

    if (this.hasOwn(payload, "amount")) {
      normalized.amount = this.normalizeAmount(payload.amount);
    }

    if (this.hasOwn(payload, "category")) {
      normalized.category = this.normalizeCategory(payload.category, "other");
    }

    if (this.hasOwn(payload, "categoryId")) {
      normalized.categoryId = this.normalizeOptionalId(payload.categoryId);
    }

    if (this.hasOwn(payload, "note")) {
      normalized.note = this.normalizeOptionalText(payload.note);
    }

    if (this.hasOwn(payload, "financialDate") || this.hasOwn(payload, "date")) {
      const financialDate = this.normalizeDate(this.resolveFinancialDate(payload));
      normalized.date = financialDate;
      normalized.financialDate = financialDate;
    }

    if (this.hasOwn(payload, "currency")) {
      normalized.currency = this.normalizeCurrency(payload.currency);
    }

    if (this.hasOwn(payload, "locale")) {
      normalized.locale = this.normalizeLocale(payload.locale);
    }

    if (this.hasOwn(payload, "placeId")) {
      normalized.placeId = this.normalizeOptionalId(payload.placeId);
    }

    if (
      this.hasOwn(payload, "categoryDetail") ||
      this.hasOwn(payload, "category")
    ) {
      const safeCategory =
        normalized.category ??
        this.normalizeCategory(payload.category, "other");

      const safeDetail = this.normalizeCategoryDetail(
        safeCategory,
        payload.categoryDetail
      );

      if (safeCategory === "other" && safeDetail) {
        normalized.categoryDetail = safeDetail;
      } else if (this.hasOwn(payload, "categoryDetail")) {
        normalized.categoryDetail = "";
      }
    }

    if (
      metaWasProvided ||
      this.hasOwn(payload, "placeId") ||
      this.hasOwn(payload, "categoryId")
    ) {
      const meta = metaWasProvided ? this.normalizeMeta(payload.meta) : {};
      const resolvedPlaceId = this.hasOwn(normalized, "placeId")
        ? normalized.placeId
        : this.normalizeOptionalId(meta.placeId);
      const resolvedCategoryId = this.hasOwn(normalized, "categoryId")
        ? normalized.categoryId
        : this.normalizeOptionalId(meta.categoryId);

      normalized.meta = {
        ...meta,
        ...(resolvedPlaceId ? { placeId: resolvedPlaceId } : {}),
        ...(resolvedCategoryId ? { categoryId: resolvedCategoryId } : {}),
      };
    }

    if (receiptWasProvided) {
      const receipt = this.normalizeReceipt(payload.receipt, {
        ...payload,
        placeId: this.hasOwn(normalized, "placeId")
          ? normalized.placeId
          : payload.placeId,
        financialDate:
          normalized.financialDate ?? payload.financialDate ?? payload.date,
        date:
          normalized.date ?? payload.date ?? payload.financialDate,
        meta: this.hasOwn(normalized, "meta") ? normalized.meta : payload.meta,
        currency: normalized.currency ?? payload.currency,
        locale: normalized.locale ?? payload.locale,
        amount: normalized.amount ?? payload.amount,
      });

      normalized.receipt = receipt;
    }

    return normalized;
  }

  normalizePlacePayload(payload = {}) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Place payload must be an object.");
    }

    const name = this.normalizeText(payload.name, "");

    if (!name) {
      throw new Error("Place name is required.");
    }

    const normalized = {
      name,
      type: this.normalizePlaceType(payload.type),
      brand: this.normalizeOptionalText(payload.brand),
      country: this.normalizeOptionalText(payload.country).toUpperCase(),
      city: this.normalizeOptionalText(payload.city),
      address: this.normalizeOptionalText(payload.address),
      purpose: this.normalizeText(payload.purpose || "expense").toLowerCase(),
      notes: this.normalizeOptionalText(payload.notes),
      aliases: this.normalizeStringList(payload.aliases),
      tags: this.normalizeStringList(payload.tags).map((tag) =>
        tag.toLowerCase()
      ),
      isFavorite: Boolean(payload.isFavorite),
      meta: this.normalizeMeta(payload.meta),
    };

    return normalized;
  }

  normalizePartialPlacePayload(payload = {}) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Place update payload must be an object.");
    }

    const normalized = {};

    if (this.hasOwn(payload, "name")) {
      const name = this.normalizeText(payload.name, "");
      if (!name) {
        throw new Error("Place name is required.");
      }
      normalized.name = name;
    }

    if (this.hasOwn(payload, "type")) {
      normalized.type = this.normalizePlaceType(payload.type);
    }

    if (this.hasOwn(payload, "brand")) {
      normalized.brand = this.normalizeOptionalText(payload.brand);
    }

    if (this.hasOwn(payload, "country")) {
      normalized.country = this.normalizeOptionalText(payload.country).toUpperCase();
    }

    if (this.hasOwn(payload, "city")) {
      normalized.city = this.normalizeOptionalText(payload.city);
    }

    if (this.hasOwn(payload, "address")) {
      normalized.address = this.normalizeOptionalText(payload.address);
    }

    if (this.hasOwn(payload, "notes")) {
      normalized.notes = this.normalizeOptionalText(payload.notes);
    }

    if (this.hasOwn(payload, "aliases")) {
      normalized.aliases = this.normalizeStringList(payload.aliases);
    }

    if (this.hasOwn(payload, "tags")) {
      normalized.tags = this.normalizeStringList(payload.tags).map((tag) =>
        tag.toLowerCase()
      );
    }

    if (this.hasOwn(payload, "isFavorite")) {
      normalized.isFavorite = Boolean(payload.isFavorite);
    }

    if (this.hasOwn(payload, "meta")) {
      normalized.meta = this.normalizeMeta(payload.meta);
    }

    return normalized;
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
      period: this.normalizeText(options.period, ""),
      startDate: this.normalizeText(options.startDate, ""),
      endDate: this.normalizeText(options.endDate, ""),
    };
  }

  buildExportQuery(options = {}) {
    const normalized = this.normalizeExportOptions(options);
    const params = new URLSearchParams();

    if (normalized.period) {
      params.set("period", normalized.period);
    }

    if (normalized.startDate) {
      params.set("startDate", normalized.startDate);
    }

    if (normalized.endDate) {
      params.set("endDate", normalized.endDate);
    }

    const query = params.toString();
    return query ? `?${query}` : "";
  }

  // ---------------------------------------------------------------------------
  // Electron detection
  // ---------------------------------------------------------------------------

  get isElectron() {
    return typeof window !== "undefined" && window.electronAPI != null;
  }

  // ---------------------------------------------------------------------------
  // Transactions
  // ---------------------------------------------------------------------------

  async getTransactions() {
    if (this.isElectron) return window.electronAPI.getTransactions();
    return this.request("/api/transactions");
  }

  async getTransactionById(transactionId) {
    const safeId = this.normalizeId(transactionId);
    if (this.isElectron) return window.electronAPI.getTransactionById(safeId);
    return this.request(`/api/transactions/${encodeURIComponent(safeId)}`);
  }

  async createTransaction(payload) {
    const safePayload = this.normalizeTransactionPayload(payload);
    if (this.isElectron) return window.electronAPI.createTransaction(safePayload);

    return this.request("/api/transactions", {
      method: "POST",
      body: JSON.stringify(safePayload),
    });
  }

  async updateTransaction(transactionId, payload) {
    const safeId = this.normalizeId(transactionId);
    const safePayload = this.normalizeTransactionPayload(payload);
    if (this.isElectron) return window.electronAPI.updateTransaction(safeId, safePayload);

    return this.request(`/api/transactions/${encodeURIComponent(safeId)}`, {
      method: "PUT",
      body: JSON.stringify(safePayload),
    });
  }

  async patchTransaction(transactionId, payload) {
    const safeId = this.normalizeId(transactionId);
    const safePayload = this.normalizePartialTransactionPayload(payload);
    if (this.isElectron) return window.electronAPI.patchTransaction(safeId, safePayload);

    return this.request(`/api/transactions/${encodeURIComponent(safeId)}`, {
      method: "PATCH",
      body: JSON.stringify(safePayload),
    });
  }

  async deleteTransaction(transactionId) {
    const safeId = this.normalizeId(transactionId);
    if (this.isElectron) return window.electronAPI.deleteTransaction(safeId);

    return this.request(`/api/transactions/${encodeURIComponent(safeId)}`, {
      method: "DELETE",
    });
  }

  // ---------------------------------------------------------------------------
  // Categories
  // ---------------------------------------------------------------------------

  async getCategories() {
    if (this.isElectron) return window.electronAPI.getCategories();
    return this.request("/api/categories");
  }

  async getCategoryById(categoryId) {
    const safeId = this.normalizeId(categoryId);
    if (this.isElectron) return window.electronAPI.getCategoryById(safeId);
    return this.request(`/api/categories/${encodeURIComponent(safeId)}`);
  }

  async createCategory(payload) {
    const safePayload = this.normalizeCategoryPayload(payload);
    if (this.isElectron) return window.electronAPI.createCategory(safePayload);

    return this.request("/api/categories", {
      method: "POST",
      body: JSON.stringify(safePayload),
    });
  }

  async updateCategory(categoryId, payload) {
    const safeId = this.normalizeId(categoryId);
    const safePayload = this.normalizeCategoryPayload(payload);
    if (this.isElectron) return window.electronAPI.updateCategory(safeId, safePayload);

    return this.request(`/api/categories/${encodeURIComponent(safeId)}`, {
      method: "PUT",
      body: JSON.stringify(safePayload),
    });
  }

  async patchCategory(categoryId, payload) {
    const safeId = this.normalizeId(categoryId);
    const safePayload = this.normalizePartialCategoryPayload(payload);
    if (this.isElectron) return window.electronAPI.patchCategory(safeId, safePayload);

    return this.request(`/api/categories/${encodeURIComponent(safeId)}`, {
      method: "PATCH",
      body: JSON.stringify(safePayload),
    });
  }

  async deleteCategory(categoryId) {
    const safeId = this.normalizeId(categoryId);
    if (this.isElectron) return window.electronAPI.deleteCategory(safeId);

    return this.request(`/api/categories/${encodeURIComponent(safeId)}`, {
      method: "DELETE",
    });
  }

  // ---------------------------------------------------------------------------
  // Places
  // ---------------------------------------------------------------------------

  async getPlaces() {
    if (this.isElectron) return window.electronAPI.getPlaces();
    return this.request("/api/places");
  }

  async getPlaceById(placeId) {
    const safeId = this.normalizeId(placeId);
    if (this.isElectron) return window.electronAPI.getPlaceById(safeId);
    return this.request(`/api/places/${encodeURIComponent(safeId)}`);
  }

  async createPlace(payload) {
    const safePayload = this.normalizePlacePayload(payload);
    if (this.isElectron) return window.electronAPI.createPlace(safePayload);

    return this.request("/api/places", {
      method: "POST",
      body: JSON.stringify(safePayload),
    });
  }

  async updatePlace(placeId, payload) {
    const safeId = this.normalizeId(placeId);
    const safePayload = this.normalizePlacePayload(payload);
    if (this.isElectron) return window.electronAPI.updatePlace(safeId, safePayload);

    return this.request(`/api/places/${encodeURIComponent(safeId)}`, {
      method: "PUT",
      body: JSON.stringify(safePayload),
    });
  }

  async patchPlace(placeId, payload) {
    const safeId = this.normalizeId(placeId);
    const safePayload = this.normalizePartialPlacePayload(payload);
    if (this.isElectron) return window.electronAPI.patchPlace(safeId, safePayload);

    return this.request(`/api/places/${encodeURIComponent(safeId)}`, {
      method: "PATCH",
      body: JSON.stringify(safePayload),
    });
  }

  async deletePlace(placeId) {
    const safeId = this.normalizeId(placeId);
    if (this.isElectron) return window.electronAPI.deletePlace(safeId);

    return this.request(`/api/places/${encodeURIComponent(safeId)}`, {
      method: "DELETE",
    });
  }

  // ---------------------------------------------------------------------------
  // Saved Calculations
  // ---------------------------------------------------------------------------

  async getSavedCalculations() {
    if (this.isElectron) return window.electronAPI.getSavedCalculations();
    return this.request("/api/saved-calculations");
  }

  async createSavedCalculation(payload) {
    if (this.isElectron) return window.electronAPI.createSavedCalculation(payload);

    return this.request("/api/saved-calculations", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async deleteSavedCalculation(calculationId) {
    const safeId = this.normalizeId(calculationId);
    if (this.isElectron) return window.electronAPI.deleteSavedCalculation(safeId);

    return this.request(`/api/saved-calculations/${encodeURIComponent(safeId)}`, {
      method: "DELETE",
    });
  }

  // ---------------------------------------------------------------------------
  // Summary, Export, Health
  // ---------------------------------------------------------------------------

  async getSummary() {
    if (this.isElectron) return window.electronAPI.getSummary();
    return this.request("/api/summary");
  }

  async exportTransactions(options = {}) {
    if (this.isElectron) return window.electronAPI.exportTransactions();
    const query = this.buildExportQuery(options);
    return this.request(`/api/transactions/export${query}`);
  }

  async health() {
    if (this.isElectron) return window.electronAPI.health();
    return this.request("/health");
  }
}