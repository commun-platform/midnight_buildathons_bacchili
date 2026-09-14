# GUI操作と処理場所の対応表

この文書は、審査用GUIの各操作で何が起き、どこで処理されるかを定義する画面仕様の添付資料です。
製品仕様と非公開境界の正本は[Wave 1仕様](../architecture/wave1_spec.md)です。

## 共通操作

| 操作 | ブラウザ | Worker／保存先 | Midnight／非同期結果 |
| --- | --- | --- | --- |
| **Midnight Walletを接続** | 対応Browser Walletへ接続し、5分間有効なProject Challengeを取得して、Project Session用のCanonical Messageへ署名します。秘密鍵はWalletから出ません。 | 公開鍵署名を検証し、そのWalletが所有するProjectだけを関連付け、24時間のOpaque Project Sessionを発行します。D1にはToken Hashだけを保存します。 | TXは発行しません。接続後にDevice Workflowを表示し、最後に選んだProjectが同じWalletに属する場合だけ復帰します。 |
| **言語** | 英語／日本語表示を切り替え、選択をLocalへ保存します。 | API呼出しなし。 | Chain処理なし。 |
| **Device Workflow／Administrator／Third-Party Verification** | Hash Routeを切り替えます。 | Device／AdministratorはDevice SessionでDevice自身の情報だけを取得し、Third-PartyはRedacted済みPublic Recordだけを取得します。 | 確定済み第三者Recordを開くと、時間制限付きでPublic Midnight Indexerへも直接照合します。 |
| **再読込** | 一時的な画面Stateを消し、選択中Routeの正本を読み直します。非秘密の選択設定は保持します。過去のWallet署名を再利用しません。 | Wallet再接続後、Project、Policy、Device、時間別集計、現在の正常／異常状態、Proof Job、TX状態をWorker／D1から復帰します。 | Policy登録、Device登録、Proof、Sponsor TXのServer処理は継続します。GUIは安定したOperation ID／Job IDの状態確認だけを再開します。 |

## Project／Policy操作

| 操作 | 前提とブラウザ処理 | Worker、D1、Queue、Container処理 | 結果と上限 |
| --- | --- | --- | --- |
| **Projectプルダウン** | Wallet接続が必要です。選択した`projectId`とPublic Wallet Key HashからBrowser Device IDを再導出します。 | `GET /api/v1/provisioning/configuration?projectId=...`がProject Sessionから所有権を検査し、そのProjectのPolicyと運用設定だけを返します。 | 同じWallet／Projectなら同じDevice IDへ復帰します。Device、Policy、日別データ、JobはProject単位で分離します。 |
| **＋ 新規Project** | 名前入力を開き、**Projectを作成**でTrim済み名称を送信します。**キャンセル**は変更しません。 | `POST /api/v1/projects`がWallet所有のD1 Projectを作ります。Worker受付とD1 Triggerの両方で上限を強制します。 | Wallet 1つあたり最大10 Projectです。新規ProjectはPolicy 0件から開始し、Device登録前にPolicyを作ります。Midnight TXは不要です。 |
| **＋ 新規Policy** | 名前、判定方式、Boundを入力します。方式は上下限、上限のみ、下限のみで、温度は0.01 °C刻みです。**Policyを登録**ではOne-time Challengeを取得し、Project、Policy ID、方式、Centi-degree Bound、Nonce、TimestampへBrowser Walletで署名します。**キャンセル**は変更しません。 | WorkerがProject所有権、期限、Nonce一回性、Canonical値、署名、上限を検査し、安定したPolicy Operationを作ってQueueへ投入します。Server Wallet Containerが分離された非公開Operator Authorityで`registerThresholdPolicy`を呼び、Indexer確定後にD1へそのProjectのPublic Policy Mirrorを保存します。 | Projectごとに登録済み＋処理中を合計して最大10 Policyです。登録済みPolicyは変更不可で、異なるしきい値は新しいPolicyとして登録します。ブラウザを閉じてもQueue／Retry処理は続き、Operation IDから復帰します。処理中の行には、`always-on`／`on-demand`／`scheduled`に応じた処理開始の目安を表示します。BoundはMidnight上で公開です。 |
| **Midnight登録欄のPolicyプルダウン** | 登録済みPolicyを1つ選び、Project単位の非秘密設定としてLocal保存します。 | Device登録までは書込みません。 | Deviceへ割り当てた後は変更不可です。 |
| **しきい値を再読み込み** | 明示操作でPolicy状態を取得し、入力途中のFormとFocusを維持して関連部分だけ更新します。取得中はボタンを無効にし、完了・失敗後に再度有効にします。 | 対象ProjectのPolicy Operationを読み、登録済み一覧が変わった場合は認証済み設定も再取得します。 | Policy状態の自動ポーリングは行いません。処理中なら再読み込みを繰り返します。サーバー処理は独立して続きます。 |

