#!/usr/bin/env node
// Lulu's Jungle Tower — HIGH-SPEED headless playtest with child models (report-only; never edits game/js).
//   node tests/sim/hs_playtest.js [--n 60] [--ages 3,4,5,6,7] [--models typical,slow3,...] [--config '{…}'] [--jobs 4] [--tag name] [--fast]
// Every session is simulated at full speed through the real input API (drags with pointerDown/Move/Up).
// Models: see tests/sim/hs_models.js. Also emulates main.js voice/auto-pause: idle lines spoken for the first 4 idles of an
// ask, auto-pause on the 5th; Talk re-asks spoken n ≤ 3, auto-pause at n = 4. absent / talkAbsent sessions end at that pause.
// Output: markdown tables on stdout + tests/sim/out/hs_<tag>.md (+ .json, git-ignored).
// Targets: typical 3–4-year-old chapter mean 60–100 s, session ≤ 8 min, no stuck ask (> 60 s) for any active model, no NaN.
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const L = require('./lib');
const M = require('./hs_models');
const JT = L.JT;

const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 60), config = JSON.parse(get('config', '{}'));
if (args.includes('--fast')) config.step = 1 / 60;
const ALL = 'bot0.5,bot0.8,bot1,typical,thoughtful,slow3,dropHigh,dropLow,sloppy,spammer,swiper,tapper,confused,talkAbsent,absent';
const MODELS = get('models', ALL).split(','), AGES = get('ages', '3,4,5,6,7').split(',').map(Number);
const TAG = get('tag', 'base'), JOBS = +get('jobs', 4);
const VPS = Object.keys(L.VIEWPORTS);
const SHOW = { deal: 1, drop: 1, bounce: 1, done: 1 };   // watching time inside a round (no grab possible)

