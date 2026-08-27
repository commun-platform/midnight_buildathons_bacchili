# Midnight Sensor Device Firmware

このpackageはRaspberry Pi用のデバイス運用runtimeだけを含みます。開発PC上で`package_archive.sh`から生成し、開発Wallet、Compact source／compiler、proving key生成tool、Cloudflare deploy code、Browser applicationは含めません。

## 含まれる運用機能

- 温度collectorとloopback health endpoint
- deploy済みContractを使うデバイス運用Wallet client
- 開発PCで生成してintegrity manifestを付けたCompact runtime artifact
- `installer.sh`、systemd installer、永続障害解析log

開発／Deployer Walletはこのpackageへ含めません。デバイスWallet credentialsはRaspberry Pi上の`~/.midnight/midnight-cloudflare-demo/device-wallet/`だけに生成し、`.env.device`へは絶対に置きません。

## Raspberry Piへの導入

```bash
tar -xzf midnight-sensor-device-fw-<version>.tar.gz
cd midnight-sensor-device-fw-<version>
cp .env.device.example .env.device
chmod 600 .env.device
```

`.env.device`へremote Proof Server URL／token、Worker ingestion URL／token、deploy済みContract address、sensor設定を記入します。F/W archiveはdeployment非依存で、開発hostのaddressを埋め込みません。mnemonicやseedは追加しません。

```bash
./installer.sh
```

Installerはrelease manifestとContract artifact manifestを検証してからproduction dependencyだけを導入します。Compact compile、proving key生成、Docker、Contract deploy、開発tool導入は行いません。

導入後の確認:

```bash
sudo systemctl status measurement-edge-agent
curl http://127.0.0.1:8788/health
sudo journalctl -u measurement-edge-agent -f
```

Transaction送信が必要な場合だけ、service userとして別系統のデバイスWalletを明示的に初期化します。

```bash
npm run device:wallet
npm run device:funding
npm run device:submit -- --input /path/to/prepared-real-dataset.json
npm run device:status
```

デバイスWallet directoryは、開発PCの`.env.development` backupとは別に保管してください。
