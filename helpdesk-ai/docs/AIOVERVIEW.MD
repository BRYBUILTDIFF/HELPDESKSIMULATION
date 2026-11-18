# HelpDesk AI: Detailed AI System Overview and Request Flow

Analysis date: 17 November 2026. This document describes the implementation in this repository, with emphasis on the AI that answers users. Source code takes precedence over older design documents. Defaults below describe code defaults, not verified deployment settings. No private environment values are included.

## 1. Purpose and boundaries

HelpDesk AI combines authenticated IT troubleshooting chat with practical learning simulations. Users describe problems, receive clarification or troubleshooting instructions, return to saved conversations, and practice through published modules. Administrators manage users, policy settings, policy monitoring, and simulation content.

The answering assistant is restricted to IT helpdesk support: hardware, software, operating systems, networking, VPN, printers, email, account access, security, remote access, and related troubleshooting. Adding an IT keyword to an unrelated request does not automatically make it acceptable. The classifier is instructed to understand context and multilingual input, including Filipino/Tagalog.

The chat model generates text. Its chat request contains no tools or function definitions, and the chat controller does not execute commands, inspect the user's computer, reset accounts, search the web, or retrieve documents. Instructions to run commands are guidance for the user. Actual practice actions use separate simulation APIs.

There is no implemented retrieval-augmented generation pipeline, vector database, embedding search, document ingestion, or fine-tuning workflow in the answering path. Project documentation and simulation modules are not automatically inserted into the chat model's context.

## 2. System architecture

| Component | Responsibility | Main source |
| --- | --- | --- |
| React/Vite client | Login, chat composition, display, saved sessions, simulations, admin UI | `client/src/App.jsx`, `client/src/pages/` |
| Authentication client | In-memory access token, cookie-based refresh, authenticated requests | `client/src/context/AuthContext.jsx`, `client/src/hooks/useAxios.js` |
| Express API | Middleware, routing, validation, orchestration | `server/src/server.js`, `server/src/routes/` |
| Chat controller | Coordinates input policy, generation, output policy, event recording, context storage | `server/src/controllers/aiController.js` |
| Scope policy | Determines IT relevance and routes greetings, clarification, redirects, or generation | `server/src/policy/promptPolicy.js` |
| Content safety | Threat baseline, organization keywords, provider moderation | `server/src/policy/contentSafety.js` |
| AI clients | OpenAI-compatible answer provider and separate OpenAI moderation client | `server/src/utils/openai.js` |
| PostgreSQL/Prisma | Accounts, trusted model context, UI transcripts, policies, restrictions, metrics, simulations | `server/prisma/schema.prisma` |
| Simulation services | Deterministic terminal practice and Windows lab lifecycle | `server/src/services/terminalRuntime.js`, `windowsSimulationService.js` |

Paths in this document are relative to `helpdesk-ai/` unless stated otherwise.

## 3. The distinct AI roles

The system does not rely on one model call for all decisions.

| Role | Default/service | Input and output |
| --- | --- | --- |
| Answer generation | Configured OpenAI-compatible provider; default `gpt-4o-mini`, or `deepseek-chat` for DeepSeek | Helpdesk system prompt + trusted recent history + latest message → answer text |
| IT scope classification | Local Ollama-compatible endpoint, default `deepseek-r1:7b`; configured answer provider as fallback | Classification instructions + policy phrases + context → JSON label, confidence, reason |
| Content moderation | Separate OpenAI client, `omni-moderation-latest` | Current user message or generated answer → moderation result |
| Dashboard starting suggestions | Configured answer provider | Fixed suggestion request → up to six issue cards |
| Related-ticket selection | Local classifier endpoint | Query + supplied candidate cards → up to four existing candidate IDs |
| Admin module drafting | Configured answer provider, with template fallback | Eligible support prompt + required simulation surface/action catalog → draft module JSON |

Using DeepSeek for answers does not automatically provide OpenAI moderation credentials. Scope classification and moderation are separate dependencies.

## 4. Full chat sequence

