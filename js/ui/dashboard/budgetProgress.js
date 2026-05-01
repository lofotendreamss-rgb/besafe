// budgetProgress.js
// BeSafe Budget Progress (Improved)

import { registry } from "../../core/service.registry.js";
import { getCurrencySymbol, getUserCurrency } from "../../services/finance/currency.js";

async function renderBudgetProgress(stats){

try{

const container = document.getElementById("budgetProgress");

if(!container){
console.warn("BudgetProgress container missing");
return;
}

/* GET FINANCE SERVICE */

const finance = registry.get("finance");

if(!finance){
console.warn("Finance service missing");
return;
}

/* GET STATS IF NOT PROVIDED */

if(!stats){

if(typeof finance.calculateFinancialStats !== "function"){
console.warn("Financial stats function missing");
return;
}

stats = await finance.calculateFinancialStats();

}

if(!stats) return;


/* VALUES */

const spent = Number(stats.monthlySpending) || 0;
const budget = Number(stats.monthlyBudget) || 1;
const sym = getCurrencySymbol(getUserCurrency());

const percent = Math.min(
100,
Math.round((spent / budget) * 100)
);

/* COLOR */

let color = "#2ecc71";

if(percent > 90){
color = "#e74c3c";
}else if(percent > 70){
color = "#f39c12";
}

/* HTML */

const html = `

<div class="budget-progress-card">

<h3>📊 Monthly Budget</h3>

<div class="budget-progress-bar" style="background:#eee; border-radius:6px; overflow:hidden;">

<div class="budget-progress-fill"
style="width:${percent}%; background:${color}; height:10px;"></div>

</div>

<div class="budget-progress-info">

<span>${spent.toFixed(2)} ${sym} / ${budget.toFixed(2)} ${sym}</span>

<span>${percent}%</span>

</div>

</div>

`;

/* RENDER */

container.innerHTML = html;

}catch(err){

console.error("BudgetProgress error:", err);

}

}

/* EXPORT */

export { renderBudgetProgress };

/* OPTIONAL GLOBAL */

window.renderBudgetProgress = renderBudgetProgress;