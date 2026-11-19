// Explicit maintenance file only; never fall back to the development database.
if (!process.argv.includes('--env-file')) throw new Error('Provide --env-file with the cloud maintenance file');
require('./owner-config');
if (!process.env.ADMIN_DATABASE_URL) throw new Error('ADMIN_DATABASE_URL is required in the maintenance file');
process.env.DATABASE_URL = process.env.ADMIN_DATABASE_URL;
require('../prisma/seed');
