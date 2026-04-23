import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAuthLicense } from './authLicense.js';

// ============================================================
// Supabase stub — mocks three tables:
//   licenses      : license lookup (select().eq().single())
//   devices       : device binding lookup (select().eq().eq().maybeSingle())
//   ai_audit_log  : audit row insert()
//
// Each table has its own builder with chainable spies so tests can
// assert exactly which arguments reached .eq() / .insert().
// ============================================================
function createSupabaseStub({
  licenseLookup = { data: null, error: { message: 'not found' } },
  deviceLookup  = { data: null, error: null },
  auditInsert   = { data: null, error: null },
} = {}) {
  const licenseBuilder = {
    select: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(licenseLookup),
  };
  const deviceBuilder = {
    select:      vi.fn().mockReturnThis(),
    eq:          vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(deviceLookup),
  };
  const auditBuilder = {
    insert: vi.fn().mockResolvedValue(auditInsert),
  };
  const from = vi.fn((table) => {
    if (table === 'licenses')     return licenseBuilder;
    if (table === 'devices')      return deviceBuilder;
    if (table === 'ai_audit_log') return auditBuilder;
    throw new Error('unexpected table: ' + table);
  });
  return { from, _builders: { licenseBuilder, deviceBuilder, auditBuilder } };
}

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json   = vi.fn().mockReturnValue(res);
  res.set    = vi.fn().mockReturnValue(res);
  return res;
}

function mockReq(headers = {}) {
  const lower = {};
  for (const k of Object.keys(headers)) lower[k.toLowerCase()] = headers[k];
  return { headers: lower, ip: '10.0.0.1' };
}

const VALID_KEY = 'BSAFE-A1B2-C3D4-E5F6-G7H8';
const VALID_LICENSE = Object.freeze({
  id:            '00000000-0000-0000-0000-000000000001',
  user_id:       '00000000-0000-0000-0000-0000000000aa',
  license_key:   VALID_KEY,
  status:        'active',
  plan:          'personal',
});

