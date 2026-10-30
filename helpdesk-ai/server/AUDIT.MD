# Security audit remediation checklist

Updated: October 30, 2026 (Asia/Manila).

Checked items are implemented and locally verified. Unchecked items still need work or deployment verification. The original review is preserved below as a historical record; its line numbers and descriptions refer to the code before these changes.

## Critical / high

### 1. Simulation description XSS

- [x] Removed every simulation description use of dangerouslySetInnerHTML in the dashboard, simulations page, and admin previews. React renders descriptions as text, including legacy records.
- [x] Strip HTML formatting from new descriptions on the server and remove raw HTML interpolation from the fallback description.
- [x] Stop storing access tokens in localStorage; remove the legacy stored token and restore sessions using the refresh cookie.

### 2. Default passwords and seeding

- [x] Remove the server-side password123 exception and shared default-password UI. Generated passwords use browser cryptographic randomness and satisfy the normal policy.
- [x] Require a password change for admin-created accounts, admin password resets, and newly seeded accounts. The API blocks other protected actions until the change is complete.
- [x] Make seeding create-only and read seed passwords from environment variables. Existing passwords, roles, and activation settings are preserved.
- [x] Add a repeatable legacy-password retirement script and run it locally: 3 existing accounts now require a password change.

### 3. Public self-registration

- [x] Remove the public /api/auth/register route. Account creation remains available through the authenticated admin API.

### 4. AI policy and trusted conversation history

- [x] Remove the blanket short-follow-up exemption. Messages without scope signals use the classifier even in established IT conversations.
- [x] Read chat history from server-owned PolicyConversation records; ignore client-supplied history when classifying and generating answers.
- [x] Persist actual user/assistant turns with ownership, expiry, a bounded context window, and transactional updates.
- [x] Correct the historical exploit example: the checked-in policy already lists ?essay? as out of scope. Regression coverage uses an unfamiliar out-of-scope request instead.

### 5. EC2 lifecycle and cost exposure

- [x] Serialize capacity checks and session reservation with a PostgreSQL advisory transaction lock. Count TERMINATING sessions toward capacity.
- [x] Include failed TERMINATING sessions in scheduled cleanup retries.
- [x] End lab sessions before deleting users or modules; do not delete records if termination fails.
- [x] Reconcile application-tagged AWS instances independently of their stored instance ID. Terminate expired/orphaned instances and recover missing IDs for live sessions.
- [x] Reject termination when the instance session tag does not match.
- [ ] Verify these paths against a disposable live AWS lab and the deployment IAM policy. Automated coverage uses an EC2 stub and launches no paid instances.
- [ ] Configure an AWS-side scheduled watchdog and VM shutdown safeguard so cleanup also works while the API is offline.

## Medium

### 6. Refresh tokens

- [x] Issue unique jti and family identifiers, preventing same-second login collisions.
- [x] Store a SHA-256 digest with a nonsecret family identifier instead of the bearer credential.
- [x] Consume and rotate refresh tokens transactionally. A replay revokes the matching token family.
- [x] Generate refreshed access claims from the current database user.
- [x] Revoke refresh credentials in the same transaction as admin password/role/deactivation changes.
- [x] Derive expiry from the actual issued token instead of signing a throwaway JWT.
- [x] Share concurrent refresh requests in a tab; coordinate tabs using Web Locks where supported. Preserve the newly refreshed Authorization header when retrying a request.
- [x] Invalidate legacy plaintext refresh records in the applied migration.

### 7. Rate limiting and account enumeration

- [x] Add refresh and password-change limits. Retain login and AI limits.
- [x] Use a generic login failure response and run bcrypt comparison for unknown accounts using a dummy hash.
- [x] Support an explicitly configured TRUST_PROXY_HOPS value rather than trusting arbitrary forwarded headers.
- [ ] Set and verify TRUST_PROXY_HOPS for the real proxy topology. Use a shared limiter store if deploying multiple API processes.

### 8. Simulation completion integrity ? partially resolved

- [x] Require Windows completions to reference a live, owned workspace for the same module and surface.
- [x] Serialize completion updates by module and compute completion count/average steps from persisted completion records.
- [x] Stop adding an unconditional passing score of 100 to the legacy passRate field.
- [ ] Issue and validate terminal simulation attempts on the server. Terminal attemptKey and reported progress are still client-supplied.
- [ ] Verify actual task success, record unsuccessful attempts, and define a meaningful pass-rate metric. Existing passRate values are legacy data and are not recalculated by this patch.

### 9. Deployment and configuration ? deployment checks remain

- [x] Remove server/.env from Git tracking while retaining the local file. Add ignore rules for local environment files and policy-event fallback data.
- [ ] Rotate any AI-provider, AWS, database, or other credentials previously committed to Git. Removing the current file does not erase earlier commits.

