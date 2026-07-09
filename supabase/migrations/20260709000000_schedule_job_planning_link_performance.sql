update public.schedule_assignments assignment
set
  status = 'FIELD',
  touched = true,
  updated_at = now()
where coalesce(nullif(trim(assignment.status), ''), '') = ''
  and exists (
    select 1
    from public.schedule_job_ref_links link
    where link.schedule_assignment_id = assignment.id
  );

create index if not exists idx_schedule_assignments_date_person_id
  on public.schedule_assignments (date, person_id);

create index if not exists idx_job_planning_entries_date_assigned_to_job_number
  on public.job_planning_entries (date, assigned_to, job_number)
  where date is not null
    and assigned_to is not null;

create index if not exists idx_schedule_job_ref_links_assignment_job_ref
  on public.schedule_job_ref_links (schedule_assignment_id, job_ref);
