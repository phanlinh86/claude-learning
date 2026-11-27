#!/usr/bin/env node
// Tupi's Bakery Delivery — HIGH-SPEED headless playtest with child models (report-only; never edits game/js).
//   node tests/sim/hs_playtest.js [--n 60] [--ages 3,4,5,6,7] [--models typical,slow3,...] [--config '{…}'] [--jobs 2] [--tag name]
// Every session is simulated at full speed through the real input API (presses, drags along the road, lifts; 1/30 s frames) on the
// 6 viewport shapes, EN / VI alternating.
// Models (tests/sim/lib.js): typical, kid0.3 / kid0.6 / kid0.9, slow3, perfect, tapper (random), spammer, offroad (drags straight
// at the house, off the road), absent, bot<skill> (quick BD.Bot), botT<skill> (toddler-paced BD.Bot).
// Output: markdown tables on stdout + tests/sim/out/hs_<tag>.md + .json (tests/sim/out/ is git-ignored).
// Targets: typical / botT age 4 chapter 60–100 s, session ≤ 8 min (p90); 0 stuck rounds (> 120 s) for an engaged model, 0 stuck states
// (no progress for 200 s) for any model, 0 NaN, 0 cart off the road / off screen; 2 wrong houses (no right one between) bring a hint
// (unless within the 6 s cooldown). Exit 1 on any of those.
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const L = require('./lib');

const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 60), config = JSON.parse(get('config', '{}'));
const ALL = 'typical,slow3,tapper,spammer,offroad,kid0.3,kid0.6,perfect,bot1,botT0.8,bot0.5,absent';
const MODELS = get('models', ALL).split(','), AGES = get('ages', '3,4,5,6,7').split(',').map(Number);
const TAG = get('tag', 'base'), JOBS = +get('jobs', 2);
const VPS = Object.keys(L.VIEWPORTS);
const NON_POS = ['session', 'talkAsk', 'talkResult', 'levelDone', 'sessionDone', 'talk'];

function finiteWorld(w) {
  const c = w.cart;
  if (![c.x, c.y, c.lean, c.bounce, c.faceS, c.wheelRot, c.squash, c.spd, w.stars, w.wind].every(Number.isFinite)) return false;
  return w.houses.every(h => [h.x, h.y, h.door, h.lit, h.squash].every(Number.isFinite)) && w.sprinkles.every(p => Number.isFinite(p.x + p.y)) && w.puffs.every(p => Number.isFinite(p.x + p.y));
}

