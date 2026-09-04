const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { PDFDocument } = require('pdf-lib');
const {
  buildOnDemandArchitecture,
  pngPath,
} = require('./build-on-demand-zkp-architecture.cjs');

const root = path.resolve(__dirname, '../..');
const deckDir = path.join(root, 'docs/submission/deck');
const productSlug = 'bacchiri-verifiable-measurement-layer-wave1';
const pptxPath = path.join(deckDir, `${productSlug}-en.pptx`);
const pdfPath = path.join(deckDir, `${productSlug}-en.pdf`);
const targetSlide = 7;
const expectedSlideCount = 9;
const pageWidth = 960;
const pageHeight = 540;
const altText = 'Our engineering innovation: 24/7 admission with an on-demand server-side Sponsor Wallet that restores an encrypted checkpoint, waits for synchronization, adds only DUST to an already-authorized transaction, and stops gracefully. The standard-4 planning example compares USD 133.23 for 720 active hours with USD 22.20 for an illustrative 120-hour monthly drain, an estimated 83.3 percent reduction; other Cloudflare services and the Proof Server are excluded.';

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function slideXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:pic><p:nvPicPr><p:cNvPr id="2" name="On-demand Sponsor Wallet architecture" descr="${escapeXml(altText)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
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
  const mediaName = `ppt/media/image-${targetSlide}-1.png`;
  for (const required of [slideName, relationshipName, mediaName]) {
    if (!zip.file(required)) throw new Error(`Missing required PPTX member: ${required}`);
  }

  const relationships = await zip.file(relationshipName).async('string');
  if (!relationships.includes(`Target="../media/image-${targetSlide}-1.png"`)) {
    throw new Error(`Slide ${targetSlide} no longer uses the expected image relationship`);
  }

  zip.file(slideName, slideXml());
  zip.file(mediaName, fs.readFileSync(pngPath));

  const notesName = `ppt/notesSlides/notesSlide${targetSlide}.xml`;
  if (zip.file(notesName)) {
    const notes = await zip.file(notesName).async('string');
    zip.file(notesName, notes.replace('<a:t></a:t>', `<a:t>${escapeXml(altText)}</a:t>`));
  }

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
  output.setTitle('BACCHIRI!━━Verifiable Measurement Layer — Wave 1');
  output.setAuthor('BACCHIRI! contributors');
  output.setSubject('Wave 1 judging deck with on-demand Sponsor Wallet architecture');
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
  await buildOnDemandArchitecture();
  const pptx = await updatePptx();
  const pdf = await updatePdf();
  process.stdout.write(`PPTX ${pptx.bytes} bytes ${pptx.sha256}\n`);
  process.stdout.write(`PDF ${pdf.bytes} bytes ${pdf.sha256}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
