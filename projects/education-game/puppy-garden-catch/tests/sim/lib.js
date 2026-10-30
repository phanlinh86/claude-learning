// Puppy Garden Catch — headless playtest harness (report-only; never edits game code).
//   const L = require('./lib'); const m = L.runSession({ age, lang, vp, driver: 'toddler', seed, config });
// Loads rng/i18n/content/world/bot into a node vm (same pattern as tests/unit/load.js), drives the public
// input API only (pointerDown/Move/Up, cancelDrag, talkAnswer) and measures timings, catches, misses,
// speech load, stuck rounds and invariants.
// Drivers: bot<skill> (PG.Bot, e.g. bot0.5), toddler, typical (scales with age), slowKid, idleKid,
//          tapper (taps bubbles to hear names + random taps), spammer (multi-touch chaos), absent (never touches).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', '..', 'game', 'js');
function loadPG() {
  const sandbox = { console, Math, Date, JSON };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const f of ['rng.js', 'i18n.js', 'content.js', 'world.js', 'bot.js']) {
    try { vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), sandbox, { filename: f }); }
    catch (e) { if (f !== 'i18n.js') throw e; console.error('(sim: i18n.js not loadable — speech model uses keys only) ' + e.message); }
  }
  return sandbox.PG;
}
const PG = loadPG();

// Logical viewports (short side 720) with safe-area insets converted from CSS px.
const VIEWPORTS = {
  iphoneP: { W: 720, H: 1556, ins: { top: 108, right: 0, bottom: 62, left: 0 } },    // 393×852 css, 59/34 css insets
  iphoneL: { W: 1556, H: 720, ins: { top: 0, right: 108, bottom: 38, left: 108 } },  // 852×393 css, 59/21 css insets
  ipadL:   { W: 1036, H: 720, ins: { top: 32, right: 0, bottom: 27, left: 0 } },     // 1180×820 css
  ipadP:   { W: 720, H: 1036, ins: { top: 32, right: 0, bottom: 27, left: 0 } }      // 820×1180 css
};

const TAU = Math.PI * 2;
const hyp = (x, y) => Math.sqrt(x * x + y * y);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ---------------------------------------------------------------- speech model (mirrors main.js + voice.js)
 * Duration ≈ 0.25 s + words / rate (en 2.3 words/s; vi 3.0 syllables/s). MAXQ 2, stale 5 s for non-priority
 * lines, interrupt = flush queue + cancel current. */
