class SmartAI {

async analyzeShopping(){

if(!window.db) return null

const receipts=await window.db.getReceipts()

if(!receipts || !receipts.length){
return null
}

const storeTotals={}
const productTotals={}

for(const receipt of receipts){

const store=receipt.store || "Unknown"
const total=Number(receipt.total) || 0
const product=receipt.productName || null

/* store statistics */

if(!storeTotals[store]){
storeTotals[store]=0
}

storeTotals[store]+=total

/* product statistics */

if(product){

if(!productTotals[product]){
productTotals[product]=0
}

productTotals[product]+=total

}

}

/* most expensive store */

let expensiveStore=null
let expensiveValue=0

for(const store in storeTotals){

if(storeTotals[store]>expensiveValue){

expensiveValue=storeTotals[store]
expensiveStore=store

}

}

/* most purchased product */

let topProduct=null
let topValue=0

for(const product in productTotals){

if(productTotals[product]>topValue){

topValue=productTotals[product]
topProduct=product

}

}

return{

expensiveStore,
expensiveValue,
topProduct,
topValue

}

}


/* ========================= */
/* SHOW AI ANALYSIS */
/* ========================= */

async showAnalysis(){

const result=await this.analyzeShopping()

const box=document.getElementById("budget-info")

if(!box) return

/* jei nėra duomenų */

if(!result){

const div=document.createElement("div")

div.className="spending-insights"

div.innerHTML="📊 Not enough data yet for AI analysis."

box.appendChild(div)

return

}

/* AI insight card */

const div=document.createElement("div")

div.className="spending-insights"

div.innerHTML=`

<h3>🧠 Smart Shopping AI</h3>

<p>💸 Store where you spend most:</p>
<strong>${result.expensiveStore}</strong>

<br><br>

<p>🛒 Most frequent product:</p>
<strong>${result.topProduct}</strong>

<br><br>

<p>💰 Total spent on this product:</p>
<strong>${result.topValue.toFixed(2)} €</strong>

`

box.appendChild(div)

}

}

window.smartAI=new SmartAI()