import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Phase 3 step 3/6: agent loop calls executeTool() for read tools.
// Mocking the module globally so tests can both (a) assert call patterns
// and (b) inject canned tool results without standing up Supabase.
// vi.mock() is hoisted above the imports below — vitest handles this.
// Default mock returns a generic success so tests that don't care about
// tool execution still pass through cleanly.
vi.mock('./ai/toolExecutor.js', () => ({
  executeTool: vi.fn().mockResolvedValue({
    success: true,
    result:  { mocked: true },
  }),
}));

import { createChatHandler } from './chatHandler.js';
import { executeTool }       from './ai/toolExecutor.js';

// ============================================================
// Shared helpers — mirror rateLimit.test.js patterns
// ============================================================

// Flush microtasks — lets fire-and-forget `.catch(() => {})` chains
// settle before we assert on audit writes. Do NOT combine with
// vi.useFakeTimers() — setImmediate does not tick under fake timers
// (learned from rateLimit.test.js T25).
const flushPromises = () => new Promise((r) => setImmediate(r));

function createSupabaseStub({
  auditInsert = { data: null, error: null },
  rpcResult   = { data: null, error: null },
} = {}) {
  const auditBuilder = { insert: vi.fn().mockResolvedValue(auditInsert) };
  const from = vi.fn((table) => {
    if (table === 'ai_audit_log') return auditBuilder;
    throw new Error('unexpected table: ' + table);
  });
  // rpc is invoked fire-and-forget from chatHandler after a
  // successful Anthropic response to increment ai_daily_usage.
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  return { from, rpc, _builders: { auditBuilder } };
}

function createAnthropicStub({ create } = {}) {
  return {
    messages: {
      create: create ?? vi.fn().mockResolvedValue(validAnthropicResponse()),
    },
  };
}

function validAnthropicResponse(overrides = {}) {
  return {
    content: [{ type: 'text', text: 'Hello from Claude' }],
    usage:   { input_tokens: 10, output_tokens: 20 },
    ...overrides,
  };
}

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json   = vi.fn().mockReturnValue(res);
  res.set    = vi.fn().mockReturnValue(res);
  return res;
}

const VALID_LICENSE = Object.freeze({
  id:          '00000000-0000-0000-0000-000000000001',
  user_id:     '00000000-0000-0000-0000-0000000000aa',
  license_key: 'BSAFE-A1B2-C3D4-E5F6-G7H8',
  status:      'active',
  plan:        'personal',
});

function mockReq({
  body    = { message: 'hi' },
  license = VALID_LICENSE,
  headers = {},
  deviceFingerprint = null,
  clientIp = '10.0.0.1',
  userAgent = 'test/1.0',
} = {}) {
  const lower = {};
  for (const k of Object.keys(headers)) lower[k.toLowerCase()] = headers[k];
  return { body, license, headers: lower, deviceFingerprint, clientIp, userAgent, ip: clientIp };
}

// ============================================================
// Global setup — silence stdout
// ============================================================

let warnSpy;
let logSpy;
beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  // Phase 3 step 3/6 — agent loop emits per-iteration console.log
  // ("Executing tool: X", "Agent loop completed in N iterations").
  // Silence to keep test output clean.
  logSpy  = vi.spyOn(console, 'log').mockImplementation(() => {});
  // Reset the global executeTool mock between tests so leftover state
  // (mockResolvedValueOnce queues, call counters) doesn't bleed.
  vi.mocked(executeTool).mockReset();
  vi.mocked(executeTool).mockResolvedValue({
    success: true,
    result:  { mocked: true },
  });
});
afterEach(() => {
  warnSpy.mockRestore();
  logSpy.mockRestore();
  vi.useRealTimers();
});

// ============================================================
// GROUP 1: Factory validation
// ============================================================

describe('createChatHandler — factory validation', () => {
  it('T1: throws when anthropic is missing or has no messages.create', () => {
    const supabase = createSupabaseStub();
    expect(() => createChatHandler(null, supabase)).toThrow(/anthropic/);
    expect(() => createChatHandler({}, supabase)).toThrow(/anthropic/);
    expect(() => createChatHandler({ messages: {} }, supabase)).toThrow(/anthropic/);
    expect(() => createChatHandler({ messages: { create: 'nope' } }, supabase)).toThrow(/anthropic/);
  });

  it('T2: throws when supabase is missing or has no .from()', () => {
    const anthropic = createAnthropicStub();
    expect(() => createChatHandler(anthropic, null)).toThrow(/supabase/);
    expect(() => createChatHandler(anthropic, {})).toThrow(/supabase/);
    expect(() => createChatHandler(anthropic, { from: 'nope' })).toThrow(/supabase/);
  });
});

