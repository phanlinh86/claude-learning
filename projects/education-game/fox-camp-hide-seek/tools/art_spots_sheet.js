// Contact sheets for artist-B hiding places (Pip's Camp Hide & Seek).
//   docs/art/spots_sheet.png    : every kind closed + open at in-game size (220 px wide) on its season's meadow
//                                 (spring/summer/autumn/winter), then the PEEK TEST: an animal friend (0.75 x spot width)
//                                 drawn BEHIND each spot, head top 45 px above peekY, clipped at peekY (as render.js does),
//                                 with a coloured rectangle "hat" placeholder on its head; a thin red line marks peekY
//                                 on the left cell of each pair, and a red tint shows any LEAK (friend pixels below
//                                 peekY that the spot does not cover = background would show through).
//   docs/art/spots_sheet_2x.png : every kind closed + open at 2x (440 px) on its season's meadow.
// Also prints, per file, the measured top contour over the central 50 % and the peek-test leak counts.
// Usage: node tools/art_spots_sheet.js
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const SPOTS = path.join(ROOT, 'game/assets/default/spots');
const ITEMS = path.join(ROOT, 'game/assets/default/items');
const OUT = process.env.OUT || path.join(ROOT, 'docs/art');
const KINDS = ['bush', 'stump', 'tent', 'rock', 'leaves', 'log', 'snowman', 'drift'];
const ANIMALS = ['cat', 'dog', 'cow', 'pig', 'sheep', 'duck', 'lion', 'frog'];
const meta = JSON.parse(fs.readFileSync(path.join(SPOTS, 'spots.json'), 'utf8'));
const uri = (dir, n) => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(dir, n + '.svg')).toString('base64');

const imgs = {};
for (const k of KINDS) { imgs[k] = uri(SPOTS, k); imgs[k + '_open'] = uri(SPOTS, k + '_open'); }
for (const a of ANIMALS) imgs['animal_' + a] = uri(ITEMS, 'animal_' + a);

