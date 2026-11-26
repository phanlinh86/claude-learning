// Rio's Singing Eggs — contact sheets for SE.EggArt (game/js/egg_art.js) → docs/art/egg_*.png
// Usage: node tools/egg_sheet.js [name ...]
//   egg_all_<mood>.png   every kind × colour / shape / animal / n / glyph at in-game size (112) standing on a cushion, on the
//                          pastel mood background (night uses opt.night = 1); dashed box = bodyBox, red dot = body centre (cy)
//   egg_<group>_3x.png   eggs, shapes, big, dots, animals, glyphs at 3× (336): at rest and struck (ring .7 + skin ripple)
//   egg_states.png       ring 0/.4/.7/1, dull, skin ripple phases, sq .8 / 1.15, glow, dim, count, sing, pop — noon + night
//   egg_scene.png        vine + seed pods (0 / 2 / 3 / 5 lit, icons, "?" hidden, now pulse) + islands + eggs + volcano per mood
//   egg_cushions.png     islands with dent 0 / .5 / 1 (+ an egg riding the dip, in the straw ring), pop, alpha, night
//   egg_pods.png         every pod icon (unlit / now / lit / hidden) at 1× and 2×, on noon + night
//   egg_misc.png         stone tablets n = 1..5 with lit 0..n, volcano tilt / puff, notes, sparks, fireflies, ghost hand, Talk icons
//   Every egg is drawn like the game will: drawCushion (back) → drawEgg → drawCushionFront.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs/art');
const ART = fs.readFileSync(path.join(ROOT, 'game/js/egg_art.js'), 'utf8');

