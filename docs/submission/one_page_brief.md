# BACCHIRI!━━Verifiable Measurement Layer

[日本語版](../ja/submission/one_page_brief.md)

## Customer value

**Prove whether sensor values are within a registered threshold without showing those values to a third party.**

Construction measurements are used by equipment providers, rental companies, contractors, project owners,
auditors, and other organizations. Sharing raw measurements for review can disclose more information than the
reviewer needs.

BACCHIRI!━━Verifiable Measurement Layer adds a verification layer that lets them check the result while keeping
the values private. It does not replace existing measurement equipment or management systems.

![Prove threshold compliance while keeping sensor values private](../assets/review/privacy-value-proposition-en.png)

## What remains private and what is public

| Not public | Public |
| --- | --- |
| Raw sensor values | Operational date / registered day boundary and `deviceCommitment` |
| Hourly minimum / maximum values | Threshold: bounds, unit, scale, version, and validity |
| Proof nonce | 24 hourly WITHIN / OUTSIDE / NO DATA results and counts |
| Device signing key and wallet information | Midnight transaction and block record |

## How it works

1. A user-authorized client creates a daily measurement record and keeps raw values plus the private opening in its private state.
2. The client reduces readings to 24 hourly slots and uploads bounded summaries for the authorized operator workflow.
3. The trusted managed backend stores those restricted summaries and generates the proof.
4. The user authorizes the transaction while the service handles its fee through the Server Wallet.
5. Midnight records all 24 hourly results, policy/validity, Device Commitment, and transaction evidence for inspection.

## Verified at the review target

- All 8 proof circuits compile with Compact toolchain `0.31.1`.
- 524 operational workspace tests and 4 managed-source mock tests pass (528 total).
- Type checks, portability checks, and the reproducible source gate pass.
- The current eight-circuit Contract is deployed on Midnight Preprod.
- Dated records include a managed OUTSIDE day and an authenticated Device WITHIN day, each reduced to one 24-slot proof.
- Public Verification MCP resolves transaction hashes from the public Midnight Indexer without returning private values.

## What this proof alone cannot establish

It does not prove that a physical sensor produced correct values, that sampling continued for 24 hours, or that
a measurement source aggregated readings correctly. The trusted managed backend handles hourly minima and maxima
while generating the proof. The public verifier compares public Midnight state and does not rerun the ZK verifier locally.

## Adoption path

Wave 1 validates the core proof as a review-oriented PoC and includes managed-intake and operations foundations.
Wave 2 connects real field systems, automates daily operation, completes organization/role isolation, validates
those controls under partner load, and targets a paid pilot. Wave 3 reduces source trust through hardware-protected
identity and provenance, then targets product-market fit through recurring revenue and sustainable unit economics.
See the [canonical roadmap](../architecture/three_wave_roadmap.md).

Technical references are collected in the [repository review guide](README.md), [claim matrix](evidence_matrix.md),
and [current release addendum](current_release_addendum.md).
