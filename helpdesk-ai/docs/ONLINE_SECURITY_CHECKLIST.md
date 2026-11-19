# Online deployment security checklist

Reviewed: 19 November 2026 (Asia/Manila).

Frontend: `https://helpdesks-ai.vercel.app`  
API: `https://helpdesk-ai-api-abtf.onrender.com`  
Database: Render PostgreSQL, `helpdesk_ai_gxxt`.

This is a code-informed verification checklist, not a penetration-test report or a declaration that the deployment is secure. The review inspected local authentication, authorization, rate limiting, database provisioning, audit logging, retention, AI moderation, Vite CSP, and Vercel routing code. Live dashboard settings, deployed commit parity, AWS rules, database grants, and authenticated behavior still require verification. No production data was modified or attack traffic generated for this document. Every checkbox starts unchecked, including controls already present in code.

Use test accounts and synthetic conversations for behavioral checks. Run destructive, token-replay, rate-limit and outage tests in an isolated staging environment with separate credentials. Keep evidence private and redact passwords, tokens, cookies, prompts containing personal data, and connection URLs.

## 1. Immediate priority: exposed credentials

Credentials have been shared during deployment troubleshooting. Treat any still-active shared value as exposed; a successful deployment does not resolve that exposure.

- [ ] **Critical — Rotate the Render database owner password.** Update only the private Render maintenance file and authorized maintenance tools. Confirm the old password is rejected. Owner credentials must never enter the API service or frontend.
- [ ] **Critical — Rotate the `helpdesk_runtime` password.** Run provisioning once from `helpdesk-ai/server` using the explicit Render maintenance file, then update Render's `DATABASE_URL` from the generated runtime file. Verify the old password fails and the API is ready with the new value. Avoid repeatedly rotating while troubleshooting unrelated errors.
- [ ] **Critical — Revoke exposed OpenAI and DeepSeek keys at their providers.** Create replacement keys, update Render, deploy, and verify old keys are revoked. Merely editing `.env` does not revoke a provider key.
- [ ] **Critical — Replace exposed JWT signing secrets wherever active.** Access and refresh secrets must be different and independently random, at least 32 characters. Expect existing tokens to fail; confirm users must sign in again.
- [ ] **Critical — Replace shared initial admin/demo passwords.** Confirm both accounts completed mandatory first-login password changes. Deactivate unused demo/admin accounts; use separate named admin accounts for accountability.
- [ ] **High — Confirm previously shared AWS credentials are actually disabled**, not only replaced locally. Review AWS account activity and running instances for unexpected usage. Keep AWS credentials off Render while Windows launches are disabled.
- [ ] **High — Rotate active Guacamole JSON and Windows lab secrets** before restoring remote labs. Update both sides together and confirm old launch tokens no longer work.
- [ ] **High — Replace the exposed backup encryption key for future backups.** Retain historical keys privately only as needed for old backups. A new key does not protect previously leaked backup ciphertext encrypted with an exposed key.
- [ ] Review GitHub history and repository access for leaked secrets. Revoke credentials before planning history cleanup. `.gitignore` alone does not remove previously committed secrets.

Do not record replacement secrets in this checklist. Store only rotation date, credential identifier, and reviewer in private evidence.

## 2. Hosting accounts and deployment configuration