// ============================================================
// GROUP 2: Input validation — 400s, no audit, no Anthropic call
// ============================================================

describe('chatHandler — input validation', () => {
  it('T3: returns 400 message_required when req.body.message is undefined', async () => {
    const anthropic = createAnthropicStub();
    const supabase  = createSupabaseStub();
    const handler   = createChatHandler(anthropic, supabase);
    const req       = mockReq({ body: {} });
    const res       = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'message_required' });
    expect(anthropic.messages.create).not.toHaveBeenCalled();
    expect(supabase._builders.auditBuilder.insert).not.toHaveBeenCalled();
  });

  it('T4: returns 400 message_required for non-string (number, object, array)', async () => {
    const anthropic = createAnthropicStub();
    const supabase  = createSupabaseStub();
    const handler   = createChatHandler(anthropic, supabase);

    for (const bad of [42, { x: 1 }, ['a'], true, null]) {
      const res = mockRes();
      await handler(mockReq({ body: { message: bad } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'message_required' });
    }
    expect(anthropic.messages.create).not.toHaveBeenCalled();
  });

  it('T5: returns 400 message_empty for empty or whitespace-only strings', async () => {
    const anthropic = createAnthropicStub();
    const supabase  = createSupabaseStub();
    const handler   = createChatHandler(anthropic, supabase);

    for (const bad of ['', '   ', '\t\n  \r']) {
      const res = mockRes();
      await handler(mockReq({ body: { message: bad } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'message_empty' });
    }
    expect(anthropic.messages.create).not.toHaveBeenCalled();
  });

  it('T6: returns 400 message_too_long with max_length for > 2000 chars', async () => {
    const anthropic = createAnthropicStub();
    const supabase  = createSupabaseStub();
    const handler   = createChatHandler(anthropic, supabase);
    const req       = mockReq({ body: { message: 'a'.repeat(2001) } });
    const res       = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error:      'message_too_long',
      max_length: 2000,
    });
    expect(anthropic.messages.create).not.toHaveBeenCalled();
    expect(supabase._builders.auditBuilder.insert).not.toHaveBeenCalled();
  });

  it('T6b: accepts exactly 2000 chars (boundary)', async () => {
    const anthropic = createAnthropicStub();
    const supabase  = createSupabaseStub();
    const handler   = createChatHandler(anthropic, supabase);
    const req       = mockReq({ body: { message: 'a'.repeat(2000) } });
    const res       = mockRes();

    await handler(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(anthropic.messages.create).toHaveBeenCalledTimes(1);
  });

  it('T6c: returns 500 server_misconfigured when req.license is missing (not audit\'d)', async () => {
    const anthropic = createAnthropicStub();
    const supabase  = createSupabaseStub();
    const handler   = createChatHandler(anthropic, supabase);
    const res       = mockRes();

    await handler({ body: { message: 'hi' }, headers: {} }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'server_misconfigured' });
    expect(anthropic.messages.create).not.toHaveBeenCalled();
    expect(supabase._builders.auditBuilder.insert).not.toHaveBeenCalled();
  });
});

// ============================================================
// GROUP 3: Success path
// ============================================================

