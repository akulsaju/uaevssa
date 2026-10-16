<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:06B6D4,50:2563EB,100:7C3AED&height=190&section=header&text=Sovereign%20Eye&fontSize=48&fontColor=FFFFFF&animation=twinkling&fontAlignY=38&desc=Residency%20Control%20Plane&descAlignY=60&descSize=18" alt="Animated colorful Sovereign Eye banner" width="100%" />
</p>

<h1 align="center">Sovereign Eye</h1>

<p align="center">
  <img src="https://readme-typing-svg.demolab.com?font=Inter&weight=600&size=18&duration=2200&pause=650&color=2563EB&center=true&vCenter=true&width=760&lines=Map+cloud+resources+across+jurisdictions;Review+cross-border+data+flows;Connect+13+cloud+providers;Keep+provider+credentials+encrypted+server-side;Inventory+resources%2C+not+data+contents" alt="Animated project description" />
</p>

<p align="center">A private workspace for recording and reviewing sensitive data flows across cloud regions and jurisdictions.</p>

<p align="center">
  <a href="package.json"><img src="https://img.shields.io/badge/built%20with-Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Built with Vite" /></a>
  <a href="supabase/"><img src="https://img.shields.io/badge/backend-Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase backend" /></a>
  <a href="#technology"><img src="https://img.shields.io/badge/languages-5-F97316?style=for-the-badge" alt="Five languages" /></a>
  <a href="#security-notes"><img src="https://img.shields.io/badge/security-RLS%20%2B%20AES--GCM-8B5CF6?style=for-the-badge&logo=letsencrypt&logoColor=white" alt="Row-level security and AES-GCM" /></a>
</p>

### 🎨 Languages and tools

<p>
  <a href="app.js"><img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=111111" alt="JavaScript" /></a>
  <a href="supabase/functions/"><img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="index.html"><img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML5" /></a>
  <a href="styles.css"><img src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white" alt="CSS3" /></a>
  <a href="supabase/migrations/"><img src="https://img.shields.io/badge/SQL-336791?style=for-the-badge&logo=postgresql&logoColor=white" alt="SQL" /></a>
  <a href="supabase/functions/"><img src="https://img.shields.io/badge/Deno-000000?style=for-the-badge&logo=deno&logoColor=white" alt="Deno" /></a>
  <a href="package.json"><img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" /></a>
  <a href="supabase/"><img src="https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" /></a>
</p>

<p align="center">
  <a href="#what-it-does">What it does</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#cloud-providers">Cloud providers</a> ·
  <a href="#security-notes">Security notes</a>
</p>

<details>
<summary><strong>Contents</strong></summary>

