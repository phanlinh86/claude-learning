// Finn's Island Fling — high-speed playtest (report-only).
//   node tests/sim/playtest.js [section ...] [--patch] [--n=K]
// sections: bots humans levels night hearts fixed maxpull flop reach bull all (default all)
// --patch runs the same sections on the recommended patch (tests/sim/patch.js) and prints before → after.
'use strict';
const L = require('./lib.js');
const { PATCH } = require('./patch.js');
const { variant, play, MODELS, Human, BotPlayer, FixedPull, FlopFarmer, landAt, pullAt, q, mean, pct, f, table, DEG } = L;

const args = process.argv.slice(2);
const N = +((args.find(a => a.startsWith('--n=')) || '').slice(4)) || 1;      // run-count multiplier
let secs = args.filter(a => !a.startsWith('--'));
if (!secs.length || secs.includes('all')) secs = ['bots', 'humans', 'levels', 'night', 'hearts', 'fixed', 'maxpull', 'flop', 'reach', 'bull'];
const withPatch = args.includes('--patch');
const VARS = withPatch ? [['before', {}], ['after', PATCH]] : [['current', {}]];
const DIFFS = ['easy', 'normal', 'hard'];
const out = s => process.stdout.write(s + '\n');
const mkHuman = name => (F, w, s) => new Human(F, w, MODELS[name], s);
const mkBot = skill => (F, w, s) => new BotPlayer(F, w, skill, s);

function summarize(runs) {
  const T = runs.map(r => r.t), S = runs.map(r => r.score), lv = runs.map(r => r.level);
  const shots = runs.reduce((a, r) => a + r.shots.length, 0), land = runs.reduce((a, r) => a + r.landings, 0);
  const bulls = runs.reduce((a, r) => a + r.stats.bulls, 0), flops = runs.reduce((a, r) => a + r.stats.flops, 0);
  const fp = runs.map(r => r.firstPoint).filter(x => x !== null);
  const capped = runs.filter(r => !r.over).length;
  return { n: runs.length, tMed: q(T, 0.5), t10: q(T, 0.1), t90: q(T, 0.9), sMed: q(S, 0.5), s90: q(S, 0.9), lvMed: q(lv, 0.5),
    lv10: q(lv, 0.1), lv90: q(lv, 0.9), land: land / shots, bull: bulls / Math.max(1, land), flop: flops / shots, fp: q(fp, 0.5),
    noPoint: runs.length - fp.length, capped, gain: mean(runs.map(r => r.hearts.gained)), lost: mean(runs.map(r => r.hearts.lost)) };
}
function row(name, s) {
  return [name, f(s.tMed) + ' s (' + f(s.t10) + '–' + f(s.t90) + ')', f(s.sMed) + ' / ' + f(s.s90), pct(s.land * 1000, 1000),
    pct(s.bull * 1000, 1000), (s.lvMed + 1) + ' (' + (s.lv10 + 1) + '–' + (s.lv90 + 1) + ')', f(s.fp, 1) + ' s',
    f(s.gain, 1) + ' / ' + f(s.lost, 1), s.capped ? s.capped + '/' + s.n : '0'];
}
const HEAD = ['player', 'run length med (p10–p90)', 'score med / p90', 'landings', 'bull / landing', 'islands reached med (p10–p90)',
  'first point', 'hearts gained / lost', 'still alive at cap'];

// ---------- sections ----------
const S = {};

S.bots = (FIF, tag) => {
  out('\n### Bots, real hearts, until game over (cap 20 min) — ' + tag + '\n');
  const rows = [];
  for (const d of DIFFS) for (const sk of [1, 0.85, 0.6, 0.3]) {
    const runs = []; for (let s = 1; s <= 40 * N; s++) runs.push(play(FIF, { diff: d, seed: 1000 + s, maxT: 1200, mk: mkBot(sk) }));
    rows.push(row(d + ' bot ' + sk, summarize(runs)));
  }
  out(table(HEAD, rows));
};

