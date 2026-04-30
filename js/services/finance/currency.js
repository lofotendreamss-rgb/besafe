/**
 * BeSafe Currency Module — ISO 4217 list, symbol mapping, multilingual
 * names, user preference
 *
 * Phase 4 Sesija 0a (2026-04-30). Šis modulis sutvarko VISAS valiutos
 * temas viename failuke:
 *
 *   1. SUPPORTED_CURRENCIES — top 14 valiutų sąrašas su simboliais ir
 *      pilnais multilingual pavadinimais 14 BeSafe palaikomų UI kalbų.
 *
 *   2. Lookup helpers (`getCurrencySymbol`, `getCurrencyName`,
 *      `isValidCurrency`) — gražus fallback'as kai code'as ar lang
 *      nežinomas.
 *
 *   3. User preference storage (`getUserCurrency`, `setUserCurrency`) —
 *      localStorage key `besafe:user-currency`, default'as "EUR" iki
 *      Settings page implementacijos (Sesija 0b).
 *
 *   4. Event dispatch — `document.dispatchEvent` su `user-currency:changed`
 *      event'u, kai vartotojas pakeičia setting'ą. Atitinka mūsų
 *      `<entity>:<verb>` event channel konvenciją iš Phase 3 event
 *      channel fix'o (memory: backlog_post_step_4_5.md Item 3).
 *
 * Architektūrinis vaidmuo: Sesija 0b naudos šitą modulį Settings UI;
 * Sesija 0c naudos `getCurrencySymbol` UI komponentuose vietoj hardcoded
 * "€" ir `getCurrencyName(code, lang)` lokalizuotam rodymui; AI tool
 * schema (server/ai/tools.js) gaus user currency per financeContext
 * system prompt'e (Sesija 0c).
 *
 * ============================================================
 * KOKYBĖS PRINCIPAS (kūrėjas patvirtino 2026-04-28)
 * ============================================================
 *
 *   "Sistema niekada nekonvertuoja valiutų. Saugomas tikslus duomuo."
 *
 * Praktiškai šiame modulyje: NIEKUR jokios konversijos logikos. NĖRA
 * exchange rate API integracijos, NĖRA "EUR equivalent" skaičiavimo.
 * Vartotojas pasirenka valiutą — sistema atitinkamai rodo / saugo.
 *
 * ============================================================
 * GLOBALUMO PRINCIPAS
 * ============================================================
 *
 * 14 valiutų sąrašas atitinka 14 BeSafe palaikomų UI kalbų:
 *   LT/EN/DE/FR/ES/IT/PT/PL/NO/SV/RU/UK/JA/ZH ↔
 *   EUR/USD/EUR/EUR/EUR/EUR/EUR/PLN/NOK/SEK/UAH/UAH/JPY/CNY
 *
 * Plus "international" kalbos: AUD (Australia, EN), CAD (Canada, EN/FR),
 * GBP (UK, EN), CHF (Swiss, DE/FR/IT), CZK (Czech tourist destination),
 * DKK (Denmark, neighbor of NO/SE).
 *
 * Atmestos valiutos (BGN, HUF, RON) — atitinkamos UI kalbos nepalaikomos
 * BeSafe'e, todėl neformuoja realios vartotojo grupės.
 *
 * ============================================================
 * Multilingual names — INCLUDED FROM THE START (Principle 3)
 * ============================================================
 *
 * Kiekviena valiuta turi pilną pavadinimų mapping'ą visoms 14 UI
 * kalboms. `getCurrencyName(code, lang)` REALIAI naudoja `lang`
 * parametrą — Settings/UI komponentai gaus lokalizuotą valiutos
 * vardą be papildomos i18n parametrizacijos.
 *
 * Tai sąmoningai įgyvendinta nuo pirmo commit'o, ne atidėta vėliau:
 * žiūrėk `besafe_engineering_principles.md` Principle 3 — "Tikrasis
 * taupymas yra ne valandos, o ramybė ir kokybė produkto."
 *
 * Vertimai parinkti pagal oficialius valiutų pavadinimus kiekvienoje
 * kalboje (pvz., LT "JAV doleris", DE "US-Dollar", FR "Dollar
 * américain"), ne literal vertimas. CJK kalbose — native ženklai
 * (米ドル, 美元), ne romanizuoti formatai. Native speaker review
 * laukiamas — atskiri įrašai pažymėti `// TODO: native review` jei
 * yra realių abejonių dėl konkretaus vertimo.
 */

