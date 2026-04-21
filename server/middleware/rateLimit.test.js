import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createRateLimit,
  createMultiDeviceDetector,
  keyByLicenseHeader,
  keyByLicenseBody,
  keyByIp,
  keyByLicenseBodyOrIp,
} from './rateLimit.js';

// ============================================================
// Shared helpers
// ============================================================

// Flush microtasks — lets fire-and-forget `.catch(() => {})` chains
// settle before assertions run. Mirrors the pattern we'll use in
// authLicense.test.js whenever audit writes are involved.
const flushPromises = () => new Promise((r) => setImmediate(r));

function createSupabaseStub({ auditInsert = { data: null, error: null } } = {}) {
  const auditBuilder = { insert: vi.fn().mockResolvedValue(auditInsert) };
  const from = vi.fn((table) => {
    if (table === 'ai_audit_log') return auditBuilder;
    throw new Error('unexpected table: ' + table);
  });
  return { from, _builders: { auditBuilder } };
}

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json   = vi.fn().mockReturnValue(res);
  res.set    = vi.fn().mockReturnValue(res);
  return res;
}

function mockReq({
  headers = {},
  body    = null,
  ip      = '10.0.0.1',
  license = null,
  deviceFingerprint = null,
} = {}) {
  const lower = {};
  for (const k of Object.keys(headers)) lower[k.toLowerCase()] = headers[k];
  return { headers: lower, body, ip, license, deviceFingerprint };
}

// Valid BSAFE key used everywhere licenseKey is required
const VALID_KEY = 'BSAFE-A1B2-C3D4-E5F6-G7H8';
const VALID_LICENSE = Object.freeze({
  id:          '00000000-0000-0000-0000-000000000001',
  user_id:     '00000000-0000-0000-0000-0000000000aa',
  license_key: VALID_KEY,
  status:      'active',
  plan:        'personal',
});

const baseConfig = {
  limit:        5,
  windowMs:     60_000,
  keyExtractor: keyByLicenseHeader,
  action:       'test_rate_limit',
};

function makeRateLimiter(overrides = {}) {
  return createRateLimit({
    ...baseConfig,
    supabase: createSupabaseStub(),
    ...overrides,
  });
}

// ============================================================
// Global test setup — silence stdout + reset timers
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
// 1-5: Factory validation
// ============================================================

describe('createRateLimit — factory validation', () => {
  const withSupabase = { ...baseConfig, supabase: createSupabaseStub() };

  it('1. throws when limit is missing / non-number / non-positive', () => {
    expect(() => createRateLimit({ ...withSupabase, limit: undefined })).toThrow(/limit/);
    expect(() => createRateLimit({ ...withSupabase, limit: 0 })).toThrow(/limit/);
    expect(() => createRateLimit({ ...withSupabase, limit: -1 })).toThrow(/limit/);
    expect(() => createRateLimit({ ...withSupabase, limit: 'abc' })).toThrow(/limit/);
    expect(() => createRateLimit({ ...withSupabase, limit: NaN })).toThrow(/limit/);
  });

  it('2. throws when windowMs is missing / non-number / non-positive', () => {
    expect(() => createRateLimit({ ...withSupabase, windowMs: undefined })).toThrow(/windowMs/);
    expect(() => createRateLimit({ ...withSupabase, windowMs: 0 })).toThrow(/windowMs/);
    expect(() => createRateLimit({ ...withSupabase, windowMs: NaN })).toThrow(/windowMs/);
  });

  it('3. throws when keyExtractor is not a function', () => {
    expect(() => createRateLimit({ ...withSupabase, keyExtractor: null })).toThrow(/keyExtractor/);
    expect(() => createRateLimit({ ...withSupabase, keyExtractor: 'foo' })).toThrow(/keyExtractor/);
    expect(() => createRateLimit({ ...withSupabase, keyExtractor: {} })).toThrow(/keyExtractor/);
  });

  it('4. throws when action is empty string or missing', () => {
    expect(() => createRateLimit({ ...withSupabase, action: '' })).toThrow(/action/);
    expect(() => createRateLimit({ ...withSupabase, action: undefined })).toThrow(/action/);
    expect(() => createRateLimit({ ...withSupabase, action: null })).toThrow(/action/);
  });

  it('5. throws when supabase is missing or has no .from()', () => {
    expect(() => createRateLimit({ ...baseConfig, supabase: undefined })).toThrow(/supabase/);
    expect(() => createRateLimit({ ...baseConfig, supabase: null })).toThrow(/supabase/);
    expect(() => createRateLimit({ ...baseConfig, supabase: {} })).toThrow(/supabase/);
  });
});

