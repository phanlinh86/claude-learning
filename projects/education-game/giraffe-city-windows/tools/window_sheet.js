#!/usr/bin/env node
// Contact sheets for GW.WindowArt (character artist B) → docs/art/*.png
// Run from the game folder:  node tools/window_sheet.js
// Renders: shutter swing per colour, every face kind (120 px and 3×), things × colours, lit/bloom/glow/rain states,
// 6 buildings with a 3×2 window grid, bunting + balloons. Animal/home sprites come from game/assets/default/items/
// (animal_*.svg / home_*.svg) when present, otherwise a labelled placeholder circle.
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
    if (!/^(animal|home)_.*\.svg$/.test(f)) continue;
    out[f.replace(/\.svg$/, '')] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(ITEMS, f)).toString('base64');
  }
  return out;
}

// --------------------------------------------------------------- in-page drawing (serialised into the page)
function pageMain(SPR) {
  const WA = window.GW.WindowArt;
  const imgs = {};
  const loads = Object.keys(SPR).map(k => new Promise(res => { const im = new Image(); im.onload = () => { imgs[k] = im; res(); }; im.onerror = res; im.src = SPR[k]; }));
  function sprite(ctx) {
    return function (name, x, y, size) {
      const im = imgs[name];
      if (im) { ctx.drawImage(im, x - size / 2, y - size / 2, size, size); return; }
      ctx.beginPath(); ctx.arc(x, y, size * 0.4, 0, Math.PI * 2); ctx.fillStyle = name.indexOf('home') === 0 ? '#C9B79C' : '#E9C9A0'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#8A6A4A'; ctx.stroke();
      ctx.fillStyle = '#5A4030'; ctx.font = '700 ' + Math.round(size * 0.16) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(name.replace(/^(animal|home)_/, ''), x, y);
    };
  }
  function sheet(W, H, dpr, bg) {
    const cv = document.createElement('canvas'); cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = bg || '#EDE4D6'; ctx.fillRect(0, 0, W, H);
    return { cv, ctx };
  }
  function label(ctx, t, x, y) { ctx.fillStyle = '#5A4A40'; ctx.font = '600 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(t, x, y); }
  function wall(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
  const facades = Object.keys(WA.FACADES), shutters = Object.keys(WA.SHUTTERS);
  const out = {};

  return Promise.all(loads).then(() => {
    // 1. swing per shutter colour
    {
      const opens = [0, 0.25, 0.5, 0.8, 1, 1.12], cw = 150, chh = cw / 0.78, gx = 210, gy = 250;
      const { cv, ctx } = sheet(60 + gx * opens.length, 40 + gy * shutters.length, 2);
      shutters.forEach((sh, r) => {
        wall(ctx, 0, 20 + r * gy, cv.width, gy, WA.FACADES[facades[r]]);
        opens.forEach((o, i) => {
          ctx.save(); ctx.translate(60 + gx * i + gx / 2 - 30, 30 + r * gy + gy / 2 - 10);
          WA.drawWindow(ctx, cw, chh, { kind: 'color', value: 'red', color: 'red', obj: 'umbrella' }, o, { shutter: sh, sprite: sprite(ctx) });
          ctx.restore();
          label(ctx, sh + ' open ' + o, 60 + gx * i + gx / 2 - 30, 30 + r * gy + gy - 12);
        });
      });
      out.windows_swing = cv.toDataURL('image/png');
    }
    // 2. every face kind, 120 px wide
    const faces = [
      { kind: 'color', value: 'blue', color: 'blue', obj: 'balloon' },
      { kind: 'color', value: 'green', color: 'green', obj: 'car' },
      { kind: 'color', value: 'yellow', color: 'yellow', obj: 'kite' },
      { kind: 'color', value: 'purple', color: 'purple', obj: 'cup' },
      { kind: 'color', value: 'orange', color: 'orange', obj: 'boot' },
      { kind: 'color', value: 'red', color: 'red', obj: 'umbrella' },
      { kind: 'shape', value: 'circle', shape: 'circle', color: 'red' },
      { kind: 'shape', value: 'square', shape: 'square', color: 'blue' },
      { kind: 'shape', value: 'triangle', shape: 'triangle', color: 'green' },
      { kind: 'shape', value: 'star', shape: 'star', color: 'yellow' },
      { kind: 'shape', value: 'heart', shape: 'heart', color: 'pink' },
      { kind: 'shape', value: 'rect', shape: 'rect', color: 'purple' },
      { kind: 'dots', value: 1, n: 1 }, { kind: 'dots', value: 2, n: 2 }, { kind: 'dots', value: 3, n: 3 }, { kind: 'dots', value: 4, n: 4 },
      { kind: 'dots', value: 5, n: 5 }, { kind: 'dots', value: 6, n: 6 }, { kind: 'dots', value: 10, n: 10 }, { kind: 'dots', value: 12, n: 12 },
      { kind: 'number', value: 3, n: 3, text: '3' }, { kind: 'number', value: 12, n: 12, text: '12' },
      { kind: 'letter', value: 'A', text: 'A' }, { kind: 'letter', value: 'g', text: 'g' }, { kind: 'letter', value: 'Đ', text: 'Đ' },
      { kind: 'text', value: '7 + 8', text: '7 + 8' }, { kind: 'text', value: '12 − 5', text: '12 − 5' },
      { kind: 'number', value: 7, n: 7, text: '7', parity: 'odd' }, { kind: 'dots', value: 4, n: 4, parity: 'even' },
      { kind: 'animal', value: 'dog', sprite: 'animal_dog' }, { kind: 'animal', value: 'dog', sprite: 'animal_dog', scale: 0.6 },
      { kind: 'home', value: 'kennel', sprite: 'home_kennel', animal: 'dog' },
      { kind: 'animal', value: 'bird', sprite: 'animal_bird' }, { kind: 'home', value: 'nest', sprite: 'home_nest' },
      { kind: 'animal', value: 'fish', sprite: 'animal_fish' }, { kind: 'home', value: 'web', sprite: 'home_web' }
    ];
    function faceSheet(dpr, key, cols) {
      const cw = 120, chh = cw / 0.78, gx = 150, gy = 200, rows = Math.ceil(faces.length / cols);
      const { cv, ctx } = sheet(20 + gx * cols, 20 + gy * rows, dpr, WA.FACADES.cream);
      faces.forEach((f, i) => {
        const x = 20 + gx * (i % cols) + gx / 2 - 10, y = 20 + gy * Math.floor(i / cols) + gy / 2 - 16;
        ctx.save(); ctx.translate(x, y);
        WA.drawWindow(ctx, cw, chh, f, 1, { shutter: 'slate', sprite: sprite(ctx) });
        ctx.restore();
        label(ctx, f.kind + ' ' + (f.obj || f.shape || f.text || f.value) + (f.parity ? ' ' + f.parity : '') + (f.scale ? ' ×' + f.scale : ''), x, y + gy / 2 + 10);
      });
      out[key] = cv.toDataURL('image/png');
    }
    faceSheet(1, 'faces_120', 9);
    faceSheet(3, 'faces_3x', 6);
    // 3. things × colours at 80 px
    {
      const cols = Object.keys(WA.COLORS), g = 100;
      const { cv, ctx } = sheet(40 + g * cols.length, 20 + g * WA.THINGS.length, 2, '#FFF6E2');
      WA.THINGS.forEach((t, r) => cols.forEach((c, i) => {
        ctx.save(); ctx.translate(40 + g * i + g / 2, 20 + g * r + g / 2); WA.drawThing(ctx, t, c, 80); ctx.restore();
      }));
      out.things = cv.toDataURL('image/png');
    }
    // 4. states: lit + bloom sequence, glow, rain, bounce/wiggle, drawFace tiles
    {
      const cw = 140, chh = cw / 0.78, gx = 190, gy = 250;
      const blooms = [0, 0.2, 0.45, 0.7, 1, 1.2];
      const { cv, ctx } = sheet(20 + gx * 6, 20 + gy * 3, 2, WA.FACADES.sage);
      const f = { kind: 'color', value: 'blue', color: 'blue', obj: 'kite' };
      blooms.forEach((b, i) => {
        ctx.save(); ctx.translate(20 + gx * i + gx / 2 - 10, 20 + gy / 2 - 14);
        WA.drawWindow(ctx, cw, chh, f, 1, { shutter: 'olive', light: Math.min(1, b * 1.3), bloom: b, bloomColor: i % 2 ? 'mixed' : 'blue' });
        ctx.restore(); label(ctx, 'light+bloom ' + b, 20 + gx * i + gx / 2 - 10, 20 + gy - 14);
      });
      const row2 = [
        ['glow 1 closed', { kind: 'number', value: 4, n: 4, text: '4' }, 0, { glow: 1 }],
        ['glow .6 crack .3', { kind: 'number', value: 4, n: 4, text: '4' }, 0.3, { glow: 0.6 }],
        ['rain open', { kind: 'dots', value: 3, n: 3 }, 1, { rain: 1, t: 0.4, seed: 3 }],
        ['rain closed', { kind: 'dots', value: 3, n: 3 }, 0, { rain: 1, t: 1.2, seed: 4 }],
        ['bounce 12', { kind: 'shape', value: 'star', shape: 'star', color: 'orange' }, 1, { bounce: 12, light: 1, bloom: 1, bloomColor: 'orange' }],
        ['wiggle .18', { kind: 'letter', value: 'B', text: 'B' }, 1, { wiggle: 0.18 }]
      ];
      row2.forEach((r, i) => {
        ctx.save(); ctx.translate(20 + gx * i + gx / 2 - 10, 20 + gy + gy / 2 - 14);
        WA.drawWindow(ctx, cw, chh, r[1], r[2], Object.assign({ shutter: 'terracotta', sprite: sprite(ctx) }, r[3]));
        ctx.restore(); label(ctx, r[0], 20 + gx * i + gx / 2 - 10, 20 + 2 * gy - 14);
      });
      const tiles = [{ kind: 'home', value: 'nest', sprite: 'home_nest' }, { kind: 'color', value: 'red', color: 'red', obj: 'umbrella' },
        { kind: 'shape', value: 'triangle', shape: 'triangle', color: 'green' }, { kind: 'dots', value: 5, n: 5 },
        { kind: 'number', value: 8, n: 8, text: '8', parity: 'even' }, { kind: 'letter', value: 'M', text: 'M' }];
      tiles.forEach((t, i) => {
        ctx.save(); ctx.translate(20 + gx * i + gx / 2 - 10, 20 + 2 * gy + gy / 2 - 14);
        WA.drawFace(ctx, 140, 140, t, { sprite: sprite(ctx), glow: i === 0 ? 0.8 : 0 });
        ctx.restore(); label(ctx, 'drawFace ' + t.kind, 20 + gx * i + gx / 2 - 10, 20 + 3 * gy - 14);
      });
      out.states = cv.toDataURL('image/png');
    }
    // 5. six buildings with a 3×2 window grid
    {
      const combos = [['brickrose', 'teal', 'gable'], ['cream', 'slateblue', 'flat'], ['sage', 'terracotta', 'arch'],
        ['skygrey', 'olive', 'gable'], ['lilacgrey', 'teal', 'flat'], ['sand', 'slateblue', 'arch']];
      const cw = 120, chh = cw / 0.78, gap = Math.max(18, 0.16 * cw), pad = Math.max(22, 0.22 * cw);
      const gw = 3 * cw + 2 * gap, gh = 2 * chh + gap, bw = gw + 2 * pad + 150, bh = gh + pad + 170, roofH = 0.32 * cw;
      const cellW = bw + 60, cellH = bh + roofH * 1.5 + 70;
      const { cv, ctx } = sheet(20 + cellW * 3, 20 + cellH * 2, 2, '#BFE0F2');
      const opens = [0, 1, 0.5, 1, 0, 0.25];
      const fs = [{ kind: 'color', value: 'red', color: 'red', obj: 'umbrella' }, { kind: 'color', value: 'blue', color: 'blue', obj: 'car' },
        { kind: 'shape', value: 'heart', shape: 'heart', color: 'pink' }, { kind: 'dots', value: 2, n: 2 },
        { kind: 'animal', value: 'cat', sprite: 'animal_cat' }, { kind: 'number', value: 5, n: 5, text: '5' }];
      combos.forEach((cb, k) => {
        const ox = 20 + cellW * (k % 3) + 30, oy = 20 + cellH * Math.floor(k / 3) + roofH * 1.5 + 20;
        ctx.fillStyle = '#C9C2B8'; ctx.fillRect(ox - 30, oy + bh, cellW, 40);   // pavement
        const rect = { x: ox, y: oy, w: bw, h: bh, roofH };
        const B = { facade: cb[0], shutter: cb[1], roof: cb[2], seed: k + 1 };
        const gx0 = ox + pad + 150, gy0 = oy + pad;
        WA.drawBuilding(ctx, rect, B, { doorX: ox + 75, bands: [gy0 + chh + gap / 2 + 4], light: k === 5 ? 1 : 0 });
        for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
          const i = r * 3 + c;
          ctx.save(); ctx.translate(gx0 + c * (cw + gap) + cw / 2, gy0 + r * (chh + gap) + chh / 2);
          WA.drawWindow(ctx, cw, chh, fs[i], opens[(i + k) % 6], { shutter: cb[1], sprite: sprite(ctx), light: opens[(i + k) % 6] === 1 ? 1 : 0, bloom: opens[(i + k) % 6] === 1 ? 1 : 0, bloomColor: 'mixed', rain: k === 3 ? 0.8 : 0, seed: i, t: 1 });
          ctx.restore();
        }
        label(ctx, cb.join(' · ') + (k === 5 ? ' · light 1' : '') + (k === 3 ? ' · rain' : ''), ox + bw / 2, oy + bh + 28);
      });
      out.buildings = cv.toDataURL('image/png');
    }
    // 6. props: bunting, balloons, stars
    {
      const { cv, ctx } = sheet(1100, 420, 2, '#BFE0F2');
      WA.drawBunting(ctx, 40, 50, 1060, 60, 0);
      WA.drawBunting(ctx, 40, 150, 520, 130, 1.3);
      ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'].forEach((c, i) => {
        ctx.save(); ctx.translate(110 + i * 130, 260); WA.drawBalloon(ctx, c, 70, i * 0.7); ctx.restore();
      });
      ctx.save(); ctx.translate(700, 140); WA.drawStar(ctx, 80, '3'); ctx.restore();
      ctx.save(); ctx.translate(820, 140); WA.drawStar(ctx, 80); ctx.restore();
      out.props = cv.toDataURL('image/png');
    }
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
  await page.addScriptTag({ path: path.join(ROOT, 'game', 'js', 'window_art.js') });
  const spr = sprites();
  const out = await page.evaluate('(' + pageMain.toString() + ')(' + JSON.stringify(spr) + ')');
  for (const k of Object.keys(out)) {
    const file = path.join(OUT, 'window_' + k + '.png');
    fs.writeFileSync(file, Buffer.from(out[k].split(',')[1], 'base64'));
    console.log('wrote', path.relative(ROOT, file));
  }
  console.log('sprites loaded:', Object.keys(spr).length, Object.keys(spr).filter(k => /animal_(dog|cat|bird|fish|bee|rabbit|duck|hen|spider)|home_/.test(k)).join(' '));
  if (errors.length) { console.error('page errors:\n' + errors.join('\n')); process.exitCode = 1; }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
