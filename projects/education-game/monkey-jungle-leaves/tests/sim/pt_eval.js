#!/usr/bin/env node
// Lolo's Jungle Leaf Match — independent high-speed evaluation (report-only; never edits game code).
// Drives the headless world (tests/sim/lib.js) with the bots and child models plus a new "unfocused" child (drops focus:
// looks away 15–45 s now and then) and measures, per round: phase overheads (scroll / peek+hide / play / post-solve),
// mismatches, hints (auto / idle / same-tap) and whether the hinted pair is the next one found, idle nudges, stars,
// surprise-critter outcome (never shown / tapped / ignored), speech-triggering events (as main.js maps them), content
// variety (keys shared with the previous round, food animals per session).
//   node tests/sim/pt_eval.js --name eval_base [--n 6] [--drivers typical,careful4] [--ages 3,4,5] [--config '{…}'] [--focus 20]
// Writes tests/sim/out/<name>.json (compact rounds) — tables come from pt_eval_report.js.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Worker, isMainThread, parentPort } = require('worker_threads');

const DRIVERS = ['bot0.3', 'bot0.6', 'bot0.9', 'bot1', 'typical', 'careful4', 'toddler', 'slow3', 'tapper', 'spammer', 'unfocused'];
const VPS = ['iphoneP', 'iphoneL', 'ipadL', 'ipadP'];

/* ---------------------------------------------------------------- the "drops focus" child (wraps a typical kid of its age) */
function makeUnfocused(L, w, age, seed) {
  const kid = L.makeDriver('typical', w, age, seed), r = new L.LL.RNG(seed ^ 0x5bd1);
  const o = { away: 0, nAway: 0, stats: kid.stats, step(dt) {
    if (this.away > 0) { this.away -= dt; return; }
    // in play: hazard 1/45 s of looking away for 15–45 s (watching the cars, talking to mum …); in Talk 1/30 s for 8–20 s
    const inPlay = w.state === 'round' && (w.phase === 'play' || w.phase === 'resolve');
    if (inPlay && r.chance(dt / 45)) { this.away = r.float(15, 45); this.nAway++; return; }
    if (w.state === 'talk' && !w.talkAnswered && r.chance(dt / 30)) { this.away = r.float(8, 20); this.nAway++; return; }
    kid.step(dt);
  } };
  return o;
}

