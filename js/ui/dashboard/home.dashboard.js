import { createTranslator, getCurrentLanguage } from "../../core/i18n.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getDashboardLanguage() {
  try {
    return String(getCurrentLanguage?.() || "en").trim().toLowerCase();
  } catch (_error) {
    return "en";
  }
}

const LOCALE_MAP = { lt: "lt-LT", en: "en-GB", pl: "pl-PL", de: "de-DE", es: "es-ES", ru: "ru-RU", no: "nb-NO", sv: "sv-SE", ja: "ja-JP", zh: "zh-CN" };

function getDashboardLocale(lang) {
  return LOCALE_MAP[lang] || "en-GB";
}

function getTranslate(lang) {
  return createTranslator(lang);
}

function normalizeCurrency(value, fallback = "EUR") {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized || fallback;
}

function formatAmount(amount = 0, { locale = "en-GB", currency = "EUR" } = {}) {
  const numericAmount = Number(amount || 0);
  const safeAmount = Number.isFinite(numericAmount) ? numericAmount : 0;
  const safeCurrency = normalizeCurrency(currency, "EUR");

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: safeCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeAmount);
  } catch (_error) {
    return `${safeCurrency} ${safeAmount.toFixed(2)}`;
  }
}

function renderSummarySection(
  income,
  expenses,
  balance,
  t,
  locale,
  currency,
  isBusiness
) {
  return `
    <section class="section home-summary-section home-summary-section--hero" aria-label="${escapeHtml(
      t("home.summary.aria", "Financial summary")
    )}">
      <div class="home-section-header home-section-header--compact">
        <p class="home-section-header__eyebrow">${escapeHtml(
          t("home.summary.eyebrow", "Your situation")
        )}</p>
        <h2 class="home-section-header__title">${escapeHtml(
          t("home.summary.title", "Financial summary")
        )}</h2>
        <p class="home-section-header__subtitle">${escapeHtml(
          isBusiness
            ? t(
                "home.summary.subtitle.business",
                "Review your financial flow and prepare for clearer decisions."
              )
            : t(
                "home.summary.subtitle",
                "Start with one clear view of your balance, income, and expenses."
              )
        )}</p>
      </div>

      <div class="summary-grid summary-grid--home-hero">
        <article class="summary-card balance summary-card--primary">
          <span class="label">${escapeHtml(
            t("home.summary.balance", "Balance")
          )}</span>
          <strong class="value" style="color:${balance >= 0 ? "#9ae6c1" : "#e7a99a"};">${escapeHtml(
            formatAmount(balance, { locale, currency })
          )}</strong>
          <small class="summary-card__hint">${escapeHtml(
            t(
              "home.summary.balanceHint",
              "Difference between income and expenses"
            )
          )}</small>
        </article>

        <article class="summary-card income">
          <span class="label">${escapeHtml(
            t("home.summary.income", "Income")
          )}</span>
          <strong class="value" style="color:#9ae6c1;">${escapeHtml(
            formatAmount(income, { locale, currency })
          )}</strong>
          <small class="summary-card__hint">${escapeHtml(
            t("home.summary.incomeHint", "All recorded income")
          )}</small>
        </article>

        <article class="summary-card expense">
          <span class="label">${escapeHtml(
            t("home.summary.expenses", "Expenses")
          )}</span>
          <strong class="value" style="color:#e7a99a;">${escapeHtml(
            formatAmount(expenses, { locale, currency })
          )}</strong>
          <small class="summary-card__hint">${escapeHtml(
            t("home.summary.expensesHint", "All recorded expenses")
          )}</small>
        </article>
      </div>
    </section>
  `;
}

function renderPlacesSignalSection(t, isBusiness, topExpensePlaceName) {
  const safeTopPlaceName = String(topExpensePlaceName || "").trim();
  const hasTopPlace = Boolean(safeTopPlaceName);

  return `
    <section class="section home-places-signal" aria-label="${escapeHtml(
      t("home.places.aria", "Places context")
    )}">
      <div class="home-section-header home-section-header--compact">
        <p class="home-section-header__eyebrow">${escapeHtml(
          t("home.places.eyebrow", "Where your money moves")
        )}</p>
        <p class="home-section-header__subtitle">${escapeHtml(
          hasTopPlace
            ? isBusiness
              ? t(
                  "home.places.topSignal.business",
                  `Top expense place this period: ${safeTopPlaceName}. You can use this as a calm starting point for a closer work review.`
                )
              : t(
                  "home.places.topSignal",
                  `Top expense place this period: ${safeTopPlaceName}.`
                )
            : isBusiness
              ? t(
                  "home.places.subtitle.business",
                  "Your activity is connected to places like stores, banks, or services. You can review them in reports or use them in calculations."
                )
              : t(
                  "home.places.subtitle",
                  "Your expenses and income come from places like stores, banks, or services. You can review them later."
                )
        )}</p>
      </div>
    </section>
  `;
}

