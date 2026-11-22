// Visual QA helpers (Nim's River Hop) — in-page measurement code + colour maths. Report-only: never touches game/.
// Used by tests/qa/visual_capture.js. The page part (PAGE_JS) is injected with addInitScript and exposes
//   window.__qa.measure(label)  → layout / overlap / text-fit / colour samples of the current frame (CSS px)
//   window.__qa.startRec()/stopRec() → a 30 ms sampler of Nim + things vs the speech bubble / HUD / safe edges over many frames
'use strict';

const PAGE_JS = String.raw`
(function(){
  const QA = window.__qa = window.__qa || {};
  const ovl = (a, b) => { if (!a || !b) return null; const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
    return (x1 > x0 && y1 > y0) ? { w: +(x1 - x0).toFixed(1), h: +(y1 - y0).toFixed(1) } : null; };
  const rectOf = el => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? { x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) } : null; };
  const visible = el => { if (!el) return false; let e = el; while (e && e !== document.body) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; e = e.parentElement; } return true; };
  QA.sa = () => { const cs = getComputedStyle(document.getElementById('safeProbe')); return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 }; };
  // Nim's ART box (NIM_POINTS.box, no tap padding) in logical px
  QA.nimArt = (w) => {
    const n = w.nim, L = w.layout, B = DK.NIM_POINTS; if (!n) return null;
    const k = (n.h || L.nimH) / 300;
    if (n.state === 'roll' && n.curl > 0.3 && n.ballR) return { x: n.ballX - n.ballR, y: n.ballY - n.ballR, w: 2 * n.ballR, h: 2 * n.ballR, roll: true };
    const sy = n.sy || 1, sx = n.sx || 1;
    const x0 = n.x + (B.box[0] - B.feet[0]) * k * sx, x1 = n.x + (B.box[2] - B.feet[0]) * k * sx;
    const y0 = n.y + (B.box[1] - B.feet[1]) * k * sy, y1 = n.y + (B.box[3] - B.feet[1]) * k * sy;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  const lg2css = (v, b) => b ? { x: v.left + b.x * v.s, y: v.top + b.y * v.s, w: b.w * v.s, h: b.h * v.s } : null;
  QA.bubbleOn = () => { const b = document.getElementById('bubble'); return visible(b) && !b.classList.contains('fade') && (document.getElementById('bubbleText').textContent || '').trim().length > 0; };
  // canvas pixel reader in LOGICAL px
  QA.px = (x, y, r) => {
    const c = document.getElementById('game'), g = c.getContext('2d'), L = DK.debug.world.layout, k = c.width / L.W;
    r = r || 2; const X = Math.round(x * k), Y = Math.round(y * k), R = Math.max(1, Math.round(r * k));
    if (X - R < 0 || Y - R < 0 || X + R >= c.width || Y + R >= c.height) return null;
    const d = g.getImageData(X - R, Y - R, 2 * R + 1, 2 * R + 1).data; let rr = 0, gg = 0, bb = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { rr += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++; }
    return [Math.round(rr / n), Math.round(gg / n), Math.round(bb / n)];
  };
  QA.textFit = () => {
    const out = [];
    const sel = '#bubbleText, #bubble, .screen:not(.hidden) h2, .screen:not(.hidden) button, .screen:not(.hidden) p, .screen:not(.hidden) label, .screen:not(.hidden) .chip, .screen:not(.hidden) .logo span, #hud *';
    const vw = innerWidth, vh = innerHeight;
    document.querySelectorAll(sel).forEach(el => {
      if (!visible(el)) return; const r = el.getBoundingClientRect(); if (!r.width) return;
      const txt = (el.innerText || '').trim().slice(0, 60);
      const sw = el.scrollWidth - el.clientWidth, sh = el.scrollHeight - el.clientHeight;
      const cs = getComputedStyle(el);
      const clip = (cs.overflow !== 'visible' || cs.overflowX !== 'visible') && (sw > 1 || sh > 1);
      const off = r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5;
      // does the element's own text overflow the box horizontally (single unbreakable words)?
      let wordOver = false;
      if (el.tagName === 'BUTTON' || el.classList.contains('chip')) wordOver = sw > 1;
      if (clip || off || wordOver) out.push({ sel: el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + el.className, txt, rect: { x: r.left | 0, y: r.top | 0, w: r.width | 0, h: r.height | 0 }, sw, sh, clip, off, wordOver, fs: cs.fontSize });
    });
    return out;
  };
  // which DOM controls sit under the notch / home indicator (CSS px)
  QA.unsafeControls = () => {
    const sa = QA.sa(), vw = innerWidth, vh = innerHeight, out = [];
    document.querySelectorAll('button, .chip, #bubble, .hud-stars, .hud-dots, .logo, .tagline, .title-info, .panel').forEach(el => {
      if (!visible(el)) return; const r = el.getBoundingClientRect(); if (!r.width) return;
      const bad = [];
      if (sa.t && r.top < sa.t - 0.5) bad.push('top ' + (sa.t - r.top).toFixed(1));
      if (sa.b && r.bottom > vh - sa.b + 0.5) bad.push('bottom ' + (r.bottom - (vh - sa.b)).toFixed(1));
      if (sa.l && r.left < sa.l - 0.5) bad.push('left ' + (sa.l - r.left).toFixed(1));
      if (sa.r && r.right > vw - sa.r + 0.5) bad.push('right ' + (r.right - (vw - sa.r)).toFixed(1));
      if (bad.length) out.push({ el: el.id || el.className || el.tagName, bad: bad.join(', ') });
    });
    return out;
  };
  QA.measure = (label) => {
    const D = DK.debug, w = D.world, v = D.view(), L = w.layout, sa = QA.sa();
    const bub = QA.bubbleOn() ? rectOf(document.getElementById('bubble')) : null;
    const hud = visible(document.getElementById('hud')) ? rectOf(document.getElementById('hud')) : null;
    const nimL = QA.nimArt(w), nim = lg2css(v, nimL);
    const safe = { x: sa.l, y: sa.t, w: innerWidth - sa.l - sa.r, h: innerHeight - sa.t - sa.b };
    const outside = b => b ? { left: +Math.max(0, safe.x - b.x).toFixed(1), top: +Math.max(0, safe.y - b.y).toFixed(1), right: +Math.max(0, b.x + b.w - safe.x - safe.w).toFixed(1), bottom: +Math.max(0, b.y + b.h - safe.y - safe.h).toFixed(1) } : null;
    const stones = (w.stones || []).filter(s => s.state === 'rest' || s.state === 'rise').map(s => {
      const ih = L.itemH * (s.thing && s.thing.big === false ? 0.6 : 1);
      const tb = { x: s.x - ih * 0.5, y: s.y - ih, w: ih, h: ih };   // the thing's box (bottom-centre on the stone top)
      const sb = { x: s.x - L.S / 2, y: s.y - 0.18 * L.S, w: L.S, h: 0.18 * L.S + 0.22 * L.S };
      const tc = lg2css(v, tb), sc = lg2css(v, sb);
      // local background: water samples on an ellipse around the stone (skip other stones / Nim)
      const bg = [];
      for (let a = 0; a < 16; a++) {
        const ang = a / 16 * Math.PI * 2, px = s.x + Math.cos(ang) * L.S * 0.72, py = s.y + 0.1 * L.S + Math.sin(ang) * L.S * 0.42;
        if ((w.stones || []).some(o => o !== s && o.state !== 'gone' && o.state !== 'hidden' && Math.hypot(o.x - px, (o.y - py) * 1.6) < L.S * 0.62)) continue;
        if (nimL && px > nimL.x && px < nimL.x + nimL.w && py > nimL.y && py < nimL.y + nimL.h) continue;
        const p = QA.px(px, py, 2); if (p) bg.push(p);
      }
      const behind = [];   // what is right behind the thing's upper half (water above the stone)
      for (const dx of [-0.42, 0.42]) { const p = QA.px(s.x + dx * ih * 1.25, s.y - ih * 0.55, 2); if (p) behind.push(p); }
      return { id: s.id, row: s.row, target: s.target, thing: s.thing, gold: s.gold, x: +s.x.toFixed(1), y: +s.y.toFixed(1),
        thingCss: tc, stoneCss: sc, thingPx: +(ih * v.s).toFixed(1), stonePx: +(L.S * v.s).toFixed(1),
        thingUnderBubble: ovl(tc, bub), thingUnderHud: ovl(tc, hud), thingOutsideSafe: outside(tc), stoneOutsideSafe: outside(sc),
        stoneTop: QA.px(s.x, s.y + 0.07 * L.S, 3), bg, behind };
    });
    const nearBank = L.near ? QA.px(L.near.x + L.near.w * 0.82, L.near.y + L.near.h * 0.5, 6) : null;
    const farBank = L.far ? QA.px(L.far.x + L.far.w * 0.2, L.far.y + L.far.h * 0.6, 6) : null;
    const river = L.river ? QA.px(L.river.x + L.river.w * 0.5, L.river.y + L.river.h * 0.5, 4) : null;
    const gold = (w.stones || []).filter(s => s.gold > 0.9 && s.state === 'rest').map(s => ({ id: s.id, top: QA.px(s.x, s.y + 0.07 * L.S, 3) }));
    return { label, mode: D.mode, state: w.state, phase: w.phase, level: w.level, topic: w.topic, age: w.age, lang: w.lang, W: L.W, H: L.H, s: +v.s.toFixed(4),
      viewport: [innerWidth, innerHeight], sa, insLogical: L.ins, bubble: bub, bubbleLayout: lg2css(v, L.bubble), bubbleText: (document.getElementById('bubbleText').textContent || ''),
      bubbleFs: getComputedStyle(document.getElementById('bubbleText')).fontSize, hud,
      nim, nimState: w.nim && w.nim.state, nimRow: w.nim && w.nim.onRow, nimFruits: w.nim && (w.nim.fruits || []).slice(), nimPx: nim ? +nim.h.toFixed(1) : null,
      nimUnderBubble: ovl(nim, bub), nimUnderHud: ovl(nim, hud), nimOutsideSafe: outside(nim), nimOutsideScreen: nim ? { left: +Math.max(0, -nim.x).toFixed(1), right: +Math.max(0, nim.x + nim.w - innerWidth).toFixed(1), top: +Math.max(0, -nim.y).toFixed(1), bottom: +Math.max(0, nim.y + nim.h - innerHeight).toFixed(1) } : null,
      stones, nearBank, farBank, river, gold, text: QA.textFit(), unsafe: QA.unsafeControls(),
      talkChoices: [...document.querySelectorAll('#talkChoices > button')].map(b => ({ canvas: !!b.querySelector('canvas'), text: (b.innerText || '').trim(), rect: rectOf(b) })),
      talkQ: (document.getElementById('talkQ') || {}).textContent };
  };
  // sampler over many frames: worst overlap of Nim / things with the bubble band + HUD + safe screen (logical px)
  QA.startRec = () => {
    QA.rec = { nimBubble: [], nimHud: [], nimEdge: [], thingBubble: [], thingHud: [], thingEdge: [], n: 0 };
    clearInterval(QA._iv);
    QA._iv = setInterval(() => {
      try {
        const w = DK.debug.world, L = w.layout; if (!w || !L || DK.debug.mode !== 'play') return;
        if (w.state !== 'round') return;
        QA.rec.n++;
        const n = w.nim, nb = QA.nimArt(w), B = L.bubble, H = L.hud, bubOn = QA.bubbleOn();
        const scr = { x: L.ins.left, y: L.ins.top, w: L.W - L.ins.left - L.ins.right, h: L.H - L.ins.top - L.ins.bottom };
        const tag = { lv: w.level, rd: w.round, row: n.onRow, st: n.state, k: w.cur && w.cur.k, W: L.W, H: L.H };
        if (nb && n.state !== 'air') {
          const o = ovl(nb, B); if (o) QA.rec.nimBubble.push(Object.assign({ dy: o.h, dx: o.w, bubOn }, tag));
          const oh = ovl(nb, H); if (oh) QA.rec.nimHud.push(Object.assign({ dy: oh.h, dx: oh.w }, tag));
          const e = { l: scr.x - nb.x, r: nb.x + nb.w - (scr.x + scr.w), t: scr.y - nb.y, b: nb.y + nb.h - (scr.y + scr.h) };
          const m = Math.max(e.l, e.r, e.t, e.b); if (m > 0) QA.rec.nimEdge.push(Object.assign({ e: { l: +e.l.toFixed(1), r: +e.r.toFixed(1), t: +e.t.toFixed(1), b: +e.b.toFixed(1) } }, tag));
        }
        for (const s of w.stones || []) {
          if (s.state !== 'rest') continue;
          const ih = L.itemH, tb = { x: s.x - ih / 2, y: s.y - ih, w: ih, h: ih };
          const o = ovl(tb, B); if (o) QA.rec.thingBubble.push(Object.assign({ dy: o.h, dx: o.w, id: s.id, srow: s.row }, tag));
          const oh = ovl(tb, H); if (oh) QA.rec.thingHud.push(Object.assign({ dy: oh.h, dx: oh.w, id: s.id }, tag));
          const sb = { x: s.x - L.S / 2, y: s.y - ih, w: L.S, h: ih + 0.4 * L.S };
          const e = Math.max(scr.x - sb.x, sb.x + sb.w - scr.x - scr.w, scr.y - sb.y, sb.y + sb.h - scr.y - scr.h); if (e > 0) QA.rec.thingEdge.push(Object.assign({ e: +e.toFixed(1), id: s.id }, tag));
        }
      } catch (e) { QA.recErr = String(e); }
    }, 30);
  };
  QA.stopRec = () => { clearInterval(QA._iv); const r = QA.rec || {}; const worst = (a, f) => a && a.length ? a.reduce((m, x) => (f(x) > f(m) ? x : m), a[0]) : null;
    return { samples: r.n, nimBubble: { count: (r.nimBubble || []).length, worst: worst(r.nimBubble, x => x.dy) }, nimHud: { count: (r.nimHud || []).length, worst: worst(r.nimHud, x => x.dy) },
      nimEdge: { count: (r.nimEdge || []).length, worst: worst(r.nimEdge, x => Math.max(x.e.l, x.e.r, x.e.t, x.e.b)) },
      thingBubble: { count: (r.thingBubble || []).length, worst: worst(r.thingBubble, x => x.dy) }, thingHud: { count: (r.thingHud || []).length, worst: worst(r.thingHud, x => x.dy) },
      thingEdge: { count: (r.thingEdge || []).length, worst: worst(r.thingEdge, x => x.e) }, err: QA.recErr || null }; };
})();
`;

