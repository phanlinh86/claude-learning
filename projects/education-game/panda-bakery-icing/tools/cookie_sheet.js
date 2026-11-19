#!/usr/bin/env node
// Mochi's Icing Bakery — contact sheets for IB.CookieArt (character artist B).
// Run from the game folder root:   node tools/cookie_sheet.js
//   → docs/art/cookies_choices.png   every cookie (round, 8 shapes, 10 animals, 8 homes, glyphs) at 116 px in the choice row,
//                                    + states (lift, glow, selected, dim, squash, sparkle)
//   → docs/art/cookies_tray.png      trays at in-game size (600 × 400 picture, s = 1) with the big ≈ 330 px cookie, icing,
//                                    guide dots, chips, the animal road
//   → docs/art/cookies_tray_2x.png   two trays rendered at 2× device pixels (iPad retina)
//   → docs/art/cookies_bags.png      icing bags in every colour (rest / squeeze / selected / glow / dim / tilted), icing
//                                    samples, chips, sprinkles, flour puff, ghost hand, rack, Talk icons
//   → docs/art/cookies_phone_3x.png  iPhone-size trays (s 0.6, DPR 3): road dots on parchment, yellow / orange icing
//   → docs/art/cookies_zoom.png      animals + homes at 2× (232 px) for detail checks
// Trace paths come from game/js/trace.js when it exists (IB.Trace.path), else from a small local stand-in.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const JS = path.join(ROOT, 'game', 'js');
const OUT = path.join(ROOT, 'docs', 'art');

async function sheet(browser, name, dpr, fnName) {
  const page = await browser.newPage({ deviceScaleFactor: dpr, viewport: { width: 800, height: 600 } });
  await page.setContent('<!doctype html><html><body style="margin:0;background:#C99A6B"></body></html>');
  for (const f of ['content.js', 'trace.js', 'cookie_art.js']) {
    const p = path.join(JS, f);
    if (fs.existsSync(p)) await page.addScriptTag({ path: p });
  }
  await page.addScriptTag({ content: '(' + pageLib.toString() + ')();' });
  const size = await page.evaluate((fn) => window.SHEETS[fn](), fnName);
  await page.setViewportSize({ width: size.w, height: size.h });
  const el = await page.$('canvas');
  await el.screenshot({ path: path.join(OUT, name) });
  await page.close();
  console.log('wrote docs/art/' + name, size.w + '×' + size.h, '@' + dpr + 'x');
}

