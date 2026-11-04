# Help Desk AI — Role-Based Test Cases

Prepared: 2026-09-29. Roles: **ADMIN** and **USER**.

This is a manual functional and regression test plan based on the current source code. It is not an execution report: **all cases are Not Run**. Expected results are acceptance checks, not claims that the application has passed. API cases supplement browser testing where the UI cannot exercise authorization or boundary conditions.

## Preparation and execution

- Use a dedicated test environment and disposable records. Configure the client, API, database, and AI service. Run Windows cloud cases only with a configured test AWS/Guacamole environment; end workspaces after each case.
- Prepare two active admins (A1, A2), two active users (U1, U2), and an inactive user (U3). Use separate browser profiles for simultaneous accounts.
- Prepare enabled and disabled modules, a terminal module with known valid commands, a Windows OS module, policy events across two weeks, and several distinct eligible suggestions. Prepare enough users/events to exercise pagination.
- Example valid password: `TestAccount@2026`; invalid password: `short`. Use unique test email addresses. Do not copy production credentials into test evidence.
- Each case starts with the indicated role signed in unless it explicitly tests login. Restore changed account, policy, and module fixtures before the next dependent case.
- Record actual result, Pass/Fail/Blocked, evidence, browser, build revision, and defect reference for each ID. Missing AI/cloud dependencies mean Blocked, not Pass.
- For negative API cases, use the named account's bearer token. Do not infer API authorization from frontend redirects alone.

## 1. ADMIN

### Authentication and account settings

| ID | Scenario / precondition | Steps | Expected result |
|---|---|---|---|
| ADM-001 | Valid admin login | Sign in as A1; open `/`. | Admin console opens at `/admin`. |
| ADM-002 | Invalid login | Submit an unknown email, then an incorrect password for A1. | Login is rejected; no authenticated console appears. |
| ADM-003 | Session restoration | Sign in; reload `/admin`; exercise an expired access token with a valid refresh session. | Admin session restores or refreshes without losing the role. |
| ADM-004 | User-page routing | As A1, open `/dashboard` and `/simulations` directly. | Both redirect to `/admin`. |
| ADM-005 | Change password | In account settings, enter correct current password and a valid different password; sign out and retry both passwords. | New password works; old password fails. |
| ADM-006 | Invalid password change | Try wrong current password, weak new password, identical password, and mismatched confirmation separately. | Each is rejected without changing credentials. |
| ADM-007 | Logout | Sign out; revisit `/admin` and reload. | Login is required; admin data is no longer displayed. |

### Overview dashboard

| ID | Scenario / precondition | Steps | Expected result |
|---|---|---|---|
| ADM-008 | User totals | Compare overview counts with fixture accounts, including A1. | Total, active, and admin counts include all accounts, including the signed-in admin. |
| ADM-009 | AI response chart dates | Open overview with events inside and outside this week. | Title identifies this week; range includes Sunday through Saturday and year; weekday labels include dates. Only events in the represented week contribute. |
| ADM-010 | Week boundaries | Supply events just before Sunday midnight, at Sunday midnight, and at the following Sunday midnight in browser-local time. | First and last are excluded; current Sunday's event is included. Labels and bins agree across month/year boundaries. |
| ADM-011 | Chart counts | Compare daily chart points with the loaded policy-event fixture. | Counts represent policy events, including allowed and blocked decisions; tooltips show response counts. |
| ADM-012 | Other metrics | Compare policy block rate, today's blocked count, completion totals, and top modules with fixture data. | Values and ranking agree with their data sources; zero-data states remain readable. |
| ADM-013 | Recent activity | Create a test account and generate a policy event; refresh overview. | Recent activity displays relevant available events with readable timestamps. |

### User Management

