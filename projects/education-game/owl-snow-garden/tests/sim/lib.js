// Owlet's Snow Garden — headless playtest harness (report-only; never edits game code).
//   const L = require('./lib'); const r = L.runSession({ age, lang, vp, driver: 'toddler', seed, config });
// Loads rng/i18n/content/world/bot into a node vm (same pattern as tests/unit/load.js), drives the
// public input API (pointerDown/Move/Up, talkAnswer) and measures timings, misses, speech spam, stuck rounds.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', '..', 'game', 'js');
const FILES = ['rng.js', 'i18n.js', 'content.js', 'world.js', 'bot.js'];

function loadDN() {
  const sandbox = { console, Math, Date, JSON };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), sandbox, { filename: f });
  return sandbox.SG;
}
const SG = loadDN();

// Logical viewports (short side 720) with safe-area insets converted from CSS px (see main.js computeView).
const VIEWPORTS = {
  iphoneP: { W: 720, H: 1556, ins: { top: 108, right: 0, bottom: 62, left: 0 } },    // 393×852 css, 59/34 css insets
  iphoneL: { W: 1556, H: 720, ins: { top: 0, right: 108, bottom: 38, left: 108 } },  // 852×393 css, 59/21 css insets
  ipadL:   { W: 960, H: 720, ins: { top: 32, right: 0, bottom: 27, left: 0 } },      // 24/20 css insets at s=0.75
  ipadP:   { W: 720, H: 960, ins: { top: 32, right: 0, bottom: 27, left: 0 } }
};

const TAU = Math.PI * 2;
const hyp = (x, y) => Math.sqrt(x * x + y * y);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ---------------------------------------------------------------- geometry helpers */
function nestRect(w, b) { return { x: b.x - b.w / 2, y: b.top, w: b.w, h: b.h }; }   // pot / planter sprite rect
function distToRect(px, py, r) {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w)), dy = Math.max(r.y - py, 0, py - (r.y + r.h));
  return hyp(dx, dy);
}
function nearestNestDist(w, px, py) {
  let best = 1e9;
  for (const b of w.baskets) best = Math.min(best, distToRect(px, py, nestRect(w, b)));
  return best;
}

/* ---------------------------------------------------------------- speech model (mirrors main.js + voice.js)
 * Duration ≈ 0.25 s + words / rate (en 2.3 words/s at RATE 0.9; vi 3.0 syllables/s). MAXQ 2, stale 5 s
 * for non-priority lines, interrupt = flush queue + cancel current. */
