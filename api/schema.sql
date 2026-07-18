-- Roast0 schema. Safe to run against a fresh project or the older base schema.
create extension if not exists pgcrypto;

create table if not exists public.roasts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  source text not null check (source in ('synthetic', 'upload', 'bfcl', 'gaia', 'live', 'langsmith')),
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
  langsmith_connection_id uuid,
  external_trace_id text,
  created_at timestamptz not null default now()
);

-- Upgrade projects created with the original stage-0 schema.
alter table public.roasts
  add column if not exists status text not null default 'done',
  add column if not exists error text,
  add column if not exists user_id uuid references auth.users(id),
  add column if not exists batch_id uuid,
  add column if not exists langsmith_connection_id uuid,
  add column if not exists external_trace_id text;

update public.roasts set status = 'done' where status is null;
update public.roasts set created_at = now() where created_at is null;

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

-- Upgrade the original source constraint before LangSmith rows are inserted.
do $$
begin
  alter table public.roasts drop constraint if exists roasts_source_check;
  alter table public.roasts
    add constraint roasts_source_check
    check (source in ('synthetic', 'upload', 'bfcl', 'gaia', 'live', 'langsmith'));
exception
  when duplicate_object then null;
end $$;

-- Per-user LangSmith connections. api_key_encrypted contains only versioned,
-- application-encrypted ciphertext; never store a LangSmith key in plaintext.
create table if not exists public.langsmith_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (char_length(trim(label)) > 0),
  endpoint text not null default 'https://api.smith.langchain.com'
    check (endpoint like 'https://%'),
  workspace_id text not null check (char_length(trim(workspace_id)) > 0),
  project_name text not null check (char_length(trim(project_name)) > 0),
  api_key_encrypted text not null,
  key_version smallint not null default 1 check (key_version > 0),
  status text not null default 'active'
    check (status in ('active', 'paused', 'invalid', 'disconnected')),
  cursor_time timestamptz,
  cursor_run_id text,
  sync_locked_until timestamptz,
  last_sync_started_at timestamptz,
  last_sync_finished_at timestamptz,
  last_success_at timestamptz,
  last_scan_count integer not null default 0 check (last_scan_count >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.roasts
  drop constraint if exists roasts_langsmith_connection_id_fkey,
  add constraint roasts_langsmith_connection_id_fkey
    foreign key (langsmith_connection_id)
    references public.langsmith_connections(id)
    on delete set null;

do $$
begin
  alter table public.roasts
    add constraint roasts_langsmith_provenance_check
    check (
      source <> 'langsmith'
      or (user_id is not null and external_trace_id is not null)
    );
exception
  when duplicate_object then null;
end $$;

create index if not exists roasts_slug_idx on public.roasts (slug);
create index if not exists roasts_batch_idx on public.roasts (batch_id);
create index if not exists roasts_user_created_idx on public.roasts (user_id, created_at desc);
create index if not exists roasts_status_created_idx on public.roasts (status, created_at desc);
create unique index if not exists roasts_langsmith_trace_idx
  on public.roasts (langsmith_connection_id, external_trace_id)
  where langsmith_connection_id is not null and external_trace_id is not null;
create index if not exists langsmith_connections_sync_idx
  on public.langsmith_connections (status, last_sync_finished_at);
create index if not exists langsmith_connections_user_idx
  on public.langsmith_connections (user_id, created_at desc);
create unique index if not exists langsmith_connections_workspace_project_idx
  on public.langsmith_connections (user_id, endpoint, workspace_id, project_name);

alter table public.roasts enable row level security;
-- No policies: server-side service-role client bypasses RLS.
alter table public.langsmith_connections enable row level security;
-- No policies: encrypted connection credentials are reachable only by FastAPI's service role.
