import { createTranslator, getCurrentLanguage } from "../core/i18n.js";
import { registry } from "../core/service.registry.js";
import { isReady, classifyError } from "../services/ai/chat.client.js";
import { openChat, submitMessageWithText } from "./smart-assistant.js";
import { todayLocal } from "../core/date.js";

const LOCALE_MAP = {
  lt: "lt-LT", en: "en-GB", pl: "pl-PL", de: "de-DE", es: "es-ES",
  fr: "fr-FR", it: "it-IT", ru: "ru-RU", uk: "uk-UA", no: "nb-NO",
  sv: "sv-SE", ja: "ja-JP", zh: "zh-CN", pt: "pt-BR",
};

function getLang() {
  try { return String(getCurrentLanguage?.() || "en").toLowerCase(); }
  catch { return "en"; }
}

function getLocale() {
  return LOCALE_MAP[getLang()] || "en-GB";
}

function t(key, fallback) {
  try {
    return createTranslator(getLang())(key, fallback);
  } catch {
    return fallback;
  }
}

function isSupported() {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function toast(message, kind = "success") {
  const existing = document.querySelector("[data-voice-toast]");
  if (existing) existing.remove();
  const el = document.createElement("div");
  el.setAttribute("data-voice-toast", "");
  const bg = kind === "error" ? "#e7a99a" : "#2ecc8a";
  el.style.cssText = "position:fixed;left:50%;bottom:88px;transform:translateX(-50%) translateY(20px);z-index:10001;background:" + bg + ";color:#030d07;padding:12px 20px;border-radius:12px;font-weight:600;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,0.3);opacity:0;transition:opacity 0.25s, transform 0.25s;max-width:92vw;text-align:center";
  el.textContent = String(message || "");
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translateX(-50%) translateY(0)";
  });
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateX(-50%) translateY(20px)";
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[.,!?;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Parse a number from the spoken text (handles "50", "penkiasdešimt", "fifty", etc.)
const LT_NUMBERS = {
  "nulis": 0, "vienas": 1, "viena": 1, "du": 2, "dvi": 2, "trys": 3,
  "keturi": 4, "penki": 5, "šeši": 6, "sesi": 6, "septyni": 7,
  "aštuoni": 8, "astuoni": 8, "devyni": 9, "dešimt": 10, "desimt": 10,
  "dvidešimt": 20, "dvidesimt": 20, "trisdešimt": 30, "trisdesimt": 30,
  "keturiasdešimt": 40, "keturiasdesimt": 40, "penkiasdešimt": 50, "penkiasdesimt": 50,
  "šešiasdešimt": 60, "sesiasdesimt": 60, "septyniasdešimt": 70, "septyniasdesimt": 70,
  "aštuoniasdešimt": 80, "astuoniasdesimt": 80, "devyniasdešimt": 90, "devyniasdesimt": 90,
  "šimtas": 100, "simtas": 100, "tūkstantis": 1000, "tukstantis": 1000,
};

function extractAmount(text) {
  const norm = normalize(text);
  // Try digits first (also captures "50.5" or "50,5")
  const digitMatch = norm.match(/(\d+[\.,]?\d*)/);
  if (digitMatch) {
    return parseFloat(digitMatch[1].replace(",", "."));
  }
  // Try LT number words
  const tokens = norm.split(" ");
  let total = 0;
  let found = false;
  for (const token of tokens) {
    if (LT_NUMBERS[token] !== undefined) {
      total += LT_NUMBERS[token];
      found = true;
    }
  }
  return found ? total : null;
}

const CATEGORY_KEYWORDS_LT = {
  food: ["maist", "maistą", "maisto", "maistui", "valgiui", "valgyt"],
  transport: ["transport", "kuro", "kurui", "degalų", "degalams", "autobus", "taxi", "taksi"],
  housing: ["būst", "bust", "namą", "nam", "nuomą", "nuomos", "komunal"],
  shopping: ["apsipirkim", "parduotuv", "drabuž", "rūbus"],
  entertainment: ["pramog", "kino", "filmų", "žaidim"],
  health: ["sveikat", "vaistų", "vaistus", "gydytoj"],
  bills: ["sąskait", "saskait", "elektr", "internet", "telefon"],
  education: ["mokslu", "mokymui", "kursų", "knyg"],
  travel: ["kelion", "atostog"],
};

function detectCategory(text) {
  const norm = normalize(text);
  for (const [key, words] of Object.entries(CATEGORY_KEYWORDS_LT)) {
    for (const w of words) {
      if (norm.includes(w)) return key;
    }
  }
  return null;
}

async function handleAddExpense(text) {
  const amount = extractAmount(text);
  if (!amount || amount <= 0) {
    const msg = t("voice.error.noAmount", "Nepavyko atpažinti sumos. Pabandykite dar kartą.");
    toast(msg, "error");
    return;
  }

  const categoryKey = detectCategory(text) || "other";

  try {
    const service = registry.get("transactions");
    if (!service) throw new Error("no service");

    // Find matching category
    const categories = await service.getCategories();
    const expenseCategories = (categories || []).filter(c => c?.type === "expense");
    let matched = null;

    // Try to match by keyword
    matched = expenseCategories.find(c => {
      const name = String(c?.name || "").toLowerCase();
      return CATEGORY_KEYWORDS_LT[categoryKey]?.some(kw => name.includes(kw));
    });
    // Fallback: first expense category
    if (!matched) matched = expenseCategories[0];

    const payload = {
      type: "expense",
      amount: amount.toFixed(2),
      date: todayLocal(),
      note: t("voice.note.prefix", "Balso įvestis") + ": " + text,
      categoryId: matched?.id || null,
      category: matched?.name || "",
      placeId: null,
      placeName: "",
    };

    await service.createTransaction(payload);

    const msg = t("voice.success.expenseAdded", "Pridėta {amount} € išlaida").replace("{amount}", amount.toFixed(2));
    toast(msg, "success");

    // Refresh home if available — uses the same `transaction:created`
    // channel the QuickActions form + smart-assistant use, so HomePage
    // and TransactionsPage refresh consistently. (This block is Phase
    // 1 dead code today; kept consistent so it stays correct if it
    // ever resurfaces before step 6/6 cleanup deletes it entirely.)
    try {
      document.dispatchEvent(new CustomEvent("transaction:created", { detail: payload }));
    } catch {}
  } catch (err) {
    console.warn("[Voice] Add expense failed:", err);
    const msg = t("voice.error.saveFailed", "Nepavyko išsaugoti. Bandykite per formą.");
    toast(msg, "error");
  }
}

async function handleShowBudget() {
  try {
    const service = registry.get("transactions");
    const summary = await service.getSummary();
    const balance = Number(summary?.balance || 0);
    const income = Number(summary?.totalIncome || 0);
    const expenses = Number(summary?.totalExpenses || 0);

    const msg = t("voice.response.budget", "Balansas: {balance} €. Pajamos: {income} €. Išlaidos: {expenses} €.")
      .replace("{balance}", balance.toFixed(2))
      .replace("{income}", income.toFixed(2))
      .replace("{expenses}", expenses.toFixed(2));
    toast(msg, "success");
  } catch {
    const msg = t("voice.error.readFailed", "Nepavyko nuskaityti duomenų.");
    toast(msg, "error");
  }
}

async function handleMonthlySpending() {
  try {
    const service = registry.get("transactions");
    const transactions = await service.getTransactions();
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const prefix = `${yyyy}-${mm}`;
    const monthExpenses = (transactions || [])
      .filter(t => t?.type === "expense" && String(t?.date || "").startsWith(prefix))
      .reduce((sum, t) => sum + Number(t?.amount || 0), 0);

    const msg = t("voice.response.monthly", "Šį mėnesį išleidote {amount} €.")
      .replace("{amount}", monthExpenses.toFixed(2));
    toast(msg, "success");
  } catch {
    const msg = t("voice.error.readFailed", "Nepavyko nuskaityti duomenų.");
    toast(msg, "error");
  }
}

function handleReport() {
  try {
    window.location.hash = "#/reports";
    const msg = t("voice.response.reportOpen", "Atidaroma ataskaita.");
    toast(msg, "success");
  } catch {}
}

function parseCommand(text) {
  const norm = normalize(text);
  // "pridėk|pridek|add [amount] [category]"
  if (/\b(pride|prideti|add)/i.test(norm) || extractAmount(norm)) {
    // Only treat as expense if an amount is present
    if (extractAmount(norm)) return { type: "expense", text };
  }
  // "parodyk|pokaz|show|biudžetą|biudzeta|balansą|balansa|budget|balance"
  if (/\b(biudž|biudz|balans|budget|balance)/i.test(norm)) {
    return { type: "budget" };
  }
  // "kiek išleidau|kiek isleidau|monthly|mėnes|menes|this month"
  if (/\b(išleid|isleid|mėnes|menes|monthly|month)/i.test(norm)) {
    return { type: "monthly" };
  }
  // "ataskait|raport|report"
  if (/\b(ataskait|raport|report)/i.test(norm)) {
    return { type: "report" };
  }
  return { type: "unknown" };
}

async function executeCommand(text) {
  const cmd = parseCommand(text);
  switch (cmd.type) {
    case "expense": return handleAddExpense(text);
    case "budget": return handleShowBudget();
    case "monthly": return handleMonthlySpending();
    case "report": return handleReport();
    default: {
      const msg = t("voice.error.unknown", "Nesupratau komandos. Pabandykite: „Pridėk 20 eurų maistui“.");
      toast(msg, "error");
      }
  }
}

let recognition = null;
let isListening = false;

function createRecognition() {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Rec) return null;
  const r = new Rec();
  r.lang = getLocale();
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.continuous = false;
  return r;
}

