/* Bo's Farm Parade — FP.ParadeArt (character artist B), DESIGN §3 / §4.3. Everything here is canvas code.
 *
 *   drawMember(ctx, thing, size, opt)   origin = the member's FEET centre (bottom), the body goes UP (−y); size = body box height.
 *       thing = { kind 'obj'|'block'|'crate'|'tile'|'animal', color?, obj?, shape?, n?, animal?, text?, big? }
 *         obj    bucket|boot|can|tractor|flower painted in `color`, riding a small wooden wagon (2 spoked wheels)
 *         block  chunky toy shape block (circle|square|triangle|star|heart|oval|rect|diamond) in `color`, on a wagon
 *         crate  wooden crate with n = 1..12 red apples (neat dice / rows / ten-frame layout), on a wagon
 *         tile   wooden sign board on a post-cart, `text` in big rounded dark-brown glyphs ("A", "3+2", "7−4", "10+10", "12")
 *         animal FP.Assets image 'animals/<a>' (or '_step' when opt.step = 1); a soft placeholder until it is loaded
 *         big: false → drawn at size × 0.62 (about the feet)
 *       opt = { glow 0..1, dim 0..1, wheel (rad), step 0|1, night 0..1, count -1..n, dpr,
 *               appleN (crates: draw every apple with the radius of appleLayout(appleN) — the round's max n, so apple size is
 *               never a clue), pennant ('B': a little cream letter flag on a stick — first-letter rounds), face (±1: the
 *               member's mirror, so the pennant letter is never drawn backwards) }
 *       Painted members (obj / block / crate / tile) get a cream sticker outline (warm rim colour at night).
 *   bodyBox(thing, size) → { w, h, cy }   visible body box in px (cy < 0: body centre above the feet)
 *   drawWagon(ctx, w, wheel, opt)          origin = bottom centre (wheels on the ground), w = deck width in px
 *   drawStage(ctx, s, opt)                 hay-bale stage, origin = TOP centre (where a member stands); opt { pop 0..1, night }
 *   stageDip(s, pop) → px                  how far the stage top moves DOWN while squashed (render adds it to the member)
 *   drawHomeBadge(ctx, home, r, opt)       farm|sea|ice|jungle|savanna, centred, r = radius; opt { a (alpha), pop }
 *   drawIcon(ctx, choice, size)            centred in a size × size box: any member thing, or {kind:'color', color},
 *                                          {kind:'number', n}, {kind:'home', home}, {kind:'size', big, thing?}, {kind:'letter', text}
 *   drawHintHand(ctx, x, y, press, alpha, size?)  fingertip at (x, y), finger points UP-LEFT; press 0..1
 *   drawDust(ctx, x, y, r, alpha)          a little dust puff centred at (x, y)
 *   Helpers: pal, PALETTE, WOOD, HAY, METAL, APPLE, FONT, OBJECTS, SHAPES, ANIMALS, HOMES, KINDS, thingKey, clearCache.
 *
 * Members are designed in a 100-unit box (x −50..50, y −100..0, feet at (0, 0)); the ctx is scaled by size / 100.
 * Path2D objects are cached per part (size independent — equivalent to per thing+size because the ctx is scaled).
 * Node-safe at load (no DOM). Without Path2D (node tests) paths are rebuilt on the ctx each draw.
 */
