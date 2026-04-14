const EngineController = {

archive: {
getReceipts() {
return ArchiveReceipts.getAll();
},

getProducts() {
return ArchiveProducts.getAll();
},

search(query) {
return ArchiveSearch.run(query);
}
},

budget: {
getLimit() {
return BudgetLimit.get();
},

setLimit(value) {
BudgetLimit.set(value);
}
},

advisor: {
ask(question) {
return besafeAdvisor.ask(question);
}
}

};

window.EngineController = EngineController;