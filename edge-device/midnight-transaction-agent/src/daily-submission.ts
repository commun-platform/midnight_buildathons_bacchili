import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { DeviceOperationConfiguration } from '@midnight-demo/device-auth';
import {
  operationalPeriodDate,
  operationalPeriodStart,
  prepareDailyExtremaAttestation,
  type PreparedDailyExtremaAttestation,
  type SensorRecord,
} from '@midnight-demo/shared';

import type { SubmissionResult } from './midnight.js';

const dayMs = 86_400_000;

class DailyInputError extends Error {}

interface PreparedDay {
  schemaVersion: 1;
  sourceDigest: string;
  dataset: PreparedDailyExtremaAttestation;
}

export interface DailySubmissionOptions {
  configuration: DeviceOperationConfiguration;
  dataDirectory: string;
  stateDirectory: string;
  now?: number;
  maxDays?: number;
  submit(dataset: PreparedDailyExtremaAttestation): Promise<SubmissionResult | null>;
}

export interface DailySubmissionReport {
  confirmed: string[];
  deferred: string[];
  failed: Array<{ periodDate: string; error: string }>;
}

function digest(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function writeDurableJson(file: string, value: unknown): void {
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomBytes(8).toString('hex')}`;
  const descriptor = fs.openSync(temporary, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(value)}\n`);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporary, file);
  const directory = fs.openSync(path.dirname(file), 'r');
  try {
    fs.fsyncSync(directory);
  } finally {
    fs.closeSync(directory);
  }
}

// Raw values never leave this process except through the existing private proof path.
function readRawFile(file: string, deviceId: string): SensorRecord[] {
  const contents = fs.readFileSync(file, 'utf8');
  if (contents && !contents.endsWith('\n')) {
    throw new DailyInputError(`Incomplete raw file ${path.basename(file)}; retry after collection completes`);
  }
  return contents.split('\n').filter(Boolean).map((line, index) => {
    let raw: { measuredAt?: unknown; value?: unknown };
    try {
      raw = JSON.parse(line) as typeof raw;
    } catch {
      throw new DailyInputError(`Invalid raw JSON in ${path.basename(file)} at line ${index + 1}`);
    }
    if (
      !raw || typeof raw.measuredAt !== 'string'
      || !Number.isFinite(Date.parse(raw.measuredAt))
      || new Date(raw.measuredAt).toISOString() !== raw.measuredAt
      || raw.measuredAt.slice(0, 10) !== path.basename(file, '.ndjson')
      || typeof raw.value !== 'number' || !Number.isFinite(raw.value)
    ) throw new DailyInputError(`Invalid raw measurement in ${path.basename(file)} at line ${index + 1}`);
    return {
      deviceId,
      timestamp: raw.measuredAt,
      temperature: raw.value,
      // The existing input type requires humidity; the temperature-only circuit ignores it.
      humidity: 0,
    };
  });
}

export function readOperationalDay(
  rawDirectory: string,
  configuration: DeviceOperationConfiguration,
  periodDate: string,
): SensorRecord[] {
  const start = operationalPeriodStart(periodDate, configuration.assignment).valueOf();
  const end = start + dayMs;
  const firstShard = new Date(start).toISOString().slice(0, 10);
  const lastShard = new Date(end - 1).toISOString().slice(0, 10);
  const records = [...new Set([firstShard, lastShard])].flatMap((date) => {
    const file = path.join(rawDirectory, `${date}.ndjson`);
    return fs.existsSync(file) ? readRawFile(file, configuration.device.deviceId) : [];
  }).filter((record) => {
    const timestamp = Date.parse(record.timestamp);
    return timestamp >= start && timestamp < end;
  }).sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  for (let index = 1; index < records.length; index += 1) {
    if (records[index]?.timestamp === records[index - 1]?.timestamp) {
      throw new DailyInputError(`Duplicate measurement timestamp in ${periodDate}`);
    }
  }
  return records;
}

