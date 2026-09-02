# Judge Q&A

[日本語版](../ja/submission/judge_qa.md)

![Four questions that organize the judge review: proof, privacy, non-claims, and current verification](../assets/guides/judge-qa-map-en.png)

## In one sentence, what does the system prove?

It proves whether the private hourly minimum and maximum values for an observed day are within the registered threshold, without showing those sensor values to a third party.

## What can a third party check?

A third party can paste a transaction hash and check the UTC measurement date, 24 hourly
WITHIN/OUTSIDE/NO DATA results, applied lower/upper bounds, unit, scale, version, validity interval,
`deviceCommitment`, and the Midnight transaction/block. Raw sensor values and hourly minimum/maximum
values are not displayed.

## What does it not prove?

It does not prove that a physical sensor produced correct values, that sampling was continuous, that no readings were withheld, or that the measurement source aggregated the readings correctly. An hour with no readings is published as NO DATA; it is not automatically classified as WITHIN or fraudulent.

## Why use Midnight?

Midnight separates the information that must remain private from the result record that anyone may check. It records the public threshold, its target Device, the result, and the transaction record. It does not record sensor values or hourly minimum / maximum values.

## What is the difference between Cloudflare D1 and Midnight?

Cloudflare D1 is the database used for screen display and workflow progress. The public Midnight record is what a third party uses as the reference for the result.

## Who handles the private hourly minima and maxima?

In the Wave 1 review path, the browser-based simulated measurement source creates them and keeps the raw capture and private opening in browser-private state. Bounded hourly summaries are stored as restricted operator data in the trusted managed backend, which also handles the private proof request. They are not returned by the third-party API or stored on Midnight. End-to-end encryption that also hides them from the backend is not a current feature.

## Can the Backend authorize the transaction for the user?

No. The managed backend generates the proof but does not hold the user's transaction authority. The user-controlled account authorizes the exact call, while a separate service pays only the submission fee.

## Why normalize one day into 24 hourly slots?

It keeps the proof input format unchanged whether readings arrive hourly, every minute, or every second. Raw readings are reduced to the minimum and maximum for each hour, and the 24 hourly slots are proved in one fixed format. This does not prove that the aggregation itself was correct.

## How are hours without readings shown?

Each UTC hour is published as WITHIN, OUTSIDE, or NO DATA. The hourly extrema remain private.

## What has been verified so far?

For the current source on 2026-09-02, all 6 proof circuits compiled, 345 automated tests passed, and the type checks, builds, and Cloudflare pre-deployment check succeeded. Midnight preproduction-network evidence includes the 2026-08-28 self-funded WITHIN/OUTSIDE records and the 2026-08-30 Sponsor-funded schema-5 record. Source validation and dated network records are separate evidence.

## Can the third-party view verify independently?

Yes for the public chain evidence. Without a Wallet, private input, or D1 lookup, the browser queries the public Midnight Indexer by transaction hash, confirms the successful transaction and block, derives the called Contract, and compares its state at that block with the preceding block. It decodes the newly added Attestation, operational date/boundary, 24 hourly results, Policy/validity, presence/counts, Device Commitment, and Device-bound Assignment. The browser does not rerun the proof verifier locally or expose the witness; Midnight performed proof verification as part of accepting the transaction.

## Who holds which keys?

User transaction authority, field API identity, administrative authority, service fee authority, and deployment authority are separated. The managed backend that generates the proof does not hold the user's transaction authority.

## Can it scale to many Devices?

Each daily proof input remains fixed at 24 hourly slots, but the number of proofs grows with the number of active Devices multiplied by the number of days. The 10,000-Device figure is a planning estimate, not a completed load-test result.

## What is the adoption plan?

Wave 2 targets a paid operational pilot with an established company, using real field measurement systems in an existing business workflow. Wave 3 targets product-market fit through recurring revenue, renewal, expansion, and sustainable unit economics. Sector-specific opportunities are commercial hypotheses rather than completed field validation.
