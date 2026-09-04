import { describe, expect, it } from 'vitest';
import {
  evaluatePreparedDailyExtremaHoursLocally,
  prepareDailyExtremaAttestation,
} from '@midnight-demo/shared';

// The deterministic peer is deliberately deployable as a plain JavaScript
// Worker and importable by Node without a build step.
// @ts-expect-error JavaScript system-test peer has no declaration file.
import { handleMeasurementSource } from '../../../../tests/system/mock-measurement-source/handler.mjs';

import {
  decryptConnectorCredential,
  encryptConnectorCredential,
  fetchFixedWindowMeasurements,
  fixedOperationalWindow,
  managedMeasurementGroupKey,
  managedSourceIdentifiers,
  ManagedSourceError,
  validateManagedEndpoint,
} from './managed-source-core.js';

const periodStart = '2026-08-29T15:00:00.000Z';
const periodEnd = '2026-08-30T15:00:00.000Z';
const encryptionKey = '11'.repeat(32);

function input(sourceSensorId: string) {
  return {
    endpointUrl: 'https://source.test/v1/measurements',
    sourceSensorId,
    bearerToken: 'test-managed-source-token',
    deviceId: 'managed-device-test',
    sensorType: 'temperature' as const,
    unit: '°C' as const,
    periodStart,
    periodEnd,
    responseMaxBytes: 1_048_576,
  };
}

const peerFetch = async (requestInfo: RequestInfo | URL, init?: RequestInit) => (
  handleMeasurementSource(new Request(requestInfo, init)) as Promise<Response>
);

async function sourceError(sourceId: string): Promise<ManagedSourceError> {
  try {
    await fetchFixedWindowMeasurements(input(sourceId), peerFetch);
    throw new Error(`${sourceId} unexpectedly succeeded`);
  } catch (error) {
    expect(error).toBeInstanceOf(ManagedSourceError);
    return error as ManagedSourceError;
  }
}

describe('Managed Source credential protection', () => {
  it('encrypts credentials with randomized AES-GCM and authenticates the envelope', async () => {
    const first = await encryptConnectorCredential('private-token', encryptionKey);
    const second = await encryptConnectorCredential('private-token', encryptionKey);
    expect(first).not.toContain('private-token');
    expect(second).not.toBe(first);
    await expect(decryptConnectorCredential(first, encryptionKey)).resolves.toBe('private-token');
    await expect(decryptConnectorCredential(first, '22'.repeat(32))).rejects.toThrow();
  });
});

describe('Managed Source endpoint policy', () => {
  it('accepts a public HTTPS endpoint and canonicalizes its query', () => {
    expect(validateManagedEndpoint('https://api.example.com/v1/data?b=2&a=1')).toBe(
      'https://api.example.com/v1/data?a=1&b=2',
    );
  });

  it.each([
    'http://api.example.com/data',
    'https://localhost/data',
    'https://127.0.0.1/data',
    `https://${[192, 168, 1, 4].join('.')}/data`,
    'https://[::1]/data',
    'https://source.local/data',
    'https://user:password@api.example.com/data',
    'https://api.example.com/data?from=attacker',
  ])('rejects unsafe endpoint %s', (endpoint) => {
    expect(() => validateManagedEndpoint(endpoint)).toThrow();
  });
});

