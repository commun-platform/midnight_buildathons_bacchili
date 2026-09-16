/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { recoverReleasedProofJob } from './reproof-recovery.js';
import type { SqlDatabase, SqlParameter } from './storage/index.js';

function bindings(params: readonly SqlParameter[]) {
  return Object.fromEntries(params.map((value, index) => [`?${index + 1}`, value]));
}

const opened: DatabaseSync[] = [];
afterEach(() => { for (const db of opened.splice(0)) db.close(); });

function fixture() {
  const db = new DatabaseSync(':memory:');
  opened.push(db);
  db.exec(`CREATE TABLE daily_proof_jobs (
    id TEXT PRIMARY KEY, origin TEXT DEFAULT 'device', status TEXT,
    last_error_code TEXT DEFAULT 'contract_state_changed_reproof_required',
    attempt_count INTEGER DEFAULT 1, sponsor_attempt_count INTEGER DEFAULT 2,
    created_at TEXT DEFAULT '2026-09-15T15:05:00.000Z', updated_at TEXT,
    period_date TEXT DEFAULT '2026-09-15', attestation_commitment TEXT DEFAULT 'retained',
    device_transaction_object_key TEXT, device_transaction_hash TEXT,
    sponsor_transaction_object_key TEXT, sponsor_serialized_sha256 TEXT,
    sponsor_transaction_id TEXT, sponsorship_completed_at TEXT,
    attest_tx_id TEXT, attest_tx_hash TEXT, block_height TEXT,
    lease_expires_at TEXT, sponsor_lease_expires_at TEXT,
    available_after TEXT, proof_artifact_key TEXT, proof_generated_at TEXT,
    sponsor_available_after TEXT, sponsor_stage TEXT, sponsor_reason_code TEXT,
    sponsor_stage_updated_at TEXT
  ); INSERT INTO daily_proof_jobs (id,status,updated_at,proof_generated_at)
    VALUES ('job','reproof_required','2026-09-16T01:24:00.000Z','old-proof');`);
  db.exec(readFileSync(new URL('../../d1-schema/migrations/0039_proof_recovery_attempts.sql', import.meta.url), 'utf8'));
  const database: SqlDatabase = {
    kind: 'd1',
    async first<T>(sql: string, params: readonly SqlParameter[] = []) { return (db.prepare(sql).get(bindings(params)) ?? null) as T | null; },
    async all<T>(sql: string, params: readonly SqlParameter[] = []) { return db.prepare(sql).all(bindings(params)) as T[]; },
    async execute(sql, params = []) { return Number(db.prepare(sql).run(bindings(params)).changes); },
    async batch(statements) {
      db.exec('BEGIN');
      try {
        for (const s of statements) db.prepare(s.sql).run(bindings(s.parameters ?? []));
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
  return { db, database, now: new Date('2026-09-16T06:00:00.000Z') };
}

describe('Retained request reproof recovery', () => {
  it('requeues exactly once and retains the original request and cumulative attempts', async () => {
    const { db, database, now } = fixture();
    expect(await Promise.all([
      recoverReleasedProofJob(database, 'job', now),
      recoverReleasedProofJob(database, 'job', now),
    ])).toEqual([true, false]);
    expect(db.prepare('SELECT * FROM daily_proof_jobs').get()).toMatchObject({
      id: 'job', status: 'pending', period_date: '2026-09-15',
      created_at: '2026-09-15T15:05:00.000Z', attestation_commitment: 'retained',
      attempt_count: 1, sponsor_attempt_count: 2, proof_generated_at: null,
    });
    expect(db.prepare('SELECT * FROM proof_recovery_attempts').all()).toHaveLength(1);
  });

  it.each(['confirmed', 'submitted', 'sponsored', 'sponsoring', 'pending', 'dead_lettered'])(
    'never rewinds %s', async (status) => {
      const { db, database, now } = fixture();
      db.prepare('UPDATE daily_proof_jobs SET status = ?').run(status);
      expect(await recoverReleasedProofJob(database, 'job', now)).toBe(false);
    },
  );

  it.each([
    ['device_transaction_hash', 'old'], ['sponsor_transaction_object_key', 'old'],
    ['attest_tx_id', 'old'], ['block_height', '123'],
    ['lease_expires_at', '2026-09-17T00:00:00.000Z'],
    ['sponsor_lease_expires_at', '2026-09-17T00:00:00.000Z'],
    ['last_error_code', 'unknown'], ['origin', 'managed-api'],
  ])('rejects unsafe recovery with %s', async (column, value) => {
    const { db, database, now } = fixture();
    db.prepare(`UPDATE daily_proof_jobs SET ${column} = ?`).run(value);
    expect(await recoverReleasedProofJob(database, 'job', now)).toBe(false);
    expect(db.prepare('SELECT * FROM proof_recovery_attempts').all()).toHaveLength(0);
  });

  it('bounds retries with backoff and retains the request after exhaustion', async () => {
    const { db, database, now } = fixture();
    for (let n = 0; n < 3; n += 1) {
      const at = new Date(now.valueOf() + n * 300_000);
      expect(await recoverReleasedProofJob(database, 'job', at)).toBe(true);
      db.exec("UPDATE daily_proof_jobs SET status = 'reproof_required'");
      expect(await recoverReleasedProofJob(database, 'job', at)).toBe(false);
    }
    expect(await recoverReleasedProofJob(database, 'job', new Date(now.valueOf() + 3_600_000))).toBe(false);
    expect(db.prepare('SELECT status FROM daily_proof_jobs').get()?.status).toBe('reproof_required');
    expect(db.prepare('SELECT * FROM proof_recovery_attempts').all()).toHaveLength(3);
  });

  it('rolls back history when resetting the request fails', async () => {
    const { db, database, now } = fixture();
    db.exec("CREATE TRIGGER fail_reset BEFORE UPDATE ON daily_proof_jobs BEGIN SELECT RAISE(ABORT, 'injected failure'); END;");
    await expect(recoverReleasedProofJob(database, 'job', now)).rejects.toThrow('injected failure');
    expect(db.prepare('SELECT * FROM proof_recovery_attempts').all()).toHaveLength(0);
    expect(db.prepare('SELECT status FROM daily_proof_jobs').get()?.status).toBe('reproof_required');
  });
});
