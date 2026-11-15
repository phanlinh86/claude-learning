#!/usr/bin/env node
// Nim's River Hop — HIGH-SPEED headless playtest with child models (report-only; never edits game/js).
//   node tests/sim/hs_playtest.js [--n 200] [--ages 3,4,5,6,7] [--models typical,kid0.3,...] [--config '{…}'] [--jobs 4] [--tag name]
// Every session is simulated at full speed through the real input API (a tap = press + lift; 1/30 s frames) on 5 viewports, en / vi.
// Models (tests/sim/lib.js): typical, kid0.3 / kid0.6 / kid0.9, slow3, perfect, tapper, spammer, absent, bot<skill> (quick NH.Bot),
// botT<skill> (toddler-paced NH.Bot).
// Output: markdown tables on stdout + tests/sim/out/hs_<tag>.md + .json (tests/sim/out/ is git-ignored).
// Targets: typical / botT age 4 chapter 60–100 s, session ≤ 8 min (p90); 0 stuck rounds (> 120 s) for an engaged model, 0 stuck
// states (no progress for 200 s) for any model, 0 NaN, 0 stones / Nim off screen; every 2 misses (no right answer between) got a hint
// (unless within the 6 s cooldown). Exit 1 on any of those.
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
  const n = w.nim;
  if (![n.x, n.y, n.sx, n.sy, n.lean, n.rollRot, w.stars, w.wind].every(Number.isFinite)) return false;
  return w.stones.every(s => [s.x, s.y, s.dip, s.tilt, s.sub, s.thingHop].every(Number.isFinite)) && w.drops.every(d => Number.isFinite(d.x + d.y)) &&
    (!w.fish || Number.isFinite(w.fish.x + w.fish.y)) && (!w.frog || Number.isFinite(w.frog.x + w.frog.y));
}

