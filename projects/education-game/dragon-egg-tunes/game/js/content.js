/* Rio's Singing Eggs — SE.PALETTE, SE.COLORS, SE.SHAPES, SE.ANIMALS, SE.NOTES, SE.AGE_TOPICS, SE.AGE_POOLS, SE.TOY_WORDS,
 * SE.DRUM_KINDS, SE.Content (pure + deterministic; DESIGN §5.1)
 *
 *   SE.Content.makeRound(topic, { age, lang, rng, roundIndex, level, surprise, short?, usedKeys?, prevKey?, prevAns?, prevAnsRun? })
 *       → round  (self-checked with validate; retries, throws when it cannot build a valid round)
 *   SE.Content.makeTalk(topic, { age, lang, rng }) → talk
 *   SE.Content.validate(round) → null | 'reason'
 *   SE.Content.topicsFor(age, rng?, lastTopics?) → the 4 chapter topics (easiest first)
 *   SE.Content.matches(round, step, thing) → bool (does this egg answer this step)
 *
 * round = { topic, age, lang, roundIndex, level, short, surprise: null|'lamb'|'bird'|'fireflies', key, seed,
 *   eggs: [ { id 'c0'…, thing, note (index into SE.NOTES), target: bool } ]   (order = pad order on the stage, left → right)
 *   steps:  [ { mode 'find'|'findAll'|'beat', targets [eggId], need, promptKey, params, nameKind, nameValue, note? } ]
 *   song:   [eggId…]   the targets in step order (= the tune Rio plays first; beat mode: the big egg once per step),
 *   contour: 'one'|'up'|'down'|'updown'   the shape of the tune's notes in step order (distinct notes) }
 * thing = { kind 'egg'|'shape'|'big'|'dots'|'animal'|'glyph', color?, shape?, n?, animal?, text?, big?, size?, nameKind, nameValue }
 *   nameKind / nameValue name the egg the way this round's question is about:
 *     egg (colors) → 'color' / 'red'   · egg (size) → 'size' / 'big'|'small' (+ big: bool, size)  · animal (size-round distractor) → 'animal'
 *     shape → 'shape' / 'star' (+ color) · dots → 'number' / 3 · big (beat mode) → 'number' / n of the first step ·
 *     animal → 'animal' / 'cow' · glyph → 'letter' / 'B'|'b' or 'number' / 7
 * step: find = exactly ONE target; at every step exactly one egg not yet rung right matches (distractors never match).
 *       findAll (oddeven) = every right-parity egg (2–3); need = targets.length.
 *       beat (count at ages ≤ 4) = the ONE big egg, need = n beats; step.note = that step's note (one lantern per step).
 * Prompt keys / params: p.colors {color} · p.shapes {shape, color} · p.shapes5 {shape, color} · p.size {size, color} ·
 *   p.beat {n} · p.count {n, kind 'dots'} · p.animals {animal} · p.letters {letter} · p.lower {letter (CAPITAL shown), small} ·
 *   p.initial {letter, animal} · p.add {a, b} · p.sub {a, b} · p.oddeven {parity}
 * talk = { topic, promptKey 'talk.<topic>', params, show: icon | null, choices [{ id, thing: icon, value }], answer, answerId }
 *   icon = any egg thing (drawn with EggArt.drawIcon) or { kind:'number', n } · { kind:'color', color } · { kind:'size', big, size, color }
 */
