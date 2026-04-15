import { createTranslator, getCurrentLanguage } from "../../core/i18n.js";
import { registry } from "../../core/service.registry.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function resolveLanguage() {
  try {
    const current = String(getCurrentLanguage?.() || "").trim().toLowerCase();
    if (current) return current;
  } catch {}

  try {
    const langA = String(localStorage.getItem("besafe_lang") || "").trim().toLowerCase();
    if (langA) return langA;

    const langB = String(localStorage.getItem("besafe:language") || "").trim().toLowerCase();
    if (langB) return langB;

    const docLang = String(document?.documentElement?.lang || "").trim().toLowerCase();
    if (docLang) return docLang;
  } catch {}

  return "en";
}

const LOCALE_MAP = { lt: "lt-LT", en: "en-GB", pl: "pl-PL", de: "de-DE", es: "es-ES", fr: "fr-FR", it: "it-IT", ru: "ru-RU", uk: "uk-UA", no: "nb-NO", sv: "sv-SE", ja: "ja-JP", zh: "zh-CN" };

function getLocale(lang) {
  return LOCALE_MAP[lang] || "en-GB";
}

function normalizeCurrency(value, fallback = "EUR") {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized || fallback;
}

export class QuickActions {
  constructor(options = {}) {
    this.root = null;
    this.overlayHost = null;
    this.isBusy = false;
    this.activeAction = null;
    this.submitHandler = null;
    this.lastFocus = null;
    this.currency = normalizeCurrency(options.currency || "EUR");
    this.plan = "personal";
    this.transactionService = null;
    this.availableCategories = [];
    this.isLoadingCategories = false;
    this.availablePlaces = [];
    this.isLoadingPlaces = false;
    this.pendingScannerFile = null;
    this.pendingScannerPreviewUrl = "";

    this.actionDrafts = {
      expense: {},
      income: {},
      receipt: {},
      "receipt-scanner": {},
    };

    this.isCategoryModalOpen = false;
    this.categoryModalType = "expense";
    this.categoryModalName = "";
    this.categoryModalError = "";
    this.categoryModalSaving = false;

    this.isPlaceModalOpen = false;
    this.placeModalName = "";
    this.placeModalType = "store";
    this.placeModalPurpose = "expense";
    this.placeModalError = "";
    this.placeModalSaving = false;

    // Receipt scanner state
    this.scannerStep = "scan";   // "scan" | "scanning" | "preview" | "edit"
    this.scannerOcrResult = null; // { amount, date, store, note }

    this.boundClickHandler = this.handleClick.bind(this);
    this.boundSubmitHandler = this.handleSubmit.bind(this);
    this.boundKeydownHandler = this.handleKeydown.bind(this);
    this.boundChangeHandler = this.handleChange.bind(this);
    this.boundInputHandler = this.handleInput.bind(this);
    this.boundCategoryCreatedHandler = this.handleCategoryCreated.bind(this);
  }

  setPlan(plan) {
    const normalized = String(plan || "").trim().toLowerCase();
    this.plan = normalized === "business" ? "business" : "personal";
  }

  isBusinessPlan() {
    return this.plan === "business";
  }

  get lang() {
    return resolveLanguage();
  }

  get locale() {
    return getLocale(this.lang);
  }

  t(key, fallback, variables) {
    try {
      const translator = createTranslator(this.lang);
      const value = translator(key, fallback, variables);

      if (typeof value !== "string") {
        return fallback;
      }

      const normalizedValue = value.trim();
      const normalizedKey = String(key || "").trim();
      const normalizedFallback = String(fallback || "").trim();

      if (!normalizedValue) {
        return fallback;
      }

      if (normalizedKey && normalizedValue === normalizedKey) {
        return fallback;
      }

      return normalizedValue || normalizedFallback || fallback;
    } catch {
      return fallback;
    }
  }

  get copy() {
    return {
      actions: {
        expense: this.t("home.actions.expense", "Add expense"),
        income: this.t("home.actions.income", "Add income"),
        receipt: this.t("home.actions.receipt", "Add receipt"),
        receiptScanner: this.t(
          "home.actions.receiptScanner",
          "Receipt scanner"
        ),
      },
      guidance: {
        eyebrow: this.t("home.guidance.eyebrow", "BeSafe guidance"),
        title: this.t(
          "home.guidance.title",
          "Choose an action after reviewing your situation"
        ),
        text: this.t(
          "home.guidance.text",
          "Once you choose an action, the next step opens immediately without taking over the whole Home page."
        ),
      },
      common: {
        close: this.t("quickActions.common.closeLabel", "Close"),
        cancel: this.t("quickActions.common.cancelLabel", "Cancel"),
        save: this.t("quickActions.common.finishLabel", "Save"),
        category: this.t("quickActions.common.categoryLabel", "Category"),
        categoryDetail: this.t(
          "quickActions.common.categoryDetailLabel",
          "Category detail"
        ),
        categoryDetailPlaceholder: this.t(
          "quickActions.common.categoryDetailPlaceholder",
          "Short category detail"
        ),
        amount: this.t("quickActions.common.amountLabel", "Amount"),
        date: this.t("quickActions.common.dateLabel", "Date"),
        note: this.t("quickActions.common.noteLabel", "Note"),
        notePlaceholder: this.t(
          "quickActions.common.notePlaceholder",
          "A short note can help you remember the context later"
        ),
        place: this.t("quickActions.common.placeLabel", "Place"),
        placePlaceholder: this.t(
          "quickActions.common.placePlaceholder",
          "Choose a saved place"
        ),
        noPlaceOption: this.t(
          "quickActions.common.noPlaceOption",
          "No specific place"
        ),
        placeHelp: this.t(
          "quickActions.common.placeHelp",
          "Link this entry to a saved place if it helps keep your records clearer."
        ),
        placeLoading: this.t(
          "quickActions.common.placeLoading",
          "Loading saved places..."
        ),
        placeEmpty: this.t(
          "quickActions.common.placeEmpty",
          "No saved places yet. You can still save the entry without a place."
        ),
        nextStep: this.t("quickActions.step.default", "Next step"),
        saving: this.t("quickActions.status.saving", "Saving..."),
        saveFailed: this.t(
          "quickActions.status.saveFailed",
          "This entry could not be saved. Review the fields and try again."
        ),
        savePathMissing: this.t(
          "quickActions.status.savePathMissing",
          "Saving is not connected yet."
        ),
        invalidType: this.t(
          "quickActions.validation.invalidType",
          "We could not determine the entry type. Please choose the action again."
        ),
        missingCategory: this.t(
          "quickActions.validation.missingCategory",
          "Please choose a category."
        ),
        missingCategoryDetail: this.t(
          "quickActions.validation.missingCategoryDetail",
          "Add a short category detail."
        ),
        invalidAmount: this.t(
          "quickActions.validation.invalidAmount",
          "Enter an amount greater than zero."
        ),
        missingDate: this.t(
          "quickActions.validation.missingDate",
          "Please choose a date."
        ),
        savedTitle: this.t("quickActions.step.success", "Saved"),
        savedText: this.t(
          "quickActions.receipt.successText",
          "The entry was saved successfully."
        ),
        receiptImageLabel: this.t(
          "quickActions.receiptScanner.imageLabel",
          "Receipt photo"
        ),
        receiptImageHelp: this.t(
          "quickActions.receiptScanner.imageHelp",
          "Add a receipt photo to keep this scanner draft connected to a real source."
        ),
        receiptImagePlaceholder: this.t(
          "quickActions.receiptScanner.imagePlaceholder",
          "No receipt photo selected yet."
        ),
        receiptImageSelectedPrefix: this.t(
          "quickActions.receiptScanner.imageSelectedPrefix",
          "Selected file"
        ),
        receiptImageChangeLabel: this.t(
          "quickActions.receiptScanner.imageChangeLabel",
          "Choose photo"
        ),
        receiptImageRemoveLabel: this.t(
          "quickActions.receiptScanner.imageRemoveLabel",
          "Remove photo"
        ),
        scannerDraftTitle: this.t(
          "quickActions.receiptScanner.draftTitle",
          "Scanner draft"
        ),
        scannerDraftPending: this.t(
          "quickActions.receiptScanner.draftPending",
          "Add a receipt photo first. The scanner flow starts from a real image source."
        ),
        scannerDraftReady: this.t(
          "quickActions.receiptScanner.draftReady",
          "Receipt photo added. Recognition is not connected yet, so review the details manually before saving."
        ),
        scannerDraftReviewHint: this.t(
          "quickActions.receiptScanner.draftReviewHint",
          "This is still a review step, not a final automatic scanner result."
        ),
        scannerPhotoRequired: this.t(
          "quickActions.receiptScanner.photoRequired",
          "Please add a receipt photo before continuing."
        ),
        scannerSourceTitle: this.t(
          "quickActions.receiptScanner.sourceTitle",
          "Receipt source"
        ),
        scannerSourceMissing: this.t(
          "quickActions.receiptScanner.sourceMissing",
          "Add a receipt photo first so this review stays connected to a real source."
        ),
        scannerSourceReady: this.t(
          "quickActions.receiptScanner.sourceReady",
          "Receipt photo added. You can now continue through manual review before saving."
        ),
        scannerReviewTitle: this.t(
          "quickActions.receiptScanner.reviewTitle",
          "Receipt review"
        ),
        scannerReviewIntro: this.t(
          "quickActions.receiptScanner.reviewIntro",
          "Review the receipt details manually. Recognition is not connected yet, so nothing here is filled automatically."
        ),
        scannerReviewManual: this.t(
          "quickActions.receiptScanner.reviewManual",
          "Confirm the category, amount, date, note, and place before this becomes a real saved record."
        ),
        scannerReviewChecklistTitle: this.t(
          "quickActions.receiptScanner.reviewChecklistTitle",
          "Review checklist"
        ),
        scannerReviewChecklistPhoto: this.t(
          "quickActions.receiptScanner.reviewChecklistPhoto",
          "Photo added"
        ),
        scannerReviewChecklistDetails: this.t(
          "quickActions.receiptScanner.reviewChecklistDetails",
          "Details checked manually"
        ),
        scannerReviewChecklistConfirm: this.t(
          "quickActions.receiptScanner.reviewChecklistConfirm",
          "Ready to confirm and save"
        ),
        scannerReviewPlaceHintReady: this.t(
          "quickActions.receiptScanner.reviewPlaceHintReady",
          "Link the receipt to a saved place if that helps keep store and price history clearer."
        ),
        scannerReviewPlaceHintMissing: this.t(
          "quickActions.receiptScanner.reviewPlaceHintMissing",
          "You can still save this receipt without a place, but adding one helps keep receipt history clearer later."
        ),
        scannerReviewPlaceLinkedPrefix: this.t(
          "quickActions.receiptScanner.reviewPlaceLinkedPrefix",
          "Linked place"
        ),
        scannerReviewPlacePending: this.t(
          "quickActions.receiptScanner.reviewPlacePending",
          "No place linked yet"
        ),
        scannerReviewConfirmState: this.t(
          "quickActions.receiptScanner.reviewConfirmState",
          "Photo added, manual review in progress, waiting for your confirmation."
        ),
      },
      expense: {
        title: this.t("quickActions.expense.title", "Add expense"),
        intro: this.t(
          "quickActions.expense.text",
          "Record a cost clearly so BeSafe can update your situation."
        ),
        hint: this.t(
          "quickActions.expense.formStepText",
          "Choose the category, add the amount, and keep a short note if it helps later."
        ),
        submit: this.t("quickActions.expense.submitLabel", "Save expense"),
        successTitle: this.t(
          "quickActions.expense.successTitle",
          "Expense saved"
        ),
        successText: this.t(
          "quickActions.expense.successText",
          "The entry is saved. Your financial picture is now a little clearer."
        ),
      },
      income: {
        title: this.t("quickActions.income.title", "Add income"),
        intro: this.t(
          "quickActions.income.text",
          "Record money that came in so your overview stays accurate."
        ),
        hint: this.t(
          "quickActions.income.formStepText",
          "Choose the category, add the amount, and keep a short note if it helps later."
        ),
        submit: this.t("quickActions.income.submitLabel", "Save income"),
        successTitle: this.t(
          "quickActions.income.successTitle",
          "Income saved"
        ),
        successText: this.t(
          "quickActions.income.successText",
          "The entry is saved. Your overview is now more accurate."
        ),
      },
      receipt: {
        title: this.t("quickActions.receipt.title", "Add receipt"),
        intro: this.t(
          "quickActions.receipt.text",
          "Start with the main details and keep receipt context as a clear note."
        ),
        hint: this.t(
          "quickActions.receipt.formStepText",
          "Choose the category, add the amount and date, then add a note if it helps."
        ),
        submit: this.t("quickActions.receipt.submitLabel", "Save receipt"),
        successTitle: this.t("quickActions.receipt.successTitle", "Entry saved"),
        successText: this.t(
          "quickActions.receipt.successText",
          "The entry is saved. You will also see it in the transactions list."
        ),
      },
      scanner: {
        title: this.t("quickActions.receiptScanner.title", "Receipt scanner"),
        intro: this.t(
          "quickActions.receiptScanner.text",
          "The scanner stays a safe MVP entry point: after scanning, the user should continue through a clear review step."
        ),
        hint: this.t(
          "quickActions.receiptScanner.infoText",
          "Start the scan first, then continue through review before saving."
        ),
        submit: this.t(
          "quickActions.receipt.submitLabel",
          "Confirm and save receipt"
        ),
        successTitle: this.t(
          "quickActions.receipt.successTitle",
          "Receipt saved"
        ),
        successText: this.t(
          "quickActions.receipt.successText",
          "The reviewed receipt entry is now saved and will appear in transactions."
        ),
      },
    };
  }

