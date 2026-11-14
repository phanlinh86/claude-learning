// Koko's Cake Tower — headless playtest harness (report-only; never edits game code).
//   const L = require('./lib'); const m = L.runSession({ age, lang, vp, driver, seed, config });
// Loads rng/content/world/bot into node, drives ONLY the public input API (pointerDown/Move/Up, talkAnswer) like a
// finger, and measures chapter / session times, wrong drops, grass releases, hints, idle nudges, stars, stuck states, NaN.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', '..', 'game', 'js');
function loadJT() {
  // runInThisContext (not a vm sandbox): ≈ 2× faster for long sims; the sim process owns its global scope
  globalThis.window = globalThis;
  for (const f of ['rng.js', 'content.js', 'world.js', 'bot.js']) vm.runInThisContext(fs.readFileSync(path.join(JS, f), 'utf8'), { filename: f });
  return globalThis.CK;
}
const CK = loadJT();

// Logical viewports (short side 720) with safe-area insets converted from CSS px.
const VIEWPORTS = {
  iphoneP: { W: 720, H: 1561, ins: { top: 108, right: 0, bottom: 62, left: 0 } },    // iPhone 393×852
  iphoneL: { W: 1561, H: 720, ins: { top: 0, right: 108, bottom: 38, left: 108 } },
  ipadL:   { W: 960, H: 720, ins: { top: 32, right: 0, bottom: 27, left: 0 } },
  ipadP:   { W: 720, H: 960, ins: { top: 32, right: 0, bottom: 27, left: 0 } },
  ipad11P: { W: 720, H: 1036, ins: { top: 21, right: 0, bottom: 18, left: 0 } },    // iPad 820×1180
  ipad11L: { W: 1036, H: 720, ins: { top: 21, right: 0, bottom: 18, left: 0 } }
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const f1 = x => (+x).toFixed(1);

function tapAt(w, x, y) { const id = w.pointerDown(x, y); const up = w.pointerUp(x, y); return up || id; }
function restingPieces(w) { return w.pieces.filter(p => p.state === 'rest'); }

/** A finger that drags over several frames: press → n moves (stepDt each, on a little arc) → hold → lift. */
class Finger {
  constructor(w, r) { this.w = w; this.r = r; this.d = null; this.x = 0; this.y = 0; }
  get busy() { return !!this.d; }
  /** → pointerDown result (the drag only runs when it hit a piece) */
  start(x0, y0, x1, y1, o) {
    const w = this.w, r = this.r;
    this.x = x0; this.y = y0;
    const res = w.pointerDown(x0, y0);
    if (!res || typeof res !== 'string' || !w.pieceById(res)) { w.pointerUp(x0, y0); return res; }
    this.d = { id: res, x0, y0, x1, y1, n: r.int(o.steps[0], o.steps[1]), i: 0, t: r.float(o.stepDt[0], o.stepDt[1]), o, arc: r.float(0, o.arc || 60) };
    return res;
  }
  /** → null while dragging, else the pointerUp result ('drop' | 'miss' | 'tap' | null) */
  step(dt) {
    const d = this.d, w = this.w, r = this.r;
    if (!d) return null;
    if (!w._press || w._press.id !== d.id) { this.d = null; return 'cancelled'; }
    d.t -= dt;
    if (d.t > 0) return null;
    if (d.i < d.n) {
      d.i++;
      const u = d.i / d.n, e = u * u * (3 - 2 * u);
      this.x = d.x0 + (d.x1 - d.x0) * e; this.y = d.y0 + (d.y1 - d.y0) * e - Math.sin(Math.PI * u) * d.arc;
      w.pointerMove(this.x, this.y);
      d.t += d.i < d.n ? r.float(d.o.stepDt[0], d.o.stepDt[1]) : r.float(d.o.hold[0], d.o.hold[1]);
      return null;
    }
    this.d = null;
    return w.pointerUp(this.x, this.y) || 'none';
  }
}

/* ---------------------------------------------------------------- child models
 * typical child of an age: after each `ask` it listens + thinks U(think) s (the prompt is spoken in ≈ 1.5–2 s), then drags
 * the right block with p = skill (a glowing hint: p = followHint), else a resting block it has not tried. The drag is slow
 * (steps × stepDt) and the release lands around the drop point with an error of ± aimX·(drop half width) and a height of
 * dropPoint − U(aimUp) … (+ aimDown: below the top = beside the tower). A release outside the drop zone is a grass miss
 * (the block flies home) → retry after U(retry). With p = pTap the child first just taps a block (naming), with p = pDistract
 * per ask it looks away U(distract) s first. Talk: answers after U(talk) s, right with p = talkRight. */
const SKILL = { 3: 0.6, 4: 0.7, 5: 0.8, 6: 0.85, 7: 0.9 };
const THINK = { 3: [2.0, 3.5], 4: [1.5, 3.0], 5: [1.3, 2.6], 6: [1.1, 2.2], 7: [1.0, 2.0] };
const DRAG = { 3: { steps: [10, 18], stepDt: [0.05, 0.09] }, 4: { steps: [9, 15], stepDt: [0.04, 0.08] }, 5: { steps: [8, 13], stepDt: [0.04, 0.07] },
  6: { steps: [7, 12], stepDt: [0.035, 0.06] }, 7: { steps: [6, 10], stepDt: [0.03, 0.06] } };
function typicalProfile(age) {
  return { skill: SKILL[age], think: THINK[age], retry: [1.0, 2.0], followHint: 0.85, pDistract: age <= 4 ? 0.08 : 0.04, distract: [4, 12],
    pBee: 0.7, talk: [3, 6], talkRight: Math.min(0.95, SKILL[age] + 0.05), pTap: age <= 4 ? 0.15 : 0.05, pPoke: 0.04,
    aimX: age <= 3 ? 0.9 : age <= 4 ? 0.75 : 0.6, aimUp: [0, 160], aimDown: 0, hold: [0.1, 0.5], ...DRAG[age] };
}

class Kid {
  constructor(w, prof, seed) {
    this.w = w; this.p = prof; this.r = new CK.RNG(seed); this.key = ''; this.t = -1; this.tried = []; this.talkT = -1; this.beeT = null; this.bee = null;
    this.f = new Finger(w, this.r); this.tapDone = false; this.poked = false;
    this.stats = { taps: 0, drags: 0, drops: 0, grass: 0, bee: 0 };
  }
  rf(a) { return this.r.float(a[0], a[1]); }
  talk(dt) {
    const w = this.w, r = this.r, p = this.p;
    if (w.talkAnswered) return;
    if (this.talkT < 0) this.talkT = this.rf(p.talk);
    this.talkT -= dt;
    if (this.talkT <= 0) {
      this.talkT = -1; const t = w.talk; let pick = t.answerId;
      if (!r.chance(t.glowAnswer ? 0.95 : p.talkRight)) { const wr = t.choices.filter(c => c.id !== t.answerId); if (wr.length) pick = r.pick(wr).id; }
      w.talkAnswer(pick);
    }
  }
  /** Where this child lets go of a block (around the drop point). */
  aim() {
    const w = this.w, L = w.layout, r = this.r, p = this.p, dp = w.dropPoint(), half = (L.drop.x1 - L.drop.x0) / 2;
    const x = dp.x + r.float(-1, 1) * p.aimX * half;
    const y = p.aimDown > 0 && r.chance(0.5) ? w.towerTop().y + r.float(-0.3, p.aimDown) * L.LH : dp.y - r.float(p.aimUp[0], p.aimUp[1]);
    return { x: clamp(x, 4, L.W - 4), y: clamp(y, L.ins.top + 10, L.H - 4) };
  }
  step(dt) {
    const w = this.w, r = this.r, p = this.p;
    if (w.state === 'talk') return this.talk(dt);
    this.talkT = -1;
    if (w.state !== 'round') return;
    if (this.f.busy) {
      const res = this.f.step(dt);
      if (res === null) return;
      if (res === 'drop') { this.stats.drops++; if (!this.cur.right) this.tried.push(this.cur.id); }
      if (res === 'miss') this.stats.grass++;
      this.t = this.rf(p.retry);
      return;
    }
    const B = w.bee;
    if (B && (B.state === 'in' || B.state === 'sit')) {
      if (this.bee !== B) { this.bee = B; this.beeT = r.chance(p.pBee) ? r.float(0.6, 1.6) : null; }
      if (this.beeT != null && (this.beeT -= dt) <= 0) { this.beeT = null; this.stats.taps++; if (tapAt(w, B.x, B.y) === 'bee') this.stats.bee++; return; }
    }
    if (w.phase !== 'ask') return;
    const key = w.sessions + ':' + w.level + ':' + w.round + ':' + w.ask;
    if (key !== this.key) {
      this.key = key; this.tried = []; this.tapDone = !r.chance(p.pTap); this.poked = !r.chance(p.pPoke);
      this.t = this.rf(p.think) + (r.chance(p.pDistract) ? this.rf(p.distract) : 0);
    }
    this.t -= dt;
    if (this.t > 0) return;
    const ans = w.answerId(); if (!ans) return;
    const right = w.pieceById(ans); if (!right || right.state !== 'rest') return;
    const LW = w.layout.LW, LH = w.layout.LH;
    if (!this.poked) { this.poked = true; const kh = w.kokoHit(); this.stats.taps++; tapAt(w, kh.x, kh.y); this.t = this.rf([1.5, 2.5]); return; }
    const wrong = restingPieces(w).filter(q => q.id !== ans && !this.tried.includes(q.id));
    const pc = r.chance(right.glow > 0.3 ? p.followHint : p.skill) || !wrong.length ? right : r.pick(wrong);
    const x0 = pc.x + r.float(-0.3, 0.3) * LW, y0 = pc.y + r.float(-0.3, 0.3) * LH;
    if (!this.tapDone) { this.tapDone = true; this.stats.taps++; tapAt(w, x0, y0); this.t = this.rf([0.8, 1.6]); return; }
    const a = this.aim();
    this.cur = pc;
    const res = this.f.start(x0, y0, a.x + (x0 - pc.x), a.y + (y0 - pc.y), p);
    if (res === pc.id) this.stats.drags++;
    else this.t = res === 'locked' ? 0.5 : 0.3;
  }
}

/** Random tapper: a toddler hammering the screen at random spots every U(0.3, 1.5) s; Talk: a random choice after 2–5 s. */
class Tapper {
  constructor(w, seed) { this.w = w; this.r = new CK.RNG(seed); this.t = 0.5; this.talkT = -1; this.stats = { taps: 0 }; }
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') {
      if (w.talkAnswered) return;
      if (this.talkT < 0) this.talkT = r.float(2, 5);
      this.talkT -= dt;
      if (this.talkT <= 0) { this.talkT = -1; w.talkAnswer(r.pick(w.talk.choices).id); }
      return;
    }
    this.t -= dt;
    if (this.t > 0) return;
    this.t = r.float(0.3, 1.5);
    const L = w.layout;
    this.stats.taps++;
    tapAt(w, r.float(0, L.W), r.float(0, L.H));
  }
}

