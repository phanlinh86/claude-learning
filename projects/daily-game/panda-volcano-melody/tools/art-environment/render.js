// QA renders for the environment art. Usage: node tools/art-environment/render.js
// Writes scratch PNGs to tools/art-environment/out/ and the sheets to docs/art/.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const A = path.join(ROOT, 'game', 'assets', 'default');
const OUT = path.join(__dirname, 'out');
const DOC = path.join(ROOT, 'docs', 'art');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(DOC, { recursive: true });
const url = (p) => 'file://' + path.join(A, p);
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

// plausible prop layouts (ground points), similar to what the mechanics engineer will choose
const LAYOUT = {
  spring: [['palm', 170, 210], ['bush', 790, 230], ['rock', 230, 440], ['bush', 735, 455]],
  summer: [['palm', 160, 200], ['palm', 810, 215], ['rock', 760, 455], ['bush', 220, 450], ['bush', 640, 160]],
  autumn: [['palm', 820, 190], ['rock', 170, 230], ['bush', 255, 455], ['bush', 760, 440]],
  winter: [['palm', 150, 215], ['rock', 800, 210], ['bush', 790, 455], ['rock', 230, 460], ['bush', 330, 160]],
};
const PROP = { palm: [96, 120], rock: [70, 56], bush: [80, 64] };

function img(src, x, y, w, h, extra = '') {
  return `<img src="${src}" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${extra}">`;
}
function shadow(x, y, rx, ry) {
  return `<div style="position:absolute;left:${x - rx}px;top:${y - ry}px;width:${2 * rx}px;height:${2 * ry}px;border-radius:50%;background:rgba(30,40,20,.22)"></div>`;
}

