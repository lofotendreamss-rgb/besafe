import {
  createTranslator,
  getCurrentLanguage,
  setCurrentLanguage,
  getSupportedLanguages,
} from "./i18n.js";

let isInitialized = false;
const ACTIVE_PAGE_KEY = "besafe_active_page";

function getSupportedLanguageSet() {
  try {
    const supported = getSupportedLanguages();
    if (Array.isArray(supported) && supported.length > 0) {
      return new Set(
        supported.map((lang) => String(lang).trim().toLowerCase())
      );
    }
  } catch (error) {
    console.warn("[Navigation] Failed to read supported languages:", error);
  }

  return new Set(["en"]);
}

function normalizeLanguage(candidate, supportedLanguages) {
  const value = String(candidate || "").trim().toLowerCase();
  if (!value) return "";
  return supportedLanguages.has(value) ? value : "";
}

function getActiveLanguage() {
  const supportedLanguages = getSupportedLanguageSet();

  try {
    const currentLanguage = normalizeLanguage(
      getCurrentLanguage(),
      supportedLanguages
    );
    if (currentLanguage) return currentLanguage;
  } catch (error) {
    console.warn("[Navigation] Failed to get current language from i18n:", error);
  }

  try {
    const primaryLanguage = normalizeLanguage(
      localStorage.getItem("besafe_lang"),
      supportedLanguages
    );
    if (primaryLanguage) return primaryLanguage;

    const legacyLanguage = normalizeLanguage(
      localStorage.getItem("besafe:language"),
      supportedLanguages
    );
    if (legacyLanguage) return legacyLanguage;
  } catch (error) {
    console.warn("[Navigation] Failed to read saved language:", error);
  }

  const documentLanguage = normalizeLanguage(
    document?.documentElement?.lang,
    supportedLanguages
  );
  if (documentLanguage) return documentLanguage;

  return supportedLanguages.has("en")
    ? "en"
    : Array.from(supportedLanguages)[0] || "en";
}

export class NavigationController {
  constructor({ eventBus } = {}) {
    this.eventBus = eventBus;
    this.currentPage = null;
    this.pages = new Map();
    this.isNavigating = false;

    this.boundClickHandler = this.handleClick.bind(this);
    this.boundLanguageRefreshHandler = this.handleLanguageRefresh.bind(this);
  }

  init() {
    if (isInitialized) return;
    isInitialized = true;

    document.removeEventListener("click", this.boundClickHandler, true);
    document.addEventListener("click", this.boundClickHandler, true);

    window.removeEventListener(
      "besafe:language-changed",
      this.boundLanguageRefreshHandler
    );
    window.removeEventListener(
      "language:changed",
      this.boundLanguageRefreshHandler
    );

    window.addEventListener(
      "besafe:language-changed",
      this.boundLanguageRefreshHandler
    );
    window.addEventListener(
      "language:changed",
      this.boundLanguageRefreshHandler
    );

    this.hideRemovedNavigationItems();
    this.refreshShellLanguage();
  }

  registerPage(name, pageInstance) {
    if (!name || !pageInstance) return;
    this.pages.set(name, pageInstance);
  }

  getTranslator() {
    return createTranslator(getActiveLanguage());
  }

  persistActivePage(pageName) {
    try {
      if (!pageName || pageName === "chat") return;
      sessionStorage.setItem(ACTIVE_PAGE_KEY, pageName);
    } catch (error) {
      console.warn("[Navigation] Failed to persist active page:", error);
    }
  }

  clearPersistedActivePage() {
    try {
      sessionStorage.removeItem(ACTIVE_PAGE_KEY);
    } catch (error) {
      console.warn("[Navigation] Failed to clear persisted active page:", error);
    }
  }

  getPersistedActivePage() {
    try {
      const value = String(sessionStorage.getItem(ACTIVE_PAGE_KEY) || "").trim();
      if (!value || value === "chat") return "";
      return value;
    } catch (error) {
      console.warn("[Navigation] Failed to read persisted active page:", error);
      return "";
    }
  }

  getPreferredStartPage(defaultPage = "home") {
    const persisted = this.getPersistedActivePage();
    if (persisted && this.pages.has(persisted)) {
      return persisted;
    }
    return defaultPage;
  }

  hideRemovedNavigationItems() {
    const chatNavItems = document.querySelectorAll('[data-nav="chat"]');
    chatNavItems.forEach((item) => {
      item.hidden = true;
      item.setAttribute("aria-hidden", "true");
      item.setAttribute("tabindex", "-1");
    });

    const chatPage = document.getElementById("page-chat");
    if (chatPage) {
      chatPage.hidden = true;
    }
  }

