# Wave 1 technical gate checklist

[日本語版](../ja/submission/technical_gate_checklist.md)

Review commit: `b72efb7d4df8384a9e8dd873b8e3a65f6e9e5fbd`
Last source validation: 2026-09-14 JST

| Gate | Status | Evidence / action |
| --- | --- | --- |
| Operational Compact contract exists | PASS | [`sensor-registry.compact`](../../midnight/contracts/sensor-registry/src/sensor-registry.compact) |
| Compact compilation | PASS | Pinned toolchain `0.31.1`; 8 circuits compile |
| Repository source tests | PASS | 524 tests across the operational workspaces |
| Managed-source mock tests | PASS | 4 tests (528 total in `npm test`) |
| Type checking | PASS | All configured workspaces |
| Source portability | PASS | `npm run verify:portability` |
| Whitespace and link checks | PASS | `git diff --check`; tracked documentation links resolve |
| Apache 2.0 license | PASS | Root [`LICENSE`](../../LICENSE) |
| Midnight attribution | PASS | Top README and architecture docs identify Compact, Midnight, and the proof boundary |
| Current deployment records | PASS | Dated Contract and transaction records in the [release addendum](current_release_addendum.md) |
| Public verification boundary | PASS | [Public verifier](../../shared/public-attestation-verifier/src/index.ts) returns public state only |
| MCP least-privilege boundary | PASS | Private Support and public Verification Workers remain separate; 3 + 11 + 5 tests |
| Reproducible source command | PASS | `npm ci && npm run verify:source` |
| GitHub source check | PASS | [Source validation workflow](../../.github/workflows/source-validation.yml) runs portability and deterministic mock-source checks on push / pull request |
| Public repository visibility | PENDING EXTERNAL | Set the repository to public before submission |
| GitHub topic `midnightntwrk` | PASS | Confirmed on the repository metadata |

## Source gate

Run from the repository root on Node.js 22 with the pinned Compact toolchain:

```bash
npm ci
npm run verify:source
git diff --check
```

The source gate compiles the operational contract, runs the workspace tests, checks TypeScript, and
checks portability. It does not use Device secrets, wallet recovery material, deployment credentials,
or a live network.

## Scope of the public records

The public transaction records in the release addendum are dated deployment evidence. They are not a
replacement for the clean-checkout source gate, and this checklist does not claim a new deployment or
Container image build. A Docker-capable host is required for the optional full deployment package gate.