class SpeechModel {
  constructor(lang, rng, policy) {
    this.policy = policy || {}; this.lastPraiseT = -9;
    this.lang = lang; this.rng = rng; this.cur = null; this.queue = []; this.t = 0;
    this.log = []; this.cuts = []; this.dropped = 0; this.spoken = 0; this.requests = 0;
    this.lastGrabSay = -9; this.missSay = 0; this.lastRound = null;
  }
  dur(text) { const n = String(text).trim().split(/\s+/).length; return 0.25 + n / (this.lang === 'vi' ? 3.0 : 2.3); }
  speaking() { return !!this.cur; }
  advance(t) {
    this.t = t;
    while (this.cur && this.cur.start + this.cur.d <= t) {
      const end = this.cur.start + this.cur.d; this.spoken++; this.cur = null; this._kick(end);
    }
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
  // main.js onEvent speech policy
  onEvent(e, w) {
    const I = SG.I18N, L = this.lang;
    const T = (k, p) => { try { const s = I.t(L, k, p, this.rng); return s == null ? k : String(s); } catch (err) { return k; } };
    const NAME = (k, v) => { try { const s = I.name(L, k, v); return s == null ? String(v) : String(s); } catch (err) { return String(v); } };
    const prompt = (ev) => T(ev.promptKey, Object.assign({}, ev.params || {}));
    switch (e.type) {
      case 'level': this.say('level', T('ui.chapter', { n: e.level + 1 }) + '. ' + T('topic.' + e.topic), { interrupt: true }); break;
      case 'round': this.lastRound = e; if (e.mode !== 'ask') this.say('round', prompt(e), { priority: true }); break;
      case 'ask': this.lastRound = e; this.say('ask', prompt(e), { priority: true }); break;
      case 'grab':
        if (!this.speaking() && this.t - this.lastGrabSay > 0.7 && e.nameKind) { this.lastGrabSay = this.t; this.say('grab', NAME(e.nameKind, e.nameValue)); }
        break;
      case 'correct': {
        if (w.cur && w.cur.mode === 'count') break;
        const b = w.basketById(e.basketId); const ev = Object.assign({ label: b && b.label }, e);
        const s1 = I.sayCorrect ? I.sayCorrect(L, ev, this.rng) : '';
        if (this.policy.praiseThrottle && this.cur && this.cur.type === 'correct' && this.t - this.lastPraiseT < this.policy.praiseThrottle) break; // sfx only
        if (this.policy.greatQueued && w.items.every(i => i.state === 'in' || i.state === 'fly')) { this.lastPraiseT = this.t; break; }  // last item: roundDone line will praise
        this.lastPraiseT = this.t;
        this.say('correct', s1 && this.rng.next() < 0.65 ? s1 : T('praise'), { interrupt: true }); break;
      }
      case 'bloom':
        if (w.cur && w.cur.mode === 'count') {
          if (this.policy.countFinal && e.need && e.n >= e.need) { this.finalCount = e.n; break; }   // said with roundDone
          this.say('count', NAME('number', e.n), { interrupt: true });
        }
        break;
      case 'wrong': this.say('wrong', T('wrong'), { interrupt: true }); break;
      case 'miss': if (++this.missSay % 2 === 1) this.say('miss', T('miss')); break;
      case 'hint':
        if (this.policy.hintOnce && this.cur && this.cur.type === 'hint') break;
        this.say('hint', T('hint'), { interrupt: !(this.policy.hintOnce && this.cur && this.cur.type === 'wrong') }); break;
      case 'idle': this.say('idle', T('idle') + ' ' + (this.lastRound ? prompt(this.lastRound) : '')); break;
      case 'roundDone':
        if (this.policy.countFinal && this.finalCount) { this.say('roundDone', NAME('number', this.finalCount) + '! ' + T('great'), { interrupt: true }); this.finalCount = 0; break; }
        if (this.policy.greatQueued) { this.say('roundDone', T('great'), { priority: true }); break; }
        this.say('roundDone', T('great'), { interrupt: true }); break;
      case 'talk': this.say('talk', T('talk.intro') + ' ' + T(e.talk.promptKey, e.talk.params || {}), { interrupt: true, priority: true }); break;
      case 'talkResult': this.say('talkResult', e.correct ? T('talk.right') : 'It is the answer! Good try!', { interrupt: true }); break;
      case 'sessionDone': this.say('sessionDone', T('session.done', { stars: e.stars || 0 }), { interrupt: true }); break;
    }
  }
}

/* ---------------------------------------------------------------- child models (drive the public input API) */
const KID_PROFILES = {
  // age 3 toddler: slow hand, long reaction, 35 % random nest, sloppy drops, sometimes lets go mid-way
  toddler: { reaction: [1, 3], speed: [300, 500], wobble: 18, pRandomNest: 0.35, pHigh: 0.3, pBeside: 0.2, pMidway: 0.08,
    grabSpread: 0.7, talkDelay: [2, 6], talkRight: 0.6, pickReturning: 0.15 },
  // a typical kid of the given age (speed/reaction/error scale with age) — used for the "≤ 8 min" target
  typical: null,
  // always the right nest, but releases 60–120 px above the nest centre
  dropsHigh: { reaction: [0.6, 1.2], speed: [600, 900], wobble: 6, pRandomNest: 0, pHigh: 1, highRange: [60, 120], pBeside: 0, pMidway: 0,
    grabSpread: 0.4, talkDelay: [1.5, 3], talkRight: 0.9 },
  // always the right nest, releases just beside / below the nest sprite (5–45 px outside)
  beside: { reaction: [0.6, 1.2], speed: [600, 900], wobble: 6, pRandomNest: 0, pHigh: 0, pBeside: 1, pMidway: 0,
    grabSpread: 0.4, talkDelay: [1.5, 3], talkRight: 0.9 },
  // a kid who does nothing for 30 s in round 2 of every chapter and waits 30 s before answering Talk time
  idleKid: { reaction: [0.8, 1.6], speed: [500, 800], wobble: 8, pRandomNest: 0.1, pHigh: 0.1, pBeside: 0.05, pMidway: 0.02,
    grabSpread: 0.5, talkDelay: [30, 30], talkRight: 0.8, idleRound: 2, idleFor: 30 },
  // brute force without understanding: tries the nests left → right until one accepts
  bruteForce: { reaction: [0.3, 0.6], speed: [800, 1100], wobble: 4, pRandomNest: 0, pHigh: 0, pBeside: 0, pMidway: 0,
    grabSpread: 0.3, talkDelay: [1, 2], talkRight: 0.34, brute: true }
};
function typicalProfile(age) {
  const k = clamp((age - 3) / 4, 0, 1);
  return { reaction: [1.6 - 0.9 * k, 2.4 - 1.2 * k], speed: [400 + 300 * k, 650 + 350 * k], wobble: 12 - 8 * k,
    pRandomNest: 0.2 - 0.12 * k, pHigh: 0.15, pBeside: 0.08 - 0.05 * k, pMidway: 0.04 - 0.03 * k,
    grabSpread: 0.6, talkDelay: [2, 4.5 - 1.5 * k], talkRight: 0.65 + 0.25 * k, pickReturning: 0.05 };
}

class Kid {
  constructor(w, prof, seed) {
    this.w = w; this.p = prof; this.r = new SG.RNG(seed); this.f = { x: w.layout.W / 2, y: w.layout.H / 2, down: false };
    this.phase = 'wait'; this.t = this.react(); this.stats = { grabs: 0, failedGrabs: 0, releases: 0 };
    this.talkT = -1; this.idleLeft = 0; this.idledThisRound = false; this.brute = {}; this.lastRoundKey = '';
  }
  react() { return this.r.float(this.p.reaction[0], this.p.reaction[1]); }
  path(tx, ty, track) {
    const d = hyp(tx - this.f.x, ty - this.f.y), sp = this.r.float(this.p.speed[0], this.p.speed[1]);
    this.pth = { x0: this.f.x, y0: this.f.y, x1: tx, y1: ty, T: Math.max(0.15, d / sp), t: 0, ph: this.r.float(0, TAU), wob: this.p.wobble, track };
  }
  move(dt, tx, ty) {
    const p = this.pth; if (tx !== undefined) { p.x1 = tx; p.y1 = ty; }
    p.t = Math.min(p.T, p.t + dt); const u = p.t / p.T, s = u * u * (3 - 2 * u);
    const dx = p.x1 - p.x0, dy = p.y1 - p.y0, L = hyp(dx, dy) || 1, wob = Math.sin(Math.PI * u) * p.wob * Math.sin(p.ph + TAU * 1.5 * p.t);
    this.f.x = p.x0 + dx * s - dy / L * wob; this.f.y = p.y0 + dy * s + dx / L * wob;
    return p.t >= p.T;
  }
  choose() {
    const w = this.w, c = w.items.filter(it => it.state === 'idle' || (this.p.pickReturning && it.state === 'return' && this.r.chance(this.p.pickReturning)));
    return c.length ? this.r.pick(c) : null;
  }
  goal(it) {
    const w = this.w, r = this.r, p = this.p, L = w.layout;
    const goalId = w.goalOf(it);
    let b = w.basketById(goalId);
    if (p.brute) {
      const key = it.id + ':' + goalId; const tried = this.brute[key] || 0; b = w.baskets[Math.min(tried, w.baskets.length - 1)]; this.brute[key] = tried + 1;
      if (b.id === goalId) this.brute[key] = 0;
    } else if (r.chance(p.pRandomNest)) b = r.pick(w.baskets);
    const g = { b, kind: 'nest' };
    const roll = r.next();
    if (roll < p.pMidway) { g.kind = 'midway'; }
    else if (roll < p.pMidway + p.pHigh) {
      const hr = p.highRange || [60, 150];
      g.kind = 'high'; g.x = b.x + r.float(-0.3, 0.3) * b.w; g.y = b.y - r.float(hr[0], hr[1]);
    } else if (roll < p.pMidway + p.pHigh + p.pBeside) {
      const top = b.top;
      g.kind = 'beside';
      if (r.chance(0.67)) { const side = r.sign(); g.x = b.x + side * (b.w / 2 + r.float(5, 45)); g.y = top + r.float(0.1, 0.9) * b.h; }
      else { g.x = b.x + r.float(-0.4, 0.4) * b.w; g.y = top + b.h + r.float(5, 45); }
      g.x = clamp(g.x, L.ins.left + 4, L.W - L.ins.right - 4); g.y = clamp(g.y, 0, L.H - L.ins.bottom - 4);
    } else { g.x = b.x + r.float(-0.3, 0.3) * Math.min(b.w, 240); g.y = b.top + r.float(-10, 50); }
    return g;
  }
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') {
      if (w.talkAnswered) return;
      if (this.talkT < 0) this.talkT = r.float(this.p.talkDelay[0], this.p.talkDelay[1]);
      this.talkT -= dt;
      if (this.talkT <= 0) {
        this.talkT = -1; const t = w.talk; let pick = t.answerId;
        if (!r.chance(this.p.talkRight)) { const wr = t.choices.filter(c => c.id !== t.answerId); if (wr.length) pick = r.pick(wr).id; }
        w.talkAnswer(pick);
      }
      return;
    }
    this.talkT = -1;
    if (w.state !== 'round' || !w.interactive) {
      if (this.f.down) { w.pointerUp(this.f.x, this.f.y); this.f.down = false; }
      this.phase = 'wait'; this.t = Math.max(this.t, 0.3); this.idledThisRound = false; return;
    }
    // idle kid: once per chapter (round idleRound), after its first drop, stands still for idleFor seconds
    if (this.p.idleFor && w.round === this.p.idleRound && !this.idledThisRound && this.phase === 'wait' && this.stats.releases > 0) {
      const anyIn = w.items.some(it => it.state === 'in' || it.state === 'fly');
      if (anyIn) { this.idledThisRound = true; this.idleLeft = this.p.idleFor; this.idleStart = w.time; }
    }
    if (this.idleLeft > 0) { this.idleLeft -= dt; return; }
    switch (this.phase) {
      case 'wait':
        this.t -= dt;
        if (this.t <= 0) {
          const it = this.choose(); if (!it) { this.t = 0.2; break; }
          const rad = (w.cfg.touchR * it.size) * this.p.grabSpread, a = r.float(0, TAU), rr = Math.sqrt(r.next()) * rad;
          this.item = it; this.gox = Math.cos(a) * rr; this.goy = Math.sin(a) * rr; this.phase = 'reach'; this.path(it.x + this.gox, it.y + this.goy);
        }
        break;
      case 'reach': {
        const it = this.item;
        if (!it || !(it.state === 'idle' || it.state === 'return')) { this.phase = 'wait'; this.t = 0.3; break; }
        if (this.move(dt, it.x + this.gox, it.y + this.goy)) {
          this.f.down = true; const id = w.pointerDown(this.f.x, this.f.y);
          if (!id) { this.stats.failedGrabs++; w.pointerUp(this.f.x, this.f.y); this.f.down = false; this.phase = 'wait'; this.t = 0.4; break; }
          this.stats.grabs++; this.item = w.itemById(id); this.g = this.goal(this.item);
          this.phase = 'carry';
          if (this.g.kind === 'midway') {
            const b = this.g.b, u = r.float(0.3, 0.65);
            this.path(this.f.x + (b.x - this.f.x) * u, this.f.y + (b.y - this.f.y) * u);
          } else this.path(this.g.x, this.g.y);
        }
        w.pointerMove(this.f.x, this.f.y);
        break;
      }
      case 'carry':
        if (!w.held) { this.f.down = false; this.phase = 'wait'; this.t = this.react(); break; }
        if (this.move(dt)) { this.phase = 'settle'; this.t = r.float(0.05, 0.25); }
        w.pointerMove(this.f.x, this.f.y);
        break;
      case 'settle':
        this.t -= dt;
        if (this.t <= 0) { w.pointerUp(this.f.x, this.f.y); this.f.down = false; this.stats.releases++; this.phase = 'wait'; this.t = this.react(); }
        break;
    }
  }
}

