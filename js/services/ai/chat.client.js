// ============================================================
// chat.client — BeSafe Claude pokalbio API klientas
// ============================================================
//
// Phase 2c, žingsnis 1/5. Šis modulis yra grynas duomenų + tinklo
// sluoksnis virš /api/chat (Claude Haiku 4.5). Jokio DOM, jokio
// popup, jokios bubble logikos — tik:
//
//   • request paruošimas (license, fingerprint, kalba, finance context)
//   • pokalbio istorijos laikymas (sliding window 3 turn'ai)
//   • atsako klaidų klasifikavimas į vartotojui suprantamą tekstą
//   • capability detection (`isReady`) prieš UI rodymą
//
// Paskirtis — single source of truth, kuria dalinasi:
//
//   • js/ui/smart-assistant.js  — tekstinis chat panel (Phase 2b)
//   • js/ui/voice-assistant.js  — balsinis kanalas (Phase 2c, sek. žingsnis)
//
// ============================================================
// KOKYBĖS PRINCIPAS (kūrėjas patvirtino 2026-04-28, taikomas
// visam Phase 2c):
// ============================================================
//
//   "Geriau dabar užtrukti ilgiau, nei paskui turėti nesusipratimą
//    su voice asistentu visą laiką. Jeigu negalime padaryti
//    kokybiškai, tai geriau vartotojui nerodyti, kad tokia funkcija
//    egzistuoja programoje."
//
// Praktiškai šiame modulyje:
//
//   • Visi error path'ai grąžina AIŠKIAI klasifikuotas klaidas su
//     `.code` property — niekur silent failure. fetch network
//     gedimas, parse'o klaida, HTTP non-2xx, missing license, viskas
//     virsta į Error su stable .code, kurį classifyError gali
//     sumap'inti į user-facing tekstą.
//
//   • `isReady()` leidžia UI sluoksniui daryti capability detection
//     PRIEŠ funkcijos rodymą. Jei licencijos nėra — voice/text
//     mygtukas vede į aktyvavimo CTA, ne tylomis failint po klik'o.
//
//   • `appendTurn` validuoja role ir content — tuščios/whitespace-
//     only žinutės nešliaužia į istoriją. Claude konteksto buffer'is
//     neturi būti užterštas dirbtinai sukurtais "tuščiais" turn'ais.
//
//   • `classifyError` grąžina vartotojui suprantamą tekstą kiekvienai
//     žinomai klaidos klasei. Generic "Asistentas šiuo metu
//     nepasiekiamas" yra paskutinis fallback, ne pirmasis sprendimas.
//
// ============================================================
// Saugumo poza
// ============================================================
//
//   • Licencijos raktas skaitomas TIK čia (`besafe_license_key`
//     localStorage). Joks UI sluoksnis neturi skaityti tiesiogiai —
//     visas autorizavimas teka per `sendChatMessage`.
//
//   • Įrenginio fingerprint'as siunčiamas tik jei jau egzistuoja
//     vietoje (jokio prompt'o). Optional header.
//
//   • X-Language header'is mirroring'a UI kalbą — serverio finance
//     prompt'as jį naudoja kaip default'ą, kai user message'as
//     vienas nepakankamas kalbos atpažinimui.
//
//   • localStorage skaitymas try/catch'inis — privačiame naršyklės
//     režime (Safari) localStorage.getItem gali mesti, ir tai neturi
//     sulaužyti chat surface'o.
//
// ============================================================
// Kodėl atskirta nuo UI
// ============================================================
//
//   1. Testability — fetch mock'as veikia be DOM aplinkos (jsdom
//      nereikalingas paprastiems unit testams).
//   2. Multi-channel — tiek tekstinis, tiek balsinis kanalas naudoja
//      tą patį pipeline'ą ir dalinasi vienu pokalbio konteksto buffer'iu.
//   3. Init order — voice-assistant gali importuoti šį klientą
//      nesukurdamas cikliškos priklausomybės su smart-assistant.
//
// Šiame commit'e smart-assistant.js dar naudoja savo inline'inę kopiją —
// migracija į šį modulį atliekama atskirame commit'e (Phase 2c žingsnis 2).
// Tai užtikrina, kad nieko nesulaužytume per vieną pakeitimą.
// ============================================================

import { createTranslator, getCurrentLanguage } from "../../core/i18n.js";
import { buildFinanceContext } from "./finance.context.js";
import { getUserPlan } from "../finance/user-plan.js";