- [x] Bind the Docker PostgreSQL port to 127.0.0.1 and require POSTGRES_PASSWORD instead of shipping a default Compose password.
- [x] Fail startup for missing, short, or identical JWT secrets. Replace invalid local JWT secrets with distinct cryptographically random values without displaying them.
- [x] Restrict development CORS and stack traces to explicit development mode. npm run dev supplies the development default; other starts require NODE_ENV.
- [x] Emit a production SPA Content-Security-Policy that restricts scripts to the same origin and disables objects and foreign base URLs.
- [ ] Verify HTTPS, proxy configuration, and CSP on the deployed site. Restrict frame-src to the actual Guacamole origin; current production CSP allows HTTP/HTTPS frames for existing lab compatibility.
- [ ] Rotate existing deployed PostgreSQL credentials if they still use a default. Changing Compose does not rotate credentials in an existing database volume.

### 10. Guacamole and RDP ? pending infrastructure work

- [ ] Replace shared VM credentials with per-instance credentials and an appropriate secret-storage lifecycle.
- [ ] Configure trusted RDP certificates and remove ignore-cert after deployment verification.
- [ ] Verify access-log redaction for bearer launch URLs. Keep short expiry and no-referrer behavior.

### 11. Privacy and logging

- [x] Remove raw classifier response bodies from error logs.
- [x] Add configurable POLICY_RETENTION_DAYS (default 90) and scheduled deletion of old policy events, expired chat contexts, and expired refresh credentials.
- [x] Apply the policy-event retention cutoff to the fallback file as well as database records.
- [x] Correct the original description: recorded policy messages are truncated to 300 characters; the database previously had no retention cutoff and the fallback file was capped at 1,000 records.

### 12. AI-provider errors

- [x] Return HTTP 502 for provider authentication failures so the frontend does not treat them as expired user sessions and retry the paid request.
- [x] Propagate authentication database outages to server error handling rather than misreporting them as invalid credentials.

## Design improvements

- [ ] Implement retrieval-augmented generation, authoritative server-side knowledge sources, citations, and retrieval/answer evaluation. Related-ticket ranking is not RAG for chat answers.
- [x] Cache compiled policy regexes and check the database policy version before reloading configuration.
- [ ] Rework independent moderation/classification operations for parallel execution where the policy flow permits it.
- [x] Bound the in-memory conversation-scope cache, evict expired entries on writes, and retry database access after a cooldown. Policy-event storage also retries after transient database failures.
- [ ] Split the large dashboard/admin pages into components and hooks; consolidate JSON parsers and use supported structured output.
- [ ] Review the duplicate root AWS SDK dependency.
- [x] Add automated security regression coverage and an opt-in local PostgreSQL integration test.

## Development restart loop

- [x] Prevent startup cleanup from triggering repeated nodemon restarts: watch only src/ and .env, ignore runtime data, and skip rewriting the policy-event file when pruning removes nothing. Nodemon configuration verified; all 19 regression tests still pass. Restart npm run dev once to load the watch configuration.

## Local verification and rollout

- [x] 19 regression tests passed: npm test in server/.
- [x] Local PostgreSQL authentication/history integration test passed: npm run test:db. All fixture writes are rolled back.
- [x] Prisma schema validation and client generation passed.
- [x] Applied migration 20261030000100_security_hardening to the configured local database.
- [x] Production frontend build passed, including the generated CSP. Used a staging output directory because OneDrive locked an existing artifact; copied the final build into client/dist.
- [ ] Perform browser smoke tests for forced password change, admin account creation, multi-tab sessions, simulation previews, and Windows lab connection.
- [ ] Complete live AWS and production-host checks listed above.

Restart the API so it loads the updated code and local JWT secrets. Existing sessions must sign in again. Accounts flagged for retired passwords will be directed to set a new password.

For another deployment, apply migrations and regenerate Prisma Client before starting the updated API. Set NODE_ENV, independent JWT secrets of at least 32 characters, deployment proxy settings, and any seed passwords explicitly. Run npm run security:flag-legacy-passwords once to retire existing known defaults. Do not reintroduce defaults in environment files.

---

## User simulation walkthrough behavior

- [x] Show the guide for freshly opened dashboard simulation attempts and skip it when restoring a saved terminal or Windows session. Progress updates no longer reload the workspace or reopen the guide.
- [x] Remember first opens in the standalone catalog per account/module in browser storage.

## Original audit (historical; see checklist above for current status)

Use the same thread to send your changes on the system

the server (Express + Prisma + OpenAI/DeepSeek + AWS EC2/Guacamole) and the main client code paths. Overall the codebase is in better shape than most student and capstone systems I see. It already has parameterized DB access through Prisma, bcrypt with cost 12, helmet, rate limiting on login, ownership checks on simulation sessions (userId: req.user.id in every lookup), escaped keyword regexes (so no ReDoS), and tag verification before terminating EC2 instances.

