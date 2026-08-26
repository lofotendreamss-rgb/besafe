/**
 * BeSafe Settings Page — Phase 4 Sesija 0b (2026-04-30)
 *
 * Single-setting page kuriame vartotojas pasirenka numatytąją valiutą.
 * Kitos preferences (kalbos perjungiklis ir pan.) bus pridėtos vėlesnėse
 * sesijose / phase'uose pagal poreikį.
 *
 * Architektūra:
 *
 *   • Page klasė atitinka esamą `class XxxPage` pattern'ą
 *     (žiūrėk home.page.js, places.page.js). Constructor be services'ų,
 *     nes Settings naudoja tik `currency.js` helper'ius tiesiogiai —
 *     joks transactionService ar financialEngine čia nereikalingas.
 *
 *   • `render()` grąžina HTML string'ą, kurį
 *     navigation.controller.js inject'ina į `<section id="page-settings">`
 *     (žiūrėk navigation.controller.js:370-371). Section element'as
 *     turi būti pridėtas į `index.html` Step 7 metu — be jo page'as
 *     paleidžiamas, bet niekur nesimato.
 *
 *   • Currency picker'is gauna SUPPORTED_CURRENCIES iš currency.js
 *     ir rodo lokalizuotą pavadinimą per `getCurrencyName(code, lang)`,
 *     pavyzdžiui LT vartotojui — "EUR — Euras", JA — "EUR — ユーロ".
 *
 *   • Save handler'is kviečia `setUserCurrency(code)`, kuris pats
 *     validuoja, įrašo į localStorage'ą ir dispatcha
 *     `user-currency:changed` event'ą `document`'ui — ateities
 *     UI komponentai (Sesija 0c) galės subscribe'inti.
 *
 *   • Status pranešimas (success/error) rodomas inline po Save
 *     mygtuko per `aria-live="polite"` regioną — nereikia toast
 *     helper'io (kuris kodbazėje neegzistuoja). Statusas auto-išvalomas
 *     po 4s, kad neužkirsdytų ekrane.
 *
 * I18n raktai (committed `34b95ec`):
 *
 *   • app.settings                  — page title (taip pat top nav button)
 *   • settings.currency.label       — picker label
 *   • settings.currency.help        — descriptive text
 *   • settings.save.button          — save button label
 *   • settings.save.success         — success status text
 *   • settings.save.error           — error status text (su žinute, kad
 *                                     ankstesni nustatymai vis dar galioja)
 *
 * (`navigation.open.settings` yra index.html top-nav button'o aria-label
 * — naudojamas Step 7 wiring'e, ne čia.)
 */

import { createTranslator, getCurrentLanguage, setLanguage } from "../core/i18n.js";
import { SITE_BASE, openSitePage } from "../core/api.base.js";

// Root-relative paths, resolved against SITE_BASE at render time.
// Bare "/upgrade.html" is dead in the desktop build: the app runs
// from file://, so the link would point at file:///upgrade.html.
const UPGRADE_PATH = "/upgrade.html";
const PRIVACY_PATH = "/privacy.html";
const TERMS_PATH   = "/terms.html";
import {
  SUPPORTED_CURRENCIES,
  getCurrencyName,
  getUserCurrency,
  setUserCurrency,
} from "../services/finance/currency.js";

// Status pranešimas išvalomas po šio laiko, kad neužkirsdytų ekrane.
// 4s yra pakankamai ilgam vartotojui perskaityti, bet ne taip ilgai,
// kad būtų nemalonu.
const STATUS_CLEAR_DELAY_MS = 4000;

// Language picker options (autoglyph labels — kalba savo kalba).
// Mirrors splash screen language buttons in index.html.
const LANGUAGE_OPTIONS = [
  { code: "de", label: "Deutsch" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "it", label: "Italiano" },
  { code: "ja", label: "日本語" },
  { code: "lt", label: "Lietuvių" },
  { code: "no", label: "Norsk" },
  { code: "pl", label: "Polski" },
  { code: "pt", label: "Português" },
  { code: "ru", label: "Русский" },
  { code: "sv", label: "Svenska" },
  { code: "uk", label: "Українська" },
  { code: "zh", label: "中文" },
];

