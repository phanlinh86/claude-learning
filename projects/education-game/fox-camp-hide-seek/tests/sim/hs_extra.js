#!/usr/bin/env node
// Pip's Camp Hide & Seek — extra playtest metrics the main sims do not report (report-only; never edits game/js):
//   watching moments (round start → 1st ask, party + leave, longest stretch without a possible tap), idle-nudge timing,
//   hint reach for children who never miss (repeat taps on an empty place / Pip), Talk outcomes, repeats (identical rounds,
//   identical consecutive prompts, prompt reuse inside a chapter, topic reuse between two sessions in a row), answer slot
//   bias by place count, stars per round for guessers vs thinkers.
//   node tests/sim/hs_extra.js [--n 60] [--ages 3,4,5,6,7] [--models …] [--config '{…}'] [--tag x] [--jobs 2]
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const L = require('./lib');
const M = require('./hs_models');
const FC = L.FC;
const PATCH = require('./patches').apply(FC, (process.argv.includes('--patch') ? process.argv[process.argv.indexOf('--patch') + 1] : ''));

const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 60), config = JSON.parse(get('config', '{}')), CAP = +get('cap', 1500), TAG = get('tag', 'extra'), JOBS = +get('jobs', 2);
if (args.includes('--fast')) config.step = 1 / 60;
const MODELS = get('models', 'typical,thoughtful,bot0,bot0.5,bot0.8,bot0.95,slow3,tapper,spammer,repeater,repeaterSoft,pipGrass,confused').split(',');
const AGES = get('ages', '3,4,5,6,7').split(',').map(Number);
const VPS = Object.keys(L.VIEWPORTS);
const mean = L.mean, pct = L.pct;

function runOne(o) {
  const vp = L.VIEWPORTS[o.vp];
  const w = new FC.World({ seed: o.seed, age: o.age, lang: o.lang, config: o.config || {} });
  w.setViewport(vp.W, vp.H, vp.ins);
  const d = M.makeModel(o.model, w, o.age, o.seed + 1);
  const S = { preAsk: [], afterRound: [], watchMax: 0, idleAt: [[], [], [], [], []], idleHints: 0, asks: 0, longAsks: 0, noHintLong: 0,
    autoPause: 0, talk: [], sameRound: 0, rounds: 0, sameConsec: 0, promptReuse: 0, promptN: 0, topicsA: null, topicsB: null,
    slot: {}, rowBack: 0, roundStars: [], roundDur: [], sessions: [], firstAskWait: [], askDur: [] };
  const dt = 1 / 30;
  for (let sess = 0; sess < 2; sess++) {
    w.newSession();
    let t = 0, roundT0 = 0, rdT = -1, askT0 = -1, watchT0 = 0, idleN = 0, askHint = false, lastPrompt = null, chapPrompts = new Set(), sigs = new Set(), talkT0 = 0, talkAsks = 0;
    const tStart = w.time;
    while (w.state !== 'sessionDone' && t < (/^repeater/.test(o.model) ? Math.min(CAP, 600) : CAP)) {
      d.step(dt); w.update(dt); t += dt;
      const canTap = w.state === 'round' && w.phase === 'ask';
      if (canTap || w.state === 'talk') watchT0 = w.time; else if (w.state === 'round' || w.state === 'roundDone') S.watchMax = Math.max(S.watchMax, w.time - watchT0);
      for (const e of w.drainEvents()) {
        switch (e.type) {
          case 'session': if (sess === 0) S.topicsA = e.levels; else S.topicsB = e.levels; break;
          case 'level': chapPrompts = new Set(); watchT0 = w.time; break;
          case 'round': {
            if (rdT >= 0) S.afterRound.push(w.time - rdT); rdT = -1;
            roundT0 = w.time; watchT0 = w.time; S.rounds++;
            const sig = w.topic + '|' + w.cur.places.map(p => p.friend + ':' + JSON.stringify(p.clue.value !== undefined ? p.clue.value : p.clue.nameValue)).sort().join(',');
            if (sigs.has(sig)) S.sameRound++; sigs.add(sig);
            break;
          }
          case 'ask': {
            if (e.ask === 0) S.preAsk.push(w.time - roundT0);
            askT0 = w.time; idleN = 0; askHint = false; S.asks++;
            const pk = e.promptKey + JSON.stringify(e.params || {});
            if (pk === lastPrompt && e.promptKey !== 'p.countUp') S.sameConsec++; lastPrompt = pk;
            S.promptN++; if (chapPrompts.has(pk)) S.promptReuse++; chapPrompts.add(pk);
            const ps = w.places.filter(p => !p.leaving).sort((p, q) => p.x - q.x), a = w.placeById(e.answerId), n = ps.length;
            const k = n + ':' + ps.indexOf(a); S.slot[k] = (S.slot[k] || 0) + 1;
            if (a.row === 0 && n > 1 && w.geo && w.geo.split && w.geo.split[0] > 0) S.rowBack++;
            break;
          }
          case 'idle':
            idleN++;
            if (idleN <= 5) S.idleAt[idleN - 1].push(w.time - askT0);
            if (idleN === 5) S.autoPause++;
            break;
          case 'hint': askHint = true; if (e.idle) S.idleHints++; break;
          case 'found': {
            const dd = w.time - askT0; S.askDur.push(dd);
            if (dd > 60) { S.longAsks++; if (!askHint) S.noHintLong++; }
            askT0 = -1; break;
          }
          case 'roundDone': rdT = w.time; S.roundStars.push(e.stars); S.roundDur.push(w.time - roundT0); break;
          case 'talk': talkT0 = w.time; talkAsks = 0; if (rdT >= 0) { S.afterRound.push(w.time - rdT); rdT = -1; } break;
          case 'talkAsk': talkAsks = e.n; break;
          case 'talkResult': S.talk.push({ ok: e.correct, t: w.time - talkT0, asks: talkAsks, glow: !!(w.talk && w.talk.glowAnswer) }); break;
        }
      }
      // an ask that drags on with no hint at all (e.g. taps on an empty place / Pip reset the idle clock)
    }
    if (askT0 >= 0 && w.time - askT0 > 60 && !askHint) { S.longAsks++; S.noHintLong++; }
    S.sessions.push({ done: w.state === 'sessionDone', time: w.time - tStart });
  }
  return S;
}

