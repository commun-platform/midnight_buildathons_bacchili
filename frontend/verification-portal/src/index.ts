import './polyfills.js';
import { browserDeviceFlow } from './device-flow.js';
import { verifyPublicAttestation } from './public-verifier.js';

export { browserDeviceFlow, verifyPublicAttestation };
export type {
  BrowserDevice,
  DeviceHistory,
  DevicePolicy,
  ProofJob,
  ProvisionedDevice,
  ProvisioningConfiguration,
} from './device-flow.js';
export type { BrowserDailyCapture, DailyGenerationMode, DailySampleCount } from './daily-captures.js';
export type { SubmissionProgress } from './midnight-device.js';
export type {
  PublicAttestationChecks,
  PublicAttestationRecord,
} from './public-verifier.js';
