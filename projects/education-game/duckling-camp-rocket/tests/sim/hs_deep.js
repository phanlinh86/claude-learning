#!/usr/bin/env node
// Mimi's Splash Rocket — DEEP high-speed playtest (report-only; never edits game/js). Extends hs_playtest.js with
//   * more child models: flight tapper (taps everything while the rocket flies), pump spammer, never-pumps, nearest-mat,
//     same-spot (taps where the last right mat was), plus typical kid<skill> and DK.Bot (botT<skill>) skill axes;
//   * a time budget: every simulated second is put in a bucket (unfold / play / aim / pump / flight / collect / camp / wipe /
//     intro / talk / levelDone) and classed "the child can act" (play, pump before the 3rd stomp, Talk before the answer) or
//     "watching"; the longest watch stretch per round; ask → first possible tap; right → next possible tap;
//   * content / layout repetition: the same target thing on consecutive launches / rounds, the target on (almost) the same spot as
//     the last target, the target = the mat nearest the launch pad (position bias);
//   * NaN / off screen (mats, Mimi, rocket, flyer), stuck states.
//   node tests/sim/hs_deep.js [--n 200] [--ages 3,4,5,6,7] [--models typical,…] [--config '{…}'] [--jobs 2] [--tag x]
// Output: stdout + tests/sim/out/deep_<tag>.md + .json.
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const L = require('./lib');
const DK = L.DK;

const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 200), config = JSON.parse(get('config', '{}'));
const ALL = 'typical,kid0.6,kid0.8,kid0.95,botT0.6,botT0.8,botT0.95,slow3,tapper,flightTapper,pumpSpam,neverPump,nearest,sameSpot';
const MODELS = get('models', ALL).split(','), AGES = get('ages', '3,4,5,6,7').split(',').map(Number);
const TAG = get('tag', 'base'), JOBS = +get('jobs', 2);
const VPS = Object.keys(L.VIEWPORTS);

/* ------------------------------------------------------------------ extra child models */
/** Taps random spots (meadow, rocket, Mimi, sky) every 0.25–0.7 s while the game is NOT waiting for it (unfold / aim / flight /
 *  collect / camp / wipe); plays like a typical child when it can act. */