function pageSheet({ name }) {
  const A = window.SE.EggArt;
  const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  const ITEM = 112;
  const MOODS = {
    morning: { top: '#FAD6E0', bot: '#FFF1E4', ink: '#5A3F4A', night: 0 },
    noon: { top: '#8FD0F4', bot: '#E2F5FD', ink: '#24425A', night: 0 },
    sunset: { top: '#FFC9A0', bot: '#FFE7C2', ink: '#4A2E22', night: 0 },
    night: { top: '#1F2550', bot: '#44508A', ink: '#E8EEFF', night: 1 }
  };
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  function size(w, h, bg) { cv.width = w; cv.height = h; g.fillStyle = bg || '#F4EFE6'; g.fillRect(0, 0, w, h); }
  function sky(x, y, w, h, m) { const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, m.top); gr.addColorStop(1, m.bot); g.fillStyle = gr; g.fillRect(x, y, w, h); }
  function label(t, x, y, s, col) { g.save(); g.font = '700 ' + (s || 13) + 'px system-ui, sans-serif'; g.fillStyle = col || '#4A4237'; g.textAlign = 'center'; g.fillText(t, x, y); g.restore(); }
  function box(t, x, y, sz) {
    const b = A.bodyBox(t, sz); g.save(); g.strokeStyle = 'rgba(80,120,200,0.45)'; g.setLineDash([4, 4]); g.lineWidth = 1;
    g.strokeRect(x - b.w / 2, y - b.h, b.w, b.h); g.setLineDash([]); g.fillStyle = 'rgba(220,40,40,0.7)'; g.fillRect(x - 2, y + b.cy - 2, 4, 4); g.restore();
  }
  let front = null;   // the front half of the straw ring of the last cushion, drawn after its egg
  function cushion(x, y, sz, opt) { A.drawCushion(g, x, y, sz * 1.25, opt || {}); front = [x, y, sz * 1.25, opt || {}]; }
  function flush() { if (front) { A.drawCushionFront(g, front[0], front[1], front[2], front[3]); front = null; } }
  function egg(t, x, y, sz, opt) {
    g.save(); g.translate(x, y); A.drawEgg(g, t, sz, opt || {}); g.restore();
    if (front) { A.drawCushionFront(g, front[0], front[1], front[2], front[3]); front = null; }
  }
  const G = {
    eggs: COLORS.map(c => ({ kind: 'egg', color: c })),
    shapes: A.SHAPES.map((s, i) => ({ kind: 'shape', shape: s, color: COLORS[i % 7] })),
    shapes1: A.SHAPES.map(s => ({ kind: 'shape', shape: s, color: 'yellow' })),
    big: [{ kind: 'big' }],
    dots: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => ({ kind: 'dots', n })),
    animals: A.ANIMALS.map(a => ({ kind: 'animal', animal: a })),
    glyphs: ['A', 'B', 'M', 'g', 'Đ', '7', '12', 'W'].map((t, i) => ({ kind: 'glyph', text: t, color: i % 3 === 2 ? undefined : COLORS[i % 7] }))
  };
  const lab = t => t.kind === 'egg' ? t.color + ' egg' : t.kind === 'shape' ? t.shape + ' ' + t.color : t.kind === 'big' ? 'big egg' :
    t.n != null ? t.kind + ' ' + t.n : t.animal || (t.text != null ? '"' + t.text + '" ' + (t.color || '') : t.kind);

  if (/^all_/.test(name)) {
    const m = MOODS[name.slice(4)];
    const rows = ['eggs', 'big', 'shapes', 'shapes1', 'dots', 'animals', 'glyphs'];
    const cw = 160, chh = 200, cols = 8;
    const cells = []; rows.forEach(r => { G[r].forEach(t => cells.push(t)); while (cells.length % cols) cells.push(null); });
    size(cw * cols, chh * (cells.length / cols) + 10);
    sky(0, 0, cv.width, cv.height, m);
    cells.forEach((t, i) => {
      if (!t) return;
      const x = cw * (i % cols) + cw / 2, y = chh * Math.floor(i / cols) + 150, sz = t.kind === 'big' ? ITEM * 1.2 : ITEM;
      cushion(x, y, sz, { night: m.night, t: i });
      box(t, x, y, sz); egg(t, x, y, sz, { night: m.night, count: -1 });
      label(lab(t), x, y + 44, 12, m.ink);
    });
  } else if (/_3x$/.test(name)) {
    const list = G[name.replace('_3x', '')], S = ITEM * 3, cw = 400, chh = 440, cols = Math.min(4, list.length);
    const n = list.length, rowsN = Math.ceil(n / cols) * 2;
    size(cw * Math.max(2, cols), chh * rowsN);
    const ms = ['morning', 'noon', 'sunset', 'night'];
    (list.length === 1 ? [list[0], list[0]] : list).forEach((t, i) => {
      for (let v = 0; v < 2; v++) {
        const m = MOODS[ms[(i + v * 2) % 4]];
        const cx = cw * (i % Math.max(2, cols)), cy = chh * (Math.floor(i / Math.max(2, cols)) * 2 + v);
        sky(cx, cy, cw, chh, m);
        const x = cx + cw / 2, y = cy + chh - 64;
        front = null; egg(t, x, y, S, { night: m.night, ring: v ? 0.7 : 0, skin: v ? 0.8 : 0, skinPh: 1.2, sing: v ? 1 : 0, count: v && t.n ? Math.ceil(t.n / 2) : -1 });
        label(lab(t) + (v ? '  ring .7 skin .8 sing' : ''), x, cy + chh - 18, 14, m.ink);
      }
    });
  } else if (name === 'states') {
    const V = [
      ['ring 0', { kind: 'egg', color: 'red' }, {}],
      ['ring .4', { kind: 'egg', color: 'red' }, { ring: 0.4, skin: 0.4, skinPh: 2 }],
      ['ring .7', { kind: 'egg', color: 'red' }, { ring: 0.7, skin: 0.7, skinPh: 1 }],
      ['ring 1', { kind: 'egg', color: 'red' }, { ring: 1, skin: 1, skinPh: 0.2 }],
      ['dull (wrong)', { kind: 'egg', color: 'blue' }, { ring: 0.7, dull: 1, skin: 0.5, skinPh: 1.5 }],
      ['skin 1 ph 1.6 (bulge)', { kind: 'big' }, { skin: 1, skinPh: 1.6 }],
      ['skin 1 ph 4.7 (dip)', { kind: 'big' }, { skin: 1, skinPh: 4.7 }],
      ['skin .5 ph 3', { kind: 'big' }, { skin: 0.5, skinPh: 3 }],
      ['sq .8 (impact)', { kind: 'egg', color: 'green' }, { sq: 0.8 }],
      ['sq 1.15 (hop)', { kind: 'egg', color: 'green' }, { sq: 1.15 }],
      ['glow .5', { kind: 'shape', shape: 'star', color: 'yellow' }, { glow: 0.5 }],
      ['glow 1', { kind: 'shape', shape: 'heart', color: 'pink' }, { glow: 1 }],
      ['dim 1', { kind: 'egg', color: 'purple' }, { dim: 1 }],
      ['count 3/5', { kind: 'dots', n: 5 }, { count: 3 }],
      ['count 7/9', { kind: 'dots', n: 9 }, { count: 7 }],
      ['sing 1', { kind: 'animal', animal: 'owl' }, { sing: 1 }],
      ['sing .5 ring', { kind: 'animal', animal: 'duck' }, { sing: 0.5, ring: 0.6 }],
      ['pop .5', { kind: 'egg', color: 'orange' }, { pop: 0.5 }],
      ['pop 1.15', { kind: 'egg', color: 'orange' }, { pop: 1.15 }],
      ['big ring 1', { kind: 'big' }, { ring: 1, skin: 1, skinPh: 0.8, sq: 0.86 }]
    ];
    const cw = 170, chh = 210, cols = 10;
    size(cw * cols, chh * 4);
    ['noon', 'night'].forEach((mn, r) => {
      const m = MOODS[mn];
      sky(0, r * chh * 2, cw * cols, chh * 2, m);
      V.forEach((v, i) => {
        const x = cw * (i % cols) + cw / 2, y = (r * 2 + Math.floor(i / cols)) * chh + 160;
        const sz = v[1].kind === 'big' ? ITEM * 1.2 : ITEM;
        cushion(x, y, sz, { night: m.night, dent: v[2].sq && v[2].sq < 1 ? 0.8 : 0 });
        egg(v[1], x, y, sz, Object.assign({ night: m.night }, v[2]));
        label(v[0], x, y + 42, 12, m.ink);
      });
    });
  } else if (name === 'cushions') {
    size(1200, 620);
    ['morning', 'night'].forEach((mn, r) => {
      const m = MOODS[mn], oy = r * 310;
      sky(0, oy, 1200, 310, m);
      [0, 0.5, 1].forEach((d, i) => {
        const x = 110 + i * 190, y = oy + 120;
        cushion(x, y, ITEM, { dent: d, night: m.night }); flush();
        label('dent ' + d, x, y + 76, 12, m.ink);
      });
      [0, 0.5, 1].forEach((d, i) => {
        const x = 690 + i * 190, y = oy + 190, w = ITEM * 1.25, dip = A.cushionDip(w, d);
        cushion(x, y, ITEM, { dent: d, night: m.night });
        egg({ kind: 'egg', color: COLORS[i] }, x, y + dip, ITEM, { sq: 1 - 0.2 * d, night: m.night });
        label('dent ' + d + ' + egg (dip ' + dip.toFixed(1) + ')', x, y + 84, 12, m.ink);
      });
      [[0.4, 1], [1, 0.5]].forEach((pa, i) => {
        const x = 110 + i * 190, y = oy + 250;
        cushion(x, y, ITEM * 0.7, { pop: pa[0], alpha: pa[1], night: m.night }); flush();
        label('pop ' + pa[0] + ' alpha ' + pa[1], x + 220, y + 20, 11, m.ink);
      });
    });
  } else if (name === 'scene') {
    const ms = ['morning', 'noon', 'sunset', 'night'], lits = [0, 2, 3, 5], W = 1300, H = 520;
    size(W, H * 4);
    ms.forEach((mn, r) => {
      const m = MOODS[mn], oy = r * H;
      sky(0, oy, W, H, m);
      g.fillStyle = m.night ? '#2E4A4A' : '#9CC47E'; g.fillRect(0, oy + H - 60, W, 60);   // meadow stand-in
      const g0 = { x0: 300, x1: 1240, y: oy + 70, sag: 22 };
      const colsL = ['red', 'blue', 'yellow', 'green', null];
      const things0 = [{ kind: 'egg', color: 'red' }, { kind: 'shape', shape: 'star', color: 'blue' }, { kind: 'animal', animal: A.ANIMALS[r] }, { kind: 'dots', n: 4 }, { kind: 'glyph', text: 'B', color: 'green' }];
      const lanterns = [];
      for (let i = 0; i < 5; i++) {
        const x = g0.x0 + (g0.x1 - g0.x0) * (i + 1) / 6, u = (x - g0.x0) / (g0.x1 - g0.x0);
        const y = g0.y + 2 * g0.sag * 2 * u * (1 - u);
        lanterns.push({ x, y, lit: i < lits[r] ? 1 : 0, color: i < lits[r] ? colsL[i] : null, swing: (i - 2) * 0.05, flash: i === lits[r] - 1 ? 0.6 : 0,
          icon: things0[i], hidden: r === 3 && i >= lits[r], now: i === lits[r] ? 1 : 0 });
      }
      A.drawGarland(g, g0, lanterns, { t: r, night: m.night });
      // Rio spot + cymbal
      g.fillStyle = 'rgba(231,176,122,0.5)'; g.beginPath(); g.ellipse(120, oy + H - 140, 70, 90, 0, 0, Math.PI * 2); g.fill();
      label('Rio', 120, oy + H - 140, 14, m.ink);
      A.drawCymbal(g, { x: 260, y: oy + H - 60, s: 1 }, { tilt: r === 3 ? 0.18 : 0, ring: r === 3 ? 0.7 : 0, night: m.night, t: r });
      const things = things0;
      const hs = [0, -28, 10, -16, 24];
      things.forEach((t, i) => {
        const x = 430 + i * 185, y = oy + 330 + hs[i];
        cushion(x, y, ITEM, { night: m.night, t: i + r, dent: i === 1 ? 0.6 : 0 });
        egg(t, x, y + (i === 1 ? A.cushionDip(ITEM * 1.25, 0.6) : 0), ITEM, { night: m.night, ring: i === 1 ? 0.6 : 0, skin: i === 1 ? 0.8 : 0, skinPh: 1, sq: i === 1 ? 0.88 : 1, glow: i === 0 && r === 1 ? 0.8 : 0 });
      });
      A.drawNote(g, 620, oy + 170, 40, { color: 'blue', alpha: 1, rot: -0.2 });
      A.drawSpark(g, 330, oy + 300, 34, { color: r % 2 ? 'red' : null, t: r, vx: 1, vy: -0.5 });
      if (m.night) { A.drawFirefly(g, 520, oy + 200, 4.5, 1); A.drawFirefly(g, 900, oy + 230, 4, 0.5); }
      label(mn + ' — pods lit ' + lits[r] + (r === 3 ? ' (unplayed hidden "?")' : '') + ', next pod = now', W / 2, oy + H - 20, 15, m.night ? '#E8EEFF' : '#5A4F70');
    });
  } else if (name === 'pods') {
    const list = [].concat(COLORS.map(c => ({ kind: 'egg', color: c })), A.SHAPES.map((sh, i) => ({ kind: 'shape', shape: sh, color: COLORS[i % 7] })),
      A.ANIMALS.map(a => ({ kind: 'animal', animal: a })), [{ kind: 'dots', n: 3 }, { kind: 'big' }, { kind: 'glyph', text: 'B', color: 'red' }, { kind: 'number', n: 4 }]);
    const states = [['unlit', { lit: 0 }], ['now', { now: 1 }], ['lit', { lit: 1, flash: 0.3 }], ['hidden', { hidden: true }]];
    const cw = 64, rowH = 96, W = cw * list.length + 40;
    size(W, rowH * 4 * 2 + 300);
    ['noon', 'night'].forEach((mn, r) => {
      const m = MOODS[mn], oy = r * rowH * 4;
      sky(0, oy, W, rowH * 4, m);
      states.forEach((st, j) => {
        const y = oy + j * rowH + 20, gl = { x0: 20, x1: W - 20, y, sag: 0 };
        const L = list.map((t, i) => Object.assign({ x: 40 + i * cw + cw / 2 - 10, y, lit: 0, color: null, swing: 0, flash: 0, icon: t, hidden: false, now: 0 }, st[1], st[1].lit ? { color: t.color || null } : {}));
        A.drawGarland(g, gl, L, { t: j, night: m.night });
        label(st[0], 22, y + 70, 11, m.ink);
      });
    });
    // 2× close-up
    const oy = rowH * 8;
    sky(0, oy, W, 300, MOODS.sunset);
    g.save(); g.scale(2, 2);
    const pick = [{ kind: 'egg', color: 'yellow' }, { kind: 'shape', shape: 'heart', color: 'pink' }, { kind: 'animal', animal: 'frog' }, { kind: 'dots', n: 3 }, { kind: 'glyph', text: 'A', color: 'blue' }];
    const L2 = []; pick.forEach((t, i) => [{ lit: 0 }, { now: 1 }, { lit: 1, color: t.color || null }].forEach((st, j) => L2.push(Object.assign({ x: 40 + (i * 3 + j) * 46, y: oy / 2 + 30, lit: 0, color: null, swing: 0, flash: 0, icon: t, now: 0 }, st))));
    A.drawGarland(g, { x0: 20, x1: W / 2 - 20, y: oy / 2 + 30, sag: 6 }, L2, { t: 0.4, night: 0 });
    g.restore();
  } else if (name === 'misc') {
    size(1300, 1260, '#FDF3E1');
    sky(0, 0, 1300, 560, MOODS.noon);
    // cards n = 1..5, lit 0..n
    for (let n = 1; n <= 5; n++) {
      for (let l = 0; l <= n; l++) {
        const x = 60 + l * 105, y = 50 + (n - 1) * 105;
        if (x > 640) continue;
        A.drawCard(g, x, y, n, { lit: l, size: 92, flash: l === n ? 0.6 : 0 });
      }
    }
    label('stone tablets n 1..5 × lit 0..n (size 92)', 330, 548, 13, '#24425A');
    A.drawCard(g, 820, 150, 3, { lit: 2, size: 150 });
    A.drawCard(g, 990, 150, 8, { lit: 5, size: 150 });
    A.drawCard(g, 1160, 150, 12, { lit: 0, size: 150, pop: 0.85 });
    label('tablet 150 px: 3 lit 2 · 8 lit 5 · 12 pop .85', 990, 250, 12, '#24425A');
    [[0, 0], [0.2, 0.75], [-0.15, 0.4]].forEach((c, i) => { A.drawCymbal(g, { x: 800 + i * 170, y: 530, s: 1 }, { tilt: c[0], ring: c[1], t: i }); label('volcano tilt ' + c[0] + ' ring ' + c[1], 800 + i * 170, 550, 12, '#24425A'); });
    sky(0, 560, 1300, 220, MOODS.night);
    [null].concat(COLORS).forEach((c, i) => { A.drawNote(g, 50 + i * 82, 610, 46, { color: c, rot: (i % 3 - 1) * 0.2 }); A.drawSpark(g, 50 + i * 82, 720, 34, { color: c, t: i * 0.3, vx: 1, vy: -0.4 }); });
    A.drawCymbal(g, { x: 720, y: 770, s: 0.9 }, { ring: 0.55, night: 1, t: 2 });
    [0, 0.3, 0.6, 1].forEach((gl, i) => { A.drawFirefly(g, 790 + i * 70, 640, 5, gl); label('glow ' + gl, 790 + i * 70, 700, 11, '#E8EEFF'); });
    [0, 0.5, 1].forEach((p, i) => { g.save(); g.translate(1110 + i * 70, 600); A.drawGhostHand(g, 70, p); g.restore(); });
    const icons = [{ kind: 'number', n: 3 }, { kind: 'number', n: 5 }, { kind: 'color', color: 'green' }, { kind: 'size', big: true, color: 'blue' }, { kind: 'size', big: false, color: 'blue' },
      { kind: 'sound', animal: 'duck' }, { kind: 'sound', animal: 'owl' }, { kind: 'sound', animal: 'snake' }, { kind: 'letter', text: 'B' }, { kind: 'big' },
      { kind: 'egg', color: 'purple' }, { kind: 'dots', n: 4 }, { kind: 'animal', animal: 'dino' }, { kind: 'shape', shape: 'rect', color: 'orange' }];
    icons.forEach((t, i) => {
      const x = 90 + (i % 7) * 180, y = 870 + Math.floor(i / 7) * 190;
      g.fillStyle = '#FFFFFF'; g.fillRect(x - 70, y - 70, 140, 140); g.strokeStyle = 'rgba(80,120,200,0.4)'; g.strokeRect(x - 60, y - 60, 120, 120);
      g.save(); g.translate(x, y); A.drawIcon(g, t, 120); g.restore();
      label(t.kind + (t.n ? ' ' + t.n : '') + (t.animal ? ' ' + t.animal : '') + (t.big != null ? (t.big ? ' big' : ' small') : ''), x, y + 88, 12);
    });
  }
  return cv.toDataURL('image/png');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const all = ['all_morning', 'all_noon', 'all_sunset', 'all_night', 'eggs_3x', 'shapes_3x', 'big_3x', 'dots_3x', 'animals_3x', 'glyphs_3x',
    'states', 'cushions', 'scene', 'pods', 'misc'];
  const names = process.argv.slice(2).length ? process.argv.slice(2) : all;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ content: ART });
  for (const name of names) {
    const url = await page.evaluate(pageSheet, { name });
    const file = path.join(OUT, 'egg_' + name + '.png');
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', path.relative(ROOT, file));
  }
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
