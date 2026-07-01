alter table public.equipment_register
add column if not exists vehicle_last_service_odometer integer;
