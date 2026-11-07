#!/usr/bin/env node
// Nini's Sea Painting — HIGH-SPEED headless playtest with child models (report-only; never edits game/js).
//   node tests/sim/hs_playtest.js [--n 120] [--ages 3,4,5,6,7] [--models typical,slow3,...] [--config '{…}'] [--jobs 2] [--tag name]
// Every session is simulated at full speed through the real input API (a tap = press, a few frames of hold + finger wobble,
// lift; at 1/30 s frames). Models (tests/sim/lib.js): typical, slow3 (slow 3-year-old), perfect, tapper (random taps
// anywhere), spammer (3–4 taps/s on random parts / shells), absent (never touches), bot<skill> (SP.Bot).
// Output: markdown tables on stdout + tests/sim/out/hs_<tag>.md (+ .json, git-ignored).
// Targets: typical age 3–4 chapter 60–100 s, session ≤ 8 min (p90); 0 stuck rounds (> 120 s) for an engaged model, 0 stuck
// states (no progress for 200 s) for any model, 0 NaN; every 2nd miss in a step hinted (unless within the 6 s cooldown).
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const L = require('./lib');

const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 120), config = JSON.parse(get('config', '{}'));
const ALL = 'typical,slow3,perfect,tapper,spammer,bot0.8,absent';
const MODELS = get('models', ALL).split(','), AGES = get('ages', '3,4,5,6,7').split(',').map(Number);
const TAG = get('tag', 'base'), JOBS = +get('jobs', 2);
const VPS = Object.keys(L.VIEWPORTS);

function finiteWorld(w) {
  const P = w.pic, B = w.brush;
  if (![P.x, P.y, P.rot, P.sx, P.sy, P.wig, B.x, B.y, B.angle, w.stars].every(Number.isFinite)) return false;
  return w.parts.every(p => Number.isFinite(p.t) && Number.isFinite(p.wob)) && w.shells.every(s => Number.isFinite(s.pop) && Number.isFinite(s.wob));
}

function runOne(o) {
  const w = L.mkWorld(o);
  const d = L.makeModel(o.model, w, o.age, o.seed + 1);
  const quiet = o.model === 'absent';
  const S = { model: o.model, age: o.age, done: false, nan: false, time: 0, stuckState: false, rounds: [], chapters: [], talks: 0, talkRight: 0, talkAuto: 0,
    miss2NoHint: 0, offScreen: 0, topics: null, idles: [] };
  w.newSession();
  const dt = 1 / 30, cap = o.cap || (quiet ? 300 : 1800);
  let R = null, chap = null, t = 0, lastChange = 0, sig = '';
  while (w.state !== 'sessionDone' && t < cap) {
    d.step(dt); w.update(dt); t += dt;
    if (!finiteWorld(w)) { S.nan = true; break; }
    if (w.brush.x < -60 || w.brush.x > w.layout.W + 60 || w.brush.y < -60 || w.brush.y > w.layout.H + 60) S.offScreen++;
    const s2 = w.state + ':' + w.phase + ':' + w.level + ':' + w.round + ':' + w.step + ':' + w.parts.filter(p => p.painted).length;
    if (s2 !== sig) { sig = s2; lastChange = t; } else if (!quiet && t - lastChange > 200) { S.stuckState = s2; break; }
    for (const e of w.drainEvents()) {
      if (d.onEvent) d.onEvent(e);
      switch (e.type) {
        case 'session': S.topics = e.levels; break;
        case 'level': chap = { topic: e.topic, t0: w.time, rounds: 0 }; break;
        case 'round': R = { topic: w.topic, ri: e.round, t0: w.time, steps: e.steps, mode: e.mode, wrong: 0, needPaint: 0, notThis: 0, already: 0, hintMiss: 0, hintIdle: 0,
          idle: 0, paints: 0, surprise: e.surprise, firstAsk: 0, paintT: 0, pend2: null, stepMiss: 0, lastProg: w.time, maxGap: 0 }; break;
        case 'ask': if (R) { if (e.first) R.firstAsk = w.time; if (!e.follow) { R.stepMiss = 0; R.lastProg = w.time; } } break;
        case 'wrong':
          if (R) { R.wrong++; R.stepMiss++; if (R.stepMiss === 2) R.pend2 = w.time; }
          break;
        case 'needPaint': if (R) R.needPaint++; break;
        case 'notThis': if (R) R.notThis++; break;
        case 'already': if (R) R.already++; break;
        case 'paint': if (R) { R.paints++; R.maxGap = Math.max(R.maxGap, w.time - R.lastProg); R.lastProg = w.time; } break;
        case 'pick': if (R && !e.again) { R.maxGap = Math.max(R.maxGap, w.time - R.lastProg); R.lastProg = w.time; } break;
        case 'idle': if (R) R.idle++; if (quiet) S.idles.push(+(w.time).toFixed(1)); break;
        case 'hint': if (R) { if (e.idle) R.hintIdle++; else R.hintMiss++; R.pend2 = null; } break;
        case 'finish': if (R) R.paintT = w.time - R.firstAsk; break;
        case 'roundDone':
          if (R) {
            R.dur = w.time - R.t0; R.stars = e.stars;
            if (R.pend2 !== null) S.miss2NoHint++;
            S.rounds.push(R); if (chap) chap.rounds++;
          }
          R = null; break;
        case 'talk': S.talks++; break;
        case 'talkResult': if (e.correct) S.talkRight++; if (e.auto) S.talkAuto++; break;
        case 'levelDone': if (chap) { chap.dur = w.time - chap.t0; chap.cut = chap.rounds < 4; S.chapters.push(chap); } chap = null; break;
        case 'sessionDone': S.done = true; break;
      }
    }
  }
  S.time = w.time;
  return S;
}

