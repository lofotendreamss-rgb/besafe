// dailyLimit.js
// BeSafe Daily Limit Widget (Improved)

import { registry } from "../../core/service.registry.js";
import { getCurrencySymbol, getUserCurrency } from "../../services/finance/currency.js";

async function renderDailyLimit(stats){

try{

const container = document.getElementById("dailyLimit");

if(!container){
console.warn("DailyLimit container missing");
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
console.warn("Financial stats method missing");
return;
}

stats = await finance.calculateFinancialStats();

}

if(!stats) return;


/* VALUES */

const limit = Number(stats.dailyLimit) || 0;
const remaining = Number(stats.dailyRemaining) || 0;
const sym = getCurrencySymbol(getUserCurrency());

/* PROGRESS */

let progress = 0;

if(limit > 0){
progress = Math.min(100, ((limit - remaining) / limit) * 100);
}

let color = "#2ecc71";

if(progress > 80){
color = "#e74c3c";
}else if(progress > 50){
color = "#f39c12";
}

/* HTML */

const html = `

<div class="daily-limit-card">

<h3>📅 Daily Limit</h3>

<div class="daily-limit-row">
<span class="limit-label">Limit</span>
<span class="limit-value">${sym} ${limit.toFixed(2)}</span>
</div>

<div class="daily-limit-row">
<span class="limit-label">Remaining</span>
<span class="limit-value">${sym} ${remaining.toFixed(2)}</span>
</div>

<div style="margin-top:10px;">
<div style="height:6px; background:#eee; border-radius:4px;">
<div style="width:${progress}%; height:6px; background:${color}; border-radius:4px;"></div>
</div>
</div>

</div>

`;

/* RENDER */

container.innerHTML = html;

}catch(err){

console.error("DailyLimit error:", err);

}

}

/* EXPORT */

export { renderDailyLimit };

/* OPTIONAL GLOBAL */

window.renderDailyLimit = renderDailyLimit;