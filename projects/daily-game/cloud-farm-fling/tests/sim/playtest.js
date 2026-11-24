// Nubi's Farm Fling — high-speed playtest (report-only: never edits game/).
//   node tests/sim/playtest.js [section ...] [--patch] [--n=K]
// sections: bots humans spring growth reach preview exploits pacing (default: all)
// --after runs only the patched game. --patch runs each section on the current game AND on the recommended patch (tests/sim/patch.js): before → after.
'use strict';
const L = require('./lib.js');
const { PATCH } = require('./patch.js');
const { variant, play, MODELS, Human, BotPlayer, FlopFarmer, estLanding, pullAt, q, mean, pct, f, table, DEG } = L;

const args = process.argv.slice(2);
const N = +((args.find(a => a.startsWith('--n=')) || '').slice(4)) || 1;
let secs = args.filter(a => !a.startsWith('--'));
if (!secs.length || secs.includes('all')) secs = ['bots', 'humans', 'spring', 'growth', 'reach', 'preview', 'exploits', 'pacing'];
const VARS = args.includes('--after') ? [['after', PATCH]] : args.includes('--patch') ? [['before', {}], ['after', PATCH]] : [['current', {}]];
const DIFFS = ['easy', 'normal', 'hard'];
const ZN = ['spring', 'summer', 'autumn', 'winter'];
const out = s => process.stdout.write(s + '\n');
const mkH = name => (F, w, s) => new Human(F, w, MODELS[name], s);
const mkB = skill => (F, w, s) => new BotPlayer(F, w, skill, s);
const mkFlop = (F, w, s) => new FlopFarmer(F, w, s);

function runs(CFF, n, o) { const r = []; for (let s = 1; s <= n; s++) r.push(play(CFF, Object.assign({ seed: 1000 + s }, o))); return r; }
function summ(rs) {
  const sh = rs.flatMap(r => r.shots), land = sh.filter(s => s.type === 'land').length;
  const fp = rs.map(r => r.firstPoint).filter(x => x !== null);
  const lvT = rs.flatMap(r => r.levels.filter(l => l.level < 4).map(l => l.t));
  const zone = [0, 1, 2, 3].map(z => { const a = sh.filter(s => s.zone === z && s.type !== 'flop'); return a.length >= 10 ? pct(a.filter(s => s.type === 'land').length, a.length) : '—'; });
  const bad = rs.flatMap(r => r.bad);
  return { T: rs.map(r => r.t), S: rs.map(r => r.score), lv: rs.map(r => r.level), land: land / Math.max(1, sh.filter(s => s.type !== 'flop').length),
    flop: sh.filter(s => s.type === 'flop').length / Math.max(1, sh.length), fp, lvT, zone, bad, capped: rs.filter(r => !r.over).length, n: rs.length,
    big: mean(rs.map(r => r.stats.bigShowers / Math.max(1, r.stats.landings))), gain: mean(rs.map(r => r.hearts.gained)) };
}
const tri = a => f(q(a, 0.1)) + ' / ' + f(q(a, 0.5)) + ' / ' + f(q(a, 0.9));

// ---------------- sections ----------------
const S = {};

S.bots = (CFF, tag) => {
  out('\n### Bots (' + tag + ') — mortal games, cap 900 s, ' + 12 * N + ' seeds each');
  const rows = [];
  for (const sk of [1, 0.85, 0.6]) for (const d of DIFFS) {
    const s = summ(runs(CFF, 12 * N, { diff: d, maxT: 900, mk: mkB(sk) }));
    rows.push([sk, d, (100 * s.land).toFixed(0) + ' %', s.zone.join(' / '), tri(s.T) + (s.capped ? ' (' + s.capped + ' capped)' : ''), tri(s.S), f(q(s.lv, 0.5)),
      f(q(s.lvT, 0.5)), f(q(s.fp, 0.5), 1), (100 * s.big).toFixed(0) + ' %', s.bad.length]);
  }
  out(table(['skill', 'diff', 'land', 'land spr/sum/aut/win', 'survive s p10/50/90', 'score p10/50/90', 'level med', 's/season med', '1st pt s', 'Big Shower/landing', 'bad'], rows));
};

