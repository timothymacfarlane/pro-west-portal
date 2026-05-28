create extension if not exists pgcrypto;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and coalesce(is_active, true) = true
  );
$$;

grant execute on function public.is_admin() to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.equipment_register (
  id uuid primary key default gen_random_uuid(),
  equipment_type text not null check (
    equipment_type in (
      'Computer',
      'Controller',
      'Digital Level',
      'Disto',
      'GNSS Antenna',
      'Metal Detector',
      'Phone',
      'Radio Handle',
      'Total Station',
      'Vehicle'
    )
  ),
  make text not null,
  model text not null,
  year integer check (year is null or (year between 1900 and 2100)),
  serial_number text,
  registration_number text,
  assigned_to uuid references public.profiles(id) on delete set null,
  set_number integer check (set_number is null or set_number in (5, 6, 7, 8)),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.equipment_service_history (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment_register(id) on delete cascade,
  service_date date not null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.equipment_service_attachments (
  id uuid primary key default gen_random_uuid(),
  service_history_id uuid not null references public.equipment_service_history(id) on delete cascade,
  file_name text not null,
  mime_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  storage_path text not null unique,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_equipment_register_type
  on public.equipment_register (equipment_type);

create index if not exists idx_equipment_register_assigned_to
  on public.equipment_register (assigned_to);

create index if not exists idx_equipment_register_serial_number
  on public.equipment_register (serial_number);

create index if not exists idx_equipment_register_registration_number
  on public.equipment_register (registration_number);

create index if not exists idx_equipment_service_history_equipment_date
  on public.equipment_service_history (equipment_id, service_date desc);

create index if not exists idx_equipment_service_attachments_history
  on public.equipment_service_attachments (service_history_id);

create index if not exists idx_equipment_service_attachments_storage_path
  on public.equipment_service_attachments (storage_path);

drop trigger if exists set_equipment_register_updated_at on public.equipment_register;
create trigger set_equipment_register_updated_at
before update on public.equipment_register
for each row
execute function public.set_updated_at();

drop trigger if exists set_equipment_service_history_updated_at on public.equipment_service_history;
create trigger set_equipment_service_history_updated_at
before update on public.equipment_service_history
for each row
execute function public.set_updated_at();

alter table public.equipment_register enable row level security;
alter table public.equipment_service_history enable row level security;
alter table public.equipment_service_attachments enable row level security;

drop policy if exists "Authenticated users can view equipment" on public.equipment_register;
create policy "Authenticated users can view equipment"
on public.equipment_register
for select
to authenticated
using (true);

drop policy if exists "Admins can insert equipment" on public.equipment_register;
create policy "Admins can insert equipment"
on public.equipment_register
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update equipment" on public.equipment_register;
create policy "Admins can update equipment"
on public.equipment_register
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete equipment" on public.equipment_register;
create policy "Admins can delete equipment"
on public.equipment_register
for delete
to authenticated
using (public.is_admin());

drop policy if exists "Authenticated users can view equipment service history" on public.equipment_service_history;
create policy "Authenticated users can view equipment service history"
on public.equipment_service_history
for select
to authenticated
using (true);

drop policy if exists "Admins can insert equipment service history" on public.equipment_service_history;
create policy "Admins can insert equipment service history"
on public.equipment_service_history
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update equipment service history" on public.equipment_service_history;
create policy "Admins can update equipment service history"
on public.equipment_service_history
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete equipment service history" on public.equipment_service_history;
create policy "Admins can delete equipment service history"
on public.equipment_service_history
for delete
to authenticated
using (public.is_admin());

drop policy if exists "Authenticated users can view equipment service attachments" on public.equipment_service_attachments;
create policy "Authenticated users can view equipment service attachments"
on public.equipment_service_attachments
for select
to authenticated
using (true);

drop policy if exists "Admins can insert equipment service attachments" on public.equipment_service_attachments;
create policy "Admins can insert equipment service attachments"
on public.equipment_service_attachments
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can delete equipment service attachments" on public.equipment_service_attachments;
create policy "Admins can delete equipment service attachments"
on public.equipment_service_attachments
for delete
to authenticated
using (public.is_admin());

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'equipment-files',
  'equipment-files',
  false,
  15728640,
  array[
    'application/msword',
    'application/pdf',
    'application/rtf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/gif',
    'image/heic',
    'image/heif',
    'image/jpeg',
    'image/png',
    'image/webp',
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

drop policy if exists "Authenticated users can view equipment files" on storage.objects;
create policy "Authenticated users can view equipment files"
on storage.objects
for select
to authenticated
using (bucket_id = 'equipment-files');

drop policy if exists "Admins can upload equipment files" on storage.objects;
create policy "Admins can upload equipment files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'equipment-files'
  and public.is_admin()
);

drop policy if exists "Admins can update equipment files" on storage.objects;
create policy "Admins can update equipment files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'equipment-files'
  and public.is_admin()
)
with check (
  bucket_id = 'equipment-files'
  and public.is_admin()
);

drop policy if exists "Admins can delete equipment files" on storage.objects;
create policy "Admins can delete equipment files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'equipment-files'
  and public.is_admin()
);
