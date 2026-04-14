class FinanceScore {

constructor(){

setTimeout(()=>{
this.calculateScore()
},3000)

}

/* ========================= */
/* MAIN SCORE CALCULATION */
/* ========================= */

async calculateScore(){

if(!window.db) return

const transactions=await window.db.getTransactions()

if(!transactions || !transactions.length) return

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

let score=100

/* ========================= */
/* INCOME vs EXPENSE */
/* ========================= */

if(expense>income){

score-=30

}else{

const savingRate=(income-expense)/income

if(savingRate<0.1) score-=15
if(savingRate>0.3) score+=5

}

/* ========================= */
/* CATEGORY RISK */
/* ========================= */

let topCategory=null
let topAmount=0

Object.keys(categories).forEach(c=>{

if(categories[c]>topAmount){
topAmount=categories[c]
topCategory=c
}

})

if(topCategory==="fun"){
score-=10
}

if(topCategory==="transport"){
score-=5
}

/* ========================= */
/* STABILITY */
/* ========================= */

const expenseRatio=expense/(income||1)

if(expenseRatio>0.9){
score-=20
}

if(expenseRatio<0.6){
score+=10
}

/* ========================= */
/* LIMIT SCORE */
/* ========================= */

if(score>100) score=100
if(score<0) score=0

this.showScore(score)

}

/* ========================= */
/* SHOW RESULT */
/* ========================= */

showScore(score){

const el=document.getElementById("budget-info")

if(!el) return

let color="green"

if(score<70) color="orange"
if(score<50) color="red"

const box=document.createElement("div")

box.className="finance-score-box"

box.innerHTML=`

<h3>🧠 Finansinė sveikata</h3>

<div style="
font-size:34px;
font-weight:bold;
color:${color};
">

${score} / 100

</div>

`

el.prepend(box)

}

}

window.financeScore=new FinanceScore()