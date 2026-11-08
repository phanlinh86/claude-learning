/* Bun's Dino Dig — DD.CONFIG + DD.World (headless, deterministic tap-to-dig simulation; DESIGN §2, §5.2)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. Screen space = world space (no camera).
 *  update(dt) runs fixed sub-steps of cfg.step (1/120 s). At the START of every sub-step every moving field is copied into
 *  its `_p` twin; render v = _v + (v − _v)·w.alpha.
 *
 *  MOUNDS w.mounds[] (back rows first is the RENDER's job: sort by y) = { id, x, y (bottom centre on the ground), w, h0, row,
 *    thing, size (thing height px), state 'buried'|'digging'|'open'|'found'|'empty', dig 0..1, rise 0..~1.2 (spring),
 *    peek (visible fraction at dig 0), thingY (screen y of the thing's bottom centre), clipY (draw the thing clipped to
 *    y < clipY), tsx, tsy (thing squash, 1 = none), twob (px, thing wiggle x), trot (rad, thing tilt about its bottom),
 *    glow 0..1, wob (px, mound jiggle x), pop 0..~1.1 (mound scale about its bottom centre, easeOutBack), dim 0..1 (a wrong
 *    thing fades to 0.35), crack 0..1, hatched (bool: draw the baby dino dino_baby_<color> instead of the egg), sparkle 0..1 }
 *    + _p twins: _pdig, _prise, _pthingY, _pclipY, _ptsx, _ptsy, _ptwob, _ptrot, _pwob, _ppop.
 *    Draw: drawHoleBack (dig > 0.3) → thing (translate(x + twob, thingY) rotate(trot) scale(tsx, tsy), clipped to y < clipY)
 *    → drawMound(front) → when rise > 0.6 the thing again unclipped on top.
 *  SHOVEL w.shovel = { x, y (blade TIP), angle (rad; 0 = blade pointing down, handle up; + = clockwise: the handle leans
 *    right), sand 0..1 (a scoop on the blade), alpha, state 'off'|'in'|'scoop'|'wait'|'out', size } + _px, _py, _pangle.
 *  SAND w.sand[] = { x, y, vx, vy, r, rot, alpha, landed } + _px, _py, _prot  (DigArt.drawSandBit; ≤ cfg.sandMax)
 *  FLYING w.flying[] = { id, thing, dino (colour | null), x, y (bottom centre), rot, s (drawn size px), sx, sy, t, T } + _px,
 *    _py, _prot, _ps.  SHELF w.shelfItems[] = { thing, dino, slot, x, y (bottom centre, bounce included), s, sx, sy, bounce
 *    0..1, leave 0..1 (0 = on the plank, 1 = inside Bun's satchel), alpha } + _px, _py.
 *  EGG BITS w.eggBits[] = { kind 'eggTop'|'eggBottom', color, x, y, rot, size, alpha } + _px, _py, _prot.
 *  MOLE w.mole null | { x, y (bottom anchor on the sand), h (drawn height), up 0..~1.1 (spring: how far it is out of its dirt
 *    ring), spin (rad, a happy twirl), sx, sy, state 'up'|'happy'|'down' } + _pup, _pspin.
 *  PTERO w.ptero null | { x, y (centre), dir ±1 (+1 = flies / faces right), flap 0..1 (< 0.5 wings up, ≥ 0.5 ptero_flap),
 *    rot (rad), loop 0..1, size (px wide), state 'fly'|'loop'|'happy' } + _px, _py, _prot.
 *  Also: w.bun, w.hintHand, w.dig, w.treasures (the session's finds).
 * ========================================================================
 */
