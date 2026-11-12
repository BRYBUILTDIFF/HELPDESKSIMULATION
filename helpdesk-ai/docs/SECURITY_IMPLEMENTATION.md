# Security implementation and deployment runbook

Implemented 12 November 2026. This document separates verified local changes from deployment work that still needs access and configuration.

## Verified locally

- Additive migrations `20261112000100_security_controls` and `20261112000200_trusted_lab_links` applied and Prisma client regenerated.
- Backend DATABASE_URL switched from postgres to helpdesk_runtime. Live role checks show no superuser, create-role, create-database or RLS-bypass privileges. Runtime role cannot delete AdminAuditLog or update its metadata; only final status is updateable. Migration-table access is not granted.
- Owner database credentials and backup tools/key are stored in ignored `.security/owner.env`, not in the API environment. Keep that file out of production API deployments. For actual OS-level isolation, run maintenance under a separate identity and keep its secret store inaccessible to the API account; colocated files on the same development workstation are not a hard security boundary.
- Local JWT signing secrets rotated, and the backend restarted. Prior JWTs are no longer valid. Provider credentials and gateway/lab secrets were not rotated.
- Local PostgreSQL maintenance-role password rotated and a new connection verified. Other local clients such as pgAdmin must update their stored maintenance password from the protected owner configuration. Runtime credentials are separate.
- A source-history scan found 11 committed historical server environment blobs. Current AI_API_KEY, GUAC_JSON_SECRET and WINDOWS_LAB_PASSWORD match historical values. No credential values were printed. Rotation of those credentials remains required; working-tree ignoring does not remove old Git blobs. Review and coordinate a Git-history cleanup only after revocation, because rewriting shared history affects every clone.
- Encrypted PostgreSQL backup created using AES-256-GCM with authenticated decryption, then successfully restored into a new disposable database. Key-table queries passed and the disposable database was dropped. No plaintext backup was written to disk.
- Real database transaction checks verified cooldown updates and audit grants; fixture rows were rolled back.
- Live API verification created disposable users, tested cross-user isolation, role denial, cooldown enforcement/reset and sessionId validation, then deleted fixture users. A non-personal audit record for the reset remains by design.
- Production npm advisory checks reported zero known vulnerabilities for both server and client at implementation time. This is not proof of absence of vulnerabilities.

## Policy restrictions

The selected rule is three safety-blocked requests in a fifteen-minute window, followed by a ten-minute conversation cooldown. It applies to `(userId, sessionId)`, not an account-wide ban. A different chat is a different conversation. Ordinary redirects, clarification, service outages and filtered model output do not contribute.

Checks run before AI generation. Violations and their policy events are recorded in one transaction with a PostgreSQL advisory lock per user/conversation. Existing in-flight requests are not retroactively cancelled. Expired cooldowns restart the counter on a subsequent violation; idle restriction records are pruned after a day. Chat deletion does not reset restrictions.

PolicyEvent now has nullable sessionId, requestId, outcome, stage and metadata columns. Older events are interpreted from existing codes; no historical session associations are invented. Output scope outages now have an unavailable decision rather than being indistinguishable from rejected content.

Administrators can inspect/reset restrictions through:

- `GET /api/admin/session-restrictions`
- `POST /api/admin/session-restrictions/:userId/reset` with `{ "sessionId": "..." }`

The policy-event details popup has a reset button for attributable events. Admin actions are audited. Request IDs are server-generated trace IDs, not client-provided retry/idempotency keys; deliberate repeated requests count as repeated requests.

## Deletion, privacy and auditing

Delete-my-data now ends server-owned active labs before deleting chats. It anonymizes policy events (identity, text, reasons, session/request IDs and metadata) instead of removing aggregate security statistics. The UI confirmation explains this. Policy-event retention still follows POLICY_RETENTION_DAYS. Temporary enforcement state expires independently.

New Windows lab launches store a server-owned chatSessionId association alongside the authenticated owner. Single saved simulation deletion uses that association, even if the client alters its saved JSON. The migration backfills only uniquely matching, same-owner legacy links. Legacy Windows records without an associated lab ID cause cleanup of the caller's active labs. Logout verifies the stored refresh credential before selecting a cleanup user. Logout-all revokes credentials and requests cleanup. Cleanup errors during logout do not prevent sign-out; failed labs remain retryable through TERMINATING state/reconciliation. End/delete racing an AWS launch is checked before and after launch so late instances are terminated rather than silently resurrected.

Admin audits include actor-role snapshot, changed field names, selected non-sensitive requested values and prior user role/activation state. Passwords, tokens, prompts and general request bodies are not copied into audit metadata. Structured metadata-only stdout events can be forwarded to an external append-only sink. Runtime cannot delete database audit rows. An owner maintenance identity must handle audit archiving/deletion under a defined retention policy; no automatic destructive audit purge is scheduled.

## Operation limits

- AI: existing 20 requests/minute per user.
- Session writes/deletion: 120/minute per user.
- Admin mutations: 60/minute per admin.
- Admin simulation draft generation: 10/hour per admin, also covered by the mutation limit.
- Lab-launch API attempts: 12/minute per user, in addition to daily/cooldown/capacity quotas.
- Lab connection URL requests: 30/minute per user.

Termination endpoints are deliberately not placed behind the launch/connection limit. PostgreSQL counters work across API workers.

## Maintenance commands

Run from `helpdesk-ai/server`:

