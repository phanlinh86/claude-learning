// Markdown tables for tests/sim/out/pt_<name>.json (see playtest.js).  node tests/sim/playtest.js --report base[,prop,…]
'use strict';
const fs = require('fs');
const path = require('path');
const { mean, pct, f1, f0, fp } = require('./lib');
const sum = a => a.reduce((s, x) => s + (x || 0), 0);
const flat = a => [].concat(...a);
const by = (arr, f) => { const o = {}; for (const x of arr) { const k = f(x); (o[k] = o[k] || []).push(x); } return o; };
const load = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'pt_' + n + '.json'), 'utf8'));
const tbl = (head, rows) => '| ' + head.join(' | ') + ' |\n|' + head.map(() => '---').join('|') + '|\n' + rows.map(r => '| ' + r.join(' | ') + ' |').join('\n') + '\n';
const DORDER = ['bot0.3', 'bot0.6', 'bot0.9', 'typical', 'toddler', 'slow3', 'dropsHighRim', 'tapper', 'spammer'];
const KIDS = ['typical', 'toddler', 'slow3', 'dropsHighRim'];

function agg(S) {
  const done = S.filter(s => s.done), ses = done.map(s => s.sessionTime);
  const ch = flat(S.map(s => s.chapters.filter(c => c.dur !== null).map(c => c.dur)));
  const R = flat(S.map(s => s.rounds.filter(r => r.dur !== null)));
  const mins = sum(S.map(s => s.simTime)) / 60;
  const sp = S.map(s => s.speech).filter(Boolean);
  const hg = S.map(s => s.hintGapMin).filter(x => x < 1e8), ig = flat(S.map(s => s.idleGaps));
  const rs = R.map(r => r.stars);
  return {
    n: S.length, done: done.length / S.length, ses: mean(ses), sesP90: pct(ses, .9), sesMax: Math.max(...ses), ses8: ses.filter(x => x <= 480).length / Math.max(1, ses.length),
    ch: mean(ch), chP10: pct(ch, .1), chP90: pct(ch, .9), chMax: Math.max(...ch), chIn: ch.filter(x => x >= 60 && x <= 100).length / Math.max(1, ch.length), chOver: ch.filter(x => x > 100).length / Math.max(1, ch.length),
    rd: mean(R.map(r => r.dur)), rdP90: pct(R.map(r => r.dur), .9), rdMax: Math.max(...R.map(r => r.dur)), roundsPerCh: R.length / Math.max(1, ch.length),
    stuck: sum(S.map(s => s.stuck)), inv: sum(S.map(s => s.invariant)), err: sum(S.map(s => (s.errors || []).length)),
    hintsPerRound: sum(R.map(r => r.hints)) / Math.max(1, R.length), hintRounds: R.filter(r => r.hints > 0).length / Math.max(1, R.length), hintGapMin: hg.length ? Math.min(...hg) : NaN,
    idlesPerSes: mean(S.map(s => s.idles)), idleGapMin: ig.length ? Math.min(...ig) : NaN,
    stars: mean(done.map(s => s.stars)), r3: rs.filter(x => x === 3).length / rs.length, r2: rs.filter(x => x === 2).length / rs.length, r1: rs.filter(x => x === 1).length / rs.length,
    taps: sum(S.map(s => s.taps)), tapDrops: sum(S.map(s => s.tapDrops)), flicks: sum(S.map(s => s.flicks)),
    missPerDrop: sum(S.map(s => s.misses)) / Math.max(1, sum(S.map(s => s.drops))), wrongPerDrop: sum(S.map(s => s.wrongs)) / Math.max(1, sum(S.map(s => s.drops))),
    overlap: sum(S.map(s => s.overlapRest)), out: sum(S.map(s => s.outScreen)), inZone: sum(S.map(s => s.restInZone)), unreach: sum(S.map(s => s.unreachable)), checks: sum(S.map(s => s.checks)),
    shrinkMin: Math.min(...S.map(s => s.packShrinkMin)),
    talk: sum(S.map(s => s.talkRight)) / Math.max(1, sum(S.map(s => s.talkN))),
    askRep: sum(S.map(s => s.askRep)), askPairs: sum(S.map(s => s.askPairs)),
    reqMin: sum(sp.map(x => x.req)) / mins, maxqMin: sum(sp.map(x => x.maxq)) / mins, maxPending: Math.max(...sp.map(x => x.maxPending)),
    rep2Ses: mean(sp.map(x => x.rep2)), rep2Min: sum(sp.map(x => x.rep2)) / mins, earlyMin: sum(sp.map(x => x.early)) / mins, cutsMin: sum(sp.map(x => x.cuts)) / mins,
    staleMin: sum(sp.map(x => x.stale)) / mins,
    cr: sum(sp.map(x => x.cr)), crComplete: sum(sp.map(x => x.crComplete)), crHeard: sum(sp.map(x => x.crHeard)),
    cutBy: sp.reduce((o, x) => { for (const k in x.cutBy) o[k] = (o[k] || 0) + x.cutBy[k]; return o; }, {})
  };
}