| ID | Scenario / precondition | Steps | Expected result |
|---|---|---|---|
| ADM-014 | Hide current admin | As A1, open User Management; search A1's name/email and filter ADMIN. | A1 never appears in the list or its pagination totals; A2 remains available. |
| ADM-015 | Multiple admins | Sign in separately as A2 and repeat the previous case. | A2 is hidden from its own list; A1 is visible. |
| ADM-016 | Create user | Create a unique USER with valid names, email, and password. | Account appears and can log in to the user dashboard. |
| ADM-017 | Create admin | Create a unique ADMIN. | Account appears for other admins and logs in to `/admin`. |
| ADM-018 | Required fields | Submit blank names, malformed email, and an invalid password separately. | Validation identifies the problem; no invalid account is created. |
| ADM-019 | Duplicate email | Create or edit an account using another account's email. | Conflict is reported; existing accounts remain unchanged. |
| ADM-020 | Edit account | Edit another account's names/email; save and refresh. | Changes persist and the account remains usable. |
| ADM-021 | Change another account's role | Promote U2 to ADMIN, verify access, then demote it back. | Role persists; subsequent authorization uses the updated database role. |
| ADM-022 | Deactivate/reactivate | Disable U2; test its existing session and a new login; re-enable it. | Disabled account cannot authenticate or use protected requests; login works after reactivation. |
| ADM-023 | Search and combined filters | Search a known name/email; combine role and activation filters; clear them. | Only matching accounts appear; clearing restores the list except the current account. |
| ADM-024 | Pagination and empty results | Navigate multiple pages; narrow filters until fewer pages remain; search nonsense. | Page stays valid; empty state appears without stale rows. |
| ADM-025 | Delete account | Cancel deletion of a disposable user; then confirm deletion. | Cancel retains it; confirmation removes it and prevents login. |
| ADM-026 | Self-protection through API | Send requests to demote, deactivate, and delete A1 using A1's token. | Each is rejected with HTTP 400; A1 remains active and ADMIN. |
| ADM-027 | Invalid role / missing account | Submit unsupported role through admin API; edit/delete a nonexistent ID. | Invalid role fails validation; nonexistent account returns 404. |

### Policy Monitor and configuration

| ID | Scenario / precondition | Steps | Expected result |
|---|---|---|---|
| ADM-028 | Decision summary | Open Policy Monitor with known allowed/blocked records. | Total, Allowed, Blocked, and Block Rate match the summary response. |
| ADM-029 | Filter decisions | Search prompt/reason/user/code; combine code, status, and time filters. | Rows satisfy all selected criteria; clearing filters restores the available dataset. |
| ADM-030 | Event detail | Open View for allowed and blocked decisions. | Modal shows the selected event's details; closing returns to the same table. |
| ADM-031 | Export CSV | Export a known filtered dataset; inspect downloaded CSV. | Exported content corresponds to the selected dataset and remains valid for text containing commas/quotes. |
| ADM-032 | Decision pagination | Change pages, then apply a restrictive filter. | Pagination resets appropriately; empty results render without errors. |
| ADM-033 | Add/edit/delete policy entry | In Configuration, add a unique plain-language rule, edit it, then delete it using confirmation controls. | Each confirmed change persists after reload; canceled actions do not change configuration. |
| ADM-034 | Invalid policy entry | Submit blank text and regex-like text such as `^test.*`. | Invalid entries are rejected with useful feedback. |
| ADM-035 | Policy messages | Change a configurable response message; trigger the matching policy outcome as U1. | Saved message is used where applicable; restore the original afterward. |
| ADM-036 | Reset defaults | Cancel Reset first; then confirm Reset in the test environment. | Cancel preserves custom values; confirm restores defaults. |
| ADM-037 | Policy request failure | Simulate an API failure while saving configuration. | Error is shown; UI does not report success for an unsuccessful save. |

### Simulation Modules and Suggestion Queue

