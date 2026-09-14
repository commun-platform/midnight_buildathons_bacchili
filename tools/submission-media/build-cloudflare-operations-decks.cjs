// Add the reviewed imagegen figures while retaining every original slide part.
// Dependencies: jszip@3.10.1 and pdf-lib@1.17.1 (development-host tooling only).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const JSZip = require('jszip');
const { PDFDocument } = require('pdf-lib');

const root = path.resolve(__dirname, '../..');
const content = require('./cloudflare-operations-content.json');
const relBase = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const namespaces = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const treeStart = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const xml = (text) => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const relationships = (items) => `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(([id, type, target]) => `<Relationship Id="${id}" Type="${relBase}/${type}" Target="${target}"/>`).join('')}</Relationships>`;

function slideXml(scene, width, height, imageBytes) {
  // Contain the original raster instead of stretching or cropping it.
  const imageWidth = imageBytes.readUInt32BE(16);
  const imageHeight = imageBytes.readUInt32BE(20);
  const factor = Math.min(width / imageWidth, height / imageHeight);
  const w = Math.round(imageWidth * factor);
  const h = Math.round(imageHeight * factor);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ${namespaces}><p:cSld name="${xml(scene.title)}"><p:bg><p:bgPr><a:solidFill><a:srgbClr val="06111F"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${treeStart}<p:pic><p:nvPicPr><p:cNvPr id="2" name="${xml(scene.title)}" descr="${xml(scene.notes)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${Math.round((width - w) / 2)}" y="${Math.round((height - h) / 2)}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function notesXml(scene, locale) {
  const paragraphs = [scene.title, scene.narration, scene.notes];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:notes ${namespaces}><p:cSld><p:spTree>${treeStart}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Speaker notes"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs.map((text) => `<a:p><a:r><a:rPr lang="${locale === 'ja' ? 'ja-JP' : 'en-US'}"/><a:t>${xml(text)}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;
}

