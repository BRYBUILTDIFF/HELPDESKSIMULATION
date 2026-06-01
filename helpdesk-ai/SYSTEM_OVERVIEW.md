# HelpDesk AI - System Overview (Detailed)

## 1. System Purpose
HelpDesk AI is a full-stack internal IT support platform designed for two primary use cases:

1. Guided AI troubleshooting for authenticated users.
2. Admin governance over policy, users, and simulation modules.

The system enforces an IT-only support scope through a policy layer before AI response generation.

## 2. Technology Stack

### Backend
- Node.js + Express
- Prisma ORM + PostgreSQL
- JWT authentication (access token + refresh token cookie)
- `express-validator` for request validation
- `express-rate-limit` for abuse control
- `helmet`, `cors`, `cookie-parser`
- OpenAI-compatible SDK (`openai`) used for both OpenAI and DeepSeek API providers

### Frontend
- React 18 + Vite
- React Router v6
- Axios-based API client with auth interceptors
- Chart.js for admin analytics visuals
- Xterm components for simulation terminal experiences

### AI/Policy
- Response model provider: OpenAI-compatible endpoint (`openai` or `deepseek`)
- Policy classifier: local DeepSeek via Ollama-compatible endpoint (`http://localhost:11434/api/chat`, model `deepseek-r1:7b`)

## 3. High-Level Runtime Architecture

```text
Client (React)
  -> /api/auth/*         (login/register/refresh/logout/me)
  -> /api/ai/chat        (policy + AI reply)
  -> /api/sessions       (per-user chat/simulation session state)
  -> /api/simulations/*  (enabled modules for users)
  -> /api/admin/*        (admin-only control plane)

Server (Express)
  -> Auth middleware + validation
  -> Policy engine + event logging
  -> AI provider client (OpenAI/DeepSeek API)
  -> Prisma data layer (PostgreSQL)
  -> File/memory fallback for selected stores
```

## 4. Repository Layout

```text
helpdesk-ai/
  client/
    src/
      App.jsx
      context/AuthContext.jsx
      hooks/useAxios.js
      pages/users/DashboardPage.jsx
      pages/users/SimulationsPage.jsx
      pages/admin/AdminPage.jsx
  server/
    src/
      server.js
      routes/*.routes.js
      controllers/*.js
      middleware/*.js
      policy/promptPolicy.js
      store/*.js
      utils/*.js
    prisma/
      schema.prisma
      seed.js
  docker-compose.yml
```

## 5. Backend Architecture

### 5.1 Server Bootstrap and Middleware
`server/src/server.js` configures:

- Dynamic CORS allowlist from `CLIENT_URLS` and `CLIENT_URL`.
- Development-only LAN origin acceptance on port `5173` for private network IPs.
- Security middleware: `helmet`.
- Parsing middleware: JSON body + cookies.
- Rate limits:
  - `/api/auth/login` and `/api/auth/register`: 10 req/min.
  - `/api/ai/*`: 20 req/min.
- Global 404 handler and centralized error handler.

### 5.2 API Surface

#### Public/Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me` (requires access token)

#### User-Protected
- `POST /api/ai/chat`
- `GET /api/sessions`
- `PUT /api/sessions`
- `GET /api/simulations/modules`

#### Admin-Protected (`verifyToken + requireAdmin`)
- User management:
  - `GET /api/admin/users`
  - `POST /api/admin/users`
  - `PATCH /api/admin/users/:id`
  - `DELETE /api/admin/users/:id`
- Policy monitor/config:
  - `GET /api/admin/policy/events`
  - `GET /api/admin/policy/summary`
  - `GET /api/admin/policy/config`
  - `PUT /api/admin/policy/config`
  - `POST /api/admin/policy/config/:listName`
  - `PATCH /api/admin/policy/config/:listName/:index`
  - `DELETE /api/admin/policy/config/:listName/:index`
  - `POST /api/admin/policy/config/reset`
- Simulation module administration:
  - `GET /api/admin/simulation-modules`
  - `GET /api/admin/simulation-modules/prompt-insights`
  - `POST /api/admin/simulation-modules/prompt-insights/disregard`
  - `POST /api/admin/simulation-modules/draft`
  - `POST /api/admin/simulation-modules`
  - `PATCH /api/admin/simulation-modules/:id`
  - `DELETE /api/admin/simulation-modules/:id`

