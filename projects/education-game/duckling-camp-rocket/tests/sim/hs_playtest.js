#!/usr/bin/env node
// Mimi's Splash Rocket — HIGH-SPEED headless playtest with child models (report-only; never edits game/js).
//   node tests/sim/hs_playtest.js [--n 200] [--ages 3,4,5,6,7] [--models typical,kid0.3,...] [--config '{…}'] [--jobs 4] [--tag name]
// Every session is simulated at full speed through the real input API (a tap = press + lift; 1/30 s frames) on 5 viewports, en / vi.
// Models (tests/sim/lib.js): typical, kid0.3 / kid0.6 / kid0.9, slow3, perfect, tapper, spammer, absent, bot<skill> (quick DK.Bot),
// botT<skill> (toddler-paced DK.Bot).
// Output: markdown tables on stdout + tests/sim/out/hs_<tag>.md + .json (tests/sim/out/ is git-ignored).
// Reports per model × age: session / chapter / round durations, flight durations (launch → land), pump phase durations, the share of
// auto-pumped launches, stuck rounds, hint frequency, stars.
// Targets: typical / botT age 4 chapter 60–100 s, session ≤ 8 min (p90); 0 stuck rounds (> 120 s) for an engaged model (slow3 ≤ 1 %), 0 stuck
// states (no progress for 200 s) for any model, 0 NaN, 0 mats / Mimi / rocket off screen, every landing within 2 px of its mat; every
// 2 misses (no right answer between) got a hint (unless within the 6 s cooldown). Exit 1 on any of those.
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const L = require('./lib');

const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 200), config = JSON.parse(get('config', '{}'));
const ALL = 'typical,kid0.3,kid0.6,kid0.9,slow3,perfect,tapper,spammer,bot1,botT0.8,absent';
const MODELS = get('models', ALL).split(','), AGES = get('ages', '3,4,5,6,7').split(',').map(Number);
const TAG = get('tag', 'base'), JOBS = +get('jobs', 4);
const VPS = Object.keys(L.VIEWPORTS);

function finiteWorld(w) {
  const n = w.mimi, r = w.rocket;
  if (![n.x, n.y, n.sx, n.sy, n.lean, r.x, r.y, r.rot, r.chute, r.swing, w.stars, w.wind].every(Number.isFinite)) return false;
  return w.mats.every(m => [m.x, m.y, m.squish, m.flap, m.unfold, m.thingHop].every(Number.isFinite)) && w.drops.every(d => Number.isFinite(d.x + d.y)) &&
    (!w.marmot || Number.isFinite(w.marmot.x + w.marmot.y)) && (!w.goat || Number.isFinite(w.goat.x + w.goat.y)) && (!w.bird || Number.isFinite(w.bird.x + w.bird.y));
}