GUI全体で一覧の状態を明確に区別します。アニメーション付きの**読込中**は正本データへ問い合わせ中、
静的な**データなし**は問い合わせが正常終了して0件だった場合だけ表示します。この区別をPolicy、
Deviceの日別履歴、管理画面の各一覧、第三者向けProof一覧へ共通適用します。Policy状態確認では、更新後の
Project設定に登録済みPolicyが含まれるまで、処理中または登録済みの行を消しません。Policyは「しきい値を再読み込み」で更新します。状態更新時も、
対象の状態／一覧Componentだけを更新し、Page全体やProject／Policy FormのDOMを作り直しません。このため、
入力途中の値、選択、Keyboard Focusを保持します。

## Device Workflow操作

| 操作 | Browser／Device側 | Worker、保存先、Queue、Container、Midnight | GUIの完了条件 |
| --- | --- | --- | --- |
| **Device Identityを作成** | Wallet／Projectから決定的に導出したDevice IDを使い、Device P-256秘密鍵とDevice Authority秘密値をBrowser IndexedDBへ生成または復帰します。 | 秘密値は送信しません。 | チェックはLocal Identityを利用できる意味です。同じBrowser StorageとWallet／Projectが再読込復帰に必要です。 |
| **Deviceを登録してPolicyを割り当て** | 5分間One-time Challengeを取得し、Device、Project、P-256 Public Identity、Device Authority Commitment、選択Policy、Nonce、TimestampへBrowser Walletで署名します。 | WorkerがWallet署名とProject所有権を検査し、安定したRegistration Operationを作ってQueueへ投入します。Private Operator PathがDeviceとDevice-bound Policy AssignmentをMidnightへ登録します。Indexer確定後だけD1のDevice Key、Assignment Mirror、Device Session経路、初期`normal`状態を有効にします。 | ButtonはDurable受付後に戻ります。Queued／Running／RetryingはBackground Jobとして表示し、Browserを処理中に固定しません。確定後にDevice／Assignment TX Linkを表示します。 |
| **Device Workflow操作の横にある「状態を再読み込み」** | Device登録、1日分生成、Proof／TX、日別履歴の状態を、Page全体を再読込せずに個別更新します。非同期Server処理の完了待ちに使い、入力途中のFormと選択を保持します。 | Worker／D1のDevice単位の正本状態を読み、安定したOperation ID／Proof Job IDで登録またはProof状態を復帰します。 | Server側で確定した時点で、対象操作が活性化します。 |
| **前日／日付／翌日** | 過去30日以内の完了済み運用日を選びます。 | API書込みなし。 | 24時間全体のClaimにするため現在と未来の運用日は生成できません。 |
| **生成モード** | すべてPolicy範囲内、または説明用の外れ値入りを選びます。 | 生成するまではAPI書込みなし。 | どちらも正常なProof経路で、Public ResultがWITHINまたはOUTSIDEになります。 |
| **1,440件を自動生成** | 1分1件のPrivate Sampleを生成し、各時間の真の最小、最大、平均（`合計 / 件数`）、件数、24 SlotのPrivate Input、Commitment、Nonceを作ります。Raw値とOpeningはIndexedDBだけに保存します。 | 最大24件の時間別運用Summaryと、状態が変化した場合だけEventを送ります。D1は現在の`normal`／`anomaly`を保持し、1,440 Raw値やPrivate Extrema Openingを受け取りません。 | 日別センサー履歴へ追加します。登録時から明示的な現在状態を持つため、異常Eventが一度もなくてもAdministratorの「現在状態を取得」は完了します。 |
| 日別履歴の**選択** | IndexedDBに残る場合はその日のPrivate Captureを復帰し、Server側Summary／Jobも選びます。 | D1からDevice自身の履歴を取得します。 | 日付を変えて何度でも試せます。Local Private Dataがない日は明示的に利用不可となり、そのBrowserではProofを作れません。 |
| **日次ZKPを要求** | 選択日のCommitment、Policy／Assignment ID、期間、Presence、Count、Circuit Version、Claim BooleanからPublic Job Requestを作ります。Threshold BoundはProof Inputとして送りません。 | `POST /api/v1/proof-jobs`がDevice／DayおよびMeasurement Groupで冪等なJobを作るか既存Jobを返します。AdmissionはD1へ永続化し、Queue Scheduleで扱えます。 | 安定したProof Job ID／Statusは再読込後も残ります。同一要求は既存Jobを返し、同じIDで内容が違う要求は拒否します。 |
| **ZKPを生成・署名してMidnightへ記録** | Local Private Captureを読み、Worker配下のProof Serverを経由する公式Compact／Midnight Browser Wallet経路でProofを作り、接続済みWalletが`payFees: false`でFeeなしTXへ署名します。 | WorkerはProving Bodyを保存せずStreamします。受理した正確なTX ByteをPrivate R2へ保存し、Wallet日次上限を予約し、QueueへJob IDだけを入れます。Sponsor Walletが許可済みTX形式を再検査し、DUSTだけを追加して送信し、D1を更新します。Browserは状態をPollします。 | Animation付き進捗、実際のZKP生成日時、Sponsor状態、確定したAttestation TX IDと、第三者検証で使うTX hashを表示します。Server Retry中にBrowserを開き続ける必要はありません。署名期限切れ等で失敗した場合だけ明示的な再操作を案内します。 |

