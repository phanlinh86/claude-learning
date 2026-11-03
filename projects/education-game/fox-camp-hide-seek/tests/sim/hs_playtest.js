#!/usr/bin/env node
// Pip's Camp Hide & Seek — HIGH-SPEED playtest with child models (report-only; never edits game/js).
//   node tests/sim/hs_playtest.js [--n 80] [--ages 3,4,5,6,7] [--models typical,slow3,...] [--config '{…}'] [--jobs 2] [--tag name] [--fast]
// Models: bot0.5 bot0.8 bot1 typical slow3 talkAbsent tapper spammer spammerAny sloppy confused absent (tests/sim/hs_models.js).
// Also emulates main.js voice/auto-pause: idle lines spoken for the first 4 idles of an ask, auto-pause on the 5th; Talk
// re-asks spoken n ≤ 3, auto-pause at n = 4. Absent / talkAbsent sessions end at that pause.
// Output: markdown table on stdout + tests/sim/out/hs_<tag>.{md,json}.
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const L = require('./lib');
const M = require('./hs_models');
const FC = L.FC;

const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 80), config = JSON.parse(get('config', '{}'));
if (args.includes('--fast')) config.step = 1 / 60;
const ALL = 'bot0.5,bot0.8,bot1,typical,slow3,talkAbsent,tapper,spammer,spammerAny,sloppy,confused,absent';
const MODELS = get('models', ALL).split(','), AGES = get('ages', '3,4,5,6,7').split(',').map(Number);
const TAG = get('tag', 'base'), JOBS = +get('jobs', 2);
const VPS = Object.keys(L.VIEWPORTS);
const SHOW = { gather: 1, count: 1, peek: 1, found: 1, swap: 1, party: 1 };   // watching time (no input possible)

function runOne(o) {
  const vp = L.VIEWPORTS[o.vp];
  const w = new FC.World({ seed: o.seed, age: o.age, lang: o.lang, config: o.config || {} });
  w.setViewport(vp.W, vp.H, vp.ins);
  const d = M.makeModel(o.model, w, o.age, o.seed + 1);
  const quiet = o.model === 'absent' || o.model === 'talkAbsent';
  const S = { model: o.model, age: o.age, done: false, paused: false, pauseAt: null, pauseWhy: null, nan: false, time: 0,
    phase: {}, asks: [], rounds: [], chapters: [], idles: 0, idleSpoken: 0, talkAsks: 0, talkSpoken: 0,
    hintsMiss: 0, hintsIdle: 0, miss2NoHint: 0, critter: 0, critterTap: 0, swaps: 0, surpriseRounds: {}, pausesActive: 0, locked: 0, empty: 0 };
  w.newSession();
  const dt = 1 / 30, cap = o.cap || 1500;
  let ask = null, roundT0 = 0, chapT0 = 0, roundsInChap = 0, idleSaid = 0, roundSurprise = null, t = 0, lastAns = null;
  while (w.state !== 'sessionDone' && t < cap) {
    d.step(dt); w.update(dt); t += dt;
    const key = w.state === 'round' ? 'round:' + w.phase : w.state;
    S.phase[key] = (S.phase[key] || 0) + dt;
    if (w.friends.some(f => !isFinite(f.x) || !isFinite(f.y))) { S.nan = true; break; }
    let stop = false;
    for (const e of w.drainEvents()) {
      switch (e.type) {
        case 'level': chapT0 = w.time; roundsInChap = 0; break;
        case 'round': roundT0 = w.time; idleSaid = 0; roundSurprise = e.surprise; if (e.surprise) S.surpriseRounds[e.surprise] = (S.surpriseRounds[e.surprise] || 0) + 1; break;
        case 'ask': {
          idleSaid = 0;
          const ps = w.places.filter(p => !p.leaving).sort((p, q) => p.x - q.x), a = w.placeById(e.answerId), n = ps.length, rank = ps.indexOf(a);
          ask = { t0: w.time, n, rank, rankName: rank === 0 ? 'L' : rank === n - 1 ? 'R' : 'M', back: a.row === 0 && n > 1, misses: 0, hint: false,
            samePlace: lastAns === a.id, round: w.round, i: e.ask };
          lastAns = a.id;
          break;
        }
        case 'wrong': if (ask) { ask.misses++; if (e.misses === w.cfg.hintAfterMisses) ask.m2t = w.time; } break;
        case 'hint': if (e.idle) S.hintsIdle++; else S.hintsMiss++; if (ask) ask.hint = true; break;
        case 'found': if (ask) { ask.dur = w.time - ask.t0; S.asks.push(ask); ask = null; } break;
        case 'locked': S.locked++; break;
        case 'empty': S.empty++; break;
        case 'idle':
          S.idles++;
          if (++idleSaid <= 4) S.idleSpoken++;
          else if (idleSaid >= 5) { if (quiet) { S.paused = true; S.pauseAt = w.time; S.pauseWhy = 'idle'; stop = true; } else S.pausesActive++; }
          break;
        case 'roundDone': roundsInChap++; S.rounds.push({ dur: w.time - roundT0, stars: e.stars, surprise: roundSurprise }); break;
        case 'critter': S.critter++; break;
        case 'critterTap': S.critterTap++; break;
        case 'swap': S.swaps++; break;
        case 'talkAsk':
          S.talkAsks++;
          if (e.n <= 3) S.talkSpoken++;
          if (e.n >= 4) { if (quiet) { S.paused = true; S.pauseAt = w.time; S.pauseWhy = 'talk'; stop = true; } else S.pausesActive++; }
          break;
        case 'levelDone': S.chapters.push({ dur: w.time - chapT0, rounds: roundsInChap }); break;
      }
    }
    if (ask && ask.m2t != null && !ask.m2checked && w.time - ask.m2t > 0.1) { ask.m2checked = true; if (!ask.hint) S.miss2NoHint++; }
    if (stop) break;
  }
  if (ask && !S.paused) { ask.dur = w.time - ask.t0; ask.open = true; S.asks.push(ask); }
  S.done = w.state === 'sessionDone'; S.time = w.time; S.stars = w.stars;
  S.taps = d.stats ? d.stats.taps : 0; S.dstats = d.stats || null;
  return S;
}

