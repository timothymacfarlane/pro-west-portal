do $$
begin
  if to_regclass('public.vehicle_prestart_submissions') is not null then
    drop policy if exists "Employees can view own vehicle prestarts" on public.vehicle_prestart_submissions;
    create policy "Employees can view own vehicle prestarts"
    on public.vehicle_prestart_submissions
    for select
    to authenticated
    using (
      employee_profile_id = auth.uid()
      or signed_off_employee_profile_id = auth.uid()
    );

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
      )
    )
    with check (
      submitted_status = 'submitted'
      and pdf_path is not null
      and (
        employee_profile_id = auth.uid()
        or signed_off_employee_profile_id = auth.uid()
      )
    );
  end if;
end $$;
