// Dee's Forest Memory — headless playtest harness (report-only; never edits game code).
//   const L = require('./lib'); const m = L.runSession({ age, lang, vp, driver: 'typical', seed, config });
// Loads rng/content/world/bot into a node vm (same pattern as tests/unit/load.js), drives ONLY the public input API
// (pointerDown/Up, talkAnswer, hint) and measures round / chapter / session times, mismatches, hints, idles, stars,
// stuck rounds, NaN, rewards off-screen / on the bubble, HUD, Dee or the cards, smallest card.
// (Field names kept from the balloon harness: wrong = mismatches, offscreen = bad reward placements, homesSeen = reward
//  checks, packShrinkMin = smallest card width in px, packFail = grids below the age's minimum card size.)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', '..', 'game', 'js');
const FILES = ['rng.js', 'content.js', 'world.js', 'bot.js'];
function loadKB() {
  const sandbox = { console, Math, Date, JSON };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), sandbox, { filename: f });
  return sandbox.DM;
}
const DM = loadKB();

// Logical viewports (short side 720) with safe-area insets converted from CSS px (main.js computeView).
const VIEWPORTS = {
  iphoneP: { W: 720, H: 1556, ins: { top: 108, right: 0, bottom: 62, left: 0 } },    // 393×852 css, 59/34 css insets
  iphoneL: { W: 1556, H: 720, ins: { top: 0, right: 108, bottom: 38, left: 108 } },  // 852×393 css, 59/21 css insets
  ipadL:   { W: 960, H: 720, ins: { top: 32, right: 0, bottom: 27, left: 0 } },      // 24/20 css insets at s = 0.75
  ipadP:   { W: 720, H: 960, ins: { top: 32, right: 0, bottom: 27, left: 0 } }
};

const TAU = Math.PI * 2;
const hyp = (x, y) => Math.sqrt(x * x + y * y);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ---------------------------------------------------------------- child models (memory)
 * A child watches the peek and its own flips and remembers a face with p = peekRecall (peek) / flipRecall (flips);
 * memories fade with an exponential lifetime tau (s). It plays a remembered pair, else the remembered partner of the
 * card it just turned, else a card it has not seen — but with p = pRandom it just taps any face-down card.
 * Rhythm: after "now they hide" it starts after `listen` s, waits `reaction` s between turns and `afterFlip` s after its
 * own flip (hears Dee say the name); while a mismatch shows it waits with p = patience, else it taps a new card (the
 * third-tap fast reset). Gets distracted (looks away) with p = pDistract per round. Aims inside `aim` × the card half-size.
 * Talk: answers after talkDelay s, right with p = talkRight. */
const KID_PROFILES = {
  // a slow, dreamy 3-year-old
  slow3: { peekRecall: 0.15, flipRecall: 0.4, tau: 20, pRandom: 0.3, listen: [2.5, 4], reaction: [2.5, 4.5], afterFlip: [1.0, 1.6],
    patience: 0.9, pDistract: 0.3, followHint: 0.8, distract: [5, 15], aim: 0.9, speed: [250, 450], talkDelay: [3, 8], talkRight: 0.55 },
  // a quick but impulsive 3-year-old (often taps on before a mismatch flips back)
  toddler: { peekRecall: 0.2, flipRecall: 0.45, tau: 20, pRandom: 0.35, listen: [1.5, 2.5], reaction: [1.0, 2.0], afterFlip: [0.2, 0.6],
    patience: 0.3, pDistract: 0.15, followHint: 0.8, distract: [3, 8], aim: 1.0, speed: [350, 600], talkDelay: [2, 5], talkRight: 0.6 },
  // a careful 4-year-old with a weak memory: always waits, but forgets a lot
  careful4: { peekRecall: 0.2, flipRecall: 0.45, tau: 25, pRandom: 0.15, listen: [2, 3], reaction: [1.6, 3.0], afterFlip: [0.8, 1.4],
    patience: 1.0, pDistract: 0.1, followHint: 0.8, distract: [4, 10], aim: 0.7, speed: [350, 550], talkDelay: [3, 6], talkRight: 0.75 },
  typical: null    // per age, see typicalProfile()
};
function typicalProfile(age) {
  const k = clamp((age - 3) / 4, 0, 1);
  return { peekRecall: 0.3 + 0.3 * k, flipRecall: 0.55 + 0.3 * k, tau: 30 + 60 * k, pRandom: 0.2 - 0.15 * k,
    listen: [1.8 - 0.6 * k, 2.8 - 0.8 * k], reaction: [1.3 - 0.5 * k, 2.6 - 1.1 * k], afterFlip: [0.6, 1.1 - 0.3 * k],
    patience: 0.85, pDistract: 0.15 - 0.08 * k, followHint: 0.8, distract: [4, 10], aim: 0.75, speed: [400 + 300 * k, 650 + 350 * k],
    talkDelay: [3 - k, 5.5 - 1.5 * k], talkRight: 0.7 + 0.25 * k };
}