// ============================================================
// 6-10: Key extractors
// ============================================================

describe('Key extractors', () => {
  it('6. keyByLicenseHeader: valid key → uppercase normalized', () => {
    expect(
      keyByLicenseHeader(mockReq({ headers: { 'x-license-key': 'bsafe-abc1-def2-ghi3-jkl4' } }))
    ).toBe('BSAFE-ABC1-DEF2-GHI3-JKL4');
    // Already uppercase stays uppercase
    expect(
      keyByLicenseHeader(mockReq({ headers: { 'x-license-key': VALID_KEY } }))
    ).toBe(VALID_KEY);
  });

  it('7. keyByLicenseHeader: malformed / absent / injection → null (FIX #3)', () => {
    expect(keyByLicenseHeader(mockReq({ headers: {} }))).toBeNull();
    expect(keyByLicenseHeader(mockReq({ headers: { 'x-license-key': '' } }))).toBeNull();
    expect(keyByLicenseHeader(mockReq({ headers: { 'x-license-key': 'not-valid-key' } }))).toBeNull();
    expect(keyByLicenseHeader(mockReq({ headers: { 'x-license-key': "' OR 1=1 --" } }))).toBeNull();
    expect(keyByLicenseHeader(mockReq({ headers: { 'x-license-key': 123 } }))).toBeNull();
  });

  it('8. keyByLicenseBody: valid → uppercase; malformed / empty / absent → null (FIX #3)', () => {
    expect(keyByLicenseBody({ body: { license_key: VALID_KEY } })).toBe(VALID_KEY);
    expect(keyByLicenseBody({ body: { license_key: 'bsafe-abc1-def2-ghi3-jkl4' } }))
      .toBe('BSAFE-ABC1-DEF2-GHI3-JKL4');
    expect(keyByLicenseBody({ body: { license_key: 'bad' } })).toBeNull();
    expect(keyByLicenseBody({ body: { license_key: '' } })).toBeNull();
    expect(keyByLicenseBody({ body: {} })).toBeNull();
    expect(keyByLicenseBody({ body: null })).toBeNull();
    expect(keyByLicenseBody({})).toBeNull();
  });

  it('9. keyByIp: XFF first (first IP in comma list), req.ip fallback', () => {
    expect(keyByIp({ headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1, 10.0.0.2' }, ip: '10.0.0.1' }))
      .toBe('1.2.3.4');
    expect(keyByIp({ headers: { 'x-forwarded-for': '  5.6.7.8  ' }, ip: '10.0.0.1' }))
      .toBe('5.6.7.8');
    expect(keyByIp({ headers: {}, ip: '192.168.1.1' })).toBe('192.168.1.1');
    expect(keyByIp({ headers: {}, ip: null })).toBeNull();
    expect(keyByIp({ headers: {} })).toBeNull();
  });

  it('10. keyByLicenseBodyOrIp: body present → body; body absent/bad → IP fallback', () => {
    // Valid body — returns body
    expect(keyByLicenseBodyOrIp({
      headers: { 'x-forwarded-for': '1.2.3.4' },
      body:    { license_key: VALID_KEY },
      ip:      '10.0.0.1',
    })).toBe(VALID_KEY);
    // Malformed body — falls back to IP
    expect(keyByLicenseBodyOrIp({
      headers: { 'x-forwarded-for': '1.2.3.4' },
      body:    { license_key: 'bad-format' },
      ip:      '10.0.0.1',
    })).toBe('1.2.3.4');
    // No body → IP
    expect(keyByLicenseBodyOrIp({
      headers: {},
      ip:      '192.168.1.1',
    })).toBe('192.168.1.1');
    // Neither → null
    expect(keyByLicenseBodyOrIp({ headers: {} })).toBeNull();
  });
});

// ============================================================
// 11-18: Middleware core
// ============================================================

describe('createRateLimit — middleware core', () => {
  it('11. first request → count=1, headers set, next() called', async () => {
    const mw = makeRateLimiter();
    const next = vi.fn();
    const req = mockReq({ headers: { 'x-license-key': VALID_KEY } });
    const res = mockRes();

    await mw(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.set).toHaveBeenCalledWith('X-RateLimit-Limit', '5');
    expect(res.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '4');
    expect(mw._state.get(VALID_KEY).count).toBe(1);
  });

  it('12. within limit → counter increments, remaining decreases', async () => {
    const mw = makeRateLimiter();
    const req = mockReq({ headers: { 'x-license-key': VALID_KEY } });

    for (let i = 0; i < 3; i++) {
      await mw(req, mockRes(), vi.fn());
    }

    expect(mw._state.get(VALID_KEY).count).toBe(3);

    // 4th request — still within limit of 5
    const res4 = mockRes();
    await mw(req, res4, vi.fn());
    expect(res4.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '1');
    expect(res4.status).not.toHaveBeenCalledWith(429);
  });

  it('13. at limit → next request gets 429 + Retry-After + audit row', async () => {
    const supabase = createSupabaseStub();
    const mw = makeRateLimiter({ supabase });
    const req = mockReq({ headers: { 'x-license-key': VALID_KEY } });

    // Hit the limit exactly
    for (let i = 0; i < 5; i++) {
      await mw(req, mockRes(), vi.fn());
    }
    expect(supabase._builders.auditBuilder.insert).not.toHaveBeenCalled();

    // 6th request — 429
    const res = mockRes();
    const next = vi.fn();
    await mw(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error:               'rate_limited',
      retry_after_seconds: expect.any(Number),
    });
    expect(res.set).toHaveBeenCalledWith('Retry-After', expect.any(String));
    expect(res.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');

    // Fire-and-forget audit — let microtasks settle
    await flushPromises();
    expect(supabase._builders.auditBuilder.insert).toHaveBeenCalledOnce();
    const row = supabase._builders.auditBuilder.insert.mock.calls[0][0];
    expect(row.status).toBe('rate_limited');
    expect(row.action).toBe('test_rate_limit');
  });

  it('14. window expiry → counter resets to 1', async () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    const mw = makeRateLimiter();
    const req = mockReq({ headers: { 'x-license-key': VALID_KEY } });

    // Fill the limit
    for (let i = 0; i < 5; i++) {
      await mw(req, mockRes(), vi.fn());
    }
    expect(mw._state.get(VALID_KEY).count).toBe(5);

    // Advance past windowMs (60_000)
    vi.setSystemTime(now + 60_001);

    // Next request — should start a new window with count=1
    await mw(req, mockRes(), vi.fn());
    expect(mw._state.get(VALID_KEY).count).toBe(1);
    expect(mw._state.get(VALID_KEY).windowStart).toBe(now + 60_001);
  });

  it('15. keyExtractor returns null → middleware passes through (skip rate limit)', async () => {
    const supabase = createSupabaseStub();
    const mw = createRateLimit({
      ...baseConfig,
      keyExtractor: () => null, // always null
      supabase,
    });
    const req = mockReq({});
    const res = mockRes();
    const next = vi.fn();

    // 100 requests — none should be rate-limited because key is always null
    for (let i = 0; i < 100; i++) await mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(100);
    expect(res.status).not.toHaveBeenCalledWith(429);
    expect(mw._state.size).toBe(0); // no entries added
  });

  it('16. headers include X-RateLimit-Limit, -Remaining, -Reset on success', async () => {
    vi.useFakeTimers();
    const now = 1_700_000_000_000;
    vi.setSystemTime(now);

    const mw = makeRateLimiter();
    const req = mockReq({ headers: { 'x-license-key': VALID_KEY } });
    const res = mockRes();
    await mw(req, res, vi.fn());

    expect(res.set).toHaveBeenCalledWith('X-RateLimit-Limit', '5');
    expect(res.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '4');
    // Reset is UNIX seconds of windowStart + windowMs
    const expectedReset = Math.ceil((now + 60_000) / 1000);
    expect(res.set).toHaveBeenCalledWith('X-RateLimit-Reset', String(expectedReset));
  });

  it('17. different keys have independent counters', async () => {
    const mw = makeRateLimiter();
    const KEY_A = 'BSAFE-AAAA-BBBB-CCCC-DDDD';
    const KEY_B = 'BSAFE-1111-2222-3333-4444';

    // Exhaust KEY_A (5 requests)
    for (let i = 0; i < 5; i++) {
      await mw(mockReq({ headers: { 'x-license-key': KEY_A } }), mockRes(), vi.fn());
    }
    // KEY_A 6th → 429
    const resA = mockRes();
    await mw(mockReq({ headers: { 'x-license-key': KEY_A } }), resA, vi.fn());
    expect(resA.status).toHaveBeenCalledWith(429);

    // KEY_B first request → 200 (unaffected)
    const resB = mockRes();
    const nextB = vi.fn();
    await mw(mockReq({ headers: { 'x-license-key': KEY_B } }), resB, nextB);
    expect(nextB).toHaveBeenCalledOnce();
    expect(resB.status).not.toHaveBeenCalledWith(429);
    expect(mw._state.get(KEY_B).count).toBe(1);
  });

  it('18. req.license populated → audit row uses license.id (not just the key)', async () => {
    const supabase = createSupabaseStub();
    const mw = makeRateLimiter({ supabase });
    const req = mockReq({
      headers: { 'x-license-key': VALID_KEY },
      license: VALID_LICENSE,
    });

    for (let i = 0; i < 5; i++) await mw(req, mockRes(), vi.fn());
    const res = mockRes();
    await mw(req, res, vi.fn()); // triggers 429

    await flushPromises();
    const row = supabase._builders.auditBuilder.insert.mock.calls[0][0];
    expect(row.license_id).toBe(VALID_LICENSE.id);
    expect(row.license_key).toBe(VALID_LICENSE.license_key);
  });
});

// ============================================================
// 19-20: Fire-and-forget audit (FIX #1)
// ============================================================

describe('createRateLimit — fire-and-forget audit (FIX #1)', () => {
  it('19. 429 returned immediately even when audit insert never resolves', async () => {
    // Audit stub never resolves — if middleware awaited it, the
    // 5-second Vitest default timeout would fail this test.
    const auditInsert = vi.fn(() => new Promise(() => {})); // pending forever
    const supabase = { from: () => ({ insert: auditInsert }) };
    const mw = makeRateLimiter({ supabase });
    const req = mockReq({ headers: { 'x-license-key': VALID_KEY } });

    for (let i = 0; i < 5; i++) await mw(req, mockRes(), vi.fn());

    const res = mockRes();
    await mw(req, res, vi.fn()); // 6th — 429

    expect(res.status).toHaveBeenCalledWith(429);
    expect(auditInsert).toHaveBeenCalledOnce();
    // The audit promise is still pending, but `mw` returned. That proves
    // the middleware does not block on audit — FIX #1 working as intended.
  });

  it('20. audit insert rejects → middleware does NOT crash or leak unhandled rejection', async () => {
    const auditInsert = vi.fn().mockRejectedValue(new Error('DB down'));
    const supabase = { from: () => ({ insert: auditInsert }) };
    const mw = makeRateLimiter({ supabase });
    const req = mockReq({ headers: { 'x-license-key': VALID_KEY } });

    for (let i = 0; i < 5; i++) await mw(req, mockRes(), vi.fn());

    const res = mockRes();
    await mw(req, res, vi.fn());
    await flushPromises(); // let rejected promise settle

    expect(res.status).toHaveBeenCalledWith(429);
    expect(auditInsert).toHaveBeenCalledOnce();
    // If `.catch(() => {})` were missing, Vitest would fail this test
    // with an unhandled rejection. Reaching this line proves FIX #1
    // correctly swallowed the error inside writeAuditEvent.
  });
});

// ============================================================
// 21-22: Lazy cleanup
// ============================================================

describe('createRateLimit — lazy cleanup', () => {
  it('21. stale entries evicted on request (up to CLEANUP_BATCH_SIZE per call)', async () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    const mw = makeRateLimiter();

    // Pre-populate 15 STALE entries (windowStart 2 minutes ago, windowMs=60s)
    for (let i = 0; i < 15; i++) {
      const k = `BSAFE-STAL-${String(i).padStart(4, '0')}-ZZZZ-ZZZZ`;
      mw._state.set(k, { count: 1, windowStart: now - 120_000 });
    }
    expect(mw._state.size).toBe(15);

    // Send a request with a fresh key — sweepStaleEntries runs first,
    // evicting up to CLEANUP_BATCH_SIZE (10) stale entries, then the
    // new key is added.
    await mw(
      mockReq({ headers: { 'x-license-key': VALID_KEY } }),
      mockRes(),
      vi.fn()
    );

    // Size now: 15 - 10 (swept) + 1 (new) = 6
    expect(mw._state.size).toBe(6);
    expect(mw._state.has(VALID_KEY)).toBe(true);
  });

  it('22. no setInterval / setTimeout registered by factories (no timer leaks)', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const setTimeoutSpy  = vi.spyOn(globalThis, 'setTimeout');

    // Defensive: discard any timers scheduled by spy setup itself
    // or by unrelated test infrastructure before we measure.
    setIntervalSpy.mockClear();
    setTimeoutSpy.mockClear();

    const mw = makeRateLimiter();
    const detector = createMultiDeviceDetector({ supabase: createSupabaseStub() });

    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(setTimeoutSpy).not.toHaveBeenCalled();

    // Even after some usage, no timers should be scheduled
    expect(typeof mw).toBe('function');
    expect(typeof detector).toBe('function');

    setIntervalSpy.mockRestore();
    setTimeoutSpy.mockRestore();
  });
});