function runOne(o) {
  const w = L.mkWorld(o);
  const d = L.makeModel(o.model, w, o.age, o.seed + 1);
  const quiet = o.model === 'absent';
  const S = { model: o.model, age: o.age, done: false, nan: false, time: 0, stuckState: false, rounds: [], chapters: [], talks: 0, talkRight: 0, talkAuto: 0,
    miss2NoHint: 0, offRoad: 0, offScreenEv: 0, idles: [], repKey: 0, keys: [], gusts: 0, honks: 0, maps: { strict: 0, loose: 0, bad: 0 }, S: [] };
  w.newSession();
  const dt = 1 / 30, cap = o.cap || (quiet ? 600 : 1800);
  let R = null, chap = null, t = 0, lastChange = 0, sig = '';
  while (w.state !== 'sessionDone' && t < cap) {
    d.step(dt); w.update(dt); t += dt;
    if (!finiteWorld(w)) { S.nan = true; break; }
    const Lw = w.layout, c = w.cart;
    if (w.roads && w.state === 'round' && c.alpha > 0) {
      const p = L.BD.Roads.project(w.roads, c.x, c.y);
      if (!p || p.d > 2) S.offRoad++;
      const E = w.cartExt();
      if (c.x - E.half < Lw.ins.left - 2 || c.x + E.half > Lw.W - Lw.ins.right + 2 || c.y - E.up < Lw.ins.top - 2 || c.y > Lw.H) S.offRoad++;
    }
    const s2 = w.state + ':' + w.phase + ':' + w.level + ':' + w.round + ':' + w.order + ':' + c.state;
    if (s2 !== sig) { sig = s2; lastChange = t; } else if (!quiet && t - lastChange > 200) { S.stuckState = s2; break; }
    for (const e of w.drainEvents()) {
      if (d.onEvent) d.onEvent(e);
      if (!NON_POS.includes(e.type) && (e.x === undefined || e.x < 0 || e.y < 0 || e.x > Lw.W || e.y > Lw.H)) S.offScreenEv++;
      switch (e.type) {
        case 'session': S.topics = e.levels; break;
        case 'level': chap = { topic: e.topic, t0: w.time, rounds: 0, level: e.level, stars: 0 }; break;
        case 'round':
          R = { topic: w.topic, ri: e.round, t0: w.time, n: e.n, d: e.d, forks: w.roads ? w.roads.forks : e.forks, short: e.short, wrong: 0, soft: 0, honk: 0, assist: 0, hintMiss: 0, hintIdle: 0, idle: 0,
            surprise: e.surprise, surpriseTap: 0, surpriseShown: 0, firstAsk: 0, stepWrong: 0, stepHint: 0, rightT: [], S: w.roads ? w.roads.S : 0, loose: w.roads ? w.roads.loose : false };
          if (w.roads) { if (!w.roads.ok) S.maps.bad++; else if (w.roads.loose) S.maps.loose++; else S.maps.strict++; S.S.push(w.roads.S); }
          if (S.keys.includes(e.key)) S.repKey++; S.keys.push(e.key); break;
        case 'ask': if (R) { if (!R.firstAsk) R.firstAsk = w.time; R.lastAsk = w.time; } break;
        case 'wrong': if (R) { R.wrong++; R.stepWrong++; if (R.stepWrong >= 2 && !R.stepHint && !e.hint && w.time - w._lastHintT > 6.01 + dt && !w._hintPending) S.miss2NoHint++; } break;
        case 'soft': if (R) R.soft++; break;
        case 'honk': if (R) R.honk++; S.honks++; break;
        case 'assist': if (R) R.assist++; break;
        case 'right': if (R) { R.rightT.push(w.time - R.lastAsk); R.stepWrong = 0; R.stepHint = 0; } break;
        case 'idle': if (R) R.idle++; if (quiet) S.idles.push(+(w.time).toFixed(1)); break;
        case 'hint': if (R && !e.demo) { if (e.idle) R.hintIdle++; else R.hintMiss++; R.stepHint++; } break;
        case 'mouseTap': case 'birdTap': case 'snowTap': if (R) R.surpriseTap++; break;
        case 'mouse': case 'bird': case 'snow': if (R) R.surpriseShown++; break;
        case 'gust': S.gusts++; break;
        case 'roundDone': if (R) { R.stars = e.stars; R.playT = w.time - R.firstAsk; } break;
        case 'levelDone': if (chap) { chap.dur = w.time - chap.t0; chap.cut = chap.rounds < 4; S.chapters.push(chap); } chap = null; break;
        case 'talk': S.talks++; break;
        case 'talkResult': if (e.correct) S.talkRight++; if (e.auto) S.talkAuto++; break;
        case 'sessionDone': S.done = true; break;
      }
      // a round lasts from its `round` event (build) to the next round's build / Talk time (incl. the party + wipe)
      if ((e.type === 'round' || e.type === 'talk') && S._prevR) { const P = S._prevR; P.dur = w.time - P.t0; S.rounds.push(P); if (chap) { chap.rounds++; chap.stars += P.stars || 0; } S._prevR = null; }
      if (e.type === 'roundDone') S._prevR = R;
    }
  }
  S.time = w.time;
  if (d.stats) S.kid = d.stats;
  delete S._prevR; delete S.keys;
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
    const maps = ss.reduce((a, s) => ({ strict: a.strict + s.maps.strict, loose: a.loose + s.maps.loose, bad: a.bad + s.maps.bad }), { strict: 0, loose: 0, bad: 0 });
    rows.push({ model, age: +age, n: ss.length, done: done.length / ss.length * 100,
      sess: L.mean(done.map(s => s.time)) / 60, sessP90: L.pct(done.map(s => s.time), 0.9) / 60, sessMax: Math.max(0, ...done.map(s => s.time)) / 60,
      chap: L.mean(chaps.map(c => c.dur)), chapP10: L.pct(chaps.map(c => c.dur), 0.1), chapP90: L.pct(chaps.map(c => c.dur), 0.9),
      cut: chaps.filter(c => c.cut).length / Math.max(1, chaps.length) * 100,
      round: m(r => r.dur), roundP10: L.pct(rounds.map(r => r.dur), 0.1), roundP90: L.pct(rounds.map(r => r.dur), 0.9),
      deliver: L.mean(rounds.flatMap(r => r.rightT)), play: m(r => r.playT || 0),
      stuck: rounds.filter(r => r.dur > 120).length, maxRound: Math.max(0, ...rounds.map(r => r.dur)),
      short: rounds.filter(r => r.short).length / nR * 100, nh: m(r => r.n), nd: m(r => r.d), forks2: rounds.filter(r => r.forks === 2).length / nR * 100,
      st3: st[0], st2: st[1], st1: st[2], wrong: m(r => r.wrong), soft: m(r => r.soft), honk: m(r => r.honk),
      assistR: rounds.filter(r => r.assist > 0).length / nR * 100, hintRounds: rounds.filter(r => r.hintMiss + r.hintIdle > 0).length / nR * 100,
      talkRight: ss.reduce((a, s) => a + s.talkRight, 0) / Math.max(1, ss.reduce((a, s) => a + s.talks, 0)) * 100,
      talkAuto: ss.reduce((a, s) => a + s.talkAuto, 0) / Math.max(1, ss.reduce((a, s) => a + s.talks, 0)) * 100,
      nan: ss.filter(s => s.nan).length, stuckState: ss.filter(s => s.stuckState).length, off: ss.reduce((a, s) => a + s.offRoad, 0), offEv: ss.reduce((a, s) => a + s.offScreenEv, 0),
      m2: ss.reduce((a, s) => a + s.miss2NoHint, 0), idles: model === 'absent' ? (ss[0].idles || []).slice(0, 6).join(' ') : '',
      repKey: ss.reduce((a, s) => a + s.repKey, 0) / nR * 100, maps, S: L.mean(ss.flatMap(s => s.S)),
      surpShown: rounds.filter(r => r.surpriseShown).length / nR * 100,
      surpTap: rounds.filter(r => r.surpriseShown).length ? rounds.filter(r => r.surpriseShown && r.surpriseTap).length / rounds.filter(r => r.surpriseShown).length * 100 : 0 });
  }
  rows.sort((a, b) => a.model.localeCompare(b.model) || a.age - b.age);
  return rows;
}
function table(rows) {
  const f = L.f1, out = [];
  out.push('| model | age | n | done % | session min mean (p90, max) | chapter s mean [p10–p90] | cut % | round s mean [p10–p90] | ask → delivery s | rounds > 120 s (max s) | stars 3/2/1 % | wrong / honk / soft per round | hint rounds % (assist %) | talk right % (auto %) | NaN / stuck / off-road / off-screen ev / 2-miss-no-hint |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) out.push(`| ${r.model} | ${r.age} | ${r.n} | ${f(r.done)} | ${f(r.sess)} (${f(r.sessP90)}, ${f(r.sessMax)}) | ${f(r.chap)} [${f(r.chapP10)}–${f(r.chapP90)}] | ${f(r.cut)} | ${f(r.round)} [${f(r.roundP10)}–${f(r.roundP90)}] | ${f(r.deliver)} | ${r.stuck} (${f(r.maxRound)}) | ${f(r.st3)}/${f(r.st2)}/${f(r.st1)} | ${r.wrong.toFixed(2)} / ${r.honk.toFixed(2)} / ${r.soft.toFixed(2)} | ${f(r.hintRounds)} (${f(r.assistR)}) | ${f(r.talkRight)} (${f(r.talkAuto)}) | ${r.nan} / ${r.stuckState} / ${r.off} / ${r.offEv} / ${r.m2}${r.idles ? ' · idle at ' + r.idles : ''} |`);
  out.push('', '| model | age | houses × deliveries per round | 2-fork maps % | short rounds % | repeated round % | maps strict / loose / invalid | mean house S | surprise rounds % (tapped %) |', '|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) if (r.model !== 'absent') out.push(`| ${r.model} | ${r.age} | ${r.nh.toFixed(2)} × ${r.nd.toFixed(2)} | ${f(r.forks2)} | ${f(r.short)} | ${f(r.repKey)} | ${r.maps.strict} / ${r.maps.loose} / ${r.maps.bad} | ${r.S.toFixed(0)} | ${f(r.surpShown)} (${f(r.surpTap)}) |`);
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
    const n = model === 'absent' ? Math.min(N, 3) : /^(tapper|spammer|perfect|offroad)$|^bot/.test(model) ? Math.min(N, 20) : /^kid/.test(model) ? Math.min(N, 30) : N;
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
    const bad = rows.filter(r => r.nan || r.stuckState || r.off || r.offEv || r.m2 || (r.model !== 'absent' && r.stuck));
    if (failed.length || bad.length) { console.log('\nFAIL: ' + (failed.length + ' failed sessions; ') + bad.map(r => r.model + '/' + r.age).join(', ')); process.exit(1); }
  });
}
