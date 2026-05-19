# HelpDesk AI - System Overview

## 1. Purpose
HelpDesk AI is a full-stack IT support platform with:
- Secure user authentication
- AI-assisted troubleshooting chat
- Admin user management
- Dedicated simulation modules for guided training/case walkthroughs

The system is focused on IT helpdesk use cases (account, hardware, network, email, security, software, server issues).

## 2. High-Level Architecture
- Frontend: React + Vite
- Backend API: Node.js + Express
- Database: PostgreSQL
- ORM: Prisma
- Auth: JWT access token + refresh token (HTTP-only cookie)
- AI Provider: OpenAI-compatible client (OpenAI or DeepSeek)

## 3. Repository Structure
```text
helpdesk-ai/
  client/                 # React app
  server/                 # Express API + Prisma
  docker-compose.yml      # Local PostgreSQL service
  README.md
```

## 4. Frontend Overview (client)
Main entry and routing:
- `src/main.jsx`: wraps app with `BrowserRouter` and `AuthProvider`
- `src/App.jsx`: route map and access control
- `vite.config.js`: dev proxy for `/api` -> `http://localhost:5000`

Key pages:
- `LoginPage`, `RegisterPage`
- `DashboardPage`: AI chat workspace, session history, recommendations
- `SimulationsPage`: dedicated simulation library (module cards + modal walkthrough)
- `AdminPage`: user administration for ADMIN role

Auth/session handling:
- `AuthContext.jsx`: login/register/logout, refresh token restoration, user state
- `useAxios.js`: attaches access token to requests, auto-refreshes on 401, redirects on auth failures
- Route guards:
  - `PrivateRoute`: authenticated users only
  - `AdminRoute`: ADMIN-only pages

## 5. Backend Overview (server)
Core app:
- `src/server.js`
  - CORS with credentials and allowlist from `CLIENT_URLS` / `CLIENT_URL` (plus dev-only LAN origin fallback on `:5173`)
  - Helmet security headers
  - JSON + cookie parsing
  - Rate limiting
  - Route registration

API routes:
- Auth: `/api/auth/*` (`auth.routes.js`)
- AI chat: `/api/ai/chat` (`ai.routes.js`)
- Admin: `/api/admin/*` (`admin.routes.js`)
- Health: `/api/health`

Controllers:
- `authController.js`: register, login, refresh, logout, me
- `aiController.js`: policy-check + AI completion
- `adminController.js`: list users, role/status update, soft delete

Middleware:
- `authMiddleware.js`: JWT verification + admin role enforcement
- `validateRequest.js`: request validation error mapper

Policy layer:
- `promptPolicy.js`: allow/block logic for in-scope IT prompts, greeting handling, follow-up context handling

## 6. Data Model (Prisma)
Defined in `server/prisma/schema.prisma`.

Entities:
- `User`
  - Identity/profile, role (`USER`/`ADMIN`), active flag
- `RefreshToken`
  - Token persistence for long-lived sessions
  - Linked to `User` with cascade delete

## 7. Authentication and Security Flow
1. User logs in/registers.
2. Server returns:
   - short-lived `accessToken` in response body
   - long-lived `refreshToken` in HTTP-only cookie
3. Frontend sends `Authorization: Bearer <accessToken>` for protected APIs.
4. On 401, frontend attempts `/api/auth/refresh` and retries original request.
5. If refresh fails, user is logged out and redirected to `/login`.

Security controls:
- bcrypt password hashing
- JWT access/refresh token split
- HTTP-only refresh cookie
- Rate limits for auth and AI endpoints
- Role-based authorization on admin endpoints
- Prompt policy filter before AI call

## 8. AI Chat Flow
1. Dashboard sends `POST /api/ai/chat` with `message` and short `history`.
2. Server policy evaluates prompt scope.
3. If blocked, returns policy-safe message.
4. If allowed, server calls AI provider via OpenAI-compatible SDK.
5. Frontend renders response in chat UI.

## 9. Simulation Module Flow
Simulation is now separated from chat:
1. User opens `/simulations`.
2. Page builds module cards from `helpdeskData.js` (`modules`, `kb`, `simulations`).
3. Selecting "Open Simulation" opens a modal walkthrough.
4. User navigates case steps (`screen`, `action`, `result`) with progress tracking.

## 10. Runtime Configuration
Server (`server/.env`):
- DB: `DATABASE_URL`
- JWT: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, expiry values
- AI: `AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`
- App: `PORT`, `CLIENT_URL`, `CLIENT_URLS`, `NODE_ENV`

Client (`client/.env`):
- `VITE_API_URL`

## 11. Deployment/Local Dev Notes
- API and UI run as separate services.
- PostgreSQL can run locally or via `docker-compose.yml`.
- Prisma migrations + seed initialize schema and default users.

## 12. Current Behavior Summary
- Chat and simulation are decoupled.
- Simulation access is centralized in a dedicated page.
- Admin operations are protected by role checks and token auth.
