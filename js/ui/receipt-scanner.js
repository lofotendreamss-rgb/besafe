/**
 * BeSafe Receipt Scanner
 *
 * Full-screen modal that connects the existing ReceiptOCR class
 * (window.receiptOCR) to the BeSafe Transactions system.
 *
 * Flow:  Upload/Camera  ->  Processing  ->  Review & Edit  ->  Saved
 */

/* ------------------------------------------------------------------ */
/*  API URL (same logic as system.boot.js)                            */
/* ------------------------------------------------------------------ */
const isLocal =
  window.location.hostname === "127.0.0.1" ||
  window.location.hostname === "localhost";
const API_URL = isLocal
  ? "http://127.0.0.1:3001"
  : "https://besafe-oga3.onrender.com";

/* ------------------------------------------------------------------ */
/*  Categories used in the review step                                */
/* ------------------------------------------------------------------ */
const CATEGORIES = [
  { value: "food", label: "Food & Groceries" },
  { value: "shopping", label: "Shopping" },
  { value: "transport", label: "Transport" },
  { value: "housing", label: "Housing & Utilities" },
  { value: "health", label: "Health" },
  { value: "entertainment", label: "Entertainment" },
  { value: "education", label: "Education" },
  { value: "bills", label: "Bills & Payments" },
  { value: "travel", label: "Travel" },
  { value: "family", label: "Family" },
  { value: "pets", label: "Pets" },
  { value: "gifts", label: "Gifts" },
  { value: "other", label: "Other" },
];

/* ------------------------------------------------------------------ */
/*  CSS (injected once)                                               */
/* ------------------------------------------------------------------ */
let cssInjected = false;

