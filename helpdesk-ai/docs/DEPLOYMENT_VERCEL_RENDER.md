# Free demonstration: Vercel + Render

Deploy the React client to Vercel and the Express API to a Render Free web service. The initial demonstration supports chat, saved conversations, terminal simulations, and admin pages. Windows desktop launches are disabled in the cloud because the current Guacamole address uses HTTP. Local Windows settings remain unchanged.

## 1. Create the database first

In Render, create a **Free PostgreSQL** database in Singapore. Save its External Database URL privately. Render Free PostgreSQL expires after 30 days; export data before expiry. The web service sleeps after 15 idle minutes and may take about a minute to wake. AI providers and existing AWS resources have separate billing; free hosting does not make those services free. See [Render Free limits](https://render.com/docs/free).

Use a new cloud database, not the local development database. In `helpdesk-ai/server`, create the ignored `.security/render-owner.env` file with:

```dotenv
ADMIN_DATABASE_URL="PASTE_RENDER_EXTERNAL_DATABASE_URL_WITH_SSL"
SEED_ADMIN_EMAIL="your-admin-email@example.com"
SEED_ADMIN_PASSWORD="A_NEW_POLICY_COMPLIANT_PASSWORD"
SEED_USER_EMAIL="your-demo-user@example.com"
SEED_USER_PASSWORD="ANOTHER_NEW_POLICY_COMPLIANT_PASSWORD"
```

Keep `sslmode=require` in the connection URL. Allow your current public IP in the database's external access rules while running maintenance. Do not post URLs containing passwords in chat, commit these files, or upload this file to Render/Vercel.

From `helpdesk-ai/server` in PowerShell:

```powershell
npm.cmd ci
npm.cmd run generate
npm.cmd run migrate:deploy -- --env-file .security/render-owner.env
npm.cmd run security:provision-db -- --env-file .security/render-owner.env
node scripts/seed-cloud.js --env-file .security/render-owner.env
```

Provisioning writes only `.security/cloud-runtime.env`; copy its `DATABASE_URL` into Render's API environment. It preserves the local `.env` and `.security/owner.env`. Re-running provisioning rotates `helpdesk_runtime`'s password; update Render if you do so. If the provider refuses role creation, stop and use a PostgreSQL provider that allows a separate restricted role; the API deliberately rejects privileged database users.

Seeding creates the initial admin and demo user with a mandatory password change. Existing accounts are unchanged. No local chat history or module data is copied into the new database. Create or publish your demo modules through the admin interface.

## 2. Create the Render API

Push the reviewed deployment changes to your GitHub repository. In Render choose **New → Blueprint**, select the repository, and use the root `render.yaml`. It selects a Free Node service in Singapore; confirm the plan before creating it. Auto deploy is off. The database is created separately in step 1 so owner credentials never enter the API service.

Provide the prompted environment variables:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Restricted URL from `.security/cloud-runtime.env`; external Render URL initially works with access allowed for Render's outbound IPs; you can later use the database's internal hostname while preserving the restricted username/password |
| `CLIENT_URL` | Your exact Vercel production origin, e.g. `https://your-project.vercel.app`; reserve/create the Vercel project first if needed |
| `AI_PROVIDER` | Your configured provider, e.g. `deepseek` |
| `AI_MODEL` | A model supported by that provider, e.g. `deepseek-chat` |
| `AI_API_KEY` | A newly issued answer-provider key |
| `OPENAI_API_KEY` | A newly issued OpenAI key for moderation (also needed when answers use DeepSeek) |

The Blueprint generates two different JWT secrets and sets `WINDOWS_SIMULATIONS_ENABLED=false`. Do not add `ADMIN_DATABASE_URL`, seed passwords, AWS credentials, or Guacamole secrets to this demo service. Retire previously exposed keys before public deployment. Build uses `npm ci && npm run generate`; start uses `npm start`; readiness is `/api/ready`. Migrations run locally with the owner URL, not inside the runtime service. Free services do not support Render pre-deploy commands.

When Render assigns the public service URL, open `https://YOUR-SERVICE.onrender.com/api/ready`. It must return `{"ok":true}`. A failed first deploy is recoverable: correct environment/access settings, then manually deploy again.

## 3. Configure and deploy Vercel

From the repository root, substitute your real Render URL:

```powershell
node helpdesk-ai/client/scripts/configure-vercel.mjs https://YOUR-SERVICE.onrender.com
```

This writes `helpdesk-ai/client/vercel.json`. Review and commit that file. It proxies `/api/*` to Render and sends client routes such as `/admin` to the SPA. API failures remain API responses. See [Vercel rewrites](https://vercel.com/docs/rewrites).

Import the same GitHub repository in Vercel:

| Setting | Value |
| --- | --- |
| Root directory | `helpdesk-ai/client` |
| Framework | Vite |
| Node | 22.x |
| Build | `npm run build` |
| Output | `dist` |
| `VITE_API_URL` | `/` |
| `VITE_WINDOWS_SIMULATIONS_ENABLED` | `false` |

Do not add API keys, database URLs, JWT secrets, or passwords to Vercel. `VITE_*` values are public. Leave `VITE_GUACAMOLE_ORIGIN` unset for this demo. The build blocks iframe content when Windows labs are disabled. Vercel's same-origin API proxy keeps the existing secure Strict refresh cookie usable.

Update Render's `CLIENT_URL` to the final Vercel production origin, with no trailing slash, then restart/deploy the API. Use the production URL for the demonstration; arbitrary Vercel preview origins are not allowlisted automatically.

## 4. Validate before sharing

1. Open `/api/ready` through the Vercel hostname and confirm it returns JSON, not the app HTML.
2. Sign in as admin, change the seeded password, refresh the page, and confirm sign-in persists.
3. Create a demo user/module; test user login, terminal practice, saved conversations, and admin audit records.
4. Test one AI request with your provider; this may consume API credits.
5. Open `/admin` directly and reload to verify client routing.
6. Confirm Windows modules are absent for users and a direct launch is rejected without creating AWS resources.
7. Confirm API logs show no privileged runtime role error. Do not share logs containing credentials.

## Enabling Windows later

The current `http://13.228.25.121/...` addresses cannot be embedded by an HTTPS app. Configure a stable HTTPS hostname and certificate for Guacamole, then set HTTPS `GUACAMOLE_BASE_URL` and `GUACAMOLE_LAUNCH_URL` on the API. Configure its AWS launch and cleanup credentials separately, and add an independent expiry watchdog before relying on sleeping free hosting for instance termination. Then set backend `WINDOWS_SIMULATIONS_ENABLED=true`, frontend `VITE_WINDOWS_SIMULATIONS_ENABLED=true`, and `VITE_GUACAMOLE_ORIGIN=https://YOUR-GATEWAY-HOST`, rebuild, and test a full launch/end/expiry cycle.