S.humans = (CFF, tag) => {
  out('\n### Human models (' + tag + ') — mortal games, cap 900 s');
  const rows = [];
  for (const name of ['kid', 'kid4', 'adult', 'spam', 'farmer', 'farmerMax', 'flopFarmer']) for (const d of DIFFS) {
    const n = (name.startsWith('farmer') || name === 'flopFarmer' ? 6 : 14) * N;
    const s = summ(runs(CFF, n, { diff: d, maxT: 900, mk: name === 'flopFarmer' ? mkFlop : mkH(name) }));
    const ppm = mean(s.S.map((x, i) => 60 * x / s.T[i]));
    rows.push([name, d, (100 * s.land).toFixed(0) + ' %', s.zone.join(' / '), tri(s.T) + (s.capped ? ' (' + s.capped + ' cap)' : ''), tri(s.S), f(ppm),
      f(q(s.lv, 0.5)), f(q(s.lvT, 0.5)), f(q(s.fp, 0.5), 1), (100 * s.flop).toFixed(0) + ' %', s.bad.length]);
  }
  out(table(['model', 'diff', 'land', 'land spr/sum/aut/win', 'survive s p10/50/90', 'score p10/50/90', 'pts/min', 'level med', 's/season', '1st pt s', 'flops', 'bad'], rows));
};

S.spring = (CFF, tag) => {
  out('\n### Spring for a 5-year-old (' + tag + ') — kid model, first season only');
  const rows = [];
  for (const name of ['kid', 'kid4']) for (const d of ['easy', 'normal']) {
    const rs = runs(CFF, 60 * N, { diff: d, maxT: 600, untilLevel: 1, mk: mkH(name) });
    const done = rs.filter(r => r.level >= 1), dead = rs.filter(r => r.over);
    const by = [0, 1, 2, 3, 4, 5].map(i => { const a = rs.map(r => r.shots.filter(s => s.type !== 'flop')[i]).filter(Boolean); return a.length ? pct(a.filter(s => s.type === 'land').length, a.length) : '—'; });
    const lost = rs.map(r => r.hearts.lost - r.hearts.gained);
    rows.push([name, d, pct(done.length, rs.length), pct(dead.length, rs.length), f(q(done.map(r => r.t), 0.5)) + ' (' + f(q(done.map(r => r.t), 0.9)) + ')',
      by.join(' / '), f(mean(lost), 1), f(q(rs.map(r => r.firstPoint || 999), 0.5), 1)]);
  }
  out(table(['model', 'diff', 'finishes Spring', 'game over in Spring', 'time to finish med (p90) s', 'land shot 1/2/3/4/5/6', 'net hearts lost', '1st point s'], rows));
};

S.growth = (CFF, tag) => {
  out('\n### Growth: fixed-size experiment (' + tag + ') — size forced at every new shot, immortal, 240 s × ' + 6 * N + ' seeds, all seasons mixed (start level 0..3)');
  const sizes = [1, 1.2, 1.4, 1.55, 1.7], rows = [];
  for (const [nm, mk] of [['bot 1', mkB(1)], ['bot 0.85', mkB(0.85)], ['bot 0.6', mkB(0.6)], ['adult', mkH('adult')], ['kid', mkH('kid')]]) for (const d of ['easy', 'normal']) {
    const cells = sizes.map(sz => {
      let land = 0, sh = 0, flies = 0, score = 0, avail = 0;
      for (let s = 1; s <= 6 * N; s++) for (let lv = 0; lv < 4; lv++) {
        const r = play(CFF, { seed: 50 + s * 4 + lv, diff: d, level: lv, maxT: 240 / 4 * 1, immortal: true, size: sz, mk,
          hook: (w, e) => { if (e.type === 'newShot') w.setSize(sz); if (e.type === 'newShot' || e.type === 'levelUp') w._availFlies = w.flies.length; } });
        const a = r.shots.filter(x => x.type !== 'flop'); sh += a.length; land += a.filter(x => x.type === 'land').length;
        flies += r.stats.flies; score += r.score;
      }
      return pct(land, sh) + ', ' + f(flies / sh, 1) + ' ff, ' + f(score / sh, 1) + ' pt';
    });
    rows.push([nm, d].concat(cells));
  }
  out(table(['player', 'diff'].concat(sizes.map(s => 'size ' + s + ' (land, fireflies/shot, pts/shot)')), rows));
  // natural play: land rate by release size bucket
  out('Natural play (mortal, cap 900 s): landing rate by the size at release');
  const B = [[1, 1.1], [1.1, 1.25], [1.25, 1.4], [1.4, 1.55], [1.55, 1.71]], rows2 = [];
  for (const [nm, mk] of [['bot 0.85', mkB(0.85)], ['adult', mkH('adult')], ['kid', mkH('kid')]]) for (const d of DIFFS) {
    const sh = runs(CFF, 12 * N, { diff: d, maxT: 900, mk }).flatMap(r => r.shots).filter(s => s.type !== 'flop' && s.size !== undefined);
    rows2.push([nm, d].concat(B.map(([a, b]) => { const x = sh.filter(s => s.size >= a && s.size < b); return x.length >= 15 ? pct(x.filter(s => s.type === 'land').length, x.length) + ' (n' + x.length + ')' : '— (n' + x.length + ')'; })));
  }
  out(table(['player', 'diff'].concat(B.map(b => b[0] + '–' + Math.min(1.7, b[1]))), rows2));
  // ablation: growth off
  const off = variant(Object.assign({}, CFF.__patch || {}, { CONFIG: Object.assign({}, (CFF.__patch || {}).CONFIG, { GROW_RATE: 0, GROW_FLY: 0, GROW_GOLD: 0 }) }));
  const rows3 = [];
  for (const [nm, mk] of [['bot 0.85', mkB(0.85)], ['adult', mkH('adult')], ['kid', mkH('kid')]]) for (const d of ['easy', 'normal']) {
    const a = summ(runs(CFF, 12 * N, { diff: d, maxT: 900, mk })), b = summ(runs(off, 12 * N, { diff: d, maxT: 900, mk }));
    rows3.push([nm, d, (100 * a.land).toFixed(0) + ' % → ' + (100 * b.land).toFixed(0) + ' %', f(q(a.S, 0.5)) + ' → ' + f(q(b.S, 0.5)), f(q(a.T, 0.5)) + ' → ' + f(q(b.T, 0.5))]);
  }
  out('Ablation: growth ON → OFF (GROW_RATE = GROW_FLY = GROW_GOLD = 0)');
  out(table(['player', 'diff', 'land', 'score med', 'survive med s'], rows3));
};

