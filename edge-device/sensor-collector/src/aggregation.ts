import crypto from 'node:crypto';

export interface MeasurementWindowState {
  periodStart: string;
  periodEnd: string;
  count: number;
  minimum: number;
  maximum: number;
  sum: number;
  hashChain: string;
}

export interface MeasurementWindow {
  batchId: string;
  projectId: string;
  deviceId: string;
  sensorType: 'temperature';
  unit: '°C';
  periodStart: string;
  periodEnd: string;
  count: number;
  minimum: number;
  maximum: number;
  average: number;
  commitment: string;
  thresholdPolicyVersion: string;
}

export interface AnomalyState {
  state: 'normal' | 'anomaly_open';
  pendingTransition: 'anomaly_open' | 'recovered' | null;
  pendingCount: number;
  lastEventAt: string | null;
}

export interface AnomalyEvent {
  eventId: string;
  projectId: string;
  deviceId: string;
  sensorType: 'temperature';
  unit: '°C';
  transition: 'anomaly_open' | 'recovered';
  occurredAt: string;
  thresholdPolicyVersion: string;
}

const emptyHash = Buffer.alloc(32).toString('base64url');

function rounded(value: number): number {
  return Number(value.toFixed(3));
}

export function hourBounds(measuredAt: Date): { start: string; end: string } {
  const start = new Date(measuredAt);
  start.setUTCMinutes(0, 0, 0);
  const end = new Date(start.valueOf() + 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function nextHash(previous: string, measuredAt: string, value: number): string {
  return crypto.createHash('sha256')
    .update(previous)
    .update('\n')
    .update(measuredAt)
    .update('\n')
    .update(value.toFixed(3))
    .digest('base64url');
}

export function createMeasurementWindow(measuredAt: Date): MeasurementWindowState {
  const bounds = hourBounds(measuredAt);
  return {
    periodStart: bounds.start,
    periodEnd: bounds.end,
    count: 0,
    minimum: Number.POSITIVE_INFINITY,
    maximum: Number.NEGATIVE_INFINITY,
    sum: 0,
    hashChain: emptyHash,
  };
}

export function addMeasurement(
  state: MeasurementWindowState,
  value: number,
  measuredAt: Date,
): MeasurementWindowState {
  const timestamp = measuredAt.toISOString();
  if (timestamp < state.periodStart || timestamp >= state.periodEnd) {
    throw new Error('Measurement does not belong to the active one-hour window');
  }
  return {
    ...state,
    count: state.count + 1,
    minimum: Math.min(state.minimum, value),
    maximum: Math.max(state.maximum, value),
    sum: state.sum + value,
    hashChain: nextHash(state.hashChain, timestamp, value),
  };
}

export function finalizeMeasurementWindow(input: {
  state: MeasurementWindowState;
  projectId: string;
  deviceId: string;
  thresholdPolicyVersion: string;
}): MeasurementWindow {
  if (input.state.count < 1) throw new Error('Cannot finalize an empty measurement window');
  return {
    batchId: `window-${input.deviceId}-${Date.parse(input.state.periodStart)}`,
    projectId: input.projectId,
    deviceId: input.deviceId,
    sensorType: 'temperature',
    unit: '°C',
    periodStart: input.state.periodStart,
    periodEnd: input.state.periodEnd,
    count: input.state.count,
    minimum: rounded(input.state.minimum),
    maximum: rounded(input.state.maximum),
    average: rounded(input.state.sum / input.state.count),
    commitment: input.state.hashChain,
    thresholdPolicyVersion: input.thresholdPolicyVersion,
  };
}

export function initialAnomalyState(): AnomalyState {
  return {
    state: 'normal',
    pendingTransition: null,
    pendingCount: 0,
    lastEventAt: null,
  };
}

export function evaluateAnomaly(input: {
  state: AnomalyState;
  value: number;
  measuredAt: Date;
  projectId: string;
  deviceId: string;
  normalMinimum: number;
  normalMaximum: number;
  hysteresis: number;
  debounceSamples: number;
  cooldownSeconds: number;
  thresholdPolicyVersion: string;
}): { state: AnomalyState; event: AnomalyEvent | null } {
  const outside = input.value < input.normalMinimum || input.value > input.normalMaximum;
  const recovered = input.value >= input.normalMinimum + input.hysteresis
    && input.value <= input.normalMaximum - input.hysteresis;
  const candidate = input.state.state === 'normal'
    ? outside ? 'anomaly_open' : null
    : recovered ? 'recovered' : null;
  if (!candidate) {
    return {
      state: { ...input.state, pendingTransition: null, pendingCount: 0 },
      event: null,
    };
  }
  const pendingCount = input.state.pendingTransition === candidate
    ? input.state.pendingCount + 1
    : 1;
  if (pendingCount < input.debounceSamples) {
    return {
      state: { ...input.state, pendingTransition: candidate, pendingCount },
      event: null,
    };
  }
  const lastEventTime = input.state.lastEventAt ? Date.parse(input.state.lastEventAt) : 0;
  if (input.measuredAt.valueOf() - lastEventTime < input.cooldownSeconds * 1000) {
    return {
      state: { ...input.state, pendingTransition: candidate, pendingCount },
      event: null,
    };
  }
  const occurredAt = input.measuredAt.toISOString();
  const event: AnomalyEvent = {
    eventId: `anomaly-${input.deviceId}-${input.measuredAt.valueOf()}-${candidate}`,
    projectId: input.projectId,
    deviceId: input.deviceId,
    sensorType: 'temperature',
    unit: '°C',
    transition: candidate,
    occurredAt,
    thresholdPolicyVersion: input.thresholdPolicyVersion,
  };
  return {
    state: {
      state: candidate === 'anomaly_open' ? 'anomaly_open' : 'normal',
      pendingTransition: null,
      pendingCount: 0,
      lastEventAt: occurredAt,
    },
    event,
  };
}
