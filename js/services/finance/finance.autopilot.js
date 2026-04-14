class FinanceAutopilot {

constructor(){

this.lastAlert=localStorage.getItem("besafe_last_alert")
this.lastMonthlyReport=localStorage.getItem("besafe-last-report")

this.start()

}

/* ========================= */
/* START AUTOPILOT */
/* ========================= */

start(){

/* paleidimas po aplikacijos starto */

setTimeout(()=>{

this.runAnalysis()

},5000)

/* periodinis tikrinimas kas 10 min */

setInterval(()=>{

this.runAnalysis()

},600000)

}

/* ========================= */
/* MAIN ANALYSIS */
/* ========================= */

async runAnalysis(){

if(!window.db) return

const transactions=await window.db.getTransactions()

if(!transactions || !transactions.length) return

this.checkSpendingAlerts(transactions)

this.checkMonthlyReport(transactions)

this.detectSpendingTrend(transactions)

}

/* ========================= */
/* SPENDING ALERT */
/* ========================= */

checkSpendingAlerts(transactions){

let categories={}

transactions.forEach(t=>{

if(t.type==="expense"){

if(!categories[t.category]){
categories[t.category]=0
}

categories[t.category]+=Number(t.amount)||0

}

})

let topCategory=null
let topAmount=0

Object.keys(categories).forEach(c=>{

if(categories[c]>topAmount){
topAmount=categories[c]
topCategory=c
}

})

if(!topCategory) return

const now=Date.now()

if(this.lastAlert && now-this.lastAlert<86400000){
return
}

if(topAmount>200){

alert(

`⚠️ Spending alert

You spent ${topAmount.toFixed(2)} € on ${topCategory}.

AI recommendation:
Try reducing this category.`

)

localStorage.setItem("besafe_last_alert",now)

}

}

/* ========================= */
/* SPENDING TREND AI */
/* ========================= */

detectSpendingTrend(transactions){

const now=new Date()

const days7=new Date()
days7.setDate(now.getDate()-7)

let recent=0
let older=0

transactions.forEach(t=>{

if(t.type!=="expense") return

const d=new Date(t.date)

if(d>=days7){

recent+=Number(t.amount)

}else{

older+=Number(t.amount)

}

})

if(older===0) return

const ratio=recent/older

if(ratio>1.4){

console.log("AI trend: spending increasing")

}

}

/* ========================= */
/* MONTHLY REPORT */
/* ========================= */

checkMonthlyReport(transactions){

const now=new Date()

const monthKey=now.getFullYear()+"-"+now.getMonth()

if(this.lastMonthlyReport===monthKey) return

if(now.getDate()<28) return

this.generateMonthlyReport(transactions)

localStorage.setItem("besafe-last-report",monthKey)

}

/* ========================= */
/* GENERATE REPORT */
/* ========================= */

generateMonthlyReport(transactions){

let income=0
let expense=0

let categories={}

transactions.forEach(t=>{

const amount=Number(t.amount)||0

if(t.type==="income"){
income+=amount
}

if(t.type==="expense"){

expense+=amount

if(!categories[t.category]){
categories[t.category]=0
}

categories[t.category]+=amount

}

})

let topCategory=null
let topAmount=0

Object.keys(categories).forEach(c=>{

if(categories[c]>topAmount){
topAmount=categories[c]
topCategory=c
}

})

const balance=income-expense

let msg=

`📊 AI Monthly Financial Report

Income: ${income.toFixed(2)} €
Expenses: ${expense.toFixed(2)} €
Balance: ${balance.toFixed(2)} €

Top spending category:
${topCategory} (${topAmount.toFixed(2)} €)

AI tip:
Reducing this category by 15% could save ${(topAmount*0.15).toFixed(2)} € next month.`

alert(msg)

}

/* ========================= */
/* FINANCE HEALTH */
/* ========================= */

async getFinanceHealthScore(){

if(!window.db) return 0

const transactions=await window.db.getTransactions()

let income=0
let expense=0

transactions.forEach(t=>{

const amount=Number(t.amount)||0

if(t.type==="income") income+=amount
if(t.type==="expense") expense+=amount

})

if(income===0) return 50

const ratio=expense/income

let score=100

if(ratio>0.9) score=40
else if(ratio>0.8) score=60
else if(ratio>0.7) score=75
else score=90

return score

}

}

/* INIT */

window.financeAutopilot=new FinanceAutopilot()