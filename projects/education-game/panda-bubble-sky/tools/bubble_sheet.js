// Bao's Bubble Sky — contact sheets for PB.BubbleArt (game/js/bubble_art.js) → docs/art/bubble_*.png
// Usage: node tools/bubble_sheet.js [name ...]       (Playwright + the preinstalled Chromium; no install)
//   bubble_toys.png      5 toys × 7 colours inside bubbles at in-game size (d = 150), one band per season sky
//   bubble_shapes.png    8 shapes in mixed colours, in bubbles, 4 skies
//   bubble_stars.png     stars n = 1–12 (free size, and the round-uniform maxN = 12 / 5 size), 4 skies
//   bubble_tiles.png     tiles (letters, sums, numbers) + 12 animals (images if present, else placeholders), 4 skies
//   bubble_fx.png        wobble frames, grow frames, pop frames, glow, frost, alpha, wiggle, count highlight, small (big:false),
//                        drops, mini bubbles, snowflakes
//   bubble_rainbow.png   rainbow at k = 1, 2, 3 with partial fills (guide), shine sweep, faded
//   bubble_icons.png     Talk-time icons, home badges, hint hand presses
//   bubble_round.png     mock rounds on each season sky (what the child sees)
//   bubble_*_3x.png      toys / shapes / stars / tiles at 3× (d = 450)
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs/art');
const ART = fs.readFileSync(path.join(ROOT, 'game/js/bubble_art.js'), 'utf8');
const ANDIR = path.join(ROOT, 'game/assets/default/animals');

