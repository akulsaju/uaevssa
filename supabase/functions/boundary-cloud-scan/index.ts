import { createClient } from 'npm:@supabase/supabase-js@2.49.0';
import { DescribeRegionsCommand, EC2Client } from 'npm:@aws-sdk/client-ec2@3.750.0';
import { GetResourcesCommand, ResourceGroupsTaggingAPIClient } from 'npm:@aws-sdk/client-resource-groups-tagging-api@3.750.0';
import { decryptCredentials } from '../_shared/credentials.ts';
import { scanAdditionalProvider } from '../_shared/provider-scans.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const maxResourcesPerScan = 10_000;
const classificationValues = new Set([
  'PII',
  'Financial',
  'Sensitive',
  'Internal',
  'Public',
]);

type CloudAccount = {
  id: string;
  workspace_id: string;
  provider: string;
  display_name: string;
  account_identifier: string;
  role_arn: string | null;
  tenant_id: string | null;
  client_id: string | null;
  subscription_id: string | null;
  project_id: string | null;
  project_number: string | null;
  workload_identity_pool_id: string | null;
  workload_identity_provider_id: string | null;
  service_account_email: string | null;
  provider_config: Record<string, string>;
};

type DiscoveredResource = {
  workspace_id: string;
  account_id: string;
  last_seen_scan_id: string;
  provider: string;
  resource_identifier: string;
  resource_type: string;
  display_name: string;
  region: string;
  jurisdiction: string;
  classification: string;
  last_seen_at: string;
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizedClassification(tags: unknown): string {
  if (!tags || typeof tags !== 'object') return 'Unclassified';
  const entries = Array.isArray(tags)
    ? tags.map((tag) => {
      if (typeof tag === 'string') {
        const [key, value] = tag.split(/[:=]/, 2);
        return [key?.trim(), value?.trim()];
      }
      return [tag?.Key || tag?.key, tag?.Value || tag?.value];
    })
    : Object.entries(tags as Record<string, unknown>);
  const value = entries.find(([key]) => String(key).toLowerCase() === 'boundary-classification')?.[1];
  const normalized = String(value ?? '').trim().toUpperCase();
  return classificationValues.has(normalized) ? normalized : 'Unclassified';
}

function jurisdictionFromRegion(provider: string, region: string): string {
  let value = region.trim().toLowerCase().replaceAll('_', '-').replaceAll(
    ' ',
    '',
  );
  if (provider === 'GCP') value = value.replace(/-[a-z]$/, '');
  const mappings: Record<string, string> = {
    'af-south-1': 'ZA',
    'ap-east-1': 'HK',
    'ap-east-2': 'TW',
    'ap-northeast-1': 'JP',
    'ap-northeast-2': 'KR',
    'ap-northeast-3': 'JP',
    'ap-south-1': 'IN',
    'ap-south-2': 'IN',
    'ap-southeast-1': 'SG',
    'ap-southeast-2': 'AU',
    'ap-southeast-3': 'ID',
    'ap-southeast-4': 'AU',
    'ap-southeast-5': 'MY',
    'ap-southeast-6': 'NZ',
    'ap-southeast-7': 'TH',
    'ca-central-1': 'CA',
    'ca-west-1': 'CA',
    'cn-north-1': 'CN',
    'cn-northwest-1': 'CN',
    'eu-central-1': 'DE',
    'eu-central-2': 'CH',
    'eu-north-1': 'SE',
    'eu-south-1': 'IT',
    'eu-south-2': 'ES',
    'eu-west-1': 'IE',
    'eu-west-2': 'GB',
    'eu-west-3': 'FR',
    'il-central-1': 'IL',
    'me-central-1': 'AE',
    'me-south-1': 'BH',
    'mx-central-1': 'MX',
    'sa-east-1': 'BR',
    'us-east-1': 'US',
    'us-east-2': 'US',
    'us-west-1': 'US',
    'us-west-2': 'US',
    'us-gov-east-1': 'US',
    'us-gov-west-1': 'US',
    'us-east': 'US',
    'us-west': 'US',
    'us-south': 'US',
    'us-central': 'US',
    'eu-west': 'GB',
    'eu-central': 'DE',
    'eu-de': 'DE',
    'eu-gb': 'GB',
    'eu-north': 'FI',
    'eu-south': 'IT',
    'ap-south': 'IN',
    'ap-northeast': 'JP',
    'ap-southeast': 'SG',
    'ca-tor': 'CA',
    'au-syd': 'AU',
    'jp-tok': 'JP',
    'jp-osa': 'JP',
    'br-sao': 'BR',
    'us-ashburn-1': 'US',
    'us-phoenix-1': 'US',
    'us-sanjose-1': 'US',
    'eu-frankfurt-1': 'DE',
    'eu-amsterdam-1': 'NL',
    'eu-zurich-1': 'CH',
    'uk-london-1': 'GB',
    'uk-cardiff-1': 'GB',
    'ca-toronto-1': 'CA',
    'ap-tokyo-1': 'JP',
    'ap-osaka-1': 'JP',
    'ap-seoul-1': 'KR',
    'ap-singapore-1': 'SG',
    'ap-sydney-1': 'AU',
    'ap-mumbai-1': 'IN',
    'ap-hyderabad-1': 'IN',
    'sa-saopaulo-1': 'BR',
    'nyc1': 'US',
    'nyc2': 'US',
    'nyc3': 'US',
    'sfo2': 'US',
    'sfo3': 'US',
    'ams3': 'NL',
    'sgp1': 'SG',
    'lon1': 'GB',
    'fra1': 'DE',
    'tor1': 'CA',
    'blr1': 'IN',
    'syd1': 'AU',
    'fsn1': 'DE',
    'nbg1': 'DE',
    'hel1': 'FI',
    'ewr': 'US',
    'ord': 'US',
    'dfw': 'US',
    'lax': 'US',
    'sea': 'US',
    'lhr': 'GB',
    'ams': 'NL',
    'fra': 'DE',
    'sgp': 'SG',
    'nrt': 'JP',
    'icn': 'KR',
    'syd': 'AU',
    'bom': 'IN',
    'ap-singapore': 'SG',
    'ap-mumbai': 'IN',
    'ap-seoul': 'KR',
    'ap-tokyo': 'JP',
    'ap-hongkong': 'HK',
    'na-toronto': 'CA',
    'na-siliconvalley': 'US',
    'na-ashburn': 'US',
    'australiaeast': 'AU',
    'australiasoutheast': 'AU',
    'brazilsouth': 'BR',
    'brazilsoutheast': 'BR',
    'canadacentral': 'CA',
    'canadaeast': 'CA',
    'centralindia': 'IN',
    'southindia': 'IN',
    'westindia': 'IN',
    'centralus': 'US',
    'eastus': 'US',
    'eastus2': 'US',
    'northcentralus': 'US',
    'southcentralus': 'US',
    'westcentralus': 'US',
    'westus': 'US',
    'westus2': 'US',
    'westus3': 'US',
    'eastasia': 'HK',
    'southeastasia': 'SG',
    'japaneast': 'JP',
    'japanwest': 'JP',
    'koreacentral': 'KR',
    'koreasouth': 'KR',
    'francecentral': 'FR',
    'francesouth': 'FR',
    'germanynorth': 'DE',
    'germanywestcentral': 'DE',
    'italynorth': 'IT',
    'northeurope': 'IE',
    'westeurope': 'NL',
    'norwayeast': 'NO',
    'polandcentral': 'PL',
    'spaincentral': 'ES',
    'swedencentral': 'SE',
    'switzerlandnorth': 'CH',
    'uksouth': 'GB',
    'ukwest': 'GB',
    'uaecentral': 'AE',
    'uaenorth': 'AE',
    'qatarcentral': 'QA',
    'israelcentral': 'IL',
    'southafricanorth': 'ZA',
    'mexicocentral': 'MX',
    'asia-east1': 'TW',
    'asia-east2': 'HK',
    'asia-northeast1': 'JP',
    'asia-northeast2': 'JP',
    'asia-northeast3': 'KR',
    'asia-south1': 'IN',
    'asia-south2': 'IN',
    'asia-southeast1': 'SG',
    'asia-southeast2': 'ID',
    'australia-southeast1': 'AU',
    'australia-southeast2': 'AU',
    'europe-central2': 'PL',
    'europe-north1': 'FI',
    'europe-southwest1': 'ES',
    'europe-west1': 'BE',
    'europe-west2': 'GB',
    'europe-west3': 'DE',
    'europe-west4': 'NL',
    'europe-west6': 'CH',
    'europe-west8': 'IT',
    'europe-west9': 'FR',
    'europe-west10': 'DE',
    'europe-west12': 'IT',
    'northamerica-northeast1': 'CA',
    'northamerica-northeast2': 'CA',
    'southamerica-east1': 'BR',
    'southamerica-west1': 'CL',
    'us-central1': 'US',
    'us-east1': 'US',
    'us-east4': 'US',
    'us-east5': 'US',
    'us-south1': 'US',
    'us-west1': 'US',
    'us-west2': 'US',
    'us-west3': 'US',
    'us-west4': 'US',
  };
  if (provider === 'GCP' && /^us-(central|east|south|west)\d+$/.test(value)) {
    return 'US';
  }
  return mappings[value] || 'UN';
}

function resourceRecord(
  account: Pick<CloudAccount, 'id' | 'workspace_id' | 'provider'>,
  scanId: string,
  identifier: string,
  type: string,
  name: string,
  region: string,
  tags: unknown,
): DiscoveredResource {
  return {
    workspace_id: account.workspace_id,
    account_id: account.id,
    last_seen_scan_id: scanId,
    provider: account.provider,
    resource_identifier: identifier,
    resource_type: type || 'Unknown',
    display_name: (name || identifier).slice(0, 240),
    region: (region || 'Unknown').slice(0, 120),
    jurisdiction: jurisdictionFromRegion(account.provider, region),
    classification: normalizedClassification(tags),
    last_seen_at: new Date().toISOString(),
  };
}

async function postForm(
  url: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const result = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const body = await result.json().catch(() => ({}));
  if (!result.ok) {
    const details = (body as { error_description?: string; error?: string })
      .error_description ||
      (body as { error?: string }).error ||
      `Request failed (${result.status}).`;
    throw new Error(details);
  }
  return body as Record<string, unknown>;
}

async function scanAws(
  account: CloudAccount,
  token: string,
  scanId: string,
): Promise<DiscoveredResource[]> {
  if (!account.role_arn) throw new Error('AWS role ARN is missing.');
  const stsResponse = await fetch('https://sts.amazonaws.com/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      Action: 'AssumeRoleWithWebIdentity',
      Version: '2011-06-15',
      RoleArn: account.role_arn,
      RoleSessionName: `boundary-${scanId.slice(0, 8)}`,
      WebIdentityToken: token,
      DurationSeconds: '900',
    }),
  });
  const xml = await stsResponse.text();
  if (!stsResponse.ok) {
    const message = xml.match(/<Message>([\s\S]*?)<\/Message>/)?.[1];
    throw new Error(
      message ? message.replaceAll('&amp;', '&') : `AWS federation failed (${stsResponse.status}).`,
    );
  }
  const getXmlValue = (tag: string) => xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] || '';
  const credentials = {
    accessKeyId: getXmlValue('AccessKeyId'),
    secretAccessKey: getXmlValue('SecretAccessKey'),
    sessionToken: getXmlValue('SessionToken'),
  };
  if (
    !credentials.accessKeyId || !credentials.secretAccessKey ||
    !credentials.sessionToken
  ) {
    throw new Error('AWS did not return temporary role credentials.');
  }
  const ec2 = new EC2Client({ region: 'us-east-1', credentials });
  const { Regions } = await ec2.send(
    new DescribeRegionsCommand({ AllRegions: false }),
  );
  const regions = (Regions || []).map((item) => item.RegionName).filter((
    value,
  ): value is string => Boolean(value));
  const records: DiscoveredResource[] = [];
  let nextRegion = 0;
  let total = 0;
  const worker = async () => {
    while (nextRegion < regions.length) {
      const region = regions[nextRegion++];
      const client = new ResourceGroupsTaggingAPIClient({
        region,
        credentials,
      });
      let paginationToken: string | undefined;
      do {
        const page = await client.send(
          new GetResourcesCommand({ PaginationToken: paginationToken }),
        );
        for (const item of page.ResourceTagMappingList || []) {
          if (!item.ResourceARN) continue;
          const parts = item.ResourceARN.split(':');
          const tags = item.Tags || [];
          const type = parts[2] || 'Unknown';
          const resourceRegion = parts[3] || region;
          const name = item.ResourceARN.split('/').at(-1) || item.ResourceARN;
          records.push(
            resourceRecord(
              account,
              scanId,
              item.ResourceARN,
              type,
              name,
              resourceRegion,
              tags,
            ),
          );
          total += 1;
          if (total > maxResourcesPerScan) {
            throw new Error(
              `AWS scan exceeded the ${maxResourcesPerScan.toLocaleString()} resource safety limit.`,
            );
          }
        }
        paginationToken = page.PaginationToken;
      } while (paginationToken);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(4, regions.length) }, worker),
  );
  return records;
}

