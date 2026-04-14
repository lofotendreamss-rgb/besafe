const StoresManager = {

stores:[],

async load(){

if(!window.db) return

const saved = await window.db.getSetting("stores")

this.stores = saved || []

},

async save(){

if(!window.db) return

await window.db.setSetting("stores",this.stores)

},

async add(name){

if(!name) return

const store={
id:Date.now(),
name:name.trim()
}

this.stores.push(store)

await this.save()

},

async remove(id){

this.stores=this.stores.filter(s=>s.id!==id)

await this.save()

},

getAll(){

return this.stores

},

getById(id){

return this.stores.find(s=>s.id===id)

}

}

window.StoresManager = StoresManager