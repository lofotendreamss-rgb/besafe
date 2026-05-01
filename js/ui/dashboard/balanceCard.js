// balanceCard.js
// BeSafe Balance Card (Improved)

import { registry } from "../../core/service.registry.js";
import { getCurrencySymbol, getUserCurrency } from "../../services/finance/currency.js";

export async function renderBalanceCard(stats){

try{

const container = document.getElementById("balanceCard");

if(!container){
console.warn("BalanceCard container missing");
return;
}

/* GET FINANCE SERVICE */

const finance = registry.get("finance");

if(!finance){
console.warn("Financial engine missing");
return;
}

/* GET STATS IF NOT PROVIDED */

if(!stats){

if(typeof finance.calculateFinancialStats !== "function"){
console.warn("Financial stats method missing");
return;
}

stats = await finance.calculateFinancialStats();

}

if(!stats) return;


/* SAFE VALUES */

const balance = Number(stats.balance) || 0;
const today = Number(stats.todaySpending) || 0;
const remaining = Number(stats.dailyRemaining) || 0;
const sym = getCurrencySymbol(getUserCurrency());

/* COLOR LOGIC */

let balanceColor = "#2ecc71";

if(balance < 0){
balanceColor = "#e74c3c";
}else if(balance < 100){
balanceColor = "#f39c12";
}

/* HTML */

const html = `
<div class="balance-card">

<div class="balance-main">

<div class="balance-label">Balance</div>

<div class="balance-value" style="color:${balanceColor}">
${sym} ${balance.toFixed(2)}
</div>

</div>

<div class="balance-stats">

<div class="balance-stat">

<span class="stat-label">Today spent</span>

<span class="stat-value">
${sym} ${today.toFixed(2)}
</span>

</div>

<div class="balance-stat">

<span class="stat-label">Daily remaining</span>

<span class="stat-value">
${sym} ${remaining.toFixed(2)}
</span>

</div>

</div>

</div>
`;

/* RENDER */

container.innerHTML = html;

}catch(err){

console.error("BalanceCard error:", err);

}

}