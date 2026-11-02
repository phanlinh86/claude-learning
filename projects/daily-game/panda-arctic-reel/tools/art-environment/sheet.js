// Visual QA for Bao's Arctic Reel environment art.
// Renders:
//  docs/art/env_seams.png     each tileable layer (sky, far, ice, reef) drawn twice side by side so the seam sits in the
//                             middle of a 960-wide strip (magenta ticks mark the seam), per zone.
//  docs/art/env_scenes.png    a composed 960x540 scene per zone (DESIGN.md §2 layout: sky y0, far y0, water stretched
//                             y170..H, reef bottom = H, ice at y140 with a 64 px gap at holeX and hole_rim on top), with
//                             placeholder gems / puffer / hook so colour separation can be judged; plus 560x1000 portraits.
//  docs/art/env_particles.png particles at 4x and 1x on light and dark backgrounds.
// Usage: node sheet.js [assetsDir] [docsArtDir]
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));
const OUT = path.resolve(process.argv[3] || path.join(__dirname, '../../docs/art'));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'par-env-'));
fs.mkdirSync(OUT, { recursive: true });
const ZONES = ['shallows', 'kelp', 'twilight', 'aurora'];
// suggested renderer values (kept in sync with the final report)
const TINT = { shallows: null, kelp: 'rgba(255,214,140,0.06)', twilight: 'rgba(70,40,120,0.10)', aurora: 'rgba(8,16,48,0.18)' };
const HOLE = { shallows: '#7fd6e8', kelp: '#5cc2b0', twilight: '#3c6fb0', aurora: '#1d3a6b' };
const BACK = { shallows: ['#5aa9cc', '#7fd6e8'], kelp: ['#4f9fa0', '#5cc2b0'], twilight: ['#36588f', '#3c6fb0'], aurora: ['#1a3460', '#1d3a6b'] };
const PARTS = ['snowflake', 'bubble_s', 'kelp_bit', 'plankton', 'jelly', 'sparkle', 'drop', 'star', 'puff'];

const common = `
const A = ${JSON.stringify('file://' + A)};
const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => { console.log('MISSING ' + s); r(null); }; i.src = s; });
const tick = (c, x, y, w, h) => { c.fillStyle = '#f0f'; c.fillRect(x, y, w, h); };
`;

const seamPage = `<!doctype html><html><body style="margin:0;background:#fff">
<div id="w" style="display:grid;grid-template-columns:960px 960px;gap:10px;padding:10px"></div>
<script>${common}
(async () => {
  const W = document.getElementById('w');
  for (const z of ${JSON.stringify(ZONES)}) {
    const col = document.createElement('div'); col.style.cssText = 'display:flex;flex-direction:column;gap:4px'; W.appendChild(col);
    const mk = h => { const c = document.createElement('canvas'); c.width = 960; c.height = h; col.appendChild(c); return c.getContext('2d'); };
    const d = A + '/levels/' + z + '/';
    const sky = await load(d + 'sky.svg'), far = await load(d + 'far.svg'), ice = await load(d + 'ice.svg'), reef = await load(d + 'reef.svg');
    const two = (c, im, y, h) => { c.drawImage(im, -480, y, 960, h); c.drawImage(im, 480, y, 960, h); };
    let c = mk(200); two(c, sky, 0, 200); tick(c, 479, 0, 2, 10);
    c = mk(200); two(c, sky, 0, 200); two(c, far, 0, 200); tick(c, 479, 0, 2, 10);
    c = mk(80); c.fillStyle = '#26324f'; c.fillRect(0, 0, 960, 80); two(c, ice, 0, 80); tick(c, 479, 0, 2, 6);
    c = mk(320); c.fillStyle = '#2d6f98'; c.fillRect(0, 0, 960, 320); two(c, reef, 0, 320); tick(c, 479, 0, 2, 10);
    c.strokeStyle = 'rgba(255,255,0,.6)'; c.setLineDash([4, 4]); c.strokeRect(340 - 480 + 960, 0, 280, 320); c.strokeRect(340 - 480, 0, 280, 320); c.beginPath(); c.moveTo(0, 260); c.lineTo(960, 260); c.stroke(); c.setLineDash([]);
  }
  document.title = 'done';
})();
</script></body></html>`;

