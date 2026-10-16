type ExternalAccount = {
  id: string;
  workspace_id: string;
  provider: string;
  display_name: string;
  account_identifier: string;
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

type ResourceRecord = (
  account: ExternalAccount,
  scanId: string,
  identifier: string,
  type: string,
  name: string,
  region: string,
  tags: unknown,
) => DiscoveredResource;

// Provider API responses have distinct schemas and are adapted provider by provider.
// deno-lint-ignore no-explicit-any
type JsonRecord = Record<string, any>;
type Credentials = Record<string, string>;
const limit = 10_000;

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

async function fetchJson(
  url: string,
  init: RequestInit = {},
): Promise<JsonRecord> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let body: JsonRecord = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      `Provider returned an invalid response (${response.status}).`,
    );
  }
  if (!response.ok) {
    const message = body.message || body.error?.message || body.error ||
      body.detail;
    throw new Error(
      typeof message === "string"
        ? message.slice(0, 400)
        : `Provider request failed (${response.status}).`,
    );
  }
  return body;
}

function bearer(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, Accept: "application/json" };
}

function ensureLimit(resources: unknown[]) {
  if (resources.length > limit) {
    throw new Error(
      `Provider scan exceeded the ${limit.toLocaleString()} resource safety limit.`,
    );
  }
}

function recordsFor(
  account: ExternalAccount,
  scanId: string,
  resourceRecord: ResourceRecord,
  resources: Array<{
    id: string;
    type: string;
    name: string;
    region: string;
    tags?: unknown;
  }>,
) {
  ensureLimit(resources);
  return resources.filter((item) => item.id).map((item) =>
    resourceRecord(
      account,
      scanId,
      item.id,
      item.type,
      item.name,
      item.region,
      item.tags,
    )
  );
}

async function scanDigitalOcean(
  account: ExternalAccount,
  credentials: Credentials,
  scanId: string,
  record: ResourceRecord,
) {
  const headers = bearer(credentials.token);
  const discovered: Array<
    { id: string; type: string; name: string; region: string; tags?: unknown }
  > = [];
  for (
    const [path, key, type] of [
      ["/v2/droplets", "droplets", "droplet"],
      ["/v2/databases", "databases", "managed-database"],
      ["/v2/volumes", "volumes", "volume"],
    ]
  ) {
    let page = 1;
    while (true) {
      const body = await fetchJson(
        `https://api.digitalocean.com${path}?per_page=200&page=${page}`,
        { headers },
      );
      for (const item of body[key] || []) {
        discovered.push({
          id: item.urn || `do:${type}:${item.id}`,
          type,
          name: item.name || String(item.id),
          region: item.region?.slug || item.region || "Unknown",
          tags: item.tags || item.labels,
        });
      }
      ensureLimit(discovered);
      const total = Number(body.meta?.total || 0);
      if (!total || page * 200 >= total) break;
      page += 1;
    }
  }
  return recordsFor(account, scanId, record, discovered);
}

async function scanCloudflare(
  account: ExternalAccount,
  credentials: Credentials,
  scanId: string,
  record: ResourceRecord,
) {
  const headers = bearer(credentials.token);
  const accountId = account.provider_config.account_id ||
    account.account_identifier;
  if (!/^[0-9a-f]{32}$/i.test(accountId)) {
    throw new Error(
      "Cloudflare account ID must be a 32-character hexadecimal ID.",
    );
  }
  const discovered: Array<
    { id: string; type: string; name: string; region: string; tags?: unknown }
  > = [];
  const accountUrl = `https://api.cloudflare.com/client/v4/accounts/${
    encodeURIComponent(accountId)
  }`;
  const workers = await fetchJson(`${accountUrl}/workers/scripts`, { headers });
  for (const item of workers.result || []) {
    discovered.push({
      id: `cloudflare:worker:${item.id || item}`,
      type: "Workers Script",
      name: item.id || item,
      region: "global",
    });
  }
  let page = 1;
  while (true) {
    const body = await fetchJson(
      `${accountUrl}/r2/buckets?page=${page}&per_page=100`,
      { headers },
    );
    for (const item of body.result || []) {
      discovered.push({
        id: `cloudflare:r2:${item.name}`,
        type: "R2 Bucket",
        name: item.name,
        region: item.location || "global",
      });
    }
    ensureLimit(discovered);
    if (page >= Number(body.result_info?.total_pages || 1)) break;
    page += 1;
  }
  return recordsFor(account, scanId, record, discovered);
}

