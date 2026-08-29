import { describe, expect, it } from 'vitest';

// @ts-ignore The CLI helper is native ESM JavaScript and is exercised directly here.
import { planDeviceProvisioning } from '../scripts/provision-device-record-state.mjs';

const expected = {
  deviceId: 'review-device-001',
  projectId: 'measurement-authenticity-01',
  contractAddress: 'current-contract',
};

describe('Device provisioning state', () => {
  it('creates or continues an unregistered Device record', () => {
    expect(planDeviceProvisioning(undefined, expected)).toBe('create');
    expect(planDeviceProvisioning({
      project_id: expected.projectId,
      midnight_registry_status: 'unregistered',
      midnight_contract_address: null,
    }, expected)).toBe('continue');
  });

  it('replaces only a registration mirrored from an older Contract', () => {
    expect(planDeviceProvisioning({
      project_id: expected.projectId,
      midnight_registry_status: 'registered',
      midnight_contract_address: 'retired-contract',
    }, expected)).toBe('replace-stale');
  });

  it('reuses a registration already mirrored from the current Contract', () => {
    expect(planDeviceProvisioning({
      project_id: expected.projectId,
      midnight_registry_status: 'registered',
      midnight_contract_address: expected.contractAddress,
    }, expected)).toBe('already-current');
  });

  it('rejects disabled, cross-project, and malformed registrations', () => {
    expect(() => planDeviceProvisioning({
      project_id: expected.projectId,
      midnight_registry_status: 'disabled',
      midnight_contract_address: 'retired-contract',
    }, expected)).toThrow('disabled and cannot be reused');
    expect(() => planDeviceProvisioning({
      project_id: 'another-project',
      midnight_registry_status: 'unregistered',
      midnight_contract_address: null,
    }, expected)).toThrow('belongs to another project');
    expect(() => planDeviceProvisioning({
      project_id: expected.projectId,
      midnight_registry_status: 'registered',
      midnight_contract_address: null,
    }, expected)).toThrow('without a Fleet Registry address');
  });
});
