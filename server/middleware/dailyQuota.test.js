import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDailyQuota } from './dailyQuota.js';

// ============================================================
// Shared helpers
// ============================================================

// Stub that mocks the chained select/eq/eq/maybeSingle lookup
// dailyQuota performs against ai_daily_usage. Pass `usageSelect`
// as { data, error } to drive the scenario; defaults to "no row"
// (fresh day, used=0).
function createSupabaseStub({
  usageSelect = { data: null, error: null },
  maybeSingleThrows = null,
} = {}) {
  const maybeSingle = maybeSingleThrows
    ? vi.fn().mockRejectedValue(maybeSingleThrows)
    : vi.fn().mockResolvedValue(usageSelect);
  const usageBuilder = {
    select:      vi.fn().mockReturnThis(),
    eq:          vi.fn().mockReturnThis(),
    maybeSingle,
  };
  const from = vi.fn((table) => {
    if (table === 'ai_daily_usage') return usageBuilder;
    throw new Error('unexpected table: ' + table);
  });
  return { from, _builders: { usageBuilder } };
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

function mockReq({ license = VALID_LICENSE, headers = {}, body = {} } = {}) {
  const lower = {};
  for (const k of Object.keys(headers)) lower[k.toLowerCase()] = headers[k];
  return { license, headers: lower, body, ip: '10.0.0.1' };
}

// ============================================================
// Global setup
// ============================================================

let warnSpy;
beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warnSpy.mockRestore();
});

// ============================================================
// Factory validation (quick sanity — not in the required 8 but
// keeps parity with authLicense/rateLimit/chatHandler test files)
// ============================================================

describe('createDailyQuota — factory validation', () => {
  it('throws when supabase is missing or has no .from()', () => {
    expect(() => createDailyQuota(null)).toThrow(/supabase/);
    expect(() => createDailyQuota({})).toThrow(/supabase/);
    expect(() => createDailyQuota({ from: 'nope' })).toThrow(/supabase/);
  });
});

// ============================================================
// T1-T8 — the required coverage
// ============================================================