/* random tapper: random item → random spot on screen, or taps an item in place, or taps empty space */
class Tapper {
  constructor(w, seed) { this.w = w; this.r = new SG.RNG(seed); this.f = { x: 300, y: 300, down: false }; this.phase = 'wait'; this.t = 1; this.stats = { taps: 0, drags: 0 }; }
  step(dt) {
    const w = this.w, r = this.r, L = w.layout;
    if (w.state === 'talk') { if (!w.talkAnswered) { this.t -= dt; if (this.t <= 0) { w.talkAnswer(r.pick(w.talk.choices).id); this.t = 1; } } return; }
    if (w.state !== 'round' || !w.interactive) { if (this.f.down) { w.pointerUp(this.f.x, this.f.y); this.f.down = false; } this.phase = 'wait'; return; }
    if (this.phase === 'wait') {
      this.t -= dt; if (this.t > 0) return;
      const roll = r.next(), its = w.items.filter(i => i.state === 'idle' || i.state === 'return');
      if (roll < 0.15 || !its.length) {       // tap empty space
        const x = r.float(L.ins.left, L.W - L.ins.right), y = r.float(L.ins.top, L.H - L.ins.bottom);
        w.pointerDown(x, y); w.pointerUp(x, y); this.t = r.float(0.3, 1.5); return;
      }
      const it = r.pick(its);
      this.f.x = it.x + r.float(-10, 10); this.f.y = it.y + r.float(-10, 10); this.f.down = true;
      if (!w.pointerDown(this.f.x, this.f.y)) { this.f.down = false; this.t = 0.3; return; }
      if (roll < 0.45) { this.phase = 'tap'; this.t = r.float(0.06, 0.18); this.stats.taps++; }
      else {
        this.phase = 'drag'; this.stats.drags++;
        const tx = r.float(L.ins.left + 10, L.W - L.ins.right - 10), ty = r.float(L.ins.top + 10, L.H - L.ins.bottom - 10);
        const d = hyp(tx - this.f.x, ty - this.f.y), sp = r.float(600, 1200);
        this.pth = { x0: this.f.x, y0: this.f.y, x1: tx, y1: ty, T: Math.max(0.1, d / sp), t: 0 };
      }
      return;
    }
    if (this.phase === 'tap') { this.t -= dt; w.pointerMove(this.f.x, this.f.y); if (this.t <= 0) { w.pointerUp(this.f.x, this.f.y); this.f.down = false; this.phase = 'wait'; this.t = r.float(0.3, 1.5); } return; }
    if (this.phase === 'drag') {
      const p = this.pth; p.t = Math.min(p.T, p.t + dt); const u = p.t / p.T;
      this.f.x = p.x0 + (p.x1 - p.x0) * u; this.f.y = p.y0 + (p.y1 - p.y0) * u; w.pointerMove(this.f.x, this.f.y);
      if (u >= 1) { w.pointerUp(this.f.x, this.f.y); this.f.down = false; this.phase = 'wait'; this.t = r.float(0.3, 1.5); }
    }
  }
}

