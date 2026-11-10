#!/usr/bin/env node
// Kiki's Camp Chimes — HIGH-SPEED headless playtest with child models (report-only; never edits game/js).
//   node tests/sim/hs_playtest.js [--n 120] [--ages 3,4,5,6,7] [--models typical,slow3,...] [--config '{…}'] [--jobs 2] [--tag name]
// Every session is simulated at full speed through the real input API (a tap = press + lift; a swipe = press, touchmove
// events along a wobbly path, lift; 1/30 s frames). Models (tests/sim/lib.js): typical, slow3 (slow 3-year-old), perfect,
// tapper (random presses / slides anywhere), swiper (strums the whole row, never aims), spammer (6 presses/s), absent
// (never touches), bot<skill> (CC.Bot).
// Output: markdown tables on stdout + tests/sim/out/hs_<tag>.md + .json (the whole out/ folder is git-ignored).
// Targets: typical age 3–4 chapter 60–100 s, session ≤ 8 min (p90); 0 stuck rounds (> 120 s) for an engaged model, 0 stuck
// states (no progress for 200 s) for any model, 0 NaN, 0 chimes off screen; every 2 wrong rings in a row (no right note
// between) got a hint (unless within the 6 s cooldown).
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const L = require('./lib');

const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 120), config = JSON.parse(get('config', '{}'));
const ALL = 'typical,slow3,swipey,perfect,tapper,swiper,spammer,beam,bot0.5,bot0.8,bot1,absent';
const MODELS = get('models', ALL).split(','), AGES = get('ages', '3,4,5,6,7').split(',').map(Number);
const TAG = get('tag', 'base'), JOBS = +get('jobs', 2);
const VPS = Object.keys(L.VIEWPORTS);

function finiteWorld(w) {
  if (![w.beam.wob, w.stars, w.kiki.hop].every(Number.isFinite)) return false;
  return w.chimes.every(c => Number.isFinite(c.cx) && Number.isFinite(c.cy) && Number.isFinite(c.theta) && Number.isFinite(c.rot) && Number.isFinite(c.cord)) &&
    w.lanterns.every(l => Number.isFinite(l.swing) && Number.isFinite(l.lit)) && w.notes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y)) &&
    w.fireflies.every(f => Number.isFinite(f.x) && Number.isFinite(f.y));
}

