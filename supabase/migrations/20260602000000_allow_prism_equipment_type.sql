begin;

alter table public.equipment_register
drop constraint if exists equipment_register_equipment_type_check;

alter table public.equipment_register
add constraint equipment_register_equipment_type_check
check (
  equipment_type in (
    'Computer',
    'Controller',
    'Digital Level',
    'Disto',
    'GNSS Antenna',
    'Metal Detector',
    'Phone',
    'Prism',
    'Radio Handle',
    'Total Station',
    'Vehicle'
  )
);

commit;