describe('fixed-window-json-v1 adapter', () => {
  it('normalizes and aggregates the actual 1,440-sample use case', async () => {
    const result = await fetchFixedWindowMeasurements(input('normal-1440'), peerFetch);
    expect(result.records).toHaveLength(1_440);
    expect(result.summaries).toHaveLength(24);
    expect(result.summaries.every((hour) => hour.sampleCount === 60)).toBe(true);
    expect(result.summaries.reduce((total, hour) => total + hour.sampleCount, 0)).toBe(1_440);
  });

  it.each([
    ['missing-hour', 1_380, 23],
    ['sparse-day', 4, 4],
    ['empty-day', 0, 0],
    ['duplicate-identical', 1_440, 24],
    ['outside-threshold', 1_440, 24],
  ] as const)('accepts %s as a complete day', async (scenario, count, observedHours) => {
    const result = await fetchFixedWindowMeasurements(input(scenario), peerFetch);
    expect(result.records).toHaveLength(count);
    expect(result.summaries.filter((hour) => hour.sampleCount > 0)).toHaveLength(observedHours);
  });

  it.each([
    ['duplicate-conflict', 'source_conflicting_duplicate'],
    ['wrong-source', 'source_identity_mismatch'],
    ['wrong-range', 'source_range_mismatch'],
    ['outside-range', 'source_timestamp_outside_window'],
    ['wrong-unit', 'source_metadata_mismatch'],
    ['invalid-value', 'source_invalid_value'],
    ['malformed-json', 'source_invalid_json'],
    ['oversized', 'source_sample_limit_exceeded'],
  ])('classifies invalid payload %s as action-required', async (scenario, code) => {
    const error = await sourceError(scenario);
    expect(error.code).toBe(code);
    expect(error.kind).toBe('action-required');
  });

  it.each([
    ['unauthorized', 'source_authentication_failed', 'action-required'],
    ['forbidden', 'source_authentication_failed', 'action-required'],
    ['not-found', 'source_not_found', 'action-required'],
    ['redirect', 'source_redirect_rejected', 'action-required'],
    ['rate-limited', 'source_http_429', 'retryable'],
    ['server-error', 'source_http_503', 'retryable'],
  ])('classifies HTTP scenario %s', async (scenario, code, kind) => {
    const error = await sourceError(scenario);
    expect(error).toMatchObject({ code, kind });
    expect(error.message).not.toContain('test-managed-source-token');
  });

  it('classifies network timeout without exposing request credentials', async () => {
    const timeoutFetch = async () => {
      throw new DOMException('timed out', 'TimeoutError');
    };
    await expect(fetchFixedWindowMeasurements(input('normal-1440'), timeoutFetch)).rejects.toMatchObject({
      code: 'source_request_timeout',
      kind: 'retryable',
    });
  });

  it.each([
    ['normal-1440', 1_440, 24, false],
    ['outside-threshold', 1_440, 24, true],
    ['missing-hour', 1_380, 23, false],
    ['empty-day', 0, 0, false],
  ] as const)(
    'feeds normalized %s data into the existing daily Attestation format',
    async (scenario, sampleCount, observedHours, hasOutsideHour) => {
      const fetched = await fetchFixedWindowMeasurements(input(scenario), peerFetch);
      const attestation = await prepareDailyExtremaAttestation(fetched.records, {
        deviceId: 'managed-device-test',
        periodDate: '2026-08-30',
        measurementGroupId: `managed:${scenario}:2026-08-30`,
        timeZoneOffsetMinutes: 540,
        localDayStartHour: 0,
        policyId: 'temperature-v1',
        assignmentId: 'managed-assignment-test',
        nonceSeed: `managed-source-test-${scenario}`,
      });
      const results = evaluatePreparedDailyExtremaHoursLocally(attestation, {
        policyId: 'temperature-v1',
        mode: 'closed-range',
        minimum: 10,
        maximum: 35,
        valueScale: 100,
        sensorTypeCode: 1,
        unitCode: 1,
        version: 1,
      });
      expect(attestation.publicData.sampleCount).toBe(sampleCount);
      expect(attestation.publicData.observedHourCount).toBe(observedHours);
      await expect(managedMeasurementGroupKey(`managed:${scenario}:2026-08-30`)).resolves.toBe(
        attestation.publicData.measurementGroupId,
      );
      expect(results).toHaveLength(24);
      expect(results.includes('outside-threshold')).toBe(hasOutsideHour);
      expect(results.filter((result) => result === 'no-data')).toHaveLength(24 - observedHours);
    },
  );
});

describe('Managed Source deterministic identity and window', () => {
  it('derives stable, separated IDs for one source and operational date', async () => {
    const first = await managedSourceIdentifiers('project-1', 'source-1', 'policy-1', '2026-08-30');
    const repeated = await managedSourceIdentifiers('project-1', 'source-1', 'policy-1', '2026-08-30');
    const other = await managedSourceIdentifiers('project-1', 'source-2', 'policy-1', '2026-08-30');
    expect(first).toEqual(repeated);
    expect(first.deviceId).not.toBe(other.deviceId);
    expect(first.proofJobId).not.toBe(other.proofJobId);
  });

  it('derives an exact 24-hour interval from a non-UTC operational boundary', () => {
    const window = fixedOperationalWindow('2026-08-30', {
      timeZoneOffsetMinutes: 540,
      localDayStartHour: 6,
    });
    expect(window).toEqual({
      periodStart: '2026-08-29T21:00:00.000Z',
      periodEnd: '2026-08-30T21:00:00.000Z',
    });
  });
});
