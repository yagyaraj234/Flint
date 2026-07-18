alter table public.roasts
  add column if not exists detailed_report jsonb not null default '{}'::jsonb;
