/* Nini's Sea Painting — SP.PaintArt (character artist B), DESIGN §3 / §4.2. Everything here is drawn by code on a 2D canvas.
 *
 *   drawCanvasFrame(ctx, box, opt)       the rope-and-sand framed cream board; box = {x, y, w, h} (= layout.canvas inner
 *                                        area, the picture box); opt {glow 0..1, night 0..1, time}
 *   drawPicture(ctx, pic, st, opt)       origin = picture top-left (600 × 400 picture px; the caller scales). st = { partId:
 *       { color: name|hex|null, t 0..1, ox, oy, glow 0..1, wob px, sparkle 0..1 } } (an array of objects with `id` works too).
 *       Order: under → every part (area desc = small parts on top): navy outline (drawn under its fill, so the visible line
 *       is 6 px) + white fill + colour (radial grow from (ox, oy) with a wobbly wet edge, clipped; at t = 1 full fill +
 *       highlight upper-left + shade lower-right) → glow rims (gold halo + pulsing dashed gold outline) → deco → label text
 *       → sparkles. opt {time (s), alpha}
 *   drawPaintShell(ctx, color, r, opt)   open clam shell holding a paint blob, origin = centre, ≈ 2r wide;
 *                                        opt {lift 0..1, wob px, glow 0..1, selected bool|0..1, dim bool|0..1, time}
 *   drawBrush(ctx, color, size, angle, opt)  origin = bristle tip; angle 0 = handle straight up (radians, clockwise);
 *                                        size = total length; color null → clean cream bristles; opt {drip 0..1}
 *   drawSplash(ctx, color, r, t)         paint splash burst at the origin, t 0..1
 *   drawIcon(ctx, thing, size)           centred on the origin in a size × size box. thing.kind: 'blob' {color} · 'shape'
 *       {shape, color?} · 'animal' {animal, color?} · 'number' {n} · 'letter' {text} · 'dots' {n} · 'size' {size, animal, color?}
 *   drawGhostHand(ctx, size, t)          friendly pointing hand, origin = fingertip (finger points UP), t = 0..1 tap phase
 *   Helpers: pal(color) → {base, dark, light} | null, PALETTE (fallback table), FONT, NAVY, clearCache().
 * Path2D objects are cached per path string (node: nothing is drawn, nothing is cached).
 */
