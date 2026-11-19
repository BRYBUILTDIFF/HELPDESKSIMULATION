const { AsyncLocalStorage } = require('node:async_hooks');
const context = new AsyncLocalStorage();
function bounded(name, fallback, min, max) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}
function requestFetch(url, options = {}) {
  const signal = context.getStore()?.signal;
  return globalThis.fetch(url, { ...options, ...(signal ? { signal: options.signal ? AbortSignal.any([signal, options.signal]) : signal } : {}) });
}
module.exports = { context, bounded, requestFetch };
