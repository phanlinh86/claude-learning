// Moka's Fairy Tea Party — contact sheets for FT.TeaArt (game/js/tea_art.js) → docs/art/tea_*.png
// Usage: node tools/tea_sheet.js [name ...]
//   tea_objs.png       5 objects × 7 colours at in-game size 124 on table #A9784E / moss #8DAA6A / rain-dark #5E6B78
//   tea_cookies.png    8 shapes × colours at 124 on the three grounds
//   tea_plates.png     plates n = 1–12 at 124 on the three grounds + a count-highlight row
//   tea_cards.png      place cards (A–Z sample, "3+2", "7−4", 12 …) on the three grounds
//   tea_table.png      log table + placemats + things + garland (2 lit + 2 unlit lanterns) + fluff + badges + icons + hint hand
//                      (sunny and rain halves)
//   tea_opts.png       glow / dim / ring / small / guests (images if present, else placeholders)
//   tea_objs_3x.png, tea_cookies_3x.png   at 3× (372)
// Loads game/js/content.js, game/js/assets.js and game/js/tea_art.js; guest SVGs from game/assets/default/guests/ (if any)
// are put into the real FT.Assets.images so the real FT.Assets.has / sprite path is used.
// Also prints the colour-dominance check: share of an object's visible pixels in its answer-colour family (must be ≥ 50 %).
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs/art');
const JS = ['content.js', 'assets.js', 'tea_art.js'].map(f => fs.readFileSync(path.join(ROOT, 'game/js', f), 'utf8'));
const GDIR = path.join(ROOT, 'game/assets/default/guests');

