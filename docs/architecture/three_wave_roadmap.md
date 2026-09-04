# Three-Wave Product and Business Roadmap

[日本語版](../ja/architecture/three_wave_roadmap.md)

Status: product roadmap
Last updated: 2026-09-05 JST

This roadmap is intentionally outcome-oriented. Product and business documents describe capabilities,
trust boundaries, and adoption goals without depending on a particular Wallet product, reference
computer, managed-cloud product, storage engine, or cryptographic-key algorithm. Exact implementation
names remain in technical specifications and reproducible operating procedures where they are needed.

## Progression

| Wave | Question | Target outcome |
| --- | --- | --- |
| Wave 1 | Does the private threshold-proof value proposition work? | Core proof PoC |
| Wave 2 | Can it operate reliably with real field measurement systems? | Operational partner pilot |
| Wave 3 | Can we validate repeatable customer value and the conditions for commercial delivery? | Commercial readiness and recurring-revenue evidence for PMF validation |

## Wave 1 — Core Proof PoC

Wave 1 validates the core privacy value with a simulated measurement source in a user-authorized
browser client. The PoC creates a synthetic daily measurement record, stores its hourly summaries as
authorized operational data in the trusted managed backend, proves its relationship to a condition
registered before the measurement period, and records the result on Midnight without publishing the
underlying values to third parties. Raw synthetic readings and the private proof opening remain in
browser-private source state.

The review interface deliberately combines operator actions and public verification so a judge can
follow the complete proof lifecycle in one place. It is a review-oriented PoC, not the final
production separation of applications, organizations, and roles.

Wave 1 demonstrates:

- registration of the proof subject and public evaluation condition;
- generation of a synthetic daily measurement record;
- authorized backend storage of its hourly operational summaries;
- reduction to a fixed daily private proof input;
- proof generation and sponsored transaction submission;
- a Midnight record containing the public result and evidence identifiers;
- an operator view of the PoC workflow; and
- a third-party view that reveals the result but not the underlying values.

Supporting field-runtime, authentication, packaging, and recovery code exists in the repository, but
autonomous long-running field operation is not the primary Wave 1 review path and is not claimed as a
completed production service.

Wave 1 also delivered several foundations ahead of their Wave 2 operational maturity gate: a
walletless managed-cloud intake path, an Access-protected operations console, redacted audit and
daily metrics, incident/receipt notifications, a private read-only Support MCP, and a separately
deployed public transaction-verification MCP. These are implemented and tested capabilities, but
their existence does not by itself satisfy the Wave 2 partner-operation outcome.

Wave 1 succeeds when a reviewer can reproduce the complete simulated-data proof flow and understand
exactly what the proof establishes, keeps private, and does not establish.

## Wave 2 — Operational Partner Pilot

Wave 2 connects the proof flow to real field measurement systems and makes the daily lifecycle
autonomous and operationally supportable. Collection, aggregation, proof scheduling, transaction
submission, status reporting, retries, and recovery must continue without routine manual execution.

The product target includes:

- complete production separation of operator, public-verifier, and system-operator interfaces;
- organization-, project-, and role-based authentication and authorization;
- validate and extend the implemented audit trail, diagnostics, processing metrics, health
  monitoring, operations console, notifications, and support automation under partner load;
- bounded asynchronous processing, idempotent retries, failure recovery, and alerting;
- lifecycle management for multiple field measurement sources;
- controlled software update and rollback procedures; and
- clear retention and redaction rules for operational data and logs.

The business target is a partner pilot with an established company that already operates a relevant
business workflow. The pilot connects to an actual reporting or management process, measures
operational cost and customer value, validates a viable price, and aims to become paid rather than
remaining a laboratory demonstration.

Wave 2 succeeds when a partner uses autonomously produced daily proofs in a real workflow for an
agreed evaluation period, with measurable reliability, support effort, security/tenant isolation,
and commercial feedback. Source code completion alone does not satisfy this gate.

## Wave 3 — Trust Minimization and Commercial Readiness

Wave 3 reduces trust in the measurement source and its software through hardware-protected identity,
key material, execution-integrity evidence, and verifiable provenance for calibration and lifecycle
events. These controls strengthen source identity and software integrity; they do not by themselves
prove the physical truth of a measurement.

The product target includes:

- hardware-protected identity and signing authority;
- evidence of approved software and configuration state;
- calibration, maintenance, replacement, and update provenance;
- commercial multi-organization and multi-site operation;
- standard integration interfaces, service levels, backup, and disaster recovery; and
- usage metering, plans, billing, and support operations.

The business target is readiness to validate product-market fit rather than a claim that PMF has
already been achieved. Wave 3 collects evidence from real revenue, repeated use, contract renewal,
expansion to additional sites or measurement sources, and unit economics that support continued
delivery. Existing industry partners and their operating or sales channels remain the primary route
to adoption.

Wave 3 succeeds when multiple paying customers obtain repeatable value, at least one customer renews
or expands usage, and the customer-value, delivery, and unit-economics evidence is sufficient to begin
a repeatable PMF validation process. A single one-off sale is commercial evidence, but not sufficient
by itself to claim product-market fit. The Wave 3 outcome is PMF readiness, not PMF achievement.

## Stable terminology

Roadmap and submission documents use capability terms:

| Capability term | Meaning |
| --- | --- |
| User-authorized browser client | The client and user-controlled account used in the Wave 1 review flow |
| Simulated measurement source | Synthetic data producer used for PoC validation |
| Field measurement system | Production source of measurements; independent of a specific computer or board |
| Managed backend | Authentication, workflow, persistence, proof execution, and operational services |
| Sponsored transaction submission | Service-funded transaction fee handling without naming a particular token mechanism |
| Hardware-protected identity | Non-exportable identity and attestation capability, independent of a specific hardware product |

Midnight and zero-knowledge proofs remain explicit because they are core to the product. Concrete
products, infrastructure services, algorithms, and reference hardware are named only in implementation
and operating documents that require them for reproducibility.
