let isInitialized = false;

export class NavigationController {
  constructor({ eventBus } = {}) {
    this.eventBus = eventBus;
    this.currentPage = null;
    this.pages = new Map();

    this.boundClickHandler = this.handleClick.bind(this);
    this.isNavigating = false;
  }

  init() {
    if (isInitialized) return;
    isInitialized = true;

    const appScreen = document.getElementById("app-screen");
    if (!appScreen) return;

    appScreen.addEventListener("click", this.boundClickHandler);
  }

  registerPage(name, pageInstance) {
    if (!name || !pageInstance) {
      console.warn("[Navigation] Invalid page registration:", name);
      return;
    }

    this.pages.set(name, pageInstance);
  }

  async navigate(pageName) {
    if (!pageName) return;
    if (this.isNavigating) return;

    this.isNavigating = true;

    try {
      const nextPageInstance = this.pages.get(pageName);
      const nextPageEl = document.getElementById(`page-${pageName}`);

      if (!nextPageInstance) {
        console.warn(`[Navigation] Page not registered: ${pageName}`);
        return;
      }

      if (!nextPageEl) {
        console.warn(`[Navigation] Page DOM not found: ${pageName}`);
        return;
      }

      if (this.currentPage?.name === pageName) {
        return;
      }

      this.hideAllPages();

      if (this.currentPage?.instance?.onLeave) {
        await this.currentPage.instance.onLeave();
      }

      if (nextPageInstance?.onBeforeEnter) {
        await nextPageInstance.onBeforeEnter({
          services: window.__services,
        });
      }

      nextPageEl.hidden = false;

      if (
        nextPageInstance?.render &&
        nextPageEl.dataset.dynamic === "true"
      ) {
        nextPageEl.innerHTML = await nextPageInstance.render();
      }

      if (nextPageInstance?.onAfterEnter) {
        await nextPageInstance.onAfterEnter();
      }

      this.currentPage = {
        name: pageName,
        el: nextPageEl,
        instance: nextPageInstance,
      };

      this.updateTitle(pageName);

      if (this.eventBus) {
        this.eventBus.emit("pageChanged", pageName);
      }

    } catch (err) {
      console.error("[Navigation] Error during navigation:", err);
    } finally {
      this.isNavigating = false;
    }
  }

  /* =====================
     🔥 FIXED CLICK HANDLER
  ===================== */

  handleClick(event) {
    const target = event.target;

    // ✅ 1. IGNORE VISUS UI ELEMENTUS
    if (
      target.closest("[data-ignore-nav]") ||
      target.closest("[data-lang]")
    ) {
      return;
    }

    // ✅ 2. Tik navigation elementai
    const navTarget = target.closest("[data-page]");
    if (!navTarget) return;

    const page = navTarget.dataset.page;
    if (!page) return;

    event.preventDefault();

    this.navigate(page);
  }

  hideAllPages() {
    this.pages.forEach((_, name) => {
      const el = document.getElementById(`page-${name}`);
      if (el) {
        el.hidden = true;
      }
    });
  }

  updateTitle(pageName) {
    const title = document.getElementById("page-title");
    if (!title) return;

    title.innerText =
      pageName.charAt(0).toUpperCase() + pageName.slice(1);
  }
}