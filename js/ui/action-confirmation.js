/**
 * BeSafe Action Confirmation Dialog
 *
 * Phase 3 step 4/5 (2026-04-29). Renders a confirmation prompt when
 * Claude returns a `tool_use` block with `requiresConfirmation: true`
 * (or for unknown tool names, defended in agent loop). Backend never
 * mutates Supabase for finance data — local-first architecture, see
 * memory: local_first_finance_data — so the actual write happens in
 * the `onConfirm` callback against `js/services/data/local.db.js`.
 *
 * Flow:
 *   1. smart-assistant.js receives response.toolCalls (one or more)
 *   2. For each toolCall, calls showActionConfirmation({...})
 *   3. User picks Patvirtinti / Atšaukti / ESC / outside-click
 *   4. onConfirm or onCancel fires; modal closes
 *
 * Pattern mirrors license-modal.js — single module-scope state,
 * inline styles injected once, ESC + click-outside dismiss.
 *
 * Mobile-first responsive:
 *   - ≤640px: bottom sheet (slides up from bottom, full width)
 *   - >640px: centered modal (~440px wide)
 *
 * i18n: createTranslator + getCurrentLanguage with LT fallback as
 * the second arg to t(). Matches the convention in smart-assistant.js
 * and voice-assistant.js — a missing dictionary key falls through to
 * the LT default rather than showing the user a raw key string.
 */

import { createTranslator, getCurrentLanguage } from "../core/i18n.js";

// ============================================================
// Module state — single dialog instance at a time. If a second
// showActionConfirmation arrives while one is open, the first is
// auto-cancelled (its onCancel fires) before the second mounts.
// This matches the user's mental model: only one prompt visible.
// ============================================================

let modalEl           = null;
let currentToolCall   = null;
let currentOnConfirm  = null;
let currentOnCancel   = null;
let escListenerAttached = false;

// ============================================================
// i18n helpers — same shape as license-modal.js / smart-assistant.js.
// LT fallback in the 2nd arg covers the case where a translation is
// missing from any dictionary including English.
// ============================================================

function getLang() {
  try { return String(getCurrentLanguage?.() || "en").toLowerCase(); }
  catch { return "en"; }
}