function setButtonState(state) {
  const btn = document.querySelector("[data-voice-btn]");
  if (!btn) return;
  btn.classList.toggle("is-listening", state === "listening");
  btn.classList.toggle("is-processing", state === "processing");
  btn.setAttribute("aria-pressed", state === "listening" ? "true" : "false");
}

export function startListening() {
  if (isListening) {
    stopListening();
    return;
  }
  if (!isSupported()) {
    toast(t("voice.error.unsupported", "Balso komandos nepalaikomos šioje naršyklėje."), "error");
    return;
  }
  recognition = createRecognition();
  if (!recognition) return;

  isListening = true;
  setButtonState("listening");
  toast(t("voice.status.listening", "Klausau..."), "success");

  recognition.onresult = async (event) => {
    const transcript = event.results[0][0].transcript;

    // Capability check #1 — license. Kokybės principas: jei negalim
    // kokybiškai pateikti, neapsimetam, kad veikia. Aiški žinutė
    // vartotojui vietoj tylaus failo.
    if (!isReady()) {
      toast(t("voice.licenseRequired", "Reikia aktyvavimo"), "error");
      setButtonState("idle");
      isListening = false;
      return;
    }

    // Capability check #2 — internetas. /api/chat reikalauja online
    // (skirtingai nei Phase 1 lokalios komandos, kurios veikia offline).
    if (!navigator.onLine) {
      const msg = t("voice.offlineRequired", "Voice asistentui reikia interneto");
      toast(msg, "error");
      setButtonState("idle");
      isListening = false;
      return;
    }

    // Capability check #3 — ne tuščia transkripcija. Niekur silent
    // failure: jei STT nieko neišgirdo, sakom aiškiai, ne tyliai
    // pridedam tuščią bubble'ą į istoriją.
    if (!transcript || !transcript.trim()) {
      toast(t("voice.noSpeech", "Nesupratau, pabandykite dar kartą"), "error");
      setButtonState("idle");
      isListening = false;
      return;
    }

    setButtonState("processing");

    try {
      // Atidarom chat panel'ą — vartotojas mato transcript'ą kaip
      // user bubble'ą prieš atsakymą. openChat() yra idempotent'inis:
      // jei jau atidaryta, tik focus'ą grąžina.
      openChat();

      // requestAnimationFrame, kad chat panel'as DOM'e būtų
      // render'intas prieš pridedant bubble'ą — submitMessageWithText
      // viduje kviečia addBubble, kuriam reikia messagesEl.
      await new Promise((resolve) => requestAnimationFrame(resolve));

      // Siunčiam į Claude per shared pipeline (chat.client.js).
      // Voice + tekstas dalinasi vieną pokalbio istoriją. Atsakymas
      // rodomas TIK tekstu chat panel'e — TTS pašalintas Phase 3
      // step 0/6, nes globaliai (14 kalbų × OS balsų matrica) jis
      // negalėjo veikti kokybiškai.
      await submitMessageWithText(transcript);
    } catch (err) {
      console.warn("[Voice] Claude pipeline failed:", err);
      toast(classifyError(err), "error");
    } finally {
      setButtonState("idle");
      isListening = false;
    }
  };

  recognition.onerror = (ev) => {
    console.warn("[Voice] Recognition error:", ev.error, ev);
    let msg;
    switch (ev.error) {
      case "not-allowed":
      case "service-not-allowed":
        msg = t("voice.error.permission", "Reikia mikrofono leidimo. Nustatymuose leiskite mikrofonui.");
        break;
      case "no-speech":
        msg = t("voice.error.noSpeech", "Negirdėjau. Kalbėkite garsiau.");
        break;
      case "audio-capture":
        msg = t("voice.error.audioCapture", "Mikrofonas nepasiekiamas.");
        break;
      case "network":
        msg = t("voice.error.network", "Reikia interneto balso atpažinimui.");
        break;
      case "language-not-supported":
        msg = t("voice.error.langUnsupported", "Kalba nepalaikoma.");
        break;
      case "aborted":
        msg = null; // silent - user cancelled
        break;
      default:
        msg = t("voice.error.generic", "Klaida") + ": " + ev.error;
    }
    if (msg) toast(msg, "error");
    setButtonState("idle");
    isListening = false;
  };

  recognition.onend = () => {
    isListening = false;
    setButtonState("idle");
  };

  try {
    recognition.start();
  } catch (err) {
    console.warn("[Voice] Start failed:", err);
    isListening = false;
    setButtonState("idle");
  }
}

