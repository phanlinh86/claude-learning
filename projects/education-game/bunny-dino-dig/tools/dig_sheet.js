// Bun's Dino Dig — contact sheets for DD.DigArt (game/js/dig_art.js) → docs/art/dig_*.png
// Usage: node tools/dig_sheet.js
//   dig_things.png        every thing kind × colour / shape / animal at in-game size (item 112), with its thingBox (faint)
//   dig_{eggs,stones,toys,misc}_3x.png   the same at 3×
//   dig_mounds_<mood>.png mounds at dig 0 / 0.33 / 0.66 / 1, risen, glow — a thing peeking, clipped as DESIGN §5.2
//   dig_peek.png          every shape / animal / tablet buried at dig 0 (peek, and age-5 peek × 0.85) — top-read check
//   dig_clip.png          wide things with the §5.2 rect clip (top rows) vs DigArt.clipBuried (bottom rows)
//   dig_tools.png         shovel, sand bits, shelf with items, ghost hand, every icon kind
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { RECIPE } = require('./env_scenes.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs/art');
const ART = fs.readFileSync(path.join(ROOT, 'game/js/dig_art.js'), 'utf8');
const ENV = { SKY: RECIPE.SKY, SAND: RECIPE.SAND, SAND_BOTTOM: RECIPE.SAND_BOTTOM };