// ============================================================
// i18n helpers — modulio private. Ta pati semantika kaip
// smart-assistant.js: jei translator'ius mes ar getCurrentLanguage
// negrąžina nieko prasmingo, krentame į "en" ir fallback string'ą.
// ============================================================

function getLang() {
  try { return String(getCurrentLanguage?.() || "en").toLowerCase(); }
  catch { return "en"; }
}

function t(key, fallback) {
  try { return createTranslator(getLang())(key, fallback); }
  catch { return fallback; }
}

// ============================================================
// localStorage skaitymai — wrapped, nes private-browsing Safari
// gali mesti tiesiog ant `localStorage.getItem` kvietimo.
// ============================================================

function readLicenseKey() {
  try { return localStorage.getItem("besafe_license_key") || null; }
  catch { return null; }
}

function readDeviceFingerprint() {
  try { return localStorage.getItem("besafe_device_fp") || null; }
  catch { return null; }
}

// ============================================================
// Pokalbio istorija — sliding window, perduodama serveriui kaip
// kontekstas su kiekviena nauja žinute.
//
// Forma: [{ role: "user" | "assistant", content: string }, ...]
// Klaidos NĖRA dedamos į istoriją (jos UI-only — replay'ti jas
// Claude'ui tik pakenktų). Tuščios/whitespace-only žinutės taip pat
// atmetamos (žr. `appendTurn` validaciją).
// ============================================================

/** Maksimalus turn'ų kiekis (user + assistant pora = 2 entry). */
export const MAX_HISTORY_TURNS = 3;  // = 6 messages total

let conversationHistory = [];

/**
 * Įdeda turn'ą į istoriją ir taiko sliding window.
 *
 * Validacija (kokybės principas — niekur silent failure):
 *   • role privalo būti "user" arba "assistant" — kitos reikšmės
 *     (error, system, ir t.t.) tylomis ignoruojamos. Klaidos yra
 *     UI-only ir neturi grįžti Claude'ui.
 *   • content trimming'amas — jei tuščias arba whitespace-only,
 *     turn'as neįdedamas. Tai apsaugo Claude konteksto buffer'į
 *     nuo dirbtinių "tuščių" turn'ų, kurie sutriktytų istorijos
 *     formatą.
 *
 * @param {"user"|"assistant"} role
 * @param {string} content
 */
export function appendTurn(role, content) {
  if (role !== "user" && role !== "assistant") return;
  const safeContent = String(content || "");
  if (safeContent.trim() === "") return;
  conversationHistory.push({ role, content: safeContent });
  const maxEntries = MAX_HISTORY_TURNS * 2;
  if (conversationHistory.length > maxEntries) {
    conversationHistory = conversationHistory.slice(-maxEntries);
  }
}

/**
 * Grąžina istorijos kopiją. Vidinis masyvas niekada neatskleidžiamas
 * tiesiogiai — kviečiantysis negali jo mut'inti per nuorodą.
 *
 * @returns {Array<{role: string, content: string}>}
 */
export function getConversationHistory() {
  return [...conversationHistory];
}

/**
 * Pradeda naują pokalbį — istorija išvaloma. UI sluoksnis (smart-
 * assistant) papildomai išvalo vizualų transcript'ą savo pusėje.
 */
export function clearHistory() {
  conversationHistory = [];
}

// ============================================================
// Capability detection — kviečiamas UI sluoksnio PRIEŠ funkcijos
// rodymą, kad neapsimestume turintys tai, ko neturime.
// ============================================================

/**
 * Ar šiuo metu klientas turi visą reikalingą būseną Claude
 * užklausai paleisti. Šiuo metu vienintelis blokuojantis kontraktas
 * yra licencijos rakto buvimas localStorage'e — be jo
 * `sendChatMessage` mes Error("no_license") iškart ant pirmosios
 * eilutės.
 *
 * Naudojama UI sluoksnio kaip capability gate'as:
 *
 *   if (!isReady()) {
 *     showLicenseModal();   // arba: hide voice button entirely
 *     return;
 *   }
 *
 * Ateityje gali plėstis (navigator.onLine, trial usage tikrinimas ir
 * t.t.) — kviečiantysis neturi rūpintis šių sąlygų eile.
 *
 * @returns {boolean}
 */
export function isReady() {
  return Boolean(readLicenseKey());
}