function runOne(o) {
  const w = L.mkWorld(o);
  const d = L.makeModel(o.model, w, o.age, o.seed + 1);
  const quiet = o.model === 'absent';
  const S = { model: o.model, age: o.age, done: false, nan: false, time: 0, stuckState: false, rounds: [], chapters: [], talks: 0, talkRight: 0, talkAuto: 0,
    miss2NoHint: 0, offScreen: 0, idles: [], repKey: 0, keys: [], gusts: 0, flights: [], pumps: [], autoLaunch: 0, launches: 0, landErr: 0, marmots: 0, goats: 0, birds: 0 };
  w.newSession();
  const dt = 1 / 30, cap = o.cap || (quiet ? 600 : 1800);
  let R = null, chap = null, t = 0, lastChange = 0, sig = '', launchT = 0, pumpT = 0, auto = false;
  while (w.state !== 'sessionDone' && t < cap) {
    d.step(dt); w.update(dt); t += dt;
    if (!finiteWorld(w)) { S.nan = true; break; }
    const Lw = w.layout;
    for (const m of w.mats) if (m.state === 'rest' && (m.x - Lw.S * m.ds / 2 < Lw.ins.left - 2 || m.x + Lw.S * m.ds / 2 > Lw.W - Lw.ins.right + 2 || m.y - Lw.itemH * m.ds < 0 || m.y > Lw.H - Lw.ins.bottom + 2)) S.offScreen++;
    if (w.mimi.x < 0 || w.mimi.x > Lw.W || w.mimi.y < 0 || w.mimi.y > Lw.H) S.offScreen++;
    if (w.rocket.x < -40 || w.rocket.x > Lw.W + 40 || w.rocket.y < -40 || w.rocket.y > Lw.H + 40) S.offScreen++;
    const s2 = w.state + ':' + w.phase + ':' + w.level + ':' + w.round + ':' + w.launch;
    if (s2 !== sig) { sig = s2; lastChange = t; } else if (!quiet && t - lastChange > 200) { S.stuckState = s2; break; }
    for (const e of w.drainEvents()) {
      if (d.onEvent) d.onEvent(e);
      switch (e.type) {
        case 'session': S.topics = e.levels; break;
        case 'level': chap = { topic: e.topic, t0: w.time, rounds: 0, level: e.level, stars: 0 }; break;
        case 'round':
          R = { topic: w.topic, ri: e.round, t0: w.time, n: e.n, k: e.k, m: e.m, mode: e.mode, short: e.short, wrong: 0, soft: 0, assist: 0, hintMiss: 0, hintIdle: 0, idle: 0, squish: 0,
            surprise: e.surprise, surpriseTap: 0, surpriseShown: 0, firstAsk: 0, unfoldT: 0, stepWrong: 0, stepHint: 0, level: w.level, rightT: [], doneT: 0, campT: 0, camp0: 0 };
          if (S.keys.includes(e.key)) S.repKey++; S.keys.push(e.key); break;
        case 'ask': if (R && !R.firstAsk) { R.firstAsk = w.time; R.unfoldT = w.time - R.t0; } break;
        case 'wrong': if (R) { R.wrong++; R.stepWrong++; if (R.stepWrong >= 2 && !R.stepHint && !w.hintHand && w.time - w._lastHintT > 6.01 + dt) S.miss2NoHint++; } break;
        case 'squish': if (R) R.squish++; break;
        case 'soft': if (R) R.soft++; break;
        case 'assist': if (R) R.assist++; break;
        case 'right': if (R) { R.rightT.push(w.time - R.firstAsk); R.stepWrong = 0; R.stepHint = 0; } break;
        case 'idle': if (R) R.idle++; if (quiet) S.idles.push(+(w.time).toFixed(1)); break;
        case 'hint': if (R) { if (e.idle) R.hintIdle++; else R.hintMiss++; R.stepHint++; } break;
        case 'pumpAsk': pumpT = w.time; auto = false; break;
        case 'pump': if (e.auto) auto = true; break;
        case 'launch': launchT = w.time; S.pumps.push(w.time - pumpT); S.launches++; if (auto) S.autoLaunch++; break;
        case 'land': S.flights.push(e.flight); if (!(e.err <= 2)) S.landErr++; break;
        case 'marmotTap': case 'goatTap': case 'birdTap': if (R) R.surpriseTap++; break;
        case 'marmot': S.marmots++; if (R) R.surpriseShown++; break;
        case 'goat': S.goats++; if (R) R.surpriseShown++; break;
        case 'bird': S.birds++; if (R) R.surpriseShown++; break;
        case 'gust': S.gusts++; break;
        case 'camp': if (R) R.camp0 = w.time; break;
        case 'roundDone': if (R) { R.stars = e.stars; R.playT = w.time - R.firstAsk; R.doneT = w.time; R.campT = w.time - R.camp0; } break;
        case 'levelDone': if (chap) { chap.dur = w.time - chap.t0; chap.cut = chap.rounds < 4; S.chapters.push(chap); } chap = null; break;
        case 'talk': S.talks++; break;
        case 'talkResult': if (e.correct) S.talkRight++; if (e.auto) S.talkAuto++; break;
        case 'sessionDone': S.done = true; break;
      }
      // a round lasts from its `round` event (unfold) to the next round's unfold / Talk time (incl. the camp + wipe)
      if ((e.type === 'round' || e.type === 'talk') && S._prevR) { const P = S._prevR; P.dur = w.time - P.t0; S.rounds.push(P); if (chap) { chap.rounds++; chap.stars += P.stars || 0; } S._prevR = null; }
      if (e.type === 'roundDone') S._prevR = R;
    }
  }
  S.time = w.time;
  delete S._prevR;
  return S;
}

