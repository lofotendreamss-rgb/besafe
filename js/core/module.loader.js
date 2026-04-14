```javascript
// module.loader.js
// BeSafe Dynamic Module Loader (FIXED)

async function load(modulePath){

try{

console.log("Loading module →", modulePath);

const mod = await import(modulePath);

return mod;

}catch(err){

console.error("Module load failed:", modulePath, err);

return null;

}

}


/* MODULE REGISTRY */

const BeSafeModules = {

/* CORE */

core:{

navigation: () => load("./navigation.controller.js"),
boot: () => load("./system.boot.js")

},


/* SERVICES */

services:{

finance: () => load("../services/finance/financialEngine.js"),
ai: () => load("../services/ai/besafe.advisor.js"),
ocr: () => load("../services/ocr/receipt.ocr.js")

},


/* PAGES */

pages:{

activity: () => load("../pages/activity.page.js"),
archive: () => load("../pages/archive.page.js"),

/* 🔥 FIX */
scanner: () => load("../pages/scanner.page.js"),

stores: () => load("../pages/stores.page.js")

},


/* DASHBOARD */

dashboard:{

home: () => load("../ui/dashboard/home.dashboard.js"),

balanceCard: () => load("../ui/dashboard/balanceCard.js"),
budgetProgress: () => load("../ui/dashboard/budgetProgress.js"),
dailyLimit: () => load("../ui/dashboard/dailyLimit.js"),
miniCharts: () => load("../ui/dashboard/miniCharts.js"),
recentActivity: () => load("../ui/dashboard/recentActivity.js"),
quickActions: () => load("../ui/dashboard/quickActions.js"),
spendingChart: () => load("../ui/dashboard/spending.chart.js"),
spendingInsights: () => load("../ui/dashboard/spending.insights.js")

}

};


/* HELPER */

export async function loadModule(group,name){

if(!BeSafeModules[group]){
console.warn("Module group not found:", group);
return null;
}

if(!BeSafeModules[group][name]){
console.warn("Module not found:", name);
return null;
}

return await BeSafeModules[group][name]();

}


export default BeSafeModules;
```
