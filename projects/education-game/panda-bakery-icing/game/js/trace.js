/* Mochi's Icing Bakery — IB.Trace: dotted trace paths + the forward-only finger tracker (pure, node-safe; DESIGN §5.1)
 *
 * All coordinates are TRAY PICTURE px (600 × 400 authoring box, y down). Angles in radians, + = clockwise on screen.
 *
 *   IB.Trace.path(spec) → path
 *     spec {kind:'stroke', id:'line'|'wave'|'zigzag'|'arc'|'loop'|'swirl', cx?, cy?, w?, h?}   (default box 300,200 · 260×120)
 *          {kind:'shape', shape, cx, cy, size}        outline = ONE closed stroke, starts at the top, clockwise
 *          {kind:'glyph', text:'0'..'20'|'A'..'Z'|'a'..'z', cx, cy, h, maxW?}  kindergarten stroke order; two-digit numbers
 *                                                      are two glyphs side by side (same scale)
 *          {kind:'road', from:{x,y}, to:{x,y}, bumps}  a gently curving road (animal → home)
 *     path = { spec, kind, strokes: [{ pts: [[x,y]…] (resampled every STEP = 4 px; last point exact), len, closed }],
 *              len (total), box {x0, y0, x1, y1} }
 *   IB.Trace.start(path) → state {stroke, done, total, off, complete, fx, fy}
 *   IB.Trace.track(path, state, x, y, tol, look) → state (mutated)
 *       ANCHOR (QA BUG-1): a press counts only once it has touched the icing head — the stroke's first point, or the end of
 *       the icing after a lift / a finished stroke — within tol·1.2 (state.anchor). Until then nothing advances (a tap or a
 *       slide that lands mid-path or at the far end does nothing); the touching sample itself does not ice. Anchored, it
 *       projects the finger onto the CURRENT stroke inside the arc window [done, done + look] and advances `done` when the
 *       distance ≤ tol AND the projection moved forward since the previous sample (a backwards drag never ices). Never
 *       goes back.
 *       CLOSED outlines (shape / size circle, one stroke) can be traced either way round: while nothing is iced yet, the
 *       finger is followed on both directions and the first one to reach 40 px wins (state.rev; the path's points are
 *       reversed in place, so the start stays where it was).
 *       A stroke completes at done ≥ len − 0.6·tol → the next stroke (done = 0) or complete. A long finger jump since the
 *       last call (state.fx/fy) is walked in ≤ 8 px sub-steps, so a fast swipe never skips the window. lift(state) clears it.
 *       state.off = the finger is farther than tol from the window now.
 *   IB.Trace.advance(path, state, d) → state     "magic icing": move `done` forward by d px (crosses strokes)
 *   IB.Trace.pointAt(path, stroke, s) → {x, y, ang}    (ang = direction of travel)
 *   IB.Trace.head(path, state) → {x, y, ang, stroke}   the current start / icing head
 *   IB.Trace.drawn(path, state) → [[ [x,y]… ] per stroke]   finished strokes whole, the current one up to `done`, later ones []
 *   IB.Trace.remaining(path, state) → [[ [x,y]… ] per stroke]  the part still to trace (current from `done`, later whole)
 *   IB.Trace.follow(path, opts?) → {complete, moves}   test helper: a finger that follows the points (optionally jittered)
 *   IB.Trace.SHAPE_UNIT(shape) → [[x,y]…] closed outline in a unit box (max side 1, centred at 0,0) — cookie_art may cut
 *       shape cookies with it so the icing outline matches the cookie edge.  IB.Trace.GLYPHS = the glyph keys.
 */
