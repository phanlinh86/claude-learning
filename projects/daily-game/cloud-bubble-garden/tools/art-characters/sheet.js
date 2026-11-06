// Contact sheets + scene preview for Nimbus's Bubble Garden characters/items.
// Usage: node sheet.js [assetDir] [outDir]
// Writes characters_sheet_light.png, characters_sheet_dark.png, characters_scene.png and validates every SVG.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const DIR = process.argv[2] || path.join(__dirname, '../../game/assets/default');
const OUT = process.argv[3] || path.join(__dirname, '../../docs/art');
const NAMES = ['nimbus_0', 'nimbus_1', 'nimbus_happy', 'nimbus_ouch', 'nimbus_rain', 'bubble', 'gem_0', 'gem_1', 'gem_2', 'gem_3', 'gem_4',
  'burr_0', 'burr_1', 'heart', 'heart_empty', 'jar', 'icon'];
const src = n => fs.readFileSync(`${DIR}/${n}.svg`, 'utf8');
const uri = n => 'data:image/svg+xml;base64,' + Buffer.from(src(n)).toString('base64');
// in-game sizes (DESIGN §4.1 at unit 100): hero.r 34 → 85 px (size 1) … 170 px (size 5); bubble r 36 → 72; gem 1.05·r ≈ 38; burr 70
const SIZE = { nimbus: 85, bubble: 72, gem: 38, burr: 70, heart: 28, heart_empty: 28, jar: 44, icon: 64 };
const sz = n => SIZE[n] || SIZE[n.split('_')[0]];
const img = (n, s, st = '') => `<img src="${uri(n)}" width="${s}" height="${s}" style="${st}">`;
const bub = (s, g, st = '') => `<span style="position:relative;display:inline-block;width:${s}px;height:${s}px;${st}">` +
  `<img src="${uri('gem_' + g)}" style="position:absolute;left:${s * 0.237}px;top:${s * 0.237}px" width="${s * 0.525}" height="${s * 0.525}">` +
  `<img src="${uri('bubble')}" style="position:absolute;left:0;top:0" width="${s}" height="${s}"></span>`;
const NIM = ['nimbus_0', 'nimbus_1', 'nimbus_happy', 'nimbus_ouch', 'nimbus_rain'];
const ITEMS = ['gem_0', 'gem_1', 'gem_2', 'gem_3', 'gem_4', 'burr_0', 'burr_1', 'heart', 'heart_empty', 'jar'];
const row = (bg, html, extra = '') => `<div class="p" style="background:${bg};${extra}">${html}</div>`;
const css = `<style>body{margin:0;background:#777}.p{display:flex;flex-wrap:wrap;gap:14px;padding:12px;align-items:center}
.lab{font:12px sans-serif;color:#0008}</style>`;

