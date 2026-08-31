#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const defaultResultDirectory = path.join(repoRoot, '.state', 'device-benchmarks');
const standardSampleCount = 1_440;
const standardResultName = 'sensor-registry-1440-schema3-e2e.json';

function option(name, fallback) {
  const exact = process.argv.indexOf(`--${name}`);
  if (exact >= 0) return process.argv[exact + 1];
  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));
  return inline?.slice(name.length + 3) ?? fallback;
}

function positiveNumber(name, fallback) {
  const value = Number(option(name, String(fallback)));
  if (!Number.isFinite(value) || value <= 0) throw new Error(`--${name} must be positive`);
  return value;
}

function positiveInteger(name, fallback) {
  const value = positiveNumber(name, fallback);
  if (!Number.isSafeInteger(value)) throw new Error(`--${name} must be an integer`);
  return value;
}

function rounded(value, digits = 9) {
  return Number(value.toFixed(digits));
}

function overage(total, included) {
  return Math.max(0, total - included);
}

function roundedUnitCost(total, included, unit, unitPrice) {
  const billable = overage(total, included);
  return billable === 0 ? 0 : Math.ceil(billable / unit) * unitPrice;
}

function loadResult(resultDirectory) {
  const file = path.join(resultDirectory, standardResultName);
  if (!fs.existsSync(file)) throw new Error(`Benchmark result is missing: ${file}`);
  const result = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (result.succeeded !== true || result.sampleCount !== standardSampleCount) {
    throw new Error(`Expected a successful ${standardSampleCount}-sample result: ${file}`);
  }
  if (!result.transactions?.attest?.feeDust || !result.transactions.attest.proofServerRequests) {
    throw new Error(`Incomplete attestation measurement: ${file}`);
  }
  return result;
}

const resultDirectory = path.resolve(option('result-directory', defaultResultDirectory));
const usdJpy = positiveNumber('usd-jpy', 159.17);
const daysPerMonth = positiveInteger('days', 30);
const fleetDevices = positiveInteger('fleet-devices', 10_000);
const dustPerNightPerDay = positiveNumber('dust-per-night-day', 5 / 7);
const sleepAfterSeconds = positiveInteger('sleep-after-seconds', 120);

const container = {
  vCpu: 1,
  memoryGiB: 6,
  diskGB: 12,
  cpuUsdPerSecond: 0.000020,
  memoryUsdPerGiBSecond: 0.0000025,
  diskUsdPerGBSecond: 0.00000007,
  includedCpuSeconds: 375 * 60,
  includedMemoryGiBSeconds: 25 * 3600,
  includedDiskGBSeconds: 200 * 3600,
};

const planningAssumptions = {
  workersPaidBaseUsd: 5,
  workerRequestsPerDeviceDay: 35,
  workerCpuMsPerRequest: 3,
  containerDurableObjectRequestsPerAttestation: 3,
  containerDurableObjectMemoryGB: 0.128,
  queueOperationsPerAttestation: 3,
  d1RowsReadPerDeviceDay: 250,
  d1RowsWrittenPerDeviceMonth: 5_130,
  d1FirstMonthStorageGBPerDevice: 0.0008,
};

function rawContainerCost(cpuSeconds, activeSeconds) {
  return (
    cpuSeconds * container.vCpu * container.cpuUsdPerSecond
    + activeSeconds * container.memoryGiB * container.memoryUsdPerGiBSecond
    + activeSeconds * container.diskGB * container.diskUsdPerGBSecond
  );
}

function fleetContainerCost(cpuSeconds, activeSeconds, jobs) {
  return (
    overage(cpuSeconds * jobs * container.vCpu, container.includedCpuSeconds)
      * container.cpuUsdPerSecond
    + overage(
      activeSeconds * jobs * container.memoryGiB,
      container.includedMemoryGiBSeconds,
    ) * container.memoryUsdPerGiBSecond
    + overage(activeSeconds * jobs * container.diskGB, container.includedDiskGBSeconds)
      * container.diskUsdPerGBSecond
  );
}

