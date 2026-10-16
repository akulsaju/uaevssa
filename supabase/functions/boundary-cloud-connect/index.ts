import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { encryptCredentials } from "../_shared/credentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const supportedProviders = new Set([
  "IBM Cloud",
  "Oracle Cloud",
  "DigitalOcean",
  "Cloudflare",
  "Alibaba Cloud",
  "Tencent Cloud",
  "OVHcloud",
  "Linode",
  "Vultr",
  "Hetzner Cloud",
]);
const providerCredentialFields: Record<string, string[]> = {
  "IBM Cloud": ["api_key"],
  "Oracle Cloud": ["user_ocid", "fingerprint", "private_key"],
  DigitalOcean: ["token"],
  Cloudflare: ["token"],
  "Alibaba Cloud": ["access_key_id", "access_key_secret"],
  "Tencent Cloud": ["secret_id", "secret_key"],
  OVHcloud: ["application_key", "application_secret", "consumer_key"],
  Linode: ["token"],
  Vultr: ["token"],
  "Hetzner Cloud": ["token"],
};
const providerConfigFields: Record<string, string[]> = {
  "IBM Cloud": ["region"],
  "Oracle Cloud": ["region"],
  DigitalOcean: [],
  Cloudflare: [],
  "Alibaba Cloud": ["region"],
  "Tencent Cloud": ["region"],
  OVHcloud: ["endpoint"],
  Linode: [],
  Vultr: [],
  "Hetzner Cloud": [],
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validText(value: unknown, max = 500): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= max;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return response({ error: "Method not allowed." }, 405);
  }
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > 50_000) {
    return response({ error: "Cloud account request is too large." }, 413);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return response({ error: "Sign in to connect a cloud account." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return response(
      { error: "Supabase function configuration is missing." },
      500,
    );
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) {
    return response({
      error: "Your session could not be verified. Sign in again.",
    }, 401);
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return response({ error: "Request body must be a JSON object." }, 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return response({ error: "Request body must be valid JSON." }, 400);
  }

  const provider = body.provider;
  const workspaceId = body.workspace_id;
  const displayName = body.display_name;
  const accountIdentifier = body.account_identifier;
  const config = body.provider_config;
  const credentials = body.credentials;
  if (
    typeof provider !== "string" || !supportedProviders.has(provider) ||
    typeof workspaceId !== "string" || !/^[0-9a-f-]{36}$/i.test(workspaceId) ||
    !validText(displayName, 80) || !validText(accountIdentifier, 240) ||
    !config || typeof config !== "object" || Array.isArray(config) ||
    !credentials || typeof credentials !== "object" ||
    Array.isArray(credentials)
  ) {
    return response({ error: "Cloud account details are invalid." }, 400);
  }

  const { data: memberships, error: membershipError } = await userClient
    .from("boundary_workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", authData.user.id)
    .in("role", ["owner", "editor"])
    .limit(1);
  if (membershipError) {
    return response({ error: "Unable to verify workspace permissions." }, 500);
  }
  if (!memberships?.length) {
    return response({
      error: "You need workspace editor access to connect an account.",
    }, 403);
  }

  const secretValues = credentials as Record<string, unknown>;
  const configValues = config as Record<string, unknown>;
  const expectedCredentials = providerCredentialFields[provider];
  const expectedConfig = providerConfigFields[provider];
  if (
    Object.keys(secretValues).length !== expectedCredentials.length ||
    expectedCredentials.some((key) => !validText(secretValues[key], 20_000)) ||
    Object.keys(configValues).length !== expectedConfig.length ||
    expectedConfig.some((key) => !validText(configValues[key], 240))
  ) {
    return response({
      error:
        "All provider credential fields are required and must be valid text.",
    }, 400);
  }
  if (
    provider === "OVHcloud" &&
    !["ovh_eu", "ovh_us", "ovh_ca"].includes(String(configValues.endpoint))
  ) {
    return response({ error: "Choose a valid OVHcloud endpoint." }, 400);
  }
  if (provider === "Cloudflare" && !/^[0-9a-f]{32}$/i.test(accountIdentifier)) {
    return response({
      error: "Cloudflare account ID must contain 32 hexadecimal characters.",
    }, 400);
  }

  let encrypted: string;
  try {
    encrypted = await encryptCredentials(
      secretValues as Record<string, string>,
    );
  } catch (error) {
    return response({
      error: error instanceof Error
        ? error.message
        : "Could not encrypt cloud credentials.",
    }, 500);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: account, error: insertError } = await serviceClient
    .from("boundary_cloud_accounts")
    .insert({
      workspace_id: workspaceId,
      provider,
      display_name: displayName.trim(),
      account_identifier: accountIdentifier.trim(),
      provider_config: config,
      credential_ciphertext: encrypted,
      created_by: authData.user.id,
    })
    .select("id")
    .single();
  if (insertError) {
    console.error("Unable to save cloud account:", insertError.message);
    return response({
      error:
        "Unable to save the cloud account. Check whether it is already connected.",
    }, 409);
  }
  return response({ account_id: account.id, status: "connected" });
});
