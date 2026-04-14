const ReceiptViewer = {

open(receipt){

if(!receipt) return

/* REMOVE OLD VIEWER */

this.close()

const shop = receipt.shop || receipt.store || "Store"

const amount = Number(receipt.total || receipt.amount || 0).toFixed(2)

let date = ""

if(receipt.date || receipt.created){
date = new Date(receipt.date || receipt.created).toLocaleString()
}

/* ITEMS */

let itemsHTML = ""

if(receipt.items && receipt.items.length){

receipt.items.forEach(item => {

const name = item.name || ""
const price = item.price || ""

itemsHTML += `
<div class="receipt-item">
<span>${name}</span>
<span>${price}</span>
</div>
`

})

}else{

itemsHTML = "<div class='receipt-empty'>No items</div>"

}

/* HTML */

const html = `

<div class="receipt-viewer-overlay" id="receiptViewer">

<div class="receipt-viewer">

<div class="receipt-header">

<div class="receipt-store">${shop}</div>
<div class="receipt-date">${date}</div>

</div>

<div class="receipt-total">
Total: €${amount}
</div>

<div class="receipt-items">

${itemsHTML}

</div>

<button class="receipt-close" id="receiptCloseBtn">
Close
</button>

</div>

</div>

`

document.body.insertAdjacentHTML("beforeend",html)

/* CLOSE BUTTON */

const btn=document.getElementById("receiptCloseBtn")

if(btn){
btn.addEventListener("click",()=>this.close())
}

},

close(){

const viewer=document.getElementById("receiptViewer")

if(viewer){
viewer.remove()
}

}

}

/* EXPORT */

window.ReceiptViewer = ReceiptViewer