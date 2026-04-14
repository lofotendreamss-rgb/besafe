const i18n = {
  current: localStorage.getItem("besafe_lang") || "en",

  translations: {
    en: {
      /* ========================= */
      /* LEGACY KEYS */
      /* ========================= */
      home: "Home",
      overview: "Financial overview",
      quickActions: "Quick actions",
      scanReceipt: "Scan receipt",
      addExpense: "Add expense",
      askAI: "Ask AI",

      balance: "Balance",
      today: "Today",
      month: "Month",

      activity: "Activity",
      aiAdvisor: "AI Advisor",

      waitingScan: "Waiting for scan...",

      advisorGreeting: "Hello 👋 I am your BeSafe financial advisor.",
      advisorHelp: "Ask me about balance, spending or saving.",

      advisorBalance: "Your financial balance looks stable.",
      advisorSpending: "Your spending level looks normal.",
      advisorSaving: "Saving tip: try saving 20% of your income.",

      savingTips: "Saving tips",
      spending: "Spending",
      purchases: "Purchases",

      scanPhoto: "Scan receipt photo",

      navHome: "Home",
      navScan: "Scan",
      navActivity: "Activity",
      navAI: "AI",

      /* ========================= */
      /* APP / LANGUAGE */
      /* ========================= */
      "language.name": "English",
      "language.option.en": "English",
      "language.option.lt": "Lithuanian",
      "language.screen.description":
        "BeSafe helps you understand your financial situation clearly and calmly.",
      "language.screen.promise":
        "Precise information, a calm tone, and one clear next step — without pressure or guesswork.",

      "app.brand": "BeSafe",
      "app.home": "Home",
      "app.transactions": "Transactions",
      "app.advisor": "Advisor",
      "app.chat": "Chat",
      "app.subtitle.home": "A calm and clear view of your financial situation.",
      "app.subtitle.transactions": "A clear place for your financial records.",
      "app.subtitle.advisor": "A calmer way to review your financial direction.",
      "app.subtitle.chat": "Ask one question and continue with one clear next step.",

      /* ========================= */
      /* HOME */
      /* ========================= */
      "home.hero.aria": "A calm message about your current situation",
      "home.hero.eyebrow": "Current state",
      "home.hero.title": "Start by calmly reviewing your situation",

      "home.hero.statePositiveEyebrow": "Current state",
      "home.hero.statePositiveTitle": "Your situation is stable right now",
      "home.hero.statePositiveText":
        "Income is currently ahead of expenses. You can calmly review the picture and then choose your next step.",

      "home.hero.stateAttentionEyebrow": "Current state",
      "home.hero.stateAttentionTitle": "This is a good time to review your situation more closely",
      "home.hero.stateAttentionText":
        "Expenses are currently ahead of income. BeSafe starts with a clear view so the next decision feels easier.",

      "home.hero.stateNeutralEyebrow": "Current state",
      "home.hero.stateNeutralTitle": "Your balance is currently even",
      "home.hero.stateNeutralText":
        "Income and expenses are currently equal. First you see the situation clearly, then you choose the next step.",

      "home.summary.aria": "Financial summary",
      "home.summary.eyebrow": "Your situation",
      "home.summary.title": "Financial summary",
      "home.summary.subtitle":
        "Start with one clear view of your balance, income, and expenses.",
      "home.summary.balance": "Balance",
      "home.summary.balanceHint": "Difference between income and expenses",
      "home.summary.income": "Income",
      "home.summary.incomeHint": "All recorded income",
      "home.summary.expenses": "Expenses",
      "home.summary.expensesHint": "All recorded expenses",

      "home.actions.aria": "Helpful actions",
      "home.actions.eyebrow": "Next step",
      "home.actions.title": "Choose what you want to do",
      "home.actions.subtitle":
        "BeSafe will show one clear next step for the action you choose.",
      "home.actions.groupLabel": "Main actions",
      "home.actions.expense": "Add expense",
      "home.actions.income": "Add income",
      "home.actions.receipt": "Add receipt",
      "home.actions.receiptScanner": "Receipt scanner",

      "home.guidance.eyebrow": "BeSafe guidance",
      "home.guidance.title": "Choose one action after reviewing your situation",
      "home.guidance.text":
        "When you choose an action, the next step opens right away without taking over the whole Home screen.",

      "home.insights.aria": "Situation insights",
      "home.insights.eyebrow": "Context",
      "home.insights.title": "What matters most right now",
      "home.insights.subtitle":
        "Below you only see the context that helps you understand the situation better.",

      "home.activity.eyebrow": "Activity",
      "home.activity.title": "Number of recorded entries",
      "home.activity.text":
        "Each accurate entry helps make the overall financial picture clearer.",

      "home.topCategory.eyebrow": "Expense direction",
      "home.topCategory.emptyTitle": "A clearer direction will appear with more entries",
      "home.topCategory.emptyText":
        "When there is more accurate data, you will see which expense direction stands out most.",
      "home.topCategory.title": "Largest expense direction right now",
      "home.topCategory.textStart": "Most spending right now is in the category",

      "home.recent.eyebrow": "Recent activity",
      "home.recent.title": "Latest entries",
      "home.recent.emptyTitle": "There are no entries yet",
      "home.recent.emptyText":
        "When the first income or expense entries appear, you will see the latest financial activity here.",

      "home.transactions.uncategorized": "Uncategorized",
      "home.transactions.income": "Income",
      "home.transactions.expense": "Expense",

      "home.shortcuts.aria": "Navigation shortcuts",
      "home.shortcuts.eyebrow": "Modules",
      "home.shortcuts.title": "Open modules",
      "home.shortcuts.subtitle": "Quick access to the main BeSafe modules.",
      "home.shortcuts.transactions": "Transactions",
      "home.shortcuts.advisor": "Advisor",
      "home.shortcuts.chat": "Chat",

      /* ========================= */
      /* QUICK ACTIONS */
      /* ========================= */
      "quickActions.default.action": "Action",
      "quickActions.default.eyebrow": "BeSafe",
      "quickActions.default.title": "Choose one clear action",
      "quickActions.default.text":
        "When you choose an action, the next step opens here right away.",

      "quickActions.step.category": "Step 1 of 2",
      "quickActions.step.form": "Step 2 of 2",
      "quickActions.step.success": "Completed",
      "quickActions.step.scanner": "Ready to continue",
      "quickActions.step.default": "Next step",

      "quickActions.common.cancelLabel": "Cancel",
      "quickActions.common.closeLabel": "Close",
      "quickActions.common.finishLabel": "Done",
      "quickActions.common.addAnotherLabel": "Add another",
      "quickActions.common.backLabel": "Back",
      "quickActions.common.changeCategoryLabel": "Change category",
      "quickActions.common.amountLabel": "Amount",
      "quickActions.common.amountHint":
        "Enter the amount as accurately as you know it.",
      "quickActions.common.categoryLabel": "Category",
      "quickActions.common.categoryDetailLabel": "Detail",
      "quickActions.common.categoryDetailPlaceholder":
        "Add a short category detail",
      "quickActions.common.dateLabel": "Date",
      "quickActions.common.noteLabel": "Note",
      "quickActions.common.notePlaceholder":
        "Add a short note if it helps you remember the context",

      "quickActions.status.saving": "Saving your entry…",
      "quickActions.status.savePathMissing": "Saving is not connected yet.",
      "quickActions.status.saveFailed":
        "This entry could not be saved this time. Please review the fields and try again.",

      "quickActions.validation.invalidType":
        "We could not determine the entry type. Please choose the action again.",
      "quickActions.validation.missingCategory": "Please choose a category.",
      "quickActions.validation.invalidAmount":
        "Enter an amount greater than zero.",
      "quickActions.validation.missingCategoryDetail":
        "Add a short category detail.",
      "quickActions.validation.missingDate": "Please choose a date.",

      "quickActions.error.eyebrow": "BeSafe",
      "quickActions.error.title": "This entry could not be saved",
      "quickActions.error.text":
        "That is okay. Review the fields and try again.",

      "quickActions.expense.eyebrow": "BeSafe",
      "quickActions.expense.title": "Add an expense",
      "quickActions.expense.text":
        "Start with the category. That gives BeSafe the right context for the next step.",
      "quickActions.expense.categoryStepTitle": "Choose the expense category",
      "quickActions.expense.categoryStepText":
        "A clear category keeps the entry organized from the start.",
      "quickActions.expense.formStepTitle": "Add the details you know",
      "quickActions.expense.formStepText":
        "Enter only the information you can confirm right now.",
      "quickActions.expense.submitLabel": "Save expense",
      "quickActions.expense.successTitle": "Expense saved",
      "quickActions.expense.successText":
        "The entry is saved. Your financial picture is now a little clearer.",

      "quickActions.income.eyebrow": "BeSafe",
      "quickActions.income.title": "Add income",
      "quickActions.income.text":
        "Start with the income category. Then BeSafe can guide the next step clearly.",
      "quickActions.income.categoryStepTitle": "Choose the income category",
      "quickActions.income.categoryStepText":
        "A clear category helps you understand income patterns more accurately.",
      "quickActions.income.formStepTitle": "Add the details you know",
      "quickActions.income.formStepText":
        "Enter the information you can confirm right now.",
      "quickActions.income.submitLabel": "Save income",
      "quickActions.income.successTitle": "Income saved",
      "quickActions.income.successText":
        "The entry is saved. Your overview is now more accurate.",

      "quickActions.receipt.eyebrow": "BeSafe",
      "quickActions.receipt.title": "Create a quick entry",
      "quickActions.receipt.text":
        "This is the fastest way to record a purchase. Start with the category.",
      "quickActions.receipt.categoryStepTitle": "Choose a category",
      "quickActions.receipt.categoryStepText":
        "A clear category keeps the quick entry easy to follow.",
      "quickActions.receipt.formStepTitle": "Add the main details",
      "quickActions.receipt.formStepText":
        "For now, the main information is enough.",
      "quickActions.receipt.submitLabel": "Save entry",
      "quickActions.receipt.amountHint":
        "Enter the amount as accurately as you know it.",
      "quickActions.receipt.notePlaceholder":
        "Add a short note about the purchase",
      "quickActions.receipt.successTitle": "Entry saved",
      "quickActions.receipt.successText":
        "The entry is saved. You will also see it in the transactions list.",

      "quickActions.receiptScanner.eyebrow": "BeSafe",
      "quickActions.receiptScanner.title": "Receipt scanner",
      "quickActions.receiptScanner.text":
        "Receipt capture from a photo or camera will be added here. For now, you can continue with a quick entry.",
      "quickActions.receiptScanner.infoTitle": "Scanner flow will be added next",
      "quickActions.receiptScanner.infoText":
        "For now, the clearest path is a quick receipt entry. That keeps the Home flow simple and complete.",
      "quickActions.receiptScanner.primaryLabel": "Continue with quick entry",

      /* ========================= */
      /* CATEGORIES */
      /* ========================= */
      "categories.food": "Food",
      "categories.transport": "Transport",
      "categories.housing": "Housing",
      "categories.health": "Health",
      "categories.shopping": "Shopping",
      "categories.entertainment": "Leisure",
      "categories.other": "Other",

      "incomeCategories.salary": "Salary",
      "incomeCategories.bonus": "Bonus",
      "incomeCategories.extra": "Additional income",
      "incomeCategories.refund": "Refund",
    },

    lt: {
      /* ========================= */
      /* LEGACY KEYS */
      /* ========================= */
      home: "Pagrindinis",
      overview: "Finansų apžvalga",
      quickActions: "Greiti veiksmai",
      scanReceipt: "Skenuoti čekį",
      addExpense: "Pridėti išlaidą",
      askAI: "Klausti AI",

      balance: "Balansas",
      today: "Šiandien",
      month: "Mėnuo",

      activity: "Veikla",
      aiAdvisor: "AI Patarėjas",

      waitingScan: "Laukiama skenavimo...",

      advisorGreeting: "Sveiki 👋 Aš esu jūsų BeSafe finansų patarėjas.",
      advisorHelp: "Klauskite apie balansą, išlaidas arba taupymą.",

      advisorBalance: "Jūsų finansinis balansas atrodo stabilus.",
      advisorSpending: "Jūsų išlaidų lygis yra normalus.",
      advisorSaving:
        "Taupymo patarimas: stenkitės sutaupyti bent 20% pajamų.",

      savingTips: "Taupymo patarimai",
      spending: "Išlaidos",
      purchases: "Pirkimai",

      scanPhoto: "Skenuoti čekio nuotrauką",

      navHome: "Pagrindinis",
      navScan: "Skenuoti",
      navActivity: "Veikla",
      navAI: "AI",

      /* ========================= */
      /* APP / LANGUAGE */
      /* ========================= */
      "language.name": "Lietuvių",
      "language.option.en": "English",
      "language.option.lt": "Lietuvių",
      "language.screen.description":
        "BeSafe padeda ramiai ir aiškiai suprasti finansinę situaciją.",
      "language.screen.promise":
        "Tiksli informacija, ramus tonas ir vienas aiškus kitas žingsnis — be spaudimo ir be spėlionių.",

      "app.brand": "BeSafe",
      "app.home": "Pradžia",
      "app.transactions": "Transakcijos",
      "app.advisor": "Advisor",
      "app.chat": "Chat",
      "app.subtitle.home": "Rami ir aiški jūsų finansinės situacijos apžvalga.",
      "app.subtitle.transactions": "Aiški vieta jūsų finansiniams įrašams.",
      "app.subtitle.advisor": "Ramesnis būdas peržiūrėti finansinę kryptį.",
      "app.subtitle.chat":
        "Užduokite vieną klausimą ir matykite aiškų kitą žingsnį.",

      /* ========================= */
      /* HOME */
      /* ========================= */
      "home.hero.aria": "Rami dabartinės būsenos žinutė",
      "home.hero.eyebrow": "Dabartinė būsena",
      "home.hero.title": "Pirmiausia ramiai peržiūrėkite situaciją",

      "home.hero.statePositiveEyebrow": "Dabartinė būsena",
      "home.hero.statePositiveTitle": "Jūsų situacija šiuo metu stabili",
      "home.hero.statePositiveText":
        "Pajamos šiuo metu viršija išlaidas. Galite ramiai peržiūrėti situaciją ir tada pasirinkti kitą veiksmą.",

      "home.hero.stateAttentionEyebrow": "Dabartinė būsena",
      "home.hero.stateAttentionTitle":
        "Šiuo metu verta atidžiau peržiūrėti situaciją",
      "home.hero.stateAttentionText":
        "Išlaidos šiuo metu lenkia pajamas. BeSafe pirmiausia parodo aiškų vaizdą, kad toliau būtų lengviau apsispręsti.",

      "home.hero.stateNeutralEyebrow": "Dabartinė būsena",
      "home.hero.stateNeutralTitle": "Šiuo metu balansas yra lygus",
      "home.hero.stateNeutralText":
        "Pajamos ir išlaidos šiuo metu sutampa. Pirmiausia matote situaciją, o tada galite pasirinkti kitą aiškų žingsnį.",

      "home.summary.aria": "Finansinė suvestinė",
      "home.summary.eyebrow": "Jūsų situacija",
      "home.summary.title": "Finansinė suvestinė",
      "home.summary.subtitle":
        "Pirmiausia matote vieną aiškų vaizdą: balansą, pajamas ir išlaidas.",
      "home.summary.balance": "Balansas",
      "home.summary.balanceHint": "Skirtumas tarp pajamų ir išlaidų",
      "home.summary.income": "Pajamos",
      "home.summary.incomeHint": "Visos užfiksuotos pajamos",
      "home.summary.expenses": "Išlaidos",
      "home.summary.expensesHint": "Visos užfiksuotos išlaidos",

      "home.actions.aria": "Naudingi veiksmai",
      "home.actions.eyebrow": "Kitas žingsnis",
      "home.actions.title": "Pasirinkite, ką norite atlikti",
      "home.actions.subtitle":
        "BeSafe parodys vieną aiškų kitą žingsnį pagal pasirinktą veiksmą.",
      "home.actions.groupLabel": "Pagrindiniai veiksmai",
      "home.actions.expense": "Pridėti išlaidas",
      "home.actions.income": "Pridėti pajamas",
      "home.actions.receipt": "Pridėti čekį",
      "home.actions.receiptScanner": "Čekių skeneris",

      "home.guidance.eyebrow": "BeSafe pagalba",
      "home.guidance.title": "Veiksmą pasirinkite po situacijos peržiūros",
      "home.guidance.text":
        "Pasirinkus veiksmą, aiškus tęsinys atsidaro iš karto ir neužima viso Home puslapio.",

      "home.insights.aria": "Situacijos įžvalgos",
      "home.insights.eyebrow": "Papildomas kontekstas",
      "home.insights.title": "Kas šiuo metu svarbiausia",
      "home.insights.subtitle":
        "Žemiau lieka tik tas kontekstas, kuris padeda geriau suprasti situaciją.",

      "home.activity.eyebrow": "Aktyvumas",
      "home.activity.title": "Užfiksuotų įrašų skaičius",
      "home.activity.text":
        "Kiekvienas tikslus įrašas padeda aiškiau matyti bendrą finansinę situaciją.",

      "home.topCategory.eyebrow": "Išlaidų kryptis",
      "home.topCategory.emptyTitle":
        "Aiškesnė kryptis atsiras kartu su įrašais",
      "home.topCategory.emptyText":
        "Kai turėsime daugiau tikslių duomenų, čia matysite, kuri išlaidų kryptis šiuo metu ryškiausia.",
      "home.topCategory.title": "Didžiausia išlaidų kryptis šiuo metu",
      "home.topCategory.textStart":
        "Daugiausia išlaidų šiuo metu matome kategorijoje",

      "home.recent.eyebrow": "Naujausia veikla",
      "home.recent.title": "Naujausi įrašai",
      "home.recent.emptyTitle": "Kol kas dar nėra įrašų",
      "home.recent.emptyText":
        "Kai atsiras pirmi tikslūs pajamų ar išlaidų įrašai, čia matysite naujausią finansinę veiklą.",

      "home.transactions.uncategorized": "Be kategorijos",
      "home.transactions.income": "Pajamos",
      "home.transactions.expense": "Išlaidos",

      "home.shortcuts.aria": "Navigacijos nuorodos",
      "home.shortcuts.eyebrow": "Moduliai",
      "home.shortcuts.title": "Atidaryti moduliai",
      "home.shortcuts.subtitle":
        "Greitas perėjimas į pagrindinius BeSafe modulius.",
      "home.shortcuts.transactions": "Transakcijos",
      "home.shortcuts.advisor": "Advisor",
      "home.shortcuts.chat": "Chat",

      /* ========================= */
      /* QUICK ACTIONS */
      /* ========================= */
      "quickActions.default.action": "Veiksmas",
      "quickActions.default.eyebrow": "BeSafe",
      "quickActions.default.title": "Pasirinkite vieną aiškų veiksmą",
      "quickActions.default.text":
        "Pasirinkus veiksmą, kitas žingsnis atsidaro čia pat.",

      "quickActions.step.category": "1 žingsnis iš 2",
      "quickActions.step.form": "2 žingsnis iš 2",
      "quickActions.step.success": "Užbaigta",
      "quickActions.step.scanner": "Galite tęsti",
      "quickActions.step.default": "Kitas žingsnis",

      "quickActions.common.cancelLabel": "Atšaukti",
      "quickActions.common.closeLabel": "Uždaryti",
      "quickActions.common.finishLabel": "Baigti",
      "quickActions.common.addAnotherLabel": "Pridėti dar vieną",
      "quickActions.common.backLabel": "Atgal",
      "quickActions.common.changeCategoryLabel": "Keisti kategoriją",
      "quickActions.common.amountLabel": "Suma",
      "quickActions.common.amountHint":
        "Įveskite sumą taip tiksliai, kaip šiuo metu galite.",
      "quickActions.common.categoryLabel": "Kategorija",
      "quickActions.common.categoryDetailLabel": "Patikslinimas",
      "quickActions.common.categoryDetailPlaceholder":
        "Trumpai patikslinkite kategoriją",
      "quickActions.common.dateLabel": "Data",
      "quickActions.common.noteLabel": "Pastaba",
      "quickActions.common.notePlaceholder":
        "Trumpa pastaba padės vėliau lengviau prisiminti kontekstą",

      "quickActions.status.saving": "Išsaugome įrašą…",
      "quickActions.status.savePathMissing":
        "Šiuo metu išsaugojimo kelias dar neprijungtas.",
      "quickActions.status.saveFailed":
        "Šį kartą įrašo išsaugoti nepavyko. Patikrinkite laukus ir pabandykite dar kartą.",

      "quickActions.validation.invalidType":
        "Nepavyko nustatyti įrašo tipo. Pasirinkite veiksmą dar kartą.",
      "quickActions.validation.missingCategory": "Pasirinkite kategoriją.",
      "quickActions.validation.invalidAmount":
        "Įveskite sumą, didesnę už nulį.",
      "quickActions.validation.missingCategoryDetail":
        "Trumpai patikslinkite kategoriją.",
      "quickActions.validation.missingDate": "Pasirinkite datą.",

      "quickActions.error.eyebrow": "BeSafe",
      "quickActions.error.title": "Įrašo išsaugoti nepavyko",
      "quickActions.error.text":
        "Nieko tokio. Peržiūrėkite laukus ir pabandykite dar kartą.",

      "quickActions.expense.eyebrow": "BeSafe",
      "quickActions.expense.title": "Pridėkite išlaidas",
      "quickActions.expense.text":
        "Pradėkite nuo kategorijos. Taip BeSafe galės parodyti aiškų kitą žingsnį.",
      "quickActions.expense.categoryStepTitle": "Pasirinkite išlaidų kategoriją",
      "quickActions.expense.categoryStepText":
        "Aiški kategorija padeda tvarkingai pradėti įrašą.",
      "quickActions.expense.formStepTitle":
        "Įveskite tai, ką jau tiksliai žinote",
      "quickActions.expense.formStepText":
        "Pildykite tik tą informaciją, kurią šiuo metu galite patvirtinti.",
      "quickActions.expense.submitLabel": "Išsaugoti išlaidas",
      "quickActions.expense.successTitle": "Išlaidos išsaugotos",
      "quickActions.expense.successText":
        "Įrašas išsaugotas. Jūsų finansinis vaizdas dabar yra šiek tiek aiškesnis.",

      "quickActions.income.eyebrow": "BeSafe",
      "quickActions.income.title": "Pridėkite pajamas",
      "quickActions.income.text":
        "Pradėkite nuo pajamų kategorijos. Tada BeSafe aiškiai parodys tęsinį.",
      "quickActions.income.categoryStepTitle": "Pasirinkite pajamų kategoriją",
      "quickActions.income.categoryStepText":
        "Aiški kategorija padeda tiksliau suprasti pajamų struktūrą.",
      "quickActions.income.formStepTitle":
        "Įveskite tai, ką jau tiksliai žinote",
      "quickActions.income.formStepText":
        "Pildykite informaciją, kurią šiuo metu galite patvirtinti.",
      "quickActions.income.submitLabel": "Išsaugoti pajamas",
      "quickActions.income.successTitle": "Pajamos išsaugotos",
      "quickActions.income.successText":
        "Įrašas išsaugotas. Jūsų apžvalga dabar yra tikslesnė.",

      "quickActions.receipt.eyebrow": "BeSafe",
      "quickActions.receipt.title": "Sukurkite greitą įrašą",
      "quickActions.receipt.text":
        "Tai greičiausias būdas užfiksuoti pirkimą. Pradėkite nuo kategorijos.",
      "quickActions.receipt.categoryStepTitle": "Pasirinkite kategoriją",
      "quickActions.receipt.categoryStepText":
        "Aiški kategorija padeda išlaikyti greitą įrašą paprastą ir aiškų.",
      "quickActions.receipt.formStepTitle": "Įveskite pagrindinę informaciją",
      "quickActions.receipt.formStepText":
        "Šiuo metu pakanka svarbiausios informacijos.",
      "quickActions.receipt.submitLabel": "Išsaugoti įrašą",
      "quickActions.receipt.amountHint":
        "Įveskite sumą taip tiksliai, kaip šiuo metu galite.",
      "quickActions.receipt.notePlaceholder":
        "Trumpai pažymėkite, ką šis pirkimas reiškė",
      "quickActions.receipt.successTitle": "Įrašas išsaugotas",
      "quickActions.receipt.successText":
        "Įrašas išsaugotas. Jį taip pat matysite transakcijų sąraše.",

      "quickActions.receiptScanner.eyebrow": "BeSafe",
      "quickActions.receiptScanner.title": "Čekių skeneris",
      "quickActions.receiptScanner.text":
        "Čekio nuskaitymas iš nuotraukos ar kameros bus pridėtas čia. Kol kas galite tęsti su greitu įrašu.",
      "quickActions.receiptScanner.infoTitle":
        "Skenerio eiga bus pridėta kitame etape",
      "quickActions.receiptScanner.infoText":
        "Kol kas aiškiausias kelias yra greitas čekio įrašas. Taip Home eiga lieka paprasta ir pilna.",
      "quickActions.receiptScanner.primaryLabel":
        "Tęsti su greitu įrašu",

      /* ========================= */
      /* CATEGORIES */
      /* ========================= */
      "categories.food": "Maistas",
      "categories.transport": "Transportas",
      "categories.housing": "Būstas",
      "categories.health": "Sveikata",
      "categories.shopping": "Pirkiniai",
      "categories.entertainment": "Pramogos",
      "categories.other": "Kita",

      "incomeCategories.salary": "Atlyginimas",
      "incomeCategories.bonus": "Premija",
      "incomeCategories.extra": "Papildomos pajamos",
      "incomeCategories.refund": "Grąžinimas",
    },
  },

  set(lang) {
    if (!this.translations[lang]) {
      return;
    }

    this.current = lang;
    localStorage.setItem("besafe_lang", lang);

    document.documentElement.lang = lang;

    this.translate();

    if (window.app && typeof window.app.setLanguage === "function") {
      window.app.setLanguage(lang);
    }
  },

  t(key, fallback = "") {
    const activeDictionary = this.translations[this.current] || this.translations.en;
    const fallbackDictionary = this.translations.en || {};

    if (key in activeDictionary) {
      return activeDictionary[key];
    }

    if (key in fallbackDictionary) {
      return fallbackDictionary[key];
    }

    if (fallback) {
      return fallback;
    }

    return key;
  },

  translate(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      const text = this.t(key);

      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        el.placeholder = text;
      } else {
        el.innerText = text;
      }
    });

    root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.dataset.i18nPlaceholder;
      el.placeholder = this.t(key);
    });

    root.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
      const key = el.dataset.i18nAriaLabel;
      el.setAttribute("aria-label", this.t(key));
    });
  },
};

window.i18n = i18n;

/* INIT */
window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.lang = i18n.current;
  i18n.translate();
});

export default i18n;