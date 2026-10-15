revoke update on public.boundary_workspaces from authenticated;
grant update (name) on public.boundary_workspaces to authenticated;

create or replace function public.boundary_create_workspace(p_name text)
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

  if exists (
    select 1
    from public.boundary_workspace_members as member
    where member.user_id = current_user_id
  ) then
    raise exception 'This account already belongs to a workspace';
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

revoke all on function public.boundary_set_updated_at() from public;
