#!/usr/bin/env node
// Tupi's Bakery Delivery — HIGH-SPEED "driving feel" playtest (report-only; never edits game/js). Complements hs_playtest.js with
// the numbers a parent notices: grabs per delivery, the cart stopping short after a lift, direction flips (oscillation) while held,
// finger ↔ cart lag, wrong houses the child did NOT mean (projection / auto-drive mis-routes), dead time (nothing interactive),
// help frequency, stars, Talk time.
//   node tests/sim/hs_feel.js [--n 40] [--ages 3,4,5,6,7] [--models typical,lifter,...] [--config '{…}'] [--patch aim,graboff] [--aimpad 30] [--jobs 2] [--tag x]
// Extra models (on top of tests/sim/lib.js):
//   lifter    — typical, but lifts the finger halfway EVERY drag and presses again where the finger was (not on the cart)
//   housetap  — only taps houses (never drags)
//   wobbly    — drags with ± 30 px wobble, stops still mid-drag 0.4–1.5 s (finger down), swings 70 px into the wrong branch at
//               each fork and back, overshoots 80 px past the door
//   straight  — = offroad: drags straight at the house (off the road)
// Output: tests/sim/out/feel_<tag>.md / .json
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const L = require('./lib');
const BD = L.BD;

const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 40), config = JSON.parse(get('config', '{}'));
const ALL = 'typical,slow3,lifter,wobbly,straight,housetap,tapper,spammer,kid0.6,botT0.8,bot1';
const MODELS = get('models', ALL).split(','), AGES = get('ages', '3,4,5,6,7').split(',').map(Number);
const TAG = get('tag', 'base'), JOBS = +get('jobs', 2);
const VPS = Object.keys(L.VIEWPORTS);

/* ---------------------------------------------------------------- a finger that can pause (finger still down) */
class PFinger extends L.Finger {
  path(pts, speed, hold, wob, stopAt, pauses) {
    const r = super.path(pts, speed, hold, wob, stopAt);
    if (this.g) { this.g.pauses = (pauses || []).slice().sort((a, b) => a.at - b.at); this.g.pz = 0; }
    return r;
  }
  step(dt) {
    const g = this.g;
    if (g && g.pauses && g.pauses.length && g.cum >= g.pauses[0].at * g.total) {
      g.pz += dt;
      if (g.pz < g.pauses[0].dur) { g.t += dt; return null; }
      g.pauses.shift(); g.pz = 0; g.mt = 0;
    }
    return super.step(dt);
  }
}

/* ---------------------------------------------------------------- models that remember what the child MEANT */
function withIntent(Base) {
  return class extends Base {
    constructor(w, p, seed) { super(w, p, seed); this.f = new PFinger(w, this.r); this.intent = null; }
    act() {
      super.act();
      const q = this.pending;
      if (!q) { this.intent = null; return; }
      if (q.kind === 'drag') this.intent = q.id;
      else if (q.kind === 'tap') { const h = this.w._houseAt(q.x, q.y); this.intent = h ? h.id : this.intent; }
    }
  };
}
const IKid = withIntent(L.Kid);

