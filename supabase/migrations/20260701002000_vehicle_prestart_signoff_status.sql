do $$
begin
  if to_regclass('public.vehicle_prestart_submissions') is not null then
    alter table public.vehicle_prestart_submissions
    add column if not exists employee_signed_off boolean,
    add column if not exists employee_signed_off_at timestamptz,
    add column if not exists signed_off_employee_profile_id uuid references public.profiles(id) on delete set null,
    add column if not exists signed_off_employee_name text,
    add column if not exists submitted_status text,
    add column if not exists submitted_at timestamptz;
  end if;
end $$;
