# Internal application and database security audit

Remediation update: local runtime database privileges, JWT/maintenance-password rotation, server-side lab cleanup, session cooldowns, policy attribution, auditing and targeted throttles have been implemented since this audit. See SECURITY_IMPLEMENTATION.md for verified results and remaining external deployment work. Findings below describe the original audit state and must not be read as a statement that every issue is still unchanged.

Date: 12 November 2026 (Asia/Manila). Scope: local source, current database metadata and access configuration, environment characteristics, and existing automated tests. No security settings, credentials, IAM policies, or application records were changed. This is not a penetration test or certification.

## Priority findings

### H1 — Backend runs as a database superuser (confirmed, high)

Live PostgreSQL reports the runtime identity as `postgres`, with SUPERUSER, CREATEDB, CREATEROLE and BYPASSRLS. All public application tables are owned by postgres. A compromised backend or leaked database credential would have database-wide authority, rather than only the application's required table access.

Use separate migration-owner and application roles. The runtime role should have only required schema usage, table DML and sequence access, with no ownership, superuser, role creation or database creation privileges. Test grants against refresh rotation, advisory locks, request-limit upserts and retention jobs before switching the application. Do not enable RLS as a substitute for removing superuser privileges.

Evidence: read-only pg_roles and pg_class inspection. PostgreSQL documents that superusers bypass permission checks: https://www.postgresql.org/docs/17/role-attributes.html

### H2 — Browser-to-Guacamole connection uses HTTP (confirmed configuration, high)

Current environment URLs for both Guacamole and its launcher use HTTP. The signed/encrypted connection payload is sent as a URL query parameter. Its encryption does not replace TLS: an intercepted bearer link can be replayed within its validity window, and HTTP permits traffic tampering. Production code rejects HTTP, but the current environment is development and permits it.

Deploy TLS at the gateway, update both URLs and validate iframe/websocket connectivity. Avoid recording token-bearing query strings in proxy logs. The configured application URLs were inspected without printing their tokens or credentials.

Evidence: `server/src/services/guacamoleJsonService.js`. Apache requires encrypted user-to-Guacamole communications: https://guacamole.apache.org/doc/gug/security.html

### H3 — Lab termination depends on frontend behavior (confirmed, high operational impact)

The frontend ends a lab before its own Delete action, but `DELETE /api/sessions/:id` and `DELETE /api/sessions` only delete stored chat/conversation data. They do not terminate associated `SimulationSession` instances. Server logout also does not enforce lab termination. A direct API client, browser failure or interrupted frontend flow can bypass the intended lifecycle and leave paid resources running until expiry cleanup.

The hard-delete-user handler already attempts termination before deletion, which is a useful existing pattern. Extend server-side cleanup to relevant deletion/logout operations using trusted, ownership-checked associations. Saved chat JSON is client-writable: do not trust a VM/session identifier from it without checking the simulation owner. Handle in-flight launch/termination races and preserve recovery records on failure. Verify the AWS-side watchdog deployment independently.

Evidence: `server/src/controllers/sessionController.js`, `authController.js`, `adminController.js`, `services/windowsSimulationService.js` and the frontend delete handler.

### M1 — Users can erase policy-event history (confirmed, medium)

Delete-my-data removes `PolicyEvent` rows for the user. Admin counts change and the evidence cannot support persistent abuse controls. This may be intended privacy behavior, but it must be explicit. It is not safe to build strike counts or session restrictions from a user-deletable event table.

Define retention, anonymization and restriction-state lifecycles separately. Do not silently retain personal data against the stated product deletion policy. Current event data contains redacted prompt excerpts, identity and reasons; redaction is best-effort.

Evidence: `sessionController.deleteMyData`, `store/policyEventStore.js`, `utils/redact.js`, `services/retentionService.js`.

### M2 — Internal audit trail has limited coverage and integrity (confirmed, medium)

Admin middleware records non-read admin requests and final HTTP status. It does not record before/after changes, actor-role snapshots, structured targets or reasons. Current database audit row count is zero; that alone does not prove a middleware bypass, since no controlled admin mutation was performed in this review. The superuser application role can also edit/delete audit rows.

Test audit recording with a disposable mutation in an isolated environment. Add bounded, redacted change metadata and actor/target identifiers for sensitive changes, and consider an external append-only sink. Preserve the existing fail-closed behavior when initial audit recording fails.

Evidence: `server/src/middleware/adminAudit.js`, schema `AdminAuditLog`, read-only count.

### M3 — Scope filtering cannot replace authorization (confirmed design limitation, medium)

