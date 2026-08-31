export function planDeviceProvisioning(existing, expected) {
  if (!existing) return 'create';
  if (existing.project_id !== expected.projectId) {
    throw new Error(`Device ${expected.deviceId} belongs to another project`);
  }
  if (existing.midnight_registry_status === 'disabled') {
    throw new Error(`Device ${expected.deviceId} is disabled and cannot be reused`);
  }
  if (existing.midnight_registry_status === 'unregistered') return 'continue';
  if (existing.midnight_registry_status !== 'registered') {
    throw new Error(`Device ${expected.deviceId} has an invalid Midnight registry status`);
  }
  if (existing.midnight_contract_address === expected.contractAddress) {
    return 'already-current';
  }
  if (
    typeof existing.midnight_contract_address !== 'string'
    || !existing.midnight_contract_address
  ) {
    throw new Error(`Device ${expected.deviceId} has registered status without a Fleet Registry address`);
  }
  return 'replace-stale';
}
