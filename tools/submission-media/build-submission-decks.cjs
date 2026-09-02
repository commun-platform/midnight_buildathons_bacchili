const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');

const root = path.resolve(__dirname, '../..');
const outEn = path.join(root, 'docs/submission/deck');
const outJa = path.join(root, 'docs/ja/submission/deck');
fs.mkdirSync(outEn, { recursive: true });
fs.mkdirSync(outJa, { recursive: true });

const C = {
  bg: '06111F',
  panel: '0D1B2B',
  panel2: '111F33',
  white: 'F5F7FB',
  muted: 'AAB7C8',
  cyan: '38D6E8',
  purple: 'A66CFF',
  green: '79D66A',
  amber: 'F4B740',
  red: 'F0645A',
  line: '29415C',
};

const W = 13.333;
const H = 7.5;
const PRODUCT_NAME = 'BACCHIRI!━━Verifiable Measurement Layer';
const PRODUCT_SLUG = 'bacchiri-verifiable-measurement-layer-wave1';

function imagePath(locale, name) {
  return locale === 'ja'
    ? path.join(root, 'docs/ja/assets/review', name.replace('-en.png', '-ja.png'))
    : path.join(root, 'docs/assets/review', name);
}

function baseDeck(locale) {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'BACCHIRI! contributors';
  pptx.company = 'Midnight Buildathon Wave 1';
  pptx.subject = PRODUCT_NAME;
  pptx.title = `${PRODUCT_NAME} — Wave 1`;
  pptx.lang = locale === 'ja' ? 'ja-JP' : 'en-US';
  pptx.theme = {
    headFontFace: locale === 'ja' ? 'Yu Gothic' : 'Aptos Display',
    bodyFontFace: locale === 'ja' ? 'Yu Gothic' : 'Aptos',
    lang: locale === 'ja' ? 'ja-JP' : 'en-US',
  };
  pptx.defineSlideMaster({
    title: 'MASTER',
    background: { color: C.bg },
    objects: [
      { rect: { x: 0, y: 0, w: W, h: 0.06, fill: { color: C.purple }, line: { color: C.purple } } },
      { line: { x: 0.45, y: 7.13, w: 12.43, h: 0, line: { color: C.line, width: 0.8 } } },
      { text: { text: locale === 'ja' ? 'MIDNIGHT BUILDATHON・WAVE 1' : 'MIDNIGHT BUILDATHON · WAVE 1', options: { x: 0.5, y: 7.17, w: 4.2, h: 0.18, fontFace: locale === 'ja' ? 'Yu Gothic' : 'Aptos', fontSize: 6.8, color: C.muted, charSpacing: 1.2, margin: 0 } } },
      { text: { text: PRODUCT_NAME, options: { x: 7.2, y: 7.17, w: 5.6, h: 0.18, fontFace: locale === 'ja' ? 'Yu Gothic' : 'Aptos', fontSize: 6.2, color: C.muted, align: 'right', charSpacing: 0.4, margin: 0, fit: 'shrink' } } },
    ],
    slideNumber: { x: 12.82, y: 7.16, w: 0.2, h: 0.18, color: C.muted, fontFace: 'Aptos', fontSize: 6.8, margin: 0, align: 'right' },
  });
  return pptx;
}

function addTitle(slide, kicker, title, subtitle, locale) {
  slide.addText(kicker, {
    x: 0.6, y: 0.42, w: 4.6, h: 0.24,
    fontFace: 'Aptos', fontSize: 8.5, bold: true, color: C.cyan,
    charSpacing: 1.6, margin: 0,
  });
  slide.addText(title, {
    x: 0.6, y: 0.78, w: 12.1, h: 0.75,
    fontFace: locale === 'ja' ? 'Yu Gothic' : 'Aptos Display',
    fontSize: locale === 'ja' ? 29 : 32, bold: true, color: C.white,
    margin: 0, breakLine: false, fit: 'shrink',
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.62, y: 1.58, w: 11.8, h: 0.48,
      fontFace: locale === 'ja' ? 'Yu Gothic' : 'Aptos',
      fontSize: locale === 'ja' ? 13 : 14, color: C.muted,
      margin: 0, fit: 'shrink',
    });
  }
}

