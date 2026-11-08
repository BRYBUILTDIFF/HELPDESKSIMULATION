# Security review implementation ? November 9, 2026

## Delivered

- Removed public credentials, unused public registration logic, artificial login delay and nonfunctional Remember me control.
- PostgreSQL-backed limits shared across API instances: AI by authenticated user; login by account and account/IP pair. Counters hash identifiers. Password changes have a separate per-user limit.
- JWT HS256/issuer/audience checks, minimal access claims, token version revocation, refresh family replay protection, 30-day absolute renewal limit, scoped Strict/HttpOnly cookies, sign-out-everywhere API and user control.
- New passwords accept 12+ character passphrases, reject a small common-password denylist and inputs over bcrypt's 72-byte limit. Existing passwords still authenticate. This is not a comprehensive breached-password service.
- All non-greeting chat inputs and generated chat replies use the classifier; ambiguous inputs and outages do not reach answer generation. Explicit IT scope instructions are included in the answer prompt. Moderation uses all provider flags and fails closed by default; baseline-only fallback is an explicit development option.
- Best-effort secret redaction before chat storage, event logging and AI/classifier requests. Regexes cannot identify every possible secret.
- Chat storage is per session with incremental writes, visible failures/retry, per-session size/quantity limits, retention and user deletion. Edited prompts reset server context rather than reusing the discarded answer. Earlier context is also cleared on edits.
- Modules start disabled and need a separate enable action. Text fields are normalized, URLs/control characters removed, step counts bounded, terminal auto-links disabled, title/category updates persist.
- Server-issued terminal attempts validate sequential commands and compute completion from stored progress. This verifies submitted command sequences, not actual operating-system execution. Remote desktop completions are explicitly self-reported. Pass rates are withheld until a trustworthy failure denominator exists.
- Lab daily launch quota and cooldown, poll coalescing, mandatory IMDSv2/hop limit 1 on launches, stuck-session logging and admin retry endpoints. Capacity is never force-released while a VM could still be running.
- Durable admin mutation intent audit (status 0 means no final response was recorded), admin audit-read endpoint, serialized last-admin protection, request error statuses and database readiness endpoint.
- Database-only policy events/conversation state/dismissals and observable DB failures. Existing dismissal JSON is no longer authoritative; old dismissals can be re-entered. Legacy event files are not automatically imported and must be securely retired after review.
- Restricted iframe sandbox and production frame origin; HTTPS/NLA and RDP certificate verification by default, nginx header template and independent AWS cleanup function source.
- Node version declarations, syntax checks, regression/integration tests and CI checks; root duplicate AWS dependency removed.

## Database and release

Deploy API and client together: old whole-array session writes are intentionally removed. Existing JWTs require a new login after issuer/audience enforcement. Database changes are additive; existing session JSON is copied into ChatSession. A preceding migration fills an old migration-history gap for UserSessionState.

The two new migrations have been applied successfully to the configured local database; 20 legacy chat sessions were copied. A pre-migration legacy-session backup was saved in the local temporary directory. For other environments, from server run `npm run generate`, then `npm run migrate:deploy`. Restart the API after migrations. Keep a database backup before deployment. The local disposable-schema integration check rebuilds all migrations, tests legacy session copying, rate limits, tenant isolation and command evidence, then removes only its own random schema.

Set `VITE_GUACAMOLE_ORIGIN` to the exact lab origin before a production client build. Do not use the validation placeholder in a deployed build. Set the actual proxy hop count and configure the nginx header template for real frontend/API/lab origins. Strict cookies require a same-site frontend/API deployment.

Production AI service requires a working moderation provider as well as the answer provider and scope classifier. Configure a separate moderation key when the answer provider is not OpenAI. Users should be told which services receive prompts, what is retained, and that passwords/API keys should never be pasted. The software does not establish legal compliance by itself.

RDP certificates must be trusted by Guacamole. For an isolated local development lab only, `WINDOWS_LAB_IGNORE_CERT=true` allows a self-signed certificate; production always verifies certificates.

