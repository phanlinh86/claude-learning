// Visual QA for Bristle's Moon Pop environment art. Renders into docs/art/ (JPEG-compressed PNG-named files are
// avoided: composed scenes are PNG at deviceScaleFactor 1; anything that would exceed 400 KB is written as JPEG):
//   env_<zone>.png     sky → far → haze at y 140 (offset 300 px, wrapped) → ground, plus stand-ins:
//                      white-rimmed bubbles (with pink/mint/lemon cupcake dots) at y 200 / 320 / 430, a lilac-grey pebble,
//                      a chestnut hedgehog blob + coral board at (480, 446), a crater on the floor, HUD pills (palette hud)
//   env_seams.png      haze tiled 3x per zone with the seams marked (magenta ticks), plus a 3x zoom at one seam
//   env_particles.png  every particle at 4x and 1x on a light and a dark background
//   env_portrait.png   the 4 zones as a 560x1200 portrait frame: scene bottom-anchored, skyTop filling above
// Prints the average sky colour and top-row colour per zone (for palette.json "sky"/"skyTop").
// Usage: node sheet.js [assetsDir] [docsArtDir]
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = process.argv[2] || path.join(__dirname, '../../game/assets/default');
const OUT = process.argv[3] || path.join(__dirname, '../../docs/art');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hmp-env-'));
fs.mkdirSync(OUT, { recursive: true });
const zones = ['dawn', 'noon', 'sunset', 'night'];
const PALJ = JSON.parse(fs.readFileSync(path.join(A, 'zones/palette.json'), 'utf8'));
const abs = (x, y, w, h, css) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${css}"></div>`;
function bubble(x, y, cup) {
  return abs(x - 12, y - 10, 24, 22, `border-radius:50% 50% 40% 40%;background:${cup};border:2px solid #0003;box-sizing:border-box`) +
    abs(x - 31, y - 31, 62, 62, 'border-radius:50%;border:1px solid rgba(91,106,160,.35);box-sizing:border-box') +
    abs(x - 30, y - 30, 60, 60, 'border-radius:50%;background:rgba(255,255,255,.07);border:3px solid rgba(255,255,255,.9);box-shadow:inset 0 0 0 2px rgba(255,190,230,.45);box-sizing:border-box') +
    abs(x - 20, y - 22, 16, 10, 'border-radius:50%;background:rgba(255,255,255,.75);transform:rotate(-35deg)');
}
function stand(z) {
  let h = '';
  h += bubble(200, 430, '#ff9cc4') + bubble(330, 320, '#8fe0c0') + bubble(640, 200, '#ffe27a') + bubble(780, 380, '#ff9cc4') + bubble(120, 260, '#8fe0c0');
  // lilac-grey pebble
  h += abs(560 - 20, 300 - 18, 40, 36, 'border-radius:50% 50% 45% 45%;background:#aaa3c2;border:3px solid #6e6890;box-sizing:border-box');
  // crater (vent) on the floor
  h += abs(380 - 48, 492 - 22, 96, 24, 'border-radius:50%;background:#b4adc4;border:3px solid #8a83a2;box-sizing:border-box');
  // hedgehog: chestnut body + cream face + coral board with mint wheels
  h += abs(480 - 40, 446 - 36, 80, 70, 'border-radius:50% 45% 40% 50%;background:#8a5a3c;border:3px solid #5a3420;box-sizing:border-box');
  h += abs(488, 424, 34, 40, 'border-radius:50%;background:#f6dcc0;border:2px solid #b08060;box-sizing:border-box');
  h += abs(480 - 46, 478, 92, 9, 'border-radius:5px;background:#e8604c;border:2px solid #9a3424;box-sizing:border-box');
  h += abs(446, 485, 10, 10, 'border-radius:50%;background:#7fe0c4') + abs(506, 485, 10, 10, 'border-radius:50%;background:#7fe0c4');
  // HUD pills
  const hud = PALJ[z].hud;
  h += abs(14, 12, 120, 40, `border-radius:20px;background:${hud}d9`) + [0, 1, 2].map(i => abs(26 + i * 34, 20, 26, 24, 'background:#ff4f6d;border:2px solid #fff;border-radius:50% 50% 50% 50%/60% 60% 40% 40%;box-sizing:border-box')).join('');
  h += `<div style="position:absolute;left:400px;top:12px;width:160px;height:40px;border-radius:20px;background:${hud}d9;text-align:center;font:900 28px/40px Arial;color:#fff">1250 ×3</div>`;
  h += `<div style="position:absolute;left:330px;top:150px;width:300px;height:56px;border-radius:28px;background:${PALJ[z].banner};text-align:center;font:900 30px/56px Arial;color:#fff;opacity:.9">${z.toUpperCase()}</div>`;
  h += abs(0, 250, 4, 230, 'background:#f0f8') + abs(956, 250, 4, 230, 'background:#f0f8'); // play band marker
  return h;
}
function layers(z, hazeOff = 300, extraHaze = 0) {
  const d = `file://${A}/zones/${z}`;
  const img = (n, x = 0, y = 0, w = 960, h = 540, css = '') => `<img src="${d}/${n}.svg" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${css}">`;
  let h = img('sky') + img('far');
  for (let k = 0; k <= extraHaze; k++) { const y = 140 - 230 * k, op = k ? 0.6 : 1; h += img('haze', hazeOff - 960, y, 960, 220, `opacity:${op}`) + img('haze', hazeOff, y, 960, 220, `opacity:${op}`); }
  return h + img('ground');
}
const scene = z => `<div style="position:relative;width:960px;height:540px;overflow:hidden">${layers(z)}${stand(z)}</div>`;
function seams(z) {
  const d = `file://${A}/zones/${z}/haze.svg`, bg = '#20223a';
  const row = `<div style="position:relative;width:2880px;height:220px;background:#333">` + [0, 1, 2].map(i => `<div style="position:absolute;left:${i * 960}px;top:0;width:960px;height:220px;background:${bg}"></div><img src="${d}" style="position:absolute;left:${i * 960}px;top:0;width:960px;height:220px">`).join('') +
    [960, 1920].map(x => abs(x - 2, 0, 4, 14, 'background:#f0f') + abs(x - 2, 206, 4, 14, 'background:#f0f')).join('') + '</div>';
  const zoom = `<div style="position:relative;width:600px;height:660px;overflow:hidden"><div style="position:absolute;left:0;top:0;width:200px;height:220px;transform:scale(3);transform-origin:0 0;background:${bg.replace('0 -140px', '-860px -140px')}">` +
    `<img src="${d}" style="position:absolute;left:-860px;top:0;width:960px;height:220px"><img src="${d}" style="position:absolute;left:100px;top:0;width:960px;height:220px"></div>` + abs(298, 0, 4, 14, 'background:#f0f') + '</div>';
  return `<div style="display:flex;gap:8px;align-items:flex-start"><div style="transform:scale(0.5);transform-origin:0 0;width:1440px;height:110px">${row}</div>${'' /* keep layout */}</div>` +
    `<div style="font:700 14px Arial;margin:2px 0">${z} (3 tiles, seams at magenta)</div>`;
}
function portrait(z) {
  const VW = 560, VH = 1200, SX = (VW - 960) / 2, SY = VH - 540;
  return `<div style="position:relative;flex:0 0 auto;width:${VW}px;height:${VH}px;overflow:hidden;background:${PALJ[z].skyTop}">` +
    `<div style="position:absolute;left:${SX}px;top:${SY}px;width:960px;height:540px">${layers(z, 300, 2)}${stand(z)}</div>` +
    `<div style="position:absolute;left:8px;top:8px;font:700 18px Arial;color:#fff;-webkit-text-stroke:.6px #000">${z} portrait</div></div>`;
}
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage({ deviceScaleFactor: 1 });
  const go = async (body, file, vp) => {
    fs.writeFileSync(TMP + '/t.html', `<html><body style="margin:0;background:#fff">${body}</body></html>`);
    await pg.setViewportSize(vp); await pg.goto('file://' + TMP + '/t.html'); await pg.waitForTimeout(500);
    await pg.screenshot({ path: file });
    if (fs.statSync(file).size > 400 * 1024) { // re-encode as JPEG (still named .png? no: keep the PNG name but JPEG data is confusing) → write JPEG bytes
      const buf = await pg.screenshot({ type: 'jpeg', quality: 82 }); fs.writeFileSync(file, buf);
      if (buf.length > 400 * 1024) { const b2 = await pg.screenshot({ type: 'jpeg', quality: 65 }); fs.writeFileSync(file, b2); }
    }
    console.log(path.basename(file), (fs.statSync(file).size / 1024).toFixed(0) + ' KB');
  };
  for (const z of zones) await go(scene(z), path.join(OUT, `env_${z}.png`), { width: 960, height: 540 });
  // seams: each zone's haze tiled 3x (half scale) over its sky band + one 3x zoom at a seam
  const zooms = zones.map(z => { const d = `file://${A}/zones/${z}/haze.svg`; const bg = '#20223a';
    return `<div style="position:relative;width:600px;height:330px;overflow:hidden;display:inline-block;margin-right:6px"><div style="position:absolute;left:0;top:0;width:200px;height:220px;transform:scale(3,1.5);transform-origin:0 0;background:${bg}"><img src="${d}" style="position:absolute;left:-860px;top:0;width:960px;height:220px"><img src="${d}" style="position:absolute;left:100px;top:0;width:960px;height:220px"></div>${abs(298, 0, 4, 14, 'background:#f0f')}${abs(298, 316, 4, 14, 'background:#f0f')}</div>`; }).join('');
  await go(`<div style="padding:8px">${zones.map(seams).join('')}<div style="font:700 14px Arial">3x zoom at the seam (dawn, noon, sunset, night)</div><div style="white-space:nowrap">${zooms}</div></div>`, path.join(OUT, 'env_seams.png'), { width: 2440, height: 4 * 132 + 380 });
  const pl = ['sparkle', 'twinkle', 'dust', 'droplet', 'mote', 'shoot', 'spark', 'star', 'crumb'];
  const row = bg => `<div style="display:flex;gap:12px;align-items:center;background:${bg};padding:10px">` + pl.map(p => `<div style="display:flex;flex-direction:column;align-items:center;gap:6px"><img src="file://${A}/particles/${p}.svg" style="width:128px;height:128px;outline:1px dashed rgba(128,128,128,.4)"><img src="file://${A}/particles/${p}.svg" style="width:32px;height:32px"></div>`).join('') + '</div>';
  await go(`<div style="background:#fff;padding:10px">${row('#d8d4f0')}${row('#1d2558')}</div>`, path.join(OUT, 'env_particles.png'), { width: 1300, height: 420 });
  await go(`<div style="display:flex;gap:10px;padding:10px;width:2290px;background:#fff;transform:scale(0.5);transform-origin:0 0">${zones.map(portrait).join('')}</div>`, path.join(OUT, 'env_portrait.png'), { width: 1150, height: 615 });
  // average sky colour and top-row colour (svg as data: URL so the canvas is not tainted)
  for (const z of zones) {
    const src = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, `zones/${z}/sky.svg`)).toString('base64');
    const res = await pg.evaluate(s => new Promise(ok => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = 960; c.height = 540; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const avg = (y0, y1) => { const d = x.getImageData(0, y0, 960, y1 - y0).data, t = [0, 0, 0]; for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) t[k] += d[i + k]; return '#' + t.map(v => Math.round(v / (d.length / 4)).toString(16).padStart(2, '0')).join(''); }; ok([avg(0, 540), avg(0, 2), avg(250, 480)]); }; im.src = s; }), src);
    console.log('sky', z, 'avg', res[0], 'top', res[1], 'playband', res[2]);
  }
  await br.close(); console.log('rendered', OUT);
})();
