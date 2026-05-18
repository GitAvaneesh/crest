-- ============================================================
-- 001_init.sql — Crest AI Database Schema (+ idempotent RLS)
-- ============================================================

create extension if not exists "uuid-ossp";

-- ============================================================
-- USERS
-- ============================================================

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text,
  avatar_url text,
  provider text default 'email',
  plan text default 'free',
  warning_count int default 0,
  is_banned boolean default false,
  ban_type text default null,
  ban_until timestamptz default null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- CHATS
-- ============================================================

create table if not exists public.chats (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,

  title text default 'New Chat',

  is_active boolean default true,

  last_message_at timestamptz default now(),

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- MESSAGES
-- ============================================================

create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),

  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,

  role text not null check (role in ('user', 'assistant')),

  content text not null,

  model text default 'gemini',

  flagged boolean default false,

  created_at timestamptz default now()
);

-- ============================================================
-- USAGE
-- ============================================================

create table if not exists public.usage (
  id uuid primary key default uuid_generate_v4(),

  user_id uuid not null references public.users(id) on delete cascade,

  date date not null,

  message_count int default 0,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(user_id, date)
);

-- ============================================================
-- PLANS
-- ============================================================

create table if not exists public.plans (
  id uuid primary key default uuid_generate_v4(),

  name text not null unique,

  messages_per_day int not null,
  max_chats int not null,

  price_monthly numeric(10,2) default 0,

  created_at timestamptz default now()
);

-- ============================================================
-- WARNINGS
-- ============================================================

create table if not exists public.warnings (
  id uuid primary key default uuid_generate_v4(),

  user_id uuid not null references public.users(id) on delete cascade,

  reason text not null,

  issued_at timestamptz default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists idx_chats_user_id
on public.chats(user_id);

create index if not exists idx_chats_last_message
on public.chats(last_message_at desc);

create index if not exists idx_messages_chat_id
on public.messages(chat_id);

create index if not exists idx_messages_user_id
on public.messages(user_id);

create index if not exists idx_usage_user_date
on public.usage(user_id, date);

create index if not exists idx_warnings_user_id
on public.warnings(user_id);

-- ============================================================
-- ENABLE RLS
-- ============================================================

alter table public.users enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;
alter table public.usage enable row level security;
alter table public.warnings enable row level security;
alter table public.plans enable row level security;

-- ============================================================
-- USERS POLICIES (idempotent)
-- ============================================================

drop policy if exists "Users can view own profile" on public.users;
create policy "Users can view own profile"
on public.users
for select
using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.users;
create policy "Users can update own profile"
on public.users
for update
using (auth.uid() = id);

-- ============================================================
-- CHATS POLICIES (idempotent)
-- ============================================================

drop policy if exists "Users can view own chats" on public.chats;
create policy "Users can view own chats"
on public.chats
for select
using (auth.uid() = user_id);

drop policy if exists "Users can create own chats" on public.chats;
create policy "Users can create own chats"
on public.chats
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own chats" on public.chats;
create policy "Users can update own chats"
on public.chats
for update
using (auth.uid() = user_id);

drop policy if exists "Users can delete own chats" on public.chats;
create policy "Users can delete own chats"
on public.chats
for delete
using (auth.uid() = user_id);

-- ============================================================
-- MESSAGES POLICIES (idempotent)
-- ============================================================

drop policy if exists "Users can view own messages" on public.messages;
create policy "Users can view own messages"
on public.messages
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own messages" on public.messages;
create policy "Users can insert own messages"
on public.messages
for insert
with check (auth.uid() = user_id);

-- ============================================================
-- USAGE POLICIES (idempotent)
-- ============================================================

drop policy if exists "Users can view own usage" on public.usage;
create policy "Users can view own usage"
on public.usage
for select
using (auth.uid() = user_id);

-- ============================================================
-- WARNINGS POLICIES (idempotent)
-- ============================================================

drop policy if exists "Users can view own warnings" on public.warnings;
create policy "Users can view own warnings"
on public.warnings
for select
using (auth.uid() = user_id);

-- ============================================================
-- PLANS POLICIES (idempotent)
-- ============================================================

drop policy if exists "Anyone can view plans" on public.plans;
create policy "Anyone can view plans"
on public.plans
for select
using (true);

-- ============================================================
-- UPDATED_AT FUNCTION
-- ============================================================

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- NEW USER FUNCTION
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (
    id,
    email,
    name,
    avatar_url,
    provider
  )
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    new.raw_app_meta_data->>'provider'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

grant execute on function public.handle_new_user() to postgres;

-- ============================================================
-- TRIGGERS (idempotent)
-- ============================================================

drop trigger if exists set_updated_at_users on public.users;
create trigger set_updated_at_users
before update on public.users
for each row
execute function public.handle_updated_at();

drop trigger if exists set_updated_at_chats on public.chats;
create trigger set_updated_at_chats
before update on public.chats
for each row
execute function public.handle_updated_at();

drop trigger if exists set_updated_at_usage on public.usage;
create trigger set_updated_at_usage
before update on public.usage
for each row
execute function public.handle_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();