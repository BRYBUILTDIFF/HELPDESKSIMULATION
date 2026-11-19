const { test } = require('node:test');
const assert = require('node:assert/strict');
const { windowsSimulationsEnabled } = require('../src/utils/simulationAvailability');

test('Windows labs retain local defaults and require explicit true when configured', () => {
  assert.equal(windowsSimulationsEnabled({}), true);
  for (const value of ['false', '0', '', 'invalid']) assert.equal(windowsSimulationsEnabled({ WINDOWS_SIMULATIONS_ENABLED: value }), false);
  assert.equal(windowsSimulationsEnabled({ WINDOWS_SIMULATIONS_ENABLED: 'TRUE' }), true);
});

test('disabled Windows launches return before any database or AWS operations', async () => {
  require.cache[require.resolve('../src/prisma')] = { exports: new Proxy({}, { get() { throw new Error('Unexpected database access'); } }) };
  const { createSimulationSession } = require('../src/controllers/simulationSessionController');
  const previous = process.env.WINDOWS_SIMULATIONS_ENABLED;
  process.env.WINDOWS_SIMULATIONS_ENABLED = 'false';
  try {
    for (const role of ['USER', 'ADMIN']) {
      const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
      await createSimulationSession({ user: { role } }, res, error => { throw error; });
      assert.equal(res.code, 503);
    }
  } finally {
    if (previous === undefined) delete process.env.WINDOWS_SIMULATIONS_ENABLED;
    else process.env.WINDOWS_SIMULATIONS_ENABLED = previous;
  }
});

test('disabled Windows modules are hidden from the user catalog while terminal modules remain', async () => {
  const modules = [
    { id: 'terminal', simulation: { surface: 'terminal' } },
    { id: 'windows', simulation: { surface: 'windows-os' } }
  ];
  require.cache[require.resolve('../src/store/simulationModuleStore')] = { exports: { listModules: async () => modules, recordModuleCompletion: async () => null } };
  const { listEnabledSimulationModules } = require('../src/controllers/simulationController');
  const previous = process.env.WINDOWS_SIMULATIONS_ENABLED;
  try {
    for (const enabled of ['true', 'false']) {
      process.env.WINDOWS_SIMULATIONS_ENABLED = enabled;
      const res = { status() { return this; }, json(body) { this.body = body; return this; } };
      await listEnabledSimulationModules({}, res, error => { throw error; });
      assert.deepEqual(res.body.modules.map(module => module.id), enabled === 'true' ? ['terminal', 'windows'] : ['terminal']);
    }
  } finally {
    if (previous === undefined) delete process.env.WINDOWS_SIMULATIONS_ENABLED;
    else process.env.WINDOWS_SIMULATIONS_ENABLED = previous;
  }
});

test('Vercel proxy preserves API paths and excludes API errors from SPA fallback', async () => {
  const { createConfig } = await import('../../client/scripts/configure-vercel.mjs');
  const config = createConfig('https://helpdesk-test.onrender.com');
  assert.equal(config.rewrites[0].destination, 'https://helpdesk-test.onrender.com/api/:path*');
  const fallback = new RegExp(`^${config.rewrites[1].source}$`);
  assert.equal(fallback.test('/admin'), true);
  assert.equal(fallback.test('/api/ready'), false);
  assert.equal(fallback.test('/api'), false);
  for (const input of ['http://service.onrender.com', 'https://service.onrender.com/path', 'https://user:password@service.onrender.com', 'https://service.onrender.com?key=private', 'https://service.onrender.com.evil.invalid']) {
    assert.throws(() => createConfig(input));
  }
});
