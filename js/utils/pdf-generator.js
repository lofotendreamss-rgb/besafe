/**
 * BeSafe PDF Report Generator
 *
 * Generates a professional print-optimized HTML report in a new window,
 * styled with @media print CSS for clean "Save as PDF" output.
 */

import { parseLocalDate } from "../core/date.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildPrintCSS() {
  return `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1a1a2e;
      background: #fff;
      padding: 40px;
      font-size: 13px;
      line-height: 1.5;
    }

    .pdf-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 3px solid #2ecc8a;
      padding-bottom: 16px;
      margin-bottom: 28px;
    }

    .pdf-header__brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .pdf-header__logo {
      width: 40px;
      height: 40px;
      background: #2ecc8a;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-weight: 700;
      font-size: 16px;
    }

    .pdf-header__app-name {
      font-size: 22px;
      font-weight: 700;
      color: #1a1a2e;
    }

    .pdf-header__app-name span {
      color: #2ecc8a;
    }

    .pdf-header__meta {
      text-align: right;
      color: #666;
      font-size: 12px;
    }

    .pdf-title {
      font-size: 20px;
      font-weight: 700;
      color: #1a1a2e;
      margin-bottom: 4px;
    }

    .pdf-period {
      font-size: 13px;
      color: #666;
      margin-bottom: 24px;
    }

    .pdf-summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 28px;
    }

    .pdf-summary-card {
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 14px 16px;
      text-align: center;
    }

    .pdf-summary-card--income {
      border-top: 3px solid #2ecc8a;
    }

    .pdf-summary-card--expenses {
      border-top: 3px solid #e74c3c;
    }

    .pdf-summary-card--balance {
      border-top: 3px solid #3498db;
    }

    .pdf-summary-card--entries {
      border-top: 3px solid #9b59b6;
    }

    .pdf-summary-card__label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #888;
      margin-bottom: 4px;
    }

    .pdf-summary-card__value {
      font-size: 18px;
      font-weight: 700;
      color: #1a1a2e;
    }

    .pdf-section {
      margin-bottom: 24px;
    }

    .pdf-section__title {
      font-size: 15px;
      font-weight: 700;
      color: #1a1a2e;
      border-bottom: 2px solid #2ecc8a;
      padding-bottom: 6px;
      margin-bottom: 12px;
    }

    .pdf-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    .pdf-table th {
      background: #f5f7fa;
      text-align: left;
      padding: 8px 10px;
      font-weight: 600;
      color: #444;
      border-bottom: 2px solid #e0e0e0;
    }

    .pdf-table td {
      padding: 7px 10px;
      border-bottom: 1px solid #eee;
      color: #333;
    }

    .pdf-table tr:last-child td {
      border-bottom: none;
    }

    .pdf-table .amount-income {
      color: #2ecc8a;
      font-weight: 600;
    }

    .pdf-table .amount-expense {
      color: #e74c3c;
      font-weight: 600;
    }

    .pdf-table .text-right {
      text-align: right;
    }

    .pdf-table__totals-row td {
      font-weight: bold;
      border-top: 2px solid #1a1a2e;
      padding-top: 12px;
      padding-bottom: 12px;
    }

    .pdf-doc-details {
      margin-bottom: 20px;
    }

    .pdf-doc-details table {
      width: 100%;
      border-collapse: collapse;
    }

    .pdf-doc-details td {
      padding: 6px 10px;
      border-bottom: 1px solid #eee;
      font-size: 13px;
    }

    .pdf-doc-details td:first-child {
      font-weight: 600;
      color: #555;
      width: 180px;
    }

    .pdf-categories {
      margin-top: 16px;
    }

    .pdf-footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid #ddd;
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: #999;
      font-size: 11px;
    }

    .pdf-footer__brand {
      color: #2ecc8a;
      font-weight: 600;
    }

    @media print {
      body {
        padding: 20px;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .pdf-summary-card {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .pdf-table th {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .pdf-no-print {
        display: none !important;
      }

      .pdf-section {
        break-inside: avoid;
      }

      .pdf-footer {
        position: fixed;
        bottom: 0;
        left: 20px;
        right: 20px;
      }
    }
  `;
}

