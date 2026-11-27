// Contact sheets for Pip's Oasis Glow characters (QA loop).
// Usage: node tools/art-characters/sheet.js [assetDir] [outDir]
// Validates every SVG, then writes ingame.png, x4.png, composite.png to docs/art/.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const DIR = process.argv[2] || path.join(__dirname, '../../game/assets/default');
const OUT = process.argv[3] || path.join(__dirname, '../../docs/art');

const KINDS = ['fennec', 'jerboa', 'tortoise'];
const FR = ['up', 'happy', 'wow', 'sleepy', 'paws'];
const VB = {};
for (const f of ['idle', 'hop', 'boop', 'dizzy']) VB['pip_' + f] = [160, 140];
for (const k of KINDS) for (const f of FR) VB[k + '_' + f] = [140, 150];
VB.firefly = [64, 64]; VB.firefly_gold = [64, 64];
VB.leaf = [48, 48]; VB.leaf_empty = [48, 48]; VB.jar = [64, 64]; VB.lilypad = [200, 70]; VB.icon = [256, 256];

// ---------- validation (DESIGN §3) ----------
const errs = [];
for (const [n, [w, h]] of Object.entries(VB)) {
  const f = `${DIR}/${n}.svg`;
  if (!fs.existsSync(f)) { errs.push(n + ': missing'); continue; }
  const s = fs.readFileSync(f, 'utf8');
  const head = s.match(/<svg[^>]*>/)[0];
  if (!head.includes(`viewBox="0 0 ${w} ${h}"`) || !head.includes(`width="${w}"`) || !head.includes(`height="${h}"`)) errs.push(n + ': size/viewBox');
  if (/<text|<image|<script|href=|@import|font-family/i.test(s)) errs.push(n + ': forbidden content');
  for (const m of s.matchAll(/stdDeviation="([\d.]+)"/g)) if (+m[1] > 4) errs.push(n + ': blur > 4');
  const ids = [...s.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  if (new Set(ids).size !== ids.length) errs.push(n + ': duplicate ids');
}
if (errs.length) { console.error('VALIDATION FAILED\n' + errs.join('\n')); process.exitCode = 1; } else console.log('validation ok (' + Object.keys(VB).length + ' files)');

const uri = n => 'data:image/svg+xml;base64,' + fs.readFileSync(`${DIR}/${n}.svg`).toString('base64');
const img = (n, w, st = '') => `<img src="${uri(n)}" width="${w}" height="${(w * VB[n][1] / VB[n][0]).toFixed(1)}" style="${st}">`;
const SAND = '#f3dcae', NIGHT = '#2a2f5a';
const PIPS = ['pip_idle', 'pip_hop', 'pip_boop', 'pip_dizzy'];
const FRIENDS = KINDS.flatMap(k => FR.map(f => k + '_' + f));
const css = `<style>body{margin:0;background:#666;font:12px sans-serif}.p{display:flex;flex-wrap:wrap;gap:12px;padding:22px 12px 12px;align-items:flex-end;position:relative}
.lab{position:absolute;left:6px;top:4px;color:#000a}.dk .lab{color:#fffa}</style>`;

// in-game sizes: Pip 120×105, friends 140s×150s at s=1 and s=.74, fireflies 62 and 40, hearts 34, jar 52, pad 200
function inGame() {
  return [['sand', SAND], ['night', NIGHT]].map(([name, bg], i) => `<div class="p ${i ? 'dk' : ''}" style="background:${bg}"><span class="lab">${name} — in-game size (friends s=1, then s=.74)</span>` +
    PIPS.map(n => img(n, 120)).join('') + FRIENDS.map(n => img(n, 140)).join('') + FRIENDS.map(n => img(n, 104)).join('') +
    img('firefly', 62) + img('firefly_gold', 62) + img('firefly', 40) + img('firefly_gold', 40) +
    img('leaf', 34) + img('leaf', 34) + img('leaf_empty', 34) + img('jar', 52) + img('lilypad', 200) + img('icon', 64) + img('icon', 32) + `</div>`).join('');
}
// 4×: each cell has a split background (left sand, right night) + anchor guides
const guideP = `<svg style="position:absolute;left:0;top:0" width="640" height="560" viewBox="0 0 160 140">` +
  `<line x1="0" x2="160" y1="128" y2="128" stroke="red" stroke-width=".5" stroke-dasharray="2 2"/>` +
  [[80, 128, 'red'], [118, 74, 'magenta'], [80, 82, 'blue']].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="${c}"/>`).join('') + `</svg>`;
const guideF = `<svg style="position:absolute;left:0;top:0" width="560" height="600" viewBox="0 0 140 150">` +
  `<line x1="0" x2="140" y1="129" y2="129" stroke="red" stroke-width=".5" stroke-dasharray="2 2"/>` +
  `<line x1="0" x2="140" y1="10" y2="10" stroke="#06f" stroke-width=".4" stroke-dasharray="2 2"/>` +
  [[70, 94], [42, 100], [98, 100]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="magenta"/>`).join('') + `</svg>`;
