// Kitten's Balloon Farm — high-speed playtester: extra child models, extra metrics, a model of main.js speech and
// optional "proposal" rules (report-only: never edits game/). Used by pt_run.js / pt_absent.js.
//   const P = require('./pt_kids'); const m = P.run({ age: 4, driver: 'careful4', vp: 'iphoneP', seed: 1, config: {}, rules: {} });
// Children act ONLY through world.pointerDown / pointerUp / talkAnswer at realistic positions and reaction times.
'use strict';
const L = require('./lib');
const KB = L.KB;
// extra viewport: short landscape at the logical maximum width (e.g. a 20:9 Android / desktop window), no insets
L.VIEWPORTS.shortL = { W: 1600, H: 720, ins: { top: 0, right: 0, bottom: 0, left: 0 } };
const TAU = Math.PI * 2;
const hyp = (x, y) => Math.sqrt(x * x + y * y);

/* ---------------------------------------------------------------- proposal rules (re-simulation only)
 * Rules that cannot be expressed as a KB.CONFIG override are emulated by wrapping World methods per instance, exactly as
 * the proposed world.js code would behave:
 *   wrongLock s     after a wrong tap, ALL balloons ignore taps for s (no mistake counted, no speech) — anti-spam
 *   countGap s      count mode: a pop within s of the previous pop is ignored (Miu can finish saying the number)
 *   idleGlowFrom k  the k-th idle nudge of a round also glows the (next) target (hint for a child who is stuck/shy)
 *   hitBelow f      the hit area also covers the knot + top of the string: a tap up to f × size below the centre and
 *                   within 0.35 × size sideways counts for that balloon (nearest-centre rule kept)
 */
function applyRules(w, R) {
  if (!R) return;
  const down0 = w.pointerDown.bind(w);
  w._ptLockUntil = -1; w._ptLastPop = -1e9;
  w.pointerDown = function (x, y) {
    if (this.state === 'round' && !this.solved && !this._roundEnded) {
      if (R.wrongLock && this.time < this._ptLockUntil) { this._idleT = 0; this._idleGap = this.cfg.idleTime; this._ptLocked = (this._ptLocked || 0) + 1; return null; }
      if (R.countGap && this.cur && this.cur.mode === 'count' && this.time - this._ptLastPop < R.countGap) { this._idleT = 0; this._ptLocked = (this._ptLocked || 0) + 1; return null; }
      if (R.hitBelow) {
        // if the tap is on a knot/string zone of a tappable balloon and not inside any normal hit circle, move it onto that balloon
        const cfg = this.cfg; let inCircle = false, best = null, bd = 1e9;
        for (const b of this.balloons) {
          if (!this.canTap(b)) continue;
          const d = hyp(x - b.x, y - b.y);
          if (d <= cfg.touchR * b.size + cfg.touchPad) inCircle = true;
          const dy = y - b.y;
          if (dy > 0 && dy <= R.hitBelow * b.size && Math.abs(x - b.x) <= 0.35 * b.size && d < bd) { bd = d; best = b; }
        }
        if (!inCircle && best) { x = best.x; y = best.y + 0.3 * best.size; }
      }
    }
    const n0 = this.events.length, id = down0(x, y);
    for (let i = n0; i < this.events.length; i++) {
      const e = this.events[i];
      if (e.type === 'wrong' && R.wrongLock) this._ptLockUntil = this.time + R.wrongLock;
      if (e.type === 'correct') this._ptLastPop = this.time;
    }
    return id;
  };
  if (R.idleGlowFrom) {
    const emit0 = w._emit.bind(w);
    w._ptIdleN = 0;
    w._emit = function (e) {
      if (e.type === 'round') this._ptIdleN = 0;
      emit0(e);
      if (e.type === 'idle' && ++this._ptIdleN >= R.idleGlowFrom) { const t = this._hintTarget(); if (t && t.glowT <= 0) this._glow(t); }
    };
  }
}

