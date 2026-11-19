const {test} = require('node:test');
const assert = require('node:assert/strict');
const {databaseSettingCode, startupDiagnostic} = require('../src/utils/startupDiagnostics');

test('production database settings reject common dashboard paste errors', () => {
  const url = 'postgresql://helpdesk_runtime:private@database.invalid/demo?sslmode=require';
  assert.equal(databaseSettingCode(url), null);
  assert.equal(databaseSettingCode(undefined), 'DATABASE_URL_MISSING');
  for (const value of [`"${url}"`, `DATABASE_URL=${url}`, `${url}\n`, 'https://database.invalid/demo']) assert.equal(databaseSettingCode(value), 'DATABASE_URL_FORMAT');
  assert.equal(databaseSettingCode('postgresql://user:private@localhost/demo'), 'DATABASE_URL_LOCALHOST');
});

test('Prisma initialization messages produce fixed safe diagnostics', () => {
  for (const [message, code] of [
    ["Can't reach database server at private.invalid", 'P1001'],
    ['Authentication failed for private-user with password private', 'P1000'],
    ['Error opening a TLS connection: private', 'P1011'],
    ['The provided database string is invalid. connection string: private', 'DATABASE_URL_FORMAT'],
    ['unexpected private postgresql://user:password@private/database', 'UNKNOWN_DATABASE_ERROR']
  ]) assert.equal(startupDiagnostic({message}), code);
  assert.equal(startupDiagnostic({errorCode:'P1001'}), 'P1001');
  assert.equal(startupDiagnostic({code:'secret-value'}), 'UNKNOWN_DATABASE_ERROR');
});
