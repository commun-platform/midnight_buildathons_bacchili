# Operational Day Boundary

[日本語版](../ja/architecture/operational_day_boundary.md)

Status: normative design for the configurable 24-hour attestation period

## Purpose

One attestation always proves exactly 24 one-hour slots. A Project may define which local wall-clock
hour starts that operational day without changing the circuit shape or compiling a new contract.
The boundary is registered before Device operation and is not supplied by each Proof request.

## Registered configuration

A Project provides defaults when it is created:

- `timeZoneOffsetMinutes`: a fixed UTC offset from -840 through +840 minutes;
- `localDayStartHour`: an integer from 0 through 23; minutes and seconds are always zero.

When a Policy is assigned to a Device, these values are copied into the immutable public Midnight
`PolicyAssignment`. The assignment also stores the derived `utcDayStartMinute`:

```text
utcDayStartMinute = modulo(localDayStartHour * 60 - timeZoneOffsetMinutes, 1440)
```

Compact stores the signed offset as `timeZoneOffsetMinutesBias = timeZoneOffsetMinutes + 840`.
The assignment-registration circuit checks the offset, hour, UTC boundary, and their relation.
D1 mirrors all three values for API routing and display, but the Midnight assignment is the public
authority used by the attestation circuit and third-party verifier.

An assignment is immutable. Changing the offset or start hour creates a new assignment and validity
period; it does not require a new Policy, circuit, or contract deployment.

## Attestation period and date

The 24 slots remain `Vector<24, HourlyExtrema>`. For UTC epoch day `measurementDay`, the contract
requires:

```text
periodStart = measurementDay * 86400 + utcDayStartMinute * 60
periodEnd   = periodStart + 86400
slot[i]     = [periodStart + i * 3600, periodStart + (i + 1) * 3600)
```

`measurementDay` is the UTC epoch-day component containing `periodStart`; it is not a user-facing
calendar date. `periodDate` is the local operational date derived from the registered offset and start
hour:

```text
periodDate = calendarDate(timestamp + timeZoneOffsetMinutes - localDayStartHour)
```

An operational Device derives `periodDate` from its timestamps and authenticated assignment
configuration. It cannot choose an alternate offset or boundary in a Proof request. The review-only
synthetic generator may select a completed `periodDate`, but the API and contract recompute its exact
start and reject inconsistent dates, epoch days, assignments, or timestamps.

Example: offset `+540` and local start `06:00` produce `utcDayStartMinute = 1260` (21:00 UTC).
Operational date `2026-09-02` therefore covers `2026-09-01T21:00:00Z` through
`2026-09-02T21:00:00Z`.

## Fixed-offset rule

Wave 1 uses a fixed UTC offset and does not apply IANA daylight-saving transitions inside an
assignment. Every proof remains exactly 86,400 seconds and 24 slots. A jurisdictional offset change
is represented by a new assignment effective at the transition boundary.

## Required validation

- Project creation rejects an offset outside -840 through +840 or a start hour outside 0 through 23.
- Device registration copies the Project boundary into the on-chain assignment and D1 mirror.
- Device configuration returns the authenticated assignment boundary.
- Aggregation, synthetic generation, Proof admission, and public verification use the same boundary.
- The contract rejects a false offset/hour/UTC-boundary relation and a period that does not start at
  the registered boundary or last exactly 24 hours.
- Third-party output shows the local operational date, fixed offset, local start hour, UTC period,
  and 24 relative hourly slots without disclosing extrema.
