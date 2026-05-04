import { createTranslator, getCurrentLanguage } from "../core/i18n.js";
import { registry } from "../core/service.registry.js";
import { safeJsonParse } from "../core/safe-json.js";
import { safeSetItem } from "../core/safe-storage.js";
import { getCurrencySymbol, getUserCurrency } from "../services/finance/currency.js";

export function initAdvisorPage(dependencies = {}) {
  const transactionService =
    dependencies?.transactionService ||
    dependencies?.services?.transactionService ||
    null;

  function getTranslate() {
    return createTranslator(getCurrentLanguage());
  }

  function getTodayDateValue() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function getMonthStartDateValue() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}-01`;
  }

  return {
    async onBeforeEnter() {
      this.state = this.createInitialState();
      return true;
    },

    state: null,

    createInitialState() {
      return {
        dateFrom: getMonthStartDateValue(),
        dateTo: getTodayDateValue(),
        selectedType: "expense",
        selectedCategories: [],
        isCategoriesOpen: false,
        selectedPlaceId: "",
        baseAmountValue: "",
        percentageValue: "",
        vatValue: "",
        percentageAmount: 0,
        vatAmount: 0,
        calculatedAmount: 0,
        transactions: [],
        categories: [],
        places: [],
      };
    },

    ensureState() {
      if (!this.state) {
        this.state = this.createInitialState();
      }

      return this.state;
    },

    t(key, fallback, variables) {
      try {
        const translator = getTranslate();

        const hasObjectFallback =
          fallback && typeof fallback === "object" && !Array.isArray(fallback);

        const params = hasObjectFallback ? fallback : variables || {};
        const safeFallback = typeof fallback === "string" ? fallback : key;

        const value = translator(key, params);

        if (typeof value !== "string") {
          return safeFallback;
        }

        const normalized = value.trim();

        if (!normalized || normalized === key) {
          return safeFallback;
        }

        return normalized;
      } catch (_error) {
        return typeof fallback === "string" ? fallback : key;
      }
    },

    escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    },

    getCurrentLocale() {
      const language = String(getCurrentLanguage?.() || "en").toLowerCase();
      const localeMap = { lt: "lt-LT", en: "en-GB", pl: "pl-PL", de: "de-DE", es: "es-ES", fr: "fr-FR", it: "it-IT", ru: "ru-RU", uk: "uk-UA", no: "nb-NO", sv: "sv-SE", ja: "ja-JP", zh: "zh-CN", pt: "pt-BR" };
      return localeMap[language] || "en-GB";
    },

    normalizeText(value, fallback = "") {
      if (typeof value !== "string") {
        return fallback;
      }

      const normalized = value.trim();
      return normalized || fallback;
    },

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
    },

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

      return categoryMap[key] || this.normalizeText(category) || "—";
    },

    getCategoryIdentifier(category = {}) {
      return (
        this.normalizeText(category?.id) ||
        this.normalizeText(category?.categoryId) ||
        this.normalizeText(category?.key) ||
        this.normalizeText(category?.category) ||
        this.normalizeText(category?.name)
      );
    },

    getResolvedCategoryLabel(category = {}) {
      const customName = this.normalizeText(category?.name);
      if (customName) {
        return customName;
      }

      const legacyKey =
        this.normalizeText(category?.key) ||
        this.normalizeText(category?.category) ||
        this.normalizeText(category?.id);

      return this.getCategoryLabel(legacyKey);
    },

    getSortedCategories() {
      const state = this.ensureState();
      const categories = Array.isArray(state.categories) ? state.categories : [];

      return [...categories].sort((left, right) => {
        const leftLabel = this.getResolvedCategoryLabel(left).toLocaleLowerCase(
          this.getCurrentLocale()
        );
        const rightLabel = this.getResolvedCategoryLabel(
          right
        ).toLocaleLowerCase(this.getCurrentLocale());

        return leftLabel.localeCompare(rightLabel, this.getCurrentLocale());
      });
    },

    getSelectedCategoryNames() {
      const state = this.ensureState();
      const categoryIds = Array.isArray(state.selectedCategories)
        ? state.selectedCategories
        : [];
      const categories = Array.isArray(state.categories) ? state.categories : [];

      if (!categoryIds.length || !categories.length) {
        return [];
      }

      return categoryIds
        .map((selectedId) => {
          const match = categories.find(
            (category) =>
              this.getCategoryIdentifier(category) ===
              String(selectedId || "").trim()
          );

          if (!match) {
            return "";
          }

          return this.getResolvedCategoryLabel(match);
        })
        .filter(Boolean);
    },

    getSelectedCategoriesSummary() {
      const names = this.getSelectedCategoryNames();
      const count = names.length;

      if (!count) {
        return this.t(
          "advisor.workspace.filters.categoriesSummaryEmpty",
          "No categories selected"
        );
      }

      if (count === 1) {
        return this.t(
          "advisor.workspace.filters.categoriesSummarySingle",
          "Selected: {name}",
          { name: names[0] }
        );
      }

      return this.t(
        "advisor.workspace.filters.categoriesSummaryCount",
        "Selected {count} categories",
        { count }
      );
    },

    getSelectedCategoriesButtonText() {
      const state = this.ensureState();
      const count = Array.isArray(state.selectedCategories)
        ? state.selectedCategories.length
        : 0;

      if (!count) {
        return this.t(
          "advisor.workspace.filters.categoriesButton",
          "Choose categories"
        );
      }

      if (count === 1) {
        const [name] = this.getSelectedCategoryNames();
        return this.t(
          "advisor.workspace.filters.categoriesButtonSingle",
          "Category: {name}",
          { name: name || "1 selected" }
        );
      }

      return this.t(
        "advisor.workspace.filters.categoriesButtonCount",
        "Categories: {count}",
        { count }
      );
    },

    getSelectedCategoriesDetailText() {
      const names = this.getSelectedCategoryNames();

      if (!names.length) {
        return this.t(
          "advisor.workspace.result.categoriesDetailAll",
          "All categories are included."
        );
      }

      return this.t(
        "advisor.workspace.result.categoriesDetailSelected",
        "Selected categories: {categories}",
        { categories: names.join(", ") }
      );
    },

    getFilteredTransactionsSummary() {
      const filteredTransactions = this.getFilteredTransactions();
      const count = filteredTransactions.length;

      if (!count) {
        return this.t(
          "advisor.workspace.result.noTransactions",
          "No records match the selected filters."
        );
      }

      return this.t(
        "advisor.workspace.result.filteredTransactionsCount",
        "Included records: {count}",
        { count }
      );
    },

    hasManualBaseValue() {
      const state = this.ensureState();
      return String(state.baseAmountValue ?? "").trim() !== "";
    },

    getCalculationContextText() {
      const filteredTransactions = this.getFilteredTransactions();
      const count = filteredTransactions.length;
      const hasManualBase = this.hasManualBaseValue();
      const names = this.getSelectedCategoryNames();

      if (!count && hasManualBase) {
        return this.t(
          "advisor.workspace.calculator.summaryModeManual",
          "Using manually entered base"
        );
      }

      if (!count) {
        return this.t(
          "advisor.workspace.result.noTransactions",
          "No records match the selected filters."
        );
      }

      if (!names.length) {
        return this.t(
          "advisor.workspace.result.contextAll",
          "Calculated from {count} records across all categories",
          { count }
        );
      }

      return this.t(
        "advisor.workspace.result.contextSelected",
        "Calculated from {count} records in categories: {categories}",
        {
          count,
          categories: names.join(", "),
        }
      );
    },

    formatMoney(value) {
      const amount = Number(value);

      if (!Number.isFinite(amount)) {
        return "—";
      }

      try {
        return new Intl.NumberFormat(this.getCurrentLocale(), {
          style: "currency",
          currency: getUserCurrency(),
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(amount);
      } catch (_error) {
        return `${amount.toFixed(2)}${getCurrencySymbol(getUserCurrency())}`;
      }
    },

    parseNumericInput(value) {
      const normalized = String(value ?? "").replace(",", ".").trim();

      if (!normalized) {
        return 0;
      }

      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : 0;
    },

    isSelectedCategory(categoryId) {
      const state = this.ensureState();
      const id = String(categoryId || "").trim();

      if (!id) {
        return false;
      }

      return state.selectedCategories.includes(id);
    },

    toggleCategory(categoryId) {
      const state = this.ensureState();
      const id = String(categoryId || "").trim();

      if (!id) {
        return;
      }

      if (!Array.isArray(state.selectedCategories)) {
        state.selectedCategories = [];
      }

      if (state.selectedCategories.includes(id)) {
        state.selectedCategories = state.selectedCategories.filter(
          (selectedId) => selectedId !== id
        );
        return;
      }

      state.selectedCategories = [...state.selectedCategories, id];
    },

    toggleCategoriesDropdown() {
      const state = this.ensureState();
      state.isCategoriesOpen = !state.isCategoriesOpen;
      return state.isCategoriesOpen;
    },

    closeCategoriesDropdown() {
      const state = this.ensureState();
      state.isCategoriesOpen = false;
    },

    async loadTransactions() {
      const state = this.ensureState();

      try {
        if (transactionService?.getTransactions) {
          const response = await transactionService.getTransactions();

          if (Array.isArray(response)) {
            state.transactions = response;
          } else if (Array.isArray(response?.transactions)) {
            state.transactions = response.transactions;
          } else if (Array.isArray(response?.data)) {
            state.transactions = response.data;
          } else {
            state.transactions = [];
          }

          return state.transactions;
        }

        if (transactionService?.getAllTransactions) {
          const response = transactionService.getAllTransactions();
          state.transactions = Array.isArray(response) ? response : [];
          return state.transactions;
        }

        state.transactions = [];
        return state.transactions;
      } catch (error) {
        console.error("[AdvisorPage] Failed to load transactions:", error);
        state.transactions = [];
        return state.transactions;
      }
    },

    async loadCategories() {
      const state = this.ensureState();

      try {
        if (transactionService?.getCategories) {
          const response = await transactionService.getCategories();

          if (Array.isArray(response)) {
            state.categories = response;
          } else if (Array.isArray(response?.categories)) {
            state.categories = response.categories;
          } else if (Array.isArray(response?.data)) {
            state.categories = response.data;
          } else {
            state.categories = [];
          }

          return state.categories;
        }

        state.categories = [];
        return state.categories;
      } catch (error) {
        console.error("[AdvisorPage] Failed to load categories:", error);
        state.categories = [];
        return state.categories;
      }
    },

    async loadPlaces() {
      const state = this.ensureState();

      try {
        if (transactionService?.getPlaces) {
          const response = await transactionService.getPlaces();

          let rawPlaces = [];

          if (Array.isArray(response)) {
            rawPlaces = response;
          } else if (Array.isArray(response?.places)) {
            rawPlaces = response.places;
          } else if (Array.isArray(response?.data)) {
            rawPlaces = response.data;
          }

          state.places = rawPlaces
            .filter((place) => place && typeof place === "object")
            .map((place) => {
              const id = String(place?.id || place?.placeId || "").trim();
              const name = this.normalizeText(
                place?.name ||
                  place?.title ||
                  place?.merchantName ||
                  place?.stationName ||
                  place?.storeName
              );
              const purpose = this.normalizeText(
                place?.purpose || place?.meta?.purpose || "expense",
                "expense"
              ).toLowerCase();

              return {
                ...place,
                id,
                name,
                purpose: purpose === "income" ? "income" : "expense",
              };
            })
            .filter((place) => place.id || place.name);

          return state.places;
        }

        state.places = [];
        return state.places;
      } catch (error) {
        console.error("[AdvisorPage] Failed to load places:", error);
        state.places = [];
        return state.places;
      }
    },

    getFilteredTransactions() {
      const state = this.ensureState();
      const transactions = Array.isArray(state.transactions)
        ? state.transactions
        : [];

      return transactions.filter((transaction) => {
        const type = String(transaction?.type || "").trim().toLowerCase();
        const financialDate = String(
          transaction?.financialDate || transaction?.date || ""
        ).trim();

        if (
          state.selectedType !== "both" &&
          type !== String(state.selectedType || "").trim().toLowerCase()
        ) {
          return false;
        }

        if (state.dateFrom && financialDate && financialDate < state.dateFrom) {
          return false;
        }

        if (state.dateTo && financialDate && financialDate > state.dateTo) {
          return false;
        }

        if (state.selectedPlaceId) {
          const transactionPlaceId = String(
            transaction?.placeId || transaction?.meta?.placeId || ""
          ).trim();

          if (transactionPlaceId !== state.selectedPlaceId) {
            return false;
          }
        }

        if (
          Array.isArray(state.selectedCategories) &&
          state.selectedCategories.length > 0
        ) {
          const categories = Array.isArray(state.categories) ? state.categories : [];

          // Visi galimi transakcijos kategorijos identifikatoriai
          const txCategoryId = String(
            transaction?.categoryId ||
            transaction?.meta?.categoryId ||
            ""
          ).trim();
          const txCategoryName = this.normalizeText(
            transaction?.category || ""
          ).toLowerCase();

          // Patikrinti ar pasirinkta kategorija sutampa su transakcija
          const matches = state.selectedCategories.some((selectedId) => {
            // 1. Tiesioginis ID sutapimas
            if (txCategoryId && txCategoryId === selectedId) {
              return true;
            }

            // 2. Legacy category laukas
            if (txCategoryName && txCategoryName === String(selectedId || "").trim().toLowerCase()) {
              return true;
            }

           // 3. Rasti pasirinktą kategoriją ir palyginti jos ID / pavadinimą
           const selectedCat = categories.find(
             (c) => this.getCategoryIdentifier(c) === selectedId
           );

           if (selectedCat) {
             const catId = String(selectedCat?.id || selectedCat?.categoryId || "").trim();
             const catName = this.normalizeText(selectedCat?.name).toLowerCase();

             if (catId && catId === txCategoryId) {
               return true;
             }
         
             if (catName && catName === txCategoryName) {
               return true;
             }
           }

           return false;
         });

         if (!matches) {
           return false;
         }
        }

        return true;
      });
    },

    recalculateResult() {
      const state = this.ensureState();
      const transactions = this.getFilteredTransactions();

      const selectedType = String(state.selectedType || "expense")
        .trim()
        .toLowerCase();

      const transactionsBase = transactions.reduce((sum, transaction) => {
        const amount = Math.abs(Number(transaction?.amount || 0));
        const type = String(transaction?.type || "").trim().toLowerCase();

        if (!Number.isFinite(amount)) {
          return sum;
        }

        if (selectedType === "income" && type !== "income") {
          return sum;
        }

        if (selectedType === "expense" && type !== "expense") {
         return sum;
        }

        return sum + amount;
      }, 0);

      const hasManualBase = this.hasManualBaseValue();
      const manualBase = this.parseNumericInput(state.baseAmountValue);
      const baseAmount = hasManualBase ? manualBase : transactionsBase;

      const percentage = this.parseNumericInput(state.percentageValue);
      const vat = this.parseNumericInput(state.vatValue);

      const percentageAmount = baseAmount * (percentage / 100);
      const vatAmount = baseAmount * (vat / 100);
      const total = baseAmount + percentageAmount + vatAmount;

      state.percentageAmount = percentageAmount;
      state.vatAmount = vatAmount;
      state.calculatedAmount = total;

      return {
        baseAmount,
        percentage,
        vat,
        percentageAmount,
        vatAmount,
        total,
        filteredTransactionsCount: transactions.length,
        hasFilteredTransactions: transactions.length > 0,
        hasManualBase,
      };
    },

    getTodayDate() {
      return getTodayDateValue();
    },

    getMonthStartDate() {
      return getMonthStartDateValue();
    },

    buildCopy() {
      const incomeLabel = this.t("home.transactions.income", "Income");
      const expenseLabel = this.t("home.transactions.expense", "Expense");

      return {
        topActions: {
          backLabel: this.t("advisor.topActions.backLabel", "Back"),
          backAria: this.t("advisor.topActions.backAria", "Go back"),
          languageLabel: this.t("advisor.topActions.languageLabel", "Language"),
          languageAria: this.t(
            "advisor.topActions.languageAria",
            "Open language selection"
          ),
        },

        page: {
          eyebrow: this.t(
            "advisor.workspace.eyebrow",
            "Financial calculations"
          ),
          title: this.t(
            "advisor.workspace.title",
            "Skaičiuokite, peržiūrėkite ir valdykite savo pajamas ir išlaidas."
          ),
          text: "",
        },

        filters: {
          title: this.t("advisor.workspace.filters.title", "Data selection"),
          text: this.t(
            "advisor.workspace.filters.text",
            "Choose what should be included in the calculation from your existing records."
          ),
          dateLabel: this.t(
            "advisor.workspace.filters.dateRangeLabel",
            "Date range"
          ),
          dateFromLabel: this.t(
            "advisor.workspace.filters.dateFromLabel",
            "From"
          ),
          dateToLabel: this.t(
            "advisor.workspace.filters.dateToLabel",
            "To"
          ),
          typeLabel: this.t("advisor.workspace.filters.typeLabel", "Type"),
          categoriesLabel: this.t(
            "advisor.workspace.filters.categoriesLabel",
            "Categories"
          ),
          categoriesSummaryEmpty: this.t(
            "advisor.workspace.filters.categoriesSummaryEmpty",
            "No categories selected"
          ),
          categoriesButton: this.t(
            "advisor.workspace.filters.categoriesButton",
            "Choose categories"
          ),
          categoriesOpenLabel: this.t(
            "advisor.workspace.filters.categoriesOpenLabel",
            "Show category choices"
          ),
          categoriesCloseLabel: this.t(
            "advisor.workspace.filters.categoriesCloseLabel",
            "Hide category choices"
          ),
          categoriesPanelHint: this.t(
            "advisor.workspace.filters.categoriesPanelHint",
            "Choose one or more categories created by the user."
          ),
          categoriesEmptyList: this.t(
            "advisor.workspace.filters.categoriesEmptyList",
            "No user categories found yet."
          ),
          placesLabel: this.t("advisor.workspace.filters.placesLabel", "Places"),
          placesAllLabel: this.t(
            "advisor.workspace.filters.placesAllLabel",
            "All places"
          ),
          placeValue: this.t(
            "advisor.workspace.filters.placesValue",
            "Optional filtering by places such as stores, transport, or bank."
          ),
          typeOptions: [
            { key: "income", label: incomeLabel },
            { key: "expense", label: expenseLabel },
          ],
        },

        calculator: {
          title: this.t(
            "advisor.workspace.calculator.title",
            "Calculation tool"
          ),
          text: this.t(
            "advisor.workspace.calculator.text",
            "The user should be able to apply a percentage or VAT manually and see a clear result based on selected BeSafe data."
          ),
          baseLabel: this.t(
            "advisor.workspace.calculator.baseLabel",
            "Base amount"
          ),
          percentageLabel: this.t(
            "advisor.workspace.calculator.percentageLabel",
            "Percentage"
          ),
          vatLabel: this.t("advisor.workspace.calculator.vatLabel", "VAT"),
          resultLabel: this.t(
            "advisor.workspace.calculator.resultLabel",
            "Result"
          ),
          inputHint: this.t(
            "advisor.workspace.calculator.inputValue",
            "Percentage and VAT fields will be entered manually."
          ),
          resultValue: this.t(
            "advisor.workspace.calculator.resultValue",
            "The result area should clearly show what was calculated from the selected data."
          ),
          resultContextLabel: this.t(
            "advisor.workspace.calculator.resultContextLabel",
            "Calculation context"
          ),
          noDataLabel: this.t(
            "advisor.workspace.calculator.noDataLabel",
            "No matching data"
          ),
          noDataText: this.t(
             "advisor.workspace.calculator.noDataText",
             "No records found for the selected type and filters. Try switching between Income and Expenses or adjust your filters."
          ),
          summaryBase: this.t(
            "advisor.workspace.calculator.summaryBase",
            "Base"
          ),
          summaryPercentage: this.t(
            "advisor.workspace.calculator.summaryPercentage",
            "Percentage amount"
          ),
          summaryVat: this.t(
            "advisor.workspace.calculator.summaryVat",
            "VAT amount"
          ),
          summaryTotal: this.t(
            "advisor.workspace.calculator.summaryTotal",
            "Total"
          ),
        },

        result: {
          title: this.t("advisor.workspace.result.title", "Result actions"),
          text: this.t(
            "advisor.workspace.result.text",
            "After calculation, the result should be easy to keep, remove, or export."
          ),
          items: [
            this.t("advisor.workspace.result.item1", "Save result"),
            this.t("advisor.workspace.result.item2", "Delete result"),
            this.t("advisor.workspace.result.item3", "Download result"),
          ],
        },
      };
    },

    renderTopActions(copy) {
      return `
        <div class="page-top-actions">
          <button
            type="button"
            class="shortcut-btn button-secondary"
            data-nav-back="home"
            aria-label="${this.escapeHtml(copy.topActions.backAria)}"
          >
            ${this.escapeHtml(copy.topActions.backLabel)}
          </button>

          <button
            type="button"
            class="shortcut-btn button-secondary"
            data-open-language
            aria-label="${this.escapeHtml(copy.topActions.languageAria)}"
          >
            ${this.escapeHtml(copy.topActions.languageLabel)}
          </button>
        </div>
      `;
    },

    renderPageIntro(copy) {
      return `
        <div class="module-placeholder__item advisor-workspace-section">
          <p class="module-placeholder__eyebrow">
            ${this.escapeHtml(copy.page.eyebrow)}
          </p>

          <h2 class="module-placeholder__title">
            ${this.escapeHtml(copy.page.title)}
          </h2>

          ${copy.page.text ? `<p class="module-placeholder__text">${this.escapeHtml(copy.page.text)}</p>` : ""}
        </div>
      `;
    },

    renderCategoryDropdownPanel(copy) {
      const state = this.ensureState();
      const categories = this.getSortedCategories();

      // Filtruojame kategorijas pagal pasirinktą tipą
      const type = String(state.selectedType || "expense").toLowerCase();
      const filtered = type === "both"
        ? categories
        : categories.filter(c => String(c?.type || "").toLowerCase() === type);

      if (!filtered.length) {
        return `
          <span style="font-size:13px; color:var(--muted);">
            ${this.escapeHtml(copy.filters.categoriesEmptyList)}
          </span>
        `;
      }

      return `
        <div class="advisor-workspace-chip-row" style="flex-wrap:wrap; gap:8px;">
          ${filtered
            .map((category) => {
              const categoryId = this.getCategoryIdentifier(category);
              const label = this.getResolvedCategoryLabel(category);
              const isSelected = this.isSelectedCategory(categoryId);

              return `
                <button
                  type="button"
                  class="shortcut-btn ${isSelected ? "button-primary" : "button-secondary"}"
                  data-advisor-category-id="${this.escapeHtml(categoryId)}"
                  aria-pressed="${isSelected ? "true" : "false"}"
                >
                  ${this.escapeHtml(label)}
                </button>
              `;
            })
            .join("")}
        </div>
      `;
    },

    renderPlacesOptions(copy) {
      const state = this.ensureState();
      const allPlaces = Array.isArray(state.places) ? state.places : [];
      const selectedType = this.normalizeText(state.selectedType, "both").toLowerCase();

      const places = allPlaces.filter((place) => {
        const purpose = this.normalizeText(place?.purpose, "expense").toLowerCase();

        if (selectedType === "both") {
          return true;
        }

        return purpose === selectedType;
      });

      let defaultLabel = copy.filters.placesAllLabel || "All places";

      if (selectedType === "income") {
        defaultLabel = this.t(
          "advisor.workspace.filters.incomePlacesAllLabel",
          "All income places"
        );
      } else if (selectedType === "expense") {
        defaultLabel = this.t(
          "advisor.workspace.filters.expensePlacesAllLabel",
          "All expense places"
        );
      }

      if (!places.length) {
        if (selectedType === "income") {
          defaultLabel = this.t(
            "advisor.workspace.filters.incomePlacesEmptyLabel",
            "No income places yet"
          );
        } else if (selectedType === "expense") {
          defaultLabel = this.t(
            "advisor.workspace.filters.expensePlacesEmptyLabel",
            "No expense places yet"
          );
        } else {
          defaultLabel = this.t(
            "advisor.workspace.filters.placesEmptyLabel",
            "No places yet"
          );
        }
      }

      const defaultOption = `
        <option value="">
          ${this.escapeHtml(defaultLabel)}
        </option>
      `;

      const dynamicOptions = places
        .map((place) => {
          const placeId = String(place?.id || "").trim();
          const placeName =
            this.normalizeText(place?.name) ||
            this.normalizeText(place?.title) ||
            "—";

          return `
            <option
              value="${this.escapeHtml(placeId)}"
              ${state.selectedPlaceId === placeId ? "selected" : ""}
            >
              ${this.escapeHtml(placeName)}
            </option>
          `;
        })
        .join("");

      return `${defaultOption}${dynamicOptions}`;
    },

    renderSelectionPanel(copy) {
      const state = this.ensureState();

      return `
        <div class="module-placeholder__item advisor-workspace-section">
          <strong>${this.escapeHtml(copy.filters.title)}</strong>
          <span>${this.escapeHtml(copy.filters.text)}</span>

          <div class="module-placeholder__list">

            <!-- 1. TIPAS — pirmas pasirinkimas -->
            <div class="module-placeholder__item advisor-workspace-subitem">
              <strong>${this.escapeHtml(copy.filters.typeLabel)}</strong>
              <div class="advisor-workspace-chip-row">
                ${copy.filters.typeOptions
                  .map(
                    (item) => `
                      <button
                        type="button"
                        class="shortcut-btn ${
                          state.selectedType === item.key
                            ? "button-primary"
                            : "button-secondary"
                        }"
                        data-advisor-type="${this.escapeHtml(item.key)}"
                      >
                        ${this.escapeHtml(item.label)}
                      </button>
                    `
                  )
                  .join("")}
              </div>
            </div>

            <!-- 2. KATEGORIJA — greitasis filtras -->
            <div class="module-placeholder__item advisor-workspace-subitem">
              <strong>${this.escapeHtml(copy.filters.categoriesLabel)}</strong>
              <div data-advisor-categories-panel>
                ${this.renderCategoryDropdownPanel(copy)}
              </div>
              <span data-advisor-categories-summary style="font-size:13px; color:var(--muted);">
                ${this.escapeHtml(this.getSelectedCategoriesSummary())}
              </span>
            </div>

            <!-- 3. DATA — po tipo ir kategorijos -->
            <div class="module-placeholder__item advisor-workspace-subitem">
              <strong>${this.escapeHtml(copy.filters.dateLabel)}</strong>

              <div class="advisor-workspace-form-grid advisor-date-range">
                <label class="advisor-workspace-field advisor-date-field advisor-date-from">
                  <span class="advisor-date-field__label">
                    ${this.escapeHtml(copy.filters.dateFromLabel)}
                  </span>
                  <input
                    type="date"
                    value="${this.escapeHtml(state.dateFrom)}"
                    data-advisor-date-from
                  />
                </label>

                <label class="advisor-workspace-field advisor-date-field advisor-date-to">
                  <span class="advisor-date-field__label">
                    ${this.escapeHtml(copy.filters.dateToLabel)}
                  </span>
                  <input
                    type="date"
                    value="${this.escapeHtml(state.dateTo)}"
                    data-advisor-date-to
                  />
                </label>
              </div>
            </div>

          </div>
        </div>
      `;
    },

    renderCalculatorPanel(copy) {
      const state = this.ensureState();
      const result = this.recalculateResult();
      const showNoData =
        !result.hasFilteredTransactions && !result.hasManualBase;

      return `
        <div class="module-placeholder__item advisor-workspace-section">
          <strong>${this.escapeHtml(copy.calculator.title)}</strong>
          <span>${this.escapeHtml(copy.calculator.text)}</span>

          <div class="module-placeholder__list">

            <!-- Kompaktiškas trijų laukų tinklelis -->
            <div class="module-placeholder__item advisor-workspace-subitem">
              <div class="advisor-calculator-grid">

                <div style="display:flex; flex-direction:column; gap:6px;">
                  <strong style="font-size:12px;">${this.escapeHtml(copy.calculator.baseLabel)}</strong>
                  <input
                    type="number"
                    inputmode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    value="${this.escapeHtml(state.baseAmountValue)}"
                    data-advisor-base-input
                    style="width:100%; min-height:48px; padding:0 12px; border-radius:12px; border:1px solid rgba(114,176,152,0.22); background:rgba(15,23,25,0.98); color:var(--text); font-size:15px;"
                  />
                </div>

                <div style="display:flex; flex-direction:column; gap:6px;">
                  <strong style="font-size:12px;">${this.escapeHtml(copy.calculator.percentageLabel)} %</strong>
                  <input
                    type="number"
                    inputmode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    value="${this.escapeHtml(state.percentageValue)}"
                    data-advisor-percentage-input
                    style="width:100%; min-height:48px; padding:0 12px; border-radius:12px; border:1px solid rgba(114,176,152,0.22); background:rgba(15,23,25,0.98); color:var(--text); font-size:15px;"
                  />
                </div>

                <div style="display:flex; flex-direction:column; gap:6px;">
                  <strong style="font-size:12px;">${this.escapeHtml(copy.calculator.vatLabel)} %</strong>
                  <input
                    type="number"
                    inputmode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    value="${this.escapeHtml(state.vatValue)}"
                    data-advisor-vat-input
                    style="width:100%; min-height:48px; padding:0 12px; border-radius:12px; border:1px solid rgba(114,176,152,0.22); background:rgba(15,23,25,0.98); color:var(--text); font-size:15px;"
                  />
                </div>

              </div>
            </div>

            <!-- Rezultatas kompaktiškai -->
            <div class="module-placeholder__item advisor-workspace-subitem" style="padding:16px;">

              ${showNoData ? `
                <span style="font-size:13px; color:var(--muted);" data-advisor-no-data-message>
                  ${this.escapeHtml(copy.calculator.noDataText)}
                </span>
              ` : ""}

              <!-- Galutinė suma — ryški -->
              <div style="display:flex; align-items:baseline; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
                <strong style="font-size:13px; color:var(--muted);">${this.escapeHtml(copy.calculator.summaryTotal)}</strong>
                <strong style="font-size:28px; letter-spacing:-0.02em; color:#9ae6c1;" data-advisor-result-amount data-advisor-summary-total>
                  ${this.escapeHtml(this.formatMoney(result.total))}
                </strong>
              </div>

              <!-- Suvestinė eilutėmis -->
              <div style="display:flex; flex-direction:column; gap:6px; border-top:1px solid rgba(110,148,136,0.14); padding-top:10px;">

                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                  <span style="font-size:13px; color:var(--muted);">${this.escapeHtml(copy.calculator.summaryBase)}</span>
                  <span style="font-size:13px; font-weight:700;" data-advisor-summary-base>${this.escapeHtml(this.formatMoney(result.baseAmount))}</span>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                  <span style="font-size:13px; color:var(--muted);">${this.escapeHtml(copy.calculator.summaryPercentage)}</span>
                  <span style="font-size:13px; font-weight:700;" data-advisor-summary-percentage>${this.escapeHtml(this.formatMoney(result.percentageAmount))}</span>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                  <span style="font-size:13px; color:var(--muted);">${this.escapeHtml(copy.calculator.summaryVat)}</span>
                  <span style="font-size:13px; font-weight:700;" data-advisor-summary-vat>${this.escapeHtml(this.formatMoney(result.vatAmount))}</span>
                </div>

              </div>

              <!-- Kontekstas -->
              <div style="margin-top:10px; padding-top:10px; border-top:1px solid rgba(110,148,136,0.10);">
                <span style="font-size:12px; color:var(--muted);" data-advisor-calculation-context>
                  ${this.escapeHtml(this.getCalculationContextText())}
                </span>
                <span style="font-size:12px; color:var(--muted); display:block; margin-top:2px;" data-advisor-selected-categories-detail>
                  ${this.escapeHtml(this.getSelectedCategoriesDetailText())}
                </span>
              </div>

            </div>

          </div>
        </div>
      `;
    },

    renderResultPanel(copy) {
      return `
        <div class="module-placeholder__item advisor-workspace-section">
          <strong>${this.escapeHtml(copy.result.title)}</strong>
          <span>${this.escapeHtml(copy.result.text)}</span>

          <div class="advisor-workspace-chip-row">
            ${copy.result.items
              .map(
                (item, index) => `
                  <button
                    type="button"
                    class="shortcut-btn ${
                      index === 0 ? "button-primary" : "button-secondary"
                    }"
                    ${index === 0 ? 'data-advisor-save-result' : ""}
                    ${index === 1 ? 'data-advisor-delete-result' : ""}
                    ${index === 2 ? 'data-advisor-download-result' : ""}
                  >
                    ${this.escapeHtml(item)}
                  </button>
                `
              )
              .join("")}
          </div>
        </div>
      `;
    },

    renderWorkspace(copy) {
      return `
        <section class="page-advisor">
          ${this.renderTopActions(copy)}

          <div class="module-placeholder advisor-placeholder">
            ${this.renderPageIntro(copy)}
            ${this.renderSelectionPanel(copy)}
            ${this.renderCalculatorPanel(copy)}
            ${this.renderResultPanel(copy)}
          </div>
        </section>
      `;
    },

    syncCategoryButtons(root) {
      if (!root) {
        return;
      }

      const state = this.ensureState();
      const toggleButton = root.querySelector("[data-advisor-toggle-categories]");
      const summaryNode = root.querySelector("[data-advisor-categories-summary]");
      const panelNode = root.querySelector("[data-advisor-categories-panel]");
      const copy = this.buildCopy();

      if (toggleButton) {
        toggleButton.classList.toggle("button-primary", state.isCategoriesOpen);
        toggleButton.classList.toggle(
          "button-secondary",
          !state.isCategoriesOpen
        );
        toggleButton.setAttribute(
          "aria-expanded",
          state.isCategoriesOpen ? "true" : "false"
        );
        toggleButton.setAttribute(
          "aria-label",
          this.escapeHtml(
            state.isCategoriesOpen
              ? copy.filters.categoriesCloseLabel
              : copy.filters.categoriesOpenLabel
          )
        );
        toggleButton.textContent = this.getSelectedCategoriesButtonText();
      }

      if (summaryNode) {
        const selectedCount = Array.isArray(state.selectedCategories) ? state.selectedCategories.length : 0;
        if (selectedCount > 0) {
          summaryNode.textContent = "";
          summaryNode.style.display = "none";
        } else {
          summaryNode.textContent = this.getSelectedCategoriesSummary();
          summaryNode.style.display = "";
        }
      }

      if (panelNode) {
        panelNode.innerHTML = this.renderCategoryDropdownPanel(copy);
      }
    },

    syncResult(root) {
      if (!root) {
        return;
      }

      const result = this.recalculateResult();
      const copy = this.buildCopy();
      const showNoData =
        !result.hasFilteredTransactions && !result.hasManualBase;

      const resultAmount = root.querySelector("[data-advisor-result-amount]");
      const contextNode = root.querySelector("[data-advisor-calculation-context]");
      const categoriesDetailNode = root.querySelector(
        "[data-advisor-selected-categories-detail]"
      );
      const noDataNode = root.querySelector("[data-advisor-no-data-message]");
      const noDataWrapper = noDataNode?.closest(
        ".advisor-workspace-subitem"
      );
      const summaryBase = root.querySelector("[data-advisor-summary-base]");
      const summaryPercentage = root.querySelector(
        "[data-advisor-summary-percentage]"
      );
      const summaryVat = root.querySelector("[data-advisor-summary-vat]");
      const summaryTotal = root.querySelector("[data-advisor-summary-total]");

      if (resultAmount) {
        resultAmount.textContent = this.formatMoney(result.total);
      }

      if (contextNode) {
        contextNode.textContent = this.getCalculationContextText();
      }

      if (categoriesDetailNode) {
        categoriesDetailNode.textContent = this.getSelectedCategoriesDetailText();
      }

      if (noDataNode) {
        noDataNode.textContent = copy.calculator.noDataText;
      }

      if (noDataNode) {
        noDataNode.classList.toggle("is-hidden", !showNoData);
      }

      if (summaryBase) {
        summaryBase.textContent = this.formatMoney(result.baseAmount);
      }

      if (summaryPercentage) {
        summaryPercentage.textContent = this.formatMoney(result.percentageAmount);
      }

      if (summaryVat) {
        summaryVat.textContent = this.formatMoney(result.vatAmount);
      }

      if (summaryTotal) {
        summaryTotal.textContent = this.formatMoney(result.total);
      }
    },

    syncUi(root) {
      if (!root) {
        return;
      }

      this.syncCategoryButtons(root);
      this.syncResult(root);

      const placeSelect = root.querySelector("[data-advisor-place-select]");
      if (placeSelect) {
        const copy = this.buildCopy();
        placeSelect.innerHTML = this.renderPlacesOptions(copy);
      }
    },

    refreshCategoriesUi(root) {
      this.syncCategoryButtons(root);
    },

    bindAdvisorEvents(root) {
      if (!root || root.dataset.advisorBound === "true") {
        return;
      }

      root.dataset.advisorBound = "true";

      root.addEventListener("click", (event) => {
        const toggleButton = event.target.closest(
          "[data-advisor-toggle-categories]"
        );
        if (toggleButton) {
          this.toggleCategoriesDropdown();
          this.syncCategoryButtons(root);
          return;
        }

        const typeButton = event.target.closest("[data-advisor-type]");
        if (typeButton) {
          const state = this.ensureState();
          state.selectedType = String(typeButton.dataset.advisorType || "both");

          // Išvalyti kategorijas kai keičiamas tipas
          state.selectedCategories = [];

          this.syncUi(root);
          return;
        }

        const categoryButton = event.target.closest(
          "[data-advisor-category-id]"
        );
        if (categoryButton) {
          const categoryId = String(
            categoryButton.dataset.advisorCategoryId || ""
          ).trim();

          this.toggleCategory(categoryId);
          this.refreshCategoriesUi(root);
          this.syncResult(root);
          return;
        }

      });

      root.addEventListener('click', (e) => {
        if (e.target.closest('[data-advisor-download-result]')) {
          const name = window.prompt('Dokumento pavadinimas:', '');
          if (name === null) return;
          const state = this.ensureState();
          const result = this.recalculateResult();
          const reports = safeJsonParse(
            localStorage.getItem('besafe:saved-reports'),
            [],
            "advisor:saved-reports:download"
          );
          reports.unshift({
            id: 'report_' + Date.now(),
            name: name.trim() || 'Ataskaita',
            title: (state.dateFrom || '—') + ' – ' + (state.dateTo || '—'),
            dateFrom: state.dateFrom,
            dateTo: state.dateTo,
            type: state.selectedType,
            baseAmount: result.baseAmount,
            percentageAmount: result.percentageAmount,
            vatAmount: result.vatAmount,
            total: result.total,
            createdAt: new Date().toISOString()
          });
          safeSetItem(
            'besafe:saved-reports',
            JSON.stringify(reports),
            'advisor:saved-reports:download'
          );
        }
      });

      root.addEventListener("input", (event) => {
        const state = this.ensureState();
        const target = event.target;

        if (target.matches("[data-advisor-date-from]")) {
          state.dateFrom = String(target.value || "");
          this.syncResult(root);
          return;
        }

        if (target.matches("[data-advisor-date-to]")) {
          state.dateTo = String(target.value || "");
          this.syncResult(root);
          return;
        }

        if (target.matches("[data-advisor-base-input]")) {
          state.baseAmountValue = String(target.value || "");
          this.syncResult(root);
          return;
        }

        if (target.matches("[data-advisor-percentage-input]")) {
          state.percentageValue = String(target.value || "");
          this.syncResult(root);
          return;
        }

        if (target.matches("[data-advisor-vat-input]")) {
          state.vatValue = String(target.value || "");
          this.syncResult(root);
        }
      });

      root.addEventListener("change", (event) => {
        const state = this.ensureState();
        const target = event.target;

        if (target.matches("[data-advisor-date-from]")) {
          state.dateFrom = String(target.value || "");
          this.syncResult(root);
          return;
        }

        if (target.matches("[data-advisor-date-to]")) {
          state.dateTo = String(target.value || "");
          this.syncResult(root);
          return;
        }

        if (target.matches("[data-advisor-place-select]")) {
          state.selectedPlaceId = String(target.value || "").trim();
          this.syncResult(root);
        }
      });
    },

    renderErrorState(message = "") {
      const title = this.t(
        "advisor.workspace.errorTitle",
        "Financial calculations are currently unavailable"
      );

      const safeMessage =
        message ||
        this.t(
          "advisor.workspace.errorMessage",
          "This page could not be shown right now."
        );

      const supportText = this.t(
        "advisor.workspace.errorSupport",
        "You can calmly return to Home and continue with one clear next step."
      );

      const copy = this.buildCopy();

      return `
        <section class="page-advisor">
          ${this.renderTopActions(copy)}

          <div class="module-placeholder advisor-placeholder">
            <p class="module-placeholder__eyebrow">
              ${this.escapeHtml(
                this.t("advisor.workspace.eyebrow", "Financial calculations")
              )}
            </p>

            <h2 class="module-placeholder__title">
              ${this.escapeHtml(title)}
            </h2>

            <p class="module-placeholder__text">
              ${this.escapeHtml(safeMessage)}
            </p>

            <p class="module-placeholder__text">
              ${this.escapeHtml(supportText)}
            </p>
          </div>
        </section>
      `;
    },

    async render() {
      try {
        this.ensureState();
        const copy = this.buildCopy();
        return this.renderWorkspace(copy);
      } catch (error) {
        console.error("[AdvisorPage] render failed:", error);
        return this.renderErrorState(error?.message || "");
      }
    },

    async onAfterEnter() {
      const root = document.querySelector(".page-advisor");
      if (!root) {
        return true;
      }

      await this.loadTransactions();
      await this.loadCategories();
      await this.loadPlaces();

      this.bindAdvisorEvents(root);
      this.handleSaveResult(root);
      this.handleDeleteResult(root);
      this.syncUi(root);
      // Atnaujinti rezultatą po duomenų užkrovimo
      this.syncResult(root);
      return true;
    },

    async onLeave() {
      return true;
    },

    async onBack() {
      return false;
    },

    resetCalculationState() {
      const state = this.ensureState();
      state.baseAmountValue = "";
      state.percentageValue = "";
      state.vatValue = "";
      state.percentageAmount = 0;
      state.vatAmount = 0;
      state.calculatedAmount = 0;
    },

    rebindActionButtons(root) {
      if (!root) {
        return;
      }

      this.handleSaveResult(root);
      this.handleDeleteResult(root);
    },

    handleSaveResult(root) {
      const state = this.ensureState();

      if (!root) return;

      const saveBtn = root.querySelector("[data-advisor-save-result]");
      if (!saveBtn || saveBtn.dataset.advisorBound === "true") return;

      saveBtn.dataset.advisorBound = "true";

      saveBtn.addEventListener("click", async () => {
        const saveName = window.prompt('Dokumento pavadinimas:', '');
        if (saveName === null) return;
        const result = this.recalculateResult();

        try {
          const activeTransactionService = registry.get("transactions");

          if (!activeTransactionService?.createSavedCalculation) {
            console.error("TransactionService not available");
            return;
          }

          await activeTransactionService.createSavedCalculation({
            name: saveName.trim() || 'Ataskaita',
            baseAmount: result.baseAmount,
            percentage: result.percentage,
            vat: result.vat,
            total: result.total,
            dateFrom: state.dateFrom,
            dateTo: state.dateTo,
            selectedType: state.selectedType,
            selectedCategories: state.selectedCategories,
            selectedPlaceId: state.selectedPlaceId,
          });

          const reports = safeJsonParse(
            localStorage.getItem('besafe:saved-reports'),
            [],
            "advisor:saved-reports:save"
          );
          reports.unshift({
            id: 'report_' + Date.now(),
            name: saveName.trim() || 'Ataskaita',
            title: (state.dateFrom || '—') + ' – ' + (state.dateTo || '—'),
            dateFrom: state.dateFrom,
            dateTo: state.dateTo,
            type: state.selectedType,
            baseAmount: result.baseAmount,
            percentageAmount: result.percentageAmount,
            vatAmount: result.vatAmount,
            total: result.total,
            createdAt: new Date().toISOString()
          });
          safeSetItem(
            'besafe:saved-reports',
            JSON.stringify(reports),
            'advisor:saved-reports:save'
          );

          window.dispatchEvent(new Event("besafe:saved-calculation-created"));

          this.resetCalculationState();

          const pageRoot = document.querySelector(".page-advisor");
          if (pageRoot) {
            pageRoot.innerHTML = await this.renderWorkspace(this.buildCopy());
            pageRoot.dataset.advisorBound = "false";
            this.bindAdvisorEvents(pageRoot);
            this.rebindActionButtons(pageRoot);
            this.syncUi(pageRoot);
          }
        } catch (error) {
          console.error("[AdvisorPage] Save result failed:", error);
        }
      });
    },

    handleDeleteResult(root) {
      if (!root) return;

      const deleteBtn = root.querySelector("[data-advisor-delete-result]");
      if (!deleteBtn || deleteBtn.dataset.advisorBound === "true") return;

      deleteBtn.dataset.advisorBound = "true";

      deleteBtn.addEventListener("click", () => {
        this.resetCalculationState();
        this.syncUi(root);
      });
    },

    getCategoryBreakdown() {
      const state = this.ensureState();
      const transactions = this.getFilteredTransactions();
      const categories = Array.isArray(state.categories) ? state.categories : [];
      const selectedType = String(state.selectedType || "expense").trim().toLowerCase();

      const breakdown = {};

      for (const transaction of transactions) {
        const type = String(transaction?.type || "").trim().toLowerCase();
        if (selectedType !== "both" && type !== selectedType) {
          continue;
        }

        const amount = Math.abs(Number(transaction?.amount || 0));
        if (!Number.isFinite(amount)) {
          continue;
        }

        const txCategoryId = String(
          transaction?.categoryId || transaction?.meta?.categoryId || ""
        ).trim();

        const matchedCategory = categories.find((c) => {
          const catId = String(c?.id || c?.categoryId || "").trim();
          return catId && catId === txCategoryId;
        });

        const categoryName = matchedCategory
          ? this.getResolvedCategoryLabel(matchedCategory)
          : txCategoryId || this.t("advisor.export.uncategorized", "Uncategorized");

        if (!breakdown[categoryName]) {
          breakdown[categoryName] = { name: categoryName, total: 0, count: 0 };
        }

        breakdown[categoryName].total += amount;
        breakdown[categoryName].count += 1;
      }

      return Object.values(breakdown).sort((a, b) => b.total - a.total);
    },

  };
}
