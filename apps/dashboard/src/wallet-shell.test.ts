import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const deviceFlow = fs.readFileSync(new URL('./device-flow.ts', import.meta.url), 'utf8');
const midnightDevice = fs.readFileSync(new URL('./midnight-device.ts', import.meta.url), 'utf8');
const publicVerifier = fs.readFileSync(new URL('./public-verifier.ts', import.meta.url), 'utf8');
const gatewayWorker = fs.readFileSync(new URL('../../proof-gateway/src/index.ts', import.meta.url), 'utf8');
const gatewayConfiguration = fs.readFileSync(new URL('../../proof-gateway/wrangler.jsonc', import.meta.url), 'utf8');
const sponsorDockerfile = fs.readFileSync(new URL('../../sponsor-wallet/Dockerfile', import.meta.url), 'utf8');

describe('Midnight Wallet shell', () => {
  it('keeps the Wallet action in the upper-right header controls', () => {
    expect(html).toMatch(/<div class="header-controls">[\s\S]*id="wallet-connect-button"/u);
    expect(styles).toContain('.header-controls');
    expect(styles).toContain('.wallet-connect-button');
  });

  it('gates the Device Workflow until the Wallet is connected', () => {
    expect(script).toContain('if (!deviceState.wallet)');
    expect(script).toContain('walletRequiredBody');
    expect(script).not.toContain("workflowButton('device-wallet-connect'");
    expect(script).toContain("deviceAction('wallet-connect-button'");
  });

  it('uses fee-free Lace approval and a dedicated Sponsor Wallet', () => {
    expect(midnightDevice).toContain('{ payFees: false }');
    expect(midnightDevice).toContain('/sponsor');
    expect(midnightDevice).not.toContain('getDustBalance');
    expect(midnightDevice).not.toContain('api.submitTransaction');
    expect(script).not.toContain('hasSpendableDust');
    expect(script).not.toContain('refreshConnectedWalletBalance');
    expect(script).toContain("feeSponsoredLabel: 'TRANSACTION FEE SPONSORED'");
    expect(script).toContain("feeSponsoredLabel: 'トランザクション手数料はスポンサー負担'");
  });

  it('shows and enforces the authenticated Device daily Sponsor quota', () => {
    expect(deviceFlow).toContain("endpoint(config.serviceUrl, '/api/v1/sponsor-quota')");
    expect(deviceFlow).toContain("authenticatedHeaders('transaction:submit')");
    expect(script).toContain('function sponsorQuotaAllows(proofJobId)');
    expect(script).toContain('quota.remaining > 0 || quota.reservedProofJobIds.includes');
    expect(script).toContain("sponsorQuotaTitle: 'Daily sponsored submissions (JST)'");
    expect(script).toContain("sponsorQuotaTitle: 'スポンサー送信の日次上限（JST）'");
    expect(script).toContain("t('sponsorQuotaReached')");
  });

  it('keeps the Sponsor Wallet inbound private while allowing official native WSS', () => {
    const sponsorContainer = gatewayWorker.slice(
      gatewayWorker.indexOf('export class SponsorWalletContainer'),
      gatewayWorker.indexOf('function json('),
    );
    expect(sponsorContainer).toContain('enableInternet = true');
    expect(sponsorContainer).toContain('interceptHttps = false');
    expect(sponsorContainer).toContain("'proof.internal'");
    expect(sponsorContainer).toContain("'indexer.preprod.midnight.network'");
    expect(sponsorContainer).toContain("'rpc.preprod.midnight.network'");
    expect(sponsorContainer).toContain('SponsorWalletContainer.outboundByHost =');
    expect(sponsorContainer).not.toContain('static outboundByHost');
    expect(sponsorContainer).toContain('async onActivityExpired(): Promise<void>');
    expect(sponsorContainer).toContain('this.renewActivityTimeout()');
    expect(sponsorContainer).not.toContain('await this.stop()');
    expect(sponsorContainer).not.toContain('await this.destroy()');
    expect(sponsorDockerfile).not.toContain('NODE_EXTRA_CA_CERTS');
    expect(sponsorDockerfile).not.toContain('SSL_CERT_FILE');
    expect(gatewayWorker).toContain("parts[4] === 'sponsor'");
    expect(gatewayWorker).not.toContain("url.pathname === '/api/v1/sponsor-wallet/health'");
    expect(gatewayWorker).not.toContain("url.pathname === '/api/v1/sponsor-wallet/restore'");
    expect(gatewayConfiguration).not.toMatch(/(?:route|custom_domain).*sponsor-wallet/iu);
  });

  it('retains the confirmed transaction while refreshed history catches up', () => {
    expect(script).toContain('deviceState.transaction ??= submitted');
    expect(script).toContain("${t('confirmed')}: ${submitted.transactionId}");
  });

  it('renders cached public evidence before starting one background synchronization', () => {
    expect(script).not.toContain('await synchronizeLocalDashboard();\n      const list');
    expect(script).toContain('void startLocalDashboardSync();');
    expect(script).toContain("render({ showLoading: false, startInitialSync: false })");
    expect(script).toContain('dashboard-sync-indicator');
    expect(styles).toContain('.dashboard-sync-progress .progress-bar');
  });

  it('uses Refresh for an explicit local synchronization without clearing the current view', () => {
    expect(script).toContain('void startLocalDashboardSync(true);');
    expect(script).toContain("syncInProgressDetail: 'The current results stay visible");
    expect(script).toContain('reloadButton.disabled = synchronizing');
  });

  it('shows intentionally redacted Raw Sensor Values in the public verifier', () => {
    expect(script).toContain('function redactedRawValues(data)');
    expect(script).toContain('raw-values-redacted');
    expect(script).toContain('aria-hidden="true"');
    expect(script).toContain('Individual readings stay on the Device');
    expect(script).toContain("rawValuesHidden: 'HIDDEN FROM THIRD PARTIES'");
    expect(script).toContain("rawValuesHidden: '第三者には非公開'");
    expect(script).toContain('VALUES STAY PRIVATE');
    expect(script).toContain("rawSensorValues: '元のセンサー値'");
    expect(script).not.toContain('NOT DISCLOSED');
    expect(styles).toContain('.raw-value-mask');
  });

  it('visualizes only public ZKP verification stages', () => {
    expect(script).toContain('function publicProofPipeline(data)');
    expect(script).toContain('How This ZK Proof Was Checked');
    expect(script).toContain('This view uses public information only');
    expect(script).toContain('checks.committedHourlyExtrema');
    expect(script).toContain('checks.attestationVerified');
    expect(script).toContain('checks.midnightConfirmed');
    expect(styles).toContain('.public-proof-pipeline');
  });

  it('independently checks the public transaction and Contract state on Midnight', () => {
    expect(script).toContain('verifyPublicProofOnMidnight(data)');
    expect(script).toContain("{ state: 'checking', error: '' }");
    expect(script).toContain("chainCheckInProgress: 'Midnightを直接確認中'");
    expect(script).toContain('progress-shell dashboard-sync-progress');
    expect(publicVerifier).toContain('provider.watchForTxData(input.transactions.attest.txId)');
    expect(publicVerifier).toContain("type: 'blockHeight'");
    expect(publicVerifier).toContain('decodeLedger(contractState.data)');
    expect(publicVerifier).toContain('pureCircuits.deriveAttestationId(');
    expect(publicVerifier).toContain('state.attestations.member(attestationId)');
    expect(publicVerifier).toContain('state.policyAssignments.member(assignmentKey)');
    expect(publicVerifier).toContain('transaction.status === SucceedEntirely');
  });

  it('presents internal threshold and sensor values with approachable labels', () => {
    expect(script).toContain('function policyModeLabel(value)');
    expect(script).toContain("modeClosedRange: '最小値から最大値まで'");
    expect(script).toContain("sensorTemperature: '温度'");
    expect(script).toContain('policyModeLabel(data.policy.mode)');
    expect(script).toContain('sensorTypeLabel(data.policy.sensorType)');
  });

  it('offers previous and next day controls within the allowed generation range', () => {
    expect(script).toContain('id="device-date-previous"');
    expect(script).toContain('id="device-date-next"');
    expect(script).toContain('const shiftGenerationDate = (days) =>');
    expect(script).toContain('localStorage.setItem(\'vsp-generation-date\', nextDate)');
    expect(styles).toContain('.device-date-controls');
  });

  it('links public chain evidence to the network-specific Midnight Explorer', () => {
    expect(script).toContain("return 'https://preprod.midnightexplorer.com'");
    expect(script).toContain("if (kind === 'transaction') return `${base}/transactions/${encoded}`");
    expect(script).toContain("if (kind === 'contract') return `${base}/contracts/${encoded}`");
    expect(script).toContain("if (kind === 'block' && /^\\d+$/u.test(String(value))) return `${base}/blocks/${encoded}`");
    expect(script).toContain('target="_blank" rel="noopener noreferrer"');
    expect(script).toContain("explorerLink('transaction', data.transactions.attest?.txHash, data.network)");
    expect(midnightDevice).toContain('submittedTransactionHash = sponsored.transactionHash');
    expect(deviceFlow).toContain('txHash: result.transactionHash');
  });
});
