#!/usr/bin/env node
// Bop's Rainy Band — HIGH-SPEED headless playtest with child models (report-only; never edits game/js).
//   node tests/sim/hs_playtest.js [--n 300] [--ages 3,4,5,6,7] [--models typical,slow3,...] [--config '{…}'] [--jobs 4] [--tag name]
// Every session is simulated at full speed through the real input API (taps with pointerDown/Move/Up held over frames).
// Models (tests/sim/lib.js): typical, slow3 (slow 3-year-old), perfect, tapper (random taps anywhere), spammer (6 taps/s on
// members / drum / Bop), absent (never touches: main.js auto-pauses on the 5th idle nudge of an ask), bot<skill> (RB.Bot).
// Output: markdown tables on stdout + tests/sim/out/hs_<tag>.md (+ .json, git-ignored).
// Targets: typical age-4 chapter mean 60–100 s, session ≤ 8 min (p90), no stuck round (> 120 s) / ask (> 60 s) for an
// engaged model, no stuck state for any model, no NaN, every 2nd miss on an ask hinted.
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const L = require('./lib');

const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 300), config = JSON.parse(get('config', '{}'));
const ALL = 'typical,slow3,perfect,tapper,spammer,bot0.8,absent';
const MODELS = get('models', ALL).split(','), AGES = get('ages', '3,4,5,6,7').split(',').map(Number);
const TAG = get('tag', 'base'), JOBS = +get('jobs', 4);
const VPS = Object.keys(L.VIEWPORTS);

function finiteWorld(w) {
  for (const m of w.members) if (!isFinite(m.x) || !isFinite(m.y) || !isFinite(m.rot) || !isFinite(m.sx) || !isFinite(m.sy)) return false;
  for (const F of w.flyNotes) if (!isFinite(F.x) || !isFinite(F.y)) return false;
  return isFinite(w.bigDrum.sy) && isFinite(w.stars);
}