class Kid {
  constructor(w, prof, seed) {
    this.w = w; this.p = prof; this.r = new DM.RNG(seed); this.f = { x: w.layout.W / 2, y: w.layout.H / 2, down: false };
    this.phase = 'wait'; this.t = 0; this.talkT = -1; this.roundKey = ''; this.mem = {}; this.vis = {}; this.target = null;
    this.stats = { taps: 0, misses: 0, third: 0 };
  }
  rf(a) { return this.r.float(a[0], a[1]); }
  observe() {
    const w = this.w, p = this.p;
    for (const c of w.cards) {
      if (c.state === 'gone') { delete this.mem[c.id]; continue; }
      const vis = c.flip > 0.9 || (c.flip > 0.7 && c.peekT >= 0);
      if (vis && !this.vis[c.id] && this.r.chance(w.phase === 'peek' ? p.peekRecall : p.flipRecall)) this.mem[c.id] = { key: c.key, t: w.time };
      this.vis[c.id] = vis;
    }
  }
  recall() {   // exponential forgetting since the last look at the memory
    const now = this.w.time;
    for (const id in this.mem) { const m = this.mem[id]; if (!this.r.chance(Math.exp(-(now - m.t) / this.p.tau))) delete this.mem[id]; else m.t = now; }
  }
  choose() {
    const w = this.w, down = w.cards.filter(c => c.state === 'down'), mem = this.mem;
    if (!down.length) return null;
    const glow = down.filter(c => c.glow > 0.3);   // a hint glows: most children tap it
    if (glow.length && this.r.chance(this.p.followHint)) return glow[0];
    if (this.r.chance(this.p.pRandom)) return this.r.pick(down);
    this.recall();
    const unknown = down.filter(c => !mem[c.id]);
    const openIds = w._mis ? [] : w.open;
    if (openIds.length === 1) {
      const up = w.cardById(openIds[0]), pt = down.find(c => mem[c.id] && mem[c.id].key === up.key);
      if (pt) return pt;
      return this.r.pick(unknown.length ? unknown : down);
    }
    const byKey = {};
    for (const c of down) if (mem[c.id]) (byKey[mem[c.id].key] = byKey[mem[c.id].key] || []).push(c);
    for (const k in byKey) if (byKey[k].length >= 2) return byKey[k][0];
    return this.r.pick(unknown.length ? unknown : down);
  }
  step(dt) {
    const w = this.w, r = this.r, p = this.p;
    if (w.state === 'talk') {
      if (w.talkAnswered) return;
      if (this.talkT < 0) this.talkT = this.rf(p.talkDelay);
      this.talkT -= dt;
      if (this.talkT <= 0) {
        this.talkT = -1; const t = w.talk; let pick = t.answerId;
        if (!r.chance(p.talkRight)) { const wr = t.choices.filter(c => c.id !== t.answerId); if (wr.length) pick = r.pick(wr).id; }
        w.talkAnswer(pick);
      }
      return;
    }
    this.talkT = -1;
    if (w.state !== 'round') { this.phase = 'wait'; this.roundKey = ''; return; }
    const rk = w.level + ':' + w.round + ':' + w.cur.seed;
    if (rk !== this.roundKey) { this.roundKey = rk; this.mem = {}; this.vis = {}; this.phase = 'wait'; this.t = -1; this.distracted = r.chance(p.pDistract); }
    this.observe();
    if (w.phase !== 'play' && w.phase !== 'resolve') return;
    if (this.t < 0) { this.t = this.rf(p.listen) + (this.distracted ? this.rf(p.distract) : 0); }
    switch (this.phase) {
      case 'wait': {
        const misShowing = !!w._mis, pending = w.open.length === 2 && !w._mis;
        this.t -= dt;                                                        // (keeps thinking while Dee talks / cards turn)
        if (pending || (w.phase === 'resolve' && !misShowing)) return;     // a pair is being checked / was just found
        if (misShowing) { if (this.patientNow === undefined) this.patientNow = r.chance(p.patience); if (this.patientNow) return; }
        else this.patientNow = undefined;
        if (this.t > 0) return;
        const c = this.choose();
        if (!c) { this.t = 0.2; return; }
        if (misShowing) this.stats.third++;
        const a = r.float(0, Math.PI * 2), rr = Math.sqrt(r.next()) * p.aim;
        this.target = c; this.ox = Math.cos(a) * rr * c.w / 2; this.oy = Math.sin(a) * rr * c.h / 2;
        const d = hyp(c.x - this.f.x, c.y - this.f.y); this.T = Math.max(0.15, d / this.rf(p.speed)); this.tt = 0;
        this.x0 = this.f.x; this.y0 = this.f.y; this.phase = 'reach';
        return;
      }
      case 'reach': {
        const c = this.target;
        this.tt += dt; const u = Math.min(1, this.tt / this.T), s = u * u * (3 - 2 * u);
        this.f.x = this.x0 + (c.x + this.ox - this.x0) * s; this.f.y = this.y0 + (c.y + this.oy - this.y0) * s;
        if (u >= 1) {
          this.stats.taps++;
          const n0 = w.events.length;
          if (!w.pointerDown(this.f.x, this.f.y)) this.stats.misses++;
          w.pointerUp(this.f.x, this.f.y);
          const flipped = w.events.slice(n0).some(e => e.type === 'flip');
          this.phase = 'wait'; this.patientNow = undefined;
          this.t = flipped && w.open.length === 1 ? this.rf(p.afterFlip) : this.rf(p.reaction);
        }
        return;
      }
    }
  }
}

