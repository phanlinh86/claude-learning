#!/usr/bin/env node
// Bao's Bubble Sky — QA high-speed playtest (report-only; never edits game/js). Extends hs_playtest with the probes the QA
// playtester needs: late-tap reliability on MOVING bubbles, bubble speed, overlaps (bubble/bubble, bubble/keep-outs, Bao),
// whoosh / Talk-time durations, countPop / countSel correctness, content repeats across a session and across "Play again".
//   node tests/sim/qa_playtest.js [--n 100] [--ages 3,4,5,6,7] [--models bot0.3,...] [--config '{…}'] [--jobs 2] [--tag x] [--again 1]
// → tests/sim/out/qa_<tag>.json (raw aggregates) + a markdown summary on stdout.
// Models: bot0.3 / bot0.6 / bot0.9 (PB.Bot), typical (lib.js age profile), slow48 (3-year-old who waits 4–8 s before each tap),
// late0.4 (typical, but the finger lands exactly where the bubble was 0.4 s earlier, no aim error), tapper, spammer, absent.
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const L = require('./lib');
const PB = L.PB;

const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 100), config = JSON.parse(get('config', '{}')), TAG = get('tag', 'qa'), JOBS = +get('jobs', 2), AGAIN = +get('again', 1);
const MODELS = get('models', 'bot0.3,bot0.6,bot0.9,typical,slow48,late0.4,tapper,spammer,absent').split(',');
const AGES = get('ages', '3,4,5,6,7').split(',').map(Number);
const VPS = Object.keys(L.VIEWPORTS);
const LAGS = [6, 9, 12];   // frames at 1/30 s = 0.2 / 0.3 / 0.4 s

function mk(name, w, age, seed) {
  if (name === 'slow48') return new L.Kid(w, Object.assign(L.typicalProfile(3), { skill: 0.65, think: [4, 8], between: [4, 8], aim: 0.8, react: [0.25, 0.5], pDistract: 0.1 }), seed);
  if (name === 'late0.4') return new L.Kid(w, Object.assign(L.typicalProfile(age), { react: [0.4, 0.4], aim: 0 }), seed);
  return L.makeModel(name, w, age, seed);
}
const newProbe = () => ({ n: 0, hit: 0, nb: 0, miss: 0 });
function boxDist(b, x, y) { const dx = Math.max(b.x - x, 0, x - b.x - b.w), dy = Math.max(b.y - y, 0, y - b.y - b.h); return Math.hypot(dx, dy); }

