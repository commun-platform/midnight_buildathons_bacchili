# Wave 1 審査成果物 設計書

## 1. 目的

本書は、実装中の現時点から作成できる審査成果物を定義し、募集要項の必須条件と審査配点へ直接対応させる制作正本です。成果物全体で伝える中心メッセージは次の一文に統一します。

> Sensor値を第三者へ開示せず、提出された値が登録済みThreshold以内であることを示す。

![審査成果物全体で伝える、センサー値を見せないしきい値証明の価値](../assets/review/privacy-value-proposition-ja.png)

説明は実装済み、検証済み、計画中を明確に分離します。BrowserがMidnightを独立照会している、物理Sensorの正しさを証明する、完全なEnd-to-End Encryptionを実現している、など現状を超えるClaimは行いません。

## 2. 募集要項から逆算した必須条件

| 条件 | 対応成果物 | 完了判定 |
| --- | --- | --- |
| Public GitHub Repository | Repository本体、Top README、License、Topic | 公開URLから閲覧でき、midnightntwrk Topicが付いている |
| 明確なREADME | Top READMEと詳細文書 | Project、Setup、Architecture、Midnight Integration、審査手順が一巡できる |
| Slide Deck | 最終英語9枚。日本語版は必要な場合のみ別制作 | PDFまたは公開Linkで閲覧でき、2分18秒の最終英語動画と主張が一致する |
| Demo / Video Pitch | 最終英語2分18秒。日本語版は必要な場合のみ別制作 | GUI、Proof処理、Midnight結果、Evidenceを実画面で確認できる |
| 現行Release Evidence | 現行Release追補とEvidence Matrix | 配備済みContract、現行E2E TX、検証Baseline、動画確定後の追加機能を固定動画のStoryと分離する |
| Wave中のProgress説明 | Progress Record | Wave 1で新規実装・改善した内容とEvidenceが日付付きで分かる |
| Compact ContractのCompile | Technical Gate Evidence | sensor-registryが指定ToolchainでCompile成功する |
| Midnight関連CodeのApache 2.0 | License Audit | 対象範囲と依存関係を確認し、Repository上で明示する |
| Test / Simulation | Evidence Matrix、CIまたは実行Log | Contract、Shared、Device、Workerの主要Testが再実行可能 |

締切の時刻、提出Formの文字数・Upload制約、Official Rules PDFの追加条件は、提出前にAKINDO上の最新表示で再確認します。

## 3. 審査配点への対応

| 審査項目 | 配点 | 最も強く見せるEvidence |
| --- | ---: | --- |
| Engineering & Implementation | 40% | 8回路Compile／配備、Private Input境界、現行Managed API／認証済みDeviceのPreprod TX、Public／Private MCPの分離境界 |
| QA & Reliability | 15% | Test結果、改ざんReject Case、固定24 Slot、再現可能なRunbook |
| Product & Vision | 15% | Raw Data非公開という課題、対象利用者、段階的Roadmap |
| UX & Design | 15% | 管理者画面、第三者Verifier、状態とEvidenceの読みやすさ |
| Communication | 10% | Claimを絞ったDeck、2分18秒の最終英語Demo、硬派で一貫した図版 |
| Business Viability | 5% | 対象業界、導入単位、10,000 Device Cost Model、採用経路 |

制作時間は40%のEngineering Evidenceを先に固定し、そのEvidenceをDeckとVideoへ再利用します。

## 4. 作成する成果物

### P0: 提出に必須

1. Submission Copy
   - Project名、One-liner、Problem、Solution、Midnightの必然性、Wave 1 Progress、Repository、Deck、VideoのLink。
   - 日本語原稿を正本として内容を確定し、英語版は別ファイルで作成する。
2. Judge-ready README
   - 30秒で価値、3分で仕組み、10分で再現方法が分かる構成。
   - 詳細な開発環境、現場連携、Deploy手順は個別文書へLinkする。
3. Slide Deck
   - 16:9、最終英語9枚。日本語版が必要な場合は別生成。
   - 既存の英語図・日本語図を混在させない。
4. Demo / Video Pitch
   - 最終英語2分18秒。Narration、字幕、画面内Textを言語別に作る。
   - 単なるSlide Showではなく、GUI、実行、Evidenceを見せる。
5. Demo Script and Capture List
   - 操作、期待表示、失敗時の代替Capture、NarrationをScene単位で管理する。
6. Evidence Matrix
   - ClaimごとにSource、Test、Runtime Evidence、図、公開可否を対応付ける。
7. Wave 1 Progress Record
   - Wave期間中の追加・改善をBefore / After / Evidenceで記録する。
8. Technical Gate Checklist
   - Compile、Test、Apache 2.0、Public Repository、midnightntwrk Topicを提出前に機械的確認する。
9. Current Release Addendum
   - 配備済み8回路Contract、現行E2E Record、公開Verification再確認、動画確定後の追加機能を記録する。

### P1: 審査を強くする補助物

