/* Nini's Sea Painting — SP.Pictures: the line drawings the child paints (character artist B, DESIGN §3 / §4.2).
 * Pure data + pure functions, node-safe (no DOM). Every picture is authored in a 600 × 400 box, outline navy #33405E.
 *
 *   SP.Pictures.TEMPLATES          id → { id, kind, alive, spotName?, maxSlots? }
 *   SP.Pictures.list(kind)         template ids of a kind: 'parts' | 'shapes' | 'count' | 'scene' | 'labels'
 *   SP.Pictures.build(id, opt)     → pic (pure, deterministic)
 *       parts : opt none
 *       shapes: opt.shapes = [shape per slot] (1..maxSlots, SP.SHAPES)          → parts s0.. role 'shape' + body (role 'part')
 *       count : opt.n (1..12), opt.seed                                          → parts spot0.. role 'spot' + figure
 *       scene : opt.animals = [animal per slot] (1..4), opt.sizes? ['big'|'small'] → parts a0.. role 'animal'
 *       labels: opt.labels = [text per bubble] (2..5), opt.kind ('letter'|'number'|…) → parts l0.. role 'label'
 *   SP.Pictures.hit(pic, x, y, pad)  → part id | null. Pass 1: parts that strictly contain the point, smallest area wins
 *       (= the one drawn on top). Pass 2 (only if pass 1 found nothing): the hit shapes grown by pad, smallest area wins.
 *   SP.Pictures.validate(pic)      → null | reason
 *   SP.Pictures.shapeD(shape, cx, cy, r) → SVG path string of a shape (icons); SP.Pictures.animalIcon(animal) → mini pic
 *       of one animal centred on (0,0) fitting 200 × 160 (icons / Talk time).
 *
 * pic = { id, kind, alive, w:600, h:400, spotName?, parts:[part], deco:[{d, fill?, stroke?, width?, part?}], under:[{d, fill}] }
 * part = { id, d, hit, area, bbox:[x0,y0,x1,y1], cx, cy, role, nameKind, nameValue, size?, text?, def }
 *   hit = {type:'ellipse', cx, cy, rx, ry} | {type:'poly', pts:[[x,y]…]} | {type:'multi', list:[hit…]}  (multi = a part made of
 *   several pieces, e.g. both crab claws). Parts are sorted by area, largest first = draw order (small parts on top).
 *   deco.part (optional) = the part id the detail belongs to (moves with that part's wobble).
 */