### 5.3 Authentication and Session Security

Auth model:
- Access token returned in response body (short-lived).
- Refresh token stored in HTTP-only cookie (`sameSite=lax`, `secure` in production).
- Refresh tokens persisted in DB (`RefreshToken` table).

Validation and enforcement:
- `verifyToken` checks bearer token and confirms user exists + `isActive`.
- `requireAdmin` enforces role `ADMIN`.
- Password policy in auth/admin creation paths requires uppercase, digit, special char, min length 8 (with controlled admin default exception in admin flow).
- Password hashing uses bcrypt with cost 12.

### 5.4 AI Chat Request Pipeline
`POST /api/ai/chat` flow:

1. Input validation (`message`, optional bounded `history`).
2. Policy evaluation (`evaluatePromptPolicy`).
3. If policy returns direct reply (e.g., greeting), respond without generation.
4. If blocked, return policy response.
5. If allowed, call model provider using OpenAI-compatible client.
6. Persist policy event (`allowed` or `blocked`) with code/reason.

Provider selection:
- `AI_PROVIDER` (`openai` or `deepseek`)
- `AI_BASE_URL` optional override
- `AI_MODEL` override supported
- Backward-compatible fallback: `OPENAI_API_KEY` and `OPENAI_MODEL`

### 5.5 Policy Engine Design
Policy has two layers:

1. Deterministic rules from runtime config:
   - `greetingPatterns`
   - `inScopeKeywords`
   - `outOfScopeKeywords`
   - `inScopeIntentPatterns`
   - message templates (`greetingReply`, `outOfScopeMessage`, `mixedScopeMessage`, `followUpNoContextMessage`, `clarifyMessage`, etc.)
2. Classifier fallback:
   - Local DeepSeek classifier endpoint (`deepseek-r1:7b`) for ambiguous/non-rule cases.

Decision behavior includes:
- `GREETING_PATTERN`
- `FOLLOW_UP_NO_CONTEXT`
- `OUT_OF_SCOPE_KEYWORD`
- `MIXED_SCOPE`
- `ALLOWED_RULE_MATCH`
- classifier outcomes: `GREETING`, `ALLOWED`, `CLARIFY`, `OUT_OF_SCOPE`
- fail-open fallback: `CLASSIFIER_ERROR` allows the request if classifier call fails.

Policy configuration persistence:
- Stored at `server/data/policy-config.json`.
- Runtime regex compilation for fast matching.

### 5.6 Policy Monitoring and Analytics
Every policy decision can be logged with:
- `blocked` flag
- `code`
- `reason`
- `userEmail`
- truncated prompt text
- timestamp

Storage strategy:
- Primary: `PolicyEvent` table (Prisma).
- Fallback: `server/data/policy-events.json` + in-memory cache.
- DB seeding from file is attempted once when DB is available and table empty.

Summary metrics:
- total
- blocked
- allowed
- blockRate
- last24h
- grouped counts by policy code

### 5.7 Simulation Module Management and Prompt Monitoring
Admin simulation control is prompt-driven and manually editable.

Prompt insights (`/api/admin/simulation-modules/prompt-insights`) now enforce strict scope:
- Only non-blocked policy events with eligible codes:
  - `ALLOWED`
  - `ALLOWED_RULE_MATCH`
- Prompt must pass simulation alignment checks (IT domain match required).
- Out-of-scope prompts like "how to cook adobo" are excluded.

Draft generation (`/api/admin/simulation-modules/draft`):
- Mode `from_prompt`: aligns prompt to supported surfaces and optionally uses AI to synthesize module structure.
- Mode `manual`: builds a fallback module scaffold.

Persistence:
- Primary: `SimulationModule` Prisma model.
- Fallback: in-memory store when DB schema/table is unavailable.

## 6. Frontend Architecture

### 6.1 Routing and Access Control
`client/src/App.jsx` route behavior:
- Public-only: `/login`
- Authenticated user pages: `/dashboard`, `/simulations`
- Admin page: `/admin` (role-gated)
- Root route redirects by role.
- Unknown routes -> `NotFoundPage`.

Guards:
- `PrivateRoute`: requires authenticated user.
- `AdminRoute`: requires role `ADMIN`, redirects non-admins.