function summarize(list) {
  const by = {};
  for (const s of list) (by[s.model + '|' + s.age] = by[s.model + '|' + s.age] || []).push(s);
  const rows = [], topicRows = [];
  for (const k of Object.keys(by)) {
    const ss = by[k], [model, age] = k.split('|');
    const rounds = ss.flatMap(s => s.rounds), chaps = ss.flatMap(s => s.chapters), done = ss.filter(s => s.done);
    const st = [3, 2, 1].map(n => rounds.filter(r => r.stars === n).length / Math.max(1, rounds.length) * 100);
    rows.push({ model, age: +age, n: ss.length, done: done.length / ss.length * 100,
      sess: L.mean(done.map(s => s.time)) / 60, sessP90: L.pct(done.map(s => s.time), 0.9) / 60,
      chap: L.mean(chaps.map(c => c.dur)), chapP10: L.pct(chaps.map(c => c.dur), 0.1), chapP90: L.pct(chaps.map(c => c.dur), 0.9),
      cut: chaps.filter(c => c.cut).length / Math.max(1, chaps.length) * 100,
      round: L.mean(rounds.map(r => r.dur)), roundP90: L.pct(rounds.map(r => r.dur), 0.9), paint: L.mean(rounds.map(r => r.paintT)),
      stuck: rounds.filter(r => r.dur > 120).length, maxRound: Math.max(0, ...rounds.map(r => r.dur)),
      gap60: rounds.filter(r => r.maxGap > 60).length, maxGap: Math.max(0, ...rounds.map(r => r.maxGap)),
      st3: st[0], st2: st[1], st1: st[2], wrong: L.mean(rounds.map(r => r.wrong)), needPaint: L.mean(rounds.map(r => r.needPaint)), notThis: L.mean(rounds.map(r => r.notThis)),
      hintMiss: L.mean(rounds.map(r => r.hintMiss)), hintIdle: L.mean(rounds.map(r => r.hintIdle)), idle: L.mean(rounds.map(r => r.idle)),
      hintRounds: rounds.filter(r => r.hintMiss + r.hintIdle > 0).length / Math.max(1, rounds.length) * 100,
      talkRight: ss.reduce((a, s) => a + s.talkRight, 0) / Math.max(1, ss.reduce((a, s) => a + s.talks, 0)) * 100,
      nan: ss.filter(s => s.nan).length, stuckState: ss.filter(s => s.stuckState).length, off: ss.reduce((a, s) => a + s.offScreen, 0),
      m2: ss.reduce((a, s) => a + s.miss2NoHint, 0), idles: model === 'absent' ? (ss[0].idles || []).slice(0, 6).join(' ') : '' });
    if (model === 'typical' || model === 'slow3') {
      const tp = {};
      for (const c of chaps) (tp[c.topic] = tp[c.topic] || []).push(c.dur);
      for (const t of Object.keys(tp)) topicRows.push({ model, age: +age, topic: t, n: tp[t].length, mean: L.mean(tp[t]), p90: L.pct(tp[t], 0.9),
        round: L.mean(rounds.filter(r => r.topic === t).map(r => r.dur)) });
    }
  }
  rows.sort((a, b) => a.model.localeCompare(b.model) || a.age - b.age);
  topicRows.sort((a, b) => a.model.localeCompare(b.model) || a.age - b.age || a.topic.localeCompare(b.topic));
  return { rows, topicRows };
}

