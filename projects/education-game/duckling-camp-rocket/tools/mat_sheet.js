// Mimi's Splash Rocket — contact sheets for DK.MatArt (game/js/mat_art.js) → docs/art/mat_*.png
// Usage: node tools/mat_sheet.js [name ...]       (Playwright + the preinstalled Chromium; no install)
//   mat_things.png     every thing ON a mat at in-game size (S = 170, itemH = 105): 5 objs × 7 colours, 8 shapes × 2 colours,
//                      pinecones 1–12, + numeral 1–8, tiles, 12 animals, big:false — rows cycle the 4 meadow colours
//   mat_things_3x.png  a selection at 3× (S = 510) to check outlines / shading
//   mat_states.png     the unfold animation strip (0 → 1.15), flap −1..1, squish, gold, glow, active, wet, alpha, count rings,
//                      wiggle, variants — on 2 meadow colours
//   mat_camp.png       flagpole + pennants (colour things / others / flutter frames / mirrored), launch pad aims, foot pump
//                      press / gauge / count / glow, aim arc, drops, puddle rings, burrow, rock — on the 4 meadow colours
//   mat_pad_3x.png     the launch pad + foot pump at 3× (rest / pressed)
//   mat_icons.png      Talk-time icons, home badges, hint hand presses
//   mat_round.png      mock launches (3 mats in perspective + camp corner) per mood, in-game logical and iPhone scale (×0.54)
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs/art');
const JS = ['rng.js', 'content.js', 'mat_art.js'].map(f => path.join(ROOT, 'game/js', f)).filter(f => fs.existsSync(f));
const ANDIR = path.join(ROOT, 'game/assets/default/animals');

