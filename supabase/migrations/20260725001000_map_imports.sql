create extension if not exists pgcrypto;

create table if not exists public.map_imports (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  file_type text not null check (file_type in ('csv', 'dxf')),
  job_id uuid null references public.jobs(id) on delete set null,
  job_number text null,
  source_projection_key text not null,
  source_projection_parameters jsonb null,
  feature_count integer not null default 0 check (feature_count >= 0),
  vertex_count integer null check (vertex_count is null or vertex_count >= 0),
  bounds jsonb not null,
  original_filename text not null,
  original_storage_path text not null unique,
  processed_storage_path text not null unique,
  processed_format text not null default 'geojson',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_map_imports_created_at
  on public.map_imports (created_at desc);

create index if not exists idx_map_imports_job_id
  on public.map_imports (job_id);

create index if not exists idx_map_imports_created_by
  on public.map_imports (created_by);

drop trigger if exists set_map_imports_updated_at on public.map_imports;
create trigger set_map_imports_updated_at
before update on public.map_imports
for each row
execute function public.set_updated_at();

alter table public.map_imports enable row level security;

drop policy if exists "Active portal users can view map imports" on public.map_imports;
create policy "Active portal users can view map imports"
on public.map_imports
for select
to authenticated
using (public.is_active_portal_user());

drop policy if exists "Active portal users can create map imports" on public.map_imports;
create policy "Active portal users can create map imports"
on public.map_imports
for insert
to authenticated
with check (
  public.is_active_portal_user()
  and created_by = auth.uid()
);

drop policy if exists "Creators and admins can update map imports" on public.map_imports;
create policy "Creators and admins can update map imports"
on public.map_imports
for update
to authenticated
using (
  public.is_admin()
  or created_by = auth.uid()
)
with check (
  public.is_admin()
  or created_by = auth.uid()
);

drop policy if exists "Creators and admins can delete map imports" on public.map_imports;
create policy "Creators and admins can delete map imports"
on public.map_imports
for delete
to authenticated
using (
  public.is_admin()
  or created_by = auth.uid()
);

grant select, insert, update, delete on table public.map_imports to authenticated;
grant all privileges on table public.map_imports to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'map-imports',
  'map-imports',
  false,
  20971520,
  array[
    'application/dxf',
    'application/geo+json',
    'application/json',
    'application/octet-stream',
    'image/vnd.dxf',
    'text/csv',
    'text/plain'
  ]
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Active portal users can view map import files" on storage.objects;
create policy "Active portal users can view map import files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'map-imports'
  and public.is_active_portal_user()
);

drop policy if exists "Active portal users can upload map import files" on storage.objects;
create policy "Active portal users can upload map import files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'map-imports'
  and public.is_active_portal_user()
);

drop policy if exists "Creators and admins can update map import files" on storage.objects;
create policy "Creators and admins can update map import files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'map-imports'
  and (
    public.is_admin()
    or exists (
      select 1
      from public.map_imports map_import
      where map_import.created_by = auth.uid()
        and (
          map_import.original_storage_path = storage.objects.name
          or map_import.processed_storage_path = storage.objects.name
        )
    )
  )
)
with check (
  bucket_id = 'map-imports'
  and public.is_active_portal_user()
);

drop policy if exists "Creators and admins can delete map import files" on storage.objects;
create policy "Creators and admins can delete map import files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'map-imports'
  and (
    public.is_admin()
    or exists (
      select 1
      from public.map_imports map_import
      where map_import.created_by = auth.uid()
        and (
          map_import.original_storage_path = storage.objects.name
          or map_import.processed_storage_path = storage.objects.name
        )
    )
  )
);