/* ---------------------------------------------------------------- child models (all via pointerDown) */
const CHILD = {
  // careful 4-year-old: listens to the whole prompt, looks, then taps the centre of a right balloon
  careful4: { listen: [2.8, 4.0], reaction: [1.6, 2.8], afterPop: [0.5, 1.0], speed: [450, 700], pRight: 0.93, aim: 0.45, pDistract: 0.08, distract: [3, 7],
    talkDelay: [3, 5], talkRight: 0.85 },
  // slow 3-year-old: a tap every 3–6 s, 35 % of taps go to a random balloon (no understanding), aims loosely
  slow3b: { listen: [3, 5], reaction: [3, 6], afterPop: [0, 0], speed: [250, 450], pRight: 1, pRandom: 0.35, aim: 0.95, pDistract: 0.25, distract: [5, 12],
    talkDelay: [4, 9], talkRight: 0.5 },
  // "string tapper": a 3–4-year-old who points at the knot / string, 0.7 × size below the centre (± a finger)
  string: { listen: [2.6, 3.6], reaction: [1.5, 2.6], afterPop: [0.3, 0.8], speed: [400, 650], pRight: 0.85, aimDy: 0.7, aim: 0.3, pDistract: 0.1, distract: [4, 8],
    talkDelay: [3, 5], talkRight: 0.75 },
  // eager child: taps the right balloon the instant it appears, while it is still rising (finger 0.15–0.35 s behind)
  eager: { listen: [0, 0], reaction: [0.5, 1.0], afterPop: [0, 0.3], speed: [700, 1000], pRight: 0.85, aim: 0.5, pDistract: 0, distract: [0, 0], rise: true,
    talkDelay: [1.5, 3], talkRight: 0.8 }
};

class Child {
  constructor(w, p, seed) {
    this.w = w; this.p = p; this.r = new KB.RNG(seed); this.f = { x: w.layout.W / 2, y: w.layout.H / 2 };
    this.phase = 'wait'; this.t = 0; this.talkT = -1; this.lastKey = ''; this.stats = { taps: 0, misses: 0, riseIgnored: 0, popWhileRising: 0 };
  }
  rf(a) { return this.r.float(a[0], a[1]); }
  isRight(b) { const w = this.w, m = w.cur.mode; return m === 'count' || (m === 'ask' ? b.id === w.target : b.answer); }
  step(dt) {
    const w = this.w, r = this.r, p = this.p;
    if (w.state === 'talk') {
      if (w.talkAnswered) return;
      if (this.talkT < 0) this.talkT = this.rf(p.talkDelay);
      if ((this.talkT -= dt) <= 0) {
        this.talkT = -1; let pick = w.talk.answerId;
        if (!r.chance(p.talkRight)) { const o = w.talk.choices.filter(c => c.id !== w.talk.answerId); if (o.length) pick = r.pick(o).id; }
        w.talkAnswer(pick);
      }
      return;
    }
    this.talkT = -1;
    if (w.state !== 'round') { this.phase = 'wait'; this.lastKey = ''; return; }
    const key = w.level + ':' + w.round + ':' + (w.target || '');
    if (key !== this.lastKey) {
      const newRound = !this.lastKey || this.lastKey.split(':')[1] !== String(w.round);
      this.lastKey = key; this.phase = 'wait';
      this.t = this.rf(p.listen) * (newRound ? 1 : 0.6);
      if (newRound && p.pDistract && r.chance(p.pDistract)) this.t += this.rf(p.distract);
    }
    if (this.phase === 'wait') {
      if ((this.t -= dt) > 0) return;
      // eager: any visible balloon (rising ones too); others: only balloons that look settled-ish (tappable)
      const vis = w.balloons.filter(b => (p.rise ? (b.state === 'rise' && b.t >= 0) || b.state === 'float' : w.canTap(b)) && b.popT < 0);
      if (!vis.length) { this.t = 0.15; return; }
      const right = vis.filter(b => this.isRight(b)), wrong = vis.filter(b => !this.isRight(b));
      let b;
      if (p.pRandom && r.chance(p.pRandom)) b = r.pick(vis);
      else b = right.length && (r.chance(p.pRight) || !wrong.length) ? r.pick(right) : wrong.length ? r.pick(wrong) : r.pick(right);
      const rad = (w.cfg.touchR * b.size + w.cfg.touchPad) * p.aim, a = r.float(0, TAU), rr = Math.sqrt(r.next()) * rad;
      this.target = b; this.ox = Math.cos(a) * rr; this.oy = Math.sin(a) * rr + (p.aimDy || 0) * b.size;
      const d = hyp(b.x - this.f.x, b.y - this.f.y); this.T = Math.max(p.rise ? 0.15 : 0.2, d / this.rf(p.speed)); this.tt = 0;
      if (p.rise) this.T = Math.min(this.T, this.r.float(0.15, 0.35));
      this.x0 = this.f.x; this.y0 = this.f.y; this.phase = 'reach';
      return;
    }
    const b = this.target;
    this.tt += dt; const u = Math.min(1, this.tt / this.T), s = u * u * (3 - 2 * u);
    this.f.x = this.x0 + (b.x + this.ox - this.x0) * s; this.f.y = this.y0 + (b.y + this.oy - this.y0) * s;
    if (u < 1) return;
    this.stats.taps++;
    const wasRising = b.state === 'rise' && !w.canTap(b);
    if (b.state === 'rise') this.stats.tapOnRising = (this.stats.tapOnRising || 0) + 1;
    const n0 = w.events.length, id = w.pointerDown(this.f.x, this.f.y);
    w.pointerUp(this.f.x, this.f.y);
    if (id == null) { this.stats.misses++; if (wasRising) this.stats.riseIgnored++; }
    const popped = w.events.slice(n0).some(e => e.type === 'correct');
    if (popped && b.state === 'rise') this.stats.popWhileRising++;
    this.phase = 'wait';
    // a missed tap on a rising balloon: an eager child immediately tries again
    this.t = id == null && p.rise ? 0.25 : this.rf(p.reaction) + (popped ? this.rf(p.afterPop) : 0);
  }
}