/* random tapper: taps a random card (60 %) or a random spot (40 %) every 0.3–1.5 s, no understanding */
class Tapper {
  constructor(w, seed) { this.w = w; this.r = new DM.RNG(seed); this.t = 1; this.stats = { taps: 0 }; }
  step(dt) {
    const w = this.w, r = this.r, L = w.layout;
    this.t -= dt; if (this.t > 0) return; this.t = r.float(0.3, 1.5);
    if (w.state === 'talk') { if (!w.talkAnswered) w.talkAnswer(r.pick(w.talk.choices).id); return; }
    if (w.state !== 'round') return;
    const live = w.cards.filter(c => c.state === 'down' || c.state === 'up');
    let x, y;
    if (live.length && r.chance(0.6)) { const b = r.pick(live); x = b.x + r.float(-20, 20); y = b.y + r.float(-20, 20); }
    else { x = r.float(L.ins.left, L.W - L.ins.right); y = r.float(L.ins.top, L.H - L.ins.bottom); }
    this.stats.taps++; w.pointerDown(x, y); w.pointerUp(x, y);
  }
}

/* spammer: hammers the screen every 0.05–0.2 s (cards, matched ones, empty space), double-answers Talk */
class Spammer {
  constructor(w, seed) { this.w = w; this.r = new DM.RNG(seed); this.t = 0.1; this.stats = { taps: 0 }; }
  step(dt) {
    const w = this.w, r = this.r, L = w.layout;
    if (w.state === 'talk') { if (!w.talkAnswered) { w.talkAnswer(r.pick(w.talk.choices).id); w.talkAnswer(r.pick(w.talk.choices).id); } return; }
    this.t -= dt; if (this.t > 0) return; this.t = r.float(0.05, 0.2);
    const o = w.cards.length ? r.pick(w.cards) : null, roll = r.next();
    const x = o && roll < 0.8 ? o.x + r.float(-15, 15) : r.float(0, L.W), y = o && roll < 0.8 ? o.y + r.float(-15, 15) : r.float(0, L.H);
    this.stats.taps++; w.pointerDown(x, y); if (r.chance(0.7)) w.pointerUp(x, y);
    if (r.chance(0.02)) w.hint();
  }
}