(function (DD) {
  'use strict';

  var CONFIG = {
    // ---- timing / state machine (s)
    step: 1 / 120, maxFrame: 1.0,
    roundsPerLevel: 4, chapterTimeLimit: 75, chapterMinRounds: 3,
    shortBudget: [1e9, 30, 48, 62],   // s into the chapter: a round starting later than this is short (content: 1 step at ages ≤ 4)
    introTime: 2.5, levelDoneTime: 1.8,
    talkAfterAnswer: 1.6, talkAskTime: 12, talkGlowAfterAsks: 2, talkMaxAsks: 3, talkGiveUp: 12,

    // ---- layout (DESIGN §2; px)
    shortSide: 720, minLong: 960, maxLong: 1600, tallRatio: 1.6,
    groundLand: 14, groundPort: 26,
    bubbleX: 24, bubbleYLand: 18, bubbleMaxW: 560, bubbleRight: 200, bubbleHLand: 122, bubbleYPort: 110, bubbleHPort: 124,
    hudW: 160, hudH: 96, bubbleMinW: 220,
    shelfYLand: 152, shelfGapPort: 52, shelfGapPad: 24,   // portrait gap bubble → shelf: tail 21 + a 2-line VI prompt (h 124 → 150) + 3 (QA visual P1-1)
    shelfH: 92, shelfSide: 24, shelfSlots: 12, shelfSpacing: 76, shelfItem: 64, shelfPlank: 30,
    // phones (long / short side > phoneRatio): bigger things and finds (QA visual P2-1 / P2-2), only while ≥ minCapacity mounds fit
    phoneRatio: 1.9, phoneItemPort: 1.35, phoneItemLand: 1.2, shelfItemPhone: 84, shelfHPhone: 112, shelfSlotsPhonePort: 8, minCapacity: 8,
    bunXLand: 118, bunXPort: 104, bunHLand: 230, bunHPort: 200, bunFeet: 4, bunWFrac: 0.62, bunPad: 10,
    satchelX: 0.17, satchelY: 0.36,       // Bun's satchel (× bun.h from the feet point): where the shelf items go at a chapter end
    fieldX0Land: 250, fieldX0Port: 30, fieldX0Front: 220, fieldRight: 30, frontRow: 18, rowGap: 170, rowsLand: 2, rowsPort: 4, backRowGap: 40,
    item: { 3: 112, 4: 112, 5: 104, 6: 96, 7: 96 }, tallItem: 1.15,
    moundW: 1.55, moundH: 0.62, moundSpacing: 1.45, rowSpread: 2.1, rowSpreadY: 1.7, jitterX: 14, jitterY: 8, jitterYMin: 3,
    hitCY: 0.45, hitK: 0.6, hitPad: 14,                                          // hit circle (x, y − 0.45 item), r = 0.6 item + 14
    peek: { egg: 0.38, stone: 0.42, toy: 0.48, bone: 0.40, tablet: 0.62 }, peekOld: 0.85, peekDig: 0.15,
    thingW: { egg: 0.78, stone: 1.0, toy: 0.8, bone: 0.62, tablet: 0.84 },     // visible width / size (hit box; DigArt.thingBox ≈)
    sizeK: { big: 1.25, small: 0.72 },
    standY: 0.12,
    thingTopPad: 40,             // the thing's hit box reaches 40 px above its tip (children tap what they see, a bit high: QA playtest P1-1)                                                                 // a risen thing stands 0.12 h0 above the mound bottom

    // ---- touch
    tapTime: 1.0, tapMovePx: 64, softWob: 3,

    // ---- digging
    shovelIn: 0.16, scoopTime: 0.34, scoopFast: 0.22, autoScoop: 0.55, maxQueued: 2, biteAt: 0.4, flingAt: 0.5, shovelOut: 0.3, shovelSize: 118,
    digRate: 13,                 // mound.dig eases to its target (1/s)
    moundOmega: 26, moundZeta: 0.2, scoopWob: 4,
    sandPerScoop: 10, sandG: 1400, sandVx: [110, 360], sandVy: [360, 620], sandR: [5, 10], sandMax: 80, sandLife: 0.7, sandFront: 0.28,
    sandBack: 0.3, sandBounce: 0.25, sandLandGap: 0.07,

    // ---- reveal / judge
    riseTime: 0.45, riseOmega: 16, riseZeta: 0.5, riseStretch: 0.016, riseSquashMin: -0.14, riseSquashMax: 0.18, riseSquash: 0.12,
    wrongWob: 8, wrongOmega: 18, wrongZeta: 0.12, dimAfter: 1.0, dimTo: 1.0, dimRate: 3, wrongRise: 0.55, wrongSinkAfter: 0.9,
    prepTime: 0.32, prepSquash: 0.14,
    hatchTime: 0.9, crackTime: 0.75, hatchWobs: 3, hatchTilt: 0.16, dinoJumpTime: 0.5, dinoJump: 46, dinoScale: 1.0,
    hopG: 3000, hopApex: 140, hopTopPad: 10, hopStretch: 0.18, landSquash: 0.28, itemOmega: 22, itemZeta: 0.35, slideRate: 10,
    bitG: 1400, bitLife: 0.8,
    askGap: 0.6,

    // ---- round phases
    popTime: 0.35, popStagger: 0.12, popDelay: 0.1, enterMin: 1.0, enterTail: 0.2,
    cheerTime: 1.4, bounceStagger: 0.07, bounceTime: 0.42, bounceH: 22,
    clearTime: 0.7, sinkTime: 0.4, leaveTime: 0.45, leaveStagger: 0.04, leaveArc: 60,
    wiggleEvery: [2.2, 4.5], wiggleKick: 0.1, wiggleOmega: 20, wiggleZeta: 0.15,

    // ---- help
    hintAfterMisses: 2,        // taps without progress in a step (wrong digs / empty sand) → hint
    assistAfter: 4, assistAfterOld: 5, assistMaxAge: 4,   // … this many → the next mound tap digs the right one
    hintTime: 3, hintCooldown: 6, hintCycle: 1.2,
    idleTime: 12, idleBackoff: 1.5, idleMax: 30, idleHintFrom: 2,

    // ---- surprises: one round per chapter (round 1 or 2, never the warm-up); the type rotates per chapter
    surpriseRounds: [1, 2], surpriseTypes: ['mole', 'ptero'],
    moleAt: [3, 8], moleStay: 4, moleTimes: 2, moleGap: 4, moleR: 62, moleH: 0.9, moleOmega: 14, moleZeta: 0.42, moleHappy: 1.0, moleClear: 1.25,
    pteroAt: [3, 6], pteroSpeed: 170, pteroHappySpeed: 380, pteroPasses: 2, pteroGap: 5, pteroR: 70, pteroW: 150, pteroBob: 14, loopTime: 1.0, loopR: 70,

    // ---- Bun
    moodTime: { happy: 0.9, cheer: 1.6, oops: 0.8, think: 1.4, talk: 1.0, wave: 1.4, dig: 0.8, point: 1.2 },
    hopTime: 0.42, lookRate: 6, blink: [2.2, 5], blinkTime: 0.13
  };
  DD.CONFIG = CONFIG;

  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function easeOutBack(u) { var c1 = 1.70158, c3 = c1 + 1, v = u - 1; return 1 + c3 * v * v * v + c1 * v * v; }
  function easeOut2(u) { u = clamp(u, 0, 1); return 1 - (1 - u) * (1 - u); }
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; if (b) for (k in b) o[k] = b[k]; return o; }
  function insOf(ins) { return { top: +(ins && ins.top) || 0, right: +(ins && ins.right) || 0, bottom: +(ins && ins.bottom) || 0, left: +(ins && ins.left) || 0 }; }
  function keepBoxes(hk) {
    var a = Array.isArray(hk) ? hk : hk ? [hk] : [], out = [];
    for (var i = 0; i < a.length; i++) { var b = a[i]; if (b && b.w > 0 && b.h > 0) out.push({ x: +b.x, y: +b.y, w: +b.w, h: +b.h }); }
    return out;
  }
  function inBox(b, x, y, pad) { pad = pad || 0; return x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad; }
  /** Initial velocity that gives a damped spring (ω, ζ) released from 0 a first peak of `peak`. */
  function kickFor(peak, w, z) { var s = Math.sqrt(1 - z * z); return peak * w * Math.exp(z / s * Math.atan2(s, z)); }
  function spring(o, k, kv, target, w, z, h) { o[kv] += (w * w * (target - o[k]) - 2 * z * w * o[kv]) * h; o[k] += o[kv] * h; }
  /** Ballistic hop from (x0, y0) to (x1, y1) whose apex is `apex` px above the higher end, under gravity g:
   *  y(u) = yA + c (u − u*)², x linear in u, u = t / T (constant horizontal speed, constant vertical acceleration 2c/T² = g). */
  function hopPath(x0, y0, x1, y1, apex, g, yMin) {
    var yA = Math.min(y0, y1) - apex;
    if (yMin !== undefined && yA < yMin) yA = Math.min(yMin, Math.min(y0, y1) - 12);   // never above the top edge (QA visual P2-3)
    var a = Math.sqrt(y0 - yA), b = Math.sqrt(y1 - yA), c = (a + b) * (a + b);
    return { x0: x0, y0: y0, x1: x1, y1: y1, yA: yA, c: c, us: a / (a + b), T: Math.sqrt(2 * c / g) };
  }

  /** DESIGN §2 short-side rule: CSS viewport → logical W×H. */
  function logicalSize(cssW, cssH, cfg) {
    cfg = cfg || CONFIG;
    var S = cfg.shortSide, aspect = cssW / Math.max(1, cssH);
    if (cssW >= cssH) return { W: clamp(Math.round(S * aspect), cfg.minLong, cfg.maxLong), H: S };
    return { W: S, H: clamp(Math.round(S / aspect), cfg.minLong, cfg.maxLong) };
  }

  /**
   * DESIGN §2 layout: { W, H, ins, portrait, tall, groundY, bubble, hud, shelf {x, y, w, h, slots[{x, y}], size, spacing},
   *   bun {x, y (feet), h, w}, satchel {x, y}, field {x0, x1, y0, y1}, rows [{y, x0, x1, lo, hi, cap}] (front first), item,
   *   moundW, moundH, spacing, hitR, capacity, pteroY, keep [boxes the child never has to touch], safe }
   */
  /** DESIGN §2 layout with the phone tier (QA visual P2-1 / P2-2): on phones (long / short > phoneRatio) the items grow
   *  (portrait × phoneItemPort, landscape × phoneItemLand) and the shelf shows bigger finds (84 px, 8 slots in portrait) — each
   *  step falls back to the plain DESIGN sizes when the field would hold fewer than minCapacity mounds. */
  function computeLayout(W, H, ins, cfg, age, hudKeep) {
    var portrait = H > W, phone = (portrait ? H / W : W / H) > cfg.phoneRatio, tall = H / W > cfg.tallRatio;
    var base = tall ? cfg.tallItem : 1, L = null;
    var tiers = phone ? [{ k: portrait ? cfg.phoneItemPort : cfg.phoneItemLand, shelf: true }, { k: base, shelf: true }, { k: base, shelf: false }] : [{ k: base, shelf: false }];
    for (var t = 0; t < tiers.length; t++) {
      L = layoutTier(W, H, ins, cfg, age, hudKeep, tiers[t].k, tiers[t].shelf);
      L.phone = phone;
      if (L.capacity >= cfg.minCapacity) break;
    }
    return L;
  }
  /** The HUD's measured box among the hudKeep boxes (the one in the right half; main.js passes [HUD, bubble]). */
  function hudBox(hk, W) { var best = null; for (var i = 0; i < hk.length; i++) { var b = hk[i]; if (b.x + b.w / 2 > W / 2 && (!best || b.y + b.h > best.y + best.h)) best = b; } return best; }
  function layoutTier(W, H, ins, cfg, age, hudKeep, itemK, phoneShelf) {
    ins = insOf(ins);
    var portrait = H > W, tall = H / W > cfg.tallRatio, i;
    var groundY = H - ins.bottom - (portrait ? cfg.groundPort : cfg.groundLand);
    var hk = keepBoxes(hudKeep), hb = hudBox(hk, W);
    var bx = ins.left + cfg.bubbleX, bubble;
    if (portrait) bubble = { x: bx, y: ins.top + cfg.bubbleYPort, w: W - bx - ins.right - cfg.bubbleX, h: cfg.bubbleHPort };
    else bubble = { x: bx, y: ins.top + cfg.bubbleYLand, w: Math.min(cfg.bubbleMaxW, W - ins.right - cfg.bubbleRight - bx), h: cfg.bubbleHLand };
    // the real (measured) HUD: the bubble gets out of its way like main.js placeBubble does (narrower, else below it)
    if (hb && bubble.x + bubble.w > hb.x - 10 && bubble.y < hb.y + hb.h) {
      var room = hb.x - 12 - bubble.x;
      if (!portrait && room >= cfg.bubbleMinW) bubble.w = room;   // landscape: narrower, beside the HUD
      else bubble.y = Math.max(bubble.y, hb.y + hb.h + 8);        // portrait (QA visual P1-1): below the measured HUD
    }
    bubble.w = Math.max(0, bubble.w);
    var hud = { x: W - ins.right - cfg.hudW, y: 0, w: cfg.hudW + ins.right, h: ins.top + cfg.hudH };
    var sx = ins.left + cfg.shelfSide, sw = W - ins.left - ins.right - 2 * cfg.shelfSide;
    var sSize = phoneShelf ? cfg.shelfItemPhone : cfg.shelfItem, sH = phoneShelf ? cfg.shelfHPhone : cfg.shelfH;
    var nSlots = phoneShelf && portrait ? cfg.shelfSlotsPhonePort : cfg.shelfSlots;
    // portrait: under the bubble with room for its tail + a 2-line Vietnamese prompt; landscape: under the bubble too
    var gapP = tall ? cfg.shelfGapPort : cfg.shelfGapPad;
    var shelf = { x: sx, y: portrait ? bubble.y + bubble.h + gapP : Math.max(ins.top + cfg.shelfYLand, bubble.y + bubble.h + 12), w: sw, h: sH, slots: [], size: sSize };
    shelf.spacing = Math.min(Math.max(cfg.shelfSpacing, sSize + 12), (sw - sSize) / (nSlots - 1));   // the end items stay on the plank
    shelf.fromRight = !portrait;   // landscape: the first finds land at the RIGHT end, away from the bubble (QA visual P2-3)
    var plank = shelf.y + shelf.h - cfg.shelfPlank;
    for (i = 0; i < nSlots; i++) {
      var k = shelf.fromRight ? (nSlots - 1) / 2 - i : i - (nSlots - 1) / 2;
      shelf.slots.push({ x: sx + sw / 2 + k * shelf.spacing, y: plank });
    }
    var item = Math.round(cfg.item[clamp(Math.round(+age || 4), 3, 7)] * itemK), mw = cfg.moundW * item, mh = cfg.moundH * item, sp = cfg.moundSpacing * item;
    var hitR = cfg.hitK * item + cfg.hitPad, hitUp = cfg.hitCY * item + hitR;   // the hit circle reaches hitUp above the mound bottom
    var bh = portrait ? cfg.bunHPort : cfg.bunHLand;
    var bun = { x: ins.left + (portrait ? cfg.bunXPort : cfg.bunXLand), y: groundY - cfg.bunFeet, h: bh, w: cfg.bunWFrac * bh };
    // rows: the back row's bottom stays ≥ shelf bottom + item + 40, and its hit circles clear of every top keep-out box
    var limit = shelf.y + shelf.h + item + cfg.backRowGap;
    var keep = [{ x: bubble.x, y: bubble.y, w: bubble.w, h: bubble.h, kind: 'bubble' }, { x: hud.x, y: hud.y, w: hud.w, h: hud.h, kind: 'hud' },
      { x: shelf.x, y: shelf.y, w: shelf.w, h: shelf.h, kind: 'shelf' }];
    hk.forEach(function (b) { b.kind = 'hudKeep'; keep.push(b); });
    for (i = 0; i < keep.length; i++) if (keep[i].y + keep[i].h < H / 2) limit = Math.max(limit, keep[i].y + keep[i].h + hitUp + 8);
    // row gap ≥ spacing (two rows never bring centres closer than 1.45 item); the vertical jitter shrinks to what the gap allows
    var gap = Math.max(cfg.rowGap, sp + 2 * cfg.jitterYMin + 1), jy = Math.min(cfg.jitterY, (gap - sp - 1) / 2), rows = [], nRows = portrait ? cfg.rowsPort : cfg.rowsLand;
    var xR = W - ins.right - cfg.fieldRight, half = Math.max(mw / 2, hitR);
    var bb = { x: bun.x - bun.w / 2 - cfg.bunPad, y: bun.y - bh - cfg.bunPad, w: bun.w + 2 * cfg.bunPad, h: bh + 2 * cfg.bunPad };
    for (i = 0; i < nRows; i++) {
      var y = groundY - cfg.frontRow - i * gap;
      if (i > 0 && y < limit) break;
      var x0 = portrait ? ins.left + (i === 0 ? cfg.fieldX0Front : cfg.fieldX0Port) : ins.left + cfg.fieldX0Land;
      var lo = x0 + mw / 2, hi = xR - mw / 2;
      // a row whose mounds (or hit circles) reach Bun's height band starts right of Bun (portrait back rows vs his ears)
      var rTop = y - Math.max(hitUp, 1.25 * item), rBot = y - cfg.hitCY * item + hitR + jy;
      if (rBot > bb.y && rTop < bb.y + bb.h) lo = Math.max(lo, bb.x + bb.w + half + 6);
      rows.push({ y: y, x0: x0, x1: xR, lo: lo, hi: hi, cap: hi >= lo ? Math.floor((hi - lo) / sp + 1e-9) + 1 : 0 });
    }
    var cap = rows.reduce(function (s, r) { return s + r.cap; }, 0);
    var y0 = rows[rows.length - 1].y, fieldTop = y0 - hitUp, sb = shelf.y + shelf.h;
    var field = { x0: Math.min.apply(null, rows.map(function (r) { return r.x0; })), x1: xR, y0: Math.min(y0, limit), y1: rows[0].y };   // y0: spread rows may use up to the limit
    return {
      W: W, H: H, ins: ins, portrait: portrait, tall: tall, groundY: groundY, bubble: bubble, hud: hud, shelf: shelf, bun: bun,
      satchel: { x: bun.x + cfg.satchelX * bh, y: bun.y - cfg.satchelY * bh }, field: field, rows: rows, item: item, moundW: mw,
      moundH: mh, spacing: sp, rowGap: gap, jitterY: jy, hitR: hitR, capacity: cap, limit: limit, pteroY: Math.max(sb + 56, (sb + fieldTop) / 2), keep: keep,
      safe: { x: ins.left, y: ins.top, w: W - ins.left - ins.right, h: H - ins.top - ins.bottom }
    };
  }

  /** Mound bottom centres for n mounds (slot order: front row left → right, then the rows behind), deterministic per seed.
   *  Fewest rows that hold n; shares in proportion to row capacity; spread evenly (gap ≤ rowSpread × spacing, centred) with a
   *  small jitter that never brings two centres closer than `spacing`. Over capacity (never with the shipped tables): the
   *  spacing shrinks so everything still fits. */
  function placeMounds(L, n, cfg, seed) {
    var rng = new DD.RNG((DD.RNG.hash(seed || 1) ^ 0x2c1b3c6d) >>> 0), rows = L.rows, sp = L.spacing, out = [], i, k;
    var caps = rows.map(function (r) { return r.cap; }), tot = caps.reduce(function (a, b) { return a + b; }, 0);
    function capsAt(s) { return rows.map(function (r) { return r.hi >= r.lo ? Math.floor((r.hi - r.lo) / s + 1e-9) + 1 : 1; }); }
    while (tot < n && sp > 0.6 * L.item) {   // emergency (an odd viewport): squeeze the spacing
      sp = Math.max(0.6 * L.item, sp * 0.92); caps = capsAt(sp); tot = caps.reduce(function (a, b) { return a + b; }, 0);
    }
    if (tot < n) caps = rows.map(function () { return n; });
    var used = 0, sum = 0;
    for (k = 0; k < rows.length; k++) { sum += caps[k]; used = k + 1; if (sum >= n) break; }
    var share = [], left = n;
    for (k = 0; k < used; k++) share[k] = Math.max(1, Math.min(caps[k], Math.floor(n * caps[k] / sum)));
    left = n - share.reduce(function (a, b) { return a + b; }, 0);
    for (k = 0; left > 0 && k < used * 4; k++) { var j = k % used; if (share[j] < caps[j]) { share[j]++; left--; } }
    for (k = used - 1; left < 0 && k >= 0; k--) while (left < 0 && share[k] > 1) { share[k]--; left++; }
    // the used rows spread over the free height between the back-row limit and the front row (QA visual P2-1): the front row
    // stays on the ground, the gap grows up to rowSpreadY × the row gap; rows only move UP (further from Bun, still ≥ limit)
    var gU = used > 1 ? clamp((rows[0].y - L.limit) / used, L.rowGap, cfg.rowSpreadY * L.rowGap) : L.rowGap;
    for (k = 0; k < used; k++) {
      var r = rows[k], c = share[k], ry = rows[0].y - k * gU, span = Math.max(0, r.hi - r.lo), g = c > 1 ? Math.min(span / (c - 1), cfg.rowSpread * sp) : 0;
      var x0 = (r.lo + r.hi) / 2 - g * (c - 1) / 2;
      if (k % 2 === 1 && c > 1) x0 = clamp(x0 + g * 0.25 * (rng.chance(0.5) ? 1 : -1), r.lo, r.hi - g * (c - 1));
      var jx = c > 1 ? clamp((g - sp) / 2 - 0.5, 0, cfg.jitterX) : cfg.jitterX;
      for (i = 0; i < c; i++) {
        var x = clamp(x0 + i * g + rng.float(-jx, jx), r.lo, r.hi);
        var JY = L.jitterY === undefined ? cfg.jitterY : L.jitterY;
        var y = ry + (k === 0 ? rng.float(-JY, JY / 2) : rng.float(-JY, JY));
        out.push({ x: x, y: Math.min(y, L.groundY - 8), row: k });
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ World
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.rng = new DD.RNG(this.seed);
    this._crng = new DD.RNG((DD.RNG.hash(this.seed) ^ 0x51ed27) >>> 0);   // cosmetic randomness (sand, blinks, wiggles)
    this.age = DD.Content.ageOf(opts.age !== undefined ? opts.age : 4);
    this.lang = opts.lang === 'vi' ? 'vi' : 'en';
    this._pendingAge = this.age; this._pendingLang = this.lang;
    this.state = 'menu'; this.phase = null;
    this.level = 0; this.levels = []; this.topic = null; this.weather = 0;
    this.round = 0; this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.stars = 0; this.levelStars = 0; this.roundStars = 0; this.misses = 0; this.stepMisses = 0; this.streak = 0;
    this.time = 0; this.stateTime = 0; this.phaseTime = 0; this.alpha = 0; this._acc = 0;
    this.cur = null; this.step = -1; this.talk = null; this.talkAnswered = null;
    this.mounds = []; this.dig = null; this.sand = []; this.flying = []; this.shelfItems = []; this.eggBits = []; this.treasures = [];
    this.shovel = { x: 0, y: -200, _px: 0, _py: -200, angle: 0, _pangle: 0, sand: 0, alpha: 0, state: 'off', size: this.cfg.shovelSize, _t: 0 };
    this.bun = { x: 0, y: 0, h: 200, mood: 'idle', moodT: 0, blinkT: 3, blink: false, look: 0, lookX: 0, hop: 0, _phop: 0, _hopT: -1 };
    this.hudKeep = opts.hudKeep || null; this.lastTopics = null; this.surprise = null; this._surpriseOff = 0; this._surpriseRound = 1;
    this.mole = null; this.ptero = null; this.hintHand = null;
    this.events = []; this.sessions = 0;
    this._idleN = 0; this._idleT = 0; this._idleGap = this.cfg.idleTime; this._lastHintT = -1e9; this.levelStartTime = 0;
    this._talkAskT = 0; this._talkAsks = 0; this._press = null; this.tapMoveMin = this.cfg.tapMovePx;
    this._prevKey = null; this._prevN = 0; this._claimed = []; this._stepDone = false; this._waitAsk = -1; this._noProg = 0;
    this._view = null; this._vp = null; this._lastLand = -1; this._wiggleT = 2;
    this.setViewport(opts.width || 1280, opts.height || 720, opts.ins || null);
  }
  World.logicalSize = logicalSize;
  World.computeLayout = function (W, H, ins, cfg, age, hudKeep) { return computeLayout(W, H, ins, merge(CONFIG, cfg), age === undefined ? 4 : age, hudKeep); };
  World.placeMounds = function (L, n, cfg, seed) { return placeMounds(L, n, merge(CONFIG, cfg), seed); };
  World.kickFor = kickFor;
  World.hopPath = hopPath;

  var P = World.prototype;
  /** true when a tap on a buried mound would start a dig that gets judged (round, dig phase, the step open, no dig running). */
  Object.defineProperty(P, 'interactive', { get: function () { return this.state === 'round' && this.phase === 'dig' && !this._stepDone && !this.dig; } });
  Object.defineProperty(P, 'stepInfo', { get: function () { return this.cur && this.step >= 0 ? this.cur.steps[this.step] || null : null; } });
  P._emit = function (e) { this.events.push(e); };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };
  P.setAge = function (a) { this._pendingAge = DD.Content.ageOf(a); };
  P.setLang = function (l) { this._pendingLang = l === 'vi' ? 'vi' : 'en'; };
  P._setState = function (s) { this.state = s; this.stateTime = 0; };
  P._setPhase = function (p) { this.phase = p; this.phaseTime = 0; };
  P._mood = function (m, t) { this.bun.mood = m; this.bun.moodT = t || this.cfg.moodTime[m] || 1; };
  P._hop = function () { this.bun._hopT = 0; };
  P.skipTalk = function () { if (this.state === 'talk') this._levelDone(); };
  P.moundById = function (id) { for (var i = 0; i < this.mounds.length; i++) if (this.mounds[i].id === id) return this.mounds[i]; return null; };
  P._tapMove = function () { return Math.max(this.cfg.tapMovePx, +this.tapMoveMin || 0); };
  P._bunMouth = function () { var B = this.layout.bun; return { x: B.x + 0.12 * B.h, y: B.y - 0.72 * B.h }; };

  /** The current question {promptKey, params, mode, step} (enter / dig), else null. */
  P.prompt = function () {
    if (this.state !== 'round' || !this.cur || (this.phase !== 'dig' && this.phase !== 'enter')) return null;
    var i = Math.max(0, this.step), s = this.cur.steps[i];
    if (!s) return null;
    return { promptKey: s.promptKey, params: s.params, mode: s.mode, step: i, nameKind: s.nameKind, nameValue: s.nameValue, need: s.need };
  };

  // ---------------------------------------------------------------- geometry + test hooks (logical px)
  P._hitC = function (m) { return { x: m.x, y: m.y - this.cfg.hitCY * this.layout.item, r: this.layout.hitR }; };
  /** A safe tap point for a mound (logical px): the hit centre — inside the hit area, clear of the HUD / bubble / shelf. */
  P.moundTap = function (id) { var m = this.moundById(id); if (!m) return null; var c = this._hitC(m); return { x: c.x, y: c.y }; };
  P.moundHit = function (id) { var m = this.moundById(id); return m ? this._hitC(m) : null; };
  /** The mound under (x, y): inside its hit circle or the visible box of its thing; the nearest hit centre wins. */
  P._moundAt = function (x, y) {
    var best = null, bd = 1e9, cfg = this.cfg;
    for (var i = 0; i < this.mounds.length; i++) {
      var m = this.mounds[i];
      if (m.pop < 0.3) continue;
      var c = this._hitC(m), d = hyp(x - c.x, y - c.y), hit = d <= c.r;
      if (!hit && m.state !== 'empty') {
        var bw = (cfg.thingW[m.thing.kind] || 0.8) * m.size / 2 + 8, top = m.thingY - m.size - cfg.thingTopPad;
        hit = x >= m.x - bw && x <= m.x + bw && y >= top && y <= m.y;
      }
      if (hit && d < bd) { bd = d; best = m; }
    }
    return best;
  };
  P._bunBox = function () { var B = this.layout.bun, p = this.cfg.bunPad; return { x: B.x - B.w / 2 - p, y: B.y - B.h - p, w: B.w + 2 * p, h: B.h + 2 * p }; };
  P.bunHit = function () { var b = this._bunBox(); return { x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w, h: b.h }; };
  P._moleC = function () { var m = this.mole; return m ? { x: m.x, y: m.y - 0.45 * this.cfg.moleH * this.layout.item * Math.max(0.3, m.up), r: this.cfg.moleR } : null; };
  /** The mole's tap circle while it can be tapped (up), else null. */
  P.moleHit = function () { var m = this.mole; return m && m.state === 'up' && m.up > 0.5 ? this._moleC() : null; };
  /** The pterosaur's tap circle while it can be tapped (gliding, on screen, not under a keep-out box or over a mound), else null. */
  P.pteroHit = function () {
    var p = this.ptero, L = this.layout;
    if (!p || p.state !== 'fly') return null;
    if (p.x < L.ins.left + 30 || p.x > L.W - L.ins.right - 30) return null;
    for (var i = 0; i < L.keep.length; i++) if (inBox(L.keep[i], p.x, p.y, 20)) return null;
    if (this._moundAt(p.x, p.y)) return null;
    return { x: p.x, y: p.y, r: this.cfg.pteroR };
  };
  /** What to tap next for the right answer: {mound: id} (while a dig runs: {mound: digging id, digging: true}) | null. */
  P.answer = function () {
    if (this.state !== 'round' || this.phase !== 'dig' || this._stepDone) return null;
    if (this.dig) return this.dig.phase === 'rise' ? null : { mound: this.dig.id, digging: true };
    var m = this._rightMound();
    return m ? { mound: m.id } : null;
  };
  P._rightMound = function () {
    var s = this.stepInfo;
    if (!s) return null;
    for (var i = 0; i < s.targets.length; i++) { var m = this.moundById(s.targets[i]); if (m && m.state === 'buried') return m; }
    return null;
  };

  // ---------------------------------------------------------------- viewport
  P.setViewport = function (W, H, ins) { this._view = { W: W, H: H, ins: insOf(ins) }; this._relayout(false); };
  P._relayout = function (force) {
    var v = this._view;
    var key = v.W + 'x' + v.H + ':' + JSON.stringify(v.ins) + ':' + this.age + ':' + JSON.stringify(this.hudKeep || null);
    if (key === this._vp && !force) return false;
    var had = !!this.layout;
    this._vp = key;
    this.layout = computeLayout(v.W, v.H, v.ins, this.cfg, this.age, this.hudKeep);
    this.layout.hudKeep = keepBoxes(this.hudKeep);
    var B = this.layout.bun;
    this.bun.x = B.x; this.bun.y = B.y; this.bun.h = B.h;
    if (had) this._snapAll();
    return true;
  };
  /** Rotation / resize mid-round: mounds re-placed into the new field keeping their dig state, shelf items snap to their slots,
   *  flying things land at once, the dig in progress continues, the mole ducks, the pterosaur moves to the new sky band. */
  P._snapAll = function () {
    var L = this.layout, i;
    this._press = null;
    if (this.cur && this.mounds.length) {
      var pos = placeMounds(L, this.mounds.length, this.cfg, this.cur.seed);
      for (i = 0; i < this.mounds.length; i++) this._placeMound(this.mounds[i], pos[i]);
    }
    while (this.flying.length) this._land(this.flying[0]);
    var nS = L.shelf.slots.length, on = this.shelfItems.filter(function (q) { return !q.leaving && q.leave <= 0; }).sort(function (a, b) { return a.slot - b.slot; });
    if (on.length > nS) { var drop = on.splice(0, on.length - nS); this.shelfItems = this.shelfItems.filter(function (q) { return drop.indexOf(q) < 0; }); }
    on.forEach(function (q, k) { q.slot = k; });   // a rotation to a phone portrait (8 slots): the oldest go, the rest close up
    for (i = 0; i < this.shelfItems.length; i++) {
      var it = this.shelfItems[i], sl = L.shelf.slots[it.slot];
      if (sl && it.leave <= 0) { it.x = it._px = sl.x; it.y = it._py = sl.y; it.s = L.shelf.size; }
      else if (it.leave > 0) { it.leave = 1; }
    }
    this.shelfItems = this.shelfItems.filter(function (q) { return q.leave < 1; });
    this.sand = []; this.eggBits = [];
    if (this.mole) this.mole = null;
    if (this.ptero) { this.ptero.y0 = L.pteroY; this.ptero.x = clamp(this.ptero.x, -200, L.W + 200); this.ptero.y = this.ptero._py = L.pteroY; this.ptero._px = this.ptero.x; }
    if (this.dig && this.dig.phase !== 'rise') { var m = this.moundById(this.dig.id), hv = this._shovelKey(m, 'hover', this.dig.side); this.dig.sx0 = hv.x; this.dig.sy0 = hv.y; }
    var S = this.shovel;
    if (S.state !== 'off') { var d = this.dig && this.moundById(this.dig.id); if (d) { var k = this._shovelKey(d, 'hover', this.dig ? this.dig.side : 1); S.x = S._px = k.x; S.y = S._py = k.y; } else { S.state = 'off'; S.alpha = 0; } }
    if (this.hintHand) this._hintGeo();
  };
  P._placeMound = function (m, p) {
    var L = this.layout, cfg = this.cfg;
    m.x = p.x; m.y = p.y; m.row = p.row; m.w = L.moundW; m.h0 = L.moundH;
    m.size = L.item * (m.thing.size ? cfg.sizeK[m.thing.size] || 1 : 1);
    m.peek = (cfg.peek[m.thing.kind] || 0.4) * (this.age >= 5 ? cfg.peekOld : 1);
    this._geo(m); m._pthingY = m.thingY; m._pclipY = m.clipY;
  };

  // ---------------------------------------------------------------- session flow
  P.newSession = function (opts) {
    this.age = this._pendingAge; this.lang = this._pendingLang;
    this._relayout(false);
    this.sessions++;
    this._clearRound(); this.cur = null; this.state = 'menu'; this.shelfItems = [];
    var last = (opts && opts.lastTopics) || this.lastTopics || null;
    this.levels = DD.Content.topicsFor(this.age, this.rng, last);
    this._surpriseOff = this.rng.int(0, Math.max(0, this.cfg.surpriseTypes.length - 1));
    this.stars = 0; this.treasures = []; this._prevKey = null; this._prevN = 0; this._prevAns = null; this._prevAnsRun = 0;
    this.weather = 0;
    this._emit({ type: 'session', levels: this.levels.slice() });
    this.startLevel(0);
  };
  P._clearRound = function () {
    this.mounds = []; this.dig = null; this.sand = []; this.flying = []; this.eggBits = []; this.step = -1; this._press = null;
    this.mole = null; this.ptero = null; this.hintHand = null; this._stepDone = false; this._waitAsk = -1; this._claimed = []; this._early = null;
    this._moleNext = -1; this._pteroNext = -1; this._moleTimes = 0; this._pteroPasses = 0;
    var S = this.shovel; S.state = 'off'; S.alpha = 0; S.sand = 0;
  };
  P.startLevel = function (i) {
    if (!this.levels.length) this.levels = DD.Content.topicsFor(this.age);
    this.level = clamp(i | 0, 0, this.levels.length - 1);
    this.topic = this.levels[this.level];
    this.weather = this.level % 4;
    this.round = 0; this.levelStars = 0; this.levelStartTime = this.time;
    this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.cur = null; this.talk = null; this.talkAnswered = null; this.surprise = null; this.shelfItems = [];
    var SR = this.cfg.surpriseRounds || [2];
    this._surpriseRound = SR[this.rng.int(0, SR.length - 1)];
    this._clearRound();
    this._setState('intro'); this.phase = null;
    this._mood('wave', 1.6);
    this._emit({ type: 'level', level: this.level, topic: this.topic, weather: this.weather });
  };

  P._beginRound = function () {
    var cfg = this.cfg, self = this;
    var rr = new DD.RNG((this.rng.next() * 4294967296) >>> 0);
    var ST = cfg.surpriseTypes, sp = ST && ST.length && this.round === this._surpriseRound && this.round > 0 ? ST[(this.level + this._surpriseOff) % ST.length] : null;
    var el = this.time - this.levelStartTime, sb = cfg.shortBudget, short = !!(sb && this.round > 0 && el > sb[Math.min(this.round, sb.length - 1)]);
    var cur = DD.Content.makeRound(this.topic, { age: this.age, lang: this.lang, rng: rr, roundIndex: this.round, surprise: sp, short: short, level: this.level,
      prevKey: this._prevKey, prevN: this._prevN, prevAns: this._prevAns, prevAnsRun: this._prevAnsRun });
    this._prevKey = cur.key; if (cur.steps[0].mode === 'count') this._prevN = cur.steps[0].need;
    this._clearRound();
    this.cur = cur; this.surprise = sp;
    this.misses = 0; this.stepMisses = 0; this.streak = 0;
    var L = this.layout, pos = placeMounds(L, cur.mounds.length, cfg, cur.seed);
    this.mounds = cur.mounds.map(function (q, i) {
      var m = { id: q.id, thing: q.thing, x: 0, y: 0, w: 0, h0: 0, row: 0, size: 0, peek: 0, state: 'buried',
        dig: 0, _pdig: 0, digT: 0, rise: 0, _prise: 0, rv: 0, peekIn: 0, thingY: 0, _pthingY: 0, clipY: 0, _pclipY: 0,
        tsx: 1, tsy: 1, _ptsx: 1, _ptsy: 1, twob: 0, _ptwob: 0, twv: 0, trot: 0, _ptrot: 0, trv: 0,
        glow: 0, _glowT: 0, wob: 0, _pwob: 0, wv: 0, pop: 0, _ppop: 0, dim: 0, crack: 0, hatched: false, sparkle: 0, jumpY: 0,
        q: 0, qv: 0, _sqd: false, after: null, foundT: 0, openT: 0, _popAt: cfg.popDelay + i * cfg.popStagger, _popped: false, sink: 0 };
      self._placeMound(m, pos[i]);
      return m;
    });
    this._enterTime = Math.max(cfg.enterMin, cfg.popDelay + (this.mounds.length - 1) * cfg.popStagger + cfg.popTime + cfg.enterTail);
    this._idleT = 0; this._idleGap = cfg.idleTime; this._idleN = 0;
    this._setState('round'); this._setPhase('enter');
    this._mood('happy', 1.2);
    this._emit({ type: 'round', round: this.round, topic: this.topic, surprise: sp, steps: cur.steps.length, mode: cur.steps[0].mode, mounds: cur.mounds.length,
      short: cur.short, key: cur.key });
  };

  /** Ask the current step (re-targeting a find step whose mound was dug open earlier by a wrong dig). */
  P._ask = function (first) {
    var cfg = this.cfg, cur = this.cur;
    for (;;) {
      var s = this.stepInfo;
      if (!s) { this._startCheer(); return; }
      if (s.mode !== 'find') break;
      var tm = this.moundById(s.targets[0]);
      if (tm && tm.state === 'buried') break;
      var buried = this.mounds.filter(function (q) { return q.state === 'buried'; }).map(function (q) { return q.id; });
      var ns = DD.Content.retarget(cur, this.step, buried);
      if (ns) { cur.steps[this.step] = ns; break; }
      if (this.step >= cur.steps.length - 1) { this._startCheer(); return; }
      this.step++;
    }
    s = this.stepInfo;
    this._stepDone = false; this._waitAsk = -1; this.stepMisses = 0; this._noProg = 0; this._claimed = [];
    this._idleT = 0; this._idleGap = cfg.idleTime; this._idleN = 0;
    this._mood('talk', 1.0);
    var M = this._bunMouth();
    this._emit({ type: 'ask', promptKey: s.promptKey, params: s.params, mode: s.mode, step: this.step, steps: cur.steps.length, first: !!first, round: this.round,
      nameKind: s.nameKind, nameValue: s.nameValue, need: s.need, x: M.x, y: M.y });
    if (first && this.surprise === 'mole') this._moleNext = this._crng.float(cfg.moleAt[0], cfg.moleAt[1]);
    if (first && this.surprise === 'ptero') this._pteroNext = this._crng.float(cfg.pteroAt[0], cfg.pteroAt[1]);
  };

  P._startTalk = function () {
    var rr = new DD.RNG((this.rng.next() * 4294967296) >>> 0);
    this.talk = DD.Content.makeTalk(this.topic, { age: this.age, lang: this.lang, rng: rr, level: this.level });
    this.talk.glowAnswer = false;
    this.talkAnswered = null; this._talkAskT = 0; this._talkAsks = 0;
    this.cur = null; this.phase = null;
    this._clearRound(); this.shelfItems = [];
    this._setState('talk');
    this._mood('talk', 1.2);
    this._emit({ type: 'talk', talk: this.talk });
  };
  P.talkAnswer = function (choiceId, auto) {
    if (this.state !== 'talk' || this.talkAnswered || !this.talk) return false;
    var ok = choiceId === this.talk.answer && !auto;
    this.talkAnswered = { choiceId: choiceId, correct: ok, auto: !!auto };
    if (ok) { this.stars += 1; this.levelStars += 1; this._mood('cheer'); this._hop(); } else this._mood(auto ? 'happy' : 'think');
    this.stateTime = 0;
    this._emit({ type: 'talkResult', correct: ok, choiceId: choiceId, answerId: this.talk.answer, auto: !!auto });
    return ok;
  };
  P._levelDone = function () { this._setState('levelDone'); this.phase = null; this._emit({ type: 'levelDone', level: this.level, stars: this.levelStars }); };

  // ---------------------------------------------------------------- input (logical px; ONE active pointer)
  P._touch = function () { this._idleT = 0; this._idleGap = this.cfg.idleTime; };
  /** → 'mole' | 'ptero' (they react on the press; a mound under the finger always wins) | 'press' | null */
  P.pointerDown = function (x, y) {
    if (this.state !== 'round' || this._press) return null;
    if (!this._moundAt(x, y)) {
      var mh = this.moleHit();
      if (mh && hyp(x - mh.x, y - mh.y) <= mh.r) { this._tapMole(); return 'mole'; }
      var ph = this.pteroHit();
      if (ph && hyp(x - ph.x, y - ph.y) <= ph.r) { this._tapPtero(); return 'ptero'; }
    }
    this._press = { x: x, y: y, t: this.time, maxD: 0 };
    return 'press';
  };
  P.pointerMove = function (x, y) { var p = this._press; if (p) p.maxD = Math.max(p.maxD, hyp(x - p.x, y - p.y)); };
  /** A tap = press + release within tapTime and < tapMovePx (handled at the RELEASE point); a long press / drag → 'soft'.
   *  → 'dig' | 'busy' | 'already' | 'pokeBun' | 'sand' | 'shelf' | null */
  P.pointerUp = function (x, y) {
    var p = this._press;
    this._press = null;
    if (!p || this.state !== 'round') return null;
    if (x === undefined) { x = p.x; y = p.y; }
    var mv = Math.max(p.maxD, hyp(x - p.x, y - p.y));
    if (mv >= this._tapMove() || this.time - p.t > this.cfg.tapTime) { this._soft(p.x, p.y, mv >= this._tapMove() ? 'drag' : 'hold'); return null; }
    return this.tap(x, y);
  };
  P._soft = function (x, y, kind) {
    var m = this._moundAt(x, y), cfg = this.cfg, ev = { type: 'soft', kind: kind, id: null, x: x, y: y };
    if (m) { m.wv += kickFor(cfg.softWob, cfg.moundOmega, cfg.moundZeta) * (this._crng.chance(0.5) ? 1 : -1); ev.id = m.id; }
    this._emit(ev);
  };
  P.cancelDrag = function () { this._press = null; };
  /** One tap at (x, y) (logical px), already classified as a tap. */
  P.tap = function (x, y) {
    if (this.state !== 'round') return null;
    var m = this._moundAt(x, y), b = this._bunBox(), onBun = inBox(b, x, y);
    if (!m && onBun) return this._pokeBun();
    if (this.phase === 'enter') {   // the mounds are still popping up: keep a mound tap for the dig phase, else a soft answer
      var ev = { type: 'soft', kind: 'early', id: null, held: false, x: x, y: y };
      if (m) { this._early = m.id; ev.id = m.id; ev.held = true; m.wv += kickFor(this.cfg.softWob, this.cfg.moundOmega, this.cfg.moundZeta); }
      this._emit(ev);
      return null;
    }
    if (this.phase !== 'dig') return null;
    if (m) {
      if (this.dig) {
        if (m.id === this.dig.id) return this._digMore(m);
        this._emit({ type: 'busy', id: m.id, x: x, y: y });
        return 'busy';
      }
      if (m.state !== 'buried') { this._touch(); this._emit({ type: 'already', id: m.id, thing: m.thing, x: m.x, y: m.thingY - 0.5 * m.size }); return 'already'; }
      if (this._stepDone) { this._emit({ type: 'busy', id: m.id, x: x, y: y }); return 'busy'; }
      if (this._noProg >= this._assistAfter()) return this._assist(x, y);
      this._startDig(m, false);
      return 'dig';
    }
    if (inBox(this.layout.shelf, x, y)) { this._tapShelf(x, y); return 'shelf'; }
    // after many taps without progress even a tap on the sand of the dig site makes the shovel dig the right mound (a child
    // who never hits a mound still finishes the round)
    if (!this.dig && !this._stepDone && this._noProg >= this._assistAfter() && this._inField(x, y)) return this._assist(x, y);
    this._emit({ type: 'sandTap', x: x, y: y });
    if (!this.dig && !this._stepDone) this._noProgress();
    return 'sand';
  };
  /** Inside the dig site (the field rows + the band above the back row where the things peek). */
  P._inField = function (x, y) { var L = this.layout, F = L.field; return x >= F.x0 - 20 && x <= F.x1 + 20 && y >= F.y0 - 1.3 * L.item && y <= L.groundY + 14; };
  P._assistAfter = function () { return this.age <= this.cfg.assistMaxAge ? this.cfg.assistAfter : this.cfg.assistAfterOld; };
  /** A tap that made no progress (a wrong dig, empty sand): the 2nd one shows a hint. */
  P._noProgress = function () { this._noProg++; if (this._noProg >= this.cfg.hintAfterMisses) this._autoHint(false); };
  /** After many taps without progress in one step, the next mound tap digs the right one (the shovel goes there). */
  P._assist = function (x, y) {
    var m = this._rightMound();
    if (!m) return null;
    this._noProg = 0;
    this._emit({ type: 'assist', id: m.id, x: m.x, y: m.y - 0.5 * m.h0, fromX: x, fromY: y });
    this._startDig(m, true);
    return 'dig';
  };
  P._pokeBun = function () {
    var a = this.prompt(), B = this.layout.bun;
    if (!a) return null;
    this._touch();
    this._mood('talk', 1.0);
    this._emit({ type: 'pokeBun', promptKey: a.promptKey, params: a.params, mode: a.mode, step: a.step, x: B.x, y: B.y - 0.7 * B.h });
    return 'pokeBun';
  };
  P._tapShelf = function (x, y) {
    var best = null, bd = 1e9;
    for (var i = 0; i < this.shelfItems.length; i++) { var it = this.shelfItems[i], d = Math.abs(it.x - x); if (it.leave <= 0 && d < bd) { bd = d; best = it; } }
    if (best && bd < this.layout.shelf.spacing) { best._bT = 0; best.q = Math.max(best.q, 0.12); }
    this._emit({ type: 'shelfTap', x: x, y: y, hit: !!best && bd < this.layout.shelf.spacing });
  };
  P._tapMole = function () {
    var m = this.mole, c = this._moleC();
    this._touch();
    m.state = 'happy'; m.t = 0; m.q = 0.25;
    this._emit({ type: 'moleTap', x: c.x, y: c.y });
  };
  P._tapPtero = function () {
    var p = this.ptero, cfg = this.cfg;
    this._touch();
    p.state = 'loop'; p.loop = 0; p.lcx = p.x; p.lcy = p.y - cfg.loopR;
    this._emit({ type: 'pteroTap', x: p.x, y: p.y, dir: p.dir });
  };

  // ---------------------------------------------------------------- digging
  /** Shovel key poses (tip point + angle) for mound m: 'hover' above the pile, 'bite' in the sand, 'fling' out to the side. */
  P._shovelKey = function (m, kind, side) {
    var it = this.layout.item, top = m.y - m.h0 * (1 - m.dig);
    if (kind === 'hover') return { x: m.x + side * 0.3 * m.w, y: top - 0.3 * it, a: side * 0.45 };
    if (kind === 'bite') return { x: m.x + side * 0.12 * m.w, y: top + 0.1 * it, a: side * 0.22 };
    return { x: m.x + side * (0.55 * m.w + 20), y: top - 0.55 * it, a: -side * 0.6 };
  };
  P._startDig = function (m, assisted) {
    var S = this.shovel, side = this._crng.chance(0.5) ? 1 : -1;
    m.state = 'digging';
    this._touch();
    this.dig = { id: m.id, scoops: 0, need: this.cur.scoops, queued: 0, t: 0, phase: 'in', side: side, len: this.cfg.scoopTime, bit: false, flung: false,
      sx0: S.state !== 'off' && S.alpha > 0.2 ? S.x : m.x + side * 160, sy0: S.state !== 'off' && S.alpha > 0.2 ? S.y : -90, a0: S.state !== 'off' ? S.angle : side * 0.9, wait: 0, assisted: !!assisted };
    S.state = 'in'; S.sand = 0;
    if (this.hintHand) this.hintHand = null;
    this._mood('dig');
    this._emit({ type: 'dig', id: m.id, again: false, assist: !!assisted, x: m.x, y: m.y - m.h0, queued: 0 });
  };
  P._digMore = function (m) {
    var D = this.dig, cfg = this.cfg;
    this._touch();
    var pending = D.scoops + D.queued + (D.phase === 'in' || (D.phase === 'scoop' && !D.bit) ? 1 : 0);
    var q = D.phase !== 'rise' && pending < D.need && D.queued < cfg.maxQueued;
    if (q) D.queued++;
    this._emit({ type: 'dig', id: m.id, again: true, queued: D.queued, added: q, x: m.x, y: m.y - m.h0 });
    return 'dig';
  };
  P._beginScoop = function (fast) {
    var D = this.dig, S = this.shovel;
    D.phase = 'scoop'; D.t = 0; D.len = fast ? this.cfg.scoopFast : this.cfg.scoopTime; D.bit = false; D.flung = false;
    D.sx0 = S.x; D.sy0 = S.y; D.a0 = S.angle;
    S.state = 'scoop';
  };
  P._stepDig = function (h) {
    var D = this.dig, S = this.shovel, cfg = this.cfg;
    if (!D) return;
    var m = this.moundById(D.id), k, u, v;
    D.t += h;
    if (D.phase === 'in') {
      u = clamp(D.t / cfg.shovelIn, 0, 1); k = this._shovelKey(m, 'hover', D.side);
      var e = smooth(u);
      S.x = lerp(D.sx0, k.x, e); S.y = lerp(D.sy0, k.y, e) - 40 * Math.sin(Math.PI * u); S.angle = lerp(D.a0, k.a, e); S.alpha = Math.min(1, S.alpha + h / 0.08);
      if (u >= 1) this._beginScoop(D.queued > 0);   // the tap's own scoop (fast when more taps are already waiting)
    } else if (D.phase === 'scoop') {
      u = clamp(D.t / D.len, 0, 1);
      var bite = this._shovelKey(m, 'bite', D.side), fl = this._shovelKey(m, 'fling', D.side);
      if (u < cfg.biteAt) {   // the plunge: accelerating into the sand
        v = u / cfg.biteAt; var e2 = v * v;
        S.x = lerp(D.sx0, bite.x, e2); S.y = lerp(D.sy0, bite.y, e2); S.angle = lerp(D.a0, bite.a, smooth(v));
      } else {
        if (!D.bit) {
          D.bit = true; D.scoops++; m.digT = D.scoops / D.need; S.sand = 1;
          m.wv += kickFor(cfg.scoopWob, cfg.moundOmega, cfg.moundZeta) * D.side;
          this._emit({ type: 'scoop', id: m.id, i: D.scoops, n: D.need, x: bite.x, y: bite.y });
        }
        v = (u - cfg.biteAt) / (1 - cfg.biteAt); var e3 = easeOut2(v), cx = (bite.x + fl.x) / 2, cy = Math.min(bite.y, fl.y) - 0.25 * this.layout.item;
        S.x = (1 - e3) * (1 - e3) * bite.x + 2 * (1 - e3) * e3 * cx + e3 * e3 * fl.x;
        S.y = (1 - e3) * (1 - e3) * bite.y + 2 * (1 - e3) * e3 * cy + e3 * e3 * fl.y;
        S.angle = lerp(bite.a, fl.a, smooth(v));
        if (!D.flung && v >= cfg.flingAt) { D.flung = true; S.sand = 0; this._fling(m, S.x, S.y, D.side); }
      }
      if (u >= 1) {
        if (D.scoops >= D.need) { this._reveal(m); return; }
        D.side = -D.side;
        if (D.queued > 0) { D.queued--; this._beginScoop(true); }
        else { D.phase = 'wait'; D.t = 0; D.wait = Math.max(0.05, cfg.autoScoop - D.len); D.sx0 = S.x; D.sy0 = S.y; D.a0 = S.angle; S.state = 'wait'; }
      }
    } else if (D.phase === 'wait') {
      k = this._shovelKey(m, 'hover', D.side); u = clamp(D.t / D.wait, 0, 1);
      var e4 = smooth(u);
      S.x = lerp(D.sx0, k.x, e4); S.y = lerp(D.sy0, k.y, e4) - 18 * Math.sin(Math.PI * u); S.angle = lerp(D.a0, k.a, e4);
      if (D.queued > 0) { D.queued--; this._beginScoop(true); } else if (D.t >= D.wait) this._beginScoop(false);
    } else if (D.phase === 'rise') {
      if (D.t >= cfg.riseTime) this._judge(m);
    }
  };
  /** ~10 sand clumps fly off the blade in ballistic arcs: mostly to the fling side, some back over the mound, a few towards the
   *  camera (they land lower, in front of the mound). */
  P._fling = function (m, x, y, side) {
    var cfg = this.cfg, r = this._crng, L = this.layout;
    for (var i = 0; i < cfg.sandPerScoop; i++) {
      if (this.sand.length >= cfg.sandMax) this.sand.shift();
      var dir = r.chance(cfg.sandBack) ? -side : side, front = r.chance(cfg.sandFront);
      var c = { x: x + r.float(-8, 8), y: y + r.float(-6, 6), vx: dir * r.float(cfg.sandVx[0], cfg.sandVx[1]) * (dir === side ? 1 : 0.6), vy: -r.float(cfg.sandVy[0], cfg.sandVy[1]),
        r: r.float(cfg.sandR[0], cfg.sandR[1]), rot: r.float(0, TAU), vr: r.float(-12, 12), alpha: 1, landed: false, bounces: 0, life: 0,
        landY: Math.min(L.groundY + 8, front ? m.y + r.float(12, 48) : m.y + r.float(-14, 8)) };
      if (front) { c.vx *= 0.45; c.vy *= 0.85; }
      c._px = c.x; c._py = c.y; c._prot = c.rot;
      this.sand.push(c);
    }
    this._emit({ type: 'fling', id: m.id, side: side, x: x, y: y });
  };
  P._stepSand = function (h) {
    var cfg = this.cfg;
    for (var i = this.sand.length - 1; i >= 0; i--) {
      var c = this.sand[i];
      if (!c.landed) {
        c.vy += cfg.sandG * h; c.x += c.vx * h; c.y += c.vy * h; c.rot += c.vr * h;
        if (c.y >= c.landY && c.vy > 0) {
          c.y = c.landY;
          if (c.bounces < 1 && c.vy > 260) { c.vy = -c.vy * cfg.sandBounce; c.vx *= 0.5; c.vr *= 0.5; c.bounces++; }
          else {
            c.landed = true; c.vx = c.vy = 0;
            if (this.time - this._lastLand >= cfg.sandLandGap) { this._lastLand = this.time; this._emit({ type: 'sandLand', x: c.x, y: c.y }); }
          }
        }
      } else {
        c.life += h;
        c.alpha = clamp(1 - c.life / cfg.sandLife, 0, 1);
        if (c.life >= cfg.sandLife) this.sand.splice(i, 1);
      }
    }
  };
  P._reveal = function (m) {
    var D = this.dig, S = this.shovel, cfg = this.cfg;
    D.phase = 'rise'; D.t = 0;
    m.rv = 0;
    S.state = 'out'; S._t = 0; S._ox = S.x; S._oy = S.y; S._oa = S.angle; S.sand = 0;
    this._emit({ type: 'reveal', id: m.id, thing: m.thing, x: m.x, y: m.y - m.h0 });
    this._mood('happy', 0.6);
    void cfg;   // (riseTime is read by _stepDig)
  };
  P._stepShovel = function (h) {
    var S = this.shovel, cfg = this.cfg;
    if (S.state !== 'out') return;
    S._t += h;
    var u = clamp(S._t / cfg.shovelOut, 0, 1), e = u * u;
    S.x = S._ox + 150 * e; S.y = S._oy - (S._oy + 120) * e; S.angle = S._oa + 0.8 * e; S.alpha = 1 - smooth(u);
    if (u >= 1) { S.state = 'off'; S.alpha = 0; }
  };
  /** The thing is out: right (found → hatch / prep → hop to the shelf) or wrong (it waves, stays in its open hole). */
  P._judge = function (m) {
    var s = this.stepInfo, cfg = this.cfg;
    this.dig = null;
    var right = !!s && s.targets.indexOf(m.id) >= 0;
    if (right) {
      m.state = 'found'; m.foundT = 0; m.sparkle = 1; m.after = m.thing.kind === 'egg' ? 'hatch' : 'prep';
      this._claimed.push(m.id);
      this.streak = 0; this._noProg = 0; this._touch();
      var ev = { type: 'found', id: m.id, thing: m.thing, step: this.step, mode: s.mode, x: m.x, y: m.thingY - 0.5 * m.size };
      if (s.mode !== 'find') ev.count = { i: this._claimed.length, n: s.need };
      if (this._claimed.length >= s.need) { this._stepDone = true; this.hintHand = null; ev.last = true; }
      this._mood('happy'); this._hop();
      this._emit(ev);
    } else {
      m.state = 'open'; m.openT = 0;
      m.twv += kickFor(cfg.wrongWob, cfg.wrongOmega, cfg.wrongZeta) * (this._crng.chance(0.5) ? 1 : -1);
      this.misses++; this.stepMisses++; this.streak++; this._touch();
      this._mood('oops');
      var t = m.thing;
      this._emit({ type: 'wrong', id: m.id, kind: 'thing', thing: t, got: { nameKind: t.nameKind, nameValue: t.nameValue, kind: t.kind, color: t.color, shape: t.shape, animal: t.animal, text: t.text, size: t.size },
        want: { nameKind: s.nameKind, nameValue: s.nameValue, promptKey: s.promptKey, params: s.params }, streak: this.streak, misses: this.misses, x: m.x, y: m.thingY - 0.5 * m.size });
      this._noProgress();
    }
  };

  // ---------------------------------------------------------------- found things: hatch, hop to the shelf
  P._stepFound = function (m, h) {
    var cfg = this.cfg, t;
    m.foundT += h; t = m.foundT;
    if (m.after === 'prep') {   // anticipation crouch, then the hop
      var k = Math.sin(Math.PI * clamp(t / cfg.prepTime, 0, 1));
      m.tsy = 1 - cfg.prepSquash * k; m.tsx = 1 + 0.6 * cfg.prepSquash * k;
      if (t >= cfg.prepTime) { m.tsx = m.tsy = 1; this._launch(m, null); }
    } else if (m.after === 'hatch') {
      if (!m.hatched) {
        var env = clamp(t / cfg.hatchTime, 0, 1);
        m.trot = cfg.hatchTilt * Math.sin(TAU * cfg.hatchWobs * t / cfg.hatchTime) * (0.4 + 0.6 * env);
        m.crack = smooth(t / cfg.crackTime);
        if (t >= cfg.hatchTime) {
          m.hatched = true; m.trot = 0; m.trv = 0; m.crack = 1; m.sparkle = 1;
          this._spawnEggBits(m);
          this._emit({ type: 'hatch', id: m.id, color: m.thing.color, x: m.x, y: m.thingY - 0.5 * m.size });
        }
      } else {
        var u = clamp((t - cfg.hatchTime) / cfg.dinoJumpTime, 0, 1), air = 0.7;
        if (u < air) { var w = u / air; m.jumpY = cfg.dinoJump * 4 * w * (1 - w); m.tsy = 1 + 0.12 * Math.cos(Math.PI * w) * (w < 0.5 ? 1 : 0); m.tsx = 1 / Math.sqrt(m.tsy); }
        else { var q = Math.sin(Math.PI * (u - air) / (1 - air)); m.jumpY = 0; m.tsy = 1 - 0.18 * q; m.tsx = 1 + 0.12 * q; }
        if (u >= 1) { m.tsx = m.tsy = 1; m.jumpY = 0; this._launch(m, m.thing.color); }
      }
    }
  };
  P._spawnEggBits = function (m) {
    var r = this._crng, side = r.chance(0.5) ? 1 : -1, y = m.thingY;
    var top = { kind: 'eggTop', color: m.thing.color, x: m.x, y: y - 0.55 * m.size, vx: side * r.float(140, 220), vy: -r.float(420, 520), rot: 0, vr: side * r.float(6, 10),
      size: m.size, alpha: 1, landY: m.y + 10, landed: false, t: 0 };
    var bot = { kind: 'eggBottom', color: m.thing.color, x: m.x, y: y, vx: -side * r.float(60, 100), vy: -r.float(160, 220), rot: 0, vr: -side * r.float(2, 4),
      size: m.size, alpha: 1, landY: m.y + 4, landed: false, t: 0 };
    [top, bot].forEach(function (b) { b._px = b.x; b._py = b.y; b._prot = b.rot; });
    this.eggBits.push(top, bot);
  };
  P._stepEggBits = function (h) {
    var cfg = this.cfg;
    for (var i = this.eggBits.length - 1; i >= 0; i--) {
      var b = this.eggBits[i];
      b.t += h;
      if (!b.landed) {
        b.vy += cfg.bitG * h; b.x += b.vx * h; b.y += b.vy * h; b.rot += b.vr * h;
        if (b.y >= b.landY && b.vy > 0) { b.y = b.landY; if (Math.abs(b.vy) > 200) { b.vy *= -0.3; b.vx *= 0.5; b.vr *= 0.4; } else { b.landed = true; b.vx = b.vy = b.vr = 0; b.lt = 0; } }
      } else {
        b.lt += h; b.alpha = clamp(1 - b.lt / cfg.bitLife, 0, 1);
        if (b.lt >= cfg.bitLife) this.eggBits.splice(i, 1);
      }
    }
  };
  /** The next free shelf slot (when all 12 are used the oldest item slides away into the satchel and everyone shifts left). */
  P._reserveSlot = function () {
    var n = this.layout.shelf.slots.length, on = this.shelfItems.filter(function (q) { return q.leave <= 0 && !q.leaving; });
    var k = on.length + this.flying.length;
    if (k < n) return k;
    if (on.length) {
      on.sort(function (a, b) { return a.slot - b.slot; });
      this._leave(on[0], 0);
      this.shelfItems.forEach(function (q) { if (!q.leaving && q.slot > 0) q.slot--; });
      this.flying.forEach(function (f) { if (f.slot > 0) f.slot--; });
    }
    return n - 1;
  };
  P._launch = function (m, dino) {
    var L = this.layout, cfg = this.cfg, slot = this._reserveSlot(), sl = L.shelf.slots[slot];
    var s0 = m.size * (dino ? cfg.dinoScale : 1), p0 = hopPath(m.x, m.thingY, sl.x, sl.y, cfg.hopApex, cfg.hopG);
    var sA = lerp(s0, L.shelf.size, smooth(p0.us));   // the thing's drawn size at the apex: its top stays ≥ ins.top + 10
    var path = hopPath(m.x, m.thingY, sl.x, sl.y, cfg.hopApex, cfg.hopG, L.ins.top + cfg.hopTopPad + sA + 2);
    var spin = (m.thing.kind === 'stone' || m.thing.kind === 'bone' || m.thing.kind === 'tablet') && !dino ? 1 : 0;
    var f = { id: m.id, thing: m.thing, dino: dino || null, slot: slot, path: path, t: 0, T: path.T, x: m.x, y: m.thingY, _px: m.x, _py: m.thingY,
      rot: 0, _prot: 0, s: m.size * (dino ? cfg.dinoScale : 1), _ps: m.size, s0: m.size * (dino ? cfg.dinoScale : 1), sx: 1, sy: 1, spin: spin, dir: sl.x >= m.x ? 1 : -1 };
    this.flying.push(f);
    m.state = 'empty'; m.glow = 0; m._glowT = 0;
    this._emit({ type: 'hop', id: m.id, dino: f.dino, slot: slot, x: m.x, y: m.thingY, toX: sl.x, toY: sl.y });
  };
  P._stepFlying = function (h) {
    var L = this.layout, cfg = this.cfg;
    for (var i = this.flying.length - 1; i >= 0; i--) {
      var f = this.flying[i], p = f.path, sl = L.shelf.slots[f.slot];
      p.x1 += (sl.x - p.x1) * Math.min(1, h * cfg.slideRate);   // a slot shift while in the air: ease the landing point
      f.t += h;
      var u = clamp(f.t / f.T, 0, 1);
      f.x = lerp(p.x0, p.x1, u); f.y = p.yA + p.c * (u - p.us) * (u - p.us);
      f.s = lerp(f.s0, L.shelf.size, smooth(u));
      f.rot = f.spin ? f.dir * TAU * u : 0.2 * f.dir * Math.sin(Math.PI * u);
      var st = cfg.hopStretch * Math.pow(1 - u, 3) + 0.06 * Math.sin(Math.PI * u);
      f.sy = 1 + st; f.sx = 1 / Math.sqrt(f.sy);
      if (u >= 1) this._land(f);
    }
  };
  P._land = function (f) {
    var L = this.layout, cfg = this.cfg, sl = L.shelf.slots[f.slot], i = this.flying.indexOf(f);
    if (i >= 0) this.flying.splice(i, 1);
    var it = { id: f.id, thing: f.thing, dino: f.dino, slot: f.slot, x: sl.x, y: sl.y, _px: sl.x, _py: sl.y, s: L.shelf.size, sx: 1, sy: 1, q: cfg.landSquash, qv: 0,
      bounce: 0, leave: 0, leaving: false, alpha: 1, _bT: -1 };
    it.sy = 1 - it.q; it.sx = 1 + 0.6 * it.q;
    this.shelfItems.push(it);
    this.treasures.push({ thing: f.thing, dino: f.dino, level: this.level, round: this.round });
    this._emit({ type: 'shelved', id: f.id, slot: f.slot, dino: f.dino, thing: f.thing, x: sl.x, y: sl.y });
  };
  P._leave = function (it, delay) { it.leaving = true; it._lT = -(delay || 0); it._lx = it.x; it._ly = it.y; };
  P._stepShelf = function (h) {
    var L = this.layout, cfg = this.cfg, cheer = this.phase === 'cheer';
    for (var i = this.shelfItems.length - 1; i >= 0; i--) {
      var it = this.shelfItems[i];
      it._px = it.x; it._py = it.y;
      if (it.leaving) {
        it._lT += h;
        var u = clamp(it._lT / cfg.leaveTime, 0, 1), e = smooth(u), S = L.satchel;
        it.leave = u;
        it.x = lerp(it._lx, S.x, e); it.y = lerp(it._ly, S.y, e) - cfg.leaveArc * 4 * u * (1 - u);
        it.s = L.shelf.size * (1 - 0.6 * e); it.alpha = 1 - smooth((u - 0.7) / 0.3);
        if (u >= 1) this.shelfItems.splice(i, 1);
        continue;
      }
      var sl = L.shelf.slots[it.slot];
      it.x += (sl.x - it.x) * Math.min(1, h * cfg.slideRate);
      spring(it, 'q', 'qv', 0, cfg.itemOmega, cfg.itemZeta, h);
      var b = 0;
      if (cheer) { var v = (this.phaseTime - it.slot * cfg.bounceStagger) / cfg.bounceTime; if (v > 0 && v < 1) b = Math.sin(Math.PI * v); }
      if (it._bT >= 0) { it._bT += h; var v2 = it._bT / cfg.bounceTime; if (v2 < 1) b = Math.max(b, 0.6 * Math.sin(Math.PI * v2)); else it._bT = -1; }
      if (it.bounce > 0.05 && b === 0 && it.q < 0.05) it.q = 0.12;   // lands from a bounce: a little squash
      it.bounce = b;
      it.y = sl.y - b * cfg.bounceH;
      it.sy = 1 - it.q + 0.08 * b; it.sx = 1 / Math.sqrt(Math.max(0.3, it.sy));
    }
  };

  // ---------------------------------------------------------------- help
  P.resetNudges = function () {
    this._idleT = 0; this._idleGap = this.cfg.idleTime; this._idleN = 0;
    this._talkAskT = 0; this._talkAsks = 0;
    if (this.talk) this.talk.glowAnswer = false;
  };
  P._glowing = function () { for (var i = 0; i < this.mounds.length; i++) if (this.mounds[i]._glowT > 0) return true; return false; };
  P._autoHint = function (fromIdle) {
    if (this._glowing() || this.time - this._lastHintT < this.cfg.hintCooldown) return null;
    return this._doHint(fromIdle);
  };
  P._doHint = function (fromIdle) {
    var m = this._rightMound(), cfg = this.cfg, s = this.stepInfo;
    if (!m || !this.interactive) return null;
    m._glowT = cfg.hintTime;
    this.hintHand = { id: m.id, x: 0, y: 0, x0: 0, y0: 0, t: 0, press: 0, alpha: 0, time: 0, T: cfg.hintTime };
    this._hintGeo();
    this._lastHintT = this.time;
    this._mood('point', cfg.hintTime);
    var ev = { type: 'hint', id: m.id, x: this.hintHand.x0, y: this.hintHand.y0, want: { nameKind: s.nameKind, nameValue: s.nameValue, promptKey: s.promptKey, params: s.params } };
    if (fromIdle) ev.idle = true;
    this._emit(ev);
    return { mound: m.id };
  };
  /** Manual hint (e.g. a tap on the bubble): the right mound glows + the ghost hand. → {mound: id} | null */
  P.hint = function () {
    if (!this.interactive) return null;
    if (this.hintHand) return { mound: this.hintHand.id };
    return this._doHint(false);
  };
  P._hintGeo = function () {
    var H = this.hintHand;
    if (!H) return;
    var p = this.moundTap(H.id);
    if (!p) { this.hintHand = null; return; }
    H.x0 = p.x; H.y0 = p.y;
  };
  P._stepHint = function (h) {
    var H = this.hintHand, cfg = this.cfg;
    if (!H) return;
    H.time += h;
    if (H.time >= H.T || !this.interactive) { this.hintHand = null; return; }
    this._hintGeo();
    var u = (H.time % cfg.hintCycle) / cfg.hintCycle, press = Math.sin(Math.PI * clamp((u - 0.35) / 0.3, 0, 1));
    H.t = u;
    H.x = H.x0 + 26 * (1 - smooth(u / 0.35)) * (u < 0.35 ? 1 : 0);
    H.y = H.y0 + 30 * (1 - smooth(u / 0.35)) * (u < 0.35 ? 1 : 0) - 10 * (1 - press) * (u >= 0.35 ? 1 : 0) + 3 * press;
    H.press = press;
    H.alpha = clamp(H.time / 0.25, 0, 1) * clamp((H.T - H.time) / 0.35, 0, 1);
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
    var i, S = this.shovel, o;
    S._px = S.x; S._py = S.y; S._pangle = S.angle;
    for (i = 0; i < this.mounds.length; i++) {
      o = this.mounds[i];
      o._pdig = o.dig; o._prise = o.rise; o._pthingY = o.thingY; o._pclipY = o.clipY; o._ptsx = o.tsx; o._ptsy = o.tsy; o._ptwob = o.twob; o._ptrot = o.trot;
      o._pwob = o.wob; o._ppop = o.pop;
    }
    for (i = 0; i < this.sand.length; i++) { o = this.sand[i]; o._px = o.x; o._py = o.y; o._prot = o.rot; }
    for (i = 0; i < this.flying.length; i++) { o = this.flying[i]; o._px = o.x; o._py = o.y; o._prot = o.rot; o._ps = o.s; }
    for (i = 0; i < this.eggBits.length; i++) { o = this.eggBits[i]; o._px = o.x; o._py = o.y; o._prot = o.rot; }
    if (this.mole) { this.mole._pup = this.mole.up; this.mole._pspin = this.mole.spin; }
    if (this.ptero) { this.ptero._px = this.ptero.x; this.ptero._py = this.ptero.y; this.ptero._prot = this.ptero.rot; }
    this.bun._phop = this.bun.hop;
  };
  P._step = function (h) {
    var cfg = this.cfg;
    this._twins();
    this.time += h; this.stateTime += h; this.phaseTime += h;
    switch (this.state) {
      case 'intro': if (this.stateTime >= cfg.introTime) this._beginRound(); break;
      case 'round': this._stepRound(h); break;
      case 'roundDone': this._stepRoundDone(h); break;
      case 'talk':
        if (this.talkAnswered) { if (this.stateTime >= cfg.talkAfterAnswer) this._levelDone(); break; }
        this._talkAskT += h;
        if (this._talkAsks < cfg.talkMaxAsks && this._talkAskT >= cfg.talkAskTime - 1e-9) {
          this._talkAskT = 0; this._talkAsks++;
          if (this._talkAsks >= cfg.talkGlowAfterAsks) this.talk.glowAnswer = true;
          this._emit({ type: 'talkAsk', talk: this.talk, n: this._talkAsks, glowAnswer: this.talk.glowAnswer });
        } else if (this._talkAsks >= cfg.talkMaxAsks && this._talkAskT >= cfg.talkGiveUp - 1e-9) this.talkAnswer(this.talk.answer, true);   // Bun answers herself
        break;
      case 'levelDone':
        if (this.stateTime >= cfg.levelDoneTime) {
          if (this.level < this.levels.length - 1) this.startLevel(this.level + 1);
          else {
            this._setState('sessionDone'); this.phase = null;
            this.lastTopics = this.levels.slice();
            this._emit({ type: 'sessionDone', stars: this.stars, treasures: this.treasures.slice() });
          }
        }
        break;
    }
    if (this.state === 'round' || this.state === 'roundDone') {
      this._stepDig(h); this._stepShovel(h); this._stepMounds(h); this._stepSand(h); this._stepFlying(h); this._stepEggBits(h);
      this._stepSurprises(h); this._stepHint(h);
    }
    this._stepShelf(h);
    this._stepBun(h);
  };

  P._stepRound = function (h) {
    var cfg = this.cfg;
    switch (this.phase) {
      case 'enter':
        if (this.phaseTime >= this._enterTime) {
          this._setPhase('dig'); this.step = 0; this._ask(true);
          var em = this._early && this.moundById(this._early);
          this._early = null;
          if (em && em.state === 'buried' && this.interactive) { var tp = this.moundTap(em.id); this.tap(tp.x, tp.y); }   // the held early tap digs now
        }
        break;
      case 'dig': {
        if (this._stepDone) {
          if (this._waitAsk < 0 && this._stepComplete()) {
            this._waitAsk = cfg.askGap;
            this._emit({ type: 'stepDone', step: this.step, steps: this.cur.steps.length, last: this.step >= this.cur.steps.length - 1 });
            this._mood('happy');
          }
          if (this._waitAsk >= 0) {
            this._waitAsk -= h;
            if (this._waitAsk <= 0) {
              if (this.step < this.cur.steps.length - 1) { this.step++; this._ask(false); }
              else this._startCheer();
            }
          }
          break;
        }
        if (!this._press && !this.dig) {
          this._idleT += h;
          if (this._idleT >= this._idleGap - 1e-9) {
            this._idleT = 0; this._idleGap = Math.min(cfg.idleMax, this._idleGap * cfg.idleBackoff); this._idleN++;
            this._mood('think');
            var a = this.prompt();
            this._emit({ type: 'idle', n: this._idleN, promptKey: a.promptKey, params: a.params, mode: a.mode, step: a.step });
            if (this._idleN >= cfg.idleHintFrom) this._autoHint(true);
          }
        }
        break;
      }
    }
  };
  /** The step is finished once every claimed thing has landed on the shelf. */
  P._stepComplete = function () {
    for (var i = 0; i < this._claimed.length; i++) { var m = this.moundById(this._claimed[i]); if (m && m.state === 'found') return false; }
    for (i = 0; i < this.flying.length; i++) if (this._claimed.indexOf(this.flying[i].id) >= 0) return false;
    return true;
  };
  P._starsFor = function (m) { return m <= 0 ? 3 : m === 1 ? 2 : 1; };
  P._startCheer = function () {
    var st = this._starsFor(this.misses), ls = this.cur && this.cur.steps[this.cur.steps.length - 1];
    if (ls && ls.mode !== 'count') {   // the answer asked last (QA playtest P2-1: the next round asks something else first)
      this._prevAnsRun = ls.nameValue === this._prevAns ? (this._prevAnsRun || 1) + 1 : 1; this._prevAns = ls.nameValue;
    }
    this.roundStars = st; this.stars += st; this.levelStars += st;
    this._press = null; this.hintHand = null; this.dig = null;
    this._setState('roundDone'); this._setPhase('cheer');
    this._mood('cheer', this.cfg.cheerTime); this._hop();
    if (this.mole && this.mole.state !== 'down') { this.mole.state = 'down'; this.mole.t = 0; }
    var B = this.layout.bun;
    this._emit({ type: 'roundDone', round: this.round, stars: st, misses: this.misses, x: B.x, y: B.y - B.h });
  };
  /** Will the chapter end after this round (Talk time next)? */
  P._chapterEnds = function () {
    var r = this.round + 1, el = this.time - this.levelStartTime;
    return r >= this.roundsPerLevel || (r >= this.cfg.chapterMinRounds && el > this.cfg.chapterTimeLimit);
  };
  P._stepRoundDone = function (h) {
    var cfg = this.cfg, i;
    if (this.phase === 'cheer') {
      if (this.phaseTime >= cfg.cheerTime) {
        this._setPhase('clear');
        this._endsChapter = this._chapterEnds();
        this._clearTime = cfg.clearTime;
        for (i = 0; i < this.mounds.length; i++) { var m = this.mounds[i]; this._emit({ type: 'puff', id: m.id, sink: true, x: m.x, y: m.y }); }
        if (this._endsChapter) {
          var on = this.shelfItems.filter(function (q) { return !q.leaving; }).sort(function (a, b) { return a.slot - b.slot; }), self = this;
          on.forEach(function (q, k) { self._leave(q, k * cfg.leaveStagger); });
          if (on.length) this._clearTime = Math.max(this._clearTime, (on.length - 1) * cfg.leaveStagger + cfg.leaveTime + 0.05);
          this._emit({ type: 'shelfLeave', n: on.length, x: this.layout.satchel.x, y: this.layout.satchel.y });
        }
        this._emit({ type: 'clear', chapterEnd: !!this._endsChapter });
      }
    } else if (this.phase === 'clear') {
      if (this.phaseTime >= this._clearTime) this._nextRound();
    }
  };
  P._nextRound = function () {
    var cfg = this.cfg;
    this._clearRound(); this.cur = null;
    this.round++;
    var el = this.time - this.levelStartTime, long = this.round >= cfg.chapterMinRounds && el > cfg.chapterTimeLimit;
    if (this.round < this.roundsPerLevel && !long) this._beginRound();
    else { if (this.round < this.roundsPerLevel) this.roundsPerLevel = this.round; this._startTalk(); }
  };

  // ---------------------------------------------------------------- mounds
  /** thingY / clipY from dig, rise, peek (DESIGN §5.2): the pile top lowers as it is dug, the thing rises out on a spring. */
  P._geo = function (m) {
    var top = m.y - m.h0 * (1 - m.dig), pk = m.peek * m.peekIn + this.cfg.peekDig * m.dig;
    var buriedY = top + m.size * (1 - pk), standY = m.y - this.cfg.standY * m.h0, r = m.rise;
    m.thingY = buriedY + (standY - buriedY) * r - m.jumpY;
    m.clipY = lerp(top + 4, m.y + 2, clamp(r, 0, 1));
  };
  P._stepMounds = function (h) {
    var cfg = this.cfg, enter = this.state === 'round' && this.phase === 'enter', clear = this.state === 'roundDone' && this.phase === 'clear';
    // idle wiggle: now and then one buried thing gives a little "I'm here!" wiggle
    this._wiggleT -= h;
    if (this._wiggleT <= 0) {
      this._wiggleT = this._crng.float(cfg.wiggleEvery[0], cfg.wiggleEvery[1]);
      var bur = this.mounds.filter(function (q) { return q.state === 'buried' && q.pop > 0.9; });
      if (bur.length && this.phase === 'dig') { var w = this._crng.pick(bur); w.trv += kickFor(cfg.wiggleKick, cfg.wiggleOmega, cfg.wiggleZeta) * (this._crng.chance(0.5) ? 1 : -1); }
    }
    for (var i = 0; i < this.mounds.length; i++) {
      var m = this.mounds[i];
      if (enter || m.pop < 1 && !clear) {
        var tt = (enter ? this.phaseTime : 99) - m._popAt;
        if (tt >= 0 && !m._popped) { m._popped = true; this._emit({ type: 'puff', id: m.id, x: m.x, y: m.y }); }
        m.pop = tt <= 0 ? 0 : tt >= cfg.popTime ? 1 : easeOutBack(tt / cfg.popTime);
        m.peekIn = smooth((tt - 0.12) / 0.35);
      }
      if (clear) {
        var u = clamp(this.phaseTime / cfg.sinkTime, 0, 1);
        if (m.sink === 0) { m._sinkPop = m.pop; m._sinkRise = m.rise; }
        m.sink = u; m.pop = m._sinkPop * (1 - smooth(u)); m.rise = m._sinkRise * (1 - smooth(u)); m.peekIn = 1 - smooth(u); m.rv = 0;
      }
      // dig ease toward its target, the mound jiggle
      m.dig += (m.digT - m.dig) * Math.min(1, h * cfg.digRate);
      spring(m, 'wob', 'wv', 0, cfg.moundOmega, cfg.moundZeta, h);
      // reveal spring + squash & stretch from its velocity
      var rising = m.state === 'open' || m.state === 'found' || m.state === 'empty' ||
        (m.state === 'digging' && !!this.dig && this.dig.id === m.id && this.dig.phase === 'rise');
      if (!clear && rising) {
        var rv0 = m.rv;
        spring(m, 'rise', 'rv', m.state === 'open' && m.openT >= cfg.wrongSinkAfter ? cfg.wrongRise : 1, cfg.riseOmega, cfg.riseZeta, h);   // a wrong thing sinks back partly
        if (rv0 > 0 && m.rv <= 0 && !m._sqd) { m._sqd = true; m.qv += kickFor(cfg.riseSquash, cfg.itemOmega, cfg.itemZeta); }   // it stops at the top: squash
        spring(m, 'q', 'qv', 0, cfg.itemOmega, cfg.itemZeta, h);
        if (m.state !== 'found') {   // stretch while shooting up, squash when it stops and settles (found: prep / hatch own it)
          var st = clamp(m.rv * cfg.riseStretch, cfg.riseSquashMin, cfg.riseSquashMax) - m.q;
          m.tsy = 1 + st; m.tsx = 1 / Math.sqrt(Math.max(0.3, m.tsy));
        }
      }
      spring(m, 'twob', 'twv', 0, cfg.wrongOmega, cfg.wrongZeta, h);
      if (!m.after || m.after === 'prep' || m.hatched) spring(m, 'trot', 'trv', 0, cfg.wiggleOmega, cfg.wiggleZeta, h);
      if (m.state === 'found') this._stepFound(m, h);
      if (m.state === 'open') { m.openT += h; if (m.openT >= cfg.dimAfter) m.dim += (cfg.dimTo - m.dim) * Math.min(1, h * cfg.dimRate); }
      if (m._glowT > 0) m._glowT = Math.max(0, m._glowT - h);
      var gT = m._glowT > 0 ? 1 : 0;
      m.glow += (gT - m.glow) * Math.min(1, h * (gT ? 6 : 3));
      if (m.sparkle > 0) m.sparkle = Math.max(0, m.sparkle - h / 0.9);
      this._geo(m);
    }
  };

  // ---------------------------------------------------------------- surprises
  /** A free sand spot in the field for the mole (bottom anchor), clear of every mound, Bun and the keep-out boxes; null if none. */
  P._moleSpot = function () {
    var L = this.layout, cfg = this.cfg, best = null, bd = -1, B = this._bunBox(), need = cfg.moleClear * L.item;
    for (var k = 0; k < L.rows.length; k++) {
      var r = L.rows[k];
      for (var x = r.x0 + 50; x <= r.x1 - 50; x += 16) {
        var y = Math.min(L.groundY - 10, r.y), c = { x: x, y: y - 0.45 * cfg.moleH * L.item };
        if (x - cfg.moleR < B.x + B.w + 10 && c.y + cfg.moleR > B.y) continue;
        var dmin = 1e9;
        for (var i = 0; i < this.mounds.length; i++) { var hc = this._hitC(this.mounds[i]); dmin = Math.min(dmin, hyp(c.x - hc.x, c.y - hc.y)); }
        if (dmin < need) continue;
        var bad = false;
        for (i = 0; i < L.keep.length; i++) if (inBox(L.keep[i], c.x, c.y, cfg.moleR)) bad = true;
        if (bad) continue;
        var score = Math.min(dmin, 3 * L.item) + this._crng.float(0, 40);
        if (score > bd) { bd = score; best = { x: x, y: y }; }
      }
    }
    return best;
  };
  P._stepSurprises = function (h) {
    var cfg = this.cfg, L = this.layout, M = this.mole, Pt = this.ptero, dig = this.state === 'round' && this.phase === 'dig';
    if (this._moleNext >= 0 && dig && !M) {
      this._moleNext -= h;
      if (this._moleNext < 0) {
        var spot = this._moleSpot();
        this._moleTimes++;
        if (spot) {
          M = this.mole = { x: spot.x, y: spot.y, h: cfg.moleH * L.item, up: 0, _pup: 0, uv: 0, state: 'up', t: 0, spin: 0, _pspin: 0, q: 0, qv: 0, sx: 1, sy: 1 };
          this._emit({ type: 'mole', x: spot.x, y: spot.y });
        } else if (this._moleTimes >= cfg.moleTimes && !this.ptero && this._pteroPasses === 0) this._pteroNext = 0.5;   // no room: the pterosaur comes
        else if (this._moleTimes < cfg.moleTimes) this._moleNext = cfg.moleGap;
      }
    }
    if (M) {
      M.t += h;
      var target = M.state === 'down' ? 0 : 1;
      spring(M, 'up', 'uv', target, cfg.moleOmega, cfg.moleZeta, h);
      spring(M, 'q', 'qv', 0, 18, 0.25, h);
      M.sy = 1 + M.q; M.sx = 1 / Math.sqrt(Math.max(0.3, M.sy));
      if (M.state === 'up' && M.t >= cfg.moleStay) { M.state = 'down'; M.t = 0; M.tapped = false; }
      else if (M.state === 'happy') { M.spin = TAU * easeOut2(M.t / 0.6); if (M.t >= cfg.moleHappy) { M.state = 'down'; M.t = 0; M.tapped = true; } }
      else if (M.state === 'down' && M.up < 0.03 && M.t > 0.3) {
        this.mole = null;
        if (!M.tapped && this._moleTimes < cfg.moleTimes && dig) this._moleNext = cfg.moleGap;
      }
    }
    if (this._pteroNext >= 0 && dig && !Pt) {
      this._pteroNext -= h;
      if (this._pteroNext < 0) {
        var dir = this._crng.chance(0.5) ? 1 : -1;
        Pt = this.ptero = { x: dir > 0 ? -cfg.pteroW : L.W + cfg.pteroW, y: L.pteroY, y0: L.pteroY, _px: 0, _py: 0, dir: dir, flap: 0, loop: 0, state: 'fly', t: 0, rot: 0, _prot: 0, size: cfg.pteroW };
        Pt._px = Pt.x; Pt._py = Pt.y;
        this._pteroPasses++;
        this._emit({ type: 'ptero', x: dir > 0 ? 0 : L.W, y: Pt.y, dir: dir });
      }
    }
    if (Pt) {
      Pt.t += h;
      if (Pt.state === 'loop') {
        Pt.loop = Math.min(1, Pt.loop + h / cfg.loopTime);
        var a = TAU * smooth(Pt.loop);
        Pt.x = Pt.lcx + Pt.dir * cfg.loopR * Math.sin(a); Pt.y = Pt.lcy + cfg.loopR * Math.cos(a);
        Pt.rot = -Pt.dir * a; Pt.flap = (Pt.t * 5) % 1;
        if (Pt.loop >= 1) { Pt.state = 'happy'; Pt.rot = 0; Pt.y0 = Pt.y; Pt.t = 0; }
      } else {
        var sp = Pt.state === 'happy' ? cfg.pteroHappySpeed : cfg.pteroSpeed;
        Pt.x += Pt.dir * sp * h;
        Pt.y = Pt.y0 + cfg.pteroBob * Math.sin(TAU * 0.5 * Pt.t) - (Pt.state === 'happy' ? 50 * Math.min(1, Pt.t) : 0);
        Pt.rot = 0.08 * Math.cos(TAU * 0.5 * Pt.t) * Pt.dir;
        Pt.flap = (Pt.t * (Pt.state === 'happy' ? 4.5 : 2.6)) % 1;
        if ((Pt.dir > 0 && Pt.x > L.W + cfg.pteroW) || (Pt.dir < 0 && Pt.x < -cfg.pteroW)) {
          var again = Pt.state === 'fly' && this._pteroPasses < cfg.pteroPasses && dig;
          this.ptero = null;
          this._pteroNext = again ? cfg.pteroGap : -1;
        }
      }
    }
  };

  P._stepBun = function (h) {
    var b = this.bun, cfg = this.cfg, L = this.layout;
    b.x = L.bun.x; b.y = L.bun.y; b.h = L.bun.h;
    if (b.moodT > 0) { b.moodT -= h; if (b.moodT <= 0) { b.moodT = 0; b.mood = 'idle'; } }
    b.blinkT -= h;
    if (b.blink && b.blinkT <= 0) { b.blink = false; b.blinkT = this._crng.float(cfg.blink[0], cfg.blink[1]); }
    else if (!b.blink && b.blinkT <= 0) { b.blink = true; b.blinkT = cfg.blinkTime; }
    if (b._hopT >= 0) { b._hopT += h; var u = b._hopT / cfg.hopTime; b.hop = u < 1 ? Math.sin(Math.PI * u) : 0; if (u >= 1) b._hopT = -1; }
    var tx = (L.field.x0 + L.field.x1) / 2;
    if (this.hintHand) tx = this.hintHand.x;
    else if (this.flying.length) tx = this.flying[0].x;
    else if (this.dig) tx = this.shovel.x;
    else if (this.ptero) tx = this.ptero.x;
    else if (this.mole) tx = this.mole.x;
    b.lookX += (tx - b.lookX) * Math.min(1, h * cfg.lookRate);
    b.look = clamp((b.lookX - b.x) / 500, -1, 1);
  };

  DD.World = World;
})(window.DD = window.DD || {});