function contentStats(S) {
  // consecutive-round repetition inside a chapter, by topic
  const out = {};
  for (const s of S) {
    const C = by(s.content, c => c.l);
    for (const l in C) {
      const rs = C[l];
      for (let i = 1; i < rs.length; i++) {
        const a = rs[i - 1], b = rs[i], k = s.age + ' ' + b.topic, o = out[k] = out[k] || { age: s.age, topic: b.topic, pairs: 0, sameSet: 0, overlap: 0, sameColorCount: 0, firstSame: 0, firstPairs: 0, labelShare: 0 };
        o.pairs++;
        if (a.labels.join() === b.labels.join()) o.sameSet++;
        const shared = b.labels.filter(x => a.labels.includes(x)).length; o.labelShare += shared / b.labels.length;
        if (shared > 0) o.overlap++;
        if (b.topic === 'count' && a.color === b.color) o.sameColorCount++;
      }
    }
    // ask: first target animal same as the previous animals round's first target (same chapter)
    for (let i = 1; i < s.askRounds.length; i++) {
      const k = s.age + ' animals', o = out[k]; if (!o) continue;
      o.firstPairs++; if (s.askRounds[i].first === s.askRounds[i - 1].first) o.firstSame++;
    }
  }
  const N = {};
  for (const s of S) for (const c of s.content) if (c.topic === 'count') { const h = N[s.age] = N[s.age] || { w: {}, r: {} }; const b = c.r === 0 ? h.w : h.r; b[c.n] = (b[c.n] || 0) + 1; }
  return { rep: out, N };
}