- Screenshot Pack: GUI、Transaction、Test、Architecture図の高解像度素材。
- Judge Q&A: Privacy、Trust、Scaling、Failure、Businessに対する短い回答。
- One-page Brief: Live Pitch依頼時に共有できる1枚資料。
- Release Snapshot: 審査対象Commit、Checksum、再現Commandを固定したRelease。

## 5. 最終9枚Slide Deck設計

| # | Slide | 伝える内容 | 主なVisual |
| ---: | --- | --- | --- |
| 1 | Title / Value | Private Readingを公開しないThreshold Evidence | 製品Hero図 |
| 2 | Minimum Evidence | 組織間確認で必要な結果だけを共有する理由 | Problem／Value図 |
| 3 | Use Case | Register → Measure → Reduce → Prove → Authorize → Verify | 制御された処理順 |
| 4 | Live Product: Register | User管理Account、証明対象、Public Policy、Validity | GUI |
| 5 | Private Evidence | Raw Reading、固定24 Slot入力、STOPPED Hour | 非公開境界図 |
| 6 | Live Product: Prove | 計測前に登録したPolicyに対するProof生成 | GUI |
| 7 | Engineering Innovation: Sponsor | 必要時だけ起動するServer側Sponsor WalletがDUSTだけを負担し、Device Authorityを保持したまま待機Costを抑える | 英語構成図 |
| 8 | Live Product: Verify | Public Policy、Result、Commitment、TX Evidence | GUI／Explorer |
| 9 | Exact Claim Boundary | 証明すること、非公開にすること、証明しないこと | Claim Boundary図 |

最終9枚は2分18秒の英語動画と同期します。顧客価値から制御された証明経路へ進み、実際の審査Flowを示して、最後に正確なClaim境界を提示します。詳細Architecture、Test、Cost、RoadmapはPitch Slideを増やさずLink先文書で示します。

日本語12枚Technical Referenceでは、Slide 8をこの構成図の日本語版へ更新しています。これは日英で技術説明を確認するための参考資料であり、動画と同期する最終日本語9枚Pitchとは区別します。

## 6. Demo / Video Pitch設計

![日英の最終動画で示す、準備から公開結果確認までの6段階](../assets/guides/judge-review-path-ja.png)

| 時間 | Scene | 画面 | Narrationの要点 |
| --- | --- | --- | --- |
| 0:00–0:12 | Hook | Title／Value | 製品価値とPrivacy上の問いを提示 |
| 0:12–0:32 | Minimum Evidence | Problem／Value図 | 組織間確認で必要なEvidenceだけを共有する理由 |
| 0:32–0:49 | Register | GUI | User管理Account、証明対象、事前登録Policy |
| 0:49–1:06 | Private Input | 非公開Evidence図 | Raw Reading、固定24 Slot、STOPPED Hour |
| 1:06–1:22 | Prove | GUI | 事前登録Policyに対するProof生成 |
| 1:22–1:40 | Authorize | GUI | User認可とService Fee負担の分離 |
| 1:40–1:59 | Public Verification | GUI／Explorer | Policy、Result、Commitment、TX Evidence |
| 1:59–2:18 | Claim Boundary | Claim Boundary図 | 証明することと証明しないこと |

Captureは成功経路だけでなく、OUTSIDEまたは改ざんRejectを一つ入れます。NetworkやPreprodが不安定な場合に備え、同じCommitから取得した事前Captureを用意し、録画内で事前収録であることを明示します。

## 7. Evidence Matrix初期設計

| ID | Claim | Evidence |
| --- | --- | --- |
| CLAIM-01 | Private値は選択したPrivate Source境界に保持される | Browser Private State／現場Runtime Boundary Test、Architecture、保存先確認 |
| CLAIM-02 | Public PolicyはProof前に登録される | Contract State、Assignment API、Preprod TX |
| CLAIM-03 | 24時間ExtremaはPrivate Witnessである | Compact Source、Public Field一覧、Test |
| CLAIM-04 | WITHIN / OUTSIDEを判定できる | Contract Simulator、Preprod Transaction |
| CLAIM-05 | Missing HourはSTOPPEDとして区別される | Specification、Unit / API Test、GUI |
| CLAIM-06 | User Transaction Authority、現場API Identity、Service Fee Authorityは分離される | Module Boundary Test、Authorization Flow |
| CLAIM-07 | Proof ServiceはUserの代理認可をしない | API Flow、Transaction Agent Code、Test |
| CLAIM-08 | Browserへ秘密値を渡さない | API Response Test、Frontend Responsibility図 |
| CLAIM-09 | Standard 1,440 readings/dayを処理する | Benchmark、Cost Report、Run Log |
| CLAIM-10 | 審査対象ContractがCompileする | Compile Log、Toolchain Version、Commit SHA |

Evidence Matrixには、確認日、実行Command、Commit SHA、公開可能なLogまたはScreenshot、Validation Boundaryを追加します。現行の同一Contractに対するManaged APIのOUTSIDE Recordと、認証済みDeviceのWITHIN Recordも含めます。計画中の機能をEvidence欄へ混ぜません。動画／Deck確定後に追加したEvidenceは[現行Release追補](current_release_addendum.md)を参照します。

