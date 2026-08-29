const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');

const root = path.resolve(__dirname, '..');
const PAGE_W = 960;
const PAGE_H = 540;
const PRODUCT_NAME = 'BACCHIRI!━━Verifiable Measurement Layer';
const PRODUCT_SLUG = 'bacchiri-verifiable-measurement-layer-wave1';

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function svgText(lines, options) {
  const {
    x, y, size, color, weight = 400, anchor = 'start',
    family = 'Noto Sans CJK JP, DejaVu Sans, sans-serif',
    lineHeight = size * 1.28,
  } = options;
  return lines.map((line, index) =>
    '<text x="' + x + '" y="' + (y + index * lineHeight) + '" fill="#' + color +
    '" font-family="' + family + '" font-size="' + size + '" font-weight="' + weight +
    '" text-anchor="' + anchor + '">' + escapeXml(line) + '</text>'
  ).join('');
}

function coverSvg(locale) {
  const ja = locale === 'ja';
  const title = ja
    ? ['センサー値を開示せず、', 'しきい値以内であることを示す']
    : ['Show threshold compliance.', 'Keep sensor values private.'];
  const sub = ja
    ? '第三者が確認できるのは対象日・公開しきい値・判定結果。センサー値は見えない'
    : 'A third party can check the day, public threshold, and result. Sensor values remain hidden.';
  const values = ja
    ? [
      ['センサー値', 'エッジデバイス内だけ', '38D6E8'],
      ['第三者が確認', '対象日・しきい値・判定', 'A66CFF'],
      ['Wave 1', 'Midnight事前公開環境で確認済み', '79D66A'],
    ]
    : [
      ['SENSOR VALUES', 'STAY ON EDGE DEVICE', '38D6E8'],
      ['THIRD PARTY CHECKS', 'DAY · THRESHOLD · RESULT', 'A66CFF'],
      ['WAVE 1', 'MIDNIGHT PREPRODUCTION\nNETWORK VERIFIED', '79D66A'],
    ];
  let svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1672" height="941" viewBox="0 0 1672 941">',
    '<rect width="1672" height="941" fill="#06111F"/>',
    '<path d="M0 30H1672" stroke="#A66CFF" stroke-width="5"/>',
    '<g opacity=".22" stroke="#29415C" stroke-width="1">',
  ];
  for (let x = 0; x <= 1672; x += 64) svg.push('<path d="M' + x + ' 0V941"/>');
  for (let y = 0; y <= 941; y += 64) svg.push('<path d="M0 ' + y + 'H1672"/>');
  svg.push('</g>');
  svg.push(svgText([PRODUCT_NAME], { x: 82, y: 110, size: 28, color: '38D6E8', weight: 700 }));
  svg.push(svgText(title, { x: 82, y: 205, size: ja ? 58 : 66, color: 'F5F7FB', weight: 700, lineHeight: 78 }));
  svg.push(svgText([sub], { x: 86, y: 385, size: ja ? 25 : 27, color: 'AAB7C8', weight: 400 }));
  values.forEach((value, i) => {
    const x = 86 + i * 520;
    svg.push('<rect x="' + x + '" y="455" width="470" height="210" rx="18" fill="#0D1B2B" stroke="#' + value[2] + '" stroke-width="3"/>');
    svg.push(svgText([value[0]], { x: x + 235, y: 530, size: 28, color: value[2], weight: 700, anchor: 'middle' }));
    svg.push(svgText(value[1].split('\n'), { x: x + 235, y: value[1].includes('\n') ? 585 : 610, size: ja ? 24 : 25, color: 'F5F7FB', weight: 700, anchor: 'middle', lineHeight: 36 }));
  });
  svg.push(svgText([
    ja
      ? 'Wave 1・ソース検証 2026-08-29 JST・Midnight事前公開記録 2026-08-28 JST'
      : 'Wave 1 · Source validated 2026-08-29 JST · Midnight record 2026-08-28 JST',
  ], { x: 836, y: 810, size: 19, color: 'AAB7C8', weight: 400, anchor: 'middle' }));
  svg.push('</svg>');
  return svg.join('');
}

