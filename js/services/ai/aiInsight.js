// aiInsight.js
// BeSafe AI Insight

async function generateAIInsight(stats){

try{

const container = document.getElementById("aiInsight");

if(!container) return;

/* get stats if not provided */

if(!stats){

if(typeof calculateFinancialStats !== "function") return;

stats = await calculateFinancialStats();

}

if(!stats) return;

/* values */

const monthlySpending = Number(stats.monthlySpending) || 0;
const monthlyBudget = Number(stats.monthlyBudget) || 1;

const usage = (monthlySpending / monthlyBudget) * 100;

/* message logic */

let message = "";

if(usage > 90){

message = "⚠ You may exceed your monthly budget.";

}
else if(usage > 70){

message = "Your spending is approaching the monthly budget.";

}
else if(usage < 40){

message = "Great job! Your spending is under control.";

}
else{

message = "Your spending is within a normal range.";

}

/* render */

container.innerHTML = `

<div class="ai-insight-card">

<h3>🤖 AI Insight</h3>

<div class="ai-message">

${message}

</div>

<button class="ai-advisor-btn" id="open-ai-advisor">
Open AI Advisor
</button>

</div>

`;

/* advisor button */

const btn = document.getElementById("open-ai-advisor");

if(btn){

btn.addEventListener("click",()=>{

if(window.app){
window.app.showPage("advisor");
}

});

}

}catch(err){

console.error("AI Insight error:", err);

}

}

/* register global */

window.generateAIInsight = generateAIInsight;