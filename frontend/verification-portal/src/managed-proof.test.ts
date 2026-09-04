import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const managedDirectory = new URL('../public/managed-proof/', import.meta.url);
const managedHtml = fs.readFileSync(new URL('index.html', managedDirectory), 'utf8');
const managedScript = fs.readFileSync(new URL('managed-proof.js', managedDirectory), 'utf8');
const existingHtml = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const existingScript = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const sponsorDockerfile = fs.readFileSync(
  new URL('../../../backend/cloudflare/sponsor-wallet-container/Dockerfile', import.meta.url),
  'utf8',
);

describe('Managed API Attestation page boundary', () => {
  it('provides a dedicated Wallet-free source registration and proof tracking page', () => {
    expect(managedHtml).toContain('id="source-form"');
    expect(managedHtml).toContain('id="run-form"');
    expect(managedHtml).toContain('No customer wallet required');
    expect(managedHtml).toContain('FIXED 24 HOURS');
    expect(managedScript).toContain("api('/api/v1/managed-sources/bootstrap')");
    expect(managedScript).toContain("api('/api/v1/managed-sources')");
    expect(managedHtml).not.toMatch(/Connect Midnight Wallet|wallet-connect-button/u);
    expect(managedScript).not.toMatch(/connectWallet|midnight-authenticator/u);
  });

  it('keeps the existing judge application independent from Managed Proof', () => {
    expect(existingHtml).not.toContain('id="source-form"');
    expect(existingHtml).not.toContain('/managed-proof/managed-proof.js');
    expect(existingScript).not.toContain('/api/v1/managed-sources');
  });

  it('shows asynchronous state, hourly summaries, privacy, and public verification', () => {
    expect(managedScript).toContain('startPolling(sourceId, runId)');
    expect(managedScript).toContain('data.hours.map');
    expect(managedHtml).toContain('RAW SENSOR VALUES');
    expect(managedHtml).toContain('Private — administrator summary only');
    expect(managedScript).toContain('data.run.verificationUrl');
    expect(managedScript).toContain('preprod.midnightexplorer.com/transactions/');
    expect(managedScript).toContain("sponsor_wallet_waiting: 'Waiting for System Wallet'");
    expect(managedScript).toContain("actionRequired ? 'Action required' : 'Automatic retry scheduled'");
  });

  it('binds every administration mutation to the protected page session', () => {
    expect(managedScript).toContain("'X-CSRF-Token': state.bootstrap.csrfToken");
    expect(managedScript).toContain("'Content-Type': 'application/json'");
    expect(managedScript).toContain("credentials: 'same-origin'");
    expect(managedScript).toContain("options.body === undefined ? { body: '{}' }");
  });

  it('ships the operational daily Attestation proving assets in the System Wallet image', () => {
    expect(sponsorDockerfile).toContain('keys/submitDailyAttestation.prover');
    expect(sponsorDockerfile).toContain('keys/submitDailyAttestation.verifier');
  });
});
