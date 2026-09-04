const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '../..');
const outputDir = path.join(root, 'docs/assets/guides');
const svgPath = path.join(outputDir, 'on-demand-zkp-midnight-architecture-en.svg');
const pngPath = path.join(outputDir, 'on-demand-zkp-midnight-architecture-en.png');

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

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function text(lines, options) {
  const {
    x,
    y,
    size,
    color = C.white,
    weight = 400,
    anchor = 'start',
    lineHeight = size * 1.25,
    tracking = 0,
    family = 'Aptos, Inter, Arial, Helvetica, sans-serif',
  } = options;
  const values = Array.isArray(lines) ? lines : [lines];
  const spans = values.map((line, index) =>
    `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
  ).join('');
  return `<text x="${x}" y="${y}" fill="#${color}" font-family="${family}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${tracking}">${spans}</text>`;
}

function panel(x, y, w, h, accent, radius = 18, fill = C.panel) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="#${fill}" stroke="#${accent}" stroke-width="2.5"/>`;
}

function pill(x, y, w, label, color, options = {}) {
  const { textColor = C.bg, stroke = color, transparent = false, size = 16 } = options;
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="34" rx="17" fill="#${color}" fill-opacity="${transparent ? 0.12 : 1}" stroke="#${stroke}" stroke-width="1.5"/>`,
    text(label, { x: x + w / 2, y: y + 23, size, color: transparent ? color : textColor, weight: 800, anchor: 'middle', tracking: 0.7 }),
  ].join('');
}

function arrow(x1, y1, x2, y2, label) {
  const midpoint = (x1 + x2) / 2;
  return [
    `<path d="M${x1} ${y1}H${x2}" fill="none" stroke="#${C.cyan}" stroke-width="4" marker-end="url(#arrowhead)"/>`,
    label ? pill(midpoint - 58, y1 - 42, 116, label, C.cyan, { transparent: true, size: 13 }) : '',
  ].join('');
}

function browserIcon(x, y, color) {
  return [
    `<rect x="${x}" y="${y}" width="54" height="42" rx="5" fill="none" stroke="#${color}" stroke-width="3"/>`,
    `<path d="M${x} ${y + 12}H${x + 54}" stroke="#${color}" stroke-width="3"/>`,
    `<circle cx="${x + 8}" cy="${y + 6}" r="2.2" fill="#${color}"/>`,
    `<circle cx="${x + 16}" cy="${y + 6}" r="2.2" fill="#${color}"/>`,
  ].join('');
}

function cloudIcon(x, y, color) {
  return `<path d="M${x + 11} ${y + 36}H${x + 48}C${x + 58} ${y + 36} ${x + 61} ${y + 20} ${x + 50} ${y + 16}C${x + 45} ${y + 3} ${x + 25} ${y + 4} ${x + 21} ${y + 17}C${x + 7} ${y + 15} ${x + 2} ${y + 34} ${x + 11} ${y + 36}Z" fill="none" stroke="#${color}" stroke-width="3"/>`;
}

function databaseIcon(x, y, color) {
  return [
    `<ellipse cx="${x + 27}" cy="${y + 8}" rx="25" ry="7" fill="none" stroke="#${color}" stroke-width="3"/>`,
    `<path d="M${x + 2} ${y + 8}V${y + 34}C${x + 2} ${y + 44} ${x + 52} ${y + 44} ${x + 52} ${y + 34}V${y + 8}" fill="none" stroke="#${color}" stroke-width="3"/>`,
    `<path d="M${x + 2} ${y + 21}C${x + 2} ${y + 31} ${x + 52} ${y + 31} ${x + 52} ${y + 21}" fill="none" stroke="#${color}" stroke-width="2"/>`,
  ].join('');
}

function walletIcon(x, y, color) {
  return [
    `<rect x="${x}" y="${y + 7}" width="58" height="39" rx="8" fill="none" stroke="#${color}" stroke-width="3"/>`,
    `<path d="M${x + 5} ${y + 8}V${y + 3}H${x + 47}" fill="none" stroke="#${color}" stroke-width="3"/>`,
    `<rect x="${x + 38}" y="${y + 20}" width="24" height="15" rx="5" fill="#${C.bg}" stroke="#${color}" stroke-width="3"/>`,
    `<circle cx="${x + 45}" cy="${y + 27.5}" r="2.5" fill="#${color}"/>`,
  ].join('');
}

function proofIcon(x, y, color) {
  return [
    `<path d="M${x + 28} ${y}L${x + 54} ${y + 10}V${y + 30}C${x + 54} ${y + 45} ${x + 43} ${y + 54} ${x + 28} ${y + 62}C${x + 13} ${y + 54} ${x + 2} ${y + 45} ${x + 2} ${y + 30}V${y + 10}Z" fill="none" stroke="#${color}" stroke-width="3"/>`,
    `<path d="M${x + 15} ${y + 31}L${x + 24} ${y + 40}L${x + 42} ${y + 20}" fill="none" stroke="#${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  ].join('');
}

function moonIcon(x, y, color) {
  return `<path d="M${x + 43} ${y + 4}C${x + 21} ${y + 8} ${x + 13} ${y + 37} ${x + 31} ${y + 51}C${x + 16} ${y + 54} ${x + 2} ${y + 43} ${x + 2} ${y + 27}C${x + 2} ${y + 8} ${x + 21} ${y - 4} ${x + 43} ${y + 4}Z" fill="none" stroke="#${color}" stroke-width="3"/>`;
}

function architectureSvg() {
  const svg = [];
  svg.push('<svg xmlns="http://www.w3.org/2000/svg" width="1672" height="941" viewBox="0 0 1672 941">');
  svg.push('<defs>');
  svg.push(`<pattern id="grid" width="56" height="56" patternUnits="userSpaceOnUse"><path d="M56 0H0V56" fill="none" stroke="#${C.line}" stroke-width="1" opacity="0.22"/></pattern>`);
  svg.push(`<linearGradient id="titleGlow" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#${C.cyan}"/><stop offset="0.58" stop-color="#${C.purple}"/><stop offset="1" stop-color="#${C.green}"/></linearGradient>`);
  svg.push(`<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000814" flood-opacity="0.32"/></filter>`);
  svg.push(`<marker id="arrowhead" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M0 0L12 6L0 12Z" fill="#${C.cyan}"/></marker>`);
  svg.push('</defs>');

  svg.push(`<rect width="1672" height="941" fill="#${C.bg}"/>`);
  svg.push('<rect width="1672" height="941" fill="url(#grid)"/>');
  svg.push('<rect x="0" y="0" width="1672" height="8" fill="url(#titleGlow)"/>');
  svg.push(text('OUR ENGINEERING INNOVATION · CURRENT PREPROD SYSTEM', { x: 64, y: 52, size: 18, color: C.cyan, weight: 800, tracking: 2.2 }));
  svg.push(text('ON-DEMAND ZK PROOF & MIDNIGHT RECORDING', { x: 64, y: 101, size: 43, color: C.white, weight: 800, tracking: 0.2 }));
  svg.push(text('24/7 admission with a stateful Sponsor Wallet that wakes only for eligible work, pays DUST, checkpoints, and stops.', { x: 66, y: 139, size: 20, color: C.muted, weight: 500 }));
  svg.push(pill(1387, 41, 221, 'PREPROD FLOW CONFIRMED', C.green, { transparent: true, size: 13 }));

  const y = 190;
  const h = 438;
  svg.push('<g filter="url(#shadow)">');
  svg.push(panel(60, y, 315, h, C.cyan));
  svg.push(panel(405, y, 375, h, C.purple));
  svg.push(panel(810, y, 400, h, C.amber));
  svg.push(panel(1240, y, 372, h, C.green));
  svg.push('</g>');

  svg.push('<rect x="60" y="190" width="315" height="52" rx="16" fill="#38D6E8" fill-opacity="0.14"/>');
  svg.push(text('1 · EDGE & INTAKE', { x: 82, y: 224, size: 20, color: C.cyan, weight: 800, tracking: 1.2 }));
  svg.push(browserIcon(85, 275, C.cyan));
  svg.push(text('BROWSER WALLET', { x: 157, y: 290, size: 19, color: C.white, weight: 800 }));
  svg.push(text(['User-authorized transaction', 'Private input stays local'], { x: 157, y: 316, size: 15, color: C.muted, lineHeight: 21 }));
  svg.push('<path d="M82 356H352" stroke="#29415C" stroke-width="1.5"/>');
  svg.push(cloudIcon(83, 382, C.cyan));
  svg.push(text('EXTERNAL CLOUD API', { x: 157, y: 397, size: 19, color: C.white, weight: 800 }));
  svg.push(text(['Managed measurement source', 'Authenticated HTTPS fetch'], { x: 157, y: 423, size: 15, color: C.muted, lineHeight: 21 }));
  svg.push(pill(84, 490, 267, '24/7 ACCEPTANCE', C.cyan, { transparent: true, size: 15 }));
  svg.push(text(['PRIVATE RAW VALUES', 'never become public evidence'], { x: 217.5, y: 553, size: 17, color: C.cyan, weight: 800, anchor: 'middle', lineHeight: 24 }));

  svg.push('<rect x="405" y="190" width="375" height="52" rx="16" fill="#A66CFF" fill-opacity="0.14"/>');
  svg.push(text('2 · CLOUDFLARE CONTROL', { x: 427, y: 224, size: 20, color: C.purple, weight: 800, tracking: 1.1 }));
  svg.push('<rect x="429" y="268" width="327" height="77" rx="12" fill="#111F33" stroke="#A66CFF" stroke-width="1.5"/>');
  svg.push(text('WORKER API', { x: 450, y: 298, size: 18, color: C.white, weight: 800 }));
  svg.push(text('Auth · validation · durable 202 acceptance', { x: 450, y: 324, size: 14.5, color: C.muted }));
  svg.push(databaseIcon(441, 374, C.purple));
  svg.push(text('D1 JOB STATE', { x: 511, y: 391, size: 18, color: C.white, weight: 800 }));
  svg.push(text(['Dependencies · idempotency', 'single six-minute processing lease'], { x: 511, y: 416, size: 14.5, color: C.muted, lineHeight: 20 }));
  svg.push('<path d="M429 461H756" stroke="#29415C" stroke-width="1.5"/>');
  svg.push(databaseIcon(441, 486, C.cyan));
  svg.push(text('PRIVATE R2 ARTIFACTS', { x: 511, y: 503, size: 18, color: C.white, weight: 800 }));
  svg.push(text(['Encrypted Wallet checkpoint', 'temporary transaction bytes'], { x: 511, y: 528, size: 14.5, color: C.muted, lineHeight: 20 }));
  svg.push(pill(431, 575, 317, '1-MINUTE JOB CHECK · NO WORK = NO WAKE', C.purple, { transparent: true, size: 12.5 }));

  svg.push('<rect x="810" y="190" width="400" height="52" rx="16" fill="#F4B740" fill-opacity="0.14"/>');
  svg.push(text('3 · ON-DEMAND RUNTIMES', { x: 832, y: 224, size: 20, color: C.amber, weight: 800, tracking: 0.9 }));
  svg.push('<rect x="832" y="264" width="356" height="228" rx="14" fill="#111F33" stroke="#F4B740" stroke-width="1.8"/>');
  svg.push(walletIcon(851, 284, C.amber));
  svg.push(text('SERVER-SIDE SPONSOR WALLET', { x: 924, y: 306, size: 18, color: C.white, weight: 800 }));
  svg.push(text('Pays only the network fee for an authorized call', { x: 852, y: 351, size: 14.5, color: C.muted }));
  const walletSteps = [
    ['01', 'Restore encrypted checkpoint'],
    ['02', 'Pass Wallet synchronization gate'],
    ['03', 'Add DUST only + submit'],
    ['04', 'Checkpoint + graceful SIGTERM'],
  ];
  walletSteps.forEach(([number, label], index) => {
    const stepY = 384 + index * 25;
    svg.push(`<circle cx="865" cy="${stepY - 5}" r="10" fill="#${C.amber}" fill-opacity="0.2" stroke="#${C.amber}" stroke-width="1"/>`);
    svg.push(text(number, { x: 865, y: stepY - 1, size: 8, color: C.amber, weight: 800, anchor: 'middle' }));
    svg.push(text(label, { x: 884, y: stepY, size: 13.5, color: C.white, weight: 600 }));
  });
  svg.push('<rect x="832" y="506" width="356" height="76" rx="14" fill="#111F33" stroke="#79D66A" stroke-width="1.8"/>');
  svg.push(proofIcon(850, 513, C.green));
  svg.push(text('SEPARATE PROOF SERVER', { x: 925, y: 535, size: 17, color: C.white, weight: 800 }));
  svg.push(text(['Private witness → ZK proof', 'No persistent raw-value store'], { x: 925, y: 559, size: 13.5, color: C.muted, lineHeight: 17 }));
  svg.push(pill(834, 590, 352, 'NO DEVICE AUTHORITY · NO RAW VALUES', C.red, { transparent: true, size: 12.8 }));

  svg.push('<rect x="1240" y="190" width="372" height="52" rx="16" fill="#79D66A" fill-opacity="0.14"/>');
  svg.push(text('4 · PUBLIC EVIDENCE', { x: 1262, y: 224, size: 20, color: C.green, weight: 800, tracking: 1.1 }));
  svg.push(moonIcon(1280, 282, C.green));
  svg.push(text('MIDNIGHT', { x: 1346, y: 301, size: 20, color: C.white, weight: 800 }));
  svg.push(text(['Threshold result · commitment', 'transaction + block metadata'], { x: 1346, y: 328, size: 14.5, color: C.muted, lineHeight: 20 }));
  svg.push('<path d="M1264 380H1588" stroke="#29415C" stroke-width="1.5"/>');
  svg.push(proofIcon(1278, 408, C.green));
  svg.push(text('PUBLIC VERIFICATION', { x: 1346, y: 433, size: 19, color: C.white, weight: 800 }));
  svg.push(text(['Checks the registered policy,', 'result, commitment, and TX', 'without private readings'], { x: 1346, y: 460, size: 14.5, color: C.muted, lineHeight: 20 }));
  svg.push(pill(1266, 548, 320, 'PUBLIC RESULT + METADATA ONLY', C.green, { transparent: true, size: 14 }));

  svg.push(arrow(375, 410, 405, 410, 'AUTH'));
  svg.push(arrow(780, 410, 810, 410, 'ELIGIBLE'));
  svg.push(arrow(1210, 410, 1240, 410, 'PROOF + TX'));
  svg.push(`<path d="M1225 176V646" stroke="#${C.green}" stroke-width="2" stroke-dasharray="8 8" opacity="0.65"/>`);
  svg.push(text('PUBLIC BOUNDARY', { x: 1220, y: 650, size: 12, color: C.green, weight: 800, anchor: 'end', tracking: 1.1 }));

  svg.push(panel(60, 684, 986, 185, C.green, 18, C.panel2));
  svg.push(text('COST-AWARE OPERATIONS · STANDARD-4 PLANNING EXAMPLE', { x: 84, y: 722, size: 16, color: C.green, weight: 800, tracking: 1.1 }));
  svg.push(text('$133.23', { x: 96, y: 785, size: 43, color: C.muted, weight: 800 }));
  svg.push(text('24/7 · 720 h / 30 days', { x: 98, y: 817, size: 15, color: C.muted, weight: 600 }));
  svg.push(`<path d="M335 782H442" stroke="#${C.cyan}" stroke-width="5" marker-end="url(#arrowhead)"/>`);
  svg.push(text('$22.20', { x: 480, y: 785, size: 43, color: C.white, weight: 800 }));
  svg.push(text('illustrative 4 h/day drain · 120 h', { x: 482, y: 817, size: 15, color: C.muted, weight: 600 }));
  svg.push('<rect x="790" y="739" width="220" height="84" rx="16" fill="#79D66A" fill-opacity="0.12" stroke="#79D66A" stroke-width="2"/>');
  svg.push(text('−83.3%', { x: 900, y: 783, size: 37, color: C.green, weight: 900, anchor: 'middle' }));
  svg.push(text('PLANNING ESTIMATE', { x: 900, y: 809, size: 12, color: C.green, weight: 800, anchor: 'middle', tracking: 1 }));
  svg.push(text('Excludes Workers Paid, D1, Queue, R2, egress, and Proof Server; actual cost follows drain duration.', { x: 86, y: 850, size: 13.5, color: C.muted, weight: 500 }));

  svg.push(panel(1076, 684, 536, 185, C.amber, 18, C.panel2));
  svg.push(text('SERVER-WALLET ACHIEVEMENT', { x: 1100, y: 722, size: 16, color: C.amber, weight: 800, tracking: 1.1 }));
  svg.push(text('BUILT + VALIDATED', { x: 1100, y: 765, size: 28, color: C.white, weight: 900 }));
  svg.push(text(['System pays the DUST fee for an authorized call', 'Device authority and private values stay separate', 'Preprod flow confirmed · 2026-09-03'], { x: 1102, y: 797, size: 14.5, color: C.muted, weight: 600, lineHeight: 22 }));

  svg.push(`<path d="M64 906H1608" stroke="#${C.line}" stroke-width="1.5"/>`);
  svg.push(text('BACCHIRI! · VERIFIABLE MEASUREMENT LAYER', { x: 64, y: 928, size: 12, color: C.muted, weight: 700, tracking: 1 }));
  svg.push(text('DUST sponsorship is fee payment, not authority delegation.', { x: 1608, y: 928, size: 12, color: C.amber, weight: 700, anchor: 'end' }));
  svg.push('</svg>');
  return svg.join('\n');
}

async function buildOnDemandArchitecture() {
  fs.mkdirSync(outputDir, { recursive: true });
  const svg = architectureSvg();
  fs.writeFileSync(svgPath, `${svg}\n`);
  await sharp(Buffer.from(svg))
    .resize(1672, 941, { fit: 'fill' })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(pngPath);
  return { svgPath, pngPath };
}

if (require.main === module) {
  buildOnDemandArchitecture()
    .then(({ svgPath: builtSvg, pngPath: builtPng }) => {
      process.stdout.write(`${path.relative(root, builtSvg)}\n${path.relative(root, builtPng)}\n`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = { architectureSvg, buildOnDemandArchitecture, pngPath, svgPath };