S.humans = (FIF, tag) => {
  out('\n### Human models, real hearts, until game over (cap 20 min) — ' + tag + '\n');
  const rows = [];
  for (const d of DIFFS) for (const m of ['kid4', 'kid6', 'adult', 'spam']) {
    const runs = []; for (let s = 1; s <= 200 * N; s++) runs.push(play(FIF, { diff: d, seed: 2000 + s, maxT: 1200, mk: mkHuman(m) }));
    rows.push(row(d + ' ' + m, summarize(runs)));
  }
  out(table(HEAD, rows));
  // kid4 on easy: islands reached histogram + landing by shot index
  const runs = []; for (let s = 1; s <= 400 * N; s++) runs.push(play(FIF, { diff: 'easy', seed: 3000 + s, maxT: 1200, mk: mkHuman('kid4') }));
  const hist = {}; runs.forEach(r => { const k = r.level + 1; hist[k] = (hist[k] || 0) + 1; });
  out('\nkid4 easy, islands reached at game over (' + runs.length + ' runs): ' + Object.keys(hist).sort((a, b) => a - b).map(k => 'island ' + k + ': ' + pct(hist[k], runs.length)).join(', '));
  const by = [[0, 0], [0, 0], [0, 0], [0, 0]];
  runs.forEach(r => r.shots.filter(x => x.level === 0).forEach(x => { const i = Math.min(3, x.lvShot); by[i][1]++; if (x.type === 'land') by[i][0]++; }));
  out('kid4 easy Sunny Cove landing by shot #: ' + by.map((b, i) => (i < 3 ? '#' + (i + 1) : '#4+') + ' ' + pct(b[0], b[1])).join(', '));
};

S.levels = (FIF, tag) => {
  out('\n### Time per level (immortal, 15 min from island 1; mean s and landing %) — ' + tag + '\n');
  const rows = [];
  for (const m of ['kid4', 'kid6', 'adult', 'bot0.85']) for (const d of DIFFS) {
    const per = {}, land = {};
    for (let s = 1; s <= (m.startsWith('bot') ? 20 : 60) * N; s++) {
      const r = play(FIF, { diff: d, seed: 4000 + s, maxT: 900, immortal: true, mk: m === 'bot0.85' ? mkBot(0.85) : mkHuman(m) });
      r.levels.forEach(l => { const k = l.level < 4 ? l.level : 4 + (l.level % 4); (per[k] = per[k] || []).push(l.t); });
      r.shots.forEach(x => { const k = x.level < 4 ? x.level : 4 + (x.level % 4); land[k] = land[k] || [0, 0]; land[k][1]++; if (x.type === 'land') land[k][0]++; });
    }
    const cell = k => per[k] ? f(mean(per[k])) + ' s (' + pct(land[k][0], land[k][1]).replace(' %', '%').replace(/\.\d/, '') + ')' : (land[k] ? '>' + ' (' + pct(land[k][0], land[k][1]).replace(' %', '%').replace(/\.\d/, '') + ')' : '—');
    rows.push([m + ' ' + d, cell(0), cell(1), cell(2), cell(3), cell(4), cell(7)]);
  }
  out(table(['player', 'Sunny Cove', 'Jungle Isle', 'Coral Lagoon', 'Lantern Bay', 'Cove loop 2+', 'Lantern loop 2+'], rows));
};

S.night = (FIF0, tag) => {
  out('\n### Day vs night (day cycle frozen, start on each island; landing % — night/day) — ' + tag + '\n');
  // freeze the clock: DAY_LEN huge, then start at day (0.3) or night (0.85)
  const rows = [];
  for (const m of ['kid4', 'kid6', 'adult', 'bot0.85']) {
    const cells = [];
    for (let z = 0; z < 4; z++) {
      const res = {};
      for (const day of [0.3, 0.85]) {
        const FIF = FIF0.__clone({ CONFIG: { DAY_LEN: 1e9 } });
        let a = 0, b = 0, lv = 0, lvN = 0;
        for (let s = 1; s <= (m.startsWith('bot') ? 15 : 40) * N; s++) {
          const r = play(FIF, { diff: 'easy', seed: 5000 + s, maxT: 240, immortal: true, level: z, day, mk: m === 'bot0.85' ? mkBot(0.85) : mkHuman(m) });
          r.shots.filter(x => x.zone === z && x.level === z).forEach(x => { b++; if (x.type === 'land') a++; });
          r.stats.leaves && (lv += r.stats.leaves, lvN += r.shots.length);
        }
        res[day] = { land: a / b, leaves: lv / lvN };
      }
      cells.push(f(100 * res[0.3].land) + '% → ' + f(100 * res[0.85].land) + '%');
    }
    rows.push([m, ...cells]);
  }
  out(table(['player (easy)', 'Sunny Cove day → night', 'Jungle Isle', 'Coral Lagoon', 'Lantern Bay'], rows));
  // share of real-run shots at night
  const FIF = FIF0;
  let n = 0, tot = 0;
  for (let s = 1; s <= 40; s++) { const r = play(FIF, { diff: 'easy', seed: 5500 + s, maxT: 900, immortal: true, mk: mkHuman('kid6') }); r.shots.forEach(x => { tot++; if (x.night) n++; }); }
  out('Share of shots taken at night in a 15-min kid6 session: ' + pct(n, tot));
};

