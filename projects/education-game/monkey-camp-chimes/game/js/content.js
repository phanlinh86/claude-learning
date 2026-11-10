/* Kiki's Camp Chimes — CC.PALETTE, CC.COLORS, CC.SHAPES, CC.ANIMALS, CC.NOTES, CC.AGE_TOPICS, CC.AGE_POOLS, CC.TOY_WORDS,
 * CC.CHIME_KINDS, CC.Content (pure + deterministic; DESIGN §5.1)
 *
 *   CC.Content.makeRound(topic, { age, lang, rng, roundIndex, level, surprise, short?, usedKeys?, prevKey?, prevAns?, prevAnsRun? })
 *       → round  (self-checked with validate; retries, throws when it cannot build a valid round)
 *   CC.Content.makeTalk(topic, { age, lang, rng }) → talk
 *   CC.Content.validate(round) → null | 'reason'
 *   CC.Content.topicsFor(age, rng?, lastTopics?) → the 4 chapter topics (easiest first)
 *   CC.Content.matches(round, step, thing) → bool (does this chime answer this step)
 *
 * round = { topic, age, lang, roundIndex, level, short, surprise: null|'hedgehog'|'bird'|'fireflies', key, seed,
 *   chimes: [ { id 'c0'…, thing, note (index into CC.NOTES), target: bool } ]   (order = hook order on the beam, left → right)
 *   steps:  [ { mode 'find'|'findAll', targets [chimeId], need, promptKey, params, nameKind, nameValue } ]
 *   song:   [chimeId…]   the targets in step order (= the tune; their notes climb) }
 * thing = { kind 'bell'|'plate'|'string'|'dots'|'animal'|'glyph', color?, shape?, n?, animal?, text?, big?, size?, nameKind, nameValue }
 *   nameKind / nameValue name the chime the way this round's question is about:
 *     bell (colors) → 'color' / 'red'   · bell (size) → 'size' / 'big'|'small' (+ big: bool, size)  · animal (size-round distractor) → 'animal'
 *     plate → 'shape' / 'star' (+ color) · string / dots → 'number' / 3 · animal → 'animal' / 'bear' · glyph → 'letter' / 'B'|'b' or 'number' / 7
 * step: find = exactly ONE target; at every step exactly one chime not yet rung right matches (distractors never match).
 *       findAll (oddeven) = every right-parity chime (2–3); need = targets.length.
 * Prompt keys / params: p.colors {color} · p.shapes {shape, color} · p.shapes5 {shape, color} · p.size {size, color} ·
 *   p.count {n, kind 'string'|'dots'} · p.animals {animal} · p.letters {letter} · p.lower {letter (CAPITAL shown), small} ·
 *   p.initial {letter, animal} · p.add {a, b} · p.sub {a, b} · p.oddeven {parity}
 * talk = { topic, promptKey 'talk.<topic>', params, show: icon | null, choices [{ id, thing: icon, value }], answer, answerId }
 *   icon = any chime thing (drawn with ChimeArt.drawIcon) or { kind:'number', n } · { kind:'color', color } · { kind:'size', big, size, color }
 */
