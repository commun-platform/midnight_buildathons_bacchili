// Development-host presentation renderer; never imported by deployed runtimes.
const fs = require('node:fs');
const path = require('node:path');
const PptxGenJS = require('pptxgenjs');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');

const root = path.resolve(__dirname, '../..');
const story = require('./gui-finalization-story.json');
const args = process.argv.slice(2);
const locale = args.shift();
function option(name, fallback) {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
}
const mode = option('--mode', 'preview');
const output = path.resolve(option('--output-dir', `.demo-output/gui-finalization/${locale}`));
const frameFile = option('--frames');
const frames = frameFile ? JSON.parse(fs.readFileSync(frameFile, 'utf8')) : {};
const C = { bg: '06111F', panel: '0D1B2B', line: '29415C', text: 'F5F7FB', muted: 'AAB7C8', cyan: '38D6E8', orange: 'F6821F', purple: 'A66CFF', green: '79D66A' };
const xml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const font = locale === 'ja' ? 'Noto Sans CJK JP' : 'DejaVu Sans';
const unit = (value) => value / 144;
const guiBox = { x: 72, y: 240, w: 1320, h: 640 };

function wrap(text, size, width) {
  // Conservative line widths preserve the same explicit breaks in SVG and PPTX.
  const lines = [];
  const measure = (value) => [...value].reduce((sum, char) => sum + (/[\u0000-\u007f]/u.test(char) ? (/[MW@%]/u.test(char) ? 0.9 : /[il.,' :!]/u.test(char) ? 0.3 : 0.59) : 1), 0) * size;
  for (const paragraph of text.split('\n')) {
    const tokens = locale === 'ja' ? [...paragraph] : paragraph.split(/(?<=\s)/u);
    let line = '';
    for (const token of tokens) {
      if (line && measure(line + token) > width && !/^[、。，．！？：；）」』】]/u.test(token)) { lines.push(line.trimEnd()); line = ''; }
      line += token;
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

async function main() {
  if (!story.locales[locale] || !['preview', 'final'].includes(mode)) throw new Error('Expected en|ja and --mode preview|final');
  fs.mkdirSync(output, { recursive: true });
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'BACCHIRI contributors';
  pptx.subject = 'Verifiable measurement: controlled GUI demonstration and field operation';
  pptx.title = `BACCHIRI — ${locale} — ${mode}`;
  pptx.lang = locale === 'ja' ? 'ja-JP' : 'en-US';
  pptx.theme = { headFontFace: font, bodyFontFace: font, lang: pptx.lang };
  const pdf = await PDFDocument.create();
  pdf.setTitle(pptx.title);
  pdf.setAuthor(pptx.author);
  const records = [];
  for (const [index, scene] of story.scenes.entries()) {
    const spec = scene[locale];
    const slide = pptx.addSlide();
    slide.background = { color: C.bg };
    const elements = [`<rect width="1920" height="1080" fill="#${C.bg}"/>`];
    function rect(x, y, w, h, fill, stroke = fill, radius = 0) {
      slide.addShape(radius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, {
        x: unit(x), y: unit(y), w: unit(w), h: unit(h),
        radius: unit(radius), rectRadius: unit(radius),
        fill: { color: fill }, line: { color: stroke, width: 0.5 },
      });
      elements.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="#${fill}" stroke="#${stroke}"/>`);
    }
    function text(value, x, y, w, size, color = C.text, bold = false, maxLines = 6) {
      const lines = wrap(value, size, w);
      if (lines.length > maxLines) throw new Error(`Text overflow in ${locale}/${scene.id}: ${value}`);
      const leading = size * 1.3;
      slide.addText(lines.join('\n'), {
        x: unit(x), y: unit(y), w: unit(w), h: unit(lines.length * leading + size * 0.25),
        fontFace: font, fontSize: size / 2, color, bold, margin: 0,
        breakLine: false, lineSpacingMultiple: 1.08, valign: 'top',
        paraSpaceAfterPt: 0, fit: 'resize',
      });
      for (const [lineIndex, line] of lines.entries()) {
        elements.push(`<text x="${x}" y="${y + size + lineIndex * leading}" font-family="${font}" font-size="${size}" font-weight="${bold ? 700 : 400}" fill="#${color}">${xml(line)}</text>`);
      }
      return lines.length * leading;
    }
    async function picture(file, box, alt) {
      const bytes = fs.readFileSync(file);
      const metadata = await sharp(bytes).metadata();
      const scale = Math.min(box.w / metadata.width, box.h / metadata.height);
      const w = metadata.width * scale;
      const h = metadata.height * scale;
      const x = box.x + (box.w - w) / 2;
      const y = box.y + (box.h - h) / 2;
      slide.addImage({ path: file, x: unit(x), y: unit(y), w: unit(w), h: unit(h), altText: alt });
      elements.push(`<image x="${x}" y="${y}" width="${w}" height="${h}" href="data:image/png;base64,${bytes.toString('base64')}"/>`);
    }
    rect(0, 0, 1920, 6, C.cyan);
    if (scene.kind === 'diagram') {
      text(spec.kicker, 72, 32, 1776, 22, C.cyan, true, 1);
      text(spec.title, 72, 78, 1776, 52, C.text, true, 1);
      await picture(path.join(root, spec.image), { x: 270, y: 166, w: 1380, h: 730 }, spec.title);
      text(spec.takeaway, 72, 903, 1776, 26, C.muted, false, 1);
    } else {
      text(spec.kicker, 72, 52, 1776, 24, C.cyan, true, 1);
      text(spec.title, 72, 108, 1776, scene.kind === 'gui' ? 58 : 72, C.text, true, 2);
      if (scene.kind === 'gui') {
        rect(guiBox.x, guiBox.y, guiBox.w, guiBox.h, C.panel, C.line, 12);
        if (frames[scene.id]) {
          await picture(frames[scene.id], guiBox, spec.title);
        } else {
          if (mode === 'final') throw new Error(`Missing final GUI still: ${scene.shot}`);
          text(scene.shot, 126, 300, 1150, 100, C.cyan, true, 1);
          text(story.locales[locale].pending, 126, 474, 1150, 52, C.text, true, 2);
          text(spec.takeaway, 126, 614, 1150, 32, C.muted, false, 3);
          text(locale === 'ja' ? '撮影枠です。実際の操作画面・処理結果ではありません。' : 'Shot placeholder. No recorded action or result is shown.', 126, 805, 1150, 23, C.orange, false, 2);
        }
        spec.cards.forEach(([heading, body], cardIndex) => {
          const y = 264 + cardIndex * 195;
          text(heading, 1450, y, 398, 32, [C.cyan, C.purple, C.green][cardIndex], true, 1);
          text(body, 1450, y + 54, 398, 29, C.text, false, 3);
        });
        text(scene.id === 'confirmed' ? spec.takeaway : story.locales[locale].captureLabel, 72, 893, 1776, 22, C.muted, false, 1);
      } else if (scene.id === 'problem') {
        // A conceptual reporting journey, not an invented product screenshot.
        spec.cards.forEach(([heading, body], cardIndex) => {
          const x = 72 + cardIndex * 616;
          const accent = [C.cyan, C.purple, C.green][cardIndex];
          rect(x, 354, 536, 390, C.panel, C.line, 14);
          text(String(cardIndex + 1).padStart(2, '0'), x + 28, 378, 130, 30, accent, true, 1);
          const headingHeight = text(heading, x + 28, 438, 480, 40, accent, true, 2);
          text(body, x + 28, 438 + headingHeight + 24, 480, 32, C.text, false, 4);
          if (cardIndex < 2) {
            const ax = x + 556;
            slide.addShape(pptx.ShapeType.chevron, {
              x: unit(ax), y: unit(525), w: unit(40), h: unit(42),
              fill: { color: C.cyan }, line: { color: C.cyan, transparency: 100 },
            });
            elements.push(`<polygon points="${ax},525 ${ax + 17},525 ${ax + 40},546 ${ax + 17},567 ${ax},567 ${ax + 23},546" fill="#${C.cyan}"/>`);
          }
        });
        text(spec.takeaway, 72, 786, 1776, 32, C.text, false, 2);
        text(locale === 'ja' ? '建設現場での活用イメージ・温度経路で概念検証' : 'Envisioned construction workflow · temperature proof of concept', 72, 897, 1776, 22, C.muted, false, 1);
      } else {
        spec.cards.forEach(([heading, body], cardIndex) => {
          const x = 72 + cardIndex * 604;
          const accent = [C.cyan, C.purple, C.green][cardIndex];
          rect(x, 386, 568, 375, C.panel, C.line, 14);
          rect(x + 30, 421, 54, 5, accent);
          const headingHeight = text(heading, x + 30, 458, 508, 42, accent, true, 2);
          text(body, x + 30, 458 + headingHeight + 24, 508, 34, C.text, false, 4);
        });
        text(spec.takeaway, 72, 812, 1776, 32, C.muted, false, 2);
      }
    }
    rect(72, 1030, 1776, 1, C.line);
    text(mode === 'preview' ? story.locales[locale].previewLabel : story.locales[locale].finalLabel, 72, 1040, 1450, 18, mode === 'preview' ? C.orange : C.muted, false, 1);
    text(`${String(index + 1).padStart(2, '0')} / ${story.scenes.length}`, 1710, 1040, 138, 18, C.muted, false, 1);
    slide.addNotes([
      spec.title, spec.narration,
      scene.shot ? `${scene.shot}: ${spec.takeaway}` : '',
      `Edition ${story.edition}; ${mode}. GUI uses controlled synthetic measurements; field operation diagrams describe the separate device path. 02:00 JST is a processing start, not a confirmation deadline.`,
    ].filter(Boolean));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${elements.join('')}</svg>`;
    const stem = `${String(index + 1).padStart(2, '0')}-${scene.id}`;
    fs.writeFileSync(path.join(output, `${stem}.svg`), svg);
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    fs.writeFileSync(path.join(output, `${stem}.png`), png);
    const embedded = await pdf.embedPng(png);
    pdf.addPage([960, 540]).drawImage(embedded, { x: 0, y: 0, width: 960, height: 540 });
    let videoImage = `${stem}.png`;
    let videoGuiBox = null;
    if (scene.kind === 'gui') {
      // Video gives the recording the full width; deck side notes remain editable.
      videoImage = `${stem}-video.png`;
      videoGuiBox = { x: 0, y: 0, w: 1920, h: 900 };
      const videoElements = [`<rect width="1920" height="1080" fill="#${C.bg}"/>`];
      if (frames[scene.id]) {
        const bytes = fs.readFileSync(frames[scene.id]);
        videoElements.push(`<image x="0" y="0" width="1920" height="900" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${bytes.toString('base64')}"/>`);
      } else {
        videoElements.push(`<rect x="72" y="72" width="1776" height="790" rx="14" fill="#${C.panel}" stroke="#${C.line}"/>`);
        const blocks = [[scene.shot, 128, 115, 104, C.cyan], [story.locales[locale].pending, 128, 330, 62, C.text], [spec.title, 128, 460, 44, C.text], [spec.takeaway, 128, 640, 32, C.muted]];
        for (const [value, x, y, size, color] of blocks) {
          wrap(value, size, 1600).forEach((line, lineIndex) => videoElements.push(`<text x="${x}" y="${y + size + lineIndex * size * 1.3}" font-family="${font}" font-size="${size}" fill="#${color}">${xml(line)}</text>`));
        }
        const label = locale === 'ja' ? '撮影枠です。実際の操作画面・処理結果ではありません。' : 'Shot placeholder. No recorded action or result is shown.';
        videoElements.push(`<text x="128" y="825" font-family="${font}" font-size="24" fill="#${C.orange}">${xml(label)}</text>`);
      }
      const context = scene.id === 'confirmed' ? spec.takeaway : story.locales[locale].captureLabel;
      const status = mode === 'preview' ? story.locales[locale].previewLabel : story.locales[locale].finalLabel;
      videoElements.push(`<text x="72" y="927" font-family="${font}" font-size="20" fill="#${C.muted}">${xml(context)}</text>`);
      videoElements.push(`<text x="72" y="1060" font-family="${font}" font-size="18" fill="#${mode === 'preview' ? C.orange : C.muted}">${xml(status)}</text>`);
      await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${videoElements.join('')}</svg>`)).png().toFile(path.join(output, videoImage));
    }
    records.push({ id: scene.id, shot: scene.shot || null, image: `${stem}.png`, videoImage, guiBox: scene.kind === 'gui' ? guiBox : null, videoGuiBox });
  }
  const name = `bacchiri-new-gui-${locale}-${mode}`;
  await pptx.writeFile({ fileName: path.join(output, `${name}.pptx`) });
  fs.writeFileSync(path.join(output, `${name}.pdf`), await pdf.save());
  fs.writeFileSync(path.join(output, 'slides.json'), JSON.stringify(records, null, 2) + '\n');
  const tiles = await Promise.all(records.map(async (record, index) => ({
    input: await sharp(path.join(output, record.image)).resize(480, 270).png().toBuffer(),
    left: (index % 3) * 480, top: Math.floor(index / 3) * 270,
  })));
  await sharp({ create: { width: 1440, height: Math.ceil(records.length / 3) * 270, channels: 3, background: '#06111f' } })
    .composite(tiles).png().toFile(path.join(output, 'contact-sheet.png'));
  process.stdout.write(JSON.stringify({ locale, mode, slides: records.length, output: path.relative(root, output) }) + '\n');
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