function runOne(j) {
  const L = require('./lib');
  const age = j.age, vp = L.VIEWPORTS[j.vp], dt = 1 / 30, maxTime = 2400;
  const w = new L.LL.World({ seed: j.seed, age, lang: j.lang, config: j.config || {} });
  w.setViewport(vp.W, vp.H, vp.ins);
  const drv = j.driver === 'unfocused' ? makeUnfocused(L, w, age, j.seed * 7919 + 13) : L.makeDriver(j.driver, w, age, j.seed * 7919 + 13);
  const S = { d: j.driver, a: age, l: j.lang, vp: j.vp, seed: j.seed, done: false, T: null, stars: 0, ch: [], R: [], talk: [], err: null };
  let rd = null, ch = null, tScroll = null, prev = null, talkT = null;
  const closePrev = (t, kind) => { if (prev && prev.post === undefined && prev.tSolved != null) { prev.post = +(t - prev.tSolved).toFixed(2); prev.nextKind = kind; } };
  const handle = (e) => {
    const t = w.time;
    switch (e.type) {
      case 'level': if (ch) ch.dur = +(t - ch.t0).toFixed(1); ch = { topic: e.topic, t0: t, rounds: 0, stars: 0 }; S.ch.push(ch); closePrev(t, 'level'); break;
      case 'scroll': tScroll = t; closePrev(t, 'scroll'); break;
      case 'round': {
        rd = { l: w.level, r: e.round, tp: e.topic, p: e.pairs, n: w.cards.length, sp: e.surprise || null, t0: tScroll != null ? tScroll : t,
          tPeek: null, tPlay: null, tSolved: null, tDone: null, mm: 0, hA: 0, hI: 0, hFol: 0, hDelay: [], idl: 0, st: 0,
          cr: e.surprise ? 'none' : null, crT: null, crLife: null, v: {}, keys: w.cards.map(c => c.key + (c.face && c.face.obj ? '/' + c.face.obj : '')).sort(),
          hints: [] };
        S.R.push(rd); prev = rd; if (ch) ch.rounds++; tScroll = null;
        rd.v.prompt = 1; break;
      }
      case 'peek': if (rd) { rd.tPeek = t; rd.v.peek = 1; } break;
      case 'hide': if (rd) rd.v.hide = 1; break;
      case 'play': if (rd) rd.tPlay = t; break;
      case 'flip': if (rd) rd.v.flip = (rd.v.flip || 0) + 1; break;
      case 'tap': if (rd) rd.v.tap = (rd.v.tap || 0) + 1; break;
      case 'match': if (rd) {
        rd.v.match = (rd.v.match || 0) + 1;
        if (e.found >= e.pairs) rd.tSolved = t;
        for (const h of rd.hints) if (!h.done && (h.a === e.a || h.a === e.b)) { h.done = true; rd.hDelay.push(+(t - h.t).toFixed(1)); if (h.first) rd.hFol++; }
        for (const h of rd.hints) h.first = false;
      } break;
      case 'mismatch': if (rd) { rd.mm++; rd.v.mis = (rd.v.mis || 0) + 1; for (const h of rd.hints) h.first = false; } break;
      case 'hint': if (rd) { if (e.idle) rd.hI++; else rd.hA++; rd.hints.push({ a: e.a, t, done: false, first: true }); if (!e.idle) rd.v.hint = (rd.v.hint || 0) + 1; } break;
      case 'idle': if (rd) { rd.idl++; if (rd.idl <= 4) rd.v.idle = (rd.v.idle || 0) + 1; } break;
      case 'critter': if (rd) {
        if (e.action === 'enter') { rd.cr = 'ignored'; rd.crT = t; rd.v.crit = (rd.v.crit || 0) + 1; }
        if (e.action === 'tap' && rd.cr !== 'tapped') { rd.cr = 'tapped'; rd.crTap = +(t - rd.crT).toFixed(1); rd.v.critTap = 1; }
      } break;
      case 'cheer': if (rd) rd.v.cheer = 1; break;
      case 'roundDone': if (rd) { rd.tDone = t; rd.st = e.stars; if (e.stars >= 3) rd.v.great = 0.5; } if (ch) ch.stars += e.stars; break;
      case 'talk': talkT = t; closePrev(t, 'talk'); break;
      case 'talkAsk': S.talkAsks = (S.talkAsks || 0) + 1; break;
      case 'talkResult': if (talkT != null) S.talk.push(+(t - talkT).toFixed(1)); if (ch && e.correct) ch.stars++; break;
      case 'sessionDone': S.done = true; S.T = +t.toFixed(1); S.stars = e.stars; if (ch) ch.dur = +(t - ch.t0).toFixed(1); closePrev(t, 'end'); break;
    }
  };
  try {
    w.newSession(); for (const e of w.drainEvents()) handle(e);
    let t = 0;
    while (t < maxTime && w.state !== 'sessionDone') {
      drv.step(dt); w.update(dt); t += dt;
      for (const e of w.drainEvents()) handle(e);
      // critter life: when it is gone (or the round ended) note how long it was on screen
      if (rd && rd.crT != null && rd.crLife == null && (!w.critter || w.critter.state === 'gone' || w.state !== 'round')) rd.crLife = +(w.time - rd.crT).toFixed(1);
    }
  } catch (err) { S.err = String(err && err.stack || err).slice(0, 300); }
  // compact rounds
  S.R = S.R.map(r => ({ l: r.l, r: r.r, tp: r.tp, p: r.p, n: r.n, sp: r.sp,
    pre: r.tPlay != null ? +(r.tPlay - r.t0).toFixed(2) : null, scr: r.tPeek != null ? +(r.tPeek - r.t0).toFixed(2) : null,
    play: r.tSolved != null && r.tPlay != null ? +(r.tSolved - r.tPlay).toFixed(1) : null,
    dur: r.tDone != null ? +(r.tDone - r.t0).toFixed(1) : null, post: r.post, nk: r.nextKind,
    mm: r.mm, hA: r.hA, hI: r.hI, hFol: r.hFol, hDelay: r.hDelay, idl: r.idl, st: r.st, cr: r.cr, crTap: r.crTap, crLife: r.crLife,
    v: r.v, k: r.keys.join(',') }));
  S.ch = S.ch.map(c => ({ tp: c.topic, dur: c.dur, rounds: c.rounds, stars: c.stars }));
  if (drv.nAway !== undefined) S.away = drv.nAway;
  return S;
}

function runJobs(jobs, nWorkers, file) {
  return new Promise((resolve, reject) => {
    const nw = Math.max(1, Math.min(os.cpus().length, nWorkers || os.cpus().length, jobs.length));
    const res = []; let left = nw, next = 0;
    for (let k = 0; k < nw; k++) {
      const wk = new Worker(file || __filename);
      const feed = () => { if (next < jobs.length) wk.postMessage(jobs[next++]); else wk.postMessage(null); };
      wk.on('message', (r) => { if (r === 'bye') { if (--left === 0) resolve(res); return; } res.push(r); if (res.length % 250 === 0) process.stderr.write(res.length + '/' + jobs.length + '\n'); feed(); });
      wk.on('error', reject);
      feed();
    }
  });
}

if (isMainThread && require.main === module) {
  const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
  const name = get('name', 'eval_base'), n = +get('n', 6), config = JSON.parse(get('config', '{}'));
  const drivers = get('drivers', DRIVERS.join(',')).split(','), ages = get('ages', '3,4,5,6,7').split(',').map(Number);
  const langs = get('langs', 'en,vi').split(','), vps = get('vps', VPS.join(',')).split(',');
  const focus = +get('focus', 0);   // extra seeds for the child models at ages 3–5
  const jobs = []; let seed = +get('seed0', 70000);
  for (const driver of drivers) for (const age of ages) for (const lang of langs) for (const vp of vps) {
    const kidCell = ['typical', 'careful4', 'slow3', 'toddler', 'unfocused'].includes(driver) && age <= 5;
    const k = n + (kidCell ? focus : 0);
    for (let i = 0; i < k; i++) jobs.push({ driver, age, lang, vp, seed: seed++, config });
  }
  const t0 = Date.now();
  runJobs(jobs, +get('workers', 0)).then((res) => {
    const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify({ name, config, sessions: res }));
    console.log(`${res.length} sessions in ${((Date.now() - t0) / 1000).toFixed(0)} s → tests/sim/out/${name}.json`);
  });
} else if (!isMainThread) {
  parentPort.on('message', (j) => {
    if (j === null) { parentPort.postMessage('bye'); parentPort.close(); return; }
    parentPort.postMessage(runOne(j));
  });
}
module.exports = { runOne, runJobs, DRIVERS };