(function (IB) {
  'use strict';

  var STEP = 4, TAU = Math.PI * 2, D2R = Math.PI / 180;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }

  // ------------------------------------------------------------------ polyline builder from a tiny path language
  /* A stroke = list of commands (absolute coordinates in its own unit space):
   *   ['M', x, y]                         move (start)
   *   ['L', x, y]                         line
   *   ['A', cx, cy, rx, ry, a0, a1]       elliptic arc, degrees, 0 = +x, 90 = DOWN (y down); a1 > a0 = clockwise on screen.
   *                                        A line joins the current point to the arc start when they differ.
   *   ['Q', cx, cy, x, y] / ['C', c1x, c1y, c2x, c2y, x, y]   Béziers
   */
  function flatten(cmds, tf) {
    var out = [], cx = null, cy = null, i, k, n;
    function add(x, y) { var p = tf ? tf(x, y) : [x, y]; var q = out[out.length - 1]; if (!q || hyp(p[0] - q[0], p[1] - q[1]) > 1e-6) out.push(p); cx = x; cy = y; }
    for (i = 0; i < cmds.length; i++) {
      var c = cmds[i], t = c[0];
      if (t === 'M' || t === 'L') add(c[1], c[2]);
      else if (t === 'A') {
        var a0 = c[5] * D2R, a1 = c[6] * D2R, rx = c[3], ry = c[4];
        n = Math.max(8, Math.ceil(Math.abs(a1 - a0) * Math.max(rx, ry) * 400));
        for (k = 0; k <= n; k++) { var a = a0 + (a1 - a0) * k / n; add(c[1] + rx * Math.cos(a), c[2] + ry * Math.sin(a)); }
      } else if (t === 'Q') {
        var x0 = cx, y0 = cy; n = 64;
        for (k = 1; k <= n; k++) { var u = k / n, v = 1 - u; add(v * v * x0 + 2 * v * u * c[1] + u * u * c[3], v * v * y0 + 2 * v * u * c[2] + u * u * c[4]); }
      } else if (t === 'C') {
        var X0 = cx, Y0 = cy; n = 96;
        for (k = 1; k <= n; k++) {
          var w = k / n, z = 1 - w;
          add(z * z * z * X0 + 3 * z * z * w * c[1] + 3 * z * w * w * c[3] + w * w * w * c[5], z * z * z * Y0 + 3 * z * z * w * c[2] + 3 * z * w * w * c[4] + w * w * w * c[6]);
        }
      } else if (t === 'P') {   // raw point list (already absolute)
        for (k = 0; k < c[1].length; k++) add(c[1][k][0], c[1][k][1]);
      }
    }
    return out;
  }
  /** Uniform resampling every STEP px of arc length (the last point is the exact end). */
  function resample(dense, closed) {
    var pts = [], len = 0, i;
    if (!dense.length) return { pts: [[0, 0]], len: 0, closed: !!closed };
    pts.push([dense[0][0], dense[0][1]]);
    var acc = 0;   // arc length since the last emitted point
    for (i = 1; i < dense.length; i++) {
      var ax = dense[i - 1][0], ay = dense[i - 1][1], bx = dense[i][0], by = dense[i][1], seg = hyp(bx - ax, by - ay), pos = 0;
      while (acc + (seg - pos) >= STEP - 1e-9) {
        var need = STEP - acc; pos += need;
        var u = pos / seg;
        pts.push([ax + (bx - ax) * u, ay + (by - ay) * u]);
        acc = 0;
      }
      acc += seg - pos;
      len += seg;
    }
    var last = dense[dense.length - 1], q = pts[pts.length - 1];
    if (hyp(last[0] - q[0], last[1] - q[1]) > 1e-6) pts.push([last[0], last[1]]);
    return { pts: pts, len: len, closed: !!closed };
  }

  // ------------------------------------------------------------------ glyphs (unit height 1 = cap height; lowercase:
  // ascender 0, x-height 0.42, baseline 1, descender 1.38). w = advance width. Stroke order as taught in kindergarten
  // (start at the top, down strokes first, circles counter-clockwise from the top / upper right).
  var G = {
    // digits
    '0': { w: 0.62, s: [[['A', 0.31, 0.5, 0.3, 0.5, -90, -450]]] },
    '1': { w: 0.4, s: [[['M', 0.2, 0], ['L', 0.2, 1]]] },
    '2': { w: 0.64, s: [[['A', 0.31, 0.29, 0.28, 0.27, -165, 25], ['L', 0.03, 1], ['L', 0.63, 1]]] },
    '3': { w: 0.62, s: [[['A', 0.29, 0.25, 0.26, 0.23, -150, 90], ['A', 0.29, 0.74, 0.29, 0.26, -90, 150]]] },
    '4': { w: 0.66, s: [[['M', 0.08, 0], ['L', 0.06, 0.62], ['L', 0.64, 0.62]], [['M', 0.48, 0], ['L', 0.48, 1]]] },
    '5': { w: 0.62, s: [[['M', 0.1, 0], ['L', 0.08, 0.46], ['A', 0.31, 0.69, 0.29, 0.3, -134, 150]], [['M', 0.1, 0], ['L', 0.58, 0]]] },
    '6': { w: 0.62, s: [[['M', 0.52, 0.02], ['C', 0.22, 0.06, 0.03, 0.36, 0.03, 0.69], ['A', 0.31, 0.69, 0.28, 0.3, 180, -175]]] },
    '7': { w: 0.62, s: [[['M', 0.02, 0], ['L', 0.62, 0], ['L', 0.2, 1]]] },
    '8': { w: 0.62, s: [[['M', 0.53, 0.14], ['C', 0.42, -0.04, 0.06, -0.01, 0.07, 0.22], ['C', 0.08, 0.42, 0.6, 0.48, 0.6, 0.74],
      ['C', 0.6, 1.03, 0.02, 1.03, 0.02, 0.74], ['C', 0.02, 0.48, 0.54, 0.42, 0.55, 0.22], ['C', 0.56, 0.08, 0.44, 0.0, 0.3, 0.0]]] },
    '9': { w: 0.62, s: [[['A', 0.3, 0.28, 0.28, 0.28, 0, -360], ['L', 0.58, 1]]] },
    // capitals
    A: { w: 0.8, s: [[['M', 0.4, 0], ['L', 0.02, 1]], [['M', 0.4, 0], ['L', 0.78, 1]], [['M', 0.17, 0.62], ['L', 0.63, 0.62]]] },
    B: { w: 0.66, s: [[['M', 0.05, 0], ['L', 0.05, 1]], [['M', 0.05, 0], ['L', 0.33, 0], ['C', 0.64, 0, 0.64, 0.48, 0.33, 0.48], ['C', 0.72, 0.48, 0.72, 1, 0.36, 1], ['L', 0.05, 1]]] },
    C: { w: 0.8, s: [[['A', 0.44, 0.5, 0.42, 0.5, -40, -320]]] },
    D: { w: 0.74, s: [[['M', 0.05, 0], ['L', 0.05, 1]], [['M', 0.05, 0], ['L', 0.28, 0], ['C', 0.8, 0, 0.8, 1, 0.28, 1], ['L', 0.05, 1]]] },
    E: { w: 0.62, s: [[['M', 0.05, 0], ['L', 0.05, 1]], [['M', 0.05, 0], ['L', 0.6, 0]], [['M', 0.05, 0.5], ['L', 0.5, 0.5]], [['M', 0.05, 1], ['L', 0.6, 1]]] },
    F: { w: 0.6, s: [[['M', 0.05, 0], ['L', 0.05, 1]], [['M', 0.05, 0], ['L', 0.58, 0]], [['M', 0.05, 0.5], ['L', 0.48, 0.5]]] },
    G: { w: 0.82, s: [[['A', 0.44, 0.5, 0.42, 0.5, -40, -355], ['L', 0.5, 0.54]]] },
    H: { w: 0.7, s: [[['M', 0.05, 0], ['L', 0.05, 1]], [['M', 0.65, 0], ['L', 0.65, 1]], [['M', 0.05, 0.5], ['L', 0.65, 0.5]]] },
    I: { w: 0.56, s: [[['M', 0.28, 0], ['L', 0.28, 1]], [['M', 0.02, 0], ['L', 0.54, 0]], [['M', 0.02, 1], ['L', 0.54, 1]]] },
    J: { w: 0.66, s: [[['M', 0.52, 0], ['L', 0.52, 0.7], ['A', 0.28, 0.7, 0.24, 0.29, 0, 175]], [['M', 0.26, 0], ['L', 0.78, 0]]] },
    K: { w: 0.66, s: [[['M', 0.05, 0], ['L', 0.05, 1]], [['M', 0.62, 0], ['L', 0.07, 0.56]], [['M', 0.24, 0.4], ['L', 0.66, 1]]] },
    L: { w: 0.58, s: [[['M', 0.05, 0], ['L', 0.05, 1], ['L', 0.58, 1]]] },
    M: { w: 0.86, s: [[['M', 0.05, 0], ['L', 0.05, 1]], [['M', 0.05, 0], ['L', 0.43, 0.72], ['L', 0.81, 0], ['L', 0.81, 1]]] },
    N: { w: 0.72, s: [[['M', 0.05, 0], ['L', 0.05, 1]], [['M', 0.05, 0], ['L', 0.67, 1], ['L', 0.67, 0]]] },
    O: { w: 0.88, s: [[['A', 0.44, 0.5, 0.42, 0.5, -90, -450]]] },
    P: { w: 0.64, s: [[['M', 0.05, 0], ['L', 0.05, 1]], [['M', 0.05, 0], ['L', 0.33, 0], ['C', 0.7, 0, 0.7, 0.54, 0.33, 0.54], ['L', 0.05, 0.54]]] },
    Q: { w: 0.9, s: [[['A', 0.44, 0.5, 0.42, 0.5, -90, -450]], [['M', 0.5, 0.66], ['L', 0.88, 1.02]]] },
    R: { w: 0.68, s: [[['M', 0.05, 0], ['L', 0.05, 1]], [['M', 0.05, 0], ['L', 0.33, 0], ['C', 0.7, 0, 0.7, 0.54, 0.33, 0.54], ['L', 0.05, 0.54]], [['M', 0.3, 0.54], ['L', 0.68, 1]]] },
    S: { w: 0.7, s: [[['M', 0.64, 0.14], ['C', 0.52, -0.05, 0.06, -0.03, 0.08, 0.24], ['C', 0.1, 0.46, 0.66, 0.44, 0.67, 0.73], ['C', 0.69, 1.03, 0.14, 1.06, 0.02, 0.84]]] },
    T: { w: 0.72, s: [[['M', 0.36, 0], ['L', 0.36, 1]], [['M', 0.02, 0], ['L', 0.7, 0]]] },
    U: { w: 0.72, s: [[['M', 0.05, 0], ['L', 0.05, 0.64], ['A', 0.36, 0.64, 0.31, 0.36, 180, 0], ['L', 0.67, 0]]] },
    V: { w: 0.76, s: [[['M', 0.02, 0], ['L', 0.38, 1], ['L', 0.74, 0]]] },
    W: { w: 0.96, s: [[['M', 0.02, 0], ['L', 0.24, 1], ['L', 0.48, 0.32], ['L', 0.72, 1], ['L', 0.94, 0]]] },
    X: { w: 0.72, s: [[['M', 0.02, 0], ['L', 0.7, 1]], [['M', 0.7, 0], ['L', 0.02, 1]]] },
    Y: { w: 0.74, s: [[['M', 0.02, 0], ['L', 0.37, 0.5]], [['M', 0.72, 0], ['L', 0.37, 0.5], ['L', 0.37, 1]]] },
    Z: { w: 0.7, s: [[['M', 0.04, 0], ['L', 0.68, 0], ['L', 0.02, 1], ['L', 0.68, 1]]] },
    // small letters
    a: { w: 0.64, s: [[['A', 0.3, 0.71, 0.28, 0.29, -30, -390], ['L', 0.58, 0.42], ['L', 0.58, 1]]] },
    b: { w: 0.62, s: [[['M', 0.05, 0], ['L', 0.05, 1], ['L', 0.05, 0.71], ['A', 0.32, 0.71, 0.27, 0.29, 180, 540]]] },
    c: { w: 0.6, s: [[['A', 0.32, 0.71, 0.3, 0.29, -35, -325]]] },
    d: { w: 0.64, s: [[['A', 0.3, 0.71, 0.28, 0.29, -30, -390], ['L', 0.58, 0], ['L', 0.58, 1]]] },
    e: { w: 0.62, s: [[['M', 0.04, 0.71], ['L', 0.6, 0.71], ['A', 0.32, 0.71, 0.28, 0.29, 0, -320]]] },
    f: { w: 0.52, s: [[['M', 0.52, 0.08], ['C', 0.44, -0.02, 0.24, -0.01, 0.24, 0.2], ['L', 0.24, 1]], [['M', 0.02, 0.42], ['L', 0.48, 0.42]]] },
    g: { w: 0.64, s: [[['A', 0.3, 0.71, 0.28, 0.29, -30, -390], ['L', 0.58, 0.42], ['L', 0.58, 1.16], ['A', 0.33, 1.16, 0.25, 0.22, 0, 160]]] },
    h: { w: 0.62, s: [[['M', 0.05, 0], ['L', 0.05, 1], ['L', 0.05, 0.62], ['C', 0.12, 0.38, 0.55, 0.36, 0.56, 0.62], ['L', 0.56, 1]]] },
    i: { w: 0.3, s: [[['M', 0.12, 0.42], ['L', 0.12, 1]], [['A', 0.12, 0.17, 0.065, 0.065, -90, 270]]] },
    j: { w: 0.5, s: [[['M', 0.4, 0.42], ['L', 0.4, 1.16], ['A', 0.18, 1.16, 0.22, 0.22, 0, 170]], [['A', 0.4, 0.17, 0.065, 0.065, -90, 270]]] },
    k: { w: 0.6, s: [[['M', 0.05, 0], ['L', 0.05, 1]], [['M', 0.52, 0.42], ['L', 0.07, 0.76]], [['M', 0.2, 0.66], ['L', 0.56, 1]]] },
    l: { w: 0.24, s: [[['M', 0.1, 0], ['L', 0.1, 1]]] },
    m: { w: 0.84, s: [[['M', 0.05, 0.42], ['L', 0.05, 1], ['L', 0.05, 0.62], ['C', 0.08, 0.38, 0.38, 0.36, 0.41, 0.62], ['L', 0.41, 1], ['L', 0.41, 0.62],
      ['C', 0.44, 0.38, 0.75, 0.36, 0.78, 0.62], ['L', 0.78, 1]]] },
    n: { w: 0.62, s: [[['M', 0.05, 0.42], ['L', 0.05, 1], ['L', 0.05, 0.62], ['C', 0.1, 0.38, 0.52, 0.36, 0.54, 0.62], ['L', 0.54, 1]]] },
    o: { w: 0.62, s: [[['A', 0.31, 0.71, 0.29, 0.29, -90, -450]]] },
    p: { w: 0.62, s: [[['M', 0.05, 0.42], ['L', 0.05, 1.38], ['L', 0.05, 0.71], ['A', 0.32, 0.71, 0.27, 0.29, 180, 540]]] },
    q: { w: 0.64, s: [[['A', 0.3, 0.71, 0.28, 0.29, -30, -390], ['L', 0.58, 0.42], ['L', 0.58, 1.38]]] },
    r: { w: 0.54, s: [[['M', 0.05, 0.42], ['L', 0.05, 1], ['L', 0.05, 0.66], ['C', 0.12, 0.4, 0.38, 0.36, 0.52, 0.46]]] },
    s: { w: 0.56, s: [[['M', 0.5, 0.5], ['C', 0.4, 0.38, 0.06, 0.4, 0.08, 0.56], ['C', 0.1, 0.7, 0.52, 0.68, 0.54, 0.84], ['C', 0.56, 1.02, 0.12, 1.04, 0.02, 0.92]]] },
    t: { w: 0.52, s: [[['M', 0.24, 0.08], ['L', 0.24, 1]], [['M', 0.02, 0.42], ['L', 0.48, 0.42]]] },
    u: { w: 0.62, s: [[['M', 0.05, 0.42], ['L', 0.05, 0.78], ['C', 0.06, 1.02, 0.5, 1.04, 0.54, 0.78], ['L', 0.54, 0.42], ['L', 0.54, 1]]] },
    v: { w: 0.62, s: [[['M', 0.01, 0.42], ['L', 0.31, 1], ['L', 0.61, 0.42]]] },
    w: { w: 0.84, s: [[['M', 0.01, 0.42], ['L', 0.21, 1], ['L', 0.42, 0.55], ['L', 0.63, 1], ['L', 0.83, 0.42]]] },
    x: { w: 0.58, s: [[['M', 0.02, 0.42], ['L', 0.56, 1]], [['M', 0.56, 0.42], ['L', 0.02, 1]]] },
    y: { w: 0.62, s: [[['M', 0.01, 0.42], ['L', 0.31, 0.96]], [['M', 0.61, 0.42], ['L', 0.13, 1.38]]] },
    z: { w: 0.58, s: [[['M', 0.02, 0.42], ['L', 0.56, 0.42], ['L', 0.02, 1], ['L', 0.56, 1]]] }
  };
  var GLYPHS = Object.keys(G);

  function glyphStrokes(text, cx, cy, h, maxW) {
    var chars = String(text).split(''), i, j, k;
    for (i = 0; i < chars.length; i++) if (!G[chars[i]]) throw new Error('IB.Trace: no glyph ' + chars[i]);
    var gap = 0.16;
    // unit layout: x advance, bbox over all strokes (dense) for the vertical fit
    var adv = [], x = 0, bb = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 }, dense = [];
    for (i = 0; i < chars.length; i++) {
      var g = G[chars[i]], ox = x;
      adv.push(ox);
      for (j = 0; j < g.s.length; j++) {
        var d = flatten(g.s[j], (function (o) { return function (px, py) { return [px + o, py]; }; })(ox));
        dense.push(d);
        for (k = 0; k < d.length; k++) { bb.x0 = Math.min(bb.x0, d[k][0]); bb.x1 = Math.max(bb.x1, d[k][0]); bb.y0 = Math.min(bb.y0, d[k][1]); bb.y1 = Math.max(bb.y1, d[k][1]); }
      }
      x += g.w + gap;
    }
    var cellW = x - gap, bh = Math.max(0.2, bb.y1 - bb.y0), sc = h / bh;
    var wNow = Math.max(cellW, bb.x1 - bb.x0) * sc;
    if (maxW && wNow > maxW) sc *= maxW / wNow;
    // centre: horizontally the cells (a lone '1' is centred on its stem by its bbox), vertically the bbox
    var mx = chars.length === 1 ? (bb.x0 + bb.x1) / 2 : cellW / 2, my = (bb.y0 + bb.y1) / 2;
    return dense.map(function (d) { return d.map(function (p) { return [cx + (p[0] - mx) * sc, cy + (p[1] - my) * sc]; }); });
  }

  // ------------------------------------------------------------------ shape outlines (unit, max side 1, centred)
  function roundedPoly(vs, r) {
    // vs clockwise; returns a dense closed outline with arcs of radius r at every vertex (r clamped to ⅓ of the edges)
    var n = vs.length, out = [], i;
    for (i = 0; i < n; i++) {
      var p = vs[(i + n - 1) % n], c = vs[i], q = vs[(i + 1) % n];
      var ax = p[0] - c[0], ay = p[1] - c[1], bx = q[0] - c[0], by = q[1] - c[1], la = hyp(ax, ay), lb = hyp(bx, by);
      ax /= la; ay /= la; bx /= lb; by /= lb;
      var ang = Math.acos(clamp(ax * bx + ay * by, -1, 1)), t = Math.min(r / Math.tan(ang / 2), la / 3, lb / 3), rr = t * Math.tan(ang / 2);
      var s0 = [c[0] + ax * t, c[1] + ay * t], s1 = [c[0] + bx * t, c[1] + by * t];
      // arc centre along the bisector
      var mxv = ax + bx, myv = ay + by, ml = hyp(mxv, myv) || 1, dc = rr / Math.sin(ang / 2);
      var ccx = c[0] + mxv / ml * dc, ccy = c[1] + myv / ml * dc;
      var a0 = Math.atan2(s0[1] - ccy, s0[0] - ccx), a1 = Math.atan2(s1[1] - ccy, s1[0] - ccx);
      var da = a1 - a0; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
      var m = Math.max(2, Math.ceil(Math.abs(da) * 16));
      for (var k = 0; k <= m; k++) { var a = a0 + da * k / m; out.push([ccx + rr * Math.cos(a), ccy + rr * Math.sin(a)]); }
    }
    return out;
  }
  function normUnit(pts) {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    pts.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    var s = 1 / Math.max(x1 - x0, y1 - y0), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    return pts.map(function (p) { return [(p[0] - mx) * s, (p[1] - my) * s]; });
  }
  /** Rotate a closed (clockwise) outline so it starts at its top-most point (ties: nearest x = 0) and close it. */
  function startTop(pts0) {
    var pts = [], best = 0, i, k;
    for (i = 0; i < pts0.length; i++) {   // densify (≤ 0.01) so a straight top edge has a middle point
      var a = pts0[i], b = pts0[(i + 1) % pts0.length], n = Math.max(1, Math.ceil(hyp(b[0] - a[0], b[1] - a[1]) / 0.01));
      for (k = 0; k < n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    }
    for (i = 1; i < pts.length; i++) {
      var p = pts[i], b = pts[best];
      if (p[1] < b[1] - 1e-3 || (Math.abs(p[1] - b[1]) <= 1e-3 && Math.abs(p[0]) < Math.abs(b[0]))) best = i;
    }
    var out = pts.slice(best).concat(pts.slice(0, best));
    out.push([out[0][0], out[0][1]]);
    return out;
  }
  var SHAPE_CACHE = {};
  function shapeUnit(shape) {
    if (SHAPE_CACHE[shape]) return SHAPE_CACHE[shape];
    var pts = [], i, n;
    switch (shape) {
      case 'circle': n = 160; for (i = 0; i < n; i++) { var a = -Math.PI / 2 + TAU * i / n; pts.push([0.5 * Math.cos(a), 0.5 * Math.sin(a)]); } break;
      case 'oval': n = 160; for (i = 0; i < n; i++) { var b = -Math.PI / 2 + TAU * i / n; pts.push([0.5 * Math.cos(b), 0.34 * Math.sin(b)]); } break;
      case 'square': pts = roundedPoly([[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]], 0.09); break;
      case 'rect': pts = roundedPoly([[-0.5, -0.31], [0.5, -0.31], [0.5, 0.31], [-0.5, 0.31]], 0.08); break;
      case 'triangle': pts = roundedPoly([[0, -0.47], [0.5, 0.4], [-0.5, 0.4]], 0.07); break;
      case 'diamond': pts = roundedPoly([[0, -0.5], [0.37, 0], [0, 0.5], [-0.37, 0]], 0.05); break;
      case 'star': {
        var vs = [];
        for (i = 0; i < 10; i++) { var c = -Math.PI / 2 + i * Math.PI / 5, R = i % 2 ? 0.215 : 0.5; vs.push([R * Math.cos(c), R * Math.sin(c)]); }
        pts = roundedPoly(vs, 0.035); break;
      }
      case 'heart': n = 200; for (i = 0; i < n; i++) {
        var t = TAU * i / n, s = Math.sin(t);
        pts.push([16 * s * s * s, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]);
      } break;
      default: throw new Error('IB.Trace: unknown shape ' + shape);
    }
    pts = normUnit(pts);
    // the heart's "top" is the dip between the lobes (t = 0) — start there, not on a lobe
    var out = shape === 'heart' ? pts.concat([[pts[0][0], pts[0][1]]]) : startTop(pts);
    SHAPE_CACHE[shape] = out;
    return out;
  }

  // ------------------------------------------------------------------ simple strokes (colours topic)
  function strokeDense(id, cx, cy, w, h) {
    var pts = [], i, n = 200, x0 = cx - w / 2, u;
    switch (id) {
      case 'line': return [[x0, cy], [cx + w / 2, cy]];
      case 'wave': for (i = 0; i <= n; i++) { u = i / n; pts.push([x0 + w * u, cy - (h / 2) * Math.sin(TAU * 1.5 * u)]); } return pts;
      case 'zigzag': for (i = 0; i <= 4; i++) pts.push([x0 + w * i / 4, cy + (i % 2 ? -h / 2 : h / 2)]); return pts;
      case 'arc': for (i = 0; i <= n; i++) { var a = Math.PI + Math.PI * i / n; pts.push([cx + (w / 2) * Math.cos(a), cy + h / 2 + h * Math.sin(a)]); } return pts;
      case 'loop': {
        var A = w / TAU, R = 2.2 * A;   // prolate trochoid with ONE loop in the middle
        for (i = 0; i <= n; i++) { var th = -Math.PI + TAU * i / n; pts.push([cx + A * th - R * Math.sin(th), cy - (h / 2) * Math.cos(th)]); }
        return pts;
      }
      case 'swirl': {   // a spiral from the middle outwards, clockwise, 2 turns
        var Rm = Math.min(w, 2 * h) / 2, r0 = 0.12 * Rm, turns = 2;
        for (i = 0; i <= 3 * n; i++) { u = i / (3 * n); var b = -Math.PI / 2 + TAU * turns * u, r = r0 + (Rm - r0) * u; pts.push([cx + r * Math.cos(b), cy + r * Math.sin(b)]); }
        return pts;
      }
      default: throw new Error('IB.Trace: unknown stroke ' + id);
    }
  }
  var STROKES = ['line', 'wave', 'zigzag', 'arc', 'loop', 'swirl'];

  function roadDense(from, to, bumps) {
    var pts = [], n = 120, b = Math.max(0, bumps | 0), dx = to.x - from.x, dy = to.y - from.y, L = hyp(dx, dy) || 1;
    var nx = dy / L, ny = -dx / L, A = Math.min(48, 0.2 * L);   // normal pointing "up" for a left → right road
    for (var i = 0; i <= n; i++) {
      var u = i / n, off = b ? A * Math.sin(Math.PI * b * u) * (b === 1 ? 1 : 0.8) : 0;
      pts.push([from.x + dx * u + nx * off, from.y + dy * u + ny * off]);
    }
    return pts;
  }

  // ------------------------------------------------------------------ path
  function bbox(strokes) {
    var b = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
    strokes.forEach(function (s) { s.pts.forEach(function (p) { b.x0 = Math.min(b.x0, p[0]); b.x1 = Math.max(b.x1, p[0]); b.y0 = Math.min(b.y0, p[1]); b.y1 = Math.max(b.y1, p[1]); }); });
    return b;
  }
  function path(spec) {
    if (!spec || !spec.kind) throw new Error('IB.Trace: bad spec');
    var dense = [], closed = [];
    switch (spec.kind) {
      case 'stroke': {
        var cx = spec.cx !== undefined ? spec.cx : 300, cy = spec.cy !== undefined ? spec.cy : 200;
        dense.push(strokeDense(spec.id, cx, cy, spec.w || 260, spec.h || 120)); closed.push(false); break;
      }
      case 'shape': {
        var S = spec.size || 300, ux = spec.cx !== undefined ? spec.cx : 300, uy = spec.cy !== undefined ? spec.cy : 200;
        dense.push(shapeUnit(spec.shape).map(function (p) { return [ux + p[0] * S, uy + p[1] * S]; })); closed.push(true); break;
      }
      case 'glyph': {
        var gs = glyphStrokes(spec.text, spec.cx !== undefined ? spec.cx : 300, spec.cy !== undefined ? spec.cy : 200, spec.h || 260, spec.maxW);
        gs.forEach(function (d) { dense.push(d); closed.push(false); });
        break;
      }
      case 'road': dense.push(roadDense(spec.from, spec.to, spec.bumps)); closed.push(false); break;
      default: throw new Error('IB.Trace: unknown kind ' + spec.kind);
    }
    var strokes = dense.map(function (d, i) { return resample(d, closed[i]); }), len = 0;
    strokes.forEach(function (s) { len += s.len; });
    return { spec: spec, kind: spec.kind, strokes: strokes, len: len, box: bbox(strokes) };
  }

  // ------------------------------------------------------------------ tracking
  function start() { return { stroke: 0, done: 0, total: 0, off: false, complete: false, fx: null, fy: null, dist: 0, anchor: false, lastS: -1, rev: false, dirSet: false, sF: 0, sR: 0 }; }
  function lift(state) { if (state) { state.fx = null; state.fy = null; state.anchor = false; state.lastS = -1; } return state; }
  var DIR_PX = 40;
  function reversedStroke(st) {
    var pts = st.pts.slice().reverse(), dense = pts;   // same closed loop, other way round, from the same start point
    return resample(dense, st.closed);
  }
  function pointAt(p, si, s) {
    var st = p.strokes[clamp(si | 0, 0, p.strokes.length - 1)], pts = st.pts, n = pts.length;
    if (n === 1) return { x: pts[0][0], y: pts[0][1], ang: 0 };
    s = clamp(s, 0, st.len);
    var i = Math.min(n - 2, Math.floor(s / STEP)), s0 = i * STEP, a = pts[i], b = pts[i + 1];
    var seg = i === n - 2 ? Math.max(1e-9, st.len - s0) : STEP, u = clamp((s - s0) / seg, 0, 1);
    return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  }
  function totalOf(p, state) {
    if (state.complete) return 1;
    var t = 0;
    for (var i = 0; i < state.stroke; i++) t += p.strokes[i].len;
    return p.len > 0 ? clamp((t + state.done) / p.len, 0, 1) : 1;
  }
  /** Stroke completion rule: done ≥ len − 0.6·tol → next stroke / complete. */
  function settle(p, state, tol) {
    while (!state.complete) {
      var st = p.strokes[state.stroke];
      if (state.done < st.len - 0.6 * tol - 1e-9 && state.done < st.len) break;
      state.done = st.len;
      if (state.stroke >= p.strokes.length - 1) { state.complete = true; state.off = false; break; }
      state.stroke++; state.done = 0; state.anchor = false; state.lastS = -1;   // the next stroke's start must be touched
    }
    state.total = totalOf(p, state);
  }
  /** Nearest point of the current stroke inside [done, done + look] → {s, d}. */
  function nearest(p, state, x, y, look, stroke) {
    var st = stroke || p.strokes[state.stroke], pts = st.pts, n = pts.length, lo = state.done, hi = Math.min(st.len, state.done + look);
    var i0 = Math.max(0, Math.floor(lo / STEP)), i1 = Math.min(n - 1, Math.ceil(hi / STEP)), best = { s: lo, d: 1e9 };
    if (n === 1) { best.d = hyp(x - pts[0][0], y - pts[0][1]); return best; }
    for (var i = i0; i < i1; i++) {
      var a = pts[i], b = pts[i + 1], s0 = i * STEP, seg = i === n - 2 ? st.len - s0 : STEP;
      var ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey, u = L2 > 0 ? ((x - a[0]) * ex + (y - a[1]) * ey) / L2 : 0;
      // clamp into the window
      var uLo = clamp((lo - s0) / seg, 0, 1), uHi = clamp((hi - s0) / seg, 0, 1);
      u = clamp(u, uLo, uHi);
      var qx = a[0] + ex * u, qy = a[1] + ey * u, d = hyp(x - qx, y - qy);
      if (d < best.d - 1e-9) { best.d = d; best.s = s0 + seg * u; }
    }
    return best;
  }
  function trackOne(p, state, x, y, tol, look) {
    if (state.complete) return;
    if (!state.anchor) {   // the finger must first touch the icing head (the start of the stroke / the end of the icing)
      var hd = pointAt(p, state.stroke, state.done), dh = hyp(x - hd.x, y - hd.y);
      state.dist = dh;
      if (dh > tol * 1.2) { state.off = true; return; }
      state.anchor = true; state.off = false;
      state.lastS = nearest(p, state, x, y, look).s;   // the touching sample itself never ices
      return;
    }
    var st = p.strokes[state.stroke];
    if (st.closed && p.strokes.length === 1 && !state.dirSet && state.done <= 1e-9) {
      // closed outline, nothing iced yet: follow both directions until one reaches DIR_PX
      if (!p._rev) p._rev = reversedStroke(st);
      var f = nearest(p, state, x, y, look), r = nearest(p, state, x, y, look, p._rev);
      state.dist = Math.min(f.d, r.d); state.off = state.dist > tol;
      if (f.d <= tol) state.sF = Math.max(state.sF, f.s);
      if (r.d <= tol) state.sR = Math.max(state.sR, r.s);
      if (Math.max(state.sF, state.sR) < DIR_PX) return;
      state.dirSet = true;
      if (state.sR > state.sF) { var o = p.strokes[0]; p.strokes[0] = p._rev; p._rev = o; state.rev = !state.rev; state.done = state.sR; }
      else state.done = state.sF;
      settle(p, state, tol);
      return;
    }
    var nb = nearest(p, state, x, y, look);
    state.dist = nb.d;
    if (nb.d <= tol) {
      state.off = false;
      // forward motion only: the finger's projection must move on from the previous sample (a backwards drag that came
      // within reach of the head never ices)
      if (nb.s > state.done && nb.s > state.lastS) state.done = nb.s;
      state.lastS = nb.s;
      settle(p, state, tol);
    } else { state.off = true; state.lastS = Infinity; }   // coming back onto the dots re-anchors (no jump from the window's far end)
  }
  function track(p, state, x, y, tol, look) {
    state = state || start();
    tol = tol || 58; look = look || 90;
    if (state.complete) { state.off = false; return state; }
    var fx = state.fx, fy = state.fy;
    if (fx !== null && fx !== undefined) {
      var d = hyp(x - fx, y - fy), n = Math.ceil(d / 8);
      for (var k = 1; k < n && !state.complete; k++) trackOne(p, state, fx + (x - fx) * k / n, fy + (y - fy) * k / n, tol, look);
    }
    if (!state.complete) trackOne(p, state, x, y, tol, look);
    else state.off = false;
    state.fx = x; state.fy = y;
    state.total = totalOf(p, state);
    return state;
  }
  function advance(p, state, d, tol) {
    state = state || start();
    var left = Math.max(0, d);
    while (left > 0 && !state.complete) {
      var st = p.strokes[state.stroke], room = st.len - state.done, k = Math.min(room, left);
      state.done += k; left -= k; state.dirSet = true;
      if (state.done >= st.len - 1e-9) settle(p, state, 0); else break;
    }
    settle(p, state, tol || 0);
    state.off = false;
    return state;
  }
  function head(p, state) {
    var si = Math.min(state.stroke, p.strokes.length - 1), q = pointAt(p, si, state.complete ? p.strokes[si].len : state.done);
    q.stroke = si;
    return q;
  }
  /** Points of stroke si from arc a to arc b (inclusive ends, interpolated). */
  function slice(p, si, a, b) {
    var st = p.strokes[si], pts = st.pts, out = [], i;
    if (b <= a) return out;
    var A = pointAt(p, si, a); out.push([A.x, A.y]);
    for (i = Math.floor(a / STEP) + 1; i < pts.length && i * STEP < b - 1e-9; i++) { if (i === pts.length - 1 && st.len < b - 1e-9) { out.push(pts[i].slice()); break; } out.push(pts[i].slice()); }
    var B = pointAt(p, si, b), q = out[out.length - 1];
    if (hyp(B.x - q[0], B.y - q[1]) > 1e-6) out.push([B.x, B.y]);
    return out;
  }
  function drawn(p, state) {
    return p.strokes.map(function (st, i) {
      if (state.complete || i < state.stroke) return st.pts.map(function (q) { return q.slice(); });
      if (i > state.stroke) return [];
      return state.done > 0 ? slice(p, i, 0, state.done) : [];
    });
  }
  function remaining(p, state) {
    return p.strokes.map(function (st, i) {
      if (state.complete || i < state.stroke) return [];
      if (i > state.stroke) return st.pts.map(function (q) { return q.slice(); });
      return slice(p, i, state.done, st.len);
    });
  }
  /** Test helper: follow the points (4 px moves; jitter px perpendicular noise via a tiny LCG), lift between strokes. */
  function follow(p, o) {
    o = o || {};
    var tol = o.tol || 50, look = o.look || 90, jit = o.jitter || 0, seed = (o.seed || 1) >>> 0, state = start(), moves = 0, i, k;
    function rnd() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 - 0.5; }
    for (k = 0; k < p.strokes.length && !state.complete; k++) {
      lift(state);
      var pts = p.strokes[k].pts;
      for (i = 0; i < pts.length && !state.complete && state.stroke === k; i++) {
        track(p, state, pts[i][0] + jit * 2 * rnd(), pts[i][1] + jit * 2 * rnd(), tol, look); moves++;
      }
      // the end of a stroke a little past the last point (fingers overshoot): settle by the rule
      if (!state.complete && state.stroke === k) { var e = pts[pts.length - 1]; track(p, state, e[0], e[1], tol, look); moves++; }
    }
    return { complete: state.complete, moves: moves, state: state };
  }

  IB.Trace = {
    STEP: STEP, STROKES: STROKES, GLYPHS: GLYPHS, SHAPES: ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'],
    path: path, start: start, lift: lift, track: track, advance: advance, pointAt: pointAt, head: head, drawn: drawn, remaining: remaining,
    totalOf: totalOf, follow: follow, SHAPE_UNIT: shapeUnit, hasGlyph: function (c) { return !!G[c]; }
  };
})(window.IB = window.IB || {});
