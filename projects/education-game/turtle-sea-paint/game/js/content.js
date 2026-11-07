/* Nini's Sea Painting — SP.PALETTE, SP.AGE_TOPICS, SP.AGE_POOLS, SP.SEA_WORDS, SP.Content (pure + deterministic; DESIGN §5.1)
 *
 *   SP.Content.makeRound(topic, { age, lang, rng, roundIndex, surprise, prevPics?, short? }) → round   (self-checked: completable)
 *   SP.Content.makeTalk(topic,  { age, lang, rng }) → talk
 *   SP.Content.validate(round) → null | 'reason'
 *   SP.Content.topicsFor(age, rng?, lastTopics?) → the 4 chapter topics (easiest first)
 *
 * round = { topic, age, lang, roundIndex, surprise, templateId, pic (SP.Pictures.build result), palette: [colour] | null,
 *           steps: [step], key, seed }
 * step  = { mode: 'pickColor'|'tapPart'|'count'|'pickTap', targets: [partId], color, need?, promptKey, params, nameKind,
 *           nameValue, role (the role of the target parts) }
 *   pickColor (colors):  palette shown; tap the `color` shell, then the ONE glowing target part.
 *   tapPart:             brush preloaded with `color`; tap the target part (another part of the same role = a mistake).
 *   pickTap (shapes 5+): palette shown; pick `color`, then tap the target shape (either wrong = a mistake).
 *   count:               brush preloaded; paint `need` of the `targets` (count: all spots; oddeven: exactly the right-parity
 *                        labels, need = targets.length; an unpainted non-target of the same role = a mistake).
 * Prompt keys / params (DESIGN §5.1): p.colors {part, color} · p.shapes {shape, color} · p.shapes5 {shape, color} ·
 *   p.size {size, animal, color} · p.animals {animal, color} · p.count {n, color, spot} · p.letters {letter, color} ·
 *   p.lower {letter (CAPITAL shown in the prompt), small, color} · p.initial {letter, color} · p.add {a, b, color} ·
 *   p.sub {a, b, color} · p.oddeven {parity, color}.  After the right shell in pickColor: p.tapPart {part, color}.
 * talk  = { topic, promptKey: 'talk.<topic>', params, show: thing | null, choices: [{ id, thing }], answer, answerId }
 *   thing = PaintArt.drawIcon kinds: {kind:'blob', color} · {kind:'shape', shape, color} · {kind:'animal', animal, color?} ·
 *           {kind:'number', n} · {kind:'letter', text} · {kind:'dots', n} · {kind:'size', size, animal, color}
 */
