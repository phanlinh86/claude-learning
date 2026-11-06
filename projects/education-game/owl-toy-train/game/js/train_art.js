/* Momo's Toy Train — TT.TrainArt (character artist B), DESIGN §3 / §4.2.
 * A wooden toy train drawn by code (canvas 2D). Node-safe at load: no DOM access until a draw call.
 * All y values are canvas y (down = +); "rail level" = the rail top where wheels touch (layout.trackY).
 *
 *   drawTrack(ctx, x0, x1, trackY, scrollX)
 *       wooden rail plank (top at trackY, 12 px tall) + sleepers below it (to trackY + 20); scrollX shifts the sleepers
 *       (pass the track's travelled distance; sleeper pitch 56 px).
 *   drawEngine(ctx, E, opt, part)       origin = the engine's bottom-left at rail level (layout.engine.x0, trackY).
 *       E = engine width. Faces LEFT (chimney + headlamp at the left end), cab = x 0.42E … 1.02E (centre 0.72E; front wall 0.40E … 1.045E; wider than
 *       45 % so Momo's wings stay inside the cab wall), boiler 0.03E … 0.50E, chimney centre 0.15E.
 *       Extents: x −0.11E (buffer) … 1.07E (roof overhang); y −1.40E (whistle knob) … 0.
 *       part 'back' : chassis, buffer beam, boiler, dome, chimney, cab interior wall, cab posts, cab roof.
 *       part 'front': cab front wall + sill (y −0.62E … −0.18E, hides Momo below the waist), wheels, rods, headlamp,
 *                     whistle (+ steam when pulled), glow.
 *       opt = { wheelRot (rad, grows while travelling left), whistle 0..1 (1 = just pulled: lever down + steam),
 *               lamp 0..1 (headlamp light), glow 0..1 (golden pulse on the whistle), night 0..1 (warm cab light),
 *               t (s, optional, for pulses; default performance.now), dpr (optional) }
 *   engineGeom(E) → { cab:{x0,x1,floorY,wallY,roofY}, whistle:{x,y,r}, chimney:{x,y}, lamp:{x,y},
 *                     wheels:[{x,y,r}], hookY, box:{x0,y0,x1,y1} }   (offsets from the origin, logical px)
 *       floorY = −0.14E (= −34 at E = 240, Momo's feet); wallY = top of the cab front wall; chimney = top centre of
 *       the chimney cap; whistle = centre of the brass whistle (tap target, r = 0.14E); hookY = axle / coupling height.
 *   drawCar(ctx, car, w, h, opt, part)  origin = the car's bottom-left at rail level; body spans y −26−h … −9
 *       (top rim at −26−h as DESIGN §2), wheels (at 0.16w / 0.84w) touch y = 0. Cargo floor (layout floorY) = −26 − 0.38h.
 *       part 'back' : inner back wall (+ end posts) — draw before the cargo in the car.
 *       part 'front': front wall (top at −26 − 0.44h) with rim, sign plate / colour paint, chassis, wheels, glow.
 *       car = { label:{type:'color'|'shape'|'number'|'letter'|'text'|'home'|'size'|'parity', value, color?, showDots?},
 *               need?, filled? }   (count cars: `need` dots on the plate, the first `filled` lit)
 *       opt = { wheelRot, glow 0..1, img(name) → Image|null, t, dpr }   (shake: apply by translating before the call)
 *       label.type 'size': value 'big'|'small' — the small car is drawn at 0.8 scale about its bottom-centre.
 *       label.type 'parity': value 'odd'|'even' ("1 3 5" / "2 4 6" + paired dots).
 *   drawCoupling(ctx, x0, x1, y, stretch)  wooden bars with magnet knobs between x0 and x1 at axle height y
 *       (stretch 0..1 opens a small springy gap). Engine/car axle height = engineGeom(E).hookY / carGeom(w,h).hookY.
 *   drawCargo(ctx, item, size, opt)     origin = item CENTRE, size = S (bounding square); the visual bottom of every
 *       cargo is at y = +0.46S (sprites: +0.475S = their bottom anchor 156/160).
 *       item.kind 'block' (toy: cube|ball|cone|cylinder, color) | 'shape' (shape, color: flat wooden cut-out) |
 *       'sprite' (sprite name via opt.img) | 'letter' | 'number' | 'text' (ABC cube, glyph = item.text ?? item.value,
 *       painted panel in item.color) | 'size' (a block toy at item.scale or value 'big' 1 / 'small' 0.68).
 *       opt = { glow 0..1, dpr, img(name), shadow (bool), squash {sx, sy} (about the bottom point), t }
 *   drawGhostHand(ctx, size, t)         friendly pointing hand, origin = fingertip (finger points UP), t = 0..1 phase
 *                                       (any number works: fractional part used; press at the ends, ring at start)
 *   drawGlow(ctx, w, h, t, strength)    soft golden halo around a w×h ellipse centred at the origin (t = seconds)
 *   drawTunnel(ctx, x, trackY, h, part) toy-block tunnel; x = layout.tunnelX, h = the height it must hide (≥ engine
 *       height 1.40E). The near wall ('front') spans x − 0.40h … x + 0.20h, 0 … h above the rail, block toppers rise to
 *       1.24h. 'back' = far wall peeking out to x + 0.42h + dark opening — draw it before the train, 'front' after.
 *   Helpers (also exported): carGeom(w,h) → { yTop, yFront, yBottom, floorY, wheelR, hookY, plate:{x,y,w,h} },
 *       tunnelGeom(h) → { x0, x1, top } (offsets from x / trackY), shapePath(ctx, shape, r), cargoBox(item, S),
 *       COLORS (TT.PALETTE || DESIGN palette), WOOD, FONT, clearCache().
 *   Static parts are cached in offscreen canvases per (key, size, dpr) when `document` exists; never in node.
 */
