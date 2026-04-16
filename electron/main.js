const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs/promises");

// ---------------------------------------------------------------------------
// besafe:// protocol handler
// ---------------------------------------------------------------------------

// Store pending license key from protocol URL
let pendingLicenseKey = null;

// Register besafe:// protocol (Windows)
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("besafe", process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient("besafe");
}

// Parse besafe:// URL and extract license key
function parseBesafeUrl(url) {
  try {
    if (!url || !url.startsWith("besafe://")) return null;
    const parsed = new URL(url);
    if (parsed.pathname === "activate" || parsed.pathname === "//activate") {
      return parsed.searchParams.get("key") || null;
    }
    // Handle besafe://activate?key=... format
    const keyMatch = url.match(/[?&]key=([A-Z0-9-]+)/i);
    return keyMatch ? keyMatch[1] : null;
  } catch {
    return null;
  }
}

// Windows: second instance receives the protocol URL
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    // Find besafe:// URL in command line args
    const protocolUrl = commandLine.find((arg) => arg.startsWith("besafe://"));
    const key = parseBesafeUrl(protocolUrl);

    if (key) {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
        // Send key to renderer
        win.webContents.send("license:activate", key);
      }
    }
  });
}

// Check if app was opened via besafe:// URL (first launch)
function checkProtocolArgs() {
  const protocolUrl = process.argv.find((arg) => arg.startsWith("besafe://"));
  const key = parseBesafeUrl(protocolUrl);
  if (key) {
    pendingLicenseKey = key;
  }
}

// ---------------------------------------------------------------------------
// Database path — dev: server/db/db.json, production: extraResources/db.json
// ---------------------------------------------------------------------------
const isDev = !app.isPackaged;
const DB_FILE = isDev
  ? path.join(__dirname, "..", "server", "db", "db.json")
  : path.join(process.resourcesPath, "db.json");

// ---------------------------------------------------------------------------
// Low-level DB helpers (mirrors server/db/db.service.js)
// ---------------------------------------------------------------------------

function createId(prefix = "") {
  const base = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return prefix ? `${prefix}_${base}` : base;
}

function normalizeId(value, prefix = "") {
  const normalized = String(value ?? "").trim();
  return normalized || createId(prefix);
}

function nowIso() {
  return new Date().toISOString();
}

async function readDb() {
  try {
    const raw = await fs.readFile(DB_FILE, "utf-8");
    const data = JSON.parse(raw);

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return createEmptyDb();
    }

    return {
      ...createEmptyDb(),
      ...data,
    };
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) {
      return createEmptyDb();
    }
    throw error;
  }
}