function pageSheet({ name }) {
  const A = window.FT.TeaArt;
  const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  const ITEM = 124;
  const BG = {
    table: { fill: '#A9784E', edge: '#6E4A2E', ink: '#FFF3DE', night: 0 },
    moss: { fill: '#8DAA6A', edge: '#5E7C46', ink: '#22361A', night: 0 },
    rain: { fill: '#5E6B78', edge: '#3E4852', ink: '#EEF3F8', night: 1 }
  };
  const BGS = ['table', 'moss', 'rain'];
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  function size(w, h, bg) { cv.width = w; cv.height = h; g.fillStyle = bg || '#F4EFE6'; g.fillRect(0, 0, w, h); }
  function band(x, y, w, h, b) { g.fillStyle = b.fill; g.fillRect(x, y, w, h); g.fillStyle = b.edge; g.fillRect(x, y + h - 4, w, 4); }
  function label(t, x, y, s, col) { g.save(); g.font = '700 ' + (s || 12) + 'px system-ui, sans-serif'; g.fillStyle = col || '#4A4237'; g.textAlign = 'center'; g.fillText(t, x, y); g.restore(); }
  function thing(t, x, y, sz, opt, mat) {
    if (mat !== false) { g.save(); g.translate(x, y); A.drawPlacemat(g, sz * 1.08, {}); g.restore(); }
    g.save(); g.translate(x, y); A.drawThing(g, t, sz, opt || {}); g.restore();
  }
  const lab = t => t.kind === 'obj' ? t.color + ' ' + t.obj : t.kind === 'cookie' ? t.color + ' ' + t.shape : t.kind === 'plate' ? 'plate ' + t.n : t.kind === 'card' ? '"' + t.text + '"' : t.animal;

  const sets = {
    objs: () => { const r = []; A.OBJECTS.forEach(o => COLORS.forEach(c => r.push({ kind: 'obj', obj: o, color: c }))); return { list: r, cols: 7 }; },
    cookies: () => { const r = []; ['red', 'blue', 'green', 'purple'].forEach((c, ci) => A.SHAPES.forEach((s, i) => r.push({ kind: 'cookie', shape: s, color: ci === 3 ? COLORS[(i + 4) % 7] : c }))); return { list: r, cols: 8 }; },
    plates: () => ({ list: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => ({ kind: 'plate', n })), cols: 6 }),
    cards: () => ({ list: ['A', 'B', 'M', 'W', 'Q', 'Z', 'a', 'g', 'b', 'd', '3+2', '7−4', '10+10', '12', '9', '20'].map(text => ({ kind: 'card', text })), cols: 8 })
  };

  if (sets[name]) {
    const { list, cols } = sets[name](), cw = 156, rh = 178, rows = Math.ceil(list.length / cols);
    size(cw * cols, rh * rows * 3 + 4);
    BGS.forEach((bn, bi) => {
      const b = BG[bn], oy = bi * rh * rows;
      band(0, oy, cv.width, rh * rows, b);
      list.forEach((t, i) => {
        const x = cw * (i % cols) + cw / 2, y = oy + rh * Math.floor(i / cols) + 146;
        thing(t, x, y, ITEM, { night: b.night });
        label(lab(t), x, y + 26, 11, b.ink);
      });
      label(bn, 30, oy + 14, 12, b.ink);
    });
    if (name === 'plates') {   // count highlight row appended
      const old = g.getImageData(0, 0, cv.width, cv.height), H0 = cv.height;
      cv.height = H0 + rh; g.putImageData(old, 0, 0);
      band(0, H0, cv.width, rh, BG.table);
      [[3, 0], [3, 2], [3, 3], [7, 4], [10, 6], [12, 12]].forEach((q, i) => {
        const x = cw * i + cw / 2, y = H0 + 146;
        thing({ kind: 'plate', n: q[0] }, x, y, ITEM, { count: q[1], glow: i === 5 ? 0.6 : 0 });
        label('n ' + q[0] + ' count ' + q[1], x, y + 26, 11, BG.table.ink);
      });
    }
  } else if (/_3x$/.test(name)) {
    const base = name.replace('_3x', '');
    let list;
    if (base === 'objs') list = A.OBJECTS.map((o, i) => ({ kind: 'obj', obj: o, color: ['red', 'blue', 'yellow', 'green', 'purple'][i] })).concat([{ kind: 'obj', obj: 'cup', color: 'orange' }, { kind: 'obj', obj: 'jar', color: 'pink' }, { kind: 'obj', obj: 'cupcake', color: 'blue' }]);
    else list = A.SHAPES.map((s, i) => ({ kind: 'cookie', shape: s, color: COLORS[i % 7] }));
    const S = ITEM * 3, cw = 430, rh = 440, cols = 4, rows = Math.ceil(list.length / cols);
    size(cw * cols, rh * rows);
    list.forEach((t, i) => {
      const b = BG[BGS[i % 3]], x0 = cw * (i % cols), y0 = rh * Math.floor(i / cols);
      band(x0, y0, cw, rh, b);
      thing(t, x0 + cw / 2, y0 + rh - 40, S, { night: b.night });
      label(lab(t), x0 + cw / 2, y0 + rh - 12, 14, b.ink);
    });
  } else if (name === 'opts') {
    const V = [
      ['plain', { kind: 'obj', obj: 'teapot', color: 'red' }, {}],
      ['glow .5', { kind: 'obj', obj: 'teapot', color: 'red' }, { glow: 0.5 }],
      ['glow 1', { kind: 'cookie', shape: 'star', color: 'yellow' }, { glow: 1 }],
      ['dim 1', { kind: 'obj', obj: 'jar', color: 'blue' }, { dim: 1 }],
      ['big:false', { kind: 'obj', obj: 'bowl', color: 'green', big: false }, {}],
      ['big', { kind: 'obj', obj: 'bowl', color: 'green' }, {}],
      ['ring .5', { kind: 'obj', obj: 'cupcake', color: 'orange' }, { ring: 0.5 }],
      ['ring 1', { kind: 'obj', obj: 'cup', color: 'purple' }, { ring: 1 }],
      ['plate glow', { kind: 'plate', n: 5 }, { glow: 0.8 }],
      ['plate berryN 12', { kind: 'plate', n: 2 }, { berryN: 12 }],
      ['card glow', { kind: 'card', text: '3+2' }, { glow: 0.8 }],
      ['card small', { kind: 'card', text: 'B', big: false }, {}]
    ].concat(A.ANIMALS.map((a, i) => [a + (i % 3 === 1 ? ' hop' : i % 3 === 2 ? ' glow' : ''), { kind: 'guest', animal: a, big: i === 12 ? false : undefined }, { hop: i % 3 === 1 ? 1 : 0, glow: i % 3 === 2 ? 0.8 : 0 }]));
    const cw = 160, rh = 180, cols = 9, rows = Math.ceil(V.length / cols);
    size(cw * cols, rh * rows * 2);
    ['table', 'rain'].forEach((bn, half) => {
      const b = BG[bn];
      band(0, half * rh * rows, cv.width, rh * rows, b);
      V.forEach((v, i) => {
        const x = cw * (i % cols) + cw / 2, y = half * rh * rows + rh * Math.floor(i / cols) + 146;
        thing(v[1], x, y, ITEM, Object.assign({ night: b.night }, v[2]));
        label(v[0], x, y + 26, 11, b.ink);
      });
    });
  } else if (name === 'table') {
    const W = 1560, H = 720;
    size(W, H * 2);
    [0, 1].forEach(half => {
      const oy = half * H, rain = half === 1;
      const sky = g.createLinearGradient(0, oy, 0, oy + H);
      sky.addColorStop(0, rain ? '#97A9B4' : '#BFE3D0'); sky.addColorStop(1, rain ? '#CBD6D6' : '#FBF6DF');
      g.fillStyle = sky; g.fillRect(0, oy, W, H);
      g.fillStyle = rain ? '#7E9070' : '#A9C68A'; g.fillRect(0, oy + 600, W, 120);
      // garland
      const gar = { x0: 120, x1: 1440, y: oy + 120, sag: 40 }, lan = [];
      const things = [{ kind: 'obj', obj: 'teapot', color: 'blue' }, { kind: 'cookie', shape: 'star', color: 'yellow' }, null, null];
      for (let i = 0; i < 4; i++) {
        const f = (i + 0.5) / 4, u = 1 - f, x = u * u * gar.x0 + 2 * u * f * 780 + f * f * gar.x1, y = u * u * gar.y + 2 * u * f * (gar.y + 80) + f * f * gar.y;
        lan.push({ x, y, lit: i < 2 ? 1 : 0, color: i === 0 ? 'blue' : null, thing: things[i], swing: [0.12, -0.05, 0, 0.08][i] });
      }
      gar.badge = rain ? { home: 'ice', i: 1, a: 1 } : null;
      gar.twinkle = rain ? 0 : 0.5;
      A.drawGarland(g, gar, lan, 1.3);
      // table
      const ty = oy + 450, x0 = 360, x1 = 1400;
      A.drawTable(g, x0, x1, ty, { wet: rain ? 1 : 0, spring: rain ? 3 : 0, groundY: oy + 610 });
      const row = rain ? [{ kind: 'guest', animal: 'bunny' }, { kind: 'guest', animal: 'fox', hop: 1 }, { kind: 'plate', n: 4 }, { kind: 'card', text: '7−4' }, { kind: 'guest', animal: 'penguin' }]
        : [{ kind: 'obj', obj: 'cup', color: 'red' }, { kind: 'obj', obj: 'jar', color: 'red' }, { kind: 'obj', obj: 'cupcake', color: 'blue' }, { kind: 'obj', obj: 'bowl', color: 'red' }, { kind: 'obj', obj: 'teapot', color: 'red' }];
      row.forEach((t, i) => {
        const x = 460 + i * 210;
        g.save(); g.translate(x, ty); A.drawPlacemat(g, 134, { pop: i === 0 && !rain ? 0.5 : 0 }); g.restore();
        if (i === 4 && !rain) return;   // the teapot is still falling under its fluff
        g.save(); g.translate(x, ty); A.drawThing(g, t, ITEM, { night: rain ? 1 : 0, hop: t.hop || 0, glow: !rain && i === 2 ? 0.7 : 0, ring: rain && i === 1 ? 0.9 : 0 }); g.restore();
      });
      if (!rain) {   // a falling teapot under its fluff
        const fx = 1300, fy = oy + 250;
        A.drawFluff(g, fx, fy - 30 - 124, 38, 1);
        g.save(); g.translate(fx, fy); g.rotate(0.12); A.drawThing(g, row[4], ITEM, {}); g.restore();
        A.drawFluff(g, 230, oy + 300, 26, 0.6);
      }
      // badges + icons + hint hand + sparkles
      A.HOMES.forEach((h, i) => { g.save(); g.translate(70 + i * 58, oy + (rain ? 420 : 380)); A.drawHomeBadge(g, h, 26, {}); g.restore(); });
      const icons = rain ? [{ kind: 'number', n: 3 }, { kind: 'number', n: 8 }, { kind: 'home', home: 'desert' }, { kind: 'size', big: false }]
        : [{ kind: 'color', color: 'red' }, { kind: 'color', color: 'blue' }, { kind: 'size', big: true }, { kind: 'letter', text: 'B' }];
      icons.forEach((t, i) => {
        const x = 80 + i * 78, y = oy + 520;
        g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(x - 36, y - 36, 72, 72);
        g.save(); g.translate(x, y); A.drawIcon(g, t, 66); g.restore();
      });
      A.drawHintHand(g, 880 + (rain ? 0 : 0), ty - 70, rain ? 1 : 0.3, 1);
      [[700, 300, 10], [760, 330, 6], [1100, 280, 8]].forEach((s, i) => A.drawSparkle(g, s[0], oy + s[1], s[2], 1, i * 0.4));
      label(rain ? 'rain (wet, night 1)' : 'sunny', 70, oy + 20, 14, '#33402A');
    });
  }
  return cv.toDataURL('image/png');
}

