import './polyfills.js';
import { browserDeviceFlow } from './device-flow.js';
import {
  loadPublicAttestationByTransactionHash,
  verifyPublicAttestation,
} from './public-verifier.js';

export {
  browserDeviceFlow,
  loadPublicAttestationByTransactionHash,
  verifyPublicAttestation,
};
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
  PublicChainProofRecord,
} from './public-verifier.js';