function addPanel(slide, x, y, w, h, lineColor = C.line) {
  slide.addShape('roundRect', {
    x, y, w, h,
    rectRadius: 0.06,
    fill: { color: C.panel, transparency: 4 },
    line: { color: lineColor, width: 1.2 },
  });
}

function addMetric(slide, x, y, w, value, label, accent, locale) {
  addPanel(slide, x, y, w, 0.9, accent);
  slide.addText(value, {
    x: x + 0.15, y: y + 0.12, w: w - 0.3, h: 0.34,
    fontFace: 'Aptos Display', fontSize: 20, bold: true, color: accent,
    margin: 0, align: 'center',
  });
  slide.addText(label, {
    x: x + 0.12, y: y + 0.53, w: w - 0.24, h: 0.18,
    fontFace: locale === 'ja' ? 'Yu Gothic' : 'Aptos',
    fontSize: 7.5, color: C.muted, bold: true, margin: 0, align: 'center',
    fit: 'shrink',
  });
}

function addImageSlide(pptx, locale, name, altTitle, note) {
  const slide = pptx.addSlide('MASTER');
  slide.background = { color: C.bg };
  slide.addImage({ path: imagePath(locale, name), x: 0.23, y: 0.16, w: 12.87, h: 7.0 });
  if (note) {
    slide.addShape('roundRect', {
      x: 8.2, y: 6.52, w: 4.55, h: 0.38,
      fill: { color: C.bg, transparency: 8 },
      line: { color: C.amber, width: 0.8 },
    });
    slide.addText(note, {
      x: 8.36, y: 6.62, w: 4.2, h: 0.13,
      fontFace: locale === 'ja' ? 'Yu Gothic' : 'Aptos',
      fontSize: 6.8, color: C.amber, bold: true, margin: 0, align: 'center',
    });
  }
  slide.addNotes(altTitle ? [altTitle] : []);
  return slide;
}

function addCover(pptx, locale) {
  const ja = locale === 'ja';
  const slide = pptx.addSlide('MASTER');
  slide.background = { color: C.bg };
  slide.addText(PRODUCT_NAME, {
    x: 0.65, y: 0.55, w: 10.8, h: 0.3,
    fontFace: ja ? 'Yu Gothic' : 'Aptos', fontSize: 10, bold: true, color: C.cyan,
    charSpacing: 0.7, margin: 0, fit: 'shrink',
  });
  slide.addText(ja ? 'センサー値を開示せず、\n24時間の判定を示す' : 'Show all 24 hourly results.\nKeep sensor values private.', {
    x: 0.65, y: 1.03, w: 11.8, h: 1.55,
    fontFace: ja ? 'Yu Gothic' : 'Aptos Display',
    fontSize: ja ? 28 : 34, bold: true, color: C.white,
    margin: 0, breakLine: false, fit: 'shrink',
  });
  slide.addText(ja
    ? '第三者はUTC計測日・24時間の判定・適用しきい値・証明対象を確認。実値は見えない。'
    : 'A third party checks the UTC day, 24 hourly results, applied threshold, and proof subject. Values stay hidden.', {
      x: 0.68, y: 2.82, w: 11.7, h: 0.52,
      fontFace: ja ? 'Yu Gothic' : 'Aptos',
      fontSize: ja ? 13 : 15, color: C.muted, margin: 0, fit: 'shrink',
    });

  const values = ja
    ? [
      ['センサー値', 'エッジデバイス内だけ', C.cyan],
      ['第三者が確認', 'UTC日・24時間判定・しきい値', C.purple],
      ['Wave 1', 'Midnight事前公開環境で確認済み', C.green],
    ]
    : [
      ['SENSOR VALUES', 'STAY ON EDGE DEVICE', C.cyan],
      ['THIRD PARTY CHECKS', 'UTC DAY · 24 RESULTS · POLICY', C.purple],
      ['WAVE 1', 'MIDNIGHT PREPRODUCTION\nNETWORK VERIFIED', C.green],
    ];
  values.forEach(([head, sub, accent], i) => {
    const x = 0.68 + i * 4.05;
    addPanel(slide, x, 3.72, 3.58, 1.72, accent);
    slide.addText(head, { x: x + 0.18, y: 4.08, w: 3.22, h: 0.28, fontFace: ja ? 'Yu Gothic' : 'Aptos', fontSize: 13, bold: true, color: accent, align: 'center', margin: 0, fit: 'shrink' });
    slide.addText(sub, { x: x + 0.18, y: 4.66, w: 3.22, h: 0.3, fontFace: ja ? 'Yu Gothic' : 'Aptos', fontSize: 11, color: C.white, bold: true, align: 'center', margin: 0, fit: 'shrink' });
  });

  slide.addText(ja
    ? 'Wave 1・ソース検証 2026-08-29 JST・Midnight事前公開記録 2026-08-28 JST'
    : 'Wave 1 · Source validated 2026-08-29 JST · Midnight record 2026-08-28 JST', {
      x: 0.72, y: 6.28, w: 11.7, h: 0.28,
      fontFace: ja ? 'Yu Gothic' : 'Aptos', fontSize: 9, color: C.muted,
      margin: 0, align: 'center',
    });
}

