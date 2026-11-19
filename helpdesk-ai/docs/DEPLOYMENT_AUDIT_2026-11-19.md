# Vercel + Render deployment audit

Date: 19 November 2026 (Asia/Manila)

**Decision: NOT READY for a public production deployment.** The application has useful security controls and passing automated tests, but its current local configuration is not a production configuration. Critical credential and database-privilege findings must be resolved before using production secrets or inviting learners.

## Scope and limits

Reviewed the Vite/React frontend, Express API, authentication, database/schema/migrations, chat and simulation persistence, AI policy/provider integration, EC2 lifecycle, Guacamole launcher/TLS example, repository hygiene, backup scripts, and CI workflow. Checked current provider documentation for Vercel and Render.

Performed local tests, dependency advisory queries, a read-only database role/grant check, a comparison of current configuration against reachable historical server `.env` revisions, and production build checks. No secret values are reproduced in this report. No credentials, production code, security groups, database records, or cloud resources were changed as remediation during this audit.

This is a source/configuration/readiness audit, not a penetration-test certification. Vercel/Render projects are not connected for inspection. Actual deployed cookie behavior, TLS headers, gateway containers, AWS network rules, IAM policy documents, EventBridge watchdogs, production backup recovery, load limits, and browser compatibility remain unverified. Earlier AWS inspection could read instance metadata but was denied security-group rule inspection. The user reports that the local Windows lab now works; that does not establish production HTTPS readiness.

## Verified results

| Check | Result |
| --- | --- |
| Backend automated suite | **86/86 passed**; many external-service scenarios use stubs. |
| Backend JavaScript syntax | Passed. |
| npm advisory audit, frontend and backend | **0 currently reported advisories** in either lockfile, including build dependencies. This is not a guarantee that packages contain no vulnerabilities. |
| Production frontend build with current unset production variables | Fails as intended: exact `VITE_GUACAMOLE_ORIGIN` required. |
| Production frontend build with synthetic HTTPS gateway origin | Passed; output written to a temporary audit directory. No real deployment resulted. |
| Runtime database identity from current `server/.env` | **postgres**, with SUPERUSER, CREATEDB, CREATEROLE and BYPASSRLS all enabled. |
| Current runtime permission to delete audit/revision records | **Allowed** under that identity; intended append-only protection is bypassed. |
| Existing least-privilege database verification script | **Failed**, consistent with the role check above. |
| Current local secrets matching historical committed `.env` values | **AI_API_KEY, GUAC_JSON_SECRET, WINDOWS_LAB_PASSWORD, DATABASE_URL**; 13 historical environment blobs examined. Values not printed. This compares the local setup, not unknown future Render secrets. |
| Tracked installation/build artifacts | **20,084 files under node_modules**, plus **8 application dist files**. `.gitignore` does not untrack already committed files. |
| Deployment configuration | No application `vercel.json` or `render.yaml` found. A GitHub Actions verification workflow does exist. Dashboard-only configuration has not been inspected. |

## Findings requiring resolution before deployment

### C01 — Current local credentials still match committed history

**Severity: Critical. Status: confirmed for the current local configuration.**

The four configuration keys listed above still match reachable historical `.env` revisions. Ignoring the present file does not remove earlier versions. A private repository also does not make previously exposed credentials safe to reuse.

Impact: provider usage abuse; creation of valid Guacamole login payloads while the gateway secret remains valid; access to the shared Windows lab account where network access permits; and database access wherever the historical database credentials are accepted. A historical localhost URL is not evidence that a database is publicly reachable, but its password must not be reused in production.

Required action: rotate the actual credentials at their authorities, synchronize the new Guacamole secret on the gateway/API, update the AMI or provisioning mechanism for the new Windows password, revoke superseded credentials, and confirm the new values do not match history. Merely rewriting Git history is not credential revocation. Do not copy the local `.env` wholesale to Render. AWS keys and JWT secrets were not exact matches in this particular comparison; that does not certify their complete exposure history.

Evidence: ignored `.security/deployment-audit-secret-summary.json`; `.gitignore`; `server/scripts/scan-repository-secrets.js`.