// ---------- colour maths (sRGB → Lab, CIEDE2000, WCAG contrast) ----------
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
function lab(rgb) {
  const [r, g, b] = rgb.map(lin);
  let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047, y = r * 0.2126 + g * 0.7152 + b * 0.0722, z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
function de2000(c1, c2) {
  const [L1, a1, b1] = lab(c1), [L2, a2, b2] = lab(c2), rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2, G = 0.5 * (1 - Math.sqrt(Math.pow(Cm, 7) / (Math.pow(Cm, 7) + Math.pow(25, 7))));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G), C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (b, a) => { if (!b && !a) return 0; const v = Math.atan2(b, a) / rad; return v < 0 ? v + 360 : v; };
  const h1 = h(b1, a1p), h2 = h(b2, a2p), dL = L2 - L1, dC = C2p - C1p;
  let dh = 0; if (C1p * C2p) { dh = h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(dh / 2 * rad), Lm = (L1 + L2) / 2, Cmp = (C1p + C2p) / 2;
  let hm = h1 + h2; if (C1p * C2p) { if (Math.abs(h1 - h2) > 180) hm += (h1 + h2 < 360 ? 360 : -360); hm /= 2; }
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
  const dTh = 30 * Math.exp(-Math.pow((hm - 275) / 25, 2)), RC = 2 * Math.sqrt(Math.pow(Cmp, 7) / (Math.pow(Cmp, 7) + Math.pow(25, 7)));
  const SL = 1 + 0.015 * Math.pow(Lm - 50, 2) / Math.sqrt(20 + Math.pow(Lm - 50, 2)), SC = 1 + 0.045 * Cmp, SH = 1 + 0.015 * Cmp * T, RT = -Math.sin(2 * dTh * rad) * RC;
  return Math.sqrt(Math.pow(dL / SL, 2) + Math.pow(dC / SC, 2) + Math.pow(dH / SH, 2) + RT * (dC / SC) * (dH / SH));
}
const lum = rgb => { const [r, g, b] = rgb.map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const A = lum(a), B = lum(b); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); };
const median = arr => { if (!arr.length) return null; return [0, 1, 2].map(i => { const v = arr.map(p => p[i]).sort((x, y) => x - y); return v[v.length >> 1]; }); };
const PALETTE = { red: '#E84A4A', blue: '#3C8DE8', yellow: '#FFD23F', green: '#4CC26B', orange: '#FF9A2E', purple: '#8E44AD', pink: '#FF8FC0' };
const toHex = p => p ? '#' + p.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase() : null;

module.exports = { PAGE_JS, hex, lab, de2000, contrast, median, PALETTE, toHex };
