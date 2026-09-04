# MCP Security Boundary

[日本語版](../ja/architecture/mcp_security_boundary.md)

## 1. Purpose

The system exposes two intentionally separate Model Context Protocol servers. A URL path on the
public Proof Gateway is not a security boundary: the private and public capabilities run as
different Cloudflare Workers, on different hostnames, with different bindings and Access policy.

| Worker | Audience | Endpoint | Data authority |
| --- | --- | --- | --- |
| `midnight-support-mcp` | Authorized customer-support operators | `https://midnight-support-mcp.commun-official.workers.dev/mcp` | Redacted D1 operational state only |
| `midnight-verification-mcp` | Anyone | `https://midnight-verification-mcp.commun-official.workers.dev/mcp` | Public Midnight Preprod transaction and Contract state only |

Neither Worker is a route of `midnight-proof-gateway`. There is no Service Binding between the two
MCP Workers and no private tool is compiled into the public Worker.

## 2. Private customer-support MCP

Cloudflare Access protects the entire `midnight-support-mcp.commun-official.workers.dev` host, not
only `/mcp`. The allow policy contains one approved identity,
`support@commun-platform.com`. Managed OAuth is enabled for MCP clients. The Worker then applies a
second authorization layer:

1. Validate `Cf-Access-Jwt-Assertion` with the Access team's remote JWKS.
2. Require the configured issuer, RS256 algorithm, and this application's exact audience.
3. Require an active global `viewer` or `operator` grant in `system_operator_grants`.
4. Audit each tool name, authenticated operator, outcome, and duration in `operational_events`.

This is fail-closed. A missing JWT, invalid JWT, wrong audience, absent D1 grant, unexpected host,
or unexpected browser origin is rejected before any support query executes. The Access application
is created before Worker deployment. The deploy command verifies its hostname, audience, Managed
OAuth state, and single-email policy and refuses deployment when they differ.

The private Worker has one D1 binding. It has no R2, Queue, Container, Secret, or Service Binding.
It cannot read encrypted Wallet checkpoints or start a Container. Wallet results are explicitly
the latest state previously observed and written to D1 by the operational backend.

### 2.1 Read-only tools

- `get_system_overview`: Project, Device, Policy, Proof Job, registration, and alert counts.
- `get_server_wallet_status`: last observed synchronization, DUST/NIGHT balance, phase, schedule,
  and checkpoint status.
- `get_job_statistics`: bounded daily accepted, proved, confirmed, and failed counts.
- `find_proof_jobs`: safe Proof Job status and public transaction evidence.
- `search_operational_events`: customer API and workflow trace by pseudonymous identifiers.
- `get_managed_source_status`: cloud-source and run state without source endpoints or credentials.

All tools are annotated read-only, non-destructive, and idempotent. Tool queries use explicit
column lists. They exclude Authorization values, signatures, Wallet seeds and keys, Connector
credentials, raw samples, hourly extrema, private proof inputs, signed transaction bytes, R2 object
keys, and encrypted artifacts. Tool input and output bodies are not copied into the MCP audit row.

## 3. Public transaction-verification MCP

The public Worker has no D1, R2, Queue, Container, Secret, or Service Binding. It has only a
Cloudflare Rate Limiter binding and a public allowlist of accepted Sensor Registry Contract
addresses. One tool is compiled into this Worker:

- `verify_attestation_transaction(transactionHash)`

The tool queries the public Midnight Preprod Indexer and accepts exactly one successful
`submitDailyAttestation` action from an allowlisted Contract. It decodes that transaction's public
Contract state and checks the supported schema/circuit version, registered Policy and
Device-bound Assignment, Assignment validity, operational-day boundary, 24 hourly public results,
observed-hour count, and daily result consistency.

The result means that Midnight accepted the transaction and its public Contract state contains the
supported attestation. It does not reveal or reproduce raw measurements, hourly extrema, proof
nonce, or private witness, and it does not claim to rerun proof generation outside Midnight.

The endpoint enforces an exact hostname and `/mcp` path, POST-only access, a 16 KiB request limit,
an Origin allowlist for browser clients, no-store security headers, and 60 requests per minute per
connecting IP.

The Midnight on-chain runtime is initialized through a Worker-only adapter because Cloudflare
imports `.wasm` as a `WebAssembly.Module`, while the upstream browser wrapper expects an
already-instantiated wasm namespace. Wrangler aliases only this public Worker to the adapter; the
Midnight SDK version and generated Contract artifacts remain unchanged.

## 4. Deployment order

The private Worker must never be deployed before its host-level Access application.

```bash
# Reads Cloudflare account credentials from the ignored .env file. It does not print the token.
npm run cloudflare:mcp:configure-access

# Copy the returned non-secret Access audience into
# backend/cloudflare/deployment/wrangler.support-mcp.jsonc.

npm run cloudflare:mcp:test
npm run cloudflare:mcp:build
npm run cloudflare:mcp:deploy
```

`cloudflare:mcp:deploy` re-runs the Access safety check before deploying the private Worker. The
public Worker is deployed only after that command succeeds. A Contract redeployment requires a
reviewed update to `ALLOWED_SENSOR_REGISTRY_CONTRACTS`; it does not grant the public Worker access
to D1.

## 5. Acceptance checks

- Every path on the private hostname is blocked by Access for an unauthenticated client.
- The private Worker also rejects missing or invalid Access JWTs and identities without a D1 grant.
- Private tool discovery lists only the six read-only support tools.
- Public tool discovery lists only `verify_attestation_transaction`.
- The public Worker has no operational storage or runtime bindings.
- A successful public call returns the Midnight transaction, block, Contract, Policy, Assignment,
  24 hourly results, and explicit privacy labels only.
- An invalid TX hash, failed transaction, non-allowlisted Contract, incompatible schema, or
  inconsistent public state is rejected.

Relevant Cloudflare references are [Remote MCP servers](https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/),
[Managed OAuth](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/),
[Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/),
and [WebAssembly modules in Workers](https://developers.cloudflare.com/workers/runtime-apis/webassembly/javascript/).