function sheet(bg, bg2) {
  const inGame = row(bg, NIM.map(n => img(n, 85)).join('') + img('nimbus_0', 170) + [0, 1, 2, 3, 4].map(g => bub(72, g)).join('') +
    ITEMS.map(n => img(n, sz(n))).join('') + img('icon', 32) + img('icon', 64));
  const four = row(bg2, NIM.map(n => img(n, 256, 'outline:1px dashed #0003')).join('')) +
    row(bg2, img('bubble', 288, 'outline:1px dashed #0003') + bub(288, 0) + ['burr_0', 'burr_1'].map(n => img(n, 280, 'outline:1px dashed #0003')).join('')) +
    row(bg2, [0, 1, 2, 3, 4].map(g => img('gem_' + g, 152, 'outline:1px dashed #0003')).join('') + ['heart', 'heart_empty'].map(n => img(n, 112)).join('') + img('jar', 176) + img('icon', 256));
  // animation strip: alternating frames, then all moods side by side
  const strip = row(bg, [0, 1, 0, 1, 0, 1].map(i => img('nimbus_' + i, 120)).join('') + '<span style="width:40px"></span>' + NIM.map(n => img(n, 120)).join(''));
  // anchor check: body centre (64,66) and r 50 circle, bubble r 60, burr r 26/44
  const ov = (n, s, circles) => `<span style="position:relative;display:inline-block;width:${s}px;height:${s}px">${img(n, s)}` +
    `<svg style="position:absolute;left:0;top:0" width="${s}" height="${s}" viewBox="0 0 ${n.startsWith('burr') ? 96 : 128} ${n.startsWith('burr') ? 96 : 128}">` +
    circles.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="red" stroke-width="0.6"/><circle cx="${x}" cy="${y}" r="1" fill="red"/>`).join('') + '</svg></span>';
  const anchors = row(bg2, NIM.map(n => ov(n, 200, [[64, 66, 50]])).join('') + ov('bubble', 200, [[64, 64, 60]]) + ov('burr_0', 200, [[48, 48, 26], [48, 48, 44]]) + ov('burr_1', 200, [[48, 48, 26], [48, 48, 44]]));
  const gray = row(bg, `<div class="p" style="filter:grayscale(1)">${[0, 1, 2, 3, 4].map(g => bub(72, g)).join('')}${img('burr_0', 70)}${img('burr_1', 70)}${img('nimbus_0', 85)}</div>`);
  return inGame + strip + four + anchors + gray;
}
function scene(top, bottom) {
  const W = 960, H = 540;
  const el = (h, x, y, extra = '') => `<div style="position:absolute;left:${x}px;top:${y}px;${extra}">${h}</div>`;
  const nimb = (n, s, x, y, rot = 0) => el(img(n, s), x - s / 2, y - s / 2, `transform:rotate(${rot}deg)`);
  let h = '';
  h += el('', 0, 445, `width:${W}px;height:95px;background:#7fb27a;opacity:0.55`);
  for (let i = 0; i < 26; i++) h += el('', (i * 37) % W, (i * 53) % 420, `width:2px;height:26px;background:#fff;opacity:0.25;transform:rotate(12deg)`);
  [[120, 360, 0, 72], [220, 250, 3, 64], [520, 300, 1, 80], [640, 140, 2, 72], [800, 380, 4, 68], [880, 210, 0, 76], [380, 90, 3, 70]]
    .forEach(([x, y, g, s]) => h += el(bub(s, g), x - s / 2, y - s / 2));
  h += el(img('burr_0', 70), 470, 70, 'transform:rotate(20deg)') + el(img('burr_1', 70), 720, 280, 'transform:rotate(-30deg)');
  h += nimb('nimbus_0', 85, 300, 380, -4) + nimb('nimbus_happy', 127, 420, 230, 6) + nimb('nimbus_ouch', 106, 640, 380) + nimb('nimbus_rain', 170, 120, 150);
  h += el(img('heart', 28) + img('heart', 28) + img('heart_empty', 28), 16, 10, 'display:flex;gap:4px') + el(img('jar', 44), W - 60, 4);
  return `<div style="position:relative;width:${W}px;height:${H}px;overflow:hidden;background:linear-gradient(${top},${bottom})">${h}</div>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1700, height: 400 } });
  // validate: XML parse + rules (no text/fonts/scripts/image/external refs; width/height = viewBox)
  const bad = [];
  for (const n of NAMES) {
    const s = src(n);
    if (/<(text|script|image|foreignObject|style)\b|font|href=|https?:\/\/(?!www\.w3\.org\/2000\/svg)/i.test(s)) bad.push(n + ': forbidden element/ref');
    const m = s.match(/width="(\d+)" height="(\d+)" viewBox="0 0 (\d+) (\d+)"/);
    if (!m || m[1] !== m[3] || m[2] !== m[4]) bad.push(n + ': width/height != viewBox');
    const err = await p.evaluate(t => {
      const d = new DOMParser().parseFromString(t, 'image/svg+xml');
      return d.querySelector('parsererror') ? d.querySelector('parsererror').textContent.slice(0, 200) : null;
    }, s);
    if (err) bad.push(n + ': ' + err);
  }
  if (bad.length) { console.error(bad.join('\n')); process.exitCode = 1; } else console.log('all', NAMES.length, 'SVGs valid');
  const shot = async (html, file, w) => {
    await p.setViewportSize({ width: w, height: 400 });
    await p.setContent(`<html><body>${css}${html}</body></html>`);
    await p.waitForTimeout(400);
    await p.screenshot({ path: path.join(OUT, file), fullPage: true });
    console.log(path.join(OUT, file));
  };
  await shot(sheet('#dff1f7', '#cfe7f3'), 'characters_sheet_light.png', 1700);
  await shot(sheet('#34407a', '#202a5c'), 'characters_sheet_dark.png', 1700);
  await shot(`<div class="p" style="background:#555">${scene('#8fc9ef', '#dff1f7')}${scene('#141c46', '#34407a')}${scene('#c9b4e6', '#ffd3c4')}${scene('#7a5aa8', '#ffb07a')}</div>`, 'characters_scene.png', 1960);
  await b.close();
})();