/* random tapper: taps the centre of a random tappable balloon every 0.8–2 s (no understanding at all) */
class RandomTapper {
  constructor(w, seed) { this.w = w; this.r = new KB.RNG(seed); this.t = 1.5; this.stats = { taps: 0, misses: 0 }; }
  step(dt) {
    const w = this.w, r = this.r;
    if ((this.t -= dt) > 0) return; this.t = r.float(0.8, 2);
    if (w.state === 'talk') { if (!w.talkAnswered) w.talkAnswer(r.pick(w.talk.choices).id); return; }
    if (w.state !== 'round') return;
    const live = w.balloons.filter(b => w.canTap(b)); if (!live.length) return;
    const b = r.pick(live), x = b.x + r.float(-25, 25), y = b.y + r.float(-25, 25);
    this.stats.taps++; if (w.pointerDown(x, y) == null) this.stats.misses++; w.pointerUp(x, y);
  }
}
/* spammer: taps ANYWHERE on the screen 4×/s (uniform over the safe area), answers Talk at random */
class Spammer4 {
  constructor(w, seed) { this.w = w; this.r = new KB.RNG(seed); this.t = 0.25; this.stats = { taps: 0, misses: 0 }; }
  step(dt) {
    const w = this.w, r = this.r, Ly = w.layout;
    if ((this.t -= dt) > 0) return; this.t = r.float(0.2, 0.3);
    if (w.state === 'talk') { if (!w.talkAnswered && r.chance(0.5)) w.talkAnswer(r.pick(w.talk.choices).id); return; }
    const x = r.float(Ly.ins.left, Ly.W - Ly.ins.right), y = r.float(Ly.ins.top, Ly.H - Ly.ins.bottom);
    this.stats.taps++; if (w.pointerDown(x, y) == null) this.stats.misses++; w.pointerUp(x, y);
  }
}
/* balloon spammer: hammers balloons 4×/s (aims at a random balloon, any state) */
class BalloonSpammer {
  constructor(w, seed) { this.w = w; this.r = new KB.RNG(seed); this.t = 0.25; this.stats = { taps: 0, misses: 0 }; }
  step(dt) {
    const w = this.w, r = this.r;
    if ((this.t -= dt) > 0) return; this.t = r.float(0.2, 0.3);
    if (w.state === 'talk') { if (!w.talkAnswered && r.chance(0.5)) w.talkAnswer(r.pick(w.talk.choices).id); return; }
    const vis = w.balloons.filter(b => b.state === 'rise' || b.state === 'float'); if (!vis.length) return;
    const b = r.pick(vis), x = b.x + r.float(-20, 20), y = b.y + r.float(-20, 20);
    this.stats.taps++; if (w.pointerDown(x, y) == null) this.stats.misses++; w.pointerUp(x, y);
  }
}