// ============================================================
// 23-24: createMultiDeviceDetector
// ============================================================

describe('createMultiDeviceDetector', () => {
  it('23. 1-2 distinct fingerprints within window → no audit row', async () => {
    const supabase = createSupabaseStub();
    const detector = createMultiDeviceDetector({ supabase });

    // FP #1
    await detector(
      mockReq({ license: VALID_LICENSE, deviceFingerprint: 'fp_alpha' }),
      mockRes(), vi.fn()
    );
    // FP #2
    await detector(
      mockReq({ license: VALID_LICENSE, deviceFingerprint: 'fp_beta' }),
      mockRes(), vi.fn()
    );
    // Repeat FP #1 — still no new unique fingerprint
    await detector(
      mockReq({ license: VALID_LICENSE, deviceFingerprint: 'fp_alpha' }),
      mockRes(), vi.fn()
    );

    await flushPromises();
    expect(supabase._builders.auditBuilder.insert).not.toHaveBeenCalled();
    expect(detector._state.get(VALID_KEY).size).toBe(2); // 2 distinct FPs
  });

  it('24. 3rd distinct fingerprint → writes audit (action=suspicious_multi_device, status=suspicious) fire-and-forget', async () => {
    const supabase = createSupabaseStub();
    const detector = createMultiDeviceDetector({ supabase });

    for (const fp of ['fp_alpha', 'fp_beta', 'fp_gamma']) {
      await detector(
        mockReq({ license: VALID_LICENSE, deviceFingerprint: fp }),
        mockRes(), vi.fn()
      );
    }

    await flushPromises(); // audit write is fire-and-forget
    expect(supabase._builders.auditBuilder.insert).toHaveBeenCalledOnce();
    const row = supabase._builders.auditBuilder.insert.mock.calls[0][0];
    expect(row.action).toBe('suspicious_multi_device');
    expect(row.status).toBe('suspicious');
    expect(row.license_id).toBe(VALID_LICENSE.id);
    expect(row.license_key).toBe(VALID_LICENSE.license_key);
    expect(row.error_message).toMatch(/fingerprint_count_3/);
  });
});