```mermaid
sequenceDiagram
    participant U as User
    participant UI as React dashboard
    participant API as Express API
    participant DB as PostgreSQL
    participant Safety as Content safety
    participant Scope as Scope classifier
    participant Model as Answer provider
    U->>UI: Submit IT question
    opt Client detects missing OS for a terminal task
        UI-->>U: Ask for operating system
        U->>UI: Select operating system
    end
    UI->>API: POST /api/ai/chat
    API->>DB: Authenticate, rate limit, check cooldown
    API->>DB: Read trusted history and scope
    API->>Safety: Check latest user message
    API->>Scope: Classify topic unless exact configured greeting
    alt Direct reply or rejected input
        API->>DB: Record policy event and eligible violation
        API-->>UI: Reply or availability error
    else Allowed IT question
        API->>Model: System prompt + trusted history + message
        Model-->>API: Candidate answer
        API->>Safety: Check candidate answer
        opt Candidate passes content safety
            API->>Scope: Check answer topic without history
        end
        API->>API: Keep answer or substitute safe refusal
        API->>DB: Record event and append safe conversation turn
        API-->>UI: reply and policy code
    end
    UI-->>U: Render answer or error
    UI->>API: Separate debounced PUT /api/sessions/:id
    API->>DB: Save user-visible session JSON
```

The diagram summarizes branching. Validation/authentication failures stop before the controller, and failures during persistence can prevent a successful HTTP reply even after model generation.

### 4.1 Authentication and entry checks

1. The client restores a session through `/api/auth/refresh` and `/api/auth/me`, or the user logs in. The access token lives in React state; legacy local-storage access tokens are removed.
2. `useAxios` adds `Authorization: Bearer <accessToken>` and includes cookies. A user-session HTTP 401 causes one refresh attempt and retry; a failed refresh clears authentication.
3. Express applies CORS, Helmet, a 256 KB JSON limit, and cookie parsing. Allowed browser origins come from configured URLs, with limited development LAN handling.
4. `/api/ai/*` requires `verifyToken`: JWT verification plus a current database check for user existence, activation, token version, and required password change.
5. All AI routes share a database-backed limit of 20 requests per minute per authenticated user. Suggested-ticket requests consume this limit too. Excess requests return HTTP 429 with `Retry-After`.
6. The chat route validates `message` as trimmed text of 1–4,000 characters and `sessionId` as a required string of 1–120 characters. Optional `resetHistory` must be boolean. Optional client `history` is bounded to 20 entries with user/assistant roles and contents up to 4,000 characters.

Validation of client history does not make it trusted: the chat controller ignores that field when constructing model context.

### 4.2 Browser composition and OS clarification

`DashboardPage.jsx` creates or reuses a chat session, appends the visible user message, clears the composer, and normally sends:

```json
{
  "message": "My VPN will not connect on Windows.",
  "sessionId": "session-example",
  "history": []
}
```

Before the request, a client heuristic checks the current text for a terminal reference plus file/directory operation terms without an explicit OS. When matched, it displays an `os-choice` message locally instead of immediately calling the API.

An OS selection resubmits the original issue with an added statement that the user confirmed that OS and requests instructions for it alone. The visible user message can therefore differ from the full API message. Selecting “Not sure” gives local identification guidance.

This heuristic inspects the current message rather than the entire trusted server conversation. Separately, the generation system prompt asks the model to clarify the OS whenever the conversation does not establish it.

### 4.3 Controller preparation and cooldown

`chat()` performs these operations before generation:

1. Applies `redactSecrets()` to the message and trims it.
2. Creates a server-generated UUID `requestId` for policy-event tracing.
3. Checks `SessionRestriction` for `(authenticated userId, sessionId)`. An active restriction returns HTTP 429, `SESSION_COOLDOWN`, expiration, and `Retry-After` before history reset or model calls.
4. If `resetHistory` is true, deletes that user's `PolicyConversation` row for this session.
5. Loads trusted server history and the stored conversation scope.
6. Calls `evaluatePromptPolicy(message, history, { conversationScope })`.

