// Visual QA for Kit's Toybox Beat environment art.
// Renders:
//  docs/art/env_seams.png     each wallpaper tiled 3x3 (odd offset) + floor / shelf / track tiled 3x at an odd x offset
//                             (magenta ticks mark the tile seams).
//  docs/art/env_scenes.png    a composed 960x540 room per time of day using the DESIGN.md §2 layout:
//                             lane 0 y=270 (shelf drawn at laneY+2 as render.js does, so its top surface is laneY+10..+20, track
//                             drawn at laneY-20 so the rail centre is on laneY), lane 1 y=426 on the floor,
//                             gold test coins at x=400, a cream/ginger "Kit" blob at x=192, decor in the margins.
//  docs/art/env_particles.png particles at 4x and 1x on light / dark backgrounds, and the decor props.
// Usage: node sheet.js [assetsDir] [docsArtDir] [floorOffset]
//   floorOffset = floor top relative to lane-1 y (default -46, as render.js computeLayout(); DESIGN.md said +34).
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));
const OUT = path.resolve(process.argv[3] || path.join(__dirname, '../../docs/art'));
const FLOOR_OFF = Number(process.argv[4] ?? -46); // render.js uses floorTop = laneY[1] - 46 (track lies on the boards)
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ktb-env-'));
fs.mkdirSync(OUT, { recursive: true });
const TODS = ['dawn', 'noon', 'sunset', 'night'];
// recommended ambient overlay per time of day (drawn over the room, under coins / Kit / HUD)
const TINT = { dawn: 'rgba(255,170,160,0.10)', noon: 'rgba(255,255,255,0)', sunset: 'rgba(255,130,60,0.12)', night: 'rgba(16,22,70,0.28)' };
const PARTS = ['mote', 'bubble', 'fluff', 'star', 'sparkle', 'feather', 'note', 'confetti'];

const common = `
const A = ${JSON.stringify('file://' + A)};
const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => { console.log('MISSING ' + s); r(null); }; i.src = s; });
const tick = (c, x, y, w, h) => { c.fillStyle = '#f0f'; c.fillRect(x, y, w, h); };
`;

const seamPage = `<!doctype html><html><body style="margin:0;background:#fff;font:700 14px Arial">
<div id="w" style="display:flex;gap:10px;padding:10px;flex-wrap:wrap;width:1660px"></div>
<script>${common}
(async () => {
  const W = document.getElementById('w');
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; W.appendChild(c); return c.getContext('2d'); };
  for (const t of ${JSON.stringify(TODS)}) {
    const wp = await load(A + '/levels/' + t + '/wallpaper.svg');
    const c = mk(400, 400); const o = -77;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) c.drawImage(wp, o + x * 256, o + y * 256, 256, 256);
    for (const k of [o + 256, o + 512]) { tick(c, k - 1, 0, 2, 8); tick(c, 0, k - 1, 8, 2); }
  }
  const strip = async (src, h) => { const im = await load(src); const c = mk(1640, h); const o = -213; for (let x = 0; x < 4; x++) c.drawImage(im, o + x * 512, 0, 512, h); for (const k of [o + 512, o + 1024, o + 1536]) tick(c, k - 1, 0, 2, 6); };
  for (const t of ${JSON.stringify(TODS)}) await strip(A + '/levels/' + t + '/floor.svg', 192);
  // shelf + track on a wall-coloured band
  { const c = mk(1640, 120); c.fillStyle = '#f4d1c8'; c.fillRect(0, 0, 1640, 120); const sh = await load(A + '/room/shelf.svg'), tr = await load(A + '/room/track.svg'); const o = -213;
    for (let x = 0; x < 4; x++) { c.drawImage(sh, o + x * 512, 10, 512, 56); c.drawImage(tr, o + x * 512, 72, 512, 40); }
    for (const k of [o + 512, o + 1024, o + 1536]) tick(c, k - 1, 0, 2, 6); }
  document.title = 'done';
})();
</script></body></html>`;

