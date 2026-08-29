import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { deviceWalletHome } from './config.js';

interface LockOwner {
  version: 1;
  pid: number;
  command: string;
  startedAt: string;
  token: string;
}

export interface WalletExecutionLock {
  release(): void;
}

const defaultLockDirectory = path.join(deviceWalletHome, '.operation.lock');
const initializingGraceMs = 30_000;

function activeProcess(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function readOwner(ownerFile: string): LockOwner | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(ownerFile, 'utf8')) as Partial<LockOwner>;
    if (
      parsed.version !== 1
      || !Number.isSafeInteger(parsed.pid)
      || Number(parsed.pid) <= 0
      || typeof parsed.command !== 'string'
      || typeof parsed.startedAt !== 'string'
      || typeof parsed.token !== 'string'
    ) {
      return undefined;
    }
    return parsed as LockOwner;
  } catch {
    return undefined;
  }
}

function removeStaleLock(lockDirectory: string, ownerFile: string): void {
  try {
    fs.unlinkSync(ownerFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  try {
    fs.rmdirSync(lockDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export function acquireWalletExecutionLock(
  command: string,
  lockDirectory = defaultLockDirectory,
): WalletExecutionLock {
  fs.mkdirSync(path.dirname(lockDirectory), { recursive: true, mode: 0o700 });
  const ownerFile = path.join(lockDirectory, 'owner.json');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.mkdirSync(lockDirectory, { mode: 0o700 });
      const owner: LockOwner = {
        version: 1,
        pid: process.pid,
        command,
        startedAt: new Date().toISOString(),
        token: crypto.randomBytes(16).toString('hex'),
      };
      try {
        fs.writeFileSync(ownerFile, `${JSON.stringify(owner, null, 2)}\n`, {
          encoding: 'utf8',
          mode: 0o600,
          flag: 'wx',
        });
      } catch (error) {
        removeStaleLock(lockDirectory, ownerFile);
        throw error;
      }

      let released = false;
      return {
        release(): void {
          if (released) return;
          released = true;
          const current = readOwner(ownerFile);
          if (current?.token !== owner.token) return;
          removeStaleLock(lockDirectory, ownerFile);
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const owner = readOwner(ownerFile);
      if (owner && activeProcess(owner.pid)) {
        throw new Error(
          `Another Device Wallet operation is already running (PID ${owner.pid}, command ${owner.command})`,
        );
      }
      if (!owner) {
        const ageMs = Date.now() - fs.statSync(lockDirectory).mtimeMs;
        if (ageMs < initializingGraceMs) {
          throw new Error('Another Device Wallet operation is acquiring the execution lock');
        }
      }
      removeStaleLock(lockDirectory, ownerFile);
    }
  }

  throw new Error('Could not acquire the Device Wallet execution lock');
}

export async function withWalletExecutionLock<T>(
  command: string,
  operation: () => Promise<T>,
): Promise<T> {
  const lock = acquireWalletExecutionLock(command);
  const interrupted = (exitCode: number) => (): never => {
    lock.release();
    process.exit(exitCode);
  };
  const onSigint = interrupted(130);
  const onSigterm = interrupted(143);
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);
  try {
    return await operation();
  } finally {
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
    lock.release();
  }
}
