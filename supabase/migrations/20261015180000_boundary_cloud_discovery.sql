create table public.boundary_cloud_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.boundary_workspaces(id) on delete cascade,
  provider text not null check (provider in ('AWS', 'Azure', 'GCP')),
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  account_identifier text not null,
  role_arn text,
  tenant_id text,
  client_id text,
  subscription_id text,
  project_id text,
  project_number text,
  workload_identity_pool_id text,
  workload_identity_provider_id text,
  service_account_email text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, account_identifier),
  check (
    (provider = 'AWS'
      and account_identifier ~ '^[0-9]{12}$'
      and role_arn is not null
      and role_arn ~ '^arn:aws(-[a-z0-9-]+)?:iam::[0-9]{12}:role/.+'
      and split_part(role_arn, ':', 5) = account_identifier
      and tenant_id is null and client_id is null and subscription_id is null
      and project_id is null and project_number is null
      and workload_identity_pool_id is null and workload_identity_provider_id is null
      and service_account_email is null)
    or
    (provider = 'Azure'
      and tenant_id is not null and client_id is not null and subscription_id is not null
      and account_identifier = subscription_id
      and tenant_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and client_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and subscription_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and role_arn is null and project_id is null and project_number is null
      and workload_identity_pool_id is null and workload_identity_provider_id is null
      and service_account_email is null)
    or
    (provider = 'GCP'
      and project_id is not null and project_number is not null
      and workload_identity_pool_id is not null and workload_identity_provider_id is not null
      and service_account_email is not null
      and account_identifier = project_id
      and project_id ~ '^[a-z][a-z0-9-]{4,28}[a-z0-9]$'
      and project_number ~ '^[0-9]+$'
      and workload_identity_pool_id ~ '^[a-z0-9-]{4,32}$'
      and workload_identity_provider_id ~ '^[a-z0-9-]{4,32}$'
      and service_account_email ~ '^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$'
      and role_arn is null and tenant_id is null and client_id is null
      and subscription_id is null)
  )
);

create table public.boundary_cloud_scans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.boundary_workspaces(id) on delete cascade,
  account_id uuid not null references public.boundary_cloud_accounts(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  resource_count integer not null default 0 check (resource_count >= 0),
  error_summary text not null default '',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((status = 'running' and completed_at is null) or (status <> 'running' and completed_at is not null))
);

create table public.boundary_cloud_resources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.boundary_workspaces(id) on delete cascade,
  account_id uuid not null references public.boundary_cloud_accounts(id) on delete cascade,
  last_seen_scan_id uuid not null references public.boundary_cloud_scans(id) on delete cascade,
  provider text not null check (provider in ('AWS', 'Azure', 'GCP')),
  resource_identifier text not null,
  resource_type text not null default 'Unknown',
  display_name text not null default '',
  region text not null default '',
  jurisdiction text not null default 'UN' check (jurisdiction ~ '^[A-Z]{2}$'),
  classification text not null default 'Unclassified'
    check (classification in ('PII', 'Financial', 'Sensitive', 'Internal', 'Public', 'Unclassified')),
  last_seen_at timestamptz not null default now(),
  unique (account_id, resource_identifier)
);

create index boundary_cloud_accounts_workspace_idx
  on public.boundary_cloud_accounts (workspace_id, created_at desc);
create index boundary_cloud_scans_account_idx
  on public.boundary_cloud_scans (account_id, started_at desc);
create index boundary_cloud_resources_workspace_idx
  on public.boundary_cloud_resources (workspace_id, jurisdiction, classification);
create index boundary_cloud_resources_scan_idx
  on public.boundary_cloud_resources (last_seen_scan_id);

create trigger boundary_cloud_accounts_set_updated_at
before update on public.boundary_cloud_accounts
for each row execute function public.boundary_set_updated_at();

alter table public.boundary_cloud_accounts enable row level security;
alter table public.boundary_cloud_scans enable row level security;
alter table public.boundary_cloud_resources enable row level security;

