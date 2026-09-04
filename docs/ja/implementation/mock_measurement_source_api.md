# テスト用疑似対向 計測API仕様

## Endpoint

```http
GET /v1/measurements?sourceId=<source-id>&from=<ISO-8601>&to=<ISO-8601>
Accept: application/json
Authorization: Bearer <test-token>
```

`from`を含み、`to`を含まない固定24時間を要求する。成功時は`sourceId`、`from`、`to`を同じ時刻で
Echoする。

```json
{
  "schemaVersion": 1,
  "sourceId": "normal-1440",
  "sensorType": "temperature",
  "unit": "°C",
  "from": "2026-09-01T15:00:00.000Z",
  "to": "2026-09-02T15:00:00.000Z",
  "measurements": [
    {
      "id": "normal-1440:0000",
      "recordedAt": "2026-09-01T15:00:30.000Z",
      "value": 22.4
    }
  ]
}
```

Bearer Tokenは`test-managed-source-token`とする。欠落または不一致はHTTP 401を返す。

## 決定的Scenario

| Source ID | 応答 |
| --- | --- |
| `normal-1440` | 1分ごと1,440件、すべてしきい値内 |
| `outside-threshold` | 決定的な上限／下限外れ値を含む1,440件 |
| `missing-hour` | 1時間分が完全欠損 |
| `sparse-day` | 一部時間だけ1件を返す |
| `empty-day` | 有効な空配列 |
| `duplicate-identical` | 同一ID・同一内容を重複 |
| `duplicate-conflict` | 同一IDで異なる値 |
| `wrong-source` | 異なるSource IDをEcho |
| `wrong-range` | 異なる終了時刻をEcho |
| `outside-range` | `to`ちょうどのSampleを含む |
| `wrong-unit` | 異なる単位 |
| `invalid-value` | Sensor encodingで扱えない値 |
| `malformed-json` | 不正JSON |
| `oversized` | BodyまたはSample件数上限超過 |
| `unauthorized` | HTTP 401 |
| `forbidden` | HTTP 403 |
| `not-found` | HTTP 404 |
| `rate-limited` | `Retry-After`付きHTTP 429 |
| `server-error` | HTTP 503 |
| `timeout` | Connector timeoutまで応答しない |
| `redirect` | 別EndpointへのRedirect |

同じ`sourceId/from/to`への応答は毎回同一とする。`GET /health`は
`{"ok":true,"service":"deterministic-measurement-source"}`を返す。