(function (SP) {
  'use strict';

  var W = 600, H = 400, NAVY = '#33405E', TAU = Math.PI * 2;
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
  var SEA_ANIMALS = ['fish', 'crab', 'octopus', 'starfish', 'jellyfish', 'seahorse', 'whale', 'dolphin'];
  var PART_NAMES = ['body', 'tail', 'fin', 'shell', 'claws', 'legs', 'hull', 'sail', 'flag', 'bell', 'tentacles', 'spots',
    'belly', 'head', 'arms', 'hat', 'tower', 'propeller', 'roof', 'rock', 'snailshell'];
  var MIN_PART = 70, MIN_PIECE = 26, MIN_SHAPE = 60, MIN_SPOT = 60, MIN_LABEL = 104, SAFE_MARGIN = 8, MAX_PARTS = 14;

  // ================================================================ geometry
  // shapes: {t:'E', cx, cy, rx, ry, rot} · {t:'S', pts} smooth closed (Catmull-Rom) · {t:'R', pts, r} rounded polygon
  //         {t:'L', pts, smooth, closed} (deco lines only)
  function E(cx, cy, rx, ry, rot) { return { t: 'E', cx: cx, cy: cy, rx: rx, ry: ry == null ? rx : ry, rot: rot || 0 }; }
  function S(pts) { return orient({ t: 'S', pts: pts }); }
  function R(pts, r) { return orient({ t: 'R', pts: pts, r: r == null ? 12 : r }); }
  function L(pts, smooth, closed) { return { t: 'L', pts: pts, smooth: !!smooth, closed: !!closed }; }
  function f1(n) { return Math.round(n * 10) / 10; }
  function signedArea(p) { var a = 0; for (var i = 0; i < p.length; i++) { var q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; }
  function orient(sh) {   // positive shoelace (clockwise on screen) so union sub-paths never cut holes (nonzero rule)
    if (signedArea(sh.pts) < 0) {
      sh.pts = sh.pts.slice().reverse();
      if (Array.isArray(sh.r)) sh.r = sh.r.slice().reverse();
    }
    return sh;
  }
  function radiusAt(sh, i) { return Array.isArray(sh.r) ? sh.r[i] : sh.r; }
  function ellPt(cx, cy, rx, ry, deg) { var a = deg * Math.PI / 180; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; }
  function ellBottom(e, x) { var u = (x - e.cx) / e.rx; return e.cy + e.ry * Math.sqrt(Math.max(0, 1 - u * u)); }

  function bez(p0, c1, c2, p1, t) {
    var m = 1 - t;
    return [m * m * m * p0[0] + 3 * m * m * t * c1[0] + 3 * m * t * t * c2[0] + t * t * t * p1[0],
            m * m * m * p0[1] + 3 * m * m * t * c1[1] + 3 * m * t * t * c2[1] + t * t * t * p1[1]];
  }
  function crSeg(p, i, closed) {   // Catmull-Rom segment i → cubic control points
    var n = p.length;
    var a = closed ? p[(i - 1 + n) % n] : p[Math.max(0, i - 1)], b = p[i % n], c = p[(i + 1) % n], d = closed ? p[(i + 2) % n] : p[Math.min(n - 1, i + 2)];
    return [b, [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6], [c[0] - (d[0] - b[0]) / 6, c[1] - (d[1] - b[1]) / 6], c];
  }
  function rCorners(sh) {
    var p = sh.pts, n = p.length, out = [];
    for (var i = 0; i < n; i++) {
      var P = p[i], A = p[(i - 1 + n) % n], B = p[(i + 1) % n];
      var la = Math.hypot(A[0] - P[0], A[1] - P[1]), lb = Math.hypot(B[0] - P[0], B[1] - P[1]);
      var r = Math.max(0, Math.min(radiusAt(sh, i) || 0, la * 0.48, lb * 0.48));
      out.push({ P: P, a: [P[0] + (A[0] - P[0]) * r / la, P[1] + (A[1] - P[1]) * r / la], b: [P[0] + (B[0] - P[0]) * r / lb, P[1] + (B[1] - P[1]) * r / lb] });
    }
    return out;
  }
  function pt(p) { return f1(p[0]) + ' ' + f1(p[1]); }
  function dOf(sh) {
    var s = '', i, n;
    if (sh.t === 'E') {
      var c = Math.cos(sh.rot), si = Math.sin(sh.rot), deg = f1(sh.rot * 180 / Math.PI);
      var p0 = [sh.cx + sh.rx * c, sh.cy + sh.rx * si], p1 = [sh.cx - sh.rx * c, sh.cy - sh.rx * si];
      var a = ' A ' + f1(sh.rx) + ' ' + f1(sh.ry) + ' ' + deg + ' 1 1 ';
      return 'M ' + pt(p0) + a + pt(p1) + a + pt(p0) + ' Z';
    }
    if (sh.t === 'S') {
      n = sh.pts.length; s = 'M ' + pt(sh.pts[0]);
      for (i = 0; i < n; i++) { var g = crSeg(sh.pts, i, true); s += ' C ' + pt(g[1]) + ' ' + pt(g[2]) + ' ' + pt(g[3]); }
      return s + ' Z';
    }
    if (sh.t === 'R') {
      var k = rCorners(sh); n = k.length; s = 'M ' + pt(k[0].b);
      for (i = 1; i <= n; i++) { var q = k[i % n]; s += ' L ' + pt(q.a) + ' Q ' + pt(q.P) + ' ' + pt(q.b); }
      return s + ' Z';
    }
    if (sh.t === 'L') {
      n = sh.pts.length; s = 'M ' + pt(sh.pts[0]);
      if (sh.smooth && n > 2) {
        var segs = sh.closed ? n : n - 1;
        for (i = 0; i < segs; i++) { var h = crSeg(sh.pts, i, sh.closed); s += ' C ' + pt(h[1]) + ' ' + pt(h[2]) + ' ' + pt(h[3]); }
      } else for (i = 1; i < n; i++) s += ' L ' + pt(sh.pts[i]);
      return s + (sh.closed ? ' Z' : '');
    }
    return '';
  }
  function sample(sh) {
    var out = [], i, j, n;
    if (sh.t === 'E') {
      var c = Math.cos(sh.rot), si = Math.sin(sh.rot);
      for (i = 0; i < 48; i++) { var a = i / 48 * TAU, x = sh.rx * Math.cos(a), y = sh.ry * Math.sin(a); out.push([sh.cx + x * c - y * si, sh.cy + x * si + y * c]); }
    } else if (sh.t === 'S') {
      n = sh.pts.length;
      for (i = 0; i < n; i++) { var g = crSeg(sh.pts, i, true); for (j = 0; j < 8; j++) out.push(bez(g[0], g[1], g[2], g[3], j / 8)); }
    } else if (sh.t === 'R') {
      var k = rCorners(sh);
      for (i = 0; i < k.length; i++) {
        var q = k[i];
        for (j = 0; j <= 4; j++) { var t = j / 4, m = 1 - t; out.push([m * m * q.a[0] + 2 * m * t * q.P[0] + t * t * q.b[0], m * m * q.a[1] + 2 * m * t * q.P[1] + t * t * q.b[1]]); }
      }
    }
    return out.map(function (p) { return [f1(p[0]), f1(p[1])]; });
  }
  // transform: p → (fx·(x − ox)·k + cx, (y − oy)·k + cy)
  function xf(sh, X) {
    function m(p) { return [X.fx * (p[0] - X.ox) * X.k + X.cx, (p[1] - X.oy) * X.k + X.cy]; }
    if (sh.t === 'E') { var c = m([sh.cx, sh.cy]); return E(c[0], c[1], sh.rx * X.k, sh.ry * X.k, X.fx < 0 ? -sh.rot : sh.rot); }
    var o = { t: sh.t, pts: sh.pts.map(m) };
    if (sh.t === 'R') o.r = Array.isArray(sh.r) ? sh.r.map(function (r) { return r * X.k; }) : sh.r * X.k;
    if (sh.t === 'L') { o.smooth = sh.smooth; o.closed = sh.closed; return o; }
    return orient(o);
  }
  function hitOf(sh) {
    if (sh.t === 'E' && !sh.rot) return { type: 'ellipse', cx: f1(sh.cx), cy: f1(sh.cy), rx: f1(sh.rx), ry: f1(sh.ry) };
    return { type: 'poly', pts: sample(sh) };
  }
  function hitOfList(list) { return list.length === 1 ? hitOf(list[0]) : { type: 'multi', list: list.map(hitOf) }; }

  // ---------------------------------------------------------------- hit-shape maths
  function inPoly(pts, x, y) {
    var c = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var a = pts[i], b = pts[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  function segDist(x, y, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? ((x - a[0]) * dx + (y - a[1]) * dy) / l : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
  }
  function polyDist(pts, x, y) { var d = Infinity; for (var i = 0; i < pts.length; i++) d = Math.min(d, segDist(x, y, pts[i], pts[(i + 1) % pts.length])); return d; }
  function hitTest(h, x, y, pad) {
    pad = pad || 0;
    if (!h) return false;
    if (h.type === 'ellipse') { var u = (x - h.cx) / (h.rx + pad), v = (y - h.cy) / (h.ry + pad); return u * u + v * v <= 1; }
    if (h.type === 'poly') return inPoly(h.pts, x, y) || (pad > 0 && polyDist(h.pts, x, y) <= pad);
    if (h.type === 'multi') { for (var i = 0; i < h.list.length; i++) if (hitTest(h.list[i], x, y, pad)) return true; }
    return false;
  }
  function hitPolys(h) {   // every piece as a polygon
    if (h.type === 'multi') return [].concat.apply([], h.list.map(hitPolys));
    if (h.type === 'poly') return [h.pts];
    return [sample(E(h.cx, h.cy, h.rx, h.ry))];
  }
  function hitArea(h) {
    if (h.type === 'ellipse') return Math.PI * h.rx * h.ry;
    if (h.type === 'poly') return Math.abs(signedArea(h.pts));
    var a = 0; h.list.forEach(function (q) { a += hitArea(q); }); return a;
  }
  function bboxOf(polys) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    polys.forEach(function (p) { p.forEach(function (q) { b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[0]); b[3] = Math.max(b[3], q[1]); }); });
    return b.map(f1);
  }
  function hit(pic, x, y, pad) {
    if (!pic || !pic.parts) return null;
    var best = null, i, p;
    for (i = 0; i < pic.parts.length; i++) { p = pic.parts[i]; if (hitTest(p.hit, x, y, 0) && (!best || p.area < best.area)) best = p; }
    if (!best && pad > 0) for (i = 0; i < pic.parts.length; i++) { p = pic.parts[i]; if (hitTest(p.hit, x, y, pad) && (!best || p.area < best.area)) best = p; }
    return best ? best.id : null;
  }

  // ================================================================ deco helpers (style objects with a geometry `sh`)
  function eye(x, y, r, look) {
    look = look == null ? 0.2 : look;
    return [{ sh: E(x, y, r), fill: '#FFFFFF', stroke: NAVY, width: Math.max(3, r * 0.2) },
            { sh: E(x + r * look, y + r * 0.1, r * 0.56), fill: NAVY },
            { sh: E(x + r * look - r * 0.2, y - r * 0.14, r * 0.2), fill: '#FFFFFF' }];
  }
  function smile(x, y, w, width) { return { sh: L([[x - w / 2, y], [x, y + w * 0.34], [x + w / 2, y]], true), stroke: NAVY, width: width || 5 }; }
  function cheek(x, y, r) { return { sh: E(x, y, r, r * 0.72), fill: 'rgba(255,120,135,0.42)' }; }
  function line(pts, width, smooth, color) { return { sh: L(pts, smooth), stroke: color || NAVY, width: width || 5 }; }
  function ring(x, y, r, fill, width) { return { sh: E(x, y, r), fill: fill || '#FFFFFF', stroke: NAVY, width: width || 4 }; }
  function shine(x, y, r) { return { sh: L([[x - r * 0.55, y + r * 0.1], [x - r * 0.42, y - r * 0.38], [x - r * 0.05, y - r * 0.58]], true), stroke: 'rgba(255,255,255,0.95)', width: Math.max(4, r * 0.16) }; }
  function ribbon(c, w0, w1) {   // closed outline around a centre line, width w0 → w1, rounded tip
    var n = c.length, left = [], right = [];
    for (var i = 0; i < n; i++) {
      var a = c[Math.max(0, i - 1)], b = c[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      var w = (w0 + (w1 - w0) * i / (n - 1)) / 2, nx = -dy / l, ny = dx / l;
      left.push([c[i][0] + nx * w, c[i][1] + ny * w]); right.push([c[i][0] - nx * w, c[i][1] - ny * w]);
    }
    var e = c[n - 1], p = c[n - 2], el = Math.hypot(e[0] - p[0], e[1] - p[1]) || 1;
    var tip = [e[0] + (e[0] - p[0]) / el * w1 * 0.5, e[1] + (e[1] - p[1]) / el * w1 * 0.5];
    return S(left.concat([tip], right.reverse()));
  }
  function starPts(cx, cy, Ro, Ri, n) {
    var p = []; n = n || 5;
    for (var i = 0; i < n * 2; i++) { var a = -Math.PI / 2 + i * Math.PI / n, q = i % 2 ? Ri : Ro; p.push([cx + Math.cos(a) * q, cy + Math.sin(a) * q]); }
    return p;
  }
  function starR(cx, cy, Ro, Ri, rt, ri) { var r = []; for (var i = 0; i < 10; i++) r.push(i % 2 ? ri : rt); return R(starPts(cx, cy, Ro, Ri), r); }
  function mirrorX(sh, axis) { return xf(sh, { fx: -1, ox: axis, oy: 0, k: 1, cx: axis, cy: 0 }); }
  function wave(y0, amp, x0, x1, n) { var p = []; for (var i = 0; i <= n; i++) p.push([x0 + (x1 - x0) * i / n, y0 + (i % 2 ? -amp : amp)]); return p; }
  function waterUnder(y0, fill) {   // wavy water band along the bottom (non-paintable)
    var top = wave(y0, 7, 0, 600, 12), pts = top.concat([[600, 400], [0, 400]]), r = top.map(function () { return 14; }).concat([0, 0]);
    r[0] = 0; r[top.length - 1] = 0;
    return { sh: R(pts, r), fill: fill || '#DCEFF4' };
  }

  // ================================================================ creature / object designs (600 × 400 picture coords)
  // design = { pieces: [{ name, shapes:[sh], safe:[x,y], def }], deco: [deco], under?: [under], skip?: [piece names left out
  //            of the one-part figure] }
  var D = {};

  D.fish = function () {
    var body = E(320, 205, 165, 112);
    var tail = R([[172, 252], [157, 205], [172, 158], [62, 74], [34, 96], [94, 205], [34, 314], [62, 336]], [0, 0, 0, 26, 24, 30, 24, 26]);
    var fin = R([[226, 114], [297, 94], [376, 101], [336, 50], [258, 22], [210, 32]], [0, 0, 0, 30, 30, 22]);
    var deco = [].concat(eye(408, 178, 30),
      [smile(456, 240, 38), cheek(400, 238, 15),
       line([[364, 126], [348, 205], [364, 284]], 5, true),
       { sh: R([[232, 254], [304, 218], [328, 246], [304, 272]], [4, 22, 22, 22]), stroke: NAVY, width: 5 },
       line([[206, 162], [222, 178], [238, 162]], 4, true, 'rgba(51,64,94,0.55)'),
       line([[250, 150], [266, 166], [282, 150]], 4, true, 'rgba(51,64,94,0.55)'),
       line([[228, 196], [244, 212], [260, 196]], 4, true, 'rgba(51,64,94,0.55)'),
       line([[80, 140], [130, 180]], 4, false, 'rgba(51,64,94,0.45)'), line([[80, 270], [130, 230]], 4, false, 'rgba(51,64,94,0.45)'),
       ring(526, 150, 15), ring(556, 108, 10)]);
    deco.forEach(function (d) { d.part = 'body'; });
    deco[deco.length - 4].part = deco[deco.length - 3].part = 'tail';
    deco[deco.length - 1].noFig = deco[deco.length - 2].noFig = true;   // mouth bubbles: only on the big fish picture
    return { pieces: [
      { name: 'body', shapes: [body], safe: [392, 272], def: '#9FD6E6' },
      { name: 'tail', shapes: [tail], safe: [110, 196], def: '#F7C59F' },
      { name: 'fin', shapes: [fin], safe: [268, 62], def: '#C9B6E4' }], deco: deco };
  };

  D.crab = function () {
    var shell = E(300, 250, 150, 92);
    function claw(m) {
      var c = S([[70, 132], [56, 92], [76, 56], [118, 40], [156, 56], [130, 86], [164, 96], [168, 132], [142, 162], [100, 168]]);
      var arm = R([[173, 201], [189, 188], [158, 136], [134, 150]], 8);
      return m ? [mirrorX(c, 300), mirrorX(arm, 300)] : [c, arm];
    }
    function leg(a, tip, m) {
      var A = ellPt(300, 250, 150, 92, a - 9), B = ellPt(300, 250, 150, 92, a + 9), dx = tip[0] - (A[0] + B[0]) / 2, dy = tip[1] - (A[1] + B[1]) / 2, l = Math.hypot(dx, dy);
      var nx = -dy / l * 16, ny = dx / l * 16;
      var t1 = [tip[0] + nx, tip[1] + ny], t2 = [tip[0] - nx, tip[1] - ny];
      if (Math.hypot(t1[0] - A[0], t1[1] - A[1]) > Math.hypot(t2[0] - A[0], t2[1] - A[1])) { var tt = t1; t1 = t2; t2 = tt; }
      var sh = R([A, t1, t2, B], [0, 12, 12, 0]);
      return m ? mirrorX(sh, 300) : sh;
    }
    var legsL = [[146, [98, 356]], [166, [56, 322]], [188, [40, 266]]];
    var legs = [];
    legsL.forEach(function (q) { legs.push(leg(q[0], q[1], false)); legs.push(leg(q[0], q[1], true)); });
    var deco = [line([[266, 172], [256, 120]], 8), line([[334, 172], [344, 120]], 8)].concat(
      eye(254, 104, 25, 0.1), eye(346, 104, 25, 0.1),
      [smile(300, 288, 54), cheek(238, 276, 16), cheek(362, 276, 16),
       line([[220, 205], [236, 195]], 4, false, 'rgba(51,64,94,0.5)'), line([[380, 205], [364, 195]], 4, false, 'rgba(51,64,94,0.5)'),
       line([[296, 210], [304, 210]], 5, false, 'rgba(51,64,94,0.5)')]);
    deco.forEach(function (d) { d.part = 'shell'; });
    var mid = function (q) { var A = ellPt(300, 250, 150, 92, q[0]); return [f1((A[0] * 0.42 + q[1][0] * 0.58)), f1((A[1] * 0.42 + q[1][1] * 0.58))]; };
    return { pieces: [
      { name: 'shell', shapes: [shell], safe: [300, 246], def: '#F4B9A4' },
      { name: 'claws', shapes: claw(false).concat(claw(true)), safe: [104, 108], def: '#F6D49E' },
      { name: 'legs', shapes: legs, safe: mid(legsL[1]), def: '#E9C2B8' }], deco: deco };
  };

  D.sailboat = function () {
    var hull = R([[92, 262], [508, 262], [452, 342], [148, 342]], [12, 12, 36, 36]);
    var sail = R([[312, 96], [312, 248], [492, 248]], [10, 10, 16]), jib = R([[288, 118], [288, 248], [158, 248]], [10, 10, 16]);
    var flag = R([[306, 10], [396, 20], [378, 48], [398, 80], [306, 84]], [4, 10, 6, 10, 4]);
    var deco = [{ sh: R([[294, 4], [306, 4], [306, 264], [294, 264]], 3), fill: '#D8B48A', stroke: NAVY, width: 5 },
      ring(220, 302, 12, '#FFFFFF', 4), ring(300, 302, 12, '#FFFFFF', 4), ring(380, 302, 12, '#FFFFFF', 4),
      line([[118, 280], [482, 280]], 4, false, 'rgba(51,64,94,0.45)'),
      line([[330, 140], [330, 230]], 4, false, 'rgba(51,64,94,0.35)'), line([[270, 160], [270, 230]], 4, false, 'rgba(51,64,94,0.35)')];
    deco[1].part = deco[2].part = deco[3].part = deco[4].part = 'hull';
    return { pieces: [
      { name: 'hull', shapes: [hull], safe: [300, 324], def: '#D9B68C' },
      { name: 'sail', shapes: [sail, jib], safe: [372, 214], def: '#F5E7CB' },
      { name: 'flag', shapes: [flag], safe: [338, 48], def: '#9FD6E6' }],
      deco: deco, under: [waterUnder(352)] };
  };

  D.jellyfish = function () {
    var pts = [];
    for (var a = 180; a <= 360; a += 22.5) pts.push(ellPt(300, 182, 152, 150, a));
    pts = pts.concat([[440, 204], [410, 190], [375, 210], [338, 192], [300, 210], [262, 192], [225, 210], [190, 190], [160, 204]]);
    var bell = S(pts);
    var tent = [205, 265, 335, 395].map(function (x0, i) {
      var s = 1, o = (i - 1.5) * 6;
      return ribbon([[x0, 196], [x0 + 14 * s + o * 0.4, 240], [x0 - 12 * s + o, 284], [x0 + 12 * s + o * 1.6, 328], [x0 + o * 2.2, 366]], 36, 26);
    });
    var spots = [E(206, 128, 36), E(300, 88, 36), E(394, 128, 36)];
    var deco = [].concat(eye(258, 160, 23), eye(342, 160, 23), [smile(300, 190, 40), cheek(232, 190, 13), cheek(368, 190, 13)]);
    deco.forEach(function (d) { d.part = 'bell'; });
    return { pieces: [
      { name: 'bell', shapes: [bell], safe: [300, 148], def: '#D8C8F0' },
      { name: 'tentacles', shapes: tent, safe: [258, 300], def: '#F7D3E2' },
      { name: 'spots', shapes: spots, safe: [300, 88], def: '#FFF0BE' }], deco: deco };
  };

  D.whale = function () {
    var body = S([[536, 236], [512, 304], [432, 348], [312, 356], [204, 334], [136, 290], [104, 236], [112, 206], [150, 212], [222, 176], [318, 140], [434, 138], [508, 178]]);
    var tail = S([[112, 222], [80, 188], [36, 160], [20, 118], [52, 116], [90, 144], [96, 98], [124, 66], [146, 100], [140, 168], [150, 214]]);
    var belly = S([[512, 262], [508, 300], [430, 342], [312, 350], [210, 328], [192, 304], [246, 286], [336, 270], [436, 264]]);
    var deco = [].concat(eye(446, 222, 22),
      [line([[528, 262], [502, 274], [474, 268]], 5, true), cheek(468, 250, 13),
       line([[262, 304], [400, 312]], 4, true, 'rgba(51,64,94,0.45)'), line([[300, 326], [430, 326]], 4, true, 'rgba(51,64,94,0.45)'),
       line([[444, 136], [444, 104]], 6), line([[444, 112], [418, 84]], 6, true), line([[444, 112], [470, 84]], 6, true),
       ring(412, 72, 11, '#E6F6FB'), ring(476, 72, 11, '#E6F6FB'), ring(444, 58, 12, '#E6F6FB')]);
    deco[0].part = deco[1].part = deco[2].part = deco[3].part = deco[4].part = 'body';
    deco[5].part = deco[6].part = 'belly';
    return { pieces: [
      { name: 'body', shapes: [body], safe: [316, 206], def: '#AFC6DE' },
      { name: 'belly', shapes: [belly], safe: [360, 318], def: '#F3E6D6' },
      { name: 'tail', shapes: [tail], safe: [74, 146], def: '#9CCAD6' }], deco: deco };
  };

  D.octopus = function () {
    var head = E(300, 168, 130, 110);
    var hat = [E(300, 94, 102, 18), R([[226, 94], [374, 94], [352, 26], [248, 26]], [4, 4, 18, 18])];
    var arms = [[190, -58, -1], [246, -26, 1], [300, 0, -1], [354, 26, -1], [410, 58, 1]].map(function (q) {
      var x0 = q[0], dx = q[1], c = q[2], y0 = ellBottom(head, x0) - 8;
      return ribbon([[x0, y0], [x0 + dx * 0.35 + 8 * c, 306], [x0 + dx * 0.75 - 6 * c, 344], [x0 + dx, 370], [x0 + dx + 22 * (dx >= 0 ? 1 : -1), 360]], 40, 24);
    });
    var deco = [].concat(eye(252, 164, 28), eye(348, 164, 28),
      [smile(300, 212, 52), cheek(212, 204, 17), cheek(388, 204, 17)]);
    deco.forEach(function (d) { d.part = 'head'; });
    deco.push({ sh: R([[240, 64], [360, 64], [364, 80], [236, 80]], 3), fill: 'rgba(51,64,94,0.18)', part: 'hat' });
    return { pieces: [
      { name: 'head', shapes: [head], safe: [300, 196], def: '#F6C2A6' },
      { name: 'arms', shapes: arms, safe: [300, 334], def: '#F3D5BF' },
      { name: 'hat', shapes: hat, safe: [300, 52], def: '#BCE2E8' }], deco: deco, skip: ['hat'] };
  };

  D.submarine = function () {
    var body = R([[78, 166], [472, 166], [472, 326], [78, 326]], 80);
    var tower = R([[226, 174], [226, 82], [364, 82], [364, 174]], [0, 22, 22, 0]);
    var prop = [E(488, 246, 24), E(514, 194, 28, 48), E(514, 298, 28, 48)];
    var deco = [{ sh: L([[322, 84], [322, 42], [366, 42]]), stroke: NAVY, width: 11 },
      ring(160, 246, 28, '#E3F4F8', 5), ring(254, 246, 28, '#E3F4F8', 5), ring(348, 246, 28, '#E3F4F8', 5),
      shine(160, 246, 28), shine(254, 246, 28), shine(348, 246, 28),
      ring(488, 246, 8, NAVY, 3), line([[250, 112], [340, 112]], 4, false, 'rgba(51,64,94,0.45)')];
    deco.forEach(function (d, i) { d.part = i === 7 ? 'propeller' : i === 8 ? 'tower' : 'body'; });
    deco[0].part = 'tower';
    return { pieces: [
      { name: 'body', shapes: [body], safe: [300, 300], def: '#E8D19C' },
      { name: 'tower', shapes: [tower], safe: [294, 140], def: '#B8D6E2' },
      { name: 'propeller', shapes: prop, safe: [516, 184], def: '#C7BBDD' }], deco: deco };
  };

  D.seahorse = function () {
    var head = E(330, 90, 58, 46), snout = R([[372, 78], [436, 76], [450, 88], [436, 100], [374, 106]], [4, 10, 10, 10, 4]);
    var torso = S([[290, 112], [348, 122], [384, 176], [388, 240], [354, 292], [300, 308], [264, 278], [254, 214], [268, 150]]);
    var tail = ribbon([[300, 282], [324, 320], [312, 354], [272, 368], [240, 350], [242, 324], [266, 316]], 46, 24);
    var fin = S([[270, 166], [216, 148], [194, 192], [206, 240], [260, 254]]);
    var deco = [].concat(eye(338, 82, 19, 0.3),
      [cheek(362, 104, 11),
       { sh: R([[296, 52], [308, 18], [322, 44], [338, 16], [352, 48]], [2, 6, 3, 6, 2]), fill: '#FFFFFF', stroke: NAVY, width: 5 },
       line([[350, 170], [374, 176]], 4, false, 'rgba(51,64,94,0.5)'), line([[356, 206], [382, 208]], 4, false, 'rgba(51,64,94,0.5)'),
       line([[352, 242], [378, 240]], 4, false, 'rgba(51,64,94,0.5)'), line([[208, 180], [258, 186]], 4, false, 'rgba(51,64,94,0.4)'),
       line([[206, 214], [256, 214]], 4, false, 'rgba(51,64,94,0.4)')]);
    deco.forEach(function (d, i) { d.part = i >= 8 ? 'fin' : 'body'; });
    return { pieces: [
      { name: 'body', shapes: [torso, head, snout], safe: [318, 212], def: '#F8D49E' },
      { name: 'tail', shapes: [tail], safe: [292, 362], def: '#F4C39B' },
      { name: 'fin', shapes: [fin], safe: [226, 198], def: '#BFE0CF' }], deco: deco };
  };

  D.snail = function () {
    var shell = E(348, 170, 128, 120), head = E(130, 250, 58, 55);
    var body = S([[170, 276], [260, 282], [400, 280], [500, 286], [548, 318], [518, 350], [400, 356], [200, 356], [150, 340], [134, 300]]);
    var sp = [];
    for (var i = 0; i <= 36; i++) { var a = i / 36 * Math.PI * 3.3, r = 10 + i * 2.6; sp.push([348 + Math.cos(a + 1) * r, 172 + Math.sin(a + 1) * r * 0.94]); }
    var deco = [{ sh: L(sp, true), stroke: NAVY, width: 6, part: 'snailshell' },
      line([[112, 206], [96, 152]], 8), line([[150, 206], [166, 152]], 8)].concat(eye(94, 140, 19), eye(168, 140, 19),
      [smile(140, 268, 36), cheek(102, 262, 11),
       line([[220, 330], [500, 330]], 4, true, 'rgba(51,64,94,0.35)')]);
    deco.forEach(function (d, i) { if (i) d.part = i === deco.length - 1 ? 'body' : 'head'; });
    return { pieces: [
      { name: 'snailshell', shapes: [shell], safe: [300, 110], def: '#F2C7A2' },
      { name: 'body', shapes: [body], safe: [452, 322], def: '#D6E6C4' },
      { name: 'head', shapes: [head], safe: [124, 236], def: '#CDE3BC' }], deco: deco };
  };

  D.starfish = function () {
    var star = starR(300, 214, 186, 100, 32, 24);
    var spots = [];
    for (var k = 0; k < 5; k++) { var a = (-90 + 72 * k) * Math.PI / 180; spots.push(E(300 + 100 * Math.cos(a), 214 + 100 * Math.sin(a), 36)); }
    var deco = [].concat(eye(270, 204, 20), eye(330, 204, 20), [smile(300, 238, 40), cheek(256, 236, 12), cheek(344, 236, 12)]);
    deco.forEach(function (d) { d.part = 'arms'; });
    return { pieces: [
      { name: 'arms', shapes: [star], safe: [300, 212], def: '#F7C79E' },
      { name: 'spots', shapes: spots, safe: [300, 114], def: '#FFF0C4' }], deco: deco };
  };

  D.lighthouse = function () {
    var rock = R([[56, 394], [70, 344], [124, 308], [204, 290], [300, 286], [398, 290], [478, 308], [530, 344], [544, 394]], [4, 30, 40, 40, 40, 40, 40, 30, 4]);
    var tower = R([[244, 306], [356, 306], [338, 112], [262, 112]], 6);
    var roof = R([[224, 118], [376, 118], [348, 66], [300, 28], [252, 66]], [10, 10, 22, 22, 22]);
    var deco = [{ sh: R([[268, 126], [332, 126], [332, 162], [268, 162]], 6), fill: '#FFF0B0', stroke: NAVY, width: 5, part: 'tower' },
      { sh: R([[284, 254], [316, 254], [316, 306], [284, 306]], [14, 14, 0, 0]), fill: 'rgba(51,64,94,0.12)', stroke: NAVY, width: 5, part: 'tower' },
      line([[256, 196], [344, 196]], 5, false), line([[251, 232], [349, 232]], 5, false),
      { sh: R([[262, 140], [120, 96], [120, 184]], 6), fill: 'rgba(255,224,120,0.42)' },
      { sh: R([[338, 140], [480, 96], [480, 184]], 6), fill: 'rgba(255,224,120,0.42)' },
      line([[150, 340], [190, 330]], 4, false, 'rgba(51,64,94,0.4)'), line([[410, 330], [452, 342]], 4, false, 'rgba(51,64,94,0.4)'),
      ring(300, 26, 8, '#FFFFFF', 4)];
    deco[2].part = deco[3].part = 'tower'; deco[6].part = deco[7].part = 'rock'; deco[8].part = 'roof';
    return { pieces: [
      { name: 'rock', shapes: [rock], safe: [420, 352], def: '#C8C2B6' },
      { name: 'tower', shapes: [tower], safe: [300, 214], def: '#F2D3C6' },
      { name: 'roof', shapes: [roof], safe: [300, 84], def: '#9FC9D8' }], deco: deco, under: [waterUnder(358)] };
  };

  D.dolphin = function () {
    var body = S([[570, 214], [548, 230], [500, 236], [430, 268], [330, 290], [226, 278], [150, 248], [106, 214], [116, 192], [160, 196],
      [240, 160], [336, 132], [430, 132], [488, 156], [520, 186], [552, 198]]);
    var tail = S([[122, 222], [88, 196], [40, 180], [24, 150], [60, 146], [96, 170], [86, 126], [104, 92], [134, 118], [140, 168], [156, 206]]);
    var fin = [R([[372, 136], [304, 140], [266, 150], [272, 98], [296, 60], [322, 82]], [0, 0, 0, 16, 18, 20]),
               R([[380, 262], [324, 280], [282, 338], [300, 346], [360, 312]], [0, 0, 14, 14, 10])];
    var deco = [].concat(eye(468, 188, 20),
      [line([[560, 220], [520, 226], [490, 220]], 5, true), cheek(474, 214, 12), ring(436, 150, 7, '#FFFFFF', 4),
       line([[180, 236], [300, 262], [430, 250]], 4, true, 'rgba(51,64,94,0.35)')]);
    deco.forEach(function (d) { d.part = 'body'; });
    return { pieces: [
      { name: 'body', shapes: [body], safe: [380, 196], def: '#B5C9DE' },
      { name: 'fin', shapes: fin, safe: [298, 106], def: '#C9B6E4' },
      { name: 'tail', shapes: [tail], safe: [68, 168], def: '#9CCAD6' }], deco: deco };
  };

  // ---- non-animal figures (count / labels / shapes bodies)
  D.chest = function () {
    var base = R([[150, 250], [450, 250], [450, 388], [150, 388]], 16);
    var lid = R([[160, 252], [440, 252], [424, 186], [176, 186]], [0, 0, 34, 34]);
    var deco = [line([[204, 190], [200, 386]], 7), line([[396, 190], [400, 386]], 7), line([[152, 254], [448, 254]], 6),
      { sh: R([[280, 270], [320, 270], [320, 318], [280, 318]], 8), fill: '#F6E1A4', stroke: NAVY, width: 5 },
      ring(300, 290, 6, NAVY, 2)];
    return { pieces: [{ name: 'chest', shapes: [base, lid], safe: [300, 350], def: '#D8B48A' }], deco: deco };
  };
  D.rock = function () {
    var rock = S([[168, 244], [160, 180], [192, 120], [252, 80], [322, 70], [392, 96], [432, 152], [442, 212], [430, 246], [300, 252]]);
    var deco = [line([[150, 250], [140, 200], [156, 150], [144, 110]], 9, true, '#9DBFA4'),
      line([[452, 250], [462, 196], [448, 150], [460, 118]], 9, true, '#9DBFA4'),
      line([[230, 140], [262, 120]], 4, false, 'rgba(51,64,94,0.4)'), line([[340, 190], [380, 176]], 4, false, 'rgba(51,64,94,0.4)')];
    return { pieces: [{ name: 'rock', shapes: [rock], safe: [300, 170], def: '#C8C2B6' }], deco: deco };
  };
  D.buoy = function () {
    var body = R([[244, 302], [356, 302], [374, 356], [356, 392], [244, 392], [226, 356]], [18, 18, 16, 18, 18, 16]);
    var post = R([[286, 258], [314, 258], [314, 306], [286, 306]], 8);
    var deco = [line([[232, 340], [368, 340]], 5), line([[232, 370], [368, 370]], 5), ring(300, 254, 10, '#FFF0B0', 4)];
    return { pieces: [{ name: 'buoy', shapes: [body, post], safe: [300, 322], def: '#F2C9B8' }], deco: deco };
  };

  // ---------------------------------------------------------------- design → parts
  function decoOut(list, X) {
    return list.map(function (q) {
      var o = { d: dOf(X ? xf(q.sh, X) : q.sh) };
      if (q.fill) o.fill = q.fill;
      if (q.stroke) { o.stroke = q.stroke; o.width = f1((q.width || 5) * (X ? Math.max(0.6, Math.min(1, X.k)) : 1)); }
      if (q.part) o.part = q.part;
      return o;
    });
  }
  function makePart(id, shapes, info) {
    var h = hitOfList(shapes), polys = hitPolys(h);
    var p = { id: id, d: shapes.map(dOf).join(' '), hit: h, area: Math.round(hitArea(h)), bbox: bboxOf(polys),
      cx: f1(info.safe[0]), cy: f1(info.safe[1]), role: info.role || 'part', nameKind: info.nameKind || 'part',
      nameValue: info.nameValue == null ? id : info.nameValue, def: info.def };
    if (info.size) p.size = info.size;
    if (info.text != null) p.text = String(info.text);
    return p;
  }
  function designBox(d) {   // bbox of all pieces (picture coords)
    var polys = [];
    d.pieces.forEach(function (pc) { if (!d.skip || d.skip.indexOf(pc.name) < 0) pc.shapes.forEach(function (s) { polys.push(sample(s)); }); });
    return bboxOf(polys);
  }
  /* The whole design as ONE paintable part (scene animals, count / label figures, shape-template bodies): union of the
     pieces; the inner pieces' outlines come back as deco lines so the drawing still reads (fish tail, fin…). */
  function figure(d, id, X, info, decoPart) {
    var pcs = d.pieces.filter(function (pc) { return !d.skip || d.skip.indexOf(pc.name) < 0; });
    var all = [], lines = [];
    pcs.forEach(function (pc, i) {
      pc.shapes.forEach(function (s) { var t = xf(s, X); all.push(t); if (i > 0) lines.push({ d: dOf(t), stroke: NAVY, width: f1(Math.max(3.5, 5 * Math.min(1, X.k * 1.4))), part: decoPart || id }); });
    });
    var base = pcs[0], sp = base.safe;
    var safe = [X.fx * (sp[0] - X.ox) * X.k + X.cx, (sp[1] - X.oy) * X.k + X.cy];
    var keep = d.deco.filter(function (q) { return !q.noFig && (!q.part || !d.skip || d.skip.indexOf(q.part) < 0); });
    var deco = lines.concat(decoOut(keep, X).map(function (q) { q.part = decoPart || id; return q; }));
    var p = makePart(id, all, { safe: info.safe || safe, role: info.role, nameKind: info.nameKind, nameValue: info.nameValue, def: info.def || base.def, size: info.size });
    return { part: p, deco: deco };
  }
  // place a design so its bbox centre lands on (cx, cy) and it fits w × h
  function fitX(d, cx, cy, w, h, fx) {
    var b = designBox(d), k = Math.min(w / (b[2] - b[0]), h / (b[3] - b[1]));
    return { fx: fx || 1, ox: (b[0] + b[2]) / 2, oy: (b[1] + b[3]) / 2, k: k, cx: cx, cy: cy };
  }

  // ================================================================ shapes
  function shapeGeo(shape, cx, cy, r) {
    function P(list, rad) { return R(list.map(function (q) { return [cx + q[0] * r, cy + q[1] * r]; }), rad); }
    switch (shape) {
      case 'circle': return E(cx, cy, r);
      case 'square': return P([[-0.82, -0.82], [0.82, -0.82], [0.82, 0.82], [-0.82, 0.82]], r * 0.2);
      case 'rect': return P([[-1.02, -0.66], [1.02, -0.66], [1.02, 0.66], [-1.02, 0.66]], r * 0.18);
      case 'oval': return E(cx, cy, r * 1.06, r * 0.72);
      case 'diamond': return P([[0, -1.1], [0.82, 0], [0, 1.1], [-0.82, 0]], r * 0.16);
      case 'triangle': return P([[0, -1.04], [1.0, 0.68], [-1.0, 0.68]], r * 0.2);
      case 'star': return starR(cx, cy + r * 0.06, r * 1.1, r * 0.52, r * 0.12, r * 0.05);
      case 'heart': return S([[0, 0.98], [-0.5, 0.52], [-0.96, 0.02], [-0.92, -0.56], [-0.5, -0.86], [0, -0.52], [0.5, -0.86], [0.92, -0.56], [0.96, 0.02], [0.5, 0.52]]
        .map(function (q) { return [cx + q[0] * r, cy + q[1] * r]; }));
      default: return E(cx, cy, r);
    }
  }
  function shapeSafe(shape, cx, cy, r) {
    if (shape === 'triangle') return [cx, cy + r * 0.18];
    if (shape === 'heart') return [cx, cy + r * 0.05];
    if (shape === 'star') return [cx, cy + r * 0.08];
    return [cx, cy];
  }
  function shapeD(shape, cx, cy, r) { return dOf(shapeGeo(shape, cx || 0, cy || 0, r || 50)); }

  // ================================================================ templates
  var TEMPLATES = {}, ORDER = { parts: [], shapes: [], count: [], scene: [], labels: [] };
  function tpl(t) { TEMPLATES[t.id] = t; ORDER[t.kind].push(t.id); }

  // ---- parts: one design → its named pieces
  [['fish', 'swim'], ['crab', 'scuttle'], ['sailboat', 'sail'], ['jellyfish', 'float'], ['whale', 'swim'], ['octopus', 'bob'],
   ['submarine', 'swim'], ['seahorse', 'float'], ['snail', 'scuttle'], ['starfish', 'bob'], ['lighthouse', 'bob'], ['dolphin', 'swim']]
    .forEach(function (q) {
      tpl({ id: q[0], kind: 'parts', alive: q[1], make: function () {
        var d = D[q[0]]();
        return { parts: d.pieces.map(function (pc) { return makePart(pc.name, pc.shapes, { safe: pc.safe, def: pc.def }); }),
          deco: decoOut(d.deco), under: decoOut(d.under || []) };
      } });
    });

  // ---- shapes: a body with shape slots. slots[n] = [[cx, cy, r]…]
  function shapesTpl(id, alive, body, slots, def, onBody) {
    tpl({ id: id, kind: 'shapes', alive: alive, maxSlots: Math.max.apply(null, Object.keys(slots).map(Number)), slots: slots, make: function (opt) {
      var list = (opt && opt.shapes) || SHAPES.slice(0, 3), set = slots[list.length];
      if (!set) throw new Error('pictures: ' + id + ' has no layout for ' + list.length + ' shapes');
      var b = body(), parts = [b.part], deco = b.deco.slice();
      list.forEach(function (sh, i) {
        if (SHAPES.indexOf(sh) < 0) throw new Error('pictures: unknown shape ' + sh);
        var s = set[i], g = shapeGeo(sh, s[0], s[1], s[2]);
        parts.push(makePart('s' + i, [g], { safe: shapeSafe(sh, s[0], s[1], s[2]), role: 'shape', nameKind: 'shape', nameValue: sh, def: def }));
        if (b.slotDeco) deco = deco.concat(b.slotDeco(s, i));
      });
      return { parts: parts, deco: deco, under: b.under || [], onBody: onBody };
    } });
  }
  shapesTpl('sub_windows', 'swim', function () {
    var body = [R([[40, 150], [530, 150], [530, 342], [40, 342]], 96), R([[214, 158], [214, 70], [340, 70], [340, 158]], [0, 22, 22, 0]),
      E(548, 246, 22, 54)];
    return { part: makePart('body', body, { safe: [190, 322], nameKind: 'thing', nameValue: 'submarine', def: '#E8D19C' }),
      deco: [{ d: dOf(L([[302, 72], [302, 30], [348, 30]])), stroke: NAVY, width: 11, part: 'body' },
        { d: dOf(L([[238, 100], [316, 100]])), stroke: 'rgba(51,64,94,0.45)', width: 4, part: 'body' }] };
  }, { 1: [[285, 246, 64]], 2: [[200, 246, 60], [370, 246, 60]], 3: [[150, 246, 54], [285, 246, 54], [420, 246, 54]],
       4: [[114, 246, 48], [229, 246, 48], [344, 246, 48], [459, 246, 48]] }, '#E3F4F8', true);
  shapesTpl('sandcastle', 'bob', function () {
    var sh = [R([[50, 120], [200, 120], [200, 372], [50, 372]], 6), R([[400, 120], [550, 120], [550, 372], [400, 372]], 6),
      R([[180, 162], [420, 162], [420, 372], [180, 372]], 6)];
    [[50, 120], [107, 120], [165, 120], [400, 120], [457, 120], [515, 120]].forEach(function (q) { sh.push(R([[q[0], q[1] + 6], [q[0] + 35, q[1] + 6], [q[0] + 35, q[1] - 34], [q[0], q[1] - 34]], 6)); });
    [[180, 162], [283, 162], [385, 162]].forEach(function (q) { sh.push(R([[q[0], q[1] + 6], [q[0] + 35, q[1] + 6], [q[0] + 35, q[1] - 30], [q[0], q[1] - 30]], 6)); });
    return { part: makePart('body', sh, { safe: [300, 352], nameKind: 'thing', nameValue: 'castle', def: '#F1D9A8' }),
      deco: [{ d: dOf(L([[300, 132], [300, 66]])), stroke: NAVY, width: 6, part: 'body' },
        { d: dOf(R([[303, 66], [346, 78], [303, 92]], 4)), fill: '#FFFFFF', stroke: NAVY, width: 5, part: 'body' }],
      under: decoOut([{ sh: R([[0, 362], [600, 362], [600, 400], [0, 400]], 0), fill: '#F4E7CB' }]) };
  }, { 1: [[300, 262, 66]], 2: [[125, 230, 60], [475, 230, 60]], 3: [[125, 220, 56], [300, 262, 56], [475, 220, 56]],
       4: [[125, 212, 52], [240, 290, 50], [360, 290, 50], [475, 212, 52]],
       5: [[125, 190, 48], [300, 220, 48], [475, 190, 48], [192, 312, 48], [408, 312, 48]] }, '#FBE6B4', true);
  shapesTpl('rock_wall', 'bob', function () {
    var mound = S([[40, 372], [34, 280], [64, 170], [134, 96], [236, 62], [364, 62], [466, 96], [536, 170], [566, 280], [560, 372], [300, 384]]);
    return { part: makePart('body', [mound], { safe: [300, 364], nameKind: 'thing', nameValue: 'wall', def: '#D3CCC0' }),
      deco: [{ d: dOf(L([[70, 300], [96, 290]])), stroke: 'rgba(51,64,94,0.4)', width: 4, part: 'body' },
        { d: dOf(L([[500, 300], [530, 292]])), stroke: 'rgba(51,64,94,0.4)', width: 4, part: 'body' },
        { d: dOf(L([[28, 380], [16, 330], [30, 280], [18, 236]], true)), stroke: '#9DBFA4', width: 9 },
        { d: dOf(L([[578, 380], [588, 330], [574, 286], [586, 246]], true)), stroke: '#9DBFA4', width: 9 }],
      under: decoOut([{ sh: R([[0, 366], [600, 366], [600, 400], [0, 400]], 0), fill: '#F4E7CB' }]) };
  }, { 1: [[300, 220, 70]], 2: [[210, 226, 62], [390, 226, 62]], 3: [[166, 240, 56], [300, 172, 56], [434, 240, 56]],
       4: [[230, 168, 52], [370, 168, 52], [190, 292, 52], [410, 292, 52]],
       5: [[180, 170, 48], [300, 150, 48], [420, 170, 48], [240, 290, 48], [360, 290, 48]] }, '#ECE1D2', true);
  shapesTpl('flag_boat', 'sail', function () {
    var hull = R([[40, 296], [560, 296], [500, 378], [100, 378]], [12, 12, 36, 36]);
    var deco = [{ sh: R([[64, 24], [76, 24], [76, 298], [64, 298]], 3), fill: '#D8B48A', stroke: NAVY, width: 5 },
      { sh: R([[524, 24], [536, 24], [536, 298], [524, 298]], 3), fill: '#D8B48A', stroke: NAVY, width: 5 },
      { sh: L([[70, 40], [300, 72], [530, 40]], true), stroke: NAVY, width: 4 },
      { sh: L([[90, 326], [510, 326]]), stroke: 'rgba(51,64,94,0.45)', width: 4, part: 'body' }];
    return { part: makePart('body', [hull], { safe: [300, 350], nameKind: 'thing', nameValue: 'boat', def: '#D9B68C' }),
      deco: decoOut(deco), under: decoOut([waterUnder(370)]),
      slotDeco: function (s) {   // a string from the rope to the flag top
        var ropeY = 40 + 32 * (1 - Math.pow((s[0] - 300) / 230, 2));
        return decoOut([{ sh: L([[s[0], ropeY], [s[0], s[1] - s[2] * 0.95]]), stroke: NAVY, width: 4 }]);
      } };
  }, { 1: [[300, 170, 66]], 2: [[200, 170, 60], [400, 170, 60]], 3: [[170, 168, 54], [300, 178, 54], [430, 168, 54]],
       4: [[136, 166, 48], [246, 178, 48], [356, 178, 48], [466, 166, 48]] }, '#F9DCC6', false);

  // ---- count: a figure + n spots in spot areas, laid out from the seed
  function rngOf(seed) {
    var h = 2166136261, s = String(seed == null ? 1 : seed);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    var a = h >>> 0;
    return function () {   // mulberry32
      a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function spotCells(areas, r, ext) {
    var cells = [], c = 2 * r * ext + 14;
    areas.forEach(function (a) {
      var cols = Math.floor(a[2] / c), rows = Math.floor(a[3] / c);
      if (cols < 1 || rows < 1) return;
      var cw = a[2] / cols, ch = a[3] / rows;
      for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) cells.push([a[0] + x * cw, a[1] + y * ch, cw, ch]);
    });
    return cells;
  }
  function countTpl(id, alive, spotName, fig, areas, def) {
    var ext = spotName === 'starfish' ? 1.12 : 1;
    tpl({ id: id, kind: 'count', alive: alive, spotName: spotName, maxN: 12, make: function (opt) {
      var n = (opt && opt.n) | 0, rnd = rngOf(opt && opt.seed);
      if (n < 1 || n > 12) throw new Error('pictures: count n must be 1..12');
      var r = n <= 5 ? 38 : n <= 8 ? 34 : 31, cells = spotCells(areas, r, ext);
      while (cells.length < n && r > 30) { r--; cells = spotCells(areas, r, ext); }
      if (cells.length < n) throw new Error('pictures: ' + id + ' cannot fit ' + n + ' spots');
      for (var i = cells.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = cells[i]; cells[i] = cells[j]; cells[j] = t; }
      var pick = cells.slice(0, n).sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
      var f = fig(), parts = [f.part], deco = f.deco.slice();
      pick.forEach(function (c, k) {
        var m = r * ext + 7, x = c[0] + m + rnd() * Math.max(0, c[2] - 2 * m), y = c[1] + m + rnd() * Math.max(0, c[3] - 2 * m);
        var sid = 'spot' + k, g = spotName === 'starfish' ? starR(x, y + r * 0.06, r * 1.12, r * 0.56, r * 0.2, r * 0.1) : E(x, y, r);
        var p = makePart(sid, [g], { safe: [x, y], role: 'spot', nameKind: 'spot', nameValue: spotName, def: def });
        if (spotName === 'starfish') p.hit = { type: 'ellipse', cx: f1(x), cy: f1(y), rx: f1(r), ry: f1(r) };
        parts.push(p);
        if (spotName !== 'starfish') deco = deco.concat(decoOut([shine(x, y, r)]).map(function (q) { q.part = sid; return q; }));
        else deco = deco.concat(decoOut([{ sh: E(x, y + 2, r * 0.18), fill: 'rgba(51,64,94,0.25)' }]).map(function (q) { q.part = sid; return q; }));
      });
      return { parts: parts, deco: deco, under: f.under || [] };
    } });
  }
  function designFig(name, id, box, extra) {
    return function () {
      var d = D[name](), X = fitX(d, (box[0] + box[2]) / 2, (box[1] + box[3]) / 2, box[2] - box[0], box[3] - box[1], box[4]);
      var f = figure(d, id, X, { nameKind: 'thing', nameValue: name });
      if (extra) f.under = extra;
      return f;
    };
  }
  countTpl('whale_bubbles', 'swim', 'bubble', designFig('whale', 'whale', [60, 214, 540, 394]), [[24, 8, 552, 200]], '#DDF1F8');
  countTpl('fish_pearls', 'swim', 'pearl', designFig('fish', 'fish', [16, 70, 330, 330]), [[344, 10, 248, 382]], '#F4ECF6');
  countTpl('octopus_bubbles', 'bob', 'bubble', designFig('octopus', 'octopus', [192, 140, 408, 394]),
    [[10, 10, 176, 384], [414, 10, 176, 384], [192, 6, 216, 128]], '#DDF1F8');
  countTpl('chest_pearls', 'float', 'pearl', designFig('chest', 'chest', [150, 222, 450, 392]),
    [[24, 8, 552, 200], [10, 214, 134, 180], [456, 214, 134, 180]], '#F4ECF6');
  countTpl('rock_starfish', 'bob', 'starfish', designFig('rock', 'rock', [204, 24, 396, 214], decoOut([{ sh: R([[0, 300], [600, 300], [600, 400], [0, 400]], 0), fill: '#F6EBD3' }])),
    [[14, 252, 572, 144], [10, 10, 188, 236], [402, 10, 188, 236]], '#F9DDB8');

  // ---- scene: up to 4 sea animals on a backdrop. slots[n] = [[cx, cy, fitW, fitH, facing]…]
  function sceneTpl(id, under, slots) {
    tpl({ id: id, kind: 'scene', alive: 'swim', maxSlots: 4, slots: slots, make: function (opt) {
      var an = (opt && opt.animals) || SEA_ANIMALS.slice(0, 2), sizes = opt && opt.sizes, set = slots[an.length];
      if (!set) throw new Error('pictures: ' + id + ' has no layout for ' + an.length + ' animals');
      if (sizes && sizes.length !== an.length) throw new Error('pictures: sizes must match animals');
      var parts = [], deco = [];
      an.forEach(function (a, i) {
        if (!D[a] || SEA_ANIMALS.indexOf(a) < 0) throw new Error('pictures: unknown animal ' + a);
        var s = set[i], k = sizes ? (sizes[i] === 'big' ? 1.18 : 0.73) : 1, d = D[a]();
        var X = fitX(d, s[0], s[1], s[2] * k, s[3] * k, s[4]);
        var f = figure(d, 'a' + i, X, { role: 'animal', nameKind: 'animal', nameValue: a, size: sizes ? sizes[i] : null });
        parts.push(f.part); deco = deco.concat(f.deco);
      });
      return { parts: parts, deco: deco, under: decoOut(under) };
    } });
  }
  var SAND = '#F4E7CB', WEED = '#DDEBDD', ROCKC = '#E7E2EA', CORAL = '#F4DDD6';
  function sandBand(y) { var top = wave(y, 6, 0, 600, 8), r = top.map(function () { return 30; }); r[0] = r[top.length - 1] = 0; return { sh: R(top.concat([[600, 400], [0, 400]]), r.concat([0, 0])), fill: SAND }; }
  function kelp(x, h, s) { return { sh: ribbon([[x, 400], [x + 14 * s, 400 - h * 0.35], [x - 10 * s, 400 - h * 0.7], [x + 6 * s, 400 - h]], 26, 14), fill: WEED }; }
  sceneTpl('reef', [sandBand(352), { sh: S([[0, 360], [18, 300], [60, 280], [96, 330], [90, 370]]), fill: CORAL },
    { sh: S([[600, 360], [582, 296], [544, 286], [508, 330], [516, 370]]), fill: CORAL }, kelp(300, 70, 1)], {
    1: [[300, 200, 420, 300, 1]], 2: [[166, 200, 240, 220, 1], [440, 206, 240, 220, -1]],
    3: [[106, 250, 180, 150, 1], [300, 130, 180, 150, 1], [494, 250, 180, 150, -1]],
    4: [[150, 112, 210, 150, 1], [450, 104, 210, 150, -1], [166, 296, 210, 150, 1], [434, 300, 210, 150, -1]] });
  sceneTpl('kelp', [sandBand(360), kelp(16, 300, 1), kelp(46, 200, -1), kelp(584, 280, -1), kelp(554, 190, 1)], {
    1: [[300, 196, 400, 300, -1]], 2: [[180, 150, 230, 210, 1], [420, 262, 230, 210, -1]],
    3: [[170, 112, 180, 150, 1], [430, 150, 180, 150, -1], [300, 300, 180, 150, 1]],
    4: [[180, 104, 200, 150, 1], [420, 112, 200, 150, -1], [180, 292, 200, 150, -1], [420, 298, 200, 150, 1]] });
  sceneTpl('rocks', [sandBand(344), { sh: S([[200, 400], [214, 352], [270, 334], [330, 340], [380, 372], [390, 400]]), fill: ROCKC },
    { sh: S([[0, 220], [30, 210], [44, 260], [40, 330], [0, 340]]), fill: ROCKC }, { sh: S([[600, 200], [572, 196], [556, 250], [566, 320], [600, 330]]), fill: ROCKC }], {
    1: [[300, 190, 420, 300, 1]], 2: [[174, 230, 240, 220, 1], [430, 168, 240, 220, -1]],
    3: [[116, 140, 180, 150, 1], [300, 268, 180, 150, 1], [486, 140, 180, 150, -1]],
    4: [[148, 110, 210, 150, 1], [452, 116, 210, 150, -1], [170, 290, 210, 150, 1], [430, 288, 210, 150, -1]] });

  // ---- labels: big bubbles / balloons with text. pos[n] = [[cx, cy, r]…]
  function labelsTpl(id, alive, fig, pos, def, trail) {
    tpl({ id: id, kind: 'labels', alive: alive, make: function (opt) {
      var labels = (opt && opt.labels) || ['A', 'B', 'C'], set = pos[labels.length], kind = (opt && opt.kind) || 'letter';
      if (!set) throw new Error('pictures: ' + id + ' has no layout for ' + labels.length + ' labels');
      var f = fig(), parts = [f.part], deco = f.deco.slice();
      labels.forEach(function (t, i) {
        var s = set[i], v = kind === 'number' && /^-?\d+$/.test(String(t)) ? Number(t) : String(t);
        parts.push(makePart('l' + i, [E(s[0], s[1], s[2])], { safe: [s[0], s[1]], role: 'label', nameKind: kind, nameValue: v, def: def, text: t }));
        deco = deco.concat(decoOut([shine(s[0], s[1], s[2])]).map(function (q) { q.part = 'l' + i; return q; }));
        if (trail) deco = deco.concat(trail(s, i));
      });
      return { parts: parts, deco: deco, under: f.under || [] };
    } });
  }
  labelsTpl('fish_bubbles', 'swim', designFig('fish', 'fish', [14, 232, 250, 394]), {
    2: [[220, 110, 66], [420, 130, 66]], 3: [[160, 104, 62], [330, 94, 62], [470, 226, 62]],
    4: [[110, 100, 58], [250, 88, 58], [390, 100, 58], [440, 250, 58]],
    5: [[100, 92, 54], [238, 78, 54], [376, 92, 54], [500, 160, 54], [380, 262, 54]] }, '#E2F3F8',
    function () { return []; });
  labelsTpl('buoy_balloons', 'float', designFig('buoy', 'buoy', [226, 250, 374, 394]), {
    2: [[200, 120, 64], [400, 120, 64]], 3: [[160, 120, 62], [300, 86, 62], [440, 120, 62]],
    4: [[126, 132, 56], [252, 86, 56], [382, 86, 56], [500, 140, 56]],
    5: [[92, 200, 54], [172, 84, 54], [300, 70, 54], [428, 84, 54], [508, 200, 54]] }, '#FBE4CC',
    function (s) { return decoOut([{ sh: L([[s[0], s[1] + s[2]], [(s[0] + 300) / 2 + (s[0] < 300 ? 10 : -10), (s[1] + s[2] + 258) / 2], [300, 254]], true), stroke: NAVY, width: 3 },
      { sh: R([[s[0] - 8, s[1] + s[2] + 10], [s[0] + 8, s[1] + s[2] + 10], [s[0], s[1] + s[2] - 2]], 3), fill: NAVY }]); });
  labelsTpl('whale_spout', 'swim', designFig('whale', 'whale', [80, 262, 520, 396]), {
    2: [[210, 120, 66], [390, 120, 66]], 3: [[150, 116, 62], [300, 90, 62], [450, 116, 62]],
    4: [[90, 120, 56], [230, 88, 56], [370, 88, 56], [510, 120, 56]],
    5: [[80, 110, 54], [205, 70, 54], [330, 70, 54], [455, 110, 54], [300, 196, 54]] }, '#E2F3F8');

  // ================================================================ build / validate
  function build(id, opt) {
    var t = TEMPLATES[id];
    if (!t) throw new Error('pictures: unknown template ' + id);
    var o = t.make(opt || {});
    var parts = o.parts.slice().sort(function (a, b) { return b.area - a.area; });
    var pic = { id: id, kind: t.kind, alive: t.alive, w: W, h: H, parts: parts, deco: o.deco || [], under: o.under || [] };
    if (t.spotName) pic.spotName = t.spotName;
    if (o.onBody) pic.onBody = true;
    return pic;
  }
  function list(kind) { return kind ? (ORDER[kind] || []).slice() : Object.keys(TEMPLATES); }

  function polysOverlap(A, B) {
    for (var i = 0; i < A.length; i++) for (var j = 0; j < B.length; j++) {
      var a = A[i], b = B[j], ba = bboxOf([a]), bb = bboxOf([b]);
      if (ba[2] < bb[0] || bb[2] < ba[0] || ba[3] < bb[1] || bb[3] < ba[1]) continue;
      for (var k = 0; k < a.length; k++) if (inPoly(b, a[k][0], a[k][1])) return true;
      for (k = 0; k < b.length; k++) if (inPoly(a, b[k][0], b[k][1])) return true;
    }
    return false;
  }
  function thickness(poly) {   // narrowest projection width over 18 directions
    var best = Infinity;
    for (var i = 0; i < 18; i++) {
      var a = i * Math.PI / 18, c = Math.cos(a), s = Math.sin(a), lo = Infinity, hi = -Infinity;
      poly.forEach(function (q) { var v = q[0] * c + q[1] * s; if (v < lo) lo = v; if (v > hi) hi = v; });
      best = Math.min(best, hi - lo);
    }
    return best;
  }
  function validate(pic) {
    if (!pic || !Array.isArray(pic.parts) || !pic.parts.length) return 'no parts';
    if (pic.w !== W || pic.h !== H) return 'box must be 600x400';
    if (pic.parts.length > MAX_PARTS) return 'too many parts';
    var ids = {}, i, j, p;
    for (i = 0; i < pic.parts.length; i++) {
      p = pic.parts[i];
      if (ids[p.id]) return 'duplicate part ' + p.id;
      ids[p.id] = 1;
      if (typeof p.d !== 'string' || p.d.length < 8) return p.id + ': no path';
      if (!/^#[0-9A-Fa-f]{6}$/.test(p.def || '')) return p.id + ': bad def';
      if (p.nameKind == null || p.nameValue == null || !p.role) return p.id + ': missing role/name';
      if (pic.kind === 'parts' && PART_NAMES.indexOf(p.nameValue) < 0) return p.id + ': name not in PART_NAMES';
      var polys = hitPolys(p.hit), b = bboxOf(polys);
      if (b[0] < 3 || b[1] < 3 || b[2] > W - 3 || b[3] > H - 3) return p.id + ': outside the box ' + b.join(',');
      var w = b[2] - b[0], h = b[3] - b[1];
      var min = p.role === 'shape' ? MIN_SHAPE : p.role === 'spot' ? MIN_SPOT : p.role === 'label' ? MIN_LABEL : MIN_PART;
      if (w < min || h < min) return p.id + ': too small ' + f1(w) + 'x' + f1(h);
      if (pic.kind === 'parts') for (j = 0; j < polys.length; j++) if (thickness(polys[j]) < MIN_PIECE) return p.id + ': piece too thin ' + f1(thickness(polys[j]));
      if (hit(pic, p.cx, p.cy, 0) !== p.id) return p.id + ': safe point hits ' + hit(pic, p.cx, p.cy, 0);
      var deep = 0;
      polys.forEach(function (q) { if (inPoly(q, p.cx, p.cy)) deep = Math.max(deep, polyDist(q, p.cx, p.cy)); });
      if (deep < SAFE_MARGIN) return p.id + ': safe point too close to the edge (' + f1(deep) + ')';
    }
    var targets = pic.parts.filter(function (q) { return q.role === 'shape' || q.role === 'spot' || q.role === 'label' || q.role === 'animal'; });
    for (i = 0; i < targets.length; i++) for (j = i + 1; j < targets.length; j++)
      if (polysOverlap(hitPolys(targets[i].hit), hitPolys(targets[j].hit))) return targets[i].id + ' overlaps ' + targets[j].id;
    if (pic.onBody) {
      var body = pic.parts.filter(function (q) { return q.role === 'part'; })[0];
      if (body) for (i = 0; i < targets.length; i++) {
        var pts = hitPolys(targets[i].hit)[0];
        for (j = 0; j < pts.length; j++) if (!hitTest(body.hit, pts[j][0], pts[j][1], 0)) return targets[i].id + ' sticks out of the body';
      }
    }
    return null;
  }

  function animalIcon(animal) {   // one animal centred on (0, 0) fitting 200 × 160 (Talk time / previews)
    var d = D[animal] && SEA_ANIMALS.indexOf(animal) >= 0 ? D[animal]() : D.fish();
    var f = figure(d, 'a', fitX(d, 0, 0, 200, 160, 1), { role: 'animal', nameKind: 'animal', nameValue: animal });
    return { id: 'icon_' + animal, kind: 'icon', parts: [f.part], deco: f.deco, under: [] };
  }

  SP.SHAPES = SHAPES;
  SP.SEA_ANIMALS = SEA_ANIMALS;
  SP.PART_NAMES = PART_NAMES;
  SP.Pictures = { TEMPLATES: TEMPLATES, list: list, build: build, hit: hit, validate: validate, shapeD: shapeD, animalIcon: animalIcon,
    hitTest: hitTest, rngOf: rngOf, PART_NAMES: PART_NAMES, MIN_PART: MIN_PART, NAVY: NAVY };
})(typeof window !== 'undefined' ? (window.SP = window.SP || {}) : (global.SP = global.SP || {}));
