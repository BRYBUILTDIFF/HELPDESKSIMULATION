# HelpDesk AI security

Last reviewed: **12 November 2026**. Applies to the current repository and local development deployment, including uncommitted implementation changes present during review.

## Security status

The application has implemented authentication, database-backed authorization, ownership checks, throttling, AI safety checks, administrator auditing, controlled simulations, and encrypted backup tooling. These controls were inspected in source and exercised locally where listed below. **This is not a declaration that the application is ready for public production deployment.** Remote AWS, Guacamole, operating-system permissions, and production hosting were not inspected directly.

| Area | Current evidence/status |
| --- | --- |
| Authentication and role/ownership controls | Implemented; unit and local API checks pass. |
| Least-privilege database runtime and audit grants | Verified against the local PostgreSQL database. |
| Policy blocking and conversation cooldown | Implemented; database transaction and API checks pass. |
| Terminal assessment and publication | Server-owned state and exact-definition admin test receipts; local API checks pass. |
| Windows lab ownership and cleanup logic | Source review and mocked AWS tests; no paid instance launched during this audit. |
| Encrypted backups | Fresh authenticated backup and disposable restore passed. |
| Production dependency advisories | Server and client production dependency trees each report zero known advisories at review time. |
| Historical credentials | Reachable Git history contains potential credential matches; revocation/rotation is not verified. |
| Gateway HTTPS and cloud isolation | Local remote-desktop URLs use HTTP in development; production infrastructure verification remains pending. |

## Scope and trust boundaries

- The browser is untrusted. Client-supplied role, owner IDs, saved conversation JSON, completion flags, and step indexes are not authorization evidence.
- Express authenticates API requests; Prisma accesses PostgreSQL using the runtime database role. Maintenance tools use a separate owner credential.
- AI prompts and relevant history can be transmitted to configured AI/moderation services. Keyword checks and storage redaction are not a guarantee that secrets never reach a provider.
- The browser terminal is a fictional assessment environment. Supported actions change server-side simulation state; commands do not execute through an operating-system shell.
- The Windows lab is separate: the API provisions tagged EC2 instances and issues temporary Guacamole access URLs.
- Database, backup, host, gateway, and cloud administrators remain privileged trust boundaries. Application controls do not protect against an administrator or compromised maintenance identity.

The audit reviewed server routes/controllers/middleware, authentication utilities, Prisma schema and relevant migrations, policy checks, terminal execution, Windows lifecycle, Guacamole integration, frontend authentication/rendering/build configuration, secret scanning, and maintenance tooling. It was not an exhaustive adversarial penetration test or a review of every dependency's implementation.

## Implemented security controls

### 1. Accounts and passwords

- Public self-registration is not routed; account creation is administrator-controlled.
- Passwords are hashed with bcrypt at cost 12.
- The central password policy for new/changed passwords requires at least 12 characters, at most 72 UTF-8 bytes, and excludes a small common-password list. The byte limit avoids bcrypt truncation. The login route's eight-character minimum is a compatibility input constraint, not the password creation policy.
- Initial password change is enforced by API middleware when mustChangePassword is set. Only the necessary account/password/session-revocation endpoints are allowed until completion.
- Inactive and unknown accounts receive the same login failure response.
- Password change verifies the current password, rejects reuse of the current value, increments tokenVersion, deletes old refresh credentials, and issues replacement credentials transactionally.
- Administrator account changes are protected by role checks and auditing. Existing last-administrator safeguards use transactional locking.

Sources: [password policy](helpdesk-ai/server/src/utils/security.js), [password hashing](helpdesk-ai/server/src/utils/password.js), [authentication controller](helpdesk-ai/server/src/controllers/authController.js), [admin controller](helpdesk-ai/server/src/controllers/adminController.js).

### 2. Access and refresh sessions

