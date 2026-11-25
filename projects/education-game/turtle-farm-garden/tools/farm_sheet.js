#!/usr/bin/env node
// Tumi's Flower Farm — contact sheets for FT.FarmArt (character artist B).
// Run from the game folder root:   node tools/farm_sheet.js
//   → docs/art/farm_signs.png     every sign (round, 8 shapes, 10 animals, 8 homes, glyphs) at 116 px on the meadow + states
//   → docs/art/farm_bed.png       garden beds (600 × 400 picture, s = 1): patches at 340 px, shape patches, the numeral sign,
//                                 animal + home, rows growing, guide dots, carrots, the pebble path
//   → docs/art/farm_things.png    things on the bed at 360 px: every shape patch, every animal + home, glyph signs flat
//   → docs/art/farm_packets.png   seed packets in every colour + states; watering cans in every colour at 3 angles + pouring
//   → docs/art/farm_rows.png      planted rows growing (end = finger), bloom phases, road, carrots grow 0..1, petals, puffs
//   → docs/art/farm_badges.png    fence + rosettes (patch / sign / animal / shape), Talk icons, ghost hand
//   → docs/art/farm_phone_3x.png  iPhone-size beds (s 0.6, DPR 3): guide dots on soil, rows, road
//   → docs/art/farm_zoom.png      animals + homes at 2× (232 px) as walkers / on the bed
// Also prints a timing: a ≈ 1500 px planted row (draw time per call, sprites warm).
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const JS = path.join(ROOT, 'game', 'js');
const OUT = path.join(ROOT, 'docs', 'art');

async function newPage(browser, dpr) {
  const page = await browser.newPage({ deviceScaleFactor: dpr, viewport: { width: 800, height: 600 } });
  await page.setContent('<!doctype html><html><body style="margin:0;background:#9CC77A"></body></html>');
  for (const f of ['content.js', 'trace.js', 'farm_art.js']) {
    const p = path.join(JS, f);
    if (fs.existsSync(p)) await page.addScriptTag({ path: p });
  }
  await page.addScriptTag({ content: '(' + pageLib.toString() + ')();' });
  return page;
}
async function sheet(browser, name, dpr, fnName) {
  const page = await newPage(browser, dpr);
  const size = await page.evaluate((fn) => window.SHEETS[fn](), fnName);
  await page.setViewportSize({ width: size.w, height: size.h });
  const el = await page.$('canvas');
  await el.screenshot({ path: path.join(OUT, name) });
  await page.close();
  console.log('wrote docs/art/' + name, size.w + '×' + size.h, '@' + dpr + 'x');
}

