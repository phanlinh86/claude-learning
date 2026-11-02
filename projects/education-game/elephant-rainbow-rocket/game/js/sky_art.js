// RR.SkyArt — code-drawn sky things for Bim's Rainbow Rocket (character artist A). See docs/DESIGN.md §5.6.
// Classic script; safe to require() in node (document / canvases are only touched lazily inside draw calls).
//
// Everything is drawn at the current transform origin:
//   drawIsland(ctx, w, opt)          opt { style:'cloud'|'planet', color:null|key, mood:0..3 (fractions crossfade), glow:0..1,
//                                          t:seconds, variant:0..2 (planet pastel when color is null) }
//                                    cloud : origin = centre of the flat top surface (y = 0); corner puffs rise to −0.12·w,
//                                            body hangs to +0.49·w (≈ 0.6·w total, ≈ 0.55·w below the surface)
//                                    planet: circle Ø 0.8·w, top at y = 0, centre (0, 0.4·w); ring + 2 craters
//   islandBox(w, style)              → { x0, y0, x1, y1 } drawn bounds relative to the origin (for hit tests / culling)
//   drawToken(ctx, token, size, opt) origin = token BOTTOM centre (it sits on the island surface); size = box height px.
//                                    kinds: shape · stars · number · letter · text · color (draws nothing) · animal/size
//                                    (calls opt.sprite(name, x, y, s, wave) with x,y = sprite CENTRE, s = box px)
//                                    opt { sprite, wave:bool, alpha, mood }
//   tokenBox(token, size)            → { w, h } of the drawn token (h ≤ size)
//   drawRibbon(ctx, pts, width)      pts [{x,y,a}] screen px, any order of age; a = 0..1 opacity/width of that point
//                                    (1 = fresh, 0 = faded). 6 bands, smooth curve, width tapers with a.
//   drawFlame(ctx, power, t, scale)  origin = nozzle exit, pointing +y. power 0..1; scale 1 fits a 190-px rocket.
//   drawPuff(ctx, size, alpha, mood) a soft smoke puff centred at the origin (size = diameter)
//   drawBoostButton(ctx, r, t, pressed)  big round pulsing button (teal + gold, rocket glyph), centred, r = radius
//   drawSpark(ctx, size, color)      4-point twinkle, size = tip-to-tip
//   drawStar(ctx, size, color)       rounded 5-point star with outline + gloss (size = tip-to-tip width), color key or hex
//   drawRocket(ctx, h, imgs, opt)    convenience composite: origin = rocket FEET bottom centre; h = drawn frame height (300 box)
//                                    imgs { back, bim, front } (images / canvases); opt { flame, t, bimScale }
//   COLORS = { key: { base, dark, light, shade } } (answer palette, exact hex), ANCHORS (see below), clearCache()
// Bitmaps (islands, tokens, button face) are cached per key / size bucket / device-pixel bucket; glow is drawn live.
(function (root) {
  'use strict';
  var RR = root.RR = root.RR || {};

  var PALETTE = {
    red: ['#E84A4A', '#A8282E'], blue: ['#3C8DE8', '#1F5BA8'], yellow: ['#FFD23F', '#C99A12'],
    green: ['#4CC26B', '#2A8343'], orange: ['#FF9A2E', '#C4650C'], purple: ['#9B6BE0', '#6840A8'],
    pink: ['#FF8FC0', '#C9558A']
  };
  var FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Varela Round", "Segoe UI", system-ui, -apple-system, sans-serif';
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
  var INK = '#2E2A4A';
  var GOLD = { base: '#FFC93C', dark: '#C98A12', light: '#FFE89A', shade: '#F2AE22' };
  var TEAL = { base: '#2FA7A0', dark: '#1E7A74', line: '#16564F', light: '#6CCBC3' };
  var RIM_GOLD = { base: '#E8B44A', dark: '#A87A22', light: '#F8D98A' };
  // cloud tints per time of day: fill, shade, outline, rim light (null = none), rim alpha
  var MOODS = [
    { fill: '#FFFFFF', shade: '#DCE2F6', line: '#9AA6D1', hi: '#FFFFFF', rim: '#FFE7CF', rimA: 0.55 },  // morning
    { fill: '#FFFFFF', shade: '#D6DEF6', line: '#93A1CF', hi: '#FFFFFF', rim: null, rimA: 0 },          // noon
    { fill: '#FFF4F2', shade: '#E6CDE3', line: '#A691C4', hi: '#FFFFFF', rim: '#FF9EB0', rimA: 0.75 }, // sunset
    { fill: '#E3E8FA', shade: '#B4BEE6', line: '#7A86C2', hi: '#F4F6FF', rim: '#C9D4FF', rimA: 0.5 }   // night
  ];
  var PLANETS = ['#F1E6FF', '#DDEBFF', '#FFE9D6'];
  var BANDS = ['#F07A7A', '#F8B060', '#F6D964', '#86D08E', '#76B4EC', '#A88CE0'];

  // ---------------------------------------------------------------- colour helpers
  function hexRgb(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function rgbHex(c) {
    return '#' + c.map(function (v) { var s = Math.max(0, Math.min(255, Math.round(v))).toString(16); return s.length < 2 ? '0' + s : s; }).join('').toUpperCase();
  }
  function mix(a, b, t) { var x = hexRgb(a), y = hexRgb(b); return rgbHex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; })); }
  function rgba(hex, a) { var c = hexRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (+a).toFixed(3) + ')'; }

  var COLORS = {};
  Object.keys(PALETTE).forEach(function (k) {
    var base = PALETTE[k][0], dark = PALETTE[k][1];
    COLORS[k] = { base: base, dark: dark, light: mix(base, '#FFFFFF', 0.45), shade: mix(base, dark, 0.45) };
  });
  function colOf(c) {
    if (!c) return null;
    if (COLORS[c]) return COLORS[c];
    if (typeof c === 'string' && c.charAt(0) === '#' && c.length === 7) return { base: c, dark: mix(c, '#2A2040', 0.4), light: mix(c, '#FFFFFF', 0.45), shade: mix(c, '#2A2040', 0.18) };
    return null;
  }

  // ---------------------------------------------------------------- canvas cache
  var cache = {}, cacheN = 0, CACHE_MAX = 160;
  function makeCanvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') { try { return new OffscreenCanvas(w, h); } catch (e) { /* fall through */ } }
    if (typeof document !== 'undefined' && document.createElement) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    return null;
  }
  // device-pixel scale of the context (from its transform's Y axis; a squash animation in x never changes the bucket)
  function pxScale(ctx) {
    var s = 1;
    try {
      if (ctx.getTransform) { var m = ctx.getTransform(); s = Math.sqrt(m.c * m.c + m.d * m.d) || 1; }
    } catch (e) { s = 1; }
    // buckets: 1, 1.5, 2, 2.5, 3, 4 (cap) — never below 1 so tiny appear-frames reuse the 1× bitmap
    s = Math.max(1, Math.min(4, Math.ceil(s * 2 - 0.15) / 2));
    return s;
  }
  // draw `fn(c2d)` once into a cached bitmap covering box {x0,y0,x1,y1} (local units), then blit at the origin
  function cached(ctx, key, box, fn) {
    var ps = pxScale(ctx), k = key + '@' + ps;
    var e = cache[k];
    if (!e) {
      var pad = 4, w = Math.ceil((box.x1 - box.x0 + pad * 2) * ps), h = Math.ceil((box.y1 - box.y0 + pad * 2) * ps);
      var cv = (w > 0 && h > 0 && w < 4096 && h < 4096) ? makeCanvas(w, h) : null;
      if (!cv) { fn(ctx); return; }                       // no canvas support: draw live
      var c = cv.getContext('2d');
      c.setTransform(ps, 0, 0, ps, (pad - box.x0) * ps, (pad - box.y0) * ps);
      fn(c);
      if (cacheN >= CACHE_MAX) { cache = {}; cacheN = 0; }
      e = cache[k] = { cv: cv, x: box.x0 - pad, y: box.y0 - pad, w: w / ps, h: h / ps };
      cacheN++;
    }
    ctx.drawImage(e.cv, e.x, e.y, e.w, e.h);
  }
  function clearCache() { cache = {}; cacheN = 0; }
  function bucket(v) { return v < 64 ? Math.round(v / 4) * 4 : Math.round(v / 8) * 8; }

  // ---------------------------------------------------------------- small path helpers
  function ell(ctx, x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot || 0, 0, Math.PI * 2); }
  function roundPoly(ctx, v, r) {
    var n = v.length;
    ctx.moveTo((v[0][0] + v[n - 1][0]) / 2, (v[0][1] + v[n - 1][1]) / 2);
    for (var i = 0; i < n; i++) {
      var a = v[i], b = v[(i + 1) % n];
      ctx.arcTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, typeof r === 'number' ? r : r[i]);
    }
    ctx.closePath();
  }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); roundPoly(ctx, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], Math.min(r, w / 2, h / 2)); }
  function starPath(ctx, cx, cy, ro, ri, round) {
    var v = [], rad = [];
    for (var k = 0; k < 10; k++) {
      var a = (-90 + k * 36) * Math.PI / 180, r = k % 2 ? ri : ro;
      v.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); rad.push(k % 2 ? ro * 0.05 : ro * (round || 0.16));
    }
    ctx.beginPath(); roundPoly(ctx, v, rad);
  }

  // ======================================================================= ISLANDS
  // cloud lobes in units of w (cx, cy, r); top surface ellipse; corner puffs behind the platform edge
  var BACK_PUFFS = [[-0.34, -0.005, 0.115], [0.35, 0.005, 0.105], [-0.17, -0.02, 0.08], [0.2, -0.015, 0.075]];
  var BODY = [[-0.41, 0.11, 0.125], [0.42, 0.11, 0.115], [-0.27, 0.25, 0.14], [-0.05, 0.3, 0.16], [0.18, 0.28, 0.15],
    [0.34, 0.21, 0.11], [-0.15, 0.39, 0.1], [0.08, 0.41, 0.1]];
  var MAIN = { cx: 0, cy: 0.13, rx: 0.44, ry: 0.17 };
  var TOP = { cx: 0, cy: 0.03, rx: 0.41, ry: 0.085 };

  function islandBox(w, style) {
    if (style === 'planet') return { x0: -0.56 * w, y0: -0.06 * w, x1: 0.56 * w, y1: 0.86 * w };
    return { x0: -0.56 * w, y0: -0.15 * w, x1: 0.56 * w, y1: 0.56 * w };
  }

  function cloudLobes(ctx, w, grow) {
    ctx.beginPath();
    var all = BACK_PUFFS.concat(BODY);
    all.forEach(function (c) { ctx.moveTo((c[0] + c[2]) * w + grow, c[1] * w); ctx.arc(c[0] * w, c[1] * w, c[2] * w + grow, 0, Math.PI * 2); });
    ctx.moveTo((MAIN.cx + MAIN.rx) * w + grow, MAIN.cy * w);
    ctx.ellipse(MAIN.cx * w, MAIN.cy * w, MAIN.rx * w + grow, MAIN.ry * w + grow, 0, 0, Math.PI * 2);
  }

  function paintCloud(c, w, colKey, mood) {
    var m = MOODS[mood], ac = colOf(colKey);
    var fill, shade, line, hi, top;
    if (ac) {
      // answer colour cloud: base body, lighter puffs, dark outline; mood only nudges (never changes the hue's name)
      fill = ac.base; shade = ac.shade; line = ac.dark; hi = ac.light; top = mix(ac.base, '#FFFFFF', 0.22);
      if (mood === 3) { shade = mix(ac.shade, '#2A2A60', 0.12); }
    } else {
      fill = m.fill; shade = m.shade; line = m.line; hi = m.hi; top = mix(m.fill, '#FFFFFF', 0.6);
    }
    var lw = Math.max(2, w * 0.022);
    // soft drop shadow under the island
    c.save();
    c.fillStyle = rgba(mood === 3 ? '#0E1030' : '#4A4E8A', 0.13);
    ell(c, 0, 0.46 * w, 0.4 * w, 0.06 * w); c.fill();
    c.restore();
    // coloured islands: an outer ink ring so yellow / green / orange read on pale skies (visual QA P2-3)
    if (ac) { c.fillStyle = 'rgba(51,54,79,0.55)'; cloudLobes(c, w, lw + Math.max(2, w * 0.016)); c.fill(); }
    // outline = union grown by lw; rim light = a thin crescent on the lower-left edges; then the body
    c.fillStyle = line; cloudLobes(c, w, lw); c.fill();
    var rimW = w * 0.022;
    var hasRim = m.rim && m.rimA > 0;
    function inner() { if (hasRim) { c.save(); c.translate(rimW * 0.55, -rimW * 0.75); cloudLobes(c, w, -rimW * 0.35); c.restore(); } else cloudLobes(c, w, 0); }
    if (hasRim) { c.fillStyle = ac ? mix(fill, m.rim, m.rimA * 0.5) : mix(fill, m.rim, m.rimA); cloudLobes(c, w, 0); c.fill(); }
    c.fillStyle = fill; inner(); c.fill();
    // one-step cel shade: one smooth band over the lower half (the scalloped silhouette gives the cloud look)
    c.save(); inner(); c.clip();
    c.fillStyle = shade;
    c.beginPath();
    BODY.forEach(function (b) {
      if (b[1] < 0.2) return;
      var x = (b[0] + 0.03) * w, y = (b[1] + 0.075) * w, r = b[2] * w * 1.02;
      c.moveTo(x + r, y); c.arc(x, y, r, 0, Math.PI * 2);
    });
    c.moveTo(0.6 * w, 0.4 * w); c.ellipse(0.02 * w, 0.4 * w, 0.58 * w, 0.08 * w, 0, 0, Math.PI * 2);
    c.fill();
    // lighter puff highlights on the upper lobes
    c.fillStyle = hi;
    c.globalAlpha = ac ? 0.5 : 0.95;
    BACK_PUFFS.forEach(function (b) { ell(c, (b[0] - 0.02) * w, (b[1] - 0.03) * w, b[2] * 0.6 * w, b[2] * 0.45 * w); c.fill(); });
    [[-0.38, 0.11], [0.4, 0.1]].forEach(function (p) { ell(c, p[0] * w, p[1] * w, 0.045 * w, 0.03 * w, -0.4); c.fill(); });
    c.globalAlpha = 1;
    c.restore();
    // the flat landing surface: a slightly lighter, outlined ellipse
    c.fillStyle = top;
    ell(c, TOP.cx * w, TOP.cy * w, TOP.rx * w, TOP.ry * w); c.fill();
    c.strokeStyle = rgba(line, 0.45); c.lineWidth = lw * 0.6;
    c.beginPath(); c.ellipse(TOP.cx * w, TOP.cy * w, TOP.rx * w, TOP.ry * w, 0, Math.PI * 0.08, Math.PI * 0.92); c.stroke();
    // a sparkle of gloss on the surface
    c.fillStyle = rgba('#FFFFFF', ac ? 0.55 : 0.9);
    ell(c, -0.2 * w, 0.0, 0.08 * w, 0.02 * w); c.fill();
  }

  function paintPlanet(c, w, colKey, mood, variant) {
    var ac = colOf(colKey), R = 0.4 * w, cy = R;
    var base = ac ? ac.base : PLANETS[(variant || 0) % 3];
    var dark = ac ? ac.dark : mix(base, '#3A3570', 0.45);
    var shade = ac ? ac.shade : mix(base, '#6F6AA8', 0.25);
    var light = ac ? ac.light : mix(base, '#FFFFFF', 0.6);
    var ringC = ac ? mix(ac.base, '#FFFFFF', 0.55) : '#FFF3C4', ringL = ac ? ac.dark : '#B6A36A';
    var lw = Math.max(2, w * 0.022), tilt = -0.28;
    function ring(front) {
      c.save();
      c.translate(0, cy); c.rotate(tilt);
      c.beginPath();
      c.ellipse(0, 0, R * 1.3, R * 0.3, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
      c.strokeStyle = ringL; c.lineWidth = R * 0.15 + lw * 2; c.globalAlpha = 0.85; c.stroke();
      c.strokeStyle = ringC; c.lineWidth = R * 0.15; c.globalAlpha = 1; c.stroke();
      c.strokeStyle = rgba('#FFFFFF', 0.6); c.lineWidth = R * 0.04; c.stroke();
      c.restore();
    }
    // glow halo (soft)
    var g = c.createRadialGradient(0, cy, R * 0.9, 0, cy, R * 1.35);
    g.addColorStop(0, rgba(light, 0.35)); g.addColorStop(1, rgba(light, 0));
    c.fillStyle = g; c.beginPath(); c.arc(0, cy, R * 1.35, 0, Math.PI * 2); c.fill();
    ring(false);
    if (ac) { c.fillStyle = 'rgba(51,54,79,0.55)'; c.beginPath(); c.arc(0, cy, R + lw + Math.max(2, w * 0.016), 0, Math.PI * 2); c.fill(); }   // ink ring (visual QA P2-3)
    c.fillStyle = dark; c.beginPath(); c.arc(0, cy, R + lw, 0, Math.PI * 2); c.fill();
    c.fillStyle = base; c.beginPath(); c.arc(0, cy, R, 0, Math.PI * 2); c.fill();
    c.save(); c.beginPath(); c.arc(0, cy, R, 0, Math.PI * 2); c.clip();
    c.fillStyle = shade; c.beginPath(); c.arc(R * 0.32, cy + R * 0.3, R * 1.02, 0, Math.PI * 2);
    c.arc(-R * 0.1, cy - R * 0.2, R * 1.1, 0, Math.PI * 2, true); c.fill('evenodd');
    // craters
    [[-0.35, 0.22, 0.17], [0.3, -0.05, 0.12], [0.05, 0.55, 0.09]].forEach(function (k) {
      c.fillStyle = shade; ell(c, k[0] * R, cy + k[1] * R, k[2] * R, k[2] * R * 0.8); c.fill();
      c.fillStyle = rgba(dark, 0.35); ell(c, k[0] * R + k[2] * R * 0.15, cy + k[1] * R + k[2] * R * 0.15, k[2] * R * 0.75, k[2] * R * 0.55); c.fill();
    });
    c.fillStyle = rgba('#FFFFFF', 0.7);
    ell(c, -R * 0.4, cy - R * 0.55, R * 0.28, R * 0.13, -0.6); c.fill();
    c.restore();
    ring(true);
  }

  function drawIslandOne(ctx, w, style, colKey, mood, variant) {
    var wb = bucket(w), s = w / wb;
    var key = 'isl|' + style + '|' + (colKey || '-') + '|' + mood + '|' + (style === 'planet' ? (variant || 0) : 0) + '|' + wb;
    ctx.save();
    if (s !== 1) ctx.scale(s, s);
    cached(ctx, key, islandBox(wb, style), function (c) {
      if (style === 'planet') paintPlanet(c, wb, colKey, mood, variant); else paintCloud(c, wb, colKey, mood);
    });
    ctx.restore();
  }

  function drawIsland(ctx, w, opt) {
    opt = opt || {};
    var style = opt.style === 'planet' ? 'planet' : 'cloud';
    var colKey = colOf(opt.color) ? opt.color : null;
    var mood = Math.max(0, Math.min(3, +opt.mood || 0));
    var glow = Math.max(0, Math.min(1, +opt.glow || 0)), t = +opt.t || 0;
    if (glow > 0.01) {   // live halo: warm gold, pulsing
      var R = w * (0.62 + 0.04 * Math.sin(t * 5)), cy = style === 'planet' ? 0.4 * w : 0.18 * w;
      var g = ctx.createRadialGradient(0, cy, w * 0.2, 0, cy, R);
      g.addColorStop(0, rgba('#FFF2A8', 0.75 * glow)); g.addColorStop(0.6, rgba('#FFD86B', 0.4 * glow)); g.addColorStop(1, rgba('#FFD86B', 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, cy, R, 0, Math.PI * 2); ctx.fill();
    }
    var m0 = Math.floor(mood), fr = mood - m0;
    drawIslandOne(ctx, w, style, colKey, m0, opt.variant);
    if (fr > 0.02 && m0 < 3) {
      var a = ctx.globalAlpha;
      ctx.globalAlpha = a * fr;
      drawIslandOne(ctx, w, style, colKey, m0 + 1, opt.variant);
      ctx.globalAlpha = a;
    }
    if (glow > 0.01) {   // twinkles around the hinted island
      for (var i = 0; i < 3; i++) {
        var ph = t * 2.2 + i * 2.1, a2 = 0.5 + 0.5 * Math.sin(ph);
        ctx.save();
        ctx.globalAlpha *= glow * a2;
        ctx.translate(Math.cos(i * 2.1 + t * 0.6) * w * 0.48, (style === 'planet' ? 0.4 : 0.15) * w + Math.sin(i * 2.1 + t * 0.6) * w * 0.3);
        drawSpark(ctx, w * 0.12, '#FFFFFF');
        ctx.restore();
      }
    }
  }

  // ======================================================================= TOKENS
  function traceShape(ctx, shape, s) {
    ctx.beginPath();
    switch (shape) {
      case 'square': roundPoly(ctx, [[-0.42 * s, -0.42 * s], [0.42 * s, -0.42 * s], [0.42 * s, 0.42 * s], [-0.42 * s, 0.42 * s]], 0.1 * s); break;
      case 'rect': roundPoly(ctx, [[-0.55 * s, -0.3 * s], [0.55 * s, -0.3 * s], [0.55 * s, 0.3 * s], [-0.55 * s, 0.3 * s]], 0.09 * s); break;
      case 'triangle': roundPoly(ctx, [[0, -0.5 * s], [0.56 * s, 0.46 * s], [-0.56 * s, 0.46 * s]], 0.1 * s); break;
      case 'diamond': roundPoly(ctx, [[0, -0.55 * s], [0.4 * s, 0], [0, 0.55 * s], [-0.4 * s, 0]], 0.08 * s); break;
      case 'oval': ctx.ellipse(0, 0, 0.56 * s, 0.36 * s, 0, 0, Math.PI * 2); break;
      case 'star': {
        var v = [], rad = [];
        for (var k = 0; k < 10; k++) {
          var ang = (-90 + k * 36) * Math.PI / 180, r = k % 2 ? 0.25 * s : 0.58 * s;
          v.push([Math.cos(ang) * r, Math.sin(ang) * r + 0.05 * s]); rad.push(k % 2 ? 0.04 * s : 0.08 * s);
        }
        roundPoly(ctx, v, rad);
        break;
      }
      case 'heart':
        ctx.moveTo(0, -0.26 * s);
        ctx.bezierCurveTo(0.08 * s, -0.47 * s, 0.53 * s, -0.49 * s, 0.53 * s, -0.11 * s);
        ctx.bezierCurveTo(0.53 * s, 0.15 * s, 0.22 * s, 0.33 * s, 0, 0.5 * s);
        ctx.bezierCurveTo(-0.22 * s, 0.33 * s, -0.53 * s, 0.15 * s, -0.53 * s, -0.11 * s);
        ctx.bezierCurveTo(-0.53 * s, -0.49 * s, -0.08 * s, -0.47 * s, 0, -0.26 * s);
        ctx.closePath();
        break;
      default: ctx.arc(0, 0, 0.5 * s, 0, Math.PI * 2);
    }
  }
  // bottom of each shape (unit s) so the gem sits on the surface; and its half width
  var SHAPE_BOT = { circle: 0.5, square: 0.42, rect: 0.3, triangle: 0.46, diamond: 0.55, oval: 0.36, star: 0.5, heart: 0.5 };
  var SHAPE_TOP = { circle: 0.5, square: 0.42, rect: 0.3, triangle: 0.5, diamond: 0.55, oval: 0.36, star: 0.53, heart: 0.49 };

  // glossy gem: white sticker border, dark outline, one-step facet shade, gloss arc, sparkle. Centred at (0,0).
  function paintGem(c, shape, colKey, s) {
    var col = colOf(colKey) || COLORS.red, lw = Math.max(1.6, s * 0.05);
    // white sticker border + faint shadow
    c.save(); c.translate(0, s * 0.04); traceShape(c, shape, s); c.fillStyle = 'rgba(40,40,90,0.18)';
    c.lineJoin = 'round'; c.lineWidth = lw * 2 + s * 0.12; c.strokeStyle = 'rgba(40,40,90,0.18)'; c.stroke(); c.fill(); c.restore();
    traceShape(c, shape, s);
    c.lineJoin = 'round'; c.strokeStyle = '#FFFFFF'; c.lineWidth = lw * 2 + s * 0.12; c.stroke();
    c.strokeStyle = col.dark; c.lineWidth = lw * 2; c.stroke();
    c.fillStyle = col.base; c.fill();
    c.save(); traceShape(c, shape, s); c.clip();
    // facet shade lower-right
    c.fillStyle = col.shade; c.globalAlpha = 0.85;
    c.beginPath(); c.arc(s * 0.32, s * 0.38, s * 0.62, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;
    // inner lighter facet
    c.fillStyle = rgba(col.light, 0.55);
    c.save(); c.scale(0.62, 0.62); c.translate(-s * 0.08, -s * 0.1); traceShape(c, shape, s); c.restore(); c.fill();
    // gloss
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineCap = 'round'; c.lineWidth = s * 0.07;
    c.beginPath(); c.arc(0, 0, s * 0.3, Math.PI * 1.08, Math.PI * 1.42); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.95)'; ell(c, -s * 0.06, -s * 0.31, s * 0.035, s * 0.035); c.fill();
    c.restore();
    traceShape(c, shape, s); c.strokeStyle = col.dark; c.lineWidth = lw; c.stroke();
  }

  function paintStar(c, s, colKey) {   // s = tip-to-tip width
    var col = colOf(colKey) || GOLD, ro = s * 0.5, ri = ro * 0.43, lw = Math.max(1, s * 0.055);
    starPath(c, 0, s * 0.03, ro, ri, 0.1);
    c.lineJoin = 'round'; c.strokeStyle = col.dark; c.lineWidth = lw * 2; c.stroke();
    c.fillStyle = col.base; c.fill();
    c.save(); c.clip();
    c.fillStyle = col.shade || col.dark; c.globalAlpha = 0.6;
    c.beginPath(); c.arc(ro * 0.5, ro * 0.6, ro * 0.9, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
    c.restore();
    starPath(c, -ro * 0.04, -ro * 0.02, ro * 0.6, ri * 0.6, 0.14); c.fillStyle = rgba(col.base, 0.9); c.fill();
    if (s >= 10) { c.fillStyle = rgba(col.light || '#FFFFFF', 0.95); ell(c, -ro * 0.28, -ro * 0.22, ro * 0.16, ro * 0.09, -0.6); c.fill(); }
  }

  // dice-like layouts for 1..12 in a unit square (−1..1)
  var DICE = {
    1: [[0, 0]], 2: [[-0.5, -0.5], [0.5, 0.5]], 3: [[-0.6, -0.6], [0, 0], [0.6, 0.6]],
    4: [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]],
    5: [[-0.6, -0.6], [0.6, -0.6], [0, 0], [-0.6, 0.6], [0.6, 0.6]],
    6: [[-0.5, -0.65], [0.5, -0.65], [-0.5, 0], [0.5, 0], [-0.5, 0.65], [0.5, 0.65]]
  };
  function diceLayout(n) {
    if (DICE[n]) return { pts: DICE[n], r: n === 1 ? 0.62 : n <= 4 ? 0.42 : 0.34 };
    if (n <= 9) {   // 7–9: 3×3 grid filled row-wise, centred last row
      var pts = [], rows = [3, 3, n - 6];
      rows.forEach(function (cnt, ri) { for (var i = 0; i < cnt; i++) pts.push([(i - (cnt - 1) / 2) * 0.66, (ri - 1) * 0.66]); });
      return { pts: pts, r: 0.27 };
    }
    var p2 = [], rows2 = [4, 4, n - 8];   // 10–12: 4,4,2..4
    rows2.forEach(function (cnt, ri) { for (var i = 0; i < cnt; i++) p2.push([(i - (cnt - 1) / 2) * 0.52, (ri - 1) * 0.66]); });
    return { pts: p2, r: 0.22 };
  }

  function paintCard(c, w, h, fill, line) {
    var lw = Math.max(1.6, h * 0.035);
    c.fillStyle = 'rgba(40,40,90,0.18)'; rr(c, -w / 2, -h / 2 + h * 0.04, w, h, h * 0.2); c.fill();
    rr(c, -w / 2, -h / 2, w, h, h * 0.2);
    c.strokeStyle = '#FFFFFF'; c.lineWidth = lw * 2 + h * 0.07; c.stroke();
    c.strokeStyle = line; c.lineWidth = lw * 2; c.stroke();
    c.fillStyle = fill; c.fill();
    c.save(); c.clip(); c.fillStyle = rgba('#FFFFFF', 0.55); rr(c, -w / 2 + h * 0.06, -h / 2 + h * 0.05, w - h * 0.12, h * 0.22, h * 0.1); c.fill(); c.restore();
  }

  function fitFont(c, text, maxW, px, weight) {
    var size = px;
    c.font = (weight || '800') + ' ' + size + 'px ' + FONT;
    var m = c.measureText(text).width;
    if (m > maxW && m > 0) { size = Math.max(8, Math.floor(size * maxW / m)); c.font = (weight || '800') + ' ' + size + 'px ' + FONT; }
    return size;
  }
  function paintText(c, text, x, y, px, maxW, color, outline) {
    fitFont(c, text, maxW, px);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (outline) { c.lineJoin = 'round'; c.strokeStyle = outline; c.lineWidth = px * 0.16; c.strokeText(text, x, y); }
    c.fillStyle = color; c.fillText(text, x, y);
  }

  function tokenBox(token, size) {
    var k = token && token.kind;
    if (k === 'shape') {
      var sh = SHAPES.indexOf(token.shape || token.value) >= 0 ? (token.shape || token.value) : 'circle';
      var g = size * 0.86 * (token.scale || 1);
      return { w: g * 1.25, h: g * (SHAPE_TOP[sh] + SHAPE_BOT[sh]) + g * 0.16 };
    }
    if (k === 'stars') return { w: size * 0.92, h: size * 0.92 };
    if (k === 'number') return { w: size * 0.92, h: size };
    if (k === 'letter') return { w: size * 0.86, h: size * 0.86 };
    if (k === 'text') return { w: size * 1.5, h: size * 0.72 };
    if (k === 'animal' || k === 'size') return { w: size * (token.scale || 1), h: size * (token.scale || 1) };
    return { w: 0, h: 0 };
  }

  function starsN(token) {
    var n = token.n != null ? +token.n : +token.value;
    return isFinite(n) ? Math.max(0, Math.min(12, Math.round(n))) : 0;
  }

  // each painter draws with the token's BOTTOM centre at (0,0)
  function paintToken(c, token, size) {
    var k = token.kind;
    if (k === 'shape') {
      var sh = SHAPES.indexOf(token.shape || token.value) >= 0 ? (token.shape || token.value) : 'circle';
      var g = size * 0.86 * (token.scale || 1);
      c.save(); c.translate(0, -SHAPE_BOT[sh] * g - g * 0.1); paintGem(c, sh, token.color || 'red', g); c.restore();
    } else if (k === 'stars') {
      var n = starsN(token), cw = size * 0.92, L = diceLayout(n), half = cw * 0.36;
      c.save(); c.translate(0, -cw / 2);
      paintCard(c, cw, cw, '#FFFBF0', '#B9A6D8');
      L.pts.forEach(function (p) { c.save(); c.translate(p[0] * half, p[1] * half); paintStar(c, L.r * half * 2.2, null); c.restore(); });
      c.restore();
    } else if (k === 'number') {
      // stars under the numeral only in count-up rounds (token.showStars) and only up to 10, in ≤ 2 rows (visual QA P1-1)
      var num = String(token.value != null ? token.value : ''), hasStars = !!token.showStars && token.n != null && +token.n > 0 && +token.n <= 10;
      var bw = size * 0.92, R = hasStars ? size * 0.34 : size * 0.44, cy = hasStars ? -size + R + size * 0.02 : -R - size * 0.04;
      if (hasStars) {   // n tiny stars on a little cloud pill under the badge (≤ 2 rows of ≤ 5; drawn first so the badge stays on top)
        var n2 = Math.min(10, Math.round(+token.n)), rows = n2 > 5 ? 2 : 1, per = Math.ceil(n2 / rows);
        var st = Math.min(size * 0.2, bw / (per + 0.6)), ph = rows * st * 1.02 + st * 0.35, pw = per * st * 1.05 + st * 0.5;
        c.save(); c.translate(0, -ph / 2 - size * 0.01);
        c.fillStyle = '#FFFFFF'; rr(c, -pw / 2, -ph / 2, pw, ph, ph * 0.5); c.fill();
        c.strokeStyle = '#B9A6D8'; c.lineWidth = Math.max(1.2, st * 0.12); c.stroke();
        var idx = 0;
        for (var r = 0; r < rows; r++) {
          var cnt = Math.min(per, n2 - idx);
          for (var i = 0; i < cnt; i++, idx++) {
            c.save(); c.translate((i - (cnt - 1) / 2) * st * 1.05, (r - (rows - 1) / 2) * st * 1.02 + st * 0.03); paintStar(c, st, null); c.restore();
          }
        }
        c.restore();
      }
      c.save(); c.translate(0, cy);
      c.fillStyle = 'rgba(40,40,90,0.18)'; ell(c, 0, R * 0.08, R, R); c.fill();
      c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2);
      c.strokeStyle = '#FFFFFF'; c.lineWidth = R * 0.26; c.stroke();
      c.strokeStyle = '#6E5BB0'; c.lineWidth = R * 0.12; c.stroke();
      c.fillStyle = '#FFFFFF'; c.fill();
      c.save(); c.clip(); c.fillStyle = '#EEE9FB'; c.beginPath(); c.arc(R * 0.35, R * 0.45, R * 0.95, 0, Math.PI * 2); c.fill(); c.restore();
      paintText(c, num, 0, R * 0.06, R * (num.length > 1 ? 1.15 : 1.35), R * 1.6, INK, null);
      c.restore();
    } else if (k === 'letter' || k === 'text') {
      var txt = String(token.text != null ? token.text : token.value);
      var bh = k === 'letter' ? size * 0.86 : size * 0.72, bw2 = k === 'letter' ? bh : size * 1.5;
      c.save(); c.translate(0, -bh / 2);
      if (k === 'letter') {
        c.fillStyle = 'rgba(40,40,90,0.18)'; ell(c, 0, bh * 0.04, bh / 2, bh / 2); c.fill();
        c.beginPath(); c.arc(0, 0, bh / 2, 0, Math.PI * 2);
        c.strokeStyle = '#FFFFFF'; c.lineWidth = bh * 0.13; c.stroke();
        c.strokeStyle = '#2E7FB8'; c.lineWidth = bh * 0.06; c.stroke();
        c.fillStyle = '#FFFFFF'; c.fill();
        c.save(); c.clip(); c.fillStyle = '#E6F3FC'; c.beginPath(); c.arc(bh * 0.18, bh * 0.22, bh * 0.48, 0, Math.PI * 2); c.fill(); c.restore();
        paintText(c, txt, 0, bh * 0.04, bh * 0.66, bh * 0.78, INK, null);
      } else {
        paintCard(c, bw2, bh, '#FFFFFF', '#2E7FB8');
        paintText(c, txt, 0, bh * 0.04, bh * 0.58, bw2 * 0.86, INK, null);
      }
      c.restore();
    }
  }

  function drawToken(ctx, token, size, opt) {
    if (!token) return;
    opt = opt || {};
    var k = token.kind, a0 = ctx.globalAlpha;
    if (opt.alpha != null) ctx.globalAlpha = a0 * opt.alpha;
    if (k === 'animal' || k === 'size') {
      var s = size * (token.scale || 1);
      ctx.fillStyle = 'rgba(40,40,90,0.16)'; ell(ctx, 0, -s * 0.02, s * 0.32, s * 0.06); ctx.fill();
      var name = token.animal || token.sprite || (k === 'animal' ? token.value : token.nameValue) || token.value;
      if (typeof opt.sprite === 'function') opt.sprite(name, 0, -s / 2, s, !!opt.wave);
    } else if (k !== 'color' && k) {
      var sb = bucket(size);
      var key = 'tok|' + k + '|' + (token.shape || '') + '|' + (token.color || '') + '|' + (token.text != null ? token.text : token.value) + '|' +
        (token.n != null ? token.n : '') + '|' + (token.showStars ? 's' : '') + '|' + (token.scale || 1) + '|' + sb;
      var bx = tokenBox(token, sb);
      ctx.save();
      if (sb !== size) ctx.scale(size / sb, size / sb);
      // contact shadow on the surface
      ctx.fillStyle = 'rgba(40,40,90,0.14)'; ell(ctx, 0, 0, bx.w * 0.36, sb * 0.05); ctx.fill();
      cached(ctx, key, { x0: -bx.w * 0.75 - 6, y0: -sb * 1.12 - 6, x1: bx.w * 0.75 + 6, y1: sb * 0.1 + 6 }, function (c) { paintToken(c, token, sb); });
      ctx.restore();
    }
    ctx.globalAlpha = a0;
  }

  // ======================================================================= RIBBON
  function drawRibbon(ctx, pts, width) {
    if (!pts || pts.length < 2) return;
    width = width || 30;
    // smooth: one Chaikin pass, keep a
    var p = [pts[0]];
    for (var i = 0; i < pts.length - 1; i++) {
      var A = pts[i], B = pts[i + 1], aa = A.a == null ? 1 : A.a, ab = B.a == null ? 1 : B.a;
      p.push({ x: A.x * 0.75 + B.x * 0.25, y: A.y * 0.75 + B.y * 0.25, a: aa * 0.75 + ab * 0.25 });
      p.push({ x: A.x * 0.25 + B.x * 0.75, y: A.y * 0.25 + B.y * 0.75, a: aa * 0.25 + ab * 0.75 });
    }
    p.push(pts[pts.length - 1]);
    // normals
    var n = p.length, nx = new Array(n), ny = new Array(n);
    for (var j = 0; j < n; j++) {
      var P = p[Math.max(0, j - 1)], Q = p[Math.min(n - 1, j + 1)], dx = Q.x - P.x, dy = Q.y - P.y, L = Math.hypot(dx, dy) || 1;
      nx[j] = -dy / L; ny[j] = dx / L;
    }
    // per-point half width (tapers with a); bands are filled strips, chunked so each chunk has its own alpha
    var hw = new Array(n);
    for (j = 0; j < n; j++) hw[j] = width * 0.5 * (0.3 + 0.7 * (p[j].a == null ? 1 : p[j].a));
    function strip(s0, e0, o0, o1, grow) {   // o0/o1 = offsets in units of the half width (−1..1)
      ctx.beginPath();
      for (var q = s0; q <= e0; q++) { var h = hw[q] + grow; ctx[q === s0 ? 'moveTo' : 'lineTo'](p[q].x + nx[q] * h * o0, p[q].y + ny[q] * h * o0); }
      for (q = e0; q >= s0; q--) { var h2 = hw[q] + grow; ctx.lineTo(p[q].x + nx[q] * h2 * o1, p[q].y + ny[q] * h2 * o1); }
      ctx.closePath(); ctx.fill();
    }
    ctx.save();
    var CH = 6;
    for (var s0 = 0; s0 < n - 1; s0 += CH) {
      var e0 = Math.min(n - 1, s0 + CH), am = 0, cnt = 0;
      for (var q = s0; q <= e0; q++) { am += (p[q].a == null ? 1 : p[q].a); cnt++; }
      am /= cnt;
      if (am <= 0.02) continue;
      ctx.globalAlpha = 0.28 * am; ctx.fillStyle = '#FFFFFF'; strip(s0, e0, -1, 1, 3.5);   // soft white halo
      ctx.globalAlpha = Math.min(1, 1.1 * am);
      for (var b = 0; b < 6; b++) { ctx.fillStyle = BANDS[b]; strip(s0, e0, -1 + b / 3, -1 + (b + 1) / 3 + (b < 5 ? 0.02 : 0), 0); }
    }
    ctx.restore();
  }

  // ======================================================================= FLAME + PUFF
  function teardrop(ctx, w, L) {   // from the origin downwards, round head near the nozzle, pointed tail at +L
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0);
    ctx.bezierCurveTo(-w * 0.62, L * 0.32, -w * 0.32, L * 0.72, 0, L);
    ctx.bezierCurveTo(w * 0.32, L * 0.72, w * 0.62, L * 0.32, w / 2, 0);
    ctx.quadraticCurveTo(0, -w * 0.2, -w / 2, 0);
    ctx.closePath();
  }
  function drawFlame(ctx, power, t, scale) {
    power = Math.max(0, Math.min(1, +power || 0));
    if (power < 0.02) return;
    t = +t || 0; scale = scale || 1;
    var f1 = Math.sin(t * 31) * 0.5 + Math.sin(t * 17.3 + 1) * 0.5, f2 = Math.sin(t * 23.7 + 2), f3 = Math.sin(t * 41.1);
    var L = (12 + 62 * power) * (1 + 0.1 * f1) * scale, W = (26 + 12 * power) * scale;
    ctx.save();
    ctx.rotate(0.04 * f2);
    // glow
    var g = ctx.createRadialGradient(0, L * 0.3, 0, 0, L * 0.3, L * 0.8 + W);
    g.addColorStop(0, 'rgba(255,200,90,' + (0.35 * power).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,170,80,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, L * 0.3, L * 0.8 + W, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#FF7A3C'; teardrop(ctx, W * 1.1, L); ctx.fill();
    ctx.save(); ctx.translate(W * 0.04 * f3, 0); ctx.fillStyle = '#FFA43C'; teardrop(ctx, W * 0.86, L * 0.8 * (1 + 0.06 * f2)); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#FFD45A'; teardrop(ctx, W * 0.62, L * 0.6 * (1 + 0.08 * f3)); ctx.fill();
    ctx.fillStyle = '#FFF6D0'; teardrop(ctx, W * 0.36, L * 0.36 * (1 + 0.1 * f1)); ctx.fill();
    // little flying sparks
    for (var i = 0; i < 3; i++) {
      var ph = (t * 3.1 + i * 0.37) % 1, x = Math.sin(i * 5.3 + t * 7) * W * 0.4 * ph, y = L * (0.55 + ph * 0.6);
      ctx.globalAlpha = (1 - ph) * power;
      ctx.fillStyle = i % 2 ? '#FFD45A' : '#FFF6D0';
      ctx.beginPath(); ctx.arc(x, y, (2.4 - ph * 1.4) * scale, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function drawPuff(ctx, size, alpha, mood) {
    var a = alpha == null ? 1 : alpha, r = size / 2;
    var fill = mood === 3 ? '#C8CFEE' : mood === 2 ? '#FFEFF0' : '#FFFFFF', sh = mood === 3 ? '#9EA8D6' : '#DCE2F6';
    ctx.save(); ctx.globalAlpha *= a;
    ctx.fillStyle = sh;
    [[0.08, 0.12, 0.62], [-0.38, 0.2, 0.42], [0.45, 0.18, 0.42]].forEach(function (c) { ctx.beginPath(); ctx.arc(c[0] * r, c[1] * r, c[2] * r, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = fill;
    [[0, 0, 0.6], [-0.42, 0.12, 0.4], [0.42, 0.1, 0.4], [-0.1, -0.3, 0.38]].forEach(function (c) { ctx.beginPath(); ctx.arc(c[0] * r, c[1] * r, c[2] * r, 0, Math.PI * 2); ctx.fill(); });
    ctx.restore();
  }

  // ======================================================================= BOOST BUTTON
  function paintRocketGlyph(c, s) {   // little upright rocket, centred, height ≈ s
    var lw = Math.max(1.5, s * 0.05);
    c.save();
    c.lineJoin = 'round'; c.lineCap = 'round';
    // fins
    c.fillStyle = TEAL.base; c.strokeStyle = TEAL.line; c.lineWidth = lw;
    [-1, 1].forEach(function (sd) {
      c.beginPath(); c.moveTo(sd * s * 0.14, s * 0.02); c.quadraticCurveTo(sd * s * 0.34, s * 0.12, sd * s * 0.33, s * 0.36);
      c.lineTo(sd * s * 0.12, s * 0.26); c.closePath(); c.fill(); c.stroke();
    });
    // body
    c.beginPath(); c.moveTo(0, -s * 0.5);
    c.bezierCurveTo(s * 0.26, -s * 0.34, s * 0.24, s * 0.16, s * 0.15, s * 0.3);
    c.lineTo(-s * 0.15, s * 0.3);
    c.bezierCurveTo(-s * 0.24, s * 0.16, -s * 0.26, -s * 0.34, 0, -s * 0.5); c.closePath();
    c.fillStyle = '#FFF4E2'; c.fill(); c.strokeStyle = '#8A6E4E'; c.stroke();
    // nose
    c.save(); c.clip(); c.fillStyle = TEAL.base; c.fillRect(-s, -s * 0.6, s * 2, s * 0.24); c.restore();
    c.beginPath(); c.moveTo(0, -s * 0.5);
    c.bezierCurveTo(s * 0.26, -s * 0.34, s * 0.24, s * 0.16, s * 0.15, s * 0.3); c.lineTo(-s * 0.15, s * 0.3);
    c.bezierCurveTo(-s * 0.24, s * 0.16, -s * 0.26, -s * 0.34, 0, -s * 0.5); c.closePath(); c.strokeStyle = '#8A6E4E'; c.stroke();
    // window
    c.beginPath(); c.arc(0, -s * 0.08, s * 0.1, 0, Math.PI * 2); c.fillStyle = '#CFEFFF'; c.fill();
    c.strokeStyle = RIM_GOLD.dark; c.lineWidth = lw * 1.1; c.stroke();
    c.fillStyle = '#FFFFFF'; c.beginPath(); c.arc(-s * 0.035, -s * 0.115, s * 0.03, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  function paintButtonFace(c, r) {
    // gold rim + teal face + white highlight
    c.fillStyle = 'rgba(20,40,60,0.25)'; c.beginPath(); c.arc(0, r * 0.08, r, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fillStyle = RIM_GOLD.dark; c.fill();
    c.beginPath(); c.arc(0, 0, r * 0.95, 0, Math.PI * 2); c.fillStyle = RIM_GOLD.base; c.fill();
    c.beginPath(); c.arc(0, -r * 0.02, r * 0.8, 0, Math.PI * 2); c.fillStyle = TEAL.line; c.fill();
    var g = c.createLinearGradient(0, -r * 0.8, 0, r * 0.8);
    g.addColorStop(0, '#47C2BA'); g.addColorStop(1, TEAL.dark);
    c.beginPath(); c.arc(0, -r * 0.02, r * 0.76, 0, Math.PI * 2); c.fillStyle = g; c.fill();
    c.save(); c.beginPath(); c.arc(0, -r * 0.02, r * 0.76, 0, Math.PI * 2); c.clip();
    c.fillStyle = 'rgba(255,255,255,0.22)'; ell(c, -r * 0.1, -r * 0.5, r * 0.62, r * 0.32); c.fill(); c.restore();
    c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = r * 0.05; c.lineCap = 'round';
    c.beginPath(); c.arc(0, 0, r * 0.88, Math.PI * 1.1, Math.PI * 1.4); c.stroke();
    // rivets on the rim
    for (var i = 0; i < 12; i++) {
      var a = i / 12 * Math.PI * 2;
      c.fillStyle = RIM_GOLD.light; c.beginPath(); c.arc(Math.cos(a) * r * 0.875, Math.sin(a) * r * 0.875, r * 0.025, 0, Math.PI * 2); c.fill();
    }
    c.save(); c.translate(0, -r * 0.1); paintRocketGlyph(c, r * 1.12); c.restore();
  }
  function drawBoostButton(ctx, r, t, pressed) {
    t = +t || 0;
    var pulse = pressed ? 0.92 : 1 + 0.06 * Math.sin(t * 5);
    ctx.save();
    // expanding rings (calls to tap)
    if (!pressed) {
      for (var i = 0; i < 2; i++) {
        var ph = (t * 0.9 + i * 0.5) % 1;
        ctx.globalAlpha = (1 - ph) * 0.7;
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = r * 0.08 * (1 - ph) + 1;
        ctx.beginPath(); ctx.arc(0, 0, r * (1 + ph * 0.45), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      var g = ctx.createRadialGradient(0, 0, r * 0.7, 0, 0, r * 1.4);
      g.addColorStop(0, 'rgba(255,230,140,0.55)'); g.addColorStop(1, 'rgba(255,230,140,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 1.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.scale(pulse, pulse);
    if (!pressed) ctx.translate(0, -r * 0.03 * Math.max(0, Math.sin(t * 5)));
    cached(ctx, 'boost|' + Math.round(r), { x0: -r - 2, y0: -r - 2, x1: r + 2, y1: r * 1.1 + 2 }, function (c) { paintButtonFace(c, r); });
    // live flame under the glyph
    ctx.save(); ctx.translate(0, r * 0.25); drawFlame(ctx, 0.5 + 0.2 * Math.sin(t * 9), t, r / 160); ctx.restore();
    if (pressed) { ctx.fillStyle = 'rgba(0,30,40,0.18)'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  // ======================================================================= SPARK + STAR
  function drawSpark(ctx, size, color) {
    var s = size / 2, c = colOf(color) ? colOf(color).light : (color || '#FFFFFF');
    ctx.save();
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.quadraticCurveTo(s * 0.14, -s * 0.14, s, 0); ctx.quadraticCurveTo(s * 0.14, s * 0.14, 0, s);
    ctx.quadraticCurveTo(-s * 0.14, s * 0.14, -s, 0); ctx.quadraticCurveTo(-s * 0.14, -s * 0.14, 0, -s);
    ctx.fill();
    ctx.globalAlpha *= 0.55; ctx.beginPath(); ctx.arc(0, 0, s * 0.28, 0, Math.PI * 2); ctx.fillStyle = '#FFFFFF'; ctx.fill();
    ctx.restore();
  }
  function drawStar(ctx, size, color) {
    var col = colOf(color) ? color : (typeof color === 'string' && color.charAt(0) === '#' ? color : null);
    ctx.save();
    if (size >= 14) {
      var sb = bucket(size);
      ctx.scale(size / sb, size / sb);
      cached(ctx, 'star|' + (col || 'gold') + '|' + sb, { x0: -sb * 0.6, y0: -sb * 0.6, x1: sb * 0.6, y1: sb * 0.65 }, function (c) { paintStar(c, sb, col); });
    } else paintStar(ctx, size, col);
    ctx.restore();
  }

  // ======================================================================= ROCKET COMPOSITE
  var ANCHORS = {
    bim: { w: 256, h: 256, neck: [128, 236] }, bimFull: { w: 256, h: 300, feet: [128, 288] },
    rocket: { w: 200, h: 300, nozzle: [100, 286], neck: [100, 118], feetY: 296, bimScale: 0.55, rimTop: 112,
      canopy: { cx: 100, cy: 76, r: 68 } },
    wagon: { w: 160, h: 110, hitch: [80, 18], seat: [80, 60] }, star: { w: 64, h: 64 }, icon: { w: 512, h: 512 }
  };
  function drawRocket(ctx, h, imgs, opt) {
    opt = opt || {};
    var A = ANCHORS.rocket, k = h / A.h, bs = (opt.bimScale || A.bimScale) * k;
    ctx.save();
    ctx.scale(k, k); ctx.translate(-A.w / 2, -A.feetY);
    if (opt.flame) { ctx.save(); ctx.translate(A.nozzle[0], A.nozzle[1] - 2); drawFlame(ctx, opt.flame, opt.t || 0, A.h / 190); ctx.restore(); }
    if (imgs && imgs.back) ctx.drawImage(imgs.back, 0, 0, A.w, A.h);
    if (imgs && imgs.bim) {
      ctx.save(); ctx.translate(A.neck[0], A.neck[1]); ctx.scale(bs / k, bs / k);
      ctx.drawImage(imgs.bim, -128, -236, 256, 256); ctx.restore();
    }
    if (imgs && imgs.front) ctx.drawImage(imgs.front, 0, 0, A.w, A.h);
    ctx.restore();
  }

  RR.SkyArt = {
    COLORS: COLORS, SHAPES: SHAPES, BANDS: BANDS, MOODS: MOODS, ANCHORS: ANCHORS,
    drawIsland: drawIsland, islandBox: islandBox, drawToken: drawToken, tokenBox: tokenBox,
    drawRibbon: drawRibbon, drawFlame: drawFlame, drawPuff: drawPuff, drawBoostButton: drawBoostButton,
    drawSpark: drawSpark, drawStar: drawStar, drawRocket: drawRocket, clearCache: clearCache, _mix: mix
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = RR.SkyArt;
})(typeof window !== 'undefined' ? window : globalThis);