function table(rows, topicRows) {
  const f = L.f1, out = [];
  out.push('| model | age | n | done % | session min (p90) | chapter s mean [p10–p90] | cut % | round s (p90) | paint s | rounds > 120 s (max s) | no progress > 60 s (max gap s) | stars 3/2/1 % | wrong / needPaint / notThis per round | hints miss/idle per round (rounds with a hint %) | idle/round | talk right % | NaN / stuck / off / 2nd-miss-no-hint |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) out.push(`| ${r.model} | ${r.age} | ${r.n} | ${f(r.done)} | ${f(r.sess)} (${f(r.sessP90)}) | ${f(r.chap)} [${f(r.chapP10)}–${f(r.chapP90)}] | ${f(r.cut)} | ${f(r.round)} (${f(r.roundP90)}) | ${f(r.paint)} | ${r.stuck} (${f(r.maxRound)}) | ${r.gap60} (${f(r.maxGap)}) | ${f(r.st3)}/${f(r.st2)}/${f(r.st1)} | ${r.wrong.toFixed(2)} / ${r.needPaint.toFixed(2)} / ${r.notThis.toFixed(2)} | ${r.hintMiss.toFixed(2)}/${r.hintIdle.toFixed(2)} (${f(r.hintRounds)}) | ${r.idle.toFixed(2)} | ${f(r.talkRight)} | ${r.nan} / ${r.stuckState} / ${r.off} / ${r.m2}${r.idles ? ' · idle at ' + r.idles : ''} |`);
  out.push('', '| model | age | topic | chapters | mean s | p90 s | round s |', '|---|---|---|---|---|---|---|');
  for (const t of topicRows) out.push(`| ${t.model} | ${t.age} | ${t.topic} | ${t.n} | ${f(t.mean)} | ${f(t.p90)} | ${f(t.round)} |`);
  return out.join('\n');
}

if (process.argv.includes('--worker')) {
  process.on('message', jobs => {
    const res = [];
    for (const j of jobs) { try { res.push(runOne(j)); } catch (e) { console.error('session failed', JSON.stringify(j), e.stack); res.push({ model: j.model, age: j.age, failed: String(e), rounds: [], chapters: [] }); } }
    process.send(res, () => process.exit(0));
  });
} else {
  const jobs = [];
  for (const model of MODELS) for (const age of AGES) for (let i = 0; i < (model === 'absent' ? Math.min(N, 4) : N); i++)
    jobs.push({ model, age, seed: 1000 + i * 37 + age * 7, vp: VPS[i % VPS.length], lang: i % 2 ? 'vi' : 'en', config });
  // interleave so every worker gets a fair mix
  const parts = Array.from({ length: JOBS }, () => []);
  jobs.forEach((j, i) => parts[i % JOBS].push(j));
  const t0 = Date.now();
  Promise.all(parts.filter(p => p.length).map(p => new Promise((res, rej) => {
    const c = fork(__filename, ['--worker']); let got = false;
    c.on('message', m => { got = true; res(m); }); c.on('error', rej);
    c.on('exit', code => { if (!got) rej(new Error('worker exited ' + code + ' without a result')); });
    c.send(p);
  }))).catch(e => { console.error(e); process.exit(1); }).then(rs => {
    const list = rs.flat(), failed = list.filter(s => s.failed), { rows, topicRows } = summarize(list.filter(s => !s.failed)), md = table(rows, topicRows);
    const head = `# hs_playtest ${TAG} — ${list.length} sessions (${failed.length} failed), config ${JSON.stringify(config)} (${((Date.now() - t0) / 1000).toFixed(0)} s)\n\n`;
    console.log(head + md);
    const dir = path.join(__dirname, 'out');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'hs_' + TAG + '.md'), head + md + '\n');
    fs.writeFileSync(path.join(dir, 'hs_' + TAG + '.json'), JSON.stringify({ config, rows, topicRows }, null, 1));
    if (failed.length) process.exit(1);
  });
}