function runOne(o) {
  const w = L.mkWorld(o);
  const d = L.makeModel(o.model, w, o.age, o.seed + 1);
  const quiet = o.model === 'absent';
  const S = { model: o.model, age: o.age, done: false, nan: false, time: 0, stuckState: false, rounds: [], chapters: [], talks: 0, talkRight: 0, talkAuto: 0,
    miss2NoHint: 0, offScreen: 0, topics: null, idles: [], maxChimes: 0, keys: [], repKey: 0, maxSwing: 0 };
  w.newSession();
  const dt = 1 / 30, cap = o.cap || (quiet ? 600 : 1800);
  let R = null, chap = null, t = 0, lastChange = 0, sig = '';
  const closeStep = () => { if (R && R.stepWrong >= 2 && R.stepHint === 0) S.miss2NoHint++; if (R) { R.stepWrong = 0; R.stepHint = 0; } };
  while (w.state !== 'sessionDone' && t < cap) {
    d.step(dt); w.update(dt); t += dt;
    if (!finiteWorld(w)) { S.nan = true; break; }
    const Lw = w.layout;
    for (const c of w.chimes) {
      if (c.state === 'gone' || c.pop <= 0) continue;
      if (c.cx < -20 || c.cx > Lw.W + 20 || c.cy < -20 || c.cy > Lw.H + 20) S.offScreen++;
      S.maxSwing = Math.max(S.maxSwing, Math.abs(c.theta));
    }
    S.maxChimes = Math.max(S.maxChimes, w.chimes.length);
    const s2 = w.state + ':' + w.phase + ':' + w.level + ':' + w.round + ':' + w.step + ':' + w.chimes.filter(c => c.done).length;
    if (s2 !== sig) { sig = s2; lastChange = t; } else if (!quiet && t - lastChange > 200) { S.stuckState = s2; break; }
    for (const e of w.drainEvents()) {
      if (d.onEvent) d.onEvent(e);
      switch (e.type) {
        case 'session': S.topics = e.levels; break;
        case 'level': chap = { topic: e.topic, t0: w.time, rounds: 0, level: e.level, stars: 0 }; break;
        case 'round':
          R = { topic: w.topic, ri: e.round, t0: w.time, steps: e.steps, chimes: e.chimes, wrong: 0, brush: 0, soft: 0, right: 0, assist: 0, hintMiss: 0, hintIdle: 0, idle: 0,
            surprise: e.surprise, surpriseTap: 0, firstAsk: 0, playT: 0, lastProg: w.time, maxGap: 0, stepWrong: 0, stepHint: 0, level: w.level, firstAskT: 0, songT0: 0, songAuto: false, songStart: 0 };
          if (S.keys.includes(e.key)) S.repKey++; S.keys.push(e.key); break;
        case 'ask': if (R) { closeStep(); if (e.first) { R.firstAsk = w.time; R.firstAskT = w.time - R.t0; R.lastProg = w.time; } } break;
        case 'wrong': if (R) { R.wrong++; R.stepWrong++; } break;
        case 'ring': if (R && e.brush) R.brush++; break;
        case 'soft': if (R) R.soft++; break;
        case 'assist': if (R) R.assist++; break;
        case 'right': if (R) { R.right++; R.maxGap = Math.max(R.maxGap, w.time - R.lastProg); R.lastProg = w.time; R.stepWrong = 0; R.stepHint = 0; } break;
        case 'idle': if (R) R.idle++; if (quiet) S.idles.push(+(w.time).toFixed(1)); break;
        case 'hint': if (R) { if (e.idle) R.hintIdle++; else R.hintMiss++; R.stepHint++; } break;
        case 'hedgehogTap': case 'birdTap': case 'fireflyTap': if (R) R.surpriseTap++; break;
        case 'hedgehog': case 'bird': case 'fireflies': if (R) { R.surpriseShown = (R.surpriseShown || 0) + 1; R.surpriseAt = w.time - R.firstAsk; } break;
        case 'roundDone': if (R) { closeStep(); R.stars = e.stars; R.playT = w.time - R.firstAsk; R.songT0 = w.time; } break;
        case 'songNote': if (R && e.i === 0) R.songStart = w.time - R.songT0; break;
        case 'songDone': if (R) R.songAuto = e.auto; break;
        case 'chimesOut':
          if (R) { R.dur = w.time - R.t0; S.rounds.push(R); if (chap) { chap.rounds++; chap.stars += R.stars; } }
          R = null; break;
        case 'talk': S.talks++; break;
        case 'talkResult': if (e.correct) S.talkRight++; if (e.auto) S.talkAuto++; break;
        case 'levelDone': if (chap) { chap.dur = w.time - chap.t0; chap.cut = chap.rounds < 4; S.chapters.push(chap); } chap = null; break;
        case 'sessionDone': S.done = true; break;
      }
    }
  }
  S.time = w.time;
  if (d.flushIntent) {   // gesture fairness: did the judged chime equal the aimed one?
    d.flushIntent();
    const F = {};
    for (const it of d.intents) {
      const k = it.kind, f = F[k] = F[k] || { n: 0, same: 0, other: 0, none: 0, assisted: 0, unfair: 0, aimRight: 0 };
      f.n++; if (it.want === it.id) f.aimRight++;
      if (it.assisted) f.assisted++;
      else if (it.judged === undefined) f.none++;
      else if (it.judged === it.id) f.same++; else f.other++;
      if (it.unfairMiss && !it.assisted) f.unfair++;
    }
    S.fair = F;
  }
  return S;
}

