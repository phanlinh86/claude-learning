#!/usr/bin/env node
// High-speed playtester matrix (report-only). Runs pt_kids sessions on all cores and writes tests/sim/out/pt_<name>.{json,md}.
//   node tests/sim/pt_run.js --name before --n 20
//   node tests/sim/pt_run.js --name after --n 20 --config '{"hintAfterMisses":1}' --rules '{"wrongLock":0.8}' --speech '{"wrongSayGap":2.5}'
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { Worker, isMainThread, parentPort } = require('worker_threads');

const DRIVERS = ['careful4', 'typical', 'slow3b', 'string', 'eager', 'random', 'spam4', 'bspam', 'bot0.6', 'bot0.9'];
const VPS = ['iphoneP', 'iphoneL', 'ipadL', 'ipadP', 'shortL'];

function compact(m) {
  return { age: m.age, vp: m.vp, driver: m.driver, done: m.done, t: m.sessionTime, stars: m.stars, stuck: m.stuck, err: m.errors.length,
    ch: m.chapters.map(c => [c.topic, c.end != null ? +(c.end - c.start).toFixed(2) : null, c.rounds]),
    r: m.rounds.map(r => ({ tp: r.topic, md: r.mode, n: r.n, need: r.need, d: r.end != null ? +(r.end - r.start).toFixed(2) : null, ft: r.firstTap, ia: r.ia,
      fp: r.firstPopAt, w: r.wrong, h: r.hints, i: r.idles, s: r.stars, aw: r.away, aa: r.answerAway, ps: r.postSolveTaps })),
    talks: m.talks.map(t => [t.answered, t.asks]), sp: m.speech, drv: m.drv, fi: m.friendIssues, locked: m.locked };
}

if (!isMainThread) {
  const P = require('./pt_kids');
  parentPort.on('message', j => { if (!j) { parentPort.postMessage('bye'); process.exit(0); } parentPort.postMessage(compact(P.run(j))); });
} else if (require.main === module) main();

function runJobs(jobs) {
  return new Promise((resolve, reject) => {
    const nw = Math.min(os.cpus().length, jobs.length), res = []; let left = nw, next = 0;
    for (let k = 0; k < nw; k++) {
      const wk = new Worker(__filename);
      const feed = () => wk.postMessage(next < jobs.length ? jobs[next++] : null);
      wk.on('message', r => { if (r === 'bye') { if (--left === 0) resolve(res); return; } res.push(r); feed(); });
      wk.on('error', reject); feed();
    }
  });
}

const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
function pct(a, p) { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; }
const f1 = x => (isFinite(x) ? x.toFixed(1) : '–'), f0 = x => (isFinite(x) ? Math.round(x) + '' : '–'), fp = x => (isFinite(x) ? Math.round(100 * x) + '%' : '–'), f2 = x => (isFinite(x) ? x.toFixed(2) : '–');

