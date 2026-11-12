# Terminal simulation implementation and audit - 2026-11-12

## Result

The catalog terminal flow now uses typed server actions rather than extracting executable commands from prose. Admin AI generation preserves type, actionId and expectedCommands. AI output remains a draft: the server validates each action, surface, canonical command, checkpoint type and achievable order before execution or publication. The account-lockout lesson was upgraded in migration 20261112000500_terminal_contract. Other legacy terminal definitions without typed actions are disabled by 20261112000600_gate_legacy_terminal_modules, preserving their text for admin repair.

## Admin creation and publishing

1. Generate a draft. The AI receives the supported action catalog for terminal surfaces. GUI surfaces retain their separate instruction format. The UI identifies template fallback when generation is unavailable.
2. View Simulation opens the existing preview. Edit Simulation opens the separate interactive editor/tester. Admins can edit titles/instructions, select actions, add/remove/reorder steps, and see exact catalog commands. Missing or unsupported actions fail validation; the system never substitutes help as assessment.
3. Validate and restart test. The same pure server transition engine is used by admin testing and user attempts. The admin enters commands and performs explicit simulated checkpoints.
4. After all steps pass, a one-hour HMAC receipt binds the exact normalized definition to the authenticated admin. Editing the definition invalidates that receipt. A saved module cannot be enabled or edited while enabled without a matching receipt. Disabled drafts may be stored for repair.
5. Publish the tested module. New AI drafts are saved disabled; test the saved module to publish it. This extra test is intentional: publication always validates the exact stored version. The enable button opens testing for disabled terminal modules.

A test receipt is execution evidence for the deterministic simulator, not proof that an AI-written explanation is correct. It does not run real commands.

## User execution

SimulationAttempt.expected now holds version 2: an immutable definition snapshot/hash, fictional machine state, bounded action events, and ACTIVE/ENDED/COMPLETED status. Every assessed action reaches the server. Wrong commands and wrong-order submissions increment mistakes without changing state. Help/clear are non-assessed utilities. Duplicate successful actions are accepted idempotently only when step, kind and canonical command match. Quoted argument case is preserved, including the fictional training password.

Attempt IDs are persisted in the saved simulation canvas. Opening the simulation fetches authoritative owned progress, refreshes the displayed instructions from its snapshot, and reconciles completion flags. Attempts expire after two hours and have an explicit restart path. End marks an attempt ended; completion requires all server actions and a definition hash matching the currently published module. Completion records are idempotent and marked simulated-actions. Completion is disabled in the UI until verified; clicking through instructions cannot earn completion. Server checks still protect these rules when requests are forged.

The emulator accepts an async server execution adapter. It prints verified output rather than canned local success before verification. Both admin and user flows use the same state transitions. Mac terminal profiles use their own prompt; catalog surface validation prevents Windows-only actions from being assigned to Mac lessons.

## Implemented scenario state

The fictional domain account jdoe begins locked, without a password reset in this attempt. Opening the simulated admin session enables administrative actions. Inspect reports the current lock state; unlock changes it; password reset records the fictional reset; verification and simulated login require recovery. The lesson explicitly labels simulated elevation and login checkpoints; neither verifies a real desktop action.

The action catalog also supports deterministic Windows and Mac DNS inspection/cache repair/lookup and identity checks. Other scenarios require additional application-defined handlers. The AI cannot add executable code or arbitrary commands to the registry.

## Metrics

Admin module cards expose version-2 started, completed, active, ended, expired, and mistake totals. These describe practice attempts, not real device recovery or skill certification. Existing historical module completion totals remain separate. No fabricated pass rate is presented. Expiry means an ACTIVE attempt passed its deadline; End is an explicit learner action, not an automatic failure. Events retain the latest 200 assessed actions per attempt; total mistakes remain cumulative. Admin tests are transient and do not inflate user-attempt counts.

## Audit findings and feedback

| Previous finding | Implemented outcome |
| --- | --- |
| AI omitted commands; sanitizer discarded them | Prompt includes the catalog; sanitization and persistence preserve assessments; regression-tested. |
| Runtime expected prose and unresolved placeholders | Catalog commands are explicit; validation rejects malformed expectations. |
| GUI steps accepted help | Distinct checkpoint action type; help never advances these steps. |
| Viewed step differed from required step | Forward navigation is gated; verified actions synchronize progress from the server. |
| Success printed before verification | Catalog emulator output comes from the server response. |
| Unlock lesson confused enabling with unlocking | Uses Unlock-ADAccount with fictional account and state-based verification. |
| Reload lost the attempt | Persisted owned attempt identity and server resume, verified in a browser. |
| Invalid or untested definitions could be enabled | Validation and actor/definition-bound completed-test receipt required. |
| Mistakes were mostly local | All assessed commands are sent to the server; wrong commands increment persisted totals. |
| Completion could be double-counted | Idempotent completion, existing unique attempt key, transactional state checks. |

