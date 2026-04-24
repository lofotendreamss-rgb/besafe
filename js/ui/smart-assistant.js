// ============================================================
// smart-assistant — BeSafe's voice + text chat entry point
// ============================================================
//
// Step 2b: layers a text chat surface on top of the Phase 1 voice
// assistant (js/ui/voice-assistant.js). The voice module is NOT
// modified here — we import its `startListening` and hijack the
// floating-button click to show a two-option popup:
//
//     🎤  Balsas  → original startListening() from voice-assistant
//     💬  Tekstas → opens /api/chat text panel
//
// Chat is wired to POST /api/chat (Claude Haiku 4.5) behind the
// server's authLicense + 20/min rate-limit chain. Credentials are
// read from localStorage:
//
//     besafe_license_key  → X-License-Key  (required)
//     besafe_device_fp    → X-Device-Fingerprint (optional)
//
// Privacy posture (mirrors voice-assistant):
//   - License key is never prompted or stored by this module
//   - Device fingerprint forwarded only if already present locally
//   - Assistant replies go through renderMarkdown() which escapes the
//     entire payload BEFORE applying markdown tag insertions, so any
//     <script> or event-handler in Claude's reply stays literal text.
//     User + error bubbles keep plain textContent.
//
// Graceful degradation:
//   - localStorage unavailable (private browsing) → toast + no-op
//   - Voice button never mounts (SpeechRecognition not supported) →
//     MutationObserver times out after 3s, logs warn, and chat is
//     effectively unreachable through the popup until a future
//     fallback button is wired (tracked for follow-up, not now)
//   - Any init exception is caught and logged — the surrounding SPA
//     keeps running

import { createTranslator, getCurrentLanguage } from "../core/i18n.js";
import { startListening as voiceStartListening } from "./voice-assistant.js";
import { buildFinanceContext } from "../services/ai/finance.context.js";
import { showLicenseModal } from "./license-modal.js";

// ============================================================
// i18n — mirror the voice-assistant helpers so translator keys
// collide neither in code nor in dictionary namespace.
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
// HTML escape — used only for static chrome text we inject via
// innerHTML (titles, button labels). User + assistant message
// bodies go through textContent; they never touch innerHTML.
// ============================================================

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ============================================================
// Minimal markdown renderer — Claude Haiku replies often include
// lists, bold, inline code, and short headings. Users expect them
// formatted rather than rendered as raw asterisks.
//
// Security contract — two non-negotiable rules:
//
//   1. escapeHtml() runs FIRST on the entire input. After this step
//      every `<`, `>`, `&`, `"`, `'` in the payload is an HTML entity.
//      There is no way for user-controlled `<script>` or
//      `<img onerror=...>` to survive.
//
//   2. The ONLY tags we insert are a hard-coded whitelist with NO
//      attributes: <strong>, <em>, <code>, <h3>, <h4>, <ul>, <ol>,
//      <li>, <p>, <br>. No href, no src, no style — attribute-based
//      XSS vectors are structurally impossible.
//
// Anything outside the markdown syntax we understand becomes plain
// text in a <p>. This keeps the parser small and predictable.
//
// NOT supported (on purpose): links, images, tables, blockquotes,
// fenced code blocks, nested lists. Add them only if Claude starts
// emitting them meaningfully — every new feature is new attack
// surface.
// ============================================================

function renderMarkdown(text) {
  if (text === null || text === undefined || text === "") return "";
  const escaped = escapeHtml(String(text));
  // Split on blank lines so adjacent lists / paragraphs don't merge.
  const blocks = escaped.split(/\n\s*\n/);
  return blocks.map(renderMarkdownBlock).filter(Boolean).join("");
}

