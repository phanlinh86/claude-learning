// Pip's Camp Hide & Seek — headless playtest harness (report-only; never edits game code).
//   const L = require('./lib'); const m = L.runSession({ age, lang, vp, driver, seed, config });
// Loads rng/content/world/bot into node, drives ONLY the public input API (pointerDown/Move/Up, talkAnswer) and
// measures chapter / session times, wrong peeks, hints, idle nudges, stars, stuck states and NaN.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', '..', 'game', 'js');
const SPOTS = path.join(__dirname, '..', '..', 'game', 'assets', 'default', 'spots', 'spots.json');
function loadFC() {
  // runInThisContext (not a vm sandbox): ≈ 2× faster for long sims; the sim process owns its global scope
  globalThis.window = globalThis;
  for (const f of ['rng.js', 'content.js', 'world.js', 'bot.js']) vm.runInThisContext(fs.readFileSync(path.join(JS, f), 'utf8'), { filename: f });
  try { globalThis.FC.World.applySpots(JSON.parse(fs.readFileSync(SPOTS, 'utf8'))); } catch (e) { /* the art metadata is optional */ }
  return globalThis.FC;
}
const FC = loadFC();

// Logical viewports (short side 720) with safe-area insets converted from CSS px.
const VIEWPORTS = {
  iphoneP: { W: 720, H: 1556, ins: { top: 108, right: 0, bottom: 62, left: 0 } },
  iphoneL: { W: 1556, H: 720, ins: { top: 0, right: 108, bottom: 38, left: 108 } },
  ipadL:   { W: 960, H: 720, ins: { top: 32, right: 0, bottom: 27, left: 0 } },
  ipadP:   { W: 720, H: 960, ins: { top: 32, right: 0, bottom: 27, left: 0 } }
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const f1 = x => (+x).toFixed(1);

function hiddenPlaces(w) {
  return w.places.filter(p => { const f = w.friendById(p.friendId); return !p.found && !p.leaving && f && f.state === 'hidden'; });
}
function tapAt(w, x, y) { const id = w.pointerDown(x, y); const up = w.pointerUp(x, y); return up || id; }

/* ---------------------------------------------------------------- child models
 * typical child of an age: after each `ask` it listens + thinks U(think) s (the prompt is spoken in ≈ 1.5–2 s), then taps
 * the right hiding place with p = skill (a glowing hint: p = followHint), else a hidden place it has not tried; after a
 * wrong friend popped out it thinks again U(retry) s (Pip names what popped out). With p = pDistract per ask it looks away
 * for U(distract) s first. Taps land inside the place's hit area (± 30 % of its size). The squirrel: tapped with
 * p = pCritter after 0.6–1.6 s. Talk: answers after U(talk) s, right with p = talkRight. */
const SKILL = { 3: 0.6, 4: 0.7, 5: 0.8, 6: 0.85, 7: 0.9 };
const THINK = { 3: [2.0, 3.5], 4: [1.5, 3.0], 5: [1.3, 2.6], 6: [1.1, 2.2], 7: [1.0, 2.0] };
function typicalProfile(age) {
  return { skill: SKILL[age], think: THINK[age], retry: [1.0, 2.0], followHint: 0.85, pDistract: age <= 4 ? 0.08 : 0.04, distract: [4, 12],
    pCritter: 0.7, talk: [3, 6], talkRight: Math.min(0.95, SKILL[age] + 0.05), spread: 0.3 };
}

class Kid {
  constructor(w, prof, seed) {
    this.w = w; this.p = prof; this.r = new FC.RNG(seed); this.key = ''; this.t = -1; this.tried = []; this.talkT = -1; this.critT = null; this.crit = null;
    this.stats = { taps: 0, critter: 0 };
  }
  rf(a) { return this.r.float(a[0], a[1]); }
  step(dt) {
    const w = this.w, r = this.r, p = this.p;
    if (w.state === 'talk') {
      if (w.talkAnswered) return;
      if (this.talkT < 0) this.talkT = this.rf(p.talk);
      this.talkT -= dt;
      if (this.talkT <= 0) {
        this.talkT = -1; const t = w.talk; let pick = t.answerId;
        if (!r.chance(t.glowAnswer ? 0.95 : p.talkRight)) { const wr = t.choices.filter(c => c.id !== t.answerId); if (wr.length) pick = r.pick(wr).id; }
        w.talkAnswer(pick);
      }
      return;
    }
    this.talkT = -1;
    if (w.state !== 'round') return;
    const C = w.critter;
    if (C && (C.state === 'in' || C.state === 'up')) {
      if (this.crit !== C) { this.crit = C; this.critT = r.chance(p.pCritter) ? r.float(0.6, 1.6) : null; }
      if (this.critT != null && (this.critT -= dt) <= 0) { this.critT = null; this.stats.taps++; if (tapAt(w, C.x, C.y - C.size / 2) === 'critter') this.stats.critter++; return; }
    }
    if (w.phase !== 'ask') return;
    const key = w.sessions + ':' + w.level + ':' + w.round + ':' + w.ask;
    if (key !== this.key) { this.key = key; this.tried = []; this.t = this.rf(p.think) + (r.chance(p.pDistract) ? this.rf(p.distract) : 0); }
    this.t -= dt;
    if (this.t > 0) return;
    const ans = w.answerId(); if (!ans) return;
    const right = w.placeById(ans), wrong = hiddenPlaces(w).filter(q => q.id !== ans && !this.tried.includes(q.id));
    const pl = r.chance(right.glow > 0.3 ? p.followHint : p.skill) || !wrong.length ? right : r.pick(wrong);
    const h = w.placeHit(pl.id), x = h.x + r.float(-p.spread, p.spread) * h.w * 0.6, y = h.y + r.float(-p.spread, p.spread) * h.h * 0.5;
    this.stats.taps++;
    const id = tapAt(w, x, y);
    this.after(id);
  }
  after(id) {
    const w = this.w;
    if (id && id !== 'locked' && id !== 'empty' && id !== 'pip' && id !== 'pokePip' && w.phase !== 'found') this.tried.push(id);
    this.t = this.rf(this.p.retry);
  }
}

/** Random tapper: a toddler hammering the screen at random spots every U(0.3, 1.5) s; Talk: a random choice after 2–5 s. */
class Tapper {
  constructor(w, seed) { this.w = w; this.r = new FC.RNG(seed); this.t = 0.5; this.talkT = -1; this.stats = { taps: 0 }; }
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
  if (m) return new FC.Bot(w, { skill: +m[1], seed });
  throw new Error('unknown driver ' + name);
}

function runSession(o) {
  const vp = VIEWPORTS[o.vp || 'ipadL'];
  const w = new FC.World({ seed: o.seed, age: o.age, lang: o.lang || 'en', config: o.config || {} });
  w.setViewport(vp.W, vp.H, vp.ins);
  const d = makeDriver(o.driver, w, o.age, o.seed + 1);
  const dt = 1 / 30, M = { age: o.age, driver: o.driver, vp: o.vp, lang: o.lang, done: false, stuck: false, nan: false,
    chapters: [], rounds: [], finds: 0, wrong: 0, hints: 0, idles: 0, stars: 0, roundStars: [], talkRight: 0, maxAsk: 0, topics: [], shrunk: 0 };
  w.newSession();
  let chapT0 = 0, roundsInChap = 0, askT0 = -1, t = 0;
  while (w.state !== 'sessionDone' && t < 2400) {
    d.step(dt); w.update(dt); t += dt;
    if (w.friends.some(f => !isFinite(f.x) || !isFinite(f.y))) { M.nan = true; break; }
    for (const e of w.drainEvents()) {
      switch (e.type) {
        case 'session': M.topics = e.levels; break;
        case 'level': chapT0 = w.time; roundsInChap = 0; break;
        case 'round': if (w.geo && w.geo.k < 1) M.shrunk++; break;
        case 'ask': askT0 = w.time; break;
        case 'found': M.finds++; M.maxAsk = Math.max(M.maxAsk, w.time - askT0); break;
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

module.exports = { FC, VIEWPORTS, runSession, makeDriver, typicalProfile, Kid, Tapper, SKILL, THINK, clamp, mean, pct, f1, hiddenPlaces, tapAt };
