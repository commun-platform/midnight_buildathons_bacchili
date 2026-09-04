# Deterministic Measurement Source Test API

## 1. Endpoint

```http
GET /v1/measurements?sourceId=<source-id>&from=<ISO-8601>&to=<ISO-8601>
Accept: application/json
Authorization: Bearer <test-token>
```

`from` is inclusive and `to` is exclusive. Both must identify an exact 24-hour interval. The test
service echoes them without changing their instants.

## 2. Successful response

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

Required invariants:

- `schemaVersion` is `1`.
- `sourceId`, `from`, and `to` equal the request.
- `sensorType` and `unit` equal the registered connector configuration.
- `measurements` contains at most 2,000 entries.
- `id` is unique within a response unless the repeated entry is byte-for-byte equivalent.
- `recordedAt` is inside `[from, to)`.
- `value` is a finite JSON number accepted by the configured sensor encoding.

## 3. Authentication

The deterministic service accepts `Authorization: Bearer test-managed-source-token`. A missing or
different value returns `401`. Tests assert that the receiving service never logs or returns this
token.

## 4. Deterministic scenarios

The `sourceId` selects a reproducible scenario:

| Source ID | Result |
| --- | --- |
| `normal-1440` | 1,440 within-threshold values, one per minute |
| `outside-threshold` | 1,440 values with deterministic upper and lower violations |
| `missing-hour` | Valid values with one complete hour absent |
| `sparse-day` | One valid value in selected hours |
| `empty-day` | Valid response with an empty `measurements` array |
| `duplicate-identical` | Repeats one identical measurement ID and body |
| `duplicate-conflict` | Repeats one ID with a different value |
| `wrong-source` | Echoes a different source ID |
| `wrong-range` | Echoes a different `to` instant |
| `outside-range` | Includes a value exactly at `to` |
| `wrong-unit` | Returns a different unit |
| `invalid-value` | Returns a value that cannot be accepted by the sensor encoding |
| `malformed-json` | Returns syntactically invalid JSON |
| `oversized` | Exceeds the configured body or sample limit |
| `unauthorized` | Returns HTTP 401 |
| `forbidden` | Returns HTTP 403 |
| `not-found` | Returns HTTP 404 |
| `rate-limited` | Returns HTTP 429 with `Retry-After` |
| `server-error` | Returns HTTP 503 |
| `timeout` | Does not respond before the connector timeout |
| `redirect` | Returns a redirect to another endpoint |

## 5. Service controls

The service is stateless. Every successful response is derived from `sourceId`, `from`, and `to`, so
repeated requests are byte-for-byte stable. It exposes:

```http
GET /health
```

which returns `200 {"ok":true,"service":"deterministic-measurement-source"}`. The service never
accepts arbitrary uploaded readings and is used only as a deterministic integration-test peer.