function t(key, fallback, params) {
  try { return createTranslator(getLang())(key, fallback, params); }
  catch { return fallback; }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Format amount with comma decimal separator (LT/EU convention).
// 25 → "25,00"; 25.5 → "25,50"; 25.555 → "25,56".
function formatAmount(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0,00";
  return num.toFixed(2).replace(".", ",");
}

// ============================================================
// Action description — maps a toolCall into a localized prompt
// string. Add a new case here when a new write tool ships in
// step 1b/6 (deleteTransaction, addCategory, addPlace, etc.).
// Unknown tool names fall through to the generic action key, which
// at least surfaces what Claude tried to do.
// ============================================================

function describeAction(toolCall) {
  const input = toolCall?.input || {};
  switch (toolCall?.name) {
    case "addTransaction": {
      return t(
        "assistant.confirm.action.add",
        "Pridėti {amount} € — {category}?",
        {
          amount:   formatAmount(input.amount),
          category: String(input.category || ""),
        }
      );
    }
    default: {
      return t(
        "assistant.confirm.action.generic",
        "Patvirtinti veiksmą: {name}",
        { name: String(toolCall?.name || "") }
      );
    }
  }
}

// Optional second-line context — pulled from input.description /
// input.date when present, escaped for HTML insertion. Empty string
// when there's nothing extra to show, so the panel doesn't render
// blank lines.
function describeMeta(toolCall) {
  const input = toolCall?.input || {};
  const parts = [];
  if (typeof input.description === "string" && input.description.trim()) {
    parts.push(escapeHtml(input.description.trim()));
  }
  if (typeof input.date === "string" && input.date.trim()) {
    parts.push(escapeHtml(input.date.trim()));
  }
  return parts.join(" · ");
}

// ============================================================
// Styles — injected once, scoped via .action-confirm prefix to
// avoid collision with smart-chat / license-modal classes. Mobile
// bottom sheet vs desktop center modal handled via @media query.
// ============================================================

function ensureStyles() {
  if (document.getElementById("action-confirmation-styles")) return;
  const style = document.createElement("style");
  style.id = "action-confirmation-styles";
  style.textContent = `
    .action-confirm{
      position:fixed; inset:0; z-index:99999;
      display:none;
      background:rgba(8,13,11,0.75); backdrop-filter:blur(8px);
      align-items:flex-end; justify-content:center;
    }
    .action-confirm.is-open{ display:flex; }
    .action-confirm__panel{
      background:#0f1812;
      border:1px solid rgba(46,204,138,0.2);
      color:#f2f8f4;
      font-family:system-ui,-apple-system,sans-serif;
      box-shadow:0 -10px 40px rgba(0,0,0,0.5);
      width:100%;
      border-radius:18px 18px 0 0;
      padding:1.5rem 1.25rem 1.75rem;
      animation: action-confirm-slide-up 0.22s ease-out;
    }
    @keyframes action-confirm-slide-up{
      from{ transform:translateY(100%); opacity:0; }
      to  { transform:translateY(0);    opacity:1; }
    }
    .action-confirm__title{
      font-size:0.85rem; font-weight:600; letter-spacing:0.04em;
      text-transform:uppercase; color:#9dc4a8;
      margin:0 0 0.75rem;
    }
    .action-confirm__action{
      font-size:1.15rem; font-weight:600; line-height:1.4;
      margin:0 0 0.5rem; color:#f2f8f4;
      word-wrap:break-word;
    }
    .action-confirm__meta{
      font-size:0.85rem; color:#9dc4a8; line-height:1.5;
      margin:0 0 1.25rem;
    }
    .action-confirm__meta:empty{ display:none; }
    .action-confirm__actions{
      display:flex; gap:0.75rem; margin-top:0.5rem;
    }
    .action-confirm__btn{
      flex:1; padding:0.85rem 1rem;
      border:none; border-radius:2rem;
      font-size:0.95rem; font-weight:600;
      cursor:pointer; transition:all 0.18s;
      font-family:inherit;
    }
    .action-confirm__btn--cancel{
      background:transparent;
      color:#9dc4a8;
      border:1px solid rgba(46,204,138,0.25);
    }
    .action-confirm__btn--cancel:hover{
      color:#f2f8f4; border-color:rgba(46,204,138,0.5);
    }
    .action-confirm__btn--confirm{
      background:#2ecc8a; color:#030d07;
    }
    .action-confirm__btn--confirm:hover:not(:disabled){
      background:#1a9e66; transform:translateY(-1px);
    }
    .action-confirm__btn--confirm:disabled{
      opacity:0.5; cursor:not-allowed; transform:none;
    }

    @media (min-width: 641px){
      .action-confirm{ align-items:center; }
      .action-confirm__panel{
        width:min(440px, 90vw);
        border-radius:18px;
        padding:2rem;
        animation: action-confirm-fade 0.18s ease-out;
      }
      @keyframes action-confirm-fade{
        from{ transform:scale(0.96); opacity:0; }
        to  { transform:scale(1);    opacity:1; }
      }
    }
  `;
  document.head.appendChild(style);
}

// ============================================================
// DOM build — runs once per dialog instance. We rebuild fresh
// each time rather than re-using a hidden element so language
// changes mid-session pick up the new strings without cache
// invalidation logic.
// ============================================================

function buildModal(toolCall) {
  ensureStyles();

  const action = describeAction(toolCall);
  const meta   = describeMeta(toolCall);

  const wrap = document.createElement("div");
  wrap.className = "action-confirm";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.setAttribute("aria-labelledby", "action-confirm-title");

  wrap.innerHTML =
    '<div class="action-confirm__panel">' +
      '<p id="action-confirm-title" class="action-confirm__title">' +
        escapeHtml(t("assistant.confirm.title", "Patvirtinkite veiksmą")) +
      '</p>' +
      '<p class="action-confirm__action">' + escapeHtml(action) + '</p>' +
      '<p class="action-confirm__meta">' + meta + '</p>' +
      '<div class="action-confirm__actions">' +
        '<button type="button" class="action-confirm__btn action-confirm__btn--cancel" data-action-cancel>' +
          escapeHtml(t("assistant.confirm.button.cancel", "Atšaukti")) +
        '</button>' +
        '<button type="button" class="action-confirm__btn action-confirm__btn--confirm" data-action-confirm>' +
          escapeHtml(t("assistant.confirm.button.confirm", "Patvirtinti")) +
        '</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(wrap);

  const cancelBtn  = wrap.querySelector("[data-action-cancel]");
  const confirmBtn = wrap.querySelector("[data-action-confirm]");

  cancelBtn.addEventListener("click", handleCancel);
  confirmBtn.addEventListener("click", () => handleConfirm(confirmBtn));

  // Backdrop click → cancel. Compare target to wrap so panel clicks
  // (children) don't dismiss.
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) handleCancel();
  });

  // One-time global ESC listener — guarded against re-attach on
  // subsequent dialogs.
  if (!escListenerAttached) {
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modalEl?.classList.contains("is-open")) {
        handleCancel();
      }
    });
    escListenerAttached = true;
  }

  return wrap;
}

