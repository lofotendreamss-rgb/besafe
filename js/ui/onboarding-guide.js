/**
 * BeSafe Onboarding Welcome Guide
 * Interactive 3-step overlay for first-time users.
 */

const STORAGE_KEY = 'besafe_onboarding_guide_done';

function injectStyles() {
  if (document.getElementById('besafe-onboarding-guide-styles')) return;

  const style = document.createElement('style');
  style.id = 'besafe-onboarding-guide-styles';
  style.textContent = `
    @keyframes guideIn {
      from { opacity: 0; transform: scale(0.95) translateY(20px); }
      to   { opacity: 1; transform: scale(1) translateY(0); }
    }
    @keyframes guideFadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes guideFadeOut {
      from { opacity: 1; }
      to   { opacity: 0; }
    }
    @keyframes guideSlideUp {
      from { opacity: 0; transform: translateY(30px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes guidePulse {
      0%, 100% { transform: scale(1); }
      50%      { transform: scale(1.05); }
    }
    @keyframes guideCheckDraw {
      from { stroke-dashoffset: 48; }
      to   { stroke-dashoffset: 0; }
    }
    @keyframes guideCheckCircle {
      from { stroke-dashoffset: 166; }
      to   { stroke-dashoffset: 0; }
    }
    @keyframes guideDotPop {
      0%   { transform: scale(0.6); }
      60%  { transform: scale(1.15); }
      100% { transform: scale(1); }
    }

    .og-overlay {
      position: fixed;
      inset: 0;
      z-index: 100000;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(8, 13, 11, 0.92);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      animation: guideFadeIn 0.4s ease-out;
    }
    .og-overlay.og-closing {
      animation: guideFadeOut 0.35s ease-in forwards;
      pointer-events: none;
    }

    .og-card {
      position: relative;
      width: min(440px, 90vw);
      max-height: 85vh;
      overflow-y: auto;
      background: #0e1613;
      border: 1px solid rgba(46, 204, 138, 0.15);
      border-radius: 20px;
      padding: 48px 36px 36px;
      text-align: center;
      box-shadow:
        0 0 60px rgba(46, 204, 138, 0.08),
        0 24px 48px rgba(0, 0, 0, 0.4);
      animation: guideIn 0.5s ease-out;
    }

    .og-skip {
      position: absolute;
      top: 18px;
      right: 22px;
      background: none;
      border: none;
      color: rgba(242, 248, 244, 0.4);
      font-size: 13px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 6px;
      transition: color 0.2s, background 0.2s;
      font-family: inherit;
    }
    .og-skip:hover {
      color: rgba(242, 248, 244, 0.7);
      background: rgba(242, 248, 244, 0.06);
    }

    .og-logo {
      width: 64px;
      height: 64px;
      margin: 0 auto 24px;
      background: linear-gradient(135deg, #2ecc8a 0%, #1a9d6a 100%);
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      font-weight: 800;
      color: #080d0b;
      letter-spacing: -1px;
      box-shadow: 0 8px 24px rgba(46, 204, 138, 0.25);
    }

    .og-title {
      font-size: 26px;
      font-weight: 700;
      color: #f2f8f4;
      margin: 0 0 12px;
      line-height: 1.2;
    }

    .og-subtitle {
      font-size: 15px;
      color: rgba(242, 248, 244, 0.55);
      margin: 0 0 32px;
      line-height: 1.5;
    }

    .og-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 14px 36px;
      border: none;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.15s, box-shadow 0.2s, background 0.2s;
      font-family: inherit;
    }
    .og-btn:active {
      transform: scale(0.97);
    }

    .og-btn--primary {
      background: linear-gradient(135deg, #2ecc8a 0%, #27b57a 100%);
      color: #080d0b;
      box-shadow: 0 4px 16px rgba(46, 204, 138, 0.3);
    }
    .og-btn--primary:hover {
      box-shadow: 0 6px 24px rgba(46, 204, 138, 0.45);
      transform: translateY(-1px);
    }

    .og-btn--secondary {
      background: rgba(242, 248, 244, 0.08);
      color: #f2f8f4;
      border: 1px solid rgba(242, 248, 244, 0.12);
    }
    .og-btn--secondary:hover {
      background: rgba(242, 248, 244, 0.12);
    }

    .og-action-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 28px;
    }

    .og-action-card {
      background: rgba(242, 248, 244, 0.04);
      border: 1px solid rgba(242, 248, 244, 0.1);
      border-radius: 14px;
      padding: 28px 16px;
      cursor: pointer;
      transition: transform 0.2s, border-color 0.2s, background 0.2s, box-shadow 0.2s;
    }
    .og-action-card:hover {
      transform: translateY(-3px);
      border-color: rgba(46, 204, 138, 0.4);
      background: rgba(46, 204, 138, 0.06);
      box-shadow: 0 8px 24px rgba(46, 204, 138, 0.1);
    }

    .og-action-icon {
      width: 48px;
      height: 48px;
      margin: 0 auto 14px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
    }
    .og-action-icon--income {
      background: rgba(46, 204, 138, 0.15);
      color: #2ecc8a;
    }
    .og-action-icon--expense {
      background: rgba(231, 76, 60, 0.15);
      color: #e74c3c;
    }

    .og-action-label {
      font-size: 15px;
      font-weight: 600;
      color: #f2f8f4;
    }

    .og-action-hint {
      font-size: 12px;
      color: rgba(242, 248, 244, 0.4);
      margin-top: 6px;
    }

    .og-check-wrap {
      margin: 0 auto 24px;
      width: 72px;
      height: 72px;
    }
    .og-check-circle {
      fill: none;
      stroke: #2ecc8a;
      stroke-width: 2.5;
      stroke-dasharray: 166;
      stroke-dashoffset: 166;
      animation: guideCheckCircle 0.6s ease-out 0.2s forwards;
    }
    .og-check-mark {
      fill: none;
      stroke: #2ecc8a;
      stroke-width: 3;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-dasharray: 48;
      stroke-dashoffset: 48;
      animation: guideCheckDraw 0.4s ease-out 0.7s forwards;
    }

    .og-stat {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(46, 204, 138, 0.1);
      border: 1px solid rgba(46, 204, 138, 0.2);
      border-radius: 10px;
      padding: 10px 20px;
      margin-bottom: 28px;
      font-size: 14px;
      color: #2ecc8a;
      font-weight: 600;
    }
    .og-stat-icon {
      font-size: 16px;
    }

    .og-dots {
      display: flex;
      justify-content: center;
      gap: 10px;
      margin-top: 28px;
    }
    .og-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: rgba(242, 248, 244, 0.18);
      transition: background 0.3s, transform 0.3s;
    }
    .og-dot.og-dot--active {
      background: #2ecc8a;
      animation: guideDotPop 0.35s ease-out;
    }

    .og-step {
      animation: guideSlideUp 0.4s ease-out;
    }

    .og-or {
      font-size: 13px;
      color: rgba(242, 248, 244, 0.3);
      margin-bottom: 16px;
    }
  `;
  document.head.appendChild(style);
}

function createOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'og-overlay';
  overlay.id = 'besafe-onboarding-guide';
  return overlay;
}

function renderDots(activeIndex) {
  return `
    <div class="og-dots">
      ${[0, 1, 2].map(i =>
        `<div class="og-dot ${i === activeIndex ? 'og-dot--active' : ''}"></div>`
      ).join('')}
    </div>
  `;
}

function renderStep1() {
  return `
    <div class="og-step">
      <div class="og-logo">B</div>
      <h2 class="og-title">Welcome to BeSafe!</h2>
      <p class="og-subtitle">Let's set up your first financial record in 60 seconds</p>
      <button class="og-btn og-btn--primary" data-og-action="next">
        Start
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      ${renderDots(0)}
    </div>
  `;
}

function renderStep2() {
  return `
    <div class="og-step">
      <h2 class="og-title">Add your first entry</h2>
      <p class="og-subtitle">Choose a type to get started with your finances</p>
      <div class="og-action-grid">
        <div class="og-action-card" data-og-action="income">
          <div class="og-action-icon og-action-icon--income">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 20V4m0 0l-6 6m6-6l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="og-action-label">Add Income</div>
          <div class="og-action-hint">Salary, freelance, etc.</div>
        </div>
        <div class="og-action-card" data-og-action="expense">
          <div class="og-action-icon og-action-icon--expense">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 4v16m0 0l6-6m-6 6l-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="og-action-label">Add Expense</div>
          <div class="og-action-hint">Food, rent, transport...</div>
        </div>
      </div>
      <div class="og-or">or</div>
      <button class="og-btn og-btn--secondary" data-og-action="skip-to-finish" style="font-size:13px; padding:10px 24px;">
        I'll add entries later
      </button>
      ${renderDots(1)}
    </div>
  `;
}