(function (TT) {
  'use strict';

  // ---------------------------------------------------------------- colours
  var FALLBACK_PALETTE = {
    red:    { base: '#E84A4A', dark: '#A8282E', light: '#F7A0A0' },
    blue:   { base: '#3C8DE8', dark: '#1F5BA8', light: '#A6CCF5' },
    yellow: { base: '#FFD23F', dark: '#C99A12', light: '#FFEB9C' },
    green:  { base: '#4CC26B', dark: '#2A8343', light: '#A8E6B8' },
    orange: { base: '#FF9A2E', dark: '#C4650C', light: '#FFCB8E' },
    purple: { base: '#8E44AD', dark: '#6840A8', light: '#D2BDF3' },
    pink:   { base: '#FF8FC0', dark: '#C9558A', light: '#FFCCE2' }
  };
  function palette() { return TT.PALETTE || FALLBACK_PALETTE; }
  function pal(c) {
    var P = palette(), p = (P && P[c]) || FALLBACK_PALETTE[c];
    if (p && p.base) return { base: p.base, dark: p.dark || mix(p.base, '#000000', 0.35), light: p.light || mix(p.base, '#FFFFFF', 0.45) };
    if (typeof c === 'string' && c[0] === '#' && c.length === 7) return { base: c, dark: mix(c, '#000000', 0.35), light: mix(c, '#FFFFFF', 0.45) };
    return null;
  }

  var ENG = { wood: '#E3BE88', shade: '#B98E57', line: '#7A5530', boiler: '#6F86A6', boilerDk: '#4C607E', chimney: '#56607A',
              roof: '#F4EBDD', lamp: '#FFE7A3', brass: '#E2B24C', brassDk: '#A9822F', wheel: '#56607A', wheelDk: '#373E52',
              hub: '#F4EBDD' };
  var WOOD = { base: '#E7C590', rim: '#A8743F', dark: '#7E5530', light: '#F5DFB6', inner: '#C99C64' };
  var PLATE = '#FFF6E4', PLATE_LINE = '#C79A62', INK = '#5A3A22';
  var RAIL = { top: '#D9B27E', hi: '#EDCD9E', groove: '#A9824F', sleeper: '#B88A55', sleeperDk: '#8A6438', line: '#8E673C' };
  var FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif';

  // ---------------------------------------------------------------- helpers
  function rgb(h) { h = String(h).replace('#', ''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
  function mix(a, b, t) {
    var A = rgb(a), B = rgb(b), o = '#';
    for (var i = 0; i < 3; i++) { var v = Math.round(A[i] + (B[i] - A[i]) * t); o += (v < 16 ? '0' : '') + v.toString(16); }
    return o.toUpperCase();
  }
  function rgba(h, a) { var c = rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (+a).toFixed(3) + ')'; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function clamp01(v) { v = +v || 0; return v < 0 ? 0 : v > 1 ? 1 : v; }
  function nowSec() { return (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000; }
  function rr(ctx, x, y, w, h, r) {           // rounded-rect sub-path (no beginPath)
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
  }
  function rrPath(x, y, w, h, r) { return function (ctx) { ctx.beginPath(); rr(ctx, x, y, w, h, r); }; }

  /* One painted toy part: fill + one-step cel shade (lower-right crescent) + soft highlight + outline.
     path(ctx) builds the path; c = { base, dark, line?, shade? }; o = { lw, off:[dx,dy], hl:[cx,cy,rx,ry,rot], inner(ctx), shadeT } */
  function part(ctx, path, c, o) {
    o = o || {};
    var off = o.off || [-3, -4], shade = c.shade || mix(c.base, c.dark, o.shadeT == null ? 0.32 : o.shadeT);
    ctx.save();
    path(ctx); ctx.fillStyle = shade; ctx.fill();
    ctx.clip();
    ctx.save(); ctx.translate(off[0], off[1]); path(ctx); ctx.fillStyle = c.base; ctx.fill(); ctx.restore();
    if (o.inner) o.inner(ctx);
    if (o.hl) {
      ctx.fillStyle = 'rgba(255,255,255,' + (o.hlA || 0.45) + ')';
      ctx.beginPath(); ctx.ellipse(o.hl[0], o.hl[1], o.hl[2], o.hl[3], o.hl[4] || 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    if (o.lw !== 0) {
      path(ctx); ctx.lineJoin = 'round'; ctx.lineWidth = o.lw || 3; ctx.strokeStyle = c.line || c.dark; ctx.stroke();
    }
  }
  // faint wood grain: wavy lines across a box (call inside a clip)
  function grain(ctx, x0, y0, w, h, col, n, seed, alpha) {
    ctx.save();
    ctx.strokeStyle = rgba(col, alpha == null ? 0.22 : alpha); ctx.lineWidth = clamp(h / (n * 6), 1, 2.4); ctx.lineCap = 'round';
    for (var i = 0; i < n; i++) {
      var y = y0 + h * (i + 0.5) / n + Math.sin(seed * 3.1 + i * 1.7) * h / (n * 4);
      var a = Math.min(4, h / (n * 5)), ph = seed + i * 2.3;
      ctx.beginPath();
      ctx.moveTo(x0 + w * 0.06, y);
      ctx.bezierCurveTo(x0 + w * 0.3, y - a * Math.sin(ph), x0 + w * 0.6, y + a * Math.cos(ph), x0 + w * (0.82 + 0.1 * Math.sin(ph)), y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- cache
  var cache = {}, cacheN = 0, MAX_CACHE = 160;
  function hasDoc() { return typeof document !== 'undefined' && !!document.createElement; }
  function makeCanvas(w, h) {
    try { var c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; } catch (e) { return null; }
  }
  function dprOf(ctx, opt) {
    var d = opt && opt.dpr;
    if (!d) {
      try { var m = ctx.getTransform(); d = Math.sqrt(m.a * m.a + m.b * m.b); } catch (e) { d = 0; }
      if (!d && typeof window !== 'undefined') d = window.devicePixelRatio || 1;
    }
    return clamp(Math.round((d || 1) * 4) / 4, 0.5, 4);
  }
  /* Draw `paint(g)` (which draws relative to the origin) through a cached bitmap covering box (bx, by, bw, bh).
     Falls back to direct painting when there is no document (node) or no canvas. */
  function cached(ctx, key, bx, by, bw, bh, dpr, paint) {
    if (!hasDoc()) { paint(ctx); return; }
    key += '@' + dpr;
    var e = cache[key];
    if (!e) {
      var cv = makeCanvas(Math.ceil(bw * dpr), Math.ceil(bh * dpr));
      if (!cv) { paint(ctx); return; }
      var g = cv.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, -bx * dpr, -by * dpr);
      paint(g);
      if (cacheN >= MAX_CACHE) { cache = {}; cacheN = 0; }
      e = cache[key] = { cv: cv }; cacheN++;
    }
    ctx.drawImage(e.cv, bx, by, Math.ceil(bw * dpr) / dpr, Math.ceil(bh * dpr) / dpr);
  }
  function imgReady(img) {
    return !!img && (img.complete === undefined || img.complete) && (img.naturalWidth === undefined || img.naturalWidth > 0);
  }
  function getImg(opt, name) {
    if (!opt || typeof opt.img !== 'function') return null;
    var im = null;
    try { im = opt.img(name); } catch (e) { im = null; }
    return imgReady(im) ? im : null;
  }

  // ---------------------------------------------------------------- shapes
  function shapePath(ctx, shape, r) {
    var i, a;
    ctx.beginPath();
    switch (shape) {
      case 'circle': ctx.arc(0, 0, r, 0, Math.PI * 2); break;
      case 'square': rr(ctx, -r * 0.86, -r * 0.86, r * 1.72, r * 1.72, r * 0.16); break;
      case 'rect': rr(ctx, -r * 1.2, -r * 0.6, r * 2.4, r * 1.2, r * 0.14); break;
      case 'oval': ctx.ellipse(0, 0, r * 1.22, r * 0.72, 0, 0, Math.PI * 2); break;
      case 'diamond':
        ctx.moveTo(0, -r * 1.1); ctx.lineTo(r * 0.8, 0); ctx.lineTo(0, r * 1.1); ctx.lineTo(-r * 0.8, 0); ctx.closePath(); break;
      case 'triangle':
        ctx.moveTo(0, -r * 1.02); ctx.lineTo(r * 1.1, r * 0.86); ctx.lineTo(-r * 1.1, r * 0.86); ctx.closePath(); break;
      case 'star':
        for (i = 0; i < 10; i++) {
          a = -Math.PI / 2 + i * Math.PI / 5;
          var q = i % 2 ? r * 0.5 : r * 1.1;
          if (i) ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q + r * 0.08); else ctx.moveTo(Math.cos(a) * q, Math.sin(a) * q + r * 0.08);
        }
        ctx.closePath(); break;
      case 'heart':
        ctx.moveTo(0, r * 1.0);
        ctx.bezierCurveTo(-r * 0.35, r * 0.68, -r * 1.12, r * 0.22, -r * 1.06, -r * 0.34);
        ctx.bezierCurveTo(-r * 1.0, -r * 0.92, -r * 0.24, -r * 1.06, 0, -r * 0.5);
        ctx.bezierCurveTo(r * 0.24, -r * 1.06, r * 1.0, -r * 0.92, r * 1.06, -r * 0.34);
        ctx.bezierCurveTo(r * 1.12, r * 0.22, r * 0.35, r * 0.68, 0, r * 1.0);
        ctx.closePath(); break;
      default: ctx.arc(0, 0, r, 0, Math.PI * 2);
    }
  }
  // painted flat shape (sign plates): colour fill, shade, highlight, dark outline
  function drawShape(ctx, shape, r, c, lw) {
    part(ctx, function (g) { shapePath(g, shape, r); }, { base: c.base, dark: c.dark },
      { lw: lw, off: [-r * 0.08, -r * 0.1], hl: [-r * 0.38, -r * 0.42, r * 0.3, r * 0.14, -0.6] });
  }

  // ---------------------------------------------------------------- dots
  function dot(ctx, x, y, r, col, line) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    if (line) { ctx.lineWidth = Math.max(1.2, r * 0.22); ctx.strokeStyle = line; ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.32, r * 0.32, 0, Math.PI * 2); ctx.fill();
  }
  // up to 2 rows; litN == null → plain ink dots; else first litN golden (lit), others empty rings
  function dotRows(ctx, n, cx, cy, maxW, maxH, litN) {
    n = Math.max(0, Math.min(12, n | 0)); if (!n) return;
    var per = n > 5 ? Math.ceil(n / 2) : n, rows = n > 5 ? 2 : 1;
    var r = Math.min(maxW / (per * 2.7), maxH / (rows * 2.7)), gap = r * 2.7, k = 0;
    for (var row = 0; row < rows; row++) {
      var cnt = row ? n - per : per, y = cy + (rows > 1 ? (row - 0.5) * r * 2.6 : 0);
      for (var i = 0; i < cnt; i++, k++) {
        var x = cx + (i - (cnt - 1) / 2) * gap;
        if (litN == null) { dot(ctx, x, y, r, INK); continue; }
        if (k < litN) {
          var gl = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 1.9);
          gl.addColorStop(0, 'rgba(255,206,64,0.7)'); gl.addColorStop(1, 'rgba(255,206,64,0)');
          ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, r * 1.9, 0, Math.PI * 2); ctx.fill();
          dot(ctx, x, y, r, '#FFC21C', '#B9790A');
        } else {
          ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(x, y, r * 0.92, 0, Math.PI * 2); ctx.fill();
          ctx.lineWidth = Math.max(1.4, r * 0.26); ctx.strokeStyle = rgba(INK, 0.5); ctx.stroke();
        }
      }
    }
  }

  // ---------------------------------------------------------------- text
  function glyph(ctx, txt, cx, cy, maxH, maxW, fill, line) {
    txt = String(txt);
    var fs = maxH;
    ctx.font = 'bold ' + Math.round(fs) + 'px ' + FONT;
    var w = ctx.measureText(txt).width;
    if (w > maxW) { fs = Math.max(6, Math.floor(fs * maxW / w)); ctx.font = 'bold ' + fs + 'px ' + FONT; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var y = cy + fs * 0.06;
    ctx.lineJoin = 'round';
    if (line) { ctx.lineWidth = Math.max(2, fs * 0.16); ctx.strokeStyle = line; ctx.strokeText(txt, cx, y); }
    ctx.lineWidth = Math.max(1, fs * 0.05); ctx.strokeStyle = fill; ctx.strokeText(txt, cx, y);   // a touch bolder
    ctx.fillStyle = fill; ctx.fillText(txt, cx, y);
  }

  // ================================================================= TRACK
  function drawTrack(ctx, x0, x1, trackY, scrollX) {
    var P = 56, sw = 30;
    ctx.save();
    // soft floor shadow
    ctx.fillStyle = 'rgba(70,45,20,0.16)';
    ctx.beginPath(); rr(ctx, x0, trackY + 8, x1 - x0, 16, 8); ctx.fill();
    // sleepers
    var off = ((-(scrollX || 0)) % P + P) % P;
    for (var x = x0 - P + off; x < x1 + P; x += P) {
      ctx.beginPath(); rr(ctx, x - sw / 2, trackY + 4, sw, 16, 5);
      ctx.fillStyle = RAIL.sleeper; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = RAIL.sleeperDk; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(x - sw / 2 + 4, trackY + 13, sw - 8, 2.5);
    }
    // rail plank
    ctx.beginPath(); rr(ctx, x0 - 6, trackY - 1, x1 - x0 + 12, 12, 4);
    ctx.fillStyle = RAIL.top; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = RAIL.line; ctx.stroke();
    ctx.fillStyle = RAIL.hi; ctx.fillRect(x0, trackY + 0.5, x1 - x0, 2.5);
    ctx.fillStyle = rgba(RAIL.groove, 0.85); ctx.fillRect(x0, trackY + 5, x1 - x0, 2.2);
    ctx.restore();
  }

  // ================================================================= ENGINE
  function engineGeom(E) {
    var wr = 0.105 * E;
    var wheels = [0.14, 0.35, 0.63, 0.86].map(function (f) { return { x: f * E, y: -wr, r: wr }; });
    return {
      cab: { x0: 0.42 * E, x1: 1.02 * E, floorY: -0.14 * E, wallY: -0.60 * E, roofY: -1.10 * E },
      whistle: { x: 0.76 * E, y: -1.295 * E, r: 0.14 * E },
      chimney: { x: 0.15 * E, y: -0.985 * E },
      lamp: { x: 0.055 * E, y: -0.64 * E },
      wheels: wheels, hookY: -wr,
      box: { x0: -0.11 * E, y0: -1.40 * E, x1: 1.07 * E, y1: 0 }
    };
  }

  // Engine layout (fractions of E): boiler 0.03–0.50, chimney centre 0.15, dome 0.30, cab 0.42–1.02 (wall), roof 0.38–1.06.
  function engineBack(g, E) {
    var lw = Math.max(2, E * 0.014), L = ENG.line, wood = { base: ENG.wood, dark: ENG.shade, line: L };
    var u = E;
    // cab interior wall (far side) + posts + roof
    part(g, rrPath(0.45 * u, -1.12 * u, 0.54 * u, 0.66 * u, 0.02 * u), { base: mix(ENG.shade, ENG.wood, 0.25), dark: ENG.shade, line: L },
      { lw: lw, off: [0, 0], inner: function (c) {
        c.strokeStyle = rgba(L, 0.25); c.lineWidth = Math.max(1, E * 0.006);
        for (var i = 1; i < 6; i++) { var x = (0.45 + 0.54 * i / 6) * u; c.beginPath(); c.moveTo(x, -1.1 * u); c.lineTo(x, -0.46 * u); c.stroke(); }
        var sg = c.createLinearGradient(0, -1.12 * u, 0, -0.9 * u);
        sg.addColorStop(0, 'rgba(90,60,30,0.45)'); sg.addColorStop(1, 'rgba(90,60,30,0)');
        c.fillStyle = sg; c.fillRect(0.44 * u, -1.12 * u, 0.56 * u, 0.22 * u);
      } });
    [0.415, 0.955].forEach(function (x0) {
      part(g, rrPath(x0 * u, -1.13 * u, 0.065 * u, 0.6 * u, 0.025 * u), wood,
        { lw: lw, off: [-0.012 * u, 0], hl: [(x0 + 0.02) * u, -1.0 * u, 0.008 * u, 0.08 * u] });
    });
    // roof (cream, gently arched, overhanging)
    var roof = function (c) {
      c.beginPath();
      c.moveTo(0.375 * u, -1.09 * u); c.lineTo(0.375 * u, -1.155 * u);
      c.quadraticCurveTo(0.72 * u, -1.245 * u, 1.065 * u, -1.155 * u);
      c.lineTo(1.065 * u, -1.09 * u);
      c.quadraticCurveTo(1.065 * u, -1.07 * u, 1.045 * u, -1.07 * u);
      c.lineTo(0.395 * u, -1.07 * u); c.quadraticCurveTo(0.375 * u, -1.07 * u, 0.375 * u, -1.09 * u); c.closePath();
    };
    part(g, roof, { base: ENG.roof, dark: '#CDBFA6', line: mix(ENG.roof, L, 0.7) },
      { lw: lw, off: [0, -0.02 * u], hl: [0.56 * u, -1.175 * u, 0.12 * u, 0.012 * u, -0.06] });
    // chassis slab
    part(g, rrPath(-0.02 * u, -0.33 * u, 1.03 * u, 0.17 * u, 0.045 * u), wood,
      { lw: lw, hl: [0.22 * u, -0.305 * u, 0.16 * u, 0.012 * u],
        inner: function (c) { grain(c, -0.02 * u, -0.33 * u, 1.03 * u, 0.17 * u, ENG.line, 3, 1.3, 0.2); } });
    // buffer beam + round buffer (front, left)
    part(g, rrPath(-0.065 * u, -0.35 * u, 0.1 * u, 0.22 * u, 0.03 * u), wood, { lw: lw, off: [-0.01 * u, -0.01 * u] });
    part(g, rrPath(-0.105 * u, -0.285 * u, 0.05 * u, 0.09 * u, 0.02 * u), { base: ENG.chimney, dark: ENG.wheelDk },
      { lw: lw * 0.8, off: [0, -0.01 * u] });
    g.fillStyle = ENG.hub; g.beginPath(); g.ellipse(-0.1 * u, -0.24 * u, 0.012 * u, 0.03 * u, 0, 0, Math.PI * 2); g.fill();
    // a friendly painted smile on the buffer beam
    g.strokeStyle = rgba(L, 0.75); g.lineWidth = Math.max(1.5, 0.009 * u); g.lineCap = 'round';
    g.beginPath(); g.arc(-0.015 * u, -0.265 * u, 0.028 * u, 0.35, Math.PI - 0.35); g.stroke();
    // boiler (slate-blue capsule) with brass bands
    var bx0 = 0.03 * u, by0 = -0.6 * u, bw = 0.47 * u, bh = 0.28 * u;
    part(g, rrPath(bx0, by0, bw, bh, 0.125 * u), { base: ENG.boiler, dark: ENG.boilerDk, line: mix(ENG.boilerDk, '#000000', 0.15) },
      { lw: lw, off: [-0.015 * u, -0.03 * u], hl: [0.22 * u, -0.56 * u, 0.14 * u, 0.018 * u],
        inner: function (c) {
          [0.11, 0.25, 0.39].forEach(function (f, i) {
            var x = f * u, w = 0.032 * u;
            c.fillStyle = i ? ENG.brass : mix(ENG.boiler, ENG.boilerDk, 0.5); c.fillRect(x, by0, w, bh);
            c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(x + w * 0.2, by0, w * 0.25, bh);
            c.strokeStyle = i ? ENG.brassDk : ENG.boilerDk; c.lineWidth = Math.max(1, lw * 0.5);
            c.strokeRect(x, by0, w, bh);
          });
        } });
    // dome
    part(g, function (c) {
      c.beginPath(); c.moveTo(0.25 * u, -0.59 * u);
      c.bezierCurveTo(0.25 * u, -0.71 * u, 0.37 * u, -0.71 * u, 0.37 * u, -0.59 * u); c.closePath();
    }, wood, { lw: lw, off: [-0.01 * u, -0.012 * u], hl: [0.29 * u, -0.655 * u, 0.018 * u, 0.012 * u, -0.5] });
    // chimney: slate stack + flared cap
    part(g, function (c) {
      c.beginPath(); c.moveTo(0.105 * u, -0.585 * u); c.lineTo(0.115 * u, -0.9 * u); c.lineTo(0.185 * u, -0.9 * u); c.lineTo(0.195 * u, -0.585 * u); c.closePath();
    }, { base: ENG.chimney, dark: ENG.wheelDk }, { lw: lw, off: [-0.012 * u, 0], hl: [0.13 * u, -0.75 * u, 0.008 * u, 0.1 * u] });
    part(g, function (c) {
      c.beginPath(); c.moveTo(0.09 * u, -0.885 * u); c.lineTo(0.07 * u, -0.965 * u);
      c.quadraticCurveTo(0.07 * u, -0.985 * u, 0.09 * u, -0.985 * u); c.lineTo(0.21 * u, -0.985 * u);
      c.quadraticCurveTo(0.23 * u, -0.985 * u, 0.23 * u, -0.965 * u); c.lineTo(0.21 * u, -0.885 * u); c.closePath();
    }, { base: mix(ENG.chimney, '#FFFFFF', 0.12), dark: ENG.wheelDk }, { lw: lw, off: [-0.01 * u, -0.012 * u],
      hl: [0.11 * u, -0.955 * u, 0.025 * u, 0.008 * u] });
    g.fillStyle = '#2E3344'; g.beginPath(); g.ellipse(0.15 * u, -0.978 * u, 0.06 * u, 0.008 * u, 0, 0, Math.PI * 2); g.fill();
  }

  function engineFront(g, E) {
    var lw = Math.max(2, E * 0.014), L = ENG.line, wood = { base: ENG.wood, dark: ENG.shade, line: L }, u = E;
    // cab front wall (wide + low enough to hide Momo below the waist) with an inset panel
    part(g, rrPath(0.4 * u, -0.6 * u, 0.645 * u, 0.42 * u, 0.045 * u), wood,
      { lw: lw, hl: [0.53 * u, -0.535 * u, 0.07 * u, 0.012 * u],
        inner: function (c) { grain(c, 0.405 * u, -0.56 * u, 0.62 * u, 0.36 * u, L, 4, 4.1, 0.2); } });
    g.beginPath(); rr(g, 0.47 * u, -0.5 * u, 0.5 * u, 0.2 * u, 0.035 * u);
    g.lineWidth = Math.max(1.2, lw * 0.55); g.strokeStyle = rgba(L, 0.55); g.stroke();
    g.fillStyle = rgba('#FFFFFF', 0.18); g.fill();
    // painted cream star badge on the panel (Momo's engine mark)
    g.save(); g.translate(0.72 * u, -0.4 * u);
    shapePath(g, 'star', 0.055 * u); g.fillStyle = ENG.roof; g.fill(); g.lineWidth = Math.max(1, lw * 0.5); g.strokeStyle = mix(ENG.roof, L, 0.6); g.stroke();
    g.restore();
    // sill (rounded rim on top of the wall)
    part(g, rrPath(0.385 * u, -0.625 * u, 0.675 * u, 0.055 * u, 0.027 * u), { base: mix(ENG.wood, '#FFFFFF', 0.18), dark: ENG.shade, line: L },
      { lw: lw, off: [0, -0.012 * u], hl: [0.6 * u, -0.61 * u, 0.16 * u, 0.006 * u] });
    // bolts
    g.fillStyle = ENG.roof;
    [[0.43, -0.24], [1.015, -0.24], [0.43, -0.55], [1.015, -0.55]].forEach(function (p) {
      g.beginPath(); g.arc(p[0] * u, p[1] * u, 0.011 * u, 0, Math.PI * 2); g.fill();
    });
    // lamp housing (slate box on the boiler front, lens faces left)
    part(g, rrPath(0.06 * u, -0.69 * u, 0.09 * u, 0.1 * u, 0.02 * u), { base: ENG.chimney, dark: ENG.wheelDk },
      { lw: lw, off: [-0.01 * u, -0.01 * u] });
    part(g, rrPath(0.075 * u, -0.72 * u, 0.06 * u, 0.034 * u, 0.012 * u), { base: mix(ENG.chimney, '#FFFFFF', 0.15), dark: ENG.wheelDk },
      { lw: lw * 0.8, off: [0, 0] });
    // piston cylinder (front, behind the rods)
    part(g, rrPath(-0.03 * u, -0.17 * u, 0.13 * u, 0.09 * u, 0.03 * u), { base: ENG.chimney, dark: ENG.wheelDk },
      { lw: lw, off: [0, -0.01 * u], hl: [0.02 * u, -0.155 * u, 0.03 * u, 0.006 * u] });
  }

  function wheel(ctx, x, y, r, ang, lw, col, dk) {
    ctx.save(); ctx.translate(x, y);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = dk; ctx.stroke();
    // tyre ring + highlight
    ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2); ctx.lineWidth = Math.max(1, r * 0.06); ctx.strokeStyle = rgba('#FFFFFF', 0.18); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.88, Math.PI * 1.05, Math.PI * 1.45); ctx.lineWidth = Math.max(1, r * 0.1); ctx.strokeStyle = rgba('#FFFFFF', 0.3); ctx.lineCap = 'round'; ctx.stroke();
    ctx.rotate(ang);
    // three spoke holes (show rotation)
    ctx.fillStyle = rgba(dk, 0.9);
    for (var i = 0; i < 3; i++) {
      var a = i * Math.PI * 2 / 3 + Math.PI / 3;
      ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.13, 0, Math.PI * 2); ctx.fill();
    }
    // cream hub
    ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.fillStyle = ENG.hub; ctx.fill();
    ctx.lineWidth = Math.max(1, lw * 0.6); ctx.strokeStyle = mix(ENG.hub, dk, 0.5); ctx.stroke();
    ctx.restore();
  }

  function drawWhistle(ctx, E, pull, glow, t) {
    var u = E, lw = Math.max(2, E * 0.014), G = engineGeom(E).whistle;
    var x = G.x, base = -1.185 * u, sq = 1 - 0.08 * pull;
    if (glow > 0) { ctx.save(); ctx.translate(G.x, G.y); drawGlow(ctx, G.r * 1.6, G.r * 1.9, t, glow); ctx.restore(); }
    // stand pipe
    part(ctx, rrPath(x - 0.018 * u, base - 0.05 * u, 0.036 * u, 0.06 * u, 0.008 * u), { base: ENG.brassDk, dark: mix(ENG.brassDk, '#000000', 0.3) }, { lw: lw * 0.7, off: [0, 0] });
    ctx.save(); ctx.translate(x, base - 0.05 * u); ctx.scale(1, sq);
    // bell
    var bw = 0.085 * u, bh = 0.15 * u;
    part(ctx, function (c) {
      c.beginPath(); c.moveTo(-bw / 2, 0); c.lineTo(-bw / 2, -bh * 0.78);
      c.quadraticCurveTo(-bw / 2, -bh, 0, -bh); c.quadraticCurveTo(bw / 2, -bh, bw / 2, -bh * 0.78);
      c.lineTo(bw / 2, 0); c.closePath();
    }, { base: ENG.brass, dark: ENG.brassDk }, { lw: lw, off: [-0.012 * u, -0.01 * u], hl: [-bw * 0.2, -bh * 0.55, bw * 0.12, bh * 0.28] });
    // mouth slot + rings
    ctx.fillStyle = '#5E4518'; ctx.beginPath(); rr(ctx, -bw * 0.32, -bh * 0.32, bw * 0.64, bh * 0.1, bh * 0.05); ctx.fill();
    ctx.strokeStyle = ENG.brassDk; ctx.lineWidth = Math.max(1, lw * 0.5);
    ctx.beginPath(); ctx.moveTo(-bw / 2, -bh * 0.1); ctx.lineTo(bw / 2, -bh * 0.1); ctx.stroke();
    // knob on top
    ctx.beginPath(); ctx.arc(0, -bh - 0.018 * u, 0.022 * u, 0, Math.PI * 2);
    ctx.fillStyle = mix(ENG.brass, '#FFFFFF', 0.25); ctx.fill(); ctx.lineWidth = lw * 0.7; ctx.strokeStyle = ENG.brassDk; ctx.stroke();
    ctx.restore();
    // lever arm (pivot on the bell's right, pulled down by the cord)
    var px = x + bw / 2, py = base - 0.05 * u - bh * 0.62 * sq, len = 0.085 * u, a = 0.12 + 0.55 * pull;
    var tx = px + Math.cos(a) * len, ty = py + Math.sin(a) * len;
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = ENG.brassDk; ctx.lineWidth = 0.03 * u; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.strokeStyle = ENG.brass; ctx.lineWidth = 0.016 * u; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(tx, ty); ctx.stroke();
    // cord down through the roof (Momo's whistle frame holds the rest of it)
    ctx.strokeStyle = '#F4EBDD'; ctx.lineWidth = Math.max(1.5, 0.012 * u);
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(tx + 0.004 * u, (ty - 1.2 * u) / 2, tx, -1.2 * u); ctx.stroke();
    ctx.strokeStyle = rgba(ENG.line, 0.6); ctx.lineWidth = Math.max(1, 0.004 * u);
    ctx.beginPath(); ctx.moveTo(tx - 0.006 * u, ty); ctx.lineTo(tx - 0.006 * u, -1.2 * u); ctx.stroke();
    ctx.fillStyle = ENG.brass; ctx.beginPath(); ctx.arc(px, py, 0.016 * u, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = lw * 0.6; ctx.strokeStyle = ENG.brassDk; ctx.stroke();
    ctx.restore();
    // steam: puffs rising from the mouth while pulled
    if (pull > 0.02) {
      var ph = 1 - pull, top = base - 0.05 * u - bh * 0.3;
      ctx.save();
      for (var i = 0; i < 4; i++) {
        var k = clamp01(ph * 1.15 + i * 0.22), s = (0.035 + 0.06 * k) * u;
        var sx = x - 0.05 * u - k * 0.11 * u - i * 0.012 * u, sy = top - k * 0.2 * u - i * 0.03 * u;
        var al = (0.95 - 0.55 * k) * Math.min(1, pull * 2.5);
        ctx.fillStyle = 'rgba(255,255,255,' + al.toFixed(3) + ')';
        ctx.strokeStyle = 'rgba(176,186,204,' + (al * 0.8).toFixed(3) + ')'; ctx.lineWidth = Math.max(1, 0.008 * u);
        ctx.beginPath(); ctx.arc(sx, sy, s, 0, Math.PI * 2); ctx.arc(sx + s * 0.8, sy + s * 0.25, s * 0.72, 0, Math.PI * 2);
        ctx.arc(sx - s * 0.7, sy + s * 0.3, s * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      // a little "toot" burst of lines
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * pull).toFixed(3) + ')'; ctx.lineWidth = Math.max(1.5, 0.012 * u); ctx.lineCap = 'round';
      for (var j = -1; j <= 1; j++) {
        var aa = Math.PI + j * 0.45, r0 = 0.07 * u, r1 = r0 + 0.06 * u * pull;
        ctx.beginPath(); ctx.moveTo(x - bw / 2 + Math.cos(aa) * r0, top + Math.sin(aa) * r0);
        ctx.lineTo(x - bw / 2 + Math.cos(aa) * r1, top + Math.sin(aa) * r1); ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawLamp(ctx, E, lamp, t) {
    var G = engineGeom(E).lamp, u = E;
    lamp = clamp01(lamp);
    // lens
    ctx.save();
    ctx.beginPath(); ctx.ellipse(G.x, G.y, 0.024 * u, 0.042 * u, 0, 0, Math.PI * 2);
    ctx.fillStyle = lamp > 0 ? mix(ENG.lamp, '#FFFFFF', 0.3 * lamp) : mix(ENG.lamp, '#C9B37A', 0.35); ctx.fill();
    ctx.lineWidth = Math.max(1.5, 0.01 * u); ctx.strokeStyle = ENG.brassDk; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(G.x - 0.006 * u, G.y - 0.016 * u, 0.007 * u, 0.012 * u, 0, 0, Math.PI * 2); ctx.fill();
    if (lamp > 0.01) {
      var fl = 0.94 + 0.06 * Math.sin((t || 0) * 7);
      ctx.globalCompositeOperation = 'lighter';
      var R = 0.3 * u, gl = ctx.createRadialGradient(G.x, G.y, 0.01 * u, G.x, G.y, R);
      gl.addColorStop(0, 'rgba(255,236,170,' + (0.75 * lamp * fl).toFixed(3) + ')');
      gl.addColorStop(0.35, 'rgba(255,214,120,' + (0.28 * lamp * fl).toFixed(3) + ')');
      gl.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(G.x, G.y, R, 0, Math.PI * 2); ctx.fill();
      // forward beam (to the left)
      var bl = ctx.createLinearGradient(G.x, 0, G.x - 0.9 * u, 0);
      bl.addColorStop(0, 'rgba(255,232,160,' + (0.32 * lamp).toFixed(3) + ')'); bl.addColorStop(1, 'rgba(255,232,160,0)');
      ctx.fillStyle = bl;
      ctx.beginPath(); ctx.moveTo(G.x, G.y - 0.035 * u); ctx.lineTo(G.x - 0.9 * u, G.y - 0.2 * u); ctx.lineTo(G.x - 0.9 * u, G.y + 0.3 * u); ctx.lineTo(G.x, G.y + 0.035 * u); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawEngine(ctx, E, opt, part_) {
    opt = opt || {};
    var dpr = dprOf(ctx, opt), u = E, lw = Math.max(2, E * 0.014), t = opt.t != null ? opt.t : nowSec();
    var Ek = Math.round(E * 4) / 4;
    if (part_ === 'back') {
      cached(ctx, 'eb|' + Ek, -0.13 * u, -1.27 * u, 1.22 * u, 1.16 * u, dpr, function (g) { engineBack(g, E); });
      var night = clamp01(opt.night);
      if (night > 0.01) {   // warm cab light
        ctx.save();
        ctx.beginPath(); ctx.rect(0.46 * u, -1.1 * u, 0.52 * u, 0.6 * u); ctx.clip();
        var gl = ctx.createRadialGradient(0.72 * u, -0.92 * u, 0.02 * u, 0.72 * u, -0.85 * u, 0.48 * u);
        gl.addColorStop(0, 'rgba(255,214,140,' + (0.65 * night).toFixed(3) + ')'); gl.addColorStop(1, 'rgba(255,190,110,' + (0.12 * night).toFixed(3) + ')');
        ctx.fillStyle = gl; ctx.fillRect(0.46 * u, -1.1 * u, 0.52 * u, 0.6 * u);
        ctx.restore();
        // tiny cab lantern hanging under the roof
        ctx.save(); ctx.translate(0.5 * u, -1.05 * u);
        ctx.fillStyle = '#FFE7A3'; ctx.strokeStyle = ENG.brassDk; ctx.lineWidth = Math.max(1, lw * 0.6);
        ctx.beginPath(); rr(ctx, -0.013 * u, 0, 0.026 * u, 0.04 * u, 0.008 * u); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      return;
    }
    // ---- front
    cached(ctx, 'ef|' + Ek, -0.06 * u, -0.75 * u, 1.14 * u, 0.7 * u, dpr, function (g) { engineFront(g, E); });
    var G = engineGeom(E), ang = -(opt.wheelRot || 0);
    G.wheels.forEach(function (w, i) { wheel(ctx, w.x, w.y, w.r, ang + i * 0.0, lw, ENG.wheel, ENG.wheelDk); });
    // coupling rod linking the crank pins (all in phase) + drive rod to the piston crosshead
    var pr = G.wheels[0].r * 0.55, ox = Math.cos(ang + Math.PI / 3) * pr, oy = Math.sin(ang + Math.PI / 3) * pr;
    var p0 = { x: G.wheels[0].x + ox, y: G.wheels[0].y + oy }, p3 = { x: G.wheels[3].x + ox, y: G.wheels[3].y + oy };
    var p1 = { x: G.wheels[1].x + ox, y: G.wheels[1].y + oy };
    var cxh = p1.x - 0.34 * u, cyh = -0.125 * u;
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = ENG.line; ctx.lineWidth = 0.034 * u;
    ctx.beginPath(); ctx.moveTo(cxh, cyh); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    ctx.strokeStyle = mix(ENG.chimney, '#FFFFFF', 0.25); ctx.lineWidth = 0.02 * u;
    ctx.beginPath(); ctx.moveTo(cxh, cyh); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    ctx.strokeStyle = ENG.line; ctx.lineWidth = 0.04 * u;
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p3.x, p3.y); ctx.stroke();
    ctx.strokeStyle = ENG.wood; ctx.lineWidth = 0.024 * u;
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p3.x, p3.y); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.006 * u;
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y - 0.006 * u); ctx.lineTo(p3.x, p3.y - 0.006 * u); ctx.stroke();
    [p0, p1, p3, { x: G.wheels[2].x + ox, y: G.wheels[2].y + oy }].forEach(function (p) {
      ctx.beginPath(); ctx.arc(p.x, p.y, 0.017 * u, 0, Math.PI * 2); ctx.fillStyle = ENG.hub; ctx.fill();
      ctx.lineWidth = Math.max(1, lw * 0.5); ctx.strokeStyle = ENG.line; ctx.stroke();
    });
    ctx.beginPath(); ctx.arc(cxh, cyh, 0.02 * u, 0, Math.PI * 2); ctx.fillStyle = ENG.brass; ctx.fill(); ctx.strokeStyle = ENG.brassDk; ctx.stroke();
    ctx.restore();
    drawLamp(ctx, E, opt.lamp, t);
    drawWhistle(ctx, E, clamp01(opt.whistle), clamp01(opt.glow), t);
  }

  // ================================================================= CARS
  function carGeom(w, h) {
    var yTop = -26 - h, yFront = yTop + 0.56 * h, yBottom = -9;
    var wheelR = clamp(0.075 * w, 13, 19);
    var pBot = -13, pTop = Math.max(yFront + 1, pBot - 74), ph = pBot - pTop;   // the plate hangs over the rim
    var pw = Math.min(w * 0.56, w * 0.68 - 2 * wheelR - 6);
    return { yTop: yTop, yFront: yFront, yBottom: yBottom, floorY: yTop + 0.62 * h, wheelR: wheelR, hookY: -wheelR,
             plate: { x: (w - pw) / 2, y: pTop, w: pw, h: ph } };
  }
  function carColors(label) {
    var c = label && (label.type === 'color' || label.type === 'size') ? pal(label.color || label.value) : null;
    if (c) return { base: c.base, dark: c.dark, light: c.light, rim: c.dark, inner: mix(c.base, c.dark, 0.6), line: mix(c.dark, '#000000', 0.18), wood: false };
    return { base: WOOD.base, dark: WOOD.rim, light: WOOD.light, rim: WOOD.rim, inner: WOOD.inner, line: WOOD.dark, wood: true };
  }
  function sizeK(label) { return label && label.type === 'size' && label.value === 'small' ? 0.8 : 1; }
  function withSize(ctx, w, label, fn) {
    var k = sizeK(label);
    if (k === 1) { fn(); return; }
    ctx.save(); ctx.translate(w * (1 - k) / 2, 0); ctx.scale(k, k); fn(); ctx.restore();
  }

  function carBack(g, w, h, C) {
    var G = carGeom(w, h), lw = Math.max(2, Math.min(4, w * 0.016));
    var y0 = G.yTop, hh = (G.yFront + 0.3 * h) - y0;
    part(g, rrPath(w * 0.015, y0, w * 0.97, hh, Math.min(14, h * 0.1)), { base: C.inner, dark: C.dark, line: C.line },
      { lw: lw, off: [0, 0], inner: function (c) {
        c.strokeStyle = rgba(C.line, 0.22); c.lineWidth = Math.max(1, lw * 0.4);
        for (var i = 1; i < 6; i++) { var x = w * (0.015 + 0.97 * i / 6); c.beginPath(); c.moveTo(x, y0 + h * 0.09); c.lineTo(x, y0 + hh); c.stroke(); }
        var sg = c.createLinearGradient(0, y0, 0, y0 + hh);
        sg.addColorStop(0, 'rgba(60,35,15,0)'); sg.addColorStop(1, 'rgba(60,35,15,0.28)');
        c.fillStyle = sg; c.fillRect(0, y0, w, hh);
      } });
    // top rim of the far wall + end posts
    part(g, rrPath(w * 0.005, y0 - 0.02 * h, w * 0.99, 0.1 * h, 0.05 * h), { base: C.wood ? WOOD.base : C.base, dark: C.rim, line: C.line },
      { lw: lw, off: [0, -0.02 * h], hl: [w * 0.3, y0 + 0.005 * h, w * 0.18, 0.012 * h] });
    [0, w * 0.93].forEach(function (x) {
      part(g, rrPath(x, y0 - 0.02 * h, w * 0.07, hh * 0.8, 0.04 * h), { base: C.wood ? WOOD.base : C.base, dark: C.rim, line: C.line },
        { lw: lw, off: [-w * 0.012, 0] });
    });
  }

  function plateFallbackHome(ctx, kind, s) {   // simple code-drawn badge when the sprite is missing
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, s * 0.48, 0, Math.PI * 2); ctx.fillStyle = '#CDEBFA'; ctx.fill();
    ctx.clip();
    ctx.fillStyle = '#8ED05E'; ctx.fillRect(-s, s * 0.18, 2 * s, s);
    if (kind === 'barn') {
      ctx.fillStyle = '#C8654F'; ctx.beginPath(); ctx.moveTo(-s * 0.28, s * 0.3); ctx.lineTo(-s * 0.28, -s * 0.05); ctx.lineTo(0, -s * 0.28); ctx.lineTo(s * 0.28, -s * 0.05); ctx.lineTo(s * 0.28, s * 0.3); ctx.fill();
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = s * 0.04; ctx.strokeRect(-s * 0.13, s * 0.04, s * 0.26, s * 0.26);
      ctx.beginPath(); ctx.moveTo(-s * 0.13, s * 0.04); ctx.lineTo(s * 0.13, s * 0.3); ctx.moveTo(s * 0.13, s * 0.04); ctx.lineTo(-s * 0.13, s * 0.3); ctx.stroke();
    } else if (kind === 'pond') {
      ctx.fillStyle = '#3DB7B4'; ctx.beginPath(); ctx.ellipse(0, s * 0.18, s * 0.38, s * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#55C04A'; ctx.beginPath(); ctx.ellipse(-s * 0.1, s * 0.2, s * 0.12, s * 0.06, 0, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'tree') {
      ctx.fillStyle = '#A86B3A'; ctx.fillRect(-s * 0.07, -s * 0.02, s * 0.14, s * 0.36);
      ctx.fillStyle = '#4FB848'; ctx.beginPath(); ctx.arc(0, -s * 0.14, s * 0.25, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3E2412'; ctx.beginPath(); ctx.ellipse(0, s * 0.14, s * 0.04, s * 0.05, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#7FC255'; ctx.beginPath(); ctx.ellipse(0, s * 0.4, s * 0.55, s * 0.45, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3A2618'; ctx.beginPath(); ctx.ellipse(0, s * 0.2, s * 0.14, s * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, s * 0.48, 0, Math.PI * 2); ctx.lineWidth = Math.max(2, s * 0.06); ctx.strokeStyle = '#FFFFFF'; ctx.stroke();
    ctx.lineWidth = Math.max(1, s * 0.02); ctx.strokeStyle = '#8E7A5E'; ctx.beginPath(); ctx.arc(0, 0, s * 0.51, 0, Math.PI * 2); ctx.stroke();
  }

  function miniBlock(ctx, s, c) {   // a tiny cube icon, bottom-centre origin, s = side
    var d = s * 0.22, x0 = -s * 0.5 - d / 2, y1 = 0, y0 = -s;
    var lw = Math.max(1.5, s * 0.06);
    ctx.save(); ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + d, y0 - d); ctx.lineTo(x0 + s + d, y0 - d); ctx.lineTo(x0 + s, y0); ctx.closePath();
    ctx.fillStyle = c.light; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = c.dark; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0 + s, y0); ctx.lineTo(x0 + s + d, y0 - d); ctx.lineTo(x0 + s + d, y1 - d); ctx.lineTo(x0 + s, y1); ctx.closePath();
    ctx.fillStyle = mix(c.base, c.dark, 0.45); ctx.fill(); ctx.stroke();
    ctx.beginPath(); rr(ctx, x0, y0, s, s, s * 0.08); ctx.fillStyle = c.base; ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.ellipse(x0 + s * 0.3, y0 + s * 0.25, s * 0.14, s * 0.07, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function plateContent(g, car, P, opt) {
    var L = car.label || {}, cx = P.x + P.w / 2, cy = P.y + P.h / 2, ph = P.h, pw = P.w;
    var need = car.need | 0, lineCol = '#FFFFFF';
    switch (L.type) {
      case 'shape': {
        var c = pal(L.color) || { base: '#F2C46A', dark: '#A8743F' };
        var r = ph * (L.value === 'rect' || L.value === 'oval' ? 0.3 : 0.36);
        g.save(); g.translate(cx, cy + (L.value === 'triangle' ? ph * 0.03 : 0)); drawShape(g, L.value, r, c, Math.max(2, ph * 0.04)); g.restore();
        break;
      }
      case 'number': {
        var dots = need > 0 ? need : (L.showDots ? (+L.value | 0) : 0);
        var col = L.color && pal(L.color) ? pal(L.color).dark : INK;
        if (dots > 0) {
          glyph(g, L.value, cx, P.y + ph * 0.36, ph * 0.6, pw * 0.8, col, lineCol);
          dotRows(g, dots, cx, P.y + ph * (dots > 5 ? 0.8 : 0.82), pw * 0.86, ph * (dots > 5 ? 0.32 : 0.2), need > 0 ? (car.filled | 0) : null);
        } else glyph(g, L.value, cx, cy, ph * 0.86, pw * 0.8, col, lineCol);
        break;
      }
      case 'letter':
        glyph(g, L.value, cx, cy, ph * 0.86, pw * 0.8, L.color && pal(L.color) ? pal(L.color).dark : INK, lineCol); break;
      case 'text':
        glyph(g, L.value, cx, cy, ph * 0.66, pw * 0.86, L.color && pal(L.color) ? pal(L.color).dark : INK, lineCol); break;
      case 'parity': {
        var odd = L.value === 'odd' || L.value === 1;
        glyph(g, odd ? '1 3 5' : '2 4 6', cx, P.y + ph * 0.34, ph * 0.46, pw * 0.86, INK, lineCol);
        // pairs of dots; odd leaves one lonely dot (lilac)
        var n = odd ? 3 : 4, r = Math.min(ph * 0.085, pw / 16), y = P.y + ph * 0.78, gap = r * 2.5, pairGap = r * 1.8;
        var xs = odd ? [-1.5, -0.5, 1] : [-2, -1, 0.6, 1.6];
        for (var i = 0; i < n; i++) {
          var lonely = odd && i === 2;
          dot(g, cx + xs[i] * gap + (i >= 2 && !odd ? pairGap * 0.1 : 0), y, r, lonely ? '#9C7DD6' : INK);
        }
        // pair brackets
        g.strokeStyle = rgba(INK, 0.35); g.lineWidth = Math.max(1, r * 0.3); g.lineCap = 'round';
        var pairs = odd ? [[-1.5, -0.5]] : [[-2, -1], [0.6, 1.6]];
        pairs.forEach(function (p) {
          g.beginPath(); g.moveTo(cx + p[0] * gap - r * 0.6, y + r * 1.6);
          g.quadraticCurveTo(cx + (p[0] + p[1]) / 2 * gap, y + r * 2.6, cx + p[1] * gap + r * 0.6, y + r * 1.6); g.stroke();
        });
        if (n === 3) void pairGap;
        break;
      }
      case 'home': {
        var s = Math.min(ph * 1.12, pw * 0.98), im = getImg(opt, 'home_' + L.value);
        if (im) g.drawImage(im, cx - s / 2, cy - s / 2 - s * 0.005, s, s);
        else { g.save(); g.translate(cx, cy); plateFallbackHome(g, L.value, s * 0.9); g.restore(); }
        break;
      }
      case 'size': {
        var cc = pal(L.color) || { base: '#F2C46A', dark: '#A8743F', light: '#FBE3B4' };
        var big = L.value !== 'small';
        g.save(); g.translate(cx - ph * 0.04, P.y + ph * 0.9); miniBlock(g, ph * (big ? 0.62 : 0.3), cc); g.restore();
        break;
      }
      default:
        if (L.value != null) glyph(g, L.value, cx, cy, ph * 0.7, pw * 0.86, INK, lineCol);
    }
  }

  function needsPlate(L) { return L && L.type && L.type !== 'color'; }

  function carFront(g, car, w, h, opt) {
    var L = car.label || {}, C = carColors(L), G = carGeom(w, h), lw = Math.max(2, Math.min(4, w * 0.016));
    // front wall
    var y0 = G.yFront, hh = G.yBottom - y0, R = Math.min(16, h * 0.11);
    part(g, rrPath(0, y0, w, hh, R), { base: C.base, dark: C.dark, line: C.line },
      { lw: lw, off: [-w * 0.012, -h * 0.05], shadeT: 0.3, hl: [w * 0.2, y0 + hh * 0.3, w * 0.1, hh * 0.06, -0.08],
        inner: function (c) {
          if (C.wood) grain(c, 0, y0, w, hh, WOOD.dark, 4, w * 0.013 + h * 0.007, 0.2);
          else {   // painted planks
            c.strokeStyle = rgba(C.dark, 0.25); c.lineWidth = Math.max(1, lw * 0.45);
            for (var i = 1; i < 3; i++) { var yy = y0 + hh * i / 3; c.beginPath(); c.moveTo(0, yy); c.lineTo(w, yy); c.stroke(); }
            c.fillStyle = rgba(C.light, 0.45); c.fillRect(0, y0 + hh * 0.18, w, hh * 0.08);
          }
        } });
    // top rim (thick rounded bar)
    part(g, rrPath(-w * 0.012, y0 - 0.035 * h, w * 1.024, Math.max(10, 0.1 * h), 0.05 * h), { base: C.wood ? mix(WOOD.base, WOOD.rim, 0.25) : C.dark, dark: C.wood ? WOOD.rim : mix(C.dark, '#000000', 0.2), line: C.line },
      { lw: lw, off: [0, -0.025 * h], hl: [w * 0.35, y0 - 0.01 * h, w * 0.25, 0.012 * h], hlA: 0.4 });
    // corner bolts
    g.fillStyle = C.wood ? mix(WOOD.rim, '#FFFFFF', 0.25) : C.light;
    [[0.045, 0.3], [0.955, 0.3]].forEach(function (p) {
      g.beginPath(); g.arc(w * p[0], y0 + hh * p[1], Math.max(2.5, w * 0.012), 0, Math.PI * 2); g.fill();
    });
    if (needsPlate(L)) {
      var P = G.plate;
      // plate shadow + body
      g.fillStyle = 'rgba(60,35,15,0.22)'; g.beginPath(); rr(g, P.x + 2, P.y + 3, P.w, P.h, P.h * 0.18); g.fill();
      g.beginPath(); rr(g, P.x, P.y, P.w, P.h, P.h * 0.18); g.fillStyle = PLATE; g.fill();
      g.lineWidth = Math.max(2, lw * 0.8); g.strokeStyle = PLATE_LINE; g.stroke();
      g.save(); g.beginPath(); rr(g, P.x, P.y, P.w, P.h, P.h * 0.18); g.clip();
      g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(P.x, P.y, P.w, P.h * 0.12);
      g.restore();
      // nails
      g.fillStyle = PLATE_LINE;
      [[P.x + P.h * 0.12, P.y + P.h * 0.13], [P.x + P.w - P.h * 0.12, P.y + P.h * 0.13]].forEach(function (p) {
        g.beginPath(); g.arc(p[0], p[1], Math.max(1.5, P.h * 0.035), 0, Math.PI * 2); g.fill();
      });
      plateContent(g, car, P, opt);
    }
  }

  function carKey(car, w, h, homeReady) {
    var L = car.label || {};
    return ['cf', L.type, L.value, L.color, L.showDots ? 1 : 0, car.need | 0, car.filled | 0, Math.round(w), Math.round(h), homeReady ? 1 : 0].join('|');
  }

  function drawCar(ctx, car, w, h, opt, part_) {
    opt = opt || {}; car = car || {};
    var L = car.label || {}, dpr = dprOf(ctx, opt), G = carGeom(w, h), t = opt.t != null ? opt.t : nowSec();
    var C = carColors(L);
    withSize(ctx, w, L, function () {
      if (part_ === 'back') {
        cached(ctx, ['cb', C.base, Math.round(w), Math.round(h)].join('|'), -4, G.yTop - 0.06 * h - 4, w + 8, 0.75 * h + 12, dpr,
          function (g) { carBack(g, w, h, C); });
        return;
      }
      var homeReady = L.type === 'home' ? !!getImg(opt, 'home_' + L.value) : false;
      var bx = -6, by = G.yFront - 0.06 * h - 10, bw = w + 12, bh = -4 - by;
      if (L.type === 'home' && !homeReady) {   // don't cache the fallback picture
        ctx.save(); carFront(ctx, car, w, h, opt); ctx.restore();
      } else {
        cached(ctx, carKey(car, w, h, homeReady), bx, by, bw, bh, dpr, function (g) { carFront(g, car, w, h, opt); });
      }
      // wheels (live: they turn)
      var lw = Math.max(2, Math.min(4, w * 0.016)), ang = -(opt.wheelRot || 0);
      [0.16, 0.84].forEach(function (f, i) { wheel(ctx, w * f, -G.wheelR, G.wheelR, ang + i * 0.9, lw, ENG.wheel, ENG.wheelDk); });
      var gl = clamp01(opt.glow);
      if (gl > 0) {
        if (needsPlate(L)) { ctx.save(); ctx.translate(G.plate.x + G.plate.w / 2, G.plate.y + G.plate.h / 2); drawGlow(ctx, G.plate.w * 1.02, G.plate.h * 1.05, t, gl); ctx.restore(); }
        ctx.save(); ctx.translate(w / 2, (G.yTop + G.yBottom) / 2); drawGlow(ctx, w * 1.04, (G.yBottom - G.yTop) * 1.05, t, gl * 0.8); ctx.restore();
      }
    });
  }

  // ================================================================= COUPLING
  function drawCoupling(ctx, x0, x1, y, stretch) {
    stretch = clamp01(stretch);
    var mid = (x0 + x1) / 2, gap = 1 + stretch * 7, th = 8, kr = 5.5;
    ctx.save(); ctx.lineJoin = 'round';
    function bar(a, b) {
      if (b <= a) return;
      ctx.beginPath(); rr(ctx, a, y - th / 2, b - a, th, th / 2);
      ctx.fillStyle = '#C99A62'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#7A5530'; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(a + 2, y - th / 2 + 1.5, Math.max(0, b - a - 4), 1.6);
    }
    var a1 = mid - gap / 2 - kr, b1 = mid + gap / 2 + kr;
    bar(x0 - 2, a1); bar(b1, x1 + 2);
    if (stretch > 0.15) {   // springy zig-zag in the gap
      ctx.strokeStyle = 'rgba(122,85,48,' + (0.4 + 0.5 * stretch).toFixed(3) + ')'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(a1, y);
      var n = 4; for (var i = 1; i <= n; i++) ctx.lineTo(a1 + (b1 - a1) * i / n, y + (i % 2 ? -3 : 3) * (i < n ? 1 : 0));
      ctx.stroke();
    }
    [[mid - gap / 2 - kr * 0.9, -1], [mid + gap / 2 + kr * 0.9, 1]].forEach(function (k) {
      ctx.beginPath(); ctx.arc(k[0], y, kr, 0, Math.PI * 2);
      ctx.fillStyle = ENG.chimney; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = ENG.wheelDk; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.arc(k[0] - 1.5, y - 1.8, 1.6, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
  }

  // ================================================================= CARGO
  function cargoScale(item) {
    if (!item || item.kind !== 'size') return 1;
    if (typeof item.scale === 'number' && item.scale > 0 && item.scale !== 1) return item.scale;
    return (item.size || item.value) === 'small' ? 0.68 : 1;
  }
  function cargoBox(item, S) {   // visible box relative to the centre
    var k = cargoScale(item), b = 0.46 * S;
    return { x: -0.44 * S * k, y: b - 0.9 * S * k, w: 0.88 * S * k, h: 0.9 * S * k };
  }

  function toyColor(item) { return pal(item.color) || { base: '#E7C590', dark: '#A8743F', light: '#F5DFB6' }; }

  function paintToy(g, toy, S, c) {
    var lw = Math.max(2, S * 0.03), line = mix(c.dark, '#000000', 0.12), B = 0.46 * S;
    g.lineJoin = 'round';
    if (toy === 'ball') {
      var R = 0.4 * S, cy = B - R;
      part(g, function (q) { q.beginPath(); q.arc(0, cy, R, 0, Math.PI * 2); }, { base: c.base, dark: c.dark, line: line },
        { lw: lw, off: [-R * 0.14, -R * 0.18], hl: [-R * 0.36, cy - R * 0.42, R * 0.28, R * 0.16, -0.6], hlA: 0.55,
          inner: function (q) {   // painted equator stripe in the light tone (classic wooden ball)
            q.strokeStyle = rgba(c.light, 0.85); q.lineWidth = R * 0.16;
            q.beginPath(); q.ellipse(0, cy, R * 1.02, R * 0.32, -0.12, 0, Math.PI); q.stroke();
          } });
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(-R * 0.5, cy - R * 0.5, R * 0.07, 0, Math.PI * 2); g.fill();
    } else if (toy === 'cone') {
      var bw = 0.4 * S, ey = 0.1 * S, top = B - 0.86 * S, by = B - ey;
      var cone = function (q) {
        q.beginPath(); q.moveTo(-bw, by);
        q.lineTo(-S * 0.035, top + S * 0.03); q.quadraticCurveTo(0, top - S * 0.01, S * 0.035, top + S * 0.03);
        q.lineTo(bw, by); q.ellipse(0, by, bw, ey, 0, 0, Math.PI, false); q.closePath();
      };
      part(g, cone, { base: c.base, dark: c.dark, line: line },
        { lw: lw, off: [-S * 0.07, 0], hl: [-S * 0.12, B - 0.45 * S, S * 0.04, S * 0.2, 0.42], hlA: 0.5,
          inner: function (q) {   // two light rings
            q.strokeStyle = rgba(c.light, 0.8); q.lineWidth = S * 0.035;
            [0.42, 0.66].forEach(function (f) {
              var yy = by - (by - top) * (1 - f), ww = bw * f;
              q.beginPath(); q.ellipse(0, yy, ww, ey * f, 0, 0, Math.PI); q.stroke();
            });
          } });
    } else if (toy === 'cylinder') {
      var cw = 0.3 * S, ey2 = 0.085 * S, yt = B - 0.78 * S, yb = B - ey2;
      var body = function (q) { q.beginPath(); q.moveTo(-cw, yt); q.lineTo(-cw, yb); q.ellipse(0, yb, cw, ey2, 0, Math.PI, 0, true); q.lineTo(cw, yt); q.closePath(); };
      part(g, body, { base: c.base, dark: c.dark, line: line },
        { lw: lw, off: [-S * 0.06, 0], hl: [-cw * 0.55, (yt + yb) / 2, cw * 0.1, (yb - yt) * 0.32], hlA: 0.45,
          inner: function (q) { grain(q, -cw, yt, cw * 2, yb - yt, c.dark, 3, 2.2, 0.16); } });
      part(g, function (q) { q.beginPath(); q.ellipse(0, yt, cw, ey2, 0, 0, Math.PI * 2); }, { base: c.light, dark: c.base, line: line },
        { lw: lw, off: [0, 0], inner: function (q) {   // end-grain rings
          q.strokeStyle = rgba(c.dark, 0.25); q.lineWidth = Math.max(1, lw * 0.4);
          q.beginPath(); q.ellipse(0, yt, cw * 0.55, ey2 * 0.55, 0, 0, Math.PI * 2); q.stroke();
          q.beginPath(); q.ellipse(0, yt, cw * 0.22, ey2 * 0.22, 0, 0, Math.PI * 2); q.stroke();
        } });
    } else {   // cube
      var a = 0.62 * S, d = 0.16 * S, x0 = -a / 2 - d / 2, y1 = B, y0 = B - a, r = a * 0.08;
      g.fillStyle = c.light; g.beginPath();
      g.moveTo(x0, y0); g.lineTo(x0 + d, y0 - d); g.lineTo(x0 + a + d, y0 - d); g.lineTo(x0 + a, y0); g.closePath();
      g.fill(); g.lineWidth = lw; g.strokeStyle = line; g.stroke();
      g.fillStyle = mix(c.base, c.dark, 0.45); g.beginPath();
      g.moveTo(x0 + a, y0); g.lineTo(x0 + a + d, y0 - d); g.lineTo(x0 + a + d, y1 - d); g.lineTo(x0 + a, y1); g.closePath();
      g.fill(); g.stroke();
      part(g, rrPath(x0, y0, a, a, r), { base: c.base, dark: c.dark, line: line },
        { lw: lw, off: [-a * 0.06, -a * 0.07], hl: [x0 + a * 0.28, y0 + a * 0.2, a * 0.16, a * 0.06, -0.45], hlA: 0.5,
          inner: function (q) {
            grain(q, x0, y0, a, a, c.dark, 4, 0.7, 0.14);
            // painted inset square (toy-block look)
            q.strokeStyle = rgba(c.light, 0.75); q.lineWidth = a * 0.05;
            q.beginPath(); rr(q, x0 + a * 0.16, y0 + a * 0.16, a * 0.68, a * 0.68, a * 0.08); q.stroke();
          } });
    }
  }

  function paintShapeBlock(g, shape, S, c) {   // flat wooden cut-out with visible thickness
    var r = 0.33 * S, lw = Math.max(2, S * 0.028), line = mix(c.dark, '#000000', 0.12);
    var B = 0.46 * S, cy = B - r * 1.08 - S * 0.05;
    if (shape === 'rect' || shape === 'oval') cy = B - r * 0.72 - S * 0.06;
    if (shape === 'triangle') cy = B - r * 0.86 - S * 0.06;
    var th = S * 0.06;
    g.save(); g.translate(0, cy);
    // thickness (side), offset down-right
    var N = 8, i;
    g.lineJoin = 'round'; g.lineWidth = lw; g.strokeStyle = line;
    for (i = N; i >= 1; i--) { g.save(); g.translate(th * i / N, th * i / N); shapePath(g, shape, r); g.stroke(); g.restore(); }
    g.fillStyle = mix(c.base, c.dark, 0.55);
    for (i = N; i >= 1; i--) { g.save(); g.translate(th * i / N, th * i / N); shapePath(g, shape, r); g.fill(); g.restore(); }
    part(g, function (q) { shapePath(q, shape, r); }, { base: c.base, dark: c.dark, line: line },
      { lw: lw, off: [-r * 0.07, -r * 0.09], hl: [-r * 0.38, -r * 0.42, r * 0.3, r * 0.13, -0.6], hlA: 0.5,
        inner: function (q) { grain(q, -r * 1.2, -r * 1.1, r * 2.4, r * 2.2, c.dark, 4, 1.9, 0.12); } });
    g.restore();
  }

  function paintAbc(g, txt, S, c) {   // ABC cube: natural wood frame, painted panel in the item colour, bold glyph
    var a = 0.66 * S, d = 0.15 * S, x0 = -a / 2 - d / 2, y1 = 0.46 * S, y0 = y1 - a, lw = Math.max(2, S * 0.03);
    var W = WOOD, line = WOOD.dark;
    g.lineJoin = 'round';
    g.fillStyle = W.light; g.beginPath();
    g.moveTo(x0, y0); g.lineTo(x0 + d, y0 - d); g.lineTo(x0 + a + d, y0 - d); g.lineTo(x0 + a, y0); g.closePath();
    g.fill(); g.lineWidth = lw; g.strokeStyle = line; g.stroke();
    // side face with a hint of another letter panel
    g.fillStyle = mix(W.base, W.rim, 0.45); g.beginPath();
    g.moveTo(x0 + a, y0); g.lineTo(x0 + a + d, y0 - d); g.lineTo(x0 + a + d, y1 - d); g.lineTo(x0 + a, y1); g.closePath();
    g.fill(); g.stroke();
    if (c) {
      g.fillStyle = rgba(c.base, 0.55); g.beginPath();
      g.moveTo(x0 + a + d * 0.25, y0 + a * 0.12 - d * 0.25); g.lineTo(x0 + a + d * 0.75, y0 + a * 0.12 - d * 0.75);
      g.lineTo(x0 + a + d * 0.75, y1 - a * 0.12 - d * 0.75); g.lineTo(x0 + a + d * 0.25, y1 - a * 0.12 - d * 0.25); g.closePath(); g.fill();
    }
    part(g, rrPath(x0, y0, a, a, a * 0.1), { base: W.base, dark: W.rim, line: line },
      { lw: lw, off: [-a * 0.05, -a * 0.06], inner: function (q) { grain(q, x0, y0, a, a, W.dark, 4, 3.3, 0.16); } });
    var pc = c || { base: '#FFF6E4', dark: '#C79A62', light: '#FFFFFF' };
    var m = a * 0.1;
    part(g, rrPath(x0 + m, y0 + m, a - 2 * m, a - 2 * m, a * 0.12), { base: pc.base, dark: pc.dark, line: mix(pc.dark, '#000000', 0.1) },
      { lw: Math.max(1.5, lw * 0.6), off: [-a * 0.03, -a * 0.04], hl: [x0 + a * 0.3, y0 + a * 0.24, a * 0.12, a * 0.04, -0.5], hlA: 0.35 });
    var lightFace = !c || c.base === (pal('yellow') || {}).base || c.base === (pal('pink') || {}).base || c.base === (pal('orange') || {}).base;
    var fill = lightFace ? (c ? mix(c.dark, '#000000', 0.25) : INK) : '#FFFFFF';
    var stroke = lightFace ? 'rgba(255,255,255,0.85)' : mix(pc.dark, '#000000', 0.2);
    var str = String(txt), fs = str.length > 2 ? a * 0.5 : str.length > 1 ? a * 0.62 : a * 0.78;
    glyph(g, str, x0 + a / 2, y0 + a / 2 + a * 0.02, fs, a * 0.8, fill, stroke);
  }

  function spriteFallback(g, S) {
    var R = 0.36 * S, cy = 0.46 * S - R - 4;
    g.beginPath(); g.arc(0, cy, R + 6, 0, Math.PI * 2); g.fillStyle = '#FFFFFF'; g.fill();
    part(g, function (q) { q.beginPath(); q.arc(0, cy, R, 0, Math.PI * 2); }, { base: '#F3E2C6', dark: '#B99A6E' },
      { lw: Math.max(2, S * 0.025), hl: [-R * 0.4, cy - R * 0.45, R * 0.25, R * 0.12, -0.6] });
    dot(g, -R * 0.32, cy - R * 0.08, R * 0.11, '#2F2622'); dot(g, R * 0.32, cy - R * 0.08, R * 0.11, '#2F2622');
    g.strokeStyle = '#8E6E48'; g.lineWidth = Math.max(1.5, S * 0.02); g.lineCap = 'round';
    g.beginPath(); g.arc(0, cy + R * 0.12, R * 0.22, 0.2, Math.PI - 0.2); g.stroke();
  }

  function cargoKey(item) {
    return ['cg', item.kind, item.toy, item.shape, item.color, item.text, item.value].join('|');
  }

  function drawCargo(ctx, item, size, opt) {
    opt = opt || {}; item = item || {};
    var S = size, t = opt.t != null ? opt.t : nowSec(), k = cargoScale(item), B = 0.46 * S;
    ctx.save();
    if (opt.shadow) {
      ctx.fillStyle = 'rgba(60,40,20,0.2)';
      ctx.beginPath(); ctx.ellipse(0, B + S * 0.01, S * 0.34 * k, S * 0.06 * k, 0, 0, Math.PI * 2); ctx.fill();
    }
    var gl = clamp01(opt.glow);
    if (gl > 0) { ctx.save(); ctx.translate(0, B - 0.45 * S * k); drawGlow(ctx, S * 0.92 * k, S * 0.92 * k, t, gl); ctx.restore(); }
    var sq = opt.squash;
    if (sq && (sq.sx !== 1 || sq.sy !== 1)) { ctx.translate(0, B); ctx.scale(sq.sx || 1, sq.sy || 1); ctx.translate(0, -B); }
    if (k !== 1) { ctx.translate(0, B); ctx.scale(k, k); ctx.translate(0, -B); }
    if (item.kind === 'sprite') {
      var im = getImg(opt, item.sprite);
      if (im) ctx.drawImage(im, -S / 2, -S / 2, S, S);
      else spriteFallback(ctx, S);
      ctx.restore();
      return;
    }
    var dpr = dprOf(ctx, opt);
    var kind = item.kind;
    cached(ctx, cargoKey(item) + '|' + Math.round(S * 4) / 4, -S * 0.56, -S * 0.56, S * 1.12, S * 1.08, dpr, function (g) {
      if (kind === 'shape') paintShapeBlock(g, item.shape || item.value || 'circle', S, toyColor(item));
      else if (kind === 'letter' || kind === 'number' || kind === 'text') paintAbc(g, item.text != null ? item.text : item.value, S, pal(item.color));
      else paintToy(g, item.toy || 'cube', S, toyColor(item));
    });
    ctx.restore();
  }

  // ================================================================= GLOW
  function drawGlow(ctx, w, h, t, strength) {
    strength = clamp01(strength == null ? 1 : strength);
    if (!strength) return;
    var wave = Math.sin((t || 0) * 5.5), pulse = 0.85 + 0.15 * wave;
    var rx = w / 2, ry = h / 2, m = Math.min(w, h), reach = m * (0.32 + 0.03 * wave);
    ctx.save();
    ctx.scale(1, ry / rx);
    var R0 = rx * 0.82, R1 = rx + reach * rx / Math.max(1, ry) * 0.9;
    var g = ctx.createRadialGradient(0, 0, R0, 0, 0, R1);
    g.addColorStop(0, 'rgba(255,214,80,' + (0.55 * strength * pulse).toFixed(3) + ')');
    g.addColorStop(0.45, 'rgba(255,214,80,' + (0.28 * strength * pulse).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,214,80,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, R1, 0, Math.PI * 2); ctx.arc(0, 0, R0 * 0.98, 0, Math.PI * 2, true); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.ellipse(0, 0, rx + m * 0.06, ry + m * 0.06, 0, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(2, m * 0.04); ctx.strokeStyle = 'rgba(255,220,100,' + (0.85 * strength * pulse).toFixed(3) + ')'; ctx.stroke();
    ctx.lineWidth = Math.max(1, m * 0.014); ctx.strokeStyle = 'rgba(255,255,235,' + (0.85 * strength).toFixed(3) + ')'; ctx.stroke();
    ctx.restore();
  }

  // ================================================================= GHOST HAND
  function drawGhostHand(ctx, size, t) {
    var s = size, F = '#FFF4E4', L = '#B9835A', SH = '#F1D6B8';
    var ph = ((t || 0) % 1 + 1) % 1;
    var press = ph < 0.18 ? 1 - ph / 0.18 : ph > 0.85 ? (ph - 0.85) / 0.15 : 0;
    ctx.save();
    if (ph < 0.3) {   // touch ring at the start
      var q = ph / 0.3;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * (1 - q)).toFixed(3) + ')'; ctx.lineWidth = s * 0.035;
      ctx.beginPath(); ctx.arc(0, 0, s * (0.08 + 0.22 * q), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.translate(0, s * 0.05 * (1 - press));
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    function hand() {
      ctx.beginPath();
      rr(ctx, -s * 0.085, 0, s * 0.17, s * 0.52, s * 0.085);
      rr(ctx, -s * 0.26, s * 0.36, s * 0.47, s * 0.42, s * 0.14);
      ctx.moveTo(-s * 0.2, s * 0.5);
      ctx.ellipse(-s * 0.27, s * 0.46, s * 0.07, s * 0.15, -0.6, 0, Math.PI * 2);
    }
    ctx.globalAlpha *= 0.95;
    hand(); ctx.lineWidth = s * 0.07; ctx.strokeStyle = L; ctx.stroke();
    hand(); ctx.fillStyle = F; ctx.fill();
    ctx.strokeStyle = SH; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); ctx.moveTo(0, s * 0.5); ctx.lineTo(s * 0.18, s * 0.5); ctx.moveTo(0, s * 0.62); ctx.lineTo(s * 0.18, s * 0.62); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.ellipse(-s * 0.03, s * 0.12, s * 0.025, s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    // cuff: Momo's slate-and-cream stripes
    ctx.fillStyle = '#7D8FA8'; ctx.strokeStyle = '#4C5C74'; ctx.lineWidth = s * 0.04;
    ctx.beginPath(); rr(ctx, -s * 0.24, s * 0.76, s * 0.44, s * 0.14, s * 0.05); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#F4EBDD'; ctx.fillRect(-s * 0.2, s * 0.81, s * 0.36, s * 0.035);
    ctx.restore();
  }

  // ================================================================= TUNNEL
  var BLOCK_TONES = [
    { base: '#9DB0C8', dark: '#5F7390' },   // dusty blue
    { base: '#A9C7A4', dark: '#64845F' },   // sage
    { base: '#E6C987', dark: '#A88A44' },   // muted mustard
    { base: '#D9A9A0', dark: '#9A665D' },   // dusty rose
    { base: '#EFE2C8', dark: '#B09A74' }    // cream
  ];
  function tunnelGeom(h) { return { x0: -0.40 * h, x1: 0.20 * h, back1: 0.42 * h, top: -1.24 * h }; }
  function blk(g, x, y, w, h, tone, lw, deco) {
    part(g, rrPath(x, y, w, h, Math.min(w, h) * 0.12), { base: tone.base, dark: tone.dark },
      { lw: lw, off: [-Math.min(w, h) * 0.05, -Math.min(w, h) * 0.06], hl: [x + w * 0.25, y + h * 0.12, w * 0.14, Math.min(h, w) * 0.03, -0.2], hlA: 0.4,
        inner: function (q) {
          grain(q, x, y, w, h, tone.dark, 3, x * 0.01 + y * 0.02, 0.12);
          if (deco === 'dot') { q.fillStyle = rgba('#FFFFFF', 0.45); q.beginPath(); q.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.18, 0, Math.PI * 2); q.fill(); }
          if (deco === 'star') { q.save(); q.translate(x + w / 2, y + h / 2); shapePath(q, 'star', Math.min(w, h) * 0.2); q.fillStyle = rgba('#FFFFFF', 0.45); q.fill(); q.restore(); }
        } });
  }
  function tunnelBack(g, h) {
    var lw = Math.max(2, h * 0.011), dx = 0.1 * h, dy = -0.06 * h;
    // dark opening (the tunnel inside)
    var gr = g.createLinearGradient(0.24 * h, 0, 0.02 * h, 0);
    gr.addColorStop(0, '#4A4560'); gr.addColorStop(1, '#2A2638');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(0.1 * h, 0); g.lineTo(0.1 * h, -0.8 * h); g.quadraticCurveTo(0.21 * h, -0.98 * h, 0.32 * h, -0.8 * h); g.lineTo(0.32 * h, 0); g.closePath(); g.fill();
    // far wall: pillar + beam peeking out up-right of the near wall (shaded = further away)
    var T = BLOCK_TONES;
    blk(g, 0.3 * h, dy - 0.84 * h, 0.12 * h, 0.84 * h - dy, { base: mix(T[0].base, T[0].dark, 0.3), dark: T[0].dark }, lw);
    blk(g, -0.4 * h + dx, -h + dy, 0.62 * h, 0.17 * h, { base: mix(T[2].base, T[2].dark, 0.3), dark: T[2].dark }, lw);
  }
  function tunnelFront(g, h) {
    var lw = Math.max(2, h * 0.011), T = BLOCK_TONES, x0 = -0.4 * h, x1 = 0.2 * h;
    // left pillar, middle filler, right pillar (the mouth edge)
    blk(g, x0, -0.84 * h, 0.2 * h, 0.84 * h, T[1], lw, 'dot');
    blk(g, x0 + 0.2 * h, -0.5 * h, 0.22 * h, 0.5 * h, T[4], lw, 'star');
    blk(g, x0 + 0.2 * h, -0.84 * h, 0.22 * h, 0.34 * h, T[3], lw);
    blk(g, x1 - 0.18 * h, -0.84 * h, 0.18 * h, 0.84 * h, T[0], lw, 'dot');
    // long beam across the top
    blk(g, x0 - 0.02 * h, -h, x1 - x0 + 0.04 * h, 0.17 * h, T[2], lw);
    // toppers: half-round arch + triangle roof + a ball
    part(g, function (q) { q.beginPath(); q.moveTo(x0 + 0.02 * h, -h); q.arc(x0 + 0.17 * h, -h, 0.15 * h, Math.PI, 0); q.closePath(); },
      T[3], { lw: lw, off: [-0.01 * h, -0.012 * h], hl: [x0 + 0.12 * h, -1.09 * h, 0.04 * h, 0.012 * h, -0.4] });
    part(g, function (q) { q.beginPath(); q.moveTo(x0 + 0.34 * h, -h); q.lineTo(x0 + 0.47 * h, -1.2 * h); q.lineTo(x0 + 0.6 * h, -h); q.closePath(); },
      T[0], { lw: lw, off: [-0.012 * h, 0] });
    part(g, function (q) { q.beginPath(); q.arc(x0 + 0.17 * h, -1.2 * h, 0.05 * h, 0, Math.PI * 2); }, T[2],
      { lw: lw, hl: [x0 + 0.155 * h, -1.215 * h, 0.014 * h, 0.009 * h, -0.5] });
    // soft contact shadow on the floor
    g.fillStyle = 'rgba(60,40,20,0.18)'; g.beginPath(); g.ellipse((x0 + x1) / 2, 4, (x1 - x0) * 0.55, 8, 0, 0, Math.PI * 2); g.fill();
  }
  function drawTunnel(ctx, x, trackY, h, part_) {
    var dpr = dprOf(ctx, null), hk = Math.round(h);
    ctx.save(); ctx.translate(x, trackY);
    if (part_ === 'back') cached(ctx, 'tb|' + hk, -0.45 * h, -1.2 * h, 0.9 * h, 1.22 * h, dpr, function (g) { tunnelBack(g, h); });
    else cached(ctx, 'tf|' + hk, -0.46 * h, -1.29 * h, 0.72 * h, 1.31 * h + 14, dpr, function (g) { tunnelFront(g, h); });
    ctx.restore();
  }

  TT.TrainArt = {
    drawTrack: drawTrack, drawEngine: drawEngine, engineGeom: engineGeom, drawCar: drawCar, carGeom: carGeom,
    drawCoupling: drawCoupling, drawCargo: drawCargo, cargoBox: cargoBox, drawGhostHand: drawGhostHand,
    drawGlow: drawGlow, drawTunnel: drawTunnel, tunnelGeom: tunnelGeom, shapePath: shapePath,
    get COLORS() { return palette(); },
    WOOD: WOOD, ENGINE_COLORS: ENG, FONT: FONT, INK: INK,
    clearCache: function () { cache = {}; cacheN = 0; },
    _mix: mix
  };
})(typeof window !== 'undefined' ? (window.TT = window.TT || {}) : (globalThis.TT = globalThis.TT || {}));
