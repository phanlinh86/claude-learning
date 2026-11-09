// Pom's Puzzle Town — contact sheets for PZ.PuzzleArt (game/js/puzzle_art.js) → docs/art/puzzle_*.png
// Usage: node tools/puzzle_sheet.js [name ...]
//   puzzle_pieces.png        every kind × colour / shape / n / animal / glyph at in-game size (112): piece | its shadow
//                            (on light board-like cells; the faint blue box = pieceBox)
//   puzzle_<group>_3x.png    objects, shapes, bunch, dots, animals, glyphs at 3× (336), piece above its shadow
//   puzzle_opts.png          opt states: lift, glow, dim, count, alive, shadow glow / alpha, big & small
//   puzzle_board_<scene>.png the scene × 4 seasons (2 × 2), each with 3 shadows and 1 placed piece, frame 22
//   puzzle_misc.png          tray × 4 seasons, bubbles (pop stages), icons, ghost hand
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs/art');
const ART = fs.readFileSync(path.join(ROOT, 'game/js/puzzle_art.js'), 'utf8');

function pageSheet({ name }) {
  const A = window.PZ.PuzzleArt;
  const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  const ITEM = 112;
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  function size(w, h, bg) { cv.width = w; cv.height = h; g.fillStyle = bg || '#F4EFE6'; g.fillRect(0, 0, w, h); }
  function label(t, x, y, s, col) { g.save(); g.font = '700 ' + (s || 13) + 'px ' + A.FONT; g.fillStyle = col || '#4A4237'; g.textAlign = 'center'; g.fillText(t, x, y); g.restore(); }
  function box(t, x, y, sz) { const b = A.pieceBox(t, sz); g.save(); g.strokeStyle = 'rgba(80,120,200,0.35)'; g.setLineDash([4, 4]); g.lineWidth = 1; g.strokeRect(x - b.w / 2, y - b.h / 2, b.w, b.h); g.restore(); }
  function piece(t, x, y, sz, opt) { g.save(); g.translate(x, y); A.drawPiece(g, t, sz, opt || {}); g.restore(); }
  function shadow(t, x, y, sz, opt) { g.save(); g.translate(x, y); A.drawShadow(g, t, sz, opt || {}); g.restore(); }
  const BGS = ['#EAF2EE', '#F6EDE2', '#E7EEF6', '#F3E8EC'];
  function cellBg(x, y, w, h, i) { g.fillStyle = BGS[i % 4]; g.fillRect(x, y, w, h); }
  const G = {
    objects: [].concat(...['car', 'bus', 'balloon', 'kite', 'umbrella', 'house', 'flower', 'hat'].map((o, i) => [{ kind: 'obj', obj: o, color: COLORS[i % 7] }, { kind: 'obj', obj: o, color: COLORS[(i + 3) % 7] }])),
    colors: COLORS.map(c => ({ kind: 'obj', obj: 'car', color: c })).concat(COLORS.map(c => ({ kind: 'obj', obj: 'flower', color: c }))),
    shapes: A.SHAPES.map((s, i) => ({ kind: 'shape', shape: s, color: COLORS[i % 7] })),
    bunch: [1, 2, 3, 4, 5].map(n => ({ kind: 'bunch', n })),
    dots: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => ({ kind: 'dots', n })),
    animals: A.ANIMALS.map(a => ({ kind: 'animal', animal: a })),
    glyphs: ['A', 'B', 'M', 'b', 'g', 'Đ', '7', '12'].map((t, i) => ({ kind: 'glyph', text: t, color: i % 3 === 2 ? undefined : COLORS[i % 7] }))
  };
  const lab = t => t.obj ? t.obj + ' ' + t.color : t.shape || (t.n != null ? t.kind + ' ' + t.n : t.animal || (t.text != null ? '"' + t.text + '"' : t.kind));

  if (name === 'pieces') {
    const rows = ['objects', 'colors', 'shapes', 'bunch', 'dots', 'animals', 'glyphs'];
    const cw = 290, chh = 160, cols = 8;
    let cells = []; rows.forEach(r => { G[r].forEach(t => cells.push(t)); while (cells.length % cols) cells.push(null); });
    size(cw * cols, chh * (cells.length / cols) + 10);
    cells.forEach((t, i) => {
      if (!t) return;
      const x = cw * (i % cols), y = chh * Math.floor(i / cols);
      cellBg(x + 2, y + 2, cw - 4, chh - 4, Math.floor(i / cols));
      box(t, x + 72, y + 72, ITEM); piece(t, x + 72, y + 72, ITEM, { season: 0 });
      shadow(t, x + 215, y + 72, ITEM);
      label(lab(t), x + cw / 2, y + chh - 8, 12);
    });
  } else if (/_3x$/.test(name)) {
    const list = G[name.replace('_3x', '')], S = ITEM * 3, cw = 380, chh = 760, cols = Math.min(5, list.length);
    size(cw * cols, chh * Math.ceil(list.length / cols));
    list.forEach((t, i) => {
      const x = cw * (i % cols) + cw / 2, y = chh * Math.floor(i / cols);
      cellBg(x - cw / 2 + 3, y + 3, cw - 6, chh - 6, i);
      box(t, x, y + 190, S); piece(t, x, y + 190, S, {});
      shadow(t, x, y + 540, S);
      label(lab(t), x, y + chh - 14, 18);
    });
  } else if (name === 'opts') {
    const cases = [
      [{ kind: 'obj', obj: 'car', color: 'red' }, { lift: 1 }, 'lift 1'], [{ kind: 'obj', obj: 'kite', color: 'blue' }, { glow: 1 }, 'glow 1'],
      [{ kind: 'animal', animal: 'dog' }, { glow: 1, lift: 1 }, 'glow+lift'], [{ kind: 'obj', obj: 'bus', color: 'green' }, { dim: 1 }, 'dim 1'],
      [{ kind: 'bunch', n: 4 }, { count: 2 }, 'count 2'], [{ kind: 'bunch', n: 5 }, { count: 5 }, 'count 5'], [{ kind: 'dots', n: 7 }, { count: 4 }, 'dots count 4'],
      [{ kind: 'obj', obj: 'car', color: 'yellow' }, { alive: 1, t: 0.3 }, 'alive car'], [{ kind: 'obj', obj: 'house', color: 'purple' }, { alive: 1, t: 0.2 }, 'alive house'],
      [{ kind: 'obj', obj: 'flower', color: 'pink' }, { alive: 1 }, 'alive flower'], [{ kind: 'shape', shape: 'star', color: 'yellow' }, { alive: 1 }, 'alive star'],
      [{ kind: 'shape', shape: 'triangle', color: 'green' }, { alive: 1 }, 'alive tri'], [{ kind: 'animal', animal: 'cat' }, { alive: 1 }, 'alive cat'],
      [{ kind: 'animal', animal: 'frog' }, { alive: 1 }, 'alive frog'], [{ kind: 'animal', animal: 'lion' }, { alive: 1 }, 'alive lion'],
      [{ kind: 'obj', obj: 'house', color: 'red' }, { season: 3 }, 'house winter'], [{ kind: 'obj', obj: 'kite', color: 'orange' }, { alive: 1, t: 0.4 }, 'alive kite'],
      [{ kind: 'glyph', text: 'C', color: 'red' }, { alive: 1 }, 'alive glyph']
    ];
    const cw = 200, chh = 200, cols = 9;
    size(cw * cols, chh * 3 + 230);
    cases.forEach(([t, o, l], i) => { const x = cw * (i % cols) + cw / 2, y = chh * Math.floor(i / cols) + 90; cellBg(x - cw / 2 + 2, y - 88, cw - 4, chh - 4, i); piece(t, x, y, ITEM, o); label(l, x, y + 96, 12); });
    // shadow glow / alpha and big & small
    const y = chh * 2 + 100, sh = [[{ kind: 'obj', obj: 'car', color: 'red' }, { glow: 1 }, 'shadow glow 1'], [{ kind: 'animal', animal: 'rabbit' }, { glow: 0.5 }, 'glow .5'],
      [{ kind: 'shape', shape: 'heart' }, { alpha: 0.5 }, 'alpha .5'], [{ kind: 'glyph', text: 'K' }, { glow: 1 }, 'glyph glow']];
    sh.forEach(([t, o, l], i) => { const x = cw * i + cw / 2; cellBg(x - cw / 2 + 2, y - 88, cw - 4, chh - 4, i); shadow(t, x, y, ITEM, o); label(l, x, y + 96, 12); });
    const bt = { kind: 'obj', obj: 'umbrella', color: 'blue' };
    cellBg(cw * 4 + 2, y - 88, cw * 5 - 4, chh + 120, 1);
    shadow(bt, cw * 5, y + 30, ITEM * 1.25); shadow(bt, cw * 6.4, y + 30, ITEM * 0.72); piece(bt, cw * 7.6, y + 30, ITEM * 1.25); piece(bt, cw * 8.6, y + 30, ITEM * 0.72);
    label('big & small (×1.25 / ×0.72): shadows | pieces', cw * 6.5, y + 140, 13);
  } else if (/^board_/.test(name)) {
    const scene = name.replace('board_', ''), bw = 800, bh = 460, F = 22, pad = 50;
    size((bw + 2 * pad) * 2, (bh + 2 * pad + 30) * 2, '#F1E9DC');
    const PIECES = {
      street: [{ kind: 'obj', obj: 'car', color: 'red' }, { kind: 'obj', obj: 'kite', color: 'blue' }, { kind: 'obj', obj: 'hat', color: 'yellow' }, { kind: 'obj', obj: 'balloon', color: 'green' }],
      shapes: [{ kind: 'shape', shape: 'triangle', color: 'blue' }, { kind: 'shape', shape: 'star', color: 'blue' }, { kind: 'shape', shape: 'oval', color: 'blue' }, { kind: 'shape', shape: 'heart', color: 'blue' }],
      balloons: [{ kind: 'bunch', n: 2 }, { kind: 'bunch', n: 3 }, { kind: 'bunch', n: 5 }, { kind: 'bunch', n: 4 }],
      park: [{ kind: 'animal', animal: 'duck' }, { kind: 'animal', animal: 'cow' }, { kind: 'animal', animal: 'rabbit' }, { kind: 'animal', animal: 'lion' }],
      letters: [{ kind: 'glyph', text: 'A', color: 'red' }, { kind: 'glyph', text: 'M' }, { kind: 'glyph', text: '7', color: 'purple' }, { kind: 'glyph', text: 'S', color: 'orange' }],
      size: [{ kind: 'obj', obj: 'bus', color: 'orange' }, { kind: 'obj', obj: 'bus', color: 'orange', small: 1 }, { kind: 'obj', obj: 'umbrella', color: 'purple' }, { kind: 'obj', obj: 'house', color: 'green' }]
    }[scene];
    for (let s = 0; s < 4; s++) {
      const ox = (s % 2) * (bw + 2 * pad) + pad, oy = Math.floor(s / 2) * (bh + 2 * pad + 30) + pad;
      g.save(); g.translate(ox, oy); A.drawBoard(g, { w: bw, h: bh, r: 26 }, scene, s, { t: 2 + s, frame: F, alive: 0, shine: s === 1 ? 0.45 : 0 }); g.restore();
      const spots = [[0.22, 0.38], [0.52, 0.66], [0.8, 0.36], [0.42, 0.26]];
      PIECES.forEach((t, i) => {
        const sz = t.small ? ITEM * 0.72 : scene === 'size' && i === 0 ? ITEM * 1.25 : ITEM, th = Object.assign({}, t); delete th.small;
        const x = ox + spots[i][0] * bw, y = oy + spots[i][1] * bh;
        if (i < 3) shadow(th, x, y, sz, { glow: i === 2 && s === 2 ? 0.8 : 0 }); else piece(th, x, y, sz, { season: s });
      });
      label(scene + ' — ' + ['spring', 'summer', 'autumn', 'winter'][s] + (s === 1 ? ' (shine .45)' : s === 2 ? ' (3rd shadow glow)' : ''), ox + bw / 2, oy + bh + F + 26, 15);
    }
  } else if (name === 'misc') {
    size(1700, 1180);
    for (let s = 0; s < 4; s++) {
      const tray = { x: 30 + (s % 2) * 830, y: 30 + Math.floor(s / 2) * 230, w: 800, h: 200, spots: [] };
      for (let i = 0; i < 5; i++) tray.spots.push({ x: tray.x + 90 + i * 155, y: tray.y + 92 });
      A.drawTray(g, tray, s, { item: ITEM });
      [{ kind: 'obj', obj: 'car', color: 'red' }, { kind: 'shape', shape: 'star', color: 'yellow' }, { kind: 'animal', animal: 'pig' }, { kind: 'bunch', n: 3 }, { kind: 'dots', n: 5 }]
        .forEach((t, i) => piece(t, tray.spots[i].x, tray.spots[i].y, ITEM, { lift: i === 1 ? 1 : 0, glow: i === 2 ? 1 : 0 }));
      label('tray ' + ['spring', 'summer', 'autumn', 'winter'][s], tray.x + 400, tray.y + 220, 13);
    }
    // bubbles on a sky band
    const by = 560, gr = g.createLinearGradient(0, by - 60, 0, by + 80); gr.addColorStop(0, '#BFE3F5'); gr.addColorStop(1, '#FDEFF4');
    g.fillStyle = gr; g.fillRect(20, by - 70, 900, 160);
    [0, 0, 0.2, 0.45, 0.7, 0.9].forEach((p, i) => { g.save(); g.translate(90 + i * 150, by); A.drawBubble(g, i === 1 ? 26 : 44, { pop: p, t: i }); g.restore(); label('pop ' + p, 90 + i * 150, by + 76, 12); });
    // ghost hand
    [0, 0.5, 1].forEach((p, i) => { const x = 1020 + i * 200, y = 520; g.fillStyle = '#E7EEF6'; g.fillRect(x - 90, y - 50, 180, 200); g.save(); g.translate(x, y); A.drawGhostHand(g, 110, p); g.restore(); g.fillStyle = '#E84A4A'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); label('press ' + p, x, y + 140, 12); });
    // icons
    const icons = [{ kind: 'number', n: 3 }, { kind: 'number', n: 12 }, { kind: 'letter', text: 'Ă' }, ...COLORS.map(c => ({ kind: 'color', color: c })),
      { kind: 'size', big: true, obj: 'car', color: 'red' }, { kind: 'size', big: false, obj: 'car', color: 'red' }, { kind: 'size', big: true, animal: 'cat' }, { kind: 'size', big: false, animal: 'cat' },
      { kind: 'obj', obj: 'umbrella', color: 'green' }, { kind: 'shape', shape: 'rect', color: 'purple' }, { kind: 'bunch', n: 3 }, { kind: 'dots', n: 9 }, { kind: 'animal', animal: 'frog' }, { kind: 'glyph', text: 'q' }, { kind: 'nope' }];
    icons.forEach((t, i) => {
      const x = 80 + (i % 11) * 150, y = 760 + Math.floor(i / 11) * 190;
      g.fillStyle = '#FFFFFF'; g.fillRect(x - 60, y - 60, 120, 120); g.strokeStyle = 'rgba(80,120,200,0.35)'; g.strokeRect(x - 60, y - 60, 120, 120);
      g.save(); g.translate(x, y); A.drawIcon(g, t, 120); g.restore();
      label(t.kind + (t.n != null ? ' ' + t.n : t.color ? ' ' + t.color : t.big != null ? (t.big ? ' big' : ' small') : ''), x, y + 80, 11);
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
  const all = ['pieces', 'objects_3x', 'shapes_3x', 'bunch_3x', 'dots_3x', 'animals_3x', 'glyphs_3x', 'opts', 'misc',
    'board_street', 'board_shapes', 'board_balloons', 'board_park', 'board_letters', 'board_size'];
  const names = process.argv.slice(2).length ? process.argv.slice(2) : all;
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  for (const name of names) {
    const t0 = Date.now();
    const url = await p.evaluate(pageSheet, { name });
    const f = path.join(OUT, 'puzzle_' + name + '.png');
    fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', path.relative(ROOT, f), (Date.now() - t0) + ' ms');
  }
  await b.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