function runOne(o) {
  const w = L.mkWorld(o);
  const d = L.makeModel(o.model, w, o.age, o.seed + 1);
  const quiet = o.model === 'absent';
  const S = { model: o.model, age: o.age, done: false, nan: false, time: 0, stuckState: false, rounds: [], chapters: [], talks: 0, talkRight: 0, talkAuto: 0,
    miss2NoHint: 0, offScreen: 0, idles: [], repKey: 0, keys: [], gusts: 0, frogs: 0, fishes: 0, frogFallback: 0 };
  w.newSession();
  const dt = 1 / 30, cap = o.cap || (quiet ? 600 : 1800);
  let R = null, chap = null, t = 0, lastChange = 0, sig = '';
  while (w.state !== 'sessionDone' && t < cap) {
    d.step(dt); w.update(dt); t += dt;
    if (!finiteWorld(w)) { S.nan = true; break; }
    const Lw = w.layout;
    for (const s of w.stones) if (s.state === 'rest' && (s.x - Lw.S / 2 < Lw.ins.left - 2 || s.x + Lw.S / 2 > Lw.W - Lw.ins.right + 2 || s.y - Lw.itemH < 0 || s.y + 0.4 * Lw.S > Lw.H - Lw.ins.bottom + 2)) S.offScreen++;
    if (w.nim.x < 0 || w.nim.x > Lw.W || w.nim.y < 0 || w.nim.y > Lw.H) S.offScreen++;
    const s2 = w.state + ':' + w.phase + ':' + w.level + ':' + w.round + ':' + w.row;
    if (s2 !== sig) { sig = s2; lastChange = t; } else if (!quiet && t - lastChange > 200) { S.stuckState = s2; break; }
    for (const e of w.drainEvents()) {
      if (d.onEvent) d.onEvent(e);
      switch (e.type) {
        case 'session': S.topics = e.levels; break;
        case 'level': chap = { topic: e.topic, t0: w.time, rounds: 0, level: e.level, stars: 0 }; break;
        case 'round':
          R = { topic: w.topic, ri: e.round, t0: w.time, n: e.n, k: e.k, m: e.m, mode: e.mode, short: e.short, wrong: 0, soft: 0, ahead: 0, assist: 0, hintMiss: 0, hintIdle: 0, idle: 0, squish: 0,
            surprise: e.surprise, surpriseTap: 0, surpriseShown: 0, firstAsk: 0, riseT: 0, stepWrong: 0, stepHint: 0, level: w.level, rightT: [], doneT: 0, bankT: 0, bank0: 0 };
          if (S.keys.includes(e.key)) S.repKey++; S.keys.push(e.key); break;
        case 'ask': if (R && !R.firstAsk) { R.firstAsk = w.time; R.riseT = w.time - R.t0; } break;
        case 'wrong': if (R) { R.wrong++; R.stepWrong++; if (R.stepWrong >= 2 && !R.stepHint && !w.hintHand && w.time - w._lastHintT > 6.01 + dt) S.miss2NoHint++; } break;
        case 'squish': if (R) R.squish++; break;
        case 'soft': if (R) R.soft++; break;
        case 'ahead': if (R) R.ahead++; break;
        case 'assist': if (R) R.assist++; break;
        case 'right': if (R) { R.rightT.push(w.time - R.firstAsk); R.stepWrong = 0; R.stepHint = 0; } break;
        case 'idle': if (R) R.idle++; if (quiet) S.idles.push(+(w.time).toFixed(1)); break;
        case 'hint': if (R) { if (e.idle) R.hintIdle++; else R.hintMiss++; R.stepHint++; } break;
        case 'fishTap': case 'frogTap': case 'snowTap': if (R) R.surpriseTap++; break;
        case 'fish': if (e.n === 1) { S.fishes++; if (R) R.surpriseShown++; if (R && R.surprise === 'frog') S.frogFallback++; } break;
        case 'frog': S.frogs++; if (R) R.surpriseShown++; break;
        case 'snow': if (R) R.surpriseShown++; break;
        case 'gust': S.gusts++; break;
        case 'bankLand': if (R) R.bank0 = w.time; break;
        case 'roundDone': if (R) { R.stars = e.stars; R.playT = w.time - R.firstAsk; R.doneT = w.time; R.bankT = w.time - R.bank0; } break;
        case 'levelDone': if (chap) { chap.dur = w.time - chap.t0; chap.cut = chap.rounds < 4; S.chapters.push(chap); } chap = null; break;
        case 'talk': S.talks++; break;
        case 'talkResult': if (e.correct) S.talkRight++; if (e.auto) S.talkAuto++; break;
        case 'sessionDone': S.done = true; break;
      }
      // a round lasts from its `round` event (rise) to the next round's rise / Talk time (incl. the bank + wipe)
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
    rows.push({ model, age: +age, n: ss.length, done: done.length / ss.length * 100,
      sess: L.mean(done.map(s => s.time)) / 60, sessP90: L.pct(done.map(s => s.time), 0.9) / 60, sessMax: Math.max(0, ...done.map(s => s.time)) / 60,
      chap: L.mean(chaps.map(c => c.dur)), chapP10: L.pct(chaps.map(c => c.dur), 0.1), chapP90: L.pct(chaps.map(c => c.dur), 0.9),
      cut: chaps.filter(c => c.cut).length / Math.max(1, chaps.length) * 100,
      round: m(r => r.dur), roundP10: L.pct(rounds.map(r => r.dur), 0.1), roundP90: L.pct(rounds.map(r => r.dur), 0.9),
      rise: m(r => r.riseT), first: L.mean(rounds.filter(r => r.rightT.length).map(r => r.rightT[0])), play: m(r => r.playT), bank: m(r => r.bankT),
      stuck: rounds.filter(r => r.dur > 120).length, maxRound: Math.max(0, ...rounds.map(r => r.dur)),
      short: rounds.filter(r => r.short).length / nR * 100, k: m(r => r.k), mm: m(r => r.m),
      st3: st[0], st2: st[1], st1: st[2], wrong: m(r => r.wrong), squish: m(r => r.squish), soft: m(r => r.soft), ahead: m(r => r.ahead),
      assistR: rounds.filter(r => r.assist > 0).length / nR * 100, hintRounds: rounds.filter(r => r.hintMiss + r.hintIdle > 0).length / nR * 100,
      talkRight: ss.reduce((a, s) => a + s.talkRight, 0) / Math.max(1, ss.reduce((a, s) => a + s.talks, 0)) * 100,
      talkAuto: ss.reduce((a, s) => a + s.talkAuto, 0) / Math.max(1, ss.reduce((a, s) => a + s.talks, 0)) * 100,
      nan: ss.filter(s => s.nan).length, stuckState: ss.filter(s => s.stuckState).length, off: ss.reduce((a, s) => a + s.offScreen, 0),
      m2: ss.reduce((a, s) => a + s.miss2NoHint, 0), idles: model === 'absent' ? (ss[0].idles || []).slice(0, 6).join(' ') : '',
      repKey: ss.reduce((a, s) => a + s.repKey, 0) / nR * 100,
      surpShown: rounds.filter(r => r.surpriseShown).length / nR * 100,
      surpTap: rounds.filter(r => r.surpriseShown).length ? rounds.filter(r => r.surpriseShown && r.surpriseTap).length / rounds.filter(r => r.surpriseShown).length * 100 : 0,
      frogs: ss.reduce((a, s) => a + s.frogs, 0), frogFallback: ss.reduce((a, s) => a + s.frogFallback, 0) });
  }
  rows.sort((a, b) => a.model.localeCompare(b.model) || a.age - b.age);
  return rows;
}
function table(rows) {
  const f = L.f1, out = [];
  out.push('| model | age | n | done % | session min mean (p90, max) | chapter s mean [p10–p90] | cut % | round s mean [p10–p90] | rise / first hop / play / bank s | rounds > 120 s (max s) | stars 3/2/1 % | wrong / ahead / squish / soft per round | hint rounds % (assist %) | talk right % (auto %) | NaN / stuck / off / 2-miss-no-hint |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) out.push(`| ${r.model} | ${r.age} | ${r.n} | ${f(r.done)} | ${f(r.sess)} (${f(r.sessP90)}, ${f(r.sessMax)}) | ${f(r.chap)} [${f(r.chapP10)}–${f(r.chapP90)}] | ${f(r.cut)} | ${f(r.round)} [${f(r.roundP10)}–${f(r.roundP90)}] | ${f(r.rise)} / ${f(r.first)} / ${f(r.play)} / ${f(r.bank)} | ${r.stuck} (${f(r.maxRound)}) | ${f(r.st3)}/${f(r.st2)}/${f(r.st1)} | ${r.wrong.toFixed(2)} / ${r.ahead.toFixed(2)} / ${r.squish.toFixed(2)} / ${r.soft.toFixed(2)} | ${f(r.hintRounds)} (${f(r.assistR)}) | ${f(r.talkRight)} (${f(r.talkAuto)}) | ${r.nan} / ${r.stuckState} / ${r.off} / ${r.m2}${r.idles ? ' · idle at ' + r.idles : ''} |`);
  out.push('', '| model | age | k × m per round | short rounds % | repeated set % | surprise rounds % (tapped %) | frogs (→ fish fallback) |', '|---|---|---|---|---|---|---|');
  for (const r of rows) if (r.model !== 'absent') out.push(`| ${r.model} | ${r.age} | ${r.k.toFixed(2)} × ${r.mm.toFixed(2)} | ${f(r.short)} | ${f(r.repKey)} | ${f(r.surpShown)} (${f(r.surpTap)}) | ${r.frogs} (${r.frogFallback}) |`);
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
    const bad = rows.filter(r => r.nan || r.stuckState || r.off || r.m2 || (r.model !== 'absent' && r.stuck));
    if (failed.length || bad.length) { console.log('\nFAIL: ' + (failed.length + ' failed sessions; ') + bad.map(r => r.model + '/' + r.age).join(', ')); process.exit(1); }
  });
}
