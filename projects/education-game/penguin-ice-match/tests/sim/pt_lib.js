// Dee's Forest Memory — high-speed playtest harness v2 (report-only; never edits game code).
// Adds to tests/sim/lib.js: extra child models (weak4, impatient4, repeat4, spam4 anywhere, spam4c on cards, stuck1),
// a per-phase time ledger (waiting vs playing), reward crowding at the end of each chapter (final perch boxes),
// card size per round, wasted taps (taps while the game is not listening).
//   const P = require('./pt_lib'); const m = P.run({ age, lang, vp, driver, seed, config });
'use strict';
const L = require('./lib');
const IM = L.IM;

const VP = Object.assign({}, L.VIEWPORTS, {
  wide: { W: 1600, H: 720, ins: { top: 0, right: 108, bottom: 38, left: 108 } }   // the longest landscape (clamp 1600), notch insets
});

// extra profiles for the generic memory Kid of lib.js
const T4 = L.typicalProfile(4);
Object.assign(L.KID_PROFILES, {
  // careful 4-year-old who forgets half of what she sees (peek and own flips remembered with p 0.5), always waits
  weak4: Object.assign({}, T4, { peekRecall: 0.5 * 0.6, flipRecall: 0.5, tau: 25, pRandom: 0.1, patience: 1.0,
    reaction: [1.6, 3.0], afterFlip: [0.8, 1.4], pDistract: 0.1 }),
  // impatient 4-year-old: taps a third card right away after a mismatch, short pauses
  impatient4: Object.assign({}, T4, { patience: 0.0, reaction: [0.35, 0.8], afterFlip: [0.2, 0.5], listen: [0.6, 1.2] })
});

/* taps the same card again and again: picks a face-down card, taps it `reps` times (0.5–0.9 s apart), then makes one
   memory move like a typical 4-year-old, then fixes on a new card. */
class Repeater {
  constructor(w, seed, reps) {
    this.w = w; this.r = new IM.RNG(seed); this.reps = reps; this.t = 2; this.fix = null; this.n = 0;
    this.kid = L.makeDriver('typical', w, 4, seed + 1); this.stats = { taps: 0, repeat: 0 };
    this.mode = 'fix';
  }
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state !== 'round' || (w.phase !== 'play' && w.phase !== 'resolve')) { this.kid.step(dt); this.fix = null; return; }
    if (this.mode === 'kid') {           // one normal move then back to fixation
      const before = this.kid.stats.taps; this.kid.step(dt);
      if (this.kid.stats.taps > before) { this.mode = 'fix'; this.fix = null; this.t = r.float(0.6, 1.2); }
      return;
    }
    this.kid.observe && this.kid.observe();
    this.t -= dt; if (this.t > 0) return; this.t = r.float(0.5, 0.9);
    if (!this.fix || this.fix.state === 'gone' || this.fix.state === 'matched') {
      const live = w.cards.filter(c => c.state === 'down'); if (!live.length) return;
      this.fix = r.pick(live); this.n = 0;
    }
    w.pointerDown(this.fix.x, this.fix.y); w.pointerUp(this.fix.x, this.fix.y); this.stats.taps++; this.stats.repeat++;
    if (++this.n >= this.reps) this.mode = 'kid';
  }
}

/* taps one card forever (stress: does the game ever help?) */
class Stuck1 {
  constructor(w, seed) { this.w = w; this.t = 1; this.stats = { taps: 0 }; this.fix = null; }
  step(dt) {
    const w = this.w; this.t -= dt; if (this.t > 0) return; this.t = 0.7;
    if (w.state === 'talk') { if (!w.talkAnswered) w.talkAnswer(w.talk.answerId); return; }
    if (w.state !== 'round') { this.fix = null; return; }
    if (!this.fix || this.fix.state === 'gone') this.fix = w.cards.find(c => c.state !== 'gone' && c.state !== 'deal') || null;
    if (!this.fix) return;
    w.pointerDown(this.fix.x, this.fix.y); w.pointerUp(this.fix.x, this.fix.y); this.stats.taps++;
  }
}

/* 4 taps/s; 'anywhere' = uniform over the screen, 'cards' = on a random live card ± 15 px */
class Spam4 {
  constructor(w, seed, onCards) { this.w = w; this.r = new IM.RNG(seed); this.t = 0.25; this.on = onCards; this.stats = { taps: 0 }; }
  step(dt) {
    const w = this.w, r = this.r, Lo = w.layout;
    this.t -= dt; if (this.t > 0) return; this.t += 0.25;
    if (w.state === 'talk') { if (!w.talkAnswered) w.talkAnswer(r.pick(w.talk.choices).id); return; }
    let x = r.float(0, Lo.W), y = r.float(0, Lo.H);
    if (this.on) { const live = w.cards.filter(c => c.state === 'down' || c.state === 'up'); if (live.length) { const c = r.pick(live); x = c.x + r.float(-15, 15); y = c.y + r.float(-15, 15); } }
    this.stats.taps++; w.pointerDown(x, y); w.pointerUp(x, y);
  }
}

