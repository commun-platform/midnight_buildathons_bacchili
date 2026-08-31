# Wave 1 Submission Copy

[日本語版](../ja/submission/submission_copy.md)

## Project title

BACCHIRI!━━Verifiable Measurement Layer

## One-line pitch

Prove whether sensor values are within a registered threshold without showing those values to a third party.

## Short description

BACCHIRI!━━Verifiable Measurement Layer reduces one day of Edge Device measurements to an hourly minimum and maximum and creates a threshold result while keeping the values private. Raw measurements remain on the Edge Device. After the proof is generated, the Edge Device signs the Midnight transaction and records a WITHIN or OUTSIDE result. An hour with no measurements is published as STOPPED rather than treated as WITHIN.

## Problem

Measurement results are shared through dashboards, CSV files, reports, and cloud systems. In construction, noise, vibration, temperature, and other reports are used by equipment providers, rental companies, contractors, project owners, auditors, and other organizations. Reviewers may therefore have to trust the organization or system that produced the report. This project asks a narrower cryptographic question: were the private hourly minimum and maximum values for the day within the threshold registered before operation?

## Solution

- Edge Device: keeps raw sensor values and hourly minimum / maximum values, authenticates to the API, and signs Midnight transactions.
- Frontend: provides an administrator workflow and a third-party view that does not reveal private values.
- Backend: authenticates Devices, accepts proof requests, stores public workflow records, and generates proofs.
- Midnight: records the public threshold, its target Device, the confirmed result, and the transaction record.

![From raw-data disclosure to minimum necessary evidence](../assets/review/privacy-value-proposition-en.png)

## Why Midnight

Midnight separates private values from a result record that anyone can check. Hourly minimum / maximum values and the proof nonce remain private. The day, threshold, target Device, observed hours, counts, result, and transaction record are public. The proof uses the threshold registered before operation rather than accepting a different threshold at proof time.

## Wave 1 progress

Wave 1 produced the daily threshold proof, multi-Device registration, a public threshold bound to its target Device, Device API authentication, Device signing of Midnight transactions, proof-request management, Cloudflare proof generation, administrator and third-party views, and a versioned Device package with rollback.

The current working source was validated on 2026-08-29 JST:

- all 6 proof circuits compiled;
- all 287 automated tests passed;
- all workspace type checks and builds passed; and
- the Cloudflare pre-deployment check passed.

Midnight preproduction-network records from 2026-08-28 JST include both WITHIN and OUTSIDE. The OUTSIDE transaction produced from a day with 1,440 readings is:

- Contract: 8338d5588fe5662fce86ce3c221f0bd5260a14cdbf372c1dddd58be41e5b3c68
- Transaction: 00e12efda5f33b4804f3659a811d2f5e86c9ce838255a63028d41df85cb0762da9
- Block: 2,302,213

Source validation and dated Midnight preproduction-network records remain separate evidence. The current Worker and GUI were deployed on 2026-08-31 JST; no new daily attestation was manufactured merely to update this document.

## Exact proof claim

A confirmed daily proof establishes that the private minimum and maximum values for every observed hour are within the registered threshold, or that at least one observed hour is outside it. It also binds the day, observed hours, counts, target Device, registered threshold, and proof-input commitment.

It does not prove physical sensor integrity, continuous sampling, that no readings were withheld, or correct Edge Device aggregation. The Backend and Proof Server are trusted in the current architecture. The browser now queries the public Midnight Indexer directly and compares the confirmed Contract state, but it does not rerun the ZK verifier locally or expose the witness.

## Target users and adoption

The first commercial use case under discussion is construction-site measurement verification. Wave 1 verifies the temperature-measurement path. Noise, vibration, and other measurement types require their own threshold definitions, input formats, and validation rules and are not claimed as current features.

The team is discussing a field proof of concept with an industry partner using existing equipment and sales or rental channels. This is commercialization progress, not completed technical validation. The same approach may later serve cold-chain, food and pharmaceutical storage, research equipment, and regulated facilities.

## Three-stage delivery plan

- Wave 1 — verified: Device-authenticated daily proof, one day normalized into 24 hourly slots, WITHIN / OUTSIDE confirmed on the Midnight preproduction network, and administrator / third-party views.
- Wave 2 — planned: local/multi-source verification hardening, signed provenance proof, operational automation, recovery, and multi-Device monitoring.
- Wave 3 — planned: calibrated-device proof, firmware identity, secure-hardware integration, and cross-organization audit.

The browser independently checks public Midnight transaction and Contract state today. Local proof-verifier execution, calibration, and firmware binding remain planned rather than current capabilities.

## Submission links

- Repository: add the final public GitHub URL
- English deck: [PPTX](deck/bacchiri-verifiable-measurement-layer-wave1-en.pptx) / [PDF](deck/bacchiri-verifiable-measurement-layer-wave1-en.pdf)
- Japanese deck: [PPTX](../ja/submission/deck/bacchiri-verifiable-measurement-layer-wave1-ja.pptx) / [PDF](../ja/submission/deck/bacchiri-verifiable-measurement-layer-wave1-ja.pdf)
- Video pitch: `bacchiri-demo-pitch-en.mp4` produced (2:18); add the final public URL
- Claim-to-evidence map: [evidence_matrix.md](evidence_matrix.md)
- Judge review path: [README](../../README.md)

## Required pre-submission confirmations

- Replace placeholder links with public URLs.
- Freeze a review commit and record its SHA.
- Confirm repository visibility and the `midnightntwrk` GitHub topic.
- Confirm the exact AKINDO deadline time, form limits, and Official Rules.
- Publish the completed English video and add its final URL.