export async function submitCompletedDays(options: DailySubmissionOptions): Promise<DailySubmissionReport> {
  const { configuration, dataDirectory, stateDirectory, submit } = options;
  const now = options.now ?? Date.now();
  const maxDays = options.maxDays ?? 7;
  if (!Number.isFinite(now) || !Number.isSafeInteger(maxDays) || maxDays < 1 || maxDays > 31) {
    throw new Error('Daily submission requires a valid clock and maxDays between 1 and 31');
  }
  const rawDirectory = path.join(dataDirectory, 'raw');
  const shards = fs.readdirSync(rawDirectory).filter((name) => /^\d{4}-\d{2}-\d{2}\.ndjson$/u.test(name)).sort();
  const report: DailySubmissionReport = { confirmed: [], deferred: [], failed: [] };
  let first: SensorRecord | undefined;
  for (const name of shards) {
    first = readRawFile(path.join(rawDirectory, name), configuration.device.deviceId)[0];
    if (first) break;
  }
  if (!first) return report;
  const scope = digest([
    configuration.device.projectId, configuration.device.deviceId,
    configuration.midnight.network, configuration.midnight.contractAddress,
    configuration.policy.id, configuration.assignment.id,
    configuration.assignment.timeZoneOffsetMinutes, configuration.assignment.localDayStartHour,
  ]);
  const directory = path.join(stateDirectory, scope);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(stateDirectory, 0o700);
  fs.chmodSync(directory, 0o700);
  const firstDate = operationalPeriodDate(Date.parse(first.timestamp), configuration.assignment);
  const firstStart = operationalPeriodStart(firstDate, configuration.assignment).valueOf();
  const validFrom = configuration.assignment.validFrom === null ? -Infinity : Date.parse(configuration.assignment.validFrom);
  const validUntil = configuration.assignment.validUntil === null ? Infinity : Date.parse(configuration.assignment.validUntil);
  if (Number.isNaN(validFrom) || Number.isNaN(validUntil)) throw new Error('Invalid assignment validity');
  const dates: string[] = [];
  // Leave five minutes for an in-flight final sample to finish its durable append.
  for (let start = firstStart; start + dayMs <= now - 300_000; start += dayMs) {
    if (start < validFrom || start + dayMs > validUntil) continue;
    dates.push(operationalPeriodDate(start, configuration.assignment));
  }
  const cursorFile = path.join(directory, 'cursor.json');
  const cursor = fs.existsSync(cursorFile)
    ? (JSON.parse(fs.readFileSync(cursorFile, 'utf8')) as { lastAttemptedDate?: string }).lastAttemptedDate
    : undefined;
  if (cursor !== undefined && !/^\d{4}-\d{2}-\d{2}$/u.test(cursor)) throw new Error('Invalid daily retry cursor');
  // Rotate bounded batches so permanent failures cannot starve newer completed days.
  const orderedDates = cursor
    ? [...dates.filter((date) => date > cursor), ...dates.filter((date) => date <= cursor)]
    : dates;
  let attempted = 0;
  for (const periodDate of orderedDates) {
    const preparedFile = path.join(directory, `${periodDate}.prepared.json`);
    const receiptFile = path.join(directory, `${periodDate}.receipt.json`);
    if (fs.existsSync(receiptFile)) {
      const receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8')) as {
        schemaVersion?: number; periodDate?: string; scope?: string; transaction?: { txHash?: string };
      };
      if (receipt.schemaVersion !== 1 || receipt.periodDate !== periodDate || receipt.scope !== scope
        || !receipt.transaction?.txHash) throw new Error(`Invalid daily receipt for ${periodDate}`);
      continue;
    }
    if (attempted >= maxDays) break;
    attempted += 1;
    writeDurableJson(cursorFile, { lastAttemptedDate: periodDate });
    try {
      const records = readOperationalDay(rawDirectory, configuration, periodDate);
      const sourceDigest = digest(records);
      let prepared: PreparedDay;
      if (fs.existsSync(preparedFile)) {
        try {
          prepared = JSON.parse(fs.readFileSync(preparedFile, 'utf8')) as PreparedDay;
        } catch {
          throw new DailyInputError(`Invalid saved daily preparation for ${periodDate}`);
        }
        if (prepared.schemaVersion !== 1 || prepared.sourceDigest !== sourceDigest) {
          throw new DailyInputError(`Raw data changed after daily preparation for ${periodDate}`);
        }
        const expected = await prepareDailyExtremaAttestation(records, {
          deviceId: configuration.device.deviceId,
          periodDate,
          policyId: configuration.policy.id,
          assignmentId: configuration.assignment.id,
          timeZoneOffsetMinutes: configuration.assignment.timeZoneOffsetMinutes,
          localDayStartHour: configuration.assignment.localDayStartHour,
          measurementGroupId: `continuous:${configuration.device.deviceId}:${configuration.assignment.id}:${periodDate}`,
        });
        // Compare source-derived slots and public identity; nonce and its commitment are verified by runSubmit.
        if (JSON.stringify(expected.privateData.hours) !== JSON.stringify(prepared.dataset.privateData.hours)
          || expected.publicData.measurementGroupId !== prepared.dataset.publicData.measurementGroupId
          || expected.publicData.periodStart !== prepared.dataset.publicData.periodStart
          || expected.publicData.assignmentKey !== prepared.dataset.publicData.assignmentKey
          || expected.publicData.deviceCommitment !== prepared.dataset.publicData.deviceCommitment) {
          throw new DailyInputError(`Prepared daily input does not match its source for ${periodDate}`);
        }
      } else {
        const dataset = await prepareDailyExtremaAttestation(records, {
          deviceId: configuration.device.deviceId,
          periodDate,
          policyId: configuration.policy.id,
          assignmentId: configuration.assignment.id,
          timeZoneOffsetMinutes: configuration.assignment.timeZoneOffsetMinutes,
          localDayStartHour: configuration.assignment.localDayStartHour,
          measurementGroupId: `continuous:${configuration.device.deviceId}:${configuration.assignment.id}:${periodDate}`,
        });
        prepared = { schemaVersion: 1, sourceDigest, dataset };
        writeDurableJson(preparedFile, prepared);
      }
      const result = await submit(prepared.dataset);
      if (result === null) {
        report.deferred.push(periodDate);
        continue;
      }
      if (!result.attest.txHash) throw new Error('Daily transaction confirmation has no hash');
      writeDurableJson(receiptFile, {
        schemaVersion: 1, scope, periodDate, confirmedAt: new Date().toISOString(),
        sourceDigest, publicData: prepared.dataset.publicData, transaction: result.attest,
      });
      report.confirmed.push(periodDate);
    } catch (error) {
      // Remote/SDK exceptions can contain private proof input. Keep details on the Device.
      writeDurableJson(path.join(directory, `${periodDate}.error.json`), {
        failedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
      report.failed.push({
        periodDate,
        error: error instanceof DailyInputError ? error.message
          : 'Daily submission failed; details are retained in the owner-only daily error file',
      });
    }
  }
  return report;
}