function makeDriver(name, w, age, seed) {
  if (name === 'repeat4') return new Repeater(w, seed, 4);
  if (name === 'stuck1') return new Stuck1(w, seed);
  if (name === 'spam4') return new Spam4(w, seed, false);
  if (name === 'spam4c') return new Spam4(w, seed, true);
  return L.makeDriver(name, w, age, seed);
}

const ovA = (a, b) => { const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0 ? w * h : 0; };

function run(o) {
  const age = o.age, vpn = o.vp || 'ipadL', vp = VP[vpn], seed = o.seed || 1, dt = o.dt || 1 / 30, maxTime = o.maxTime || 1800;
  const w = new IM.World({ seed, age, lang: o.lang || 'en', config: o.config || {} });
  w.setViewport(vp.W, vp.H, vp.ins);
  const drv = makeDriver(o.driver, w, age, seed * 7919 + 13);
  const m = { age, lang: o.lang || 'en', vp: vpn, driver: o.driver, seed, done: false, sessionTime: null, stars: 0,
    ledger: {}, rounds: [], chapters: [], hints: 0, idleHints: 0, idles: 0, mismatches: 0, matches: 0, taps: 0, deadTaps: 0,
    crowd: [], cards: [], errors: [], maxNoHelp: 0, firstHintAt: [] };
  let rd = null, ch = null, t = 0, lastTouch = 0;
  // count taps (and dead taps: the game is not listening) by wrapping pointerDown
  const pd = w.pointerDown.bind(w);
  w.pointerDown = (x, y) => {
    m.taps++;
    const listening = w.state === 'round' && !w.solved && (w.phase === 'play' || w.phase === 'resolve');
    if (!listening && w.state !== 'talk') m.deadTaps++;
    return pd(x, y);
  };
  const crowd = () => {      // final perch boxes of the chapter's rewards: share overlapping > 40 % of the smaller box
    const B = w.rewards.filter(r => r.target).map(r => r.target.box), n = B.length; let bad = 0;
    for (let i = 0; i < n; i++) { let hit = false; for (let j = 0; j < n && !hit; j++) if (i !== j) { const a = ovA(B[i], B[j]); if (a > 0.4 * Math.min(B[i].w * B[i].h, B[j].w * B[j].h)) hit = true; } if (hit) bad++; }
    const air = w.rewards.filter(r => r.perch && r.perch.kind === 'air').length;
    m.crowd.push({ level: w.level, n, bad, air });
  };
  const handle = (e) => {
    switch (e.type) {
      case 'level': ch = { level: e.level, topic: e.topic, start: w.time, end: null, rounds: 0, stars: 0 }; m.chapters.push(ch); break;
      case 'round': rd = { l: w.level, r: e.round, topic: e.topic, pairs: e.pairs, start: w.time, playAt: null, end: null, mm: 0, hints: 0, idles: 0, stars: 0, held: e.held }; m.rounds.push(rd); if (ch) ch.rounds++; break;
      case 'play': if (rd) rd.playAt = w.time; if (w.layout.grid) m.cards.push({ age, vp: vpn, pairs: w.pairs, cw: w.layout.grid.cw, grid: w.layout.grid.cols + 'x' + w.layout.grid.rows }); break;
      case 'match': m.matches++; break;
      case 'mismatch': m.mismatches++; if (rd) rd.mm++; break;
      case 'hint': m.hints++; if (e.idle) m.idleHints++; if (rd) { if (!rd.hints && rd.playAt !== null) m.firstHintAt.push(w.time - rd.playAt); rd.hints++; } break;
      case 'idle': m.idles++; if (rd) rd.idles++; break;
      case 'roundDone': if (rd) { rd.end = w.time; rd.stars = e.stars; } if (ch) ch.stars += e.stars; break;
      case 'talk': crowd(); break;
      case 'talkResult': if (ch && e.correct) ch.stars++; break;
      case 'levelDone': if (ch) ch.end = w.time; break;
      case 'sessionDone': m.done = true; m.sessionTime = w.time; m.stars = e.stars; break;
    }
  };
  try {
    w.newSession(); for (const e of w.drainEvents()) handle(e);
    let helpT = 0, lastHelp = 0;
    while (t < maxTime && w.state !== 'sessionDone') {
      const key = w.state === 'round' ? 'round.' + (w._mis ? 'mismatchShow' : w.phase) : (w.state === 'talk' ? (w.talkAnswered ? 'talk.after' : 'talk.ask') : w.state);
      m.ledger[key] = (m.ledger[key] || 0) + dt;
      drv.step(dt); w.update(dt); t += dt;
      for (const e of w.drainEvents()) { handle(e); if (e.type === 'hint' || e.type === 'match') lastHelp = w.time; }
      if (w.state === 'round' && w.phase === 'play') m.maxNoHelp = Math.max(m.maxNoHelp, w.time - Math.max(lastHelp, rd ? rd.playAt || 0 : 0));
    }
  } catch (err) { m.errors.push(String(err && err.stack || err)); }
  m.endState = w.state; m.simTime = t; m.driverStats = drv.stats;
  return m;
}

const mean = L.mean, pct = L.pct;
module.exports = { IM, L, VP, run, makeDriver, mean, pct };