  normalizeOptionalId(value) {
    const normalized = String(value ?? "").trim();
    return normalized || null;
  }

  normalizeText(value) {
    return String(value ?? "").trim();
  }

  normalizePlaceType(value) {
    const normalized = this.normalizeText(value).toLowerCase();

    if (!normalized) {
      return "";
    }

    const compact = normalized
      .replaceAll("-", "")
      .replaceAll("_", "")
      .replaceAll(" ", "");

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
      compact === "fuelstation" ||
      compact === "gasstation" ||
      compact === "petrolstation" ||
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

    if (compact === "other" || compact === "kita") {
      return "other";
    }

    return normalized;
  }

  getTransactionService() {
    if (this.transactionService) {
      return this.transactionService;
    }

    try {
      this.transactionService = registry.get("transactions");
      return this.transactionService;
    } catch (error) {
      console.warn("[QuickActions] Failed to get transactions service:", error);
      return null;
    }
  }

  normalizePlaceOption(place = {}) {
    const id = this.normalizeOptionalId(place?.id || place?.placeId);
    const name = this.normalizeText(
      place?.name ||
        place?.title ||
        place?.merchantName ||
        place?.stationName ||
        place?.storeName ||
        place?.transportName ||
        place?.housingName ||
        place?.bankName
    );
    const type = this.normalizePlaceType(place?.type || place?.placeType);
    const purpose = this.normalizeText(place?.purpose || "expense").toLowerCase();

    return {
      id,
      name,
      type,
      purpose,
      note: this.normalizeText(place?.note),
    };
  }

  getPlaceTypeLabel(type) {
    const normalized = this.normalizePlaceType(type);

    if (normalized === "store") {
      return this.t("places.types.store", "Store");
    }

    if (normalized === "transport") {
      return this.t("places.types.transport", "Transport");
    }

    if (normalized === "housing") {
      return this.t("places.types.housing", "Housing");
    }

    if (normalized === "bank") {
      return this.t("places.types.bank", "Bank");
    }

    return this.t("places.types.other", "Other");
  }

  async ensurePlacesLoaded() {
    if (this.isLoadingPlaces) {
      return;
    }

    if (Array.isArray(this.availablePlaces) && this.availablePlaces.length) {
      return;
    }

    const service = this.getTransactionService();
    if (!service || typeof service.getPlaces !== "function") {
      this.availablePlaces = [];
      return;
    }

    this.isLoadingPlaces = true;

    try {
      let places = [];

      if (typeof service.getPlacesCache === "function") {
        places = service.getPlacesCache();
      }

      if (!places || !places.length) {
        places = await service.getPlaces();
      }

      this.availablePlaces = Array.isArray(places)
        ? places
            .map((place) => this.normalizePlaceOption(place))
            .filter((place) => place.id && place.name)
        : [];
    } catch (error) {
      console.warn("[QuickActions] Failed to load places:", error);
      this.availablePlaces = [];
    } finally {
      this.isLoadingPlaces = false;
    }
  }

  normalizeDraftValues(values = {}) {
    if (!values || typeof values !== "object" || Array.isArray(values)) {
      return {};
    }

    return {
      category: this.normalizeText(values.category),
      categoryId: this.normalizeOptionalId(values.categoryId),
      categoryDetail: this.normalizeText(values.categoryDetail),
      amount:
        values.amount === null ||
        values.amount === undefined ||
        values.amount === ""
          ? ""
          : String(values.amount),
      date: this.normalizeText(values.date),
      note: this.normalizeText(values.note),
      placeId: this.normalizeOptionalId(values.placeId),
      placeName: this.normalizeText(values.placeName || values.storeName || ""),
      receiptImageName: this.normalizeText(values.receiptImageName),
    };
  }

  setDraftValues(action, values = {}) {
    if (
      !["expense", "income", "receipt", "receipt-scanner"].includes(
        String(action || "").trim()
      )
    ) {
      return;
    }

    this.actionDrafts[action] = this.normalizeDraftValues(values);
  }

  getDraftValues(action) {
    if (
      !["expense", "income", "receipt", "receipt-scanner"].includes(
        String(action || "").trim()
      )
    ) {
      return {};
    }

    return this.normalizeDraftValues(this.actionDrafts[action] || {});
  }

  clearDraftValues(action) {
    if (
      !["expense", "income", "receipt", "receipt-scanner"].includes(
        String(action || "").trim()
      )
    ) {
      return;
    }

    this.actionDrafts[action] = {};
  }

  setPlaceContext(action, placeContext = {}) {
    if (
      !["expense", "income", "receipt", "receipt-scanner"].includes(
        String(action || "").trim()
      )
    ) {
      return;
    }

    const current = this.getDraftValues(action);

    this.setDraftValues(action, {
      ...current,
      placeId: this.normalizeOptionalId(placeContext.placeId),
      placeName: this.normalizeText(
        placeContext.placeName || placeContext.storeName || ""
      ),
    });
  }

