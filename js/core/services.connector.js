/* =============================================
   Services Connector
   Wires disconnected AI + Finance services into
   the BeSafe app after boot completes.
   ============================================= */

import { registry } from "./service.registry.js";
import { MemoryService } from "../services/ai/memory.service.js";

let initialized = false;
let memoryService = null;

/* =====================
   INIT
===================== */

export async function initConnectedServices() {
  if (initialized) return;
  initialized = true;

  console.log("[Connector] Connecting services...");

  // --- MemoryService (ES module) ---
  try {
    memoryService = new MemoryService();
    registry.register("memory", memoryService);
    console.log("[Connector] MemoryService registered");
  } catch (error) {
    console.warn("[Connector] MemoryService failed:", error);
  }

  // --- Old-style globals (loaded via script tags) ---
  // These self-initialize on load, we just let them run.
  // AIPrediction  -> window.aiPrediction   (auto-runs runPrediction)
  // AIReport      -> window.aiReport       (auto-runs checkMonthlyReport)
  // FinanceScore  -> window.financeScore   (auto-runs calculateScore)
  // FinanceAutopilot -> window.financeAutopilot (auto-runs analysis)
  // generateAIInsight -> window.generateAIInsight (callable function)

  console.log("[Connector] Services connected");
}

/* =====================
   PUBLIC API
   These are safe to call at any time.
   They return null/defaults when data
   is not yet available.
===================== */

/**
 * Get financial health score (0-100).
 * Uses FinanceAutopilot's getFinanceHealthScore if available.
 */
export async function getFinancialScore() {
  try {
    // Try FinanceAutopilot first (has a proper async method)
    if (window.financeAutopilot && typeof window.financeAutopilot.getFinanceHealthScore === "function") {
      const score = await window.financeAutopilot.getFinanceHealthScore();
      return { score, source: "financeAutopilot" };
    }

    // Fallback: calculate from advisor summary
    const advisor = registry.getOptional("advisor");
    if (advisor) {
      const summary = await advisor.getAdvisorSummary();
      if (summary && summary.state) {
        const { income, expenses } = summary.state;
        if (income === 0 && expenses === 0) {
          return { score: 50, source: "default" };
        }
        const ratio = expenses / (income || 1);
        let score = 100;
        if (ratio > 0.9) score = 40;
        else if (ratio > 0.8) score = 60;
        else if (ratio > 0.7) score = 75;
        else score = 90;
        return { score, source: "advisor" };
      }
    }

    // Fallback 3: Calculate from raw transaction data
    try {
      const transactionService = registry.getOptional("transactions");
      if (transactionService && typeof transactionService.getTransactions === "function") {
        const transactions = await transactionService.getTransactions();
        if (Array.isArray(transactions) && transactions.length > 0) {
          const income = transactions.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount || 0), 0);
          const expenses = transactions.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount || 0), 0);
          if (income === 0 && expenses === 0) return { score: 50, source: "default" };
          const ratio = expenses / (income || 1);
          let score = 100;
          if (ratio > 1.0) score = 30;
          else if (ratio > 0.9) score = 45;
          else if (ratio > 0.8) score = 60;
          else if (ratio > 0.7) score = 75;
          else score = 90;
          return { score, source: "transactions" };
        }
      }
    } catch (e) {
      console.warn("[Connector] Transaction fallback failed:", e);
    }

    return { score: null, source: "unavailable" };
  } catch (error) {
    console.warn("[Connector] getFinancialScore failed:", error);
    return { score: null, source: "error" };
  }
}

/**
 * Get combined financial insights from the advisor engine
 * and the main BeSafe advisor.
 */
