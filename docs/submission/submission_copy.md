# Wave 1 Submission Copy

For the current artifact inventory, September 11 validation, and remaining work, see the [final delivery summary](final_delivery.md). References to `af90ad8` and 496 tests describe the baseline recorded through September 5.

[日本語版](../ja/submission/submission_copy.md)

## Project title

BACCHIRI!━━Verifiable Measurement Layer

## One-line pitch

Prove whether sensor values are within a registered threshold without showing those values to a third party.

## Short description

BACCHIRI!━━Verifiable Measurement Layer reduces one synthetic operational day to private hourly minima and maxima and publishes a proven WITHIN, OUTSIDE, or NO DATA result for each of its 24 hours. In the Wave 1 review flow, a user-authorized browser client acts as the simulated measurement source and authorizes the Midnight transaction. The same proof model now also accepts registered cloud APIs without requiring a customer Wallet.

## Problem

Measurement results are shared through dashboards, CSV files, reports, and cloud systems. In construction, noise, vibration, temperature, and other reports are used by equipment providers, rental companies, contractors, project owners, auditors, and other organizations. Reviewers may therefore have to trust the organization or system that produced the report. This project asks a narrower cryptographic question: were the private hourly minimum and maximum values for the day within the threshold registered before operation?

## Solution

- Simulated measurement source: creates the synthetic daily record, keeps raw values and its private proof opening in the user-authorized browser client, and uploads bounded hourly summaries for the authorized operator workflow.
- Review interface: combines operator steps and a third-party view so judges can follow the complete PoC without revealing private values.
- Managed backend: stores authorized hourly summaries and workflow records, accepts proof requests, and generates proofs as a trusted Wave 1 component.
- Midnight: records the operational period and boundary, 24 hourly results, public threshold/validity, target Device Commitment, and transaction record.

![From raw-data disclosure to minimum necessary evidence](../assets/review/privacy-value-proposition-en.png)

## Why Midnight

Midnight separates private values from a result record that anyone can check. Hourly minimum/maximum values and the proof nonce remain private. The operational date/boundary, 24 hourly statuses, threshold/validity, Device Commitment, counts, and transaction record are public. The proof uses the threshold and operational-day boundary registered before operation rather than accepting different values at proof time.

## Wave 1 progress

Wave 1 produced the reviewable core-proof PoC: project-scoped proof-subject and policy registration, synthetic daily records, a fixed private 24-slot proof input, proof-request management, managed proof generation, user-authorized and service-funded Midnight transactions, and a combined operator / third-party review interface.

Post-capture engineering added a walletless registered-cloud-API path, a consolidated Server Wallet,
an Access-protected operations console with redacted audit/metrics and Discord alerts, a private
read-only Support MCP, and a separately deployed public TX-verification MCP. These operational
foundations are current capabilities; partner-period production maturity remains a Wave 2 outcome.

The repository also contains supporting field-runtime authentication, collection, transaction, packaging, and rollback code. That code is integration evidence for the next stage; Wave 1 does not claim autonomous long-running field operation or production separation of roles and applications.

Implementation baseline `af90ad8` was validated on 2026-09-04 JST:

- all 8 proof circuits compiled;
- all 496 automated tests passed;
- all workspace type checks and builds passed; and
- the Cloudflare pre-deployment check passed.

The current eight-circuit Contract was deployed on 2026-09-03 JST. Its Managed API OUTSIDE transaction produced from a day with 1,440 records is:

- Contract: 48636e2f7ae8b1705134b026ec0d5a910357cac990a60adce2c2672e1a78a732
- Transaction: [35b8a83050d910ae94862be565c718b09764e51fd69979eaff1ed3dee93bb532](https://preprod.midnightexplorer.com/transactions/35b8a83050d910ae94862be565c718b09764e51fd69979eaff1ed3dee93bb532)
- Block: 2,385,826
- Result: OUTSIDE, with 2 of 24 observed hours outside the public 10–35 °C Policy

An authenticated field Device independently produced a WITHIN record in [block 2,385,898](https://preprod.midnightexplorer.com/transactions/7e93c537e85dbc16892716429b0f426e731999775b0cef460bd4b0d358c42b40). On 2026-09-05, the public Verification MCP resolved both hashes from the public Midnight Indexer and completed all five current ledger checks without D1 or private input. Source validation and live-network records remain separate evidence; see the [current release addendum](current_release_addendum.md).

## Exact proof claim

A confirmed daily proof establishes the public result for each of the 24 hours in the registered operational day from its private minimum/maximum values and registered threshold. It also binds the day, counts, Device Commitment, policy/validity, and proof-input commitment.

It does not prove physical sensor integrity, continuous sampling, that no readings were withheld, or correct source-side aggregation. The managed backend and proof service are trusted in the current architecture. The browser queries the public Midnight Indexer directly and compares the confirmed Contract state, but it does not rerun the ZK verifier locally or expose the witness.

## Target users and adoption

The first commercial use case under discussion is construction-site measurement verification. Wave 1 verifies the temperature-measurement path. Noise, vibration, and other measurement types require their own threshold definitions, input formats, and validation rules and are not claimed as current features.

The team is discussing a field proof of concept with an industry partner using existing equipment and sales or rental channels. This is commercialization progress, not completed technical validation. The same approach may later serve cold-chain, food and pharmaceutical storage, research equipment, and regulated facilities.

## Three-stage delivery plan

- Wave 1 — Core Proof PoC: validate the privacy value with a simulated measurement source, synthetic daily records, and one review-oriented interface.
- Wave 2 — Operational Partner Pilot: connect real field measurement systems, automate daily operation, complete organization/role isolation, harden the implemented operations and support foundations under partner load, and complete a paid partner pilot.
- Wave 3 — Trust Minimization and PMF: add hardware-protected identity and provenance, operate across organizations and sites, and validate recurring revenue, renewal, expansion, and sustainable unit economics.

The browser and public MCP independently check public Midnight transaction and Contract state today. The complete product and business plan is the [three-wave roadmap](../architecture/three_wave_roadmap.md); Wave 2 and Wave 3 outcomes remain planned even though some operational foundations were implemented early.

## Submission links

- Repository: [GitHub](https://github.com/commun-platform/midnight_buildathons_private_sensor2026) (public visibility remains a submission-time external gate)
- English deck: [PPTX](deck/bacchiri-verifiable-measurement-layer-wave1-en.pptx) / [PDF](deck/bacchiri-verifiable-measurement-layer-wave1-en.pdf), synchronized with the 2:18 video pitch
- Japanese deck: [PPTX](../ja/submission/deck/bacchiri-verifiable-measurement-layer-wave1-ja.pptx) / [PDF](../ja/submission/deck/bacchiri-verifiable-measurement-layer-wave1-ja.pdf)
- Video pitch: `bacchiri-demo-pitch-en.mp4` produced (2:18); add the final public URL
- Submission thumbnail and six-shot review pack: [captures/](captures/)
- Claim-to-evidence map: [evidence_matrix.md](evidence_matrix.md)
- Current release evidence: [current_release_addendum.md](current_release_addendum.md)
- Judge review path: [README](../../README.md)

## Required pre-submission confirmations

- Replace placeholder links with public URLs.
- Freeze a review commit and record its SHA.
- Confirm repository visibility and the `midnightntwrk` GitHub topic.
- Confirm the exact AKINDO deadline time, form limits, and Official Rules.
- Publish the completed English video and add its final URL.