function scene(season) {
  const items = [];
  // volcano: 216x180, base centre (120,190)*0.9 at (480,330)
  items.push([330, img(url(`props/volcano${season === 'winter' ? '_winter' : ''}.svg`), 480 - 108, 330 - 171, 216, 180)]);
  for (const [k, x, y] of LAYOUT[season]) {
    const [w, h] = PROP[k];
    items.push([y, img(url(`props/${k}_${season}.svg`), x - w / 2, y - h, w, h)]);
  }
  const chars = [];
  // Tofu (feet 60,114 of 120 -> *0.6), crabs (50,76 of 100 -> *0.56), notes, mango
  const tofu = [480, 470];
  chars.push(shadow(tofu[0], tofu[1], 20, 6));
  items.push([tofu[1], img(url('tofu_idle.svg'), tofu[0] - 36, tofu[1] - 68.4, 72, 72)]);
  for (const [x, y] of [[330, 400], [640, 260], [120, 330]]) {
    chars.push(shadow(x, y, 20, 5));
    items.push([y, img(url('crab_1.svg'), x - 28, y - 42.6, 56, 45)]);
  }
  const notes = [[380, 470], [600, 420], [320, 300], [660, 340], [420, 150], [880, 330], [80, 470], [560, 500]];
  notes.forEach(([x, y], i) => {
    chars.push(shadow(x, y + 14, 10, 3.5));
    items.push([y + 14, img(url(`note_${i % 4}.svg`), x - 20, y - 20, 40, 40)]);
  });
  chars.push(shadow(700, 380, 10, 3.5));
  items.push([380, img(url('mango.svg'), 700 - 18, 366 - 18, 36, 36)]);
  items.sort((a, b) => a[0] - b[0]);
  const coco = img(url('coco_1.svg'), 540 - 32, 420 - 60 - 26, 64, 53);
  chars.push(shadow(540, 420, 18, 5));
  return `<div style="position:relative;width:960px;height:540px;overflow:hidden">
    ${img(url(`levels/${season}/ground.svg`), 0, 0, 960, 540)}
    ${chars.join('')}${items.map((i) => i[1]).join('')}${coco}
    <div style="position:absolute;left:14px;top:12px;width:206px;height:38px;border-radius:19px;background:${pal[season].hud};opacity:.9"></div>
    <div style="position:absolute;left:680px;top:12px;width:170px;height:38px;border-radius:19px;background:${pal[season].hud};opacity:.9"></div>
  </div>`;
}
const pal = JSON.parse(fs.readFileSync(path.join(A, 'levels', 'palette.json'), 'utf8'));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const shot = async (html, w, h, file) => {
    await page.setViewportSize({ width: w, height: h });
    const tmp = path.join(OUT, '_page.html');
    fs.writeFileSync(tmp, `<html><body style="margin:0;background:#888">${html}</body></html>`);
    await page.goto('file://' + tmp);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
    await page.screenshot({ path: file });
  };

  // 1) sea seam: 3x3 tiles, and ground with sea tiles around it
  await shot(`<div style="width:720px;height:720px;background:url(${url('levels/sea.svg')}) 0 0/240px 240px repeat"></div>`,
    720, 720, path.join(OUT, 'sea_3x3.png'));
  await shot(`<div style="position:relative;width:1200px;height:780px;background:url(${url('levels/sea.svg')}) 0 0/240px 240px repeat">
      ${img(url('levels/summer/ground.svg'), 120, 120, 960, 540)}</div>`, 1200, 780, path.join(OUT, 'sea_ground_edge.png'));

  // edge-pixel check: every border pixel of each ground must equal the flat sea colour
  for (const s of SEASONS) {
    await shot(img(url(`levels/${s}/ground.svg`), 0, 0, 960, 540), 960, 540, path.join(OUT, `ground_${s}.png`));
    const b64 = fs.readFileSync(path.join(OUT, `ground_${s}.png`)).toString('base64');
    const res = await page.evaluate(async ({ src, sea }) => {
      const im = new Image(); im.src = src; await im.decode();
      const c = document.createElement('canvas'); c.width = 960; c.height = 540;
      const g = c.getContext('2d'); g.drawImage(im, 0, 0, 960, 540);
      const want = [1, 3, 5].map((i) => parseInt(sea.slice(i, i + 2), 16));
      const data = g.getImageData(0, 0, 960, 540).data;
      let bad = 0; let worst = 0;
      const chk = (x, y) => {
        const o = (y * 960 + x) * 4;
        const e = Math.max(...want.map((v, i) => Math.abs(v - data[o + i])));
        if (e > 2) bad++; worst = Math.max(worst, e);
      };
      for (let x = 0; x < 960; x++) { chk(x, 0); chk(x, 1); chk(x, 538); chk(x, 539); }
      for (let y = 0; y < 540; y++) { chk(0, y); chk(1, y); chk(958, y); chk(959, y); }
      return { bad, worst };
    }, { src: 'data:image/png;base64,' + b64, sea: pal[s].sea });
    console.log('edge check', s, JSON.stringify(res));
  }

  // 2) composed scenes
  for (const s of SEASONS) await shot(scene(s), 960, 540, path.join(OUT, `scene_${s}.png`));
  // environment sheet: 2x2 composed seasons
  await shot(`<div style="display:grid;grid-template-columns:960px 960px;gap:12px;padding:12px;background:#203038;width:1932px">
      ${SEASONS.map(scene).join('')}</div>`, 1956, 1116, path.join(DOC, 'environment_sheet.png'));

  // props close-up sheet (2x scale) for detail review
  const propRow = (s) => `<div style="display:flex;gap:18px;align-items:flex-end;padding:10px;background:${'#a8cc8c'}">
      ${['volcano', 'palm', 'rock', 'bush'].map((k) => {
        const f = k === 'volcano' ? `props/volcano${s === 'winter' ? '_winter' : ''}.svg` : `props/${k}_${s}.svg`;
        const [w, h] = k === 'volcano' ? [216, 180] : PROP[k];
        return `<img src="${url(f)}" style="width:${w * 2}px;height:${h * 2}px;background:rgba(255,255,255,.12)">`;
      }).join('')}</div>`;
  await shot(`<div style="background:#203038;padding:8px;display:grid;gap:8px">${SEASONS.map(propRow).join('')}</div>`,
    1400, 1640, path.join(OUT, 'props_2x.png'));

  // 3) particle sheet: each sprite at 1x and 3x on light and dark tiles
  const P = { blossom: [20, 20], butterfly: [24, 20], sunmote: [16, 16], leaf: [20, 20], snowflake: [24, 24],
    smoke: [64, 64], dust: [32, 32], sparkle: [32, 32], spark: [12, 12], ripple: [48, 24] };
  const cells = Object.entries(P).map(([k, [w, h]]) => `<div style="display:flex;flex-direction:column;align-items:center;gap:6px">
      <div style="width:200px;height:200px;display:flex;align-items:center;justify-content:center;gap:12px;background:#98c47c;border-radius:12px">
        <img src="${url(`particles/${k}.svg`)}" style="width:${w}px;height:${h}px">
        <img src="${url(`particles/${k}.svg`)}" style="width:${w * 3}px;height:${h * 3}px"></div>
      <div style="width:200px;height:110px;display:flex;align-items:center;justify-content:center;gap:12px;background:${pal.spring.sea};border-radius:12px">
        <img src="${url(`particles/${k}.svg`)}" style="width:${w * 2}px;height:${h * 2}px">
        <div style="width:40px;height:40px;border-radius:8px;background:#cfdbe5;display:flex;align-items:center;justify-content:center"><img src="${url(`particles/${k}.svg`)}" style="width:${w}px;height:${h}px"></div></div>
    </div>`).join('');
  await shot(`<div style="display:grid;grid-template-columns:repeat(5,200px);gap:16px;padding:16px;background:#203038;width:1064px">${cells}</div>`,
    1096, 680, path.join(DOC, 'particles_sheet.png'));
  await browser.close();
})();
