# 文書用図版の生成記録

[English](../../../assets/guides/generation_manifest.md)

生成方法: Codex内蔵画像生成
用途: `infographic-diagram`
出力: 1672 × 941 PNG、16:9
共通デザイン: 硬派な濃紺の技術文書、細いグリッド、白文字、シアンと紫、抑えた緑・黄・赤、平面的な線画
共通除外: 人物、企業ロゴ、コイン、写真、透かし、Raspberry Pi、開発ホストを含む構成図、過剰なネオン装飾

## 挿入先

| 図版 | 主な文書 |
| --- | --- |
| 審査の4論点 | `submission/judge_qa.md` |
| 仕様から検証証拠まで | `implementation/implement_spec.md` |
| 固定24時間枠と拡張性 | `implementation/cost_benchmark.md` |
| 審査員が確認する実演の流れ | `operations/demo_runbook.md`、`submission/demo_script.md`、`submission/deliverables_plan.md` |
| デバイスとしきい値のライフサイクル | `security/device_registry.md` |
| エッジ向け安全なリリース手順 | `operations/device_firmware.md` |

長文の`architecture/wave1_spec.md`には、正確な証明範囲、4領域の責任分担、鍵の分離、日次回路の各節へ既存の生成図版4点も挿入しました。索引、短いチェックリスト、既にテキスト図がある保存先移行文書は、装飾的な図を増やしても理解が改善しないため対象外としました。

## 最終プロンプトセット

### `judge-qa-map-ja.png`

- 見出しは「審査で確認する4つの論点」。
- 何を証明するか、何を公開しないか、何を証明しないか、現在確認できることを4分割。
- ブラウザ単体の独立検証はWave 2計画として分離。

### `implementation-traceability-ja.png`

- 見出しは「仕様から検証証拠まで」。
- 要件、実装、データ境界、検証証拠の4段階。
- 証拠は確認済みの6回路、288件のテスト、取引記録に限定。

### `fixed-24-slot-scaling-ja.png`

- 見出しは「なぜ24個の時間枠か」。
- 24件、96件、1,440件以上の測定値をエッジ内で固定24時間枠へ集約。
- 回路の形が固定であることと、証明数が稼働デバイス数×日数に比例することを分離。
- 時間枠は誤った時刻範囲を避け、`00`、`01`、`02`、`…`、`22`、`23`で表示。

### `judge-review-path-ja.png`

- 見出しは「審査員が確認する実演の流れ」。
- 準備、登録、収集、証明生成、デバイス署名、公開結果の6段階。
- 最下部で公開情報と非公開情報を分離。

### `device-policy-lifecycle-ja.png`

- 見出しは「デバイスとしきい値の運用ライフサイクル」。
- デバイス登録、公開しきい値登録、設定、日次運用、権限更新／無効化の5段階。
- 運用担当者による登録管理と、デバイスによる取引署名を分離。

### `edge-release-lifecycle-ja.png`

- 見出しは「エッジ向け安全なリリース手順」。
- 検証済みパッケージ、チェックサム／構成表、版別導入、`current`、稼働確認、`previous`への復旧の6段階。
- Compactコンパイラ、配備用ウォレット、秘密鍵の種をデバイス用パッケージへ含めないと明記。
