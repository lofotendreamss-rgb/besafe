import express from "express";
import cors from "cors";
import crypto from "crypto";
import { db } from "./db/db.service.js";

const app = express();
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || "0.0.0.0";

const allowedOrigins = new Set([
  "http://127.0.0.1:5500",
  "http://localhost:5500",
]);

const ALLOWED_TRANSACTION_TYPES = new Set(["income", "expense"]);

const ALLOWED_EXPENSE_CATEGORIES = new Set([
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
]);

const ALLOWED_INCOME_CATEGORIES = new Set([
  "salary",
  "bonus",
  "additional_income",
  "refund",
  "other",
]);

const ALLOWED_SCAN_CONFIDENCE = new Set(["low", "medium", "high"]);

const ALLOWED_PLACE_TYPES = new Set([
  "store",
  "transport",
  "housing",
  "bank",
  "other",
]);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json());

function hasOwn(object, key) {
  return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
}

function normalizeText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();
  return normalized || fallback;
}

function normalizeOptionalText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeNullableText(value) {
  const normalized = normalizeOptionalText(value);
  return normalized || null;
}

function normalizeOptionalId(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeDate(value, fallback = null) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  const trimmed = value.trim();
  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  return parsed.toISOString().slice(0, 10);
}

function normalizeDateWithDefault(value) {
  return normalizeDate(value, new Date().toISOString().slice(0, 10));
}

function normalizeIsoDateTime(value, fallback = null) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  const parsed = new Date(value.trim());

  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed.toISOString();
}

function normalizeType(value) {
  const normalized = normalizeText(value, "").toLowerCase();
  return ALLOWED_TRANSACTION_TYPES.has(normalized) ? normalized : null;
}

function roundCurrencyAmount(value) {
  if (!Number.isFinite(value)) {
    return Number.NaN;
  }

  return Math.round(value * 100) / 100;
}

function parseAmountValue(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? roundCurrencyAmount(value) : Number.NaN;
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
    const decimalPart = cleaned.slice(decimalIndex + 1).replace(/[.,]/g, "");
    normalized = `${integerPart || "0"}.${decimalPart}`;

    if (cleaned.startsWith("-")) {
      normalized = `-${normalized}`;
    }
  } else {
    normalized = cleaned.replace(/[.,]/g, "");
  }

  const amount = Number(normalized);
  return Number.isFinite(amount) ? roundCurrencyAmount(amount) : Number.NaN;
}

function normalizeAmount(value) {
  const amount = parseAmountValue(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return amount;
}

function normalizeNullableAmount(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const amount = parseAmountValue(value);

  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return amount;
}

function normalizeNullableNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeCurrency(value, fallback = "EUR") {
  const normalized = normalizeText(value, fallback).toUpperCase();
  return normalized || fallback;
}

function normalizeLocale(value, fallback = "en") {
  return normalizeText(value, fallback).toLowerCase();
}

function normalizeCategory(value, type = "expense", fallback = "other") {
  const normalized = normalizeText(value, "").toLowerCase();

  if (!normalized) {
    return fallback;
  }

  const allowed =
    type === "income" ? ALLOWED_INCOME_CATEGORIES : ALLOWED_EXPENSE_CATEGORIES;

  return allowed.has(normalized) ? normalized : fallback;
}

function normalizeCategoryDetail(value, category = "other") {
  if (category !== "other") {
    return "";
  }

  return normalizeOptionalText(value);
}

function normalizeMeta(meta = {}) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return {
      source: "manual",
      entryPoint: "unknown",
    };
  }

  const normalized = {
    ...meta,
    source: normalizeText(meta.source, "manual"),
    entryPoint: normalizeText(meta.entryPoint, "unknown"),
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

function normalizeScanConfidence(value) {
  const normalized = normalizeText(value, "").toLowerCase();
  return ALLOWED_SCAN_CONFIDENCE.has(normalized) ? normalized : null;
}

function normalizePlaceType(value) {
  const normalized = normalizeText(value, "").toLowerCase();

  if (!normalized) {
    return "other";
  }

  const compact = normalized
    .replaceAll("-", "_")
    .replaceAll(" ", "_");

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

  if (
    compact === "bank" ||
    compact === "bankas"
  ) {
    return "bank";
  }

  if (ALLOWED_PLACE_TYPES.has(compact)) {
    return compact;
  }

  return "other";
}

function normalizeStringList(values = []) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(
    values
      .map((value) => normalizeOptionalText(value))
      .filter(Boolean)
  )];
}

function normalizeReceiptItem(item = {}) {
  const safeItem =
    item && typeof item === "object" && !Array.isArray(item) ? item : {};

  const name = normalizeNullableText(safeItem.name);
  const price = normalizeNullableAmount(safeItem.price);
  const quantity = normalizeNullableNumber(safeItem.quantity);
  const category = normalizeNullableText(safeItem.category)?.toLowerCase() || null;
  const confidence = normalizeScanConfidence(safeItem.confidence);

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

function normalizeReceiptItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => normalizeReceiptItem(item))
    .filter(Boolean);
}