  clearPlaceContext(action) {
    if (
      !["expense", "income", "receipt", "receipt-scanner"].includes(
        String(action || "").trim()
      )
    ) {
      return;
    }

    const current = this.getDraftValues(action);
    this.setDraftValues(action, {
      ...current,
      placeId: null,
      placeName: "",
    });
  }

  clearPendingScannerFile() {
    this.pendingScannerFile = null;

    if (this.pendingScannerPreviewUrl) {
      try {
        URL.revokeObjectURL(this.pendingScannerPreviewUrl);
      } catch {}
    }

    this.pendingScannerPreviewUrl = "";
  }

  setPendingScannerFile(file) {
    this.clearPendingScannerFile();

    if (!file) {
      const currentDraft = this.getDraftValues("receipt-scanner");
      this.setDraftValues("receipt-scanner", {
        ...currentDraft,
        receiptImageName: "",
      });
      return;
    }

    this.pendingScannerFile = file;

    try {
      this.pendingScannerPreviewUrl = URL.createObjectURL(file);
    } catch {
      this.pendingScannerPreviewUrl = "";
    }

    const currentDraft = this.getDraftValues("receipt-scanner");
    this.setDraftValues("receipt-scanner", {
      ...currentDraft,
      receiptImageName: file.name || "",
    });

    window.dispatchEvent(
      new CustomEvent("besafe:receipt-scanner-file-selected", {
        detail: {
          source: "quick-actions",
          entryPoint: "receipt-scanner",
          fileName: file.name || "",
          fileType: file.type || "",
          fileSize: Number(file.size || 0),
        },
      })
    );
  }

  hasScannerImage(values = {}) {
    const safeValues = this.normalizeDraftValues(values);
    return Boolean(
      safeValues.receiptImageName ||
        this.pendingScannerFile?.name ||
        this.pendingScannerPreviewUrl
    );
  }

  getSelectedPlace(values = {}) {
    const safeValues = this.normalizeDraftValues(values);
    const selectedPlaceId = this.normalizeOptionalId(safeValues.placeId);

    if (!selectedPlaceId) {
      return null;
    }

    return (
      this.availablePlaces.find((place) => place.id === selectedPlaceId) || null
    );
  }

  renderScannerChecklistItem(label, complete = false) {
    return `
      <li class="quick-action-form__helper" style="margin:0;">
        ${escapeHtml(complete ? "✓" : "•")} ${escapeHtml(label)}
      </li>
    `;
  }

  getCategoryLabel(value, actionType) {
    const keyMapExpense = {
      food: "categories.food",
      transport: "categories.transport",
      housing: "categories.housing",
      health: "categories.health",
      education: "categories.education",
      shopping: "categories.shopping",
      entertainment: "categories.entertainment",
      bills: "categories.bills",
      travel: "categories.travel",
      family: "categories.family",
      pets: "categories.pets",
      gifts: "categories.gifts",
      other: "categories.other",
    };

    const keyMapIncome = {
      salary: "incomeCategories.salary",
      bonus: "incomeCategories.bonus",
      additional_income: "incomeCategories.additionalIncome",
      refund: "incomeCategories.refund",
      other: "categories.other",
    };

    const key =
      actionType === "income" ? keyMapIncome[value] : keyMapExpense[value];

    if (!key) {
      return value;
    }

    return this.t(key, value);
  }

  async ensureCategoriesLoaded() {
    if (this.isLoadingCategories) {
      return;
    }

    const service = this.getTransactionService();
    if (!service || typeof service.getCategories !== "function") {
      this.availableCategories = [];
      return;
    }

    this.isLoadingCategories = true;

    try {
      let categories = [];

      if (typeof service.getCategoriesCache === "function") {
        categories = service.getCategoriesCache();
      }

      if (!categories || !categories.length) {
        categories = await service.getCategories();
      }

      this.availableCategories = Array.isArray(categories)
        ? categories.filter((category) => category?.id && category?.name)
        : [];
    } catch (error) {
      console.warn("[QuickActions] Failed to load categories:", error);
      this.availableCategories = [];
    } finally {
      this.isLoadingCategories = false;
    }
  }

  getCategoryList(action) {
    const categories = Array.isArray(this.availableCategories)
      ? this.availableCategories
      : [];

    const type = action === "income" ? "income" : "expense";

    return categories
      .filter((category) => category?.type === type)
      .map((category) => [category.id, category.name]);
  }