### C02 — Runtime database is currently a superuser

**Severity: Critical. Status: confirmed locally; production startup blocker.**

The API's current `DATABASE_URL` selects `postgres`, not `helpdesk_runtime`. It can delete `AdminAuditLog` and `SimulationRevision` rows. The production startup guard in `server/src/server.js:119` explicitly rejects this privileged identity, so copying this setup to Render will also prevent startup.

Required action: provision a dedicated runtime role on the target managed database, grant only application-table access, preserve append-only grants, and use its credentials in Render's runtime `DATABASE_URL`. Use an owner identity only in a separate migration/maintenance process. Existing local grants do not automatically transfer to a new database. Verify the actual target role flags and audit/revision permissions after provisioning.

Evidence: read-only PostgreSQL role/grant queries; `server/scripts/verify-security-db.js`; `server/scripts/provision-runtime-role.js`.

### B03 — Separate default Vercel/Render domains conflict with refresh-cookie policy

**Severity: High / release blocker for direct cross-site API access. Status: confirmed code behavior; deployed-browser test pending.**

`server/src/controllers/authController.js:20` sets the refresh cookie to `SameSite=Strict`, `HttpOnly`, and `Secure` in production. The frontend keeps access tokens only in memory and restores a session through the refresh endpoint. A browser frontend at a Vercel domain calling an unrelated Render domain is cross-site: CORS and `withCredentials` do not override SameSite restrictions. Initial login can appear successful because it returns an access token; restoration/refresh then fails.

Preferred resolution: retain Strict cookies and proxy `/api/*` through the Vercel frontend origin to Render. An alternative is HTTPS custom subdomains under the same registrable domain, with exact CORS configuration. If unrelated direct domains are required, implement and test `SameSite=None; Secure` together with explicit CSRF/origin defenses and third-party-cookie handling. Do not switch to None as the entire fix.