export function stopListening() {
  if (recognition) {
    try { recognition.stop(); } catch {}
  }
  isListening = false;
  setButtonState("idle");
}

const MOBILE_QUERY = "(max-width: 640px)";

function getMountTarget() {
  const slot = document.getElementById("ai-launcher-slot");
  if (slot && window.matchMedia(MOBILE_QUERY).matches) return slot;
  return document.body;
}

export function mountVoiceButton() {
  if (document.querySelector("[data-voice-btn]")) {
    return;
  }
  if (!isSupported()) {
    console.warn("[Voice] SpeechRecognition NOT supported. Use Chrome or Edge. Firefox/Safari desktop = no support.");
    return;
  }

  const btn = document.createElement("button");
  btn.setAttribute("data-voice-btn", "");
  btn.setAttribute("type", "button");
  btn.setAttribute("aria-label", t("voice.button.label", "Balso komanda"));
  btn.setAttribute("title", t("voice.button.hint", "Sakyti komandą"));
  btn.className = "voice-fab";
  btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" fill="currentColor"/><path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 19v3M8 22h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  const style = document.createElement("style");
  style.textContent = `
    .voice-fab{
      position:fixed; right:20px; bottom:88px; z-index:99999;
      width:56px; height:56px; border-radius:50%;
      background:#2ecc8a; color:#030d07; border:none; cursor:pointer;
      display:flex; align-items:center; justify-content:center;
      box-shadow:0 8px 24px rgba(46,204,138,0.35);
      transition:all .2s;
    }
    .voice-fab:hover{ transform:scale(1.06); }
    .voice-fab.is-listening{
      background:#e7a99a;
      animation:voice-pulse 1.1s ease-in-out infinite;
    }
    .voice-fab.is-processing{
      background:#9dc4a8;
    }
    @keyframes voice-pulse{
      0%,100%{ box-shadow:0 0 0 0 rgba(231,169,154,0.6); }
      50%{ box-shadow:0 0 0 14px rgba(231,169,154,0); }
    }
    @media (max-width: 640px){
      .voice-fab{ right:16px; bottom:76px; width:52px; height:52px; }
    }
  `;
  document.head.appendChild(style);

  const initialTarget = getMountTarget();
  initialTarget.appendChild(btn);
  if (initialTarget !== document.body) btn.classList.add("voice-fab--in-nav");

  btn.addEventListener("click", () => startListening());

  const mq = window.matchMedia(MOBILE_QUERY);
  const onViewportChange = () => {
    const target = getMountTarget();
    if (btn.parentElement !== target) {
      target.appendChild(btn);
      btn.classList.toggle("voice-fab--in-nav", target !== document.body);
    }
  };
  if (mq.addEventListener) mq.addEventListener("change", onViewportChange);
  else if (mq.addListener) mq.addListener(onViewportChange);
}

// Auto-mount when imported
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountVoiceButton);
} else {
  mountVoiceButton();
}

// Re-render button label on language change
window.addEventListener("besafe:language-changed", () => {
  const btn = document.querySelector("[data-voice-btn]");
  if (btn) {
    btn.setAttribute("aria-label", t("voice.button.label", "Balso komanda"));
    btn.setAttribute("title", t("voice.button.hint", "Sakyti komandą"));
  }
});
