-- Arogya AI: bring the existing Supabase tables up to what the app needs.
-- Safe to run on the existing project: it only ADDS things (columns, defaults,
-- indexes, security policies). It never drops or renames columns or deletes data.
-- It also creates the tables from scratch on a brand-new project.

create extension if not exists pgcrypto;

-- ---------- tables (created only if missing) ----------

create table if not exists public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users (id) on delete cascade,
  created_at      timestamptz default now(),
  conversation_id text,
  role            text,
  content         text,
  language        text default 'en'
);

create table if not exists public.symptom_checks (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users (id) on delete cascade,
  created_at          timestamptz default now(),
  symptoms            text,
  duration            text,
  severity            text,
  analysis            text,
  risk_level          text,
  possible_conditions text[]
);

create table if not exists public.health_reports (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users (id) on delete cascade,
  created_at        timestamptz default now(),
  title             text,
  file_url          text,
  file_type         text,
  summary           text,
  key_findings      text[],
  risk_factors      text[],
  suggested_actions text[]
);

create table if not exists public.emergency_contacts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users (id) on delete cascade,
  created_at   timestamptz default now(),
  name         text,
  phone        text,
  relationship text,
  is_primary   boolean default false
);

create table if not exists public.medicine_reminders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users (id) on delete cascade,
  created_at    timestamptz default now(),
  medicine_name text,
  dosage        text,
  frequency     text,
  time_slots    text[],
  start_date    date,
  end_date      date,
  notes         text,
  is_active     boolean default true
);

-- ---------- columns the new AI features save ----------

alter table public.symptom_checks add column if not exists recommendations text[] default '{}';
alter table public.symptom_checks add column if not exists when_to_seek_help text;
-- Reports now live in a PRIVATE bucket, so we store the file's path, not a public URL.
alter table public.health_reports add column if not exists file_path text;

-- ---------- every row belongs to whoever is signed in when it's created ----------

do $$
declare t text;
begin
  foreach t in array array[
    'chat_messages', 'symptom_checks', 'health_reports',
    'emergency_contacts', 'medicine_reminders'
  ] loop
    execute format('alter table public.%I alter column user_id set default auth.uid()', t);
    execute format('alter table public.%I alter column created_at set default now()', t);
    execute format('create index if not exists %I on public.%I (user_id, created_at desc)', t || '_user_created_idx', t);
  end loop;
end $$;

create index if not exists chat_messages_user_conv_idx
  on public.chat_messages (user_id, conversation_id, created_at);

-- ---------- row level security: users only ever see their own rows ----------
-- (chat_messages already had a correct policy; the other four tables had RLS on
-- but NO policy, which blocked the app from reading or saving anything.)

do $$
declare t text;
begin
  foreach t in array array[
    'chat_messages', 'symptom_checks', 'health_reports',
    'emergency_contacts', 'medicine_reminders'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner_all" on public.%I', t);
    execute format(
      'create policy "owner_all" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ---------- private storage for uploaded medical reports ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'health-reports', 'health-reports', false, 20971520,  -- 20 MB
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = false,  -- this bucket was public: anyone with a link could open a report
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Files live at "<user id>/<file>", and only that user can touch them.
drop policy if exists "reports_owner_select" on storage.objects;
create policy "reports_owner_select" on storage.objects for select to authenticated
  using (bucket_id = 'health-reports' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "reports_owner_insert" on storage.objects;
create policy "reports_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'health-reports' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "reports_owner_delete" on storage.objects;
create policy "reports_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'health-reports' and (storage.foldername(name))[1] = (select auth.uid())::text);
