/* Bun's Dino Dig — DD.PALETTE, DD.COLORS, DD.SHAPES, DD.ANIMALS, DD.AGE_TOPICS, DD.AGE_POOLS, DD.TOY_WORDS, DD.Content
 * (pure + deterministic; DESIGN §5.1)
 *
 *   DD.Content.makeRound(topic, { age, lang, rng, roundIndex, level, surprise, short?, prevKey?, prevN? }) → round  (self-checked)
 *   DD.Content.makeTalk(topic,  { age, lang, rng }) → talk
 *   DD.Content.validate(round) → null | 'reason'
 *   DD.Content.topicsFor(age, rng?, lastTopics?) → the 4 chapter topics (easiest first)
 *   DD.Content.matches(round, step, thing) → bool (does this thing answer this step)
 *   DD.Content.retarget(round, stepIndex, buriedIds) → a replacement find step for a still-buried mound | null
 *
 * round = { topic, age, lang, roundIndex, level, surprise: null|'mole'|'ptero', short, scoops (2 at age 3 and in count rounds, else 3),
 *           mounds: [{ id: 'm0'…, thing }]  (order = slot order), steps: [step], key (the set, order-free), seed }
 * thing = { kind 'egg'|'stone'|'bone'|'toy'|'tablet', color?, shape?, animal?, text?, size? ('big'|'small', size topic only),
 *           nameKind, nameValue }   — nameKind / nameValue name the thing the way this round's question is about:
 *   egg → 'color' / red · stone → 'shape' / star (+ color) · bone → 'bone' / 'bone' (size topic: 'size' / big) ·
 *   toy → 'animal' / duck · tablet → 'letter' / 'B' | 'b' or 'number' / 7
 * step  = { mode 'find'|'count'|'findAll', targets [moundId], need, promptKey, params, nameKind, nameValue }
 *   find:    targets = the ONE right mound (need 1). Every other mound answers it NO (exactly one match).
 *   count:   targets = every bone mound; need = N (< mounds: at least one spare stays buried).
 *   findAll: targets = every mound of that parity (2–3); need = targets.length; ≥ 1 other mound.
 * Prompt keys / params: p.colors {color} · p.shapes {shape} · p.shapes5 {shape, color} · p.size {size, kind} · p.animals {animal} ·
 *   p.count {n} · p.letters {letter} · p.lower {letter (CAPITAL shown), small} · p.initial {letter, animal} · p.add {a, b} ·
 *   p.sub {a, b} · p.oddeven {parity}
 * talk  = { topic, promptKey 'talk.<topic>', params, show: icon | null, choices [{ id, thing: icon, value }], answer, answerId }
 *   icon = DigArt.drawIcon kinds: egg {color} · blob {color} · stone {shape, color} · toy {animal} · bone {} · number {n} ·
 *          letter {text} · dots {n} · size {size, of: 'bone'|'egg', color?} · dino {color}
 */