function runSlice(pairs) {
  const out = [];
  for (const [age, model] of pairs) {
    const n = model === 'absent' || model === 'talkAbsent' ? Math.max(10, Math.round(N / 4)) : N;
    for (let k = 0; k < n; k++) out.push(runOne({ age, model, seed: 5000 + k * 31 + age * 7, lang: k % 2 ? 'vi' : 'en', vp: VPS[k % VPS.length], config,
      cap: model === 'absent' ? 900 : 1500 }));
  }
  return out;
}

function summarize(S) {
  const by = {};
  for (const s of S) (by[s.age + '|' + s.model] = by[s.age + '|' + s.model] || []).push(s);
  const rows = [];
  for (const k of Object.keys(by)) {
    const A = by[k], [age, model] = k.split('|');
    const done = A.filter(s => s.done), asks = [].concat(...A.map(s => s.asks)), rounds = [].concat(...done.map(s => s.rounds));
    const chaps = [].concat(...done.map(s => s.chapters)), ses = done.map(s => s.time), ad = asks.filter(h => h.dur != null).map(h => h.dur);
    const ph = {}; let tot = 0;
    for (const s of done) for (const [p, v] of Object.entries(s.phase)) { ph[p] = (ph[p] || 0) + v; tot += v; }
    const share = f => tot ? 100 * Object.entries(ph).filter(([p]) => f(p)).reduce((a, [, v]) => a + v, 0) / tot : 0;
    const n3 = asks.filter(h => h.n === 3), rk = x => n3.length ? 100 * n3.filter(h => h.rankName === x).length / n3.length : 0;
    const st = v => rounds.length ? 100 * rounds.filter(r => r.stars === v).length / rounds.length : 0;
    rows.push({
      age: +age, model, n: A.length, done: done.length, paused: A.filter(s => s.paused).length,
      pauseAt: L.mean(A.filter(s => s.paused).map(s => s.pauseAt)), pauseWhy: [...new Set(A.filter(s => s.paused).map(s => s.pauseWhy))].join('/'),
      chap: L.mean(chaps.map(c => c.dur)), chapP90: L.pct(chaps.map(c => c.dur), 0.9), cut: chaps.length ? 100 * chaps.filter(c => c.rounds < 4).length / chaps.length : 0,
      ses: L.mean(ses), sesP90: L.pct(ses, 0.9), sesMax: ses.length ? Math.max(...ses) : 0,
      round: L.mean(rounds.map(r => r.dur)), ask: L.mean(ad), askP90: L.pct(ad, 0.9), askMax: ad.length ? Math.max(...ad) : 0,
      stuck: asks.filter(h => h.dur > 60).length, asksN: asks.length,
      wrong: asks.length ? L.mean(asks.map(h => h.misses)) : 0, taps: asks.length ? A.reduce((a, s) => a + s.taps, 0) / asks.length : 0,
      hintMiss: asks.length ? A.reduce((a, s) => a + s.hintsMiss, 0) / asks.length : 0, hintIdle: asks.length ? A.reduce((a, s) => a + s.hintsIdle, 0) / asks.length : 0,
      idle: asks.length ? A.reduce((a, s) => a + s.idles, 0) / asks.length : 0, m2nohint: A.reduce((a, s) => a + s.miss2NoHint, 0),
      m2: asks.filter(h => h.misses >= 2).length, locked: A.reduce((a, s) => a + s.locked, 0) / Math.max(1, asks.length),
      s3: st(3), s2: st(2), s1: st(1),
      back: asks.length ? 100 * asks.filter(h => h.back).length / asks.length : 0,
      rankL: rk('L'), rankM: rk('M'), rankR: rk('R'),
      samePlace: asks.length ? 100 * asks.filter(h => h.samePlace).length / asks.length : 0,
      shAsk: share(p => p === 'round:ask'), shShow: share(p => SHOW[p.split(':')[1]] && p.startsWith('round')),
      shLeave: share(p => p === 'roundDone'), shOther: share(p => !p.startsWith('round')),
      surprise: A.reduce((a, s) => a + Object.values(s.surpriseRounds).reduce((x, y) => x + y, 0), 0) / Math.max(1, A.reduce((a, s) => a + s.chapters.length, 0)),
      critter: A.reduce((a, s) => a + s.critter, 0), critterTap: A.reduce((a, s) => a + s.critterTap, 0), swaps: A.reduce((a, s) => a + s.swaps, 0),
      surpStars: L.mean(rounds.filter(r => r.surprise).map(r => r.stars)), plainStars: L.mean(rounds.filter(r => !r.surprise).map(r => r.stars)),
      pausesActive: A.reduce((a, s) => a + s.pausesActive, 0),
      idleSpoken: L.mean(A.map(s => s.idleSpoken)), talkSpoken: L.mean(A.map(s => s.talkSpoken))
    });
  }
  rows.sort((a, b) => a.age - b.age || MODELS.indexOf(a.model) - MODELS.indexOf(b.model));
  return rows;
}