const scenePage = `<!doctype html><html><body style="margin:0;background:#222">
<div style="display:grid;grid-template-columns:960px 960px;gap:10px;padding:10px">
${ZONES.map(z => `<canvas id="L_${z}" width="960" height="540"></canvas>`).join('')}
</div>
<div style="display:flex;gap:10px;padding:0 10px 10px">
${ZONES.map(z => `<canvas id="P_${z}" width="560" height="1000" style="width:420px;height:750px"></canvas>`).join('')}
</div>
<script>${common}
const TINT = ${JSON.stringify(TINT)}, HOLE = ${JSON.stringify(HOLE)}, BACK = ${JSON.stringify(BACK)};
(async () => {
  const rim = await load(A + '/hole_rim.svg');
  const P = {}; for (const p of ${JSON.stringify(PARTS)}) P[p] = await load(A + '/particles/' + p + '.svg');
  const gem = (c, x, y, col, rim, r = 18) => { c.beginPath(); c.arc(x, y, 31, 0, 7); c.fillStyle = 'rgba(220,250,255,.12)'; c.fill(); c.lineWidth = 2; c.strokeStyle = 'rgba(214,247,255,.8)'; c.stroke();
    c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath(); c.fillStyle = col; c.fill(); c.lineWidth = 3; c.strokeStyle = rim; c.stroke(); };
  for (const z of ${JSON.stringify(ZONES)}) {
    const d = A + '/levels/' + z + '/';
    const sky = await load(d + 'sky.svg'), far = await load(d + 'far.svg'), ice = await load(d + 'ice.svg'), water = await load(d + 'water.svg'), reef = await load(d + 'reef.svg');
    for (const [id, VW, VH, off] of [['L_' + z, 960, 540, 137], ['P_' + z, 560, 1000, 311]]) {
      const c = document.getElementById(id).getContext('2d');
      const holeX = Math.round(VW / 2), SURF = 150, WT = 190, FLOOR = VH - 34;
      const tile = (im, y, h, o) => { for (let x = -o; x < VW; x += 960) c.drawImage(im, x, y, 960, h); };
      tile(sky, 0, 200, off % 960); tile(far, 0, 200, (off * 2) % 960);
      c.drawImage(water, 0, 170, VW, VH - 170);
      { const g = c.createLinearGradient(0, SURF + 6, 0, WT); g.addColorStop(0, BACK[z][0]); g.addColorStop(1, BACK[z][1]); c.fillStyle = g; c.fillRect(holeX - 32, SURF + 6, 64, WT - SURF - 6); } // suggested hole back wall
      tile(reef, VH - 320, 320, (480 - holeX + 960) % 960); // reef at drift offset 0 (see report: keep it fixed or centre-aligned)
      // placeholders: gems by depth band, golden, puffer, fish, hook + line
      const y0 = WT + 14, y3 = FLOOR - 22, band = t => y0 + (y3 - y0) * t;
      if (TINT[z]) { c.fillStyle = TINT[z]; c.fillRect(0, 0, VW, VH); }
      c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(holeX - 4, 70); c.lineTo(holeX - 4, band(0.5)); c.stroke();
      c.fillStyle = '#e8484a'; c.beginPath(); c.arc(holeX - 4, band(0.5), 7, 0, 7); c.fill();
      gem(c, holeX - 150, band(0.18), '#9b5de5', '#e2ccff'); gem(c, holeX + 130, band(0.52), '#2fc46f', '#c8ffd9');
      gem(c, holeX - 60, band(0.86), '#e23c4b', '#ffd0d4'); gem(c, holeX + 230 > VW - 40 ? holeX + 100 : holeX + 230, band(0.3), '#ffc93c', '#fff4c0', 21);
      c.fillStyle = '#ff9f1c'; c.beginPath(); c.ellipse(holeX + 70, band(0.75), 30, 24, 0, 0, 7); c.fill(); c.lineWidth = 3; c.strokeStyle = '#b25e00'; c.stroke();
      c.fillStyle = '#b7c9dc'; c.beginPath(); c.ellipse(holeX - 230 < 40 ? holeX - 120 : holeX - 230, band(0.62), 25, 14, 0, 0, 7); c.fill();
      // particles
      for (let i = 0; i < 8; i++) c.drawImage(P.snowflake, (i * 137 + 40) % VW, 20 + (i * 53) % 110, 10 + (i % 3) * 4, 10 + (i % 3) * 4);
      for (let i = 0; i < 6; i++) c.drawImage(P.bubble_s, (i * 191 + 90) % VW, 230 + (i * 97) % (VH - 300), 14, 14);
      if (z === 'kelp') for (let i = 0; i < 4; i++) c.drawImage(P.kelp_bit, (i * 233 + 60) % VW, 260 + i * 50, 18, 18);
      if (z === 'twilight') for (let i = 0; i < 10; i++) c.drawImage(P.plankton, (i * 151 + 30) % VW, 220 + (i * 71) % (VH - 280), 14, 14);
      if (z === 'aurora') { for (let i = 0; i < 4; i++) c.drawImage(P.jelly, (i * 263 + 70) % VW, 240 + (i * 113) % (VH - 320), 30, 30); for (let i = 0; i < 6; i++) c.drawImage(P.sparkle, (i * 173 + 20) % VW, 15 + (i * 41) % 110, 12, 12); }
      // ice with a 64 px gap at holeX, then the rim
      c.save(); c.beginPath(); c.rect(0, 0, holeX - 32, VH); c.rect(holeX + 32, 0, VW - holeX - 32, VH); c.clip(); tile(ice, 140, 80, 0); c.restore();
      c.drawImage(rim, holeX - 48, 140, 96, 80);
      // Bao placeholder (seat on SURFACE_Y, rod tip at holeX-4,70)
      c.fillStyle = 'rgba(40,44,58,.85)'; c.beginPath(); c.ellipse(holeX - 76, SURF - 46, 34, 42, 0, 0, 7); c.fill();
      c.strokeStyle = '#8a5a2b'; c.lineWidth = 3; c.beginPath(); c.moveTo(holeX - 50, SURF - 40); c.lineTo(holeX - 4, 70); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.9)'; c.font = '900 15px Arial'; c.fillText(z, 10, VH - 10);
      c.strokeStyle = 'rgba(255,0,255,.45)'; c.lineWidth = 1; c.setLineDash([4, 4]);
      for (const y of [SURF, WT, FLOOR]) { c.beginPath(); c.moveTo(0, y); c.lineTo(24, y); c.stroke(); }
      c.strokeRect(holeX - 140, WT, 280, FLOOR - WT); c.setLineDash([]);
    }
  }
  document.title = 'done';
})();
</script></body></html>`;