function pageSheet({ name }) {
  const A = window.DK.MatArt;
  const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  const MEADOWS = [['sunny', '#A9CF8E', '#26381E'], ['breezy', '#A2C78C', '#26381E'], ['rain', '#8FB385', '#F4FBF0'], ['rainbow', '#AFD596', '#26381E']];
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  function size(w, h, bg) { cv.width = w; cv.height = h; g.fillStyle = bg || '#F4F1EA'; g.fillRect(0, 0, w, h); }
  function meadow(x, y, w, h, i) {
    const c = MEADOWS[i % 4][1], gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, shade(c, 0.05)); gr.addColorStop(1, shade(c, -0.05));
    g.fillStyle = gr; g.fillRect(x, y, w, h);
  }
  function shade(hex, t) { const n = parseInt(hex.slice(1), 16), r = n >> 16, gg = (n >> 8) & 255, b = n & 255, f = v => Math.max(0, Math.min(255, Math.round(v + v * t))); return 'rgb(' + f(r) + ',' + f(gg) + ',' + f(b) + ')'; }
  function label(t, x, y, s, col) { g.save(); g.font = '700 ' + (s || 12) + 'px system-ui, sans-serif'; g.fillStyle = col || '#3A3640'; g.textAlign = 'center'; g.fillText(t, x, y); g.restore(); }
  // a mat with its thing, the way render.js draws it: translate to the mat centre → drawMat → drawThing (itemH = 0.62·S)
  function mat(x, y, S, th, mo, to) {
    g.save(); g.translate(x, y);
    A.drawMat(g, S, mo || {});
    if (th && (!mo || mo.unfold == null || mo.unfold >= 1)) A.drawThing(g, th, S * 0.62, to || {});
    g.restore();
  }
  const lab = t => !t ? '' : t.kind === 'obj' ? t.color + ' ' + t.obj : t.kind === 'shape' ? t.color + ' ' + t.shape : t.kind === 'dots' ? t.n + ' cone' + (t.n > 1 ? 's' : '') + (t.numeral ? ' +N' : '') : t.kind === 'tile' ? '"' + t.text + '"' : t.animal + (t.big === false ? ' small' : '');

  if (name === 'things') {
    const list = [];
    A.OBJS.forEach(o => COLORS.forEach(c => list.push({ kind: 'obj', obj: o, color: c })));
    A.SHAPES.forEach((s, i) => list.push({ kind: 'shape', shape: s, color: COLORS[(i * 3) % 7] }));
    A.SHAPES.forEach((s, i) => list.push({ kind: 'shape', shape: s, color: COLORS[(i * 3 + 4) % 7] }));
    for (let n = 1; n <= 12; n++) list.push({ kind: 'dots', n });
    for (let n = 1; n <= 8; n++) list.push({ kind: 'dots', n, numeral: true });
    ['A', 'a', 'M', 'g', 'Q', '3+2', '7−4', '14+6', '10+10', '9', '20', 'Đ'].forEach(text => list.push({ kind: 'tile', text }));
    A.ANIMALS.forEach(a => list.push({ kind: 'animal', animal: a }));
    list.push({ kind: 'obj', obj: 'ball', color: 'red', big: false }, { kind: 'obj', obj: 'mug', color: 'yellow', big: false }, { kind: 'animal', animal: 'pig', big: false });
    const cols = 12, cw = 190, rh = 210, rows = Math.ceil(list.length / cols);
    size(cw * cols, rh * rows + 20);
    for (let r = 0; r < rows; r++) meadow(0, 20 + r * rh, cv.width, rh, r);
    label('mat_things · S = 170, itemH = 105 (in-game logical px) · rows cycle the 4 meadow colours (sunny, breezy, rain, rainbow)', cv.width / 2, 15, 13);
    list.forEach((t, i) => {
      const r = Math.floor(i / cols), x = cw * (i % cols) + cw / 2, y = 20 + rh * r + 148;
      mat(x, y, 170, t, { seed: i });
      label(lab(t), x, y + 52, 11, MEADOWS[r % 4][2]);
    });
  } else if (name === 'things_3x') {
    const list = [{ kind: 'obj', obj: 'mug', color: 'red' }, { kind: 'obj', obj: 'lantern', color: 'blue' }, { kind: 'obj', obj: 'flower', color: 'yellow' },
      { kind: 'obj', obj: 'mushroom', color: 'purple' }, { kind: 'obj', obj: 'lantern', color: 'yellow' }, { kind: 'obj', obj: 'mug', color: 'green' },
      { kind: 'dots', n: 5 }, { kind: 'dots', n: 3, numeral: true }, { kind: 'animal', animal: 'penguin' }];
    const cw = 560, rh = 560, cols = 3, rows = Math.ceil(list.length / cols);
    size(cw * cols, rh * rows);
    list.forEach((t, i) => {
      const x0 = cw * (i % cols), y0 = rh * Math.floor(i / cols);
      meadow(x0, y0, cw, rh, i);
      mat(x0 + cw / 2, y0 + rh * 0.72, 510, t, { seed: i, wet: i === 2 ? 1 : 0 });
      label(lab(t) + ' · ' + MEADOWS[i % 4][0] + (i === 2 ? ' · wet 1' : ''), x0 + cw / 2, y0 + rh - 12, 15, MEADOWS[i % 4][2]);
    });
  } else if (name === 'states') {
    const ball = { kind: 'obj', obj: 'ball', color: 'blue' }, mug = { kind: 'obj', obj: 'mug', color: 'red' };
    const V = [];
    [0, 0.08, 0.2, 0.35, 0.5, 0.65, 0.8, 0.92, 1, 1.12, 1.05, 1].forEach((u, i) => V.push(['unfold ' + u, i >= 8 ? mug : null, { seed: 1, unfold: u }]));
    [-1, -0.5, 0.5, 1].forEach(f => V.push(['flap ' + f, mug, { seed: 2, flap: f, t: 0.2 }]));
    [1, 0.5, -0.4].forEach(s => V.push(['squish ' + s, mug, { seed: 2, squish: s }]));
    V.push(['gold .4', mug, { seed: 3, gold: 0.4 }], ['gold 1', mug, { seed: 3, gold: 1 }], ['glow .5', ball, { seed: 4, glow: 0.5 }], ['glow 1 (+thing)', ball, { seed: 4, glow: 1 }, { glow: 1 }],
      ['active 1', ball, { seed: 5, active: 1 }], ['active .5 t1', ball, { seed: 5, active: 0.5, t: 1 }], ['active+glow', ball, { seed: 5, active: 1, glow: 0.8 }],
      ['wet .5', mug, { seed: 0, wet: 0.5 }], ['wet 1', mug, { seed: 0, wet: 1 }], ['alpha .5', mug, { seed: 1, alpha: 0.5 }],
      ['count 0/5', { kind: 'dots', n: 5 }, { seed: 2 }, { count: 0 }], ['count 3/5', { kind: 'dots', n: 5 }, { seed: 2 }, { count: 3 }], ['count 8/8', { kind: 'dots', n: 8 }, { seed: 2 }, { count: 8 }],
      ['wiggle −1', { kind: 'obj', obj: 'lantern', color: 'orange' }, { seed: 4 }, { wiggle: -1 }], ['wiggle 1', { kind: 'obj', obj: 'lantern', color: 'orange' }, { seed: 4 }, { wiggle: 1 }],
      ['thing alpha .4', mug, { seed: 2, gold: 1 }, { alpha: 0.4 }], ['big:false', { kind: 'obj', obj: 'mushroom', color: 'purple', big: false }, { seed: 3 }], ['big', { kind: 'obj', obj: 'mushroom', color: 'purple' }, { seed: 3 }]);
    for (let v = 0; v < 4; v++) V.push(['variant ' + v, null, { seed: v }]);
    const cw = 190, rh = 190, cols = 12, rows = Math.ceil(V.length / cols);
    size(cw * cols, rh * rows * 2 + 20);
    label('mat_states · S = 170 · top: sunny #A9CF8E · bottom: rain #8FB385 · row 1 = the unfold animation strip', cv.width / 2, 15, 13);
    [0, 2].forEach((wi, half) => {
      const oy = 20 + half * rh * rows;
      meadow(0, oy, cv.width, rh * rows, wi);
      V.forEach((v, i) => {
        const x = cw * (i % cols) + cw / 2, y = oy + rh * Math.floor(i / cols) + 128;
        mat(x, y, 170, v[1], Object.assign({ wet: wi === 2 && v[2].wet == null ? 0.6 : v[2].wet || 0 }, v[2]), v[3] || {});
        label(v[0], x, y + 52, 11, MEADOWS[wi][2]);
      });
    });
  } else if (name === 'camp') {
    const W = 1500, H = 560;
    size(W, H * 4);
    const pennants = [[{ kind: 'obj', obj: 'mug', color: 'red' }, { kind: 'obj', obj: 'lantern', color: 'blue' }, { kind: 'obj', obj: 'flower', color: 'yellow' }, { kind: 'shape', shape: 'star', color: 'green' }, { kind: 'obj', obj: 'ball', color: 'purple' }],
      [{ kind: 'dots', n: 1, numeral: true }, { kind: 'dots', n: 2, numeral: true }, { kind: 'dots', n: 3, numeral: true }, { kind: 'dots', n: 4 }, { kind: 'dots', n: 5 }],
      [{ kind: 'animal', animal: 'cow' }, { kind: 'animal', animal: 'penguin' }, { kind: 'animal', animal: 'lion' }, { kind: 'tile', text: 'A' }, { kind: 'tile', text: '3+2' }],
      [{ kind: 'shape', shape: 'heart', color: 'pink' }, { kind: 'shape', shape: 'triangle', color: 'orange' }, { kind: 'obj', obj: 'mushroom', color: 'red' }, { kind: 'obj', obj: 'mug', color: 'yellow' }, { kind: 'obj', obj: 'lantern', color: 'green' }]];
    for (let wi = 0; wi < 4; wi++) {
      const oy = wi * H;
      meadow(0, oy, W, H, wi);
      // pole with 5 pennants (slot pitch 46), w = 72
      const px = 70, y0 = oy + H - 40, y1 = oy + 60;
      A.drawPole(g, px, y0, y1, { t: wi });
      pennants[wi].forEach((t, j) => { g.save(); g.translate(px + 4, y1 + 24 + j * 46); A.drawPennant(g, t, 72, { flutter: 0.5, t: wi + j * 0.5 }); g.restore(); });
      // mirrored pole (portrait: pole on the right)
      A.drawPole(g, 330, y0, y1 + 80, { t: wi + 1 });
      pennants[(wi + 1) % 4].slice(0, 3).forEach((t, j) => { g.save(); g.translate(326, y1 + 104 + j * 46); A.drawPennant(g, t, 72, { flutter: 1, t: j, dir: -1 }); g.restore(); });
      label('pole + pennants (dir 1 / dir −1)', 200, oy + 24, 12, MEADOWS[wi][2]);
      // flutter frames of one pennant, at 3×
      [0, 0.25, 0.5, 0.75].forEach((tt, k) => { g.save(); g.translate(400 + k * 240, oy + 50); g.scale(3, 3); A.drawPennant(g, pennants[wi][k % 5], 72, { flutter: 1, t: tt }); g.restore(); });
      label('pennants ×3, flutter 1, t 0 / .25 / .5 / .75 — ' + MEADOWS[wi][0], 850, oy + 24, 12, MEADOWS[wi][2]);
      // pad + pump at in-game size
      const aims = [-0.5, 0, 0.35, 0.6];
      aims.forEach((aim, k) => {
        const x = 440 + k * 200, y = oy + 420, pump = { x: x + 70, y: y + 20 };
        A.drawPad(g, x, y, { aim, hose: A.pumpHose(pump.x, pump.y) });
        A.drawPump(g, pump.x, pump.y, { press: [0, 1, 0.5, 0][k], gauge: [0, 0.33, 0.66, 1][k], count: k, glow: k === 3 ? 1 : 0 });
        label('aim ' + aim + ' · press ' + [0, 1, 0.5, 0][k] + ' · gauge ' + [0, 0.33, 0.66, 1][k] + ' · count ' + k + (k === 3 ? ' · glow' : ''), x + 40, oy + 540, 11, MEADOWS[wi][2]);
      });
      // aim arc + water bits + burrow + rock
      const pts = []; for (let i = 0; i < 14; i++) { const f = i / 13; pts.push({ x: 1240 + f * 220 - 110, y: oy + 260 - Math.sin(f * Math.PI * 0.9) * 170 }); }
      A.drawArc(g, pts, { t: wi * 0.3, alpha: 1 });
      [3, 5, 7].forEach((r, i) => A.drawDrop(g, 1150 + i * 26, oy + 300, r, 1));
      [24, 44, 70].forEach((r, i) => A.drawPuddleRing(g, 1330, oy + 310, r, 1 - i * 0.3));
      A.drawBurrow(g, 1290, oy + 400, 34);
      A.drawRock(g, 1420, oy + 420, 110);
      label('aim arc · drops · puddle rings · burrow · rock', 1300, oy + 470, 11, MEADOWS[wi][2]);
    }
  } else if (name === 'pad_3x') {
    size(1800, 640);
    [0, 1].forEach(k => {
      meadow(k * 900, 0, 900, 640, k * 2);
      g.save(); g.translate(k * 900, 0); g.scale(3, 3);
      const pad = { x: 70, y: 120 }, pump = { x: 200, y: 130 };
      A.drawPad(g, pad.x, pad.y, { aim: k ? 0.45 : 0, hose: A.pumpHose(pump.x, pump.y) });
      A.drawPump(g, pump.x, pump.y, { press: k, gauge: k ? 0.66 : 0.1, count: k ? 2 : 0, glow: k ? 0 : 1 });
      g.restore();
      label(k ? 'pad aim .45 · pump press 1, gauge .66, count 2 (×3)' : 'pad aim 0 · pump press 0, gauge .1, count 0, glow 1 (×3)', k * 900 + 450, 625, 14, MEADOWS[k * 2][2]);
    });
  } else if (name === 'icons') {
    size(1420, 980, '#FFF8EE');
    const icons = [{ kind: 'color', color: 'red' }, { kind: 'color', color: 'yellow' }, { kind: 'color', color: 'blue' }, { kind: 'color', color: 'purple' }, { kind: 'color', color: 'pink' },
      { kind: 'number', n: 1 }, { kind: 'number', n: 3 }, { kind: 'number', n: 5 }, { kind: 'number', n: 8 }, { kind: 'number', n: 12 },
      { kind: 'home', home: 'farm' }, { kind: 'home', home: 'sea' }, { kind: 'home', home: 'ice' }, { kind: 'home', home: 'jungle' }, { kind: 'home', home: 'savanna' },
      { kind: 'size', big: true }, { kind: 'size', big: false }, { kind: 'size', big: false, thing: { kind: 'animal', animal: 'sheep' } }, { kind: 'letter', text: 'B' }, { kind: 'obj', obj: 'mug', color: 'blue' },
      { kind: 'obj', obj: 'flower', color: 'purple' }, { kind: 'shape', shape: 'triangle', color: 'orange' }, { kind: 'dots', n: 4 }, { kind: 'dots', n: 6, numeral: true },
      { kind: 'tile', text: '7−4' }, { kind: 'animal', animal: 'lion' }, { kind: 'shape', shape: 'heart', color: 'pink' }, { kind: 'obj', obj: 'lantern', color: 'green', big: false }];
    icons.forEach((t, i) => {
      const x = 75 + (i % 10) * 135, y = 85 + Math.floor(i / 10) * 175;
      g.fillStyle = '#FFFFFF'; g.fillRect(x - 60, y - 60, 120, 120); g.strokeStyle = 'rgba(120,100,80,0.4)'; g.strokeRect(x - 55, y - 55, 110, 110);
      g.save(); g.translate(x, y); A.drawIcon(g, t, 110); g.restore();
      label(t.kind + (t.n ? ' ' + t.n : '') + (t.big != null ? (t.big ? ' big' : ' small') : '') + (t.home ? ' ' + t.home : '') + (t.color ? ' ' + t.color : '') + (t.obj ? ' ' + t.obj : ''), x, y + 76, 11);
    });
    meadow(0, 600, 1420, 380, 0);
    [0, 0.5, 1].forEach((p, i) => { mat(150 + i * 200, 790, 170, { kind: 'obj', obj: 'ball', color: 'red' }, { seed: i, glow: 0.7, active: 1 }, { glow: 0.7 }); A.drawHintHand(g, 150 + i * 200, 755, p, 1); label('press ' + p, 150 + i * 200, 960, 12); });
    mat(760, 790, 170, { kind: 'obj', obj: 'ball', color: 'red' }, { seed: 4 }); A.drawHintHand(g, 760, 755, 0, 0.5); label('alpha .5', 790, 960, 12);
    A.HOMES.forEach((h, i) => { g.save(); g.translate(950 + i * 95, 700); A.drawHomeBadge(g, h, 40, {}); g.restore(); g.save(); g.translate(950 + i * 95, 830); A.drawHomeBadge(g, h, 30, { a: 0.7, pop: 0.8 }); g.restore(); });
    label('home badges r40 / r30 a.7 pop.8', 1140, 960, 12);
  } else if (name === 'round') {
    const R = [
      ['sunny · colours: land on the RED one', 0, [{ kind: 'obj', obj: 'mug', color: 'red' }, { kind: 'obj', obj: 'lantern', color: 'blue' }, { kind: 'obj', obj: 'flower', color: 'yellow' }],
        [{ kind: 'obj', obj: 'ball', color: 'red' }]],
      ['breezy · shapes: the star', 1, [{ kind: 'shape', shape: 'circle', color: 'orange' }, { kind: 'shape', shape: 'star', color: 'orange' }, { kind: 'shape', shape: 'heart', color: 'orange' }],
        [{ kind: 'shape', shape: 'star', color: 'orange' }]],
      ['rain · count: land on 1, then 2, then 3', 2, [{ kind: 'dots', n: 3, numeral: true }, { kind: 'dots', n: 1, numeral: true }, { kind: 'dots', n: 2, numeral: true }],
        [{ kind: 'dots', n: 1, numeral: true }, { kind: 'dots', n: 2, numeral: true }]],
      ['rainbow · who lives on the farm?', 3, [{ kind: 'animal', animal: 'penguin' }, { kind: 'animal', animal: 'cow' }, { kind: 'animal', animal: 'lion' }],
        [{ kind: 'animal', animal: 'pig' }, { kind: 'animal', animal: 'hen' }]]
    ];
    const W = 1280, H = 720;
    size(W * 2, H * R.length);
    R.forEach((r, ri) => {
      const oy = ri * H;
      for (let half = 0; half < 2; half++) {
        const ox = half * W, k = half ? 0.54 : 1;
        g.save(); g.beginPath(); g.rect(ox, oy, W, H); g.clip();
        g.fillStyle = '#F1EFE6'; g.fillRect(ox, oy, W, H);
        g.save(); g.translate(ox + W * (1 - k) / 2, oy + H * (1 - k) / 2); g.scale(k, k);
        const sky = g.createLinearGradient(0, 0, 0, 216); sky.addColorStop(0, '#9FD3EE'); sky.addColorStop(1, '#F3F7EE'); g.fillStyle = sky; g.fillRect(0, 0, W, 216);
        meadow(0, 216, W, H - 216, r[1]);
        const hz = 216, bot = H - 20, wet = r[1] === 2 ? 1 : 0;
        // camp column: pole, pennants, pad, pump
        const pole = { x: 40, y0: H - 30, y1: 120 };
        A.drawPole(g, pole.x, pole.y0, pole.y1, { t: ri });
        r[3].forEach((t, j) => { g.save(); g.translate(pole.x + 4, pole.y1 + 24 + j * 46); A.drawPennant(g, t, 72, { flutter: 0.5, t: ri + j }); g.restore(); });
        const pad = { x: 200, y: H - 60 }, pump = { x: 150, y: H - 70 };
        const pts = []; for (let i = 0; i < 14; i++) { const f = i / 13; pts.push({ x: pad.x + f * (700 - pad.x), y: pad.y - 60 - Math.sin(f * Math.PI * 0.95) * 340 + f * 0 }); }
        A.drawArc(g, pts, { t: 0.4 });
        A.drawPad(g, pad.x, pad.y, { aim: 0.42, hose: A.pumpHose(pump.x, pump.y) });
        A.drawPump(g, pump.x, pump.y, { press: 0.3, gauge: 0.33, count: 1, glow: 0.6 });
        // fake rocket outline on the pad
        g.save(); g.translate(pad.x, pad.y); g.rotate(0.42); g.fillStyle = 'rgba(221,239,242,0.85)'; g.strokeStyle = '#7FA3AA'; g.lineWidth = 3;
        g.beginPath(); g.roundRect ? g.roundRect(-22, -110, 44, 106, 16) : g.rect(-22, -110, 44, 106); g.fill(); g.stroke(); g.restore();
        // 3 mats in perspective
        const homes = [[480, hz + 110], [760, hz + 300], [1060, hz + 170]];
        homes.sort((a, b) => a[1] - b[1]).forEach((p, i) => {
          const ds = 0.82 + 0.18 * (p[1] - hz) / (bot - hz), S = 170 * ds, j = r[2].indexOf(r[2][i]);
          mat(p[0], p[1], S, r[2][i], { seed: ri * 3 + i, active: i === 1 ? 1 : 0, wet, glow: 0 }, {});
        });
        // a folding mat + an unfolding mat (frames from the animation)
        mat(1180, hz + 420, 150, null, { seed: 2, unfold: 0.35, wet });
        g.restore();
        g.restore();
        label(r[0] + (half ? ' · iPhone scale ×0.54' : ' · in-game logical (1280×720)'), ox + W / 2, oy + 22, 15, '#2E3A2A');
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
    window.DK = window.DK || {};
    window.DK.Assets = { images: imgs, has: k => !!imgs[k], img: k => imgs[k] || null };
    return Object.keys(imgs).length;
  }, map);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const all = ['things', 'things_3x', 'states', 'camp', 'pad_3x', 'icons', 'round'];
  const names = process.argv.slice(2).length ? process.argv.slice(2) : all;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.setContent('<!doctype html><html><body></body></html>');
  for (const f of JS) {
    try { await page.addScriptTag({ content: fs.readFileSync(f, 'utf8') }); } catch (e) { console.warn('skip', path.basename(f), e.message); }
  }
  const nA = await setupAnimals(page);
  if (nA) console.log('animal images loaded:', nA);
  for (const name of names) {
    const url = await page.evaluate(pageSheet, { name });
    const file = path.join(OUT, 'mat_' + name + '.png');
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', path.relative(ROOT, file));
  }
  const st = await page.evaluate(() => window.DK.MatArt.stats);
  console.log('cache stats', JSON.stringify(st));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