S.hearts = (FIF, tag) => {
  out('\n### Heart economy (15 min immortal sessions: hearts per minute; leaves per shot) — ' + tag + '\n');
  const rows = [];
  for (const m of ['kid4', 'kid6', 'adult', 'bot1', 'bot0.85', 'bot0.6']) for (const d of ['easy', 'normal']) {
    let lost = 0, gain = 0, T = 0, lv = 0, sh = 0;
    const mk = m.startsWith('bot') ? mkBot(+m.slice(3)) : mkHuman(m);
    for (let s = 1; s <= (m.startsWith('bot') ? 12 : 40) * N; s++) {
      // immortal, but count "would-be" heart gains: track leafCount crossings regardless of cap
      const r = play(FIF, { diff: d, seed: 6000 + s, maxT: 900, immortal: true, mk });
      lost += r.stats.splashes; gain += Math.floor(r.stats.leaves / FIF.World.CONFIG.HEART_EVERY); T += r.t / 60; lv += r.stats.leaves; sh += r.shots.length;
    }
    rows.push([m + ' ' + d, f(lost / T, 2), f(gain / T, 2), f((gain - lost) / T, 2), f(lv / sh, 2)]);
  }
  out(table(['player', 'hearts lost / min', 'hearts earned / min', 'net / min', 'leaves / shot'], rows));
};

// best fixed pull: analytic landing + raft position at landing time, over many real spawns
function spawnSample(FIF, diff, level, n, seed) {
  const w = new FIF.World({ seed, difficulty: diff, level });
  const out = [];
  for (let i = 0; i < n; i++) {
    w._newShot(false);
    const r = {}; for (const k in w.raft) r[k] = w.raft[k];
    out.push(r);
  }
  return out;
}
function fixedPullSearch(FIF, diff, levels, think) {
  const C = FIF.World.CONFIG, rafts = [];
  levels.forEach(l => rafts.push(spawnSample(FIF, diff, l, 600, 77 + l)));
  let best = null;
  for (let a = -10; a <= 70; a += 1) for (let Lp = 0.4; Lp <= C.PULL_MAX + 1e-9; Lp += 0.01) {
    const p = pullAt(a * DEG, Lp), la = landAt(FIF, p);
    if (la.x < 0) continue;
    let hit = 0, tot = 0;
    rafts.forEach(set => set.forEach(r => { const x = FIF.World.raftX(r, think + la.T); tot++; if (Math.abs(la.x - x) <= r.hw + C.LAND_PAD) hit++; }));
    if (!best || hit / tot > best.rate) best = { rate: hit / tot, a, L: Lp, p, x: la.x };
  }
  return best;
}
S.fixed = (FIF, tag) => {
  out('\n### Exploit: one fixed pull every shot — ' + tag + '\n');
  const rows = [];
  for (const d of DIFFS) {
    const per = [0, 1, 2, 3].map(l => fixedPullSearch(FIF, d, [l], 0.6));
    const all = fixedPullSearch(FIF, d, [0, 1, 2, 3], 0.6);
    // full runs with the best "Sunny Cove" pull (what a kid memorises on island 1) and the best all-round pull
    const runC = [], runA = [], runR = [];
    for (let s = 1; s <= 60 * N; s++) {
      runC.push(play(FIF, { diff: d, seed: 7000 + s, maxT: 1200, mk: (F, w) => new FixedPull(F, w, per[0].p) }));
      runA.push(play(FIF, { diff: d, seed: 7000 + s, maxT: 1200, mk: (F, w) => new FixedPull(F, w, all.p) }));
      runR.push(play(FIF, { diff: d, seed: 7000 + s, maxT: 1200, mk: (F, w) => new FixedPull(F, w, all.p, { reroll: 0.8 }) }));
    }
    const sC = summarize(runC), sA = summarize(runA), sR = summarize(runR);
    rows.push([d, per.map(b => f(100 * b.rate) + '%').join(' / '), f(100 * all.rate) + '% (' + all.a + '°, ' + all.L.toFixed(2) + ' u)',
      f(sC.tMed) + ' s, isl ' + (sC.lvMed + 1) + ', ' + f(sC.sMed) + ' pts', f(sA.tMed) + ' s, isl ' + (sA.lvMed + 1) + ', ' + f(sA.sMed) + ' pts',
      f(sR.tMed) + ' s, isl ' + (sR.lvMed + 1) + ', ' + f(sR.sMed) + ' pts, alive ' + sR.capped + '/' + sR.n + ', flops ' + pct(sR.flop * 1000, 1000)]);
  }
  out(table(['diff', 'best fixed pull land % (cove / jungle / lagoon / lantern)', 'best one pull for all 4 islands', 'run: cove pull forever', 'run: all-round pull forever', 'run: all-round pull + deliberate flop when raft is off'], rows));
};

