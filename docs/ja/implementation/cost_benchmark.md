# Cost Modelと再現可能なBenchmark範囲

[English](../../implementation/cost_benchmark.md)

この文書はRepositoryから確認できるCost Modelを定義します。Local Deployment Log、生成Package、Browser出力、
Machine固有のTimingをSubmission Evidenceとして扱いません。これらは運用者のPrivateな計測Recordであり、ここには掲載しません。

## 固定Proof Shape

運用 `sensor-registry` Contractは1運用日を24 Hourly Slotへ集約します。観測SlotにはPrivateなMinimum、Maximum、Reading Count、
空SlotにはNO DATA Markerを入れます。そのため、Sourceが24、96、1,440 Raw Readingを送ってもProof Circuit Shapeは変わりません。
Proof数はActive Device数と運用日数に応じて増えます。

正本は[`sensor-registry.compact`](../../../midnight/contracts/sensor-registry/src/sensor-registry.compact)と
[`shared/measurement-protocol`](../../../shared/measurement-protocol/)です。固定ToolchainでOperational Compileを実行します。

```bash
npm run contract:compile
```

Compileは運用8回路を生成します。`midnight/experiments/`のDaily Attestation ProfileはDevelopment専用で、Deploy済み運用経路では使いません。

## Runtime Costの変動要因

| 項目 | Costを変えるもの | 境界 |
| --- | --- | --- |
| Raw Sampling Frequency | Local CollectionとHourly Reductionの処理量 | 24 Slot Circuit Shapeは変わりません |
| Active Device × 日数 | ProofとTransactionの数 | 主なScaling Factorです |
| Proof Server Capacity | 並列Proof Job数とQueue待ち | Admission上限とWallet Mutation直列化があります |
| Midnight Transaction | Attestation 1件あたりのConfirmed Transaction数 | DUSTとNetwork Priceは外部の変動値です |
| Cloudflare Runtime | Worker、Queue、D1 / R2、Container Active Time | Account PlanとRetention Policyに依存します |

## Planning Equation

```text
月額合計
  = Active Device数 × Device月あたりAttestation数 × Attestation単価
  + 固定Platform Cost
  + 保持StorageとSupport Cost
```

`Attestation単価`は、Cloudflare Plan、Proof Duration、Container CPU / Memory、Queue Attempt、D1 / R2 Byte、Midnight Feeを
記録したControlled Runから算出します。Raw Input、Command、Toolchain、Account Pricingを公開かつ再現できる場合を除き、Recordは
Repository外で管理します。単一のSetup実測をCustomer PriceやFleet LoadのClaimへ変換しません。

## 再現可能なSource Check

固定Proof ShapeとFailure CaseはOperational ContractとShared Testで確認します。

```bash
npm ci
npm run verify:source
```

Source GateはContract Compile、Workspace Test、Type Checkを実行します。Worker Deploy、DUST消費、Live Networkは必要ありません。
Container Imageの任意Full GateだけはDocker環境が必要です。

## Scaleの解釈

固定24 Slot InputはRaw Sample数によるCircuit成長を抑えますが、Fleet Capacity、Latency、Availabilityを証明しません。信頼できる
Capacity StudyではActive Device数、Proof並列度、Retry率、Confirmation Delay、Retention期間を変化させ、入力と環境を完全に公開します。