References: [MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie), [Vercel external rewrites](https://vercel.com/docs/routing/rewrites).

### B04 — Current HTTP Guacamole URLs cannot serve the production HTTPS app

**Severity: High / Windows-lab release blocker. Status: confirmed local configuration and code.**

The current gateway URLs use HTTP. `guacamoleJsonService.js` rejects HTTP in `NODE_ENV=production`. Independently, an HTTPS page cannot embed an HTTP desktop iframe. The production Vite CSP also requires the exact final gateway origin at build time.

Required action: deploy gateway HTTPS with a valid browser-trusted certificate and stable hostname; configure both Guacamole URLs, `VITE_GUACAMOLE_ORIGIN`, Nginx frame permissions, WebSocket upgrade handling, and launcher path consistently. Validate the nested launcher/client iframe, not only the gateway landing page. The checked-in Nginx TLS example is a starting point, not proof of a deployed TLS configuration.

Reference: [MDN mixed content](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Mixed_content).

### H05 — EC2 expiration depends on a running API process

**Severity: High / cost and lifecycle risk. Status: confirmed design; independent watchdog unverified.**

`server/src/server.js` starts EC2 cleanup every five minutes and retention cleanup hourly. These timers stop when the API is down. The browser-to-Guacamole connection goes directly to AWS; it does not inherently keep Render's API active. Render Free spins down after 15 minutes without inbound traffic, so a lab can remain running after its deadline while the API sleeps. Startup reconciliation helps after a restart but is not an independent expiry mechanism. `AutoTerminateAt` is a tag, not an AWS termination schedule by itself.

Required action: use an always-on API for reliable service and an AWS-side scheduled watchdog independent of Render, restricted to the exact project/purpose/session tags and expiry policy. Test abandonment, API shutdown, failed termination and redeploy cases with a disposable authorized lab. Do not terminate all labs on every deployment.

Reference: [Render Free service lifecycle](https://render.com/docs/free).

### H06 — Cloud database provisioning and migration credentials need a separate deployment path

**Severity: High / API startup and data-transfer blocker. Status: configuration gap.**

The current database is localhost. Render cannot use the developer PC's localhost database. A migrated schema also does not copy existing users, chats, modules or completion history.

The migration script requires `ADMIN_DATABASE_URL`, while the production API refuses to start if that variable exists. Setting the owner URL on the same Render service just for a pre-deploy command will leave it available to runtime too. Do not remove the runtime guard to work around this.

Required action: choose a durable managed database, normally in the same region as the API; migrate/restore real data through a tested procedure; provision the restricted runtime role; run owner migrations in a separate controlled job/CI identity; and keep owner credentials out of the API service environment. Limit external database access to approved administration/migration sources. Managed role permissions differ: verify the provisioning script against the target provider before running it.

Render pre-deploy commands are available on paid web services, but their availability does not solve owner-secret separation. Free Render Postgres currently expires after 30 days and is unsuitable as an assumed permanent datastore.

References: [Render Postgres connectivity](https://render.com/docs/postgresql-creating-connecting), [Render deployment stages](https://render.com/docs/deploys), [Render Free limitations](https://render.com/docs/free).

### H07 — Vercel routing and production environment values are not defined in the repository

**Severity: High / release blocker unless configured elsewhere. Status: confirmed repository gap.**

The project uses BrowserRouter routes such as `/dashboard` and `/admin`; Vite's development proxy does not exist in a static Vercel deployment. A default `VITE_API_URL=/` will call Vercel, where there is no API unless a rewrite is configured. Refreshing a nested SPA route also needs a fallback.

Required action: set the Vercel root to `helpdesk-ai/client`, generate `dist` from a clean install/build, configure API proxy routing before the SPA fallback, and set the final HTTPS gateway origin at build time. Ensure API 404s remain API JSON responses, not `index.html`. Do not use `vite preview` as the production hosting server.

References: [Vite SPA deployment on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [external rewrites](https://vercel.com/docs/routing/rewrites).

### H08 — Gateway access must work for learner browsers, not only the developer PC

**Severity: High / multi-user availability blocker. Status: documented development design; current deployed rules unverified.**

The AWS implementation guide allows gateway HTTP/SSH from My IP. Learners connect directly from their own browsers to the gateway, so a developer-only allowlist will block learners even if the frontend/API are deployed successfully. Allowing Render's outbound IPs alone does not solve browser-to-gateway access.

Required action: define the intended learner network/access policy for HTTPS 443; restrict administrative SSH separately; retain private RDP 3389 only from the gateway security group; and test from a second intended learner network. If external databases or remote classifiers are IP-restricted, use Render's documented service outbound ranges for those API-to-service paths, not for browser desktop traffic.

References: local AWS guide sections 3–4; [Render outbound IPs](https://render.com/docs/outbound-ip-addresses).

### H09 — Current working-tree RDP configuration defaults to ignoring certificates in production

**Severity: High. Status: confirmed source behavior; not yet changed by this audit.**

The current modified `server/src/services/guacamoleJsonService.js` defaults `WINDOWS_LAB_SECURITY` to `any` and `WINDOWS_LAB_IGNORE_CERT` to `true`, with no production restriction. It also allows explicit legacy `rdp` security mode. The guide documents these as troubleshooting settings; they are not automatically suitable production defaults.

Required action: define the supported production RDP security/certificate policy and test it against the actual AMI. Fail closed for disallowed production settings, use verified certificates and a supported strong security mode, and keep troubleshooting exceptions explicit and environment-limited. Do not blindly force NLA before confirming the Windows image supports the chosen configuration. This change requires compatible gateway/AMI configuration, not just a UI edit.

### H10 — Main AI requests can outlive the Vercel proxy request

**Severity: High / reliability and cost. Status: confirmed code and installed SDK defaults.**

The shared OpenAI-compatible client is created without timeout/retry overrides. The installed SDK defaults to a 600,000 ms timeout and two retries. Main answer generation, module generation and moderation have no explicit short deadline; scope-provider calls do have a separate deadline. Vercel's documented proxied-request timeout is 120 seconds. A browser can time out while paid work continues, and manual retries can generate duplicate work.

Required action: impose an end-to-end request budget below the selected deployment path's limits, explicit per-provider timeouts/retries and output limits, cancellation where supported, and request idempotency for generation. Move genuinely long work to a durable job with status polling. Keep the Windows boot wait in its existing asynchronous lifecycle; do not turn the initial API request into an eight-minute request.

Reference: installed `server/node_modules/openai/core.js:138`; [Vercel request limits](https://vercel.com/docs/limits).

## Additional hardening and operational findings

### M11 — Reverse-proxy trust must be tested for the actual request chain

`TRUST_PROXY_HOPS` is currently unset. Render and a possible Vercel proxy alter the chain. Incorrect trust can either merge user IPs or trust attacker-supplied forwarding information. Determine the real chain and test both the intended frontend route and direct backend requests with forged forwarded headers before selecting a value. Do not set an arbitrary number solely to suppress a warning. The limiter counters themselves are PostgreSQL-backed and shared across processes, which is a strength.

Evidence: `server/src/server.js:28`, `server/src/middleware/requestLimits.js`.

### M12 — AI availability requires more than the answer-provider credential

Production moderation requires an OpenAI moderation credential, even when answer generation uses DeepSeek. Baseline-only fallback is deliberately unavailable in production. A moderation failure blocks requests. The optional local classifier defaults to localhost:11434; on Render that address means the Render instance, not the developer PC. Scope classification does fall back to the configured hosted provider, so missing Ollama is not by itself a total outage, but it can add latency and cost. Related-ticket semantic fallback still uses the local endpoint.

Required action: configure and verify both generation and moderation, decide whether the local classifier is deployed or intentionally unused, and expose safe dependency status separately from basic liveness. Do not publicly expose an unauthenticated Ollama service to reproduce local behavior.

Evidence: `server/src/utils/openai.js`, `server/src/policy/contentSafety.js:42`, `server/src/policy/promptPolicy.js:239`.

### M13 — Source control still contains installed dependencies and generated outputs

Tracked Windows Prisma artifacts and stale frontend assets can obscure what a release actually builds and inflate deployment contexts. Ignore rules already exist, but tracked files remain tracked.

Required action: remove tracked installation/build artifacts from the index in a dedicated reviewed change, preserve local files, use lockfiles plus clean `npm ci`, and regenerate Prisma for Linux during the Render build. Keep secrets, keys, `.security`, backups and temporary audit data out of deployment artifacts. This audit does not remove files or rewrite history.

### M14 — Health, shutdown and background startup checks need production verification

Use `/api/ready` for database readiness rather than only `/api/health`. Readiness currently checks a database query, not required schema version, moderation/provider configuration or gateway health. Policy initialization starts after the HTTP listener, so a health response does not mean every dependency is ready. No explicit SIGTERM drain/disconnect handler was found. Render deploys can replace the process while requests are in flight.

Required action: fail startup for missing required production configuration, drain in-flight work on SIGTERM, stop local timers, disconnect Prisma cleanly, and preserve resumable labs across deploys. Export failed cleanup and dependency status to alerting. Do not log secret connection strings or bearer launch URLs.

Reference: [Render health checks](https://render.com/docs/health-checks).

### M15 — Retention, read sizes and transcript recovery have remaining limits

Session loading fetches up to 500 JSON documents plus 5,000 trusted turns, and saving reads all trusted turns for the session. These are large bounds for a public service, with no session-list pagination. Trusted turn creation is not stopped by the transcript's 1,000-message/200 KiB save ceiling. Replies in `ChatTurn` are truncated to 4,000 characters, while generation has no matching output bound; recovery after an interrupted UI save can therefore lose the remainder of a long answer.

New drafts, test receipts, revisions, completions, dismissal records, audit history and Windows session history do not all have an archival/pruning policy. Revision/receipt immutability is intentional and should use a separate authorized maintenance identity for archival, not broader runtime grants.

Required action: paginate summaries and load a selected chat separately; bound conversation/AI sizes consistently; test long-answer recovery; define retention and archive policies for each record type; and accurately label chat deletion versus account/security-record deletion.

Evidence: `server/src/controllers/sessionController.js`, `server/src/store/chatHistoryStore.js`, `server/src/services/retentionService.js`.

### M16 — Simulation metrics must preserve their evidence level

Terminal results verify catalog actions in fictional server state. Windows completions remain self-reported and are not OS task validation. Pass rate correctly remains unavailable without an agreed failure denominator. Detailed attempts can age out while completion totals remain. The expiry policy, immutable module revisions, and signed administrator test receipts improve auditability but do not make these records exam-grade competency evidence.

Required action: report verified simulated actions separately from self-reported desktop completion; define whether partial Windows completion counts; test users finishing from an intermediate step; and agree on historical evidence retention before publishing scores.

### M17 — CI is useful but does not yet prove deployed behavior

The existing workflow uses clean installs, Prisma generation, unit tests, one PostgreSQL integration suite, advisory checks and a frontend build. It does not execute the new opt-in durable-persistence suite, production cross-site-cookie browser tests, Vercel deep links/proxy behavior, gateway HTTPS/CSP/WebSocket checks, SIGTERM recovery, or real expiry after API downtime.

Required action: add these cases using an isolated test database and disposable authorized infrastructure. Current 86 passing tests include mocked EC2/provider behavior; they are not evidence of a deployed production end-to-end pass.

### M18 — Backup and frontend delivery need explicit production ownership

The encrypted backup script writes under `.security/backups` and requires PostgreSQL tools plus an external encryption key. Render's filesystem is ephemeral; local backups on the API filesystem are not durable off-site recovery. Configure managed backups/PITR where supported, exports to protected durable storage, key recovery and a restore drill. Verify what the selected paid/free database plan actually includes.

The frontend emits a meta CSP, but Vercel response-header hardening has not been configured in the repository. Verify frontend frame restrictions, HSTS and other required headers at the hosting layer; Express Helmet does not set headers on Vercel-served HTML. The production JS chunk is about 1.01 MB (about 297 KB gzip) and the logo asset about 1.02 MB; route-level lazy loading and image optimization are useful after blockers are resolved.

References: [Render filesystem behavior](https://render.com/docs/free), [managed Postgres backup features](https://render.com/docs/postgresql-creating-connecting).

## Controls that should be retained

- Access tokens remain in memory; refresh tokens use HTTP-only cookies, hashed database representations, rotation and replay-family handling.
- User role, activation and token version are checked against PostgreSQL; mandatory password changes gate protected routes. Public registration is disabled.
- Exact-origin CORS, explicit development LAN rules, Helmet on the API, parameterized Prisma operations, bounded request bodies and redacted errors are present.
- AI context comes from server-authored turns rather than trusted client assistant messages; policy checks fail closed on important production dependencies.
- Chat/draft optimistic versions detect stale saves. Saved drafts are owner-scoped. Terminal test approvals are signed and backed by stored receipts, and revisions preserve snapshots.
- EC2 launch inputs come from a server-configured launch template, not arbitrary browser AMI/subnet parameters. Sessions have ownership checks, idempotent launch tokens, quotas, expiry tags, and startup/orphan reconciliation.
- No application `dangerouslySetInnerHTML`/`innerHTML` rendering was found in the reviewed React source; earlier simulation XSS remediation appears retained. This is a search/review result, not a formal proof of absence of XSS.
- The browser's desktop stream uses Guacamole directly. Vercel/Render do not need to host the Windows VM or carry its RDP socket.

## Proposed deployment shape

```text
Browser
  -> HTTPS Vercel frontend
       /api/* rewrite -> HTTPS Render Express API -> managed PostgreSQL
                                            -> hosted AI/moderation
                                            -> AWS EC2 control plane
  -> HTTPS Guacamole gateway -> private Windows VM:3389

Independent AWS scheduler -> expire application-owned Windows VMs
Separate migration job -> owner credentials -> managed PostgreSQL
Render API -> restricted runtime credentials only
```

Recommended choices are provisional until the final domains, plans and learner-access policy are selected. Prefer an always-on API and durable managed database for real learners; do not assume a sleeping free service performs scheduled cleanup.

### Vercel settings to prepare

| Item | Required value/decision |
| --- | --- |
| Root directory | `helpdesk-ai/client` |
| Install/build | Clean `npm ci`, then `npm run build` |
| Output directory | `dist` |
| Node | A tested Node 22 release satisfying `>=22.12`; package range currently excludes Node 25+. |
| `VITE_API_URL` | `/` for the proposed same-origin API proxy |
| `VITE_GUACAMOLE_ORIGIN` | Exact final HTTPS gateway origin, without path |
| Routing | API rewrite preserving `/api` prefix, then SPA fallback |
| Preview deployments | Separate test backend/database or explicit exact allowed preview origins; never broadly trust every vercel.app origin |

Example routing **for review, not installed by this audit**:

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://YOUR-SERVICE.onrender.com/api/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Do not embed JWT, AWS, AI, Windows, Guacamole or database secrets into any `VITE_*` value; frontend build values are public. Rebuild when frontend origin/API configuration changes. Set private API/auth responses to appropriate no-store behavior and verify proxy cookie forwarding/cache behavior in a real browser.

### Render settings to prepare

| Item | Required value/decision |
| --- | --- |
| Root directory | `helpdesk-ai/server` |
| Build | Clean `npm ci`, then `npm run generate` |
| Start | `npm start` with `NODE_ENV=production` |
| Port | Use Render-provided `PORT`; the code already reads it and does not bind only to localhost |
| Health path | `/api/ready`, with dependency/config validation added or checked separately |
| Database | Restricted-role managed database URL, internal connection when API and DB share Render account/region |
| Migration owner | Separate controlled job; never `ADMIN_DATABASE_URL` on the API service |
| CORS | Exact final HTTPS frontend origin(s), without trailing path/slash |
| Proxy trust | Explicit value verified against the actual Render/Vercel chain |
| Auth | New distinct JWT secrets and verified cookie/session-restoration topology |
| AI | Hosted answer-provider configuration plus working production moderation credential |
| Windows | AWS credentials/region/template, explicit quotas and independent cleanup |
| Guacamole | HTTPS base/launcher URLs, rotated matching JSON secret, tested Windows credentials/security/cert policy |

The repository does not currently supply a complete `server/.env.example`; create one with placeholders and documented required/optional keys before handoff. Keep secrets in the platform's protected configuration and use separate staging/production values.

## Release acceptance checklist

- [ ] Previously exposed production-equivalent credentials revoked/rotated; working-tree and historical scans reviewed without printing values.
- [ ] Target database restored/migrated and backed up; runtime role is nonprivileged; audit/revision update/delete denials verified.
- [ ] Owner migrations run outside the API runtime; cold production startup succeeds without owner credentials.
- [ ] Clean Linux dependency install and Prisma generation verified; tracked dependency/build artifacts addressed.
- [ ] Vercel deep-link refreshes work for login/dashboard/admin; API misses remain API errors.
- [ ] Login, page reload, access expiry, concurrent-tab refresh, logout and logout-all work in Chrome/Edge and Safari/Firefox as applicable.
- [ ] Exact CORS, forwarded-IP handling, cookies and frontend/API security headers verified on deployed origins.
- [ ] Guacamole HTTPS, launcher, embedding headers, WebSockets and private RDP tested from an intended learner network.
- [ ] Production RDP certificate/security exceptions removed or explicitly approved with a documented scope.
- [ ] Production generation/moderation timeouts and failure messages tested without duplicate side effects.
- [ ] Independent lab expiry works with the Render API stopped; reconnect/redeploy preserves valid sessions; failed termination alerts reach an operator.
- [ ] Draft autosave/reload, stale conflicts, completed-test recovery, module revisions and publication verified in staging.
- [ ] Chat recovery/deletion, long responses, quotas, pagination and retention verified at expected data size.
- [ ] Backup restored into an isolated target; operational owners, budgets and recovery steps documented.

Resolve C01/C02 and B03/B04 before a public release. Then finish the deployment/expiry blockers and validate the acceptance checklist in staging. The audit intentionally leaves application/configuration remediations for a separate implementation step.