describe('chatHandler — success path', () => {
  it('T7: returns 200 with { response, tokens_used, model, elapsed_ms }', async () => {
    const anthropic = createAnthropicStub();
    const supabase  = createSupabaseStub();
    const handler   = createChatHandler(anthropic, supabase);
    const res       = mockRes();

    await handler(mockReq(), res);

    expect(res.status).not.toHaveBeenCalled();  // default 200
    expect(res.json).toHaveBeenCalledTimes(1);
    const body = res.json.mock.calls[0][0];
    expect(body.response).toBe('Hello from Claude');
    expect(body.tokens_used).toBe(30);          // 10 + 20
    expect(body.model).toBe('claude-haiku-4-5-20251001');
    expect(typeof body.elapsed_ms).toBe('number');
    expect(body.elapsed_ms).toBeGreaterThanOrEqual(0);
  });

  it('T8: calls anthropic.messages.create with correct model, max_tokens, system, messages, signal', async () => {
    const createSpy = vi.fn().mockResolvedValue(validAnthropicResponse());
    const anthropic = createAnthropicStub({ create: createSpy });
    const supabase  = createSupabaseStub();
    const handler   = createChatHandler(anthropic, supabase);

    await handler(mockReq({ body: { message: 'what is 2+2?' } }), mockRes());

    expect(createSpy).toHaveBeenCalledTimes(1);
    const [payload, opts] = createSpy.mock.calls[0];
    expect(payload).toEqual({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system:     expect.stringContaining('BeSafe Assistant'),
      messages:   [{ role: 'user', content: 'what is 2+2?' }],
      // Phase 3 step 2/6: tool schema list passed to every Anthropic
      // call. Asserted via expect.any(Array) here — content is covered
      // by tools.js own integrity tests.
      tools:      expect.any(Array),
    });
    expect(payload.tools.length).toBeGreaterThan(0);
    expect(opts).toHaveProperty('signal');
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it('T8b: X-Language header resolves to full language name in system prompt', async () => {
    const createSpy = vi.fn().mockResolvedValue(validAnthropicResponse());
    const anthropic = createAnthropicStub({ create: createSpy });
    const handler   = createChatHandler(anthropic, createSupabaseStub());

    await handler(mockReq({ headers: { 'X-Language': 'lt' } }), mockRes());

    expect(createSpy.mock.calls[0][0].system).toContain('Lithuanian');
  });

  it('T8c: missing X-Language defaults to English in system prompt', async () => {
    const createSpy = vi.fn().mockResolvedValue(validAnthropicResponse());
    const anthropic = createAnthropicStub({ create: createSpy });
    const handler   = createChatHandler(anthropic, createSupabaseStub());

    await handler(mockReq(), mockRes());

    expect(createSpy.mock.calls[0][0].system).toContain('English');
  });

  it('T8d: unknown X-Language code falls back to English', async () => {
    const createSpy = vi.fn().mockResolvedValue(validAnthropicResponse());
    const anthropic = createAnthropicStub({ create: createSpy });
    const handler   = createChatHandler(anthropic, createSupabaseStub());

    await handler(mockReq({ headers: { 'X-Language': 'xx' } }), mockRes());

    expect(createSpy.mock.calls[0][0].system).toContain('English');
  });

  it('T_FC1: omitted financeContext → no </user_finance_context> closing tag (template mentions the tag name but never closes it)', async () => {
    const createSpy = vi.fn().mockResolvedValue(validAnthropicResponse());
    const anthropic = createAnthropicStub({ create: createSpy });
    const handler   = createChatHandler(anthropic, createSupabaseStub());

    await handler(mockReq(), mockRes());

    expect(createSpy).toHaveBeenCalledTimes(1);
    const payload = createSpy.mock.calls[0][0];
    // Closing tag is the distinctive marker — template only REFERENCES
    // <user_finance_context> descriptively, it never emits </...> itself.
    expect(payload.system).not.toContain('</user_finance_context>');
    // Base prompt still present — proves we didn't accidentally skip the build.
    expect(payload.system).toContain('BeSafe Assistant');
  });

  it('T_FC2: valid financeContext → system prompt wraps JSON in <user_finance_context>, rules block stays last', async () => {
    const createSpy = vi.fn().mockResolvedValue(validAnthropicResponse());
    const anthropic = createAnthropicStub({ create: createSpy });
    const handler   = createChatHandler(anthropic, createSupabaseStub());

    const ctx = {
      currency: 'EUR',
      currentMonth: { label: '2026-04', expenses: 247.5 },
    };

    await handler(mockReq({ body: { message: 'hi', financeContext: ctx } }), mockRes());

    const payload = createSpy.mock.calls[0][0];
    expect(payload.system).toContain('<user_finance_context>');
    expect(payload.system).toContain('</user_finance_context>');
    expect(payload.system).toContain('"currency": "EUR"');
    expect(payload.system).toContain('"currentMonth"');
    expect(payload.system).toContain('2026-04');
    // Context must appear BEFORE the base prompt so rules weigh heavier at the tail.
    expect(payload.system.indexOf('<user_finance_context>'))
      .toBeLessThan(payload.system.indexOf('BeSafe Assistant'));
  });

  it('T_FC3: oversized financeContext (>50KB) → dropped, warning logged, Claude still called without context', async () => {
    const createSpy = vi.fn().mockResolvedValue(validAnthropicResponse());
    const anthropic = createAnthropicStub({ create: createSpy });
    const handler   = createChatHandler(anthropic, createSupabaseStub());

    // 60_000 chars easily exceeds the 50_000 byte cap after JSON.stringify.
    const huge = { fill: 'x'.repeat(60_000) };

    await handler(mockReq({ body: { message: 'hi', financeContext: huge } }), mockRes());

    // Claude was still called — fail-open for UX.
    expect(createSpy).toHaveBeenCalledTimes(1);
    const payload = createSpy.mock.calls[0][0];
    // Same distinctive marker as T_FC1 — closing tag only appears
    // when the block was actually injected.
    expect(payload.system).not.toContain('</user_finance_context>');
    // Warning emitted through the warnSpy set up in beforeEach.
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('financeContext too large'),
    );
  });

  it('T_H1: omitted history → messages array has only the current user turn', async () => {
    const createSpy = vi.fn().mockResolvedValue(validAnthropicResponse());
    const anthropic = createAnthropicStub({ create: createSpy });
    const handler   = createChatHandler(anthropic, createSupabaseStub());

    await handler(mockReq({ body: { message: 'hello' } }), mockRes());

    const payload = createSpy.mock.calls[0][0];
    expect(payload.messages).toHaveLength(1);
    expect(payload.messages[0]).toEqual({ role: 'user', content: 'hello' });
  });

  it('T_H2: valid history with 2 turns → messages array has 3 entries in order', async () => {
    const createSpy = vi.fn().mockResolvedValue(validAnthropicResponse());
    const anthropic = createAnthropicStub({ create: createSpy });
    const handler   = createChatHandler(anthropic, createSupabaseStub());

    const history = [
      { role: 'user',      content: 'first q' },
      { role: 'assistant', content: 'first a' },
    ];
    await handler(mockReq({ body: { message: 'second q', history } }), mockRes());

    const payload = createSpy.mock.calls[0][0];
    expect(payload.messages).toHaveLength(3);
    expect(payload.messages[0]).toEqual({ role: 'user',      content: 'first q' });
    expect(payload.messages[1]).toEqual({ role: 'assistant', content: 'first a' });
    expect(payload.messages[2]).toEqual({ role: 'user',      content: 'second q' });
  });

  it('T_H3: history entries with invalid role or malformed content are filtered; valid ones survive', async () => {
    const createSpy = vi.fn().mockResolvedValue(validAnthropicResponse());
    const anthropic = createAnthropicStub({ create: createSpy });
    const handler   = createChatHandler(anthropic, createSupabaseStub());

    const history = [
      { role: 'user',      content: 'valid one' },
      { role: 'system',    content: 'reject — role not allowed' },
      { role: 'assistant', content: '' },
      { role: 'assistant', content: 'x'.repeat(2001) },
      { role: 'user',      content: 123 },
      null,
      { role: 'assistant', content: 'valid two' },
    ];

    await handler(mockReq({ body: { message: 'now', history } }), mockRes());

    const payload = createSpy.mock.calls[0][0];
    // 2 surviving history entries + 1 current user message = 3 total.
    expect(payload.messages).toHaveLength(3);
    expect(payload.messages[0]).toEqual({ role: 'user',      content: 'valid one' });
    expect(payload.messages[1]).toEqual({ role: 'assistant', content: 'valid two' });
    expect(payload.messages[2]).toEqual({ role: 'user',      content: 'now' });
  });

  it('T_H4: history with >20 messages → full history dropped, warning logged, current turn still sent', async () => {
    const createSpy = vi.fn().mockResolvedValue(validAnthropicResponse());
    const anthropic = createAnthropicStub({ create: createSpy });
    const handler   = createChatHandler(anthropic, createSupabaseStub());

    // 25 small messages — exceeds MAX_HISTORY_MESSAGES (20) but well
    // under MAX_HISTORY_BYTES (30 KB), so the count gate triggers.
    const history = Array.from({ length: 25 }, (_, i) => ({
      role:    i % 2 === 0 ? 'user' : 'assistant',
      content: 'msg ' + i,
    }));

    await handler(mockReq({ body: { message: 'current', history } }), mockRes());

    // Only the current user message should reach Claude.
    const payload = createSpy.mock.calls[0][0];
    expect(payload.messages).toHaveLength(1);
    expect(payload.messages[0]).toEqual({ role: 'user', content: 'current' });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('history too many messages'),
    );
  });

  it('T9: audit insert receives success row with tokens_used = input + output', async () => {
    const anthropic = createAnthropicStub({
      create: vi.fn().mockResolvedValue(validAnthropicResponse({
        usage: { input_tokens: 123, output_tokens: 456 },
      })),
    });
    const supabase = createSupabaseStub();
    const handler  = createChatHandler(anthropic, supabase);
    const req      = mockReq({
      deviceFingerprint: 'fp-abc',
      clientIp: '1.2.3.4',
      userAgent: 'BeSafe/1.0',
    });

    await handler(req, mockRes());
    await flushPromises();

    expect(supabase._builders.auditBuilder.insert).toHaveBeenCalledTimes(1);
    const row = supabase._builders.auditBuilder.insert.mock.calls[0][0];
    expect(row).toMatchObject({
      license_id:         VALID_LICENSE.id,
      license_key:        VALID_LICENSE.license_key,
      device_fingerprint: 'fp-abc',
      ip:                 '1.2.3.4',
      user_agent:         'BeSafe/1.0',
      action:             'chat',
      conversation_id:    null,
      status:             'success',
      error_message:      null,
      tokens_used:        579,  // 123 + 456
    });
  });

  it('T9b: mixed content blocks — picks the text block, not the first block', async () => {
    const anthropic = createAnthropicStub({
      create: vi.fn().mockResolvedValue({
        content: [
          { type: 'thinking', thinking: 'let me reason...' },
          { type: 'text', text: 'The answer is 4.' },
        ],
        usage: { input_tokens: 5, output_tokens: 7 },
      }),
    });
    const handler = createChatHandler(anthropic, createSupabaseStub());
    const res     = mockRes();

    await handler(mockReq(), res);

    expect(res.json.mock.calls[0][0].response).toBe('The answer is 4.');
  });

  it('T_TOOL1: tool_use blocks → response.toolCalls populated with schema-derived requiresConfirmation', async () => {
    // Claude returns one text block + one tool_use block (mixed
    // content). We expect:
    //   - response: text body unchanged
    //   - toolCalls: array with one entry, requiresConfirmation: true
    //     (addTransaction is a WRITE tool per server/ai/tools.js)
    const anthropic = createAnthropicStub({
      create: vi.fn().mockResolvedValue({
        content: [
          { type: 'text', text: 'Sure, let me add that.' },
          {
            type:  'tool_use',
            id:    'toolu_abc123',
            name:  'addTransaction',
            input: { amount: 25.5, type: 'expense', category: 'Maistas' },
          },
        ],
        stop_reason: 'tool_use',
        usage:       { input_tokens: 30, output_tokens: 12 },
      }),
    });
    const handler = createChatHandler(anthropic, createSupabaseStub());
    const res     = mockRes();

    await handler(mockReq({ body: { message: 'pridėk 25.50 už pietus' } }), res);

    const body = res.json.mock.calls[0][0];
    expect(body.response).toBe('Sure, let me add that.');
    expect(Array.isArray(body.toolCalls)).toBe(true);
    expect(body.toolCalls).toHaveLength(1);
    expect(body.toolCalls[0]).toEqual({
      id:                   'toolu_abc123',
      name:                 'addTransaction',
      input:                { amount: 25.5, type: 'expense', category: 'Maistas' },
      requiresConfirmation: true,
    });
  });

  it('T_TOOL2: pure-text reply → response.toolCalls is omitted (backward compat)', async () => {
    // No tool_use blocks → toolCalls field MUST NOT appear in the
    // response. Clients that don't know about toolCalls should see
    // the same shape they always saw.
    const handler = createChatHandler(createAnthropicStub(), createSupabaseStub());
    const res     = mockRes();

    await handler(mockReq(), res);

    const body = res.json.mock.calls[0][0];
    expect(body).not.toHaveProperty('toolCalls');
  });

  it('T_TOOL3: unknown tool name from Claude → requiresConfirmation defaults to true (fail-safe)', async () => {
    // Defense in depth: if Claude hallucinates a tool name we don't
    // ship, we MUST default requiresConfirmation to true so unauth
    // execution can never bypass the user. ToolExecutor (step 3/6)
    // will reject the call entirely; this test pins the safe default.
    const anthropic = createAnthropicStub({
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type:  'tool_use',
            id:    'toolu_xyz',
            name:  'fakeNonexistentTool',
            input: {},
          },
        ],
        stop_reason: 'tool_use',
        usage:       { input_tokens: 5, output_tokens: 3 },
      }),
    });
    const handler = createChatHandler(anthropic, createSupabaseStub());
    const res     = mockRes();

    await handler(mockReq(), res);

    const body = res.json.mock.calls[0][0];
    expect(body.toolCalls).toHaveLength(1);
    expect(body.toolCalls[0].requiresConfirmation).toBe(true);
  });
});

