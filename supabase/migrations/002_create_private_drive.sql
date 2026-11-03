-- The original public demo used a different drive_items shape. Preserve it
-- instead of letting CREATE TABLE IF NOT EXISTS silently reuse incompatible
-- columns.
do $$
begin
  if to_regclass('public.drive_items') is not null
     and not exists (
       select 1
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'drive_items'
          and column_name = 'workspace_id'
     ) then
    if to_regclass('public.drive_items_legacy') is not null then
      raise exception 'Both drive_items and drive_items_legacy exist; resolve this migration manually';
    end if;
    alter table public.drive_items rename to drive_items_legacy;
  end if;
end;
$$;

create table if not exists public.drive_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.drive_members (
  workspace_id uuid not null references public.drive_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.drive_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.drive_workspaces(id) on delete cascade,
  parent_id uuid references public.drive_items(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 255),
  item_type text not null check (item_type in ('folder', 'file', 'document')),
  storage_key text,
  mime_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  content text not null default '',
  upload_status text not null default 'complete'
    check (upload_status in ('pending', 'complete', 'failed')),
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint drive_items_content_limit check (char_length(content) <= 200000),
  constraint drive_items_file_metadata check (
    (item_type = 'folder' and storage_key is null and size_bytes = 0)
    or item_type in ('file', 'document')
  )
);

create index if not exists drive_members_user_idx
  on public.drive_members (user_id, workspace_id);
create index if not exists drive_items_parent_idx
  on public.drive_items (workspace_id, parent_id, item_type, name);

alter table public.drive_workspaces enable row level security;
alter table public.drive_members enable row level security;
alter table public.drive_items enable row level security;

create or replace function public.is_drive_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
  select 1
    from public.drive_members as dm
   where dm.workspace_id = target_workspace_id
     and dm.user_id = auth.uid()
);
$$;

revoke all on function public.is_drive_member(uuid) from public;
grant execute on function public.is_drive_member(uuid) to authenticated;

drop policy if exists "Members can read drive workspaces" on public.drive_workspaces;
create policy "Members can read drive workspaces" on public.drive_workspaces
  for select using (public.is_drive_member(id));
drop policy if exists "Owners can create drive workspaces" on public.drive_workspaces;
create policy "Owners can create drive workspaces" on public.drive_workspaces
  for insert with check (owner_id = auth.uid());
drop policy if exists "Owners can delete drive workspaces" on public.drive_workspaces;
create policy "Owners can delete drive workspaces" on public.drive_workspaces
  for delete using (owner_id = auth.uid());

drop policy if exists "Members can read drive membership" on public.drive_members;
create policy "Members can read drive membership" on public.drive_members
  for select using (public.is_drive_member(public.drive_members.workspace_id));
drop policy if exists "Owners can create drive membership" on public.drive_members;
create policy "Owners can create drive membership" on public.drive_members
  for insert with check (
    exists (
      select 1
        from public.drive_workspaces as dw
       where dw.id = public.drive_members.workspace_id
         and dw.owner_id = auth.uid()
    )
  );
drop policy if exists "Owners can update drive membership" on public.drive_members;
create policy "Owners can update drive membership" on public.drive_members
  for update
  using (
    exists (
      select 1
        from public.drive_workspaces as dw
       where dw.id = public.drive_members.workspace_id
         and dw.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
        from public.drive_workspaces as dw
       where dw.id = public.drive_members.workspace_id
         and dw.owner_id = auth.uid()
    )
  );
drop policy if exists "Owners can delete drive membership" on public.drive_members;
create policy "Owners can delete drive membership" on public.drive_members
  for delete using (
    exists (
      select 1
        from public.drive_workspaces as dw
       where dw.id = public.drive_members.workspace_id
         and dw.owner_id = auth.uid()
    )
  );

drop policy if exists "Members can read drive items" on public.drive_items;
create policy "Members can read drive items" on public.drive_items
  for select using (public.is_drive_member(public.drive_items.workspace_id));
drop policy if exists "Editors can create drive items" on public.drive_items;
create policy "Editors can create drive items" on public.drive_items
  for insert with check (
    public.is_drive_member(public.drive_items.workspace_id)
    and exists (
      select 1
        from public.drive_members as dm
       where dm.workspace_id = public.drive_items.workspace_id
         and dm.user_id = auth.uid()
         and dm.role in ('owner', 'editor')
    )
  );
drop policy if exists "Editors can update drive items" on public.drive_items;
create policy "Editors can update drive items" on public.drive_items
  for update using (
    public.is_drive_member(public.drive_items.workspace_id)
    and exists (
      select 1
        from public.drive_members as dm
       where dm.workspace_id = public.drive_items.workspace_id
         and dm.user_id = auth.uid()
         and dm.role in ('owner', 'editor')
    )
  ) with check (public.is_drive_member(public.drive_items.workspace_id));
drop policy if exists "Editors can delete drive items" on public.drive_items;
create policy "Editors can delete drive items" on public.drive_items
  for delete using (
    public.is_drive_member(public.drive_items.workspace_id)
    and exists (
      select 1
        from public.drive_members as dm
       where dm.workspace_id = public.drive_items.workspace_id
         and dm.user_id = auth.uid()
         and dm.role in ('owner', 'editor')
    )
  );

create or replace function public.create_drive_workspace(workspace_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_workspace_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(workspace_name) not between 1 and 120 then
    raise exception 'Workspace name must be between 1 and 120 characters';
  end if;
  insert into public.drive_workspaces (name, owner_id)
    values (workspace_name, auth.uid())
    returning id into new_workspace_id;
  insert into public.drive_members (workspace_id, user_id, role)
    values (new_workspace_id, auth.uid(), 'owner');
  insert into public.drive_items (workspace_id, parent_id, name, item_type, created_by)
    values (new_workspace_id, null, 'My Drive', 'folder', auth.uid());
  return new_workspace_id;
end;
$$;

revoke all on function public.create_drive_workspace(text) from public;
grant execute on function public.create_drive_workspace(text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'drive_items'
  ) then
    alter publication supabase_realtime add table public.drive_items;
  end if;
end;
$$;
