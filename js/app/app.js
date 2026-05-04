import { bootSystem } from "../core/system.boot.js";
import { NavigationController } from "../core/navigation.controller.js";
import { registry } from "../core/service.registry.js";
import {
  createTranslator,
  getCurrentLanguage,
  setCurrentLanguage,
  getSupportedLanguages,
} from "../core/i18n.js";
import { getUserPlan } from "../services/finance/user-plan.js";

// License checker — auto-runs on import, checks every 24h
import "../core/license.checker.js";

// Services connector — wires disconnected AI + Finance services
import { initConnectedServices, getFinancialInsights, getFinancialScore, getSpendingAlerts, triggerAIInsightRender } from "../core/services.connector.js";

class App {
  constructor() {
    this.started = false;
    this.starting = false;

    this.navigation = null;
    this.homePage = null;
    this.transactionsPage = null;
    this.advisorPage = null;
    this.reportsPage = null;
    this.placesPage = null;
    this.categoriesPage = null;
    this.settingsPage = null;

    this.boundGlobalClick = this.handleGlobalClick.bind(this);

    this.supportedLanguages = getSupportedLanguages();

    // Global error boundary — wired synchronously in constructor (earliest
    // possible, before any async work) so setup itself cannot fail silently.
    this.setupGlobalErrorHandlers();
  }

  t(key, fallback, variables) {
    try {
      const translator = createTranslator(getCurrentLanguage());
      const value = translator(key, fallback, variables);
      return typeof value === "string" && value.trim() ? value : fallback;
    } catch (_error) {
      return fallback;
    }
  }

  escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  getCurrentPlan() {
    return getUserPlan();
  }

  async init() {
    try {
      await bootSystem();
      window.__services = registry;

      // Connect disconnected AI + Finance services
      await initConnectedServices();
    } catch (error) {
      console.error("[App] bootSystem failed:", error);
      this.renderFatalError(
        this.t(
          "app.error.boot.message",
          "The system could not start right now. We can calmly check the connection, imports, and one clear next step."
        )
      );
      return;
    }

    document.removeEventListener("click", this.boundGlobalClick);
    document.addEventListener("click", this.boundGlobalClick);

    // Ar vartotojas jau paspaudė „Pradėti" kol bootSystem krovėsi?
    if (window.__besafe_splash_done) {
      const lang = window.__besafe_splash_done;
      window.__besafe_splash_done = null;
      await this.startApp(lang);
      return;
    }

    // Klausomės ar vartotojas paspaus „Pradėti" ateityje
    this.initSplashScreen();
    this.showLanguageScreen();
  }

  _startSplashTypewriter() {
    setTimeout(() => {
      // Pirmiausia bandome is-visible, jei nėra — imame lt frazę
      let phrase = document.querySelector(".splash__phrase.is-visible");
      if (!phrase) {
        phrase = document.querySelector('.splash__phrase[data-splash-lang="lt"]');
        if (phrase) phrase.classList.add("is-visible");
      }
      if (!phrase) return;

      const text = phrase.dataset.text || "";
      if (!text) return;

      phrase.textContent = "";
      const cursor = document.createElement("span");
      cursor.className = "splash__cursor";
      phrase.appendChild(cursor);

      let i = 0;
      const interval = setInterval(() => {
        if (i < text.length) {
          cursor.before(text[i]);
          i++;
        } else {
          clearInterval(interval);
          // Kursorius mirksi 1s, tada išnyksta
          setTimeout(() => {
            cursor.classList.add("splash__cursor--hidden");
            setTimeout(() => cursor.remove(), 300);
          }, 1000);
        }
      }, 120);
    }, 500);
  }

  initSplashScreen() {
    // Stebime global flag — kas 200ms tikriname ar vartotojas paspaudė „Pradėti"
    const checkSplash = setInterval(async () => {
      if (window.__besafe_splash_done) {
        clearInterval(checkSplash);
        const lang = window.__besafe_splash_done;
        window.__besafe_splash_done = null;

        try {
          await this.startApp(lang);
        } catch (error) {
          console.error("[App] startApp failed:", error);
          const splashRoot = document.getElementById("splash-root");
          if (splashRoot) splashRoot.style.opacity = "1";
          const startBtn = document.getElementById("splash-start");
          if (startBtn) startBtn.disabled = false;
        }
      }
    }, 200);
  }