class SpeechModel {
  constructor(lang, rng, policy) {
    this.policy = policy || {};
    this.lang = lang; this.rng = rng; this.cur = null; this.queue = []; this.t = 0;
    this.log = []; this.cuts = []; this.dropped = 0; this.spoken = 0; this.requests = 0;
    this.lastTapSay = -9; this.missSay = 0; this.lastRound = null;
  }
  dur(text) { const n = String(text).trim().split(/\s+/).length; return 0.25 + n / (this.lang === 'vi' ? 3.0 : 2.3); }
  speaking() { return !!this.cur; }
  advance(t) {
    this.t = t;
    while (this.cur && this.cur.start + this.cur.d <= t) { const end = this.cur.start + this.cur.d; this.spoken++; this.cur = null; this._kick(end); }
    if (!this.cur) this._kick(t);
  }
  _kick(t) {
    while (!this.cur && this.queue.length) {
      const it = this.queue.shift();
      if (!it.priority && t - it.t > 5) { this.dropped++; continue; }
      this.cur = { ...it, start: Math.max(t, it.t + (it.delay || 0)), d: this.dur(it.text) };
    }
  }
  say(type, text, opt) {
    opt = opt || {}; if (!text) return; this.requests++;
    const item = { type, text, t: this.t, priority: !!opt.priority, delay: opt.interrupt ? 0.09 : 0 };
    this.log.push({ t: this.t, type, text, interrupt: !!opt.interrupt });
    if (opt.interrupt) {
      this.dropped += this.queue.length; this.queue = [];
      if (this.cur) {
        const el = this.t - this.cur.start, frac = clamp(el / this.cur.d, 0, 1);
        this.cuts.push({ t: this.t, cut: this.cur.type, by: type, frac, text: this.cur.text, never: el <= 0 });
        this.cur = null;
      }
      this.queue.push(item); this._kick(this.t); return;
    }
    this.queue.push(item);
    while (this.queue.length > 2) {
      let idx = this.queue.findIndex((q, i) => i < this.queue.length - 1 && !q.priority); if (idx < 0) idx = 0;
      this.queue.splice(idx, 1); this.dropped++;
    }
    this._kick(this.t);
  }
  T(k, p) { const I = PG.I18N; if (!I) return k; try { return I.t(this.lang, k, p, this.rng) || k; } catch (e) { return k; } }
  NAME(k, v) { const I = PG.I18N; if (!I) return String(v); try { return I.name(this.lang, k, v); } catch (e) { return String(v); } }
  prompt(ev) { const p = Object.assign({}, ev.params || {}); return this.T(ev.promptKey, p); }
  // speech policy (what main.js says for each world event)
  onEvent(e, w) {
    const I = PG.I18N, L = this.lang;
    switch (e.type) {
      case 'level': this.say('level', this.T('ui.chapter', { n: e.level + 1 }) + '. ' + this.T('topic.' + e.topic), { interrupt: true }); break;
      case 'round': this.lastRound = e; this.say('round', this.prompt(e), { priority: true }); break;
      case 'tap': if (this.t - this.lastTapSay > 0.7) { this.lastTapSay = this.t; this.say('tap', this.NAME(e.nameKind, e.nameValue), { interrupt: !this.speaking() || this.cur.type === 'tap' }); } break;
      case 'tapPup': if (this.lastRound) this.say('repeat', this.prompt(this.lastRound), { interrupt: true }); break;
      case 'correct': {
        if (w.cur && w.cur.mode === 'count') break;     // counting speaks on land
        let s1 = ''; try { s1 = I && I.sayCorrect ? I.sayCorrect(L, e, this.rng) : ''; } catch (x) { s1 = ''; }
        this.say('correct', s1 || this.T('praise'), { interrupt: true }); break;
      }
      case 'land': if (w.cur && w.cur.mode === 'count') this.say('count', this.NAME('number', e.count), { interrupt: true }); break;
      case 'wrong': {
        let s2 = ''; try { s2 = I && I.sayWrong ? I.sayWrong(L, e, this.rng) : ''; } catch (x) { s2 = ''; }
        this.say('wrong', s2 || this.T('wrong'), { interrupt: true }); break;
      }
      case 'miss': if (++this.missSay % 2 === 1) this.say('miss', this.T('miss')); break;
      case 'hint': this.say('hint', this.T('hint'), { interrupt: !(this.cur && this.cur.type === 'wrong') }); break;
      case 'idle': this.say('idle', this.T('idle') + ' ' + (this.lastRound ? this.prompt(this.lastRound) : '')); break;
      case 'roundDone': this.say('roundDone', this.T('great'), { priority: true }); break;
      case 'talk': this.say('talk', this.T('talk.intro') + ' ' + this.T(e.talk.promptKey, e.talk.params || {}), { interrupt: true, priority: true }); break;
      case 'talkAsk': this.say('talkAsk', this.T(e.talk.promptKey, e.talk.params || {}), { priority: true }); break;
      case 'talkResult': this.say('talkResult', e.correct ? this.T('talk.right') : this.T('talk.wrong'), { interrupt: true }); break;
      case 'sessionDone': this.say('sessionDone', this.T('session.done', { stars: e.stars || 0 }), { interrupt: true }); break;
    }
  }
}

/* ---------------------------------------------------------------- child models (drive the public input API)
 * A child keeps a finger on the grass (or lifts it) and slides it under the bubble it wants.
 *   reaction   s between looks/corrections       speed   finger px/s
 *   pWrong     chance a new target is a WRONG bubble (doesn't know / likes the colour)
 *   pShort     chance a correction stops short (fraction short in shortFrac)
 *   predict    0..1 how well the landing point (drift + sway) is anticipated (0 = chases the current x)
 *   pLift      chance to lift the finger after each catch;  pTap  chance per look to tap a bubble first (hear its name)
 *   pTapRun    tapping "wants" the bubble: Pip runs there (world rule), the kid keeps the finger there
 *   idleRound/idleFor: stands still for idleFor s once in round idleRound of every chapter */
