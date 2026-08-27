export type StorageBackend = 'd1' | 'turso';

export type SqlParameter = string | number | null;

export type SqlStatement = {
  sql: string;
  parameters?: readonly SqlParameter[];
};

export interface SqlDatabase {
  readonly kind: StorageBackend;
  first<T>(sql: string, parameters?: readonly SqlParameter[]): Promise<T | null>;
  all<T>(sql: string, parameters?: readonly SqlParameter[]): Promise<T[]>;
  execute(sql: string, parameters?: readonly SqlParameter[]): Promise<number>;
  batch(statements: readonly SqlStatement[]): Promise<void>;
}
