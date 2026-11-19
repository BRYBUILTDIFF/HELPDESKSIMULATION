# Deployed application: codebase security audit and implementation backlog

Review date: 19 November 2026 (Asia/Manila).

Implementation follow-up: the immediate/high-priority source changes are documented in [Security release setup](SECURITY_RELEASE_SETUP.md). This report preserves the findings at audit time; implementation does not establish provider revocation, production deployment or infrastructure verification. The release runbook distinguishes completed code from required account-side work.

## Conclusion and scope

The application has substantial security controls, but the reviewed source is not yet a fully verified production baseline. Prioritize credential revocation, bounded resource usage, sensitive-response protection and administrator authentication before expanding beyond a controlled demonstration. Do not interpret the absence of a demonstrated exploit as a clean bill of health.

This audit inspected the current local Express/React/Prisma code, deployment configuration, Guacamole launcher and cleanup infrastructure, and ran the normal server checks. It did not access hosting dashboards, inspect live database grants, perform authenticated penetration testing, launch/terminate AWS instances, rotate credentials, or modify application behavior. A clean working tree at review start does not prove that these commits are deployed to both hosts.

Use OWASP ASVS 5.0 as the verification baseline: establish applicable Level 1 requirements first and assess Level 2 controls for real user data and privileged administration. This is a targeted review, **not ASVS certification or an exhaustive requirement-by-requirement assessment**. [OWASP ASVS](https://asvs.owasp.org/)

Priority: **P0** immediate containment; **P1** before broader public use; **P2** next hardening release; **P3** maintenance. Severity describes the potential impact in the stated circumstances, not a confirmed production compromise. "Confirmed" refers to source behavior; "verification required" means the deployment state remains unknown. Recommended design controls are identified separately from exploitable defects.

## Verification performed

| Check | Result |
| --- | --- |
| Normal server test suite | **99 passed, 0 failed**, `npm test` |
| Server syntax checks | Passed, `npm run lint` |
| Tracked sensitive environment files, excluding examples | 0 in current Git index |
| Tracked `.security/` files | 0 in current Git index |
| Tracked `node_modules` files | **20,083** |
| Tracked frontend `dist` files | **8** |
| Provider calls, live role/grant verification, external scanning | Not performed in this audit |
| Fresh npm advisory database queries | Not performed; passing unit tests do not establish dependency safety |
| Opt-in database/infrastructure integration suites | Not run in this audit; the normal suite excludes `*.integration.js` |

Test output is saved locally in `.tmp/current-security-tests.log`; do not commit runtime output containing private data. No credentials are reproduced in this report.

## Controls already present — preserve these

- Backend admin router applies token verification and `requireAdmin`. Token verification fetches the current user role/status/version from the database rather than trusting an old role claim. Password-change-required accounts are restricted.
- Bcrypt hashing uses cost 12; password creation/change checks the shared policy, including the bcrypt byte-length limit. Unknown accounts use a dummy hash and a generic login failure.
- JWT verification pins HS256, issuer and audience. Refresh tokens are hashed in storage, rotated transactionally, grouped into families and capped at a 30-day absolute family lifetime. Password changes/logout-all invalidate credentials through token versions.
- Refresh cookies are HttpOnly, Secure in production, SameSite=Strict, scoped to `/api/auth`. The frontend keeps access tokens in React state and removes a legacy localStorage token.
- Saved-session and Windows-session queries include authenticated ownership. Main model context is reconstructed from server-owned chat turns rather than trusting editable client assistant messages.
- JSON body limits, route validators and PostgreSQL-backed rate counters exist. CORS has an explicit origin list; database outages fail request limits closed.
- Production startup rejects maintenance credentials and privileged runtime-role flags. Provisioning gives audit/revision/test-receipt tables narrower mutation privileges than ordinary application tables.
- Terminal attempts and module publication have server-side state/revision/test evidence. Windows launch quotas, expiration tags, owner checks and cleanup paths exist; an independent watchdog is supplied.
- Content safety fails closed in production. Common secret patterns are redacted before main chat persistence/provider use; errors generally return sanitized public messages.
- CI already runs syntax/unit checks, one database integration suite, dependency audits and a frontend build. This backlog extends existing checks rather than replacing them.

## Findings and implementation requirements

### A01 — Previously exposed credentials need revocation evidence

**Priority P0 · Potential severity Critical · Known exposure; current validity unverified**

Credentials were shared during earlier troubleshooting. Current ignore rules and an empty secret-file index do not revoke historical keys or prove replacements were applied. This is an incident-containment requirement, not a newly discovered hardcoded-key finding.

**Implement/complete:** revoke old provider/AWS keys; rotate active database owner/runtime passwords, JWT signing secrets, Guacamole/Windows credentials and backup keys as applicable. Use separate environments and scoped credentials. Add secret scanning on new commits/PRs and a controlled history scan. Preserve old backup decryption keys privately only where recovery requires them.

**Acceptance:** private rotation register identifies revoked credentials without storing their values; old credentials fail; replacement configuration works; repository history has a documented cleanup decision. Never publish scanner matches.

### A02 — Sensitive API responses lack a consistent no-store policy

**Priority P1 · Severity Medium · Confirmed configuration gap**

Evidence: [server middleware/routes](../server/src/server.js), [auth responses](../server/src/controllers/authController.js), [session responses](../server/src/controllers/sessionController.js), [Windows connect responses](../server/src/controllers/simulationSessionController.js). Searching the source finds explicit `Cache-Control: no-store` only in the audit controller. These other responses include tokens, personal conversations or signed connection links. This does not prove Vercel currently shares them between users; browser/intermediary cache behavior still needs testing.

**Implement:** a consistent no-store policy for auth and authenticated/sensitive API responses, including errors. Preserve appropriate CORS `Vary` behavior. Apply it to public Render access and proxied Vercel access without disabling normal immutable static-asset caching.

**Acceptance:** integration tests assert headers for login, refresh, me, saved chats, audit and lab connect; deployed response inspection confirms the policy; no personalized response is reused for a second account.

### A03 — Frontend lacks configured security response headers

**Priority P1 · Severity Medium · Confirmed repository gap; effective hosted headers unverified**

Evidence: [vercel.json](../client/vercel.json) contains rewrites but no headers. [Vite config](../client/vite.config.js) injects a CSP meta tag, which has no anti-framing policy. Helmet on the Render API does not configure headers on the separately served Vercel HTML.

**Implement:** frontend response headers covering `frame-ancestors`, MIME sniffing, referrer policy and an appropriate permissions policy; verify platform HSTS. Keep the app itself unframeable unless embedding is intended. Plan a tested HTTP CSP rollout, accounting for the real HTTPS Guacamole origin and current styles/fonts. A `frame-ancestors` response header cannot be replaced by putting that directive in the HTML meta tag. Do not overwrite Guacamole's distinct gateway embedding policy.

**Acceptance:** deployed app cannot be framed by an unrelated site, intended Windows iframe still works, no required assets break, and header regression checks cover HTML/deep links. [CSP reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy)

### A04 — AI work has insufficient time, output and concurrency bounds

**Priority P1 · Severity High · Confirmed resource-control gap**

Evidence: [AI clients](../server/src/utils/openai.js), [chat completion](../server/src/controllers/aiController.js), [admin generation](../server/src/controllers/adminController.js), [moderation](../server/src/policy/contentSafety.js). Main clients do not explicitly set timeout/retry limits; the installed SDK defaults to **600,000 ms and two retries**. Main answer generation has no explicit output token ceiling. The scope-classifier fallback already sets a 15-second timeout and zero retries; preserve that distinction.

**Implement:** explicit provider-specific timeout/retry policies, an end-to-end request deadline, output token limits, per-user/global concurrent-work caps and bounded daily usage reservations. Release reservations in `finally`; handle provider failure and client disconnects. Per-minute request limits do not cap overlapping work or total spend.

**Acceptance:** slow/failing mock providers terminate within the configured deadline; cancelled/failed requests release capacity; parallel requests cannot exceed caps; retries cannot multiply provider calls unexpectedly; safety remains fail-closed.

### A05 — Chat-turn persistence bypasses saved-chat storage quotas

**Priority P1 · Severity High · Confirmed resource-control gap**

Evidence: [chat controller](../server/src/controllers/aiController.js), [chatHistoryStore](../server/src/store/chatHistoryStore.js), [session save limits](../server/src/controllers/sessionController.js). Session saving caps chats at 500, messages at 1,000 and JSON size at 200 KB. The chat endpoint accepts an arbitrary valid-length session ID and appends durable `ChatTurn` rows without applying an equivalent turn/conversation quota. User-scoped rate limits still allow accumulated growth across many session IDs; expired-data cleanup is delayed when Render sleeps.

**Implement:** server-owned conversation creation, bounded active conversation count and per-conversation/account turn or byte budgets at the point of append. Enforce atomically; define behavior for legacy/recovered sessions. Add paginated retrieval instead of returning up to 500 sessions plus 5,000 turns in one request.

**Acceptance:** changing session IDs cannot bypass quotas; concurrent writes respect limits; exhaustion returns a clear bounded response; another user's data is unaffected; old-session recovery remains correct.

### A06 — No application MFA or step-up for privileged actions

**Priority P1 · Severity High for admin compromise · Recommended privileged-access control**

Evidence: [auth routes](../server/src/routes/auth.routes.js), [auth controller](../server/src/controllers/authController.js), [admin router](../server/src/routes/admin.routes.js). Application authentication is password-based; no admin MFA enrollment/challenge/recovery flow or recent-authentication gate is present in those paths. Cloud-account MFA does not protect the application's own admin login.

**Implement:** admin MFA through a suitable identity provider/passkeys/TOTP, rate-limited challenge and enrollment, hashed recovery codes where appropriate, and session revocation on recovery changes. Require recent authentication/step-up for role grants, password resets, irreversible deletion and policy/security changes. Recheck authority transactionally for sensitive mutations where needed.

**Acceptance:** knowing only an admin password is insufficient; recovery cannot bypass MFA; step-up expiry and audit events are tested; ordinary users cannot enroll or alter another user's factors. [OWASP MFA guidance](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)

### A07 — Login abuse coverage and proxy identity need strengthening

**Priority P1 · Severity Medium · Confirmed limit gap; proxy bypass requires deployment testing**

Evidence: [server.js](../server/src/server.js), [requestLimits](../server/src/middleware/requestLimits.js). Login has per-email and IP+email counters, but no broad login IP/global budget. Rotating attempted account names avoids those aggregate protections. Numeric `TRUST_PROXY_HOPS` is used while the API is reachable both through Vercel and directly on Render.

**Implement:** layered login IP/account/global limits with bounded counter-cardinality and appropriate account-lockout tradeoffs. Verify forwarded-header handling against actual Render/Vercel behavior before changing the trust policy. Do not trust arbitrary client-supplied forwarding headers or assume every request traverses the same proxy chain.

**Acceptance:** staging tests cover many-account spraying, legitimate users behind one address and forged forwarding headers on both ingress paths. Account-wide throttling cannot be trivially bypassed; alerts identify sustained abuse without logging credentials.

### A08 — Security event coverage is narrower than admin mutation auditing

**Priority P2 · Severity Medium · Confirmed visibility gap**

Evidence: [adminAudit](../server/src/middleware/adminAudit.js), [auth middleware](../server/src/middleware/authMiddleware.js), [auth controller](../server/src/controllers/authController.js). Audit middleware runs after successful admin authorization, skips reads and records an attempted mutation plus final HTTP status. Failed logins, denied admin requests, refresh-token replay and credential-lifecycle events lack an equivalent consistent security-event trail here. HTTP success is not a complete committed-change diff.

**Implement:** a structured security-event service for auth failures/successes as appropriate, role/account/factor changes, refresh replay, denied privileged access and lab cleanup failures. Add safe request/correlation IDs, event limits/retention and external protected export/alerts. Separate untrusted request metadata from verified actor identity; never log raw tokens or prompts by default.

**Acceptance:** security scenarios generate useful redacted events; log injection and sensitive-field tests pass; audit update failures alert; the runtime cannot arbitrarily rewrite/delete security history.

### A09 — Chat retries are not idempotent before paid provider work

**Priority P2 · Severity Medium · Confirmed integrity/cost gap**

Evidence: [chatHistoryStore](../server/src/store/chatHistoryStore.js), [ChatTurn schema](../server/prisma/schema.prisma), [chat controller](../server/src/controllers/aiController.js). Client `userMessageId` can be stored, but there is no unique request constraint or in-flight/completed reservation before generation. A timed-out retry can generate another paid response and append duplicate turns. The append lock serializes inserts, not the earlier provider calls.

**Implement:** a scoped idempotency key validated at the route, associated with a request hash and user/conversation. Reserve atomically before generation; return/recover the original result and reject reuse with different input. Define expiration and failed-request retry behavior.

**Acceptance:** parallel identical requests incur one provider generation and one durable result; mismatched key reuse fails; retries after timeouts recover safely without forging history.

### A10 — Windows labs share static account credentials

**Priority P1 · Severity High if a lab reveals reusable credentials · Confirmed design risk**

Evidence: [Guacamole JSON service](../server/src/services/guacamoleJsonService.js) reads one environment username/password for all lab connections. Instances cloned from a shared AMI may therefore share credentials. Tokens encrypt those credentials in transit but do not create per-instance identity. Isolation and actual student privileges depend on the deployed AMI/network, which were not inspected.

**Implement:** per-session/per-instance credentials or equivalent brokered identity, least-privileged student accounts, isolated egress/lateral access and no production secrets in the AMI. Deliver bootstrap credentials through an authenticated mechanism and erase them at termination. Review clipboard, file transfer, drive mapping and student privilege requirements explicitly.

**Acceptance:** one lab's credentials cannot authenticate to a different lab; users cannot access gateway/admin credentials; credentials are never returned in API JSON/logs; re-creation does not restore a known shared password.

### A11 — Permissive RDP security defaults and connection-link handling

**Priority P2 · Severity Medium · Confirmed defaults; deployment values unverified**

Evidence: [Guacamole JSON service](../server/src/services/guacamoleJsonService.js) defaults security to `any` and certificate ignoring to `true`, including production. Short-lived signed/encrypted connection links are passed through a query string, as required by the current integration; they remain bearer credentials while valid. The launcher stores a query-bearing page URL, and cache/log policies require end-to-end verification.

**Implement:** production configuration validation for an explicitly chosen RDP mode and certificate/trust strategy. Review every proxy/upstream log, browser referrer/cache policy and sharing path for bearer-link exposure. Minimize TTL to the usable boot/retry requirements; evaluate launcher URL cleanup and connection token invalidation limitations against Guacamole behavior. Do not invent incompatible crypto changes to the Guacamole protocol.

**Acceptance:** invalid/missing production settings fail clearly; gateway WebSockets and nested frames work; logs omit tokens; expired links fail; isolation tests cover the still-valid link threat model.

### A12 — Windows completion is self-reported, not observed task success

**Priority P2 · Severity Medium when completion is used as assessment evidence · Confirmed intentional behavior**

Evidence: [recordModuleCompletion](../server/src/store/simulationModuleStore.js). Windows completion requires an owned live workspace but trusts the requested step count and records `verification="self-reported"`. Terminal completion has stronger server-side attempt validation. This is not a cross-user access vulnerability; it is a trust boundary for grading/analytics.

**Implement:** visibly distinguish self-reported completion from verified skill assessment. If used for grading, add server/guest-observed checks of required Windows state bound to module revision/session; do not accept checkbox counts as proof. Define which Windows module tests constitute verified publication evidence separately.

**Acceptance:** merely starting a desktop and posting all steps does not earn a verified result; UI/export labels reflect verification strength; real checks are resistant to client request editing.

### A13 — Sensitive account operations need stronger password policy consistency

**Priority P2 · Severity Medium · Confirmed policy weakness; validation copy issue Low**

Evidence: [security helper](../server/src/utils/security.js), [auth routes](../server/src/routes/auth.routes.js), [admin routes](../server/src/routes/admin.routes.js). The shared minimum is 12 characters with a six-item common-password list, while several route checks/messages say 8. Controllers enforce the stronger helper for password creation/change, so this is not proof that new eight-character passwords are accepted.

**Implement:** central validators/messages; a meaningful common/breached-password blocklist without sending plaintext passwords to a third party; deliberate password length policy appropriate to MFA deployment; credential input-size caps before bcrypt work. Keep paste/password-manager support and explicit handling of bcrypt's 72-byte limit. Define secure account recovery rather than an unaudited admin-only workaround.

**Acceptance:** consistent frontend/API results, weak-but-long passwords rejected, UTF-8 boundary tests pass, and oversized login inputs fail cheaply. Avoid arbitrary periodic password rotation as a replacement for compromise-driven rotation and MFA. [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

### A14 — Dependency/build artifacts tracked and CI security coverage incomplete

**Priority P2 · Severity Medium · Confirmed repository/process gap**

Evidence: current Git index contains 20,083 dependency files and eight frontend dist files; ignore rules do not untrack them. [CI workflow](../../.github/workflows/helpdesk-checks.yml) has useful tests/audits but no dedicated secret scan, no demonstrated required branch gating, and runs only one explicit database integration suite. Root infrastructure changes outside `helpdesk-ai/**`, such as `render.yaml`, are not covered by its current path filter.

**Implement:** reviewed removal of generated artifacts from tracking; lockfile-driven clean builds; secret scanning; broaden path coverage to relevant deployment files; pin/review CI dependencies and branch checks. Add an isolated API integration matrix for anonymous/user A/user B/admin, cookie/refresh lifecycle, cache headers, quotas and published simulation evidence. Reuse existing local-only verification scripts where useful, but do not run their test-account mutations against production.

**Acceptance:** clean Linux build works without tracked dependencies/dist; scanner fixtures contain no real keys; negative authorization tests run in required CI; database/infrastructure tests use dedicated disposable resources and restricted runtime roles where relevant.

### A15 — Retention, recovery and watchdog failure monitoring need durable automation

**Priority P1 for backup recovery; P2 for remaining automation · Severity High for unrecoverable data loss · Source gap plus operational verification**

Evidence: [retention service](../server/src/services/retentionService.js), [server timers](../server/src/server.js), [backup script](../server/scripts/secure-backup.js), [watchdog](../infrastructure/aws/cleanup-watchdog.js), [watchdog template](../infrastructure/aws/watchdog-template.yaml). Retention depends on startup/hourly intervals. The watchdog logs and skips missing/invalid expiry tags, and sequential termination can stop on an error. Its template alarm has no notification action. Backup tooling exists, but does not prove scheduled cloud backups or restore success.

**Implement:** independent retention/backup schedules where required, restore drills with explicit cloud target selection, bounded retention for revisions/drafts/infrastructure records, backup key custody, watchdog per-instance failure isolation and missing-tag alerts. Add meaningful termination summaries and delivered alarm notifications; reconcile AWS termination back into database status. Observe free-database expiry as a separate operational limit.

**Acceptance:** restoration is demonstrated in an isolated database; retention runs despite API downtime; malformed tags/one termination failure are surfaced and do not silently strand other labs; alerts reach a responsible person. Review actual deployed Scheduler/Lambda separately—the user's successful setup is not reclassified as absent by this source finding.

### A16 — Deployment shutdown and error handling need lifecycle hardening

**Priority P3 · Severity Low / availability hardening · Confirmed gap**

Evidence: [server startup/listener](../server/src/server.js) does not retain a listener for graceful shutdown or install SIGTERM/SIGINT drain handlers. Some background initialization/cleanup logging prints `error.message`, unlike the more cautious request/startup diagnostics.

**Implement:** graceful request draining with a maximum deadline, provider cancellation, Prisma disconnect and controlled background-task shutdown. Use shared sanitized error categorization for background jobs as well as requests. Add shallow health versus dependency readiness semantics for deployments as needed.

**Acceptance:** shutdown stops accepting new work, settles/aborts active requests within deadline, releases resources, and emits no secret-bearing error messages. Do not terminate all legitimate labs just because an API deployment restarts.

## Verification items that are not confirmed vulnerabilities

- **CORS/CSRF:** the current system uses strict refresh cookies, bearer access authorization and explicit browser origins. There is no dedicated CSRF token mechanism, but this review does not establish an exploitable CSRF path. Test cross-site login/refresh/logout and origin-less requests before deciding additional protections; CORS is not an authorization boundary.
- **SQL injection:** no request-driven SQL injection was demonstrated. Unsafe SQL in maintenance scripts uses fixed identifiers/generated passwords; review separately from parameterized request queries.
- **XSS:** the searched frontend source did not show `dangerouslySetInnerHTML` or eval-based rendering. This is not a complete renderer/URL sanitization proof. Test stored AI/module content, links and future rendering changes.
- **IDOR/admin escalation:** reviewed ownership/admin controls and existing tests are positive evidence. No specific bypass was demonstrated. Expand end-to-end tests rather than labeling all ownership paths vulnerable.
- **Audit immutability:** runtime has narrow grants when provisioned correctly; owners still have broader authority. Verify deployed effective grants and external exports; do not claim owner-proof immutability.
- **AWS live state:** actual IAM, network, AMI, Scheduler behavior and secret rotation require account-side evidence. Existing independent cleanup should stay enabled.

## Recommended implementation sequence

| Batch | Deliverables | Completion gate |
| --- | --- | --- |
| 0 — Contain | A01 credential revocation/evidence | Old credentials unusable; no secrets in commits or reports |
| 1 — Public-service baseline | A02/A03 no-store and browser headers; A04 bounded provider work; A05 storage quotas; A07 abuse/proxy tests | Negative API tests and staging build pass; deployed policies verified |
| 2 — Privileged access | A06 admin MFA/step-up; A08 security events; A13 password/recovery policy | Recovery/revocation and unauthorized-action tests pass |
| 3 — Windows trust boundaries | A10 unique credentials; A11 explicit RDP/link policy; A12 honest/verified assessment | Two-lab isolation, timeout/end/expiry and assessment tests pass |
| 4 — Sustained operation | A09 idempotency; A14 CI/repository cleanup; A15 recovery/monitoring; A16 shutdown | Restore and outage exercises pass; required CI and alerts enabled |

Backups and active credential containment should not wait for the rest of their batch. Every implementation should include meaningful regression tests for the changed trust boundary and verification that the released commit is actually deployed.

## Practical release decision

For a small controlled demo, document remaining risks and limit accounts/data. Before general public use with real users, require completion of P0 and applicable P1 items, a demonstrated restore, and negative authentication/authorization tests through both Vercel and the public Render API. For stronger production assurance, finish a scoped ASVS assessment and independent authenticated testing rather than relying only on this report.

Related: [online verification checklist](ONLINE_SECURITY_CHECKLIST.md), [earlier deployment audit](DEPLOYMENT_AUDIT_2026-11-19.md), [Guacamole setup](GUACAMOLE_HTTPS_DEPLOYMENT.md). Security cache guidance: [OWASP REST security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html).
