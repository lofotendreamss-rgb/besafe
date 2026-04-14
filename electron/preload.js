const { contextBridge, ipcRenderer, shell } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Transactions
  getTransactions: () => ipcRenderer.invoke("db:getTransactions"),
  getTransactionById: (id) => ipcRenderer.invoke("db:getTransactionById", id),
  createTransaction: (payload) => ipcRenderer.invoke("db:createTransaction", payload),
  updateTransaction: (id, payload) => ipcRenderer.invoke("db:updateTransaction", id, payload),
  patchTransaction: (id, payload) => ipcRenderer.invoke("db:patchTransaction", id, payload),
  deleteTransaction: (id) => ipcRenderer.invoke("db:deleteTransaction", id),
  exportTransactions: () => ipcRenderer.invoke("db:exportTransactions"),

  // Categories
  getCategories: () => ipcRenderer.invoke("db:getCategories"),
  getCategoryById: (id) => ipcRenderer.invoke("db:getCategoryById", id),
  createCategory: (payload) => ipcRenderer.invoke("db:createCategory", payload),
  updateCategory: (id, payload) => ipcRenderer.invoke("db:updateCategory", id, payload),
  patchCategory: (id, payload) => ipcRenderer.invoke("db:patchCategory", id, payload),
  deleteCategory: (id) => ipcRenderer.invoke("db:deleteCategory", id),

  // Places
  getPlaces: () => ipcRenderer.invoke("db:getPlaces"),
  getPlaceById: (id) => ipcRenderer.invoke("db:getPlaceById", id),
  createPlace: (payload) => ipcRenderer.invoke("db:createPlace", payload),
  updatePlace: (id, payload) => ipcRenderer.invoke("db:updatePlace", id, payload),
  patchPlace: (id, payload) => ipcRenderer.invoke("db:patchPlace", id, payload),
  deletePlace: (id) => ipcRenderer.invoke("db:deletePlace", id),

  // Saved Calculations
  getSavedCalculations: () => ipcRenderer.invoke("db:getSavedCalculations"),
  createSavedCalculation: (payload) => ipcRenderer.invoke("db:createSavedCalculation", payload),
  deleteSavedCalculation: (id) => ipcRenderer.invoke("db:deleteSavedCalculation", id),

  // Summary & Health
  getSummary: () => ipcRenderer.invoke("db:getSummary"),
  health: () => ipcRenderer.invoke("db:health"),

  // Export
  exportDocument: (options) => ipcRenderer.invoke("db:exportDocument", options),

  // License activation from besafe:// protocol
  onLicenseActivate: (callback) => {
    ipcRenderer.on("license:activate", (_event, key) => callback(key));
  },

  // License verified — open main app
  licenseActivated: (key) => {
    ipcRenderer.send("license:verified", key);
  },

  // Open external URL
  openExternal: (url) => {
    ipcRenderer.send("open-external", url);
  },
});