function normalizeCategorySummaryItem(item = {}) {
  const safeItem =
    item && typeof item === "object" && !Array.isArray(item) ? item : {};

  const category = normalizeText(safeItem.category, "").toLowerCase();
  const amount = normalizeNullableAmount(safeItem.amount);

  if (!category || amount === null) {
    return null;
  }

  return {
    category,
    amount,
  };
}

function normalizeCategorySummary(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => normalizeCategorySummaryItem(item))
    .filter(Boolean);
}

function normalizeReceipt(receipt = {}, transaction = {}, options = {}) {
  const { fallbackReceipt = null } = options;

  if (receipt === null) {
    return null;
  }

  const safeReceipt =
    receipt && typeof receipt === "object" && !Array.isArray(receipt) ? receipt : null;
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
    : (safeReceipt || null);

  if (!merged) {
    return null;
  }

  const source = normalizeText(
    merged.source || transaction?.meta?.source,
    "manual"
  );

  return {
    receiptId: normalizeNullableText(merged.receiptId),
    source,
    placeId: normalizeOptionalId(merged.placeId ?? transaction?.placeId),
    storeName: normalizeNullableText(merged.storeName),
    purchaseDate:
      normalizeDate(merged.purchaseDate) ||
      normalizeDate(transaction?.financialDate) ||
      normalizeDate(transaction?.date) ||
      null,
    totalAmount:
      normalizeNullableAmount(merged.totalAmount) ??
      normalizeNullableAmount(transaction?.amount),
    currency: normalizeCurrency(
      merged.currency || transaction?.currency,
      "EUR"
    ),
    locale: normalizeLocale(merged.locale || transaction?.locale, "en"),
    rawText: normalizeNullableText(merged.rawText),
    scanConfidence: normalizeScanConfidence(merged.scanConfidence),
    userConfirmed:
      typeof merged.userConfirmed === "boolean" ? merged.userConfirmed : null,
    items: normalizeReceiptItems(merged.items),
    categorySummary: normalizeCategorySummary(merged.categorySummary),
  };
}

function getTransactionId(transaction = {}) {
  return String(
    transaction?.id ??
      transaction?._id ??
      transaction?.transactionId ??
      ""
  ).trim();
}

function getPlaceId(place = {}) {
  return String(
    place?.id ??
      place?._id ??
      place?.placeId ??
      ""
  ).trim();
}

function resolveFinancialDate(payload = {}, source = {}) {
  if (hasOwn(payload, "financialDate")) {
    return payload.financialDate;
  }

  if (hasOwn(payload, "date")) {
    return payload.date;
  }

  return source?.financialDate ?? source?.date;
}

function buildTransactionPayload(payload = {}, options = {}) {
  const { partial = false, current = null } = options;
  const source = current || {};

  const rawType = partial && !hasOwn(payload, "type") ? source.type : payload.type;
  const rawAmount = partial && !hasOwn(payload, "amount") ? source.amount : payload.amount;
  const rawCategory = partial && !hasOwn(payload, "category") ? source.category : payload.category;
  const rawCategoryDetail =
    partial && !hasOwn(payload, "categoryDetail")
      ? source.categoryDetail || ""
      : payload.categoryDetail;
  const rawNote = partial && !hasOwn(payload, "note") ? source.note : payload.note;
  const rawFinancialDate = resolveFinancialDate(payload, source);
  const rawCurrency =
    partial && !hasOwn(payload, "currency") ? source.currency : payload.currency;
  const rawLocale =
    partial && !hasOwn(payload, "locale") ? source.locale : payload.locale;
  const rawPlaceId =
    partial && !hasOwn(payload, "placeId") ? source.placeId : payload.placeId;

  const metaWasProvided = hasOwn(payload, "meta");
  const receiptWasProvided = hasOwn(payload, "receipt");

  const rawMeta =
    partial
      ? (metaWasProvided ? payload.meta : source.meta)
      : (metaWasProvided ? payload.meta : source.meta);

  const rawReceipt =
    partial
      ? (receiptWasProvided ? payload.receipt : source.receipt)
      : (receiptWasProvided ? payload.receipt : source.receipt);

  const type = normalizeType(rawType);
  const amount = normalizeAmount(rawAmount);
  const category = normalizeCategory(rawCategory, type || source.type || "expense");
  const categoryDetail = normalizeCategoryDetail(rawCategoryDetail, category);
  const note = normalizeOptionalText(rawNote);
  const financialDate = normalizeDateWithDefault(rawFinancialDate);
  const currency = normalizeCurrency(rawCurrency, source.currency || "EUR");
  const locale = normalizeLocale(rawLocale, source.locale || "en");
  const placeId = normalizeOptionalId(rawPlaceId);
  const meta = normalizeMeta(rawMeta);

  const receipt = normalizeReceipt(
    rawReceipt,
    {
      amount,
      date: financialDate,
      financialDate,
      currency,
      locale,
      placeId,
      meta,
    },
    {
      fallbackReceipt:
        partial && !receiptWasProvided
          ? source.receipt
          : null,
    }
  );

  if (!type) {
    return {
      error: 'Invalid transaction type. Use "income" or "expense".',
    };
  }

  if (amount === null) {
    return {
      error: "Amount must be a positive number.",
    };
  }

  if (!financialDate) {
    return {
      error: "Please provide a valid date.",
    };
  }

  const value = {
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
  };

  if (categoryDetail) {
    value.categoryDetail = categoryDetail;
  }

  if (receipt !== null) {
    value.receipt = receipt;
  } else if (receiptWasProvided) {
    value.receipt = null;
  }

  return { value };
}