function runOne(o) {
  const w = L.mkWorld(o), d = mk(o.model, w, o.age, o.seed + 1), quiet = o.model === 'absent';
  const S = { model: o.model, age: o.age, sessions: [], probe: {}, speed: { all: [], settled: [], maxSettled: 0, max: 0 }, overlap: { frames: 0, any: 0, deep: 0, maxDepth: 0, keep: 0, keepMax: 0, bao: 0, baoMax: 0 },
    whoosh: [], talk: [], countErr: [], idleGaps: [], hintGapMin: 1e9, keysRepSession: 0, keysN: 0, sameThingSet: 0, topicOrderSame: 0, nan: false };
  for (const season of [0, 1, 2, 3]) for (const lag of LAGS) { S.probe[season + ':' + lag] = newProbe(); S.probe[season + ':' + lag + ':aim'] = newProbe(); S.probe[season + ':' + lag + ':mv'] = newProbe(); S.probe[season + ':' + lag + ':early'] = newProbe(); S.probe[season + ':' + lag + ':late'] = newProbe(); }
  const dt = 1 / 30, hist = [];   // hist[f] = Map id → {x, y}
  let prevTopics = null;
  for (let sess = 0; sess < (quiet ? 1 : o.again || 1); sess++) {
    w.newSession(prevTopics ? { lastTopics: prevTopics } : undefined);
    const T = { done: false, time0: w.time, rounds: [], chapters: [], keys: [], asks: [] };
    let R = null, chap = null, t = 0, whooshT = -1, talkT = -1, lastAskT = -1, cur = null, probeT = 0, lastHintT = -1e9, phase = '';
    const cap = quiet ? 400 : 1800;
    while (w.state !== 'sessionDone' && t < cap) {
      d.step(dt); w.update(dt); t += dt;
      if (!w.bubbles.every(b => Number.isFinite(b.x + b.y + b.vx + b.vy))) { S.nan = true; break; }
      const ph = w.state + ':' + w.phase;
      if (ph !== phase) { if (phase === 'roundDone:whoosh' && whooshT >= 0) { S.whoosh.push(w.time - whooshT); whooshT = -1; } phase = ph; }
      // ---- per-frame motion / overlap probes (floating bubbles only)
      const fl = w.bubbles.filter(b => b.state === 'float'), Lw = w.layout, mp = new Map();
      for (const b of fl) mp.set(b.id, { x: b.x, y: b.y });
      hist.push(mp); if (hist.length > 13) hist.shift();
      if (w.state === 'round' && w.phase === 'play') {
        S.overlap.frames++;
        let any = false, deep = false;
        for (let i = 0; i < fl.length; i++) for (let j = i + 1; j < fl.length; j++) {
          const a = fl[i], b = fl[j], dep = a.r + b.r - Math.hypot(a.x - b.x, a.y - b.y);
          if (dep > 0) { any = true; if (dep > 10) deep = true; S.overlap.maxDepth = Math.max(S.overlap.maxDepth, dep); }
        }
        if (any) S.overlap.any++; if (deep) S.overlap.deep++;
        let kp = 0, bp = 0;
        for (const b of fl) {
          for (const k of Lw.keep) kp = Math.max(kp, b.r - boxDist(k, b.x, b.y));
          bp = Math.max(bp, b.r - boxDist(Lw.bao.box, b.x, b.y));
          const v = Math.hypot(b.vx, b.vy);
          S.speed.max = Math.max(S.speed.max, v);
          if (w.phaseTime > 2) S.speed.maxSettled = Math.max(S.speed.maxSettled, v);
          if (Math.random() < 0.05) (w.phaseTime > 2 ? S.speed.settled : S.speed.all).push(+v.toFixed(0));
        }
        if (kp > 0) { S.overlap.keep++; S.overlap.keepMax = Math.max(S.overlap.keepMax, kp); }
        if (bp > 0) { S.overlap.bao++; S.overlap.baoMax = Math.max(S.overlap.baoMax, bp); }
      }
      // ---- late-tap probe (no press: asks the world's own hit test what a finger at the OLD spot would get NOW)
      if (w.interactive && (probeT += dt) >= 0.25 && hist.length >= 13) {
        probeT = 0;
        for (const lag of LAGS) {
          const old = hist[hist.length - 1 - lag];
          for (const b of fl) {
            const p = old.get(b.id); if (!p) continue;
            const v = Math.hypot(b.vx, b.vy), moving = v > 60;
            for (const kind of ['', ':aim', ':mv', ':early', ':late']) {
              if (kind === ':mv' && !moving) continue;
              if (kind === ':early' && w.phaseTime > 1.5) continue;
              if (kind === ':late' && w.phaseTime <= 1.5) continue;
              let x = p.x, y = p.y;
              if (kind === ':aim') { const a = Math.random() * 6.283, rr = 0.5 * b.r * Math.sqrt(Math.random()); x += Math.cos(a) * rr; y += Math.sin(a) * rr; }
              const h = w._bubbleAt(x, y), pr = S.probe[w.weather + ':' + lag + kind];
              pr.n++; if (!h) pr.miss++; else if (h.b.id === b.id) pr.hit++; else pr.nb++;
            }
          }
        }
        if (fl.length) for (const b of fl) if (!hist[0].has(b.id)) {}   // (bubbles that detached < 0.4 s ago are skipped above)
      }
      for (const e of w.drainEvents()) {
        if (d.onEvent) d.onEvent(e);
        switch (e.type) {
          case 'level': chap = { topic: e.topic, t0: w.time, rounds: 0, level: e.level }; break;
          case 'round':
            R = { topic: w.topic, ri: e.round, t0: w.time, n: e.n, k: e.k, mode: e.mode, short: e.short, wrong: 0, hint: 0, idle: 0, assist: 0, rights: [], counts: [], ask: null, things: w.bubbles.map(b => JSON.stringify(b.thing)).sort().join('|') };
            T.keys.push(e.key); break;
          case 'ask': if (R) { R.ask = e; R.askT = w.time; } lastAskT = w.time; T.asks.push(JSON.stringify(e.rule && e.rule.value)); break;
          case 'wrong': if (R) R.wrong++; break;
          case 'assist': if (R) R.assist++; break;
          case 'hint': if (R) R.hint++; if (!e.idle || true) { if (lastHintT > -1e8) S.hintGapMin = Math.min(S.hintGapMin, w.time - lastHintT); lastHintT = w.time; } break;
          case 'idle': if (R) R.idle++; if (quiet) S.idleGaps.push(+(w.time - lastAskT).toFixed(1)); break;
          case 'right': if (R) { R.rights.push(e); if (R.rights.length === 1) R.first = w.time - R.askT; } break;
          case 'count': if (R) R.counts.push(e); break;
          case 'roundDone': if (R) { R.stars = e.stars; R.doneT = w.time; } break;
          case 'whoosh': whooshT = w.time; break;
          case 'talk': talkT = w.time; break;
          case 'levelDone': if (talkT >= 0) { S.talk.push(w.time - talkT); talkT = -1; } if (chap) { chap.dur = w.time - chap.t0; T.chapters.push(chap); } chap = null; break;
          case 'sessionDone': T.done = true; break;
        }
        if ((e.type === 'round' || e.type === 'talk') && T._prev) { const P = T._prev; P.dur = w.time - P.t0; T.rounds.push(P); if (chap) chap.rounds++; T._prev = null; check(P, S); }
        if (e.type === 'roundDone') T._prev = R;
      }
    }
    T.time = w.time - T.time0; delete T._prev;
    // content repeats inside the session (across chapters) + consecutive same ask
    const seen = new Set(); for (const k of T.keys) { if (seen.has(k)) S.keysRepSession++; seen.add(k); } S.keysN += T.keys.length;
    const ts = new Set(); for (const r of T.rounds) { if (ts.has(r.things)) S.sameThingSet++; ts.add(r.things); }
    if (prevTopics && prevTopics.join() === w.levels.join()) S.topicOrderSame++;
    prevTopics = w.levels.slice();
    S.sessions.push({ done: T.done, time: T.time, rounds: T.rounds.map(r => ({ topic: r.topic, ri: r.ri, dur: r.dur, n: r.n, k: r.k, mode: r.mode, short: r.short, wrong: r.wrong, hint: r.hint, idle: r.idle, assist: r.assist, stars: r.stars, first: r.first, play: r.doneT - r.askT, long: r.dur > 120 })),
      chapters: T.chapters.map(c => ({ topic: c.topic, dur: c.dur, rounds: c.rounds, level: c.level })) });
  }
  return S;
}
/** countPop: right.count = 1..k in order, exactly k rights, ask n = k; countSel: count events 1..n on the freed thing, n = asked n. */
function check(R, S) {
  if (!R.ask) return;
  if (R.mode === 'countPop') {
    const n = R.ask.params && R.ask.params.n;
    if (R.rights.length !== R.k) S.countErr.push('countPop rights ' + R.rights.length + ' ≠ k ' + R.k);
    R.rights.forEach((e, i) => { if (e.count !== i + 1) S.countErr.push('countPop count ' + e.count + ' at ' + (i + 1)); });
    if (+n !== R.k) S.countErr.push('countPop asked ' + n + ' ≠ k ' + R.k);
  } else if (R.mode === 'countSel') {
    const n = R.ask.params && +R.ask.params.n, e = R.rights[0];
    if (!e || e.n !== n || (e.thing && e.thing.n !== n)) S.countErr.push('countSel thing ' + (e && e.n) + ' ≠ asked ' + n);
    const c = R.counts.map(x => x.i).join(','), want = Array.from({ length: n }, (_, i) => i + 1).join(',');
    if (c !== want) S.countErr.push('countSel counted ' + c + ' want ' + want);
  }
}

if (process.argv.includes('--worker')) {
  process.on('message', jobs => {
    const res = [];
    for (const j of jobs) { try { res.push(runOne(j)); } catch (e) { res.push({ model: j.model, age: j.age, failed: String(e.stack) }); } }
    process.send(res, () => process.exit(0));
  });
} else {
  const jobs = [];
  for (const model of MODELS) for (const age of AGES) {
    const n = model === 'absent' ? Math.min(N, 3) : N;
    for (let i = 0; i < n; i++) jobs.push({ model, age, seed: 5000 + i * 41 + age * 11 + (+get('seed', 0)), vp: VPS[i % VPS.length], lang: i % 2 ? 'vi' : 'en', config, again: AGAIN });
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
    const list = rs.flat();
    const dir = path.join(__dirname, 'out'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'qa_' + TAG + '.json'), JSON.stringify({ config, list }));
    console.log(`qa ${TAG}: ${list.length} worlds (${list.filter(s => s.failed).length} failed) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    list.filter(s => s.failed).slice(0, 3).forEach(s => console.log(s.failed));
  });
}