function addGuiSlide(pptx, locale) {
  const ja = locale === 'ja';
  const slide = pptx.addSlide('MASTER');
  addTitle(
    slide,
    ja ? '08・稼働画面' : '08 · WORKING PRODUCT',
    ja ? '最終画面で、操作から公開検証まで見せる' : 'Show the final GUI from action to public verification',
    ja
      ? '録画は画面完成後に実施。現時点では撮影枠と確認項目を固定する。'
      : 'Capture follows the completed GUI; the required review evidence is fixed now.',
    locale,
  );

  slide.addShape('roundRect', {
    x: 0.7, y: 2.22, w: 7.55, h: 4.35,
    fill: { color: C.panel2 },
    line: { color: C.cyan, width: 1.6, dash: 'dash' },
  });
  slide.addText(ja ? '最終画面キャプチャ' : 'FINAL IMPLEMENTED GUI CAPTURE', {
    x: 1.02, y: 3.38, w: 6.9, h: 0.36,
    fontFace: 'Aptos Display', fontSize: 19, bold: true, color: C.cyan,
    align: 'center', margin: 0,
  });
  slide.addText(ja
    ? '画面確定後に差し替え\nデバイス操作・証明依頼・取引確定・第三者検証'
    : 'Insert after the GUI freeze\nDevice operation · Proof request · Midnight transaction · Third-party review', {
      x: 1.1, y: 4.0, w: 6.75, h: 0.72,
      fontFace: ja ? 'Yu Gothic' : 'Aptos', fontSize: ja ? 12 : 13,
      color: C.muted, align: 'center', margin: 0, breakLine: false, fit: 'shrink',
    });
  slide.addText(ja ? '動画制作は最後に実施' : 'VIDEO PRODUCTION IS LAST', {
    x: 2.42, y: 5.18, w: 4.5, h: 0.36,
    fontFace: ja ? 'Yu Gothic' : 'Aptos', fontSize: 11, bold: true,
    color: C.amber, align: 'center', margin: 0,
  });

  addPanel(slide, 8.58, 2.22, 4.05, 4.35, C.purple);
  slide.addText(ja ? '確認する4点' : 'FOUR THINGS THE CAPTURE MUST PROVE', {
    x: 8.85, y: 2.55, w: 3.5, h: 0.38,
    fontFace: ja ? 'Yu Gothic' : 'Aptos', fontSize: ja ? 13 : 11.5,
    bold: true, color: C.white, margin: 0, align: 'center', fit: 'shrink',
  });
  const points = ja
    ? [
      ['01', 'デバイスとしきい値の紐付け'],
      ['02', '24時間ごとの判定を公開'],
      ['03', 'デバイスが署名したMidnight取引'],
      ['04', '最小値・最大値を見せない第三者画面'],
    ]
    : [
      ['01', 'Device-to-threshold binding'],
      ['02', 'Publish one proved result per UTC hour'],
      ['03', 'Device-signed Midnight transaction'],
      ['04', 'Public view hides MIN / MAX values'],
    ];
  points.forEach(([n, label], i) => {
    const y = 3.18 + i * 0.72;
    slide.addShape('ellipse', { x: 8.92, y, w: 0.42, h: 0.42, fill: { color: C.purple }, line: { color: C.purple } });
    slide.addText(n, { x: 8.98, y: y + 0.12, w: 0.3, h: 0.1, fontFace: 'Aptos', fontSize: 6.2, bold: true, color: C.white, align: 'center', margin: 0 });
    slide.addText(label, { x: 9.55, y: y + 0.06, w: 2.7, h: 0.28, fontFace: ja ? 'Yu Gothic' : 'Aptos', fontSize: 10, color: C.white, margin: 0, fit: 'shrink' });
  });
  slide.addText(ja ? '画面テスト：26件すべて成功' : 'Dashboard tests: 26 / 26 PASS', {
    x: 8.95, y: 6.08, w: 3.35, h: 0.22,
    fontFace: ja ? 'Yu Gothic' : 'Aptos', fontSize: 8.5,
    color: C.green, bold: true, align: 'center', margin: 0,
  });
}

