import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  generateContractAuthority,
  loadContractAuthority,
  loadContractAuthorityEnrollment,
} from './authority.js';

test('generates separate owner-only contract authority and public enrollment files', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vsp-contract-authority-'));
  try {
    const enrollment = generateContractAuthority('preprod', home);
    const authority = loadContractAuthority('preprod', home);
    assert.equal(authority.deviceAuthorityHex, enrollment.deviceAuthorityHex);
    assert.match(authority.deviceSecretHex, /^(?:[0-9a-f]{2}){32}$/u);
    assert.equal(
      fs.statSync(path.join(home, 'authority.json')).mode & 0o777,
      0o600,
    );
    const publicFile = fs.readFileSync(path.join(home, 'enrollment.json'), 'utf8');
    assert.doesNotMatch(publicFile, /deviceSecretHex/u);
    assert.deepEqual(loadContractAuthorityEnrollment('preprod', home), enrollment);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('refuses implicit contract authority rotation', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vsp-contract-authority-'));
  try {
    generateContractAuthority('preprod', home);
    assert.throws(
      () => generateContractAuthority('preprod', home),
      /already exists/u,
    );
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