- Access and refresh JWTs use separate secrets; startup rejects equal secrets or secrets shorter than 32 characters.
- JWT validation restricts the algorithm to HS256 and verifies issuer and audience. Access tokens default to 15 minutes.
- Each authenticated request reads the current database user, role, activation, password-change requirement, and tokenVersion. A stale JWT role claim cannot grant administrator access.
- Access tokens are held in React memory; legacy local-storage access tokens are removed.
- Refresh credentials are held in HttpOnly, SameSite=Strict cookies, restricted to /api/auth, with Secure enabled in production.
- Refresh credentials are stored using a hashed token key rather than the raw JWT. Rotation uses a transaction/advisory lock and a single-use stored credential.
- Random token/family identifiers distinguish sessions. Detected reuse of a missing consumed refresh token revokes the corresponding stored family.
- Refresh families have a 30-day absolute lifetime, independent of rolling refresh expiry.
- Sign out everywhere increments tokenVersion and removes refresh credentials. Password changes also invalidate previous access tokens immediately through the version check.
- Ordinary single-session logout revokes its refresh credential and requests lab cleanup. **It does not immediately revoke an already issued access JWT**; that token remains usable until expiry unless another action changes tokenVersion or user eligibility.

Sources: [JWT utilities](helpdesk-ai/server/src/utils/jwt.js), [authorization middleware](helpdesk-ai/server/src/middleware/authMiddleware.js), [browser authentication](helpdesk-ai/client/src/context/AuthContext.jsx).

### 3. Authorization and user isolation

- All administrator routes require verified authentication and the current ADMIN database role before handlers run.
- Saved chats use a composite authenticated user/session identity. User identifiers in request JSON are not trusted for ownership.
- Simulation attempts, lab status/connect/end operations, and completion checks verify the authenticated owner and module association.
- Terminal completion uses server evidence, not a supplied completed-step count.
- Server-owned lab/chat associations support cleanup even when a user changes saved client JSON. Legacy references are checked for ownership before termination.
- Cross-user access tests exercise denial without granting another user's resource.

Sources: [admin routes](helpdesk-ai/server/src/routes/admin.routes.js), [chat sessions](helpdesk-ai/server/src/controllers/sessionController.js), [terminal attempts](helpdesk-ai/server/src/controllers/simulationAttemptController.js), [lab controller](helpdesk-ai/server/src/controllers/simulationSessionController.js).

### 4. Database security

- The local API uses helpdesk_runtime. Live checks show no superuser, create-role, create-database, or RLS-bypass privilege.
- Runtime permissions cover required application operations. AdminAuditLog permits reads/inserts and final-status updates, but denies runtime deletion and metadata modification. Migration-table access is not granted to the runtime role.
- Production startup rejects privileged runtime identities and maintenance database credentials in the API environment.
- Migration/backup tools explicitly load ignored maintenance configuration; the running API does not load that file.
- Database operations use Prisma and parameterized tagged SQL in the reviewed request paths. Advisory locks serialize quota, refresh, cooldown, terminal, and relevant administrator operations.
- Schema constraints and transactions protect ownership identities and idempotent completion records.

Limit: this is an application-owned shared database, not row-level tenant isolation. A compromised runtime database credential can access its granted tables across users. No application-wide field encryption or verified production disk/database TLS configuration is established by this review.

Sources: [schema](helpdesk-ai/server/prisma/schema.prisma), [runtime provisioning](helpdesk-ai/server/scripts/provision-runtime-role.js), [live permission verifier](helpdesk-ai/server/scripts/verify-security-db.js).

### 5. Request validation, throttling, and HTTP controls

- Express JSON requests are limited to 256 KB. Saved chats additionally enforce matching IDs, at most 1,000 messages, a 200 KB serialized limit, and a transactional 500-session-per-user quota.
- Route validation checks identifiers, types, lengths, allowed surfaces and supported values.
- Atomic PostgreSQL request counters are shared across API workers, return HTTP 429 with Retry-After, and do not silently bypass enforcement on database failure. Counter fingerprints are hashed.
- Current source limits include login account 20/15 minutes; login account/IP pair 8/15 minutes; refresh 120/minute per token or IP fallback; password change 10/minute per user; AI 20/minute per user; session writes 120/minute per user; admin mutations 60/minute per admin; AI module generation 10/hour per admin; terminal attempt creation 30/hour per user; terminal action submission 120/minute per user; Windows launch 12/minute per user; connection URL requests 30/minute per user.
- Lab termination is not placed behind launch/connection throttles that would prevent cleanup.
- CORS uses configured origins. Development additionally permits matching private-network origins on port 5173. Requests without Origin are allowed; CORS is not authorization.
- Proxy trust is explicit and must be configured to the actual trusted proxy hops.
- Helmet is installed on the API. Production client builds add a meta Content Security Policy restricting scripts, API connections, frames, objects, base URI and form destinations.
- The frontend uses React escaping/plain descriptions rather than trusting AI/admin HTML. The build policy still permits inline styles and selected external font sources.