async function build(locale, output) {
  const pptx = baseDeck(locale);
  const ja = locale === 'ja';
  addCover(pptx, locale);
  addImageSlide(pptx, locale, 'privacy-value-proposition-en.png',
    ja ? '課題と価値提案' : 'Problem and value proposition');
  addImageSlide(pptx, locale, 'hourly-extrema-zkp-en.png',
    ja ? '単位時間MIN / MAXからZK Resultを作る仕様' : 'From unit-time MIN / MAX to the ZK result');
  addImageSlide(pptx, locale, 'zk-claim-boundary-en.png',
    ja ? '正確な証明内容と証明しない内容' : 'Exact claim and non-claims');
  addImageSlide(pptx, locale, 'wave1-system-overview-en.png',
    ja ? '4領域の責任分担' : 'Four-domain architecture');
  addImageSlide(pptx, locale, 'data-location-disclosure-en.png',
    ja ? 'データ保存先と公開範囲' : 'Private and public data boundary');
  addImageSlide(pptx, locale, 'daily-proof-flow-en.png',
    ja ? '日次証明の流れ' : 'Daily proof flow');
  addGuiSlide(pptx, locale);
  addImageSlide(pptx, locale, 'engineering-evidence-en.png',
    ja ? '技術的な実証結果' : 'Engineering evidence');
  addImageSlide(
    pptx,
    locale,
    'three-wave-roadmap-en.png',
    ja ? '3段階の展開計画' : 'Three-wave roadmap',
    ja ? 'Wave 2・3は計画であり現行機能ではない' : 'WAVES 2 AND 3 ARE PLANNED, NOT CURRENT',
  );
  addImageSlide(pptx, locale, 'device-session-sequence-en.png',
    ja ? '付録A・デバイス認証からAPIセッション発行' : 'Appendix A · Device Identity to API Session');
  addImageSlide(pptx, locale, 'daily-attestation-key-sequence-en.png',
    ja ? '付録B・非公開センサー値から公開判定まで' : 'Appendix B · Daily attestation credential sequence');
  await pptx.writeFile({ fileName: output });
}

Promise.all([
  build('en', path.join(outEn, `${PRODUCT_SLUG}-en.pptx`)),
  build('ja', path.join(outJa, `${PRODUCT_SLUG}-ja.pptx`)),
]).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