function buildPlacePayload(payload = {}, options = {}) {
  const { partial = false, current = null } = options;
  const source = current || {};

  const rawName = partial && !hasOwn(payload, "name") ? source.name : payload.name;
  const rawType = partial && !hasOwn(payload, "type") ? source.type : payload.type;
  const rawBrand =
    partial && !hasOwn(payload, "brand") ? source.brand : payload.brand;
  const rawCountry =
    partial && !hasOwn(payload, "country") ? source.country : payload.country;
  const rawCity = partial && !hasOwn(payload, "city") ? source.city : payload.city;
  const rawAddress =
    partial && !hasOwn(payload, "address") ? source.address : payload.address;
  const rawNotes =
    partial && !hasOwn(payload, "notes") ? source.notes : payload.notes;
  const rawAliases =
    partial && !hasOwn(payload, "aliases") ? source.aliases : payload.aliases;
  const rawTags =
    partial && !hasOwn(payload, "tags") ? source.tags : payload.tags;
  const rawFavorite =
    partial && !hasOwn(payload, "isFavorite")
      ? source.isFavorite
      : payload.isFavorite;
  const rawMeta =
    partial && !hasOwn(payload, "meta") ? source.meta : payload.meta;

  const name = normalizeOptionalText(rawName);
  const type = normalizePlaceType(rawType);
  const brand = normalizeOptionalText(rawBrand);
  const country = normalizeOptionalText(rawCountry).toUpperCase();
  const city = normalizeOptionalText(rawCity);
  const address = normalizeOptionalText(rawAddress);
  const purpose = normalizeText(payload.purpose || source.purpose || "expense").toLowerCase();
  const notes = normalizeOptionalText(rawNotes);
  const aliases = normalizeStringList(rawAliases);
  const tags = normalizeStringList(rawTags).map((tag) => tag.toLowerCase());
  const isFavorite = Boolean(rawFavorite);
  const meta = normalizeMeta(rawMeta);

  if (!name) {
    return {
      error: "Place name is required.",
    };
  }

  return {
    value: {
      name,
      type,
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
    },
  };
}

function normalizeTransactionForResponse(transaction = {}) {
  if (!transaction || typeof transaction !== "object" || Array.isArray(transaction)) {
    return null;
  }

  const type = normalizeType(transaction.type);
  if (!type) {
    return null;
  }

  const amount = normalizeAmount(transaction.amount);
  if (amount === null) {
    return null;
  }

  const category = normalizeCategory(transaction.category, type);
  const categoryDetail = normalizeCategoryDetail(
    transaction.categoryDetail,
    category
  );
  const note = normalizeOptionalText(transaction.note);
  const financialDate = normalizeDateWithDefault(
    transaction.financialDate || transaction.date
  );
  const currency = normalizeCurrency(transaction.currency, "EUR");
  const locale = normalizeLocale(transaction.locale, "en");
  const placeId = normalizeOptionalId(transaction.placeId);
  const meta = normalizeMeta(transaction.meta);
  const receipt = normalizeReceipt(
    transaction.receipt,
    {
      amount,
      date: financialDate,
      financialDate,
      currency,
      locale,
      placeId,
      meta,
    }
  );

  return {
    id: getTransactionId(transaction) || null,
    type,
    amount,
    category,
    categoryDetail,
    note,
    date: financialDate,
    financialDate,
    currency,
    locale,
    placeId,
    meta,
    receipt,
    createdAt: normalizeIsoDateTime(transaction.createdAt, null),
    updatedAt: normalizeIsoDateTime(transaction.updatedAt, null),
  };
}

