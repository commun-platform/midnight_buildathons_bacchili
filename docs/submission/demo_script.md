# Final GUI Demo Script

[日本語版](../ja/submission/demo_script.md)

Status: English demo pitch produced from the final GUI
Actual duration: 2:18
Output: `bacchiri-demo-pitch-en.mp4`; produce a separate Japanese version only if needed

## Recording invariants

- Record the final review commit only.
- Use a controlled review Device and completed date.
- Show no mnemonic, key, Session, token, private hourly minimum / maximum values, nonce, proof body, or environment file.
- Prefer a truthful OUTSIDE day because it proves the system does not force a successful-looking result.
- Keep the public threshold visible when showing OUTSIDE.
- If using a previously recorded Midnight preproduction-network result, state that clearly and keep it tied to the same review package.
- Describe the browser precisely: it independently compares public Midnight transaction/Contract state, but does not rerun the ZK verifier locally.

![The six steps that the final GUI video must show while keeping private values out of view](../assets/guides/judge-review-path-en.png)

## Final 2:18 storyboard and narration

| Time | Visual / action | English narration |
| --- | --- | --- |
| 0:00–0:11.984 | Title/value slide | Ask whether an auditor can verify a threshold result without receiving the sensor values; introduce BACCHIRI as a verifiable measurement layer. |
| 0:11.984–0:32.392 | Minimum-evidence explanation slide | Explain the cross-organization reporting problem and why BACCHIRI shares only the evidence required for trust. |
| 0:32.392–0:48.816 | Device Workflow GUI; source 0:20.500–0:36.924 | Show the connected user-controlled Wallet, Device identity, and policy bound before measurement. |
| 0:48.816–1:06.296 | Private sensor-evidence explanation slide | Explain private raw readings, 24 ordered hourly MIN/MAX slots, and canonical no-data hours. Do not show a proof-transaction screen in this scene. |
| 1:06.296–1:22.216 | ZK proof GUI; source 3:58.000–4:13.920 | Show proof generation against the threshold already registered on Midnight. |
| 1:22.216–1:39.864 | Device approval GUI; source 4:58.000–5:15.648 | Show Device approval of the exact payload and separate Sponsor Wallet DUST contribution. |
| 1:39.864–1:58.664 | Third-party GUI and Explorer; source 5:54.000–6:12.800 | Paste the TX hash and show the UTC date, 24 hourly results, applied policy/validity, Device Commitment, block, and transaction evidence while private values remain redacted. |
| 1:58.664–2:18.040 | Exact claim-boundary slide | State what Midnight proves and explicitly exclude physical sensor accuracy, complete sampling, and correct measurement-source aggregation. |

The burned-in captions reproduce the TTS script exactly and use speech/silence boundaries measured from the generated narration. Browser chrome, the Windows taskbar, and the password-entry sequence are excluded.

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
14. Show policy bounds, the 24 UTC hourly results, Device Commitment, confirmed state, and transaction ID.
15. Open Third-Party Verification, paste the transaction hash, and show the same UTC date, hourly results, policy/validity, Device Commitment, block, and transaction without private input.

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
| GUI-08 | Public verifier | TX-hash lookup, UTC date, 24 hourly results, policy/validity, Device Commitment, block, TX |
| GUI-09 | Negative / boundary | OUTSIDE or one explicit tamper-rejection result |
| EVD-01 | Compile | Six circuits and submitDailyAttestation rows |
| EVD-02 | Tests | 339 passed |

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