  formatAmount(amount = 0, currency = this.currency) {
    const numericAmount = Number(amount || 0);
    const safeAmount = Number.isFinite(numericAmount) ? numericAmount : 0;
    const safeCurrency = normalizeCurrency(currency, "EUR");

    try {
      return new Intl.NumberFormat(this.locale, {
        style: "currency",
        currency: safeCurrency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(safeAmount);
    } catch {
      return `${safeCurrency} ${safeAmount.toFixed(2)}`;
    }
  }

  mount(rootElement) {
    if (!rootElement) return;
    this.unmount();
    this.root = rootElement;

    this.renderGuidance();

    document.addEventListener("click", this.boundClickHandler);
    document.addEventListener("submit", this.boundSubmitHandler);
    document.addEventListener("keydown", this.boundKeydownHandler);
    document.addEventListener("change", this.boundChangeHandler);
    document.addEventListener("input", this.boundInputHandler);
    window.addEventListener(
      "besafe:category-created",
      this.boundCategoryCreatedHandler
    );

    // Pranešti app.js, kad QuickActions yra paruoštas
    window.dispatchEvent(
      new CustomEvent("besafe:quick-actions-ready", {
        detail: { quickActions: this },
      })
    );
  }

  unmount() {
    document.removeEventListener("click", this.boundClickHandler);
    document.removeEventListener("submit", this.boundSubmitHandler);
    document.removeEventListener("keydown", this.boundKeydownHandler);
    document.removeEventListener("change", this.boundChangeHandler);
    document.removeEventListener("input", this.boundInputHandler);
    window.removeEventListener(
      "besafe:category-created",
      this.boundCategoryCreatedHandler
    );
    this.closeAction({ restoreFocus: false, keepDraft: true, silent: true });
    this.root = null;
    this.submitHandler = null;
    this.isBusy = false;
    this.clearPendingScannerFile();
  }

  setSubmitHandler(handler) {
    this.submitHandler = typeof handler === "function" ? handler : null;
  }

  handleCategoryCreated(event) {
    const detail =
      event?.detail && typeof event.detail === "object" ? event.detail : {};

    const createdCategory =
      detail.category && typeof detail.category === "object"
        ? detail.category
        : null;

    const categoryId = this.normalizeOptionalId(createdCategory?.id);
    const categoryName = this.normalizeText(createdCategory?.name);
    const categoryType = this.normalizeText(createdCategory?.type).toLowerCase();

    if (!categoryId || !categoryName || !categoryType) {
      this.refreshCategoriesAfterCreate();
      return;
    }

    const exists = this.availableCategories.some((category) => {
      return this.normalizeOptionalId(category?.id) === categoryId;
    });

    if (!exists) {
      this.availableCategories = [createdCategory, ...this.availableCategories];
    }

    const action = this.activeAction;
    if (!action) {
      return;
    }

    const expectedType = action === "income" ? "income" : "expense";
    if (categoryType !== expectedType) {
      this.refreshCategoriesAfterCreate();
      return;
    }

    const currentDraft = this.getDraftValues(action);
    this.setDraftValues(action, {
      ...currentDraft,
      categoryId,
      category: categoryName,
    });

    this.rerenderActiveAction();
  }

  async refreshCategoriesAfterCreate() {
    this.availableCategories = [];
    await this.ensureCategoriesLoaded();
    this.rerenderActiveAction();
  }

  rerenderActiveAction() {
    if (!this.activeAction) {
      return;
    }

    const action = this.activeAction;
    this.closeAction({ restoreFocus: false, keepDraft: true, silent: true });
    this.openAction(action, { restoreDraft: true });
  }

  setButtonsDisabled(disabled) {
    if (!this.root) return;
    const buttons = this.root.querySelectorAll("[data-action]");
    buttons.forEach((button) => {
      button.disabled = disabled;
      button.classList.toggle("is-disabled", disabled);
      button.setAttribute("aria-busy", disabled ? "true" : "false");
    });
  }

  setActionSelected(action) {
    if (!this.root) return;

    const buttons = this.root.querySelectorAll("[data-action]");
    buttons.forEach((button) => {
      const selected = button.dataset.action === action;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });

    this.renderGuidance(action);
  }

  clearActionSelection() {
    if (!this.root) return;

    const buttons = this.root.querySelectorAll("[data-action]");
    buttons.forEach((button) => {
      button.classList.remove("is-selected");
      button.setAttribute("aria-pressed", "false");
      button.disabled = false;
      button.classList.remove("is-disabled");
      button.setAttribute("aria-busy", "false");
    });

    this.renderGuidance();
  }

  getGuidanceNode() {
    return this.root?.querySelector?.("[data-guidance]") || null;
  }

  renderGuidance(action = null) {
    const node = this.getGuidanceNode();
    if (!node) return;

    if (!action) {
      node.hidden = true;
      node.innerHTML = "";
      return;
    }

    const actionCopy = this.getActionCopy(action);

    node.hidden = false;
    node.innerHTML = `
      <p class="quick-action-guidance__eyebrow">${escapeHtml(
        this.copy.common.nextStep
      )}</p>
      <p class="quick-action-guidance__text">${escapeHtml(
        actionCopy.hint
      )}</p>
    `;
  }

  getOverlayHost() {
    if (this.overlayHost && document.body.contains(this.overlayHost)) {
      return this.overlayHost;
    }

    const host = document.createElement("div");
    host.setAttribute("data-quick-actions-overlay-host", "");
    document.body.appendChild(host);
    this.overlayHost = host;
    return host;
  }

  removeOverlayShell() {
    const host =
      this.overlayHost ||
      document.querySelector("[data-quick-actions-overlay-host]");
    if (!host) return;
    host.remove();
    if (this.overlayHost === host) this.overlayHost = null;
  }

  getActionLabel(action) {
    const { actions } = this.copy;
    return {
      expense: actions.expense,
      income: actions.income,
      receipt: actions.receipt,
      "receipt-scanner": actions.receiptScanner,
    }[action] || actions.expense;
  }

  getActionCopy(action) {
    if (action === "expense") return this.copy.expense;
    if (action === "income") return this.copy.income;
    if (action === "receipt") return this.copy.receipt;
    return this.copy.scanner;
  }

  getTodayDateValue() {
    return new Date().toISOString().slice(0, 10);
  }

  renderCategories(action, selected = "") {
    return this.getCategoryList(action)
      .map(
        ([value, label]) => `
          <button
            type="button"
            class="quick-actions-categories__button${
              selected === value ? " is-selected" : ""
            }"
            data-category-option="${escapeHtml(value)}"
            data-category-value="${escapeHtml(value)}"
            aria-pressed="${selected === value ? "true" : "false"}"
          >
            ${escapeHtml(label)}
          </button>
        `
      )
      .join("");
  }

  openCreateCategoryModal() {
    // Save current form state into draft first
    if (this.activeAction) {
      const form = document.querySelector("[data-quick-action-form]");
      if (form) {
        const payload = this.readFormPayload(form, this.activeAction);
        this.setDraftValues(this.activeAction, payload);
      }
    }

    // Set default type based on active action
    this.categoryModalType = this.activeAction === "income" ? "income" : "expense";
    this.categoryModalName = "";
    this.categoryModalError = "";
    this.categoryModalSaving = false;
    this.isCategoryModalOpen = true;

    this.renderCategoryModal();
  }

  renderCategoryModal() {
    const existing = document.querySelector("[data-inline-category-modal]");
    if (existing) existing.remove();

    const typeExpenseLabel = this.t("categories.types.expense", "Išlaidos");
    const typeIncomeLabel = this.t("categories.types.income", "Pajamos");
    const titleLabel = this.t("categories.form.title", "Sukurti kategoriją");
    const namePlaceholder = this.t("categories.form.namePlaceholder", "Kategorijos pavadinimas");
    const saveLabel = this.t("categories.actions.save", "Išsaugoti");
    const cancelLabel = this.t("quickActions.common.cancelLabel", "Atšaukti");
    const typeLabelText = this.t("categories.form.typeLabel", "Tipas");

    const modal = document.createElement("div");
    modal.setAttribute("data-inline-category-modal", "");
    modal.style.cssText = "position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:24px;";

    modal.innerHTML = `
      <div
        style="position:absolute;inset:0;"
        data-inline-category-modal-backdrop
      ></div>
      <div
        class="quick-action-sheet"
        role="dialog"
        aria-modal="true"
        style="position:relative;z-index:1;max-width:420px;width:100%;"
      >
        <div class="quick-action-sheet__header">
          <div>
            <p class="quick-action-note">${escapeHtml(this.t("quickActions.common.categoryLabel", "Kategorija"))}</p>
            <h3 class="quick-action-sheet__title">${escapeHtml(titleLabel)}</h3>
          </div>
          <button
            type="button"
            class="quick-action-sheet__close"
            data-inline-category-modal-close
            aria-label="${escapeHtml(this.t("quickActions.common.closeLabel", "Uždaryti"))}"
          >×</button>
        </div>

        <div class="quick-action-form">
          <label class="quick-action-form__field">
            <span class="quick-action-form__label">${escapeHtml(namePlaceholder)}</span>
            <input
              class="quick-action-form__input"
              type="text"
              data-inline-category-name
              value="${escapeHtml(this.categoryModalName)}"
              placeholder="${escapeHtml(namePlaceholder)}"
              autocomplete="off"
            >
            ${this.categoryModalError ? `<p class="quick-action-form__error">${escapeHtml(this.categoryModalError)}</p>` : ""}
          </label>

          <div class="quick-action-form__field">
            <span class="quick-action-form__label">${escapeHtml(typeLabelText)}</span>
            <div class="quick-actions-categories" style="display:flex;gap:8px;">
              <button
                type="button"
                class="quick-actions-categories__button${this.categoryModalType === "expense" ? " is-selected" : ""}"
                data-inline-category-type="expense"
                aria-pressed="${this.categoryModalType === "expense" ? "true" : "false"}"
              >${escapeHtml(typeExpenseLabel)}</button>
              <button
                type="button"
                class="quick-actions-categories__button${this.categoryModalType === "income" ? " is-selected" : ""}"
                data-inline-category-type="income"
                aria-pressed="${this.categoryModalType === "income" ? "true" : "false"}"
              >${escapeHtml(typeIncomeLabel)}</button>
            </div>
          </div>

          <div class="quick-action-form__actions">
            <button
              type="button"
              class="quick-action-form__secondary"
              data-inline-category-modal-close
              ${this.categoryModalSaving ? "disabled" : ""}
            >${escapeHtml(cancelLabel)}</button>
            <button
              type="button"
              class="quick-action-form__primary"
              data-inline-category-save
              ${this.categoryModalSaving ? "disabled" : ""}
            >${escapeHtml(this.categoryModalSaving ? this.t("quickActions.status.saving", "Saugoma...") : saveLabel)}</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    requestAnimationFrame(() => {
      const input = modal.querySelector("[data-inline-category-name]");
      if (input) input.focus();
    });
  }

  closeCategoryModal() {
    this.isCategoryModalOpen = false;
    this.categoryModalName = "";
    this.categoryModalError = "";
    this.categoryModalSaving = false;
    const modal = document.querySelector("[data-inline-category-modal]");
    if (modal) modal.remove();
  }

  openCreatePlaceModal() {
    if (this.activeAction) {
      const form = document.querySelector("[data-quick-action-form]");
      if (form) {
        const payload = this.readFormPayload(form, this.activeAction);
        this.setDraftValues(this.activeAction, payload);
      }
    }

    this.placeModalName = "";
    this.placeModalType = "store";
    this.placeModalPurpose = this.activeAction === "income" ? "income" : "expense";
    this.placeModalError = "";
    this.placeModalSaving = false;
    this.isPlaceModalOpen = true;

    this.renderPlaceModal();
  }

  renderPlaceModal() {
    const existing = document.querySelector("[data-inline-place-modal]");
    if (existing) existing.remove();

    const titleLabel = this.t("quickActions.common.createPlaceLabel", "Sukurti vietą");
    const namePlaceholder = this.t("quickActions.common.placeNamePlaceholder", "Vietos pavadinimas");
    const saveLabel = this.t("categories.actions.save", "Išsaugoti");
    const cancelLabel = this.t("quickActions.common.cancelLabel", "Atšaukti");
    const typeLabelText = this.t("categories.form.typeLabel", "Tipas");

    const types = [
      ["store",     this.t("places.types.store",     "Parduotuvė")],
      ["transport", this.t("places.types.transport",  "Transportas")],
      ["housing",   this.t("places.types.housing",    "Būstas")],
      ["health",    this.t("places.types.health",     "Sveikata")],
      ["leisure",   this.t("places.types.leisure",    "Laisvalaikis")],
      ["bank",      this.t("places.types.bank",       "Bankas")],
      ["other",     this.t("places.types.other",      "Kita")],
    ];

    const typeButtons = types.map(([value, label]) => `
      <button
        type="button"
        class="quick-actions-categories__button${this.placeModalType === value ? " is-selected" : ""}"
        data-inline-place-type="${escapeHtml(value)}"
        aria-pressed="${this.placeModalType === value ? "true" : "false"}"
      >${escapeHtml(label)}</button>
    `).join("");

    const modal = document.createElement("div");
    modal.setAttribute("data-inline-place-modal", "");
    modal.style.cssText = "position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:24px;";

    modal.innerHTML = `
      <div
        style="position:absolute;inset:0;"
        data-inline-place-modal-backdrop
      ></div>
      <div
        class="quick-action-sheet"
        role="dialog"
        aria-modal="true"
        style="position:relative;z-index:1;max-width:420px;width:100%;"
      >
        <div class="quick-action-sheet__header">
          <div>
            <p class="quick-action-note">${escapeHtml(this.t("quickActions.common.place", "Vieta"))}</p>
            <h3 class="quick-action-sheet__title">${escapeHtml(titleLabel)}</h3>
          </div>
          <button
            type="button"
            class="quick-action-sheet__close"
            data-inline-place-modal-close
            aria-label="${escapeHtml(this.t("quickActions.common.closeLabel", "Uždaryti"))}"
          >×</button>
        </div>

        <div class="quick-action-form">
          <label class="quick-action-form__field">
            <span class="quick-action-form__label">${escapeHtml(namePlaceholder)}</span>
            <input
              class="quick-action-form__input"
              type="text"
              data-inline-place-name
              value="${escapeHtml(this.placeModalName)}"
              placeholder="${escapeHtml(namePlaceholder)}"
              autocomplete="off"
            >
            ${this.placeModalError ? `<p class="quick-action-form__error">${escapeHtml(this.placeModalError)}</p>` : ""}
          </label>

          <div class="quick-action-form__field">
            <span class="quick-action-form__label">${escapeHtml(typeLabelText)}</span>
            <div class="quick-actions-categories" style="display:flex;flex-wrap:wrap;gap:8px;">
              ${typeButtons}
            </div>
          </div>

          <div class="quick-action-form__actions">
            <button
              type="button"
              class="quick-action-form__secondary"
              data-inline-place-modal-close
              ${this.placeModalSaving ? "disabled" : ""}
            >${escapeHtml(cancelLabel)}</button>
            <button
              type="button"
              class="quick-action-form__primary"
              data-inline-place-save
              ${this.placeModalSaving ? "disabled" : ""}
            >${escapeHtml(this.placeModalSaving ? this.t("quickActions.status.saving", "Saugoma...") : saveLabel)}</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    requestAnimationFrame(() => {
      const input = modal.querySelector("[data-inline-place-name]");
      if (input) input.focus();
    });
  }

  closePlaceModal() {
    this.isPlaceModalOpen = false;
    this.placeModalName = "";
    this.placeModalError = "";
    this.placeModalSaving = false;
    const modal = document.querySelector("[data-inline-place-modal]");
    if (modal) modal.remove();
  }

  async handleInlinePlaceSave() {
    if (this.placeModalSaving) return;

    const modal = document.querySelector("[data-inline-place-modal]");
    const input = modal?.querySelector("[data-inline-place-name]");
    const name = this.normalizeText(input?.value || "");
    const type = this.placeModalType;
    const purpose = this.placeModalPurpose;

    if (!name) {
      this.placeModalError = this.t("categories.validation.missingName", "Įveskite vietos pavadinimą.");
      this.renderPlaceModal();
      return;
    }

    const service = this.getTransactionService();
    if (!service || typeof service.createPlace !== "function") {
      this.placeModalError = this.t("categories.error.serviceUnavailable", "Vietų paslauga šiuo metu nepasiekiama.");
      this.renderPlaceModal();
      return;
    }

    this.placeModalName = name;
    this.placeModalSaving = true;
    this.placeModalError = "";
    this.renderPlaceModal();

    try {
      const createdPlace = await service.createPlace({ name, type, purpose });

      // Add to local list immediately
      const normalized = this.normalizePlaceOption(createdPlace || { name, type, purpose });
      if (normalized.id || normalized.name) {
        this.availablePlaces = [normalized, ...this.availablePlaces];
      }

      // Auto-select the new place in the draft
      if (this.activeAction && (normalized.id || normalized.name)) {
        const currentDraft = this.getDraftValues(this.activeAction);
        this.setDraftValues(this.activeAction, {
          ...currentDraft,
          placeId: normalized.id || null,
          placeName: normalized.name,
        });
      }

      this.closePlaceModal();
      this.rerenderActiveAction();
    } catch (err) {
      console.warn("[QuickActions] Inline place save failed:", err);
      this.placeModalSaving = false;
      this.placeModalError = this.t("categories.status.saveFailed", "Nepavyko išsaugoti vietos.");
      this.renderPlaceModal();
    }
  }

  async handleInlineCategorySave() {
    if (this.categoryModalSaving) return;

    const modal = document.querySelector("[data-inline-category-modal]");
    const input = modal?.querySelector("[data-inline-category-name]");
    const name = this.normalizeText(input?.value || "");
    const type = this.categoryModalType;

    if (!name) {
      this.categoryModalError = this.t("categories.validation.missingName", "Įveskite kategorijos pavadinimą.");
      this.renderCategoryModal();
      return;
    }

    const service = this.getTransactionService();
    if (!service || typeof service.createCategory !== "function") {
      this.categoryModalError = this.t("categories.error.serviceUnavailable", "Kategorijų paslauga šiuo metu nepasiekiama.");
      this.renderCategoryModal();
      return;
    }

    this.categoryModalName = name;
    this.categoryModalSaving = true;
    this.categoryModalError = "";
    this.renderCategoryModal();

    try {
      const createdCategory = await service.createCategory({ name, type });

      // Invalidate cache so next load gets fresh list
      this.availableCategories = [];

      window.dispatchEvent(
        new CustomEvent("besafe:category-created", {
          detail: {
            category:
              createdCategory && typeof createdCategory === "object"
                ? createdCategory
                : { name, type },
            source: "quick-actions-inline",
          },
        })
      );

      this.closeCategoryModal();
    } catch (err) {
      console.warn("[QuickActions] Inline category save failed:", err);
      this.categoryModalSaving = false;
      this.categoryModalError = this.t("categories.status.saveFailed", "Nepavyko išsaugoti kategorijos.");
      this.renderCategoryModal();
    }
  }


  renderPlaceOptions(selectedPlaceId = "") {
    const safeSelected = this.normalizeOptionalId(selectedPlaceId) || "";
    const actionType =
      this.activeAction === "income" ? "income" : "expense";

    const visiblePlaces = this.availablePlaces.filter((place) => {
      const purpose = this.normalizeText(place?.purpose || "expense").toLowerCase();
      return purpose === actionType;
    });

    const options = [
      `<option value="">${escapeHtml(this.copy.common.noPlaceOption)}</option>`,
      ...visiblePlaces.map((place) => {
        const label = `${place.name} · ${this.getPlaceTypeLabel(place.type)}`;
        const isSelected = safeSelected && safeSelected === place.id;

        return `
          <option value="${escapeHtml(place.id)}" ${
            isSelected ? "selected" : ""
          }>
            ${escapeHtml(label)}
          </option>
        `;
      }),
    ];

    return options.join("");
  }

  renderPlaceField(action, values = {}) {
    if (!["expense", "income", "receipt", "receipt-scanner"].includes(action)) {
      return "";
    }

    const safeValues = this.normalizeDraftValues(values);
    const hasPlaces = this.availablePlaces.length > 0;
    const isLoading = this.isLoadingPlaces;
    const selectedPlaceId = safeValues.placeId || "";
    const selectedPlace = this.getSelectedPlace(safeValues);
    const helperText =
      action === "receipt-scanner"
        ? isLoading
          ? this.copy.common.placeLoading
          : hasPlaces
            ? this.copy.common.scannerReviewPlaceHintReady
            : this.copy.common.scannerReviewPlaceHintMissing
        : isLoading
          ? this.copy.common.placeLoading
          : hasPlaces
            ? (
                this.isBusinessPlan()
                  ? this.t(
                      "quickActions.common.placeHelp.business",
                      "Link this entry to a place so you can review activity and compare results later."
                    )
                  : this.copy.common.placeHelp
              )
            : this.copy.common.placeEmpty;

    return `
      <div class="quick-action-form__field">
        <span class="quick-action-form__label">${escapeHtml(
          this.copy.common.place
        )}</span>
        <select
          class="quick-action-form__input"
          name="placeId"
          data-place-select
          ${isLoading ? "disabled" : ""}
        >
          ${this.renderPlaceOptions(selectedPlaceId)}
        </select>
        <input
          type="hidden"
          name="placeName"
          value="${escapeHtml(safeValues.placeName || "")}"
          data-place-name-input
        >
        <p class="quick-action-form__helper">
          ${escapeHtml(helperText)}
        </p>
        ${
          action === "receipt-scanner"
            ? `
          <p class="quick-action-form__helper" style="margin-top:0.35rem;">
            ${escapeHtml(
              selectedPlace
                ? `${this.copy.common.scannerReviewPlaceLinkedPrefix}: ${selectedPlace.name}`
                : this.copy.common.scannerReviewPlacePending
            )}
          </p>
        `
            : ""
        }
        ${!isLoading ? `
          <button
            type="button"
            class="quick-action-form__secondary"
            data-create-place-inline
            style="margin-top:0.5rem;"
          >
            ${escapeHtml(this.t("quickActions.common.createPlaceLabel", "Sukurti vietą"))}
          </button>
        ` : ""}
      </div>
    `;
  }

  renderReceiptImageField(action, values = {}) {
    if (action !== "receipt-scanner") {
      return "";
    }

    const safeValues = this.normalizeDraftValues(values);
    const imageName =
      safeValues.receiptImageName || this.pendingScannerFile?.name || "";
    const hasPreview = Boolean(this.pendingScannerPreviewUrl);
    const hasImage = this.hasScannerImage(safeValues);

    const scanLabel = hasImage
      ? escapeHtml(this.copy.common.receiptImageChangeLabel)
      : escapeHtml(this.t("quickActions.receiptScanner.scanButton", "📷 Nuskaityti čekį"));

    return `
      <div class="quick-action-form__field" data-receipt-image-field>

        <label class="quick-action-form__primary" style="display:flex; align-items:center; justify-content:center; gap:8px; cursor:pointer; width:100%; text-align:center;">
          ${scanLabel}
          <input
            type="file"
            name="receiptImage"
            accept="image/*"
            capture="environment"
            data-receipt-image-input
            hidden
          >
        </label>

        <input
          type="hidden"
          name="receiptImageName"
          value="${escapeHtml(imageName)}"
          data-receipt-image-name-input
        >

        <p class="quick-action-form__helper">
          ${
            imageName
              ? `${escapeHtml(this.copy.common.receiptImageSelectedPrefix)}: ${escapeHtml(imageName)}`
              : escapeHtml(this.copy.common.receiptImagePlaceholder)
          }
        </p>

        ${
          hasPreview
            ? `
          <div class="quick-action-sheet__summary" style="margin-top:0.75rem;">
            <img
              src="${escapeHtml(this.pendingScannerPreviewUrl)}"
              alt="${escapeHtml(
                imageName || this.copy.common.receiptImageLabel
              )}"
              style="display:block; width:100%; max-height:220px; object-fit:cover; border-radius:16px;"
            >
          </div>
        `
            : ""
        }

        <p class="quick-action-form__helper">
          ${escapeHtml(this.copy.common.receiptImageHelp)}
        </p>

        ${
          imageName
            ? `
          <div class="quick-action-form__actions" style="justify-content:flex-start;">
            <button
              type="button"
              class="quick-action-form__secondary"
              data-remove-receipt-image
            >
              ${escapeHtml(this.copy.common.receiptImageRemoveLabel)}
            </button>
          </div>
        `
            : ""
        }
      </div>
    `;
  }

