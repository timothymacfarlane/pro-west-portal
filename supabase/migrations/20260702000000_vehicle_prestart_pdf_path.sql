do $$
begin
  if to_regclass('public.vehicle_prestart_submissions') is not null then
    alter table public.vehicle_prestart_submissions
    add column if not exists pdf_path text;
  end if;
end $$;