(function (G) {
  'use strict';
  var FP = G.FP = G.FP || {};

  var TAU = Math.PI * 2, LW = 3.4;            // outline width in the 100-unit design box (≈ 4 px at 120)
  var FONT = 'ui-rounded, "Arial Rounded MT Bold", "SF Pro Rounded", Nunito, system-ui, sans-serif';
  var FALLBACK = {
    red:    { base: '#E84A4A', dark: '#A8282E', light: '#F7A0A0' },
    blue:   { base: '#3C8DE8', dark: '#1F5BA8', light: '#A6CCF5' },
    yellow: { base: '#FFD23F', dark: '#C99A12', light: '#FFEB9C' },
    green:  { base: '#4CC26B', dark: '#2A8343', light: '#A8E6B8' },
    orange: { base: '#FF9A2E', dark: '#C4650C', light: '#FFCB8E' },
    purple: { base: '#8E44AD', dark: '#6840A8', light: '#D2BDF3' },
    pink:   { base: '#FF8FC0', dark: '#C9558A', light: '#FFCCE2' }
  };
  var WOOD = { base: '#B98552', dark: '#7A5130', light: '#DDB07E' };
  var HAY = { base: '#E9C46A', dark: '#B8913A', light: '#F6E2A6' };
  var METAL = { base: '#9AA4AE', dark: '#636C75', light: '#D3D9DE' };
  var APPLE = { base: '#D9483B', dark: '#8E2A22', light: '#F28A7E' };
  var LEAF = { base: '#8DB065', dark: '#5A7A3A', light: '#C3DA9E' };       // muted sage (never reads as answer green)
  var INK = '#4A2C1A';                                                    // sign glyphs
  var BOARD = { base: '#FBEFD6', dark: '#C9A87A', light: '#FFFFFF' };
  var TYRE = { base: '#5A4E4A', dark: '#352C2A', light: '#857873' };
  var OBJECTS = ['bucket', 'boot', 'can', 'tractor', 'flower'];
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'oval', 'rect', 'diamond'];
  var ANIMALS = ['cow', 'pig', 'sheep', 'duck', 'hen', 'horse', 'goat', 'crab', 'penguin', 'lion', 'monkey', 'fishbowl'];
  var HOMES = ['farm', 'sea', 'ice', 'jungle', 'savanna'];
  var KINDS = ['obj', 'block', 'crate', 'tile', 'animal'];
  var SMALL = 0.62;

  // ---------------------------------------------------------------- colour helpers
  function rgb(h) { h = String(h).replace('#', ''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
  function mix(a, b, t) {
    var A = rgb(a), B = rgb(b), o = '#';
    for (var i = 0; i < 3; i++) { var v = Math.round(A[i] + (B[i] - A[i]) * t); o += (v < 16 ? '0' : '') + v.toString(16); }
    return o.toUpperCase();
  }
  function rgba(hex, a) { var c = rgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (+a).toFixed(3) + ')'; }
  function clamp01(v) { v = +v || 0; return v < 0 ? 0 : v > 1 ? 1 : v; }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function pal(name) {
    var P = FP.PALETTE, c = P && P[name] && /^#[0-9A-Fa-f]{6}$/.test(P[name].base || '') && P[name].dark && P[name].light ? P[name] : FALLBACK[name];
    return c || null;
  }
  function lineOf(c) { return c.base === '#FFD23F' ? '#B0850A' : c.base === '#FF8FC0' ? '#B84A7E' : c.dark; }
  function shadeOf(c) { return mix(c.base, c.dark, 0.34); }

  // ---------------------------------------------------------------- path recorder (bbox) + Path2D cache
  function Rec() { this.x0 = 1e9; this.y0 = 1e9; this.x1 = -1e9; this.y1 = -1e9; this.px = 0; this.py = 0; }
  Rec.prototype._p = function (x, y) { if (x < this.x0) this.x0 = x; if (x > this.x1) this.x1 = x; if (y < this.y0) this.y0 = y; if (y > this.y1) this.y1 = y; };
  Rec.prototype.moveTo = function (x, y) { this._p(x, y); this.px = x; this.py = y; };
  Rec.prototype.lineTo = function (x, y) { this._p(x, y); this.px = x; this.py = y; };
  Rec.prototype.quadraticCurveTo = function (cx, cy, x, y) {
    for (var i = 1; i <= 8; i++) { var t = i / 8, u = 1 - t; this._p(u * u * this.px + 2 * u * t * cx + t * t * x, u * u * this.py + 2 * u * t * cy + t * t * y); }
    this.px = x; this.py = y;
  };
  Rec.prototype.bezierCurveTo = function (ax, ay, bx, by, x, y) {
    for (var i = 1; i <= 12; i++) {
      var t = i / 12, u = 1 - t;
      this._p(u * u * u * this.px + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * x, u * u * u * this.py + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * y);
    }
    this.px = x; this.py = y;
  };
  Rec.prototype.ellipse = function (x, y, rx, ry, rot, a0, a1, ccw) {
    var d = a1 - a0;
    if (!ccw) { while (d < 0) d += TAU; } else { while (d > 0) d -= TAU; }
    if (Math.abs(d) > TAU) d = d > 0 ? TAU : -TAU;
    var cr = Math.cos(rot), sr = Math.sin(rot), ex = 0, ey = 0;
    for (var i = 0; i <= 32; i++) {
      var a = a0 + d * i / 32; ex = rx * Math.cos(a); ey = ry * Math.sin(a);
      this._p(x + ex * cr - ey * sr, y + ex * sr + ey * cr);
    }
    this.px = x + ex * cr - ey * sr; this.py = y + ex * sr + ey * cr;
  };
  Rec.prototype.arc = function (x, y, r, a0, a1, ccw) { this.ellipse(x, y, r, r, 0, a0, a1, ccw); };
  Rec.prototype.closePath = function () {};
  Rec.prototype.rect = function (x, y, w, h) { this._p(x, y); this._p(x + w, y + h); };

  function circ(t, x, y, r) { t.moveTo(x + r, y); t.arc(x, y, r, 0, TAU); t.closePath(); }
  function ell(t, x, y, rx, ry, rot) { rot = rot || 0; t.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot)); t.ellipse(x, y, rx, ry, rot, 0, TAU); t.closePath(); }
  function rrect(t, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    t.moveTo(x + r, y); t.lineTo(x + w - r, y); t.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    t.lineTo(x + w, y + h - r); t.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    t.lineTo(x + r, y + h); t.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    t.lineTo(x, y + r); t.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5); t.closePath();
  }
  function rpoly(t, pts, r) {   // rounded polygon: corner i rounded with radius r (number or array)
    var n = pts.length;
    for (var i = 0; i < n; i++) {
      var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], ri = typeof r === 'number' ? r : (r ? r[i] : 0);
      var d0 = Math.hypot(p0[0] - p1[0], p0[1] - p1[1]) || 1, d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1;
      var k0 = Math.min(ri, d0 / 2) / d0, k2 = Math.min(ri, d2 / 2) / d2;
      var ax = p1[0] + (p0[0] - p1[0]) * k0, ay = p1[1] + (p0[1] - p1[1]) * k0, bx = p1[0] + (p2[0] - p1[0]) * k2, by = p1[1] + (p2[1] - p1[1]) * k2;
      if (i === 0) t.moveTo(ax, ay); else t.lineTo(ax, ay);
      t.quadraticCurveTo(p1[0], p1[1], bx, by);
    }
    t.closePath();
  }
  function starPts(cx, cy, ro, ri) {
    var pts = [];
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? ri : ro; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return pts;
  }

  function hasP2D() { return typeof Path2D !== 'undefined'; }
  var pcache = {}, pN = 0, bcache = {};
  function P(key, build) {
    if (!hasP2D()) return build;
    var p = pcache[key];
    if (!p) { if (pN > 3000) { pcache = {}; pN = 0; } p = pcache[key] = new Path2D(); build(p); pN++; }
    return p;
  }
  function fillP(ctx, p) { if (typeof p === 'function') { ctx.beginPath(); p(ctx); ctx.fill(); } else ctx.fill(p); }
  function strokeP(ctx, p) { if (typeof p === 'function') { ctx.beginPath(); p(ctx); ctx.stroke(); } else ctx.stroke(p); }
  function clipP(ctx, p) { if (typeof p === 'function') { ctx.beginPath(); p(ctx); ctx.clip(); } else ctx.clip(p); }
  function bbox(key, build) { var b = bcache[key]; if (!b) { var r = new Rec(); build(r); b = bcache[key] = { x: r.x0, y: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0 }; } return b; }

  /** one-step cel shading: base, a shade crescent lower-right, a soft highlight upper-left, the outline */
  function cel(ctx, key, build, c, o) {
    o = o || {};
    var p = P(key, build), b = bbox(key, build), s = o.s != null ? o.s : Math.max(1.5, Math.min(6.5, Math.min(b.w, b.h) * 0.12));
    ctx.fillStyle = c.base; fillP(ctx, p);
    ctx.save(); clipP(ctx, p);
    if (s) {
      ctx.fillStyle = o.shade || shadeOf(c); ctx.fillRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
      ctx.translate(-s, -s * 1.05); ctx.fillStyle = c.base; fillP(ctx, p); ctx.translate(s, s * 1.05);
    }
    if (o.hl !== false) {
      var h = o.hl || [b.x + b.w * 0.3, b.y + b.h * 0.24, Math.max(1, b.w * 0.13), Math.max(0.8, b.h * 0.07), -0.6];
      ctx.fillStyle = o.hlc || rgba(mix(c.light, '#FFFFFF', 0.45), 0.85);
      ctx.beginPath(); ell(ctx, h[0], h[1], h[2], h[3], h[4] || 0); ctx.fill();
    }
    if (o.inner) o.inner(ctx, b);
    ctx.restore();
    if (o.line !== false) { ctx.strokeStyle = o.line || lineOf(c); ctx.lineWidth = o.lw || LW; strokeP(ctx, p); }
    return p;
  }
  function part(ctx, key, build, fill, line, lw) {
    var p = P(key, build);
    if (fill) { ctx.fillStyle = fill; fillP(ctx, p); }
    if (line) { ctx.strokeStyle = line; ctx.lineWidth = lw || LW; strokeP(ctx, p); }
    return p;
  }
  function dot(ctx, x, y, r, col) { ctx.fillStyle = col; ctx.beginPath(); circ(ctx, x, y, r); ctx.fill(); }
  function oval(ctx, x, y, rx, ry, rot, col) { ctx.fillStyle = col; ctx.beginPath(); ell(ctx, x, y, rx, ry, rot); ctx.fill(); }
  function line(ctx, pts, col, w) {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
  }
  function sparkle(ctx, x, y, r, col) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.closePath(); ctx.fill();
  }
  function eye(ctx, x, y, r) {
    oval(ctx, x, y, r, r * 1.12, 0, '#2F2A3A');
    dot(ctx, x - r * 0.3, y - r * 0.4, r * 0.42, '#FFFFFF');
  }

  // ================================================================= WAGON (design units, origin = bottom centre)
  var WG = { deckY: -28, deckH: 10, deckW: 84, wheelR: 11, wheelX: 27 };
  var wDeck = function (t) { rrect(t, -42, -28, 84, 10, 3.5); };
  var wTongue = function (t) { t.moveTo(40, -21); t.quadraticCurveTo(48, -20, 51, -12); };
  function drawWheel(ctx, x, y, r, rot) {
    ctx.save(); ctx.translate(x, y);
    dot(ctx, 0, 0, r, WOOD.dark);
    dot(ctx, 0, 0, r - 3.2, WOOD.base);
    ctx.save(); ctx.rotate(rot);
    ctx.strokeStyle = WOOD.dark; ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (var i = 0; i < 5; i++) { var a = i * TAU / 5; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * (r - 3), Math.sin(a) * (r - 3)); }
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = rgba(WOOD.light, 0.85); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 0, r - 1.6, Math.PI * 1.05, Math.PI * 1.55); ctx.stroke();
    dot(ctx, 0, 0, 3.6, METAL.dark); dot(ctx, 0, 0, 2.4, METAL.base); dot(ctx, -0.8, -0.8, 0.9, METAL.light);
    ctx.strokeStyle = '#5A3A20'; ctx.lineWidth = 2.4; ctx.beginPath(); circ(ctx, 0, 0, r); ctx.stroke();
    ctx.restore();
  }
  function wagonDesign(ctx, wheel, opt) {
    var rot = num(wheel, 0), o = opt || {};
    // tongue + ring (pull handle, front = right)
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#5A3A20'; ctx.lineWidth = 5.6; strokeP(ctx, P('wg.tongue', wTongue));
    ctx.strokeStyle = WOOD.base; ctx.lineWidth = 2.8; strokeP(ctx, P('wg.tongue', wTongue));
    ctx.strokeStyle = METAL.dark; ctx.lineWidth = 3.2; ctx.beginPath(); circ(ctx, 52, -10, 3.2); ctx.stroke();
    ctx.strokeStyle = METAL.light; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(52, -10, 3.2, Math.PI, Math.PI * 1.5); ctx.stroke();
    // axle brackets behind the wheels
    ctx.fillStyle = WOOD.dark;
    ctx.fillRect(-WG.wheelX - 3, -20, 6, 9); ctx.fillRect(WG.wheelX - 3, -20, 6, 9);
    // deck plank
    cel(ctx, 'wg.deck', wDeck, WOOD, {
      s: 2.2, line: '#5A3A20', lw: 2.8, hl: false,
      inner: function (x) {
        x.fillStyle = rgba(WOOD.light, 0.9); x.fillRect(-40, -27, 80, 2.4);
        x.strokeStyle = rgba(WOOD.dark, 0.55); x.lineWidth = 1.1;
        x.beginPath(); x.moveTo(-14, -26); x.lineTo(-14, -18); x.moveTo(14, -26); x.lineTo(14, -18); x.stroke();
        dot(x, -38, -23, 1.1, WOOD.dark); dot(x, 38, -23, 1.1, WOOD.dark); dot(x, -10, -23, 1, WOOD.dark); dot(x, 18, -23, 1, WOOD.dark);
      }
    });
    if (o.post) {   // tile: two posts from the deck up to the board
      [-22, 22].forEach(function (px) {
        cel(ctx, 'wg.post' + px, function (t) { rrect(t, px - 4, o.post - 2, 8, -28 - o.post + 4, 2.5); }, WOOD, { s: 1.6, line: '#5A3A20', lw: 2.4, hl: false });
      });
    }
    drawWheel(ctx, -WG.wheelX, -WG.wheelR, WG.wheelR, rot);
    drawWheel(ctx, WG.wheelX, -WG.wheelR, WG.wheelR, rot);
  }
  var wagonSil = function (t) { wDeck(t); circ(t, -WG.wheelX, -WG.wheelR, WG.wheelR); circ(t, WG.wheelX, -WG.wheelR, WG.wheelR); };

  // ================================================================= OBJECTS (painted in the answer colour, on y = −28)
  var OB = {};
  // ---- bucket
  var bkBody = function (t) { rpoly(t, [[-31, -80], [31, -80], [23, -29], [-23, -29]], [4, 4, 7, 7]); };
  var bkRim = function (t) { ell(t, 0, -80, 33, 7.5, 0); };
  var bkIn = function (t) { ell(t, 0, -80.5, 27.5, 4.6, 0); };
  var bkHandle = function (t) { t.moveTo(-30, -76); t.bezierCurveTo(-30, -104, 30, -104, 30, -76); };
  OB.bucket = {
    sil: function (t) { bkBody(t); bkRim(t); t.moveTo(-30, -76); t.bezierCurveTo(-30, -104, 30, -104, 30, -76); t.lineTo(26, -76); t.bezierCurveTo(26, -98, -26, -98, -26, -76); t.closePath(); },
    draw: function (ctx, c) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = METAL.dark; ctx.lineWidth = 5.4; strokeP(ctx, P('bk.h', bkHandle));
      ctx.strokeStyle = METAL.base; ctx.lineWidth = 2.6; strokeP(ctx, P('bk.h', bkHandle));
      cel(ctx, 'bk.body', bkBody, c, {
        s: 5, hl: [-17, -62, 4, 13, 0.12],
        inner: function (x) {
          x.strokeStyle = rgba(c.dark, 0.38); x.lineWidth = 2.4;
          x.beginPath(); x.moveTo(-29, -60); x.quadraticCurveTo(0, -55, 29, -60); x.moveTo(-26, -42); x.quadraticCurveTo(0, -37, 26, -42); x.stroke();
          x.fillStyle = 'rgba(255,255,255,0.5)'; x.beginPath(); ell(x, -18, -45, 2.4, 5, 0.15); x.fill();
        }
      });
      cel(ctx, 'bk.rim', bkRim, { base: c.light, dark: c.base, light: '#FFFFFF' }, { s: 1.6, line: lineOf(c), hl: false });
      part(ctx, 'bk.in', bkIn, mix(c.dark, '#2F2A3A', 0.2));
      // handle lugs (rivets)
      dot(ctx, -29.5, -74, 3.2, METAL.dark); dot(ctx, 29.5, -74, 3.2, METAL.dark);
      dot(ctx, -29.5, -74, 1.7, METAL.light); dot(ctx, 29.5, -74, 1.7, METAL.light);
    }
  };
  // ---- boot (rubber wellington, toe to the right)
  var btBody = function (t) { rpoly(t, [[-28, -98], [6, -98], [6, -58], [24, -52], [34, -42], [34, -29], [-28, -29]], [6, 6, 10, 10, 8, 4, 4]); };
  var btSole = function (t) { rrect(t, -30, -37, 66, 9, 4); };
  var btCuff = function (t) { rrect(t, -30, -100, 38, 11, 4.5); };
  OB.boot = {
    sil: function (t) { btBody(t); btSole(t); btCuff(t); },
    draw: function (ctx, c) {
      cel(ctx, 'bt.body', btBody, c, {
        s: 5, hl: [-19, -72, 3.6, 14, 0.04],
        inner: function (x) {
          x.strokeStyle = rgba(c.dark, 0.4); x.lineWidth = 2.2;
          x.beginPath(); x.moveTo(6, -58); x.quadraticCurveTo(-2, -50, -6, -38); x.stroke();      // instep crease
          x.fillStyle = 'rgba(255,255,255,0.45)'; x.beginPath(); ell(x, 22, -45, 5, 2.2, 0.5); x.fill();
        }
      });
      cel(ctx, 'bt.sole', btSole, { base: c.dark, dark: mix(c.dark, '#2F2A3A', 0.4), light: c.base }, { s: 1.6, line: mix(c.dark, '#2F2A3A', 0.35), lw: 2.6, hl: false,
        inner: function (x) { x.fillStyle = rgba('#FFFFFF', 0.18); for (var i = -24; i < 34; i += 8) x.fillRect(i, -33, 4, 3); } });
      cel(ctx, 'bt.cuff', btCuff, { base: c.light, dark: c.base, light: '#FFFFFF' }, { s: 1.6, line: lineOf(c), lw: 2.8, hl: false });
      // pull tab loop at the back
      ctx.strokeStyle = lineOf(c); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(-28, -80, 5, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke();
    }
  };
  // ---- watering can (spout to the right)
  var cnBody = function (t) { rpoly(t, [[-30, -80], [14, -80], [17, -29], [-33, -29]], [11, 11, 7, 7]); };
  var cnSpout = function (t) { rpoly(t, [[10, -52], [38, -84], [45, -78], [14, -36]], [2, 2, 2, 3]); };
  var cnRose = function (t) { ell(t, 43, -84, 9, 5, -0.75); };
  var cnHandle = function (t) { t.moveTo(-25, -79); t.bezierCurveTo(-24, -101, 8, -101, 9, -79); };
  var cnLid = function (t) { ell(t, -8, -80, 17, 4.6, 0); };
  OB.can = {
    sil: function (t) { cnBody(t); cnSpout(t); cnRose(t); t.moveTo(-28, -79); t.bezierCurveTo(-28, -106, 12, -106, 12, -79); t.lineTo(6, -79); t.bezierCurveTo(4, -96, -20, -96, -22, -79); t.closePath(); },
    draw: function (ctx, c) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = lineOf(c); ctx.lineWidth = 10.5; strokeP(ctx, P('cn.h', cnHandle));
      ctx.strokeStyle = c.base; ctx.lineWidth = 4.4; strokeP(ctx, P('cn.h', cnHandle));
      ctx.strokeStyle = rgba(mix(c.light, '#FFFFFF', 0.4), 0.8); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-21, -88); ctx.bezierCurveTo(-17, -96, -6, -97, 0, -96); ctx.stroke();
      cel(ctx, 'cn.spout', cnSpout, c, { s: 2.4, hl: false });
      cel(ctx, 'cn.body', cnBody, c, {
        s: 5.5, hl: [-21, -60, 3.8, 13, 0.06],
        inner: function (x) {
          x.strokeStyle = rgba(c.dark, 0.38); x.lineWidth = 2.4;
          x.beginPath(); x.moveTo(-32, -42); x.quadraticCurveTo(-8, -38, 16, -42); x.stroke();
        }
      });
      cel(ctx, 'cn.lid', cnLid, { base: c.light, dark: c.base, light: '#FFFFFF' }, { s: 1.4, line: lineOf(c), lw: 2.6, hl: false });
      cel(ctx, 'cn.rose', cnRose, { base: c.light, dark: c.base, light: '#FFFFFF' }, { s: 1.4, line: lineOf(c), lw: 2.8, hl: false });
      ctx.save(); ctx.translate(43, -84); ctx.rotate(-0.75);
      [-4.5, -1.5, 1.5, 4.5].forEach(function (dx) { dot(ctx, dx, 0, 0.95, lineOf(c)); });
      ctx.restore();
    }
  };
  // ---- toy tractor (facing right)
  var trCab = function (t) { rpoly(t, [[-34, -97], [-4, -97], [-2, -50], [-36, -50]], [6, 6, 3, 3]); };
  var trWin = function (t) { rrect(t, -28, -91, 20, 20, 4); };
  var trHood = function (t) { rpoly(t, [[-8, -70], [30, -70], [38, -58], [38, -40], [-8, -40]], [5, 6, 5, 4, 2]); };
  var trFender = function (t) { t.moveTo(-42, -48); t.bezierCurveTo(-42, -74, 6, -74, 6, -48); t.lineTo(1, -48); t.bezierCurveTo(1, -66, -37, -66, -37, -48); t.closePath(); };
  var trPipe = function (t) { rrect(t, 18, -88, 5.5, 20, 2.5); };
  var trRear = function (t) { circ(t, -18, -47, 18.5); };
  var trFront = function (t) { circ(t, 27, -39, 10.5); };
  function tyre(ctx, key, build, cx, cy, r, c) {
    cel(ctx, key, build, TYRE, { s: 2, line: '#2E2624', lw: 2.6, hl: false,
      inner: function (x) { x.strokeStyle = rgba('#2E2624', 0.75); x.lineWidth = 2.6;
        x.beginPath(); for (var i = 0; i < 10; i++) { var a = i * TAU / 10; x.moveTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4)); x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } x.stroke(); } });
    cel(ctx, key + '.hub', function (t) { circ(t, cx, cy, r * 0.52); }, { base: c.light, dark: c.base, light: '#FFFFFF' }, { s: 1.4, line: lineOf(c), lw: 2.2, hl: false });
    dot(ctx, cx, cy, r * 0.18, lineOf(c));
  }
  OB.tractor = {
    sil: function (t) { trCab(t); trHood(t); trRear(t); trFront(t); trPipe(t); trFender(t); },
    draw: function (ctx, c) {
      cel(ctx, 'tr.pipe', trPipe, METAL, { s: 1.2, line: METAL.dark, lw: 2.4, hl: false });
      dot(ctx, 20.75, -89, 3.6, METAL.dark);
      cel(ctx, 'tr.cab', trCab, c, { s: 4, hl: [-30, -94, 3, 2, 0] });
      cel(ctx, 'tr.win', trWin, { base: '#EAF6FA', dark: '#B9D4DF', light: '#FFFFFF' }, { s: 2, line: lineOf(c), lw: 2.4, hl: false,
        inner: function (x) { x.fillStyle = 'rgba(255,255,255,0.95)'; x.beginPath(); x.moveTo(-24, -76); x.lineTo(-14, -89); x.lineTo(-10, -89); x.lineTo(-20, -76); x.closePath(); x.fill(); } });
      cel(ctx, 'tr.hood', trHood, c, { s: 4, hl: [6, -64, 10, 2.4, 0],
        inner: function (x) {   // grille slots
          x.strokeStyle = rgba(c.dark, 0.6); x.lineWidth = 1.8;
          x.beginPath(); x.moveTo(33, -60); x.lineTo(33, -44); x.moveTo(29, -60); x.lineTo(29, -44); x.stroke();
          dot(x, 35, -54, 2.2, '#FFF6D8');
        } });
      tyre(ctx, 'tr.rear', trRear, -18, -47, 18.5, c);
      tyre(ctx, 'tr.front', trFront, 27, -39, 10.5, c);
      cel(ctx, 'tr.fender', trFender, c, { s: 1.8, hl: false });
    }
  };
  // ---- flower in a little pot
  var flPot = function (t) { rpoly(t, [[-23, -50], [23, -50], [17, -29], [-17, -29]], [3, 3, 5, 5]); };
  var flRim = function (t) { rrect(t, -27, -57, 54, 10, 4.5); };
  var flStem = function (t) { t.moveTo(0, -56); t.quadraticCurveTo(-2, -64, 0, -72); };
  var flLeafL = function (t) { t.moveTo(-2, -58); t.quadraticCurveTo(-22, -76, -37, -66); t.quadraticCurveTo(-20, -52, -2, -58); t.closePath(); };
  var flLeafR = function (t) { t.moveTo(2, -59); t.quadraticCurveTo(22, -78, 37, -68); t.quadraticCurveTo(20, -53, 2, -59); t.closePath(); };
  var FLC = { x: 0, y: -80, d: 13, r: 9.4 };
  var flPetals = function (t) { for (var i = 0; i < 6; i++) { var a = -Math.PI / 2 + i * TAU / 6; circ(t, FLC.x + Math.cos(a) * FLC.d, FLC.y + Math.sin(a) * FLC.d, FLC.r); } circ(t, FLC.x, FLC.y, FLC.d); };
  OB.flower = {
    sil: function (t) { flPot(t); flRim(t); flPetals(t); flLeafL(t); flLeafR(t); },
    draw: function (ctx, c) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = LEAF.dark; ctx.lineWidth = 5.4; strokeP(ctx, P('fl.stem', flStem));
      ctx.strokeStyle = LEAF.base; ctx.lineWidth = 2.6; strokeP(ctx, P('fl.stem', flStem));
      cel(ctx, 'fl.leafL', flLeafL, LEAF, { s: 1.4, lw: 2.4, hl: false });
      cel(ctx, 'fl.leafR', flLeafR, LEAF, { s: 1.4, lw: 2.4, hl: false });
      cel(ctx, 'fl.pot', flPot, c, { s: 4.2, hl: [-12, -45, 2.4, 6, 0.15] });
      cel(ctx, 'fl.rim', flRim, { base: c.light, dark: c.base, light: '#FFFFFF' }, { s: 1.8, line: lineOf(c), lw: 3, hl: false });
      // petals as one blossom: outline pass (outer edge only), then one cel-shaded fill, then petal seams
      var pp = P('fl.petals', flPetals);
      ctx.strokeStyle = lineOf(c); ctx.lineWidth = LW * 2; strokeP(ctx, pp);
      cel(ctx, 'fl.petals', flPetals, c, { s: 3.4, line: false, hl: false,
        inner: function (x) {
          x.strokeStyle = lineOf(c); x.lineWidth = 2.2;
          x.beginPath();
          for (var i = 0; i < 6; i++) { var a = -Math.PI / 2 + (i + 0.5) * TAU / 6; x.moveTo(FLC.x + Math.cos(a) * 9, FLC.y + Math.sin(a) * 9); x.lineTo(FLC.x + Math.cos(a) * 16, FLC.y + Math.sin(a) * 16); }
          x.stroke();
          var hc = rgba(mix(c.light, '#FFFFFF', 0.45), 0.9);
          oval(x, FLC.x - 13, FLC.y - 9, 3.4, 2, -0.6, hc); oval(x, FLC.x - 3, FLC.y - 21, 3.2, 1.8, -0.2, hc);
        } });
      cel(ctx, 'fl.mid', function (t) { circ(t, FLC.x, FLC.y, 8.6); }, { base: '#FFF3D6', dark: '#E2C99A', light: '#FFFFFF' }, { s: 1.6, line: lineOf(c), lw: 2.6, hl: [FLC.x - 2.4, FLC.y - 2.8, 2.4, 1.6, -0.5] });
      [[-2.6, 2.6], [2.8, 3], [0, -0.8]].forEach(function (d) { dot(ctx, FLC.x + d[0], FLC.y + d[1], 1.1, rgba(c.dark, 0.6)); });
    }
  };
  function objOf(th) { return OB[th.obj] ? th.obj : 'bucket'; }

  // ================================================================= BLOCKS (chunky toy shape blocks)
  var heartB = function (t) {
    var X = function (x) { return x * 0.8; }, Y = function (y) { return -30 - (96 - y) * 0.82; };
    t.moveTo(X(0), Y(96));
    t.bezierCurveTo(X(-14), Y(85), X(-46.5), Y(66), X(-46.5), Y(39));
    t.bezierCurveTo(X(-46.5), Y(23), X(-35), Y(14), X(-23), Y(14));
    t.bezierCurveTo(X(-11), Y(14), X(-3), Y(21), X(0), Y(30));
    t.bezierCurveTo(X(3), Y(21), X(11), Y(14), X(23), Y(14));
    t.bezierCurveTo(X(35), Y(14), X(46.5), Y(23), X(46.5), Y(39));
    t.bezierCurveTo(X(46.5), Y(66), X(14), Y(85), X(0), Y(96));
    t.closePath();
  };
  var BLK = {
    circle:   function (t) { circ(t, 0, -63, 33); },
    square:   function (t) { rrect(t, -31, -93, 62, 62, 8); },
    triangle: function (t) { rpoly(t, [[0, -99], [41, -31], [-41, -31]], [9, 8, 8]); },
    star:     function (t) { rpoly(t, starPts(0, -62, 39, 17.5), [4.5, 2.5, 4.5, 2.5, 4.5, 2.5, 4.5, 2.5, 4.5, 2.5]); },
    heart:    heartB,
    oval:     function (t) { ell(t, 0, -64, 23, 34, 0); },
    rect:     function (t) { rrect(t, -41, -75, 82, 44, 8); },
    diamond:  function (t) { rpoly(t, [[0, -100], [30, -65.5], [0, -31], [-30, -65.5]], [7, 6, 7, 6]); }
  };
  function shapeOf(th) { return BLK[th.shape] ? th.shape : 'circle'; }
  var DEPTH = [4.5, -4.5];
  function drawBlock(ctx, th, c) {
    var s = shapeOf(th), key = 'blk.' + s, b = BLK[s];
    // the side (extrusion): the same shape shifted up-right, darker, joined by a thick shade stroke
    ctx.save(); ctx.translate(DEPTH[0], DEPTH[1]);
    ctx.fillStyle = mix(c.base, c.dark, 0.55); fillP(ctx, P(key, b));
    ctx.strokeStyle = lineOf(c); ctx.lineWidth = LW; strokeP(ctx, P(key, b));
    ctx.restore();
    ctx.save(); ctx.translate(DEPTH[0] / 2, DEPTH[1] / 2);
    ctx.strokeStyle = mix(c.base, c.dark, 0.55); ctx.lineWidth = 5.2; strokeP(ctx, P(key, b));
    ctx.restore();
    var bb = bbox(key, b);
    cel(ctx, key, b, c, {
      s: 4.2, hl: false,
      inner: function (x) {
        // bevel: light band upper-left
        x.save(); x.translate(-1.2, -1.2); x.strokeStyle = rgba(mix(c.light, '#FFFFFF', 0.35), 0.7); x.lineWidth = 5; strokeP(x, P(key, b)); x.restore();
        x.fillStyle = rgba(mix(c.light, '#FFFFFF', 0.5), 0.85);
        x.beginPath(); ell(x, bb.x + bb.w * 0.32, bb.y + bb.h * 0.3, Math.max(2.4, bb.w * 0.1), Math.max(1.6, bb.h * 0.055), -0.7); x.fill();
        sparkle(x, bb.x + bb.w * 0.5, bb.y + bb.h * 0.26, 3, 'rgba(255,255,255,0.85)');
      }
    });
  }

  // ================================================================= CRATE + APPLES
  var CR = { x: -46, y: -100, w: 92, h: 72, ix: -41, iy: -95, iw: 82, ih: 62 };
  var crBox = function (t) { rrect(t, CR.x, CR.y, CR.w, CR.h, 5); };
  var crIn = function (t) { rrect(t, CR.ix, CR.iy, CR.iw, CR.ih, 3); };
  var ROWS = { 1: [1], 2: [2], 3: [3], 4: [2, 2], 5: [2, 1, 2], 6: [3, 3], 7: [4, 3], 8: [4, 4], 9: [3, 3, 3], 10: [3, 4, 3], 11: [4, 3, 4], 12: [4, 4, 4] };
  var lcache = {};
  /** apple centres (reading order) + radius, inside the crate interior */
  function appleLayout(n) {
    n = Math.max(1, Math.min(12, Math.round(num(n, 3))));
    if (lcache[n]) return lcache[n];
    var rows = ROWS[n], nr = rows.length, maxc = Math.max.apply(null, rows);
    var IH = CR.ih - 5, cw = CR.iw / maxc, ch = IH / nr, r = Math.min(cw, ch) * (n <= 2 ? 0.38 : 0.42), r2 = Math.min(r, 15.5);
    var pts = [];
    if (n === 5) {   // dice five
      var dx = CR.iw * 0.3, dy = IH * 0.3, cx = CR.ix + CR.iw / 2, cy = CR.iy + 5 + IH / 2;
      r2 = 11;
      [[-dx, -dy], [dx, -dy], [0, 0], [-dx, dy], [dx, dy]].forEach(function (d) { pts.push([cx + d[0], cy + d[1]]); });
    } else {
      // rows sit low in the crate (apples rest on the bottom); extra space goes on top
      var gapY = Math.min(ch, r2 * 2.4), total = gapY * nr, y0 = CR.iy + CR.ih - total + gapY / 2 - 1;
      rows.forEach(function (cnt, ri) {
        var gx = Math.min(cw, r2 * 2.4);
        for (var i = 0; i < cnt; i++) pts.push([CR.ix + CR.iw / 2 + (i - (cnt - 1) / 2) * gx, y0 + ri * gapY]);
      });
    }
    return (lcache[n] = { n: n, r: r2, pts: pts });
  }
  function appleBuild(r) {
    return function (t) {
      t.moveTo(0, -r * 0.72);
      t.bezierCurveTo(r * 0.45, -r * 1.12, r * 1.08, -r * 0.92, r * 1.04, -r * 0.08);
      t.bezierCurveTo(r * 1.02, r * 0.66, r * 0.6, r * 1.02, r * 0.22, r * 0.98);
      t.quadraticCurveTo(0, r * 0.9, -r * 0.22, r * 0.98);
      t.bezierCurveTo(-r * 0.6, r * 1.02, -r * 1.02, r * 0.66, -r * 1.04, -r * 0.08);
      t.bezierCurveTo(-r * 1.08, -r * 0.92, -r * 0.45, -r * 1.12, 0, -r * 0.72);
      t.closePath();
    };
  }
  function drawApple(ctx, x, y, r, lit, lw) {
    var key = 'apple' + Math.round(r * 10), b = appleBuild(r);
    ctx.save(); ctx.translate(x, y);
    if (lit) {
      ctx.fillStyle = 'rgba(255,240,170,0.75)'; ctx.beginPath(); circ(ctx, 0, 0, r * 1.5); ctx.fill();
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = Math.max(2.2, r * 0.3); ctx.beginPath(); circ(ctx, 0, 0.5, r * 1.3); ctx.stroke();
      ctx.scale(1.1, 1.1);
    }
    // stem + leaf
    ctx.lineCap = 'round';
    line(ctx, [0, -r * 0.62, r * 0.12, -r * 1.12], '#5A3A20', Math.max(1.4, r * 0.2));
    ctx.fillStyle = LEAF.base; ctx.strokeStyle = LEAF.dark; ctx.lineWidth = Math.max(0.8, r * 0.09);
    ctx.beginPath(); ctx.moveTo(r * 0.12, -r * 0.98); ctx.quadraticCurveTo(r * 0.6, -r * 1.42, r * 0.92, -r * 1.06); ctx.quadraticCurveTo(r * 0.5, -r * 0.76, r * 0.12, -r * 0.98); ctx.closePath(); ctx.fill(); ctx.stroke();
    cel(ctx, key, b, APPLE, { s: r * 0.22, lw: lw || Math.max(1.6, r * 0.2), line: APPLE.dark, hl: [-r * 0.42, -r * 0.3, r * 0.2, r * 0.32, 0.5], hlc: lit ? '#FFFFFF' : 'rgba(255,225,215,0.9)' });
    if (lit) sparkle(ctx, r * 0.55, -r * 0.55, r * 0.42, '#FFFFFF');
    ctx.restore();
  }
  function drawCrate(ctx, th, o) {
    var L = appleLayout(th.n), count = Math.round(num(o.count, -1));
    cel(ctx, 'cr.box', crBox, WOOD, { s: 3, line: '#5A3A20', lw: LW, hl: false,
      inner: function (x) {
        x.fillStyle = rgba(WOOD.light, 0.8); x.fillRect(CR.x + 3, CR.y + 2.5, CR.w - 6, 2.4);
      } });
    cel(ctx, 'cr.in', crIn, { base: '#8E623C', dark: '#6E4A2C', light: '#B08258' }, { s: -2.4, shade: '#6E4A2C', line: '#5A3A20', lw: 2.2, hl: false,
      inner: function (x) {   // back slats
        x.strokeStyle = rgba('#5A3A20', 0.45); x.lineWidth = 1.2;
        x.beginPath();
        for (var yy = CR.iy + 15; yy < CR.iy + CR.ih; yy += 15) { x.moveTo(CR.ix, yy); x.lineTo(CR.ix + CR.iw, yy); }
        x.stroke();
      } });
    // corner nails
    [[CR.x + 3.4, CR.y + 3.4], [CR.x + CR.w - 3.4, CR.y + 3.4], [CR.x + 3.4, CR.y + CR.h - 3.4], [CR.x + CR.w - 3.4, CR.y + CR.h - 3.4]].forEach(function (p) { dot(ctx, p[0], p[1], 1.3, '#5A3A20'); });
    // one apple radius per round (the round's largest n): a crate with fewer apples never shows bigger apples
    var r = num(o.appleN, 0) >= 1 ? Math.min(L.r, appleLayout(o.appleN).r) : L.r;
    for (var i = 0; i < L.pts.length; i++) drawApple(ctx, L.pts[i][0], L.pts[i][1], r, i < count, null);
  }

  // ================================================================= TILE (sign board on a post-cart)
  var TB = { x: -48, y: -99, w: 96, h: 58 };
  var tlBoard = function (t) { rrect(t, TB.x, TB.y, TB.w, TB.h, 10); };
  var tlFace = function (t) { rrect(t, TB.x + 6, TB.y + 6, TB.w - 12, TB.h - 12, 6.5); };
  function tileText(th) {
    var s = th.text != null ? String(th.text) : th.n != null ? String(th.n) : '?';
    s = s.replace(/-/g, '−');
    return s.length ? s.slice(0, 6) : '?';
  }
  function glyphFont(px) { return 'bold ' + Math.round(px * 10) / 10 + 'px ' + FONT; }
  /** big rounded dark-brown text centred at (x, y) fitting maxW × maxH (cap height) */
  function signText(ctx, txt, x, y, maxW, maxH, col) {
    var px = maxH * 1.36;
    ctx.font = glyphFont(px);
    var m = ctx.measureText ? ctx.measureText(txt) : null, w = m && m.width > 0 ? m.width : px * 0.62 * txt.length;
    if (w > maxW) { px *= maxW / w; ctx.font = glyphFont(px); m = ctx.measureText ? ctx.measureText(txt) : null; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    var asc = m && m.actualBoundingBoxAscent > 0 ? m.actualBoundingBoxAscent : px * 0.72,
      desc = m && m.actualBoundingBoxDescent >= 0 && m.actualBoundingBoxAscent > 0 ? m.actualBoundingBoxDescent : 0;
    var by = y + (asc - desc) / 2;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.6, px * 0.045);
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillText(txt, x + 0.8, by + 1.4);
    ctx.fillStyle = col; ctx.fillText(txt, x, by); ctx.strokeText && ctx.strokeText(txt, x, by);
  }
  function drawTile(ctx, th) {
    var txt = tileText(th);
    cel(ctx, 'tl.board', tlBoard, WOOD, { s: 3, line: '#5A3A20', lw: LW, hl: [TB.x + 14, TB.y + 3.4, 8, 1.4, 0] });
    cel(ctx, 'tl.face', tlFace, BOARD, { s: -2.2, shade: '#EBD9B6', line: mix(WOOD.dark, '#C9A87A', 0.3), lw: 2, hl: false,
      inner: function (x) {
        x.strokeStyle = 'rgba(190,150,100,0.22)'; x.lineWidth = 1.2;
        x.beginPath(); x.moveTo(TB.x + 8, TB.y + 16); x.bezierCurveTo(-20, TB.y + 13, 10, TB.y + 19, TB.x + TB.w - 8, TB.y + 15);
        x.moveTo(TB.x + 8, TB.y + TB.h - 13); x.bezierCurveTo(-10, TB.y + TB.h - 10, 14, TB.y + TB.h - 16, TB.x + TB.w - 8, TB.y + TB.h - 12); x.stroke();
      } });
    [[TB.x + 3.2, TB.y + 3.2], [TB.x + TB.w - 3.2, TB.y + 3.2], [TB.x + 3.2, TB.y + TB.h - 3.2], [TB.x + TB.w - 3.2, TB.y + TB.h - 3.2]].forEach(function (p) { dot(ctx, p[0], p[1], 1.2, '#5A3A20'); });
    var n = txt.length;
    signText(ctx, txt, 0, TB.y + TB.h / 2, TB.w - 16, n <= 1 ? 37 : n <= 2 ? 34 : 28, INK);
  }

  // ================================================================= ANIMALS (images by artist C; placeholder silhouette)
  var ANC = {   // muted body / outline tints for the placeholder
    cow: ['#F4EFE6', '#8C7A6A'], pig: ['#F2B8B0', '#B87870'], sheep: ['#F3EEE4', '#9A8E80'], duck: ['#F6F2E6', '#A8A08A'],
    hen: ['#E9C9A2', '#9C7650'], horse: ['#B98A62', '#6E4E34'], goat: ['#E3D8C6', '#8E7E66'], crab: ['#E08A6E', '#9A4E3A'],
    penguin: ['#4A5268', '#2A3042'], lion: ['#E2B46E', '#9A7038'], monkey: ['#A87A56', '#6A4A30'], fishbowl: ['#CFE8F2', '#6E98AC']
  };
  var anBody = function (t) { ell(t, -6, -50, 37, 25, 0); };
  var anHead = function (t) { circ(t, 26, -76, 22); };
  var anLegs = function (t) { rrect(t, -34, -36, 11, 36, 5); rrect(t, -14, -36, 11, 36, 5); rrect(t, 6, -36, 11, 36, 5); rrect(t, 18, -36, 11, 36, 5); };
  function animalOf(th) { return ANC[th.animal] ? th.animal : 'cow'; }
  function assetImg(key, px) {
    var A = FP.Assets;
    if (!A) return null;
    try {
      if (typeof A.has === 'function' && typeof A.sprite === 'function' && A.has(key)) { var s = A.sprite(key, px); if (s) return s; }
      if (typeof A.img === 'function') { var i = A.img(key); if (i) return i; }
      if (A.images && A.images[key]) return A.images[key];
    } catch (e) { /* fall back to the placeholder */ }
    return null;
  }
  var tcache = {}, tN = 0;
  /** a flat-colour silhouette of an image (for the night rim and the glow), cached per image + colour + px */
  function silhouette(img, col, w, h) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    var id = img.__fpId || (img.__fpId = 'i' + (++tN));
    var key = id + col + w + 'x' + h, c = tcache[key];
    if (!c) {
      if (Object.keys(tcache).length > 80) tcache = {};
      c = document.createElement('canvas'); c.width = w; c.height = h;
      var g = c.getContext('2d');
      if (!g) return null;
      g.drawImage(img, 0, 0, w, h);
      g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, w, h);
      tcache[key] = c;
    }
    return c;
  }
  function drawAnimal(ctx, th, o, sizePx) {
    var a = animalOf(th), step = num(o.step, 0) ? 1 : 0, k = 100 / 180;   // the SVG body box ≈ 180 of 200 units
    var px = sizePx * 200 / 180 * num(o.dpr, (G.devicePixelRatio || 1));
    var img = (step && assetImg('animals/' + a + '_step', px)) || assetImg('animals/' + a, px);
    var glow = clamp01(o.glow), night = clamp01(o.night);
    if (img) {
      var W = 200 * k, X = -100 * k, Y = -194 * k;
      if (glow > 0.01 || night > 0.01) {
        var dpx = sizePx / 100 * num(o.dpr, (G.devicePixelRatio || 1));
        if (glow > 0.01) {
          var sg = silhouette(img, '#FFE79A', W * dpx, W * dpx);
          if (sg) {
            ctx.save(); ctx.globalAlpha *= 0.85 * glow;
            var gs = 1 + 0.07 + 0.03 * glow;
            ctx.translate(0, -50); ctx.scale(gs, gs); ctx.translate(0, 50);
            ctx.drawImage(sg, X, Y, W, W); ctx.restore();
          }
        }
        if (night > 0.01) {
          var sn = silhouette(img, '#FFC27E', W * dpx, W * dpx);
          if (sn) {
            ctx.save(); ctx.globalAlpha *= 0.75 * night;
            ctx.drawImage(sn, X - 1.8, Y - 1.4, W, W); ctx.drawImage(sn, X + 1.8, Y - 1.4, W, W);
            ctx.restore();
          }
        }
      }
      ctx.drawImage(img, X, Y, W, W);
      return;
    }
    // ---- placeholder: a soft rounded animal silhouette (facing right), white sticker edge
    var c = ANC[a], C = { base: c[0], dark: c[1], light: '#FFFFFF' };
    var bob = step ? 2 : 0;
    ctx.save();
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 10;
    strokeP(ctx, P('an.body', anBody)); strokeP(ctx, P('an.head', anHead)); strokeP(ctx, P('an.legs', anLegs));
    cel(ctx, 'an.legs', anLegs, C, { s: 1.6, line: c[1], lw: 2.6, hl: false });
    ctx.translate(0, -bob);
    cel(ctx, 'an.body', anBody, C, { s: 4, line: c[1], lw: 3 });
    cel(ctx, 'an.head', anHead, C, { s: 3, line: c[1], lw: 3 });
    eye(ctx, 32, -79, 3.6);
    oval(ctx, 36, -70, 3.6, 2.2, 0, rgba('#F2A99A', 0.85));
    ctx.restore();
  }

  // ---------------------------------------------------------------- alpha layer
  // Fading a multi-part drawing with globalAlpha lets the hidden parts show through (wheels through a boot). In a browser
  // the drawing goes to one scratch canvas at device resolution first and is blitted once with the alpha.
  var scratch = null;
  function layer(ctx, x0, y0, w, h, alpha, fn) {
    var m = typeof document !== 'undefined' && ctx.getTransform ? ctx.getTransform() : null;
    var k = m ? Math.min(6, Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d))) : 0;
    if (!(k > 0) || w * k > 2048 || h * k > 2048) { ctx.save(); ctx.globalAlpha *= alpha; fn(ctx); ctx.restore(); return; }
    var W = Math.ceil(w * k), H = Math.ceil(h * k);
    if (!scratch) scratch = document.createElement('canvas');
    if (scratch.width < W || scratch.height < H) { scratch.width = Math.max(scratch.width, W); scratch.height = Math.max(scratch.height, H); }
    var g = scratch.getContext('2d');
    if (!g) { ctx.save(); ctx.globalAlpha *= alpha; fn(ctx); ctx.restore(); return; }
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W + 1, H + 1);
    g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    g.lineJoin = 'round'; g.lineCap = 'round';
    fn(g);
    g.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save(); ctx.globalAlpha *= alpha;
    ctx.drawImage(scratch, 0, 0, W, H, x0, y0, W / k, H / k);
    ctx.restore();
  }

  // ================================================================= PUBLIC: members
  function kindOf(th) { return KINDS.indexOf(th && th.kind) >= 0 ? th.kind : 'obj'; }
  function colOf(th, d) { return pal(th.color) || FALLBACK[d || 'red']; }
  function silOf(th) {
    var k = kindOf(th);
    if (k === 'obj') { var ob = OB[objOf(th)]; return function (t) { ob.sil(t); wagonSil(t); }; }
    if (k === 'block') { var b = BLK[shapeOf(th)]; return function (t) { b(t); wagonSil(t); }; }
    if (k === 'crate') return function (t) { crBox(t); wagonSil(t); };
    if (k === 'tile') return function (t) { tlBoard(t); rrect(t, -26, -44, 52, 18, 2); wagonSil(t); };
    return function (t) { anBody(t); anHead(t); anLegs(t); };
  }
  function bodyBox(thing, size) {
    size = num(size, 120);
    var s = thing && thing.big === false ? SMALL : 1, h = size * s, k = kindOf(thing || {});
    var w = (k === 'animal' ? 0.92 : k === 'obj' || k === 'block' ? 0.96 : 0.98) * h;
    return { w: w, h: h, cy: -h / 2 };
  }
  function thingKey(t) {
    if (!t) return '?';
    return [t.kind, t.color || '', t.obj || '', t.shape || '', t.n != null ? t.n : '', t.animal || '', t.text != null ? t.text : '', t.big === false ? 's' : ''].join(':');
  }

  function drawMember(ctx, thing, size, opt) {
    if (!ctx || !thing) return;
    size = num(size, 120); if (!(size > 0)) return;
    var o = opt || {}, sc = thing.big === false ? SMALL : 1, s = size / 100 * sc, dim = clamp01(o.dim);
    ctx.save();
    ctx.scale(s, s);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (dim > 0.001) layer(ctx, -86, -136, 172, 150, 1 - 0.55 * dim, function (g) { memberBody(g, thing, o, size * sc); });
    else memberBody(ctx, thing, o, size * sc);
    ctx.restore();
  }
  function memberBody(ctx, thing, o, sizePx) {
    var k = kindOf(thing), glow = clamp01(o.glow), night = clamp01(o.night);
    var sil = k === 'animal' ? null : silOf(thing);
    // soft gold halo + outline pulse (behind)
    if (glow > 0.01) {
      var R = 66 + 16 * glow;
      var g = ctx.createRadialGradient(0, -52, R * 0.2, 0, -52, R);
      g.addColorStop(0, 'rgba(255,232,140,' + (0.8 * glow).toFixed(3) + ')');
      g.addColorStop(0.55, 'rgba(255,214,100,' + (0.45 * glow).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,210,90,0)');
      ctx.fillStyle = g; ctx.beginPath(); circ(ctx, 0, -52, R); ctx.fill();
      if (sil) {
        ctx.strokeStyle = 'rgba(255,238,160,' + (0.9 * glow).toFixed(3) + ')'; ctx.lineWidth = 8 + 6 * glow;
        ctx.beginPath(); sil(ctx); ctx.stroke();
      }
    }
    // cream sticker outline (like the animals' white edge) behind the dark outline: every colour reads on the path, the hay
    // and at night (where it turns into the warm rim light)
    if (sil) {
      ctx.strokeStyle = night > 0.01 ? mix('#FFF8EA', '#FFD38A', night) : '#FFF8EA';
      ctx.save(); ctx.globalAlpha *= 0.9; ctx.lineWidth = LW + 6; ctx.beginPath(); sil(ctx); ctx.stroke(); ctx.restore();
    }
    if (k === 'animal') drawAnimal(ctx, thing, o, sizePx);
    else {
      if (k === 'tile') wagonDesign(ctx, o.wheel, { post: -44 });
      else wagonDesign(ctx, o.wheel);
      if (k === 'obj') OB[objOf(thing)].draw(ctx, colOf(thing));
      else if (k === 'block') drawBlock(ctx, thing, colOf(thing, 'blue'));
      else if (k === 'crate') drawCrate(ctx, thing, o);
      else drawTile(ctx, thing);
    }
    if (o.pennant) drawPennant(ctx, String(o.pennant).charAt(0), num(o.face, 1) < 0 ? -1 : 1);
  }
  /** a little cream letter flag on a stick at the member's back (first-letter rounds); the letter is never mirrored */
  function drawPennant(ctx, letter, face) {
    var px = -42, top = -134, fw = 34, fh = 30;
    ctx.save();
    line(ctx, [px, -6, px, top], '#5A3A20', 6.4);
    line(ctx, [px, -6, px, top], WOOD.base, 3.4);
    cel(ctx, 'pn.flag', function (t) { rpoly(t, [[px, top], [px + fw, top + 2], [px + fw - 6, top + fh / 2], [px + fw, top + fh - 2], [px, top + fh]], [3, 3, 2, 3, 3]); },
      BOARD, { s: 2, line: '#8C5A3C', lw: 2.6, hl: false });
    dot(ctx, px, top - 2, 3.4, '#C9A87A');
    ctx.save(); ctx.translate(px + fw * 0.4, top + fh / 2); ctx.scale(face, 1);
    signText(ctx, letter, 0, 0, fw * 0.66, 17, INK);
    ctx.restore();
    ctx.restore();
  }

  function drawWagon(ctx, w, wheel, opt) {
    if (!ctx) return;
    var s = num(w, 84) / WG.deckW; if (!(s > 0)) return;
    ctx.save(); ctx.scale(s, s); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    wagonDesign(ctx, wheel, opt);
    ctx.restore();
  }

  // ================================================================= HAY-BALE STAGE (origin = TOP centre)
  var ST = { w: 210, h: 66, top: 14, legs: 16 };   // front face height, top face depth, trestle legs (px at s = 1)
  var stTop = function (t) { rpoly(t, [[-ST.w / 2 + 10, -ST.top / 2], [ST.w / 2 - 10, -ST.top / 2], [ST.w / 2, ST.top / 2], [-ST.w / 2, ST.top / 2]], [6, 6, 4, 4]); };
  var stFront = function (t) { rrect(t, -ST.w / 2, ST.top / 2 - 1, ST.w, ST.h, 10); };
  function stageDip(s, pop) { var p = clamp01(pop); return (ST.top / 2 + ST.h) * num(s, 1) * 0.12 * p; }
  function hash(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function drawStage(ctx, s, opt) {
    if (!ctx) return;
    s = num(s, 1); if (!(s > 0)) return;
    var o = opt || {}, p = clamp01(o.pop), night = clamp01(o.night), H = ST.top / 2 + ST.h;
    ctx.save(); ctx.scale(s, s);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // squash about the bottom
    ctx.translate(0, H); ctx.scale(1 + 0.08 * p, 1 - 0.12 * p); ctx.translate(0, -H);
    // a little wooden trestle under the bale + a soft contact shadow: the stage stands on the ground, it never floats
    oval(ctx, 0, H + ST.legs + 2, ST.w * 0.45, 9, 0, 'rgba(60,40,20,0.25)');
    [-ST.w * 0.33, ST.w * 0.33].forEach(function (lx) {
      cel(ctx, 'st.leg' + lx, function (t) { rrect(t, lx - 9, H - 6, 18, ST.legs + 8, 3); }, WOOD, { s: 1.4, line: '#5A3A20', lw: 2.6, hl: false });
    });
    oval(ctx, 0, H + 1, ST.w * 0.52, 6, 0, 'rgba(70,50,30,0.18)');
    if (night > 0.01) {
      ctx.strokeStyle = 'rgba(255,194,126,' + (0.6 * night).toFixed(3) + ')'; ctx.lineWidth = 7;
      ctx.beginPath(); stFront(ctx); stTop(ctx); ctx.stroke();
    }
    cel(ctx, 'st.front', stFront, HAY, { s: 6, line: HAY.dark, lw: 4, hl: false,
      inner: function (x) {
        // straw strands
        x.lineWidth = 1.6;
        for (var i = 0; i < 46; i++) {
          var sx = -ST.w / 2 + 6 + hash(i) * (ST.w - 12), sy = ST.top / 2 + 6 + hash(i + 50) * (ST.h - 12), L = 6 + hash(i + 99) * 9, a = (hash(i + 7) - 0.5) * 0.7;
          x.strokeStyle = i % 3 ? rgba(HAY.dark, 0.55) : rgba(HAY.light, 0.95);
          x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a) * L, sy + Math.sin(a) * L); x.stroke();
        }
        // twine bands
        [-ST.w * 0.3, ST.w * 0.3].forEach(function (bx) {
          x.strokeStyle = '#9C6A3A'; x.lineWidth = 4.2; x.beginPath(); x.moveTo(bx, ST.top / 2); x.lineTo(bx + 2, ST.top / 2 + ST.h); x.stroke();
          x.strokeStyle = 'rgba(240,200,140,0.7)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(bx - 1, ST.top / 2); x.lineTo(bx + 1, ST.top / 2 + ST.h); x.stroke();
        });
      } });
    cel(ctx, 'st.top', stTop, { base: HAY.light, dark: HAY.base, light: '#FFFFFF' }, { s: 2.2, line: HAY.dark, lw: 3.4, hl: false,
      inner: function (x) {
        x.lineWidth = 1.3; x.strokeStyle = rgba(HAY.dark, 0.5);
        for (var i = 0; i < 18; i++) { var sx = -ST.w / 2 + 16 + hash(i + 200) * (ST.w - 32), sy = -ST.top / 2 + 3 + hash(i + 300) * (ST.top - 6); x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + 7, sy + (hash(i) - 0.5) * 2); x.stroke(); }
        [-ST.w * 0.3, ST.w * 0.3].forEach(function (bx) { x.strokeStyle = '#9C6A3A'; x.lineWidth = 3.4; x.beginPath(); x.moveTo(bx * 0.93, -ST.top / 2); x.lineTo(bx, ST.top / 2); x.stroke(); });
      } });
    // night: the bale is lit by the same dusk as the farm (multiplied), only its warm rim glows
    if (night > 0.01) {
      ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha *= 0.45 * night; ctx.fillStyle = '#B9A6A0';
      ctx.beginPath(); stFront(ctx); stTop(ctx); ctx.fill(); ctx.restore();
    }
    // a few loose straws sticking out of the edges
    ctx.strokeStyle = HAY.dark; ctx.lineWidth = 1.8;
    [[-ST.w / 2 + 2, 30, -9, -3], [-ST.w / 2 + 1, 52, -8, 4], [ST.w / 2 - 2, 26, 9, -4], [ST.w / 2 - 1, 48, 8, 3], [-60, ST.top / 2 + ST.h - 1, -3, 6], [70, ST.top / 2 + ST.h - 1, 4, 6]]
      .forEach(function (q) { ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0] + q[2], q[1] + q[3]); ctx.stroke(); });
    // rosette ribbon (cream / brown) on the front
    ctx.save(); ctx.translate(0, ST.top / 2 + ST.h * 0.5);
    [[-7, 1], [7, -1]].forEach(function (tl) {
      ctx.save(); ctx.rotate(tl[0] * 0.03);
      cel(ctx, 'st.tail' + tl[0], function (t) { rpoly(t, [[tl[0] * 0.6 - 6, 4], [tl[0] * 0.6 + 6, 4], [tl[0] * 1.6 + 6, 32], [tl[0] * 1.6, 27], [tl[0] * 1.6 - 6, 32]], [2, 2, 1, 1, 1]); }, { base: '#8C5A3C', dark: '#5E3A24', light: '#B8835C' }, { s: 1.4, line: '#5E3A24', lw: 2.2, hl: false });
      ctx.restore();
    });
    var petals = function (t) { for (var i = 0; i < 10; i++) { var a = i * TAU / 10; circ(t, Math.cos(a) * 12, Math.sin(a) * 12, 6.4); } };
    cel(ctx, 'st.ros', petals, { base: '#F1E6CF', dark: '#C9B48E', light: '#FFFFFF' }, { s: 1.6, line: '#8C5A3C', lw: 2.4, hl: false });
    cel(ctx, 'st.rosc', function (t) { circ(t, 0, 0, 9.5); }, { base: '#8C5A3C', dark: '#5E3A24', light: '#C08A60' }, { s: 1.6, line: '#5E3A24', lw: 2.2, hl: [-3, -3.4, 3, 1.8, -0.5] });
    sparkle(ctx, 0, 0, 4.2, '#F1E6CF');
    ctx.restore();
    ctx.restore();
  }

  // ================================================================= HOME BADGES (unit radius 50, centred)
  var BADGE = {
    farm: { sky: ['#CFE7F1', '#EEF6E8'], draw: function (x) {
      oval(x, -10, 46, 70, 30, 0, '#9CC27A'); oval(x, 30, 52, 60, 24, 0, '#86B064');
      // barn
      x.fillStyle = '#B5735E'; x.strokeStyle = '#7E4A3C'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(-24, 26); x.lineTo(-24, -4); x.lineTo(-12, -20); x.lineTo(12, -20); x.lineTo(24, -4); x.lineTo(24, 26); x.closePath(); x.fill(); x.stroke();
      x.fillStyle = '#7E4A3C'; x.beginPath(); x.moveTo(-28, -2); x.lineTo(-13, -24); x.lineTo(13, -24); x.lineTo(28, -2); x.lineTo(24, 0); x.lineTo(11, -19); x.lineTo(-11, -19); x.lineTo(-24, 0); x.closePath(); x.fill();
      x.fillStyle = '#5A3428'; x.fillRect(-9, 6, 18, 20);
      x.strokeStyle = '#F1E6CF'; x.lineWidth = 2.2; x.strokeRect(-9, 6, 18, 20);
      x.beginPath(); x.moveTo(-9, 6); x.lineTo(9, 26); x.moveTo(9, 6); x.lineTo(-9, 26); x.stroke();
      x.fillStyle = '#F1E6CF'; x.fillRect(-5, -12, 10, 8);
      oval(x, -36, -26, 9, 4, 0, '#FFFFFF'); oval(x, -29, -28, 7, 4.5, 0, '#FFFFFF');
    } },
    sea: { sky: ['#BFE3F2', '#E6F4F8'], draw: function (x) {
      oval(x, 22, -24, 9, 9, 0, '#F7D98A');
      x.fillStyle = '#5BA7C9'; x.fillRect(-60, -2, 120, 70);
      x.strokeStyle = '#FFFFFF'; x.lineWidth = 3.2;
      [-2, 12].forEach(function (yy, j) { x.beginPath(); for (var i = -60; i <= 60; i += 20) { x.moveTo(i + (j ? 10 : 0), yy); x.quadraticCurveTo(i + 5 + (j ? 10 : 0), yy - 6, i + 10 + (j ? 10 : 0), yy); } x.stroke(); });
      oval(x, 0, 40, 60, 14, 0, '#F1DDB0');
      // shell
      x.save(); x.translate(-6, 30);
      x.fillStyle = '#F4B8A8'; x.strokeStyle = '#B9705E'; x.lineWidth = 2.4;
      x.beginPath(); x.moveTo(-14, 6); x.quadraticCurveTo(-16, -14, 0, -15); x.quadraticCurveTo(16, -14, 14, 6); x.closePath(); x.fill(); x.stroke();
      x.fillRect(-5, 5, 10, 4); x.strokeRect(-5, 5, 10, 4);
      x.beginPath(); [-8, -3, 3, 8].forEach(function (d) { x.moveTo(d * 0.4, 5); x.lineTo(d * 1.2, -11); }); x.stroke();
      x.restore();
    } },
    ice: { sky: ['#D6E6F7', '#F2F7FC'], draw: function (x) {
      x.fillStyle = '#7FA9CF'; x.fillRect(-60, 14, 120, 60);
      x.fillStyle = '#FFFFFF'; x.strokeStyle = '#8EB4D6'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(-34, 16); x.lineTo(-22, -16); x.lineTo(-10, -8); x.lineTo(4, -30); x.lineTo(20, -6); x.lineTo(30, -14); x.lineTo(40, 16); x.closePath(); x.fill(); x.stroke();
      x.fillStyle = '#D6E8F7'; x.beginPath(); x.moveTo(4, -30); x.lineTo(20, -6); x.lineTo(30, -14); x.lineTo(40, 16); x.lineTo(8, 16); x.closePath(); x.fill();
      x.fillStyle = 'rgba(214,232,247,0.75)'; x.beginPath(); x.moveTo(-30, 18); x.lineTo(36, 18); x.lineTo(22, 34); x.lineTo(-18, 32); x.closePath(); x.fill();
      x.strokeStyle = '#FFFFFF'; x.lineWidth = 2.4; x.beginPath(); x.moveTo(-44, 44); x.lineTo(-30, 44); x.moveTo(18, 50); x.lineTo(36, 50); x.stroke();
    } },
    jungle: { sky: ['#CDE8C2', '#EDF6E2'], draw: function (x) {
      oval(x, 0, 48, 70, 22, 0, '#6E9E58');
      // palm trunk
      x.strokeStyle = '#7A5130'; x.lineWidth = 7; x.beginPath(); x.moveTo(-6, 44); x.quadraticCurveTo(-10, 10, 4, -14); x.stroke();
      x.strokeStyle = '#A57A4C'; x.lineWidth = 2; x.beginPath(); [34, 22, 10, -2].forEach(function (yy) { x.moveTo(-10, yy); x.lineTo(-3, yy - 2); }); x.stroke();
      // fronds
      [[-2.6, 34], [-1.9, 32], [-0.9, 30], [-0.2, 32], [0.6, 30]].forEach(function (f) {
        x.save(); x.translate(4, -14); x.rotate(f[0]);
        x.fillStyle = '#5E9A4A'; x.strokeStyle = '#3E6E30'; x.lineWidth = 2.2;
        x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(f[1] * 0.5, -10, f[1], 2); x.quadraticCurveTo(f[1] * 0.5, 3, 0, 0); x.closePath(); x.fill(); x.stroke();
        x.restore();
      });
      // big leaves front
      [[-30, 36, -0.6], [30, 38, 0.7]].forEach(function (l) {
        x.save(); x.translate(l[0], l[1]); x.rotate(l[2]);
        x.fillStyle = '#7BB660'; x.strokeStyle = '#3E6E30'; x.lineWidth = 2.2;
        x.beginPath(); ell(x, 0, -10, 9, 16, 0); x.fill(); x.stroke();
        x.beginPath(); x.moveTo(0, 4); x.lineTo(0, -22); x.stroke();
        x.restore();
      });
      dot(x, 8, -4, 3.4, '#8E6A3E'); dot(x, 1, -2, 3.2, '#8E6A3E');
    } },
    savanna: { sky: ['#F7D9A8', '#FBEBCB'], draw: function (x) {
      dot(x, 18, -14, 15, '#F3B65A'); dot(x, 18, -14, 11, '#F7C978');
      x.fillStyle = '#D8B46E'; x.fillRect(-60, 18, 120, 60);
      oval(x, 0, 20, 70, 8, 0, '#C9A25C');
      // acacia
      x.strokeStyle = '#6E4E34'; x.lineWidth = 5; x.beginPath(); x.moveTo(-14, 22); x.lineTo(-14, -2); x.moveTo(-14, 4); x.lineTo(-26, -8); x.moveTo(-14, 0); x.lineTo(-2, -10); x.stroke();
      x.fillStyle = '#7E9A4E'; x.strokeStyle = '#506A30'; x.lineWidth = 2.4;
      x.beginPath(); ell(x, -14, -14, 30, 9, 0); x.fill(); x.stroke();
      oval(x, -20, -17, 14, 3, 0, '#9AB566');
      x.strokeStyle = '#B08A48'; x.lineWidth = 1.8;
      x.beginPath(); [-40, -34, 26, 32, 38].forEach(function (gx) { x.moveTo(gx, 36); x.lineTo(gx - 2, 29); x.moveTo(gx + 3, 36); x.lineTo(gx + 4, 30); }); x.stroke();
    } }
  };
  function drawHomeBadge(ctx, home, r, opt) {
    if (!ctx) return;
    r = num(r, 46); if (!(r > 0)) return;
    var o = opt || {}, a = o.a != null ? clamp01(o.a) : o.alpha != null ? clamp01(o.alpha) : 1, pop = o.pop == null ? 1 : clamp01(o.pop);
    if (a <= 0.001 || pop <= 0.001) return;
    var B = BADGE[home] || BADGE.farm, s = r / 50 * pop;
    ctx.save(); ctx.globalAlpha *= a; ctx.scale(s, s);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    oval(ctx, 2, 4, 52, 52, 0, 'rgba(60,40,30,0.22)');
    dot(ctx, 0, 0, 52, '#FFFFFF');
    ctx.save(); ctx.beginPath(); circ(ctx, 0, 0, 44); ctx.clip();
    var g = ctx.createLinearGradient(0, -44, 0, 44); g.addColorStop(0, B.sky[0]); g.addColorStop(1, B.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(-46, -46, 92, 92);
    B.draw(ctx);
    ctx.restore();
    ctx.strokeStyle = '#D9CBB4'; ctx.lineWidth = 2.4; ctx.beginPath(); circ(ctx, 0, 0, 44); ctx.stroke();
    ctx.strokeStyle = '#B8A688'; ctx.lineWidth = 2.6; ctx.beginPath(); circ(ctx, 0, 0, 52); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ell(ctx, -22, -28, 10, 4.5, -0.6); ctx.fill();
    ctx.restore();
  }

  // ================================================================= ICONS (centred in a size × size box)
  function drawIcon(ctx, choice, size) {
    if (!ctx || !choice) return;
    size = num(size, 100); if (!(size > 0)) return;
    var t = choice, k = t.kind;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (KINDS.indexOf(k) >= 0) {
      var sm = t.big === false ? SMALL : 1, ms = size * 0.86;     // the whole member (incl. wagon) fits
      ctx.translate(k === 'obj' || k === 'block' ? -size * 0.03 : 0, ms * sm / 2);
      drawMember(ctx, t, ms, {});
    } else if (k === 'letter') {
      ctx.translate(0, size * 0.43); drawMember(ctx, { kind: 'tile', text: t.text }, size * 0.86, {});
    } else if (k === 'number') {
      var n = Math.round(num(t.n != null ? t.n : t.text, 1)), s1 = size / 100;
      ctx.scale(s1, s1);
      var dots = n >= 1 && n <= 10;
      cel(ctx, 'ic.card', function (x) { rrect(x, -45, -47, 90, 94, 18); }, BOARD, { s: 2.2, line: '#B89B72', lw: 3, hl: false });
      signText(ctx, String(n), 0, dots ? -12 : 0, 70, dots ? 40 : 56, INK);
      if (dots) {
        var rows = n <= 5 ? [n] : [5, n - 5], dr = 5.2;
        rows.forEach(function (cnt, ri) {
          for (var i = 0; i < cnt; i++) {
            var dx = (i - (cnt - 1) / 2) * 14, dy = rows.length === 1 ? 30 : 23 + ri * 13;
            drawApple(ctx, dx, dy, dr, false, 1.4);
          }
        });
      }
    } else if (k === 'color') {
      var c = pal(t.color) || FALLBACK.red, s2 = size / 100;
      ctx.scale(s2, s2);
      var blob = function (x) {
        x.moveTo(40, 0);
        for (var j = 1; j <= 9; j++) { var a = j * TAU / 9, am = a - TAU / 18, ro = j % 2 ? 43 : 38; x.quadraticCurveTo(Math.cos(am) * 47, Math.sin(am) * 45, Math.cos(a) * ro, Math.sin(a) * ro * 0.95); }
        x.closePath();
      };
      cel(ctx, 'ic.blob', blob, c, { s: 5, hl: [-16, -18, 10, 6, -0.6] });
      dot(ctx, 30, 35, 6, c.base); ctx.strokeStyle = lineOf(c); ctx.lineWidth = 2.4; ctx.beginPath(); circ(ctx, 30, 35, 6); ctx.stroke();
      dot(ctx, 4, -24, 3.5, 'rgba(255,255,255,0.7)');
    } else if (k === 'home') {
      drawHomeBadge(ctx, t.home, size * 0.46, {});
    } else if (k === 'size') {
      var inner = t.thing && KINDS.indexOf(t.thing.kind) >= 0 ? Object.assign({}, t.thing) : { kind: 'obj', obj: 'bucket', color: t.color || 'red' };
      var big = t.big === true || t.size === 'big';
      inner.big = true;
      if (big) { ctx.translate(0, size * 0.45); drawMember(ctx, inner, size * 0.9, {}); }
      else {
        ctx.strokeStyle = 'rgba(120,100,80,0.3)'; if (ctx.setLineDash) ctx.setLineDash([5, 5]); ctx.lineWidth = 2;
        ctx.beginPath(); rrect(ctx, -size * 0.44, -size * 0.44, size * 0.88, size * 0.88, size * 0.12); ctx.stroke(); if (ctx.setLineDash) ctx.setLineDash([]);
        ctx.translate(0, size * 0.42); drawMember(ctx, inner, size * 0.9 * SMALL, {});
      }
    } else {
      dot(ctx, 0, 0, size * 0.35, '#E9D7B9'); ctx.strokeStyle = '#A8875E'; ctx.lineWidth = 3; ctx.beginPath(); circ(ctx, 0, 0, size * 0.35); ctx.stroke();
    }
    ctx.restore();
  }

  // ================================================================= HINT HAND (fingertip at (x, y), points UP-LEFT)
  function drawHintHand(ctx, x, y, press, alpha, size) {
    if (!ctx) return;
    var a = alpha == null ? 1 : clamp01(alpha); if (a <= 0.001) return;
    var s = num(size, 96); if (!(s > 0)) return;
    var p = clamp01(press);
    ctx.save(); ctx.translate(num(x, 0), num(y, 0));
    if (a < 0.999) layer(ctx, -s * 0.45, -s * 0.4, s * 1.05, s * 1.5, a, function (g) { handBody(g, s, p); });
    else handBody(ctx, s, p);
    ctx.restore();
  }
  function handBody(ctx, s, p) {
    var F = '#FFF6EA', L = '#B9835A', EDGE = '#4A3B3A';
    ctx.save();
    if (p > 0.02) {
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * p).toFixed(3) + ')'; ctx.lineWidth = s * 0.035;
      ctx.beginPath(); ctx.arc(0, 0, s * (0.1 + 0.14 * (1 - p)), 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,214,90,' + (0.7 * p).toFixed(3) + ')'; ctx.lineWidth = s * 0.02;
      ctx.beginPath(); ctx.arc(0, 0, s * (0.2 + 0.1 * (1 - p)), 0, TAU); ctx.stroke();
    }
    ctx.rotate(-0.35);
    ctx.translate(0, s * 0.06 * (1 - p));
    ctx.scale(1 - 0.06 * p, 1 - 0.06 * p);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    function hand(q) {
      q.beginPath();
      rrect(q, -s * 0.085, 0, s * 0.17, s * 0.52, s * 0.085);
      rrect(q, -s * 0.26, s * 0.36, s * 0.47, s * 0.42, s * 0.14);
      q.moveTo(-s * 0.2, s * 0.5);
      q.ellipse(-s * 0.27, s * 0.46, s * 0.07, s * 0.15, -0.6, 0, TAU);
    }
    ctx.globalAlpha *= 0.96;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    hand(ctx); ctx.lineWidth = s * 0.07 + 6; ctx.strokeStyle = EDGE; ctx.stroke(); ctx.restore();
    hand(ctx); ctx.lineWidth = s * 0.07; ctx.strokeStyle = L; ctx.stroke();
    hand(ctx); ctx.fillStyle = F; ctx.fill();
    ctx.strokeStyle = '#F1D6B8'; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); ctx.moveTo(0, s * 0.5); ctx.lineTo(s * 0.18, s * 0.5); ctx.moveTo(0, s * 0.62); ctx.lineTo(s * 0.18, s * 0.62); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ell(ctx, -s * 0.03, s * 0.12, s * 0.025, s * 0.07, 0); ctx.fill();
    // cuff: Bo's brown leather collar with the brass tag
    ctx.fillStyle = '#8C5A3C'; ctx.strokeStyle = '#5E3A24'; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); rrect(ctx, -s * 0.25, s * 0.76, s * 0.46, s * 0.14, s * 0.06); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,220,180,0.35)'; ctx.lineWidth = s * 0.012;
    ctx.beginPath(); ctx.moveTo(-s * 0.22, s * 0.79); ctx.lineTo(s * 0.18, s * 0.79); ctx.stroke();
    dot(ctx, -s * 0.02, s * 0.93, s * 0.045, '#D8B26A'); ctx.strokeStyle = '#9C7838'; ctx.lineWidth = s * 0.014; ctx.beginPath(); circ(ctx, -s * 0.02, s * 0.93, s * 0.045); ctx.stroke();
    ctx.restore();
  }

  // ================================================================= DUST PUFF
  function drawDust(ctx, x, y, r, alpha) {
    if (!ctx) return;
    var a = alpha == null ? 1 : clamp01(alpha); r = num(r, 12);
    if (a <= 0.001 || !(r > 0)) return;
    ctx.save(); ctx.translate(num(x, 0), num(y, 0)); ctx.globalAlpha *= a;
    var puffs = [[-0.75, 0.15, 0.5], [0.72, 0.18, 0.48], [-0.25, -0.2, 0.62], [0.3, -0.1, 0.58], [0, 0.28, 0.5]];
    puffs.forEach(function (q) { oval(ctx, q[0] * r, q[1] * r + r * 0.06, q[2] * r * 1.05, q[2] * r * 0.92, 0, 'rgba(176,146,104,0.45)'); });
    puffs.forEach(function (q) { oval(ctx, q[0] * r, q[1] * r, q[2] * r, q[2] * r * 0.88, 0, 'rgba(236,222,196,0.92)'); });
    oval(ctx, -0.3 * r, -0.32 * r, 0.22 * r, 0.14 * r, -0.4, 'rgba(255,255,255,0.8)');
    ctx.restore();
  }

  function clearCache() { pcache = {}; pN = 0; bcache = {}; lcache = {}; tcache = {}; }

  FP.ParadeArt = {
    drawMember: drawMember, bodyBox: bodyBox, drawWagon: drawWagon, drawStage: drawStage, stageDip: stageDip,
    drawHomeBadge: drawHomeBadge, drawIcon: drawIcon, drawHintHand: drawHintHand, drawDust: drawDust,
    appleLayout: function (n) { var L = appleLayout(n); return { n: L.n, r: L.r, pts: L.pts.map(function (p) { return [p[0], p[1]]; }) }; },
    pal: function (n) { return pal(n) || null; }, PALETTE: FALLBACK, WOOD: WOOD, HAY: HAY, METAL: METAL, APPLE: APPLE, FONT: FONT,
    OBJECTS: OBJECTS, SHAPES: SHAPES, ANIMALS: ANIMALS, HOMES: HOMES, KINDS: KINDS, SMALL: SMALL, WAGON: { deckW: WG.deckW, wheelR: WG.wheelR, deckTop: -WG.deckY },
    STAGE: { w: ST.w, h: ST.h + ST.top / 2 },
    thingKey: thingKey, clearCache: clearCache
  };
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
