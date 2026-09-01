# Review Figure Generation Manifest

[日本語版](../../ja/assets/review/generation_manifest.md)

Generation mode: Codex built-in imagegen
Localization basis: the current Japanese review figures, regenerated as English assets
Asset class: 16:9 judge-facing technical diagrams
Final size: 1672 × 941 PNG
Visual system: near-black navy grid, white condensed headlines, cyan system boundaries, restrained violet / green / amber accents
Common constraints: hard enterprise-engineering style; no board-specific hardware branding; no development host; no people; no vendor logos; no blockchain coins; no watermark; no decorative cyberpunk effects

## privacy-value-proposition-en.png

- Headline: `PROVE THRESHOLD COMPLIANCE WITHOUT DISCLOSING SENSOR VALUES`.
- Show that a third party checks `DAY · THRESHOLD · RESULT` and does not see `SENSOR VALUES`.
- Keep the customer value readable in five seconds.

## hourly-extrema-zkp-en.png

- Explain the proof in four simple stages: readings, hourly minimum / maximum, comparison with the registered threshold, and `WITHIN / OUTSIDE`.
- Apply the decision only to observed hours.
- State that sensor accuracy, completeness, and aggregation correctness are not proved.

## zk-claim-boundary-en.png

- Separate `PROOF ESTABLISHES`, `KEPT PRIVATE`, and `NOT ESTABLISHED`.
- The exact claim compares each observed hour's private minimum / maximum with the registered threshold and determines `WITHIN / OUTSIDE`.
- Keep physical-sensor accuracy, completeness, and aggregation correctness outside the claim.

## wave1-system-overview-en.png

- Use exactly four domains: `EDGE DEVICE`, `FRONTEND`, `BACKEND`, and `MIDNIGHT`.
- Edge Device keeps sensor values and signing keys; Frontend holds no Device credential; Backend handles public workflow storage and proof generation; Midnight records the public threshold, target Device, and result.
- Keep the overview simple and direct detailed disclosure and sequence questions to later figures.

## data-location-disclosure-en.png

- Use a `DATA × VIEWER` table with columns for storage, administrator, third party, and Midnight record.
- Mark raw values private, hourly minimum / maximum administrator-only during proof and private to third parties, and day / observed hours / count / specification version / threshold / result / signed transaction public.
- State that D1 is a display mirror and that the Backend does not retain hourly minimum / maximum values after proof generation.

## daily-proof-flow-en.png

- Use five stages only: Edge collection and hourly aggregation; Backend proof generation; Edge transaction signature; Midnight threshold check and result record; third-party review.
- Public: day, threshold, result, and Midnight transaction record.
- Private: hourly minimum / maximum values are not shown to third parties.

## engineering-evidence-en.png

- Show only judge-relevant results: 6 proof circuits compile, 333 automated tests pass across 9 workspaces, typecheck and build pass, Cloudflare pre-deployment check passes, and dated Midnight Preprod evidence includes the 2026-08-28 self-funded and 2026-08-30 Sponsor-funded records.
- Footer separates current source validation on 2026-08-29 JST from the Midnight record on 2026-08-28, which was not rerun today.
- Omit internal function names, circuit row counts, `k` values, and deployment-tool jargon.

## three-wave-roadmap-en.png

- Summarize the 2026-08-31 version of `docs/architecture/three_wave_roadmap.md`.
- Use three columns organized by question, primary outcome, and success condition rather than product names.
- Mark Wave 1 as the current PoC and Waves 2 and 3 as planned.
- Bound Wave 1 to a user-authorized browser client, simulated measurement source, and combined review interface; do not imply completed autonomous field operation.
- Show Wave 2 as field-system integration, autonomous daily operation, role separation, operational controls, and a partner pilot.
- Show Wave 3 as trust minimization, commercial operation, billing/support, repeated-use and renewal/expansion evidence, and viable unit economics.
- State explicitly that Wave 3 prepares a repeatable PMF validation process; it does not claim PMF achievement.
- Adoption path: `CORE PROOF POC → OPERATIONAL PARTNER PILOT → COMMERCIAL READINESS FOR PMF VALIDATION`.

## device-session-sequence-en.png

- Four lifelines: Edge Device, Frontend, Backend, Midnight.
- Show the P-256 Device authentication key used only to issue or renew a 24-hour API Session.
- State that the Frontend receives no Device credential, D1 stores only the Session SHA-256 hash, and the Session is authentication data rather than an encryption key.

## daily-attestation-key-sequence-en.png

- Four lifelines: Edge Device, Frontend, Backend, Midnight.
- Keep raw values and hourly minimum / maximum values on the Device until proof submission; Backend generates the proof; Edge Device signs the Midnight transaction; Midnight checks the registered threshold and records the result.
- Public information is the threshold, day, observed hours, count, `WITHIN / OUTSIDE`, and signed transaction. Raw values, hourly minimum / maximum values, and proof nonce are not public.
- Correct arrow ownership is mandatory: Backend, not Frontend, checks the threshold and target Device; the Edge Device performs transaction signing locally.

The English figures are standalone PNG assets generated from English prompt specifications with the matching Japanese figure supplied as a visual reference. They are not text overlays on the Japanese raster.
