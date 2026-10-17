-- NegGuard MVP · Day1 schema (Supabase Postgres)
-- profiles: user subscription & usage (Week2 will expand)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  plan text not null default 'free', -- free | pro
  monthly_analyses_used int not null default 0,
  monthly_period_start date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  filename text not null,
  bytes int not null,
  row_count int,
  status text not null default 'uploaded', -- uploaded | parsing | ready | failed
  storage_path text,
  mapped_columns jsonb,
  missing_required jsonb,
  created_at timestamptz not null default now()
);

create index if not exists uploads_user_id_idx on public.uploads (user_id);
create index if not exists uploads_created_at_idx on public.uploads (created_at desc);

-- Storage bucket (create via dashboard or API): search-term-csvs
-- alter table public.uploads enable row level security;