The session ID is a user-scoped conversation key. A pre-existing `ChatSession` record is not required for chat generation. Identity comes from authentication, never a user ID supplied in the request body.

### 4.4 Input policy order

`evaluatePromptPolicy()` loads the current database-backed policy and includes its version in decision metadata.

1. Check empty/oversized input defensively, including text that became empty after redaction.
2. Run content safety first, even for greetings.
3. Compare normalized text against complete configured greeting phrases. Matching is case-insensitive, collapses whitespace, and removes surrounding `!`, `.`, `?`, and whitespace. An exact greeting returns the configured greeting response without answer generation.
4. Otherwise classify the latest message in recent conversation context.
5. Route according to the decision table below.

| Condition | Code | Result |
| --- | --- | --- |
| Configured exact greeting | `GREETING_PATTERN` | Configured direct greeting |
| Classifier says greeting | `GREETING` | Configured direct greeting |
| `in_scope` with confidence ≥ 0.75 | `ALLOWED` | Continue to answer generation |
| Non-greeting classification with confidence < 0.75 | `SCOPE_CLARIFICATION` | Configured clarification; do not generate a troubleshooting answer |
| Confident out-of-scope decision | `OUT_OF_SCOPE_REDIRECT` | Configured IT-only redirect |
| All scope classification paths fail | `SCOPE_CLASSIFIER_UNAVAILABLE` | HTTP 503; do not generate |
| Safety service unavailable | `SAFETY_UNAVAILABLE` | HTTP 503; do not generate |
| Safety rejection | `SAFETY_THREAT`, `SAFETY_CUSTOM_KEYWORD`, or `SAFETY_CONTENT` | Safety reply; eligible for violation counting |

Direct replies are recorded as events and returned with `policy.blocked: false`. This includes out-of-scope redirects and clarification. Safety rejections use `policy.blocked: true`. A redirect is not a safety violation.

The controller's direct-reply and rejected-input branches do not append turns to `PolicyConversation`. They can still appear in the separately saved UI transcript.

### 4.5 Content safety details

`evaluateContentSafety()` uses this sequence on both input and generated output:

1. A regular-expression baseline identifies certain explicit threats of harm.
2. Organization-configured `safetyBlockedKeywords` are matched as escaped literal phrases with Unicode letter/number boundaries. These are enforcement rules, unlike the scope reference keywords.
3. The OpenAI moderation client calls `omni-moderation-latest`. A flagged result or any true returned category causes a rejection.

If policy configuration cannot be read, safety returns unavailable. If moderation credentials are missing or the moderation call fails, production fails closed. Outside production, `MODERATION_FAILURE_MODE=baseline` permits proceeding after local checks; without that setting, the unavailable result still blocks progression.

Threat/keyword patterns and moderation reduce risk but do not prove safety or factual correctness. Secret redaction is also best-effort rather than a guarantee that all private data is detected.

### 4.6 Scope classification and fallback

The classifier receives its own system instructions, all configured scope reference phrases, up to eight recent history entries, and the latest message. History entries are limited to user/assistant roles and 4,000 characters each.

Its expected JSON is:

```json
{"classification":"in_scope","confidence":0.95,"reason":"The user needs VPN troubleshooting."}
```

The parser can extract JSON from code fences or surrounding reasoning text. Unsupported labels and malformed responses fail classification.

Local classification uses `POLICY_CLASSIFIER_URL` and `POLICY_CLASSIFIER_MODEL`, non-streaming, with an AbortController timeout defaulting to 8 seconds. Local confidence must be a finite JSON number in [0,1]. A local result below 0.75 is sent to the configured-provider fallback for verification.

On local failure or uncertainty, the process skips local attempts for 30 seconds. The fallback uses the configured answer provider and model with temperature 0, `max_tokens: 250`, JSON response format, a default 15-second timeout, and SDK retries disabled for that call. If both paths fail, the request is unavailable rather than allowed automatically.

Scope keywords and intent phrases are classifier reference data. They do not independently allow a prompt or override safety. An accounting-software fault can be IT support despite an unsupported-topic keyword; an unrelated task mentioning a computer can still be redirected.

