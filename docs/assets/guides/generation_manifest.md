# Documentation Figure Generation Manifest

[日本語版](../../ja/assets/guides/generation_manifest.md)

Generation mode: Codex built-in image generation
Use case: `infographic-diagram`
Output: 1672 × 941 PNG, 16:9
Shared style: hard-edged dark-navy technical documentation, subtle grid, white type, cyan and purple accents, muted green/amber/red, flat line icons
Shared exclusions: people, company logos, coin imagery, photographs, watermarks, Raspberry Pi, development-host architecture, decorative neon cyberpunk styling

## Insertion map

| Figure | Primary documents |
| --- | --- |
| Judge review map | `submission/judge_qa.md` |
| Specification-to-evidence traceability | `implementation/implement_spec.md` |
| Fixed 24-slot scaling | `implementation/cost_benchmark.md` |
| Judge review path | `operations/demo_runbook.md`, `submission/demo_script.md`, `submission/deliverables_plan.md` |
| Device and threshold lifecycle | `security/device_registry.md` |
| Safe Edge release lifecycle | `operations/device_firmware.md` |

The long `architecture/wave1_spec.md` additionally reuses four generated review figures at the exact-claim, runtime-boundary, key-separation, and daily-circuit sections. Indexes, short checklists, and the storage-migration document were not given decorative figures because tables or an existing text diagram already carry their structure.

## Final prompt set

### `judge-qa-map-en.png`

- Title: `JUDGE REVIEW MAP`.
- Four questions: what is proven, what stays private, what is not proven, and what can be checked now.
- Current browser limitation is separated as a Wave 2 plan.

### `implementation-traceability-en.png`

- Title: `FROM SPECIFICATION TO EVIDENCE`.
- Four-stage chain: requirements, implementation, data boundary, evidence.
- Evidence is limited to the validated six circuits, 333 tests, and transaction record.

### `fixed-24-slot-scaling-en.png`

- Title: `WHY 24 HOURLY SLOTS`.
- Shows 24, 96, or 1,440+ local readings reduced into one fixed 24-slot input.
- Separates fixed circuit shape from proof volume, which grows with active Devices × days.

### `judge-review-path-en.png`

- Title: `JUDGE REVIEW PATH`.
- Six steps: setup, enrollment, collection, proof generation, Device signature, public result.
- Private and public data are separated in the bottom strip.

### `device-policy-lifecycle-en.png`

- Title: `DEVICE AND THRESHOLD LIFECYCLE`.
- Five stages: Device registration, public-threshold registration, assignment, daily operation, rotation/disable.
- Operator lifecycle control and Device transaction signing are shown as separate responsibilities.

### `edge-release-lifecycle-en.png`

- Title: `SAFE EDGE RELEASE LIFECYCLE`.
- Six stages: verified package, checksum/manifest, versioned install, activate current, health check, rollback.
- Explicitly excludes the Compact compiler, deployment wallet, and secret seed from the Device package.
