export function TransactionsView(transactions = []) {
  return `
    <div class="transactions-page">
      <div class="transactions-header">
        <h2>Transactions</h2>
      </div>
      <div id="transactions-list" class="transactions-list">
        ${renderList(transactions)}
      </div>
    </div>
  `;
}

function renderList(transactions) {
  if (!transactions.length) {
    return `<div class="empty-state">No transactions yet</div>`;
  }

  return transactions
    .slice()
    .reverse()
    .map(
      (t) => `
      <div class="transaction-item">
        <div class="left">
          <div class="category">${t.category}</div>
          <div class="date">${formatDate(t.date)}</div>
        </div>
        <div class="right ${t.type}">
          ${t.type === "expense" ? "-" : "+"}${t.amount}
        </div>
      </div>
    `
    )
    .join("");
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString();
}