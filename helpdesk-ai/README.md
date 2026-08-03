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

For LAN/IP access during development:

- Frontend dev server already binds to `0.0.0.0` and proxies `/api` to `http://localhost:5000`.
- In development, `http://<LAN-IP>:5173` is accepted automatically.
- For non-default origins/ports, add your frontend origin to `server/.env` `CLIENT_URLS` (comma-separated).
- If you do not want to use the dev proxy, set `client/.env` `VITE_API_URL` directly to your backend URL.

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

### Windows Server 2025 simulation

The `windows-os` surface is the browser-based simulator category. It launches a private
**Microsoft Windows Server 2025 Base** workspace through Apache Guacamole; it is not
Windows 11. The backend runs the default version of the manually managed
`helpdesk-windows-simulation` Launch Template using `AWS_SIMULATION_LAUNCH_TEMPLATE_ID`.

The application does not store an AMI ID, instance type, subnet, security group, or Launch
Template version. Configure those in AWS: use the custom AMI (for example
`helpdesk-windows-server-2025-v1`), `t3.small`, private networking with no public IPv4,
and RDP 3389 only from `helpdesk-guacamole-sg`. Guacamole remains a separate Ubuntu 24.04
`t3.micro` gateway.

Set these backend-only values in `server/.env`:

```env
AWS_REGION=ap-southeast-1
AWS_SIMULATION_LAUNCH_TEMPLATE_ID=
SIMULATION_TTL_MINUTES=20
SIMULATION_MAX_PER_USER=1
SIMULATION_GLOBAL_MAX=1
WINDOWS_LAB_USERNAME=labuser
WINDOWS_LAB_PASSWORD=
GUACAMOLE_BASE_URL=
GUACAMOLE_LAUNCH_URL=
GUAC_JSON_SECRET=
GUAC_URL_TTL_SECONDS=300
```

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
- CORS restricted to `CLIENT_URLS` / `CLIENT_URL` with credentials
- Auth routes limited to 10 req/min using `express-rate-limit`
- bcrypt password hashing
- Server-side validation via `express-validator`