describe('authLicense middleware', () => {
  let next;
  beforeEach(() => { next = vi.fn(); });

  // ============================================================
  // Happy path — NO audit row
  // ============================================================

  it('1. [happy] active license, no fingerprint → next(), req.license.is_device_bound=null, no audit', async () => {
    const supabase = createSupabaseStub({ licenseLookup: { data: VALID_LICENSE, error: null } });
    const mw  = createAuthLicense(supabase);
    const req = mockReq({ 'x-license-key': VALID_KEY });
    const res = mockRes();

    await mw(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.license).toEqual({
      id:              VALID_LICENSE.id,
      user_id:         VALID_LICENSE.user_id,
      license_key:     VALID_LICENSE.license_key,
      status:          'active',
      plan:            'personal',
      is_device_bound: null,
    });
    expect(req.deviceFingerprint).toBeNull();
    expect(supabase._builders.auditBuilder.insert).not.toHaveBeenCalled();
  });

  it('2. [happy] trial license → next(), req.license set, no audit row', async () => {
    const supabase = createSupabaseStub({
      licenseLookup: { data: { ...VALID_LICENSE, status: 'trial' }, error: null },
    });
    const mw  = createAuthLicense(supabase);
    const req = mockReq({ 'x-license-key': VALID_KEY });
    const res = mockRes();

    await mw(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.license.status).toBe('trial');
    expect(supabase._builders.auditBuilder.insert).not.toHaveBeenCalled();
  });

  // ============================================================
  // Auth failures — 401 generic + audit row
  // ============================================================

  it('3. [auth] missing x-license-key header → 401 generic + audit (license_key="<missing>")', async () => {
    const supabase = createSupabaseStub();
    const mw  = createAuthLicense(supabase);
    const req = mockReq({});
    const res = mockRes();

    await mw(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'unauthorized' });
    expect(res.set).toHaveBeenCalledWith('WWW-Authenticate', 'License');
    expect(next).not.toHaveBeenCalled();

    const row = supabase._builders.auditBuilder.insert.mock.calls[0][0];
    expect(row.license_key).toBe('<missing>');
    expect(row.status).toBe('unauthorized');
    expect(row.action).toBe('auth_failure');
    expect(row.error_message).toBe('missing_header');
    expect(row.license_id).toBeNull();
  });

  it('4. [security] empty-string x-license-key → 401 generic + audit (license_key="<empty>")', async () => {
    const supabase = createSupabaseStub();
    const mw  = createAuthLicense(supabase);
    const req = mockReq({ 'x-license-key': '' });
    const res = mockRes();

    await mw(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'unauthorized' });
    expect(next).not.toHaveBeenCalled();

    const row = supabase._builders.auditBuilder.insert.mock.calls[0][0];
    expect(row.license_key).toBe('<empty>');
    expect(row.error_message).toBe('empty_header');
  });

  it('5. [security] null x-license-key → 401 generic + audit (license_key="<missing>")', async () => {
    const supabase = createSupabaseStub();
    const mw  = createAuthLicense(supabase);
    const req = { headers: { 'x-license-key': null }, ip: '10.0.0.1' };
    const res = mockRes();

    await mw(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();

    const row = supabase._builders.auditBuilder.insert.mock.calls[0][0];
    expect(row.license_key).toBe('<missing>');
    expect(row.error_message).toBe('missing_header');
  });

  it('6. [security] license_key > 100 chars → 401 + audit with truncated key', async () => {
    const supabase = createSupabaseStub();
    const mw  = createAuthLicense(supabase);
    const longKey = 'BSAFE-' + 'A'.repeat(200);
    const req = mockReq({ 'x-license-key': longKey });
    const res = mockRes();

    await mw(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();

    const row = supabase._builders.auditBuilder.insert.mock.calls[0][0];
    expect(row.license_key.length).toBeLessThanOrEqual(100);
    expect(row.error_message).toBe('license_key_too_long');
  });

  it('7. [security] malformed license_key (fails regex) → 401 + audit (stored uppercase), DB never queried', async () => {
    const supabase = createSupabaseStub();
    const mw  = createAuthLicense(supabase);
    const req = mockReq({ 'x-license-key': 'not-a-valid-bsafe-key' });
    const res = mockRes();

    await mw(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    // DB layer MUST NOT be reached for bad-format input
    expect(supabase._builders.licenseBuilder.single).not.toHaveBeenCalled();

    const row = supabase._builders.auditBuilder.insert.mock.calls[0][0];
    // Audit stores normalized (uppercase) form
    expect(row.license_key).toBe('NOT-A-VALID-BSAFE-KEY');
    expect(row.error_message).toBe('license_key_malformed');
  });

  it('8. [security] SQL injection "\' OR 1=1 --" → 401 by regex + audit, DB never queried', async () => {
    const supabase = createSupabaseStub();
    const mw  = createAuthLicense(supabase);
    const injection = "' OR 1=1 --";
    const req = mockReq({ 'x-license-key': injection });
    const res = mockRes();

    await mw(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    // Injection payload MUST NOT reach the DB layer
    expect(supabase._builders.licenseBuilder.single).not.toHaveBeenCalled();

    const row = supabase._builders.auditBuilder.insert.mock.calls[0][0];
    // Injection has no letters to uppercase — stored verbatim for forensic
    expect(row.license_key).toBe(injection);
    expect(row.error_message).toBe('license_key_malformed');
  });

  it('9. [auth] license not found in DB → 401 generic + audit (license_id=null)', async () => {
    const supabase = createSupabaseStub({
      licenseLookup: { data: null, error: { message: 'no rows' } },
    });
    const mw  = createAuthLicense(supabase);
    const req = mockReq({ 'x-license-key': VALID_KEY });
    const res = mockRes();

    await mw(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'unauthorized' });

    const row = supabase._builders.auditBuilder.insert.mock.calls[0][0];
    expect(row.license_id).toBeNull();
    expect(row.error_message).toBe('license_not_found');
  });

  it('10. [auth] status=cancelled → 401 generic + audit (license_id populated)', async () => {
    const supabase = createSupabaseStub({
      licenseLookup: { data: { ...VALID_LICENSE, status: 'cancelled' }, error: null },
    });
    const mw  = createAuthLicense(supabase);
    const req = mockReq({ 'x-license-key': VALID_KEY });
    const res = mockRes();

    await mw(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'unauthorized' });
    expect(next).not.toHaveBeenCalled();

    const row = supabase._builders.auditBuilder.insert.mock.calls[0][0];
    expect(row.license_id).toBe(VALID_LICENSE.id);
    expect(row.error_message).toBe('license_status_cancelled');
  });

  it('11. [auth] status=expired → 401 generic + audit row', async () => {
    const supabase = createSupabaseStub({
      licenseLookup: { data: { ...VALID_LICENSE, status: 'expired' }, error: null },
    });
    const mw  = createAuthLicense(supabase);
    const req = mockReq({ 'x-license-key': VALID_KEY });
    const res = mockRes();

    await mw(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    const row = supabase._builders.auditBuilder.insert.mock.calls[0][0];
    expect(row.error_message).toBe('license_status_expired');
  });

  it('12. [auth] status=payment_failed → 401 generic + audit row', async () => {
    const supabase = createSupabaseStub({
      licenseLookup: { data: { ...VALID_LICENSE, status: 'payment_failed' }, error: null },
    });
    const mw  = createAuthLicense(supabase);
    const req = mockReq({ 'x-license-key': VALID_KEY });
    const res = mockRes();

    await mw(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    const row = supabase._builders.auditBuilder.insert.mock.calls[0][0];
    expect(row.error_message).toBe('license_status_payment_failed');
  });

  // ============================================================
  // Plan gating — 403 with plan info
  // ============================================================

  it('13. [plan] license status OK but plan not in requiredPlans → 403 with plan info + audit', async () => {
    const supabase = createSupabaseStub({
      licenseLookup: { data: { ...VALID_LICENSE, plan: 'personal' }, error: null },
    });
    // Restrict this middleware to business-only for the test
    const mw  = createAuthLicense(supabase, {
      requiredPlans: ['business'],
      upgradeUrl:    '/pricing',
    });
    const req = mockReq({ 'x-license-key': VALID_KEY });
    const res = mockRes();

    await mw(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error:         'forbidden',
      reason:        'plan_limit',
      current_plan:  'personal',
      required_plan: 'business',
      upgrade_url:   '/pricing',
    });
    expect(next).not.toHaveBeenCalled();

    const row = supabase._builders.auditBuilder.insert.mock.calls[0][0];
    expect(row.license_id).toBe(VALID_LICENSE.id);
    expect(row.error_message).toBe('plan_excluded_personal');
  });

  // ============================================================
  // Device fingerprint — B=2 non-blocking, binding state exposed
  // ============================================================

  it('14. [security] device_fingerprint > 256 chars → truncated to 256, req.license.is_device_bound=true (device found)', async () => {
    const supabase = createSupabaseStub({
      licenseLookup: { data: VALID_LICENSE, error: null },
      deviceLookup:  { data: { id: 'dev-1' }, error: null }, // device IS bound
    });
    const mw  = createAuthLicense(supabase);
    const longFp = 'A'.repeat(500);
    const req = mockReq({
      'x-license-key':        VALID_KEY,
      'x-device-fingerprint': longFp,
    });
    const res = mockRes();

    await mw(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.deviceFingerprint.length).toBe(256);
    expect(req.license.is_device_bound).toBe(true);
    expect(supabase._builders.auditBuilder.insert).not.toHaveBeenCalled();
  });

  it('15. [device] valid fingerprint NOT in devices table → next(), req.license.is_device_bound=false, no audit (B=2 non-blocking)', async () => {
    const supabase = createSupabaseStub({
      licenseLookup: { data: VALID_LICENSE, error: null },
      deviceLookup:  { data: null, error: null }, // device NOT bound
    });
    const mw  = createAuthLicense(supabase);
    const req = mockReq({
      'x-license-key':        VALID_KEY,
      'x-device-fingerprint': 'unknown_fingerprint_abc123',
    });
    const res = mockRes();

    await mw(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.license.is_device_bound).toBe(false);
    expect(req.deviceFingerprint).toBe('unknown_fingerprint_abc123');
    expect(supabase._builders.auditBuilder.insert).not.toHaveBeenCalled();
  });

  // ============================================================
  // Timing attack prevention — all 401 bodies identical
  // ============================================================

  it('16. [timing] all 401 responses return IDENTICAL body {error:"unauthorized"}', async () => {
    const bodies = [];
    async function capture(scenarioStub, req) {
      const supabase = createSupabaseStub(scenarioStub);
      const mw  = createAuthLicense(supabase);
      const res = mockRes();
      await mw(req, res, vi.fn());
      expect(res.status).toHaveBeenCalledWith(401);
      bodies.push(JSON.stringify(res.json.mock.calls[0][0]));
    }
    await capture({}, mockReq({}));                                              // missing
    await capture({}, mockReq({ 'x-license-key': '' }));                          // empty
    await capture({}, mockReq({ 'x-license-key': 'bad-format' }));                // malformed
    await capture(
      { licenseLookup: { data: null, error: { message: 'x' } } },
      mockReq({ 'x-license-key': VALID_KEY })
    );                                                                            // not found
    await capture(
      { licenseLookup: { data: { ...VALID_LICENSE, status: 'cancelled' }, error: null } },
      mockReq({ 'x-license-key': VALID_KEY })
    );                                                                            // cancelled

    // All five snapshots must be byte-identical
    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0])).toEqual({ error: 'unauthorized' });
  });

  // ============================================================
  // Audit log behavior — success never writes
  // ============================================================

  it('17. [audit] successful auth does NOT write audit row (endpoint handler responsibility)', async () => {
    const supabase = createSupabaseStub({
      licenseLookup: { data: VALID_LICENSE, error: null },
      deviceLookup:  { data: { id: 'dev-1' }, error: null },
    });
    const mw  = createAuthLicense(supabase);
    const req = mockReq({
      'x-license-key':        VALID_KEY,
      'x-device-fingerprint': 'abcd1234',
    });
    const res = mockRes();

    await mw(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(supabase._builders.auditBuilder.insert).not.toHaveBeenCalled();
  });

  // ============================================================
  // Resilience — DB exception → 503 + audit (status=error)
  // ============================================================

  it('18. [resilience] supabase throws on license lookup → 503 + audit row (status=error)', async () => {
    const auditInsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'licenses') {
          return {
            select: vi.fn().mockReturnThis(),
            eq:     vi.fn().mockReturnThis(),
            single: vi.fn().mockRejectedValue(new Error('connection refused')),
          };
        }
        if (table === 'ai_audit_log') {
          return { insert: auditInsert };
        }
        throw new Error('unexpected table: ' + table);
      }),
    };
    const mw  = createAuthLicense(supabase);
    const req = mockReq({ 'x-license-key': VALID_KEY });
    const res = mockRes();

    await mw(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: 'auth_unavailable' });
    expect(next).not.toHaveBeenCalled();

    expect(auditInsert).toHaveBeenCalledOnce();
    const row = auditInsert.mock.calls[0][0];
    expect(row.status).toBe('error');
    expect(row.action).toBe('auth_error');
    expect(row.error_message).toBe('supabase_exception');
  });

  // ============================================================
  // Normalization — lowercase → uppercase before DB + audit
  // ============================================================

  it('19. [normalize] lowercase license_key → .eq() receives uppercase, audit saves uppercase', async () => {
    const supabase = createSupabaseStub({
      licenseLookup: { data: null, error: { message: 'no rows' } },
    });
    const mw  = createAuthLicense(supabase);
    const lowercaseKey      = 'bsafe-abc1-def2-ghi3-jkl4';
    const expectedUppercase = 'BSAFE-ABC1-DEF2-GHI3-JKL4';
    const req = mockReq({ 'x-license-key': lowercaseKey });
    const res = mockRes();

    await mw(req, res, next);

    // Assert #1: DB .eq() call received the UPPERCASE form
    const eqCalls = supabase._builders.licenseBuilder.eq.mock.calls;
    expect(eqCalls.length).toBeGreaterThanOrEqual(1);
    expect(eqCalls[0]).toEqual(['license_key', expectedUppercase]);

    // Assert #2: audit row stored the UPPERCASE form
    const auditRow = supabase._builders.auditBuilder.insert.mock.calls[0][0];
    expect(auditRow.license_key).toBe(expectedUppercase);
    expect(auditRow.error_message).toBe('license_not_found');

    // Sanity: 401 generic
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'unauthorized' });
  });

  // ============================================================
  // Device binding — truncation isolated from lookup result
  // ============================================================

  it('20. [security] device_fingerprint > 256 chars → truncated exactly to 256 chars regardless of device lookup', async () => {
    const supabase = createSupabaseStub({
      licenseLookup: { data: VALID_LICENSE, error: null },
      deviceLookup:  { data: null, error: null }, // device NOT found
    });
    const mw  = createAuthLicense(supabase);
    const longFp = 'A'.repeat(500);
    const req = mockReq({
      'x-license-key':        VALID_KEY,
      'x-device-fingerprint': longFp,
    });
    const res = mockRes();

    await mw(req, res, next);

    // PRIMARY: truncation works regardless of binding result
    expect(req.deviceFingerprint.length).toBe(256);
    expect(req.deviceFingerprint).toBe('A'.repeat(256));

    // SECONDARY: non-blocking (B=2) — next() still called even though device unknown
    expect(next).toHaveBeenCalledOnce();
    expect(req.license.is_device_bound).toBe(false);

    // TERTIARY: device DB lookup received truncated value (256), NOT original (500)
    const deviceEqCalls = supabase._builders.deviceBuilder.eq.mock.calls;
    const fingerprintCall = deviceEqCalls.find(c => c[0] === 'device_fingerprint');
    expect(fingerprintCall).toBeDefined();
    expect(fingerprintCall[1].length).toBe(256);
    expect(fingerprintCall[1]).toBe('A'.repeat(256));
  });

  // ============================================================
  // Resilience — device lookup throws (middleware must not crash)
  // ============================================================

  it('21. [resilience] license lookup OK but device lookup throws → next() still called, is_device_bound=false', async () => {
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'licenses') {
          return {
            select: vi.fn().mockReturnThis(),
            eq:     vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: VALID_LICENSE, error: null }),
          };
        }
        if (table === 'devices') {
          return {
            select:      vi.fn().mockReturnThis(),
            eq:          vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockRejectedValue(new Error('device table unavailable')),
          };
        }
        if (table === 'ai_audit_log') {
          return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
        }
        throw new Error('unexpected table: ' + table);
      }),
    };
    const mw  = createAuthLicense(supabase);
    const req = mockReq({
      'x-license-key':        VALID_KEY,
      'x-device-fingerprint': 'some_fingerprint_abc123',
    });
    const res = mockRes();

    await mw(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.license.is_device_bound).toBe(false);
    expect(req.license.license_key).toBe(VALID_KEY);

    expect(res.status).not.toHaveBeenCalledWith(401);
    expect(res.status).not.toHaveBeenCalledWith(503);
  });
});
