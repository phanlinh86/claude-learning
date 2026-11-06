#!/usr/bin/env node
// Momo's Toy Train — HIGH-SPEED headless playtest with child models (report-only; never edits game/js).
//   node tests/sim/hs_playtest.js [--n 300] [--ages 3,4,5,6,7] [--models typical,slow3,...] [--config '{…}'] [--jobs 4] [--tag name]
// Every session is simulated at full speed through the real input API (drags = press + a pointerMove per 1/30 s frame + lift).
// Models (tests/sim/lib.js): typical, slow3 (slow 3-year-old), perfect, high (drops high above the cars), tapper (random
// taps + random drags), spammer (flings 3–4 cargo/s, hammers the whistle), absent (never touches), bot<skill> (TT.Bot).
// Output: markdown tables on stdout + tests/sim/out/hs_<tag>.md (+ .json, git-ignored).
// Targets: typical / slow3 age-3–4 chapter 60–100 s, session ≤ 8 min (p90), no stuck round (> 120 s) for an engaged model, no
// stuck state for any model, no NaN, every 2nd miss on a cargo hinted (unless a hint glowed / the cooldown).
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const L = require('./lib');

const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 300), config = JSON.parse(get('config', '{}'));
const ALL = 'typical,slow3,perfect,high,tapper,spammer,bot0.8,absent';
const MODELS = get('models', ALL).split(','), AGES = get('ages', '3,4,5,6,7').split(',').map(Number);
const TAG = get('tag', 'base'), JOBS = +get('jobs', 4);
const VPS = Object.keys(L.VIEWPORTS);

function finiteWorld(w) {
  for (const it of w.items) if (!isFinite(it.x) || !isFinite(it.y) || !isFinite(it.rot) || !isFinite(it.size) || !isFinite(it.sy)) return false;
  for (const c of w.train.couple) if (!isFinite(c.dx)) return false;
  return isFinite(w.train.x) && isFinite(w.stars);
}

function runOne(o) {
  const w = L.mkWorld(o);
  const d = L.makeModel(o.model, w, o.age, o.seed + 1);
  const quiet = o.model === 'absent';
  const S = { model: o.model, age: o.age, done: false, nan: false, time: 0, stuckState: false, rounds: [], chapters: [], talks: 0, talkRight: 0,
    miss2NoHint: 0, offScreen: 0, topics: null };
  w.newSession();
  const dt = 1 / 30, cap = o.cap || (quiet ? 400 : 1800);
  let R = null, chap = null, t = 0, lastChange = 0, sig = '';
  const missBy = {};
  while (w.state !== 'sessionDone' && t < cap) {
    d.step(dt); w.update(dt); t += dt;
    if (!finiteWorld(w)) { S.nan = true; break; }
    for (const it of w.items) if (it.state !== 'in' && (it.x < -1 || it.x > w.layout.W + 1 || it.y < -1 || it.y > w.layout.H + 1)) S.offScreen++;
    const s2 = w.state + ':' + w.phase + ':' + w.level + ':' + w.round + ':' + w.items.filter(i => i.state === 'in').length;
    if (s2 !== sig) { sig = s2; lastChange = t; } else if (!quiet && t - lastChange > 200) { S.stuckState = s2; break; }
    for (const e of w.drainEvents()) {
      if (d.onEvent) d.onEvent(e);
      switch (e.type) {
        case 'session': S.topics = e.levels; break;
        case 'level': chap = { topic: e.topic, t0: w.time, rounds: 0 }; break;
        case 'round': R = { topic: w.topic, ri: e.round, t0: w.time, loadT: 0, wrong: 0, miss: 0, full: 0, taps: 0, hintMiss: 0, hintIdle: 0, idle: 0,
          whistleHint: false, autoWhistle: false, whistleWait: 0, items: e.items, surprise: e.surprise, loaded: 0 }; break;
        case 'ask': if (R) R.ask = w.time; break;
        case 'wrong': case 'miss':
          if (R) R[e.type === 'wrong' ? 'wrong' : 'miss']++;
          missBy[e.id] = (missBy[e.id] || 0) + 1;
          if (missBy[e.id] === 2) R.pending2 = { id: e.id, t: w.time };
          break;
        case 'full': if (R) R.full++; break;
        case 'tap': if (R) R.taps++; break;
        case 'idle': if (R) R.idle++; break;
        case 'hint': if (R) { if (e.idle) R.hintIdle++; else R.hintMiss++; if (R.pending2 && R.pending2.id === e.id) R.pending2 = null; } break;
        case 'loaded': if (R) R.loaded = w.time; break;
        case 'whistleHint': if (R) R.whistleHint = true; break;
        case 'whistle': if (R) { R.autoWhistle = !!e.auto; R.whistleWait = w.time - R.loaded; } break;
        case 'roundDone':
          if (R) {
            R.dur = w.time - R.t0; R.load = R.loaded - (R.ask || R.t0); R.stars = e.stars;
            if (R.pending2) S.miss2NoHint++;   // (allowed when a hint was glowing / within the cooldown — counted for review)
            S.rounds.push(R); if (chap) chap.rounds++;
          }
          R = null; break;
        case 'talk': S.talks++; break;
        case 'talkResult': if (e.correct) S.talkRight++; break;
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
      round: L.mean(rounds.map(r => r.dur)), roundP90: L.pct(rounds.map(r => r.dur), 0.9), load: L.mean(rounds.map(r => r.load)),
      stuck: rounds.filter(r => r.dur > 120).length, maxRound: Math.max(0, ...rounds.map(r => r.dur)),
      st3: st[0], st2: st[1], st1: st[2], wrong: L.mean(rounds.map(r => r.wrong)), miss: L.mean(rounds.map(r => r.miss)), full: L.mean(rounds.map(r => r.full)),
      hintMiss: L.mean(rounds.map(r => r.hintMiss)), hintIdle: L.mean(rounds.map(r => r.hintIdle)), idle: L.mean(rounds.map(r => r.idle)),
      wHint: rounds.filter(r => r.whistleHint).length / Math.max(1, rounds.length) * 100, wAuto: rounds.filter(r => r.autoWhistle).length / Math.max(1, rounds.length) * 100,
      wWait: L.mean(rounds.map(r => r.whistleWait)), nan: ss.filter(s => s.nan).length, stuckState: ss.filter(s => s.stuckState).length,
      off: ss.reduce((a, s) => a + s.offScreen, 0), m2: ss.reduce((a, s) => a + s.miss2NoHint, 0) });
    if (model === 'typical' || model === 'slow3') {
      const tp = {};
      for (const c of chaps) (tp[c.topic] = tp[c.topic] || []).push(c.dur);
      for (const t of Object.keys(tp)) topicRows.push({ model, age: +age, topic: t, n: tp[t].length, mean: L.mean(tp[t]), p90: L.pct(tp[t], 0.9) });
    }
  }
  rows.sort((a, b) => a.model.localeCompare(b.model) || a.age - b.age);
  topicRows.sort((a, b) => a.model.localeCompare(b.model) || a.age - b.age || a.topic.localeCompare(b.topic));
  return { rows, topicRows };
}