function renderQuickActionsSection(t) {
  const actionsTitle = t("home.actions.title", "Choose what you want to do");

  return `
    <section class="section quick-actions-section home-actions" aria-label="${escapeHtml(
      t("home.actions.aria", "Helpful actions")
    )}">
      <div class="home-section-header home-section-header--compact">
        <p class="home-section-header__eyebrow">${escapeHtml(
          t("home.actions.eyebrow", "Next step")
        )}</p>
        <h2 class="home-section-header__title">${escapeHtml(actionsTitle)}</h2>
        <p class="home-section-header__subtitle">${escapeHtml(
          t(
            "home.actions.subtitle",
            "BeSafe will show one clear next step for the action you choose."
          )
        )}</p>
      </div>

      <div id="quickActions">
        <div class="quick-actions-flow">
          <div class="quick-actions-grid" role="group" aria-label="${escapeHtml(
            t("home.actions.groupLabel", actionsTitle)
          )}">
            <button type="button" class="quick-action-btn" data-action="expense">
              ${escapeHtml(t("home.actions.expense", "Pridėti išlaidas"))}
            </button>
            <button type="button" class="quick-action-btn" data-action="income">
              ${escapeHtml(t("home.actions.income", "Pridėti pajamas"))}
            </button>
            <button type="button" class="quick-action-btn" data-action="receipt">
              ${escapeHtml(t("home.actions.receipt", "Pridėti čekį"))}
            </button>
            <button type="button" class="quick-action-btn" data-action="receipt-scanner">
              ${escapeHtml(t("home.actions.receiptScanner", "Čekių skeneris"))}
            </button>
          </div>

          <div class="quick-action-guidance quick-actions-flow__panel" data-guidance>
            <p class="quick-action-guidance__eyebrow">${escapeHtml(
              t("home.guidance.eyebrow", "BeSafe guidance")
            )}</p>
            <h3 class="quick-action-guidance__title">${escapeHtml(
              t(
                "home.guidance.title",
                "Choose one action after reviewing your situation"
              )
            )}</h3>
            <p class="quick-action-guidance__text">${escapeHtml(
              t(
                "home.guidance.text",
                "When you choose an action, the next step opens right away without taking over the whole Home screen."
              )
            )}</p>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderBusinessContextSection(income, expenses, balance, t, locale, currency) {
  const hasPositiveBalance = balance >= 0;

  return `
    <section class="section home-business-context">
      <div class="home-section-header home-section-header--compact">
        <h2 class="home-section-header__title">${escapeHtml(
          hasPositiveBalance
            ? t("home.business.context.title.positive", "Your current flow is stable.")
            : t("home.business.context.title.attention", "Your flow needs review.")
        )}</h2>
      </div>
    </section>
  `;
}

function renderBusinessHintSection(t) {
  return `
    <section class="section home-business-hint">
      <div class="home-section-header home-section-header--compact">
        <h2 class="home-section-header__title">${escapeHtml(
          t("home.business.title", "Review your financial activity in more detail")
        )}</h2>
      </div>
    </section>
  `;
}

export function renderHomeDashboard(summary) {
  const lang = getDashboardLanguage();
  const locale = getDashboardLocale(lang);
  const t = getTranslate(lang);

  const safeSummary = summary || {};
  const ui = safeSummary.ui || {};

  const income = Number(safeSummary.income || 0);
  const expenses = Number(safeSummary.expenses || 0);
  const balance = Number(safeSummary.balance || income - expenses);
  const currency = normalizeCurrency(safeSummary.currency, "EUR");
  const topExpensePlaceName = String(safeSummary.topExpensePlaceName || "").trim();

  return `
    <section class="home-dashboard" data-dashboard-lang="${escapeHtml(
      lang
    )}" data-plan="${escapeHtml(safeSummary.plan || "personal")}">

      ${renderSummarySection(
        income,
        expenses,
        balance,
        t,
        locale,
        currency,
        safeSummary.isBusinessPlan
      )}

      ${renderPlacesSignalSection(
        t,
        safeSummary.isBusinessPlan,
        topExpensePlaceName
      )}

      ${renderQuickActionsSection(t)}

      ${
        safeSummary.isBusinessPlan && ui.showBusinessContext
          ? renderBusinessContextSection(
              income,
              expenses,
              balance,
              t,
              locale,
              currency
            )
          : ""
      }

      ${safeSummary.isBusinessPlan ? renderBusinessHintSection(t) : ""}
    </section>
  `;
}