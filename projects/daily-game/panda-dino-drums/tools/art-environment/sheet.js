// Visual QA for Momo's Dino Drums environment art (Dino Lookout floors).
// Renders:
//  docs/art/env_seams.png     each wallpaper tiled 3x3, floor / shelf / track tiled 3x in x (magenta ticks mark tile seams).
//  docs/art/env_scenes.png    a composed 960x540 scene per floor approximating the game layout:
//                             wall tiled; arch window centred right of x≈300 (y 60..250); beam (shelf) drawn at y=266 so its
//                             top surface is y 274..284; deck (floor) from y=383; rails (track) centred on y=270 and y=427;
//                             placeholder drums at x=192, teal test gems on the rails, a panda blob, decor + particles.
//  docs/art/env_particles.png particles at 4x and 1x on light / dark backgrounds, the decor props and the lantern.
// Usage: node sheet.js [assetsDir] [docsArtDir] [extraDir]   (extraDir: also save each scene as scene_<floor>.png)
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));
const OUT = path.resolve(process.argv[3] || path.join(__dirname, '../../docs/art'));
const EXTRA = process.argv[4] ? path.resolve(process.argv[4]) : null;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pdd-env-'));
fs.mkdirSync(OUT, { recursive: true }); if (EXTRA) fs.mkdirSync(EXTRA, { recursive: true });
const FLOORS = ['river', 'ferns', 'nests', 'sky'];
// suggested ambient overlay per floor (drawn over wall/arch/beam/deck, under rails, gems, Momo and HUD)
const TINT = { river: 'rgba(255,196,120,0.07)', ferns: 'rgba(150,210,90,0.06)', nests: 'rgba(235,240,255,0.06)', sky: 'rgba(34,20,84,0.16)' };
const PARTS = ['mote', 'leaf', 'butterfly', 'fluff', 'firefly', 'star', 'sparkle', 'note', 'confetti'];
// a few ambient particles per floor for the scene preview: [sprite, x, y, size, rot, tint?]
const SCENE_PARTS = {
  river: [['mote', 340, 120, 22], ['mote', 820, 330, 18], ['mote', 450, 340, 16], ['leaf', 610, 300, 22, 30], ['leaf', 880, 190, 20, -40]],
  ferns: [['butterfly', 420, 150, 30, -10, '#ffb36b'], ['butterfly', 850, 320, 26, 15, '#f49ac2'], ['mote', 560, 340, 18], ['mote', 300, 90, 16]],
  nests: [['fluff', 380, 110, 26], ['fluff', 700, 330, 22], ['fluff', 880, 160, 18], ['fluff', 520, 480, 20]],
  sky: [['firefly', 360, 330, 24], ['firefly', 640, 320, 20], ['firefly', 890, 470, 22], ['star', 120, 60, 16], ['star', 420, 40, 12]],
};

const common = `
const A = ${JSON.stringify('file://' + A)};
const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => { console.log('MISSING ' + s); r(null); }; i.src = s; });
const tick = (c, x, y, w, h) => { c.fillStyle = '#f0f'; c.fillRect(x, y, w, h); };
`;

const seamPage = `<!doctype html><html><body style="margin:0;background:#fff">
<div id="w" style="display:flex;gap:10px;padding:10px;flex-wrap:wrap;width:1560px"></div>
<script>${common}
(async () => {
  const W = document.getElementById('w');
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; W.appendChild(c); return c.getContext('2d'); };
  for (const t of ${JSON.stringify(FLOORS)}) {
    const wp = await load(A + '/levels/' + t + '/wallpaper.svg');
    const c = mk(768, 768);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) c.drawImage(wp, x * 256, y * 256, 256, 256);
    for (const k of [256, 512]) { tick(c, k - 1, 0, 2, 8); tick(c, 0, k - 1, 8, 2); }
  }
  const strip = async (src, h, bg) => { const im = await load(src); const c = mk(1536, h); if (bg) { c.fillStyle = bg; c.fillRect(0, 0, 1536, h); } for (let x = 0; x < 3; x++) c.drawImage(im, x * 512, 0, 512, h); for (const k of [512, 1024]) tick(c, k - 1, 0, 2, 6); };
  for (const t of ${JSON.stringify(FLOORS)}) await strip(A + '/levels/' + t + '/floor.svg', 192);
  await strip(A + '/room/shelf.svg', 56, '#e8cb9d');
  await strip(A + '/room/track.svg', 40, '#c99f74');
  await strip(A + '/room/track.svg', 40, '#4a4470');
  document.title = 'done';
})();
</script></body></html>`;