function runOne(o) {
  const vp = L.VIEWPORTS[o.vp];
  const w = new JT.World({ seed: o.seed, age: o.age, lang: o.lang, config: o.config || {} });
  w.setViewport(vp.W, vp.H, vp.ins);
  const d = M.makeModel(o.model, w, o.age, o.seed + 1);
  const quiet = o.model === 'absent' || o.model === 'talkAbsent';
  const S = { model: o.model, age: o.age, done: false, paused: false, pauseAt: null, pauseWhy: null, nan: false, time: 0,
    phase: {}, asks: [], rounds: [], chapters: [], idles: 0, idleSpoken: 0, talkAsks: 0, talkRight: 0, talks: 0,
    hintsMiss: 0, hintsIdle: 0, hintsLulu: 0, miss2NoHint: 0, grass: 0, drops: 0, assists: 0, taps: 0, locked: 0, pokes: 0,
    gusts: 0, butterflies: 0, butterflyTaps: 0, maxTheta: 0, pausesActive: 0, landOff: [] };
  w.newSession();
  const dt = 1 / 30, cap = o.cap || 1500;
  let ask = null, roundT0 = 0, chapT0 = 0, roundsInChap = 0, idleSaid = 0, roundSurprise = null, t = 0;
  while (w.state !== 'sessionDone' && t < cap) {
    d.step(dt); w.update(dt); t += dt;
    const key = w.state === 'round' ? 'round:' + w.phase : w.state;
    S.phase[key] = (S.phase[key] || 0) + dt;
    if (w.pieces.some(p => !isFinite(p.x) || !isFinite(p.y)) || !isFinite(w.tower.theta)) { S.nan = true; break; }
    S.maxTheta = Math.max(S.maxTheta, Math.abs(w.tower.theta));
    let stop = false;
    for (const e of w.drainEvents()) {
      switch (e.type) {
        case 'level': chapT0 = w.time; roundsInChap = 0; break;
        case 'round': roundT0 = w.time; idleSaid = 0; roundSurprise = e.surprise; break;
        case 'ask': {
          idleSaid = 0;
          const ps = w.pieces.filter(p => p.askIdx === w.ask).sort((p, q) => p.x - q.x || p.y - q.y), a = w.pieceById(e.answerId);
          ask = { t0: w.time, k: ps.length, slot: ps.indexOf(a), wrong: 0, grass: 0, hint: false, round: w.round, i: e.ask };
          break;
        }
        case 'wrong': if (ask) { ask.wrong++; if (e.misses === w.cfg.hintAfterMisses) ask.m2t = w.time; } break;
        case 'miss': S.grass++; if (ask) ask.grass++; break;
        case 'drop': S.drops++; if (e.assisted) S.assists++; break;
        case 'tapPiece': S.taps++; break;
        case 'locked': S.locked++; break;
        case 'pokeLulu': S.pokes++; break;
        case 'hint': if (e.idle) S.hintsIdle++; else if (ask && ask.wrong >= 2) S.hintsMiss++; else S.hintsLulu++; if (ask) ask.hint = true; break;
        case 'land': { const top = w.tower.blocks[e.n - 1], below = w.tower.blocks[e.n - 2]; if (top) S.landOff.push(Math.abs(top.dx - (below ? below.dx : 0)) / w.layout.S); break; }
        case 'stack': if (ask) { ask.dur = w.time - ask.t0; S.asks.push(ask); ask = null; } break;
        case 'gust': S.gusts++; break;
        case 'butterfly': S.butterflies++; break;
        case 'butterflyTap': S.butterflyTaps++; break;
        case 'idle':
          S.idles++;
          if (++idleSaid <= 4) S.idleSpoken++;
          else if (idleSaid >= 5) { if (quiet) { S.paused = true; S.pauseAt = w.time; S.pauseWhy = 'idle'; stop = true; } else S.pausesActive++; }
          break;
        case 'roundDone': roundsInChap++; S.rounds.push({ dur: w.time - roundT0, stars: e.stars, surprise: roundSurprise }); break;
        case 'talkAsk':
          S.talkAsks++;
          if (e.n >= 4) { if (quiet) { S.paused = true; S.pauseAt = w.time; S.pauseWhy = 'talk'; stop = true; } else S.pausesActive++; }
          break;
        case 'talkResult': S.talks++; if (e.correct) S.talkRight++; break;
        case 'levelDone': S.chapters.push({ dur: w.time - chapT0, rounds: roundsInChap }); break;
      }
    }
    if (ask && ask.m2t != null && !ask.m2checked && w.time - ask.m2t > 0.1) { ask.m2checked = true; if (!ask.hint) S.miss2NoHint++; }
    if (stop) break;
  }
  if (ask && !S.paused) { ask.dur = w.time - ask.t0; ask.open = true; S.asks.push(ask); }
  S.done = w.state === 'sessionDone'; S.time = w.time; S.stars = w.stars;
  S.landOffMax = S.landOff.length ? Math.max(...S.landOff) : 0; delete S.landOff;
  return S;
}

