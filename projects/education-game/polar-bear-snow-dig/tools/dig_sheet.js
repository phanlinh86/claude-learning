// Nuka's Snow Dig — contact sheets for NK.DigArt (game/js/dig_art.js) → docs/art/dig_*.png
// Usage: node tools/dig_sheet.js
//   dig_things.png     every thing kind × colour / shape / animal at in-game size (item 110) on light snow, with its
//                      thingBox (faint), plus night + dim variants
//   dig_things_3x.png  the same things at 3× (330 px) — detail / outline check
//   dig_mounds.png     snow drifts at dig 0 / 0.33 / 0.66 / 1 (+ risen, glow) with a peeking clipped thing, one row per mood:
//                      spring / summer / autumn ground (light snow) and winter (night 1, #1E2A52 sky)
//   dig_peek.png       every hat colour / gem shape / animal / fish / tablet buried at dig 0 with its CONFIG.peek fraction
//                      (and × 0.85) — what the child sees sticking out of the snow
//   dig_misc.png       the paw (angles, snow scoop, night), snow bits, aurora ribbon with 0 / 4 / 12 finds (day, night,
//                      ripple), every icon kind, ghost hand (tap + rub)
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs/art');
const ART = fs.readFileSync(path.join(ROOT, 'game/js/dig_art.js'), 'utf8');