// ============================================================
// SUPPORTED_CURRENCIES — 14 valiutų su simboliais ir pavadinimais
// 14 UI kalbų.
// ============================================================
//
// Lang code'ai: en, lt, de, fr, es, it, pt, no, sv, pl, ru, uk, zh, ja
// (BeSafe palaiko šitas 14 UI kalbų — žiūrėk js/core/i18n.js).

export const SUPPORTED_CURRENCIES = Object.freeze([
  {
    code: "EUR",
    symbol: "€",
    names: {
      en: "Euro",
      lt: "Euras",
      de: "Euro",
      fr: "Euro",
      es: "Euro",
      it: "Euro",
      pt: "Euro",
      no: "Euro",
      sv: "Euro",
      pl: "Euro",
      ru: "Евро",
      uk: "Євро",
      zh: "欧元",
      ja: "ユーロ",
    },
  },
  {
    code: "USD",
    symbol: "$",
    names: {
      en: "US Dollar",
      lt: "JAV doleris",
      de: "US-Dollar",
      fr: "Dollar américain",
      es: "Dólar estadounidense",
      it: "Dollaro statunitense",
      pt: "Dólar americano",
      no: "Amerikansk dollar",
      sv: "Amerikansk dollar",
      pl: "Dolar amerykański",
      ru: "Доллар США",
      uk: "Долар США",
      zh: "美元",
      ja: "米ドル",
    },
  },
  {
    code: "GBP",
    symbol: "£",
    names: {
      en: "British Pound",
      lt: "Svaras sterlingas",
      de: "Britisches Pfund",
      fr: "Livre sterling",
      es: "Libra esterlina",
      it: "Sterlina britannica",
      pt: "Libra esterlina",
      no: "Britisk pund",
      sv: "Brittiskt pund",
      pl: "Funt szterling",
      ru: "Фунт стерлингов",
      uk: "Фунт стерлінгів",
      zh: "英镑",
      ja: "英ポンド",
    },
  },
  {
    code: "NOK",
    symbol: "kr",
    names: {
      en: "Norwegian Krone",
      lt: "Norvegijos krona",
      de: "Norwegische Krone",
      fr: "Couronne norvégienne",
      es: "Corona noruega",
      it: "Corona norvegese",
      pt: "Coroa norueguesa",
      no: "Norsk krone",
      sv: "Norsk krona",
      pl: "Korona norweska",
      ru: "Норвежская крона",
      uk: "Норвезька крона",
      zh: "挪威克朗",
      ja: "ノルウェー・クローネ",
    },
  },
  {
    code: "SEK",
    symbol: "kr",
    names: {
      en: "Swedish Krona",
      lt: "Švedijos krona",
      de: "Schwedische Krone",
      fr: "Couronne suédoise",
      es: "Corona sueca",
      it: "Corona svedese",
      pt: "Coroa sueca",
      no: "Svensk krone",
      sv: "Svensk krona",
      pl: "Korona szwedzka",
      ru: "Шведская крона",
      uk: "Шведська крона",
      zh: "瑞典克朗",
      ja: "スウェーデン・クローナ",
    },
  },
  {
    code: "DKK",
    symbol: "kr",
    names: {
      en: "Danish Krone",
      lt: "Danijos krona",
      de: "Dänische Krone",
      fr: "Couronne danoise",
      es: "Corona danesa",
      it: "Corona danese",
      pt: "Coroa dinamarquesa",
      no: "Dansk krone",
      sv: "Dansk krona",
      pl: "Korona duńska",
      ru: "Датская крона",
      uk: "Данська крона",
      zh: "丹麦克朗",
      ja: "デンマーク・クローネ",
    },
  },
  {
    code: "PLN",
    symbol: "zł",
    names: {
      en: "Polish Złoty",
      lt: "Lenkijos zlotas",
      de: "Polnischer Złoty",
      fr: "Złoty polonais",
      es: "Złoty polaco",
      it: "Złoty polacco",
      pt: "Złoty polaco",
      no: "Polsk złoty",
      sv: "Polsk złoty",
      pl: "Złoty polski",
      ru: "Польский злотый",
      uk: "Польський злотий",
      zh: "波兰兹罗提",
      ja: "ポーランド・ズウォティ",
    },
  },
  {
    code: "CHF",
    symbol: "CHF",
    names: {
      en: "Swiss Franc",
      lt: "Šveicarijos frankas",
      de: "Schweizer Franken",
      fr: "Franc suisse",
      es: "Franco suizo",
      it: "Franco svizzero",
      pt: "Franco suíço",
      no: "Sveitsisk franc",
      sv: "Schweizisk franc",
      pl: "Frank szwajcarski",
      ru: "Швейцарский франк",
      uk: "Швейцарський франк",
      zh: "瑞士法郎",
      ja: "スイス・フラン",
    },
  },
  {
    code: "JPY",
    symbol: "¥",
    names: {
      en: "Japanese Yen",
      lt: "Japonijos jena",
      de: "Japanischer Yen",
      fr: "Yen japonais",
      es: "Yen japonés",
      it: "Yen giapponese",
      pt: "Iene japonês",
      no: "Japansk yen",
      sv: "Japansk yen",
      pl: "Jen japoński",
      ru: "Японская иена",
      uk: "Японська єна",
      zh: "日元",
      ja: "日本円", // TODO: native speaker review (alternative: "円" short form)
    },
  },
  {
    code: "CNY",
    symbol: "¥",
    names: {
      en: "Chinese Yuan",
      lt: "Kinijos juanis",
      de: "Chinesischer Yuan",
      fr: "Yuan chinois",
      es: "Yuan chino",
      it: "Yuan cinese",
      pt: "Yuan chinês",
      no: "Kinesisk yuan",
      sv: "Kinesisk yuan",
      pl: "Juan chiński",
      ru: "Китайский юань",
      uk: "Китайський юань",
      zh: "人民币", // TODO: native speaker review (official name; "元" is the unit)
      ja: "中国元", // TODO: native speaker review (alternative: "人民元")
    },
  },
  {
    code: "CZK",
    symbol: "Kč",
    names: {
      en: "Czech Koruna",
      lt: "Čekijos krona",
      de: "Tschechische Krone",
      fr: "Couronne tchèque",
      es: "Corona checa",
      it: "Corona ceca",
      pt: "Coroa checa",
      no: "Tsjekkisk koruna",
      sv: "Tjeckisk koruna",
      pl: "Korona czeska",
      ru: "Чешская крона",
      uk: "Чеська крона",
      zh: "捷克克朗",
      ja: "チェコ・コルナ",
    },
  },
  {
    code: "UAH",
    symbol: "₴",
    names: {
      en: "Ukrainian Hryvnia",
      lt: "Ukrainos grivina",
      de: "Ukrainische Hrywnja",
      fr: "Hryvnia ukrainienne",
      es: "Grivna ucraniana",
      it: "Grivnia ucraina",
      pt: "Hryvnia ucraniana",
      no: "Ukrainsk hryvnia",
      sv: "Ukrainsk hryvnia",
      pl: "Hrywna ukraińska",
      ru: "Украинская гривна",
      uk: "Українська гривня",
      zh: "乌克兰格里夫纳",
      ja: "ウクライナ・フリヴニャ",
    },
  },
  {
    code: "AUD",
    symbol: "A$",
    names: {
      en: "Australian Dollar",
      lt: "Australijos doleris",
      de: "Australischer Dollar",
      fr: "Dollar australien",
      es: "Dólar australiano",
      it: "Dollaro australiano",
      pt: "Dólar australiano",
      no: "Australsk dollar",
      sv: "Australisk dollar",
      pl: "Dolar australijski",
      ru: "Австралийский доллар",
      uk: "Австралійський долар",
      zh: "澳元",
      ja: "オーストラリア・ドル",
    },
  },
  {
    code: "CAD",
    symbol: "C$",
    names: {
      en: "Canadian Dollar",
      lt: "Kanados doleris",
      de: "Kanadischer Dollar",
      fr: "Dollar canadien",
      es: "Dólar canadiense",
      it: "Dollaro canadese",
      pt: "Dólar canadense",
      no: "Kanadisk dollar",
      sv: "Kanadensisk dollar",
      pl: "Dolar kanadyjski",
      ru: "Канадский доллар",
      uk: "Канадський долар",
      zh: "加元",
      ja: "カナダ・ドル",
    },
  },
]);

