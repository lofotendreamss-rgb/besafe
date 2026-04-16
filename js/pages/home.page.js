import { createTranslator, getCurrentLanguage } from "../core/i18n.js";
import { renderHomeDashboard } from "../ui/dashboard/home.dashboard.js";
import { QuickActions } from "../ui/dashboard/quickActions.js";

const HOME_INTRO_SESSION_KEY = "besafe:home-intro-played";

function getUserPlan() {
  try {
    return localStorage.getItem("besafe:user-plan") || "personal";
  } catch (_e) {
    return "personal";
  }
}

export class HomePage {
  constructor({ financialEngine, transactionService } = {}) {
    this.financialEngine = financialEngine;
    this.transactionService = transactionService;

    this.quickActions = new QuickActions();
    this.isUpdating = false;
    this.homeIntroMarked = false;

    this.userPlan = this.normalizePlan(getUserPlan());

    this.boundTransactionCreated = this.handleTransactionCreated.bind(this);
    this.boundTransactionUpdated = this.handleTransactionUpdated.bind(this);
    this.boundTransactionDeleted = this.handleTransactionDeleted.bind(this);
    this.boundHomeRefreshRequested = this.handleHomeRefreshRequested.bind(this);
    this.boundReceiptScannerRequested =
      this.handleReceiptScannerRequested.bind(this);
    this.handlePlanSwitchClick = this.handlePlanSwitchClick.bind(this);
  }

  normalizePlan(plan) {
    return String(plan || "").trim().toLowerCase() === "business"
      ? "business"
      : "personal";
  }

  setPlan(plan) {
    this.userPlan = this.normalizePlan(plan);
  }

  syncPlan() {
    this.userPlan = this.normalizePlan(this.userPlan || getUserPlan());
    return this.userPlan;
  }

  isBusinessPlan() {
    return this.userPlan === "business";
  }

  async onBeforeEnter() {
    this.syncPlan();
    return true;
  }

  t(key, fallback) {
    try {
      const translator = createTranslator(getCurrentLanguage());
      if (typeof translator === "function") {
        const value = translator(key, fallback);
        return typeof value === "string" && value.trim() ? value : fallback;
      }
    } catch (_error) {}

    return fallback;
  }

  escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  getPageRoot() {
    return document.getElementById("page-home");
  }

  isHomeActive() {
    const pageRoot = this.getPageRoot();
    if (!pageRoot) return false;
    if (pageRoot.hidden) return false;
    return !pageRoot.closest("[hidden]");
  }

  async refreshIfActive() {
    if (!this.isHomeActive()) return false;
    await this.update();
    return true;
  }

  hasPlayedHomeIntro() {
    try {
      return window.sessionStorage.getItem(HOME_INTRO_SESSION_KEY) === "1";
    } catch (_error) {
      return this.homeIntroMarked;
    }
  }

  markHomeIntroPlayed() {
    this.homeIntroMarked = true;
    try {
      window.sessionStorage.setItem(HOME_INTRO_SESSION_KEY, "1");
    } catch (_error) {}
  }

  getHomeIntroElements(pageRoot) {
    if (!pageRoot) {
      return { title: null, subtitle: null };
    }

    return {
      title: pageRoot.querySelector(
        ".app-header .home-section-header__title"
      ),
      subtitle: pageRoot.querySelector(
        ".app-header .home-section-header__subtitle"
      ),
    };
  }

  applyHomeIntroFinalState(pageRoot) {
    const { title, subtitle } = this.getHomeIntroElements(pageRoot);

    if (title) {
      title.style.animation = "none";
      title.style.width = "auto";
      title.style.opacity = "1";
      title.style.transform = "none";
      title.style.overflow = "visible";
      title.style.whiteSpace = "normal";
    }

    if (subtitle) {
      subtitle.style.animation = "none";
      subtitle.style.opacity = "1";
      subtitle.style.transform = "none";
    }
  }

  scheduleHomeIntroMark(pageRoot) {
    if (!pageRoot || this.hasPlayedHomeIntro()) return;

    window.setTimeout(() => {
      if (!this.isHomeActive()) return;
      this.markHomeIntroPlayed();
    }, 5600);
  }

  syncHomeIntroState(pageRoot) {
    if (!pageRoot) return;

    if (this.hasPlayedHomeIntro()) {
      this.applyHomeIntroFinalState(pageRoot);
      return;
    }

    this.scheduleHomeIntroMark(pageRoot);
  }