// ============================================================
// /api/chat klientas — sėkmės atveju grąžina parsuotą JSON,
// klaidos atveju mes Error su stabiliu .code (+ optional .status,
// .retryAfter), kad classifyError() galėtų sumap'inti į user-facing
// tekstą be dvigubo if/else'inimo kviečiančioje vietoje.
//
// Visi error path'ai turi .code — niekur silent failure (kokybės
// principas). Lentelė:
//
//   priežastis             | .code              | .status (jei yra)
//   -----------------------|--------------------|------------------
//   nėra licencijos        | "no_license"       | —
//   fetch network throw    | "network"          | —
//   server 4xx/5xx         | body.error || "http_NNN" | NNN
//   server json parse fail | "http_NNN"         | NNN
// ============================================================

/**
 * Siunčia žinutę į /api/chat ir grąžina serverio JSON atsaką.
 *
 * Šios funkcijos kvietėjas atsakingas už `appendTurn("user", text)`
 * IKI sendChatMessage iškvietimo — tai užtikrina, kad istorijos
 * paskutinis entry yra einamasis user message'as, kurį
 * sendChatMessage atskiria nuo `history` (siunčiamas atskirai per
 * `message` field'ą, kad nebūtų dublikuojamas serverio modelyje).
 *
 * @param {string} text — vartotojo žinutė.
 * @returns {Promise<object>} parsed JSON server response.
 * @throws {Error} su `.code` (string), opt. `.status` (HTTP),
 *                 opt. `.retryAfter` (string sek.).
 */
export async function sendChatMessage(text) {
  const licenseKey = readLicenseKey();
  if (!licenseKey) {
    const err = new Error("no_license");
    err.code = "no_license";
    throw err;
  }
  const deviceFp = readDeviceFingerprint();
  const headers = {
    "Content-Type":  "application/json",
    "X-License-Key": licenseKey,
  };
  if (deviceFp) headers["X-Device-Fingerprint"] = deviceFp;
  // UI kalba serveriui — finance system prompt'as ją naudoja kaip
  // default'ą, kai user message'as vienas nepakankamas kalbos
  // atpažinimui. getLang() turi savo try/catch + "en" fallback.
  const lang = getLang();
  if (lang) headers["X-Language"] = lang;

  // Surenkam vartotojo finansinę nuotrauką lokaliai PRIEŠ siuntimą.
  // Apgaubta try/catch belt-and-braces — buildFinanceContext jau turi
  // savo vidinį guard'ą, bet hostile localStorage env'as (pvz. Safari
  // private browsing) neturi blokuoti žinutės siuntimo. Krentam į
  // null, kurį serveris toleruoja (tylomis ignoruoja, jei ne objektas
  // arba viršija 50 KB cap'ą).
  let financeContext = null;
  try {
    // Phase 4+ Mode Separation (Sesija A2): scope finance context
    // to active plan mode so AI never sees cross-mode data.
    financeContext = buildFinanceContext({ mode: getUserPlan() });
  } catch (err) {
    console.warn("[ChatClient] finance context build failed:", err);
    financeContext = null;
  }

  // Istorija = visi tracked turn'ai IŠSKYRUS einamąjį. Paskutinis
  // entry conversationHistory yra user žinutė, kurią siunčiame ant
  // request body'io `message` field'o — kartu siunčiant per `history`
  // ji būtų dublikuota Claude akyse.
  const history = conversationHistory.slice(0, -1);

  let resp;
  try {
    resp = await fetch("/api/chat", {
      method:  "POST",
      headers,
      body:    JSON.stringify({
        message: text,
        ...(history.length > 0 ? { history } : {}),
        ...(financeContext ? { financeContext } : {}),
      }),
    });
  } catch (netErr) {
    const err = new Error("network");
    err.code = "network";
    throw err;
  }

  if (!resp.ok) {
    // Bandome parse'inti error body'į — parse'o klaida neturi keisti
    // klaidos klasės. Net jei body'io nėra, .code visada nustatomas
    // (kokybės principas — jokio silent failure).
    let body = {};
    try { body = await resp.json(); } catch {}
    const err = new Error(body?.error || ("http_" + resp.status));
    err.status     = resp.status;
    err.code       = body?.error || ("http_" + resp.status);
    err.retryAfter = resp.headers.get("Retry-After") || null;
    throw err;
  }

  return await resp.json();
}

