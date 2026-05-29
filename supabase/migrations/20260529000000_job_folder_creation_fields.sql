do $$
declare
  had_folder_created_column boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'jobs'
      and column_name = 'folder_created'
  )
  into had_folder_created_column;

  alter table public.jobs
    add column if not exists folder_created boolean not null default false,
    add column if not exists folder_created_at timestamptz null,
    add column if not exists folder_path text null,
    add column if not exists folder_error text null;

  if not had_folder_created_column then
    update public.jobs
    set
      folder_created = true,
      folder_created_at = null,
      folder_path = null,
      folder_error = null;
  end if;
end $$;

create index if not exists idx_jobs_folder_created
  on public.jobs (folder_created);
