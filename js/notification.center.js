class NotificationCenter {

constructor(){

this.checkInterval=60000

setTimeout(()=>{
this.init()
},3000)

}

/* INIT */

init(){

this.createCenter()

this.runChecks()

setInterval(()=>{
this.runChecks()
},this.checkInterval)

}

/* UI */

createCenter(){

let box=document.getElementById("besafe-notifications")

if(box) return

const container=document.getElementById("budget-info")

if(!container) return

box=document.createElement("div")

box.id="besafe-notifications"

box.className="finance-score-box"

box.innerHTML=`
<h3>🔔 BeSafe pranešimai</h3>
<div id="notification-list"></div>
`

container.prepend(box)

}

/* ADD MESSAGE */

addNotification(text){

const list=document.getElementById("notification-list")

if(!list) return

const item=document.createElement("div")

item.style.marginBottom="8px"
item.innerText=text

list.appendChild(item)

}

/* RUN CHECKS */

async runChecks(){

const list=document.getElementById("notification-list")

if(list) list.innerHTML=""

/* activity reminder */

await this.checkActivity()

/* bill reminders */

await this.checkBills()

/* warranty reminders */

if(window.app && window.app.checkWarranties){
window.app.checkWarranties()
}

}

/* ACTIVITY CHECK */

async checkActivity(){

if(!window.db) return

const transactions=await window.db.getTransactions()

if(!transactions || !transactions.length) return

let lastDate=null

transactions.forEach(t=>{

const d=new Date(t.date || Date.now())

if(!lastDate || d>lastDate){
lastDate=d
}

})

const now=new Date()

const diff=(now-lastDate)/(1000*60*60*24)

if(diff>=3){

this.addNotification(
"🤖 3 dienas nėra registruotų pirkimų. Gal pamiršote nuskenuoti čekį?"
)

}

}

/* BILL CHECK */

async checkBills(){

if(!window.db || !window.db.getBills) return

const bills=await window.db.getBills()

if(!bills || !bills.length) return

const now=new Date()

bills.forEach(b=>{

if(!b.dueDate) return

const due=new Date(b.dueDate)

const diff=(due-now)/(1000*60*60*24)

if(diff<=5 && diff>0){

this.addNotification(
`📄 Sąskaita "${b.name}" turi būti apmokėta po ${Math.floor(diff)} dienų`
)

}

if(diff<=1 && diff>0){

this.addNotification(
`⚠ Rytoj reikia apmokėti "${b.name}" sąskaitą`
)

}

})

}

}

window.notificationCenter=new NotificationCenter()