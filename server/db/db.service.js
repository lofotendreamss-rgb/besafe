import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, "db.json");

class DbService {
  async read() {
    try {
      const raw = await fs.readFile(DB_FILE, "utf-8");
      const data = JSON.parse(raw);

      if (!data || typeof data !== "object" || Array.isArray(data)) {
        return this.createEmptyDb();
      }

      const safeData = {
        ...this.createEmptyDb(),
        ...data,
      };

      const places = this.normalizePlaces(safeData.places);
      const categories = this.normalizeCategories(safeData.categories);
      const transactions = this.normalizeTransactions(
        safeData.transactions,
        places,
        categories
      );
      const savedCalculations = this.normalizeSavedCalculations(
        safeData.savedCalculations
      );

      return {
        ...safeData,
        places,
        categories,
        transactions,
        savedCalculations,
      };
    } catch (error) {
      if (error?.code === "ENOENT" || error instanceof SyntaxError) {
        return this.createEmptyDb();
      }

      throw error;
    }
  }

  async write(data) {
    const safeInput =
      data && typeof data === "object" && !Array.isArray(data) ? data : {};

    const places = this.normalizePlaces(safeInput.places);
    const categories = this.normalizeCategories(safeInput.categories);
    const transactions = this.normalizeTransactions(
      safeInput.transactions,
      places,
      categories
    );
    const savedCalculations = this.normalizeSavedCalculations(
      safeInput.savedCalculations
    );

    const safeData = {
      ...this.createEmptyDb(),
      ...safeInput,
      places,
      categories,
      transactions,
      savedCalculations,
    };

    await fs.writeFile(DB_FILE, JSON.stringify(safeData, null, 2), "utf-8");
  }

  createEmptyDb() {
    return {
      places: [],
      categories: [],
      transactions: [],
      savedCalculations: [],
    };
  }

