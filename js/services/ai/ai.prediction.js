class AIPrediction {

constructor(){

this.init()

}

/* ========================= */
/* INIT */
/* ========================= */

init(){

setTimeout(()=>{

this.runPrediction()

},5000)

}

/* ========================= */
/* MAIN PREDICTION */
/* ========================= */

async runPrediction(){

if(!window.db) return

const transactions=await window.db.getTransactions()

if(!transactions || transactions.length<3) return

const now=new Date()

let monthExpense=0
const categories={}

/* paskutinių 30 dienų analizė */

const days30=new Date()
days30.setDate(now.getDate()-30)

transactions.forEach(t=>{

if(t.type!=="expense") return

const date=new Date(t.date)

if(date>=days30){

const amount=Number(t.amount)||0

monthExpense+=amount

const cat=t.category || "other"

if(!categories[cat]){
categories[cat]=0
}

categories[cat]+=amount

}

})

if(monthExpense===0) return

/* vidutinė dienos išlaida */

const avgPerDay=monthExpense/30

const daysInMonth=new Date(
now.getFullYear(),
now.getMonth()+1,
0
).getDate()

const predicted=avgPerDay*daysInMonth

this.showPrediction(predicted,monthExpense,categories)

}

/* ========================= */
/* SHOW RESULT */
/* ========================= */

showPrediction(predicted,current,categories){

const el=document.getElementById("finance-autopilot")

if(!el) return

/* TOP CATEGORY */

let topCategory=null
let topValue=0

Object.keys(categories).forEach(c=>{

if(categories[c]>topValue){

topValue=categories[c]
topCategory=c

}

})

/* MESSAGE */

let html=`<h3>🤖 AI Spending Forecast</h3>`

html+=`
<div class="finance-autopilot">
<strong>Estimated monthly spending:</strong><br>
${predicted.toFixed(2)} €
</div>
`

html+=`
<div class="finance-autopilot">
<strong>Current spending:</strong><br>
${current.toFixed(2)} €
</div>
`

/* TREND WARNING */

if(predicted>current*1.4){

html+=`
<div class="finance-autopilot">
⚠ Spending trend is increasing
</div>
`

}

/* TOP CATEGORY */

if(topCategory){

html+=`
<div class="finance-autopilot">
Top spending category:<br>
<strong>${topCategory}</strong>
</div>
`

}

/* AI TIP */

if(predicted>1000){

html+=`
<div class="finance-autopilot">
💡 AI Tip: Try reducing non-essential spending this month.
</div>
`

}else{

html+=`
<div class="finance-autopilot">
✅ Your spending trend looks healthy.
</div>
`

}

el.innerHTML=html

}

}

window.aiPrediction=new AIPrediction()