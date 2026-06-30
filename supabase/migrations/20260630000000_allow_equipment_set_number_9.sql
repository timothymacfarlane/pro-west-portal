begin;

alter table public.equipment_register
drop constraint if exists equipment_register_set_number_check;

alter table public.equipment_register
add constraint equipment_register_set_number_check
check (set_number is null or set_number in (5, 6, 7, 8, 9));

commit;
