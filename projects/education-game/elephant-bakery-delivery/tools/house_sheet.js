// Tupi's Bakery Delivery — contact sheets for BD.HouseArt (game/js/house_art.js) → docs/art/house_*.png
// Usage: node tools/house_sheet.js [name ...]       (Playwright + the preinstalled Chromium; no install)
//   house_colors.png   colour mode: 7 colours × 3 seeds (roof styles) at S = 160, rows cycle the 4 tablecloth tints
//   house_signs.png    sign mode with every sign kind at in-game size (S 150 / 160 / 170): shapes, dots ± numeral 1–12, tiles
//                      (letters, sums, numbers, odd / even EN + VI), 12 animals, 5 homes, big / small treats, cookies, blob
//   house_3x.png       a selection at 3× (S = 450) on the four tints
//   house_treats.png   5 treats × 7 colours at cargo size (72) and 2×, 8 shape cookies × 7 colours, blobs
//   house_cookies.png  cookies 1–12 at cargo size and 2× (counting rings), dots 1–12 ± numeral, tiles incl. Vietnamese
//   house_states.png   door open sequence, lit, glow, active, squash, snow, alpha, heart puffs, sprinkles, snowflakes,
//                      hint hand, Talk-time icons, home badges
//   house_phone.png    a mock town (3 houses + cart-size cargo) at iPhone scale (×0.54) and in-game scale, per tint
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs/art');
const ART = fs.readFileSync(path.join(ROOT, 'game/js/house_art.js'), 'utf8');
const ANDIR = path.join(ROOT, 'game/assets/default/animals');