## Administrator操作

| 操作 | 処理と表示元 |
| --- | --- |
| **前の日／日付プルダウン／次の日** | 取得済みDevice履歴内の運用日を切り替えます。時間別最小、最大、平均、件数、Commitment、現在の正常／異常状態、日次Job／TX状態は認証済みWorker／D1 APIから取得します。Raw SampleとPrivate Openingはありません。 |
| **日次Proof操作** | 選択したDevice日について上記と同じ要求／生成処理を使います。別Workflowを作らず、Device認可も迂回しません。 |
| Explorer Link | Public Evidenceがある場合、Contract、Policy登録、Device登録、Assignment、Attestation TXをNetwork別Midnight Explorerで開きます。 |

## Third-Party Verification操作

| 操作 | Browser／Public API | Midnight照合と非公開結果 |
| --- | --- | --- |
| **TX hash／検証** | BrowserがPublic Midnight IndexerをTX hashで検索し、成功TX／Block、呼び出したContract、そのBlockのState差分をDecodeします。WalletもD1検索も不要です。 | 運用日／登録済み境界、24個の時間帯別結果、適用しきい値／有効期間、Device Commitment、Block、TX Evidenceを表示します。 |
| 自動の**ゼロ知識証明（ZKP）の確認ステップ** | Indeterminate Progress Indicatorを表示し、時間制限付きでPublic Midnight Indexerへ問い合わせます。 | 成功TX／Hash／Blockを一致させ、そのBlockのContract LedgerをDecodeし、Commitment、Verified Flag、Presence／Count、Result、Policy、Device-bound Assignmentを独立照合します。不一致時は確認未完了です。 |
| **元のセンサー値**欄 | **第三者には非公開／値を見せずに証明**という意図的なRedactionを表示します。 | Public APIにはRaw Sample、Hourly Extrema、Nonce、Witness、Proof Server Body、Wallet Secretがありません。この欄から値を見られません。 |
| Explorer Link | Public TX、Block、Contract Evidenceを開きます。 | Explorer表示は直接Indexer照合を補助します。D1の`confirmed`文字列だけをProofとして扱いません。 |

## 再読込と失敗時

- Project／Policy選択は非秘密のLocal設定です。所有権、Policy、Device登録、現在状態、時間別Summary、
  Job、TX状態はWorker／D1から読み直します。
- Device Identityと生成Raw値／Private Openingだけは、そのBrowserのIndexedDBから復帰します。
- Project、Policy、Device登録、Sponsor送信は安定したIDを持ちます。画面を閉じてもQueue／Container処理は
  キャンセルされません。
- One-time ChallengeやWallet署名を暗黙に再利用しません。Serverが失敗確定にした場合はErrorを表示し、
  新しい署名が必要な操作だけを明示的に再実行できるようにします。
