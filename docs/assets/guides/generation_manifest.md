# Documentation figure generation manifest

[日本語版](../../ja/assets/guides/generation_manifest.md)

The tracked review figures are generated either by the built-in image generator or by deterministic
SVG-to-PNG renderers. This manifest records their source and insertion points; generated local output
is not repository evidence.

The tracked SVG/PNG figures are the review assets. Generation inputs and local rendering output are not review evidence.
Output: 1672 × 941 PNG, 16:9
Style: dark-navy technical documentation, subtle grid, white type, cyan and purple accents, muted
green/amber/red, flat line icons
Exclusions: people, company logos, coin imagery, photographs, watermarks, Raspberry Pi, development-host
architecture, decorative neon cyberpunk styling

## Insertion map

| Figure | Primary documents |
| --- | --- |
| Judge review map | `submission/judge_qa.md` |
| Specification-to-evidence traceability | `implementation/implement_spec.md` |
| Fixed 24-slot scaling | `implementation/cost_benchmark.md` |
| Review path | `operations/demo_runbook.md`, `submission/README.md`, `submission/deliverables_plan.md` |
| Device and threshold lifecycle | `security/device_registry.md` |
| Safe Edge release lifecycle | `operations/device_firmware.md` |
| On-demand ZK proof and Midnight recording architecture | `operations/sponsor_wallet_operating_hours.md`, `ja/operations/sponsor_wallet_operating_hours.md` |

The long `architecture/wave1_spec.md` also reuses four review figures at the exact-claim,
runtime-boundary, key-separation, and daily-circuit sections. Indexes and short checklists use tables
or text diagrams where those are clearer.

## Tracked figure set

### `judge-qa-map-en.png`

Four questions: what is proven, what stays private, what is not proven, and what can be checked now.
The browser limitation is identified as a Wave 2 plan.

### `implementation-traceability-en.png`

Requirements, implementation, data boundary, and evidence. The evidence boundary is the validated
eight-circuit source, 524 operational tests plus 4 deterministic mock tests, and dated public records.

### `fixed-24-slot-scaling-en.png`

Shows 24, 96, or 1,440+ local readings reduced into one fixed 24-slot input. Circuit shape stays fixed
while proof volume grows with active Devices × days.

### `judge-review-path-en.png`

Six review steps: setup, enrollment, collection, proof generation, Device signature, and public result.
Private and public data are separated in the bottom strip.

### `device-policy-lifecycle-en.png`

Device registration, public-threshold registration, assignment, daily operation, and rotation/disable.
Operator lifecycle control and Device transaction signing are separate responsibilities.

### `edge-release-lifecycle-en.png`

Verified package, checksum/manifest, versioned install, current activation, health check, and rollback.
The Device package excludes the Compact compiler, deployment credentials, and secret seed.

### `on-demand-zkp-midnight-architecture-en.svg` / `.png`

Shows Browser Wallet and managed-source intake, Worker/D1 coordination, private artifacts, the
on-demand Server Wallet, Proof Server, Midnight, and public verification. The DUST-only boundary and
the separation of Device Authority from private raw values are explicit.

### `on-demand-zkp-midnight-architecture-ja.png`

Japanese localization of the same four-domain architecture, including the Wallet synchronization gate,
safe checkpoint shutdown, restart cooldown, private raw values, and public verification metadata.