function renderMarkdownBlock(block) {
  // Trim each line so stray \r (CRLF artefacts) and leading/trailing
  // whitespace don't defeat the anchor-sensitive regexes below. Claude
  // occasionally emits `## 5. Title\r` — without trimming, the trailing
  // \r would land inside <h4>. As a side benefit, indented bullet lists
  // (`  - item`) are now recognised as lists instead of paragraphs.
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 || block.length === 0);
  if (lines.length === 0) return "";

  // Heading + following content in the same block (no blank-line
  // separator). Claude frequently emits:
  //     ## 1. Title
  //     - bullet one
  //     - bullet two
  // Without this split we'd fail the all-bullet test (first line
  // isn't a bullet) and fall through to a single paragraph that
  // swallows the list. Peel the heading off, render it, then recurse
  // on the rest so the body keeps its block semantics (lists, nested
  // headings, paragraphs). Recursion depth is bounded by line count —
  // each call consumes at least one line.
  if (lines.length > 1) {
    const h2 = /^##\s+(.+)$/.exec(lines[0]);
    const h1 = /^#\s+(.+)$/.exec(lines[0]);
    if (h2 || h1) {
      const tag     = h2 ? "h4" : "h3";
      const content = (h2 || h1)[1];
      const heading = "<" + tag + ">" + renderMarkdownInline(content) + "</" + tag + ">";
      return heading + renderMarkdownBlock(lines.slice(1).join("\n"));
    }
  }

  // Unordered list: every non-empty line starts with `- ` or `* `.
  if (lines.every((l) => /^[-*]\s+/.test(l))) {
    const items = lines
      .map((l) => "<li>" + renderMarkdownInline(l.replace(/^[-*]\s+/, "")) + "</li>")
      .join("");
    return "<ul>" + items + "</ul>";
  }

  // Ordered list: every non-empty line starts with `1. ` (any digit+dot).
  if (lines.every((l) => /^\d+\.\s+/.test(l))) {
    const items = lines
      .map((l) => "<li>" + renderMarkdownInline(l.replace(/^\d+\.\s+/, "")) + "</li>")
      .join("");
    return "<ol>" + items + "</ol>";
  }

  // Single-line heading block: `# foo` → h3, `## foo` → h4.
  if (lines.length === 1) {
    const h2 = /^##\s+(.+)$/.exec(lines[0]);
    if (h2) return "<h4>" + renderMarkdownInline(h2[1]) + "</h4>";
    const h1 = /^#\s+(.+)$/.exec(lines[0]);
    if (h1) return "<h3>" + renderMarkdownInline(h1[1]) + "</h3>";
  }

  // Default: paragraph. Single \n inside the block becomes <br>.
  return "<p>" + lines.map(renderMarkdownInline).join("<br>") + "</p>";
}

function renderMarkdownInline(s) {
  // Order matters:
  //   code first so its content is visually fenced off from further
  //   transforms (the regex still scans inside <code>, but that is
  //   acceptable for a minimal parser — Claude rarely nests bold in
  //   inline code).
  //   bold (**) before italic (*) so `**x**` isn't misread as two
  //   italic openers.
  return s
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+?)\*/g, "<em>$1</em>");
}

// ============================================================
// Toast — same visual language as voice-assistant (own selector
// so the two can co-exist without fighting for the DOM node).
// ============================================================

