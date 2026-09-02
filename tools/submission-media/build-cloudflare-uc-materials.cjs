const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pptxgen = require('pptxgenjs');
const { PDFDocument } = require('pdf-lib');

const root = path.resolve(__dirname, '../..');
const assetDir = path.join(root, 'docs/ja/assets/review');
const deckDir = path.join(root, 'docs/ja/submission/deck');
const width = 1672;
const height = 941;
const PRODUCT_NAME = 'BACCHIRI!━━Verifiable Measurement Layer';

const C = {
  bg: '#06111F',
  panel: '#111F33',
  panel2: '#17263A',
  white: '#F5F7FB',
  muted: '#AAB7C8',
  dim: '#52667A',
  line: '#29415C',
  cyan: '#38D6E8',
  orange: '#F6821F',
  amber: '#F4B740',
  purple: '#A66CFF',
  green: '#79D66A',
};

const iconDefs = `
  <!-- Cloudflare product icons from cloudflare/cloudflare-docs commit 3feb9a48. -->
  <symbol id="cf-workers" viewBox="0 0 48 49"><g fill="currentColor"><path d="m18.63 37.418-9.645-12.9 9.592-12.533-1.852-2.527L5.917 23.595l-.015 1.808 10.86 14.542z"/><path d="M21.997 6.503h-3.712l13.387 18.3-13.072 17.7h3.735L35.4 24.81z"/><path d="M29.175 6.503h-3.758l13.598 18.082-13.598 17.918h3.765l12.908-17.01v-1.808z"/></g></symbol>
  <symbol id="cf-d1" viewBox="0 0 65 64"><path fill="currentColor" d="m23.6 22.2 3.03 1.75v3.5L23.6 29.2l-3.03-1.75v-3.5zM20.06 49l3.54-3.54L27.14 49l-3.54 3.54zm3.54-14.7c.593 0 1.17.176 1.67.506.493.33.878.798 1.1 1.35a3 3 0 0 1-.65 3.27c-.42.42-.954.705-1.54.821a3 3 0 0 1-1.73-.171 3.04 3.04 0 0 1-1.35-1.1 3 3 0 0 1-.506-1.67c0-.796.316-1.56.879-2.12a3 3 0 0 1 2.12-.879zM10.3 11.2l6.42-4.89 1.21-.37h29l1.19.39 6.61 4.89.82 1.61v38L55 52.21l-4.83 5.11-1.46.63h-31.7l-1.37-.54-5.48-5.11-.64-1.47v-38zm3.21 25.4 4.47 4.94h.056v4h-1.83l-2.7-3v7.39l4.26 4h30l3.7-3.91V42.3l-3.67 3.24h-18.6v-4h17.2l5.19-4.61v-7.44l-3.67 3.25h-18.7v-4h17.2l5.19-4.6v-6.92l-3.67 3.26h-31.6l-2.74-2.8v6.12l4.47 4.94h.056v4h-1.83l-2.7-3zm32.7-26.7h-27.6l-4.07 3.11 3.4 3.48h28.4l4-3.56z"/></symbol>
  <symbol id="cf-queues" viewBox="0 0 40 40"><g fill="currentColor"><path d="M11.154 19.894 5.33 14.21l-1.612 1.65 2.656 2.594H1.942a1.442 1.442 0 1 0 0 2.884h4.433L3.72 23.927l1.61 1.653 5.823-5.685Zm28.352 0-5.823-5.685-1.612 1.65 2.656 2.594h-4.433a1.442 1.442 0 1 0 0 2.884h4.433l-2.655 2.591 1.611 1.653z"/><rect width="23.07" height="2.884" x="7.911" y="7" rx="1.442"/><rect width="23.07" height="2.884" x="7.911" y="30.07" rx="1.442"/><path d="M13.679 14.21c.796 0 1.442.645 1.442 1.441v8.651a1.442 1.442 0 1 1-2.884 0v-8.65c0-.797.646-1.443 1.442-1.443Zm5.767 0c.797 0 1.442.645 1.442 1.441v8.651a1.442 1.442 0 1 1-2.884 0v-8.65c0-.797.646-1.443 1.442-1.443Zm5.768 0c.796 0 1.442.645 1.442 1.441v8.651a1.442 1.442 0 1 1-2.884 0v-8.65c0-.797.645-1.443 1.442-1.443Z"/></g></symbol>
  <symbol id="cf-containers" viewBox="0 0 512 512"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"><path d="M448 341.37V170.61A32 32 0 0 0 432.11 143l-152-88.46a47.94 47.94 0 0 0-48.24 0L79.89 143A32 32 0 0 0 64 170.61v170.76A32 32 0 0 0 79.89 369l152 88.46a48 48 0 0 0 48.24 0l152-88.46A32 32 0 0 0 448 341.37"/><path d="m69 153.99 187 110 187-110m-187 310v-200"/></g></symbol>
  <symbol id="cf-r2" viewBox="0 0 40 40"><path fill="currentColor" fill-rule="evenodd" d="M30.289 6.423c-2.43-.813-5.958-1.362-9.977-1.362-4.018 0-7.545.549-9.976 1.362-1.228.41-2.033.842-2.48 1.195q-.14.111-.204.18c.052.171.196.395.562.67.524.394 1.372.783 2.563 1.119 2.368.666 5.731 1.023 9.536 1.023s7.167-.357 9.535-1.023c1.191-.336 2.04-.725 2.563-1.119.366-.275.51-.499.562-.67a2 2 0 0 0-.204-.18c-.447-.353-1.252-.784-2.48-1.195m-20.24 5.624c-.885-.25-1.71-.552-2.424-.922v4.393c0 .196.097.514.625.941.535.433 1.391.869 2.576 1.252 2.36.764 5.71 1.222 9.486 1.222 3.778 0 7.128-.458 9.487-1.222 1.185-.383 2.041-.82 2.576-1.252.528-.427.625-.745.625-.94v-4.394c-.715.37-1.539.673-2.424.922-2.7.76-6.336 1.124-10.264 1.124s-7.564-.364-10.263-1.124m25.576 3.471V7.622c0-2.829-6.856-5.122-15.313-5.122C11.857 2.5 5 4.793 5 7.622v24.756c0 2.829 6.856 5.122 15.313 5.122 8.456 0 15.312-2.293 15.312-5.122zM33 19.134c-.7.393-1.505.726-2.375 1.008-2.708.877-6.358 1.352-10.313 1.352-3.954 0-7.604-.475-10.312-1.352-.87-.282-1.676-.615-2.375-1.008v4.28c0 .196.097.514.625.942.535.432 1.391.868 2.576 1.252 2.36.763 5.71 1.221 9.486 1.221 3.778 0 7.128-.458 9.487-1.221 1.185-.384 2.041-.82 2.576-1.252.528-.428.625-.746.625-.941v-4.28Zm-23 8.904c-.87-.281-1.676-.615-2.375-1.007v5.143c.044.048.116.117.231.208.447.353 1.252.785 2.48 1.195 2.43.813 5.958 1.362 9.976 1.362s7.546-.549 9.977-1.362c1.228-.41 2.033-.842 2.48-1.195a2 2 0 0 0 .231-.208v-5.143c-.7.392-1.505.726-2.375 1.007-2.708.877-6.358 1.352-10.313 1.352-3.954 0-7.604-.475-10.312-1.352m23.06 4.06-.01.016zm-25.495 0 .01.016zm3.997-15.726c.725 0 1.313-.573 1.313-1.28s-.588-1.281-1.313-1.281c-.724 0-1.312.573-1.312 1.28s.588 1.281 1.313 1.281Zm1.313 6.83c0 .706-.588 1.28-1.313 1.28-.724 0-1.312-.574-1.312-1.28 0-.708.588-1.281 1.313-1.281.724 0 1.312.573 1.312 1.28Zm-1.313 9.176c.725 0 1.313-.573 1.313-1.28s-.588-1.28-1.313-1.28c-.724 0-1.312.572-1.312 1.28 0 .707.588 1.28 1.313 1.28Z" clip-rule="evenodd"/></symbol>`;