  getLanguageButtonLabel() {
    const t = this.getTranslator();
    const activeLanguage = getActiveLanguage();

    return t(
      "advisor.topActions.languageLabel",
      activeLanguage === "lt" ? "Kalba" : "Language"
    );
  }

  getLanguageButtonAria() {
    const t = this.getTranslator();
    const activeLanguage = getActiveLanguage();

    return t(
      "advisor.topActions.languageAria",
      activeLanguage === "lt"
        ? "Atidaryti kalbos pasirinkimą"
        : "Open language selection"
    );
  }

  refreshLanguageButtons() {
    const label = this.getLanguageButtonLabel();
    const aria = this.getLanguageButtonAria();
    const buttons = document.querySelectorAll("[data-open-language]");

    buttons.forEach((button) => {
      if (!(button instanceof HTMLElement)) return;

      const explicitLabelNode = button.querySelector("[data-language-label]");
      if (explicitLabelNode) {
        explicitLabelNode.textContent = label;
      } else {
        button.textContent = label;
      }

      button.setAttribute("aria-label", aria);
      button.setAttribute("title", label);
    });
  }

  refreshShellLanguage() {
    this.refreshLanguageButtons();

    if (this.currentPage?.name) {
      this.updatePageHeader(this.currentPage.name);
    }
  }

  handleLanguageRefresh() {
    this.refreshShellLanguage();
  }

  getPageTitle(pageName = "") {
    const t = this.getTranslator();

    const titleKeyByPage = {
      home: "app.home",
      transactions: "app.transactions",
      advisor: "app.advisor",
      reports: "app.reports",
      categories: "app.categories",
    };

    if (pageName === "places") {
      return "";
    }

    const titleKey = titleKeyByPage[pageName];
    if (titleKey) {
      return t(
        titleKey,
        pageName ? pageName.charAt(0).toUpperCase() + pageName.slice(1) : "BeSafe"
      );
    }

    return pageName
      ? pageName.charAt(0).toUpperCase() + pageName.slice(1)
      : t("app.brand", "BeSafe");
  }

  getPageSubtitle(pageName = "") {
    const t = this.getTranslator();

    const subtitleKeyByPage = {
      home: "app.subtitle.home",
      transactions: "app.subtitle.transactions",
      advisor: "app.subtitle.advisor",
      reports: "app.subtitle.reports",
      places: "places.header.subtitle",
      categories: "categories.header.subtitle",
    };

    if (pageName === "places") {
      return "";
    }

    const subtitleKey = subtitleKeyByPage[pageName];
    if (subtitleKey) {
      return t(
        subtitleKey,
        "Precise information, a calm tone, and one clear next step."
      );
    }

    return t(
      "language.screen.promise",
      "Precise information, a calm tone, and one clear next step."
    );
  }

  renderNavigationError(pageName, error) {
    const t = this.getTranslator();
    const safePageName =
      this.getPageTitle(pageName) || pageName || t("app.brand", "BeSafe");

    const title = t(
      "navigation.error.title",
      `Could not open the "${safePageName}" page right now`,
      { page: safePageName }
    );

    const description =
      error?.message ||
      t("navigation.error.description", "An unknown error occurred.");

    const followUp = t(
      "navigation.error.followUp",
      "We can calmly try again or choose one clear next step."
    );

    return `
      <section class="page-error">
        <div class="section">
          <div class="home-section-header home-section-header--compact">
            <p class="home-section-header__eyebrow">${t("app.brand", "BeSafe")}</p>
            <h2 class="home-section-header__title">${title}</h2>
            <p class="home-section-header__subtitle">${description}</p>
            <p class="home-section-header__subtitle">${followUp}</p>
          </div>
        </div>
      </section>
    `;
  }

  updateActiveNav(pageName) {
    const navItems = document.querySelectorAll("[data-nav]");

    navItems.forEach((item) => {
      const isActive = item.dataset.nav === pageName;

      item.classList.toggle("is-active", isActive);

      if (isActive) {
        item.setAttribute("aria-current", "page");
      } else {
        item.removeAttribute("aria-current");
      }
    });
  }

  updatePageHeader(pageName) {
    const titleEl = document.getElementById("page-title");
    const subtitleEl = document.getElementById("page-subtitle");

    const title = this.getPageTitle(pageName);
    const subtitle = this.getPageSubtitle(pageName);

    if (titleEl) {
      titleEl.innerText = title || "";
      titleEl.hidden = !title;
    }

    if (subtitleEl) {
      subtitleEl.innerText = subtitle || "";
      subtitleEl.hidden = !subtitle;
    }
  }

