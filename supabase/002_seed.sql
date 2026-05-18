-- ============================================================
-- database/002_seed.sql — Crest AI Seed Data (Idempotent Fix)
-- ============================================================

-- Ensure extension exists for fallback structural safety
create extension if not exists "uuid-ossp";

-- ============================================================
-- SEED PLANS WITH CORRECT PRODUCTION VISUAL LIMITS
-- ============================================================

insert into public.plans (
  id,
  name,
  messages_per_day,
  max_chats,
  price_monthly,
  created_at
)
values
  -- Free Tier: 100 free messages/day, 3 active chats tracker, ₹0
  (uuid_generate_v4(), 'free',     100,   3,   0,    now()),
  
  -- Pro Tier: 1,000 messages/day, 20 active chats tracking, ₹799
  (uuid_generate_v4(), 'pro',      1000,  20,  799,  now()),
  
  -- Plus Tier: 5,000 messages/day, 100 active chats system limit, ₹1,599
  (uuid_generate_v4(), 'plus',     5000,  100, 1599, now())

on conflict (name) do update
set
  messages_per_day = excluded.messages_per_day,
  max_chats = excluded.max_chats,
  price_monthly = excluded.price_monthly;