function runOne(o) {
  const w = L.mkWorld(o);
  const d = L.makeModel(o.model, w, o.age, o.seed + 1);
  const quiet = o.model === 'absent';
  const S = { model: o.model, age: o.age, done: false, paused: false, pauseAt: null, nan: false, time: 0, stuckState: false,
    asks: [], rounds: [], chapters: [], idles: 0, talkAsks: 0, talks: 0, talkRight: 0, hintsMiss: 0, hintsIdle: 0, hintsSoft: 0,
    miss2NoHint: 0, taps: 0, wrong: 0, locked: 0, booms: 0, pokes: 0, replays: 0, snails: 0, snailTaps: 0, showers: 0, raindrops: 0,
    maxQ: 0, maxWob: 0, topics: null, byTopic: {} };
  w.newSession();
  const dt = 1 / 30, cap = o.cap || 1500;
  let ask = null, roundT0 = 0, chapT0 = 0, roundsInChap = 0, idleOfAsk = 0, t = 0, lastChange = 0, sig = '';
  while (w.state !== 'sessionDone' && t < cap) {
    d.step(dt); w.update(dt); t += dt;
    if (!finiteWorld(w)) { S.nan = true; break; }
    for (const m of w.members) { S.maxQ = Math.max(S.maxQ, Math.abs(m.q)); S.maxWob = Math.max(S.maxWob, Math.abs(m.wob)); }
    // a "stuck state": nothing changes (state / phase / ask) for 200 s while the model is not absent
    const s2 = w.state + ':' + w.phase + ':' + w.level + ':' + w.round + ':' + w.ask;
    if (s2 !== sig) { sig = s2; lastChange = t; } else if (!quiet && t - lastChange > 200) { S.stuckState = s2; break; }
    let stop = false;
    for (const e of w.drainEvents()) {
      if (d.onEvent) d.onEvent(e);
      switch (e.type) {
        case 'session': S.topics = e.levels; break;
        case 'level': chapT0 = w.time; roundsInChap = 0; break;
        case 'round': roundT0 = w.time; break;
        case 'ask': idleOfAsk = 0; ask = { t0: w.time, mode: e.mode, wrong: 0, hint: false, topic: w.topic, n: e.n }; break;
        case 'beatsDone': if (ask) ask.t0 = w.time; break;   // the answer time of a listen ask starts after the beats
        case 'wrong': S.wrong++; if (ask) { ask.wrong++; if (e.misses === w.cfg.hintAfterMisses) ask.m2t = w.time; } break;
        case 'locked': S.locked++; break;
        case 'boom': S.booms++; break;
        case 'pokeBop': S.pokes++; if (e.replay) S.replays++; break;
        case 'hint': if (e.idle) S.hintsIdle++; else if (ask && ask.wrong >= 2) S.hintsMiss++; else S.hintsSoft++; if (ask) ask.hint = true; break;
        case 'play': case 'drumDone': if (ask) { ask.dur = w.time - ask.t0; S.asks.push(ask); ask = null; } break;
        case 'snail': S.snails++; break;
        case 'snailTap': S.snailTaps++; break;
        case 'shower': S.showers++; break;
        case 'raindrop': S.raindrops++; break;
        case 'idle':
          S.idles++;
          if (++idleOfAsk >= 5 && quiet) { S.paused = true; S.pauseAt = w.time; stop = true; }
          break;
        case 'roundDone': {
          roundsInChap++;
          const rd = { dur: w.time - roundT0, stars: e.stars, topic: w.topic, misses: e.misses };
          S.rounds.push(rd);
          (S.byTopic[w.topic] = S.byTopic[w.topic] || []).push(rd.dur);
          break;
        }
        case 'talkAsk': S.talkAsks++; if (e.n >= 4 && quiet) { S.paused = true; S.pauseAt = w.time; stop = true; } break;
        case 'talkResult': S.talks++; if (e.correct) S.talkRight++; break;
        case 'levelDone': S.chapters.push({ dur: w.time - chapT0, rounds: roundsInChap, topic: w.topic }); break;
      }
    }
    if (ask && ask.m2t != null && !ask.m2checked && w.time - ask.m2t > 0.1) { ask.m2checked = true; if (!ask.hint) S.miss2NoHint++; }
    if (stop) break;
  }
  if (ask && !S.paused) { ask.dur = w.time - ask.t0; ask.open = true; S.asks.push(ask); }
  S.done = w.state === 'sessionDone'; S.time = w.time; S.stars = w.stars;
  if (d.stats) S.taps = d.stats.taps || 0;
  return S;
}

