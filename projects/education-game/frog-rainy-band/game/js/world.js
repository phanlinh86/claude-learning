/* Bop's Rainy Band — RB.CONFIG + RB.World (headless, deterministic band simulation; DESIGN §2, §5.2)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. Screen space = world space (no camera).
 *  update(dt) runs fixed sub-steps of cfg.step (1/120 s); at the START of every sub-step members / flying notes / the snail
 *  store _px/_py/_prot. Render p = _p + (p − _p)·alpha.
 *
 *  MEMBER (w.members[], a band member on a stool): (x, y) = CENTRE of its S×S bounding square (layout.S). Draw:
 *    translate(x, y) · rotate(rot) · scale(sx, sy) · BandArt.drawMember(ctx, item, S, {glow, hit, sing}). The squash is
 *    already bottom-anchored in y (y = slot.y + S/2·(1 − sy) − hop height), so a squashed drum stays on its stool. The stool
 *    stays at the slot: BandArt.drawStool at (slot.x, layout.stage.y − stoolH) — m.homeX / m.homeY = slot centre.
 *    A 'size' small drum: BandArt draws it at 0.68·S inside the same square (bottom-aligned is band_art's job).
 *  BIG DRUM: w.bigDrum {x, y (centre), r, sx, sy, hit, glow, count}: draw translate(x, y + 0.75r·(1 − sy)) · scale(sx, sy).
 *  BOP: w.bop {x, y (FEET), h, mood, look −1..1, blink}. Frames bop_<mood>.svg (300×300, feet (150, 292)).
 *  SHEET: layout.sheet {x0, x1, y, slots:[{x, y}]}; w.sheet.notes[i] = null | {color, item, pitch, memberId, pop 0..1}:
 *    draw the note at slot i scaled 1 + 0.4·pop (pop 1 → 0 in 0.35 s: on landing and on its song beat).
 *  FLYING NOTES: w.flyNotes[] {x, y, _px, _py, rot, _prot, color, t, T, toSlot} — note head centre.
 *  COUNT CARD: w.countCard null | {n, lit, show 0..1}; layout.countCard {x, y, w, h (top-left box), cx, cy (centre)}.
 *  HINT HAND: w.hintHand null | {x, y (fingertip), t 0..1 tap animation, alpha, target: memberId | 'bigDrum'}.
 *  SNAIL: w.snail null | {x, y (bottom centre, on the grass in front of the stage's right pot), size (drawn width), sx,
 *    ring 0..1, state 'in'|'rest'|'ring'|'out', flip}. snail_ring.svg while ring > 0.
 *  SHOWER: w.shower 0..1 (main → weather.setShower(w.shower)).
 * ========================================================================
 */
