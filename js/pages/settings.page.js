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

import { createTranslator, getCurrentLanguage } from "../core/i18n.js";
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

export class SettingsPage {
  constructor() {
    this.handleSaveClick = this.handleSaveClick.bind(this);
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
      </div>
    `;
  }

  async onAfterEnter() {
    const root = this.getPageRoot();
    if (!root) return;
    const saveBtn = root.querySelector("#settings-save-btn");
    if (saveBtn) saveBtn.addEventListener("click", this.handleSaveClick);
  }

  async onLeave() {
    const root = this.getPageRoot();
    if (root) {
      const saveBtn = root.querySelector("#settings-save-btn");
      if (saveBtn) saveBtn.removeEventListener("click", this.handleSaveClick);
    }
    if (this.statusClearTimer !== null) {
      clearTimeout(this.statusClearTimer);
      this.statusClearTimer = null;
    }
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
