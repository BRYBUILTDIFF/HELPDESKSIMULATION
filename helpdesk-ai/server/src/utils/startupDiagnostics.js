function databaseSettingCode(value) {
  if (!value) return 'DATABASE_URL_MISSING';
  if (value !== value.trim() || /[\r\n"']/.test(value) || value.startsWith('DATABASE_URL=')) return 'DATABASE_URL_FORMAT';
  try {
    const url = new URL(value);
    if (!['postgresql:', 'postgres:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) return 'DATABASE_URL_FORMAT';
    if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)) return 'DATABASE_URL_LOCALHOST';
  } catch { return 'DATABASE_URL_FORMAT'; }
  return null;
}

function startupDiagnostic(error) {
  const explicit = String(error?.code || error?.errorCode || '');
  if (/^(P\d{4}|SECURITY_ENCRYPTION_KEY_INVALID|MAINTENANCE_CREDENTIALS_PRESENT|PRIVILEGED_RUNTIME_ROLE|DATABASE_URL_(MISSING|FORMAT|LOCALHOST))$/.test(explicit)) return explicit;
  // Some Prisma initialization failures include only a message. Inspect it but
  // return fixed labels only: never return its text, URL, stack or credentials.
  const message = String(error?.message || '');
  if (/authentication failed|password authentication failed/i.test(message)) return 'P1000';
  if (/can't reach database|cannot reach database|ECONNREFUSED|ENOTFOUND/i.test(message)) return 'P1001';
  if (/timed out|ETIMEDOUT/i.test(message)) return 'P1002';
  if (/TLS|SSL|certificate/i.test(message)) return 'P1011';
  if (/connection string|database URL|protocol.*postgres|environment variable not found.*DATABASE_URL/i.test(message)) return 'DATABASE_URL_FORMAT';
  return 'UNKNOWN_DATABASE_ERROR';
}

module.exports = { databaseSettingCode, startupDiagnostic };