/* absent child: never touches anything (measures idle nudges / Talk re-asks over time) */
class Absent { constructor() { this.stats = {}; } step() {} }

class BotDriver { constructor(w, skill, seed) { this.b = new DM.Bot(w, { skill, seed }); this.stats = this.b.stats; } step(dt) { this.b.step(dt); } }

function makeDriver(name, w, age, seed) {
  if (name.startsWith('bot')) return new BotDriver(w, +name.slice(3), seed);
  if (name === 'tapper') return new Tapper(w, seed);
  if (name === 'spammer') return new Spammer(w, seed);
  if (name === 'absent') return new Absent();
  const prof = name === 'typical' ? typicalProfile(age) : KID_PROFILES[name];
  if (!prof) throw new Error('unknown driver ' + name);
  return new Kid(w, prof, seed);
}

/* ---------------------------------------------------------------- session runner */
function rewardBox(r) {
  const s = r.size;
  if (r.kind === 'animal') return { x: r.x - s / 2, y: r.y - s, w: s, h: s };
  if (r.kind === 'acorns' && r.pieces) { const xs = r.pieces.map(p => p.x), ys = r.pieces.map(p => p.y), R = r.pieceSize / 2;
    return { x: Math.min(...xs) - R, y: Math.min(...ys) - R, w: Math.max(...xs) - Math.min(...xs) + 2 * R, h: Math.max(...ys) - Math.min(...ys) + 2 * R }; }
  return { x: r.x - s / 2, y: r.y - s / 2, w: s, h: s };
}
const ovl = (a, b) => a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6;

