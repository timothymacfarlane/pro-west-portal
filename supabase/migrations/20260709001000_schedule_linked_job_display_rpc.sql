create or replace function public.get_schedule_linked_job_display(p_assignment_ids uuid[])
returns table (
  id bigint,
  schedule_assignment_id uuid,
  job_planning_entry_id bigint,
  job_ref text,
  category text,
  suburb text
)
language sql
security definer
set search_path = public
as $$
  select
    link.id,
    link.schedule_assignment_id,
    link.job_planning_entry_id,
    link.job_ref,
    coalesce(job.job_type_legacy, '')::text as category,
    coalesce(entry.suburb, job.suburb, '')::text as suburb
  from public.schedule_job_ref_links link
  left join public.job_planning_entries entry
    on entry.id = link.job_planning_entry_id
  left join public.jobs job
    on trim(job.job_number::text) = trim(coalesce(entry.job_number::text, link.job_ref))
  where link.schedule_assignment_id = any(p_assignment_ids);
$$;

revoke all on function public.get_schedule_linked_job_display(uuid[]) from public;
grant execute on function public.get_schedule_linked_job_display(uuid[]) to authenticated;
