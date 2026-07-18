alter table public.roasts
  add column if not exists status text not null default 'done',
  add column if not exists error text,
  add column if not exists user_id uuid references auth.users(id),
  add column if not exists batch_id uuid;

do $$
begin
  alter table public.roasts
    add constraint roasts_status_check
    check (status in ('processing', 'done', 'failed'));
exception
  when duplicate_object then null;
end $$;

create index if not exists roasts_batch_idx on public.roasts (batch_id);
