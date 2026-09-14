// A movie-matched review deck: captured composition images, editable speaker
// notes, and the complete movie embedded on the last slide.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const PptxGenJS = require('pptxgenjs');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const sharp = require('sharp');

const root = path.resolve(__dirname, '../..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const source = path.resolve(option('--source-dir', path.join(root, '.demo-output/local-demo-english-final-20260912')));
const output = path.resolve(option('--output-dir', path.join(source, 'slides')));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const rel = (file) => path.relative(root, file);

async function main() {
  const editFile = path.join(source, 'edit-manifest.json');
  const captureFile = path.join(source, 'capture-evidence.json');
  const edit = read(editFile), capture = read(captureFile);
  const storyFile = path.join(__dirname, 'local-demo-english.json');
  const endingFile = path.join(__dirname, 'local-demo-ending.json');
  if (edit.language !== 'en' || capture.language !== 'en' || edit.sourceStorySha256 !== sha256(storyFile)) throw new Error('A matching English story and recording are required');
  if (edit.network !== 'LOCAL SIMULATION' || edit.realProofGenerated !== false || edit.chainTransactionSubmitted !== false) throw new Error('This renderer accepts the explicit filming edition');
  if (!capture.completedAt || capture.failure || capture.validateOnly !== false || !capture.checks?.length || capture.checks.some((item) => item.passed !== true)) throw new Error('All recording checks must pass');
  if (['blockedRequests', 'pageErrors', 'consoleErrors'].some((key) => !Array.isArray(capture[key]) || capture[key].length)) throw new Error('Browser errors must be resolved');
  if (capture.server?.backend !== false || capture.server?.wallet !== false || edit.captureSha256 !== sha256(captureFile)) throw new Error('Capture provenance differs');
  for (const scene of capture.scenes) {
    if (sha256(path.join(source, scene.file)) !== scene.sha256 || sha256(path.join(source, scene.screenshot)) !== scene.screenshotSha256) throw new Error(`Capture hash differs: ${scene.name}`);
  }
  if (!edit.validation?.fullDecode || !edit.validation?.captionTextMatchesNarration || edit.validation?.placeholderCount !== 0) throw new Error('A validated completed movie is required');
  if (edit.ending?.sha256 !== sha256(endingFile) || edit.ending?.narration !== read(endingFile).en.narration) throw new Error('Closing copy differs');
  const video = path.join(source, edit.video);
  if (sha256(video) !== edit.videoSha256) throw new Error('Movie hash differs');
  const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', video]));
  if (!info.streams.some((s) => s.codec_type === 'video' && s.codec_name === 'h264' && s.width === 1920 && s.height === 1080)) throw new Error('A 1080p H.264 movie is required');
  fs.mkdirSync(output, { recursive: true });
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'BACCHIRI', width: 13.333333, height: 7.5 });
  pptx.layout = 'BACCHIRI';
  pptx.author = 'Bacchiri';
  pptx.subject = 'English demo: Wallet workflow and verifiable measurement';
  pptx.title = 'Bacchiri — Share the proof. Keep the measurements private.';
  pptx.lang = 'en-US';
  const pdf = await PDFDocument.create();
  pdf.setTitle(pptx.title);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const images = [];
  // Times are local to each scene, reviewed against the English narration and capture.
  const moments = { value: 9, problem: 15.7, scope: 17, device: 19.6, day: 16.3, request: 8.3, confirmed: 7.4,
    verify: 16.8, scenarios: 20, managed: 14.8, operations: 15.4, architecture: 15.7, wallet: 16.3, boundary: 16.5, roadmap: 18.5 };
  for (const [index, scene] of edit.scenes.entries()) {
    const within = scene.id === 'closing' ? scene.duration - 1 : Math.min(moments[scene.id], scene.duration - .6);
    if (!Number.isFinite(within)) throw new Error(`No reviewed poster time for ${scene.id}`);
    const time = scene.start + within;
    const filename = `${String(index + 1).padStart(2, '0')}-${scene.id}.png`;
    const image = path.join(output, filename);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(time), '-i', video, '-frames:v', '1', image]);
    const slide = pptx.addSlide();
    slide.background = { color: '0B1220' };
    slide.addImage({ path: image, x: 0, y: 0, w: 13.333333, h: 7.5, altText: `Bacchiri — ${scene.id}` });
    slide.addNotes([scene.narration, `Movie frame at ${time.toFixed(3)} seconds. ${edit.edition}.`,
      'The slide image matches the rendered movie. Its visual elements are flattened; speaker notes remain editable. All GUI proof and transaction results are filming simulations.']);
    const png = await pdf.embedPng(fs.readFileSync(image));
    pdf.addPage([960, 540]).drawImage(png, { x: 0, y: 0, width: 960, height: 540 });
    images.push({ id: scene.id, image: filename, movieTime: time, sha256: sha256(image) });
  }
  const cover = path.join(output, images[0].image);
  const film = pptx.addSlide();
  film.addMedia({ type: 'video', path: video, cover: `data:image/png;base64,${fs.readFileSync(cover).toString('base64')}`,
    x: 0, y: 0, w: 13.333333, h: 7.5, objectName: 'Play the full English demo' });
  film.addNotes(['Click the movie to play the complete English demo, including narration, subtitles and the closing. The PDF shows a poster only.', `MP4 SHA256: ${edit.videoSha256}`]);
  const poster = await pdf.embedPng(fs.readFileSync(cover));
  const last = pdf.addPage([960, 540]);
  last.drawImage(poster, { x: 0, y: 0, width: 960, height: 540 });
  last.drawRectangle({ x: 0, y: 0, width: 960, height: 45, color: rgb(.043, .071, .125) });
  last.drawText('FULL DEMO — Play the embedded movie in PowerPoint or open the MP4.', { x: 38, y: 20, size: 14, font, color: rgb(.64, .96, .81) });
  const stem = 'bacchiri-local-demo-en';
  await pptx.writeFile({ fileName: path.join(output, `${stem}.pptx`) });
  fs.writeFileSync(path.join(output, `${stem}.pdf`), await pdf.save());
  fs.writeFileSync(path.join(output, 'slides.json'), JSON.stringify(images, null, 2) + '\n');
  const tiles = await Promise.all(images.map(async (record, i) => ({ input: await sharp(path.join(output, record.image)).resize(480, 270).png().toBuffer(), left: i % 3 * 480, top: Math.floor(i / 3) * 270 })));
  await sharp({ create: { width: 1440, height: Math.ceil(images.length / 3) * 270, channels: 3, background: '#0b1220' } }).composite(tiles).png().toFile(path.join(output, 'contact-sheet.png'));
  const manifest = { edition: edit.edition, language: 'en', createdAt: new Date().toISOString(), draft: false, simulation: true, actualChainActivity: false,
    slides: images.length + 1, renderWarnings: [], slideVisuals: 'Flattened frames of the final movie; editable speaker notes.',
    capture: { file: rel(captureFile), sha256: sha256(captureFile), checksPassed: capture.checks.length },
    sourceStorySha256: sha256(storyFile), ending: { sha256: sha256(endingFile), narration: edit.ending.narration },
    embeddedVideo: { file: rel(video), sha256: sha256(video), durationSeconds: Number(info.format.duration), editManifest: { file: rel(editFile), sha256: sha256(editFile) } },
    outputs: ['pptx', 'pdf'].map((ext) => ({ file: `${stem}.${ext}`, sha256: sha256(path.join(output, `${stem}.${ext}`)) })) };
  fs.writeFileSync(path.join(output, 'deck-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  if (!args.includes('--no-copy')) {
    const destination = path.join(root, 'docs/submission/deck');
    fs.mkdirSync(destination, { recursive: true });
    for (const ext of ['pptx', 'pdf']) fs.copyFileSync(path.join(output, `${stem}.${ext}`), path.join(destination, `${stem}.${ext}`));
  }
  process.stdout.write(JSON.stringify({ output, slides: manifest.slides, embeddedMovieSha256: sha256(video), renderWarnings: [] }) + '\n');
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