  renderCreateCategoryButton() {
    return `
      <button
        type="button"
        class="quick-action-form__secondary"
        data-create-category-inline
      >
        ${escapeHtml(this.t("quickActions.category.createInline", "Sukurti kategoriją"))}
      </button>
    `;
  }

  renderCategoryField(action, values = {}, fieldError = "") {
    const safeValues = this.normalizeDraftValues(values);
    const selected = safeValues.categoryId || safeValues.category || "";
    const hasCategories = this.getCategoryList(action).length > 0;

    return `
      <div class="quick-action-form__field">
        <span class="quick-action-form__label">${escapeHtml(
          this.copy.common.category
        )}</span>
        <div class="quick-actions-categories" data-category-options>
          ${this.renderCategories(action, selected)}
        </div>

        <input
          type="hidden"
          name="categoryId"
          value="${escapeHtml(selected || "")}"
        >
        ${fieldError ? `<p class="quick-action-form__error">${escapeHtml(fieldError)}</p>` : ""}
        ${!hasCategories || fieldError ? this.renderCreateCategoryButton() : ""}
      </div>
    `;
  }

  renderFormFields(action, values = {}, errors = {}) {
    // Receipt scanner has its own simplified flow
    if (action === "receipt-scanner") {
      return this.renderScannerStep(values, errors);
    }

    const safeValues = this.normalizeDraftValues(values);
    const actionCopy = this.getActionCopy(action);

    return `
      <div class="quick-action-form__section">
        <p class="quick-action-guidance__text">${escapeHtml(actionCopy.intro)}</p>
      </div>

      ${this.renderCategoryField(action, safeValues, errors.category || "")}

      <label class="quick-action-form__field">
        <span class="quick-action-form__label">${escapeHtml(this.copy.common.amount)}</span>
        <input
          class="quick-action-form__input"
          type="number"
          step="0.01"
          min="0"
          name="amount"
          value="${escapeHtml(safeValues.amount || "")}"
        >
        ${errors.amount ? `<p class="quick-action-form__error">${escapeHtml(errors.amount)}</p>` : ""}
      </label>

      <label class="quick-action-form__field">
        <span class="quick-action-form__label">${escapeHtml(this.copy.common.date)}</span>
        <input
          class="quick-action-form__input"
          type="date"
          name="date"
          value="${escapeHtml(safeValues.date || this.getTodayDateValue())}"
        >
        ${errors.date ? `<p class="quick-action-form__error">${escapeHtml(errors.date)}</p>` : ""}
      </label>

      <label class="quick-action-form__field">
        <span class="quick-action-form__label">${escapeHtml(this.copy.common.note)}</span>
        <textarea
          class="quick-action-form__input"
          name="note"
          rows="3"
          placeholder="${escapeHtml(this.copy.common.notePlaceholder)}"
        >${escapeHtml(safeValues.note || "")}</textarea>
      </label>

      ${this.renderPlaceField(action, safeValues)}
    `;
  }