function agg(S) {
  const R = S.flatMap(s => s.r.filter(r => r.d != null)), C = S.flatMap(s => s.ch.filter(c => c[1] != null));
  const cnt = R.filter(r => r.md === 'count'), anim = R.filter(r => r.md === 'ask');
  const taps = S.reduce((a, s) => a + (s.drv.taps || 0), 0), misses = S.reduce((a, s) => a + (s.drv.misses || 0), 0);
  const sp = S.reduce((a, s) => { a.said += s.sp.said; a.cut += s.sp.cut; a.dropped += s.sp.dropped; a.wrong += s.sp.by.wrong || 0; a.time += s.sp.time; return a; }, { said: 0, cut: 0, dropped: 0, wrong: 0, time: 0 });
  const totT = S.reduce((a, s) => a + (s.t || 0), 0);
  const fiR = S.reduce((a, s) => a + s.fi.rounds, 0), fiO = S.reduce((a, s) => a + s.fi.overlapPairs, 0);
  return {
    n: S.length, done: S.filter(s => s.done).length, stuck: S.reduce((a, s) => a + s.stuck, 0), err: S.reduce((a, s) => a + s.err, 0),
    ses: mean(S.map(s => s.t || 0)), sesP90: pct(S.map(s => s.t || 0), 0.9), sesMax: Math.max(...S.map(s => s.t || 0)),
    chap: mean(C.map(c => c[1])), chapP10: pct(C.map(c => c[1]), 0.1), chapP90: pct(C.map(c => c[1]), 0.9), cut3: mean(C.map(c => c[2] < 4 ? 1 : 0)),
    round: mean(R.map(r => r.d)), roundP90: pct(R.map(r => r.d), 0.9), roundMax: Math.max(...R.map(r => r.d)),
    ft: mean(R.map(r => r.ft)), ia: mean(R.map(r => r.ia)), fp: mean(R.filter(r => r.fp != null).map(r => r.fp)),
    wrong: mean(R.map(r => r.w)), hintR: mean(R.map(r => (r.h > 0 ? 1 : 0))), idleR: mean(R.map(r => r.i)),
    s3: mean(R.map(r => (r.s === 3 ? 1 : 0))), s2: mean(R.map(r => (r.s === 2 ? 1 : 0))), s1: mean(R.map(r => (r.s === 1 ? 1 : 0))),
    stars: mean(S.map(s => s.stars)), away: mean(R.map(r => r.aw)), answerAway: R.reduce((a, r) => a + r.aa, 0),
    countD: mean(cnt.map(r => r.d)), countPost: mean(cnt.map(r => r.ps)), countExtra: mean(cnt.map(r => r.n - r.need)), animD: mean(anim.map(r => r.d)),
    missRate: taps ? misses / taps : NaN, tapsPerMin: totT ? taps / totT * 60 : NaN,
    riseIgn: S.reduce((a, s) => a + (s.drv.riseIgnored || 0), 0) / Math.max(1, S.reduce((a, s) => a + (s.drv.tapOnRising || 0), 0)),
    cut: sp.said ? sp.cut / sp.said : NaN, wrongPerMin: totT ? sp.wrong / totT * 60 : NaN, talkFrac: totT ? sp.time / totT : NaN,
    friendOverlap: fiR ? fiO / fiR : NaN, friendOff: S.reduce((a, s) => a + s.fi.offscreen + s.fi.onSign, 0), locked: mean(S.map(s => s.locked || 0)),
    starsPerMin: totT ? S.reduce((a, s) => a + s.stars, 0) / totT * 60 : NaN,
    promptCut: (() => { let c = 0, n = 0; for (const s of S) { n += (s.sp.by.round || 0) + (s.sp.by.ask || 0); for (const k in s.sp.cutBy) if (k.startsWith('round>') || k.startsWith('ask>')) c += s.sp.cutBy[k]; } return n ? c / n : NaN; })(),
    talkAns: mean(S.flatMap(s => s.talks.filter(t => t[0] != null).map(t => t[0])))
  };
}