```text
npm run migrate:deploy
npm run security:provision-db
npm run security:verify-db
npm run security:verify-api
npm run backup:encrypted
npm run backup:verify -- .security/backups/<backup>.dump.enc
npm run security:scan-history
npm test
```

Owner tools load `.security/owner.env`. Backup encryption keys must be preserved in a separate trusted secret store before relying on offsite backups. Losing the key makes backups unrecoverable; storing the key beside backups does not protect against full workstation compromise. `.security` currently lives inside the workspace, which may be synchronized by OneDrive; configure external retention, ACLs and secret storage deliberately. Do not commit or attach these files.

The default encrypted backup tool buffers dumps in memory with a 256 MB limit; larger installations need a streaming implementation and storage monitoring. Schedule backups/restore drills using the deployment's job runner and monitoring; no workstation backup schedule was installed.

## Pending external deployment — not complete

### HTTPS gateway

The user has no gateway hostname/SSH access available yet. `infrastructure/guacamole/nginx-tls.conf.example` is prepared but not installed or verified remotely.

1. Choose a reachable gateway hostname and obtain a valid TLS certificate.
2. Replace GATEWAY_HOST and APP_ORIGIN in the template with the gateway hostname and exact application origin.
3. Confirm the Guacamole upstream port and launcher path, install the config and launcher, then run `nginx -t` before reloading.
4. Update GUACAMOLE_BASE_URL, GUACAMOLE_LAUNCH_URL and frontend VITE_GUACAMOLE_ORIGIN to HTTPS; rebuild/restart.
5. Verify websocket transport, iframe policy, connection refresh, TLS renewal and logs. Access log format deliberately omits token-bearing query strings. Review error/debug logging separately.

Current development HTTP access remains configured to avoid pointing users at a nonexistent HTTPS service. Production rejects HTTP remote-desktop URLs and privileged runtime database identities. Do not treat development mode as a production bypass.

### AWS expiry watchdog

`infrastructure/aws/watchdog-template.yaml` provides a five-minute EventBridge schedule, tag-scoped termination permissions and a Lambda error alarm. No cloud stack was deployed. From its directory, package with `aws cloudformation package --template-file watchdog-template.yaml --s3-bucket <deployment-artifact-bucket> --output-template-file packaged.yaml`, review, then deploy the packaged template with IAM capability. The Lambda source is the existing cleanup-watchdog.js; verify SDK availability/package dependencies for the deployed runtime. Connect the alarm to an actual notification destination. Verify cleanup with disposable tagged instances before relying on it.

### Credential remediation and infrastructure isolation

Previously displayed provider/gateway/lab credentials require account-side review and rotation. Local JWT rotation cannot revoke AWS/OpenAI/DeepSeek credentials. Check provider consoles/support cases, replace credentials through their supported flows and revoke superseded ones. Migrate deployed AWS access to a workload role where possible.

Validate that Windows instances have no public RDP exposure, only accept RDP from the gateway, have restricted egress, and do not expose an instance profile to students. Gateway/Windows credentials, disk encryption, AWS policies, security groups, external audit storage and certificate renewals were not changed remotely.

## Running backend

The local project nodemon backend was restarted as a hidden process to load the new configuration. Its stdout and stderr are in ignored `.security/backend.log` and `.security/backend-errors.log`. Health/readiness returned HTTP 200, and unauthenticated admin access returned 401. Users need to sign in again after JWT rotation. When returning to your normal terminal workflow, stop that backend listener before starting another on port 5000.

Final verification: 67 server tests passed, server syntax checks passed, frontend production build passed, database security transaction checks passed, and live local API ownership/cooldown/reset checks passed. No paid lab was launched for these tests. Source-history scanning found potential exposed credentials, not a clean result. Known advisories were checked for production npm dependencies; development-tool dependencies were not included in that audit.

## Admin safety keyword configuration

Policy Monitor > Policy Configuration > Rules > Safety Blocks is the database-managed keyword blocklist. Migration 20261112000400_manage_safety_keywords moves the nine former hardcoded sexual-content terms into ordinary editable PolicyRule records, preserving existing additional entries. There is no separate hardcoded sexual-keyword check. Admins can add, edit, or delete every listed keyword; the displayed count is the actual saved list size. New installations and Reset Default use those nine terms as initial defaults. Deletions are not silently restored on restart.

Threat-intent detection and provider moderation remain independent checks. Deleting a keyword removes only its exact keyword restriction, so provider moderation may still reject unsafe content. All keyword matches return SAFETY_CUSTOM_KEYWORD with the organization-policy message. Matching is case-insensitive, literal, Unicode word/phrase bounded, and tolerant of extra whitespace. Input matches count toward the three violations within 15 minutes / ten-minute session cooldown. Output filtering and unavailable checks do not count. Out-of-scope keywords remain contextual IT classifier guidance, not strict safety blocks.

Validation: 70 server tests, syntax checks, frontend production build, and scripts/verify-safety-keywords.js for local authenticated CRUD, persistence, runtime refresh, removal, separate threat protection, and cooldown classification. No external AI request is made by that verifier.

## Verified terminal simulation runtime

See [TERMINAL_SIMULATION_IMPLEMENTATION.md](TERMINAL_SIMULATION_IMPLEMENTATION.md) for the typed action contract, admin test receipts, owned resumable attempts, state-based assessment, publication gating, migrations, audit findings and remaining product limitations. Terminal commands execute only against the fictional server-side model, never an OS shell.
