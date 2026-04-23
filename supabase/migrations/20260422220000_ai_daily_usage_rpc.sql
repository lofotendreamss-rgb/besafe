-- AI Daily Usage — atomic increment RPC
-- Created during Step 2d.2
--
-- Called by chatHandler.js AFTER a successful Anthropic response.
-- Atomically INSERTs a fresh row (first message of the day) or
-- UPDATEs the existing one (subsequent messages). Using ON CONFLICT
-- in a single statement avoids the select-then-update race where
-- two concurrent /api/chat calls on the same license could stomp
-- each other's increment.
--
-- SECURITY DEFINER: the RPC runs with owner privileges, so
-- service_role clients can increment even when the underlying
-- ai_daily_usage table's restrictive RLS blocks direct writes. The
-- function does not take user-controlled rows as input — only the
-- caller's own license_id, which the server already validated via
-- authLicense before getting here.

CREATE OR REPLACE FUNCTION public.increment_ai_daily_usage(
  p_license_id UUID,
  p_tokens_in  INTEGER,
  p_tokens_out INTEGER
) RETURNS void AS $$
BEGIN
  INSERT INTO public.ai_daily_usage (license_id, usage_date, messages, tokens_in, tokens_out)
  VALUES (p_license_id, CURRENT_DATE, 1, p_tokens_in, p_tokens_out)
  ON CONFLICT (license_id, usage_date)
  DO UPDATE SET
    messages   = public.ai_daily_usage.messages   + 1,
    tokens_in  = public.ai_daily_usage.tokens_in  + EXCLUDED.tokens_in,
    tokens_out = public.ai_daily_usage.tokens_out + EXCLUDED.tokens_out,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.increment_ai_daily_usage(UUID, INTEGER, INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';
