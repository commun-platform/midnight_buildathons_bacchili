# D1 to Turso Storage Migration Design

[日本語版](ja/storage_migration.md)

## Approach

D1 is the only implemented operational store. API and scheduled code use the storage port so a future Turso/libSQL adapter can replace D1 without changing their domain logic. The browser consumes HTTP responses and has no direct database dependency. No external Attestation Agent implementation is included.

```text
Worker API / Scheduled Handler
             ↓
       SqlDatabase port
             ↓
       D1 adapter (current)
       Turso adapter (future)
```

`apps/proof-gateway/src/storage/sql.ts` is the storage port. API code does not reference `D1Database` directly; adapter selection belongs in `storage/index.ts`. At present, `createSqlDatabase` always returns `D1SqlDatabase`; `DATA_BACKEND` and a Turso adapter do not exist yet.

## Port Contract

| Operation | Contract |
| --- | --- |
| `first` | Returns zero or one typed row |
| `all` | Returns a typed row array |
| `execute` | Returns the changed-row count |
| `batch` | Preserves order and commits all statements or rolls back all |
| `kind` | Returns `d1` or `turso` for diagnostics |

Parameters are limited to `string | number | null`. Timestamps use UTC ISO 8601. Daily buckets use `YYYY-MM-DD` in the project timezone. IDs use UUIDs or deterministic Attestation IDs.

## Schema Compatibility

- Treat `apps/proof-gateway/migrations/*.sql` as the canonical D1 schema and port each numbered migration to a future compatible backend.
- Use SQLite/libSQL-compatible SQL, foreign keys, indexes, and `CHECK` constraints.
- Keep adapter-specific metadata out of domain and API responses.
- Route multi-statement writes through `SqlDatabase.batch`.
- Add numbered migrations for deployed schema changes; do not rewrite an applied migration.

## Turso Adapter

1. Add a Workers-compatible client using a remote URL and auth token from Worker secrets.
2. Implement `TursoSqlDatabase implements SqlDatabase` in `storage/turso.ts`.
3. Select `DATA_BACKEND=d1|turso` only in `storage/index.ts`.
4. Run the same adapter contract tests against D1 and Turso.
5. Never expose the database URL, token, or client to browser code.

## Cutover

1. Apply every migration to Turso.
2. Pause ingestion briefly and export a D1 snapshot.
3. Import Project, Device, Attestation, then Reading rows.
4. Compare table counts, primary keys, daily sample counts, roots, and transaction IDs.
5. Run read, write, batch, and scheduled-handler tests in staging.
6. Set `DATA_BACKEND=turso` and resume ingestion.
7. On failure, stop writes and switch back to D1. Retain D1 during the validation window.

Do not use naive dual writes: partial failure would split the operational ledgers. A future zero-downtime migration requires a durable outbox and idempotent consumer.