// runs in the page: draws one sheet, returns a PNG data URL
function pageSheet({ name }) {
  const A = window.NK.DigArt;
  const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  const SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
  const ANIMALS = ['fox', 'hare', 'reindeer', 'walrus', 'whale', 'dog', 'goose', 'owl'];
  const PEEK = { hat: 0.40, gem: 0.42, toy: 0.48, fish: 0.42, tablet: 0.62 };
  const MOODS = {
    spring: { sky: ['#BFE3F5', '#EAF6FB'], ground: '#E3EDF0', night: 0, ink: '#2F3A4A' },
    summer: { sky: ['#86CBEF', '#D4EEF8'], ground: '#E8F0F6', night: 0, ink: '#2F3A4A' },
    autumn: { sky: ['#F3C79A', '#F8E3C4'], ground: '#ECE6DE', night: 0, ink: '#2F3A4A' },
    winter: { sky: ['#1E2A52', '#3B4F7E'], ground: '#9FB1CE', night: 1, ink: '#E8ECF8' }
  };
  const FONT = A.FONT, ITEM = 110;
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  function size(w, h, bg) { cv.width = w; cv.height = h; g.fillStyle = bg || '#EAF0F5'; g.fillRect(0, 0, w, h); }
  function label(t, x, y, s, col) { g.save(); g.font = '700 ' + (s || 13) + 'px ' + FONT; g.fillStyle = col || '#2F3A4A'; g.textAlign = 'center'; g.fillText(t, x, y); g.restore(); }
  function thingCell(t, x, y, sz, opt, lab, col) {   // (x, y) = bottom centre
    const b = A.thingBox(t, sz);
    g.save(); g.strokeStyle = 'rgba(80,120,200,0.3)'; g.setLineDash([4, 4]); g.lineWidth = 1;
    g.strokeRect(x - b.w / 2, y + b.top, b.w, b.h); g.restore();
    g.save(); g.translate(x, y); A.drawThing(g, t, sz, Object.assign({ time: 0.3 }, opt || {})); g.restore();
    if (lab) label(lab, x, y + 18 * Math.max(1, sz / ITEM * 0.8), 13 * Math.max(1, sz / ITEM * 0.8), col);
  }
  const ROWS = [
    COLORS.map(c => [{ kind: 'hat', color: c }, {}, 'hat ' + c]).concat([[{ kind: 'hat', color: 'red' }, { glow: 1 }, 'glow'], [{ kind: 'hat', color: 'blue' }, { dim: 1 }, 'dim']]),
    SHAPES.map((s, i) => [{ kind: 'gem', shape: s, color: COLORS[i % 7] }, {}, s]).concat([[{ kind: 'gem', shape: 'star' }, {}, 'no colour']]),
    COLORS.map(c => [{ kind: 'gem', shape: 'heart', color: c }, {}, c]).concat([[{ kind: 'gem', shape: 'rect', color: 'pink' }, {}, 'rect pink'], [{ kind: 'gem', shape: 'diamond', color: 'yellow' }, {}, 'diamond']]),
    ANIMALS.map(a => [{ kind: 'toy', animal: a }, {}, a]).concat([[{ kind: 'toy', animal: 'fox' }, { dim: 1 }, 'dim']]),
    [[{ kind: 'fish' }, {}, 'fish'], [{ kind: 'fish' }, {}, 'fish ×1.25', 1.25], [{ kind: 'fish' }, {}, 'fish ×0.72', 0.72], [{ kind: 'tablet', text: 'A' }, {}, 'A'],
      [{ kind: 'tablet', text: 'b' }, {}, 'b'], [{ kind: 'tablet', text: '7' }, {}, '7'], [{ kind: 'tablet', text: '12' }, {}, '12'], [{ kind: 'tablet', text: 'Đ' }, {}, 'Đ'],
      [{ kind: 'egg' }, {}, 'unknown → snowball']]
  ];
  const NIGHT_ROW = [[{ kind: 'hat', color: 'red' }, { night: 1 }, 'red'], [{ kind: 'hat', color: 'pink' }, { night: 1 }, 'pink'], [{ kind: 'hat', color: 'purple' }, { night: 1 }, 'purple'],
    [{ kind: 'gem', shape: 'star', color: 'yellow' }, { night: 1 }, 'star'], [{ kind: 'gem', shape: 'circle', color: 'blue' }, { night: 1 }, 'blue'],
    [{ kind: 'toy', animal: 'whale' }, { night: 1 }, 'whale'], [{ kind: 'toy', animal: 'owl' }, { night: 1 }, 'owl'], [{ kind: 'fish' }, { night: 1 }, 'fish'], [{ kind: 'tablet', text: 'M' }, { night: 1 }, 'M']];

  if (name === 'things') {
    const cw = 140, chh = 172, cols = 9;
    size(cw * cols, chh * (ROWS.length + 1) + 20);
    ROWS.forEach((row, r) => row.forEach((q, i) => thingCell(q[0], cw * i + cw / 2, chh * r + 140, ITEM * (q[3] || 1), q[1], q[2])));
    const y0 = chh * ROWS.length; g.fillStyle = '#1E2A52'; g.fillRect(0, y0 + 4, cv.width, chh + 16);
    NIGHT_ROW.forEach((q, i) => thingCell(q[0], cw * i + cw / 2, y0 + 140, ITEM, q[1], 'night ' + q[2], '#E8ECF8'));
  } else if (name === 'things_3x') {
    const list = [].concat(...ROWS).filter(q => !q[1].dim && !q[1].glow && !q[3]), S = ITEM * 3, cw = 380, chh = 400, cols = 8;
    size(cw * cols, chh * Math.ceil(list.length / cols) + 20);
    list.forEach((q, i) => thingCell(q[0], cw * (i % cols) + cw / 2, chh * Math.floor(i / cols) + 360, S, q[1], q[2]));
  } else if (name === 'mounds' || name === 'peek') {
    const w = ITEM * 1.55, h0 = ITEM * 0.62, cw = 210, chh = 220;
    let cells = [], perRow;
    if (name === 'peek') {
      const things = COLORS.map(c => ({ kind: 'hat', color: c })).concat(SHAPES.map((s, i) => ({ kind: 'gem', shape: s, color: COLORS[i % 7] })))
        .concat(ANIMALS.map(a => ({ kind: 'toy', animal: a }))).concat([{ kind: 'fish' }, { kind: 'tablet', text: 'M' }, { kind: 'tablet', text: '9' }]);
      perRow = 13;
      [1, 0.85].forEach(f => things.forEach(t => cells.push({ t, dig: 0, peek: PEEK[t.kind] * f, mood: 'summer', lab: (t.color && t.kind === 'hat' ? t.color : t.shape || t.animal || t.text || t.kind) + (f < 1 ? ' ×.85' : ''), size: f < 1 ? 104 : ITEM })));
      size(cw * perRow, chh * Math.ceil(cells.length / perRow) + 30, MOODS.summer.ground);
    } else {
      const moods = ['spring', 'summer', 'autumn', 'winter'];
      const things = [{ kind: 'hat', color: 'red' }, { kind: 'gem', shape: 'star', color: 'blue' }, { kind: 'toy', animal: 'reindeer' }, { kind: 'fish' }];
      const cols = [{ dig: 0 }, { dig: 0.33 }, { dig: 0.66 }, { dig: 1 }, { dig: 1, rise: 1 }, { dig: 0, glow: 1, sparkle: 1 }, { dig: 1, rise: 1, dim: 1 }];
      perRow = cols.length;
      moods.forEach((mood, r) => cols.forEach(c => { const t = things[r]; cells.push(Object.assign({ t, peek: PEEK[t.kind], mood }, c, { lab: c.rise ? (c.dim ? 'wrong (dim)' : 'risen') : c.glow ? 'glow' : 'dig ' + c.dig })); }));
      size(cw * perRow, chh * moods.length + 10);
      moods.forEach((mood, r) => {   // sky band + ground per row
        const M = MOODS[mood], y = chh * r, gr = g.createLinearGradient(0, y, 0, y + 120);
        gr.addColorStop(0, M.sky[0]); gr.addColorStop(1, M.sky[1]); g.fillStyle = gr; g.fillRect(0, y, cv.width, 120);
        g.fillStyle = M.ground; g.fillRect(0, y + 120, cv.width, chh - 120);
        label(mood, 34, y + 18, 14, M.night ? '#FFFFFF' : '#2F3A4A');
      });
    }
    cells.forEach((c, i) => {
      const M = MOODS[c.mood], nightV = M.night;
      const x = cw * (i % perRow) + cw / 2, y = chh * Math.floor(i / perRow) + 190, sz = c.size || ITEM;
      const m = { id: 'm' + i, w, h0, dig: c.dig };
      // as in render.js: pileTop = y − h0·(1 − dig); buried thingY = pileTop + size·(1 − peek), clipY = pileTop + 4;
      // rise → thingY = y − 0.12·h0, clipY = y + 2; when rise > 0.6 the thing is drawn again unclipped on top.
      const pileTop = y - h0 * (1 - c.dig), rise = c.rise || 0;
      const thingY = rise ? y - 0.12 * h0 : pileTop + sz * (1 - c.peek), clipY = rise ? y + 2 : pileTop + 4;
      const mo = { night: nightV, glow: c.glow || 0, sparkle: c.sparkle || 0, time: 0.2 };
      const to = { night: nightV, glow: c.glow || 0, dim: c.dim || 0, time: 0.2 };
      g.save(); g.translate(x, y); A.drawHoleBack(g, m, mo); g.restore();
      g.save(); g.beginPath(); g.rect(x - cw / 2, y - 400, cw, clipY - (y - 400)); g.clip();
      g.translate(x, thingY); A.drawThing(g, c.t, sz, to); g.restore();
      g.save(); g.translate(x, y); A.drawMound(g, m, mo); g.restore();
      if (rise > 0.6) { g.save(); g.translate(x, thingY); A.drawThing(g, c.t, sz, to); g.restore(); }
      label(c.lab, x, y + 24, 13, nightV ? '#E8ECF8' : '#2F3A4A');
    });
    if (name === 'peek') label('peek (CONFIG.peek, item 110) / × 0.85 (item 104), dig 0 — summer ground', 330, 16, 14);
  } else if (name === 'misc') {
    size(1700, 1260);
    // paws: angle / snow scoop; red dot = origin (paw tip)
    [[0, 0], [0, 0.5], [0, 1], [0.6, 1], [-0.9, 0.6], [Math.PI, 0]].forEach((q, i) => {
      const x = 90 + i * 130, y = q[0] > 3 ? 60 : 230;
      g.save(); g.translate(x, y); A.drawShovel(g, q[0], 150, { sand: q[1] }); g.restore();
      g.fillStyle = '#E84A4A'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill();
      label('a ' + q[0].toFixed(1) + ' s ' + q[1], x, 270);
    });
    g.fillStyle = '#1E2A52'; g.fillRect(860, 40, 130, 250);
    g.save(); g.translate(925, 230); A.drawShovel(g, 0.3, 150, { sand: 0.7, night: 1 }); g.restore(); label('night', 925, 270, 13, '#E8ECF8');
    g.save(); g.translate(1100, 300); A.drawShovel(g, 0, 260, { sand: 1 }); g.restore(); label('paw 260', 1100, 320);
    // snow bits on light ground and night
    g.fillStyle = '#E3EDF0'; g.fillRect(1200, 40, 480, 110); g.fillStyle = '#1E2A52'; g.fillRect(1200, 150, 480, 110);
    [4, 6, 9, 12, 16, 24].forEach((r, i) => {
      g.save(); g.translate(1240 + i * 75, 95); A.drawSandBit(g, r, i * 0.7, { seed: i * 0.13 }); g.restore();
      g.save(); g.translate(1240 + i * 75, 205); A.drawSandBit(g, r, i * 0.7, { seed: i * 0.13, night: 1 }); g.restore();
    });
    label('snow bits r 4…24 (day / night)', 1440, 30);
    // aurora ribbon: 0 / 4 / 12 finds, day sky and night sky; things sit in the first n slots
    const items = [{ kind: 'hat', color: 'red' }, { kind: 'gem', shape: 'star', color: 'yellow' }, { kind: 'toy', animal: 'fox' }, { kind: 'fish' },
      { kind: 'tablet', text: 'A' }, { kind: 'gem', shape: 'rect', color: 'blue' }, { kind: 'toy', animal: 'whale' }, { kind: 'hat', color: 'pink' },
      { kind: 'toy', animal: 'owl' }, { kind: 'gem', shape: 'heart', color: 'green' }, { kind: 'hat', color: 'purple' }, { kind: 'toy', animal: 'walrus' }];
    [[0, 0, 0], [4, 0, 0], [12, 0, 0], [0, 1, 0], [4, 1, 0], [12, 1, 0.8]].forEach((q, j) => {
      const col = j % 3, row = Math.floor(j / 3), bx = 20 + col * 560, by = 330 + row * 170;
      const sky = g.createLinearGradient(0, by, 0, by + 150);
      if (q[1]) { sky.addColorStop(0, '#1E2A52'); sky.addColorStop(1, '#3B4F7E'); } else { sky.addColorStop(0, '#86CBEF'); sky.addColorStop(1, '#D4EEF8'); }
      g.fillStyle = sky; g.fillRect(bx, by, 540, 150);
      const shelf = { x: bx + 10, y: by + 20, w: 520, h: 120, size: 38, slots: [] };
      for (let i = 0; i < 12; i++) shelf.slots.push({ x: shelf.x + 26 + i * 42.5, y: shelf.y + shelf.h - 30 + 10 * Math.sin(i * 0.9) });
      A.drawShelf(g, shelf, { t: 2 + j, n: q[0], night: q[1], ripple: q[2], slots: true });
      for (let i = 0; i < q[0]; i++) { g.save(); g.translate(shelf.slots[i].x, shelf.slots[i].y); A.drawThing(g, items[i], 38, { time: 0, night: q[1] * 0.6 }); g.restore(); }
      label((q[1] ? 'night ' : 'day ') + q[0] + ' finds' + (q[2] ? ' ripple' : ''), bx + 270, by + 146, 13, q[1] ? '#E8ECF8' : '#2F3A4A');
    });
    // icons (size 100, centre origin; the box is shown)
    const icons = [{ kind: 'hat', color: 'red' }, { kind: 'blob', color: 'blue' }, { kind: 'gem', shape: 'triangle', color: 'green' }, { kind: 'gem', shape: 'rect', color: 'orange' },
      { kind: 'toy', animal: 'reindeer' }, { kind: 'fish' }, { kind: 'number', n: 7 }, { kind: 'number', n: 12 }, { kind: 'letter', text: 'Ă' }, { kind: 'letter', text: 'q' },
      { kind: 'dots', n: 1 }, { kind: 'dots', n: 3 }, { kind: 'dots', n: 4 }, { kind: 'dots', n: 5 }, { kind: 'dots', n: 8 }, { kind: 'dots', n: 10 },
      { kind: 'size', size: 'big', of: 'fish' }, { kind: 'size', size: 'small', of: 'fish' }, { kind: 'size', size: 'big', of: 'hat', color: 'purple' }, { kind: 'size', size: 'small', of: 'hat', color: 'purple' },
      { kind: 'size', size: 'big', of: 'toy', animal: 'walrus' }, { kind: 'size', size: 'small', of: 'toy', animal: 'walrus' }, ...COLORS.slice(0, 2).map(c => ({ kind: 'hat', color: c }))];
    icons.forEach((t, i) => {
      const x = 80 + (i % 12) * 120, y = 730 + Math.floor(i / 12) * 135;
      g.strokeStyle = 'rgba(80,120,200,0.35)'; g.strokeRect(x - 50, y - 50, 100, 100);
      g.save(); g.translate(x, y); A.drawIcon(g, t, 100); g.restore();
      label(t.kind + (t.n != null ? ' ' + t.n : t.size ? ' ' + t.size : ''), x, y + 66, 11);
    });
    // ghost hand: tap phases and rub phases, on a light and a dark band
    g.fillStyle = '#9FB1CE'; g.fillRect(0, 990, 1700, 270);
    [0, 0.1, 0.4, 0.9].forEach((t, i) => { const x = 90 + i * 140, y = 1040; g.save(); g.translate(x, y); A.drawGhostHand(g, 110, t); g.restore(); g.fillStyle = '#E84A4A'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); label('tap ' + t, x, 1220); });
    [0, 0.25, 0.5, 0.75].forEach((t, i) => { const x = 760 + i * 200, y = 1040; g.save(); g.translate(x, y); A.drawGhostHand(g, 110, t, { rub: true }); g.restore(); g.fillStyle = '#E84A4A'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); label('rub ' + t, x, 1220); });
  }
  return cv.toDataURL('image/png');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent('<html><body style="margin:0"></body></html>');
  await p.addScriptTag({ content: ART });
  const names = process.argv.slice(2).length ? process.argv.slice(2) : ['things', 'things_3x', 'mounds', 'peek', 'misc'];
  for (const name of names) {
    const url = await p.evaluate(pageSheet, { name });
    const f = path.join(OUT, 'dig_' + name + '.png');
    fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', path.relative(ROOT, f));
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
