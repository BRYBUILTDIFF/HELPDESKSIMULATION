if (!process.argv.includes('--env-file')) throw new Error('Provide an explicit cloud maintenance file with --env-file');
require('./owner-config');
if (!process.env.ADMIN_DATABASE_URL) throw new Error('ADMIN_DATABASE_URL is required for the backup job');
require('./secure-backup').backup().catch(() => {console.error('Cloud backup failed; verify target, tools, TLS and encryption key privately.');process.exitCode=1;});
