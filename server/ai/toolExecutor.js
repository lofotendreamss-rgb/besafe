// ============================================================
// toolExecutor — server-side Claude tool vykdytojas
// ============================================================
//
// Šis modulis vykdo Claude tool'us tarp agent loop iteracijų
// chatHandler.js'e. Phase 3 step 3/6 buvo sukurtas su trimis
// SKAITYMO tools (queryTransactions, getBalance, getCategorySpending)
// kurie užklausė Supabase.transactions lentelę. Step 4/5 (2026-04-29)
// pašalino tuos handler'ius — BeSafe yra local-first finansiniams
// duomenims (memory: local_first_finance_data), Supabase'oje
// transactions lentelės nėra, ir read tools buvo dead code, kuris
// grąžindavo `supabase_error` praktikoje.
//
// Šiuo metu modulyje LIEKA tik executeTool() shell'as su:
//   • schema validacija (getToolByName) — atmeta unknown tool'us
//   • write-blocking guard (requiresConfirmation === true) — write
//     tools (addTransaction) eina per frontend confirmation flow ir
//     mutuoja localStorage tiesiogiai per js/services/data/local.db.js,
//     ne per šitą modulį
//   • license + supabase argumentų sanity check'ai
//   • catch-all exception handler — kontrakas: niekada nemeta
//
// Switch teturi tik default case'ą (unknown_tool) — kai bus pridėtas
// pirmas SERVERINIS tool handler'is (jei iš viso prireiks), case
// pridedamas čia.
//
// ============================================================
// KOKYBĖS PRINCIPAS (kūrėjas patvirtino 2026-04-28)
// ============================================================
//
//   "Geriau dabar užtrukti ilgiau, nei paskui turėti nesusipratimą su
//    voice asistentu visą laiką."
//
//   • VISI error path'ai grąžina `{ success: false, error: { code, message } }`
//     su stabiliu `.code`. Niekur "tylaus failo".
//
//   • executeTool() NIEKADA nemes exception'o — viską pagauna outer try/catch.
//
//   • Schema validacija per `getToolByName()` PRIEŠ bet kokį dispatch'ą.
//     Hallucinuotas tool name → `unknown_tool` kodas, jokio DB hit'o.
//
// ============================================================
// SAUGUMO POZA
// ============================================================
//
//   • Future read handler'iai (jei pridės) PRIVALĖTŲ filtruoti
//     `.eq('license_id', license.id)` kiekvienoje Supabase užklausoje —
//     defense-in-depth virš RLS.
//
//   • Rašymo tools'ai atmetami su `write_not_supported` kodu PRIEŠ
//     dispatch'ą. Confirmation flow (Phase 3 step 4/5) atsako už
//     write veiksmus per client-side localStorage.
//
//   • Schema validavimas dvigubas — Anthropic API jau validuoja prieš
//     grąžindama tool_use, bet getToolByName() yra defensive in-depth.
//
// ============================================================
// GLOBALUMO PRINCIPAS
// ============================================================
//
// Tool result'ai grąžinami kaip neutralūs duomenys (JSON su angliškais
// raktais). Claude per agent loop sintezuos atsakymą vartotojo kalba.
// Žmogui-friendly format'avimas (€ ženklai, lokalūs skaičių separatoriai)
// — Claude'o atsakomybė.
// ============================================================

import { getToolByName } from "./tools.js";

// ============================================================
// PUBLIC API — executeTool
//
// Phase 3 step 4/5 (2026-04-29): three read-tool handlers removed
// (queryTransactionsHandler, getBalanceHandler,
// getCategorySpendingHandler) plus the helpers that were used only
// by them (todayIso, resolvePeriod, round2). They queried
// Supabase.transactions, which doesn't exist — BeSafe is local-first
// for finance data (memory: local_first_finance_data). Read tools
// were removed from tools.js in the same commit; this file's switch
// statement no longer needs the cases.
//
// What stays: the executeTool() shell with its schema validation +
// write-blocking guards. Future write-tool handlers (e.g.
// addTransactionHandler in step 5/6 — though that flow is currently
// designed to stay client-side via local.db.js, so even that is
// uncertain) will be added back here with their own switch cases.
// ============================================================

