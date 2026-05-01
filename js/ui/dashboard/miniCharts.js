// miniCharts.js
// BeSafe Charts (Weekly + Forecast)

import { registry } from "../../core/service.registry.js";
import { getCurrencySymbol, getUserCurrency } from "../../services/finance/currency.js";

async function renderMiniCharts(stats){

try{

const container = document.getElementById("miniCharts");

if(!container){
console.warn("MiniCharts container missing");
return;
}

/* SERVICES */

const finance = registry.get("finance");
const advisor = registry.get("aiAdvisor");

if(!finance){
console.warn("Finance service missing");
return;
}

/* GET STATS */

if(!stats){

if(typeof finance.calculateFinancialStats !== "function"){
console.warn("Financial stats method missing");
return;
}

stats = await finance.calculateFinancialStats();

}

if(!stats) return;


/* =====================
   📈 WEEKLY SPENDING
===================== */

const weekly = Array.isArray(stats.weeklySpending)
? stats.weeklySpending
: [0,0,0,0,0,0,0];

const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const max = Math.max(...weekly,1);

const total = weekly.reduce((sum,v)=>sum + Number(v || 0),0);

let bars = "";

weekly.forEach((value,i)=>{

const height = (Number(value)/max)*100;

bars += `
<div class="chart-bar">
  <div class="bar-fill" style="height:${height}%"></div>
  <span class="bar-label">${days[i]}</span>
</div>
`;

});

const weeklyHTML = `
<div class="mini-chart-card">
  <h3>📈 Weekly Spending</h3>
  <div class="mini-chart">
    ${bars}
  </div>
  <div style="margin-top:10px; font-size:12px; color:#666;">
    Total: ${getCurrencySymbol(getUserCurrency())} ${total.toFixed(2)}
  </div>
</div>
`;


/* =====================
   🔮 FORECAST CHART
===================== */

let forecastHTML = "";

if(advisor && advisor.getFullAdvice){

const advice = await advisor.getFullAdvice();
const forecast = advice?.predictions?.forecast || [];

const preview = forecast.slice(0,7);

const balances = preview.map(d => d.balance);
const maxB = Math.max(...balances,1);
const minB = Math.min(...balances,0);

let line = "";

preview.forEach((d,i)=>{

const normalized = (d.balance - minB) / (maxB - minB || 1);
const height = normalized * 100;

line += `
<div class="chart-bar">
  <div class="bar-fill" style="height:${height}%"></div>
  <span class="bar-label">${i+1}</span>
</div>
`;

});

forecastHTML = `
<div class="mini-chart-card">
  <h3>🔮 Balance Trend (7 days)</h3>
  <div class="mini-chart">
    ${line}
  </div>
  <div style="margin-top:10px; font-size:12px; color:#666;">
    Direction of your balance over the next days
  </div>
</div>
`;

}


/* =====================
   RENDER
===================== */

container.innerHTML = `
${weeklyHTML}
${forecastHTML}
`;

}catch(err){

console.error("MiniCharts error:", err);

}

}


/* EXPORT */

export { renderMiniCharts };

/* GLOBAL */

window.renderMiniCharts = renderMiniCharts;