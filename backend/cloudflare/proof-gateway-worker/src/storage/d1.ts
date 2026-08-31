import type { SqlDatabase, SqlParameter, SqlStatement } from './sql.js';

export class D1SqlDatabase implements SqlDatabase {
  readonly kind = 'd1';

  constructor(private readonly database: D1Database) {}

  private prepare(sql: string, parameters: readonly SqlParameter[]): D1PreparedStatement {
    const statement = this.database.prepare(sql);
    return parameters.length > 0 ? statement.bind(...parameters) : statement;
  }

  async first<T>(sql: string, parameters: readonly SqlParameter[] = []): Promise<T | null> {
    return this.prepare(sql, parameters).first<T>();
  }

  async all<T>(sql: string, parameters: readonly SqlParameter[] = []): Promise<T[]> {
    const result = await this.prepare(sql, parameters).all<T>();
    return result.results;
  }

  async execute(sql: string, parameters: readonly SqlParameter[] = []): Promise<number> {
    const result = await this.prepare(sql, parameters).run();
    return result.meta.changes;
  }

  async batch(statements: readonly SqlStatement[]): Promise<void> {
    await this.database.batch(statements.map(({ sql, parameters = [] }) => (
      this.prepare(sql, parameters)
    )));
  }
}
