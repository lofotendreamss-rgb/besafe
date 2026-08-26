-- ============================================================
-- BeSafe — analytics queries
-- ============================================================
--
-- Read-only queries for the Supabase SQL editor. Nothing here writes,
-- so they are safe to run against production.
--
-- WHAT THIS IS NOT: product telemetry. BeSafe promises "zero analytics,
-- zero telemetry" and means it — nothing in the app reports what a user
-- does with their own data, and nothing here could tell you. Every
-- query below reads records the service already keeps in order to
-- function at all: who registered, whose licence checked in, who paid,
-- and how often the AI assistant was called.
--
-- SCHEMA CAVEAT: setup-database.sql has drifted from the live schema
-- (see server/BACKLOG.md — "Schema drift"). These queries target the
-- columns the running code actually reads and writes, which differ from
-- that file in at least three places:
--
--   * users holds subscription_plan / subscription_status,
--     not plan / billing
--   * licenses holds devices_max, not max_devices
--   * devices is its own table, not a JSONB column on licenses
--
-- Run query 0 first. If it disagrees with what follows, trust the
-- database and adjust — do not trust this header.
--
-- ============================================================


-- ============================================================
-- 0. Schema sanity check — run this before trusting anything else
-- ============================================================

SELECT table_name, column_name, data_type
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name IN ('users', 'licenses', 'devices',
                      'ai_audit_log', 'ai_daily_usage')
ORDER  BY table_name, ordinal_position;


-- ============================================================
-- 1. Is anyone showing up? — registrations over time
-- ============================================================

-- By month, newest first.
SELECT date_trunc('month', created_at)::date AS month,
       count(*)                              AS registrations
FROM   users
GROUP  BY 1
ORDER  BY 1 DESC;

-- By week, last 12 weeks — finer grain for spotting a launch or a
-- marketing push landing.
SELECT date_trunc('week', created_at)::date AS week,
       count(*)                             AS registrations
FROM   users
WHERE  created_at > now() - interval '12 weeks'
GROUP  BY 1
ORDER  BY 1 DESC;


-- ============================================================
-- 2. Where does everyone stand? — licence status breakdown
-- ============================================================

SELECT status,
       count(*)                                              AS licences,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1)    AS pct
FROM   licenses
GROUP  BY status
ORDER  BY licences DESC;

-- Same, split by plan — tells you whether Business behaves differently
-- from Personal.
SELECT plan, status, count(*) AS licences
FROM   licenses
GROUP  BY plan, status
ORDER  BY plan, licences DESC;


-- ============================================================
-- 3. Are people actually opening the app?
-- ============================================================
--
-- This is the strongest usage signal available without tracking
-- anything. The desktop/web client re-verifies its licence every 24h
-- (CHECK_INTERVAL_MS in js/core/license.checker.js), and every verify
-- refreshes devices.last_seen_at. So a device seen in the last 7 days
-- is a device someone actually opened.

-- Active licences by window.
SELECT count(DISTINCT license_id) FILTER (WHERE last_seen_at > now() - interval '24 hours') AS active_1d,
       count(DISTINCT license_id) FILTER (WHERE last_seen_at > now() - interval '7 days')   AS active_7d,
       count(DISTINCT license_id) FILTER (WHERE last_seen_at > now() - interval '30 days')  AS active_30d,
       count(DISTINCT license_id)                                                           AS ever_seen
FROM   devices;

-- Daily active devices, last 30 days.
SELECT last_seen_at::date AS day,
       count(DISTINCT license_id) AS active_licences,
       count(*)                   AS active_devices
FROM   devices
WHERE  last_seen_at > now() - interval '30 days'
GROUP  BY 1
ORDER  BY 1 DESC;

-- Dormant: paying or trialling, but nothing checked in for 30+ days.
-- These are the people to ask why.
SELECT l.license_key,
       l.email,
       l.plan,
       l.status,
       max(d.last_seen_at)                     AS last_seen,
       date_part('day', now() - max(d.last_seen_at))::int AS days_quiet
FROM   licenses l
LEFT   JOIN devices d ON d.license_id = l.id
WHERE  l.status IN ('trial', 'active')
GROUP  BY l.license_key, l.email, l.plan, l.status
HAVING max(d.last_seen_at) IS NULL
    OR max(d.last_seen_at) < now() - interval '30 days'
ORDER  BY last_seen NULLS FIRST;

-- How many devices per licence — is anyone hitting the cap?
SELECT device_count, count(*) AS licences
FROM (
  SELECT l.id, count(d.id) AS device_count
  FROM   licenses l
  LEFT   JOIN devices d ON d.license_id = l.id
  GROUP  BY l.id
) t
GROUP  BY device_count
ORDER  BY device_count;


-- ============================================================
-- 4. Does the trial convert?
-- ============================================================
--
-- users.trial_ends_at is the authoritative trial deadline.
-- licenses.trial_ends_at is referenced by code but does NOT exist on
-- the table — see server/BACKLOG.md. Do not use it here.

