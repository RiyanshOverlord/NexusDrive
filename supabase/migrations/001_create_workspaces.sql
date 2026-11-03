create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Untitled Workspace',
  content text not null default '',
  updated_at timestamptz not null default now(),
  updated_by text not null default 'system',
  created_at timestamptz not null default now(),
  constraint workspaces_title_length check (char_length(title) between 1 and 120),
  constraint workspaces_content_length check (char_length(content) <= 200000),
  constraint workspaces_updated_by_length check (char_length(updated_by) between 1 and 128)
);

alter table public.workspaces enable row level security;

drop policy if exists "Public can read workspaces" on public.workspaces;
create policy "Public can read workspaces"
  on public.workspaces for select
  using (true);

drop policy if exists "Public can create workspaces" on public.workspaces;
create policy "Public can create workspaces"
  on public.workspaces for insert   
  with check (true);

drop policy if exists "Public can update workspaces" on public.workspaces;
create policy "Public can update workspaces"
  on public.workspaces for update
  using (true)
  with check (true);

create or replace function public.apply_workspace_edit(
  target_workspace_id uuid,
  next_content text,
  next_updated_at timestamptz,
  next_updated_by text
)
returns table (
  accepted boolean,
  content text,
  updated_at timestamptz,
  updated_by text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_workspace public.workspaces;
begin
  if char_length(next_content) > 200000 then
    raise exception 'Workspace content exceeds the 200000 character limit';
  end if;

  if char_length(next_updated_by) not between 1 and 128 then
    raise exception 'Invalid client identifier';
  end if;

  select *
    into current_workspace
    from public.workspaces
   where id = target_workspace_id
   for update;

  if not found then
    raise exception 'Workspace not found';
  end if;

  if (next_updated_at, next_updated_by) >
     (current_workspace.updated_at, current_workspace.updated_by) then
    update public.workspaces
       set content = next_content,
           updated_at = next_updated_at,
           updated_by = next_updated_by
     where id = target_workspace_id
     returning true, workspaces.content, workspaces.updated_at, workspaces.updated_by
          into accepted, content, updated_at, updated_by;
  else
    accepted := false;
    content := current_workspace.content;
    updated_at := current_workspace.updated_at;
    updated_by := current_workspace.updated_by;
  end if;

  return next;
end;
$$;

revoke all on function public.apply_workspace_edit(uuid, text, timestamptz, text) from public;
grant execute on function public.apply_workspace_edit(uuid, text, timestamptz, text) to anon, authenticated;

do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'workspaces'
  ) then
    alter publication supabase_realtime add table public.workspaces;
  end if;
end;
$$;