const KID_PROFILES = {
  toddler: { reaction: [0.9, 2.2], speed: [300, 600], pWrong: 0.3, pShort: 0.35, shortFrac: [0.3, 0.7], predict: 0, pLift: 0.5, pTap: 0.15,
    talkDelay: [2, 6], talkRight: 0.6 },
  typical: null,
  slowKid: { reaction: [1.5, 3.5], speed: [250, 450], pWrong: 0.2, pShort: 0.4, shortFrac: [0.3, 0.7], predict: 0, pLift: 0.6, pTap: 0.1,
    talkDelay: [3, 8], talkRight: 0.6 },
  idleKid: { reaction: [0.8, 1.6], speed: [500, 800], pWrong: 0.1, pShort: 0.15, shortFrac: [0.5, 0.8], predict: 0.5, pLift: 0.3, pTap: 0.05,
    talkDelay: [30, 30], talkRight: 0.8, idleRound: 2, idleFor: 30 }
};
function typicalProfile(age) {
  const k = clamp((age - 3) / 4, 0, 1);
  return { reaction: [1.2 - 0.6 * k, 2.0 - 1.0 * k], speed: [400 + 300 * k, 700 + 300 * k], pWrong: 0.22 - 0.16 * k, pShort: 0.3 - 0.2 * k,
    shortFrac: [0.4, 0.8], predict: 0.2 + 0.6 * k, pLift: 0.4, pTap: 0.1 - 0.06 * k, talkDelay: [2, 4.5 - 1.5 * k], talkRight: 0.65 + 0.25 * k };
}

class Kid {
  constructor(w, prof, seed) {
    this.w = w; this.p = prof; this.r = new PG.RNG(seed);
    this.f = { x: w.pup.x, y: 0, down: false }; this.downT = 0; this.t = this.react(); this.pth = null; this.target = null;
    this.stats = { steers: 0, taps: 0, lifts: 0 }; this.talkT = -1; this.idleLeft = 0; this.idledRound = -1; this.lastCatches = w.counters.catches;
    this.tapPending = null;
  }
  react() { return this.r.float(this.p.reaction[0], this.p.reaction[1]); }
  fy() { const L = this.w.layout; return Math.min(L.groundY + 24, L.H - L.ins.bottom - 6); }
  air(right) { return this.w.items.filter(i => (i.state === 'fall' || i.state === 'appear') && (right === undefined || i.right === right) && i.y < this.w.basket.y + 20); }
  landX(it) {
    const w = this.w, vy = Math.max(it.vy, 20), t = Math.max(0, (w.basket.y - it.y) / vy);
    const pred = it.xb + it.ub * t + w.cfg.swayAmp * Math.sin(it.phase + TAU / it._swP * t);
    return it.x + (pred - it.x) * this.p.predict;
  }
  release() { if (this.f.down) { this.w.pointerUp(this.f.x, this.f.y); this.f.down = false; this.stats.lifts++; } }
  step(dt) {
    const w = this.w, r = this.r, p = this.p;
    if (w.state === 'talk') {
      if (this.f.down && this.downT > 0.4) this.release();
      if (w.talkAnswered) return;
      if (this.talkT < 0) this.talkT = r.float(p.talkDelay[0], p.talkDelay[1]);
      this.talkT -= dt;
      if (this.talkT <= 0) {
        this.talkT = -1; const t = w.talk; let pick = t.answerId;
        if (!r.chance(p.talkRight)) { const wr = t.choices.filter(c => c.id !== t.answerId); if (wr.length) pick = r.pick(wr).id; }
        w.talkAnswer(pick);
      }
      return;
    }
    this.talkT = -1;
    if (this.f.down) this.downT += dt;
    if (this.tapPending) {                        // finishing a tap: release after 0.06–0.18 s at the same spot
      this.tapPending.t -= dt;
      if (this.tapPending.t <= 0) { w.pointerUp(this.f.x, this.f.y); this.f.down = false; this.tapPending = null; }
      return;
    }
    if (w.state !== 'round' || w._roundEnded) { if (this.f.down && this.downT > 0.4) this.release(); this.target = null; return; }
    if (p.idleFor && w.round === p.idleRound && this.idledRound !== w.level && w.basket.count > 0) {
      this.idledRound = w.level; this.idleLeft = p.idleFor; this.release();
    }
    if (this.idleLeft > 0) { this.idleLeft -= dt; return; }
    if (w.counters.catches !== this.lastCatches) {
      this.lastCatches = w.counters.catches;
      if (this.f.down && this.downT > 0.4 && r.chance(p.pLift)) { this.release(); this.t = this.react(); }
    }
    this.t -= dt;
    if (this.t <= 0) {
      this.t = this.react();
      // occasionally tap a bubble to hear what it is (finger goes up to the bubble)
      const all = this.air();
      if (all.length && r.chance(p.pTap)) {
        const b = r.pick(all);
        if (this.f.down) this.release();
        this.f.x = b.x + r.float(-12, 12); this.f.y = b.y + r.float(-12, 12); this.f.down = true; this.downT = 0;
        w.pointerDown(this.f.x, this.f.y); this.stats.taps++;
        this.tapPending = { t: r.float(0.06, 0.18) };
        return;
      }
      const keep = this.target && (this.target.state === 'fall' || this.target.state === 'appear') && this.target.y < w.basket.y + 20;
      if (!keep) {
        const rights = this.air(true), wrongs = this.air(false);
        const low = a => a.reduce((b, x) => (!b || x.y > b.y ? x : b), null);
        this.target = wrongs.length && r.chance(p.pWrong) ? r.pick(wrongs) : low(rights);
      }
      if (this.target) {
        let gx = this.landX(this.target);
        if (r.chance(p.pShort)) gx = w.pup.x + (gx - w.pup.x) * r.float(p.shortFrac[0], p.shortFrac[1]);
        if (!this.f.down) { this.f.x = w.pup.x + r.float(-30, 30); this.f.y = this.fy(); this.f.down = true; this.downT = 0; w.pointerDown(this.f.x, this.f.y); this.stats.steers++; }
        const d = Math.abs(gx - this.f.x), sp = r.float(p.speed[0], p.speed[1]);
        this.pth = { x0: this.f.x, x1: gx, T: Math.max(0.1, d / sp), t: 0 };
      }
    }
    if (this.f.down && this.pth) {
      const q = this.pth; q.t = Math.min(q.T, q.t + dt); const u = q.t / q.T, e = u * u * (3 - 2 * u);
      this.f.x = q.x0 + (q.x1 - q.x0) * e; this.f.y = this.fy();
      w.pointerMove(this.f.x, this.f.y);
      if (q.t >= q.T) this.pth = null;
    }
  }
}

