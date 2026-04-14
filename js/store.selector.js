const StoreSelector = {

async render(){

if(!window.StoresManager) return

await StoresManager.load()

const select = document.getElementById("storeSelector")

if(!select) return

select.innerHTML = ""

const stores = StoresManager.getAll()

if(!stores.length){

const option = document.createElement("option")
option.textContent = "No stores"
option.value = ""

select.appendChild(option)

return
}

stores.forEach(store => {

const option = document.createElement("option")

option.value = store.name
option.textContent = store.name

select.appendChild(option)

})

},

getSelected(){

const select = document.getElementById("storeSelector")

if(!select) return ""

return select.value

}

}