const scenePage = `<!doctype html><html><body style="margin:0;background:#222">
<div style="display:grid;grid-template-columns:960px 960px;gap:10px;padding:10px">
${FLOORS.map(t => `<canvas id="${t}" width="960" height="540"></canvas>`).join('')}
</div>
<script>${common}
const TINT = ${JSON.stringify(TINT)}, SP = ${JSON.stringify(SCENE_PARTS)};
(async () => {
  const room = A + '/room/';
  const shelf = await load(room + 'shelf.svg'), track = await load(room + 'track.svg'), nl = await load(room + 'nightlight.svg');
  const decor = []; for (let i = 0; i < 6; i++) decor.push(await load(room + 'decor_' + i + '.svg'));
  const parts = {}; for (const p of ${JSON.stringify(PARTS)}) parts[p] = await load(A + '/particles/' + p + '.svg');
  const tint = (img, col, s) => { const o = document.createElement('canvas'); o.width = o.height = s; const g = o.getContext('2d'); g.drawImage(img, 0, 0, s, s); g.globalCompositeOperation = 'multiply'; g.fillStyle = col; g.fillRect(0, 0, s, s); g.globalCompositeOperation = 'destination-in'; g.drawImage(img, 0, 0, s, s); return o; };
  for (const t of ${JSON.stringify(FLOORS)}) {
    const d = A + '/levels/' + t + '/';
    const wp = await load(d + 'wallpaper.svg'), win = await load(d + 'window.svg'), fl = await load(d + 'floor.svg');
    const c = document.getElementById(t).getContext('2d'); const VW = 960, VH = 540;
    const momoX = 192, L0 = 270, L1 = 427, beamY = 266, deckY = 383;
    const prop = (i, x, baseY, s) => c.drawImage(decor[i], x - s / 2, baseY - s * 150 / 160, s, s);
    for (let y = 0; y < VH; y += 256) for (let x = 0; x < VW; x += 256) c.drawImage(wp, x, y, 256, 256);
    const wh = 190, ww = wh * 320 / 260; c.drawImage(win, 630 - ww / 2, 60, ww, wh);   // arch box y 60..250, centred at x=630
    if (t === 'sky') { c.strokeStyle = '#8a6a3e'; c.lineWidth = 2; c.beginPath(); c.moveTo(900, 0); c.lineTo(900, 40); c.stroke(); c.drawImage(nl, 864, 34, 72, 72); }
    // wall margin props: wind chime hanging upper-left, mushrooms on the deck front
    prop(4, 70, 220, 110);
    // beam + deck
    for (let x = 0; x < VW; x += 512) c.drawImage(shelf, x, beamY, 512, 56);
    for (let x = 0; x < VW; x += 512) c.drawImage(fl, x, deckY, 512, 192);
    prop(t === 'ferns' ? 0 : t === 'nests' ? 1 : t === 'sky' ? 3 : 5, 50, 282, 78);   // on the beam's left end (outside the play band)
    prop(2, 905, VH - 6, 96); prop(t === 'river' ? 0 : 3, 60, VH - 6, 92);
    c.fillStyle = TINT[t]; c.fillRect(0, 0, VW, VH);
    // rails
    for (const L of [L0, L1]) for (let x = 0; x < VW; x += 512) c.drawImage(track, x, L - 20, 512, 40);
    // placeholder drums + gems + panda blob
    for (const L of [L0, L1]) { c.beginPath(); c.ellipse(momoX, L - 4, 34, 13, 0, 0, 7); c.fillStyle = '#f3d6a8'; c.fill(); c.lineWidth = 5; c.strokeStyle = '#9a5f34'; c.stroke(); }
    const gem = (x, y) => { c.beginPath(); c.moveTo(x, y - 20); c.lineTo(x + 18, y - 4); c.lineTo(x, y + 20); c.lineTo(x - 18, y - 4); c.closePath(); c.fillStyle = '#3ec9c0'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#1d7d82'; c.stroke(); c.beginPath(); c.moveTo(x - 6, y - 10); c.lineTo(x, y - 15); c.lineTo(x + 3, y - 8); c.fillStyle = '#c9fbf5'; c.fill(); };
    gem(360, L0 - 40); gem(520, L0 - 24); gem(700, L1 - 56); gem(860, L1 - 24); gem(440, L1 - 40);
    const ky = L0 - 52; c.beginPath(); c.ellipse(momoX - 6, ky, 32, 34, 0, 0, 7); c.fillStyle = '#fbf8f4'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#6a6070'; c.stroke();
    c.beginPath(); c.arc(momoX - 26, ky - 30, 10, 0, 7); c.arc(momoX + 14, ky - 30, 10, 0, 7); c.fillStyle = '#3b3540'; c.fill();
    c.beginPath(); c.ellipse(momoX + 6, ky - 6, 8, 10, 0.3, 0, 7); c.fill();
    c.strokeStyle = '#8a6a3e'; c.lineWidth = 2; c.beginPath(); c.moveTo(momoX - 40, 0); c.lineTo(momoX - 40, ky + 30); c.moveTo(momoX + 30, 0); c.lineTo(momoX + 30, ky + 30); c.stroke();
    // ambient particles
    for (const [p, x, y, s, rot = 0, col] of SP[t]) { const img = col ? tint(parts[p], col, s) : parts[p]; c.save(); c.translate(x, y); c.rotate(rot * Math.PI / 180); c.drawImage(img, -s / 2, -s / 2, s, s); c.restore(); }
    c.strokeStyle = 'rgba(255,0,255,.45)'; c.lineWidth = 1; c.setLineDash([4, 4]); for (const L of [L0, L1, 274, deckY]) { c.beginPath(); c.moveTo(0, L); c.lineTo(VW, L); c.stroke(); } c.setLineDash([]);
  }
  document.title = 'done';
})();
</script></body></html>`;