function platformCost(activeSeconds, jobs) {
  const workerRequests = planningAssumptions.workerRequestsPerDeviceDay
    * fleetDevices * daysPerMonth;
  const workerCpuMs = workerRequests * planningAssumptions.workerCpuMsPerRequest;
  const durableObjectRequests = planningAssumptions.containerDurableObjectRequestsPerAttestation
    * jobs;
  const durableObjectGBSeconds = activeSeconds * jobs
    * planningAssumptions.containerDurableObjectMemoryGB;
  const queueOperations = planningAssumptions.queueOperationsPerAttestation * jobs;
  const d1RowsRead = planningAssumptions.d1RowsReadPerDeviceDay
    * fleetDevices * daysPerMonth;
  const d1RowsWritten = planningAssumptions.d1RowsWrittenPerDeviceMonth * fleetDevices;
  const d1StorageGB = planningAssumptions.d1FirstMonthStorageGBPerDevice * fleetDevices;

  const components = {
    workersPaidBaseUsd: planningAssumptions.workersPaidBaseUsd,
    workerRequestOverageUsd: overage(workerRequests, 10_000_000) / 1_000_000 * 0.30,
    workerCpuOverageUsd: overage(workerCpuMs, 30_000_000) / 1_000_000 * 0.02,
    containerDurableObjectRequestOverageUsd: roundedUnitCost(
      durableObjectRequests,
      1_000_000,
      1_000_000,
      0.15,
    ),
    containerDurableObjectDurationOverageUsd: roundedUnitCost(
      durableObjectGBSeconds,
      400_000,
      1_000_000,
      12.50,
    ),
    queueOverageUsd: overage(queueOperations, 1_000_000) / 1_000_000 * 0.40,
    d1ReadOverageUsd: overage(d1RowsRead, 25_000_000_000) / 1_000_000 * 0.001,
    d1WriteOverageUsd: overage(d1RowsWritten, 50_000_000) / 1_000_000 * 1,
    d1FirstMonthStorageOverageUsd: overage(d1StorageGB, 5) * 0.75,
    logsR2AndEgressUsd: 0,
  };
  return {
    usage: {
      workerRequests,
      workerCpuMs,
      containerDurableObjectRequests: durableObjectRequests,
      containerDurableObjectGBSeconds: rounded(durableObjectGBSeconds, 3),
      queueOperations,
      d1RowsRead,
      d1RowsWritten,
      d1FirstMonthStorageGB: rounded(d1StorageGB, 3),
    },
    components: Object.fromEntries(
      Object.entries(components).map(([key, value]) => [key, rounded(value)]),
    ),
    totalUsd: Object.values(components).reduce((sum, value) => sum + value, 0),
  };
}

const jobs = daysPerMonth * fleetDevices;
const sampleCount = standardSampleCount;
const result = loadResult(resultDirectory);
const proofRequests = result.transactions.attest.proofServerRequests;
const proofRequestMs = proofRequests.reduce((sum, request) => sum + request.durationMs, 0);
const proofRequestSeconds = proofRequestMs / 1000;
const proofServerReadySeconds = result.timing.proofServerReadyMs / 1000;
const cpuSecondsPlanningUpperBound = proofServerReadySeconds + proofRequestSeconds;
const serializedActiveSecondsPlanningUpperBound = (
  result.timing.proofServerReadyMs
  + result.timing.privateStatePreparationMs
  + result.timing.contractConnectionMs
  + result.timing.attestationTransactionMs
) / 1000;
const isolatedActiveSecondsPlanningUpperBound = serializedActiveSecondsPlanningUpperBound
  + sleepAfterSeconds;
const dailyDust = Number(result.transactions.attest.feeDust);
const nightReservePerDevice = dailyDust / dustPerNightPerDay;
const monthlyMarginalBatchUsd = rawContainerCost(
  cpuSecondsPlanningUpperBound * daysPerMonth,
  serializedActiveSecondsPlanningUpperBound * daysPerMonth,
);
const monthlyMarginalIsolatedUsd = rawContainerCost(
  cpuSecondsPlanningUpperBound * daysPerMonth,
  isolatedActiveSecondsPlanningUpperBound * daysPerMonth,
);
const containerFleetUsd = fleetContainerCost(
  cpuSecondsPlanningUpperBound,
  serializedActiveSecondsPlanningUpperBound,
  jobs,
);
const platform = platformCost(serializedActiveSecondsPlanningUpperBound, jobs);
const fleetCloudflareUsd = containerFleetUsd + platform.totalUsd;
const proverOnlyJobsPerWindow = Math.floor(4 * 60 * 60 / proofRequestSeconds);
const serializedJobsPerWindow = Math.floor(
  4 * 60 * 60 / serializedActiveSecondsPlanningUpperBound,
);

