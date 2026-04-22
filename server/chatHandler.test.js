import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createChatHandler } from './chatHandler.js';

// ============================================================
// Shared helpers — mirror rateLimit.test.js patterns
// ============================================================

// Flush microtasks — lets fire-and-forget `.catch(() => {})` chains
// settle before we assert on audit writes. Do NOT combine with
// vi.useFakeTimers() — setImmediate does not tick under fake timers
// (learned from rateLimit.test.js T25).
const flushPromises = () => new Promise((r) => setImmediate(r));

function createSupabaseStub({ auditInsert = { data: null, error: null } } = {}) {
  const auditBuilder = { insert: vi.fn().mockResolvedValue(auditInsert) };
  const from = vi.fn((table) => {
    if (table === 'ai_audit_log') return auditBuilder;
    throw new Error('unexpected table: ' + table);
  });
  return { from, _builders: { auditBuilder } };
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
beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warnSpy.mockRestore();
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
    });
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
