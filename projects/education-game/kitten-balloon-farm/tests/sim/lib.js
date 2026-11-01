// Kitten's Balloon Farm — headless playtest harness (report-only; never edits game code).
//   const L = require('./lib'); const m = L.runSession({ age, lang, vp, driver: 'typical', seed, config });
// Loads rng/content/world/bot into a node vm (same pattern as tests/unit/load.js), drives ONLY the public input API
// (pointerDown/Up, talkAnswer, hint) and measures round / chapter / session times, wrong taps, hints, idles, stars,
// stuck rounds, NaN, homes off-screen.
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
  return sandbox.KB;
}
const KB = loadKB();

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

/* ---------------------------------------------------------------- child models
 * A child: listens to Miu's prompt first (listen s after a round / a new ask), then taps with a reaction time,
 * moves the finger at `speed` px/s, picks the right balloon with p = pRight (else a random wrong one), aims inside
 * `aim` × the hit radius (aim > 1 → sometimes misses), gets distracted (looks away) with p = pDistract per round.
 * Talk: answers after talkDelay s, right with p = talkRight. */
const KID_PROFILES = {
  // a slow, dreamy 3-year-old
  slow3: { listen: [3, 4.5], reaction: [2.5, 4.5], afterPop: [0.4, 1], speed: [250, 450], pRight: 0.65, aim: 1.05, pDistract: 0.3, distract: [5, 15],
    talkDelay: [3, 8], talkRight: 0.55 },
  // a quick but impulsive 3-year-old
  toddler: { listen: [2, 3], reaction: [1.2, 2.5], afterPop: [0, 0.4], speed: [350, 600], pRight: 0.6, aim: 0.95, pDistract: 0.15, distract: [3, 8],
    talkDelay: [2, 5], talkRight: 0.6 },
  typical: null    // per age, see typicalProfile()
};
function typicalProfile(age) {
  const k = clamp((age - 3) / 4, 0, 1);
  // listen = Miu's prompt (en ≈ 2.0 s, vi ≈ 2.6 s at the voice rate) + ≈ 0.6–1.2 s to start; after a pop the child
  // usually hears Miu say the word ("Red!", ≈ 0.8 s) before the next tap (afterPop)
  return { listen: [2.6 - 0.6 * k, 3.8 - 0.8 * k], reaction: [1.5 - 0.6 * k, 2.8 - 1.2 * k], afterPop: [0.3, 0.8], speed: [400 + 300 * k, 650 + 350 * k],
    pRight: 0.8 + 0.15 * k, aim: 0.8, pDistract: 0.15 - 0.08 * k, distract: [4, 10], talkDelay: [3 - k, 5.5 - 1.5 * k], talkRight: 0.7 + 0.25 * k };
}

class Kid {
  constructor(w, prof, seed) {
    this.w = w; this.p = prof; this.r = new KB.RNG(seed); this.f = { x: w.layout.W / 2, y: w.layout.H / 2, down: false };
    this.phase = 'wait'; this.t = 0; this.talkT = -1; this.lastKey = ''; this.target = null; this.stats = { taps: 0, misses: 0 };
  }
  rf(a) { return this.r.float(a[0], a[1]); }
  isRight(b) { const w = this.w, m = w.cur.mode; return m === 'count' || (m === 'ask' ? b.id === w.target : b.answer); }
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
    if (w.state !== 'round') { this.phase = 'wait'; this.lastKey = ''; return; }
    // a new round or a new ask → listen to Miu first (and maybe drift off once per round)
    const key = w.level + ':' + w.round + ':' + (w.target || '');
    if (key !== this.lastKey) {
      const newRound = !this.lastKey || this.lastKey.split(':')[1] !== String(w.round);
      this.lastKey = key; this.phase = 'wait';
      this.t = this.rf(p.listen) * (newRound ? 1 : 0.6);
      if (newRound && r.chance(p.pDistract)) this.t += this.rf(p.distract);
    }
    switch (this.phase) {
      case 'wait': {
        this.t -= dt; if (this.t > 0) return;
        const live = w.balloons.filter(b => w.canTap(b));
        if (!live.length) { this.t = 0.2; return; }
        const right = live.filter(b => this.isRight(b)), wrong = live.filter(b => !this.isRight(b));
        const b = right.length && (r.chance(p.pRight) || !wrong.length) ? r.pick(right) : (wrong.length ? r.pick(wrong) : r.pick(right));
        const rad = (w.cfg.touchR * b.size + w.cfg.touchPad) * p.aim, a = r.float(0, TAU), rr = Math.sqrt(r.next()) * rad;
        this.target = b; this.ox = Math.cos(a) * rr; this.oy = Math.sin(a) * rr;
        const d = hyp(b.x - this.f.x, b.y - this.f.y); this.T = Math.max(0.15, d / this.rf(p.speed)); this.tt = 0;
        this.x0 = this.f.x; this.y0 = this.f.y; this.phase = 'reach';
        return;
      }
      case 'reach': {
        const b = this.target;
        this.tt += dt; const u = Math.min(1, this.tt / this.T), s = u * u * (3 - 2 * u);
        this.f.x = this.x0 + (b.x + this.ox - this.x0) * s; this.f.y = this.y0 + (b.y + this.oy - this.y0) * s;   // tracks the moving balloon
        if (u >= 1) {
          this.stats.taps++;
          const n0 = w.events.length;
          if (!w.pointerDown(this.f.x, this.f.y)) this.stats.misses++;
          w.pointerUp(this.f.x, this.f.y);
          const popped = w.events.slice(n0).some(e => e.type === 'correct');
          this.phase = 'wait'; this.t = this.rf(p.reaction) + (popped && p.afterPop ? this.rf(p.afterPop) : 0);
        }
        return;
      }
    }
  }
}

