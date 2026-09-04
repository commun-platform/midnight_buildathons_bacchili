import assert from 'node:assert/strict';
import test from 'node:test';

import {
  preservedContractTransactionId,
  requireSponsoredContractEntryPoint,
  sponsoredContractEntryPoints,
  validateSponsorIntentShape,
} from './transaction.js';

test('allowlists only the eight operational Sensor Registry circuits', () => {
  assert.deepEqual(sponsoredContractEntryPoints, [
    'registerDevice',
    'rotateDeviceAuthority',
    'disableDevice',
    'registerThresholdPolicy',
    'registerPolicyAssignment',
    'closePolicyAssignment',
    'rotateOperatorAuthority',
    'submitDailyAttestation',
  ]);
  assert.equal(requireSponsoredContractEntryPoint('registerDevice'), 'registerDevice');
  assert.throws(
    () => requireSponsoredContractEntryPoint('transfer'),
    /outside the sponsorship policy/u,
  );
});

test('accepts exactly one contract intent containing one action', () => {
  assert.doesNotThrow(() => validateSponsorIntentShape(new Map([
    ['intent-1', { actions: [{}] }],
  ])));
});

test('accepts Wallet SDK DUST-only intents only after Sponsor balancing', () => {
  const balanced = new Map([
    ['device-intent', { actions: [{}] }],
    ['sponsor-dust-intent', { actions: [], dustActions: {} }],
  ]);
  assert.doesNotThrow(() => validateSponsorIntentShape(balanced, true));
  assert.throws(
    () => validateSponsorIntentShape(balanced, false),
    /must not include DUST/u,
  );
});

test('rejects missing or empty non-DUST contract intents', () => {
  assert.throws(
    () => validateSponsorIntentShape(undefined),
    /no contract intent/u,
  );
  assert.throws(
    () => validateSponsorIntentShape(new Map([
      ['intent-1', { actions: [] }],
    ]), true),
    /empty contract intent/u,
  );
});

test('rejects additional contract actions', () => {
  assert.throws(
    () => validateSponsorIntentShape(new Map([
      ['intent-1', { actions: [{}, {}] }],
    ])),
    /exactly one contract action/u,
  );
});

test('preserves the Device contract identifier across Sponsor-added intents', () => {
  assert.equal(
    preservedContractTransactionId(['device-contract-id'], ['sponsor-dust-id', 'device-contract-id']),
    'device-contract-id',
  );
  assert.throws(
    () => preservedContractTransactionId(
      ['device-contract-id'],
      ['sponsor-dust-id', 'different-contract-id'],
    ),
    /changed the Device contract transaction identifier/u,
  );
  assert.throws(
    () => preservedContractTransactionId(
      ['device-contract-id', 'unexpected-device-id'],
      ['device-contract-id', 'unexpected-device-id'],
    ),
    /exactly one contract identifier/u,
  );
});
