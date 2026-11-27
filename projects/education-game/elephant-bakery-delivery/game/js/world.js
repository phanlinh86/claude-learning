/* Tupi's Bakery Delivery — BD.CONFIG + BD.World + BD.WindModel + BD.Roads (headless, deterministic road-map delivery simulation;
 * DESIGN §2, §5.2). Full render contract, events and API deviations: docs/MECHANICS.md.
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. Screen space = world space (no camera).
 *  update(dt) runs fixed sub-steps of cfg.step (1/120 s). At the START of every sub-step each moving field is copied into its `_p`
 *  twin; render v = _v + (v − _v)·w.alpha.
 *
 *  ROADS w.roads = { key, seed, S (house width used), ok, loose, forks (1|2 built), cart {left,right,up,down,half,k} + cartK + cartS + hitR
 *    (the cart is scaled with this map's houses), houses {id: {x, y, side, stop, q}}, nodes [{id 'root'|'f1'|'f2'|houseId, kind, x, y}], edges [{id 'trunk'|'mid'|
 *    'to_<houseId>', kind 'trunk'|'mid'|'branch', from, to (node ids), parent (edge id | null), children [edge ids], house (id | null),
 *    pts [[x, y] … every ≈ 8 px], cum [arc length per point], len, d0 (arc distance of pts[0] from the root), bumps [s …], stopS (branch:
 *    where the cart parks)}], start {x, y, edge, s}, door {x, y} (the bakery door = the root), maxDist, routeLen {houseId: px} }
 *  CART w.cart = { x, y (GROUND point, on the road centre line), edge, s, vel (px/s along the edge, signed), spd, dir {x, y},
 *    face ±1, faceS −1..1, hop (px, the squash-flip hop), lean (rad, in the art's own facing-RIGHT frame: rotate after the faceS mirror;
 *    < 0 = nose up), bounce (px UP), wheelRot (rad), squash (> 0 squashed: sy = 1 − squash, sx = 1 + 0.5·squash), sx, sy, k (px per
 *    art unit), alpha, state 'hidden'|'rollout'|'wait'|'drag'|'coast'|'auto'|'arrive'|'reverse'|'return'|'home', cargo (thing | null),
 *    cargoCount (cookies landed so far), cargoHop (px) }  + _px _py _plean _pbounce _pfaceS _phop _pwheelRot _psquash _palpha _pcargoHop
 * ========================================================================
 */