  getPageElement(pageName) {
    return document.getElementById(`page-${pageName}`);
  }

  isDynamicPageElement(pageEl) {
    return pageEl?.dataset?.dynamic === "true";
  }

  clearDynamicPageIfNeeded(pageRef) {
    if (pageRef?.el && this.isDynamicPageElement(pageRef.el)) {
      pageRef.el.innerHTML = "";
    }
  }

  async renderPage(pageInstance, pageEl) {
    if (!this.isDynamicPageElement(pageEl)) return;

    pageEl.innerHTML = "";

    const rendered = await pageInstance.render();
    pageEl.innerHTML = typeof rendered === "string" ? rendered : "";
  }

  async navigate(pageName) {
    if (!pageName || this.isNavigating) return;
    if (pageName === "chat") return;
    if (this.currentPage?.name === pageName) return;

    const nextPageInstance = this.pages.get(pageName);
    const nextPageEl = this.getPageElement(pageName);

    if (!nextPageInstance || !nextPageEl) {
      console.error("[Navigation] Page not found:", pageName);
      return;
    }

    this.isNavigating = true;

    try {
      if (nextPageInstance?.onBeforeEnter) {
        const canEnter = await nextPageInstance.onBeforeEnter();
        if (canEnter === false) {
          return;
        }
      }

      if (this.currentPage?.instance?.onLeave) {
        await this.currentPage.instance.onLeave();
      }

      this.clearDynamicPageIfNeeded(this.currentPage);
      this.hideAllPages();

      await this.renderPage(nextPageInstance, nextPageEl);
      if (typeof nextPageInstance.init === "function") {
        await nextPageInstance.init();
      }

      nextPageEl.hidden = false;
      this.updatePageHeader(pageName);
      this.refreshLanguageButtons();

      if (nextPageInstance?.onAfterEnter) {
        await nextPageInstance.onAfterEnter();
      }

      this.currentPage = {
        name: pageName,
        el: nextPageEl,
        instance: nextPageInstance,
      };

      this.persistActivePage(pageName);
      this.updateActiveNav(pageName);

      if (this.eventBus?.emit) {
        this.eventBus.emit("navigation:changed", {
          page: pageName,
        });
      }
    } catch (error) {
      console.error("[Navigation error]", error);

      this.hideAllPages();

      const failedPageEl = this.getPageElement(pageName);
      if (failedPageEl) {
        failedPageEl.innerHTML = this.renderNavigationError(pageName, error);
        failedPageEl.hidden = false;
      }

      this.updatePageHeader(pageName);
      this.refreshLanguageButtons();
      this.updateActiveNav(pageName);
    } finally {
      this.isNavigating = false;
    }
  }

  async goBack(fallbackPage = "home") {
    if (this.currentPage?.instance?.onBack) {
      const handled = await this.currentPage.instance.onBack();
      if (handled === true) return;
    }

    await this.navigate(fallbackPage);
  }

  openLanguageScreen() {
    // Atidaryti kalbos pasirinkimo modalą
    if (typeof window.__openLanguageModal === "function") {
      window.__openLanguageModal();
    }
  }

  hideAllPages() {
    this.pages.forEach((_, name) => {
      const el = this.getPageElement(name);
      if (el) el.hidden = true;
    });

    const chatPage = document.getElementById("page-chat");
    if (chatPage) {
      chatPage.hidden = true;
    }
  }

  isModifiedClick(event) {
    return Boolean(
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
    );
  }

  isInsideDynamicPage(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest(".page-slot"));
  }

  handleClick(event) {
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (this.isModifiedClick(event)) return;

    const rawTarget = event.target;
    if (!(rawTarget instanceof Element)) return;

    const navTarget = rawTarget.closest("[data-nav]");
    if (navTarget) {
      const pageName = navTarget.dataset.nav;
      if (!pageName || pageName === "chat") return;

      event.preventDefault();
      event.stopPropagation();
      this.navigate(pageName);
      return;
    }

    const backTarget = rawTarget.closest("[data-nav-back]");
    if (backTarget) {
      event.preventDefault();
      event.stopPropagation();

      const fallbackPage = backTarget.dataset.navBack || "home";
      this.goBack(fallbackPage);
      return;
    }

    const languageTarget = rawTarget.closest("[data-open-language]");
    if (languageTarget) {
      event.preventDefault();
      event.stopPropagation();
      this.openLanguageScreen();
      return;
    }

    if (this.isInsideDynamicPage(rawTarget)) {
      return;
    }
  }
}