create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'track_processing_status') then
    create type public.track_processing_status as enum (
      'draft',
      'uploaded',
      'processing',
      'ready',
      'failed',
      'archived'
    );
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'music-assets',
  'music-assets',
  true,
  52428800,
  array['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.tracks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text,
  storage_path text not null,
  audio_url text,
  bpm integer,
  duration_ms integer,
  processing_status public.track_processing_status not null default 'draft',
  is_published boolean not null default false,
  level_map jsonb,
  processing_error text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tracks_bpm_reasonable check (bpm is null or bpm between 30 and 220),
  constraint tracks_duration_positive check (duration_ms is null or duration_ms > 0),
  constraint tracks_ready_has_level_map check (processing_status <> 'ready' or level_map is not null),
  constraint tracks_level_map_events_array check (
    level_map is null
    or jsonb_typeof(level_map -> 'events') = 'array'
  )
);

create index if not exists tracks_ready_public_idx
  on public.tracks (is_published, processing_status, created_at desc);

create index if not exists tracks_level_map_gin_idx
  on public.tracks using gin (level_map);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_music_flow_admin()
returns boolean
language sql
stable
as $$
  select coalesce(
    (auth.jwt() ->> 'role') = 'admin'
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (auth.jwt() -> 'app_metadata' ->> 'music_flow_admin') = 'true',
    false
  );
$$;

drop trigger if exists set_tracks_updated_at on public.tracks;
create trigger set_tracks_updated_at
before update on public.tracks
for each row
execute function public.set_updated_at();

create or replace view public.ready_tracks as
select
  id,
  title,
  artist,
  audio_url,
  bpm,
  duration_ms,
  level_map,
  created_at,
  updated_at
from public.tracks
where processing_status = 'ready'
  and is_published = true;

grant usage on schema public to anon, authenticated;
grant all on public.tracks to anon, authenticated;
grant select on public.ready_tracks to anon, authenticated;

-- Fast MVP mode: keep the content table open so the prototype can move quickly.
-- Tighten this in a later migration before inviting untrusted users.
alter table public.tracks disable row level security;

drop policy if exists "MVP public can read tracks" on public.tracks;
create policy "MVP public can read tracks"
on public.tracks
for select
to anon, authenticated
using (true);

drop policy if exists "MVP public can write tracks" on public.tracks;
create policy "MVP public can write tracks"
on public.tracks
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Service role can manage tracks" on public.tracks;
create policy "Service role can manage tracks"
on public.tracks
for all
to service_role
using (true)
with check (true);

drop policy if exists "MVP public can read music assets" on storage.objects;
create policy "MVP public can read music assets"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'music-assets');

drop policy if exists "MVP public can upload music assets" on storage.objects;
create policy "MVP public can upload music assets"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'music-assets');

drop policy if exists "MVP public can update music assets" on storage.objects;
create policy "MVP public can update music assets"
on storage.objects
for update
to anon, authenticated
using (bucket_id = 'music-assets')
with check (bucket_id = 'music-assets');

drop policy if exists "MVP public can delete music assets" on storage.objects;
create policy "MVP public can delete music assets"
on storage.objects
for delete
to anon, authenticated
using (bucket_id = 'music-assets');

drop policy if exists "Service role can manage music assets" on storage.objects;
create policy "Service role can manage music assets"
on storage.objects
for all
to service_role
using (bucket_id = 'music-assets')
with check (bucket_id = 'music-assets');