export async function getFinancialInsights() {
  const insights = [];

  try {
    // 1. BeSafe Advisor insights (already connected)
    const advisor = registry.getOptional("advisor");
    if (advisor) {
      const advisorInsights = await advisor.getInsights();
      if (Array.isArray(advisorInsights)) {
        advisorInsights.forEach(item => {
          insights.push({
            source: "advisor",
            type: item.type || "info",
            observation: item.text?.observation || "",
            explanation: item.text?.explanation || "",
            suggestion: item.text?.suggestion || "",
            tone: item.text?.tone || "neutral"
          });
        });
      }
    }

    // 2. Advisor Engine (getAdvice) — quick signal-based advice
    const advisorEngineAdvice = getAdvisorEngineAdvice();
    if (advisorEngineAdvice) {
      insights.push({
        source: "advisorEngine",
        type: "signal",
        observation: advisorEngineAdvice,
        explanation: "",
        suggestion: "",
        tone: "neutral"
      });
    }

    // 3. Financial score
    const scoreResult = await getFinancialScore();
    if (scoreResult.score !== null) {
      insights.push({
        source: "financeScore",
        type: "score",
        observation: `Financial health: ${scoreResult.score}/100`,
        explanation: scoreResult.score >= 75
          ? "Your financial health looks stable."
          : scoreResult.score >= 50
            ? "Your financial health needs some attention."
            : "Your financial health needs urgent review.",
        suggestion: "",
        tone: scoreResult.score >= 75 ? "stable" : scoreResult.score >= 50 ? "neutral" : "attention"
      });
    }
  } catch (error) {
    console.warn("[Connector] getFinancialInsights failed:", error);
  }

  return insights;
}

/**
 * Get spending alerts from FinanceAutopilot data.
 * Returns category spending breakdown.
 */
export async function getSpendingAlerts() {
  const alerts = [];

  try {
    // Use the advisor to get spending insights
    const advisor = registry.getOptional("advisor");
    if (advisor) {
      const spending = await advisor.getSpendingInsights();
      if (spending && spending.status !== "not_enough_data") {
        alerts.push({
          type: spending.status,
          observation: spending.observation || "",
          suggestion: spending.suggestion || "",
          tone: spending.tone || "neutral"
        });
      }
    }

    // Add prediction risk if available
    if (advisor) {
      const predictions = await advisor.getPredictions();
      if (predictions && predictions.risk) {
        alerts.push({
          type: "forecast_risk",
          observation: predictions.guidance?.observation || "Balance may decrease.",
          suggestion: predictions.guidance?.suggestion || "Review expenses.",
          tone: "attention"
        });
      }
    }
  } catch (error) {
    console.warn("[Connector] getSpendingAlerts failed:", error);
  }

  return alerts;
}

/**
 * Get quick advice from advisor.engine.js (the simple getAdvice function).
 * This uses window.db if available, otherwise returns null.
 */
function getAdvisorEngineAdvice() {
  try {
    if (!window.db) return null;

    // advisor.engine.js uses module.exports — we access it differently.
    // Since it's loaded as a plain script, we check window.getAdvice
    if (typeof window.getAdvice === "function") {
      // We'd need state — but we don't have it sync. Return null for now,
      // the async version below handles it.
      return null;
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Get advice from advisor.engine.js with async data fetch.
 */
export async function getAdvisorEngineInsight() {
  try {
    if (typeof window.getAdvice !== "function") return null;
    if (!window.db) return null;

    const transactions = await window.db.getTransactions();
    if (!transactions || !transactions.length) return null;

    let income = 0;
    let expenses = 0;

    transactions.forEach(t => {
      const amount = Number(t.amount) || 0;
      if (t.type === "income") income += amount;
      if (t.type === "expense") expenses += amount;
    });

    const balance = income - expenses;

    const advice = window.getAdvice({
      income,
      expenses,
      balance,
      transactions
    });

    return advice || null;
  } catch (error) {
    console.warn("[Connector] getAdvisorEngineInsight failed:", error);
    return null;
  }
}

/**
 * Trigger AI insight rendering into the #aiInsight container
 * (if the old-style generateAIInsight function is available).
 */
export function triggerAIInsightRender(stats) {
  if (typeof window.generateAIInsight === "function") {
    window.generateAIInsight(stats);
  }
}

/**
 * Get the MemoryService instance.
 */
export function getMemoryService() {
  return memoryService;
}
