/* =====================
   FACTORY (BeSafe Advisor)
   Calm, data-based, no-pressure guidance
===================== */

import { getCurrencySymbol, getUserCurrency } from "../finance/currency.js";

export function createAIAdvisor(dependencies = {}) {
  const {
    transactionService = null,
    financialEngine = null,
    apiService = null,
    registry = null
  } = dependencies || {};

  /* =====================
     HELPERS
  ===================== */

  function formatResponse({
    observation = "",
    explanation = "",
    suggestion = "",
    nextStep = "",
    tone = "neutral",
    status = "ok"
  } = {}) {
    return {
      observation,
      explanation,
      suggestion,
      nextStep,
      tone,
      status
    };
  }

  function safeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function roundMoney(value) {
    return Math.round(safeNumber(value) * 100) / 100;
  }

  function formatMoney(value) {
    return `${roundMoney(value).toFixed(2)}${getCurrencySymbol(getUserCurrency())}`;
  }

  function normalizeCategory(value) {
    if (typeof value !== "string") return "";
    return value.trim();
  }

  function isObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function looksLikeSummary(value) {
    if (!isObject(value)) return false;

    return (
      value.balance !== undefined ||
      value.income !== undefined ||
      value.expenses !== undefined ||
      value.monthlyIncome !== undefined ||
      value.monthlySpending !== undefined ||
      value.totalEntries !== undefined ||
      value.entries !== undefined ||
      value.transactionCount !== undefined ||
      value.topExpenseCategory !== undefined ||
      value.topExpenseDirection !== undefined
    );
  }

  function readSummary(snapshotOrSummary) {
    if (!snapshotOrSummary) return null;

    if (snapshotOrSummary.finances?.summary) {
      return snapshotOrSummary.finances.summary;
    }

    if (snapshotOrSummary.summary && looksLikeSummary(snapshotOrSummary.summary)) {
      return snapshotOrSummary.summary;
    }

    if (looksLikeSummary(snapshotOrSummary)) {
      return snapshotOrSummary;
    }

    return null;
  }

  async function tryCall(target, methodName, ...args) {
    if (!target || typeof target[methodName] !== "function") {
      return null;
    }

    try {
      return await target[methodName](...args);
    } catch (error) {
      console.warn(`[BeSafe Advisor] ${methodName} failed:`, error);
      return null;
    }
  }

  function getRegistryService(name) {
    if (!registry || typeof registry.getOptional !== "function") {
      return null;
    }

    try {
      return registry.getOptional(name);
    } catch (error) {
      console.warn(`[BeSafe Advisor] Could not resolve service "${name}":`, error);
      return null;
    }
  }

  function getTransactionService() {
    return transactionService || getRegistryService("transactions");
  }

  function getFinancialEngine() {
    return financialEngine || getRegistryService("finance");
  }

  function getApiService() {
    return apiService || getRegistryService("api");
  }

  async function resolveSummarySource(snapshotOrSummary) {
    const directSummary = readSummary(snapshotOrSummary);
    if (directSummary) {
      return directSummary;
    }

    const engine = getFinancialEngine();
    const transactions = getTransactionService();
    const api = getApiService();

    const engineCandidates = [
      "getSummary",
      "getFinancialSummary",
      "getSnapshot",
      "getFinancialSnapshot",
      "createSummary",
      "buildSummary"
    ];

    for (const methodName of engineCandidates) {
      const result = await tryCall(engine, methodName, snapshotOrSummary);
      const summary = readSummary(result);
      if (summary) {
        return summary;
      }
    }

    const transactionCandidates = [
      "getSummary",
      "getFinancialSummary",
      "getSnapshot",
      "getFinancialSnapshot",
      "getTransactionsSummary"
    ];

    for (const methodName of transactionCandidates) {
      const result = await tryCall(transactions, methodName, snapshotOrSummary);
      const summary = readSummary(result);
      if (summary) {
        return summary;
      }
    }

    const apiCandidates = [
      "getSummary",
      "getFinancialSummary",
      "getSnapshot",
      "getFinancialSnapshot"
    ];

    for (const methodName of apiCandidates) {
      const result = await tryCall(api, methodName, snapshotOrSummary);
      const summary = readSummary(result);
      if (summary) {
        return summary;
      }
    }

    return null;
  }

  function resolveBalance(summary) {
    if (!summary) return 0;

    if (summary.balance !== undefined) {
      return safeNumber(summary.balance);
    }

    const income =
      summary.income !== undefined
        ? safeNumber(summary.income)
        : safeNumber(summary.monthlyIncome);

    const expenses =
      summary.expenses !== undefined
        ? safeNumber(summary.expenses)
        : safeNumber(summary.monthlySpending);

    return income - expenses;
  }

  function resolveIncome(summary) {
    if (!summary) return 0;

    if (summary.income !== undefined) {
      return safeNumber(summary.income);
    }

    if (summary.monthlyIncome !== undefined) {
      return safeNumber(summary.monthlyIncome);
    }

    return 0;
  }

  function resolveExpenses(summary) {
    if (!summary) return 0;

    if (summary.expenses !== undefined) {
      return safeNumber(summary.expenses);
    }

    if (summary.monthlySpending !== undefined) {
      return safeNumber(summary.monthlySpending);
    }

    return 0;
  }

  function resolveEntryCount(summary) {
    if (!summary) return 0;

    if (summary.totalEntries !== undefined) {
      return safeNumber(summary.totalEntries);
    }

    if (summary.entries !== undefined) {
      return safeNumber(summary.entries);
    }

    if (summary.transactionCount !== undefined) {
      return safeNumber(summary.transactionCount);
    }

    return 0;
  }

  function resolveTopExpenseCategory(summary) {
    if (!summary) return "";

    return normalizeCategory(
      summary.topExpenseCategory ||
        summary.topExpenseDirection ||
        summary.mainExpenseCategory ||
        ""
    );
  }

  function getDataState(summary) {
    const income = resolveIncome(summary);
    const expenses = resolveExpenses(summary);
    const balance = resolveBalance(summary);
    const entryCount = resolveEntryCount(summary);
    const topExpenseCategory = resolveTopExpenseCategory(summary);

    const hasAnyAmounts = income > 0 || expenses > 0 || balance !== 0;
    const hasData = hasAnyAmounts || entryCount > 0;
    const lowData = entryCount > 0 && entryCount < 3;

    return {
      income,
      expenses,
      balance,
      entryCount,
      topExpenseCategory,
      hasData,
      lowData
    };
  }

  function buildSituationGuidance(summary) {
    const state = getDataState(summary);

    if (!state.hasData) {
      return formatResponse({
        observation: "There is not enough recorded information yet.",
        explanation:
          "Advisor should only explain what is visible from real data. Right now the picture is still too small for a reliable suggestion.",
        suggestion:
          "Start by adding a few accurate income or expense entries so the situation becomes clearer.",
        nextStep: "Add one confirmed entry from Home.",
        tone: "neutral",
        status: "not_enough_data"
      });
    }

    if (state.lowData) {
      return formatResponse({
        observation: "The current financial picture is still very early.",
        explanation:
          "A small number of entries can show direction, but it is still too early for stronger conclusions.",
        suggestion:
          "Treat this as an early signal only and continue recording entries accurately.",
        nextStep: "Add the next confirmed entry to improve clarity.",
        tone: "neutral",
        status: "early_data"
      });
    }

    if (state.expenses > state.income) {
      const difference = state.expenses - state.income;

      return formatResponse({
        observation: "Expenses are currently higher than income.",
        explanation: `Recorded expenses are ${formatMoney(
          state.expenses
        )}, while recorded income is ${formatMoney(
          state.income
        )}. That leaves a current difference of ${formatMoney(difference)}.`,
        suggestion: state.topExpenseCategory
          ? `The clearest place to review first is ${state.topExpenseCategory}, because it currently appears as the strongest expense direction.`
          : "The clearest next review is to look at the largest recent expenses and check whether any were one-time costs.",
        nextStep: state.topExpenseCategory
          ? `Review the ${state.topExpenseCategory} category first.`
          : "Review the largest expense entries first.",
        tone: "attention",
        status: "attention"
      });
    }

    if (state.income > state.expenses) {
      const difference = state.income - state.expenses;

      return formatResponse({
        observation: "Income is currently ahead of expenses.",
        explanation: `Recorded income is ${formatMoney(
          state.income
        )}, while recorded expenses are ${formatMoney(
          state.expenses
        )}. The current balance difference is ${formatMoney(difference)}.`,
        suggestion: state.topExpenseCategory
          ? `The situation looks stable right now. If you want a calmer next review, start with ${state.topExpenseCategory} because it is currently the main expense direction.`
          : "The situation looks stable right now. The next useful step is a light review of the main expense area.",
        nextStep: state.topExpenseCategory
          ? `Review ${state.topExpenseCategory} to keep the picture clear.`
          : "Review the main expense area once.",
        tone: "stable",
        status: "stable"
      });
    }

    return formatResponse({
      observation: "Income and expenses are currently very close.",
      explanation: `Recorded income is ${formatMoney(
        state.income
      )} and recorded expenses are ${formatMoney(
        state.expenses
      )}. The current balance is nearly even.`,
      suggestion: state.topExpenseCategory
        ? `A calm next step would be to review ${state.topExpenseCategory} first and decide whether that level feels expected.`
        : "A calm next step would be to review the latest expenses and decide whether this level feels expected.",
      nextStep: state.topExpenseCategory
        ? `Review ${state.topExpenseCategory} first.`
        : "Review the latest expenses first.",
      tone: "neutral",
      status: "balanced"
    });
  }

  function buildCategoryGuidance(summary) {
    const state = getDataState(summary);

    if (!state.hasData) {
      return formatResponse({
        observation: "There is no clear expense direction yet.",
        explanation:
          "Without enough recorded entries, Advisor should not name a category as important.",
        suggestion:
          "Continue recording expenses accurately until a real category pattern appears.",
        nextStep: "Add the next confirmed expense entry.",
        tone: "neutral",
        status: "not_enough_data"
      });
    }

    if (!state.topExpenseCategory) {
      return formatResponse({
        observation: "A main expense category is not visible yet.",
        explanation:
          "The available data does not clearly show one dominant expense direction right now.",
        suggestion:
          "Keep recording entries accurately. A clearer category pattern should appear with more real data.",
        nextStep: "Continue with accurate expense recording.",
        tone: "neutral",
        status: "unclear_category"
      });
    }

    return formatResponse({
      observation: `${state.topExpenseCategory} is currently the main expense direction.`,
      explanation:
        "This does not mean it is automatically a problem. It only means this category stands out most in the recorded data right now.",
      suggestion: `If you want the clearest review, begin with ${state.topExpenseCategory} and check whether that level feels expected or temporary.`,
      nextStep: `Open and review ${state.topExpenseCategory} first.`,
      tone: "neutral",
      status: "category_visible"
    });
  }

  function buildGeneralGuidance(summary) {
    const state = getDataState(summary);

    if (!state.hasData) {
      return formatResponse({
        observation: "Advisor is ready, but there is not enough data yet.",
        explanation:
          "BeSafe should only explain what is truly visible from real recorded information.",
        suggestion:
          "Once a few real entries are recorded, Advisor can explain the situation more clearly.",
        nextStep: "Add one confirmed income or expense entry.",
        tone: "neutral",
        status: "not_enough_data"
      });
    }

    return buildSituationGuidance(summary);
  }

  /* =====================
     CORE INSIGHTS
  ===================== */

  async function getInsights(summaryInput) {
    const summary = await resolveSummarySource(summaryInput);
    const situation = buildSituationGuidance(summary);
    const category = buildCategoryGuidance(summary);

    const items = [{ type: situation.status, text: situation }];

    // Skip category when situation already covers "not_enough_data" — the
    // shared status would render duplicate cards after Home translation
    // (Bug #1 Layer 2, A4 smoke 2026-05-02).
    if (situation.status !== "not_enough_data" || category.status !== "not_enough_data") {
      items.push({ type: category.status, text: category });
    }

    return items;
  }

  /* =====================
     SIMPLE FORECAST
     Conservative / no pressure
  ===================== */

  async function getPredictions(summaryInput) {
    const summary = await resolveSummarySource(summaryInput);

    if (!summary) {
      return {
        forecast: [],
        risk: null,
        guidance: formatResponse({
          observation: "A forecast is not available right now.",
          explanation:
            "Advisor should not calculate forward-looking guidance without a real financial summary.",
          suggestion: "Record more real data first.",
          nextStep: "Add confirmed entries before reviewing forecasts.",
          tone: "neutral",
          status: "not_enough_data"
        })
      };
    }

    const income = resolveIncome(summary);
    const expenses = resolveExpenses(summary);
    const balance = resolveBalance(summary);

    const dailyNet = (income - expenses) / 30;
    const forecast = [];

    let futureBalance = balance;

    for (let day = 1; day <= 30; day += 1) {
      futureBalance += dailyNet;
      forecast.push({
        day,
        balance: Math.round(futureBalance * 100) / 100
      });
    }

    const risk =
      dailyNet < 0 ? forecast.find((item) => item.balance < 0) || null : null;

    return {
      forecast,
      risk,
      guidance: risk
        ? formatResponse({
            observation: "The current direction may reduce balance over time.",
            explanation: `If the current recorded pattern continues, balance could fall below zero in about ${risk.day} days.`,
            suggestion:
              "Treat this as a direction signal only. A calm next step is to review the strongest expense area first.",
            nextStep: "Review the main expense direction first.",
            tone: "attention",
            status: "attention"
          })
        : formatResponse({
            observation: "No immediate balance drop is visible from the current direction.",
            explanation:
              "If the current recorded pattern stays similar, the next 30 days do not show an immediate negative balance point.",
            suggestion:
              "Continue with calm review and keep entries accurate so the picture stays reliable.",
            nextStep: "Keep recording entries accurately.",
            tone: "stable",
            status: "stable"
          })
    };
  }

  /* =====================
     ADVISOR RESPONSES
  ===================== */

  async function getSpendingInsights(snapshot) {
    const summary = await resolveSummarySource(snapshot);
    return buildSituationGuidance(summary);
  }

  async function getRiskAnalysis(snapshot) {
    const predictions = await getPredictions(snapshot);
    return predictions.guidance;
  }

  async function getForecast(snapshot) {
    const summary = await resolveSummarySource(snapshot);

    if (!summary) {
      return formatResponse({
        observation: "",
        explanation: "Forecast is not available right now.",
        suggestion: "",
        nextStep: "Add real entries first.",
        tone: "neutral",
        status: "not_enough_data"
      });
    }

    const predictions = await getPredictions(summary);

    if (predictions.risk) {
      return formatResponse({
        observation: "A forward direction is available.",
        explanation: `Based on the current recorded pattern, balance could become negative in about ${predictions.risk.day} days if the same direction continues.`,
        suggestion:
          "This is not a command. It is only a calm warning based on the current recorded pattern.",
        nextStep: "Review the strongest expense area first.",
        tone: "attention",
        status: "attention"
      });
    }

    return formatResponse({
      observation: "A forward direction is available.",
      explanation:
        "Based on the current recorded pattern, no immediate negative balance point is visible in the next 30 days.",
      suggestion:
        "Continue calmly and keep entries accurate so the picture remains reliable.",
      nextStep: "Review the current summary when new entries appear.",
      tone: "stable",
      status: "stable"
    });
  }

  async function getGeneralAdvice(snapshot) {
    const summary = await resolveSummarySource(snapshot);
    return buildGeneralGuidance(summary);
  }

  async function getCategoryAdvice(snapshot) {
    const summary = await resolveSummarySource(snapshot);
    return buildCategoryGuidance(summary);
  }

  async function getAdvisorSummary(snapshot) {
    const summary = await resolveSummarySource(snapshot);
    const state = getDataState(summary);
    const guidance = buildSituationGuidance(summary);

    return {
      state,
      guidance
    };
  }

  async function getSummary() {
    return resolveSummarySource();
  }

  async function getFinancialSummary() {
    return resolveSummarySource();
  }

  async function getSnapshot() {
    const summary = await resolveSummarySource();

    if (!summary) {
      return null;
    }

    return {
      finances: {
        summary
      }
    };
  }

  async function getFinancialSnapshot() {
    return getSnapshot();
  }

  return {
    getInsights,
    getPredictions,
    getSpendingInsights,
    getRiskAnalysis,
    getForecast,
    getGeneralAdvice,
    getCategoryAdvice,
    getAdvisorSummary,
    getSummary,
    getFinancialSummary,
    getSnapshot,
    getFinancialSnapshot
  };
}