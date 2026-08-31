import assert from 'node:assert/strict';

const moduleUrl = new URL(`../public/device-flow.js?verify=${Date.now()}`, import.meta.url);
const dashboard = await import(moduleUrl.href);

assert.equal(typeof dashboard.verifyPublicAttestation, 'function');
assert.equal(typeof dashboard.browserDeviceFlow, 'object');
for (const operation of [
  'loadConfiguration',
  'connectWallet',
  'createDevice',
  'registerDevice',
  'generateDailyMeasurements',
  'requestProof',
  'proveAndSubmit',
]) {
  assert.equal(
    typeof dashboard.browserDeviceFlow[operation],
    'function',
    `Built dashboard module is missing ${operation}`,
  );
}

console.log('Built dashboard module verification passed');