function normalizePlaceForResponse(place = {}) {
  if (!place || typeof place !== "object" || Array.isArray(place)) {
    return null;
  }

  const name = normalizeOptionalText(place.name);
  if (!name) {
    return null;
  }

  return {
    id: getPlaceId(place) || null,
    name,
    normalizedName: normalizeOptionalText(place.normalizedName),
    type: normalizePlaceType(place.type),
    brand: normalizeOptionalText(place.brand),
    country: normalizeOptionalText(place.country).toUpperCase(),
    city: normalizeOptionalText(place.city),
    address: normalizeOptionalText(place.address),
    purpose: normalizeText(place.purpose, "expense"),
    notes: normalizeOptionalText(place.notes),
    aliases: normalizeStringList(place.aliases),
    tags: normalizeStringList(place.tags).map((tag) => tag.toLowerCase()),
    isFavorite: Boolean(place.isFavorite),
    meta: normalizeMeta(place.meta),
    createdAt: normalizeIsoDateTime(place.createdAt, null),
    updatedAt: normalizeIsoDateTime(place.updatedAt, null),
  };
}

function buildExpenseCategories(transactions = []) {
  const grouped = transactions.reduce((accumulator, transaction) => {
    if (transaction?.type !== "expense") {
      return accumulator;
    }

    const category = normalizeCategory(transaction?.category, "expense");
    const amount = Math.abs(Number(transaction?.amount || 0));

    accumulator[category] = (accumulator[category] || 0) + amount;
    return accumulator;
  }, {});

  return Object.entries(grouped)
    .map(([category, amount]) => ({
      category,
      amount: Number(amount.toFixed(2)),
    }))
    .sort((a, b) => b.amount - a.amount);
}

function buildRecentTransactions(transactions = [], limit = 5) {
  return [...transactions]
    .sort((a, b) => {
      const aTime = new Date(a?.financialDate || a?.date || 0).getTime();
      const bTime = new Date(b?.financialDate || b?.date || 0).getTime();

      if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
      if (Number.isNaN(aTime)) return 1;
      if (Number.isNaN(bTime)) return -1;

      return bTime - aTime;
    })
    .slice(0, limit)
    .map((transaction) => normalizeTransactionForResponse(transaction))
    .filter(Boolean);
}

async function getAllTransactionsSafe() {
  const transactions = await db.getTransactions();
  return Array.isArray(transactions) ? transactions : [];
}

async function getAllPlacesSafe() {
  if (typeof db.getPlaces === "function") {
    const places = await db.getPlaces();
    return Array.isArray(places) ? places : [];
  }

  const raw = await db.read();
  return Array.isArray(raw?.places) ? raw.places : [];
}

async function findTransactionById(transactionId) {
  const safeId = String(transactionId ?? "").trim();
  if (!safeId) {
    return null;
  }

  if (typeof db.getTransactionById === "function") {
    return db.getTransactionById(safeId);
  }

  const transactions = await getAllTransactionsSafe();

  return (
    transactions.find((transaction) => getTransactionId(transaction) === safeId) ||
    null
  );
}

async function findPlaceById(placeId) {
  const safeId = String(placeId ?? "").trim();
  if (!safeId) {
    return null;
  }

  if (typeof db.getPlaceById === "function") {
    return db.getPlaceById(safeId);
  }

  const places = await getAllPlacesSafe();

  return places.find((place) => getPlaceId(place) === safeId) || null;
}

async function findDuplicatePlaceByName(name) {
  const safeName = normalizeOptionalText(name);
  if (!safeName) {
    return null;
  }

  if (typeof db.findPlaceByName === "function") {
    return db.findPlaceByName(safeName);
  }

  const places = await getAllPlacesSafe();
  const comparable = safeName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (!comparable) {
    return null;
  }

  return (
    places.find((place) => {
      const normalizedName = normalizeOptionalText(place?.normalizedName);
      if (normalizedName === comparable) {
        return true;
      }

      const aliases = Array.isArray(place?.aliases) ? place.aliases : [];
      return aliases.some((alias) => {
        const normalizedAlias = normalizeOptionalText(alias)
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, " ")
          .trim();

        return normalizedAlias === comparable;
      });
    }) || null
  );
}

async function replaceTransactionInDb(transactionId, nextTransaction, options = {}) {
  const { partial = false } = options;

  if (partial && typeof db.updateTransaction === "function") {
    return db.updateTransaction(transactionId, nextTransaction);
  }

  if (!partial && typeof db.replaceTransaction === "function") {
    return db.replaceTransaction(transactionId, nextTransaction);
  }

  if (typeof db.updateTransaction === "function") {
    return db.updateTransaction(transactionId, nextTransaction);
  }

  if (typeof db.replaceTransaction === "function") {
    return db.replaceTransaction(transactionId, nextTransaction);
  }

  if (typeof db.saveTransactions === "function") {
    const transactions = await getAllTransactionsSafe();
    const nextTransactions = transactions.map((transaction) =>
      getTransactionId(transaction) === transactionId
        ? { ...transaction, ...nextTransaction, id: transactionId }
        : transaction
    );

    await db.saveTransactions(nextTransactions);

    return (
      nextTransactions.find(
        (transaction) => getTransactionId(transaction) === transactionId
      ) || null
    );
  }

  throw new Error("DB update path is not available.");
}

