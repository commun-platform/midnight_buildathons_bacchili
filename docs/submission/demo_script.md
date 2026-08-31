# Final GUI Demo Script

[日本語版](../ja/submission/demo_script.md)

Status: production-ready script; capture waits for the final GUI implementation
Target duration: 3:30
Output: separate English and Japanese videos; do not reuse burned-in captions across languages

## Recording invariants

- Record the final review commit only.
- Use a controlled review Device and completed date.
- Show no mnemonic, key, Session, token, private hourly minimum / maximum values, nonce, proof body, or environment file.
- Prefer a truthful OUTSIDE day because it proves the system does not force a successful-looking result.
- Keep the public threshold visible when showing OUTSIDE.
- If using a previously recorded Midnight preproduction-network result, state that clearly and keep it tied to the same review package.
- Describe the browser precisely: it independently compares public Midnight transaction/Contract state, but does not rerun the ZK verifier locally.

![The six steps that the final GUI video must show while keeping private values out of view](../assets/guides/judge-review-path-en.png)

## Storyboard and narration

| Time | Visual / action | English narration |
| --- | --- | --- |
| 0:00–0:18 | Open on the final verifier result, then title | This system shows a third party that the sensor values are within the registered threshold without disclosing the sensor values. |
| 0:18–0:40 | Show the value-proposition figure | The third party sees the threshold result—WITHIN, OUTSIDE, or STOPPED—not the sensor values. |
| 0:40–1:02 | Show the four-domain architecture | The Edge Device keeps raw data and signing keys. The Frontend shows public information only. The trusted Backend accepts proof requests and generates proofs. Midnight records the public threshold, target Device, and confirmed result. |
| 1:02–1:20 | Show exact claim / non-claim | The proof checks every submitted observed-hour minimum and maximum. It does not prove sensor integrity, continuous sampling, completeness, or local aggregation correctness. |
| 1:20–1:30 | Open Device Workflow; connect the Midnight Wallet | The workflow begins with an explicitly authorized wallet connection. |
| 1:30–1:43 | Create or restore the review Device; show the registration step | API identity, Compact authority, and Midnight Wallet responsibilities are separated. |
| 1:43–1:57 | Select a completed day and run the final generation / capture action | Raw readings remain local and are reduced to a private minimum and maximum for each of 24 hourly slots. Missing hours are STOPPED. |
| 1:57–2:12 | Request proof processing; show the proof-request ID and status | D1 records the request and prevents duplicate execution. The Device cannot substitute a different threshold at proof time. |
| 2:12–2:35 | Generate proof and submit; show progress through confirmed | The trusted Proof Server creates the proof, then the Device signs one Midnight transaction. The Proof Server cannot sign for the Device. |
| 2:35–2:55 | Open Verify daily ZKP / Third-Party Verification | The public view shows the threshold, WITHIN or OUTSIDE result, observed and STOPPED counts, commitment, and transaction identifier—never the private hourly minimum / maximum values or nonce. |
| 2:55–3:15 | Show Engineering Evidence | The current source compiles six proof circuits and passes 287 tests, all type checks, builds, and the Cloudflare pre-deployment check. Dated Preprod evidence includes self-funded WITHIN/OUTSIDE and Sponsor-funded schema-5. |
| 3:15–3:30 | Show roadmap | Wave 2 hardens local/multi-source verification and adds signed provenance evidence. Wave 3 plans calibrated-device proof for a construction-site PoC and wider adoption. |

## Exact GUI capture sequence

1. Start from a clean browser profile prepared for review.
2. Confirm the language, title, network, and review commit marker.
3. Click Connect Midnight Wallet and authorize only the review account.
4. Open Device Workflow.
5. Restore the prepared Device or create the controlled review Device.
6. Confirm Device registration and policy assignment without exposing enrollment secrets.
7. Select the prepared completed day.
8. Show Reading count and the private-input-available indicator, but never open private values.
9. Click Request daily proof.
10. Capture the Proof Job ID and status transition.
11. Click Generate proof and record TX.
12. Wait for confirmed, then capture the shortened transaction ID and result.
13. Click Verify daily ZKP.
14. Show policy bounds, observed / STOPPED counts, commitment, confirmed state, and transaction ID.
15. Open Third-Party Verification from the top navigation and show that the same public result is accessible without private input.

## Required shots

| ID | Shot | Required content |
| --- | --- | --- |
| GUI-01 | Product overview | Final title, network, no warning banner |
| GUI-02 | Wallet gate | Explicit connection action, no wallet secrets |
| GUI-03 | Device registered | Device / policy / assignment status |
| GUI-04 | Completed day | 1,440 reading count or final controlled count; OUTSIDE outlier count if used |
| GUI-05 | Proof requested | Proof Job ID and admitted / ready status |
| GUI-06 | Proof generated | Proving / proof-ready state |
| GUI-07 | Transaction confirmed | Result and shortened TX ID |
| GUI-08 | Public verifier | Policy, result, observed / STOPPED, commitment, TX |
| GUI-09 | Negative / boundary | OUTSIDE or one explicit tamper-rejection result |
| EVD-01 | Compile | Six circuits and submitDailyAttestation rows |
| EVD-02 | Tests | 287 passed |

## Fallback policy

If the Midnight preproduction network is unavailable during recording, use captures produced from the frozen review commit and the documented public review-state synchronization. Add an on-screen label reading `Recorded Midnight preproduction-network evidence · 2026-08-28 JST`. Do not simulate a fresh confirmation or edit a pending state into confirmed.

## Final capture gate

- GUI implementation frozen and built.
- Final review data prepared without secrets.
- All 15 steps rehearsed once without editing.
- Public verifier result matches the selected Device day.
- Transaction / contract identifiers match the evidence matrix.
- English and Japanese narration, captions, and slide assets are separate.
- Video links are added to both submission-copy files and the top README.