function summarize(list) {
  const by = {};
  for (const s of list) (by[s.model + '|' + s.age] = by[s.model + '|' + s.age] || []).push(s);
  const rows = [], topicRows = [];
  for (const k of Object.keys(by)) {
    const ss = by[k], [model, age] = k.split('|');
    const rounds = ss.flatMap(s => s.rounds), chaps = ss.flatMap(s => s.chapters), done = ss.filter(s => s.done), nR = Math.max(1, rounds.length);
    const st = [3, 2, 1].map(n => rounds.filter(r => r.stars === n).length / nR * 100);
    const m = f => L.mean(rounds.map(f));
    rows.push({ model, age: +age, n: ss.length, nRounds: rounds.length, wrongTot: rounds.reduce((a, r) => a + r.wrong, 0), done: done.length / ss.length * 100,
      sess: L.mean(done.map(s => s.time)) / 60, sessP90: L.pct(done.map(s => s.time), 0.9) / 60,
      chap: L.mean(chaps.map(c => c.dur)), chapP10: L.pct(chaps.map(c => c.dur), 0.1), chapP90: L.pct(chaps.map(c => c.dur), 0.9),
      cut: chaps.filter(c => c.cut).length / Math.max(1, chaps.length) * 100,
      round: m(r => r.dur), roundP90: L.pct(rounds.map(r => r.dur), 0.9), play: m(r => r.playT),
      stuck: rounds.filter(r => r.dur > 120).length, maxRound: Math.max(0, ...rounds.map(r => r.dur)),
      gap60: rounds.filter(r => r.maxGap > 60).length, maxGap: Math.max(0, ...rounds.map(r => r.maxGap)),
      st3: st[0], st2: st[1], st1: st[2], wrong: m(r => r.wrong), brush: m(r => r.brush), soft: m(r => r.soft), assist: m(r => r.assist),
      assistR: rounds.filter(r => r.assist > 0).length / nR * 100,
      hintMiss: m(r => r.hintMiss), hintIdle: m(r => r.hintIdle), idle: m(r => r.idle),
      hintRounds: rounds.filter(r => r.hintMiss + r.hintIdle > 0).length / nR * 100,
      songAuto: rounds.filter(r => r.songAuto).length / nR * 100, songStart: m(r => r.songStart),
      talkRight: ss.reduce((a, s) => a + s.talkRight, 0) / Math.max(1, ss.reduce((a, s) => a + s.talks, 0)) * 100,
      talkAuto: ss.reduce((a, s) => a + s.talkAuto, 0) / Math.max(1, ss.reduce((a, s) => a + s.talks, 0)) * 100,
      nan: ss.filter(s => s.nan).length, stuckState: ss.filter(s => s.stuckState).length, off: ss.reduce((a, s) => a + s.offScreen, 0),
      m2: ss.reduce((a, s) => a + s.miss2NoHint, 0), maxChimes: Math.max(...ss.map(s => s.maxChimes)), maxSwing: Math.max(...ss.map(s => s.maxSwing)),
      idles: model === 'absent' ? (ss[0].idles || []).slice(0, 6).join(' ') : '',
      repKey: ss.reduce((a, s) => a + s.repKey, 0) / nR * 100,
      surpriseTap: rounds.filter(r => r.surprise).length ? rounds.filter(r => r.surprise && r.surpriseTap).length / rounds.filter(r => r.surprise).length * 100 : 0,
      firstAsk: m(r => r.firstAskT), overhead: m(r => r.dur - r.playT),
      fair: (() => { const F = {}; for (const s of ss) for (const k of Object.keys(s.fair || {})) { const a = F[k] = F[k] || { n: 0, same: 0, other: 0, none: 0, assisted: 0, unfair: 0, aimRight: 0 }; for (const q of Object.keys(a)) a[q] += s.fair[k][q]; } return F; })(),
      st3cap: rounds.filter(r => r.stars === 3 && !r.assist).length / nR * 100,
      surpShown: rounds.filter(r => r.surpriseShown).length / nR * 100, surpPerChap: rounds.filter(r => r.surpriseShown).length / Math.max(1, chaps.length),
      surpAt: L.mean(rounds.filter(r => r.surpriseShown).map(r => r.surpriseAt)), surpPlayT: L.mean(rounds.filter(r => r.surpriseShown).map(r => r.playT)),
      surpMissed: rounds.filter(r => r.surpriseShown && !r.surpriseTap).length / Math.max(1, rounds.filter(r => r.surpriseShown).length) * 100,
      ch: [0, 1, 2, 3].map(i => { const cs = chaps.filter(c => c.level === i), rs = rounds.filter(r => r.level === i); return { dur: L.mean(cs.map(c => c.dur)), p90: L.pct(cs.map(c => c.dur), 0.9), st3: rs.filter(r => r.stars === 3).length / Math.max(1, rs.length) * 100, wrong: L.mean(rs.map(r => r.wrong)), cut: cs.filter(c => c.cut).length / Math.max(1, cs.length) * 100 }; }) });
    if (model === 'typical' || model === 'slow3') {
      const tp = {};
      for (const c of chaps) (tp[c.topic] = tp[c.topic] || []).push(c.dur);
      for (const t of Object.keys(tp)) topicRows.push({ model, age: +age, topic: t, n: tp[t].length, mean: L.mean(tp[t]), p90: L.pct(tp[t], 0.9),
        round: L.mean(rounds.filter(r => r.topic === t).map(r => r.dur)), chimes: L.mean(rounds.filter(r => r.topic === t).map(r => r.chimes)),
        wrong: L.mean(rounds.filter(r => r.topic === t).map(r => r.wrong)), st3: rounds.filter(r => r.topic === t && r.stars === 3).length / Math.max(1, rounds.filter(r => r.topic === t).length) * 100,
        hint: rounds.filter(r => r.topic === t && r.hintMiss + r.hintIdle > 0).length / Math.max(1, rounds.filter(r => r.topic === t).length) * 100 });
    }
  }
  rows.sort((a, b) => a.model.localeCompare(b.model) || a.age - b.age);
  topicRows.sort((a, b) => a.model.localeCompare(b.model) || a.age - b.age || a.topic.localeCompare(b.topic));
  return { rows, topicRows };
}

