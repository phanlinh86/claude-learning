// Kiki's Camp Chimes — contact sheets for CC.ChimeArt (game/js/chime_art.js) → docs/art/chime_*.png
// Usage: node tools/chime_sheet.js [name ...]
//   chime_all_<mood>.png   every kind × colour / shape / n / animal / glyph at in-game size (112) on the mood background
//                          (night uses opt.night = 1); the faint dashed box = bodyBox, the red dot = body centre (cy)
//   chime_<group>_3x.png   bells, plates, strings, dots, animals, glyphs at 3× (336), ring 0 and ring 0.7
//   chime_strings_small.png counting strings at 112 and 60 px (iPhone) on every mood over a khaki meadow / tent
//   chime_opts.png         ring 0 / .4 / .7 / 1, flash 0 (wrong), glow, dim, clap, count, mouth, pop, big & small — noon + night
//   chime_scene.png        beam + garland + hanging chimes + campfire per mood, 0 / 2 / 3 / 5 lanterns lit
//   chime_misc.png         notes (every colour + gold), fireflies, ghost hand presses, Talk icons
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs/art');
const ART = fs.readFileSync(path.join(ROOT, 'game/js/chime_art.js'), 'utf8');

function pageSheet({ name }) {
  const A = window.CC.ChimeArt;
  const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  const ITEM = 112;
  const MOODS = {
    morning: { top: '#F7D9C4', bot: '#FDF3E1', ink: '#4A4237', night: 0 },
    noon: { top: '#7CC4EE', bot: '#D6F0FB', ink: '#24425A', night: 0 },
    sunset: { top: '#F29B6B', bot: '#FBD7A5', ink: '#4A2E22', night: 0.35 },
    night: { top: '#1E2A4A', bot: '#3B4C78', ink: '#E8EEFF', night: 1 }
  };
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  function size(w, h, bg) { cv.width = w; cv.height = h; g.fillStyle = bg || '#F4EFE6'; g.fillRect(0, 0, w, h); }
  function sky(x, y, w, h, m) { const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, m.top); gr.addColorStop(1, m.bot); g.fillStyle = gr; g.fillRect(x, y, w, h); }
  function flat(x, y, w, h, m) { g.fillStyle = m.bot === '#3B4C78' ? '#1E2A4A' : m.bot; g.fillRect(x, y, w, h); }
  function label(t, x, y, s, col) { g.save(); g.font = '700 ' + (s || 13) + 'px system-ui, sans-serif'; g.fillStyle = col || '#4A4237'; g.textAlign = 'center'; g.fillText(t, x, y); g.restore(); }
  function box(t, x, y, sz) {
    const b = A.bodyBox(t, sz); g.save(); g.strokeStyle = 'rgba(80,120,200,0.45)'; g.setLineDash([4, 4]); g.lineWidth = 1;
    g.strokeRect(x - b.w / 2, y, b.w, b.h); g.setLineDash([]); g.fillStyle = 'rgba(220,40,40,0.7)'; g.fillRect(x - 2, y + b.cy - 2, 4, 4); g.restore();
  }
  function cord(x, y, len, night) { A.drawCord(g, x, y - len, x, y, { night }); }
  function chime(t, x, y, sz, opt) { g.save(); g.translate(x, y); A.drawChime(g, t, sz, opt || {}); g.restore(); }
  const G = {
    bells: COLORS.map(c => ({ kind: 'bell', color: c })),
    plates: A.SHAPES.map((s, i) => ({ kind: 'plate', shape: s, color: COLORS[i % 7] })),
    plates1: A.SHAPES.map(s => ({ kind: 'plate', shape: s, color: 'blue' })),
    strings: [1, 2, 3, 4, 5].map(n => ({ kind: 'string', n })),
    dots: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => ({ kind: 'dots', n })),
    animals: A.ANIMALS.map(a => ({ kind: 'animal', animal: a })),
    glyphs: ['A', 'B', 'M', 'g', 'Đ', '7', '12', 'W'].map((t, i) => ({ kind: 'glyph', text: t, color: i % 3 === 2 ? undefined : COLORS[i % 7] }))
  };
  const lab = t => t.kind === 'bell' ? t.color + ' bell' : t.kind === 'plate' ? t.shape + ' ' + t.color : t.n != null ? t.kind + ' ' + t.n : t.animal || (t.text != null ? '"' + t.text + '" ' + (t.color || '') : t.kind);

  if (/^all_/.test(name)) {
    const m = MOODS[name.slice(4)];
    const rows = ['bells', 'plates', 'plates1', 'strings', 'dots', 'animals', 'glyphs'];
    const cw = 150, chh = 190, cols = 8;
    const cells = []; rows.forEach(r => { G[r].forEach(t => cells.push(t)); while (cells.length % cols) cells.push(null); });
    size(cw * cols, chh * (cells.length / cols) + 10);
    sky(0, 0, cv.width, cv.height, m);
    cells.forEach((t, i) => {
      if (!t) return;
      const x = cw * (i % cols) + cw / 2, y = chh * Math.floor(i / cols) + 34;
      cord(x, y, 26, m.night);
      box(t, x, y, ITEM); chime(t, x, y, ITEM, { night: m.night, count: -1 });
      label(lab(t), x, y + 148, 11, m.ink);
    });
  } else if (/_3x$/.test(name)) {
    const list = G[name.replace('_3x', '')], S = ITEM * 3, cw = 400, chh = 420, cols = Math.min(4, list.length);
    const n = list.length, rowsN = Math.ceil(n / cols) * 2;
    size(cw * cols, chh * rowsN);
    const ms = ['morning', 'noon', 'sunset', 'night'];
    list.forEach((t, i) => {
      for (let v = 0; v < 2; v++) {
        const m = MOODS[ms[(i + v * 2) % 4]];
        const cx = cw * (i % cols), cy = chh * (Math.floor(i / cols) * 2 + v);
        sky(cx, cy, cw, chh, m);
        const x = cx + cw / 2, y = cy + 34;
        cord(x, y, 30, m.night);
        chime(t, x, y, S, { night: m.night, ring: v ? 0.7 : 0, count: v && t.n ? Math.ceil(t.n / 2) : -1 });
        label(lab(t) + (v ? '  ring .7' : ''), x, cy + chh - 10, 14, m.ink);
      }
    });
  } else if (name === 'strings_small') {
    // counting strings at in-game size (112) and iPhone size (60), on every mood, over a khaki meadow / tent strip
    const ms = ['morning', 'noon', 'sunset', 'night'], rowH = 330, W = 1500;
    size(W, rowH * 4);
    ms.forEach((mn, r) => {
      const m = MOODS[mn], oy = r * rowH;
      sky(0, oy, W, rowH, m);
      g.fillStyle = m.night > 0.9 ? '#2E3B3A' : '#B9B48A'; g.fillRect(0, oy + 120, W, rowH - 120);   // meadow
      g.fillStyle = m.night > 0.9 ? '#4A4A3A' : '#D9C9A8';                                           // tent canvas
      g.beginPath(); g.moveTo(700, oy + 300); g.lineTo(860, oy + 110); g.lineTo(1020, oy + 300); g.fill();
      [1, 2, 3, 4, 5].forEach((n, i) => {
        const x = 70 + i * 140, y = oy + 40;
        cord(x, y, 30, m.night);
        chime({ kind: 'string', n }, x, y, ITEM, { night: m.night, count: i === 3 ? 2 : -1 });
        label('n ' + n + (i === 3 ? ' count 2' : ''), x, oy + rowH - 50, 12, m.ink);
      });
      [1, 2, 3, 4, 5].forEach((n, i) => {
        const x = 760 + i * 80, y = oy + 150;
        cord(x, y, 20, m.night);
        chime({ kind: 'string', n }, x, y, 60, { night: m.night, count: i === 4 ? 3 : -1 });
        label('60px n ' + n, x, oy + rowH - 50, 11, m.ink);
      });
      [1, 3, 5].forEach((n, i) => {
        const x = 1230 + i * 90, y = oy + 150;
        cord(x, y, 20, m.night);
        chime({ kind: 'string', n }, x, y, 60, { night: m.night, ring: 0.7 });
      });
      label(mn, 1320, oy + 30, 14, m.ink);
    });
  } else if (name === 'opts') {
    const V = [
      ['ring 0', { kind: 'bell', color: 'red' }, { ring: 0 }],
      ['ring .4', { kind: 'bell', color: 'red' }, { ring: 0.4 }],
      ['ring .7', { kind: 'bell', color: 'red' }, { ring: 0.7 }],
      ['ring 1', { kind: 'bell', color: 'red' }, { ring: 1 }],
      ['wrong ring .5 flash 0', { kind: 'bell', color: 'blue' }, { ring: 0.5, flash: 0 }],
      ['glow .5', { kind: 'bell', color: 'green' }, { glow: 0.5 }],
      ['glow 1', { kind: 'plate', shape: 'star', color: 'yellow' }, { glow: 1 }],
      ['dim 1', { kind: 'bell', color: 'purple' }, { dim: 1 }],
      ['clap -1', { kind: 'bell', color: 'orange' }, { clap: -1 }],
      ['clap 1', { kind: 'bell', color: 'orange' }, { clap: 1 }],
      ['count 0/3', { kind: 'string', n: 3 }, { count: 0 }],
      ['count 2/3', { kind: 'string', n: 3 }, { count: 2 }],
      ['count 5/5', { kind: 'string', n: 5 }, { count: 5 }],
      ['dots count 4/7', { kind: 'dots', n: 7 }, { count: 4 }],
      ['fox ring .8', { kind: 'animal', animal: 'fox' }, { ring: 0.8 }],
      ['frog ring .8', { kind: 'animal', animal: 'frog' }, { ring: 0.8 }],
      ['owl ring .8', { kind: 'animal', animal: 'owl' }, { ring: 0.8 }],
      ['duck ring .8', { kind: 'animal', animal: 'duck' }, { ring: 0.8 }],
      ['pop .5', { kind: 'bell', color: 'pink' }, { pop: 0.5 }],
      ['big ×1.25', { kind: 'bell', color: 'red', big: true }, {}, 1.25],
      ['small ×.75', { kind: 'bell', color: 'red', big: false }, {}, 0.75],
      ['glyph ring .7', { kind: 'glyph', text: 'K', color: 'green' }, { ring: 0.7 }],
      ['plate heart ring .7', { kind: 'plate', shape: 'heart', color: 'pink' }, { ring: 0.7 }],
      ['rabbit glow 1', { kind: 'animal', animal: 'rabbit' }, { glow: 1 }]
    ];
    const cw = 200, chh = 230, cols = 8, rows = Math.ceil(V.length / cols);
    size(cw * cols, chh * rows * 2);
    ['noon', 'night'].forEach((mn, half) => {
      const m = MOODS[mn];
      sky(0, half * chh * rows, cv.width, chh * rows, m);
      V.forEach((v, i) => {
        const x = cw * (i % cols) + cw / 2, y = half * chh * rows + chh * Math.floor(i / cols) + 40;
        cord(x, y, 32, m.night);
        chime(v[1], x, y, ITEM * (v[3] || 1), Object.assign({ night: m.night }, v[2]));
        label(v[0], x, y + 178, 12, m.ink);
      });
    });
  } else if (name === 'scene') {
    const W = 1200, H = 560, ms = ['morning', 'noon', 'sunset', 'night'], lits = [0, 2, 3, 5];
    size(W, H * 4);
    ms.forEach((mn, r) => {
      const m = MOODS[mn], oy = r * H;
      sky(0, oy, W, H, m);
      g.fillStyle = m.night > 0.9 ? '#2B3A3A' : '#9DB98A'; g.fillRect(0, oy + H - 70, W, 70);
      const by = oy + 230, layout = {
        beam: { x0: 260, x1: W - 40, y: by, r: 15 },
        posts: [{ x: 260, top: by - 70, bottom: oy + H - 60 }, { x: W - 40, top: by - 70, bottom: oy + H - 60 }],
        garland: { x0: 260, x1: W - 40, y: by - 62, sag: 26 }
      };
      const things = [{ kind: 'bell', color: 'red' }, { kind: 'plate', shape: 'triangle', color: 'blue' }, { kind: 'string', n: 3 }, { kind: 'animal', animal: ['bear', 'fox', 'owl', 'frog'][r] }, { kind: 'bell', color: 'yellow' }];
      const n = 5, sp = (layout.beam.x1 - layout.beam.x0) / n, hooks = [];
      for (let i = 0; i < n; i++) hooks.push(layout.beam.x0 + sp * (i + 0.5));
      const g0 = layout.garland, colsL = ['red', 'blue', null, 'yellow', 'green'];
      const lanterns = [];
      for (let i = 0; i < 5; i++) {
        const x = g0.x0 + (g0.x1 - g0.x0) * (i + 1) / 6, u = (x - g0.x0) / (g0.x1 - g0.x0);
        const y = g0.y + 2 * g0.sag * 2 * u * (1 - u);
        lanterns.push({ x, y, lit: i < lits[r] ? 1 : 0, color: i < lits[r] ? colsL[i] : null, swing: (i - 2) * 0.05, flash: i === lits[r] - 1 ? 0.6 : 0 });
      }
      A.drawFire(g, { x: 150, y: oy + H - 66, s: 1 }, { t: r * 0.37, glow: [0.4, 0.25, 0.7, 1][r] });
      A.drawGarland(g, g0, lanterns, { t: 0, night: m.night });
      A.drawBeam(g, layout, { t: 0, wob: 0, night: m.night, hooks });
      const cords = [100, 140, 110, 150, 95];
      hooks.forEach((hx, i) => {
        const hp = A.hookPoint(layout, hx, 0), th = [0.12, -0.05, 0.03, -0.1, 0.07][i];
        const ex = hp.x + Math.sin(th) * cords[i], ey = hp.y + Math.cos(th) * cords[i];
        A.drawCord(g, hp.x, hp.y, ex, ey, { night: m.night });
        g.save(); g.translate(ex, ey); g.rotate(-th * 1.2);
        A.drawChime(g, things[i], ITEM, { night: m.night, ring: i === 1 ? 0.6 : 0, glow: i === 0 && r === 1 ? 0.8 : 0, count: things[i].kind === 'string' ? 2 : -1 });
        g.restore();
      });
      A.drawNote(g, 560, by - 120, 40, { color: 'red', alpha: 1, rot: -0.2 });
      if (m.night) { A.drawFirefly(g, 330, oy + 420, 4.5, 1); A.drawFirefly(g, 700, oy + 470, 4, 0.5); }
      label(mn + ' — lanterns lit ' + lits[r] + ' — fire top y≈' + Math.round(A.fireTop({ x: 150, y: oy + H - 66, s: 1 }) - oy), W / 2, oy + H - 16, 15, m.ink);
    });
  } else if (name === 'misc') {
    size(1200, 900, '#FDF3E1');
    sky(0, 0, 1200, 220, MOODS.noon); sky(0, 220, 1200, 220, MOODS.night);
    [null].concat(COLORS).forEach((c, i) => { A.drawNote(g, 80 + i * 140, 100, 56, { color: c, rot: (i % 3 - 1) * 0.2 }); label(c || 'gold', 80 + i * 140, 200, 12, '#24425A'); });
    [0, 0.3, 0.6, 1].forEach((gl, i) => { A.drawFirefly(g, 120 + i * 200, 320, 5, gl); label('firefly glow ' + gl, 120 + i * 200, 420, 12, '#E8EEFF'); });
    [0, 0.5, 1].forEach((p, i) => { g.save(); g.translate(900 + i * 110, 300); A.drawGhostHand(g, 90, p); g.restore(); label('press ' + p, 930 + i * 110, 425, 12, '#E8EEFF'); });
    const icons = [{ kind: 'number', n: 3 }, { kind: 'number', n: 8 }, { kind: 'color', color: 'green' }, { kind: 'size', big: true, color: 'blue' }, { kind: 'size', big: false, color: 'blue' }, { kind: 'letter', text: 'B' }, { kind: 'bell', color: 'purple' }, { kind: 'string', n: 4 }, { kind: 'animal', animal: 'deer' }, { kind: 'plate', shape: 'rect', color: 'orange' }];
    icons.forEach((t, i) => {
      const x = 70 + (i % 5) * 220 + 50, y = 520 + Math.floor(i / 5) * 190 + 70;
      g.fillStyle = '#FFFFFF'; g.fillRect(x - 70, y - 70, 140, 140); g.strokeStyle = 'rgba(80,120,200,0.4)'; g.strokeRect(x - 60, y - 60, 120, 120);
      g.save(); g.translate(x, y); A.drawIcon(g, t, 120); g.restore();
      label(t.kind + (t.n ? ' ' + t.n : '') + (t.big != null ? (t.big ? ' big' : ' small') : ''), x, y + 88, 12);
    });
  }
  return cv.toDataURL('image/png');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const all = ['all_morning', 'all_noon', 'all_sunset', 'all_night', 'bells_3x', 'plates_3x', 'strings_3x', 'strings_small', 'dots_3x', 'animals_3x', 'glyphs_3x', 'opts', 'scene', 'misc'];
  const names = process.argv.slice(2).length ? process.argv.slice(2) : all;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ content: ART });
  for (const name of names) {
    const url = await page.evaluate(pageSheet, { name });
    const file = path.join(OUT, 'chime_' + name + '.png');
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', path.relative(ROOT, file));
  }
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