class Lifter extends IKid {
  step(dt) {
    const w = this.w;
    if (this.f.busy && (w.state === 'round')) {
      const g = this.f.g, gx = g.x, gy = g.y, res = this.f.step(dt);
      if (res && this.resume) {
        const id = this.resume; this.resume = null; this.stats.stops++;
        this.pending = { kind: 'from', id, x: gx, y: gy, t: this.rf([0.4, 1.2]) };
      }
      return;
    }
    if (this.pending && this.pending.kind === 'from') {
      this.pending.t -= dt; if (this.pending.t > 0) return;
      const q = this.pending; this.pending = null;
      if (!w.interactive) return;
      const rest = w.route(q.id), pts = [[q.x, q.y]];
      // keep the route points ahead of the finger
      let k = 0, bd = 1e9; rest.forEach((p, i) => { const d = Math.hypot(p[0] - q.x, p[1] - q.y); if (d < bd) { bd = d; k = i; } });
      const res = this.f.path(pts.concat(rest.slice(k + 1)), this.rf(this.p.speed), 0.2, this.p.wobble * w.layout.roadW, 2);
      this.stats.from = (this.stats.from || {}); this.stats.from[res] = (this.stats.from[res] || 0) + 1;
      return;
    }
    return super.step(dt);
  }
}
class Wobbly extends IKid {
  wayTo(id) {
    const w = this.w, r = this.r, pts = super.wayTo(id);
    // a swing into the wrong branch at each fork the route passes, then back
    const forks = (w.roads.nodes || []).filter(n => n.kind === 'fork');
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      out.push(pts[i]);
      for (const f of forks) {
        if (Math.hypot(pts[i][0] - f.x, pts[i][1] - f.y) < 10 && i + 1 < pts.length && !out._sw) {
          const edges = w.roads.edges.filter(e => e.from === f.id);
          const next = pts[Math.min(pts.length - 1, i + 3)];
          let wrong = null, wd = -1;
          for (const e of edges) { const q = BD.Roads.at(e, Math.min(e.len, 70)); const d = Math.hypot(q.x - next[0], q.y - next[1]); if (d > wd) { wd = d; wrong = q; } }
          if (wrong && wd > 20) { out.push([wrong.x, wrong.y]); out.push([f.x, f.y]); }
        }
      }
    }
    // overshoot past the door
    const a = out[out.length - 2], b = out[out.length - 1];
    if (a && b) { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; out.push([b[0] + dx / l * 80, b[1] + dy / l * 80]); }
    return out;
  }
  step(dt) {
    const w = this.w;
    if (this.pending && this.pending.kind === 'drag') {
      this.pending.t -= dt; if (this.pending.t > 0) return;
      const q = this.pending; this.pending = null;
      if (!w.interactive || w.cart.state === 'auto') return;
      const pts = this.wayTo(q.id), pauses = [];
      if (this.r.chance(0.6)) pauses.push({ at: this.r.float(0.2, 0.7), dur: this.r.float(0.4, 1.5) });
      if (this.f.path(pts, this.rf(this.p.speed), this.r.float(0.1, 0.5), 30, q.stop, pauses) === 'cart' && q.stop < 1) this.resume = q.id;
      return;
    }
    return super.step(dt);
  }
}
const ITapper = withIntent(class extends L.Kid {});
function makeModel(name, w, age, seed) {
  if (name === 'lifter') return new Lifter(w, Object.assign(L.typicalProfile(age), { pStop: 1, pTapHouse: 0 }), seed);
  if (name === 'housetap') return new IKid(w, Object.assign(L.typicalProfile(age), { pTapHouse: 1, pHonk: 0.05 }), seed);
  if (name === 'wobbly') return new Wobbly(w, Object.assign(L.typicalProfile(age), { pTapHouse: 0, pStop: 0.15 }), seed);
  if (name === 'straight') return new IKid(w, Object.assign(L.typicalProfile(age), { offRoad: true, pTapHouse: 0 }), seed);
  if (name === 'typical') return new IKid(w, L.typicalProfile(age), seed);
  if (name === 'slow3') return new IKid(w, L.slowProfile(), seed);
  if (/^kid/.test(name)) return new IKid(w, Object.assign(L.typicalProfile(age), { skill: +name.slice(3) }), seed);
  return L.makeModel(name, w, age, seed);
}

/* ---------------------------------------------------------------- proposed code changes, applied to the world INSTANCE only
 * (--patch aim,graboff) so their effect can be measured before anybody edits game/js/world.js.
 *  aim:     when the held finger is more than roadW/2 + aimPad off the road, project it only onto the roads that lead to the house
 *           nearest the finger (a child dragging straight at a house means THAT house) — world.js P.pointerMove.
 *  graboff: the cart keeps the finger's offset from its ground point at the grab, fading out over the first 150 px of finger travel
 *           (no lurch when Tupi is grabbed by her ear) — world.js P._grab + P.pointerMove. */
