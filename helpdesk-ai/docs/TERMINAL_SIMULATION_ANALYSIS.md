# Terminal simulation analysis - 2026-11-12

Scope: dashboard terminal simulation, xterm command emulator, catalog definitions, admin normalization, server attempts, saved chat state, and completion metrics. Read-only code and database inspection; no module, attempt, or completion records changed. The local database currently contains two catalog modules, of which one is a terminal module: account-lockout-resolution (six steps). This is the local environment, not a production inventory. No browser interaction was used for this analysis.

## Current architecture

SimulationModule.simulation JSON supplies the surface, scenario type, instructions, and optional expectedCommands. DashboardPage builds a client canvas with viewed step, completion flags, evidence and outcomes, saved inside chat session JSON. TerminalEmulator renders xterm and returns canned command output; this is a browser emulator, not Windows, PowerShell, AWS, or Guacamole. Unknown commands can be treated as successful if they match the viewed step's expected string.

The server creates a SimulationAttempt with a snapshot of expected strings, nextStep, mistakes and a two-hour expiry. Command submissions check user/module ownership and ordered exact matching inside a transaction with an advisory lock. Completing a terminal module requires a fully advanced server attempt, checks its surface, and records an idempotent SimulationCompletion. This prevents merely clicking Next or forging the client completion count from earning completion, but proves string-sequence entry rather than real OS work.

## Findings

### High: instructions are being parsed as commands

The actual stored module has no explicit expectedCommands on any of its six steps. Both DashboardPage.extractExpectedCommands and server/utils/simulationCommands.js infer commands from prose. Current server-derived expectations:

| Step | Required string |
| --- | --- |
| Open terminal as administrator | help |
| Check account lockout | net user [username] /domain and press enter |
| Unlock account | net user [username] /active:yes /domain and press enter |
| Reset password | net user [username] [newpassword] /domain and press enter |
| Verify account | net user [username] /domain and press enter |
| Test login | help |

Trailing instruction text and unresolved placeholders become literal requirements. A learner using a real username or omitting 'and press enter' fails exact equality. Steps that cannot be extracted silently require help, which does not verify administrator elevation or login. Fix by requiring explicit command definitions and concrete fictional fixture values. Model manual/checkpoint actions separately; reject publishing an unassessable step rather than substitute help.

### High: viewed step and required step disagree

DashboardPage.setModalStepIndex lets Next and step selection change currentIndex without completing anything. handleTerminalCommand separately computes the first unfinished step and enforces its order. Therefore the screenshot's Step 3 display can coexist with a Step 1 requirement. Next is instruction browsing, but its label looks like progress. Gate advancement until success or clearly distinguish previewed and required steps; show completed/locked states and the actual task to perform.

### High: the account-unlock lesson teaches the wrong operation

The stored unlock instruction uses net user /active:yes, which enables an account; it does not perform the AD lockout-reset operation. Use a domain-account scenario with appropriate delegated permissions and the AD PowerShell module, for example Unlock-ADAccount with a fictional identity. Separate disabled accounts from locked accounts, and make verification reflect the actual account state.

Sources: https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/net-user and https://learn.microsoft.com/en-us/powershell/module/activedirectory/unlock-adaccount .

### High: reload loses the server attempt identity

getTerminalAttempt caches attempt creation promises only in a React ref. Canvas normalization persists local completed flags but no attempt ID. Reloading/reopening after a component remount creates a new attempt at step zero while local flags can still show advanced progress. The client sends its locally viewed step, and does not reconcile from response.nextStep. Expired attempts are also cached after creation with no dedicated resume/restart flow. Persist the server-issued attempt reference, provide an owned resume/status endpoint, and derive verified progress from the server. Keep older practice progress distinct from verified attempts.

### Medium: printed command success is not verified success

TerminalEmulator prints built-in or fallback output before awaiting DashboardPage's server verification. An expected unknown string can print 'Command accepted for this step' and subsequently fail order/server verification. Many built-ins are fixed exact strings (net user jdoe /domain, for example), explaining why net user or net user admin is unrecognized in this emulator. Validate the action first and produce scenario output from the verified result; distinguish supported syntax errors from unsupported emulation.

### Medium: simulated output is not a coherent machine state

Many commands return canned output. For example account lookup always reports active Yes, and unlock returns a success sentence rather than updating an account model checked by subsequent queries. Success also falls back to text from the step's result field. Build a deterministic per-attempt scenario state if the intended outcome is learning diagnosis and recovery. Until then describe the mode as guided command practice, not proof of successful account recovery.

### Medium: mistake and pass metrics do not measure learning outcomes

The dashboard only sends a command to the server when it already matches its local expectation. Wrong commands and wrong-order commands are handled locally, so SimulationAttempt.mistakes does not capture most learner errors. There is no attempt command event history or elapsed-completion record in SimulationCompletion. The store correctly exposes passRate as null because it lacks a failure denominator. Keep completion totals labeled as command-sequence completions; send all assessed actions if mistakes/accuracy are needed, and define started, abandoned, expired and failed attempts before computing a pass rate.

### Medium: duplicate runtime and parsing implementations

DashboardPage duplicates command inference implemented on the server, contains overlapping simulation UI branches, and an independent SimulationsPage contains a separate catalog/runtime path. TerminalEmulator is also Windows-oriented even when a mac profile is selected (Windows path normalization and prompt implementation). Align on one runtime contract and inspect route reachability before deleting older code. Read expected actions from the authoritative attempt rather than re-extracting on the client.

### Low: completion and navigation affordances are misleading

Complete Simulation is available before all required steps finish; the backend rejects incomplete attempts, so this is confusing UI rather than a confirmed completion bypass. Auto-advance waits five seconds after success. End closes the practice surface; it does not cancel/expire the server attempt explicitly. Terminal output/history are not restored from the saved evidence arrays, and xterm remounts when autofocus changes after walkthrough dismissal. Define end/resume/restart behavior and expose one visible verified-progress indicator.

## Recommended implementation order

1. Correct the account-lockout module and require explicit typed assessments. Outcome: every instruction has an achievable, technically correct action; no prose parsing or help substitutes.
2. Make server attempt state authoritative and resumable. Outcome: viewed step, required step, reload and expiry stay consistent.
3. Gate navigation/completion and verify before printing results. Outcome: no contradictory success/error output or premature completion controls.
4. Implement a deterministic fictional account model with state-dependent output. Outcome: checks demonstrate lockout, recovery, verification and a deliberate login checkpoint.
5. Capture assessed command events and define reporting denominators. Outcome: completion, mistakes and pass statistics have clear meanings.
6. Consolidate duplicate runtime logic and add regression coverage. Cover malformed module publication, placeholders, wrong order, alternate valid syntax, resume, expiry, concurrent commands, cross-user access, idempotent completion, and manual checkpoints.

No functional fixes were applied as part of this analysis.

## Implementation follow-up

The catalog terminal execution fixes and validation results are documented in [TERMINAL_SIMULATION_IMPLEMENTATION.md](TERMINAL_SIMULATION_IMPLEMENTATION.md). The findings above describe the pre-implementation system.
