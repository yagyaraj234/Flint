-- Roast0 schema. Run once in the Supabase dashboard SQL editor.
-- (PostgREST caches the schema; the table is visible to the API within seconds.)

create table roasts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  source text not null check (source in ('synthetic','upload','bfcl','gaia','live')),
  raw_trace jsonb not null,
  normalized jsonb not null,
  findings jsonb not null,
  cost jsonb not null,
  score int not null,
  tier text not null,
  roast_line text,
  created_at timestamptz default now()
);

create index roasts_slug_idx on roasts (slug);
alter table roasts enable row level security;
-- no policies: service role bypasses RLS, and service role is the only client we use
