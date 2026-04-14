const ArchiveSearch = {

query: "",

init(){

const input = document.getElementById("archiveSearchInput")

if(!input) return

input.addEventListener("input",(e)=>{

this.query = e.target.value.toLowerCase()

this.filter()

})

},

async filter(){

const container = document.getElementById("archiveReceipts")

if(!container) return

const receipts = await Database.getAll("receipts")

if(!receipts) return

container.innerHTML = ""

const filtered = receipts.filter(r => {

const shop = (r.shop || r.store || "").toLowerCase()
const amount = String(r.total || r.amount || "")
const date = (r.date || r.created || "").toLowerCase()

return (
shop.includes(this.query) ||
amount.includes(this.query) ||
date.includes(this.query)
)

})

if(filtered.length === 0){

container.innerHTML = "<div class='empty'>No results</div>"
return

}

filtered.forEach(r => {

const shop = r.shop || r.store || "Store"
const amount = r.total || r.amount || "0.00"
const date = r.date || r.created || ""

const card = document.createElement("div")

card.className = "receipt-card"

card.innerHTML = `
<div class="receipt-shop">${shop}</div>
<div class="receipt-amount">€${amount}</div>
<div class="receipt-date">${date}</div>
`

container.appendChild(card)

})

}

}