-- Shared cache of hospital phone numbers found by web search.
-- Each place is looked up once and then served to everyone nearby, which keeps the
-- free AI quota for real questions. Only the AI Edge Function (service role) can
-- read or write it; RLS is on with no policies, so app users have no direct access.

create table if not exists public.hospital_phone_cache (
  key        text primary key,          -- normalised "name|address"
  name       text not null,
  phone      text,                      -- null = searched, nothing found
  source     text,                      -- page the number was found on
  updated_at timestamptz not null default now()
);

alter table public.hospital_phone_cache enable row level security;