// ============================================================
// GROUP 3.5: Agent loop (Phase 3 step 3/6)
//
// Loop drives Claude through multiple iterations when read tools
// are involved: tool_use → server executes → tool_result → Claude
// synthesises final answer. Write tools and unknown tools break
// the loop and surface to the client.
// ============================================================

describe('chatHandler — agent loop', () => {
  it('T_AGENT1: read tool → loop iterates, executeTool called, final text returned', async () => {
    // Iteration 1: Claude requests getBalance (read tool, no confirmation).
    // Iteration 2: server feeds tool_result back; Claude synthesises text.
    const createSpy = vi.fn()
      .mockResolvedValueOnce({
        content: [
          {
            type:  'tool_use',
            id:    'toolu_balance',
            name:  'getBalance',
            input: { period: 'current_month' },
          },
        ],
        stop_reason: 'tool_use',
        usage:       { input_tokens: 50, output_tokens: 10 },
      })
      .mockResolvedValueOnce({
        content: [
          { type: 'text', text: 'Šio mėnesio balansas: 250 €.' },
        ],
        stop_reason: 'end_turn',
        usage:       { input_tokens: 80, output_tokens: 25 },
      });

    vi.mocked(executeTool).mockResolvedValueOnce({
      success: true,
      result:  {
        period:        'current_month',
        balance:       250,
        total_income:  1000,
        total_expenses: 750,
      },
    });

    const anthropic = createAnthropicStub({ create: createSpy });
    const handler   = createChatHandler(anthropic, createSupabaseStub());
    const res       = mockRes();

    await handler(mockReq({ body: { message: 'koks mano balansas?' } }), res);

    // Two Anthropic round-trips: tool request + final synthesis.
    expect(createSpy).toHaveBeenCalledTimes(2);

    // executeTool invoked exactly once with the schema-derived shape.
    expect(vi.mocked(executeTool)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(executeTool).mock.calls[0][0]).toMatchObject({
      toolName:  'getBalance',
      toolInput: { period: 'current_month' },
      license:   expect.objectContaining({ id: VALID_LICENSE.id }),
    });

    // Final response is the text from iteration 2; no toolCalls
    // surfaced to client (read tools were resolved server-side).
    const body = res.json.mock.calls[0][0];
    expect(body.response).toBe('Šio mėnesio balansas: 250 €.');
    expect(body).not.toHaveProperty('toolCalls');

    // Tokens accumulated across both iterations: (50+10) + (80+25) = 165.
    expect(body.tokens_used).toBe(165);
  });

  it('T_AGENT2: write tool → loop breaks at iter 1, executeTool NOT called, toolCalls returned', async () => {
    // addTransaction is requiresConfirmation:true → loop must break
    // before executing. Frontend will surface confirmation UI.
    const createSpy = vi.fn().mockResolvedValueOnce({
      content: [
        { type: 'text', text: 'Sure, I will add that.' },
        {
          type:  'tool_use',
          id:    'toolu_add',
          name:  'addTransaction',
          input: { amount: 25.5, type: 'expense', category: 'Maistas' },
        },
      ],
      stop_reason: 'tool_use',
      usage:       { input_tokens: 30, output_tokens: 12 },
    });

    const anthropic = createAnthropicStub({ create: createSpy });
    const handler   = createChatHandler(anthropic, createSupabaseStub());
    const res       = mockRes();

    await handler(mockReq({ body: { message: 'pridėk 25.50 už pietus' } }), res);

    // One Anthropic call only — loop broke before second iteration.
    expect(createSpy).toHaveBeenCalledTimes(1);

    // executeTool MUST NOT be called for write tools — that path is
    // reserved for the confirmation flow (step 4/6 + step 5/6).
    expect(vi.mocked(executeTool)).not.toHaveBeenCalled();

    // Response carries toolCalls for the frontend to confirm.
    const body = res.json.mock.calls[0][0];
    expect(body.response).toBe('Sure, I will add that.');
    expect(body.toolCalls).toHaveLength(1);
    expect(body.toolCalls[0]).toMatchObject({
      name:                 'addTransaction',
      requiresConfirmation: true,
    });
  });

  it('T_AGENT3: max iterations safety → 500 tool_loop_exceeded + audit error', async () => {
    // Pathological case: Claude perpetually requests another read
    // tool. Loop must terminate after MAX_TOOL_ITERATIONS=5 with a
    // 500 + audit row, not hang the request slot.
    const createSpy = vi.fn().mockResolvedValue({
      content: [
        {
          type:  'tool_use',
          id:    'toolu_loop',
          name:  'getBalance',
          input: {},
        },
      ],
      stop_reason: 'tool_use',
      usage:       { input_tokens: 20, output_tokens: 5 },
    });

    const anthropic = createAnthropicStub({ create: createSpy });
    const supabase  = createSupabaseStub();
    const handler   = createChatHandler(anthropic, supabase);
    const res       = mockRes();

    await handler(mockReq(), res);

    // Exactly 5 Anthropic calls (the cap).
    expect(createSpy).toHaveBeenCalledTimes(5);

    // executeTool ran 5 times too — once per iteration.
    expect(vi.mocked(executeTool)).toHaveBeenCalledTimes(5);

    // 500 with stable error code — no Anthropic details leaked.
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0]).toEqual({ error: 'tool_loop_exceeded' });

    // Audit row written with status:error and the same code so quota
    // tracking + abuse pattern detection see the loop blowout.
    await flushPromises();
    const auditCall = supabase._builders.auditBuilder.insert.mock.calls[0][0];
    expect(auditCall).toMatchObject({
      action:        'chat',
      status:        'error',
      error_message: 'tool_loop_exceeded',
    });
    // Tokens summed across all 5 iterations: 5 × (20+5) = 125.
    expect(auditCall.tokens_used).toBe(125);
  });
});