function pageSheet({ name }) {
  const A = window.PB.BubbleArt;
  const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  const SKY = {
    spring: ['#CFE6FA', '#FCEFF4', '#3A4A6A'], summer: ['#86C9F0', '#E2F5FF', '#1E3A5A'],
    autumn: ['#F3C28F', '#FCEBD3', '#5A3A1E'], winter: ['#B7C8E4', '#EEF2F9', '#2E3A5A']
  };
  const SEAS = ['spring', 'summer', 'autumn', 'winter'];
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  function size(w, h, bg) { cv.width = w; cv.height = h; g.fillStyle = bg || '#F4F1EA'; g.fillRect(0, 0, w, h); }
  function sky(x, y, w, h, s) { const c = SKY[s], gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, c[0]); gr.addColorStop(1, c[1]); g.fillStyle = gr; g.fillRect(x, y, w, h); }
  function label(t, x, y, s, col) { g.save(); g.font = '700 ' + (s || 12) + 'px system-ui, sans-serif'; g.fillStyle = col || '#3A3640'; g.textAlign = 'center'; g.fillText(t, x, y); g.restore(); }
  // a bubble with its thing, the way render.js should draw it: back film → thing → front shine
  function bub(x, y, r, th, bo, to) {
    g.save(); g.translate(x, y);
    A.drawBubble(g, r, Object.assign({ part: 'back' }, bo || {}));
    if (th && !(bo && bo.pop)) A.drawThing(g, th, r * (th.kind === 'stars' ? 1.55 : 1.2), to || {});   // integrator: stars at 1.55·r, others 1.2·r
    A.drawBubble(g, r, Object.assign({ part: 'front' }, bo || {}));
    g.restore();
  }
  const lab = t => !t ? '' : t.kind === 'toy' ? t.color + ' ' + t.obj : t.kind === 'shape' ? t.color + ' ' + t.shape : t.kind === 'stars' ? t.n + ' star' + (t.n > 1 ? 's' : '') : t.kind === 'tile' ? '"' + t.text + '"' : t.animal;

  const sets = {
    toys: () => { const r = []; A.TOYS.forEach(o => COLORS.forEach(c => r.push({ kind: 'toy', obj: o, color: c }))); return { list: r, cols: 7 }; },
    shapes: () => ({ list: A.SHAPES.map((s, i) => ({ kind: 'shape', shape: s, color: COLORS[(i * 3) % 7] })).concat(A.SHAPES.map((s, i) => ({ kind: 'shape', shape: s, color: COLORS[(i * 3 + 4) % 7] }))), cols: 8 }),
    stars: () => ({ list: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => ({ kind: 'stars', n })), cols: 12, opt: (t, row) => row % 2 ? { maxN: t.n <= 5 ? 5 : 12 } : {} }),
    tiles: () => ({ list: ['A', 'a', 'M', 'g', 'Q', '3+2', '7−4', '14+6', '10+10', '9', '20'].map(text => ({ kind: 'tile', text })).concat(A.ANIMALS.map(a => ({ kind: 'animal', animal: a }))), cols: 12 })
  };

  if (sets[name]) {
    const S = sets[name](), list = S.list, cols = S.cols, cw = 172, rh = 196, rows = Math.ceil(list.length / cols);
    const bands = name === 'stars' ? SEAS.reduce((a, s) => a.concat([[s, 0], [s, 1]]), []) : SEAS.map(s => [s, 0]);
    size(cw * cols, rh * rows * bands.length);
    bands.forEach((bd, bi) => {
      const oy = bi * rh * rows;
      sky(0, oy, cv.width, rh * rows, bd[0]);
      list.forEach((t, i) => {
        const x = cw * (i % cols) + cw / 2, y = oy + rh * Math.floor(i / cols) + 88;
        bub(x, y, 75, t, { t: i * 0.7, wob: 0 }, S.opt ? S.opt(t, bd[1]) : {});
        label(lab(t), x, y + 98, 11, SKY[bd[0]][2]);
      });
      label(bd[0] + (name === 'stars' ? (bd[1] ? ' · maxN uniform' : ' · free size') : ''), 70, oy + 14, 12, SKY[bd[0]][2]);
    });
  } else if (/_3x$/.test(name)) {
    const base = name.replace('_3x', '');
    let list = sets[base]().list;
    if (base === 'toys') list = A.TOYS.map((o, i) => ({ kind: 'toy', obj: o, color: COLORS[i] })).concat([{ kind: 'toy', obj: 'duck', color: 'yellow' }]);
    if (base === 'shapes') list = A.SHAPES.slice(0, 8).map((s, i) => ({ kind: 'shape', shape: s, color: COLORS[i % 7] }));
    if (base === 'stars') list = [1, 3, 5, 7, 10, 12].map(n => ({ kind: 'stars', n }));
    if (base === 'tiles') list = [{ kind: 'tile', text: 'A' }, { kind: 'tile', text: '7−4' }, { kind: 'tile', text: '10+10' }, { kind: 'animal', animal: 'penguin' }, { kind: 'animal', animal: 'cow' }, { kind: 'animal', animal: 'fishbowl' }];
    const r = 225, cw = 500, rh = 500, cols = 3, rows = Math.ceil(list.length / cols);
    size(cw * cols, rh * rows);
    list.forEach((t, i) => {
      const s = SEAS[i % 4], x0 = cw * (i % cols), y0 = rh * Math.floor(i / cols);
      sky(x0, y0, cw, rh, s);
      bub(x0 + cw / 2, y0 + rh / 2 - 10, r, t, { t: i * 1.3, frost: s === 'winter' ? 0.8 : 0 }, {});
      label(lab(t) + ' · ' + s, x0 + cw / 2, y0 + rh - 10, 14, SKY[s][2]);
    });
  } else if (name === 'fx') {
    const duck = { kind: 'toy', obj: 'duck', color: 'yellow' }, ball = { kind: 'toy', obj: 'ball', color: 'red' };
    const V = [
      ['wob 0', ball, {}], ['wob .15 a0', ball, { wob: 0.15 }], ['wob .3 a0', ball, { wob: 0.3 }], ['wob .3 a=π/2', ball, { wob: 0.3, wobA: Math.PI / 2 }],
      ['wob .2 a=π/4', ball, { wob: 0.2, wobA: Math.PI / 4 }], ['wob −.2', ball, { wob: -0.2 }],
      ['grow .2', null, { grow: 0.2 }, 0.4], ['grow .6', null, { grow: 0.6 }, 0.75], ['grow 1', duck, { grow: 1 }],
      ['pop .05', duck, { pop: 0.05 }], ['pop .15', duck, { pop: 0.15 }], ['pop .3', duck, { pop: 0.3 }], ['pop .5', duck, { pop: 0.5 }], ['pop .75', duck, { pop: 0.75 }], ['pop .95', duck, { pop: 0.95 }],
      ['glow .5', duck, { glow: 0.5, t: 0.3 }, 1, { glow: 0.5 }], ['glow 1', duck, { glow: 1, t: 0.26 }, 1, { glow: 1 }], ['frost .5', duck, { frost: 0.5 }], ['frost 1', duck, { frost: 1 }],
      ['alpha .5', duck, { alpha: 0.5 }], ['t 1.5', duck, { t: 1.5 }], ['t 3', duck, { t: 3 }],
      ['wiggle −1', duck, {}, 1, { wiggle: -1 }], ['wiggle 1', duck, {}, 1, { wiggle: 1 }],
      ['count 0/4', { kind: 'stars', n: 4 }, {}, 1, { count: 0 }], ['count 2/4', { kind: 'stars', n: 4 }, {}, 1, { count: 2 }], ['count 4/4', { kind: 'stars', n: 4 }, {}, 1, { count: 4 }],
      ['big ball', { kind: 'toy', obj: 'car', color: 'blue' }, {}], ['big:false', { kind: 'toy', obj: 'car', color: 'blue', big: false }, {}],
      ['star cookie small', { kind: 'shape', shape: 'star', color: 'green', big: false }, {}]
    ];
    const cw = 172, rh = 200, cols = 10, rows = Math.ceil(V.length / cols);
    size(cw * cols, rh * rows * 2 + 260);
    ['summer', 'winter'].forEach((s, half) => {
      const oy = half * rh * rows;
      sky(0, oy, cv.width, rh * rows, s);
      V.forEach((v, i) => {
        const x = cw * (i % cols) + cw / 2, y = oy + rh * Math.floor(i / cols) + 92;
        bub(x, y, 75 * (v[3] || 1), v[1], Object.assign({ frost: s === 'winter' && !('frost' in v[2]) ? 0.6 : 0 }, v[2]), v[4] || {});
        label(v[0], x, y + 100, 11, SKY[s][2]);
      });
    });
    const oy = rh * rows * 2;
    sky(0, oy, cv.width, 260, 'spring');
    [3, 5, 8].forEach((r, i) => { A.drawDrop(g, 60 + i * 40, oy + 60, r, 1); });
    label('drops 3/5/8', 100, oy + 100, 11);
    A.drawDrop(g, 200, oy + 60, 6, 0.4); label('drop a .4', 200, oy + 100, 11);
    [6, 10, 16, 24].forEach((r, i) => { A.drawMiniBubble(g, 290 + i * 58, oy + 60, r, 1); });
    label('mini bubbles 6/10/16/24', 380, oy + 100, 11);
    // a pop spray mock-up: ring of drops round a popping bubble
    g.save(); g.translate(620, oy + 120); A.drawBubble(g, 75, { pop: 0.35 }); g.restore();
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; A.drawDrop(g, 620 + Math.cos(a) * 112, oy + 120 + Math.sin(a) * 112 + 10, 4 + (i % 3), 0.9); }
    label('pop spray mock', 620, oy + 250, 11);
    [[24, 0, 1], [40, 0.4, 1], [56, 0.2, 0.6]].forEach((q, i) => { g.save(); g.translate(860 + i * 150, oy + 120); A.drawSnowflake(g, q[0], q[1], q[2]); g.restore(); label('snowflake r' + q[0] + ' a' + q[2], 860 + i * 150, oy + 230, 11); });
    sky(1300, oy, cv.width - 1300, 260, 'winter');
    [[30, 0], [50, 0.3]].forEach((q, i) => { g.save(); g.translate(1400 + i * 150, oy + 120); A.drawSnowflake(g, q[0], q[1], 1); g.restore(); });
    label('snowflakes on winter', 1480, oy + 230, 11);
  } else if (name === 'rainbow') {
    const W = 760, H = 380;
    const R = [[1, 0], [1, 0.5], [1, 1], [2, 0.4], [2, 1], [2, 1.6], [3, 0], [3, 1], [3, 2.5], [3, 3, { shine: 0.35 }], [3, 3, { shine: 0.7 }], [3, 3, { alpha: 0.5 }]];
    size(W * 3, H * 4);
    R.forEach((q, i) => {
      const s = SEAS[Math.floor(i / 3)], x0 = (i % 3) * W, y0 = Math.floor(i / 3) * H;
      sky(x0, y0, W, H, s);
      const rb = { cx: x0 + W / 2, cy: y0 + H - 40, r: 300, w: 52 };
      A.drawRainbow(g, rb, q[0], q[1], q[2] || {});
      // fake cloud floor hides the feet
      g.fillStyle = 'rgba(255,255,255,0.95)'; g.fillRect(x0, y0 + H - 66, W, 66);
      for (let k = 0; k < 9; k++) { g.beginPath(); g.arc(x0 + k * 95, y0 + H - 62, 40, 0, Math.PI * 2); g.fill(); }
      const p = A.rainbowPoint(rb, q[0], q[1]);
      g.fillStyle = '#E84A4A'; g.beginPath(); g.arc(p.x, p.y, 4, 0, 7); g.fill();
      label('k ' + q[0] + ' filled ' + q[1] + (q[2] ? ' ' + JSON.stringify(q[2]) : '') + ' · ' + s, x0 + W / 2, y0 + H - 12, 13, SKY[s][2]);
    });
  } else if (name === 'icons') {
    size(1400, 900, '#FFF8EE');
    const icons = [{ kind: 'color', color: 'red' }, { kind: 'color', color: 'yellow' }, { kind: 'color', color: 'blue' }, { kind: 'color', color: 'purple' },
      { kind: 'number', n: 1 }, { kind: 'number', n: 3 }, { kind: 'number', n: 5 }, { kind: 'number', n: 8 }, { kind: 'number', n: 12 },
      { kind: 'home', home: 'farm' }, { kind: 'home', home: 'sea' }, { kind: 'home', home: 'ice' }, { kind: 'home', home: 'jungle' }, { kind: 'home', home: 'savanna' },
      { kind: 'size', big: true }, { kind: 'size', big: false }, { kind: 'size', big: false, thing: { kind: 'animal', animal: 'sheep' } }, { kind: 'letter', text: 'B' },
      { kind: 'toy', obj: 'umbrella', color: 'green' }, { kind: 'shape', shape: 'triangle', color: 'orange' }, { kind: 'stars', n: 4 },
      { kind: 'tile', text: '7−4' }, { kind: 'animal', animal: 'lion' }, { kind: 'shape', shape: 'heart', color: 'pink' }];
    icons.forEach((t, i) => {
      const x = 75 + (i % 10) * 135, y = 85 + Math.floor(i / 10) * 175;
      g.fillStyle = '#FFFFFF'; g.fillRect(x - 60, y - 60, 120, 120); g.strokeStyle = 'rgba(80,120,200,0.4)'; g.strokeRect(x - 55, y - 55, 110, 110);
      g.save(); g.translate(x, y); A.drawIcon(g, t, 110); g.restore();
      label(t.kind + (t.n ? ' ' + t.n : '') + (t.big != null ? (t.big ? ' big' : ' small') : '') + (t.home ? ' ' + t.home : '') + (t.color ? ' ' + t.color : ''), x, y + 76, 11);
    });
    sky(0, 540, 1400, 360, 'summer');
    [0, 0.5, 1].forEach((p, i) => { bub(150 + i * 200, 640, 70, { kind: 'toy', obj: 'ball', color: 'red' }, { glow: 0.7 }, { glow: 0.7 }); A.drawHintHand(g, 150 + i * 200, 650, p, 1); label('press ' + p, 150 + i * 200, 880, 12); });
    A.drawHintHand(g, 760, 650, 0, 0.5); label('alpha .5', 790, 880, 12);
    A.HOMES.forEach((h, i) => { g.save(); g.translate(950 + i * 95, 650); A.drawHomeBadge(g, h, 40, {}); g.restore(); g.save(); g.translate(950 + i * 95, 780); A.drawHomeBadge(g, h, 30, { a: 0.7, pop: 0.8 }); g.restore(); });
    label('home badges r40 / r30 a.7 pop.8', 1140, 880, 12);
  } else if (name === 'round') {
    const R = [
      ['spring · colours: pop the red ones (k 2)', 'spring', [{ kind: 'toy', obj: 'ball', color: 'red' }, { kind: 'toy', obj: 'duck', color: 'blue' }, { kind: 'toy', obj: 'car', color: 'red' }, { kind: 'toy', obj: 'kite', color: 'yellow' }, { kind: 'toy', obj: 'umbrella', color: 'blue' }], 1.4],
      ['summer · shapes: the triangle', 'summer', ['circle', 'triangle', 'star', 'square'].map(s => ({ kind: 'shape', shape: s, color: 'orange' })), 0.6],
      ['autumn · how many stars? 4', 'autumn', [2, 4, 1].map(n => ({ kind: 'stars', n })), 0],
      ['winter · who lives on the ice?', 'winter', ['cow', 'penguin', 'crab', 'lion', 'sheep'].map(a => ({ kind: 'animal', animal: a })), 2.2]
    ];
    const W = 1200, H = 420;
    size(W, H * R.length);
    R.forEach((r, ri) => {
      const oy = ri * H, n = r[2].length, sp = Math.min(220, 1040 / n), maxN = Math.max.apply(null, r[2].map(t => t.n || 0));
      sky(0, oy, W, H, r[1]);
      A.drawRainbow(g, { cx: W / 2 + 40, cy: oy + H + 10, r: 380, w: 60 }, 2, 0.6, {});
      r[2].forEach((t, i) => bub(160 + 40 + i * sp + (i % 2) * 10, oy + 190 + (i % 2 ? 50 : -30), 75, t, { t: i + r[3], wob: i === 1 ? 0.08 : 0, frost: r[1] === 'winter' ? 0.7 : 0 }, { maxN: maxN || undefined }));
      label(r[0], 220, oy + 18, 14, SKY[r[1]][2]);
    });
  }
  return cv.toDataURL('image/png');
}