function renderStep3(entryAdded) {
  const statText = entryAdded ? '1 entry recorded' : 'Ready to go';
  const statIcon = entryAdded ? '&#10003;' : '&#9733;';
  return `
    <div class="og-step">
      <div class="og-check-wrap">
        <svg viewBox="0 0 56 56" width="72" height="72">
          <circle class="og-check-circle" cx="28" cy="28" r="26"/>
          <polyline class="og-check-mark" points="17 28 25 36 39 22"/>
        </svg>
      </div>
      <h2 class="og-title">You're all set!</h2>
      <p class="og-subtitle">Your financial overview is ready</p>
      <div class="og-stat">
        <span class="og-stat-icon">${statIcon}</span>
        ${statText}
      </div>
      <br/>
      <button class="og-btn og-btn--primary" data-og-action="finish">
        Explore BeSafe
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      ${renderDots(2)}
    </div>
  `;
}

function closeGuide(overlay) {
  overlay.classList.add('og-closing');
  setTimeout(() => {
    overlay.remove();
  }, 350);

  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch (_) {
    // Storage unavailable
  }
}

function triggerQuickAction(type) {
  // Find the quick-action button on the home page and click it
  const btn = document.querySelector(`.quick-action-btn[data-action="${type}"]`);
  if (btn) {
    btn.click();
  }
}

export function showOnboardingGuide({ force = false } = {}) {
  // Only show once, unless forced
  if (!force) {
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch (_) {
      // Storage unavailable — show the guide
    }
  }

  // Don't double-mount
  if (document.getElementById('besafe-onboarding-guide')) return;

  injectStyles();

  const overlay = createOverlay();
  const card = document.createElement('div');
  card.className = 'og-card';
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  let currentStep = 1;
  let entryAdded = false;

  function renderCurrentStep() {
    if (currentStep === 1) card.innerHTML = renderStep1() + '<button class="og-skip" data-og-action="close">Skip</button>';
    if (currentStep === 2) card.innerHTML = renderStep2() + '<button class="og-skip" data-og-action="close">Skip</button>';
    if (currentStep === 3) card.innerHTML = renderStep3(entryAdded);
  }

  renderCurrentStep();

  // Listen for transaction saves to auto-advance from step 2
  function onTransactionSaved() {
    if (currentStep === 2) {
      entryAdded = true;
      currentStep = 3;
      // Small delay so user sees the form close
      setTimeout(() => {
        renderCurrentStep();
      }, 600);
    }
  }

  // Listen for the QuickActions modal close / transaction event
  window.addEventListener('besafe:transaction-created', onTransactionSaved);
  // Also listen for generic custom event that might be dispatched
  window.addEventListener('besafe:quick-action-saved', onTransactionSaved);

  // Fallback: observe DOM for transaction list changes
  let formObserver = null;
  function watchForFormCompletion() {
    // Watch for the QuickActions modal to close as a signal
    const checkInterval = setInterval(() => {
      if (currentStep !== 2) {
        clearInterval(checkInterval);
        return;
      }
      // Check if a transaction was added by looking for success indicators
      const successToast = document.querySelector('.toast--success, .notification--success, [data-toast="success"]');
      if (successToast) {
        clearInterval(checkInterval);
        onTransactionSaved();
      }
    }, 500);

    // Auto-clear after 60 seconds
    setTimeout(() => clearInterval(checkInterval), 60000);
  }

  card.addEventListener('click', (e) => {
    const action = e.target.closest('[data-og-action]')?.dataset.ogAction;
    if (!action) return;

    switch (action) {
      case 'next':
        currentStep = 2;
        renderCurrentStep();
        break;

      case 'income':
        triggerQuickAction('income');
        watchForFormCompletion();
        // Auto-advance after a delay if user doesn't complete
        break;

      case 'expense':
        triggerQuickAction('expense');
        watchForFormCompletion();
        break;

      case 'skip-to-finish':
        currentStep = 3;
        renderCurrentStep();
        break;

      case 'finish':
      case 'close':
        window.removeEventListener('besafe:transaction-created', onTransactionSaved);
        window.removeEventListener('besafe:quick-action-saved', onTransactionSaved);
        closeGuide(overlay);
        break;
    }
  });

  // Close on Escape key
  function onEscape(e) {
    if (e.key === 'Escape') {
      window.removeEventListener('besafe:transaction-created', onTransactionSaved);
      window.removeEventListener('besafe:quick-action-saved', onTransactionSaved);
      document.removeEventListener('keydown', onEscape);
      closeGuide(overlay);
    }
  }
  document.addEventListener('keydown', onEscape);
}

// Make globally accessible
window.showOnboardingGuide = showOnboardingGuide;
