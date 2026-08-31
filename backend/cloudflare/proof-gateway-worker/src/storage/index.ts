import { D1SqlDatabase } from './d1.js';
import type { SqlDatabase } from './sql.js';

export type { SqlDatabase, SqlParameter, SqlStatement, StorageBackend } from './sql.js';

export function createSqlDatabase(env: Env): SqlDatabase {
  return new D1SqlDatabase(env.DB);
}
