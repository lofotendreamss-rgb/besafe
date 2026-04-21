-- ============================================================
-- PRE-CHECK: verify licenses.license_key is already unique
-- ============================================================
-- PURPOSE:  Before adding `UNIQUE` constraint on licenses.license_key
--           in the main 20260421120000_ai_assistant.sql migration,
--           we must confirm that no duplicates exist.
--
--           If ANY duplicate is found, the ALTER TABLE ADD CONSTRAINT
--           would fail and leave the database in an inconsistent state.
--
-- APPLY:    Supabase Dashboard → SQL Editor → paste → Run
-- DO NOT:   This file does NOT modify the database. Safe to run anytime.
-- ============================================================

-- ------------------------------------------------------------
-- Q1: Baseline counts — are there any rows at all?
-- ------------------------------------------------------------
select
  count(*)                    as total_licenses,
  count(distinct license_key) as unique_license_keys,
  count(*) - count(distinct license_key) as duplicate_rows_difference
from public.licenses;

-- Expected result for a healthy DB:
--   total_licenses == unique_license_keys
--   duplicate_rows_difference == 0


-- ------------------------------------------------------------
-- Q2: NULL check — license_key should never be NULL
-- ------------------------------------------------------------
select count(*) as null_license_keys
from public.licenses
where license_key is null;

-- Expected result:
--   null_license_keys == 0
--
-- If > 0 we CANNOT add NOT NULL + UNIQUE constraint without cleanup.


-- ------------------------------------------------------------
-- Q3: List every license_key that appears more than once
-- ------------------------------------------------------------
select
  license_key,
  count(*) as occurrences
from public.licenses
group by license_key
having count(*) > 1
order by count(*) desc;

-- Expected result:
--   0 rows returned — means every license_key is already unique.
--
-- If rows appear, we'll need to decide how to merge/delete duplicates
-- BEFORE applying the main migration.


-- ------------------------------------------------------------
-- Q4: (Informational) Which columns does licenses currently have?
-- ------------------------------------------------------------
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'licenses'
order by ordinal_position;

-- Purpose: confirm schema matches what the server code expects
-- (license_key, status, plan, trial_ends_at, stripe_subscription_id,
--  updated_at, etc.) — no surprises before we add a constraint.


-- ------------------------------------------------------------
-- Q5: (Informational) Existing UNIQUE constraints on licenses
-- ------------------------------------------------------------
select
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema    = kcu.table_schema
where tc.table_schema = 'public'
  and tc.table_name   = 'licenses'
  and tc.constraint_type in ('UNIQUE', 'PRIMARY KEY')
order by tc.constraint_type, tc.constraint_name;

-- Purpose: we don't want to add a duplicate constraint with a conflicting
-- name. This tells us if `license_key` is already uniquely constrained
-- via some other mechanism (e.g. a composite index).
