// spending.insights.js

import { registry } from "../../core/service.registry.js";

async function renderSpendingInsights(advice){

try{

const container = document.getElementById("spendingInsights");

if(!container) return;

/* DB */

const db = registry.get("db");
if(!db) return;

await db.ready;

let html = `<h3>📊 Spending Insights</h3>`;

/* LOAD TRANSACTIONS */

let hasData = false;
let transactions = [];

if(typeof db.getTransactions === "function"){
transactions = await db.getTransactions() || [];
}

if(transactions.length){
hasData = true;

/* TOTAL EXPENSE */

const totalExpense = transactions
.filter(tx => tx.type === "expense")
.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

html += `<p>Total spent: ${totalExpense}</p>`;

/* TOP CATEGORY */

const categoryMap = {};

transactions.forEach(tx=>{
if(tx.type === "expense"){
const cat = tx.category || "other";
categoryMap[cat] = (categoryMap[cat] || 0) + Number(tx.amount || 0);
}
});

let topCategory = null;
let topValue = 0;

for(const cat in categoryMap){
if(categoryMap[cat] > topValue){
topValue = categoryMap[cat];
topCategory = cat;
}
}

if(topCategory){
html += `<p>Top category: ${topCategory} (${topValue})</p>`;
}

}

/* AI */

if(advice){

html += `

<div class="page-card" style="margin-top:15px;">

<h4>🤖 AI Advisor</h4>

<p>${advice.message}</p>

<div style="margin-top:10px;">
<strong>👉 ${advice.action}</strong>
</div>

<div style="font-size:12px; color:#666; margin-top:5px;">
${advice.impact}
</div>

</div>

`;

}else{

html += `<p>No AI data</p>`;

}

/* EMPTY STATE */

if(!hasData){
html += `<p style="margin-top:10px;">No spending data yet.</p>`;
}

container.innerHTML = html;

}catch(err){
console.error("SpendingInsights error:", err);
}

}

export { renderSpendingInsights };
window.renderSpendingInsights = renderSpendingInsights;