### 6.2 Auth Lifecycle on Client
`AuthContext` responsibilities:
- Stores access token in local storage (`helpdesk_access_token`).
- Restores session by calling `/api/auth/refresh`, then `/api/auth/me`.
- Falls back to non-expired stored token if refresh fails.
- Exposes `login`, `register`, `logout`, `refreshAccessToken`, `clearAuth`.

`useAxios` responsibilities:
- Automatically injects bearer token.
- On 401, attempts one refresh and retries original request.
- On refresh failure, clears auth and redirects to `/login`.
- Handles 403 by redirecting according to user role.

### 6.3 User Dashboard (`DashboardPage`)
Core capabilities:
- AI chat with policy-aware responses.
- Message editing and regeneration path.
- Session persistence via `/api/sessions`:
  - fetch on load
  - debounced save on updates
- Simulation integration:
  - fetches enabled modules from `/api/simulations/modules`
  - can launch simulation interactions from chat context
- Policy-blocked responses rendered as dedicated policy bubbles.

### 6.4 Simulations Page (`SimulationsPage`)
Capabilities:
- Reads enabled server modules from `/api/simulations/modules`.
- Merges server modules with local static simulation definitions.
- Provides guided modal walkthrough with step progression and progress tracking.
- Loads session state from `/api/sessions`.

### 6.5 Admin Console (`AdminPage`)
Major workspaces:
- User Management:
  - create/update/delete users
  - role and activation controls
- Policy Monitor:
  - decision table with filter/search/export
  - summary KPI cards
- Policy Configuration:
  - live-edit lists and messages
  - reset to defaults
- Simulation Modules:
  - inspect prompt insights
  - generate/disregard drafts
  - create, update, enable/disable, delete modules

## 7. Data Model (Prisma)
Defined in `server/prisma/schema.prisma`.

### Core tables
- `User`
  - identity, role, active flag, timestamps
  - relations: refresh tokens, session state, policy events
- `RefreshToken`
  - persistent refresh token records with expiry
- `UserSessionState`
  - JSON blob for per-user saved sessions
- `SimulationModule`
  - admin-managed module metadata and JSON simulation payload
- `PolicyEvent`
  - policy decisions for monitoring/audit
  - indexed for recent and analytical queries

### Role enum
- `USER`
- `ADMIN`

## 8. Configuration and Environment

### Server (`server/.env`)
- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_ACCESS_EXPIRES`
- `JWT_REFRESH_EXPIRES`
- `AI_PROVIDER`
- `AI_API_KEY`
- `AI_BASE_URL`
- `AI_MODEL`
- legacy fallback vars: `OPENAI_API_KEY`, `OPENAI_MODEL`
- `PORT`
- `CLIENT_URL`
- `CLIENT_URLS`
- `NODE_ENV`

### Client (`client/.env`)
- `VITE_API_URL` (default `/`, can be direct backend URL)

## 9. Local Development and Operations

### Install
1. `cd server && npm install`
2. `cd ../client && npm install`

### Database
- Optional Docker Postgres via `docker compose up -d` from repo root.
- Run migrations: `npx prisma migrate dev --name init`
- Generate client: `npm run generate`
- Seed defaults: `npm run seed`

### Seeded credentials
- `admin@helpdesk.com` / `Admin@1234` (ADMIN)
- `user@helpdesk.com` / `User@1234` (USER)

### Start services
1. Backend: `cd server && npm run dev`
2. Frontend: `cd client && npm run dev`

## 10. Security and Resilience Summary
- JWT-based access + refresh-token cookie strategy.
- Role-based admin authorization checks on all admin APIs.
- Input validation via `express-validator`.
- Auth and AI rate limiting.
- CORS allowlist and restricted credentialed origins.
- Password hashing with bcrypt cost factor 12.
- Fallback persistence mechanisms for policy events and simulation modules when DB availability/schema is degraded.

## 11. Current Architectural Notes
1. Policy and generation are intentionally decoupled:
   - Policy gates prompt acceptance.
   - Generation provider can change independently.
2. System currently supports DeepSeek in two roles:
   - API generation provider (`AI_PROVIDER=deepseek` path).
   - Local classifier for policy (`deepseek-r1:7b` via local endpoint).
3. Policy monitor/config remains essential even with DeepSeek because it provides:
   - governance/audit visibility
   - runtime guardrail tuning
   - scope enforcement for simulation prompt suggestions
