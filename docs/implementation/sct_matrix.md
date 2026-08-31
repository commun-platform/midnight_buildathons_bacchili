# System Compatibility Test Matrix

[日本語版](../ja/implementation/sct_matrix.md)

Wave 1 uses two deterministic SCT levels before the final deployed Preprod review:

```bash
npm run sct:api
npm run sct:gui
npm run sct
```

| Use case | API SCT evidence | Rendered GUI SCT evidence |
| --- | --- | --- |
| Wallet Project selection and creation | One-time Wallet signature, hashed 24-hour session, associated-Project list, Project creation, independent Wallet/Project Device ID, API limit, and D1 ten-Project trigger | Project dropdown, **+ New Project**, `1 / 10` counter, a new Project-specific Device ID, and switching back to the existing Project |
| Collection loading and empty state | N/A (presentation behavior) | A new Project shows static **NO DATA** after its empty Policy response; background Policy polling shows animated **LOADING**; an unfinished Policy draft and focus survive both polling renders |
| Wallet-derived Device ID, P-256 Device Identity, and 24-hour Session | Deterministic domain-separated derivation, server-side Wallet/Device mismatch rejection, challenge replay, registration evidence, scope, and per-Device access tests | Wallet gate, read-only derived ID, P-256 Identity, and stale cross-Wallet browser-state rejection checkpoints |
| Asynchronous Midnight registration | `202` operation state, token-protected status, Wallet-sync delayed requeue, and terminal error tests | Accepted Job ID is visible; the button leaves `IN PROGRESS`; the stepper says `WAIT`; Device and Assignment TX IDs complete later; only a terminal failure enables browser retry |
| 1,440 private readings to 24 hourly summaries | Aggregate validation and Device-owned history tests | Two selectable JST days; 1,440 readings and exactly 24 rendered hourly rows per selected day |
| Anomaly transition | Authenticated anomaly and dashboard isolation tests | Administrator anomaly row and six completed workflow stages |
| Proof admission and generation | Operating-window, authorization, result validation, and Proof Server boundary tests | Admitted Job enables the ZKP/transaction action |
| Sponsored transaction | Quota, exact-byte idempotency, R2/Queue state, Wallet readiness, intent allow-list, checkpoint, retry, replay-protected lost-response reconciliation, and server-owned Indexer confirmation tests | Sponsor transaction and fee evidence remain visible after history refresh |
| Public verification and privacy | Confirmed-and-complete-TX-only newest-first redacted APIs, truthful WITHIN/OUTSIDE result, and private-field rejection tests | Newest-first WITHIN/OUTSIDE/STOPPED list, visible Indexer progress, four checks, five public stages, Explorer links, and masked raw values with no private sentinel |

The GUI SCT serves the production SPA assets and replaces only external Wallet/Preprod responses with
deterministic test doubles. It uses a clean headless Chrome profile and stores ignored evidence in
`.sct-output/dashboard/`. A passing SCT does not claim that a real Preprod transaction was submitted;
that claim requires the deployed runbook with Lace and Midnight Explorer evidence.