async function replacePlaceInDb(placeId, nextPlace, options = {}) {
  const { partial = false } = options;

  if ((partial || !partial) && typeof db.updatePlace === "function") {
    return db.updatePlace(placeId, nextPlace);
  }

  if (typeof db.savePlaces === "function") {
    const places = await getAllPlacesSafe();
    const nextPlaces = places.map((place) =>
      getPlaceId(place) === placeId
        ? { ...place, ...nextPlace, id: placeId }
        : place
    );

    await db.savePlaces(nextPlaces);

    return nextPlaces.find((place) => getPlaceId(place) === placeId) || null;
  }

  throw new Error("DB update path is not available for places.");
}

async function deleteTransactionFromDb(transactionId) {
  if (typeof db.deleteTransaction === "function") {
    return db.deleteTransaction(transactionId);
  }

  if (typeof db.removeTransaction === "function") {
    return db.removeTransaction(transactionId);
  }

  if (typeof db.saveTransactions === "function") {
    const transactions = await getAllTransactionsSafe();
    const current = transactions.find(
      (transaction) => getTransactionId(transaction) === transactionId
    );

    if (!current) {
      return null;
    }

    const nextTransactions = transactions.filter(
      (transaction) => getTransactionId(transaction) !== transactionId
    );

    await db.saveTransactions(nextTransactions);
    return current;
  }

  throw new Error("DB delete path is not available.");
}

async function deletePlaceFromDb(placeId) {
  if (typeof db.deletePlace === "function") {
    return db.deletePlace(placeId);
  }

  if (typeof db.savePlaces === "function") {
    const places = await getAllPlacesSafe();
    const current = places.find((place) => getPlaceId(place) === placeId);

    if (!current) {
      return null;
    }

    const nextPlaces = places.filter((place) => getPlaceId(place) !== placeId);
    await db.savePlaces(nextPlaces);
    return current;
  }

  throw new Error("DB delete path is not available for places.");
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "BeSafe API",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/transactions", async (_req, res) => {
  try {
    const transactions = await getAllTransactionsSafe();
    res.json(
      transactions
        .map((transaction) => normalizeTransactionForResponse(transaction))
        .filter(Boolean)
    );
  } catch (error) {
    console.error("[GET /api/transactions]", error);
    res.status(500).json({ error: "Failed to load transactions." });
  }
});

// =========================
// SAVED CALCULATIONS
// =========================

app.get("/api/saved-calculations", async (_req, res) => {
  try {
    const items = await db.getSavedCalculations();
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: "Failed to load saved calculations" });
  }
});

app.post("/api/saved-calculations", async (req, res) => {
  try {
    const created = await db.addSavedCalculation(req.body || {});
    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ error: "Failed to create saved calculation" });
  }
});

app.delete("/api/saved-calculations/:id", async (req, res) => {
  try {
    console.log("[DELETE saved-calculation] req.params.id =", req.params.id);
    console.log("[DELETE saved-calculation] saved before delete =", await db.getSavedCalculations());

    const removed = await db.deleteSavedCalculation(req.params.id);
    if (!removed) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(removed);
  } catch (error) {
    res.status(500).json({ error: "Failed to delete saved calculation" });
  }
});

app.get("/api/transactions/export", async (_req, res) => {
  try {
    const transactions = await getAllTransactionsSafe();
    const normalizedTransactions = transactions
      .map((transaction) => normalizeTransactionForResponse(transaction))
      .filter(Boolean);

    res.json({
      filename: "besafe-transactions-export.json",
      type: "application/json",
      content: JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          count: normalizedTransactions.length,
          transactions: normalizedTransactions,
        },
        null,
        2
      ),
    });
  } catch (error) {
    console.error("[GET /api/transactions/export]", error);
    res.status(500).json({ error: "Failed to export transactions." });
  }
});

app.get("/api/transactions/:id", async (req, res) => {
  try {
    const transaction = await findTransactionById(req.params.id);

    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found." });
    }

    res.json(normalizeTransactionForResponse(transaction));
  } catch (error) {
    console.error("[GET /api/transactions/:id]", error);
    res.status(500).json({ error: "Failed to load transaction." });
  }
});

app.get("/api/places", async (_req, res) => {
  try {
    const places = await getAllPlacesSafe();

    res.json(
      places
        .map((place) => normalizePlaceForResponse(place))
        .filter(Boolean)
    );
  } catch (error) {
    console.error("[GET /api/places]", error);
    res.status(500).json({ error: "Failed to load places." });
  }
});

app.get("/api/places/:id", async (req, res) => {
  try {
    const place = await findPlaceById(req.params.id);

    if (!place) {
      return res.status(404).json({ error: "Place not found." });
    }

    res.json(normalizePlaceForResponse(place));
  } catch (error) {
    console.error("[GET /api/places/:id]", error);
    res.status(500).json({ error: "Failed to load place." });
  }
});

