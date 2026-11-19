# Immediate and high-priority security release

This release changes authentication, AI admission, chat persistence and Windows credentials. **Do not deploy the API until the database migration, grants and encryption key are ready.** No production secrets were rotated, production database migrated, cloud resources changed, or hosting deployment triggered by the code implementation.

## Implemented

| Audit finding | Changes |
| --- | --- |
| A01 exposed credentials | Added an added-lines secret scanner and CI step. Revocation still requires the provider/account owner; scanning does not revoke keys or certify history clean. |
| A02 sensitive caching | All `/api` responses receive `Cache-Control: no-store`, including auth and lab links. |
| A03 frontend headers | Added HTTP anti-framing CSP, MIME-sniffing protection, referrer and permissions policies; the existing HTML CSP still restricts resources and the gateway origin. The Vercel configuration generator preserves these headers. |
| A04 AI resource bounds | SDK timeouts, zero automatic retries, per-request deadline/cancellation, output limits, PostgreSQL-backed global/user concurrent leases and rolling daily request budgets. These are request/token ceilings, not exact currency budgets. |
| A05 storage growth | Enforced account/turn/conversation quotas before generation and atomically during append; saved-chat creation cannot bypass them. Paginated saved/recovered conversation retrieval and frontend hydration across pages. |
| A06 admin MFA | Password plus authenticator enrollment/verification, encrypted factors, one-time recovery codes, replay checks, proof bound to account/token version/factor, and recent verification before admin mutations. |
| A07 login abuse | Additional global and IP login limits. Real proxy/IP behavior still requires deployed verification. |
| A10 shared lab credentials | New production instances use unique generated passwords encrypted in storage and applied through EC2 Windows user data. Confirmed ended-session credential records are cleared. Existing labs need to expire/end during rollout. |
| A15 recovery/cleanup | Added explicit-target cloud backup entry point and a Windows scheduled-task script; external PostgreSQL backup TLS defaults to required. Watchdog continues after individual failures, summarizes results and signals failures for alarms. Scheduling, offsite copies, alarm recipients and a cloud-data restore drill remain operational steps. |

The encryption helper uses AES-256-GCM with purpose-bound authenticated data. Admin TOTP verification follows time-based six-digit SHA-1 codes with a 30-second step and a one-step clock window. A used counter cannot be reused. Eight random recovery codes are shown once; only their hashes are retained. A successful recovery revokes sessions, removes the factor and requires fresh sign-in/enrollment; it does not issue an admin bypass token.

## 1. Contain existing secret exposure