function runSlice(pairs) {
  const out = [];
  for (const [age, model] of pairs) {
    const n = model === 'absent' ? Math.max(8, Math.round(N / 10)) : N;
    for (let k = 0; k < n; k++) {
      out.push(runOne({ age, model, seed: 5000 + k * 31 + age * 7, lang: k % 2 ? 'vi' : 'en', vp: VPS[k % VPS.length], config,
        cap: model === 'absent' ? 900 : 1500 }));
    }
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
    const st = v => rounds.length ? 100 * rounds.filter(r => r.stars === v).length / rounds.length : 0;
    const per = f => asks.length ? A.reduce((a, s) => a + f(s), 0) / asks.length : 0;
    const topicCh = {};
    for (const c of chaps) (topicCh[c.topic] = topicCh[c.topic] || []).push(c.dur);
    rows.push({
      age: +age, model, n: A.length, done: done.length, paused: A.filter(s => s.paused).length, nan: A.filter(s => s.nan).length,
      stuckStates: A.filter(s => s.stuckState).length, stuckWhere: [...new Set(A.filter(s => s.stuckState).map(s => s.stuckState))].slice(0, 3).join(' '),
      pauseAt: L.mean(A.filter(s => s.paused).map(s => s.pauseAt)),
      chap: L.mean(chaps.map(c => c.dur)), chapP10: L.pct(chaps.map(c => c.dur), 0.1), chapP90: L.pct(chaps.map(c => c.dur), 0.9),
      cut: chaps.length ? 100 * chaps.filter(c => c.rounds < 4).length / chaps.length : 0,
      ses: L.mean(ses), sesP90: L.pct(ses, 0.9), sesMax: ses.length ? Math.max(...ses) : 0,
      round: L.mean(rd), roundP90: L.pct(rd, 0.9), roundMax: rd.length ? Math.max(...rd) : 0,
      ask: L.mean(ad), askP90: L.pct(ad, 0.9), askMax: ad.length ? Math.max(...ad) : 0,
      stuckAsks: asks.filter(h => h.dur > 60).length, stuckRounds: rounds.filter(r => r.dur > 120).length,
      wrong: asks.length ? L.mean(asks.map(h => h.wrong)) : 0, locked: per(s => s.locked), booms: per(s => s.booms),
      hintMiss: per(s => s.hintsMiss), hintIdle: per(s => s.hintsIdle), hintSoft: per(s => s.hintsSoft),
      hinted: asks.length ? 100 * asks.filter(h => h.hint).length / asks.length : 0,
      idle: per(s => s.idles), m2nohint: A.reduce((a, s) => a + s.miss2NoHint, 0), m2: asks.filter(h => h.wrong >= 2).length,
      s3: st(3), s2: st(2), s1: st(1),
      talkRight: A.reduce((a, s) => a + s.talks, 0) ? 100 * A.reduce((a, s) => a + s.talkRight, 0) / A.reduce((a, s) => a + s.talks, 0) : 0,
      snails: A.reduce((a, s) => a + s.snails, 0), snailTaps: A.reduce((a, s) => a + s.snailTaps, 0), showers: A.reduce((a, s) => a + s.showers, 0),
      raindrops: A.reduce((a, s) => a + s.raindrops, 0), replays: A.reduce((a, s) => a + s.replays, 0),
      maxQ: Math.max(...A.map(s => s.maxQ)), maxWob: Math.max(...A.map(s => s.maxWob)),
      topicChap: Object.fromEntries(Object.entries(topicCh).map(([t, v]) => [t, L.mean(v)]))
    });
  }
  rows.sort((a, b) => a.age - b.age || MODELS.indexOf(a.model) - MODELS.indexOf(b.model));
  return rows;
}

function tables(rows) {
  const f = x => L.f1(x), p = x => (+x).toFixed(0), q = x => (+x).toFixed(2);
  let md = '### Time\n\n| age | model | done/n | chapter mean (p10–p90) s | cut % | session mean / p90 / max s | song (round) mean / p90 / max s | ask mean / p90 / max s | stuck ask > 60 s / round > 120 s / state |\n';
  md += '|---|---|---|---|---|---|---|---|---|\n';
  for (const r of rows) {
    md += `| ${r.age} | ${r.model} | ${r.done}/${r.n}${r.paused ? ' (' + r.paused + ' paused @' + p(r.pauseAt) + ' s)' : ''}${r.nan ? ' **NaN ' + r.nan + '**' : ''} | ${f(r.chap)} (${f(r.chapP10)}–${f(r.chapP90)}) | ${p(r.cut)} | ${p(r.ses)} / ${p(r.sesP90)} / ${p(r.sesMax)} | ${f(r.round)} / ${f(r.roundP90)} / ${p(r.roundMax)} | ${f(r.ask)} / ${f(r.askP90)} / ${p(r.askMax)} | ${r.stuckAsks} / ${r.stuckRounds} / ${r.stuckStates}${r.stuckWhere ? ' ' + r.stuckWhere : ''} |\n`;
  }
  md += '\n### Help, mistakes, stars\n\n| age | model | wrong/ask | locked/ask | booms/ask | hints per ask: 2-miss / idle / band-drum | asks hinted % | idle/ask | 2nd miss w/o hint | ★★★/★★/★ % | talk right % | snail (tapped) / showers (raindrops) | Bop replays | max squash q / wobble rad |\n';
  md += '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
  for (const r of rows) {
    md += `| ${r.age} | ${r.model} | ${q(r.wrong)} | ${q(r.locked)} | ${q(r.booms)} | ${q(r.hintMiss)} / ${q(r.hintIdle)} / ${q(r.hintSoft)} | ${p(r.hinted)} | ${q(r.idle)} | ${r.m2nohint}/${r.m2} | ${p(r.s3)}/${p(r.s2)}/${p(r.s1)} | ${p(r.talkRight)} | ${r.snails} (${r.snailTaps}) / ${r.showers} (${r.raindrops}) | ${r.replays} | ${r.maxQ.toFixed(3)} / ${r.maxWob.toFixed(3)} |\n`;
  }
  md += '\n### Chapter mean by topic (s)\n\n| age | model | ' + 'topics |\n|---|---|---|\n';
  for (const r of rows) if (r.model === 'typical' || r.model === 'slow3') md += `| ${r.age} | ${r.model} | ${Object.entries(r.topicChap).map(([t, v]) => t + ' ' + L.f1(v)).join(' · ')} |\n`;
  return md;
}