describe('dailyQuota middleware', () => {
  it('T1: personal plan with 0 used → next() + req.quotaInfo populated', async () => {
    const supabase = createSupabaseStub({ usageSelect: { data: null, error: null } });
    const quota    = createDailyQuota(supabase);
    const req      = mockReq({ license: { ...VALID_LICENSE, plan: 'personal' } });
    const res      = mockRes();
    const next     = vi.fn();

    await quota(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.quotaInfo).toEqual({ used: 0, limit: 50, remaining: 50 });
  });

  it('T2: personal plan with 49 used → next() (still under limit)', async () => {
    const supabase = createSupabaseStub({ usageSelect: { data: { messages: 49 }, error: null } });
    const quota    = createDailyQuota(supabase);
    const req      = mockReq({ license: { ...VALID_LICENSE, plan: 'personal' } });
    const res      = mockRes();
    const next     = vi.fn();

    await quota(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.quotaInfo).toEqual({ used: 49, limit: 50, remaining: 1 });
  });

  it('T3: personal plan with 50 used → 429 daily_limit_reached', async () => {
    const supabase = createSupabaseStub({ usageSelect: { data: { messages: 50 }, error: null } });
    const quota    = createDailyQuota(supabase);
    const req      = mockReq({ license: { ...VALID_LICENSE, plan: 'personal' } });
    const res      = mockRes();
    const next     = vi.fn();

    await quota(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({
      error: 'daily_limit_reached',
      limit: 50,
      used:  50,
    });
    expect(body.resets_at).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
  });

  it('T4: business plan with 99 used → next() (still under 100 limit)', async () => {
    const supabase = createSupabaseStub({ usageSelect: { data: { messages: 99 }, error: null } });
    const quota    = createDailyQuota(supabase);
    const req      = mockReq({ license: { ...VALID_LICENSE, plan: 'business' } });
    const res      = mockRes();
    const next     = vi.fn();

    await quota(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.quotaInfo).toEqual({ used: 99, limit: 100, remaining: 1 });
  });

  it('T5: business plan with 100 used → 429', async () => {
    const supabase = createSupabaseStub({ usageSelect: { data: { messages: 100 }, error: null } });
    const quota    = createDailyQuota(supabase);
    const req      = mockReq({ license: { ...VALID_LICENSE, plan: 'business' } });
    const res      = mockRes();
    const next     = vi.fn();

    await quota(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json.mock.calls[0][0]).toMatchObject({
      error: 'daily_limit_reached',
      limit: 100,
      used:  100,
    });
  });

  it('T6: unknown plan falls back to personal limit (50)', async () => {
    const supabase = createSupabaseStub({ usageSelect: { data: { messages: 49 }, error: null } });
    const quota    = createDailyQuota(supabase);
    const req      = mockReq({ license: { ...VALID_LICENSE, plan: 'enterprise' } });
    const res      = mockRes();
    const next     = vi.fn();

    await quota(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.quotaInfo).toEqual({ used: 49, limit: 50, remaining: 1 });

    // One more should trigger 429 under the personal cap.
    const supabase2 = createSupabaseStub({ usageSelect: { data: { messages: 50 }, error: null } });
    const quota2    = createDailyQuota(supabase2);
    const req2      = mockReq({ license: { ...VALID_LICENSE, plan: 'enterprise' } });
    const res2      = mockRes();
    const next2     = vi.fn();

    await quota2(req2, res2, next2);

    expect(next2).not.toHaveBeenCalled();
    expect(res2.status).toHaveBeenCalledWith(429);
    expect(res2.json.mock.calls[0][0].limit).toBe(50);
  });

  it('T7: DB error → fail-open, next() called, no 429', async () => {
    // Both error-object path and rejection path must fail open.
    {
      const supabase = createSupabaseStub({
        usageSelect: { data: null, error: { message: 'connection reset' } },
      });
      const quota = createDailyQuota(supabase);
      const req   = mockReq();
      const res   = mockRes();
      const next  = vi.fn();

      await quota(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
      expect(req.quotaInfo).toBeUndefined();  // not set on fail-open
    }
    {
      const supabase = createSupabaseStub({
        maybeSingleThrows: new Error('network down'),
      });
      const quota = createDailyQuota(supabase);
      const req   = mockReq();
      const res   = mockRes();
      const next  = vi.fn();

      await quota(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    }
  });

  it('T8: Retry-After header is a positive integer of seconds until UTC midnight', async () => {
    const supabase = createSupabaseStub({ usageSelect: { data: { messages: 50 }, error: null } });
    const quota    = createDailyQuota(supabase);
    const req      = mockReq({ license: { ...VALID_LICENSE, plan: 'personal' } });
    const res      = mockRes();
    const next     = vi.fn();

    await quota(req, res, next);

    expect(res.set).toHaveBeenCalledWith('Retry-After', expect.stringMatching(/^\d+$/));
    const headerCall = res.set.mock.calls.find((c) => c[0] === 'Retry-After');
    const seconds   = parseInt(headerCall[1], 10);

    // Bounded: 1 second minimum (edge case at 00:00:00), 24h maximum.
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(86400);

    // resets_at must be EXACTLY midnight UTC formatted ISO string.
    const body = res.json.mock.calls[0][0];
    expect(body.resets_at).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
    const resetsAtMs = Date.parse(body.resets_at);
    const nowMs      = Date.now();
    expect(resetsAtMs).toBeGreaterThan(nowMs);
    // Seconds field must be within 1s of (resets_at - now) / 1000.
    const diff = Math.ceil((resetsAtMs - nowMs) / 1000);
    expect(Math.abs(seconds - diff)).toBeLessThanOrEqual(1);
  });
});
