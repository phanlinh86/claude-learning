// IM.IceArt — code-drawn ice blocks, frost, faces and icy rewards for Tuk's Ice Match (ice artist). DESIGN §3, §5.6.
// Classic script; safe to load in node (no DOM at load: offscreen canvases are created lazily inside draw calls).
// IM.CardArt is kept as an alias so the Dee-era renderer keeps working (drawCard / drawButterfly / drawLantern / drawAcorn).
//
// Everything is drawn CENTRED at (0,0) in the current transform. A block is w × h; its top face is w × (h − side) and
// a `side` px thick lower side face shows below it (side = sideOf(w) ≈ 10 px at 104 px). topFace(w, h) → {y, h, cy}.
//   drawBlock(ctx, w, h, opt)                  clear ice block (gradient, top-left bevel, side face, outline)
//   drawFrost(ctx, w, h, frost, crack, seed)   frost overlay on the top face. frost 1 = fully frosted (identical for every
//                                              block: no cue); 0 < frost < 1 = frost at the edges, clear hole in the centre
//                                              (frost creeps in from the edges as frost → 1 / clears from the centre as → 0);
//                                              crack 0..1 = crack lines growing from the centre (deterministic per seed)
//   drawFace(ctx, w, h, face, opt)             the picture inside (cached) + live opt.sprite for animal / home faces
//   drawGlaze(ctx, w, h)                       12 % white glaze + ice sheen over the picture (makes it look frozen in)
//   drawBack(ctx, w, h, opt)                   = drawBlock + drawFrost(1)              (cached as one bitmap)
//   drawFront(ctx, w, h, face, opt)            = drawBlock + drawFace + drawGlaze
//   drawIce(ctx, w, h, face, frost, opt)       = drawFront + drawFrost(frost, opt.crack, opt.seed)   (the usual call)
//   drawCard(ctx, w, h, face, flip, opt)       Dee-compatible: drawIce with frost = 1 − flip (no 3D flip any more)
//   drawFish(ctx, color, size, wag)            size = nose-to-tail length, facing right; wag = tail phase 0..1 (0 = straight,
//                                              tail angle = 0.32·sin(2π·wag)). Height ≈ 0.62·size.
//   drawSculpture(ctx, shape, color, size, glow)  snow sculpture; (0,0) = shape centre, size = shape box width;
//                                              snowy base below to y = sculptureBottom(shape, size); top at sculptureTop()
//   drawStar(ctx, size, text?, opt?)           snowflake star (size = tip-to-tip), optional text; opt.twinkle 0..1
//   drawShard(ctx, size, rot, opt?)            ice shard particle (opt.variant 0..2 for different outlines)
//   drawHole(ctx, w, h, t)                     melt hole (ellipse w × h) with ripple rings; t 0..1 (opens by t ≈ 0.25)
//   drawGlow(ctx, w, h, glow, color?)          live halo around a block (hint / selected); alias drawCardGlow
// opt (block calls): { glow 0..1, glowColor, alpha 0..1, crack 0..1, seed, sprite(name, x, y, size) — renderer callback
//   for animal / home faces (x, y = sprite centre, size = sprite box) }
// face: { kind:'color'|'shape'|'dots'|'number'|'letter'|'text'|'animal'|'home'|'parity', value, color?, shape?, n?, text?,
//   sprite?, scale? (0.6 = the small one of a big/small pair), parity? 'odd'|'even' (rim on any kind), dots? (parity → fish) }
// Cache: bitmaps per (kind/value signature, size bucket 2 px, device scale bucket 0.5); device scale = the transform's Y axis.
(function (IM) {
  'use strict';

  // ---------------------------------------------------------------- palette (DESIGN §3, exact)
  var PALETTE = {
    red: ['#E84A4A', '#A8282E'], blue: ['#3C8DE8', '#1F5BA8'], yellow: ['#FFD23F', '#C99A12'],
    green: ['#4CC26B', '#2A8343'], orange: ['#FF9A2E', '#C4650C'], purple: ['#9B6BE0', '#6840A8'],
    pink: ['#FF8FC0', '#C9558A']
  };
  var ICE = {
    top: '#DDF1FB', top2: '#BFE3F5', bevel: '#F4FBFF', line: '#6FA7C8', side: '#9CCBE3', side2: '#86BBD8',
    frost: '#F2F8FC', frost2: '#DCEAF3', crystal: '#C4DCEB', crack: '#7FAFCC',
    ink: '#163E66', inkShadow: '#A9CCE2', water: '#2C6E9A', water2: '#123F66'
  };
  var FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui, -apple-system, "Segoe UI", sans-serif';
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect'];
  var GLAZE = 0.12;          // white glaze over the picture
  var TINT = 0.06;           // bluish "frozen-in" tint on the picture
  var DOT_FISH = 'orange';   // counting fish colour (never an answer in count rounds)
  var TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hexRgb(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function rgbHex(c) {
    return '#' + c.map(function (v) { var s = clamp(Math.round(v), 0, 255).toString(16); return s.length < 2 ? '0' + s : s; }).join('').toUpperCase();
  }
  function mix(a, b, t) { var x = hexRgb(a), y = hexRgb(b); return rgbHex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; })); }
  function rgba(hex, a) { var c = hexRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (+a).toFixed(3) + ')'; }
  function lum(hex) {
    var c = hexRgb(hex).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) { var la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }

  var COLORS = {};
  Object.keys(PALETTE).forEach(function (k) {
    var base = PALETTE[k][0], dark = PALETTE[k][1];
    COLORS[k] = { base: base, dark: dark, light: mix(base, '#FFFFFF', 0.45), shade: mix(base, dark, 0.45) };
  });
  function col(key) { return COLORS[key] || COLORS.red; }
  function needsRim(key) { return key === 'blue' || key === 'purple'; }   // cool colours get the white inner rim on ice

  function rng(seed) {   // mulberry32
    var a = (seed >>> 0) || 0x9E3779B9;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------- path helpers
  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function rrPath(ctx, x, y, w, h, r) { ctx.beginPath(); rr(ctx, x, y, w, h, r); }
  function roundPoly(ctx, v, r) {
    var n = v.length;
    ctx.moveTo((v[0][0] + v[n - 1][0]) / 2, (v[0][1] + v[n - 1][1]) / 2);
    for (var i = 0; i < n; i++) {
      var a = v[i], b = v[(i + 1) % n];
      ctx.arcTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, typeof r === 'number' ? r : r[i]);
    }
    ctx.closePath();
  }
  function ell(ctx, x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot || 0, 0, TAU); }
  function smoothClosed(ctx, pts) {   // closed curve through the midpoints of pts (control points = pts)
    var n = pts.length;
    ctx.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
    for (var i = 0; i < n; i++) {
      var p = pts[i], q = pts[(i + 1) % n];
      ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
    }
    ctx.closePath();
  }
  // fill + outline with an optional white inner rim (cool colours on ice): pathFn() builds the path (incl. beginPath)
  function outline(ctx, pathFn, dark, lw, rim) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (rim) {
      ctx.save(); pathFn(); ctx.clip();
      pathFn(); ctx.lineWidth = lw * 2.3; ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.stroke();
      ctx.restore();
    }
    pathFn(); ctx.lineWidth = lw; ctx.strokeStyle = dark; ctx.stroke();
  }

  // ---------------------------------------------------------------- block geometry
  function sideOf(w) { return clamp(Math.round(0.096 * w), 6, 14); }
  function radiusOf(w) { return 0.16 * w; }
  function topFace(w, h) { var s = sideOf(w), th = h - s; return { y: -h / 2, h: th, cy: -h / 2 + th / 2, side: s }; }
  function topPath(ctx, w, h) { var T = topFace(w, h); rrPath(ctx, -w / 2, T.y, w, T.h, radiusOf(w)); }

  // ---------------------------------------------------------------- the clear ice block
  function paintBlock(ctx, w, h) {
    var T = topFace(w, h), r = radiusOf(w), lw = Math.max(1.5, 0.022 * w), x = -w / 2;
    // side face = the whole silhouette (top face is drawn over it)
    rrPath(ctx, x, -h / 2, w, h, r);
    var gs = ctx.createLinearGradient(0, T.y + T.h - r, 0, h / 2);
    gs.addColorStop(0, ICE.side); gs.addColorStop(1, ICE.side2);
    ctx.fillStyle = gs; ctx.fill();
    // light streaks on the side face (thickness reads as ice)
    ctx.save(); rrPath(ctx, x, -h / 2, w, h, r); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = Math.max(1, 0.012 * w);
    [-0.3, 0.05, 0.32].forEach(function (k) {
      ctx.beginPath(); ctx.moveTo(k * w, T.y + T.h + 1.5); ctx.lineTo(k * w + 0.05 * w, h / 2 - 1.5); ctx.stroke();
    });
    ctx.restore();
    // top face: clear ice gradient
    topPath(ctx, w, h);
    var g = ctx.createLinearGradient(-w / 2, T.y, w / 2, T.y + T.h);
    g.addColorStop(0, ICE.top); g.addColorStop(1, ICE.top2);
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); topPath(ctx, w, h); ctx.clip();
    // inner depth: a soft darker pool towards the bottom-right
    var rg = ctx.createRadialGradient(0.12 * w, T.cy + 0.12 * T.h, 0.05 * w, 0.12 * w, T.cy + 0.12 * T.h, 0.7 * w);
    rg.addColorStop(0, 'rgba(160,205,232,0.0)'); rg.addColorStop(1, 'rgba(140,192,224,0.28)');
    ctx.fillStyle = rg; ctx.fillRect(-w / 2, T.y, w, T.h);
    // bevel: bright top-left rim, darker bottom-right rim
    var bw = Math.max(2, 0.07 * w);
    rrPath(ctx, x + bw / 2, T.y + bw / 2, w - bw, T.h - bw, Math.max(1, r - bw / 2));
    var bg = ctx.createLinearGradient(-w / 2, T.y, w / 2, T.y + T.h);
    bg.addColorStop(0, rgba(ICE.bevel, 1)); bg.addColorStop(0.45, rgba(ICE.bevel, 0.35)); bg.addColorStop(1, 'rgba(111,167,200,0.30)');
    ctx.lineWidth = bw; ctx.strokeStyle = bg; ctx.stroke();
    ctx.restore();
    // edge where the top face meets the side
    topPath(ctx, w, h); ctx.lineWidth = Math.max(1, 0.012 * w); ctx.strokeStyle = rgba(ICE.line, 0.75); ctx.stroke();
    // outline of the whole block
    rrPath(ctx, x + lw / 2, -h / 2 + lw / 2, w - lw, h - lw, r - lw / 2);
    ctx.lineWidth = lw; ctx.strokeStyle = ICE.line; ctx.stroke();
  }

  // ---------------------------------------------------------------- frost
  function snowflake(ctx, R, lw, color, simple) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
    for (var k = 0; k < 6; k++) {
      ctx.save(); ctx.rotate(k * Math.PI / 3);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -R);
      (simple ? [0.76] : [0.42, 0.7]).forEach(function (f, j) {
        var b = R * (j ? 0.2 : 0.28);
        ctx.moveTo(0, -R * f); ctx.lineTo(-b * 0.8, -R * f - b * 0.75);
        ctx.moveTo(0, -R * f); ctx.lineTo(b * 0.8, -R * f - b * 0.75);
      });
      ctx.stroke(); ctx.restore();
    }
    ctx.beginPath();
    for (var i = 0; i < 6; i++) { var a = i * Math.PI / 3 - Math.PI / 2, rr0 = R * 0.16; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr0, Math.sin(a) * rr0); }
    ctx.closePath(); ctx.stroke();
    ctx.restore();
  }
  function sparkle(ctx, x, y, s, a) {
    ctx.save(); ctx.translate(x, y); ctx.beginPath();
    ctx.moveTo(0, -s); ctx.quadraticCurveTo(0, 0, s, 0); ctx.quadraticCurveTo(0, 0, 0, s);
    ctx.quadraticCurveTo(0, 0, -s, 0); ctx.quadraticCurveTo(0, 0, 0, -s);
    ctx.fillStyle = 'rgba(255,255,255,' + a + ')'; ctx.fill(); ctx.restore();
  }
  function paintFrost(ctx, w, h) {   // the full frost layer (identical for every block)
    var T = topFace(w, h), R = rng(20261111);
    topPath(ctx, w, h);
    var g = ctx.createRadialGradient(-0.12 * w, T.cy - 0.14 * T.h, 0.04 * w, 0, T.cy, 0.78 * Math.max(w, T.h));
    g.addColorStop(0, '#FAFDFF'); g.addColorStop(0.45, ICE.frost); g.addColorStop(1, ICE.frost2);
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); topPath(ctx, w, h); ctx.clip();
    // fern-like frost feathers growing in from the four corners
    ctx.lineCap = 'round'; ctx.strokeStyle = rgba(ICE.crystal, 0.55); ctx.lineWidth = Math.max(1, 0.011 * w);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q, qi) {
      ctx.save(); ctx.translate(q[0] * w / 2, T.cy + q[1] * T.h / 2);
      ctx.rotate(Math.atan2(-q[1], -q[0]));
      for (var b = -1; b <= 1; b++) {
        ctx.save(); ctx.rotate(b * 0.42);
        var L = (b ? 0.2 : 0.27) * w;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L, 0);
        for (var t = 0.25; t < 0.95; t += 0.22) {
          var bl = (1 - t) * 0.09 * w;
          ctx.moveTo(L * t, 0); ctx.lineTo(L * t + bl * 0.7, -bl);
          ctx.moveTo(L * t, 0); ctx.lineTo(L * t + bl * 0.7, bl);
        }
        ctx.stroke(); ctx.restore();
      }
      ctx.restore();
    });
    // granular frost
    for (var i = 0; i < 70; i++) {
      var px = (R() - 0.5) * w, py = T.cy + (R() - 0.5) * T.h, pr = (0.004 + R() * 0.009) * w;
      ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU);
      ctx.fillStyle = R() < 0.55 ? 'rgba(255,255,255,0.85)' : rgba(ICE.crystal, 0.45); ctx.fill();
    }
    // the central crystal
    ctx.save(); ctx.translate(0, T.cy);
    snowflake(ctx, 0.27 * w, Math.max(1.4, 0.024 * w), rgba(ICE.crystal, 0.95));
    snowflake(ctx, 0.27 * w, Math.max(0.6, 0.008 * w), 'rgba(255,255,255,0.7)');
    ctx.restore();
    // sparkles
    [[-0.3, -0.3, 0.05], [0.31, -0.18, 0.035], [0.22, 0.32, 0.045], [-0.26, 0.26, 0.03]].forEach(function (p) {
      sparkle(ctx, p[0] * w, T.cy + p[1] * T.h, p[2] * w, 0.95);
    });
    // frosty bevel
    var bw = Math.max(2, 0.06 * w), r = radiusOf(w);
    rrPath(ctx, -w / 2 + bw / 2, T.y + bw / 2, w - bw, T.h - bw, Math.max(1, r - bw / 2));
    var bg = ctx.createLinearGradient(-w / 2, T.y, w / 2, T.y + T.h);
    bg.addColorStop(0, 'rgba(255,255,255,1)'); bg.addColorStop(0.5, 'rgba(255,255,255,0.25)'); bg.addColorStop(1, rgba(ICE.crystal, 0.55));
    ctx.lineWidth = bw; ctx.strokeStyle = bg; ctx.stroke();
    ctx.restore();
    topPath(ctx, w, h); ctx.lineWidth = Math.max(1, 0.012 * w); ctx.strokeStyle = rgba(ICE.line, 0.8); ctx.stroke();
  }
  // the clear hole (frost < 1) as a closed path in the top face
  function holePoints(w, h, frost, crack, seed) {
    var T = topFace(w, h), R = rng((seed >>> 0) ^ 0x51ED27), N = 18;
    var Rm = 0.64 * Math.sqrt(w * w + T.h * T.h), k = Math.pow(1 - frost, 0.8), out = [];
    for (var i = 0; i < N; i++) {
      var a = (i + (R() - 0.5) * 0.5) / N * TAU;
      // jagged (shard-like) while cracking, soft & wavy when the frost creeps back
      var j = crack > 0.01 ? (i % 2 ? 0.8 + R() * 0.12 : 1.0 + R() * 0.14) : 0.8 + R() * 0.22;
      var rad = Rm * k * j;
      out.push([Math.cos(a) * rad, T.cy + Math.sin(a) * rad]);
    }
    return out;
  }
  function holePath(ctx, pts, jagged) {
    if (jagged) { ctx.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); }
    else smoothClosed(ctx, pts);
  }
  function crackLines(w, h, seed) {   // [{pts:[[x,y]..], len, branch:{at, pts}}], deterministic per seed
    var T = topFace(w, h), R = rng((seed >>> 0) ^ 0xC0FFEE), K = 6 + Math.floor(R() * 2), out = [];
    var a0 = R() * TAU, reach = 0.6 * Math.sqrt(w * w + T.h * T.h);
    for (var i = 0; i < K; i++) {
      var a = a0 + i / K * TAU + (R() - 0.5) * 0.5, x = 0, y = T.cy, pts = [[x, y]], L = reach * (0.75 + R() * 0.3), seg = 4;
      for (var s = 1; s <= seg; s++) {
        a += (R() - 0.5) * 0.55;
        x += Math.cos(a) * L / seg; y += Math.sin(a) * L / seg * (T.h / w);
        pts.push([x, y]);
      }
      var br = null;
      if (R() < 0.7) {
        var at = 1 + Math.floor(R() * 2), b = pts[at], ba = Math.atan2(pts[at + 1][1] - b[1], pts[at + 1][0] - b[0]) + (R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.4);
        br = { at: at / seg, pts: [b, [b[0] + Math.cos(ba) * L * 0.22, b[1] + Math.sin(ba) * L * 0.22], [b[0] + Math.cos(ba + 0.3) * L * 0.36, b[1] + Math.sin(ba + 0.3) * L * 0.36]] };
      }
      out.push({ pts: pts, br: br });
    }
    return out;
  }
  function strokePartial(ctx, pts, p) {   // polyline up to fraction p of its points
    var n = pts.length - 1, upto = p * n;
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i <= n; i++) {
      if (i <= upto) ctx.lineTo(pts[i][0], pts[i][1]);
      else { var f = upto - (i - 1); if (f > 0) ctx.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f); break; }
    }
  }
  var crackCache = {};
  function drawCracks(ctx, w, h, crack, seed) {
    var key = (seed >>> 0) + ':' + Math.round(w) + 'x' + Math.round(h);
    var C = crackCache[key] || (crackCache[key] = crackLines(w, h, seed));
    if (Object.keys(crackCache).length > 64) crackCache = {};
    var T = topFace(w, h), p = clamp(crack * 1.15, 0, 1), lw = Math.max(1.3, 0.022 * w);
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      C.forEach(function (c) {
        strokePartial(ctx, c.pts, p);
        if (c.br && p > c.br.at) strokePartial(ctx, c.br.pts, clamp((p - c.br.at) / (1 - c.br.at), 0, 1));
      });
      if (pass === 0) { ctx.lineWidth = lw; ctx.strokeStyle = ICE.crack; }
      else { ctx.translate(-0.3 * lw, -0.3 * lw); ctx.lineWidth = lw * 0.45; ctx.strokeStyle = 'rgba(255,255,255,0.95)'; }
      ctx.stroke();
    }
    ctx.restore();
    // impact star in the middle
    ctx.save(); ctx.translate(0, T.cy);
    sparkle(ctx, 0, 0, (0.05 + 0.06 * Math.min(1, crack * 3)) * w, 0.95);
    ctx.restore();
  }
  function drawFrost(ctx, w, h, frost, crack, seed) {
    frost = clamp(frost == null ? 1 : +frost, 0, 1); crack = clamp(+crack || 0, 0, 1); seed = seed || 1;
    if (frost <= 0.002) return;
    if (frost >= 0.998 && crack <= 0.001) { cached(ctx, 'frost', w, h, paintFrost); return; }
    var pts = frost < 0.998 ? holePoints(w, h, frost, crack, seed) : null, jag = crack > 0.01;
    function region() { ctx.beginPath(); topPathNoBegin(ctx, w, h); if (pts) holePath(ctx, pts, jag); }
    ctx.save();
    topPath(ctx, w, h); ctx.clip();
    region(); ctx.clip('evenodd');
    cached(ctx, 'frost', w, h, paintFrost);
    if (pts) {   // a bright, thicker frost edge along the clearing
      ctx.beginPath(); holePath(ctx, pts, jag);
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2, 0.06 * w); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
      ctx.lineWidth = Math.max(1, 0.014 * w); ctx.strokeStyle = rgba(ICE.crystal, 0.9); ctx.stroke();
    }
    if (crack > 0.001) drawCracks(ctx, w, h, crack, seed);
    ctx.restore();
  }
  function topPathNoBegin(ctx, w, h) { var T = topFace(w, h); rr(ctx, -w / 2, T.y, w, T.h, radiusOf(w)); }

  // ---------------------------------------------------------------- glaze (ice over the picture)
  function paintGlaze(ctx, w, h) {
    var T = topFace(w, h);
    ctx.save(); topPath(ctx, w, h); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,' + GLAZE + ')'; ctx.fillRect(-w / 2, T.y, w, T.h);
    // two diagonal sheen bands upper-left + one small lower-right
    ctx.fillStyle = 'rgba(255,255,255,0.24)';
    ctx.beginPath(); ctx.moveTo(-0.5 * w, T.y + 0.42 * T.h); ctx.lineTo(-0.5 * w + 0.42 * T.h, T.y); ctx.lineTo(-0.5 * w + 0.56 * T.h, T.y); ctx.lineTo(-0.5 * w, T.y + 0.56 * T.h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.moveTo(-0.5 * w, T.y + 0.66 * T.h); ctx.lineTo(-0.5 * w + 0.66 * T.h, T.y); ctx.lineTo(-0.5 * w + 0.72 * T.h, T.y); ctx.lineTo(-0.5 * w, T.y + 0.72 * T.h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath(); ctx.moveTo(0.5 * w, T.y + 0.8 * T.h); ctx.lineTo(0.5 * w - 0.2 * T.h, T.y + T.h); ctx.lineTo(0.5 * w - 0.12 * T.h, T.y + T.h); ctx.lineTo(0.5 * w, T.y + 0.88 * T.h); ctx.closePath(); ctx.fill();
    // tiny trapped bubbles
    [[0.34, -0.36, 0.022], [0.39, -0.27, 0.014], [-0.37, 0.33, 0.017]].forEach(function (b) {
      ctx.beginPath(); ctx.arc(b[0] * w, T.cy + b[1] * T.h, b[2] * w, 0, TAU);
      ctx.lineWidth = Math.max(0.8, 0.008 * w); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke();
    });
    ctx.restore();
    // crisp top-left highlight line on the ice surface
    var r = radiusOf(w), ins = 0.05 * w;
    ctx.beginPath(); ctx.moveTo(-w / 2 + ins, T.y + r + 0.12 * T.h); ctx.lineTo(-w / 2 + ins, T.y + r);
    ctx.arcTo(-w / 2 + ins, T.y + ins, -w / 2 + r, T.y + ins, r - ins); ctx.lineTo(-w / 2 + r + 0.14 * w, T.y + ins);
    ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.2, 0.024 * w); ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.stroke();
  }

  // ---------------------------------------------------------------- fish
  function fishBody(ctx, s) { ell(ctx, 0.07 * s, 0, 0.34 * s, 0.27 * s, 0); }
  function fishTail(ctx, s) {
    ctx.beginPath();
    ctx.moveTo(0.02 * s, -0.05 * s);
    ctx.bezierCurveTo(-0.12 * s, -0.1 * s, -0.22 * s, -0.24 * s, -0.27 * s, -0.27 * s);
    ctx.quadraticCurveTo(-0.32 * s, -0.12 * s, -0.2 * s, 0);
    ctx.quadraticCurveTo(-0.32 * s, 0.12 * s, -0.27 * s, 0.27 * s);
    ctx.bezierCurveTo(-0.22 * s, 0.24 * s, -0.12 * s, 0.1 * s, 0.02 * s, 0.05 * s);
    ctx.closePath();
  }
  function fishFin(ctx, s) {
    ctx.beginPath();
    ctx.moveTo(-0.08 * s, -0.22 * s);
    ctx.quadraticCurveTo(0.0 * s, -0.4 * s, 0.17 * s, -0.33 * s);
    ctx.quadraticCurveTo(0.14 * s, -0.27 * s, 0.14 * s, -0.22 * s);
    ctx.closePath();
  }
  function drawFish(ctx, color, size, wag, opt) {
    var c = col(color), s = size, lw = Math.max(1.3, (opt && opt.lw) || 0.05 * s), rim = needsRim(color) && s >= 22;
    var ta = 0.32 * Math.sin(TAU * (+wag || 0));
    ctx.save();
    ctx.translate(0.075 * s, 0);   // bbox x ≈ −0.56s … +0.41s → centred (length ≈ 0.97·size)
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // tail (hinged at the body's back) + dorsal fin behind the body
    ctx.save(); ctx.translate(-0.2 * s, 0); ctx.rotate(ta); ctx.translate(-0.04 * s, 0);
    fishTail(ctx, s); ctx.fillStyle = c.shade; ctx.fill();
    ctx.save(); fishTail(ctx, s); ctx.clip();
    ctx.strokeStyle = rgba(c.dark, 0.35); ctx.lineWidth = Math.max(0.8, 0.02 * s);
    ctx.beginPath(); ctx.moveTo(-0.06 * s, -0.04 * s); ctx.lineTo(-0.24 * s, -0.17 * s); ctx.moveTo(-0.06 * s, 0.04 * s); ctx.lineTo(-0.24 * s, 0.17 * s); ctx.stroke();
    ctx.restore();
    outline(ctx, function () { fishTail(ctx, s); }, c.dark, lw, false);
    ctx.restore();
    fishFin(ctx, s); ctx.fillStyle = c.shade; ctx.fill();
    outline(ctx, function () { fishFin(ctx, s); }, c.dark, lw, false);
    // body
    fishBody(ctx, s);
    var g = ctx.createLinearGradient(0, -0.27 * s, 0, 0.27 * s);
    g.addColorStop(0, mix(c.base, c.light, 0.25)); g.addColorStop(0.55, c.base); g.addColorStop(1, c.shade);
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); fishBody(ctx, s); ctx.clip();
    ell(ctx, 0.12 * s, 0.2 * s, 0.3 * s, 0.13 * s, 0); ctx.fillStyle = rgba(mix(c.light, '#FFFFFF', 0.25), 0.85); ctx.fill();   // belly
    if (s >= 18) {   // scale arcs
      ctx.strokeStyle = rgba(c.dark, 0.3); ctx.lineWidth = Math.max(0.8, 0.018 * s);
      [[-0.1, -0.08], [-0.02, 0.04], [-0.12, 0.1], [0.05, -0.12]].forEach(function (p) {
        ctx.beginPath(); ctx.arc(p[0] * s, p[1] * s, 0.06 * s, -1.1, 1.1); ctx.stroke();
      });
    }
    ctx.restore();
    outline(ctx, function () { fishBody(ctx, s); }, c.dark, lw, rim);
    // gill line
    ctx.beginPath(); ctx.arc(0.13 * s, 0, 0.17 * s, -0.75, 0.75);
    ctx.lineWidth = Math.max(0.8, 0.026 * s); ctx.strokeStyle = rgba(c.dark, 0.55); ctx.stroke();
    // side fin
    ell(ctx, 0.04 * s, 0.07 * s, 0.075 * s, 0.045 * s, 0.5); ctx.fillStyle = c.light; ctx.fill();
    ctx.lineWidth = Math.max(0.8, 0.024 * s); ctx.strokeStyle = rgba(c.dark, 0.8); ctx.stroke();
    // eye + catch-light, cheek, smile
    ctx.beginPath(); ctx.arc(0.25 * s, -0.06 * s, 0.085 * s, 0, TAU); ctx.fillStyle = '#FFFFFF'; ctx.fill();
    ctx.lineWidth = Math.max(0.8, 0.018 * s); ctx.strokeStyle = rgba(c.dark, 0.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(0.27 * s, -0.055 * s, 0.056 * s, 0, TAU); ctx.fillStyle = '#1E1A1A'; ctx.fill();
    ctx.beginPath(); ctx.arc(0.25 * s, -0.08 * s, 0.022 * s, 0, TAU); ctx.fillStyle = '#FFFFFF'; ctx.fill();
    if (s >= 16) { ell(ctx, 0.25 * s, 0.075 * s, 0.045 * s, 0.026 * s, 0); ctx.fillStyle = 'rgba(247,140,165,0.75)'; ctx.fill(); }
    ctx.beginPath(); ctx.arc(0.355 * s, 0.035 * s, 0.035 * s, 0.2, 1.9);
    ctx.lineWidth = Math.max(0.9, 0.022 * s); ctx.strokeStyle = '#3A1F1F'; ctx.stroke();
    // highlight
    ell(ctx, -0.04 * s, -0.15 * s, 0.11 * s, 0.04 * s, -0.25); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- shapes + snow sculptures
  // box: circle Ø1 · square 0.86 · rect 1.04 × 0.6 · triangle 1.2 × 1.04 · star Ø1.2 · heart 1.06 × 1
  var GEO = {
    circle: { top: -0.5, bot: 0.5 }, square: { top: -0.43, bot: 0.43 }, rect: { top: -0.3, bot: 0.3 },
    triangle: { top: -0.6, bot: 0.4 }, star: { top: -0.57, bot: 0.47 }, heart: { top: -0.44, bot: 0.5 }
  };
  function traceShape(ctx, shape, s) {
    ctx.beginPath();
    switch (shape) {
      case 'square': roundPoly(ctx, [[-0.43 * s, -0.43 * s], [0.43 * s, -0.43 * s], [0.43 * s, 0.43 * s], [-0.43 * s, 0.43 * s]], 0.1 * s); break;
      case 'rect': roundPoly(ctx, [[-0.52 * s, -0.3 * s], [0.52 * s, -0.3 * s], [0.52 * s, 0.3 * s], [-0.52 * s, 0.3 * s]], 0.09 * s); break;
      case 'triangle': roundPoly(ctx, [[0, -0.64 * s], [0.6 * s, 0.4 * s], [-0.6 * s, 0.4 * s]], 0.11 * s); break;
      case 'star': {
        var v = [], rad = [];
        for (var k = 0; k < 10; k++) {
          var ang = (-90 + k * 36) * Math.PI / 180, r = k % 2 ? 0.27 * s : 0.6 * s;
          v.push([Math.cos(ang) * r, Math.sin(ang) * r + 0.03 * s]); rad.push(k % 2 ? 0.05 * s : 0.08 * s);
        }
        roundPoly(ctx, v, rad);
        break;
      }
      case 'heart': {
        ctx.moveTo(0, -0.27 * s);
        ctx.bezierCurveTo(0.08 * s, -0.48 * s, 0.53 * s, -0.5 * s, 0.53 * s, -0.12 * s);
        ctx.bezierCurveTo(0.53 * s, 0.14 * s, 0.22 * s, 0.32 * s, 0, 0.5 * s);
        ctx.bezierCurveTo(-0.22 * s, 0.32 * s, -0.53 * s, 0.14 * s, -0.53 * s, -0.12 * s);
        ctx.bezierCurveTo(-0.53 * s, -0.5 * s, -0.08 * s, -0.48 * s, 0, -0.27 * s);
        ctx.closePath();
        break;
      }
      default: ctx.arc(0, 0, 0.5 * s, 0, TAU);
    }
  }
  function geo(shape) { return GEO[shape] || GEO.circle; }
  function sculptureTop(shape, size) { return geo(shape).top * size - 0.03 * size; }
  function sculptureBottom(shape, size) { return geo(shape).bot * size + 0.13 * size; }
  function snowBase(ctx, s, y) {   // a soft snow mound the sculpture stands on
    var rx = 0.5 * s, ry = 0.12 * s;
    function mound() {
      ctx.beginPath(); ctx.moveTo(-rx, y + ry * 0.4);
      ctx.bezierCurveTo(-rx * 0.9, y - ry * 1.1, -rx * 0.3, y - ry * 1.2, 0, y - ry * 1.1);
      ctx.bezierCurveTo(rx * 0.35, y - ry * 1.25, rx * 0.95, y - ry * 1.0, rx, y + ry * 0.4);
      ctx.quadraticCurveTo(0, y + ry * 1.25, -rx, y + ry * 0.4); ctx.closePath();
    }
    ell(ctx, 0.02 * s, y + ry * 0.75, rx * 1.02, ry * 0.5, 0); ctx.fillStyle = 'rgba(40,90,130,0.16)'; ctx.fill();
    mound();
    var g = ctx.createLinearGradient(0, y - ry, 0, y + ry);
    g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, '#D3E6F2');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = Math.max(1, 0.03 * s); ctx.strokeStyle = '#8DB7D2'; ctx.lineJoin = 'round'; ctx.stroke();
  }
  function drawSculpture(ctx, shape, color, size, glow) {
    shape = GEO[shape] ? shape : 'circle';
    var c = col(color), s = size, G = geo(shape), lw = Math.max(1.5, 0.05 * s), rim = needsRim(color);
    glow = clamp(+glow || 0, 0, 1);
    ctx.save();
    if (glow > 0.01) {
      var g0 = ctx.createRadialGradient(0, 0, s * 0.2, 0, 0, s * 0.95);
      g0.addColorStop(0, rgba('#FFFFFF', 0.7 * glow)); g0.addColorStop(0.5, rgba(c.light, 0.35 * glow)); g0.addColorStop(1, rgba(c.light, 0));
      ctx.fillStyle = g0; ctx.beginPath(); ctx.arc(0, 0, s * 0.95, 0, TAU); ctx.fill();
    }
    snowBase(ctx, s, G.bot * s + 0.02 * s);
    // body: packed snow tinted in the answer colour
    traceShape(ctx, shape, s);
    var g = ctx.createRadialGradient(-0.14 * s, G.top * s * 0.5, 0.04 * s, 0, 0, 0.66 * s);
    g.addColorStop(0, mix(c.base, c.light, 0.55)); g.addColorStop(0.45, c.base); g.addColorStop(1, c.shade);
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); traceShape(ctx, shape, s); ctx.clip();
    // packed-snow specks
    var R = rng(SHAPES.indexOf(shape) * 97 + 13);
    for (var i = 0; i < 16; i++) {
      ctx.beginPath(); ctx.arc((R() - 0.5) * 1.1 * s, (R() - 0.5) * 1.1 * s, (0.012 + R() * 0.016) * s, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
    }
    // snow cap: a white band following the top edge with a wavy lower rim
    var y0 = G.top * s, y1 = y0 + 0.2 * s;
    ctx.beginPath(); ctx.moveTo(-0.7 * s, y0 - 0.1 * s); ctx.lineTo(0.7 * s, y0 - 0.1 * s); ctx.lineTo(0.7 * s, y1 - 0.02 * s);
    for (var k = 7; k >= 1; k--) {   // scalloped lower rim = lumps of snow
      var xa = ((k - 1) / 7 - 0.5) * 1.4 * s, xm = xa + 0.1 * s, dip = (k % 2 ? 0.075 : 0.05) * s;
      ctx.quadraticCurveTo(xm, y1 + dip * 1.6, xa, y1 - 0.01 * s);
    }
    ctx.closePath();
    ctx.save(); ctx.translate(0, 0.025 * s); ctx.fillStyle = rgba(c.dark, 0.28); ctx.fill(); ctx.restore();   // cap shadow
    ctx.fillStyle = '#FFFFFF'; ctx.fill();
    ctx.strokeStyle = 'rgba(150,190,215,0.8)'; ctx.lineWidth = Math.max(0.8, 0.02 * s); ctx.stroke();
    ctx.restore();
    outline(ctx, function () { traceShape(ctx, shape, s); }, c.dark, lw, rim);
    // highlight
    var hx = ({ heart: -0.26, triangle: -0.14, rect: -0.3, star: -0.12 }[shape] || -0.22) * s;
    var hy = ({ heart: -0.08, triangle: 0.05, rect: 0.02, star: 0.0, square: -0.05 }[shape] || -0.04) * s;
    ell(ctx, hx, hy, 0.06 * s, 0.035 * s, -0.7); ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- snowflake star
  function starPath(ctx, s, ro, ri) {
    var v = [], rad = [];
    for (var k = 0; k < 10; k++) {
      var ang = (-90 + k * 36) * Math.PI / 180, r = k % 2 ? ri : ro;
      v.push([Math.cos(ang) * r * s, Math.sin(ang) * r * s + 0.03 * s]); rad.push(k % 2 ? 0.04 * s : 0.08 * s);
    }
    ctx.beginPath(); roundPoly(ctx, v, rad);
  }
  function fitFont(ctx, text, maxW, px, weight) {
    ctx.font = (weight || 800) + ' ' + px + 'px ' + FONT;
    var w = ctx.measureText(text).width;
    if (w > maxW) { px = Math.max(6, px * maxW / w); ctx.font = (weight || 800) + ' ' + px + 'px ' + FONT; }
    return px;
  }
  function centredText(ctx, text, x, y, fill, stroke, slw) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    var m = ctx.measureText(text), asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
    var px = parseFloat(String(ctx.font).replace(/^\D*?(\d+(\.\d+)?)px.*$/, '$1')) || 16;
    var by = (asc != null && desc != null && asc + desc > 0) ? y + (asc - desc) / 2 : y + px * 0.35;
    if (stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = slw; ctx.strokeStyle = stroke; ctx.strokeText(text, x, by); }
    ctx.fillStyle = fill; ctx.fillText(text, x, by);
  }
  var STAR_INK = '#5A3208';
  function drawStar(ctx, size, text, opt) {
    var s = size, tw = (opt && opt.twinkle) || 0;
    ctx.save();
    var g = ctx.createRadialGradient(0, 0, 0.15 * s, 0, 0, 0.8 * s);
    g.addColorStop(0, 'rgba(255,250,215,0.7)'); g.addColorStop(0.55, 'rgba(220,240,255,0.3)'); g.addColorStop(1, 'rgba(220,240,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 0.8 * s, 0, TAU); ctx.fill();
    // snowflake arms between the star points
    ctx.save(); ctx.translate(0, 0.03 * s); ctx.rotate(Math.PI / 6);
    snowflake(ctx, 0.56 * s, Math.max(2, 0.075 * s), '#8EC2E0', true);
    snowflake(ctx, 0.56 * s, Math.max(1, 0.038 * s), '#FFFFFF', true);
    ctx.restore();
    starPath(ctx, s, 0.5, 0.27);
    var lg = ctx.createLinearGradient(-0.3 * s, -0.4 * s, 0.3 * s, 0.4 * s);
    lg.addColorStop(0, '#FFF0A8'); lg.addColorStop(0.5, '#FFD54A'); lg.addColorStop(1, '#F5B02E');
    ctx.fillStyle = lg; ctx.fill();
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1.4, 0.045 * s); ctx.strokeStyle = '#C98612'; ctx.stroke();
    ell(ctx, -0.13 * s, -0.17 * s, 0.07 * s, 0.035 * s, -0.8); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
    if (text != null && text !== '') {
      var str = String(text);
      fitFont(ctx, str, 0.46 * s, Math.round(0.32 * s), 900);
      centredText(ctx, str, 0, 0.055 * s, STAR_INK, 'rgba(255,250,225,0.95)', Math.max(1.5, 0.05 * s));
    }
    if (tw > 0) {
      ctx.save(); ctx.translate(0.38 * s, -0.38 * s); ctx.scale(tw, tw);
      sparkle(ctx, 0, 0, 0.17 * s, 1);
      ctx.restore();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- shard + hole
  var SHARDS = [
    [[0, -0.5], [0.34, 0.1], [0.1, 0.5], [-0.3, 0.22]],
    [[-0.1, -0.5], [0.4, -0.2], [0.2, 0.45], [-0.38, 0.3]],
    [[0.05, -0.45], [0.42, 0.4], [-0.4, 0.38]]
  ];
  function drawShard(ctx, size, rot, opt) {
    var v = SHARDS[((opt && opt.variant) | 0) % SHARDS.length], s = size;
    ctx.save(); ctx.rotate(rot || 0);
    ctx.beginPath(); v.forEach(function (p, i) { ctx[i ? 'lineTo' : 'moveTo'](p[0] * s, p[1] * s); }); ctx.closePath();
    var g = ctx.createLinearGradient(-0.4 * s, -0.5 * s, 0.4 * s, 0.5 * s);
    g.addColorStop(0, 'rgba(255,255,255,0.98)'); g.addColorStop(1, 'rgba(196,226,244,0.92)');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1, 0.07 * s); ctx.strokeStyle = '#7FB2D2'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(v[0][0] * s * 0.8, v[0][1] * s * 0.8); ctx.lineTo(v[1][0] * s * 0.7, v[1][1] * s * 0.7);
    ctx.lineWidth = Math.max(0.8, 0.07 * s); ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.stroke();
    ctx.restore();
  }
  var HOLE_RIM = (function () { var R = rng(4242), a = []; for (var i = 0; i < 22; i++) a.push(0.9 + R() * 0.2); return a; })();
  function drawHole(ctx, w, h, t) {
    t = clamp(+t || 0, 0, 1);
    var open = 1 - Math.pow(1 - Math.min(1, t / 0.25), 3), rx = w / 2 * open, ry = h / 2 * open;
    if (open < 0.01) return;
    ctx.save();
    // broken ice rim
    ctx.beginPath();
    var pts = HOLE_RIM.map(function (k, i) { var a = i / HOLE_RIM.length * TAU; return [Math.cos(a) * rx * 1.14 * k, Math.sin(a) * ry * 1.18 * k]; });
    smoothClosed(ctx, pts);
    ctx.fillStyle = '#EEF8FD'; ctx.fill(); ctx.lineWidth = Math.max(1, 0.03 * w); ctx.strokeStyle = rgba(ICE.line, 0.9); ctx.stroke();
    // water
    ell(ctx, 0, ry * 0.04, rx * 0.92, ry * 0.86, 0);
    var g = ctx.createLinearGradient(0, -ry, 0, ry);
    g.addColorStop(0, ICE.water2); g.addColorStop(1, ICE.water);
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ell(ctx, 0, ry * 0.04, rx * 0.92, ry * 0.86, 0); ctx.clip();
    // ripple rings
    for (var i = 0; i < 2; i++) {
      var p = ((t * 1.6) + i * 0.5) % 1, a = (1 - p) * (1 - t * 0.6);
      ell(ctx, 0, ry * 0.06, rx * (0.15 + 0.75 * p), ry * (0.12 + 0.7 * p), 0);
      ctx.lineWidth = Math.max(1, 0.03 * w); ctx.strokeStyle = 'rgba(255,255,255,' + (0.7 * a).toFixed(3) + ')'; ctx.stroke();
    }
    ell(ctx, -rx * 0.3, -ry * 0.35, rx * 0.3, ry * 0.12, -0.1); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();
    ctx.restore();
    ell(ctx, 0, ry * 0.04, rx * 0.92, ry * 0.86, 0);
    ctx.lineWidth = Math.max(1, 0.025 * w); ctx.strokeStyle = '#4C88AE'; ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- faces
  var DOTS = {   // dice-like layouts: [cols, rows, cells]
    1: [1, 1, [[0, 0]]],
    2: [2, 2, [[0, 0], [1, 1]]],
    3: [3, 3, [[0, 0], [1, 1], [2, 2]]],
    4: [2, 2, [[0, 0], [1, 0], [0, 1], [1, 1]]],
    5: [3, 3, [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]]],
    6: [2, 3, [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]]],
    7: [3, 3, [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [2, 2]]],
    8: [3, 3, [[0, 0], [1, 0], [2, 0], [0.5, 1], [1.5, 1], [0, 2], [1, 2], [2, 2]]],
    9: [3, 3, [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]]],
    10: [3, 4, [[0, 0], [1, 0], [2, 0], [0.5, 1], [1.5, 1], [0, 2], [1, 2], [2, 2], [0.5, 3], [1.5, 3]]],
    11: [3, 4, [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2], [0, 3], [2, 3], [1, 0.5], [1, 1.5], [1, 2.5]]],
    12: [3, 4, [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2], [0, 3], [1, 3], [2, 3]]]
  };
  function drawDots(ctx, n, bw, bh) {
    n = clamp(n | 0, 1, 12);
    var L = DOTS[n], cols = L[0], rows = L[1], cw = bw / cols, ch = bh / rows;
    var f = Math.min(cw * 0.92, ch * 0.92 / 0.62, bw * (n === 1 ? 0.78 : n <= 4 ? 0.46 : 0.38));   // fish length
    var gx = Math.min(cw, f * 1.12), gy = Math.min(ch, f * 0.62 * 1.3);
    var x0 = -gx * (cols - 1) / 2, y0 = -gy * (rows - 1) / 2;
    L[2].forEach(function (p, i) {
      ctx.save(); ctx.translate(x0 + p[0] * gx, y0 + p[1] * gy);
      drawFish(ctx, DOT_FISH, f, (i % 3) * 0.06, { lw: Math.max(1.3, 0.06 * f) });
      ctx.restore();
    });
  }
  function parityOf(face) {
    if (!face) return null;
    if (face.parity === 'odd' || face.parity === 'even') return face.parity;
    if (face.kind === 'parity') { var n = face.n != null ? face.n : +face.value; return isFinite(n) ? (n % 2 ? 'odd' : 'even') : null; }
    return null;
  }
  function paintParityRim(ctx, w, h, parity) {
    var T = topFace(w, h), pc = parity === 'odd' ? COLORS.blue : COLORS.orange, ins = 0.07 * w, fl = 0.065 * w, r = radiusOf(w) * 0.7;
    rrPath(ctx, -w / 2 + ins, T.y + ins, w - 2 * ins, T.h - 2 * ins, r);
    ctx.lineWidth = fl + 2 * Math.max(1, 0.014 * w); ctx.strokeStyle = pc.dark; ctx.stroke();
    ctx.lineWidth = fl; ctx.strokeStyle = pc.base; ctx.stroke();
    ctx.lineWidth = Math.max(1, 0.012 * w); ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    rrPath(ctx, -w / 2 + ins - fl * 0.2, T.y + ins - fl * 0.2, w - 2 * ins + fl * 0.4, T.h - 2 * ins + fl * 0.4, r + fl * 0.2); ctx.stroke();
  }
  function spriteBox(w, h, k) {   // animal / home sprite: box size + centre; the small one shares the ground line
    var T = topFace(w, h), sz = Math.min(0.78 * w, 0.84 * T.h), ground = T.cy + 0.43 * sz;
    return { size: sz * k, y: ground - 0.43 * sz * k, ground: ground, full: sz };
  }
  function paintFace(ctx, w, h, face) {
    var T = topFace(w, h), parity = parityOf(face), kind = face.kind, k = face.scale == null ? 1 : +face.scale;
    var cb = 0.62 * w;
    ctx.save();
    ctx.translate(0, T.cy);
    if (kind === 'parity') kind = face.dots || face.show === 'dots' || face.as === 'dots' ? 'dots' : 'number';
    var inset = parity ? 0.86 : 1;
    if (kind !== 'animal' && kind !== 'home') ctx.scale(k * inset, k * inset);
    switch (kind) {
      case 'color':
        drawFish(ctx, face.color || face.value, 0.8 * w, 0);
        break;
      case 'shape': {
        var sh = GEO[face.shape || face.value] ? (face.shape || face.value) : 'circle', G = geo(sh);
        var ls = Math.min(cb * ({ rect: 1.18, square: 1.05, star: 0.98, triangle: 0.98, heart: 1.0 }[sh] || 1.04), (0.82 * T.h) / (G.bot - G.top + 0.15));
        ctx.translate(0, -(G.top + G.bot + 0.13) / 2 * ls);   // centre shape + base
        drawSculpture(ctx, sh, face.color || 'red', ls, 0);
        break;
      }
      case 'dots':
        drawDots(ctx, face.n != null ? face.n : +face.value, 0.8 * w, 0.8 * T.h);
        break;
      case 'animal': case 'home':
        ctx.restore(); ctx.save();
        var A = spriteBox(w, h, kind === 'home' ? 1 : k);
        ell(ctx, 0, A.ground - 0.02 * A.full, 0.3 * A.full * (kind === 'home' ? 1 : k), 0.05 * A.full * Math.max(0.7, k), 0);
        ctx.fillStyle = 'rgba(40,100,140,0.16)'; ctx.fill();
        break;
      default: { // number, letter, text
        var str = String(face.text != null ? face.text : face.value != null ? face.value : face.n);
        var isText = kind === 'text' || str.length > 2;
        var px = isText ? 0.32 * T.h : str.length === 2 ? 0.56 * T.h : 0.7 * T.h;
        px = fitFont(ctx, str, w * (isText ? 0.8 : 0.72), Math.round(px), 800);
        var ow = Math.max(2, px * 0.12);
        centredText(ctx, str, 0.03 * px, 0.04 * px, ICE.inkShadow);
        centredText(ctx, str, 0, 0, ICE.ink, 'rgba(255,255,255,0.95)', ow);
        centredText(ctx, str, 0, 0, ICE.ink);
      }
    }
    ctx.restore();
    // frozen-in tint (only on what was drawn)
    var op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(70,140,195,' + TINT + ')'; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.globalCompositeOperation = op;
    if (parity) paintParityRim(ctx, w, h, parity);
  }

  // ---------------------------------------------------------------- offscreen cache
  var cache = {}, cacheN = 0, CACHE_MAX = 200;
  function makeCanvas(wpx, hpx) {
    // a DOM canvas first (works on every iOS Safari), OffscreenCanvas only without a document (worker / tests)
    if (typeof document !== 'undefined' && document.createElement) { var c = document.createElement('canvas'); c.width = wpx; c.height = hpx; return c; }
    if (typeof OffscreenCanvas !== 'undefined') { try { return new OffscreenCanvas(wpx, hpx); } catch (e) { /* none */ } }
    return null;
  }
  function ctxScale(ctx) {   // device scale from the transform's Y axis (a scaleX squash never changes the bucket)
    try { if (ctx.getTransform) { var m = ctx.getTransform(); var s = Math.sqrt(m.c * m.c + m.d * m.d); if (s > 0) return s; } } catch (e) { /* ignore */ }
    return (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  }
  function faceSig(f) {
    if (!f) return 'none';
    return [f.kind, (f.kind === 'animal' || f.kind === 'home') ? '' : f.value, f.color, f.shape, f.n, f.text,
      f.scale, parityOf(f), f.dots || f.show || f.as].join('|');
  }
  function cached(ctx, id, w, h, painter) {
    var dpr = clamp(Math.ceil(ctxScale(ctx) * 2) / 2, 1, 3);
    var W = Math.max(8, Math.round(w / 2) * 2), H = Math.max(8, Math.round(h / 2) * 2);
    var key = id + '@' + W + 'x' + H + '@' + dpr, e = cache[key];
    if (!e) {
      var pad = 2, cv = makeCanvas(Math.ceil((W + 2 * pad) * dpr), Math.ceil((H + 2 * pad) * dpr));
      var c = cv && cv.getContext && cv.getContext('2d');
      if (!c) { painter(ctx, w, h); return; }
      c.setTransform(dpr, 0, 0, dpr, (W / 2 + pad) * dpr, (H / 2 + pad) * dpr);
      painter(c, W, H);
      if (cacheN >= CACHE_MAX) { cache = {}; cacheN = 0; }
      e = cache[key] = { cv: cv, W: W, H: H, pad: pad };
      cacheN++;
    }
    var kx = w / e.W, ky = h / e.H;
    ctx.drawImage(e.cv, (-e.W / 2 - e.pad) * kx, (-e.H / 2 - e.pad) * ky, (e.W + 2 * e.pad) * kx, (e.H + 2 * e.pad) * ky);
  }

  // ---------------------------------------------------------------- public block calls
  function drawGlow(ctx, w, h, glow, color) {
    glow = clamp(+glow || 0, 0, 1);
    if (glow < 0.01) return;
    var c = color || '#FFE07A', r = radiusOf(w);
    ctx.save();
    for (var i = 4; i >= 1; i--) {
      var e = i * 0.035 * w;
      rrPath(ctx, -w / 2 - e, -h / 2 - e, w + 2 * e, h + 2 * e, r + e);
      ctx.fillStyle = rgba(c, 0.15 * glow * (1.25 - i * 0.2)); ctx.fill();
    }
    rrPath(ctx, -w / 2 - 0.02 * w, -h / 2 - 0.02 * w, w + 0.04 * w, h + 0.04 * w, r + 0.02 * w);
    ctx.lineWidth = Math.max(2, 0.035 * w); ctx.strokeStyle = rgba(mix(c, '#FFFFFF', 0.4), 0.95 * glow); ctx.stroke();
    ctx.restore();
  }
  function begin(ctx, w, h, opt) {
    ctx.save();
    if (opt && opt.alpha != null && opt.alpha < 1) ctx.globalAlpha *= Math.max(0, opt.alpha);
    if (opt && opt.glow) drawGlow(ctx, w, h, opt.glow, opt.glowColor);
  }
  function drawBlock(ctx, w, h, opt) { begin(ctx, w, h, opt); cached(ctx, 'block', w, h, paintBlock); ctx.restore(); }
  function drawGlaze(ctx, w, h) { cached(ctx, 'glaze', w, h, paintGlaze); }
  function drawFace(ctx, w, h, face, opt) {
    face = face || { kind: 'number', value: '?' };
    cached(ctx, 'f:' + faceSig(face), w, h, function (c, W, H) { paintFace(c, W, H, face); });
    if ((face.kind === 'animal' || face.kind === 'home') && opt && typeof opt.sprite === 'function') {
      var home = face.kind === 'home', A = spriteBox(w, h, home ? 1 : (face.scale == null ? 1 : +face.scale));
      var name = face.sprite || (home ? 'home_' + face.value : face.value);
      opt.sprite(name, 0, A.y, A.size);
    }
  }
  function drawBack(ctx, w, h, opt) {
    begin(ctx, w, h, opt);
    cached(ctx, 'back', w, h, function (c, W, H) { paintBlock(c, W, H); paintFrost(c, W, H); });
    ctx.restore();
  }
  function drawFront(ctx, w, h, face, opt) {
    begin(ctx, w, h, opt);
    cached(ctx, 'block', w, h, paintBlock);
    drawFace(ctx, w, h, face, opt);
    drawGlaze(ctx, w, h);
    ctx.restore();
  }
  function drawIce(ctx, w, h, face, frost, opt) {
    opt = opt || {};
    frost = clamp(frost == null ? 1 : +frost, 0, 1);
    var crack = clamp(+opt.crack || 0, 0, 1);
    if (frost >= 0.998 && crack <= 0.001) { drawBack(ctx, w, h, opt); return; }
    drawFront(ctx, w, h, face, opt);
    ctx.save();
    if (opt.alpha != null && opt.alpha < 1) ctx.globalAlpha *= Math.max(0, opt.alpha);
    drawFrost(ctx, w, h, frost, crack, opt.seed);
    ctx.restore();
  }
  function drawCard(ctx, w, h, face, flip, opt) { drawIce(ctx, w, h, face, 1 - clamp(+flip || 0, 0, 1), opt); }

  // Dee-era aliases
  function drawButterfly(ctx, color, size, flap) { drawFish(ctx, color, size, flap || 0); }
  function drawAcorn(ctx, size, opt) { drawFish(ctx, (opt && opt.color) || DOT_FISH, size * 1.3, 0); }

  IM.IceArt = {
    COLORS: COLORS, SHAPES: SHAPES, ICE: ICE, FONT: FONT, GLAZE: GLAZE, DOT_LAYOUTS: DOTS,
    sideOf: sideOf, topFace: topFace, radiusOf: radiusOf,
    drawBlock: drawBlock, drawFrost: drawFrost, drawFace: drawFace, drawGlaze: drawGlaze,
    drawBack: drawBack, drawFront: drawFront, drawIce: drawIce, drawCard: drawCard,
    drawGlow: drawGlow, drawCardGlow: drawGlow,
    drawFish: drawFish, drawSculpture: drawSculpture, sculptureTop: sculptureTop, sculptureBottom: sculptureBottom,
    drawStar: drawStar, drawShard: drawShard, drawHole: drawHole, traceShape: traceShape,
    drawButterfly: drawButterfly, drawLantern: drawSculpture, lanternTop: sculptureTop, drawAcorn: drawAcorn,
    clearCache: function () { cache = {}; cacheN = 0; crackCache = {}; },
    _contrast: contrast, _mix: mix, _faceSig: faceSig, _cacheSize: function () { return cacheN; },
    _crackLines: crackLines, _holePoints: holePoints, STAR_INK: STAR_INK
  };
  IM.CardArt = IM.IceArt;
})(typeof window !== 'undefined' ? (window.IM = window.IM || {}) : (globalThis.IM = globalThis.IM || {}));
