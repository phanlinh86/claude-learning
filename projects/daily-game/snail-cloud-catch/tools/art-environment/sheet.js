// Visual QA for Shelly's Sky Catch environment art.
// Renders into docs/art/:
//   env_<zone>.png    each level composed in draw order (sky → castle → clouds at y 120, offset 300 px →
//                     bank at y 0, offset 200 px → ground) with stand-ins: Shelly at (480,430) + basket rim,
//                     stars (yellow/pink/blue/gold) at y 200–380, a slate thunder puff, HUD pills on the bank
//   env_levels.png    the 4 levels side by side (2x2)
//   env_seams.png     two tiles of clouds and bank side by side, zoomed x3 at the seam, per level
//   env_particles.png every particle at 4x and 1x on light, mid and dark backgrounds
// Also prints the average sky colour per level (for palette.json "sky").
// Usage: node sheet.js [assetsDir] [docsArtDir]
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = process.argv[2] || path.join(__dirname, '../../game/assets/default');
const OUT = process.argv[3] || path.join(__dirname, '../../docs/art');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ssc-env-'));
fs.mkdirSync(OUT, { recursive: true });
const zones = ['sunny', 'rain', 'wind', 'snow'];
const PALJ = JSON.parse(fs.readFileSync(path.join(A, 'zones/palette.json'), 'utf8'));
const abs = (x, y, w, h, css) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${css}"></div>`;
const STAR = 'polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)';
function star(x, y, d, fill, rim) { return abs(x - d / 2 - 2, y - d / 2 - 2, d + 4, d + 4, `clip-path:${STAR};background:${rim}`) + abs(x - d / 2, y - d / 2, d, d, `clip-path:${STAR};background:${fill}`); }
function scene(z) {
  const d = `file://${A}/zones/${z}`;
  const img = (n, x = 0, y = 0, w = 960, h = 540) => `<img src="${d}/${n}.svg" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px">`;
  let h = `<div style="position:relative;width:960px;height:540px;overflow:hidden">` + img('sky') + img('castle');
  h += img('clouds', 300 - 960, 120, 960, 220) + img('clouds', 300, 120, 960, 220);
  h += img('bank', 200 - 960, 0, 960, 150) + img('bank', 200, 0, 960, 150);
  // stars (32 px; gold 44 px with a cream halo) and one thunder puff
  const st = [[220, 230, '#ffd23a', '#b8860b'], [380, 300, '#ff6fae', '#a0306a'], [620, 260, '#4fb0ff', '#1d5fa8'], [760, 350, '#ffd23a', '#b8860b'], [520, 380, '#ff6fae', '#a0306a'], [130, 360, '#4fb0ff', '#1d5fa8']];
  for (const [x, y, c, r] of st) h += star(x, y, 32, c, r);
  h += abs(856 - 30, 240 - 30, 60, 60, 'border-radius:50%;background:radial-gradient(#fff8dcdd 30%,#fff8dc00 70%)') + star(856, 240, 44, '#f2b100', '#8a5a00');
  h += abs(660 - 23, 360 - 18, 46, 36, 'border-radius:50% 50% 40% 40%;background:#5f6a86;border:3px solid #3a4260;box-sizing:border-box') + abs(658, 380, 6, 14, 'background:#ffe14a;transform:skewX(-20deg)');
  // Shelly stand-in: mint body, coral shell, basket rim at y 384
  h += abs(440, 446, 96, 26, 'border-radius:40% 60% 30% 30%;background:#6fd6b4;border:3px solid #2f8a74;box-sizing:border-box');
  h += abs(512, 418, 18, 34, 'border-radius:9px;background:#6fd6b4;border:3px solid #2f8a74;box-sizing:border-box');
  h += abs(446, 398, 56, 56, 'border-radius:50%;background:radial-gradient(circle at 45% 45%,#fff0dc 0 14%,#ff8a5c 16%);border:3px solid #b04a2a;box-sizing:border-box');
  h += abs(448, 380, 64, 24, 'border-radius:4px 4px 14px 14px;background:#c9934e;border:3px solid #7a5028;box-sizing:border-box');
  h += img('ground');
  // HUD mock: pills in the palette colour on the bank
  const hud = PALJ[z].hud;
  h += abs(14, 12, 120, 40, `border-radius:20px;background:${hud}cc`) + [0, 1, 2].map(i => abs(26 + i * 34, 20, 26, 24, 'background:#ff4f6d;border:2px solid #fff;border-radius:50% 50% 50% 50%/60% 60% 40% 40%;box-sizing:border-box')).join('');
  h += `<div style="position:absolute;left:400px;top:12px;width:160px;height:40px;border-radius:20px;background:${hud}cc;text-align:center;font:900 28px/40px Arial;color:#fff">1250 ×3</div>`;
  h += abs(299, 120, 2, 10, 'background:#f0f') + abs(199, 0, 2, 8, 'background:#f0f'); // seam markers
  h += abs(0, 280, 4, 200, 'background:#f0f8') + abs(956, 280, 4, 200, 'background:#f0f8'); // play band marker
  h += `<div style="position:absolute;left:8px;bottom:6px;font:700 14px Arial;color:#fff;-webkit-text-stroke:.6px #000">${z}</div>`;
  return h + '</div>';
}
function seams(z) {
  const d = `file://${A}/zones/${z}`;
  // two tiles abutting at the centre of a 200 px window, zoomed x3 (seam = magenta ticks)
  const strip = (n, hgt) => `<div style="position:relative;width:600px;height:${hgt * 3}px;overflow:hidden;background:#3a3a4a">` +
    `<div style="position:absolute;left:0;top:0;width:200px;height:${hgt}px;transform:scale(3);transform-origin:0 0">` +
    `<img src="${d}/${n}.svg" style="position:absolute;left:-860px;top:0;width:960px;height:${hgt}px"><img src="${d}/${n}.svg" style="position:absolute;left:100px;top:0;width:960px;height:${hgt}px"></div>` +
    abs(298, 0, 4, 10, 'background:#f0f') + abs(298, hgt * 3 - 10, 4, 10, 'background:#f0f') + '</div>';
  return `<div style="display:flex;flex-direction:column;gap:6px"><div style="font:700 16px Arial">${z}: clouds / bank</div>${strip('clouds', 220)}${strip('bank', 150)}</div>`;
}
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  const go = async (body, file, vp) => { fs.writeFileSync(TMP + '/t.html', `<html><body style="margin:0;background:#fff">${body}</body></html>`); await pg.setViewportSize(vp); await pg.goto('file://' + TMP + '/t.html'); await pg.waitForTimeout(400); await pg.screenshot({ path: file }); };
  for (const z of zones) await go(scene(z), path.join(OUT, `env_${z}.png`), { width: 960, height: 540 });
  const grid = '<div style="display:grid;grid-template-columns:960px 960px;gap:12px;padding:12px;background:#fff">' + zones.map(scene).join('') + '</div>';
  await go(grid, path.join(OUT, 'env_levels.png'), { width: 1956, height: 2 * 540 + 36 });
  await go(`<div style="display:flex;gap:10px;padding:8px">${zones.map(seams).join('')}</div>`, path.join(OUT, 'env_seams.png'), { width: 2450, height: 660 + 450 + 50 });
  const pl = ['sparkle', 'twinkle', 'puff', 'rain', 'splash', 'snowflake', 'streak', 'petal', 'zap', 'mote'];
  const row = bg => `<div style="display:flex;gap:12px;align-items:center;background:${bg};padding:10px">` + pl.map(p => `<div style="display:flex;flex-direction:column;align-items:center;gap:6px"><img src="file://${A}/particles/${p}.svg" style="width:128px;height:128px;outline:1px dashed rgba(128,128,128,.4)"><img src="file://${A}/particles/${p}.svg" style="width:32px;height:32px"></div>`).join('') + '</div>';
  await go(`<div style="background:#fff;padding:10px">${row('#eef4f8')}${row('#a4a1c1')}${row('#2f2a66')}</div>`, path.join(OUT, 'env_particles.png'), { width: 1440, height: 580 });
  // average sky colour (svg as data: URL so the canvas is not tainted)
  for (const z of zones) {
    const src = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, `zones/${z}/sky.svg`)).toString('base64');
    const avg = await pg.evaluate(s => new Promise(res => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = 96; c.height = 54; const x = c.getContext('2d'); x.drawImage(im, 0, 0, 96, 54); const d = x.getImageData(0, 0, 96, 54).data; const t = [0, 0, 0]; for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) t[k] += d[i + k]; res('#' + t.map(v => Math.round(v / (d.length / 4)).toString(16).padStart(2, '0')).join('')); }; im.src = s; }), src);
    console.log('avg sky', z, avg);
  }
  await br.close(); console.log('rendered', OUT);
})();