const standardUseCase = {
  sampleCount,
  intervalSeconds: result.intervalSeconds,
  thresholdResult: result.thresholdResult,
  measured: {
    datasetPreparationMs: result.timing.datasetPreparationMs,
    completeCommandMs: result.timing.submissionMs,
    proofServerReadyMs: result.timing.proofServerReadyMs,
    privateStatePreparationMs: result.timing.privateStatePreparationMs,
    contractConnectionMs: result.timing.contractConnectionMs,
    proofRequestMs,
    attestationTransactionMs: result.timing.attestationTransactionMs,
    proofRequestBytes: proofRequests.reduce((sum, request) => sum + request.requestBytes, 0),
    transactionBytes: result.transactions.attest.transactionBytes,
  },
  midnight: {
    dailyFeeDust: rounded(dailyDust, 15),
    monthlyFeeDustPerDevice: rounded(dailyDust * daysPerMonth, 9),
    monthlyFeeDustFleet: rounded(dailyDust * jobs, 6),
    planningDustPerNightPerDay: rounded(dustPerNightPerDay, 9),
    nightReservePerDevice: rounded(nightReservePerDevice, 6),
    nightReserveFleet: rounded(nightReservePerDevice * fleetDevices, 3),
    directDustPurchaseCost: null,
  },
  container: {
    cpuSecondsPlanningUpperBound: rounded(cpuSecondsPlanningUpperBound, 3),
    serializedActiveSecondsPlanningUpperBound: rounded(
      serializedActiveSecondsPlanningUpperBound,
      3,
    ),
    isolatedActiveSecondsPlanningUpperBound: rounded(isolatedActiveSecondsPlanningUpperBound, 3),
    monthlyMarginalBatchUsdBeforeIncludedUsage: rounded(monthlyMarginalBatchUsd),
    monthlyMarginalBatchJpyBeforeIncludedUsage: rounded(monthlyMarginalBatchUsd * usdJpy, 2),
    monthlyMarginalIsolatedUsdBeforeIncludedUsage: rounded(monthlyMarginalIsolatedUsd),
    monthlyMarginalIsolatedJpyBeforeIncludedUsage: rounded(
      monthlyMarginalIsolatedUsd * usdJpy,
      2,
    ),
    fleetMonthlyBatchUsdAfterIncludedUsage: rounded(containerFleetUsd),
  },
  cloudflare: {
    fleetDevices,
    fleetMonthlyBatchUsd: rounded(fleetCloudflareUsd),
    fleetMonthlyBatchJpy: rounded(fleetCloudflareUsd * usdJpy, 2),
    fleetMonthlyBatchUsdPerDevice: rounded(fleetCloudflareUsd / fleetDevices, 6),
    fleetMonthlyBatchJpyPerDevice: rounded(fleetCloudflareUsd * usdJpy / fleetDevices, 2),
    platformUsage: platform.usage,
    platformCostUsd: platform.components,
  },
  capacity: {
    currentDeploymentMaxInstances: 1,
    currentDispatchMaximumJobsPerFourHourWindow: 384,
    proofEndpointSecondsPerAttestation: rounded(proofRequestSeconds, 3),
    proverOnlyJobsPerInstancePerFourHourWindow: proverOnlyJobsPerWindow,
    proverOnlyMinimumInstancesForFleetWindow: Math.ceil(fleetDevices / proverOnlyJobsPerWindow),
    serializedJobsPerInstancePerFourHourWindow: serializedJobsPerWindow,
    serializedMinimumInstancesForFleetWindow: Math.ceil(fleetDevices / serializedJobsPerWindow),
    serializedInstancesWith25PercentHeadroom: Math.ceil(
      Math.ceil(fleetDevices / serializedJobsPerWindow) * 1.25,
    ),
  },
};

process.stdout.write(`${JSON.stringify({
  pricingSnapshot: {
    date: '2026-08-28',
    usdJpy,
    daysPerMonth,
    fleetDevices,
  },
  assumptions: {
    standardPlan: 'one raw sample per minute stays on the Device; 1,440 daily readings are reduced to 24 private hourly minimum/maximum slots and one daily attestation transaction',
    costMeasurement: 'only the 1,440-reading Preprod run is used; 24 and 96 readings are circuit-equivalence checks, not separate cost profiles',
    sessionState: 'D1; no session Durable Object',
    containerDurableObject: 'required by Cloudflare Containers and costed separately',
    container: {
      instanceType: 'standard-2',
      sleepAfterSeconds,
      ...container,
    },
    planning: planningAssumptions,
    caveats: [
      'Container CPU uses readiness plus proof endpoint wall time as a conservative upper bound; replace it with billed CPU analytics.',
      'Serialized active time includes the measured chain-confirmation gap because Wave 1 admits only one job until confirmation.',
      'Batch cost omits a duplicated two-minute sleep tail per job; isolated cost includes one tail per device-day.',
      'Worker request planning assumes a right-sized fleet and bounded polling. The current single-instance dispatcher is not a 10,000-device deployment.',
      'D1 writes include index effects and hourly last-seen updates; confirm the estimate with D1 rows_written analytics.',
      'D1 first-month storage grows linearly without retention. Apply the retention policy before production pricing.',
      'DUST is non-transferable and has no direct purchase price. NIGHT reserve is capacity capital, not a consumed daily cash fee.',
      'Logs, R2, and Container egress are zero placeholders until invoice analytics are measured.',
    ],
  },
  standardUseCase,
}, null, 2)}\n`);