export class SettingsPage {
  constructor() {
    this.handleSaveClick = this.handleSaveClick.bind(this);
    this.handleLanguageChange = this.handleLanguageChange.bind(this);
    this.handleSiteLinkClick = this.handleSiteLinkClick.bind(this);
    this.statusClearTimer = null;
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
    return document.getElementById("page-settings");
  }

  isSettingsActive() {
    const pageRoot = this.getPageRoot();
    if (!pageRoot) return false;
    if (pageRoot.hidden) return false;
    return !pageRoot.closest("[hidden]");
  }

  async refreshIfActive() {
    // Settings page neturi remote / async data — refresh'as nieko nedaro.
    // Metodas implementuotas, kad atitiktų kitų pages contract'ą
    // (HomePage, TransactionsPage turi `refreshIfActive` ir kviečiami
    // iš transaction:created event handler'io).
    return false;
  }

  async onBeforeEnter() {
    return true;
  }

  render() {
    const lang = getCurrentLanguage();
    const current = getUserCurrency();

    // Page title is rendered by the app shell's outer #page-title h1
    // via NavigationController.updatePageHeader → getPageTitle("settings")
    // → t("app.settings"). We deliberately do NOT render an inner h1
    // here, mirroring HomePage / TransactionsPage / etc. which all rely
    // on the outer title to avoid two visible h1s on a single page.
    const label    = this.t("settings.currency.label", "Default currency");
    const help     = this.t(
      "settings.currency.help",
      "Used as default for new transactions. You can choose a different currency for each transaction if needed."
    );
    const saveText = this.t("settings.save.button", "Save changes");

    const privacyLabel    = this.t("legal.privacy", "Privacy");
    const termsLabel      = this.t("legal.terms", "Terms");
    const langDisclaimer  = this.t(
      "legal.langDisclaimer",
      "Currently available in English only"
    );

    const options = SUPPORTED_CURRENCIES.map((c) => {
      const name = getCurrencyName(c.code, lang);
      const selected = c.code === current ? " selected" : "";
      return `<option value="${this.escapeHtml(c.code)}"${selected}>${this.escapeHtml(c.code)} — ${this.escapeHtml(name)}</option>`;
    }).join("");

    return `
      <div class="settings-page__container">
        <section class="settings-page__section" aria-labelledby="settings-currency-label">
          <label
            id="settings-currency-label"
            for="settings-currency-picker"
            class="settings-page__label"
          >${this.escapeHtml(label)}</label>

          <select
            id="settings-currency-picker"
            class="settings-page__select"
            aria-describedby="settings-currency-help"
          >${options}</select>

          <p id="settings-currency-help" class="settings-page__help">
            ${this.escapeHtml(help)}
          </p>
        </section>

        ${this.renderLanguageSection()}

        <div class="settings-page__actions">
          <button
            type="button"
            id="settings-save-btn"
            class="settings-page__save-btn"
          >${this.escapeHtml(saveText)}</button>

          <span
            id="settings-save-status"
            class="settings-page__status"
            role="status"
            aria-live="polite"
          ></span>
        </div>

        ${this.renderSubscriptionSection()}

        <section class="settings-page__section settings-page__section--legal" aria-label="${this.escapeHtml(privacyLabel)} / ${this.escapeHtml(termsLabel)}">
          <div class="settings-page__legal-links">
            <a href="${SITE_BASE + PRIVACY_PATH}" class="settings-page__legal-link" data-site-link="${PRIVACY_PATH}">${this.escapeHtml(privacyLabel)}</a>
            <span class="settings-page__legal-separator" aria-hidden="true">·</span>
            <a href="${SITE_BASE + TERMS_PATH}" class="settings-page__legal-link" data-site-link="${TERMS_PATH}">${this.escapeHtml(termsLabel)}</a>
          </div>
          <p class="settings-page__legal-disclaimer">${this.escapeHtml(langDisclaimer)}</p>
        </section>
      </div>
    `;
  }