class FlightTapper extends L.Kid {
  constructor(w, p, s) { super(w, p, s); this.ft = 0; this.stats.flightTaps = 0; }
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'round' && !w.interactive && !this.f.busy && !this.pending) {
      this.ft -= dt;
      if (this.ft <= 0) {
        this.ft = r.float(0.25, 0.7);
        const Lw = w.layout, ro = w.rocket;
        let x, y;
        if (r.chance(0.4) && ro) { x = ro.x + r.float(-30, 30); y = ro.y - r.float(0, 120); }   // chases the rocket
        else { x = r.float(Lw.ins.left + 10, Lw.W - Lw.ins.right - 10); y = r.float(Lw.play.y0, Lw.H - Lw.ins.bottom - 10); }
        this.stats.flightTaps++;
        this.tap(L.clamp(x, 1, Lw.W - 1), L.clamp(y, 1, Lw.H - 1));
        return;
      }
    }
    super.step(dt);
  }
}
/** Pump spammer: drums the pump ≈ 10×/s from the moment it can (also before pumpAsk and for 1.5 s after the launch). */
class PumpSpam extends L.Kid {
  constructor(w, p, s) { super(w, p, s); this.after = 0; this.dt0 = 0; this.stats.extraPumps = 0; }
  onEvent(e) { super.onEvent(e); if (e.type === 'launch') this.after = 1.5; if (e.type === 'pumpAsk') this.pumpWait = false; }
  step(dt) {
    const w = this.w, r = this.r;
    if (this.after > 0) this.after -= dt;
    const drum = w.state === 'round' && (w.phase === 'aim' || (w.phase === 'pump' && w.interactive) || this.after > 0);
    if (drum && !this.pending) {
      if (this.f.busy) { this.f.step(dt); return; }
      this.dt0 -= dt;
      if (this.dt0 > 0) return;
      this.dt0 = r.float(0.07, 0.13);
      const ph = w.pumpHit();
      if (!ph) return super.step(dt);
      if (!(w.phase === 'pump' && w.interactive)) this.stats.extraPumps++; else this.stats.pumps++;
      this.stats.taps++;
      this.f.gesture(ph.x + r.float(-0.4, 0.4) * ph.r, ph.y + r.float(-0.4, 0.4) * ph.r, 0, 0, 0, r.float(0.02, 0.05));
      this.f.g.x1 = this.f.g.x0; this.f.g.y1 = this.f.g.y0;
      return;
    }
    super.step(dt);
  }
}
/** Taps the rest mat of this launch nearest to the launch pad, always (ignores the hint glow; the assist still rescues it). */
class Nearest extends L.Kid {
  act() {
    const w = this.w, j = w.launch, P = w.layout.pad;
    const st = w.mats.filter(q => q.launch === j && q.state === 'rest');
    if (!st.length) return;
    st.sort((a, b) => Math.hypot(a.x - P.x, a.y - P.y) - Math.hypot(b.x - P.x, b.y - P.y));
    this.aimAt(st[0]);
  }
}
/** Taps the rest mat closest to where the LAST right mat stood (a "same place again" strategy); follows a glowing hint. */
class SameSpot extends L.Kid {
  onEvent(e) { super.onEvent(e); if (e.type === 'right') this.last = { x: e.x, y: e.y }; }
  act() {
    const w = this.w, j = w.launch;
    if (!this.last || w.hintHand || w.assistId) return super.act();
    const st = w.mats.filter(q => q.launch === j && q.state === 'rest');
    if (!st.length) return;
    const l = this.last;
    st.sort((a, b) => Math.hypot(a.x - l.x, a.y - l.y) - Math.hypot(b.x - l.x, b.y - l.y));
    this.aimAt(st[0]);
  }
}
function makeModel(name, w, age, seed) {
  if (name === 'flightTapper') return new FlightTapper(w, L.typicalProfile(age), seed);
  if (name === 'pumpSpam') return new PumpSpam(w, L.typicalProfile(age), seed);
  if (name === 'neverPump') return new L.Kid(w, Object.assign(L.typicalProfile(age), { pAutoWait: 1 }), seed);
  if (name === 'nearest') return new Nearest(w, L.typicalProfile(age), seed);
  if (name === 'sameSpot') return new SameSpot(w, L.typicalProfile(age), seed);
  return L.makeModel(name, w, age, seed);
}

/* ------------------------------------------------------------------ one session */
const ACT_PHASES = { play: 1, pump: 1 };
function thingSig(t) { if (!t) return ''; return [t.kind, t.color || '', t.text || t.obj || t.shape || t.animal || (t.n != null ? t.n : ''), t.big === false ? 's' : 'b'].join(':'); }
function finiteWorld(w) {
  const n = w.mimi, r = w.rocket;
  if (![n.x, n.y, n.sx, n.sy, n.lean, r.x, r.y, r.rot, r.chute, r.swing, w.stars, w.wind].every(Number.isFinite)) return false;
  if (w.flyer && !Number.isFinite(w.flyer.x + w.flyer.y + w.flyer.s)) return false;
  return w.mats.every(m => [m.x, m.y, m.squish, m.flap, m.unfold, m.thingHop].every(Number.isFinite)) && w.drops.every(d => Number.isFinite(d.x + d.y)) &&
    w.pennants.every(p => Number.isFinite(p.x + p.y)) && (!w.marmot || Number.isFinite(w.marmot.x + w.marmot.y)) && (!w.goat || Number.isFinite(w.goat.x + w.goat.y)) && (!w.bird || Number.isFinite(w.bird.x + w.bird.y));
}

