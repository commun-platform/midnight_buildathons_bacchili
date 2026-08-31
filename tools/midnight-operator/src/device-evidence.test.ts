import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createDeviceSignatureBundle,
  createSignedOutlierReason,
  verifyDeviceSignatureBundle,
  verifySignedOutlierReason,
  type HourSignaturePayload,
} from './device-evidence.js';

describe('device evidence', () => {
  it('verifies all signed hourly roots and detects changes', () => {
    const payloads: HourSignaturePayload[] = Array.from({ length: 24 }, (_, hourIndex) => ({
      domain: 'measurement-hour-root:v1',
      deviceCommitment: '11'.repeat(32),
      schemaVersion: 1,
      localDate: '2026-08-26',
      hourIndex,
      hourRoot: hourIndex.toString(16).padStart(64, '0'),
      sampleCount: 1,
      firstSequence: String(hourIndex + 1),
      lastSequence: String(hourIndex + 1),
      firmwareId: 'benchmark-firmware-v1',
    }));
    const signed = createDeviceSignatureBundle(payloads, 'test-device-ed25519');
    assert.equal(verifyDeviceSignatureBundle(signed.bundle, signed.bundleHash), true);
    signed.bundle.hours[0]!.payload.hourRoot = 'ff'.repeat(32);
    assert.equal(verifyDeviceSignatureBundle(signed.bundle, signed.bundleHash), false);
  });

  it('verifies append-only reason content and detects changes', () => {
    const reason = createSignedOutlierReason({
      domain: 'measurement-outlier-reason:v1',
      dayRoot: '22'.repeat(32),
      hourIndex: 10,
      reasonCode: 'MAINTENANCE',
      reasonText: 'Door opened during scheduled inspection.',
      operatorId: 'operator-001',
      recordedAt: '2026-08-27T00:00:00.000Z',
      previousReasonHash: '00'.repeat(32),
    }, 'test-operator-ed25519');
    assert.equal(verifySignedOutlierReason(reason), true);
    reason.payload.reasonText = 'Changed after signing';
    assert.equal(verifySignedOutlierReason(reason), false);
  });
});
