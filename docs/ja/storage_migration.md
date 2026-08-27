# D1 → Turso Storage Migration Design

[English documentation](../storage_migration.md)

## 方針

現在はCloudflare D1を使用する。API、日次Job、GUIの契約はStorage実装から独立させ、将来はTurso/libSQL Adapterだけを追加して切り替える。

```text
Worker API / Scheduled Job
          ↓
      SqlDatabase Port
          ↓
   D1 Adapter（現在）
   Turso Adapter（将来）
```

`apps/proof-gateway/src/storage/sql.ts`を唯一のPortとし、APIから`D1Database`やlibSQL Clientを直接参照しない。Factoryは`storage/index.ts`へ限定する。

## Port契約

| 操作 | 意味 |
| --- | --- |
| `first` | 0または1行を返す |
| `all` | 型付き行配列を返す |
| `execute` | 変更行数を返す |
| `batch` | 順序を保持し、全成功または全rollbackする |
| `kind` | `d1`または`turso`を診断情報として返す |

SQL parameterは`string | number | null`に制限する。日時はUTC ISO 8601文字列、日次bucketはProject timezoneで生成した`YYYY-MM-DD`、IDはUUIDまたは決定的Attestation IDとする。

## Schema互換ルール

- `migrations/*.sql`をD1/Turso共通のcanonical migrationとする。
- SQLite/libSQL共通構文、foreign key、index、`CHECK`制約だけを使用する。
- D1 response metadataやTurso row objectをDomain/APIへ返さない。
- 複数writeは必ず`SqlDatabase.batch`を経由する。
- schema変更は既存migrationを編集せず、新しい連番migrationを追加する。

## Turso Adapter実装時

1. Worker対応clientを追加し、remote URLとauth tokenをWorker Secretから読む。
2. `TursoSqlDatabase implements SqlDatabase`を`storage/turso.ts`へ実装する。
3. `storage/index.ts`だけで`DATA_BACKEND=d1|turso`を切り替える。
4. D1 Adapterと同じcontract testをTurso Adapterへ適用する。
5. Browserへdatabase URL、auth token、clientを公開しない。

Turso公式TypeScript SDKではremote libSQL接続にWeb clientを利用でき、batchはimplicit transactionとして扱われる。実装時点のSDKを再確認してAdapter内だけでAPI差分を吸収する。

## Cutover手順

1. Tursoへ全migrationを適用する。
2. ingestionを短時間停止し、D1 snapshotをexportする。
3. Project → Device → Attestation → Readingの順でimportする。
4. table件数、主キー、期間別sample count、Merkle root、Tx IDを照合する。
5. stagingでTurso Adapterのread/write/Cron contract testを実行する。
6. `DATA_BACKEND=turso`へ切り替え、ingestionを再開する。
7. 問題時は書き込みを停止し、D1へ戻す。確認期間中はD1を削除しない。

単純な同時dual-writeは部分失敗でledgerが分岐するため採用しない。無停止移行が必要になった場合は、永続outboxと再実行可能consumerを別途設計する。
