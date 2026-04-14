import TransactionService from "../../services/finance/transaction.service.js";

class RecentActivity {

render(container){

const transactions = TransactionService.getRecentTransactions(5);

if(!transactions.length){
container.innerHTML = `
<div class="card">
<h3>Recent Activity</h3>
<p>No transactions yet</p>
</div>
`;
return;
}

const rows = transactions.map(tx => {

const sign = tx.type === "expense" ? "-" : "+";
const color = tx.type === "expense" ? "#e74c3c" : "#27ae60";
const date = new Date(tx.date).toLocaleDateString();

return `
<div class="tx-row" data-id="${tx.id}">

<div>
<strong>${tx.category}</strong>
<br>
<small>${date}</small>
</div>

<div style="display:flex; gap:8px; align-items:center;">

<div style="color:${color}">
${sign}${tx.amount}
</div>

<button class="tx-edit" data-id="${tx.id}">✎</button>
<button class="tx-delete" data-id="${tx.id}">✕</button>

</div>

</div>
`;

}).join("");

container.innerHTML = `
<div class="card">
<h3>Recent Activity</h3>
<div class="tx-list">
${rows}
</div>
</div>
`;

this.bindActions();

}

bindActions(){

/* DELETE */

document.querySelectorAll(".tx-delete").forEach(btn => {

btn.addEventListener("click", async (e) => {

const id = e.currentTarget.dataset.id;

await TransactionService.deleteTransaction(id);

if(window.loadHomeDashboard){
await window.loadHomeDashboard();
}

});

});

/* EDIT */

document.querySelectorAll(".tx-edit").forEach(btn => {

btn.addEventListener("click", async (e) => {

const id = e.currentTarget.dataset.id;

const newAmount = prompt("New amount:");

if(!newAmount) return;

await TransactionService.updateTransaction(id, {
amount: Number(newAmount)
});

if(window.loadHomeDashboard){
await window.loadHomeDashboard();
}

});

});

}

}

export default new RecentActivity();