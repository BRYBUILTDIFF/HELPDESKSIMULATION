# HelpDesk AI

Full-stack HelpDesk AI system with JWT auth, refresh cookies, role-based admin panel, and React chat dashboard.

## Stack

- Frontend: React + Vite + React Router v6
- Backend: Node.js + Express
- Database: PostgreSQL
- ORM: Prisma
- Auth: JWT access token + refresh token cookie

## Project Structure

```text
helpdesk-ai/
  client/
  server/
  docker-compose.yml
  README.md
```

## 1. Install dependencies

```bash
cd server
npm install
cd ../client
npm install
```

## 2. Configure env files

```bash
cd server
cp .env.example .env
cd ../client
cp .env.example .env
```

Update `server/.env` with your real PostgreSQL credentials, JWT secrets, and AI provider settings.

### AI provider setup

Option A: OpenAI

```env
AI_PROVIDER=openai
AI_API_KEY=your_openai_api_key
AI_MODEL=gpt-4o-mini
```

Option B: DeepSeek (OpenAI-compatible)

```env
AI_PROVIDER=deepseek
AI_API_KEY=your_deepseek_api_key
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat
```

Note: `AI_API_KEY` is preferred. `OPENAI_API_KEY` / `OPENAI_MODEL` are still supported as fallback.

## 3. Optional PostgreSQL via Docker

From `helpdesk-ai/`:

```bash
docker compose up -d
```

## 4. Run migrations and generate Prisma client

From `helpdesk-ai/server`:

```bash
npx prisma migrate dev --name init
npm run generate
```

## 5. Seed default accounts

From `helpdesk-ai/server`:

```bash
npm run seed
```

Seeded credentials:

- Email: `admin@helpdesk.com`
- Password: `Admin@1234`
- Role: `ADMIN`
- Email: `user@helpdesk.com`
- Password: `User@1234`
- Role: `USER`

## 6. Start development servers

Terminal 1:

```bash
cd helpdesk-ai/server
npm run dev
```

Terminal 2:

```bash
cd helpdesk-ai/client
npm run dev
```

## API Overview

### Auth routes

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### AI routes (authenticated users)

- `POST /api/ai/chat`

### AI Policy Filter

- User prompts are filtered first by server-side policy.
- Only in-scope IT helpdesk topics are allowed.
- Out-of-scope topics are blocked and return a policy response.

### Admin routes (ADMIN only)

- `GET /api/admin/users`
- `PATCH /api/admin/users/:id`
- `DELETE /api/admin/users/:id` (soft delete via `isActive=false`)

## Security features

- Helmet enabled
- CORS restricted to `CLIENT_URL` with credentials
- Auth routes limited to 10 req/min using `express-rate-limit`
- bcrypt password hashing
- Server-side validation via `express-validator`
