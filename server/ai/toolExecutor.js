// ============================================================
// toolExecutor — server-side Claude tool vykdytojas
// ============================================================
//
// Phase 3 žingsnis 3/6. Šis modulis vykdo SKAITYMO tools'us tiesiogiai
// prieš Supabase: queryTransactions, getBalance, getCategorySpending.
// Rašymo tools (addTransaction, kt.) per čia NE praeina — jie keliauja
// į frontend confirmation flow (žingsnis 4/6) ir grįžta vykdymui per
// atskirą endpoint'ą (žingsnis 5/6).
//
// Architektūrinis vaidmuo: agent loop in `chatHandler.js` kviečia šitą
// modulį tarp Claude'o iteracijų. Claude grąžina tool_use → server'is
// kviečia executeTool → rezultatas grąžinamas Claude'ui kaip tool_result
// → Claude sintezuoja galutinį atsakymą vartotojo kalba.
//
// ============================================================
// KOKYBĖS PRINCIPAS (kūrėjas patvirtino 2026-04-28)
// ============================================================
//
//   "Geriau dabar užtrukti ilgiau, nei paskui turėti nesusipratimą su
//    voice asistentu visą laiką."
//
// Praktiškai šiame modulyje:
//
//   • VISI error path'ai grąžina `{ success: false, error: { code, message } }`
//     su stabiliu `.code`. Niekur "tylaus failo" — kviečiantysis (chatHandler
//     agent loop) gali gražiai surfacinti error'ą Claude'ui kaip
//     `tool_result` su `is_error: true`, ir Claude paaiškins vartotojui.
//
//   • executeTool() NIEKADA nemes exception'o — viską pagauna outer try/catch.
//     Kontrakas: kviečiantysis gali daryti `await executeTool(...)` be
//     try/catch'o, ir gauti normalų result objektą.
//
//   • Schema validacija per `getToolByName()` PRIEŠ DB užklausą. Jei
//     Claude haliucinuoja tool'ą, kurio neturim — exit'inam su
//     `unknown_tool` kodu, neliesdami DB.
//
// ============================================================
// SAUGUMO POZA
// ============================================================
//
//   • KIEKVIENA Supabase užklausa filtruojama `.eq('license_id', license.id)`.
//     Tai apsauga nuo cross-tenant data leak'o — net jei Claude pasakytų
//     "parodyk visas transakcijas", server'is rodys TIK to vartotojo.
//
//   • RLS policies Supabase'e turėtų būti dvigubas saugiklis, bet šis
//     modulis nepasikliauja vien tik RLS — explicit filter užklausoje
//     yra pirminis saugumo sluoksnis.
//
//   • Rašymo tools'ai (`requiresConfirmation: true`) atmetami su
//     `write_not_supported` kodu PRIEŠ patekdami į handler'į. Žingsnyje
//     5/6 atskiras endpoint vykdys patvirtintus rašymo veiksmus.
//
//   • Schema validavimas dvigubas — Anthropic API jau validuoja prieš
//     grąžindama tool_use, bet getToolByName() yra defensive in-depth.
//
// ============================================================
// GLOBALUMO PRINCIPAS
// ============================================================
//
// Tool result'ai grąžinami kaip neutralūs duomenys (JSON su angliškais
// raktais + skaitinėmis reikšmėmis + datomis). Kategorijų vardai ateina
// iš vartotojo įvesties (gali būti bet kuria kalba — "Maistas", "Food",
// ir t.t.). Claude per agent loop sintezuos atsakymą vartotojo kalba.
// Žmogui-friendly format'avimas (€ ženklai, lokalūs skaičių separatoriai)
// — Claude'o atsakomybė, ne mūsų.
// ============================================================

import { getToolByName } from "./tools.js";

// ============================================================
// Date helpers — bendros datos period'o resolution funkcijos.
// Ekstraktuotos, kad logika dubliuotųsi getBalanceHandler'yje
// ir getCategorySpendingHandler'yje.
// ============================================================

/** ISO YYYY-MM-DD šios dienos data. */
function todayIso() {
  return new Date().toISOString().split("T")[0];
}

