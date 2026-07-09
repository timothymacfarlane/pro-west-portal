alter table public.job_planning_entries
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null;

alter table public.job_planning_unscheduled
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null;

create index if not exists idx_job_planning_entries_assigned_to
  on public.job_planning_entries (assigned_to);

create index if not exists idx_job_planning_unscheduled_assigned_to
  on public.job_planning_unscheduled (assigned_to);
