# Sovereign Eye — Residency Control Plane

Sovereign Eye is a private workspace for recording and reviewing sensitive data flows across cloud regions and jurisdictions. It helps teams identify inventory records that may need a closer review.

## Features

- Email/password registration and sign-in through Supabase Auth, with email confirmation required by the configured Supabase project.
- Private workspace creation and workspace-scoped data-flow records protected by Postgres row-level security.
- A five-step onboarding tutorial, available again from the `?` button.
- Create, edit, review, and delete flow records; search and filter by status or region; inspect findings; and export the filtered records to CSV.
- A database rule that flags PII, financial, and sensitive records when their recorded source and destination jurisdictions differ. Unknown jurisdictions are marked for review.
- Connect AWS, Azure, and Google Cloud accounts using OIDC workload identity federation; connect IBM Cloud, Oracle Cloud, DigitalOcean, Cloudflare, Alibaba Cloud, Tencent Cloud, OVHcloud, Linode, Vultr, and Hetzner Cloud using provider-specific credentials encrypted server-side.
- Run on-demand, read-only resource discovery for AWS, Azure, Google Cloud, and all ten additional providers. Provider coverage is limited to the resource types listed in the connection dialog.
- Resource classification from the shared `boundary-classification` tag/label (`PII`, `Financial`, `Sensitive`, `Internal`, or `Public`). Untagged or unrecognized values remain `Unclassified`.
- Workspace settings for changing the workspace name.
- Creator credit shown on the sign-in, dashboard, and tutorial screens.

## Run locally

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env.local` and set the Supabase project URL and publishable key:

   ```dotenv
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   ```

3. Apply the SQL migrations in `supabase/migrations/` to the project in filename order.
4. In Supabase Auth, set the Site URL and add the local app URL (`http://127.0.0.1:5173/**`) and deployed app URL to the redirect URL allowlist.
5. Start the development server:

   ```sh
   npm run dev
   ```

Open the URL printed by Vite. To create a production build, run `npm run build`.

## Demo login

Use these credentials in the sign-in form, or choose **Open read-only demo** on the login screen:

| Username | Password |
| --- | --- |
| `demo` | `12345` |

This is a **public, read-only demo mode**, not a Supabase account. It displays fictional placeholder data in the browser, does not create a real user or save changes, and never grants access to a connected workspace. Editing, deleting, cloud scans, cloud account setup, and workspace settings are disabled in demo mode. Do not reuse these credentials for any real account.

## Authentication and email

The application uses Supabase Auth for registration, sign-in, password reset, and email-confirmation state. A user must confirm their email before the app opens their workspace when the project requires confirmation. The app includes confirmation and password-reset screens, but this repository does not configure an email provider. Delivery depends on the Supabase project's existing Auth email settings; SMTP setup and test emails are intentionally not included.

## Cloud account discovery

Cloud accounts are connected by storing provider identifiers only. Scans run in the `boundary-cloud-scan` Supabase Edge Function using the signed-in user's Supabase OIDC token and short-lived provider credentials. No long-lived AWS keys, Azure client secrets, or Google service-account keys are collected or stored.

Before connecting an account, configure its provider to trust the exact OIDC issuer, subject, and audience shown in the connection dialog:

- **AWS:** create an IAM OIDC provider for the displayed issuer and audience; trust only the displayed subject in the IAM role. Grant `tag:GetResources` and `ec2:DescribeRegions`. AWS Resource Groups Tagging API returns tagged or previously tagged resources only; untagged resources are not returned.
- **Azure:** add a federated identity credential to an Entra application using the displayed issuer, subject, and audience; assign the application the built-in Reader role on the selected subscription. Discovery uses Azure Resource Graph.
- **Google Cloud:** configure an OIDC Workload Identity Federation provider with the displayed issuer and audience, map `google.subject=assertion.sub`, and permit the displayed subject to impersonate the read-only service account. Grant the service account Cloud Asset Viewer and enable the Cloud Asset API.

The required tag/label key is `boundary-classification`. A recognized value is stored as the resource's classification; other or missing values are `Unclassified`. Scans are initiated manually from the dashboard. The account creator is the only user allowed to run scans for that connection. Discovery records resource identifiers, types, names, regions, jurisdictions, and classifications; it does not read resource contents or inspect API/network traffic. A resource inventory in different countries is not evidence that data moved between them. Region-to-country mapping is best-effort and unrecognized locations are marked `UN`.

The Supabase migration in `supabase/migrations/20261015180000_boundary_cloud_discovery.sql` creates the cloud inventory schema. Link the Supabase CLI to the project and deploy the function with JWT verification enabled before using the scan button:

```sh
supabase functions deploy boundary-cloud-scan --project-ref <project-ref>
```

Run `supabase login` first if the Supabase CLI is not already authenticated. Enter any access token directly in the CLI prompt; do not add it to `.env.local` or commit it.

Apply all migrations, including `20261016100000_boundary_add_cloud_providers.sql`, before deploying the additional provider functions. Generate a 32-byte encryption key and store it only as a Supabase Edge Function secret:

```sh
openssl rand -base64 32
supabase secrets set "BOUNDARY_CREDENTIAL_ENCRYPTION_KEY=<generated-key>"
supabase functions deploy boundary-cloud-connect --project-ref <project-ref>
supabase functions deploy boundary-cloud-scan --project-ref <project-ref>
```

The key is required by both functions. Additional provider credentials are encrypted with AES-GCM before being stored, and the ciphertext column is not readable by authenticated browser clients. Back up the key securely: if it is lost or rotated without re-encrypting saved credentials, those provider accounts must be reconnected. API credentials should be restricted to the documented read-only inventory endpoints.

## Scope and security

Sovereign Eye combines a **manual data-flow inventory** with **on-demand cloud resource discovery**. Resource discovery does not automatically infer source-to-destination data flows, inspect data content, ingest audit/network logs, or block transfers.

The default database rule is a review signal based on the jurisdictions recorded in each flow. It is not jurisdiction-specific legal advice, a compliance certification, or proof that data actually crossed a border. Validate the inventory and configure appropriate policies and controls before relying on it for compliance decisions.

Passwords are handled by Supabase Auth and are not stored in Sovereign Eye tables. Workspace and flow data are protected by row-level security. The browser uses only the Supabase publishable key; never place a service-role key in client configuration. Keep `.env.local` private (it is git-ignored).
