// spending.chart.js
// BeSafe Spending Chart (Improved)

import { registry } from "../../core/service.registry.js";

const SpendingChart = {

chart: null,

async render(){

try{

const container = document.getElementById("spendingChart");

if(!container){
console.warn("SpendingChart container missing");
return;
}

/* CHECK CHART.JS */

if(typeof Chart === "undefined"){
console.warn("Chart.js not loaded");
return;
}

/* GET DATABASE */

const db = registry.get("db");

if(!db){
console.warn("Database service missing");
return;
}

await db.ready;

if(typeof db.getTransactions !== "function"){
console.warn("getTransactions not implemented");
container.innerHTML = "No spending data";
return;
}

const transactions = await db.getTransactions();

if(!transactions || transactions.length === 0){
container.innerHTML = "No spending data";
return;
}

/* CATEGORY TOTALS */

const totals = {};

transactions.forEach(t => {

if(t.type === "income") return;

const cat = t.category || "Other";

if(!totals[cat]){
totals[cat] = 0;
}

totals[cat] += Number(t.amount) || 0;

});

const labels = Object.keys(totals);
const values = Object.values(totals);

if(labels.length === 0){
container.innerHTML = "No spending data";
return;
}

/* CREATE CANVAS */

container.innerHTML = `<canvas id="spendingChartCanvas"></canvas>`;

const ctx = document.getElementById("spendingChartCanvas");

/* DESTROY OLD */

if(this.chart){
this.chart.destroy();
}

/* CREATE CHART */

this.chart = new Chart(ctx,{

type: "doughnut",

data:{
labels: labels,
datasets:[{
data: values
}]
},

options:{
responsive: true,
plugins:{
legend:{
position:"bottom"
}
}
}

});

}catch(err){

console.error("SpendingChart error:", err);

}

}

};


/* EXPORT */

export { SpendingChart };