/* spammer: rapid grab/release, grabs items in every state, flings to nests, multi-grab attempts, cancels */
class Spammer {
  constructor(w, seed) { this.w = w; this.r = new SG.RNG(seed); this.f = { x: 300, y: 300, down: false }; this.t = 0.1; this.stats = { downs: 0, grabs: 0, multi: 0, cancels: 0, flings: 0 }; }
  step(dt) {
    const w = this.w, r = this.r, L = w.layout;
    if (w.state === 'talk') { if (!w.talkAnswered) { w.talkAnswer(r.pick(w.talk.choices).id); w.talkAnswer(r.pick(w.talk.choices).id); } return; }
    if (w.state !== 'round') { if (this.f.down && r.chance(0.5)) { w.pointerUp(this.f.x, this.f.y); this.f.down = false; } }
    this.t -= dt; if (this.t > 0) { if (this.f.down) w.pointerMove(this.f.x + r.float(-30, 30), this.f.y + r.float(-30, 30)); return; }
    this.t = r.float(0.03, 0.22);
    const roll = r.next(), all = w.items;
    if (w.held) {
      if (roll < 0.15) { const o = r.pick(all); if (o) { w.pointerDown(o.x, o.y); this.stats.multi++; } return; }      // 2nd finger
      if (roll < 0.2) { w.cancelDrag(); this.f.down = false; this.stats.cancels++; return; }
      const b = r.pick(w.baskets) || { x: 300, y: 300, w: 100, h: 60 };
      this.f.x = b.x + r.float(-0.6, 0.6) * b.w; this.f.y = b.y + r.float(-1.5, 0.6) * b.h;        // teleport (fling) + release
      w.pointerMove(this.f.x, this.f.y); w.pointerUp(this.f.x, this.f.y); this.f.down = false; this.stats.flings++; return;
    }
    const o = all.length ? r.pick(all) : null;
    const x = o && roll < 0.8 ? o.x + r.float(-8, 8) : r.float(0, L.W), y = o && roll < 0.8 ? o.y + r.float(-8, 8) : r.float(0, L.H);
    this.f.x = x; this.f.y = y; this.f.down = true; this.stats.downs++;
    if (w.pointerDown(x, y)) this.stats.grabs++;
    if (r.chance(0.3)) { w.pointerUp(x, y); this.f.down = false; }
  }
}