function table(rows) {
  const f = x => L.f1(x), p = x => (+x).toFixed(0);
  let md = '| age | model | done/n | chapter mean/p90 (s) | cut % | session mean/p90/max (s) | ask mean/p90/max (s) | taps/ask | wrong/ask | locked/ask | hint miss/idle per ask | 2nd miss w/o glow | idle/ask | ★★★/★★/★ % | ask / show / leave / other % | answer L/M/R % (3) | back row % | stuck >60 s |\n';
  md += '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
  for (const r of rows) {
    md += `| ${r.age} | ${r.model} | ${r.done}/${r.n}${r.paused ? ' (' + r.paused + ' paused @' + p(r.pauseAt) + ' s ' + r.pauseWhy + ')' : ''} | ${f(r.chap)} / ${f(r.chapP90)} | ${p(r.cut)} | ${p(r.ses)} / ${p(r.sesP90)} / ${p(r.sesMax)} | ${f(r.ask)} / ${f(r.askP90)} / ${p(r.askMax)} | ${f(r.taps)} | ${r.wrong.toFixed(2)} | ${r.locked.toFixed(2)} | ${r.hintMiss.toFixed(2)} / ${r.hintIdle.toFixed(2)} | ${r.m2nohint}/${r.m2} | ${r.idle.toFixed(2)} | ${p(r.s3)}/${p(r.s2)}/${p(r.s1)} | ${p(r.shAsk)} / ${p(r.shShow)} / ${p(r.shLeave)} / ${p(r.shOther)} | ${p(r.rankL)}/${p(r.rankM)}/${p(r.rankR)} | ${p(r.back)} | ${r.stuck} |\n`;
  }
  return md;
}

module.exports = { runOne, summarize, table };
if (require.main !== module) { /* required as a library */ } else if (args.includes('--worker')) {
  process.on('message', m => { process.send(runSlice(m.pairs), () => process.exit(0)); });
} else {
  const t0 = Date.now();
  const slices = [];
  for (let j = 0; j < JOBS; j++) slices.push([]);
  const pairs = []; for (const a of AGES) for (const m of MODELS) pairs.push([a, m]);
  pairs.forEach((pm, i) => slices[i % JOBS].push(pm));
  Promise.all(slices.filter(s => s.length).map(sl => new Promise((res, rej) => {
    const c = fork(__filename, [...args, '--worker']);
    const parts = [];
    c.on('message', r => parts.push(...r));
    c.on('exit', code => (code ? rej(new Error('worker ' + code)) : res(parts)));
    c.send({ pairs: sl });
  }))).then(parts => {
    const S = [].concat(...parts);
    const rows = summarize(S);
    const md = `## High-speed playtest "${TAG}" — ${S.length} sessions${Object.keys(config).length ? ' · config ' + JSON.stringify(config) : ''}\n\n` + table(rows) + `\n_${((Date.now() - t0) / 1000).toFixed(0)} s wall_\n`;
    const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'hs_' + TAG + '.json'), JSON.stringify(rows, null, 1));
    fs.writeFileSync(path.join(out, 'hs_' + TAG + '.md'), md);
    console.log(md);
  });
}
