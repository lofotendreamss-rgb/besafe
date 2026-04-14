const ArchiveReceipts = {

async render(){

const container = document.getElementById("archiveReceipts")

if(!container) return

container.innerHTML = "Loading receipts..."

try{

if(!window.db){
container.innerHTML = "Database not ready"
return
}

const receipts = await window.db.getReceipts()

if(!receipts || receipts.length === 0){

container.innerHTML = "<div class='empty'>No receipts found</div>"
return

}

container.innerHTML = ""

/* SAFE SORT */

receipts.sort((a,b)=>{

const da = new Date(a.date || a.created || 0)
const db = new Date(b.date || b.created || 0)

return db - da

})

receipts.forEach(r => {

const shop = r.shop || r.store || "Store"

const amount = Number(r.total || r.amount || 0).toFixed(2)

const dateRaw = r.date || r.created

let date = ""

if(dateRaw){
date = new Date(dateRaw).toLocaleDateString()
}

const card = document.createElement("div")

card.className = "receipt-card"

card.innerHTML = `
<div class="receipt-shop">${shop}</div>
<div class="receipt-amount">€${amount}</div>
<div class="receipt-date">${date}</div>
`

/* CLICK EVENT */

card.addEventListener("click",()=>{

if(window.ReceiptViewer){
ReceiptViewer.open(r)
}

})

container.appendChild(card)

})

}catch(e){

console.error("ArchiveReceipts error", e)

container.innerHTML = "Error loading receipts"

}

}

}

window.ArchiveReceipts = ArchiveReceipts