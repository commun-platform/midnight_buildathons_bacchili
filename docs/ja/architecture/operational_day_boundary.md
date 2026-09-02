# 運用日の境界

[English](../../architecture/operational_day_boundary.md)

状態：設定可能な24時間Attestation期間の規範設計

## 目的

1件のAttestationは、常に1時間単位の24 Slotを証明します。Projectごとに、ローカル時刻の
何時から運用日を開始するかを設定でき、回路形状の変更やContractの再Compileは不要です。
境界はDevice運用前に登録し、Proof Requestごとには渡しません。

## 登録する設定

Project作成時に次の既定値を登録します。

- `timeZoneOffsetMinutes`：UTCからの固定差分。-840〜+840分。
- `localDayStartHour`：0〜23の整数。分と秒は常に00。

PolicyをDeviceへ割り当てる際、この値を変更不能な公開Midnight `PolicyAssignment`へコピーし、
次の`utcDayStartMinute`も保存します。

```text
utcDayStartMinute = modulo(localDayStartHour * 60 - timeZoneOffsetMinutes, 1440)
```

Compactでは符号付き差分を`timeZoneOffsetMinutesBias = timeZoneOffsetMinutes + 840`として保存します。
Assignment登録回路が、差分、開始時、UTC境界、およびその対応関係を検証します。D1にもAPI処理と
表示用のMirrorを保持しますが、Attestation回路と第三者検証が正本として使うのはMidnight上の
Assignmentです。

Assignmentは変更できません。差分または開始時を変える場合は、新しいAssignmentと有効期間を
登録します。Policy、回路、Contractの再配備は不要です。

## Attestation期間と日付

24 Slotは`Vector<24, HourlyExtrema>`のままです。UTC Epoch Dayである`measurementDay`に対し、
Contractは次を要求します。

```text
periodStart = measurementDay * 86400 + utcDayStartMinute * 60
periodEnd   = periodStart + 86400
slot[i]     = [periodStart + i * 3600, periodStart + (i + 1) * 3600)
```

`measurementDay`は`periodStart`を含むUTC Epoch Day成分で、利用者向けの日付ではありません。
ローカル運用日`periodDate`は、登録済み差分と開始時から自動導出します。

```text
periodDate = calendarDate(timestamp + timeZoneOffsetMinutes - localDayStartHour)
```

運用Deviceは、計測時刻と認証済みAssignment設定から`periodDate`を導出します。Proof Requestで
別の差分や境界を選ぶことはできません。審査用の疑似生成だけは完了済み`periodDate`を選択できますが、
APIとContractが正確な開始時刻を再計算し、日付、Epoch Day、Assignment、計測時刻の不整合を拒否します。

例：差分`+540`、ローカル開始`06:00`では、`utcDayStartMinute = 1260`（UTC 21:00）です。
運用日`2026-09-02`は、`2026-09-01T21:00:00Z`から`2026-09-02T21:00:00Z`までです。

## 固定Offsetの規則

Wave 1では固定UTC Offsetを使い、Assignmentの途中でIANAの夏時間切替を自動適用しません。
すべてのProofを厳密に86,400秒・24 Slotに保ちます。地域のOffsetが変わる場合は、その境界から
有効になる新しいAssignmentを登録します。

## 必須検証

- Project作成時、-840〜+840外のOffsetと0〜23外の開始時を拒否する。
- Device登録時、Project境界をオンチェーンAssignmentとD1 Mirrorへコピーする。
- Device設定APIは、認証済みAssignment境界を返す。
- 集約、疑似生成、Proof受付、第三者検証は同じ境界を使う。
- ContractはOffset／開始時／UTC境界の誤対応と、登録境界から始まらない期間、24時間でない期間を拒否する。
- 第三者画面は、ローカル運用日、固定Offset、開始時、UTC期間、相対24 Slotを表示し、Extremaは開示しない。