async function scanLinode(
  account: ExternalAccount,
  credentials: Credentials,
  scanId: string,
  record: ResourceRecord,
) {
  const headers = bearer(credentials.token);
  const discovered: Array<
    { id: string; type: string; name: string; region: string; tags?: unknown }
  > = [];
  let page = 1;
  while (true) {
    const body = await fetchJson(
      `https://api.linode.com/v4/linode/instances?page=${page}&page_size=500`,
      { headers },
    );
    for (const item of body.data || []) {
      discovered.push({
        id: `linode:instance:${item.id}`,
        type: "Linode Instance",
        name: item.label,
        region: item.region,
        tags: item.tags,
      });
    }
    ensureLimit(discovered);
    if (page * 500 >= Number(body.results || 0)) break;
    page += 1;
  }
  page = 1;
  while (true) {
    const body = await fetchJson(
      `https://api.linode.com/v4/volumes?page=${page}&page_size=500`,
      { headers },
    );
    for (const item of body.data || []) {
      discovered.push({
        id: `linode:volume:${item.id}`,
        type: "Linode Volume",
        name: item.label,
        region: item.region,
      });
    }
    ensureLimit(discovered);
    if (page * 500 >= Number(body.results || 0)) break;
    page += 1;
  }
  return recordsFor(account, scanId, record, discovered);
}

async function scanVultr(
  account: ExternalAccount,
  credentials: Credentials,
  scanId: string,
  record: ResourceRecord,
) {
  const headers = bearer(credentials.token);
  const discovered: Array<
    { id: string; type: string; name: string; region: string; tags?: unknown }
  > = [];
  let cursor = "";
  do {
    const url = new URL("https://api.vultr.com/v2/instances");
    url.searchParams.set("per_page", "500");
    if (cursor) url.searchParams.set("cursor", cursor);
    const body = await fetchJson(url.toString(), { headers });
    for (const item of body.instances || []) {
      discovered.push({
        id: `vultr:instance:${item.id}`,
        type: "Vultr Instance",
        name: item.label || item.hostname,
        region: item.region,
        tags: item.tags,
      });
    }
    ensureLimit(discovered);
    cursor = body.meta?.links?.next
      ? new URL(body.meta.links.next).searchParams.get("cursor") || ""
      : "";
  } while (cursor);
  return recordsFor(account, scanId, record, discovered);
}

async function scanHetzner(
  account: ExternalAccount,
  credentials: Credentials,
  scanId: string,
  record: ResourceRecord,
) {
  const discovered: Array<
    { id: string; type: string; name: string; region: string; tags?: unknown }
  > = [];
  let page = 1;
  while (true) {
    const body = await fetchJson(
      `https://api.hetzner.cloud/v1/servers?page=${page}&per_page=50`,
      {
        headers: {
          ...bearer(credentials.token),
          Authorization: `Bearer ${credentials.token}`,
        },
      },
    );
    for (const item of body.servers || []) {
      discovered.push({
        id: `hetzner:server:${item.id}`,
        type: "Hetzner Server",
        name: item.name,
        region: item.datacenter?.location?.name ||
          item.datacenter?.location?.city || "Unknown",
        tags: item.labels,
      });
    }
    ensureLimit(discovered);
    if (page >= Number(body.meta?.pagination?.last_page || 1)) break;
    page += 1;
  }
  return recordsFor(account, scanId, record, discovered);
}