/* random tapper: taps a random balloon (60 %) or a random spot (40 %) every 0.3–1.5 s, no understanding */
class Tapper {
  constructor(w, seed) { this.w = w; this.r = new KB.RNG(seed); this.t = 1; this.stats = { taps: 0 }; }
  step(dt) {
    const w = this.w, r = this.r, L = w.layout;
    this.t -= dt; if (this.t > 0) return; this.t = r.float(0.3, 1.5);
    if (w.state === 'talk') { if (!w.talkAnswered) w.talkAnswer(r.pick(w.talk.choices).id); return; }
    if (w.state !== 'round') return;
    const live = w.balloons.filter(b => w.canTap(b));
    let x, y;
    if (live.length && r.chance(0.6)) { const b = r.pick(live); x = b.x + r.float(-20, 20); y = b.y + r.float(-20, 20); }
    else { x = r.float(L.ins.left, L.W - L.ins.right); y = r.float(L.ins.top, L.H - L.ins.bottom); }
    this.stats.taps++; w.pointerDown(x, y); w.pointerUp(x, y);
  }
}

/* spammer: hammers the screen every 0.05–0.2 s (balloons, popping ones, empty space), double-answers Talk */
class Spammer {
  constructor(w, seed) { this.w = w; this.r = new KB.RNG(seed); this.t = 0.1; this.stats = { taps: 0 }; }
  step(dt) {
    const w = this.w, r = this.r, L = w.layout;
    if (w.state === 'talk') { if (!w.talkAnswered) { w.talkAnswer(r.pick(w.talk.choices).id); w.talkAnswer(r.pick(w.talk.choices).id); } return; }
    this.t -= dt; if (this.t > 0) return; this.t = r.float(0.05, 0.2);
    const o = w.balloons.length ? r.pick(w.balloons) : null, roll = r.next();
    const x = o && roll < 0.8 ? o.x + r.float(-15, 15) : r.float(0, L.W), y = o && roll < 0.8 ? o.y + r.float(-15, 15) : r.float(0, L.H);
    this.stats.taps++; w.pointerDown(x, y); if (r.chance(0.7)) w.pointerUp(x, y);
    if (r.chance(0.02)) w.hint();
  }
}

/* absent child: never touches anything (measures idle nudges / Talk re-asks over time) */
class Absent { constructor() { this.stats = {}; } step() {} }

