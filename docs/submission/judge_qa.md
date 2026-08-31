# Judge Q&A

[日本語版](../ja/submission/judge_qa.md)

![Four questions that organize the judge review: proof, privacy, non-claims, and current verification](../assets/guides/judge-qa-map-en.png)

## In one sentence, what does the system prove?

It proves whether the private hourly minimum and maximum values for an observed day are within the registered threshold, without showing those sensor values to a third party.

## What can a third party check?

A third party can check the day, target Device, public threshold, observed hours and counts, the WITHIN / OUTSIDE / STOPPED result, and the Midnight transaction record. Raw sensor values and hourly minimum / maximum values are not displayed.

## What does it not prove?

It does not prove that the physical sensor produced correct values, that sampling was continuous, that no readings were withheld, or that the Edge Device aggregated the readings correctly. An hour with no readings is published as STOPPED; it is not automatically classified as WITHIN or fraudulent.

## Why use Midnight?

Midnight separates the information that must remain private from the result record that anyone may check. It records the public threshold, its target Device, the result, and the transaction record. It does not record sensor values or hourly minimum / maximum values.

## What is the difference between Cloudflare D1 and Midnight?

Cloudflare D1 is the database used for screen display and workflow progress. The public Midnight record is what a third party uses as the reference for the result.

## Who handles the private hourly minima and maxima?

The Edge Device creates them, and the trusted Backend handles them only while generating the proof. They are not returned to the browser or stored on Midnight. End-to-end encryption that also hides them from the Backend is not a current feature.

## Can the Backend sign the transaction for the Device?

No. The Backend generates the proof but does not hold the Device transaction signing key. The Edge Device signs the Midnight transaction.

## Why normalize one day into 24 hourly slots?

It keeps the proof input format unchanged whether readings arrive hourly, every minute, or every second. Raw readings are reduced to the minimum and maximum for each hour, and the 24 hourly slots are proved in one fixed format. This does not prove that the aggregation itself was correct.

## How are hours without readings shown?

Each hour is recorded as either observed or STOPPED. A third party can check which hours were observed and how many hours were stopped.

## What has been verified so far?

For the current source on 2026-08-31, all 6 proof circuits compiled, 287 automated tests passed, and the type checks, builds, and Cloudflare pre-deployment check succeeded. Midnight preproduction-network evidence includes the 2026-08-28 self-funded WITHIN/OUTSIDE records and the 2026-08-30 Sponsor-funded schema-5 record. Source validation and dated network records are separate evidence.

## Can the third-party view verify independently?

Yes for the public chain evidence. Without a Wallet or private input, the browser directly queries the public Midnight Indexer, matches the successful transaction and block, decodes the Contract Ledger at that block, and compares the commitment, verified result, Policy, presence/counts, and Device-bound Assignment. It does not rerun the proof verifier locally or expose the witness; Midnight performed proof verification as part of accepting the transaction.

## Who holds which keys?

The Device API authentication key, Midnight transaction signing key, administrator key, and deployment wallet are separated. The Backend that generates the proof does not hold the Device transaction signing key.

## Can it scale to many Devices?

Each daily proof input remains fixed at 24 hourly slots, but the number of proofs grows with the number of active Devices multiplied by the number of days. The 10,000-Device figure is a planning estimate, not a completed load-test result.

## Where will it be deployed first?

The first planned field trial is construction-site measurement verification. The team is discussing a field proof of concept with an industry partner using existing measurement equipment and sales or rental channels. This is commercialization progress, not a completed technical field trial.