function report(D) {
  const S = D.sessions, ages = [...new Set(S.map(s => s.age))].sort(), drivers = [...new Set(S.map(s => s.driver))];
  let md = `## pt_${D.name}\n\nconfig \`${JSON.stringify(D.config)}\` · rules \`${JSON.stringify(D.rules)}\` · speech \`${JSON.stringify(D.speech)}\` · ${S.length} sessions (${D.n} per driver × age × viewport, viewports ${VPS.join('/')})\n\n`;
  md += '| driver | age | done | session mean (p90, max) s | chapter mean (p10–p90) | cut to Talk | round mean (p90, max) | 1st tap possible | interactive | wrong/round | hint rounds | idle/round | ★3/★2/★1 rounds | stars | count round s | count taps after N | animals round s | miss taps | speech cut | prompt cut | wrong lines/min | stars/min |\n|' + '---|'.repeat(22) + '\n';
  for (const d of drivers) for (const a of ages) {
    const sub = S.filter(s => s.driver === d && s.age === a); if (!sub.length) continue;
    const g = agg(sub);
    md += `| ${d} | ${a} | ${g.done}/${g.n} | ${f0(g.ses)} (${f0(g.sesP90)}, ${f0(g.sesMax)}) | ${f1(g.chap)} (${f0(g.chapP10)}–${f0(g.chapP90)}) | ${fp(g.cut3)} | ${f1(g.round)} (${f1(g.roundP90)}, ${f0(g.roundMax)}) | ${f2(g.ft)} | ${f2(g.ia)} | ${f2(g.wrong)} | ${fp(g.hintR)} | ${f2(g.idleR)} | ${fp(g.s3)}/${fp(g.s2)}/${fp(g.s1)} | ${f1(g.stars)} | ${f1(g.countD)} | ${f2(g.countPost)} | ${f1(g.animD)} | ${fp(g.missRate)} | ${fp(g.cut)} | ${fp(g.promptCut)} | ${f1(g.wrongPerMin)} | ${f1(g.starsPerMin)} |\n`;
  }
  const all = agg(S);
  md += `\nTotals: ${all.done}/${all.n} done, stuck rounds ${all.stuck}, errors ${all.err}, answer balloons that flew away unpopped ${all.answerAway}, mean balloons sent away per round ${f2(all.away)} (count extras ${f2(all.countExtra)}), friend overlap pairs per animal round ${f2(all.friendOverlap)}, friends off-screen/on sign ${all.friendOff}, Miu speaking ${fp(all.talkFrac)} of the time.\n`;
  // friends per viewport
  md += '\nFriends on the yard (overlapping pairs per animals round / max friends) by viewport: ' + VPS.map(v => { const sub = S.filter(s => s.vp === v); const g = agg(sub); return `${v} ${f2(g.friendOverlap)} (max ${Math.max(...sub.map(s => s.fi.maxPerRound))})`; }).join(' · ') + '\n';
  const cb = {}; for (const s of S) for (const k in s.sp.cutBy) cb[k] = (cb[k] || 0) + s.sp.cutBy[k];
  md += '\nSpeech cut-offs (interrupted line > interrupting line), all sessions: ' + Object.entries(cb).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k} ${v}`).join(' · ') + '\n';
  const eag = S.filter(s => s.driver === 'eager');
  if (eag.length) md += `\nEager child: ${fp(agg(eag).riseIgn)} of taps on a still-rising balloon are ignored (no feedback); pops while rising per session ${f1(mean(eag.map(s => s.drv.popWhileRising)))}.\n`;
  return md;
}

async function main() {
  const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
  const name = get('name', 'base'), n = +get('n', 10), config = JSON.parse(get('config', '{}')), rules = JSON.parse(get('rules', 'null')), speech = JSON.parse(get('speech', '{}'));
  const drivers = get('drivers', DRIVERS.join(',')).split(','), ages = get('ages', '3,4,5,6,7').split(',').map(Number), vps = get('vps', VPS.join(',')).split(',');
  const jobs = []; let seed = +get('seed0', 1000);
  for (const driver of drivers) for (const age of ages) for (const vp of vps) for (let k = 0; k < n; k++)
    jobs.push({ driver, age, vp, seed: seed++, lang: k % 2 ? 'vi' : 'en', config, rules, speech });
  const t0 = Date.now(), sessions = await runJobs(jobs);
  const D = { name, n, config, rules, speech, sessions };
  const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'pt_' + name + '.json'), JSON.stringify(D));
  const md = report(D) + `\n_${sessions.length} sessions, ${((Date.now() - t0) / 1000).toFixed(0)} s wall_\n`;
  fs.writeFileSync(path.join(out, 'pt_' + name + '.md'), md);
  console.log(md);
}
module.exports = { agg, report };
