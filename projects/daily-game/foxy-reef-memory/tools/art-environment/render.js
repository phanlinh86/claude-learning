// Visual QA for the reef environment: per-season 960x540 composites with stand-in cards/fox,
// zoomed seam panels, a 2x2 seasons sheet and a particles sheet.
// Usage: node render.js [assetsDir] [outDir]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const A = process.argv[2] || path.join(__dirname, '../../game/assets/default');
const OUT = process.argv[3] || '/tmp/claude-0/reef-env/out';
fs.mkdirSync(OUT, { recursive: true });
const seasons = ['spring', 'summer', 'autumn', 'winter'];
// suggested tray backing per season (also reported to the renderer team)
const TRAY = { spring: 'rgba(12,70,88,0.30)', summer: 'rgba(10,72,110,0.28)', autumn: 'rgba(52,40,22,0.32)', winter: 'rgba(8,14,44,0.38)' };
const parts = { spring: ['plankton', 'fish_a', 'fish_b', 'bubble', 'plankton', 'fish_a'], summer: ['fish_a', 'bubble', 'fish_b', 'bubble', 'sparkle', 'fish_a'],
  autumn: ['kelp_bit', 'bubble', 'kelp_bit', 'plankton', 'kelp_bit', 'bubble'], winter: ['snow', 'jelly_a', 'snow', 'jelly_b', 'snow', 'snow'] };
const grids = { spring: [4, 3], summer: [4, 4], autumn: [5, 4], winter: [6, 4] };
function layer(src, top, h, shift) { return [0, 960, 1920].map(o => `<img src="${src}" style="position:absolute;left:${o - shift}px;top:${top}px;width:960px;height:${h}px">`).join(''); }
function scene(s, opt = {}) {
  const d = `file://${A}/seasons/${s}`; const mo = opt.mid ?? 700, fo = opt.far ?? 300;
  let h = `<div style="position:relative;width:960px;height:540px;overflow:hidden">`;
  h += `<img src="${d}/water.svg" style="position:absolute;left:0;top:0">`;
  h += layer(`${d}/far.svg`, 0, 540, fo) + layer(`${d}/mid.svg`, 0, 540, mo) + layer(`${d}/floor.svg`, 450, 90, opt.floor ?? 450);
  h += `<img src="${d}/rays.svg" style="position:absolute;left:0;top:0;mix-blend-mode:plus-lighter">`;
  // tray + stand-in cards
  h += `<div style="position:absolute;left:${585 - 277}px;top:${298 - 211}px;width:554px;height:422px;border-radius:22px;background:${TRAY[s]};box-shadow:inset 0 0 0 2px rgba(255,255,255,.18)"></div>`;
  const [cols, rows] = grids[s]; const gx = 94, gy = 108;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const cx = 585 + (i - (cols - 1) / 2) * gx, cy = 298 + (j - (rows - 1) / 2) * gy; const front = (i + j * 3) % 5 === 0;
    h += `<div style="position:absolute;left:${cx - 42}px;top:${cy - 49}px;width:84px;height:98px;border-radius:12px;box-sizing:border-box;border:3px solid ${front ? '#c9a46a' : '#3a6f84'};background:${front ? '#fff4dc' : 'linear-gradient(160deg,#5cc6c4,#a99ae6)'};box-shadow:0 3px 0 rgba(0,0,0,.18)"></div>`;
  }
  h += `<div style="position:absolute;left:${130 - 50}px;top:${280 - 42}px;width:100px;height:84px;border-radius:50%;background:#ff8a3d;border:3px solid #9a4a14"></div>`;
  h += `<div style="position:absolute;left:${130 - 6}px;top:${280 - 50}px;width:70px;height:70px;border-radius:50%;border:3px solid rgba(255,255,255,.8);background:rgba(220,245,255,.18)"></div>`;
  parts[s].forEach((p, k) => { const x = 40 + k * 150 + (k % 2) * 40, y = 70 + ((k * 137) % 330), sz = 26 + (k % 3) * 8; h += `<img src="file://${A}/particles/${p}.svg" style="position:absolute;left:${x}px;top:${y}px;width:${sz}px;height:${sz}px">`; });
  return h + '</div>';
}
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 960, height: 540 } });
  const html = body => `<html><body style="margin:0;background:#222">${body}</body></html>`;
  const go = async (body, file, vp) => { fs.writeFileSync(OUT + '/tmp.html', html(body)); await pg.setViewportSize(vp); await pg.goto('file://' + OUT + '/tmp.html'); await pg.waitForTimeout(200); await pg.screenshot({ path: file }); };
  for (const s of seasons) await go(scene(s), `${OUT}/${s}.png`, { width: 960, height: 540 });
  for (const s of seasons) await go(scene(s, { mid: 0, far: 0, floor: 0 }), `${OUT}/${s}_off0.png`, { width: 960, height: 540 });
  // seam test: 2 copies side by side, 2x zoom window centred on the seam (red tick marks the seam)
  for (const s of seasons) {
    const d = `file://${A}/seasons/${s}`;
    const panels = [['far', 280, 200, 540], ['mid', 150, 330, 540], ['floor', 0, 90, 90]];
    let body = '<div style="display:flex;flex-wrap:wrap;width:960px;background:#333">';
    for (const [l, y0, hh, H] of panels) {
      body += `<div style="position:relative;width:480px;height:${hh * 2}px;overflow:hidden;background:#4a8aa0">` +
        `<div style="position:absolute;left:0;top:0;transform:scale(2);transform-origin:0 0">` +
        [0, 960].map(o => `<img src="${d}/${l}.svg" style="position:absolute;left:${o - 840}px;top:${-y0}px;width:960px;height:${H}px">`).join('') +
        `</div><div style="position:absolute;left:239px;top:0;width:2px;height:8px;background:red"></div></div>`;
    }
    body += '</div>';
    await go(body, `${OUT}/seam_${s}.png`, { width: 960, height: 1040 });
  }
  let sheet = '<div style="display:grid;grid-template-columns:960px 960px;gap:8px;padding:8px;background:#fff">' + seasons.map(s => scene(s)).join('') + '</div>';
  await go(sheet, `${OUT}/seasons_sheet.png`, { width: 1936, height: 1096 });
  const pl = ['bubble', 'plankton', 'fish_a', 'fish_b', 'kelp_bit', 'jelly_a', 'jelly_b', 'sparkle', 'snow'];
  const bgs = ['#4fcfd2', '#22a6d4', '#c9a15c', '#25387a', '#9beee6'];
  let ps = '<div style="background:#fff;padding:10px">' + bgs.map(bg => `<div style="display:flex;gap:10px;background:${bg};padding:10px">` + pl.map(p => `<div style="width:96px;height:96px;outline:1px dashed rgba(0,0,0,.2)"><img src="file://${A}/particles/${p}.svg" style="width:96px;height:96px"></div>`).join('') + '</div>').join('') +
    '<div style="display:flex;gap:10px;padding:10px;background:#2a9db4">' + pl.map(p => `<img src="file://${A}/particles/${p}.svg" style="width:32px;height:32px;margin:0 32px">`).join('') + '</div></div>';
  await go(ps, `${OUT}/particles_sheet.png`, { width: 1000, height: 660 });
  await b.close(); console.log('rendered', OUT);
})();