  // Subscription — the only route to cancelling from inside the app.
  //
  // Before this existed, the sole in-app path to upgrade.html was the
  // subscription-ended banner in license.checker.js, which appears
  // only AFTER a subscription lapses. Someone with an ACTIVE
  // subscription had no way to reach the billing portal at all, while
  // the trial email promises "cancel anytime". This closes that gap.
  //
  // The link is deliberately plain and unhidden: cancelling should not
  // be harder to find than subscribing was.
  renderSubscriptionSection() {
    const label  = this.t("settings.subscription.label", "Subscription");
    const help   = this.t(
      "settings.subscription.help",
      "Update your payment method, download invoices, or cancel your subscription. We'll email a secure link to your address."
    );
    const button = this.t("settings.subscription.button", "Manage subscription");

    return `
      <section class="settings-page__section" aria-labelledby="settings-subscription-label">
        <span
          id="settings-subscription-label"
          class="settings-page__label"
        >${this.escapeHtml(label)}</span>

        <p id="settings-subscription-help" class="settings-page__help">
          ${this.escapeHtml(help)}
        </p>

        <a
          id="settings-subscription-link"
          class="settings-page__legal-link"
          href="${SITE_BASE + UPGRADE_PATH}"
          data-site-link="${UPGRADE_PATH}"
          target="_blank"
          rel="noopener"
          aria-describedby="settings-subscription-help"
        >${this.escapeHtml(button)} &rarr;</a>
      </section>
    `;
  }

  // One handler for every outbound link on this page. The absolute
  // href already makes them resolve everywhere; this additionally
  // keeps the desktop build from opening a second chrome-less Electron
  // window, handing the URL to the OS browser instead. If it never
  // runs, the plain href still works.
  handleSiteLinkClick(event) {
    const anchor = event.currentTarget;
    const path = anchor?.getAttribute("data-site-link");
    if (!path) return;
    event.preventDefault();
    openSitePage(path, { target: "_blank" });
  }

  renderLanguageSection() {
    const currentLang = getCurrentLanguage();
    const label = this.t("settings.language.label", "Language");
    const help = this.t(
      "settings.language.help",
      "Changes apply immediately. Affects all interface text."
    );

    const options = LANGUAGE_OPTIONS.map((opt) => {
      const selected = opt.code === currentLang ? " selected" : "";
      return `<option value="${this.escapeHtml(opt.code)}"${selected}>${this.escapeHtml(opt.label)}</option>`;
    }).join("");

    return `
      <section class="settings-page__section" aria-labelledby="settings-language-label">
        <label
          id="settings-language-label"
          for="settings-language-picker"
          class="settings-page__label"
        >${this.escapeHtml(label)}</label>

        <select
          id="settings-language-picker"
          class="settings-page__select"
          aria-describedby="settings-language-help"
        >${options}</select>

        <p id="settings-language-help" class="settings-page__help">
          ${this.escapeHtml(help)}
        </p>
      </section>
    `;
  }

  async onAfterEnter() {
    this.wireListeners();
  }

  async onLeave() {
    this.unwireListeners();
    if (this.statusClearTimer !== null) {
      clearTimeout(this.statusClearTimer);
      this.statusClearTimer = null;
    }
  }

  wireListeners() {
    const root = this.getPageRoot();
    if (!root) return;
    const saveBtn = root.querySelector("#settings-save-btn");
    if (saveBtn) saveBtn.addEventListener("click", this.handleSaveClick);
    const langSelect = root.querySelector("#settings-language-picker");
    if (langSelect) langSelect.addEventListener("change", this.handleLanguageChange);
    root.querySelectorAll("[data-site-link]").forEach((a) => {
      a.addEventListener("click", this.handleSiteLinkClick);
    });
  }