function runSlice(pairs) {
  const out = [];
  for (const [age, model] of pairs) {
    const n = model === 'absent' || model === 'talkAbsent' ? Math.max(8, Math.round(N / 4)) : N;
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
    const rd = rounds.map(r => r.dur);
    const ph = {}; let tot = 0;
    for (const s of done) for (const [p, v] of Object.entries(s.phase)) { ph[p] = (ph[p] || 0) + v; tot += v; }
    const share = f => tot ? 100 * Object.entries(ph).filter(([p]) => f(p)).reduce((a, [, v]) => a + v, 0) / tot : 0;
    const st = v => rounds.length ? 100 * rounds.filter(r => r.stars === v).length / rounds.length : 0;
    const k3 = asks.filter(h => h.k === 3), slot = i => k3.length ? 100 * k3.filter(h => h.slot === i).length / k3.length : 0;
    const per = f => asks.length ? A.reduce((a, s) => a + f(s), 0) / asks.length : 0;
    rows.push({
      age: +age, model, n: A.length, done: done.length, paused: A.filter(s => s.paused).length, nan: A.filter(s => s.nan).length,
      pauseAt: L.mean(A.filter(s => s.paused).map(s => s.pauseAt)), pauseWhy: [...new Set(A.filter(s => s.paused).map(s => s.pauseWhy))].join('/'),
      chap: L.mean(chaps.map(c => c.dur)), chapP90: L.pct(chaps.map(c => c.dur), 0.9), cut: chaps.length ? 100 * chaps.filter(c => c.rounds < 4).length / chaps.length : 0,
      ses: L.mean(ses), sesP90: L.pct(ses, 0.9), sesMax: ses.length ? Math.max(...ses) : 0,
      round: L.mean(rd), roundP90: L.pct(rd, 0.9), roundMax: rd.length ? Math.max(...rd) : 0,
      ask: L.mean(ad), askP90: L.pct(ad, 0.9), askMax: ad.length ? Math.max(...ad) : 0,
      stuck: asks.filter(h => h.dur > 60).length, stuckRounds: rounds.filter(r => r.dur > 120).length, asksN: asks.length,
      wrong: asks.length ? L.mean(asks.map(h => h.wrong)) : 0, grass: per(s => s.grass), drops: per(s => s.drops), assists: per(s => s.assists), taps: per(s => s.taps),
      locked: per(s => s.locked), hintMiss: per(s => s.hintsMiss), hintIdle: per(s => s.hintsIdle), hintLulu: per(s => s.hintsLulu),
      idle: per(s => s.idles), m2nohint: A.reduce((a, s) => a + s.miss2NoHint, 0), m2: asks.filter(h => h.wrong >= 2).length,
      s3: st(3), s2: st(2), s1: st(1), slot0: slot(0), slot1: slot(1), slot2: slot(2),
      shAsk: share(p => p === 'round:ask'), shShow: share(p => p.startsWith('round:') && SHOW[p.split(':')[1]]), shClear: share(p => p === 'roundDone'),
      shOther: share(p => !p.startsWith('round')),
      gusts: A.reduce((a, s) => a + s.gusts, 0), bf: A.reduce((a, s) => a + s.butterflies, 0), bfTap: A.reduce((a, s) => a + s.butterflyTaps, 0),
      maxTheta: Math.max(...A.map(s => s.maxTheta)), landOff: Math.max(...A.map(s => s.landOffMax)),
      talkRight: A.reduce((a, s) => a + s.talks, 0) ? 100 * A.reduce((a, s) => a + s.talkRight, 0) / A.reduce((a, s) => a + s.talks, 0) : 0,
      pausesActive: A.reduce((a, s) => a + s.pausesActive, 0), idleSpoken: L.mean(A.map(s => s.idleSpoken))
    });
  }
  rows.sort((a, b) => a.age - b.age || MODELS.indexOf(a.model) - MODELS.indexOf(b.model));
  return rows;
}

function tables(rows) {
  const f = x => L.f1(x), p = x => (+x).toFixed(0), q = x => (+x).toFixed(2);
  let md = '### Time\n\n| age | model | done/n | chapter mean/p90 (s) | cut % | session mean/p90/max (s) | tower mean/p90/max (s) | ask mean/p90/max (s) | stuck ask >60 s / tower >120 s | ask / watch / clear / other % |\n';
  md += '|---|---|---|---|---|---|---|---|---|---|\n';
  for (const r of rows) {
    md += `| ${r.age} | ${r.model} | ${r.done}/${r.n}${r.paused ? ' (' + r.paused + ' paused @' + p(r.pauseAt) + ' s ' + r.pauseWhy + ')' : ''}${r.nan ? ' **NaN ' + r.nan + '**' : ''} | ${f(r.chap)} / ${f(r.chapP90)} | ${p(r.cut)} | ${p(r.ses)} / ${p(r.sesP90)} / ${p(r.sesMax)} | ${f(r.round)} / ${f(r.roundP90)} / ${p(r.roundMax)} | ${f(r.ask)} / ${f(r.askP90)} / ${p(r.askMax)} | ${r.stuck} / ${r.stuckRounds} | ${p(r.shAsk)} / ${p(r.shShow)} / ${p(r.shClear)} / ${p(r.shOther)} |\n`;
  }
  md += '\n### Help, mistakes, stars\n\n| age | model | drops/ask | assisted/ask | wrong/ask | grass/ask | taps/ask | locked/ask | hint 2-miss / idle / Lulu per ask | 2nd miss w/o hint | idle/ask | ★★★/★★/★ % | talk right % | answer slot L/M/R % (3 choices) | gusts / butterflies (tapped) | max θ (rad) | max land offset (·S) |\n';
  md += '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
  for (const r of rows) {
    md += `| ${r.age} | ${r.model} | ${q(r.drops)} | ${q(r.assists)} | ${q(r.wrong)} | ${q(r.grass)} | ${q(r.taps)} | ${q(r.locked)} | ${q(r.hintMiss)} / ${q(r.hintIdle)} / ${q(r.hintLulu)} | ${r.m2nohint}/${r.m2} | ${q(r.idle)} | ${p(r.s3)}/${p(r.s2)}/${p(r.s1)} | ${p(r.talkRight)} | ${p(r.slot0)}/${p(r.slot1)}/${p(r.slot2)} | ${r.gusts} / ${r.bf} (${r.bfTap}) | ${r.maxTheta.toFixed(3)} | ${r.landOff.toFixed(3)} |\n`;
  }
  return md;
}