function formatAmountForPDF(amount, currency, locale) {
  const numericAmount = Number(amount);
  const safeAmount = Number.isFinite(numericAmount) ? numericAmount : 0;
  const safeCurrency = String(currency || "EUR").trim().toUpperCase() || "EUR";
  const safeLocale = String(locale || "en").trim() || "en";

  try {
    return new Intl.NumberFormat(safeLocale, {
      style: "currency",
      currency: safeCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeAmount);
  } catch (_error) {
    return `${safeCurrency} ${safeAmount.toFixed(2)}`;
  }
}

function formatDateForPDF(value, locale) {
  if (!value) return "";
  const date =
    typeof value === "string" ? (parseLocalDate(value) || new Date(value)) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  try {
    return new Intl.DateTimeFormat(locale || "en", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  } catch (_error) {
    return String(value);
  }
}

function buildHeaderHTML(title, period, generatedDate) {
  return `
    <header class="pdf-header">
      <div class="pdf-header__brand">
        <div class="pdf-header__logo">B</div>
        <div class="pdf-header__app-name">Be<span>Safe</span></div>
      </div>
      <div class="pdf-header__meta">
        <div>${escapeHtml(generatedDate)}</div>
      </div>
    </header>
    <h1 class="pdf-title">${escapeHtml(title)}</h1>
    ${period ? `<p class="pdf-period">${escapeHtml(period)}</p>` : ""}
  `;
}

function buildSummaryHTML(summary, currency, locale, t) {
  const income = formatAmountForPDF(summary.income ?? 0, currency, locale);
  const expenses = formatAmountForPDF(summary.expenses ?? 0, currency, locale);
  const balance = formatAmountForPDF(summary.balance ?? 0, currency, locale);
  const entries = String(Number(summary.transactionCount ?? summary.entries ?? 0));

  return `
    <div class="pdf-summary-grid">
      <div class="pdf-summary-card pdf-summary-card--income">
        <div class="pdf-summary-card__label">${escapeHtml(t("reports.summary.income"))}</div>
        <div class="pdf-summary-card__value">${escapeHtml(income)}</div>
      </div>
      <div class="pdf-summary-card pdf-summary-card--expenses">
        <div class="pdf-summary-card__label">${escapeHtml(t("reports.summary.expenses"))}</div>
        <div class="pdf-summary-card__value">${escapeHtml(expenses)}</div>
      </div>
      <div class="pdf-summary-card pdf-summary-card--balance">
        <div class="pdf-summary-card__label">${escapeHtml(t("reports.summary.balance"))}</div>
        <div class="pdf-summary-card__value">${escapeHtml(balance)}</div>
      </div>
      <div class="pdf-summary-card pdf-summary-card--entries">
        <div class="pdf-summary-card__label">${escapeHtml(t("reports.summary.entries"))}</div>
        <div class="pdf-summary-card__value">${escapeHtml(entries)}</div>
      </div>
    </div>
  `;
}

function buildTransactionsHTML(transactions, currency, locale, t) {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return "";
  }

  const rows = transactions.map((tx) => {
    const type = String(tx.type || "").toLowerCase();
    const amountClass = type === "income" ? "amount-income" : "amount-expense";
    const sign = type === "income" ? "+" : "-";
    const amount = formatAmountForPDF(Math.abs(tx.amount ?? 0), currency, locale);
    const label =
      tx.placeName ||
      tx.title ||
      tx.name ||
      tx.merchantName ||
      tx.storeName ||
      tx.meta?.placeName ||
      tx.receipt?.storeName ||
      "—";
    const category = tx.category
      ? String(tx.category).charAt(0).toUpperCase() + String(tx.category).slice(1)
      : "—";

    const dateVal =
      tx.financialDate || tx.date || tx.transactionDate || tx.createdAt || "";
    const dateStr = formatDateForPDF(dateVal, locale);

    return `
      <tr>
        <td>${escapeHtml(dateStr)}</td>
        <td>${escapeHtml(label)}</td>
        <td>${escapeHtml(category)}</td>
        <td class="text-right ${amountClass}">${escapeHtml(sign)}${escapeHtml(amount)}</td>
      </tr>
    `;
  });

  // Totals row — signed sum across visible transactions. Mirrors the per-row
  // sign convention (income +, anything else -). Display formatting matches
  // row rendering: `${sign}${absFormattedCurrency}` plus amount color class.
  // (#24 Step B, 2026-05-03)
  const totalSum = transactions.reduce((sum, tx) => {
    const absAmount = Math.abs(Number(tx.amount) || 0);
    const isIncome = String(tx.type || "").toLowerCase() === "income";
    return sum + (isIncome ? absAmount : -absAmount);
  }, 0);
  const totalSign = totalSum >= 0 ? "+" : "-";
  const totalAmountClass = totalSum >= 0 ? "amount-income" : "amount-expense";
  const totalAmountFormatted = formatAmountForPDF(Math.abs(totalSum), currency, locale);

  // Entry count with placeholder substitution. Pre-Step 2: raw key returns
  // "pdf.summary.entryCount" — `.replace()` finds no {count}, returns unchanged.
  // Post-Step 2: translation has {count} placeholder (e.g. "{count} įrašai")
  // — replace works as expected.
  const entryCountText = t("pdf.summary.entryCount").replace("{count}", transactions.length);

  return `
    <div class="pdf-section">
      <h2 class="pdf-section__title">${escapeHtml(t("pdf.section.transactions"))}</h2>
      <table class="pdf-table">
        <thead>
          <tr>
            <th>${escapeHtml(t("pdf.column.date"))}</th>
            <th>${escapeHtml(t("pdf.column.description"))}</th>
            <th>${escapeHtml(t("pdf.column.category"))}</th>
            <th class="text-right">${escapeHtml(t("pdf.column.amount"))}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.join("")}
        </tbody>
        <tfoot>
          <tr class="pdf-table__totals-row">
            <td colspan="3">${escapeHtml(t("pdf.detail.finalAmount"))} (${escapeHtml(entryCountText)}):</td>
            <td class="text-right ${totalAmountClass}">${escapeHtml(totalSign)}${escapeHtml(totalAmountFormatted)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function buildFooterHTML(generatedDate, t) {
  // Vertimas turi {brand} placeholder'į (pvz. "Generated by {brand}",
  // "{brand}によって生成", "由 {brand} 生成"). Tai užtikrina natūralų
  // word order per visas 14 kalbų, įskaitant CJK kalbas, kur BeSafe
  // gali būti pradžioje arba viduryje sakinio. (#24, 2026-05-03)
  //
  // ORDER MATTERS: escapeHtml runs FIRST on the translation template,
  // THEN {brand} is replaced with already-safe HTML span. This ensures
  // any user content in the translation stays escaped, but BeSafe
  // wordmark gets brand class.
  //
  // Defensive fallback handles 2 states:
  // 1. Pre-Step 2 (raw keys): t() returns "pdf.footer.generatedBy".
  //    No {brand} placeholder → fallback appends BeSafe wordmark with space.
  //    Output: "pdf.footer.generatedBy BeSafe"
  // 2. Post-Step 2 (translated): t() returns "Sukurta su {brand}" etc.
  //    {brand} placeholder found → replace with BeSafe wordmark.
  //    Output: "Sukurta su BeSafe"
  // Either way, BeSafe wordmark is always visible. (#24, 2026-05-03)
  const generatedByTemplate = escapeHtml(t("pdf.footer.generatedBy"));
  const brandHTML = `<span class="pdf-footer__brand">BeSafe</span>`;
  const generatedByHTML = generatedByTemplate.includes("{brand}")
    ? generatedByTemplate.replace("{brand}", brandHTML)
    : `${generatedByTemplate} ${brandHTML}`;

  return `
    <footer class="pdf-footer">
      <span>${generatedByHTML}</span>
      <span>${escapeHtml(generatedDate)}</span>
    </footer>
  `;
}

/**
 * Generate a PDF-ready report for the current live summary.
 *
 * Opens a new browser window with a print-optimized HTML report
 * and triggers the print dialog (user can "Save as PDF").
 *
 * @param {object} options
 * @param {string} options.title - Report title
 * @param {string} options.period - Human-readable period label
 * @param {object} options.summary - Summary object (income, expenses, balance, transactionCount)
 * @param {Array}  options.transactions - Array of transaction objects (optional)
 * @param {string} options.locale - Locale code for formatting
 * @param {string} options.currency - Currency code (default EUR)
 * @param {Function} options.t - i18n translator function (key) => translated string. If omitted, falls back to identity (returns key) — caller should provide it for proper localization (#24, 2026-05-03).
 */
export function generateReportPDF({
  title = "",
  period = "",
  summary = {},
  transactions = [],
  locale = "en",
  currency = "EUR",
  t,
} = {}) {
  // Defensive: if no translator provided (legacy callers), return key as-is.
  // Callers should pass `this.t` from a page component to get localized output.
  const translate = typeof t === "function" ? t : (key) => key;

  const now = new Date();
  const generatedDate = formatDateForPDF(now.toISOString(), locale);
  const finalTitle = title || `BeSafe ${translate("pdf.defaultTitle")}`;

  const html = `<!DOCTYPE html>
<html lang="${escapeHtml(locale)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(finalTitle)} - BeSafe</title>
  <style>${buildPrintCSS()}</style>
</head>
<body>
  ${buildHeaderHTML(finalTitle, period, generatedDate)}
  ${buildSummaryHTML(summary, currency, locale, translate)}
  ${buildTransactionsHTML(transactions, currency, locale, translate)}
  ${buildFooterHTML(generatedDate, translate)}

  <div class="pdf-no-print" style="text-align:center;margin-top:24px;">
    <p style="color:#888;font-size:13px;">${escapeHtml(translate("pdf.instruction.print"))}</p>
  </div>
</body>
</html>`;

  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 400);
  }
}

/**
 * Generate a PDF-ready report for a saved document.
 *
 * @param {object} doc - Saved document object from localStorage
 * @param {string} locale - Locale code for formatting
 * @param {Function} [t] - i18n translator function (key) => translated string. If omitted, falls back to identity (returns key) — caller should provide it for proper localization (#24, 2026-05-03).
 */
export function generateSavedDocumentPDF(doc, locale = "en", t) {
  if (!doc) return;

  // Defensive: if no translator provided (legacy callers), return key as-is.
  const translate = typeof t === "function" ? t : (key) => key;

  const now = new Date();
  const generatedDate = formatDateForPDF(now.toISOString(), locale);
  const docName = doc.name || `BeSafe ${translate("pdf.defaultTitle")}`;
  const periodStr = doc.title || `${doc.dateFrom || "—"} – ${doc.dateTo || "—"}`;
  const currency = "EUR";

  const baseAmount = doc.baseAmount != null ? formatAmountForPDF(doc.baseAmount, currency, locale) : "—";
  const pctAmount = doc.percentageAmount != null ? formatAmountForPDF(doc.percentageAmount, currency, locale) : "—";
  const vatAmount = doc.vatAmount != null ? formatAmountForPDF(doc.vatAmount, currency, locale) : "—";
  const totalAmount = doc.total != null ? formatAmountForPDF(doc.total, currency, locale) : "—";
  const createdDate = doc.createdAt ? formatDateForPDF(doc.createdAt, locale) : "—";

  let categoriesHTML = "";
  if (doc.categories && doc.categories.length) {
    const catRows = doc.categories.map((c) => `
      <tr>
        <td>${escapeHtml(c.name || "—")}</td>
        <td class="text-right">${escapeHtml(formatAmountForPDF(c.total ?? 0, currency, locale))}</td>
      </tr>
    `).join("");

    categoriesHTML = `
      <div class="pdf-section pdf-categories">
        <h2 class="pdf-section__title">${escapeHtml(translate("pdf.section.categories"))}</h2>
        <table class="pdf-table">
          <thead>
            <tr>
              <th>${escapeHtml(translate("pdf.column.category"))}</th>
              <th class="text-right">${escapeHtml(translate("pdf.column.amount"))}</th>
            </tr>
          </thead>
          <tbody>${catRows}</tbody>
        </table>
      </div>
    `;
  }

  const html = `<!DOCTYPE html>
<html lang="${escapeHtml(locale)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(docName)} - BeSafe</title>
  <style>${buildPrintCSS()}</style>
</head>
<body>
  ${buildHeaderHTML(docName, periodStr, generatedDate)}

  <div class="pdf-section pdf-doc-details">
    <h2 class="pdf-section__title">${escapeHtml(translate("pdf.section.details"))}</h2>
    <table>
      <tr>
        <td>${escapeHtml(translate("pdf.detail.type"))}</td>
        <td>${escapeHtml(doc.type || "—")}</td>
      </tr>
      <tr>
        <td>${escapeHtml(translate("reports.summary.period"))}</td>
        <td>${escapeHtml(periodStr)}</td>
      </tr>
      <tr>
        <td>${escapeHtml(translate("pdf.detail.created"))}</td>
        <td>${escapeHtml(createdDate)}</td>
      </tr>
      <tr>
        <td>${escapeHtml(translate("pdf.detail.fullAmount"))}</td>
        <td>${escapeHtml(baseAmount)}</td>
      </tr>
      <tr>
        <td>${escapeHtml(translate("pdf.detail.percentage"))}</td>
        <td>${escapeHtml(pctAmount)}</td>
      </tr>
      <tr>
        <td>${escapeHtml(translate("advisor.workspace.calculator.vatLabel"))}</td>
        <td>${escapeHtml(vatAmount)}</td>
      </tr>
      <tr>
        <td><strong>${escapeHtml(translate("pdf.detail.finalAmount"))}</strong></td>
        <td><strong>${escapeHtml(totalAmount)}</strong></td>
      </tr>
    </table>
  </div>

  ${categoriesHTML}

  ${buildFooterHTML(generatedDate, translate)}

  <div class="pdf-no-print" style="text-align:center;margin-top:24px;">
    <p style="color:#888;font-size:13px;">${escapeHtml(translate("pdf.instruction.print"))}</p>
  </div>
</body>
</html>`;

  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 400);
  }
}