function makeDriver(name, w, age, seed) {
  if (CHILD[name]) return new Child(w, CHILD[name], seed);
  if (name === 'random') return new RandomTapper(w, seed);
  if (name === 'spam4') return new Spammer4(w, seed);
  if (name === 'bspam') return new BalloonSpammer(w, seed);
  return L.makeDriver(name, w, age, seed);   // typical / toddler / slow3 / tapper / spammer / absent / botX
}

/* ---------------------------------------------------------------- model of main.js speech (onEvent)
 * Lines and options exactly as main.js: round (priority), ask (first: priority; next: dropQueued + plain), correct (count:
 * interrupt, else praise if ≥ 1.2 s since the last, interrupt), wrong (interrupt), hint (plain), idle (first 4 per round),
 * roundDone (plain "great", not in count rounds), talk (interrupt+priority), talkAsk (n ≤ 3, priority), talkResult (interrupt),
 * level (interrupt). Duration estimate = voice.js watchdog estimate 600 + 85·chars/0.92 ms. Voice queue MAXQ 2, stale 5 s. */
// real line texts from game/js/i18n.js (loaded into the same KB object) → realistic durations
(function loadI18N() {
  const fs = require('fs'), path = require('path'), vm = require('vm');
  const sb = { console, Math, Date, JSON }; sb.window = { KB }; vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'game', 'js', 'i18n.js'), 'utf8'), sb, { filename: 'i18n.js' });
})();
const I18N = KB.I18N;
function lineText(kind, e, w) {
  const lang = w.lang, T = (k, p) => I18N.t(lang, k, p || {});
  try {
    switch (kind) {
      case 'level': return T('ui.chapter', { n: e.level + 1 }) + '. ' + T('topic.' + e.topic);
      case 'round': return T(e.promptKey, e.params);
      case 'ask': return T(e.promptKey, e.params);
      case 'askNext': return T('p.animalsNext', e.params);
      case 'count': return I18N.sayCount(lang, e.n, e.need);
      case 'praise': return I18N.sayCorrect(lang, Object.assign({ mode: w.cur && w.cur.mode }, e)) || T('praise');
      case 'wrong': return I18N.sayWrong(lang, e);
      case 'hint': return T('hint');
      case 'idle': { const p = w.prompt(); return T('idle') + ' ' + (p ? T(p.promptKey, p.params) : ''); }
      case 'great': return T('great');
      case 'talk': return T('talk.intro') + ' ' + T(e.talk.promptKey, e.talk.params);
      case 'talkAsk': return T(e.talk.promptKey, e.talk.params);
      case 'talkResult': return T('talk.right');
      case 'session': return T('session.done', { stars: e.stars });
    }
  } catch (err) { /* fall back to the table */ }
  return null;
}
const LINE = { round: 34, ask: 26, askNext: 18, count: 7, countLast: 20, praise: 16, wrong: 38, hint: 22, idle: 48, great: 12, talk: 40,
  talkAsk: 28, talkResult: 22, level: 20, session: 30 };
