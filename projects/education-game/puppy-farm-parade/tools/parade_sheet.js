// Bo's Farm Parade — contact sheets for FP.ParadeArt (game/js/parade_art.js) → docs/art/parade_*.png
// Usage: node tools/parade_sheet.js [name ...]
//   parade_objs.png      every obj × every colour at in-game size (120) on path #D8BE95 / grass #9CC27A / night #1E2A4A
//   parade_blocks.png    8 shapes × colours at 120 on the three grounds
//   parade_crates.png    crates n = 1–12 at 120 on the three grounds + a count-highlight row (count = n/2)
//   parade_tiles.png     sign tiles (letters, sums, numbers ≤ 20, "10+10", "12−5") at 120 on the three grounds
//   parade_*_3x.png      objs / blocks / crates / tiles at 3× (360)
//   parade_opts.png      glow, dim, night, small (big:false), wheel turns, animals (images if present, else placeholder)
//   parade_stage.png     hay-bale stage (pop 0 / .5 / 1) with a member standing on it + home badges (3 grounds)
//   parade_icons.png     Talk-time icons, hint hand presses, dust puffs
//   parade_rounds.png    mock rounds (a line of members on the path) — the odd one must be obvious at a glance
// Animals: if game/assets/default/animals/*.svg exist they are loaded into a tiny FP.Assets stub (else placeholders).
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs/art');
const ART = fs.readFileSync(path.join(ROOT, 'game/js/parade_art.js'), 'utf8');
const ANDIR = path.join(ROOT, 'game/assets/default/animals');

