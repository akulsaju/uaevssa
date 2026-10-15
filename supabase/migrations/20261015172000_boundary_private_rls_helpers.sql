create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.boundary_has_workspace_role(target_workspace_id uuid, allowed_roles text[] default null)
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

revoke all on function private.boundary_has_workspace_role(uuid, text[]) from public, anon;
grant execute on function private.boundary_has_workspace_role(uuid, text[]) to authenticated;

drop policy boundary_workspaces_select_member on public.boundary_workspaces;
create policy boundary_workspaces_select_member
on public.boundary_workspaces for select to authenticated
using (private.boundary_has_workspace_role(id));

drop policy boundary_workspaces_update_admin on public.boundary_workspaces;
create policy boundary_workspaces_update_admin
on public.boundary_workspaces for update to authenticated
using (private.boundary_has_workspace_role(id, array['owner']))
with check (private.boundary_has_workspace_role(id, array['owner']));

drop policy boundary_workspace_members_select_member on public.boundary_workspace_members;
create policy boundary_workspace_members_select_member
on public.boundary_workspace_members for select to authenticated
using (user_id = auth.uid() or private.boundary_has_workspace_role(workspace_id));

drop policy boundary_flows_select_member on public.boundary_flows;
create policy boundary_flows_select_member
on public.boundary_flows for select to authenticated
using (private.boundary_has_workspace_role(workspace_id));

drop policy boundary_flows_insert_editor on public.boundary_flows;
create policy boundary_flows_insert_editor
on public.boundary_flows for insert to authenticated
with check (private.boundary_has_workspace_role(workspace_id, array['owner', 'editor']));

drop policy boundary_flows_update_editor on public.boundary_flows;
create policy boundary_flows_update_editor
on public.boundary_flows for update to authenticated
using (private.boundary_has_workspace_role(workspace_id, array['owner', 'editor']))
with check (private.boundary_has_workspace_role(workspace_id, array['owner', 'editor']));

drop policy boundary_flows_delete_editor on public.boundary_flows;
create policy boundary_flows_delete_editor
on public.boundary_flows for delete to authenticated
using (private.boundary_has_workspace_role(workspace_id, array['owner', 'editor']));

revoke all on function public.boundary_has_workspace_role(uuid, text[]) from public, anon, authenticated;
drop function public.boundary_has_workspace_role(uuid, text[]);

revoke all on function public.boundary_create_workspace(text) from public, anon;
grant execute on function public.boundary_create_workspace(text) to authenticated;