function applyPatches(w, patches, aimPad) {
  if (!patches.length) return;
  if (patches.includes('releasehouse')) {
    // releasehouse: a drag released with the finger ON a house (its hit box) drives the cart to THAT house (the child pointed at
    // it), instead of the 80 %-of-the-current-branch auto-roll — world.js P._release (first line after `if (tap) …`).
    const r0 = w._release;
    w._release = function (tap) {
      if (!tap && this.finger) { const h = this._houseAt(this.finger.x, this.finger.y); if (h) { this._emit({ type: 'autoDrive', houseId: h.id, x: h.x, y: h.y, release: true }); this._autoDrive(h, 'auto'); return; } }
      return r0.call(this, tap);
    };
  }
  if (patches.includes('commit')) {
    // commit: while the finger HOLDS the cart, it only knocks at a house when the finger is at that house too (its hit box, or
    // ≤ commitR px from the parked cart); otherwise it waits just before the door and follows the finger back out — world.js
    // update() case 'play' (the arrive test) + P._arrive.
    const a0 = w._arrive;
    w._arrive = function (h) {
      const c = this.cart, f = this.finger;
      if (c.state === 'drag' && f.down) {
        const b = this.houseHit(h.id), inBox = b && f.x >= b.x0 && f.x <= b.x1 && f.y >= b.y0 && f.y <= b.y1;
        const ch = this.cartHit();
        if (!inBox && Math.hypot(f.x - ch.x, f.y - ch.y) > (+get('commitr', 160))) { const e = this._edge(c.edge); c.s = Math.min(c.s, e.stopS - this.cfg.arriveTol - 0.5); c.spd = 0; this._placeCart(); return; }
      }
      return a0.call(this, h);
    };
  }
  const R = BD.Roads, pm = w.pointerMove.bind(w), g0 = w._grab;
  if (patches.includes('graboff')) w._grab = function (x, y) { g0.call(this, x, y); this._gdx = x - this.cart.x; this._gdy = y - this.cart.y; this._gx = x; this._gy = y; };
  const chainTo = (roads, hid) => { const out = []; let e = roads.edges.find(q => q.id === 'to_' + hid); while (e) { out.push(e); const from = e.from; e = roads.edges.find(q => q.to === from); } return out; };
  w.pointerMove = function (x, y) {
    const g = this._g, c = this.cart;
    if (!(g && g.kind === 'cart' && c.state === 'drag' && this.roads)) return pm(x, y);
    g.maxD = Math.max(g.maxD, Math.hypot(x - g.x0, y - g.y0)); this.finger.x = x; this.finger.y = y; g.x = x; g.y = y;
    let qx = x, qy = y;
    if (patches.includes('graboff') && this._gdx !== undefined) { const k = Math.max(0, 1 - Math.hypot(x - this._gx, y - this._gy) / 150); qx -= this._gdx * k; qy -= this._gdy * k; }
    let p = R.project(this.roads, qx, qy, this._dragEdge, this.cfg.grabHyst);
    if (patches.includes('aim') && p && p.d > this.layout.roadW / 2 + aimPad && this.houses.length) {
      let best = null, bd = 1e9;
      for (const h of this.houses) { const d = Math.hypot(qx - h.x, qy - (h.y - 0.4 * h.S)); if (d < bd) { bd = d; best = h; } }
      const sub = { edges: chainTo(this.roads, best.id) };
      const pa = sub.edges.length ? R.project(sub, qx, qy) : null;
      if (pa) p = pa;
    }
    if (p && p.d <= this.layout.roadW / 2 + this.cfg.projectR + (patches.includes('aim') ? 400 : 0)) { this._dragEdge = p.e; c.tgt = { edge: p.e.id, s: this._clampS(p.e, p.s), house: null }; }
  };
}
const PATCHES = get('patch', '') ? get('patch', '').split(',') : [], AIMPAD = +get('aimpad', 30);