function runSession(o) {
  const age = o.age, lang = o.lang || 'en', vp = VIEWPORTS[o.vp || 'ipadL'], seed = o.seed || 1, dt = o.dt || 1 / 30;
  const maxTime = o.maxTime || 1800, roundCap = o.roundCap || 180;
  const w = new DM.World({ seed, age, lang, config: o.config || {} });
  w.setViewport(vp.W, vp.H, vp.ins);
  const drv = makeDriver(o.driver, w, age, seed * 7919 + 13);
  const m = {
    age, lang, vp: o.vp, driver: o.driver, seed, sessionTime: null, done: false, stars: 0,
    rounds: [], chapters: [], hints: 0, idles: 0, idleGaps: [], wrongs: 0, corrects: 0, talkAsks: 0,
    stuck: [], slow: [], invariant: [], offscreen: 0, homesSeen: 0, packShrinkMin: 1e9, packFail: 0, errors: [], content: []
  };
  let rd = null, ch = null, lastIdleT = null, t = 0;
  function checkRewards() {   // at each round start: every resting reward inside the screen, clear of bubble / HUD / Dee
    const L = w.layout, safe = { x: L.ins.left, y: L.ins.top, w: L.W - L.ins.left - L.ins.right, h: L.H - L.ins.top - L.ins.bottom };
    for (const r of w.rewards) {
      if (r.state === 'fly') continue;
      m.homesSeen++;
      const B = rewardBox(r);
      const inside = B.x >= safe.x - 1e-6 && B.y >= safe.y - 1e-6 && B.x + B.w <= safe.x + safe.w + 1e-6 && B.y + B.h <= safe.y + safe.h + 1e-6;
      if (!inside || ovl(B, L.bubble) || ovl(B, L.hud) || ovl(B, L.deeRect) || !Number.isFinite(B.x + B.y)) m.offscreen++;
    }
  }
  function checkCards() {   // when play starts: card size vs the age minimum, cards clear of the rewards
    const g = w.layout.grid; if (!g) return;
    m.packShrinkMin = Math.min(m.packShrinkMin, g.cw); if (!g.minOk) m.packFail++;
    for (const r of w.rewards) if (r.state !== 'fly' && ovl(rewardBox(r), g.rect)) m.offscreen++;
  }
  const handle = (e) => {
    switch (e.type) {
      case 'level': if (ch) ch.end = w.time; ch = { level: e.level, topic: e.topic, start: w.time, end: null, stars: 0, rounds: 0 }; m.chapters.push(ch); break;
      case 'round':
        rd = { level: w.level, round: e.round, topic: e.topic, start: w.time, interactiveAt: null, end: null,
          cards: w.cards.length, wrong: 0, hints: 0, idles: 0, stars: 0 };
        m.rounds.push(rd); lastIdleT = null; if (ch) ch.rounds++;
        if (o.keepContent) m.content.push({ l: w.level, r: e.round, topic: e.topic, pairs: e.pairs, keys: w.cards.map(c => c.key).sort().join(',') });
        break;
      case 'play': if (rd) rd.interactiveAt = w.time - rd.start; checkCards(); checkRewards(); break;
      case 'match': m.corrects++; break;
      case 'mismatch': m.wrongs++; if (rd) rd.wrong++; break;
      case 'hint': m.hints++; if (rd) rd.hints++; break;
      case 'idle': m.idles++; if (rd) rd.idles++; if (lastIdleT !== null) m.idleGaps.push(w.time - lastIdleT); lastIdleT = w.time; break;
      case 'roundDone': if (rd) { rd.end = w.time; rd.stars = e.stars; } if (ch) ch.stars += e.stars; break;
      case 'talkAsk': m.talkAsks++; break;
      case 'talkResult': if (ch && e.correct) ch.stars += 1; break;
      case 'sessionDone': m.done = true; m.sessionTime = w.time; m.stars = e.stars; if (ch) ch.end = w.time; break;
    }
  };
  try {
    w.newSession();
    for (const e of w.drainEvents()) handle(e);
    let k = 0, noMove = 0;
    while (t < maxTime && w.state !== 'sessionDone') {
      drv.step(dt); w.update(dt); t += dt;
      for (const e of w.drainEvents()) handle(e);
      if (w.state === 'round' && rd) {
        if (w.time - rd.start > roundCap && !rd.stuckFlag) { rd.stuckFlag = true; m.slow.push({ level: w.level, round: w.round, topic: w.topic }); }
        if ((++k & 7) === 0) {
          // structural stuck: playing, not solved, but no card can be turned and nothing is animating
          const live = w.cards.some(c => c.state === 'down' || c.state === 'up' || c.state === 'matched');
          if (w.phase === 'play' && !w.solved && !live) { if (++noMove > 30) m.stuck.push({ kind: 'noCard', level: w.level, round: w.round, topic: w.topic }); } else noMove = 0;
          for (const c of w.cards) if (!Number.isFinite(c.x + c.y + c.rot + c.flip + c.sx)) { m.invariant.push('NaN ' + c.id); break; }
          for (const r of w.rewards) if (!Number.isFinite(r.x + r.y + r.rot)) { m.invariant.push('NaN ' + r.id); break; }
          if (m.invariant.length > 20 || m.stuck.length > 20) break;
        }
      }
    }
  } catch (err) { m.errors.push(String(err && err.stack || err)); }
  m.endState = w.state; m.simTime = t; m.driverStats = drv.stats;
  if (m.packShrinkMin > 1e8) m.packShrinkMin = 0;
  return m;
}

/* ---------------------------------------------------------------- stats helpers */
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
function pct(a, p) { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; }
const f1 = (x) => (isFinite(x) ? x.toFixed(1) : '–');
const f0 = (x) => (isFinite(x) ? Math.round(x).toString() : '–');
const fp = (x) => (isFinite(x) ? (100 * x).toFixed(1) + '%' : '–');

module.exports = { DM, VIEWPORTS, runSession, makeDriver, KID_PROFILES, typicalProfile, mean, pct, f1, f0, fp, hyp };
