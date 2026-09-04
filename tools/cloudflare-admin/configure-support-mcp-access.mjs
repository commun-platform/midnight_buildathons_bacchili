import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '../..');
const envPath = path.join(repoRoot, '.env');
const wranglerConfigPath = path.join(
  repoRoot,
  'backend/cloudflare/deployment/wrangler.support-mcp.jsonc',
);

const applicationName = 'Midnight customer support MCP';
const applicationDomain = 'midnight-support-mcp.commun-official.workers.dev';
const policyName = 'Midnight customer support MCP - support access';
const supportEmail = 'support@commun-platform.com';
const checkOnly = process.argv.slice(2).includes('--check');

function localEnvironment() {
  const result = { ...process.env };
  if (!fs.existsSync(envPath)) return result;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/u)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/u);
    if (!match || result[match[1]]) continue;
    const raw = match[2].trim();
    result[match[1]] = (
      (raw.startsWith('"') && raw.endsWith('"'))
      || (raw.startsWith("'") && raw.endsWith("'"))
    ) ? raw.slice(1, -1) : raw.replace(/\s+#.*$/u, '').trim();
  }
  return result;
}

function configuredWorker() {
  const config = JSON.parse(fs.readFileSync(wranglerConfigPath, 'utf8'));
  return {
    audience: String(config.vars?.CLOUDFLARE_ACCESS_AUDIENCE ?? '').trim(),
    host: String(config.vars?.SUPPORT_MCP_HOST ?? '').trim().toLowerCase(),
  };
}

function policyAllowsOnlySupportEmail(policy) {
  if (
    policy?.decision !== 'allow'
    || policy?.name !== policyName
    || !Array.isArray(policy.include)
    || policy.include.length !== 1
  ) return false;
  return String(policy.include[0]?.email?.email ?? '').toLowerCase() === supportEmail;
}

function validateApplication(application, expectedAudience) {
  const failures = [];
  if (application?.name !== applicationName) failures.push('application name');
  if (application?.domain !== applicationDomain) failures.push('protected host');
  if (application?.type !== 'self_hosted') failures.push('application type');
  if (!application?.aud) failures.push('Access audience');
  if (application?.oauth_configuration?.enabled !== true) failures.push('Managed OAuth');
  if (
    !Array.isArray(application?.policies)
    || application.policies.length !== 1
    || !policyAllowsOnlySupportEmail(application.policies[0])
  ) failures.push('single-email allow policy');
  if (
    expectedAudience
    && expectedAudience !== 'SET_AFTER_PRIVATE_ACCESS_APPLICATION_CREATION'
    && application?.aud !== expectedAudience
  ) failures.push('Worker audience');
  if (failures.length > 0) {
    throw new Error(`Private MCP Access configuration is unsafe or inconsistent: ${failures.join(', ')}`);
  }
}

async function cloudflareRequest(environment, pathname, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${environment.CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const payload = await response.json();
  if (!response.ok || payload?.success !== true) {
    const messages = Array.isArray(payload?.errors)
      ? payload.errors.map((error) => error?.message || error?.code).filter(Boolean).join('; ')
      : '';
    throw new Error(`Cloudflare Access API failed (${response.status})${messages ? `: ${messages}` : ''}`);
  }
  return payload.result;
}

const environment = localEnvironment();
if (!environment.CLOUDFLARE_ACCOUNT_ID || !environment.CLOUDFLARE_API_TOKEN) {
  throw new Error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in the ignored .env file');
}
const configured = configuredWorker();
if (configured.host !== applicationDomain) {
  throw new Error(
    `SUPPORT_MCP_HOST must match the protected Access host: ${applicationDomain}`,
  );
}

const accountPath = `/accounts/${encodeURIComponent(environment.CLOUDFLARE_ACCOUNT_ID)}`;
const applications = await cloudflareRequest(
  environment,
  `${accountPath}/access/apps?per_page=100`,
);
const matchingApplications = applications.filter(
  (application) => application.domain === applicationDomain,
);
if (matchingApplications.length > 1) {
  throw new Error(`Multiple Access applications protect ${applicationDomain}; refusing deployment`);
}

let application = matchingApplications[0];
if (!application && checkOnly) {
  throw new Error(`Create the dedicated Access application first: npm run cloudflare:mcp:configure-access`);
}
if (!application) {
  application = await cloudflareRequest(environment, `${accountPath}/access/apps`, {
    method: 'POST',
    body: JSON.stringify({
      name: applicationName,
      type: 'self_hosted',
      domain: applicationDomain,
      session_duration: '24h',
      app_launcher_visible: false,
      http_only_cookie_attribute: true,
      same_site_cookie_attribute: 'strict',
      oauth_configuration: {
        enabled: true,
        dynamic_client_registration: {
          enabled: true,
          allow_any_on_localhost: true,
          allow_any_on_loopback: true,
          allowed_uris: ['https://playground.ai.cloudflare.com/*'],
        },
        grant: {
          access_token_lifetime: '15m',
          session_duration: '336h',
        },
      },
      policies: [
        {
          name: policyName,
          decision: 'allow',
          precedence: 1,
          include: [{ email: { email: supportEmail } }],
        },
      ],
    }),
  });
  process.stdout.write(`Created Access protection for ${applicationDomain}.\n`);
}

validateApplication(application, configured.audience);
process.stdout.write(`Access application verified. Audience: ${application.aud}\n`);
if (configured.audience === 'SET_AFTER_PRIVATE_ACCESS_APPLICATION_CREATION') {
  process.stdout.write(
    'Set this Audience in wrangler.support-mcp.jsonc before deploying the private Worker.\n',
  );
  if (checkOnly) process.exitCode = 1;
}