async function scanIBM(
  account: ExternalAccount,
  credentials: Credentials,
  scanId: string,
  record: ResourceRecord,
) {
  const tokenResponse = await fetchJson(
    "https://iam.cloud.ibm.com/identity/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "urn:ibm:params:oauth:grant-type:apikey",
        apikey: credentials.api_key,
      }),
    },
  );
  const token = String(tokenResponse.access_token || "");
  if (!token) throw new Error("IBM Cloud IAM did not return an access token.");
  const discovered: Array<
    { id: string; type: string; name: string; region: string; tags?: unknown }
  > = [];
  let start = "";
  while (true) {
    const url = new URL(
      "https://resource-controller.cloud.ibm.com/v2/resource_instances",
    );
    url.searchParams.set("limit", "200");
    if (start) url.searchParams.set("start", start);
    const body = await fetchJson(url.toString(), { headers: bearer(token) });
    for (const item of body.resources || []) {
      discovered.push({
        id: item.guid || item.id,
        type: item.type || "IBM Cloud Resource",
        name: item.name || item.guid,
        region: item.region_id || item.region ||
          account.provider_config.region || "global",
        tags: item.tags,
      });
    }
    ensureLimit(discovered);
    start = body.next_url
      ? new URL(body.next_url, "https://resource-controller.cloud.ibm.com")
        .searchParams.get("start") || ""
      : "";
    if (!start) break;
  }
  return recordsFor(account, scanId, record, discovered);
}

function pemBytes(pem: string): Uint8Array {
  const content = pem.replace(
    /-----BEGIN [^-]+-----|-----END [^-]+-----|\s/g,
    "",
  );
  const binary = atob(content);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function scanOracle(
  account: ExternalAccount,
  credentials: Credentials,
  scanId: string,
  record: ResourceRecord,
) {
  const region = account.provider_config.region;
  const tenancy = credentials.tenancy_ocid;
  const user = credentials.user_ocid;
  const fingerprint = credentials.fingerprint;
  if (
    !region || !tenancy || !user || !fingerprint || !credentials.private_key
  ) {
    throw new Error(
      "Oracle Cloud tenancy, user, fingerprint, private key, and region are required.",
    );
  }
  const host = `query.${region}.oci.oraclecloud.com`;
  const path = "/20180409/resources";
  const url = `https://${host}${path}`;
  const discovered: Array<
    { id: string; type: string; name: string; region: string; tags?: unknown }
  > = [];
  let page = "";
  do {
    const body = JSON.stringify({
      query: "query all resources",
      pageSize: 1000,
      ...(page ? { page } : {}),
    });
    const date = new Date().toUTCString();
    const requestTarget = `(request-target): post ${path}`;
    const signingString =
      `${requestTarget}\nhost: ${host}\ndate: ${date}\ncontent-type: application/json\ncontent-length: ${
        new TextEncoder().encode(body).length
      }`;
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      toArrayBuffer(pemBytes(credentials.private_key)),
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
      },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      privateKey,
      new TextEncoder().encode(signingString),
    );
    const encodedSignature = btoa(
      String.fromCharCode(...new Uint8Array(signature)),
    );
    const keyId = `${tenancy}/${user}/${fingerprint}`;
    const authorization =
      `Signature version="1",keyId="${keyId}",algorithm="rsa-sha256",headers="(request-target) host date content-type content-length",signature="${encodedSignature}"`;
    const response = await fetchJson(url, {
      method: "POST",
      headers: {
        Authorization: authorization,
        Date: date,
        "Content-Type": "application/json",
      },
      body,
    });
    for (const item of response.items || []) {
      discovered.push({
        id: item.identifier,
        type: item.resourceType,
        name: item.displayName || item.identifier,
        region: item.region || item.availabilityDomain || region,
        tags: item.freeformTags || item.definedTags,
      });
    }
    ensureLimit(discovered);
    page = response.nextPageToken || "";
  } while (page);
  return recordsFor(account, scanId, record, discovered);
}

