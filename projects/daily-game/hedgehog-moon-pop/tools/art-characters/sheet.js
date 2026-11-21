// Contact sheets for Bristle's Moon Pop characters/items.
// Usage: node sheet.js [assetDir] [outDir]
// Writes docs/art/characters_sheet_light.png, characters_sheet_dark.png, characters_scene.png
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const DIR = process.argv[2] || path.join(__dirname, '../../game/assets/default');
const OUTD = process.argv[3] || path.join(__dirname, '../../docs/art');
const cache = {};
const uri = n => cache[n] || (cache[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(`${DIR}/${n}.svg`).toString('base64'));
const HOGS = ['skate', 'push', 'jump', 'happy', 'bonk'].map(n => 'bristle_' + n);
const ITEMS = ['bristle_ball', 'board', 'bubble', 'cupcake_pink', 'cupcake_mint', 'cupcake_lemon', 'magnet', 'pebble', 'pebble_2', 'crater',
  'heart_full', 'heart_empty', 'box', 'jump', 'icon'];
// in-game drawn sizes (DESIGN §4.1 / render.js: board 0.62 scale, bubble film r30 → 64.9 px)
const BOARD_K = 0.62, FILM = 80 * 30 / 37;
const SIZE = { bristle: [96, 80], bristle_ball: [76, 76], board: [120 * BOARD_K, 40 * BOARD_K], bubble: [FILM, FILM], cupcake: [36, 36], magnet: [34, 34],
  pebble: [40, 40], pebble_2: [40, 40], crater: [96, 32], heart: [28, 28], box: [46, 40], jump: [28, 28], icon: [64, 64] };
const sz = n => SIZE[n] || SIZE[n.split('_')[0]];
const img = (n, s = 1, st = '') => { const [w, h] = sz(n); return `<img src="${uri(n)}" width="${f(w * s)}" height="${f(h * s)}" style="${st}">`; };
const f = v => Math.round(v * 10) / 10;
const BG = { light: '#e8e4f4', noon: '#b9c3e8', dark: '#141a3c' };

// item inside a bubble, as render.js draws it (content at drawn size centred, film over it)
function inBubble(item, s = 1) {
  const W = 80, [iw, ih] = sz(item);
  return `<svg width="${W * s}" height="${W * s}" viewBox="0 0 ${W} ${W}">
<image href="${uri(item)}" x="${f(40 - iw / 2)}" y="${f(40 - ih / 2)}" width="${iw}" height="${ih}"/>
<image href="${uri('bubble')}" x="${f(40 - FILM / 2)}" y="${f(40 - FILM / 2)}" width="${f(FILM)}" height="${f(FILM)}"/></svg>`;
}
// Bristle on the board, as render.js composes it: body centre (x,y); board deck top at the feet line y + 32.
function onBoard(frame, s = 1, guides = false) {
  const W = 130, H = 110, x = 65, y = 52;
  const bw = 120 * BOARD_K, bh = 40 * BOARD_K;
  return `<svg width="${W * s}" height="${H * s}" viewBox="0 0 ${W} ${H}">
<image href="${uri('board')}" x="${f(x - 60 * BOARD_K)}" y="${f(y + 32 - 10 * BOARD_K)}" width="${f(bw)}" height="${f(bh)}"/>
<image href="${uri(frame)}" x="${x - 48}" y="${f(y - 43.2)}" width="96" height="80"/>
${guides ? `<circle cx="${x}" cy="${y}" r="1.6" fill="red"/><path d="M0,${y + 32} H${W}" stroke="#f00" stroke-width=".5" opacity=".6"/><path d="M0,${f(y + 32 + 28 * BOARD_K)} H${W}" stroke="#00f" stroke-width=".5" opacity=".6"/>` : ''}
</svg>`;
}
const row = (bg, html) => `<div class="p" style="background:${bg}">${html}</div>`;
const label = (t, c) => `<div style="font:600 13px sans-serif;color:${c};width:100%">${t}</div>`;
function sheet(bgs) {
  return bgs.map(bg => {
    const c = bg === BG.dark ? '#cfd6ff' : '#333';
    return row(bg, label('drawn size', c) + HOGS.map(n => img(n)).join('') + ITEMS.map(n => img(n)).join('') + img('icon', 0.5)
      + ['cupcake_pink', 'cupcake_mint', 'cupcake_lemon', 'magnet'].map(n => inBubble(n)).join(''))
      + row(bg, label('4x', c) + HOGS.map(n => img(n, 4)).join(''))
      + row(bg, ['bristle_ball', 'bubble', 'cupcake_pink', 'cupcake_mint', 'cupcake_lemon', 'magnet', 'pebble', 'pebble_2'].map(n => img(n, n === 'bristle_ball' || n === 'bubble' ? 3 : 4)).join(''))
      + row(bg, ['board', 'crater', 'heart_full', 'heart_empty', 'box', 'jump'].map(n => img(n, 4)).join('') + inBubble('cupcake_pink', 3) + inBubble('magnet', 3));
  }).join('');
}
function scene() {
  const out = [];
  for (const [k, bg] of Object.entries(BG)) {
    const c = bg === BG.dark ? '#cfd6ff' : '#333';
    out.push(row(bg, label(`${k}: frames strip (drawn) · ball 0/90/180° · bubbles · on board`, c)
      + HOGS.map(n => img(n)).join('')
      + [0, 90, 180].map(a => img('bristle_ball', 1, `transform:rotate(${a}deg)`)).join('')
      + ['cupcake_pink', 'cupcake_mint', 'cupcake_lemon', 'magnet'].map(n => inBubble(n)).join('')
      + HOGS.map(n => onBoard(n)).join('') + img('pebble') + img('pebble_2') + img('crater')));
  }
  out.push(row(BG.noon, label('2x on board with anchor guides (red: body centre + feet line / deck top; blue: wheel bottoms)', '#333')
    + HOGS.map(n => onBoard(n, 2, true)).join('') + [0, 90, 180].map(a => img('bristle_ball', 2, `transform:rotate(${a}deg)`)).join('')));
  out.push(row(BG.dark, HOGS.map(n => onBoard(n, 2)).join('') + `<img src="${uri('icon')}" width="256" height="256"><img src="${uri('icon')}" width="32" height="32">`));
  return out.join('');
}
const css = `<style>body{margin:0;background:#777}.p{display:flex;flex-wrap:wrap;gap:12px;padding:10px;align-items:center}</style>`;

// keep the PNGs small: 256-colour palette via Pillow when it is available (otherwise leave the full-colour PNG)
function shrink(file) {
  const py = "import sys;from PIL import Image;im=Image.open(sys.argv[1]).convert('RGB');" +
    "im.quantize(256,method=Image.Quantize.FASTOCTREE,dither=Image.Dither.NONE).save(sys.argv[1],optimize=True)";
  try { require('child_process').execFileSync('python3', ['-c', py, file], { stdio: 'ignore' }); } catch (e) { console.warn('shrink skipped:', e.message); }
}
async function shot(b, name, body, width = 1500) {
  const p = await b.newPage({ viewport: { width, height: 400 }, deviceScaleFactor: 1 });
  await p.setContent(`<html><body>${css}${body}</body></html>`);
  await p.waitForTimeout(400);
  const out = path.join(OUTD, name);
  await p.screenshot({ path: out, fullPage: true });
  await p.close();
  shrink(out);
  console.log(out, Math.round(fs.statSync(out).size / 1024) + ' KB');
}
(async () => {
  fs.mkdirSync(OUTD, { recursive: true });
  const b = await chromium.launch();
  await shot(b, 'characters_sheet_light.png', sheet([BG.light, BG.noon]));
  await shot(b, 'characters_sheet_dark.png', sheet([BG.dark]));
  await shot(b, 'characters_scene.png', scene());
  await b.close();
})();
