# HelpDesk AI documentation

All project Markdown documentation lives in this folder.

| Document | Purpose |
| --- | --- |
| [Setup guide](README.md) | Installation, configuration, startup, and API overview |
| [Generalized use cases](GENERALIZED_USE_CASES.md) | Administrator and User goals, feature scope, and use-case diagrams |
| [Administrator flowchart](ADMIN_FLOWCHART.md) | Administrator sign-in, feature navigation, and work cycle |
| [User flowchart](USER_FLOWCHART.md) | User troubleshooting, saved conversations, and simulation workflow |
| [System overview](SYSTEM_OVERVIEW.md) | Architecture and system behavior |
| [AI overview](AIOVERVIEW.MD) | Detailed AI answering flow, policy, context, safety, and simulation integration |
| [Windows simulation](WINDOWS_OS_SIMULATION.md) | Windows lab and Guacamole setup |
| [Guacamole HTTPS deployment](GUACAMOLE_HTTPS_DEPLOYMENT.md) | Detailed free-hostname, Ubuntu TLS, Render/Vercel and AWS cleanup setup |
| [Module creation](Module_Creation_Overview.md) | Module creation reference |
| [Test cases](TESTCASES.MD) | Manual testing scenarios |
| [Deployment audit](DEPLOYMENT_AUDIT_2026-11-19.md) | Vercel/Render readiness, confirmed blockers, verification results, and release checklist |
| [Vercel + Render demo](DEPLOYMENT_VERCEL_RENDER.md) | Free demo setup, restricted cloud database, API proxy, and Windows HTTPS follow-up |
| [Online security checklist](ONLINE_SECURITY_CHECKLIST.md) | Prioritized post-deployment checks for credentials, accounts, isolation, database access, AI, backups and Windows labs |
| [Codebase security audit](CODEBASE_SECURITY_AUDIT_2026-11-19.md) | Evidence-based implementation backlog, priorities, existing controls and acceptance checks for public deployment |
| [Security release setup](SECURITY_RELEASE_SETUP.md) | Deployment order for MFA, AI/chat limits, per-instance Windows credentials, migration/grants and backup operations |
| [Security audit](AUDIT.MD) | Audit findings and remediation history |
| [Prompt reference](PROMP.MD) | Project prompt notes |
| [Review](review.md) | Project review notes |
| [Data persistence](DATA_PERSISTENCE.md) | Saved data, draft recovery, revision/test evidence, migration and verification |
| [Database reference](database/schema-reference.sql) | Exported schema for reference |

## Folder conventions

- `client/src/`: frontend source, with images in `IMG/` and views in `pages/`.
- `server/src/`: backend controllers, routes, middleware, services, and stores.
- `server/test/`: automated backend tests.
- `server/scripts/`: maintenance commands.
- `server/prisma/`: active Prisma schema, seed, and migration history.
- `server/data/`: application data files; their locations are used by the backend.
- `infrastructure/`: deployment support files, including the Guacamole launcher.
- `docs/`: guides, notes, and reference material.

Run application commands from the directories specified in the setup guide.
Package manifests and lockfiles stay with their packages. Environment files stay
with the applications that load them. Docker Compose stays in `helpdesk-ai/`.
Dependencies and generated build output remain in their existing locations.

The SQL reference was previously named `DATABASE REFERENCE` at the repository
root. It is documentation, not an executable Prisma migration. Use
`server/prisma/migrations/` for database deployment.