const nodes = {
  edge: { introduced: 1, x: 48, y: 300, w: 250, h: 350, title: 'エッジデバイス', sub: '収集・集約・署名', color: C.cyan, icon: 'edge' },
  workers: { introduced: 1, x: 385, y: 260, w: 230, h: 155, title: 'Workers', sub: 'API・認証', color: C.orange, icon: 'cf-workers' },
  d1: { introduced: 1, x: 385, y: 510, w: 230, h: 155, title: 'D1', sub: '運用状態', color: C.orange, icon: 'cf-d1' },
  proof: { introduced: 3, x: 685, y: 260, w: 230, h: 155, title: 'Proof Server', sub: '証明生成', color: C.orange, icon: 'cf-containers' },
  queues: { introduced: 3, x: 685, y: 510, w: 230, h: 155, title: 'Queues', sub: '証明依頼', color: C.orange, icon: 'cf-queues' },
  sponsor: { introduced: 4, x: 985, y: 260, w: 230, h: 155, title: 'Sponsor Wallet', sub: '手数料・送信', color: C.orange, icon: 'cf-containers' },
  r2: { introduced: 4, x: 985, y: 510, w: 230, h: 155, title: 'R2', sub: '暗号化同期', color: C.orange, icon: 'cf-r2' },
  midnight: { introduced: 4, x: 1315, y: 275, w: 285, h: 220, title: 'MIDNIGHT', sub: 'しきい値・判定記録', color: C.purple, icon: 'midnight' },
  public: { introduced: 5, x: 1315, y: 565, w: 285, h: 130, title: '第三者画面', sub: '判定を確認', color: C.cyan, icon: 'public' },
};

