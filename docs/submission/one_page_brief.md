# BACCHIRI!━━Verifiable Measurement Layer

## Customer value

**Prove whether sensor values are within a registered threshold without showing those values to a third party.**

Construction measurement results are used by equipment providers, rental companies, contractors, project owners, auditors, and other organizations. Sharing raw measurements for review can disclose more information than the reviewer needs.

BACCHIRI!━━Verifiable Measurement Layer adds a verification layer that lets them check the result while keeping the values private. It does not replace existing measurement equipment or management systems.

![Prove threshold compliance while keeping sensor values private](../assets/review/privacy-value-proposition-en.png)

## What remains private and what is public

| Not public | Public |
| --- | --- |
| Raw sensor values | UTC measurement date and `deviceCommitment` |
| Hourly minimum / maximum values | Threshold: bounds, unit, scale, version, and validity |
| Proof nonce | 24 hourly WITHIN / OUTSIDE / NO DATA results and counts |
| Device signing key and wallet information | Midnight transaction and block record |

## How it works

1. A user-authorized browser client acts as the simulated measurement source and creates a synthetic daily record.
2. It keeps raw values and the private opening in browser-private state, reduces the readings to 24 hourly slots, and uploads bounded summaries for the authorized operator workflow.
3. The trusted managed backend stores those restricted summaries, accepts the request, and generates the proof without publishing the values to third parties.
4. The user authorizes the transaction while the service handles its fee.
5. Midnight records all 24 hourly results, policy/validity, Device Commitment, and transaction evidence for third-party inspection.

## Verified in Wave 1

- All 6 proof circuits compile.
- All 448 automated tests pass across 9 workspaces and the mock counterpart service.
- Type checks, builds, and the Cloudflare pre-deployment check pass.
- Midnight preproduction-network records from 2026-08-28 include both WITHIN and OUTSIDE.
- A day with 1,440 readings is reduced to one daily proof with 24 hourly slots.

## What this proof alone cannot establish

It does not prove that a physical sensor produced correct values, that sampling continued for 24 hours, or that a measurement source aggregated the readings correctly. In the current architecture, the trusted managed backend handles hourly minimum / maximum values while generating the proof.

The third-party view directly compares public Midnight transaction and Contract state. Browser-local proof-verifier execution and multi-source Indexer comparison remain planned for Wave 2.

## Adoption path

Wave 1 validates the core proof as a review-oriented PoC. Wave 2 connects real field measurement systems, automates daily operation, separates roles and interfaces, adds production operations controls, and targets a paid pilot with an established business partner. Wave 3 reduces source trust through hardware-protected identity and provenance, then targets product-market fit through recurring revenue, renewal, expansion, and sustainable unit economics. See the [canonical roadmap](../architecture/three_wave_roadmap.md).

Repository, deck, and video URLs will be added after the final public release.
