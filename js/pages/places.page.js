import { createTranslator, getCurrentLanguage } from "../core/i18n.js";
import { registry } from "../core/service.registry.js";

export class PlacesPage {
  constructor() {
    this.transactionService = null;

    this.plan = "personal";

    this.isCreateOpen = false;
    this.isSaving = false;
    this.isDeletingPlaceId = "";

    this.currentPlaces = [];

    this.lastCreatedPlaceId = "";

    this.lastSuccessAction = "";
    this.status = {
      type: "idle",
      message: "",
    };

    this.formDraft = this.createEmptyDraft();

    this.handleClick = this.handleClick.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
    console.log("[PlacesPage] constructor loaded");

    // A3 cross-page cache invalidation. setUserPlan() in user-plan.js
    // dispatches `user-plan:changed`. When the page is active, refresh
    // so the new mode's data renders without navigation.
    this._boundUserPlanChanged = (event) => {
      const newPlan = event.detail?.plan;
      if (!newPlan) return;
      this.setPlan(newPlan);
      if (this.getPageRoot()) {
        this.refresh();
      }
    };
    document.addEventListener("user-plan:changed", this._boundUserPlanChanged);
  }

  setPlan(plan) {
    const normalizedPlan = this.normalizeText(plan).toLowerCase();
    this.plan = normalizedPlan === "business" ? "business" : "personal";
  }

  isBusinessPlan() {
    return this.plan === "business";
  }

  createEmptyDraft() {
    return {
      name: "",
      type: "",
      note: "",
      purpose: "expense",
    };
  }

  resetDraft() {
    this.formDraft = this.createEmptyDraft();
  }

  updateDraft(values = {}) {
    this.formDraft = {
      ...this.createEmptyDraft(),
      ...this.formDraft,
      name: this.normalizeText(values.name ?? this.formDraft.name),
      type: this.normalizePlaceType(values.type ?? this.formDraft.type),
      note: this.normalizeText(values.note ?? this.formDraft.note),
      purpose:
        this.normalizeText(values.purpose ?? this.formDraft.purpose) ||
        "expense",
    };
  }

  getTranslator() {
    return createTranslator(getCurrentLanguage());
  }

  t(key, fallback, variables) {
    const translate = this.getTranslator();
    return translate(key, fallback, variables);
  }

  getTransactionService() {
    if (this.transactionService) {
      return this.transactionService;
    }

    try {
      this.transactionService = registry.get("transactions");
      return this.transactionService;
    } catch (error) {
      console.warn("[PlacesPage] Failed to get transactions service:", error);
      return null;
    }
  }