(function (CC) {
  'use strict';

  // DESIGN §3 answer palette (exact hex)
  CC.PALETTE = {
    red:    { base: '#E84A4A', dark: '#A8282E', light: '#F7A0A0' },
    blue:   { base: '#3C8DE8', dark: '#1F5BA8', light: '#A6CCF5' },
    yellow: { base: '#FFD23F', dark: '#C99A12', light: '#FFEB9C' },
    green:  { base: '#4CC26B', dark: '#2A8343', light: '#A8E6B8' },
    orange: { base: '#FF9A2E', dark: '#C4650C', light: '#FFCB8E' },
    purple: { base: '#8E44AD', dark: '#6840A8', light: '#D2BDF3' },
    pink:   { base: '#FF8FC0', dark: '#C9558A', light: '#FFCCE2' }      // an answer colour from age 5
  };
  for (var pk in CC.PALETTE) CC.PALETTE[pk].fill = CC.PALETTE[pk].base;
  CC.BRASS = { base: '#D8B26A', dark: '#9C7838', light: '#F3DFAE' };
  CC.WOOD = { base: '#A87245', dark: '#6E4526', light: '#D29A66' };
  CC.COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  var COLORS = CC.COLORS.slice(0, 6), COLORS5 = CC.COLORS.slice();
  CC.SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
  CC.ANIMALS = ['bear', 'fox', 'owl', 'deer', 'rabbit', 'squirrel', 'frog', 'duck'];
  CC.CHIME_KINDS = ['bell', 'plate', 'string', 'dots', 'animal', 'glyph'];
  CC.NOTES = ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6'];          // pentatonic; a chime's `note` is an index into this
  CC.NOTE_HZ = [523.25, 587.33, 659.26, 783.99, 880.0, 1046.5, 1174.66];

  CC.AGE_TOPICS = {
    3: ['colors', 'shapes', 'size', 'animals'],
    4: ['colors', 'shapes', 'count', 'animals'],
    5: ['shapes', 'count', 'letters', 'animals'],
    6: ['lower', 'initial', 'add', 'count'],
    7: ['initial', 'add', 'sub', 'oddeven']
  };
  /* Every age has a POOL of 5 topics in difficulty order; a session plays 4 of them (rotating between sessions). */
  CC.AGE_POOLS = {
    3: ['colors', 'shapes', 'size', 'animals', 'count'],
    4: ['colors', 'size', 'shapes', 'count', 'animals'],
    5: ['colors', 'shapes', 'count', 'letters', 'animals'],
    6: ['letters', 'lower', 'initial', 'add', 'count'],
    7: ['count', 'initial', 'add', 'sub', 'oddeven']
  };
  var ALL_TOPICS = ['colors', 'shapes', 'size', 'animals', 'count', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];

  // ---- tables (DESIGN §5.1)
  var MAX_CHIMES = 5;
  var SHAPES3 = ['circle', 'square', 'triangle', 'star', 'heart'];   // age 3; all 8 from age 4
  var SHAPE_PAIRS = [['square', 'rect'], ['circle', 'oval'], ['square', 'diamond']];   // never together in one round
  var LETTER_POOL = { en: 'ABCDEFGHIKLMNOPRSTUW', vi: 'ABCDEGHIKLMNOPSTUVXY' };
  var LOWER_SKIP = 'IL';                                             // capital I and small l look alike
  var BDPQ = ['b', 'd', 'p', 'q'];                                   // at most one of these per round (mirror letters)
  var LOWER_PAIRS = [['m', 'w'], ['n', 'u']];
  var ADD_MAX = { 5: 10, 6: 10, 7: 20 }, SUB_MAX = 10, ODDEVEN_MAX = { 5: 10, 6: 12, 7: 20 }, DOTS_MAX = { 5: 10, 6: 12, 7: 12 };
  var SIZE_K = { big: 1.25, small: 0.75 };
  /* 'initial' words (the animal chimes are the pictures). VI without the classifier "con". Same approach as the sister games:
   * the initial is the word's first letter with tone marks dropped; a letter with its own marks (ếch → Ê) is not in the VI
   * letter pool, so that animal is left out of VI 'initial' rounds. */
  CC.TOY_WORDS = {
    en: { bear: 'bear', fox: 'fox', owl: 'owl', deer: 'deer', rabbit: 'rabbit', squirrel: 'squirrel', frog: 'frog', duck: 'duck' },
    vi: { bear: 'gấu', fox: 'cáo', owl: 'cú', deer: 'hươu', rabbit: 'thỏ', squirrel: 'sóc', frog: 'ếch', duck: 'vịt' }
  };
  function langOf(l) { return l === 'vi' ? 'vi' : 'en'; }
  /** The initial letter of the animal's word (capital, tone marks dropped), or null when it is not in that language's pool. */
  function initialOf(animal, lang) {
    var w = CC.TOY_WORDS[langOf(lang)][animal];
    if (!w) return null;
    var c = w.charAt(0).normalize('NFD');
    if (c.length > 1) return null;
    c = c.toUpperCase();
    return LETTER_POOL[langOf(lang)].indexOf(c) >= 0 ? c : null;
  }

  /* Colour safety (DESIGN §3): below age 5 one round never holds blue+purple, red+green, yellow+orange, green+orange or
   * red+orange (every answer-coloured chime: bells, plates), and no pink. At most 3 colours fit below age 5. */
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

  function ageOf(a) { a = Math.round(+a || 4); return a < 3 ? 3 : a > 7 ? 7 : a; }
  function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }
  function shapesFor(age) { return age <= 3 ? SHAPES3.slice() : CC.SHAPES.slice(); }
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
  function bell(c) { return { kind: 'bell', color: c, nameKind: 'color', nameValue: c }; }
  function plate(s, c) { return { kind: 'plate', shape: s, color: c, nameKind: 'shape', nameValue: s }; }
  function string(n) { return { kind: 'string', n: n, nameKind: 'number', nameValue: n }; }
  function dots(n) { return { kind: 'dots', n: n, nameKind: 'number', nameValue: n }; }
  function animal(a) { return { kind: 'animal', animal: a, nameKind: 'animal', nameValue: a }; }
  function glyphL(c) { return { kind: 'glyph', text: String(c), nameKind: 'letter', nameValue: String(c) }; }
  function glyphN(n) { return { kind: 'glyph', text: String(n), n: n, nameKind: 'number', nameValue: n }; }
  function thingKey(t) { return [t.kind, t.color || '', t.shape || '', t.n === undefined ? '' : t.n, t.animal || '', t.text || '', t.size || ''].join(':'); }
  /** The round's set of chimes, order-free (targets and distractors marked apart). */
  function roundKey(r) {
    return r.chimes.map(function (c) { return (c.target ? 'T' : 'D') + thingKey(c.thing); }).sort().join(',');
  }

  // ---------------- counts ----------------
  /** { n: targets, d: distractors } (DESIGN §5.1). Warm-up 2 + 0; short rounds 2; age 3: 2 (+1 from round 2, not in the first
   *  chapter); age 4: 3 + 1 (first chapter 3 + 0); age 5: 3–4 + 1; ages 6+: 4 + 1. */
  function countsFor(rng, age, ri, level, short) {
    if (ri === 0) return { n: 2, d: 0 };
    var n, d;
    if (age <= 3) { n = 2; d = ri >= 2 && level !== 0 ? 1 : 0; }
    else if (age === 4) { n = 3; d = level === 0 ? 0 : 1; }
    else if (age === 5) { n = rng.int(3, 4); d = 1; }
    else { n = 4; d = 1; }
    if (short) n = 2;
    return { n: n, d: d };
  }
  function S(mode, targets, need, promptKey, params, nameKind, nameValue) {
    return { mode: mode, targets: targets, need: need, promptKey: promptKey, params: params, nameKind: nameKind, nameValue: nameValue };
  }

  // ---------------- matching (one rule per topic; the world judges by step.targets, validate checks targets = matches) ----------------
  function matches(r, s, t) {
    var p = s.params || {};
    switch (r.topic) {
      case 'colors': return t.kind === 'bell' && t.color === p.color;
      case 'shapes': return t.kind === 'plate' && t.shape === p.shape && (s.promptKey !== 'p.shapes5' || t.color === p.color);
      case 'size': return t.kind === 'bell' && t.size === p.size;
      case 'animals': return t.kind === 'animal' && t.animal === p.animal;
      case 'initial': return t.kind === 'animal' && initialOf(t.animal, r.lang) === p.letter;
      case 'count': return (t.kind === 'string' || t.kind === 'dots') && t.n === p.n;
      case 'letters': return t.kind === 'glyph' && t.text === p.letter;
      case 'lower': return t.kind === 'glyph' && t.text === p.small;
      case 'add': return t.kind === 'glyph' && t.n === p.a + p.b;
      case 'sub': return t.kind === 'glyph' && t.n === p.a - p.b;
      case 'oddeven': return t.kind === 'glyph' && t.n !== undefined && parityOf(t.n) === p.parity;
    }
    return false;
  }
  /** The find step asking for chime `c` (the prompt follows from the thing). */
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
  function buildRound(topic, age, lang, rng, ri, level, short) {
    var real = [], extra = [], steps = [], i, cn = countsFor(rng, age, ri, level, short), n = cn.n, d = cn.d;
    var r = { topic: topic, age: age, lang: lang, roundIndex: ri, level: level, short: !!short, surprise: null, chimes: null, steps: steps, song: null };
    var probs = null, oddPar = null;
    switch (topic) {
      case 'colors': {
        if (n + d > maxSafe(age)) n = maxSafe(age) - d;   // below age 5 only 3 colours fit in a round: 2 + 1 distractor
        var cs = colourSet(rng, age, n + d);
        for (i = 0; i < n + d; i++) (i < n ? real : extra).push(bell(cs[i]));
        break;
      }
      case 'shapes': {
        if (age < 5) {
          var col = colourSet(rng, age, 1)[0], shs = shapeSet(rng, age, n + d);
          for (i = 0; i < n + d; i++) (i < n ? real : extra).push(plate(shs[i], col));
        } else {   // shapes5: a 2 × 2 grid of 2 shapes × 2 colours (+ one extra plate) → the answer needs both shape and colour
          var sh = shapeSet(rng, age, 3), cc = colourSet(rng, age, 3);
          var grid = rng.shuffle([plate(sh[0], cc[0]), plate(sh[0], cc[1]), plate(sh[1], cc[0]), plate(sh[1], cc[1])]);
          if (n + d >= 5) grid.push(rng.chance(0.5) ? plate(sh[2], cc[rng.int(0, 1)]) : plate(sh[rng.int(0, 1)], cc[2]));
          grid = grid.slice(0, n + d);
          var gi = rng.shuffle(range(0, grid.length - 1));
          for (i = 0; i < gi.length; i++) (i < n ? real : extra).push(grid[gi[i]]);
        }
        break;
      }
      case 'size': {   // a big and a small bell of one colour (+ an animal chime from round 2: not a bell at all)
        n = 2;
        var c1 = colourSet(rng, age, 1)[0];
        ['big', 'small'].forEach(function (sz) {
          var t = bell(c1); t.size = sz; t.big = sz === 'big'; t.nameKind = 'size'; t.nameValue = sz; real.push(t);
        });
        if (d) extra.push(animal(rng.pick(CC.ANIMALS)));
        break;
      }
      case 'animals': {
        var an = rng.sample(CC.ANIMALS, n + d);
        for (i = 0; i < n + d; i++) (i < n ? real : extra).push(animal(an[i]));
        break;
      }
      case 'initial': {   // animals with distinct initials in this language
        var byI = {};
        rng.shuffle(CC.ANIMALS.slice()).forEach(function (a) { var c = initialOf(a, lang); if (c && !byI[c]) byI[c] = a; });
        var pool = rng.shuffle(Object.keys(byI).map(function (c) { return byI[c]; }));
        if (n + d > pool.length) d = Math.max(0, pool.length - n);
        for (i = 0; i < n + d; i++) (i < n ? real : extra).push(animal(pool[i]));
        break;
      }
      case 'count': {
        var vals;
        if (age <= 4) {   // bell strings 1–5: warm-up 1 vs 2, round 1 up to 4, later up to 5
          var hi = ri === 0 ? 2 : ri === 1 ? 4 : 5;
          vals = rng.sample(range(1, hi), n + d);
          if (ri >= 1) vals.sort(function (a, b) { return b - a; });   // playtest P2-3: the targets are the bigger strings (practise 3–5), the distractor the smallest
          for (i = 0; i < n + d; i++) (i < n ? real : extra).push(string(vals[i]));
        } else {          // dot plates: warm-up ≤ 5, later 1–10 (6+: 12); age 5: no two neighbours
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
        oddPar = rng.pick(['odd', 'even']);
        var hiO = ODDEVEN_MAX[age] || 12;
        var rt = rng.sample(range(1, hiO).filter(function (x) { return parityOf(x) === oddPar; }), n);
        var wr = rng.sample(range(1, hiO).filter(function (x) { return parityOf(x) !== oddPar; }), d);
        rt.forEach(function (x) { real.push(glyphN(x)); });
        wr.forEach(function (x) { extra.push(glyphN(x)); });
        break;
      }
      default: throw new Error('CC.Content: unknown topic ' + topic);
    }
    // chimes in random hook order (left → right)
    var all = real.map(function (t) { return { t: t, real: true }; }).concat(extra.map(function (t) { return { t: t, real: false }; }));
    rng.shuffle(all);
    r.chimes = all.map(function (q, k) { return { id: 'c' + k, thing: q.t, note: -1, target: q.real }; });
    var targ = r.chimes.filter(function (c) { return c.target; });
    // steps
    if (topic === 'oddeven') {
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
    // the tune: targets in step order get ascending pentatonic notes; distractors a random free note
    r.song = [];
    steps.forEach(function (s) { s.targets.forEach(function (id) { r.song.push(id); }); });
    var notes = rng.sample(range(0, CC.NOTES.length - 1), r.song.length).sort(function (x, y) { return x - y; });
    r.song.forEach(function (id, k) { byId(r, id).note = notes[k]; });
    var free = range(0, CC.NOTES.length - 1).filter(function (x) { return notes.indexOf(x) < 0; });
    r.chimes.forEach(function (c) { if (c.note < 0) c.note = free.length ? free.splice(rng.int(0, free.length - 1), 1)[0] : rng.int(0, CC.NOTES.length - 1); });
    r.key = roundKey(r);
    return r;
  }
  function byId(r, id) { for (var i = 0; i < r.chimes.length; i++) if (r.chimes[i].id === id) return r.chimes[i]; return null; }

  /**
   * makeRound(topic, o) → round. `prevKey` / `usedKeys` = keys of earlier rounds (the same set never twice in a chapter while
   * another one is possible), `prevAns` / `prevAnsRun` = the answer asked last (the next round does not open with it).
   */
  function makeRound(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new CC.RNG(1), ri = o.roundIndex || 0;
    var level = o.level === undefined || o.level === null ? 1 : o.level | 0;
    if (ALL_TOPICS.indexOf(topic) < 0) throw new Error('CC.Content: unknown topic ' + topic);
    var used = (o.usedKeys || []).slice(); if (o.prevKey) used.push(o.prevKey);
    var r = null, err = null;
    for (var attempt = 0; attempt < 80; attempt++) {
      try {
        r = buildRound(topic, age, lang, rng, ri, level, !!o.short);
        err = validate(r);
        if (!err && attempt < 60 && used.indexOf(r.key) >= 0) err = 'the same set as an earlier round';
        if (!err && attempt < 40 && sameAnswer(r, o.prevAns, o.prevAnsRun)) err = 'the same answer as the previous round';
      } catch (e) { r = null; err = e.message; }
      if (!err) break;
    }
    if (err) throw new Error('CC.Content: invalid round (' + topic + ', age ' + age + ', round ' + ri + '): ' + err);
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
    if (!r || !r.chimes || !r.steps || !r.song) return 'no chimes / steps / song';
    var i, j, ids = {}, nC = r.chimes.length, age = r.age, ri = r.roundIndex;
    if (nC < 2 || nC > MAX_CHIMES) return nC + ' chimes';
    var real = [], extra = [];
    for (i = 0; i < nC; i++) {
      var c = r.chimes[i], t = c.thing;
      if (!c.id || ids[c.id]) return 'chime id ' + c.id;
      ids[c.id] = c;
      if (!t || CC.CHIME_KINDS.indexOf(t.kind) < 0) return 'chime kind';
      if (!t.nameKind || t.nameValue === undefined || t.nameValue === null) return 'chime name';
      if ((t.kind === 'bell' || t.kind === 'plate') && !CC.PALETTE[t.color]) return 'chime colour ' + t.color;
      if (t.kind === 'plate' && CC.SHAPES.indexOf(t.shape) < 0) return 'shape';
      if (t.kind === 'animal' && CC.ANIMALS.indexOf(t.animal) < 0) return 'animal';
      if (t.kind === 'string' && !(t.n >= 1 && t.n <= 5)) return 'string n ' + t.n;
      if (t.kind === 'dots' && !(t.n >= 1 && t.n <= 12)) return 'dots n ' + t.n;
      if (t.kind === 'glyph' && !(t.text && t.text.length >= 1 && t.text.length <= 2)) return 'glyph text';
      if (t.kind === 'glyph' && t.n !== undefined && String(t.n) !== t.text) return 'glyph number';
      if (t.size && (!SIZE_K[t.size] || t.big !== (t.size === 'big'))) return 'size';
      if (!(c.note >= 0 && c.note < CC.NOTES.length && c.note === Math.floor(c.note))) return 'note';
      (c.target ? real : extra).push(c);
    }
    // counts (DESIGN §5.1)
    var nS = real.length, lvl0 = r.level === 0, wantD, oe = r.topic === 'oddeven';
    if (oe) {
      if (nS < 2 || nS > 3 || extra.length < 1 || extra.length > 2) return 'oddeven ' + nS + ' + ' + extra.length;
    } else {
      if (ri === 0) { if (nS !== 2 || extra.length) return 'warm-up ' + nS + ' + ' + extra.length; }
      else {
        wantD = age <= 3 ? (ri >= 2 && !lvl0 ? 1 : 0) : age === 4 ? (lvl0 ? 0 : 1) : 1;
        if (r.topic === 'initial' && extra.length < wantD && nC >= 5) wantD = extra.length;
        if (extra.length !== wantD) return 'distractors ' + extra.length + ' (want ' + wantD + ')';
        var lo = age <= 3 ? 2 : age === 4 ? 3 : age === 5 ? 3 : 4, hi = age <= 4 ? lo : 4;
        if (r.short || r.topic === 'size') lo = hi = 2;
        if (r.topic === 'colors' && age < COLOR_SAFE_BELOW) { hi = Math.min(hi, maxSafe(age) - wantD); lo = Math.min(lo, hi); }
        if (nS < lo || nS > hi) return nS + ' targets not in ' + lo + '–' + hi;
      }
    }
    // steps: simulate the round in step order — at every find step exactly one chime not yet rung right matches
    var rung = {}, asked = {}, song = [];
    if (!r.steps.length) return 'no steps';
    for (i = 0; i < r.steps.length; i++) {
      var s = r.steps[i];
      if (s.mode !== (oe ? 'findAll' : 'find')) return 'step mode ' + s.mode;
      if (!s.promptKey || !s.params || !s.nameKind || s.nameValue === undefined) return 'step prompt';
      if (!s.targets || !s.targets.length || s.need !== s.targets.length) return 'step targets / need';
      for (j = 0; j < s.targets.length; j++) {
        if (!ids[s.targets[j]] || !ids[s.targets[j]].target) return 'target ' + s.targets[j] + ' is not a target chime';
        if (asked[s.targets[j]]) return 'a chime asked twice';
        asked[s.targets[j]] = 1; song.push(s.targets[j]);
      }
      var hits = r.chimes.filter(function (q) { return !rung[q.id] && matches(r, s, q.thing); }).map(function (q) { return q.id; });
      if (s.mode === 'find') {
        if (s.targets.length !== 1) return 'find step with ' + s.targets.length + ' targets';
        if (hits.length !== 1 || hits[0] !== s.targets[0]) return 'find ' + s.promptKey + ' ' + JSON.stringify(s.params) + ' matches ' + hits.length + ' chimes';
        if (r.chimes.some(function (q) { return !q.target && matches(r, s, q.thing); })) return 'a distractor matches';
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
    // the tune: the targets in step order, notes strictly climbing; all notes in the round distinct while 7 notes suffice
    if (r.song.join() !== song.join()) return 'song ≠ targets in step order';
    for (i = 1; i < r.song.length; i++) if (!(ids[r.song[i]].note > ids[r.song[i - 1]].note)) return 'the song does not climb';
    var ns = r.chimes.map(function (q) { return q.note; });
    for (i = 0; i < ns.length; i++) if (ns.indexOf(ns[i]) !== i) return 'two chimes on one note';
    // colours (DESIGN §3): every answer-coloured chime of the round
    var cs = [];
    r.chimes.forEach(function (q) { if (q.thing.color && cs.indexOf(q.thing.color) < 0) cs.push(q.thing.color); });
    if (clash(cs, pairsFor(age)) || (age < COLOR_SAFE_BELOW && cs.indexOf('pink') >= 0)) return 'colour clash in ' + cs.join('+');
    var keys = r.chimes.map(function (q) { return thingKey(q.thing); }), kinds = {}, shapes = [];
    for (i = 0; i < keys.length; i++) if (keys.indexOf(keys[i]) !== i) return 'two chimes alike';
    r.chimes.forEach(function (q) { kinds[q.thing.kind] = 1; if (q.thing.shape && shapes.indexOf(q.thing.shape) < 0) shapes.push(q.thing.shape); });
    var nk = Object.keys(kinds).sort();
    var bad = pairBad(shapes, SHAPE_PAIRS);
    if (bad) return 'confusable shapes ' + bad.join('+');
    switch (r.topic) {
      case 'colors': {
        if (nk.join() !== 'bell') return 'colours: bells only';
        if (cs.length !== nC) return 'colours: two bells in one colour';
        if (r.chimes.some(function (q) { return q.thing.size; })) return 'colours: a sized bell';
        break;
      }
      case 'shapes':
        if (nk.join() !== 'plate') return 'shapes: plates only';
        for (i = 0; i < shapes.length; i++) if (shapesFor(age).indexOf(shapes[i]) < 0) return 'shape ' + shapes[i] + ' at age ' + age;
        if (age < 5 && (cs.length !== 1 || shapes.length !== nC)) return 'shapes: one colour, all shapes different';
        if (age >= 5 && nC >= 3) {   // the first ask needs both shape and colour
          var t0 = ids[r.steps[0].targets[0]].thing, sc = 0, ss = 0;
          r.chimes.forEach(function (q) { if (q.thing === t0) return; if (q.thing.color === t0.color) sc++; if (q.thing.shape === t0.shape) ss++; });
          if (!sc || !ss) return 'shapes5: the first answer needs both partners';
        }
        break;
      case 'size': {
        if (nS !== 2 || real.some(function (q) { return q.thing.kind !== 'bell'; })) return 'size: 2 bells';
        var a0 = real[0].thing, a1 = real[1].thing;
        if (a0.color !== a1.color || [a0.size, a1.size].sort().join() !== 'big,small') return 'size pair';
        if (extra.some(function (q) { return q.thing.kind === 'bell' || q.thing.size; })) return 'size distractor';
        break;
      }
      case 'animals': case 'initial':
        if (nk.join() !== 'animal') return 'animals only';
        if (r.topic === 'initial') {
          var ins = r.chimes.map(function (q) { return initialOf(q.thing.animal, r.lang); });
          for (i = 0; i < ins.length; i++) if (!ins[i] || ins.indexOf(ins[i]) !== i) return 'initials not distinct';
        }
        break;
      case 'count': {
        var want = age <= 4 ? 'string' : 'dots';
        if (nk.join() !== want) return 'count: ' + want + ' only';
        var nn = r.chimes.map(function (q) { return q.thing.n; });
        if (want === 'string' && Math.max.apply(null, nn) > (ri === 0 ? 2 : ri === 1 ? 4 : 5)) return 'count: too many bells for round ' + ri;
        if (want === 'dots' && Math.max.apply(null, nn) > (ri === 0 ? 5 : DOTS_MAX[age] || 10)) return 'count: too many dots';
        if (age === 5 && hasNeighbours(nn)) return 'count: neighbours at age 5';
        break;
      }
      default: {   // glyphs
        if (nk.join() !== 'glyph') return 'glyphs only';
        var tx = r.chimes.map(function (q) { return q.thing.text; });
        if (r.topic === 'letters' && tx.some(function (c) { return letterPool(r.lang, 'letters').indexOf(c) < 0; })) return 'letter outside the pool';
        if (r.topic === 'lower') {
          if (tx.some(function (c) { return c !== c.toLowerCase() || /[il]/.test(c) || letterPool(r.lang, 'lower').indexOf(c.toUpperCase()) < 0; })) return 'lower: small letters of the pool without i / l';
          if (bdpqCount(tx) > 1) return 'lower: two of b / d / p / q';
          var bp = pairBad(tx, LOWER_PAIRS);
          if (bp) return 'lower: confusable ' + bp.join('+');
        }
        if (['add', 'sub', 'oddeven'].indexOf(r.topic) >= 0 && r.chimes.some(function (q) { return q.thing.n === undefined || q.thing.nameKind !== 'number'; })) return 'number glyphs';
        if (r.topic === 'oddeven' && r.chimes.some(function (q) { return q.thing.n > (ODDEVEN_MAX[age] || 12) || q.thing.n < 1; })) return 'oddeven range';
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
  function nearNums(ans, lo, hi, k, rng) {
    var c = rng.shuffle(range(lo, hi).filter(function (x) { return x !== ans && Math.abs(x - ans) <= 3; }));
    if (c.length < k) c = c.concat(rng.shuffle(range(lo, hi).filter(function (x) { return x !== ans && c.indexOf(x) < 0; })));
    return c.slice(0, k);
  }
  /**
   * makeTalk(topic, { age, lang, rng }) → { topic, promptKey 'talk.<topic>', params, show, choices [{id, thing, value}], answer, answerId }
   *   colors  "What colour is this bell?" {color}       show bell,           choices {kind:'color'} paint blobs (clash-free below 5)
   *   shapes  "Which one is the {shape}?" {shape}       show null,           choices plates (one colour)
   *   size    "Which bell is {size}?" {size}            show null,           choices {kind:'size', big, size, color}
   *   animals "Where is the {animal}?" {animal}         show null,           choices animal chimes
   *   count   "How many bells / dots?" {n, kind}        show string / dots,  choices {kind:'number', n}
   *   letters "Where is the letter {letter}?"           show null,           choices letter glyphs
   *   lower   "Find small {small}" {letter, small}      show capital glyph,  choices small glyphs
   *   initial "Which letter does {animal} start with?"  show animal chime,   choices letter glyphs
   *   add/sub "What is {a} + {b}?" {a, b}               show null,           choices numbers
   *   oddeven "Which number is {parity}?" {parity}      show null,           choices numbers (exactly one of that parity)
   * Ages ≤ 3: 2 choices, else 3. Every choice is a picture (ages ≤ 5 never need reading: colours, shapes, animals, numerals with dots).
   */
  function makeTalk(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new CC.RNG(1);
    var show = null, params = {}, ch, a, nC = age <= 3 ? 2 : 3;
    switch (topic) {
      case 'colors': {
        var set = colourSet(rng, age, 3); a = set[0]; params = { color: a }; show = bell(a);
        ch = choicesFrom(rng, a, set, nC, function (c) { return { kind: 'color', color: c }; }); break;
      }
      case 'shapes': {
        var col = colourSet(rng, age, 1)[0], shs = shapeSet(rng, age, 3); a = shs[0]; params = { shape: a };
        ch = choicesFrom(rng, a, shs, nC, function (s) { return plate(s, col); }); break;
      }
      case 'size': {
        var c2 = colourSet(rng, age, 1)[0]; a = rng.pick(['big', 'small']); params = { size: a, color: c2 };
        ch = choicesFrom(rng, a, ['big', 'small'], 2, function (s) { return { kind: 'size', big: s === 'big', size: s, color: c2 }; });
        break;
      }
      case 'animals': {
        a = rng.pick(CC.ANIMALS); params = { animal: a };
        ch = choicesFrom(rng, a, CC.ANIMALS, nC, function (x) { return animal(x); }); break;
      }
      case 'count': {
        var kd = age <= 4 ? 'string' : 'dots', rr = { 3: [1, 4], 4: [1, 5], 5: [2, 8], 6: [3, 10], 7: [3, 10] }[age];
        a = rng.int(rr[0], rr[1]); params = { n: a, kind: kd }; show = kd === 'string' ? string(a) : dots(a);
        var near = range(Math.max(1, a - 2), a + 2).filter(function (x) { return x !== a && (kd !== 'string' || x <= 5); });
        ch = choicesFrom(rng, a, near, nC, function (x) { return { kind: 'number', n: x }; }); break;
      }
      case 'letters': case 'lower': {
        var P = letterPool(lang, topic); a = rng.pick(P);
        if (topic === 'lower') { params = { letter: a, small: a.toLowerCase() }; show = glyphL(a); }
        else params = { letter: a };
        ch = choicesFrom(rng, a, P, 3, function (x) { return glyphL(topic === 'lower' ? x.toLowerCase() : x); }); break;
      }
      case 'initial': {
        var an2 = rng.pick(CC.ANIMALS.filter(function (x) { return initialOf(x, lang); })); a = initialOf(an2, lang);
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
      default: throw new Error('CC.Content: unknown topic ' + topic);
    }
    return { topic: topic, promptKey: 'talk.' + topic, params: params, show: show, choices: ch.choices, answer: ch.answer, answerId: ch.answer };
  }

  /** 4 chapter topics for a session, easiest first. Without rng or `last`: CC.AGE_TOPICS (the first session). With both:
   *  chapter 1 = the pool topic left out last time (else the easiest one that did not open last time); chapters 2–4 =
   *  3 of the others (preferring topics left out of `last`), in pool (difficulty) order. */
  function topicsFor(age, rng, last) {
    age = ageOf(age);
    last = Array.isArray(last) ? last : [];
    if (!rng || !last.length) return CC.AGE_TOPICS[age].slice();
    var pool = CC.AGE_POOLS[age].slice(), ord = function (a, b) { return pool.indexOf(a) - pool.indexOf(b); };
    var unused = pool.filter(function (t) { return last.indexOf(t) < 0; });
    var first = unused.length ? unused[0] : pool[0];
    if (!unused.length) for (var i = 0; i < pool.length; i++) if (pool[i] !== last[0]) { first = pool[i]; break; }
    var rest = pool.filter(function (t) { return t !== first; });
    var fresh = rng.shuffle(rest.filter(function (t) { return last.indexOf(t) < 0; }));
    var old = rng.shuffle(rest.filter(function (t) { return last.indexOf(t) >= 0; }));
    return [first].concat(fresh.concat(old).slice(0, 3)).sort(ord);
  }

  CC.Content = {
    makeRound: makeRound, makeTalk: makeTalk, validate: validate, topicsFor: topicsFor, matches: matches, stepFor: stepFor,
    ageOf: ageOf, langOf: langOf, clash: clash, safeSets: safeSets, maxSafe: maxSafe, pairsFor: pairsFor, sameAnswer: sameAnswer,
    shapesFor: shapesFor, parityOf: parityOf, letterPool: letterPool, initialOf: initialOf, thingKey: thingKey, roundKey: roundKey,
    countsFor: countsFor,
    TOPICS: ALL_TOPICS, COLORS: COLORS, COLORS5: COLORS5, SHAPES3: SHAPES3, SHAPE_PAIRS: SHAPE_PAIRS, LOWER_PAIRS: LOWER_PAIRS, BDPQ: BDPQ,
    LETTER_POOL: LETTER_POOL, CLASH: CLASH, COLOR_SAFE_BELOW: COLOR_SAFE_BELOW, MAX_CHIMES: MAX_CHIMES, ADD_MAX: ADD_MAX, SUB_MAX: SUB_MAX,
    ODDEVEN_MAX: ODDEVEN_MAX, DOTS_MAX: DOTS_MAX, SIZE_K: SIZE_K
  };
})(window.CC = window.CC || {});