async function getAllCategoriesSafe() {
  if (typeof db.getCategories === "function") {
    const categories = await db.getCategories();
    return Array.isArray(categories) ? categories : [];
  }

  const raw = await db.read();
  return Array.isArray(raw?.categories) ? raw.categories : [];
}

function getCategoryId(category = {}) {
  return String(
    category?.id ??
      category?._id ??
      category?.categoryId ??
      ""
  ).trim();
}

function normalizeCategoryForResponse(category = {}) {
  if (!category || typeof category !== "object" || Array.isArray(category)) {
    return null;
  }

  const id = getCategoryId(category);
  const name = normalizeOptionalText(category.name);
  const type = normalizeType(category.type);

  if (!id || !name || !type) {
    return null;
  }

  return {
    id,
    name,
    type,
    createdAt: normalizeIsoDateTime(category.createdAt, null),
    updatedAt: normalizeIsoDateTime(category.updatedAt, null),
  };
}

function buildCategoryPayload(payload = {}, options = {}) {
  const { partial = false, current = null } = options;
  const source = current || {};

  const rawName =
    partial && !hasOwn(payload, "name") ? source.name : payload.name;
  const rawType =
    partial && !hasOwn(payload, "type") ? source.type : payload.type;

  const name = normalizeOptionalText(rawName);
  const type = normalizeType(rawType);

  if (!name) {
    return {
      error: "Category name is required.",
    };
  }

  if (!type) {
    return {
      error: 'Category type must be "income" or "expense".',
    };
  }

  return {
    value: {
      name,
      type,
    },
  };
}

async function findCategoryById(categoryId) {
  const safeId = String(categoryId ?? "").trim();
  if (!safeId) {
    return null;
  }

  if (typeof db.getCategoryById === "function") {
    return db.getCategoryById(safeId);
  }

  const categories = await getAllCategoriesSafe();

  return (
    categories.find((category) => getCategoryId(category) === safeId) || null
  );
}

async function replaceCategoryInDb(categoryId, nextCategory, options = {}) {
  const { partial = false } = options;

  if (partial && typeof db.updateCategory === "function") {
    return db.updateCategory(categoryId, nextCategory);
  }

  if (!partial && typeof db.replaceCategory === "function") {
    return db.replaceCategory(categoryId, nextCategory);
  }

  if (typeof db.updateCategory === "function") {
    return db.updateCategory(categoryId, nextCategory);
  }

  if (typeof db.replaceCategory === "function") {
    return db.replaceCategory(categoryId, nextCategory);
  }

  if (typeof db.saveCategories === "function") {
    const categories = await getAllCategoriesSafe();
    const nextCategories = categories.map((category) =>
      getCategoryId(category) === categoryId
        ? { ...category, ...nextCategory, id: categoryId }
        : category
    );

    await db.saveCategories(nextCategories);

    return (
      nextCategories.find(
        (category) => getCategoryId(category) === categoryId
      ) || null
    );
  }

  throw new Error("DB update path is not available for categories.");
}

async function deleteCategoryFromDb(categoryId) {
  if (typeof db.deleteCategory === "function") {
    return db.deleteCategory(categoryId);
  }

  if (typeof db.removeCategory === "function") {
    return db.removeCategory(categoryId);
  }

  if (typeof db.saveCategories === "function") {
    const categories = await getAllCategoriesSafe();
    const current = categories.find(
      (category) => getCategoryId(category) === categoryId
    );

    if (!current) {
      return null;
    }

    const nextCategories = categories.filter(
      (category) => getCategoryId(category) !== categoryId
    );

    await db.saveCategories(nextCategories);
    return current;
  }

  throw new Error("DB delete path is not available for categories.");
}

app.get("/api/categories", async (_req, res) => {
  try {
    const categories = await getAllCategoriesSafe();

    res.json(
      categories
        .map((category) => normalizeCategoryForResponse(category))
        .filter(Boolean)
    );
  } catch (error) {
    console.error("[GET /api/categories]", error);
    res.status(500).json({ error: "Failed to load categories." });
  }
});

app.get("/api/categories/:id", async (req, res) => {
  try {
    const category = await findCategoryById(req.params.id);

    if (!category) {
      return res.status(404).json({ error: "Category not found." });
    }

    res.json(normalizeCategoryForResponse(category));
  } catch (error) {
    console.error("[GET /api/categories/:id]", error);
    res.status(500).json({ error: "Failed to load category." });
  }
});