| ID | Scenario / precondition | Steps | Expected result |
|---|---|---|---|
| ADM-038 | Uniform status cards | Compare Simulation Modules cards with Policy Monitor at desktop and mobile widths. | Both use the same KPI card layout, typography, spacing, colors, and responsive styling; simulation values remain correct. |
| ADM-039 | Status-only filtering | Open Modules; select All statuses, Enabled, and Disabled. | Matching modules appear; module search/category/sort/More filters controls are absent. |
| ADM-040 | Enable/disable module | Disable an enabled module; reload the user module catalog; enable it again. | State persists; disabled server module is unavailable to users and returns after re-enabling. |
| ADM-041 | Preview module | Select View Simulation for a module. | Correct module content/surface opens; closing returns to the module list. |
| ADM-042 | Delete module | Cancel deletion, then confirm deletion of a disposable module. | Cancel preserves it; confirmed deletion removes it from the module list. |
| ADM-043 | Queue loading and grouping | Generate multiple eligible prompts with similar intent; Refresh Prompt Monitoring. | Eligible insights display grouped occurrence/variant counts and recommended surface; inspect actual grouping rather than requiring exact AI wording. |
| ADM-044 | Queue search | Search a prompt/category/surface; clear search. | Matching suggestions appear; clearing restores all loaded suggestions. |
| ADM-045 | Queue toolbar layout | View Suggestion Queue on wide and narrow screens. | Narrower search sits left; Refresh and Disregard all sit right on the same row where space permits; controls wrap without overflow. |
| ADM-046 | Refresh suggestions | Generate another eligible event; click Refresh. | Queue refreshes; loading state is visible and repeated refresh is disabled while loading. |
| ADM-047 | Generate AI draft | Select Generate AI Draft on an eligible insight. | Preview opens with generated editable simulation content or a clear generation error; no module is published merely by opening the draft. |
| ADM-048 | Save valid draft | Review a draft with at least three steps and save it. | Module is created; module list and insights refresh. |
| ADM-049 | Invalid draft | Attempt to save a draft with fewer than three steps. | Save is blocked with an error explaining the minimum. |
| ADM-050 | Disregard one | Disregard a suggestion; refresh and reload the page. | Suggestion is removed and stays dismissed through the persisted dismissal mechanism. |
| ADM-051 | Cancel Disregard all | With multiple suggestions, click Disregard all and cancel confirmation. | Queue and persisted dismissals are unchanged. |
| ADM-052 | Confirm Disregard all | Search so only one suggestion is visible; confirm Disregard all. | All currently loaded suggestions, including search-hidden items, are dismissed; counts update. Existing modules are unaffected. |
| ADM-053 | Bulk partial failure | Allow first dismissal request, fail a later request during Disregard all. | Successful items disappear; remaining items stay; error reports completed/total counts; controls recover for retry. |
| ADM-054 | Bulk busy/empty states | Start bulk dismissal; attempt Refresh or another suggestion action; finish with an empty queue. | Conflicting actions are disabled while busy; Disregard all is disabled for an empty queue. |
| ADM-055 | Queue limit | Prepare more than 20 eligible distinct insights; dismiss all loaded items; Refresh. | Initial response is capped at 20. Additional previously unloaded suggestions may appear after Refresh; record this scope limitation. |
| ADM-056 | Test Windows module | Select Test Windows for a configured Windows OS module; end the session afterward. | Windows workspace lifecycle opens from admin preview; errors are visible if dependencies are unavailable. |

## 2. USER

### Authentication, profile, and access

| ID | Scenario / precondition | Steps | Expected result |
|---|---|---|---|
| USR-001 | Valid login | Log in as U1; open `/`. | User dashboard opens at `/dashboard`. |
| USR-002 | Invalid/inactive login | Try incorrect credentials and U3's inactive account separately. | Authentication fails with appropriate feedback. |
| USR-003 | Protected navigation | Without a session, open dashboard/simulations; then sign in and reload. | Anonymous visitor goes to login; authenticated user can access both pages. |
| USR-004 | Admin page restriction | As U1, open `/admin`. | User is redirected away from the admin console. |
| USR-005 | Admin API restriction | As U1, call admin user, policy, and simulation management endpoints. | Requests are rejected with 403 and cause no mutation. |
| USR-006 | Registration route | Open `/register` in the browser. | Redirects to login; there is no public registration page. |
| USR-007 | API registration | POST valid registration data to `/api/auth/register`; repeat email; try weak password. | Valid request creates USER; duplicate returns 409; weak password is rejected. This is an API-only flow. |
| USR-008 | Registration role injection | Include `role: ADMIN` in an otherwise valid registration request. | Created account is USER, not ADMIN. |
| USR-009 | Password change | Change password with correct current password; sign out and test old/new credentials. | New password works; old fails. |
| USR-010 | Password validation | Try wrong current, weak, unchanged, and mismatched new password separately. | Each fails without changing the account password. |
| USR-011 | Session expiry/logout | Test valid refresh, invalid refresh, then logout and protected navigation. | Valid refresh restores access; invalid authentication/logout requires login. |
| USR-012 | Theme and layout | Switch theme; reload; open/collapse sidebar at desktop/mobile widths. | Theme persists and navigation remains usable without overlapping main controls. |