/**
 * Vykdo tool'ą ir grąžina rezultatą Claude'ui.
 *
 * Kontraktas — NIEKADA nemeta exception'o. Visada grąžina:
 *
 *   { success: true,  result: <object> }            — sėkmė
 *   { success: false, error: { code, message } }    — bet kokia klaida
 *
 * Klaidos kodai:
 *   - "unknown_tool"        — tool'as neegzistuoja schema'oje arba
 *                             schema yra, bet handler'is nepridėtas
 *   - "write_not_supported" — tool'as yra rašymo (confirmation flow
 *                             vykdo client'e per local.db.js, ne čia)
 *   - "execution_failed"    — neužkluptas exception arba neteisingas
 *                             license/supabase argumentas
 *
 * Phase 3 step 4/5 (2026-04-29): "supabase_error" code retired —
 * read tool handlers removed (their Supabase queries were the only
 * source of that code). If a future read tool needs DB access, it
 * will reintroduce supabase_error in its own handler.
 *
 * @param {object} params
 * @param {string} params.toolName — pvz. "addTransaction"
 * @param {object} params.toolInput — argumentai pagal schemą
 * @param {object} params.license — { id, license_key, ... } iš authLicense
 * @param {object} params.supabase — Supabase client
 * @returns {Promise<{success: boolean, result?: object, error?: {code: string, message: string}}>}
 */
export async function executeTool({ toolName, toolInput, license, supabase }) {
  try {
    // Schema validacija — defensive in-depth net jei Anthropic
    // pažadėjo grąžinti tik žinomus tools'us.
    const schemaEntry = getToolByName(toolName);
    if (!schemaEntry) {
      return {
        success: false,
        error: {
          code: "unknown_tool",
          message: `Tool '${toolName}' is not defined in tools.js`,
        },
      };
    }

    // Rašymo tools eina kitu keliu (žingsnis 5/6 atskiras endpoint'as
    // su confirmation flow). Vykdytojas šio žingsnio scope'e tik
    // skaitymo veiksmus.
    if (schemaEntry.requiresConfirmation === true) {
      return {
        success: false,
        error: {
          code: "write_not_supported",
          message: `Tool '${toolName}' requires user confirmation — use confirmation flow (Phase 3 step 4/6)`,
        },
      };
    }

    // Saugumo invariants pre-check'ai — license būtinas, kitaip negalim
    // saugiai filtruoti pagal license_id. Tai server-side bug, ne
    // user-facing problema, todėl skirtingas kodas.
    if (!license || !license.id) {
      return {
        success: false,
        error: {
          code: "execution_failed",
          message: "license.id is required for tool execution",
        },
      };
    }
    if (!supabase || typeof supabase.from !== "function") {
      return {
        success: false,
        error: {
          code: "execution_failed",
          message: "supabase client is required for tool execution",
        },
      };
    }

    // Phase 3 step 4/5: no read handlers remain. If a tool reached
    // here, the schema declared it as a read tool (requiresConfirmation
    // false) but no handler is wired. Treat as unknown so Claude
    // gracefully reports the failure to the user instead of looping.
    // Future write/read handlers will add a `switch (toolName)` block
    // above this default and route the matching cases.
    return {
      success: false,
      error: {
        code: "unknown_tool",
        message: `Tool '${toolName}' has no executor handler (schema exists but handler missing)`,
      },
    };
  } catch (err) {
    // Catch-all — kontrakas reikalauja, kad executeTool niekada
    // nemestų. Bet kokia neapgalvota exception virsta į
    // execution_failed klaidą su orig pranešimu.
    return {
      success: false,
      error: {
        code: "execution_failed",
        message: err?.message || String(err),
      },
    };
  }
}