class MaxPull {      // always a FULL pull; only the angle is chosen (flat line drives), adult-level eye
  constructor(FIF, w, seed) { this.FIF = FIF; this.w = w; this.r = new FIF.RNG(seed * 31 + 3); this.t = 0; }
  step(dt) {
    const w = this.w, FIF = this.FIF, C = FIF.World.CONFIG;
    if (w.phase !== 'aim') { this.t = 0; return; }
    this.t += dt; if (this.t < 1.2) return;
    const X = w.raft.x + this.r.gauss() * 0.45;
    let lo = -40 * DEG, hi = 51 * DEG;
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (landAt(FIF, pullAt(m, C.PULL_MAX)).x < X) lo = m; else hi = m; }
    const a = (lo + hi) / 2 + this.r.gauss() * 2 * DEG, p = pullAt(a, C.PULL_MAX);
    w.aim(p.x, p.y); w.release();
  }
}
S.maxpull = (FIF, tag) => {
  out('\n### Exploit: max pull every time, steer by angle only (line drives) vs casual adult — ' + tag + '\n');
  const rows = [];
  for (const d of DIFFS) {
    const a = [], b = [];
    for (let s = 1; s <= 100 * N; s++) {
      a.push(play(FIF, { diff: d, seed: 8000 + s, maxT: 1200, mk: (F, w, sd) => new MaxPull(F, w, sd) }));
      b.push(play(FIF, { diff: d, seed: 8000 + s, maxT: 1200, mk: mkHuman('adult') }));
    }
    const sa = summarize(a), sb = summarize(b);
    const lps = r => r.reduce((x, y) => x + y.stats.leaves, 0) / r.reduce((x, y) => x + y.shots.length, 0);
    rows.push([d, pct(sa.land * 1000, 1000) + ', ' + f(lps(a), 2) + ' leaves/shot, ' + f(sa.tMed) + ' s, ' + f(sa.sMed) + ' pts',
      pct(sb.land * 1000, 1000) + ', ' + f(lps(b), 2) + ' leaves/shot, ' + f(sb.tMed) + ' s, ' + f(sb.sMed) + ' pts']);
  }
  out(table(['diff', 'max pull (land, leaves, run, score)', 'casual adult'], rows));
};

S.flop = (FIF, tag) => {
  out('\n### Exploit: tiny pulls / flop farming (20 min cap, real hearts) — ' + tag + '\n');
  const rows = [];
  for (const d of ['easy', 'hard']) {
    const a = [], b = [];
    for (let s = 1; s <= 10 * N; s++) {
      a.push(play(FIF, { diff: d, seed: 9000 + s, maxT: 1200, mk: (F, w) => new FlopFarmer(F, w) }));
      b.push(play(FIF, { diff: d, seed: 9000 + s, maxT: 1200, mk: (F, w) => new FixedPull(F, w, { x: -0.25, y: -0.25 }) }));
    }
    const ppm = r => mean(r.map(x => x.score / (x.t / 60)));
    rows.push([d, f(ppm(a), 1) + ' pts/min, hearts lost ' + f(mean(a.map(x => x.hearts.lost)), 1) + ', alive ' + a.filter(x => !x.over).length + '/' + a.length + ', 20-min score ' + f(mean(a.map(x => x.score))),
      f(ppm(b), 1) + ' pts/min, hearts lost ' + f(mean(b.map(x => x.hearts.lost)), 1) + ', alive ' + b.filter(x => !x.over).length + '/' + b.length]);
  }
  out(table(['diff', 'oracle flop farmer (weak flings that grab the low leaves)', 'naive tiny pull spam'], rows));
};