function guiSvg(locale) {
  const ja = locale === 'ja';
  const title = ja
    ? '最終画面で、操作から公開検証まで見せる'
    : 'Show the final GUI from action to public verification';
  const sub = ja
    ? '録画は画面完成後に実施。現時点では撮影枠と確認項目を固定する。'
    : 'Capture follows the completed GUI; required review evidence is fixed now.';
  const points = ja
    ? ['デバイスとしきい値の紐付け', '1日分を24時間枠で証明', 'デバイスが署名したMidnight取引', '最小値・最大値を見せない第三者画面']
    : ['Device-to-threshold binding', 'One day proved in 24 hourly slots', 'Device-signed Midnight transaction', 'Public view hides MIN / MAX values'];
  let svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1672" height="941" viewBox="0 0 1672 941">',
    '<rect width="1672" height="941" fill="#06111F"/>',
    '<path d="M0 30H1672" stroke="#A66CFF" stroke-width="5"/>',
  ];
  svg.push(svgText([ja ? '08・稼働画面' : '08 · WORKING PRODUCT'], { x: 80, y: 95, size: 24, color: '38D6E8', weight: 700 }));
  svg.push(svgText([title], { x: 80, y: 165, size: ja ? 46 : 49, color: 'F5F7FB', weight: 700 }));
  svg.push(svgText([sub], { x: 82, y: 215, size: 22, color: 'AAB7C8' }));
  svg.push('<rect x="80" y="280" width="990" height="510" rx="18" fill="#111F33" stroke="#38D6E8" stroke-width="4" stroke-dasharray="14 12"/>');
  svg.push(svgText([ja ? '最終画面キャプチャ' : 'FINAL IMPLEMENTED GUI CAPTURE'], { x: 575, y: 470, size: 40, color: '38D6E8', weight: 700, anchor: 'middle' }));
  svg.push(svgText([
    ja ? '画面確定後に差し替え' : 'Insert after the GUI freeze',
    ja ? 'デバイス操作・証明依頼・取引確定・第三者検証' : 'Device operation · Proof request · Midnight transaction · Third-party review',
  ], { x: 575, y: 530, size: 24, color: 'AAB7C8', anchor: 'middle', lineHeight: 44 }));
  svg.push(svgText([ja ? '動画制作は最後に実施' : 'VIDEO PRODUCTION IS LAST'], { x: 575, y: 670, size: 24, color: 'F4B740', weight: 700, anchor: 'middle' }));
  svg.push('<rect x="1110" y="280" width="480" height="510" rx="18" fill="#0D1B2B" stroke="#A66CFF" stroke-width="3"/>');
  svg.push(svgText([ja ? '確認する4点' : 'FOUR REQUIRED CAPTURES'], { x: 1350, y: 345, size: 27, color: 'F5F7FB', weight: 700, anchor: 'middle' }));
  points.forEach((point, i) => {
    const y = 425 + i * 85;
    svg.push('<circle cx="1160" cy="' + (y - 9) + '" r="25" fill="#A66CFF"/>');
    svg.push(svgText([String(i + 1).padStart(2, '0')], { x: 1160, y, size: 15, color: 'F5F7FB', weight: 700, anchor: 'middle' }));
    svg.push(svgText([point], { x: 1210, y, size: ja ? 20 : 21, color: 'F5F7FB', weight: 400 }));
  });
  svg.push(svgText([ja ? '画面テスト：26件すべて成功' : 'Dashboard tests: 26 / 26 PASS'], { x: 1350, y: 742, size: 21, color: '79D66A', weight: 700, anchor: 'middle' }));
  svg.push('</svg>');
  return svg.join('');
}

function figure(locale, name) {
  return locale === 'ja'
    ? path.join(root, 'docs/ja/assets/review', name.replace('-en.png', '-ja.png'))
    : path.join(root, 'docs/assets/review', name);
}

async function pagePngs(locale) {
  const generated = [
    await sharp(Buffer.from(coverSvg(locale))).png().toBuffer(),
    fs.readFileSync(figure(locale, 'privacy-value-proposition-en.png')),
    fs.readFileSync(figure(locale, 'hourly-extrema-zkp-en.png')),
    fs.readFileSync(figure(locale, 'zk-claim-boundary-en.png')),
    fs.readFileSync(figure(locale, 'wave1-system-overview-en.png')),
    fs.readFileSync(figure(locale, 'data-location-disclosure-en.png')),
    fs.readFileSync(figure(locale, 'daily-proof-flow-en.png')),
    await sharp(Buffer.from(guiSvg(locale))).png().toBuffer(),
    fs.readFileSync(figure(locale, 'engineering-evidence-en.png')),
    fs.readFileSync(figure(locale, 'three-wave-roadmap-en.png')),
    fs.readFileSync(figure(locale, 'device-session-sequence-en.png')),
    fs.readFileSync(figure(locale, 'daily-attestation-key-sequence-en.png')),
  ];
  return generated;
}

async function build(locale, output) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${PRODUCT_NAME} — Wave 1`);
  pdf.setAuthor('BACCHIRI! contributors');
  pdf.setSubject(locale === 'ja' ? 'Wave 1 審査Deck' : 'Wave 1 judging deck');
  const pages = await pagePngs(locale);
  for (const png of pages) {
    const image = await pdf.embedPng(png);
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    page.drawImage(image, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
  }
  fs.writeFileSync(output, await pdf.save());
}

Promise.all([
  build('en', path.join(root, `docs/submission/deck/${PRODUCT_SLUG}-en.pdf`)),
  build('ja', path.join(root, `docs/ja/submission/deck/${PRODUCT_SLUG}-ja.pdf`)),
]).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