// ============================================================
// 25: State cap (FIX #4)
// ============================================================

describe('createRateLimit — state cap (FIX #4)', () => {
  it('25. Map at MAX_STATE_SIZE → new key pass-through; state does not grow', async () => {
    // Deliberately NO vi.useFakeTimers() here:
    //   1. This test doesn't advance time — all entries share the same
    //      windowStart and we never test window expiry.
    //   2. flushPromises() uses setImmediate, which fake timers mock
    //      and prevent from ever running → test would hang.
    const supabase = createSupabaseStub();
    const mw = makeRateLimiter({ supabase });
    const now = Date.now();

    // Fill _state to MAX_STATE_SIZE (100_000). Keys are synthetic but
    // follow a deterministic pattern. All have windowStart=now so
    // sweepStaleEntries won't evict any of them.
    const MAX = 100_000;
    const stateMap = mw._state;
    for (let i = 0; i < MAX; i++) {
      stateMap.set('FAKE_KEY_' + i, { count: 1, windowStart: now });
    }
    expect(stateMap.size).toBe(MAX);

    // Send request with a BRAND-NEW key not present in state
    const newKey = 'BSAFE-ZZZZ-YYYY-XXXX-WWWW';
    const req = mockReq({ headers: { 'x-license-key': newKey } });
    const res = mockRes();
    const next = vi.fn();
    await mw(req, res, next);

    // Pass-through (FIX #4 bulkhead)
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalledWith(429);

    // New key was NOT added — state did not grow beyond cap
    expect(stateMap.has(newKey)).toBe(false);
    expect(stateMap.size).toBe(MAX); // unchanged (no sweeps possible, all fresh)

    // No audit row — bulkhead is silent except for the throttled warning
    // (FIX #5), which we've mocked globally via warnSpy. Since the
    // bulkhead code path NEVER calls writeAuditEvent, there is no
    // fire-and-forget promise to flush — we can assert directly.
    expect(supabase._builders.auditBuilder.insert).not.toHaveBeenCalled();
  }, 10_000); // 10s timeout — 100k Map.set operations can exceed default 5s on slow CI runners
});