function runOne(o) {
  const w = L.mkWorld(o);
  const kid = makeModel(o.model, w, o.age, o.seed + 1);
  const S = { model: o.model, age: o.age, done: false, nan: false, stuck: false, off: 0, time: 0, buckets: {}, act: 0, watch: 0,
    rounds: [], chapters: [], flights: [], launches: 0, autoLaunch: 0, pumpT: [], askToAct: [], rightToAct: [], talkT: [],
    sameThingLaunch: 0, sameThingRound: 0, pairsLaunch: 0, pairsRound: 0, sameSpot: 0, nearestT: 0, nearestN: 0, nearestM: 0, m2: 0,
    hints: 0, hintsMiss: 0, hintsIdle: 0, idles: 0, wrong: 0, assists: 0, pumpExtra: 0 };
  w.newSession();
  const dt = 1 / 30, cap = 1800;
  let t = 0, sig = '', lastChange = 0, R = null, chap = null, prevR = null, pumpStart = 0, auto = false, askAt = -1, rightAt = -1;
  let prevTarget = null, prevRoundLastThing = null, prevLaunchThing = null, watchRun = 0, talkStart = -1, stepWrong = 0;
  const onRight = () => {};
  while (w.state !== 'sessionDone' && t < cap) {
    kid.step(dt); w.update(dt); t += dt;
    if (!finiteWorld(w)) { S.nan = true; break; }
    const Lw = w.layout;
    for (const m of w.mats) if (m.state === 'rest' && (m.x - Lw.S * m.ds / 2 < Lw.ins.left - 2 || m.x + Lw.S * m.ds / 2 > Lw.W - Lw.ins.right + 2 || m.y - Lw.itemH * m.ds < 0 || m.y > Lw.H - Lw.ins.bottom + 2)) S.off++;
    if (w.mimi.x < 0 || w.mimi.x > Lw.W || w.mimi.y < 0 || w.mimi.y > Lw.H) S.off++;
    if (w.rocket.x < -40 || w.rocket.x > Lw.W + 40 || w.rocket.y < -60 || w.rocket.y > Lw.H + 40) S.off++;
    if (w.flyer && (w.flyer.x < -40 || w.flyer.x > Lw.W + 40 || w.flyer.y < -40 || w.flyer.y > Lw.H + 40)) S.off++;
    // ---- time budget
    const key = w.state === 'round' ? w.phase : w.state;
    S.buckets[key] = (S.buckets[key] || 0) + dt;
    const canAct = w.interactive || (w.state === 'talk' && w.talk && !w.talkAnswered);
    if (canAct) { S.act += dt; if (R && watchRun > R.maxWatch) R.maxWatch = watchRun; watchRun = 0; } else { S.watch += dt; watchRun += dt; }
    if (canAct && askAt >= 0 && w.phase === 'play') { S.askToAct.push(w.time - askAt); askAt = -1; }
    if (canAct && rightAt >= 0 && w.phase === 'play') { S.rightToAct.push(w.time - rightAt); rightAt = -1; }
    if (R && canAct) R.actT += dt;
    // stuck
    const s2 = w.state + ':' + w.phase + ':' + w.level + ':' + w.round + ':' + w.launch;
    if (s2 !== sig) { sig = s2; lastChange = t; } else if (t - lastChange > 200) { S.stuck = s2; break; }
    for (const e of w.drainEvents()) {
      if (kid.onEvent) kid.onEvent(e);
      switch (e.type) {
        case 'level': chap = { t0: w.time, rounds: 0 }; break;
        case 'round': {
          if (prevR) { prevR.dur = w.time - prevR.t0; S.rounds.push(prevR); if (chap) chap.rounds++; prevR = null; }
          R = { t0: w.time, k: e.k, m: e.m, short: e.short, stars: 0, launches: 0, actT: 0, maxWatch: 0, hints: 0, wrong: 0, firstAct: -1 };
          const c = w.cur;
          if (c) {
            const ts = c.launches.map(row => thingSig(row.find(q => q.target).thing));
            for (let j = 1; j < ts.length; j++) { S.pairsLaunch++; if (ts[j] === ts[j - 1]) S.sameThingLaunch++; }
            if (prevRoundLastThing !== null) { S.pairsRound++; if (ts[0] === prevRoundLastThing) S.sameThingRound++; }
            prevRoundLastThing = ts[ts.length - 1];
          }
          break;
        }
        case 'ask': case 'next': {
          if (e.type === 'ask') askAt = w.time;
          const tg = w.mats.find(q => q.launch === w.launch && q.target && q.state !== 'gone' && q.state !== 'hidden') || w.mats.find(q => q.launch === w.launch && q.target);
          const ms = w.mats.filter(q => q.launch === w.launch && q.state !== 'gone');
          if (tg) {
            const h = w.matHit(tg.id) || { own: 80 };
            if (prevTarget && Math.hypot(tg.x - prevTarget.x, tg.y - prevTarget.y) < (h.own || 80)) S.sameSpot++;
            prevTarget = { x: tg.x, y: tg.y };
            const P = Lw.pad;
            if (ms.length >= 2) {
              const near = ms.slice().sort((a, b) => Math.hypot(a.x - P.x, a.y - P.y) - Math.hypot(b.x - P.x, b.y - P.y))[0];
              S.nearestN++; S.nearestM += 1 / ms.length; if (near === tg) S.nearestT++;
            }
          }
          break;
        }
        case 'right': rightAt = w.time; stepWrong = 0; if (R) R.launches++; break;
        case 'wrong': S.wrong++; stepWrong++; if (R) R.wrong++; if (stepWrong >= 2 && !w.hintHand && w.time - w._lastHintT > 6.05) S.m2++; break;
        case 'hint': S.hints++; if (e.idle) S.hintsIdle++; else S.hintsMiss++; stepWrong = 0; if (R) R.hints++; break;
        case 'idle': S.idles++; break;
        case 'assist': S.assists++; break;
        case 'pumpAsk': pumpStart = w.time; auto = false; break;
        case 'pump': if (e.auto) auto = true; break;
        case 'launch': S.launches++; S.pumpT.push(w.time - pumpStart); if (auto) S.autoLaunch++; break;
        case 'land': S.flights.push(e.flight); break;
        case 'roundDone': if (R) { R.stars = e.stars; R.assisted = e.assisted; prevR = R; } break;
        case 'talk': if (prevR) { prevR.dur = w.time - prevR.t0; S.rounds.push(prevR); if (chap) chap.rounds++; prevR = null; } talkStart = w.time; break;
        case 'talkResult': if (talkStart >= 0) { S.talkT.push(w.time - talkStart); talkStart = -1; } break;
        case 'levelDone': if (chap) { chap.dur = w.time - chap.t0; S.chapters.push(chap); } chap = null; break;
        case 'sessionDone': S.done = true; break;
      }
    }
  }
  S.time = w.time;
  if (kid.stats && kid.stats.extraPumps) S.pumpExtra = kid.stats.extraPumps;
  return S;
}

