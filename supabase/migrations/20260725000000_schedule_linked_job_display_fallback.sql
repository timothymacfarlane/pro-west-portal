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
  with requested_assignments as (
    select
      assignment.id,
      assignment.job_ref
    from public.schedule_assignments assignment
    where assignment.id = any(p_assignment_ids)
      and public.is_active_portal_user()
  ),
  linked_refs as (
    select
      link.id,
      link.schedule_assignment_id,
      link.job_planning_entry_id,
      nullif(trim(link.job_ref), '') as job_ref,
      0::bigint as sort_order,
      0 as source_rank
    from public.schedule_job_ref_links link
    inner join requested_assignments assignment
      on assignment.id = link.schedule_assignment_id
    where nullif(trim(link.job_ref), '') is not null
  ),
  stored_refs as (
    select
      null::bigint as id,
      assignment.id as schedule_assignment_id,
      null::bigint as job_planning_entry_id,
      nullif(trim(refs.job_ref), '') as job_ref,
      refs.sort_order,
      1 as source_rank
    from requested_assignments assignment
    cross join lateral regexp_split_to_table(coalesce(assignment.job_ref, ''), ',')
      with ordinality as refs(job_ref, sort_order)
    where nullif(trim(refs.job_ref), '') is not null
  ),
  ranked_refs as (
    select
      refs.*,
      row_number() over (
        partition by refs.schedule_assignment_id, refs.job_ref
        order by refs.source_rank, refs.sort_order, refs.id nulls last
      ) as ref_rank
    from (
      select * from linked_refs
      union all
      select * from stored_refs
    ) refs
  ),
  display_refs as (
    select
      ranked_refs.id,
      ranked_refs.schedule_assignment_id,
      ranked_refs.job_planning_entry_id,
      ranked_refs.job_ref,
      ranked_refs.sort_order
    from ranked_refs
    where ranked_refs.ref_rank = 1
  )
  select
    display_refs.id,
    display_refs.schedule_assignment_id,
    display_refs.job_planning_entry_id,
    display_refs.job_ref,
    coalesce(nullif(trim(job.job_type_legacy), ''), '')::text as category,
    coalesce(nullif(trim(entry.suburb), ''), nullif(trim(job.suburb), ''), '')::text as suburb
  from display_refs
  left join public.job_planning_entries entry
    on entry.id = display_refs.job_planning_entry_id
  cross join lateral (
    select coalesce(
      nullif(trim(entry.job_number::text), ''),
      nullif(trim(display_refs.job_ref), '')
    ) as resolved_job_ref
  ) resolved
  left join public.jobs job
    on trim(job.job_number::text) = resolved.resolved_job_ref
  order by display_refs.schedule_assignment_id, display_refs.sort_order, display_refs.job_ref;
$$;

revoke all on function public.get_schedule_linked_job_display(uuid[]) from public;
grant execute on function public.get_schedule_linked_job_display(uuid[]) to authenticated;