function table(rows, topicRows) {
  const f = L.f1, out = [];
  out.push('| model | age | n | done % | session min (p90) | chapter s mean [p10–p90] | cut % | round s (p90) | play s | rounds > 120 s (max s) | no right note > 60 s (max gap s) | stars 3/2/1 % | wrong / brush / soft per round | assist rounds % | hints miss/idle per round (rounds with a hint %) | idle/round | song auto % (1st note s) | talk right % (auto %) | NaN / stuck / off / 2-wrong-no-hint | max chimes / max swing rad |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) out.push(`| ${r.model} | ${r.age} | ${r.n} | ${f(r.done)} | ${f(r.sess)} (${f(r.sessP90)}) | ${f(r.chap)} [${f(r.chapP10)}–${f(r.chapP90)}] | ${f(r.cut)} | ${f(r.round)} (${f(r.roundP90)}) | ${f(r.play)} | ${r.stuck} (${f(r.maxRound)}) | ${r.gap60} (${f(r.maxGap)}) | ${f(r.st3)}/${f(r.st2)}/${f(r.st1)} | ${r.wrong.toFixed(2)} / ${r.brush.toFixed(2)} / ${r.soft.toFixed(2)} | ${f(r.assistR)} | ${r.hintMiss.toFixed(2)}/${r.hintIdle.toFixed(2)} (${f(r.hintRounds)}) | ${r.idle.toFixed(2)} | ${f(r.songAuto)} (${f(r.songStart)}) | ${f(r.talkRight)} (${f(r.talkAuto)}) | ${r.nan} / ${r.stuckState} / ${r.off} / ${r.m2}${r.idles ? ' · idle at ' + r.idles : ''} | ${r.maxChimes} / ${r.maxSwing.toFixed(2)} |`);
  out.push('', '| model | age | repeated set % | surprise tapped % | per-round overhead s (first ask s) | ch1 s / 3★% / wrong | ch2 | ch3 | ch4 |', '|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) if (r.model !== 'absent') out.push(`| ${r.model} | ${r.age} | ${f(r.repKey)} | ${f(r.surpriseTap)} | ${f(r.overhead)} (${f(r.firstAsk)}) | ` + r.ch.map(c => `${f(c.dur)} (p90 ${f(c.p90)}, cut ${f(c.cut)}%) / ${f(c.st3)} / ${c.wrong.toFixed(2)}`).join(' | ') + ' |');
  out.push('', '| model | age | topic | chapters | mean s | p90 s | round s | chimes | wrong / round | 3★ % | hint rounds % |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const t of topicRows) out.push(`| ${t.model} | ${t.age} | ${t.topic} | ${t.n} | ${f(t.mean)} | ${f(t.p90)} | ${f(t.round)} | ${f(t.chimes)} | ${t.wrong.toFixed(2)} | ${f(t.st3)} | ${f(t.hint)} |`);
  out.push('', '**Gesture fairness** (aimed gestures of the child models: was the JUDGED chime the one the finger aimed at?). sloppy = a swipe that starts 1.4–2.2 r beside the chime. unfair misses = aimed at the RIGHT chime but another was judged wrong.', '',
    '| model | age | kind | n | judged = aimed % | judged another % | no contact % | assisted % | unfair misses / 100 rounds | share of all wrong % |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) for (const k of Object.keys(r.fair || {}).sort()) { const a = r.fair[k], nR = r.n ? r.nRounds : 1;
    out.push(`| ${r.model} | ${r.age} | ${k} | ${a.n} | ${f(a.same / a.n * 100)} | ${f(a.other / a.n * 100)} | ${f(a.none / a.n * 100)} | ${f(a.assisted / a.n * 100)} | ${f(a.unfair / r.nRounds * 100)} | ${f(a.unfair / Math.max(1, r.wrongTot) * 100)} |`); }
  out.push('', '| model | age | 3★ % now | 3★ % if an assisted round is capped at 2★ |', '|---|---|---|---|');
  for (const r of rows) if (r.model !== 'absent') out.push(`| ${r.model} | ${r.age} | ${f(r.st3)} | ${f(r.st3cap)} |`);
  out.push('', '| model | age | surprise rounds % | surprises / chapter | appears s after 1st ask | play s of those rounds | shown but not tapped % |', '|---|---|---|---|---|---|---|');
  for (const r of rows) if (r.model !== 'absent') out.push(`| ${r.model} | ${r.age} | ${f(r.surpShown)} | ${r.surpPerChap.toFixed(2)} | ${f(r.surpAt)} | ${f(r.surpPlayT)} | ${f(r.surpMissed)} |`);
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
  for (const model of MODELS) for (const age of AGES) for (let i = 0; i < (model === 'absent' ? Math.min(N, 4) : N); i++) if (!/^slow/.test(model) || age <= 4 || get('models'))   // a slow 3-year-old plays ages 3–4
    jobs.push({ model, age, seed: 1000 + i * 37 + age * 7, vp: VPS[i % VPS.length], lang: i % 2 ? 'vi' : 'en', config });
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
    const bad = rows.filter(r => r.nan || r.stuckState || r.off || (r.model !== 'absent' && r.stuck));
    if (failed.length || bad.length) { console.log('\nFAIL: ' + (failed.length + ' failed sessions; ') + bad.map(r => r.model + '/' + r.age).join(', ')); process.exit(1); }
  });
}