There are still several real vulnerabilities and some significant design gaps. They’re listed below roughly in order of severity.

Critical / High
1. Stored XSS through simulation step descriptions, which can steal admin tokens.
DashboardPage.jsx (lines 3276, 3786), SimulationsPage.jsx:310 and AdminPage.jsx (2082, 2243) render step.desc with dangerouslySetInnerHTML. That desc is never sanitized: normalizeSimulationStep only trims it. The content can come from three places:

LLM output generated from a user’s prompt (generateSimulationDraftFromPrompt, fed by “prompt insights” built from user chat messages).
Admin input.
The fallback template `...<b>${safeTitle}</b>`, which interpolates a raw title.
A user who repeatedly submits a prompt containing an injection payload can get the LLM to emit HTML such as <img src=x onerror=...>. That payload then runs in the admin’s browser during preview, and in every user’s browser once the module is published. Because the access token sits in localStorage (AuthContext.jsx), the script can read it and take over the account, including admin accounts.

Fix: render as text, or sanitize on both sides.

jsx
import DOMPurify from "dompurify";
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(step.desc, { ALLOWED_TAGS: ["b","i","code","br"], ALLOWED_ATTR: [] }) }} />
Also strip tags server-side in normalizeSimulationStep. Stop persisting the access token to localStorage altogether: you already have an httpOnly refresh cookie, so keep the access token in memory only and call /refresh on page load (your restoreSession already does this).

2. Hardcoded default password that bypasses the password policy.
adminController.js defines DEFAULT_USER_PASSWORD and isAllowedAdminUserPassword accepts it even though it fails PASSWORD_REGEX. Your redaction missed one spot: the error message in updateUser still says “…or be password123.”, which tells every admin, and anyone who can see that response, what the default is. There is also no forced password change on first login.

Separately, seed.js overwrites the admin’s password hash every time it runs. Re-seeding in production silently resets the admin back to the known seed password.

Fix: remove the exception. Generate a random temporary password and set a mustChangePassword flag. Make the seed create-only, and read passwords from environment variables.

3. Self-registration is open on the server.
The client redirects /register to /login, but POST /api/auth/register is still live. Anyone can create a USER account and then use your paid AI quota and the EC2 Windows labs. If registration is meant to be admin-only, delete the route. Otherwise, gate it behind an invite token or an email-domain allowlist.

4. The AI scope guard can be bypassed.
Two problems in promptPolicy.js:

Once a conversation is marked it_support (after a single legitimate IT reply), isEstablishedItConversationFollowUp lets through any message of 500 characters or less that contains no in-scope or out-of-scope keyword. It skips the classifier and goes straight to the LLM. So “Help me reset my VPN” followed by “write a 400-word essay on the French revolution” works.
history comes entirely from the client and is passed to both the classifier and the main model. An attacker can fabricate assistant turns to steer either one.
Fix: run the classifier on follow-ups too, passing the server-known scope as context rather than skipping classification. Store conversation history server-side, keyed by sessionId, and stop trusting req.body.history.

5. EC2 lifecycle bugs that leak running instances (cost exposure).

