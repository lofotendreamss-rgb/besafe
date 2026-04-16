function getAdvice(state) {
  const { income = 0, expenses = 0, balance = 0, transactions = [] } = state;

  // 1. Basic signals
  const signals = [];

  if (income === 0 && expenses === 0) {
    signals.push({
      type: "empty",
      message: "No financial data yet."
    });
  }

  if (expenses > income) {
    signals.push({
      type: "overspending",
      message: "You are spending more than you earn."
    });
  }

  if (balance < 0) {
    signals.push({
      type: "negative_balance",
      message: "Your balance is negative."
    });
  }

  if (income > 0 && expenses / income > 0.8) {
    signals.push({
      type: "high_spending_ratio",
      message: "You are using most of your income."
    });
  }

  // 2. Recent activity
  const recent = transactions.slice(0, 5);

  const recentExpenses = recent.filter(t => t.type === "expense");
  const recentIncome = recent.filter(t => t.type === "income");

  if (recentExpenses.length >= 3 && recentIncome.length === 0) {
    signals.push({
      type: "expense_streak",
      message: "Recent activity shows only expenses."
    });
  }

  // 3. Build response (structured)
  let observation = "Your finances are stable.";
  let explanation = "Income and expenses are balanced.";
  let suggestion = "Keep tracking your activity.";

  if (signals.length > 0) {
    const main = signals[0];

    switch (main.type) {
      case "empty":
        observation = "No financial data detected.";
        explanation = "System has no transactions yet.";
        suggestion = "Add your first income or expense.";
        break;

      case "overspending":
        observation = "You are overspending.";
        explanation = "Expenses exceed your income.";
        suggestion = "Reduce non-essential spending.";
        break;

      case "negative_balance":
        observation = "Your balance is below zero.";
        explanation = "You have spent more than available funds.";
        suggestion = "Prioritize income or cut expenses immediately.";
        break;

      case "high_spending_ratio":
        observation = "Spending is very high.";
        explanation = "Most of your income is being used.";
        suggestion = "Try to save at least 20% of income.";
        break;

      case "expense_streak":
        observation = "Spending streak detected.";
        explanation = "Recent transactions are mostly expenses.";
        suggestion = "Pause and review recent purchases.";
        break;
    }
  }

  return `
Observation: ${observation}
Explanation: ${explanation}
Suggestion: ${suggestion}
`.trim();
}

// CommonJS export (for Node/tests)
if (typeof module !== "undefined" && module.exports) {
  module.exports = { getAdvice };
}

// Browser global
if (typeof window !== "undefined") {
  window.getAdvice = getAdvice;
}