/* tapper: mostly taps bubbles (hear the name), sometimes taps Pip or empty grass, sometimes drags short */
class Tapper {
  constructor(w, seed) { this.w = w; this.r = new PG.RNG(seed); this.f = { x: 300, y: 300, down: false }; this.t = 1; this.up = -1; this.stats = { taps: 0, drags: 0 }; }
  step(dt) {
    const w = this.w, r = this.r, L = w.layout;
    if (w.state === 'talk') { if (!w.talkAnswered) { this.t -= dt; if (this.t <= 0) { w.talkAnswer(r.pick(w.talk.choices).id); this.t = 1; } } return; }
    if (this.up >= 0) { this.up -= dt; if (this.up < 0) { w.pointerUp(this.f.x, this.f.y); this.f.down = false; this.t = r.float(0.3, 1.5); } return; }
    if (w.state !== 'round') return;
    this.t -= dt; if (this.t > 0) return;
    const roll = r.next(), its = w.items.filter(i => i.state === 'fall' || i.state === 'appear' || i.state === 'rise');
    if (roll < 0.6 && its.length) { const it = r.pick(its); this.f.x = it.x + r.float(-10, 10); this.f.y = it.y + r.float(-10, 10); this.up = r.float(0.06, 0.2); this.stats.taps++; }
    else if (roll < 0.75) { this.f.x = w.pup.x + r.float(-20, 20); this.f.y = L.pup.y - 0.6 * L.pup.h; this.up = 0.1; this.stats.taps++; }
    else if (roll < 0.9) { this.f.x = r.float(L.ins.left, L.W - L.ins.right); this.f.y = r.float(L.ins.top, L.H - L.ins.bottom); this.up = 0.1; this.stats.taps++; }
    else { this.f.x = r.float(L.lanes.x0, L.lanes.x1); this.f.y = L.groundY; this.up = r.float(0.5, 2); this.stats.drags++; }
    this.f.down = true; w.pointerDown(this.f.x, this.f.y);
  }
}

