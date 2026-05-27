create extension if not exists pgcrypto;

create table if not exists public.family_member_statuses (
  member_key text primary key,
  display_name text not null,
  relation text,
  status_text text not null default '未更新',
  mood text,
  location_text text,
  note text,
  call_time text,
  need_call boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.family_messages (
  id uuid primary key default gen_random_uuid(),
  author_key text not null,
  author_name text not null,
  target text not null default '全家',
  kind text not null default '日常',
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.family_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  detail text,
  assignee text not null default '全家',
  priority text not null default '中',
  due_date date,
  done boolean not null default false,
  created_by_key text,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.family_moments (
  id uuid primary key default gen_random_uuid(),
  author_key text not null,
  author_name text not null,
  title text not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.family_files (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null references public.family_moments(id) on delete cascade,
  name text not null,
  storage_path text not null,
  size bigint,
  mime_type text,
  created_at timestamptz not null default now()
);

alter table public.family_member_statuses enable row level security;
alter table public.family_messages enable row level security;
alter table public.family_tasks enable row level security;
alter table public.family_moments enable row level security;
alter table public.family_files enable row level security;

drop policy if exists family_statuses_read on public.family_member_statuses;
create policy family_statuses_read on public.family_member_statuses
for select to anon, authenticated using (true);

drop policy if exists family_statuses_insert on public.family_member_statuses;
create policy family_statuses_insert on public.family_member_statuses
for insert to anon, authenticated with check (true);

drop policy if exists family_statuses_update on public.family_member_statuses;
create policy family_statuses_update on public.family_member_statuses
for update to anon, authenticated using (true) with check (true);

drop policy if exists family_statuses_delete on public.family_member_statuses;
create policy family_statuses_delete on public.family_member_statuses
for delete to anon, authenticated using (true);

drop policy if exists family_messages_read on public.family_messages;
create policy family_messages_read on public.family_messages
for select to anon, authenticated using (true);

drop policy if exists family_messages_insert on public.family_messages;
create policy family_messages_insert on public.family_messages
for insert to anon, authenticated with check (true);

drop policy if exists family_messages_delete on public.family_messages;
create policy family_messages_delete on public.family_messages
for delete to anon, authenticated using (true);

drop policy if exists family_tasks_read on public.family_tasks;
create policy family_tasks_read on public.family_tasks
for select to anon, authenticated using (true);

drop policy if exists family_tasks_insert on public.family_tasks;
create policy family_tasks_insert on public.family_tasks
for insert to anon, authenticated with check (true);

drop policy if exists family_tasks_update on public.family_tasks;
create policy family_tasks_update on public.family_tasks
for update to anon, authenticated using (true) with check (true);

drop policy if exists family_tasks_delete on public.family_tasks;
create policy family_tasks_delete on public.family_tasks
for delete to anon, authenticated using (true);

drop policy if exists family_moments_read on public.family_moments;
create policy family_moments_read on public.family_moments
for select to anon, authenticated using (true);

drop policy if exists family_moments_insert on public.family_moments;
create policy family_moments_insert on public.family_moments
for insert to anon, authenticated with check (true);

drop policy if exists family_moments_delete on public.family_moments;
create policy family_moments_delete on public.family_moments
for delete to anon, authenticated using (true);

drop policy if exists family_files_read on public.family_files;
create policy family_files_read on public.family_files
for select to anon, authenticated using (true);

drop policy if exists family_files_insert on public.family_files;
create policy family_files_insert on public.family_files
for insert to anon, authenticated with check (true);

drop policy if exists family_files_delete on public.family_files;
create policy family_files_delete on public.family_files
for delete to anon, authenticated using (true);

insert into storage.buckets (id, name, public)
values ('mathmodel-files', 'mathmodel-files', false)
on conflict (id) do nothing;

drop policy if exists family_storage_read on storage.objects;
create policy family_storage_read on storage.objects
for select to anon, authenticated
using (
  bucket_id = 'mathmodel-files'
  and (storage.foldername(name))[1] = 'family_site'
);

drop policy if exists family_storage_insert on storage.objects;
create policy family_storage_insert on storage.objects
for insert to anon, authenticated
with check (
  bucket_id = 'mathmodel-files'
  and (storage.foldername(name))[1] = 'family_site'
);

drop policy if exists family_storage_update on storage.objects;
create policy family_storage_update on storage.objects
for update to anon, authenticated
using (
  bucket_id = 'mathmodel-files'
  and (storage.foldername(name))[1] = 'family_site'
)
with check (
  bucket_id = 'mathmodel-files'
  and (storage.foldername(name))[1] = 'family_site'
);

drop policy if exists family_storage_delete on storage.objects;
create policy family_storage_delete on storage.objects
for delete to anon, authenticated
using (
  bucket_id = 'mathmodel-files'
  and (storage.foldername(name))[1] = 'family_site'
);

insert into public.family_member_statuses
  (member_key, display_name, relation, status_text, mood, location_text, note, call_time, need_call)
values
  ('father', '父亲', '父亲', '未更新', '', '', '', '', false),
  ('mother', '母亲', '母亲', '未更新', '', '', '', '', false),
  ('me', '我', '在外地上大学', '平安，在忙', '安稳', '', '我在外地也会好好吃饭，看到消息会回。', '', false),
  ('grandma', '奶奶', '奶奶', '未更新', '安稳', '', '', '', false)
on conflict (member_key) do nothing;
