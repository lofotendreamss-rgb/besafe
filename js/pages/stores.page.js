// DEPRECATED: This stub page is no longer used.
// Functionality moved to: js/pages/places.page.js (PlacesPage)
//
// stores.page.js (was a duplicate of archive.page.js)
// BeSafe Stores Page

const ArchivePage = {

init(){

const container = document.getElementById("archive-container")

if(!container) return

container.innerHTML = `

<div class="page-card">

<h3>📁 Archive</h3>

<p>Your saved receipts and products will appear here.</p>

</div>

`

}

}

/* export */

window.ArchivePage = ArchivePage