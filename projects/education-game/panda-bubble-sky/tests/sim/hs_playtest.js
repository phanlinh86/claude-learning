#!/usr/bin/env node
// Bao's Bubble Sky — HIGH-SPEED headless playtest with child models (report-only; never edits game/js).
//   node tests/sim/hs_playtest.js [--n 400] [--ages 3,4,5,6,7] [--models typical,kid0.3,...] [--config '{…}'] [--jobs 4] [--tag name]
// Every session is simulated at full speed through the real input API (a tap = press + lift; 1/30 s frames) on 5 viewports, en / vi.
// Models (tests/sim/lib.js): typical (age profile), kid0.3 / kid0.6 / kid0.9 (age profile at that skill), slow3 (slow 3-year-old),
// perfect, tapper (random presses / slides anywhere), spammer (6 presses/s), absent (never touches), bot<skill> (PB.Bot).
// Output: markdown tables on stdout + tests/sim/out/hs_<tag>.md + .json (tests/sim/out/ is git-ignored).
// Targets: typical age 4 chapter 60–100 s, session ≤ 8 min (p90); 0 stuck rounds (> 120 s) for an engaged model, 0 stuck states
// (no progress for 200 s) for any model, 0 NaN, 0 floating bubbles off screen; every 2 misses (no right answer between) got a hint
// (unless within the 6 s cooldown).
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const L = require('./lib');

const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 400), config = JSON.parse(get('config', '{}'));
const ALL = 'typical,kid0.3,kid0.6,kid0.9,slow3,perfect,tapper,spammer,bot1,absent';
const MODELS = get('models', ALL).split(','), AGES = get('ages', '3,4,5,6,7').split(',').map(Number);
const TAG = get('tag', 'base'), JOBS = +get('jobs', 4);
const VPS = Object.keys(L.VIEWPORTS);

function finiteWorld(w) {
  if (![w.rainbow.filled, w.rainbow.alpha, w.stars, w.bao.bounce, w.wind].every(Number.isFinite)) return false;
  return w.bubbles.every(b => [b.x, b.y, b.vx, b.vy, b.r, b.wob, b.rot, b.fx, b.fy, b.fs].every(Number.isFinite)) &&
    w.drops.every(d => Number.isFinite(d.x + d.y)) && (!w.bird || Number.isFinite(w.bird.x + w.bird.y)) && (!w.kite || Number.isFinite(w.kite.x + w.kite.y));
}