  renderScannerStep(values = {}, errors = {}) {
    const step = this.scannerStep || "scan";

    if (step === "scan") {
      return this.renderScannerScanStep();
    }

    if (step === "scanning") {
      return this.renderScannerScanningStep();
    }

    if (step === "preview") {
      return this.renderScannerPreviewStep();
    }

    if (step === "edit") {
      return this.renderScannerEditStep(values, errors);
    }

    return this.renderScannerScanStep();
  }

  renderScannerScanStep() {
    return `
      <div class="quick-action-form__field" style="text-align:center; padding:1.5rem 0;">
        <p class="quick-action-guidance__text" style="margin-bottom:1.5rem;">
          ${escapeHtml(this.t("quickActions.receiptScanner.scanHint", "Nufotografuokite čekį ir sistema automatiškai užpildys informaciją."))}
        </p>
        <label class="quick-action-form__primary" style="display:flex; align-items:center; justify-content:center; gap:8px; cursor:pointer; width:100%; margin-bottom:0.75rem;">
          📷 ${escapeHtml(this.t("quickActions.receiptScanner.scanButton", "Fotografuoti čekį"))}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            data-receipt-image-input
            hidden
          >
        </label>
        <label class="quick-action-form__secondary" style="display:flex; align-items:center; justify-content:center; gap:8px; cursor:pointer; width:100%;">
          🖼️ ${escapeHtml(this.t("quickActions.receiptScanner.galleryButton", "Pasirinkti iš galerijos"))}
          <input
            type="file"
            accept="image/*"
            data-receipt-image-input
            hidden
          >
        </label>
      </div>
    `;
  }

  renderScannerScanningStep() {
    return `
      <div class="quick-action-form__field" style="text-align:center; padding:2rem 0;">
        <p class="quick-action-guidance__text" style="font-size:2rem; margin-bottom:1rem;">⏳</p>
        <p class="quick-action-guidance__text">
          ${escapeHtml(this.t("quickActions.receiptScanner.scanning", "Nuskaitoma, palaukite..."))}
        </p>
      </div>
    `;
  }

  renderScannerPreviewStep() {
    const r = this.scannerOcrResult || {};
    const amount  = r.amount  ? `${r.amount} €` : this.t("quickActions.receiptScanner.notDetected", "Nerasta");
    const date    = r.date    || this.t("quickActions.receiptScanner.notDetected", "Nerasta");
    const store   = r.store   || this.t("quickActions.receiptScanner.notDetected", "Nerasta");

    return `
      <div class="quick-action-form__field">
        <p class="quick-action-guidance__text" style="margin-bottom:1rem;">
          ${escapeHtml(this.t("quickActions.receiptScanner.previewHint", "Patikrinkite nuskaitytą informaciją."))}
        </p>

        <div class="quick-action-sheet__summary" style="margin-bottom:1rem;">
          <div style="display:flex; flex-direction:column; gap:0.5rem; padding:0.75rem 0;">
            <div style="display:flex; justify-content:space-between;">
              <span class="quick-action-form__label">${escapeHtml(this.t("quickActions.common.amountLabel", "Suma"))}</span>
              <strong>${escapeHtml(amount)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span class="quick-action-form__label">${escapeHtml(this.t("quickActions.common.dateLabel", "Data"))}</span>
              <strong>${escapeHtml(date)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span class="quick-action-form__label">${escapeHtml(this.t("places.types.store", "Parduotuvė"))}</span>
              <strong>${escapeHtml(store)}</strong>
            </div>
          </div>
        </div>

        ${this.pendingScannerPreviewUrl ? `
          <img
            src="${escapeHtml(this.pendingScannerPreviewUrl)}"
            style="display:block; width:100%; max-height:180px; object-fit:cover; border-radius:12px; margin-bottom:1rem;"
          >
        ` : ""}

        <input type="hidden" name="amount"  value="${escapeHtml(r.amount  ? String(r.amount)  : "")}">
        <input type="hidden" name="date"    value="${escapeHtml(r.date    || this.getTodayDateValue())}">
        <input type="hidden" name="note"    value="${escapeHtml(r.store   ? r.store + " čekis" : "")}">
        <input type="hidden" name="categoryId" value="${escapeHtml(r.categoryId || "")}">
        <input type="hidden" name="placeId"    value="${escapeHtml(r.placeId    || "")}">
        <input type="hidden" name="placeName"  value="${escapeHtml(r.placeName  || r.store || "")}">
        <input type="hidden" name="receiptImageName" value="${escapeHtml(this.pendingScannerFile?.name || "")}">
      </div>
    `;
  }

