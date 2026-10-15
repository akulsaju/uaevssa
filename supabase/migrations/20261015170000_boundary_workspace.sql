create table public.boundary_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  slug text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.boundary_workspace_members (
  workspace_id uuid not null references public.boundary_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.boundary_flows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.boundary_workspaces(id) on delete cascade,
  flow_ref text not null,
  name text not null check (char_length(trim(name)) between 1 and 120),
  cloud_provider text not null check (cloud_provider in ('AWS', 'Azure', 'GCP', 'Other')),
  classification text not null check (classification in ('PII', 'Financial', 'Sensitive', 'Internal', 'Public')),
  source_region text not null check (char_length(trim(source_region)) between 1 and 120),
  destination_region text not null check (char_length(trim(destination_region)) between 1 and 120),
  status text not null check (status in ('violation', 'at-risk', 'compliant')),
  policy_name text not null default '',
  notes text not null default '',
  reviewed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, flow_ref)
);

create index boundary_workspace_members_user_id_idx on public.boundary_workspace_members (user_id);
create index boundary_flows_workspace_updated_idx on public.boundary_flows (workspace_id, updated_at desc);

create function public.boundary_has_workspace_role(target_workspace_id uuid, allowed_roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.boundary_workspace_members as member
    where member.workspace_id = target_workspace_id
      and member.user_id = auth.uid()
      and (allowed_roles is null or member.role = any(allowed_roles))
  );
$$;

revoke all on function public.boundary_has_workspace_role(uuid, text[]) from public;
grant execute on function public.boundary_has_workspace_role(uuid, text[]) to authenticated;

create function public.boundary_create_workspace(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  clean_name text := trim(p_name);
  new_workspace_id uuid;
  new_slug text;
begin
  if current_user_id is null then
    raise exception 'Authentication is required to create a workspace';
  end if;

  if clean_name is null or char_length(clean_name) not between 1 and 80 then
    raise exception 'Workspace name must be between 1 and 80 characters';
  end if;

  new_workspace_id := gen_random_uuid();
  new_slug := trim(both '-' from regexp_replace(lower(clean_name), '[^a-z0-9]+', '-', 'g'));
  new_slug := left(new_slug, 48) || '-' || left(new_workspace_id::text, 8);

  insert into public.boundary_workspaces (id, name, slug, created_by)
  values (new_workspace_id, clean_name, new_slug, current_user_id);

  insert into public.boundary_workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, current_user_id, 'owner');

  return new_workspace_id;
end;
$$;

revoke all on function public.boundary_create_workspace(text) from public;
grant execute on function public.boundary_create_workspace(text) to authenticated;

create function public.boundary_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger boundary_flows_set_updated_at
before update on public.boundary_flows
for each row execute function public.boundary_set_updated_at();

alter table public.boundary_workspaces enable row level security;
alter table public.boundary_workspace_members enable row level security;
alter table public.boundary_flows enable row level security;

grant select, update on public.boundary_workspaces to authenticated;
grant select on public.boundary_workspace_members to authenticated;
grant select, insert, update, delete on public.boundary_flows to authenticated;

create policy boundary_workspaces_select_member
on public.boundary_workspaces for select to authenticated
using (public.boundary_has_workspace_role(id));

create policy boundary_workspaces_update_admin
on public.boundary_workspaces for update to authenticated
using (public.boundary_has_workspace_role(id, array['owner']))
with check (public.boundary_has_workspace_role(id, array['owner']));

create policy boundary_workspace_members_select_member
on public.boundary_workspace_members for select to authenticated
using (user_id = auth.uid() or public.boundary_has_workspace_role(workspace_id));

create policy boundary_flows_select_member
on public.boundary_flows for select to authenticated
using (public.boundary_has_workspace_role(workspace_id));

create policy boundary_flows_insert_editor
on public.boundary_flows for insert to authenticated
with check (public.boundary_has_workspace_role(workspace_id, array['owner', 'editor']));

create policy boundary_flows_update_editor
on public.boundary_flows for update to authenticated
using (public.boundary_has_workspace_role(workspace_id, array['owner', 'editor']))
with check (public.boundary_has_workspace_role(workspace_id, array['owner', 'editor']));

create policy boundary_flows_delete_editor
on public.boundary_flows for delete to authenticated
using (public.boundary_has_workspace_role(workspace_id, array['owner', 'editor']));
