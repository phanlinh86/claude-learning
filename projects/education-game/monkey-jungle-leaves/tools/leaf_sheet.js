#!/usr/bin/env node
// Contact sheets for LL.LeafArt (character artist B) → docs/art/leaf_*.png
// Run from the game folder:  node tools/leaf_sheet.js
// Renders: the flip sequence per leaf colour, every face kind on the underside (120 px and 3×), things × colours at 70 px,
// lit / bloom / hint glow / night states + drawFace tiles + butterflies + garland + star, and 3 composed trees with 2–4 rows of
// hanging leaves at 1556×720 and 720×1556. Animal/food sprites come from game/assets/default/items/ (animal_*.svg /
// food_*.svg) when present, otherwise a placeholder circle with the name.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'art');
const ITEMS = path.join(ROOT, 'game', 'assets', 'default', 'items');

function sprites() {
  const out = {};
  if (!fs.existsSync(ITEMS)) return out;
  for (const f of fs.readdirSync(ITEMS)) {
    if (!/^(animal|food)_.*\.svg$/.test(f)) continue;
    out[f.replace(/\.svg$/, '')] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(ITEMS, f)).toString('base64');
  }
  return out;
}

// --------------------------------------------------------------- in-page drawing (serialised into the page)
function pageMain(SPR) {
  const LA = window.LL.LeafArt;
  const imgs = {};
  const loads = Object.keys(SPR).map(k => new Promise(res => { const im = new Image(); im.onload = () => { imgs[k] = im; res(); }; im.onerror = res; im.src = SPR[k]; }));
  function sprite(ctx) {
    return function (name, x, y, size) {
      const im = imgs[name];
      if (im) { ctx.drawImage(im, x - size / 2, y - size / 2, size, size); return; }
      ctx.beginPath(); ctx.arc(x, y, size * 0.4, 0, Math.PI * 2); ctx.fillStyle = name.indexOf('food') === 0 ? '#F2C08A' : '#C9B79C'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#FFFFFF'; ctx.stroke(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#8A6A4A'; ctx.stroke();
      ctx.fillStyle = '#5A4030'; ctx.font = '700 ' + Math.round(size * 0.15) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(name.replace(/^(animal|food)_/, ''), x, y);
    };
  }
  function sheet(W, H, dpr, bg) {
    const cv = document.createElement('canvas'); cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (bg === 'jungle') jungleBg(ctx, W, H, 0); else { ctx.fillStyle = bg || '#2F6B4A'; ctx.fillRect(0, 0, W, H); }
    return { cv, ctx };
  }
  function jungleBg(ctx, W, H, night, groundY) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (night) { g.addColorStop(0, '#1E2A4A'); g.addColorStop(1, '#3A4F7A'); }
    else { g.addColorStop(0, '#CDE7D2'); g.addColorStop(0.5, '#8FC49A'); g.addColorStop(1, '#5E9C6E'); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // misty far trees
    ctx.fillStyle = night ? 'rgba(40,64,90,0.7)' : 'rgba(120,170,130,0.55)';
    for (let x = -40; x < W + 80; x += 170) { ctx.beginPath(); ctx.ellipse(x, H * 0.45, 110, H * 0.32, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = night ? 'rgba(30,52,70,0.8)' : 'rgba(86,140,98,0.6)';
    for (let x = 30; x < W + 80; x += 140) { ctx.beginPath(); ctx.ellipse(x, H * 0.75, 90, H * 0.22, 0, 0, Math.PI * 2); ctx.fill(); }
    if (groundY) {
      ctx.fillStyle = night ? '#2D4636' : '#6E8F4A'; ctx.fillRect(0, groundY, W, H - groundY);
      ctx.fillStyle = night ? '#3B5A40' : '#86A85A'; ctx.fillRect(0, groundY, W, 10);
    }
  }
  function label(ctx, t, x, y, c) { ctx.fillStyle = c || '#F4F8E8'; ctx.font = '600 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(t, x, y); }
  const out = {};
  const leafKeys = Object.keys(LA.LEAVES);

  return Promise.all(loads).then(() => {
    // 1. flip sequence per leaf colour (+ a stem)
    {
      const opens = [0, 0.25, 0.4, 0.5, 0.6, 0.75, 1, 1.12], cw = 150, chh = cw / 0.78, gx = 190, gy = 290;
      const { cv, ctx } = sheet(40 + gx * opens.length, 20 + gy * leafKeys.length, 2, 'jungle');
      const f = { kind: 'color', value: 'red', color: 'red', obj: 'butterfly' };
      leafKeys.forEach((lk, r) => opens.forEach((o, i) => {
        const x = 40 + gx * i + gx / 2 - 20, y = 20 + r * gy + gy / 2 + 10;
        ctx.save(); ctx.translate(x, y);
        LA.drawLeaf(ctx, cw, chh, f, o, { leaf: lk, stem: 36, sprite: sprite(ctx) });
        ctx.restore();
        label(ctx, lk + ' open ' + o, x, 20 + r * gy + gy - 8, '#173A24');
      }));
      out.flip = cv.toDataURL('image/png');
    }
    // 2. every face kind on the underside
    const faces = [
      ...['butterfly', 'balloon', 'flower', 'kite', 'cup', 'boot'].map((o, i) => ({ kind: 'color', value: ['red', 'blue', 'yellow', 'green', 'orange', 'purple'][i], color: ['red', 'blue', 'yellow', 'green', 'orange', 'purple'][i], obj: o })),
      { kind: 'color', value: 'pink', color: 'pink', obj: 'flower' }, { kind: 'color', value: 'green', color: 'green', obj: 'butterfly' },
      ...['circle', 'square', 'triangle', 'star', 'heart', 'rect'].map((s, i) => ({ kind: 'shape', value: s, shape: s, color: ['red', 'blue', 'green', 'yellow', 'pink', 'purple'][i] })),
      ...[1, 2, 3, 4, 5, 6, 10].map(n => ({ kind: 'dots', value: n, n })),
      { kind: 'number', value: 3, n: 3, text: '3' }, { kind: 'number', value: 12, n: 12, text: '12' },
      { kind: 'letter', value: 'A', text: 'A' }, { kind: 'letter', value: 'g', text: 'g' }, { kind: 'letter', value: 'Đ', text: 'Đ' },
      { kind: 'text', value: '7 + 8', text: '7 + 8' }, { kind: 'text', value: '12 − 5', text: '12 − 5' },
      { kind: 'number', value: 7, n: 7, text: '7', parity: 'odd' }, { kind: 'dots', value: 4, n: 4, parity: 'even' },
      { kind: 'animal', value: 'panda', sprite: 'animal_panda' }, { kind: 'food', value: 'bamboo', sprite: 'food_bamboo', animal: 'panda' },
      { kind: 'animal', value: 'bee', sprite: 'animal_bee', scale: 0.6 }, { kind: 'food', value: 'honey' }
    ];
    function faceSheet(dpr, key, cols, cw) {
      const chh = cw / 0.78, gx = cw * 1.25, gy = chh * 1.32, rows = Math.ceil(faces.length / cols);
      const { cv, ctx } = sheet(20 + gx * cols, 20 + gy * rows, dpr, '#2F6B4A');
      faces.forEach((f, i) => {
        const x = 20 + gx * (i % cols) + gx / 2 - 10, y = 20 + gy * Math.floor(i / cols) + gy / 2 - 8;
        ctx.save(); ctx.translate(x, y);
        LA.drawLeaf(ctx, cw, chh, f, 1, { leaf: 'jungle', stem: 14, sprite: sprite(ctx) });
        ctx.restore();
        label(ctx, f.kind + ' ' + (f.obj || f.shape || f.text || f.value) + (f.parity ? ' ' + f.parity : '') + (f.scale ? ' ×' + f.scale : ''), x, y + gy / 2 + 4);
      });
      out[key] = cv.toDataURL('image/png');
    }
    faceSheet(1, 'faces_120', 9, 120);
    faceSheet(3, 'faces_3x', 6, 150);
    // 3. things × colours at 70 px on the underside colour
    {
      const cols = Object.keys(LA.COLORS), g = 90;
      const { cv, ctx } = sheet(40 + g * cols.length, 20 + g * LA.THINGS.length, 2, LA.UNDER.fill);
      LA.THINGS.forEach((t, r) => cols.forEach((c, i) => {
        ctx.save(); ctx.translate(40 + g * i + g / 2, 20 + g * r + g / 2); LA.drawThing(ctx, t, c, 70); ctx.restore();
      }));
      out.things = cv.toDataURL('image/png');
    }
    // 4. states
    {
      const cw = 150, chh = cw / 0.78, gx = 200, gy = 290;
      const { cv, ctx } = sheet(20 + gx * 6, 20 + gy * 4, 2, 'jungle');
      const f = { kind: 'color', value: 'blue', color: 'blue', obj: 'kite' };
      [0, 0.2, 0.45, 0.7, 1, 1.2].forEach((b, i) => {
        const x = 20 + gx * i + gx / 2 - 10, y = 20 + gy / 2 + 12;
        ctx.save(); ctx.translate(x, y);
        LA.drawLeaf(ctx, cw, chh, f, 1, { leaf: 'teal', stem: 40, light: Math.min(1, b * 1.3), bloom: b, flower: ['lilac', 'white', 'blush'][i % 3] });
        ctx.restore(); label(ctx, 'light+bloom ' + b, x, 20 + gy - 8, '#173A24');
      });
      const row2 = [
        ['hint glow 1 closed', { kind: 'number', value: 4, n: 4, text: '4' }, 0, { glow: 1 }],
        ['hint glow .6 open .3', { kind: 'number', value: 4, n: 4, text: '4' }, 0.3, { glow: 0.6 }],
        ['bounce 12 lit', { kind: 'shape', value: 'star', shape: 'star', color: 'orange' }, 1, { bounce: 12, light: 1, bloom: 1 }],
        ['wiggle .18', { kind: 'letter', value: 'B', text: 'B' }, 1, { wiggle: 0.18 }],
        ['lime closed', null, 0, { leaf: 'lime' }],
        ['fern closed', null, 0, { leaf: 'fern' }]
      ];
      row2.forEach((r, i) => {
        const x = 20 + gx * i + gx / 2 - 10, y = 20 + gy + gy / 2 + 12;
        ctx.save(); ctx.translate(x, y);
        LA.drawLeaf(ctx, cw, chh, r[1], r[2], Object.assign({ leaf: 'jungle', stem: 40, sprite: sprite(ctx) }, r[3]));
        ctx.restore(); label(ctx, r[0], x, 20 + 2 * gy - 8, '#173A24');
      });
      // night row on a night sky
      jungleBg(ctx, 0, 0, 1);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 20 + 2 * gy, cv.width, gy); ctx.clip();
      const ng = ctx.createLinearGradient(0, 20 + 2 * gy, 0, 20 + 3 * gy); ng.addColorStop(0, '#1E2A4A'); ng.addColorStop(1, '#3A4F7A');
      ctx.fillStyle = ng; ctx.fillRect(0, 20 + 2 * gy, cv.width, gy); ctx.restore();
      [[0, {}], [0.5, {}], [1, {}], [1, { light: 1, bloom: 1 }], [0, { glow: 1 }], [1, { leaf: 'teal' }]].forEach((r, i) => {
        const x = 20 + gx * i + gx / 2 - 10, y = 20 + 2 * gy + gy / 2 + 12;
        ctx.save(); ctx.translate(x, y);
        LA.drawLeaf(ctx, cw, chh, { kind: 'animal', value: 'panda', sprite: 'animal_panda' }, r[0], Object.assign({ leaf: 'jungle', stem: 40, night: 1, sprite: sprite(ctx) }, r[1]));
        ctx.restore(); label(ctx, 'night open ' + r[0] + ' ' + Object.keys(r[1]).join('+'), x, 20 + 3 * gy - 8);
      });
      // drawFace tiles + butterflies + star
      const tiles = [{ kind: 'food', value: 'bamboo', sprite: 'food_bamboo' }, { kind: 'color', value: 'red', color: 'red', obj: 'butterfly' },
        { kind: 'shape', value: 'triangle', shape: 'triangle', color: 'green' }, { kind: 'number', value: 8, n: 8, text: '8', parity: 'even' }];
      tiles.forEach((t, i) => {
        const x = 20 + gx * i + gx / 2 - 10, y = 20 + 3 * gy + gy / 2 - 10;
        ctx.save(); ctx.translate(x, y);
        LA.drawFace(ctx, 140, 140, t, { sprite: sprite(ctx), glow: i === 0 ? 0.8 : 0 });
        ctx.restore(); label(ctx, 'drawFace ' + t.kind, x, 20 + 4 * gy - 8, '#173A24');
      });
      ['purple', 'orange', '#5FC7C9'].forEach((c, i) => {
        ctx.save(); ctx.translate(20 + gx * 4 + 40 + i * 50, 20 + 3 * gy + 80 + (i % 2) * 40); LA.drawButterfly(ctx, c, 60, i * 0.9); ctx.restore();
      });
      ctx.save(); ctx.translate(20 + gx * 5 + 90, 20 + 3 * gy + 200); LA.drawStar(ctx, 70, '3'); ctx.restore();
      LA.drawGarland(ctx, 20 + gx * 4, 20 + 3 * gy + 180, 20 + gx * 5 + 40, 20 + 3 * gy + 170, 0.6);
      out.states = cv.toDataURL('image/png');
    }
    // 5. composed trees
    const FS = [
      { kind: 'color', value: 'red', color: 'red', obj: 'butterfly' }, { kind: 'color', value: 'blue', color: 'blue', obj: 'balloon' },
      { kind: 'shape', value: 'heart', shape: 'heart', color: 'pink' }, { kind: 'dots', value: 3, n: 3 },
      { kind: 'animal', value: 'panda', sprite: 'animal_panda' }, { kind: 'food', value: 'bamboo', sprite: 'food_bamboo' },
      { kind: 'number', value: 5, n: 5, text: '5' }, { kind: 'letter', value: 'M', text: 'M' }
    ];
    function scene(W, H, cols, rows, cw, tree, night, states) {
      const { cv, ctx } = sheet(W, H, 1, '#000');
      const groundY = H - 90;
      jungleBg(ctx, W, H, night, groundY);
      const chh = cw / 0.78, gapx = Math.max(18, 0.16 * cw), gapy = Math.max(30, 0.26 * cw), pad = Math.max(26, 0.24 * cw);
      const gw = cols * cw + (cols - 1) * gapx, gh = rows * chh + (rows - 1) * gapy;
      const gx0 = W > H ? Math.round(W * 0.56 - gw / 2) : Math.round((W - gw) / 2), gy0 = Math.round(Math.max(W > H ? 120 : 260, groundY - 60 - gh - (W > H ? 0 : 160)));
      const rect = { x: gx0 - pad, y: gy0 - pad, w: gw + 2 * pad, h: groundY + 4 - (gy0 - pad), roofH: 0.34 * cw, pad, door: null, rows: [] };
      for (let r = 0; r < rows; r++) {
        const top = gy0 + r * (chh + gapy);
        rect.rows.push({ y: top - 0.62 * gapy, x0: rect.x + 0.4 * pad, x1: rect.x + rect.w - 0.4 * pad });
      }
      LA.drawTree(ctx, rect, tree, { t: 0.8, night: night ? 1 : 0 });
      let i = 0;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++, i++) {
        const cx = gx0 + c * (cw + gapx) + cw / 2, cy = gy0 + r * (chh + gapy) + chh / 2;
        const py = LA.vineY(rect.rows[r], cx, 0.8, r, 1.5), stem = cy - chh / 2 - py;
        const st = states[i % states.length];
        ctx.save(); ctx.translate(cx, py); ctx.rotate(st.swing || 0); ctx.translate(0, stem + chh / 2);
        LA.drawLeaf(ctx, cw, chh, FS[i % FS.length], st.open, { leaf: tree.leaf, stem, light: st.light || 0, bloom: st.bloom || 0, flower: tree.flower, glow: st.glow || 0, night: night ? 1 : 0, sprite: sprite(ctx) });
        ctx.restore();
      }
      // Lolo placeholder on her log
      ctx.fillStyle = 'rgba(154,106,69,0.85)'; ctx.beginPath(); ctx.ellipse(W > H ? 110 : 100, groundY - 50, 50, 70, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7E5534'; ctx.fillRect((W > H ? 110 : 100) - 80, groundY + 2, 160, 30);
      return cv.toDataURL('image/png');
    }
    const S1 = [{ open: 0 }, { open: 1, light: 1, bloom: 1 }, { open: 0, swing: 0.08 }, { open: 0.45, swing: -0.1 }, { open: 1 }, { open: 0 }, { open: 1, light: 1, bloom: 1 }, { open: 0, glow: 1 }];
    const trees = [
      ['kapok', { bark: 'brown', leaf: 'jungle', kind: 'kapok', flower: 'lilac', seed: 3 }, 0],
      ['fig', { bark: 'grey', leaf: 'teal', kind: 'fig', flower: 'blush', seed: 8 }, 0],
      ['palm_night', { bark: 'red', leaf: 'lime', kind: 'palm', flower: 'white', seed: 5 }, 1]
    ];
    const land = [[4, 2, 150], [4, 3, 112], [3, 2, 160]], port = [[3, 3, 170], [3, 4, 160], [2, 3, 190]];
    trees.forEach((tr, k) => {
      out['tree_' + tr[0] + '_land'] = scene(1556, 720, land[k][0], land[k][1], land[k][2], tr[1], tr[2], S1);
      out['tree_' + tr[0] + '_port'] = scene(720, 1556, port[k][0], port[k][1], port[k][2], tr[1], tr[2], S1);
    });
    return out;
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.setContent('<!doctype html><html><body style="margin:0"></body></html>');
  await page.addScriptTag({ path: path.join(ROOT, 'game', 'js', 'leaf_art.js') });
  const spr = sprites();
  const t0 = Date.now();
  const out = await page.evaluate('(' + pageMain.toString() + ')(' + JSON.stringify(spr) + ')');
  for (const k of Object.keys(out)) {
    const file = path.join(OUT, 'leaf_' + k + '.png');
    fs.writeFileSync(file, Buffer.from(out[k].split(',')[1], 'base64'));
    console.log('wrote', path.relative(ROOT, file));
  }
  // perf probe: 12 leaves per frame (mixed states) at dpr 3, warm cache
  const perf = await page.evaluate(() => {
    const LA = window.LL.LeafArt, cv = document.createElement('canvas'); cv.width = 1170; cv.height = 2532;
    const ctx = cv.getContext('2d'); ctx.setTransform(3, 0, 0, 3, 0, 0);
    const f = { kind: 'color', value: 'red', color: 'red', obj: 'cup' };
    function frame(t) {
      ctx.clearRect(0, 0, 390, 844);
      for (let i = 0; i < 12; i++) {
        ctx.save(); ctx.translate(60 + (i % 3) * 130, 120 + Math.floor(i / 3) * 180); ctx.rotate(Math.sin(t + i) * 0.1);
        LA.drawLeaf(ctx, 110, 141, f, (t * 0.7 + i * 0.13) % 1.12, { stem: 30, light: i % 4 === 0 ? 1 : 0, bloom: i % 4 === 0 ? 1 : 0, night: 0 });
        ctx.restore();
      }
    }
    for (let k = 0; k < 20; k++) frame(k * 0.05);
    const t0 = performance.now(); for (let k = 0; k < 120; k++) frame(k * 0.016); return (performance.now() - t0) / 120;
  });
  console.log('perf: 12 leaves/frame @dpr3 ≈', perf.toFixed(2), 'ms (desktop chromium); sheets in', Date.now() - t0, 'ms');
  console.log('sprites loaded:', Object.keys(spr).length);
  if (errors.length) { console.error('page errors:\n' + errors.join('\n')); process.exitCode = 1; }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