function pageSheet({ name }) {
  const A = window.BD.HouseArt;
  const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  const TINTS = [['spring', '#E3E6CF'], ['summer', '#F1E3B9'], ['autumn', '#EBD3B8'], ['winter', '#DCE0E6']];
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  function size(w, h, bg) { cv.width = w; cv.height = h; g.fillStyle = bg || '#F6ECD8'; g.fillRect(0, 0, w, h); }
  function cloth(x, y, w, h, i, cell) {   // cream tablecloth with a faint gingham check in the season tint
    cell = cell || 44;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = '#F6ECD8'; g.fillRect(x, y, w, h);
    g.globalAlpha = 0.55; g.fillStyle = TINTS[i % 4][1];
    for (let cx = x; cx < x + w; cx += cell * 2) g.fillRect(cx, y, cell, h);
    for (let cy = y; cy < y + h; cy += cell * 2) g.fillRect(x, cy, w, cell);
    g.globalAlpha = 1; g.restore();
  }
  function label(t, x, y, s, col) { g.save(); g.font = '700 ' + (s || 12) + 'px system-ui, sans-serif'; g.fillStyle = col || '#5A4636'; g.textAlign = 'center'; g.fillText(t, x, y); g.restore(); }
  function house(x, y, S, o) { g.save(); g.translate(x, y); A.drawHouse(g, S, o || {}); g.restore(); }
  function thing(x, y, t, s, o) { g.save(); g.translate(x, y); A.drawThing(g, t, s, o || {}); g.restore(); }
  const lab = t => !t ? '' : t.kind === 'treat' ? t.color + ' ' + t.obj + (t.big === false ? ' (small)' : '') : t.kind === 'shape' ? t.color + ' ' + t.shape
    : t.kind === 'dots' ? t.n + ' dot' + (t.n > 1 ? 's' : '') + (t.numeral ? ' +N' : '') : t.kind === 'cookies' ? t.n + ' cookies' : t.kind === 'tile' ? '"' + A.tileText(t, t.lang) + '"'
    : t.kind === 'home' ? 'home ' + t.home : t.kind === 'blob' ? t.color + ' blob' : t.animal;

  if (name === 'colors') {
    const cols = 7, cw = 200, rh = 220, rows = 4;
    size(cw * cols, rh * rows + 24);
    for (let r = 0; r < rows; r++) cloth(0, 24 + r * rh, cv.width, rh, r);
    label('house_colors · colour mode at S = 160 (in-game logical px) · rows: spring / summer / autumn / winter tint · row 4: snow 1 + lit', cv.width / 2, 16, 13);
    for (let r = 0; r < rows; r++) COLORS.forEach((c, i) => {
      const x = cw * i + cw / 2, y = 24 + r * rh + 186;
      house(x, y, 160, { color: c, seed: r * 7 + i, snow: r === 3 ? 1 : 0, lit: r === 3 ? 1 : 0 });
      label(c + ' · roof ' + A.houseStyle(r * 7 + i).roof, x, y + 22, 11);
    });
  } else if (name === 'signs') {
    const list = [];
    A.SHAPES.forEach((s, i) => list.push({ kind: 'shape', shape: s, color: COLORS[i % 6] }));
    for (let n = 1; n <= 12; n++) list.push({ kind: 'dots', n, numeral: true });
    for (let n = 1; n <= 6; n++) list.push({ kind: 'dots', n });
    ['A', 'a', 'M', 'g', 'Đ', '3+2', '7−4', '15', '20', '14+6', '@odd', '@even'].forEach(text => list.push({ kind: 'tile', text, lang: 'en' }));
    list.push({ kind: 'tile', text: '@odd', lang: 'vi' }, { kind: 'tile', text: '@even', lang: 'vi' });
    A.ANIMALS.forEach(a => list.push({ kind: 'animal', animal: a }));
    A.HOMES.forEach(h => list.push({ kind: 'home', home: h }));
    list.push({ kind: 'treat', obj: 'cupcake', color: 'pink' }, { kind: 'treat', obj: 'cupcake', color: 'pink', big: false }, { kind: 'cookies', n: 3 }, { kind: 'cookies', n: 8 });
    const cols = 10, cw = 196, rh = 216, rows = Math.ceil(list.length / cols);
    size(cw * cols, rh * rows + 24);
    for (let r = 0; r < rows; r++) cloth(0, 24 + rh * r, cv.width, rh, r);
    label('house_signs · sign mode, S = 150 / 160 / 170 cycling (in-game logical px) · sign board thing box 0.56·S', cv.width / 2, 16, 13);
    list.forEach((t, i) => {
      const r = Math.floor(i / cols), x = cw * (i % cols) + cw / 2, y = 24 + rh * r + 184, S = [150, 160, 170][i % 3];
      house(x, y, S, { sign: t, seed: i, lang: t.lang });
      label(lab(t) + ' · S' + S, x, y + 22, 11);
    });
  } else if (name === '3x') {
    const list = [{ color: 'orange', seed: 0 }, { sign: { kind: 'dots', n: 4, numeral: true }, seed: 4 }, { sign: { kind: 'shape', shape: 'star', color: 'yellow' }, seed: 8, door: 0.6, lit: 1 },
      { sign: { kind: 'animal', animal: 'penguin' }, seed: 2, snow: 1 }, { sign: { kind: 'tile', text: '@even', lang: 'vi' }, seed: 5, glow: 1 }, { color: 'purple', seed: 1, door: 1, lit: 1, snow: 0.5 }];
    const cw = 520, rh = 520, cols = 3, rows = 2;
    size(cw * cols, rh * rows);
    list.forEach((o, i) => {
      const x0 = cw * (i % cols), y0 = rh * Math.floor(i / cols);
      cloth(x0, y0, cw, rh, i, 90);
      house(x0 + cw / 2, y0 + rh - 40, 400, o);
    });
  } else if (name === 'treats') {
    const cw = 120, rh = 120;
    size(cw * 8 + 40, rh * 5 + 9 * 90 + 260);
    cloth(0, 0, cv.width, cv.height, 0);
    A.TREATS.forEach((tr, r) => COLORS.forEach((c, i) => { thing(40 + cw * i + cw / 2, rh * r + 100, { kind: 'treat', obj: tr, color: c }, 72); label(c + ' ' + tr, 40 + cw * i + cw / 2, rh * r + 116, 10); }));
    label('treats at cargo size 72', 60, 20, 11);
    A.SHAPES.forEach((s, r) => COLORS.forEach((c, i) => { thing(40 + cw * i + cw / 2, rh * 5 + r * 90 + 80, { kind: 'shape', shape: s, color: c }, 64); }));
    COLORS.forEach((c, i) => thing(40 + cw * i + cw / 2, rh * 5 + 8 * 90 + 80, { kind: 'blob', color: c }, 64));
    // 2× row: the most confusable trio red / orange / yellow + green / blue / purple / pink
    COLORS.forEach((c, i) => thing(40 + 130 * i + 65, cv.height - 30, { kind: 'treat', obj: ['cupcake', 'donut', 'macaron', 'cakepop', 'jelly', 'cupcake', 'donut'][i], color: c }, 144));
  } else if (name === 'cookies') {
    size(1560, 1100);
    cloth(0, 0, 1560, 1100, 3);
    for (let n = 1; n <= 12; n++) { const x = 70 + (n - 1) * 124; thing(x, 110, { kind: 'cookies', n }, 72); label(n + '', x, 128, 12); }
    for (let n = 1; n <= 6; n++) { const x = 130 + (n - 1) * 250; thing(x, 330, { kind: 'cookies', n: n * 2 }, 160, { count: n }); label(n * 2 + ' cookies · 2× · count ' + n, x, 352, 12); }
    for (let n = 1; n <= 12; n++) { const x = 70 + (n - 1) * 124; thing(x, 520, { kind: 'dots', n }, 90); thing(x, 680, { kind: 'dots', n, numeral: true }, 90, { count: n === 5 ? 3 : 0 }); }
    ['A', 'a', 'Ă', 'Đ', 'ẵ', '3+2', '7−4', '10+10', '20', 'chẵn', 'lẻ', 'even'].forEach((tx, i) => thing(70 + i * 124, 860, { kind: 'tile', text: tx }, 90));
    A.HOMES.forEach((h, i) => thing(90 + i * 150, 1050, { kind: 'home', home: h }, 100));
    A.ANIMALS.slice(0, 5).forEach((a, i) => thing(840 + i * 140, 1050, { kind: 'animal', animal: a }, 100));
  } else if (name === 'states') {
    size(1600, 1240);
    cloth(0, 0, 1600, 620, 1); cloth(0, 620, 1600, 620, 2);
    const doors = [0, 0.2, 0.4, 0.6, 0.8, 1];
    doors.forEach((d, i) => { house(110 + i * 180, 220, 150, { sign: { kind: 'dots', n: 3, numeral: true }, seed: 3, door: d, lit: d }); label('door ' + d + ' · lit ' + d, 110 + i * 180, 244, 11); });
    doors.forEach((d, i) => { house(110 + i * 180, 440, 150, { color: 'blue', seed: 4, door: d }); label('colour door ' + d, 110 + i * 180, 464, 11); });
    const V = [['glow .5', { glow: 0.5 }], ['glow 1', { glow: 1 }], ['active 1', { active: 1 }], ['squash .85', { squash: 0.85 }], ['squash 1.1', { squash: 1.1 }],
      ['snow .25', { snow: 0.25 }], ['snow .5', { snow: 0.5 }], ['snow 1', { snow: 1 }], ['alpha .5', { alpha: 0.5 }]];
    V.forEach((v, i) => { const x = 110 + i * 170, y = 820; house(x, y, 150, Object.assign({ sign: { kind: 'shape', shape: 'heart', color: 'red' }, seed: i * 4 }, v[1])); label(v[0], x, y + 22, 11); });
    // heart puffs, sprinkles, snowflakes, hint hand
    [[10, 1], [16, 1], [24, 0.7], [32, 0.4]].forEach((p, i) => { g.save(); g.translate(1150 + i * 90, 120); A.drawHeartPuff(g, p[0], p[1]); g.restore(); });
    for (let k = 0; k < 6; k++) for (let j = 0; j < 3; j++) { g.save(); g.translate(1150 + k * 60, 220 + j * 40); A.drawSprinkle(g, k, [5, 8, 12][j], j * 0.6); g.restore(); }
    [[22, 0, 1], [34, 0.4, 1], [46, 0.2, 0.6]].forEach((q, i) => { g.save(); g.translate(1180 + i * 120, 420); A.drawSnowflake(g, q[0], q[1], q[2]); g.restore(); });
    [0, 0.5, 1].forEach((p, i) => A.drawHintHand(g, 1200 + i * 130, 500, p, i === 2 ? 0.6 : 1));
    // Talk-time icons + badges
    const icons = [{ kind: 'color', color: 'red' }, { kind: 'color', color: 'orange' }, { kind: 'color', color: 'yellow' }, { kind: 'number', n: 3 }, { kind: 'number', n: 8 },
      { kind: 'home', home: 'sea' }, { kind: 'size', big: true }, { kind: 'size', big: false }, { kind: 'shape', shape: 'triangle', color: 'green' }, { kind: 'cookies', n: 4 },
      { kind: 'letter', text: 'B' }, { kind: 'animal', animal: 'lion' }, { kind: 'treat', obj: 'donut', color: 'purple' }];
    icons.forEach((ic, i) => {
      const x = 70 + i * 118, y = 1060;
      g.fillStyle = '#FFFDF6'; g.strokeStyle = '#C9B79A'; g.lineWidth = 2; g.beginPath(); g.roundRect(x - 52, y - 52, 104, 104, 18); g.fill(); g.stroke();
      g.save(); g.translate(x, y); A.drawIcon(g, ic, 96); g.restore();
      label(ic.kind, x, y + 70, 11);
    });
  } else if (name === 'phone') {
    const W = 1100, H = 520;
    size(W * 2, H * 4);
    for (let ti = 0; ti < 4; ti++) for (let half = 0; half < 2; half++) {
      const ox = half * W, oy = ti * H, k = half ? 1 : 0.54;
      cloth(ox, oy, W, H, ti, 44 * k);
      g.save(); g.translate(ox + 40, oy + 30); g.scale(k, k);
      const rows = [[{ color: 'red' }, { color: 'blue' }, { color: 'yellow' }],
        [{ sign: { kind: 'dots', n: 2, numeral: true } }, { sign: { kind: 'dots', n: 4, numeral: true } }, { sign: { kind: 'dots', n: 5, numeral: true } }],
        [{ sign: { kind: 'home', home: 'ice' } }, { sign: { kind: 'shape', shape: 'triangle', color: 'green' } }, { sign: { kind: 'tile', text: '@even', lang: 'vi' } }]];
      const row = rows[ti % 3];
      row.forEach((o, i) => house(200 + i * 260, 240 + (i % 2) * 40, 160, Object.assign({ seed: ti * 3 + i, snow: ti === 3 ? 1 : 0, lit: i === 0 ? 1 : 0 }, o)));
      thing(200, 420, ti % 3 === 0 ? { kind: 'treat', obj: 'cupcake', color: 'red' } : ti % 3 === 1 ? { kind: 'cookies', n: 4 } : { kind: 'animal', animal: 'penguin' }, 70);
      thing(330, 420, { kind: 'treat', obj: 'macaron', color: 'orange' }, 70);
      thing(460, 420, { kind: 'treat', obj: 'jelly', color: 'yellow' }, 70);
      g.restore();
      label(TINTS[ti][0] + (half ? ' · in-game logical' : ' · iPhone scale ×0.54'), ox + W / 2, oy + H - 12, 14);
    }
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
    window.BD = window.BD || {};
    window.BD.Assets = { images: imgs, has: k => !!imgs[k], img: k => imgs[k] || null };
    return Object.keys(imgs).length;
  }, map);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const all = ['colors', 'signs', '3x', 'treats', 'cookies', 'states', 'phone'];
  const names = process.argv.slice(2).length ? process.argv.slice(2) : all;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.setContent('<!doctype html><html><body></body></html>');
  const nA = await setupAnimals(page);
  await page.addScriptTag({ content: ART });
  if (nA) console.log('animal images loaded:', nA);
  for (const name of names) {
    const url = await page.evaluate(pageSheet, { name });
    const file = path.join(OUT, 'house_' + name + '.png');
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', path.relative(ROOT, file));
  }
  const st = await page.evaluate(() => window.BD.HouseArt.stats);
  console.log('cache stats', JSON.stringify(st));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
