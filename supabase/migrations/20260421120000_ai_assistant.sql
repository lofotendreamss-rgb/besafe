-- MIGRATION: AI Assistant — conversations, messages, ai_audit_log
-- Version:   001
-- Created:   2026-04-21
-- APPLY:     Supabase Dashboard → SQL Editor → paste and run
-- ROLLBACK:  see commented block at the bottom
--
-- CONTEXT:
--   BeSafe does not use Supabase Auth. Identity = license_key (validated
--   per existing users/licenses/devices tables from init.sql).
--   Backend accesses all tables via service_role; RLS is enabled as
--   defense-in-depth to block any accidental anon/authenticated access.
--   licenses.license_key already has UNIQUE NOT NULL (existing DDL) —
--   this migration does NOT add another unique constraint.

-- ============================================================
-- Shared helpers — updated_at trigger fn (idempotent)
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- Table: conversations
-- One chat thread per row, owned by a license (not a user directly).
-- Per-conversation daily quotas prevent a leaked license from burning
-- unlimited Anthropic API budget.
--
-- TODO(v2): consider per-language title length
--           (CJK: ~40 chars, Latin: ~80 chars) — current 80 chars
--           may be too much for ja/zh and too little for de/fi
-- TODO(v2): per-license global rate limit lives in middleware
--           (Step 1c). Per-conversation counters here are supplementary.
-- ============================================================
create table if not exists public.conversations (
  id                            uuid        primary key default gen_random_uuid(),
  license_id                    uuid        not null references public.licenses(id) on delete cascade,
  title                         text,                                     -- first user msg truncated to 80 chars
  daily_message_count           int         not null default 0,
  daily_message_count_reset_at  timestamptz not null default now(),
  total_tokens_used             int         not null default 0,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

create index if not exists conversations_license_updated_idx
  on public.conversations(license_id, updated_at desc);

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- ============================================================
-- Table: messages
-- Append-only log of every turn. tool_calls stores Claude
-- tool_use / tool_result blocks as JSONB for later replay.
-- ============================================================
create table if not exists public.messages (
  id               uuid        primary key default gen_random_uuid(),
  conversation_id  uuid        not null references public.conversations(id) on delete cascade,
  role             text        not null check (role in ('user', 'assistant', 'tool_result')),
  content          text        not null,
  tool_calls       jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists messages_conv_created_idx
  on public.messages(conversation_id, created_at);

-- ============================================================
-- Table: ai_audit_log
-- Every /api/chat and /api/chat/confirm request leaves a row here.
-- Denormalized: both license_id FK and license_key TEXT are stored so
-- that forensic analysis survives even if the license row is deleted
-- (ON DELETE SET NULL keeps the audit row intact).
-- conversation_id is intentionally NOT a FK — audit outlives chats.
-- ============================================================
create table if not exists public.ai_audit_log (
  id                  uuid        primary key default gen_random_uuid(),
  license_id          uuid        references public.licenses(id) on delete set null,
  license_key         text        not null,
  device_fingerprint  text,                                                -- optional (header absent → NULL)
  ip                  text,
  user_agent          text,
  action              text        not null,                                -- 'chat_message' | 'chat_confirm' | 'tool_execute' | ...
  conversation_id     uuid,
  status              text        not null check (status in ('success', 'rate_limited', 'unauthorized', 'error')),
  error_message       text,
  tokens_used         int,
  at                  timestamptz not null default now()
);

create index if not exists ai_audit_license_at_idx
  on public.ai_audit_log(license_key, at desc);

create index if not exists ai_audit_status_at_idx
  on public.ai_audit_log(status, at desc);

-- ============================================================
-- Row Level Security — defense-in-depth
-- ============================================================
-- BeSafe backend accesses these tables ONLY via the service_role key
-- (which bypasses RLS). Restrictive policies block any future
-- misconfigured anon / authenticated client from reading anything.
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;
alter table public.ai_audit_log  enable row level security;

drop policy if exists "conversations deny direct client access" on public.conversations;
create policy "conversations deny direct client access"
  on public.conversations
  as restrictive
  for all
  to anon, authenticated
  using  (false)
  with check (false);

drop policy if exists "messages deny direct client access" on public.messages;
create policy "messages deny direct client access"
  on public.messages
  as restrictive
  for all
  to anon, authenticated
  using  (false)
  with check (false);

drop policy if exists "ai_audit_log deny direct client access" on public.ai_audit_log;
create policy "ai_audit_log deny direct client access"
  on public.ai_audit_log
  as restrictive
  for all
  to anon, authenticated
  using  (false)
  with check (false);

-- Refresh PostgREST schema cache so the new tables are visible via API.
notify pgrst, 'reload schema';

-- ============================================================
-- ROLLBACK (uncomment and run in SQL Editor to undo)
-- ============================================================
-- drop policy if exists "ai_audit_log deny direct client access" on public.ai_audit_log;
-- drop policy if exists "messages deny direct client access"      on public.messages;
-- drop policy if exists "conversations deny direct client access" on public.conversations;
-- drop trigger if exists conversations_set_updated_at on public.conversations;
-- drop table if exists public.ai_audit_log;
-- drop table if exists public.messages;
-- drop table if exists public.conversations;
-- -- set_updated_at() may be shared with other tables; drop only if unused elsewhere:
-- -- drop function if exists public.set_updated_at();
-- notify pgrst, 'reload schema';