/* spammer: rapid down/up/moves anywhere, flings across the screen, cancels, answers talk instantly */
class Spammer {
  constructor(w, seed) { this.w = w; this.r = new PG.RNG(seed); this.f = { x: 300, y: 300, down: false }; this.t = 0.1; this.stats = { downs: 0, cancels: 0 }; }
  step(dt) {
    const w = this.w, r = this.r, L = w.layout;
    if (w.state === 'talk') { if (!w.talkAnswered) { w.talkAnswer(r.pick(w.talk.choices).id); w.talkAnswer(r.pick(w.talk.choices).id); } return; }
    this.t -= dt;
    if (this.t > 0) { if (this.f.down) { this.f.x += r.float(-80, 80); this.f.y += r.float(-40, 40); w.pointerMove(this.f.x, this.f.y); } return; }
    this.t = r.float(0.03, 0.25);
    const roll = r.next();
    if (roll < 0.1) { w.cancelDrag(); this.f.down = false; this.stats.cancels++; return; }
    if (roll < 0.4 && this.f.down) { w.pointerUp(this.f.x, this.f.y); this.f.down = false; return; }
    if (roll < 0.55) { this.f.x = r.float(-50, L.W + 50); w.pointerMove(this.f.x, this.f.y); return; }   // fling
    this.f.x = r.float(0, L.W); this.f.y = r.float(0, L.H); this.f.down = true; this.stats.downs++;
    w.pointerDown(this.f.x, this.f.y);      // a 2nd finger simply re-steers
  }
}
class Absent { constructor() { this.stats = {}; } step() {} }

