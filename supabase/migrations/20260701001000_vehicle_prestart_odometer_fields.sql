do $$
begin
  if to_regclass('public.vehicle_prestart_submissions') is not null then
    alter table public.vehicle_prestart_submissions
    add column if not exists vehicle_equipment_id uuid references public.equipment_register(id) on delete set null,
    add column if not exists employee_profile_id uuid references public.profiles(id) on delete set null,
    add column if not exists last_service_odometer integer,
    add column if not exists next_service_odometer integer;
  end if;
end $$;

do $$
begin
  if to_regclass('public.vehicle_prestart_submissions') is not null and not exists (
    select 1
    from pg_constraint
    where conname = 'vehicle_prestart_submissions_last_service_odometer_check'
  ) then
    alter table public.vehicle_prestart_submissions
    add constraint vehicle_prestart_submissions_last_service_odometer_check
      check (last_service_odometer is null or last_service_odometer >= 0);
  end if;
end $$;

do $$
begin
  if to_regclass('public.vehicle_prestart_submissions') is not null and not exists (
    select 1
    from pg_constraint
    where conname = 'vehicle_prestart_submissions_next_service_odometer_check'
  ) then
    alter table public.vehicle_prestart_submissions
    add constraint vehicle_prestart_submissions_next_service_odometer_check
      check (next_service_odometer is null or next_service_odometer >= 0);
  end if;
end $$;