/* ------------------------------------------------------------------ summary */
const sum = a => a.reduce((s, x) => s + x, 0);
function summarize(list) {
  const by = {};
  for (const s of list) (by[s.model + '|' + s.age] = by[s.model + '|' + s.age] || []).push(s);
  const rows = [];
  for (const k of Object.keys(by)) {
    const ss = by[k], [model, age] = k.split('|'), rounds = ss.flatMap(s => s.rounds), chaps = ss.flatMap(s => s.chapters), done = ss.filter(s => s.done);
    const nR = Math.max(1, rounds.length), B = {};
    for (const s of ss) for (const b in s.buckets) B[b] = (B[b] || 0) + s.buckets[b];
    const tot = sum(ss.map(s => s.time)) || 1, bs = {};
    for (const b in B) bs[b] = B[b] / ss.length;
    const fl = ss.flatMap(s => s.flights);
    rows.push({ model, age: +age, n: ss.length, done: done.length / ss.length * 100,
      sess: L.mean(done.map(s => s.time)) / 60, sessP90: L.pct(done.map(s => s.time), 0.9) / 60, sessMax: Math.max(0, ...done.map(s => s.time)) / 60,
      chap: L.mean(chaps.map(c => c.dur)), chapP10: L.pct(chaps.map(c => c.dur), 0.1), chapP90: L.pct(chaps.map(c => c.dur), 0.9),
      cut: chaps.filter(c => c.rounds < 4).length / Math.max(1, chaps.length) * 100,
      round: L.mean(rounds.map(r => r.dur)), roundP90: L.pct(rounds.map(r => r.dur), 0.9), roundMax: Math.max(0, ...rounds.map(r => r.dur)), over120: rounds.filter(r => r.dur > 120).length,
      launchesPerRound: L.mean(rounds.map(r => r.launches)), kMean: L.mean(rounds.map(r => r.k)), mMean: L.mean(rounds.map(r => r.m)), m3: rounds.filter(r => r.m >= 3).length / nR * 100, roundsPerSess: rounds.length / ss.length,
      flight: L.mean(fl), flightP10: L.pct(fl, 0.1), flightP90: L.pct(fl, 0.9), flightMax: Math.max(0, ...fl),
      pump: L.mean(ss.flatMap(s => s.pumpT)), autoPct: sum(ss.map(s => s.autoLaunch)) / Math.max(1, sum(ss.map(s => s.launches))) * 100,
      askToAct: L.mean(ss.flatMap(s => s.askToAct)), askToActMax: Math.max(-99, ...ss.flatMap(s => s.askToAct)), rightToAct: L.mean(ss.flatMap(s => s.rightToAct)), rightToActP90: L.pct(ss.flatMap(s => s.rightToAct), 0.9),
      actPct: sum(ss.map(s => s.act)) / tot * 100, watchPct: sum(ss.map(s => s.watch)) / tot * 100,
      watchPerLaunch: sum(ss.map(s => s.watch)) / Math.max(1, sum(ss.map(s => s.launches))), maxWatch: L.mean(rounds.map(r => r.maxWatch)), maxWatchP90: L.pct(rounds.map(r => r.maxWatch), 0.9),
      buckets: bs,
      hintsPerRound: sum(ss.map(s => s.hints)) / nR, hintRounds: rounds.filter(r => r.hints > 0).length / nR * 100, idlePerSess: L.mean(ss.map(s => s.idles)),
      assistPerSess: L.mean(ss.map(s => s.assists)), wrongPerRound: sum(ss.map(s => s.wrong)) / nR,
      st3: rounds.filter(r => r.stars === 3).length / nR * 100, st2: rounds.filter(r => r.stars === 2).length / nR * 100, st1: rounds.filter(r => r.stars === 1).length / nR * 100,
      talk: L.mean(ss.flatMap(s => s.talkT)),
      sameThingLaunch: sum(ss.map(s => s.sameThingLaunch)) / Math.max(1, sum(ss.map(s => s.pairsLaunch))) * 100,
      sameThingRound: sum(ss.map(s => s.sameThingRound)) / Math.max(1, sum(ss.map(s => s.pairsRound))) * 100,
      sameSpot: sum(ss.map(s => s.sameSpot)) / Math.max(1, sum(ss.map(s => s.nearestN))) * 100,
      nearestT: sum(ss.map(s => s.nearestT)) / Math.max(1, sum(ss.map(s => s.nearestN))) * 100, nearestChance: sum(ss.map(s => s.nearestM)) / Math.max(1, sum(ss.map(s => s.nearestN))) * 100,
      pumpExtra: L.mean(ss.map(s => s.pumpExtra)),
      nan: ss.filter(s => s.nan).length, stuck: ss.filter(s => s.stuck).length, off: sum(ss.map(s => s.off)), m2: sum(ss.map(s => s.m2)) });
  }
  rows.sort((a, b) => MODELS.indexOf(a.model) - MODELS.indexOf(b.model) || a.age - b.age);
  return rows;
}
const f1 = L.f1, f2 = x => (+x).toFixed(2);
function table(rows) {
  const o = [];
  o.push('### A. Durations and outcome', '',
    '| model | age | n | done % | session min mean (p90, max) | chapter s mean [p10–p90] · cut % | round s mean (p90, max) · > 120 s | launches / round · mats (k × m, % rounds with 3 mats) · rounds / session | flight s mean [p10–p90] (max) | pump s · auto % | stars 3/2/1 % | hints / round (rounds with a hint %) · idles / session · assists / session | wrong / round | NaN / stuck / off / 2-miss-no-hint |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) o.push(`| ${r.model} | ${r.age} | ${r.n} | ${f1(r.done)} | ${f1(r.sess)} (${f1(r.sessP90)}, ${f1(r.sessMax)}) | ${f1(r.chap)} [${f1(r.chapP10)}–${f1(r.chapP90)}] · ${f1(r.cut)} | ${f1(r.round)} (${f1(r.roundP90)}, ${f1(r.roundMax)}) · ${r.over120} | ${f2(r.launchesPerRound)} · ${f2(r.kMean)} × ${f2(r.mMean)} (${f1(r.m3)}) · ${f1(r.roundsPerSess)} | ${f2(r.flight)} [${f2(r.flightP10)}–${f2(r.flightP90)}] (${f2(r.flightMax)}) | ${f1(r.pump)} · ${f1(r.autoPct)} | ${f1(r.st3)}/${f1(r.st2)}/${f1(r.st1)} | ${f2(r.hintsPerRound)} (${f1(r.hintRounds)}) · ${f1(r.idlePerSess)} · ${f1(r.assistPerSess)} | ${f2(r.wrongPerRound)} | ${r.nan} / ${r.stuck} / ${r.off} / ${r.m2} |`);
  o.push('', '### B. Watching vs acting', '',
    '| model | age | act % / watch % of the session | watch s per launch | longest watch stretch per round s mean (p90) | ask → first possible tap s (max) | right → next possible tap s mean (p90) | per session s: intro · unfold · play · aim · pump · flight · collect · camp · wipe · talk · levelDone |',
    '|---|---|---|---|---|---|---|---|');
  const BK = ['intro', 'unfold', 'play', 'aim', 'pump', 'flight', 'collect', 'camp', 'wipe', 'talk', 'levelDone'];
  for (const r of rows) o.push(`| ${r.model} | ${r.age} | ${f1(r.actPct)} / ${f1(r.watchPct)} | ${f1(r.watchPerLaunch)} | ${f1(r.maxWatch)} (${f1(r.maxWatchP90)}) | ${f2(r.askToAct)} (${f2(r.askToActMax)}) | ${f1(r.rightToAct)} (${f1(r.rightToActP90)}) | ${BK.map(b => f1(r.buckets[b] || 0)).join(' · ')} |`);
  o.push('', '### C. Content / layout repetition', '',
    '| model | age | same target thing on consecutive launches % | same thing last launch → next round % | target within one mat of the last target % | target = mat nearest the pad % (chance %) | Talk s (ask → answer) |',
    '|---|---|---|---|---|---|---|');
  for (const r of rows) o.push(`| ${r.model} | ${r.age} | ${f1(r.sameThingLaunch)} | ${f1(r.sameThingRound)} | ${f1(r.sameSpot)} | ${f1(r.nearestT)} (${f1(r.nearestChance)}) | ${f1(r.talk)} |`);
  return o.join('\n');
}

if (process.argv.includes('--worker')) {
  process.on('message', jobs => {
    const res = [];
    for (const j of jobs) { try { res.push(runOne(j)); } catch (e) { console.error('session failed', JSON.stringify(j), e.stack); res.push({ model: j.model, age: j.age, failed: String(e) }); } }
    process.send(res, () => process.exit(0));
  });
} else {
  const jobs = [];
  for (const model of MODELS) for (const age of AGES) {
    if (model === 'slow3' && age > 4) continue;
    const n = /^(typical|kid|botT)/.test(model) ? N : Math.max(20, Math.round(N / 2));
    for (let i = 0; i < n; i++) jobs.push({ model, age, seed: 5000 + i * 41 + age * 7, vp: VPS[i % VPS.length], lang: i % 2 ? 'vi' : 'en', config });
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
    const list = rs.flat(), failed = list.filter(s => s.failed), rows = summarize(list.filter(s => !s.failed));
    const head = `# hs_deep ${TAG} — ${list.length} sessions (${failed.length} failed), config ${JSON.stringify(config)} (${((Date.now() - t0) / 1000).toFixed(0)} s)\n\n`;
    const md = head + table(rows);
    console.log(md);
    const dir = path.join(__dirname, 'out');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'deep_' + TAG + '.md'), md + '\n');
    fs.writeFileSync(path.join(dir, 'deep_' + TAG + '.json'), JSON.stringify({ config, rows }, null, 1));
    if (failed.length || rows.some(r => r.nan || r.stuck || r.off)) { console.log('\nFAIL'); process.exit(1); }
  }).catch(e => { console.error(e); process.exit(1); });
}
