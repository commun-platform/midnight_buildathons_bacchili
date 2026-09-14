// Local-only pitch renderer. Screenshots are captured from the current GUI in
// simulation mode; no published proof evidence is inferred from this artifact.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const PptxGenJS = require('pptxgenjs');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');

const root = path.resolve(__dirname, '../..');
const story = require('./local-demo-story.json');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const output = path.resolve(option('--output-dir', path.join(root, '.demo-output/local-demo-20260911/slides')));
const frames = path.resolve(option('--frames-dir', path.join(root, '.demo-output/local-demo-20260911/frames')));
const draft = args.includes('--draft');
const publish = !draft && !args.includes('--no-copy');
const videoOption = option('--video', null);
const videoPath = videoOption ? path.resolve(videoOption) : null;
const endingOption = option('--ending', null);
const endingPath = endingOption ? path.resolve(endingOption) : null;
const capturePath = path.resolve(option('--capture-manifest', path.join(frames, '../capture-evidence.json')));
const font = 'Noto Sans CJK JP';
const C = { bg: '07131F', panel: '102235', panel2: '0C1B2B', line: '2B465C', text: 'F6F8FA', muted: 'A4BACB', cyan: '4DE0E7', purple: 'B895FF', green: '87E4B1', orange: 'FFB066' };
const colors = [C.cyan, C.purple, C.green];
const esc = (value) => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const u = (value) => value / 144;
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const videoGuiBox = { x: 0, y: 132, w: 1920, h: 814 };
const required = story.scenes.filter((scene) => scene.kind === 'gui').map((scene) => ({ id: scene.id, file: path.join(frames, scene.frame) }));

