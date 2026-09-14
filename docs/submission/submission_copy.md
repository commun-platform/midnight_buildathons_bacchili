# Wave 1 submission copy

[日本語版](../ja/submission/submission_copy.md)

## Project title

BACCHIRI!━━Verifiable Measurement Layer

## One-line pitch

Prove whether sensor values are within a registered threshold without showing those values to a third party.

## Short description

BACCHIRI!━━Verifiable Measurement Layer reduces one operational day to private hourly minima and maxima,
then publishes a proven WITHIN, OUTSIDE, or NO DATA result for each of its 24 hours. A user-authorized
client creates the measurement record and authorizes the Midnight transaction; an authorized managed
source follows the same proof and Server Wallet flow.

## Problem

Measurement results are shared through dashboards, CSV files, reports, and cloud systems. In construction,
noise, vibration, temperature, and other reports are used by equipment providers, rental companies,
contractors, project owners, auditors, and other organizations. Reviewers may therefore have to trust the
organization or system that produced the report. This project asks a narrower cryptographic question: were
the private hourly minimum and maximum values for the day within the threshold registered before operation?

## Solution

- **Measurement source:** creates the daily record, keeps raw values and the private proof opening in the
  authorized client, and uploads bounded hourly summaries for the operator workflow.
- **Review interface:** combines operator steps and a third-party view so the complete proof flow is easy to inspect.
- **Managed backend:** stores authorized summaries and workflow records, accepts proof requests, and generates proofs as a trusted component.
- **Midnight:** records the operational period and boundary, 24 hourly results, public threshold/validity,
  target Device Commitment, counts, and transaction record.

![From raw-data disclosure to minimum necessary evidence](../assets/review/privacy-value-proposition-en.png)

## Why Midnight

Midnight separates private values from a result record that anyone can check. Hourly minimum/maximum values
and the proof nonce remain private. The operational date/boundary, 24 hourly statuses, threshold/validity,
Device Commitment, counts, and transaction record are public. The proof uses the threshold and operational-day
boundary registered before operation rather than accepting different values at proof time.

## Wave 1 progress

Wave 1 produced the core-proof PoC: project-scoped proof-subject and policy registration, synthetic daily
records, a fixed private 24-slot proof input, proof-request management, managed proof generation,
user-authorized and service-funded Midnight transactions, and a combined operator / third-party review interface.

Current capabilities also include a registered managed intake path, a consolidated Server Wallet, an
Access-protected operations console with redacted audit/metrics and Discord alerts, a private read-only
Support MCP, and a separately deployed public transaction-verification MCP. Partner-period production
maturity remains a Wave 2 outcome.

The repository contains supporting field-runtime authentication, collection, transaction, packaging, and
rollback code. That code is integration evidence for the next stage; Wave 1 does not claim autonomous
long-running field operation or production separation of roles and applications.

Review commit `b72efb7d4df8384a9e8dd873b8e3a65f6e9e5fbd` was validated on 2026-09-14 JST:

- all 8 proof circuits compiled;
- 524 operational workspace tests and 4 managed-source mock tests passed (528 total);
- all workspace type checks and portability checks passed; and
- the source gate is reproducible with `npm ci && npm run verify:source`.

The current eight-circuit Contract was deployed on 2026-09-03 JST. Its Managed API OUTSIDE transaction is
[35b8a83050d910ae94862be565c718b09764e51fd69979eaff1ed3dee93bb532](https://preprod.midnightexplorer.com/transactions/35b8a83050d910ae94862be565c718b09764eaff1ed3dee93bb532)
(block 2,385,826). An authenticated field Device independently produced a WITHIN record in
[block 2,385,898](https://preprod.midnightexplorer.com/transactions/7e93c537e85dbc16892716429b0f426e731999775b0cef460bd4b0d358c42b40).
The public Verification MCP resolved both hashes from the public Indexer. Source validation and live-network
records remain separate evidence; see the [current release addendum](current_release_addendum.md).

## Exact proof claim

A confirmed daily proof establishes the public result for each of the 24 hours in the registered operational
day from its private minimum/maximum values and registered threshold. It also binds the day, counts, Device
Commitment, policy/validity, and proof-input commitment.

It does not prove physical sensor integrity, continuous sampling, that no readings were withheld, or correct
source-side aggregation. The managed backend and proof service are trusted in the current architecture. The
public verifier compares confirmed Contract state but does not rerun the ZK verifier locally or expose the witness.

## Target users and adoption

The first commercial use case under discussion is construction-site measurement verification. Wave 1 verifies
the temperature-measurement path. Noise, vibration, and other measurement types require their own threshold
definitions, input formats, and validation rules and are not claimed as current features.

The team is discussing a field proof of concept with an industry partner using existing equipment and sales
or rental channels. This is commercialization progress, not completed technical validation. The same approach
may later serve cold-chain, food and pharmaceutical storage, research equipment, and regulated facilities.

## Three-stage delivery plan

- **Wave 1 — Core Proof PoC:** validate the privacy value with a simulated measurement source, synthetic daily records, and one review-oriented interface.
- **Wave 2 — Operational Partner Pilot:** connect real field measurement systems, automate daily operation, complete organization/role isolation, harden operations and support foundations under partner load, and complete a paid partner pilot.
- **Wave 3 — Trust Minimization and PMF:** add hardware-protected identity and provenance, operate across organizations and sites, and validate recurring revenue, renewal, expansion, and sustainable unit economics.

The complete product and business plan is the [three-wave roadmap](../architecture/three_wave_roadmap.md). Wave 2
and Wave 3 outcomes remain planned even though some operational foundations were implemented early.

## Repository references

- Repository: [GitHub](https://github.com/commun-platform/midnight_buildathons_private_sensor2026)
- [Claim-to-evidence map](evidence_matrix.md)
- [Current release evidence](current_release_addendum.md)
- [Technical gate checklist](technical_gate_checklist.md)
- [Judge review guide](README.md)

Repository visibility, the `midnightntwrk` topic, and the final submission form fields are checked at submission time.