async function writeDb(data) {
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function createEmptyDb() {
  return {
    places: [],
    categories: [],
    transactions: [],
    savedCalculations: [],
  };
}

// ---------------------------------------------------------------------------
// Collection helpers
// ---------------------------------------------------------------------------

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function findById(items, id) {
  const safeId = String(id ?? "").trim();
  if (!safeId) return null;
  return items.find((item) => String(item.id ?? "").trim() === safeId) || null;
}

function roundAmount(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

async function getTransactions() {
  const data = await readDb();
  return safeArray(data.transactions);
}

async function getTransactionById(_event, id) {
  const transactions = await getTransactions();
  const found = findById(transactions, id);
  if (!found) throw new Error("Transaction not found.");
  return found;
}

async function createTransaction(_event, payload) {
  const data = await readDb();
  const transaction = {
    ...payload,
    id: normalizeId(payload?.id, "tx"),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  data.transactions = [...safeArray(data.transactions), transaction];
  await writeDb(data);
  return transaction;
}

async function updateTransaction(_event, id, payload) {
  const safeId = String(id ?? "").trim();
  const data = await readDb();
  let found = null;

  data.transactions = safeArray(data.transactions).map((tx) => {
    if (String(tx.id ?? "").trim() === safeId) {
      found = { ...tx, ...payload, id: safeId, updatedAt: nowIso() };
      return found;
    }
    return tx;
  });

  if (!found) throw new Error("Transaction not found.");
  await writeDb(data);
  return found;
}

async function patchTransaction(_event, id, payload) {
  return updateTransaction(null, id, payload);
}

async function deleteTransaction(_event, id) {
  const safeId = String(id ?? "").trim();
  const data = await readDb();
  const transactions = safeArray(data.transactions);
  const existing = findById(transactions, safeId);

  if (!existing) throw new Error("Transaction not found.");

  data.transactions = transactions.filter(
    (tx) => String(tx.id ?? "").trim() !== safeId
  );

  await writeDb(data);
  return existing;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

async function getCategories() {
  const data = await readDb();
  return safeArray(data.categories);
}

async function getCategoryById(_event, id) {
  const categories = await getCategories();
  const found = findById(categories, id);
  if (!found) throw new Error("Category not found.");
  return found;
}

async function createCategory(_event, payload) {
  const data = await readDb();
  const category = {
    ...payload,
    id: normalizeId(payload?.id, "cat"),
    normalizedName: String(payload?.name ?? "").trim().toLowerCase(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  data.categories = [...safeArray(data.categories), category];
  await writeDb(data);
  return category;
}

async function updateCategory(_event, id, payload) {
  const safeId = String(id ?? "").trim();
  const data = await readDb();
  let found = null;

  data.categories = safeArray(data.categories).map((cat) => {
    if (String(cat.id ?? "").trim() === safeId) {
      found = {
        ...cat,
        ...payload,
        id: safeId,
        normalizedName: String(payload?.name ?? cat.name ?? "")
          .trim()
          .toLowerCase(),
        updatedAt: nowIso(),
      };
      return found;
    }
    return cat;
  });

  if (!found) throw new Error("Category not found.");
  await writeDb(data);
  return found;
}

async function patchCategory(_event, id, payload) {
  return updateCategory(null, id, payload);
}

async function deleteCategory(_event, id) {
  const safeId = String(id ?? "").trim();
  const data = await readDb();
  const categories = safeArray(data.categories);
  const existing = findById(categories, safeId);

  if (!existing) throw new Error("Category not found.");

  data.categories = categories.filter(
    (cat) => String(cat.id ?? "").trim() !== safeId
  );

  await writeDb(data);
  return existing;
}

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------

async function getPlaces() {
  const data = await readDb();
  return safeArray(data.places);
}

async function getPlaceById(_event, id) {
  const places = await getPlaces();
  const found = findById(places, id);
  if (!found) throw new Error("Place not found.");
  return found;
}

async function createPlace(_event, payload) {
  const data = await readDb();
  const place = {
    ...payload,
    id: normalizeId(payload?.id, "place"),
    normalizedName: String(payload?.name ?? "").trim().toLowerCase(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  data.places = [...safeArray(data.places), place];
  await writeDb(data);
  return place;
}

async function updatePlace(_event, id, payload) {
  const safeId = String(id ?? "").trim();
  const data = await readDb();
  let found = null;

  data.places = safeArray(data.places).map((place) => {
    if (String(place.id ?? "").trim() === safeId) {
      found = {
        ...place,
        ...payload,
        id: safeId,
        normalizedName: String(payload?.name ?? place.name ?? "")
          .trim()
          .toLowerCase(),
        updatedAt: nowIso(),
      };
      return found;
    }
    return place;
  });

  if (!found) throw new Error("Place not found.");
  await writeDb(data);
  return found;
}

async function patchPlace(_event, id, payload) {
  return updatePlace(null, id, payload);
}

async function deletePlace(_event, id) {
  const safeId = String(id ?? "").trim();
  const data = await readDb();
  const places = safeArray(data.places);
  const existing = findById(places, safeId);

  if (!existing) throw new Error("Place not found.");

  data.places = places.filter(
    (place) => String(place.id ?? "").trim() !== safeId
  );

  await writeDb(data);
  return existing;
}

// ---------------------------------------------------------------------------
// Saved Calculations
// ---------------------------------------------------------------------------

async function getSavedCalculations() {
  const data = await readDb();
  return safeArray(data.savedCalculations);
}

async function createSavedCalculation(_event, payload) {
  const data = await readDb();
  const calculation = {
    ...payload,
    id: normalizeId(payload?.id, "calc"),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  data.savedCalculations = [
    ...safeArray(data.savedCalculations),
    calculation,
  ];

  await writeDb(data);
  return calculation;
}

async function deleteSavedCalculation(_event, id) {
  const safeId = String(id ?? "").trim();
  const data = await readDb();
  const items = safeArray(data.savedCalculations);
  const existing = findById(items, safeId);

  if (!existing) throw new Error("Saved calculation not found.");

  data.savedCalculations = items.filter(
    (calc) => String(calc.id ?? "").trim() !== safeId
  );

  await writeDb(data);
  return existing;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

async function getSummary() {
  const transactions = await getTransactions();

  const income = transactions
    .filter((tx) => tx.type === "income")
    .reduce((sum, tx) => sum + roundAmount(tx.amount), 0);

  const expenses = transactions
    .filter((tx) => tx.type === "expense")
    .reduce((sum, tx) => sum + roundAmount(tx.amount), 0);

  const expenseCategoryMap = {};
  for (const tx of transactions) {
    if (tx.type !== "expense") continue;
    const cat = String(tx.category || "other").toLowerCase();
    expenseCategoryMap[cat] = (expenseCategoryMap[cat] || 0) + roundAmount(tx.amount);
  }

  const expenseCategories = Object.entries(expenseCategoryMap)
    .map(([category, amount]) => ({ category, amount: roundAmount(amount) }))
    .sort((a, b) => b.amount - a.amount);

  const recentTransactions = [...transactions]
    .sort((a, b) => {
      const dateA = new Date(a.financialDate || a.date || a.createdAt || 0);
      const dateB = new Date(b.financialDate || b.date || b.createdAt || 0);
      return dateB - dateA;
    })
    .slice(0, 5);

  return {
    income: roundAmount(income),
    expenses: roundAmount(expenses),
    balance: roundAmount(income - expenses),
    count: transactions.length,
    expenseCategories,
    topExpenseCategory: expenseCategories.length > 0 ? expenseCategories[0].category : null,
    recentTransactions,
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

async function exportTransactions() {
  const transactions = await getTransactions();
  return {
    filename: "besafe-transactions-export.json",
    type: "application/json",
    content: JSON.stringify(
      {
        exportedAt: nowIso(),
        count: transactions.length,
        transactions,
      },
      null,
      2
    ),
  };
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

function health() {
  return {
    ok: true,
    service: "BeSafe Electron",
    timestamp: nowIso(),
  };
}

// ---------------------------------------------------------------------------
// Export document to file via save dialog
// ---------------------------------------------------------------------------

async function exportDocument(_event, { filename, content, type }) {
  const win = BrowserWindow.getFocusedWindow();
  const ext = type === "csv" ? "csv" : "txt";
  const filterName = type === "csv" ? "CSV" : "Tekstinis failas";

  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: "Eksportuoti dokumentą",
    defaultPath: path.join(app.getPath("documents"), filename || `besafe-ataskaita.${ext}`),
    filters: [
      { name: filterName, extensions: [ext] },
      { name: "Visi failai", extensions: ["*"] },
    ],
  });

  if (canceled || !filePath) {
    return { saved: false };
  }

  await fs.writeFile(filePath, content, "utf-8");
  return { saved: true, filePath };
}

// ---------------------------------------------------------------------------
// Register all IPC handlers
// ---------------------------------------------------------------------------

function registerIpcHandlers() {
  // Transactions
  ipcMain.handle("db:getTransactions", async () => getTransactions());
  ipcMain.handle("db:getTransactionById", getTransactionById);
  ipcMain.handle("db:createTransaction", createTransaction);
  ipcMain.handle("db:updateTransaction", updateTransaction);
  ipcMain.handle("db:patchTransaction", patchTransaction);
  ipcMain.handle("db:deleteTransaction", deleteTransaction);
  ipcMain.handle("db:exportTransactions", async () => exportTransactions());

  // Categories
  ipcMain.handle("db:getCategories", async () => getCategories());
  ipcMain.handle("db:getCategoryById", getCategoryById);
  ipcMain.handle("db:createCategory", createCategory);
  ipcMain.handle("db:updateCategory", updateCategory);
  ipcMain.handle("db:patchCategory", patchCategory);
  ipcMain.handle("db:deleteCategory", deleteCategory);

  // Places
  ipcMain.handle("db:getPlaces", async () => getPlaces());
  ipcMain.handle("db:getPlaceById", getPlaceById);
  ipcMain.handle("db:createPlace", createPlace);
  ipcMain.handle("db:updatePlace", updatePlace);
  ipcMain.handle("db:patchPlace", patchPlace);
  ipcMain.handle("db:deletePlace", deletePlace);

  // Saved Calculations
  ipcMain.handle("db:getSavedCalculations", async () => getSavedCalculations());
  ipcMain.handle("db:createSavedCalculation", createSavedCalculation);
  ipcMain.handle("db:deleteSavedCalculation", deleteSavedCalculation);

  // Summary & Health
  ipcMain.handle("db:getSummary", async () => getSummary());
  ipcMain.handle("db:health", async () => health());

  // Export
  ipcMain.handle("db:exportDocument", exportDocument);

  // Open external URL
  ipcMain.on("open-external", (_event, url) => {
    if (url && typeof url === "string" && (url.startsWith("https://") || url.startsWith("http://"))) {
      shell.openExternal(url);
    }
  });
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

let mainWindow = null;

function createLicenseWindow() {
  const win = new BrowserWindow({
    width: 480,
    height: 580,
    title: "BeSafe — Activate",
    resizable: false,
    frame: false,
    transparent: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "license.html"));

  // Send pending license key from protocol
  win.webContents.on("did-finish-load", () => {
    if (pendingLicenseKey) {
      win.webContents.send("license:activate", pendingLicenseKey);
      pendingLicenseKey = null;
    }
  });

  return win;
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "BeSafe",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "..", "index.html"));
  mainWindow = win;
  return win;
}

function createWindow() {
  // For now, skip license check and go straight to main app
  // License is checked by license.checker.js inside the app
  createMainWindow();
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  checkProtocolArgs();
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // macOS: open-url event
  app.on("open-url", (_event, url) => {
    const key = parseBesafeUrl(url);
    if (key) {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        win.webContents.send("license:activate", key);
      } else {
        pendingLicenseKey = key;
      }
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
