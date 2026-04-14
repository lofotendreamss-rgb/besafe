import { registry } from "./service.registry.js";
import { ApiService } from "../services/data/api.service.js";
import { TransactionService } from "../services/finance/transaction.service.js";
import { FinancialEngine } from "../services/finance/financialEngine.js";
import { createAIAdvisor } from "../services/ai/besafe.advisor.js";

let booted = false;

function getRegistrySnapshot() {
  try {
    if (typeof registry.debugSnapshot === "function") {
      return registry.debugSnapshot();
    }

    if (typeof registry.list === "function") {
      return registry.list();
    }
  } catch (error) {
    console.warn("[Boot] Could not create registry snapshot:", error);
  }

  return [];
}

export async function bootSystem() {
  if (booted) {
    return registry;
  }

  console.log("[Boot] Starting BeSafe system boot...");

  try {
    if (typeof registry.clear === "function") {
      registry.clear();
    }

    const isLocal = typeof window !== "undefined" &&
      (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost");
    const apiBase = isLocal ? "http://127.0.0.1:3001" : "https://besafe-oga3.onrender.com";

    const api = new ApiService({
      baseUrl: apiBase,
      timeoutMs: 8000,
    });

    const transactionService = new TransactionService({
      apiService: api,
    });

    const financialEngine = new FinancialEngine({
      transactionService,
    });

    const aiAdvisor = createAIAdvisor({
      transactionService,
      financialEngine,
      apiService: api,
      registry,
    });

    registry.register("api", api);
    registry.register("transactions", transactionService);
    registry.register("finance", financialEngine);
    registry.register("ai", aiAdvisor);
    registry.register("advisor", aiAdvisor);
    registry.register("eventBus", null);

    booted = true;

    console.log("[Boot] BeSafe system ready", {
      apiBaseUrl: "http://127.0.0.1:3001",
      services: getRegistrySnapshot(),
    });

    return registry;
  } catch (error) {
    booted = false;

    if (typeof registry.clear === "function") {
      registry.clear();
    }

    console.error("[Boot] BeSafe system boot failed:", error);
    throw error;
  }
}