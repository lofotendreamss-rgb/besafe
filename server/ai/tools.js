// ============================================================
// tools — Claude function calling schemos (BeSafe finansų veiksmai)
// ============================================================
//
// Phase 3 žingsnis 1a/6. Šis modulis aprašo, KĄ Claude gali DARYTI
// BeSafe'e (skirtingai nei tik kalbėti). Kiekvienas tool yra grynas
// JSON schema'os blob'as, kurį Anthropic API supranta per native
// function calling protokolą — Claude grąžina tool_use bloką su
// argumentais, server'is patvirtina + vykdo realią mutaciją (žingsnis
// 3/6) arba paklausia vartotojo patvirtinimo (žingsnis 4/6).
//
// Šiame žingsnyje (1a/6) — tik schemos. Jokio vykdymo, jokio /api/chat
// integration'o. Vykdytojas (`ToolExecutor`) bus žingsnis 3/6, /api/chat
// integracija — žingsnis 2/6.
//
// ============================================================
// KOKYBĖS PRINCIPAS (kūrėjas patvirtino 2026-04-28):
// ============================================================
//
//   "Geriau dabar užtrukti ilgiau, nei paskui turėti nesusipratimą su
//    voice asistentu visą laiką. Jeigu negalime padaryti kokybiškai,
//    tai geriau vartotojui nerodyti, kad tokia funkcija egzistuoja
//    programoje."
//
// Praktiškai šiame modulyje:
//
//   • Kiekvienas RAŠYMO veiksmas (transakcijos pridėjimas, biudžeto
//     keitimas, kategorijos kūrimas) turi `requiresConfirmation: true`.
//     Vartotojas mato suvestinę PRIEŠ vykdymą — AI siūlo, vartotojas
//     patvirtina. Niekur "tylaus rašymo" Supabase'e.
//
//   • Skaitymo veiksmai (queryTransactions, getBalance,
//     getCategorySpending) yra confirmation-free, nes jie tik atsako
//     į klausimą — nėra ką pakeisti, nėra ko prarasti.
//
//   • Schemos griežtos: amount turi minimum/maximum, type'ai naudoja
//     enum'us, datos — `format: "date"` (ISO YYYY-MM-DD). Claude
//     mažiau klysta, jei schema diktuoja lūkesčius.
//
// ============================================================
// GLOBALUMO PRINCIPAS (BeSafe — 14 kalbų)
// ============================================================
//
// Tool'ų `description` laukai RAŠYTI ANGLIŠKAI. Tai Anthropic API
// rekomendacija — Claude geriausiai supranta veiksmų semantiką
// angliškai (training data dauguma). Vartotojui rodoma žinutė bus
// VERSTA atskirai per i18n (žingsnis 4/6 confirmation UI).
//
// Lietuviški pavyzdžiai descriptions'uose ("pridėk 25 eurus",
// "Maistas") yra hint'ai Claude'ui — kad jis suprastų, kokia kalba
// vartotojas gali rašyti. Tai ne UI tekstas, tai prompt engineering.
//
// ============================================================
// SAUGUMO POZA
// ============================================================
//
//   • Tool schemos gyvena BACKEND'e — kartu su Anthropic API key'u.
//     Frontend negali nurodyti naujo tool'o ar pakeisti schemos —
//     visa kontrolė serveryje.
//
//   • Tools sąrašas perduodamas Claude'ui per /api/chat užklausą
//     (žingsnis 2/6). Claude grąžina `tool_use` blok'ą — server'is
//     valid'ina argumentus pagal schemą prieš bet kokią mutaciją.
//
//   • RAŠYMO operacijos (`requiresConfirmation: true`) NIEKADA nevykdomos
//     iškart. Server'is grąžina pending action'ą frontend'ui, vartotojas
//     mato dialogą, ir tik po confirm'o vyksta Supabase mutacija.
//     Žingsnis 4/6 įgyvendina UI dialogą; žingsnis 3/6 — vykdytoją.
//
//   • SKAITYMO operacijos taip pat valid'inamos (RLS Supabase'e), bet
//     nereikia patvirtinimo — nieko nekeičia.
//
// ============================================================
// KAIP PRIDĖTI NAUJĄ TOOL'Ą
// ============================================================
//
//   1. Apgalvok: WRITE ar READ? Jei keičia DB → write → confirmation.
//   2. Pridėk schema'os objektą į `tools` masyvą žemiau.
//   3. Privalomi laukai: name, description, input_schema, requiresConfirmation.
//   4. input_schema yra JSON Schema (type: "object", properties, required).
//   5. ToolExecutor (žingsnis 3/6) turi turėti atitinkantį handler'į —
//      kitaip Claude bandys kviesti, server'is grąžins error.
//   6. Jei tool'as turi i18n'inamą feedback'ą — pridėk raktus į VISAS
//      14 kalbų to paties commit'o metu.
// ============================================================