## 8. README設計

Top READMEはRepository全体の入口として、次の順序にします。

1. Hero: 価値提案、現在状態、主要Link。
2. Problem and Solution: 誰の何を解決するか。
3. What Is Proven / Not Proven: Claimの過大表現を防ぐ。
4. System Architecture: 4領域図と責任表。
5. Midnight Integration: Compact、Private State、Public State、Transaction。
6. Demo: Video、公開画面、2分18秒Review Path。
7. Quick Verification: 最小のCompile / Test / Local確認。
8. Evidence and Current Status: Preprod、Test、Benchmark、既知の制約。
9. Repository Map: Monorepoの役割。
10. Detailed Guides: Development Environment、現場連携、Deploy Runbook。
11. Wave 1 Progress and Roadmap。
12. License、Attribution、midnightntwrk Topic確認。

英語Top READMEを国際審査の入口、日本語文書を内容確認・国内説明の入口とし、両者のClaimと数値を同期します。

## 9. Wave 1 Progress Record設計

Progressは機能一覧ではなく、Wave開始時点との差分として書きます。

| 項目 | 記録内容 |
| --- | --- |
| Before | Wave開始時点で存在したPrototype、未接続部分、制約 |
| Built in Wave 1 | Compact、Private State、疑似計測Workflow、Proof Job、GUIなど実際に追加・拡張した内容 |
| Evidence | Commit、Test、Preprod TX、Screenshot、Benchmark |
| Current Limitation | Operator操作、Trusted Backend、Browser内Proof Verifier未実行など |
| Next Wave | 現場計測システムの自律運用、Role・画面分離、本番運用機能、有償パートナー実証 |

日付とCommit SHAを付け、既存Infrastructureや現場連携の補助実装と、Wave中に構築したMidnight Integrationを区別します。

## 10. Product / Business Content

[3 Wave製品・事業ロードマップ](../architecture/three_wave_roadmap.md)を正本とします。

- 対象利用者: Cold-chain、食品・医薬品保管、研究設備、規制対象設備のOperatorとAuditor。
- 課題: Raw Telemetryを第三者へ常時公開せず、Policyに沿った日次Evidenceを共有したい。
- 導入単位: まず一つの業務・少数の計測元、次に複数現場、最終的に複数組織間のVerification。
- 価値: Data最小化、改ざん耐性のあるPolicy / Result履歴、監査時の共有範囲削減。
- 収益仮説: 計測元／現場単位の運用Subscriptionと、Attestation／Retention Tier。
- 実証計画: Wave 1はCore Proof PoC、Wave 2は実装済みの運用Console、監査、Alert、Support基盤を実際の現場計測システムと有償Partner Pilotの負荷で本番水準へ強化し、Wave 3はHardware保護Identityと来歴を含む商用運用およびPMF検証。

市場規模や法令適合は裏付けが整うまで断定せず、現在は対象者、利用場面、採用経路を中心に説明します。

## 11. 表現ルール

使用する表現:

- Private Extremaを公開せず、登録済みPolicyに対する判定を証明する。
- MidnightはPublic Policy、Assignment、Confirmed Attestationの正本である。
- Backend / Proverは現在Trusted Componentである。
- Browserは公開Evidenceを表示するが、現状は独立したZK VerificationやIndexer照会を行わない。

避ける表現:

- Sensor値そのものが真実であることを証明する。
- Continuous SamplingやDevice非改ざん性を保証する。
- 完全にTrustless、End-to-End Encrypted、Production-ready。
- BrowserだけでPublic Midnight TX／Contract Stateを独立照合できる。

## 12. 制作順序

1. Evidence Inventoryを固定し、実装済み / 検証済み / 計画中を分類する。
2. Technical Gateを先に確認し、Compile、Test、License、Topicの不足を洗い出す。
3. Submission CopyとREADMEを確定し、全成果物の主張を統一する。
4. Slide用の図とScreenshot Packを英語・日本語で別々に作る。
5. Deckを作り、Judge Q&AでClaimの弱点を点検する。
6. Demo Scriptを確定し、実画面Capture、Narration、字幕を制作する。
7. 全Link、数値、用語、Commit SHA、言語混在を最終監査する。

## 13. 完了条件

- 必須提出物の全Linkが公開状態で開ける。
- sensor-registryのCompile成功を対象Commitで再現できる。
- Test / Simulation / PreprodのEvidenceとClaimが一対一で対応する。
- READMEだけでSetup、Architecture、Midnight Integration、Judge Testが分かる。
- DeckとVideoは英語版・日本語版が分離され、内容が一致する。
- 特定のWallet製品、参照Hardware、Development Hostを製品Architectureの主要Componentとして扱わず、User認可Client／管理Backend／MidnightのCapabilityで表現する。
- 未実装事項が現在機能として表現されていない。
- Apache 2.0、Public Repository、midnightntwrk Topicを提出直前に確認する。