Limits: production frontend response headers must be configured by its host. API Helmet headers do not automatically protect a separately hosted frontend, and the meta CSP is not a frame-ancestors anti-framing policy. A dedicated CSRF-token mechanism is not implemented; cookie protections and bearer-authenticated API operations must be preserved during deployment changes.

Sources: [API bootstrap](helpdesk-ai/server/src/server.js), [request counters](helpdesk-ai/server/src/middleware/requestLimits.js), [Vite/CSP configuration](helpdesk-ai/client/vite.config.js).

### 6. AI safety and policy enforcement

- Input safety checks precede model generation; output safety/scope checks can withhold unsafe generated content.
- Administrators manage strict Safety Blocks keywords in the database. Matching uses escaped literal words/phrases, Unicode-aware boundaries, case-insensitive matching and whitespace normalization. There is no separate hardcoded sexual-keyword list that silently overrides deletion.
- Threat-intent checks and provider moderation remain independent. In production, unavailable moderation fails closed rather than allowing unchecked input.
- Out-of-scope keywords are contextual classifier guidance, not a strict keyword denylist. They cannot bypass safety checks.
- Policy outcomes distinguish blocked requests, ordinary redirects, filtered output, allowed requests and unavailable checks.
- Three safety-blocked requests within 15 minutes cause a 10-minute cooldown for the user/conversation pair. Ordinary off-topic redirects, clarification, service failures and filtered output do not count.
- Events and strike updates are transactional. Restriction resets require an administrator and are audited. Deleting chats does not reset enforcement state.

Limits: this is a conversation restriction, not an account-wide ban; a new session is a different conversation. Model/classifier judgments are probabilistic, and keyword matching can reject legitimate context. Development-only baseline fallback is supported by configuration but was not enabled in the inspected local environment. Safety controls are not a prompt-injection-proof security boundary or a substitute for access control.

Sources: [content safety](helpdesk-ai/server/src/policy/contentSafety.js), [prompt policy](helpdesk-ai/server/src/policy/promptPolicy.js), [restrictions](helpdesk-ai/server/src/services/sessionRestrictionService.js).

### 7. Terminal simulation integrity

- Terminal modules use supported action IDs, explicit commands, checkpoint types and deterministic state transitions. AI cannot add executable OS code to the action registry.
- Instructions, commands and expected output are retained separately. Expected output must agree with the modeled state; actual output is computed by the action, not echoed from administrator text.
- Admin tests use the same transition engine as users. Publication requires a completed, one-hour HMAC test receipt bound to the exact normalized definition and authenticated admin.
- Attempts belong to the authenticated user/module, have a two-hour expiry, and retain server-owned progress/state. Client flags are reconciled from owned server status.
- Action submissions are serialized. Wrong commands/order do not advance state; assessed errors increment mistakes. Help/clear and blank input do not earn completion.
- Successful retries are checked against prior evidence. Completion is idempotent, requires full server evidence and the current module definition, and is marked simulated-actions.
- Ended/expired attempts cannot continue normally. Existing legacy untyped modules are preserved for repair and disabled by migration; the account-lockout lesson has a typed upgrade.
- The /simulations route uses the shared dashboard catalog, rather than a separate public execution path.

Limits: successful practice is not proof of real administrator actions, real login or a repaired Windows system. The action catalog intentionally supports only defined scenarios. Command events retain up to the latest 200 assessed actions per attempt; total mistakes are cumulative. See the raw-command retention finding below.

Sources: [terminal engine](helpdesk-ai/server/src/services/terminalRuntime.js), [attempt controller](helpdesk-ai/server/src/controllers/simulationAttemptController.js), [terminal implementation/audit](helpdesk-ai/docs/TERMINAL_SIMULATION_IMPLEMENTATION.md).