Model-based policy decisions are contextual and probabilistic. They do not implement a conversation lock or authorize administrative/cloud operations. PolicyEvent still lacks sessionId/requestId and persisted decision provenance. Output scope-check exceptions still collapse to false, which can resemble an output rejection. These are particularly relevant before adding abuse-based session restrictions.

Keep API authorization independent of AI output. Record structured, attributable decisions and keep service failures out of punitive counters. See BLOCKING_ANALYSIS.md for the detailed review.

### M4 — Some expensive/write endpoints lack targeted throttles (confirmed code scope, medium)

AI chat and login are throttled with atomic PostgreSQL counters. Admin module generation, session writes/deletes, and several simulation operations do not have comparable endpoint-specific limits. Authentication, body-size caps, lab quotas and some attempt limits reduce risk, but a compromised account could still generate unnecessary load or cost.

Apply suitable per-user/per-admin operation limits and concurrency controls, especially for model generation and cloud operations. Avoid a single overly broad throttle that prevents recovery or termination.

### Configuration and credential follow-up (high priority, remediation not verified)

Credentials were shared earlier in this conversation, and AWS previously reported a compromised-key quarantine. Rotation and remediation of every affected secret have not been established by this audit. Verify revocation/rotation of affected API keys, signing secrets, gateway secrets and lab credentials as appropriate; never include their values in reports. Static AWS credential variables remain configured; workload roles are preferable for deployments that support them.

The current tracked-file list contains an environment example, not a real `.env` file. This does not establish that secrets never existed in Git history, logs, backups or other copies. A complete history/secret scan was not performed.

## Database access findings and boundaries

- Current runtime connection is local and unencrypted; PostgreSQL SSL is off. This is not a finding of Internet-exposed plaintext database traffic. Require validated TLS if moving the database connection across hosts or an untrusted network.
- `listen_addresses` is `*`, but current parsed HBA entries permit loopback host access and local connections only, using SCRAM-SHA-256. No `trust` entries were observed. Firewall/port exposure was not independently tested.
- PUBLIC has schema USAGE but not CREATE on public, which limits arbitrary schema creation by PUBLIC.
- Foreign keys and unique indexes exist for key identities and ownership relations. The ERD reference omits constraints present in Prisma/live PostgreSQL; it is not a complete restore/migration script.
- No table has RLS enabled. Application-owned queries enforce user filtering in inspected handlers. RLS is optional defense in depth; its absence alone is not proof of cross-user access. The superuser identity is the immediate issue.
- Table timestamps are PostgreSQL timestamps without time zone. The application must consistently interpret stored values as UTC; avoid using ambiguous local-time comparisons for restrictions.
- PostgreSQL connection/disconnection logging is off. Backup encryption, backup permissions, point-in-time recovery and restore testing were not verified.

## Existing protections observed

- Password hashing and current-password verification; password changes rotate credentials and invalidate prior token versions.
- Hashed refresh-token storage, rotation/replay handling and bounded token-family lifetime.
- HTTP-only, SameSite=Strict refresh cookies; Secure in production.
- Database-backed current-role/account checks, admin route protection and initial password-change gate.
- Parameterized Prisma queries and tagged raw SQL in inspected code; no unsafe raw-query use found by the targeted source search.
- Server-owned AI conversation history; client-supplied assistant turns are not trusted for generation.
- User ownership checks and instance ownership-tag validation in inspected lab operations.
- Request-size limits, login/AI throttles, generic errors, secret-redaction helpers and plain-text rendering.
- Server-side lab capacity reservations, expiry and termination retry/reconciliation code. Deployment of external cleanup remains unverified.

## Verification

All 61 current server tests passed. They include authentication, role/ownership handling, policy behavior, and stubbed lab lifecycle checks. Passing tests do not prove live gateway, IAM, browser, dependency or infrastructure security.

Read-only live checks covered role privileges, table ownership/RLS flags, SSL state, relevant server settings, parsed HBA rules, public-schema privileges, selected constraints and an audit count. No stored password hashes, tokens, prompt contents or private keys were output. No brute-force testing, exploit payloads, account mutations, paid instance launches or cloud security changes were performed.

Not verified: deployed AWS policies/security groups/instance isolation, gateway/nginx configuration and logs, TLS certificates, full Git history, dependency advisories, backup recovery, MFA/SSO requirements, and end-to-end multi-user adversarial testing.

## Recommended order

1. Verify credential remediation and protect the public remote-desktop path with HTTPS.
2. Replace the PostgreSQL superuser runtime connection with a tested least-privilege role.
3. Enforce lab lifecycle cleanup on the backend, including deletion/logout and failure races.
4. Define policy-event privacy/retention and independent restriction state before session blocking.
5. Improve audit integrity and operation-specific throttling, then test ownership/abuse scenarios against an isolated database and disposable infrastructure.