async function scanAzure(
  account: CloudAccount,
  token: string,
  scanId: string,
): Promise<DiscoveredResource[]> {
  if (!account.tenant_id || !account.client_id || !account.subscription_id) {
    throw new Error(
      'Azure tenant, application, or subscription identifier is missing.',
    );
  }
  const tokenResult = await postForm(
    `https://login.microsoftonline.com/${encodeURIComponent(account.tenant_id)}/oauth2/v2.0/token`,
    {
      client_id: account.client_id,
      scope: 'https://management.azure.com/.default',
      grant_type: 'client_credentials',
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: token,
    },
  );
  const accessToken = String(tokenResult.access_token || '');
  if (!accessToken) throw new Error('Azure did not return an access token.');
  const records: DiscoveredResource[] = [];
  let skipToken: string | undefined;
  do {
    const query = new URL(
      'https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2022-10-01',
    );
    const result = await fetch(query, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subscriptions: [account.subscription_id],
        query: 'Resources | project id, name, type, location, tags | order by id asc',
        options: {
          $top: 1000,
          ...(skipToken ? { $skipToken: skipToken } : {}),
        },
      }),
    });
    const body = await result.json();
    if (!result.ok) {
      throw new Error(
        body.error?.message ||
          `Azure Resource Graph failed (${result.status}).`,
      );
    }
    for (const resource of body.data || []) {
      if (!resource.id) continue;
      records.push(resourceRecord(
        account,
        scanId,
        resource.id,
        resource.type,
        resource.name,
        resource.location,
        resource.tags,
      ));
      if (records.length > maxResourcesPerScan) {
        throw new Error(
          `Azure scan exceeded the ${maxResourcesPerScan.toLocaleString()} resource safety limit.`,
        );
      }
    }
    skipToken = body.skipToken || undefined;
  } while (skipToken);
  return records;
}