function runSlice(pairs) {
  const out = [];
  for (const [age, model] of pairs) for (let k = 0; k < N; k++)
    out.push(Object.assign(runOne({ age, model, seed: 9000 + k * 37 + age * 11, lang: k % 2 ? 'vi' : 'en', vp: VPS[k % VPS.length], config }), { age, model }));
  return out;
}

function summarize(S) {
  const by = {};
  for (const s of S) (by[s.age + '|' + s.model] = by[s.age + '|' + s.model] || []).push(s);
  const rows = [];
  for (const key of Object.keys(by)) {
    const A = by[key], [age, model] = key.split('|'), cat = f => [].concat(...A.map(f)), sum = f => A.reduce((a, s) => a + f(s), 0);
    const talk = cat(s => s.talk), rs = cat(s => s.roundStars), ses = cat(s => s.sessions);
    const slot = {}; for (const s of A) for (const [k, v] of Object.entries(s.slot)) slot[k] = (slot[k] || 0) + v;
    const sl = n => { const a = []; for (let i = 0; i < n; i++) a.push(slot[n + ':' + i] || 0); const t = a.reduce((x, y) => x + y, 0); return t ? a.map(x => (100 * x / t).toFixed(0)).join('/') : '–'; };
    const topicSame = A.filter(s => s.topicsA && s.topicsB).map(s => s.topicsA.filter((t, i) => s.topicsB[i] === t).length);
    rows.push({ age: +age, model, n: A.length, done: ses.filter(x => x.done).length + '/' + ses.length, ses: mean(ses.filter(x => x.done).map(x => x.time)),
      preAsk: mean(cat(s => s.preAsk)), preAskP90: pct(cat(s => s.preAsk), 0.9), after: mean(cat(s => s.afterRound)), watchMax: Math.max(...A.map(s => s.watchMax)),
      idleAt: A[0].idleAt.map((_, i) => mean(cat(s => s.idleAt[i]))), idleAtN: A[0].idleAt.map((_, i) => cat(s => s.idleAt[i]).length),
      idleHints: sum(s => s.idleHints) / Math.max(1, sum(s => s.asks)), autoPause: sum(s => s.autoPause),
      longAsks: sum(s => s.longAsks), noHintLong: sum(s => s.noHintLong), askP90: pct(cat(s => s.askDur), 0.9), askMax: Math.max(0, ...cat(s => s.askDur)),
      talkN: talk.length, talkOk: talk.length ? 100 * talk.filter(x => x.ok).length / talk.length : 0, talkT: mean(talk.map(x => x.t)),
      talkReask: talk.length ? 100 * talk.filter(x => x.asks > 0).length / talk.length : 0, talkGlow: talk.length ? 100 * talk.filter(x => x.glow).length / talk.length : 0,
      sameRound: sum(s => s.sameRound), rounds: sum(s => s.rounds), sameConsec: sum(s => s.sameConsec), promptReuse: 100 * sum(s => s.promptReuse) / Math.max(1, sum(s => s.promptN)),
      topicSame: mean(topicSame), slot2: sl(2), slot3: sl(3), slot4: sl(4), slot5: sl(5), slot6: sl(6),
      stars: mean(rs), s3: rs.length ? 100 * rs.filter(x => x === 3).length / rs.length : 0, s1: rs.length ? 100 * rs.filter(x => x === 1).length / rs.length : 0,
      roundDur: mean(cat(s => s.roundDur)) });
  }
  rows.sort((a, b) => a.age - b.age || MODELS.indexOf(a.model) - MODELS.indexOf(b.model));
  return rows;
}

