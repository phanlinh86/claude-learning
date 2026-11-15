// Nim's River Hop — contact sheets for NH.StoneArt (game/js/stone_art.js) → docs/art/stone_*.png
// Usage: node tools/stone_sheet.js [name ...]       (Playwright + the preinstalled Chromium; no install)
//   stone_things.png     every thing ON a stone at in-game size (S = 150, itemH = 93): 5 objs × 7 colours, 8 shapes × 2
//                        colours, dots 1–12, dots + numeral 1–8, tiles, 12 animals, big:false — one band per water colour
//   stone_things_3x.png  a selection at 3× (S = 450) to check outlines / shading
//   stone_states.png     8 stone variants, dip / tilt / gold / glow / active / snow / wet / alpha, dots count highlight,
//                        wiggle, glow on things, ripples, drops, fruits (+3×), lily pads, snowflakes — on the 4 water colours
//   stone_icons.png      Talk-time icons, home badges, hint hand presses, fruits on cream
//   stone_round.png      mock crossings (3 rows × 3 stones) per season at in-game size, plus the same at iPhone scale (×0.54)
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs/art');
const ART = fs.readFileSync(path.join(ROOT, 'game/js/stone_art.js'), 'utf8');
const ANDIR = path.join(ROOT, 'game/assets/default/animals');

