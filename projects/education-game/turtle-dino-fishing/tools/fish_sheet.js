// Tibo's Dino Lake Fishing — contact sheets for TL.FishArt (game/js/fish_art.js) → docs/art/fish_*.png
// Usage: node tools/fish_sheet.js [name ...]      (chromium via Playwright)
//   fish_colors.png    7 colour fish (right + left facing) on the 4 water moods (morning, noon, sunset, night) at size 104
//   fish_shapes.png    8 shape marks (several mark colours) on the 4 moods
//   fish_spots.png     spots 1–12 on the 4 moods + a count-highlight row
//   fish_text.png      letters / numbers / sums (odd cells face LEFT: glyphs must still read correctly)
//   fish_bubbles.png   the 13 guest animals in bubbles on the 4 moods
//   fish_opts.png      big / little, wriggle phases, glow, blink, mouth 'o', tail wag phases, night (morning + night halves)
//   fish_<set>_3x.png  the same sets at 3× (size 312), each cell on a different mood
//   fish_lake_<mood>.png  1556×720: water, rod bends + line + hook + float, lilies opening, splash phases, ripples,
//                      air bubbles, swimming fish, home badges, Talk icons, hint hand, sparkles
// Also prints the colour-dominance check (share of a colour fish's visible pixels in its answer-colour family, ≥ 50 %)
// and the bitmap-cache stats.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs/art');
const JS = ['content.js', 'assets.js', 'fish_art.js'].map(f => fs.readFileSync(path.join(ROOT, 'game/js', f), 'utf8'));
const GDIR = path.join(ROOT, 'game/assets/default/guests');