S.reach = (CFF, tag) => {
  const W = CFF.World, C = W.CONFIG;
  out('\n### Reach at max size and firefly arcs (' + tag + ')');
  const rows = [];
  for (const d of DIFFS) for (let lv = 0; lv < 8; lv += 1) {
    const w = new W({ seed: 1, difficulty: d, level: lv }), P = w.levelParams(lv);
    const far = P.xmax + P.hw + W.padAt(C.SIZE_MAX);       // farthest wagon edge that still counts (centre at xmax incl. roll)
    let best = -1e9;
    for (let a = 20; a <= 75; a += 1) { const v = C.VMAX, ang = a * DEG, k = C.PULL_MAX / C.VMAX;
      if (Math.sin(ang) * C.VMAX * k > C.PULL_DOWN) continue;
      const r = W.bodyLand(C.SIZE_MAX, C.SIZE_MAX, C.SLING.x - Math.cos(ang) * v * k, C.SLING.y - Math.sin(ang) * v * k, v * Math.cos(ang), v * Math.sin(ang), C.WAGON_TOP);
      best = Math.max(best, r.x); }
    // also with the max pull limited by PULL_DOWN at steep angles: scan pulls on the circle
    rows.push([d, lv + ' ' + P.key, f(P.xmax, 2), f(best, 2), f(best - (P.xmax - W.padAt(C.SIZE_MAX) - P.hw), 2)]);
  }
  out(table(['diff', 'level', 'farthest wagon centre', 'full-pull reach at 1.7 (bottom on soil)', 'margin past the near edge of the farthest wagon'], rows.filter((r, i) => i % 8 < 4 || r[0] === 'hard')));
  // arc generator: fallback rate (shot with no fireflies) and perfect-shot check by size, + real kid wait
  const rows2 = [];
  for (const sz of [1, 1.35, 1.7]) for (const d of ['easy', 'hard']) {
    let fb = 0, n = 0, perfect = 0, perfectLate = 0, nf = 0;
    for (let seed = 1; seed <= 40 * N; seed++) for (let lv = 0; lv < 4; lv++) {
      const w = new W({ seed: seed * 10 + lv, difficulty: d, level: lv, size: sz }); n++;
      if (!w.flies.length) { fb++; continue; }
      nf += w.flies.filter(l => !l.bonus).length;
      const sol = w.solution, arc = w.flies.filter(l => !l.bonus).length;
      const p1 = w.predictShot(sol.pull, sol.wait), p2 = w.predictShot(sol.pull, 4);
      if (p1.type === 'land' && p1.flies >= arc) perfect++;
      if (p2.type === 'land' && p2.flies >= arc) perfectLate++;
    }
    rows2.push([sz, d, pct(fb, n), f(nf / Math.max(1, n - fb), 1), pct(perfect, n - fb), pct(perfectLate, n - fb)]);
  }
  out(table(['size', 'diff', 'shots with NO fireflies (fallback)', 'arc fireflies/shot', 'solution pull collects all + lands (release at 1 s)', 'same pull released at 4 s (kid wait)'], rows2));
};