/* colour dominance: share of an object's visible pixels whose colour is in its answer family */
function dominance() {
  const A = window.FT.TeaArt, out = [];
  const cv = document.createElement('canvas'); cv.width = 160; cv.height = 160;
  const g = cv.getContext('2d');
  const hex = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'].forEach(c => {
    const p = A.pal(c), base = hex(p.base), dark = hex(p.dark), light = hex(p.light);
    const fam = [base, dark, light, mix(base, dark, 0.34), mix(base, dark, 0.22), mix(base, dark, 0.5), mix(light, [255, 255, 255], 0.45), mix(base, light, 0.5)];
    A.OBJECTS.forEach(o => {
      g.clearRect(0, 0, 160, 160); g.save(); g.translate(80, 142); A.drawThing(g, { kind: 'obj', obj: o, color: c }, 124, {}); g.restore();
      const d = g.getImageData(0, 0, 160, 160).data; let vis = 0, inF = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 200) continue;
        vis++;
        const px = [d[i], d[i + 1], d[i + 2]];
        if (fam.some(f => Math.abs(f[0] - px[0]) + Math.abs(f[1] - px[1]) + Math.abs(f[2] - px[2]) < 60)) inF++;
      }
      out.push([o, c, Math.round(100 * inF / vis)]);
    });
  });
  return out;
}

