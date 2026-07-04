do $$
begin
  if to_regclass('public.vehicle_prestart_submissions') is not null then
    alter table public.vehicle_prestart_submissions
      add column if not exists notify_manager boolean not null default false,
      add column if not exists manager_alert_status text not null default 'not_required',
      add column if not exists manager_alert_sent_at timestamptz,
      add column if not exists manager_alert_last_attempt_at timestamptz,
      add column if not exists manager_alert_attempts integer not null default 0,
      add column if not exists manager_alert_recipient text,
      add column if not exists manager_alert_reply_to text,
      add column if not exists manager_alert_provider_message_id text,
      add column if not exists manager_alert_error text,
      add column if not exists submitted_by_user_id uuid references auth.users(id) on delete set null;
  end if;
end $$;

do $$
begin
  if to_regclass('public.vehicle_prestart_submissions') is not null and not exists (
    select 1
    from pg_constraint
    where conname = 'vehicle_prestart_submissions_manager_alert_status_check'
  ) then
    alter table public.vehicle_prestart_submissions
      add constraint vehicle_prestart_submissions_manager_alert_status_check
      check (manager_alert_status in ('not_required', 'pending', 'processing', 'sent', 'failed'));
  end if;
end $$;

do $$
begin
  if to_regclass('public.vehicle_prestart_submissions') is not null and not exists (
    select 1
    from pg_constraint
    where conname = 'vehicle_prestart_submissions_manager_alert_attempts_check'
  ) then
    alter table public.vehicle_prestart_submissions
      add constraint vehicle_prestart_submissions_manager_alert_attempts_check
      check (manager_alert_attempts >= 0);
  end if;
end $$;

create index if not exists vehicle_prestart_manager_alert_work_idx
  on public.vehicle_prestart_submissions (manager_alert_status, submitted_status, id)
  where notify_manager = true
    and submitted_status = 'submitted'
    and manager_alert_status in ('pending', 'failed')
    and manager_alert_sent_at is null;

create or replace function public.protect_vehicle_prestart_manager_alert_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_role text := coalesce(auth.jwt() ->> 'role', '');
  current_user_id uuid := auth.uid();
  new_status text := coalesce(new.manager_alert_status, 'not_required');
begin
  if current_role = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.submitted_by_user_id is not null and new.submitted_by_user_id <> current_user_id then
      raise exception 'submitted_by_user_id must match authenticated user';
    end if;

    if new.manager_alert_status not in ('not_required', 'pending') then
      raise exception 'manager alert status is not allowed from the browser';
    end if;

    if new.manager_alert_sent_at is not null
      or new.manager_alert_last_attempt_at is not null
      or coalesce(new.manager_alert_attempts, 0) <> 0
      or new.manager_alert_recipient is not null
      or new.manager_alert_reply_to is not null
      or new.manager_alert_provider_message_id is not null
      or new.manager_alert_error is not null then
      raise exception 'manager alert delivery fields are server-managed';
    end if;

    return new;
  end if;

  if new.submitted_by_user_id is distinct from old.submitted_by_user_id then
    if new.submitted_by_user_id is not null and new.submitted_by_user_id <> current_user_id then
      raise exception 'submitted_by_user_id must match authenticated user';
    end if;
  end if;

  if new.manager_alert_status is distinct from old.manager_alert_status then
    if not (
      old.submitted_status = 'pdf_pending'
      and old.pdf_path is null
      and new.submitted_status = 'submitted'
      and new.pdf_path is not null
      and new_status in ('pending', 'not_required')
    ) then
      raise exception 'manager alert status is server-managed after submission';
    end if;
  end if;

  if new.manager_alert_sent_at is distinct from old.manager_alert_sent_at
    or new.manager_alert_last_attempt_at is distinct from old.manager_alert_last_attempt_at
    or new.manager_alert_attempts is distinct from old.manager_alert_attempts
    or new.manager_alert_recipient is distinct from old.manager_alert_recipient
    or new.manager_alert_reply_to is distinct from old.manager_alert_reply_to
    or new.manager_alert_provider_message_id is distinct from old.manager_alert_provider_message_id
    or new.manager_alert_error is distinct from old.manager_alert_error then
    raise exception 'manager alert delivery fields are server-managed';
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.vehicle_prestart_submissions') is not null then
    drop trigger if exists vehicle_prestart_manager_alert_fields_guard on public.vehicle_prestart_submissions;
    create trigger vehicle_prestart_manager_alert_fields_guard
      before insert or update on public.vehicle_prestart_submissions
      for each row
      execute function public.protect_vehicle_prestart_manager_alert_fields();
  end if;
end $$;

do $$
begin
  if to_regclass('public.vehicle_prestart_submissions') is not null then
    drop policy if exists "Employees can finalise own pending vehicle prestarts" on public.vehicle_prestart_submissions;

    create policy "Employees can finalise own pending vehicle prestarts"
    on public.vehicle_prestart_submissions
    for update
    to authenticated
    using (
      submitted_status = 'pdf_pending'
      and pdf_path is null
      and (
        employee_profile_id = auth.uid()
        or signed_off_employee_profile_id = auth.uid()
        or submitted_by_user_id = auth.uid()
      )
    )
    with check (
      submitted_status = 'submitted'
      and pdf_path is not null
      and submitted_by_user_id = auth.uid()
      and manager_alert_status in ('pending', 'not_required')
      and manager_alert_sent_at is null
      and manager_alert_last_attempt_at is null
      and manager_alert_attempts = 0
      and manager_alert_recipient is null
      and manager_alert_reply_to is null
      and manager_alert_provider_message_id is null
      and manager_alert_error is null
      and (
        employee_profile_id = auth.uid()
        or signed_off_employee_profile_id = auth.uid()
        or submitted_by_user_id = auth.uid()
      )
    );
  end if;
end $$;