function makeDriver(name, w, age, seed) {
  if (name === 'typical') return new Kid(w, typicalProfile(age), seed);
  if (name === 'tapper') return new Tapper(w, seed);
  const m = /^bot([\d.]+)$/.exec(name);
  if (m) return new CK.Bot(w, { skill: +m[1], seed });
  throw new Error('unknown driver ' + name);
}

function runSession(o) {
  const vp = VIEWPORTS[o.vp || 'ipadL'];
  const w = new CK.World({ seed: o.seed, age: o.age, lang: o.lang || 'en', config: o.config || {} });
  w.setViewport(vp.W, vp.H, vp.ins);
  const d = makeDriver(o.driver, w, o.age, o.seed + 1);
  const dt = 1 / 30, M = { age: o.age, driver: o.driver, vp: o.vp, lang: o.lang, done: false, stuck: false, nan: false,
    chapters: [], rounds: [], stacks: 0, wrong: 0, hints: 0, idles: 0, stars: 0, roundStars: [], talkRight: 0, maxAsk: 0, topics: [] };
  w.newSession();
  let chapT0 = 0, roundsInChap = 0, askT0 = -1, t = 0;
  while (w.state !== 'sessionDone' && t < 2400) {
    d.step(dt); w.update(dt); t += dt;
    if (w.pieces.some(p => !isFinite(p.x) || !isFinite(p.y)) || !isFinite(w.tower.theta)) { M.nan = true; break; }
    for (const e of w.drainEvents()) {
      switch (e.type) {
        case 'session': M.topics = e.levels; break;
        case 'level': chapT0 = w.time; roundsInChap = 0; break;
        case 'ask': askT0 = w.time; break;
        case 'stack': M.stacks++; M.maxAsk = Math.max(M.maxAsk, w.time - askT0); break;
        case 'wrong': M.wrong++; break;
        case 'hint': M.hints++; break;
        case 'idle': M.idles++; break;
        case 'roundDone': roundsInChap++; M.roundStars.push(e.stars); break;
        case 'talkResult': if (e.correct) M.talkRight++; break;
        case 'levelDone': M.chapters.push(w.time - chapT0); M.rounds.push(roundsInChap); break;
      }
    }
  }
  M.done = w.state === 'sessionDone';
  M.stuck = !M.done && !M.nan;
  M.sessionTime = w.time; M.stars = w.stars;
  return M;
}

module.exports = { CK, VIEWPORTS, runSession, makeDriver, typicalProfile, Kid, Tapper, Finger, SKILL, THINK, DRAG, clamp, mean, pct, f1, tapAt, restingPieces };
