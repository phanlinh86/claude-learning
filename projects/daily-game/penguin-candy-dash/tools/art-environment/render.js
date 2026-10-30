// Visual QA for Pip's Candy Dash environment: per-biome 960x540 composites (ground + zone + stand-in
// entities + edge + HUD mock), a 2x2 biomes sheet and a particles sheet.
// Usage: node render.js [assetsDir] [outDir] [sheetDir]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const A = process.argv[2] || path.join(__dirname, '../../game/assets/default');
const OUT = process.argv[3] || '/tmp/claude-0/candy-env/out';
const SHEET = process.argv[4] || null; // e.g. ../../docs/art
fs.mkdirSync(OUT, { recursive: true });
const biomes = ['meadow', 'river', 'clouds', 'glacier'];
// stand-in positions: Pip incl. ON each biome's zones, bears, gems
const PIP = { meadow: [[200, 300], [480, 420], [880, 500]], river: [[330, 330], [480, 320], [200, 200]], clouds: [[300, 210], [640, 390], [480, 460]], glacier: [[290, 220], [700, 400], [480, 300]] };
const BEARS = [[560, 180, '#e8473f', '#9a1f1a'], [150, 430, '#4cc35a', '#1f7a2c'], [760, 300, '#ff9a2e', '#a85508']];
const GEMS = [[420, 150, '#ff5fa8'], [240, 300, '#3fa6ff'], [600, 260, '#ffd23a'], [820, 460, '#3fd07a'], [700, 170, '#ff5fa8'], [380, 470, '#3fa6ff']];
const abs = (x, y, w, h, css) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${css}"></div>`;
function scene(b) {
  const d = `file://${A}/biomes/${b}`; const img = n => `<img src="${d}/${n}.svg" style="position:absolute;left:0;top:0;width:960px;height:540px">`;
  let h = `<div style="position:relative;width:960px;height:540px;overflow:hidden">` + img('ground');
  if (b !== 'meadow') h += img('zone');
  // gate stand-in (90x120 bottom-anchored at y=360)
  h += abs(855, 240, 90, 120, 'box-sizing:border-box;border:10px solid #fff;border-bottom:none;border-radius:45px 45px 0 0;background:repeating-linear-gradient(45deg,transparent 0 8px,rgba(230,50,80,.0) 8px 16px);outline:0;box-shadow:inset 0 0 0 3px #e03a5a,0 0 0 3px #e03a5a');
  const ents = [];
  for (const [x, y] of PIP[b]) ents.push([y, abs(x - 24, y - 6, 48, 12, 'border-radius:50%;background:rgba(40,20,60,.25)') + abs(x - 24, y - 50, 48, 48, 'border-radius:50%;box-sizing:border-box;border:3px solid #10152e;background:radial-gradient(circle at 60% 60%,#fff2dc 0 38%,#1f2a52 40%)')]);
  for (const [x, y, c, k] of BEARS) ents.push([y, abs(x - 22, y - 6, 44, 12, 'border-radius:50%;background:rgba(40,20,60,.25)') + abs(x - 22, y - 46, 44, 44, `border-radius:45% 45% 40% 40%;box-sizing:border-box;border:3px solid ${k};background:${c};opacity:.92`)]);
  for (const [x, y, c] of GEMS) ents.push([y, abs(x - 11, y - 11, 22, 22, `transform:rotate(45deg);background:${c};border:2.5px solid rgba(0,0,0,.45);border-radius:4px`)]);
  h += ents.sort((a, z) => a[0] - z[0]).map(e => e[1]).join('');
  h += img('edge');
  // HUD mock
  h += [0, 1, 2].map(i => abs(16 + i * 34, 16, 28, 26, 'background:#ff4f6d;border:3px solid #8a1830;border-radius:50% 50% 50% 50%/60% 60% 40% 40%;box-sizing:border-box')).join('');
  h += `<div style="position:absolute;left:400px;top:12px;width:160px;text-align:center;font:900 32px Arial;color:#fff;-webkit-text-stroke:2px #5a2a5a">1250</div>`;
  h += abs(890, 8, 44, 55, 'box-sizing:border-box;border:3px solid #6a5a8a;border-radius:10px;background:linear-gradient(to top,#ff8fc0 40%,rgba(255,255,255,.6) 40%)');
  return h + '</div>';
}
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage({ viewport: { width: 960, height: 540 } });
  const go = async (body, file, vp) => { fs.writeFileSync(OUT + '/tmp.html', `<html><body style="margin:0;background:#222">${body}</body></html>`); await pg.setViewportSize(vp); await pg.goto('file://' + OUT + '/tmp.html'); await pg.waitForTimeout(250); await pg.screenshot({ path: file }); };
  for (const b of biomes) await go(scene(b), `${OUT}/${b}.png`, { width: 960, height: 540 });
  const sheet = '<div style="display:grid;grid-template-columns:960px 960px;gap:8px;padding:8px;background:#fff">' + biomes.map(scene).join('') + '</div>';
  await go(sheet, `${OUT}/biomes_sheet.png`, { width: 1936, height: 1096 });
  const pl = ['sparkle', 'sugar', 'floss', 'sprinkle_pink', 'sprinkle_blue', 'sprinkle_yellow', 'ripple', 'snowflake', 'star'];
  const bgs = ['#cdeed8', '#ecd6bb', '#8b4e2f', '#f6e8f7', '#fdf4e3', '#d3effc'];
  const ps = '<div style="background:#fff;padding:10px">' + bgs.map(bg => `<div style="display:flex;gap:10px;background:${bg};padding:10px">` + pl.map(p => `<div style="width:96px;height:96px;outline:1px dashed rgba(0,0,0,.2)"><img src="file://${A}/particles/${p}.svg" style="width:96px;height:96px"></div>`).join('') + '</div>').join('') +
    '<div style="display:flex;gap:10px;padding:10px;background:#93d9ab">' + pl.map(p => `<img src="file://${A}/particles/${p}.svg" style="width:32px;height:32px;margin:0 32px">`).join('') + '</div></div>';
  await go(ps, `${OUT}/particles_sheet.png`, { width: 1000, height: 762 });
  if (SHEET) { fs.mkdirSync(SHEET, { recursive: true }); for (const n of ['biomes_sheet.png', 'particles_sheet.png']) fs.copyFileSync(`${OUT}/${n}`, path.join(SHEET, n)); }
  await br.close(); console.log('rendered', OUT);
})();
