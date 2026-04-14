const i18n = {

current: localStorage.getItem("besafe_lang") || "en",

translations:{

en:{

home:"Home",
overview:"Financial overview",
quickActions:"Quick actions",
scanReceipt:"Scan receipt",
addExpense:"Add expense",
askAI:"Ask AI",

balance:"Balance",
today:"Today",
month:"Month",

activity:"Activity",
aiAdvisor:"AI Advisor",

waitingScan:"Waiting for scan...",

advisorGreeting:"Hello 👋 I am your BeSafe financial advisor.",
advisorHelp:"Ask me about balance, spending or saving.",

advisorBalance:"Your financial balance looks stable.",
advisorSpending:"Your spending level looks normal.",
advisorSaving:"Saving tip: try saving 20% of your income.",

savingTips:"Saving tips",
spending:"Spending",
purchases:"Purchases",

scanPhoto:"Scan receipt photo",

navHome:"Home",
navScan:"Scan",
navActivity:"Activity",
navAI:"AI"

},

lt:{

home:"Pagrindinis",
overview:"Finansų apžvalga",
quickActions:"Greiti veiksmai",
scanReceipt:"Skenuoti čekį",
addExpense:"Pridėti išlaidą",
askAI:"Klausti AI",

balance:"Balansas",
today:"Šiandien",
month:"Mėnuo",

activity:"Veikla",
aiAdvisor:"AI Patarėjas",

waitingScan:"Laukiama skenavimo...",

advisorGreeting:"Sveiki 👋 Aš esu jūsų BeSafe finansų patarėjas.",
advisorHelp:"Klauskite apie balansą, išlaidas arba taupymą.",

advisorBalance:"Jūsų finansinis balansas atrodo stabilus.",
advisorSpending:"Jūsų išlaidų lygis yra normalus.",
advisorSaving:"Taupymo patarimas: stenkitės sutaupyti bent 20% pajamų.",

savingTips:"Taupymo patarimai",
spending:"Išlaidos",
purchases:"Pirkimai",

scanPhoto:"Skenuoti čekio nuotrauką",

navHome:"Pagrindinis",
navScan:"Skenuoti",
navActivity:"Veikla",
navAI:"AI"

}

},

set(lang){

this.current = lang

localStorage.setItem("besafe_lang",lang)

this.translate()

if(window.app){
app.setLanguage(lang)
}

},

t(key){

return this.translations[this.current][key] || key

},

translate(){

document.querySelectorAll("[data-i18n]").forEach(el=>{

const key = el.dataset.i18n

const text = this.t(key)

if(el.tagName==="INPUT"){

el.placeholder = text

}else{

el.innerText = text

}

})

}

}

/* INIT */

window.addEventListener("DOMContentLoaded",()=>{

i18n.translate()

})