/* ---------------------------------------------------------------- one session */
function runOne(o) {
  const w = L.mkWorld(o), d = makeModel(o.model, w, o.age, o.seed + 1);
  applyPatches(w, o.patches || [], o.aimPad);
  // count what each press became
  const press = {}, pd = w.pointerDown.bind(w);
  w.pointerDown = (x, y) => { const r = pd(x, y); press[r] = (press[r] || 0) + 1; return r; };
  const S = { model: o.model, age: o.age, done: false, time: 0, rounds: [], chapters: [], steps: [], drags: [], dead: [], firstInter: [], betweenInter: [],
    talks: 0, talkRight: 0, talkAuto: 0, talkAsks: [], press, unmeant: 0, wrong: 0, meantWrong: 0, stuck: 0 };
  w.newSession();
  const dt = 1 / 30, cap = 1800;
  let t = 0, R = null, chap = null, step = null, drag = null, prevState = '', deadT = 0, roundT0 = 0, firstI = false, lastRightT = -1, talkN = 0;
  const newStep = () => ({ t0: w.time, grabs: 0, stopShort: 0, flips: 0, houseTaps: 0, roadTaps: 0, wrong: 0, unmeant: 0 });
  while (w.state !== 'sessionDone' && t < cap) {
    d.step(dt); w.update(dt); t += dt;
    const c = w.cart, cs = c.state;
    // drags: lag + direction flips
    if (cs === 'drag') {
      if (!drag) drag = { lag: [], flips: 0, mdir: c.mdir, edges: [c.edge], dither: 0, t0: w.time, face: c.face, back: 0, run: 0 };
      if (w.finger.down && c.tgt) { const e1 = w._edge(c.edge), e2 = w._edge(c.tgt.edge); if (e1 && e2) drag.lag.push(BD.Roads.path(w.roads, e1, c.s, e2, c.tgt.s).len); }
      // a visible turn-round = the cart moves ≥ 12 px the other way after having moved ≥ 12 px one way
      if (c.spd > 1 && c.mdir) {
        if (c.mdir === drag.mdir) drag.run += c.spd * dt;
        else { if (drag.run >= 12) drag.pend = true; drag.mdir = c.mdir; drag.run = c.spd * dt; }
        if (drag.pend && drag.run >= 12) { drag.flips++; drag.pend = false; }
      }
      if (c.face !== drag.face) { drag.faceFlips = (drag.faceFlips || 0) + 1; drag.face = c.face; }
      const le = drag.edges[drag.edges.length - 1];
      if (c.edge !== le) { if (drag.edges.length >= 2 && drag.edges[drag.edges.length - 2] === c.edge) drag.dither++; drag.edges.push(c.edge); }
    } else if (drag) {
      drag.dur = w.time - drag.t0; drag.end = cs; S.drags.push({ lagM: L.mean(drag.lag), lagMax: Math.max(0, ...drag.lag), flips: drag.flips, faceFlips: drag.faceFlips || 0, dither: drag.dither, dur: drag.dur });
      if (step) step.flips += drag.flips;
      drag = null;
    }
    if (prevState === 'coast' && cs === 'wait' && step) step.stopShort++;
    prevState = cs;
    // dead time inside a round: not interactive (excluding Talk time)
    if (w.state === 'round' || w.state === 'roundDone') {
      if (w.interactive) {
        if (deadT > 0) S.dead.push(deadT); deadT = 0;
        if (!firstI) { firstI = true; S.firstInter.push(w.time - roundT0); }
        if (lastRightT >= 0) { S.betweenInter.push(w.time - lastRightT); lastRightT = -1; }
      } else deadT += dt;
    }
    for (const e of w.drainEvents()) {
      if (d.onEvent) d.onEvent(e);
      switch (e.type) {
        case 'level': chap = { t0: w.time, rounds: 0 }; break;
        case 'round': R = { t0: w.time, stars: 0, hint: 0, assist: 0, wrong: 0, n: e.n, d: e.d }; roundT0 = w.time; firstI = false; break;
        case 'ask': if (!step) step = newStep(); break;
        case 'grab': if (step) step.grabs++; break;
        case 'autoDrive': if (step) { if (e.houseId) step.houseTaps++; else step.roadTaps++; } break;
        case 'wrong': {
          S.wrong++; if (R) R.wrong++; if (step) step.wrong++;
          const meant = d.intent; if (meant && meant === e.want.houseId) { S.unmeant++; if (step) step.unmeant++; } else S.meantWrong++;
          break;
        }
        case 'hint': if (R && !e.demo) R.hint++; break;
        case 'assist': if (R) R.assist++; break;
        case 'right': if (step) { step.dur = w.time - step.t0; S.steps.push(step); } step = null; lastRightT = e.left > 0 ? w.time : -1; break;
        case 'roundDone': if (R) { R.stars = e.stars; R.dur = w.time - R.t0; S.rounds.push(R); if (chap) chap.rounds++; } break;
        case 'levelDone': if (chap) { chap.dur = w.time - chap.t0; S.chapters.push(chap); } break;
        case 'talk': S.talks++; talkN = 0; break;
        case 'talkAsk': talkN = e.n || talkN + 1; break;
        case 'talkResult': if (e.correct) S.talkRight++; if (e.auto) S.talkAuto++; S.talkAsks.push(talkN); break;
        case 'sessionDone': S.done = true; break;
      }
    }
  }
  S.time = w.time;
  S.stuck = S.rounds.filter(r => r.dur > 120).length + (S.done ? 0 : 1);
  if (d.stats && d.stats.from) S.from = d.stats.from;
  return S;
}

