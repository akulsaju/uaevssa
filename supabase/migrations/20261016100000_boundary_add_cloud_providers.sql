alter table public.boundary_flows
  drop constraint boundary_flows_cloud_provider_check;

alter table public.boundary_flows
  add constraint boundary_flows_cloud_provider_check
  check (cloud_provider in (
    'AWS', 'Azure', 'GCP', 'Other', 'IBM Cloud', 'Oracle Cloud',
    'DigitalOcean', 'Cloudflare', 'Alibaba Cloud', 'Tencent Cloud',
    'OVHcloud', 'Linode', 'Vultr', 'Hetzner Cloud'
  ));

alter table public.boundary_cloud_accounts
  drop constraint boundary_cloud_accounts_provider_check,
  drop constraint boundary_cloud_accounts_check;

alter table public.boundary_cloud_accounts
  add column provider_config jsonb not null default '{}'::jsonb,
  add column credential_ciphertext text;

alter table public.boundary_cloud_accounts
  add constraint boundary_cloud_accounts_provider_check
    check (provider in (
      'AWS', 'Azure', 'GCP', 'IBM Cloud', 'Oracle Cloud',
      'DigitalOcean', 'Cloudflare', 'Alibaba Cloud', 'Tencent Cloud',
      'OVHcloud', 'Linode', 'Vultr', 'Hetzner Cloud'
    )),
  add constraint boundary_cloud_accounts_credentials_check
    check (
      provider in ('AWS', 'Azure', 'GCP')
      or (credential_ciphertext is not null and account_identifier <> '')
    );

revoke select, insert on public.boundary_cloud_accounts from authenticated;
grant select (
  id, workspace_id, provider, display_name, account_identifier, role_arn,
  tenant_id, client_id, subscription_id, project_id, project_number,
  workload_identity_pool_id, workload_identity_provider_id, service_account_email,
  provider_config, created_by, created_at, updated_at
) on public.boundary_cloud_accounts to authenticated;
grant insert (
  workspace_id, provider, display_name, account_identifier, role_arn,
  tenant_id, client_id, subscription_id, project_id, project_number,
  workload_identity_pool_id, workload_identity_provider_id, service_account_email,
  provider_config, created_by
) on public.boundary_cloud_accounts to authenticated;
grant select, insert, update, delete on public.boundary_cloud_accounts to service_role;

alter table public.boundary_cloud_resources
  drop constraint boundary_cloud_resources_provider_check;

alter table public.boundary_cloud_resources
  add constraint boundary_cloud_resources_provider_check
  check (provider in (
    'AWS', 'Azure', 'GCP', 'IBM Cloud', 'Oracle Cloud',
    'DigitalOcean', 'Cloudflare', 'Alibaba Cloud', 'Tencent Cloud',
    'OVHcloud', 'Linode', 'Vultr', 'Hetzner Cloud'
  ));