### AI helpdesk and saved conversations

| ID | Scenario / precondition | Steps | Expected result |
|---|---|---|---|
| USR-013 | In-scope question | Ask an eligible IT question, e.g. inability to connect to Wi-Fi. | User message and relevant helpdesk response appear; loading clears. Evaluate relevance and readability, not exact generated text. |
| USR-014 | Greeting | Send a greeting such as `Hello`. | Appropriate greeting response appears without an unrelated simulation launch. |
| USR-015 | Out-of-scope prompt | Submit a clearly unrelated request under the configured policy. | Policy response explains the scope restriction; no normal out-of-scope answer is presented. |
| USR-016 | Follow-up context | Ask an IT question, then answer a clarifying question in the same conversation. | Response uses the current conversation context. |
| USR-017 | Empty and oversized messages | Submit whitespace through UI; send empty and 4,001-character messages through API. | Invalid input is prevented/rejected; API validation enforces 1–4,000 characters. |
| USR-018 | Invalid history | Through API send more than 20 history items, unsupported role, or oversized content. | Invalid history fails validation instead of reaching normal chat processing. |
| USR-019 | Edit message | Edit an earlier user message and submit it. | Updated message and regenerated response reflect the edited input; stale continuation is not misleadingly retained. |
| USR-020 | Copy response | Copy a response and paste into a scratch text field. | Copied text matches the response; feedback indicates success or clipboard failure. |
| USR-021 | AI/network failure | Simulate AI/API unavailability while sending a message. | Clear error/fallback is shown; loading stops and subsequent input remains possible. |
| USR-022 | New conversation | Start a new chat after an existing conversation. | New chat has separate content; previous conversation remains selectable. |
| USR-023 | Restore sessions | Send messages, wait for save, reload, then sign out/in. | Saved conversations are restored for the same user. |
| USR-024 | Favorites | Favorite/unfavorite a conversation; toggle favorites filter; reload. | Correct conversations appear and saved favorite state is retained. |
| USR-025 | Delete session | Delete a disposable saved conversation; reload. | Deleted conversation stays removed; other conversations remain. |
| USR-026 | Conversation isolation | Save distinct sessions as U1 and U2 in separate browsers; inspect `/api/sessions`. | Each account receives only its own saved sessions. |
| USR-027 | Suggested/related tickets | Load suggested tickets; use a related ticket offered for an IT question. | Available suggestions are usable and lead to the corresponding prompt/workflow; empty/error states do not crash chat. |

### Simulation catalog and terminal workflows

| ID | Scenario / precondition | Steps | Expected result |
|---|---|---|---|
| USR-028 | Module catalog | Open Simulations with enabled/disabled server modules. | Enabled server modules are available; disabled ones are excluded. Static built-in simulations may also appear. |
| USR-029 | Guided walkthrough | Open a walkthrough; move forward/back and close it. | Correct module instructions and progress display; navigation remains within valid steps. |
| USR-030 | Terminal launch | Launch configured Windows-terminal and Mac-terminal modules from supported workflows. | Correct terminal environment and scenario instructions appear for each surface. |
| USR-031 | Correct commands | Enter the fixture's expected commands in order. | Output and scenario progress reflect successful steps. |
| USR-032 | Incorrect commands | Enter unsupported/incorrect commands, then correct them. | Useful feedback appears; incorrect input does not falsely complete the required step; terminal stays usable. |
| USR-033 | Terminal controls | Exercise command history, backspace, and resize. | Input/history behave correctly and terminal fits its container. |
| USR-034 | Record completion | Complete an enabled module; check admin module counts. | Successful completion updates module statistics once for that attempt. |
| USR-035 | Duplicate completion | Repeat the same completion API request with the same attemptKey and account. | Completion is idempotent; counts do not increment again. |
| USR-036 | Completion validation | Submit invalid surface, missing attemptKey, negative steps, and steps above 100 separately. | Each invalid request fails validation. |
| USR-037 | Completion ownership | Reuse U1's recorded attemptKey as U2. | Request is rejected with 403; U1's completion is unchanged. |
| USR-038 | Completion save failure | Fail completion request, then restore service and retry. | Error is visible; no false success; retry records only one successful attempt. |

