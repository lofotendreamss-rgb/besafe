const fs = require("fs");
const path = require("path");

const i18nPath = path.join(__dirname, "..", "js", "core", "i18n.js");
let i18n = fs.readFileSync(i18nPath, "utf8");

const translations = {
  "voice.button.label": {
    en: "Voice command", lt: "Balso komanda", pl: "Komenda g\u0142osowa",
    de: "Sprachbefehl", es: "Comando de voz", fr: "Commande vocale",
    it: "Comando vocale", ru: "\u0413\u043E\u043B\u043E\u0441\u043E\u0432\u0430\u044F \u043A\u043E\u043C\u0430\u043D\u0434\u0430",
    uk: "\u0413\u043E\u043B\u043E\u0441\u043E\u0432\u0430 \u043A\u043E\u043C\u0430\u043D\u0434\u0430",
    no: "Stemmekommando", sv: "R\u00F6stkommando", ja: "\u97F3\u58F0\u30B3\u30DE\u30F3\u30C9",
    zh: "\u8BED\u97F3\u547D\u4EE4", pt: "Comando de voz"
  },
  "voice.button.hint": {
    en: "Tap to speak a command", lt: "Spustel\u0117kite komandai pasakyti",
    pl: "Kliknij, aby wypowiedzie\u0107 polecenie", de: "Tippen, um Befehl zu sprechen",
    es: "Toca para decir un comando", fr: "Appuyez pour dire une commande",
    it: "Tocca per dire un comando", ru: "\u041D\u0430\u0436\u043C\u0438\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u0441\u043A\u0430\u0437\u0430\u0442\u044C \u043A\u043E\u043C\u0430\u043D\u0434\u0443",
    uk: "\u041D\u0430\u0442\u0438\u0441\u043D\u0456\u0442\u044C, \u0449\u043E\u0431 \u0441\u043A\u0430\u0437\u0430\u0442\u0438 \u043A\u043E\u043C\u0430\u043D\u0434\u0443",
    no: "Trykk for \u00E5 si kommando", sv: "Tryck f\u00F6r att s\u00E4ga kommando",
    ja: "\u30BF\u30C3\u30D7\u3057\u3066\u30B3\u30DE\u30F3\u30C9\u3092\u8A71\u3057\u307E\u3059",
    zh: "\u70B9\u51FB\u8BF4\u51FA\u547D\u4EE4", pt: "Toque para falar um comando"
  },
  "voice.status.listening": {
    en: "Listening...", lt: "Klausau...", pl: "S\u0142ucham...", de: "H\u00F6re zu...",
    es: "Escuchando...", fr: "\u00C9coute...", it: "In ascolto...",
    ru: "\u0421\u043B\u0443\u0448\u0430\u044E...", uk: "\u0421\u043B\u0443\u0445\u0430\u044E...",
    no: "Lytter...", sv: "Lyssnar...", ja: "\u8046\u3044\u3066\u3044\u307E\u3059...",
    zh: "\u6B63\u5728\u542C...", pt: "Ouvindo..."
  },
  "voice.error.unsupported": {
    en: "Voice commands are not supported in this browser.",
    lt: "Balso komandos nepalaikomos \u0161ioje nar\u0161ykl\u0117je.",
    pl: "Komendy g\u0142osowe nie s\u0105 obs\u0142ugiwane w tej przegl\u0105darce.",
    de: "Sprachbefehle werden in diesem Browser nicht unterst\u00FCtzt.",
    es: "Los comandos de voz no son compatibles con este navegador.",
    fr: "Les commandes vocales ne sont pas prises en charge par ce navigateur.",
    it: "I comandi vocali non sono supportati in questo browser.",
    ru: "\u0413\u043E\u043B\u043E\u0441\u043E\u0432\u044B\u0435 \u043A\u043E\u043C\u0430\u043D\u0434\u044B \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u044E\u0442\u0441\u044F \u0432 \u044D\u0442\u043E\u043C \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435.",
    uk: "\u0413\u043E\u043B\u043E\u0441\u043E\u0432\u0456 \u043A\u043E\u043C\u0430\u043D\u0434\u0438 \u043D\u0435 \u043F\u0456\u0434\u0442\u0440\u0438\u043C\u0443\u044E\u0442\u044C\u0441\u044F \u0443 \u0446\u044C\u043E\u043C\u0443 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0456.",
    no: "Stemmekommandoer st\u00F8ttes ikke i denne nettleseren.",
    sv: "R\u00F6stkommandon st\u00F6ds inte i denna webbl\u00E4sare.",
    ja: "\u3053\u306E\u30D6\u30E9\u30A6\u30B6\u3067\u306F\u97F3\u58F0\u30B3\u30DE\u30F3\u30C9\u304C\u30B5\u30DD\u30FC\u30C8\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002",
    zh: "\u6B64\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u8BED\u97F3\u547D\u4EE4\u3002",
    pt: "Comandos de voz n\u00E3o s\u00E3o suportados neste navegador."
  },
  "voice.error.permission": {
    en: "Microphone permission is required.", lt: "Reikia mikrofono leidimo.",
    pl: "Wymagane pozwolenie na mikrofon.", de: "Mikrofonberechtigung erforderlich.",
    es: "Se requiere permiso del micr\u00F3fono.", fr: "Autorisation microphone requise.",
    it: "\u00C8 richiesto il permesso del microfono.",
    ru: "\u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043D\u0438\u0435 \u043C\u0438\u043A\u0440\u043E\u0444\u043E\u043D\u0430.",
    uk: "\u041D\u0435\u043E\u0431\u0445\u0456\u0434\u043D\u0438\u0439 \u0434\u043E\u0437\u0432\u0456\u043B \u043D\u0430 \u043C\u0456\u043A\u0440\u043E\u0444\u043E\u043D.",
    no: "Mikrofontillatelse kreves.", sv: "Mikrofontillst\u00E5nd kr\u00E4vs.",
    ja: "\u30DE\u30A4\u30AF\u306E\u8A31\u53EF\u304C\u5FC5\u8981\u3067\u3059\u3002",
    zh: "\u9700\u8981\u9EA6\u514B\u98CE\u6743\u9650\u3002", pt: "Permiss\u00E3o do microfone necess\u00E1ria."
  },
  "voice.error.generic": {
    en: "Error. Try again.", lt: "Klaida. Pabandykite dar kart\u0105.",
    pl: "B\u0142\u0105d. Spr\u00F3buj ponownie.", de: "Fehler. Erneut versuchen.",
    es: "Error. Int\u00E9ntalo de nuevo.", fr: "Erreur. R\u00E9essayez.",
    it: "Errore. Riprova.", ru: "\u041E\u0448\u0438\u0431\u043A\u0430. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0441\u043D\u043E\u0432\u0430.",
    uk: "\u041F\u043E\u043C\u0438\u043B\u043A\u0430. \u0421\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0449\u0435 \u0440\u0430\u0437.",
    no: "Feil. Pr\u00F8v igjen.", sv: "Fel. F\u00F6rs\u00F6k igen.",
    ja: "\u30A8\u30E9\u30FC\u3002\u3082\u3046\u4E00\u5EA6\u8A66\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
    zh: "\u9519\u8BEF\u3002\u8BF7\u91CD\u8BD5\u3002", pt: "Erro. Tente novamente."
  },
  "voice.error.noAmount": {
    en: "Could not recognize amount. Try again.",
    lt: "Nepavyko atpa\u017Einti sumos. Pabandykite dar kart\u0105.",
    pl: "Nie rozpoznano kwoty. Spr\u00F3buj ponownie.",
    de: "Betrag nicht erkannt. Erneut versuchen.",
    es: "No se reconoci\u00F3 la cantidad. Int\u00E9ntalo de nuevo.",
    fr: "Montant non reconnu. R\u00E9essayez.",
    it: "Importo non riconosciuto. Riprova.",
    ru: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0442\u044C \u0441\u0443\u043C\u043C\u0443. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0441\u043D\u043E\u0432\u0430.",
    uk: "\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0440\u043E\u0437\u043F\u0456\u0437\u043D\u0430\u0442\u0438 \u0441\u0443\u043C\u0443. \u0421\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0449\u0435 \u0440\u0430\u0437.",
    no: "Kunne ikke gjenkjenne bel\u00F8pet. Pr\u00F8v igjen.",
    sv: "Kunde inte k\u00E4nna igen beloppet. F\u00F6rs\u00F6k igen.",
    ja: "\u91D1\u984D\u3092\u8A8D\u8B58\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002",
    zh: "\u65E0\u6CD5\u8BC6\u522B\u91D1\u989D\u3002\u8BF7\u91CD\u8BD5\u3002",
    pt: "N\u00E3o foi poss\u00EDvel reconhecer o valor. Tente novamente."
  },
  "voice.error.saveFailed": {
    en: "Could not save. Use the form instead.",
    lt: "Nepavyko i\u0161saugoti. Bandykite per form\u0105.",
    pl: "Nie uda\u0142o si\u0119 zapisa\u0107. Spr\u00F3buj przez formularz.",
    de: "Speichern fehlgeschlagen. Nutzen Sie das Formular.",
    es: "No se pudo guardar. Usa el formulario.",
    fr: "\u00C9chec de l'enregistrement. Utilisez le formulaire.",
    it: "Salvataggio fallito. Usa il modulo.",
    ru: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C. \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u0444\u043E\u0440\u043C\u0443.",
    uk: "\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0437\u0431\u0435\u0440\u0435\u0433\u0442\u0438. \u0421\u043A\u043E\u0440\u0438\u0441\u0442\u0430\u0439\u0442\u0435\u0441\u044F \u0444\u043E\u0440\u043C\u043E\u044E.",
    no: "Kunne ikke lagre. Bruk skjemaet.",
    sv: "Kunde inte spara. Anv\u00E4nd formul\u00E4ret ist\u00E4llet.",
    ja: "\u4FDD\u5B58\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u30D5\u30A9\u30FC\u30E0\u3092\u3054\u5229\u7528\u304F\u3060\u3055\u3044\u3002",
    zh: "\u4FDD\u5B58\u5931\u8D25\u3002\u8BF7\u4F7F\u7528\u8868\u5355\u3002",
    pt: "N\u00E3o foi poss\u00EDvel salvar. Use o formul\u00E1rio."
  },
  "voice.error.readFailed": {
    en: "Could not read data.", lt: "Nepavyko nuskaityti duomen\u0173.",
    pl: "Nie mo\u017Cna odczyta\u0107 danych.", de: "Daten konnten nicht gelesen werden.",
    es: "No se pudieron leer los datos.", fr: "Impossible de lire les donn\u00E9es.",
    it: "Impossibile leggere i dati.",
    ru: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435.",
    uk: "\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0437\u0447\u0438\u0442\u0430\u0442\u0438 \u0434\u0430\u043D\u0456.",
    no: "Kunne ikke lese data.", sv: "Kunde inte l\u00E4sa data.",
    ja: "\u30C7\u30FC\u30BF\u3092\u8AAD\u307F\u53D6\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002",
    zh: "\u65E0\u6CD5\u8BFB\u53D6\u6570\u636E\u3002", pt: "N\u00E3o foi poss\u00EDvel ler os dados."
  },
  "voice.error.unknown": {
    en: "I did not understand. Try: \"Add 20 euros food\".",
    lt: "Nesupratau komandos. Pabandykite: \u201EPrid\u0117k 20 eur\u0173 maistui\u201C.",
    pl: "Nie zrozumia\u0142em. Spr\u00F3buj: \u201EDodaj 20 euro jedzenie\u201D.",
    de: "Nicht verstanden. Versuchen Sie: \u201E20 Euro f\u00FCr Essen hinzuf\u00FCgen\u201C.",
    es: "No entend\u00ED. Prueba: \u201CA\u00F1adir 20 euros comida\u201D.",
    fr: "Je n'ai pas compris. Essayez : \u00AB Ajouter 20 euros nourriture \u00BB.",
    it: "Non ho capito. Prova: \u00ABAggiungi 20 euro cibo\u00BB.",
    ru: "\u042F \u043D\u0435 \u043F\u043E\u043D\u044F\u043B. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435: \u00AB\u0414\u043E\u0431\u0430\u0432\u044C 20 \u0435\u0432\u0440\u043E \u0435\u0434\u0430\u00BB.",
    uk: "\u042F \u043D\u0435 \u0437\u0440\u043E\u0437\u0443\u043C\u0456\u0432. \u0421\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435: \u00AB\u0414\u043E\u0434\u0430\u0439 20 \u0454\u0432\u0440\u043E \u0457\u0436\u0430\u00BB.",
    no: "Jeg forsto ikke. Pr\u00F8v: \u00ABLegg til 20 euro mat\u00BB.",
    sv: "Jag f\u00F6rstod inte. F\u00F6rs\u00F6k: \u00BBL\u00E4gg till 20 euro mat\u00AB.",
    ja: "\u7406\u89E3\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u4F8B\uFF1A\u300C20\u30E6\u30FC\u30ED\u306E\u98DF\u8CBB\u3092\u8FFD\u52A0\u300D",
    zh: "\u6211\u6CA1\u542C\u61C2\u3002\u8BD5\u8BD5\uFF1A\u201C\u6DFB\u52A020\u6B27\u5143\u98DF\u54C1\u201D\u3002",
    pt: "N\u00E3o entendi. Tente: \u201CAdicionar 20 euros comida\u201D."
  },
  "voice.success.expenseAdded": {
    en: "Added {amount} \u20AC expense", lt: "Prid\u0117ta {amount} \u20AC i\u0161laida",
    pl: "Dodano wydatek {amount} \u20AC", de: "{amount} \u20AC Ausgabe hinzugef\u00FCgt",
    es: "Gasto de {amount} \u20AC a\u00F1adido", fr: "D\u00E9pense de {amount} \u20AC ajout\u00E9e",
    it: "Aggiunta spesa di {amount} \u20AC",
    ru: "\u0414\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u043E {amount} \u20AC \u0440\u0430\u0441\u0445\u043E\u0434",
    uk: "\u0414\u043E\u0434\u0430\u043D\u043E {amount} \u20AC \u0432\u0438\u0442\u0440\u0430\u0442\u0443",
    no: "Lagt til {amount} \u20AC utgift", sv: "Lade till {amount} \u20AC utgift",
    ja: "{amount}\u20AC\u306E\u652F\u51FA\u3092\u8FFD\u52A0\u3057\u307E\u3057\u305F",
    zh: "\u5DF2\u6DFB\u52A0 {amount} \u20AC \u652F\u51FA",
    pt: "Despesa de {amount} \u20AC adicionada"
  },
  "voice.response.budget": {
    en: "Balance: {balance} \u20AC. Income: {income} \u20AC. Expenses: {expenses} \u20AC.",
    lt: "Balansas: {balance} \u20AC. Pajamos: {income} \u20AC. I\u0161laidos: {expenses} \u20AC.",
    pl: "Saldo: {balance} \u20AC. Przychody: {income} \u20AC. Wydatki: {expenses} \u20AC.",
    de: "Saldo: {balance} \u20AC. Einkommen: {income} \u20AC. Ausgaben: {expenses} \u20AC.",
    es: "Saldo: {balance} \u20AC. Ingresos: {income} \u20AC. Gastos: {expenses} \u20AC.",
    fr: "Solde : {balance} \u20AC. Revenus : {income} \u20AC. D\u00E9penses : {expenses} \u20AC.",
    it: "Saldo: {balance} \u20AC. Entrate: {income} \u20AC. Uscite: {expenses} \u20AC.",
    ru: "\u0411\u0430\u043B\u0430\u043D\u0441: {balance} \u20AC. \u0414\u043E\u0445\u043E\u0434\u044B: {income} \u20AC. \u0420\u0430\u0441\u0445\u043E\u0434\u044B: {expenses} \u20AC.",
    uk: "\u0411\u0430\u043B\u0430\u043D\u0441: {balance} \u20AC. \u0414\u043E\u0445\u043E\u0434\u0438: {income} \u20AC. \u0412\u0438\u0442\u0440\u0430\u0442\u0438: {expenses} \u20AC.",
    no: "Saldo: {balance} \u20AC. Inntekt: {income} \u20AC. Utgifter: {expenses} \u20AC.",
    sv: "Saldo: {balance} \u20AC. Inkomst: {income} \u20AC. Utgifter: {expenses} \u20AC.",
    ja: "\u6B8B\u9AD8: {balance} \u20AC\u3002\u53CE\u5165: {income} \u20AC\u3002\u652F\u51FA: {expenses} \u20AC\u3002",
    zh: "\u4F59\u989D\uFF1A{balance} \u20AC\u3002\u6536\u5165\uFF1A{income} \u20AC\u3002\u652F\u51FA\uFF1A{expenses} \u20AC\u3002",
    pt: "Saldo: {balance} \u20AC. Receita: {income} \u20AC. Despesas: {expenses} \u20AC."
  },
  "voice.response.monthly": {
    en: "This month you spent {amount} \u20AC.",
    lt: "\u0160\u012F m\u0117nes\u012F i\u0161leidote {amount} \u20AC.",
    pl: "W tym miesi\u0105cu wyda\u0142e\u015B {amount} \u20AC.",
    de: "Diesen Monat haben Sie {amount} \u20AC ausgegeben.",
    es: "Este mes has gastado {amount} \u20AC.",
    fr: "Ce mois-ci, vous avez d\u00E9pens\u00E9 {amount} \u20AC.",
    it: "Questo mese hai speso {amount} \u20AC.",
    ru: "\u0412 \u044D\u0442\u043E\u043C \u043C\u0435\u0441\u044F\u0446\u0435 \u0432\u044B \u043F\u043E\u0442\u0440\u0430\u0442\u0438\u043B\u0438 {amount} \u20AC.",
    uk: "\u0426\u044C\u043E\u0433\u043E \u043C\u0456\u0441\u044F\u0446\u044F \u0432\u0438 \u0432\u0438\u0442\u0440\u0430\u0442\u0438\u043B\u0438 {amount} \u20AC.",
    no: "Denne m\u00E5neden brukte du {amount} \u20AC.",
    sv: "Denna m\u00E5nad spenderade du {amount} \u20AC.",
    ja: "\u4ECA\u6708\u306F{amount}\u20AC\u4F7F\u3044\u307E\u3057\u305F\u3002",
    zh: "\u672C\u6708\u60A8\u82B1\u8D39\u4E86 {amount} \u20AC\u3002",
    pt: "Este m\u00EAs voc\u00EA gastou {amount} \u20AC."
  },
  "voice.response.reportOpen": {
    en: "Opening report.", lt: "Atidaroma ataskaita.", pl: "Otwieranie raportu.",
    de: "Bericht wird ge\u00F6ffnet.", es: "Abriendo informe.", fr: "Ouverture du rapport.",
    it: "Apertura del report.", ru: "\u041E\u0442\u043A\u0440\u044B\u0432\u0430\u044E \u043E\u0442\u0447\u0451\u0442.",
    uk: "\u0412\u0456\u0434\u043A\u0440\u0438\u0432\u0430\u044E \u0437\u0432\u0456\u0442.",
    no: "\u00C5pner rapport.", sv: "\u00D6ppnar rapport.",
    ja: "\u30EC\u30DD\u30FC\u30C8\u3092\u958B\u3044\u3066\u3044\u307E\u3059\u3002",
    zh: "\u6B63\u5728\u6253\u5F00\u62A5\u544A\u3002", pt: "Abrindo relat\u00F3rio."
  },
  "voice.note.prefix": {
    en: "Voice input", lt: "Balso \u012Fvestis", pl: "Dane g\u0142osowe",
    de: "Spracheingabe", es: "Entrada de voz", fr: "Saisie vocale",
    it: "Input vocale", ru: "\u0413\u043E\u043B\u043E\u0441\u043E\u0432\u043E\u0439 \u0432\u0432\u043E\u0434",
    uk: "\u0413\u043E\u043B\u043E\u0441\u043E\u0432\u0435 \u0432\u0432\u0435\u0434\u0435\u043D\u043D\u044F",
    no: "Steminndata", sv: "R\u00F6stinmatning", ja: "\u97F3\u58F0\u5165\u529B",
    zh: "\u8BED\u97F3\u8F93\u5165", pt: "Entrada de voz"
  }
};

const langOrder = ["en", "lt", "pl", "de", "es", "ru", "no", "sv", "ja", "zh", "fr", "it", "uk", "pt"];

let totalAdded = 0;
for (let i = 0; i < langOrder.length; i++) {
  const lang = langOrder[i];
  const entries = [];
  for (const key in translations) {
    const val = translations[key][lang];
    if (!val) continue;
    entries.push("    \"" + key + "\": " + JSON.stringify(val) + ",");
  }

  const anchor = "\"plan.label.business\":";
  let pos = -1, count = 0, searchIdx = 0;
  while ((pos = i18n.indexOf(anchor, searchIdx)) !== -1) {
    count++;
    if (count === i + 1) break;
    searchIdx = pos + 1;
  }
  if (pos === -1) continue;
  const lineEnd = i18n.indexOf("\n", pos);
  const insertAt = lineEnd + 1;
  const block = entries.join("\n") + "\n";
  i18n = i18n.slice(0, insertAt) + block + i18n.slice(insertAt);
  totalAdded += entries.length;
}

fs.writeFileSync(i18nPath, i18n);
console.log("Added", totalAdded, "voice translation entries");