## Operational endpoints

- GET /api/ready: database readiness (503 on failure); /api/health remains liveness.
- POST /api/auth/logout-all: invalidate all account sessions.
- DELETE /api/sessions: delete the user's chats, legacy copies, policy conversation context and prompt events; it does not delete their account, audit records, lab infrastructure or training records.
- GET /api/admin/audit: latest 200 audit intents/results, no request bodies or secrets.
- GET /api/admin/simulation-sessions/stuck and POST /api/admin/simulation-sessions/:id/retry-termination: inspect/retry cleanup using instance ownership checks. Never edit a stuck row to free capacity without verifying AWS state.

Chat retention defaults to 90 days since each session's last save; policy events to 90 days; policy conversation context expires after 24 hours. Audit intents are kept for 365 days. Lab quotas reset at UTC midnight. Terminal attempts expire after two hours.

## Still requires deployment access or separate product work

- Rotate any historically committed real secrets and verify deployed accounts no longer accept retired passwords. Ignoring or untracking .env does not erase Git history.
- AWS launch-template/network review: no instance profile on student VMs, private routing, restricted security groups/egress, pinned approved template version, scoped backend IAM permissions. IMDSv2 alone cannot stop a student inside the VM accessing metadata.
- Deploy and schedule infrastructure/aws/cleanup-watchdog.js with scoped IAM and alerts; add AWS budgets and monitoring for missing expiry tags or repeated cleanup failure. Source code in this repository is not an active AWS watchdog.
- Provision per-instance Windows credentials and trusted certificates; shared AMI credentials remain a deployment limitation.
- Install security response headers and log formats on the actual frontend/Guacamole hosts. API Helmet headers do not secure a separately hosted frontend. Review iframe functionality with the real Guacamole server.
- Apply a production privacy notice, review the configured provider and transfer arrangements, secure backups and retire old JSON event/dismissal files and copied exports.
- Native/Argon2 password hashing migration, administrator MFA, a full breached-password checker and provider-budget accounting remain separate work.
- True remote-OS verification needs trusted guest telemetry or instructor approval. Command submission does not establish real-world competence.
- RAG/citations, real ticket workflows, instructor dashboards, feedback, SSO/email recovery, uploads, multilingual UI and a full accessibility/component refactor are the PDF's product backlog, not completed by these security changes.

## Validation performed locally

- Production frontend build, using https://lab.example.invalid only as a validation origin; this output is not deployed.
- Server syntax checks and unit regressions.
- Disposable PostgreSQL schema: rebuilt migration history, copied a legacy session, exercised PostgreSQL counters across two limiter instances, checked cross-user data isolation and verified command sequence completion. Every registered admin route rejected a valid non-admin access token. HTTP parser checks returned 400 and 413 correctly. The disposable schema was removed afterward.
- Local migrations applied after a successful disposable-schema check. No .env values were changed.

## Dependency security

Both dependency trees reported zero known vulnerabilities after compatible fixes, targeted server transitive overrides (deepmerge-ts, minimatch and qs), and upgrades to Vite 8 / its React plugin and React Router 7. These upgrades were followed by Prisma schema/generation checks, tests and a production frontend build. Supported Node is now 22.12+ (below 25). Audit results are a point-in-time check, not a security guarantee. Existing tracked node_modules files also reflect these dependency updates; future repository cleanup should stop versioning installed dependencies while keeping lockfiles.

The current local environment has a classifier configured but no hosted moderation credential. Strict safety checks therefore return an availability message until a moderation key is configured. For isolated development only, MODERATION_FAILURE_MODE=baseline permits the documented reduced baseline checks; production always fails closed. No key was invented or added to .env.

One active local account using a retired demo password was rotated to a unique temporary password, with token revocation and mandatory change at next login. Its recovery credential was written only to a private local temporary file, not chat or the repository. Historical cloud/API secret rotation remains an operational task.