### Windows OS workspace

| ID | Scenario / precondition | Steps | Expected result |
|---|---|---|---|
| USR-039 | Provision/connect | Launch enabled Windows OS module with configured infrastructure. | Provisioning transitions to READY; connect returns the launch URL; remote workspace becomes usable. |
| USR-040 | Session information | Inspect status and connect responses using browser tools. | Status response omits launch URL; browser receives no AWS/Windows credentials, private IP, or EC2 identifiers. |
| USR-041 | Resume same module | Start the same module while its workspace remains live. | Existing session resumes instead of provisioning an unnecessary second instance. |
| USR-042 | Capacity limits | With configured per-user/global limits reached, request another workspace. | Request is refused with the appropriate conflict/capacity message; no excess workspace is created. |
| USR-043 | Unsupported/disabled module | Request Windows workspace for a terminal module, then a disabled/missing module. | Wrong surface returns 400; disabled/missing module returns 404. |
| USR-044 | Cross-user workspace access | As U2, GET, connect, and end U1's workspace ID. | Each returns 404; U1's workspace remains unaffected. |
| USR-045 | Early/expired connect | Connect before ready and after expiration. | Connect is rejected with 409; expired workspace does not provide renewed access. |
| USR-046 | Complete workspace | Complete a live simulation; inspect module statistics and cloud cleanup. | Completion records successfully, iframe closes, and workspace termination is requested. |
| USR-047 | End without completion | Select End Simulation on a live workspace. | Iframe is removed and workspace terminates; no completion is recorded merely for ending. |
| USR-048 | Expiration cleanup | Leave a disposable workspace until TTL and the cleanup interval elapse. | Backend terminates expired infrastructure; UI no longer provides a usable active session. |
| USR-049 | Provisioning failure | Use a controlled unavailable cloud/connection dependency. | Failure is visible and retry is available where implemented; no indefinite success/loading indication. |

## Analysis notes and execution limits

- The two account roles are defined in `server/prisma/schema.prisma`; AI message roles are not additional end-user roles.
- Hiding the current admin is a frontend list rule. The admin users API still includes that account, and overview totals intentionally include it.
- The response chart counts loaded policy events, not independently verified successful AI answers. Its date labels use browser-local time. Compare against the fetched event set and separately check whether API retrieval limits omit older events in the same week.
- Prompt insights are capped at 20 per response. Disregard all currently processes a snapshot of the loaded queue sequentially, including search-hidden items; it does not clear an unlimited backend backlog. If the intended requirement is every eligible suggestion in storage, ADM-055 identifies the gap.
- Disregard persistence is file-backed in `server/data/prompt-insight-dismissals.json`; include page/server reload checks in the test environment. Multi-instance persistence is not established by these cases.
- Admin account creation currently permits the legacy `password123` exception; password change and registration use stronger validation. Record this difference rather than assuming a uniform password rule.
- Windows step controls record user-reported progress. These cases do not assume that every action performed inside the remote desktop is automatically verified.
- Cases specify intended acceptance behavior. Network failures, cloud cleanup, responsive rendering, and security restrictions require runtime evidence; source inspection or a successful frontend build alone does not establish a pass.

## Source references

- `client/src/App.jsx`, `components/AdminRoute.jsx`, `components/PrivateRoute.jsx`
- `client/src/pages/admin/AdminPage.jsx` and `admin.css`
- `client/src/pages/users/DashboardPage.jsx`, `SimulationsPage.jsx`, `LoginPage.jsx`
- `client/src/pages/users/Modules/TerminalEmulator.jsx`, `WindowsOsSimulation.jsx`
- `server/src/routes/` and corresponding auth, admin, AI, session, simulation, and simulation-session controllers
- `server/src/middleware/authMiddleware.js`
- `server/src/store/simulationModuleStore.js`, `promptInsightDismissalStore.js`
- `SYSTEM_OVERVIEW.md`, `WINDOWS_OS_SIMULATION.md`

## Execution record template

Copy one row per case when executing; leave the original expected results intact.

| Case ID | Build / environment | Tester / date | Actual result | Status | Evidence / defect |
|---|---|---|---|---|---|
| ADM-001 | | | | Not Run | |
| USR-001 | | | | Not Run | |