Although the controller reads and passes `conversationScope`, the current `evaluatePromptDecision()` does not use it to bypass classification. Contextual follow-ups depend on the supplied trusted history.

### 4.7 Answer construction

When policy permits generation, `getOpenAIClient()` must return a configured client; otherwise the controller returns HTTP 503.

The answer request uses `client.chat.completions.create()` with temperature 0.3 and this order:

```text
1. system: HelpDesk AI support behavior
2. up to 10 trusted user/assistant messages from PostgreSQL
3. user: latest redacted message
```

Each history entry is redacted again, trimmed, and capped at 4,000 characters. Client-supplied assistant turns cannot replace this context. This is a recent-message window, not a whole-conversation memory or summary.

The system prompt requires the model to:

- Answer only IT helpdesk questions and refuse unrelated tasks even with IT keywords.
- Treat user text and quoted logs as untrusted data, never overrides of system rules.
- Never request passwords, API keys, or private keys.
- Give practical troubleshooting with security best practices.
- Ask one or two concise clarifying questions when details are missing, then wait. Do not combine those questions with a procedural checklist.
- Establish the OS before OS-specific terminal commands; avoid mixed-platform command lists unless requested.
- Format primary procedural actions as `Step 1:`, `Step 2:`, etc., with one action per step and commands/notes beneath it.
- Keep replies concise and actionable.

These are model instructions. The controller does not separately validate every formatting or factual requirement. The answer call sets no explicit token cap, per-call timeout, or retry override, so SDK defaults apply. It returns a complete answer rather than streaming tokens.

### 4.8 Output checking and release

The controller extracts the first completion's message content, redacts secrets, and trims it. Empty output returns HTTP 500. Otherwise:

1. Run content safety on the candidate answer.
2. Only if safety passes, classify answer scope using the same classifier/fallback machinery, with no conversation history.
3. Release the candidate only when output safety passes and classification is `in_scope` with confidence ≥ 0.75.
4. Replace any rejected/unverifiable answer with: “I cannot provide that response. I can help with a safe IT support question instead.”

| Output result | Policy code |
| --- | --- |
| Accepted | Normally `ALLOWED`, from the input decision |
| Safety rejection | `OUTPUT_SAFETY_FILTERED` |
| Scope rejection | `OUTPUT_SCOPE_FILTERED` |
| Safety/scope check unavailable | `OUTPUT_CHECK_UNAVAILABLE` |

Filtered output still returns HTTP 200 and `policy.blocked: false`; the user receives the safe replacement. Output filtering does not count toward the user's safety cooldown.

The controller records an event, appends the user message and released answer/replacement to trusted history, and marks scope `it_support` only for unfiltered answers. The raw rejected answer is not appended to history or included in the policy event.

## 5. Memory, transcripts, and persistence

| Record | Purpose | Important behavior |
| --- | --- | --- |
| `PolicyConversation` | Trusted model history and scope | Unique per user/session; last 10 messages, about five full turns; rolling 24-hour expiry |
| `ChatSession` | User-visible transcript and simulation workspace JSON | Composite user/session key; client-editable display state; not model authority |
| `PolicyEvent` | Governance and troubleshooting evidence | Redacted prompt excerpt, code/reason/outcome, user/session/request association, metadata |
| `SessionRestriction` | Safety violation window and cooldown | User/session scoped; independent of transcript deletion |
| `PolicyConfig` / `PolicyRule` | Versioned policy templates and phrase lists | PostgreSQL-backed with runtime caching/version checks |
| `RequestLimit` | Shared request counters | Atomic database counters across API processes |

`appendChatTurn()` uses a PostgreSQL transaction and advisory lock per user/session to avoid lost history appends. It keeps the last ten entries, truncates each saved message to 4,000 characters, and extends expiry by 24 hours. Reads treat expired context as empty even before cleanup deletes it.