SELECT count(*) FILTER (WHERE subscription_status = 'trial')                             AS in_trial,
       count(*) FILTER (WHERE subscription_status = 'trial'
                          AND trial_ends_at < now())                                     AS trial_expired,
       count(*) FILTER (WHERE stripe_customer_id IS NOT NULL)                            AS reached_checkout,
       round(100.0 * count(*) FILTER (WHERE stripe_customer_id IS NOT NULL)
                   / nullif(count(*), 0), 1)                                             AS pct_reached_checkout
FROM   users;

-- Conversion by signup month: of everyone who registered in month X,
-- how many now hold an active licence?
SELECT date_trunc('month', u.created_at)::date AS signup_month,
       count(*)                                AS registered,
       count(*) FILTER (WHERE l.status = 'active') AS now_active,
       round(100.0 * count(*) FILTER (WHERE l.status = 'active')
                   / nullif(count(*), 0), 1)   AS conversion_pct
FROM   users u
LEFT   JOIN licenses l ON l.user_id = u.id
GROUP  BY 1
ORDER  BY 1 DESC;


-- ============================================================
-- 5. Churn — who left, and when
-- ============================================================

SELECT date_trunc('month', cancelled_at)::date AS month,
       count(*)                                AS cancellations
FROM   licenses
WHERE  cancelled_at IS NOT NULL
GROUP  BY 1
ORDER  BY 1 DESC;

-- Payment trouble right now. A row here means the app has degraded for
-- a real person who may not have noticed.
SELECT license_key, email, plan, status, updated_at
FROM   licenses
WHERE  status IN ('payment_failed', 'expired')
ORDER  BY updated_at DESC;


-- ============================================================
-- 6. Is the AI assistant used, or just shipped?
-- ============================================================

-- Daily volume, last 30 days.
SELECT usage_date,
       count(DISTINCT license_id) AS licences_using,
       sum(messages)              AS messages,
       sum(tokens_in + tokens_out) AS tokens
FROM   ai_daily_usage
WHERE  usage_date > current_date - 30
GROUP  BY usage_date
ORDER  BY usage_date DESC;

-- Adoption: of licences that exist, how many have ever sent a message?
SELECT count(DISTINCT l.id)                                        AS licences_total,
       count(DISTINCT u.license_id)                                AS licences_that_used_ai,
       round(100.0 * count(DISTINCT u.license_id)
                   / nullif(count(DISTINCT l.id), 0), 1)           AS adoption_pct
FROM   licenses l
LEFT   JOIN ai_daily_usage u ON u.license_id = l.id;

-- Heaviest users — useful before changing the daily quota
-- (50/day personal, 100/day business).
SELECT l.license_key, l.email, l.plan,
       sum(u.messages) AS messages_total,
       max(u.messages) AS busiest_day
FROM   ai_daily_usage u
JOIN   licenses l ON l.id = u.license_id
GROUP  BY l.license_key, l.email, l.plan
ORDER  BY messages_total DESC
LIMIT  20;


-- ============================================================
-- 7. Is anything failing? — ai_audit_log
-- ============================================================

-- Outcome mix over the last 7 days. Anything other than a large
-- 'success' majority deserves a look.
SELECT status, count(*) AS events
FROM   ai_audit_log
WHERE  at > now() - interval '7 days'
GROUP  BY status
ORDER  BY events DESC;

-- Recent failures with their reason.
SELECT at, action, status, error_message, license_key
FROM   ai_audit_log
WHERE  status <> 'success'
  AND  at > now() - interval '7 days'
ORDER  BY at DESC
LIMIT  50;

-- Rate-limit and auth pressure by IP — abuse shows up here first.
SELECT ip,
       count(*)                                           AS events,
       count(*) FILTER (WHERE status = 'rate_limited')    AS rate_limited,
       count(*) FILTER (WHERE status = 'unauthorized')    AS unauthorized,
       min(at)                                            AS first_seen,
       max(at)                                            AS last_seen
FROM   ai_audit_log
WHERE  at > now() - interval '7 days'
  AND  status IN ('rate_limited', 'unauthorized')
GROUP  BY ip
ORDER  BY events DESC
LIMIT  20;


-- ============================================================
-- 8. One-screen summary
-- ============================================================
--
-- The single query to run when you just want to know how things are.

SELECT
  (SELECT count(*) FROM users)                                              AS users_total,
  (SELECT count(*) FROM users
    WHERE created_at > now() - interval '30 days')                          AS users_new_30d,
  (SELECT count(*) FROM licenses WHERE status = 'active')                   AS licences_active,
  (SELECT count(*) FROM licenses WHERE status = 'trial')                    AS licences_trial,
  (SELECT count(*) FROM licenses
    WHERE status IN ('payment_failed', 'expired'))                          AS licences_trouble,
  (SELECT count(DISTINCT license_id) FROM devices
    WHERE last_seen_at > now() - interval '7 days')                         AS opened_app_7d,
  (SELECT coalesce(sum(messages), 0) FROM ai_daily_usage
    WHERE usage_date > current_date - 30)                                   AS ai_messages_30d,
  (SELECT count(*) FROM licenses
    WHERE cancelled_at > now() - interval '30 days')                        AS cancelled_30d;