// leaves: can any (pull, flutter) collect each leaf? can the raft be reached at all (gulls)?
S.reach = (FIF, tag) => {
  out('\n### Reachability: leaves and landing plans — ' + tag + '\n');
  const rows = [];
  for (const d of ['easy', 'hard']) for (const lvl of [0, 1, 2, 3, 6, 7, 14, 15]) {
    const w = new FIF.World({ seed: 31 + lvl, difficulty: d, level: lvl });
    const bot = new FIF.Bot(w, { skill: 1, seed: 5 });
    let leaves = 0, noLeaf = 0, bonus = 0, bonusNo = 0, shots = 0, noPlan = 0, noPlanAll = 0, gullsOnArc = 0;
    for (let k = 0; k < 40; k++) {
      w._newShot(false); w.update(1.2); w.drainEvents();
      shots++;
      const plan = bot.solve(0.5);
      if (!plan || plan.pred.type !== 'land') {
        noPlan++;
        let any = false;
        for (const wait of [1, 2, 3]) { const p2 = bot.solve(wait); if (p2 && p2.pred.type === 'land') { any = true; break; } }
        if (!any) noPlanAll++;
      }
      if (w.solution) { const pr = w.predictShot(w.solution.pull, 0); if (pr.bumps) gullsOnArc++; }
      const all = w.leaves.slice();
      for (const l of all) {
        leaves++; if (l.bonus) bonus++;
        w.leaves = [l]; let got = false;
        outer: for (let a = 10; a <= 76; a += 3) for (let Lp = 0.35; Lp <= 1.8; Lp += 0.05) {
          const p = pullAt(a * DEG, Lp);
          for (const fa of [null, 0.3, 0.6, 0.9]) { const pr = w.predictShot(p, 0, fa); if (pr.leaves) { got = true; break outer; } }
        }
        if (!got) { noLeaf++; if (l.bonus) bonusNo++; }
      }
      w.leaves = all;
    }
    rows.push([d + ' L' + (lvl + 1) + ' ' + FIF.World.LEVELS[lvl % 4].key, shots, pct(noPlan, shots), pct(noPlanAll, shots), pct(gullsOnArc, shots), leaves, pct(noLeaf, leaves), bonus + ' (' + bonusNo + ' unreachable)']);
  }
  out(table(['level', 'shots', 'no landing plan at 0.5 s', 'no plan even waiting 1–3 s', 'gull sits on the leaf arc', 'leaves', 'unreachable leaves', 'bonus leaves'], rows));
};

S.bull = (FIF, tag) => {
  out('\n### Bullseye share of landings, per island (immortal 10 min) — ' + tag + '\n');
  const rows = [];
  for (const m of ['kid4', 'adult', 'bot1', 'bot0.85']) for (const d of ['easy', 'normal']) {
    const z = [[0, 0], [0, 0], [0, 0], [0, 0]];
    const mk = m.startsWith('bot') ? mkBot(+m.slice(3)) : mkHuman(m);
    for (let s = 1; s <= (m.startsWith('bot') ? 10 : 40) * N; s++) {
      const r = play(FIF, { diff: d, seed: 9500 + s, maxT: 600, immortal: true, mk });
      r.shots.forEach(x => { if (x.type === 'land') { z[x.zone][1]++; if (x.bull) z[x.zone][0]++; } });
    }
    rows.push([m + ' ' + d, ...z.map(c => pct(c[0], c[1]))]);
  }
  out(table(['player', 'Sunny Cove', 'Jungle Isle', 'Coral Lagoon', 'Lantern Bay'], rows));
};

// ---------- main ----------
const t0 = Date.now();
for (const [tag, patch] of VARS) {
  const FIF = variant(patch);
  FIF.__clone = extra => variant(mergePatch(patch, extra));
  for (const s of secs) { const t1 = Date.now(); S[s](FIF, tag); out('_(' + s + ': ' + ((Date.now() - t1) / 1000).toFixed(1) + ' s)_'); }
}
out('\n_total ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s_');

function mergePatch(a, b) {
  return { CONFIG: Object.assign({}, a.CONFIG, b.CONFIG), DIFF: a.DIFF, LEVELS: a.LEVELS, src: a.src, code: a.code };
}