const useCases = [
  {
    step: 1,
    slug: 'device-auth',
    title: 'デバイスを認証する',
    subtitle: '身元を確認し、24時間のAPIセッションを発行',
    focus: 'API認証鍵はCloudflare認証だけに使う',
    active: ['edge', 'workers', 'd1'],
    flows: [
      ['M298 350H385', C.cyan, 'P-256署名', 340, 330],
      ['M500 415V510', C.cyan, 'Session Hash', 520, 470],
    ],
  },
  {
    step: 2,
    slug: 'hourly-summary',
    title: '1時間Summaryを保存する',
    subtitle: '生のセンサー値を端末に残し、運用要約だけを送信',
    focus: '生のセンサー値は送らず、1時間SummaryだけをD1へ',
    active: ['edge', 'workers', 'd1'],
    flows: [
      ['M298 390H385', C.cyan, '1時間Summary', 340, 378],
      ['M550 415V510', C.cyan, '保存', 570, 470],
    ],
  },
  {
    step: 3,
    slug: 'daily-proof',
    title: '日次ZKPを生成する',
    subtitle: '非公開MIN / MAXを開示せず、登録済みしきい値と照合',
    focus: '非公開MIN / MAXは証明中だけ通過し、保存しない',
    active: ['edge', 'workers', 'd1', 'queues', 'proof'],
    flows: [
      ['M298 350H385', C.amber, '非公開MIN / MAX', 335, 332],
      ['M615 330H685', C.amber, '証明中だけ', 650, 312],
      ['M615 585H685', C.cyan, 'Job IDのみ', 650, 570],
      ['M800 510V415', C.cyan, '受付', 820, 470],
    ],
  },
  {
    step: 4,
    slug: 'sponsored-submit',
    title: '署名済み取引を送信する',
    subtitle: 'デバイスが内容を固定し、専用WalletがDUSTだけを追加',
    focus: 'Sponsor Walletは署名済み内容を変えず、DUSTだけを追加',
    active: ['edge', 'workers', 'proof', 'sponsor', 'r2', 'midnight'],
    flows: [
      ['M298 410H340V725H950V340H985', C.purple, 'デバイス署名済み取引', 660, 712],
      ['M1215 340H1315', C.purple, '', 1265, 325],
      ['M1100 415V510', C.orange, '暗号化同期', 1120, 470],
    ],
  },
  {
    step: 5,
    slug: 'public-review',
    title: '第三者が判定を確認する',
    subtitle: '公開記録だけを表示し、センサー値は見せない',
    focus: '第三者が見るのは運用日・登録済み境界・24個の時間帯判定・適用しきい値・証明対象・取引記録',
    active: ['workers', 'd1', 'midnight', 'public'],
    flows: [
      ['M1315 455H1260V725H500V665', C.green, '確定結果', 930, 712],
      ['M615 335H650V235H1275V630H1315', C.cyan, '公開情報', 1135, 225],
    ],
  },
];

function escapeXml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function text(x, y, value, size, color, options = {}) {
  const anchor = options.anchor || 'start';
  const weight = options.weight || 400;
  return `<text x="${x}" y="${y}" fill="${color}" font-family="Noto Sans JP, Yu Gothic, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${escapeXml(value)}</text>`;
}

function edgeIcon(x, y, color) {
  return `<g transform="translate(${x} ${y})" fill="none" stroke="${color}" stroke-width="4"><rect x="0" y="18" width="68" height="50" rx="8"/><path d="M14 18V2M54 18V2M21 55h26"/><circle cx="18" cy="43" r="4" fill="${color}"/><circle cx="50" cy="43" r="4" fill="${color}"/></g>`;
}