function toast(message, kind = "success") {
  const existing = document.querySelector("[data-smart-toast]");
  if (existing) existing.remove();
  const el = document.createElement("div");
  el.setAttribute("data-smart-toast", "");
  const bg = kind === "error" ? "#e7a99a" : "#2ecc8a";
  el.style.cssText =
    "position:fixed;left:50%;bottom:88px;transform:translateX(-50%) translateY(20px);" +
    "z-index:10002;background:" + bg + ";color:#030d07;padding:12px 20px;" +
    "border-radius:12px;font-weight:600;font-size:14px;" +
    "box-shadow:0 8px 24px rgba(0,0,0,0.3);opacity:0;" +
    "transition:opacity .25s, transform .25s;max-width:92vw;text-align:center";
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

// ============================================================
// localStorage reads — wrapped because private-browsing Safari
// throws on access, and because a corrupt string shouldn't break
// the chat surface either.
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
// /api/chat client — returns parsed JSON on 2xx, throws with a
// stable `.code` + optional `.status`/`.retryAfter` on error so
// classifyError() can map to user-facing text.
// ============================================================

async function sendChatMessage(text) {
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
  // Mirror the UI language to the server so its finance system
  // prompt knows which language to default to when the user's
  // message alone isn't enough to detect it. getLang() has its own
  // try/catch + "en" fallback — always returns a 2-char code.
  const lang = getLang();
  if (lang) headers["X-Language"] = lang;

  // Gather the user's finance snapshot locally BEFORE sending. This
  // is wrapped in try/catch as belt-and-braces — buildFinanceContext
  // already has its own internal guard, but a hostile localStorage
  // env (e.g. Safari private browsing) shouldn't block sending a
  // message. Falls back to null, which the server tolerates (silently
  // ignores when not an object or above the 50 KB cap).
  let financeContext = null;
  try {
    financeContext = buildFinanceContext();
  } catch (err) {
    console.warn("[SmartAssistant] finance context build failed:", err);
    financeContext = null;
  }

  // Build history = all tracked turns EXCEPT the current one. The last
  // entry in conversationHistory is the user message we're about to
  // send — already transmitted via the `message` field, so including it
  // in `history` would duplicate it in Claude's view.
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
    // Try to parse error body — don't let parse failure change error class.
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
// Chat panel — DOM, state, handlers
// ============================================================

let chatPanel = null;
let messagesEl = null;
let inputEl = null;
let sendBtn = null;
let isSending = false;

// Sliding window of recent chat turns sent to the server as context.
// User + assistant messages only — errors are UI-only and never sent.
// Capped at MAX_HISTORY_TURNS*2 entries (user+assistant pairs).
const MAX_HISTORY_TURNS = 3;  // = 6 messages total (3 user + 3 assistant)
let conversationHistory = [];

function buildChatPanel() {
  const wrap = document.createElement("div");
  wrap.setAttribute("data-smart-chat", "");
  wrap.className = "smart-chat";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-label", t("assistant.label", "BeSafe asistentas"));

  wrap.innerHTML =
    '<div class="smart-chat__header">' +
      '<span class="smart-chat__title">' + escapeHtml(t("assistant.title", "BeSafe Asistentas")) + '</span>' +
      '<div class="smart-chat__actions">' +
        '<button type="button" class="smart-chat__clear-btn" data-smart-clear ' +
          'title="' + escapeHtml(t("assistant.newChat", "Naujas pokalbis")) + '" ' +
          'aria-label="' + escapeHtml(t("assistant.newChat", "Naujas pokalbis")) + '">↻</button>' +
        '<button type="button" class="smart-chat__close" data-smart-close ' +
          'aria-label="' + escapeHtml(t("assistant.close", "Uždaryti")) + '">×</button>' +
      '</div>' +
    '</div>' +
    '<div class="smart-chat__messages" data-smart-messages></div>' +
    '<div class="smart-chat__input-row">' +
      '<textarea class="smart-chat__input" data-smart-input rows="1" ' +
        'placeholder="' + escapeHtml(t("assistant.placeholder", "Rašykite žinutę...")) + '"></textarea>' +
      '<button type="button" class="smart-chat__send" data-smart-send>' +
        escapeHtml(t("assistant.send", "Siųsti")) +
      '</button>' +
    '</div>';

  messagesEl = wrap.querySelector("[data-smart-messages]");
  inputEl    = wrap.querySelector("[data-smart-input]");
  sendBtn    = wrap.querySelector("[data-smart-send]");
  const closeBtn = wrap.querySelector("[data-smart-close]");
  const clearBtn = wrap.querySelector("[data-smart-clear]");

  closeBtn.addEventListener("click", closeChat);
  if (clearBtn) clearBtn.addEventListener("click", clearChat);
  sendBtn.addEventListener("click", () => submitMessage());
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitMessage();
    }
  });

  return wrap;
}