  renderScannerEditStep(values = {}, errors = {}) {
    const safeValues = this.normalizeDraftValues(values);

    return `
      <div class="quick-action-form__field">
        ${this.pendingScannerPreviewUrl ? `
          <img
            src="${escapeHtml(this.pendingScannerPreviewUrl)}"
            style="display:block; width:100%; max-height:200px; object-fit:cover; border-radius:12px; margin-bottom:1rem;"
          >
        ` : ""}
        <p class="quick-action-guidance__text" style="margin-bottom:1rem;">
          ${escapeHtml(this.t("quickActions.receiptScanner.editHint", "Pataisykite informaciją ir išsaugokite."))}
        </p>
      </div>

      ${this.renderCategoryField("receipt-scanner", safeValues, errors.category || "")}

      <label class="quick-action-form__field">
        <span class="quick-action-form__label">${escapeHtml(this.copy.common.amount)}</span>
        <input
          class="quick-action-form__input"
          type="number"
          step="0.01"
          min="0"
          name="amount"
          value="${escapeHtml(safeValues.amount || "")}"
        >
        ${errors.amount ? `<p class="quick-action-form__error">${escapeHtml(errors.amount)}</p>` : ""}
      </label>

      <label class="quick-action-form__field">
        <span class="quick-action-form__label">${escapeHtml(this.copy.common.date)}</span>
        <input
          class="quick-action-form__input"
          type="date"
          name="date"
          value="${escapeHtml(safeValues.date || this.getTodayDateValue())}"
        >
        ${errors.date ? `<p class="quick-action-form__error">${escapeHtml(errors.date)}</p>` : ""}
      </label>

      <label class="quick-action-form__field">
        <span class="quick-action-form__label">${escapeHtml(this.copy.common.note)}</span>
        <textarea
          class="quick-action-form__input"
          name="note"
          rows="2"
          placeholder="${escapeHtml(this.copy.common.notePlaceholder)}"
        >${escapeHtml(safeValues.note || "")}</textarea>
      </label>

      ${this.renderPlaceField("receipt-scanner", safeValues)}

      <input type="hidden" name="receiptImageName" value="${escapeHtml(this.pendingScannerFile?.name || safeValues.receiptImageName || "")}">
    `;
  }