async function scanGcp(
  account: CloudAccount,
  token: string,
  scanId: string,
): Promise<DiscoveredResource[]> {
  if (
    !account.project_number || !account.workload_identity_pool_id ||
    !account.workload_identity_provider_id || !account.service_account_email
  ) {
    throw new Error(
      'Google Cloud workload identity configuration is incomplete.',
    );
  }
  const audience =
    `//iam.googleapis.com/projects/${account.project_number}/locations/global/workloadIdentityPools/${account.workload_identity_pool_id}/providers/${account.workload_identity_provider_id}`;
  const federated = await postForm('https://sts.googleapis.com/v1/token', {
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    audience,
    requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    subject_token: token,
  });
  const federatedToken = String(federated.access_token || '');
  if (!federatedToken) {
    throw new Error('Google Cloud STS did not return a federated token.');
  }
  const impersonation = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(account.service_account_email)}:generateAccessToken`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${federatedToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scope: ['https://www.googleapis.com/auth/cloud-platform'],
        lifetime: '900s',
      }),
    },
  );
  const impersonationBody = await impersonation.json();
  if (!impersonation.ok) {
    throw new Error(
      impersonationBody.error?.message ||
        `Google service account impersonation failed (${impersonation.status}).`,
    );
  }
  const accessToken = String(impersonationBody.accessToken || '');
  if (!accessToken) {
    throw new Error(
      'Google Cloud did not return a service account access token.',
    );
  }
  const records: DiscoveredResource[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(
      `https://cloudasset.googleapis.com/v1/projects/${encodeURIComponent(account.project_number)}:searchAllResources`,
    );
    url.searchParams.set('pageSize', '500');
    url.searchParams.set(
      'readMask',
      'name,assetType,displayName,location,labels',
    );
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const result = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = await result.json();
    if (!result.ok) {
      throw new Error(
        body.error?.message ||
          `Cloud Asset Inventory failed (${result.status}).`,
      );
    }
    for (const resource of body.results || []) {
      if (!resource.name) continue;
      records.push(resourceRecord(
        account,
        scanId,
        resource.name,
        resource.assetType,
        resource.displayName,
        resource.location,
        resource.labels,
      ));
      if (records.length > maxResourcesPerScan) {
        throw new Error(
          `Google Cloud scan exceeded the ${maxResourcesPerScan.toLocaleString()} resource safety limit.`,
        );
      }
    }
    pageToken = body.nextPageToken || undefined;
  } while (pageToken);
  return records;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return response({ error: 'Method not allowed.' }, 405);
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return response({ error: 'Sign in to start a scan.' }, 401);
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseKey) {
    return response(
      { error: 'Supabase function configuration is missing.' },
      500,
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return response({
      error: 'Your session could not be verified. Sign in again.',
    }, 401);
  }

  let body: { account_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return response({ error: 'Request body must be valid JSON.' }, 400);
  }
  if (
    typeof body.account_id !== 'string' ||
    !/^[0-9a-f-]{36}$/i.test(body.account_id)
  ) {
    return response({ error: 'A valid cloud account ID is required.' }, 400);
  }

  const { data: account, error: accountError } = await supabase
    .from('boundary_cloud_accounts')
    .select(
      'id, workspace_id, provider, display_name, account_identifier, role_arn, tenant_id, client_id, subscription_id, project_id, project_number, workload_identity_pool_id, workload_identity_provider_id, service_account_email, provider_config',
    )
    .eq('id', body.account_id)
    .eq('created_by', authData.user.id)
    .maybeSingle();
  if (accountError) {
    return response({ error: 'Unable to load the cloud account.' }, 500);
  }
  if (!account) {
    return response({
      error: 'Cloud account not found or not connected by this user.',
    }, 404);
  }
  const cloudAccount = account as CloudAccount;

  const { data: scan, error: scanError } = await supabase
    .from('boundary_cloud_scans')
    .insert({
      workspace_id: cloudAccount.workspace_id,
      account_id: cloudAccount.id,
      created_by: authData.user.id,
    })
    .select('id')
    .single();
  if (scanError || !scan) {
    return response({ error: 'Unable to start a scan for this account.' }, 500);
  }

  try {
    const token = authorization.slice('Bearer '.length);
    let records: DiscoveredResource[];
    if (cloudAccount.provider === 'AWS') {
      records = await scanAws(cloudAccount, token, scan.id);
    } else if (cloudAccount.provider === 'Azure') {
      records = await scanAzure(cloudAccount, token, scan.id);
    } else if (cloudAccount.provider === 'GCP') {
      records = await scanGcp(cloudAccount, token, scan.id);
    } else {
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (!serviceRoleKey) {
        throw new Error('Supabase service configuration is missing.');
      }
      const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: credentialRow, error: credentialError } = await serviceClient
        .from('boundary_cloud_accounts')
        .select('credential_ciphertext')
        .eq('id', cloudAccount.id)
        .maybeSingle();
      if (credentialError) {
        throw new Error('Unable to load encrypted provider credentials.');
      }
      if (!credentialRow?.credential_ciphertext) {
        throw new Error(
          'This account has no saved provider credentials. Reconnect it.',
        );
      }
      const credentials = await decryptCredentials(
        credentialRow.credential_ciphertext,
      );
      records = await scanAdditionalProvider(
        cloudAccount,
        credentials,
        scan.id,
        resourceRecord,
      );
    }

    for (let offset = 0; offset < records.length; offset += 200) {
      const { error } = await supabase
        .from('boundary_cloud_resources')
        .upsert(records.slice(offset, offset + 200), {
          onConflict: 'account_id,resource_identifier',
          ignoreDuplicates: false,
        });
      if (error) {
        throw new Error(
          `Could not save discovered resources: ${error.message}`,
        );
      }
    }
    const { error: finishError } = await supabase
      .from('boundary_cloud_scans')
      .update({
        status: 'succeeded',
        resource_count: records.length,
        completed_at: new Date().toISOString(),
      })
      .eq('id', scan.id);
    if (finishError) {
      throw new Error(`Could not complete scan record: ${finishError.message}`);
    }
    return response({
      scan_id: scan.id,
      status: 'succeeded',
      resource_count: records.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cloud scan failed.';
    console.error(`Cloud scan ${scan.id} failed:`, message);
    const { error: finishError } = await supabase
      .from('boundary_cloud_scans')
      .update({
        status: 'failed',
        error_summary: message.slice(0, 1000),
        completed_at: new Date().toISOString(),
      })
      .eq('id', scan.id);
    if (finishError) {
      console.error(
        `Could not update failed scan ${scan.id}:`,
        finishError.message,
      );
    }
    return response(
      { scan_id: scan.id, status: 'failed', error: message },
      502,
    );
  }
});
