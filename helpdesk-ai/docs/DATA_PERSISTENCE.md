# Data persistence

The Prisma schema and versioned migrations are authoritative. `database/schema-reference.sql` is a schema-only export from an isolated PostgreSQL database with all repository migrations applied; it is not a statement that a deployed database has applied those migrations. `DATABASE REFERENCE` retains the older pgAdmin export for comparison.

## Authoring and module history

- `SimulationDraft` stores owner-specific work independently of learner-facing modules. Generation creates the saved draft before returning it. Edits autosave after 500 ms; the footer reports saving/errors. Closing the editor flushes pending writes. Browser refresh warns if changes are still pending. A failed save must be retried before closing.
- The module list shows up to 100 active saved drafts for the current administrator. Resume reloads the latest draft and its version. Discard explicitly removes that draft. Drafts are not exposed to students or other administrators.
- `DRAFT` means editable saved work. `SAVED` means that work was committed to a module. Learner publication remains the module's `enabled` flag; saving a new module keeps it disabled. This deliberately preserves the existing publish flow rather than migrating it to a new status enum.
- Draft updates require their current version. Saving a module from a draft also checks ownership, version, definition, and the original module revision. Concurrent stale edits receive HTTP 409 rather than silently overwriting newer work.
- Windows step `instruction` and `desc` persist independently, including intentionally empty values. Legacy single-field steps use fallbacks. Already overwritten historical descriptions cannot be recovered automatically.
- `SimulationRevision` captures immutable module snapshots on every API create/update. Existing modules receive a baseline revision with no invented author or test approval. Each new snapshot records the actor and, when provided and valid, test receipt. The admin module card exposes revision history. Deleting a module intentionally leaves these snapshots intact.
- `SimulationTestReceipt` records completed administrator terminal tests: definition hash, sanitized definition/events, actor, mistakes, completed steps, and approval expiry. Publishing requires a signed token AND its stored receipt for the same actor/definition. Resuming an unchanged draft restores a matching unexpired completed test. Incomplete test progress remains temporary and must restart after reload. Test approval lasts one hour; the receipt remains as history after it expires.
- Generation metadata includes source (AI/template), provider/model when applicable, prompt version, occurrence count, and provider token counts when returned. It does not estimate cost or infer missing usage. Revisions retain the authored content; the saved draft retains generation metadata.

## Chat durability and concurrency

`ChatSession.data` remains the presentation document: visible messages, favorites and saved simulation UI state. `ChatTurn` separately stores the actual server-authored message/reply pair and stable message identifiers. It is never reconstructed from client-editable saved assistant text.

- The AI loads the most recent five server-authored pairs. Expiry of `PolicyConversation`'s 24-hour cache no longer makes those trusted turns disappear. Existing unexpired cache history is a legacy fallback when no durable turns exist; old expired conversations cannot be retroactively reconstructed as trusted context.
- Accepted answers and direct policy replies persist before returning to the browser. Blocked input continues to use minimized policy-event logging rather than durable model memory.
- Session loading and saving recover missing server-authored turns. If the browser closes after answer generation but before saving its UI transcript, the next load can recover that answer. UI message IDs match the server record, avoiding duplicate messages on normal save/reload.
- Chat document updates carry a version. A stale tab receives HTTP 409 with reload guidance. This is conflict detection, not automatic merging of arbitrary edits between tabs.
- Editing a prompt with `resetHistory` clears its previous trusted context before generating the replacement, as the previous workflow already reset the short-lived history. It does not promote earlier browser text into trusted AI context.
- Chat/session deletion deletes associated trusted turns too. Delete chat data also removes policy context and anonymizes policy events. It continues to retain simulation evidence and security cooldowns; it is not account deletion.

## Evidence and retention boundaries

Terminal student attempts verify catalog actions against fictional server state. Windows completion remains **self-reported** and requires an associated live workspace; it does not verify OS clicks or configuration changes. No real-machine competency claim should be derived from either.

Prompt suggestions are calculated from a recent event sample (up to 200), not lifetime counts. The API returns the sample window and the admin UI labels it. Dismissals remain hashed records. No durable lifetime suggestion aggregate has been introduced.

Existing retention settings continue to govern policy events, chats, and attempts. Durable chat turns are removed after `CHAT_RETENTION_DAYS` (default 90) based on their creation time. Active cache entries expire after 24 hours. Detailed student attempt evidence may eventually be removed while completion records remain. Module revisions, admin test receipts, saved drafts and audit history are retained until an authorized maintenance policy is defined; application credentials cannot update/delete revision or test-receipt rows. Do not confuse approval expiry with evidence deletion. The pass rate remains unavailable because the application has no agreed failure denominator.

Browser-only preferences (theme, collapsed groups, selected chat, some walkthrough history), live VM disk state, and suggestion caches are not PostgreSQL records.

## Apply the migration

From `helpdesk-ai/server`, use the existing maintenance identity configuration (`ADMIN_DATABASE_URL` in `.security/owner.env`). Do not run migrations with the restricted runtime role or reset an existing database.

```powershell
npm.cmd run migrate:deploy
npm.cmd run generate
```

Then restart the API so it loads the generated Prisma client and reload the web app. Migration `20261119000100_durable_authoring` adds tables/columns without deleting existing rows and grants the existing `helpdesk_runtime` role the new minimum permissions. Future runtime-role provisioning also includes them.

## Verify

```powershell
npm.cmd test
npm.cmd run lint
# Only against an isolated local migrated test database; never reset the app database.
$env:DURABLE_TEST_DATABASE_URL = 'postgresql://test_owner@127.0.0.1:55439/postgres?schema=public'
npm.cmd run test:persistence
```

The persistence integration suite checks independent Windows fields, concurrent draft conflicts, ownership isolation, revision snapshots, test-token binding and recovery, cache-expiry recovery, chat conflicts, and deletion of trusted chat turns. It skips with an explicit reason if the test URL is absent.

Windows draft modules can be launched by administrators for testing while still disabled for students. The admin Windows workspace uses a separate finish-test flow that ends the lab without creating a learner completion record; test activity therefore does not inflate student completions. Ordinary users still cannot launch disabled modules.
