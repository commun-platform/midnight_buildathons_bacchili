const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { PDFDocument } = require('pdf-lib');
const {
  buildJapaneseArchitecture,
  pngPath,
} = require('./build-on-demand-zkp-architecture-ja.cjs');

const root = path.resolve(__dirname, '../..');
const deckDir = path.join(root, 'docs/ja/submission/deck');
const productSlug = 'bacchiri-verifiable-measurement-layer-wave1';
const pptxPath = path.join(deckDir, `${productSlug}-ja.pptx`);
const pdfPath = path.join(deckDir, `${productSlug}-ja.pdf`);
const targetSlide = 8;
const expectedSlideCount = 12;
const pageWidth = 960;
const pageHeight = 540;
const mediaName = `ppt/media/image-${targetSlide}-architecture-ja.png`;
const altText = '私たちの工夫。24時間の受付を維持しながら、対象Jobがある時だけServer側Sponsor Walletを起動する。暗号化Checkpointを復元し、同期完了後に認可済みTransactionへDUSTだけを追加して送信し、安全に停止する。Device Authorityと非公開RAW値はSponsorへ渡さない。standard-4の計画用概算は720時間のUSD 133.23に対し、月120時間の処理例でUSD 22.20、83.3%削減。Workers、D1、Queue、R2、Egress、Proof Serverは概算外。';

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function slideXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:pic><p:nvPicPr><p:cNvPr id="2" name="オンデマンドSponsor Wallet構成" descr="${escapeXml(altText)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function slideRelationships() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image-${targetSlide}-architecture-ja.png"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${targetSlide}.xml"/></Relationships>`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function updatePptx() {
  const source = fs.readFileSync(pptxPath);
  const zip = await JSZip.loadAsync(source);
  const slideEntries = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  if (slideEntries.length !== expectedSlideCount) {
    throw new Error(`Expected ${expectedSlideCount} slides in ${pptxPath}, found ${slideEntries.length}`);
  }

  const slideName = `ppt/slides/slide${targetSlide}.xml`;
  const relationshipName = `ppt/slides/_rels/slide${targetSlide}.xml.rels`;
  const notesName = `ppt/notesSlides/notesSlide${targetSlide}.xml`;
  for (const required of [slideName, relationshipName, notesName]) {
    if (!zip.file(required)) throw new Error(`Missing required PPTX member: ${required}`);
  }

  const relationships = await zip.file(relationshipName).async('string');
  if (!relationships.includes('../slideLayouts/slideLayout2.xml')) {
    throw new Error(`Slide ${targetSlide} no longer uses the expected Japanese reference layout`);
  }

  zip.file(slideName, slideXml());
  zip.file(relationshipName, slideRelationships());
  zip.file(mediaName, fs.readFileSync(pngPath));
  const notes = await zip.file(notesName).async('string');
  zip.file(notesName, notes.replace('<a:t></a:t>', `<a:t>${escapeXml(altText)}</a:t>`));

  const output = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
  const temporary = `${pptxPath}.tmp`;
  fs.writeFileSync(temporary, output);
  fs.renameSync(temporary, pptxPath);
  return { bytes: output.length, sha256: sha256(output) };
}

async function updatePdf() {
  const source = await PDFDocument.load(fs.readFileSync(pdfPath));
  if (source.getPageCount() !== expectedSlideCount) {
    throw new Error(`Expected ${expectedSlideCount} pages in ${pdfPath}, found ${source.getPageCount()}`);
  }

  const output = await PDFDocument.create();
  output.setTitle('BACCHIRI!━━Verifiable Measurement Layer — Wave 1 日本語Technical Reference');
  output.setAuthor('BACCHIRI! contributors');
  output.setSubject('オンデマンドSponsor Wallet構成を含むWave 1日本語Technical Reference');
  const before = await output.copyPages(source, Array.from({ length: targetSlide - 1 }, (_, index) => index));
  before.forEach((page) => output.addPage(page));
  const architecture = await output.embedPng(fs.readFileSync(pngPath));
  output.addPage([pageWidth, pageHeight]).drawImage(architecture, {
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight,
  });
  const afterIndexes = Array.from(
    { length: expectedSlideCount - targetSlide },
    (_, index) => targetSlide + index,
  );
  const after = await output.copyPages(source, afterIndexes);
  after.forEach((page) => output.addPage(page));
  const bytes = Buffer.from(await output.save());
  const temporary = `${pdfPath}.tmp`;
  fs.writeFileSync(temporary, bytes);
  fs.renameSync(temporary, pdfPath);
  return { bytes: bytes.length, sha256: sha256(bytes) };
}

async function main() {
  await buildJapaneseArchitecture();
  const pptx = await updatePptx();
  const pdf = await updatePdf();
  process.stdout.write(`PPTX ${pptx.bytes} bytes ${pptx.sha256}\n`);
  process.stdout.write(`PDF ${pdf.bytes} bytes ${pdf.sha256}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
