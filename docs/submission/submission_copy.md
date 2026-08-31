# Wave 1 Submission Copy

[日本語版](../ja/submission/submission_copy.md)

## Project title

BACCHIRI!━━Verifiable Measurement Layer

## One-line pitch

Prove whether sensor values are within a registered threshold without showing those values to a third party.

## Short description

BACCHIRI!━━Verifiable Measurement Layer reduces one synthetic day of measurements to hourly minima and maxima and creates a threshold result while keeping those values private. In the Wave 1 review flow, a user-authorized browser client acts as the simulated measurement source and authorizes the Midnight transaction. The public record is WITHIN or OUTSIDE; an hour with no measurements is STOPPED rather than silently treated as WITHIN.

## Problem

Measurement results are shared through dashboards, CSV files, reports, and cloud systems. In construction, noise, vibration, temperature, and other reports are used by equipment providers, rental companies, contractors, project owners, auditors, and other organizations. Reviewers may therefore have to trust the organization or system that produced the report. This project asks a narrower cryptographic question: were the private hourly minimum and maximum values for the day within the threshold registered before operation?

## Solution

- Simulated measurement source: creates the synthetic daily record, keeps raw values and its private proof opening in the user-authorized browser client, and uploads bounded hourly summaries for the authorized operator workflow.
- Review interface: combines operator steps and a third-party view so judges can follow the complete PoC without revealing private values.
- Managed backend: stores authorized hourly summaries and workflow records, accepts proof requests, and generates proofs as a trusted Wave 1 component.
- Midnight: records the public threshold, its target Device, the confirmed result, and the transaction record.

![From raw-data disclosure to minimum necessary evidence](../assets/review/privacy-value-proposition-en.png)

## Why Midnight

Midnight separates private values from a result record that anyone can check. Hourly minimum / maximum values and the proof nonce remain private. The day, threshold, target Device, observed hours, counts, result, and transaction record are public. The proof uses the threshold registered before operation rather than accepting a different threshold at proof time.

## Wave 1 progress

Wave 1 produced the reviewable core-proof PoC: project-scoped proof-subject and policy registration, synthetic daily records, a fixed private 24-slot proof input, proof-request management, managed proof generation, user-authorized and service-funded Midnight transactions, and a combined operator / third-party review interface.

The repository also contains supporting field-runtime authentication, collection, transaction, packaging, and rollback code. That code is integration evidence for the next stage; Wave 1 does not claim autonomous long-running field operation or production separation of roles and applications.

The current working source was validated on 2026-08-31 JST:

- all 6 proof circuits compiled;
- all 288 automated tests passed;
- all workspace type checks and builds passed; and
- the Cloudflare pre-deployment check passed.

Midnight preproduction-network records from 2026-08-28 JST include both WITHIN and OUTSIDE. The OUTSIDE transaction produced from a day with 1,440 readings is:

- Contract: 8338d5588fe5662fce86ce3c221f0bd5260a14cdbf372c1dddd58be41e5b3c68
- Transaction: 00e12efda5f33b4804f3659a811d2f5e86c9ce838255a63028d41df85cb0762da9
- Block: 2,302,213

Source validation and dated Midnight preproduction-network records remain separate evidence. The current Worker and GUI were deployed on 2026-08-31 JST; no new daily attestation was manufactured merely to update this document.

## Exact proof claim

A confirmed daily proof establishes that the private minimum and maximum values for every observed hour are within the registered threshold, or that at least one observed hour is outside it. It also binds the day, observed hours, counts, target Device, registered threshold, and proof-input commitment.

It does not prove physical sensor integrity, continuous sampling, that no readings were withheld, or correct source-side aggregation. The managed backend and proof service are trusted in the current architecture. The browser queries the public Midnight Indexer directly and compares the confirmed Contract state, but it does not rerun the ZK verifier locally or expose the witness.

## Target users and adoption

The first commercial use case under discussion is construction-site measurement verification. Wave 1 verifies the temperature-measurement path. Noise, vibration, and other measurement types require their own threshold definitions, input formats, and validation rules and are not claimed as current features.

The team is discussing a field proof of concept with an industry partner using existing equipment and sales or rental channels. This is commercialization progress, not completed technical validation. The same approach may later serve cold-chain, food and pharmaceutical storage, research equipment, and regulated facilities.

## Three-stage delivery plan

- Wave 1 — Core Proof PoC: validate the privacy value with a simulated measurement source, synthetic daily records, and one review-oriented interface.
- Wave 2 — Operational Partner Pilot: connect real field measurement systems, automate daily operation, separate roles and interfaces, add production authorization, audit, diagnostics, monitoring, recovery, and complete a paid partner pilot.
- Wave 3 — Trust Minimization and PMF: add hardware-protected identity and provenance, operate across organizations and sites, and validate recurring revenue, renewal, expansion, and sustainable unit economics.

The browser independently checks public Midnight transaction and Contract state today. The complete product and business plan is the [three-wave roadmap](../architecture/three_wave_roadmap.md); Wave 2 and Wave 3 are planned rather than current capabilities.

## Submission links

- Repository: add the final public GitHub URL
- English deck: [PPTX](deck/bacchiri-verifiable-measurement-layer-wave1-en.pptx) / [PDF](deck/bacchiri-verifiable-measurement-layer-wave1-en.pdf), synchronized with the 2:18 video pitch
- Japanese deck: [PPTX](../ja/submission/deck/bacchiri-verifiable-measurement-layer-wave1-ja.pptx) / [PDF](../ja/submission/deck/bacchiri-verifiable-measurement-layer-wave1-ja.pdf)
- Video pitch: `bacchiri-demo-pitch-en.mp4` produced (2:18); add the final public URL
- Submission thumbnail and six-shot review pack: [captures/](captures/)
- Claim-to-evidence map: [evidence_matrix.md](evidence_matrix.md)
- Judge review path: [README](../../README.md)

## Required pre-submission confirmations

- Replace placeholder links with public URLs.
- Freeze a review commit and record its SHA.
- Confirm repository visibility and the `midnightntwrk` GitHub topic.
- Confirm the exact AKINDO deadline time, form limits, and Official Rules.
- Publish the completed English video and add its final URL.