function midnightIcon(x, y, color) {
  return `<g transform="translate(${x} ${y})" fill="none" stroke="${color}" stroke-width="4"><path d="M45 5a42 42 0 1 0 24 76A36 36 0 0 1 45 5Z"/><path d="M72 13l4 8 8 4-8 4-4 8-4-8-8-4 8-4z" fill="${color}"/></g>`;
}

function publicIcon(x, y, color) {
  return `<g transform="translate(${x} ${y})" fill="none" stroke="${color}" stroke-width="3"><rect width="54" height="38" rx="5"/><path d="M9 49h36M27 38v11"/></g>`;
}

function nodeMarkup(id, current) {
  const n = nodes[id];
  if (n.introduced > current.step) return '';
  const active = current.active.includes(id);
  const opacity = active ? 1 : 0.33;
  const stroke = active ? n.color : C.dim;
  const fill = id === 'midnight' ? '#17152E' : C.panel;
  let icon = '';
  if (n.icon === 'edge') icon = edgeIcon(n.x + n.w / 2 - 34, n.y + 45, stroke);
  else if (n.icon === 'midnight') icon = midnightIcon(n.x + n.w / 2 - 42, n.y + 24, stroke);
  else if (n.icon === 'public') icon = publicIcon(n.x + 28, n.y + 36, stroke);
  else icon = `<use href="#${n.icon}" x="${n.x + 25}" y="${n.y + 28}" width="54" height="54" color="${stroke}"/>`;
  const cloudflareProduct = n.icon.startsWith('cf-');
  const titleX = n.icon === 'public' ? n.x + 102 : cloudflareProduct ? n.x + 92 : n.x + n.w / 2;
  const titleY = n.icon === 'edge' ? n.y + 180 : n.icon === 'midnight' ? n.y + 150 : n.icon === 'public' ? n.y + 58 : n.y + 62;
  const titleAnchor = n.icon === 'public' || cloudflareProduct ? 'start' : 'middle';
  const subY = n.icon === 'edge' ? n.y + 235 : n.icon === 'midnight' ? n.y + 190 : n.icon === 'public' ? n.y + 92 : n.y + 118;
  const titleSize = id === 'midnight' ? 29 : id === 'proof' || id === 'sponsor' ? 19 : 25;
  return `<g opacity="${opacity}"><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="18" fill="${fill}" stroke="${stroke}" stroke-width="${active ? 4 : 2}"/>${icon}${text(titleX, titleY, n.title, titleSize, stroke, { anchor: titleAnchor, weight: 900 })}${text(n.x + n.w / 2, subY, n.sub, 16, C.white, { anchor: 'middle', weight: 700 })}</g>`;
}

function progressMarkup(step) {
  const labels = ['認証', '1時間集計', '日次証明', '署名・送信', '第三者確認'];
  return labels.map((label, index) => {
    const n = index + 1;
    const x = 545 + index * 210;
    const current = n === step;
    const past = n < step;
    const color = current ? C.cyan : past ? C.green : C.dim;
    return `<g opacity="${current ? 1 : past ? 0.62 : 0.4}"><circle cx="${x}" cy="145" r="18" fill="${current ? color : C.bg}" stroke="${color}" stroke-width="3"/>${text(x, 151, String(n), 15, current ? C.bg : color, { anchor: 'middle', weight: 900 })}${text(x + 28, 151, label, 15, color, { weight: current ? 900 : 700 })}</g>`;
  }).join('');
}

function flowMarkup(flow) {
  const [d, color, label, labelX, labelY] = flow;
  const marker = color === C.amber ? 'amber' : color === C.purple ? 'purple' : color === C.green ? 'green' : 'cyan';
  const labelMarkup = label
    ? `<rect x="${labelX - 86}" y="${labelY - 19}" width="172" height="28" rx="8" fill="${C.bg}" opacity=".94"/>${text(labelX, labelY + 1, label, 13, color, { anchor: 'middle', weight: 900 })}`
    : '';
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#${marker}-arrow)"/>${labelMarkup}`;
}

function priorFlowMarkup(current) {
  return useCases
    .filter((useCase) => useCase.step < current.step)
    .flatMap((useCase) => useCase.flows)
    .map(([d]) => `<path d="${d}" fill="none" stroke="${C.dim}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".16"/>`)
    .join('');
}