function runOne(o) {
  const w = L.mkWorld(o);
  const d = L.makeModel(o.model, w, o.age, o.seed + 1);
  const quiet = o.model === 'absent';
  const S = { model: o.model, age: o.age, done: false, nan: false, time: 0, stuckState: false, rounds: [], chapters: [], talks: 0, talkRight: 0, talkAuto: 0,
    miss2NoHint: 0, offScreen: 0, idles: [], maxBubbles: 0, repKey: 0, keys: [], bumps: 0, gusts: 0 };
  w.newSession();
  const dt = 1 / 30, cap = o.cap || (quiet ? 600 : 1800);
  let R = null, chap = null, t = 0, lastChange = 0, sig = '';
  while (w.state !== 'sessionDone' && t < cap) {
    d.step(dt); w.update(dt); t += dt;
    if (!finiteWorld(w)) { S.nan = true; break; }
    const Lw = w.layout;
    for (const b of w.bubbles) if (b.state === 'float' && (b.x + b.r < Lw.ins.left - 2 || b.x - b.r > Lw.W - Lw.ins.right + 2 || b.y + b.r < 0 || b.y - b.r > Lw.groundY + 2)) S.offScreen++;
    S.maxBubbles = Math.max(S.maxBubbles, w.bubbles.length);
    const s2 = w.state + ':' + w.phase + ':' + w.level + ':' + w.round;
    if (s2 !== sig) { sig = s2; lastChange = t; } else if (!quiet && t - lastChange > 200) { S.stuckState = s2; break; }
    for (const e of w.drainEvents()) {
      if (d.onEvent) d.onEvent(e);
      switch (e.type) {
        case 'session': S.topics = e.levels; break;
        case 'level': chap = { topic: e.topic, t0: w.time, rounds: 0, level: e.level, stars: 0 }; break;
        case 'round':
          R = { topic: w.topic, ri: e.round, t0: w.time, n: e.n, k: e.k, mode: e.mode, short: e.short, wrong: 0, soft: 0, assist: 0, hintMiss: 0, hintIdle: 0, idle: 0, squish: 0,
            surprise: e.surprise, surpriseTap: 0, surpriseShown: 0, firstAsk: 0, playT: 0, stepWrong: 0, stepHint: 0, level: w.level, blowT: 0, rightT: [], doneT: 0 };
          if (S.keys.includes(e.key)) S.repKey++; S.keys.push(e.key); break;
        case 'ask': if (R && e.first) { R.firstAsk = w.time; R.blowT = w.time - R.t0; } break;
        case 'wrong': if (R) { R.wrong++; R.stepWrong++; if (R.stepWrong >= 2 && !R.stepHint && !w.hintHand && w.time - w._lastHintT > 6.01 + dt) S.miss2NoHint++; } break;   // (+ dt: the press came up to one frame before w.time)
        case 'squish': if (R) R.squish++; break;
        case 'soft': if (R) R.soft++; break;
        case 'assist': if (R) R.assist++; break;
        case 'right': if (R) { R.rightT.push(w.time - R.firstAsk); R.stepWrong = 0; R.stepHint = 0; } break;
        case 'idle': if (R) R.idle++; if (quiet) S.idles.push(+(w.time).toFixed(1)); break;
        case 'hint': if (R) { if (e.idle) R.hintIdle++; else R.hintMiss++; R.stepHint++; } break;
        case 'birdTap': case 'kiteTap': case 'snowTap': if (R) R.surpriseTap++; break;
        case 'bird': case 'kite': case 'snow': if (R) R.surpriseShown++; break;
        case 'bump': S.bumps++; break;
        case 'gust': S.gusts++; break;
        case 'roundDone': if (R) { R.stars = e.stars; R.playT = w.time - R.firstAsk; R.doneT = w.time; } break;
        case 'whoosh': if (R) R.rainbowT = w.time - R.doneT; break;
        case 'levelDone': if (chap) { chap.dur = w.time - chap.t0; chap.cut = chap.rounds < 4; S.chapters.push(chap); } chap = null; break;
        case 'talk': S.talks++; if (R) { R.dur = w.time - R.t0; S.rounds.push(R); if (chap) { chap.rounds++; chap.stars += R.stars; } R = null; } break;
        case 'talkResult': if (e.correct) S.talkRight++; if (e.auto) S.talkAuto++; break;
        case 'sessionDone': S.done = true; break;
      }
      if (e.type === 'round' && S._prevR) { const P = S._prevR; P.dur = w.time - P.t0; S.rounds.push(P); if (chap) { chap.rounds++; chap.stars += P.stars; } S._prevR = null; }
      if (e.type === 'roundDone') S._prevR = R;
      if (e.type === 'talk') S._prevR = null;
    }
  }
  S.time = w.time;
  delete S._prevR;
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
    rows.push({ model, age: +age, n: ss.length, nRounds: rounds.length, done: done.length / ss.length * 100,
      sess: L.mean(done.map(s => s.time)) / 60, sessP90: L.pct(done.map(s => s.time), 0.9) / 60, sessMax: Math.max(0, ...done.map(s => s.time)) / 60,
      chap: L.mean(chaps.map(c => c.dur)), chapP10: L.pct(chaps.map(c => c.dur), 0.1), chapP90: L.pct(chaps.map(c => c.dur), 0.9),
      cut: chaps.filter(c => c.cut).length / Math.max(1, chaps.length) * 100,
      round: m(r => r.dur), roundP10: L.pct(rounds.map(r => r.dur), 0.1), roundP90: L.pct(rounds.map(r => r.dur), 0.9), play: m(r => r.playT), blow: m(r => r.blowT),
      firstPop: L.mean(rounds.filter(r => r.rightT.length).map(r => r.rightT[0])),
      stuck: rounds.filter(r => r.dur > 120).length, maxRound: Math.max(0, ...rounds.map(r => r.dur)),
      short: rounds.filter(r => r.short).length / nR * 100, bubbles: m(r => r.n), k: m(r => r.k),
      st3: st[0], st2: st[1], st1: st[2], wrong: m(r => r.wrong), squish: m(r => r.squish), soft: m(r => r.soft),
      assistR: rounds.filter(r => r.assist > 0).length / nR * 100,
      hintMiss: m(r => r.hintMiss), hintIdle: m(r => r.hintIdle), idle: m(r => r.idle),
      hintRounds: rounds.filter(r => r.hintMiss + r.hintIdle > 0).length / nR * 100,
      talkRight: ss.reduce((a, s) => a + s.talkRight, 0) / Math.max(1, ss.reduce((a, s) => a + s.talks, 0)) * 100,
      talkAuto: ss.reduce((a, s) => a + s.talkAuto, 0) / Math.max(1, ss.reduce((a, s) => a + s.talks, 0)) * 100,
      nan: ss.filter(s => s.nan).length, stuckState: ss.filter(s => s.stuckState).length, off: ss.reduce((a, s) => a + s.offScreen, 0),
      m2: ss.reduce((a, s) => a + s.miss2NoHint, 0), maxBubbles: Math.max(...ss.map(s => s.maxBubbles)),
      idles: model === 'absent' ? (ss[0].idles || []).slice(0, 6).join(' ') : '',
      repKey: ss.reduce((a, s) => a + s.repKey, 0) / nR * 100, bumps: L.mean(ss.map(s => s.bumps / Math.max(1, s.time / 60))),
      surpShown: rounds.filter(r => r.surpriseShown).length / nR * 100,
      surpTap: rounds.filter(r => r.surpriseShown).length ? rounds.filter(r => r.surpriseShown && r.surpriseTap).length / rounds.filter(r => r.surpriseShown).length * 100 : 0,
      ch: [0, 1, 2, 3].map(i => { const cs = chaps.filter(c => c.level === i), rs = rounds.filter(r => r.level === i); return { dur: L.mean(cs.map(c => c.dur)), p90: L.pct(cs.map(c => c.dur), 0.9), st3: rs.filter(r => r.stars === 3).length / Math.max(1, rs.length) * 100, cut: cs.filter(c => c.cut).length / Math.max(1, cs.length) * 100 }; }) });
    if (model === 'typical' || model === 'slow3') {
      const tp = {};
      for (const c of chaps) (tp[c.topic] = tp[c.topic] || []).push(c.dur);
      for (const t of Object.keys(tp)) {
        const rt = rounds.filter(r => r.topic === t);
        topicRows.push({ model, age: +age, topic: t, n: tp[t].length, mean: L.mean(tp[t]), p90: L.pct(tp[t], 0.9), round: L.mean(rt.map(r => r.dur)),
          bubbles: L.mean(rt.map(r => r.n)), k: L.mean(rt.map(r => r.k)), wrong: L.mean(rt.map(r => r.wrong)), st3: rt.filter(r => r.stars === 3).length / Math.max(1, rt.length) * 100,
          hint: rt.filter(r => r.hintMiss + r.hintIdle > 0).length / Math.max(1, rt.length) * 100 });
      }
    }
  }
  rows.sort((a, b) => a.model.localeCompare(b.model) || a.age - b.age);
  topicRows.sort((a, b) => a.model.localeCompare(b.model) || a.age - b.age || a.topic.localeCompare(b.topic));
  return { rows, topicRows };
}