/**
 * Resolves period code į { fromDate, toDate } porą.
 * Nepalaikomi period'ai (pvz. typo) → { fromDate: null, toDate: today } —
 * fallback į "all_time" ekvivalentą.
 *
 * @param {string} period — pvz. "current_month", "last_30_days"
 * @param {object} input — input.from_date / input.to_date jei period === "custom"
 * @returns {{ fromDate: string|null, toDate: string }}
 */
function resolvePeriod(period, input) {
  const today = todayIso();

  switch (period) {
    case "current_month": {
      const now = new Date();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      return { fromDate: `${now.getFullYear()}-${m}-01`, toDate: today };
    }
    case "current_week": {
      const now = new Date();
      const monday = new Date(now);
      // getDay(): 0=Sun..6=Sat. Convert to ISO week (Mon=0..Sun=6).
      const isoDay = (now.getDay() + 6) % 7;
      monday.setDate(now.getDate() - isoDay);
      return { fromDate: monday.toISOString().split("T")[0], toDate: today };
    }
    case "current_year": {
      const now = new Date();
      return { fromDate: `${now.getFullYear()}-01-01`, toDate: today };
    }
    case "last_30_days": {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return { fromDate: d.toISOString().split("T")[0], toDate: today };
    }
    case "last_90_days": {
      const d = new Date();
      d.setDate(d.getDate() - 90);
      return { fromDate: d.toISOString().split("T")[0], toDate: today };
    }
    case "custom": {
      return { fromDate: input.from_date || null, toDate: input.to_date || today };
    }
    default:
      // "all_time" arba nepalaikoma reikšmė — be lower bound
      return { fromDate: null, toDate: today };
  }
}

/** Apvalinimas iki 2 ženklų po kablelio (EUR currency precision). */
function round2(n) {
  return Math.round(n * 100) / 100;
}

// ============================================================
// HANDLER 1: queryTransactions
//
// Filtruoja pagal date range, category, type. Grąžina sąrašą su
// pilna informacija (id, amount, type, category, description, date).
// ============================================================

async function queryTransactionsHandler(input, license, supabase) {
  // Saugumo cap'as: even if Claude pasakytų limit:1000, mes apkarpom
  // iki 100 (mirroring schema'os maximum), default 20.
  const limit = Math.min(input.limit || 20, 100);

  let query = supabase
    .from("transactions")
    .select("id, amount, type, category, description, date, created_at")
    .eq("license_id", license.id)
    .order("date", { ascending: false })
    .limit(limit);

  if (input.from_date) query = query.gte("date", input.from_date);
  if (input.to_date) query = query.lte("date", input.to_date);
  if (input.category) query = query.ilike("category", input.category);
  if (input.type && input.type !== "both") query = query.eq("type", input.type);

  const { data, error } = await query;

  if (error) {
    return {
      success: false,
      error: { code: "supabase_error", message: error.message },
    };
  }

  return {
    success: true,
    result: {
      transactions: data ?? [],
      count: (data ?? []).length,
      filters: input,
    },
  };
}

// ============================================================
// HANDLER 2: getBalance
//
// Sumuoja income / expenses per period'ą, grąžina balansą.
// Apvalina iki 2 dec. ženklų — EUR precision.
// ============================================================

async function getBalanceHandler(input, license, supabase) {
  const period = input.period || "all_time";
  const { fromDate, toDate } = resolvePeriod(period, input);

  let query = supabase
    .from("transactions")
    .select("amount, type")
    .eq("license_id", license.id);

  if (fromDate) query = query.gte("date", fromDate);
  if (toDate) query = query.lte("date", toDate);

  const { data, error } = await query;

  if (error) {
    return {
      success: false,
      error: { code: "supabase_error", message: error.message },
    };
  }

  let totalIncome = 0;
  let totalExpenses = 0;

  for (const tx of data ?? []) {
    const amount = Number(tx.amount);
    if (!Number.isFinite(amount)) continue;
    if (tx.type === "income") totalIncome += amount;
    else if (tx.type === "expense") totalExpenses += amount;
  }

  return {
    success: true,
    result: {
      period,
      from_date: fromDate,
      to_date: toDate,
      total_income: round2(totalIncome),
      total_expenses: round2(totalExpenses),
      balance: round2(totalIncome - totalExpenses),
      transaction_count: (data ?? []).length,
    },
  };
}

