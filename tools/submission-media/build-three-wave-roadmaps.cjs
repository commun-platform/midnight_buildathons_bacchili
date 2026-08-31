const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '../..');
const jaPath = path.join(root, 'docs/ja/assets/review/three-wave-roadmap-ja.svg');
const enPath = path.join(root, 'docs/assets/review/three-wave-roadmap-en.svg');
const jaPngPath = path.join(root, 'docs/ja/assets/review/three-wave-roadmap-ja.png');
const enPngPath = path.join(root, 'docs/assets/review/three-wave-roadmap-en.png');
let svg = fs.readFileSync(jaPath, 'utf8');

const replacements = [
  ['3 Wave 製品・事業ロードマップ', 'Three-Wave Product &amp; Business Roadmap'],
  ['製品名ではなく、検証する問いと到達成果で進める', 'Progress by validated questions and outcomes — not by product names'],
  ['中核：Midnightとゼロ知識証明 ／ 詳細な製品・クラウド・暗号・参照機器は技術仕様へ分離', 'CORE: MIDNIGHT + ZERO-KNOWLEDGE PROOFS / IMPLEMENTATION PRODUCTS REMAIN IN TECHNICAL SPECS'],
  ['現在のPoC', 'CURRENT POC'],
  ['計画', 'PLANNED'],
  ['検証する問い', 'QUESTION'],
  ['非公開しきい値証明の', 'Does the private threshold-proof'],
  ['中核価値が成立するか', 'value proposition work?'],
  ['• ユーザー認可ブラウザで審査', '• User-authorized browser review'],
  ['• 疑似日次Data・認可済みSummary', '• Synthetic day + authorized summaries'],
  ['• 固定形状の非公開日次入力', '• Fixed-shape private daily input'],
  ['• 証明生成とサービス側手数料負担', '• Proof generation + sponsored fees'],
  ['• 公開判定と証拠IDをMidnightへ記録', '• Public result + evidence ID on Midnight'],
  ['• 運用者・第三者表示を1画面で審査', '• Combined operator / verifier review UI'],
  ['成功条件', 'SUCCESS CONDITION'],
  ['審査員が一連のフローを再現し、', 'A reviewer reproduces the complete flow'],
  ['証明・非公開・非証明の境界を理解', 'and understands proof and trust boundaries'],
  ['実際の現場計測システムで', 'Can it operate reliably with real'],
  ['安定運用できるか', 'field measurement systems?'],
  ['• 現場計測と日次処理の自律運用', '• Autonomous field + daily operation'],
  ['• 組織・プロジェクト・役割の分離', '• Organization / project / role separation'],
  ['• 監査記録・監視・運用ダッシュボード', '• Audit trails, monitoring, operations UI'],
  ['• 冪等な再試行・障害復旧・通知', '• Idempotent retry, recovery, alerting'],
  ['• 複数計測元のLifecycle・更新管理', '• Multi-source lifecycle + update control'],
  ['• 企業パートナーとの有償Pilot検証', '• Paid operational partner pilot'],
  ['合意期間中に日次証明を実業務で利用し、', 'A partner uses daily proofs in a real workflow'],
  ['信頼性・支援工数・商用評価を測定', 'and measures reliability, support, and value'],
  ['顧客が継続利用し、', 'Will customers repeatedly use'],
  ['対価を支払うか', 'and pay for the service?'],
  ['• ハードウェア保護Identity・署名権限', '• Hardware-protected identity + authority'],
  ['• ソフトウェア・設定状態のEvidence', '• Software / configuration evidence'],
  ['• 校正・保守・交換・更新の来歴', '• Calibration and lifecycle provenance'],
  ['• 複数組織での商用運用・SLA・DR', '• Multi-org operations, SLA, backup, DR'],
  ['• 利用量・Plan・Billing・Support', '• Metering, plans, billing, and support'],
  ['• 反復利用・更新/拡大・Unit Economics', '• Repeat use, renewal / expansion, economics'],
  ['複数の有償顧客が反復価値を得て、', 'Multiple paying customers obtain repeatable value'],
  ['少なくとも1社が契約更新または利用拡大', 'and at least one customer renews or expands'],
  ['企業との運用Pilot', 'Operational Partner Pilot'],
  ['PMF・継続売上', 'PMF + Recurring Revenue'],
];

for (const [from, to] of replacements) {
  svg = svg.split(from).join(to);
}

svg = svg
  .replace('font-family="Noto Sans CJK JP, sans-serif"', 'font-family="DejaVu Sans, Arial, sans-serif"')
  .replace('font-size="48" font-weight="700">Three-Wave', 'font-size="43" font-weight="700">Three-Wave')
  .replace('font-size="20">Progress by', 'font-size="18">Progress by')
  .replace('font-size="20" font-weight="600">CORE:', 'font-size="17" font-weight="600">CORE:')
  .replace('font-size="20" font-weight="700">Trust Minimization &amp; PMF', 'font-size="19" font-weight="700">Trust Minimization &amp; PMF')
  .replace('font-size="19" font-weight="700">Multiple paying customers obtain repeatable value', 'font-size="15" font-weight="700">Multiple paying customers obtain repeatable value')
  .replace('font-size="19" font-weight="700">and at least one customer renews or expands', 'font-size="15" font-weight="700">and at least one customer renews or expands')
  .replace('font-size="21" font-weight="700">PMF + Recurring Revenue', 'font-size="19" font-weight="700">PMF + Recurring Revenue');

if (/[぀-ヿ㐀-鿿]/u.test(svg)) {
  throw new Error('Japanese text remains in the generated English roadmap SVG');
}

async function build() {
  fs.writeFileSync(enPath, svg);
  await Promise.all([
    sharp(Buffer.from(fs.readFileSync(jaPath, 'utf8'))).png().toFile(jaPngPath),
    sharp(Buffer.from(svg)).png().toFile(enPngPath),
  ]);
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