### 8. Windows labs and Guacamole

- Lab creation reserves capacity transactionally and enforces ownership, active-instance capacity, configured daily quotas, cooldowns and expiry.
- Launches use EC2 client idempotency tokens and session/user/application tags. Launch requests require IMDSv2 and restrict metadata hop count; actual template/network configuration still needs cloud verification.
- Termination checks the instance SessionId tag. AWS reconciliation considers actual running/shutting-down instances, not only database rows.
- Expired and retryable TERMINATING sessions are cleaned up on API startup and every five minutes while the API runs. An independent watchdog template exists but is not verified as deployed.
- Late launch/delete races are checked so a cancelled session does not silently leave a newly launched instance running.
- Status/connect requests check ownership, expiry and instance availability. Cleanup is requested on chat deletion, delete-my-chat-data, logout and logout-all as applicable; cleanup failure remains retryable.
- Guacamole payloads are signed/encrypted according to the JSON authentication extension format: HMAC-SHA256 plus AES-128-CBC. This is not the AES-GCM backup format.
- Connection-token lifetime defaults to five minutes, bounded by the lab expiry and a 60-900 second configured range. Treat token-bearing URLs as bearer credentials.
- Production rejects HTTP gateway URLs. RDP uses NLA; certificate ignoring is allowed only with an explicit development setting.
- The embedded gateway uses a restricted iframe sandbox, no-referrer policy, and explicit clipboard/fullscreen permissions. The production CSP restricts frame origins.

Limits: local development gateway URLs currently use HTTP. HTTPS gateway installation, RDP security-group rules, private-subnet design, instance-profile exposure, egress, disk encryption, gateway logs/certificates and the watchdog deployment were not remotely verified. The shared configured Windows lab password remains a credential-management concern. Cleanup depends on AWS permissions and availability.

Sources: [Windows service](helpdesk-ai/server/src/services/windowsSimulationService.js), [Guacamole service](helpdesk-ai/server/src/services/guacamoleJsonService.js), [gateway template](helpdesk-ai/infrastructure/guacamole/nginx-tls.conf.example).

### 9. Privacy, redaction, retention and audit evidence

- Best-effort redaction covers recognizable API keys, AWS key IDs, bearer credentials, private keys, password-like assignments and credential-bearing URLs in the reviewed storage paths. It is not comprehensive DLP.
- Saved chats are redacted before persistence. Delete-my-chat-data ends owned labs before removing chats/history and anonymizes attributable policy events while retaining aggregate security evidence.
- Default policy/chat retention is 90 days; hourly cleanup also removes expired history, refresh credentials, request counters and stale restriction state. Terminal attempts are pruned according to the chat retention cutoff after their expiry. Backups and audit records have separate operational retention needs.
- Administrator mutations create an audit record before the handler. Metadata includes role snapshot, action path/method, changed field names and selected non-sensitive values/prior states. Passwords, secrets, general request bodies and test receipts are not copied into audit metadata.
- A final audit status is recorded on response completion. Status zero means no final response status was recorded. Runtime cannot delete audit rows or rewrite metadata; owners remain able to administer the database.
- Error responses/logging avoid general raw parser bodies, database connection URLs, provider headers and request contents. Structured audit output can be forwarded to a separate sink, but external collection is not established here.

**Deletion scope:** delete-my-chat-data is not full account erasure and does not remove all terminal attempts, completion records, administrator audits or backup copies. Retention and privileged deletion procedures must cover these separately.

Sources: [redaction](helpdesk-ai/server/src/utils/redact.js), [retention](helpdesk-ai/server/src/services/retentionService.js), [admin audit](helpdesk-ai/server/src/middleware/adminAudit.js), [error handler](helpdesk-ai/server/src/middleware/errorHandler.js).

### 10. Secrets and encrypted backups

- Environment/private maintenance files are ignored in the working tree. The API does not load maintenance owner configuration.
- Earlier implementation work rotated local JWT signing secrets and the local PostgreSQL maintenance password. This review does not independently prove third-party or deployed credential revocation.
- Maintenance backup tooling encrypts PostgreSQL dumps with authenticated AES-256-GCM and verifies authenticated decryption before restore. The current backup/restore drill passed in a disposable database.
- Backup tools avoid writing a plaintext dump to disk. The current implementation buffers a dump in memory with a 256 MB limit.