const partPage = () => {
  const row = bg => `<div style="display:flex;gap:12px;align-items:center;background:${bg};padding:10px">` + PARTS.map(p => `<div style="display:flex;flex-direction:column;align-items:center;gap:6px"><img src="file://${A}/particles/${p}.svg" style="width:112px;height:112px;outline:1px dashed rgba(128,128,128,.4)"><img src="file://${A}/particles/${p}.svg" style="width:20px;height:20px"></div>`).join('') + '</div>';
  return `<html><body style="margin:0;background:#fff">${row('#e6f7fd')}${row('#7fd6e8')}${row('#2d8fb8')}${row('#0a1530')}<div style="display:flex;gap:10px;padding:10px;background:#888"><img src="file://${A}/hole_rim.svg" style="width:288px;height:240px;background:#3c6fb0"><img src="file://${A}/hole_rim.svg" style="width:96px;height:80px;background:#e6f7fd"></div></body></html>`;
};

(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  pg.on('console', m => console.log('page:', m.text()));
  const shot = async (html, name, w, h) => {
    fs.writeFileSync(TMP + '/p.html', html); await pg.setViewportSize({ width: w, height: h });
    await pg.goto('file://' + TMP + '/p.html'); if (html.includes("document.title = 'done'")) await pg.waitForFunction(() => document.title === 'done'); await pg.waitForTimeout(250);
    await pg.screenshot({ path: path.join(OUT, name), fullPage: true });
  };
  await shot(seamPage, 'env_seams.png', 1950, 1700);
  await shot(scenePage, 'env_scenes.png', 1950, 1900);
  await shot(partPage(), 'env_particles.png', 1250, 800);
  await br.close(); console.log('rendered into', OUT);
})();