async function setupGuests(page) {
  if (!fs.existsSync(GDIR)) return 0;
  const files = fs.readdirSync(GDIR).filter(f => /\.svg$/.test(f));
  const map = {};
  files.forEach(f => { map['guests/' + f.replace(/\.svg$/, '')] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(GDIR, f)).toString('base64'); });
  return page.evaluate(async (m) => {
    const A = window.FT.Assets, n = [];
    await Promise.all(Object.keys(m).map(k => new Promise(res => { const i = new Image(); i.onload = () => { A.images[k] = i; n.push(k); res(); }; i.onerror = () => res(); i.src = m[k]; })));
    return n.length;
  }, map);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const all = ['objs', 'cookies', 'plates', 'cards', 'table', 'opts', 'objs_3x', 'cookies_3x'];
  const names = process.argv.slice(2).filter(a => a !== '--dom');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.setContent('<!doctype html><html><body></body></html>');
  for (const src of JS) await page.addScriptTag({ content: src });
  const nG = await setupGuests(page);
  console.log('guest images loaded:', nG);
  for (const name of (names.length ? names : all)) {
    const url = await page.evaluate(pageSheet, { name });
    const file = path.join(OUT, 'tea_' + name + '.png');
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', path.relative(ROOT, file));
  }
  const dom = await page.evaluate(dominance);
  const low = dom.filter(d => d[2] < 50);
  console.log('colour dominance (min ' + Math.min(...dom.map(d => d[2])) + '%):', dom.map(d => d[0] + '/' + d[1] + ' ' + d[2]).join(', '));
  if (low.length) console.log('BELOW 50%:', low.map(d => d.join(' ')).join(', '));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