Limits: private files, keys and backups coexist on the development workstation under the same OS identity, inside a workspace that can be synchronized. Ignoring files is not an OS access boundary and does not erase Git history. External key storage, independent/offsite copies, scheduling, monitoring and restore drills remain operational responsibilities.

Sources: [encrypted backup](helpdesk-ai/server/scripts/secure-backup.js), [restore drill](helpdesk-ai/server/scripts/test-backup-restore.js), [maintenance environment loader](helpdesk-ai/server/scripts/owner-config.js).

## Current audit findings and required follow-up

Priorities below are contextual assessments from this code/local-environment review, not CVSS scores or proof of exploitation.

| Priority | Finding and evidence | Outcome required |
| --- | --- | --- |
| High | The history scanner found 78 potential matches across 575 inspected source blobs; historical environment files remain reachable. These are candidate matches, not 78 confirmed active credentials. Provider/gateway/lab rotation is unverified. | Review and revoke/rotate affected credentials in their owning systems; then coordinate history cleanup and review provider logs. Never attach raw environment/history dumps to a ticket. |
| High before public deployment | The inspected environment is development mode and remote-desktop configuration is HTTP. Production code rejects HTTP, but TLS is not installed by a code guard. | Configure and verify application/gateway HTTPS, certificates, proxy headers and production mode before exposing the service publicly. |
| High before cloud reliance | Live AWS IAM, RDP exposure, gateway hardening and independent expiry watchdog deployment are unverified. | Verify tag-scoped permissions, network isolation, instance identity exposure and cleanup with disposable cloud resources under explicit operator control. |
| Medium | TerminalRuntime.advance stores raw assessed command strings in SimulationAttempt JSON. Saved-chat redaction does not cover this path. Learners could paste real credentials accidentally; delete-my-chat-data does not delete those attempts. | Redact sensitive command/event content before persistence while preserving separate assessment/retry evidence; align attempt deletion and retention with the user-facing data policy. Do not describe all stored text as redacted. |
| Medium | No administrator MFA implementation was identified. Password and session controls alone remain the account takeover boundary. | Add an appropriate second factor for privileged access and recovery procedures before broader administrative exposure. |
| Medium | Login/refresh counters have per-account, account/IP, or token keys, but no single aggregate edge/IP budget across changing identifiers. Attackers can create many distinct limit keys and database work. | Add edge/global abuse limits, bounded counter storage/monitoring and careful trusted-proxy configuration without blocking lab termination. |
| Medium | Owner credentials and backup encryption keys are colocated with the development API workspace under the same OS identity. | Separate maintenance identity/ACLs and secret storage in deployment; maintain independent encrypted backups and key recovery. |
| Medium | Local audit protections are database grants, not an external immutable evidence store. Backup scheduling, retention and alert destinations are not established here. | Export audit evidence to separately controlled storage; define backup/audit retention and alert ownership. |
| Medium | Production frontend security headers depend on the hosting layer; meta CSP does not supply frame-ancestors. | Verify host-level anti-framing, HTTPS and other applicable response headers against the actual deployed frontend, not only the API. |
| Low/behavioral limit | Single logout leaves issued access JWTs valid until expiry; cooldowns are per conversation; terminal training is not a real shell. | Keep these semantics explicit; use logout-all/version revocation when immediate broad invalidation is required. |

No source-only review establishes the absence of other vulnerabilities. The strongest current evidence is the specific reproducible verification below.

## Verification performed for this review