function table(rows, topicRows) {
  const f = L.f1, out = [];
  out.push('| model | age | n | done % | session min (p90) | chapter s mean [p10–p90] | cut % | round s (p90) | load s | stuck rounds (max s) | stars 3/2/1 % | wrong/round | miss/round | full/round | hints miss/idle per round | idle/round | whistle nudge / auto % | whistle wait s | NaN / stuck / off / 2nd-miss-no-hint |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) out.push(`| ${r.model} | ${r.age} | ${r.n} | ${f(r.done)} | ${f(r.sess)} (${f(r.sessP90)}) | ${f(r.chap)} [${f(r.chapP10)}–${f(r.chapP90)}] | ${f(r.cut)} | ${f(r.round)} (${f(r.roundP90)}) | ${f(r.load)} | ${r.stuck} (${f(r.maxRound)}) | ${f(r.st3)}/${f(r.st2)}/${f(r.st1)} | ${r.wrong.toFixed(2)} | ${r.miss.toFixed(2)} | ${r.full.toFixed(2)} | ${r.hintMiss.toFixed(2)}/${r.hintIdle.toFixed(2)} | ${r.idle.toFixed(2)} | ${f(r.wHint)} / ${f(r.wAuto)} | ${f(r.wWait)} | ${r.nan} / ${r.stuckState} / ${r.off} / ${r.m2} |`);
  out.push('', '| model | age | topic | chapters | mean s | p90 s |', '|---|---|---|---|---|---|');
  for (const t of topicRows) out.push(`| ${t.model} | ${t.age} | ${t.topic} | ${t.n} | ${f(t.mean)} | ${f(t.p90)} |`);
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
  for (const model of MODELS) for (const age of AGES) for (let i = 0; i < N; i++)
    jobs.push({ model, age, seed: 1000 + i * 37 + age * 7, vp: VPS[i % VPS.length], lang: i % 2 ? 'vi' : 'en', config, n: model === 'absent' ? 1 : 0 });
  const use = jobs.filter(j => j.model !== 'absent' || (j.seed % 10 === 0) || N < 20);
  const per = Math.ceil(use.length / JOBS), parts = [];
  for (let k = 0; k < JOBS; k++) parts.push(use.slice(k * per, (k + 1) * per));
  const t0 = Date.now();
  Promise.all(parts.filter(p => p.length).map(p => new Promise((res, rej) => {
    const c = fork(__filename, ['--worker']); let got = false;
    c.on('message', m => { got = true; res(m); }); c.on('error', rej);
    c.on('exit', code => { if (!got) rej(new Error('worker exited ' + code + ' without a result')); });
    c.send(p);
  }))).catch(e => { console.error(e); process.exit(1); }).then(rs => {
    const list = rs.flat(), { rows, topicRows } = summarize(list), md = table(rows, topicRows);
    const head = `# hs_playtest ${TAG} — ${list.length} sessions, config ${JSON.stringify(config)} (${((Date.now() - t0) / 1000).toFixed(0)} s)\n\n`;
    console.log(head + md);
    const dir = path.join(__dirname, 'out');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'hs_' + TAG + '.md'), head + md + '\n');
    fs.writeFileSync(path.join(dir, 'hs_' + TAG + '.json'), JSON.stringify({ config, rows, topicRows }, null, 1));
  });
}