function table(rows, topicRows) {
  const f = L.f1, out = [];
  out.push('| model | age | n | done % | session min mean (p90, max) | chapter s mean [p10–p90] | cut % | round s mean [p10–p90] | blow / first pop / play s | rounds > 120 s (max s) | stars 3/2/1 % | wrong / squish / soft per round | assist rounds % | hints miss/idle per round (rounds with a hint %) | idle/round | talk right % (auto %) | NaN / stuck / off / 2-miss-no-hint |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) out.push(`| ${r.model} | ${r.age} | ${r.n} | ${f(r.done)} | ${f(r.sess)} (${f(r.sessP90)}, ${f(r.sessMax)}) | ${f(r.chap)} [${f(r.chapP10)}–${f(r.chapP90)}] | ${f(r.cut)} | ${f(r.round)} [${f(r.roundP10)}–${f(r.roundP90)}] | ${f(r.blow)} / ${f(r.firstPop)} / ${f(r.play)} | ${r.stuck} (${f(r.maxRound)}) | ${f(r.st3)}/${f(r.st2)}/${f(r.st1)} | ${r.wrong.toFixed(2)} / ${r.squish.toFixed(2)} / ${r.soft.toFixed(2)} | ${f(r.assistR)} | ${r.hintMiss.toFixed(2)}/${r.hintIdle.toFixed(2)} (${f(r.hintRounds)}) | ${r.idle.toFixed(2)} | ${f(r.talkRight)} (${f(r.talkAuto)}) | ${r.nan} / ${r.stuckState} / ${r.off} / ${r.m2}${r.idles ? ' · idle at ' + r.idles : ''} |`);
  out.push('', '| model | age | bubbles / k per round | short rounds % | repeated set % | bumps / min | surprise rounds % (tapped %) | ch1 s (p90, cut %) / 3★% | ch2 | ch3 | ch4 |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) if (r.model !== 'absent') out.push(`| ${r.model} | ${r.age} | ${r.bubbles.toFixed(2)} / ${r.k.toFixed(2)} | ${f(r.short)} | ${f(r.repKey)} | ${f(r.bumps)} | ${f(r.surpShown)} (${f(r.surpTap)}) | ` + r.ch.map(c => `${f(c.dur)} (${f(c.p90)}, ${f(c.cut)}) / ${f(c.st3)}`).join(' | ') + ' |');
  out.push('', '| model | age | topic | chapters | mean s | p90 s | round s | bubbles / k | wrong / round | 3★ % | hint rounds % |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const t of topicRows) out.push(`| ${t.model} | ${t.age} | ${t.topic} | ${t.n} | ${f(t.mean)} | ${f(t.p90)} | ${f(t.round)} | ${t.bubbles.toFixed(2)} / ${t.k.toFixed(2)} | ${t.wrong.toFixed(2)} | ${f(t.st3)} | ${f(t.hint)} |`);
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
  for (const model of MODELS) for (const age of AGES) {
    const n = model === 'absent' ? Math.min(N, 4) : /^(tapper|spammer|perfect)$|^bot/.test(model) ? Math.min(N, 60) : /^kid/.test(model) ? Math.min(N, 200) : N;
    if (/^slow/.test(model) && age > 4 && !get('models')) continue;   // a slow 3-year-old plays ages 3–4
    for (let i = 0; i < n; i++) jobs.push({ model, age, seed: 1000 + i * 37 + age * 7, vp: VPS[i % VPS.length], lang: i % 2 ? 'vi' : 'en', config });
  }
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