(function (SP) {
  'use strict';

  // DESIGN §3 answer palette (exact hex)
  SP.PALETTE = {
    red:    { base: '#E84A4A', dark: '#A8282E', light: '#F7A0A0' },
    blue:   { base: '#3C8DE8', dark: '#1F5BA8', light: '#A6CCF5' },
    yellow: { base: '#FFD23F', dark: '#C99A12', light: '#FFEB9C' },
    green:  { base: '#4CC26B', dark: '#2A8343', light: '#A8E6B8' },
    orange: { base: '#FF9A2E', dark: '#C4650C', light: '#FFCB8E' },
    purple: { base: '#8E44AD', dark: '#6840A8', light: '#D2BDF3' },
    pink:   { base: '#FF8FC0', dark: '#C9558A', light: '#FFCCE2' }      // an answer colour from age 5
  };
  for (var pk in SP.PALETTE) SP.PALETTE[pk].fill = SP.PALETTE[pk].base;
  var COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple'];
  var COLORS5 = COLORS.concat(['pink']);
  SP.SHAPES = SP.SHAPES || ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
  SP.SEA_ANIMALS = SP.SEA_ANIMALS || ['fish', 'crab', 'octopus', 'starfish', 'jellyfish', 'seahorse', 'whale', 'dolphin'];

  SP.AGE_TOPICS = {
    3: ['colors', 'shapes', 'size', 'animals'],
    4: ['colors', 'shapes', 'count', 'animals'],
    5: ['shapes', 'count', 'letters', 'animals'],
    6: ['lower', 'initial', 'add', 'count'],
    7: ['initial', 'add', 'sub', 'oddeven']
  };
  /* Every age has a POOL of 5 topics in difficulty order; a session plays 4 of them (rotating between sessions). */
  SP.AGE_POOLS = {
    3: ['colors', 'shapes', 'size', 'animals', 'count'],
    4: ['colors', 'size', 'shapes', 'count', 'animals'],
    5: ['colors', 'shapes', 'count', 'letters', 'animals'],
    6: ['letters', 'lower', 'initial', 'add', 'count'],
    7: ['count', 'initial', 'add', 'sub', 'oddeven']
  };
  var ALL_TOPICS = ['colors', 'shapes', 'size', 'animals', 'count', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
  var KIND_OF = { colors: 'parts', shapes: 'shapes', size: 'scene', animals: 'scene', count: 'count', letters: 'labels', lower: 'labels',
    initial: 'scene', add: 'labels', sub: 'labels', oddeven: 'labels' };

  // ---- tables (DESIGN §5.1)
  var SHAPES4 = ['circle', 'square', 'triangle', 'star', 'heart'];   // ages ≤ 4; all 8 from age 5
  var LETTER_POOL = { en: 'ABCDEFGHIKLMNOPRSTUW', vi: 'ABCDEGHIKLMNOPSTUVXY' };
  var LOWER_SKIP = 'IL';                                             // capital I and small l look alike
  var ADD_MAX = { 5: 10, 6: 10, 7: 20 }, SUB_MAX = 10, ODDEVEN_MAX = { 5: 10, 6: 12, 7: 20 };
  var MAX_SPOTS = 12, MAX_STEPS = 3, COUNT_EXTRA = 2, COUNT_EXTRA_SMALL = 3;
  /* 'initial' words (sea animals). VI without the classifier "con". */
  SP.SEA_WORDS = {
    en: { fish: 'fish', crab: 'crab', octopus: 'octopus', starfish: 'starfish', jellyfish: 'jellyfish', seahorse: 'seahorse', whale: 'whale', dolphin: 'dolphin' },
    vi: { fish: 'cá', crab: 'cua', octopus: 'bạch tuộc', starfish: 'sao biển', jellyfish: 'sứa', seahorse: 'cá ngựa', whale: 'cá voi', dolphin: 'cá heo' }
  };
  function initialOf(animal, lang) {
    var w = SP.SEA_WORDS[langOf(lang)][animal];
    return w ? w.charAt(0).normalize('NFD').charAt(0).toUpperCase() : null;
  }

  /* Colour-blind / toddler safety (DESIGN §3): below age 5 one round never holds blue+purple, red+green, yellow+orange or
   * green+orange (palette + every step colour), and no pink. */
  var COLOR_SAFE_BELOW = 5;
  var CLASH = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange']];
  function clash(cs) {
    for (var i = 0; i < CLASH.length; i++) if (cs.indexOf(CLASH[i][0]) >= 0 && cs.indexOf(CLASH[i][1]) >= 0) return true;
    return false;
  }
  function safeSetsOf(n) {
    var out = [];
    for (var m = 1; m < 64; m++) {
      var cs = COLORS.filter(function (c, i) { return m & (1 << i); });
      if (cs.length === n && !clash(cs)) out.push(cs);
    }
    return out;
  }
  var SAFE = { 1: safeSetsOf(1), 2: safeSetsOf(2), 3: safeSetsOf(3), 4: safeSetsOf(4) };   // 4: none exist (only 3 is max)

  function ageOf(a) { a = Math.round(+a || 4); return a < 3 ? 3 : a > 7 ? 7 : a; }
  function langOf(l) { return l === 'vi' ? 'vi' : 'en'; }
  function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }
  function shapesFor(age) { return age >= 5 ? SP.SHAPES.slice() : SHAPES4.slice(); }
  function letterPool(lang, topic) {
    var P = LETTER_POOL[langOf(lang)].split('');
    return topic === 'lower' ? P.filter(function (c) { return LOWER_SKIP.indexOf(c) < 0; }) : P;
  }
  function parityOf(n) { return n % 2 ? 'odd' : 'even'; }
  /** k distinct colours; below age 5 a clash-free set (k ≤ 3). */
  function colourSet(rng, age, k) {
    if (age < COLOR_SAFE_BELOW) return rng.shuffle(rng.pick(SAFE[Math.min(3, k)]).slice()).slice(0, k);
    return rng.sample(COLORS5, k);
  }
  function Pics() { if (!SP.Pictures) throw new Error('SP.Content: SP.Pictures (pictures.js) is not loaded'); return SP.Pictures; }

  // ---------------- template capacities (probed once per template, cached) ----------------
  var CAP = {};
  function roleCount(pic, role) { var n = 0; for (var i = 0; i < pic.parts.length; i++) if (pic.parts[i].role === role) n++; return n; }
  function tryBuild(id, opt) { try { return Pics().build(id, opt); } catch (e) { return null; } }
  /** { kind, n (largest supported count), counts [supported exact counts], sizes (scene: big + small) } — probed by
   *  building the template with 1..8 shapes / animals / labels (count: 3..12 spots). */
  function capOf(id, kind) {
    var key = kind + ':' + id;
    if (CAP[key]) return CAP[key];
    var c = { kind: kind, n: 0, counts: [], sizes: false }, p, n;
    if (kind === 'parts') { p = tryBuild(id, {}); c.n = p ? roleCount(p, 'part') : 0; c.counts = [c.n]; }
    else if (kind === 'count') {
      for (n = 3; n <= MAX_SPOTS; n++) { p = tryBuild(id, { n: n, seed: 1 }); if (p && roleCount(p, 'spot') === n) c.counts.push(n); }
    } else {
      var role = kind === 'shapes' ? 'shape' : kind === 'scene' ? 'animal' : 'label';
      for (n = 1; n <= 8; n++) {
        var opt = kind === 'shapes' ? { shapes: SP.SHAPES.slice(0, n) } : kind === 'scene' ? { animals: SP.SEA_ANIMALS.slice(0, n) } : { labels: 'ABCDEFGH'.slice(0, n).split(''), kind: 'letter' };
        p = tryBuild(id, opt);
        if (p && roleCount(p, role) === n) c.counts.push(n);
      }
      if (kind === 'scene') {
        var q = tryBuild(id, { animals: ['fish', 'fish'], sizes: ['big', 'small'] });
        c.sizes = !!q && q.parts.filter(function (x) { return x.role === 'animal' && (x.size === 'big' || x.size === 'small'); }).length === 2;
      }
    }
    c.n = c.counts.length ? Math.max.apply(null, c.counts) : 0;
    CAP[key] = c;
    return c;
  }
  /** Template ids of a kind that take exactly k items (parts / count: at least k) (and sizes when asked). `prev` = the
   *  templates used so far (the world passes the whole session, oldest first): the unused ones when there are any, else
   *  the least-recently used half of the pool (never the one just played when the pool has ≥ 2). */
  function templatesFor(kind, k, needSizes, prev) {
    var all = Pics().list(kind).filter(function (id) {
      var c = capOf(id, kind);
      return (kind === 'parts' || kind === 'count' ? c.n >= k : c.counts.indexOf(k) >= 0) && (!needSizes || c.sizes);
    });
    if (!prev || !prev.length || all.length < 2) return all;
    var fresh = all.filter(function (id) { return prev.indexOf(id) < 0; });
    if (fresh.length) return fresh;
    var used = all.map(function (id, i) { return { id: id, at: prev.lastIndexOf(id), i: i }; });
    used.sort(function (a, b) { return a.at - b.at || a.i - b.i; });
    return used.slice(0, Math.max(1, Math.min(used.length - 1, Math.ceil(used.length / 2)))).map(function (u) { return u.id; });
  }
  function pickTemplate(rng, kind, k, needSizes, prev) {
    var ids = templatesFor(kind, k, needSizes, prev);
    if (!ids.length) throw new Error('SP.Content: no ' + kind + ' template for ' + k + (needSizes ? ' + sizes' : ''));
    return rng.pick(ids);
  }
  function partsOf(pic, role) { return pic.parts.filter(function (p) { return p.role === role; }); }
  /** Parts of `role` whose nameValue appears exactly once among that role. */
  function uniqueParts(pic, role) {
    var ps = partsOf(pic, role), cnt = {};
    ps.forEach(function (p) { var k = String(p.nameValue) + '|' + (p.size || ''); cnt[k] = (cnt[k] || 0) + 1; });
    return ps.filter(function (p) { return cnt[String(p.nameValue) + '|' + (p.size || '')] === 1; });
  }

  // ---------------- steps ----------------
  /** Steps per round: warm-up 1; later 2–3 (age 3: 2), never more than `max`. */
  var SHORT_MAX = 3;   // set per round by buildRound from opt.short (a long chapter): ages ≤ 4 → 1 step, 5+ → 2
  var EASY_MAX = 3;    // set per round by buildRound: the first chapter of a session at ages ≤ 5 → ≤ 2 steps (playtest P2-2 / P3-1)
  function stepsFor(rng, age, ri, max) {
    if (ri === 0) return 1;
    var k = age <= 3 ? 2 : rng.int(2, 3);
    return Math.max(1, Math.min(k, max, MAX_STEPS, SHORT_MAX, EASY_MAX));
  }
  /** "Easiest first" (playtest P2-2 / P3-1): in the first chapter of a session (level 0) rounds 0–1 show fewer shells —
   *  ages ≤ 4: 2, age 5: 3 (colours and the age-5 pickTap shapes); 0 = the normal palette. */
  function easyPalette(level, age, ri) { return level === 0 && ri <= 1 ? (age <= 4 ? 2 : age === 5 ? 3 : 0) : 0; }
  function stepCap(level, age) { return level === 0 && age <= 5 ? 2 : MAX_STEPS; }   // first chapter: ≤ 2 steps up to age 5
  function paletteSize(topic, age, ri, level) {
    var e = easyPalette(level, age, ri);
    if (topic === 'colors') return e || (age <= 3 ? 2 : age === 4 ? 3 : 4);
    if (topic === 'shapes' && age >= 5) return e || 4;
    return 0;
  }
  function S(mode, targets, color, promptKey, params, nameKind, nameValue, role, extra) {
    var s = { mode: mode, targets: targets, color: color, promptKey: promptKey, params: params, nameKind: nameKind, nameValue: nameValue, role: role };
    if (extra) for (var k in extra) s[k] = extra[k];
    return s;
  }
  /** count N per round (DESIGN §5.1), clamped so N + spares fits the template. */
  function countN(rng, age, ri, cap) {
    var lo, hi;
    if (ri === 0) { lo = 1; hi = 2; }
    else if (ri === 1) { lo = 2; hi = 3; }
    else if (age <= 4) { lo = 3; hi = 5; }
    else if (age === 5) { lo = 4; hi = 10; }
    else { lo = 5; hi = 12; }
    hi = Math.min(hi, cap - COUNT_EXTRA);
    lo = Math.min(lo, hi);
    return rng.int(lo, hi);
  }
  function spotsFor(n) { return n + (n <= 3 ? COUNT_EXTRA_SMALL : COUNT_EXTRA); }
  function nearNums(ans, lo, hi, k, rng) {
    var c = rng.shuffle(range(lo, hi).filter(function (x) { return x !== ans && Math.abs(x - ans) <= 4; }));
    if (c.length < k) c = c.concat(rng.shuffle(range(lo, hi).filter(function (x) { return x !== ans && c.indexOf(x) < 0; })));
    return c.slice(0, k);
  }

  function buildRound(topic, age, lang, rng, ri, prev, short, level) {
    SHORT_MAX = short ? (age <= 4 ? 1 : 2) : MAX_STEPS;
    EASY_MAX = stepCap(level, age);
    var steps = [], palette = null, kind = KIND_OF[topic], tid, pic, k, i, cols, ps, t;
    switch (topic) {
      case 'colors': {
        var P = paletteSize('colors', age, ri, level);
        tid = pickTemplate(rng, 'parts', 2, false, prev); pic = Pics().build(tid, {});
        ps = rng.shuffle(uniqueParts(pic, 'part').slice());
        palette = colourSet(rng, age, P);
        k = stepsFor(rng, age, ri, Math.min(ps.length, P));
        cols = rng.sample(palette, k);
        for (i = 0; i < k; i++) steps.push(S('pickColor', [ps[i].id], cols[i], 'p.colors', { part: ps[i].nameValue, color: cols[i] }, 'part', ps[i].nameValue, 'part'));
        break;
      }
      case 'shapes': {
        var nS = age <= 3 ? 2 : age === 4 ? 3 : 4, shp = rng.sample(shapesFor(age), nS);
        tid = pickTemplate(rng, 'shapes', nS, false, prev); pic = Pics().build(tid, { shapes: shp });
        ps = rng.shuffle(uniqueParts(pic, 'shape').slice());
        if (age >= 5) {
          palette = colourSet(rng, age, paletteSize('shapes', age, ri, level));
          k = stepsFor(rng, age, ri, Math.min(ps.length, palette.length)); cols = rng.sample(palette, k);
          for (i = 0; i < k; i++) steps.push(S('pickTap', [ps[i].id], cols[i], 'p.shapes5', { shape: ps[i].nameValue, color: cols[i] }, 'shape', ps[i].nameValue, 'shape'));
        } else {
          k = stepsFor(rng, age, ri, ps.length); cols = colourSet(rng, age, k);
          for (i = 0; i < k; i++) steps.push(S('tapPart', [ps[i].id], cols[i], 'p.shapes', { shape: ps[i].nameValue, color: cols[i] }, 'shape', ps[i].nameValue, 'shape'));
        }
        break;
      }
      case 'size': {
        var an = rng.pick(SP.SEA_ANIMALS), sz = rng.shuffle(['big', 'small']);
        tid = pickTemplate(rng, 'scene', 2, true, prev); pic = Pics().build(tid, { animals: [an, an], sizes: sz });
        ps = partsOf(pic, 'animal').filter(function (p) { return p.size === 'big' || p.size === 'small'; });
        rng.shuffle(ps);
        k = ri === 0 || SHORT_MAX < 2 ? 1 : 2; cols = colourSet(rng, age, k);
        for (i = 0; i < Math.min(k, ps.length); i++) steps.push(S('tapPart', [ps[i].id], cols[i], 'p.size', { size: ps[i].size, animal: an, color: cols[i] }, 'size', ps[i].size, 'animal'));
        break;
      }
      case 'animals': case 'initial': {
        var nA = topic === 'initial' ? (lang === 'vi' ? 3 : age >= 7 ? 4 : 3) : age <= 3 ? 2 : age === 4 ? 3 : 4, ans;
        if (topic === 'initial') {   // animals with distinct initials in this language
          var byI = {};
          rng.shuffle(SP.SEA_ANIMALS.slice()).forEach(function (a) { var c = initialOf(a, lang); if (c && !byI[c]) byI[c] = a; });
          ans = rng.shuffle(Object.keys(byI).map(function (c) { return byI[c]; })).slice(0, nA);
          nA = ans.length;
        } else ans = rng.sample(SP.SEA_ANIMALS, nA);
        tid = pickTemplate(rng, 'scene', nA, false, prev); pic = Pics().build(tid, { animals: ans });
        ps = rng.shuffle(uniqueParts(pic, 'animal').slice());
        k = stepsFor(rng, age, ri, topic === 'initial' ? Math.min(2, ps.length) : ps.length);
        cols = colourSet(rng, age, k);
        for (i = 0; i < k; i++) {
          if (topic === 'animals') steps.push(S('tapPart', [ps[i].id], cols[i], 'p.animals', { animal: ps[i].nameValue, color: cols[i] }, 'animal', ps[i].nameValue, 'animal'));
          else { var L0 = initialOf(ps[i].nameValue, lang); steps.push(S('tapPart', [ps[i].id], cols[i], 'p.initial', { letter: L0, color: cols[i] }, 'letter', L0, 'animal', { animal: ps[i].nameValue })); }
        }
        break;
      }
      case 'count': {
        tid = pickTemplate(rng, 'count', 4, false, prev);
        var cap = capOf(tid, 'count').n, N = countN(rng, age, ri, cap), nSp = Math.min(cap, spotsFor(N)), col = colourSet(rng, age, 1)[0];
        pic = Pics().build(tid, { n: nSp, seed: rng.int(1, 1e6) });
        ps = partsOf(pic, 'spot');
        steps.push(S('count', ps.map(function (p) { return p.id; }), col, 'p.count', { n: N, color: col, spot: pic.spotName || 'bubble' }, 'number', N, 'spot', { need: N }));
        break;
      }
      case 'letters': case 'lower': {
        var nL = age <= 5 ? rng.int(3, 4) : 4;
        tid = pickTemplate(rng, 'labels', nL, false, prev);
        var LL = rng.sample(letterPool(lang, topic), nL), texts = LL.map(function (c) { return topic === 'lower' ? c.toLowerCase() : c; });
        pic = Pics().build(tid, { labels: texts, kind: 'letter' });
        ps = rng.shuffle(uniqueParts(pic, 'label').slice());
        k = stepsFor(rng, age, ri, ps.length); cols = colourSet(rng, age, k);
        for (i = 0; i < k; i++) {
          var tx = String(ps[i].text !== undefined ? ps[i].text : ps[i].nameValue);
          steps.push(S('tapPart', [ps[i].id], cols[i], 'p.' + topic, topic === 'lower' ? { letter: tx.toUpperCase(), small: tx, color: cols[i] } : { letter: tx, color: cols[i] },
            'letter', ps[i].nameValue, 'label'));
        }
        break;
      }
      case 'add': case 'sub': {
        var nB = age >= 7 ? 4 : rng.int(3, 4);
        tid = pickTemplate(rng, 'labels', nB, false, prev);
        k = ri === 0 || SHORT_MAX < 2 ? 1 : 2;
        var probs = [], used = [];
        for (i = 0; i < k; i++) {
          var a, b, res, tries = 0;
          do {
            if (topic === 'add') { var top = ADD_MAX[age] || 10, hi = ri === 0 ? Math.min(6, top) : top; res = rng.int(2, hi); a = rng.int(1, res - 1); b = res - a; }
            else { res = rng.int(0, ri === 0 ? 5 : SUB_MAX - 1); b = rng.int(1, SUB_MAX - res); a = res + b; }
          } while (used.indexOf(res) >= 0 && ++tries < 50);
          used.push(res); probs.push({ a: a, b: b, res: res });
        }
        var hiN = topic === 'add' ? (ADD_MAX[age] || 10) : SUB_MAX, nums = used.slice();
        nearNums(used[0], topic === 'add' ? 1 : 0, hiN, nB, rng).forEach(function (x) { if (nums.length < nB && nums.indexOf(x) < 0) nums.push(x); });
        rng.shuffle(nums);
        pic = Pics().build(tid, { labels: nums.map(String), kind: 'number' });
        for (i = 0; i < k; i++) {
          var tp = pic.parts.filter(function (p) { return p.role === 'label' && +p.nameValue === probs[i].res; });
          if (tp.length !== 1) continue;
          cols = cols || colourSet(rng, age, k);
          steps.push(S('tapPart', [tp[0].id], cols[i], 'p.' + topic, { a: probs[i].a, b: probs[i].b, color: cols[i] }, 'number', probs[i].res, 'label', { a: probs[i].a, b: probs[i].b }));
        }
        break;
      }
      case 'oddeven': {
        var nO = ri === 0 ? 3 : rng.int(4, 5), par = rng.pick(['odd', 'even']), hiO = ODDEVEN_MAX[age] || 12;
        tid = pickTemplate(rng, 'labels', nO, false, prev);
        var nRight = ri === 0 ? 1 : rng.int(1, Math.max(1, nO - 2)) + (nO >= 4 ? 1 : 0);
        nRight = Math.max(1, Math.min(nRight, nO - 1));
        var right = rng.sample(range(1, hiO).filter(function (x) { return parityOf(x) === par; }), nRight);
        var wrong = rng.sample(range(1, hiO).filter(function (x) { return parityOf(x) !== par; }), nO - nRight);
        var nums2 = rng.shuffle(right.concat(wrong));
        pic = Pics().build(tid, { labels: nums2.map(String), kind: 'number' });
        var tg = pic.parts.filter(function (p) { return p.role === 'label' && parityOf(+p.nameValue) === par; });
        var c1 = colourSet(rng, age, 1)[0];
        steps.push(S('count', tg.map(function (p) { return p.id; }), c1, 'p.oddeven', { parity: par, color: c1 }, 'parity', par, 'label', { need: tg.length }));
        break;
      }
      default: throw new Error('SP.Content: unknown topic ' + topic);
    }
    var r = { topic: topic, age: age, lang: lang, roundIndex: ri, surprise: null, templateId: tid, kind: kind, pic: pic, palette: palette, steps: steps, short: !!short,
      level: level === undefined ? null : level };
    r.key = roundKey(r);
    return r;
  }
  function roundKey(r) {
    return r.templateId + '#' + r.steps.map(function (s) { return s.mode + ':' + s.targets.join('+') + ':' + s.color + ':' + s.nameValue; }).join(',') +
      '#' + r.pic.parts.filter(function (p) { return p.role !== 'part'; }).map(function (p) { return p.nameValue + (p.size || ''); }).join(',');
  }

  /**
   * makeRound(topic, { age, lang, rng, roundIndex, surprise, prevPics?, short?, level? }) → round. `prevPics` = template ids
   * used so far this session, oldest first (unused templates first, else the least-recently used; never back-to-back when
   * the pool allows). `short` (the world sets it when the chapter runs long): 1 step at ages ≤ 4, ≤ 2 steps from age 5.
   * `level` = the chapter index: level 0 is the easy first chapter (ages ≤ 5: ≤ 2 steps; shells in rounds 0–1: 2 at ages ≤ 4,
   * 3 at age 5).
   */
  function makeRound(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new SP.RNG(1), ri = o.roundIndex || 0;
    if (ALL_TOPICS.indexOf(topic) < 0) throw new Error('SP.Content: unknown topic ' + topic);
    var r = null, err = null, prev = o.prevPics || null;
    for (var attempt = 0; attempt < 60; attempt++) {
      try { r = buildRound(topic, age, lang, rng, ri, attempt < 40 ? prev : null, !!o.short, o.level === undefined || o.level === null ? undefined : o.level | 0); err = validate(r); }
      catch (e) { r = null; err = e.message; }
      if (!err) break;
    }
    if (err) throw new Error('SP.Content: invalid round (' + topic + ', age ' + age + ', round ' + ri + '): ' + err);
    r.surprise = ri === 0 ? null : (o.surprise || null);
    r.seed = (rng.next() * 4294967296) >>> 0;
    return r;
  }

  // ---------------- self-check ----------------
  /* SP.Pictures.validate is the slow part of a round (≈ 4 ms); builds are pure, so the verdict is cached per build key. */
  var PV = {}, PVn = 0;
  function picValid(r) {
    var k = r.pic.id + '|' + r.pic.parts.map(function (p) { return p.id + ':' + p.nameValue + ':' + (p.size || '') + ':' + Math.round(p.cx) + ',' + Math.round(p.cy); }).join(';');
    if (PV[k] === undefined) { if (++PVn > 4000) { PV = {}; PVn = 1; } PV[k] = SP.Pictures.validate(r.pic) || ''; }
    return PV[k] || null;
  }
  var MODES = { colors: 'pickColor', size: 'tapPart', animals: 'tapPart', initial: 'tapPart', count: 'count', letters: 'tapPart', lower: 'tapPart', add: 'tapPart', sub: 'tapPart', oddeven: 'count' };
  /** null when the round is completable and follows every rule (DESIGN §5.1 / §3), else the reason. */
  function validate(r) {
    if (!r || !r.pic || !r.pic.parts || !r.steps) return 'no picture / steps';
    var pic = r.pic, i, j, byId = {}, cs = [];
    if (SP.Pictures && SP.Pictures.validate) { var pv = picValid(r); if (pv) return 'picture: ' + pv; }
    if (pic.parts.length > 14) return pic.parts.length + ' parts > 14';
    for (i = 0; i < pic.parts.length; i++) {
      var p = pic.parts[i];
      if (!p.id || byId[p.id]) return 'part id ' + p.id;
      byId[p.id] = p;
    }
    var n = r.steps.length;
    if (n < 1 || n > MAX_STEPS) return n + ' steps';
    if (r.roundIndex === 0 && n !== 1) return 'warm-up has ' + n + ' steps';
    if (r.age <= 3 && n > 2) return 'age 3: ' + n + ' steps';
    if (r.roundIndex > 0 && n < 2 && r.steps[0].mode !== 'count' && !(r.short && r.age <= 4)) return 'later round with 1 step';
    if (r.short && n > (r.age <= 4 ? 1 : 2)) return 'short round with ' + n + ' steps';
    if (n > stepCap(r.level, r.age)) return 'first chapter round with ' + n + ' steps at age ' + r.age;
    var wantMode = r.topic === 'shapes' ? (r.age >= 5 ? 'pickTap' : 'tapPart') : MODES[r.topic];
    var painted = {};
    for (i = 0; i < n; i++) {
      var s = r.steps[i];
      if (s.mode !== wantMode) return 'step mode ' + s.mode + ' ≠ ' + wantMode;
      if (!s.color || !SP.PALETTE[s.color]) return 'step colour ' + s.color;
      cs.push(s.color);
      if (!s.targets || !s.targets.length) return 'step without targets';
      var seen = {};
      for (j = 0; j < s.targets.length; j++) {
        var tp = byId[s.targets[j]];
        if (!tp) return 'target ' + s.targets[j] + ' does not exist';
        if (seen[tp.id]) return 'duplicate target';
        seen[tp.id] = 1;
        if (painted[tp.id]) return 'target ' + tp.id + ' painted twice';
        if (tp.role !== s.role) return 'target role ' + tp.role + ' ≠ ' + s.role;
      }
      if (!s.promptKey || !s.params) return 'step prompt';
      if (s.mode === 'count') {
        if (!(s.need >= 1) || s.need > s.targets.length) return 'count need ' + s.need + ' of ' + s.targets.length;
        if (r.topic === 'count') {
          var spots = pic.parts.filter(function (q) { return q.role === 'spot'; }).length;
          if (spots !== s.targets.length) return 'count targets ≠ spots';
          if (spots < Math.min(MAX_SPOTS, spotsFor(s.need))) return 'not enough spots: ' + spots + ' for ' + s.need;
          if (s.params.n !== s.need) return 'count prompt n';
          if (r.roundIndex === 0 && s.need > 2) return 'count warm-up N ' + s.need;
          if (r.roundIndex === 1 && (s.need < 2 || s.need > 3)) return 'count round 1 N ' + s.need;
          if (r.age <= 4 && s.need > 5) return 'count N ' + s.need + ' at age ' + r.age;
          if (s.need > 12) return 'count N > 12';
        } else {   // oddeven: targets = exactly the labels of that parity, at least one other label
          var labs = pic.parts.filter(function (q) { return q.role === 'label'; });
          var ok = labs.filter(function (q) { return parityOf(+q.nameValue) === s.params.parity; }).map(function (q) { return q.id; }).sort().join();
          if (ok !== s.targets.slice().sort().join()) return 'oddeven targets ≠ the ' + s.params.parity + ' labels';
          if (s.need !== s.targets.length) return 'oddeven need';
          if (labs.length - s.targets.length < 1) return 'oddeven without a wrong label';
        }
        for (j = 0; j < s.targets.length; j++) painted[s.targets[j]] = 1;   // a count step may paint any of them: reserve all
      } else {
        if (s.targets.length !== 1) return 'tap step with ' + s.targets.length + ' targets';
        var T0 = byId[s.targets[0]];
        // the target is the only part of its role with that name (size: with that size)
        var twins = pic.parts.filter(function (q) { return q.role === T0.role && q.id !== T0.id && String(q.nameValue) === String(T0.nameValue) && (q.size || '') === (T0.size || ''); });
        if (twins.length) return 'target ' + T0.nameValue + ' is not unique';
        painted[T0.id] = 1;
        if (r.topic === 'size' && s.nameValue !== T0.size) return 'size step name';
        if (r.topic === 'initial') {
          var L1 = initialOf(T0.nameValue, r.lang);
          if (s.params.letter !== L1) return 'initial letter';
          var same = pic.parts.filter(function (q) { return q.role === 'animal' && q.id !== T0.id && initialOf(q.nameValue, r.lang) === L1; });
          if (same.length) return 'two animals start with ' + L1;
        }
        if ((r.topic === 'add' || r.topic === 'sub') && (r.topic === 'add' ? s.a + s.b : s.a - s.b) !== +T0.nameValue) return 'arithmetic target';
        if ((r.topic === 'add' || r.topic === 'sub') && (+T0.nameValue < 0 || s.a > (r.topic === 'sub' ? SUB_MAX : 20))) return 'arithmetic range';
        if (r.topic === 'lower' && /[il]/.test(String(T0.nameValue))) return 'lower-case i / l';
      }
    }
    // step colours distinct within a round (each step looks different)
    for (i = 0; i < cs.length; i++) for (j = i + 1; j < cs.length; j++) if (cs[i] === cs[j]) return 'two steps in ' + cs[i];
    if (r.palette) {
      if (r.steps[0].mode !== 'pickColor' && r.steps[0].mode !== 'pickTap') return 'palette in a ' + r.steps[0].mode + ' round';
      if (r.palette.length < 2 || r.palette.length > 5) return 'palette size';
      for (i = 0; i < r.palette.length; i++) { if (!SP.PALETTE[r.palette[i]]) return 'bad palette colour'; if (r.palette.indexOf(r.palette[i]) !== i) return 'palette repeats'; }
      for (i = 0; i < cs.length; i++) if (r.palette.indexOf(cs[i]) < 0) return 'step colour not in the palette';
      var wantP = paletteSize(r.topic, r.age, r.roundIndex, r.level);
      if (r.palette.length !== wantP) return 'palette ' + r.palette.length + ' ≠ ' + wantP;
      cs = cs.concat(r.palette);
    } else if (wantMode === 'pickColor' || wantMode === 'pickTap') return 'pick round without palette';
    if (r.age < COLOR_SAFE_BELOW) {
      var uniq = cs.filter(function (x, q) { return cs.indexOf(x) === q; });
      if (clash(uniq) || uniq.indexOf('pink') >= 0) return 'colour clash in ' + uniq.join('+');
    }
    // distinct names within the picture: shapes / animals / labels (size: the same animal big + small)
    var roles = { shape: 'shapes', animal: 'scene', label: 'labels' };
    for (var role in roles) {
      var ps = pic.parts.filter(function (q) { return q.role === role; }), names = ps.map(function (q) { return String(q.nameValue) + (r.topic === 'size' ? q.size : ''); });
      for (i = 0; i < names.length; i++) if (names.indexOf(names[i]) !== i) return 'two ' + role + 's named ' + names[i];
    }
    if (r.topic === 'size') {
      var an = pic.parts.filter(function (q) { return q.role === 'animal'; });
      if (an.length !== 2 || an[0].nameValue !== an[1].nameValue || [an[0].size, an[1].size].sort().join() !== 'big,small') return 'size picture';
    }
    if (r.topic === 'shapes') {
      var sh = pic.parts.filter(function (q) { return q.role === 'shape'; }), want = r.age <= 3 ? 2 : r.age === 4 ? 3 : 4;
      if (sh.length < want) return sh.length + ' shapes < ' + want;
      var pool = shapesFor(r.age);
      for (i = 0; i < sh.length; i++) if (pool.indexOf(sh[i].nameValue) < 0) return 'shape ' + sh[i].nameValue + ' at age ' + r.age;
    }
    if (r.topic === 'animals') {
      var na = pic.parts.filter(function (q) { return q.role === 'animal'; }).length, wa = r.age <= 3 ? 2 : r.age === 4 ? 3 : 4;
      if (na < wa) return na + ' animals < ' + wa;
    }
    if (r.topic === 'colors' && pic.parts.filter(function (q) { return q.role === 'part'; }).length < 2) return 'colours picture with < 2 parts';
    if (['letters', 'lower', 'add', 'sub'].indexOf(r.topic) >= 0 && pic.parts.filter(function (q) { return q.role === 'label'; }).length < 3) return '< 3 labels';
    return null;
  }

  // ---------------- Talk time ----------------
  function choicesFrom(rng, answer, pool, count, mk) {
    var vals = [answer], p2 = rng.shuffle(pool.filter(function (v) { return v !== answer; }));
    for (var i = 0; vals.length < count && i < p2.length; i++) if (vals.indexOf(p2[i]) < 0) vals.push(p2[i]);
    rng.shuffle(vals);
    var ch = [], ans = null;
    for (var j = 0; j < vals.length; j++) { ch.push({ id: 'c' + j, thing: mk(vals[j]), value: vals[j] }); if (vals[j] === answer) ans = 'c' + j; }
    return { choices: ch, answer: ans };
  }
  /**
   * makeTalk(topic, { age, lang, rng }) → { topic, promptKey 'talk.<topic>', params, show, choices [{id, thing, value}], answer }
   *   colors  "Which one is {color}?"            show null,                choices blobs
   *   shapes  "Where is the {shape}?"           show null,                choices shapes (one colour)
   *   size    "Which {animal} is {size}?"       show null,                choices 'size' things (big / small)
   *   animals "Where is the {animal}?"          show null,                choices animals
   *   count   "How many {spot} are there?" {n, spot:'bubble'}  show dots {n}, choices numbers
   *   letters "Where is the letter {letter}?"   show null,                choices letters
   *   lower   "Find small {small}" {letter, small}  show letter (capital), choices small letters
   *   initial "Which letter does {word} start with?" {animal, letter}  show animal, choices letters
   *   add/sub "What is {a} + {b}?" {a, b}       show null,                choices numbers
   *   oddeven "Which number is {parity}?"       show null,                choices numbers (exactly one of that parity)
   */
  function makeTalk(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new SP.RNG(1);
    var show = null, params = {}, ch, a, nC = age <= 3 ? 2 : 3;
    switch (topic) {
      case 'colors': {
        var set = colourSet(rng, age, 3); a = set[0]; params = { color: a };
        ch = choicesFrom(rng, a, set, nC, function (c) { return { kind: 'blob', color: c }; }); break;
      }
      case 'shapes': {
        var col = rng.pick(COLORS); a = rng.pick(shapesFor(age)); params = { shape: a };
        ch = choicesFrom(rng, a, shapesFor(age), nC, function (s) { return { kind: 'shape', shape: s, color: col }; }); break;
      }
      case 'size': {
        var an = rng.pick(SP.SEA_ANIMALS), c2 = rng.pick(COLORS); a = rng.pick(['big', 'small']); params = { size: a, animal: an };
        ch = choicesFrom(rng, a, ['big', 'small'], 2, function (s) { return { kind: 'size', size: s, animal: an, color: c2 }; }); break;
      }
      case 'animals': {
        a = rng.pick(SP.SEA_ANIMALS); params = { animal: a };
        ch = choicesFrom(rng, a, SP.SEA_ANIMALS, nC, function (x) { return { kind: 'animal', animal: x }; }); break;
      }
      case 'count': {
        var rr = { 3: [1, 4], 4: [1, 5], 5: [2, 8], 6: [3, 10], 7: [3, 10] }[age];
        a = rng.int(rr[0], rr[1]); params = { n: a, spot: 'bubble' }; show = { kind: 'dots', n: a };
        var near = range(Math.max(1, a - 3), a + 3).filter(function (x) { return x !== a; });
        ch = choicesFrom(rng, a, near, 3, function (x) { return { kind: 'number', n: x }; }); break;
      }
      case 'letters': case 'lower': {
        var P = letterPool(lang, topic); a = rng.pick(P);
        if (topic === 'lower') { params = { letter: a, small: a.toLowerCase() }; show = { kind: 'letter', text: a }; }
        else params = { letter: a };
        ch = choicesFrom(rng, a, P, 3, function (x) { return { kind: 'letter', text: topic === 'lower' ? x.toLowerCase() : x }; }); break;
      }
      case 'initial': {
        var an2 = rng.pick(SP.SEA_ANIMALS); a = initialOf(an2, lang);
        show = { kind: 'animal', animal: an2 }; params = { animal: an2, letter: a };   // i18n derives {word} from the animal
        var lp = LETTER_POOL[lang].split('').filter(function (x) { return x !== a; });
        ch = choicesFrom(rng, a, lp, 3, function (x) { return { kind: 'letter', text: x }; }); break;
      }
      case 'add': {
        var hi = ADD_MAX[age] || 10, k;
        a = rng.int(age >= 7 ? 4 : 2, hi); k = rng.int(1, a - 1); params = { a: k, b: a - k };
        ch = choicesFrom(rng, a, nearNums(a, 1, hi + 2, 4, rng), 3, function (x) { return { kind: 'number', n: x }; }); break;
      }
      case 'sub': {
        a = rng.int(0, 9); var kk = rng.int(1, 10 - a); params = { a: a + kk, b: kk };
        ch = choicesFrom(rng, a, nearNums(a, 0, 10, 4, rng), 3, function (x) { return { kind: 'number', n: x }; }); break;
      }
      case 'oddeven': {
        var par = rng.pick(['odd', 'even']); params = { parity: par };
        var hiO = ODDEVEN_MAX[age] || 12;
        a = rng.pick(range(1, hiO).filter(function (x) { return parityOf(x) === par; }));
        var others = range(1, hiO).filter(function (x) { return parityOf(x) !== par; });
        ch = choicesFrom(rng, a, others, 3, function (x) { return { kind: 'number', n: x }; }); break;
      }
      default: throw new Error('SP.Content: unknown topic ' + topic);
    }
    return { topic: topic, promptKey: 'talk.' + topic, params: params, show: show, choices: ch.choices, answer: ch.answer, answerId: ch.answer };
  }

  /** 4 chapter topics for a session, easiest first. Without rng or `last`: SP.AGE_TOPICS (the first session). With both:
   *  chapter 1 = the pool topic left out last time (else the easiest one that did not open last time); chapters 2–4 =
   *  3 of the others (preferring topics left out of `last`), in pool (difficulty) order. */
  function topicsFor(age, rng, last) {
    age = ageOf(age);
    last = Array.isArray(last) ? last : [];
    if (!rng || !last.length) return SP.AGE_TOPICS[age].slice();
    var pool = SP.AGE_POOLS[age].slice(), ord = function (a, b) { return pool.indexOf(a) - pool.indexOf(b); };
    var unused = pool.filter(function (t) { return last.indexOf(t) < 0; });
    var first = unused.length ? unused[0] : pool[0];
    if (!unused.length) for (var i = 0; i < pool.length; i++) if (pool[i] !== last[0]) { first = pool[i]; break; }
    var rest = pool.filter(function (t) { return t !== first; });
    var fresh = rng.shuffle(rest.filter(function (t) { return last.indexOf(t) < 0; }));
    var old = rng.shuffle(rest.filter(function (t) { return last.indexOf(t) >= 0; }));
    return [first].concat(fresh.concat(old).slice(0, 3).sort(ord));
  }

  SP.Content = {
    makeRound: makeRound, makeTalk: makeTalk, validate: validate, roundKey: roundKey, topicsFor: topicsFor, ageOf: ageOf, langOf: langOf,
    clash: clash, safeSetsOf: safeSetsOf, shapesFor: shapesFor, parityOf: parityOf, letterPool: letterPool, initialOf: initialOf,
    capOf: capOf, templatesFor: templatesFor, countN: countN, spotsFor: spotsFor, paletteSize: paletteSize, easyPalette: easyPalette,
    /** Most shells a round of this age can show (layout planning). */
    maxShells: function (age) { return ageOf(age) >= 5 ? 4 : ageOf(age) === 4 ? 3 : 2; },
    TOPICS: ALL_TOPICS, KIND_OF: KIND_OF, COLORS: COLORS, COLORS5: COLORS5, SHAPES4: SHAPES4, LETTER_POOL: LETTER_POOL, CLASH: CLASH,
    COLOR_SAFE_BELOW: COLOR_SAFE_BELOW, MAX_SPOTS: MAX_SPOTS, MAX_STEPS: MAX_STEPS, ADD_MAX: ADD_MAX, SUB_MAX: SUB_MAX, ODDEVEN_MAX: ODDEVEN_MAX
  };
})(window.SP = window.SP || {});