S.preview = (CFF, tag) => {
  const W = CFF.World, C = W.CONFIG;
  out('\n### Is the preview misleading? (' + tag + ') — random pulls that land 7–15 u, |estimated − true landing| in u');
  const rows = [];
  for (const d of ['easy', 'hard']) for (let z = 0; z < 4; z++) for (const sz of [1, 1.7]) {
    const errN = [], errF = [], seenA = [];
    const r = new CFF.RNG(z * 100 + sz * 10);
    for (let i = 0; i < 120 * N; i++) {
      const w = new W({ seed: i + 1, difficulty: d, level: z, size: sz }); w.flies = [];
      const pull = pullAt(r.range(30, 60) * DEG, r.range(0.8, 1.8));
      const tr = w.predictShot(pull, 0);
      const truth = tr.type === 'land' ? tr.x : null;
      // true landing on the soil height regardless of wagon: body only
      const v = w.launchVelocity(pull.x, pull.y), bl = W.bodyLand(sz, sz, C.SLING.x + pull.x, C.SLING.y + pull.y, v.vx, v.vy, C.WAGON_TOP);
      if (bl.x < 7 || bl.x > 15) continue;
      w.crows = []; w.wagon.hw = 100; w.wagon.amp = 0;   // an endless wagon: the dots stop exactly at soil height
      const a = estLanding(CFF, w, pull, 'naive'), b = estLanding(CFF, w, pull, 'fit');
      // a / b estimate the landing at wagon-top height; compare to bl
      errN.push(Math.abs(a.x - bl.x)); errF.push(Math.abs(b.x - bl.x)); seenA.push(a.seen ? 1 : 0);
      void truth;
    }
    rows.push([d, ZN[z], sz, f(W.prototype.previewCount.call({ phase: 'aim', pull: 1, P: new W({ seed: 1, difficulty: d, level: z }).P })), pct(seenA.filter(x => x).length, seenA.length),
      f(mean(errN), 2) + ' (p90 ' + f(q(errN, 0.9), 2) + ')', f(mean(errF), 2)]);
  }
  out(table(['diff', 'season', 'size', 'dots', 'landing visible', 'naive-parabola error (kid)', 'curvature-fit error (adult)'], rows));
};

S.exploits = (CFF, tag) => {
  out('\n### Exploits (' + tag + ')');
  // puff value: adult with smart rescue vs never puffing vs spam-puff-every-frame
  const rows = [];
  const noPuff = Object.assign({}, MODELS.adult, { smart: 0 }), spamAdult = Object.assign({}, MODELS.adult, { smart: 0, spam: true });
  for (const d of DIFFS) {
    const c = [['adult (smart puff)', mkH('adult')], ['adult, never puffs', (F, w, s) => new Human(F, w, noPuff, s)], ['adult + puff spam', (F, w, s) => new Human(F, w, spamAdult, s)],
      ['bot 0.85', mkB(0.85)]].map(([nm, mk]) => { const s = summ(runs(CFF, 12 * N, { diff: d, maxT: 900, mk, immortal: true, maxT: 600 })); return nm + ': ' + (100 * s.land).toFixed(0) + ' %'; });
    rows.push([d].concat(c));
  }
  out('Puff use (immortal 900 s; landing rate)');
  out(table(['diff', 'a', 'b', 'c', 'd'], rows));
  // waiting in the aim phase: how long to reach Big from the post-landing size
  const C = CFF.World.CONFIG;
  const after = 1 + (C.SIZE_MAX - 1) * C.RAIN_KEEP;
  out('Free growth while aiming: ' + C.GROW_RATE + ' /s → from the post-rain size ' + after.toFixed(2) + ' to BIG_AT ' + C.BIG_AT + ' takes ' + f((C.BIG_AT - after) / C.GROW_RATE) + ' s; from 1 → 1.7 takes ' + f(0.7 / C.GROW_RATE) + ' s.');
};

S.pacing = (CFF, tag) => {
  out('\n### Season pacing (' + tag + ') — immortal, 720 s, s per season (median, p10–p90) and shots per season');
  const rows = [];
  for (const [nm, mk] of [['kid', mkH('kid')], ['kid4', mkH('kid4')], ['adult', mkH('adult')], ['bot 0.85', mkB(0.85)], ['bot 0.6', mkB(0.6)]]) for (const d of DIFFS) {
    const rs = runs(CFF, 10 * N, { diff: d, maxT: 720, immortal: true, mk });
    const cells = [0, 1, 2, 3].map(z => { const a = rs.flatMap(r => r.levels.filter(l => l.level % 4 === z)); return a.length ? f(q(a.map(x => x.t), 0.5)) + ' (' + f(q(a.map(x => x.t), 0.1)) + '–' + f(q(a.map(x => x.t), 0.9)) + ', ' + f(mean(a.map(x => x.shots)), 1) + ' sh)' : '—'; });
    rows.push([nm, d].concat(cells));
  }
  out(table(['player', 'diff', 'spring', 'summer', 'autumn', 'winter'], rows));
};

for (const sec of secs) for (const [tag, p] of VARS) {
  const CFF = variant(p); CFF.__patch = p;
  const t0 = Date.now();
  S[sec](CFF, tag);
  process.stderr.write(sec + ' ' + tag + ' ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s\n');
}