The dashboard separately loads up to 500 saved sessions through `GET /api/sessions`, then debounces changed-session writes through `PUT /api/sessions/:id`. The server redacts nested string values, checks matching IDs, allows at most 1,000 messages and 200 KB per session, and enforces a 500-session quota. Failed hydration/save operations surface a retry message in the UI.

A saved transcript can remain visible after trusted model context expires. Reopening it does not reconstruct expired model history from browser data. The assistant may therefore need the user to restate an older issue.

### Editing and deletion

The current UI permits up to two user-message edits per session. Editing truncates later visible messages and sends the edited text with `resetHistory: true`. The server clears the entire trusted conversation row rather than rebuilding the preceding visible turns. Earlier transcript entries may remain visible while no longer being model context. The edit limit is a client behavior, not a server authorization rule.

Single-session deletion removes the caller's saved session and trusted conversation, clears legacy session-state copies, and requests cleanup of associated server-owned labs. It does not clear `SessionRestriction`.

Delete-my-data removes saved/trusted conversation data, ends owned labs, and anonymizes policy-event identity/text/reason/session/request/metadata while preserving aggregate security statistics. Cooldowns remain independent until expiry or authorized admin reset.

Retention cleanup runs at server startup and hourly. Defaults are 90 days for policy events and 90 days for saved chats, configurable separately. Expired trusted conversations are removed. Restriction rows older than a day are eligible for pruning only when no cooldown remains active. Admin audit records use a separate maintenance policy rather than runtime deletion.

## 6. Safety cooldown rules

Only blocked input events whose code starts with `SAFETY_` and does not contain `UNAVAILABLE` count as violations.

- First and second eligible violations increment the conversation's counter.
- A third within a 15-minute window starts a 10-minute cooldown.
- The third rejection includes cooldown expiration and violation details in `policy` metadata.
- Subsequent requests in that conversation return HTTP 429 before policy/generation.
- A violation after window/cooldown expiry starts a fresh count as defined by the restriction service.

Violation updates and their events are recorded in one transaction with an advisory lock. Requests already in progress are not cancelled retroactively. A different session ID is a different conversation; this is not an account-wide ban. Request UUIDs are trace identifiers, not retry deduplication keys.

Admins can inspect `/api/admin/session-restrictions` and reset a user's specified conversation through `POST /api/admin/session-restrictions/:userId/reset`. Admin access and mutation auditing apply.

## 7. Response display and errors

The dashboard distinguishes `policy.blocked: true` responses as policy bubbles. Other replies, including scope redirects, clarification, and filtered output, use normal text messages. It normalizes formatting; replies without fenced code have some Markdown emphasis/list markers removed. The latest suitable answer can become actionable for simulation UI.

| Situation | API behavior | User-flow implication |
| --- | --- | --- |
| Invalid request | Validation HTTP 400 | Request stops before chat policy |
| Missing/expired user auth | HTTP 401 | Client refreshes once and retries |
| Required password change | HTTP 403, `PASSWORD_CHANGE_REQUIRED` | Client redirects to password change |
| Request limit | HTTP 429 + `Retry-After` | Client displays API message |
| Active safety cooldown | HTTP 429, `SESSION_COOLDOWN` | Client displays conversation-paused message |
| Input moderation/classifier unavailable | HTTP 503 with specific service message | Current dashboard replaces any 503 with a generic AI-key configuration message |
| Answer provider missing | HTTP 503 | Same generic dashboard configuration message |
| Provider authentication failure caught by chat | HTTP 502 with configuration guidance | Avoids treating provider credentials as a user-session 401 |
| Generated output rejected/unverifiable | HTTP 200 + output policy code | Safe replacement displayed as normal text |
| Empty answer | HTTP 500 | Failure message; no saved trusted turn |
| Database failure | Centralized error; typically HTTP 500, `DATABASE_UNAVAILABLE` | Database message; generation may already have happened |
| No HTTP response | Browser network-error branch | “Connection error. Please try again.” |

The controller annotates exceptions with the failed operation, such as `generate-answer`, `record-policy-event`, or `save-chat-history`. Central error logging avoids raw request bodies, provider headers, and database URLs.