/* ----------------------------------------------------------------------------- runs inside the page */
function pageLib() {
  const A = FT.FarmArt, COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  const T0 = 0.37;
  function mk(w, h) {
    const dpr = window.devicePixelRatio || 1, c = document.createElement('canvas');
    c.width = w * dpr; c.height = h * dpr; c.style.width = w + 'px'; c.style.height = h + 'px'; c.style.display = 'block';
    document.body.innerHTML = ''; document.body.appendChild(c);
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr); return ctx;
  }
  function meadow(ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#A9D088'); g.addColorStop(1, '#85B266');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  function label(ctx, t, x, y, col) {
    ctx.font = '600 13px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = col || 'rgba(30,45,15,0.9)'; ctx.fillText(t, x, y);
  }
  function head(ctx, t, x, y) { ctx.font = '800 17px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = '#23361A'; ctx.fillText(t, x, y); }

  function resample(raw) {
    const out = [raw[0]];
    for (let i = 1; i < raw.length; i++) {
      let [ax, ay] = out[out.length - 1]; const [bx, by] = raw[i]; let d = Math.hypot(bx - ax, by - ay);
      while (d >= 4) { const t = 4 / d; ax = ax + (bx - ax) * t; ay = ay + (by - ay) * t; out.push([ax, ay]); d = Math.hypot(bx - ax, by - ay); }
    }
    return out;
  }
  function mkPath(strokes) {
    const S = strokes.map(s => { const pts = resample(s.pts); let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return { pts, len, closed: !!s.closed }; });
    return { strokes: S, len: S.reduce((a, s) => a + s.len, 0) };
  }
  function fn(f, a, b, n) { const p = []; for (let i = 0; i <= n; i++) p.push(f(a + (b - a) * i / n)); return p; }
  function localPath(spec) {
    if (spec.kind === 'stroke' && spec.id === 'wave') return mkPath([{ pts: fn(t => [170 + t * 260, 200 + Math.sin(t * Math.PI * 3) * 45], 0, 1, 200) }]);
    if (spec.kind === 'stroke' && spec.id === 'zigzag') return mkPath([{ pts: [[180, 240], [225, 160], [270, 240], [315, 160], [360, 240], [405, 160]] }]);
    if (spec.kind === 'shape') {
      const cx = spec.cx || 300, cy = spec.cy || 200, r = (spec.size || 300) / 2;
      return mkPath([{ pts: fn(a => [cx + Math.sin(a) * r, cy - Math.cos(a) * r], 0, Math.PI * 2, 120), closed: true }]);
    }
    if (spec.kind === 'glyph') return mkPath([{ pts: [[320, 80], [230, 240], [370, 240]] }, { pts: [[330, 150], [330, 320]] }]);
    if (spec.kind === 'road') { const f = spec.from, t = spec.to; return mkPath([{ pts: fn(u => [f.x + (t.x - f.x) * u, f.y + (t.y - f.y) * u - Math.sin(u * Math.PI * 2) * 40], 0, 1, 120) }]); }
    return mkPath([{ pts: [[170, 200], [430, 200]] }]);
  }
  function tpath(spec) { try { if (FT.Trace && FT.Trace.path) return FT.Trace.path(spec); } catch (e) { console.warn(e); } return localPath(spec); }
  function outline(shape, cookie) { try { if (FT.Content && FT.Content.outlineSize) return FT.Content.outlineSize(shape, cookie); } catch (e) { /* */ } const F = { circle: [1, 0.5], oval: [1, 0.36], square: [0.88, 0.44], rect: [1, 0.31], triangle: [1.04, 0.298], diamond: [1, 0.312], star: [1.008, 0.217], heart: [1.04, 0.3] }[shape]; const body = 0.874 * cookie; return Math.round((1 - 16 / (F[1] * body)) * F[0] * body); }
  function partial(path, frac) {
    let left = path.len * frac; const out = [];
    for (const s of path.strokes) {
      if (left <= 0) break;
      const pts = [s.pts[0]]; let acc = 0;
      for (let i = 1; i < s.pts.length && acc < left; i++) { acc += Math.hypot(s.pts[i][0] - s.pts[i - 1][0], s.pts[i][1] - s.pts[i - 1][1]); pts.push(s.pts[i]); }
      out.push(pts); left -= s.len;
    }
    return { pts: out, done: path.len * frac };
  }
  function bed(ctx, x, y, s, draw) {
    const box = { x, y, w: 600 * s, h: 400 * s };
    A.drawTray(ctx, box, { time: T0, frame: 26 * s });
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); draw(ctx); ctx.restore();
  }
  function at(ctx, x, y, f) { ctx.save(); ctx.translate(x, y); f(); ctx.restore(); }

  window.PERF = function () {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 800; const g = c.getContext('2d'); g.scale(2, 2);
    const pts = []; for (let i = 0; i <= 330; i++) pts.push([60 + i * 1.5, 200 + Math.sin(i / 12) * 110]);   // ≈ 1500 px of arc, 4 px steps-ish
    let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    for (let k = 0; k < 5; k++) A.drawIcing(g, pts, 'red', 22, { wet: 0.5, time: k * 0.1 });
    const N = 60, t0 = performance.now();
    for (let k = 0; k < N; k++) A.drawIcing(g, pts, COLORS[k % 7], 22, { wet: 0.5, time: k * 0.016 });
    const row = (performance.now() - t0) / N;
    const t1 = performance.now();
    for (let k = 0; k < N; k++) A.drawIcing(g, pts, 'red', 22, { road: true });
    const road = (performance.now() - t1) / N;
    const t2 = performance.now();
    for (let k = 0; k < N; k++) A.drawTray(g, { x: 30, y: 30, w: 500, h: 330 }, { time: k });
    const tray = (performance.now() - t2) / N;
    const t3 = performance.now();
    for (let k = 0; k < N; k++) for (const a of A.ANIMALS) A.drawCookie(g, { kind: 'animal', animal: a }, 116, { time: k });
    const signs = (performance.now() - t3) / N / A.ANIMALS.length;
    return { arc: Math.round(L), rowMs: +row.toFixed(3), roadMs: +road.toFixed(3), trayMs: +tray.toFixed(3), animalSignMs: +signs.toFixed(3) };
  };

  window.SHEETS = {
    signs() {
      const W = 1500, H = 1220, ctx = mk(W, H); meadow(ctx, W, H);
      const cell = 140, size = 116;
      let y = 16;
      function row(title, list) {
        head(ctx, title, 20, y); y += 24;
        list.forEach((q, i) => { const x = 20 + cell / 2 + i * cell; at(ctx, x, y + 70, () => A.drawCookie(ctx, q.ck, size, Object.assign({ time: T0 }, q.opt || {}))); label(ctx, q.name, x, y + 150); });
        y += 172;
      }
      row('Round + shapes (116 px signs)', [{ ck: { kind: 'round' }, name: 'round' }].concat(A.SHAPES.map(s => ({ ck: { kind: 'shape', shape: s }, name: s }))));
      row('Animals', A.ANIMALS.map(a => ({ ck: { kind: 'animal', animal: a }, name: a })));
      row('Homes', A.HOMES.map(h => ({ ck: { kind: 'home', home: h }, name: h })));
      row('Glyphs', ['1', '3', '4', '7', '9', '10', '12', 'A', 'M', 'W', 'a', 'g'].slice(0, 10).map(t => ({ ck: { kind: 'glyph', text: t }, name: t })));
      row('States', [
        { ck: { kind: 'animal', animal: 'dog' }, opt: { lift: 1 }, name: 'lift 1' },
        { ck: { kind: 'animal', animal: 'dog' }, opt: { glow: 1 }, name: 'glow 1' },
        { ck: { kind: 'animal', animal: 'dog' }, opt: { selected: true }, name: 'selected' },
        { ck: { kind: 'animal', animal: 'dog' }, opt: { dim: true }, name: 'dim' },
        { ck: { kind: 'shape', shape: 'star' }, opt: { squash: 0.8 }, name: 'squash .8' },
        { ck: { kind: 'shape', shape: 'heart' }, opt: { sparkle: 1 }, name: 'sparkle' },
        { ck: { kind: 'glyph', text: '3' }, opt: { wob: 8 }, name: 'wob 8' },
        { ck: { kind: 'round', size: 'small' }, opt: {}, name: 'round (size)' },
        { ck: { kind: 'round', text: '5' }, opt: {}, name: 'glyph plain' }
      ]);
      head(ctx, 'Small: 74 px / 48 px', 20, y); y += 24;
      const smalls = [{ kind: 'animal', animal: 'sheep' }, { kind: 'animal', animal: 'bee' }, { kind: 'home', home: 'barn' }, { kind: 'shape', shape: 'oval' }, { kind: 'shape', shape: 'circle' }, { kind: 'glyph', text: '5' }];
      smalls.forEach((ck, i) => at(ctx, 60 + i * 100, y + 50, () => A.drawCookie(ctx, ck, 74, { time: T0 })));
      smalls.forEach((ck, i) => at(ctx, 700 + i * 70, y + 50, () => A.drawCookie(ctx, ck, 48, { time: T0 })));
      return { w: W, h: Math.ceil(y + 120) };
    },
    bed() {
      const s = 1, gap = 50, W = 600 * 2 + gap * 3, H = (400 + gap) * 3 + gap, ctx = mk(W, H); meadow(ctx, W, H);
      const ox = [gap, gap * 2 + 600], oy = [gap, gap * 2 + 400, gap * 3 + 800];
      bed(ctx, ox[0], oy[0], s, (c) => {   // colours: round patch + red wave half planted + guide
        const p = tpath({ kind: 'stroke', id: 'wave', cx: 300, cy: 200, w: 300, h: 120 }), q = partial(p, 0.55);
        at(c, 300, 200, () => A.drawCookie(c, { kind: 'round' }, 340, { time: T0, look: 'bed' }));
        A.drawIcing(c, q.pts[0], 'red', 22, { wet: 1, time: T0 });
        A.drawGuide(c, p, q.done, { time: T0, pulse: 0.3 });
        at(c, 470, 300, () => A.drawIcingBag(c, 'red', 120, 0, { squeeze: 1, time: T0 }));
      });
      bed(ctx, ox[1], oy[0], s, (c) => {   // shapes: star 60 %
        const p = tpath({ kind: 'shape', shape: 'star', cx: 300, cy: 200, size: outline('star', 340) }), q = partial(p, 0.6);
        at(c, 300, 200, () => A.drawCookie(c, { kind: 'shape', shape: 'star' }, 340, { time: T0, look: 'bed' }));
        A.drawIcing(c, q.pts[0], 'blue', 22, { wet: 0.8, time: T0 });
        A.drawGuide(c, p, q.done, { time: T0, pulse: 0.6, glow: 0.8 });
      });
      bed(ctx, ox[0], oy[1], s, (c) => {   // numeral 4 on the flat sign, not started
        const p = tpath({ kind: 'glyph', text: '4', cx: 300, cy: 200, h: 260 });
        at(c, 300, 200, () => A.drawCookie(c, { kind: 'glyph', text: '4' }, 350, { time: T0, look: 'bed' }));
        A.drawGuide(c, p, 0, { time: T0, pulse: 0.1 });
      });
      bed(ctx, ox[1], oy[1], s, (c) => {   // numeral 3 done (plain sign), green, bloom 1 + carrots
        const p = tpath({ kind: 'glyph', text: '3', cx: 300, cy: 200, h: 260 });
        at(c, 300, 200, () => A.drawCookie(c, { kind: 'round', text: '3' }, 350, { time: T0, look: 'bed' }));
        p.strokes.forEach(st => A.drawIcing(c, st.pts, 'yellow', 22, { wet: 0.1, bloom: 1, time: T0 }));
        [[190, 110, 1], [430, 150, 0.6], [410, 310, 0.25]].forEach(([x, y, g]) => at(c, x, y, () => A.drawChip(c, 16, { grow: g })));
      });
      bed(ctx, ox[0], oy[2], s, (c) => {   // animals: cow → barn road 70 %
        const p = tpath({ kind: 'road', from: { x: 175, y: 268 }, to: { x: 400, y: 270 }, bumps: 1 }), q = partial(p, 0.7);
        at(c, 482, 236, () => A.drawCookie(c, { kind: 'home', home: 'barn' }, 190, { time: T0, look: 'bed' }));
        q.pts.forEach(pt => A.drawIcing(c, pt, 'orange', 22, { road: true, time: T0 }));
        at(c, 112, 268, () => A.drawCookie(c, { kind: 'animal', animal: 'cow' }, 150, { time: T0, look: 'bed' }));
        A.drawGuide(c, p, q.done, { time: T0, pulse: 0.8 });
      });
      bed(ctx, ox[1], oy[2], s, (c) => {   // heart patch purple fully planted + bloom mid wave, ghost hand
        const p = tpath({ kind: 'shape', shape: 'heart', cx: 300, cy: 200, size: outline('heart', 340) });
        at(c, 300, 200, () => A.drawCookie(c, { kind: 'shape', shape: 'heart' }, 340, { time: T0, look: 'bed', sparkle: 1 }));
        p.strokes.forEach(st => A.drawIcing(c, st.pts, 'purple', 22, { wet: 0.4, bloom: 0.45, time: T0 }));
        at(c, 520, 330, () => A.drawGhostHand(c, 110, 0.8));
      });
      return { w: W, h: H };
    },
    things() {
      const W = 1500, H = 1300, ctx = mk(W, H); ctx.fillStyle = '#6B4630'; ctx.fillRect(0, 0, W, H);
      A.drawTray(ctx, { x: 10, y: 10, w: W - 20, h: H - 20 }, { time: T0, frame: 8 });
      const sz = 360, cell = 370;
      A.SHAPES.forEach((s, i) => { const x = 200 + (i % 4) * cell, y = 200 + Math.floor(i / 4) * 370; at(ctx, x, y, () => A.drawCookie(ctx, { kind: 'shape', shape: s }, sz * 0.94, { time: T0, look: 'bed' })); label(ctx, s, x, y + 175, '#FFF8E8'); });
      const pics = ['1', '7', 'A', '10'];
      pics.forEach((t, i) => { const x = 200 + i * cell, y = 950; at(ctx, x, y, () => A.drawCookie(ctx, { kind: 'glyph', text: t }, 330, { time: T0, look: 'bed' })); });
      return { w: W, h: H };
    },
    zoom() {
      const W = 1560, H = 920, ctx = mk(W, H); meadow(ctx, W, H);
      A.ANIMALS.forEach((a, i) => { const x = 85 + (i % 10) * 152, y = 130; at(ctx, x, y, () => A.drawCookie(ctx, { kind: 'animal', animal: a }, 150, { time: T0, look: 'walker', step: 0.25 })); label(ctx, a + ' walk .25', x, y + 85); });
      A.ANIMALS.forEach((a, i) => { const x = 85 + (i % 10) * 152, y = 330; at(ctx, x, y, () => A.drawCookie(ctx, { kind: 'animal', animal: a }, 150, { time: T0, look: 'walker', step: 0.75 })); label(ctx, 'step .75', x, y + 85); });
      ctx.fillStyle = '#6B4630'; ctx.fillRect(0, 450, W, 470);
      A.HOMES.forEach((h, i) => { const x = 100 + i * 190, y = 590; at(ctx, x, y, () => A.drawCookie(ctx, { kind: 'home', home: h }, 190, { time: T0, look: 'bed' })); label(ctx, h, x, y + 100, '#FFF8E8'); });
      A.ANIMALS.forEach((a, i) => { const x = 85 + i * 152, y = 820; at(ctx, x, y, () => A.drawCookie(ctx, { kind: 'animal', animal: a }, 150, { time: T0, look: 'bed' })); });
      return { w: W, h: H };
    },
    packets() {
      const W = 1240, H = 1120, ctx = mk(W, H); meadow(ctx, W, H);
      let y = 16;
      head(ctx, 'Seed packets (size = 2.4 r ≈ 125, origin centre)', 20, y); y += 24;
      COLORS.forEach((c, i) => { at(ctx, 80 + i * 150, y + 80, () => A.drawPacket(ctx, c, 125, { time: T0 })); label(ctx, c, 80 + i * 150, y + 152); });
      y += 176;
      head(ctx, 'selected, glow, dim, lift, wob', 20, y); y += 24;
      [{ selected: true }, { glow: 1 }, { dim: true }, { lift: 1 }, { wob: 8 }].forEach((o, i) => at(ctx, 80 + i * 150, y + 80, () => A.drawPacket(ctx, COLORS[i], 125, Object.assign({ time: T0 }, o))));
      y += 176;
      head(ctx, 'Watering cans (size 120, origin = spout tip ■) at angle −0.5 / 0 / +0.5', 20, y); y += 24;
      COLORS.concat([null]).forEach((c, i) => {
        [-0.5, 0, 0.5].forEach((a, j) => { const x = 90 + i * 145, ty = y + 100 + j * 130; at(ctx, x, ty, () => A.drawIcingBag(ctx, c, 120, a, { time: T0 })); ctx.fillStyle = '#000'; ctx.fillRect(x - 2, ty - 2, 4, 4); });
        label(ctx, c || 'empty', 90 + i * 145, y + 380);
      });
      y += 410;
      head(ctx, 'pouring (squeeze 0.5 / 1), selected + center, glow + center', 20, y); y += 24;
      [{ squeeze: 0.5 }, { squeeze: 1 }, { selected: 1, center: true }, { glow: 1, center: true }].forEach((o, i) => { const x = 90 + i * 170, ty = y + 110; at(ctx, x, ty, () => A.drawIcingBag(ctx, COLORS[i + 2], 120, 0, Object.assign({ time: T0 }, o))); ctx.fillStyle = '#000'; ctx.fillRect(x - 2, ty - 2, 4, 4); });
      // the grip point
      const g = A.CAN_GRIP, x0 = 800, y0 = y + 120; at(ctx, x0, y0, () => A.drawIcingBag(ctx, 'pink', 120, 0, { time: T0 }));
      ctx.fillStyle = '#E00'; ctx.beginPath(); ctx.arc(x0 + g.x * 120, y0 + g.y * 120, 4, 0, 7); ctx.fill(); label(ctx, 'CAN_GRIP (red)', x0, y0 + 20);
      y += 200;
      return { w: W, h: y };
    },
    rows() {
      const W = 1300, H = 1060, ctx = mk(W, H); ctx.fillStyle = '#6B4630'; ctx.fillRect(0, 0, W, H);
      A.drawTray(ctx, { x: 14, y: 14, w: W - 28, h: H - 28 }, { time: T0, frame: 10 });
      let y = 30;
      const lab = (t, x, yy) => { ctx.font = '700 14px system-ui'; ctx.textAlign = 'left'; ctx.fillStyle = '#FFF8E8'; ctx.fillText(t, x, yy); };
      lab('Growing rows: the finger is at the RIGHT end (lengths 20, 60, 120, 240, 480 px), wet 1', 30, y); y += 40;
      [20, 60, 120, 240, 480].forEach((L, i) => { const pts = []; for (let k = 0; k <= L / 4; k++) pts.push([40 + k * 4, y + i * 48]); A.drawIcing(ctx, pts, COLORS[i], 22, { wet: 1, time: T0 }); });
      y += 260;
      lab('Every colour, fully grown (grown:true), wavy', 30, y); y += 40;
      COLORS.forEach((c, i) => { const pts = []; for (let k = 0; k <= 40; k++) pts.push([40 + i * 175 + k * 3.6, y + Math.sin(k / 6) * 16]); A.drawIcing(ctx, pts, c, 22, { wet: 0, grown: true, time: T0 }); });
      y += 60;
      lab('Bloom 0 / 0.25 / 0.5 / 0.75 / 1 (a 240 px row; overshoot wave)', 30, y); y += 40;
      [0, 0.25, 0.5, 0.75, 1].forEach((b, i) => { const pts = []; for (let k = 0; k <= 60; k++) pts.push([40 + k * 4, y + i * 46]); A.drawIcing(ctx, pts, 'pink', 22, { wet: 0, bloom: b, time: T0 }); lab('bloom ' + b, 300, y + i * 46 + 4); });
      // road
      const road = []; for (let k = 0; k <= 100; k++) road.push([460 + k * 4, y + 100 + Math.sin(k / 12) * 50]);
      A.drawIcing(ctx, road, 'orange', 22, { road: true, time: T0 }); lab('road (pebble path)', 640, y + 20);
      A.drawGuide(ctx, { strokes: [{ pts: road.slice(60), len: 160 }], len: 160 }, 0, { time: T0, pulse: 0.2 });
      y += 250;
      lab('Carrots (r 26) grow 0 / .15 / .3 / .45 / .6 / .8 / 1, squash .7, r 16 / 26; petals; straw puff t .1 / .35 / .7', 30, y); y += 50;
      [0, 0.15, 0.3, 0.45, 0.6, 0.8, 1].forEach((g, i) => at(ctx, 60 + i * 72, y + 50, () => A.drawChip(ctx, 26, { grow: g })));
      at(ctx, 570, y + 50, () => A.drawChip(ctx, 26, { squash: 0.7 }));
      [16, 26].forEach((r, i) => at(ctx, 640 + i * 80, y + 30, () => A.drawChip(ctx, r)));
      COLORS.forEach((c, i) => at(ctx, 880 + i * 30, y + 30, () => A.drawSprinkle(ctx, c, 16, i * 0.8)));
      [0.1, 0.35, 0.7].forEach((t, i) => at(ctx, 1110 + i * 60, y + 30, () => A.drawFlourPuff(ctx, 30, t)));
      y += 110;
      return { w: W, h: y };
    },
    badges() {
      const W = 1800, H = 720, ctx = mk(W, H); meadow(ctx, W, H);
      let y = 16;
      head(ctx, 'Fence (w 820 h 120) with rosettes (size 84) hanging on nails', 20, y); y += 24;
      const rack = { x: 30, y: y + 10, w: 820, h: 120 };
      A.drawRack(ctx, rack, {});
      const wave = []; for (let k = 0; k <= 60; k++) wave.push([-120 + k * 4, Math.sin(k / 6) * 40]);
      const circ = []; for (let k = 0; k <= 80; k++) { const a = k / 80 * Math.PI * 2; circ.push([Math.cos(a) * 120, Math.sin(a) * 120]); }
      const box = { cx: 0, cy: 0, size: 330 };
      const cks = [
        { kind: 'round', icing: [{ pts: wave, hex: '#E84A4A' }], icingBox: box },
        { kind: 'shape', shape: 'star', icing: [{ pts: circ.map(p => [p[0] * 0.9, p[1] * 0.9]), hex: '#3C8DE8' }], icingBox: box },
        { kind: 'animal', animal: 'frog' },
        { kind: 'round', text: '3', icing: [{ pts: [[-50, -100], [60, -60], [0, 0], [60, 60], [-50, 100]], hex: '#FFD23F' }], chips: [{ x: -110, y: -60, r: 16 }, { x: 110, y: -20, r: 16 }, { x: 100, y: 100, r: 16 }], icingBox: box },
        { kind: 'shape', shape: 'heart', icing: [{ pts: circ.map(p => [p[0] * 0.8, p[1] * 0.8]), hex: '#8E44AD' }], icingBox: box },
        { kind: 'animal', animal: 'cow' },
        { kind: 'round' }
      ];
      cks.forEach((ck, i) => at(ctx, rack.x + 60 + i * 115, rack.y + 52, () => A.drawBadge(ctx, ck, 84, { time: T0 })));
      at(ctx, 1000, y + 70, () => A.drawCookie(ctx, cks[0], 140, { look: 'badge', time: T0, glow: 1, sparkle: 1 }));
      at(ctx, 1200, y + 70, () => A.drawBadge(ctx, cks[3], 140, { time: T0 }));
      y += 230;
      head(ctx, 'Talk icons (size 100)', 20, y); y += 24;
      const icons = [{ kind: 'blob', color: 'red' }, { kind: 'blob', color: 'yellow' }, { kind: 'shape', shape: 'triangle', color: 'green' }, { kind: 'shape', shape: 'heart' }, { kind: 'animal', animal: 'rabbit' },
        { kind: 'home', home: 'hive' }, { kind: 'number', n: 7 }, { kind: 'letter', text: 'B' }, { kind: 'dots', n: 3 }, { kind: 'dots', n: 5 }, { kind: 'dots', n: 7 }, { kind: 'dots', n: 10 }, { kind: 'dots', n: 12 }, { kind: 'size', size: 'big' }, { kind: 'size', size: 'small' }];
      icons.forEach((t, i) => { ctx.fillStyle = '#FFF8EC'; ctx.fillRect(14 + i * 118, y, 110, 110); ctx.fillStyle = 'rgba(0,0,0,0)'; at(ctx, 69 + i * 118, y + 55, () => A.drawIcon(ctx, t, 100)); label(ctx, t.kind + ' ' + (t.color || t.shape || t.animal || t.home || t.n || t.text || t.size || ''), 69 + i * 118, y + 116); });
      y += 150;
      head(ctx, 'ghost hand press 0 / 1', 20, y); y += 24;
      at(ctx, 80, y + 10, () => A.drawGhostHand(ctx, 100, 0)); at(ctx, 220, y + 10, () => A.drawGhostHand(ctx, 100, 1));
      y += 130;
      return { w: W, h: y };
    },
    phone() {
      const s = 0.6, gap = 20, W = 600 * s + gap * 2, H = (400 * s + gap) * 3 + gap, ctx = mk(W, H); meadow(ctx, W, H);
      bed(ctx, gap, gap, s, (c) => {
        const p = tpath({ kind: 'road', from: { x: 175, y: 268 }, to: { x: 400, y: 270 }, bumps: 1 });
        at(c, 482, 236, () => A.drawCookie(c, { kind: 'home', home: 'kennel' }, 190, { time: T0, look: 'bed' }));
        at(c, 112, 268, () => A.drawCookie(c, { kind: 'animal', animal: 'dog' }, 150, { time: T0, look: 'bed' }));
        A.drawGuide(c, p, 0, { time: T0, pulse: 0.3 });
      });
      bed(ctx, gap, gap * 2 + 400 * s, s, (c) => {
        const p = tpath({ kind: 'stroke', id: 'wave', cx: 300, cy: 200, w: 300, h: 120 }), q = partial(p, 0.5);
        at(c, 300, 200, () => A.drawCookie(c, { kind: 'round' }, 340, { time: T0, look: 'bed' }));
        A.drawIcing(c, q.pts[0], 'yellow', 22, { wet: 1, time: T0 });
        A.drawGuide(c, p, q.done, { time: T0, pulse: 0.6 });
      });
      bed(ctx, gap, gap * 3 + 800 * s, s, (c) => {
        const p = tpath({ kind: 'glyph', text: '4', cx: 300, cy: 200, h: 260 }), q = partial(p, 0.3);
        at(c, 300, 200, () => A.drawCookie(c, { kind: 'glyph', text: '4' }, 350, { time: T0, look: 'bed' }));
        q.pts.forEach(pt => A.drawIcing(c, pt, 'orange', 22, { wet: 0.6, time: T0 }));
        A.drawGuide(c, p, q.done, { time: T0, pulse: 0.1 });
      });
      return { w: W, h: H };
    }
  };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const only = process.argv[2];
  const jobs = [['farm_signs.png', 1, 'signs'], ['farm_bed.png', 1, 'bed'], ['farm_things.png', 1, 'things'], ['farm_zoom.png', 1, 'zoom'],
    ['farm_packets.png', 1, 'packets'], ['farm_rows.png', 1, 'rows'], ['farm_badges.png', 1, 'badges'], ['farm_phone_3x.png', 3, 'phone']];
  for (const [n, d, f] of jobs) if (!only || only === f) await sheet(browser, n, d, f);
  const page = await newPage(browser, 2);
  console.log('perf', JSON.stringify(await page.evaluate(() => window.PERF())));
  await page.close();
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
