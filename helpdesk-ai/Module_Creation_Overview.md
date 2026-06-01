# Module Creation Overview (Admin)

## 1. Purpose
This document explains the full module-creation process in the Admin panel, from prompt monitoring to final module persistence.

Scope covered:
- Prompt-driven module suggestion pipeline
- AI draft generation
- Draft preview and approval flow
- Backend validation/alignment rules
- Storage behavior (PostgreSQL and fallback paths)
- Current limitations and important implementation notes

## 2. Entry Point in Admin UI
Module creation is managed in **Admin > Simulation Modules** (`activePage === "sims"`).

The screen has two main areas:
1. **Prompt Monitoring - AI Module Suggestions**
2. **Modules** list (existing modules with view/enable-disable/delete actions)

## 3. End-to-End Creation Flow

```text
Policy-allowed user prompts
  -> Policy event store
  -> Admin prompt insights API
  -> Admin sees repeated IT-scope prompt patterns
  -> "Generate AI Draft"
  -> Draft returned (AI-generated or fallback)
  -> Admin reviews preview + steps + environment
  -> "Approve & Save Module"
  -> Module persisted via admin create API
  -> Module appears in admin module list
  -> Enabled modules become available to users via /api/simulations/modules
```

## 4. Detailed Pipeline

### 4.1 Prompt Source for Suggestions
Suggestions are derived from policy events, not directly from chat sessions.

Backend filtering for insights:
- Includes only events where:
  - `blocked === false`
  - `code` is in `["ALLOWED", "ALLOWED_RULE_MATCH"]`
  - message is non-empty
- Prompts are normalized and grouped by repeated pattern.
- Prompts outside simulation scope are excluded by alignment checks.

This is why out-of-scope concerns like `how to cook adobo` no longer appear in suggestions.

### 4.2 Alignment Gate (Critical)
Before a prompt can become a draft:
- Must be long enough
- Must not target unsupported platforms (`android`, `ios`, etc.)
- Must not be physical hardware damage scenario outside intended simulation surfaces
- Must match supported IT troubleshooting **domain** keywords

If domain match fails, draft creation is rejected with `400`.

### 4.3 Admin Action: Generate AI Draft
When admin clicks **Generate AI Draft**:
- Frontend sends:
  - `POST /api/admin/simulation-modules/draft`
  - payload:
    - `mode: "from_prompt"`
    - `sourcePrompt`
    - `occurrences`
    - `preferredSurface` (UI sends this, backend currently does not explicitly consume it)

Backend behavior:
1. Re-runs alignment check.
2. Builds a draft using `generateSimulationDraftFromPrompt`.
3. If model client available:
   - asks AI to return JSON-only structured module draft (title/category/difficulty/simulation steps).
4. If model unavailable or generation fails:
   - returns deterministic fallback draft (still valid for admin review).

### 4.4 Draft Preview and Approval
Frontend opens draft preview modal:
- Shows generated steps, scenario text, action/result blocks.
- Allows environment/surface selection (Win/Mac terminal, Win/Mac OS labels).
- Requires at least **3 steps** in UI before save.

Admin can:
1. Discard draft.
2. Approve and save.

### 4.5 Final Save (Module Creation API)
On **Approve & Save Module**, frontend sends:
- `POST /api/admin/simulation-modules`
- payload with:
  - `mode: "manual"`
  - `title`
  - `category`
  - `sourcePrompt`
  - `enabled: true`
  - `simulation` object from preview

Backend `createSimulationModule`:
- Builds payload from request.
- In `manual` mode:
  - if `sourcePrompt` exists and no simulation was provided, generates fallback simulation.
- Passes payload to `createModule` store function.
- Returns `201` with created module or `400` if invalid.

## 5. Data Shape and Constraints

### 5.1 Module Core Fields
- `id` (generated/unique slug-like)
- `title` (required)
- `category` (required)
- `difficulty` (`Easy|Medium|Hard`, defaults if invalid/missing)
- `enabled` (boolean)
- `sourcePrompt` (optional)
- `simulation` (optional JSON structure)
- metrics fields (`completions`, `passRate`, `avgSteps`)

### 5.2 Simulation Structure
Expected simulation object:
- `title`
- `scenarioType` (`general|network|email|printer` preferred)
- `terminalType` (`windows-terminal|mac-terminal`)
- `steps[]` with each step containing:
  - `title`
  - `desc`
  - `screen`
  - `action`
  - `result`

Normalization rules:
- Empty/malformed simulation is sanitized.
- Step list is capped (max 12 in sanitization layer).
- If no valid steps remain, fallback simulation may be used depending on call path.

## 6. Storage and Persistence

Primary storage:
- PostgreSQL table: `SimulationModule` via Prisma

Fallback behavior:
- If DB/table unavailable, module store can fall back to in-memory list.
- In-memory fallback is non-persistent across process restarts.

No auto-seeding of default modules on startup:
- Auto-seeding is intentionally disabled so admin deletions persist.

## 7. Related APIs Used by the UI

Read:
- `GET /api/admin/simulation-modules`
- `GET /api/admin/simulation-modules/prompt-insights?limit=200`

Generate/Curate:
- `POST /api/admin/simulation-modules/draft`
- `POST /api/admin/simulation-modules/prompt-insights/disregard`

Persist/Manage:
- `POST /api/admin/simulation-modules`
- `PATCH /api/admin/simulation-modules/:id`
- `DELETE /api/admin/simulation-modules/:id`

User consumption:
- `GET /api/simulations/modules` (enabled modules only, authenticated user route)

## 8. Security and Access Control
- All admin module-creation endpoints require:
  - valid access token
  - admin role (`requireAdmin`)
- Request payloads are validated with `express-validator` at route level.

## 9. Current Implementation Notes / Caveats
1. Frontend sends `preferredSurface` during draft request; backend does not currently use it explicitly.
2. Preview has OS surface labels (Windows OS / Mac OS), but persistence maps surfaces to terminal types.
3. UI enforces minimum 3 steps before save; backend is less strict and can accept payloads with weaker simulation detail in some paths.
4. Prompt insight disregard uses in-memory set; it resets when server restarts.
5. Draft generation is resilient:
   - AI generation failure still returns fallback draft to keep admin workflow unblocked.

## 10. Quick Process Checklist
1. Open Admin > Simulation Modules.
2. Refresh prompt insights.
3. Confirm prompt is IT-scope and relevant.
4. Click Generate AI Draft.
5. Review generated steps and environment.
6. Approve & Save Module.
7. Verify module appears in list and is enabled.
8. Validate module appears for users in `/simulations`.
