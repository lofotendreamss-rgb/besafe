-- ============================================================
-- BeSafe Database Schema
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard
-- Project → SQL Editor → New query → Paste → Run
-- ============================================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('personal', 'business')),
  billing TEXT NOT NULL CHECK (billing IN ('monthly', 'annual')),
  stripe_customer_id TEXT,
  stripe_session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Licenses table
CREATE TABLE IF NOT EXISTS licenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  license_key TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('personal', 'business')),
  billing TEXT NOT NULL CHECK (billing IN ('monthly', 'annual')),
  status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'expired', 'cancelled', 'payment_failed')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  devices JSONB DEFAULT '[]'::jsonb,
  max_devices INTEGER DEFAULT 3,
  trial_ends_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_email ON licenses(email);
CREATE INDEX IF NOT EXISTS idx_licenses_stripe ON licenses(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_stripe ON users(stripe_customer_id);
