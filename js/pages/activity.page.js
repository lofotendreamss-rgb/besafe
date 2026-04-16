// DEPRECATED: This stub page is no longer used.
// Functionality moved to: js/pages/transactions.page.js (TransactionsPage)
//
// activity.page.js
// BeSafe Activity Page

const ActivityPage = {

init(){

const container = document.getElementById("transactions-container")

if(!container) return

container.innerHTML = `

<div class="page-card">

<h3>💰 Activity</h3>

<p>Transactions will appear here.</p>

</div>

`

}

}

/* export */

window.ActivityPage = ActivityPage