- [ ] Enable MFA on GitHub, Vercel, Render, AWS and provider accounts wherever supported. Protect recovery codes and review account members, repository collaborators, OAuth integrations and deployment tokens.
- [ ] Verify both hosting projects deploy the intended repository and branch. Record the deployed commit for frontend and API; a local fix is not a deployed fix.
- [ ] Confirm Vercel Root Directory is `helpdesk-ai/client`; Render Root Directory is `helpdesk-ai/server`. Use lockfile installation and supported Node versions. Avoid selecting a similarly named older repository.
- [ ] Protect the production branch through review/checks appropriate to the team. Review who can change environment variables, deploy code or connect another repository.
- [ ] Keep staging and production secrets and databases separate. Check whether preview builds can reach production data or the production API.
- [ ] Review Vercel preview deployment protection and access. Protection of preview URLs does not automatically mean the production domain or public Render API is protected. [Vercel deployment protection](https://vercel.com/docs/deployment-protection)
- [ ] Confirm deployments are actually running after saving environment changes. Render's **Save only** does not restart the active service. [Render environment settings](https://render.com/docs/configure-environment-variables)

### Required environment review

| Location | Check | Expected result |
| --- | --- | --- |
| Render API | `NODE_ENV` | `production`; startup checks and secure cookies are enabled |
| Render API | `DATABASE_URL` | Restricted runtime role, correct Render database, no surrounding quotes in dashboard |
| Render API | `ADMIN_DATABASE_URL`, seed passwords, backup keys | Absent from runtime settings |
| Render API | `CLIENT_URL` | Exact production HTTPS frontend origin, without trailing slash |
| Render API | `CLIENT_URLS` | Only intentionally permitted origins; remove local/unused origins |
| Render API | JWT secrets | Unique replacement values; never frontend variables |
| Render API | `TRUST_PROXY_HOPS` | Validated for the real Vercel → Render and direct Render paths |
| Render API | AI keys | Complete current provider keys; moderation uses OpenAI separately |
| Render API | `WINDOWS_SIMULATIONS_ENABLED` | `false` for the current demonstration |
| Vercel | `VITE_API_URL` | `/`, using the repository API rewrite |
| Vercel | `VITE_WINDOWS_SIMULATIONS_ENABLED` | `false` for the current demonstration |
| Vercel/browser bundle | Database URLs, JWT secrets, AI/AWS keys | None; `VITE_*` values are public build inputs |

## 3. HTTPS, API proxy, browser headers and caching

The API uses Helmet. The frontend has a build-generated CSP meta tag. The current `client/vercel.json` defines API/SPA rewrites but no custom frontend response headers. API headers alone do not protect the separately hosted frontend document.

- [ ] Verify HTTP redirects to HTTPS for both public hosts and certificates are valid. Check actual response headers rather than assuming platform defaults.
- [ ] Verify `/api/ready` through Vercel returns JSON, and an unknown `/api/...` route remains an API 404 instead of returning SPA HTML.
- [ ] Check frontend headers for anti-framing protection, `X-Content-Type-Options`, `Referrer-Policy`, HSTS and a suitable `Permissions-Policy`. Add missing headers through Vercel configuration after compatibility testing.
- [ ] **High — Address frontend clickjacking protection.** The current CSP meta tag has no `frame-ancestors`; that directive requires an HTTP response header. Choose `frame-ancestors 'none'` or an explicitly justified embedding policy. Test that a separate origin cannot frame the admin/user application. [MDN CSP reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy)
- [ ] Confirm deployed CSP restricts scripts to expected sources and uses `object-src 'none'` and `base-uri 'self'`. With Windows disabled, expect `frame-src 'none'`. Review the existing inline-style allowance; do not fix CSP errors by broadly allowing scripts or every domain.
- [ ] Check browser console for mixed-content errors, unexpected third-party requests and CSP failures. Inspect built JavaScript/assets for accidental credentials; do not paste matches into public issue trackers.
- [ ] Check login, refresh, account, conversations, drafts and audit responses for `Cache-Control: no-store` or equivalent private handling. Current code does not establish one global no-store policy for every authenticated route. Verify responses cannot be served to a different user from Vercel/browser caches.
- [ ] CORS should accept the intended frontend origin and reject an unrelated browser origin. No-Origin requests are currently allowed by design; CORS is not authentication and does not stop direct API clients.
- [ ] Test authorization directly against the public Render API as well as the Vercel proxy. Frontend routing and Vercel protection are not substitutes for backend access control.

## 4. Login, refresh tokens and account lifecycle

Code currently uses password hashing, HS256 JWT verification with issuer/audience, database-backed current account status/role, token versions and rotating hashed refresh tokens. Production refresh cookies are `HttpOnly`, `Secure`, `SameSite=Strict`, scoped to `/api/auth`.

- [ ] Anonymous protected API calls return 401 without returning profile, conversation, lab or audit data.
- [ ] Incorrect credentials and nonexistent accounts return the same public login message. Review timing and abuse behavior in staging.
- [ ] Password creation and changes enforce the central policy. The central helper requires at least 12 characters, but some route validation text still mentions 8; verify behavior and align misleading UI/API validation messages.
- [ ] First-login accounts cannot bypass password changes by calling AI, saved-session, simulation or admin APIs directly.
- [ ] Inspect the refresh cookie through browser DevTools: HttpOnly, Secure, Strict, correct path, expected expiry, and no accidental domain widening. Confirm login persists after refreshing the Vercel frontend.
- [ ] Confirm access tokens are not unnecessarily persisted in browser storage or exposed in URLs/logs. Verify token-bearing API responses are not cached.
- [ ] In staging, verify expired/wrong-signature/wrong-issuer/wrong-audience tokens are rejected. Refresh-token replay should revoke the affected family; the absolute refresh family lifetime is capped at 30 days in code.
- [ ] Confirm password changes and logout-all invalidate old tokens. Test account deactivation and role demotion using an already-open browser session; backend authorization must reflect the change.
- [ ] Verify logout clears the refresh cookie and terminates or queues cleanup for owned labs where relevant. Confirm shared-device back navigation does not reveal another user's information after logout.
- [ ] Test cross-site state-changing requests and origin handling in staging. Preserve Strict cookies and bearer authorization; do not casually switch cookies to SameSite=None to bypass configuration errors.
- [ ] Decide whether admin MFA/session step-up and stronger recovery procedures are needed before storing real user data. The reviewed application login does not demonstrate an implemented MFA flow.

## 5. Admin authorization and user data isolation

Use one admin and two ordinary test users (A and B). Code guards the admin router using token verification and `requireAdmin`; saved-session queries include the authenticated user ID.

- [ ] User A receives 403 when directly calling admin users, policy, drafts, module publishing, audit, or lab-recovery endpoints. Hiding navigation alone is insufficient.
- [ ] User A cannot read/update/delete User B's saved conversations, turns, restrictions, progress or lab sessions by changing IDs in requests. Unknown/inaccessible IDs must not disclose private record contents.
- [ ] Submitted `userId`, `role`, completion status, messages or module IDs cannot override server ownership or grant admin privileges. Test JSON fields that the UI does not send.
- [ ] Verify publishing requires valid server-side simulation assessment/test evidence for the correct revision. Editing steps after testing must invalidate stale test evidence.
- [ ] Confirm terminals and AI-generated actions stay inside the simulation engine. Review new code for host shell execution, arbitrary filesystem access, or untrusted dynamic code before deployment.
- [ ] Check generated steps, titles, instructions and saved conversation content for safe rendering. Use harmless HTML-like markers in staging; verify no HTML/script executes and no untrusted command is automatically run on a real host.
- [ ] Review account deletion effects on conversations, policy events, simulation history and audit attribution. Do not delete production accounts just to test this behavior.

## 6. Database credentials, permissions and network access

The API production startup rejects privileged role flags and maintenance credentials. This checks account flags, not every grant, ownership, membership or schema privilege. The runtime provisioning script also rejects unexpected role memberships.

- [ ] API identity is `helpdesk_runtime` and database is `helpdesk_ai_gxxt`, using read-only SQL below through the runtime connection. Never paste a password-bearing URL into evidence.
- [ ] Runtime role has no superuser, CREATE DATABASE, CREATE ROLE or BYPASSRLS flags, no unexpected role memberships, and does not own application tables. Review effective schema/database CREATE privileges as well.
- [ ] Review effective grants: normal application CRUD where needed; `AdminAuditLog` permits SELECT/INSERT and only status UPDATE; revision/test-receipt tables permit SELECT/INSERT rather than DELETE/UPDATE. Verify privileges, including inherited and PUBLIC grants, without deleting records.
- [ ] Restrict external database access to necessary maintenance IPs. Prefer the same-region internal database hostname for the API, preserving restricted credentials. External access rules do not replace database roles and internal network controls. [Render database connections](https://render.com/docs/postgresql-creating-connecting)
- [ ] Verify TLS settings for the chosen connection route; external connections use the full provider hostname and validated provider-supported SSL settings. Do not disable certificate verification to make a connection work.
- [ ] Confirm all migrations are applied and expected unique constraints exist. Keep schema-owner migration credentials separate from the running API.
- [ ] Verify no SQL query concatenates user-controlled identifiers/values. Review future `$queryRawUnsafe`/`$executeRawUnsafe` usage; provisioning's fixed role/table names do not justify unsafe request-handler SQL.

Read-only SQL, run using the **runtime connection**:

```sql
SELECT current_user, current_database();
SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls
FROM pg_roles WHERE rolname = current_user;
SELECT has_table_privilege(current_user, 'public."AdminAuditLog"', 'DELETE') AS can_delete_audit,
       has_column_privilege(current_user, 'public."AdminAuditLog"', 'metadata', 'UPDATE') AS can_change_audit_metadata,
       has_table_privilege(current_user, 'public."SimulationRevision"', 'DELETE') AS can_delete_revisions;
```

Expected role flags and three mutation privilege results: all `false`. Use additional read-only ownership/membership queries for a complete effective-permission review.

## 7. Abuse, denial of service and AI billing

The API has PostgreSQL-backed counters: login account 20/15 minutes, login IP+account 8/15 minutes, password change 10/minute, refresh 120/minute, AI 20/minute per user, admin writes 60/minute, and draft generation 10/hour per admin. JSON bodies are limited to 256 KB. These controls are not a comprehensive global abuse budget.

- [ ] Verify real client-IP handling through Vercel and direct Render access. A fixed proxy-hop count must not let a direct client spoof IP-based limits or put every user into a shared proxy IP bucket.
- [ ] In staging, confirm the request limits return 429 with Retry-After and cannot be bypassed by process restarts, changing email capitalization or forged forwarded headers.
- [ ] Review global/IP login limits: per-account limits alone do not stop spraying across many accounts and can be used to temporarily deny access to a known account.
- [ ] Configure provider usage alerts, project budgets/limits where supported and AWS billing alerts. Review total daily AI cost, token lengths, concurrency and provider timeouts/retries. Existing per-minute limits alone do not cap total cost.
- [ ] Verify payload and generation limits against long prompts/history and repeated admin drafts. Test controlled boundary cases in staging, not load tests on the free production service.
- [ ] Distinguish a sleeping Render service from an AI/provider failure. Set uptime/error monitoring without treating a health response as proof that login, AI and moderation work.
- [ ] Confirm restricted and blocked prompts do not bypass limits through alternate endpoints or saved-conversation replay.

## 8. AI safety, provider handling and privacy

DeepSeek answers and OpenAI moderation use separate configuration. Production moderation fails closed when unavailable. Scope classification can fall back from local Ollama to the hosted provider; localhost Ollama is not available on Render unless separately provisioned.

- [ ] Verify `AI_API_KEY` belongs to the configured answer provider, and `OPENAI_API_KEY` is valid for moderation. A successful chat response is not proof that every safety dependency is healthy.
- [ ] Verify normal IT prompts, out-of-scope requests and policy-blocked inputs produce intended outcomes. Do not disable production moderation to resolve an outage.
- [ ] Confirm the current frontend shows the backend's actual 503 message instead of always claiming an API key is missing. Check deployed commit parity for this known local fix.
- [ ] Test instruction injection in synthetic user content: attempts to override roles, disclose secrets, forge assistant history or mark a module as tested must not change server authorization or assessment state.
- [ ] Confirm no database credentials, provider keys, Windows passwords or signed Guacamole URLs enter AI prompts, generated output, analytics or ordinary logs.
- [ ] Document which prompt/conversation data is sent to each external AI provider, applicable provider retention settings, and who may view saved messages/policy events. Tell users not to submit real passwords or sensitive helpdesk records during the demo.
- [ ] Establish a deletion/retention policy for prompts, saved conversations and provider-side data; deleting a local record does not automatically delete data already sent to a provider.

## 9. Audit trails, retention and backups

Admin mutations are recorded before execution with a final HTTP status updated afterward. Status 0 means the final response was not recorded. Failed authentication/authorization happens before the admin audit middleware, and GET/read activity is not recorded by that middleware. Metadata is intentionally partial; this is not a complete database change history.

- [ ] Verify the admin audit page is admin-only, paginated and shows current actor attribution without leaking secret fields. Exercise a harmless test-account edit and confirm actor, time, path and result.
- [ ] Confirm failed admin writes and interrupted/status-0 actions can be investigated. Monitor failures updating audit outcomes; an HTTP status alone does not prove exactly which database changes committed.
- [ ] Decide how to monitor failed logins, forbidden admin access, secret changes, deployment events and database-owner actions, which the app's admin mutation log does not fully cover.
- [ ] Export important security events to a separately protected destination. Restrict who can change or delete those exports; the database owner can bypass application-level audit restrictions.
- [ ] Review real retention values: policy/chat defaults are 90 days, with startup and hourly cleanup while the API runs. Sleeping Render services delay those schedules. Audit history requires separate authorized maintenance, not runtime deletion.
- [ ] Define retention for module drafts/revisions/test receipts and infrastructure sessions beyond the scheduled cleanup coverage. Check personal-data deletion against history and backup obligations.
- [ ] **High — Establish encrypted backups outside Render Free storage.** Free PostgreSQL has no managed backup feature and expires after 30 days. Record expiry, backup frequency, destination, responsible person and recovery targets. [Render Free limits](https://render.com/docs/free), [PostgreSQL backups](https://render.com/docs/postgresql-backups)
- [ ] Perform a restore into a separate isolated database and verify users, conversations, audit records, modules and grants. A successful backup command is not a restore test.
- [ ] When using project backup scripts, explicitly select the Render maintenance file and verify the target database. Default owner configuration can otherwise point to local development. Review external-backup SSL behavior and tool compatibility before relying on it.
- [ ] Keep encryption keys separate from backups. Do not store the only backup on Render's ephemeral filesystem or commit it to GitHub.

## 10. Windows/Guacamole: keep disabled until ready

- [ ] Confirm backend `WINDOWS_SIMULATIONS_ENABLED=false`; a direct authenticated Windows launch returns 503 without reserving capacity or launching EC2. User catalog should omit Windows modules; admin management can retain existing drafts.
- [ ] Confirm frontend `VITE_WINDOWS_SIMULATIONS_ENABLED=false` and the deployed CSP disallows frames. A frontend flag by itself is not backend protection.
- [ ] Review running AWS resources even when launches are disabled. Disabling new sessions does not terminate existing instances or the Guacamole gateway, nor stop billing.
- [ ] Before enabling: use a stable HTTPS gateway hostname, valid certificate and HTTPS launch/base URLs. Do not embed the current HTTP gateway in the HTTPS frontend.
- [ ] Restrict Windows RDP to the Guacamole gateway security group/private network; restrict management access and database ports. Review gateway updates, Guacamole authentication and any publicly accessible launch page.
- [ ] Scope AWS permissions to the required resources/actions/tags. Prefer role-based credentials where available; do not grant administrator access just to make launch templates work.
- [ ] Review per-session Windows credentials, RDP security and certificate checks. Existing local settings such as `any`/ignore-certificate need an explicit production review.
- [ ] Verify launch URLs are short-lived, issued only for the owning session and never written to logs/history exports. Treat signed connection URLs as bearer credentials.
- [ ] **High — Implement an independent AWS expiration watchdog before enabling.** API startup/5-minute cleanup timers cannot guarantee termination when Render sleeps or fails. Test expiry, manual end, launch failure, gateway outage and app downtime with a bounded-cost staging lab.
- [ ] Review launch quotas, global instance count and orphan-instance discovery. Verify deactivation/logout/deletion and failed termination remain recoverable from the admin interface.

## 11. Repository and dependency hygiene

- [ ] Check that `.env`, `.security/`, database dumps, screenshots containing secrets, and maintenance files are untracked. Inspect filenames privately; never publish secret-scanner matches.
- [ ] Review tracked dependency/build artifacts. Ignore rules do not remove files already tracked; avoid stale dependencies or public build assets containing past configuration.
- [ ] Run server tests/syntax checks, a production frontend build and dependency audits against the lockfiles. Review findings and patch deliberately; zero npm advisories is not proof the application is secure.
- [ ] Review updates to Express, Prisma, auth/crypto packages, AWS SDK and Guacamole. Keep version upgrades separate from urgent credential rotation unless needed to fix an active vulnerability.
- [ ] Review source maps and source exposure in production bundles for accidental configuration or secrets. Client source should never be relied on to hide authorization logic.

## 12. Minimal non-destructive checks and evidence

From PowerShell, these requests check readiness and anonymous access only. They do not test authenticated authorization, grants or provider credentials:

```powershell
curl.exe -i https://helpdesks-ai.vercel.app/api/ready
curl.exe -i https://helpdesk-ai-api-abtf.onrender.com/api/ready
curl.exe -i https://helpdesks-ai.vercel.app/api/admin/audit
curl.exe -i https://helpdesk-ai-api-abtf.onrender.com/api/admin/audit
```

Expect readiness 200 with `{"ok":true}` when awake and healthy; anonymous audit calls should return 401. Record headers and status privately. A cold start may delay a response. Do not add privileged tokens to shared terminal recordings.

| Area | Reviewer | Date checked | Pass / Fail / Not applicable | Private evidence / follow-up |
| --- | --- | --- | --- | --- |
| Credential revocation and rotation | | | | |
| Hosting accounts and environment | | | | |
| HTTPS, headers, caching and proxy | | | | |
| Authentication and token lifecycle | | | | |
| Admin permissions and ownership | | | | |
| Database identity, grants and network | | | | |
| Rate limits and billing controls | | | | |
| AI checks and privacy | | | | |
| Audit monitoring and retention | | | | |
| Backup restore and database expiry | | | | |
| Windows disabled / readiness gates | | | | |
| Repository and dependency checks | | | | |

## Review frequency and release decision

Check credentials, database permissions/network access, account isolation and backup recovery before inviting real users. Repeat relevant checks after changing auth, roles, migrations, hosting/proxy settings, AI integration or lab infrastructure. Review account access, billing and logs routinely; verify backups on a defined schedule and test restores periodically.

Keep the service in controlled-demo use if exposed credentials are still valid, one user can access another user's data, ordinary users can call admin APIs, audit data is unexpectedly mutable, or recovery cannot be demonstrated. Re-enabling Windows requires completing its infrastructure checks as a separate release decision.

Related documents: [Deployment setup](DEPLOYMENT_VERCEL_RENDER.md), [earlier deployment audit](DEPLOYMENT_AUDIT_2026-11-19.md), [data persistence](DATA_PERSISTENCE.md). Earlier audit findings remain review inputs; this checklist does not mark them fixed automatically.