function table(rows) {
  const f = x => (+x).toFixed(1), p = x => (+x).toFixed(0);
  let md = '| age | model | sessions done | session mean (s) | round start → 1st ask mean/p90 (s) | party+leave (s) | longest no-tap stretch (s) | idle #1…#5 at (s into ask) | idle hints/ask | 5th idle (auto-pause) | asks >60 s (no hint at all) | ask p90/max (s) | Talk n / right % / mean s / re-asked % / glowed % | identical rounds / rounds | same prompt twice in a row (not countUp) | prompt reused in chapter % | topics same as last session (of 4) | stars/round, ★★★ %, ★ % | round mean (s) |\n';
  md += '|' + Array(21).fill('---').join('|') + '|\n';
  for (const r of rows) md += `| ${r.age} | ${r.model} | ${r.done} | ${p(r.ses)} | ${f(r.preAsk)} / ${f(r.preAskP90)} | ${f(r.after)} | ${f(r.watchMax)} | ${r.idleAt.map((x, i) => r.idleAtN[i] ? p(x) : '–').join(' · ')} | ${r.idleHints.toFixed(2)} | ${r.autoPause} | ${r.longAsks} (${r.noHintLong}) | ${f(r.askP90)} / ${p(r.askMax)} | ${r.talkN} / ${p(r.talkOk)} / ${f(r.talkT)} / ${p(r.talkReask)} / ${p(r.talkGlow)} | ${r.sameRound} / ${r.rounds} | ${r.sameConsec} | ${p(r.promptReuse)} | ${f(r.topicSame)} | ${r.stars.toFixed(2)}, ${p(r.s3)}, ${p(r.s1)} | ${f(r.roundDur)} |\n`;
  md += '\n**Answer slot (left → right) %, by places in the round**\n\n| age | model | 2 | 3 | 4 | 5 | 6 |\n|---|---|---|---|---|---|---|\n';
  for (const r of rows) if (r.model === 'typical' || r.model === 'bot0.8') md += `| ${r.age} | ${r.model} | ${r.slot2} | ${r.slot3} | ${r.slot4} | ${r.slot5} | ${r.slot6} |\n`;
  return md;
}

module.exports = { runOne, summarize, table };
if (require.main !== module) { /* library */ } else if (args.includes('--worker')) {
  process.on('message', m => { process.send(runSlice(m.pairs), () => process.exit(0)); });
} else {
  const t0 = Date.now(), slices = [];
  for (let j = 0; j < JOBS; j++) slices.push([]);
  const pairs = []; for (const a of AGES) for (const m of MODELS) pairs.push([a, m]);
  pairs.forEach((pm, i) => slices[i % JOBS].push(pm));
  Promise.all(slices.filter(s => s.length).map(sl => new Promise((res, rej) => {
    const c = fork(__filename, [...args, '--worker']), parts = [];
    c.on('message', r => parts.push(...r));
    c.on('exit', code => (code ? rej(new Error('worker ' + code)) : res(parts)));
    c.send({ pairs: sl });
  }))).then(parts => {
    const S = [].concat(...parts), rows = summarize(S);
    const md = `## Extra playtest "${TAG}" — ${S.length * 2} sessions (2 in a row per run)${PATCH.length ? ' · patch ' + PATCH.join(',') : ''}${Object.keys(config).length ? ' · config ' + JSON.stringify(config) : ''}\n\n` + table(rows) + `\n_${((Date.now() - t0) / 1000).toFixed(0)} s wall_\n`;
    const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'hsx_' + TAG + '.json'), JSON.stringify(rows, null, 1));
    fs.writeFileSync(path.join(out, 'hsx_' + TAG + '.md'), md);
    console.log(md);
  });
}