function report(names) {
  const D = names.map(load), base = D[0];
  let md = '';
  const S = base.sessions;
  const cells = by(S, s => s.driver + '|' + s.age);
  const drivers = DORDER.filter(d => S.some(s => s.driver === d));
  const ages = [...new Set(S.map(s => s.age))].sort();
  md += `# Playtest tables — ${base.name} (${S.length} sessions, ${base.absent.length} absent-child runs; config ${JSON.stringify(base.config)})\n\n`;

  md += '## Durations (game seconds)\n\n';
  md += tbl(['driver', 'age', 'n', 'done', 'session mean / p90 / max', '≤ 8 min', 'chapter mean / p10 / p90 / max', 'chapters 60–100 s', '> 100 s', 'rounds / ch', 'round mean / p90 / max', 'stuck', 'err'],
    flat(drivers.map(d => ages.map(a => { const g = agg(cells[d + '|' + a] || []); return [d, a, g.n, fp(g.done), `${f0(g.ses)} / ${f0(g.sesP90)} / ${f0(g.sesMax)}`, fp(g.ses8),
      `${f0(g.ch)} / ${f0(g.chP10)} / ${f0(g.chP90)} / ${f0(g.chMax)}`, fp(g.chIn), fp(g.chOver), f1(g.roundsPerCh), `${f1(g.rd)} / ${f1(g.rdP90)} / ${f0(g.rdMax)}`, g.stuck, g.err]; }))));

  md += '\n## Per-topic round time, child models (mean / p90 s)\n\n';
  const topics = {};
  for (const s of S.filter(s => KIDS.includes(s.driver))) for (const r of s.rounds) if (r.dur !== null) { const k = s.age + '|' + r.topic + '|' + s.driver; (topics[k] = topics[k] || []).push(r.dur); }
  const tk = [...new Set(Object.keys(topics).map(k => k.split('|').slice(0, 2).join('|')))].sort();
  md += tbl(['age', 'topic', ...KIDS], tk.map(k => [k.split('|')[0], k.split('|')[1], ...KIDS.map(d => { const a = topics[k + '|' + d] || []; return `${f1(mean(a))} / ${f1(pct(a, .9))}`; })]));

  md += '\n## Help, stars, input, Talk (all ages pooled per driver)\n\n';
  const byD = by(S, s => s.driver);
  md += tbl(['driver', 'hints / round', 'rounds with a hint', 'min hint gap s', 'idle / session', 'min idle gap s', 'stars / session', 'rounds 3★ / 2★ / 1★', 'wrong / drop', 'miss / drop', 'taps (→ drop)', 'quick flicks', 'Talk right'],
    drivers.map(d => { const g = agg(byD[d]); return [d, g.hintsPerRound.toFixed(2), fp(g.hintRounds), f1(g.hintGapMin), f1(g.idlesPerSes), f1(g.idleGapMin), f1(g.stars),
      `${fp(g.r3)} / ${fp(g.r2)} / ${fp(g.r1)}`, fp(g.wrongPerDrop), fp(g.missPerDrop), `${g.taps} (${g.tapDrops})`, g.flicks, fp(g.talk)]; }));

  md += '\n## Invariants (checked every 4th update while a round is on screen)\n\n';
  md += tbl(['driver', 'checks', 'resting seed outside screen', 'resting seeds overlap', 'resting in a drop zone', 'home unreachable (HUD/Lumi/edge)', 'NaN / overfull', 'min pack scale', 'exceptions', 'stuck rounds'],
    drivers.map(d => { const g = agg(byD[d]); return [d, g.checks, g.out, g.overlap, g.inZone, g.unreach, g.inv, g.shrinkMin.toFixed(2), g.err, g.stuck]; }));

  md += '\n## Voice (main.js policy replayed through a voice.js queue model, game time)\n\n';
  md += tbl(['driver', 'lines asked / min', 'dropped by MAXQ / min', 'max pending (before trim)', 'stale drops / min', 'cut < 50 % / min', 'same line back-to-back < 2 s (per session)', 'count rounds: all numbers started / heard ≥ 60 %'],
    drivers.map(d => { const g = agg(byD[d]); return [d, f1(g.reqMin), g.maxqMin.toFixed(2), g.maxPending, g.staleMin.toFixed(2), f1(g.earlyMin), f1(g.rep2Ses), `${fp(g.crComplete / g.cr)} / ${fp(g.crHeard / g.cr)} (${g.cr})`]; }));
  md += '\nTop interruptions (cut ← by), child models + bots:\n\n';
  const cb = {}; for (const d of drivers.filter(d => d !== 'tapper' && d !== 'spammer')) { const c = agg(byD[d]).cutBy; for (const k in c) cb[k] = (cb[k] || 0) + c[k]; }
  md += Object.entries(cb).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `\`${k}\` ${v}`).join(' · ') + '\n';

  const cs = contentStats(S);
  md += '\n## Content variety (consecutive rounds inside one chapter)\n\n';
  md += tbl(['age', 'topic', 'pairs', 'identical pot set', 'share any label', 'mean labels shared', 'count: same seed colour', 'animals: same first target'],
    Object.values(cs.rep).sort((a, b) => a.age - b.age || a.topic.localeCompare(b.topic)).map(o => [o.age, o.topic, o.pairs, fp(o.sameSet / o.pairs), fp(o.overlap / o.pairs), fp(o.labelShare / o.pairs),
      o.topic === 'count' ? fp(o.sameColorCount / o.pairs) : '', o.topic === 'animals' ? fp(o.firstSame / Math.max(1, o.firstPairs)) : '']));
  const g0 = agg(S);
  md += `\nAsk mode: the same animal asked twice in a row inside a round: ${g0.askRep} of ${g0.askPairs} consecutive asks.\n`;
  md += '\n### Count targets N\n\n' + tbl(['age', 'warm-up N', 'rounds 1–3 N'], Object.entries(cs.N).map(([a, h]) => {
    const f = o => { const t = sum(Object.values(o)); return Object.entries(o).sort((x, y) => x[0] - y[0]).map(([n, c]) => `${n}:${(100 * c / t).toFixed(0)}%`).join(' '); };
    return [a, f(h.w), f(h.r)]; }));

  md += '\n## Absent child (no input: 10 min in round 2 of chapter 1, then 5 min in Talk time, then the bot finishes)\n\n';
  const A = base.absent;
  md += tbl(['age', 'runs', 'idle nudges in 10 min', 'first / 2nd / 3rd / later gaps s', 'idle lines spoken', 'talk re-asks in 5 min', 'talk re-asks spoken', 'answer glows', 'state kept + session finishes', 'errors'],
    ages.map(a => { const r = A.filter(x => x.age === a); if (!r.length) return [a, 0, '', '', '', '', '', '', '', ''];
      const g = r[0].idleRel || []; const gaps = g.map((t, i) => i ? t - g[i - 1] : t);
      return [a, r.length, f1(mean(r.map(x => x.idle.length))), gaps.slice(0, 3).map(f0).join(' / ') + ' / ' + f0(gaps[gaps.length - 1]), f1(mean(r.map(x => x.idleSpoken))),
        f1(mean(r.map(x => x.talkAsks))), f1(mean(r.map(x => x.talkAskSpoken))), fp(mean(r.map(x => x.talkGlow ? 1 : 0))), fp(mean(r.map(x => x.ok && x.resumed ? 1 : 0))), r.filter(x => x.err).length]; }));

  if (D.length > 1) {
    md += '\n## Before / after\n\n';
    const keys = [['session mean s (typical)', g => f0(g.ses), 'typical'], ['session p90 s (toddler)', g => f0(g.sesP90), 'toddler'], ['session p90 s (slow3)', g => f0(g.sesP90), 'slow3'],
      ['≤ 8 min (slow3)', g => fp(g.ses8), 'slow3'], ['chapters 60–100 s (typical)', g => fp(g.chIn), 'typical'], ['chapter p90 (slow3)', g => f0(g.chP90), 'slow3'],
      ['idle / session (slow3)', g => f1(g.idlesPerSes), 'slow3'], ['hints / round (dropsHighRim)', g => g.hintsPerRound.toFixed(2), 'dropsHighRim'], ['miss / drop (dropsHighRim)', g => fp(g.missPerDrop), 'dropsHighRim'],
      ['miss / drop (slow3)', g => fp(g.missPerDrop), 'slow3'], ['stars (slow3)', g => f1(g.stars), 'slow3'],
      ['back-to-back lines / session (tapper)', g => f1(g.rep2Ses), 'tapper'], ['MAXQ drops / min (tapper)', g => g.maxqMin.toFixed(2), 'tapper'], ['errors + stuck (all)', g => g.err + g.stuck, null]];
    md += tbl(['metric', ...D.map(d => d.name)], keys.map(([lab, f, d]) => [lab, ...D.map(x => f(agg(d ? x.sessions.filter(s => s.driver === d) : x.sessions)))]));
    md += tbl(['absent child', ...D.map(d => d.name)], [['idle nudges / 10 min', ...D.map(x => f1(mean(x.absent.map(a => a.idle.length))))], ['idle lines spoken / 10 min', ...D.map(x => f1(mean(x.absent.map(a => a.idleSpoken))))]]);
  }
  fs.writeFileSync(path.join(__dirname, 'out', 'pt_' + names.join('+') + '.md'), md);
  process.stdout.write(md);
}
module.exports = { report, agg };