(function (RB) {
  'use strict';

  var CONFIG = {
    // ---- timing / state machine (s)
    step: 1 / 120,             // fixed simulation sub-step (≤ 1/120 per DESIGN)
    maxFrame: 1.0,             // largest dt accepted per update() (speed mode passes big dt)
    roundsPerLevel: 4,         // songs per chapter
    chapterTimeLimit: 80,      // s since the chapter began: after ≥ chapterMinRounds songs go to Talk time once exceeded
    chapterMinRounds: 3,
    introTime: 2.5,            // chapter banner + season line (the 2.5 s weather crossfade)
    talkAfterAnswer: 1.6,
    levelDoneTime: 1.8,
    talkAskTime: 12,           // s without an answer → talkAsk (re-ask), repeating
    talkGlowAfterAsks: 2,

    // ---- layout (DESIGN §2; px)
    shortSide: 720, minLong: 960, maxLong: 1600, tallRatio: 1.6,
    groundLand: 24, groundPort: 36,
    memberS: 150, memberS4: 132, tallScale: 1.15, memberMin: 112,
    stageX0Land: 400, stageX0Small: 375, smallW: 1100, stageEdge: 24, stageDyLand: 74, stageDyPort: 330, stageDyTall: 380,
    stoolH: 38, slotEdge: 20, slotGap: 24, slotMaxGap: 110,
    bigDrumLand: { dx: 280, dy: 92, r: 92 }, bigDrumPort: { dx: 470, dy: 100, r: 100 },
    bopLand: { dx: 130, dy: 4, h: 300 }, bopPort: { dx: 150, dy: 4, h: 320 },
    sheetTopLand: 200, sheetAbove: 170, sheetBelowBubble: 100, sheetAbovePort: 230, noteR: 34, noteGap: 110,
    cardW: 180, cardH: 150, cardAbove: 190, cardGap: 12,
    bubbleX: 24, bubbleYLand: 18, bubbleMaxW: 560, bubbleRight: 200, bubbleHLand: 122, bubbleYPort: 110, bubbleHPort: 124,
    hudW: 160, hudH: 96,
    hitFrac: 0.6, hitPad: 14,  // member hit box: centre ± (0.6·S + 14)
    drumPad: 20, drumAssistPad: 90, bopHalfW: 0.3, bopPad: 20, snailR: 70,

    // ---- input
    tapMovePx: 40, tapTime: 0.6,   // tap = down + up < 0.6 s and < max(40, w.tapMoveMin) px; a held / slid finger does nothing
    pressSquash: 0.06,             // tiny squash while a finger rests on a member

    // ---- motion (physics)
    hopG: 1600, hopApex: 120, hopFar: 700, hopPause: 0.05, dealStagger: 0.12, dealDelay: 0.2, dealSettle: 0.12,
    outG: 2400, outApex: 100, outStagger: 0.12,
    squashOmega: 22, squashZeta: 0.35,          // member / drum squash spring (visible overshoot, settles in ≈ 0.3 s)
    landSquash: 0.2,                            // hop landing: sy 0.8 → spring back
    playSquash: 0.18,                           // a played member: sy 0.82, sx 1.15
    sxPerQ: 0.83,                               // sx = 1 + 0.83·q
    hitTime: 0.4, singTime: 0.7,
    wobOmega: 18, wobZeta: 0.22, wobPeak: 0.25, // wrong: damped rotational wobble ±0.25 rad, ≈ 0.5 s
    swayAmp: 0.035, swayHz: 0.45, breatheAmp: 0.02, breatheHz: 0.6,
    wiggleAmp: 0.1, wiggleHz: 2.2, glowBounce: 8,
    noteTime: 0.55, noteApex: 90, noteSpin: 5.5, popTime: 0.35,
    drumSquash: 0.12, drumHitTime: 0.35, beatSquash: 0.1,

    // ---- round flow
    playTime: 0.6,             // phase 'play' after a right tap (the note flies 0.55 s)
    beatLead: 2.4, beatGap: 0.6, beatTail: 0.5, replayLead: 0.7,   // listen: Bop's beats start after the prompt began
    songLead: 0.5, songGap: 0.45, songTail: 0.45, songHold: 0.6,
    clearTime: 0.9, clearNoteGap: 0.1,
    countCardRate: 5,

    // ---- help
    hintAfterMisses: 2,        // the 2nd miss on an ask always hints
    hintCooldown: 6,
    wrongLock: 0.6,            // s: member taps ignored after a wrong one → event 'locked'
    hintTime: 4, hintTap: 0.9,
    idleTime: 12, idleBackoff: 1.5, idleMax: 30, idleHintFrom: 2,
    softMissHint: 2,           // drum ask: the 2nd tap on a band drum instead of the big drum hints the big drum
    // once the big drum was hinted in a drum ask, a tap on empty space within drumAssistPad px around it counts on it too

    // ---- surprise round: one per chapter, the type rotates per chapter from a random start per session
    surpriseRound: 2,
    surpriseTypes: ['snail', 'shower'],
    snailIn: 5, snailOut: 2.5, snailRing: 0.6, snailSize: 110, snailDx: 60, snailFrom: 90,
    showerTime: 4, showerUp: 0.4, showerDown: 0.6, umbrellaTime: 2.5, raindrops: 6, raindropAt: 0.5, raindropGap: 0.55,

    // ---- Bop
    moodTime: { happy: 0.9, cheer: 1.6, oops: 0.8, think: 1.4, talk: 1.0, drum: 0.22, drum_up: 0.3, umbrella: 2.5 },
    lookRate: 6, blink: [2.2, 5], blinkTime: 0.13
  };
  RB.CONFIG = CONFIG;

  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; if (b) for (k in b) o[k] = b[k]; return o; }
  /** Initial velocity that makes a damped spring (from rest at 0) peak at `peak`. */
  function kickFor(peak, w, z) { var s = Math.sqrt(1 - z * z); return peak * w * Math.exp(z / s * Math.atan2(s, z)); }
  function keepBoxes(hk) {
    var a = Array.isArray(hk) ? hk : hk ? [hk] : [], out = [];
    for (var i = 0; i < a.length; i++) { var b = a[i]; if (b && b.w > 0 && b.h > 0) out.push({ x: +b.x, y: +b.y, w: +b.w, h: +b.h }); }
    return out;
  }
  function insOf(ins) {
    return { top: +(ins && ins.top) || 0, right: +(ins && ins.right) || 0, bottom: +(ins && ins.bottom) || 0, left: +(ins && ins.left) || 0 };
  }

  /** DESIGN §2 short-side rule: CSS viewport → logical W×H. */
  function logicalSize(cssW, cssH, cfg) {
    cfg = cfg || CONFIG;
    var S = cfg.shortSide, aspect = cssW / Math.max(1, cssH);
    if (cssW >= cssH) return { W: clamp(Math.round(S * aspect), cfg.minLong, cfg.maxLong), H: S };
    return { W: S, H: clamp(Math.round(S / aspect), cfg.minLong, cfg.maxLong) };
  }

  /** DESIGN §2 layout for a round of k members and n notes (count = a counting round: room for the count card). */
  function computeLayout(W, H, ins, cfg, k, n, count) {
    ins = insOf(ins);
    k = Math.max(1, k | 0); n = Math.max(1, n | 0);
    var portrait = H > W, tall = H / W > cfg.tallRatio;
    var groundY = H - ins.bottom - (portrait ? cfg.groundPort : cfg.groundLand);
    var stage = portrait
      ? { x0: ins.left + cfg.stageEdge, x1: W - ins.right - cfg.stageEdge, y: groundY - (tall ? cfg.stageDyTall : cfg.stageDyPort) }
      : { x0: ins.left + (W < cfg.smallW ? cfg.stageX0Small : cfg.stageX0Land), x1: W - ins.right - cfg.stageEdge, y: groundY - cfg.stageDyLand };
    var S0 = k >= 4 ? cfg.memberS4 : cfg.memberS;
    if (portrait && tall) S0 *= cfg.tallScale;
    var span = stage.x1 - stage.x0 - 2 * cfg.slotEdge;
    var fit = (span - (k - 1) * cfg.slotGap) / k;
    var S = Math.max(cfg.memberMin, Math.floor(Math.min(S0, fit)));
    var slots = slotsFor(stage, S, k, cfg);
    var bd = portrait ? cfg.bigDrumPort : cfg.bigDrumLand, bp = portrait ? cfg.bopPort : cfg.bopLand;
    var bigDrum = { x: ins.left + bd.dx, y: groundY - bd.dy, r: bd.r };
    var bop = { x: ins.left + bp.dx, y: groundY - bp.dy, h: bp.h };
    var bx = ins.left + cfg.bubbleX;
    // portrait: tall phones put the bubble under the HUD row; short portraits (iPads) on the HUD row, left of the HUD, so the
    // song sheet and the count card fit above the band
    var bubble = portrait
      ? (tall ? { x: bx, y: ins.top + cfg.bubbleYPort, w: W - bx - ins.right - cfg.bubbleX, h: cfg.bubbleHPort }
              : { x: bx, y: ins.top + cfg.bubbleYLand, w: W - ins.right - cfg.hudW - 14 - bx, h: cfg.bubbleHPort })
      : { x: bx, y: ins.top + cfg.bubbleYLand, w: Math.min(cfg.bubbleMaxW, W - ins.right - cfg.bubbleRight - bx), h: cfg.bubbleHLand };
    bubble.w = Math.max(0, bubble.w);
    var bubbleB = bubble.y + bubble.h;
    var hud = { x: W - ins.right - cfg.hudW, y: 0, w: cfg.hudW + ins.right, h: ins.top + cfg.hudH };
    // count card (top-left box + centre)
    var card;
    if (portrait) {
      var ccy = bubbleB + cfg.cardGap + cfg.cardH / 2;
      card = { cx: stage.x1 - cfg.cardW / 2, cy: ccy };
    } else {
      var top = Math.max(bubbleB + cfg.cardGap, bigDrum.y - 1.5 * bigDrum.r - cfg.cardAbove);
      card = { cx: bigDrum.x, cy: top + cfg.cardH / 2 };
    }
    card.w = cfg.cardW; card.h = cfg.cardH; card.x = card.cx - card.w / 2; card.y = card.cy - card.h / 2;
    // song sheet
    var sy = portrait ? Math.max(bubbleB + cfg.sheetBelowBubble, stage.y - S - cfg.stoolH - cfg.sheetAbovePort) : Math.max(ins.top + cfg.sheetTopLand, stage.y - S - cfg.stoolH - cfg.sheetAbove);
    var sx0 = stage.x0, sx1 = stage.x1;
    if (portrait && count) sx1 = card.x - 16;     // the card sits at the right of the sheet row
    var sheet = { x0: sx0, x1: sx1, y: sy, noteR: cfg.noteR, slots: [] };
    var room = sx1 - sx0 - 2 * cfg.noteR - 40, gap = n > 1 ? Math.min(cfg.noteGap, room / (n - 1)) : 0, c = (sx0 + sx1) / 2;
    for (var i = 0; i < n; i++) sheet.slots.push({ x: c - gap * (n - 1) / 2 + i * gap, y: sy });
    return {
      W: W, H: H, ins: ins, portrait: portrait, tall: tall, groundY: groundY, S: S, k: k, n: n, stage: stage, slots: slots,
      stoolH: cfg.stoolH, bigDrum: bigDrum, bop: bop, sheet: sheet, noteR: cfg.noteR, countCard: card, bubble: bubble, hud: hud,
      splashY: groundY, safe: { x: ins.left, y: ins.top, w: W - ins.left - ins.right, h: H - ins.top - ins.bottom }
    };
  }
  /** Member centres: evenly spaced (≥ S + 24, ≤ S + 110 apart), centred over the stage. */
  function slotsFor(stage, S, k, cfg) {
    var a = stage.x0 + S / 2 + cfg.slotEdge, b = stage.x1 - S / 2 - cfg.slotEdge, out = [];
    var gap = k > 1 ? Math.min((b - a) / (k - 1), S + cfg.slotMaxGap) : 0, c = (a + b) / 2, y = stage.y - cfg.stoolH - S / 2;
    for (var i = 0; i < k; i++) out.push({ x: c - gap * (k - 1) / 2 + i * gap, y: y });
    return out;
  }

  // ------------------------------------------------------------------ World
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.rng = new RB.RNG(this.seed);
    this._crng = new RB.RNG((RB.RNG.hash(this.seed) ^ 0x51ed27) >>> 0);   // cosmetic randomness (sway phases, blinks)
    this.age = RB.Content.ageOf(opts.age !== undefined ? opts.age : 4);
    this.lang = opts.lang === 'vi' ? 'vi' : 'en';
    this._pendingAge = this.age; this._pendingLang = this.lang;
    this.state = 'menu'; this.phase = null;
    this.level = 0; this.levels = []; this.topic = null; this.weather = 0;
    this.round = 0; this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.stars = 0; this.levelStars = 0; this.roundStars = 0; this.songs = 0;
    this.ask = 0; this.asks = 0; this.misses = 0; this.askMisses = 0; this.streak = 0;
    this.time = 0; this.stateTime = 0; this.phaseTime = 0; this.alpha = 0; this._acc = 0;
    this.cur = null; this.members = []; this.flyNotes = []; this.sheet = { n: 0, notes: [] }; this.countCard = null;
    this.talk = null; this.talkAnswered = null; this.wind = 0; this.shower = 0;
    this.hudKeep = opts.hudKeep || null; this.lastTopics = null; this.surprise = null; this._surpriseOff = 0;
    this.snail = null; this.hintHand = null;
    this.bigDrum = { x: 0, y: 0, r: 92, sx: 1, sy: 1, q: 0, qv: 0, hit: 0, glow: 0, _glowT: 0, count: 0 };
    this.bop = { x: 0, y: 0, h: 300, mood: 'idle', moodT: 0, blinkT: 3, blink: false, look: 0, lookX: 0, lookY: 0 };
    this.events = []; this.sessions = 0; this._idN = 0;
    this._idleN = 0; this._idleT = 0; this._idleGap = this.cfg.idleTime; this._lastHintT = -1e9; this.levelStartTime = 0;
    this._talkAskT = 0; this._talkAsks = 0; this._lockUntil = -1; this._press = null; this._softMiss = 0;
    this._vp = null; this._view = null; this.tapMoveMin = 0; this._wobDir = 1;
    this.setViewport(opts.width || 1280, opts.height || 720, opts.ins || null);
  }
  World.logicalSize = logicalSize;
  World.computeLayout = function (W, H, ins, cfg, k, n, count) { return computeLayout(W, H, ins, merge(CONFIG, cfg), k || 3, n || 4, !!count); };
  World.slotsFor = slotsFor;
  World.kickFor = kickFor;

  var P = World.prototype;
  Object.defineProperty(P, 'interactive', { get: function () { return this.state === 'round' && this.phase === 'ask'; } });
  P._emit = function (e) { this.events.push(e); };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };
  P.setAge = function (a) { this._pendingAge = RB.Content.ageOf(a); };
  P.setLang = function (l) { this._pendingLang = l === 'vi' ? 'vi' : 'en'; };
  P.memberById = function (id) { for (var i = 0; i < this.members.length; i++) if (this.members[i].id === id) return this.members[i]; return null; };
  P._setState = function (s) { this.state = s; this.stateTime = 0; };
  P._setPhase = function (p) { this.phase = p; this.phaseTime = 0; };
  P._mood = function (m, t) { this.bop.mood = m; this.bop.moodT = t || this.cfg.moodTime[m] || 1; };
  P.skipTalk = function () { if (this.state === 'talk') this._levelDone(); };
  P._askObj = function () { return this.cur && this.ask < this.cur.asks.length ? this.cur.asks[this.ask] : null; };
  P._mode = function () { var a = this._askObj(); return a ? a.mode : null; };
  P._rightMember = function () {
    var a = this._askObj();
    if (!a || a.answer < 0) return null;
    return this.members[a.answer] || null;
  };
  /** The current question {promptKey, params, mode, n?} (null outside an open ask). */
  P.prompt = function () {
    if (this.state !== 'round' || !this.cur || (this.phase !== 'ask' && this.phase !== 'beats')) return null;
    var a = this._askObj();
    return a ? { promptKey: a.promptKey, params: a.params, mode: a.mode, n: a.n } : null;
  };
  /** Id of the right member of the current ask (null in mode drum / when no ask is open). */
  P.answerId = function () {
    if (this.state !== 'round' || this.phase !== 'ask') return null;
    var m = this._rightMember();
    return m ? m.id : null;
  };

  // ---------------------------------------------------------------- geometry
  P._hitHalf = function () { return this.cfg.hitFrac * this.layout.S + this.cfg.hitPad; };
  /** Hit box of a member: {x, y (centre), w, h} logical px. */
  P.memberHit = function (id) {
    var m = typeof id === 'object' ? id : this.memberById(id);
    if (!m) return null;
    var h = this._hitHalf();
    return { x: m.homeX, y: m.homeY, w: 2 * h, h: 2 * h };
  };
  P._drumBox = function (pad) { var D = this.layout.bigDrum; pad = pad || 0; return { l: D.x - D.r - pad, r: D.x + D.r + pad, t: D.y - 0.75 * D.r - pad, b: D.y + 0.75 * D.r + pad }; };
  P.bigDrumHit = function () { var b = this._drumBox(this.cfg.drumPad); return { x: (b.l + b.r) / 2, y: (b.t + b.b) / 2, w: b.r - b.l, h: b.b - b.t }; };
  P._bopBox = function () { var Q = this.layout.bop, hw = this.cfg.bopHalfW * Q.h, p = this.cfg.bopPad; return { l: Q.x - hw - p, t: Q.y - Q.h - p, r: Q.x + hw + p, b: Q.y + p }; };
  P.bopHit = function () { var b = this._bopBox(); return { x: (b.l + b.r) / 2, y: (b.t + b.b) / 2, w: b.r - b.l, h: b.b - b.t }; };
  P.snailHit = function () { var s = this.snail; return s ? { x: s.x, y: s.y - 40, w: 2 * this.cfg.snailR, h: 2 * this.cfg.snailR } : null; };
  P.slotOf = function (i) { return this.layout.sheet.slots[i] || null; };
  function inBox(x, y, b) { return x >= b.l && x <= b.r && y >= b.t && y <= b.b; }

  /** What is under (x, y)? the snail, the big drum's drawn body, the nearest member box, the padded big drum, Bop. */
  P._hit = function (x, y) {
    var S = this.snail, i;
    if (S && S.state !== 'out' && hyp(x - S.x, y - (S.y - 40)) <= this.cfg.snailR) return { kind: 'snail' };
    if (inBox(x, y, this._drumBox(0))) return { kind: 'bigDrum' };
    var hh = this._hitHalf(), best = null, bd = 1e9;
    for (i = 0; i < this.members.length; i++) {
      var m = this.members[i];
      if (m.state !== 'rest' && m.state !== 'in') continue;
      if (Math.abs(x - m.homeX) > hh || Math.abs(y - m.homeY) > hh) continue;
      var d = hyp(x - m.homeX, y - m.homeY);
      if (d < bd) { bd = d; best = m; }
    }
    if (best) return { kind: 'member', m: best };
    if (inBox(x, y, this._drumBox(this.cfg.drumPad))) return { kind: 'bigDrum' };
    if (inBox(x, y, this._bopBox())) return { kind: 'bop' };
    return null;
  };

  // ---------------------------------------------------------------- viewport
  P.setViewport = function (W, H, ins) {
    this._view = { W: W, H: H, ins: insOf(ins) };
    this._relayout(false);
  };
  P._plan = function () {
    var k = this.members.length || RB.Content.maxMembers(this.age), n = this.sheet.n || 4;
    return { k: k, n: n, count: this.topic === 'count' };
  };
  P._relayout = function (force) {
    var v = this._view, pl = this._plan();
    var key = v.W + 'x' + v.H + ':' + JSON.stringify(v.ins) + ':' + pl.k + ':' + pl.n + ':' + pl.count + ':' + JSON.stringify(this.hudKeep || null);
    if (key === this._vp && !force) return;
    var had = !!this.layout;
    this._vp = key;
    this.layout = computeLayout(v.W, v.H, v.ins, this.cfg, pl.k, pl.n, pl.count);
    this.layout.hudKeep = keepBoxes(this.hudKeep);
    var L = this.layout, D = this.bigDrum;
    D.x = L.bigDrum.x; D.y = L.bigDrum.y; D.r = L.bigDrum.r;
    this.bop.x = L.bop.x; this.bop.y = L.bop.y; this.bop.h = L.bop.h;
    if (had) this._snapAll();
  };
  /** Rotation / resize mid-round: cancel the press, re-layout, snap members to their new slots, land flying notes. */
  P._snapAll = function () {
    var self = this, L = this.layout;
    this._unpress(); this._press = null;
    this.members.forEach(function (m, i) {
      var s = L.slots[m.slot] || L.slots[i];
      if (s) { m.homeX = s.x; m.homeY = s.y; }
      if (m.state === 'out') m.state = 'gone';
      if (m.state === 'in') { m.state = 'rest'; m.arc = null; m.hops = []; }
      m.x = m._px = m.state === 'wait' ? L.W + L.S : m.homeX; m.y = m._py = m.homeY;
    });
    this.members = this.members.filter(function (m) { return m.state !== 'gone'; });
    while (this.flyNotes.length) this._landNote(this.flyNotes[0]);
    if (this.hintHand) this._hintGeo();
    if (this.snail) this._snailGeo(true);
  };

  // ---------------------------------------------------------------- session flow
  P._newId = function (p) { return p + (this._idN++); };

  P.newSession = function (opts) {
    this.age = this._pendingAge; this.lang = this._pendingLang;
    this.sessions++;
    this._clearRound(); this.cur = null; this.state = 'menu';
    var last = (opts && opts.lastTopics) || this.lastTopics || null;
    this.levels = RB.Content.topicsFor(this.age, this.rng, last);
    this._surpriseOff = this.rng.int(0, Math.max(0, this.cfg.surpriseTypes.length - 1));
    this.stars = 0; this.songs = 0;
    this.weather = 0;
    this._emit({ type: 'session', levels: this.levels.slice() });
    this.startLevel(0);
  };

  P._clearRound = function () {
    this.members = []; this.flyNotes = []; this.sheet = { n: 0, notes: [] }; this.countCard = null;
    this.snail = null; this.hintHand = null; this._unpress(); this._press = null; this.shower = 0; this._shower = null;
    this.bigDrum.count = 0; this.bigDrum._glowT = 0;
  };

  P.startLevel = function (i) {
    if (!this.levels.length) this.levels = RB.Content.topicsFor(this.age);
    this.level = clamp(i | 0, 0, this.levels.length - 1);
    this.topic = this.levels[this.level];
    this.weather = this.level % 4;
    this.round = 0; this.levelStars = 0; this.levelStartTime = this.time;
    this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.cur = null; this.talk = null; this.talkAnswered = null; this.surprise = null; this._lastAsk = null; this._lastKey = null;
    this._clearRound();
    this._relayout(false);
    this._setState('intro'); this.phase = null;
    this._mood('idle', 0.01);
    this._emit({ type: 'level', level: this.level, topic: this.topic, weather: this.weather });
  };

  P._beginRound = function () {
    var cfg = this.cfg, self = this;
    var rr = new RB.RNG((this.rng.next() * 4294967296) >>> 0);
    var ST = cfg.surpriseTypes, sp = ST && ST.length && this.round === cfg.surpriseRound ? ST[(this.level + this._surpriseOff) % ST.length] : null;
    this.cur = RB.Content.makeRound(this.topic, { age: this.age, lang: this.lang, rng: rr, roundIndex: this.round, surprise: sp,
      avoid: this._lastAsk || null, prevMembers: this._lastKey || null, notes: cfg.notesByRound ? cfg.notesByRound[this.round] : undefined });
    if (sp === 'shower' && this.cur.n < 3) sp = 'snail';   // the shower comes after the 2nd note: it needs a 3rd
    this.cur.surprise = sp; this.surprise = sp;
    this._lastAsk = this.cur.asks[this.cur.asks.length - 1]; this._lastKey = this.cur.key;
    this.ask = 0; this.asks = this.cur.n; this.misses = 0; this.askMisses = 0; this.streak = 0;
    this._clearRound();
    this.sheet = { n: this.cur.n, notes: [] };
    for (var i = 0; i < this.cur.n; i++) this.sheet.notes.push(null);
    this.members = this.cur.band.map(function (item, j) {
      return { id: self._newId('m'), item: item, slot: j, x: 0, y: 0, _px: 0, _py: 0, homeX: 0, homeY: 0, sx: 1, sy: 1, rot: 0, _prot: 0,
        glow: 0, _glowT: 0, hit: 0, sing: 0, _singT: 0, state: 'wait', t: 0, q: 0, qv: 0, wob: 0, wv: 0, arc: null, hops: [], wait: 0,
        delay: 0, pressed: false, hinted: false, ph: self._crng.float(0, TAU), hy: 0 };
    });
    this._relayout(false);
    var L = this.layout;
    this.members.forEach(function (m, j) { var s = L.slots[j]; m.homeX = s.x; m.homeY = s.y; m.x = m._px = L.W + L.S; m.y = m._py = s.y; });
    this._setState('round'); this._setPhase('deal');
    this._dealAt = this.time + cfg.dealDelay;
    this._mood('happy', 1.0);
    this._emit({ type: 'round', round: this.round, topic: this.topic, n: this.cur.n, asks: this.asks, mode: this.cur.mode,
      members: this.members.length, surprise: sp });
  };

  P._deal = function () {
    var cfg = this.cfg, L = this.layout, ids = [];
    for (var j = 0; j < this.members.length; j++) {
      var m = this.members[j];
      m.state = 'in'; m.t = 0; m.delay = j * cfg.dealStagger;
      var x0 = L.W + L.S, d = x0 - m.homeX;
      m.x = m._px = x0;
      m.hops = d > cfg.hopFar ? [{ x: (x0 + m.homeX) / 2, y: m.homeY }, { x: m.homeX, y: m.homeY }] : [{ x: m.homeX, y: m.homeY }];
      ids.push(m.id);
    }
    var c = L.slots[Math.floor(L.slots.length / 2)] || { x: L.W / 2, y: L.groundY };
    this._emit({ type: 'deal', n: ids.length, members: ids, x: c.x, y: c.y });
  };

  P._startAsk = function () {
    var a = this._askObj(), cfg = this.cfg, D = this.bigDrum, slot = this.slotOf(this.ask) || { x: 0, y: 0 };
    this.askMisses = 0; this._lockUntil = -1; this._softMiss = 0; this._drumHinted = false;
    this._idleT = 0; this._idleGap = cfg.idleTime; this._idleN = 0;
    this.members.forEach(function (m) { m._glowT = 0; m.hinted = false; });
    D._glowT = 0;
    if (a.mode === 'drum') {
      D.count = 0;
      this.countCard = { n: a.n, lit: 0, show: this.countCard ? this.countCard.show : 0, vis: true };
      this._setPhase('ask');
    } else if (a.mode === 'listen') {
      if (this.countCard) this.countCard.vis = false;
      this._beats = { i: 0, n: a.n, nextAt: this.time + cfg.beatLead, last: -1 };
      this._setPhase('beats');
    } else this._setPhase('ask');
    var R = this._rightMember();
    this._emit({ type: 'ask', ask: this.ask, asks: this.asks, promptKey: a.promptKey, params: a.params, mode: a.mode, n: a.n,
      answerId: R ? R.id : null, nameKind: a.nameKind, nameValue: a.nameValue, first: this.ask === 0, x: slot.x, y: slot.y });
  };

  /** Listen ask: Bop plays the beats again (tap on Bop / the bubble during the ask). */
  P.replayBeats = function () {
    var a = this._askObj();
    if (this.state !== 'round' || this.phase !== 'ask' || !a || a.mode !== 'listen') return false;
    this._beats = { i: 0, n: a.n, nextAt: this.time + this.cfg.replayLead, last: -1 };
    this._setPhase('beats');
    this.hintHand = null;
    this._emit({ type: 'replayBeats', n: a.n, x: this.bigDrum.x, y: this.bigDrum.y });
    return true;
  };
  P._stepBeats = function () {
    var B = this._beats, cfg = this.cfg, D = this.bigDrum;
    while (B.i < B.n && this.time >= B.nextAt - 1e-9) {
      B.i++; B.last = this.time; B.nextAt += cfg.beatGap;
      this._drumHit(cfg.beatSquash);
      this._mood('drum');
      this._emit({ type: 'beat', i: B.i, n: B.n, x: D.x, y: D.y - 0.75 * D.r });
    }
    if (B.i >= B.n && this.time >= B.last + cfg.beatTail) {
      this._setPhase('ask');
      this._idleT = 0;
      this._emit({ type: 'beatsDone', n: B.n, x: D.x, y: D.y });
    }
  };

  P._startTalk = function () {
    var rr = new RB.RNG((this.rng.next() * 4294967296) >>> 0);
    this.talk = RB.Content.makeTalk(this.topic, { age: this.age, lang: this.lang, rng: rr });
    this.talk.glowAnswer = false;
    this.talkAnswered = null; this._talkAskT = 0; this._talkAsks = 0;
    this.cur = null; this.phase = null;
    this._clearRound();
    this._setState('talk');
    this._mood('talk', 1.2);
    this._emit({ type: 'talk', talk: this.talk });
  };

  P.talkAnswer = function (choiceId) {
    if (this.state !== 'talk' || this.talkAnswered || !this.talk) return false;
    var ok = choiceId === this.talk.answerId;
    this.talkAnswered = { choiceId: choiceId, correct: ok };
    if (ok) { this.stars += 1; this.levelStars += 1; this._mood('cheer'); } else this._mood('think');
    this.stateTime = 0;
    this._emit({ type: 'talkResult', correct: ok, choiceId: choiceId, answerId: this.talk.answerId });
    return ok;
  };

  P._levelDone = function () {
    this._setState('levelDone');
    this._emit({ type: 'levelDone', level: this.level, stars: this.levelStars });
  };

  // ---------------------------------------------------------------- input (SCREEN logical px; ONE active pointer)
  P._tapMove = function () { return Math.max(this.cfg.tapMovePx, +this.tapMoveMin || 0); };
  P._locked = function () { return this.time < this._lockUntil; };
  P._touch = function () { this._idleT = 0; this._idleGap = this.cfg.idleTime; };
  P._unpress = function () { for (var i = 0; i < this.members.length; i++) this.members[i].pressed = false; };
  /** → member id | 'bigDrum' | 'bop' | 'snail' | null. Nothing happens until the finger lifts (a tap). */
  P.pointerDown = function (x, y) {
    this._unpress();
    this._press = null;
    if (this.state !== 'round') return null;
    var h = this._hit(x, y), a = this._askObj();
    if (!h && this.phase === 'ask' && a && a.mode === 'drum' && this._drumHinted && inBox(x, y, this._drumBox(this.cfg.drumAssistPad))) h = { kind: 'bigDrum' };
    if (!h) return null;
    var id = h.kind === 'member' ? h.m.id : h.kind;
    this._press = { kind: h.kind, id: id, x0: x, y0: y, t0: this.time, maxD: 0, moved: false, fx: x, fy: y };
    if (h.kind === 'member' && h.m.state === 'rest') h.m.pressed = true;   // tiny press squash
    return id;
  };
  P.pointerMove = function (x, y) {
    var d = this._press;
    if (!d) return;
    d.fx = x; d.fy = y;
    var m = hyp(x - d.x0, y - d.y0);
    if (m > d.maxD) d.maxD = m;
    if (d.maxD >= this._tapMove() && !d.moved) { d.moved = true; this._unpress(); }
  };
  /** → 'play' | 'wrong' | 'locked' | 'drum' | 'boom' | 'pokeBop' | 'snail' | null */
  P.pointerUp = function (x, y) {
    var d = this._press;
    this._press = null;
    this._unpress();
    if (!d) return null;
    if (x === undefined) { x = d.fx; y = d.fy; }
    var m = Math.max(d.maxD, hyp(x - d.x0, y - d.y0));
    var tap = !d.moved && m < this._tapMove() && this.time - d.t0 < this.cfg.tapTime;
    if (!tap || this.state !== 'round') return null;
    switch (d.kind) {
      case 'member': { var M = this.memberById(d.id); return M ? this._tapMember(M) : null; }
      case 'bigDrum': return this._tapBigDrum();
      case 'bop': return this._tapBop();
      case 'snail': return this._tapSnail();
    }
    return null;
  };
  /** The finger left (touchcancel / pause): no event. */
  P.cancelDrag = function () { this._press = null; this._unpress(); };

  P._tapMember = function (m) {
    var a = this._askObj(), cfg = this.cfg;
    if (m.state !== 'rest') return null;
    if (m.item.plain) {   // a band drum (drum-mode round): a fun little boom; tapped instead of the big drum → hint it
      this._squash(m, cfg.playSquash * 0.6); m.hit = 0.7;
      this._emit({ type: 'boom', memberId: m.id, member: true, pitch: m.item.pitch, x: m.homeX, y: m.homeY - 0.4 * this.layout.S });
      if (this.phase === 'ask' && a && a.mode === 'drum') {
        this._touch();
        if (++this._softMiss === cfg.softMissHint) this._doHint(false);
        else if (this._softMiss > cfg.softMissHint) this._autoHint(false);
      }
      return 'boom';
    }
    if (this.phase !== 'ask' || !a || a.mode === 'drum') return null;
    if (this._locked()) { this._emit({ type: 'locked', memberId: m.id, x: m.homeX, y: m.homeY }); return 'locked'; }
    this._touch();
    if (m === this._rightMember()) { this._play(m); return 'play'; }
    this._wrong(m);
    return 'wrong';
  };
  P._tapBigDrum = function () {
    var a = this._askObj(), D = this.bigDrum, cfg = this.cfg;
    if (this.phase === 'ask' && a && a.mode === 'drum') {
      this._touch();
      D.count++;
      this._drumHit(cfg.drumSquash);
      this._mood('drum');
      if (this.countCard) this.countCard.lit = D.count;
      if (D._glowT > 0) { D._glowT = 0; this.hintHand = null; }
      this._emit({ type: 'drumTap', i: D.count, n: a.n, x: D.x, y: D.y - 0.75 * D.r });
      if (D.count >= a.n) this._drumDone();
      return 'drum';
    }
    if (this.phase === 'ask' || this.phase === 'play' || this.phase === 'deal') {   // just for fun: no score, no mistake
      this._drumHit(cfg.drumSquash * 0.8);
      this._mood('drum');
      this._emit({ type: 'boom', x: D.x, y: D.y - 0.75 * D.r });
      return 'boom';
    }
    return null;
  };
  P._tapBop = function () {
    var a = this.prompt(), L = this.layout.bop;
    if (!a || this.phase === 'beats') return null;   // Bop is drumming the beats right now
    var replay = this.replayBeats();
    this._mood('talk', 1.0);
    this._emit({ type: 'pokeBop', promptKey: a.promptKey, params: a.params, mode: a.mode, replay: replay, x: L.x, y: L.y - L.h * 0.6 });
    return 'pokeBop';
  };
  P._tapSnail = function () {
    var S = this.snail;
    if (!S || S.state === 'out') return null;
    S.ring = 1; if (S.state === 'rest') S.state = 'ring'; S.t2 = 0;
    this._emit({ type: 'snailTap', x: S.x, y: S.y - 40 });
    return 'snail';
  };

  // ---------------------------------------------------------------- answers
  P._squash = function (m, peak) { m.qv += kickFor(peak, this.cfg.squashOmega, this.cfg.squashZeta); };
  P._drumHit = function (peak) { var D = this.bigDrum; D.qv += kickFor(peak, this.cfg.squashOmega, this.cfg.squashZeta); D.hit = 1; };
  P._memberPlays = function (m) {
    this._squash(m, this.cfg.playSquash); m.hit = 1;
    if (m.item.kind === 'animal') { m._singT = this.cfg.singTime; m.sing = 1; }
  };
  P._play = function (m) {
    var a = this._askObj(), i = this.ask, S = this.layout.S;
    this._memberPlays(m);
    m._glowT = 0; m.hinted = false;
    this.streak = 0; this.hintHand = null;
    this._mood('happy');
    var color = m.item.color || RB.Content.NOTE_COLORS[m.slot % RB.Content.NOTE_COLORS.length];
    this._flyNote(m.homeX, m.homeY - 0.45 * S, i, color, m.item, m.item.pitch, m.id);
    if (a.mode === 'listen') this.countCard = { n: a.n, lit: a.n, show: 0, vis: true };
    this._emit({ type: 'play', memberId: m.id, x: m.homeX, y: m.homeY, item: m.item, pitch: m.item.pitch, nameKind: m.item.nameKind,
      nameValue: m.item.nameValue, i: i, n: this.asks, mode: a.mode, promptKey: a.promptKey, params: a.params, misses: this.askMisses });
    this._setPhase('play');
  };
  P._drumDone = function () {
    var a = this._askObj(), D = this.bigDrum, i = this.ask, cn = RB.Content.countNote(a.n);
    var item = { kind: 'number', value: a.n, n: a.n, text: String(a.n), showDots: false, nameKind: 'number', nameValue: a.n, pitch: cn.pitch };
    this.streak = 0; this.hintHand = null;
    this._mood('happy');
    this._flyNote(D.x, D.y - 0.75 * D.r - 20, i, cn.color, item, cn.pitch, null);
    this._emit({ type: 'drumDone', i: i, n: a.n, x: D.x, y: D.y - 0.75 * D.r, pitch: cn.pitch, color: cn.color });
    this._setPhase('play');
  };
  P._wrong = function (m) {
    var cfg = this.cfg, a = this._askObj(), R = this._rightMember();
    this._wobDir = -this._wobDir;
    m.wv += this._wobDir * kickFor(cfg.wobPeak, cfg.wobOmega, cfg.wobZeta);
    this._squash(m, cfg.playSquash * 0.5); m.hit = 0.5;
    this.misses++; this.askMisses++; this.streak++;
    this._lockUntil = this.time + cfg.wrongLock;
    this._mood('oops');
    var want = { kind: a.nameKind, value: a.nameValue };
    if (R) { want.item = R.item; want.memberId = R.id; ['color', 'shape', 'animal', 'size', 'n', 'text'].forEach(function (k) { if (R.item[k] !== undefined) want[k] = R.item[k]; }); }
    this._emit({ type: 'wrong', memberId: m.id, x: m.homeX, y: m.homeY, item: m.item, block: m.item, pitch: m.item.pitch, nameKind: m.item.nameKind,
      nameValue: m.item.nameValue, want: want, streak: this.streak, misses: this.askMisses, mode: a.mode, promptKey: a.promptKey, params: a.params });
    if (this.askMisses === cfg.hintAfterMisses) this._doHint(false);   // the 2nd miss always hints
    else if (this.askMisses > cfg.hintAfterMisses) this._autoHint(false);
  };

  // ---------------------------------------------------------------- notes
  /** A note on a ballistic arc (fixed time noteTime, apex noteApex over the higher end) into sheet slot i. */
  P._flyNote = function (x0, y0, i, color, item, pitch, memberId) {
    var cfg = this.cfg, s = this.slotOf(i), T = cfg.noteTime;
    var yA = Math.min(y0, s.y) - cfg.noteApex, d0 = y0 - yA, d1 = s.y - yA;
    var g = 2 * Math.pow(Math.sqrt(d0) + Math.sqrt(d1), 2) / (T * T), t1 = Math.sqrt(2 * d0 / g);
    this.flyNotes.push({ x: x0, y: y0, _px: x0, _py: y0, rot: 0, _prot: 0, color: color, t: 0, T: T, toSlot: i, x0: x0, y0: y0,
      vx: (s.x - x0) / T, vy: -g * t1, g: g, spin: (s.x >= x0 ? 1 : -1) * cfg.noteSpin, item: item, pitch: pitch, memberId: memberId });
  };
  P._landNote = function (F) {
    var i = this.flyNotes.indexOf(F);
    if (i >= 0) this.flyNotes.splice(i, 1);
    var s = this.slotOf(F.toSlot);
    if (!s) return;
    this.sheet.notes[F.toSlot] = { color: F.color, item: F.item, pitch: F.pitch, memberId: F.memberId, pop: 1 };
    this._emit({ type: 'note', i: F.toSlot, n: this.sheet.n, color: F.color, pitch: F.pitch, x: s.x, y: s.y });
    // surprises start after the 1st (snail) / 2nd (shower) note
    if (this.surprise === 'snail' && F.toSlot === 0 && !this.snail && !this._snailDone) this._snailIn();
    if (this.surprise === 'shower' && F.toSlot === 1 && !this._shower) this._showerStart();
  };
  P._stepNotes = function (h) {
    for (var i = this.flyNotes.length - 1; i >= 0; i--) {
      var F = this.flyNotes[i];
      F.t += h;
      var t = Math.min(F.t, F.T);
      F.x = F.x0 + F.vx * t; F.y = F.y0 + F.vy * t + 0.5 * F.g * t * t; F.rot = F.spin * t * (1 - t / F.T) ;
      if (F.t >= F.T) this._landNote(F);
    }
    var N = this.sheet.notes, d = h / this.cfg.popTime;
    for (var j = 0; j < N.length; j++) if (N[j] && N[j].pop > 0) N[j].pop = Math.max(0, N[j].pop - d);
  };

  // ---------------------------------------------------------------- help
  P.resetNudges = function () {
    this._idleT = 0; this._idleGap = this.cfg.idleTime; this._idleN = 0;
    this._talkAskT = 0; this._talkAsks = 0;
    if (this.talk) this.talk.glowAnswer = false;
  };
  P._autoHint = function (fromIdle) {
    if (this.time - this._lastHintT < this.cfg.hintCooldown) return null;
    return this._doHint(!!fromIdle);
  };
  P._hintTarget = function () {
    var a = this._askObj();
    if (!a) return null;
    if (a.mode === 'drum') return 'bigDrum';
    var m = this._rightMember();
    return m ? m.id : null;
  };
  P._hintGeo = function () {
    var H = this.hintHand, S = this.layout.S;
    if (H.target === 'bigDrum') { var D = this.bigDrum; H.bx = D.x + 0.15 * D.r; H.by = D.y - 0.35 * D.r; return; }
    var m = this.memberById(H.target);
    if (!m) { this.hintHand = null; return; }
    H.bx = m.homeX + 0.12 * S; H.by = m.homeY + 0.08 * S;
  };
  P._doHint = function (fromIdle) {
    var tg = this._hintTarget();
    if (!tg) return null;
    var cfg = this.cfg;
    if (tg === 'bigDrum') { this.bigDrum._glowT = cfg.hintTime; this._drumHinted = true; }
    else { var m = this.memberById(tg); m._glowT = cfg.hintTime; m.hinted = true; }
    this._lastHintT = this.time;
    this._mood('think');
    this.hintHand = { target: tg, x: 0, y: 0, bx: 0, by: 0, t: 0, alpha: 0, time: 0, T: cfg.hintTime };
    this._hintGeo();
    this.hintHand.x = this.hintHand.bx; this.hintHand.y = this.hintHand.by;
    var ev = { type: 'hint', memberId: tg === 'bigDrum' ? null : tg, target: tg, x: this.hintHand.bx, y: this.hintHand.by };
    if (fromIdle) ev.idle = true;
    this._emit(ev);
    return tg;
  };
  /** Manual hint (tap on the bubble): the right member (or the big drum) glows + the ghost hand. */
  P.hint = function () {
    if (this.state !== 'round' || this.phase !== 'ask') return null;
    var tg = this._hintTarget();
    if (!tg) return null;
    if (this.hintHand && this.hintHand.target === tg) return tg;
    return this._doHint(false);
  };
  /** Ghost hand: taps the target every hintTap s (press down 8 px at the middle of each cycle), fades in / out. */
  P._stepHint = function (h) {
    var H = this.hintHand;
    if (!H) return;
    H.time += h;
    if (H.time >= H.T || (this.phase !== 'ask' && this.phase !== 'beats')) { this.hintHand = null; return; }
    this._hintGeo();
    if (!this.hintHand) return;
    var u = (H.time % this.cfg.hintTap) / this.cfg.hintTap;
    H.t = u;
    var press = Math.sin(Math.PI * clamp((u - 0.35) / 0.3, 0, 1));
    H.x = H.bx; H.y = H.by - 14 * (1 - press) + 4 * press;
    H.alpha = clamp(H.time / 0.25, 0, 1) * clamp((H.T - H.time) / 0.35, 0, 1);
  };

  // ---------------------------------------------------------------- song / clear
  P._advance = function () {
    if (this.ask + 1 < this.cur.n) { this.ask++; this._startAsk(); }
    else this._startSong();
  };
  P._startSong = function () {
    var S = this.layout.sheet;
    this._setPhase('song');
    this.hintHand = null;
    if (this.countCard) this.countCard.vis = false;
    this._song = { i: 0, nextAt: this.time + this.cfg.songLead, endAt: -1, doneAt: -1 };
    this.songs++;
    this._mood('happy', 1.2);
    this._emit({ type: 'songStart', n: this.sheet.n, x: (S.x0 + S.x1) / 2, y: S.y });
  };
  P._stepSong = function () {
    var G = this._song, cfg = this.cfg, n = this.sheet.n;
    while (G.i < n && this.time >= G.nextAt - 1e-9) {
      var i = G.i++, N = this.sheet.notes[i], s = this.slotOf(i), m = N && N.memberId ? this.memberById(N.memberId) : null;
      G.nextAt += cfg.songGap;
      if (N) N.pop = 1;
      var D = this.bigDrum, mx, my;
      if (m) { this._memberPlays(m); mx = m.homeX; my = m.homeY; }
      else { this._drumHit(cfg.drumSquash); mx = D.x; my = D.y; }
      this._mood(i % 2 ? 'drum_up' : 'drum', cfg.songGap + 0.05);
      this.members.forEach(function (q) { if (q !== m) q.qv += 0.35 * kickFor(0.06, cfg.squashOmega, cfg.squashZeta); });   // the band bobs along
      this._emit({ type: 'songNote', i: i, n: n, memberId: m ? m.id : null, pitch: N ? N.pitch : 60, color: N ? N.color : null,
        x: s.x, y: s.y, mx: mx, my: my });
      if (this.snail && i % 2 === 1 && this.snail.state !== 'out') { this.snail.ring = 1; this._emit({ type: 'snailRing', x: this.snail.x, y: this.snail.y - 40 }); }
      if (G.i >= n) G.endAt = this.time + cfg.songTail;
    }
    var Sh = this.layout.sheet;
    if (G.endAt > 0 && this.time >= G.endAt) {
      G.endAt = -1; G.doneAt = this.time + cfg.songHold;
      this._mood('cheer', 2);
      if (this.snail) this._snailLeave();
      this._emit({ type: 'songEnd', n: n, x: (Sh.x0 + Sh.x1) / 2, y: Sh.y });
    }
    if (G.doneAt > 0 && this.time >= G.doneAt) {
      var st = this._starsFor(this.misses);
      this.roundStars = st; this.stars += st; this.levelStars += st;
      this._emit({ type: 'roundDone', round: this.round, stars: st, misses: this.misses, x: (Sh.x0 + Sh.x1) / 2, y: Sh.y });
      this._startClear();
    }
  };
  /** 3 / 2 / 1 stars for 0 / 1 / ≥ 2 misses. */
  P._starsFor = function (m) { return m <= 0 ? 3 : m === 1 ? 2 : 1; };
  P._startClear = function () {
    var cfg = this.cfg, k = this.members.length;
    this._setState('roundDone'); this.phase = 'clear'; this.phaseTime = 0;
    this._unpress(); this._press = null;
    this.members.forEach(function (m, j) { m._outAt = (k - 1 - j) * cfg.outStagger; });   // the rightmost hops off first
    this._clearN = 0;
    if (this.snail && this.snail.state !== 'out') this._snailLeave();
    this._mood('happy', 1.0);
  };
  P._stepClear = function () {
    var cfg = this.cfg, L = this.layout, t = this.phaseTime, self = this;
    this.members.forEach(function (m) {
      if (m.state === 'rest' && m._outAt !== undefined && t >= m._outAt) {
        m.state = 'out'; m.t = 0; m.hops = [];
        self._hop(m, L.W + L.S, m.homeY, cfg.outApex, cfg.outG);
      }
    });
    while (this._clearN < this.sheet.n && t >= this._clearN * cfg.clearNoteGap) {
      var i = this._clearN++, s = this.slotOf(i), N = this.sheet.notes[i];
      this.sheet.notes[i] = null;
      this._emit({ type: 'clearNote', i: i, color: N ? N.color : null, x: s.x, y: s.y });
    }
    if (t >= cfg.clearTime && !this.members.some(function (m) { return m.state !== 'gone'; }) && !this.flyNotes.length) this._nextRound();
  };
  P._nextRound = function () {
    var cfg = this.cfg;
    this._clearRound();
    this.round++;
    var el = this.time - this.levelStartTime;
    var long = this.round >= cfg.chapterMinRounds && el > cfg.chapterTimeLimit;
    if (this.round < this.roundsPerLevel && !long) this._beginRound();
    else { if (this.round < this.roundsPerLevel) this.roundsPerLevel = this.round; this._startTalk(); }   // a cut chapter: the HUD dots fill
  };

  // ---------------------------------------------------------------- surprises
  P._snailGeo = function (snap) {
    var S = this.snail, L = this.layout;
    S.y = L.groundY - 2;
    S.restX = L.stage.x1 - this.cfg.snailDx;
    S.fromX = L.W + this.cfg.snailFrom;
    if (snap) {
      if (S.state === 'rest' || S.state === 'ring') S.x = S.restX;
      else if (S.state === 'in') S.x = lerp(S.fromX, S.restX, smooth(S.t / this.cfg.snailIn));
      else S.x = lerp(S.ox === undefined ? S.restX : S.ox, S.fromX, clamp(S.t / this.cfg.snailOut, 0, 1));
      S._px = S.x; S._py = S.y;
    }
  };
  P._snailIn = function () {
    this._snailDone = true;
    this.snail = { x: 0, y: 0, _px: 0, _py: 0, t: 0, t2: 0, state: 'in', sx: 1, ring: 0, size: this.cfg.snailSize, flip: -1 };
    this._snailGeo(false);
    var S = this.snail; S.x = S._px = S.fromX; S._py = S.y;
    this._emit({ type: 'snail', x: S.restX, y: S.y - 40 });
  };
  P._snailLeave = function () { var S = this.snail; if (!S || S.state === 'out') return; S.state = 'out'; S.t = 0; S.ox = S.x; S.flip = 1; };
  P._stepSnail = function (h) {
    var S = this.snail, cfg = this.cfg;
    if (!S) return;
    S._px = S.x; S._py = S.y;
    S.t += h;
    if (S.ring > 0) S.ring = Math.max(0, S.ring - h / cfg.snailRing);
    var crawl = 0.5 + 0.5 * Math.sin(TAU * 1.1 * S.t);   // a snail moves in little stretch-pulses
    switch (S.state) {
      case 'in':
        S.x = lerp(S.fromX, S.restX, smooth(S.t / cfg.snailIn));
        S.sx = 1 + 0.08 * crawl;
        if (S.t >= cfg.snailIn) { S.state = 'rest'; S.x = S.restX; }
        break;
      case 'ring':
        S.t2 += h; if (S.t2 >= cfg.snailRing) S.state = 'rest';
        S.sx = 1;
        break;
      case 'rest': S.sx = 1 + 0.02 * Math.sin(TAU * 0.5 * this.time); break;
      case 'out': {
        var u = clamp(S.t / cfg.snailOut, 0, 1);
        S.x = lerp(S.ox, S.fromX, u * u);
        S.sx = 1 + 0.08 * crawl;
        if (u >= 1) this.snail = null;
        break;
      }
    }
  };
  P._showerStart = function () {
    var cfg = this.cfg, k = this.members.length, order = [];
    for (var i = 0; i < cfg.raindrops; i++) order.push(k ? i % k : -1);
    this._crng.shuffle(order);
    this._shower = { t: 0, drops: order.map(function (j, n) { return { at: cfg.raindropAt + n * cfg.raindropGap, j: j, done: false }; }) };
    this._mood('umbrella', cfg.umbrellaTime);
    var L = this.layout;
    this._emit({ type: 'shower', dur: cfg.showerTime, x: (L.stage.x0 + L.stage.x1) / 2, y: L.sheet.y });
  };
  P._stepShower = function (h) {
    var W = this._shower, cfg = this.cfg;
    if (!W) { this.shower = Math.max(0, this.shower - h / cfg.showerDown); return; }
    W.t += h;
    var t = W.t, T = cfg.showerTime;
    this.shower = t < cfg.showerUp ? t / cfg.showerUp : t < T ? 1 : Math.max(0, 1 - (t - T) / cfg.showerDown);
    this.wind = 0.4 * this.shower;
    for (var i = 0; i < W.drops.length; i++) {
      var d = W.drops[i];
      if (d.done || t < d.at) continue;
      d.done = true;
      var m = this.members[d.j];
      if (!m || m.state === 'gone' || m.state === 'out') continue;
      m.qv += kickFor(0.05, cfg.squashOmega, cfg.squashZeta); m.hit = Math.max(m.hit, 0.4);
      this._emit({ type: 'raindrop', memberId: m.id, pitch: m.item.pitch + 12, x: m.homeX, y: m.homeY - 0.45 * this.layout.S });
    }
    if (t >= T + cfg.showerDown) { this._shower = null; this.shower = 0; this.wind = 0; this._emit({ type: 'showerEnd' }); }
  };

  // ---------------------------------------------------------------- member motion
  /** Ballistic hop (gravity g) from the member's position to (x1, y1), apex `apex` px over the higher end. */
  P._hop = function (m, x1, y1, apex, g) {
    var y0 = m.homeY, apexY = Math.min(y0, y1) - apex;   // hops start and end at stool height
    var t1 = Math.sqrt(2 * (y0 - apexY) / g), t2 = Math.sqrt(2 * (y1 - apexY) / g);
    m.arc = { x0: m.x, y0: y0, x1: x1, y1: y1, t1: t1, T: t1 + t2, t: 0, g: g };
  };
  P._stepMember = function (m, h) {
    var cfg = this.cfg, S = this.layout.S, bx = m.homeX, hy = 0, br = 1, sway = 0, A;
    m.t += h;
    switch (m.state) {
      case 'wait': bx = m.x; break;
      case 'in':
        if (m.t < m.delay) { bx = m.x; break; }
        if (!m.arc) {
          if (m.wait > 0) { m.wait -= h; bx = m.x; break; }
          var nx = m.hops.shift();
          if (!nx) { m.state = 'rest'; m.x = m.homeX; break; }
          this._hop(m, nx.x, nx.y, cfg.hopApex, cfg.hopG);
        }
        A = m.arc; A.t += h;
        var tt = Math.min(A.t, A.T);
        bx = m.x = A.x0 + (A.x1 - A.x0) * tt / A.T;
        hy = (A.y0 - A.g * A.t1 * tt + 0.5 * A.g * tt * tt) - A.y0;   // ≤ 0: height above the stool
        if (A.t >= A.T) {
          m.arc = null; m.x = bx = A.x1; hy = 0;
          this._squash(m, cfg.landSquash);
          if (m.hops.length) m.wait = cfg.hopPause; else { m.state = 'rest'; m.t = 0; }
        }
        break;
      case 'rest': {
        sway = cfg.swayAmp * Math.sin(TAU * cfg.swayHz * this.time + m.ph);
        br = 1 + cfg.breatheAmp * Math.sin(TAU * cfg.breatheHz * this.time + m.ph * 1.3);
        hy = -m.glow * cfg.glowBounce * Math.max(0, Math.sin(TAU * 1.6 * this.time));
        m.x = bx;
        break;
      }
      case 'out':
        A = m.arc;
        if (A) {
          A.t += h;
          var to = Math.min(A.t, A.T);
          bx = m.x = A.x0 + (A.x1 - A.x0) * to / A.T;
          hy = (A.y0 - A.g * A.t1 * to + 0.5 * A.g * to * to) - A.y0;
          if (A.t >= A.T) m.state = 'gone';
        } else bx = m.x;
        break;
      case 'gone': bx = m.x; break;
    }
    // squash spring (press target while a finger rests on it) and the wobble spring
    var qT = m.pressed ? cfg.pressSquash : 0, w = cfg.squashOmega, z = cfg.squashZeta;
    m.qv += (w * w * (qT - m.q) - 2 * z * w * m.qv) * h; m.q += m.qv * h;
    var wo = cfg.wobOmega, wz = cfg.wobZeta;
    m.wv += (-wo * wo * m.wob - 2 * wz * wo * m.wv) * h; m.wob += m.wv * h;
    var wig = m.glow * cfg.wiggleAmp * Math.sin(TAU * cfg.wiggleHz * this.time);
    m.sy = (1 - m.q) * br; m.sx = (1 + cfg.sxPerQ * m.q) * br;
    m.rot = sway + m.wob + wig;
    m.x = bx;
    m.y = m.homeY + S / 2 * (1 - m.sy) + hy;
    // timers: hit ripple, singing, hint glow
    if (m.hit > 0) m.hit = Math.max(0, m.hit - h / cfg.hitTime);
    if (m._singT > 0) { m._singT -= h; m.sing = 1; } else m.sing = Math.max(0, m.sing - h / 0.1);
    if (m._glowT > 0) m._glowT = Math.max(0, m._glowT - h);
    var gT = m._glowT > 0 ? 1 : 0;
    m.glow += (gT - m.glow) * Math.min(1, h * (gT ? 6 : 3));
  };
  P._stepBigDrum = function (h) {
    var D = this.bigDrum, cfg = this.cfg, w = cfg.squashOmega, z = cfg.squashZeta;
    D.qv += (-w * w * D.q - 2 * z * w * D.qv) * h; D.q += D.qv * h;
    D.sy = 1 - D.q; D.sx = 1 + 0.5 * D.q;
    if (D.hit > 0) D.hit = Math.max(0, D.hit - h / cfg.drumHitTime);
    if (D._glowT > 0) D._glowT = Math.max(0, D._glowT - h);
    var gT = D._glowT > 0 ? 1 : 0;
    D.glow += (gT - D.glow) * Math.min(1, h * (gT ? 6 : 3));
    var C = this.countCard;
    if (C) { var tg = C.vis ? 1 : 0; C.show = tg > C.show ? Math.min(1, C.show + h * cfg.countCardRate) : Math.max(0, C.show - h * cfg.countCardRate); }
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

  P._step = function (h) {
    var cfg = this.cfg, i;
    for (i = 0; i < this.members.length; i++) { var m = this.members[i]; m._px = m.x; m._py = m.y; m._prot = m.rot; }
    for (i = 0; i < this.flyNotes.length; i++) { var F = this.flyNotes[i]; F._px = F.x; F._py = F.y; F._prot = F.rot; }
    this.time += h; this.stateTime += h; this.phaseTime += h;

    switch (this.state) {
      case 'intro': if (this.stateTime >= cfg.introTime) this._beginRound(); break;
      case 'round': this._stepRound(h); break;
      case 'roundDone': this._stepClear(h); break;
      case 'talk':
        if (this.talkAnswered) { if (this.stateTime >= cfg.talkAfterAnswer) this._levelDone(); break; }
        this._talkAskT += h;
        if (this._talkAskT >= cfg.talkAskTime - 1e-9) {
          this._talkAskT = 0; this._talkAsks++;
          if (this._talkAsks >= cfg.talkGlowAfterAsks) this.talk.glowAnswer = true;
          this._emit({ type: 'talkAsk', talk: this.talk, n: this._talkAsks, glowAnswer: this.talk.glowAnswer });
        }
        break;
      case 'levelDone':
        if (this.stateTime >= cfg.levelDoneTime) {
          if (this.level < this.levels.length - 1) this.startLevel(this.level + 1);
          else {
            this._setState('sessionDone'); this.phase = null;
            this.lastTopics = this.levels.slice();
            this._emit({ type: 'sessionDone', stars: this.stars, songs: this.songs });
          }
        }
        break;
    }
    for (i = 0; i < this.members.length; i++) this._stepMember(this.members[i], h);
    this.members = this.members.filter(function (q) { return q.state !== 'gone'; });
    this._stepNotes(h);
    this._stepBigDrum(h);
    this._stepSnail(h);
    this._stepShower(h);
    this._stepHint(h);
    this._stepBop(h);
  };

  P._stepRound = function (h) {
    var cfg = this.cfg;
    switch (this.phase) {
      case 'deal': {
        if (this._dealAt > 0 && this.time >= this._dealAt) { this._dealAt = -1; this._deal(); this._settleT = 0; }
        if (this._dealAt < 0) {
          var all = this.members.every(function (m) { return m.state === 'rest'; });
          if (all) { this._settleT += h; if (this._settleT >= cfg.dealSettle) { this.ask = 0; this._startAsk(); } }
        }
        break;
      }
      case 'beats': this._stepBeats(); break;
      case 'ask': {
        this._idleT += h;
        if (this._idleT >= this._idleGap - 1e-9) {
          this._idleT = 0;
          this._idleGap = Math.min(cfg.idleMax, this._idleGap * cfg.idleBackoff);
          this._idleN++;
          this._mood('think');
          var q = this._askObj(), tg = this._hintTarget(), m = tg && tg !== 'bigDrum' ? this.memberById(tg) : null;
          this._emit({ type: 'idle', n: this._idleN, promptKey: q.promptKey, params: q.params, mode: q.mode,
            x: m ? m.homeX : this.bigDrum.x, y: m ? m.homeY : this.bigDrum.y });
          if (this._idleN >= cfg.idleHintFrom) this._autoHint(true);
        }
        break;
      }
      case 'play':
        if (this.phaseTime >= cfg.playTime && !this.flyNotes.length) this._advance();
        break;
      case 'song': this._stepSong(); break;
    }
  };

  P._stepBop = function (h) {
    var b = this.bop, cfg = this.cfg, L = this.layout;
    b.x = L.bop.x; b.y = L.bop.y; b.h = L.bop.h;
    if (b.moodT > 0) { b.moodT -= h; if (b.moodT <= 0) { b.moodT = 0; b.mood = b.mood === 'drum' && this.phase !== 'song' ? 'drum_up' : 'idle'; if (b.mood === 'drum_up') b.moodT = cfg.moodTime.drum_up; } }
    b.blinkT -= h;
    if (b.blink && b.blinkT <= 0) { b.blink = false; b.blinkT = this._crng.float(cfg.blink[0], cfg.blink[1]); }
    else if (!b.blink && b.blinkT <= 0) { b.blink = true; b.blinkT = cfg.blinkTime; }
    // look: a flying note, the snail, the hinted target, else the middle of the band
    var tx = L.slots.length ? L.slots[Math.floor(L.slots.length / 2)].x : L.W / 2, ty = L.stage.y - L.S;
    if (this.flyNotes.length) { tx = this.flyNotes[0].x; ty = this.flyNotes[0].y; }
    else if (this.hintHand) { tx = this.hintHand.x; ty = this.hintHand.y; }
    else if (this.snail) { tx = this.snail.x; ty = this.snail.y; }
    b.lookX += (tx - b.lookX) * Math.min(1, h * cfg.lookRate);
    b.lookY += (ty - b.lookY) * Math.min(1, h * cfg.lookRate);
    b.look = clamp((b.lookX - b.x) / 500, -1, 1);
  };

  RB.World = World;
})(window.RB = window.RB || {});