function verdict(rows) {
  const out = [];
  for (const r of rows.filter(r => r.model === 'typical')) out.push(`- typical age ${r.age}: chapter mean ${L.f1(r.chap)} s ${r.age === 4 ? (r.chap >= 60 && r.chap <= 100 ? '✓ (60–100)' : '✗ (target 60–100)') : ''}, session p90 ${L.f1(r.sesP90)} s ${r.sesP90 <= 480 ? '✓ (≤ 480)' : '✗ (> 8 min)'}`);
  const ENG = ['typical', 'slow3', 'perfect', 'bot0.8'];
  const stuck = rows.filter(r => ENG.includes(r.model) && (r.stuckAsks || r.stuckRounds));
  out.push(stuck.length ? '- long asks / rounds (engaged models): ' + stuck.map(r => `${r.age}/${r.model} ${r.stuckAsks} asks > 60 s, ${r.stuckRounds} rounds > 120 s`).join('; ') : '- engaged models: no ask > 60 s, no round > 120 s ✓');
  const ss = rows.filter(r => r.stuckStates); out.push(ss.length ? '- **stuck states**: ' + ss.map(r => `${r.age}/${r.model} ${r.stuckStates} (${r.stuckWhere})`).join('; ') : '- no stuck state in any model ✓');
  const notDone = rows.filter(r => r.model !== 'absent' && r.done < r.n);
  out.push(notDone.length ? '- unfinished sessions (1 500 s cap): ' + notDone.map(r => `${r.age}/${r.model} ${r.n - r.done}`).join('; ') : '- every active session reached sessionDone ✓');
  const rnd = rows.filter(r => r.model === 'tapper' || r.model === 'spammer');
  if (rnd.length) out.push('- random input (never aims): ' + rnd.map(r => `${r.age}/${r.model} ${L.f1(r.ses)} s`).join('; '));
  const ab = rows.filter(r => r.model === 'absent'); if (ab.length) out.push('- absent child → auto-pause at ≈ ' + L.f1(L.mean(ab.map(r => r.pauseAt))) + ' s (5th idle nudge of the first ask)');
  const nan = rows.filter(r => r.nan); out.push(nan.length ? '- **NaN** in ' + nan.map(r => r.age + '/' + r.model).join(', ') : '- no NaN ✓');
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
    const md = `## High-speed playtest "${TAG}" — ${S.length} sessions (${N} per age × model; absent ${Math.max(8, Math.round(N / 10))})` +
      `${Object.keys(config).length ? ' · config ' + JSON.stringify(config) : ''}\n\n` + verdict(rows) + '\n\n' + tables(rows) +
      `\n_${((Date.now() - t0) / 1000).toFixed(0)} s wall · generated by tests/sim/hs_playtest.js_\n`;
    const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'hs_' + TAG + '.json'), JSON.stringify(rows, null, 1));
    fs.writeFileSync(path.join(out, 'hs_' + TAG + '.md'), md);
    console.log(md);
  });
}