Perform the rotations listed in [the audit](CODEBASE_SECURITY_AUDIT_2026-11-19.md#a01--previously-exposed-credentials-need-revocation-evidence) privately at the relevant providers. At minimum revoke exposed AWS/OpenAI/DeepSeek keys and rotate database/JWT/Guacamole/Windows/backup credentials wherever those old values remain valid. Update both sides of shared secrets together. Record proof of revocation, not replacement values, in private incident records.

Never commit `.env`, `.security` maintenance files, recovery codes or private keys. Run `npm.cmd run security:scan-new-secrets` after staging reviewed files; CI scans added lines against the push/PR base. The scanner recognizes selected patterns and is an extra safeguard, not a complete DLP/history scanner.

## 2. Prepare the encryption key and stop new Windows launches

Set `WINDOWS_SIMULATIONS_ENABLED=false` on Render during the release. Let active student labs finish or end them deliberately; verify no old student instance remains. Do not stop/terminate the gateway or master image inadvertently.

Generate a **separate** encryption key locally:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Store it privately as Render `SECURITY_ENCRYPTION_KEY` and in a protected recovery location. It must be 64 hexadecimal characters, different from JWT and backup keys. Production startup rejects a missing/malformed key. Do not rotate this key by simply replacing it after MFA/lab records exist: old ciphertext would be unreadable. A future key rotation needs an authenticated decrypt/re-encrypt migration.

Set Render `ADMIN_MFA_REQUIRED=true`. Production defaults to required if unset. `false` is an explicit emergency/staging opt-out, not a recommended deployment setting. Development defaults to not required; set it true locally to exercise the UI. The new schema must exist even when enforcement is disabled, because the status endpoint reads it.

## 3. Apply migrations and grants before deploying

From `helpdesk-ai/server`, using your existing ignored Render maintenance file:

```powershell
npm.cmd run migrate:deploy -- --env-file .security/render-owner.env
node scripts/grant-security-tables.js --env-file .security/render-owner.env
```

The migration creates `AdminSecurity` and `SecurityLease` and adds encrypted `credential` storage to `SimulationSession`. The grants helper grants access to the two new tables to `helpdesk_runtime` **without rotating its password**. Keep `ADMIN_DATABASE_URL` outside Render's API service. The normal provisioning script also grants the new tables but rotates credentials; do not run it merely to apply grants.

Take and verify a backup before changing the production schema. The migration is additive; do not manually drop security tables on rollback because they contain factor/recovery state. Runtime roles need only the explicitly configured permissions.

## 4. Configure request budgets

Defaults are bounded in code; override only when appropriate:

| Render variable | Default | Meaning |
| --- | --- | --- |
| `AI_TIMEOUT_MS` | `25000` | Individual answer/draft SDK request timeout |
| `AI_MODERATION_TIMEOUT_MS` | `8000` | Individual moderation SDK timeout |
| `AI_REQUEST_DEADLINE_MS` | `55000` | Overall admitted AI HTTP request deadline |
| `AI_MAX_OUTPUT_TOKENS` | `1200` | Main answer output ceiling |
| `AI_DRAFT_MAX_OUTPUT_TOKENS` | `3000` | Draft-generation output ceiling |
| `AI_USER_CONCURRENCY` | `1` | Active AI requests per user |
| `AI_GLOBAL_CONCURRENCY` | `6` | Active AI requests across API processes |
| `AI_USER_DAILY_REQUESTS` | `200` | Rolling 24-hour admitted attempts per user |
| `AI_GLOBAL_DAILY_REQUESTS` | `1000` | Rolling 24-hour attempts shared with admin generation |
| `CHAT_MAX_ACCOUNT_TURNS` | `10000` | Durable turns per user |
| `CHAT_MAX_SESSION_TURNS` | `500` | Durable turns per conversation |
| `CHAT_MAX_CONVERSATIONS` | `100` | Distinct saved or recovered conversations |

Failed/rejected attempts can consume daily counters to prevent retry abuse. Leases are released on response completion/disconnect and expire if the process dies. Retrieval uses five conversations per page; the frontend follows cursors without truncating the history list. Existing over-quota data is not silently deleted; users must remove conversations or an administrator must review the configured policy.

Deploy the reviewed API/frontend together. An old frontend does not handle the new pagination or MFA gate correctly. Vercel must rebuild to include the MFA screen, proof-header interceptor, pagination and headers; do not just change Render settings.

## 5. Enroll every admin

1. Sign in with the normal account password; finish any mandatory password change first.
2. The admin page shows **Protect your administrator account**. Enter the current password and select **Set up authenticator**.
3. In your authenticator app, add a manual time-based account: issuer HelpDesk AI, your admin email, six digits, 30-second period. Enter the displayed setup key privately. No third-party QR service receives the secret.
4. Enter a fresh six-digit authenticator code and verify. Save the eight recovery codes in a password manager before continuing.
5. Reloading the page clears the in-memory MFA proof and requires another verification. The proof lasts at most one hour; mutations require a proof verified in the last five minutes. After a step-up challenge, reverify and retry the intended change deliberately; requests are not automatically replayed.
6. If the device is lost, select **Use a recovery code**, enter the password and one recovery code, then sign in and enroll a replacement authenticator. Previous recovery codes are all invalidated by factor removal.

MFA applies to the backend `requireAdmin` gate, not only the page. Normal access tokens and refresh cookies remain separate. Recovery/password/role changes invalidate existing verification proofs through state and token versions. Do not share an administrator account. This initial release logs successful verification/recovery metadata; the audit's broader security-event service remains separate work.

## 6. Verify the Windows AMI before re-enabling

New production launches always use unique passwords; `WINDOWS_UNIQUE_CREDENTIALS=true` enables the same behavior in local testing. The bootstrap uses Windows EC2Launch user-data execution to create/update `WINDOWS_LAB_USERNAME` and add it to Remote Desktop Users. It uses the existing launch template but **overrides its UserData**. Review/merge any required template initialization into a tested AMI/bootstrap before deployment; do not assume existing custom user-data commands still run.

The AMI must execute PowerShell user data on new instances, include LocalAccounts cmdlets and support the intended RDP account. The account name must match the permitted ASCII identifier format, at most 20 characters. Review existing group memberships in the AMI; the bootstrap does not remove intentional administrator privileges or configure your whole lab network. Never bake production secrets into the AMI.

Guacamole receives the per-instance password only inside its encrypted/signed connection payload. Render no longer needs a shared `WINDOWS_LAB_PASSWORD` for new production labs. A legacy production session without an encrypted credential cannot connect under this release; end it and launch a new one. Verify your backend IAM can supply the required user data with your launch template restrictions. Restrict access to instance user-data retrieval, which contains the generated password.

Test one disposable lab with the flag enabled in a controlled maintenance window. Verify boot, RDP, manual end and independent expiry. Verify credentials differ between two labs. Do not label this release as live-tested credential isolation until the real image passes. Keep the existing Lambda schedule enabled.

Upload the updated `infrastructure/aws/cleanup-watchdog.js` to Lambda and deploy it. It now reports invalid expiry tags and individual termination failures as an invocation error while continuing other labs. Configure a CloudWatch Lambda Errors alarm with an actual notification recipient; the template's unconnected alarm is not an alert delivery system.

## 7. Schedule protected backups

`scripts/backup-cloud.js` refuses to fall back to the local database silently. Create an ignored maintenance file for the cloud backup job containing the Render owner URL, a **new independent** `BACKUP_ENCRYPTION_KEY`, and PostgreSQL tool paths. Do not reuse `SECURITY_ENCRYPTION_KEY`. Keep only the values required by the job; protect filesystem permissions.

From the server directory, test:

```powershell
node scripts/backup-cloud.js --env-file .security/render-backup.env
```

It writes AES-256-GCM encrypted archives under `.security/backups`. Create a protected backup destination on a separate backed-up drive/service. For Windows Task Scheduler, use a daily task under your authorized account with absolute paths:

```text
Program: powershell.exe
Arguments: -NoProfile -File "C:\YOUR-REPOSITORY\helpdesk-ai\server\scripts\run-cloud-backup.ps1" -MaintenanceFile "C:\YOUR-REPOSITORY\helpdesk-ai\server\.security\render-backup.env" -BackupDestination "D:\YOUR-PROTECTED-BACKUP-DESTINATION"
```

Replace all example paths. The script must be able to run Node/PostgreSQL tools, access the maintenance file, reach the Render external database through its allowed network, and write the destination. Check Task Scheduler's last-run result and alert on failures; a laptop that is off cannot run the task. For continuous operation, move the same job to an always-available, separately secured scheduler. Destination retention and offsite replication must be configured deliberately; the script does not delete historical archives.

Test decryption/restoration into an isolated database with an explicitly selected maintenance identity. The existing restore-test script creates a disposable database on the supplied PostgreSQL server, which may not be permitted by Render. Use a local isolated owner/restore target and the correct historical encryption key, not production restore commands. Preserve evidence of table counts and restored security state. No production-data restore was performed by this implementation.

## 8. Verify and release

- Run server `npm.cmd test`, `npm.cmd run lint`, and `npm.cmd run test:security-baseline` (the latter needs a local PostgreSQL owner, creates a temporary database and deletes it afterward; it refuses remote targets).
- Generate Prisma client after schema changes; Render build already runs generation.
- Build the frontend with the real HTTPS gateway origin and Windows feature flag.
- Verify anonymous access is denied, ordinary users cannot call admin endpoints, missing/stale MFA proofs fail, refresh and recovery behave correctly, and different users cannot retrieve each other's paginated chats/labs.
- Verify AI limits/deadlines, no-store headers and anti-framing policy through both public hosts.
- Inspect the root `.github/workflows/helpdesk-checks.yml` CI run; the new database integration suite runs in an isolated local database.
- Verify scheduled backup output, isolated restore and delivered watchdog alarm before general public use.

The repository already tracks generated `node_modules` artifacts. Prisma generation updates some tracked client files locally. Stage/review source, migration, configuration and docs deliberately; do not blindly commit build directories, browser fixture profiles or `.tmp` captures. Full dependency-artifact cleanup remains audit A14, outside the immediate/high release.

## Deployment status and remaining account-side actions

Completed local verification is recorded in the implementation handoff. This release does **not** certify that external exposed credentials were revoked, production grants changed, the backup task registered or restore succeeded, the new watchdog uploaded, or the actual Windows AMI bootstrapped successfully. Those require the steps above and private deployment evidence. Keep the service controlled until they pass.
