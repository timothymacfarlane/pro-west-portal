create extension if not exists pgcrypto;

create or replace function public.is_active_portal_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'basic')
      and coalesce(is_active, true) = true
  );
$$;

grant execute on function public.is_active_portal_user() to authenticated;

create table if not exists public.job_checklist_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  job_category text not null,
  item_key text not null,
  item_order integer not null,
  item_text text not null,
  is_completed boolean not null default false,
  comments text not null default '',
  completed_by uuid null references public.profiles(id) on delete set null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_checklist_items_job_category_item_key_unique unique (job_id, job_category, item_key),
  constraint job_checklist_items_completion_pair_check check (
    (is_completed and completed_at is not null)
    or (not is_completed and completed_by is null and completed_at is null)
  )
);

create index if not exists idx_job_checklist_items_job_id
  on public.job_checklist_items (job_id);

create index if not exists idx_job_checklist_items_job_category
  on public.job_checklist_items (job_id, job_category);

create index if not exists idx_job_checklist_items_completed_by
  on public.job_checklist_items (completed_by);

drop trigger if exists set_job_checklist_items_updated_at on public.job_checklist_items;
create trigger set_job_checklist_items_updated_at
before update on public.job_checklist_items
for each row
execute function public.set_updated_at();

alter table public.job_checklist_items enable row level security;

drop policy if exists "Active portal users can view job checklist items" on public.job_checklist_items;
create policy "Active portal users can view job checklist items"
on public.job_checklist_items
for select
to authenticated
using (public.is_active_portal_user());

drop policy if exists "Active portal users can insert job checklist items" on public.job_checklist_items;
create policy "Active portal users can insert job checklist items"
on public.job_checklist_items
for insert
to authenticated
with check (public.is_active_portal_user());

drop policy if exists "Active portal users can update job checklist items" on public.job_checklist_items;
create policy "Active portal users can update job checklist items"
on public.job_checklist_items
for update
to authenticated
using (public.is_active_portal_user())
with check (public.is_active_portal_user());

grant select, insert, update on table public.job_checklist_items to authenticated;
grant all privileges on table public.job_checklist_items to service_role;
