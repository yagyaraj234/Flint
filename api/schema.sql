-- Roast0 schema. Safe to run against a fresh project or the older base schema.
create extension if not exists pgcrypto;

create table if not exists public.roasts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  source text not null check (source in ('synthetic', 'upload', 'bfcl', 'gaia', 'live')),
  raw_trace jsonb not null,
  normalized jsonb not null,
  findings jsonb not null,
  cost jsonb not null,
  score int not null,
  tier text not null,
  roast_line text,
  status text not null default 'done' check (status in ('processing', 'done', 'failed')),
  error text,
  user_id uuid references auth.users(id),
  batch_id uuid,
  created_at timestamptz not null default now()
);

-- Upgrade projects created with the original stage-0 schema.
alter table public.roasts
  add column if not exists status text not null default 'done',
  add column if not exists error text,
  add column if not exists user_id uuid references auth.users(id),
  add column if not exists batch_id uuid;

update public.roasts set status = 'done' where status is null;

alter table public.roasts
  alter column status set default 'done',
  alter column status set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

do $$
begin
  alter table public.roasts
    add constraint roasts_status_check
    check (status in ('processing', 'done', 'failed'));
exception
  when duplicate_object then null;
end $$;

create index if not exists roasts_slug_idx on public.roasts (slug);
create index if not exists roasts_batch_idx on public.roasts (batch_id);
create index if not exists roasts_user_created_idx on public.roasts (user_id, created_at desc);
create index if not exists roasts_status_created_idx on public.roasts (status, created_at desc);

alter table public.roasts enable row level security;
-- No policies: server-side service-role client bypasses RLS.
