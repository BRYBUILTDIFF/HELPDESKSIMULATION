# HelpDesk AI documentation

All project Markdown documentation lives in this folder.

| Document | Purpose |
| --- | --- |
| [Setup guide](README.md) | Installation, configuration, startup, and API overview |
| [System overview](SYSTEM_OVERVIEW.md) | Architecture and system behavior |
| [Windows simulation](WINDOWS_OS_SIMULATION.md) | Windows lab and Guacamole setup |
| [Module creation](Module_Creation_Overview.md) | Module creation reference |
| [Test cases](TESTCASES.MD) | Manual testing scenarios |
| [Security audit](AUDIT.MD) | Audit findings and remediation history |
| [Prompt reference](PROMP.MD) | Project prompt notes |
| [Review](review.md) | Project review notes |
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
