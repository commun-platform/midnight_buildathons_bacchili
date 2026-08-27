# Midnight Sensor Device Firmware

このpackageはRaspberry Pi用のデバイス運用runtimeだけを含みます。開発PC上で`package_archive.sh`から生成し、開発Wallet、Compact source／compiler、proving key生成tool、Cloudflare deploy code、Browser applicationは含めません。

## 含まれる運用機能

- 温度collectorとloopback health endpoint
- deploy済みContractを使う、運用者が明示的に起動するDevice Wallet CLI
- 開発PCで生成してintegrity manifestを付けたCompact runtime artifact
- `installer.sh`、systemd installer、永続障害解析log

開発／Deployer Walletはこのpackageへ含めません。導入済みRuntime、設定、Device Wallet StateはRaspberry Pi上の`~/.midnight/midnight-cloudflare-demo/`配下へ集約します。Device Wallet Credentialは`device-wallet/`だけに生成し、Environment Fileへは絶対に置きません。

## Raspberry Piへの導入

```bash
tar -xzf midnight-sensor-device-fw-<version>.tar.gz
cd midnight-sensor-device-fw-<version>
cp .env.device.example .env.device
chmod 600 .env.device
```

staging用`.env.device`へremote Proof Server URL／token、Worker ingestion URL／token、deploy済みContract address、sensor設定を記入します。F/W archiveはdeployment非依存で、開発hostのaddressを埋め込みません。mnemonicやseedは追加しません。検証後、InstallerはこのFileを`~/.midnight/midnight-cloudflare-demo/config/device.env`へ移し、staging copyを削除します。

Staging Fileを作るのは初回導入時だけです。Upgradeは導入済み`config/device.env`を再利用します。新しいArchiveに異なるStaging Fileがある場合、Installerはどちらを優先するか推測せず拒否します。

```bash
./installer.sh
```

InstallerはRelease ManifestとContract Artifact Manifestを検証し、Releaseを`releases/<version>-<manifest-hash>/`へCopyしてから、CollectorとDevice Wallet Workspaceのproduction dependencyだけを導入します。これらの検証とDevice Testが成功した場合だけ`current`を切り替え、旧Targetを`previous`にします。Systemd Serviceとして作成するのはCollectorだけで、Walletは明示的に起動するCLIのままです。Compact compile、proving key生成、Docker、Contract deploy、Wallet初期化、開発tool導入は行いません。

導入後の構成:

```text
~/.midnight/midnight-cloudflare-demo/
├── config/device.env
├── current -> releases/<active-release>
├── previous -> releases/<previous-release>
├── releases/<version>-<manifest-hash>/
└── device-wallet/
```

導入後は展開元Archiveを削除できます。2つのSymlinkを入れ替えてRollbackするには次を実行します。

```bash
~/.midnight/midnight-cloudflare-demo/current/installer.sh --rollback
```

このTree外へ残るのはOS統合だけです。Systemd Unit、永続Journal設定／Report Helper、および適切なVersionがHostにない場合のInstaller管理Node.js Runtimeです。Project Source、Device設定、Wallet StateはこれらのOS Fileと一緒に保存しません。

導入後の確認:

```bash
sudo systemctl status measurement-edge-agent
curl http://127.0.0.1:8788/health
sudo journalctl -u measurement-edge-agent -f
```

Transaction送信が必要な場合だけ、Installerで選択した同じ非root Service Userとして、別系統のDevice Walletを明示的に初期化します。

```bash
cd ~/.midnight/midnight-cloudflare-demo/current
npm run device:wallet
npm run device:funding
npm run device:submit -- --input /path/to/prepared-real-dataset.json
npm run device:status
```

`device:submit`は実際の`SensorRecord[]`または`PreparedDataset`を受け取ります。配列Inputでは`--min`、`--max`、`--selected-index`を指定でき、既存Rootに対する登録省略には`--verify-only`を使用します。SubmitはScheduled実行されず、WorkerのAttestation recordも更新しません。CollectorはReadingをD1へUploadするだけです。

`config/device.env`とDevice Wallet Directory全体を、開発PCの`.env.development` Backupとは別に保管してください。Wallet DirectoryにはRecovery Credential、暗号化Private Dataset、Private State Password、Wallet Sync Cacheが含まれます。Release DirectoryとSymlinkは、署名／Checksum検証済みFirmware Archiveから再作成できます。
