# System Architecture

[日本語版](ja/system_architecture.md)

This document describes the production daily-attestation path and the remaining storage migration. Solid arrows are implemented integration paths; dashed arrows are optional replacements.

## Deployment View

```mermaid
flowchart LR
    Browser["Operator / Third-Party Browser"]

    subgraph Edge["Edge Device — trusted acquisition boundary"]
        Sensor["Temperature Sensor"]
        Collector["Resource-limited systemd Collector<br/>no Wallet / Compact / Prover"]
        DeviceAgent["Operational Transaction Agent<br/>separate device wallet"]
        Signer["Measurement Key<br/>Secure Element preferred"]

        Sensor --> Collector
        Signer -. "sign hourly root" .-> Collector
        Collector -. "prepared private dataset" .-> DeviceAgent
    end

    subgraph Operator["Development Server — build and deployment boundary"]
        Compiler["Compact Compiler<br/>Circuits + Proving Keys"]
        Release["Operational-only Device Release"]
        Agent["Development CLI<br/>Compile + Deploy"]
        Wallet["Development / Deployer Wallet<br/>.env.development"]

        Compiler --> Agent
        Compiler --> Release
        Wallet --> Agent
    end

    subgraph Cloudflare["Cloudflare — current trusted cloud boundary"]
        Worker["Worker<br/>Ingestion API + Read API + SPA + Cron"]
        StoragePort["SqlDatabase Port"]
        D1[("D1<br/>Current time-series store")]
        Turso[("Turso / libSQL<br/>Future store")]
        Container["Proof Server Container<br/>Trusted production prover"]

        Worker --> StoragePort
        StoragePort --> D1
        StoragePort -. "future adapter" .-> Turso
    end

    subgraph Midnight["Midnight Preprod"]
        Contract["Sensor Registry<br/>Compact Contract"]
        PublicLedger[("Public Ledger<br/>Root + Period + Count + Result + Tx")]
        Contract --> PublicLedger
    end

    Collector -->|"HTTPS readings"| Worker
    Collector -. "hour root + device signature" .-> Worker
    Browser -->|"same-origin GUI / API"| Worker
    Worker -->|"authenticated daily claim"| DeviceAgent
    DeviceAgent -->|"status + public result"| Worker
    DeviceAgent -->|"authenticated private proof input"| Container
    DeviceAgent -->|"device-wallet submission"| Contract
    Agent -->|"one-time deployment"| Contract
    Release -. "transfer compiled runtime only" .-> DeviceAgent
    Worker -->|"public verification data only"| Browser
```

The Cloudflare Container receives private proof inputs and is therefore part of the trusted production boundary. The gateway must authenticate access and must not log or persist proof inputs. An operator-controlled prover remains an optional future replacement.

## Daily Authenticity Proof

```mermaid
flowchart TD
    Reading["Canonical Private Reading<br/>device + timestamp + sequence + temperature"]
    Nonce["Fresh Private Nonce"]
    Leaf["Leaf Commitment"]
    HourRoot["Persistent Hour Root"]
    Signature["Device Ed25519 Signature<br/>over root + hour + count + sequence range"]
    DailyProof["One Daily ZKP"]
    HourClaims["24 Hour Claims<br/>normal count + anomaly count<br/>allWithinRange"]
    DayRoot["Daily Dataset Root"]
    PublicResult["Public Midnight State<br/>root + period + count + verification result"]
    Reason["Append-Only Outlier Reason<br/>operator signature + reason hash"]

    Reading --> Leaf
    Nonce --> Leaf
    Leaf --> HourRoot
    HourRoot --> Signature
    Reading --> DailyProof
    Nonce --> DailyProof
    HourRoot --> DailyProof
    Signature --> SignatureCheck["Off-Circuit Signature Verification"]
    DailyProof --> HourClaims
    DailyProof --> DayRoot
    HourClaims --> PublicResult
    DayRoot --> PublicResult
    SignatureCheck --> PublicResult
    Reason -. "linked to day root + hour" .-> PublicResult
```

The circuit recomputes every commitment and root, checks sequence completeness, binds the private policy, and proves complete hourly classification. Ed25519 device signatures are verified outside the circuit; the bundle hash is stored with the Midnight attestation. Third-party verification requires both checks.

## Trust and Data Boundaries

| Boundary | Private or public data | Responsibility |
| --- | --- | --- |
| Edge Device | Sensor readings, ingestion token, device operational wallet and encrypted operational private state | Acquisition, authenticated upload, recurring transaction submission through the remote prover, persistent diagnostics; no compiler/deployment/local prover |
| Development server | Compact sources/artifacts, proving keys, `.env.development` wallet backup | Build, test, benchmark, contract deployment, and operational-only device release generation |
| D1 / future Turso | Raw operational readings, receive time, workflow state, outlier reasons | Time-series operations and operator audit |
| Cloudflare Worker | API authorization, scheduling, Attestation status, public responses | Orchestration; never expose proof secrets to browsers |
| Midnight | Dataset root, device commitment/public-key registration, period, counts, proof result, Tx metadata | Tamper-evident third-party verification |

## Delivery Status

- **Implemented:** separate development, device collector, and device-wallet workspaces; separate wallet stores; an operational-only release builder; a resource-limited systemd collector with persistent diagnostics; Worker-hosted SPA/API; D1 adapter; Cloudflare trusted proof gateway; fixed-profile full-day circuit sources; signed hourly roots; complete hourly classification; and append-only reason hashes.
- **Remaining integration:** deploy the production contract/profile, submit measured Preprod transactions, expose all evidence in the GUI, and add the Turso adapter.