class BotDriver { constructor(w, skill, seed) { this.b = new KB.Bot(w, { skill, seed }); this.stats = this.b.stats; } step(dt) { this.b.step(dt); } }

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
function runSession(o) {
  const age = o.age, lang = o.lang || 'en', vp = VIEWPORTS[o.vp || 'ipadL'], seed = o.seed || 1, dt = o.dt || 1 / 30;
  const maxTime = o.maxTime || 1800, roundCap = o.roundCap || 180;
  const w = new KB.World({ seed, age, lang, config: Object.assign({ strings: false }, o.config || {}) });
  w.setViewport(vp.W, vp.H, vp.ins);
  const drv = makeDriver(o.driver, w, age, seed * 7919 + 13);
  const m = {
    age, lang, vp: o.vp, driver: o.driver, seed, sessionTime: null, done: false, stars: 0,
    rounds: [], chapters: [], hints: 0, idles: 0, idleGaps: [], wrongs: 0, corrects: 0, talkAsks: 0,
    stuck: [], invariant: [], offscreen: 0, homesSeen: 0, packShrinkMin: 1, packFail: 0, errors: [], content: []
  };
  let rd = null, ch = null, lastIdleT = null, t = 0;
  function checkHomes() {
    const Ly = w.layout, ins = Ly.ins;
    m.packShrinkMin = Math.min(m.packShrinkMin, w.packShrink); if (!w.packOk) m.packFail++;
    for (const b of w.balloons) {
      m.homesSeen++;
      const r = b.size / 2;
      if (b.hx - r < ins.left || b.hx + r > Ly.W - ins.right || b.hy - r < ins.top || b.hy + r > Ly.H - ins.bottom) m.offscreen++;
    }
  }
  const handle = (e) => {
    switch (e.type) {
      case 'level': if (ch) ch.end = w.time; ch = { level: e.level, topic: e.topic, start: w.time, end: null, stars: 0, rounds: 0 }; m.chapters.push(ch); break;
      case 'round':
        rd = { level: w.level, round: e.round, topic: e.topic, mode: e.mode, start: w.time, interactiveAt: null, end: null,
          balloons: w.balloons.length, wrong: 0, hints: 0, idles: 0, stars: 0 };
        m.rounds.push(rd); lastIdleT = null; if (ch) ch.rounds++;
        if (o.keepContent) m.content.push({ l: w.level, r: e.round, topic: e.topic, params: e.params, sign: e.sign, n: w.balloons.length,
          names: w.balloons.map(b => b.nameValue + (b.answer ? '*' : '')) });
        checkHomes(); break;
      case 'correct': m.corrects++; break;
      case 'wrong': m.wrongs++; if (rd) rd.wrong++; break;
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
    let k = 0;
    while (t < maxTime && w.state !== 'sessionDone') {
      drv.step(dt); w.update(dt); t += dt;
      for (const e of w.drainEvents()) handle(e);
      if (w.state === 'round' && rd) {
        if (w.interactive && rd.interactiveAt === null) rd.interactiveAt = w.time - rd.start;
        if (w.time - rd.start > roundCap && !rd.stuckFlag) { rd.stuckFlag = true; m.stuck.push({ kind: 'slow', level: w.level, round: w.round, topic: w.topic }); }
        if ((++k & 7) === 0) {
          // structural stuck: not solved but no right balloon is alive any more
          const md = w.cur.mode, any = w.balloons.some(b => (b.state === 'rise' || b.state === 'float') && b.popT < 0 && (md === 'count' || (md === 'ask' ? b.id === w.target : b.answer)));
          const popping = w.balloons.some(b => b.popT >= 0);
          if (!w.solved && !any && !popping) m.stuck.push({ kind: 'noTarget', level: w.level, round: w.round, topic: w.topic });
          for (const b of w.balloons) if (!Number.isFinite(b.x + b.y + b.rot + b.vx + b.vy)) { m.invariant.push('NaN ' + b.id); break; }
          for (const f of w.friends) if (!Number.isFinite(f.x + f.y)) { m.invariant.push('NaN ' + f.id); break; }
          if (m.invariant.length > 20 || m.stuck.length > 20) break;
        }
      }
    }
  } catch (err) { m.errors.push(String(err && err.stack || err)); }
  m.endState = w.state; m.simTime = t; m.driverStats = drv.stats;
  return m;
}

/* ---------------------------------------------------------------- stats helpers */
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
function pct(a, p) { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; }
const f1 = (x) => (isFinite(x) ? x.toFixed(1) : '–');
const f0 = (x) => (isFinite(x) ? Math.round(x).toString() : '–');
const fp = (x) => (isFinite(x) ? (100 * x).toFixed(1) + '%' : '–');

module.exports = { KB, VIEWPORTS, runSession, makeDriver, KID_PROFILES, typicalProfile, mean, pct, f1, f0, fp, hyp };