/* ----------------------------------------------------------------------------- runs inside the page */
function pageLib() {
  const A = IB.CookieArt, COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  const T0 = 0.37;   // fixed time for pulses
  function mk(w, h) {
    const dpr = window.devicePixelRatio || 1, c = document.createElement('canvas');
    c.width = w * dpr; c.height = h * dpr; c.style.width = w + 'px'; c.style.height = h + 'px'; c.style.display = 'block';
    document.body.innerHTML = ''; document.body.appendChild(c);
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr); return ctx;
  }
  function counter(ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#D6AC7E'); g.addColorStop(1, '#B98957');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(120,80,40,0.18)'; ctx.lineWidth = 2;
    for (let y = 18; y < h; y += 46) { ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(w * 0.3, y + 6, w * 0.7, y - 6, w, y + 3); ctx.stroke(); }
  }
  function label(ctx, t, x, y, col) {
    ctx.font = '600 13px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = col || 'rgba(60,35,15,0.85)'; ctx.fillText(t, x, y);
  }
  function head(ctx, t, x, y) { ctx.font = '800 17px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = '#4A2C16'; ctx.fillText(t, x, y); }

  // ---- stand-in trace paths (resampled every 4 px) when trace.js is missing
  function resample(raw) {
    const out = [raw[0]]; let acc = 0;
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
      if (spec.shape === 'star') { const v = []; for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r * 0.95; v.push([cx + Math.cos(a) * rr, cy + 10 + Math.sin(a) * rr]); } return mkPath([{ pts: v, closed: true }]); }
      return mkPath([{ pts: fn(a => [cx + Math.sin(a) * r, cy - Math.cos(a) * r], 0, Math.PI * 2, 120), closed: true }]);
    }
    if (spec.kind === 'glyph' && spec.text === '4') return mkPath([{ pts: [[320, 80], [230, 240], [370, 240]] }, { pts: [[330, 150], [330, 320]] }]);
    if (spec.kind === 'glyph') return mkPath([{ pts: fn(a => [300 + Math.sin(a) * 70, 135 - Math.cos(a) * 60], -1.4, Math.PI * 0.95, 60).concat(fn(a => [300 + Math.sin(a) * 78, 262 - Math.cos(a) * 68], Math.PI * 0.05 - Math.PI, Math.PI * 0.75, 70).slice(1).map(q => q)) }]);
    if (spec.kind === 'road') { const f = spec.from, t = spec.to; return mkPath([{ pts: fn(u => [f.x + (t.x - f.x) * u, f.y + (t.y - f.y) * u - Math.sin(u * Math.PI * 2) * 40], 0, 1, 120) }]); }
    return mkPath([{ pts: [[170, 200], [430, 200]] }]);
  }
  function tpath(spec) { try { if (IB.Trace && IB.Trace.path) return IB.Trace.path(spec); } catch (e) { console.warn(e); } return localPath(spec); }
  function partial(path, frac) {   // icing = first frac of the whole path
    let left = path.len * frac; const out = [];
    for (const s of path.strokes) {
      if (left <= 0) break;
      const pts = [s.pts[0]]; let acc = 0;
      for (let i = 1; i < s.pts.length && acc < left; i++) { acc += Math.hypot(s.pts[i][0] - s.pts[i - 1][0], s.pts[i][1] - s.pts[i - 1][1]); pts.push(s.pts[i]); }
      out.push(pts); left -= s.len;
    }
    return { pts: out, done: path.len * frac };
  }
  function tray(ctx, x, y, s, draw) {
    const box = { x, y, w: 600 * s, h: 400 * s };
    A.drawTray(ctx, box, { time: T0 });
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); draw(ctx); ctx.restore();
  }

  window.SHEETS = {
    choices() {
      const W = 1720, H = 1180, ctx = mk(W, H); counter(ctx, W, H);
      const cell = 140, size = 116;
      let y = 20;
      function row(title, list) {
        head(ctx, title, 20, y); y += 26;
        list.forEach((q, i) => { const x = 20 + cell / 2 + i * cell; ctx.save(); ctx.translate(x, y + 66); A.drawCookie(ctx, q.ck, size, Object.assign({ time: T0 }, q.opt || {})); ctx.restore(); label(ctx, q.name, x, y + 132); });
        y += 160;
      }
      row('Round + shapes (116 px)', [{ ck: { kind: 'round' }, name: 'round' }].concat(A.SHAPES.map(s => ({ ck: { kind: 'shape', shape: s }, name: s }))));
      row('Animals', A.ANIMALS.map(a => ({ ck: { kind: 'animal', animal: a }, name: a })));
      row('Homes (gingerbread)', A.HOMES.map(h => ({ ck: { kind: 'home', home: h }, name: h })));
      row('Glyphs', ['1', '3', '4', '7', '10', '12', '20', 'A', 'M', 'W', 'a', 'g'].map(t => ({ ck: { kind: 'glyph', text: t }, name: t })));
      row('States', [
        { ck: { kind: 'animal', animal: 'dog' }, opt: { lift: 1 }, name: 'lift 1' },
        { ck: { kind: 'animal', animal: 'dog' }, opt: { glow: 1 }, name: 'glow 1' },
        { ck: { kind: 'animal', animal: 'dog' }, opt: { selected: true }, name: 'selected' },
        { ck: { kind: 'animal', animal: 'dog' }, opt: { dim: true }, name: 'dim' },
        { ck: { kind: 'animal', animal: 'dog' }, opt: { squash: 0.75 }, name: 'squash .75' },
        { ck: { kind: 'animal', animal: 'dog' }, opt: { squash: 1.15 }, name: 'stretch 1.15' },
        { ck: { kind: 'animal', animal: 'dog' }, opt: { sparkle: 1 }, name: 'sparkle' },
        { ck: { kind: 'animal', animal: 'dog' }, opt: { wob: 8 }, name: 'wob 8' },
        { ck: { kind: 'glyph', text: '3' }, opt: { glow: 0.7, lift: 0.5 }, name: 'glow+lift' }
      ]);
      // small sizes: rack (74) and HUD (48)
      head(ctx, 'Rack size 74 px / icon 48 px', 20, y); y += 26;
      const smalls = [{ kind: 'animal', animal: 'cat' }, { kind: 'animal', animal: 'bee' }, { kind: 'home', home: 'barn' }, { kind: 'shape', shape: 'star' }, { kind: 'glyph', text: '5' }, { kind: 'animal', animal: 'fish' }];
      smalls.forEach((ck, i) => { ctx.save(); ctx.translate(60 + i * 100, y + 45); A.drawCookie(ctx, ck, 74, { time: T0 }); ctx.restore(); });
      smalls.forEach((ck, i) => { ctx.save(); ctx.translate(680 + i * 70, y + 45); A.drawCookie(ctx, ck, 48, { time: T0 }); ctx.restore(); });
      return { w: W, h: Math.ceil(y + 110) };
    },
    tray(scaleOverride) {
      const s = 1, gap = 60, W = 600 * 2 * s + gap * 3, H = (400 * s + gap) * 3 + gap, ctx = mk(W, H); counter(ctx, W, H);
      const ox = [gap, gap * 2 + 600 * s], oy = [gap, gap * 2 + 400 * s, gap * 3 + 800 * s];
      const ck = 330;
      // 1 colours: round cookie + red wave half piped + guide
      tray(ctx, ox[0], oy[0], s, (c) => {
        const p = tpath({ kind: 'stroke', id: 'wave' }), q = partial(p, 0.45);
        c.save(); c.translate(300, 200); A.drawCookie(c, { kind: 'round' }, ck, { time: T0 }); c.restore();
        A.drawIcing(c, q.pts[0], 'red', 22, { wet: 1 });
        A.drawGuide(c, p, q.done, { time: T0, pulse: 0.3 });
      });
      // 2 shapes: star outline, 60 %
      tray(ctx, ox[1], oy[0], s, (c) => {
        const p = tpath({ kind: 'shape', shape: 'star', cx: 300, cy: 200, size: 300 }), q = partial(p, 0.6);
        c.save(); c.translate(300, 200); A.drawCookie(c, { kind: 'shape', shape: 'star' }, ck, { time: T0 }); c.restore();
        A.drawIcing(c, q.pts[0], 'blue', 22, { wet: 0.8 });
        A.drawGuide(c, p, q.done, { time: T0, pulse: 0.6, glow: 0.8 });
      });
      // 3 count: numeral 4 (2 strokes) not started + chips
      tray(ctx, ox[0], oy[1], s, (c) => {
        const p = tpath({ kind: 'glyph', text: '4', cx: 300, cy: 200, h: 260 });
        c.save(); c.translate(300, 200); A.drawCookie(c, { kind: 'round' }, 360, { time: T0 }); c.restore();
        A.drawGuide(c, p, 0, { time: T0, pulse: 0.1 });
      });
      // 4 numeral 3 done, green, dry + chips
      tray(ctx, ox[1], oy[1], s, (c) => {
        const p = tpath({ kind: 'glyph', text: '3', cx: 300, cy: 200, h: 260 });
        c.save(); c.translate(300, 200); A.drawCookie(c, { kind: 'round' }, 360, { time: T0 }); c.restore();
        p.strokes.forEach(st => A.drawIcing(c, st.pts, 'green', 22, { wet: 0.1 }));
        [[200, 110], [420, 150], [400, 300]].forEach(([x, y], i) => { c.save(); c.translate(x, y); A.drawChip(c, 15, { squash: i === 2 ? 0.7 : 1 }); c.restore(); });
        for (let i = 0; i < 16; i++) { c.save(); c.translate(180 + (i * 47) % 240, 90 + (i * 83) % 220); A.drawSprinkle(c, COLORS[i % 7], 12, i * 0.9); c.restore(); }
      });
      // 5 animals: dog → kennel road, 70 %
      tray(ctx, ox[0], oy[2], s, (c) => {
        const p = tpath({ kind: 'road', from: { x: 110, y: 260 }, to: { x: 490, y: 250 }, bumps: 1 }), q = partial(p, 0.7);
        c.save(); c.translate(490, 230); A.drawCookie(c, { kind: 'home', home: 'kennel' }, 190, { time: T0 }); c.restore();
        q.pts.forEach(pt => A.drawIcing(c, pt, 'orange', 22, { wet: 0.9 }));
        c.save(); c.translate(110, 250); A.drawCookie(c, { kind: 'animal', animal: 'dog' }, 150, { time: T0, lift: 0.2 }); c.restore();
        A.drawGuide(c, p, q.done, { time: T0, pulse: 0.8 });
      });
      // 6 shapes: heart + purple fully iced + sparkle, ghost hand
      tray(ctx, ox[1], oy[2], s, (c) => {
        const p = tpath({ kind: 'shape', shape: 'heart', cx: 300, cy: 200, size: 300 });
        c.save(); c.translate(300, 200); A.drawCookie(c, { kind: 'shape', shape: 'heart' }, ck, { time: T0, sparkle: 1 }); c.restore();
        p.strokes.forEach(st => A.drawIcing(c, st.pts, 'purple', 22, { wet: 0.4 }));
        c.save(); c.translate(520, 330); A.drawGhostHand(c, 110, 0.8); c.restore();
      });
      return { w: W, h: H };
    },
    tray2x() {
      const s = 1, gap = 40, W = 600 + gap * 2, H = 400 * 2 + gap * 3, ctx = mk(W, H); counter(ctx, W, H);
      tray(ctx, gap, gap, s, (c) => {
        const p = tpath({ kind: 'stroke', id: 'zigzag' }), q = partial(p, 0.35);
        c.save(); c.translate(300, 200); A.drawCookie(c, { kind: 'round' }, 330, { time: T0 }); c.restore();
        A.drawIcing(c, q.pts[0], 'yellow', 22, { wet: 1 });
        A.drawGuide(c, p, q.done, { time: T0, pulse: 0.5 });
      });
      tray(ctx, gap, gap * 2 + 400, s, (c) => {
        c.save(); c.translate(160, 200); A.drawCookie(c, { kind: 'animal', animal: 'pig' }, 230, { time: T0 }); c.restore();
        c.save(); c.translate(440, 200); A.drawCookie(c, { kind: 'home', home: 'barn' }, 230, { time: T0 }); c.restore();
      });
      return { w: W, h: H };
    },
    phone() {   // iPhone portrait: tray s ≈ 0.6, DPR 3 — road on parchment + yellow / orange icing on dough
      const s = 0.6, gap = 20, W = 600 * s + gap * 2, H = (400 * s + gap) * 3 + gap, ctx = mk(W, H); counter(ctx, W, H);
      tray(ctx, gap, gap, s, (c) => {
        const p = tpath({ kind: 'road', from: { x: 110, y: 260 }, to: { x: 490, y: 250 }, bumps: 1 });
        c.save(); c.translate(490, 230); A.drawCookie(c, { kind: 'home', home: 'kennel' }, 190, { time: T0 }); c.restore();
        c.save(); c.translate(110, 250); A.drawCookie(c, { kind: 'animal', animal: 'dog' }, 150, { time: T0 }); c.restore();
        A.drawGuide(c, p, 0, { time: T0, pulse: 0.3 });
      });
      tray(ctx, gap, gap * 2 + 400 * s, s, (c) => {
        const p = tpath({ kind: 'stroke', id: 'wave' }), q = partial(p, 0.5);
        c.save(); c.translate(300, 200); A.drawCookie(c, { kind: 'round' }, 330, { time: T0 }); c.restore();
        A.drawIcing(c, q.pts[0], 'yellow', 22, { wet: 1 });
        A.drawGuide(c, p, q.done, { time: T0, pulse: 0.6 });
      });
      tray(ctx, gap, gap * 3 + 800 * s, s, (c) => {
        const p = tpath({ kind: 'glyph', text: '4', cx: 300, cy: 200, h: 260 }), q = partial(p, 0.3);
        c.save(); c.translate(300, 200); A.drawCookie(c, { kind: 'round' }, 360, { time: T0 }); c.restore();
        q.pts.forEach(pt => A.drawIcing(c, pt, 'orange', 22, { wet: 0.6 }));
        A.drawGuide(c, p, q.done, { time: T0, pulse: 0.1 });
      });
      return { w: W, h: H };
    },
    zoom() {
      const W = 1500, H = 560, ctx = mk(W, H); counter(ctx, W, H);
      const list = A.ANIMALS.map(a => ({ kind: 'animal', animal: a })).concat(A.HOMES.map(h => ({ kind: 'home', home: h })));
      list.forEach((ck, i) => { const col = i % 9, row = Math.floor(i / 9); ctx.save(); ctx.translate(90 + col * 165, 140 + row * 270); A.drawCookie(ctx, ck, 232 * 0.68, { time: T0 }); ctx.restore(); label(ctx, ck.animal || ck.home, 90 + col * 165, 240 + row * 270); });
      return { w: W, h: H };
    },
    bags() {
      const W = 1500, H = 1060, ctx = mk(W, H); counter(ctx, W, H);
      let y = 16;
      head(ctx, 'Icing bags (size 130, origin = centre) — rest', 20, y); y += 24;
      COLORS.concat([null]).forEach((c, i) => { ctx.save(); ctx.translate(80 + i * 140, y + 80); A.drawIcingBag(ctx, c, 130, 0, { center: true, time: T0 }); ctx.restore(); label(ctx, c || 'empty', 80 + i * 140, y + 152); });
      y += 176;
      head(ctx, 'squeeze 0.5 / 1, selected, glow, dim, lift, tilted −0.5 / +0.6 (tip origin, piping)', 20, y); y += 24;
      const st = [{ squeeze: 0.5 }, { squeeze: 1 }, { selected: true }, { glow: 1 }, { dim: true }, { lift: 1 }];
      st.forEach((o, i) => { ctx.save(); ctx.translate(80 + i * 140, y + 80); A.drawIcingBag(ctx, COLORS[i], 130, 0, Object.assign({ center: true, time: T0 }, o)); ctx.restore(); label(ctx, Object.keys(o)[0], 80 + i * 140, y + 152); });
      [[-0.5, 'green'], [0.6, 'pink']].forEach(([a, c], i) => { const x = 80 + (6 + i) * 140, ty = y + 150; ctx.save(); ctx.translate(x, ty); A.drawIcingBag(ctx, c, 130, a, { squeeze: 0.8, time: T0 }); ctx.restore(); ctx.fillStyle = '#000'; ctx.fillRect(x - 2, ty - 2, 4, 4); });
      y += 180;
      head(ctx, 'Icing (width 22, wet 1 / 0.3) on parchment + chips, sprinkles, flour puff', 20, y); y += 24;
      ctx.fillStyle = '#FFF8EC'; ctx.fillRect(20, y, 960, 150);
      COLORS.forEach((c, i) => {
        const pts = []; for (let k = 0; k <= 30; k++) pts.push([40 + i * 135 + k * 3.6, y + 40 + Math.sin(k / 5) * 18]);
        A.drawIcing(ctx, pts, c, 22, { wet: 1 });
        const pts2 = pts.map(([x, yy]) => [x, yy + 66]); A.drawIcing(ctx, pts2, c, 22, { wet: 0.3 });
      });
      ctx.fillStyle = '#E9B872'; ctx.fillRect(1000, y, 480, 150);
      [10, 15, 20].forEach((r, i) => { ctx.save(); ctx.translate(1040 + i * 55, y + 45); A.drawChip(ctx, r); ctx.restore(); });
      ctx.save(); ctx.translate(1205, y + 45); A.drawChip(ctx, 15, { squash: 0.6 }); ctx.restore();
      COLORS.forEach((c, i) => { ctx.save(); ctx.translate(1040 + i * 26, y + 110); A.drawSprinkle(ctx, c, 14, i * 0.8); ctx.restore(); });
      [0.1, 0.35, 0.7].forEach((t, i) => { ctx.save(); ctx.translate(1280 + i * 70, y + 70); A.drawFlourPuff(ctx, 34, t); ctx.restore(); });
      y += 176;
      head(ctx, 'Rack (w 340 h 80) with 74 px cookies · ghost hand press 0 / 1', 20, y); y += 24;
      const rack = { x: 30, y: y + 20, w: 340, h: 80 };
      A.drawRack(ctx, rack, {});
      const wave = []; for (let k = 0; k <= 60; k++) wave.push([180 + k * 4, 200 + Math.sin(k / 6) * 40]);
      [{ kind: 'round', icing: [{ pts: wave, hex: 'red' }] }, { kind: 'shape', shape: 'star' }, { kind: 'animal', animal: 'frog' }, { kind: 'glyph', text: '3', chips: [{ x: 200, y: 120, r: 15 }, { x: 420, y: 160 }, { x: 380, y: 300 }] }]
        .forEach((ck, i) => { ctx.save(); ctx.translate(rack.x + 45 + i * 83, rack.y + 30); A.drawCookie(ctx, ck, 74, { time: T0 }); ctx.restore(); });
      ctx.save(); ctx.translate(480, y + 30); A.drawGhostHand(ctx, 100, 0); ctx.restore();
      ctx.save(); ctx.translate(600, y + 30); A.drawGhostHand(ctx, 100, 1); ctx.restore();
      y += 140;
      head(ctx, 'Talk icons (size 100)', 20, y); y += 24;
      const icons = [{ kind: 'blob', color: 'red' }, { kind: 'blob', color: 'yellow' }, { kind: 'shape', shape: 'triangle', color: 'green' }, { kind: 'shape', shape: 'heart' }, { kind: 'animal', animal: 'rabbit' },
        { kind: 'home', home: 'hive' }, { kind: 'number', n: 7 }, { kind: 'letter', text: 'B' }, { kind: 'dots', n: 5 }, { kind: 'dots', n: 12 }, { kind: 'size', size: 'big' }, { kind: 'size', size: 'small' }];
      icons.forEach((t, i) => { ctx.save(); ctx.translate(70 + i * 118, y + 60); A.drawIcon(ctx, t, 100); ctx.restore(); label(ctx, t.kind + ' ' + (t.color || t.shape || t.animal || t.home || t.n || t.text || t.size || ''), 70 + i * 118, y + 118); });
      y += 140;
      return { w: W, h: y };
    }
  };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  await sheet(browser, 'cookies_choices.png', 1, 'choices');
  await sheet(browser, 'cookies_tray.png', 1, 'tray');
  await sheet(browser, 'cookies_tray_2x.png', 2, 'tray2x');
  await sheet(browser, 'cookies_zoom.png', 2, 'zoom');
  await sheet(browser, 'cookies_phone_3x.png', 3, 'phone');
  await sheet(browser, 'cookies_bags.png', 1, 'bags');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