// Role-specific rendering:
//   assistant → renderMarkdown(): HTML-escapes first, then injects
//     a whitelist of tags (<strong>, <em>, <code>, lists, headings,
//     <p>, <br>). No attributes, so no onerror/onload vectors.
//   user / error → textContent. No markdown on user input (no
//     reason to format their own typing) and error strings are
//     sourced by us, not the network.
function addBubble(role, text) {
  if (!messagesEl) return null;
  const bubble = document.createElement("div");
  bubble.className = "smart-chat__bubble smart-chat__bubble--" + role;
  if (role === "assistant") {
    bubble.innerHTML = renderMarkdown(text);
  } else {
    bubble.textContent = String(text || "");
  }
  messagesEl.appendChild(bubble);
  scrollToBottom();

  // Track user + assistant turns for context memory. Errors are UI-only
  // and never sent to Claude — replaying them would just confuse the model.
  if (role === "user" || role === "assistant") {
    conversationHistory.push({ role, content: String(text || "") });
    // Keep only the last N turns (user+assistant pairs).
    const maxEntries = MAX_HISTORY_TURNS * 2;
    if (conversationHistory.length > maxEntries) {
      conversationHistory = conversationHistory.slice(-maxEntries);
    }
  }

  return bubble;
}

// Renders a standalone upgrade button below the most recent bubble.
// Target is a RELATIVE /upgrade.html so the link works regardless of
// which host the app is deployed on (Render now, potentially Vercel
// or a custom domain later). `?plan=personal` pre-selects the lower
// tier — user can still switch on upgrade.html. `_self` nav keeps
// mobile UX simple (browser back returns to chat).
function addUpgradeCta() {
  if (!messagesEl) return null;
  const link = document.createElement("a");
  link.className = "smart-chat__upgrade-cta";
  link.href      = "/upgrade.html?plan=personal";
  link.target    = "_self";
  link.rel       = "noopener noreferrer";
  link.textContent = t("assistant.error.trialNoAiButton", "Atnaujinti planą →");
  messagesEl.appendChild(link);
  scrollToBottom();
  return link;
}

function addTypingIndicator() {
  if (!messagesEl) return null;
  const el = document.createElement("div");
  el.setAttribute("data-smart-typing", "");
  el.className = "smart-chat__bubble smart-chat__bubble--assistant smart-chat__typing";
  el.innerHTML =
    '<span class="smart-chat__dot"></span>' +
    '<span class="smart-chat__dot"></span>' +
    '<span class="smart-chat__dot"></span>';
  messagesEl.appendChild(el);
  scrollToBottom();
  return el;
}

