class AIReport {

constructor(){

this.lastReportKey="besafe_last_report"

setTimeout(()=>{

this.checkMonthlyReport()

},7000)

}

/* ======================= */
/* CHECK MONTHLY REPORT */
/* ======================= */

async checkMonthlyReport(){

if(!window.db) return

const now=new Date()

const monthKey=now.getFullYear()+"-"+(now.getMonth()+1)

const lastReport=localStorage.getItem(this.lastReportKey)

if(lastReport===monthKey) return

const report=await this.generateReport()

if(report){

this.showReport(report)

localStorage.setItem(this.lastReportKey,monthKey)

}

}

/* ======================= */
/* GENERATE REPORT */
/* ======================= */

async generateReport(){

const transactions=await window.db.getTransactions()

if(!transactions || !transactions.length) return null

const now=new Date()

const currentMonth=now.getMonth()
const currentYear=now.getFullYear()

const prevMonth=currentMonth===0?11:currentMonth-1
const prevYear=currentMonth===0?currentYear-1:currentYear

let currentTotal=0
let prevTotal=0

const categories={}

/* ANALYSIS */

transactions.forEach(t=>{

if(t.type!=="expense") return

const date=new Date(t.date||Date.now())

const amount=Number(t.amount)||0

if(date.getMonth()===currentMonth && date.getFullYear()===currentYear){

currentTotal+=amount

if(!categories[t.category]){
categories[t.category]=0
}

categories[t.category]+=amount

}

if(date.getMonth()===prevMonth && date.getFullYear()===prevYear){

prevTotal+=amount

}

})

/* TREND */

let trend=""

if(prevTotal>0){

const diff=((currentTotal-prevTotal)/prevTotal)*100

if(diff>0){
trend=`📈 Spending increased ${diff.toFixed(1)}%`
}else{
trend=`📉 Spending decreased ${Math.abs(diff).toFixed(1)}%`
}

}

/* TOP CATEGORY */

let topCategory="other"
let topValue=0

Object.keys(categories).forEach(c=>{

if(categories[c]>topValue){
topValue=categories[c]
topCategory=c
}

})

/* AI ADVICE */

let advice=""

if(topValue>300){

advice=`AI recommendation:
Consider reducing "${topCategory}" expenses by 10-15%.`

}else{

advice=`AI recommendation:
Your spending distribution looks healthy.`

}

/* REPORT TEXT */

let report=

`📊 BeSafe Monthly Financial Report

Total spending: ${currentTotal.toFixed(2)} €

Top category:
${topCategory} — ${topValue.toFixed(2)} €

${trend}

${advice}
`

return report

}

/* ======================= */
/* SHOW REPORT */
/* ======================= */

showReport(text){

if(window.notificationCenter){

window.notificationCenter.addNotification(text)

}else{

alert(text)

}

}

}

window.aiReport=new AIReport()