class SpeechModel {
  constructor(o) { this.o = o || {}; this.cur = null; this.q = []; this.n = { said: 0, done: 0, cut: 0, dropped: 0, by: {}, cutBy: {} }; this.lastPraise = -1e9; this.idleSaid = 0; this.lastWrongSay = -1e9; this.speechTime = 0; }
  dur(chars) { return 0.3 + chars * 0.066 / 0.92; }   // ≈ 14 chars/s at Miu's rate 0.92 (+0.3 s start-up)
  tick(t) {
    while (true) {
      if (this.cur && t >= this.cur.end) { this.n.done++; this.speechTime += this.cur.end - this.cur.start; const e = this.cur.end; this.cur = null; this.startNext(e); continue; }
      if (!this.cur && this.q.length) { this.startNext(t); continue; }
      break;
    }
  }
  startNext(t) {
    while (this.q.length) { const it = this.q.shift(); if (!it.priority && t - it.t > 5) { this.n.dropped++; continue; } this.cur = { kind: it.kind, start: t, end: t + this.dur(it.chars) }; return; }
  }
  say(t, kind, chars, opt) {
    const txt = this._w ? lineText(kind, this._e, this._w) : null; if (txt) { chars = txt.length; this.n.chars = (this.n.chars || 0) + chars; }
    opt = opt || {}; this.tick(t); this.n.said++; this.n.by[kind] = (this.n.by[kind] || 0) + 1;
    const it = { kind, chars, t, priority: !!opt.priority };
    if (opt.interrupt) {
      this.n.dropped += this.q.length; this.q = [];
      if (this.cur) { this.n.cut++; const ck = this.cur.kind + '>' + kind; this.n.cutBy[ck] = (this.n.cutBy[ck] || 0) + 1; this.speechTime += t - this.cur.start; this.cur = null; }
      this.q.push(it); this.tick(t); return;
    }
    this.q.push(it);
    while (this.q.length > 2) { let idx = this.q.findIndex(x => !x.priority); if (idx < 0 || idx === this.q.length - 1) idx = 0; this.q.splice(idx, 1); this.n.dropped++; }
    this.tick(t);
  }
  // proposal speech.protectPrompt: praise / wrong lines never cut Miu's instruction (round / ask prompt); they queue after it
  protect() { return !!(this.o.protectPrompt && this.cur && (this.cur.kind === 'round' || this.cur.kind === 'ask')); }
  onEvent(e, t, w) {
    const o = this.o; this._e = e; this._w = w;
    switch (e.type) {
      case 'level': this.say(t, 'level', LINE.level, { interrupt: true }); break;
      case 'round': this.idleSaid = 0; if (e.mode !== 'ask') this.say(t, 'round', LINE.round, { priority: true }); break;
      case 'ask': if (e.first) this.say(t, 'ask', LINE.ask, { priority: true }); else { this.n.dropped += this.q.length; this.q = []; this.say(t, 'askNext', LINE.askNext); } break;
      case 'correct':
        if (e.need != null && w.cur && w.cur.mode === 'count') { this.say(t, 'count', e.n >= e.need ? LINE.countLast : LINE.count, { interrupt: true }); break; }
        if (t - this.lastPraise < 1.2) break; this.lastPraise = t; this.say(t, 'praise', LINE.praise, { interrupt: !this.protect() }); break;
      case 'wrong':
        if (o.wrongSayGap && t - this.lastWrongSay < o.wrongSayGap) { this.n.by.wrongSilent = (this.n.by.wrongSilent || 0) + 1; break; }
        this.lastWrongSay = t; this.say(t, 'wrong', LINE.wrong, { interrupt: !this.protect() }); break;
      case 'hint': this.say(t, 'hint', LINE.hint); break;
      case 'idle': if (++this.idleSaid <= (o.idleSayMax || 4)) this.say(t, 'idle', LINE.idle); break;
      case 'roundDone': if (!(w.cur && w.cur.mode === 'count')) this.say(t, 'great', LINE.great); break;
      case 'talk': this.say(t, 'talk', LINE.talk, { interrupt: true, priority: true }); break;
      case 'talkAsk': if (e.n <= 3) this.say(t, 'talkAsk', LINE.talkAsk, { priority: true }); break;
      case 'talkResult': this.say(t, 'talkResult', LINE.talkResult, { interrupt: true }); break;
      case 'sessionDone': this.say(t, 'session', LINE.session, { interrupt: true }); break;
    }
  }
}

