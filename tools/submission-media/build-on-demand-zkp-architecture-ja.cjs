const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { architectureSvg } = require('./build-on-demand-zkp-architecture.cjs');

const root = path.resolve(__dirname, '../..');
const outputDir = path.join(root, 'docs/assets/guides');
const svgPath = path.join(outputDir, 'on-demand-zkp-midnight-architecture-ja-pitch.svg');
const pngPath = path.join(outputDir, 'on-demand-zkp-midnight-architecture-ja-pitch.png');

const translations = [
  ['OUR ENGINEERING INNOVATION · CURRENT PREPROD SYSTEM', '私たちの工夫・現行PREPRODシステム'],
  ['ON-DEMAND ZK PROOF &amp; MIDNIGHT RECORDING', 'オンデマンドZK証明・MIDNIGHT記録'],
  [
    '24/7 admission with a stateful Sponsor Wallet that wakes only for eligible work, pays DUST, checkpoints, and stops.',
    '24時間受付。対象Jobがある時だけ状態を持つSponsor Walletを起動し、DUST付与、Checkpoint保存、停止まで行う。',
  ],
  ['PREPROD FLOW CONFIRMED', 'PREPROD動作確認済み'],
  ['1 · EDGE &amp; INTAKE', '1・エッジ／受付'],
  ['BROWSER WALLET', 'BROWSER WALLET'],
  ['User-authorized transaction', 'User認可済みTransaction'],
  ['Private input stays local', '非公開InputはLocalに保持'],
  ['EXTERNAL CLOUD API', '外部CLOUD API'],
  ['Managed measurement source', '管理対象の計測Source'],
  ['Authenticated HTTPS fetch', '認証済みHTTPS取得'],
  ['24/7 ACCEPTANCE', '24時間受付'],
  ['PRIVATE RAW VALUES', '非公開RAW値'],
  ['never become public evidence', '公開Evidenceにはしない'],
  ['2 · CLOUDFLARE CONTROL', '2・CLOUDFLARE制御'],
  ['WORKER API', 'WORKER API'],
  ['Auth · validation · durable 202 acceptance', '認証・検査・永続202受付'],
  ['D1 JOB STATE', 'D1 JOB状態'],
  ['Dependencies · idempotency', '依存順・冪等性'],
  ['single six-minute processing lease', '単一の6分処理Lease'],
  ['PRIVATE R2 ARTIFACTS', '非公開R2データ'],
  ['Encrypted Wallet checkpoint', '暗号化Wallet Checkpoint'],
  ['temporary transaction bytes', '一時Transaction Bytes'],
  ['1-MINUTE JOB CHECK · NO WORK = NO WAKE', '1分ごとにJob確認・空ならWalletを起動しない'],
  ['3 · ON-DEMAND RUNTIMES', '3・オンデマンドRUNTIME'],
  ['SERVER-SIDE SPONSOR WALLET', 'SERVER側SPONSOR WALLET'],
  ['Pays only the network fee for an authorized call', '認可済みCallのNetwork Feeだけを負担'],
  ['Restore encrypted checkpoint', '暗号化Checkpointを復元'],
  ['Pass Wallet synchronization gate', 'Wallet同期Gateを通過'],
  ['Add DUST only + submit', 'DUSTだけを追加・送信'],
  ['Checkpoint + graceful SIGTERM', 'Checkpoint保存・安全なSIGTERM'],
  ['SEPARATE PROOF SERVER', '独立したPROOF SERVER'],
  ['Private witness → ZK proof', '非公開Witness → ZK Proof'],
  ['No persistent raw-value store', 'RAW値を永続保存しない'],
  ['NO DEVICE AUTHORITY · NO RAW VALUES', 'DEVICE権限なし・RAW値なし'],
  ['4 · PUBLIC EVIDENCE', '4・公開EVIDENCE'],
  ['MIDNIGHT', 'MIDNIGHT'],
  ['Threshold result · commitment', 'しきい値判定・Commitment'],
  ['transaction + block metadata', 'Transaction・Block Metadata'],
  ['PUBLIC VERIFICATION', '第三者検証'],
  ['Checks the registered policy,', '登録済みPolicy、'],
  ['result, commitment, and TX', '判定・Commitment・TXを'],
  ['without private readings', '非公開Readingなしで確認'],
  ['PUBLIC RESULT + METADATA ONLY', '公開は判定＋METADATAだけ'],
  ['AUTH', '認証'],
  ['ELIGIBLE', '対象JOB'],
  ['PROOF + TX', 'PROOF＋TX'],
  ['PUBLIC BOUNDARY', '公開境界'],
  ['COST-AWARE OPERATIONS · STANDARD-4 PLANNING EXAMPLE', 'COSTを抑える運用・STANDARD-4計画例'],
  ['24/7 · 720 h / 30 days', '24時間・30日で720 h'],
  ['illustrative 4 h/day drain · 120 h', '1日4 h処理例・月120 h'],
  ['PLANNING ESTIMATE', '計画用概算'],
  [
    'Excludes Workers Paid, D1, Queue, R2, egress, and Proof Server; actual cost follows drain duration.',
    'Workers Paid、D1、Queue、R2、Egress、Proof Serverは別。実費は処理完了までの起動時間に比例。',
  ],
  ['SERVER-WALLET ACHIEVEMENT', 'SERVER WALLETの成果'],
  ['BUILT + VALIDATED', '構築・検証済み'],
  ['System pays the DUST fee for an authorized call', 'Systemが認可済みCallのDUST Feeを負担'],
  ['Device authority and private values stay separate', 'Device Authorityと非公開値を分離'],
  ['Preprod flow confirmed · 2026-09-03', 'Preprod動作確認・2026-09-03'],
  ['BACCHIRI! · VERIFIABLE MEASUREMENT LAYER', 'BACCHIRI!・検証可能な計測レイヤー'],
  ['DUST sponsorship is fee payment, not authority delegation.', 'DUST SponsorshipはFee負担であり、Authority委譲ではない。'],
];

function japaneseArchitectureSvg() {
  let svg = architectureSvg().replaceAll(
    'Aptos, Inter, Arial, Helvetica, sans-serif',
    'Noto Sans CJK JP, Yu Gothic, Meiryo, sans-serif',
  );
  for (const [english, japanese] of translations) {
    if (!svg.includes(english)) throw new Error(`Missing English source label: ${english}`);
    svg = svg.replaceAll(english, japanese);
  }
  return svg;
}

async function buildJapaneseArchitecture() {
  fs.mkdirSync(outputDir, { recursive: true });
  const svg = japaneseArchitectureSvg();
  fs.writeFileSync(svgPath, `${svg}\n`);
  await sharp(Buffer.from(svg))
    .resize(1672, 941, { fit: 'fill' })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(pngPath);
  return { svgPath, pngPath };
}

if (require.main === module) {
  buildJapaneseArchitecture()
    .then(({ svgPath: builtSvg, pngPath: builtPng }) => {
      process.stdout.write(`${path.relative(root, builtSvg)}\n${path.relative(root, builtPng)}\n`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = { buildJapaneseArchitecture, japaneseArchitectureSvg, pngPath, svgPath };