Policy events are not guaranteed for every HTTP request: authentication, validation, rate-limit, active-cooldown, missing-client, and certain error exits do not create a new event through this controller. There is no single transaction spanning generation, event creation, history append, and scope update. A retry after partial persistence can repeat work.

## 8. Policy administration and monitoring

Admin routes require a current authenticated `ADMIN` user and audit middleware. Administrators can edit greeting phrases, scope keywords, intent phrases, safety-block keywords, and reply templates. Plain-language constraints apply to greeting/intent entries; they are not arbitrary executable regular expressions.

Configuration initializes from database records. If no configuration exists, defaults or the legacy `server/data/policy-config.json` seed are imported. The legacy file is not the normal live source of policy updates. Updates increment the database policy version, and runtime checks use that version to refresh configuration.

Some retained templates, such as mixed-scope and follow-up-without-context messages, are not separate active decision branches in the current classifier-driven policy. The answering system prompt itself is a code constant, not editable through these policy-list APIs.

`recordPolicyEvent()` stores a redacted prompt excerpt up to 300 characters and a reason up to 1,000 characters. Input classifier metadata can include source, model, confidence, and policy version. Output classifier details are not separately stored as full output metadata; filtered events identify the output stage and result code.

Outcomes distinguish `ALLOWED`, `REDIRECTED`, `BLOCKED`, `OUTPUT_FILTERED`, and `UNAVAILABLE`. Summary reporting includes totals, recent activity, code counts, and today's counts using the Asia/Manila calendar day. Block rate excludes unavailable outcomes from its denominator. Greetings and clarifications belong to allowed outcomes; allowed does not necessarily mean an answer-model call occurred.

Policy events are PostgreSQL-backed in the current implementation. Database failure is not silently replaced with file/in-memory event storage.

## 9. Suggestions and ticket matching

### Suggested starting issues

`GET /api/ai/suggested-tickets` asks the configured answer provider for six varied safe IT helpdesk issues at temperature 0.55. JSON is normalized to at most six label/title/question objects, with lengths capped at 40/100/300 characters. Empty or failed generation returns HTTP 200 with an empty list and `unavailable: true`.

Successful suggestions are cached for 15 minutes in process memory. Concurrent generation requests in the same process share a pending promise. These are starting prompts, not tickets retrieved from an incident-management database, and they do not pass through the full chat safety/scope pipeline.

### Related-ticket API

`POST /api/ai/related-tickets` accepts a query of 2–300 characters and 1–12 candidate objects. It redacts input, asks the local classifier to select IDs, removes unknown/duplicate IDs, and returns at most four. Its timeout defaults to five seconds. Failure returns an empty list with `unavailable: true`.

The process-local cache lasts five minutes and holds up to 200 entries. Its key uses lowercased query plus candidate IDs, so changed content with identical IDs can reuse a cached selection. This endpoint has no configured-provider fallback. A source search found the route/controller but no current client request to this endpoint; its existence should not be taken as proof that the dashboard actively uses it.

## 10. How answers connect to simulations

Chat advice and assessed practice are separate flows. The dashboard uses answer/context heuristics and published module data to offer or open simulations. Selecting a published scenario can bypass chat generation and open the module directly.

### Terminal practice

1. The user opens an enabled module.
2. `POST /api/simulations/modules/:id/attempts` validates its runtime definition and creates a server-owned `SimulationAttempt`, normally expiring after two hours.
3. Command/checkpoint submissions go to the attempt's `/commands` endpoint.
4. `terminalRuntime.js` checks the action catalog, step order, simulated state, and accepted commands. It records deterministic output and mistakes under a transaction lock.
5. Completion uses server-validated attempt state for terminal modules. Accepted action replays are idempotent when their kind/command match.

The runtime simulates a supported environment. It does not execute arbitrary AI-generated shell commands on the host. A model's troubleshooting prose is not by itself proof that a step was completed.

### Windows OS labs

