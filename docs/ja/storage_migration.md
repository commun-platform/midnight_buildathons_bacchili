# D1 → Turso Storage Migration設計

[English](../storage_migration.md)

## 方針

実装済みの運用StoreはD1だけです。APIとScheduled CodeはStorage Portを使用するため、将来のTurso／libSQL AdapterはDomain Logicを変更せずD1を置き換えられます。BrowserはHTTP Responseを使用し、Databaseへ直接依存しません。外部Attestation Agentの実装は含まれていません。

```text
Worker API / Scheduled Handler
             ↓
       SqlDatabase Port
             ↓
       D1 Adapter（現在）
       Turso Adapter（将来）
```

`apps/proof-gateway/src/storage/sql.ts`がStorage Portです。API Codeは`D1Database`を直接参照せず、Adapter選択は`storage/index.ts`で行います。現在、`createSqlDatabase`は常に`D1SqlDatabase`を返し、`DATA_BACKEND`とTurso Adapterはまだ存在しません。

## Port契約

| 操作 | 意味 |
| --- | --- |
| `first` | 0または1行の型付きRowを返す |
| `all` | 型付きRow配列を返す |
| `execute` | 変更行数を返す |
| `batch` | 順序を保持し、全StatementをCommitするかすべてRollbackする |
| `kind` | 診断用に`d1`または`turso`を返す |

Parameterは`string | number | null`に制限します。TimestampにはUTC ISO 8601、日次BucketにはProject Timezoneの`YYYY-MM-DD`、IDにはUUIDまたは決定的Attestation IDを使用します。

## Schema互換ルール

- `apps/proof-gateway/migrations/*.sql`をD1のCanonical Schemaとして扱い、連番Migrationごとに将来の互換Backendへ移植します。
- SQLite／libSQL互換SQL、Foreign Key、Index、`CHECK`制約を使用します。
- Adapter固有MetadataをDomainやAPI Responseへ出しません。
- 複数StatementのWriteは`SqlDatabase.batch`を経由します。
- Deploy済みSchemaの変更には新しい連番Migrationを追加し、適用済みMigrationを書き換えません。

## Turso Adapter

1. Worker対応Clientを追加し、Remote URLとAuth TokenをWorker Secretから読み取ります。
2. `TursoSqlDatabase implements SqlDatabase`を`storage/turso.ts`へ実装します。
3. `storage/index.ts`だけで`DATA_BACKEND=d1|turso`を選択します。
4. D1とTursoに同じAdapter Contract Testを適用します。
5. Database URL、Token、ClientをBrowser Codeへ公開しません。

## Cutover

1. TursoへすべてのMigrationを適用します。
2. Ingestionを短時間停止し、D1 SnapshotをExportします。
3. Project、Device、Attestation、Readingの順にImportします。
4. Table件数、Primary Key、日次Sample Count、Root、Transaction IDを照合します。
5. StagingでRead、Write、Batch、Scheduled HandlerのTestを実行します。
6. `DATA_BACKEND=turso`を設定し、Ingestionを再開します。
7. 失敗時はWriteを停止してD1へ戻します。検証期間中はD1を保持します。

単純なDual Writeは部分失敗で運用Ledgerが分岐するため使用しません。将来の無停止移行にはDurable OutboxとIdempotent Consumerが必要です。