// ============================================================
// Klaidų → user-facing tekstas mapping'as. Naudoja t() su
// fallback'ais, kad nelokalizuota aplinka taip pat parodytų
// suprantamą žinutę (LT default'ai mirroring'a smart-assistant.js
// dictionary key'us).
//
// Generic "nepasiekiamas" yra PASKUTINIS fallback — kiekviena
// žinoma klaidos klasė turi specifinę žinutę, kuri pasako, ką
// vartotojas gali daryti toliau (atnaujinti planą, palaukti, ir t.t.)
// ============================================================

/**
 * Konvertuoja `sendChatMessage` mestą Error į user-facing string'ą.
 * Klasifikacija priklauso nuo:
 *   1. err.code   — stabilus identifier'is (`no_license`, `trial_no_ai`,
 *                   `subscription_ended`, `daily_limit_reached`,
 *                   `network`, `upstream_error`, `service_unavailable`,
 *                   `message_required`, `message_empty`,
 *                   `message_too_long`, `timeout`)
 *   2. err.status — HTTP kodas (401, 402, 429, 502, 503, 504)
 *   3. err.retryAfter — naudojamas tik 429 atveju.
 *
 * @param {Error} err
 * @returns {string} suprantamas tekstas vartotojui.
 */
export function classifyError(err) {
  const code = err?.code || err?.status;

  if (code === "no_license" || err?.status === 401) {
    return t("assistant.error.unauthorized", "Reikia galiojančios licencijos.");
  }

  // Trial vartotojai pamato šitą, kai bando naudotis AI. Jie turi
  // galiojančią licenciją, bet AI yra mokamų planų funkcija. Rodom
  // upgrade CTA'ą vietoj generic "bandykite vėliau", kuris klaidintų.
  if (code === "trial_no_ai" || err?.status === 402) {
    return t(
      "assistant.error.trialNoAi",
      "AI asistentas — tik mokamiems planams. Atnaujinti planą jūsų paskyroje."
    );
  }

  // Prenumerata pasibaigė (cancelled / expired / payment_failed).
  // Vartotojas turi realią licenciją — ji tiesiog neaktyvi. Rodom
  // konkretų "atnaujink" pranešimą vietoj generic "unauthorized",
  // kuris būtų techniškai teisingas, bet klaidinantis ("juk mokėjau
  // anksčiau, kodėl dabar unauthorized?").
  if (code === "subscription_ended") {
    return t(
      "assistant.error.subscriptionEnded",
      "Prenumerata atšaukta. Atnaujink planą kad galėtum vėl naudotis AI."
    );
  }

  // Dienos kvota išnaudota — atskira nuo burst rate limit'o.
  // Vartotojas turi laukti iki vidurnakčio UTC arba pakelti planą.
  // Retry-After turi sekundes iki reset'o, bet UX'ui sakom "rytoj".
  if (code === "daily_limit_reached") {
    return t(
      "assistant.error.dailyLimitReached",
      "Pasiekėte dienos žinučių limitą. Bandykite rytoj arba atnaujinkite planą."
    );
  }

  // Burst rate limit — 20 req/min apsauga. Vartotojui tereikia
  // sulėtinti.
  if (err?.status === 429) {
    const retry = err.retryAfter ? " (" + err.retryAfter + "s)" : "";
    return t("assistant.error.rateLimited", "Per daug užklausų. Bandykite vėliau") + retry + ".";
  }

  if (code === "message_required" || code === "message_empty") {
    return t("assistant.error.messageRequired", "Įveskite žinutę.");
  }
  if (code === "message_too_long") {
    return t("assistant.error.messageTooLong", "Žinutė per ilga (max 2000 simb.).");
  }
  if (err?.status === 504 || code === "timeout") {
    return t("assistant.error.timeout", "Asistentas neatsakė laiku. Bandykite dar kartą.");
  }
  if (code === "network") {
    return t("assistant.error.network", "Nėra interneto ryšio.");
  }

  // Anthropic upstream klaidos (502/503) — atskirta nuo blogai
  // sukonfigūruoto serverio. Sakom vartotojui, kad tai laikina
  // ir reikia bandyti vėliau.
  if (code === "upstream_error" || code === "service_unavailable" ||
      err?.status === 502 || err?.status === 503) {
    return t(
      "assistant.error.serviceBusy",
      "Asistentas laikinai užimtas. Bandykite po minutės."
    );
  }

  return t("assistant.error.generic", "Asistentas šiuo metu nepasiekiamas. Bandykite vėliau.");
}
