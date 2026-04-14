class BudgetLimit{

saveBudget(){

const input=document.getElementById("monthly-budget-input")

if(!input)return

const value=parseFloat(input.value)

if(isNaN(value)){
alert("Įveskite biudžetą")
return
}

localStorage.setItem("besafe_monthly_budget",value)

this.update()

}

async update(){

const budget=parseFloat(localStorage.getItem("besafe_monthly_budget"))

if(!budget)return

const transactions=await window.db.getTransactions()

let expense=0

const now=new Date()

const month=now.getMonth()
const year=now.getFullYear()

transactions.forEach(t=>{

const d=new Date(t.date)

if(
t.type==="expense" &&
d.getMonth()===month &&
d.getFullYear()===year
){
expense+=Number(t.amount)
}

})

const left=budget-expense

let percent=(expense/budget)*100

if(percent>100){
percent=100
}

const spentEl=document.getElementById("budget-spent")
const leftEl=document.getElementById("budget-left")
const progressText=document.getElementById("budget-progress-text")
const fill=document.getElementById("budget-progress-fill")

if(spentEl){
spentEl.innerText="Išleista: "+expense.toFixed(2)+" €"
}

if(leftEl){
leftEl.innerText="Liko: "+left.toFixed(2)+" €"
}

if(progressText){
progressText.innerText="Biudžeto panaudojimas: "+percent.toFixed(0)+"%"
}

if(fill){

fill.style.width=percent+"%"

if(percent<60){
fill.style.background="green"
}
else if(percent<90){
fill.style.background="orange"
}
else{
fill.style.background="red"
}

}

}

}

window.budgetLimit=new BudgetLimit()