export const tools = [
  // ============================================================
  // 1) addTransaction — RAŠYMO veiksmas (kritinis, requires confirm)
  // ============================================================
  {
    name: "addTransaction",
    description:
      "Add a new financial transaction (income or expense) to the user's records. " +
      "Use when the user asks to record a purchase, payment, received income, or any " +
      "monetary movement. Examples in Lithuanian: 'pridėk 25 eurus už pietus', " +
      "'gavau 1000 eurų algos'. " +
      "Confirmation flow: when this tool is called, the BeSafe frontend automatically " +
      "shows a confirmation dialog with [Atšaukti] / [Patvirtinti] buttons. Calling " +
      "this tool is the ONLY way to record a transaction — text-based confirmations " +
      "(e.g. 'sakyk taip jei teisinga') do NOT save anything. If you describe a " +
      "transaction in text without calling this tool, the user will see your message " +
      "but no transaction will be created.",
    input_schema: {
      type: "object",
      properties: {
        amount: {
          type: "number",
          description:
            "Transaction amount in EUR. Must be positive. For 25.50 EUR write 25.50, " +
            "not -25.50.",
          minimum: 0.01,
          maximum: 1000000,
        },
        type: {
          type: "string",
          enum: ["income", "expense"],
          description:
            "Transaction type: 'income' for received money (salary, gift, refund), " +
            "'expense' for spent money (purchase, bill, payment).",
        },
        category: {
          type: "string",
          description:
            "Category name. Common Lithuanian categories: 'Maistas' (food), " +
            "'Transportas' (transport), 'Sveikata' (health), 'Pramogos' (entertainment), " +
            "'Komunaliniai' (utilities), 'Atlyginimas' (salary). If user mentions a " +
            "category not in this list, use their wording.",
        },
        description: {
          type: "string",
          description:
            "Optional short description of the transaction (e.g., 'Pietūs Maximoje', " +
            "'Balandžio alga'). Max 200 characters.",
        },
        date: {
          type: "string",
          format: "date",
          description:
            "Transaction date in YYYY-MM-DD format. If user says 'šiandien' or doesn't " +
            "specify, use today's date.",
        },
      },
      required: ["amount", "type", "category"],
    },
    requiresConfirmation: true,
  },

  // Phase 3 step 4/5 (2026-04-29): three READ tools removed —
  // queryTransactions, getBalance, getCategorySpending. They tried
  // to query Supabase.transactions which doesn't exist (BeSafe is
  // local-first; finance data lives in browser localStorage and is
  // delivered to Claude via the <user_finance_context> system prompt
  // block). Read tools were dead code with an apgaulingas API
  // surface — Claude was being offered tools that couldn't work.
  // Removing them aligns with the developer's "kuo mažiau
  // nesusipratimo" principle. See memory: local_first_finance_data.
  // Future write tools (deleteTransaction, addCategory, addPlace,
  // ...) will be added here in Phase 3 step 1b/6.
];

// ============================================================
// Helper'iai — naudojami /api/chat handler'io (žingsnis 2/6) ir
// ToolExecutor'iaus (žingsnis 3/6) lookup'ams.
// ============================================================

/**
 * Suranda tool'ą pagal vardą. Grąžina null, jei neegzistuoja —
 * kviečiantysis turi gracefully grąžinti klaidą Claude'ui (anstatu
 * tylaus failo).
 *
 * @param {string} name
 * @returns {object|null}
 */
export function getToolByName(name) {
  return tools.find((t) => t.name === name) || null;
}

/**
 * Visi tools, kuriems reikia vartotojo patvirtinimo (rašymo
 * operacijos). Server'io confirmation flow naudoja šitą sąrašą,
 * kad žinotų, ar grąžinti pending action'ą frontend'ui ar vykdyti
 * iškart.
 *
 * @returns {object[]}
 */
export function getWriteTools() {
  return tools.filter((t) => t.requiresConfirmation === true);
}

/**
 * Tools, kuriuos galima vykdyti automatiškai (skaitymo operacijos).
 * Šie negrįžta į vartotoją "ar tikrai?" — tiesiog vykdomi ir
 * rezultatas siunčiamas atgal Claude'ui kontekstui.
 *
 * @returns {object[]}
 */
export function getReadTools() {
  return tools.filter((t) => t.requiresConfirmation === false);
}

/**
 * Returns tools array with backend-only fields stripped, ready for
 * the Anthropic API.
 *
 * Anthropic API validation rejects tool schemas with extra properties:
 *   "400 invalid_request_error: tools.0: additional properties not
 *    allowed ('requiresConfirmation' was unexpected)"
 *
 * Our schema embeds `requiresConfirmation` for backend routing
 * (write tools break the agent loop and surface to client for
 * confirmation; read tools execute server-side via ToolExecutor).
 * Anthropic only wants { name, description, input_schema } — anything
 * else is rejected.
 *
 * Use this helper EVERYWHERE tools are passed over the API boundary.
 * For internal lookup (ToolExecutor schema validation, requiresConfirmation
 * flag check), keep using the raw `tools` array via getToolByName().
 *
 * @returns {Array<{name: string, description: string, input_schema: object}>}
 */
export function getToolsForAnthropic() {
  return tools.map(({ requiresConfirmation, ...anthropicFields }) => anthropicFields);
}

export const TOOL_COUNT = tools.length;