  renderErrorState(message) {
    const eyebrow = this.t("home.error.eyebrow", "BeSafe");
    const title = this.t(
      "home.error.title",
      "We could not show your financial overview right now"
    );
    const safeMessage =
      message ||
      this.t(
        "home.error.message",
        "The financial overview is not available right now."
      );
    const supportText = this.t(
      "home.error.support",
      "When the connection is available again, we can calmly return to a clear overview and one next step."
    );

    return `
      <section class="page-home">
        <div class="section">
          <div class="home-section-header home-section-header--compact">
            <p class="home-section-header__eyebrow">${this.escapeHtml(
              eyebrow
            )}</p>
            <h2 class="home-section-header__title">${this.escapeHtml(
              title
            )}</h2>
            <p class="home-section-header__subtitle">
              ${this.escapeHtml(safeMessage)}
            </p>
            <p class="home-section-header__subtitle">
              ${this.escapeHtml(supportText)}
            </p>
          </div>
        </div>
      </section>
    `;
  }

  async getSummary() {
    if (
      !this.financialEngine ||
      typeof this.financialEngine.getSummary !== "function"
    ) {
      throw new Error(
        this.t(
          "home.error.summaryServiceMissing",
          "The financial overview service is not available right now."
        )
      );
    }

    const summary = await this.financialEngine.getSummary();
    return summary && typeof summary === "object" ? summary : {};
  }

  buildRenderSummary(summary) {
    const safeSummary =
      summary && typeof summary === "object" ? { ...summary } : {};

    const isBusiness = this.isBusinessPlan();

    safeSummary.plan = this.userPlan;
    safeSummary.isBusinessPlan = isBusiness;

    safeSummary.homeMode = isBusiness ? "business" : "personal";

    safeSummary.ui = {
      showAdvancedSignals: isBusiness,
      showCalmOverview: true,
      showBusinessContext:
        isBusiness && Boolean(summary?.income || summary?.expenses),
    };

    const expensePlaces = Array.isArray(summary?.expensePlaces)
      ? summary.expensePlaces
      : [];

    if (expensePlaces.length > 0) {
      const topPlace = expensePlaces[0];

      safeSummary.topExpensePlaceName =
        topPlace?.name ||
        topPlace?.placeName ||
        topPlace?.storeName ||
        "";
    } else {
      safeSummary.topExpensePlaceName = "";
    }

    return safeSummary;
  }

  async render() {
    try {
      this.syncPlan();

      const summary = await this.getSummary();
      const renderSummary = this.buildRenderSummary(summary);

      return `
        <section class="page-home">
          <div class="section">
            <div class="button-row">
              <div
                class="plan-switch-group"
                role="group"
                aria-label="${this.escapeHtml(
                  this.t("home.planSwitch.groupLabel", "Choose plan")
                )}"
              >
                <div class="plan-switch">
                  <button
                    type="button"
                    class="plan-switch__option ${
                      this.isBusinessPlan() ? "" : "is-active"
                    }"
                    data-plan-switch-option="personal"
                    aria-pressed="${this.isBusinessPlan() ? "false" : "true"}"
                  >
                    ${this.escapeHtml(
                      this.t("plan.label.personal", "Personal")
                    )}
                  </button>

                  <button
                    type="button"
                    class="plan-switch__option ${
                      this.isBusinessPlan() ? "is-active" : ""
                    }"
                    data-plan-switch-option="business"
                    aria-pressed="${this.isBusinessPlan() ? "true" : "false"}"
                  >
                    ${this.escapeHtml(
                      this.t("plan.label.business", "Business")
                    )}
                  </button>
                </div>

                <span class="plan-switch__sr">
                  ${this.escapeHtml(
                    this.isBusinessPlan()
                      ? this.t("plan.current.business", "Business plan active")
                      : this.t("plan.current.personal", "Personal plan active")
                  )}
                </span>
              </div>
            </div>
          </div>

          ${renderHomeDashboard(renderSummary)}
        </section>
      `;
    } catch (error) {
      console.error("[HomePage] render failed:", error);

      return this.renderErrorState(
        error?.message ||
          this.t(
            "home.error.renderFailed",
            "We could not show your financial overview right now."
          )
      );
    }
  }

  addEventListeners() {
    this.removeEventListeners();

    document.addEventListener(
      "transaction:created",
      this.boundTransactionCreated
    );
    document.addEventListener(
      "transaction:updated",
      this.boundTransactionUpdated
    );
    document.addEventListener(
      "transaction:deleted",
      this.boundTransactionDeleted
    );

    window.addEventListener(
      "besafe:home-refresh-requested",
      this.boundHomeRefreshRequested
    );
    window.addEventListener(
      "besafe:receipt-scanner-requested",
      this.boundReceiptScannerRequested
    );

    document.addEventListener("click", this.handlePlanSwitchClick);
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
      "besafe:home-refresh-requested",
      this.boundHomeRefreshRequested
    );
    window.removeEventListener(
      "besafe:receipt-scanner-requested",
      this.boundReceiptScannerRequested
    );

