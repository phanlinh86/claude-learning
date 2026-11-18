// Visual QA for Taffy's Candy Reel environment art.
// Renders:
//  docs/art/env_scenes.png    a composed 960x540 scene per level (DESIGN.md §2 layout: sky y0–200, far y0–200, water
//                             stretched from y170 to 960x370, reef bottom = H, dock at y140–220 with a 64 px gap cut at
//                             x=480 and dock_gap.svg on top), with placeholder flakes / gummy / hook / Taffy so colour
//                             separation can be judged; plus 560x1000 portraits.
//  docs/art/env_seams.png     each tileable layer (sky, far, dock, reef) drawn twice side by side with an offset so the
//                             seam sits in the middle of a 960-wide strip (magenta ticks mark the seam), per level.
//  docs/art/env_particles.png particles at 4x and 1x on light and dark backgrounds, plus dock_gap.svg.
// Usage: node sheet.js [assetsDir] [docsArtDir]
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));
const OUT = path.resolve(process.argv[3] || path.join(__dirname, '../../docs/art'));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dcr-env-'));
fs.mkdirSync(OUT, { recursive: true });
const LVLS = ['sunny', 'rain', 'wind', 'snow'];
// suggested renderer values (kept in sync with the final report)
const TINT = { sunny: null, rain: 'rgba(120,100,130,0.06)', wind: null, snow: 'rgba(40,30,90,0.10)' };
const PARTS = ['snowflake', 'bubble_s', 'sprinkle', 'sprinkle_b', 'sprinkle_y', 'floss', 'wrapper', 'ring', 'sparkle', 'drop', 'star', 'puff'];

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
  for (const z of ${JSON.stringify(LVLS)}) {
    const col = document.createElement('div'); col.style.cssText = 'display:flex;flex-direction:column;gap:4px'; W.appendChild(col);
    const mk = h => { const c = document.createElement('canvas'); c.width = 960; c.height = h; col.appendChild(c); return c.getContext('2d'); };
    const d = A + '/levels/' + z + '/';
    const sky = await load(d + 'sky.svg'), far = await load(d + 'far.svg'), dock = await load(d + 'dock.svg'), reef = await load(d + 'reef.svg');
    const two = (c, im, y, h) => { c.drawImage(im, -480, y, 960, h); c.drawImage(im, 480, y, 960, h); };
    let c = mk(200); two(c, sky, 0, 200); tick(c, 479, 0, 2, 10);
    c = mk(200); c.fillStyle = '#7a7a7a'; c.fillRect(0, 0, 960, 200); two(c, far, 0, 200); tick(c, 479, 0, 2, 10);
    c = mk(80); c.fillStyle = '#26324f'; c.fillRect(0, 0, 960, 80); two(c, dock, 0, 80); tick(c, 479, 0, 2, 6);
    c = mk(320); c.fillStyle = '#2d6f98'; c.fillRect(0, 0, 960, 320); two(c, reef, 0, 320); tick(c, 479, 0, 2, 10);
    c.strokeStyle = 'rgba(255,255,0,.6)'; c.setLineDash([4, 4]); c.strokeRect(320 - 480 + 960, 0, 320, 320); c.strokeRect(320 - 480, 0, 320, 320); c.beginPath(); c.moveTo(0, 260); c.lineTo(960, 260); c.stroke(); c.setLineDash([]);
  }
  document.title = 'done';
})();
</script></body></html>`;

const scenePage = `<!doctype html><html><body style="margin:0;background:#222">
<div style="display:grid;grid-template-columns:960px 960px;gap:10px;padding:10px">
${LVLS.map(z => `<canvas id="L_${z}" width="960" height="540"></canvas>`).join('')}
</div>
<div style="display:flex;gap:10px;padding:0 10px 10px">
${LVLS.map(z => `<canvas id="P_${z}" width="560" height="1000" style="width:420px;height:750px"></canvas>`).join('')}
</div>
<script>${common}
const TINT = ${JSON.stringify(TINT)};
(async () => {
  const gap = await load(A + '/dock_gap.svg');
  const P = {}; for (const p of ${JSON.stringify(PARTS)}) P[p] = await load(A + '/particles/' + p + '.svg');
  const flake = (c, x, y, col, rim, r = 16) => { c.beginPath(); c.arc(x, y, 31, 0, 7); c.fillStyle = 'rgba(230,250,255,.12)'; c.fill(); c.lineWidth = 2; c.strokeStyle = 'rgba(230,250,255,.8)'; c.stroke();
    c.save(); c.translate(x, y); c.strokeStyle = rim; c.lineWidth = 8; c.lineCap = 'round'; for (let i = 0; i < 6; i++) { c.rotate(Math.PI / 3); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -r); c.stroke(); }
    c.strokeStyle = col; c.lineWidth = 4.5; for (let i = 0; i < 6; i++) { c.rotate(Math.PI / 3); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -r); c.stroke(); } c.restore(); };
  for (const z of ${JSON.stringify(LVLS)}) {
    const d = A + '/levels/' + z + '/';
    const sky = await load(d + 'sky.svg'), far = await load(d + 'far.svg'), dock = await load(d + 'dock.svg'), water = await load(d + 'water.svg'), reef = await load(d + 'reef.svg');
    for (const [id, VW, VH, off] of [['L_' + z, 960, 540, 137], ['P_' + z, 560, 1000, 311]]) {
      const c = document.getElementById(id).getContext('2d');
      const holeX = Math.round(VW / 2), SURF = 150, WT = 190, FLOOR = VH - 34;
      const tile = (im, y, h, o) => { for (let x = -o; x < VW; x += 960) c.drawImage(im, x, y, 960, h); };
      tile(sky, 0, 200, off % 960); tile(far, 0, 200, (off * 2) % 960);
      c.drawImage(water, 0, 170, VW, VH - 170);
      tile(reef, VH - 320, 320, (480 - holeX + 960) % 960);
      // placeholders: flakes by depth band, golden, sour gummy, fish, hook + line
      const y0 = WT + 14, y3 = FLOOR - 22, band = t => y0 + (y3 - y0) * t;
      if (TINT[z]) { c.fillStyle = TINT[z]; c.fillRect(0, 0, VW, VH); }
      c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(holeX - 4, 70); c.lineTo(holeX - 4, band(0.5)); c.stroke();
      c.fillStyle = '#ff6fae'; c.beginPath(); c.arc(holeX - 4, band(0.5), 7, 0, 7); c.fill();
      flake(c, holeX - 150, band(0.18), '#ff6fae', '#fff'); flake(c, holeX + 130, band(0.52), '#8fdc3c', '#fff');
      flake(c, holeX - 60, band(0.86), '#9b5de5', '#fff'); flake(c, holeX + 230 > VW - 40 ? holeX + 100 : holeX + 230, band(0.3), '#ffc93c', '#fff6cf', 19);
      c.fillStyle = '#ff9a3c'; c.beginPath(); c.ellipse(holeX + 70, band(0.75), 30, 24, 0, 0, 7); c.fill(); c.lineWidth = 3; c.strokeStyle = '#b25e00'; c.stroke();
      c.fillStyle = '#e8506a'; c.beginPath(); c.ellipse(holeX - 230 < 40 ? holeX - 120 : holeX - 230, band(0.62), 25, 14, 0, 0, 7); c.fill();
      // particles
      if (z === 'snow') for (let i = 0; i < 14; i++) c.drawImage(P.snowflake, (i * 137 + 40) % VW, 10 + (i * 53) % 130, 10 + (i % 3) * 4, 10 + (i % 3) * 4);
      if (z === 'rain') for (let i = 0; i < 18; i++) c.drawImage(P[['sprinkle', 'sprinkle_b', 'sprinkle_y'][i % 3]], (i * 151 + 30) % VW, 10 + (i * 47) % 130, 16, 16);
      if (z === 'rain') for (let i = 0; i < 5; i++) c.drawImage(P.ring, (i * 199 + 60) % VW, WT - 2, 30, 30);
      if (z === 'wind') { for (let i = 0; i < 4; i++) c.drawImage(P.floss, (i * 233 + 60) % VW, 30 + i * 25, 26, 26); for (let i = 0; i < 3; i++) c.drawImage(P.wrapper, (i * 311 + 120) % VW, 50 + i * 30, 20, 20); }
      if (z === 'sunny') for (let i = 0; i < 3; i++) c.drawImage(P.floss, (i * 283 + 90) % VW, 40 + i * 30, 22, 22);
      for (let i = 0; i < 6; i++) c.drawImage(P.bubble_s, (i * 191 + 90) % VW, 230 + (i * 97) % (VH - 300), 14, 14);
      // dock with a 64 px gap at holeX, then the gap ends
      c.save(); c.beginPath(); c.rect(0, 0, holeX - 32, VH); c.rect(holeX + 32, 0, VW - holeX - 32, VH); c.clip(); tile(dock, 140, 80, 0); c.restore();
      c.drawImage(gap, holeX - 48, 140, 96, 80);
      // Taffy placeholder (seat on SURFACE_Y, rod tip at holeX-4,70)
      c.fillStyle = 'rgba(110,210,170,.9)'; c.beginPath(); c.ellipse(holeX - 76, SURF - 40, 34, 40, 0, 0, 7); c.fill();
      c.strokeStyle = '#e8506a'; c.lineWidth = 4; c.beginPath(); c.moveTo(holeX - 50, SURF - 40); c.lineTo(holeX - 4, 70); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.9)'; c.font = '900 15px Arial'; c.fillText(z, 10, VH - 10);
      c.strokeStyle = 'rgba(255,0,255,.45)'; c.lineWidth = 1; c.setLineDash([4, 4]);
      for (const y of [SURF, WT, FLOOR]) { c.beginPath(); c.moveTo(0, y); c.lineTo(24, y); c.stroke(); }
      c.strokeRect(holeX - 160, WT, 320, FLOOR - WT); c.setLineDash([]);
    }
  }
  document.title = 'done';
})();
</script></body></html>`;

const partPage = () => {
  const row = bg => `<div style="display:flex;gap:12px;align-items:center;background:${bg};padding:10px">` + PARTS.map(p => `<div style="display:flex;flex-direction:column;align-items:center;gap:6px"><img src="file://${A}/particles/${p}.svg" style="width:112px;height:112px;outline:1px dashed rgba(128,128,128,.4)"><img src="file://${A}/particles/${p}.svg" style="width:20px;height:20px"></div>`).join('') + '</div>';
  return `<html><body style="margin:0;background:#fff">${row('#eafaff')}${row('#8fe3e0')}${row('#2f9bb5')}${row('#1c2e63')}<div style="display:flex;gap:10px;padding:10px;background:#888"><img src="file://${A}/dock_gap.svg" style="width:288px;height:240px;background:#2f9bb5"><img src="file://${A}/dock_gap.svg" style="width:96px;height:80px;background:#eafaff"></div></body></html>`;
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
  await shot(partPage(), 'env_particles.png', 1650, 800);
  await br.close(); console.log('rendered into', OUT);
})();