function x4() {
  const split = `background:linear-gradient(90deg,${SAND} 50%,${NIGHT} 50%)`;
  const box = (n, w, g) => `<span style="position:relative;display:inline-block;${split}">${img(n, w)}${g || ''}</span>`;
  return `<div class="p" style="background:#888"><span class="lab">4× — split bg (sand | night); red = feet line / clip at full pop (y129), blue = head top y10, magenta = firefly + paw anchors</span>` +
    PIPS.map(n => box(n, 480, guideP.replace('640', '480').replace('560', '420'))).join('') +
    FRIENDS.map(n => box(n, 420, guideF.replace('560', '420').replace('600', '450'))).join('') +
    ['firefly', 'firefly_gold'].map(n => box(n, 256)).join('') + box('leaf', 192) + box('leaf_empty', 192) + box('jar', 256) + box('lilypad', 600) + box('icon', 256) + `</div>`;
}
// composite per DESIGN §2: burrow back, friend (clipped y < by+4s), firefly + soft glow centred at friend (70,94), paws, burrow front
function burrowBack(bx, by, s) {
  return `<g transform="translate(${bx - 85 * s} ${by - 45 * s}) scale(${s})"><ellipse cx="85" cy="45" rx="72" ry="24" fill="#b98a55" stroke="#7a5530" stroke-width="3"/><ellipse cx="85" cy="47" rx="60" ry="17" fill="#3b2a1e"/></g>`;
}
function burrowFront(bx, by, s) {
  return `<g transform="translate(${bx - 85 * s} ${by - 45 * s}) scale(${s})"><path d="M13,45 Q85,74 157,45 L160,62 Q85,96 10,62 Z" fill="#d4a56b" stroke="#7a5530" stroke-width="3" stroke-linejoin="round"/>` +
    `<circle cx="30" cy="66" r="6" fill="#c9b9a6" stroke="#7d6f60" stroke-width="2"/><circle cx="140" cy="64" r="5" fill="#c9b9a6" stroke="#7d6f60" stroke-width="2"/></g>`;
}
let cid = 0;
function friendAt(kind, frame, ff, bx, by, s, h) {
  const top = by + 25 * s + (1 - h) * 140 * s - 150 * s, left = bx - 70 * s, id = 'c' + (cid++);
  const fx = left + 70 * s, fy = top + 94 * s;
  let g = burrowBack(bx, by, s) + `<clipPath id="${id}"><rect x="0" y="0" width="4000" height="${by + 4 * s}"/></clipPath><g clip-path="url(#${id})">` +
    `<image href="${uri(kind + '_' + frame)}" x="${left}" y="${top}" width="${140 * s}" height="${150 * s}"/>`;
  if (ff && frame !== 'sleepy') {
    g += `<circle cx="${fx}" cy="${fy + 8 * s}" r="${44 * s}" fill="url(#glow${ff === 'gold' ? 'G' : ''})"/>` +
      `<image href="${uri(ff === 'gold' ? 'firefly_gold' : 'firefly')}" x="${fx - 31 * s}" y="${fy - 31 * s}" width="${62 * s}" height="${62 * s}"/>` +
      `<image href="${uri(kind + '_paws')}" x="${left}" y="${top}" width="${140 * s}" height="${150 * s}"/>`;
  }
  if (frame === 'sleepy') g += `<circle cx="${bx + 40 * s}" cy="${top + 20 * s}" r="${7 * s}" fill="#fff" opacity=".85"/><circle cx="${bx + 52 * s}" cy="${top + 4 * s}" r="${5 * s}" fill="#fff" opacity=".7"/>`;
  return g + `</g>` + burrowFront(bx, by, s);
}
const glowDefs = `<defs><radialGradient id="glow"><stop offset="0" stop-color="#ffe066" stop-opacity=".75"/><stop offset="1" stop-color="#ffe066" stop-opacity="0"/></radialGradient>` +
  `<radialGradient id="glowG"><stop offset="0" stop-color="#ffb81f" stop-opacity=".8"/><stop offset="1" stop-color="#ffb81f" stop-opacity="0"/></radialGradient></defs>`;