  unwireListeners() {
    const root = this.getPageRoot();
    if (!root) return;
    const saveBtn = root.querySelector("#settings-save-btn");
    if (saveBtn) saveBtn.removeEventListener("click", this.handleSaveClick);
    const langSelect = root.querySelector("#settings-language-picker");
    if (langSelect) langSelect.removeEventListener("change", this.handleLanguageChange);
    root.querySelectorAll("[data-site-link]").forEach((a) => {
      a.removeEventListener("click", this.handleSiteLinkClick);
    });
  }

  refreshSettingsContent() {
    const root = this.getPageRoot();
    if (!root) return;

    // Preserve unsaved currency picker selection across the re-render.
    const currentCurrency = root.querySelector("#settings-currency-picker")?.value;

    this.unwireListeners();
    root.innerHTML = this.render();

    if (currentCurrency) {
      const newCurrencySelect = root.querySelector("#settings-currency-picker");
      if (newCurrencySelect) newCurrencySelect.value = currentCurrency;
    }

    this.wireListeners();
  }

  handleLanguageChange(event) {
    const newLang = String(event?.target?.value || "").trim();
    if (!newLang) return;

    setLanguage(newLang);
    this.refreshSettingsContent();

    // Show subtle confirmation status (reuse existing status DOM after re-render).
    const root = this.getPageRoot();
    if (!root) return;
    const status = root.querySelector("#settings-save-status");
    if (!status) return;

    status.textContent = this.t("settings.language.changed", "Language changed");
    status.className = "settings-page__status settings-page__status--success";

    if (this.statusClearTimer !== null) clearTimeout(this.statusClearTimer);
    this.statusClearTimer = setTimeout(() => {
      const stillActive = this.getPageRoot();
      if (stillActive) {
        const node = stillActive.querySelector("#settings-save-status");
        if (node) {
          node.textContent = "";
          node.className = "settings-page__status";
        }
      }
      this.statusClearTimer = null;
    }, STATUS_CLEAR_DELAY_MS);
  }

  handleSaveClick(event) {
    if (event && typeof event.preventDefault === "function") {
      event.preventDefault();
    }
    const root = this.getPageRoot();
    if (!root) return;

    const select = root.querySelector("#settings-currency-picker");
    const status = root.querySelector("#settings-save-status");
    if (!select || !status) return;

    const code = String(select.value || "").toUpperCase();

    // setUserCurrency() vidiniai validuoja code'ą prieš įrašymą +
    // dispatcha `user-currency:changed` event'ą sėkmės atveju.
    // Grąžina `false` jei code'as unknown arba localStorage gedo
    // (private browsing, storage full, etc.) — tuomet rodyti error
    // statusą su patikinimu, kad ankstesni nustatymai vis dar
    // galioja (žinia atitinka Phase 3 FABRICATED-SUCCESS prevencijos
    // principą — sąžiningai pasakyti, kas vyksta).
    const ok = setUserCurrency(code);

    if (ok) {
      status.textContent = this.t("settings.save.success", "Settings saved");
      status.className =
        "settings-page__status settings-page__status--success";
    } else {
      status.textContent = this.t(
        "settings.save.error",
        "Couldn't save your settings. Please try again — your previous settings are still active."
      );
      status.className =
        "settings-page__status settings-page__status--error";
    }

    if (this.statusClearTimer !== null) clearTimeout(this.statusClearTimer);
    this.statusClearTimer = setTimeout(() => {
      const stillActive = this.getPageRoot();
      if (stillActive) {
        const node = stillActive.querySelector("#settings-save-status");
        if (node) {
          node.textContent = "";
          node.className = "settings-page__status";
        }
      }
      this.statusClearTimer = null;
    }, STATUS_CLEAR_DELAY_MS);
  }
}