  _updateSplashLang(lang) {
    // Rodyti tik aktyvios kalbos elementus
    document.querySelectorAll("[data-splash-lang]").forEach((el) => {
      el.classList.toggle("is-visible", el.dataset.splashLang === lang);
    });
  }

  isSupportedLanguage(lang) {
    return this.supportedLanguages.includes(lang);
  }

  normalizeLanguage(lang) {
    const normalized = String(lang || "")
      .trim()
      .toLowerCase()
      .replaceAll("_", "-");

    if (!normalized) {
      return null;
    }

    if (this.isSupportedLanguage(normalized)) {
      return normalized;
    }

    const baseLanguage = normalized.split("-")[0];
    return this.isSupportedLanguage(baseLanguage) ? baseLanguage : null;
  }

  readLegacyLanguage() {
    try {
      return this.normalizeLanguage(localStorage.getItem("besafe_lang"));
    } catch (error) {
      console.warn("[App] Failed to read besafe_lang:", error);
      return null;
    }
  }

  readCoreLanguage() {
    try {
      return this.normalizeLanguage(getCurrentLanguage());
    } catch (error) {
      console.warn("[App] Failed to read core language:", error);
      return null;
    }
  }

  readDocumentLanguage() {
    try {
      return this.normalizeLanguage(document.documentElement.lang);
    } catch (error) {
      console.warn("[App] Failed to read document language:", error);
      return null;
    }
  }

  syncLanguageState(lang) {
    const normalized = this.normalizeLanguage(lang);
    if (!normalized) return null;

    try {
      localStorage.setItem("besafe_lang", normalized);
    } catch (error) {
      console.warn("[App] Failed to sync besafe_lang:", error);
    }

    try {
      const wasSaved = setCurrentLanguage(normalized);
      if (!wasSaved) {
        console.warn("[App] setCurrentLanguage rejected:", normalized);
      }
    } catch (error) {
      console.warn("[App] Failed to sync core language:", error);
    }

    try {
      document.documentElement.lang = normalized;
    } catch (error) {
      console.warn("[App] Failed to sync document lang:", error);
    }

    return normalized;
  }

  getSavedLanguage() {
    try {
      const legacyLang = this.readLegacyLanguage();
      const coreLang = this.readCoreLanguage();
      const documentLang = this.readDocumentLanguage();

      const resolvedLang = legacyLang || coreLang || documentLang;

      if (!resolvedLang) {
        return null;
      }

      this.syncLanguageState(resolvedLang);
      return resolvedLang;
    } catch (error) {
      console.warn("[App] Failed to read saved language:", error);
      return null;
    }
  }

  async handleGlobalClick(event) {
    const langButton = event.target.closest("[data-lang]");
    if (!langButton) return;

    // Splash ekrano mygtukai tvarkomi atskirai per initSplashScreen
    if (langButton.closest(".splash")) return;

    event.preventDefault();

    const lang = this.normalizeLanguage(langButton.dataset.lang);
    if (!lang) return;

    try {
      await this.startApp(lang);
    } catch (error) {
      console.error("[App] Language start failed:", error);
      this.started = false;
      this.starting = false;
      this.renderFatalError(
        this.t(
          "app.error.language.message",
          "Could not continue after language selection right now. We can calmly check where this step stopped."
        )
      );
    }
  }

