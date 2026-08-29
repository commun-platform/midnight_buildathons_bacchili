import crypto from 'node:crypto';
import { appendFileSync, statSync, writeFileSync } from 'node:fs';

import * as Cause from 'effect/Cause';
import * as Runtime from 'effect/Runtime';

export const sponsorWalletBootId = crypto.randomUUID();
export const sponsorWalletDiagnosticPath = '/tmp/sponsor-wallet-diagnostics.jsonl';

const maximumDiagnosticBytes = 1024 * 1024;

type DiagnosticFields = Record<string, unknown>;

type SafeErrorCause = {
  name: string;
  tag: string | null;
  message: string;
  code: string | number | null;
};

function errorCode(error: Error): string | number | null {
  const value = (error as Error & { code?: unknown }).code;
  return typeof value === 'string' || typeof value === 'number' ? value : null;
}

export function safeErrorCauses(error: unknown): SafeErrorCause[] {
  const causes: SafeErrorCause[] = [];
  const visited = new Set<unknown>();
  const roots: unknown[] = Runtime.isFiberFailure(error)
    ? Cause.prettyErrors(error[Runtime.FiberFailureCauseId])
    : [error];
  for (const root of roots) {
    let current: unknown = root;
    while (
      current !== null
      && current !== undefined
      && causes.length < 5
      && !visited.has(current)
    ) {
      visited.add(current);
      const value = current as {
        name?: unknown;
        _tag?: unknown;
        message?: unknown;
        code?: unknown;
        cause?: unknown;
      };
      causes.push({
        name: typeof value.name === 'string' ? value.name.slice(0, 120) : 'UnknownError',
        tag: typeof value._tag === 'string' ? value._tag.slice(0, 120) : null,
        message: typeof value.message === 'string'
          ? value.message.slice(0, 500)
          : String(current).slice(0, 500),
        code: typeof value.code === 'string' || typeof value.code === 'number'
          ? value.code
          : null,
      });
      current = value.cause;
    }
  }
  return causes;
}

export function diagnosticError(error: unknown): DiagnosticFields {
  if (!(error instanceof Error)) {
    return {
      errorName: 'UnknownError',
      errorMessage: String(error).slice(0, 2_000),
      errorCode: null,
    };
  }
  const cause = error.cause instanceof Error ? error.cause : null;
  return {
    errorName: error.name,
    errorMessage: error.message.slice(0, 2_000),
    errorCode: errorCode(error),
    errorCauseName: cause?.name,
    errorCauseMessage: cause?.message.slice(0, 2_000),
    errorCauseCode: cause ? errorCode(cause) : null,
    errorStack: error.stack?.split('\n').slice(0, 12).join('\n'),
    errorCauses: safeErrorCauses(error),
  };
}

export function diagnosticLog(
  message: string,
  fields: DiagnosticFields = {},
  level: 'error' | 'log' | 'warn' = 'log',
): void {
  const memory = process.memoryUsage();
  const value = JSON.stringify({
    message,
    bootId: sponsorWalletBootId,
    timestamp: new Date().toISOString(),
    uptimeMs: Math.round(process.uptime() * 1_000),
    pid: process.pid,
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    externalBytes: memory.external,
    ...fields,
  });
  try {
    const bytes = Buffer.byteLength(value, 'utf8') + 1;
    const currentBytes = statSync(sponsorWalletDiagnosticPath, {
      throwIfNoEntry: false,
    })?.size ?? 0;
    if (currentBytes + bytes > maximumDiagnosticBytes) {
      writeFileSync(sponsorWalletDiagnosticPath, `${value}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
    } else {
      appendFileSync(sponsorWalletDiagnosticPath, `${value}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
    }
  } catch {
    // Cloud logging remains authoritative if the ephemeral diagnostic file
    // cannot be written. The file exists only so internal runtime diagnostics
    // remain useful while Wallet SDK work occupies the HTTP event loop.
  }
  console[level](value);
}

export function safeEndpoint(value: string | URL): string {
  try {
    const url = new URL(value.toString());
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return 'invalid-endpoint';
  }
}