  createId(prefix = "") {
    const base = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return prefix ? `${prefix}_${base}` : base;
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

  normalizeComparableText(value) {
    return this.normalizeText(value, "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
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

    if (!Number.isFinite(amount) || amount <= 0) {
      return 0;
    }

    return amount;
  }

  normalizeNullableAmount(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const amount = this.parseAmountValue(value);
    if (!Number.isFinite(amount)) {
      return null;
    }

    return amount;
  }

  normalizeNullableNumber(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  normalizeType(value) {
    return value === "income" || value === "expense" ? value : "expense";
  }

  normalizeDate(value) {
    const today = new Date().toISOString().slice(0, 10);

    if (typeof value !== "string" || !value.trim()) {
      return today;
    }

    const trimmed = value.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return today;
    }

    return parsed.toISOString().slice(0, 10);
  }

  normalizeOptionalDate(value) {
    if (typeof value !== "string" || !value.trim()) {
      return null;
    }

    const trimmed = value.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.toISOString().slice(0, 10);
  }

  normalizeIsoDateTime(value, fallback = new Date().toISOString()) {
    if (typeof value !== "string" || !value.trim()) {
      return fallback;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return fallback;
    }

    return parsed.toISOString();
  }

  normalizeId(value, prefix = "") {
    const normalized = String(value ?? "").trim();
    return normalized || this.createId(prefix);
  }

  normalizeOptionalId(value) {
    const normalized = String(value ?? "").trim();
    return normalized || null;
  }

  getTransactionId(transaction = {}) {
    return this.normalizeId(
      transaction?.id ?? transaction?._id ?? transaction?.transactionId ?? ""
    );
  }

  getPlaceId(place = {}) {
    return this.normalizeId(place?.id ?? place?._id ?? place?.placeId ?? "");
  }

  getCategoryId(category = {}) {
    return this.normalizeId(
      category?.id ?? category?._id ?? category?.categoryId ?? ""
    );
  }

  getAllowedExpenseCategories() {
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

  getAllowedIncomeCategories() {
    return ["salary", "bonus", "additional_income", "refund", "other"];
  }

  getAllowedPlaceTypes() {
    return ["store", "transport", "housing", "bank", "other"];
  }

  normalizeCategory(value, type = "expense") {
    const normalized = this.normalizeText(value, "").toLowerCase();
    const allowed =
      type === "income"
        ? this.getAllowedIncomeCategories()
        : this.getAllowedExpenseCategories();

    return allowed.includes(normalized) ? normalized : "other";
  }

  normalizeCategoryDetail(value, category = "other") {
    if (category !== "other") {
      return "";
    }

    return this.normalizeOptionalText(value);
  }

  normalizeCategoryType(value) {
    return value === "income" ? "income" : "expense";
  }

  normalizeCategoryEntity(category = {}) {
    const safeCategory =
      category && typeof category === "object" && !Array.isArray(category)
        ? category
        : {};

    const nowIso = new Date().toISOString();
    const name = this.normalizeText(
      safeCategory.name ?? safeCategory.label ?? safeCategory.title,
      ""
    );
    const type = this.normalizeCategoryType(safeCategory.type);

    if (!name) {
      return null;
    }

    const createdAt = this.normalizeIsoDateTime(safeCategory.createdAt, nowIso);

    return {
      id: this.normalizeId(safeCategory.id ?? safeCategory.categoryId, "cat"),
      name,
      normalizedName: this.normalizeComparableText(name),
      type,
      note: this.normalizeOptionalText(safeCategory.note),
      isArchived: Boolean(safeCategory.isArchived),
      meta: this.normalizeMeta(safeCategory.meta),
      createdAt,
      updatedAt: this.normalizeIsoDateTime(safeCategory.updatedAt, createdAt),
    };
  }

  normalizeCategories(categories = []) {
    return (Array.isArray(categories) ? categories : [])
      .map((category) => this.normalizeCategoryEntity(category))
      .filter(Boolean)
      .sort((a, b) => {
        const typeCompare = String(a.type).localeCompare(String(b.type));
        if (typeCompare !== 0) {
          return typeCompare;
        }

        return String(a.name).localeCompare(String(b.name));
      });
  }

  normalizeCategoryId(value, availableCategories = null) {
    const categoryId = this.normalizeOptionalId(value);
    if (!categoryId) {
      return null;
    }

    if (!Array.isArray(availableCategories)) {
      return categoryId;
    }

    return availableCategories.some(
      (category) => this.getCategoryId(category) === categoryId
    )
      ? categoryId
      : null;
  }

  normalizeCurrency(value) {
    return this.normalizeText(value, "EUR").toUpperCase();
  }

  normalizeLocale(value) {
    return this.normalizeText(value, "en").toLowerCase();
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
      typeof meta.originalAmountInput !== "string" ||
      !meta.originalAmountInput.trim()
    ) {
      delete normalized.originalAmountInput;
    } else {
      normalized.originalAmountInput = meta.originalAmountInput.trim();
    }

    return normalized;
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

    return this.getAllowedPlaceTypes().includes(compact) ? compact : "other";
  }

  normalizePlace(place = {}) {
    const safePlace =
      place && typeof place === "object" && !Array.isArray(place) ? place : {};

    const nowIso = new Date().toISOString();
    const name = this.normalizeText(safePlace.name, "");
    const type = this.normalizePlaceType(safePlace.type);
    const purpose = this.normalizeText(safePlace.purpose, "expense").toLowerCase();

    if (!name) {
      return null;
    }

    const createdAt = this.normalizeIsoDateTime(safePlace.createdAt, nowIso);

    return {
      id: this.normalizeId(safePlace.id ?? safePlace.placeId, "place"),
      name,
      normalizedName: this.normalizeComparableText(name),
      type,
      brand: this.normalizeOptionalText(safePlace.brand),
      country: this.normalizeOptionalText(safePlace.country).toUpperCase(),
      city: this.normalizeOptionalText(safePlace.city),
      address: this.normalizeOptionalText(safePlace.address),
      purpose,
      notes: this.normalizeOptionalText(safePlace.notes),
      aliases: this.normalizeStringList(safePlace.aliases)
        .map((alias) => this.normalizeComparableText(alias))
        .filter(Boolean),
      tags: this.normalizeStringList(safePlace.tags).map((tag) =>
        tag.toLowerCase()
      ),
      isFavorite: Boolean(safePlace.isFavorite),
      meta: this.normalizeMeta(safePlace.meta),
      createdAt,
      updatedAt: this.normalizeIsoDateTime(safePlace.updatedAt, createdAt),
    };
  }

  normalizePlaces(places = []) {
    return (Array.isArray(places) ? places : [])
      .map((place) => this.normalizePlace(place))
      .filter(Boolean)
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  normalizePlaceId(value, availablePlaces = null) {
    const placeId = this.normalizeOptionalId(value);
    if (!placeId) {
      return null;
    }

    if (!Array.isArray(availablePlaces)) {
      return placeId;
    }

    return availablePlaces.some((place) => this.getPlaceId(place) === placeId)
      ? placeId
      : null;
  }

  normalizeScanConfidence(value) {
    const normalized = this.normalizeText(value, "").toLowerCase();
    const allowed = new Set(["low", "medium", "high"]);
    return allowed.has(normalized) ? normalized : null;
  }

  normalizeReceiptItem(item = {}) {
    const safeItem =
      item && typeof item === "object" && !Array.isArray(item) ? item : {};

    const name = this.normalizeOptionalText(safeItem.name) || null;
    const price = this.normalizeNullableAmount(safeItem.price);
    const quantity = this.normalizeNullableNumber(safeItem.quantity);
    const category =
      this.normalizeOptionalText(safeItem.category).toLowerCase() || null;
    const confidence = this.normalizeScanConfidence(safeItem.confidence);

    if (!name && price === null) {
      return null;
    }

    return {
      name,
      price,
      quantity,
      category,
      confidence,
    };
  }

  normalizeReceiptItems(items = []) {
    return (Array.isArray(items) ? items : [])
      .map((item) => this.normalizeReceiptItem(item))
      .filter(Boolean);
  }

  normalizeCategorySummaryItem(item = {}) {
    const safeItem =
      item && typeof item === "object" && !Array.isArray(item) ? item : {};

    const category = this.normalizeText(safeItem.category, "").toLowerCase();
    const amount = this.normalizeNullableAmount(safeItem.amount);

    if (!category || amount === null) {
      return null;
    }

    return {
      category,
      amount,
    };
  }

  normalizeCategorySummary(items = []) {
    return (Array.isArray(items) ? items : [])
      .map((item) => this.normalizeCategorySummaryItem(item))
      .filter(Boolean);
  }

  normalizeReceipt(receipt = {}, transaction = {}, availablePlaces = null) {
    if (receipt === null) {
      return null;
    }

    if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
      return null;
    }

    const safeReceipt = receipt;
    const source = this.normalizeText(
      safeReceipt.source || transaction?.meta?.source,
      "manual"
    );

    return {
      receiptId: this.normalizeId(safeReceipt.receiptId, "receipt"),
      source,
      placeId: this.normalizePlaceId(
        safeReceipt.placeId ?? transaction?.placeId,
        availablePlaces
      ),
      storeName: this.normalizeOptionalText(safeReceipt.storeName) || null,
      purchaseDate:
        this.normalizeOptionalDate(safeReceipt.purchaseDate) ||
        this.normalizeOptionalDate(transaction?.financialDate) ||
        this.normalizeOptionalDate(transaction?.date),
      totalAmount:
        this.normalizeNullableAmount(safeReceipt.totalAmount) ??
        this.normalizeNullableAmount(transaction?.amount),
      currency: this.normalizeCurrency(
        safeReceipt.currency || transaction?.currency
      ),
      locale: this.normalizeLocale(safeReceipt.locale || transaction?.locale),
      rawText: this.normalizeOptionalText(safeReceipt.rawText) || null,
      scanConfidence: this.normalizeScanConfidence(safeReceipt.scanConfidence),
      userConfirmed:
        typeof safeReceipt.userConfirmed === "boolean"
          ? safeReceipt.userConfirmed
          : null,
      items: this.normalizeReceiptItems(safeReceipt.items),
      categorySummary: this.normalizeCategorySummary(
        safeReceipt.categorySummary
      ),
    };
  }

  resolveFinancialDate(transaction = {}) {
    return this.normalizeDate(transaction?.financialDate || transaction?.date);
  }

  normalizeTransaction(
    transaction = {},
    availablePlaces = null,
    availableCategories = null
  ) {
    const nowIso = new Date().toISOString();
    const type = this.normalizeType(transaction?.type);
    const createdAt = this.normalizeIsoDateTime(transaction?.createdAt, nowIso);
    const category = this.normalizeCategory(transaction?.category, type);
    const financialDate = this.resolveFinancialDate(transaction);

    return {
      id: this.normalizeId(transaction?.id ?? transaction?._id, "tx"),
      type,
      amount: this.normalizeAmount(transaction?.amount),
      category,
      categoryId: this.normalizeCategoryId(
        transaction?.categoryId,
        availableCategories
      ),
      categoryDetail: this.normalizeCategoryDetail(
        transaction?.categoryDetail,
        category
      ),
      note: this.normalizeOptionalText(transaction?.note),
      date: financialDate,
      financialDate,
      currency: this.normalizeCurrency(transaction?.currency),
      locale: this.normalizeLocale(transaction?.locale),
      placeId: this.normalizePlaceId(transaction?.placeId, availablePlaces),
      meta: this.normalizeMeta(transaction?.meta),
      receipt: this.normalizeReceipt(
        transaction?.receipt,
        transaction,
        availablePlaces
      ),
      createdAt,
      updatedAt: this.normalizeIsoDateTime(transaction?.updatedAt, createdAt),
    };
  }

  normalizeTransactions(
    transactions = [],
    availablePlaces = null,
    availableCategories = null
  ) {
    return (Array.isArray(transactions) ? transactions : [])
      .map((transaction) =>
        this.normalizeTransaction(
          transaction,
          availablePlaces,
          availableCategories
        )
      )
      .filter((transaction) => transaction.amount > 0)
      .sort((a, b) => {
        const dateCompare = String(b.financialDate || b.date).localeCompare(
          String(a.financialDate || a.date)
        );

        if (dateCompare !== 0) {
          return dateCompare;
        }

        return String(b.updatedAt).localeCompare(String(a.updatedAt));
      });
  }

  normalizeSavedCalculation(calculation = {}) {
    const nowIso = new Date().toISOString();
    const createdAt = this.normalizeIsoDateTime(calculation?.createdAt, nowIso);

    return {
      id: this.normalizeId(calculation?.id, "calc"),
      name: this.normalizeText(
        calculation?.name || calculation?.title || calculation?.label || "Calculation"
      ),
      dateFrom: this.normalizeOptionalText(calculation?.dateFrom),
      dateTo: this.normalizeOptionalText(calculation?.dateTo),
      type: this.normalizeText(
        calculation?.type || calculation?.selectedType || "both"
      ),
      categories: this.normalizeStringList(
        calculation?.categories || calculation?.selectedCategories
      ),
      placeId: this.normalizeOptionalId(
        calculation?.placeId || calculation?.selectedPlaceId
      ),
      baseAmount: this.normalizeNullableAmount(calculation?.baseAmount),
      percentage: this.normalizeNullableNumber(calculation?.percentage),
      vat: this.normalizeNullableNumber(calculation?.vat),
      result: this.normalizeNullableAmount(
        calculation?.result ?? calculation?.total
      ),
      createdAt,
      updatedAt: this.normalizeIsoDateTime(calculation?.updatedAt, createdAt),
    };
  }

  normalizeSavedCalculations(calculations = []) {
    return (Array.isArray(calculations) ? calculations : [])
      .map((calculation) => this.normalizeSavedCalculation(calculation))
      .filter(Boolean)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async getCategories() {
    const data = await this.read();
    return this.normalizeCategories(data.categories);
  }

  async getCategoryById(categoryId) {
    const safeId = this.normalizeId(categoryId);
    const categories = await this.getCategories();

    return (
      categories.find((category) => this.getCategoryId(category) === safeId) ||
      null
    );
  }

  async findCategoryByName(name, type = null) {
    const comparable = this.normalizeComparableText(name);
    const safeType = type === "income" || type === "expense" ? type : null;

    if (!comparable) {
      return null;
    }

    const categories = await this.getCategories();

    return (
      categories.find((category) => {
        if (safeType && category.type !== safeType) {
          return false;
        }

        return category.normalizedName === comparable;
      }) || null
    );
  }

  async saveCategories(categories = []) {
    const data = await this.read();
    data.categories = this.normalizeCategories(categories);
    data.transactions = this.normalizeTransactions(
      data.transactions,
      data.places,
      data.categories
    );
    await this.write(data);
    return data.categories;
  }

  async addCategory(category = {}) {
    const data = await this.read();
    const nowIso = new Date().toISOString();

    const created = this.normalizeCategoryEntity({
      ...category,
      id: this.normalizeId(category?.id, "cat"),
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    if (!created) {
      return null;
    }

    const duplicate = (data.categories || []).find((existingCategory) => {
      const normalizedExisting = this.normalizeCategoryEntity(existingCategory);

      if (!normalizedExisting) {
        return false;
      }

      return (
        normalizedExisting.type === created.type &&
        normalizedExisting.normalizedName === created.normalizedName
      );
    });

    if (duplicate) {
      return this.normalizeCategoryEntity(duplicate);
    }

    data.categories = this.normalizeCategories([
      ...(data.categories || []),
      created,
    ]);

    data.transactions = this.normalizeTransactions(
      data.transactions,
      data.places,
      data.categories
    );

    await this.write(data);
    return created;
  }

  async updateCategory(categoryId, nextCategory = {}) {
    const safeId = this.normalizeId(categoryId);
    const data = await this.read();

    let found = false;

    const nextCategories = this.normalizeCategories(data.categories)
      .map((category) => {
        if (this.getCategoryId(category) !== safeId) {
          return category;
        }

        found = true;

        return this.normalizeCategoryEntity({
          ...category,
          ...nextCategory,
          id: safeId,
          createdAt: category.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          meta: {
            ...(category.meta || {}),
            ...(nextCategory?.meta && typeof nextCategory.meta === "object"
              ? nextCategory.meta
              : {}),
          },
        });
      })
      .filter(Boolean);

    if (!found) {
      return null;
    }

    data.categories = nextCategories;
    data.transactions = this.normalizeTransactions(
      data.transactions,
      data.places,
      data.categories
    );

    await this.write(data);

    return (
      nextCategories.find((category) => this.getCategoryId(category) === safeId) ||
      null
    );
  }

  async patchCategory(categoryId, nextCategory = {}) {
    return this.updateCategory(categoryId, nextCategory);
  }

  async deleteCategory(categoryId) {
    const safeId = this.normalizeId(categoryId);
    const data = await this.read();
    const normalizedCategories = this.normalizeCategories(data.categories);

    const existing = normalizedCategories.find(
      (category) => this.getCategoryId(category) === safeId
    );

    if (!existing) {
      return null;
    }

    data.categories = normalizedCategories.filter(
      (category) => this.getCategoryId(category) !== safeId
    );

    data.transactions = this.normalizeTransactions(
      (data.transactions || []).map((transaction) => {
        const normalizedTransaction = this.normalizeTransaction(
          transaction,
          data.places,
          data.categories
        );

        if (normalizedTransaction.categoryId !== safeId) {
          return normalizedTransaction;
        }

        return {
          ...normalizedTransaction,
          categoryId: null,
          updatedAt: new Date().toISOString(),
        };
      }),
      data.places,
      data.categories
    );

    await this.write(data);
    return existing;
  }

  async removeCategory(categoryId) {
    return this.deleteCategory(categoryId);
  }

  async getPlaces() {
    const data = await this.read();
    return this.normalizePlaces(data.places);
  }

  async getPlaceById(placeId) {
    const safeId = this.normalizeId(placeId);
    const places = await this.getPlaces();

    return places.find((place) => this.getPlaceId(place) === safeId) || null;
  }

  async findPlaceByName(name) {
    const comparable = this.normalizeComparableText(name);

    if (!comparable) {
      return null;
    }

    const places = await this.getPlaces();

    return (
      places.find((place) => {
        if (place.normalizedName === comparable) {
          return true;
        }

        return Array.isArray(place.aliases) && place.aliases.includes(comparable);
      }) || null
    );
  }

  async savePlaces(places = []) {
    const data = await this.read();
    data.places = this.normalizePlaces(places);
    data.transactions = this.normalizeTransactions(
      data.transactions,
      data.places,
      data.categories
    );
    await this.write(data);
    return data.places;
  }

  async addPlace(place = {}) {
    const data = await this.read();
    const nowIso = new Date().toISOString();

    const created = this.normalizePlace({
      ...place,
      id: this.normalizeId(place?.id, "place"),
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    if (!created) {
      return null;
    }

    const duplicate = (data.places || []).find((existingPlace) => {
      const normalizedExisting = this.normalizePlace(existingPlace);
      if (!normalizedExisting) {
        return false;
      }

      return normalizedExisting.normalizedName === created.normalizedName;
    });

    if (duplicate) {
      return this.normalizePlace(duplicate);
    }

    data.places = this.normalizePlaces([...(data.places || []), created]);
    data.transactions = this.normalizeTransactions(
      data.transactions,
      data.places,
      data.categories
    );

    await this.write(data);
    return created;
  }

  async updatePlace(placeId, nextPlace = {}) {
    const safeId = this.normalizeId(placeId);
    const data = await this.read();

    let found = false;

    const nextPlaces = this.normalizePlaces(data.places)
      .map((place) => {
        if (this.getPlaceId(place) !== safeId) {
          return place;
        }

        found = true;

        return this.normalizePlace({
          ...place,
          ...nextPlace,
          id: safeId,
          createdAt: place.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          meta: {
            ...(place.meta || {}),
            ...(nextPlace?.meta && typeof nextPlace.meta === "object"
              ? nextPlace.meta
              : {}),
          },
        });
      })
      .filter(Boolean);

    if (!found) {
      return null;
    }

    data.places = nextPlaces;
    data.transactions = this.normalizeTransactions(
      data.transactions,
      data.places,
      data.categories
    );

    await this.write(data);

    return nextPlaces.find((place) => this.getPlaceId(place) === safeId) || null;
  }

  async deletePlace(placeId) {
    const safeId = this.normalizeId(placeId);
    const data = await this.read();
    const normalizedPlaces = this.normalizePlaces(data.places);

    const existing = normalizedPlaces.find(
      (place) => this.getPlaceId(place) === safeId
    );

    if (!existing) {
      return null;
    }

    data.places = normalizedPlaces.filter(
      (place) => this.getPlaceId(place) !== safeId
    );

    data.transactions = this.normalizeTransactions(
      (data.transactions || []).map((transaction) => {
        const normalizedTransaction = this.normalizeTransaction(
          transaction,
          data.places,
          data.categories
        );

        if (normalizedTransaction.placeId !== safeId) {
          return normalizedTransaction;
        }

        return {
          ...normalizedTransaction,
          placeId: null,
          receipt: normalizedTransaction.receipt
            ? {
                ...normalizedTransaction.receipt,
                placeId: null,
              }
            : null,
          updatedAt: new Date().toISOString(),
        };
      }),
      data.places,
      data.categories
    );

    await this.write(data);
    return existing;
  }

  async getTransactions() {
    const data = await this.read();
    return this.normalizeTransactions(
      data.transactions,
      data.places,
      data.categories
    );
  }

  async getTransactionById(transactionId) {
    const safeId = this.normalizeId(transactionId);
    const transactions = await this.getTransactions();

    return (
      transactions.find((transaction) => this.getTransactionId(transaction) === safeId) ||
      null
    );
  }

  async saveTransactions(transactions = []) {
    const data = await this.read();
    data.transactions = this.normalizeTransactions(
      transactions,
      data.places,
      data.categories
    );
    await this.write(data);
    return data.transactions;
  }

  async addTransaction(transaction = {}) {
    const data = await this.read();
    const nowIso = new Date().toISOString();

    const created = this.normalizeTransaction(
      {
        ...transaction,
        id: this.normalizeId(transaction?.id, "tx"),
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      data.places,
      data.categories
    );

    data.transactions = this.normalizeTransactions(
      [...(data.transactions || []), created],
      data.places,
      data.categories
    );

    await this.write(data);
    return created;
  }

  async updateTransaction(transactionId, nextTransaction = {}) {
    const safeId = this.normalizeId(transactionId);
    const data = await this.read();

    let found = false;

    const nextTransactions = this.normalizeTransactions(
      data.transactions,
      data.places,
      data.categories
    ).map((transaction) => {
      if (this.getTransactionId(transaction) !== safeId) {
        return transaction;
      }

      found = true;

      const shouldReplaceMeta =
        nextTransaction &&
        Object.prototype.hasOwnProperty.call(nextTransaction, "meta");

      const nextMeta = shouldReplaceMeta
        ? this.normalizeMeta(nextTransaction.meta)
        : transaction.meta;

      const shouldReplaceReceipt =
        nextTransaction &&
        Object.prototype.hasOwnProperty.call(nextTransaction, "receipt");

      const nextReceipt = shouldReplaceReceipt
        ? nextTransaction.receipt
        : transaction.receipt;

      return this.normalizeTransaction(
        {
          ...transaction,
          ...nextTransaction,
          id: safeId,
          createdAt: transaction.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          meta: nextMeta,
          receipt: nextReceipt,
        },
        data.places,
        data.categories
      );
    });

    if (!found) {
      return null;
    }

    data.transactions = nextTransactions;
    await this.write(data);

    return (
      nextTransactions.find((transaction) => this.getTransactionId(transaction) === safeId) ||
      null
    );
  }

  async replaceTransaction(transactionId, nextTransaction = {}) {
    const safeId = this.normalizeId(transactionId);
    const existing = await this.getTransactionById(safeId);

    if (!existing) {
      return null;
    }

    return this.updateTransaction(safeId, {
      type: nextTransaction?.type,
      amount: nextTransaction?.amount,
      category: nextTransaction?.category,
      categoryId: nextTransaction?.categoryId,
      categoryDetail: nextTransaction?.categoryDetail,
      note: nextTransaction?.note,
      date: nextTransaction?.date,
      financialDate: nextTransaction?.financialDate,
      currency: nextTransaction?.currency,
      locale: nextTransaction?.locale,
      placeId: nextTransaction?.placeId,
      meta: nextTransaction?.meta,
      receipt: nextTransaction?.receipt,
      createdAt: existing.createdAt,
    });
  }

  async deleteTransaction(transactionId) {
    const safeId = this.normalizeId(transactionId);
    const data = await this.read();
    const normalizedTransactions = this.normalizeTransactions(
      data.transactions,
      data.places,
      data.categories
    );

    const existing = normalizedTransactions.find(
      (transaction) => this.getTransactionId(transaction) === safeId
    );

    if (!existing) {
      return null;
    }

    data.transactions = normalizedTransactions.filter(
      (transaction) => this.getTransactionId(transaction) !== safeId
    );

    await this.write(data);
    return existing;
  }

  async removeTransaction(transactionId) {
    return this.deleteTransaction(transactionId);
  }

  async getSavedCalculations() {
    const data = await this.read();
    return this.normalizeSavedCalculations(data.savedCalculations);
  }

  async addSavedCalculation(calculation = {}) {
    const data = await this.read();
    const created = this.normalizeSavedCalculation({
      ...calculation,
      id: this.normalizeId(calculation?.id, "calc"),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    data.savedCalculations = this.normalizeSavedCalculations([
      ...(data.savedCalculations || []),
      created,
    ]);

    await this.write(data);
    return created;
  }

  async deleteSavedCalculation(calculationId) {
    const safeId = this.normalizeId(calculationId);
    const data = await this.read();
    const normalizedSavedCalculations = this.normalizeSavedCalculations(
      data.savedCalculations
    );

    const existing = normalizedSavedCalculations.find(
      (calculation) => calculation.id === safeId
    );

    if (!existing) {
      return null;
    }

    data.savedCalculations = normalizedSavedCalculations.filter(
      (calculation) => calculation.id !== safeId
    );

    await this.write(data);
    return existing;
  }
}

export const db = new DbService();