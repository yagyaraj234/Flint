alter table public.langsmith_connections
  add column if not exists sync_cron text not null default '0 * * * *'
  check (char_length(trim(sync_cron)) > 0);