async function setupAnimals(page) {
  if (!fs.existsSync(ANDIR)) return 0;
  const files = fs.readdirSync(ANDIR).filter(f => /\.svg$/.test(f));
  const map = {};
  files.forEach(f => { map['animals/' + f.replace(/\.svg$/, '')] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(ANDIR, f)).toString('base64'); });
  return page.evaluate(async (m) => {
    const imgs = {};
    await Promise.all(Object.keys(m).map(k => new Promise(res => { const i = new Image(); i.onload = () => { imgs[k] = i; res(); }; i.onerror = () => res(); i.src = m[k]; })));
    window.PB = window.PB || {};
    window.PB.Assets = { images: imgs, has: k => !!imgs[k], img: k => imgs[k] || null };
    return Object.keys(imgs).length;
  }, map);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const all = ['toys', 'shapes', 'stars', 'tiles', 'fx', 'rainbow', 'icons', 'round', 'toys_3x', 'shapes_3x', 'stars_3x', 'tiles_3x'];
  const names = process.argv.slice(2).length ? process.argv.slice(2) : all;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ content: ART });
  const nA = await setupAnimals(page);
  if (nA) console.log('animal images loaded:', nA);
  for (const name of names) {
    const url = await page.evaluate(pageSheet, { name });
    const file = path.join(OUT, 'bubble_' + name + '.png');
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', path.relative(ROOT, file));
  }
  const st = await page.evaluate(() => window.PB.BubbleArt.stats);
  console.log('cache stats', JSON.stringify(st));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