    document.removeEventListener("click", this.handlePlanSwitchClick);
  }

  async onAfterEnter() {
    this.syncPlan();

    const pageRoot = this.getPageRoot();
    if (pageRoot) {
      this.bindQuickActions(pageRoot);
      this.syncHomeIntroState(pageRoot);
    }

    this.addEventListeners();

    // Load AI insights into the dashboard
    this.loadInsights();
  }

  async loadInsights() {
    const container = document.getElementById("besafe-insights");
    if (!container) return;

    try {
      const api = window.__besafe;
      if (!api) return;

      const [insights, scoreResult, alerts] = await Promise.all([
        api.getFinancialInsights(),
        api.getFinancialScore(),
        api.getSpendingAlerts()
      ]);

      let html = "";

      // Financial health score
      if (scoreResult && scoreResult.score !== null) {
        const score = scoreResult.score;
        const color = score >= 75 ? "#9ae6c1" : score >= 50 ? "#e8c547" : "#e7a99a";
        html += `
          <div class="insight-card insight-card--score">
            <div class="insight-score" style="color:${color}; font-size:28px; font-weight:bold;">
              ${score}/100
            </div>
            <div class="insight-label">${this.escapeHtml(
              this.t("home.insights.score", "Financial Health")
            )}</div>
          </div>
        `;
      }

      // Advisor insights (translated via i18n when possible)
      if (insights && insights.length > 0) {
        insights.forEach(item => {
          if (!item.observation) return;
          const toneClass = item.tone === "attention" ? "insight-card--attention"
            : item.tone === "stable" ? "insight-card--stable"
            : "insight-card--neutral";

          let obs = item.observation;
          let exp = item.explanation || "";
          let sug = item.suggestion || "";

          // Translate advisor insights based on type/status
          const status = item.type || "";
          if (status === "score" && item.status) {
            // Financial health score insight
            exp = this.t("advisor.status.health." + item.status, exp);
          } else if (status === "not_enough_data" || status === "early_data" || status === "attention" || status === "stable" || status === "balanced") {
            obs = this.t("advisor.status." + status + ".obs", obs);
            sug = this.t("advisor.status." + status + ".sug", sug);
            // Keep explanation as-is when it contains dynamic amounts (€)
            if (exp && !exp.includes("€")) {
              exp = this.t("advisor.status." + status + ".exp", exp);
            }
          } else if (status === "unclear_category") {
            obs = this.t("advisor.status.category.obs", obs);
            exp = this.t("advisor.status.category.exp", exp);
          }

          html += `
            <div class="insight-card ${toneClass}">
              <div class="insight-observation">${this.escapeHtml(obs)}</div>
              ${exp ? `<div class="insight-explanation">${this.escapeHtml(exp)}</div>` : ""}
              ${sug ? `<div class="insight-suggestion">${this.escapeHtml(sug)}</div>` : ""}
            </div>
          `;
        });
      }

      // Spending alerts (translated via i18n when possible)
      if (alerts && alerts.length > 0) {
        alerts.forEach(alert => {
          if (!alert.observation) return;

          let alertObs = alert.observation;
          let alertSug = alert.suggestion || "";
          const alertStatus = alert.type || "";

          if (alertStatus === "not_enough_data" || alertStatus === "early_data" || alertStatus === "attention" || alertStatus === "stable" || alertStatus === "balanced") {
            alertObs = this.t("advisor.status." + alertStatus + ".obs", alertObs);
            alertSug = this.t("advisor.status." + alertStatus + ".sug", alertSug);
          }

          html += `
            <div class="insight-card insight-card--alert">
              <div class="insight-observation">${this.escapeHtml(alertObs)}</div>
              ${alertSug ? `<div class="insight-suggestion">${this.escapeHtml(alertSug)}</div>` : ""}
            </div>
          `;
        });
      }

      if (!html) {
        html = `<div class="insight-card insight-card--neutral">
          <div class="insight-observation">${this.escapeHtml(
            this.t("home.insights.noData", "Add your first entries to see insights here.")
          )}</div>
        </div>`;
      }

      container.innerHTML = html;

      // Also trigger the old-style AI insight renderer
      if (window.__besafe) {
        window.__besafe.triggerAIInsightRender();
      }

    } catch (error) {
      console.warn("[HomePage] Failed to load insights:", error);
      container.innerHTML = "";
    }
  }

  async onLeave() {
    this.quickActions.unmount();
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
    await this.refreshIfActive();
  }

  async handleHomeRefreshRequested() {
    await this.refreshIfActive();
  }

  async handlePlanSwitchClick(event) {
    const target = event.target.closest("[data-plan-switch-option]");
    if (!target) return;

    const nextPlan = this.normalizePlan(
      target.getAttribute("data-plan-switch-option")
    );

    if (nextPlan === this.userPlan) return;

    try {
      localStorage.setItem("besafe:user-plan", nextPlan);
    } catch (_error) {}

    this.setPlan(nextPlan);
    await this.refreshIfActive();
  }

  async handleReceiptScannerRequested() {
    window.dispatchEvent(
      new CustomEvent("besafe:receipt-review-requested", {
        detail: {
          source: "home-page",
          mode: "mvp",
          capture: "pending",
          message: this.t(
            "receiptScanner.reviewRequestMessage",
            "BeSafe can help collect the main receipt details. You review and confirm them before saving."
          ),
        },
      })
    );
  }

  async navigateToTransactions() {
    try {
      if (window.__app?.navigation?.navigate) {
        await window.__app.navigation.navigate("transactions");
        return true;
      }

      if (window.app?.navigation?.navigate) {
        await window.app.navigation.navigate("transactions");
        return true;
      }

      if (window.navigationController?.navigate) {
        await window.navigationController.navigate("transactions");
        return true;
      }

      window.location.hash = "#transactions";
      return true;
    } catch (error) {
      console.warn("[HomePage] Failed to navigate:", error);
      return false;
    }
  }

  shouldNavigateToTransactions(payload) {
    if (!payload || typeof payload !== "object") return false;

    return (
      payload.action === "receipt" || payload.meta?.entryPoint === "receipt"
    );
  }

  normalizePlaceContext(payload) {
    const source = payload && typeof payload === "object" ? payload : {};
    const meta =
      source.meta && typeof source.meta === "object" ? { ...source.meta } : {};
    const receipt =
      source.receipt && typeof source.receipt === "object"
        ? { ...source.receipt }
        : {};

    const placeId = source.placeId || receipt.placeId || "";

    const placeName =
      source.placeName || meta.placeName || receipt.storeName || "";

    const normalized = { ...source, meta };

    if (placeId) {
      normalized.placeId = placeId;
      normalized.meta.placeId = placeId;
    }

    if (placeName) {
      normalized.placeName = placeName;
      normalized.meta.placeName = placeName;
    }

    if (Object.keys(receipt).length) {
      normalized.receipt = {
        ...receipt,
        ...(placeId ? { placeId } : {}),
        ...(placeName && !receipt.storeName ? { storeName: placeName } : {}),
      };
    }

    return normalized;
  }

  async createTransaction(payload) {
    if (!this.transactionService) {
      throw new Error("Transaction service missing");
    }

    if (this.transactionService.createTransaction) {
      return this.transactionService.createTransaction(payload);
    }

    if (payload.type === "expense") {
      return this.transactionService.addExpense(payload);
    }

    if (payload.type === "income") {
      return this.transactionService.addIncome(payload);
    }

    throw new Error("No valid save path");
  }

  notifyTransactionCreated(record, payload = {}) {
    const detail = {
      record,
      payload,
      source: "home-quick-actions",
    };

    document.dispatchEvent(new CustomEvent("transaction:created", { detail }));

    window.dispatchEvent(
      new CustomEvent("besafe:home-refresh-requested", { detail })
    );
  }

  async submitQuickAction(payload) {
    const normalized = this.normalizePlaceContext(payload);
    const record = await this.createTransaction(normalized);

    this.notifyTransactionCreated(record, normalized);

    if (this.shouldNavigateToTransactions(normalized)) {
      await this.navigateToTransactions();
    }

    return record;
  }

  bindQuickActions(pageRoot) {
    const root = pageRoot.querySelector("#quickActions");
    if (!root) return;

    this.syncPlan();

    this.quickActions.unmount();
    this.quickActions.mount(root);
    this.quickActions.setPlan(this.userPlan);
    this.quickActions.setSubmitHandler((payload) =>
      this.submitQuickAction(payload)
    );
  }

  async update() {
    if (this.isUpdating) return;

    const root = this.getPageRoot();
    if (!root) return;

    this.isUpdating = true;

    try {
      this.syncPlan();
      this.quickActions.unmount();
      root.innerHTML = await this.render();
      this.bindQuickActions(root);
      this.syncHomeIntroState(root);
      this.loadInsights();
    } finally {
      this.isUpdating = false;
    }
  }
}