function injectCSS() {
  if (cssInjected) return;
  cssInjected = true;

  const style = document.createElement("style");
  style.textContent = /* css */ `
    /* ---- overlay ---- */
    .rs-overlay {
      position: fixed; inset: 0; z-index: 99999;
      background: rgba(0,0,0,.65);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      display: flex; align-items: center; justify-content: center;
      padding: 16px;
      animation: rsFadeIn .25s ease;
    }
    @keyframes rsFadeIn { from { opacity:0 } to { opacity:1 } }

    /* ---- card ---- */
    .rs-card {
      background: #080d0b;
      border: 1px solid rgba(46,204,138,.15);
      border-radius: 20px;
      width: 100%; max-width: 480px;
      max-height: 92vh;
      overflow-y: auto;
      color: #d4e8dc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      animation: rsSlideUp .3s ease;
    }
    @keyframes rsSlideUp { from { opacity:0; transform:translateY(24px) } to { opacity:1; transform:translateY(0) } }
    .rs-card::-webkit-scrollbar { width:6px }
    .rs-card::-webkit-scrollbar-thumb { background:rgba(46,204,138,.25); border-radius:3px }

    /* ---- header ---- */
    .rs-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 20px 24px 12px;
      border-bottom: 1px solid rgba(46,204,138,.1);
    }
    .rs-header__title {
      font-size: 18px; font-weight: 700; color: #2ecc8a; margin:0;
    }
    .rs-header__close {
      background: none; border: none; color: #8aa898; font-size: 22px;
      cursor: pointer; padding: 4px 8px; border-radius: 8px;
      transition: color .15s;
    }
    .rs-header__close:hover { color: #fff }

    /* ---- progress ---- */
    .rs-progress {
      display: flex; gap: 6px; padding: 12px 24px 0;
    }
    .rs-progress__dot {
      flex: 1; height: 4px; border-radius: 2px;
      background: rgba(46,204,138,.15);
      transition: background .3s;
    }
    .rs-progress__dot--active { background: #2ecc8a }
    .rs-progress__dot--done   { background: rgba(46,204,138,.45) }

    /* ---- body ---- */
    .rs-body { padding: 20px 24px 24px }

    /* ---- step 1: upload ---- */
    .rs-upload {
      border: 2px dashed rgba(46,204,138,.3);
      border-radius: 16px;
      padding: 36px 24px;
      text-align: center;
      cursor: pointer;
      transition: border-color .2s, background .2s;
      position: relative;
    }
    .rs-upload:hover, .rs-upload.is-dragover {
      border-color: #2ecc8a;
      background: rgba(46,204,138,.06);
    }
    .rs-upload__icon { font-size: 40px; margin-bottom: 12px }
    .rs-upload__text { font-size: 14px; color: #8aa898; margin: 0 }
    .rs-upload__input {
      position: absolute; inset: 0; opacity: 0; cursor: pointer;
      width: 100%; height: 100%;
    }

    .rs-camera-btn {
      display: inline-flex; align-items: center; gap: 8px;
      margin-top: 16px; padding: 10px 20px;
      background: rgba(46,204,138,.12); border: 1px solid rgba(46,204,138,.25);
      border-radius: 12px; color: #2ecc8a; font-size: 14px; font-weight: 600;
      cursor: pointer; transition: background .2s;
      position: relative; overflow: hidden;
    }
    .rs-camera-btn:hover { background: rgba(46,204,138,.2) }
    .rs-camera-btn input {
      position: absolute; inset: 0; opacity: 0; cursor: pointer;
      width: 100%; height: 100%;
    }

    .rs-preview { margin-top: 16px; text-align: center }
    .rs-preview img {
      max-width: 100%; max-height: 200px;
      border-radius: 12px; object-fit: cover;
    }

    .rs-scan-btn {
      display: block; width: 100%; margin-top: 20px;
      padding: 14px; border: none; border-radius: 14px;
      background: #2ecc8a; color: #080d0b;
      font-size: 15px; font-weight: 700; cursor: pointer;
      transition: opacity .2s;
    }
    .rs-scan-btn:disabled { opacity:.4; cursor:not-allowed }
    .rs-scan-btn:not(:disabled):hover { opacity:.88 }

    /* ---- step 2: processing ---- */
    .rs-processing { text-align: center; padding: 48px 0 }
    @keyframes rsSpin { to { transform: rotate(360deg) } }
    .rs-spinner {
      width: 48px; height: 48px; border: 3px solid rgba(46,204,138,.2);
      border-top-color: #2ecc8a; border-radius: 50%;
      animation: rsSpin .8s linear infinite;
      margin: 0 auto 20px;
    }
    .rs-processing__text { font-size: 15px; color: #8aa898 }

    /* ---- step 3: review ---- */
    .rs-field { margin-bottom: 16px }
    .rs-field__label {
      display: block; font-size: 12px; font-weight: 600;
      color: #8aa898; margin-bottom: 6px; text-transform: uppercase;
      letter-spacing: .04em;
    }
    .rs-field__input, .rs-field__select, .rs-field__textarea {
      width: 100%; padding: 10px 14px;
      background: rgba(46,204,138,.06);
      border: 1px solid rgba(46,204,138,.2);
      border-radius: 10px; color: #d4e8dc; font-size: 14px;
      font-family: inherit; outline: none;
      transition: border-color .2s;
      box-sizing: border-box;
    }
    .rs-field__input:focus, .rs-field__select:focus, .rs-field__textarea:focus {
      border-color: #2ecc8a;
    }
    .rs-field__select { appearance: none; cursor: pointer }
    .rs-field__textarea { resize: vertical; min-height: 56px }
    .rs-field__select option { background: #080d0b; color: #d4e8dc }

    /* products table */
    .rs-products { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px }
    .rs-products th {
      text-align: left; font-weight: 600; color: #8aa898;
      padding: 6px 8px; border-bottom: 1px solid rgba(46,204,138,.15);
      font-size: 11px; text-transform: uppercase;
    }
    .rs-products td { padding: 6px 8px; border-bottom: 1px solid rgba(46,204,138,.06) }
    .rs-products input {
      background: transparent; border: none; color: #d4e8dc;
      font-size: 13px; font-family: inherit; width: 100%;
      padding: 2px 0; outline: none;
    }
    .rs-products input:focus { border-bottom: 1px solid #2ecc8a }
    .rs-products .rs-products__remove {
      background: none; border: none; color: #8aa898; cursor: pointer;
      font-size: 16px; padding: 2px 6px;
    }
    .rs-products .rs-products__remove:hover { color: #e74c3c }

    .rs-actions { display: flex; gap: 10px; margin-top: 24px; position: sticky; bottom: 0; background: #0f1812; padding: 16px 0 8px; z-index: 2; }
    .rs-actions__btn {
      flex: 1; padding: 14px; border-radius: 2rem;
      font-size: 15px; font-weight: 600; cursor: pointer;
      border: none; transition: all .2s; font-family: inherit;
    }
    .rs-actions__btn:hover { transform: translateY(-1px); }
    .rs-actions__btn:active { transform: scale(0.98); }
    .rs-actions__btn--primary {
      background: #2ecc8a; color: #080d0b;
    }
    .rs-actions__btn--primary:hover { background: #1a9e66; }
    .rs-actions__btn--secondary {
      background: #1a2e1f; color: #9dc4a8;
      border: 1px solid rgba(46,204,138,.2);
    }
    .rs-actions__btn--secondary:hover { border-color: #2ecc8a; color: #2ecc8a; }

    /* ---- step 4: saved ---- */
    .rs-saved { text-align: center; padding: 40px 0 }
    @keyframes rsCheckPop {
      0% { transform: scale(0); opacity:0 }
      60% { transform: scale(1.15) }
      100% { transform: scale(1); opacity:1 }
    }
    .rs-saved__check {
      width: 64px; height: 64px; border-radius: 50%;
      background: rgba(46,204,138,.15);
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 16px;
      animation: rsCheckPop .45s ease forwards;
    }
    .rs-saved__check svg { width: 32px; height: 32px; color: #2ecc8a }
    .rs-saved__title { font-size: 18px; font-weight: 700; color: #2ecc8a; margin: 0 0 8px }
    .rs-saved__text  { font-size: 14px; color: #8aa898; margin: 0 0 24px }
    .rs-saved__link {
      display: block; width: 100%; padding: 14px 24px;
      background: #2ecc8a; border: none;
      border-radius: 2rem; color: #080d0b; font-size: 15px; font-weight: 700;
      cursor: pointer; text-decoration: none;
      transition: all .2s; font-family: inherit; margin-top: 8px;
    }
    .rs-saved__link:hover { background: #1a9e66; transform: translateY(-1px); }
    .rs-saved__close {
      display: block; width: 100%; padding: 12px 24px;
      background: transparent; border: 1px solid rgba(157,177,168,0.3);
      border-radius: 2rem; color: #9dc4a8; font-size: 14px; font-weight: 500;
      cursor: pointer; transition: all .2s; font-family: inherit; margin-top: 8px;
    }
    .rs-saved__close:hover { border-color: #2ecc8a; color: #2ecc8a; }

    /* mobile */
    @media (max-width: 520px) {
      .rs-card { border-radius: 16px; max-height: 96vh }
      .rs-body { padding: 16px }
      .rs-header { padding: 16px 16px 10px }
      .rs-progress { padding: 10px 16px 0 }
    }
  `;
  document.head.appendChild(style);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */
function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/*  State                                                             */
/* ------------------------------------------------------------------ */
let overlay = null;
let currentStep = 1; // 1-upload  2-processing  3-review  4-saved
let selectedFile = null;
let previewUrl = "";
let ocrData = { storeName: "", totalAmount: "", products: [], rawText: "" };
let formData = {
  storeName: "",
  totalAmount: "",
  date: todayISO(),
  category: "food",
  products: [],
  note: "",
};

/* ------------------------------------------------------------------ */
/*  Render                                                            */
/* ------------------------------------------------------------------ */
function progressHTML(step) {
  return `<div class="rs-progress">${[1, 2, 3, 4]
    .map(
      (n) =>
        `<div class="rs-progress__dot${
          n === step
            ? " rs-progress__dot--active"
            : n < step
            ? " rs-progress__dot--done"
            : ""
        }"></div>`
    )
    .join("")}</div>`;
}

function stepLabels() {
  return ["Upload", "Processing", "Review", "Saved"];
}

function renderUploadStep() {
  const hasPreview = !!previewUrl;
  return `
    <div class="rs-upload" data-rs-dropzone>
      <input class="rs-upload__input" type="file" accept="image/jpeg,image/png,image/heic" data-rs-file>
      <div class="rs-upload__icon">&#128464;</div>
      <p class="rs-upload__text">Drag & drop a receipt image or click to select</p>
    </div>

    <label class="rs-camera-btn">
      &#128247; Take Photo
      <input type="file" accept="image/jpeg,image/png,image/heic" capture="environment" data-rs-camera>
    </label>

    ${
      hasPreview
        ? `<div class="rs-preview"><img src="${esc(previewUrl)}" alt="Receipt preview"></div>`
        : ""
    }

    <button class="rs-scan-btn" data-rs-scan ${hasPreview ? "" : "disabled"}>
      Scan Receipt
    </button>
  `;
}

function renderProcessingStep() {
  return `
    <div class="rs-processing">
      <div class="rs-spinner"></div>
      <p class="rs-processing__text">Analyzing receipt...</p>
    </div>
  `;
}

function renderReviewStep() {
  const categoryOptions = CATEGORIES.map(
    (c) =>
      `<option value="${esc(c.value)}" ${
        formData.category === c.value ? "selected" : ""
      }>${esc(c.label)}</option>`
  ).join("");

  const productsRows = formData.products
    .map(
      (p, i) => `
    <tr>
      <td><input type="text" value="${esc(p.name)}" data-rs-product-name="${i}"></td>
      <td style="width:90px"><input type="number" step="0.01" value="${esc(
        String(p.price)
      )}" data-rs-product-price="${i}"></td>
      <td style="width:36px"><button class="rs-products__remove" data-rs-product-remove="${i}">&times;</button></td>
    </tr>`
    )
    .join("");

  return `
    <div class="rs-field">
      <label class="rs-field__label">Store name</label>
      <input class="rs-field__input" type="text" value="${esc(
        formData.storeName
      )}" data-rs-store>
    </div>

    <div class="rs-field">
      <label class="rs-field__label">Total amount</label>
      <input class="rs-field__input" type="number" step="0.01" min="0" value="${esc(
        formData.totalAmount
      )}" data-rs-total>
    </div>

    <div class="rs-field">
      <label class="rs-field__label">Date</label>
      <input class="rs-field__input" type="date" value="${esc(
        formData.date
      )}" data-rs-date>
    </div>

    <div class="rs-field">
      <label class="rs-field__label">Category</label>
      <select class="rs-field__select" data-rs-category>${categoryOptions}</select>
    </div>

    ${
      formData.products.length
        ? `
    <div class="rs-field">
      <label class="rs-field__label">Products</label>
      <table class="rs-products">
        <thead><tr><th>Item</th><th>Price</th><th></th></tr></thead>
        <tbody>${productsRows}</tbody>
      </table>
    </div>`
        : ""
    }

    <div class="rs-field">
      <label class="rs-field__label">Note</label>
      <textarea class="rs-field__textarea" rows="2" data-rs-note>${esc(
        formData.note
      )}</textarea>
    </div>

    <div class="rs-actions">
      <button class="rs-actions__btn rs-actions__btn--secondary" data-rs-rescan>Scan Again</button>
      <button class="rs-actions__btn rs-actions__btn--primary" data-rs-save>Save as Transaction</button>
    </div>
  `;
}

function renderSavedStep() {
  const amount = parseFloat(formData.totalAmount) || 0;
  const store = formData.storeName || "";
  const cat = formData.category || "";

  return `
    <div class="rs-saved">
      <div class="rs-saved__check">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <p class="rs-saved__title">Receipt saved!</p>
      <div style="background:rgba(46,204,138,0.08);border:1px solid rgba(46,204,138,0.15);border-radius:10px;padding:12px 16px;margin:12px 0;text-align:left;font-size:13px;color:#9dc4a8">
        ${store ? `<div><strong style="color:#f2f8f4">Store:</strong> ${store}</div>` : ""}
        <div><strong style="color:#f2f8f4">Amount:</strong> <span style="color:#e7a99a">\u20AC${amount.toFixed(2)}</span></div>
        ${cat ? `<div><strong style="color:#f2f8f4">Category:</strong> ${cat}</div>` : ""}
        <div><strong style="color:#f2f8f4">Date:</strong> ${formData.date || "today"}</div>
      </div>
      <p class="rs-saved__text">Your expense has been recorded in Transactions.</p>
      <button class="rs-saved__link" data-rs-view>View in Transactions \u2192</button>
      <button class="rs-saved__close" data-rs-close-done>Close</button>
    </div>
  `;
}

function renderCard() {
  const stepHTML = [
    renderUploadStep,
    renderProcessingStep,
    renderReviewStep,
    renderSavedStep,
  ][currentStep - 1]();

  return `
    <div class="rs-card" data-rs-card>
      <div class="rs-header">
        <h2 class="rs-header__title">Scan Receipt</h2>
        <button class="rs-header__close" data-rs-close>&times;</button>
      </div>
      ${progressHTML(currentStep)}
      <div class="rs-body">${stepHTML}</div>
    </div>
  `;
}

function render() {
  if (!overlay) return;
  overlay.innerHTML = renderCard();
  bindEvents();
}

/* ------------------------------------------------------------------ */
/*  Events                                                            */
/* ------------------------------------------------------------------ */
function bindEvents() {
  if (!overlay) return;

  // Close
  overlay.addEventListener(
    "click",
    (e) => {
      if (e.target === overlay || e.target.closest("[data-rs-close]")) {
        closeScanner();
      }
    },
    { once: false }
  );

  // Don't close when clicking inside card
  const card = overlay.querySelector("[data-rs-card]");
  if (card) card.addEventListener("click", (e) => e.stopPropagation());

  // Step 1 — file inputs
  const fileInput = overlay.querySelector("[data-rs-file]");
  const cameraInput = overlay.querySelector("[data-rs-camera]");
  const dropzone = overlay.querySelector("[data-rs-dropzone]");

  if (fileInput)
    fileInput.addEventListener("change", (e) => handleFileSelect(e.target.files[0]));
  if (cameraInput)
    cameraInput.addEventListener("change", (e) => handleFileSelect(e.target.files[0]));

  if (dropzone) {
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("is-dragover");
    });
    dropzone.addEventListener("dragleave", () =>
      dropzone.classList.remove("is-dragover")
    );
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("is-dragover");
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFileSelect(file);
    });
  }

  // Step 1 — Scan button
  const scanBtn = overlay.querySelector("[data-rs-scan]");
  if (scanBtn) scanBtn.addEventListener("click", startScan);

  // Step 3 — Scan Again
  const rescanBtn = overlay.querySelector("[data-rs-rescan]");
  if (rescanBtn) rescanBtn.addEventListener("click", resetToUpload);

  // Step 3 — Save
  const saveBtn = overlay.querySelector("[data-rs-save]");
  if (saveBtn) saveBtn.addEventListener("click", saveTransaction);

  // Step 3 — Product remove buttons
  overlay.querySelectorAll("[data-rs-product-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.rsProductRemove, 10);
      formData.products.splice(idx, 1);
      render();
    });
  });

  // Step 4 — View in Transactions
  const viewBtn = overlay.querySelector("[data-rs-view]");
  if (viewBtn) {
    viewBtn.addEventListener("click", () => {
      closeScanner();
      const navBtn = document.querySelector('[data-nav="transactions"]');
      if (navBtn) navBtn.click();
    });
  }

  // Step 4 — Close
  const closeDoneBtn = overlay.querySelector("[data-rs-close-done]");
  if (closeDoneBtn) {
    closeDoneBtn.addEventListener("click", closeScanner);
  }

  // Escape key
  overlay.__keyHandler = (e) => {
    if (e.key === "Escape") closeScanner();
  };
  document.addEventListener("keydown", overlay.__keyHandler);
}

/* ------------------------------------------------------------------ */
/*  File selection                                                    */
/* ------------------------------------------------------------------ */
function handleFileSelect(file) {
  if (!file) return;
  selectedFile = file;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  render();
}

/* ------------------------------------------------------------------ */
/*  OCR pipeline                                                      */
/* ------------------------------------------------------------------ */
async function startScan() {
  if (!selectedFile) return;
  currentStep = 2;
  render();

  const ocr = window.receiptOCR;
  if (!ocr) {
    console.warn("[ReceiptScanner] window.receiptOCR not available");
    ocrData = { storeName: "", totalAmount: "", products: [], rawText: "" };
    populateForm();
    currentStep = 3;
    render();
    return;
  }

  try {
    const image = await ocr.prepareImage(selectedFile);
    const rawText = await ocr.runOCR(image);
    const storeName = ocr.detectStore(rawText) || "";
    const totalAmount = ocr.detectTotal(rawText);
    const products = ocr.extractProducts(rawText) || [];

    ocrData = {
      storeName,
      totalAmount: totalAmount != null ? String(totalAmount) : "",
      products,
      rawText,
    };
  } catch (err) {
    console.warn("[ReceiptScanner] OCR failed:", err);
    ocrData = { storeName: "", totalAmount: "", products: [], rawText: "" };
  }

  populateForm();
  currentStep = 3;
  render();
}

function populateForm() {
  const productsSummary = ocrData.products.map((p) => p.name).join(", ");

  formData = {
    storeName: ocrData.storeName,
    totalAmount: ocrData.totalAmount,
    date: todayISO(),
    category: ocrData.storeName ? "food" : "shopping",
    products: [...ocrData.products],
    note: ocrData.storeName
      ? `${ocrData.storeName}${productsSummary ? " - " + productsSummary : ""}`
      : productsSummary || "",
  };
}

/* ------------------------------------------------------------------ */
/*  Read current form values before saving                            */
/* ------------------------------------------------------------------ */
function readFormValues() {
  if (!overlay) return;

  const storeEl = overlay.querySelector("[data-rs-store]");
  const totalEl = overlay.querySelector("[data-rs-total]");
  const dateEl = overlay.querySelector("[data-rs-date]");
  const catEl = overlay.querySelector("[data-rs-category]");
  const noteEl = overlay.querySelector("[data-rs-note]");

  if (storeEl) formData.storeName = storeEl.value.trim();
  if (totalEl) formData.totalAmount = totalEl.value.trim();
  if (dateEl) formData.date = dateEl.value;
  if (catEl) formData.category = catEl.value;
  if (noteEl) formData.note = noteEl.value.trim();

  // Read edited products
  overlay.querySelectorAll("[data-rs-product-name]").forEach((inp) => {
    const idx = parseInt(inp.dataset.rsProductName, 10);
    if (formData.products[idx]) formData.products[idx].name = inp.value.trim();
  });
  overlay.querySelectorAll("[data-rs-product-price]").forEach((inp) => {
    const idx = parseInt(inp.dataset.rsProductPrice, 10);
    if (formData.products[idx])
      formData.products[idx].price = parseFloat(inp.value) || 0;
  });
}

/* ------------------------------------------------------------------ */
/*  Save transaction                                                  */
/* ------------------------------------------------------------------ */
async function saveTransaction() {
  readFormValues();

  const amount = parseFloat(formData.totalAmount) || 0;
  if (amount <= 0) {
    alert("Please enter a valid total amount.");
    return;
  }

  // Show saving state
  const saveBtn = overlay?.querySelector("[data-rs-save]");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    saveBtn.style.opacity = "0.6";
  }

  const productsSummary = formData.products
    .map((p) => `${p.name} (${p.price.toFixed(2)})`)
    .join(", ");

  const transaction = {
    type: "expense",
    amount,
    category: formData.category,
    note: formData.storeName
      ? `${formData.storeName}${productsSummary ? " - " + productsSummary : ""}`
      : formData.note || productsSummary || "",
    date: formData.date || todayISO(),
    placeId: null,
    meta: { source: "receipt-scan" },
    receipt: {
      products: formData.products,
      rawText: ocrData.rawText,
      storeName: formData.storeName,
      totalAmount: amount,
    },
  };

  try {
    // Electron API path
    if (window.electronAPI?.createTransaction) {
      await window.electronAPI.createTransaction(transaction);
    } else {
      // Web / HTTP path
      const token = localStorage.getItem("besafe_token") || "";
      const res = await fetch(`${API_URL}/api/transactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(transaction),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }
    }

    currentStep = 4;
    render();
  } catch (err) {
    console.error("[ReceiptScanner] Save failed:", err);
    alert("Could not save the transaction: " + err.message);
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save as Transaction";
      saveBtn.style.opacity = "1";
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Navigation helpers                                                */
/* ------------------------------------------------------------------ */
function resetToUpload() {
  selectedFile = null;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = "";
  ocrData = { storeName: "", totalAmount: "", products: [], rawText: "" };
  formData = {
    storeName: "",
    totalAmount: "",
    date: todayISO(),
    category: "food",
    products: [],
    note: "",
  };
  currentStep = 1;
  render();
}

function closeScanner() {
  if (!overlay) return;
  if (overlay.__keyHandler) {
    document.removeEventListener("keydown", overlay.__keyHandler);
  }
  overlay.remove();
  overlay = null;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = "";
  selectedFile = null;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */
export function openReceiptScanner() {
  injectCSS();

  // Reset state
  currentStep = 1;
  selectedFile = null;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = "";
  ocrData = { storeName: "", totalAmount: "", products: [], rawText: "" };
  formData = {
    storeName: "",
    totalAmount: "",
    date: todayISO(),
    category: "food",
    products: [],
    note: "",
  };

  // Remove existing overlay if any
  const existing = document.querySelector(".rs-overlay");
  if (existing) existing.remove();

  overlay = document.createElement("div");
  overlay.className = "rs-overlay";
  document.body.appendChild(overlay);

  render();
}