function wrap(value, size, width) {
  const measure = (text) => [...text].reduce((sum, c) => sum + (/[^\u0000-\u007f]/u.test(c) ? 1 : /[MW@%]/u.test(c) ? .86 : /[ il.,:;'!]/u.test(c) ? .3 : .57),0) * size;
  const lines = [];
  for (const paragraph of String(value).split('\n')) {
    let line = '';
    for (const token of [...paragraph]) {
      if (line && measure(line + token) > width && !/^[、。，．！？：；）」』】]/u.test(token)) { lines.push(line.trimEnd()); line = ''; }
      line += token;
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

async function main() {
  let captureRecord = null;
  if (!draft) {
    for (const item of required) if (!fs.existsSync(item.file)) throw new Error(`Actual local-demo screenshot missing: ${item.id} / ${item.file}`);
    if (!fs.existsSync(capturePath)) throw new Error(`Completed local GUI capture manifest missing: ${capturePath}`);
    const capture = JSON.parse(fs.readFileSync(capturePath, 'utf8'));
    if (capture.validateOnly !== false) throw new Error('Final deck requires recorded media, not a validation-only browser run');
    if (!capture.completedAt || capture.failure || !capture.checks?.length || capture.checks.some((check) => check.passed !== true)) throw new Error('Final deck requires a completed local GUI capture with all acceptance checks passing');
    if (['blockedRequests', 'pageErrors', 'consoleErrors'].some((key) => !Array.isArray(capture[key]) || capture[key].length)) throw new Error('Final deck requires a capture without browser errors or blocked network attempts');
    if (capture.server?.backend !== false || capture.server?.wallet !== false) throw new Error('Final deck must use the isolated static local demo server');
    for (const item of required) {
      const record = capture.scenes?.find((scene) => scene.name === item.id);
      if (!record?.screenshot || path.resolve(path.dirname(capturePath), record.screenshot) !== item.file) throw new Error(`Captured screenshot does not match required scene: ${item.id}`);
      if (!Number.isFinite(record.capturedFrames) || record.capturedFrames <= 0) throw new Error(`No actual video frames captured: ${item.id}`);
      if (typeof record.screenshotSha256 !== 'string' || record.screenshotSha256 !== sha256(item.file)) throw new Error(`Captured screenshot hash is missing or differs: ${item.id}`);
    }
    captureRecord = { file: path.relative(root, capturePath), sha256: sha256(capturePath), completedAt: capture.completedAt, language: capture.language || null, checksPassed: capture.checks.length };
  }
  const scenes = [...story.scenes];
  let endingRecord = null;
  if (endingPath) {
    const ending = JSON.parse(fs.readFileSync(endingPath, 'utf8'));
    if (ending.id !== 'closing' || ending.layout !== 'closing' || !ending.ja?.narration?.endsWith('ありがとう。')) throw new Error('The closing slide requires the approved brand, slogan and thanks');
    scenes.push(ending);
    endingRecord = { file: path.relative(root, endingPath), sha256: sha256(endingPath), narration: ending.ja.narration };
  }
  let embeddedVideo = null;
  if (videoPath) {
    if (!fs.existsSync(videoPath)) throw new Error(`Embedded demo video missing: ${videoPath}`);
    if (!captureRecord) throw new Error('Embedding a final demo video requires a completed capture; --draft cannot embed video');
    const editPath = path.join(path.dirname(videoPath), 'edit-manifest.json');
    if (!fs.existsSync(editPath)) throw new Error(`Completed local demo edit manifest missing: ${editPath}`);
    const edit = JSON.parse(fs.readFileSync(editPath, 'utf8'));
    if (endingRecord && (edit.ending?.sha256 !== endingRecord.sha256 || edit.ending?.narration !== endingRecord.narration)) throw new Error('Closing slide and embedded movie use different ending copy');
    if (edit.network !== 'LOCAL SIMULATION' || edit.realProofGenerated !== false || edit.chainTransactionSubmitted !== false) throw new Error('Embedded video must be the explicitly simulated local GUI edition');
    if (typeof edit.video !== 'string' || path.resolve(path.dirname(editPath), edit.video) !== videoPath || edit.videoSha256 !== sha256(videoPath)) throw new Error('Embedded video path or hash differs from its completed edit manifest');
    if (edit.captureSha256 !== captureRecord.sha256 || edit.sourceStorySha256 !== sha256(path.join(__dirname, 'local-demo-story.json'))) throw new Error('Embedded video belongs to a different capture or narration story');
    if (edit.validation?.fullDecode !== true || edit.validation?.captionTextMatchesNarration !== true || edit.validation?.placeholderCount !== 0) throw new Error('Embedded video requires completed decode, caption and no-placeholder validation');
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name', '-of', 'json', videoPath], { encoding: 'utf8' });
    if (probe.status !== 0) throw new Error(`Cannot inspect embedded MP4: ${probe.stderr}`);
    const metadata = JSON.parse(probe.stdout);
    if (!metadata.streams.some((stream) => stream.codec_type === 'video' && stream.codec_name === 'h264')) throw new Error('Embedded demo must contain H.264 video for PowerPoint compatibility');
    const duration = Number(metadata.format.duration);
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('Embedded demo duration is invalid');
    embeddedVideo = { edition: edit.edition, file: path.relative(root, videoPath), sha256: sha256(videoPath), durationSeconds: duration, bytes: fs.statSync(videoPath).size, editManifest: { file: path.relative(root, editPath), sha256: sha256(editPath) } };
    scenes.push({ id: 'demo-film', kind: 'video', ja: {
      kicker: 'DEMO FILM / 日本語ナレーション・字幕付き',
      title: '操作デモを再生する。',
      narration: 'PPTXでは動画をクリックして再生できます。PDFではカバー画像が表示されます。同梱のMP4でも再生できます。すべてのGUIデータ、証明処理、取引結果はローカルの模擬動作です。',
      takeaway: `約${Math.floor(Math.round(duration) / 60)}分${String(Math.round(duration) % 60).padStart(2, '0')}秒 / 現行GUIの操作録画 / ローカル模擬動作`,
    } });
  }
  fs.mkdirSync(output, { recursive: true });
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'BACCHIRI contributors';
  pptx.title = 'BACCHIRI! — ローカルGUIデモ ピッチ';
  pptx.subject = '全UCのローカルシミュレーションと、計測結果検証の価値・実装構成・ロードマップ';
  pptx.company = 'BACCHIRI';
  pptx.lang = 'ja-JP';
  pptx.theme = { headFontFace: font, bodyFontFace: font, lang: 'ja-JP' };
  const pdf = await PDFDocument.create();
  pdf.setTitle(pptx.title);
  pdf.setAuthor(pptx.author);
  const records = [];
  const renderWarnings = [];
  for (const [index, scene] of scenes.entries()) {
    const spec = scene.ja;
    const layout = scene.layout || scene.kind;
    const slide = pptx.addSlide();
    slide.background = { color: C.bg };
    const els = [`<rect width="1920" height="1080" fill="#${C.bg}"/>`];
    function rect(x,y,w,h,fill,stroke=fill,radius=0) {
      slide.addShape(radius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, {
        x:u(x),y:u(y),w:u(w),h:u(h),rectRadius:u(radius),radius:u(radius),
        fill:{color:fill},line:{color:stroke,width:.6},
      });
      els.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="#${fill}" stroke="#${stroke}"/>`);
    }
    function line(x1,y1,x2,y2,color=C.line,width=2) {
      slide.addShape(pptx.ShapeType.line,{x:u(x1),y:u(y1),w:u(x2-x1),h:u(y2-y1),line:{color,width:width/2}});
      els.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#${color}" stroke-width="${width}"/>`);
    }
    function text(value,x,y,w,size,color=C.text,bold=false,maxLines=5,align='left') {
      const lines = wrap(value,size,w);
      if(lines.length>maxLines) throw new Error(`Text overflow: ${scene.id}: ${value}`);
      const leading=size*1.36;
      const h=lines.length*leading+size*.18;
      if(y<1028 && y+h>1020) renderWarnings.push(`${scene.id}: body extends to ${Math.round(y+h)}`);
      slide.addText(lines.join('\n'),{x:u(x),y:u(y),w:u(w),h:u(h),fontFace:font,fontSize:size/2,color,bold,margin:0,
        breakLine:false,lineSpacingMultiple:1.03,valign:'top',paraSpaceAfterPt:0,fit:'resize',align});
      lines.forEach((s,i)=>els.push(`<text x="${align==='center'?x+w/2:x}" y="${y+size+i*leading}" text-anchor="${align==='center'?'middle':'start'}" font-family="${font}" font-size="${size}" font-weight="${bold?700:400}" fill="#${color}">${esc(s)}</text>`));
      return h;
    }
    async function picture(file,box,alt) {
      const bytes=fs.readFileSync(file);
      const meta=await sharp(bytes).metadata();
      if(!meta.width||!meta.height) throw new Error(`Unknown image size: ${file}`);
      const scale=Math.min(box.w/meta.width,box.h/meta.height);
      const w=meta.width*scale,h=meta.height*scale,x=box.x+(box.w-w)/2,y=box.y+(box.h-h)/2;
      slide.addImage({path:file,x:u(x),y:u(y),w:u(w),h:u(h),altText:alt});
      const mime=meta.format==='jpeg'?'image/jpeg':'image/png';
      els.push(`<image x="${x}" y="${y}" width="${w}" height="${h}" href="data:${mime};base64,${bytes.toString('base64')}"/>`);
      return {x,y,w,h};
    }
    const footer = (label=story.locales.ja.finalLabel) => {
      line(72,1028,1848,1028);
      text(label,72,1040,1570,17,C.muted,false,1);
      text(`${String(index+1).padStart(2,'0')} / ${scenes.length}`,1730,1040,118,17,C.muted,false,1);
    };
    const header = (titleSize=60) => {
      rect(0,0,1920,5,C.cyan);
      text(spec.kicker,72,45,1776,22,C.cyan,true,1);
      text(spec.title,72,94,1776,titleSize,C.text,true,2);
    };
    let guiBox=null;
    let screenshotRecord=null;
    if (layout==='hero') {
      rect(0,0,1920,7,C.cyan);
      text(spec.kicker,78,66,1764,25,C.cyan,true,1);
      text(spec.title,78,210,1150,92,C.text,true,2);
      text(spec.subtitle,82,495,1100,34,C.muted,false,2);
      const x=1306;
      rect(x,206,536,490,C.panel,C.line,18);
      text('PRIVATE → PUBLIC',x+32,245,472,25,C.cyan,true,1);
      for(let i=0;i<24;i++) {
        const row=Math.floor(i/8),col=i%8;
        rect(x+38+col*58,329+row*58,40,40,[C.cyan,C.cyan,C.cyan,C.green,C.cyan,C.purple,C.cyan,C.cyan][col],C.panel,6);
      }
      text('24時間の判定',x+38,549,460,48,C.text,true,1);
      text('元の測定値は公開しない',x+38,625,460,25,C.muted,false,1);
      spec.cards.forEach(([h,b],i)=>{
        const cx=80+i*601;
        line(cx,770,cx+559,770,colors[i],3);
        text(h,cx,795,560,38,colors[i],true,1);
        text(b,cx,858,559,28,C.text,false,2);
      });
      text(spec.takeaway,80,963,1760,25,C.muted,false,1);
      footer();
    } else if (layout==='closing') {
      rect(0,0,1920,1080,'0B1220');
      text(spec.title,400,245,1120,145,'A4F4CF',true,1,'center');
      text(spec.reading,600,427,720,35,C.muted,false,1,'center');
      line(750,504,1170,504,'A4F4CF',3);
      text(spec.slogan,360,551,1200,82,C.text,true,2,'center');
      text(spec.thanks,600,826,720,54,'A4F4CF',true,1,'center');
    } else if (layout==='journey') {
      header(58);
      text('5つのUC + 連携・運用・異常ケース',72,205,1776,30,C.muted,false,1);
      spec.steps.forEach(([n,h,b],i)=>{
        const x=72+i*358;
        const c=[C.cyan,C.cyan,C.purple,C.purple,C.green][i];
        rect(x,320,330,325,C.panel,C.line,14);
        text(n,x+24,344,280,54,c,true,1);
        text(h,x+24,445,282,34,C.text,true,2);
        text(b,x+24,561,282,25,C.muted,false,2);
        if(i<4) text('›',x+335,436,20,40,C.muted,true,1);
      });
      spec.extras.forEach((label,i)=>{
        rect(72+i*604,704,568,84,C.panel2,C.line,12);
        text(label,100+i*604,723,512,28,colors[i],true,1);
      });
      text(spec.takeaway,72,845,1776,32,C.text,false,2);
      text('Walletで認証・承認 / Deviceが取引を認可 / SponsorがDUST手数料を負担',72,947,1776,26,C.orange,false,1);
      footer();
    } else if (scene.kind==='video') {
      header(60);
      const coverFile = path.join(output, 'demo-film-poster.png');
      const coverResult = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(Math.min(1, embeddedVideo.durationSeconds / 2)), '-i', videoPath, '-frames:v', '1', '-update', '1', coverFile], { encoding: 'utf8' });
      if (coverResult.status !== 0) throw new Error(`Cannot extract video poster: ${coverResult.stderr}`);
      const box = { x: 272, y: 220, w: 1376, h: 774 };
      const bytes = fs.readFileSync(coverFile);
      slide.addMedia({ type: 'video', path: videoPath, cover: `data:image/png;base64,${bytes.toString('base64')}`, x: u(box.x), y: u(box.y), w: u(box.w), h: u(box.h), objectName: 'BACCHIRI local demo film' });
      els.push(`<image x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" href="data:image/png;base64,${bytes.toString('base64')}"/>`);
      text(spec.takeaway,72,180,1776,24,C.muted,false,1);
      footer('PPTXでは動画をクリックして再生 / PDFでは静止画を表示 / 同梱MP4でも再生できます。');
      slide.addNotes([`Embedded video: ${embeddedVideo.file}`, `SHA256: ${embeddedVideo.sha256}`, 'This media is stored inside the PPTX; it does not require an external URL.']);
    } else if (scene.kind==='gui') {
      header(56);
      // Preserve the entire actual viewport. The deck never crops out a local
      // simulation badge or replaces UI regions with invented evidence.
      guiBox={x:72,y:215,w:1376,h:774};
      rect(guiBox.x,guiBox.y,guiBox.w,guiBox.h,C.panel,C.line,10);
      const file=path.join(frames,scene.frame);
      if(fs.existsSync(file)) {
        const rendered=await picture(file,guiBox,`${scene.uc||scene.id}: 現行GUIのローカル模擬動作`);
        screenshotRecord={file:path.relative(root,file),sha256:sha256(file),rendered};
      } else {
        if(!draft) throw new Error(`Actual screenshot is required: ${file}`);
        text('DRAFT',138,407,1200,90,C.orange,true,1);
        text('実録GUIの撮影待ち',138,555,1200,48,C.text,true,1);
        text(scene.frame,138,660,1200,30,C.muted,false,1);
      }
      text(scene.uc||'EXTENDED FLOW',1500,247,348,23,C.cyan,true,1);
      line(1500,301,1848,301,C.cyan,3);
      text('画面の着目点',1500,337,348,27,C.muted,true,1);
      const focus=spec.focus.split(' / ');
      let y=399;
      focus.forEach((f,i)=>{
        text(String(i+1).padStart(2,'0'),1500,y,60,24,colors[i%3],true,1);
        const h=text(f,1567,y-4,281,31,C.text,false,3);
        y+=Math.max(105,h+30);
      });
      line(1500,800,1848,800);
      text(spec.takeaway,1500,828,348,27,C.muted,false,5);
      footer();
    } else if (scene.kind==='diagram') {
      header(56);
      await picture(path.join(root,spec.image),{x:146,y:200,w:1628,h:750},spec.title);
      text(spec.takeaway,72,963,1776,24,C.muted,false,1);
      footer('実装構成の説明図 / 撮影用シミュレーション');
    } else {
      header(60);
      if(layout==='roadmap') text('事業と製品の到達点を分けて検証する',72,206,1776,29,C.muted,false,1);
      const cardY=layout==='roadmap'?319:310;
      const cardH=layout==='boundary'?440:421;
      spec.cards.forEach(([h,b],i)=>{
        const x=72+i*604;
        rect(x,cardY,568,cardH,C.panel,C.line,15);
        rect(x+30,cardY+32,56,5,colors[i]);
        text(layout==='roadmap'?`0${i+1}`:String(i+1).padStart(2,'0'),x+30,cardY+66,490,24,colors[i],true,1);
        const hh=text(h,x+30,cardY+118,508,37,colors[i],true,2);
        text(b,x+30,cardY+118+hh+22,508,31,C.text,false,5);
      });
      if(layout==='boundary') {
        rect(72,794,1776,137,C.panel2,C.line,12);
        text('現在の信頼境界',100,814,390,26,C.orange,true,1);
        text(spec.takeaway,508,814,1306,28,C.text,false,3);
      } else {
        text(spec.takeaway,72,814,1776,35,C.text,false,3);
        if(layout==='roadmap') {
          text('温度以外の計測種別への対応とPMF達成は、現時点の成果として主張しません。',72,954,1776,23,C.muted,false,1);
        } else {
          text('Wave 1の検証対象は温度計測。騒音・振動などへの拡張は今後の対応。',72,954,1776,23,C.muted,false,1);
        }
      }
      footer();
    }
    slide.addNotes([spec.title,spec.narration,`Edition: ${story.edition}. All GUI data and proof/transaction state are simulated locally. This deck does not establish blockchain confirmation or physical measurement truth.`,scene.kind==='diagram'?'This is an explanatory architecture illustration, not a live capture.':'',screenshotRecord?`Actual capture: ${screenshotRecord.file}\nSHA256: ${screenshotRecord.sha256}`:''].filter(Boolean));
    const stem=`${String(index+1).padStart(2,'0')}-${scene.id}`;
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${els.join('')}</svg>`;
    fs.writeFileSync(path.join(output,stem+'.svg'),svg);
    const png=await sharp(Buffer.from(svg)).png().toBuffer();
    fs.writeFileSync(path.join(output,stem+'.png'),png);
    const image=await pdf.embedPng(png);
    pdf.addPage([960,540]).drawImage(image,{x:0,y:0,width:960,height:540});
    let videoImage=stem+'.png';
    if(scene.kind==='gui') {
      videoImage=stem+'-video.png';
      const videoEls=[`<rect width="1920" height="1080" fill="#${C.bg}"/>`,`<rect x="0" y="0" width="1920" height="5" fill="#${C.cyan}"/>`,
        `<text x="62" y="39" font-family="${font}" font-size="19" fill="#${C.cyan}">${esc(spec.kicker)}</text>`,
        `<text x="62" y="97" font-family="${font}" font-size="43" font-weight="700" fill="#${C.text}">${esc(spec.title)}</text>`,
        `<text x="62" y="1060" font-family="${font}" font-size="19" fill="#${C.orange}">${esc(story.locales.ja.finalLabel)}</text>`];
      await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${videoEls.join('')}</svg>`)).png().toFile(path.join(output,videoImage));
    }
    records.push({id:scene.id,kind:scene.kind,image:stem+'.png',videoImage,guiBox,videoGuiBox:scene.kind==='gui'?videoGuiBox:null,screenshot:screenshotRecord});
  }
  const name=draft?'bacchiri-pitch-ja-draft':'bacchiri-pitch-ja';
  await pptx.writeFile({fileName:path.join(output,name+'.pptx')});
  fs.writeFileSync(path.join(output,name+'.pdf'),await pdf.save());
  fs.writeFileSync(path.join(output,'slides.json'),JSON.stringify(records,null,2)+'\n');
  const tiles=await Promise.all(records.map(async(record,i)=>({input:await sharp(path.join(output,record.image)).resize(480,270).png().toBuffer(),left:(i%3)*480,top:Math.floor(i/3)*270})));
  await sharp({create:{width:1440,height:Math.ceil(records.length/3)*270,channels:3,background:'#07131f'}}).composite(tiles).png().toFile(path.join(output,'contact-sheet.png'));
  const manifest={schemaVersion:1,edition:embeddedVideo?.edition||story.edition,createdAt:new Date().toISOString(),simulation:true,actualChainActivity:false,draft,slides:records.length,capture:captureRecord,embeddedVideo,ending:endingRecord,sourceStory:path.relative(root,path.join(__dirname,'local-demo-story.json')),sourceStorySha256:sha256(path.join(__dirname,'local-demo-story.json')),screenshots:records.filter(r=>r.screenshot).map(r=>({id:r.id,...r.screenshot})),outputs:[name+'.pptx',name+'.pdf'].map(file=>({file,sha256:sha256(path.join(output,file))})),renderWarnings};
  fs.writeFileSync(path.join(output,'deck-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  if(publish) {
    const deck=path.join(root,'docs/ja/submission/deck');
    fs.mkdirSync(deck,{recursive:true});
    for(const ext of ['pptx','pdf']) fs.copyFileSync(path.join(output,name+'.'+ext),path.join(deck,name+'.'+ext));
  }
  process.stdout.write(JSON.stringify({output,slides:records.length,draft,screenshots:manifest.screenshots.length,renderWarnings,published:publish})+'\n');
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
