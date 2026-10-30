// Visual QA for Puff's Volcano Catch environment art.
// Renders docs/art/zones_sheet.png (each zone composed in draw order with stand-in Puff / coins / rock,
// clouds offset by 300 px so the tile seam sits at x = 300, plus a two-tile clouds seam strip)
// and docs/art/particles_sheet.png (each particle at 1x and 4x on light and dark backgrounds).
// Usage: node sheet.js [assetsDir] [docsArtDir]
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = process.argv[2] || path.join(__dirname, '../../game/assets/default');
const OUT = process.argv[3] || path.join(__dirname, '../../docs/art');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'puff-env-'));
fs.mkdirSync(OUT, { recursive: true });
const zones = ['beach', 'jungle', 'ash', 'crater'];
const abs = (x, y, w, h, css) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${css}"></div>`;
const disc = (x, y, r, fill, stroke, sw = 3) => abs(x - r, y - r, 2 * r, 2 * r, `box-sizing:border-box;border-radius:50%;background:${fill};border:${sw}px solid ${stroke}`);
function scene(z) {
  const d = `file://${A}/zones/${z}`;
  const img = (n, x = 0, y = 0, w = 960, h = 540) => `<img src="${d}/${n}.svg" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px">`;
  let h = `<div style="position:relative;width:960px;height:540px;overflow:hidden">` + img('sky');
  // clouds strip drawn at y 20, offset by 300 px: seam at x = 300
  h += img('clouds', 300 - 960, 20, 960, 220) + img('clouds', 300, 20, 960, 220);
  h += img('volcano');
  // stand-ins: flying coins (gold / silver / copper) and a sizzly rock in the play band
  const items = [[300, 340, 'gold'], [620, 360, 'silver'], [760, 420, 'copper'], [200, 300, 'gold'], [540, 300, 'copper'], [420, 440, 'silver']];
  const col = { gold: ['#f6c63a', '#a8761a'], silver: ['#d6dde6', '#7a8696'], copper: ['#d9844a', '#8a4a22'] };
  for (const [x, y, k] of items) h += disc(x, y, 15, `radial-gradient(circle at 40% 35%,#fff8 0 20%,${col[k][0]} 22%)`, col[k][1]);
  for (const [x, y] of [[380, 330], [860, 400]]) h += abs(x - 25, y - 25, 50, 50, 'border-radius:50%;background:radial-gradient(#ff8a3a99,#ff8a3a00 70%)') + disc(x, y, 17, '#4a2c36', '#2a161c') ;
  // Puff stand-ins: white cloud circle + basket
  for (const [x, main] of [[480, 1], [130, 0], [840, 0]]) {
    h += disc(x, 392, main ? 40 : 30, 'radial-gradient(circle at 40% 35%,#fff 0 55%,#d8d4f4 80%)', '#9a94c8');
    h += abs(x - 34, 434, 68, 26, 'box-sizing:border-box;border-radius:6px 6px 18px 18px;background:#c98e4e;border:3px solid #7a5028');
  }
  h += img('ground');
  // HUD mock (hearts, score)
  h += [0, 1, 2].map(i => abs(16 + i * 34, 16, 28, 26, 'background:#ff4f6d;border:3px solid #8a1830;border-radius:50% 50% 50% 50%/60% 60% 40% 40%;box-sizing:border-box')).join('');
  h += `<div style="position:absolute;left:400px;top:12px;width:160px;text-align:center;font:900 30px Arial;color:#fff;-webkit-text-stroke:2px #3a2a5a">1250 x3</div>`;
  h += abs(299, 20, 2, 10, 'background:#f0f') + abs(299, 230, 2, 10, 'background:#f0f'); // seam marker
  h += `<div style="position:absolute;left:8px;bottom:6px;font:700 14px Arial;color:#fff;-webkit-text-stroke:.6px #000">${z}</div>`;
  return h + '</div>';
}
function seamStrip(z) {
  const d = `file://${A}/zones/${z}`;
  // two tiles side by side at half size over the zone sky; seam at centre
  return `<div style="position:relative;width:960px;height:120px;overflow:hidden;background:url(${d}/sky.svg) 0 0/960px 540px">` +
    `<img src="${d}/clouds.svg" style="position:absolute;left:0;top:5px;width:480px;height:110px"><img src="${d}/clouds.svg" style="position:absolute;left:480px;top:5px;width:480px;height:110px">` +
    abs(479, 0, 2, 6, 'background:#f0f') + abs(479, 114, 2, 6, 'background:#f0f') + '</div>';
}
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  const go = async (body, file, vp) => { fs.writeFileSync(TMP + '/t.html', `<html><body style="margin:0;background:#fff">${body}</body></html>`); await pg.setViewportSize(vp); await pg.goto('file://' + TMP + '/t.html'); await pg.waitForTimeout(300); await pg.screenshot({ path: file }); };
  const cell = z => `<div>${scene(z)}<div style="height:6px"></div>${seamStrip(z)}</div>`;
  const sheet = '<div style="display:grid;grid-template-columns:960px 960px;gap:12px;padding:12px;background:#fff">' + zones.map(cell).join('') + '</div>';
  await go(sheet, path.join(OUT, 'zones_sheet.png'), { width: 1956, height: 2 * (540 + 6 + 120) + 36 });
  for (const z of zones) await go(scene(z), path.join(TMP, z + '.png'), { width: 960, height: 540 });
  const pl = ['smoke', 'ember', 'ash', 'leaf', 'sparkle', 'rain', 'steam', 'firefly', 'butterfly', 'star'];
  const row = bg => `<div style="display:flex;gap:12px;align-items:center;background:${bg};padding:10px">` + pl.map(p => `<div style="display:flex;flex-direction:column;align-items:center;gap:6px"><img src="file://${A}/particles/${p}.svg" style="width:128px;height:128px;outline:1px dashed rgba(128,128,128,.4)"><img src="file://${A}/particles/${p}.svg" style="width:32px;height:32px"></div>`).join('') + '</div>';
  const ps = `<div style="background:#fff;padding:10px">${row('#eef4f8')}${row('#7cc8e0')}${row('#1c2758')}<div style="display:flex;gap:96px;padding:6px 10px;font:700 13px Arial">${pl.map(p => `<span style="width:44px">${p}</span>`).join('')}</div></div>`;
  await go(ps, path.join(OUT, 'particles_sheet.png'), { width: 1440, height: 610 });
  await br.close(); console.log('rendered', OUT, 'singles in', TMP);
})();
