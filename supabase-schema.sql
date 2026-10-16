-- ============================================================================
-- Bookshelf — Supabase schema
-- Run this once in your Supabase project's SQL Editor (Project → SQL Editor
-- → New query → paste this whole file → Run). Safe to run more than once —
-- every statement is idempotent (uses IF NOT EXISTS / DROP...IF EXISTS
-- first), so re-running it after a partial failure, or just to double-check,
-- won't error out with "already exists".
--
-- Creates:
--   - libraries: named collections owned by a user (mirrors the old
--     localStorage-based "profiles" feature — e.g. "Home", "Classroom")
--   - books: one row per book, always belonging to exactly one library.
--     `id` is TEXT, not UUID — the app generates its own string ids
--     client-side (e.g. "b_1699999999999_123"), so the column has to match
--     that format rather than requiring real UUIDs.
--   - Row Level Security policies so each signed-in user can only ever
--     see/edit/delete their OWN libraries and books — enforced by Postgres
--     itself, not by application code
--   - a public "covers" storage bucket, with policies so a user can only
--     upload/modify/delete files under their own user-id folder, but anyone
--     with the link can view a cover image (needed so <img> tags work)
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── Libraries (named collections, e.g. "Home", "Classroom") ─────────────────
create table if not exists libraries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table libraries enable row level security;

drop policy if exists "Users manage their own libraries" on libraries;
create policy "Users manage their own libraries"
  on libraries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Books ─────────────────────────────────────────────────────────────────
-- Column names are snake_case (Postgres convention); js/db.js maps these
-- to/from the app's existing camelCase field names (seriesName, ageRange,
-- coverUrl, addedAt, etc.) so nothing else in the app has to change.
create table if not exists books (
  id text primary key,
  library_id uuid not null references libraries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, -- redundant, but keeps RLS on this table self-contained
  title text not null,
  subtitle text,
  author text,
  isbn text,
  genre text,
  subgenre text,
  year text,
  subjects text,
  series_name text,
  series_num text,
  age_range text,
  grade text,
  status text default 'Unread',
  condition text,
  format text,
  pages text,
  quantity integer default 1,
  location text,
  publisher text,
  language text,
  cover_url text,
  description text,
  notes text,
  rating integer default 0,
  added_at bigint,
  created_at timestamptz not null default now()
);

create index if not exists books_library_id_idx on books(library_id);
create index if not exists books_user_id_idx on books(user_id);

alter table books enable row level security;

-- WITH CHECK verifies both that user_id matches AND that library_id actually
-- points to a library owned by that same user — checking user_id alone
-- would let someone insert a row with their own user_id but a library_id
-- belonging to a different user's library.
drop policy if exists "Users manage their own books" on books;
create policy "Users manage their own books"
  on books for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from libraries l
      where l.id = books.library_id and l.user_id = auth.uid()
    )
  );

-- ── Storage bucket for cover images ──────────────────────────────────────────
-- Files are stored at path "<user_id>/<book_id>.jpg" — the policies below key
-- off that first path segment to restrict writes to your own folder, while
-- allowing public reads so <img src="..."> tags work without auth headers.
insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do nothing;

drop policy if exists "Anyone can view covers" on storage.objects;
create policy "Anyone can view covers"
  on storage.objects for select
  using (bucket_id = 'covers');

drop policy if exists "Users upload covers into their own folder" on storage.objects;
create policy "Users upload covers into their own folder"
  on storage.objects for insert
  with check (bucket_id = 'covers' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Users update their own covers" on storage.objects;
create policy "Users update their own covers"
  on storage.objects for update
  using (bucket_id = 'covers' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Users delete their own covers" on storage.objects;
create policy "Users delete their own covers"
  on storage.objects for delete
  using (bucket_id = 'covers' and auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================================
-- Admin roles
--
-- A user is a "member" by default (only ever sees/edits their own data —
-- unchanged from before). An "admin" can see and manage EVERY user's
-- libraries and books, in addition to their own.
--
-- There is deliberately no way for a user to grant themselves admin from
-- the app — the `user_roles` table only allows a user to READ their own
-- role, never write it. To make someone an admin, run this once yourself
-- in the Supabase SQL Editor, after they've signed up at least once:
--
--   insert into user_roles (user_id, role)
--   values ('<their auth.users.id, from Authentication > Users>', 'admin')
--   on conflict (user_id) do update set role = 'admin';
-- ============================================================================

create table if not exists user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now()
);

alter table user_roles enable row level security;

drop policy if exists "Users can read their own role" on user_roles;
create policy "Users can read their own role"
  on user_roles for select
  using (auth.uid() = user_id);

-- security definer so this can be called from inside other tables' RLS
-- policies without tripping over user_roles' own RLS while checking it
create or replace function is_admin(uid uuid) returns boolean as $$
  select exists (select 1 from user_roles where user_id = uid and role = 'admin');
$$ language sql stable security definer set search_path = public;

-- Re-point libraries/books RLS to also allow admins through, on top of the
-- existing "it's your own data" rule.
drop policy if exists "Users manage their own libraries" on libraries;
create policy "Users manage their own libraries"
  on libraries for all
  using (auth.uid() = user_id or is_admin(auth.uid()))
  with check (auth.uid() = user_id or is_admin(auth.uid()));

drop policy if exists "Users manage their own books" on books;
create policy "Users manage their own books"
  on books for all
  using (auth.uid() = user_id or is_admin(auth.uid()))
  with check (
    (auth.uid() = user_id or is_admin(auth.uid()))
    and exists (
      select 1 from libraries l
      where l.id = books.library_id
      and (l.user_id = auth.uid() or is_admin(auth.uid()))
    )
  );

-- ── New book fields: reading dates, tags, loans, reading queue ──────────────
alter table books add column if not exists start_date date;
alter table books add column if not exists finish_date date;
alter table books add column if not exists tags text;
alter table books add column if not exists loaned_to text;
alter table books add column if not exists loaned_date date;
alter table books add column if not exists queued boolean not null default false;
alter table books add column if not exists queue_order integer;

-- ── Reading goals (one active goal per library at a time) ───────────────────
create table if not exists reading_goals (
  library_id uuid primary key references libraries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  year integer not null,
  target integer not null,
  updated_at timestamptz not null default now()
);

alter table reading_goals enable row level security;

drop policy if exists "Users manage their own reading goals" on reading_goals;
create policy "Users manage their own reading goals"
  on reading_goals for all
  using (auth.uid() = user_id or is_admin(auth.uid()))
  with check (auth.uid() = user_id or is_admin(auth.uid()));

-- ── Admin helper: look up user emails (for the admin "browse all libraries"
-- screen). auth.users isn't queryable directly from the client SDK, and
-- shouldn't be — this exposes only id+email, and only to an actual admin
-- (the WHERE clause returns nothing at all for anyone else).
create or replace function admin_list_users()
returns table(user_id uuid, email text) as $$
  select u.id, u.email
  from auth.users u
  where is_admin(auth.uid());
$$ language sql stable security definer set search_path = public;

grant execute on function admin_list_users() to authenticated;

-- ── Table permissions for signed-in users ───────────────────────────────────
-- Newer Supabase projects do NOT automatically let the API roles use tables
-- you create in the SQL Editor — without these grants every request fails with
-- "permission denied for table … [42501]". The grants only open the door to
-- the table; Row Level Security (the policies above) still decides which rows
-- each person can see or change. "anon" (not signed in) gets nothing.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.libraries     to authenticated;
grant select, insert, update, delete on public.books         to authenticated;
grant select, insert, update, delete on public.reading_goals to authenticated;
grant select                         on public.user_roles    to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