Windows modules use `/api/simulation-sessions` and dedicated lifecycle services to reserve/provision an EC2-backed workspace, poll readiness, create a controlled Guacamole connection, and end the lab. Server-owned user/module/chat associations, quotas, expiry, and cleanup are enforced independently of chat text and client-editable transcript JSON.

Lab side effects arise from explicit simulation endpoints, not model tool calls. For deployment and lifecycle details, see [Windows simulation](WINDOWS_OS_SIMULATION.md) and [security implementation](SECURITY_IMPLEMENTATION.md).

### Admin feedback and module creation

1. Policy events provide a bounded sample of recent allowed support prompts.
2. Admin prompt insights filter eligible decision codes and supported IT simulation alignment, group similar intents, and omit dismissed/already-covered prompts.
3. A draft request chooses a supported surface: Windows Terminal, Mac Terminal, Windows OS, or Mac OS.
4. The configured model can generate a JSON draft; unavailable/invalid generation falls back to a template. Draft responses disclose whether AI or a template produced the result.
5. Draft fields are sanitized, surface selection is enforced, and terminal drafting receives the supported action catalog.
6. Terminal publishing is gated by an interactive server test and a signed token bound to the exact normalized definition and admin identity. A generated draft is not automatically trusted executable content.

Prompt insights operate on redacted/truncated policy-event samples, not full user transcripts or an automatic training dataset. Module drafting uses its own alignment/validation path, not the complete chat policy pipeline. Admin draft generation has a 10/hour limit in addition to mutation limits.

## 11. Configuration reference

| Variable | Purpose/default in source |
| --- | --- |
| `AI_PROVIDER` | `openai` by default; `deepseek` selects DeepSeek defaults |
| `AI_API_KEY` | Primary answer-provider key; falls back to `OPENAI_API_KEY` |
| `AI_BASE_URL` | Optional OpenAI-compatible endpoint override; DeepSeek defaults to `https://api.deepseek.com` |
| `AI_MODEL` | Primary model override; falls back to `OPENAI_MODEL`, then provider default |
| `OPENAI_API_KEY` | Moderation key; also legacy answer-key fallback |
| `POLICY_CLASSIFIER_URL` | Local classification URL; default `http://localhost:11434/api/chat` |
| `POLICY_CLASSIFIER_MODEL` | Default `deepseek-r1:7b` |
| `POLICY_CLASSIFIER_TIMEOUT_MS` | Local scope timeout; default 8,000 ms, minimum 1,000 |
| `POLICY_PROVIDER_TIMEOUT_MS` | Provider scope timeout; default 15,000 ms, minimum 1,000 |
| `RELATED_TICKET_TIMEOUT_MS` | Related selector timeout; default 5,000 ms, minimum 1,000 |
| `MODERATION_FAILURE_MODE` | `baseline` permits reduced moderation only outside production |
| `POLICY_RETENTION_DAYS` | Policy-event retention; default 90 |
| `CHAT_RETENTION_DAYS` | Saved-chat retention; default 90 |
| `DATABASE_URL` | PostgreSQL connection for Prisma |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Distinct signing secrets of at least 32 characters |
| `NODE_ENV` | Required recognized environment: development, test, or production |
| `CLIENT_URL`, `CLIENT_URLS` | Credentialed browser-origin allowlist |
| `VITE_API_URL` | Client API base; defaults to `/` |

For moderation, the client uses `OPENAI_API_KEY`, or `AI_API_KEY` only when the selected provider is `openai`. It does not inherit `AI_BASE_URL`. Provider clients are cached in process; changing credentials or configuration should be followed by a server restart. Local classifier URL/model constants are loaded when their module is required.

Production startup additionally checks for a non-privileged database role and rejects exposure of `ADMIN_DATABASE_URL` to the API process. Database availability is necessary for authentication, rate limiting, policy configuration, context, and event persistence.

## 12. Operational characteristics and current limitations