(function (SP) {
  'use strict';

  var FALLBACK_PALETTE = {
    red:    { base: '#E84A4A', dark: '#A8282E', light: '#F7A0A0' },
    blue:   { base: '#3C8DE8', dark: '#1F5BA8', light: '#A6CCF5' },
    yellow: { base: '#FFD23F', dark: '#C99A12', light: '#FFEB9C' },
    green:  { base: '#4CC26B', dark: '#2A8343', light: '#A8E6B8' },
    orange: { base: '#FF9A2E', dark: '#C4650C', light: '#FFCB8E' },
    purple: { base: '#8E44AD', dark: '#6840A8', light: '#D2BDF3' },
    pink:   { base: '#FF8FC0', dark: '#C9558A', light: '#FFCCE2' }
  };
  var NAVY = '#33405E', NAVY_DK = '#1E2740', CREAM = '#F8EAD3', LW = 6;   // warmer board: white parts stand out (visual P3-1)
  var FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif';
  var TAU = Math.PI * 2;

  // ---------------------------------------------------------------- colour helpers
  function rgb(h) { h = String(h).replace('#', ''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
  function mix(a, b, t) {
    var A = rgb(a), B = rgb(b), o = '#';
    for (var i = 0; i < 3; i++) { var v = Math.round(A[i] + (B[i] - A[i]) * t); o += (v < 16 ? '0' : '') + v.toString(16); }
    return o.toUpperCase();
  }
  function rgba(h, a) { var c = rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (+a).toFixed(3) + ')'; }
  function clamp01(v) { v = +v || 0; return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lum(h) {   // relative luminance (WCAG) of a #rrggbb colour
    var c = rgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function smooth01(v) { v = clamp01(v); return v * v * (3 - 2 * v); }
  function nowSec() { return (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000; }
  function pal(c) {
    if (!c) return null;
    var P = SP.PALETTE || FALLBACK_PALETTE, p = (P && P[c]) || FALLBACK_PALETTE[c];
    if (p && typeof p === 'object' && p.base) return { base: p.base, dark: p.dark || mix(p.base, '#000000', 0.35), light: p.light || mix(p.base, '#FFFFFF', 0.45) };
    if (typeof p === 'string') c = p;
    if (typeof c === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c)) return { base: c, dark: mix(c, '#000000', 0.32), light: mix(c, '#FFFFFF', 0.5) };
    return null;
  }
  function hash(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h % 1000) / 1000; }
  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
  }

  // ---------------------------------------------------------------- Path2D cache
  var cache = {}, cacheN = 0, MAX_CACHE = 600;
  function P2(d) {
    if (typeof Path2D === 'undefined') return null;
    var p = cache[d];
    if (!p) {
      if (cacheN > MAX_CACHE) { cache = {}; cacheN = 0; }
      p = cache[d] = new Path2D(d); cacheN++;
    }
    return p;
  }
  function clearCache() { cache = {}; cacheN = 0; iconPics = {}; }
  var sortedOf = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function sortedParts(pic) {
    var s = sortedOf && sortedOf.get(pic);
    if (!s || s.n !== pic.parts.length) {
      s = { n: pic.parts.length, list: pic.parts.slice().sort(function (a, b) { return (b.area || 0) - (a.area || 0); }) };
      if (sortedOf) sortedOf.set(pic, s);
    }
    return s.list;
  }
  function stateMap(st) {
    if (!st) return {};
    if (!Array.isArray(st)) return st;
    var m = {}; st.forEach(function (q) { if (q && q.id != null) m[q.id] = q; }); return m;
  }
  function bboxOf(part) {
    if (part.bbox) return part.bbox;
    var r = 60; return [part.cx - r, part.cy - r, part.cx + r, part.cy + r];
  }

  // ================================================================ PICTURE
  function wobblyBlob(ctx, ox, oy, r, seed, time) {   // the wet paint edge: a slightly wavy circle
    var n = 30;
    ctx.beginPath();
    for (var i = 0; i <= n; i++) {
      var a = i / n * TAU;
      var k = 1 + 0.06 * Math.sin(a * 3 + seed * 9 + time * 1.7) + 0.04 * Math.sin(a * 7 - seed * 5 + time * 2.3) + 0.025 * Math.sin(a * 11 + seed * 3);
      var x = ox + Math.cos(a) * r * k, y = oy + Math.sin(a) * r * k;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
  }
  function paintFill(ctx, part, path, s, c, time) {
    var t = clamp01(s.t), b = bboxOf(part), w = b[2] - b[0], h = b[3] - b[1];
    ctx.save();
    ctx.clip(path);
    if (t >= 1) { ctx.fillStyle = c.base; ctx.fillRect(b[0] - 8, b[1] - 8, w + 16, h + 16); }
    else {
      var ox = s.ox == null ? part.cx : s.ox, oy = s.oy == null ? part.cy : s.oy;
      var far = 0;
      [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]].forEach(function (q) { far = Math.max(far, Math.hypot(q[0] - ox, q[1] - oy)); });
      var r = (far + 16) * t, seed = hash(part.id);
      wobblyBlob(ctx, ox, oy, r, seed, time);
      ctx.fillStyle = c.base; ctx.fill();
      ctx.lineWidth = 7; ctx.strokeStyle = rgba(c.light, 0.55 * (1 - t)); ctx.stroke();   // wet rim
      ctx.lineWidth = 2.5; ctx.strokeStyle = rgba(c.dark, 0.35 * (1 - t)); ctx.stroke();
    }
    var k = smooth01((t - 0.72) / 0.28);
    if (k > 0) {
      var g = ctx.createLinearGradient(b[0], b[1], b[2], b[3]);
      g.addColorStop(0, rgba(c.dark, 0)); g.addColorStop(0.58, rgba(c.dark, 0)); g.addColorStop(1, rgba(c.dark, 0.2 * k));
      ctx.fillStyle = g; ctx.fillRect(b[0] - 8, b[1] - 8, w + 16, h + 16);
      var m = Math.min(w, h), hx = b[0] + w * 0.32, hy = b[1] + h * 0.27;
      var hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, m * 0.42);
      hg.addColorStop(0, 'rgba(255,255,255,' + (0.5 * k).toFixed(3) + ')'); hg.addColorStop(0.55, 'rgba(255,255,255,' + (0.18 * k).toFixed(3) + ')');
      hg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hg; ctx.fillRect(b[0] - 8, b[1] - 8, w + 16, h + 16);
    }
    ctx.restore();
  }
  function sparkleStar(ctx, x, y, r, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.beginPath();
    for (var i = 0; i < 8; i++) { var q = i % 2 ? r * 0.28 : r, an = i * Math.PI / 4; if (i) ctx.lineTo(Math.cos(an) * q, Math.sin(an) * q); else ctx.moveTo(q, 0); }
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function drawPicture(ctx, pic, st, opt) {
    if (!pic || !pic.parts) return;
    opt = opt || {};
    var time = opt.time == null ? nowSec() : opt.time, S = stateMap(st), parts = sortedParts(pic), i, p, s, path;
    var wobOf = {};
    ctx.save();
    if (opt.alpha != null) ctx.globalAlpha *= clamp01(opt.alpha);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    (pic.under || []).forEach(function (u) { var q = P2(u.d); if (q) { ctx.fillStyle = u.fill || '#EEF6F4'; ctx.fill(q); } });
    for (i = 0; i < parts.length; i++) {
      p = parts[i]; s = S[p.id] || {}; path = P2(p.d);
      if (!path) continue;
      var wob = +s.wob || 0; wobOf[p.id] = wob;
      ctx.save();
      if (wob) ctx.translate(wob, 0);
      var c = pal(s.color), dark = !!(c && s.t > 0.4 && lum(c.base) < 0.2);
      // purple / blue / red fills: a darker outline + a thin light inner line so the shape still reads (visual P2-6)
      ctx.lineWidth = LW * 2; ctx.strokeStyle = dark ? NAVY_DK : NAVY; ctx.stroke(path);
      ctx.fillStyle = '#FFFFFF'; ctx.fill(path);
      if (!(c && s.t >= 1)) {   // unpainted: a faint inner shadow lifts the white part off the cream board
        ctx.save(); ctx.clip(path); ctx.lineWidth = 14; ctx.strokeStyle = 'rgba(51,64,94,0.09)'; ctx.stroke(path); ctx.restore();
      }
      if (c && s.t > 0) paintFill(ctx, p, path, s, c, time);
      if (dark) {
        ctx.save(); ctx.clip(path); ctx.lineWidth = 4 + LW * 2;
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.55 * smooth01((s.t - 0.4) / 0.6)).toFixed(3) + ')'; ctx.stroke(path);
        ctx.lineWidth = LW * 2; ctx.strokeStyle = NAVY_DK; ctx.stroke(path);
        ctx.restore();
      }
      ctx.restore();
    }
    // glow rims (the target that shines)
    for (i = 0; i < parts.length; i++) {
      p = parts[i]; s = S[p.id];
      if (!s || !(s.glow > 0)) continue;
      path = P2(p.d);
      // a steady target glow reads strong on big parts too (visual P2-5): boosted level + a soft gold fill over the whole area
      var gl = clamp01(s.glow * 1.3), pulse = 0.5 + 0.5 * Math.sin(time * 6);
      ctx.save();
      if (wobOf[p.id]) ctx.translate(wobOf[p.id], 0);
      ctx.fillStyle = 'rgba(255,214,90,' + ((s.t > 0 ? 0.12 : 0.26) * gl * (0.6 + 0.4 * pulse)).toFixed(3) + ')'; ctx.fill(path);
      ctx.lineWidth = 26; ctx.strokeStyle = 'rgba(255,206,70,' + (0.30 * gl * (0.55 + 0.45 * pulse)).toFixed(3) + ')'; ctx.stroke(path);
      ctx.lineWidth = 15; ctx.strokeStyle = 'rgba(255,236,150,' + (0.45 * gl).toFixed(3) + ')'; ctx.stroke(path);
      if (ctx.setLineDash) { ctx.setLineDash([18, 12]); ctx.lineDashOffset = -time * 40; }
      ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(232,160,20,' + (0.95 * gl).toFixed(3) + ')'; ctx.stroke(path);
      if (ctx.setLineDash) ctx.setLineDash([]);
      ctx.restore();
    }
    // deco (eyes, mouths, scales…) on top of the fills
    (pic.deco || []).forEach(function (q) {
      var dp = P2(q.d); if (!dp) return;
      var wb = q.part ? wobOf[q.part] || 0 : 0;
      if (wb) { ctx.save(); ctx.translate(wb, 0); }
      if (q.fill) { ctx.fillStyle = q.fill; ctx.fill(dp); }
      if (q.stroke) { ctx.lineWidth = q.width || 5; ctx.strokeStyle = q.stroke; ctx.stroke(dp); }
      if (wb) ctx.restore();
    });
    // labels
    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      if (p.text == null || p.text === '') continue;
      var b = bboxOf(p), r = Math.min(b[2] - b[0], b[3] - b[1]) / 2, txt = String(p.text);
      var fs = r * (txt.length > 2 ? 0.78 : txt.length > 1 ? 0.98 : 1.18);
      ctx.save();
      if (wobOf[p.id]) ctx.translate(wobOf[p.id], 0);
      ctx.font = '800 ' + Math.round(fs) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var tx = (b[0] + b[2]) / 2, ty = (b[1] + b[3]) / 2 + fs * 0.05;
      ctx.lineWidth = Math.max(6, fs * 0.16); ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.strokeText(txt, tx, ty);
      ctx.fillStyle = NAVY; ctx.fillText(txt, tx, ty);
      ctx.restore();
    }
    // sparkles
    for (i = 0; i < parts.length; i++) {
      p = parts[i]; s = S[p.id];
      if (!s || !(s.sparkle > 0)) continue;
      var bb = bboxOf(p), cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2, rad = Math.min(bb[2] - bb[0], bb[3] - bb[1]) * 0.42;
      var sp = clamp01(s.sparkle), seed = hash(p.id) * 10;
      ctx.save(); ctx.fillStyle = 'rgba(255,250,220,' + (0.95 * sp).toFixed(3) + ')';
      for (var k = 0; k < 5; k++) {
        var a = seed + k * 1.257 + time * 0.8, tw = 0.6 + 0.4 * Math.sin(time * 7 + k * 2.1);
        sparkleStar(ctx, cx + Math.cos(a) * rad, cy + Math.sin(a) * rad * 0.8, (8 + 6 * tw) * (0.5 + 0.5 * sp), a);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  // ================================================================ CANVAS FRAME
  var SAND = { a: '#EDD6A8', b: '#D9B880', line: '#A88452', rope: '#D2B07A', ropeDk: '#A98450', ropeHi: '#F2DDB2' };
  function scallop(ctx, s, rot) {   // a little scallop shell, hinge at the origin pointing down (before rotation)
    ctx.save(); ctx.rotate(rot);
    ctx.beginPath(); ctx.moveTo(0, s * 0.35);
    for (var i = 0; i <= 5; i++) {
      var a = Math.PI * (1.12 + i * 0.152), a2 = Math.PI * (1.12 + (i + 0.5) * 0.152);
      var x = Math.cos(a) * s, y = Math.sin(a) * s + s * 0.35;
      if (i === 0) ctx.lineTo(x, y); else ctx.quadraticCurveTo(Math.cos(a2 - Math.PI * 0.076) * s * 1.1, Math.sin(a2 - Math.PI * 0.076) * s * 1.1 + s * 0.35, x, y);
    }
    ctx.closePath();
    ctx.fillStyle = '#F7D8C8'; ctx.fill(); ctx.lineWidth = Math.max(1.5, s * 0.09); ctx.strokeStyle = '#B07D6A'; ctx.stroke();
    ctx.lineWidth = Math.max(1, s * 0.06); ctx.strokeStyle = 'rgba(176,125,106,0.6)';
    for (var j = 1; j < 5; j++) { var b = Math.PI * (1.12 + j * 0.152); ctx.beginPath(); ctx.moveTo(0, s * 0.35); ctx.lineTo(Math.cos(b) * s * 0.85, Math.sin(b) * s * 0.85 + s * 0.35); ctx.stroke(); }
    ctx.fillStyle = '#E9BFAE'; ctx.beginPath(); rr(ctx, -s * 0.22, s * 0.22, s * 0.44, s * 0.24, s * 0.08); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function drawCanvasFrame(ctx, box, opt) {
    opt = opt || {};
    var x = box.x, y = box.y, w = box.w, h = box.h, F = Math.max(14, Math.min(34, Math.min(w, h) * 0.055));
    var X = x - F, Y = y - F, WW = w + 2 * F, HH = h + 2 * F, R0 = F * 1.3;
    ctx.save();
    if (opt.glow > 0) {
      var gl = clamp01(opt.glow);
      ctx.beginPath(); rr(ctx, X - 6, Y - 6, WW + 12, HH + 12, R0 + 6);
      ctx.lineWidth = 18; ctx.strokeStyle = 'rgba(255,214,90,' + (0.45 * gl).toFixed(3) + ')'; ctx.stroke();
    }
    // soft drop shadow on the seabed
    ctx.fillStyle = 'rgba(20,50,70,0.22)'; ctx.beginPath(); rr(ctx, X + 4, Y + 10, WW, HH, R0); ctx.fill();
    // sandy driftwood board
    var g = ctx.createLinearGradient(X, Y, X, Y + HH); g.addColorStop(0, SAND.a); g.addColorStop(1, SAND.b);
    ctx.fillStyle = g; ctx.beginPath(); rr(ctx, X, Y, WW, HH, R0); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = SAND.line; ctx.stroke();
    // twisted rope along the frame
    var rp = F * 0.5, rw = F * 0.46;
    ctx.beginPath(); rr(ctx, X + rp, Y + rp, WW - 2 * rp, HH - 2 * rp, R0 * 0.75);
    ctx.lineWidth = rw + 3; ctx.strokeStyle = SAND.ropeDk; ctx.stroke();
    ctx.lineWidth = rw; ctx.strokeStyle = SAND.rope; ctx.stroke();
    if (ctx.setLineDash) {
      ctx.setLineDash([rw * 0.35, rw * 0.55]); ctx.lineWidth = rw; ctx.strokeStyle = 'rgba(169,132,80,0.55)'; ctx.stroke();
      ctx.setLineDash([rw * 0.3, rw * 0.6]); ctx.lineDashOffset = rw * 0.45; ctx.lineWidth = rw * 0.3; ctx.strokeStyle = 'rgba(242,221,178,0.8)'; ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
    // cream board with a soft inner shadow
    ctx.beginPath(); rr(ctx, x, y, w, h, F * 0.55); ctx.fillStyle = CREAM; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(160,120,70,0.14)'; ctx.beginPath(); rr(ctx, x - 2, y - 2, w + 4, h + 4, F * 0.55); ctx.stroke();
    ctx.restore();
    ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(168,132,82,0.8)'; ctx.beginPath(); rr(ctx, x, y, w, h, F * 0.55); ctx.stroke();
    // shells in the corners
    var sc = F * 1.05;
    [[X + F * 0.55, Y + F * 0.55, -0.8], [X + WW - F * 0.55, Y + F * 0.55, 0.8], [X + F * 0.55, Y + HH - F * 0.55, -2.35], [X + WW - F * 0.55, Y + HH - F * 0.55, 2.35]]
      .forEach(function (q) { ctx.save(); ctx.translate(q[0], q[1]); scallop(ctx, sc, q[2] + Math.PI); ctx.restore(); });
    if (opt.night > 0) { ctx.fillStyle = 'rgba(20,30,70,' + (0.18 * clamp01(opt.night)).toFixed(3) + ')'; ctx.beginPath(); rr(ctx, X, Y, WW, HH, R0); ctx.fill(); }
    ctx.restore();
  }

  // ================================================================ PAINT SHELL
  var SHELL = { fill: '#F8E6D6', inner: '#FFF5EC', rib: 'rgba(196,146,120,0.55)', line: '#A97862', lid: '#F1D8C6' };
  function fan(ctx, r, up) {   // scalloped half-shell; up = lid (opens upward), else the dish
    var n = 7, i, a0 = up ? Math.PI * 1.08 : Math.PI * 0.08, a1 = up ? Math.PI * 1.92 : Math.PI * 0.92, cy = up ? r * 0.18 : -r * 0.1;
    ctx.beginPath();
    if (up) {
      ctx.moveTo(-r * 0.22, cy + r * 0.02);
      for (i = 0; i <= n; i++) {
        var a = a0 + (a1 - a0) * i / n, x = Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.92;
        if (!i) ctx.lineTo(x, y);
        else { var am = a0 + (a1 - a0) * (i - 0.5) / n; ctx.quadraticCurveTo(Math.cos(am) * r * 1.1, cy + Math.sin(am) * r * 1.02, x, y); }
      }
      ctx.lineTo(r * 0.22, cy + r * 0.02); ctx.closePath();
    } else {
      ctx.moveTo(-r * 0.98, cy);
      ctx.quadraticCurveTo(-r * 0.5, cy + r * 0.12, 0, cy + r * 0.1); ctx.quadraticCurveTo(r * 0.5, cy + r * 0.12, r * 0.98, cy);
      for (i = n; i >= 0; i--) {
        var b = a0 + (a1 - a0) * i / n, bx = Math.cos(b) * r * 0.98, by = cy + Math.sin(b) * r * 0.8;
        if (i === n) ctx.lineTo(bx, by);
        else { var bm = a0 + (a1 - a0) * (i + 0.5) / n; ctx.quadraticCurveTo(Math.cos(bm) * r * 1.08, cy + Math.sin(bm) * r * 0.9, bx, by); }
      }
      ctx.closePath();
    }
  }
  function drawPaintShell(ctx, color, r, opt) {
    opt = opt || {};
    var c = pal(color) || { base: '#DDDDDD', dark: '#999999', light: '#F2F2F2' };
    var lift = clamp01(opt.lift), wob = +opt.wob || 0, time = opt.time == null ? nowSec() : opt.time;
    var sel = opt.selected === true ? 1 : clamp01(opt.selected), dim = opt.dim === true ? 1 : clamp01(opt.dim), glow = clamp01(opt.glow);
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // shadow on the sand
    ctx.fillStyle = 'rgba(30,50,60,' + (0.22 * (1 - 0.45 * lift)).toFixed(3) + ')';
    ctx.beginPath(); ctx.ellipse(0, r * 0.82, r * (0.9 - 0.15 * lift), r * 0.16, 0, 0, TAU); ctx.fill();
    ctx.translate(wob, -r * 0.24 * lift); ctx.rotate(wob * 0.02);
    var sc = 1 + 0.06 * lift + 0.04 * sel; ctx.scale(sc, sc);
    if (dim) ctx.globalAlpha *= 1 - 0.55 * dim;
    if (glow > 0 || sel > 0) {
      var pulse = 0.75 + 0.25 * Math.sin(time * 6), gg = Math.max(glow, sel * 0.8) * pulse;
      var hg = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 1.45);
      hg.addColorStop(0, 'rgba(255,220,100,' + (0.55 * gg).toFixed(3) + ')'); hg.addColorStop(1, 'rgba(255,220,100,0)');
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, 0, r * 1.45, 0, TAU); ctx.fill();
    }
    // lid (behind, wide open)
    ctx.save(); ctx.translate(0, -r * 0.3); ctx.scale(0.92, 0.82);
    fan(ctx, r * 0.92, true); ctx.fillStyle = SHELL.lid; ctx.fill(); ctx.lineWidth = r * 0.07; ctx.strokeStyle = SHELL.line; ctx.stroke();
    ctx.save(); ctx.clip(); ctx.strokeStyle = SHELL.rib; ctx.lineWidth = r * 0.05;
    for (var i = 1; i < 7; i++) { var a = Math.PI * (1.08 + 0.84 * i / 7); ctx.beginPath(); ctx.moveTo(0, r * 0.17); ctx.lineTo(Math.cos(a) * r, r * 0.17 + Math.sin(a) * r); ctx.stroke(); }
    var lg = ctx.createRadialGradient(-r * 0.25, -r * 0.4, 0, -r * 0.25, -r * 0.4, r * 0.6);
    lg.addColorStop(0, 'rgba(255,255,255,0.55)'); lg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = lg; ctx.fillRect(-r, -r, 2 * r, r * 1.2);
    ctx.restore(); ctx.restore();
    // the paint blob
    var bs = 1 + 0.06 * sel;
    // a big blob (≈ 1.3× the first version) with a dark rim: the colour reads, also yellow on sand (visual P2-9)
    var bx = bs * 1.36, by = bs * 1.6;
    ctx.save(); ctx.translate(0, -r * 0.02); ctx.scale(bx, by);
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, r * 0.06);
    ctx.bezierCurveTo(-r * 0.72, -r * 0.3, -r * 0.3, -r * 0.42, 0, -r * 0.38);
    ctx.bezierCurveTo(r * 0.36, -r * 0.44, r * 0.74, -r * 0.28, r * 0.7, r * 0.06);
    ctx.closePath();
    ctx.fillStyle = c.base; ctx.fill(); ctx.lineWidth = Math.max(2.5, r * 0.08) / bx; ctx.strokeStyle = c.dark; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.ellipse(-r * 0.28, -r * 0.22, r * 0.18, r * 0.08, -0.3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.05, -r * 0.3, r * 0.045, 0, TAU); ctx.fill();
    ctx.restore();
    // dish (front)
    ctx.save(); ctx.translate(0, r * 0.1);
    fan(ctx, r, false);
    var dg = ctx.createLinearGradient(0, -r * 0.1, 0, r * 0.75); dg.addColorStop(0, SHELL.inner); dg.addColorStop(1, SHELL.fill);
    ctx.fillStyle = dg; ctx.fill(); ctx.lineWidth = r * 0.075; ctx.strokeStyle = SHELL.line; ctx.stroke();
    ctx.save(); ctx.clip(); ctx.strokeStyle = SHELL.rib; ctx.lineWidth = r * 0.05;
    for (var j = 1; j < 7; j++) { var b = Math.PI * (0.08 + 0.84 * j / 7); ctx.beginPath(); ctx.moveTo(0, -r * 0.35); ctx.lineTo(Math.cos(b) * r * 1.1, -r * 0.1 + Math.sin(b) * r); ctx.stroke(); }
    ctx.restore();
    ctx.restore();
    // a paint drip over the rim
    ctx.fillStyle = c.base; ctx.strokeStyle = c.dark; ctx.lineWidth = r * 0.045;
    ctx.beginPath(); ctx.moveTo(r * 0.2, r * 0.04); ctx.quadraticCurveTo(r * 0.21, r * 0.28, r * 0.28, r * 0.3); ctx.quadraticCurveTo(r * 0.36, r * 0.28, r * 0.36, r * 0.04); ctx.fill(); ctx.stroke();
    // hinge
    ctx.fillStyle = '#E7C3AE'; ctx.beginPath(); rr(ctx, -r * 0.16, r * 0.6, r * 0.32, r * 0.16, r * 0.07); ctx.fill(); ctx.lineWidth = r * 0.05; ctx.strokeStyle = SHELL.line; ctx.stroke();
    if (sel > 0) {   // selected: a white ring with a navy edge (gold looked like the yellow paint)
      ctx.beginPath(); ctx.ellipse(0, r * 0.12, r * 1.14, r * 0.94, 0, 0, TAU);
      ctx.strokeStyle = 'rgba(51,64,94,' + (0.9 * sel).toFixed(3) + ')'; ctx.lineWidth = r * 0.16; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,' + sel.toFixed(3) + ')'; ctx.lineWidth = r * 0.09;
      if (ctx.setLineDash) { ctx.setLineDash([r * 0.26, r * 0.1]); ctx.lineDashOffset = -time * 30; }
      ctx.stroke();
      if (ctx.setLineDash) ctx.setLineDash([]);
    }
    ctx.restore();
  }

  // ================================================================ BRUSH
  function drawBrush(ctx, color, size, angle, opt) {
    opt = opt || {};
    var s = size, c = pal(color);
    ctx.save(); ctx.rotate(angle || 0); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    var lw = Math.max(1.5, s * 0.018);
    // handle (wood, slight taper, cream end cap)
    ctx.beginPath();
    ctx.moveTo(-s * 0.05, -s * 0.4); ctx.lineTo(-s * 0.034, -s * 0.94); ctx.quadraticCurveTo(0, -s * 1.0, s * 0.034, -s * 0.94); ctx.lineTo(s * 0.05, -s * 0.4); ctx.closePath();
    var hg = ctx.createLinearGradient(-s * 0.05, 0, s * 0.05, 0); hg.addColorStop(0, '#E2A970'); hg.addColorStop(0.45, '#C98B4E'); hg.addColorStop(1, '#9C6634');
    ctx.fillStyle = hg; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = '#6E4626'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,240,215,0.6)'; ctx.fillRect(-s * 0.026, -s * 0.9, s * 0.014, s * 0.46);
    ctx.fillStyle = '#F4EBDD'; ctx.beginPath(); ctx.ellipse(0, -s * 0.95, s * 0.036, s * 0.03, 0, 0, TAU); ctx.fill(); ctx.stroke();
    // ferrule (neutral silver-grey)
    ctx.beginPath(); rr(ctx, -s * 0.064, -s * 0.42, s * 0.128, s * 0.15, s * 0.02);
    var fg = ctx.createLinearGradient(-s * 0.064, 0, s * 0.064, 0); fg.addColorStop(0, '#E4E8EE'); fg.addColorStop(0.5, '#BCC3CE'); fg.addColorStop(1, '#8E97A6');
    ctx.fillStyle = fg; ctx.fill(); ctx.strokeStyle = '#5F6878'; ctx.stroke();
    ctx.strokeStyle = 'rgba(95,104,120,0.6)'; ctx.beginPath(); ctx.moveTo(-s * 0.06, -s * 0.37); ctx.lineTo(s * 0.06, -s * 0.37); ctx.moveTo(-s * 0.06, -s * 0.32); ctx.lineTo(s * 0.06, -s * 0.32); ctx.stroke();
    // bristles (teardrop to the tip)
    function bristles() {
      ctx.beginPath(); ctx.moveTo(-s * 0.062, -s * 0.28);
      ctx.bezierCurveTo(-s * 0.08, -s * 0.15, -s * 0.03, -s * 0.05, 0, 0);
      ctx.bezierCurveTo(s * 0.03, -s * 0.05, s * 0.08, -s * 0.15, s * 0.062, -s * 0.28); ctx.closePath();
    }
    bristles(); ctx.fillStyle = '#F2E4C8'; ctx.fill();
    if (c) {
      ctx.save(); bristles(); ctx.clip();
      ctx.fillStyle = c.base; ctx.beginPath(); ctx.moveTo(-s * 0.1, -s * 0.15); ctx.quadraticCurveTo(0, -s * 0.2, s * 0.1, -s * 0.14); ctx.lineTo(s * 0.1, s * 0.02); ctx.lineTo(-s * 0.1, s * 0.02); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(-s * 0.022, -s * 0.11, s * 0.01, s * 0.04, 0.2, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(120,96,60,0.45)'; ctx.lineWidth = lw * 0.7;
    ctx.beginPath(); ctx.moveTo(-s * 0.025, -s * 0.26); ctx.lineTo(-s * 0.01, -s * 0.06); ctx.moveTo(s * 0.025, -s * 0.26); ctx.lineTo(s * 0.01, -s * 0.06); ctx.stroke();
    bristles(); ctx.lineWidth = lw; ctx.strokeStyle = c ? c.dark : '#9C8256'; ctx.stroke();
    if (c && opt.drip > 0) {
      var dr = clamp01(opt.drip), dy = s * 0.05 + s * 0.08 * dr, rd = s * 0.028 * (0.6 + 0.4 * dr);
      ctx.fillStyle = c.base; ctx.strokeStyle = c.dark;
      ctx.beginPath(); ctx.moveTo(-rd * 0.5, s * 0.0); ctx.quadraticCurveTo(-rd, dy - rd, 0, dy + rd); ctx.quadraticCurveTo(rd, dy - rd, rd * 0.5, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  // ================================================================ SPLASH
  function drawSplash(ctx, color, r, t) {
    var c = pal(color) || { base: '#FFFFFF', dark: '#AAAAAA', light: '#FFFFFF' };
    t = clamp01(t);
    if (t >= 1) return;
    var e = 1 - Math.pow(1 - t, 3), a = Math.pow(1 - t, 0.7);
    ctx.save(); ctx.globalAlpha *= a;
    var cs = r * (0.35 + 0.35 * e);
    ctx.fillStyle = c.base; ctx.beginPath();
    for (var i = 0; i <= 16; i++) { var an = i / 16 * TAU, k = i % 2 ? 0.72 : 1; if (i) ctx.lineTo(Math.cos(an) * cs * k, Math.sin(an) * cs * k); else ctx.moveTo(cs, 0); }
    ctx.closePath(); ctx.fill();
    for (var j = 0; j < 9; j++) {
      var ang = j * 0.698 + 0.3, d = r * (0.4 + 0.75 * e) * (0.8 + 0.25 * ((j * 7) % 3) / 2), rs = r * 0.11 * (1 - 0.6 * t) * (1 + (j % 3) * 0.3);
      ctx.beginPath(); ctx.arc(Math.cos(ang) * d, Math.sin(ang) * d, rs, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(-cs * 0.3, -cs * 0.3, cs * 0.22, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // ================================================================ ICONS
  var iconPics = {};
  function iconPic(animal) {
    if (!iconPics[animal] && SP.Pictures && SP.Pictures.animalIcon) iconPics[animal] = SP.Pictures.animalIcon(animal);
    return iconPics[animal];
  }
  function bubbleBack(ctx, r) {
    ctx.fillStyle = '#E8F5FA'; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.07); ctx.strokeStyle = NAVY; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = Math.max(2, r * 0.08);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.74, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke();
  }
  function bigText(ctx, txt, s) {
    var fs = s * (txt.length > 2 ? 0.4 : txt.length > 1 ? 0.5 : 0.62);
    ctx.font = '800 ' + Math.round(fs) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(4, fs * 0.14); ctx.strokeStyle = '#FFFFFF'; ctx.strokeText(txt, 0, fs * 0.05);
    ctx.fillStyle = NAVY; ctx.fillText(txt, 0, fs * 0.05);
  }
  function drawAnimalIcon(ctx, animal, color, k) {
    var p = iconPic(animal); if (!p) return;
    var st = {}; st[p.parts[0].id] = { color: color || p.parts[0].def, t: 1 };
    ctx.save(); ctx.scale(k, k); drawPicture(ctx, p, st, { time: 0 }); ctx.restore();
  }
  function drawIcon(ctx, thing, size) {
    if (!thing) return;
    var s = size || 100, c;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    switch (thing.kind) {
      case 'blob':
        c = pal(thing.color) || pal('#DDDDDD');
        ctx.beginPath();
        ctx.moveTo(-s * 0.36, s * 0.1);
        ctx.bezierCurveTo(-s * 0.42, -s * 0.28, -s * 0.1, -s * 0.4, s * 0.04, -s * 0.36);
        ctx.bezierCurveTo(s * 0.34, -s * 0.34, s * 0.44, -s * 0.08, s * 0.36, s * 0.14);
        ctx.bezierCurveTo(s * 0.3, s * 0.3, s * 0.18, s * 0.2, s * 0.14, s * 0.32);
        ctx.bezierCurveTo(s * 0.1, s * 0.42, -s * 0.02, s * 0.42, -s * 0.04, s * 0.3);
        ctx.bezierCurveTo(-s * 0.08, s * 0.22, -s * 0.3, s * 0.32, -s * 0.36, s * 0.1);
        ctx.closePath();
        ctx.fillStyle = c.base; ctx.fill(); ctx.lineWidth = Math.max(2, s * 0.04); ctx.strokeStyle = c.dark; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(-s * 0.14, -s * 0.18, s * 0.1, s * 0.05, -0.4, 0, TAU); ctx.fill();
        break;
      case 'shape': {
        var d = SP.Pictures && SP.Pictures.shapeD ? SP.Pictures.shapeD(thing.shape, 0, 0, s * 0.38) : null, p = d && P2(d);
        if (!p) break;
        c = pal(thing.color);
        ctx.lineWidth = Math.max(4, s * 0.09); ctx.strokeStyle = NAVY; ctx.stroke(p);
        ctx.fillStyle = c ? c.base : '#FFFFFF'; ctx.fill(p);
        if (c) {
          ctx.save(); ctx.clip(p);
          var hg = ctx.createRadialGradient(-s * 0.14, -s * 0.16, 0, -s * 0.14, -s * 0.16, s * 0.3);
          hg.addColorStop(0, 'rgba(255,255,255,0.5)'); hg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = hg; ctx.fillRect(-s / 2, -s / 2, s, s);
          var sg = ctx.createLinearGradient(-s * 0.4, -s * 0.4, s * 0.4, s * 0.4); sg.addColorStop(0.55, rgba(c.dark, 0)); sg.addColorStop(1, rgba(c.dark, 0.22));
          ctx.fillStyle = sg; ctx.fillRect(-s / 2, -s / 2, s, s); ctx.restore();
        }
        break;
      }
      case 'animal': drawAnimalIcon(ctx, thing.animal, thing.color, s * 0.92 / 220); break;
      case 'size': {
        var small = thing.size === 'small', k = s * 0.92 / 220 * (small ? 0.58 : 1);
        ctx.translate(0, small ? s * 0.18 : 0);
        drawAnimalIcon(ctx, thing.animal, thing.color, k);
        break;
      }
      case 'number': bubbleBack(ctx, s * 0.44); bigText(ctx, String(thing.n), s); break;
      case 'letter': bubbleBack(ctx, s * 0.44); bigText(ctx, String(thing.text), s); break;
      case 'dots': {
        var n = Math.max(0, Math.min(20, thing.n | 0)), per = n <= 3 ? n : n <= 4 ? 2 : n <= 6 ? 3 : n <= 10 ? 5 : 5;
        // big sea bubbles (light blue, white rim, a shine) — the same look as the count pictures (visual P2-8)
        var rows = Math.ceil(n / Math.max(1, per)), gap = s * 0.86 / Math.max(per, rows, 2), r = gap * 0.42;
        for (var i = 0; i < n; i++) {
          var row = Math.floor(i / per), inRow = Math.min(per, n - row * per), col = i - row * per;
          var x = (col - (inRow - 1) / 2) * gap, y = (row - (rows - 1) / 2) * gap;
          var bg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
          bg.addColorStop(0, '#D4E8FB'); bg.addColorStop(1, '#A6CCF5');
          ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
          ctx.lineWidth = Math.max(2, r * 0.14); ctx.strokeStyle = NAVY; ctx.stroke();
          ctx.lineWidth = Math.max(1.5, r * 0.1); ctx.strokeStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(x, y, r * 0.84, 0, TAU); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.ellipse(x - r * 0.34, y - r * 0.36, r * 0.22, r * 0.13, -0.6, 0, TAU); ctx.fill();
        }
        break;
      }
      default: break;
    }
    ctx.restore();
  }

  // ================================================================ GHOST HAND
  function drawGhostHand(ctx, size, t) {
    var s = size, F = '#FFF4E4', L = '#B9835A', SH = '#F1D6B8';
    var ph = ((t || 0) % 1 + 1) % 1;
    var press = ph < 0.18 ? 1 - ph / 0.18 : ph > 0.85 ? (ph - 0.85) / 0.15 : 0;
    ctx.save();
    if (ph < 0.3) {
      var q = ph / 0.3;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * (1 - q)).toFixed(3) + ')'; ctx.lineWidth = s * 0.035;
      ctx.beginPath(); ctx.arc(0, 0, s * (0.08 + 0.22 * q), 0, TAU); ctx.stroke();
    }
    ctx.translate(0, s * 0.05 * (1 - press));
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    function hand() {
      ctx.beginPath();
      rr(ctx, -s * 0.085, 0, s * 0.17, s * 0.52, s * 0.085);
      rr(ctx, -s * 0.26, s * 0.36, s * 0.47, s * 0.42, s * 0.14);
      ctx.moveTo(-s * 0.2, s * 0.5);
      ctx.ellipse(-s * 0.27, s * 0.46, s * 0.07, s * 0.15, -0.6, 0, TAU);
    }
    ctx.globalAlpha *= 0.95;
    // a navy edge + soft shadow: the cream hand reads on the cream shells and the sand (visual P2-4)
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    hand(); ctx.lineWidth = s * 0.07 + 6; ctx.strokeStyle = NAVY; ctx.stroke();
    ctx.restore();
    hand(); ctx.lineWidth = s * 0.07; ctx.strokeStyle = L; ctx.stroke();
    hand(); ctx.fillStyle = F; ctx.fill();
    ctx.strokeStyle = SH; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); ctx.moveTo(0, s * 0.5); ctx.lineTo(s * 0.18, s * 0.5); ctx.moveTo(0, s * 0.62); ctx.lineTo(s * 0.18, s * 0.62); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.ellipse(-s * 0.03, s * 0.12, s * 0.025, s * 0.07, 0, 0, TAU); ctx.fill();
    // cuff: Nini's sea-foam teal with a cream beret stripe
    ctx.fillStyle = '#5FB3B3'; ctx.strokeStyle = '#2C6467'; ctx.lineWidth = s * 0.04;
    ctx.beginPath(); rr(ctx, -s * 0.24, s * 0.76, s * 0.44, s * 0.14, s * 0.05); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = NAVY; ctx.stroke();
    ctx.fillStyle = '#F4EBDD'; ctx.fillRect(-s * 0.2, s * 0.81, s * 0.36, s * 0.035);
    ctx.restore();
  }

  SP.PaintArt = {
    drawCanvasFrame: drawCanvasFrame, drawPicture: drawPicture, drawPaintShell: drawPaintShell, drawBrush: drawBrush,
    drawSplash: drawSplash, drawIcon: drawIcon, drawGhostHand: drawGhostHand,
    pal: pal, PALETTE: FALLBACK_PALETTE, FONT: FONT, NAVY: NAVY, CREAM: CREAM, clearCache: clearCache
  };
})(typeof window !== 'undefined' ? (window.SP = window.SP || {}) : (global.SP = global.SP || {}));