function svgFor(current) {
  const cloudflareHeight = current.step >= 4 ? 535 : 500;
  const activeNodes = Object.keys(nodes).map((id) => nodeMarkup(id, current)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">UC ${current.step}：${escapeXml(current.title)}</title>
  <desc id="desc">Cloudflareリソースをユースケース順に追加し、このユースケースで着目する経路だけを強調する。</desc>
  <defs>
    <pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse"><path d="M44 0H0V44" fill="none" stroke="#173047" stroke-width="1" opacity=".42"/></pattern>
    <marker id="cyan-arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0 0L10 3L0 6Z" fill="${C.cyan}"/></marker>
    <marker id="amber-arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0 0L10 3L0 6Z" fill="${C.amber}"/></marker>
    <marker id="purple-arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0 0L10 3L0 6Z" fill="${C.purple}"/></marker>
    <marker id="green-arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0 0L10 3L0 6Z" fill="${C.green}"/></marker>
    ${iconDefs}
  </defs>
  <rect width="${width}" height="${height}" fill="${C.bg}"/>
  <rect width="${width}" height="${height}" fill="url(#grid)"/>
  <path d="M0 24H${width}" stroke="${C.purple}" stroke-width="5"/>
  ${text(50, 78, `UC ${current.step} / 5　${current.title}`, 40, C.white, { weight: 900 })}
  ${text(52, 116, current.subtitle, 18, C.muted, { weight: 500 })}
  ${progressMarkup(current.step)}
  <rect x="350" y="205" width="900" height="${cloudflareHeight}" rx="24" fill="#0A1625" stroke="${C.orange}" stroke-width="3" stroke-dasharray="13 9"/>
  <rect x="380" y="185" width="245" height="40" rx="20" fill="${C.orange}"/>
  ${text(503, 212, 'CLOUDFLARE', 18, '#08111D', { anchor: 'middle', weight: 900 })}
  ${priorFlowMarkup(current)}
  ${activeNodes}
  ${current.flows.map(flowMarkup).join('')}
  <rect x="48" y="805" width="1552" height="78" rx="16" fill="#0A1727" stroke="${current.step === 3 ? C.amber : current.step === 4 ? C.purple : current.step === 5 ? C.green : C.cyan}" stroke-width="2"/>
  ${text(82, 854, '着目点', 18, C.muted, { weight: 900 })}
  ${text(185, 855, current.focus, 24, C.white, { weight: 900 })}
  ${text(1570, 867, 'Cloudflare公式製品アイコン使用', 10, C.muted, { anchor: 'end' })}
  </svg>`;
}

async function buildDeck(pngPaths) {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'BACCHIRI! contributors';
  pptx.company = 'Midnight Buildathon Wave 1';
  pptx.subject = `${PRODUCT_NAME}：Cloudflareリソース構成を5つのユースケースで段階表示`;
  pptx.title = `${PRODUCT_NAME} — Cloudflareユースケース別構成`;
  pptx.lang = 'ja-JP';
  for (const pngPath of pngPaths) {
    const slide = pptx.addSlide();
    slide.background = { color: '06111F' };
    slide.addImage({ path: pngPath, x: 0, y: 0, w: 13.333, h: 7.5 });
  }
  await pptx.writeFile({ fileName: path.join(deckDir, 'cloudflare-use-cases-ja.pptx') });

  const pdf = await PDFDocument.create();
  pdf.setTitle(`${PRODUCT_NAME} — Cloudflareユースケース別構成`);
  pdf.setAuthor('BACCHIRI! contributors');
  for (const pngPath of pngPaths) {
    const image = await pdf.embedPng(fs.readFileSync(pngPath));
    const page = pdf.addPage([960, 540]);
    page.drawImage(image, { x: 0, y: 0, width: 960, height: 540 });
  }
  fs.writeFileSync(path.join(deckDir, 'cloudflare-use-cases-ja.pdf'), await pdf.save());
}

async function main() {
  fs.mkdirSync(assetDir, { recursive: true });
  fs.mkdirSync(deckDir, { recursive: true });
  const pngPaths = [];
  for (const useCase of useCases) {
    const base = `cloudflare-uc0${useCase.step}-${useCase.slug}-ja`;
    const svgPath = path.join(assetDir, `${base}.svg`);
    const pngPath = path.join(assetDir, `${base}.png`);
    const svg = svgFor(useCase);
    fs.writeFileSync(svgPath, svg);
    await sharp(Buffer.from(svg)).png().toFile(pngPath);
    pngPaths.push(pngPath);
  }
  await buildDeck(pngPaths);
  console.log(`Generated ${pngPaths.length} UC diagrams, PPTX, and PDF.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