async function scanAlibaba(
  account: ExternalAccount,
  credentials: Credentials,
  scanId: string,
  record: ResourceRecord,
) {
  const region = account.provider_config.region;
  if (!region || !credentials.access_key_id || !credentials.access_key_secret) {
    throw new Error(
      "Alibaba Cloud region, access key ID, and access key secret are required.",
    );
  }
  const discovered: Array<
    { id: string; type: string; name: string; region: string; tags?: unknown }
  > = [];
  let page = 1;
  while (true) {
    const params: Record<string, string> = {
      AccessKeyId: credentials.access_key_id,
      Action: "DescribeInstances",
      Format: "JSON",
      PageNumber: String(page),
      PageSize: "100",
      RegionId: region,
      SignatureMethod: "HMAC-SHA1",
      SignatureNonce: crypto.randomUUID(),
      SignatureVersion: "1.0",
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      Version: "2014-05-26",
    };
    const canonical = Object.keys(params).sort().map((key) =>
      `${encodeURIComponent(key)}=${
        encodeURIComponent(params[key]).replace(/[!'()*]/g, (c) =>
          `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
      }`
    ).join("&");
    const stringToSign = `GET&%2F&${
      encodeURIComponent(canonical).replace(/[!'()*]/g, (c) =>
        `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    }`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(`${credentials.access_key_secret}&`),
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(stringToSign),
    );
    params.Signature = btoa(String.fromCharCode(...new Uint8Array(signature)));
    const url = `https://ecs.${region}.aliyuncs.com/?${new URLSearchParams(
      params,
    )}`;
    const body = await fetchJson(url);
    if (body.Code) {
      throw new Error(body.Message || `Alibaba Cloud API error: ${body.Code}`);
    }
    for (const item of body.Instances?.Instance || []) {
      discovered.push({
        id: item.InstanceId,
        type: "ECS Instance",
        name: item.InstanceName || item.InstanceId,
        region: item.RegionId || region,
        tags: item.Tags?.Tag?.reduce(
          (result: Record<string, string>, tag: JsonRecord) => ({
            ...result,
            [tag.TagKey]: tag.TagValue,
          }),
          {},
        ),
      });
    }
    ensureLimit(discovered);
    if (page * 100 >= Number(body.TotalCount || 0)) break;
    page += 1;
  }
  return recordsFor(account, scanId, record, discovered);
}

async function scanTencent(
  account: ExternalAccount,
  credentials: Credentials,
  scanId: string,
  record: ResourceRecord,
) {
  const region = account.provider_config.region;
  if (!region || !credentials.secret_id || !credentials.secret_key) {
    throw new Error(
      "Tencent Cloud region, SecretId, and SecretKey are required.",
    );
  }
  const discovered: Array<
    { id: string; type: string; name: string; region: string; tags?: unknown }
  > = [];
  let offset = 0;
  while (true) {
    const host = "cvm.tencentcloudapi.com";
    const payload = JSON.stringify({ Limit: 100, Offset: offset });
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const canonicalHeaders =
      `content-type:application/json; charset=utf-8\nhost:${host}\n`;
    const signedHeaders = "content-type;host";
    const canonicalRequest =
      `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${await sha256Hex(
        payload,
      )}`;
    const scope = `${date}/cvm/tc3_request`;
    const stringToSign =
      `TC3-HMAC-SHA256\n${timestamp}\n${scope}\n${await sha256Hex(
        canonicalRequest,
      )}`;
    const secretDate = await hmac(
      new TextEncoder().encode(`TC3${credentials.secret_key}`),
      date,
    );
    const secretService = await hmac(secretDate, "cvm");
    const secretSigning = await hmac(secretService, "tc3_request");
    const signature = await hmacHex(secretSigning, stringToSign);
    const authorization =
      `TC3-HMAC-SHA256 Credential=${credentials.secret_id}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const body = await fetchJson(`https://${host}`, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json; charset=utf-8",
        "X-TC-Action": "DescribeInstances",
        "X-TC-Version": "2017-03-12",
        "X-TC-Region": region,
        "X-TC-Timestamp": String(timestamp),
      },
      body: payload,
    });
    const result = body.Response || {};
    if (result.Error) {
      throw new Error(result.Error.Message || "Tencent CVM request failed.");
    }
    for (const item of result.InstanceSet || []) {
      discovered.push({
        id: item.InstanceId,
        type: "CVM Instance",
        name: item.InstanceName || item.InstanceId,
        region,
        tags: item.Tags?.reduce(
          (map: Record<string, string>, tag: JsonRecord) => ({
            ...map,
            [tag.Key]: tag.Value,
          }),
          {},
        ),
      });
    }
    ensureLimit(discovered);
    const total = Number(result.TotalCount || 0);
    offset += 100;
    if (offset >= total || !result.InstanceSet?.length) break;
  }
  return recordsFor(account, scanId, record, discovered);
}