function pageSheet({ name }) {
  const A = window.TL.FishArt;
  const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  const MOODS = ['morning', 'noon', 'sunset', 'night'];
  const SZ = 104;
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  function size(w, h) { cv.width = w; cv.height = h; g.fillStyle = '#F4EFE6'; g.fillRect(0, 0, w, h); }
  function band(x, y, w, h, mood) {
    const M = A.MOODS[mood], gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, M.top); gr.addColorStop(1, M.deep);
    g.fillStyle = gr; g.fillRect(x, y, w, h);
  }
  function label(t, x, y, s, col) { g.save(); g.font = '700 ' + (s || 12) + 'px system-ui, sans-serif'; g.fillStyle = col || '#FFFFFF'; g.textAlign = 'center'; g.fillText(t, x, y); g.restore(); }
  function fish(t, x, y, sz, opt, face) {
    g.save(); g.translate(x, y); if (face < 0) g.scale(-1, 1);
    A.drawThing(g, t, sz, opt || {}); g.restore();
  }
  const ink = m => m === 'night' ? '#E8EEF8' : '#1E3A40';
  const lab = t => t.kind === 'bubble' ? t.animal : !t.mark ? (t.color || 'pearl') + (t.big === false ? ' little' : '')
    : t.mark.shape ? t.mark.color + ' ' + t.mark.shape : t.mark.n != null ? t.mark.n + ' spots' : '"' + t.mark.text + '"';
  const TEXTS = ['A', 'B', 'b', 'd', 'M', 'W', 'Q', 'g', '3', '12', '20', '3+2', '7−4', '10+5', '12−5', '9'];
  const sets = {
    colors: () => COLORS.map(c => ({ kind: 'fish', color: c })).concat(COLORS.map(c => ({ kind: 'fish', color: c, _face: -1 }))),
    shapes: () => A.SHAPES.map((s, i) => ({ kind: 'fish', mark: { shape: s, color: ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink', 'red'][i] } }))
      .concat(A.SHAPES.map(s => ({ kind: 'fish', mark: { shape: s, color: 'blue' } }))),
    spots: () => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => ({ kind: 'fish', mark: { n } })),
    text: () => TEXTS.map((text, i) => ({ kind: 'fish', mark: { text }, _face: i % 2 ? -1 : 1 })),
    bubbles: () => A.ANIMALS.map(a => ({ kind: 'bubble', animal: a }))
  };
  const base = name.replace(/_3x$/, '');
  if (sets[base] && !/_3x$/.test(name)) {
    const list = sets[base](), cols = Math.min(list.length, 8), cw = 176, rh = 168, rows = Math.ceil(list.length / cols);
    size(cw * cols, rh * rows * 4);
    MOODS.forEach((m, mi) => {
      const oy = mi * rh * rows;
      band(0, oy, cv.width, rh * rows, m);
      list.forEach((t, i) => {
        const x = cw * (i % cols) + cw / 2, y = oy + rh * Math.floor(i / cols) + 76;
        fish(t, x, y, SZ, { t: 0.15 * i, wag: 0.4, night: m === 'night' ? 1 : 0 }, t._face || 1);
        label(lab(t) + (t._face < 0 ? ' ←' : ''), x, y + 80, 11, ink(m));
      });
      label(m, 34, oy + 14, 12, ink(m));
    });
    if (base === 'spots') {   // count highlight row
      const old = g.getImageData(0, 0, cv.width, cv.height), H0 = cv.height;
      cv.height = H0 + rh; g.putImageData(old, 0, 0);
      band(0, H0, cv.width, rh, 'noon');
      [[3, 1], [3, 3], [5, 2], [7, 4], [10, 6], [12, 12], [4, 2], [6, 5]].forEach((q, i) => {
        const x = cw * i + cw / 2, y = H0 + 76;
        fish({ kind: 'fish', mark: { n: q[0] } }, x, y, SZ, { count: q[1], wriggle: i === 6 ? 0.8 : 0, t: 0.3 }, i === 7 ? -1 : 1);
        label('n ' + q[0] + ' count ' + q[1] + (i === 7 ? ' ←' : ''), x, y + 80, 11, ink('noon'));
      });
    }
  } else if (sets[base]) {
    const list = sets[base]().filter((t, i) => i % (base === 'colors' ? 1 : 2) === 0).slice(0, 8);
    const S = SZ * 3, cw = 560, rh = 470, cols = 4, rows = Math.ceil(list.length / cols);
    size(cw * cols, rh * rows);
    list.forEach((t, i) => {
      const m = MOODS[i % 4], x0 = cw * (i % cols), y0 = rh * Math.floor(i / cols);
      band(x0, y0, cw, rh, m);
      fish(t, x0 + cw / 2, y0 + rh / 2 - 6, S, { t: 0.2, wag: 0.4, night: m === 'night' ? 1 : 0, count: base === 'spots' && i === 3 ? 3 : -1 }, t._face || 1);
      label(lab(t) + ' · ' + m, x0 + cw / 2, y0 + rh - 12, 14, ink(m));
    });
  } else if (name === 'opts') {
    const R = { kind: 'fish', color: 'orange' }, N = { kind: 'fish', mark: { n: 5 } };
    const V = [
      ['big', R, {}], ['little', { kind: 'fish', color: 'orange', big: false }, {}],
      ['wriggle t0', R, { wriggle: 1, t: 0 }], ['wriggle t.1', R, { wriggle: 1, t: 0.1 }], ['wriggle t.2', R, { wriggle: 1, t: 0.2 }],
      ['wriggle spots', N, { wriggle: 1, t: 0.05, count: 3 }],
      ['glow .5', { kind: 'fish', color: 'blue' }, { glow: 0.5 }], ['glow 1', { kind: 'fish', mark: { shape: 'star', color: 'yellow' } }, { glow: 1 }],
      ['blink', { kind: 'fish', color: 'green' }, { blink: 1 }], ["mouth 'o'", { kind: 'fish', color: 'green' }, { mouth: 'o' }],
      ['wag 1 t0', { kind: 'fish', color: 'purple' }, { wag: 1, t: 0 }], ['wag 1 t.08', { kind: 'fish', color: 'purple' }, { wag: 1, t: 0.08 }],
      ['wag 0 idle', { kind: 'fish', color: 'purple' }, { wag: 0, t: 0.3 }], ['little bubble', { kind: 'bubble', animal: 'fox', big: false }, {}],
      ['bubble glow', { kind: 'bubble', animal: 'penguin' }, { glow: 1 }], ['bubble wriggle', { kind: 'bubble', animal: 'crab' }, { wriggle: 1, t: 0.15 }]
    ];
    const cw = 176, rh = 168, cols = 8, rows = Math.ceil(V.length / cols);
    size(cw * cols, rh * rows * 2);
    ['morning', 'night'].forEach((m, half) => {
      band(0, half * rh * rows, cv.width, rh * rows, m);
      V.forEach((v, i) => {
        const x = cw * (i % cols) + cw / 2, y = half * rh * rows + rh * Math.floor(i / cols) + 76;
        fish(v[1], x, y, SZ, Object.assign({ night: m === 'night' ? 1 : 0, t: 0.25, wag: 0.4 }, v[2]), 1);
        label(v[0], x, y + 80, 11, ink(m));
      });
    });
  } else if (/^lake_/.test(name)) {
    const mood = name.slice(5), W = 1556, H = 720, night = mood === 'night';
    size(W, H);
    const SKY = { morning: ['#BFE6F2', '#FBE9C9'], noon: ['#8FD0F0', '#E6F6FA'], sunset: ['#F6B48A', '#FBE3B8'], night: ['#1E2A55', '#3B4C7E'] }[mood];
    const sky = g.createLinearGradient(0, 0, 0, 300); sky.addColorStop(0, SKY[0]); sky.addColorStop(1, SKY[1]);
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const layout = { W, H, surfaceY: 288 }, t = 1.7, amb = { mood, night: night ? 1 : 0 };
    A.drawWater(g, layout, t, amb);
    // lake bed hint
    g.fillStyle = night ? '#3A3F52' : '#D9C79A'; g.fillRect(0, H - 40, W, 40);
    // a rock + rod family (bends −0.4, 0, 0.4, 0.8)
    g.fillStyle = night ? '#5C6676' : '#8E9A86'; g.beginPath(); g.ellipse(120, 300, 110, 60, 0, Math.PI, 0); g.fill();
    const rods = [[-0.4, 70], [0, 160], [0.4, 250], [0.8, 340]];
    rods.forEach(([b, x], i) => {
      const base = { x, y: 250 }, tip = A.drawRod(g, base, 170, -1.05, b);
      const hook = i === 3 ? { x: tip.x + 40, y: 420 } : i === 2 ? { x: tip.x + 10, y: 360 } : { x: tip.x + 4, y: tip.y + 60 };
      if (i === 1) { hook.x = tip.x + 70; hook.y = tip.y + 30; }   // mid-cast: hook flying in the air
      A.drawLine(g, tip, hook, i === 0 ? 10 : i === 3 ? 0 : 4, night ? 1 : 0, layout.surfaceY, 1.2);
      A.drawHook(g, hook.x, hook.y, 1.2, true);
      label('bend ' + b, x + 40, 40 + i * 0, 12, night ? '#fff' : '#333');
    });
    // fish swimming + a hooked one wriggling at the hook of rod 4
    const sw = [[{ kind: 'fish', color: 'red' }, 640, 470, 1], [{ kind: 'fish', color: 'blue' }, 900, 560, -1], [{ kind: 'fish', mark: { n: 4 } }, 1180, 430, 1],
      [{ kind: 'fish', mark: { shape: 'heart', color: 'pink' } }, 1400, 590, -1], [{ kind: 'bubble', animal: 'penguin' }, 820, 400, 1], [{ kind: 'fish', mark: { text: 'b' } }, 1060, 640, -1]];
    sw.forEach(([th, x, y, f], i) => fish(th, x, y, SZ, { t: t + i, wag: 0.6, night: night ? 1 : 0 }, f));
    fish({ kind: 'fish', color: 'yellow' }, 500, 470, SZ, { wriggle: 1, t, night: night ? 1 : 0, mouth: 'o' }, -1);
    // above water: a fish swinging on a line + one leaping
    g.save(); g.translate(560, 170); g.rotate(-0.35); A.drawThing(g, { kind: 'fish', color: 'green' }, SZ, { wriggle: 0.7, t: 0.4, night: night ? 1 : 0 }); g.restore();
    g.save(); g.translate(1460, 170); g.rotate(-0.9); A.drawThing(g, { kind: 'fish', color: 'purple' }, SZ, { wag: 1, t: 0.2, night: night ? 1 : 0 }); g.restore();
    // lilies opening (0, .3, .6, 1, 1.2 overshoot)
    [[-1, null], [0, null], [0.3, 'red'], [0.6, 'blue'], [1, null], [1.2, 'purple']].forEach(([o, c], i) => {
      const x = 960 + i * 104; A.drawLily(g, x, layout.surfaceY + 6, 1, o, c, t + i);
      label('open ' + o + (c ? ' ' + c : ''), x, layout.surfaceY + 40, 11, night ? '#fff' : '#234');
    });
    // splashes at u = 0.1 .. 0.9, ripples, bubbles
    [0.08, 0.25, 0.45, 0.65, 0.85].forEach((u, i) => { A.drawSplash(g, 430 + i * 100, layout.surfaceY + 2, 1, u); label('u ' + u, 430 + i * 100, layout.surfaceY + 40, 10, night ? '#fff' : '#234'); });
    [12, 30, 55, 80].forEach((r, i) => A.drawRipple(g, 1460, layout.surfaceY + 8, r, 1 - i * 0.22));
    for (let i = 0; i < 14; i++) A.drawBubbleDot(g, 700 + i * 50, 600 - (i % 4) * 30, 3 + (i % 4) * 2.5, 0.9);
    A.drawSurfaceFront(g, layout, t, amb);
    // badges + icons + hint hand + sparkles (top band)
    A.HOMES.forEach((h, i) => { g.save(); g.translate(470 + i * 64, 60); A.drawHomeBadge(g, h, 28, {}); g.restore(); });
    const icons = [{ kind: 'color', color: 'red' }, { kind: 'color', color: 'green' }, { kind: 'number', n: 4 }, { kind: 'number', n: 12 }, { kind: 'home', home: 'ice' },
      { kind: 'size', big: true }, { kind: 'size', big: false }, { kind: 'fish', color: 'blue' }, { kind: 'fish', mark: { n: 3 } }, { kind: 'bubble', animal: 'lion' }, { kind: 'letter', text: 'B' }];
    icons.forEach((ic, i) => { const x = 820 + i * 66, y = 60; g.fillStyle = 'rgba(255,255,255,0.88)'; g.fillRect(x - 30, y - 30, 60, 60); g.save(); g.translate(x, y); A.drawIcon(g, ic, 56); g.restore(); });
    A.drawHintHand(g, 1210, 470, 0.4, 1); A.drawHintHand(g, 1300, 470, 1, 0.6, 80);
    [[1000, 170, 12], [1040, 200, 7], [1100, 160, 9]].forEach((s, i) => A.drawSparkle(g, s[0], s[1], s[2], 1, i * 0.4));
    label(mood, 40, 20, 14, night ? '#fff' : '#333');
  }
  return cv.toDataURL('image/png');
}

/* colour dominance: share of a colour fish's visible pixels in its answer family */
function dominance() {
  const A = window.TL.FishArt, out = [];
  const cv = document.createElement('canvas'); cv.width = 200; cv.height = 140;
  const g = cv.getContext('2d');
  const hex = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'].forEach(c => {
    const p = A.pal(c), base = hex(p.base), dark = hex(p.dark), light = hex(p.light);
    const fam = [base, dark, light, mix(base, dark, 0.32), mix(base, dark, 0.5), mix(light, [255, 255, 255], 0.5), mix(base, light, 0.5)];
    g.clearRect(0, 0, 200, 140); g.save(); g.translate(104, 70); A.drawThing(g, { kind: 'fish', color: c }, 104, { t: 0 }); g.restore();
    const d = g.getImageData(0, 0, 200, 140).data; let vis = 0, inF = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 200) continue;
      vis++;
      const px = [d[i], d[i + 1], d[i + 2]];
      if (fam.some(f => Math.abs(f[0] - px[0]) + Math.abs(f[1] - px[1]) + Math.abs(f[2] - px[2]) < 60)) inF++;
    }
    out.push([c, Math.round(100 * inF / vis)]);
  });
  return out;
}

