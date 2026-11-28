// Mit's Treasure Map — contact sheets for TM.PuzzleArt (game/js/puzzle_art.js) → docs/art/puzzle_*.png
// Usage: node tools/puzzle_sheet.js [name ...]
//   puzzle_pieces.png        every kind × colour / obj / shape / n / animal / glyph at in-game size (112): piece | its shadow
//                            (on parchment cells; the faint blue box = pieceBox)
//   puzzle_<group>_3x.png    objects, colors, shapes, coins, dots, animals, glyphs at 3× (336), piece above its shadow
//   puzzle_opts.png          opt states: lift, glow, dim, count, alive, shadow glow / alpha, big & small
//   puzzle_board_<scene>.png the scene × 4 moods (sunny, breezy, rain, rainbow), each with 3 shadows + 1 placed piece
//   puzzle_misc.png          tray (water) × 4 moods with floating pieces, bubbles (pop stages), icons, ghost hand
//   puzzle_chest.png         chest closed → open, scroll, fish peeking (visibility stages)
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs/art');
const ART = fs.readFileSync(path.join(ROOT, 'game/js/puzzle_art.js'), 'utf8');

function pageSheet({ name }) {
  const A = window.TM.PuzzleArt;
  const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  const ITEM = 112;
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  function size(w, h, bg) { cv.width = w; cv.height = h; g.fillStyle = bg || '#F4EFE6'; g.fillRect(0, 0, w, h); }
  function label(t, x, y, s, col) { g.save(); g.font = '700 ' + (s || 13) + 'px ' + A.FONT; g.fillStyle = col || '#4A4237'; g.textAlign = 'center'; g.fillText(t, x, y); g.restore(); }
  function box(t, x, y, sz) { const b = A.pieceBox(t, sz); g.save(); g.strokeStyle = 'rgba(80,120,200,0.35)'; g.setLineDash([4, 4]); g.lineWidth = 1; g.strokeRect(x - b.w / 2, y - b.h / 2, b.w, b.h); g.restore(); }
  function piece(t, x, y, sz, opt) { g.save(); g.translate(x, y); A.drawPiece(g, t, sz, opt || {}); g.restore(); }
  function shadow(t, x, y, sz, opt) { g.save(); g.translate(x, y); A.drawShadow(g, t, sz, opt || {}); g.restore(); }
  const BGS = ['#F3E3BF', '#EFDDB4', '#F3E3BF', '#EBD8AC'];
  function cellBg(x, y, w, h, i) { g.fillStyle = BGS[i % 4]; g.fillRect(x, y, w, h); }
  const G = {
    objects: [].concat(...A.OBJECTS.map((o, i) => [{ kind: 'obj', obj: o, color: COLORS[i % 7] }, { kind: 'obj', obj: o, color: COLORS[(i + 3) % 7] }])),
    colors: [].concat(...A.OBJECTS.map(o => COLORS.map(c => ({ kind: 'obj', obj: o, color: c })))),
    shapes: A.SHAPES.map((s, i) => ({ kind: 'shape', shape: s, color: COLORS[i % 7] })),
    coins: [1, 2, 3, 4, 5].map(n => ({ kind: 'coins', n })),
    dots: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => ({ kind: 'dots', n })),
    animals: A.ANIMALS.map(a => ({ kind: 'animal', animal: a })),
    glyphs: ['A', 'B', 'M', 'b', 'g', 'Đ', '7', '12'].map((t, i) => ({ kind: 'glyph', text: t, color: i % 3 === 2 ? undefined : COLORS[i % 7] }))
  };
  const lab = t => t.obj ? t.obj + ' ' + t.color : t.shape || (t.n != null ? t.kind + ' ' + t.n : t.animal || (t.text != null ? '"' + t.text + '"' : t.kind));

  if (name === 'pieces') {
    const rows = ['colors', 'shapes', 'coins', 'dots', 'animals', 'glyphs'];
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
    const list = G[name.replace('_3x', '')], S = ITEM * 3, cw = 380, chh = 760, cols = Math.min(name === 'objects_3x' ? 8 : 5, list.length);
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
      [{ kind: 'obj', obj: 'boat', color: 'red' }, { lift: 1 }, 'lift 1'], [{ kind: 'obj', obj: 'kite', color: 'blue' }, { glow: 1 }, 'glow 1'],
      [{ kind: 'animal', animal: 'turtle' }, { glow: 1, lift: 1 }, 'glow+lift'], [{ kind: 'obj', obj: 'pail', color: 'green' }, { dim: 1 }, 'dim 1'],
      [{ kind: 'coins', n: 4 }, { count: 2 }, 'coins count 2'], [{ kind: 'coins', n: 5 }, { count: 5 }, 'coins count 5'], [{ kind: 'dots', n: 7 }, { count: 4 }, 'dots count 4'],
      [{ kind: 'obj', obj: 'boat', color: 'yellow' }, { alive: 1, t: 0.3 }, 'alive boat'], [{ kind: 'obj', obj: 'flag', color: 'purple' }, { alive: 1, t: 0.2 }, 'alive flag'],
      [{ kind: 'obj', obj: 'shell', color: 'pink' }, { alive: 1 }, 'alive shell'], [{ kind: 'shape', shape: 'star', color: 'yellow' }, { alive: 1 }, 'alive star'],
      [{ kind: 'obj', obj: 'pail', color: 'orange' }, { alive: 1 }, 'alive pail'], [{ kind: 'animal', animal: 'parrot' }, { alive: 1, t: 0.1 }, 'alive parrot'],
      [{ kind: 'animal', animal: 'octopus' }, { alive: 1, t: 0.5 }, 'alive octopus'], [{ kind: 'animal', animal: 'seagull' }, { alive: 1, t: 0.2 }, 'alive gull'],
      [{ kind: 'animal', animal: 'monkey' }, { alive: 1, t: 0.2 }, 'alive monkey'], [{ kind: 'coins', n: 3 }, { alive: 1, t: 0.15 }, 'alive coins'],
      [{ kind: 'glyph', text: 'C', color: 'red' }, { alive: 1 }, 'alive glyph']
    ];
    const cw = 200, chh = 200, cols = 9;
    size(cw * cols, chh * 3 + 230);
    cases.forEach(([t, o, l], i) => { const x = cw * (i % cols) + cw / 2, y = chh * Math.floor(i / cols) + 90; cellBg(x - cw / 2 + 2, y - 88, cw - 4, chh - 4, i); piece(t, x, y, ITEM, o); label(l, x, y + 96, 12); });
    const y = chh * 2 + 100, sh = [[{ kind: 'obj', obj: 'boat', color: 'red' }, { glow: 1 }, 'shadow glow 1'], [{ kind: 'animal', animal: 'starfish' }, { glow: 0.5 }, 'glow .5'],
      [{ kind: 'shape', shape: 'heart' }, { alpha: 0.5 }, 'alpha .5'], [{ kind: 'glyph', text: 'K' }, { glow: 1 }, 'glyph glow']];
    sh.forEach(([t, o, l], i) => { const x = cw * i + cw / 2; cellBg(x - cw / 2 + 2, y - 88, cw - 4, chh - 4, i); shadow(t, x, y, ITEM, o); label(l, x, y + 96, 12); });
    const bt = { kind: 'obj', obj: 'parasol', color: 'blue' };
    cellBg(cw * 4 + 2, y - 88, cw * 5 - 4, chh + 120, 1);
    shadow(bt, cw * 5, y + 30, ITEM * 1.25); shadow(bt, cw * 6.4, y + 30, ITEM * 0.72); piece(bt, cw * 7.6, y + 30, ITEM * 1.25); piece(bt, cw * 8.6, y + 30, ITEM * 0.72);
    label('big & small (×1.25 / ×0.72): shadows | pieces', cw * 6.5, y + 140, 13);
  } else if (/^board_/.test(name)) {
    const scene = name.replace('board_', ''), bw = 800, bh = 460, F = 22, pad = 50;
    size((bw + 2 * pad) * 2, (bh + 2 * pad + 30) * 2, '#F1DDB0');
    const PIECES = {
      cove: [{ kind: 'obj', obj: 'boat', color: 'red' }, { kind: 'obj', obj: 'kite', color: 'blue' }, { kind: 'obj', obj: 'hat', color: 'yellow' }, { kind: 'obj', obj: 'bottle', color: 'green' }],
      sails: [{ kind: 'shape', shape: 'triangle', color: 'blue' }, { kind: 'shape', shape: 'star', color: 'yellow' }, { kind: 'shape', shape: 'oval', color: 'orange' }, { kind: 'shape', shape: 'heart', color: 'red' }],
      cave: [{ kind: 'coins', n: 2 }, { kind: 'coins', n: 3 }, { kind: 'coins', n: 5 }, { kind: 'coins', n: 4 }],
      lagoon: [{ kind: 'animal', animal: 'parrot' }, { kind: 'animal', animal: 'turtle' }, { kind: 'animal', animal: 'octopus' }, { kind: 'animal', animal: 'dolphin' }],
      deck: [{ kind: 'glyph', text: 'A', color: 'red' }, { kind: 'glyph', text: 'M' }, { kind: 'glyph', text: '7', color: 'purple' }, { kind: 'glyph', text: 'S', color: 'orange' }],
      shore: [{ kind: 'obj', obj: 'pail', color: 'orange' }, { kind: 'obj', obj: 'pail', color: 'orange', small: 1 }, { kind: 'obj', obj: 'parasol', color: 'purple' }, { kind: 'obj', obj: 'shell', color: 'pink' }]
    }[scene];
    for (let s = 0; s < 4; s++) {
      const ox = (s % 2) * (bw + 2 * pad) + pad, oy = Math.floor(s / 2) * (bh + 2 * pad + 30) + pad;
      g.save(); g.translate(ox, oy); A.drawBoard(g, { w: bw, h: bh, r: 26 }, scene, s, { t: 2 + s * 3, frame: F, alive: 0, shine: s === 1 ? 0.45 : 0 }); g.restore();
      const spots = [[0.25, 0.4], [0.52, 0.66], [0.66, 0.3], [0.4, 0.22]];
      PIECES.forEach((t, i) => {
        const sz = t.small ? ITEM * 0.72 : scene === 'shore' && i === 0 ? ITEM * 1.25 : ITEM, th = Object.assign({}, t); delete th.small;
        const x = ox + spots[i][0] * bw, y = oy + spots[i][1] * bh;
        if (i < 3) shadow(th, x, y, sz, { glow: i === 2 && s === 2 ? 0.8 : 0 }); else piece(th, x, y, sz, { season: s });
      });
      label(scene + ' — ' + ['sunny', 'breezy', 'rain', 'rainbow'][s] + (s === 1 ? ' (shine .45)' : s === 2 ? ' (3rd shadow glow)' : ''), ox + bw / 2, oy + bh + F + 26, 15);
    }
  } else if (name === 'misc') {
    size(1700, 1180, '#F1DDB0');
    for (let s = 0; s < 4; s++) {
      const tray = { x: 30 + (s % 2) * 830, y: 30 + Math.floor(s / 2) * 230, w: 800, h: 190, spots: [] };
      for (let i = 0; i < 5; i++) tray.spots.push({ x: tray.x + 90 + i * 155, y: tray.y + 86 });
      A.drawTray(g, tray, s, { item: ITEM, t: 1.3 + s });
      [{ kind: 'obj', obj: 'boat', color: 'blue' }, { kind: 'shape', shape: 'star', color: 'yellow' }, { kind: 'animal', animal: 'fish' }, { kind: 'coins', n: 3 }, { kind: 'obj', obj: 'shell', color: 'green' }]
        .forEach((t, i) => piece(t, tray.spots[i].x, tray.spots[i].y + Math.sin(i * 1.7 + s) * 4, ITEM, { lift: i === 1 ? 1 : 0, glow: i === 2 ? 1 : 0 }));
      label('tray ' + ['sunny', 'breezy', 'rain', 'rainbow'][s], tray.x + 400, tray.y + 212, 13);
    }
    const by = 560, gr = g.createLinearGradient(0, by - 60, 0, by + 80); gr.addColorStop(0, '#8FDCE0'); gr.addColorStop(1, '#5CC3D6');
    g.fillStyle = gr; g.fillRect(20, by - 70, 900, 160);
    [0, 0, 0.2, 0.45, 0.7, 0.9].forEach((p, i) => { g.save(); g.translate(90 + i * 150, by); A.drawBubble(g, i === 1 ? 26 : 44, { pop: p, t: i }); g.restore(); label('pop ' + p, 90 + i * 150, by + 76, 12); });
    [0, 0.5, 1].forEach((p, i) => { const x = 1020 + i * 200, y = 520; g.fillStyle = '#F3E3BF'; g.fillRect(x - 90, y - 50, 180, 200); g.save(); g.translate(x, y); A.drawGhostHand(g, 110, p); g.restore(); g.fillStyle = '#E84A4A'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); label('press ' + p, x, y + 140, 12); });
    const icons = [{ kind: 'number', n: 3 }, { kind: 'number', n: 12 }, { kind: 'letter', text: 'Ă' }, ...COLORS.map(c => ({ kind: 'color', color: c })),
      { kind: 'size', big: true, obj: 'boat', color: 'red' }, { kind: 'size', big: false, obj: 'boat', color: 'red' }, { kind: 'size', big: true, animal: 'turtle' }, { kind: 'size', big: false, animal: 'turtle' },
      { kind: 'obj', obj: 'parasol', color: 'green' }, { kind: 'shape', shape: 'rect', color: 'purple' }, { kind: 'coins', n: 3 }, { kind: 'dots', n: 9 }, { kind: 'animal', animal: 'monkey' }, { kind: 'glyph', text: 'q' }, { kind: 'nope' }];
    icons.forEach((t, i) => {
      const x = 80 + (i % 11) * 150, y = 760 + Math.floor(i / 11) * 190;
      g.fillStyle = '#FFFFFF'; g.fillRect(x - 60, y - 60, 120, 120); g.strokeStyle = 'rgba(80,120,200,0.35)'; g.strokeRect(x - 60, y - 60, 120, 120);
      g.save(); g.translate(x, y); A.drawIcon(g, t, 120); g.restore();
      label(t.kind + (t.n != null ? ' ' + t.n : t.color ? ' ' + t.color : t.big != null ? (t.big ? ' big' : ' small') : ''), x, y + 80, 11);
    });
  } else if (name === 'chest') {
    size(1700, 900, '#F1DDB0');
    [0, 0.15, 0.35, 0.55, 0.75, 1].forEach((o, i) => { const x = 150 + i * 280, y = 330; g.save(); g.translate(x, y); A.drawChest(g, 200, o, 1.2 + i * 0.4); g.restore(); label('open ' + o, x, y + 40, 14); });
    g.save(); g.translate(430, 470); A.drawScroll(g, 700, 30); g.restore(); label('scroll 700 × r30', 430, 530, 14);
    g.save(); g.translate(1150, 470); A.drawScroll(g, 360, 16); g.restore(); label('scroll 360 × r16', 1150, 510, 14);
    const tray = { x: 40, y: 640, w: 1620, h: 220, spots: [] };
    A.drawTray(g, tray, 0, { t: 2 });
    [0.1, 0.3, 0.55, 0.8, 1].forEach((a, i) => { const x = 200 + i * 300, y = 720; g.save(); g.translate(x, y); A.drawFish(g, 70, a); g.restore(); label('fish a ' + a, x, y + 60, 14); });
  }
  return cv.toDataURL('image/png');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent('<html><body style="margin:0"></body></html>');
  await p.addScriptTag({ content: ART });
  const all = ['pieces', 'objects_3x', 'shapes_3x', 'coins_3x', 'dots_3x', 'animals_3x', 'glyphs_3x', 'opts', 'misc', 'chest',
    'board_cove', 'board_sails', 'board_cave', 'board_lagoon', 'board_shore', 'board_deck'];
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