- [What it does](#what-it-does)
- [Technology](#technology)
- [Quick start](#quick-start)
- [Demo mode](#demo-mode)
- [Authentication](#authentication-and-email)
- [Cloud providers](#cloud-providers)
- [Security notes](#security-notes)

</details>

Sovereign Eye is a private workspace for recording and reviewing sensitive data flows across cloud regions and jurisdictions. It helps teams identify inventory records that may need a closer review.

## 🧭 What it does

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

<details>
<summary><strong>Feature checklist</strong></summary>

| Area | Supported |
| --- | --- |
| Manual data-flow inventory | Create, edit, search, filter, review, delete, and export to CSV |
| Residency review | Flags PII, financial, and sensitive flows crossing recorded jurisdictions |
| Cloud inventory | On-demand, read-only resource discovery |
| Classification | Reads the shared `boundary-classification` tag or label |
| Workspace access | Workspace-scoped access controlled by Postgres RLS |

</details>

## 🧰 Technology

- **JavaScript** powers the browser application, with **HTML** for page structure and **CSS** for styling.
- **TypeScript** is used for the Supabase Edge Functions, which run on Deno.
- **SQL** defines the Supabase/PostgreSQL schema, access policies, and migrations.
- **JSON** is used for application and function configuration.
- **Vite** builds and serves the frontend; the app uses the [Supabase JavaScript client](https://github.com/supabase/supabase-js) for authentication and data access.

## 🚀 Quick start

<p align="center">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=500&size=15&duration=1800&pause=900&color=0EA5E9&center=true&vCenter=true&width=600&lines=npm+install;npm+run+dev;Build+and+explore+Sovereign+Eye" alt="Animated quick start commands" />
</p>

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

<details>
<summary><strong>Environment variables</strong></summary>

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser-safe Supabase publishable key |

Never put a service-role key in `.env.local`.

</details>

## 🧪 Demo mode

Use these credentials in the sign-in form, or choose **Open read-only demo** on the login screen:

| Username | Password |
| --- | --- |
| `demo` | `12345` |

This is a **public, read-only demo mode**, not a Supabase account. It displays fictional placeholder data in the browser, does not create a real user or save changes, and never grants access to a connected workspace. Editing, deleting, cloud scans, cloud account setup, and workspace settings are disabled in demo mode. Do not reuse these credentials for any real account.

## ✉️ Authentication and email

The application uses Supabase Auth for registration, sign-in, password reset, and email-confirmation state. A user must confirm their email before the app opens their workspace when the project requires confirmation. The app includes confirmation and password-reset screens, but this repository does not configure an email provider. Delivery depends on the Supabase project's existing Auth email settings; SMTP setup and test emails are intentionally not included.

## ☁️ Cloud providers

AWS, Azure, and Google Cloud accounts store provider identifiers and use the signed-in user's Supabase OIDC token to obtain short-lived access. The ten additional providers use provider-specific API credentials, encrypted server-side before storage and decrypted only by the scan Edge Function. No AWS keys, Azure client secrets, or Google service-account keys are collected or stored.

<p align="center">
  <img src="https://readme-typing-svg.demolab.com?font=Inter&weight=600&size=16&duration=1900&pause=700&color=7C3AED&center=true&vCenter=true&width=720&lines=AWS+%E2%80%A2+Azure+%E2%80%A2+Google+Cloud;IBM+%E2%80%A2+Oracle+%E2%80%A2+DigitalOcean+%E2%80%A2+Cloudflare;Alibaba+%E2%80%A2+Tencent+%E2%80%A2+OVHcloud;Linode+%E2%80%A2+Vultr+%E2%80%A2+Hetzner" alt="Animated list of supported cloud providers" />
</p>

| Connection type | Providers | Access |
| --- | --- | --- |
| OIDC federation | AWS, Azure, Google Cloud | Short-lived, read-only access |
| Encrypted API credentials | IBM Cloud, Oracle Cloud, DigitalOcean, Cloudflare, Alibaba Cloud, Tencent Cloud, OVHcloud, Linode, Vultr, Hetzner Cloud | Provider-specific read-only inventory APIs |

<details>
<summary><strong>Supported resource coverage</strong></summary>

| Provider | Discovered resources |
| --- | --- |
| IBM Cloud | Resource Controller instances |
| Oracle Cloud | Resource Search resources |
| DigitalOcean | Droplets, managed databases, volumes |
| Cloudflare | Workers scripts, R2 buckets |
| Alibaba Cloud | ECS instances |
| Tencent Cloud | CVM instances |
| OVHcloud | Public Cloud instances |
| Linode | Instances, volumes |
| Vultr | Instances |
| Hetzner Cloud | Servers |

</details>

Before connecting an account, configure its provider to trust the exact OIDC issuer, subject, and audience shown in the connection dialog:

- **AWS:** create an IAM OIDC provider for the displayed issuer and audience; trust only the displayed subject in the IAM role. Grant `tag:GetResources` and `ec2:DescribeRegions`. AWS Resource Groups Tagging API returns tagged or previously tagged resources only; untagged resources are not returned.
- **Azure:** add a federated identity credential to an Entra application using the displayed issuer, subject, and audience; assign the application the built-in Reader role on the selected subscription. Discovery uses Azure Resource Graph.
- **Google Cloud:** configure an OIDC Workload Identity Federation provider with the displayed issuer and audience, map `google.subject=assertion.sub`, and permit the displayed subject to impersonate the read-only service account. Grant the service account Cloud Asset Viewer and enable the Cloud Asset API.

The required tag/label key is `boundary-classification`. A recognized value is stored as the resource's classification; other or missing values are `Unclassified`. Scans are initiated manually from the dashboard. The account creator is the only user allowed to run scans for that connection. Discovery records resource identifiers, types, names, regions, jurisdictions, and classifications; it does not read resource contents or inspect API/network traffic. A resource inventory in different countries is not evidence that data moved between them. Region-to-country mapping is best-effort and unrecognized locations are marked `UN`.

The migrations in [`supabase/migrations/`](supabase/migrations/) create the cloud inventory schema and add support for the ten additional providers. Apply them in filename order. Link the Supabase CLI to the project and deploy the functions with JWT verification enabled before using cloud scans:

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

## 🔐 Security notes

<details>
<summary><strong>Security model and limitations</strong></summary>

Sovereign Eye combines a **manual data-flow inventory** with **on-demand cloud resource discovery**. Resource discovery does not automatically infer source-to-destination data flows, inspect data content, ingest audit/network logs, or block transfers.

The default database rule is a review signal based on the jurisdictions recorded in each flow. It is not jurisdiction-specific legal advice, a compliance certification, or proof that data actually crossed a border. Validate the inventory and configure appropriate policies and controls before relying on it for compliance decisions.

Passwords are handled by Supabase Auth and are not stored in Sovereign Eye tables. Workspace and flow data are protected by row-level security. The browser uses only the Supabase publishable key; never place a service-role key in client configuration. Keep `.env.local` private (it is git-ignored).

</details>

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:7C3AED,50:2563EB,100:06B6D4&height=120&section=footer&animation=twinkling" alt="Animated colorful footer" width="100%" />
</p>