(function (BD) {
  'use strict';

  var CONFIG = {
    // ---- timing / state machine (s)
    step: 1 / 120, maxFrame: 1.0,
    roundsPerLevel: 4, chapterTimeLimit: 75, chapterMinRounds: 3,
    shortBudget: [1e9, 32, 50, 58],   // s into the chapter: a round starting later than this is short (2 houses × 1 delivery)
    introTime: 2.5, levelDoneTime: 3.6,
    talkAfterAnswer: 1.6, talkAskTime: 12, talkGlowAfterAsks: 2, talkMaxAsks: 3, talkGiveUp: 2,

    // ---- layout (DESIGN §2; px)
    shortSide: 720, minLong: 960, maxLong: 1600, tallRatio: 1.6, phoneRatio: 1.9, compactRatio: 1.6,
    bubbleX: 24, bubbleYLand: 18, bubbleMaxW: 700, bubbleRight: 200, bubbleHLand: 134, bubbleYPort: 110, bubbleHPort: 124,
    hudW: 160, hudH: 96, bubbleMinW: 220, bandGap: 12, bottomLand: 6, bottomPort: 10,
    wallLand: 0.30, wallPort: 0.20,
    houseS: { 3: 170, 4: 170, 5: 156, 6: 146, 7: 146 }, houseMin: 128, houseStep: 6, houseH: 0.95, houseTop: 1.02,
    roadW: { 3: 78, 4: 78, 5: 68, 6: 68, 7: 68 }, roadPhone: 1.05, roadCompact: 0.88,
    cartK: 1.05, hitK: 0.6, hitPad: 14, hitMin: 100, houseHitPad: 30, houseHitUp: 60, roadHitPad: 26,
    bakeryK: 1.1, bakeryCompactK: 0.82, bakeryAspect: 240 / 260, bakeryEdge: 20,
    houseKeep: 24, houseKeepLoose: 12, roadKeep: 8, bakeryPortK: 0.2, houseGap: 24, cartKeep: 6, cartEdge: 4, roadEdge: 6, roadHouse: 8,
    sample: 8, sepGap: 40, sepLoose: 16, forkFree: 160, minRouteK: 0.55, forkSpread: 0.9, fanDirect: 0.25, wiggle: 0.14,
    mapTries: 26, mapTriesRoute: 16, mapTriesLast: 60, parkK: 0.55, straightK: 0.2, turnBulge: 46, laneMin: 180, laneK: 1.25, laneShort: 130, max4Width: 1000, splitRoom: 180, rowTurn: 60, maxTurn: 0.5,

    // ---- cart motion (DESIGN §5.2)
    vDrag: 900, kApproach: 9, vAuto: 520, vReturn: 700, vReverse: 380, vRollOut: 320, accel: 2600, brakeTime: 0.15, autoDecel: 2600,
    coastDecel: 2600, leanAcc: 3.2e-5, leanCurve: 5.5e-5, leanMax: 0.16, leanOmega: 12, leanZeta: 0.5,
    bounceOmega: 18, bounceZeta: 0.3, bumpEvery: 140, bumpPeak: 6, cargoOmega: 14, cargoZeta: 0.25,
    faceTime: 0.18, faceHop: 8, faceMinX: 0.3, sqOmega: 16, sqZeta: 0.35, brakeSq: 0.1, bumpSq: 0.06,
    grabHyst: 18, projectR: 140, tapMovePx: 24, tapTime: 0.35, autoRollFrac: 0.8, arriveTol: 6,
    dustSpeed: 260, dustEvery: 0.07, puffCap: 30, driveOn: 40, driveOff: 10,

    // ---- phases
    revealTime: 1.0, buildTime: 1.6, housePop: 0.35, rollOutAt: 0.45,
    loadTime: 0.9, loadArc: 0.5, loadAt: 0.15, countLoad0: 0.6, countStep: 0.45,
    rightTime: 2.1, doorOpen: [0.12, 0.42], deliverAt: 0.35, deliverArc: 0.5, friendPop: 0.3, heartsAt: 0.95, heartsN: 3, heartsGap: 0.18,
    doorClose: [1.75, 2.05], litTime: 0.4,
    wrongTime: 1.1, wrongCrack: 0.25, wrongPeek: [0.2, 0.9],
    partyTime: 2.4, honkTime: 0.6, sprayEnd: 2.0, sprinkleRate: 48, sprinkleCap: 80, sprinkleG: 900, sprinkleV: [380, 560],
    sprinkleAng: -1.22, sprinkleSpread: 0.32, sprinkleLife: 0.55,
    wipeTime: 1.3, wipeSwap: 0.5, wipeBuild: 0.75,

    // ---- help (DESIGN §5.2 / skill rules)
    hintAfterMisses: 2, hintAfterSoft: 3, assistAfter: 5, assistAfterMisses: 3, hintTime: 5, hintCooldown: 6, hintCycle: 1.6, hintDrags: 2,
    idleTime: 12, idleBackoff: 1.5, idleMax: 30, idleHintFrom: 2, demoDelay: 0.6,

    // ---- surprises: one round per chapter (round 1 or 2, never the warm-up); chapters 0–2 rotate mouse / bird, winter = snow
    surpriseRounds: [1, 2], surpriseTypes: ['mouse', 'bird'], winterSurprise: 'snow', winterLevel: 3, surpriseAt: [2, 5],
    mouseStay: 10, mousePeek: 0.4, mouseWave: 0.8, mouseR: 62, mouseGap: 90, mouseS: 0.7,
    birdStay: 12, birdIn: 0.5, birdSing: 1.2, birdR: 58, birdS: 0.8,
    snowN: 5, snowR: 36, snowV: 42, snowFall: 12, snowStagger: 0.7, snowTwinkle: 0.5,

    // ---- wind (BD.WindModel): px/s² horizontal force
    breeze: [6, 6, 8, 10], gustEvery: [6, 10], gustFirst: [3, 6], gustAmp: [40, 60], gustTime: 1.5,

    // ---- Tupi
    moodTime: { happy: 0.9, cheer: 1.6, oops: 0.8, think: 1.4, talk: 1.0, wave: 1.4, giggle: 1.0, honk: 0.6, spray: 1.4, hand: 0.9 },
    blink: [2.2, 5], blinkTime: 0.13
  };
  BD.CONFIG = CONFIG;

  var TAU = Math.PI * 2;
  var TP_DEFAULT = { seat: [150, 250], trunkTip: [262, 70], trunkHold: [270, 190], mouth: [214, 168], box: [40, 30, 280, 255],
    cart: { ground: [170, 232], seat: [150, 150], wheels: [[90, 200, 34], [255, 200, 34]], tray: [60, 140], box: [10, 20, 330, 236] } };
  var FRIENDS = ['cow', 'pig', 'sheep', 'duck', 'hen', 'horse', 'goat'];
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function easeOut(u) { u = clamp(u, 0, 1); return 1 - (1 - u) * (1 - u); }
  function backOut(u) { u = clamp(u, 0, 1); var c = 1.70158; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); }
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; if (b) for (k in b) o[k] = b[k]; return o; }
  function insOf(ins) { return { top: +(ins && ins.top) || 0, right: +(ins && ins.right) || 0, bottom: +(ins && ins.bottom) || 0, left: +(ins && ins.left) || 0 }; }
  function keepBoxes(hk) {
    var a = Array.isArray(hk) ? hk : hk ? [hk] : [], out = [];
    for (var i = 0; i < a.length; i++) { var b = a[i]; if (b && b.w > 0 && b.h > 0) out.push({ x: +b.x, y: +b.y, w: +b.w, h: +b.h }); }
    return out;
  }
  function inBox(b, x, y, pad) { pad = pad || 0; return x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad; }
  /** Distance from a point to a box {x0, y0, x1, y1} (0 inside). */
  function boxDist(b, x, y) { var dx = Math.max(b.x0 - x, 0, x - b.x1), dy = Math.max(b.y0 - y, 0, y - b.y1); return hyp(dx, dy); }
  function boxesGap(a, b) { var dx = Math.max(b.x0 - a.x1, a.x0 - b.x1, 0), dy = Math.max(b.y0 - a.y1, a.y0 - b.y1, 0); return dx > 0 || dy > 0 ? hyp(dx, dy) : -1; }
  function rectOverlap(a, b, pad) { pad = pad || 0; return a.x0 < b.x + b.w + pad && a.x1 > b.x - pad && a.y0 < b.y + b.h + pad && a.y1 > b.y - pad; }
  /** Initial velocity that gives a damped spring (ω, ζ) released from 0 a first peak of `peak`. */
  function kickFor(peak, w, z) { var s = Math.sqrt(1 - z * z); return peak * w * Math.exp(z / s * Math.atan2(s, z)); }
  function spring(o, k, kv, target, w, z, h) { o[kv] += (w * w * (target - o[k]) - 2 * z * w * o[kv]) * h; o[k] += o[kv] * h; }
  function okPt(a, n) { return Array.isArray(a) && a.length >= n && a.slice(0, n).every(function (v) { return typeof v === 'number' && isFinite(v); }); }
  /** BD.TUPI_POINTS (character artist A) with sensible defaults for anything missing. */
  var _tpSrc = null, _tp = null;
  function tupiPoints() {
    if (_tp && _tpSrc === (BD.TUPI_POINTS || null)) return _tp;
    _tpSrc = BD.TUPI_POINTS || null;
    return (_tp = readTupiPoints());
  }
  function readTupiPoints() {
    var p = BD.TUPI_POINTS || {}, d = TP_DEFAULT, c = p.cart || {}, dc = d.cart;
    var wh = Array.isArray(c.wheels) && c.wheels.length >= 1 && c.wheels.every(function (q) { return okPt(q, 3); }) ? c.wheels : dc.wheels;
    return { seat: okPt(p.seat, 2) ? p.seat : d.seat, trunkTip: okPt(p.trunkTip, 2) ? p.trunkTip : d.trunkTip, trunkHold: okPt(p.trunkHold, 2) ? p.trunkHold : d.trunkHold,
      mouth: okPt(p.mouth, 2) ? p.mouth : d.mouth, box: okPt(p.box, 4) ? p.box : d.box,
      cart: { ground: okPt(c.ground, 2) ? c.ground : dc.ground, seat: okPt(c.seat, 2) ? c.seat : dc.seat, wheels: wh, tray: okPt(c.tray, 2) ? c.tray : dc.tray,
        box: okPt(c.box, 4) ? c.box : compositeBox(p, d) } };
  }
  /** The composed cart + Tupi box in cart coords when the artist's file gives none. */
  function compositeBox(p, d) {
    var cs = (p.cart && okPt(p.cart.seat, 2) ? p.cart.seat : d.cart.seat), ts = okPt(p.seat, 2) ? p.seat : d.seat, tb = okPt(p.box, 4) ? p.box : d.box, cb = d.cart.box;
    var ox = cs[0] - ts[0], oy = cs[1] - ts[1];
    return [Math.min(cb[0], tb[0] + ox), Math.min(cb[1], tb[1] + oy), Math.max(cb[2], tb[2] + ox), Math.max(cb[3], tb[3] + oy)];
  }

  /** DESIGN §2 short-side rule: CSS viewport → logical W×H. */
  function logicalSize(cssW, cssH, cfg) {
    cfg = cfg || CONFIG;
    var S = cfg.shortSide, aspect = cssW / Math.max(1, cssH);
    if (cssW >= cssH) return { W: clamp(Math.round(S * aspect), cfg.minLong, cfg.maxLong), H: S };
    return { W: S, H: clamp(Math.round(S / aspect), cfg.minLong, cfg.maxLong) };
  }
  function ageKey(age) { return clamp(Math.round(+age || 4), 3, 7); }

  /* ---------------------------------------------------------------- wind (DESIGN §5.3) */
  function WindModel(seed, cfg) {
    this.cfg = cfg || CONFIG; this.rng = new BD.RNG(seed === undefined ? 5 : seed);
    this.t = 0; this.wind = 0; this.gust = 0; this.gustDir = 0; this.season = -1;
    this._next = 1e9; this._gT = -1; this._gA = 0; this.ph = this.rng.float(0, TAU); this.events = [];
  }
  WindModel.prototype.step = function (h, season) {
    var c = this.cfg, s = ((season | 0) % 4 + 4) % 4;
    if (s !== this.season) { this.season = s; this._gT = -1; this.gust = 0; this._next = s === 2 ? this.rng.float(c.gustFirst[0], c.gustFirst[1]) : 1e9; }
    this.t += h;
    var amp = c.breeze[s], t = this.t;
    var base = amp * Math.sin(TAU * t / 11 + this.ph) * (0.65 + 0.35 * Math.sin(TAU * t / 4.3 + 2 * this.ph));
    if (s === 2) {
      this._next -= h;
      if (this._gT < 0 && this._next <= 0) {
        this._gT = 0; this.gustDir = this.rng.sign(); this._gA = this.rng.float(c.gustAmp[0], c.gustAmp[1]);
        this._next = this.rng.float(c.gustEvery[0], c.gustEvery[1]);
        this.events.push({ type: 'gust', dir: this.gustDir });
      }
      if (this._gT >= 0) {
        this._gT += h;
        var u = this._gT / c.gustTime, e = Math.sin(Math.PI * clamp(u, 0, 1));
        this.gust = e * e;
        if (u >= 1) { this._gT = -1; this.gust = 0; }
      }
    }
    this.wind = base + this.gustDir * this._gA * this.gust;
    return this.wind;
  };
  WindModel.prototype.drain = function () { var e = this.events; this.events = []; return e; };

  /* ---------------------------------------------------------------- layout (DESIGN §2) */
  function hudBox(hk, W, H) { var best = null; for (var i = 0; i < hk.length; i++) { var b = hk[i]; if (b.x + b.w / 2 > W / 2 && b.y < H / 2 && (!best || b.y + b.h > best.y + best.h)) best = b; } return best; }
  /** The cart's drawn extent around its ground point at scale k: {left, right, up, half (max of left / right), k}. */
  function cartExtent(k) { var T = tupiPoints(), b = T.cart.box, g = T.cart.ground; return { left: (g[0] - b[0]) * k, right: (b[2] - g[0]) * k, up: (g[1] - b[1]) * k, down: Math.max(0, b[3] - g[1]) * k, half: Math.max(g[0] - b[0], b[2] - g[0]) * k, k: k }; }
  function computeLayout(W, H, ins, cfg, age, hudKeep) {
    ins = insOf(ins);
    var a = ageKey(age), portrait = H > W, tall = H / W > cfg.tallRatio, phone = (portrait ? H / W : W / H) > cfg.phoneRatio;
    var compact = portrait && (H - ins.top - ins.bottom) / W < cfg.compactRatio;
    var hk = keepBoxes(hudKeep), hb = hudBox(hk, W, H), bx = ins.left + cfg.bubbleX, bubble;
    if (compact) bubble = { x: bx, y: ins.top + cfg.bubbleYLand, w: W - ins.right - cfg.hudW - 12 - bx, h: cfg.bubbleHPort };
    else if (portrait) bubble = { x: bx, y: ins.top + cfg.bubbleYPort, w: W - bx - ins.right - cfg.bubbleX, h: cfg.bubbleHPort };
    else bubble = { x: bx, y: ins.top + cfg.bubbleYLand, w: Math.min(cfg.bubbleMaxW, W - ins.right - cfg.bubbleRight - bx), h: cfg.bubbleHLand };
    if (hb && bubble.x + bubble.w > hb.x - 10 && bubble.y < hb.y + hb.h) {   // the measured HUD: narrower beside it, else below
      var room = hb.x - 12 - bubble.x;
      if ((!portrait || compact) && room >= cfg.bubbleMinW) bubble.w = room;
      else bubble.y = Math.max(bubble.y, hb.y + hb.h + 8);
    }
    bubble.w = Math.max(0, bubble.w);
    var hud = { x: W - ins.right - cfg.hudW, y: 0, w: cfg.hudW + ins.right, h: ins.top + cfg.hudH };
    var band = bubble.y + bubble.h;
    if (portrait) band = Math.max(band, hud.y + hud.h);
    var wallH = Math.round((portrait ? cfg.wallPort : cfg.wallLand) * H);
    var wall = { x: 0, y: 0, w: W, h: wallH }, table = { x: 0, y: wallH, w: W, h: H - wallH };
    var play = { x0: ins.left, y0: Math.max(table.y, band + cfg.bandGap, ins.top), x1: W - ins.right, y1: H - ins.bottom - (portrait ? cfg.bottomPort : cfg.bottomLand) };
    var houseS = cfg.houseS[a], roadW = Math.round(cfg.roadW[a] * (phone ? cfg.roadPhone : compact ? cfg.roadCompact : 1));
    var T = tupiPoints(), cb = T.cart.box, cartS = cfg.cartK * houseS, k = cartS / (cb[2] - cb[0]), ext = cartExtent(k);
    var hitR = Math.max(cfg.hitMin, cfg.hitK * cartS + cfg.hitPad);
    var L = { W: W, H: H, ins: ins, portrait: portrait, tall: tall, phone: phone, compact: compact, age: a,
      bubble: bubble, hud: hud, wall: wall, table: table, play: play, houseS: houseS, houseH: cfg.houseH * houseS, roadW: roadW,
      cartS: cartS, cartK: k, cart: ext, hitR: hitR,
      flow: portrait ? { x: 0, y: -1 } : { x: 1, y: 0 }, across: portrait ? { x: 1, y: 0 } : { x: 0, y: 1 },
      safe: { x: ins.left, y: ins.top, w: W - ins.left - ins.right, h: H - ins.bottom - ins.top } };
    L.keep = [{ x: bubble.x, y: bubble.y, w: bubble.w, h: bubble.h, kind: 'bubble' }, { x: hud.x, y: hud.y, w: hud.w, h: hud.h, kind: 'hud' }];
    hk.forEach(function (b) { b.kind = 'hudKeep'; L.keep.push(b); });
    L.hudKeep = hk;
    // the bakery (start building) + its door (the road's root) + the cart's waiting point
    var bw = (compact ? cfg.bakeryCompactK : cfg.bakeryK) * houseS, bh = bw * cfg.bakeryAspect, door, bxl;
    if (!portrait) {
      bxl = ins.left + cfg.bakeryEdge;
      var cy = (play.y0 + play.y1) / 2, by = cy + bh / 2;
      var top = play.y0;   // the bakery top + the cart at its start stay clear of the bubble / HUD over them
      L.keep.forEach(function (q) { if (q.y + q.h / 2 < H / 2 && q.x < bxl + bw + 2 * ext.half + 60 && q.x + q.w > bxl) top = Math.max(top, q.y + q.h + 8); });
      by = Math.max(by, top + Math.max(bh, ext.up + cfg.cartKeep));
      by = Math.min(by, play.y1 - roadW / 2 - cfg.roadEdge);
      door = { x: bxl + bw / 2, y: by };
    } else {
      var dy = play.y1 - roadW / 2 - cfg.roadEdge;
      bxl = ins.left + cfg.bakeryEdge + (compact ? 0 : cfg.bakeryPortK) * (W - ins.left - ins.right - 2 * cfg.bakeryEdge - bw);
      door = { x: bxl + bw / 2, y: dy };
    }
    L.bakery = { x: bxl, y: door.y - bh, w: bw, h: bh };
    L.door = door;
    L.oven = { x: door.x, y: door.y - 0.55 * bh };
    L.startS = bw / 2 + ext.left + 8;
    L.start = { x: door.x + L.startS, y: door.y };
    L.diag = hyp(play.x1 - play.x0, play.y1 - play.y0);
    L.fits = true;
    return L;
  }

  /* ---------------------------------------------------------------- road tree (BD.Roads) */
  function unit(x, y) { var d = hyp(x, y) || 1; return { x: x / d, y: y / d }; }
  function rot(v, a) { var c = Math.cos(a), s = Math.sin(a); return { x: v.x * c - v.y * s, y: v.x * s + v.y * c }; }
  /** Dense points of a tangent-continuous curve through waypoints wp[i] with unit tangents tg[i] (cubic Hermite / Bézier pieces). */
  function curvePts(wp, tg) {
    var out = [[wp[0].x, wp[0].y]];
    for (var i = 0; i < wp.length - 1; i++) {
      var a = wp[i], b = wp[i + 1], d = hyp(b.x - a.x, b.y - a.y), h = 0.38 * d;
      var p1 = { x: a.x + tg[i].x * h, y: a.y + tg[i].y * h }, p2 = { x: b.x - tg[i + 1].x * h, y: b.y - tg[i + 1].y * h };
      var n = Math.max(4, Math.ceil(d / 3));
      for (var j = 1; j <= n; j++) {
        var t = j / n, u = 1 - t;
        out.push([u * u * u * a.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * b.x, u * u * u * a.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * b.y]);
      }
    }
    return out;
  }
  /** Resample a dense polyline every `step` px (by arc length) → {pts, cum, len}. */
  function resample(dense, step) {
    dense = dense.filter(function (q) { return isFinite(q[0]) && isFinite(q[1]); });
    if (dense.length < 2) dense = [dense[0] || [0, 0], (dense[0] || [0, 0]).slice()];
    var cumD = [0], i;
    for (i = 1; i < dense.length; i++) cumD.push(cumD[i - 1] + hyp(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
    var len = cumD[cumD.length - 1], n = Math.max(1, Math.round(len / step)), pts = [], cum = [], j = 0;
    for (i = 0; i <= n; i++) {
      var s = len * i / n;
      while (j < cumD.length - 2 && cumD[j + 1] < s) j++;
      var seg = cumD[j + 1] - cumD[j], u = seg > 1e-9 ? (s - cumD[j]) / seg : 0;
      pts.push([lerp(dense[j][0], dense[j + 1][0], u), lerp(dense[j][1], dense[j + 1][1], u)]);
      cum.push(s);
    }
    return { pts: pts, cum: cum, len: len };
  }
  /** Position on an edge at arc length s → {x, y, tx, ty (unit tangent towards +s)}. */
  function edgeAt(e, s) {
    var P = e.pts, C = e.cum, n = P.length;
    if (n < 2) return { x: P[0][0], y: P[0][1], tx: 1, ty: 0 };
    s = clamp(s, 0, e.len);
    var lo = 0, hi = n - 1;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (C[m] <= s) lo = m; else hi = m; }
    var seg = C[hi] - C[lo], u = seg > 1e-9 ? (s - C[lo]) / seg : 0, t = unit(P[hi][0] - P[lo][0], P[hi][1] - P[lo][1]);
    return { x: lerp(P[lo][0], P[hi][0], u), y: lerp(P[lo][1], P[hi][1], u), tx: t.x, ty: t.y };
  }
  /** Signed curvature (rad / px; > 0 turning clockwise on screen) at s, from the tangents 12 px either side. */
  function edgeCurv(e, s) {
    var a = edgeAt(e, s - 12), b = edgeAt(e, s + 12), ds = Math.min(e.len, s + 12) - Math.max(0, s - 12);
    if (ds < 4) return 0;
    return Math.atan2(a.tx * b.ty - a.ty * b.tx, a.tx * b.tx + a.ty * b.ty) / ds;
  }

  /* The map for the current layout: houses (door points) + the road tree, from `seed` (rejection sampling: every rule of DESIGN §2 is
   * checked; the house width shrinks in 6 px steps to 128 when nothing fits; a last pass relaxes the gaps). Cached per layout + seed. */
  var _mapCache = {}, _mapN = 0, _cfgId = 0;
  function cfgKey(cfg) { if (!cfg.__id) Object.defineProperty(cfg, '__id', { value: ++_cfgId, enumerable: false }); return cfg.__id; }
  function layoutKey(L) { return L.W + 'x' + L.H + ':' + JSON.stringify(L.ins) + ':' + L.age + ':' + JSON.stringify(L.hudKeep || []); }
  function genMap(L, spec, seed, cfg) {
    var key = cfgKey(cfg) + '|' + layoutKey(L) + '|' + seed + '|' + spec.ids.join(',') + '|' + spec.forks;
    if (_mapCache[key]) return _mapCache[key];   // maps are never mutated: shared
    var best = null, S, t, m, rng = new BD.RNG((seed >>> 0) || 1), sizes = [];
    for (S = L.houseS; S >= cfg.houseMin - 1e-9; S -= cfg.houseStep) sizes.push(S);
    if (sizes[sizes.length - 1] > cfg.houseMin) sizes.push(cfg.houseMin);
    for (var pass = 0; pass < 2 && !(best && best.bad === 0); pass++) {
      var loose = pass === 1;
      for (var si = 0; si < sizes.length && !(best && best.bad === 0); si++) {
        for (t = 0; t < cfg.mapTries; t++) {
          m = tryMap(L, spec, sizes[si], rng, cfg, loose, t < cfg.mapTriesRoute && !loose, best ? best.bad : 60);
          if (m && (!best || m.bad < best.bad)) best = m;
          if (best && best.bad === 0) break;
        }
      }
    }
    for (t = 0; t < cfg.mapTriesLast && !(best && best.bad === 0); t++) {   // rare: a last series at the smallest houses, loose rules
      m = tryMap(L, spec, cfg.houseMin, rng, cfg, true, false, best ? best.bad : 60);
      if (m && (!best || m.bad < best.bad)) best = m;
    }
    if (spec.forks >= 2 && !(best && best.bad === 0)) {   // two forks do not fit this screen: one fork
      var one = genMap(L, { ids: spec.ids, forks: 1 }, seed, cfg);
      if (!best || one.bad < best.bad) best = one;
    }
    if (!best) best = tryMap(L, spec, cfg.houseMin, rng, cfg, true, false, 1e9, true);
    best.ok = best.bad === 0;
    best.key = key;
    best.seed = seed;
    delete best._rng;
    if (++_mapN > 200) { _mapCache = {}; _mapN = 0; }
    _mapCache[key] = best;
    return best;
  }
  /** One attempt. → map with `bad` = the number of broken rules (0 = valid) or null when the houses could not be placed. */
  /* ---- structured placement (one seeded pattern per attempt)
   * landscape: houses in up to 3 staggered columns at the right, the cart parks LEFT of each door; sorted top → bottom, a house to the
   *   right of the one above needs only `sep` px (its road passes under that house), any other order the full house height + road.
   * portrait: rows of 1–2 houses (bottom → top); a row of 2 parks outward (roads rise along the screen sides), upper rows' roads rise
   *   through the free passages of the rows below. → [{id, x, y, side}] + per-house waypoints, or null. */
  function placeHouses(L, spec, S, rng, cfg, g) {
    var n = spec.ids.length, ins = L.ins, P = L.play, rw = g.rw, hTop = g.hTop, keepG = g.keepG, ext = g.ext, i, j;
    var ids = rng.shuffle(spec.ids.slice()), out = [];
    function topMin(x0, x1) {   // the lowest box top allowed over [x0, x1] (bubble / HUD / measured keeps + gap, the safe top)
      var t = ins.top + keepG;
      L.keep.forEach(function (q) { if (q.x < x1 + keepG && q.x + q.w > x0 - keepG) t = Math.max(t, q.y + q.h + keepG); });
      return t;
    }
    function cartTop(x) { var t = ins.top + cfg.cartEdge; L.keep.forEach(function (q) { if (q.x < x + ext.half + cfg.cartKeep && q.x + q.w > x - ext.half - cfg.cartKeep) t = Math.max(t, q.y + q.h + cfg.cartKeep); }); return t; }
    var yMax = P.y1 - rw / 2 - cfg.roadEdge, yRoadMin = P.y0 + rw / 2 + cfg.roadEdge;
    if (!L.portrait) {
      var nc = Math.min(3, n), xs = [], xR = L.W - ins.right - keepG - S / 2 - rng.float(0, 16);
      for (var c = 0; c < nc; c++) xs.push(xR - c * (S + cfg.houseGap) - (c ? rng.float(0, 26) : 0));
      var cheap = Math.max(g.sep, ext.up - 0.3 * S + 4, rw / 2 + cfg.roadHouse + 4), dear = hTop + rw / 2 + cfg.roadHouse + 4;
      var yTop = function (x) { return Math.max(yRoadMin, topMin(x - S / 2, x + S / 2) + hTop, cartTop(x - g.park) + ext.up); };
      // every column sequence (top → bottom); keep the ones that fit, prefer fewer columns, pick one at random
      var seqs = [], seq = [];
      (function rec(k) {
        if (k === n) { seqs.push(seq.slice()); return; }
        for (var q = 0; q < nc; q++) { seq.push(q); rec(k + 1); seq.pop(); }
      })(0);
      var fit = [];
      seqs.forEach(function (sq) {
        var y = yTop(xs[sq[0]]), mins = [y];
        for (var q = 1; q < sq.length; q++) { y = Math.max(y + (sq[q] < sq[q - 1] ? cheap : dear), yTop(xs[sq[q]])); mins.push(y); }
        var used = Math.max.apply(null, sq) + 1, room = xs[used - 1] - g.Lf - g.r1x;
        if (y <= yMax && room >= cfg.laneShort) fit.push({ sq: sq, mins: mins, slack: yMax - y, cols: used });
      });
      if (!fit.length) return null;
      var minCols = Math.min.apply(null, fit.map(function (f) { return f.cols; }));
      var pool = fit.filter(function (f) { return f.cols <= minCols + (rng.chance(0.35) ? 1 : 0); });
      var pick = rng.pick(pool), slack = pick.slack * rng.float(0.55, 1), w = [], ws = 0;
      for (i = 0; i <= n; i++) { w.push(rng.float(0.2, 1)); ws += w[i]; }
      var shift = 0;
      for (i = 0; i < n; i++) {
        shift += slack * w[i] / ws;
        var col = pick.sq[i], x = xs[col] + rng.float(-8, 8);
        out.push({ id: ids[i], x: x, y: pick.mins[i] + shift, side: -1, col: col });
      }
      // lanes: every branch reaches its house's height left of all the houses, then runs straight in
      var x0b = Math.min.apply(null, out.map(function (h) { return h.x - S / 2; })) - rw / 2 - cfg.roadHouse - 6;
      out.forEach(function (h) { h.wps = []; });   // lanes are set once the fork is known (tryMap)
      g.lane = Math.min(x0b, Math.min.apply(null, out.map(function (h) { return h.x - g.Lf; })));
      return out;
    }
    // ---- portrait: rows
    var pats = { 1: [[1]], 2: [[2], [1, 1]], 3: [[2, 1], [1, 2], [1, 1, 1]], 4: [[2, 2], [1, 2, 1], [2, 1, 1], [1, 1, 2], [1, 1, 1, 1]] }[n] || [[1]];
    var xLo = Math.max(ins.left + rw / 2 + cfg.roadEdge, ins.left + cfg.cartEdge + ext.half + 4), xHi = Math.min(L.W - ins.right - rw / 2 - cfg.roadEdge, L.W - ins.right - cfg.cartEdge - ext.half - 4);
    var forkY = L.door.y - 130, rowGap = hTop + rw / 2 + cfg.roadHouse + cfg.rowTurn, edgeL = ins.left + cfg.cartEdge + g.park + ext.half + 2, edgeR = L.W - ins.right - cfg.cartEdge - g.park - ext.half - 2;
    var order = rng.shuffle(pats.slice());
    for (var pi = 0; pi < order.length; pi++) {
      var pat = order[pi], rows = [], okP = true, k2 = 0, lastRight = false;
      for (var r = 0; r < pat.length && okP; r++) {
        var row = [];
        if (pat[r] === 2) {
          var xl = Math.max(xLo + g.Lf + cfg.turnBulge, edgeL, ins.left + keepG + S / 2) + rng.float(0, 14), xr = Math.min(xHi - g.Lf - cfg.turnBulge, edgeR, L.W - ins.right - keepG - S / 2) - rng.float(0, 14);
          if (xr - xl < S + Math.max(cfg.houseGap, rw + 2 * cfg.roadHouse + 4)) okP = false;
          row.push({ x: xl, side: -1 }, { x: xr, side: 1 });
        } else {
          // a single house sits left or right (alternating row to row) and parks towards its screen edge, so the roads of the
          // rows above rise through the middle; the lowest row parks away from the bakery
          var lo = Math.max(ins.left + keepG + S / 2, edgeL, xLo + g.Lf + cfg.turnBulge), hi = Math.min(L.W - ins.right - keepG - S / 2, edgeR, xHi - g.Lf - cfg.turnBulge);
          var rightHalf = r === 0 ? L.door.x < L.W / 2 : !lastRight;
          if (pat.length === 1) rightHalf = rng.chance(0.5);
          var sdd = rightHalf ? 1 : -1, xm = lo < hi ? lerp(lo, hi, rightHalf ? rng.float(0.62, 0.85) : rng.float(0.15, 0.38)) : L.W / 2;
          if (r === 0) sdd = L.door.x < L.W / 2 ? 1 : -1;
          lastRight = rightHalf;
          row.push({ x: xm, side: sdd });
        }
        rows.push(row); k2 += row.length;
      }
      if (!okP || k2 !== n) continue;
      // heights: the top row as high as allowed, then rowGap (+ slack) down to above the fork
      var yT = yRoadMin;
      rows.forEach(function (row) { row.forEach(function (h) { var stopX = h.x + h.side * g.park; yT = Math.max(yT, topMin(h.x - S / 2, h.x + S / 2) + hTop, cartTop(stopX) + ext.up); }); });
      var gaps = [];
      for (r = 1; r < rows.length; r++) gaps.push(rowGap + (rows[r].length === 2 && rows[r - 1].length === 2 ? cfg.splitRoom : 0));
      var need = yT + gaps.reduce(function (a, b) { return a + b; }, 0), bottomMax = Math.min(forkY - (rw / 2 + cfg.roadHouse + 100), L.bakery.y - rw / 2 - cfg.roadHouse - 1.3 * cfg.turnBulge - 40);
      if (need > bottomMax) continue;
      var sl = (bottomMax - need) * rng.float(0.3, 0.85), wsum = 0, wts = [];
      for (i = 0; i < rows.length; i++) { wts.push(rng.float(0.3, 1)); wsum += wts[i]; }
      var yRow = [], yy = yT + sl * wts[0] / wsum * 0.5;
      for (r = rows.length - 1; r >= 0; r--) { yRow[r] = yy; if (r > 0) yy += gaps[r - 1] + sl * wts[r] / wsum; }
      var idx = 0;
      out = [];
      for (r = 0; r < rows.length; r++) rows[r].forEach(function (h) { out.push({ id: ids[idx++], x: h.x, y: yRow[r] + rng.float(-6, 6), side: h.side, row: r }); });
      // passages: for each house, through every row below it (bottom → up): the free x interval closest to where it is going;
      // with one fork, roads sharing an interval get their own lanes in it (sep apart, ordered by destination) when it is wide enough
      var uses = {};
      out.forEach(function (h) {
        h.wps = []; h.passes = [];
        var qx = h.x + h.side * g.Lf;
        for (var r2 = 0; r2 < h.row; r2++) {
          var inRow = out.filter(function (o) { return o.row === r2; }), blocks = [];
          inRow.forEach(function (o) {
            blocks.push([o.x - S / 2 - rw / 2 - cfg.roadHouse - 4, o.x + S / 2 + rw / 2 + cfg.roadHouse + 4]);
            var rx = o.x + o.side * (g.Lf + cfg.turnBulge);   // its own road rises at its outer side: that side is taken up to the edge
            blocks.push(o.side < 0 ? [xLo - 1, Math.max(rx, o.x) + g.sep] : [Math.min(rx, o.x) - g.sep, xHi + 1]);
          });
          var free = [[xLo, xHi]];
          blocks.forEach(function (b2) {
            var nf = [];
            free.forEach(function (f) { if (b2[1] <= f[0] || b2[0] >= f[1]) nf.push(f); else { if (b2[0] > f[0]) nf.push([f[0], b2[0]]); if (b2[1] < f[1]) nf.push([b2[1], f[1]]); } });
            free = nf;
          });
          if (!free.length) { h.blocked = true; continue; }
          var best = null, bd = 1e9;
          free.forEach(function (f) { var d = Math.abs(clamp(qx, f[0], f[1]) - qx) + 0.25 * Math.abs((f[0] + f[1]) / 2 - qx); if (d < bd) { bd = d; best = f; } });
          var key2 = r2 + ':' + Math.round(best[0]);
          (uses[key2] = uses[key2] || []).push({ h: h, qx: qx });
          h.passes.push({ r: r2, iv: best, key: key2, y: inRow[0].y });
        }
      });
      out.forEach(function (h) {
        h.passes.forEach(function (ps) {
          var us = uses[ps.key].slice().sort(function (a2, b2) { return a2.qx - b2.qx; }), k3 = us.length, iv = ps.iv, c3 = (iv[0] + iv[1]) / 2, px;
          if (spec.forks < 2 && k3 > 1 && iv[1] - iv[0] >= (k3 - 1) * g.sep) px = c3 + (us.findIndex(function (u) { return u.h === h; }) - (k3 - 1) / 2) * g.sep;
          else px = c3;
          h.wps.push({ p: { x: px, y: ps.y + rw / 2 + 14 }, t: { x: 0, y: -1 }, kind: 'pass' });
          var ytp = ps.y - hTop - rw / 2 - 14;
          if (ytp - h.y >= 40) h.wps.push({ p: { x: px, y: ytp }, t: { x: 0, y: -1 }, kind: 'pass' });
        });
      });
      if (out.some(function (h) { return h.blocked; })) continue;
      if (spec.forks < 2) {   // one fork: two roads may not share a passage (they would run side by side)
        var used2 = {}, clash2 = false;
        out.forEach(function (h) { h.wps.forEach(function (w) { var k = Math.round(w.p.x) + ':' + Math.round(w.p.y); if (used2[k] && used2[k] !== h.id) clash2 = true; used2[k] = h.id; }); });
        if (clash2) continue;
      }
      // a house of the top row that comes up through a passage parks on the passage's side (its road turns straight in)
      var topRow = rows.length - 1;
      out.forEach(function (h) {
        if (h.row !== topRow || !h.wps.length || rows[topRow].length !== 1) return;
        var px = h.wps[h.wps.length - 1].p.x, need = g.Lf + cfg.turnBulge + 14;
        if (Math.abs(px - h.x) < need) {   // too close to turn in: move it sideways (staying on screen) so the road can
          var lo2 = Math.max(ins.left + keepG + S / 2, edgeL), hi2 = Math.min(L.W - ins.right - keepG - S / 2, edgeR);
          var xa = px + need + rng.float(0, 16), xb = px - need - rng.float(0, 16);
          if (h.x >= px && xa <= hi2) h.x = xa; else if (xb >= lo2) h.x = xb; else if (xa <= hi2) h.x = xa;
        }
        if (Math.abs(px - h.x) >= need - 1) h.side = px < h.x ? -1 : 1;
      });
      g.forkY = forkY;
      return out;
    }
    return null;
  }
  function tryMap(L, spec, S, rng, cfg, loose, needRoute, cap, force) {
    var n = spec.ids.length, F = L.flow, A = L.across, P = L.play, ins = L.ins, rw = L.roadW, i, j;
    // the cart is scaled with the houses of this map (1.05 × S); its start sits just outside the bakery door
    var cb0 = tupiPoints().cart.box, ck = cfg.cartK * S / (cb0[2] - cb0[0]), ext = cartExtent(ck);
    var startS = L.bakery.w / 2 + ext.left + 8;
    var hTop = cfg.houseTop * S, keepG = loose ? cfg.houseKeepLoose : cfg.houseKeep;
    var acr = function (p) { return p.x * A.x + p.y * A.y; };
    var park = cfg.parkK * ext.half + 0.5 * S, Lf = park + cfg.straightK * ext.half, sep = rw + (loose ? cfg.sepLoose : cfg.sepGap);
    var bad = 0, why = cfg._why, fl = {};
    function fail(w, k) { bad += w || 1; fl[k] = (fl[k] || 0) + 1; if (why) why[k] = (why[k] || 0) + 1; return bad >= cap && !force; }
    var g = { rw: rw, hTop: hTop, keepG: keepG, ext: ext, park: park, Lf: Lf, sep: sep, r1x: L.door.x + startS + 0.3 * ext.half + 40 };
    var houses = placeHouses(L, spec, S, rng, cfg, g);
    if (!houses) {
      if (why) why.place = (why.place || 0) + 1;
      if (!force) return null;
      houses = spec.ids.map(function (id, q) { return { id: id, x: lerp(L.W * 0.55, L.W - ins.right - S, (q + 0.5) / n), y: lerp(P.y0 + hTop, P.y1 - rw, (q + 0.5) / n), side: -1, wps: [] }; });
      bad += 50;
    }
    var start = { x: L.door.x + startS, y: L.door.y };
    var box = function (h) { return { x0: h.x - S / 2, y0: h.y - hTop, x1: h.x + S / 2, y1: h.y }; };
    var signBox = function (h) { return { x0: h.x - 0.32 * S, y0: h.y - 0.95 * S, x1: h.x + 0.32 * S, y1: h.y - 0.3 * S }; };
    var bk = { x0: L.bakery.x, y0: L.bakery.y, x1: L.bakery.x + L.bakery.w, y1: L.bakery.y + L.bakery.h };
    houses.forEach(function (h) { h.q = { x: h.x + h.side * Lf, y: h.y }; h.stop = { x: h.x + h.side * park, y: h.y }; h.tin = { x: -h.side, y: 0 }; });
    for (i = 0; i < n; i++) {
      var B = box(houses[i]);
      for (j = 0; j < L.keep.length; j++) if (rectOverlap(B, L.keep[j], keepG - 1e-6)) { if (fail(2, 'houseKeep')) return null; }
      if (B.x0 < ins.left + keepG - 1e-6 || B.x1 > L.W - ins.right - keepG + 1e-6 || B.y0 < ins.top + 4 || B.y1 > P.y1) { if (fail(2, 'houseEdge')) return null; }
      if (boxesGap(B, bk) < 40) { if (fail(2, 'houseBakery')) return null; }
      for (j = 0; j < i; j++) {
        if (boxesGap(B, box(houses[j])) < cfg.houseGap - 1e-6 || hyp(houses[i].x - houses[j].x, houses[i].y - houses[j].y) < S + cfg.houseGap - 1e-6) { if (fail(2, 'houseGap')) return null; }
      }
    }
    // the parked cart: on screen, clear of the bubble / HUD and of the other houses' signs; the same for the waiting start
    function cartBox(x, y) { return { x0: x - ext.half, y0: y - ext.up, x1: x + ext.half, y1: y + ext.down }; }
    function cartClear(x, y, k) {
      var cb = cartBox(x, y);
      if (cb.x0 < ins.left + cfg.cartEdge - 1e-6 || cb.x1 > L.W - ins.right - cfg.cartEdge + 1e-6 || cb.y0 < ins.top + cfg.cartEdge - 1e-6) return fail(1, k + 'Edge');
      for (var q = 0; q < L.keep.length; q++) if (rectOverlap(cb, L.keep[q], cfg.cartKeep - 1e-6)) return fail(1, k + 'Keep');
      return false;
    }
    for (i = 0; i < n; i++) {
      var hq = houses[i];
      if (cartClear(hq.stop.x, hq.stop.y, 'park')) return null;
      if (hq.q.x < ins.left + rw / 2 || hq.q.x > L.W - ins.right - rw / 2) { if (fail(2, 'parkEdge')) return null; }
      var pb = cartBox(hq.stop.x, hq.stop.y);
      for (j = 0; j < n; j++) if (j !== i && boxesGap(pb, signBox(houses[j])) < 0) { if (fail(1, 'parkSign')) return null; }
    }
    if (cartClear(start.x, start.y, 'start')) return null;
    // ---- forks
    var R1 = { x: L.door.x + startS + 0.3 * ext.half, y: L.door.y }, f1, f2 = null, pair = null, shared = 0;
    if (L.portrait) houses.forEach(function (h) {   // a riser under each parking straight: the road comes up, then turns in
      var last = h.wps.length ? h.wps[h.wps.length - 1].p : null, rp = { x: h.q.x + h.side * cfg.turnBulge, y: h.y + cfg.turnBulge * 1.3 };
      if (!last || last.y > rp.y + 30) h.wps.push({ p: rp, t: { x: 0, y: -1 }, kind: 'riser' });
    });
    var first = function (h) { return h.wps.length ? h.wps[0].p : h.q; };
    var mean = function (list, f) { var s2 = 0; list.forEach(function (h) { s2 += f(h); }); return s2 / list.length; };
    if (!L.portrait) {
      var lane = g.lane, fx0 = R1.x + 40;
      f1 = { x: 0, y: clamp(lerp(mean(houses, function (h) { return h.y; }), start.y, rng.float(0, 0.4)) + rng.float(-30, 30), P.y0 + rw / 2 + cfg.roadEdge, P.y1 - rw / 2 - cfg.roadEdge) };
      var dyMax = Math.max.apply(null, houses.map(function (h) { return Math.abs(h.y - f1.y); }));
      var want = Math.max(cfg.laneMin, cfg.laneK * dyMax), room = lane - fx0, lk = 1;
      if (room < cfg.laneShort) { if (fail(3, 'short')) return null; }
      if (room < want) lk = Math.max(cfg.laneShort, room) / want;   // a narrow screen: steeper fans
      var fx1 = lane - want * lk;
      f1.x = lerp(fx0, Math.max(fx0, fx1), rng.float(0.1, spec.forks >= 2 ? 0.4 : 0.7));
      // lanes: each branch reaches its house's height soon after the fork, then runs straight in (parallel, ≥ sep apart)
      houses.forEach(function (h) {
        var lx = Math.min(lane, f1.x + lk * Math.max(cfg.laneMin, cfg.laneK * Math.abs(h.y - f1.y)));
        h.wps = h.q.x - lx > 30 ? [{ p: { x: lx, y: h.y }, t: { x: 1, y: 0 } }] : [];
      });
      if (spec.forks >= 2 && n >= 3) {
        var byY = houses.slice().sort(function (a, b) { return a.y - b.y; }), k0 = rng.int(0, n - 2);
        pair = [byY[k0], byY[k0 + 1]];
        var px = Math.min(first(pair[0]).x, first(pair[1]).x);
        var py2 = (pair[0].y + pair[1].y) / 2, dy2 = Math.abs(pair[0].y - pair[1].y) / 2;
        f2 = { x: Math.max(f1.x + Math.max(cfg.laneMin, cfg.laneK * Math.abs(py2 - f1.y)) * 0.8, lane - Math.max(cfg.laneMin, cfg.laneK * dy2) - rng.float(0, 30)), y: py2 };
        if (f2.x - f1.x < 140 || lane - f2.x < cfg.laneMin * 0.8) { if (fail(3, 'fork2')) return null; }
        pair.forEach(function (h) { var lx = Math.min(lane, f2.x + Math.max(cfg.laneMin, cfg.laneK * Math.abs(h.y - f2.y))); h.wps = h.q.x - lx > 30 ? [{ p: { x: lx, y: h.y }, t: { x: 1, y: 0 } }] : []; });
      }
    } else {
      var fyLo = Math.max.apply(null, houses.map(function (h) { return first(h).y; })) + 130;
      f1 = { x: 0, y: fyLo <= g.forkY ? lerp(fyLo, g.forkY, rng.float(0, 0.6)) : g.forkY };
      if (R1.y - f1.y < 100) { if (fail(3, 'short')) return null; }
      f1.x = clamp(lerp(mean(houses, function (h) { return first(h).x; }), R1.x, rng.float(0.1, 0.45)), ins.left + rw / 2 + 20, L.W - ins.right - rw / 2 - 20);
      f1.x = Math.max(f1.x, bk.x1 + rw / 2 + (f1.y > bk.y0 - rw ? 40 : 20));   // the trunk never sweeps back over the bakery
      if (spec.forks >= 2 && n >= 3) {
        // a pair that rises through the same passages shares the road up to just above them; else two neighbours of one row
        var passes = function (h) { return h.wps.filter(function (w) { return w.kind === 'pass'; }); };
        var key = function (h) { return passes(h).map(function (w) { return Math.round(w.p.x) + ':' + Math.round(w.p.y); }).join('|'); };
        for (i = 0; i < n && !pair; i++) for (j = i + 1; j < n && !pair; j++) if (passes(houses[i]).length && key(houses[i]) === key(houses[j])) pair = [houses[i], houses[j]];
        if (pair) shared = passes(pair[0]).length;
        else {
          var top = houses.slice().sort(function (a, b) { return a.y - b.y; });
          pair = [top[0], top[1]];
        }
        if (shared) {
          var lw = pair[0].wps[shared - 1].p, below = houses.filter(function (h) { return h.y > pair[0].y + 20; });
          var boxTop = below.length ? Math.min.apply(null, below.map(function (h) { return h.y - hTop; })) : lw.y;
          f2 = { x: lw.x, y: Math.min(lw.y - 70, boxTop - rw / 2 - cfg.roadHouse - 24) };
        }
        else f2 = { x: (first(pair[0]).x + first(pair[1]).x) / 2, y: lerp(f1.y, Math.max(first(pair[0]).y, first(pair[1]).y), 0.55) };
        if (f1.y - f2.y < 150) { if (fail(3, 'fork2')) return null; }
      }
    }
    var forks = [f1].concat(f2 ? [f2] : []);
    for (i = 0; i < forks.length; i++) if (cartClear(forks[i].x, forks[i].y, 'fork')) return null;
    // ---- edges
    var edges = [], nodes = [{ id: 'root', kind: 'root', x: L.door.x, y: L.door.y }, { id: 'f1', kind: 'fork', x: f1.x, y: f1.y }];
    if (f2) nodes.push({ id: 'f2', kind: 'fork', x: f2.x, y: f2.y });
    houses.forEach(function (h) { nodes.push({ id: h.id, kind: 'house', x: h.x, y: h.y }); });
    function dirTo(p2, q2) { return unit(q2.x - p2.x, q2.y - p2.y); }
    function tang(th) { return unit(F.x * Math.cos(th) + A.x * Math.sin(th), F.y * Math.cos(th) + A.y * Math.sin(th)); }
    function fan(node, kids) {   // departure tangents at a fork: towards each first waypoint, spread ≥ forkSpread apart in across order
      var ks = kids.slice().sort(function (p2, q2) { return acr(p2.to) - acr(q2.to); }), m = ks.length, th = [];
      ks.forEach(function (k) { var d = dirTo(node, k.to); th.push(clamp(Math.atan2(d.x * A.x + d.y * A.y, d.x * F.x + d.y * F.y), -1.3, 1.3)); });
      var mid = (th[0] + th[m - 1]) / 2, span = Math.max(th[m - 1] - th[0], (m - 1) * cfg.forkSpread);
      ks.forEach(function (k, q) { var t2 = m === 1 ? th[0] : mid - span / 2 + q * span / (m - 1); k.t = tang(clamp(lerp(t2, th[q], cfg.fanDirect), -1.35, 1.35)); });
      var md = dirTo(node, { x: mean(ks, function (k) { return k.to.x; }), y: mean(ks, function (k) { return k.to.y; }) });
      return clamp(Math.atan2(md.x * A.x + md.y * A.y, md.x * F.x + md.y * F.y), -0.7, 0.7);
    }
    function wig(a2, b2, amp) {   // an optional seeded wiggle waypoint between a2 and b2 (only on long legs)
      var d = hyp(b2.x - a2.x, b2.y - a2.y);
      if (d < 260 || !rng.chance(0.6)) return null;
      var u = dirTo(a2, b2), w = rng.float(-1, 1) * amp * d;
      return { p: { x: (a2.x + b2.x) / 2 - u.y * w, y: (a2.y + b2.y) / 2 + u.x * w }, t: u };
    }
    function mkEdge(id, kind, from, to, parent, house, dense) {
      var r = resample(dense, cfg.sample);
      return { id: id, kind: kind, from: from, to: to, parent: parent, children: [], house: house, pts: r.pts, cum: r.cum, len: r.len, d0: 0, bumps: [] };
    }
    var f1Kids = [], f2Kids = [];
    houses.forEach(function (h) {
      var inPair = pair && pair.indexOf(h) >= 0, w = inPair ? h.wps.slice(shared) : h.wps.slice();
      (inPair ? f2Kids : f1Kids).push({ h: h, w: w, to: w.length ? w[0].p : h.q });
    });
    var midKid = f2 ? { mid: true, to: shared ? pair[0].wps[0].p : f2 } : null;
    if (midKid) f1Kids.push(midKid);
    var th1 = fan(f1, f1Kids), t0 = { x: 1, y: 0 };
    if (f2) fan(f2, f2Kids);
    // trunk: door → straight (the bakery front + the waiting cart) → [wiggle] → f1
    var tw = wig(R1, f1, cfg.wiggle), twp = [L.door, R1], ttg = [t0, t0];
    if (tw) { twp.push(tw.p); ttg.push(tw.t); }
    twp.push(f1); ttg.push(tang(th1));
    edges.push(mkEdge('trunk', 'trunk', 'root', 'f1', null, null, curvePts(twp, ttg)));
    if (f2) {
      var mwp = [f1], mtg = [midKid.t];
      if (shared) for (i = 0; i < shared; i++) { mwp.push(pair[0].wps[i].p); mtg.push(pair[0].wps[i].t); }
      else { var mw = wig(f1, f2, cfg.wiggle * 0.6); if (mw) { mwp.push(mw.p); mtg.push(mw.t); } }
      mwp.push(f2); mtg.push(L.portrait && shared ? { x: 0, y: -1 } : dirTo(mwp[mwp.length - 1], f2));
      edges.push(mkEdge('mid', 'mid', 'f1', 'f2', 'trunk', null, curvePts(mwp, mtg)));
    }
    function branch(k, fromId, parentId, fp) {
      var h = k.h, wp = [fp], tg = [k.t];
      var bw = wig(fp, k.to, cfg.wiggle);
      if (bw) { wp.push(bw.p); tg.push(bw.t); }
      var kinds = [null];
      k.w.forEach(function (w) {   // waypoints closer than 50 px to the last one or to Q would make a kink: skipped
        var lp = wp[wp.length - 1];
        if (hyp(w.p.x - lp.x, w.p.y - lp.y) < 50 || (w.kind !== 'riser' && hyp(w.p.x - h.q.x, w.p.y - h.q.y) < 50)) return;
        wp.push(w.p); tg.push(w.t); kinds.push(w.kind || 'lane');
      });
      wp.push(h.q, { x: h.x, y: h.y }); tg.push(h.tin, h.tin);

      var e = mkEdge('to_' + h.id, 'branch', fromId, h.id, parentId, h.id, curvePts(wp, tg));
      e.stopS = Math.max(0, e.len - park);
      edges.push(e);
    }
    f1Kids.forEach(function (k) { if (k.h) branch(k, 'f1', 'trunk', f1); });
    f2Kids.forEach(function (k) { branch(k, 'f2', 'mid', f2); });
    var byId = {};
    edges.forEach(function (e) { byId[e.id] = e; });
    edges.forEach(function (e) { if (e.parent) byId[e.parent].children.push(e.id); });
    edges.forEach(function (e) { var d = 0, pp = e.parent; while (pp) { d += byId[pp].len; pp = byId[pp].parent; } e.d0 = d; });
    edges.forEach(function (e) { for (var s2 = cfg.bumpEvery / 2; s2 < e.len - 40; s2 += cfg.bumpEvery) if (e.kind !== 'trunk' || s2 > startS + 30) e.bumps.push(s2); });
    // ---- rules on the roads
    var half = rw / 2, grid = {}, cell = sep, maxDist = 0;
    var hb = houses.map(function (h) { return { id: h.id, b: box(h) }; });
    var nodeAt = {}; nodes.forEach(function (q2) { nodeAt[q2.id] = q2; });
    function sharedNode(a2, b2) { if (a2.from === b2.from) return a2.from; if (a2.from === b2.to) return a2.from; if (a2.to === b2.from) return a2.to; if (a2.to === b2.to) return a2.to; return null; }
    for (i = 0; i < edges.length; i++) {
      var e = edges[i], pts = e.pts, ownLf = e.house ? e.len - (Lf + 0.5 * S + 10) : 1e9;
      maxDist = Math.max(maxDist, e.d0 + e.len);
      for (j = 0; j < pts.length; j++) {
        var x = pts[j][0], y = pts[j][1], s = e.cum[j];
        // the road on the table, inside the safe screen, its band clear of the bubble / HUD
        if (x < ins.left + half + cfg.roadEdge - 2 || x > L.W - ins.right - half - cfg.roadEdge + 2 || y < P.y0 + half - 2 || y > P.y1 - half + 2) { if (fail(1, 'roadEdge')) return null; }
        for (var q = 0; q < L.keep.length; q++) if (inBox(L.keep[q], x, y, half + cfg.roadKeep)) { if (fail(1, 'roadKeep')) return null; }
        // the cart driving here stays on screen (its art may pass under the speech bubble: main.js fades the bubble then)
        if (e.kind !== 'trunk' || s >= startS - 1) {
          if (x - ext.half < ins.left + cfg.cartEdge - 2 || x + ext.half > L.W - ins.right - cfg.cartEdge + 2 || y - ext.up < ins.top + cfg.cartEdge) { if (fail(1, 'cartEdge')) return null; }
        }
        // clear of every other house (and of its own house before the final straight)
        for (q = 0; q < hb.length; q++) {
          if (hb[q].id === e.house && s >= ownLf) continue;
          if (boxDist(hb[q].b, x, y) < half + cfg.roadHouse) { if (fail(1, 'roadHouse')) return null; }
        }
        // clear of the bakery (except the trunk's start along its front)
        if (!(e.kind === 'trunk' && s < startS) && boxDist(bk, x, y) < half + cfg.roadHouse) { if (fail(1, 'roadBakery')) return null; }
        // branches apart: a grid of every point, checked against other edges (a shared fork exempt within forkFree)
        var gx = Math.floor(x / cell), gy = Math.floor(y / cell);
        for (var ox = -1; ox <= 1; ox++) for (var oy = -1; oy <= 1; oy++) {
          var lst = grid[(gx + ox) + ',' + (gy + oy)];
          if (!lst) continue;
          for (var r = 0; r < lst.length; r++) {
            var o = lst[r];
            if (hyp(o.x - x, o.y - y) >= sep) continue;
            var sh = sharedNode(e, edges[o.i]);
            if (sh && hyp(x - nodeAt[sh].x, y - nodeAt[sh].y) < cfg.forkFree && hyp(o.x - nodeAt[sh].x, o.y - nodeAt[sh].y) < cfg.forkFree) continue;
            if (fail(1, 'sep')) return null;
          }
        }
      }
      for (j = 0; j < pts.length; j++) { var k2 = Math.floor(pts[j][0] / cell) + ',' + Math.floor(pts[j][1] / cell); (grid[k2] = grid[k2] || []).push({ i: i, x: pts[j][0], y: pts[j][1] }); }
      // smooth: no kink sharper than maxTurn between two 8 px segments (a cart can drive it)
      for (j = 1; j < pts.length - 1; j++) {
        var ta = Math.atan2(pts[j][1] - pts[j - 1][1], pts[j][0] - pts[j - 1][0]), tb = Math.atan2(pts[j + 1][1] - pts[j][1], pts[j + 1][0] - pts[j][0]), dt2 = Math.abs(tb - ta);
        if (dt2 > Math.PI) dt2 = TAU - dt2;
        if (dt2 > cfg.maxTurn) { if (fail(1, 'kink')) return null; }
      }
      // no self-loop: points far apart along the edge stay apart
      for (j = 0; j < pts.length; j += 3) for (var j2 = j + 12; j2 < pts.length; j2 += 3) if (e.cum[j2] - e.cum[j] > 3 * rw && hyp(pts[j][0] - pts[j2][0], pts[j][1] - pts[j2][1]) < rw + 10) { if (fail(1, 'loop')) return null; }
    }
    // ---- some driving: start → every house ≥ minRouteK × the play diagonal (a soft rule: the first attempts only)
    var routeLen = {};
    houses.forEach(function (h) { var e3 = byId['to_' + h.id]; routeLen[h.id] = e3.d0 + e3.stopS - startS; });
    if (needRoute) for (i = 0; i < n; i++) if (routeLen[houses[i].id] < cfg.minRouteK * L.diag) { if (fail(1, 'route')) return null; }
    var hs = {};
    houses.forEach(function (h) { hs[h.id] = { x: h.x, y: h.y, side: h.side, stop: h.stop, q: h.q }; });
    var st = edgeAt(byId.trunk, startS);
    return { bad: bad, fails: fl, S: S, loose: loose, forks: f2 ? 2 : 1, nodes: nodes, edges: edges, houses: hs, door: { x: L.door.x, y: L.door.y }, start: { x: st.x, y: st.y, edge: 'trunk', s: startS },
      maxDist: maxDist, routeLen: routeLen, park: park, straight: Lf, cart: ext, cartK: ck, cartS: cfg.cartK * S, hitR: Math.max(cfg.hitMin, cfg.hitK * cfg.cartK * S + cfg.hitPad) };
  }
  /** Tree helpers on a map. */
  function edgeById(R, id) { if (!R) return null; for (var i = 0; i < R.edges.length; i++) if (R.edges[i].id === id) return R.edges[i]; return null; }
  function ancestors(R, e) { var out = [], c = e; while (c) { out.push(c); c = c.parent ? edgeById(R, c.parent) : null; } return out; }
  /** Path from (e1, s1) to (e2, s2) along the tree → [{e, a, b}] (move along edge e from s = a to s = b), total length. */
  function treePath(R, e1, s1, e2, s2) {
    if (e1 === e2) return { segs: [{ e: e1, a: s1, b: s2 }], len: Math.abs(s2 - s1) };
    var A1 = ancestors(R, e1), A2 = ancestors(R, e2), segs = [], i;
    var i2 = A2.indexOf(e1), i1 = A1.indexOf(e2);
    if (i2 >= 0) {           // e2 below e1: forward to e1's end, then down
      segs.push({ e: e1, a: s1, b: e1.len });
      for (i = i2 - 1; i >= 1; i--) segs.push({ e: A2[i], a: 0, b: A2[i].len });
      segs.push({ e: e2, a: 0, b: s2 });
    } else if (i1 >= 0) {    // e2 above e1: back to e1's start, then up
      segs.push({ e: e1, a: s1, b: 0 });
      for (i = 1; i < i1; i++) segs.push({ e: A1[i], a: A1[i].len, b: 0 });
      segs.push({ e: e2, a: e2.len, b: s2 });
    } else {                 // siblings / cousins: up to the shared fork, then down
      var ca = null;
      for (i = 0; i < A1.length && !ca; i++) if (A2.indexOf(A1[i]) >= 0) ca = A1[i];
      segs.push({ e: e1, a: s1, b: 0 });
      for (i = 1; i < A1.length && A1[i] !== ca; i++) segs.push({ e: A1[i], a: A1[i].len, b: 0 });
      var down = [];
      for (i = 0; i < A2.length && A2[i] !== ca; i++) down.push(A2[i]);
      for (i = down.length - 1; i >= 1; i--) segs.push({ e: down[i], a: 0, b: down[i].len });
      segs.push({ e: e2, a: 0, b: s2 });
    }
    var len = 0;
    segs.forEach(function (q) { len += Math.abs(q.b - q.a); });
    return { segs: segs, len: len };
  }
  /** The nearest road point to (x, y) → {e, s, d, x, y} (prefer: an edge kept when within `hyst` px of the best). */
  function projectRoads(R, x, y, prefer, hyst) {
    var best = null, pref = null;
    for (var i = 0; i < R.edges.length; i++) {
      var e = R.edges[i], P = e.pts, eb = null;
      for (var j = 0; j < P.length - 1; j++) {
        var ax = P[j][0], ay = P[j][1], bx = P[j + 1][0] - ax, by = P[j + 1][1] - ay, L2 = bx * bx + by * by;
        var u = L2 > 1e-9 ? clamp(((x - ax) * bx + (y - ay) * by) / L2, 0, 1) : 0, px = ax + bx * u, py = ay + by * u, d = hyp(x - px, y - py);
        if (!eb || d < eb.d) eb = { e: e, s: lerp(e.cum[j], e.cum[j + 1], u), d: d, x: px, y: py };
      }
      if (eb && (!best || eb.d < best.d)) best = eb;
      if (eb && prefer && e === prefer) pref = eb;
    }
    if (pref && best && pref !== best && pref.d <= best.d + (hyst || 0)) return pref;
    return best;
  }
  BD.Roads = { _place: placeHouses, gen: genMap, at: edgeAt, curvature: edgeCurv, path: treePath, project: projectRoads, edge: edgeById };

  // ------------------------------------------------------------------ World
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.rng = new BD.RNG(this.seed);
    this._crng = new BD.RNG((BD.RNG.hash(this.seed) ^ 0x51ed27) >>> 0);   // cosmetic randomness (puffs, sprinkles, blinks, surprise spots)
    this.windModel = new WindModel((BD.RNG.hash(this.seed) ^ 0x2a7e11) >>> 0, this.cfg);
    this.age = BD.Content.ageOf(opts.age !== undefined ? opts.age : 4);
    this.lang = opts.lang === 'vi' ? 'vi' : 'en';
    this._pendingAge = this.age; this._pendingLang = this.lang;
    this.state = 'menu'; this.phase = null;
    this.level = 0; this.levels = []; this.topic = null; this.weather = 0;
    this.round = 0; this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.stars = 0; this.levelStars = 0; this.roundStars = 0; this.misses = 0; this.streak = 0;
    this.time = 0; this.stateTime = 0; this.phaseTime = 0; this.alpha = 0; this._acc = 0;
    this.cur = null; this.talk = null; this.talkAnswered = null;
    this.houses = []; this.roads = null; this.roadReveal = 0; this._proadReveal = 0; this.order = 0; this.orderObj = null;
    this.flyers = []; this.sprinkles = []; this.puffs = []; this.snowflakes = []; this.mouse = null; this.bird = null;
    this.hintHand = null; this.hintEdges = []; this.hintGlow = 0; this._phintGlow = 0; this.hintHouse = null; this.assistId = null; this.wipe = null; this.trail = [];
    this.cart = this._newCart();
    this.tupi = { mood: 'idle', moodT: 0, blink: false, blinkT: 3, look: 0, _plook: 0, frame: 'idle' };
    this.finger = { x: 0, y: 0, down: false };
    this.wind = 0; this.gust = 0;
    this.hudKeep = opts.hudKeep || null; this.lastTopics = null; this.surprise = null; this._surpriseOff = 0; this._surpriseRound = 1;
    this.events = []; this.sessions = 0;
    this._idleN = 0; this._idleT = 0; this._idleGap = this.cfg.idleTime; this._lastHintT = -1e9; this.levelStartTime = 0;
    this._talkAskT = 0; this._talkAsks = 0; this._g = null; this._noProg = 0; this._usedKeys = []; this._prevRule = null;
    this._view = null; this._vp = null; this._surpriseAt = -1; this._roundAssisted = false; this._seq = null; this._demoAt = -1;
    this.setViewport(opts.width || 1280, opts.height || 720, opts.ins || null);
  }
  World.logicalSize = logicalSize;
  World.computeLayout = function (W, H, ins, cfg, age, hudKeep) { return computeLayout(W, H, ins, merge(CONFIG, cfg), age === undefined ? 4 : age, hudKeep); };
  /** The map for a layout: World.genMap(layout, {ids, forks}, seed, cfg). */
  World.genMap = function (L, spec, seed, cfg) { return genMap(L, spec, seed, merge(CONFIG, cfg)); };
  /** The most houses a round may have on this screen: 3 on squat iPad screens (landscape narrower than 1000 px, compact portrait), else 4. */
  World.maxHouses = function (W, H, ins, cfg) {
    var c = merge(CONFIG, cfg), i = insOf(ins);
    if (W >= H) return W - i.left - i.right < c.max4Width ? 3 : 4;
    return (H - i.top - i.bottom) / W < c.compactRatio ? 3 : 4;
  };
  World.kickFor = kickFor;
  World.tupiPoints = tupiPoints;
  World.cartExtent = cartExtent;
  World.boxDist = boxDist;

  var P = World.prototype;
  Object.defineProperty(P, 'interactive', { get: function () {
    var s = this.cart.state;
    return this.state === 'round' && this.phase === 'play' && !!this.cur && (s === 'wait' || s === 'drag' || s === 'coast');
  } });
  P._newCart = function () {
    return { x: 0, y: 0, _px: 0, _py: 0, edge: 'trunk', s: 0, vel: 0, spd: 0, mdir: 0, dir: { x: 1, y: 0 }, face: 1, faceS: 1, _pfaceS: 1, hop: 0, _phop: 0,
      lean: 0, leanV: 0, _plean: 0, bounce: 0, bounceV: 0, _pbounce: 0, wheelRot: 0, _pwheelRot: 0, squash: 0, squashV: 0, _psquash: 0, sx: 1, sy: 1,
      cargoHop: 0, cargoHopV: 0, _pcargoHop: 0, alpha: 0, _palpha: 0, k: 0.5, state: 'hidden', cargo: null, cargoCount: 0, tgt: null, mode: null,
      faceLock: false, accel: 0, curv: 0, driving: false, _dustT: 0 };
  };
  P._emit = function (e) {
    var L = this.layout;
    if (e.x !== undefined) { e.x = clamp(+e.x || 0, 0, L.W); e.y = clamp(+e.y || 0, 0, L.H); }
    this.events.push(e);
  };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };
  P.setAge = function (a) { this._pendingAge = BD.Content.ageOf(a); };
  P.setLang = function (l) { this._pendingLang = l === 'vi' ? 'vi' : 'en'; };
  P._setState = function (s) { this.state = s; this.stateTime = 0; };
  P._setPhase = function (p) { this.phase = p; this.phaseTime = 0; };
  P._mood = function (m, t) { this.tupi.mood = m; this.tupi.moodT = t || this.cfg.moodTime[m] || 1; };
  P.skipTalk = function () { if (this.state === 'talk') this._levelDone(); };
  P.houseById = function (id) { for (var i = 0; i < this.houses.length; i++) if (this.houses[i].id === id) return this.houses[i]; return null; };
  P._edge = function (id) { return edgeById(this.roads, id); };
  P._centre = function () { var p = this.layout.play; return { x: (p.x0 + p.x1) / 2, y: (p.y0 + p.y1) / 2 }; };
  P._targetHouse = function () { return this.orderObj ? this.houseById(this.orderObj.target) : null; };

  /** The current question while it can be answered, else null. */
  P.prompt = function () {
    if (!this.interactive || !this.orderObj) return null;
    var o = this.orderObj, c = this.cur;
    var r = { promptKey: o.promptKey, params: o.params, rule: o.rule, nameKind: o.rule.nameKind, nameValue: o.rule.value, cargo: o.cargo, orderIndex: this.order, left: c.d - this.order, houseId: o.target };
    if (o.count !== undefined) r.count = o.count;
    return r;
  };

  // ---------------------------------------------------------------- cart geometry (art → world)
  /** A point of the cart art (cart viewBox units; frame 'tupi' = Tupi's viewBox) in world px with the current pose. */
  P.cartPoint = function (u, v, frame) {
    var T = tupiPoints(), c = this.cart, g = T.cart.ground, k = c.k;
    if (frame === 'tupi') { u = u - T.seat[0] + T.cart.seat[0]; v = v - T.seat[1] + T.cart.seat[1]; }
    var dx = (u - g[0]) * k * c.sx, dy = (v - g[1]) * k * c.sy, cl = Math.cos(c.lean), sl = Math.sin(c.lean);
    var rx = dx * cl - dy * sl, ry = dx * sl + dy * cl;
    return { x: c.x + rx * c.faceS, y: c.y - c.bounce - c.hop + ry };
  };
  P._mouth = function () { var T = tupiPoints(); return this.cartPoint(T.mouth[0], T.mouth[1], 'tupi'); };
  P._tray = function () { var T = tupiPoints(); return this.cartPoint(T.cart.tray[0], T.cart.tray[1]); };
  P._trunkTip = function () { var T = tupiPoints(); return this.cartPoint(T.trunkTip[0], T.trunkTip[1], 'tupi'); };
  P._trunkHold = function () { var T = tupiPoints(); return this.cartPoint(T.trunkHold[0], T.trunkHold[1], 'tupi'); };
  /** {x, y, r} the cart's grab circle (its centre; r = hitR). */
  /** The cart's drawn extent for the current map (scaled with its houses) — {left, right, up, down, half, k}. */
  P.cartExt = function () { return this.roads ? this.roads.cart : this.layout.cart; };
  P.cartHitR = function () { return this.roads ? this.roads.hitR : this.layout.hitR; };
  /** The cart + Tupi art box in world px now {x0, y0, x1, y1} (mirror-symmetric half width; bounce / hop included). */
  P.cartBox = function () { var c = this.cart, E = this.cartExt(), y = c.y - c.bounce - c.hop; return { x0: c.x - E.half, y0: y - E.up, x1: c.x + E.half, y1: y + E.down }; };
  /** True while Tupi's art reaches under the speech bubble (only while driving between stops): main.js fades the DOM bubble. */
  P.cartUnderBubble = function () { var b = this.layout.bubble, k = this.cartBox(); return this.cart.alpha > 0 && k.x0 < b.x + b.w && k.x1 > b.x && k.y0 < b.y + b.h && k.y1 > b.y; };
  P.cartHit = function () { var c = this.cart, E = this.cartExt(); return { x: c.x, y: c.y - c.bounce - 0.5 * E.up, r: this.cartHitR(), cx: c.x, cy: c.y - 0.5 * E.up }; };
  P._houseBox = function (h) { var S = h.S, t = this.cfg.houseTop * S; return { x0: h.x - S / 2, y0: h.y - t, x1: h.x + S / 2, y1: h.y }; };
  /** A house's tap box: its box + 30 px each side (+60 up). */
  P.houseHit = function (id) {
    var h = this.houseById(id), c = this.cfg;
    if (!h || h.appear < 0.5) return null;
    var b = this._houseBox(h), x0 = b.x0 - c.houseHitPad, y0 = b.y0 - c.houseHitUp, x1 = b.x1 + c.houseHitPad, y1 = b.y1 + c.houseHitPad;
    return { x0: x0, y0: y0, x1: x1, y1: y1, cx: h.x, cy: h.y - 0.5 * this.cfg.houseTop * h.S, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  /** Road points from the cart to that house's parking spot (logical px, every ≈ 20 px). */
  P.route = function (houseId) {
    var e2 = this._edge('to_' + houseId), c = this.cart, e1 = this._edge(c.edge);
    if (!e2 || !e1) return [];
    var p = treePath(this.roads, e1, c.s, e2, e2.stopS), out = [], acc = 0;
    out.push([c.x, c.y]);
    p.segs.forEach(function (sg) {
      var L0 = Math.abs(sg.b - sg.a), dir = sg.b >= sg.a ? 1 : -1;
      for (var d = (20 - acc % 20) % 20 || 20; d <= L0; d += 20) { var q = edgeAt(sg.e, sg.a + dir * d); out.push([q.x, q.y]); }
      acc += L0;
    });
    var end = edgeAt(e2, e2.stopS); out.push([end.x, end.y]);
    return out;
  };
  P._clearOfKeep = function (x, y, pad) { var K = this.layout.keep; for (var k = 0; k < K.length; k++) if (inBox(K[k], x, y, pad || 0)) return false; return true; };
  P._onScreen = function (x, y, m) { var L = this.layout; m = m || 0; return x >= L.ins.left + m && x <= L.W - L.ins.right - m && y >= L.ins.top + m && y <= L.H - L.ins.bottom - m; };
  P.mouseHit = function () { var m = this.mouse; if (!m || m.peek < 0.6 || m.state === 'out') return null; return { x: m.x, y: m.y - 0.36 * this.cfg.mouseR, r: this.cfg.mouseR }; };
  P.birdHit = function () { var b = this.bird; if (!b || b.a < 0.6 || b.state === 'out') return null; return { x: b.x, y: b.y - 0.45 * this.cfg.birdR, r: this.cfg.birdR }; };
  P.snowHit = function () {
    for (var i = 0; i < this.snowflakes.length; i++) {
      var f = this.snowflakes[i];
      if (f.state !== 'fall' || f.a < 0.5 || !this._clearOfKeep(f.x, f.y, 4) || !this._onScreen(f.x, f.y, 6)) continue;
      var ch = this.cartHit();
      if (hyp(f.x - ch.x, f.y - ch.y) <= ch.r) continue;
      return { x: f.x, y: f.y, r: f.r, i: i };
    }
    return null;
  };
  /** What to deliver next: {houseId} while interactive, else null. */
  P.answer = function () { return this.interactive && this.orderObj ? { houseId: this.orderObj.target, id: this.orderObj.target } : null; };
  P.targets = function () { var a = this.answer(); return a ? [a.houseId] : []; };

  // ---------------------------------------------------------------- viewport
  P.setViewport = function (W, H, ins) { this._view = { W: W, H: H, ins: insOf(ins) }; this._relayout(false); };
  P._relayout = function (force) {
    var v = this._view;
    var key = v.W + 'x' + v.H + ':' + JSON.stringify(v.ins) + ':' + this.age + ':' + JSON.stringify(this.hudKeep || null);
    if (key === this._vp && !force) return false;
    var had = !!this.layout, prev = this.layout;
    this._vp = key;
    this.layout = computeLayout(v.W, v.H, v.ins, this.cfg, this.age, this.hudKeep);
    this.cart.k = this.roads ? this.roads.cartK : this.layout.cartK;
    if (this.cur) this._buildMap(true, prev);
    else if (had) this._snapLoose(prev);
    else this._parkCart();
    return true;
  };
  /** The cart at the bakery start (no map yet: talk / intro / menu). */
  P._parkCart = function () { var c = this.cart, L = this.layout; c.x = c._px = L.start.x; c.y = c._py = L.start.y; c.edge = 'trunk'; c.s = L.startS; };
  P._snapLoose = function (prev) {
    var L = this.layout, sx = prev && prev.W ? L.W / prev.W : 1, sy = prev && prev.H ? L.H / prev.H : 1;
    this._parkCart();
    this.puffs.forEach(function (p) { p.x = clamp(p.x * sx, 0, L.W); p.y = clamp(p.y * sy, 0, L.H); p._px = p.x; p._py = p.y; });
    this.sprinkles.forEach(function (p) { p.x = clamp(p.x * sx, 0, L.W); p.y = clamp(p.y * sy, 0, L.H); p.floor *= sy; p._px = p.x; p._py = p.y; });
  };
  /** (Re)build the map of the current round for the current layout. `keep`: a rotation mid-round — the cart stays on the same edge at
   *  the same fraction of its length, houses keep their state, everything else is clamped / re-placed. */
  P._buildMap = function (keep, prev) {
    var cur = this.cur, L = this.layout, c = this.cart, self = this;
    var oldFrac = null, oldEdge = c.edge, oldTgt = c.tgt, oldTgtFrac = null, oldState = c.state;
    if (keep && this.roads) {
      var oe = this._edge(c.edge); oldFrac = oe ? c.s / Math.max(1, oe.len) : 0;
      if (oldTgt) { var te = this._edge(oldTgt.edge); oldTgtFrac = te ? oldTgt.s / Math.max(1, te.len) : 0; }
    }
    this.cancelDrag();
    this.roads = genMap(L, { ids: cur.houses.map(function (h) { return h.id; }), forks: cur.map.forks }, cur.map.seed, this.cfg);
    L.fits = this.roads.ok;
    var R = this.roads;
    c.k = R.cartK;
    if (!keep || !this.houses.length) {
      this.houses = cur.houses.map(function (q, i) { return self._newHouse(q, i); });
    }
    this.houses.forEach(function (h) {
      var p = R.houses[h.id];
      h.x = h._px = p.x; h.y = h._py = p.y; h.side = p.side; h.stop = p.stop; h.S = R.S; h.box = self._houseBox(h);
    });
    if (keep && oldFrac !== null) {
      var ne = this._edge(oldEdge) || this._edge('trunk');
      c.edge = ne.id; c.s = clamp(oldFrac * ne.len, ne.id === 'trunk' ? Math.min(R.start.s, ne.len) : 0, ne.stopS !== undefined ? ne.stopS : ne.len);
      if (oldState === 'drag' || oldState === 'coast') { c.state = 'wait'; c.mode = null; c.tgt = null; c.spd = 0; }   // the finger is gone: stop
      else if (oldTgt) {
        var nt = this._edge(oldTgt.edge) || ne;
        c.tgt = { edge: nt.id, s: oldTgt.house ? nt.stopS : oldTgt.edge === 'trunk' && (oldState === 'return' || oldState === 'rollout') ? R.start.s : clamp(oldTgtFrac * nt.len, 0, nt.len), house: oldTgt.house };
      }
      this._placeCart();
      c._px = c.x; c._py = c.y;
      var sx = prev && prev.W ? L.W / prev.W : 1, sy = prev && prev.H ? L.H / prev.H : 1;
      this.puffs.forEach(function (p) { p.x = clamp(p.x * sx, 0, L.W); p.y = clamp(p.y * sy, 0, L.H); p._px = p.x; p._py = p.y; });
      this.sprinkles.forEach(function (p) { p.x = clamp(p.x * sx, 0, L.W); p.y = clamp(p.y * sy, 0, L.H); p.floor = clamp(p.floor * sy, 0, L.H); p._px = p.x; p._py = p.y; });
      this.flyers.forEach(function (f) { self._reaimFlyer(f); });
      if (this.mouse) { var ms = this._mouseSpot(); if (ms) { this.mouse.x = ms.x; this.mouse.y = ms.y; } else this.mouse.state = 'out'; this.mouse._px = this.mouse.x; this.mouse._py = this.mouse.y; }
      if (this.bird) { var bs = this._birdSpot(); this.bird.x = this.bird._px = bs.x; this.bird.y = this.bird._py = bs.y; }
      this.snowflakes.forEach(function (f) { f.x0 = clamp(f.x0 * sx, L.ins.left + f.r, L.W - L.ins.right - f.r); f.x = clamp(f.x * sx, L.ins.left + f.r, L.W - L.ins.right - f.r); f.y = clamp(f.y * sy, 0, L.H); f._px = f.x; f._py = f.y; });
      if (this.hintHand) this._startHintHand(this.hintHouse, this.hintHand.demo);
      if (this.hintHouse) { var hp = treePath(R, this._edge(c.edge), c.s, this._edge('to_' + this.hintHouse), this._edge('to_' + this.hintHouse).stopS); this.hintEdges = uniqIds(hp.segs.map(function (q) { return q.e.id; })); }
      this.trail = this.trail.filter(function (id) { return !!self._edge(id); });
    }
  };
  function uniqIds(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
  P._newHouse = function (q, i) {
    var r = this._crng;
    return { id: q.id, i: i, sign: q.sign, color: q.color, thing: q.sign, seed: r.int(1, 1e6), x: 0, y: 0, _px: 0, _py: 0, S: this.layout.houseS, side: -1, stop: null, box: null,
      appear: 0, _pappear: 0, s: 0, _ps: 0, sV: 0, popped: false, door: 0, _pdoor: 0, lit: 0, _plit: 0, glow: 0, _pglow: 0, active: 0, squash: 0, squashV: 0, _psquash: 0,
      snow: 0, delivered: false, friend: null, friendAnimal: FRIENDS[r.int(0, FRIENDS.length - 1)], _glowT: 0, _doorTo: 0, _doorRate: 4 };
  };

  // ---------------------------------------------------------------- session flow
  P.newSession = function (opts) {
    this.age = this._pendingAge; this.lang = this._pendingLang;
    this.cur = null;
    this._relayout(false);
    this.sessions++;
    this._clearRound(); this.state = 'menu';
    var last = (opts && opts.lastTopics) || this.lastTopics || null;
    this.levels = BD.Content.topicsFor(this.age, this.rng, last);
    this._surpriseOff = this.rng.int(0, Math.max(0, this.cfg.surpriseTypes.length - 1));
    this.stars = 0; this._prevRule = null;
    this.weather = 0;
    this._emit({ type: 'session', levels: this.levels.slice() });
    this.startLevel(0);
  };
  P._clearRound = function () {
    this.houses = []; this.roads = null; this.roadReveal = this._proadReveal = 0; this._g = null; this.finger.down = false;
    this.flyers = []; this.mouse = null; this.bird = null; this.snowflakes = []; this.order = 0; this.orderObj = null; this._seq = null;
    this.hintHand = null; this.hintEdges = []; this.hintHouse = null; this.hintGlow = 0; this.assistId = null; this._surpriseAt = -1; this._demoAt = -1; this.trail = []; this._hintPending = false;
    var c = this.cart;
    c.state = 'hidden'; c.alpha = c._palpha = 0; c.cargo = null; c.cargoCount = 0; c.tgt = null; c.mode = null; c.spd = c.vel = 0; c.mdir = 0;
    c.lean = c.leanV = c.bounce = c.bounceV = c.squash = c.squashV = c.cargoHop = c.cargoHopV = c.hop = 0; c.face = c.faceS = 1; c.faceLock = false; c.k = this.layout.cartK;
    if (c.driving) { c.driving = false; }
    this._parkCart();
  };
  P.startLevel = function (i) {
    if (!this.levels.length) this.levels = BD.Content.topicsFor(this.age);
    this.level = clamp(i | 0, 0, this.levels.length - 1);
    this.topic = this.levels[this.level];
    this.weather = this.level % 4;
    this.round = 0; this.levelStars = 0; this.levelStartTime = this.time;
    this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.cur = null; this.talk = null; this.talkAnswered = null; this.surprise = null; this._usedKeys = []; this._prevRule = null;
    var SR = this.cfg.surpriseRounds || [2];
    this._surpriseRound = SR[this.rng.int(0, SR.length - 1)];
    this._clearRound(); this.wipe = null; this.sprinkles = [];
    this._relayout(false);
    this._setState('intro'); this.phase = null;
    this._mood('wave', 1.6);
    var c = this._centre();
    this._emit({ type: 'level', level: this.level, topic: this.topic, weather: this.weather, x: c.x, y: c.y });
  };
  P._surpriseType = function () {
    var ST = this.cfg.surpriseTypes;
    if (this.level === this.cfg.winterLevel && this.cfg.winterSurprise) return this.cfg.winterSurprise;
    if (!ST || !ST.length) return null;
    return ST[(this.level + this._surpriseOff) % ST.length];
  };
  /** Prepare the next round (map built, houses hidden, the cart at the bakery door); `build` starts when the wipe (if any) is over. */
  P._prepareRound = function () {
    var cfg = this.cfg;
    var rr = new BD.RNG((this.rng.next() * 4294967296) >>> 0);
    var sp = this.round === this._surpriseRound && this.round > 0 ? this._surpriseType() : null;
    var el = this.time - this.levelStartTime, sb = cfg.shortBudget, short = !!(sb && this.round > 0 && el > sb[Math.min(this.round, sb.length - 1)]);
    var v = this._view, maxN = World.maxHouses(v.W, v.H, v.ins, this.cfg);
    var cur = BD.Content.makeRound(this.topic, { age: this.age, lang: this.lang, rng: rr, roundIndex: this.round, surprise: sp, short: short, level: this.level,
      usedKeys: this._usedKeys, prevRule: this._prevRule, maxN: maxN });
    this._usedKeys.push(cur.key);
    this._clearRound();
    this.cur = cur; this.surprise = cur.surprise;
    this.misses = 0; this.streak = 0; this._noProg = 0; this._roundAssisted = false; this.order = 0; this.orderObj = cur.orders[0];
    this._buildMap(false);
    var c = this.cart, R = this.roads;
    c.edge = 'trunk'; c.s = 0; this._placeCart(); c._px = c.x; c._py = c.y; c.state = 'hidden'; c.alpha = 0;
    var self = this;
    this.houses.forEach(function (h) { h.snow = self.weather === 3 ? 1 : 0; });
    void R;
    this._setState('round'); this._setPhase('wipe');
  };
  P._beginBuild = function () {
    var cur = this.cur;
    this._setState('round'); this._setPhase('build');
    this._idleT = 0; this._idleGap = this.cfg.idleTime; this._idleN = 0;
    this.roadReveal = 0;
    this._mood('happy', 1.0);
    var c = this._centre();
    this._emit({ type: 'round', round: this.round, topic: this.topic, surprise: cur.surprise, n: cur.n, d: cur.d, forks: cur.map.forks, short: cur.short, key: cur.key, x: c.x, y: c.y });
  };
  P._beginLoad = function () {
    var cfg = this.cfg, o = this.orderObj, c = this.cart;
    this._setPhase('load');
    c.state = 'wait'; c.tgt = null; c.mode = null; c.cargo = null; c.cargoCount = 0;
    this._seq = { kind: 'load', n: o.cargo.kind === 'cookies' ? o.cargo.n : 0, i: 0, next: cfg.loadAt, T: o.cargo.kind === 'cookies' ? cfg.countLoad0 + cfg.countStep * o.cargo.n : cfg.loadTime };
    this._mood('happy', 0.8);
  };
  P._ask = function () {
    var cfg = this.cfg, o = this.orderObj, M = this._mouth();
    this._idleT = 0; this._idleGap = cfg.idleTime; this._idleN = 0;
    this._setPhase('play');
    this.cart.state = 'wait';
    this._mood('talk', 1.0);
    var ev = { type: 'ask', promptKey: o.promptKey, params: o.params, rule: o.rule, cargo: o.cargo, first: this.round === 0 && this.order === 0, orderIndex: this.order,
      left: this.cur.d - this.order, round: this.round, n: this.cur.n, d: this.cur.d, houseId: o.target, x: M.x, y: M.y };
    if (o.count !== undefined) ev.count = o.count;
    this._emit(ev);
    if (this.surprise && this.order === 0) this._surpriseAt = this.time + this._crng.float(cfg.surpriseAt[0], cfg.surpriseAt[1]);
    // the very first delivery of a session's first chapter: the ghost hand shows the drag (no hint penalty: hints never cost stars)
    if (this.level === 0 && this.round === 0 && this.order === 0) this._demoAt = this.time + cfg.demoDelay;
  };
  P._startTalk = function () {
    var rr = new BD.RNG((this.rng.next() * 4294967296) >>> 0);
    this.talk = BD.Content.makeTalk(this.topic, { age: this.age, lang: this.lang, rng: rr, level: this.level });
    this.talk.glowAnswer = false;
    this.talkAnswered = null; this._talkAskT = 0; this._talkAsks = 0;
    this.cur = null; this.phase = null;
    this._clearRound();
    this.cart.alpha = 1; this.cart.state = 'home';
    this._setState('talk');
    this._mood('talk', 1.2);
    var c = this._centre();
    this._emit({ type: 'talk', talk: this.talk, x: c.x, y: c.y });
  };
  P.talkAnswer = function (choiceId, auto) {
    if (this.state !== 'talk' || this.talkAnswered || !this.talk) return false;
    var ok = choiceId === this.talk.answer && !auto;
    this.talkAnswered = { choiceId: choiceId, correct: ok, auto: !!auto };
    if (ok) { this.stars += 1; this.levelStars += 1; this._mood('cheer'); } else this._mood(auto ? 'happy' : 'think');
    this.stateTime = 0;
    this._emit({ type: 'talkResult', correct: ok, choiceId: choiceId, answerId: this.talk.answer, auto: !!auto });
    return ok;
  };
  P._levelDone = function () { this._setState('levelDone'); this.phase = null; this._emit({ type: 'levelDone', level: this.level, stars: this.levelStars }); };

  // ---------------------------------------------------------------- input (logical px; ONE active pointer; a gesture = down … up)
  P._touch = function () { this._idleT = 0; this._idleGap = this.cfg.idleTime; };
  P._roadAt = function (x, y) {
    if (!this.roads) return null;
    var p = projectRoads(this.roads, x, y);
    return p && p.d <= this.layout.roadW / 2 + this.cfg.roadHitPad ? p : null;
  };
  P._houseAt = function (x, y) {
    var best = null, bd = 1e9;
    for (var i = 0; i < this.houses.length; i++) {
      var h = this.houses[i], b = this.houseHit(h.id);
      if (!b || x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue;
      var d = hyp(x - b.cx, y - b.cy);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  };
  /**
   * pointerDown(x, y) → 'cart' (grabbed: a drag) | 'house' (auto-drive there) | 'road' (auto-drive to that road point) | 'assist' |
   * 'mouse' | 'bird' | 'snow' | 'busy' (the cart is driving itself) | 'tupi' (a poke: fires on release) | 'soft' | null (not in a round).
   */
  P.pointerDown = function (x, y) {
    if (this._g || (this.state !== 'round' && this.state !== 'roundDone')) return null;
    this.finger.x = x; this.finger.y = y; this.finger.down = true;
    var g = this._g = { x0: x, y0: y, x: x, y: y, t: this.time, kind: 'soft', maxD: 0 };
    this._touch();
    return (g.kind = this._press(x, y, g));
  };
  P._press = function (x, y, g) {
    var play = this.state === 'round' && this.phase === 'play' && !!this.cur, inter = this.interactive, c = this.cart, ch = this.cartHit();
    var onCart = c.alpha > 0.3 && hyp(x - ch.x, y - ch.y) <= ch.r;
    if (inter && this.assistId) {   // assist: the next press anywhere drives to the right house
      var a = this.houseById(this.assistId);
      this._roundAssisted = true;
      this._emit({ type: 'assist', houseId: a.id, x: a.x, y: a.y });
      this.assistId = null;
      this._autoDrive(a, 'auto');
      return 'assist';
    }
    if (!onCart) {
      if (this._mouseAt(x, y)) { this._tapMouse(); return 'mouse'; }
      if (this._birdAt(x, y)) { this._tapBird(); return 'bird'; }
      var sf = this._snowAt(x, y);
      if (sf) { this._tapSnow(sf); return 'snow'; }
    }
    if (onCart) {
      if (inter) { this._grab(x, y); return 'cart'; }
      if (play && (c.state === 'auto' || c.state === 'reverse')) return 'busy';
      return 'tupi';
    }
    if (play && (c.state === 'reverse' || c.state === 'auto')) return this._soft(x, y, false);   // driving itself: taps never re-route it
    if (inter) {
      var h = this._houseAt(x, y);
      if (h) { this._emit({ type: 'autoDrive', houseId: h.id, x: h.x, y: h.y }); this._autoDrive(h, 'auto'); return 'house'; }
      var r = this._roadAt(x, y);
      if (r) {
        var s = this._clampS(r.e, r.s);
        if (r.e.house && s >= this.cfg.autoRollFrac * r.e.stopS) { var hh = this.houseById(r.e.house); this._emit({ type: 'autoDrive', houseId: hh.id, x: r.x, y: r.y }); this._autoDrive(hh, 'auto'); }
        else { this._emit({ type: 'autoDrive', x: r.x, y: r.y }); this._driveTo(r.e.id, s, 'auto', null); }
        return 'road';
      }
    }
    return this._soft(x, y, inter);
  };
  P._soft = function (x, y, count) {
    this._emit({ type: 'soft', x: x, y: y });
    if (count) this._noProgress(false);
    return 'soft';
  };
  P._grab = function (x, y) {
    var c = this.cart;
    c.state = 'drag'; c.mode = 'drag'; c.faceLock = false;
    c.tgt = { edge: c.edge, s: c.s, house: null };
    this._dragEdge = this._edge(c.edge);
    this._emit({ type: 'grab', x: c.x, y: c.y - 0.5 * this.cartExt().up });
  };
  P.pointerMove = function (x, y) {
    var g = this._g;
    if (!g) return;
    g.maxD = Math.max(g.maxD, hyp(x - g.x0, y - g.y0));
    this.finger.x = x; this.finger.y = y; g.x = x; g.y = y;
    if (g.kind === 'cart' && this.cart.state === 'drag' && this.roads) {
      // the finger is projected onto the nearest road point (hysteresis: stay on the current branch near a fork)
      var p = projectRoads(this.roads, x, y, this._dragEdge, this.cfg.grabHyst);
      if (p && p.d <= this.layout.roadW / 2 + this.cfg.projectR) {
        this._dragEdge = p.e;
        this.cart.tgt = { edge: p.e.id, s: this._clampS(p.e, p.s), house: null };
      }
    }
  };
  /** → 'honk' | 'pokeTupi' | 'up' | null */
  P.pointerUp = function (x, y) {
    var g = this._g, cfg = this.cfg;
    this._g = null; this.finger.down = false;
    if (!g) return null;
    if (x === undefined) { x = g.x; y = g.y; }
    var mv = Math.max(g.maxD, hyp(x - g.x0, y - g.y0)), tap = mv < cfg.tapMovePx && this.time - g.t < cfg.tapTime;
    if (g.kind === 'cart' && this.cart.state === 'drag') {
      if (tap) { this._release(true); return this._honk(); }
      this._release(false);
      return 'up';
    }
    if (g.kind === 'tupi' && tap && (this.state === 'round' || this.state === 'roundDone')) return this._pokeTupi();
    return 'up';
  };
  /** The finger left (touchcancel / pause / rotation): the gesture ends without a judgement; a dragged cart rolls to a stop. */
  P.cancelDrag = function () {
    var g = this._g;
    this._g = null; this.finger.down = false;
    if (g && g.kind === 'cart' && this.cart.state === 'drag') this._release(false);
  };
  /** Release after a drag: the cart rolls to a stop (or into the house when past 80 % of a branch). */
  P._release = function (tap) {
    var c = this.cart, cfg = this.cfg, e = this._edge(c.edge);
    if (tap) { c.tgt = { edge: c.edge, s: c.s, house: null }; c.state = 'coast'; c.mode = 'coast'; return; }
    if (e && e.house && c.s >= cfg.autoRollFrac * e.stopS) { this._autoDrive(this.houseById(e.house), 'auto'); return; }
    // roll on along the way it was going: braking distance v² / 2a, never past the finger's point
    var d = c.spd * c.spd / (2 * cfg.coastDecel), tg = c.tgt;
    if (tg && e) {
      var p = treePath(this.roads, e, c.s, this._edge(tg.edge), tg.s);
      d = Math.min(d, p.len);
      var pos = this._walk(p, d);
      c.tgt = { edge: pos.e.id, s: pos.s, house: null };
    } else c.tgt = { edge: c.edge, s: c.s, house: null };
    c.state = 'coast'; c.mode = 'coast';
  };
  P._clampS = function (e, s) { var lo = e.id === 'trunk' && this.roads ? this.roads.start.s : 0, hi = e.stopS !== undefined ? e.stopS : e.len; return clamp(s, lo, hi); };
  P._autoDrive = function (h, mode) { var e = this._edge('to_' + h.id); if (e) this._driveTo(e.id, e.stopS, mode || 'auto', h.id); };
  P._driveTo = function (edgeId, s, mode, houseId) {
    var c = this.cart;
    c.tgt = { edge: edgeId, s: s, house: houseId || null };
    c.mode = mode; c.state = mode === 'auto' ? 'auto' : mode;
    if (mode !== 'reverse') c.faceLock = false;
  };
  P._honk = function () {
    var a = this.prompt(), M = this._mouth();
    this._mood('honk', this.cfg.honkTime);
    var ev = { type: 'honk', x: M.x, y: M.y };
    if (a) { ev.promptKey = a.promptKey; ev.params = a.params; ev.rule = a.rule; ev.left = a.left; ev.cargo = a.cargo; if (a.count !== undefined) ev.count = a.count; }
    this._emit(ev);
    if (this.interactive) this._noProgress(false);   // a tap is not a drive — never a mistake, but no progress either (3 → the drag demo)
    return 'honk';
  };
  P._pokeTupi = function () {
    var a = this.prompt(), M = this._mouth();
    this._touch();
    this._mood('giggle');
    var ev = { type: 'pokeTupi', x: M.x, y: M.y };
    if (a) { ev.promptKey = a.promptKey; ev.params = a.params; ev.left = a.left; } else ev.busy = true;
    this._emit(ev);
    this.cart.squashV += kickFor(0.06, this.cfg.sqOmega, this.cfg.sqZeta);
    return 'pokeTupi';
  };

  // ---------------------------------------------------------------- arriving
  P._arrive = function (h) {
    var cfg = this.cfg, c = this.cart, o = this.orderObj, L = this.layout;
    this.cancelDrag();
    c.state = 'arrive'; c.mode = null; c.tgt = null; c.spd = 0; c.vel = 0;
    c.squashV += kickFor(cfg.brakeSq, cfg.sqOmega, cfg.sqZeta);
    this._setPhase('arrive');
    if (h.id === o.target) {
      this.streak = 0; this._noProg = 0; this._touch();
      this.hintHand = null; this.hintEdges = []; this.hintHouse = null; this.assistId = null; h._glowT = 0; this._hintPending = false;
      var ev = { type: 'right', houseId: h.id, cargo: o.cargo, rule: o.rule, orderIndex: this.order, left: this.cur.d - this.order - 1, misses: this.misses, x: h.x, y: h.y - 0.5 * h.S };
      if (o.count !== undefined) ev.count = o.count;
      if (o.cargo.kind === 'animal') ev.home = o.cargo.home;
      this._emit(ev);
      this._mood('hand', cfg.moodTime.hand);
      h.delivered = true;
      h.friend = { animal: o.cargo.kind === 'animal' ? o.cargo.animal : h.friendAnimal, t: 0, state: 'wait', pop: 0, _ppop: 0, wave: 0, shake: 0, _pshake: 0 };
      this._seq = { kind: 'right', h: h, t: 0, delivered: false, hearts: 0, flew: false };
    } else {
      this.misses++; this.streak++;
      this._mood('oops');
      c.bounceV += kickFor(cfg.bumpPeak * 1.2, cfg.bounceOmega, cfg.bounceZeta);
      h.squashV += kickFor(0.06, cfg.sqOmega, cfg.sqZeta);
      var want = { kind: o.rule.kind, value: o.rule.value, nameKind: o.rule.nameKind, nameValue: o.rule.value, promptKey: o.promptKey, params: o.params, cargo: o.cargo, houseId: o.target };
      if (o.count !== undefined) want.count = o.count;
      var ew = { type: 'wrong', houseId: h.id, sign: h.sign, got: { nameKind: h.sign.nameKind, nameValue: h.sign.nameValue }, want: want, streak: this.streak, misses: this.misses,
        cargo: o.cargo, x: h.x, y: h.y - 0.5 * h.S };
      this._emit(ew);
      h.friend = { animal: h.friendAnimal, t: 0, state: 'wait', pop: 0, _ppop: 0, wave: 0, shake: 0, _pshake: 0 };
      this._seq = { kind: 'wrong', h: h, t: 0 };
      var h0 = this._lastHintT;
      this._noProgress(true);
      if (this._lastHintT !== h0) ew.hint = true;
    }
    void L;
  };
  P._stepArrive = function (h) {
    var Q = this._seq, cfg = this.cfg, c = this.cart, H = Q && Q.h, t;
    if (!Q || (Q.kind !== 'right' && Q.kind !== 'wrong')) return;
    Q.t += h; t = Q.t;
    var f = H.friend;
    if (Q.kind === 'right') {
      if (t >= cfg.doorOpen[0] && t < cfg.doorClose[0]) H._doorTo = 1;
      if (t >= cfg.doorClose[0]) { H._doorTo = 0; if (f && f.state !== 'in') f.state = 'in'; }
      if (!Q.flew && t >= cfg.deliverAt) {   // the cargo hops from the tray to the door (an arc)
        Q.flew = true;
        var from = this._tray(), cargo = c.cargo || this.orderObj.cargo;
        c.cargo = null; c.cargoCount = 0;
        this.flyers.push(this._flyer(cargo, from, { x: H.x, y: H.y - 0.22 * H.S }, cfg.deliverArc, 'deliver', H.id));
      }
      if (!Q.delivered && t >= cfg.deliverAt + cfg.deliverArc) {
        Q.delivered = true;
        if (f) { f.state = 'out'; f.t = 0; }
        this._emit({ type: 'deliver', houseId: H.id, cargo: this.orderObj.cargo, animal: f ? f.animal : null, x: H.x, y: H.y - 0.3 * H.S });
        this._mood('happy', 1.2);
      }
      if (Q.delivered) H.lit = Math.min(1, H.lit + h / cfg.litTime);
      if (t >= cfg.heartsAt && Q.hearts < cfg.heartsN && t >= cfg.heartsAt + Q.hearts * cfg.heartsGap) {
        if (Q.hearts === 0) { var ch = this._chimney(H); this._emit({ type: 'hearts', houseId: H.id, x: ch.x, y: ch.y }); }
        Q.hearts++; this._heartPuff(H);
      }
      if (t >= cfg.rightTime) {
        this._seq = null;
        if (this.order >= this.cur.d - 1) this._startParty();
        else {
          this.order++; this.orderObj = this.cur.orders[this.order];
          this._setPhase('return');
          this._driveTo('trunk', this.roads.start.s, 'return', null);
          this._emit({ type: 'back', x: c.x, y: c.y });
        }
      }
    } else {
      if (t >= 0.1 && t < cfg.wrongPeek[1]) H._doorTo = cfg.wrongCrack;
      if (t >= cfg.wrongPeek[0] && f && f.state === 'wait') { f.state = 'peek'; f.t = 0; }
      if (t >= cfg.wrongPeek[1]) { H._doorTo = 0; if (f) f.state = 'in'; }
      if (t >= cfg.wrongTime) {
        this._seq = null;
        H.friend = null;
        var e = this._edge(c.edge);
        this._setPhase('play');
        this._mood('think', 1.4);
        this._driveTo(e.id, 0, 'reverse', null);
        c.faceLock = true;
        this._emit({ type: 'reverse', x: c.x, y: c.y });
      }
    }
  };
  P._chimney = function (H) {
    var b = null;
    try { if (BD.HouseArt && typeof BD.HouseArt.houseBox === 'function') b = BD.HouseArt.houseBox(H.S); } catch (e) { b = null; }
    if (b && Array.isArray(b.chimney) && isFinite(b.chimney[0]) && isFinite(b.chimney[1])) return { x: H.x + b.chimney[0], y: H.y + b.chimney[1] };
    return { x: H.x + 0.26 * H.S, y: H.y - 0.95 * H.S };
  };
  P._heartPuff = function (H) {
    var r = this._crng, ch = this._chimney(H);
    if (this.puffs.length >= this.cfg.puffCap) this.puffs.shift();
    this.puffs.push({ kind: 'heart', x: ch.x, y: ch.y, _px: ch.x, _py: ch.y, x0: ch.x, vx: r.float(-8, 8), vy: -r.float(38, 52), r: 8, _pr: 8, r1: r.float(14, 18), a: 0, _pa: 0, t: 0, life: 1.6, rot: r.float(-0.2, 0.2), ph: r.float(0, TAU) });
  };
  P._flyer = function (thing, from, to, T, kind, houseId) {
    var f = { thing: thing, kind: kind, houseId: houseId || null, x: from.x, y: from.y, _px: from.x, _py: from.y, x0: from.x, y0: from.y, x1: to.x, y1: to.y, t: 0, T: T,
      arc: Math.max(50, 0.25 * hyp(to.x - from.x, to.y - from.y)), s: 1, _ps: 1, rot: 0, _prot: 0, spin: this._crng.float(-3, 3), alpha: 1, done: false };
    return f;
  };
  /** After a rotation: a flyer keeps its progress, its ends move to the new spots. */
  P._reaimFlyer = function (f) {
    var u = clamp(f.t / f.T, 0, 1);
    if (f.kind === 'deliver' && f.houseId) { var H = this.houseById(f.houseId); if (H) { f.x1 = H.x; f.y1 = H.y - 0.22 * H.S; } }
    else { var tr = this._tray(); f.x1 = tr.x; f.y1 = tr.y; var ov = this.layout.oven; f.x0 = ov.x; f.y0 = ov.y; }
    if (u < 1) { f.x = lerp(f.x0, f.x1, u); f.y = lerp(f.y0, f.y1, u); }
    f._px = f.x; f._py = f.y;
  };
  P._stepFlyers = function (h) {
    for (var i = this.flyers.length - 1; i >= 0; i--) {
      var f = this.flyers[i];
      f.t += h;
      if (f.kind === 'load') { var tr = this._tray(); f.x1 = tr.x; f.y1 = tr.y - 2; }
      var u = clamp(f.t / f.T, 0, 1);
      f.x = lerp(f.x0, f.x1, u); f.y = lerp(f.y0, f.y1, u) - f.arc * 4 * u * (1 - u);
      f.rot = f.spin * Math.sin(Math.PI * u) * 0.25;
      f.s = 1 + 0.18 * Math.sin(Math.PI * u);
      if (u >= 1) {
        this.flyers.splice(i, 1);
        if (f.kind === 'load') this._landCargo(f);
      }
    }
  };
  P._landCargo = function (f) {
    var c = this.cart, cfg = this.cfg, o = this.orderObj;
    if (!o) return;
    c.cargo = o.cargo;
    if (o.cargo.kind === 'cookies') c.cargoCount = Math.min(o.cargo.n, c.cargoCount + 1);
    c.cargoHopV += kickFor(5, cfg.cargoOmega, cfg.cargoZeta);
    c.squashV += kickFor(0.04, cfg.sqOmega, cfg.sqZeta);
    void f;
  };

  // ---------------------------------------------------------------- party (≈ 2.4 s)
  P._startParty = function () {
    var c = this.cart, self = this;
    this._setPhase('party');
    this._seq = { kind: 'party', t: 0, acc: 0, honked: false };
    this._mood('honk', this.cfg.honkTime);
    var M = this._mouth();
    this._emit({ type: 'party', x: M.x, y: M.y });
    this.houses.forEach(function (h) { if (h.delivered) { h._partyPuffs = 2; } });
    void c; void self;
  };
  P._stepParty = function (h) {
    var Q = this._seq, cfg = this.cfg, self = this;
    if (!Q || Q.kind !== 'party') return;
    Q.t += h;
    if (Q.t >= cfg.honkTime && this.tupi.mood !== 'spray' && Q.t < cfg.sprayEnd) { this._mood('spray', cfg.sprayEnd - cfg.honkTime + 0.2); this._emit({ type: 'spray', x: this._trunkTip().x, y: this._trunkTip().y }); }
    if (Q.t >= cfg.honkTime && Q.t < cfg.sprayEnd) {
      Q.acc += h * cfg.sprinkleRate;
      while (Q.acc >= 1) { Q.acc -= 1; this._sprinkle(); }
    }
    this.houses.forEach(function (H) {
      if (!H.delivered) return;
      H.lit = Math.min(1, H.lit + h / cfg.litTime);
      if (H._partyPuffs > 0 && Q.t >= 0.3 + (2 - H._partyPuffs) * 0.35) { H._partyPuffs--; self._heartPuff(H); }
    });
    if (Q.t >= cfg.partyTime) { this._seq = null; this._roundDone(); }
  };
  P._sprinkle = function () {
    var cfg = this.cfg, r = this._crng, tip = this._trunkTip(), c = this.cart, L = this.layout;
    if (this.sprinkles.length >= cfg.sprinkleCap) this.sprinkles.shift();
    var ang = cfg.sprinkleAng + r.float(-cfg.sprinkleSpread, cfg.sprinkleSpread), v = r.float(cfg.sprinkleV[0], cfg.sprinkleV[1]);
    var vx = Math.cos(ang) * v * (c.faceS >= 0 ? 1 : -1), vy = Math.sin(ang) * v;
    var floor = clamp(c.y + r.float(-24, 46), L.play.y0 + 10, L.H - L.ins.bottom - 4);
    this.sprinkles.push({ kind: r.int(0, 5), x: tip.x, y: tip.y, _px: tip.x, _py: tip.y, vx: vx, vy: vy, rot: r.float(0, TAU), _prot: 0, spin: r.float(-9, 9),
      r: r.float(3, 5), a: 1, _pa: 1, floor: floor, bounced: false, t: 0, life: 0 });
  };
  P._stepSprinkles = function (h) {
    var g = this.cfg.sprinkleG, L = this.layout;
    for (var i = this.sprinkles.length - 1; i >= 0; i--) {
      var p = this.sprinkles[i];
      p.t += h;
      if (p.life > 0) {   // resting on the table: fade
        p.life -= h; p.a = clamp(p.life / this.cfg.sprinkleLife, 0, 1);
        if (p.life <= 0) { this.sprinkles.splice(i, 1); continue; }
        continue;
      }
      p.vy += g * h; p.x += p.vx * h; p.y += p.vy * h; p.rot += p.spin * h;
      if (p.vy > 0 && p.y >= p.floor) {
        p.y = p.floor;
        if (!p.bounced) { p.bounced = true; p.vy *= -0.35; p.vx *= 0.6; p.spin *= 0.5; }
        else { p.vy = 0; p.vx = 0; p.spin = 0; p.life = this.cfg.sprinkleLife; }
      }
      if (p.x < -20 || p.x > L.W + 20 || p.t > 4) this.sprinkles.splice(i, 1);
    }
  };

  // ---------------------------------------------------------------- round end, wipe
  P._starsFor = function (m) { return m <= 0 ? 3 : m === 1 ? 2 : 1; };
  P._roundDone = function () {
    var st = this._starsFor(this.misses), M = this._mouth();
    if (this._roundAssisted) st = Math.min(st, 2);   // an assisted round ≤ 2★
    this.roundStars = st; this.stars += st; this.levelStars += st;
    var last = this.cur.orders[this.cur.orders.length - 1];
    this._prevRule = { kind: last.rule.kind, value: last.rule.value };
    this.cancelDrag(); this.hintHand = null; this.assistId = null; this.hintEdges = []; this.hintHouse = null;
    this._setState('roundDone');
    this._emit({ type: 'roundDone', round: this.round, stars: st, misses: this.misses, assisted: !!this._roundAssisted, x: M.x, y: M.y - 60 });
    this._mood('cheer', 1.0);
    this._startWipe();
  };
  P._startWipe = function () {
    var L = this.layout;
    this._setPhase('wipe');
    this.wipe = { t: 0, _pt: 0, dir: { x: L.flow.x, y: L.flow.y }, season: this.weather, swapped: false };
    var c = this._centre();
    this._emit({ type: 'wipe', season: this.weather, dir: this.wipe.dir, x: c.x, y: c.y });
  };
  P._stepWipe = function (h) {
    var wp = this.wipe, cfg = this.cfg;
    if (!wp) return;
    wp.t = Math.min(1, wp.t + h / cfg.wipeTime);
    if (!wp.swapped && wp.t >= cfg.wipeSwap) { wp.swapped = true; this._swap(); }
    if (wp.swapped && wp.t >= cfg.wipeBuild && this.state === 'round' && this.phase === 'wipe') this._beginBuild();
    if (wp.t >= 1) this.wipe = null;
  };
  /** The screen is covered: the next round's map (hidden houses, no road, the cart at the bakery door), or Talk time. */
  P._swap = function () {
    var cfg = this.cfg;
    this.cur = null;
    this.round++;
    this.sprinkles = [];
    var el = this.time - this.levelStartTime, long = this.round >= cfg.chapterMinRounds && el > cfg.chapterTimeLimit;
    if (this.round < this.roundsPerLevel && !long) this._prepareRound();
    else { if (this.round < this.roundsPerLevel) this.roundsPerLevel = this.round; this._startTalk(); }
  };

  // ---------------------------------------------------------------- help
  P._noProgress = function (miss) {
    var cfg = this.cfg;
    this._noProg++;
    if ((miss && this.misses >= cfg.hintAfterMisses) || (!miss && this._noProg >= cfg.hintAfterSoft)) this._autoHint(false);
    if ((this._noProg >= cfg.assistAfter || this.misses >= cfg.assistAfterMisses) && !this.assistId && this.orderObj) {
      var h = this._targetHouse();
      if (h) { this.assistId = h.id; this._emit({ type: 'assistArmed', houseId: h.id, x: h.x, y: h.y }); }
    }
  };
  P.resetNudges = function () {
    this._idleT = 0; this._idleGap = this.cfg.idleTime; this._idleN = 0;
    this._talkAskT = 0; this._talkAsks = 0;
    if (this.talk) this.talk.glowAnswer = false;
  };
  P._glowing = function () { for (var i = 0; i < this.houses.length; i++) if (this.houses[i]._glowT > 0) return true; return false; };
  P._autoHint = function (fromIdle) {
    if (this._glowing() || this.hintHand || this.time - this._lastHintT < this.cfg.hintCooldown) return null;
    if (!this.interactive) { this._hintPending = true; return null; }   // e.g. at a wrong house: shown once the cart is back at the fork
    this._hintPending = false;
    return this._doHint(fromIdle, false);
  };
  P._doHint = function (fromIdle, demo) {
    var cfg = this.cfg, o = this.orderObj;
    if (!this.interactive || !o) return null;
    var H = this._targetHouse(), c = this.cart;
    if (!H) return null;
    H._glowT = cfg.hintTime;
    var e2 = this._edge('to_' + H.id), p = treePath(this.roads, this._edge(c.edge), c.s, e2, e2.stopS);
    this.hintEdges = uniqIds(p.segs.map(function (q) { return q.e.id; }));
    this.hintHouse = H.id; this._hintT = cfg.hintTime;
    this._startHintHand(H.id, demo);
    this._lastHintT = this.time;
    if (!demo) this._mood('talk', 1.2);
    var want = { kind: o.rule.kind, value: o.rule.value, nameKind: o.rule.nameKind, nameValue: o.rule.value, promptKey: o.promptKey, params: o.params, cargo: o.cargo, houseId: H.id };
    if (o.count !== undefined) want.count = o.count;
    var ev = { type: 'hint', houseId: H.id, edges: this.hintEdges.slice(), want: want, x: H.x, y: H.y - 0.5 * H.S };
    if (fromIdle) ev.idle = true;
    if (demo) ev.demo = true;
    this._emit(ev);
    return { houseId: H.id, id: H.id };
  };
  /** Manual hint (a tap on the speech bubble): the route glows, the house glows, the ghost hand drags the way. */
  P.hint = function () {
    if (!this.interactive) return null;
    if (this.hintHand && this.hintHouse) return { houseId: this.hintHouse, id: this.hintHouse };
    return this._doHint(false, false);
  };
  P._startHintHand = function (houseId, demo) {
    var pts = this.route(houseId);
    if (!pts.length) { this.hintHand = null; return; }
    var p = pts[0];
    this.hintHand = { houseId: houseId, x: p[0], y: p[1], _px: p[0], _py: p[1], t: 0, press: 0, alpha: 0, time: 0, T: this.cfg.hintCycle * this.cfg.hintDrags, pts: pts, demo: !!demo, cycle: 0 };
  };
  /** Ghost hand (1.6 s per drag, twice): appears on the cart (0.2 s, presses), drags along the route (1.15 s), lifts and fades (0.25 s).
   *  Fingertip = (x, y). */
  P._stepHint = function (h) {
    var H = this.hintHand, cfg = this.cfg;
    if (this._hintT > 0) { this._hintT -= h; if (this._hintT <= 0) { this.hintEdges = []; this.hintHouse = null; } }
    this.hintGlow += ((this.hintEdges.length ? 1 : 0) - this.hintGlow) * Math.min(1, h * (this.hintEdges.length ? 6 : 3));
    if (!H) return;
    H.time += h;
    if (H.time >= H.T || this.state !== 'round' || this.phase !== 'play' || !this.interactive || this.cart.state === 'drag') { this.hintHand = null; return; }
    var cyc = Math.floor(H.time / cfg.hintCycle);
    if (cyc !== H.cycle) { H.cycle = cyc; var np = this.route(H.houseId); if (np.length) H.pts = np; }
    var u = (H.time % cfg.hintCycle) / cfg.hintCycle, pts = H.pts, n = pts.length - 1, x, y, press = 0, a = 1;
    if (u < 0.125) { x = pts[0][0] + 30 * (1 - u / 0.125); y = pts[0][1] - 0.45 * this.cartExt().up + 50 * (1 - u / 0.125); press = smooth(u / 0.125); a = smooth(u / 0.1); }
    else if (u < 0.845) {
      var v = smooth((u - 0.125) / 0.72), f = v * n, i = Math.min(n - 1, Math.floor(f)), w = f - i;
      var lift = 0.45 * this.cartExt().up * (1 - v);   // starts on the cart body, slides down onto the road
      x = n > 0 ? lerp(pts[i][0], pts[i + 1][0], w) : pts[0][0]; y = (n > 0 ? lerp(pts[i][1], pts[i + 1][1], w) : pts[0][1]) - lift; press = 1;
    } else { var q = (u - 0.845) / 0.155; x = pts[n][0] + 10 * q; y = pts[n][1] + 18 * q; press = 1 - smooth(q * 2); a = 1 - smooth(q); }
    H.alpha = a * clamp((H.T - H.time) / 0.3, 0, 1);
    H.x = x; H.y = y; H.t = u; H.press = press;
  };

  // ---------------------------------------------------------------- cart motion
  /** World position on the tree for the cart's (edge, s) + tangent. */
  P._placeCart = function () {
    var c = this.cart, e = this._edge(c.edge);
    if (!e) { this._parkCart(); return; }
    var q = edgeAt(e, c.s);
    c.x = q.x; c.y = q.y;
    return q;
  };
  /** Walk `d` px along a path → {e, s} (+ crossed nodes / bumps reported through the callbacks). */
  P._walk = function (path, d, onNode, onBump) {
    var segs = path.segs, rem = d;
    for (var i = 0; i < segs.length; i++) {
      var sg = segs[i], L0 = Math.abs(sg.b - sg.a), dir = sg.b >= sg.a ? 1 : -1;
      var step = Math.min(rem, L0), s1 = sg.a + dir * step;
      if (onBump) for (var k = 0; k < sg.e.bumps.length; k++) { var b = sg.e.bumps[k]; if ((dir > 0 && b > sg.a && b <= s1) || (dir < 0 && b < sg.a && b >= s1)) onBump(sg.e, b); }
      rem -= step;
      if (rem <= 1e-9 || i === segs.length - 1) return { e: sg.e, s: s1 };
      if (onNode) onNode(dir > 0 ? sg.e.to : sg.e.from);
    }
    return { e: segs[segs.length - 1].e, s: segs[segs.length - 1].b };
  };
  P._stepCart = function (h) {
    var c = this.cart, cfg = this.cfg, L = this.layout, self = this;
    var spd0 = c.spd, moved = 0;
    if (this.roads && c.tgt && (c.state === 'drag' || c.state === 'coast' || c.state === 'auto' || c.state === 'return' || c.state === 'reverse' || c.state === 'rollout')) {
      var e1 = this._edge(c.edge), e2 = this._edge(c.tgt.edge);
      if (e1 && e2) {
        var path = treePath(this.roads, e1, c.s, e2, c.tgt.s), D = path.len, sg0 = path.segs[0], d0 = sg0.b > sg0.a + 1e-9 ? 1 : sg0.b < sg0.a - 1e-9 ? -1 : (path.segs[1] ? (path.segs[1].b >= path.segs[1].a ? 1 : -1) : 0);
        var vmax = c.state === 'drag' ? cfg.vDrag : c.state === 'return' ? cfg.vReturn : c.state === 'reverse' ? cfg.vReverse : c.state === 'rollout' ? cfg.vRollOut : c.state === 'coast' ? cfg.vAuto : cfg.vAuto;
        var vd = c.state === 'drag' ? Math.min(vmax, cfg.kApproach * D) : Math.min(vmax, Math.sqrt(2 * cfg.autoDecel * Math.max(0, D)) + (D > 2 ? 30 : 0));
        if (D < 0.5) vd = 0;
        var brake = Math.max(cfg.accel, (c.state === 'drag' ? cfg.vDrag : vmax) / cfg.brakeTime);
        if (c.mdir !== 0 && d0 !== 0 && d0 !== c.mdir && c.spd > 1) {
          // the goal is behind: brake first (keep rolling the old way on this edge), then turn round
          c.spd = Math.max(0, c.spd - brake * h);
          var ns = clamp(c.s + c.mdir * c.spd * h, 0, e1.len);
          moved = Math.abs(ns - c.s);
          this._bumpsBetween(e1, c.s, ns);
          c.s = ns;
          if (c.spd <= 1 || ns <= 0 || ns >= e1.len) { c.spd = 0; }
        } else {
          if (d0 !== 0) c.mdir = d0;
          if (vd > c.spd) c.spd = Math.min(vd, c.spd + cfg.accel * h);
          else c.spd = Math.max(vd, c.spd - brake * h);
          var step = Math.min(c.spd * h, D);
          if (step > 0) {
            var pos = this._walk(path, step, function (nid) { var nd = self._node(nid); if (nd && nd.kind === 'fork') self._emit({ type: 'fork', node: nid, x: nd.x, y: nd.y }); },
              function (e, s) { self._bump(e, s); });
            if (pos.e !== e1) { c.mdir = path.segs.length > 1 ? (function () { for (var i = 0; i < path.segs.length; i++) if (path.segs[i].e === pos.e) return path.segs[i].b >= path.segs[i].a ? 1 : -1; return c.mdir; })() : c.mdir; if (this.trail.indexOf(pos.e.id) < 0) this.trail.push(pos.e.id); }
            c.edge = pos.e.id; c.s = pos.s; moved = step;
          }
          if (D - step < 0.5 && vd === 0) c.spd = 0;
        }
        if (this.trail.indexOf(c.edge) < 0) this.trail.push(c.edge);
      }
    } else if (c.state !== 'drag') { c.spd = Math.max(0, c.spd - cfg.accel * 2 * h); }
    c.vel = c.mdir * c.spd;
    var q = this._placeCart() || { tx: 1, ty: 0 };
    // direction of motion, facing (squash-flip turn), acceleration lean + curve lean, wheels, bumps, dust
    if (c.spd > 2 && c.mdir) { c.dir = { x: q.tx * c.mdir, y: q.ty * c.mdir }; }
    if (!c.faceLock && c.spd > 2 && Math.abs(c.dir.x) > cfg.faceMinX) c.face = c.dir.x > 0 ? 1 : -1;
    var fr = 2 / cfg.faceTime;
    c.faceS = c.face > c.faceS ? Math.min(c.face, c.faceS + fr * h) : Math.max(c.face, c.faceS - fr * h);
    c.hop = cfg.faceHop * (1 - c.faceS * c.faceS);
    var acc = (c.spd - spd0) / h;
    c.accel = acc;
    var fwd = (c.dir.x >= 0 ? 1 : -1) === c.face || Math.abs(c.dir.x) < 0.2 ? 1 : -1;
    var e = this._edge(c.edge), kap = e && c.spd > 2 ? edgeCurv(e, c.s) * c.mdir : 0;
    c.curv = kap;
    var tl = clamp(-cfg.leanAcc * acc * fwd + cfg.leanCurve * kap * c.spd * c.spd * c.face, -cfg.leanMax, cfg.leanMax);
    spring(c, 'lean', 'leanV', tl, cfg.leanOmega, cfg.leanZeta, h);
    c.lean = clamp(c.lean, -cfg.leanMax * 1.4, cfg.leanMax * 1.4);
    var wr = (tupiPoints().cart.wheels[0][2] || 34) * c.k;
    c.wheelRot += fwd * moved / Math.max(1, wr);
    spring(c, 'bounce', 'bounceV', 0, cfg.bounceOmega, cfg.bounceZeta, h);
    spring(c, 'squash', 'squashV', 0, cfg.sqOmega, cfg.sqZeta, h);
    spring(c, 'cargoHop', 'cargoHopV', 0, cfg.cargoOmega, cfg.cargoZeta, h);
    c.squash = clamp(c.squash, -0.2, 0.25); c.bounce = clamp(c.bounce, -10, 30);
    c.sy = 1 - c.squash; c.sx = 1 + 0.5 * c.squash;
    if (c.spd > cfg.dustSpeed) {
      c._dustT -= h;
      if (c._dustT <= 0) { c._dustT = cfg.dustEvery; this._dust(); }
    }
    if (!c.driving && c.spd > cfg.driveOn) { c.driving = true; this._emit({ type: 'drive', on: true, x: c.x, y: c.y }); }
    else if (c.driving && c.spd < cfg.driveOff) { c.driving = false; this._emit({ type: 'drive', on: false, x: c.x, y: c.y }); }
    if (!(isFinite(c.x) && isFinite(c.y) && isFinite(c.s))) { c.edge = 'trunk'; c.s = this.roads ? this.roads.start.s : 0; c.spd = 0; this._placeCart(); }
    void L;
  };
  /** Is the cart at its target (by the tree path: a fork point is the end of one edge and the start of another)? */
  P._atTarget = function () {
    var c = this.cart, e1 = this._edge(c.edge), e2 = c.tgt ? this._edge(c.tgt.edge) : null;
    return !!(e1 && e2) && treePath(this.roads, e1, c.s, e2, c.tgt.s).len < 0.5;
  };
  P._node = function (id) { var R = this.roads; if (!R) return null; for (var i = 0; i < R.nodes.length; i++) if (R.nodes[i].id === id) return R.nodes[i]; return null; };
  P._bumpsBetween = function (e, a, b) { for (var k = 0; k < e.bumps.length; k++) { var s = e.bumps[k]; if ((s > Math.min(a, b) && s <= Math.max(a, b))) this._bump(e, s); } };
  P._bump = function (e, s) {
    var c = this.cart, cfg = this.cfg, k = clamp(c.spd / 500, 0.3, 1.2);
    c.bounceV += kickFor(cfg.bumpPeak * k, cfg.bounceOmega, cfg.bounceZeta);
    c.cargoHopV += kickFor(cfg.bumpPeak * 0.8 * k, cfg.cargoOmega, cfg.cargoZeta);
    c.squashV -= kickFor(cfg.bumpSq * k, cfg.sqOmega, cfg.sqZeta);
    if (c.spd > 80) { var q = edgeAt(e, s); this._emit({ type: 'bump', x: q.x, y: q.y }); }
  };
  P._dust = function () {
    var c = this.cart, r = this._crng, L = this.layout;
    if (this.puffs.length >= this.cfg.puffCap) this.puffs.shift();
    var bx = c.x - c.dir.x * this.cartExt().half * 0.55, by = c.y - 4;
    this.puffs.push({ kind: 'dust', x: bx, y: by, _px: bx, _py: by, x0: bx, vx: -c.dir.x * 40 + r.float(-15, 15), vy: -r.float(10, 30), r: r.float(5, 8), _pr: 6, r1: r.float(12, 16), a: 0, _pa: 0, t: 0, life: 0.5, rot: 0, ph: 0 });
  };
  P._stepPuffs = function (h) {
    for (var i = this.puffs.length - 1; i >= 0; i--) {
      var p = this.puffs[i];
      p.t += h;
      var u = p.t / p.life;
      if (u >= 1) { this.puffs.splice(i, 1); continue; }
      if (p.kind === 'heart') { p.y += p.vy * h; p.x = p.x0 + 10 * Math.sin(p.ph + p.t * 3) + p.vx * p.t; p.a = Math.min(1, u * 6) * (1 - smooth((u - 0.6) / 0.4)); }
      else { p.vx *= Math.pow(0.1, h); p.x += p.vx * h; p.y += p.vy * h; p.a = 0.7 * Math.min(1, u * 8) * (1 - u); }
      p.r = lerp(p.r0 || (p.r0 = p.r), p.r1, easeOut(u));
    }
  };

  // ---------------------------------------------------------------- houses
  P._stepHouses = function (h) {
    var cfg = this.cfg, t = this.time, R = this.roads, self = this;
    for (var i = 0; i < this.houses.length; i++) {
      var H = this.houses[i];
      if (!H.popped && this.phase === 'build' && R) {
        var e = this._edge('to_' + H.id), need = e ? (e.d0 + e.len) / Math.max(1, R.maxDist) : 1;
        if (easeOut(this.roadReveal) >= need - 0.02) { H.popped = true; H._popT = 0; this._emit({ type: 'house', houseId: H.id, x: H.x, y: H.y - 0.5 * H.S }); }
      }
      if (H.popped) {
        H._popT += h;
        var u = clamp(H._popT / cfg.housePop, 0, 1);
        H.appear = u; H.s = backOut(u);
        if (u >= 1 && !H._landed) { H._landed = true; H.squashV += kickFor(0.08, cfg.sqOmega, cfg.sqZeta); }
      }
      H.door += clamp(H._doorTo - H.door, -h * 3.4, h * 3.4);
      if (H._glowT > 0) H._glowT = Math.max(0, H._glowT - h);
      var gT = this.assistId === H.id ? 1 : H._glowT > 0 ? 0.55 + 0.45 * Math.sin(TAU * 1.6 * t) : 0;
      H.glow += (gT - H.glow) * Math.min(1, h * (gT > H.glow ? 10 : 4));
      var ce = this.cart.edge === 'to_' + H.id && this.state === 'round' ? this._edge(this.cart.edge) : null, aT = ce ? clamp(this.cart.s / Math.max(1, ce.stopS), 0, 1) : 0;
      H.active += (aT - H.active) * Math.min(1, h * 6);   // the cart is driving up to this house (a soft "arriving" glow)
      spring(H, 'squash', 'squashV', 0, cfg.sqOmega, cfg.sqZeta, h);
      H.squash = clamp(H.squash, -0.2, 0.2);
      var f = H.friend;
      if (f) {
        f.t += h;
        if (f.state === 'out') { f.pop = Math.min(1, f.pop + h / cfg.friendPop); f.wave = f.t > cfg.friendPop ? 0.5 + 0.5 * Math.sin(TAU * 1.8 * (f.t - cfg.friendPop)) : 0; }
        else if (f.state === 'peek') { f.pop = Math.min(0.6, f.pop + h / cfg.friendPop); f.shake = f.t > 0.1 ? Math.sin(TAU * 2.2 * (f.t - 0.1)) * 0.18 : 0; }
        else if (f.state === 'in') { f.pop = Math.max(0, f.pop - h / 0.25); f.wave = 0; f.shake *= 0.9; if (f.pop <= 0 && !(this._seq && this._seq.h === H)) H.friend = null; }
      }
    }
    void self;
  };

  // ---------------------------------------------------------------- simulation
  P.update = function (dt) {
    if (!(dt > 0)) return;
    var h = this.cfg.step;
    this._acc += Math.min(dt, this.cfg.maxFrame);
    while (this._acc >= h - 1e-12) { this._acc -= h; this._step(h); }
    if (this._acc < 0) this._acc = 0;
    this.alpha = this._acc / h;
  };
  P._twins = function () {
    var i, o, c = this.cart;
    c._px = c.x; c._py = c.y; c._plean = c.lean; c._pbounce = c.bounce; c._pfaceS = c.faceS; c._phop = c.hop; c._pwheelRot = c.wheelRot; c._psquash = c.squash; c._palpha = c.alpha; c._pcargoHop = c.cargoHop;
    for (i = 0; i < this.houses.length; i++) {
      o = this.houses[i]; o._px = o.x; o._py = o.y; o._pappear = o.appear; o._ps = o.s; o._pdoor = o.door; o._plit = o.lit; o._pglow = o.glow; o._psquash = o.squash;
      if (o.friend) { o.friend._ppop = o.friend.pop; o.friend._pshake = o.friend.shake; }
    }
    for (i = 0; i < this.flyers.length; i++) { o = this.flyers[i]; o._px = o.x; o._py = o.y; o._ps = o.s; o._prot = o.rot; }
    for (i = 0; i < this.sprinkles.length; i++) { o = this.sprinkles[i]; o._px = o.x; o._py = o.y; o._prot = o.rot; o._pa = o.a; }
    for (i = 0; i < this.puffs.length; i++) { o = this.puffs[i]; o._px = o.x; o._py = o.y; o._pr = o.r; o._pa = o.a; }
    for (i = 0; i < this.snowflakes.length; i++) { o = this.snowflakes[i]; o._px = o.x; o._py = o.y; o._prot = o.rot; }
    if (this.mouse) { o = this.mouse; o._px = o.x; o._py = o.y; o._ppeek = o.peek; o._pwave = o.wave; }
    if (this.bird) { o = this.bird; o._px = o.x; o._py = o.y; o._phop = o.hop; o._pa = o.a; }
    if (this.hintHand) { this.hintHand._px = this.hintHand.x; this.hintHand._py = this.hintHand.y; }
    if (this.wipe) this.wipe._pt = this.wipe.t;
    this._proadReveal = this.roadReveal; this._phintGlow = this.hintGlow; this.tupi._plook = this.tupi.look;
  };
  P._step = function (h) {
    var cfg = this.cfg;
    this._twins();
    this.time += h; this.stateTime += h; this.phaseTime += h;
    var inChapter = this.state === 'intro' || this.state === 'round' || this.state === 'roundDone' || this.state === 'talk' || this.state === 'levelDone';
    this.wind = this.windModel.step(h, this.weather);
    this.gust = this.windModel.gust;
    var ge = this.windModel.drain();
    for (var gi = 0; gi < ge.length; gi++) if (inChapter) { var c = this._centre(); this._emit({ type: 'gust', dir: ge[gi].dir, x: c.x, y: c.y }); }
    switch (this.state) {
      case 'intro': if (this.stateTime >= cfg.introTime) { this._prepareRound(); this._beginBuild(); } break;
      case 'round': this._stepRound(h); break;
      case 'talk':
        if (this.talkAnswered) { if (this.stateTime >= cfg.talkAfterAnswer) this._levelDone(); break; }
        this._talkAskT += h;
        if (this._talkAsks < cfg.talkMaxAsks && this._talkAskT >= cfg.talkAskTime - 1e-9) {
          this._talkAskT = 0; this._talkAsks++;
          if (this._talkAsks >= cfg.talkGlowAfterAsks) this.talk.glowAnswer = true;
          this._emit({ type: 'talkAsk', talk: this.talk, n: this._talkAsks, glowAnswer: this.talk.glowAnswer });
        } else if (this._talkAsks >= cfg.talkMaxAsks && this._talkAskT >= cfg.talkGiveUp - 1e-9) this.talkAnswer(this.talk.answer, true);   // Tupi answers
        break;
      case 'levelDone':
        if (this.stateTime >= cfg.levelDoneTime) {
          if (this.level < this.levels.length - 1) this.startLevel(this.level + 1);
          else {
            this._setState('sessionDone'); this.phase = null;
            this.lastTopics = this.levels.slice();
            this._mood('spray', 1e9);
            this._emit({ type: 'sessionDone', stars: this.stars });
          }
        }
        break;
    }
    this._stepWipe(h);
    this._stepCart(h);
    this._stepHouses(h);
    this._stepFlyers(h);
    this._stepSprinkles(h);
    this._stepPuffs(h);
    this._stepSurprises(h);
    this._stepHint(h);
    this._stepTupi(h);
  };
  P._stepRound = function (h) {
    var cfg = this.cfg, c = this.cart, self = this;
    switch (this.phase) {
      case 'build': {
        this.roadReveal = Math.min(1, this.phaseTime / cfg.revealTime);
        if (c.state === 'hidden' && this.phaseTime >= cfg.rollOutAt) {
          c.state = 'rollout'; c.edge = 'trunk'; c.s = 0.35 * this.roads.start.s; c.face = c.faceS = 1;
          c.tgt = { edge: 'trunk', s: this.roads.start.s, house: null };
          this._emit({ type: 'rollOut', x: c.x, y: c.y });
        }
        if (c.state === 'rollout') c.alpha = Math.min(1, c.alpha + h / 0.15);
        var done = this.houses.every(function (H) { return H.appear >= 1; });
        if (c.state === 'rollout' && c.spd < 1 && this._atTarget()) c.state = 'wait';
        if (this.phaseTime >= cfg.buildTime && done && c.state === 'wait' && this.roadReveal >= 1) this._beginLoad();
        break;
      }
      case 'load': {
        var Q = this._seq;
        if (Q && Q.kind === 'load') {
          Q.t = (Q.t || 0) + h;
          if (Q.n === 0 && !Q.flew && Q.t >= Q.next) {
            Q.flew = true;
            var ov = this.layout.oven;
            this.flyers.push(this._flyer(this.orderObj.cargo, ov, this._tray(), cfg.loadArc, 'load'));
            this._emit({ type: 'load', cargo: this.orderObj.cargo, x: ov.x, y: ov.y });
          }
          if (Q.n > 0 && Q.i < Q.n && Q.t >= cfg.countLoad0 * 0.4 + Q.i * cfg.countStep) {
            Q.i++;
            var ov2 = this.layout.oven, one = { kind: 'cookies', n: 1, nameKind: 'number', nameValue: 1 };
            this.flyers.push(this._flyer(one, ov2, this._tray(), Math.min(cfg.loadArc, cfg.countStep * 0.9), 'load'));
            if (Q.i === 1) this._emit({ type: 'load', cargo: this.orderObj.cargo, x: ov2.x, y: ov2.y });
            var tr = this._tray();
            this._emit({ type: 'count', i: Q.i, n: Q.n, x: tr.x, y: tr.y - 30 });
          }
          if (Q.t >= Q.T && !this.flyers.some(function (f) { return f.kind === 'load'; })) { this._seq = null; this._ask(); }
        }
        break;
      }
      case 'play': {
        // arrived at a house?
        if ((c.state === 'drag' || c.state === 'coast' || c.state === 'auto') && this.roads) {
          var e = this._edge(c.edge);
          if (e && e.house && c.s >= e.stopS - cfg.arriveTol) { this._arrive(this.houseById(e.house)); break; }
          if (c.state !== 'drag' && c.spd < 1 && this._atTarget()) { c.state = 'wait'; c.mode = null; c.tgt = null; }
        }
        if (c.state === 'reverse' && c.spd < 1 && this._atTarget()) { c.state = 'wait'; c.mode = null; c.tgt = null; c.faceLock = false; }
        if (this._demoAt >= 0 && this.time >= this._demoAt) { this._demoAt = -1; if (this.interactive && c.state === 'wait') this._doHint(false, true); }
        if (this._hintPending && this.interactive && c.state === 'wait') this._autoHint(false);
        if (this.interactive && c.state === 'wait' && !this._g) {
          this._idleT += h;
          if (this._idleT >= this._idleGap - 1e-9) {
            this._idleT = 0; this._idleGap = Math.min(cfg.idleMax, this._idleGap * cfg.idleBackoff); this._idleN++;
            this._mood('think');
            var M = this._mouth(), o = this.orderObj;
            var ev = { type: 'idle', n: this._idleN, promptKey: o.promptKey, params: o.params, rule: o.rule, cargo: o.cargo, left: this.cur.d - this.order, x: M.x, y: M.y };
            if (o.count !== undefined) ev.count = o.count;
            this._emit(ev);
            if (this._idleN >= cfg.idleHintFrom) this._autoHint(true);
          }
        }
        break;
      }
      case 'arrive': this._stepArrive(h); break;
      case 'return':
        if (c.spd < 1 && this._atTarget()) { c.tgt = null; c.mode = null; c.face = 1; this._beginLoad(); }
        break;
      case 'party': this._stepParty(h); break;
    }
    void self;
  };
  P._stepTupi = function (h) {
    var T = this.tupi, cfg = this.cfg, c = this.cart;
    if (T.moodT > 0) { T.moodT -= h; if (T.moodT <= 0) { T.moodT = 0; T.mood = this.state === 'sessionDone' ? 'spray' : 'idle'; } }
    T.blinkT -= h;
    if (T.blink && T.blinkT <= 0) { T.blink = false; T.blinkT = this._crng.float(cfg.blink[0], cfg.blink[1]); }
    else if (!T.blink && T.blinkT <= 0) { T.blink = true; T.blinkT = cfg.blinkTime; }
    // look: towards the finger while it is down, else towards where the cart goes (in Tupi's facing frame, rad, ± 0.5)
    var lx = this.finger.down ? this.finger.x - c.x : c.dir.x * 100, ly = this.finger.down ? this.finger.y - (c.y - 0.6 * this.cartExt().up) : c.dir.y * 100;
    var tl = clamp(Math.atan2(ly, Math.abs(lx) + 1e-6), -0.5, 0.5);
    T.look += (tl - T.look) * Math.min(1, h * 6);
    T.frame = T.mood === 'idle' && T.blink ? 'blink' : T.mood;
  };

  // ---------------------------------------------------------------- surprises
  /** A free table spot for the mouse: ≥ 90 px from every road / house / the bakery, off the bubble / HUD and the cart, on screen. */
  P._mouseSpot = function () {
    var L = this.layout, cfg = this.cfg, R = this.roads, r = this._crng, best = null, bs = -1e9, self = this;
    if (!R) return null;
    var pts = [];
    R.edges.forEach(function (e) { for (var i = 0; i < e.pts.length; i += 3) pts.push(e.pts[i]); });
    var boxes = this.houses.map(function (H) { return self._houseBox(H); });
    boxes.push({ x0: L.bakery.x, y0: L.bakery.y, x1: L.bakery.x + L.bakery.w, y1: L.bakery.y + L.bakery.h });
    var mw = 70 * cfg.mouseS, mh = 114 * cfg.mouseS;
    for (var y = L.play.y0 + mh; y <= L.play.y1 - 6; y += 20) for (var x = L.play.x0 + mw + 10; x <= L.play.x1 - mw - 10; x += 20) {
      if (!this._onScreen(x, y - mh, 8) || !this._clearOfKeep(x, y - mh, 12)) continue;
      var md = 1e9, i;
      for (i = 0; i < pts.length; i++) md = Math.min(md, hyp(x - pts[i][0], y - 0.4 * mh - pts[i][1]) - L.roadW / 2);
      for (i = 0; i < boxes.length; i++) md = Math.min(md, boxDist(boxes[i], x, y - 0.4 * mh));
      if (md < cfg.mouseGap) continue;
      var sc = Math.min(md, 2 * cfg.mouseGap) + r.float(0, 30);
      if (sc > bs) { bs = sc; best = { x: x, y: y }; }
    }
    return best;
  };
  /** The bird's spot: on the window sill (the back wall's bottom rim), off the bubble / HUD; else the table's back edge. */
  P._birdSpot = function () {
    var L = this.layout, cfg = this.cfg, bw = 60 * cfg.birdS, bh = 94 * cfg.birdS, ys = [L.wall.h * 0.86, L.wall.h * 0.6, L.bubble.y - 8, L.play.y0 + bh + 10], self = this;
    for (var k = 0; k < ys.length; k++) {
      var y = ys[k], cands = [];
      for (var x = L.ins.left + bw + 8; x <= L.W - L.ins.right - bw - 8; x += 16) cands.push(x);
      cands.sort(function (a, b) { return Math.abs(a - L.W * 0.55) - Math.abs(b - L.W * 0.55); });
      for (var i = 0; i < cands.length; i++) {
        var xx = cands[i], box = { x0: xx - bw, y0: y - bh, x1: xx + bw, y1: y };
        if (box.y0 < L.ins.top + 4 || !L.keep.every(function (q) { return !rectOverlap(box, q, 10); })) continue;
        if (self.houses.some(function (H) { var hb = self._houseBox(H); return boxesGap(hb, box) < 8; })) continue;
        return { x: xx, y: y };
      }
    }
    return { x: L.W / 2, y: Math.max(L.wall.h * 0.86, L.ins.top + bh + 4) };
  };
  P._mouseAt = function (x, y) { var h = this.mouseHit(); return h && hyp(x - h.x, y - h.y) <= h.r; };
  P._birdAt = function (x, y) { var h = this.birdHit(); return h && hyp(x - h.x, y - h.y) <= h.r; };
  P._snowAt = function (x, y) {
    var best = null, bd = 1e9;
    for (var i = 0; i < this.snowflakes.length; i++) { var f = this.snowflakes[i], d = hyp(x - f.x, y - f.y); if (f.state === 'fall' && f.a > 0.3 && d <= f.r && d < bd && this._clearOfKeep(f.x, f.y)) { bd = d; best = f; } }
    return best;
  };
  P._spawnSurprise = function () {
    var cfg = this.cfg, L = this.layout, r = this._crng, i, type = this.surprise;
    if (type === 'mouse' && !this.mouse) {
      var sp = this._mouseSpot();
      if (!sp) type = 'bird';
      else { this.mouse = { x: sp.x, y: sp.y, _px: sp.x, _py: sp.y, peek: 0, _ppeek: 0, wave: 0, _pwave: 0, state: 'in', t: 0, s: cfg.mouseS }; this._emit({ type: 'mouse', x: sp.x, y: sp.y }); }
    }
    if (type === 'bird' && !this.bird) {
      var bs = this._birdSpot();
      this.bird = { x: bs.x, y: bs.y, _px: bs.x, _py: bs.y, hop: 0, _phop: 0, sing: 0, a: 0, _pa: 0, state: 'in', t: 0, s: cfg.birdS, face: bs.x > L.W / 2 ? -1 : 1 };
      this._emit({ type: 'bird', x: bs.x, y: bs.y });
    } else if (type === 'snow' && !this.snowflakes.some(function (q) { return q.state === 'fall'; })) {
      var top = L.play.y0 + 10, x0 = L.ins.left + 60, x1 = L.W - L.ins.right - 60;
      var v = Math.max(cfg.snowV, (L.play.y1 - top) / cfg.snowFall);
      for (i = 0; i < cfg.snowN; i++) {
        var x = x0 + (i + 0.5) / cfg.snowN * (x1 - x0) + r.float(-0.25, 0.25) * (x1 - x0) / cfg.snowN;
        this.snowflakes.push({ x: x, y: top, _px: x, _py: top, x0: x, r: cfg.snowR * r.float(0.85, 1.1), rot: r.float(0, TAU), _prot: 0, a: 0, state: 'wait', t: -i * cfg.snowStagger, v: v * r.float(0.85, 1.15), ph: r.float(0, TAU), tw: 0 });
      }
      this._emit({ type: 'snow', n: cfg.snowN, x: (x0 + x1) / 2, y: top });
    }
  };
  P._tapMouse = function () { var m = this.mouse; m.wave = 0.001; m._waveT = 0; this._emit({ type: 'mouseTap', x: m.x, y: m.y - 40 }); };
  P._tapBird = function () { var b = this.bird; b.sing = 0.001; b._singT = 0; this._emit({ type: 'birdTap', x: b.x, y: b.y - 40 }); };
  P._tapSnow = function (f) { f.state = 'twinkle'; f.t = 0; this._emit({ type: 'snowTap', x: f.x, y: f.y }); };
  P._stepSurprises = function (h) {
    var cfg = this.cfg, L = this.layout, i;
    if (this._surpriseAt >= 0 && this.time >= this._surpriseAt && this.state === 'round' && (this.phase === 'play' || this.phase === 'arrive' || this.phase === 'return' || this.phase === 'load')) { this._surpriseAt = -1; this._spawnSurprise(); }
    var m = this.mouse;
    if (m) {
      m.t += h;
      if (m.state === 'in') { m.peek = Math.min(1, m.t / cfg.mousePeek); if (m.t >= cfg.mousePeek) { m.state = 'sit'; m.t = 0; } }
      else if (m.state === 'sit') { if (m.t >= cfg.mouseStay) { m.state = 'out'; m.t = 0; } }
      else if (m.state === 'out') { m.peek = Math.max(0, 1 - m.t / cfg.mousePeek); if (m.t >= cfg.mousePeek) this.mouse = null; }
      if (this.mouse && m._waveT >= 0 && m.wave > 0) { m._waveT += h; m.wave = Math.sin(Math.PI * clamp(m._waveT / cfg.mouseWave, 0, 1)); if (m._waveT >= cfg.mouseWave) { m.wave = 0; m._waveT = -1; } }
    }
    var b = this.bird;
    if (b) {
      b.t += h;
      if (b.state === 'in') { b.a = Math.min(1, b.t / cfg.birdIn); b.hop = 30 * (1 - easeOut(b.t / cfg.birdIn)); if (b.t >= cfg.birdIn) { b.state = 'sit'; b.t = 0; b.hop = 0; } }
      else if (b.state === 'sit') { if (b.t >= cfg.birdStay) { b.state = 'out'; b.t = 0; } }
      else if (b.state === 'out') { b.a = Math.max(0, 1 - b.t / cfg.birdIn); b.hop = 30 * easeOut(b.t / cfg.birdIn); if (b.t >= cfg.birdIn) this.bird = null; }
      if (this.bird && b._singT >= 0 && b.sing > 0) {
        b._singT += h; var us = clamp(b._singT / cfg.birdSing, 0, 1);
        b.sing = Math.sin(Math.PI * us); b.hop = Math.max(b.state === 'sit' ? 0 : b.hop, 14 * Math.abs(Math.sin(TAU * 1.5 * b._singT)) * (1 - us));
        if (us >= 1) { b.sing = 0; b._singT = -1; }
      }
    }
    for (i = this.snowflakes.length - 1; i >= 0; i--) {
      var q = this.snowflakes[i];
      q.t += h;
      if (q.state === 'wait') { if (q.t >= 0) { q.state = 'fall'; q.t = 0; } else continue; }
      if (q.state === 'fall') {
        q.y += q.v * h; q.x = q.x0 + 26 * Math.sin(0.9 * q.t + q.ph) + 0.6 * this.wind * Math.min(q.t, 3); q.rot += 0.6 * h;
        q.x = clamp(q.x, L.ins.left + q.r, L.W - L.ins.right - q.r);
        q.a = Math.min(1, q.t / 0.6) * clamp((L.play.y1 - 20 - q.y) / 60, 0, 1);
        if (q.y > L.play.y1 - 20) this.snowflakes.splice(i, 1);
      } else if (q.state === 'twinkle') {
        var tw = clamp(q.t / cfg.snowTwinkle, 0, 1);
        q.tw = tw; q.a = 1 - tw; q.rot += 3 * h;
        if (tw >= 1) this.snowflakes.splice(i, 1);
      }
    }
  };

  BD.World = World;
  BD.WindModel = WindModel;
})(window.BD = window.BD || {});