  async initCoreModules() {
    if (this.navigation) {
      return;
    }

    const [
      homeModule,
      transactionsModule,
      advisorModule,
      reportsModule,
      placesModule,
      categoriesModule,
      settingsModule,
    ] = await Promise.all([
      import("../pages/home.page.js"),
      import("../pages/transactions.page.js"),
      import("../pages/advisor.page.js"),
      import("../pages/reports.page.js"),
      import("../pages/places.page.js"),
      import("../pages/categories.page.js"),
      import("../pages/settings.page.js"),
    ]);

    const { HomePage } = homeModule;
    const { TransactionsPage } = transactionsModule;
    const { initAdvisorPage } = advisorModule;
    const { ReportsPage } = reportsModule;
    const { PlacesPage } = placesModule;
    const { initCategoriesPage } = categoriesModule;
    const { SettingsPage } = settingsModule;

    if (typeof HomePage !== "function") {
      throw new Error("HomePage export is invalid");
    }

    if (typeof TransactionsPage !== "function") {
      throw new Error("TransactionsPage export is invalid");
    }

    if (typeof initAdvisorPage !== "function") {
      throw new Error("initAdvisorPage export is invalid");
    }

    if (typeof ReportsPage !== "function") {
      throw new Error("ReportsPage export is invalid");
    }

    if (typeof PlacesPage !== "function") {
      throw new Error("PlacesPage export is invalid");
    }

    if (typeof initCategoriesPage !== "function") {
      throw new Error("initCategoriesPage export is invalid");
    }

    if (typeof SettingsPage !== "function") {
      throw new Error("SettingsPage export is invalid");
    }

    const transactionService = registry.get("transactions");
    const financialEngine = registry.get("finance");
    const aiAdvisor =
      registry.getOptional("advisor") || registry.getOptional("ai");
    const eventBus = registry.getOptional("eventBus");

    this.navigation = new NavigationController({ eventBus });
    this.navigation.init();

    this.homePage = new HomePage({
      financialEngine,
      transactionService,
    });

    // Prijungti QuickActions išsaugojimo handler prie transactionService.
    // Bandome iš karto, o jei quickActions dar nėra — klausome įvykio.
    this._bindQuickActionsSubmitHandler(transactionService);

    this.transactionsPage = new TransactionsPage({
      transactionService,
    });

    this.advisorPage = initAdvisorPage({
      transactionService,
      aiAdvisor,
      services: {
        transactionService,
        financialEngine,
        aiAdvisor,
        eventBus,
      },
    });

    this.reportsPage = new ReportsPage({
      financialEngine,
    });

    this.placesPage = new PlacesPage();

    const currentPlan = this.getCurrentPlan();
    this.placesPage.setPlan(currentPlan);

    this.navigation.registerPage("home", this.homePage);
    this.navigation.registerPage("transactions", this.transactionsPage);
    this.navigation.registerPage("advisor", this.advisorPage);
    this.navigation.registerPage("reports", this.reportsPage);
    this.navigation.registerPage("places", this.placesPage);

        this.categoriesPage = initCategoriesPage({
          transactionService,
          services: {
            transactionService,
            eventBus,
          },
        });

        this.navigation.registerPage("categories", this.categoriesPage);

        this.settingsPage = new SettingsPage();
        this.navigation.registerPage("settings", this.settingsPage);
      }

      getPreferredStartPage() {
        if (
          this.navigation &&
          typeof this.navigation.getPreferredStartPage === "function"
        ) {
          return this.navigation.getPreferredStartPage("home");
        }

        return "home";
      }

  _bindQuickActionsSubmitHandler(transactionService) {
    const handler = async (payload) => {
      await transactionService.createTransaction(payload);

      // Atnaujinti transakcijų puslapį jei jis aktyvus
      if (
        this.transactionsPage &&
        typeof this.transactionsPage.requestRefresh === "function"
      ) {
        await this.transactionsPage.requestRefresh();
      }
    };

    // Bandome prijungti iš karto
    const qa = this.homePage?.quickActions;
    if (qa && typeof qa.setSubmitHandler === "function") {
      qa.setSubmitHandler(handler);
      return;
    }

    // Jei quickActions bus sukurtas vėliau — klausome įvykio
    window.addEventListener(
      "besafe:quick-actions-ready",
      (event) => {
        const quickActions = event?.detail?.quickActions || this.homePage?.quickActions;
        if (quickActions && typeof quickActions.setSubmitHandler === "function") {
          quickActions.setSubmitHandler(handler);
        }
      },
      { once: true }
    );
  }