const partPage = () => {
  const row = bg => `<div style="display:flex;gap:10px;align-items:center;background:${bg};padding:10px">` + PARTS.map(p => `<div style="display:flex;flex-direction:column;align-items:center;gap:6px"><img src="file://${A}/particles/${p}.svg" style="width:112px;height:112px;outline:1px dashed rgba(128,128,128,.4)"><img src="file://${A}/particles/${p}.svg" style="width:24px;height:24px"></div>`).join('') + '</div>';
  const dec = bg => `<div style="display:flex;gap:8px;background:${bg};padding:10px">` + [0, 1, 2, 3, 4, 5].map(i => `<img src="file://${A}/room/decor_${i}.svg" style="width:160px;height:160px;outline:1px dashed rgba(0,0,0,.2)">`).join('') + `<img src="file://${A}/room/nightlight.svg" style="width:96px;height:96px;outline:1px dashed rgba(255,255,255,.2)">` + '</div>';
  return `<html><body style="margin:0;background:#fff">${row('#e8cb9d')}${row('#cdc68f')}${row('#4a4470')}${dec('#efece4')}${dec('#574a7d')}</body></html>`;
};

(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  pg.on('console', m => console.log('page:', m.text()));
  const shot = async (html, name, w, h) => {
    fs.writeFileSync(TMP + '/p.html', html); await pg.setViewportSize({ width: w, height: h });
    await pg.goto('file://' + TMP + '/p.html'); if (html.includes("document.title = 'done'")) await pg.waitForFunction(() => document.title === 'done'); await pg.waitForTimeout(250);
    await pg.screenshot({ path: path.join(OUT, name), fullPage: true });
  };
  await shot(seamPage, 'env_seams.png', 1580, 1600);
  await shot(scenePage, 'env_scenes.png', 1950, 1110);
  if (EXTRA) for (const t of FLOORS) await pg.locator('#' + t).screenshot({ path: path.join(EXTRA, 'scene_' + t + '.png') });
  await shot(partPage(), 'env_particles.png', 1240, 800);
  await br.close(); console.log('rendered into', OUT);
})();