(function (DD) {
  'use strict';

  // DESIGN §3 answer palette (exact hex)
  DD.PALETTE = {
    red:    { base: '#E84A4A', dark: '#A8282E', light: '#F7A0A0' },
    blue:   { base: '#3C8DE8', dark: '#1F5BA8', light: '#A6CCF5' },
    yellow: { base: '#FFD23F', dark: '#C99A12', light: '#FFEB9C' },
    green:  { base: '#4CC26B', dark: '#2A8343', light: '#A8E6B8' },
    orange: { base: '#FF9A2E', dark: '#C4650C', light: '#FFCB8E' },
    purple: { base: '#8E44AD', dark: '#6840A8', light: '#D2BDF3' },
    pink:   { base: '#FF8FC0', dark: '#C9558A', light: '#FFCCE2' }      // an answer colour from age 5
  };
  for (var pk in DD.PALETTE) DD.PALETTE[pk].fill = DD.PALETTE[pk].base;
  DD.COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  var COLORS = DD.COLORS.slice(0, 6), COLORS5 = DD.COLORS.slice();
  DD.SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
  DD.ANIMALS = ['duck', 'cat', 'dog', 'cow', 'pig', 'frog', 'lion', 'elephant'];
  DD.THING_KINDS = ['egg', 'stone', 'bone', 'toy', 'tablet'];

  DD.AGE_TOPICS = {
    3: ['colors', 'shapes', 'size', 'animals'],
    4: ['colors', 'shapes', 'count', 'animals'],
    5: ['shapes', 'count', 'letters', 'animals'],
    6: ['lower', 'initial', 'add', 'count'],
    7: ['initial', 'add', 'sub', 'oddeven']
  };
  /* Every age has a POOL of 5 topics in difficulty order; a session plays 4 of them (rotating between sessions). */
  DD.AGE_POOLS = {
    3: ['colors', 'shapes', 'size', 'animals', 'count'],
    4: ['colors', 'size', 'shapes', 'count', 'animals'],
    5: ['colors', 'shapes', 'count', 'letters', 'animals'],
    6: ['letters', 'lower', 'initial', 'add', 'count'],
    7: ['count', 'initial', 'add', 'sub', 'oddeven']
  };
  var ALL_TOPICS = ['colors', 'shapes', 'size', 'animals', 'count', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];

  // ---- tables (DESIGN §5.1)
  var MAX_MOUNDS = 8;          // every supported viewport holds 8 mounds at the largest item size (tests/unit: layout capacity)
  var SHAPES3 = ['circle', 'square', 'triangle', 'star', 'heart'];   // age 3; all 8 from age 4
  var SHAPE_PAIRS = [['square', 'rect'], ['circle', 'oval'], ['square', 'diamond']];   // never together in one round
  var LETTER_POOL = { en: 'ABCDEFGHIKLMNOPRSTUW', vi: 'ABCDEGHIKLMNOPSTUVXY' };
  var LOWER_SKIP = 'IL';                                             // capital I and small l look alike
  var LOWER_PAIRS = [['b', 'd'], ['p', 'q'], ['b', 'p'], ['d', 'q'], ['m', 'w'], ['n', 'u']];   // mirror-confusable small letters
  var ADD_MAX = { 5: 10, 6: 10, 7: 20 }, SUB_MAX = 10, ODDEVEN_MAX = { 5: 10, 6: 12, 7: 20 };
  var SIZE_K = { big: 1.25, small: 0.72 };
  /* 'initial' words (toy animals). VI without the classifier "con". */
  DD.TOY_WORDS = {
    en: { duck: 'duck', cat: 'cat', dog: 'dog', cow: 'cow', pig: 'pig', frog: 'frog', lion: 'lion', elephant: 'elephant' },
    vi: { duck: 'vịt', cat: 'mèo', dog: 'chó', cow: 'bò', pig: 'heo', frog: 'ếch', lion: 'sư tử', elephant: 'voi' }
  };
  function langOf(l) { return l === 'vi' ? 'vi' : 'en'; }
  /** The initial letter of the toy's word (capital, tone marks dropped), or null when it is not in that language's letter pool
   *  (VI "ếch" starts with Ê, which the game does not teach as a separate letter yet → the frog is left out in VI). */
  function initialOf(animal, lang) {
    var w = DD.TOY_WORDS[langOf(lang)][animal];
    if (!w) return null;
    var c = w.charAt(0).normalize('NFD');
    if (c.length > 1) return null;   // a letter with a mark (ê, ơ, ư …)
    c = c.toUpperCase();
    return LETTER_POOL[langOf(lang)].indexOf(c) >= 0 ? c : null;
  }

  /* Colour-blind / toddler safety (DESIGN §3 + QA visual P1-3): below age 5 one round never holds blue+purple, red+green,
   * yellow+orange, green+orange or red+orange (every coloured thing: eggs, stones), and no pink. In the night chapter (level
   * % 4 = 3, the colours darken) at ANY age also never red+pink, blue+purple or red+orange. */
  var COLOR_SAFE_BELOW = 5;
  var CLASH = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange'], ['red', 'orange']];
  var NIGHT_CLASH = [['red', 'pink'], ['blue', 'purple'], ['red', 'orange']];
  function isNight(level) { return level !== undefined && level !== null && level % 4 === 3; }
  function pairsFor(age, level) { return (age < COLOR_SAFE_BELOW ? CLASH : []).concat(isNight(level) ? NIGHT_CLASH : []); }
  function clash(cs, pairs) {
    pairs = pairs || CLASH;
    for (var i = 0; i < pairs.length; i++) if (cs.indexOf(pairs[i][0]) >= 0 && cs.indexOf(pairs[i][1]) >= 0) return true;
    return false;
  }
  var SETS = {};
  /** Every clash-free set of n colours for this age / chapter (cached). */
  function safeSets(age, level, n) {
    var key = (age < COLOR_SAFE_BELOW ? 'y' : 'o') + (isNight(level) ? 'n' : 'd') + n;
    if (SETS[key]) return SETS[key];
    var pool = age < COLOR_SAFE_BELOW ? COLORS : COLORS5, pr = pairsFor(age, level), out = [];
    for (var m = 1; m < (1 << pool.length); m++) {
      var cs = pool.filter(function (c, i) { return m & (1 << i); });
      if (cs.length === n && !clash(cs, pr)) out.push(cs);
    }
    return (SETS[key] = out);
  }
  function safeSetsOf(n) { return safeSets(3, 0, n); }
  /** The most distinct colours one round can hold (3 below age 5; 5 at night from age 5; 7 otherwise). */
  function maxSafe(age, level) { var n = 1; while (n < 7 && safeSets(age, level, n + 1).length) n++; return n; }
  var SAFE_MAX = 3;

  function ageOf(a) { a = Math.round(+a || 4); return a < 3 ? 3 : a > 7 ? 7 : a; }
  function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }
  function shapesFor(age) { return age <= 3 ? SHAPES3.slice() : DD.SHAPES.slice(); }
  function pairBad(list, pairs) {
    for (var i = 0; i < pairs.length; i++) if (list.indexOf(pairs[i][0]) >= 0 && list.indexOf(pairs[i][1]) >= 0) return pairs[i];
    return null;
  }
  /** k distinct shapes for this age, never a confusable pair. */
  function shapeSet(rng, age, k) {
    for (var t = 0; t < 200; t++) { var s = rng.sample(shapesFor(age), k); if (!pairBad(s, SHAPE_PAIRS)) return s; }
    return ['circle', 'triangle', 'star', 'heart', 'square'].slice(0, k);
  }
  function letterPool(lang, topic) {
    var P = LETTER_POOL[langOf(lang)].split('');
    return topic === 'lower' ? P.filter(function (c) { return LOWER_SKIP.indexOf(c) < 0; }) : P;
  }
  function parityOf(n) { return n % 2 ? 'odd' : 'even'; }
  /** k distinct colours, clash-free for this age and chapter (below age 5: k ≤ 3, never pink). */
  function colourSet(rng, age, k, level) {
    var n = Math.min(k, maxSafe(age, level));
    return rng.shuffle(rng.pick(safeSets(age, level, n)).slice()).slice(0, k);
  }

  // ---------------- things ----------------
  function egg(c) { return { kind: 'egg', color: c, nameKind: 'color', nameValue: c }; }
  function stone(s, c) { return { kind: 'stone', shape: s, color: c, nameKind: 'shape', nameValue: s }; }
  function bone() { return { kind: 'bone', nameKind: 'bone', nameValue: 'bone' }; }
  function toy(a) { return { kind: 'toy', animal: a, nameKind: 'animal', nameValue: a }; }
  function tablet(text, kind) { return { kind: 'tablet', text: String(text), nameKind: kind, nameValue: kind === 'number' ? +text : String(text) }; }
  function thingKey(t) { return [t.kind, t.color || '', t.shape || '', t.animal || '', t.text || '', t.size || ''].join(':'); }
  function setKey(things) { return things.map(thingKey).sort().join(','); }
  /** The round's set of things, order-free (count rounds also by N: 6 of 8 bones ≠ 7 of 8). */
  function roundKey(r) { var k = setKey(r.mounds.map(function (q) { return q.thing; })); return r.steps[0] && r.steps[0].mode === 'count' ? k + '#' + r.steps[0].need : k; }

  // ---------------- counts ----------------
  /** Mounds for a find round (DESIGN §5.1). Warm-up 2 (≤ 4) / 3 (5+); level 0 at ages ≤ 4: ≤ 3; later 2–3 / 3–4 / 4–5 / 4–6. */
  function moundsFor(rng, age, ri, level) {
    if (ri === 0) return age <= 4 ? 2 : 3;
    var lo = age <= 3 ? 2 : age === 4 ? 3 : 4, hi = age <= 3 ? 3 : age === 4 ? 4 : age === 5 ? 5 : 6;
    if (level === 0 && age <= 4) hi = Math.min(hi, 3);
    return rng.int(Math.min(lo, hi), hi);
  }
  /** Steps for a find round: warm-up 1; level 0 (ages ≤ 4) 1; short (a long chapter, ages ≤ 4) 1; ages 3–4: 1–2 (p2 = 2 steps);
   *  5+: 2. Always at least one more mound than steps (the last ask still has a choice). */
  var P_TWO = { 3: 0.35, 4: 0.5 };
  function stepsFor(rng, age, ri, level, short, nMounds) {
    var k;
    if (ri === 0 || (level === 0 && age <= 4) || (short && age <= 4)) k = 1;
    else if (age <= 4) k = rng.chance(P_TWO[age]) ? 2 : 1;
    else k = 2;
    return Math.max(1, Math.min(k, nMounds - 1));
  }
  /** count N (DESIGN §5.1, capped so N + spares ≤ MAX_MOUNDS): round 0 1–2, round 1 2–3, later 3–5 (≤ 4) / 4–7 (5) / 5–7 (6+);
   *  level 0 at ages ≤ 4: 1–2 / 2–3 / 2–3. Never the same N as the previous round when another value fits. */
  function countRange(age, ri, level) {
    var lo, hi;
    if (ri === 0) { lo = 1; hi = 2; } else if (ri === 1) { lo = 2; hi = 3; } else if (age <= 4) { lo = 3; hi = 5; } else if (age === 5) { lo = 4; hi = 7; } else { lo = 5; hi = 7; }
    if (level === 0 && age <= 4) { hi = Math.min(hi, 3); lo = Math.min(lo, ri === 0 ? 1 : 2); }   // easy chapter: 2–3 later (varies)
    return [lo, hi];
  }
  function countSpares(N, age, level) { return level === 0 && age <= 4 ? 1 : Math.min(2, MAX_MOUNDS - N); }
  function nearNums(ans, lo, hi, k, rng) {
    var c = rng.shuffle(range(lo, hi).filter(function (x) { return x !== ans && Math.abs(x - ans) <= 4; }));
    if (c.length < k) c = c.concat(rng.shuffle(range(lo, hi).filter(function (x) { return x !== ans && c.indexOf(x) < 0; })));
    return c.slice(0, k);
  }
  function S(mode, targets, need, promptKey, params, nameKind, nameValue) {
    return { mode: mode, targets: targets, need: need, promptKey: promptKey, params: params, nameKind: nameKind, nameValue: nameValue };
  }
  function ids(n) { return range(0, n - 1).map(function (i) { return 'm' + i; }); }

  // ---------------- matching (one rule per topic; the world judges by step.targets, the tests check targets = matches) ----------------
  function matches(r, s, t) {
    var p = s.params || {};
    switch (r.topic) {
      case 'colors': return t.kind === 'egg' && t.color === p.color;
      case 'shapes': return t.kind === 'stone' && t.shape === p.shape && (s.promptKey !== 'p.shapes5' || t.color === p.color);
      case 'size': return t.size === p.size && t.kind === p.kind;
      case 'animals': return t.kind === 'toy' && t.animal === p.animal;
      case 'initial': return t.kind === 'toy' && initialOf(t.animal, r.lang) === p.letter;
      case 'count': return t.kind === 'bone';
      case 'letters': return t.kind === 'tablet' && t.text === p.letter;
      case 'lower': return t.kind === 'tablet' && t.text === p.small;
      case 'add': return t.kind === 'tablet' && +t.text === p.a + p.b;
      case 'sub': return t.kind === 'tablet' && +t.text === p.a - p.b;
      case 'oddeven': return t.kind === 'tablet' && parityOf(+t.text) === p.parity;
    }
    return false;
  }
  /** The find step that asks for mound `m` of round r (the prompt follows from the thing), or null when the thing cannot be
   *  asked uniquely in this round. */
  function stepFor(r, m) {
    var t = m.thing, s;
    switch (r.topic) {
      case 'colors': s = S('find', [m.id], 1, 'p.colors', { color: t.color }, 'color', t.color); break;
      case 'shapes':
        s = r.age >= 5 ? S('find', [m.id], 1, 'p.shapes5', { shape: t.shape, color: t.color }, 'shape', t.shape)
          : S('find', [m.id], 1, 'p.shapes', { shape: t.shape }, 'shape', t.shape);
        break;
      case 'size': s = S('find', [m.id], 1, 'p.size', { size: t.size, kind: t.kind }, 'size', t.size); break;
      case 'animals': s = S('find', [m.id], 1, 'p.animals', { animal: t.animal }, 'animal', t.animal); break;
      case 'initial': { var L0 = initialOf(t.animal, r.lang); if (!L0) return null; s = S('find', [m.id], 1, 'p.initial', { letter: L0, animal: t.animal }, 'letter', L0); break; }
      case 'letters': s = S('find', [m.id], 1, 'p.letters', { letter: t.text }, 'letter', t.text); break;
      case 'lower': s = S('find', [m.id], 1, 'p.lower', { letter: t.text.toUpperCase(), small: t.text }, 'letter', t.text); break;
      default: return null;
    }
    var n = 0;
    for (var i = 0; i < r.mounds.length; i++) if (matches(r, s, r.mounds[i].thing)) n++;
    if (n !== 1) return null;
    if (s.promptKey === 'p.shapes5' && !shapes5Ok(r, m)) return null;
    return s;
  }
  /** shapes5: the target shares its colour with another stone and its shape with another stone (both are needed). */
  function shapes5Ok(r, m) {
    var c = 0, sh = 0;
    r.mounds.forEach(function (q) { if (q.id === m.id) return; if (q.thing.color === m.thing.color) c++; if (q.thing.shape === m.thing.shape) sh++; });
    return c >= 1 && sh >= 1;
  }

  // ---------------- rounds ----------------
  function buildRound(topic, age, lang, rng, ri, level, short, prevN) {
    var things = [], steps = [], n, k, i, cols, picks;
    var r = { topic: topic, age: age, lang: lang, roundIndex: ri, level: level, short: !!short, surprise: null, scoops: age <= 3 || topic === 'count' ? 2 : 3, mounds: null, steps: steps };
    function finish(order) {
      r.mounds = ids(things.length).map(function (id, j) { return { id: id, thing: things[j] }; });
      // find rounds: the targets are chosen among the mounds (order = picks), then the steps follow from the things
      if (order) for (var q = 0; q < order.length; q++) { var st = stepFor(r, r.mounds[order[q]]); if (st) steps.push(st); }
    }
    switch (topic) {
      case 'colors': {
        n = moundsFor(rng, age, ri, level);
        n = Math.min(n, maxSafe(age, level));
        cols = colourSet(rng, age, n, level);
        things = cols.map(egg);
        k = stepsFor(rng, age, ri, level, short, n);
        finish(rng.sample(range(0, n - 1), k));
        break;
      }
      case 'shapes': {
        n = moundsFor(rng, age, ri, level);
        if (age < 5) {
          var col = colourSet(rng, age, 1, level)[0];
          things = shapeSet(rng, age, n).map(function (s) { return stone(s, col); });
          k = stepsFor(rng, age, ri, level, short, n);
          finish(rng.sample(range(0, n - 1), k));
        } else {   // shapes5: a 2 × 2 grid of shapes × colours (+ an extra stone) → the answer needs both
          var sh = shapeSet(rng, age, 3), cs = colourSet(rng, age, 3, level);
          var grid = [stone(sh[0], cs[0]), stone(sh[0], cs[1]), stone(sh[1], cs[0]), stone(sh[1], cs[1])];
          var gridT = [0, 1, 2, 3];
          if (n === 3) { grid.pop(); gridT = [0]; }
          if (n >= 5) grid.push(rng.chance(0.5) ? stone(sh[2], cs[rng.int(0, 1)]) : stone(sh[rng.int(0, 1)], cs[2]));
          var order = rng.shuffle(range(0, grid.length - 1));
          things = order.map(function (j) { return grid[j]; });
          var tg = rng.shuffle(gridT.map(function (g) { return order.indexOf(g); }));
          k = stepsFor(rng, age, ri, level, short, things.length);
          finish(tg.slice(0, k));
        }
        break;
      }
      case 'size': {
        var kind = rng.pick(['bone', 'egg', 'toy']), c1 = colourSet(rng, age, 1, level)[0], an = rng.pick(DD.ANIMALS);
        things = rng.shuffle(['big', 'small']).map(function (sz) {
          var t = kind === 'bone' ? bone() : kind === 'egg' ? egg(c1) : toy(an);
          t.size = sz; t.nameKind = 'size'; t.nameValue = sz;
          return t;
        });
        finish([rng.int(0, 1)]);
        break;
      }
      case 'animals': case 'initial': {
        n = moundsFor(rng, age, ri, level);
        var pool = DD.ANIMALS.slice();
        if (topic === 'initial') {   // animals with distinct initials in this language
          var byI = {};
          rng.shuffle(pool).forEach(function (a) { var c = initialOf(a, lang); if (c && !byI[c]) byI[c] = a; });
          pool = Object.keys(byI).map(function (c) { return byI[c]; });
        }
        n = Math.min(n, pool.length);
        things = rng.sample(pool, n).map(toy);
        k = stepsFor(rng, age, ri, level, short, n);
        finish(rng.sample(range(0, n - 1), k));
        break;
      }
      case 'count': {
        var rg = countRange(age, ri, level), vals = range(rg[0], rg[1]);
        if (prevN && vals.length > 1) vals = vals.filter(function (v) { return v !== prevN; });
        var N = rng.pick(vals), m = N + countSpares(N, age, level);
        things = range(1, m).map(bone);
        finish(null);
        steps.push(S('count', r.mounds.map(function (q) { return q.id; }), N, 'p.count', { n: N }, 'number', N));
        break;
      }
      case 'letters': case 'lower': {
        n = topic === 'letters' && ri > 0 && age === 5 ? 4 : moundsFor(rng, age, ri, level);   // age 5 letters: 3 (warm-up) / 4
        var LL;
        for (var tries = 0; tries < 100; tries++) {
          LL = rng.sample(letterPool(lang, topic), n).map(function (c) { return topic === 'lower' ? c.toLowerCase() : c; });
          if (topic !== 'lower' || !pairBad(LL, LOWER_PAIRS)) break;
        }
        things = LL.map(function (c) { return tablet(c, 'letter'); });
        k = stepsFor(rng, age, ri, level, short, n);
        finish(rng.sample(range(0, n - 1), k));
        break;
      }
      case 'add': case 'sub': {
        n = moundsFor(rng, age, ri, level);
        k = stepsFor(rng, age, ri, level, short, n);
        var probs = [], used = [];
        for (i = 0; i < k; i++) {
          var a, b, res, tr = 0;
          do {
            if (topic === 'add') { var top = ADD_MAX[age] || 10, hi = ri === 0 ? Math.min(6, top) : top; res = rng.int(2, hi); a = rng.int(1, res - 1); b = res - a; }
            else { res = rng.int(0, ri === 0 ? 5 : SUB_MAX - 1); b = rng.int(1, SUB_MAX - res); a = res + b; }
          } while (used.indexOf(res) >= 0 && ++tr < 50);
          used.push(res); probs.push({ a: a, b: b, res: res });
        }
        var hiN = topic === 'add' ? (ADD_MAX[age] || 10) : SUB_MAX, nums = used.slice();
        nearNums(used[0], topic === 'add' ? 1 : 0, hiN, n, rng).forEach(function (x) { if (nums.length < n && nums.indexOf(x) < 0) nums.push(x); });
        rng.shuffle(nums);
        things = nums.map(function (x) { return tablet(x, 'number'); });
        finish(null);
        for (i = 0; i < k; i++) {
          var j = nums.indexOf(probs[i].res);
          steps.push(S('find', [r.mounds[j].id], 1, 'p.' + topic, { a: probs[i].a, b: probs[i].b }, 'number', probs[i].res));
        }
        break;
      }
      case 'oddeven': {
        n = ri === 0 ? 3 : Math.max(4, moundsFor(rng, age, ri, level));
        var par = rng.pick(['odd', 'even']), hiO = ODDEVEN_MAX[age] || 12;
        var nRight = ri === 0 ? 2 : rng.int(2, Math.min(3, n - 1));
        var right = rng.sample(range(1, hiO).filter(function (x) { return parityOf(x) === par; }), nRight);
        var wrong = rng.sample(range(1, hiO).filter(function (x) { return parityOf(x) !== par; }), n - nRight);
        things = rng.shuffle(right.concat(wrong)).map(function (x) { return tablet(x, 'number'); });
        finish(null);
        var tgs = r.mounds.filter(function (q) { return parityOf(+q.thing.text) === par; }).map(function (q) { return q.id; });
        steps.push(S('findAll', tgs, tgs.length, 'p.oddeven', { parity: par }, 'parity', par));
        break;
      }
      default: throw new Error('DD.Content: unknown topic ' + topic);
    }
    r.key = roundKey(r);
    return r;
  }

  /**
   * makeRound(topic, { age, lang, rng, roundIndex, level, surprise, short?, prevKey?, prevN? }) → round. `prevKey` = the previous
   * round's key (the same set of things never comes twice in a row), `prevN` = the previous count round's N. `short` (the world
   * sets it when the chapter runs long): 1 step at ages ≤ 4. `level` 0 = the easy first chapter.
   */
  function makeRound(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new DD.RNG(1), ri = o.roundIndex || 0;
    var level = o.level === undefined || o.level === null ? 1 : o.level | 0;
    if (ALL_TOPICS.indexOf(topic) < 0) throw new Error('DD.Content: unknown topic ' + topic);
    var r = null, err = null;
    for (var attempt = 0; attempt < 80; attempt++) {
      try {
        r = buildRound(topic, age, lang, rng, ri, level, !!o.short, o.prevN || 0);
        err = validate(r);
        if (!err && o.prevKey && r.key === o.prevKey && attempt < 60) err = 'same set as the previous round';
        if (!err && attempt < 40 && sameAnswer(r, o.prevAns, o.prevAnsRun)) err = 'the same answer as the previous round';
      } catch (e) { r = null; err = e.message; }
      if (!err) break;
    }
    if (err) throw new Error('DD.Content: invalid round (' + topic + ', age ' + age + ', round ' + ri + '): ' + err);
    r.surprise = ri === 0 ? null : (o.surprise || null);
    r.seed = (rng.next() * 4294967296) >>> 0;
    return r;
  }

  /** QA playtest P2-1: the first ask of a round is not the answer asked last (size / odd-even have 2 answers: at most 2 in a row;
   *  shapes5 is exempt — its grid repeats shapes on purpose; count uses prevN). */
  function sameAnswer(r, prevAns, run) {
    var s = r.steps[0];
    if (prevAns === undefined || prevAns === null || !s || s.mode === 'count' || s.promptKey === 'p.shapes5') return false;
    if (String(s.nameValue) !== String(prevAns)) return false;
    return r.topic === 'size' || r.topic === 'oddeven' ? (run || 1) >= 2 : true;
  }

  /** A replacement for step `si` when its target was dug open earlier (a wrong dig in a previous step): the first still-buried
   *  mound that can be asked uniquely (shapes5: with its colour + shape partners). find rounds only; null = nothing left. */
  function retarget(r, si, buried) {
    var s = r.steps[si];
    if (!s || s.mode !== 'find') return null;
    var used = {};
    r.steps.forEach(function (q, j) { if (j < si) used[q.targets[0]] = 1; });
    var cand = r.mounds.filter(function (m) { return buried.indexOf(m.id) >= 0 && !used[m.id]; });
    for (var i = 0; i < cand.length; i++) {
      if (r.topic === 'add' || r.topic === 'sub') {   // arithmetic: any buried number b = a + b' (keep it in range)
        var v = +cand[i].thing.text, a, b;
        if (r.topic === 'add') { if (v < 2) continue; b = Math.max(1, Math.floor(v / 2)); a = v - b; }
        else { b = Math.min(SUB_MAX - v, Math.max(1, (v % 3) + 1)); a = v + b; if (b < 1) continue; }
        return S('find', [cand[i].id], 1, 'p.' + r.topic, { a: a, b: b }, 'number', v);
      }
      var st = stepFor(r, cand[i]);
      if (st) return st;
    }
    return null;
  }

  // ---------------- self-check ----------------
  /** null when the round is completable and follows every rule (DESIGN §5.1 / §3), else the reason. */
  function validate(r) {
    if (!r || !r.mounds || !r.steps) return 'no mounds / steps';
    var i, j, byId = {}, nM = r.mounds.length, age = r.age, ri = r.roundIndex, lvl0 = r.level === 0 && age <= 4;
    if (nM < 2 || nM > MAX_MOUNDS) return nM + ' mounds';
    for (i = 0; i < nM; i++) {
      var m = r.mounds[i], t = m.thing;
      if (!m.id || byId[m.id]) return 'mound id ' + m.id;
      byId[m.id] = m;
      if (!t || DD.THING_KINDS.indexOf(t.kind) < 0) return 'thing kind';
      if (!t.nameKind || t.nameValue === undefined) return 'thing name';
      if ((t.kind === 'egg' || t.kind === 'stone') && !DD.PALETTE[t.color]) return 'thing colour ' + t.color;
      if (t.kind === 'stone' && DD.SHAPES.indexOf(t.shape) < 0) return 'stone shape';
      if (t.kind === 'toy' && DD.ANIMALS.indexOf(t.animal) < 0) return 'toy animal';
      if (t.kind === 'tablet' && !(t.text && t.text.length)) return 'tablet text';
      if (t.size && !SIZE_K[t.size]) return 'thing size';
    }
    if (r.scoops !== (age <= 3 || r.topic === 'count' ? 2 : 3)) return 'scoops ' + r.scoops;
    var n = r.steps.length, mode0 = r.steps[0] && r.steps[0].mode;
    if (n < 1 || n > 2) return n + ' steps';
    if (ri === 0 && n !== 1) return 'warm-up has ' + n + ' steps';
    if (lvl0 && n !== 1) return 'first chapter round with ' + n + ' steps at age ' + age;
    var findR = mode0 === 'find';
    if (findR) {
      var lo = ri === 0 ? (age <= 4 ? 2 : 3) : age <= 3 ? 2 : age === 4 ? 3 : 4, hi = ri === 0 ? lo : age <= 3 ? 3 : age === 4 ? 4 : age === 5 ? 5 : 6;
      if (lvl0) hi = Math.min(hi, 3);
      if (r.topic === 'size') { lo = hi = 2; }
      if (r.topic === 'colors') hi = Math.min(hi, maxSafe(age, r.level)), lo = Math.min(lo, hi);
      if (r.topic === 'letters' && ri > 0 && age === 5) lo = hi = 4;
      if (nM < lo || nM > hi) return nM + ' mounds not in ' + lo + '–' + hi;
      if (n >= nM) return n + ' steps with ' + nM + ' mounds';
      if (age >= 5 && ri > 0 && !lvl0 && n !== 2 && r.topic !== 'size') return 'age ' + age + ' later round with ' + n + ' step';
      if (r.short && age <= 4 && n > 1) return 'short round with ' + n + ' steps';
    }
    var tgUsed = {};
    for (i = 0; i < n; i++) {
      var s = r.steps[i];
      if (['find', 'count', 'findAll'].indexOf(s.mode) < 0) return 'step mode ' + s.mode;
      if (s.mode !== mode0) return 'mixed modes';
      if (!s.promptKey || !s.params || !s.nameKind || s.nameValue === undefined) return 'step prompt';
      if (!s.targets || !s.targets.length) return 'step without targets';
      for (j = 0; j < s.targets.length; j++) if (!byId[s.targets[j]]) return 'target ' + s.targets[j] + ' does not exist';
      var hits = r.mounds.filter(function (q) { return matches(r, s, q.thing); }).map(function (q) { return q.id; });
      if (s.mode === 'find') {
        if (s.targets.length !== 1 || s.need !== 1) return 'find step with ' + s.targets.length + ' targets';
        if (hits.length !== 1 || hits[0] !== s.targets[0]) return 'find ' + s.promptKey + ' ' + JSON.stringify(s.params) + ' matches ' + hits.length + ' mounds';
        if (tgUsed[s.targets[0]]) return 'two steps ask for one mound';
        tgUsed[s.targets[0]] = 1;
        if (s.promptKey === 'p.shapes5' && !shapes5Ok(r, byId[s.targets[0]])) return 'shapes5 answer without both partners';
      } else {
        if (hits.slice().sort().join() !== s.targets.slice().sort().join()) return s.mode + ' targets ≠ matches';
        if (s.mode === 'count') {
          if (r.topic !== 'count' || s.params.n !== s.need) return 'count prompt';
          if (!(s.need >= 1) || s.need >= nM) return 'count need ' + s.need + ' of ' + nM;
          var rg = countRange(age, ri, r.level);
          if (s.need < rg[0] || s.need > rg[1]) return 'count N ' + s.need + ' not in ' + rg.join('–');
          if (nM !== s.need + countSpares(s.need, age, r.level)) return 'count mounds ' + nM + ' for N ' + s.need;
        } else {
          if (s.need !== s.targets.length || s.need < 2 || s.need > 3) return 'findAll need ' + s.need;
          if (nM - s.targets.length < 1) return 'findAll without a wrong mound';
        }
      }
      if (r.topic === 'initial' && s.params.letter !== initialOf(r.mounds.filter(function (q) { return q.id === s.targets[0]; })[0].thing.animal, r.lang)) return 'initial letter';
      if ((r.topic === 'add' || r.topic === 'sub') && (s.params.a < 0 || s.params.b < 1 || s.nameValue !== (r.topic === 'add' ? s.params.a + s.params.b : s.params.a - s.params.b))) return 'arithmetic';
      if (r.topic === 'add' && s.params.a + s.params.b > (ADD_MAX[age] || 10)) return 'sum too big';
      if (r.topic === 'sub' && (s.params.a > SUB_MAX || s.nameValue < 0)) return 'difference range';
    }
    // colours (DESIGN §3): every coloured thing of the round
    var cs = [];
    r.mounds.forEach(function (q) { if (q.thing.color && cs.indexOf(q.thing.color) < 0) cs.push(q.thing.color); });
    if (clash(cs, pairsFor(age, r.level)) || (age < COLOR_SAFE_BELOW && cs.indexOf('pink') >= 0)) return 'colour clash in ' + cs.join('+');
    var keys = r.mounds.map(function (q) { return thingKey(q.thing); });
    var shapes = [], kinds = {};
    r.mounds.forEach(function (q) { kinds[q.thing.kind] = 1; if (q.thing.shape && shapes.indexOf(q.thing.shape) < 0) shapes.push(q.thing.shape); });
    var bad = pairBad(shapes, SHAPE_PAIRS);
    if (bad) return 'confusable shapes ' + bad.join('+');
    switch (r.topic) {
      case 'colors': if (!kinds.egg || Object.keys(kinds).length !== 1) return 'colours: eggs only'; if (cs.length !== nM) return 'colours: two eggs alike'; break;
      case 'shapes':
        if (!kinds.stone || Object.keys(kinds).length !== 1) return 'shapes: stones only';
        for (i = 0; i < shapes.length; i++) if (shapesFor(age).indexOf(shapes[i]) < 0) return 'shape ' + shapes[i] + ' at age ' + age;
        if (age < 5 && (cs.length !== 1 || shapes.length !== nM)) return 'shapes: one colour, all shapes different';
        if (age >= 5) for (i = 0; i < keys.length; i++) if (keys.indexOf(keys[i]) !== i) return 'shapes5: two stones alike';
        break;
      case 'size': {
        var a0 = r.mounds[0].thing, a1 = r.mounds[1].thing;
        if (nM !== 2 || a0.kind !== a1.kind || (a0.color || a0.animal || '') !== (a1.color || a1.animal || '') || [a0.size, a1.size].sort().join() !== 'big,small') return 'size pair';
        break;
      }
      case 'animals': case 'initial': {
        if (!kinds.toy || Object.keys(kinds).length !== 1) return 'toys only';
        for (i = 0; i < keys.length; i++) if (keys.indexOf(keys[i]) !== i) return 'two toys alike';
        if (r.topic === 'initial') {
          var ins = r.mounds.map(function (q) { return initialOf(q.thing.animal, r.lang); });
          for (i = 0; i < ins.length; i++) if (!ins[i] || ins.indexOf(ins[i]) !== i) return 'initials not distinct';
        }
        break;
      }
      case 'count': if (!kinds.bone || Object.keys(kinds).length !== 1) return 'count: bones only'; break;
      default: {   // tablets
        if (!kinds.tablet || Object.keys(kinds).length !== 1) return 'tablets only';
        for (i = 0; i < keys.length; i++) if (keys.indexOf(keys[i]) !== i) return 'two tablets alike';
        var tx = r.mounds.map(function (q) { return q.thing.text; });
        if (r.topic === 'letters' && tx.some(function (c) { return letterPool(r.lang, 'letters').indexOf(c) < 0; })) return 'letter outside the pool';
        if (r.topic === 'lower') {
          if (tx.some(function (c) { return c !== c.toLowerCase() || /[il]/.test(c); })) return 'lower: small letters without i / l';
          var bp = pairBad(tx, LOWER_PAIRS);
          if (bp) return 'lower: confusable ' + bp.join('+');
        }
      }
    }
    if (r.key !== roundKey(r)) return 'key';
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
   *   colors  "What colour is this egg?" {color}       show egg {color},  choices blobs (clash-free below age 5)
   *   shapes  "Which one is the {shape}?"               show null,         choices stones (one colour)
   *   size    "Which {kind} is {size}?" {size, kind}    show null,         choices size {size, kind} (big / small)
   *   animals "Where is the {animal}?"                  show null,         choices toys
   *   count   "How many bones?" {n}                     show dots {n},     choices numbers
   *   letters "Where is the letter {letter}?"           show null,         choices letters
   *   lower   "Find small {small}" {letter, small}      show letter (capital), choices small letters
   *   initial "Which letter does {animal} start with?" {animal, letter}  show toy, choices letters
   *   add/sub "What is {a} + {b}?" {a, b}               show null,         choices numbers
   *   oddeven "Which number is {parity}?"               show null,         choices numbers (exactly one of that parity)
   * Ages ≤ 3: 2 choices, else 3. Every choice is a picture (no words to read).
   */
  function makeTalk(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new DD.RNG(1);
    var show = null, params = {}, ch, a, nC = age <= 3 ? 2 : 3;
    switch (topic) {
      case 'colors': {
        var set = colourSet(rng, age, 3, o.level); a = set[0]; params = { color: a }; show = { kind: 'egg', color: a };
        ch = choicesFrom(rng, a, set, nC, function (c) { return { kind: 'blob', color: c }; }); break;
      }
      case 'shapes': {
        var col = colourSet(rng, age, 1, o.level)[0], shs = shapeSet(rng, age, 3); a = shs[0]; params = { shape: a };
        ch = choicesFrom(rng, a, shs, nC, function (s) { return { kind: 'stone', shape: s, color: col }; }); break;
      }
      case 'size': {
        var kind = rng.pick(['bone', 'egg']), c2 = colourSet(rng, age, 1, o.level)[0]; a = rng.pick(['big', 'small']); params = { size: a, kind: kind };
        // icon {kind:'size', size, of:'bone'|'egg', color?} — `of` names the thing (icon.kind is the drawIcon dispatch key)
        ch = choicesFrom(rng, a, ['big', 'small'], 2, function (s) { var t = { kind: 'size', size: s, of: kind }; if (kind === 'egg') t.color = c2; return t; });
        break;
      }
      case 'animals': {
        a = rng.pick(DD.ANIMALS); params = { animal: a };
        ch = choicesFrom(rng, a, DD.ANIMALS, nC, function (x) { return { kind: 'toy', animal: x }; }); break;
      }
      case 'count': {
        var rr = { 3: [1, 4], 4: [1, 5], 5: [2, 8], 6: [3, 10], 7: [3, 10] }[age];
        a = rng.int(rr[0], rr[1]); params = { n: a }; show = { kind: 'dots', n: a };
        var near = range(Math.max(1, a - 2), a + 2).filter(function (x) { return x !== a; });
        ch = choicesFrom(rng, a, near, nC, function (x) { return { kind: 'number', n: x }; }); break;
      }
      case 'letters': case 'lower': {
        var P = letterPool(lang, topic); a = rng.pick(P);
        if (topic === 'lower') { params = { letter: a, small: a.toLowerCase() }; show = { kind: 'letter', text: a }; }
        else params = { letter: a };
        ch = choicesFrom(rng, a, P, 3, function (x) { return { kind: 'letter', text: topic === 'lower' ? x.toLowerCase() : x }; }); break;
      }
      case 'initial': {
        var an2 = rng.pick(DD.ANIMALS.filter(function (x) { return initialOf(x, lang); })); a = initialOf(an2, lang);
        show = { kind: 'toy', animal: an2 }; params = { animal: an2, letter: a };
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
      default: throw new Error('DD.Content: unknown topic ' + topic);
    }
    return { topic: topic, promptKey: 'talk.' + topic, params: params, show: show, choices: ch.choices, answer: ch.answer, answerId: ch.answer };
  }

  /** 4 chapter topics for a session, easiest first. Without rng or `last`: DD.AGE_TOPICS (the first session). With both:
   *  chapter 1 = the pool topic left out last time (else the easiest one that did not open last time); chapters 2–4 =
   *  3 of the others (preferring topics left out of `last`), in pool (difficulty) order. */
  function topicsFor(age, rng, last) {
    age = ageOf(age);
    last = Array.isArray(last) ? last : [];
    if (!rng || !last.length) return DD.AGE_TOPICS[age].slice();
    var pool = DD.AGE_POOLS[age].slice(), ord = function (a, b) { return pool.indexOf(a) - pool.indexOf(b); };
    var unused = pool.filter(function (t) { return last.indexOf(t) < 0; });
    var first = unused.length ? unused[0] : pool[0];
    if (!unused.length) for (var i = 0; i < pool.length; i++) if (pool[i] !== last[0]) { first = pool[i]; break; }
    var rest = pool.filter(function (t) { return t !== first; });
    var fresh = rng.shuffle(rest.filter(function (t) { return last.indexOf(t) < 0; }));
    var old = rng.shuffle(rest.filter(function (t) { return last.indexOf(t) >= 0; }));
    return [first].concat(fresh.concat(old).slice(0, 3).sort(ord));
  }

  DD.Content = {
    makeRound: makeRound, makeTalk: makeTalk, validate: validate, topicsFor: topicsFor, matches: matches, retarget: retarget, stepFor: stepFor,
    ageOf: ageOf, langOf: langOf, clash: clash, safeSetsOf: safeSetsOf, safeSets: safeSets, maxSafe: maxSafe, pairsFor: pairsFor, isNight: isNight, sameAnswer: sameAnswer, shapesFor: shapesFor, parityOf: parityOf, letterPool: letterPool,
    initialOf: initialOf, countRange: countRange, setKey: setKey, roundKey: roundKey, thingKey: thingKey,
    TOPICS: ALL_TOPICS, COLORS: COLORS, COLORS5: COLORS5, SHAPES3: SHAPES3, SHAPE_PAIRS: SHAPE_PAIRS, LOWER_PAIRS: LOWER_PAIRS,
    LETTER_POOL: LETTER_POOL, CLASH: CLASH, NIGHT_CLASH: NIGHT_CLASH, COLOR_SAFE_BELOW: COLOR_SAFE_BELOW, MAX_MOUNDS: MAX_MOUNDS, ADD_MAX: ADD_MAX, SUB_MAX: SUB_MAX,
    ODDEVEN_MAX: ODDEVEN_MAX, SIZE_K: SIZE_K, P_TWO: P_TWO
  };
})(window.DD = window.DD || {});