const scenePage = `<!doctype html><html><body style="margin:0;background:#222">
<div style="display:grid;grid-template-columns:960px 960px;gap:10px;padding:10px">
${TODS.map(t => `<canvas id="${t}" width="960" height="540"></canvas>`).join('')}
</div>
<script>${common}
const TINT = ${JSON.stringify(TINT)}, FLOOR_OFF = ${FLOOR_OFF};
(async () => {
  const room = A + '/room/';
  const shelf = await load(room + 'shelf.svg'), track = await load(room + 'track.svg'), nl = await load(room + 'nightlight.svg');
  const decor = []; for (let i = 0; i < 6; i++) decor.push(await load(room + 'decor_' + i + '.svg'));
  for (const t of ${JSON.stringify(TODS)}) {
    const d = A + '/levels/' + t + '/';
    const wp = await load(d + 'wallpaper.svg'), win = await load(d + 'window.svg'), fl = await load(d + 'floor.svg');
    const c = document.getElementById(t).getContext('2d'); const VW = 960, VH = 540;
    const kitX = 0.2 * VW, L0 = Math.round(0.5 * VH), L1 = Math.round(0.79 * VH), floorY = L1 + FLOOR_OFF;
    const prop = (i, x, baseY, s) => c.drawImage(decor[i], x - s / 2, baseY - s * 150 / 160, s, s);
    for (let y = 0; y < VH; y += 256) for (let x = 0; x < VW; x += 256) c.drawImage(wp, x, y, 256, 256);
    c.drawImage(win, 540, 30, 256, 208);
    // small wall shelf (upper-left margin) with toys
    c.drawImage(shelf, 0, 0, 340, 56, 0, 150, 340, 56);
    prop(3, 60, 162, 92); prop(4, 150, 162, 84); prop(5, 240, 162, 88);
    if (t === 'night') c.drawImage(nl, 890, 40, 72, 72);
    // main shelf (lane 0)
    for (let x = 0; x < VW; x += 512) c.drawImage(shelf, x, L0 + 2, 512, 56);
    prop(0, 56, L0 + 14, 80);
    // floor
    for (let x = 0; x < VW; x += 512) c.drawImage(fl, x, floorY, 512, 192);
    prop(2, 890, VH - 4, 100); prop(1, 70, VH - 4, 90);
    // ambient tint over the room
    c.fillStyle = TINT[t]; c.fillRect(0, 0, VW, VH);
    // tracks
    for (const L of [L0, L1]) for (let x = 0; x < VW; x += 512) c.drawImage(track, x, L - 20, 512, 40);
    // rings, coins, Kit blob
    for (const L of [L0 - 18, L1 - 18]) { c.lineWidth = 6; c.strokeStyle = 'rgba(230,120,80,.85)'; c.beginPath(); c.arc(kitX, L, 34, 0, 7); c.stroke(); }
    for (const [L0_, x] of [[L0, 400], [L1, 400], [L0, 640], [L1, 820]]) { const L = L0_ - 18; // COIN_LIFT
      if (t === 'night') { const g = c.createRadialGradient(x, L, 10, x, L, 34); g.addColorStop(0, 'rgba(255,230,120,.55)'); g.addColorStop(1, 'rgba(255,230,120,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, L, 34, 0, 7); c.fill(); }
      c.beginPath(); c.arc(x, L, 20, 0, 7); c.fillStyle = '#ffcf33'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#b07a00'; c.stroke();
      c.beginPath(); c.arc(x - 6, L - 6, 5, 0, 7); c.fillStyle = '#fff3b0'; c.fill();
    }
    const ky = L0 - 22;
    c.beginPath(); c.ellipse(kitX - 2, ky, 34, 30, 0, 0, 7); c.fillStyle = '#f6e3c4'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#a8703a'; c.stroke();
    c.beginPath(); c.ellipse(kitX - 4, ky - 10, 26, 10, 0, 0, 7); c.fillStyle = '#e8a05a'; c.fill();
    c.beginPath(); c.roundRect(kitX - 44, ky - 10, 16, 34, 7); c.fillStyle = '#e8484a'; c.fill(); c.strokeStyle = '#8a2424'; c.stroke();
    c.fillStyle = 'rgba(255,255,255,.85)'; c.font = '900 16px Arial'; c.fillText(t + '  (floor top = lane1 + ' + FLOOR_OFF + ')', 10, 22);
    c.strokeStyle = 'rgba(255,0,255,.5)'; c.lineWidth = 1; c.setLineDash([4, 4]); for (const L of [L0, L1]) { c.beginPath(); c.moveTo(0, L); c.lineTo(VW, L); c.stroke(); } c.setLineDash([]);
  }
  document.title = 'done';
})();
</script></body></html>`;

const partPage = () => {
  const row = bg => `<div style="display:flex;gap:12px;align-items:center;background:${bg};padding:10px">` + PARTS.map(p => `<div style="display:flex;flex-direction:column;align-items:center;gap:6px"><img src="file://${A}/particles/${p}.svg" style="width:128px;height:128px;outline:1px dashed rgba(128,128,128,.4)"><img src="file://${A}/particles/${p}.svg" style="width:24px;height:24px"></div>`).join('') + '</div>';
  const dec = `<div style="display:flex;gap:8px;background:#f8dcd3;padding:10px">` + [0, 1, 2, 3, 4, 5].map(i => `<img src="file://${A}/room/decor_${i}.svg" style="width:160px;height:160px;outline:1px dashed rgba(0,0,0,.2)">`).join('') + `<img src="file://${A}/room/nightlight.svg" style="width:96px;height:96px;background:#26325e">` + '</div>';
  return `<html><body style="margin:0;background:#fff">${row('#f8dcd3')}${row('#d6ecef')}${row('#26325e')}${dec}</body></html>`;
};

(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  pg.on('console', m => console.log('page:', m.text()));
  const shot = async (html, name, w, h) => {
    fs.writeFileSync(TMP + '/p.html', html); await pg.setViewportSize({ width: w, height: h });
    await pg.goto('file://' + TMP + '/p.html'); if (html.includes("document.title = 'done'")) await pg.waitForFunction(() => document.title === 'done'); await pg.waitForTimeout(250);
    await pg.screenshot({ path: path.join(OUT, name), fullPage: true });
  };
  await shot(seamPage, 'env_seams.png', 1680, 1500);
  await shot(scenePage, 'env_scenes.png', 1950, 1110);
  await shot(partPage(), 'env_particles.png', 1240, 800);
  await br.close(); console.log('rendered into', OUT);
})();