function summarize(list) {
  const by = {};
  for (const s of list) (by[s.model + '|' + s.age] = by[s.model + '|' + s.age] || []).push(s);
  const rows = [];
  for (const k of Object.keys(by)) {
    const ss = by[k], [model, age] = k.split('|');
    const rounds = ss.flatMap(s => s.rounds), chaps = ss.flatMap(s => s.chapters), done = ss.filter(s => s.done), nR = Math.max(1, rounds.length);
    const st = [3, 2, 1].map(n => rounds.filter(r => r.stars === n).length / nR * 100);
    const m = f => L.mean(rounds.map(f));
    rows.push({ model, age: +age, n: ss.length, nRounds: rounds.length, done: done.length / ss.length * 100,
      sess: L.mean(done.map(s => s.time)) / 60, sessP90: L.pct(done.map(s => s.time), 0.9) / 60, sessMax: Math.max(0, ...done.map(s => s.time)) / 60,
      chap: L.mean(chaps.map(c => c.dur)), chapP10: L.pct(chaps.map(c => c.dur), 0.1), chapP90: L.pct(chaps.map(c => c.dur), 0.9),
      cut: chaps.filter(c => c.cut).length / Math.max(1, chaps.length) * 100,
      round: m(r => r.dur), roundP10: L.pct(rounds.map(r => r.dur), 0.1), roundP90: L.pct(rounds.map(r => r.dur), 0.9),
      unfold: m(r => r.unfoldT), first: L.mean(rounds.filter(r => r.rightT.length).map(r => r.rightT[0])), play: m(r => r.playT), camp: m(r => r.campT),
      flight: L.mean(ss.flatMap(s => s.flights)), flightP10: L.pct(ss.flatMap(s => s.flights), 0.1), flightP90: L.pct(ss.flatMap(s => s.flights), 0.9),
      pump: L.mean(ss.flatMap(s => s.pumps)), autoL: ss.reduce((a, s) => a + s.autoLaunch, 0) / Math.max(1, ss.reduce((a, s) => a + s.launches, 0)) * 100,
      landErr: ss.reduce((a, s) => a + s.landErr, 0), hintsPerRound: m(r => r.hintMiss + r.hintIdle),
      stuck: rounds.filter(r => r.dur > 120).length, maxRound: Math.max(0, ...rounds.map(r => r.dur)),
      short: rounds.filter(r => r.short).length / nR * 100, k: m(r => r.k), mm: m(r => r.m),
      st3: st[0], st2: st[1], st1: st[2], wrong: m(r => r.wrong), squish: m(r => r.squish), soft: m(r => r.soft),
      assistR: rounds.filter(r => r.assist > 0).length / nR * 100, hintRounds: rounds.filter(r => r.hintMiss + r.hintIdle > 0).length / nR * 100,
      talkRight: ss.reduce((a, s) => a + s.talkRight, 0) / Math.max(1, ss.reduce((a, s) => a + s.talks, 0)) * 100,
      talkAuto: ss.reduce((a, s) => a + s.talkAuto, 0) / Math.max(1, ss.reduce((a, s) => a + s.talks, 0)) * 100,
      nan: ss.filter(s => s.nan).length, stuckState: ss.filter(s => s.stuckState).length, off: ss.reduce((a, s) => a + s.offScreen, 0),
      m2: ss.reduce((a, s) => a + s.miss2NoHint, 0), idles: model === 'absent' ? (ss[0].idles || []).slice(0, 6).join(' ') : '',
      repKey: ss.reduce((a, s) => a + s.repKey, 0) / nR * 100,
      surpShown: rounds.filter(r => r.surpriseShown).length / nR * 100,
      surpTap: rounds.filter(r => r.surpriseShown).length ? rounds.filter(r => r.surpriseShown && r.surpriseTap).length / rounds.filter(r => r.surpriseShown).length * 100 : 0,
      surprises: ['marmots', 'goats', 'birds'].map(k => ss.reduce((a, s) => a + s[k], 0)).join(' / ') });
  }
  rows.sort((a, b) => a.model.localeCompare(b.model) || a.age - b.age);
  return rows;
}
function table(rows) {
  const f = L.f1, out = [];
  out.push('| model | age | n | done % | session min mean (p90, max) | chapter s mean [p10–p90] | cut % | round s mean [p10–p90] | unfold / first right / play / camp s | flight s mean [p10–p90] · pump s (auto %) | rounds > 120 s (max s) | stars 3/2/1 % | wrong / squish / soft per round | hint rounds % · hints / round (assist %) | talk right % (auto %) | NaN / stuck / off / land > 2 px / 2-miss-no-hint |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) out.push(`| ${r.model} | ${r.age} | ${r.n} | ${f(r.done)} | ${f(r.sess)} (${f(r.sessP90)}, ${f(r.sessMax)}) | ${f(r.chap)} [${f(r.chapP10)}–${f(r.chapP90)}] | ${f(r.cut)} | ${f(r.round)} [${f(r.roundP10)}–${f(r.roundP90)}] | ${f(r.unfold)} / ${f(r.first)} / ${f(r.play)} / ${f(r.camp)} | ${(+r.flight).toFixed(2)} [${(+r.flightP10).toFixed(2)}–${(+r.flightP90).toFixed(2)}] · ${f(r.pump)} (${f(r.autoL)}) | ${r.stuck} (${f(r.maxRound)}) | ${f(r.st3)}/${f(r.st2)}/${f(r.st1)} | ${r.wrong.toFixed(2)} / ${r.squish.toFixed(2)} / ${r.soft.toFixed(2)} | ${f(r.hintRounds)} · ${r.hintsPerRound.toFixed(2)} (${f(r.assistR)}) | ${f(r.talkRight)} (${f(r.talkAuto)}) | ${r.nan} / ${r.stuckState} / ${r.off} / ${r.landErr} / ${r.m2}${r.idles ? ' · idle at ' + r.idles : ''} |`);
  out.push('', '| model | age | k × m per round | short rounds % | repeated set % | surprise rounds % (tapped %) | marmots / goats / birds |', '|---|---|---|---|---|---|---|');
  for (const r of rows) if (r.model !== 'absent') out.push(`| ${r.model} | ${r.age} | ${r.k.toFixed(2)} × ${r.mm.toFixed(2)} | ${f(r.short)} | ${f(r.repKey)} | ${f(r.surpShown)} (${f(r.surpTap)}) | ${r.surprises} |`);
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
    const n = model === 'absent' ? Math.min(N, 3) : /^(tapper|spammer|perfect)$|^bot/.test(model) ? Math.min(N, 40) : /^kid/.test(model) ? Math.min(N, 100) : N;
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
    const list = rs.flat(), failed = list.filter(s => s.failed), rows = summarize(list.filter(s => !s.failed)), md = table(rows);
    const head = `# hs_playtest ${TAG} — ${list.length} sessions (${failed.length} failed), config ${JSON.stringify(config)} (${((Date.now() - t0) / 1000).toFixed(0)} s)\n\n`;
    console.log(head + md);
    const dir = path.join(__dirname, 'out');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'hs_' + TAG + '.md'), head + md + '\n');
    fs.writeFileSync(path.join(dir, 'hs_' + TAG + '.json'), JSON.stringify({ config, rows }, null, 1));
    // slow3 (a very slow, distractible 3-year-old that looks away 4–12 s at a time) may have ≤ 1 % rounds > 120 s: the round simply waits
    const bad = rows.filter(r => r.nan || r.stuckState || r.off || r.m2 || r.landErr || (r.model !== 'absent' && r.stuck > (r.model === 'slow3' ? 0.01 * r.nRounds : 0)));
    if (failed.length || bad.length) { console.log('\nFAIL: ' + (failed.length + ' failed sessions; ') + bad.map(r => r.model + '/' + r.age).join(', ')); process.exit(1); }
  });
}