function pageSheet({ name }) {
  const A = window.FP.ParadeArt;
  const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  const ITEM = 120;
  const BG = {
    path: { fill: '#D8BE95', edge: '#BFA27A', ink: '#4A3A28', night: 0 },
    grass: { fill: '#9CC27A', edge: '#7FA65E', ink: '#2E4A22', night: 0 },
    night: { fill: '#1E2A4A', edge: '#3B4C78', ink: '#E8EEFF', night: 1 }
  };
  const BGS = ['path', 'grass', 'night'];
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  function size(w, h, bg) { cv.width = w; cv.height = h; g.fillStyle = bg || '#F4EFE6'; g.fillRect(0, 0, w, h); }
  function band(x, y, w, h, b) { g.fillStyle = b.fill; g.fillRect(x, y, w, h); g.fillStyle = b.edge; g.fillRect(x, y + h - 4, w, 4); }
  function label(t, x, y, s, col) { g.save(); g.font = '700 ' + (s || 12) + 'px system-ui, sans-serif'; g.fillStyle = col || '#4A4237'; g.textAlign = 'center'; g.fillText(t, x, y); g.restore(); }
  function shadow(x, y, w) { g.fillStyle = 'rgba(60,40,20,0.22)'; g.beginPath(); g.ellipse(x, y, w * 0.42, 5, 0, 0, Math.PI * 2); g.fill(); }
  function member(t, x, y, sz, opt) { shadow(x, y, sz); g.save(); g.translate(x, y); A.drawMember(g, t, sz, opt || {}); g.restore(); }
  function boxOf(t, x, y, sz) { const b = A.bodyBox(t, sz); g.save(); g.strokeStyle = 'rgba(40,90,200,0.35)'; g.setLineDash([3, 4]); g.strokeRect(x - b.w / 2, y - b.h, b.w, b.h); g.restore(); }
  const lab = t => t.kind === 'obj' ? t.color + ' ' + t.obj : t.kind === 'block' ? t.color + ' ' + t.shape : t.kind === 'crate' ? 'crate ' + t.n : t.kind === 'tile' ? '"' + t.text + '"' : t.animal;

  const sets = {
    objs: () => { const r = []; A.OBJECTS.forEach(o => COLORS.forEach(c => r.push({ kind: 'obj', obj: o, color: c }))); return { list: r, cols: 7 }; },
    blocks: () => { const r = []; A.SHAPES.forEach((s, i) => { r.push({ kind: 'block', shape: s, color: 'blue' }); r.push({ kind: 'block', shape: s, color: COLORS[(i * 3 + 2) % 7] }); }); return { list: r, cols: 8 }; },
    crates: () => ({ list: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => ({ kind: 'crate', n })), cols: 6 }),
    tiles: () => ({ list: ['A', 'M', 'W', 'Q', 'a', 'g', '3+2', '7−4', '10+10', '12−5', '9', '20', '7', '18', 'Đ', 'Bb'].map(text => ({ kind: 'tile', text })), cols: 8 })
  };

  if (sets[name]) {
    const { list, cols } = sets[name](), cw = 150, rh = 168, rows = Math.ceil(list.length / cols);
    size(cw * cols, rh * rows * 3 + 4);
    BGS.forEach((bn, bi) => {
      const b = BG[bn], oy = bi * rh * rows;
      band(0, oy, cv.width, rh * rows, b);
      list.forEach((t, i) => {
        const x = cw * (i % cols) + cw / 2, y = oy + rh * Math.floor(i / cols) + 138;
        if (bi === 0) boxOf(t, x, y, ITEM);
        member(t, x, y, ITEM, { night: b.night, wheel: i * 0.4 });
        label(lab(t), x, y + 22, 11, b.ink);
      });
      label(bn, 30, oy + 14, 12, b.ink);
    });
  } else if (/_3x$/.test(name)) {
    const base = name.replace('_3x', '');
    let { list } = sets[base]();
    if (base === 'objs') list = A.OBJECTS.map((o, i) => ({ kind: 'obj', obj: o, color: ['red', 'blue', 'yellow', 'green', 'purple'][i] }));
    if (base === 'blocks') list = A.SHAPES.map((s, i) => ({ kind: 'block', shape: s, color: COLORS[i % 7] }));
    if (base === 'crates') list = [1, 3, 5, 7, 10, 12].map(n => ({ kind: 'crate', n }));
    if (base === 'tiles') list = list.filter(t => ['A', 'g', '3+2', '7−4', '10+10', '12−5', '20', 'Đ'].indexOf(t.text) >= 0);
    const S = ITEM * 3, cw = 420, rh = 420, cols = 4, rows = Math.ceil(list.length / cols);
    size(cw * cols, rh * rows);
    list.forEach((t, i) => {
      const b = BG[BGS[i % 3]], x0 = cw * (i % cols), y0 = rh * Math.floor(i / cols);
      band(x0, y0, cw, rh, b);
      member(t, x0 + cw / 2, y0 + rh - 34, S, { night: b.night, wheel: i * 0.6, count: t.kind === 'crate' && i % 2 ? Math.ceil(t.n / 2) : -1 });
      label(lab(t), x0 + cw / 2, y0 + rh - 10, 14, b.ink);
    });
  } else if (name === 'opts') {
    const V = [
      ['plain', { kind: 'obj', obj: 'bucket', color: 'red' }, {}],
      ['glow .5', { kind: 'obj', obj: 'bucket', color: 'red' }, { glow: 0.5 }],
      ['glow 1', { kind: 'block', shape: 'star', color: 'yellow' }, { glow: 1 }],
      ['dim 1', { kind: 'obj', obj: 'boot', color: 'blue' }, { dim: 1 }],
      ['big:false', { kind: 'obj', obj: 'can', color: 'green', big: false }, {}],
      ['big', { kind: 'obj', obj: 'can', color: 'green' }, {}],
      ['wheel 0', { kind: 'obj', obj: 'tractor', color: 'orange' }, { wheel: 0 }],
      ['wheel .6', { kind: 'obj', obj: 'tractor', color: 'orange' }, { wheel: 0.6 }],
      ['crate 4 count 0', { kind: 'crate', n: 4 }, { count: 0 }],
      ['crate 4 count 2', { kind: 'crate', n: 4 }, { count: 2 }],
      ['crate 4 count 4', { kind: 'crate', n: 4 }, { count: 4 }],
      ['crate 9 glow', { kind: 'crate', n: 9 }, { glow: 0.8 }],
      ['tile glow', { kind: 'tile', text: '3+2' }, { glow: 0.8 }],
      ['flower small', { kind: 'obj', obj: 'flower', color: 'pink', big: false }, {}],
      ['heart dim .5', { kind: 'block', shape: 'heart', color: 'pink' }, { dim: 0.5 }]
    ].concat(A.ANIMALS.map((a, i) => [a + (i % 3 === 1 ? ' step' : i % 3 === 2 ? ' glow' : ''), { kind: 'animal', animal: a, big: i === 11 ? false : undefined }, { step: i % 3 === 1 ? 1 : 0, glow: i % 3 === 2 ? 0.8 : 0 }]));
    const cw = 160, rh = 175, cols = 9, rows = Math.ceil(V.length / cols);
    size(cw * cols, rh * rows * 2);
    ['path', 'night'].forEach((bn, half) => {
      const b = BG[bn];
      band(0, half * rh * rows, cv.width, rh * rows, b);
      V.forEach((v, i) => {
        const x = cw * (i % cols) + cw / 2, y = half * rh * rows + rh * Math.floor(i / cols) + 140;
        member(v[1], x, y, ITEM, Object.assign({ night: b.night }, v[2]));
        label(v[0], x, y + 24, 11, b.ink);
      });
    });
  } else if (name === 'stage') {
    const W = 1500, H = 330;
    size(W, H * 3);
    BGS.forEach((bn, r) => {
      const b = BG[bn], oy = r * H;
      band(0, oy, W, H, b);
      [0, 0.5, 1].forEach((p, i) => {
        const x = 150 + i * 250, y = oy + 150;
        g.save(); g.translate(x, y); A.drawStage(g, 0.9, { pop: p, night: b.night }); g.restore();
        const th = [{ kind: 'obj', obj: 'bucket', color: 'blue' }, { kind: 'crate', n: 4 }, { kind: 'animal', animal: 'penguin' }][i];
        g.save(); g.translate(x, y + A.stageDip(0.9, p)); A.drawMember(g, th, ITEM, { night: b.night, count: i === 1 ? 2 : -1 }); g.restore();
        label('pop ' + p, x, oy + H - 12, 12, b.ink);
      });
      A.HOMES.forEach((h, i) => {
        const x = 830 + i * 135, y = oy + 120;
        g.save(); g.translate(x, y); A.drawHomeBadge(g, h, 46, {}); g.restore();
        g.save(); g.translate(x, y + 120); A.drawHomeBadge(g, h, 30, { a: 0.8, pop: 0.9 }); g.restore();
        label(h, x, oy + H - 12, 12, b.ink);
      });
    });
  } else if (name === 'icons') {
    size(1320, 760, '#FDF3E1');
    const icons = [{ kind: 'color', color: 'red' }, { kind: 'color', color: 'yellow' }, { kind: 'color', color: 'purple' },
      { kind: 'number', n: 1 }, { kind: 'number', n: 3 }, { kind: 'number', n: 5 }, { kind: 'number', n: 8 }, { kind: 'number', n: 12 },
      { kind: 'home', home: 'sea' }, { kind: 'home', home: 'ice' }, { kind: 'size', big: true }, { kind: 'size', big: false },
      { kind: 'size', big: false, thing: { kind: 'animal', animal: 'sheep' } }, { kind: 'letter', text: 'B' },
      { kind: 'obj', obj: 'boot', color: 'green' }, { kind: 'block', shape: 'triangle', color: 'orange' }, { kind: 'crate', n: 5 },
      { kind: 'tile', text: '7−4' }, { kind: 'animal', animal: 'lion' }, { kind: 'block', shape: 'rect', color: 'blue' }];
    icons.forEach((t, i) => {
      const x = 80 + (i % 10) * 125, y = 90 + Math.floor(i / 10) * 175;
      g.fillStyle = '#FFFFFF'; g.fillRect(x - 60, y - 60, 120, 120); g.strokeStyle = 'rgba(80,120,200,0.4)'; g.strokeRect(x - 55, y - 55, 110, 110);
      g.save(); g.translate(x, y); A.drawIcon(g, t, 110); g.restore();
      label(t.kind + (t.n ? ' ' + t.n : '') + (t.big != null ? (t.big ? ' big' : ' small') : '') + (t.home ? ' ' + t.home : ''), x, y + 78, 11);
    });
    band(0, 440, 1320, 320, BG.grass);
    [0, 0.5, 1].forEach((p, i) => { A.drawHintHand(g, 120 + i * 170, 520, p, 1); label('press ' + p, 150 + i * 170, 740, 12, '#2E4A22'); });
    A.drawHintHand(g, 640, 520, 0, 0.5); label('alpha .5', 670, 740, 12, '#2E4A22');
    [8, 14, 22].forEach((r, i) => { A.drawDust(g, 820 + i * 110, 600, r, 1); label('dust r' + r, 820 + i * 110, 660, 12, '#2E4A22'); });
    A.drawDust(g, 1200, 600, 18, 0.5); label('dust a .5', 1200, 660, 12, '#2E4A22');
    g.save(); g.translate(1000, 720); A.drawWagon(g, 120, 0.3, {}); g.restore(); label('drawWagon 120', 1000, 740, 12, '#2E4A22');
  } else if (name === 'rounds') {
    const R = [
      ['colors warm-up: not red', [0, 0, 1, 0].map((o, i) => ({ kind: 'obj', obj: 'bucket', color: o ? 'blue' : 'red' }))],
      ['colors: mixed objs, not yellow', [{ kind: 'obj', obj: 'boot', color: 'yellow' }, { kind: 'obj', obj: 'can', color: 'yellow' }, { kind: 'obj', obj: 'tractor', color: 'yellow' }, { kind: 'obj', obj: 'flower', color: 'purple' }, { kind: 'obj', obj: 'bucket', color: 'yellow' }]],
      ['shapes: not a circle', ['circle', 'circle', 'star', 'circle'].map(s => ({ kind: 'block', shape: s, color: 'green' }))],
      ['shapes5: mixed colours', [['triangle', 'red'], ['triangle', 'blue'], ['heart', 'yellow'], ['triangle', 'pink'], ['triangle', 'orange']].map(q => ({ kind: 'block', shape: q[0], color: q[1] }))],
      ['count: not 2', [2, 4, 2, 2].map(n => ({ kind: 'crate', n }))],
      ['count: 6 vs 8', [6, 6, 8, 6, 6].map(n => ({ kind: 'crate', n }))],
      ['size: little one', [true, false, true].map(b => ({ kind: 'obj', obj: 'can', color: 'orange', big: b }))],
      ['add: not 5', ['3+2', '1+4', '2+2', '5+0'].map(text => ({ kind: 'tile', text }))],
      ['animals: not on the farm', ['cow', 'pig', 'penguin', 'sheep', 'hen'].map(a => ({ kind: 'animal', animal: a }))]
    ];
    const W = 900, H = 190;
    size(W, H * R.length);
    R.forEach((r, ri) => {
      const b = ri === R.length - 1 ? BG.night : BG.path, oy = ri * H;
      band(0, oy, W, H, b);
      const n = r[1].length, sp = Math.min(150, 780 / n);
      r[1].forEach((t, i) => member(t, 450 + (i - (n - 1) / 2) * sp, oy + 165, ITEM, { night: b.night, wheel: i }));
      label(r[0], 120, oy + 16, 12, b.ink);
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
    window.FP = window.FP || {};
    window.FP.Assets = { images: imgs, has: k => !!imgs[k], img: k => imgs[k] || null };
    return Object.keys(imgs).length;
  }, map);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const all = ['objs', 'blocks', 'crates', 'tiles', 'objs_3x', 'blocks_3x', 'crates_3x', 'tiles_3x', 'opts', 'stage', 'icons', 'rounds'];
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
    const file = path.join(OUT, 'parade_' + name + '.png');
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', path.relative(ROOT, file));
  }
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
