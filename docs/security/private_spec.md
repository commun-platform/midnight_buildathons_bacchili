# Privacy and Public Claim Boundary

[日本語版](../ja/security/private_spec.md)

The normative requirements are in [`wave1_spec.md`](../architecture/wave1_spec.md). Wave 1 keeps raw sensor values on the device and sends Cloudflare only hourly aggregates, anomaly state transitions, commitments, and workflow metadata.

![Boundary between what the ZK proof establishes, what remains private, and what is outside the proof claim](../assets/review/zk-claim-boundary-en.png)

The three columns must not be conflated. The ZK proof establishes the relationship between submitted private extrema and the registered public policy. Keeping raw values and hourly extrema private does not establish physical sensor truth, calibration, installation quality, or continuous sampling; those remain responsibilities of the device, firmware, installation, and operational audit.

![Data storage locations and disclosure boundaries across Edge Device, Frontend, Backend, and Midnight](../assets/review/data-location-disclosure-en.png)

The location map distinguishes storage from transit. Raw values, private extrema, witnesses, and keys remain at the Edge. The Frontend stores no secrets. Queue messages contain references only, while private proving requests transit the Proof Server only after admission. Midnight remains authoritative for public policy and attestation evidence.

## Private data

- Device Identity private key and plaintext opaque Session token;
- device and development Midnight wallet secrets;
- raw sensor values and prepared private daily extrema;
- hourly minimum/maximum values, commitment nonce, witnesses, and private state;
- proof request bodies while not in transit.

Raw values may be retained locally until transaction confirmation and the configured device retention policy permit deletion. They are not written to D1, R2, Queue messages, Worker logs, or browser storage.

## Administrator data

The loopback administrator GUI can display hourly minimum, maximum, average, count, anomaly transitions, Device status, and Proof/TX processing state. These aggregate values are not included in the public third-party API.

## Public evidence

The public Proof view may expose:

- period and sample count;
- daily attestation commitment and pseudonymous Proof Job ID;
- threshold-policy mode, public bounds, ID/version, and assignment;
- observed/STOPPED hour count and presence bitmap;
- proven WITHIN/OUTSIDE result (or STOPPED derived from zero observed hours) and confirmation status;
- attestation transaction ID or hash, block height, network, and contract address.

The operational contract stores threshold mode, minimum/maximum, scale, sensor/unit codes, policy
assignment, and `thresholdSatisfied` in public ledger state. The product must therefore describe the
threshold policy and WITHIN/OUTSIDE result as public. The zero-knowledge property protects the
submitted hourly extrema and commitment nonce; an OUTSIDE result does not reveal which hour or value
caused it.

## Trusted Wave 1 components

The Cloudflare Worker and Proof Server Container are trusted with an in-transit private proving request. TLS protects that hop. The Worker removes authorization headers before forwarding, does not log request bodies, and streams the body without storing it in D1, R2, or Queue messages. Cloudflare never receives a Midnight wallet secret and cannot sign the device transaction.

The browser does not independently execute the ZK verifier. It presents D1 workflow evidence and links it to public Midnight transaction/contract identifiers. A stronger independent verifier is a later extension.