// ============================================================
// GROUP 4: Anthropic errors
// ============================================================

describe('chatHandler — anthropic errors', () => {
  it('T10: AbortError → 504 timeout + audit error', async () => {
    const abortErr = new Error('Aborted');
    abortErr.name  = 'AbortError';
    const anthropic = createAnthropicStub({
      create: vi.fn().mockRejectedValue(abortErr),
    });
    const supabase = createSupabaseStub();
    const handler  = createChatHandler(anthropic, supabase);
    const res      = mockRes();

    await handler(mockReq(), res);
    await flushPromises();

    expect(res.status).toHaveBeenCalledWith(504);
    expect(res.json).toHaveBeenCalledWith({ error: 'timeout' });
    const row = supabase._builders.auditBuilder.insert.mock.calls[0][0];
    expect(row).toMatchObject({
      action:        'chat',
      status:        'error',
      error_message: 'anthropic_error: timeout',
      tokens_used:   null,
    });
  });

  it('T11: err.status 4xx → 502 upstream_error + audit', async () => {
    const apiErr = Object.assign(new Error('bad request'), { status: 400 });
    const anthropic = createAnthropicStub({
      create: vi.fn().mockRejectedValue(apiErr),
    });
    const supabase = createSupabaseStub();
    const handler  = createChatHandler(anthropic, supabase);
    const res      = mockRes();

    await handler(mockReq(), res);
    await flushPromises();

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({ error: 'upstream_error' });
    const row = supabase._builders.auditBuilder.insert.mock.calls[0][0];
    expect(row.status).toBe('error');
    expect(row.error_message).toBe('anthropic_error: 400');
    expect(row.tokens_used).toBeNull();
  });

  it('T12: err.status 5xx and network (no status) → 503 service_unavailable + audit', async () => {
    // 5xx path
    {
      const apiErr = Object.assign(new Error('server error'), { status: 500 });
      const anthropic = createAnthropicStub({ create: vi.fn().mockRejectedValue(apiErr) });
      const supabase  = createSupabaseStub();
      const handler   = createChatHandler(anthropic, supabase);
      const res       = mockRes();
      await handler(mockReq(), res);
      await flushPromises();
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({ error: 'service_unavailable' });
      expect(supabase._builders.auditBuilder.insert.mock.calls[0][0].error_message)
        .toBe('anthropic_error: 500');
    }
    // network path (no status)
    {
      const netErr = new Error('ECONNRESET');
      const anthropic = createAnthropicStub({ create: vi.fn().mockRejectedValue(netErr) });
      const supabase  = createSupabaseStub();
      const handler   = createChatHandler(anthropic, supabase);
      const res       = mockRes();
      await handler(mockReq(), res);
      await flushPromises();
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({ error: 'service_unavailable' });
      expect(supabase._builders.auditBuilder.insert.mock.calls[0][0].error_message)
        .toBe('anthropic_error: network');
    }
  });
});