// ============================================================
// HANDLER 3: getCategorySpending
//
// Agreguoja išlaidas (TIK type='expense') pagal kategoriją per
// period'ą. Procentai nuo total — kad Claude galėtų pasakyti
// "30% biudžeto iškrito maistui".
// ============================================================

async function getCategorySpendingHandler(input, license, supabase) {
  const period = input.period || "current_month";
  const { fromDate, toDate } = resolvePeriod(period, input);

  let query = supabase
    .from("transactions")
    .select("amount, category")
    .eq("license_id", license.id)
    .eq("type", "expense");

  if (fromDate) query = query.gte("date", fromDate);
  if (toDate) query = query.lte("date", toDate);
  if (input.category) query = query.ilike("category", input.category);

  const { data, error } = await query;

  if (error) {
    return {
      success: false,
      error: { code: "supabase_error", message: error.message },
    };
  }

  // Agregavimas pagal kategoriją.
  const categoryMap = {};
  let total = 0;

  for (const tx of data ?? []) {
    const amount = Number(tx.amount);
    if (!Number.isFinite(amount)) continue;
    // Tuščia/null kategorija → "Be kategorijos" (fallback'as Claude'ui,
    // kad jis galėtų natūraliai paaiškinti vartotojui — "neturite jos
    // pažymėtos").
    const cat = tx.category || "Be kategorijos";
    categoryMap[cat] = (categoryMap[cat] || 0) + amount;
    total += amount;
  }

  let categories = Object.entries(categoryMap).map(([name, amount]) => ({
    name,
    amount: round2(amount),
    // Procentas su 1 dec. ženklu (33.3%, ne 33.33333...).
    percentage: total > 0 ? Math.round((amount / total) * 1000) / 10 : 0,
  }));

  // Sortavimas pagal Claude prašymą.
  const sortBy = input.sort_by || "amount_desc";
  if (sortBy === "amount_desc") categories.sort((a, b) => b.amount - a.amount);
  else if (sortBy === "amount_asc") categories.sort((a, b) => a.amount - b.amount);
  else if (sortBy === "name_asc") categories.sort((a, b) => a.name.localeCompare(b.name));

  return {
    success: true,
    result: {
      period,
      from_date: fromDate,
      to_date: toDate,
      total: round2(total),
      categories,
      transaction_count: (data ?? []).length,
    },
  };
}

// ============================================================
// PUBLIC API — executeTool
// ============================================================

/**
 * Vykdo skaitymo tool'ą prieš Supabase ir grąžina rezultatą Claude'ui.
 *
 * Kontraktas — NIEKADA nemeta exception'o. Visada grąžina:
 *
 *   { success: true,  result: <object> }            — sėkmė
 *   { success: false, error: { code, message } }    — bet kokia klaida
 *
 * Klaidos kodai:
 *   - "unknown_tool"          — tool'as neegzistuoja schema'oje
 *   - "write_not_supported"   — tool'as yra rašymo (žingsnis 5/6)
 *   - "supabase_error"        — DB užklausos klaida (RLS, network ir t.t.)
 *   - "execution_failed"      — neužkluptas exception handler'yje
 *
 * @param {object} params
 * @param {string} params.toolName — pvz. "getBalance"
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

    // Dispatch'as. input gauna fallback į {} kad handler'iai galėtų
    // saugiai daryti `input.from_date` ir t.t. be undefined dereference'o.
    const input = toolInput || {};

    switch (toolName) {
      case "queryTransactions":
        return await queryTransactionsHandler(input, license, supabase);
      case "getBalance":
        return await getBalanceHandler(input, license, supabase);
      case "getCategorySpending":
        return await getCategorySpendingHandler(input, license, supabase);
      default:
        // Pasiektas tik jei schema'oje yra tool'as su requiresConfirmation:false,
        // bet handler'is jam neapibrėžtas. Defensive — ankstesnė versija
        // krisdavo per `getToolByName` lookup'ą, bet jei kažkas pridės naują
        // read tool'ą į schema'ą be handler'io, šis kelias jam pasakys.
        return {
          success: false,
          error: {
            code: "unknown_tool",
            message: `Tool '${toolName}' has no executor handler (schema exists but handler missing)`,
          },
        };
    }
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
