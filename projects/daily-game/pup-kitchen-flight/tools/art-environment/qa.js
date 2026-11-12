// QA for the environment art: seam tests + composed scenes per zone.
// Run: node tools/art-environment/qa.js   (needs playwright; output in tools/art-environment/out/)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const A = path.join(ROOT, 'game', 'assets', 'default');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const files = {};
function load(rel) {
  files[rel] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, rel)).toString('base64');
}
const ZONES = ['sunny', 'rainy', 'windy', 'snowy'];
ZONES.forEach(z => load(`levels/${z}/outside.svg`));
['room/wall.svg', 'room/counter.svg', 'room/curtain.svg', 'room/frost.svg'].forEach(load);
['dust', 'raindrop', 'snowflake', 'steam', 'wind', 'sparkle', 'bit', 'outside_leaf'].forEach(p => load(`particles/${p}.svg`));
const palette = JSON.parse(fs.readFileSync(path.join(A, 'levels/palette.json'), 'utf8'));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<html><body style="margin:0;background:#888"></body></html>');
  const result = await page.evaluate(async ({ files, palette, ZONES }) => {
    const img = {};
    await Promise.all(Object.entries(files).map(([k, src]) => new Promise((res, rej) => {
      const i = new Image(); i.onload = () => { img[k] = i; res(); }; i.onerror = () => rej(k); i.src = src;
    })));
    const out = {};
    const report = {};
    // ---- seam tests
    const seamLayers = [...ZONES.map(z => [`levels/${z}/outside.svg`, 960, 540]),
      ['room/wall.svg', 1200, 540], ['room/counter.svg', 600, 70]];
    for (const [k, w, h] of seamLayers) {
      const c = document.createElement('canvas'); c.width = w * 2; c.height = h;
      const g = c.getContext('2d');
      g.fillStyle = '#ff00ff'; g.fillRect(0, 0, c.width, h);   // magenta shows any transparency
      g.drawImage(img[k], 0, 0, w, h); g.drawImage(img[k], w, 0, w, h);
      // numeric check: mean |diff| across the seam vs. across an ordinary column pair
      const d = g.getImageData(w - 2, 0, 4, h).data;
      let seam = 0, norm = 0, n = 0;
      for (let y = 0; y < h; y++) {
        for (let ch = 0; ch < 3; ch++) {
          const a = d[(y * 4 + 0) * 4 + ch], b = d[(y * 4 + 1) * 4 + ch], cc = d[(y * 4 + 2) * 4 + ch];
          norm += Math.abs(a - b); seam += Math.abs(b - cc); n++;
        }
      }
      report[k] = { seamDiff: +(seam / n).toFixed(2), neighbourDiff: +(norm / n).toFixed(2) };
      // crop a 3x zoom of the seam
      const z = document.createElement('canvas'); z.width = 240 * 3; z.height = h * 3 > 1620 ? 1620 : h * 3;
      const zg = z.getContext('2d'); zg.imageSmoothingEnabled = false;
      zg.drawImage(c, w - 120, 0, 240, z.height / 3, 0, 0, 240 * 3, z.height);
      zg.strokeStyle = 'rgba(255,0,0,0.5)'; zg.beginPath(); zg.moveTo(360, 0); zg.lineTo(360, 12); zg.stroke();
      const name = k.replace(/[\/.]/g, '_');
      out['seam_' + name + '.png'] = c.toDataURL();
      out['seamzoom_' + name + '.png'] = z.toDataURL();
    }
    // ---- composed scenes
    const W = 960, H = 540;
    function tile(g, im, w, h, off, y) {
      let x = -((off % w) + w) % w;
      for (; x < W; x += w) g.drawImage(im, x, y, w, h);
    }
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const zone of ZONES) {
      seed = 7;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d');
      const scroll = 1700;
      tile(g, img[`levels/${zone}/outside.svg`], 960, 540, scroll * 0.08, 0);
      // outside particles
      const op = zone === 'rainy' ? 'raindrop' : zone === 'snowy' ? 'snowflake' : zone === 'windy' ? 'outside_leaf' : null;
      if (op) for (let i = 0; i < 90; i++) {
        const s = zone === 'snowy' ? 8 + rnd() * 16 : zone === 'rainy' ? 18 + rnd() * 12 : 14 + rnd() * 8;
        g.globalAlpha = 0.5 + rnd() * 0.5;
        g.drawImage(img[`particles/${op}.svg`], rnd() * W, rnd() * H, zone === 'rainy' ? s / 3 : s, s);
      }
      g.globalAlpha = 1;
      const wallOff = scroll * 0.35;
      tile(g, img['room/wall.svg'], 1200, 540, wallOff, 0);
      // curtains on window edges (pivots from the report: frame edges x 94 / 506 per window, y 98)
      const wins = [[110, 490], [710, 1090]];
      for (let t = -1; t <= 1; t++) for (const [x0, x1] of wins) {
        const base = t * 1200 - (((wallOff % 1200) + 1200) % 1200);
        for (const px of [x0 - 12, x1 + 12]) {
          const sx = base + px;
          if (sx < -200 || sx > W + 200) continue;
          g.save(); g.translate(sx, 98);
          if (zone === 'windy') g.rotate((px === x0 - 12 ? 1 : -1) * 0.12);
          if (px !== x0 - 12) g.scale(-1, 1);
          g.drawImage(img['room/curtain.svg'], -60, 0, 120, 300); g.restore();
        }
        if (zone === 'snowy') {
          for (const [cx, cy, sx2, sy2] of [[x0, 120, 1, 1], [x1, 120, -1, 1], [x0, 390, 1, -1], [x1, 390, -1, -1]]) {
            g.save(); g.translate(base + cx, cy); g.scale(sx2 * 0.7, sy2 * 0.7);
            g.drawImage(img['room/frost.svg'], 0, 0, 300, 220); g.restore();
          }
        }
      }
      // room particles
      if (zone === 'sunny') for (let i = 0; i < 26; i++) g.drawImage(img['particles/dust.svg'], 300 + rnd() * 500, 100 + rnd() * 300, 10, 10);
      if (zone === 'windy') for (let i = 0; i < 6; i++) g.drawImage(img['particles/wind.svg'], rnd() * W, 120 + rnd() * 300, 120, 16);
      // a steam puff column
      for (let i = 0; i < 5; i++) { g.globalAlpha = 0.9 - i * 0.15; g.drawImage(img['particles/steam.svg'], 760 - i * 4, 380 - i * 50, 50 + i * 12, 50 + i * 12); }
      g.globalAlpha = 1;
      // copper hanger placeholder from the rail
      g.strokeStyle = '#6b6f78'; g.lineWidth = 3; g.beginPath(); g.moveTo(520, 40); g.lineTo(520, 120); g.stroke();
      g.fillStyle = '#c4703c'; g.strokeStyle = '#7a3e1e'; g.lineWidth = 4;
      g.fillRect(480, 120, 80, 90); g.strokeRect(480, 120, 80, 90);
      // a steel stack placeholder on the counter
      g.fillStyle = '#9aa3ad'; g.strokeStyle = '#5c646e'; g.fillRect(620, 380, 110, 90); g.strokeRect(620, 380, 110, 90);
      // hero placeholder
      g.fillStyle = '#2bb3a6'; g.strokeStyle = '#17786f'; g.lineWidth = 4;
      g.beginPath(); g.arc(260, 260, 30, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#fbf1d8'; g.beginPath(); g.arc(270, 266, 13, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#e8463a'; g.fillRect(240, 222, 40, 6);
      // leaves
      g.fillStyle = '#3fbf4a'; for (const [x, y] of [[360, 230], [400, 250], [440, 270]]) { g.beginPath(); g.ellipse(x, y, 18, 12, -0.5, 0, 7); g.fill(); }
      g.drawImage(img['particles/sparkle.svg'], 400, 200, 32, 32);
      g.drawImage(img['particles/bit.svg'], 300, 300, 16, 16);
      // counter
      tile(g, img['room/counter.svg'], 600, 70, scroll, 470);
      // darkness (night) with a lamp hole
      if (zone === 'snowy') {
        const d = document.createElement('canvas'); d.width = W; d.height = H; const dg = d.getContext('2d');
        dg.fillStyle = 'rgba(8,10,30,0.62)'; dg.fillRect(0, 0, W, H);
        dg.globalCompositeOperation = 'destination-out';
        const rg = dg.createRadialGradient(330, 260, 20, 330, 260, 150); rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
        dg.fillStyle = rg; dg.fillRect(0, 0, W, H);
        g.drawImage(d, 0, 0);
      }
      // tint
      const p = palette[zone];
      g.globalCompositeOperation = 'multiply'; g.globalAlpha = p.tintAlpha;
      g.fillStyle = p.tint; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      // banner swatch
      g.fillStyle = p.banner; g.fillRect(380, 470 + 14, 200, 40);
      out[`scene_${zone}.png`] = c.toDataURL();
    }
    // sheets of standalone assets on a checker
    const sheet = document.createElement('canvas'); sheet.width = 960; sheet.height = 360;
    const sg = sheet.getContext('2d');
    for (let y = 0; y < 360; y += 20) for (let x = 0; x < 960; x += 20) { sg.fillStyle = ((x + y) / 20) % 2 ? '#556' : '#778'; sg.fillRect(x, y, 20, 20); }
    sg.drawImage(img['room/curtain.svg'], 10, 20, 120, 300);
    sg.drawImage(img['room/frost.svg'], 150, 20, 300, 220);
    let x = 470;
    for (const p of ['dust', 'raindrop', 'snowflake', 'steam', 'wind', 'sparkle', 'bit', 'outside_leaf']) {
      const im = img[`particles/${p}.svg`]; const s = 3;
      const w = im.naturalWidth || 32, h = im.naturalHeight || 32;
      if (x + w * s > 950) x = 470;
      sg.drawImage(im, x, p === 'wind' || p === 'steam' ? 200 : 30, w * (p === 'wind' || p === 'steam' ? 2 : s), h * (p === 'wind' || p === 'steam' ? 2 : s));
      x += w * s + 14;
    }
    out['sheet.png'] = sheet.toDataURL();
    return { out, report };
  }, { files, palette, ZONES });
  for (const [name, url] of Object.entries(result.out)) {
    fs.writeFileSync(path.join(OUT, name), Buffer.from(url.split(',')[1], 'base64'));
  }
  console.log(JSON.stringify(result.report, null, 1));
  await browser.close();
})();
