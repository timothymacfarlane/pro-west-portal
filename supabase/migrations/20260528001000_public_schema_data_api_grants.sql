grant usage on schema public to authenticated, service_role;

do $$
declare
  table_name text;
  portal_tables text[] := array[
    'clients',
    'jobs',
    'profiles',
    'timesheet_entries',
    'timesheet_locks',
    'schedule_assignments',
    'schedule_people',
    'job_planning_entries',
    'job_planning_unscheduled',
    'documents',
    'document_favourites',
    'document_versions',
    'jobs_legacy_raw',
    'job_reassign_log',
    'map_notes',
    'notifications',
    'vehicle_prestart_submissions',
    'take5_submissions',
    'shopping_list_items',
    'equipment_register',
    'equipment_service_attachments',
    'equipment_service_history'
  ];
begin
  foreach table_name in array portal_tables loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format(
        'grant select, insert, update, delete on table public.%I to authenticated',
        table_name
      );
      execute format(
        'grant all privileges on table public.%I to service_role',
        table_name
      );
    end if;
  end loop;
end $$;

grant usage, select on all sequences in schema public to authenticated;
grant all privileges on all sequences in schema public to service_role;
