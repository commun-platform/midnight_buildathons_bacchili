import { describe, expect, it } from 'vitest';

import { parseSponsorCheckpointUpload } from './sponsor-checkpoint.js';

function request(overrides: RequestInit = {}): Request {
  return new Request('http://state.internal/sponsor-checkpoint', {
    method: 'POST',
    headers: {
      'Content-Length': '4',
      'Content-Type': 'application/octet-stream',
      'X-Sponsor-Boot-Id': 'c290f1ee-6c54-4b01-90e6-d701748f0851',
      'X-Sponsor-Checkpoint-Reason': 'SIGTERM',
    },
    body: new Uint8Array([1, 2, 3, 4]),
    ...overrides,
  });
}

describe('Sponsor Wallet internal checkpoint upload', () => {
  it('accepts only the bounded internal shutdown format', () => {
    const parsed = parseSponsorCheckpointUpload(request());
    expect(parsed.bytes).toBe(4);
    expect(parsed.reason).toBe('SIGTERM');
  });

  it('rejects an invalid reason and oversized body declaration', () => {
    expect(() => parseSponsorCheckpointUpload(request({
      headers: {
        'Content-Length': '4',
        'Content-Type': 'application/octet-stream',
        'X-Sponsor-Boot-Id': 'c290f1ee-6c54-4b01-90e6-d701748f0851',
        'X-Sponsor-Checkpoint-Reason': 'arbitrary-request',
      },
    }))).toThrow(/reason/u);
    expect(() => parseSponsorCheckpointUpload(request({
      headers: {
        'Content-Length': String(129 * 1024 * 1024),
        'Content-Type': 'application/octet-stream',
        'X-Sponsor-Boot-Id': 'c290f1ee-6c54-4b01-90e6-d701748f0851',
        'X-Sponsor-Checkpoint-Reason': 'SIGTERM',
      },
    }))).toThrow(/Content-Length/u);
  });
});
