#!/usr/bin/env node
// Bim's Rainbow Rocket — HIGH-SPEED playtest with child models (report-only; never edits game/js).
//   node tests/sim/hs_playtest.js [--n 80] [--ages 3,4,5,6,7] [--models typical,slow3,...] [--config '{…}'] [--emu '{…}']
//                                 [--jobs 2] [--tag name] [--fast]
// Models: bot0.5 bot0.8 bot1 typical slow3 boostIgnorer talkAbsent tapper spammer spammerAny sloppy absent (tests/sim/hs_models.js).
// --emu: harness-side emulation of proposed code changes {lock, snap, skyIdle, hint2} (see hs_models.emulate).
// Also emulates main.js voice/auto-pause: idle lines spoken for the first 4 idles of a hop, auto-pause on the 5th; Talk
// re-asks spoken n ≤ 3, auto-pause at n = 4. Absent / talkAbsent sessions end at that pause.
// Output: markdown table on stdout + tests/sim/out/hs_<tag>.json.
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const L = require('./lib');
const M = require('./hs_models');
const RR = L.RR;

const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 80), config = JSON.parse(get('config', '{}')), emu = JSON.parse(get('emu', 'null'));
if (args.includes('--fast')) config.step = 1 / 60;
const ALL = 'bot0.5,bot0.8,bot1,typical,slow3,boostIgnorer,talkAbsent,tapper,spammer,spammerAny,sloppy,absent';
const MODELS = get('models', ALL).split(','), AGES = get('ages', '3,4,5,6,7').split(',').map(Number);
const TAG = get('tag', 'base'), JOBS = +get('jobs', 2);
const VPS = Object.keys(L.VIEWPORTS);
const FLIGHT = { appear: 1, ignite: 1, fly: 1, land: 1, climb: 1 };

function runOne(o) {
  const vp = L.VIEWPORTS[o.vp];
  const w = new RR.World({ seed: o.seed, age: o.age, lang: o.lang, config: o.config || {} });
  w.setViewport(vp.W, vp.H, vp.ins);
  M.emulate(w, o.emu);
  const d = M.makeModel(o.model, w, o.age, o.seed + 1);
  const quiet = o.model === 'absent' || o.model === 'talkAbsent';
  const S = { model: o.model, age: o.age, done: false, paused: false, pauseAt: null, pauseWhy: null, nan: false, time: 0,
    phase: {}, hops: [], rounds: [], chapters: [], idles: 0, idleSpoken: 0, idleTimes: [], talkAsks: 0, talkSpoken: 0, talkAskTimes: [],
    hintsMiss: 0, hintsIdle: 0, miss2NoHint: 0, shooting: 0, shootingTap: 0, surpriseRounds: {}, pausesActive: 0, autoBoost: 0, boosts: 0, snaps: 0 };
  w.newSession();
  const dt = 1 / 30, cap = o.cap || 1500;
  let hop = null, roundT0 = 0, chapT0 = 0, roundsInChap = 0, idleSaid = 0, lastVal = null, lastRank = null, roundSurprise = null, talkT0 = 0;
  let t = 0;
  while (w.state !== 'sessionDone' && t < cap) {
    d.step(dt); w.update(dt); t += dt;
    const key = w.state === 'round' ? 'round:' + w.phase : w.state === 'roundDone' ? 'roundDone:' + w.phase : w.state;
    S.phase[key] = (S.phase[key] || 0) + dt;
    if (!isFinite(w.rocket.x) || !isFinite(w.camY)) { S.nan = true; break; }
    let stop = false;
    for (const e of w.drainEvents()) {
      switch (e.type) {
        case 'level': chapT0 = w.time; roundsInChap = 0; break;
        case 'round': roundT0 = w.time; idleSaid = 0; roundSurprise = e.surprise; if (e.surprise) S.surpriseRounds[e.surprise] = (S.surpriseRounds[e.surprise] || 0) + 1; break;
        case 'ask': {
          idleSaid = 0;
          const a = w.islandById(e.answerId), row = w._row.ids.map(id => w.islandById(id)).filter(Boolean).sort((p, q) => p.x - q.x);
          const tk = a.token, val = tk.kind + ':' + (tk.kind === 'size' ? tk.size + tk.animal : tk.value);
          const rank = row.indexOf(a), n = row.length;
          hop = { t0: w.time, n, rank, rankName: n === 1 ? 'only' : rank === 0 ? 'L' : rank === n - 1 ? 'R' : 'M', misses: 0, hint: false, taps: 0,
            above: Math.abs(a.x - w.rocket.x) < w.layout.islandW / 2, sameVal: lastVal === val, sameRank: lastRank === rank, val, round: w.round, hopI: e.hop };
          lastVal = val; lastRank = rank;
          break;
        }
        case 'wrong': if (hop) { hop.misses++; if (e.misses === w.cfg.hintAfterMisses) hop.m2t = w.time; } break;
        case 'hint': if (e.idle) S.hintsIdle++; else S.hintsMiss++; if (hop) hop.hint = true; break;
        case 'go': if (hop) { hop.dur = w.time - hop.t0; S.hops.push(hop); hop = null; } break;
        case 'idle':
          S.idles++; S.idleTimes.push(+(w.time).toFixed(1));
          if (++idleSaid <= 4) S.idleSpoken++;
          else if (idleSaid >= 5) { if (quiet) { S.paused = true; S.pauseAt = w.time; S.pauseWhy = 'idle'; stop = true; } else S.pausesActive++; }
          break;
        case 'boost': S.boosts++; if (e.auto) S.autoBoost++; break;
        case 'roundDone': roundsInChap++; S.rounds.push({ dur: w.time - roundT0, stars: e.stars, surprise: roundSurprise }); break;
        case 'shooting': S.shooting++; break;
        case 'shootingTap': S.shootingTap++; break;
        case 'talk': talkT0 = w.time; break;
        case 'talkAsk':
          S.talkAsks++; S.talkAskTimes.push(+(w.time - talkT0).toFixed(1));
          if (e.n <= 3) S.talkSpoken++;
          if (e.n >= 4) { if (quiet) { S.paused = true; S.pauseAt = w.time; S.pauseWhy = 'talk'; stop = true; } else S.pausesActive++; }
          break;
        case 'levelDone': S.chapters.push({ dur: w.time - chapT0, rounds: roundsInChap }); break;
      }
    }
    // a 2nd miss whose glow was swallowed by the hint cooldown (checked 0.1 s later)
    if (hop && hop.m2t != null && !hop.m2checked && w.time - hop.m2t > 0.1) { hop.m2checked = true; if (!hop.hint) { S.miss2NoHint++; hop.m2nohint = true; } }
    if (stop) break;
  }
  if (hop && !S.paused) { hop.dur = w.time - hop.t0; hop.open = true; S.hops.push(hop); }
  S.done = w.state === 'sessionDone'; S.time = w.time; S.stars = w.stars; S.snaps = w._snaps || 0;
  S.taps = d.stats ? d.stats.taps : 0; S.dstats = d.stats || null;
  return S;
}