function pageSheet({ name }) {
  const A = window.NH.StoneArt;
  const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  // DESIGN §3 water: brook (shallow → deep) and winter (shallow → deep)
  const WATERS = [['brook shallow', '#7FB8B4', '#1E3A3A'], ['brook deep', '#4E8E95', '#F4FBFA'], ['winter shallow', '#8FB3BF', '#1E3040'], ['winter deep', '#5F8794', '#F4FBFA']];
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  function size(w, h, bg) { cv.width = w; cv.height = h; g.fillStyle = bg || '#F4F1EA'; g.fillRect(0, 0, w, h); }
  function water(x, y, w, h, i) {
    const c = WATERS[i % 4][1], gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, c); gr.addColorStop(0.5, shade(c, -0.06)); gr.addColorStop(1, c);
    g.fillStyle = gr; g.fillRect(x, y, w, h);
  }
  function shade(hex, t) { const n = parseInt(hex.slice(1), 16), r = n >> 16, gg = (n >> 8) & 255, b = n & 255, f = v => Math.max(0, Math.min(255, Math.round(v + v * t))); return 'rgb(' + f(r) + ',' + f(gg) + ',' + f(b) + ')'; }
  function label(t, x, y, s, col) { g.save(); g.font = '700 ' + (s || 12) + 'px system-ui, sans-serif'; g.fillStyle = col || '#3A3640'; g.textAlign = 'center'; g.fillText(t, x, y); g.restore(); }
  // a stone with its thing, the way render.js draws it: translate to the stone's top centre → drawStone → drawThing
  function stone(x, y, S, th, so, to) {
    g.save(); g.translate(x, y);
    A.drawStone(g, S, so || {});
    if (so && so.tilt) g.rotate(so.tilt);
    if (th) A.drawThing(g, th, S * 0.62, to || {});
    g.restore();
  }
  const lab = t => !t ? '' : t.kind === 'obj' ? t.color + ' ' + t.obj : t.kind === 'shape' ? t.color + ' ' + t.shape : t.kind === 'dots' ? t.n + ' dot' + (t.n > 1 ? 's' : '') + (t.numeral ? ' +N' : '') : t.kind === 'tile' ? '"' + t.text + '"' : t.animal;

  if (name === 'things') {
    const list = [];
    A.OBJS.forEach(o => COLORS.forEach(c => list.push({ kind: 'obj', obj: o, color: c })));
    A.SHAPES.forEach((s, i) => list.push({ kind: 'shape', shape: s, color: COLORS[(i * 3) % 7] }));
    A.SHAPES.forEach((s, i) => list.push({ kind: 'shape', shape: s, color: COLORS[(i * 3 + 4) % 7] }));
    for (let n = 1; n <= 12; n++) list.push({ kind: 'dots', n });
    for (let n = 1; n <= 8; n++) list.push({ kind: 'dots', n, numeral: true });
    ['A', 'a', 'M', 'g', 'Q', '3+2', '7−4', '14+6', '10+10', '9', '20', 'Đ'].forEach(text => list.push({ kind: 'tile', text }));
    A.ANIMALS.forEach(a => list.push({ kind: 'animal', animal: a }));
    list.push({ kind: 'obj', obj: 'ball', color: 'red', big: false }, { kind: 'obj', obj: 'flower', color: 'yellow', big: false }, { kind: 'animal', animal: 'pig', big: false });
    const cols = 12, cw = 176, rh = 196, rows = Math.ceil(list.length / cols);
    size(cw * cols, rh * rows + 20);
    for (let r = 0; r < rows; r++) water(0, 20 + r * rh, cv.width, rh, r);
    label('stone_things · S = 150, itemH = 93 (in-game logical px) · rows cycle the 4 water colours', cv.width / 2, 15, 13);
    list.forEach((t, i) => {
      const r = Math.floor(i / cols), x = cw * (i % cols) + cw / 2, y = 20 + rh * r + 118;
      stone(x, y, 150, t, { seed: i });
      label(lab(t), x, y + 70, 11, WATERS[r % 4][2]);
    });
  } else if (name === 'things_3x') {
    const list = [{ kind: 'obj', obj: 'flower', color: 'yellow' }, { kind: 'obj', obj: 'mushroom', color: 'red' }, { kind: 'obj', obj: 'leaf', color: 'green' },
      { kind: 'obj', obj: 'duck', color: 'orange' }, { kind: 'shape', shape: 'star', color: 'pink' }, { kind: 'dots', n: 5 },
      { kind: 'dots', n: 3, numeral: true }, { kind: 'tile', text: '7−4' }, { kind: 'animal', animal: 'penguin' }];
    const cw = 520, rh = 520, cols = 3, rows = Math.ceil(list.length / cols);
    size(cw * cols, rh * rows);
    list.forEach((t, i) => {
      const x0 = cw * (i % cols), y0 = rh * Math.floor(i / cols);
      water(x0, y0, cw, rh, i);
      stone(x0 + cw / 2, y0 + rh * 0.56, 450, t, { seed: i * 3, snow: i === 8 ? 1 : 0 });
      label(lab(t) + ' · ' + WATERS[i % 4][0], x0 + cw / 2, y0 + rh - 12, 15, WATERS[i % 4][2]);
    });
  } else if (name === 'states') {
    const ball = { kind: 'obj', obj: 'ball', color: 'blue' }, fl = { kind: 'obj', obj: 'flower', color: 'red' };
    const V = [];
    for (let v = 0; v < 8; v++) V.push(['variant ' + v, null, { seed: v }]);
    V.push(['dip 0', fl, { seed: 2 }], ['dip .5', fl, { seed: 2, dip: 0.5 }], ['dip 1', fl, { seed: 2, dip: 1 }], ['tilt −.14', fl, { seed: 2, tilt: -0.14 }], ['tilt +.14', fl, { seed: 2, tilt: 0.14 }],
      ['gold .3', null, { seed: 3, gold: 0.3 }], ['gold .7', null, { seed: 3, gold: 0.7 }], ['gold 1', null, { seed: 3, gold: 1 }], ['gold 1 dip .6', null, { seed: 4, gold: 1, dip: 0.6 }],
      ['glow .5', ball, { seed: 5, glow: 0.5 }], ['glow 1 (+thing)', ball, { seed: 5, glow: 1 }, { glow: 1 }], ['active 1', ball, { seed: 6, active: 1 }], ['active .5 t1', ball, { seed: 6, active: 0.5, t: 1 }],
      ['active+glow', ball, { seed: 6, active: 1, glow: 0.8 }], ['snow .5', null, { seed: 7, snow: 0.5 }], ['snow 1', fl, { seed: 7, snow: 1 }], ['snow gold', null, { seed: 1, snow: 1, gold: 1 }],
      ['wet .5', null, { seed: 0, wet: 0.5 }], ['wet 1', fl, { seed: 0, wet: 1, dip: 0.4 }], ['alpha .5', fl, { seed: 1, alpha: 0.5 }],
      ['count 0/5', { kind: 'dots', n: 5 }, { seed: 2 }, { count: 0 }], ['count 3/5', { kind: 'dots', n: 5 }, { seed: 2 }, { count: 3 }], ['count 8/8', { kind: 'dots', n: 8 }, { seed: 2 }, { count: 8 }],
      ['wiggle −1', { kind: 'obj', obj: 'duck', color: 'yellow' }, { seed: 4 }, { wiggle: -1 }], ['wiggle 1', { kind: 'obj', obj: 'duck', color: 'yellow' }, { seed: 4 }, { wiggle: 1 }],
      ['thing alpha .4', fl, { seed: 2, gold: 1 }, { alpha: 0.4 }], ['big:false', { kind: 'obj', obj: 'mushroom', color: 'purple', big: false }, { seed: 3 }], ['big', { kind: 'obj', obj: 'mushroom', color: 'purple' }, { seed: 3 }]);
    const cw = 176, rh = 200, cols = 12, rows = Math.ceil(V.length / cols), FX = 300;
    size(cw * cols, rh * rows * 2 + FX * 2);
    [0, 2].forEach((wi, half) => {
      const oy = half * rh * rows;
      water(0, oy, cv.width, rh * rows, wi);
      V.forEach((v, i) => {
        const x = cw * (i % cols) + cw / 2, y = oy + rh * Math.floor(i / cols) + 120;
        stone(x, y, 150, v[1], v[2], v[3] || {});
        label(v[0], x, y + 72, 11, WATERS[wi][2]);
      });
    });
    // water fx on all four water colours
    const oy = rh * rows * 2;
    for (let wi = 0; wi < 4; wi++) {
      const x0 = (wi % 2) * cv.width / 2, y0 = oy + Math.floor(wi / 2) * FX, W2 = cv.width / 2;
      water(x0, y0, W2, FX, wi);
      [[30, 1], [55, 0.8], [80, 0.5], [110, 0.25]].forEach((q, i) => A.drawRipple(g, x0 + 90 + i * 30, y0 + 90, q[0], q[1], 0.38));
      label('ripples r30/55/80/110', x0 + 140, y0 + 160, 11, WATERS[wi][2]);
      [3, 5, 8, 11].forEach((r, i) => A.drawDrop(g, x0 + 290 + i * 34, y0 + 80, r, 1));
      label('drops 3/5/8/11', x0 + 340, y0 + 160, 11, WATERS[wi][2]);
      A.FRUITS.forEach((f, i) => { g.save(); g.translate(x0 + 470 + i * 70, y0 + 80); A.drawFruit(g, f, 60, { rot: i === 2 ? 0.3 : 0 }); g.restore(); });
      label('fruits 60 px', x0 + 610, y0 + 160, 11, WATERS[wi][2]);
      g.save(); g.translate(x0 + 860, y0 + 85); A.drawFruit(g, A.FRUITS[wi], 130, { glow: wi === 1 ? 1 : 0 }); g.restore();
      label(A.FRUITS[wi] + ' 130' + (wi === 1 ? ' glow' : ''), x0 + 860, y0 + 160, 11, WATERS[wi][2]);
      [[46, 0], [34, 1.2], [60, 2.6]].forEach((q, i) => { g.save(); g.translate(x0 + 110 + i * 140, y0 + 230); A.drawLilyPad(g, q[0], q[1]); g.restore(); });
      label('lily pads r46/34/60', x0 + 250, y0 + 290, 11, WATERS[wi][2]);
      [[24, 0, 1], [40, 0.4, 1], [52, 0.2, 0.6]].forEach((q, i) => { g.save(); g.translate(x0 + 560 + i * 120, y0 + 230); A.drawSnowflake(g, q[0], q[1], q[2]); g.restore(); });
      label('snowflakes', x0 + 680, y0 + 290, 11, WATERS[wi][2]);
      g.save(); g.translate(x0 + 940, y0 + 240); A.drawStone(g, 110, { seed: wi, gold: 1 }); A.drawFruit(g, 'apple', 44, {}); g.restore();
      label(WATERS[wi][0], x0 + 940, y0 + 290, 11, WATERS[wi][2]);
    }
  } else if (name === 'icons') {
    size(1420, 980, '#FFF8EE');
    const icons = [{ kind: 'color', color: 'red' }, { kind: 'color', color: 'yellow' }, { kind: 'color', color: 'blue' }, { kind: 'color', color: 'purple' }, { kind: 'color', color: 'pink' },
      { kind: 'number', n: 1 }, { kind: 'number', n: 3 }, { kind: 'number', n: 5 }, { kind: 'number', n: 8 }, { kind: 'number', n: 12 },
      { kind: 'home', home: 'farm' }, { kind: 'home', home: 'sea' }, { kind: 'home', home: 'ice' }, { kind: 'home', home: 'jungle' }, { kind: 'home', home: 'savanna' },
      { kind: 'size', big: true }, { kind: 'size', big: false }, { kind: 'size', big: false, thing: { kind: 'animal', animal: 'sheep' } }, { kind: 'letter', text: 'B' }, { kind: 'fruit', fruit: 'acorn' },
      { kind: 'obj', obj: 'flower', color: 'purple' }, { kind: 'shape', shape: 'triangle', color: 'orange' }, { kind: 'dots', n: 4 }, { kind: 'dots', n: 6, numeral: true },
      { kind: 'tile', text: '7−4' }, { kind: 'animal', animal: 'lion' }, { kind: 'shape', shape: 'heart', color: 'pink' }, { kind: 'obj', obj: 'leaf', color: 'green', big: false }];
    icons.forEach((t, i) => {
      const x = 75 + (i % 10) * 135, y = 85 + Math.floor(i / 10) * 175;
      g.fillStyle = '#FFFFFF'; g.fillRect(x - 60, y - 60, 120, 120); g.strokeStyle = 'rgba(120,100,80,0.4)'; g.strokeRect(x - 55, y - 55, 110, 110);
      g.save(); g.translate(x, y); A.drawIcon(g, t, 110); g.restore();
      label(t.kind + (t.n ? ' ' + t.n : '') + (t.big != null ? (t.big ? ' big' : ' small') : '') + (t.home ? ' ' + t.home : '') + (t.color ? ' ' + t.color : '') + (t.obj ? ' ' + t.obj : ''), x, y + 76, 11);
    });
    water(0, 600, 1420, 380, 1);
    [0, 0.5, 1].forEach((p, i) => { stone(150 + i * 200, 760, 150, { kind: 'obj', obj: 'ball', color: 'red' }, { seed: i, glow: 0.7, active: 1 }, { glow: 0.7 }); A.drawHintHand(g, 150 + i * 200, 735, p, 1); label('press ' + p, 150 + i * 200, 960, 12, '#F4FBFA'); });
    stone(760, 760, 150, { kind: 'obj', obj: 'ball', color: 'red' }, { seed: 4 }); A.drawHintHand(g, 760, 735, 0, 0.5); label('alpha .5', 790, 960, 12, '#F4FBFA');
    A.HOMES.forEach((h, i) => { g.save(); g.translate(950 + i * 95, 700); A.drawHomeBadge(g, h, 40, {}); g.restore(); g.save(); g.translate(950 + i * 95, 830); A.drawHomeBadge(g, h, 30, { a: 0.7, pop: 0.8 }); g.restore(); });
    label('home badges r40 / r30 a.7 pop.8', 1140, 960, 12, '#F4FBFA');
  } else if (name === 'round') {
    const R = [
      ['spring · colours: hop on the red ones', 0, [[{ kind: 'obj', obj: 'flower', color: 'red' }, { kind: 'obj', obj: 'ball', color: 'blue' }, { kind: 'obj', obj: 'duck', color: 'yellow' }],
        [{ kind: 'obj', obj: 'mushroom', color: 'blue' }, { kind: 'obj', obj: 'leaf', color: 'yellow' }, { kind: 'obj', obj: 'ball', color: 'red' }],
        [{ kind: 'obj', obj: 'duck', color: 'red' }, { kind: 'obj', obj: 'flower', color: 'purple' }, { kind: 'obj', obj: 'mushroom', color: 'yellow' }]]],
      ['summer · count: hop 1, 2, 3', 1, [[1, 3, 4], [2, 5, 1], [4, 3, 5]].map((r, j) => r.map(n => ({ kind: 'dots', n, numeral: true })))],
      ['autumn · shapes: the stars', 0, [['star', 'circle', 'square'], ['triangle', 'star', 'heart'], ['heart', 'square', 'star']].map(r => r.map(s => ({ kind: 'shape', shape: s, color: 'orange' })))],
      ['winter · who lives on the farm?', 2, [['cow', 'penguin', 'crab'], ['lion', 'pig', 'fishbowl'], ['monkey', 'penguin', 'hen']].map(r => r.map(a => ({ kind: 'animal', animal: a })))]
    ];
    const W = 1100, H = 640;
    size(W * 2, H * R.length);
    R.forEach((r, ri) => {
      const oy = ri * H;
      for (let half = 0; half < 2; half++) {
        const ox = half * W, k = half ? 0.54 : 1;
        g.save(); g.beginPath(); g.rect(ox, oy, W, H); g.clip();
        g.fillStyle = ri === 3 ? '#F1F4F8' : '#9CC98A'; g.fillRect(ox, oy, W, H);
        g.save(); g.translate(ox + W * (1 - k) / 2, oy + H * (1 - k) / 2 + (half ? 0 : 14)); g.scale(k, k);
        const gr = g.createLinearGradient(0, 70, 0, 570), wc = ri === 3 ? ['#8FB3BF', '#5F8794'] : ['#7FB8B4', '#4E8E95'];
        gr.addColorStop(0, wc[0]); gr.addColorStop(0.5, wc[1]); gr.addColorStop(1, wc[0]);
        g.fillStyle = gr; g.fillRect(200, 0, 700, H);
        g.fillStyle = ri === 3 ? '#F1F4F8' : '#9CC98A'; g.fillRect(0, 0, 200, H); g.fillRect(900, 0, 200, H);
        g.fillStyle = '#9A7B58'; g.fillRect(196, 0, 8, H); g.fillRect(896, 0, 8, H);
        r[2].forEach((row, j) => row.forEach((t, i) => {
          const x = 330 + j * 220, y = 150 + i * 175 + (j % 2) * 30, gold = j === 0 && (i === (ri === 1 ? 0 : 0)) ? 1 : 0;
          const s = { seed: ri * 9 + j * 3 + i, snow: ri === 3 ? 1 : 0, active: j === 1 ? 1 : 0, gold: j === 0 && i === 0 ? 1 : 0, glow: j === 1 && i === 1 && ri === 0 ? 0.8 : 0 };
          stone(x, y, 150, j === 0 && i === 0 ? null : t, s, { maxN: 5 });
        }));
        g.restore();
        g.restore();
        label(r[0] + (half ? ' · iPhone scale ×0.54' : ' · in-game logical'), ox + W / 2, oy + 22, 15, '#2E3A2A');
      }
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
    window.NH = window.NH || {};
    window.NH.Assets = { images: imgs, has: k => !!imgs[k], img: k => imgs[k] || null };
    return Object.keys(imgs).length;
  }, map);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const all = ['things', 'things_3x', 'states', 'icons', 'round'];
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
    const file = path.join(OUT, 'stone_' + name + '.png');
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', path.relative(ROOT, file));
  }
  const st = await page.evaluate(() => window.NH.StoneArt.stats);
  console.log('cache stats', JSON.stringify(st));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