const RISE = +(process.env.RISE || 45);   // px (in-game, spot 220 wide) the friend's head top sits above peekY
const page = (scale, peek) => `<html><body style="margin:0;background:#fff"><canvas id="c"></canvas><script>
const IM = ${JSON.stringify(imgs)}, META = ${JSON.stringify(meta)}, KINDS = ${JSON.stringify(KINDS)},
  ANIMALS = ${JSON.stringify(ANIMALS)}, SCALE = ${scale}, PEEK = ${peek}, RISE = ${RISE};
const SEASONS = [['#CDEBFB', '#F6F0D8', '#A9CF7F', '#86B262'], ['#8FD0F5', '#E3F4FF', '#9DCB6A', '#7DAE52'],
                 ['#F3D9B5', '#CFE3F0', '#CDB57C', '#AD9460'], ['#C9D9EA', '#F2F6FA', '#EEF3F8', '#CFDAE6']];
const HATS = ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#9B6BE0', '#FF8FC0', '#E84A4A'];
const HATD = ['#A8282E', '#1F5BA8', '#C99A12', '#2A8343', '#C4650C', '#6840A8', '#C9558A', '#A8282E'];
function load(src) { return new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; }); }
function alphaMap(img, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h); return x.getImageData(0, 0, w, h).data;
}
window.run = async () => {
  const I = {}; for (const k in IM) I[k] = await load(IM[k]);
  const report = {};
  // measure the top contour of each spot over x 60..180 at native size
  for (const k in I) if (!k.startsWith('animal')) {
    const a = alphaMap(I[k], 240, 200); let lo = 0, hi = 999;
    for (let x = 60; x <= 180; x++) { let y = 0; while (y < 200 && a[(y * 240 + x) * 4 + 3] < 128) y++; lo = Math.max(lo, y); hi = Math.min(hi, y); }
    report[k] = { topMin: hi, topMax: lo };
  }
  const SW = 220 * SCALE, SH = SW * 200 / 240, s = SW / 240, CELL = SW + 24 * SCALE;
  const PAD = 12 * SCALE, ROWH = SH + 70 * SCALE;
  const rows = [];
  for (let si = 0; si < 4; si++) rows.push({ si, kinds: [KINDS[si * 2], KINDS[si * 2 + 1]] });
  const cv = document.getElementById('c'), ctx = cv.getContext('2d');
  const sections = PEEK ? 2 : 1;
  cv.width = PAD * 2 + CELL * 4; cv.height = rows.length * ROWH * sections + PAD;
  let leaks = {};
  for (let sec = 0; sec < sections; sec++) for (let ri = 0; ri < rows.length; ri++) {
    const { si, kinds } = rows[ri], y0 = (sec * rows.length + ri) * ROWH, S = SEASONS[si];
    const g = ctx.createLinearGradient(0, y0, 0, y0 + ROWH); g.addColorStop(0, S[0]); g.addColorStop(1, S[1]);
    ctx.fillStyle = g; ctx.fillRect(0, y0, cv.width, ROWH);
    const gy = y0 + 22 * SCALE + SH;              // ground line (spot anchor y = 196/200 of its box)
    ctx.fillStyle = S[2]; ctx.fillRect(0, gy - 10 * SCALE, cv.width, ROWH - (gy - 10 * SCALE - y0));
    ctx.fillStyle = S[3]; ctx.fillRect(0, gy - 10 * SCALE, cv.width, 3 * SCALE);
    let ci = 0;
    for (const k of kinds) for (const v of [k, k + '_open']) {
      const x0 = PAD + ci * CELL + 12 * SCALE, top = gy - 196 * s, peekY = top + META[k].peekY * s;
      if (sec === 1) {
        // peek test: friend behind, clipped at peekY
        const n = ri * 4 + ci, an = ANIMALS[n % 8], fsz = 0.75 * SW, fi = I['animal_' + an];
        const fa = alphaMap(fi, 128, 128); let ht = 0; outer: for (; ht < 128; ht++) for (let x = 0; x < 128; x++) if (fa[(ht * 128 + x) * 4 + 3] > 128) break outer;
        let hx0 = 128, hx1 = 0; for (let yy = ht; yy < ht + 14; yy++) for (let x = 0; x < 128; x++) if (fa[(yy * 128 + x) * 4 + 3] > 128) { hx0 = Math.min(hx0, x); hx1 = Math.max(hx1, x); }
        const fy = peekY - RISE * SCALE - ht / 128 * fsz, fx = x0 + SW / 2 - fsz / 2;
        // leak test on an offscreen canvas at this scale
        const off = document.createElement('canvas'); off.width = cv.width; off.height = ROWH * 3; const ox = off.getContext('2d');
        ox.drawImage(fi, fx, fy - y0 + ROWH, fsz, fsz); const fd = ox.getImageData(0, 0, off.width, off.height).data;
        ox.clearRect(0, 0, off.width, off.height); ox.drawImage(I[v], x0, top - y0 + ROWH, SW, SH); const sd = ox.getImageData(0, 0, off.width, off.height).data;
        let leak = 0; const py = Math.ceil(peekY - y0 + ROWH);
        ctx.save();
        for (let yy = py; yy < off.height; yy++) for (let xx = Math.floor(fx); xx < fx + fsz; xx++) {
          const i = (yy * off.width + xx) * 4; if (fd[i + 3] > 128 && sd[i + 3] < 200) { leak++; }
        }
        leaks[v] = (leaks[v] || []).concat([an + ':' + leak]);
        ctx.save(); ctx.beginPath(); ctx.rect(0, y0, cv.width, peekY - y0); ctx.clip();
        ctx.drawImage(fi, fx, fy, fsz, fsz);
        const hw = (hx1 - hx0) / 128 * fsz * 0.7, hcx = fx + (hx0 + hx1) / 256 * fsz, hty = fy + ht / 128 * fsz;
        ctx.fillStyle = HATS[n % 8]; ctx.strokeStyle = HATD[n % 8]; ctx.lineWidth = 4 * SCALE;
        ctx.beginPath(); ctx.roundRect(hcx - hw / 2, hty - 4 * SCALE, hw, 0.18 * fsz, 10 * SCALE); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(hcx, hty - 8 * SCALE, 9 * SCALE, 0, 7); ctx.fill(); ctx.stroke();
        ctx.restore(); ctx.restore();
      }
      ctx.drawImage(I[v], x0, top, SW, SH);
      if (sec === 1 && leaks[v] && +leaks[v][leaks[v].length - 1].split(':')[1] > 30) {
        ctx.strokeStyle = 'rgba(255,0,0,.9)'; ctx.lineWidth = 4; ctx.strokeRect(x0, top, SW, SH);
      }
      if (v === k && sec === 1) { ctx.fillStyle = 'rgba(255,0,0,.55)'; ctx.fillRect(x0 - 6 * SCALE, peekY, 10 * SCALE, 2); }
      ci++;
    }
  }
  return { report, leaks };
};
</script></body></html>`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  for (const [file, scale, peek] of [['spots_sheet.png', 1, true], ['spots_sheet_2x.png', 2, false]]) {
    const p = await b.newPage({ viewport: { width: 1200, height: 800 } });   // fresh page: globals are const
    await p.setContent(page(scale, peek));
    const res = await p.evaluate(() => window.run());
    const el = await p.$('#c');
    await el.screenshot({ path: path.join(OUT, file) });
    console.log('wrote', path.join(OUT, file));
    if (peek) {
      for (const k of KINDS) for (const v of [k, k + '_open']) {
        const r = res.report[v], warn = (v === k && Math.abs(r.topMax - meta[k].peekY) > 2) ? '  <-- peekY ' + meta[k].peekY + ' differs' :
          (r.topMax > meta[k].peekY + 2 ? '  <-- open top dips below peekY' : '');
        console.log(v.padEnd(14), 'top over x60..180: min', r.topMin, 'max', r.topMax, ' leak px', res.leaks[v].join(' '), warn);
      }
    }
    await p.close();
  }
  await b.close();
})();