function verdict(rows) {
  const out = [], typ = rows.filter(r => r.model === 'typical' && r.age <= 4);
  for (const r of typ) out.push(`- typical age ${r.age}: chapter mean ${L.f1(r.chap)} s ${r.chap >= 60 && r.chap <= 100 ? '✓ (60–100)' : '✗ (target 60–100)'}, session p90 ${L.f1(r.sesP90)} s ${r.sesP90 <= 480 ? '✓ (≤ 480)' : '✗ (> 8 min)'}`);
  const RANDOM = ['tapper', 'swiper', 'confused', 'spammer'], quiet = m => m === 'absent' || m === 'talkAbsent';
  const stuck = rows.filter(r => !quiet(r.model) && !RANDOM.includes(r.model) && (r.stuck || r.stuckRounds));
  out.push(stuck.length ? '- long asks / towers (engaged models): ' + stuck.map(r => `${r.age}/${r.model} ${r.stuck} asks > 60 s, ${r.stuckRounds} towers > 120 s`).join('; ') : '- engaged models: no ask > 60 s, no tower > 120 s ✓');
  const rnd = rows.filter(r => RANDOM.includes(r.model));
  if (rnd.length) out.push('- random-input models (never aim): ' + rnd.map(r => `${r.age}/${r.model} ${r.done}/${r.n} done, ${L.f1(r.ses)} s, ask p90 ${L.f1(r.askP90)} s`).join('; '));
  const notDone = rows.filter(r => !quiet(r.model) && r.done < r.n);
  out.push(notDone.length ? '- unfinished sessions (1 500 s cap): ' + notDone.map(r => `${r.age}/${r.model} ${r.n - r.done}`).join('; ') : '- every active session reached sessionDone ✓');
  const ab = rows.filter(r => quiet(r.model)); if (ab.length) out.push('- absent child → auto-pause at ≈ ' + L.f1(L.mean(ab.filter(r => r.model === 'absent').map(r => r.pauseAt))) + ' s (5th idle); Talk ignored → pause at ≈ ' + L.f1(L.mean(ab.filter(r => r.model === 'talkAbsent').map(r => r.pauseAt))) + ' s');
  const nan = rows.filter(r => r.nan); out.push(nan.length ? '- **NaN** in ' + nan.map(r => r.age + '/' + r.model).join(', ') : '- no NaN ✓');
  const th = Math.max(...rows.map(r => r.maxTheta)); out.push(`- tower sway never above ${th.toFixed(3)} rad (cap 0.12) ${th <= 0.12 + 1e-9 ? '✓' : '✗'}; landing offset ≤ ${Math.max(...rows.map(r => r.landOff)).toFixed(3)}·S (≤ 0.18)`);
  const m2 = rows.reduce((a, r) => a + r.m2nohint, 0); out.push(m2 ? `- ${m2} 2nd misses without a hint ✗` : '- every 2nd miss on an ask hinted ✓');
  return out.join('\n');
}

module.exports = { runOne, summarize, tables, verdict };
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
    const md = `## High-speed playtest "${TAG}" — ${S.length} sessions (${N} per age × model; absent/talkAbsent ${Math.max(8, Math.round(N / 4))})` +
      `${Object.keys(config).length ? ' · config ' + JSON.stringify(config) : ''}\n\n` + verdict(rows) + '\n\n' + tables(rows) +
      `\n_${((Date.now() - t0) / 1000).toFixed(0)} s wall · generated by tests/sim/hs_playtest.js_\n`;
    const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'hs_' + TAG + '.json'), JSON.stringify(rows, null, 1));
    fs.writeFileSync(path.join(out, 'hs_' + TAG + '.md'), md);
    console.log(md);
  });
}