/* SG.Bot wrapper */
class BotDriver { constructor(w, skill, seed) { this.b = new SG.Bot(w, { skill, seed }); this.stats = this.b.stats; } step(dt) { this.b.step(dt); } }

function makeDriver(name, w, age, seed) {
  if (name.startsWith('bot')) return new BotDriver(w, +name.slice(3), seed);
  if (name === 'tapper') return new Tapper(w, seed);
  if (name === 'spammer') return new Spammer(w, seed);
  const prof = name === 'typical' ? typicalProfile(age) : KID_PROFILES[name];
  if (!prof) throw new Error('unknown driver ' + name);
  return new Kid(w, prof, seed);
}

/* ---------------------------------------------------------------- session runner */
function runSession(o) {
  const age = o.age, lang = o.lang || 'en', vp = VIEWPORTS[o.vp || 'ipadL'], seed = o.seed || 1, dt = o.dt || 1 / 30;
  const maxTime = o.maxTime || 1800, roundCap = o.roundCap || 300;
  const w = new SG.World({ seed, age, lang, config: o.config || {} });
  const hooks = o.hooks || {};
  w.setViewport(vp.W, vp.H, vp.ins);
  const drv = makeDriver(o.driver, w, age, seed * 7919 + 13);
  const sp = new SpeechModel(lang, new SG.RNG(seed + 5), o.speechPolicy);
  const m = {
    age, lang, vp: o.vp, driver: o.driver, seed, sessionTime: null, done: false, stars: 0,
    rounds: [], chapters: [], hints: 0, autoHints: 0, idles: 0, idleGaps: [], misses: 0, wrongs: 0, corrects: 0, grabs: 0,
    drops: 0, nearDrops: 0, nearMisses: 0, nearMissDists: [], stuck: [], invariant: [], unreachable: 0, tapHazard: 0, itemsSeen: 0,
    speechEvents: [], talkStates: [], content: [], errors: [], packShrinkMin: 1, packFail: 0
  };
  let rd = null, ch = null, lastIdleT = null, lastProgressT = 0, t = 0;
  const L = () => w.layout;

  function checkHomes() {
    const Ly = L(), ins = Ly.ins, hud = Ly.hud;
    m.packShrinkMin = Math.min(m.packShrinkMin, w.packShrink); if (!w.packOk) m.packFail++;
    for (const it of w.items) {
      m.itemsSeen++;
      const half = it.size / 2, x = it.homeX, y = it.homeY;
      const out = x - half < ins.left || x + half > Ly.W - ins.right || y - half < ins.top || y + half > Ly.H - ins.bottom;
      const underHud = x + half > hud.x && y - half < hud.y + hud.h;
      const b = Ly.lumi, underBo = Math.abs(x - b.x) < 60 + half && y - half < b.y && y + half > b.y - b.h;
      if (out || underHud || underBo) m.unreachable++;
      if (w.potAt(x, y)) m.tapHazard++;            // a tap-in-place on this item is judged as a drop into a pot
    }
  }

  w.newSession();
  let evs = w.drainEvents();
  const handle = (e) => {
    if (hooks.onEvent) hooks.onEvent(e, w, ch);
    sp.onEvent(e, w);
    const speechTypes = { grab: 1, correct: 1, wrong: 1, miss: 1, bloom: 1, ask: 1, hint: 1, idle: 1, roundDone: 1 };
    if (speechTypes[e.type]) m.speechEvents.push({ t: w.time, type: e.type });
    switch (e.type) {
      case 'level':
        if (ch) ch.end = w.time;
        ch = { level: e.level, topic: e.topic, start: w.time, end: null, stars: 0 }; m.chapters.push(ch); break;
      case 'round':
        rd = { level: w.level, round: e.round, topic: e.topic, mode: e.mode, start: w.time, interactiveAt: null, firstCorrect: null, end: null,
          items: w.items.length, nests: w.baskets.length, wrong: 0, miss: 0, hints: 0, idles: 0, stars: 0 };
        m.rounds.push(rd); lastProgressT = w.time; lastIdleT = null;
        m.content.push({ level: w.level, round: e.round, topic: e.topic, labels: w.baskets.map(b => b.label.value), need: w.baskets[0].need,
          items: w.items.map(i => i.nameValue), color: e.params && e.params.color, n: e.params && e.params.n, queue: w.cur && w.cur.queue });
        checkHomes();
        break;
      case 'grab': m.grabs++; break;
      case 'correct': m.corrects++; if (rd && rd.firstCorrect === null) rd.firstCorrect = w.time - rd.start; lastProgressT = w.time; break;
      case 'wrong': m.wrongs++; if (rd) rd.wrong++; break;
      case 'miss': m.misses++; if (rd) rd.miss++; break;
      case 'hint': m.hints++; if (rd) rd.hints++; break;
      case 'idle': m.idles++; if (rd) rd.idles++; if (lastIdleT !== null) m.idleGaps.push(w.time - lastIdleT); lastIdleT = w.time; break;
      case 'roundDone': if (rd) { rd.end = w.time; rd.stars = e.stars; } if (ch) ch.stars += e.stars; break;
      case 'talk': m.talkStates.push({ start: w.time, answered: null }); break;
      case 'talkResult': { const ts = m.talkStates[m.talkStates.length - 1]; if (ts) ts.answered = w.time - ts.start; if (ch && e.correct) ch.stars += 1; break; }
      case 'sessionDone': m.done = true; m.sessionTime = w.time; m.stars = e.stars; if (ch) ch.end = w.time; break;
    }
  };
  // instrument drops: classify the drop point before the world consumes it
  const origUp = w.pointerUp.bind(w);
  w.pointerUp = function (x, y) {
    const held = w.held ? w.itemById(w.held) : null;
    if (held && held.state === 'drag' && w.state === 'round') {
      const fx = x !== undefined ? x : w.finger.x, fy = y !== undefined ? y : w.finger.y;
      const d = Math.min(nearestNestDist(w, held.x, held.y), nearestNestDist(w, fx, fy));
      const hitZone = !!(w.potAt(held.x, held.y) || w.potAt(fx, fy));
      m.drops++;
      if (d <= 40) { m.nearDrops++; if (!hitZone) { m.nearMisses++; m.nearMissDists.push(d); } }
    }
    return origUp(x, y);
  };

  try {
    for (const e of evs) handle(e);
    while (t < maxTime && w.state !== 'sessionDone') {
      drv.step(dt); w.update(dt); t += dt; sp.advance(w.time);
      evs = w.drainEvents(); for (const e of evs) handle(e);
      if (w.state === 'round' && w.interactive && rd) {
        if (rd.interactiveAt === null) rd.interactiveAt = w.time - rd.start;
        if (w.time - rd.start > roundCap && !rd.stuckFlag) { rd.stuckFlag = true; m.stuck.push({ kind: 'slow', level: w.level, round: w.round, topic: w.topic, t: w.time }); }
        // structural stuck: nothing grabbable / in flight while the round is not finished
        const live = w.items.some(i => i.state === 'idle' || i.state === 'return' || i.state === 'drag' || i.state === 'fly' || i.state === 'appear');
        if (!live && !w._roundEnded && !w.completing) m.stuck.push({ kind: 'noProgress', level: w.level, round: w.round, topic: w.topic, t: w.time });
        for (const it of w.items) if (!isFinite(it.x) || !isFinite(it.y)) { m.invariant.push('NaN ' + it.id); break; }
        for (const b of w.baskets) if (b.reserved > b.slots.length || (b.need && b.count > b.need)) m.invariant.push('overfull ' + b.id);
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

module.exports = { SG, VIEWPORTS, runSession, makeDriver, KID_PROFILES, typicalProfile, SpeechModel, mean, pct, f1, f0, fp, maxRate, nestRect, nearestNestDist, hyp };