// ============================================================
// GROUP 5: Fire-and-forget audit
// ============================================================

describe('chatHandler — fire-and-forget audit', () => {
  it('T13: audit insert is slow/pending — response returns without waiting', async () => {
    // Insert returns a Promise that never resolves during this test.
    let resolveInsert;
    const pending = new Promise((r) => { resolveInsert = r; });
    const auditBuilder = { insert: vi.fn().mockReturnValue(pending) };
    const supabase = {
      from: vi.fn(() => auditBuilder),
      _builders: { auditBuilder },
    };
    const anthropic = createAnthropicStub();
    const handler   = createChatHandler(anthropic, supabase);
    const res       = mockRes();

    // Handler must resolve even though audit promise is still pending.
    await handler(mockReq(), res);

    expect(res.json).toHaveBeenCalledTimes(1);
    expect(res.json.mock.calls[0][0].response).toBe('Hello from Claude');
    // Cleanup: resolve the dangling promise so vitest doesn't warn.
    resolveInsert({ data: null, error: null });
    await flushPromises();
  });

  it('T14: audit insert rejects — no unhandled rejection, response still 200', async () => {
    const auditBuilder = { insert: vi.fn().mockRejectedValue(new Error('db down')) };
    const supabase = {
      from: vi.fn(() => auditBuilder),
      _builders: { auditBuilder },
    };
    const anthropic = createAnthropicStub();
    const handler   = createChatHandler(anthropic, supabase);
    const res       = mockRes();

    const unhandled = vi.fn();
    process.once('unhandledRejection', unhandled);

    await handler(mockReq(), res);
    await flushPromises();

    expect(res.json).toHaveBeenCalledTimes(1);
    expect(res.json.mock.calls[0][0].tokens_used).toBe(30);
    expect(unhandled).not.toHaveBeenCalled();
    process.removeListener('unhandledRejection', unhandled);
  });
});

// ============================================================
// GROUP 6: Security — no upstream detail leakage
// ============================================================

describe('chatHandler — security', () => {
  it('T15: error response body contains ONLY { error: <code> }, no Anthropic details', async () => {
    const apiErr = Object.assign(
      new Error('Invalid API key: sk-ant-secret-leak-123'),
      { status: 401, stack: 'Error: Invalid API key\n    at /server/secret.js:42' },
    );
    const anthropic = createAnthropicStub({
      create: vi.fn().mockRejectedValue(apiErr),
    });
    const handler = createChatHandler(anthropic, createSupabaseStub());
    const res     = mockRes();

    await handler(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(502);
    const body = res.json.mock.calls[0][0];
    expect(body).toEqual({ error: 'upstream_error' });
    expect(Object.keys(body)).toEqual(['error']);
    expect(JSON.stringify(body)).not.toContain('sk-ant');
    expect(JSON.stringify(body)).not.toContain('Invalid API key');
    expect(JSON.stringify(body)).not.toContain('secret.js');
  });
});