async function build(locale) {
  const spec = content[locale];
  const sourcePptx = path.join(root, `${spec.sourceDeck}.pptx`);
  const sourcePdf = path.join(root, `${spec.sourceDeck}.pdf`);
  const outputStem = path.join(root, `${spec.sourceDeck}-cloudflare-operations`);
  const original = fs.readFileSync(sourcePptx);
  const zip = await JSZip.loadAsync(original);
  const slideFiles = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  if (slideFiles.length !== spec.expectedSlides) throw new Error(`Unexpected baseline slide count: ${locale}`);
  let presentation = await zip.file('ppt/presentation.xml').async('string');
  let rels = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
  let types = await zip.file('[Content_Types].xml').async('string');
  const sizeTag = presentation.match(/<p:sldSz\b[^>]*\/>/)[0];
  const width = Number(sizeTag.match(/cx="(\d+)"/)[1]);
  const height = Number(sizeTag.match(/cy="(\d+)"/)[1]);
  const idList = presentation.match(/<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/)[1];
  const ids = [...idList.matchAll(/<p:sldId\b[^>]*\/>/g)].map((match) => match[0]);
  if (ids.length !== spec.expectedSlides) throw new Error('Slide relationship count mismatch');
  let nextSlide = Math.max(...slideFiles.map((file) => Number(file.match(/slide(\d+)/)[1]))) + 1;
  let nextNote = Math.max(0, ...Object.keys(zip.files).filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name)).map((name) => Number(name.match(/notesSlide(\d+)/)[1]))) + 1;
  let nextId = Math.max(...ids.map((tag) => Number(tag.match(/\bid="(\d+)"/)[1]))) + 1;
  let nextRel = Math.max(...[...rels.matchAll(/Id="rId(\d+)"/g)].map((match) => Number(match[1]))) + 1;
  const newIds = [];
  for (const scene of spec.scenes) {
    const slide = nextSlide++;
    const note = nextNote++;
    const relationshipId = `rId${nextRel++}`;
    const imageName = `${content.edition}-${scene.id}-${locale}.png`;
    const image = fs.readFileSync(path.join(root, scene.image));
    if (image.subarray(1, 4).toString() !== 'PNG') throw new Error('Expected original PNG imagegen asset');
    zip.file(`ppt/media/${imageName}`, image);
    zip.file(`ppt/slides/slide${slide}.xml`, slideXml(scene, width, height, image));
    zip.file(`ppt/slides/_rels/slide${slide}.xml.rels`, relationships([
      ['rId1', 'image', `../media/${imageName}`],
      ['rId2', 'slideLayout', '../slideLayouts/slideLayout1.xml'],
      ['rId3', 'notesSlide', `../notesSlides/notesSlide${note}.xml`],
    ]));
    zip.file(`ppt/notesSlides/notesSlide${note}.xml`, notesXml(scene, locale));
    zip.file(`ppt/notesSlides/_rels/notesSlide${note}.xml.rels`, relationships([
      ['rId1', 'notesMaster', '../notesMasters/notesMaster1.xml'],
      ['rId2', 'slide', `../slides/slide${slide}.xml`],
    ]));
    rels = rels.replace('</Relationships>', `<Relationship Id="${relationshipId}" Type="${relBase}/slide" Target="slides/slide${slide}.xml"/></Relationships>`);
    types = types.replace('</Types>', `<Override PartName="/ppt/slides/slide${slide}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/notesSlides/notesSlide${note}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/></Types>`);
    newIds.push(`<p:sldId id="${nextId++}" r:id="${relationshipId}"/>`);
  }
  ids.splice(spec.insertAfterSlide, 0, ...newIds);
  presentation = presentation.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, `<p:sldIdLst>${ids.join('')}</p:sldIdLst>`);
  zip.file('ppt/presentation.xml', presentation);
  zip.file('ppt/_rels/presentation.xml.rels', rels);
  zip.file('[Content_Types].xml', types);
  if (zip.file('docProps/app.xml')) {
    const app = await zip.file('docProps/app.xml').async('string');
    zip.file('docProps/app.xml', app.replace(/<Slides>\d+<\/Slides>/, `<Slides>${ids.length}</Slides>`).replace(/<Notes>\d+<\/Notes>/, `<Notes>${ids.length}</Notes>`));
  }
  const pptx = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(`${outputStem}.pptx`, pptx);
  // Assert byte-for-byte preservation of every baseline slide, note, and image.
  const baselineZip = await JSZip.loadAsync(original);
  for (const name of Object.keys(baselineZip.files).filter((name) => /^ppt\/(slides|notesSlides|media)\//.test(name) && !baselineZip.files[name].dir)) {
    if (!(await baselineZip.file(name).async('nodebuffer')).equals(await zip.file(name).async('nodebuffer'))) throw new Error(`Baseline part changed: ${name}`);
  }

  const pdfSource = await PDFDocument.load(fs.readFileSync(sourcePdf));
  if (pdfSource.getPageCount() !== spec.expectedSlides) throw new Error('Baseline PDF page count mismatch');
  const pdf = await PDFDocument.create();
  pdf.setTitle(spec.title);
  pdf.setAuthor('BACCHIRI contributors');
  pdf.setSubject('Existing pitch with September 2026 Cloudflare field operation diagrams');
  const pages = await pdf.copyPages(pdfSource, pdfSource.getPageIndices());
  for (let index = 0; index < pages.length; index++) {
    pdf.addPage(pages[index]);
    if (index + 1 !== spec.insertAfterSlide) continue;
    const { width: pageWidth, height: pageHeight } = pages[index].getSize();
    for (const scene of spec.scenes) {
      const image = await pdf.embedPng(fs.readFileSync(path.join(root, scene.image)));
      const dimensions = image.scaleToFit(pageWidth, pageHeight);
      pdf.addPage([pageWidth, pageHeight]).drawImage(image, {
        x: (pageWidth - dimensions.width) / 2,
        y: (pageHeight - dimensions.height) / 2,
        ...dimensions,
      });
    }
  }
  const pdfBytes = Buffer.from(await pdf.save());
  fs.writeFileSync(`${outputStem}.pdf`, pdfBytes);
  const result = { locale, slides: ids.length, insertedAfter: spec.insertAfterSlide, originalPartsPreserved: true, pptx: { path: path.relative(root, `${outputStem}.pptx`), sha256: hash(pptx) }, pdf: { path: path.relative(root, `${outputStem}.pdf`), sha256: hash(pdfBytes) } };
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

(async () => {
  const locales = process.argv.slice(2);
  for (const locale of locales.length ? locales : ['en', 'ja']) {
    if (!['en', 'ja'].includes(locale)) throw new Error('Use en and/or ja');
    await build(locale);
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
