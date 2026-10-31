-- Keep existing per-job numbers (including historical duplicates) unchanged.
-- All new inserts, including those from older portal clients, receive a number
-- while holding a transaction-scoped lock for that job.
create index if not exists take5_submissions_job_number_number_idx
  on public.take5_submissions (job_number, take5_number desc);

create or replace function public.assign_take5_number()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  next_number integer;
begin
  if new.job_number is null or pg_catalog.btrim(new.job_number) = '' then
    raise exception 'A job number is required for a Take 5 submission.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('take5-number:' || new.job_number, 0)
  );

  select coalesce(max(submission.take5_number), 0) + 1
    into next_number
  from public.take5_submissions as submission
  where submission.job_number = new.job_number;

  if new.take5_number is not null and new.take5_number <> next_number then
    raise exception 'Take 5 number is stale. Refresh the portal before submitting.';
  end if;
  new.take5_number := next_number;

  new.form_data := pg_catalog.jsonb_set(
    coalesce(new.form_data, '{}'::jsonb),
    '{take5Number}',
    pg_catalog.to_jsonb(new.take5_number),
    true
  );
  return new;
end;
$$;

drop trigger if exists assign_take5_number_before_insert on public.take5_submissions;
create trigger assign_take5_number_before_insert
before insert on public.take5_submissions
for each row execute function public.assign_take5_number();

-- The client supplies a stable UUID. If the response to the first call is lost,
-- repeating the call returns the original row and number instead of inserting.
create or replace function public.create_take5_submission(
  p_submission_id uuid,
  p_job_number text,
  p_employee_name text,
  p_form_data jsonb
)
returns table (
  id uuid,
  job_number text,
  employee_name text,
  take5_number integer,
  form_data jsonb,
  pdf_path text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved public.take5_submissions%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in before submitting a Take 5.';
  end if;
  if p_submission_id is null or pg_catalog.btrim(coalesce(p_job_number, '')) = ''
      or pg_catalog.btrim(coalesce(p_employee_name, '')) = '' then
    raise exception 'Submission ID, job number, and employee name are required.';
  end if;

  insert into public.take5_submissions (
    id, job_number, employee_name, form_data, created_by
  )
  values (
    p_submission_id, p_job_number, p_employee_name,
    coalesce(p_form_data, '{}'::jsonb), (select auth.uid())
  )
  on conflict (id) do nothing
  returning * into saved;

  if saved.id is null then
    select submission.* into saved
    from public.take5_submissions as submission
    where submission.id = p_submission_id;
  end if;

  if saved.id is null or saved.created_by is distinct from (select auth.uid())
      or saved.job_number is distinct from p_job_number then
    raise exception 'The saved Take 5 submission could not be recovered.';
  end if;

  return query select saved.id, saved.job_number, saved.employee_name,
    saved.take5_number, saved.form_data, saved.pdf_path;
end;
$$;

revoke all on function public.create_take5_submission(uuid, text, text, jsonb)
  from public, anon;
grant execute on function public.create_take5_submission(uuid, text, text, jsonb)
  to authenticated, service_role;

notify pgrst, 'reload schema';