function scrollToBottom() {
  if (!messagesEl) return;
  // requestAnimationFrame so the new bubble's height is measured before scroll.
  requestAnimationFrame(() => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

async function submitMessage() {
  if (isSending) return;
  const text = (inputEl?.value || "").trim();
  if (!text) return;

  inputEl.value = "";
  isSending = true;
  sendBtn.disabled = true;

  addBubble("user", text);
  const typing = addTypingIndicator();

  try {
    const resp = await sendChatMessage(text);
    typing?.remove();
    addBubble("assistant", resp?.response || "");
  } catch (err) {
    typing?.remove();
    addBubble("error", classifyError(err));
    // Trial users + cancelled/expired users get an inline "Upgrade" CTA
    // so they don't have to hunt for the pricing page. Both reach the
    // same /upgrade.html — the error bubble text differs (trial vs
    // subscription_ended) but the actionable next step is identical.
    // Other errors (network, rate limit, daily quota) get their own
    // wording from classifyError and don't need a CTA.
    if (err?.code === "trial_no_ai" || err?.status === 402 ||
        err?.code === "subscription_ended") {
      addUpgradeCta();
    }
  } finally {
    isSending = false;
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

function classifyError(err) {
  const code = err?.code || err?.status;

  if (code === "no_license" || err?.status === 401) {
    return t("assistant.error.unauthorized", "Reikia galiojančios licencijos.");
  }

  // Trial users hit this when they try to use AI. They have a valid
  // license, but AI is a paid-plan-only feature. Show upgrade CTA
  // instead of the generic "try later" which would be misleading.
  if (code === "trial_no_ai" || err?.status === 402) {
    return t(
      "assistant.error.trialNoAi",
      "AI asistentas — tik mokamiems planams. Atnaujinti planą jūsų paskyroje."
    );
  }

  // Subscription ended (cancelled / expired / payment_failed). User has
  // a real license — it's just inactive. Show a specific "renew" message
  // rather than the generic "unauthorized" that would be technically true
  // but misleading ("I paid before, why is it unauthorized now?").
  if (code === "subscription_ended") {
    return t(
      "assistant.error.subscriptionEnded",
      "Prenumerata atšaukta. Atnaujink planą kad galėtum vėl naudotis AI."
    );
  }

  // Daily quota exhausted — distinct from burst rate limit. User needs
  // to wait until midnight UTC or upgrade their plan. Retry-After
  // contains seconds until reset, but we express it as "rytoj" for UX.
  if (code === "daily_limit_reached") {
    return t(
      "assistant.error.dailyLimitReached",
      "Pasiekėte dienos žinučių limitą. Bandykite rytoj arba atnaujinkite planą."
    );
  }

  // Burst rate limit — 20 req/min guard. User just needs to slow down.
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

  // Anthropic upstream errors (502/503) — distinct from a misconfigured
  // server. Tell the user it's temporary and they should retry soon.
  if (code === "upstream_error" || code === "service_unavailable" ||
      err?.status === 502 || err?.status === 503) {
    return t(
      "assistant.error.serviceBusy",
      "Asistentas laikinai užimtas. Bandykite po minutės."
    );
  }

  return t("assistant.error.generic", "Asistentas šiuo metu nepasiekiamas. Bandykite vėliau.");
}

function openChat() {
  // No license saved — show activation modal. After successful activation,
  // reopen the chat panel automatically (onSuccess callback re-enters
  // openChat which will now find the key in localStorage and proceed).
  if (!readLicenseKey()) {
    showLicenseModal(() => {
      openChat();
    });
    return;
  }
  if (chatPanel) {
    chatPanel.classList.remove("smart-chat--closing");
    chatPanel.classList.add("smart-chat--open");
    requestAnimationFrame(() => inputEl?.focus());
    return;
  }
  chatPanel = buildChatPanel();
  document.body.appendChild(chatPanel);
  requestAnimationFrame(() => {
    chatPanel.classList.add("smart-chat--open");
    inputEl?.focus();
  });
}

function closeChat() {
  if (!chatPanel) return;
  chatPanel.classList.remove("smart-chat--open");
  chatPanel.classList.add("smart-chat--closing");
  // Panel is kept in the DOM — transcript persists across reopen,
  // same pattern as Intercom / Crisp widgets.
}

// Starts a fresh conversation: clears both the DOM transcript AND the
// context-memory buffer that gets shipped to the server with each
// /api/chat request. Keeps chatPanel itself mounted so the open/close
// animation + input focus state don't flicker.
function clearChat() {
  if (messagesEl) messagesEl.innerHTML = "";
  conversationHistory = [];
}

// ============================================================
// Popup menu — shown above voice button on click
// ============================================================

let popupEl = null;

function buildPopup() {
  const el = document.createElement("div");
  el.setAttribute("data-smart-popup", "");
  el.className = "smart-popup";
  el.setAttribute("role", "menu");
  el.innerHTML =
    '<button type="button" class="smart-popup__option" data-smart-choice="voice" role="menuitem">' +
      '<span class="smart-popup__icon" aria-hidden="true">🎤</span>' +
      '<span class="smart-popup__label">' + escapeHtml(t("assistant.option.voice", "Balsas")) + '</span>' +
    '</button>' +
    '<button type="button" class="smart-popup__option" data-smart-choice="text" role="menuitem">' +
      '<span class="smart-popup__icon" aria-hidden="true">💬</span>' +
      '<span class="smart-popup__label">' + escapeHtml(t("assistant.option.text", "Tekstas")) + '</span>' +
    '</button>';
  el.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-smart-choice]");
    if (!btn) return;
    const choice = btn.getAttribute("data-smart-choice");
    hidePopup();
    if (choice === "voice") {
      try { voiceStartListening(); }
      catch (err) { console.warn("[SmartAssistant] voice start failed:", err); }
    } else if (choice === "text") {
      openChat();
    }
  });
  return el;
}

function showPopup() {
  if (popupEl) { hidePopup(); return; }
  popupEl = buildPopup();
  document.body.appendChild(popupEl);
  requestAnimationFrame(() => popupEl.classList.add("smart-popup--open"));
  // setTimeout-0 so the click that opened the popup doesn't
  // immediately close it via document listener.
  setTimeout(() => document.addEventListener("click", onDocClick, { once: true }), 0);
}

function hidePopup() {
  if (!popupEl) return;
  popupEl.remove();
  popupEl = null;
}

function onDocClick(e) {
  if (!popupEl) return;
  if (popupEl.contains(e.target)) return;
  if (e.target.closest("[data-voice-btn]")) return;
  hidePopup();
}

// ============================================================
// Voice button hijack — cloneNode drops voice-assistant's
// anonymous click handler, then we attach our own.
// ============================================================

function hijackVoiceButton(btn) {
  if (btn._smartHijacked) return;
  const clone = btn.cloneNode(true);
  btn.replaceWith(clone);
  clone._smartHijacked = true;
  clone.addEventListener("click", (e) => {
    // stopPropagation so the popup's own outside-click listener
    // (registered via setTimeout 0) doesn't close it on this click.
    e.stopPropagation();
    showPopup();
  });
}

function watchForVoiceButton() {
  const existing = document.querySelector("[data-voice-btn]");
  if (existing) {
    hijackVoiceButton(existing);
    return;
  }
  // MutationObserver bounded to 3s — never run forever. If voice-
  // assistant never mounts (SpeechRecognition unsupported) we log
  // and let chat become unreachable through the popup surface.
  const deadline = Date.now() + 3000;
  const observer = new MutationObserver(() => {
    const el = document.querySelector("[data-voice-btn]");
    if (el) {
      observer.disconnect();
      hijackVoiceButton(el);
      return;
    }
    if (Date.now() > deadline) {
      observer.disconnect();
      console.warn(
        "[SmartAssistant] voice button never appeared; popup disabled. " +
        "Browser likely lacks SpeechRecognition API."
      );
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// ============================================================
// Styles — single injection, guarded against double-mount.
// Colour palette deliberately mirrors voice-assistant + email
// templates so the brand feels coherent: #0f1812 / #080d0b dark,
// #2ecc8a green accent, #9dc4a8 muted text, #e7a99a error.
// ============================================================

function injectStyles() {
  if (document.querySelector("[data-smart-styles]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-smart-styles", "");
  style.textContent = `
    .smart-popup{
      position:fixed; right:20px; bottom:156px; z-index:99998;
      background:#0f1812; color:#f2f8f4;
      border:1px solid rgba(46,204,138,0.18); border-radius:14px;
      padding:6px; min-width:168px;
      box-shadow:0 12px 28px rgba(0,0,0,0.4);
      opacity:0; transform:translateY(8px);
      transition:opacity .16s, transform .16s;
      display:flex; flex-direction:column; gap:2px;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    }
    .smart-popup.smart-popup--open{ opacity:1; transform:translateY(0); }
    .smart-popup__option{
      display:flex; align-items:center; gap:10px;
      width:100%; background:transparent; border:none; color:inherit;
      padding:10px 12px; border-radius:10px; cursor:pointer;
      font-size:14px; font-weight:600; text-align:left;
    }
    .smart-popup__option:hover{ background:rgba(46,204,138,0.12); }
    .smart-popup__option:focus-visible{
      outline:2px solid #2ecc8a; outline-offset:1px;
    }
    .smart-popup__icon{ font-size:18px; line-height:1; }

    .smart-chat{
      position:fixed; right:20px; bottom:88px; z-index:99997;
      width:380px; height:520px; max-height:calc(100vh - 120px);
      background:#0f1812; color:#f2f8f4;
      border:1px solid rgba(46,204,138,0.18); border-radius:16px;
      box-shadow:0 16px 40px rgba(0,0,0,0.45);
      display:flex; flex-direction:column; overflow:hidden;
      opacity:0; transform:translateY(12px) scale(0.98);
      transition:opacity .2s, transform .2s;
      pointer-events:none;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    }
    .smart-chat.smart-chat--open{
      opacity:1; transform:translateY(0) scale(1); pointer-events:auto;
    }
    .smart-chat.smart-chat--closing{
      opacity:0; transform:translateY(12px) scale(0.98); pointer-events:none;
    }
    .smart-chat__header{
      display:flex; align-items:center; justify-content:space-between;
      padding:14px 16px;
      border-bottom:1px solid rgba(46,204,138,0.12);
      background:#080d0b;
    }
    .smart-chat__title{ font-weight:700; font-size:15px; color:#2ecc8a; }
    .smart-chat__close{
      background:transparent; border:none; color:#9dc4a8;
      font-size:22px; line-height:1; cursor:pointer; padding:0 6px;
    }
    .smart-chat__close:hover{ color:#f2f8f4; }
    .smart-chat__actions{
      display:flex; align-items:center; gap:4px;
    }
    .smart-chat__clear-btn{
      background:transparent; border:none; color:#9dc4a8;
      font-size:16px; line-height:1; cursor:pointer;
      padding:4px 8px; border-radius:6px;
    }
    .smart-chat__clear-btn:hover{
      color:#f2f8f4; background:rgba(46,204,138,0.12);
    }
    .smart-chat__messages{
      flex:1; overflow-y:auto; padding:14px;
      display:flex; flex-direction:column; gap:8px;
      scrollbar-width:thin; scrollbar-color:rgba(46,204,138,0.25) transparent;
    }
    .smart-chat__messages::-webkit-scrollbar{ width:6px; }
    .smart-chat__messages::-webkit-scrollbar-thumb{
      background:rgba(46,204,138,0.25); border-radius:3px;
    }
    .smart-chat__bubble{
      max-width:82%; padding:9px 12px; border-radius:14px;
      font-size:14px; line-height:1.45;
      word-wrap:break-word; white-space:pre-wrap;
    }
    .smart-chat__bubble strong{ font-weight:700; }
    .smart-chat__bubble em{ font-style:italic; }
    .smart-chat__bubble code{
      font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
      font-size:12.5px;
      background:rgba(255,255,255,0.08);
      padding:1px 5px; border-radius:4px;
    }
    .smart-chat__bubble h3,
    .smart-chat__bubble h4{
      margin:8px 0 4px; font-weight:700; line-height:1.3;
    }
    .smart-chat__bubble h3{ font-size:15px; }
    .smart-chat__bubble h4{ font-size:14px; }
    .smart-chat__bubble ul,
    .smart-chat__bubble ol{ margin:4px 0; padding-left:20px; }
    .smart-chat__bubble li{ margin-bottom:2px; }
    .smart-chat__bubble p{ margin:0 0 6px; }
    .smart-chat__bubble p:last-child{ margin-bottom:0; }
    .smart-chat__bubble--user{
      align-self:flex-end; background:#2ecc8a; color:#030d07;
      border-bottom-right-radius:4px;
    }
    .smart-chat__bubble--assistant{
      align-self:flex-start; background:#1a2620; color:#f2f8f4;
      border-bottom-left-radius:4px;
    }
    .smart-chat__bubble--error{
      align-self:flex-start; background:#e7a99a; color:#030d07;
      border-bottom-left-radius:4px;
    }
    .smart-chat__upgrade-cta{
      align-self:flex-start; display:inline-block;
      background:#2ecc8a; color:#030d07;
      padding:8px 14px; border-radius:14px;
      font-size:13px; font-weight:600;
      text-decoration:none;
      margin-top:-4px;
      transition:background .2s, transform .2s;
    }
    .smart-chat__upgrade-cta:hover{
      background:#3ed89b; transform:translateX(2px);
    }
    .smart-chat__typing{
      display:flex; gap:4px; align-items:center; padding:11px 14px;
    }
    .smart-chat__dot{
      width:6px; height:6px; border-radius:50%;
      background:#9dc4a8;
      animation:smart-dot 1.4s infinite ease-in-out both;
    }
    .smart-chat__dot:nth-child(2){ animation-delay:.2s; }
    .smart-chat__dot:nth-child(3){ animation-delay:.4s; }
    @keyframes smart-dot{
      0%,80%,100%{ transform:scale(0.7); opacity:0.5; }
      40%         { transform:scale(1);   opacity:1;   }
    }
    .smart-chat__input-row{
      display:flex; gap:8px; padding:12px 14px;
      border-top:1px solid rgba(46,204,138,0.12);
      background:#080d0b;
    }
    .smart-chat__input{
      flex:1; resize:none; min-height:38px; max-height:120px;
      background:#0f1812; color:#f2f8f4;
      border:1px solid rgba(46,204,138,0.18); border-radius:10px;
      padding:9px 11px; font-size:14px; line-height:1.4;
      font-family:inherit; outline:none;
    }
    .smart-chat__input:focus{ border-color:#2ecc8a; }
    .smart-chat__send{
      background:#2ecc8a; color:#030d07; border:none;
      padding:0 16px; border-radius:10px;
      font-weight:600; font-size:14px;
      cursor:pointer; min-height:38px;
    }
    .smart-chat__send:hover:not(:disabled){ background:#3ed89b; }
    .smart-chat__send:disabled{ opacity:0.5; cursor:not-allowed; }

    @media (max-width: 640px){
      .smart-chat{
        right:0; bottom:0; left:0;
        width:100vw; height:100vh; max-height:100vh;
        border-radius:0; border:none;
      }
      .smart-popup{ right:16px; bottom:140px; }
    }
  `;
  document.head.appendChild(style);
}

// ============================================================
// Init — bounded, graceful, idempotent
// ============================================================

function init() {
  try {
    injectStyles();
    watchForVoiceButton();
  } catch (err) {
    console.warn("[SmartAssistant] init failed:", err);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Re-render panel chrome on language change, without losing the
// ongoing conversation transcript.
window.addEventListener("besafe:language-changed", () => {
  if (!chatPanel) return;
  const title    = chatPanel.querySelector(".smart-chat__title");
  const closeBtn = chatPanel.querySelector("[data-smart-close]");
  if (title)    title.textContent = t("assistant.title", "BeSafe Asistentas");
  if (closeBtn) closeBtn.setAttribute("aria-label", t("assistant.close", "Uždaryti"));
  if (inputEl)  inputEl.setAttribute("placeholder", t("assistant.placeholder", "Rašykite žinutę..."));
  if (sendBtn)  sendBtn.textContent = t("assistant.send", "Siųsti");
});
