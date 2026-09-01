import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  parseSponsorCheckpointUpload,
  preserveSponsorRecoveryCheckpoint,
  restoreSponsorRecoveryCheckpoint,
  sponsorCheckpointKey,
  sponsorCheckpointRecoveryKey,
  storeSponsorCheckpoint,
  storeSponsorDustReplayCheckpoint,
} from './sponsor-checkpoint.js';

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

  it('accepts a periodic push only with validated synchronization progress', () => {
    const periodicHeaders = {
      'Content-Length': '4',
      'Content-Type': 'application/octet-stream',
      'X-Sponsor-Boot-Id': 'c290f1ee-6c54-4b01-90e6-d701748f0851',
      'X-Sponsor-Checkpoint-Reason': 'periodic-sync',
      'X-Sponsor-Checkpoint-Phase': 'syncing',
      'X-Sponsor-Checkpoint-Shielded-Applied': '1466979',
      'X-Sponsor-Checkpoint-Unshielded-Applied': '577250',
      'X-Sponsor-Checkpoint-Dust-Applied': '463779',
    };
    expect(parseSponsorCheckpointUpload(request({ headers: periodicHeaders })).progress).toEqual({
      bootId: 'c290f1ee-6c54-4b01-90e6-d701748f0851',
      phase: 'syncing',
      shieldedApplied: '1466979',
      unshieldedApplied: '577250',
      dustApplied: '463779',
    });
    expect(() => parseSponsorCheckpointUpload(request({
      headers: {
        ...periodicHeaders,
        'X-Sponsor-Checkpoint-Dust-Applied': 'not-a-position',
      },
    }))).toThrow(/progress/u);
  });
});

function checkpointEnv(initial: Record<string, Uint8Array>) {
  const objects = new Map(Object.entries(initial));
  const deleted: string[] = [];
  const env = {
    SPONSOR_STATE: {
      async head(key: string) {
        const bytes = objects.get(key);
        return bytes ? { size: bytes.byteLength, customMetadata: {} } : null;
      },
      async get(key: string) {
        const bytes = objects.get(key);
        if (!bytes) return null;
        return {
          size: bytes.byteLength,
          body: new Response(bytes).body,
          async arrayBuffer() { return bytes.buffer.slice(0); },
        };
      },
      async put(key: string, body: ReadableStream<Uint8Array>) {
        objects.set(key, new Uint8Array(await new Response(body).arrayBuffer()));
      },
      async delete(key: string) {
        deleted.push(key);
        objects.delete(key);
      },
    },
  } as unknown as Env;
  return { env, objects, deleted };
}

describe('Sponsor Wallet recovery checkpoint', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('freezes the main pre-reservation checkpoint without copying it', async () => {
    vi.stubGlobal('FixedLengthStream', class {
      readonly readable: ReadableStream<Uint8Array>;
      readonly writable: WritableStream<Uint8Array>;

      constructor() {
        const stream = new TransformStream<Uint8Array, Uint8Array>();
        this.readable = stream.readable;
        this.writable = stream.writable;
      }
    });
    const checkpoint = new Uint8Array([1, 3, 3, 7]);
    const { env, objects, deleted } = checkpointEnv({
      [sponsorCheckpointKey]: checkpoint,
      [sponsorCheckpointRecoveryKey]: new Uint8Array([9]),
    });

    await preserveSponsorRecoveryCheckpoint(env);

    expect(objects.get(sponsorCheckpointKey)).toEqual(checkpoint);
    expect(objects.has(sponsorCheckpointRecoveryKey)).toBe(false);
    expect(deleted).toEqual([sponsorCheckpointRecoveryKey]);
  });

  it('restores the preserved checkpoint and consumes it exactly once', async () => {
    vi.stubGlobal('FixedLengthStream', class {
      readonly readable: ReadableStream<Uint8Array>;
      readonly writable: WritableStream<Uint8Array>;

      constructor() {
        const stream = new TransformStream<Uint8Array, Uint8Array>();
        this.readable = stream.readable;
        this.writable = stream.writable;
      }
    });
    const recovery = new Uint8Array([9, 8, 7, 6]);
    const { env, objects, deleted } = checkpointEnv({
      [sponsorCheckpointKey]: new Uint8Array([1]),
      [sponsorCheckpointRecoveryKey]: recovery,
    });

    expect(await restoreSponsorRecoveryCheckpoint(env)).toBe(true);

    expect(objects.get(sponsorCheckpointKey)).toEqual(recovery);
    expect(objects.has(sponsorCheckpointRecoveryKey)).toBe(false);
    expect(deleted).toEqual([sponsorCheckpointRecoveryKey]);
  });

  it('uses the frozen main checkpoint when no maintenance recovery copy exists', async () => {
    vi.stubGlobal('FixedLengthStream', class {
      readonly readable: ReadableStream<Uint8Array>;
      readonly writable: WritableStream<Uint8Array>;

      constructor() {
        const stream = new TransformStream<Uint8Array, Uint8Array>();
        this.readable = stream.readable;
        this.writable = stream.writable;
      }
    });
    const { env, objects, deleted } = checkpointEnv({
      [sponsorCheckpointKey]: new Uint8Array([1]),
    });

    expect(await restoreSponsorRecoveryCheckpoint(env)).toBe(true);

    expect(objects.get(sponsorCheckpointKey)).toEqual(new Uint8Array([1]));
    expect(deleted).toEqual([]);
  });

  it('stores a base checkpoint that can restart only the DUST scan', async () => {
    vi.stubGlobal('FixedLengthStream', class {
      readonly readable: ReadableStream<Uint8Array>;
      readonly writable: WritableStream<Uint8Array>;

      constructor() {
        const stream = new TransformStream<Uint8Array, Uint8Array>();
        this.readable = stream.readable;
        this.writable = stream.writable;
      }
    });
    const checkpoint = new Uint8Array([4, 2, 4, 2]);
    const { env, objects } = checkpointEnv({});

    await storeSponsorDustReplayCheckpoint(
      env,
      new Response(checkpoint).body!,
      checkpoint.byteLength,
    );

    expect(objects.get(sponsorCheckpointRecoveryKey)).toEqual(checkpoint);
  });

  it('aborts the complete Container-to-R2 stream when its operation deadline expires', async () => {
    vi.stubGlobal('FixedLengthStream', class {
      readonly readable: ReadableStream<Uint8Array>;
      readonly writable: WritableStream<Uint8Array>;

      constructor() {
        const stream = new TransformStream<Uint8Array, Uint8Array>();
        this.readable = stream.readable;
        this.writable = stream.writable;
      }
    });
    let sourceCancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() {
        sourceCancelled = true;
      },
    });
    const { env } = checkpointEnv({});
    const controller = new AbortController();
    controller.abort();

    await expect(storeSponsorCheckpoint(
      env,
      body,
      4,
      { source: 'periodic-pull' },
      controller.signal,
    )).rejects.toThrow();
    expect(sourceCancelled).toBe(true);
  });
});
