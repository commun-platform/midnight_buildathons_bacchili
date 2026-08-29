# Wave 1 Judging Deliverables Plan

[日本語版](../ja/submission/deliverables_plan.md)

This is the production brief for the Wave 1 submission. The central message is:

> Show a third party that submitted sensor values are within the registered threshold without disclosing the sensor values.

![The submission's central value: threshold verification without disclosing sensor values](../assets/review/privacy-value-proposition-en.png)

## Requirements and gates

| Requirement | Deliverable | Completion gate |
| --- | --- | --- |
| Public GitHub repository | Repository, top README, license, topic | Publicly accessible with the midnightntwrk topic |
| Clear README | Top README and detailed guides | Covers project, setup, architecture, Midnight integration, and evaluation |
| Slide deck | Separate English and Japanese 16:9 decks: ten core slides plus two technical appendices | Claims and evidence match the repository |
| Demo / video pitch | Separate English and Japanese versions | Shows UI, proof flow, public evidence, and engineering results |
| Wave progress | Dated progress record | Distinguishes pre-existing work from Wave 1 additions |
| Compiling Compact contract | Technical-gate evidence | sensor-registry compiles with the pinned toolchain |
| Apache 2.0 Midnight code | License audit | Scope and attribution are explicit |
| Tests and simulations | Evidence matrix | Core success and rejection cases are reproducible |

Recheck the exact submission time, field limits, upload constraints, and Official Rules on AKINDO immediately before submission.

## Rubric strategy

| Category | Weight | Primary evidence |
| --- | ---: | --- |
| Engineering & Implementation | 40% | Proof-circuit compilation, private-input boundary, four-domain architecture, and Midnight preproduction-network transaction |
| QA & Reliability | 15% | Tests, tamper rejection, fixed 24-slot input, reproducible runbook |
| Product & Vision | 15% | Privacy problem, target users, realistic roadmap |
| UX & Design | 15% | Operator UI, public verifier, clear state and evidence |
| Communication | 10% | Focused deck, concise demo, consistent technical diagrams |
| Business Viability | 5% | Target sectors, adoption path, measured cost model |

## P0 artifact set

1. Submission copy with title, value, problem, solution, why Midnight, progress, and links.
2. Judge-ready README with 30-second, three-minute, and ten-minute reading paths.
3. Separate English and Japanese decks with a ten-slide core story and two technical appendix sequence diagrams.
4. Separate approximately 3:30 English and Japanese demo videos.
5. Scene-level demo script and capture list.
6. Evidence matrix connecting each claim to source, tests, runtime proof, and validation boundary.
7. Dated Wave 1 progress record.
8. Technical-gate checklist for compile, tests, license, repository visibility, and topic.

Supporting artifacts should include a screenshot pack, judge Q&A, one-page brief, and a release snapshot tied to a commit and checksums.

## Core deck and technical appendix

| # | Slide | Core message |
| ---: | --- | --- |
| 1 | Title / Value | Daily compliance evidence without publishing raw readings |
| 2 | Problem | Useful evidence normally exposes too much telemetry |
| 3 | How the Proof Is Made | Sensor values → hourly MIN / MAX → ZK threshold check → public result |
| 4 | Exact Claim | What is proven and explicitly not proven |
| 5 | Architecture | Edge Device / Frontend / Backend / Midnight |
| 6 | Why Midnight | Private hourly values, public threshold, public result, and storage / disclosure table |
| 7 | End-to-End Flow | Collection through confirmed daily attestation |
| 8 | Working Product | Operator UI and third-party verification view |
| 9 | Evidence | Compilation, tests, Midnight preproduction-network record, rejection cases, and cost |
| 10 | Progress / Roadmap | Wave 1 delta, next wave, audience, and adoption path |
| A | Device Identity → API Session | P-256 Challenge, public JWK, opaque Bearer Session, and non-recipients |
| B | Private Values → Public Result | Bearer Session, Contract Authority, Device Wallet, Backend prover, and Midnight result |

The ten-slide core story minimizes cognitive load: customer value first, then the simple hourly MIN / MAX proof specification, with cryptographic and operational detail later. The key and Session sequences are appendices, not prerequisites for understanding the product. Use a restrained technical visual system: dark navy, slate, white, Midnight purple, muted green for WITHIN, and amber or red for OUTSIDE.

## Demo storyboard

![The six review steps that the final English and Japanese videos must show](../assets/guides/judge-review-path-en.png)

| Time | Scene | Evidence shown |
| --- | --- | --- |
| 0:00–0:20 | Hook | Product result and one-line value |
| 0:20–0:45 | Problem | Privacy versus auditability |
| 0:45–1:15 | Architecture | Four responsibility domains |
| 1:15–1:45 | Private input | Claim boundary and data location |
| 1:45–2:35 | Live flow | Policy, proof job, device signature, transaction |
| 2:35–2:55 | Public verification | Public evidence and Midnight identifiers |
| 2:55–3:15 | Engineering proof | Compilation, tests, dated Midnight record, and benchmark |
| 3:15–3:30 | Progress / vision | Wave 1 results and next step |

Include one OUTSIDE or tamper-rejection path. Prerecorded fallback captures must be tied to the same commit and labeled honestly.

## Evidence and README

The initial evidence set covers local raw-data retention, the threshold registered before operation, private hourly minimum / maximum values, WITHIN / OUTSIDE, STOPPED hours, key separation, a proof server that cannot sign for the Device, public-only browser responses, 1,440 readings/day, and proof-circuit compilation. Each row must include date, command, commit SHA, publishable evidence, and validation boundary.

The top README should cover value, problem, exact claim, four-domain architecture, Midnight integration, demo, quick verification, evidence and limitations, repository map, detailed guides, Wave 1 progress, roadmap, license, attribution, and topic.

## Production and completion

![Wave 1 validated scope and the planned Wave 2 and Wave 3 expansion](../assets/review/three-wave-roadmap-en.png)

Freeze the evidence inventory and technical gates first. Then finalize submission copy and README, generate language-specific diagrams and screenshots, build the decks, capture the demo, and audit terminology, links, numbers, commits, and language separation.

Completion requires public links, reproducible sensor-registry compilation, one-to-one claim evidence, separate English and Japanese assets, consistent four-domain vocabulary, explicit planned-work labels, and confirmed Apache 2.0 / public repository / midnightntwrk gates.
