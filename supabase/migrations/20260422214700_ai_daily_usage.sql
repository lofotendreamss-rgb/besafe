-- AI Daily Usage Tracking
-- Created during Step 2d
-- Each license has one row per day when it used AI chat.
-- Retention: 90 days (cleaned up by a daily cron — see BACKLOG.md)
--
-- RLS: denies all direct anon/authenticated access, same pattern as
-- the conversations/messages/ai_audit_log tables from Step 1.
-- Server-side service_role bypasses RLS and performs all reads/writes.

CREATE TABLE IF NOT EXISTS public.ai_daily_usage (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id  UUID NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  usage_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  messages    INTEGER NOT NULL DEFAULT 0,
  tokens_in   INTEGER NOT NULL DEFAULT 0,
  tokens_out  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (license_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_ai_daily_usage_license_date
  ON public.ai_daily_usage (license_id, usage_date DESC);

CREATE INDEX IF NOT EXISTS idx_ai_daily_usage_date
  ON public.ai_daily_usage (usage_date);

COMMENT ON TABLE public.ai_daily_usage IS
  'Per-license daily AI chat usage tracking. Unique by (license_id, usage_date).';
COMMENT ON COLUMN public.ai_daily_usage.messages IS
  'Count of successful /api/chat requests (increments on 2xx response).';
COMMENT ON COLUMN public.ai_daily_usage.tokens_in IS
  'Sum of input tokens consumed for this license on this date.';
COMMENT ON COLUMN public.ai_daily_usage.tokens_out IS
  'Sum of output tokens produced for this license on this date.';

-- RLS — deny direct client access; server uses service_role.
ALTER TABLE public.ai_daily_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_daily_usage deny direct client access"
  ON public.ai_daily_usage
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

NOTIFY pgrst, 'reload schema';