async function setupGuests(page) {
  if (!fs.existsSync(GDIR)) return 0;
  const files = fs.readdirSync(GDIR).filter(f => /\.svg$/.test(f));
  const map = {};
  files.forEach(f => { map['guests/' + f.replace(/\.svg$/, '')] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(GDIR, f)).toString('base64'); });
  return page.evaluate(async (m) => {
    const A = window.TL.Assets, n = [];
    await Promise.all(Object.keys(m).map(k => new Promise(res => { const i = new Image(); i.onload = () => { A.images[k] = i; n.push(k); res(); }; i.onerror = () => res(); i.src = m[k]; })));
    return n.length;
  }, map);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const sets = ['colors', 'shapes', 'spots', 'text', 'bubbles'];
  const all = sets.concat(['opts'], sets.map(s => s + '_3x'), ['lake_morning', 'lake_noon', 'lake_sunset', 'lake_night']);
  const names = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.setContent('<!doctype html><html><body></body></html>');
  for (const src of JS) await page.addScriptTag({ content: src });
  console.log('guest images loaded:', await setupGuests(page));
  for (const name of (names.length ? names : all)) {
    const url = await page.evaluate(pageSheet, { name });
    const file = path.join(OUT, 'fish_' + name + '.png');
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', path.relative(ROOT, file));
  }
  const dom = await page.evaluate(dominance);
  console.log('colour dominance:', dom.map(d => d.join(' ') + '%').join(', '), dom.some(d => d[1] < 50) ? '  BELOW 50%!' : '');
  console.log('bitmap cache:', JSON.stringify(await page.evaluate(() => window.TL.FishArt.stats())));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
