import { createTranslator, getCurrentLanguage } from "../core/i18n.js";

export function initCategoriesPage(dependencies = {}) {
  const transactionService =
    dependencies?.transactionService ||
    dependencies?.services?.transactionService ||
    null;

  function getTranslate() {
    return createTranslator(getCurrentLanguage());
  }

  return {
    state: null,
    plan: "personal",
    _categoryCreateListenerAdded: false,
    _pendingOpenFromQuickActions: false,

    async onBeforeEnter() {
      if (!this._categoryCreateListenerAdded) {
        this._categoryCreateListenerAdded = true;

        window.addEventListener("besafe:open-category-create", () => {
          const state = this.ensureState();
          state.nameValue = "";
          state.typeValue = "expense";
          state.openedFromQuickActions = true;
          this._pendingOpenFromQuickActions = true;
        });
      }

      if (!this._userPlanListenerAdded) {
        this._userPlanListenerAdded = true;

        document.addEventListener("user-plan:changed", async (event) => {
          const newPlan = event.detail?.plan;
          if (!newPlan) return;
          this.setPlan(newPlan);
          await this.onAfterEnter();
        });
      }

      this.state = this.createInitialState();
      return true;
    },

    setPlan(plan) {
      const normalized = String(plan || "").trim().toLowerCase();
      this.plan = normalized === "business" ? "business" : "personal";
    },

    isBusinessPlan() {
      return this.plan === "business";
    },

    createInitialState() {
      return {
        categories: [],
        transactions: [],
        nameValue: "",
        typeValue: "expense",
        statusMessage: "",
        statusTone: "neutral",
        isSaving: false,
        isDeleting: false,
        openedFromQuickActions: false,
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
        const value = translator(key, fallback, variables);

        if (typeof value !== "string") {
          return fallback || key;
        }

        const normalized = value.trim();

        if (!normalized || normalized === key) {
          return fallback || key;
        }

        return normalized;
      } catch (_error) {
        return fallback || key;
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

    normalizeText(value, fallback = "") {
      if (typeof value !== "string") {
        return fallback;
      }

      const normalized = value.trim();
      return normalized || fallback;
    },

    normalizeComparableText(value) {
      return this.normalizeText(value)
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    },

    getCurrentLocale() {
      const language = String(getCurrentLanguage?.() || "en").toLowerCase();
      const localeMap = { lt: "lt-LT", en: "en-GB", pl: "pl-PL", de: "de-DE", es: "es-ES", fr: "fr-FR", it: "it-IT", ru: "ru-RU", uk: "uk-UA", no: "nb-NO", sv: "sv-SE", ja: "ja-JP", zh: "zh-CN", pt: "pt-BR" };
      return localeMap[language] || "en-GB";
    },

    setStatus(message, tone = "neutral") {
      const state = this.ensureState();
      state.statusMessage = this.normalizeText(message);
      state.statusTone = tone || "neutral";
    },

    clearStatus() {
      const state = this.ensureState();
      state.statusMessage = "";
      state.statusTone = "neutral";
    },

    getTypeLabel(type = "") {
      const normalized = String(type || "").trim().toLowerCase();

      if (normalized === "income") {
        return this.t("categories.types.income", "Income");
      }

      return this.t("categories.types.expense", "Expense");
    },

    getSortedCategories() {
      const state = this.ensureState();
      const categories = Array.isArray(state.categories) ? state.categories : [];

      return [...categories].sort((left, right) => {
        const leftType = this.normalizeText(left?.type).toLowerCase();
        const rightType = this.normalizeText(right?.type).toLowerCase();

        if (leftType !== rightType) {
          return leftType.localeCompare(rightType, this.getCurrentLocale());
        }

        const leftName = this.normalizeText(left?.name, "").toLocaleLowerCase(
          this.getCurrentLocale()
        );
        const rightName = this.normalizeText(right?.name, "").toLocaleLowerCase(
          this.getCurrentLocale()
        );

        return leftName.localeCompare(rightName, this.getCurrentLocale());
      });
    },

    async loadCategories() {
      const state = this.ensureState();

      try {
        if (!transactionService?.getCategories) {
          state.categories = [];
          return state.categories;
        }

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
      } catch (error) {
        console.error("[CategoriesPage] Failed to load categories:", error);
        state.categories = [];
        this.setStatus(
          this.t(
            "categories.status.loadFailed",
            "Could not load categories right now."
          ),
          "error"
        );
        return state.categories;
      }
    },

    buildCopy() {
      const isBusiness = this.isBusinessPlan();

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
          eyebrow: this.t("categories.header.eyebrow", "BeSafe Categories"),
          title: this.t("categories.header.title", "Categories"),
          text: this.t(
            "categories.header.subtitle",
            "A calm place to manage the categories used in your records and calculations."
          ),
        },

        plan: {
          title: isBusiness
            ? this.t(
                "categories.plan.businessTitle",
                "Business category management"
              )
            : this.t("categories.plan.personalTitle", "Simple category use"),
          text: isBusiness
            ? this.t(
                "categories.plan.businessText",
                "Here you can create and manage the categories used later in records and calculations."
              )
            : this.t(
                "categories.plan.personalText",
                "You can create and use categories here. Keep them clear and simple."
              ),
        },

        form: {
          title: this.t("categories.form.title", "Add category"),
          text: this.t(
            "categories.form.subtitle",
            "Create one category at a time so your records and calculations stay clear."
          ),
          nameLabel: this.t("categories.form.nameLabel", "Category name"),
          namePlaceholder: this.t(
            "categories.form.namePlaceholder",
            "Add the category name"
          ),
          typeLabel: this.t("categories.form.typeLabel", "Category type"),
          saveLabel: this.t("categories.actions.save", "Save category"),
          cancelLabel: this.t("categories.actions.cancel", "Cancel"),
        },

        list: {
          title: this.t("categories.list.title", "Saved categories"),
          subtitle: this.t(
            "categories.list.subtitle",
            "These categories are used in your records and calculations."
          ),
          emptyTitle: this.t(
            "categories.empty.title",
            "There are no categories yet"
          ),
          emptyText: this.t(
            "categories.empty.text",
            "When you add categories, they will appear here and become available in calculations."
          ),
          linkedEntries: this.t(
            "categories.list.linkedEntries",
            "Linked entries"
          ),
          noLinkedEntries: this.t(
            "categories.list.noLinkedEntries",
            "No linked entries yet"
          ),
          deleteLabel: this.t("categories.actions.delete", "Delete"),
          deleteConfirm: this.t(
            "categories.confirm.delete",
            "Are you sure you want to remove this category?"
          ),
        },

        personal: {
          title: this.t(
            "categories.personal.lockedTitle",
            "Category management is part of Business"
          ),
          text: this.t(
            "categories.personal.lockedText",
            "Personal keeps category use simpler. If you later need custom categories for work logic, that belongs to the Business layer."
          ),
        },

        status: {
          saving: this.t("categories.status.saving", "Saving category…"),
          saved: this.t("categories.status.saved", "Category saved."),
          saveFailed: this.t(
            "categories.status.saveFailed",
            "Could not save the category right now."
          ),
          deleted: this.t("categories.status.deleted", "Category removed."),
          deleteFailed: this.t(
            "categories.status.deleteFailed",
            "Could not remove the category right now."
          ),
          missingName: this.t(
            "categories.validation.missingName",
            "Please enter a category name."
          ),
          missingType: this.t(
            "categories.validation.missingType",
            "Please choose the category type."
          ),
          duplicate: this.t(
            "categories.validation.duplicate",
            "This category already exists."
          ),
          serviceUnavailable: this.t(
            "categories.error.serviceUnavailable",
            "Categories service is not available right now."
          ),
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

    renderIntro(copy) {
      return `
        <div class="module-placeholder__item advisor-workspace-section">
          <p class="module-placeholder__eyebrow">
            ${this.escapeHtml(copy.page.eyebrow)}
          </p>

          <h2 class="module-placeholder__title">
            ${this.escapeHtml(copy.page.title)}
          </h2>

          <p class="module-placeholder__text">
            ${this.escapeHtml(copy.page.text)}
          </p>
        </div>
      `;
    },

    renderStatus() {
      const state = this.ensureState();
      const message = this.normalizeText(state.statusMessage);

      if (!message) {
        return "";
      }

      const toneClass =
        state.statusTone === "error"
          ? "module-placeholder__item advisor-workspace-subitem"
          : "module-placeholder__item advisor-workspace-subitem";

      return `
        <div class="${toneClass}" data-categories-status>
          <span>${this.escapeHtml(message)}</span>
        </div>
      `;
    },

    renderForm(copy) {
      const state = this.ensureState();

      return `
        <div class="module-placeholder__item advisor-workspace-section">
          <strong>${this.escapeHtml(copy.form.title)}</strong>
          <span>${this.escapeHtml(copy.form.text)}</span>

          <div class="module-placeholder__list">
            <div class="module-placeholder__item advisor-workspace-subitem">
              <strong>${this.escapeHtml(copy.form.nameLabel)}</strong>
              <label class="advisor-workspace-field">
                <input
                  type="text"
                  maxlength="120"
                  value="${this.escapeHtml(state.nameValue)}"
                  placeholder="${this.escapeHtml(copy.form.namePlaceholder)}"
                  data-categories-name-input
                />
              </label>
            </div>

            <div class="module-placeholder__item advisor-workspace-subitem">
              <strong>${this.escapeHtml(copy.form.typeLabel)}</strong>

              <div class="advisor-workspace-chip-row">
                <button
                  type="button"
                  class="shortcut-btn ${
                    state.typeValue === "expense"
                      ? "button-primary"
                      : "button-secondary"
                  }"
                  data-categories-type="expense"
                >
                  ${this.escapeHtml(this.getTypeLabel("expense"))}
                </button>

                <button
                  type="button"
                  class="shortcut-btn ${
                    state.typeValue === "income"
                      ? "button-primary"
                      : "button-secondary"
                  }"
                  data-categories-type="income"
                >
                  ${this.escapeHtml(this.getTypeLabel("income"))}
                </button>
              </div>
            </div>

            ${this.renderStatus()}

            <div class="module-placeholder__item advisor-workspace-subitem">
              <div class="advisor-workspace-chip-row">
                <button
                  type="button"
                  class="shortcut-btn button-primary"
                  data-categories-save
                  ${state.isSaving ? "disabled" : ""}
                >
                  ${this.escapeHtml(copy.form.saveLabel)}
                </button>

                <button
                  type="button"
                  class="shortcut-btn button-secondary"
                  data-categories-cancel
                  ${state.isSaving ? "disabled" : ""}
                >
                  ${this.escapeHtml(copy.form.cancelLabel)}
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    },

    countLinkedEntries(categoryId) {
      const id = String(categoryId || "").trim();
      if (!id || !transactionService?.getTransactions) {
        return 0;
      }

      const state = this.ensureState();
      const transactions = Array.isArray(state.transactions)
        ? state.transactions
        : [];

      return transactions.filter((transaction) => {
        const transactionCategoryId = String(
          transaction?.categoryId || transaction?.meta?.categoryId || ""
        ).trim();

        return transactionCategoryId === id;
      }).length;
    },

    renderCategoriesList(copy) {
      const categories = this.getSortedCategories();

      if (!categories.length) {
        return `
          <div class="module-placeholder__item advisor-workspace-section">
            <strong>${this.escapeHtml(copy.list.title)}</strong>
            <span>${this.escapeHtml(copy.list.subtitle)}</span>

            <div class="module-placeholder__list">
              <div class="module-placeholder__item advisor-workspace-subitem">
                <strong>${this.escapeHtml(copy.list.emptyTitle)}</strong>
                <span>${this.escapeHtml(copy.list.emptyText)}</span>
              </div>
            </div>
          </div>
        `;
      }

      return `
        <div class="module-placeholder__item advisor-workspace-section">
          <strong>${this.escapeHtml(copy.list.title)}</strong>
          <span>${this.escapeHtml(copy.list.subtitle)}</span>

          <div class="module-placeholder__list">
            ${categories
              .map((category) => {
                const categoryId = String(category?.id || "").trim();
                const linkedEntries = this.countLinkedEntries(categoryId);
                const linkedEntriesText =
                  linkedEntries > 0
                    ? `${copy.list.linkedEntries}: ${linkedEntries}`
                    : copy.list.noLinkedEntries;

                return `
                  <div class="module-placeholder__item advisor-workspace-subitem">
                    <strong>${this.escapeHtml(
                      this.normalizeText(category?.name, "—")
                    )}</strong>

                    <span>
                      ${this.escapeHtml(this.getTypeLabel(category?.type))}
                    </span>

                    <span>
                      ${this.escapeHtml(linkedEntriesText)}
                    </span>

                    <div class="advisor-workspace-chip-row">
                      <button
                        type="button"
                        class="shortcut-btn button-secondary"
                        data-categories-delete="${this.escapeHtml(categoryId)}"
                        ${this.ensureState().isDeleting ? "disabled" : ""}
                      >
                        ${this.escapeHtml(copy.list.deleteLabel)}
                      </button>
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
        </div>
      `;
    },

    renderWorkspace(copy) {
      const content = `
        ${this.renderForm(copy)}
        ${this.renderCategoriesList(copy)}
      `;

      return `
        <section class="page-advisor page-categories">
          ${this.renderTopActions(copy)}

          <div class="module-placeholder advisor-placeholder advisor-placeholder--connected">
            ${this.renderIntro(copy)}

            <div class="module-placeholder__list">
              ${content}
            </div>
          </div>
        </section>
      `;
    },

    renderErrorState(message = "") {
      const copy = this.buildCopy();

      return `
        <section class="page-advisor page-categories">
          ${this.renderTopActions(copy)}

          <div class="module-placeholder advisor-placeholder">
            <p class="module-placeholder__eyebrow">
              ${this.escapeHtml(copy.page.eyebrow)}
            </p>

            <h2 class="module-placeholder__title">
              ${this.escapeHtml(
                this.t(
                  "categories.error.title",
                  "Categories are currently unavailable"
                )
              )}
            </h2>

            <p class="module-placeholder__text">
              ${this.escapeHtml(
                message ||
                  this.t(
                    "categories.error.message",
                    "This page could not be shown right now."
                  )
              )}
            </p>
          </div>
        </section>
      `;
    },

    async loadTransactionsForLinkedCounts() {
      const state = this.ensureState();

      try {
        if (!transactionService?.getTransactions) {
          state.transactions = [];
          return state.transactions;
        }

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
      } catch (error) {
        console.error("[CategoriesPage] Failed to load transactions:", error);
        state.transactions = [];
        return state.transactions;
      }
    },

    syncTypeButtons(root) {
      const state = this.ensureState();
      const buttons = root.querySelectorAll("[data-categories-type]");

      buttons.forEach((button) => {
        const isActive = button.dataset.categoriesType === state.typeValue;
        button.classList.toggle("button-primary", isActive);
        button.classList.toggle("button-secondary", !isActive);
      });
    },

    syncForm(root) {
      const state = this.ensureState();
      const nameInput = root.querySelector("[data-categories-name-input]");

      if (nameInput) {
        nameInput.value = state.nameValue || "";
      }

      this.syncTypeButtons(root);
    },

    rerender(root) {
      if (!root) {
        return;
      }

      const copy = this.buildCopy();
      root.innerHTML = this.renderWorkspace(copy);
      this.bindEvents(root);
    },

    hasDuplicateCategory(name, type) {
      const state = this.ensureState();
      const categories = Array.isArray(state.categories) ? state.categories : [];
      const comparableName = this.normalizeComparableText(name);
      const comparableType = this.normalizeText(type).toLowerCase();

      return categories.some((category) => {
        const existingName = this.normalizeComparableText(category?.name || "");
        const existingType = this.normalizeText(category?.type).toLowerCase();

        return (
          existingName === comparableName && existingType === comparableType
        );
      });
    },

    async handleSave(root) {
      const state = this.ensureState();
      const copy = this.buildCopy();

      if (!transactionService?.createCategory) {
        this.setStatus(copy.status.serviceUnavailable, "error");
        this.rerender(root);
        return;
      }

      const name = this.normalizeText(state.nameValue);
      const type = this.normalizeText(state.typeValue).toLowerCase();

      if (!name) {
        this.setStatus(copy.status.missingName, "error");
        this.rerender(root);
        return;
      }

      if (type !== "expense" && type !== "income") {
        this.setStatus(copy.status.missingType, "error");
        this.rerender(root);
        return;
      }

      if (this.hasDuplicateCategory(name, type)) {
        this.setStatus(copy.status.duplicate, "error");
        this.rerender(root);
        return;
      }

      state.isSaving = true;
      this.setStatus(copy.status.saving, "neutral");
      this.rerender(root);

      try {
        const createdCategory = await transactionService.createCategory({
          name,
          type,
        });

        state.nameValue = "";
        state.typeValue = "expense";
        state.isSaving = false;

        await this.loadCategories();
        await this.loadTransactionsForLinkedCounts();

        this.setStatus(copy.status.saved, "success");
        this.rerender(root);

        window.dispatchEvent(
          new CustomEvent("besafe:category-created", {
            detail: {
              category:
                createdCategory && typeof createdCategory === "object"
                  ? createdCategory
                  : {
                      name,
                      type,
                    },
              source: "categories-page",
              returnToQuickActions: state.openedFromQuickActions === true,
            },
          })
        );

        if (state.openedFromQuickActions) {
          state.openedFromQuickActions = false;

          setTimeout(() => {
            if (window.location.hash !== "#/home") {
              window.location.hash = "#/home";
            }
          }, 150);
        }
      } catch (error) {
        console.error("[CategoriesPage] Failed to save category:", error);
        state.isSaving = false;
        this.setStatus(copy.status.saveFailed, "error");
        this.rerender(root);
      }
    },

    async handleDelete(root, categoryId) {
      const state = this.ensureState();
      const copy = this.buildCopy();
      const id = String(categoryId || "").trim();

      if (!id) {
        return;
      }

      if (!transactionService?.deleteCategory) {
        this.setStatus(copy.status.serviceUnavailable, "error");
        this.rerender(root);
        return;
      }

      const confirmed = window.confirm(copy.list.deleteConfirm);
      if (!confirmed) {
        return;
      }

      state.isDeleting = true;
      this.clearStatus();
      this.rerender(root);

      try {
        await transactionService.deleteCategory(id);
        state.isDeleting = false;

        await this.loadCategories();
        await this.loadTransactionsForLinkedCounts();

        this.setStatus(copy.status.deleted, "success");
        this.rerender(root);
      } catch (error) {
        console.error("[CategoriesPage] Failed to delete category:", error);
        state.isDeleting = false;
        this.setStatus(copy.status.deleteFailed, "error");
        this.rerender(root);
      }
    },

    bindEvents(root) {
      if (!root || root.dataset.categoriesBound === "true") {
        return;
      }

      root.dataset.categoriesBound = "true";

      root.addEventListener("click", (event) => {
        const typeButton = event.target.closest("[data-categories-type]");
        if (typeButton) {
          const state = this.ensureState();
          state.typeValue = String(
            typeButton.dataset.categoriesType || "expense"
          ).trim();
          this.syncForm(root);
          return;
        }

        const saveButton = event.target.closest("[data-categories-save]");
        if (saveButton) {
          this.handleSave(root);
          return;
        }

        const cancelButton = event.target.closest("[data-categories-cancel]");
        if (cancelButton) {
          const state = this.ensureState();
          state.nameValue = "";
          state.typeValue = "expense";
          this.clearStatus();
          this.rerender(root);
          return;
        }

        const deleteButton = event.target.closest("[data-categories-delete]");
        if (deleteButton) {
          const categoryId = String(
            deleteButton.dataset.categoriesDelete || ""
          ).trim();
          this.handleDelete(root, categoryId);
        }
      });

      root.addEventListener("input", (event) => {
        const nameInput = event.target.closest("[data-categories-name-input]");
        if (nameInput) {
          const state = this.ensureState();
          state.nameValue = String(nameInput.value || "");
        }
      });
    },

    async render() {
      try {
        this.ensureState();
        const copy = this.buildCopy();
        return this.renderWorkspace(copy);
      } catch (error) {
        console.error("[CategoriesPage] render failed:", error);
        return this.renderErrorState(error?.message || "");
      }
    },

    async onAfterEnter() {
      const root =
        document.querySelector(".page-categories") ||
        document.querySelector(".page-advisor");

      if (!root) {
        return true;
      }

      await this.loadCategories();
      await this.loadTransactionsForLinkedCounts();
      this.rerender(root);

      if (this._pendingOpenFromQuickActions) {
        this._pendingOpenFromQuickActions = false;

        const nameInput = root.querySelector("[data-categories-name-input]");
        if (nameInput) {
          nameInput.focus();
        }
      }

      return true;
    },

    async onBack() {
      return false;
    },
  };
}