/* ---------------------------------------------------------------- session runner with extra metrics */
function run(o) {
  const age = o.age, vp = L.VIEWPORTS[o.vp || 'ipadL'] || o.vpObj, seed = o.seed || 1, dt = o.dt || 1 / 30, maxTime = o.maxTime || 1500;
  const w = new KB.World({ seed, age, lang: o.lang || 'en', config: Object.assign({ strings: false }, o.config || {}) });
  w.setViewport(vp.W, vp.H, vp.ins);
  applyRules(w, o.rules);
  const drv = makeDriver(o.driver, w, age, seed * 7919 + 13);
  const sp = new SpeechModel(o.speech);
  const m = { age, vp: o.vp, driver: o.driver, seed, done: false, sessionTime: null, stars: 0, rounds: [], chapters: [], talks: [], errors: [],
    friendIssues: { overlapPairs: 0, offscreen: 0, onSign: 0, maxPerRound: 0, rows2: 0, rounds: 0 }, stuck: 0 };
  let rd = null, ch = null, talk = null;
  const handle = (e) => {
    const t = w.time;
    sp.onEvent(e, t, w);
    switch (e.type) {
      case 'level': if (ch) ch.end = t; ch = { topic: e.topic, start: t, end: null, rounds: 0, stars: 0 }; m.chapters.push(ch); break;
      case 'round':
        rd = { topic: e.topic, mode: e.mode, start: t, n: w.balloons.length, need: e.sign && e.sign.need, firstTap: null, ia: null, end: null, solvedAt: null,
          wrong: 0, hints: 0, idles: 0, stars: 0, pops: 0, away: 0, answerAway: 0, postSolveTaps: 0, firstPopAt: null };
        m.rounds.push(rd); ch.rounds++; break;
      case 'correct': rd.pops++; if (rd.firstPopAt === null) rd.firstPopAt = t - rd.start; break;
      case 'wrong': rd.wrong++; break;
      case 'hint': rd.hints++; break;
      case 'idle': rd.idles++; break;
      case 'roundDone': rd.end = t; rd.stars = e.stars; ch.stars += e.stars; break;
      case 'talk': talk = { start: t, asks: 0, answered: null }; m.talks.push(talk); break;
      case 'talkAsk': talk.asks++; break;
      case 'talkResult': talk.answered = t - talk.start; talk.correct = e.correct; if (e.correct) ch.stars++; break;
      case 'sessionDone': m.done = true; m.sessionTime = t; m.stars = e.stars; ch.end = t; break;
    }
  };
  // instrumentation: count taps that arrive after the round is solved (count overshoot), and away balloons
  const pd = w.pointerDown.bind(w);
  w.pointerDown = function (x, y) {
    if (w.state === 'round' && w.solved && rd) rd.postSolveTaps++;
    return pd(x, y);
  };
  const away0 = w._away.bind(w);
  w._away = function (b) { if (rd && b.state !== 'away') { rd.away++; if (w.cur.mode !== 'count' && b.answer) rd.answerAway++; if (w.cur.mode === 'ask' && w.queue.indexOf(b.id) >= 0) rd.answerAway++; } away0(b); };
  let t = 0, lastFriendCheck = null;
  try {
    w.newSession(); for (const e of w.drainEvents()) handle(e);
    while (t < maxTime && w.state !== 'sessionDone') {
      drv.step(dt); w.update(dt); t += dt;
      for (const e of w.drainEvents()) handle(e);
      sp.tick(w.time);
      if (w.state === 'round' && rd) {
        if (rd.firstTap === null && w.balloons.some(b => w.canTap(b))) rd.firstTap = w.time - rd.start;
        if (rd.ia === null && w.interactive) rd.ia = w.time - rd.start;
        if (w.solved && rd.solvedAt === null) rd.solvedAt = w.time - rd.start;
        if (w.time - rd.start > 300 && !rd.stuck) { rd.stuck = true; m.stuck++; }
      }
      // friends on the yard: check once per round, at the moment all of them rest (or at roundDone)
      if (rd && !rd.fchk && w.friends.length && w.state === 'roundDone') { rd.fchk = true; checkFriends(w, m); }
    }
  } catch (err) { m.errors.push(String(err && err.stack || err)); }
  m.endState = w.state; m.speech = { said: sp.n.said, done: sp.n.done, cut: sp.n.cut, dropped: sp.n.dropped, by: sp.n.by, cutBy: sp.n.cutBy, time: sp.speechTime };
  m.drv = drv.stats; m.locked = w._ptLocked || 0;
  return m;
}
function checkFriends(w, m) {
  const F = w.friends, Ly = w.layout, fi = m.friendIssues, half = w.cfg.friendSize / 2;
  fi.rounds++; fi.maxPerRound = Math.max(fi.maxPerRound, F.length);
  if (F.some(f => f.slot >= Math.max(1, Math.floor((Ly.yard.x1 - Ly.yard.x0) / w.cfg.yardSpacing)))) fi.rows2++;
  for (let i = 0; i < F.length; i++) {
    const a = F[i];
    if (a.tx - half < Ly.ins.left || a.tx + half > Ly.W - Ly.ins.right) fi.offscreen++;
    if (a.tx - half < Ly.sign.x + Ly.sign.w / 2) fi.onSign++;
    for (let j = i + 1; j < F.length; j++) {
      const b = F[j];
      // sprites 84 wide, ≈ 84 tall: overlapping by more than 25 % of the width while < 60 px apart vertically
      if (Math.abs(a.tx - b.tx) < 0.75 * w.cfg.friendSize && Math.abs(a.ty - b.ty) < 60) fi.overlapPairs++;
    }
  }
}

module.exports = { KB, L, run, CHILD, applyRules, SpeechModel, makeDriver };