function close() {
  if (!modalEl) return;
  modalEl.remove();
  modalEl          = null;
  currentToolCall  = null;
  currentOnConfirm = null;
  currentOnCancel  = null;
}

function handleCancel() {
  // Capture before close() resets module state.
  const cb = currentOnCancel;
  const tc = currentToolCall;
  close();
  if (typeof cb === "function") {
    try { cb(tc); }
    catch (err) { console.warn("[ActionConfirmation] onCancel threw:", err); }
  }
}

async function handleConfirm(confirmBtn) {
  if (!currentOnConfirm) {
    close();
    return;
  }

  // Disable both buttons during the async confirm so a double-click
  // doesn't fire onConfirm twice. Track the tool call locally so
  // close() can run before onConfirm — guarantees the modal vanishes
  // even if onConfirm throws.
  const cb = currentOnConfirm;
  const tc = currentToolCall;
  if (confirmBtn) confirmBtn.disabled = true;
  const cancelBtn = modalEl?.querySelector("[data-action-cancel]");
  if (cancelBtn) cancelBtn.disabled = true;

  close();

  try {
    await cb(tc);
  } catch (err) {
    // onConfirm is allowed to throw — caller (smart-assistant.js)
    // handles the error UX (error bubble). We just don't crash.
    console.warn("[ActionConfirmation] onConfirm threw:", err);
  }
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Show a confirmation dialog for a Claude tool_use action.
 *
 * If a previous dialog is still open, it is auto-cancelled (its
 * onCancel fires) before the new one mounts — matches the
 * "one prompt visible" UX. Caller iterating over multiple toolCalls
 * should chain via onConfirm/onCancel callbacks rather than firing
 * showActionConfirmation in a tight loop.
 *
 * @param {object}   params
 * @param {object}   params.toolCall   — { id, name, input, requiresConfirmation }
 * @param {Function} params.onConfirm  — async (toolCall) => Promise<void>;
 *                                       caller does the actual mutation
 *                                       (e.g. local.db.createTransaction)
 * @param {Function} [params.onCancel] — sync (toolCall) => void; optional
 */
export function showActionConfirmation({ toolCall, onConfirm, onCancel } = {}) {
  if (!toolCall || typeof toolCall !== "object") {
    console.warn("[ActionConfirmation] toolCall is required");
    return;
  }
  if (typeof onConfirm !== "function") {
    console.warn("[ActionConfirmation] onConfirm callback is required");
    return;
  }

  // Auto-cancel any open dialog before mounting a new one.
  if (modalEl) {
    handleCancel();
  }

  currentToolCall  = toolCall;
  currentOnConfirm = onConfirm;
  currentOnCancel  = typeof onCancel === "function" ? onCancel : null;

  modalEl = buildModal(toolCall);
  // requestAnimationFrame so the slide-up CSS animation has a clean
  // start frame (display:none → display:flex transition).
  requestAnimationFrame(() => {
    modalEl?.classList.add("is-open");
  });
}