  renderActionSheet(action, options = {}) {
  const actionCopy = this.getActionCopy(action);
  const values = this.normalizeDraftValues(
    options.values || this.getDraftValues(action)
  );
  const errors = options.errors || {};

  return `
    <div
      class="quick-action-overlay"
      data-quick-action-overlay
      style="position:fixed; inset:0; z-index:9999;"
    >
      <div
        class="quick-action-overlay__backdrop"
        data-close-quick-action
        style="position:absolute; inset:0;"
      ></div>
      <div
        class="quick-action-overlay__center"
        style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; padding:24px;"
      ><div class="quick-action-overlay__center">
        <div
          class="quick-action-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="${escapeHtml(this.getActionLabel(action))}"
        >
          <div class="quick-action-sheet__header">
            <div>
              <p class="quick-action-note">${escapeHtml(this.copy.common.nextStep)}</p>
              <h3 class="quick-action-sheet__title">${escapeHtml(actionCopy.title)}</h3>
            </div>

            <button
              type="button"
              class="quick-action-sheet__close"
              data-close-quick-action
              aria-label="${escapeHtml(this.copy.common.close)}"
            >
              ×
            </button>
          </div>

          <form
            class="quick-action-form"
            data-quick-action-form
            data-action-type="${escapeHtml(action)}"
          >
            ${this.renderFormFields(action, values, errors)}

            <div class="quick-action-form__actions">
              <button
                type="button"
                class="quick-action-form__secondary"
                data-close-quick-action
              >
                ${escapeHtml(this.copy.common.cancel)}
              </button>

              ${action === "receipt-scanner" && this.scannerStep === "preview" ? `
                <button
                  type="button"
                  class="quick-action-form__secondary"
                  data-scanner-edit
                >
                  ✏️ ${escapeHtml(this.t("quickActions.receiptScanner.editButton", "Pataisyti"))}
                </button>
                <button
                  type="submit"
                  class="quick-action-form__primary"
                >
                  ${escapeHtml(this.t("quickActions.receiptScanner.saveButton", "Išsaugoti"))}
                </button>
              ` : action === "receipt-scanner" && this.scannerStep === "scan" ? `
                <!-- no submit button on scan step -->
              ` : action === "receipt-scanner" && this.scannerStep === "scanning" ? `
                <!-- no buttons while scanning -->
              ` : `
                <button
                  type="submit"
                  class="quick-action-form__primary"
                >
                  ${escapeHtml(actionCopy.submit || this.copy.common.save)}
                </button>
              `}
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
}

  async openAction(action, options = {}) {
    const allowed = ["expense", "income", "receipt", "receipt-scanner"];
    if (!allowed.includes(action)) {
      return;
    }

    // Reset scanner state on fresh open
    if (action === "receipt-scanner" && !options.restoreDraft) {
      this.scannerStep = "scan";
      this.scannerOcrResult = null;
      this.clearPendingScannerFile();
    }

    this.activeAction = action;
    this.setActionSelected(action);

    await this.ensureCategoriesLoaded();
    await this.ensurePlacesLoaded();

    const host = this.getOverlayHost();
    host.innerHTML = this.renderActionSheet(action, {
      values: options.restoreDraft
        ? this.getDraftValues(action)
        : this.getDraftValues(action),
      errors: {},
    });
  }

  closeAction(options = {}) {
    const { restoreFocus = true, keepDraft = false, silent = false } = options;

    if (!keepDraft && this.activeAction) {
      this.clearDraftValues(this.activeAction);
    }

    this.removeOverlayShell();

    if (!silent) {
      this.activeAction = null;
      this.clearActionSelection();
    }

    if (
      restoreFocus &&
      this.lastFocus &&
      typeof this.lastFocus.focus === "function"
    ) {
      this.lastFocus.focus();
    }
  }

  readFormPayload(form, action) {
    const formData = new FormData(form);
    const amount = this.normalizeText(formData.get("amount"));
    const date =
      this.normalizeText(formData.get("date")) || this.getTodayDateValue();
    const note = this.normalizeText(formData.get("note"));
    const categoryId = this.normalizeOptionalId(
      formData.get("categoryId") || formData.get("category")
    );
    const placeId = this.normalizeOptionalId(formData.get("placeId"));
    const placeName = this.normalizeText(formData.get("placeName"));
    const receiptImageName = this.normalizeText(formData.get("receiptImageName"));

    const selectedCategory = this.availableCategories.find((category) => {
      return this.normalizeOptionalId(category?.id) === categoryId;
    });

    // For scanner preview step - enrich with OCR result if category missing
    let finalCategoryId = categoryId;
    let finalCategory = this.normalizeText(selectedCategory?.name);
    if (action === "receipt-scanner" && this.scannerStep === "preview" && !finalCategoryId) {
      const r = this.scannerOcrResult || {};
      finalCategoryId = r.categoryId || null;
      finalCategory   = r.category   || "";
    }

    return {
      type: action === "receipt-scanner" ? "expense" : action,
      categoryId:        finalCategoryId,
      category:          finalCategory,
      amount,
      date,
      note,
      placeId:           placeId || (action === "receipt-scanner" && this.scannerStep === "preview" ? (this.scannerOcrResult?.placeId || null) : null),
      placeName:         placeName || (action === "receipt-scanner" && this.scannerStep === "preview" ? (this.scannerOcrResult?.placeName || "") : ""),
      receiptImageName:  receiptImageName || this.pendingScannerFile?.name || "",
    };
  }

  validatePayload(action, payload) {
    const errors = {};

    // Scanner preview step - only validate amount and date
    if (action === "receipt-scanner" && this.scannerStep === "preview") {
      const amount = Number(payload.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        errors.amount = this.copy.common.invalidAmount;
      }
      if (!payload.date) {
        errors.date = this.copy.common.missingDate;
      }
      return errors;
    }

    // Scanner scan/scanning steps - nothing to validate yet
    if (action === "receipt-scanner" && (this.scannerStep === "scan" || this.scannerStep === "scanning")) {
      return errors;
    }

    if (!payload.categoryId) {
      errors.category = this.copy.common.missingCategory;
    }

    const amount = Number(payload.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.amount = this.copy.common.invalidAmount;
    }

    if (!payload.date) {
      errors.date = this.copy.common.missingDate;
    }

    return errors;
  }

  async handleSubmit(event) {
    const form = event.target.closest("[data-quick-action-form]");
    if (!form) {
      return;
    }

    event.preventDefault();

    const action = this.normalizeText(form.dataset.actionType);
    const payload = this.readFormPayload(form, action);
    this.setDraftValues(action, payload);

    const errors = this.validatePayload(action, payload);
    if (Object.keys(errors).length) {
      const host = this.getOverlayHost();
      host.innerHTML = this.renderActionSheet(action, {
        values: payload,
        errors,
      });
      return;
    }

    if (typeof this.submitHandler !== "function") {
      console.warn("[QuickActions] Submit handler is missing.");
      return;
    }

    this.isBusy = true;

    try {
      await this.submitHandler({
        ...payload,
        action,
      });

      this.clearDraftValues(action);
      this.closeAction();
    } catch (error) {
      console.warn("[QuickActions] Submit failed:", error);
      const host = this.getOverlayHost();
      host.innerHTML = this.renderActionSheet(action, {
        values: payload,
        errors: {
          form: this.copy.common.saveFailed,
        },
      });
    } finally {
      this.isBusy = false;
    }
  }

  handleClick(event) {
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      event.preventDefault();
      const action = this.normalizeText(actionButton.dataset.action);
      this.lastFocus = actionButton;
      this.openAction(action);
      return;
    }

    const closeButton = event.target.closest("[data-close-quick-action]");
    if (closeButton) {
      event.preventDefault();
      this.closeAction();
      return;
    }

    const createCategoryButton = event.target.closest("[data-create-category-inline]");
    if (createCategoryButton) {
      event.preventDefault();
      this.openCreateCategoryModal();
      return;
    }

    const inlineCategoryClose = event.target.closest("[data-inline-category-modal-close]");
    if (inlineCategoryClose) {
      event.preventDefault();
      this.closeCategoryModal();
      return;
    }

    const inlineCategoryBackdrop = event.target.matches("[data-inline-category-modal-backdrop]");
    if (inlineCategoryBackdrop) {
      event.preventDefault();
      this.closeCategoryModal();
      return;
    }

    const inlineCategorySave = event.target.closest("[data-inline-category-save]");
    if (inlineCategorySave) {
      event.preventDefault();
      this.handleInlineCategorySave();
      return;
    }

    const inlineCategoryType = event.target.closest("[data-inline-category-type]");
    if (inlineCategoryType) {
      event.preventDefault();
      const modal = document.querySelector("[data-inline-category-modal]");
      const input = modal?.querySelector("[data-inline-category-name]");
      if (input) this.categoryModalName = input.value;
      this.categoryModalType = inlineCategoryType.dataset.inlineCategoryType;
      this.renderCategoryModal();
      return;
    }

    const createPlaceButton = event.target.closest("[data-create-place-inline]");
    if (createPlaceButton) {
      event.preventDefault();
      this.openCreatePlaceModal();
      return;
    }

    const inlinePlaceClose = event.target.closest("[data-inline-place-modal-close]");
    if (inlinePlaceClose) {
      event.preventDefault();
      this.closePlaceModal();
      return;
    }

    const inlinePlaceBackdrop = event.target.matches("[data-inline-place-modal-backdrop]");
    if (inlinePlaceBackdrop) {
      event.preventDefault();
      this.closePlaceModal();
      return;
    }

    const inlinePlaceSave = event.target.closest("[data-inline-place-save]");
    if (inlinePlaceSave) {
      event.preventDefault();
      this.handleInlinePlaceSave();
      return;
    }

    const inlinePlaceType = event.target.closest("[data-inline-place-type]");
    if (inlinePlaceType) {
      event.preventDefault();
      const modal = document.querySelector("[data-inline-place-modal]");
      const input = modal?.querySelector("[data-inline-place-name]");
      if (input) this.placeModalName = input.value;
      this.placeModalType = inlinePlaceType.dataset.inlinePlaceType;
      this.renderPlaceModal();
      return;
    }

    const scannerEditButton = event.target.closest("[data-scanner-edit]");
    if (scannerEditButton) {
      event.preventDefault();
      // Pre-fill draft from OCR result before switching to edit step
      const r = this.scannerOcrResult || {};
      this.setDraftValues("receipt-scanner", {
        amount:     r.amount     || "",
        date:       r.date       || this.getTodayDateValue(),
        note:       r.note       || "",
        categoryId: r.categoryId || null,
        category:   r.category   || "",
        placeId:    r.placeId    || null,
        placeName:  r.placeName  || "",
      });
      this.scannerStep = "edit";
      this.rerenderActiveAction();
      return;
    }

    const categoryButton = event.target.closest("[data-category-option]");
    if (categoryButton && this.activeAction) {
      event.preventDefault();
      const categoryId = this.normalizeOptionalId(
        categoryButton.dataset.categoryValue
      );

      const selectedCategory = this.availableCategories.find((category) => {
        return this.normalizeOptionalId(category?.id) === categoryId;
      });

      const currentDraft = this.getDraftValues(this.activeAction);
      this.setDraftValues(this.activeAction, {
        ...currentDraft,
        categoryId,
        category: this.normalizeText(selectedCategory?.name),
      });

      this.rerenderActiveAction();
      return;
    }

    const removeReceiptImageButton = event.target.closest("[data-remove-receipt-image]");
    if (removeReceiptImageButton) {
      event.preventDefault();
      this.setPendingScannerFile(null);
      this.rerenderActiveAction();
    }
  }

  handleKeydown(event) {
    if (event.key === "Escape") {
      if (this.isPlaceModalOpen) {
        this.closePlaceModal();
      } else if (this.isCategoryModalOpen) {
        this.closeCategoryModal();
      } else if (this.activeAction) {
        this.closeAction();
      }
    }
  }

  async runScannerOCR(file) {
    // Show scanning step
    this.scannerStep = "scanning";
    this.rerenderActiveAction();

    try {
      const ocr = window.receiptOCR;

      const image = await ocr.prepareImage(file);
      const text  = await ocr.runOCR(image);

      const total = ocr.detectTotal(text);
      const store = ocr.detectStore(text);
      const date  = this.detectReceiptDate(text) || this.getTodayDateValue();

      // Try to match store to existing place
      let placeId   = null;
      let placeName = store || "";
      if (store) {
        const matched = this.availablePlaces.find((p) =>
          p.name.toUpperCase().includes(store.toUpperCase()) ||
          store.toUpperCase().includes(p.name.toUpperCase())
        );
        if (matched) {
          placeId   = matched.id;
          placeName = matched.name;
        }
      }

      // Try to auto-match category
      const shoppingCategory = this.availableCategories.find((c) =>
        ["shopping", "apsipirkimas", "maistas", "food", "parduotuve"].includes(
          this.normalizeText(c?.name).toLowerCase()
        ) && c?.type === "expense"
      );

      this.scannerOcrResult = {
        amount:     total ? String(total) : "",
        date,
        store:      store || "",
        note:       store ? `${store} čekis` : "",
        placeId,
        placeName,
        categoryId: shoppingCategory ? this.normalizeOptionalId(shoppingCategory.id) : null,
        category:   shoppingCategory ? this.normalizeText(shoppingCategory.name) : "",
      };

      this.scannerStep = "preview";
    } catch (err) {
      console.warn("[QuickActions] OCR failed:", err);
      // On error go straight to edit so user can fill manually
      this.scannerStep = "edit";
      this.scannerOcrResult = null;
    }

    this.rerenderActiveAction();
  }

  detectReceiptDate(text) {
    // Match common date formats: 2024-04-09, 09.04.2024, 09/04/2024
    const patterns = [
      /(\d{4}[-./]\d{2}[-./]\d{2})/,
      /(\d{2}[-./]\d{2}[-./]\d{4})/,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const raw = match[1].replace(/[./]/g, "-");
        const parts = raw.split("-");
        if (parts.length === 3) {
          // If year is last: dd-mm-yyyy → yyyy-mm-dd
          if (parts[2].length === 4) {
            return `${parts[2]}-${parts[1].padStart(2,"0")}-${parts[0].padStart(2,"0")}`;
          }
          // Already yyyy-mm-dd
          if (parts[0].length === 4) {
            return `${parts[0]}-${parts[1].padStart(2,"0")}-${parts[2].padStart(2,"0")}`;
          }
        }
      }
    }
    return null;
  }

  handleChange(event) {
    // Receipt image input - tikrinamas PRIEŠ formos patikrinimą,
    // nes scan žingsnyje input gali būti už formos ribų
    const receiptImageInput = event.target.closest("[data-receipt-image-input]");
    if (receiptImageInput) {
      const file = receiptImageInput.files?.[0] || null;
      this.setPendingScannerFile(file);

      if (!file) {
        this.rerenderActiveAction();
        return;
      }

      if (window.receiptOCR) {
        this.runScannerOCR(file);
      } else {
        console.warn("[QuickActions] receiptOCR not available, skipping OCR.");
        this.scannerStep = "edit";
        this.setDraftValues("receipt-scanner", {
          amount:     "",
          date:       this.getTodayDateValue(),
          note:       "",
          categoryId: null,
          category:   "",
          placeId:    null,
          placeName:  "",
        });
        this.rerenderActiveAction();
      }
      return;
    }

    const form = event.target.closest("[data-quick-action-form]");
    if (!form || !this.activeAction) {
      return;
    }

    const placeSelect = event.target.closest("[data-place-select]");
    if (placeSelect) {
      const placeId = this.normalizeOptionalId(placeSelect.value);
      const selectedPlace = this.availablePlaces.find((place) => {
        return this.normalizeOptionalId(place?.id) === placeId;
      });

      const currentDraft = this.getDraftValues(this.activeAction);
      this.setDraftValues(this.activeAction, {
        ...currentDraft,
        placeId,
        placeName: this.normalizeText(selectedPlace?.name),
      });

      this.rerenderActiveAction();
      return;
    }

    const payload = this.readFormPayload(form, this.activeAction);
    this.setDraftValues(this.activeAction, payload);
  }

  handleInput(event) {
    const form = event.target.closest("[data-quick-action-form]");
    if (!form || !this.activeAction) {
      return;
    }

    const payload = this.readFormPayload(form, this.activeAction);
    this.setDraftValues(this.activeAction, payload);
  }
}