function runSlice(pairs) {
  const out = [];
  for (const [age, model] of pairs) {
    const n = model === 'absent' || model === 'talkAbsent' ? Math.max(10, Math.round(N / 4)) : N;
    for (let k = 0; k < n; k++) out.push(runOne({ age, model, seed: 5000 + k * 31 + age * 7, lang: k % 2 ? 'vi' : 'en', vp: VPS[k % VPS.length], config, emu,
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
    const done = A.filter(s => s.done), hops = [].concat(...A.map(s => s.hops)), rounds = [].concat(...done.map(s => s.rounds));
    const chaps = [].concat(...done.map(s => s.chapters)), ses = done.map(s => s.time), hd = hops.filter(h => h.dur != null).map(h => h.dur);
    const ph = {}; let tot = 0;
    for (const s of done) for (const [p, v] of Object.entries(s.phase)) { ph[p] = (ph[p] || 0) + v; tot += v; }
    const share = f => tot ? 100 * Object.entries(ph).filter(([p]) => f(p)).reduce((a, [, v]) => a + v, 0) / tot : 0;
    const n3 = hops.filter(h => h.n === 3), rk = x => n3.length ? 100 * n3.filter(h => h.rankName === x).length / n3.length : 0;
    const st = v => rounds.length ? 100 * rounds.filter(r => r.stars === v).length / rounds.length : 0;
    rows.push({
      age: +age, model, n: A.length, done: done.length, paused: A.filter(s => s.paused).length,
      pauseAt: L.mean(A.filter(s => s.paused).map(s => s.pauseAt)), pauseWhy: [...new Set(A.filter(s => s.paused).map(s => s.pauseWhy))].join('/'),
      chap: L.mean(chaps.map(c => c.dur)), chapP90: L.pct(chaps.map(c => c.dur), 0.9), cut: chaps.length ? 100 * chaps.filter(c => c.rounds < 4).length / chaps.length : 0,
      ses: L.mean(ses), sesP90: L.pct(ses, 0.9), sesMax: ses.length ? Math.max(...ses) : 0,
      round: L.mean(rounds.map(r => r.dur)), hop: L.mean(hd), hopP90: L.pct(hd, 0.9), hopMax: hd.length ? Math.max(...hd) : 0,
      stuck: hops.filter(h => h.dur > 60).length, hopsN: hops.length,
      wrong: hops.length ? L.mean(hops.map(h => h.misses)) : 0, taps: hops.length ? A.reduce((a, s) => a + s.taps, 0) / hops.length : 0,
      hintMiss: hops.length ? A.reduce((a, s) => a + s.hintsMiss, 0) / hops.length : 0, hintIdle: hops.length ? A.reduce((a, s) => a + s.hintsIdle, 0) / hops.length : 0,
      idle: hops.length ? A.reduce((a, s) => a + s.idles, 0) / hops.length : 0, m2nohint: A.reduce((a, s) => a + s.miss2NoHint, 0),
      m2: hops.filter(h => h.misses >= 2).length,
      s3: st(3), s2: st(2), s1: st(1),
      above: hops.length ? 100 * hops.filter(h => h.above).length / hops.length : 0,
      rankL: rk('L'), rankM: rk('M'), rankR: rk('R'),
      sameRank: hops.length ? 100 * hops.filter(h => h.sameRank).length / hops.length : 0,
      sameVal: hops.length ? 100 * hops.filter(h => h.sameVal && h.hopI > 0).length / hops.length : 0,
      shAsk: share(p => p === 'round:ask'), shFlight: share(p => FLIGHT[p.split(':')[1]] && p.startsWith('round')),
      shBoost: share(p => p.startsWith('roundDone')), shOther: share(p => !p.startsWith('round')),
      shBoostReady: share(p => p === 'roundDone:boostReady'),
      autoBoost: rounds.length ? 100 * A.reduce((a, s) => a + s.autoBoost, 0) / Math.max(1, A.reduce((a, s) => a + s.boosts, 0)) : 0,
      surprise: A.reduce((a, s) => a + Object.values(s.surpriseRounds).reduce((x, y) => x + y, 0), 0) / Math.max(1, A.reduce((a, s) => a + s.chapters.length, 0)),
      shoot: A.reduce((a, s) => a + s.shooting, 0), shootTap: A.reduce((a, s) => a + s.shootingTap, 0),
      surpStars: L.mean(rounds.filter(r => r.surprise).map(r => r.stars)), plainStars: L.mean(rounds.filter(r => !r.surprise).map(r => r.stars)),
      pausesActive: A.reduce((a, s) => a + s.pausesActive, 0), snaps: A.reduce((a, s) => a + s.snaps, 0),
      dragFail: A[0].dstats && A[0].dstats.dragFail != null ? A.reduce((a, s) => a + s.dstats.dragFail, 0) / Math.max(1, hops.length) : null,
      idleSpoken: L.mean(A.map(s => s.idleSpoken)), talkSpoken: L.mean(A.map(s => s.talkSpoken)),
      idleTimes: A[0].idleTimes.slice(0, 8), talkAskTimes: A[0].talkAskTimes.slice(0, 6)
    });
  }
  rows.sort((a, b) => a.age - b.age || MODELS.indexOf(a.model) - MODELS.indexOf(b.model));
  return rows;
}

function table(rows) {
  const f = x => L.f1(x), p = x => (+x).toFixed(0);
  let md = '| age | model | done/n | chapter mean/p90 (s) | cut % | session mean/p90/max (s) | hop mean/p90/max (s) | taps/hop | wrong/hop | hint miss/idle per hop | 2nd miss w/o glow | idle/hop | ★★★/★★/★ % | ask / flight / boost / other % | auto boost % | stuck >60 s |\n';
  md += '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
  for (const r of rows) {
    md += `| ${r.age} | ${r.model} | ${r.done}/${r.n}${r.paused ? ' (' + r.paused + ' paused @' + p(r.pauseAt) + ' s ' + r.pauseWhy + ')' : ''} | ${f(r.chap)} / ${f(r.chapP90)} | ${p(r.cut)} | ${p(r.ses)} / ${p(r.sesP90)} / ${p(r.sesMax)} | ${f(r.hop)} / ${f(r.hopP90)} / ${p(r.hopMax)} | ${f(r.taps)} | ${r.wrong.toFixed(2)} | ${r.hintMiss.toFixed(2)} / ${r.hintIdle.toFixed(2)} | ${r.m2nohint}/${r.m2} | ${r.idle.toFixed(2)} | ${p(r.s3)}/${p(r.s2)}/${p(r.s1)} | ${p(r.shAsk)} / ${p(r.shFlight)} / ${p(r.shBoost)} / ${p(r.shOther)} | ${p(r.autoBoost)} | ${r.stuck} |\n`;
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
  // split age × model pairs round-robin across jobs
  const pairs = []; for (const a of AGES) for (const m of MODELS) pairs.push([a, m]);
  pairs.forEach((pm, i) => slices[i % JOBS].push(pm));
  Promise.all(slices.filter(s => s.length).map(sl => new Promise((res, rej) => {
    const c = fork(__filename, [...args, '--worker']);
    const parts = [];
    let pending = sl.length, k = 0;
    // one message per pair keeps workers simple: run sequentially in one child
    c.on('message', r => parts.push(...r));
    c.on('exit', code => (code ? rej(new Error('worker ' + code)) : res(parts)));
    c.send({ ages: [...new Set(sl.map(x => x[0]))], models: [...new Set(sl.map(x => x[1]))], pairs: sl });
    void pending; void k;
  }))).then(parts => {
    const S = [].concat(...parts);
    const rows = summarize(S.filter(s => true));
    const md = `## High-speed playtest "${TAG}" — ${S.length} sessions${Object.keys(config).length ? ' · config ' + JSON.stringify(config) : ''}${emu ? ' · emulated ' + JSON.stringify(emu) : ''}\n\n` + table(rows) + `\n_${((Date.now() - t0) / 1000).toFixed(0)} s wall_\n`;
    const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'hs_' + TAG + '.json'), JSON.stringify(rows, null, 1));
    fs.writeFileSync(path.join(out, 'hs_' + TAG + '.md'), md);
    console.log(md);
  });
}
