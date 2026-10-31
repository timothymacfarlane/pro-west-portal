-- The RETURNS TABLE column "id" is also a PL/pgSQL output variable, so name
-- the primary-key constraint explicitly in ON CONFLICT.
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
  on conflict on constraint take5_submissions_pkey do nothing
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

notify pgrst, 'reload schema';