// O(1) code lookup — naudojamas `getCurrencySymbol`/`getCurrencyName`
// vietoj `.find()` ant array'aus. Built once at module load.
const CURRENCY_BY_CODE = new Map(
  SUPPORTED_CURRENCIES.map((c) => [c.code, c])
);

// ============================================================
// Constants
// ============================================================

/**
 * Default currency kol vartotojas neturi nustatymo.
 * Sesija 0b Settings page leis perrašyti per onboarding flow'ą.
 */
export const DEFAULT_CURRENCY = "EUR";

/** localStorage raktas vartotojo pasirinktai valiutai. */
export const USER_CURRENCY_STORAGE_KEY = "besafe:user-currency";

/**
 * Event'as, kuris fire'inamas ant `document` kai `setUserCurrency()`
 * sėkmingai pakeičia nustatymą. UI komponentai gali subscribe'inti
 * ir re-renderintis. Konvencija: `<entity>:<verb>` (memory:
 * backlog_post_step_4_5 Item 3 lessons).
 */
export const USER_CURRENCY_CHANGED_EVENT = "user-currency:changed";

/** Fallback lang kai vartotojo pasirinkta lang neturi vertimo. */
const DEFAULT_NAME_LANG = "en";

// ============================================================
// Lookup helpers
// ============================================================

