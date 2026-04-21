-- MIGRATION: Add 'suspicious' to ai_audit_log.status CHECK
-- Version:   002
-- Created:   2026-04-21
-- APPLY:     Supabase Dashboard → SQL Editor → paste and run
-- ROLLBACK:  see commented block at the bottom
--
-- CONTEXT:
--   Migration 001 defined status CHECK with 4 values:
--     'success', 'rate_limited', 'unauthorized', 'error'
--   Step 1c (rateLimit + multiDeviceDetector) introduces a 5th:
--     'suspicious' — observability signal (NOT blocking). Emitted
--     when one license_key presents 3+ distinct device_fingerprints
--     within 1 hour. Separate from 'unauthorized' because we do NOT
--     reject the request; we just record the anomaly for forensic
--     analysis and future alerting (detectSuspiciousActivity hook).
--
-- IDEMPOTENCY:
--   Safe to run N times — drop is IF EXISTS; add uses the same
--   constraint_name so re-running rebuilds the check identically.

-- ============================================================
-- PRE-CHECK — MUST run this FIRST and verify 0 rows returned
-- ============================================================
--
-- If any existing ai_audit_log row has a status value that the new
-- CHECK would REJECT, this migration would fail with a constraint
-- violation. Migration 001's CHECK only allowed 4 values, so any
-- pre-existing row already conforms; but if something out-of-band
-- inserted a non-conforming value (e.g. via service_role without
-- the CHECK — shouldn't happen, but verify), this would catch it.
--
-- Paste this SELECT alone first; expect: 0 rows.
--
-- select status, count(*)
-- from public.ai_audit_log
-- where status not in ('success','rate_limited','unauthorized','error','suspicious')
-- group by status;
--
-- If it returns rows → STOP. Clean up those rows or widen the new
-- CHECK before applying this migration.

-- ============================================================
-- Drop + re-add the CHECK constraint with the extra value.
-- Postgres doesn't support ALTER CHECK in place — must drop/add.
-- ============================================================
alter table public.ai_audit_log
  drop constraint if exists ai_audit_log_status_check;

alter table public.ai_audit_log
  add constraint ai_audit_log_status_check
  check (status in ('success', 'rate_limited', 'unauthorized',
                    'error', 'suspicious'));

-- Refresh PostgREST schema cache.
notify pgrst, 'reload schema';

-- ============================================================
-- POST-CHECK — verify the new constraint is active
-- ============================================================
--
-- After applying, run this to confirm all 5 values are allowed:
--
-- select pg_get_constraintdef(con.oid)
-- from pg_constraint con
-- join pg_class tab on con.conrelid = tab.oid
-- where tab.relname = 'ai_audit_log'
--   and con.conname = 'ai_audit_log_status_check';
--
-- Expected output (single row):
--   CHECK (status = ANY (ARRAY[
--     'success'::text, 'rate_limited'::text, 'unauthorized'::text,
--     'error'::text, 'suspicious'::text
--   ]))

-- ============================================================
-- ROLLBACK (uncomment and run in SQL Editor to undo)
-- ============================================================
-- Reverts to the Migration 001 4-value CHECK. Safe ONLY if no
-- row has status='suspicious' (rollback would then fail — clean
-- those rows first or keep the wider constraint).
--
-- Pre-rollback safety check (expect 0):
--   select count(*) from public.ai_audit_log where status='suspicious';
--
-- alter table public.ai_audit_log
--   drop constraint if exists ai_audit_log_status_check;
--
-- alter table public.ai_audit_log
--   add constraint ai_audit_log_status_check
--   check (status in ('success', 'rate_limited', 'unauthorized',
--                     'error'));
--
-- notify pgrst, 'reload schema';