| Check | Result and scope |
| --- | --- |
| Server unit tests | 80 passed; no skipped tests reported. |
| Server syntax check | Passed. |
| Database security verifier | Runtime role/audit permissions and transactional cooldown checks passed; verifier fixture transactions rolled back. |
| Local authentication/API verifier | Ownership isolation, administrator denial, cooldown/reset and session identity checks passed using disposable accounts. |
| Safety keyword API verifier | Admin-only CRUD, persistence, runtime refresh, removal and enforcement classification passed. |
| Terminal API verifier | Draft gating, actor/definition-bound receipts, wrong-order errors, state transitions, ownership, resume, retry/idempotency, ended/expired attempts and invalid definitions passed. |
| Isolated PostgreSQL integration | Passed; migrations and command/ownership checks ran in a disposable schema, removed afterward. |
| Encrypted backup/restore | Fresh backup authenticated and restored; selected key-table queries passed in a disposable database. |
| npm production dependency checks | Current server and client each returned zero known advisories; development dependencies were excluded. This is not proof of vulnerability-free code. |
| Source-history secret scan | 575 blobs inspected, 23,532 skipped, 78 potential matches. Scanner excludes dependency/build directories and selected large/non-source formats; uncommitted working-tree secrets were not covered. Finding remains open. |
| Local environment metadata | Development mode; gateway HTTPS false; maintenance URL absent from API environment; baseline-only moderation fallback false; non-privileged helpdesk_runtime role confirmed. No credential values printed. |

Recent terminal browser checks also exercised clipboard fallback, Ctrl+V, typed commands, long-output scrolling and reload on desktop/mobile. These are functional regression evidence, not a comprehensive browser exploit audit. No AWS instance was launched, gateway modified, live provider AI request purchased, shared Git history rewritten or external credential revoked in this review.

## Reproduce the safe checks

Run from helpdesk-ai/server:

~~~powershell
npm test
npm run lint
npm run security:verify-db
npm run security:verify-api
node scripts/verify-safety-keywords.js
node scripts/verify-terminal-runtime.js
npm run security:scan-history
npm audit --omit=dev
~~~

Run npm audit --omit=dev from helpdesk-ai/client for that dependency tree. Treat a network/advisory-service error as an unavailable check, not a clean result. The secret scanner deliberately reports findings without printing secret values; potential matches require review and are not automatically false positives.

Integration and restore drills require maintenance privileges and isolated test targets. Follow the maintenance runbook rather than granting the API database owner privileges. Some verifiers create disposable accounts/modules and retain non-sensitive administrator audit records by design. Do not aim local test scripts at production without adapting and reviewing their fixture/cleanup behavior.

## Deployment and incident operations

1. Close the high-priority credential, TLS and cloud-isolation findings before public deployment.
2. Deploy secrets through a protected mechanism; never add API secrets to VITE_ variables or frontend bundles. Rotate leaked credentials before treating repository cleanup as remediation.
3. Use the least-privilege runtime role; keep migration/backup credentials and keys out of the API environment and identity.
4. Verify real origins, proxy hops, secure cookies, frontend headers, gateway certificates, websocket transport and Guacamole logging. Do not record token-bearing URL query strings.
5. Deploy and test independent lab expiry cleanup and alerts; startup/in-process cleanup alone cannot operate during an API outage.
6. Establish backup schedules, external audit collection, restore drills and a retention/deletion policy covering attempts, completion records, audits and backups.
7. On suspected exposure, contain access, revoke affected provider/gateway credentials, invalidate application sessions as needed, preserve restricted audit evidence and investigate under the relevant operator's authority. Do not publish secret values in an issue or chat.

## Reporting security issues

No dedicated private security contact or reporting mailbox has been configured in this repository. Report suspected issues privately to the project owner/authorized administrator. Include affected behavior, reproduction steps, impact and sanitized evidence; exclude passwords, API keys, bearer URLs, personal chat content and raw database dumps. Do not open a public issue containing exploit-sensitive details or live credentials.

## Related documentation

- [Security implementation/deployment runbook](helpdesk-ai/docs/SECURITY_IMPLEMENTATION.md)
- [Earlier security audit](helpdesk-ai/docs/SECURITY_AUDIT_2026-11-12.md)
- [Terminal implementation and critique](helpdesk-ai/docs/TERMINAL_SIMULATION_IMPLEMENTATION.md)
- [Original terminal findings](helpdesk-ai/docs/TERMINAL_SIMULATION_ANALYSIS.md)
- [Policy/blocking analysis](helpdesk-ai/docs/BLOCKING_ANALYSIS.md)

These documents include historical snapshots. This file's verification table records the fresh checks for this review; unresolved deployment items must not be interpreted as implemented merely because a template exists.