async function sha256Hex(value: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(hash)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function hmac(key: Uint8Array, value: string): Promise<Uint8Array> {
  const imported = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", imported, new TextEncoder().encode(value)),
  );
}

async function hmacHex(key: Uint8Array, value: string): Promise<string> {
  const bytes = await hmac(key, value);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function scanOVH(
  account: ExternalAccount,
  credentials: Credentials,
  scanId: string,
  record: ResourceRecord,
) {
  const endpoints: Record<string, string> = {
    ovh_eu: "https://eu.api.ovh.com/1.0",
    ovh_us: "https://api.us.ovhcloud.com/1.0",
    ovh_ca: "https://ca.api.ovh.com/1.0",
  };
  const baseUrl = endpoints[account.provider_config.endpoint || "ovh_eu"];
  const project = account.provider_config.project_id ||
    account.account_identifier;
  if (
    !baseUrl || !project || !credentials.application_key ||
    !credentials.application_secret || !credentials.consumer_key
  ) {
    throw new Error(
      "OVHcloud endpoint, project ID, application key, application secret, and consumer key are required.",
    );
  }
  const timeResponse = await fetch(`${baseUrl}/auth/time`, {
    signal: AbortSignal.timeout(30_000),
  });
  const timestamp = Number(await timeResponse.text());
  if (!timeResponse.ok) {
    throw new Error(`OVHcloud time endpoint failed (${timeResponse.status}).`);
  }
  if (!Number.isFinite(timestamp)) {
    throw new Error("OVHcloud did not return a valid server time.");
  }
  const path = `/cloud/project/${encodeURIComponent(project)}/instance`;
  const url = `${baseUrl}${path}`;
  const body = await fetchJson(url, {
    headers: {
      "X-Ovh-Application": credentials.application_key,
      "X-Ovh-Consumer": credentials.consumer_key,
      "X-Ovh-Timestamp": String(timestamp),
      "X-Ovh-Signature": await ovhSignature(
        credentials.application_secret,
        credentials.consumer_key,
        "GET",
        url,
        "",
        timestamp,
      ),
    },
  });
  const discovered = (Array.isArray(body) ? body : []).map((
    item: JsonRecord,
  ) => ({
    id: `ovh:instance:${item.id}`,
    type: "OVHcloud Instance",
    name: item.name || item.id,
    region: item.region || item.datacenter || "Unknown",
    tags: item.tags,
  }));
  return recordsFor(account, scanId, record, discovered);
}

async function ovhSignature(
  secret: string,
  consumer: string,
  method: string,
  url: string,
  body: string,
  timestamp: number,
) {
  const message = [secret, consumer, method, url, body, timestamp].join("+");
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(message),
  );
  return `$1$${
    [...new Uint8Array(digest)].map((byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("")
  }`;
}

export async function scanAdditionalProvider(
  account: ExternalAccount,
  credentials: Credentials,
  scanId: string,
  resourceRecord: ResourceRecord,
) {
  switch (account.provider) {
    case "IBM Cloud":
      return await scanIBM(account, credentials, scanId, resourceRecord);
    case "Oracle Cloud":
      return await scanOracle(account, credentials, scanId, resourceRecord);
    case "DigitalOcean":
      return await scanDigitalOcean(
        account,
        credentials,
        scanId,
        resourceRecord,
      );
    case "Cloudflare":
      return await scanCloudflare(account, credentials, scanId, resourceRecord);
    case "Alibaba Cloud":
      return await scanAlibaba(account, credentials, scanId, resourceRecord);
    case "Tencent Cloud":
      return await scanTencent(account, credentials, scanId, resourceRecord);
    case "OVHcloud":
      return await scanOVH(account, credentials, scanId, resourceRecord);
    case "Linode":
      return await scanLinode(account, credentials, scanId, resourceRecord);
    case "Vultr":
      return await scanVultr(account, credentials, scanId, resourceRecord);
    case "Hetzner Cloud":
      return await scanHetzner(account, credentials, scanId, resourceRecord);
    default:
      throw new Error(
        `Live discovery is not implemented for provider ${account.provider}.`,
      );
  }
}