- A successful non-greeting chat can require input moderation, input classification, answer generation, output moderation, and output classification. Classifier fallbacks add calls. Latency and cost therefore exceed one answer completion.
- Local classifier backoff and suggestion caches are process-local; restriction state, configuration versions, request counters, and history are database-backed across workers.
- Classification is semantic and probabilistic. Output scope classification without history may reject a short contextual clarification or a legitimate answer that lacks standalone IT context.
- The server enforces a ten-message history window and expiry, not a token-budget calculation or summary. Long recent messages can still create large prompts. Saved answer history is capped at 4,000 characters even if a longer reply was displayed.
- History append locking prevents lost appends, but does not serialize the complete policy/generation operation. Simultaneous requests can read the same old context before either saves a result.
- Direct policy replies are not included in trusted history. A later short response to a policy clarification may have less context than the visible transcript suggests.
- Reset/edit discards trusted context, and display persistence is separate from answer persistence. There is no atomic end-to-end conversation transaction or chat retry idempotency key.
- Dashboard HTTP 503 handling currently hides distinctions among missing provider configuration, moderation outage, and scope outage behind the same configuration message.
- Scope/safety checks do not establish answer correctness. No knowledge retrieval, live device telemetry, tool execution, or automatic human-ticket handoff is implemented in chat.
- User text and recent context can leave the server for the selected provider and OpenAI moderation; a classifier URL can also point to a remote host. Redaction reduces recognized secrets but does not remove all personal data.
- Existing older documents contain historical behavior such as fail-open classification, browser-persisted access tokens, or file-fallback event storage. Those descriptions should not override the current source behavior documented here.

## 13. Source map and verification

Use these files when changing or diagnosing the flow:

| Concern | Files |
| --- | --- |
| Application routing/auth | `client/src/App.jsx`, `context/AuthContext.jsx`, `hooks/useAxios.js` |
| User message lifecycle | `client/src/pages/users/DashboardPage.jsx` |
| API middleware/limits | `server/src/server.js`, `middleware/authMiddleware.js`, `requestLimits.js`, `validateRequest.js` |
| Chat contract/orchestration | `server/src/routes/ai.routes.js`, `controllers/aiController.js` |
| Input/output scope | `server/src/policy/promptPolicy.js` |
| Safety and redaction | `server/src/policy/contentSafety.js`, `utils/redact.js` |
| Provider selection | `server/src/utils/openai.js` |
| Trusted context | `server/src/store/chatHistoryStore.js`, `policyConversationStore.js` |
| Display persistence/deletion | `server/src/controllers/sessionController.js`, `routes/session.routes.js` |
| Policy/config/metrics | `server/src/store/policyConfigStore.js`, `policyEventStore.js` |
| Cooldown/retention | `server/src/services/sessionRestrictionService.js`, `retentionService.js` |
| Admin drafts and feedback | `server/src/controllers/adminController.js`, `routes/admin.routes.js`, `store/simulationModuleStore.js` |
| Terminal and lab execution | `server/src/controllers/simulationAttemptController.js`, `simulationSessionController.js`, `server/src/services/terminalRuntime.js`, `windowsSimulationService.js` |
| Active database model | `server/prisma/schema.prisma` |

Relevant automated coverage includes `chat.test.js` (forged-history rejection, saved response, provider authentication, output filtering, unavailable classification), `policy.test.js`, `classifierFallback.test.js`, `classifierConfidence.test.js`, `safetyKeywords.test.js`, `sessionRestrictions.test.js`, `policyConfiguration.test.js`, and `policyMetrics.test.js`. Terminal/lab behavior has separate runtime/lifecycle tests. Mocked tests demonstrate branch behavior rather than live provider accuracy or deployed service health; database integration scripts require their intended database environment.

Validation during this documentation task: all 24 tests passed across `chat.test.js`, `policy.test.js`, `classifierFallback.test.js`, `classifierConfidence.test.js`, `safetyKeywords.test.js`, `sessionRestrictions.test.js`, and `policyMetrics.test.js`. The chat test harness emitted a warning about its mocked exports lacking `evaluateResponseDecision`; no test failed. No live-provider or database integration checks were run for this documentation change.

This overview was derived from source inspection. It does not certify external provider availability, deployed settings, model accuracy, or production infrastructure state.