Race condition: the per-user and global limits are check-then-create (count, then create). Two concurrent requests can both pass and launch two instances. Serialize the check:
js
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(911)`;
    // count + create here
  });
Stuck in TERMINATING: terminateWindowsSimulationSession sets the status to TERMINATING before calling AWS. If the AWS call fails, the row stays TERMINATING. The cleanup job only scans ACTIVE_STATUSES, which doesn’t include TERMINATING, so the user-facing message “It will be retried automatically” is false and the instance keeps running.
User deletion: hardDeleteUser cascades and deletes SimulationSession rows, which orphans any running instance. Terminate the user’s sessions first.
Crash window: if the process dies after RunInstances but before ec2InstanceId is saved, the session later goes to ENDED without terminating anything.
The robust fix for all four is a second sweeper that queries AWS directly: DescribeInstances filtered on tag:Project=HelpDeskAI, terminating anything past AutoTerminateAt or with no matching live DB row. Back this with an AWS-side safeguard such as instance-initiated shutdown behavior set to terminate, plus a scheduled shutdown inside the VM.

Medium
6. Refresh token handling.

There is no rotation: /refresh issues new access tokens for the full 7 days and never replaces the refresh token.
Tokens are stored in plaintext in the DB.
Functional bug: the JWT payload is {id, email, role} with second-level iat. Two logins by the same user in the same second (a double-click, or two tabs) produce byte-identical refresh tokens, and the second refreshToken.create hits the @unique constraint and returns a 500. Add a jti: crypto.randomUUID(), store sha256(token), and rotate on every refresh. If an already-used token is presented, revoke the whole family.
refresh copies role from the old token instead of the DB. verifyToken re-reads the role, so the server is safe, but the client UI will show a stale role.
When an admin resets a password or changes a role in updateUser, existing refresh tokens are not revoked. changePassword does revoke them, so mirror that.
getRefreshExpiryDate() signs a throwaway JWT just to compute a date. Compute it directly instead.
7. Rate limiting and account enumeration.

app.set("trust proxy", …) is missing. Behind Nginx or an ALB, every client shares the proxy’s IP, so 10 logins per minute becomes a global limit and the per-attacker limit disappears.
/refresh and /change-password have no rate limit at all.
Login responds “Account inactive” for disabled accounts, and skips bcrypt when the email doesn’t exist. Both let an attacker tell which emails are registered. Return the same message in all cases and compare against a dummy hash when the user isn’t found.
8. Simulation completions are client-asserted.
POST /modules/:id/complete accepts any attemptKey and stepsCompleted, so a user can inflate completion counts by changing the key. passRate always adds 100, which makes it a constant rather than a metric. The read-modify-write of avgSteps and passRate also loses updates under concurrency.

Derive these numbers with aggregate queries over SimulationCompletion instead of storing running averages. Tie each completion to a server-issued attempt, at minimum for windows-os where you have a real session ID.

9. Deployment and configuration.

docker-compose.yml publishes Postgres on 0.0.0.0:5432 with the username user. Bind it to 127.0.0.1:5432:5432, or drop ports and use the internal network.
isDevelopment = NODE_ENV !== "production", so a forgotten NODE_ENV returns stack traces in error responses and allows the LAN CORS origins.
Fail fast at startup if JWT_ACCESS_SECRET or JWT_REFRESH_SECRET are missing or short, or if the two are equal.
Helmet only protects API responses. The SPA itself has no CSP, which matters given finding 1. Add a strict Content-Security-Policy at whatever serves client/dist.
10. Guacamole and RDP.

Every lab VM uses the same Windows credentials, which are embedded in each signed URL.
ignore-cert: true disables RDP server verification inside the VPC.
The ?data= URL is a bearer credential that can end up in proxy and access logs. The 5-minute TTL and referrerPolicy="no-referrer" help.
Consider per-instance random passwords, generated at launch and stored in Secrets Manager or SSM, and an RDP cert baked into the AMI. (The zero-IV AES-CBC is what guacamole-auth-json requires, so that part isn’t your bug.)

11. Privacy and logging.

PolicyEvent stores every user message along with the user’s email, with no retention limit.
classifyWithDeepSeek writes raw classifier and user content to console.error.
Add retention, for example deleting after 90 days, and redact before logging. This is relevant to the Philippine Data Privacy Act if this is deployed for an institution.

12. AI-provider error mapping.
An invalid AI key returns HTTP 401. Your axios interceptor reads that as an expired session, refreshes, and retries, which spends a second AI call and confuses users. Return 502 or 503 for upstream failures.

Design improvements
The system has no retrieval-augmented generation yet. Given the thesis title, this is the most important gap. The chat endpoint sends only SYSTEM_PROMPT, the history, and the message to the model, so nothing is retrieved. The knowledge base (helpdeskData.js) lives in the client and is only used for keyword matching.

To make the system actually RAG:

Move the KB articles and simulation modules server-side.
Embed them with pgvector in your existing Postgres, which avoids adding new infrastructure.
Retrieve the top-k chunks for each query and inject them into the prompt with source IDs.
Return citations to the UI.
Evaluate it, for example with retrieval hit-rate and answer faithfulness on a small labeled question set. Panels usually ask for this.
Performance. Every chat request calls initializePolicyConfig(), reads the config from the DB, and recompiles all the regexes. Cache the compiled config keyed on PolicyConfig.version. A single message can also trigger up to three model calls (moderation, local classifier, main LLM), each sequential with an 8-second timeout. Run moderation and classification in parallel.

Memory. The memoryConversations Map in policyConversationStore.js grows without bound, since entries are only evicted when read. Also, dbUnavailable latches to true permanently after one transient DB error. Add an LRU cap, and a retry after a cooldown.

Maintainability.

DashboardPage.jsx (about 171 KB) and AdminPage.jsx (about 135 KB) should be split into components and hooks.
PASSWORD_REGEX and the JSON-extraction parser are each duplicated in two files.
Use the provider’s JSON/structured-output mode instead of hand-parsing JSON out of free text.
The root package.json duplicating @aws-sdk/client-ec2 looks accidental.
There are no tests. At minimum, add integration tests for auth, the authorization boundaries (user vs. admin, cross-user session IDs), and the policy engine.
