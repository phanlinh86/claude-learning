// Contact sheets for artist-B polar-animal stickers + home badges (Tuk's Ice Match).
//   docs/art/animals_sheet.png    : 70 px and 128 px rows on light ice / snow / dark, plus a block test
//                                   (each sticker at 70 px inside a 104 px clear-ice block, as on the board)
//                                   and the home pairing row (animal next to its home at 70 px)
//   docs/art/animals_sheet_3x.png : 3x (384 px) on ice / snow / dark
// Usage: node tools/art_animals_sheet.js          (render sheets)
//        node tools/art_animals_sheet.js --fit    (print suggested FIT values for tools/art_animals.py)
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'game/assets/default/items');
const OUT = path.join(ROOT, 'docs/art');
const ANIMALS = ['bear', 'seal', 'fox', 'owl', 'whale', 'puffin', 'penguin', 'hare', 'walrus'].map(n => 'animal_' + n);
const HOMES = ['den', 'floe', 'burrow', 'nest', 'sea', 'cliff', 'pebbles'].map(n => 'home_' + n);
const PAIRS = [['bear', 'den'], ['seal', 'floe'], ['fox', 'burrow'], ['owl', 'nest'], ['whale', 'sea'],
  ['puffin', 'cliff'], ['penguin', 'pebbles']];
const ALL = ANIMALS.concat(HOMES);
const BGS = { ice: '#DDF1FB', snow: '#F4F8FB', dark: '#24324a' };

function src(n) { return fs.readFileSync(path.join(DIR, n + '.svg'), 'utf8'); }
function uri(n) { return 'data:image/svg+xml;base64,' + Buffer.from(src(n)).toString('base64'); }

function row(bg, size, names, cols) {
  return `<div style="background:${bg};display:grid;grid-template-columns:repeat(${cols},${size + 8}px);gap:4px;padding:8px">` +
    names.map(n => `<img src="${uri(n)}" width="${size}" height="${size}">`).join('') + '</div>';
}

// block test: a 104 px clear-ice block (DESIGN §3 colours) with the picture at 70 px and a 12 % white glaze
function block(n) {
  return `<div style="position:relative;width:104px;height:114px">` +
    `<div style="position:absolute;left:0;top:10px;width:104px;height:104px;border-radius:17px;background:#9CCBE3;border:2px solid #6FA7C8"></div>` +
    `<div style="position:absolute;left:0;top:0;width:104px;height:104px;border-radius:17px;box-sizing:border-box;` +
    `background:linear-gradient(135deg,#F4FBFF,#DDF1FB 30%,#BFE3F5);border:2px solid #6FA7C8;display:flex;align-items:center;justify-content:center">` +
    `<img src="${uri(n)}" width="70" height="70" style="filter:saturate(.94)"></div>` +
    `<div style="position:absolute;left:0;top:0;width:104px;height:104px;border-radius:17px;background:#fff;opacity:.12"></div></div>`;
}

function blockRow(names) {
  return `<div style="background:#CFE6F2;display:flex;flex-wrap:wrap;gap:10px;padding:12px">` + names.map(block).join('') + '</div>';
}

function pairRow() {
  return `<div style="background:#CFE6F2;display:flex;flex-wrap:wrap;gap:22px;padding:12px">` +
    PAIRS.map(([a, h]) => `<div style="display:flex;gap:2px">${block('animal_' + a)}${block('home_' + h)}</div>`).join('') + '</div>';
}

function html(body) { return `<html><body style="margin:0;background:#fff">${body}</body></html>`; }

async function fit(p) {
  // measure the sticker silhouette (#<name>_sil) in untransformed SVG space; + 7 px border all round, + 3 px shadow
  const out = {};
  for (const n of ANIMALS) {
    const raw = src(n).replace(/<g transform="translate\([^)]*\) scale\([^)]*\)">/, '<g>');
    await p.setContent(html(raw));
    const bb = await p.evaluate(id => {
      const g = document.getElementById(id); const b = g.getBBox();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    }, n.slice(7) + '_sil');
    const x0 = bb.x - 7, y0 = bb.y - 7, w = bb.w + 14, h = bb.h + 17;
    const k = Math.min(1.12, 120 / w, 120 / h);
    // scale about (64, 64), then shift so the box is centred in the frame
    const cx = x0 + w / 2, cy = y0 + h / 2;
    const dx = 64 - (64 + (cx - 64) * k), dy = 64 - (64 + (cy - 64) * k);
    out[n.slice(7)] = [+k.toFixed(3), +dx.toFixed(1), +dy.toFixed(1)];
  }
  console.log('FIT = {' + Object.entries(out).map(([k, v]) => `'${k}': (${v.join(', ')})`).join(', ') + '}');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1340, height: 400 } });
  if (process.argv.includes('--fit')) { await fit(p); await b.close(); return; }
  let main = '';
  for (const c of Object.values(BGS)) main += row(c, 70, ALL, 16) + row(c, 128, ANIMALS, 9) + row(c, 128, HOMES, 9);
  main += blockRow(ALL) + pairRow();
  let big = '';
  const bg = Object.values(BGS);
  for (let i = 0; i < ALL.length; i += 3) big += row(bg[(i / 3) % 3], 384, ALL.slice(i, i + 3), 3);
  for (const [file, body] of [['animals_sheet.png', main], ['animals_sheet_3x.png', big]]) {
    await p.setContent(html(body));
    await p.waitForTimeout(250);
    await p.screenshot({ path: path.join(OUT, file), fullPage: true });
    console.log('wrote', file);
  }
  await b.close();
})();
