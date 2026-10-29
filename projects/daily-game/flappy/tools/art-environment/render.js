// Renders composite scenes, seam tests and sheets with Playwright.
const { chromium } = require('playwright');
const fs = require('fs');
const A = process.argv[2] || '/home/claude/claude-learning/projects/daily-game/flappy/game/assets/default';
const OUT = process.argv[3] || '/tmp/claude-0/art-env/out';
fs.mkdirSync(OUT, { recursive: true });
const seasons = ['spring', 'summer', 'autumn', 'winter'];
const parts = { spring: ['petal', 'blossom', 'butterfly_a', 'petal', 'butterfly_b', 'blossom'], summer: ['butterfly_a', 'seed', 'butterfly_b', 'seed', 'butterfly_a'], autumn: ['leaf_red', 'leaf_orange', 'leaf_yellow', 'leaf_red', 'leaf_orange', 'leaf_yellow'], winter: ['snowflake', 'snowflake', 'snowflake', 'snowflake', 'snowflake', 'snowflake'] };
function layer(src, top, h, shift) { return [0, 960, 1920].map(o => `<img src="${src}" style="position:absolute;left:${o - shift}px;top:${top}px;width:960px;height:${h}px">`).join(''); }
function scene(s, i) {
  const d = `file://${A}/seasons/${s}`;
  let h = `<div style="position:relative;width:960px;height:540px;overflow:hidden">`;
  h += `<img src="${d}/sky.svg" style="position:absolute;left:0;top:0">`;
  h += layer(`${d}/clouds.svg`, 0, 540, 130) + layer(`${d}/far.svg`, 0, 540, 300) + layer(`${d}/mid.svg`, 0, 540, 700) + layer(`${d}/ground.svg`, 460, 80, 450);
  // stand-in characters: bird blob, strawberry, turtle blob (to judge readability)
  h += `<div style="position:absolute;left:225px;top:200px;width:70px;height:56px;border-radius:50%;background:#ffc23a;border:3px solid #8a5a10"></div>`;
  h += `<div style="position:absolute;left:250px;top:300px;width:24px;height:28px;border-radius:50% 50% 50% 50%/40% 40% 60% 60%;background:#e8323c;border:2px solid #8a1a1e"></div>`;
  h += `<div style="position:absolute;left:520px;top:418px;width:110px;height:52px;border-radius:55px 55px 8px 8px;background:#5cb85c;border:3px solid #2d4a1e"></div>`;
  parts[s].forEach((p, k) => { const x = 120 + k * 140, y = 60 + ((k * 97) % 300), sz = 22 + (k % 3) * 8; h += `<img src="file://${A}/particles/${p}.svg" style="position:absolute;left:${x}px;top:${y}px;width:${sz}px;height:${sz}px;transform:rotate(${k * 40}deg)">`; });
  return h + '</div>';
}
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 960, height: 540 } });
  const html = body => `<html><body style="margin:0;background:#222">${body}</body></html>`;
  const go = async (body, file, vp) => { fs.writeFileSync(OUT + '/tmp.html', html(body)); await pg.setViewportSize(vp); await pg.goto('file://' + OUT + '/tmp.html'); await pg.waitForTimeout(150); await pg.screenshot({ path: file }); };
  for (const s of seasons) await go(scene(s), `${OUT}/${s}.png`, { width: 960, height: 540 });
  // seam test: 2 copies side by side, 2x zoom window centred on the seam (tick marks seam)
  for (const s of seasons) {
    const d = `file://${A}/seasons/${s}`;
    const panels = [['clouds', 30, 200, 540], ['far', 250, 230, 540], ['mid', 330, 150, 540], ['ground', 0, 80, 80]];
    let body = '<div style="display:flex;flex-wrap:wrap;width:960px;background:#333">';
    for (const [l, y0, hh, H] of panels) {
      body += `<div style="position:relative;width:480px;height:${hh * 2}px;overflow:hidden;background:#89b">` +
        `<div style="position:absolute;left:0;top:0;transform:scale(2);transform-origin:0 0">` +
        [0, 960].map(o => `<img src="${d}/${l}.svg" style="position:absolute;left:${o - 840}px;top:${-y0}px;width:960px;height:${H}px">`).join('') +
        `</div><div style="position:absolute;left:239px;top:0;width:2px;height:6px;background:red"></div></div>`;
    }
    body += '</div>';
    await go(body, `${OUT}/seam_${s}.png`, { width: 960, height: 660 });
  }
  // seasons sheet 2x2
  let sheet = '<div style="display:grid;grid-template-columns:960px 960px;gap:8px;padding:8px;background:#fff">' + seasons.map(s => scene(s)).join('') + '</div>';
  await go(sheet, `${OUT}/seasons_sheet.png`, { width: 1936, height: 1096 });
  // particles sheet
  const pl = ['petal', 'blossom', 'leaf_red', 'leaf_orange', 'leaf_yellow', 'snowflake', 'butterfly_a', 'butterfly_b', 'seed'];
  const bgs = ['#b4e3f6', '#8acb73', '#f8cfa0', '#e6e6f4'];
  let ps = '<div style="background:#fff;padding:10px">' + bgs.map(bg => `<div style="display:flex;gap:10px;background:${bg};padding:10px">` + pl.map(p => `<div style="width:96px;height:96px;display:flex;align-items:center;justify-content:center;outline:1px dashed rgba(0,0,0,.15)"><img src="file://${A}/particles/${p}.svg" style="width:96px;height:96px"></div>`).join('') + '</div>').join('') + '<div style="display:flex;gap:10px;padding:10px;background:#fff">' + pl.map(p => `<img src="file://${A}/particles/${p}.svg" style="width:32px;height:32px;margin:0 32px">`).join('') + '</div></div>';
  await go(ps, `${OUT}/particles_sheet.png`, { width: 1000, height: 540 });
  await b.close(); console.log('rendered');
})();