// runs in the page: draws one sheet, returns a PNG data URL
function pageSheet({ name, ENV }) {
  const A = window.DD.DigArt;
  const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  const SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
  const ANIMALS = ['duck', 'cat', 'dog', 'cow', 'pig', 'frog', 'lion', 'elephant'];
  const FONT = A.FONT;
  const ITEM = 112;
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  function size(w, h, bg) { cv.width = w; cv.height = h; g.fillStyle = bg || '#F4EFE6'; g.fillRect(0, 0, w, h); }
  function label(t, x, y, s, col) { g.save(); g.font = '700 ' + (s || 13) + 'px ' + FONT; g.fillStyle = col || '#4A4237'; g.textAlign = 'center'; g.fillText(t, x, y); g.restore(); }
  function thingCell(t, x, y, sz, opt, lab) {   // (x, y) = bottom centre
    const b = A.thingBox(t, sz);
    g.save(); g.strokeStyle = 'rgba(80,120,200,0.35)'; g.setLineDash([4, 4]); g.lineWidth = 1;
    g.strokeRect(x - b.w / 2, y + b.top, b.w, b.h); g.restore();
    g.save(); g.translate(x, y); A.drawThing(g, t, sz, Object.assign({ time: 0.3 }, opt || {})); g.restore();
    if (lab) label(lab, x, y + 18 * sz / ITEM);
  }
  const ROWS = {
    eggs: [...COLORS.map(c => [{ kind: 'egg', color: c }, {}, c]), [{ kind: 'egg', color: 'red' }, { crack: 0.55 }, 'crack .55'],
      [{ kind: 'egg', color: 'blue' }, { crack: 1 }, 'crack 1'], [{ kind: 'eggTop', color: 'green' }, {}, 'eggTop'], [{ kind: 'eggBottom', color: 'green' }, {}, 'eggBottom'],
      [{ kind: 'egg', color: 'purple' }, { glow: 1 }, 'glow'], [{ kind: 'egg', color: 'orange' }, { dim: 1 }, 'dim']],
    stones: SHAPES.map((s, i) => [{ kind: 'stone', shape: s, color: COLORS[i % 7] }, {}, s]).concat([[{ kind: 'stone', shape: 'star' }, {}, 'no colour']]),
    toys: ANIMALS.map(a => [{ kind: 'toy', animal: a }, {}, a]),
    misc: [[{ kind: 'bone' }, {}, 'bone'], [{ kind: 'bone' }, {}, 'bone small', 0.72], [{ kind: 'tablet', text: 'A' }, {}, 'A'], [{ kind: 'tablet', text: 'b' }, {}, 'b'],
      [{ kind: 'tablet', text: '7' }, {}, '7'], [{ kind: 'tablet', text: '12' }, {}, '12'], [{ kind: 'tablet', text: 'Đ' }, {}, 'Đ'], [{ kind: 'tablet', text: 'g' }, {}, 'g'],
      [{ kind: 'dino', color: 'green' }, {}, 'dino'], [{ kind: 'egg', color: 'yellow' }, { night: 1 }, 'night'], [{ kind: 'toy', animal: 'lion' }, { night: 1 }, 'night']]
  };

  if (name === 'things') {
    const cw = 150, chh = 175, cols = 11;
    size(cw * cols, chh * 4 + 20);
    Object.keys(ROWS).forEach((k, r) => ROWS[k].forEach((q, i) => thingCell(q[0], cw * i + cw / 2, chh * r + 140, ITEM * (q[3] || 1), q[1], q[2])));
  } else if (/_3x$/.test(name)) {
    const k = name.replace('_3x', ''), list = ROWS[k], S = ITEM * 3, cw = 400, chh = 420, cols = Math.min(6, list.length);
    size(cw * cols, chh * Math.ceil(list.length / cols) + 20);
    list.forEach((q, i) => thingCell(q[0], cw * (i % cols) + cw / 2, chh * Math.floor(i / cols) + 370, S * (q[3] || 1), q[1], q[2]));
  } else if (/^mounds_/.test(name) || name === 'peek' || name === 'clip') {
    const mood = name === 'peek' || name === 'clip' ? 'noon' : name.replace('mounds_', ''), nightV = mood === 'night' ? 1 : 0;
    const w = ITEM * 1.55, h0 = ITEM * 0.62, cw = 220, chh = 230;
    let cells;
    if (name === 'peek') {
      const P = { egg: 0.38, stone: 0.42, toy: 0.48, bone: 0.40, tablet: 0.62 };
      const things = SHAPES.map((s, i) => ({ kind: 'stone', shape: s, color: COLORS[i % 7] })).concat(ANIMALS.map(a => ({ kind: 'toy', animal: a })))
        .concat([{ kind: 'egg', color: 'red' }, { kind: 'bone' }, { kind: 'tablet', text: 'M' }, { kind: 'tablet', text: '9' }]);
      cells = [];
      things.forEach(t => { cells.push({ t, dig: 0, peek: P[t.kind], lab: (t.shape || t.animal || t.text || t.kind) }); });
      things.forEach(t => { cells.push({ t, dig: 0, peek: P[t.kind] * 0.85, lab: (t.shape || t.animal || t.text || t.kind) + ' ×.85', size: 104 }); });
      size(cw * 10, chh * Math.ceil(cells.length / 10) + 10, ENV.SAND_BOTTOM[mood]);
    } else if (name === 'clip') {
      const things = [[{ kind: 'stone', shape: 'rect', color: 'purple' }, 0.42], [{ kind: 'stone', shape: 'star', color: 'yellow' }, 0.42],
        [{ kind: 'stone', shape: 'triangle', color: 'red' }, 0.42], [{ kind: 'toy', animal: 'elephant' }, 0.48]];
      cells = [];
      ['rect clip', 'clipBuried'].forEach(mode => things.forEach(([t, peek]) => [0, 0.2, 0.33, 0.5, 0.66, 0.85, 1].forEach(d =>
        cells.push({ t, peek, dig: d, mode, lab: mode + ' ' + d }))));
      size(cw * 7, chh * 8 + 10, ENV.SAND_BOTTOM[mood]);
    } else {
      const things = [[{ kind: 'egg', color: 'red' }, 0.38], [{ kind: 'stone', shape: 'star', color: 'blue' }, 0.42], [{ kind: 'stone', shape: 'rect', color: 'green' }, 0.42],
        [{ kind: 'toy', animal: 'duck' }, 0.48], [{ kind: 'bone' }, 0.40], [{ kind: 'tablet', text: 'B' }, 0.62]];
      const cols = [{ dig: 0 }, { dig: 0.33 }, { dig: 0.66 }, { dig: 1 }, { dig: 1, rise: 1 }, { dig: 0, glow: 1, sparkle: 1 }, { dig: 1, rise: 1, dim: 1 }];
      cells = [];
      things.forEach(([t, peek]) => cols.forEach(c => cells.push(Object.assign({ t, peek }, c, { lab: c.rise ? (c.dim ? 'wrong (dim)' : 'risen') : c.glow ? 'glow' : 'dig ' + c.dig }))));
      size(cw * cols.length, chh * things.length + 10, ENV.SAND_BOTTOM[mood]);
      // sky band behind the top row so the first mound's thing is seen against the sky too
      const sky = ENV.SKY[mood], gr = g.createLinearGradient(0, 0, 0, 90);
      sky.forEach(s => gr.addColorStop(s[0], s[1])); g.fillStyle = gr; g.fillRect(0, 0, cv.width, 90);
    }
    const perRow = name === 'peek' ? 10 : 7;
    cells.forEach((c, i) => {
      const x = cw * (i % perRow) + cw / 2, y = chh * Math.floor(i / perRow) + 200, sz = c.size || ITEM;
      const m = { id: 'm' + i, w, h0, dig: c.dig };
      // DESIGN §5.2: pileTop = y − h0·(1 − dig); buried thingY = pileTop + size·(1 − peek), clipY = pileTop + 4;
      // rise → thingY = y − 0.12·h0, clipY = y + 2; when rise > 0.6 the thing is drawn again unclipped on top.
      const pileTop = y - h0 * (1 - c.dig), rise = c.rise || 0;
      const thingY = rise ? y - 0.12 * h0 : pileTop + sz * (1 - c.peek), clipY = rise ? y + 2 : pileTop + 4;
      const mo = { night: nightV, glow: c.glow || 0, sparkle: c.sparkle || 0, time: 0.2 };
      const to = { night: nightV, glow: c.glow || 0, dim: c.dim || 0, time: 0.2 };
      g.save(); g.translate(x, y); A.drawHoleBack(g, m, mo); g.restore();
      g.save();
      if (c.mode === 'clipBuried' && !rise) { g.translate(x, y); A.clipBuried(g, m, mo); g.translate(-x, -y); }
      else { g.beginPath(); g.rect(x - cw / 2, y - 400, cw, clipY - (y - 400)); g.clip(); }
      g.translate(x, thingY); A.drawThing(g, c.t, sz, to); g.restore();
      g.save(); g.translate(x, y); A.drawMound(g, m, mo); g.restore();
      if (rise > 0.6) { g.save(); g.translate(x, thingY); A.drawThing(g, c.t, sz, to); g.restore(); }
      label(c.lab, x, y + 26, 13, nightV ? '#E8ECF8' : '#4A4237');
    });
    if (name !== 'clip') label(name === 'peek' ? 'peek (age ≤ 4, item 112) / ×0.85 (age 5, item 104), dig 0 — noon' : mood, 40, 16, 14, nightV ? '#FFFFFF' : '#2F2A3A');
  } else if (name === 'tools') {
    size(1600, 1040);
    // shovels
    [[0, 0], [0, 0.5], [0, 1], [0.6, 1], [-0.9, 0.6], [Math.PI, 0]].forEach((q, i) => {
      const x = 90 + i * 130, y = q[0] > 3 ? 70 : 230;
      g.save(); g.translate(x, y); A.drawShovel(g, q[0], 150, { sand: q[1] }); g.restore();
      g.fillStyle = '#E84A4A'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill();
      label('a ' + q[0].toFixed(1) + ' s ' + q[1], x, 270);
    });
    g.save(); g.translate(1450, 1010); A.drawShovel(g, 0, 280, { sand: 1 }); g.restore(); label('size 280', 1450, 1030);
    g.save(); g.translate(980, 230); A.drawShovel(g, 0.3, 150, { sand: 0.7, night: 1 }); g.restore(); label('night', 980, 270);
    // sand bits
    [4, 6, 9, 12, 16, 24].forEach((r, i) => { g.save(); g.translate(1080 + i * 80, 200); A.drawSandBit(g, r, i * 0.7, { seed: i * 0.13 }); g.restore(); });
    label('sand bits r 4…24', 1280, 250);
    // shelf with items (shelf size 64)
    const shelf = { x: 30, y: 300, w: 1100, h: 92, size: 64, slots: [] };
    for (let i = 0; i < 12; i++) shelf.slots.push({ x: shelf.x + shelf.w / 2 + (i - 5.5) * 76, y: shelf.y + shelf.h - 30 });
    A.drawShelf(g, shelf, { slots: true });
    const items = [{ kind: 'dino', color: 'red' }, { kind: 'stone', shape: 'star', color: 'yellow' }, { kind: 'toy', animal: 'duck' }, { kind: 'bone' },
      { kind: 'tablet', text: 'A' }, { kind: 'stone', shape: 'rect', color: 'blue' }, { kind: 'toy', animal: 'elephant' }, { kind: 'egg', color: 'pink' }];
    items.forEach((t, i) => { g.save(); g.translate(shelf.slots[i].x, shelf.slots[i].y); A.drawThing(g, t, 64, { time: 0, shadow: true }); g.restore(); });
    const s2 = { x: 1160, y: 300, w: 420, h: 92 };
    g.fillStyle = '#3E4C7E'; g.fillRect(1150, 290, 440, 110); A.drawShelf(g, s2, { night: 1 }); label('night', 1370, 288);
    // ghost hand
    [0, 0.1, 0.4, 0.9].forEach((t, i) => { const x = 80 + i * 130, y = 450; g.save(); g.translate(x, y); A.drawGhostHand(g, 110, t); g.restore(); g.fillStyle = '#E84A4A'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); label('t ' + t, x, 600); });
    // icons (size 100, centre origin; the box is shown)
    const icons = [{ kind: 'egg', color: 'red' }, { kind: 'blob', color: 'blue' }, { kind: 'stone', shape: 'triangle', color: 'green' }, { kind: 'stone', shape: 'rect', color: 'orange' },
      { kind: 'toy', animal: 'cow' }, { kind: 'bone' }, { kind: 'number', n: 7 }, { kind: 'number', n: 12 }, { kind: 'letter', text: 'Ă' }, { kind: 'letter', text: 'q' },
      { kind: 'dots', n: 1 }, { kind: 'dots', n: 3 }, { kind: 'dots', n: 4 }, { kind: 'dots', n: 5 }, { kind: 'dots', n: 8 }, { kind: 'dots', n: 10 },
      { kind: 'size', size: 'big', of: 'bone' }, { kind: 'size', size: 'small', of: 'bone' }, { kind: 'size', size: 'big', of: 'egg', color: 'purple' }, { kind: 'size', size: 'small', of: 'egg', color: 'purple' },
      { kind: 'size', size: 'big', of: 'toy', animal: 'pig' }, { kind: 'size', size: 'small', of: 'toy', animal: 'pig' },
      ...COLORS.map(c => ({ kind: 'dino', color: c }))];
    icons.forEach((t, i) => {
      const x = 640 + (i % 8) * 120, y = 480 + Math.floor(i / 8) * 130;
      g.strokeStyle = 'rgba(80,120,200,0.35)'; g.strokeRect(x - 50, y - 50, 100, 100);
      g.save(); g.translate(x, y); A.drawIcon(g, t, 100); g.restore();
      label(t.kind + (t.n != null ? ' ' + t.n : t.size ? ' ' + t.size : ''), x, y + 64, 11);
    });
  }
  return cv.toDataURL('image/png');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent('<html><body style="margin:0"></body></html>');
  await p.addScriptTag({ content: ART });
  const names = ['things', 'eggs_3x', 'stones_3x', 'toys_3x', 'misc_3x', 'peek', 'clip', 'tools', ...RECIPE.MOODS.map(m => 'mounds_' + m)];
  for (const name of names) {
    const url = await p.evaluate(pageSheet, { name, ENV });
    const f = path.join(OUT, 'dig_' + name + '.png');
    fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', path.relative(ROOT, f));
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