/**
 * Currency symbol grąžinimas su graceful fallback'u.
 *
 * @param {string} code — ISO 4217 code (e.g. "EUR", "USD")
 * @returns {string} symbol (e.g. "€", "$") arba code'as jei nežinomas
 */
export function getCurrencySymbol(code) {
  const entry = CURRENCY_BY_CODE.get(String(code || "").toUpperCase());
  return entry ? entry.symbol : String(code || "");
}

/**
 * Localized currency display name. Naudoja `lang` parametrą
 * lokalizuotam pavadinimui rasti; jei lang neturi vertimo, fallback'as
 * į anglišką pavadinimą; jei code'as nežinomas, grąžina patį code.
 *
 * @param {string} code — ISO 4217 code (e.g. "EUR", "USD")
 * @param {string} [lang] — UI lang code (e.g. "lt", "ja"). Default "en".
 * @returns {string} lokalizuotas valiutos pavadinimas
 *
 * @example
 *   getCurrencyName("EUR", "lt")  // "Euras"
 *   getCurrencyName("USD", "ja")  // "米ドル"
 *   getCurrencyName("EUR", "xx")  // "Euro"  (fallback en)
 *   getCurrencyName("XYZ", "lt")  // "XYZ"   (unknown code)
 */
export function getCurrencyName(code, lang) {
  const entry = CURRENCY_BY_CODE.get(String(code || "").toUpperCase());
  if (!entry) return String(code || "");
  const langKey = String(lang || DEFAULT_NAME_LANG).toLowerCase();
  return entry.names[langKey] || entry.names[DEFAULT_NAME_LANG] || entry.code;
}

/**
 * Patikrina, ar code'as yra mūsų palaikomame sąraše. Naudojamas
 * `setUserCurrency()` validacijai ir bet kuriam UI input'o sanity
 * check'ui (pvz., per-transaction currency override dropdown'e).
 *
 * @param {string} code
 * @returns {boolean}
 */
export function isValidCurrency(code) {
  return CURRENCY_BY_CODE.has(String(code || "").toUpperCase());
}

// ============================================================
// User preference storage (localStorage)
// ============================================================

/**
 * Skaitymas iš localStorage. Try/catch saugo nuo private-browsing
 * Safari, kuris gali mest'i ant `localStorage.getItem`. Nežinomas /
 * neegzistuojantis / invalid'us code'as → DEFAULT_CURRENCY.
 *
 * @returns {string} ISO 4217 code (visada validus)
 */
export function getUserCurrency() {
  try {
    const stored = localStorage.getItem(USER_CURRENCY_STORAGE_KEY);
    if (stored && isValidCurrency(stored)) {
      return String(stored).toUpperCase();
    }
  } catch {
    // Private browsing / disabled storage — fall through.
  }
  return DEFAULT_CURRENCY;
}

/**
 * Pakeitimas localStorage'e + `user-currency:changed` event'as
 * UI komponentams. Validuoja prieš išsaugant — atmeta unknown
 * code'us su `false` grąžinimu (caller turi rodyti error).
 *
 * @param {string} code
 * @returns {boolean} true jei išsaugota, false jei invalid arba storage gedo
 */
export function setUserCurrency(code) {
  const normalized = String(code || "").toUpperCase();
  if (!isValidCurrency(normalized)) {
    console.warn("[Currency] Rejected unknown currency code:", code);
    return false;
  }
  try {
    localStorage.setItem(USER_CURRENCY_STORAGE_KEY, normalized);
  } catch (err) {
    console.warn("[Currency] localStorage write failed:", err?.message);
    return false;
  }
  try {
    document.dispatchEvent(new CustomEvent(USER_CURRENCY_CHANGED_EVENT, {
      detail: { code: normalized },
    }));
  } catch {
    // Event dispatch failed (no document, jsdom edge case) — write
    // already succeeded, just couldn't notify. Not a fatal error.
  }
  return true;
}
