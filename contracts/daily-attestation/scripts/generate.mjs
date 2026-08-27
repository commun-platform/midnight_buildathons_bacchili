import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const generatedDir = path.join(packageRoot, 'src', 'generated');
const sampleCounts = [24, 96, 1440];

function contractSource(sampleCount) {
  const samplesPerHour = sampleCount / 24;
  return `pragma language_version 0.23;

import CompactStandardLibrary;

export struct Measurement {
    timestamp: Uint<64>;
    sequence: Uint<32>;
    sensorId: Bytes<32>;
    temperatureCentiOffset: Uint<32>;
    schemaVersion: Uint<16>;
}

export struct ThresholdPolicy {
    minimumCentiOffset: Uint<32>;
    maximumCentiOffset: Uint<32>;
    policyVersion: Uint<16>;
}

export struct HourInput {
    measurements: Vector<${samplesPerHour}, Measurement>;
    nonces: Vector<${samplesPerHour}, Bytes<32>>;
}

export struct DayInput {
    hours: Vector<24, HourInput>;
    policy: ThresholdPolicy;
    policyNonce: Bytes<32>;
}

export struct HourAccumulator {
    normalCount: Uint<32>;
    anomalyCount: Uint<32>;
    firstSequence: Uint<32>;
    lastSequence: Uint<32>;
    sequenceValid: Boolean;
    hasMeasurement: Boolean;
}

export struct HourClaim {
    hourRoot: Bytes<32>;
    sampleCount: Uint<32>;
    normalCount: Uint<32>;
    anomalyCount: Uint<32>;
    allWithinRange: Boolean;
}

export struct DailyAttestationState {
    deviceCommitment: Bytes<32>;
    policyCommitment: Bytes<32>;
    dayRoot: Bytes<32>;
    hourClaimsRoot: Bytes<32>;
    signatureBundleHash: Bytes<32>;
    periodStart: Uint<64>;
    periodEnd: Uint<64>;
    sampleCount: Uint<32>;
    anomalyCount: Uint<32>;
    schemaVersion: Uint<16>;
    verified: Boolean;
}

export struct ReasonState {
    dayRoot: Bytes<32>;
    hourIndex: Uint<8>;
    reasonHash: Bytes<32>;
    previousReasonHash: Bytes<32>;
    operatorCommitment: Bytes<32>;
    recordedAt: Uint<64>;
}

export ledger operatorCommitment: Bytes<32>;
export ledger devices: Set<Bytes<32>>;
export ledger policies: Set<Bytes<32>>;
export ledger attestations: Map<Bytes<32>, DailyAttestationState>;
export ledger reasons: Map<Bytes<32>, ReasonState>;
export ledger latestReasonByHour: Map<Bytes<32>, Bytes<32>>;
export ledger attestationCount: Counter;
export ledger reasonCount: Counter;
export ledger lastDayRoot: Bytes<32>;
export ledger lastHourClaimsRoot: Bytes<32>;

witness operatorSecret(): Bytes<32>;
witness privateDay(dayRoot: Bytes<32>): DayInput;

constructor(initialOperatorCommitment: Bytes<32>) {
    operatorCommitment = disclose(initialOperatorCommitment);
    attestationCount.increment(0);
    reasonCount.increment(0);
}

export pure circuit deriveOperatorCommitment(secret: Bytes<32>): Bytes<32> {
    return persistentHash<Vector<2, Bytes<32>>>([
        pad(32, "measurement:operator:v1"),
        secret
    ]);
}

circuit authenticateOperator(): [] {
    const derived = deriveOperatorCommitment(operatorSecret());
    assert(disclose(derived == operatorCommitment), "operator authentication failed");
}

export pure circuit policyCommitment(
    policy: ThresholdPolicy,
    nonce: Bytes<32>
): Bytes<32> {
    return persistentCommit<ThresholdPolicy>(policy, nonce);
}

pure circuit hourRoot(hour: HourInput): Bytes<32> {
    const commitments = map(
        (measurement: Measurement, nonce: Bytes<32>): Bytes<32> =>
            persistentCommit<Measurement>(measurement, nonce),
        hour.measurements,
        hour.nonces
    );
    return persistentHash<Vector<${samplesPerHour}, Bytes<32>>>(commitments);
}

pure circuit summarizeHour(
    hour: HourInput,
    policy: ThresholdPolicy,
    root: Bytes<32>
): HourClaim {
    const result = fold(
        (accumulator: HourAccumulator, measurement: Measurement): HourAccumulator => {
            const normal =
                measurement.temperatureCentiOffset >= policy.minimumCentiOffset &&
                measurement.temperatureCentiOffset <= policy.maximumCentiOffset;
            const firstSequence = accumulator.hasMeasurement
                ? accumulator.firstSequence
                : measurement.sequence;
            const sequenceValid =
                accumulator.sequenceValid &&
                (!accumulator.hasMeasurement ||
                    measurement.sequence == (accumulator.lastSequence + 1) as Uint<32>);
            return HourAccumulator {
                normalCount: (accumulator.normalCount + (normal ? 1 : 0)) as Uint<32>,
                anomalyCount: (accumulator.anomalyCount + (normal ? 0 : 1)) as Uint<32>,
                firstSequence: firstSequence,
                lastSequence: measurement.sequence,
                sequenceValid: sequenceValid,
                hasMeasurement: true
            };
        },
        HourAccumulator {
            normalCount: 0,
            anomalyCount: 0,
            firstSequence: 0,
            lastSequence: 0,
            sequenceValid: true,
            hasMeasurement: false
        },
        hour.measurements
    );
    assert(result.hasMeasurement, "hour must contain measurements");
    assert(result.sequenceValid, "hour sequence is invalid");
    assert(
        result.normalCount + result.anomalyCount == ${samplesPerHour},
        "anomaly classification is incomplete"
    );
    return HourClaim {
        hourRoot: root,
        sampleCount: ${samplesPerHour},
        normalCount: result.normalCount,
        anomalyCount: result.anomalyCount,
        allWithinRange: result.anomalyCount == 0
    };
}

export pure circuit computeDayRoot(hours: Vector<24, HourInput>): Bytes<32> {
    const roots = map((hour: HourInput): Bytes<32> => hourRoot(hour), hours);
    return persistentHash<Vector<24, Bytes<32>>>(roots);
}

export pure circuit computeHourClaims(
    hours: Vector<24, HourInput>,
    policy: ThresholdPolicy
): Vector<24, HourClaim> {
    const roots = map((hour: HourInput): Bytes<32> => hourRoot(hour), hours);
    return map(
        (hour: HourInput, root: Bytes<32>): HourClaim => summarizeHour(hour, policy, root),
        hours,
        roots
    );
}

export pure circuit computeHourClaimsRoot(claims: Vector<24, HourClaim>): Bytes<32> {
    return persistentHash<Vector<24, HourClaim>>(claims);
}

export circuit registerDevice(deviceCommitment: Bytes<32>): [] {
    authenticateOperator();
    const publicDevice = disclose(deviceCommitment);
    assert(!devices.member(publicDevice), "device is already registered");
    devices.insert(publicDevice);
}

export circuit registerPolicy(commitment: Bytes<32>): [] {
    authenticateOperator();
    const publicPolicy = disclose(commitment);
    assert(!policies.member(publicPolicy), "policy is already registered");
    policies.insert(publicPolicy);
}

export circuit submitDailyAttestation(
    expectedDayRoot: Bytes<32>,
    deviceCommitment: Bytes<32>,
    expectedPolicyCommitment: Bytes<32>,
    signatureBundleHash: Bytes<32>,
    periodStart: Uint<64>,
    periodEnd: Uint<64>,
    schemaVersion: Uint<16>
): [] {
    authenticateOperator();
    const publicDayRoot = disclose(expectedDayRoot);
    const publicDevice = disclose(deviceCommitment);
    const publicPolicy = disclose(expectedPolicyCommitment);
    assert(devices.member(publicDevice), "device is not registered");
    assert(policies.member(publicPolicy), "policy is not registered");
    assert(!attestations.member(publicDayRoot), "daily attestation already exists");
    assert(periodStart < periodEnd, "attestation period is invalid");

    const day = privateDay(publicDayRoot);
    assert(
        disclose(day.policy.minimumCentiOffset <= day.policy.maximumCentiOffset),
        "private policy is invalid"
    );
    assert(
        disclose(policyCommitment(day.policy, day.policyNonce) == publicPolicy),
        "private policy commitment mismatch"
    );
    const roots = map((hour: HourInput): Bytes<32> => hourRoot(hour), day.hours);
    const claims = map(
        (hour: HourInput, root: Bytes<32>): HourClaim => summarizeHour(hour, day.policy, root),
        day.hours,
        roots
    );
    for (const hourIndex of 1..24) {
        assert(
            disclose(
                day.hours[hourIndex].measurements[0].sequence ==
                    (day.hours[hourIndex - 1].measurements[${samplesPerHour - 1}].sequence + 1) as Uint<32>
            ),
            "day sequence is invalid"
        );
    }
    const computedDayRoot = persistentHash<Vector<24, Bytes<32>>>(roots);
    const claimsRoot = persistentHash<Vector<24, HourClaim>>(claims);
    const totalAnomalies = fold(
        (total: Uint<32>, claim: HourClaim): Uint<32> =>
            (total + claim.anomalyCount) as Uint<32>,
        0 as Uint<32>,
        claims
    );
    assert(disclose(computedDayRoot == publicDayRoot), "daily root mismatch");

    attestations.insert(
        publicDayRoot,
        disclose(DailyAttestationState {
            deviceCommitment: publicDevice,
            policyCommitment: publicPolicy,
            dayRoot: publicDayRoot,
            hourClaimsRoot: claimsRoot,
            signatureBundleHash: signatureBundleHash,
            periodStart: periodStart,
            periodEnd: periodEnd,
            sampleCount: ${sampleCount},
            anomalyCount: totalAnomalies,
            schemaVersion: schemaVersion,
            verified: true
        })
    );
    lastDayRoot = publicDayRoot;
    lastHourClaimsRoot = disclose(claimsRoot);
    attestationCount.increment(1);
}

export circuit appendOutlierReason(
    dayRoot: Bytes<32>,
    hourIndex: Uint<8>,
    reasonHash: Bytes<32>,
    previousReasonHash: Bytes<32>,
    recordedAt: Uint<64>
): [] {
    authenticateOperator();
    const publicDayRoot = disclose(dayRoot);
    const publicHourIndex = disclose(hourIndex);
    const publicReasonHash = disclose(reasonHash);
    const publicPrevious = disclose(previousReasonHash);
    assert(attestations.member(publicDayRoot), "daily attestation is not registered");
    assert(publicHourIndex < 24, "hour index is invalid");
    assert(!reasons.member(publicReasonHash), "reason hash already exists");
    const targetKey = persistentHash<Vector<2, Bytes<32>>>([
        publicDayRoot,
        (publicHourIndex as Field) as Bytes<32>
    ]);
    if (latestReasonByHour.member(targetKey)) {
        assert(latestReasonByHour.lookup(targetKey) == publicPrevious, "reason chain mismatch");
    } else {
        assert(publicPrevious == pad(32, ""), "first reason must not have a predecessor");
    }
    reasons.insert(
        publicReasonHash,
        disclose(ReasonState {
            dayRoot: publicDayRoot,
            hourIndex: publicHourIndex,
            reasonHash: publicReasonHash,
            previousReasonHash: publicPrevious,
            operatorCommitment: operatorCommitment,
            recordedAt: recordedAt
        })
    );
    latestReasonByHour.insert(disclose(targetKey), publicReasonHash);
    reasonCount.increment(1);
}
`;
}

fs.mkdirSync(generatedDir, { recursive: true });
for (const sampleCount of sampleCounts) {
  fs.writeFileSync(
    path.join(generatedDir, `daily-attestation-${sampleCount}.compact`),
    contractSource(sampleCount),
  );
}
process.stdout.write(`Generated production daily attestation profiles: ${sampleCounts.join(', ')}\n`);
