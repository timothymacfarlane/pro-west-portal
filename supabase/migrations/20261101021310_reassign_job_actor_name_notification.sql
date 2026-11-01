-- Preserve the existing My Jobs reassignment and audit behaviour, while
-- showing the acting employee's display name in the recipient notification.
create or replace function public.reassign_job(
  p_job_id uuid,
  p_new_assigned_to text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_assigned_to text;
  v_job_number text;
  v_new_user_id uuid;
  v_actor_name text;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;

  if p_new_assigned_to is not null then
    if not exists (
      select 1
      from public.profiles
      where is_active = true
        and show_in_contacts = true
        and trim(display_name) = trim(p_new_assigned_to)
    ) then
      raise exception 'Assignee must be active and visible in Contacts';
    end if;
  end if;

  select assigned_to, job_number
  into v_old_assigned_to, v_job_number
  from public.jobs
  where id = p_job_id;

  if not found then
    raise exception 'Job not found';
  end if;

  update public.jobs
  set assigned_to = p_new_assigned_to
  where id = p_job_id;

  insert into public.job_reassign_log (
    job_id, actor_id, from_assigned_to, to_assigned_to
  ) values (
    p_job_id, (select auth.uid()), v_old_assigned_to, p_new_assigned_to
  );

  if p_new_assigned_to is not null then
    select id into v_new_user_id
    from public.profiles
    where trim(display_name) = trim(p_new_assigned_to)
      and is_active = true
      and show_in_contacts = true
    limit 1;

    if v_new_user_id is not null then
      select nullif(trim(display_name), '') into v_actor_name
      from public.profiles
      where id = (select auth.uid());

      if position('@' in coalesce(v_actor_name, '')) > 0 then
        v_actor_name := null;
      end if;

      insert into public.notifications (
        user_id, type, title, body, link
      ) values (
        v_new_user_id,
        'job_reassigned',
        'Job reassigned to you',
        format('Job #%s was reassigned to you by %s.', v_job_number, coalesce(v_actor_name, 'a colleague')),
        '/my-jobs'
      );
    end if;
  end if;
end;
$$;

revoke all on function public.reassign_job(uuid, text) from public, anon;
grant execute on function public.reassign_job(uuid, text) to authenticated, service_role;