  logDebug(label, data = {}) {
    console.log(`[PlacesPage][debug] ${label}`, data);
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

  normalizeText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  normalizeComparableText(value) {
    return this.normalizeText(value)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
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

    if (compact === "goods" || compact === "prekes" || compact === "prekės") {
      return "goods";
    }

    if (
      compact === "utilities" ||
      compact === "komunalinespaslaugos" ||
      compact === "komunalinėspaslaugos"
    ) {
      return "utilities";
    }

    if (compact === "health" || compact === "sveikata") {
      return "health";
    }

    if (compact === "leisure" || compact === "laisvalaikis") {
      return "leisure";
    }

    return normalized;
  }

  getPageRoot() {
    return document.getElementById("page-places");
  }

  isPageActive() {
    const pageRoot = this.getPageRoot();
    if (!pageRoot) return false;
    if (pageRoot.hidden) return false;
    return !pageRoot.closest("[hidden]");
  }

  setStatus(type = "idle", message = "") {
    this.status = {
      type,
      message,
    };
  }

  renderStatus() {
    const message = this.status?.message || "";
    const type = this.status?.type || "idle";

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

  normalizePlace(place = {}) {
    const id = this.normalizeText(place?.id || place?.placeId);
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
    const note = this.normalizeText(place?.note || place?.notes);
    const purpose = this.normalizeText(place?.purpose || "expense");
    const linkedEntries = this.normalizeNumber(
      place?.linkedEntriesCount ??
        place?.transactionCount ??
        place?.usageCount ??
        0
    );

    return {
      id,
      name,
      type,
      note,
      purpose,
      linkedEntries,
    };
  }

  async loadPlaces() {
    const transactionService = this.getTransactionService();

    if (
      !transactionService ||
      typeof transactionService.getPlaces !== "function"
    ) {
      return [];
    }

    try {
      const places = await transactionService.getPlaces();
      if (!Array.isArray(places)) {
        return [];
      }

      return places
        .map((place) => this.normalizePlace(place))
        .filter((place) => place.name || place.id);
    } catch (error) {
      console.warn("[PlacesPage] Failed to load places:", error);
      return [];
    }
  }

  async createPlace(payload) {
    const transactionService = this.getTransactionService();

    if (
      !transactionService ||
      typeof transactionService.createPlace !== "function"
    ) {
      throw new Error(
        this.t(
          "places.status.saveFailed",
          "Could not save the place right now."
        )
      );
    }

    return transactionService.createPlace(payload);
  }

  async deletePlace(placeId) {
    const transactionService = this.getTransactionService();

    if (
      !transactionService ||
      typeof transactionService.deletePlace !== "function"
    ) {
      throw new Error(
        this.t(
          "places.status.deleteFailed",
          "Could not remove the place right now."
        )
      );
    }

    return transactionService.deletePlace(placeId);
  }

  buildTypeOptions(selectedType = "") {
    const safeSelected = this.normalizePlaceType(selectedType);

    const options = [
      { value: "store", label: this.t("places.types.store", "Parduotuvė") },
      { value: "goods", label: this.t("places.types.goods", "Prekės") },
      {
        value: "transport",
        label: this.t("places.types.transport", "Transportas"),
      },
      { value: "bank", label: this.t("places.types.bank", "Bankas") },
      { value: "housing", label: this.t("places.types.housing", "Būstas") },
      {
        value: "utilities",
        label: this.t("places.types.utilities", "Komunalinės paslaugos"),
      },
      { value: "health", label: this.t("places.types.health", "Sveikata") },
      { value: "leisure", label: this.t("places.types.leisure", "Laisvalaikis") },
      { value: "other", label: this.t("places.types.other", "Kita") },
    ];

    return options
      .map((option) => {
        const isSelected = safeSelected === option.value;
        return `
          <option value="${this.escapeHtml(option.value)}" ${
            isSelected ? "selected" : ""
          }>
            ${this.escapeHtml(option.label)}
          </option>
        `;
      })
      .join("");
  }

  renderPlanSummary() {
    const isBusiness = this.isBusinessPlan();

    const eyebrow = isBusiness
      ? this.t("places.plan.businessEyebrow", "Business structure")
      : this.t("places.plan.personalEyebrow", "Simple places");

    const title = isBusiness
      ? this.t("places.plan.businessTitle", "Places become part of your work structure")
      : this.t("places.plan.personalTitle", "Your places");

    const subtitle = isBusiness
      ? this.t(
          "places.plan.businessText",
          "In Business mode, places help you connect financial records to real sources and prepare clearer comparisons later."
        )
      : this.t(
          "places.plan.personalText",
          "Personal mode keeps places simple: add only the real places you use so records stay clearer without extra structure work."
        );

    return `
      <section class="section section--card" aria-label="${this.escapeHtml(
        title
      )}">
        <div class="home-section-header home-section-header--compact">
          <p class="home-section-header__eyebrow">
            ${this.escapeHtml(eyebrow)}
          </p>

         <h3 class="home-section-header__title">
           ${this.escapeHtml(
             this.t("places.empty.title", "Add your first place")
           )}
         </h3>

          <p class="home-section-header__subtitle">
            ${this.escapeHtml(subtitle)}
          </p>
        </div>
      </section>
    `;
  }

  renderCreateForm() {
    if (!this.isCreateOpen) {
      return "";
    }

    return `
      <section class="section section--card" aria-label="${this.escapeHtml(
        this.t("places.actions.add", "Add place")
      )}">
        <div class="home-section-header home-section-header--compact">
          <h3 class="home-section-header__title">
            ${this.escapeHtml(this.t("places.actions.add", "Add place"))}
          </h3>

          <p class="home-section-header__subtitle">
            ${this.escapeHtml(this.t("places.form.subtitle", "Add a place."))}
          </p>
        </div>

        ${this.renderStatus()}

        <form id="places-create-form" class="quick-action-form" novalidate>

          <div class="quick-action-form__field">
            <label class="quick-action-form__label" for="places-purpose">
            ${this.escapeHtml(this.t("places.form.purposeLabel", "Place purpose"))}
          </label>
          <select
            id="places-purpose"
            name="purpose"
            class="quick-action-form__input"
            ${this.isSaving ? "disabled" : ""}
          >
            <option
              value="expense"
              ${this.formDraft.purpose === "income" ? "" : "selected"}
            >
              ${this.escapeHtml(this.t("places.form.purposeExpense", "Expense place"))}
            </option>
            ${this.isBusinessPlan() ? `
              <option
                value="income"
                ${this.formDraft.purpose === "income" ? "selected" : ""}
              >
                ${this.escapeHtml(this.t("places.form.purposeIncome", "Income place"))}
              </option>
            ` : ""}
          </select>
        </div>

          <div class="quick-action-form__field">
            <label class="quick-action-form__label" for="places-name">
              ${this.escapeHtml(this.t("places.form.nameLabel", "Place name"))}
            </label>
            <input
              id="places-name"
              name="name"
              type="text"
              class="quick-action-form__input"
              placeholder="${this.escapeHtml(
                this.t("places.form.namePlaceholder", "Add the place name")
              )}"
              maxlength="120"
              value="${this.escapeHtml(this.formDraft.name)}"
              ${this.isSaving ? "disabled" : ""}
            />
          </div>

          <div class="quick-action-form__field">
            <label class="quick-action-form__label" for="places-type">
              ${this.escapeHtml(this.t("places.form.typeLabel", "Type"))}
            </label>
            <select
              id="places-type"
              name="type"
              class="quick-action-form__input"
              ${this.isSaving ? "disabled" : ""}
            >
              <option value="">
                ${this.escapeHtml(
                  this.t("places.form.typePlaceholder", "Type")
                )}
              </option>
              ${this.buildTypeOptions(this.formDraft.type)}
            </select>
          </div>

          <div class="quick-action-form__field">
            <label class="quick-action-form__label" for="places-note">
              ${this.escapeHtml(this.t("places.form.noteLabel", "Optional note"))}
            </label>
            <textarea
              id="places-note"
              name="note"
              class="quick-action-form__textarea"
              rows="3"
              placeholder="${this.escapeHtml(
                this.t("places.form.notePlaceholder", "Note")
              )}"
              ${this.isSaving ? "disabled" : ""}
            >${this.escapeHtml(this.formDraft.note)}</textarea>
          </div>

          <div class="button-row">
            <button
              type="submit"
              class="shortcut-btn button-secondary"
              ${this.isSaving ? "disabled" : ""}
            >
              ${this.escapeHtml(this.t("places.actions.save", "Save"))}
            </button>

            <button
              type="button"
              class="shortcut-btn button-secondary"
              data-places-action="cancel-create"
              ${this.isSaving ? "disabled" : ""}
            >
              ${this.escapeHtml(this.t("places.actions.cancel", "Close"))}
            </button>
          </div>
        </form>
      </section>
    `;
  }

  renderSuccessSummary() {
    if (this.status?.type !== "success" || !this.status?.message) {
      return "";
    }

    const isDeleteSuccess = this.lastSuccessAction === "delete-place";

    const title = isDeleteSuccess
      ? this.t("places.status.deleted", "Place removed.")
      : this.t("places.status.saved", "Place saved.");

    const subtitle = isDeleteSuccess
      ? this.currentPlaces.length
        ? this.t(
            "places.success.deleteNextStep",
            "The place was removed from your saved places list. Next clear step: keep only the places you really use."
          )
        : this.t(
            "places.success.deleteLastPlaceNextStep",
            "The place was removed and your saved places list is now empty. Next clear step: add a place only when you need one."
          )
      : this.currentPlaces.length <= 1
        ? this.t(
            "places.success.firstPlaceNextStep",
            "You now have your first saved place. Next clear step: add another place or keep using BeSafe normally."
          )
        : this.t(
            "places.success.nextStep",
            "The new place is now part of your saved places list. Next clear step: add another place only if you need one."
          );

    return `
      <section class="section section--card" aria-label="${this.escapeHtml(
        title
      )}">
        <div class="home-section-header home-section-header--compact">
          <h3 class="home-section-header__title">
            ${this.escapeHtml(title)}
          </h3>

          <p class="home-section-header__subtitle">
            ${this.escapeHtml(subtitle)}
          </p>
        </div>
      </section>
    `;
  }

  renderEmptyState() {
    return `
      <section class="section section--card" aria-label="${this.escapeHtml(
        this.t("places.empty.title", "No places")
      )}">
        <div class="home-section-header home-section-header--compact">
          <h3 class="home-section-header__title">
            ${this.escapeHtml(
              this.t("places.empty.title", "Add your first place")
            )}
          </h3>

          <p class="home-section-header__subtitle">
            ${this.escapeHtml(
              this.t(
                "places.empty.text",
                "Add the places you actually use so your records stay clear."
              )
            )}
          </p>
        </div>

        <div class="module-placeholder">
          <div class="module-placeholder__content">
            <p class="module-placeholder__text">
              ${this.escapeHtml(
                this.t("places.empty.nextStep", "Add your first place.")
              )}
            </p>

            <div class="button-row">
              <button
                type="button"
                class="shortcut-btn button-secondary"
                data-places-action="open-create"
                ${this.isSaving ? "disabled" : ""}
              >
                ${this.escapeHtml(this.t("places.actions.add", "Add place"))}
              </button>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  renderPlacesList() {
    if (!this.currentPlaces.length) {
      return "";
    }

    return `
      <section class="section section--card" aria-label="${this.escapeHtml(
        this.t("places.list.aria", "Places list")
      )}">
        <div class="home-section-header home-section-header--compact">
          <h3 class="home-section-header__title">
            ${this.escapeHtml(this.t("places.list.title", "Saved places"))}
          </h3>

          <p class="home-section-header__subtitle">
            ${this.escapeHtml(
              this.t("places.list.subtitle", "Your saved places.")
            )}
          </p>
        </div>

        <div class="list-card">
          <div class="list-card__items">
            ${this.currentPlaces
              .map((place) => {
                const title = place.name || place.id;
                const typeLabel = place.type
                  ? this.getPlaceTypeLabel(place.type)
                  : this.t("places.list.noType", "Type not set");

                const count = this.normalizeNumber(place.linkedEntries);
                const isUsed = count > 0;

                const linkedEntriesText =
                  count === 0
                    ? this.t("places.list.noLinkedEntries", "No records")
                    : `${this.t(
                        "places.list.linkedEntriesLabel",
                        "Records"
                      )}: ${count}`;

                const isRecentlyCreated =
                  this.lastCreatedPlaceId &&
                  place.id &&
                  place.id === this.lastCreatedPlaceId;

                const isDeleting =
                  this.isDeletingPlaceId &&
                  place.id &&
                  place.id === this.isDeletingPlaceId;

                return `
                  <article class="activity-item${
                    isRecentlyCreated ? " activity-item--new" : ""
                  }">
                    <div class="activity-item__content">
                      <strong class="activity-item__title">
                        ${this.escapeHtml(title)}
                        ${
                          isRecentlyCreated
                            ? `
                              <span class="activity-item__badge">
                                ${this.escapeHtml(
                                  this.t("places.list.newBadge", "New")
                                )}
                              </span>
                            `
                            : ""
                        }
                      </strong>

                      <p class="activity-item__meta">
                        ${this.escapeHtml(typeLabel)}
                      </p>

                      <p class="activity-item__meta">
                        ${this.escapeHtml(linkedEntriesText)}
                        ${
                          isUsed
                            ? ` <span class="activity-item__badge">${this.escapeHtml(
                                this.t("places.list.used", "Used")
                              )}</span>`
                            : ""
                        }
                      </p>

                      ${
                        place.note
                          ? `
                            <p class="activity-item__meta">
                              ${this.escapeHtml(place.note)}
                            </p>
                          `
                          : ""
                      }

                      <div class="button-row">
                        <button
                          type="button"
                          class="shortcut-btn button-secondary"
                          data-places-action="delete-place"
                          data-place-id="${this.escapeHtml(place.id)}"
                          ${isDeleting ? "disabled" : ""}
                        >
                          ${this.escapeHtml(
                            isDeleting
                              ? this.t(
                                  "places.status.deleting",
                                  "Removing place…"
                                )
                              : this.t("places.actions.delete", "Delete")
                          )}
                        </button>
                      </div>
                    </div>
                  </article>
                `;
              })
              .join("")}
          </div>
        </div>
      </section>
    `;
  }

  renderHeader() {
    const hasPlaces = this.currentPlaces.length > 0;
    const hasStatusMessage = Boolean(this.status?.message);
    const isSuccessStatus = this.status?.type === "success";

    if (!hasPlaces && this.isCreateOpen) {
      return "";
    }

    if (!hasPlaces && hasStatusMessage && !isSuccessStatus) {
      return `
        <section class="section section--card" aria-labelledby="places-page-status-title">
          <div class="home-section-header home-section-header--compact">
            <h2 id="places-page-status-title" class="home-section-header__title">
              ${this.escapeHtml(this.t("places.header.title", "Places"))}
            </h2>
          </div>

          ${this.renderStatus()}
        </section>
      `;
    }

    if (!hasPlaces && isSuccessStatus) {
      return "";
    }

    const title = this.isBusinessPlan()
      ? this.t("places.header.businessTitle", "Manage your places with a clearer work view")
      : this.t("places.header.title", "Pridėkite vietas į BeSafe");

    const subtitle = this.isBusinessPlan()
      ? this.t(
          "places.header.businessSubtitle",
          "Saved places help connect records, receipts, and later comparisons without chaos."
        )
      : this.t(
          "places.header.subtitle",
          "Naudokite jas įrašams ir aiškesniems palyginimams."
        );

    return `
      <section class="section section--card" aria-labelledby="places-page-actions-title">
        <div class="home-section-header home-section-header--compact">

          <h2 id="places-page-actions-title" class="home-section-header__title">
            ${this.escapeHtml(title)}
          </h2>

          <p class="home-section-header__subtitle">
            ${this.escapeHtml(subtitle)}
          </p>
        </div>

        <div class="button-row">
          <button
            type="button"
            class="shortcut-btn button-secondary"
            data-places-action="open-create"
            ${this.isSaving ? "disabled" : ""}
          >
            ${this.escapeHtml(this.t("places.actions.add", "Add place"))}
          </button>
        </div>

        ${!this.isCreateOpen ? this.renderStatus() : ""}
      </section>
    `;
  }

  renderContent() {
    return `
      ${!this.currentPlaces.length ? this.renderPlanSummary() : ""}
      ${this.isCreateOpen ? this.renderCreateForm() : ""}
      ${!this.isCreateOpen ? this.renderSuccessSummary() : ""}
      ${this.currentPlaces.length ? this.renderPlacesList() : this.renderEmptyState()}
    `;
  }

  async render() {
    const places = await this.loadPlaces();

    this.currentPlaces = places;

    return `
      <section class="page-places">
        ${this.renderHeader()}
        ${this.renderContent()}
      </section>
    `;
  }

  async refresh() {
    const pageRoot = this.getPageRoot();
    if (!pageRoot) return;

    pageRoot.innerHTML = await this.render();
  }

  async handleDeletePlace(placeId) {
    const id = this.normalizeText(placeId);
    if (!id) {
      this.lastSuccessAction = "";
      this.setStatus(
        "error",
        this.t(
          "places.status.deleteFailed",
          "Could not remove the place right now."
        )
      );
      await this.refresh();
      return;
    }

    const confirmed = window.confirm(
      this.t(
        "places.confirm.delete",
        "Are you sure you want to remove this place?"
      )
    );

    if (!confirmed) {
      return;
    }

    this.isDeletingPlaceId = id;
    this.lastSuccessAction = "";
    this.setStatus(
      "info",
      this.t("places.status.deleting", "Removing place…")
    );
    await this.refresh();

    try {
      await this.deletePlace(id);

      if (this.lastCreatedPlaceId === id) {
        this.lastCreatedPlaceId = "";
      }

      this.isDeletingPlaceId = "";
      this.lastSuccessAction = "delete-place";
      this.setStatus(
        "success",
        this.t("places.status.deleted", "Place removed.")
      );
      await this.refresh();
    } catch (error) {
      console.error("[PlacesPage] Failed to delete place:", error);
      this.isDeletingPlaceId = "";
      this.lastSuccessAction = "";
      this.setStatus(
        "error",
        error?.message ||
          this.t(
            "places.status.deleteFailed",
            "Could not remove the place right now."
          )
      );
      await this.refresh();
    }
  }

  validatePlaceDraft(draft = this.formDraft) {
    const name = this.normalizeText(draft?.name);
    const type = this.normalizePlaceType(draft?.type);

    if (!name) {
      return this.t(
        "places.validation.nameRequired",
        "Please add a place name."
      );
    }

    if (!type) {
      return this.t(
        "places.validation.typeRequired",
        "Please choose a place type."
      );
    }

    const comparableName = this.normalizeComparableText(name);

    const duplicatePlace = this.currentPlaces.find((place) => {
      const existingName = this.normalizeComparableText(place?.name || "");
      const existingType = this.normalizePlaceType(place?.type);
      return existingName === comparableName && existingType === type;
    });

    if (duplicatePlace) {
      return this.t(
        "places.validation.duplicate",
        "This place already exists."
      );
    }

    return "";
  }

  getFormValues(form) {
    const formData = new FormData(form);
    return {
      name: this.normalizeText(formData.get("name")),
      type: this.normalizeText(formData.get("type")),
      note: this.normalizeText(formData.get("note")),
      purpose:
        this.normalizeText(formData.get("purpose")).toLowerCase() ||
        "expense",
    };
  }

  async handlePlaceSubmit(form) {
    const formData = new FormData(form);

    const values = {
      name: this.normalizeText(formData.get("name")),
      type: this.normalizeText(formData.get("type")),
      note: this.normalizeText(formData.get("note")),
      purpose:
        this.normalizeText(formData.get("purpose")).toLowerCase() ||
        "expense",
    };

    this.updateDraft(values);

    const validationMessage = this.validatePlaceDraft(this.formDraft);
    if (validationMessage) {
      this.lastSuccessAction = "";
      this.setStatus("error", validationMessage);
      await this.refresh();
      return;
    }

    const payload = {
      name: this.formDraft.name,
      type: this.formDraft.type,
      note: this.formDraft.note,
      purpose:
        this.normalizeText(this.formDraft.purpose).toLowerCase() || "expense",
    };

    console.log("[PlacesPage][handlePlaceSubmit values]", values);
    console.log("[PlacesPage][handlePlaceSubmit payload]", payload);

    this.isSaving = true;
    this.lastSuccessAction = "";
    this.setStatus("info", this.t("places.status.saving", "Saving place…"));
    await this.refresh();

    try {
      const createdPlace = await this.createPlace(payload);
      const normalizedPlace = this.normalizePlace(createdPlace);

      this.lastCreatedPlaceId = normalizedPlace.id || "";
      this.isSaving = false;
      this.isCreateOpen = false;
      this.resetDraft();
      this.lastSuccessAction = "create-place";
      this.setStatus("success", this.t("places.status.saved", "Place saved."));
      await this.refresh();
    } catch (error) {
      console.error("[PlacesPage] Failed to save place:", error);
      this.isSaving = false;
      this.lastSuccessAction = "";
      this.setStatus(
        "error",
        error?.message ||
          this.t(
            "places.status.saveFailed",
            "Could not save the place right now."
          )
      );
      await this.refresh();
    }
  }

  async handleClick(event) {
    const actionButton = event.target.closest("[data-places-action]");
    if (!actionButton) {
      return;
    }

    const action = this.normalizeText(actionButton.dataset.placesAction);

    if (action === "open-create") {
      this.isCreateOpen = true;
      this.lastSuccessAction = "";
      this.setStatus("idle", "");
      await this.refresh();
      return;
    }

    if (action === "cancel-create") {
      this.isCreateOpen = false;
      this.resetDraft();
      this.lastSuccessAction = "";
      this.setStatus("idle", "");
      await this.refresh();
      return;
    }

    if (action === "delete-place") {
      const placeId = this.normalizeText(actionButton.dataset.placeId);
      await this.handleDeletePlace(placeId);
    }
  }

  async handleSubmit(event) {
    event.preventDefault();

    const form = event.target;
    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    if (form.id === "places-create-form") {
      await this.handlePlaceSubmit(form);
    }
  }

  async init() {
    const pageRoot = this.getPageRoot();
    if (!pageRoot) {
      return;
    }

    pageRoot.removeEventListener("click", this.handleClick);
    pageRoot.removeEventListener("submit", this.handleSubmit);

    pageRoot.addEventListener("click", this.handleClick);
    pageRoot.addEventListener("submit", this.handleSubmit);

    await this.refresh();
  }

  destroy() {
    const pageRoot = this.getPageRoot();
    if (!pageRoot) {
      return;
    }

    pageRoot.removeEventListener("click", this.handleClick);
    pageRoot.removeEventListener("submit", this.handleSubmit);
  }
}