  async rerenderActivePage() {
    if (!this.navigation) return;

    const activePageName =
      this.navigation.currentPage?.name || this.getPreferredStartPage();

    this.navigation.hideAllPages();

    if (this.navigation.currentPage) {
      this.navigation.currentPage = null;
    }

    await this.navigation.navigate(activePageName);
  }

  async startApp(lang) {
    const normalizedLang = this.normalizeLanguage(lang);
    if (!normalizedLang) { console.error("[App] normalizeLanguage returned null for:", lang); return; }
    if (this.starting) { console.warn("[App] startApp skipped — already starting"); return; }

    this.starting = true;

    try {
      const activeLang = this.syncLanguageState(normalizedLang);

      if (!activeLang) {
        throw new Error(`Unsupported language: ${lang}`);
      }

      this.switchToAppScreen();

      await this.initCoreModules();

      const startPage = this.getPreferredStartPage();

      if (this.started) {
        await this.rerenderActivePage();
      } else {
        await this.navigation.navigate(startPage);
      }

      this.started = true;
    } catch (error) {
      this.started = false;
      console.error("[App] startApp failed:", error);
      this.renderFatalError(
        this.t(
          "app.error.start.message",
          "The app could not be shown right now. We can calmly check which layer is failing and continue from one clear next step."
        )
      );
    } finally {
      this.starting = false;
    }
  }

  showLanguageScreen() {
    const splashRoot = document.getElementById("splash-root");
    const langScreen = document.getElementById("language-screen");
    const appScreen = document.getElementById("app-screen");

    this.starting = false;

    if (splashRoot) {
      splashRoot.style.opacity = "1";
      splashRoot.hidden = false;
    }

    if (langScreen) {
      langScreen.hidden = false;
    }

    if (appScreen) {
      appScreen.hidden = true;
    }
  }

  switchToAppScreen() {
    const splashRoot = document.getElementById("splash-root");
    const langScreen = document.getElementById("language-screen");
    const appScreen = document.getElementById("app-screen");

    if (splashRoot) {
      splashRoot.style.transition = "opacity 0.5s ease";
      splashRoot.style.opacity = "0";
      setTimeout(() => { splashRoot.hidden = true; }, 500);
    }

    if (langScreen) {
      langScreen.hidden = true;
    }

    if (appScreen) {
      appScreen.hidden = false;
    }
  }

  setupGlobalErrorHandlers() {
    window.addEventListener("error", (event) => {
      console.error(
        "[GlobalError]",
        event.message,
        "| source:", event.filename,
        "| line:", event.lineno,
        event.error
      );
    });

    window.addEventListener("unhandledrejection", (event) => {
      console.error(
        "[UnhandledRejection]",
        event.reason instanceof Error ? event.reason.message : event.reason,
        event.reason
      );
    });
  }

  renderFatalError(message) {
    const appScreen = document.getElementById("app-screen");
    const langScreen = document.getElementById("language-screen");

    if (langScreen) {
      langScreen.hidden = true;
    }

    if (appScreen) {
      appScreen.hidden = false;
      appScreen.innerHTML = `
        <section class="page-error">
          <div class="section">
            <div class="home-section-header home-section-header--compact">
              <p class="home-section-header__eyebrow">${this.escapeHtml(
                this.t("app.brand", "BeSafe")
              )}</p>
              <h2 class="home-section-header__title">${this.escapeHtml(
                this.t("app.error.title", "BeSafe could not start right now")
              )}</h2>
              <p class="home-section-header__subtitle">${this.escapeHtml(
                message
              )}</p>
              <p class="home-section-header__subtitle">
                ${this.escapeHtml(
                  this.t(
                    "app.error.followUp",
                    "We can calmly check the console message and choose one clear next step."
                  )
                )}
              </p>
            </div>
          </div>
        </section>
      `;
    }
  }
}

const app = new App();
window.__app = app;

// Expose connector API globally for UI and old-style scripts
window.__besafe = {
  getFinancialInsights,
  getFinancialScore,
  getSpendingAlerts,
  triggerAIInsightRender
};

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      app.init();
    },
    { once: true }
  );
} else {
  app.init();
}