/* PG.Bot wrapper */
class BotDriver { constructor(w, skill, seed) { this.b = new PG.Bot(w, { skill, seed }); this.stats = this.b.stats; } step(dt) { this.b.step(dt); } }

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
  const maxTime = o.maxTime || 1800, roundCap = o.roundCap || 120;
  const w = new PG.World({ seed, age, lang, config: o.config || {} });
  const hooks = o.hooks || {};
  w.setViewport(vp.W, vp.H, vp.ins);
  const drv = makeDriver(o.driver, w, age, seed * 7919 + 13);
  const sp = new SpeechModel(lang, new PG.RNG(seed + 5), o.speechPolicy);
  const m = {
    age, lang, vp: o.vp, driver: o.driver, seed, sessionTime: null, done: false, stars: 0,
    rounds: [], chapters: [], hints: 0, idles: 0, idleGaps: [], misses: 0, wrongs: 0, corrects: 0, taps: 0, tapPups: 0, catches: 0, spawns: 0,
    maxNoRight: 0, maxAir: 0, stuck: [], invariant: [], speechEvents: [], talkStates: [], content: [], errors: []
  };
  let rd = null, ch = null, lastIdleT = null, noRight = 0;

  w.newSession();
  const handle = (e) => {
    if (hooks.onEvent) hooks.onEvent(e, w, ch);
    sp.onEvent(e, w);
    if ({ tap: 1, correct: 1, wrong: 1, miss: 1, land: 1, hint: 1, idle: 1, roundDone: 1 }[e.type]) m.speechEvents.push({ t: w.time, type: e.type });
    switch (e.type) {
      case 'level': if (ch) ch.end = w.time; ch = { level: e.level, topic: e.topic, start: w.time, end: null, stars: 0, rounds: 0 }; m.chapters.push(ch); break;
      case 'round':
        rd = { level: w.level, round: e.round, topic: e.topic, mode: e.mode, need: e.need, start: w.time, firstCatch: null, end: null,
          wrong: 0, miss: 0, hints: 0, idles: 0, taps: 0, stars: 0, spawns: 0 };
        m.rounds.push(rd); lastIdleT = null; noRight = 0;
        m.content.push({ level: w.level, round: e.round, topic: e.topic, target: w.cur.target.value, need: e.need, promptKey: e.promptKey,
          pool: w.cur.pool.map(t => (t.right ? '+' : '-') + t.nameValue) });
        break;
      case 'appear': m.spawns++; if (rd) rd.spawns++; break;
      case 'catch': m.catches++; break;
      case 'correct': m.corrects++; if (rd && rd.firstCatch === null) rd.firstCatch = w.time - rd.start; break;
      case 'wrong': m.wrongs++; if (rd) rd.wrong++; break;
      case 'miss': m.misses++; if (rd) rd.miss++; break;
      case 'tap': m.taps++; if (rd) rd.taps++; break;
      case 'tapPup': m.tapPups++; break;
      case 'hint': m.hints++; if (rd) rd.hints++; break;
      case 'idle': m.idles++; if (rd) rd.idles++; if (lastIdleT !== null) m.idleGaps.push(w.time - lastIdleT); lastIdleT = w.time; break;
      case 'roundDone': if (rd) { rd.end = w.time; rd.stars = e.stars; } if (ch) { ch.stars += e.stars; ch.rounds++; } break;
      case 'talk': m.talkStates.push({ start: w.time, answered: null }); break;
      case 'talkResult': { const ts = m.talkStates[m.talkStates.length - 1]; if (ts) ts.answered = w.time - ts.start; if (ch && e.correct) ch.stars += 1; break; }
      case 'sessionDone': m.done = true; m.sessionTime = w.time; m.stars = e.stars; if (ch) ch.end = w.time; break;
    }
  };
  let t = 0;
  try {
    for (const e of w.drainEvents()) handle(e);
    while (t < maxTime && w.state !== 'sessionDone') {
      drv.step(dt); w.update(dt); t += dt; sp.advance(w.time);
      for (const e of w.drainEvents()) handle(e);
      if (w.state === 'round' && rd && !w._roundEnded) {
        if (w.time - rd.start > roundCap && !rd.stuckFlag) { rd.stuckFlag = true; m.stuck.push({ kind: 'slow', level: w.level, round: w.round, topic: w.topic, t: w.time }); }
        const air = w.items.filter(i => i.state === 'fall' || i.state === 'appear');
        m.maxAir = Math.max(m.maxAir, air.length - w.cur.maxAir);
        noRight = air.length && !air.some(i => i.right) ? noRight + dt : 0;
        m.maxNoRight = Math.max(m.maxNoRight, noRight);
        const L = w.layout;
        for (const it of w.items) if (!isFinite(it.x) || !isFinite(it.y) || it.x < -300 || it.x > L.W + 300 || it.y > L.H + 300) { m.invariant.push('bad pos ' + it.id + ' ' + it.state); break; }
        if (w.basket.count > w.basket.need || w.basket.reserved > w.basket.need) m.invariant.push('overfull');
        if (w.pup.x < L.pup.minX - 1e-6 || w.pup.x > L.pup.maxX + 1e-6) m.invariant.push('pup out of lanes');
        if (m.invariant.length > 20) break;
      }
      if (w.state === 'talk' && o.talkTimeout && m.talkStates.length && w.time - m.talkStates[m.talkStates.length - 1].start > o.talkTimeout) break;
    }
  } catch (err) { m.errors.push(String(err && err.stack || err)); }
  m.endState = w.state; m.simTime = t;
  m.speech = { requests: sp.requests, spoken: sp.spoken, dropped: sp.dropped, cuts: sp.cuts, log: o.keepSpeechLog ? sp.log : undefined };
  m.driverStats = drv.stats;
  return m;
}

/* ---------------------------------------------------------------- stats helpers */
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
function pct(a, p) { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; }
const f1 = (x) => (isFinite(x) ? x.toFixed(1) : '–');
const f0 = (x) => (isFinite(x) ? Math.round(x).toString() : '–');
const fp = (x) => (isFinite(x) ? (100 * x).toFixed(1) + '%' : '–');
function maxRate(events, win) {   // max number of events inside any window of `win` s
  let best = 0, j = 0;
  for (let i = 0; i < events.length; i++) { while (events[i].t - events[j].t > win) j++; best = Math.max(best, i - j + 1); }
  return best;
}

module.exports = { PG, VIEWPORTS, runSession, makeDriver, KID_PROFILES, typicalProfile, SpeechModel, mean, pct, f1, f0, fp, maxRate, hyp };