(function (SE) {
  'use strict';

  // DESIGN §3 answer palette (exact hex)
  SE.PALETTE = {
    red:    { base: '#E84A4A', dark: '#A8282E', light: '#F7A0A0' },
    blue:   { base: '#3C8DE8', dark: '#1F5BA8', light: '#A6CCF5' },
    yellow: { base: '#FFD23F', dark: '#C99A12', light: '#FFEB9C' },
    green:  { base: '#4CC26B', dark: '#2A8343', light: '#A8E6B8' },
    orange: { base: '#FF9A2E', dark: '#C4650C', light: '#FFCB8E' },
    purple: { base: '#8E44AD', dark: '#6840A8', light: '#D2BDF3' },
    pink:   { base: '#FF8FC0', dark: '#C9558A', light: '#FFCCE2' }      // an answer colour from age 5
  };
  for (var pk in SE.PALETTE) SE.PALETTE[pk].fill = SE.PALETTE[pk].base;
  SE.BRASS = { base: '#D8B26A', dark: '#9C7838', light: '#F3DFAE' };
  SE.WOOD = { base: '#A87245', dark: '#6E4526', light: '#D29A66' };
  SE.COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  var COLORS = SE.COLORS.slice(0, 6), COLORS5 = SE.COLORS.slice();
  SE.SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
  SE.ANIMALS = ['duck', 'chick', 'owl', 'frog', 'dino', 'snake'];   // babies peeking out of cracked eggs (DESIGN §5.1)
  SE.DRUM_KINDS = ['egg', 'shape', 'big', 'dots', 'animal', 'glyph'];
  SE.NOTES = ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6'];          // pentatonic; a egg's `note` is an index into this
  SE.NOTE_HZ = [523.25, 587.33, 659.26, 783.99, 880.0, 1046.5, 1174.66];

  SE.AGE_TOPICS = {
    3: ['colors', 'shapes', 'size', 'animals'],
    4: ['colors', 'shapes', 'count', 'animals'],
    5: ['shapes', 'count', 'letters', 'animals'],
    6: ['lower', 'initial', 'add', 'count'],
    7: ['initial', 'add', 'sub', 'oddeven']
  };
  /* Every age has a POOL of 5 topics in difficulty order; a session plays 4 of them (rotating between sessions). */
  SE.AGE_POOLS = {
    3: ['colors', 'shapes', 'size', 'animals'],          // age 3 never gets count
    4: ['colors', 'size', 'shapes', 'count', 'animals'],
    5: ['colors', 'shapes', 'count', 'letters', 'animals'],
    6: ['letters', 'lower', 'initial', 'add', 'count'],
    7: ['count', 'initial', 'add', 'sub', 'oddeven']
  };
  var ALL_TOPICS = ['colors', 'shapes', 'size', 'animals', 'count', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];

  // ---- tables (DESIGN §5.1)
  var MAX_DRUMS = 5;
  var SHAPES3 = ['circle', 'square', 'triangle', 'star', 'heart'];   // age 3; all 8 from age 4
  var SHAPE_PAIRS = [['square', 'rect'], ['circle', 'oval'], ['square', 'diamond']];   // never together in one round
  var LETTER_POOL = { en: 'ABCDEFGHIKLMNOPRSTUW', vi: 'ABCDEGHIKLMNOPSTUVXY' };
  var LOWER_SKIP = 'IL';                                             // capital I and small l look alike
  var BDPQ = ['b', 'd', 'p', 'q'];                                   // at most one of these per round (mirror letters)
  var LOWER_PAIRS = [['m', 'w'], ['n', 'u']];
  var ADD_MAX = { 5: 10, 6: 10, 7: 20 }, SUB_MAX = 10, ODDEVEN_MAX = { 5: 10, 6: 12, 7: 20 }, DOTS_MAX = { 5: 10, 6: 12, 7: 12 };
  var SIZE_K = { big: 1.25, small: 0.75, mid: 1 };   // mid = the size round's distractor (another colour, in between)
  /* 'initial' words (the animal eggs are the pictures). VI without the classifier "con". Same approach as the sister games:
   * the initial is the word's first letter with tone marks dropped; a letter with its own marks (ếch → Ê) is not in the VI
   * letter pool, so that animal is left out of VI 'initial' rounds. */
  SE.TOY_WORDS = {
    en: { duck: 'duck', chick: 'chick', owl: 'owl', frog: 'frog', dino: 'dino', snake: 'snake' },
    vi: { duck: 'vịt', chick: 'gà', owl: 'cú', frog: 'ếch', dino: 'khủng long', snake: 'rắn' }   // ếch (Ê) and rắn (R) are not in the VI pool
  };
  function langOf(l) { return l === 'vi' ? 'vi' : 'en'; }
  /** The initial letter of the animal's word (capital, tone marks dropped), or null when it is not in that language's pool. */
  function initialOf(animal, lang) {
    var w = SE.TOY_WORDS[langOf(lang)][animal];
    if (!w) return null;
    var c = w.charAt(0).normalize('NFD');
    if (c.length > 1) return null;
    c = c.toUpperCase();
    return LETTER_POOL[langOf(lang)].indexOf(c) >= 0 ? c : null;
  }

  /* Colour safety (DESIGN §3): below age 5 one round never holds blue+purple, red+green, yellow+orange, green+orange or
   * red+orange (every answer-coloured egg: colour eggs, shape emblems), and no pink. At most 3 colours fit below age 5. */
  var COLOR_SAFE_BELOW = 5;
  var CLASH = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange'], ['red', 'orange']];
  function pairsFor(age) { return age < COLOR_SAFE_BELOW ? CLASH : []; }
  function clash(cs, pairs) {
    pairs = pairs || CLASH;
    for (var i = 0; i < pairs.length; i++) if (cs.indexOf(pairs[i][0]) >= 0 && cs.indexOf(pairs[i][1]) >= 0) return true;
    return false;
  }
  var SETS = {};
  /** Every clash-free set of n colours for this age (cached). */
  function safeSets(age, n) {
    var key = (age < COLOR_SAFE_BELOW ? 'y' : 'o') + n;
    if (SETS[key]) return SETS[key];
    var pool = age < COLOR_SAFE_BELOW ? COLORS : COLORS5, pr = pairsFor(age), out = [];
    for (var m = 1; m < (1 << pool.length); m++) {
      var cs = pool.filter(function (c, i) { return m & (1 << i); });
      if (cs.length === n && !clash(cs, pr)) out.push(cs);
    }
    return (SETS[key] = out);
  }
  /** The most distinct colours one round can hold (3 below age 5, 7 from age 5). */
  function maxSafe(age) { var n = 1; while (n < 7 && safeSets(age, n + 1).length) n++; return n; }

  function clampI(v, a, b) { v = Math.round(+v); return v < a ? a : v > b ? b : v; }
  function ageOf(a) { a = Math.round(+a || 4); return a < 3 ? 3 : a > 7 ? 7 : a; }
  function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }
  function shapesFor(age) { return age <= 3 ? SHAPES3.slice() : SE.SHAPES.slice(); }
  function pairBad(list, pairs) {
    for (var i = 0; i < pairs.length; i++) if (list.indexOf(pairs[i][0]) >= 0 && list.indexOf(pairs[i][1]) >= 0) return pairs[i];
    return null;
  }
  function shapeSet(rng, age, k) {
    for (var t = 0; t < 200; t++) { var s = rng.sample(shapesFor(age), k); if (!pairBad(s, SHAPE_PAIRS)) return s; }
    return ['circle', 'triangle', 'star', 'heart', 'square'].slice(0, k);
  }
  function letterPool(lang, topic) {
    var P = LETTER_POOL[langOf(lang)].split('');
    return topic === 'lower' ? P.filter(function (c) { return LOWER_SKIP.indexOf(c) < 0; }) : P;
  }
  function parityOf(n) { return n % 2 ? 'odd' : 'even'; }
  function colourSet(rng, age, k) {
    var n = Math.min(k, maxSafe(age));
    return rng.shuffle(rng.pick(safeSets(age, n)).slice()).slice(0, k);
  }
  function bdpqCount(list) { return list.filter(function (c) { return BDPQ.indexOf(c) >= 0; }).length; }
  function hasNeighbours(v) { for (var i = 0; i < v.length; i++) for (var j = 0; j < i; j++) if (Math.abs(v[i] - v[j]) <= 1) return true; return false; }

  // ---------------- things ----------------
  function egg(c) { return { kind: 'egg', color: c, nameKind: 'color', nameValue: c }; }
  function shapeD(s, c) { return { kind: 'shape', shape: s, color: c, nameKind: 'shape', nameValue: s }; }
  function bigD(n) { return { kind: 'big', big: true, nameKind: 'number', nameValue: n }; }
  function dots(n) { return { kind: 'dots', n: n, nameKind: 'number', nameValue: n }; }
  function animal(a) { return { kind: 'animal', animal: a, nameKind: 'animal', nameValue: a }; }
  function glyphL(c) { return { kind: 'glyph', text: String(c), nameKind: 'letter', nameValue: String(c) }; }
  function glyphN(n) { return { kind: 'glyph', text: String(n), n: n, nameKind: 'number', nameValue: n }; }
  function thingKey(t) { return [t.kind, t.color || '', t.shape || '', t.n === undefined ? '' : t.n, t.animal || '', t.text || '', t.size || ''].join(':'); }
  /** The round's set of eggs, order-free (targets and distractors marked apart). */
  function roundKey(r) {
    var k = r.eggs.map(function (c) { return (c.target ? 'T' : 'D') + thingKey(c.thing); }).sort().join(',');
    if (r.steps && r.steps.length && r.steps[0].mode === 'beat') k += '|beat:' + r.steps.map(function (s) { return s.need; }).join('-');
    return k;
  }
  /** Beat mode: the count topic below age 5 (one big egg, beat it n times). */
  function beatMode(topic, age) { return topic === 'count' && age <= 4; }

  // ---------------- counts ----------------
  /* Tune length = the number of target eggs (DESIGN §5.1), [lo, hi] per round index (the last entry repeats):
   *   age 3: warm-up 1, then 1–2 (round 1: 1 or 2, later 2) · age 4: 1, 2, 2–3, 3 · age 5: 2, then 3 · ages 6+: 3, then 3–4.
   *   Short rounds (late in a chapter): ≤ 2. */
  var TUNE = { 3: [[1, 1], [1, 2], [2, 2]], 4: [[1, 1], [2, 2], [2, 3], [3, 3]], 5: [[2, 2], [3, 3]], 6: [[3, 3], [3, 4]], 7: [[3, 3], [3, 4]] };
  function tuneRange(age, ri, short) {
    var t = TUNE[age] || TUNE[7], r = t[Math.min(ri, t.length - 1)].slice();
    if (short && ri > 0) { r[1] = Math.min(r[1], 2); r[0] = Math.min(r[0], r[1]); }
    return r;
  }
  /** Distractors (eggs not in the tune): none in the warm-up; from round 2 one at ages ≥ 4 (age 4 level 0: none); age 3 one from
   *  round 3 (not in the first chapter); a 1-note tune always gets one (the child still has to choose). */
  function distractorsFor(age, ri, level, n) {
    var d;
    if (ri === 0) d = 0;
    else if (age <= 3) d = ri >= 2 && level !== 0 ? 1 : 0;
    else if (age === 4) d = level === 0 ? 0 : 1;
    else d = 1;
    return n <= 1 ? Math.max(d, 1) : d;
  }
  /** { n: targets, d: distractors } for a round; at most `cap` eggs in all (phones: 4). */
  function countsFor(rng, age, ri, level, short, cap) {
    var rg = tuneRange(age, ri, short), n = rg[0] === rg[1] ? rg[0] : rng.int(rg[0], rg[1]), d = distractorsFor(age, ri, level, n);
    if (cap && n + d > cap) n = Math.max(1, cap - d);
    return { n: n, d: d };
  }
  /** How many animals have distinct initials in this language (the 'initial' topic's pool). */
  function initialPool(lang) { var o = {}; SE.ANIMALS.forEach(function (a) { var c = initialOf(a, lang); if (c) o[c] = 1; }); return Object.keys(o).length; }

  // ---------------- the tune ----------------
  /** k distinct pentatonic notes inside a small window (k + 2 notes wide), ordered as a random contour: up, down or (k ≥ 3)
   *  up-down (a peak in the middle). → { notes [in step order], contour } */
  function pickTune(rng, k) {
    var NN = SE.NOTES.length;
    if (k <= 1) return { notes: [rng.int(0, NN - 1)], contour: 'one' };
    var span = Math.min(NN, k + 2), start = rng.int(0, NN - span);
    var ns = rng.sample(range(start, start + span - 1), k).sort(function (a, b) { return a - b; });
    var c = rng.pick(k >= 3 ? ['up', 'down', 'updown'] : ['up', 'down']);
    if (c === 'down') ns.reverse();
    else if (c === 'updown') {
      var peak = ns.pop(), m = rng.int(1, k - 2), rest = rng.shuffle(ns.slice());
      ns = rest.slice(0, m).sort(function (a, b) { return a - b; }).concat([peak], rest.slice(m).sort(function (a, b) { return b - a; }));
    }
    return { notes: ns, contour: c };
  }
  /** The contour of a note list: 'one' | 'up' | 'down' | 'updown' | null (repeated notes or another shape). */
  function contourOf(ns) {
    if (!ns || !ns.length) return null;
    if (ns.length === 1) return 'one';
    var i = 1;
    while (i < ns.length && ns[i] > ns[i - 1]) i++;
    if (i === ns.length) return 'up';
    if (i === 1) { while (i < ns.length && ns[i] < ns[i - 1]) i++; return i === ns.length ? 'down' : null; }
    while (i < ns.length && ns[i] < ns[i - 1]) i++;
    return i === ns.length ? 'updown' : null;
  }
  function S(mode, targets, need, promptKey, params, nameKind, nameValue) {
    return { mode: mode, targets: targets, need: need, promptKey: promptKey, params: params, nameKind: nameKind, nameValue: nameValue };
  }

  // ---------------- matching (one rule per topic; the world judges by step.targets, validate checks targets = matches) ----------------
  function matches(r, s, t) {
    var p = s.params || {};
    switch (r.topic) {
      case 'colors': return t.kind === 'egg' && t.color === p.color;
      case 'shapes': return t.kind === 'shape' && t.shape === p.shape && (s.promptKey !== 'p.shapes5' || t.color === p.color);
      case 'size': return t.kind === 'egg' && t.size === p.size;
      case 'animals': return t.kind === 'animal' && t.animal === p.animal;
      case 'initial': return t.kind === 'animal' && initialOf(t.animal, r.lang) === p.letter;
      case 'count': return s.mode === 'beat' ? t.kind === 'big' : t.kind === 'dots' && t.n === p.n;
      case 'letters': return t.kind === 'glyph' && t.text === p.letter;
      case 'lower': return t.kind === 'glyph' && t.text === p.small;
      case 'add': return t.kind === 'glyph' && t.n === p.a + p.b;
      case 'sub': return t.kind === 'glyph' && t.n === p.a - p.b;
      case 'oddeven': return t.kind === 'glyph' && t.n !== undefined && parityOf(t.n) === p.parity;
    }
    return false;
  }
  /** The find step asking for egg `c` (the prompt follows from the thing). */
  function stepFor(r, c) {
    var t = c.thing;
    switch (r.topic) {
      case 'colors': return S('find', [c.id], 1, 'p.colors', { color: t.color }, 'color', t.color);
      case 'shapes':
        return r.age >= 5 ? S('find', [c.id], 1, 'p.shapes5', { shape: t.shape, color: t.color }, 'shape', t.shape)
          : S('find', [c.id], 1, 'p.shapes', { shape: t.shape, color: t.color }, 'shape', t.shape);
      case 'size': return S('find', [c.id], 1, 'p.size', { size: t.size, color: t.color }, 'size', t.size);
      case 'animals': return S('find', [c.id], 1, 'p.animals', { animal: t.animal }, 'animal', t.animal);
      case 'initial': { var L0 = initialOf(t.animal, r.lang); return S('find', [c.id], 1, 'p.initial', { letter: L0, animal: t.animal }, 'letter', L0); }
      case 'count': return S('find', [c.id], 1, 'p.count', { n: t.n, kind: t.kind }, 'number', t.n);
      case 'letters': return S('find', [c.id], 1, 'p.letters', { letter: t.text }, 'letter', t.text);
      case 'lower': return S('find', [c.id], 1, 'p.lower', { letter: t.text.toUpperCase(), small: t.text }, 'letter', t.text);
    }
    return null;
  }

  // ---------------- rounds ----------------
  function buildRound(topic, age, lang, rng, ri, level, short, cap) {
    var real = [], extra = [], steps = [], i, cn = countsFor(rng, age, ri, level, short, cap), n = cn.n, d = cn.d;
    var r = { topic: topic, age: age, lang: lang, roundIndex: ri, level: level, short: !!short, surprise: null, eggs: null, steps: steps, song: null, maxEggs: cap || MAX_DRUMS };
    var probs = null, oddPar = null, beatNs = null;
    switch (topic) {
      case 'colors': {
        if (n + d > maxSafe(age)) n = Math.max(1, maxSafe(age) - d);   // below age 5 only 3 colours fit in a round: 2 + 1 distractor
        var cs = colourSet(rng, age, n + d);
        for (i = 0; i < n + d; i++) (i < n ? real : extra).push(egg(cs[i]));
        break;
      }
      case 'shapes': {
        if (age < 5) {
          var col = colourSet(rng, age, 1)[0], shs = shapeSet(rng, age, n + d);
          for (i = 0; i < n + d; i++) (i < n ? real : extra).push(shapeD(shs[i], col));
        } else {   // shapes5: a 2 × 2 grid of 2 shapes × 2 colours (+ one extra egg) → the answer needs both shape and colour
          var sh = shapeSet(rng, age, 3), cc = colourSet(rng, age, 3);
          var grid = rng.shuffle([shapeD(sh[0], cc[0]), shapeD(sh[0], cc[1]), shapeD(sh[1], cc[0]), shapeD(sh[1], cc[1])]);
          if (n + d >= 5) grid.push(rng.chance(0.5) ? shapeD(sh[2], cc[rng.int(0, 1)]) : shapeD(sh[rng.int(0, 1)], cc[2]));
          grid = grid.slice(0, n + d);
          var gi = rng.shuffle(range(0, grid.length - 1));
          for (i = 0; i < gi.length; i++) (i < n ? real : extra).push(grid[gi[i]]);
        }
        break;
      }
      case 'size': {   // a big and a small egg of one colour (+ from round 2 a MID-size egg of another colour: neither big nor small);
        // a 1-note tune: one of the pair is the tune, its partner the distractor
        n = Math.min(n, 2);
        var c2s = colourSet(rng, age, 2), c1 = c2s[0], one = rng.chance(0.5) ? 'big' : 'small';
        ['big', 'small'].forEach(function (sz) {
          var t = egg(c1); t.size = sz; t.big = sz === 'big'; t.nameKind = 'size'; t.nameValue = sz;
          (n === 1 && sz !== one ? extra : real).push(t);
        });
        if (n === 2 && d) { var md = egg(c2s[1]); md.size = 'mid'; md.big = false; extra.push(md); }   // named by its colour
        break;
      }
      case 'animals': {
        var an = rng.sample(SE.ANIMALS, n + d);
        for (i = 0; i < n + d; i++) (i < n ? real : extra).push(animal(an[i]));
        break;
      }
      case 'initial': {   // animals with distinct initials in this language
        var byI = {};
        rng.shuffle(SE.ANIMALS.slice()).forEach(function (a) { var c = initialOf(a, lang); if (c && !byI[c]) byI[c] = a; });
        var pool = rng.shuffle(Object.keys(byI).map(function (c) { return byI[c]; }));
        if (n + d > pool.length) d = Math.max(n <= 1 ? 1 : 0, pool.length - n);
        if (n + d > pool.length) n = pool.length - d;
        for (i = 0; i < n + d; i++) (i < n ? real : extra).push(animal(pool[i]));
        break;
      }
      case 'count': {
        var vals;
        if (age <= 4) {   // beat mode: ONE big egg; warm-up 1 step n ∈ {1, 2}; later 2 steps (1 when short) of distinct n in 2–5, one ≥ 3
          var ns;
          if (ri === 0) ns = [rng.int(1, 2)];
          else {
            var k = short ? 1 : 2;
            for (var tb = 0; tb < 100; tb++) { ns = rng.sample(range(2, 5), k); if (k === 1 || Math.max.apply(null, ns) >= 3) break; }   // n = 1 only in the warm-up (QA playtest P3-1)
          }
          beatNs = ns;
          real.push(bigD(ns[0]));
        } else {          // dots eggs: warm-up ≤ 5, later 1–10 (6+: 12); age 5: no two neighbours
          var hiD = ri === 0 ? 5 : DOTS_MAX[age] || 10;
          for (var tr = 0; tr < 200; tr++) {
            vals = rng.sample(range(1, hiD), n + d);
            if (age !== 5 || !hasNeighbours(vals)) break;
          }
          for (i = 0; i < n + d; i++) (i < n ? real : extra).push(dots(vals[i]));
        }
        break;
      }
      case 'letters': case 'lower': {
        var LL;
        for (var t2 = 0; t2 < 200; t2++) {
          LL = rng.sample(letterPool(lang, topic), n + d).map(function (c) { return topic === 'lower' ? c.toLowerCase() : c; });
          if (topic !== 'lower' || (bdpqCount(LL) <= 1 && !pairBad(LL, LOWER_PAIRS))) break;
        }
        for (i = 0; i < n + d; i++) (i < n ? real : extra).push(glyphL(LL[i]));
        break;
      }
      case 'add': case 'sub': {
        probs = []; var used = [];
        for (i = 0; i < n; i++) {
          var a, b, res, tr2 = 0;
          do {
            if (topic === 'add') { var top = ADD_MAX[age] || 10, hiA = ri === 0 ? Math.min(6, top) : top; res = rng.int(2, hiA); a = rng.int(1, res - 1); b = res - a; }
            else { res = rng.int(0, ri === 0 ? 5 : SUB_MAX - 1); b = rng.int(1, SUB_MAX - res); a = res + b; }
          } while (used.indexOf(res) >= 0 && ++tr2 < 80);
          used.push(res); probs.push({ a: a, b: b, res: res });
        }
        var lo = topic === 'add' ? 1 : 0, hiN = topic === 'add' ? (ADD_MAX[age] || 10) : SUB_MAX;
        var near = rng.shuffle(range(lo, hiN).filter(function (x) { return used.indexOf(x) < 0 && Math.abs(x - used[0]) <= 3; }));
        if (near.length < d) near = near.concat(rng.shuffle(range(lo, hiN).filter(function (x) { return used.indexOf(x) < 0 && near.indexOf(x) < 0; })));
        used.forEach(function (x) { real.push(glyphN(x)); });
        for (i = 0; i < d; i++) extra.push(glyphN(near[i]));
        break;
      }
      case 'oddeven': {   // findAll: the right parity are the targets, the other parity the distractors
        if (ri === 0) { n = 2; d = 1; } else { n = rng.int(2, 3); d = n === 3 ? rng.int(1, 2) : 2; }
        if (cap && n + d > cap) d = Math.max(1, cap - n);
        oddPar = rng.pick(['odd', 'even']);
        var hiO = ODDEVEN_MAX[age] || 12;
        var rt = rng.sample(range(1, hiO).filter(function (x) { return parityOf(x) === oddPar; }), n);
        var wr = rng.sample(range(1, hiO).filter(function (x) { return parityOf(x) !== oddPar; }), d);
        rt.forEach(function (x) { real.push(glyphN(x)); });
        wr.forEach(function (x) { extra.push(glyphN(x)); });
        break;
      }
      default: throw new Error('SE.Content: unknown topic ' + topic);
    }
    // eggs in random hook order (left → right)
    var all = real.map(function (t) { return { t: t, real: true }; }).concat(extra.map(function (t) { return { t: t, real: false }; }));
    rng.shuffle(all);
    r.eggs = all.map(function (q, k) { return { id: 'c' + k, thing: q.t, note: -1, target: q.real }; });
    var targ = r.eggs.filter(function (c) { return c.target; });
    // steps
    if (beatNs) {
      beatNs.forEach(function (bn) { steps.push(S('beat', [targ[0].id], bn, 'p.beat', { n: bn }, 'number', bn)); });
    } else if (topic === 'oddeven') {
      var ord = rng.shuffle(targ.slice());
      steps.push(S('findAll', ord.map(function (c) { return c.id; }), ord.length, 'p.oddeven', { parity: oddPar }, 'parity', oddPar));
    } else if (probs) {
      rng.shuffle(probs.slice()).forEach(function (pr) {
        var c = targ.filter(function (q) { return q.thing.n === pr.res; })[0];
        steps.push(S('find', [c.id], 1, 'p.' + topic, { a: pr.a, b: pr.b }, 'number', pr.res));
      });
    } else {
      rng.shuffle(targ.slice()).forEach(function (c) { steps.push(stepFor(r, c)); });
    }
    // the tune: targets in step order get distinct pentatonic notes in a contour (up / down / up-down); distractors a free note
    r.song = [];
    steps.forEach(function (s) { if (s.mode === 'beat') r.song.push(s.targets[0]); else s.targets.forEach(function (id) { r.song.push(id); }); });
    var tune = pickTune(rng, r.song.length), notes = tune.notes;
    r.contour = tune.contour;
    if (beatNs) { steps.forEach(function (s, k) { s.note = notes[k]; }); r.eggs[0].note = notes[0]; }
    else r.song.forEach(function (id, k) { byId(r, id).note = notes[k]; });
    var free = range(0, SE.NOTES.length - 1).filter(function (x) { return notes.indexOf(x) < 0; });
    r.eggs.forEach(function (c) { if (c.note < 0) c.note = free.length ? free.splice(rng.int(0, free.length - 1), 1)[0] : rng.int(0, SE.NOTES.length - 1); });
    r.key = roundKey(r);
    return r;
  }
  function byId(r, id) { for (var i = 0; i < r.eggs.length; i++) if (r.eggs[i].id === id) return r.eggs[i]; return null; }

  /**
   * makeRound(topic, o) → round. `prevKey` / `usedKeys` = keys of earlier rounds (the same set never twice in a chapter while
   * another one is possible), `prevAns` / `prevAnsRun` = the answer asked last (the next round does not open with it).
   */
  function makeRound(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new SE.RNG(1), ri = o.roundIndex || 0;
    var level = o.level === undefined || o.level === null ? 1 : o.level | 0;
    if (ALL_TOPICS.indexOf(topic) < 0) throw new Error('SE.Content: unknown topic ' + topic);
    var used = (o.usedKeys || []).slice(); if (o.prevKey) used.push(o.prevKey);
    var r = null, err = null;
    for (var attempt = 0; attempt < 80; attempt++) {
      try {
        r = buildRound(topic, age, lang, rng, ri, level, !!o.short, o.maxEggs ? clampI(o.maxEggs, 2, MAX_DRUMS) : MAX_DRUMS);
        err = validate(r);
        if (!err && attempt < 60 && used.indexOf(r.key) >= 0) err = 'the same set as an earlier round';
        if (!err && attempt < 40 && sameAnswer(r, o.prevAns, o.prevAnsRun)) err = 'the same answer as the previous round';
      } catch (e) { r = null; err = e.message; }
      if (!err) break;
    }
    if (err) throw new Error('SE.Content: invalid round (' + topic + ', age ' + age + ', round ' + ri + '): ' + err);
    r.surprise = ri === 0 ? null : (o.surprise || null);
    r.seed = (rng.next() * 4294967296) >>> 0;
    return r;
  }
  /** The first ask of a round is not the answer asked last (size / odd-even have 2 answers: at most 2 in a row; shapes5 is exempt). */
  function sameAnswer(r, prevAns, run) {
    var s = r.steps[0];
    if (prevAns === undefined || prevAns === null || !s || s.promptKey === 'p.shapes5') return false;
    if (String(s.nameValue) !== String(prevAns)) return false;
    return r.topic === 'size' || r.topic === 'oddeven' ? (run || 1) >= 2 : true;
  }

  // ---------------- self-check ----------------
  /** null when the round is completable and follows every rule (DESIGN §5.1 / §3), else the reason. */
  function validate(r) {
    if (!r || !r.eggs || !r.steps || !r.song) return 'no eggs / steps / song';
    var i, j, ids = {}, nC = r.eggs.length, age = r.age, ri = r.roundIndex, beat = beatMode(r.topic, age);
    if (beat) return validateBeat(r);
    if (nC < 2 || nC > MAX_DRUMS || nC > (r.maxEggs || MAX_DRUMS)) return nC + ' eggs';
    var real = [], extra = [];
    for (i = 0; i < nC; i++) {
      var c = r.eggs[i], t = c.thing;
      if (!c.id || ids[c.id]) return 'egg id ' + c.id;
      ids[c.id] = c;
      if (!t || SE.DRUM_KINDS.indexOf(t.kind) < 0) return 'egg kind';
      if (!t.nameKind || t.nameValue === undefined || t.nameValue === null) return 'egg name';
      if ((t.kind === 'egg' || t.kind === 'shape') && !SE.PALETTE[t.color]) return 'egg colour ' + t.color;
      if (t.kind === 'shape' && SE.SHAPES.indexOf(t.shape) < 0) return 'shape';
      if (t.kind === 'big') return 'a big egg outside beat mode';
      if (t.kind === 'animal' && SE.ANIMALS.indexOf(t.animal) < 0) return 'animal';
      if (t.kind === 'dots' && !(t.n >= 1 && t.n <= 12)) return 'dots n ' + t.n;
      if (t.kind === 'glyph' && !(t.text && t.text.length >= 1 && t.text.length <= 2)) return 'glyph text';
      if (t.kind === 'glyph' && t.n !== undefined && String(t.n) !== t.text) return 'glyph number';
      if (t.size && (!SIZE_K[t.size] || t.big !== (t.size === 'big'))) return 'size';
      if (!(c.note >= 0 && c.note < SE.NOTES.length && c.note === Math.floor(c.note))) return 'note';
      (c.target ? real : extra).push(c);
    }
    // counts (DESIGN §5.1)
    var nS = real.length, lvl0 = r.level === 0, wantD, oe = r.topic === 'oddeven';
    if (oe) {
      if (nS < 2 || nS > 3 || extra.length < 1 || extra.length > 2) return 'oddeven ' + nS + ' + ' + extra.length;
      if (nC > (r.maxEggs || MAX_DRUMS)) return nC + ' eggs > ' + r.maxEggs;
    } else {
      // DESIGN §5.1 tune lengths (tuneRange) + distractors (distractorsFor); caps: eggs on phones, clash-free colours, initials
      var rg = tuneRange(age, ri, r.short), lo = rg[0], hi = rg[1];
      wantD = distractorsFor(age, ri, r.level, nS);
      if (r.topic === 'size') { hi = Math.min(hi, 2); lo = Math.min(lo, hi); }
      if (r.topic === 'initial') {
        var ip = initialPool(r.lang);
        if (extra.length < wantD && nC === ip) wantD = extra.length;
        hi = Math.min(hi, ip - wantD); lo = Math.min(lo, hi);
      }
      if (extra.length !== wantD) return 'distractors ' + extra.length + ' (want ' + wantD + ')';
      if (r.maxEggs && r.maxEggs < MAX_DRUMS) { hi = Math.min(hi, r.maxEggs - wantD); lo = Math.min(lo, hi); }
      if (r.topic === 'colors' && age < COLOR_SAFE_BELOW) { hi = Math.min(hi, maxSafe(age) - wantD); lo = Math.min(lo, hi); }
      if (nS < Math.max(1, lo) || nS > hi) return nS + ' targets not in ' + lo + '–' + hi;
      if (nC < 2) return 'one egg';
    }
    void lvl0;
    // steps: simulate the round in step order — at every find step exactly one egg not yet rung right matches
    var rung = {}, asked = {}, song = [];
    if (!r.steps.length) return 'no steps';
    for (i = 0; i < r.steps.length; i++) {
      var s = r.steps[i];
      if (s.mode !== (oe ? 'findAll' : 'find')) return 'step mode ' + s.mode;
      if (!s.promptKey || !s.params || !s.nameKind || s.nameValue === undefined) return 'step prompt';
      if (!s.targets || !s.targets.length || s.need !== s.targets.length) return 'step targets / need';
      for (j = 0; j < s.targets.length; j++) {
        if (!ids[s.targets[j]] || !ids[s.targets[j]].target) return 'target ' + s.targets[j] + ' is not a target egg';
        if (asked[s.targets[j]]) return 'a egg asked twice';
        asked[s.targets[j]] = 1; song.push(s.targets[j]);
      }
      var hits = r.eggs.filter(function (q) { return !rung[q.id] && matches(r, s, q.thing); }).map(function (q) { return q.id; });
      if (s.mode === 'find') {
        if (s.targets.length !== 1) return 'find step with ' + s.targets.length + ' targets';
        if (hits.length !== 1 || hits[0] !== s.targets[0]) return 'find ' + s.promptKey + ' ' + JSON.stringify(s.params) + ' matches ' + hits.length + ' eggs';
        if (r.eggs.some(function (q) { return !q.target && matches(r, s, q.thing); })) return 'a distractor matches';
      } else if (hits.slice().sort().join() !== s.targets.slice().sort().join()) return 'findAll targets ≠ matches';
      s.targets.forEach(function (id) { rung[id] = 1; });
      if (r.topic === 'initial' && s.params.letter !== initialOf(ids[s.targets[0]].thing.animal, r.lang)) return 'initial letter';
      if (r.topic === 'add' || r.topic === 'sub') {
        if (!(s.params.a >= 0 && s.params.b >= 1) || s.nameValue !== (r.topic === 'add' ? s.params.a + s.params.b : s.params.a - s.params.b)) return 'arithmetic';
        if (r.topic === 'add' && (s.params.a < 1 || s.params.a + s.params.b > (ADD_MAX[age] || 10))) return 'sum range';
        if (r.topic === 'sub' && (s.params.a > SUB_MAX || s.nameValue < 0)) return 'difference range';
      }
      if (r.topic === 'count' && (s.params.kind !== ids[s.targets[0]].thing.kind)) return 'count kind';
    }
    if (Object.keys(asked).length !== nS) return 'not every target is asked';
    // the tune: the targets in step order, distinct notes in the round's contour; all notes in the round distinct
    if (r.song.join() !== song.join()) return 'song ≠ targets in step order';
    var cn = contourOf(r.song.map(function (id) { return ids[id].note; }));
    if (!cn || cn !== r.contour) return 'tune contour ' + cn + ' ≠ ' + r.contour;
    var ns = r.eggs.map(function (q) { return q.note; });
    for (i = 0; i < ns.length; i++) if (ns.indexOf(ns[i]) !== i) return 'two eggs on one note';
    // colours (DESIGN §3): every answer-coloured egg of the round
    var cs = [];
    r.eggs.forEach(function (q) { if (q.thing.color && cs.indexOf(q.thing.color) < 0) cs.push(q.thing.color); });
    if (clash(cs, pairsFor(age)) || (age < COLOR_SAFE_BELOW && cs.indexOf('pink') >= 0)) return 'colour clash in ' + cs.join('+');
    var keys = r.eggs.map(function (q) { return thingKey(q.thing); }), kinds = {}, shapes = [];
    for (i = 0; i < keys.length; i++) if (keys.indexOf(keys[i]) !== i) return 'two eggs alike';
    r.eggs.forEach(function (q) { kinds[q.thing.kind] = 1; if (q.thing.shape && shapes.indexOf(q.thing.shape) < 0) shapes.push(q.thing.shape); });
    var nk = Object.keys(kinds).sort();
    var bad = pairBad(shapes, SHAPE_PAIRS);
    if (bad) return 'confusable shapes ' + bad.join('+');
    switch (r.topic) {
      case 'colors': {
        if (nk.join() !== 'egg') return 'colours: colour eggs only';
        if (cs.length !== nC) return 'colours: two eggs in one colour';
        if (r.eggs.some(function (q) { return q.thing.size; })) return 'colours: a sized egg';
        break;
      }
      case 'shapes':
        if (nk.join() !== 'shape') return 'shapes: shape eggs only';
        for (i = 0; i < shapes.length; i++) if (shapesFor(age).indexOf(shapes[i]) < 0) return 'shape ' + shapes[i] + ' at age ' + age;
        if (age < 5 && (cs.length !== 1 || shapes.length !== nC)) return 'shapes: one colour, all shapes different';
        if (age >= 5 && nC >= 3) {   // the first ask needs both shape and colour
          var t0 = ids[r.steps[0].targets[0]].thing, sc = 0, ss = 0;
          r.eggs.forEach(function (q) { if (q.thing === t0) return; if (q.thing.color === t0.color) sc++; if (q.thing.shape === t0.shape) ss++; });
          if (!sc || !ss) return 'shapes5: the first answer needs both partners';
        }
        break;
      case 'size': {   // the big + small pair (both in the tune, or one of them + its partner as the distractor) + maybe a mid egg
        var pr = r.eggs.filter(function (q) { return q.thing.size === 'big' || q.thing.size === 'small'; }), mids = r.eggs.filter(function (q) { return q.thing.size === 'mid'; });
        if (pr.length !== 2 || pr.length + mids.length !== nC || r.eggs.some(function (q) { return q.thing.kind !== 'egg'; })) return 'size: the pair';
        var a0 = pr[0].thing, a1 = pr[1].thing;
        if (a0.color !== a1.color || [a0.size, a1.size].sort().join() !== 'big,small' || a0.nameKind !== 'size' || a1.nameKind !== 'size') return 'size pair';
        if (real.some(function (q) { return pr.indexOf(q) < 0; })) return 'size: a mid egg in the tune';
        if (nS === 1 && mids.length) return 'size: a mid egg with a 1-note tune';
        if (mids.some(function (q) { return q.target || q.thing.color === a0.color || q.thing.nameKind !== 'color'; })) return 'size distractor';
        break;
      }
      case 'animals': case 'initial':
        if (nk.join() !== 'animal') return 'animals only';
        if (r.topic === 'initial') {
          var ins = r.eggs.map(function (q) { return initialOf(q.thing.animal, r.lang); });
          for (i = 0; i < ins.length; i++) if (!ins[i] || ins.indexOf(ins[i]) !== i) return 'initials not distinct';
        }
        break;
      case 'count': {
        if (nk.join() !== 'dots') return 'count: dots eggs only';
        var nn = r.eggs.map(function (q) { return q.thing.n; });
        if (Math.max.apply(null, nn) > (ri === 0 ? 5 : DOTS_MAX[age] || 10)) return 'count: too many dots';
        if (age === 5 && hasNeighbours(nn)) return 'count: neighbours at age 5';
        break;
      }
      default: {   // glyphs
        if (nk.join() !== 'glyph') return 'glyphs only';
        var tx = r.eggs.map(function (q) { return q.thing.text; });
        if (r.topic === 'letters' && tx.some(function (c) { return letterPool(r.lang, 'letters').indexOf(c) < 0; })) return 'letter outside the pool';
        if (r.topic === 'lower') {
          if (tx.some(function (c) { return c !== c.toLowerCase() || /[il]/.test(c) || letterPool(r.lang, 'lower').indexOf(c.toUpperCase()) < 0; })) return 'lower: small letters of the pool without i / l';
          if (bdpqCount(tx) > 1) return 'lower: two of b / d / p / q';
          var bp = pairBad(tx, LOWER_PAIRS);
          if (bp) return 'lower: confusable ' + bp.join('+');
        }
        if (['add', 'sub', 'oddeven'].indexOf(r.topic) >= 0 && r.eggs.some(function (q) { return q.thing.n === undefined || q.thing.nameKind !== 'number'; })) return 'number glyphs';
        if (r.topic === 'oddeven' && r.eggs.some(function (q) { return q.thing.n > (ODDEVEN_MAX[age] || 12) || q.thing.n < 1; })) return 'oddeven range';
      }
    }
    if (r.key !== roundKey(r)) return 'key';
    return null;
  }

  /** Beat mode (count at ages ≤ 4): ONE big egg (the target), steps 'beat' with need = n (warm-up 1 step n ∈ {1, 2}; later 2
   *  steps — 1 when short — distinct n in 2–5 with one ≥ 3), the step notes distinct in the contour, the song = the big egg once per step. */
  function validateBeat(r) {
    if (r.eggs.length !== 1) return 'beat: ' + r.eggs.length + ' eggs';
    var c = r.eggs[0], t = c.thing, ri = r.roundIndex;
    if (!c.id || !c.target || !t || t.kind !== 'big' || !t.big || t.nameKind !== 'number' || t.nameValue === undefined) return 'beat: the big egg';
    if (!(c.note >= 0 && c.note < SE.NOTES.length)) return 'note';
    var ns = r.steps.map(function (s) { return s.need; }), k = ri === 0 ? 1 : r.short ? 1 : 2;
    if (ns.length !== k) return 'beat: ' + ns.length + ' steps (want ' + k + ')';
    if (ri === 0 && !(ns[0] === 1 || ns[0] === 2)) return 'beat warm-up ' + ns.join();
    if (ri > 0 && ((k === 2 && Math.max.apply(null, ns) < 3) || Math.min.apply(null, ns) < 2)) return 'beat: n 2–5 with one ≥ 3 after the warm-up';
    for (var i = 0; i < r.steps.length; i++) {
      var s = r.steps[i];
      if (s.mode !== 'beat' || s.promptKey !== 'p.beat' || !s.params || s.params.n !== s.need || s.nameKind !== 'number' || s.nameValue !== s.need) return 'beat step prompt';
      if (s.targets.length !== 1 || s.targets[0] !== c.id) return 'beat step target';
      if (!(s.need >= 1 && s.need <= 5 && s.need === Math.floor(s.need))) return 'beat n ' + s.need;
      if (ns.indexOf(s.need) !== i) return 'beat: n twice';
      if (!matches(r, s, t)) return 'beat: the big egg does not answer';
      if (!(s.note >= 0 && s.note < SE.NOTES.length && s.note === Math.floor(s.note))) return 'beat: step note';
    }
    var bc = contourOf(r.steps.map(function (s) { return s.note; }));
    if (!bc || bc !== r.contour) return 'beat: tune contour ' + bc + ' ≠ ' + r.contour;
    if (c.note !== r.steps[0].note) return 'beat: egg note';
    if (r.song.length !== r.steps.length || r.song.some(function (id) { return id !== c.id; })) return 'beat: song';
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
  function nearNums(ans, lo, hi, k, rng) {
    var c = rng.shuffle(range(lo, hi).filter(function (x) { return x !== ans && Math.abs(x - ans) <= 3; }));
    if (c.length < k) c = c.concat(rng.shuffle(range(lo, hi).filter(function (x) { return x !== ans && c.indexOf(x) < 0; })));
    return c.slice(0, k);
  }
  /**
   * makeTalk(topic, { age, lang, rng }) → { topic, promptKey 'talk.<topic>', params, show, choices [{id, thing, value}], answer, answerId }
   *   colors  "What colour is this egg?" {color}       show egg,           choices {kind:'color'} paint blobs (clash-free below 5)
   *   shapes  "Which one is the {shape}?" {shape}       show null,           choices shape eggs (one colour)
   *   size    "Which egg is {size}?" {size}            show null,           choices {kind:'size', big, size, color}
   *   animals "Where is the {animal}?" {animal}         show null,           choices animal eggs
   *   count   "How many dots?" {n, kind 'dots'}         show a dots egg,    choices {kind:'number', n} (numeral + dots)
   *   letters "Where is the letter {letter}?"           show null,           choices letter glyphs
   *   lower   "Find small {small}" {letter, small}      show capital glyph,  choices small glyphs
   *   initial "Which letter does {animal} start with?"  show animal egg,   choices letter glyphs
   *   add/sub "What is {a} + {b}?" {a, b}               show null,           choices numbers
   *   oddeven "Which number is {parity}?" {parity}      show null,           choices numbers (exactly one of that parity)
   * Ages ≤ 3: 2 choices, else 3. Every choice is a picture (ages ≤ 5 never need reading: colours, shapes, animals, numerals with dots).
   */
  function makeTalk(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new SE.RNG(1);
    var show = null, params = {}, ch, a, nC = age <= 3 ? 2 : 3;
    switch (topic) {
      case 'colors': {
        var set = colourSet(rng, age, 3); a = set[0]; params = { color: a }; show = egg(a);
        ch = choicesFrom(rng, a, set, nC, function (c) { return { kind: 'color', color: c }; }); break;
      }
      case 'shapes': {
        var col = colourSet(rng, age, 1)[0], shs = shapeSet(rng, age, 3); a = shs[0]; params = { shape: a };
        ch = choicesFrom(rng, a, shs, nC, function (s) { return shapeD(s, col); }); break;
      }
      case 'size': {
        var c2 = colourSet(rng, age, 1)[0]; a = rng.pick(['big', 'small']); params = { size: a, color: c2 };
        ch = choicesFrom(rng, a, ['big', 'small'], 2, function (s) { return { kind: 'size', big: s === 'big', size: s, color: c2 }; });
        break;
      }
      case 'animals': {
        a = rng.pick(SE.ANIMALS); params = { animal: a };
        ch = choicesFrom(rng, a, SE.ANIMALS, nC, function (x) { return animal(x); }); break;
      }
      case 'count': {
        var kd = 'dots', rr = { 3: [1, 4], 4: [1, 5], 5: [2, 8], 6: [3, 10], 7: [3, 10] }[age];
        a = rng.int(rr[0], rr[1]); params = { n: a, kind: kd }; show = dots(a);
        var near = range(Math.max(1, a - 2), a + 2).filter(function (x) { return x !== a && (age > 4 || x <= 5); });
        ch = choicesFrom(rng, a, near, nC, function (x) { return { kind: 'number', n: x }; }); break;
      }
      case 'letters': case 'lower': {
        var P = letterPool(lang, topic); a = rng.pick(P);
        if (topic === 'lower') { params = { letter: a, small: a.toLowerCase() }; show = glyphL(a); }
        else params = { letter: a };
        ch = choicesFrom(rng, a, P, 3, function (x) { return glyphL(topic === 'lower' ? x.toLowerCase() : x); }); break;
      }
      case 'initial': {
        var an2 = rng.pick(SE.ANIMALS.filter(function (x) { return initialOf(x, lang); })); a = initialOf(an2, lang);
        show = animal(an2); params = { animal: an2, letter: a };
        var lp = LETTER_POOL[lang].split('').filter(function (x) { return x !== a; });
        ch = choicesFrom(rng, a, lp, 3, function (x) { return glyphL(x); }); break;
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
      default: throw new Error('SE.Content: unknown topic ' + topic);
    }
    return { topic: topic, promptKey: 'talk.' + topic, params: params, show: show, choices: ch.choices, answer: ch.answer, answerId: ch.answer };
  }

  /** 4 chapter topics for a session, easiest first. Without rng or `last`: SE.AGE_TOPICS (the first session). With both:
   *  chapter 1 = the pool topic left out last time (else the easiest one that did not open last time); chapters 2–4 =
   *  3 of the others (preferring topics left out of `last`), in pool (difficulty) order. */
  function topicsFor(age, rng, last) {
    age = ageOf(age);
    last = Array.isArray(last) ? last : [];
    if (!rng || !last.length) return SE.AGE_TOPICS[age].slice();
    var pool = SE.AGE_POOLS[age].slice(), ord = function (a, b) { return pool.indexOf(a) - pool.indexOf(b); };
    var unused = pool.filter(function (t) { return last.indexOf(t) < 0; });
    var first = unused.length ? unused[0] : pool[0];
    if (!unused.length) for (var i = 0; i < pool.length; i++) if (pool[i] !== last[0]) { first = pool[i]; break; }
    var rest = pool.filter(function (t) { return t !== first; });
    var fresh = rng.shuffle(rest.filter(function (t) { return last.indexOf(t) < 0; }));
    var old = rng.shuffle(rest.filter(function (t) { return last.indexOf(t) >= 0; }));
    return [first].concat(fresh.concat(old).slice(0, 3)).sort(ord);
  }

  SE.Content = {
    makeRound: makeRound, makeTalk: makeTalk, validate: validate, topicsFor: topicsFor, matches: matches, stepFor: stepFor,
    ageOf: ageOf, langOf: langOf, clash: clash, safeSets: safeSets, maxSafe: maxSafe, pairsFor: pairsFor, sameAnswer: sameAnswer,
    shapesFor: shapesFor, parityOf: parityOf, letterPool: letterPool, initialOf: initialOf, thingKey: thingKey, roundKey: roundKey,
    countsFor: countsFor, beatMode: beatMode, tuneRange: tuneRange, distractorsFor: distractorsFor, pickTune: pickTune, contourOf: contourOf,
    initialPool: initialPool, TUNE: TUNE,
    TOPICS: ALL_TOPICS, COLORS: COLORS, COLORS5: COLORS5, SHAPES3: SHAPES3, SHAPE_PAIRS: SHAPE_PAIRS, LOWER_PAIRS: LOWER_PAIRS, BDPQ: BDPQ,
    LETTER_POOL: LETTER_POOL, CLASH: CLASH, COLOR_SAFE_BELOW: COLOR_SAFE_BELOW, MAX_DRUMS: MAX_DRUMS, ADD_MAX: ADD_MAX, SUB_MAX: SUB_MAX,
    ODDEVEN_MAX: ODDEVEN_MAX, DOTS_MAX: DOTS_MAX, SIZE_K: SIZE_K
  };
})(window.SE = window.SE || {});