app.post("/api/categories", async (req, res) => {
  try {
    const { value, error } = buildCategoryPayload(req.body || {});
    if (error) {
      return res.status(400).json({ error });
    }

    if (typeof db.addCategory === "function") {
      const created = await db.addCategory(value);
      return res.status(201).json(normalizeCategoryForResponse(created));
    }

    if (typeof db.saveCategories === "function") {
      const categories = await getAllCategoriesSafe();

      const created = {
        id: crypto.randomUUID(),
        ...value,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await db.saveCategories([...categories, created]);
      return res.status(201).json(normalizeCategoryForResponse(created));
    }

    throw new Error("DB addCategory path is not available.");
  } catch (error) {
    console.error("[POST /api/categories]", error);
    res.status(500).json({ error: "Failed to create category." });
  }
});

app.put("/api/categories/:id", async (req, res) => {
  try {
    const categoryId = String(req.params.id ?? "").trim();
    const current = await findCategoryById(categoryId);

    if (!current) {
      return res.status(404).json({
        error: "Selected category was not found.",
      });
    }

    const { value, error } = buildCategoryPayload(req.body || {}, {
      partial: false,
      current,
    });

    if (error) {
      return res.status(400).json({ error });
    }

    const updated = await replaceCategoryInDb(categoryId, value, {
      partial: false,
    });

    if (!updated) {
      return res.status(404).json({
        error: "Selected category could not be updated.",
      });
    }

    res.json(normalizeCategoryForResponse(updated));
  } catch (error) {
    console.error("[PUT /api/categories/:id]", error);
    res.status(500).json({ error: "Failed to replace category." });
  }
});

app.patch("/api/categories/:id", async (req, res) => {
  try {
    const categoryId = String(req.params.id ?? "").trim();
    const current = await findCategoryById(categoryId);

    if (!current) {
      return res.status(404).json({
        error: "Selected category was not found.",
      });
    }

    const { value, error } = buildCategoryPayload(req.body || {}, {
      partial: true,
      current,
    });

    if (error) {
      return res.status(400).json({ error });
    }

    const updated = await replaceCategoryInDb(categoryId, value, {
      partial: true,
    });

    if (!updated) {
      return res.status(404).json({
        error: "Selected category could not be updated.",
      });
    }

    res.json(normalizeCategoryForResponse(updated));
  } catch (error) {
    console.error("[PATCH /api/categories/:id]", error);
    res.status(500).json({ error: "Failed to update category." });
  }
});

app.delete("/api/categories/:id", async (req, res) => {
  try {
    const categoryId = String(req.params.id ?? "").trim();
    const current = await findCategoryById(categoryId);

    if (!current) {
      return res.status(404).json({
        error: "Selected category was not found.",
      });
    }

    const removed = await deleteCategoryFromDb(categoryId);

    res.json({
      ok: true,
      removed: normalizeCategoryForResponse(removed || current),
    });
  } catch (error) {
    console.error("[DELETE /api/categories/:id]", error);
    res.status(500).json({ error: "Failed to delete category." });
  }
});

app.get("/api/summary", async (_req, res) => {
  try {
    const transactions = await getAllTransactionsSafe();
    const normalizedTransactions = transactions
      .map((transaction) => normalizeTransactionForResponse(transaction))
      .filter(Boolean);

    const income = normalizedTransactions
      .filter((transaction) => transaction.type === "income")
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    const expenses = normalizedTransactions
      .filter((transaction) => transaction.type === "expense")
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    const expenseCategories = buildExpenseCategories(normalizedTransactions);
    const topExpenseCategory =
      expenseCategories.length > 0 ? expenseCategories[0].category : null;

    res.json({
      income: Number(income.toFixed(2)),
      expenses: Number(expenses.toFixed(2)),
      balance: Number((income - expenses).toFixed(2)),
      count: normalizedTransactions.length,
      expenseCategories,
      topExpenseCategory,
      recentTransactions: buildRecentTransactions(normalizedTransactions),
    });
  } catch (error) {
    console.error("[GET /api/summary]", error);
    res.status(500).json({ error: "Failed to load summary." });
  }
});

app.post("/api/transactions", async (req, res) => {
  try {
    const { value, error } = buildTransactionPayload(req.body || {});
    if (error) {
      return res.status(400).json({ error });
    }

    const created = await db.addTransaction(value);
    res.status(201).json(normalizeTransactionForResponse(created));
  } catch (error) {
    console.error("[POST /api/transactions]", error);
    res.status(500).json({ error: "Failed to create transaction." });
  }
});

app.post("/api/places", async (req, res) => {
  try {
    const { value, error } = buildPlacePayload(req.body || {});
    if (error) {
      return res.status(400).json({ error });
    }

    const existing = await findDuplicatePlaceByName(value.name);
    if (existing) {
      return res.status(200).json(normalizePlaceForResponse(existing));
    }

    if (typeof db.addPlace !== "function") {
      throw new Error("DB addPlace path is not available.");
    }

    const created = await db.addPlace(value);
    res.status(201).json(normalizePlaceForResponse(created));
  } catch (error) {
    console.error("[POST /api/places]", error);
    res.status(500).json({ error: "Failed to create place." });
  }
});

app.put("/api/transactions/:id", async (req, res) => {
  try {
    const transactionId = String(req.params.id ?? "").trim();
    const current = await findTransactionById(transactionId);

    if (!current) {
      return res.status(404).json({
        error: "Selected transaction was not found.",
      });
    }

    const { value, error } = buildTransactionPayload(req.body || {}, {
      partial: false,
      current,
    });

    if (error) {
      return res.status(400).json({ error });
    }

    const updated = await replaceTransactionInDb(transactionId, value, {
      partial: false,
    });

    if (!updated) {
      return res.status(404).json({
        error: "Selected transaction could not be updated.",
      });
    }

    res.json(normalizeTransactionForResponse(updated));
  } catch (error) {
    console.error("[PUT /api/transactions/:id]", error);
    res.status(500).json({ error: "Failed to replace transaction." });
  }
});

app.put("/api/places/:id", async (req, res) => {
  try {
    const placeId = String(req.params.id ?? "").trim();
    const current = await findPlaceById(placeId);

    if (!current) {
      return res.status(404).json({
        error: "Selected place was not found.",
      });
    }

    const { value, error } = buildPlacePayload(req.body || {}, {
      partial: false,
      current,
    });

    if (error) {
      return res.status(400).json({ error });
    }

    const updated = await replacePlaceInDb(placeId, value, {
      partial: false,
    });

    if (!updated) {
      return res.status(404).json({
        error: "Selected place could not be updated.",
      });
    }

    res.json(normalizePlaceForResponse(updated));
  } catch (error) {
    console.error("[PUT /api/places/:id]", error);
    res.status(500).json({ error: "Failed to replace place." });
  }
});

app.patch("/api/transactions/:id", async (req, res) => {
  try {
    const transactionId = String(req.params.id ?? "").trim();
    const current = await findTransactionById(transactionId);

    if (!current) {
      return res.status(404).json({
        error: "Selected transaction was not found.",
      });
    }

    const { value, error } = buildTransactionPayload(req.body || {}, {
      partial: true,
      current,
    });

    if (error) {
      return res.status(400).json({ error });
    }

    const updated = await replaceTransactionInDb(transactionId, value, {
      partial: true,
    });

    if (!updated) {
      return res.status(404).json({
        error: "Selected transaction could not be updated.",
      });
    }

    res.json(normalizeTransactionForResponse(updated));
  } catch (error) {
    console.error("[PATCH /api/transactions/:id]", error);
    res.status(500).json({ error: "Failed to update transaction." });
  }
});

app.patch("/api/places/:id", async (req, res) => {
  try {
    const placeId = String(req.params.id ?? "").trim();
    const current = await findPlaceById(placeId);

    if (!current) {
      return res.status(404).json({
        error: "Selected place was not found.",
      });
    }

    const { value, error } = buildPlacePayload(req.body || {}, {
      partial: true,
      current,
    });

    if (error) {
      return res.status(400).json({ error });
    }

    const updated = await replacePlaceInDb(placeId, value, {
      partial: true,
    });

    if (!updated) {
      return res.status(404).json({
        error: "Selected place could not be updated.",
      });
    }

    res.json(normalizePlaceForResponse(updated));
  } catch (error) {
    console.error("[PATCH /api/places/:id]", error);
    res.status(500).json({ error: "Failed to update place." });
  }
});

app.delete("/api/transactions/:id", async (req, res) => {
  try {
    const transactionId = String(req.params.id ?? "").trim();
    const current = await findTransactionById(transactionId);

    if (!current) {
      return res.status(404).json({
        error: "Selected transaction was not found.",
      });
    }

    const removed = await deleteTransactionFromDb(transactionId);

    res.json({
      ok: true,
      removed: normalizeTransactionForResponse(removed || current),
    });
  } catch (error) {
    console.error("[DELETE /api/transactions/:id]", error);
    res.status(500).json({ error: "Failed to delete transaction." });
  }
});

app.delete("/api/places/:id", async (req, res) => {
  try {
    const placeId = String(req.params.id ?? "").trim();
    const current = await findPlaceById(placeId);

    if (!current) {
      return res.status(404).json({
        error: "Selected place was not found.",
      });
    }

    const removed = await deletePlaceFromDb(placeId);

    res.json({
      ok: true,
      removed: normalizePlaceForResponse(removed || current),
    });
  } catch (error) {
    console.error("[DELETE /api/places/:id]", error);
    res.status(500).json({ error: "Failed to delete place." });
  }
});

app.use((err, _req, res, _next) => {
  console.error("[Express error]", err);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(PORT, HOST, () => {
  console.log(`[BeSafe API] Running on http://${HOST}:${PORT}`);
}).on("error", (error) => {
  console.error("[BeSafe API] Failed to start", error);
});