Critical feedback:

- The action catalog is deliberately small. Account recovery, DNS practice and identity checks are supported; arbitrary IT requests cannot become executable simulations merely because the AI writes instructions. This is a product constraint, not a silent success fallback. Extend the catalog with deterministic handlers, prerequisites and tests as scenarios are added.
- Admin review still matters. Validation proves supported syntax and achievable simulated state transitions. It cannot establish that prose explains the problem well, covers root-cause diagnosis, or constitutes a complete lesson. Prefer scenario-specific learning goals and review instructions before publishing.
- Exact catalog commands are restrictive. Normalized command names/spacing are supported, but every valid PowerShell equivalent is not accepted. Expand accepted syntax deliberately through a parser or named aliases rather than fuzzy matching arbitrary shell text.
- Elevation and login remain labeled simulated checkpoints. Use the separate Windows lab for actual OS interaction; neither this runtime nor its metrics certifies real administrator work.
- The /simulations route now opens the shared dashboard catalog, removing the separate public terminal runtime path. The older non-catalog chat walkthrough remains instructional practice and cannot earn verified catalog completion. Old unused SimulationsPage source remains for a separate cleanup; it is no longer routed.
- The production build still reports a large JavaScript bundle. Code splitting is a performance improvement outside this execution repair.

No unresolved high-severity bypass was found in the tested catalog creation/execution/completion paths. This is a scoped local audit, not a penetration-test certification.

## Validation and evidence

- 79 server unit tests pass. The suite covers generation preservation, explicit fallback provenance, action validation, state transitions, malicious/unsupported commands, quoted argument case and test receipt tampering.
- scripts/verify-terminal-runtime.js uses disposable accounts and a disposable module against the local API: role isolation, disabled draft gating, exact-definition publication receipts, wrong-order mistakes, state transitions, owned resume, retries, completion/idempotency, ended/expired attempts and malformed definitions. No AI provider or real OS command is invoked.
- test/review.database.integration.js applies migrations in an isolated PostgreSQL schema, checks ownership, rejected skips, full action evidence and completion, then drops only that test schema.
- scripts/verify-terminal-browser.js uses isolated headless Chrome profiles and disposable accounts. Desktop 1440x1000 and mobile 390x844: admin validation/test, user checkpoint, typed command, reload/resume, screenshots, no uncaught browser runtime exceptions. Captures are kept in ignored server/.security/terminal-*.png.
- Frontend production build and server syntax checks pass. The isolated PostgreSQL integration test and live local API audit also pass. AI provider quality was not evaluated with live paid calls; generation behavior is tested with a controlled response and unavailable-provider case.

## Main implementation files

- server/src/services/terminalRuntime.js: supported actions, validation, deterministic state and test receipts.
- server/src/controllers/simulationAttemptController.js: owned attempts, resume, assessed actions, end and admin tests.
- server/src/store/simulationModuleStore.js: typed persistence, publication gate and completion verification.
- client/src/pages/admin/TerminalModuleTester.jsx: editable action definitions and interactive admin test.
- client/src/pages/users/DashboardPage.jsx: server progress, persisted attempt identity, checkpoints and gated completion.
- client/src/pages/users/Modules/TerminalEmulator.jsx: asynchronous verified execution adapter.

## Instruction, command and expected output

Admin terminal editing now exposes Instruction, Command and Expected output for each step. AI draft sanitization and database JSON persistence retain these fields. Existing typed steps derive display fields from their descriptions/command arrays, so no database schema change is required. Blank expected output is generated by replaying the supported actions through their fictional state; conflicting expected output is rejected during validation. Actual terminal output still comes from executing the action against the current attempt state, not from echoing the expected text. The user and admin test share an Instruction/Command/Expected output guide and Copy command control, with clipboard feedback and a manual-copy fallback. View Simulation and Edit Simulation remain separate.

## Completed-session review

Completed catalog terminal sessions reopen as read-only reviews. A completion notice appears, all finished steps remain navigable, and the selected step shows its instruction, command, expected output, and retained recorded action/output evidence. No terminal input or restart action is shown in review mode. Completed attempts remain readable past their execution expiry while retained in the database; normal retention still applies. Closing after completion preserves COMPLETED status, and a legacy ended attempt with an owned completion record is recognized as completed.