grant select, insert, delete on public.boundary_cloud_accounts to authenticated;
grant update (
  display_name, role_arn, tenant_id, client_id, subscription_id, project_id,
  project_number, workload_identity_pool_id, workload_identity_provider_id,
  service_account_email
) on public.boundary_cloud_accounts to authenticated;
grant select, insert on public.boundary_cloud_scans to authenticated;
grant update (status, resource_count, error_summary, completed_at)
  on public.boundary_cloud_scans to authenticated;
grant select, insert on public.boundary_cloud_resources to authenticated;
grant update (
  last_seen_scan_id, resource_type, display_name, region, jurisdiction,
  classification, last_seen_at
) on public.boundary_cloud_resources to authenticated;

create policy boundary_cloud_accounts_select_member
on public.boundary_cloud_accounts for select to authenticated
using (private.boundary_has_workspace_role(workspace_id));

create policy boundary_cloud_accounts_insert_editor
on public.boundary_cloud_accounts for insert to authenticated
with check (
  private.boundary_has_workspace_role(workspace_id, array['owner', 'editor'])
  and created_by = auth.uid()
);

create policy boundary_cloud_accounts_update_editor
on public.boundary_cloud_accounts for update to authenticated
using (private.boundary_has_workspace_role(workspace_id, array['owner', 'editor']))
with check (
  private.boundary_has_workspace_role(workspace_id, array['owner', 'editor'])
  and created_by = auth.uid()
);

create policy boundary_cloud_accounts_delete_editor
on public.boundary_cloud_accounts for delete to authenticated
using (
  private.boundary_has_workspace_role(workspace_id, array['owner', 'editor'])
  and created_by = auth.uid()
);

create policy boundary_cloud_scans_select_member
on public.boundary_cloud_scans for select to authenticated
using (private.boundary_has_workspace_role(workspace_id));

create policy boundary_cloud_scans_insert_editor
on public.boundary_cloud_scans for insert to authenticated
with check (
  private.boundary_has_workspace_role(workspace_id, array['owner', 'editor'])
  and created_by = auth.uid()
  and exists (
    select 1 from public.boundary_cloud_accounts as account
    where account.id = boundary_cloud_scans.account_id
      and account.workspace_id = boundary_cloud_scans.workspace_id
      and account.created_by = auth.uid()
  )
);

create policy boundary_cloud_scans_update_editor
on public.boundary_cloud_scans for update to authenticated
using (
  private.boundary_has_workspace_role(workspace_id, array['owner', 'editor'])
  and created_by = auth.uid()
)
with check (
  private.boundary_has_workspace_role(workspace_id, array['owner', 'editor'])
  and created_by = auth.uid()
);

create policy boundary_cloud_resources_select_member
on public.boundary_cloud_resources for select to authenticated
using (private.boundary_has_workspace_role(workspace_id));

create policy boundary_cloud_resources_insert_editor
on public.boundary_cloud_resources for insert to authenticated
with check (
  private.boundary_has_workspace_role(workspace_id, array['owner', 'editor'])
  and exists (
    select 1
    from public.boundary_cloud_scans as scan
    join public.boundary_cloud_accounts as account on account.id = scan.account_id
    where scan.id = boundary_cloud_resources.last_seen_scan_id
      and scan.account_id = boundary_cloud_resources.account_id
      and scan.workspace_id = boundary_cloud_resources.workspace_id
      and scan.created_by = auth.uid()
      and account.provider = boundary_cloud_resources.provider
  )
);

create policy boundary_cloud_resources_update_editor
on public.boundary_cloud_resources for update to authenticated
using (private.boundary_has_workspace_role(workspace_id, array['owner', 'editor']))
with check (
  private.boundary_has_workspace_role(workspace_id, array['owner', 'editor'])
  and exists (
    select 1
    from public.boundary_cloud_scans as scan
    join public.boundary_cloud_accounts as account on account.id = scan.account_id
    where scan.id = boundary_cloud_resources.last_seen_scan_id
      and scan.account_id = boundary_cloud_resources.account_id
      and scan.workspace_id = boundary_cloud_resources.workspace_id
      and scan.created_by = auth.uid()
      and account.provider = boundary_cloud_resources.provider
  )
);