function composite() {
  const out = [];
  for (const [bg, floor] of [[SAND, '#e9cc94'], [NIGHT, '#3b4373']]) {
    const W = 960, H = 540;
    let g = glowDefs + `<rect width="${W}" height="${H}" fill="${bg}"/><rect y="230" width="${W}" height="${H - 230}" fill="${floor}"/>` +
      `<ellipse cx="480" cy="140" rx="150" ry="40" fill="#7ec8d8"/>` +
      `<image href="${uri('lilypad')}" x="380" y="101" width="200" height="70"/>` +
      `<image href="${uri('pip_idle')}" x="420" y="27" width="120" height="105"/>` +
      `<image href="${uri('pip_hop')}" x="150" y="60" width="120" height="105"/><image href="${uri('pip_boop')}" x="660" y="60" width="120" height="105"/><image href="${uri('pip_dizzy')}" x="800" y="60" width="120" height="105"/>` +
      `<image href="${uri('jar')}" x="454" y="6" width="52" height="52"/>` +
      [0, 1, 2].map(i => `<image href="${uri('leaf')}" x="${760 + i * 36}" y="14" width="34" height="34"/>`).join('') + `<image href="${uri('leaf_empty')}" x="868" y="14" width="34" height="34"/>`;
    // L2 layout: back s .74, mid .87, front 1 — every kind × (firefly, gold, sleepy) + a half-popped one
    const rows = [[280, 0.74, [330, 480, 630]], [375, 0.87, [250, 480, 710]], [480, 1, [190, 480, 770]]];
    const plan = [['fennec', 'up', 'ff'], ['jerboa', 'sleepy'], ['tortoise', 'wow', 'ff'], ['jerboa', 'up', 'gold'], ['tortoise', 'sleepy'], ['fennec', 'happy', 'ff'],
      ['tortoise', 'up', 'ff'], ['fennec', 'sleepy'], ['jerboa', 'up', 'ff']];
    let n = 0;
    for (const [by, s, xs] of rows) for (const bx of xs) { const [k, fr, ff] = plan[n]; g += friendAt(k, fr, ff, bx, by, s, n === 4 ? 0.6 : 1); n++; }
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg>`);
  }
  // zoom strip: every kind awake+firefly, gold, sleepy at s=1.3
  let z = glowDefs + `<rect width="1640" height="300" fill="${SAND}"/><rect x="820" width="820" height="300" fill="${NIGHT}"/>`;
  const strip = KINDS.flatMap(k => [[k, 'up', 'ff'], [k, 'sleepy']]);
  strip.forEach(([k, fr, ff], i) => { z += friendAt(k, fr, ff, 90 + i * 135, 250, 0.95, 1); });
  strip.forEach(([k, fr, ff], i) => { z += friendAt(k, fr, i % 2 ? ff : 'gold', 910 + i * 135, 250, 0.95, 1); });
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="1640" height="300" viewBox="0 0 1640 300">${z}</svg>`);
  return `<div style="background:#333;padding:8px;display:flex;flex-wrap:wrap;gap:8px">${out.join('')}</div>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1960, height: 400 } });
  const bad = await page.evaluate(files => files.filter(([, s]) =>
    new DOMParser().parseFromString(s, 'image/svg+xml').getElementsByTagName('parsererror').length).map(([n]) => n),
  Object.keys(VB).map(n => [n, fs.readFileSync(`${DIR}/${n}.svg`, 'utf8')]));
  if (bad.length) { console.error('XML PARSE FAILED: ' + bad.join(', ')); process.exitCode = 1; } else console.log('xml ok');
  for (const [file, html] of [['ingame.png', inGame()], ['x4.png', x4()], ['composite.png', composite()]]) {
    await page.setContent(`<!doctype html><html><head>${css}</head><body>${html}</body></html>`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, file), fullPage: true });
    console.log('wrote', path.join(OUT, file), (fs.statSync(path.join(OUT, file)).size / 1024 | 0) + ' KB');
  }
  await browser.close();
})();