function summarize(list) {
  const by = {};
  for (const s of list) (by[s.model + '|' + s.age] = by[s.model + '|' + s.age] || []).push(s);
  const rows = [];
  for (const k of Object.keys(by)) {
    const ss = by[k], [model, age] = k.split('|');
    const rounds = ss.flatMap(s => s.rounds), steps = ss.flatMap(s => s.steps), drags = ss.flatMap(s => s.drags), chaps = ss.flatMap(s => s.chapters);
    const nR = Math.max(1, rounds.length), nS = Math.max(1, steps.length), done = ss.filter(s => s.done);
    const sum = f => ss.reduce((a, s) => a + f(s), 0), talks = Math.max(1, sum(s => s.talks));
    const dead = ss.flatMap(s => s.dead), press = {};
    ss.forEach(s => Object.keys(s.press).forEach(q => { press[q] = (press[q] || 0) + s.press[q]; }));
    rows.push({ model, age: +age, n: ss.length, done: done.length / ss.length * 100,
      sess: L.mean(done.map(s => s.time)) / 60, sessP90: L.pct(done.map(s => s.time), 0.9) / 60, sessMax: Math.max(0, ...done.map(s => s.time)) / 60,
      chap: L.mean(chaps.map(c => c.dur)), chapP90: L.pct(chaps.map(c => c.dur), 0.9), round: L.mean(rounds.map(r => r.dur)), roundMax: Math.max(0, ...rounds.map(r => r.dur)),
      stuck: sum(s => s.stuck), st3: rounds.filter(r => r.stars === 3).length / nR * 100, st2: rounds.filter(r => r.stars === 2).length / nR * 100, st1: rounds.filter(r => r.stars === 1).length / nR * 100,
      hintR: rounds.filter(r => r.hint).length / nR * 100, assistR: rounds.filter(r => r.assist).length / nR * 100,
      wrongPerDel: sum(s => s.wrong) / nS, unmeantPerDel: sum(s => s.unmeant) / nS, unmeantShare: sum(s => s.unmeant) / Math.max(1, sum(s => s.wrong)) * 100,
      grabs: L.mean(steps.map(s => s.grabs)), grabs3: steps.filter(s => s.grabs >= 3).length / nS * 100, stopShort: L.mean(steps.map(s => s.stopShort)),
      stepDur: L.mean(steps.map(s => s.dur)), stepP90: L.pct(steps.map(s => s.dur), 0.9),
      flipDrag: drags.filter(x => x.flips >= 1).length / Math.max(1, drags.length) * 100, faceFlip: drags.filter(x => x.faceFlips >= 2).length / Math.max(1, drags.length) * 100, dither: drags.filter(x => x.dither >= 1).length / Math.max(1, drags.length) * 100,
      lagM: L.mean(drags.map(x => x.lagM)), lagP90: L.pct(drags.map(x => x.lagMax), 0.9),
      deadP90: L.pct(dead, 0.9), deadMax: Math.max(0, ...dead), firstI: L.mean(ss.flatMap(s => s.firstInter)), between: L.mean(ss.flatMap(s => s.betweenInter)),
      talkRight: sum(s => s.talkRight) / talks * 100, talkAuto: sum(s => s.talkAuto) / talks * 100, talkAsks: L.mean(ss.flatMap(s => s.talkAsks)),
      press, houseTapsPerDel: L.mean(steps.map(s => s.houseTaps)), roadTapsPerDel: L.mean(steps.map(s => s.roadTaps)) });
  }
  rows.sort((a, b) => MODELS.indexOf(a.model) - MODELS.indexOf(b.model) || a.age - b.age);
  return rows;
}
function table(rows) {
  const f = L.f1, f2 = x => (+x).toFixed(2), out = [];
  out.push('| model | age | n | done % | session min (p90, max) | chapter s (p90) | round s (max) | stuck | stars 3/2/1 % | hint % (assist %) | talk right % (auto %, asks) |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) out.push(`| ${r.model} | ${r.age} | ${r.n} | ${f(r.done)} | ${f(r.sess)} (${f(r.sessP90)}, ${f(r.sessMax)}) | ${f(r.chap)} (${f(r.chapP90)}) | ${f(r.round)} (${f(r.roundMax)}) | ${r.stuck} | ${f(r.st3)}/${f(r.st2)}/${f(r.st1)} | ${f(r.hintR)} (${f(r.assistR)}) | ${f(r.talkRight)} (${f(r.talkAuto)}, ${f2(r.talkAsks)}) |`);
  out.push('', '| model | age | ask → right s (p90) | wrong / delivery | unmeant wrong / delivery (% of wrongs) | grabs / delivery (≥ 3 grabs %) | stop-short / delivery | house / road taps per delivery | drags with a turn-round ≥ 12 px % (facing flips ≥ 2 %) | fork dither % | finger→cart road lag px mean (p90 of max) | dead time p90 / max s | build → interactive s | right → next interactive s |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) out.push(`| ${r.model} | ${r.age} | ${f(r.stepDur)} (${f(r.stepP90)}) | ${f2(r.wrongPerDel)} | ${f2(r.unmeantPerDel)} (${f(r.unmeantShare)}) | ${f2(r.grabs)} (${f(r.grabs3)}) | ${f2(r.stopShort)} | ${f2(r.houseTapsPerDel)} / ${f2(r.roadTapsPerDel)} | ${f(r.flipDrag)} (${f(r.faceFlip)}) | ${f(r.dither)} | ${f(r.lagM)} (${f(r.lagP90)}) | ${f(r.deadP90)} / ${f(r.deadMax)} | ${f(r.firstI)} | ${f(r.between)} |`);
  return out.join('\n');
}

if (process.argv.includes('--worker')) {
  process.on('message', jobs => {
    const res = [];
    for (const j of jobs) { try { res.push(runOne(j)); } catch (e) { console.error('session failed', JSON.stringify(j), e.stack); } }
    process.send(res, () => process.exit(0));
  });
} else {
  const jobs = [];
  for (const model of MODELS) for (const age of AGES) {
    if (model === 'slow3' && age > 4) continue;
    const n = /^bot|spammer|tapper/.test(model) ? Math.min(N, 20) : N;
    for (let i = 0; i < n; i++) jobs.push({ model, age, seed: 5000 + i * 41 + age * 13, vp: VPS[i % VPS.length], lang: i % 2 ? 'vi' : 'en', config, patches: PATCHES, aimPad: AIMPAD });
  }
  const parts = Array.from({ length: JOBS }, () => []);
  jobs.forEach((j, i) => parts[i % JOBS].push(j));
  const t0 = Date.now();
  Promise.all(parts.filter(p => p.length).map(p => new Promise((res, rej) => {
    const c = fork(__filename, ['--worker']); let got = false;
    c.on('message', m => { got = true; res(m); }); c.on('error', rej);
    c.on('exit', code => { if (!got) rej(new Error('worker exited ' + code)); });
    c.send(p);
  }))).then(rs => {
    const list = rs.flat(), rows = summarize(list), md = table(rows);
    const head = `# hs_feel ${TAG} — ${list.length} sessions, config ${JSON.stringify(config)}${PATCHES.length ? ' patch ' + PATCHES.join(',') + ' aimPad ' + AIMPAD : ''} (${((Date.now() - t0) / 1000).toFixed(0)} s)\n\n`;
    console.log(head + md);
    const dir = path.join(__dirname, 'out'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'feel_' + TAG + '.md'), head + md + '\n');
    fs.writeFileSync(path.join(dir, 'feel_' + TAG + '.json'), JSON.stringify({ config, rows }, null, 1));
  }).catch(e => { console.error(e); process.exit(1); });
}
