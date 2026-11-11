# Blocking analysis

Implementation update: the configuration wiring findings below have since been addressed. All enabled keyword and intent lists now enter the classifier prompt without the former 24-term cap. Configured greeting-only phrases match directly after safety checks. Admin help distinguishes contextual classifier guidance from enforced safety checks. The original findings remain below as review history; session-lock and audit-schema recommendations remain outstanding. Configuration behavior is covered by `server/test/policyConfiguration.test.js` using a stub classifier; live model accuracy is not established by those tests.

Reviewed 11 November 2026 against the database reference, Prisma schema, live PostgreSQL catalog, and current backend implementation. This review does not change enforcement or migrate data.

## Current enforcement

1. Authentication checks the current user and account activation state.
2. The database-backed AI rate limiter allows 20 requests per minute per authenticated user. Excess traffic receives HTTP 429 before the chat controller.
3. Request validation rejects malformed or oversized messages before policy evaluation.
4. Input safety uses baseline patterns and configured moderation. Safety-service failure can withhold processing; it is an availability outcome, not a user violation.
5. Scope classification uses the local Ollama classifier, then the configured AI provider when local classification is unavailable or uncertain. The confidence threshold is 0.75. Low-confidence results request clarification.
6. Out-of-scope prompts receive a redirect without normal answer generation. They are not session locks.
7. Generated answers undergo safety and scope checks before delivery. Rejected answers are replaced with a safe response.
8. Policy events record the decision. Admin reporting derives separate allowed, redirected, blocked, output-filtered, and unavailable outcomes.

## Findings to resolve before session blocking

### High: events cannot be reliably attributed to a conversation

`PolicyEvent` has no `sessionId`, request identifier, or relation to `ChatSession`. `hasHistory` is a boolean and cannot substitute for identity. Session-level violation counts and locks cannot be implemented reliably using the current event rows. Do not infer session identity from timestamps or prompt text.

### High: there is no persistent conversation lock

Neither `ChatSession` nor `PolicyConversation` has lock status, lock expiry, lock reason, or a violation counter. `PolicyConversation.scope` describes conversational scope; it is not an enforcement state. `RequestLimit` counts traffic, not policy violations. `User.isActive` disables the entire account and must not substitute for a conversation lock.

### High: admin keyword rules are advisory, not an exact denylist

The classifier prompt includes only the first 24 unique in-scope and out-of-scope terms. Live enabled rule counts at review: 175 in-scope keywords, 93 out-of-scope keywords, 55 in-scope intents, and 13 greeting patterns. Keyword/intent matches are computed, but the current decision path does not use those signals to enforce a deterministic block. In-scope intents are not included in the classifier reference-term prompt. Adding an admin rule therefore does not guarantee that a matching prompt is blocked. Explicit hard-deny rules should be a separate, clearly labeled capability; broad subject keywords can appear in legitimate support requests.

### High: output scope outages still resemble content filtering

`evaluateResponsePolicy` returns false for both a negative decision and a classifier exception. The controller cannot distinguish those cases and records `OUTPUT_SCOPE_FILTERED`. Input-classifier and output-moderation outages have availability codes, but output-scope classification needs a structured result to close this gap. Never count these failures toward punitive limits.

### Medium: audit deletion and retention affect enforcement

Delete-my-data removes the user's policy events. Retention also prunes old events and expires conversational history. Counting violations solely from this audit trail would permit resets through deletion or expiry. If persistent enforcement is required, define its duration, privacy behavior, and independent lifecycle before implementing it.

### Medium: decision metadata is incomplete

The event stores a code and free-text reason, but not a typed outcome, input/output stage, policy version, classifier source/model, confidence, matched rule IDs, or idempotent request ID. Historical outcomes can be inferred from known codes, but absent evidence cannot be reconstructed. Clarification currently falls into Allowed rather than a dedicated outcome.

### Medium: policy metrics do not cover every rejected HTTP request

Authentication, validation, and rate-limit rejections occur before policy-event recording. AI generation failures may also return before an event is written. The policy block rate is a rate over recorded policy decisions, not all API traffic or all unsuccessful chats.

## Database reference versus implementation

The reference reflects the key table columns but is not a complete standalone migration: it uses enums without creating them and omits several unique constraints/indexes required by the application. The live catalog confirms unique indexes for User.email, PolicyConversation(userId, sessionId), and PolicyRule(type, value), plus PolicyEvent indexes on time, blocked/time, and code. These exist in Prisma as well. Do not rebuild the database from this ERD export; use versioned Prisma migrations.

## Recommended next implementation

1. Preserve request-level rejection and redirection as the default. Do not add automatic permanent session or account bans.
2. Introduce a shared structured decision: outcome, code, stage, reason, classifier source, confidence, and policy version. Separate unavailable and clarification from user violations.
3. Add nullable sessionId and requestId to policy events; do not invent associations for historical rows. Define a trusted user/session key and validate it server-side.
4. If session cooldown is desired, add independent persistent restriction state keyed by user and conversation, with reason, expiry, and administrator review/reset metadata.
5. Define which repeated violations qualify and the time window with the product owner. Exclude greetings, ambiguity, normal out-of-scope requests, infrastructure failures, and filtered model output from punitive counters by default.
6. Atomically update violation/restriction state and log the decision. Check active restrictions before any AI generation. Ensure concurrent requests, retries, refreshes, and multiple tabs cannot bypass or double-count restrictions.
7. Test genuine IT requests containing ambiguous terms, Tagalog follow-ups, unrelated requests, repeated violations, classifier outages, response filtering, deletion, expiry, and concurrent requests.

## Verification limits

The live checks in this review read schema metadata and rule counts only; no real prompts, credentials, or account records were exported. Existing automated tests use classifier/provider stubs and establish control-flow behavior, not live model accuracy. No live AI evaluation set or database migration was run for this analysis.
