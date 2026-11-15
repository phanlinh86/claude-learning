/* Nim's River Hop — NH.PALETTE, NH.COLORS, NH.SHAPES, NH.OBJS, NH.FRUITS, NH.ANIMALS, NH.HOMES, NH.AGE_TOPICS, NH.AGE_POOLS,
 * NH.Content (pure + deterministic river-crossing round generator with an independent self-check; DESIGN §5.1)
 *
 *   NH.Content.makeRound(topic, { age, lang, rng, roundIndex, level, surprise, short?, usedKeys?, prevRule?, prevFruit?, maxK? })
 *       → round (validated with validate(); retries; throws if impossible)
 *   NH.Content.makeTalk(topic, { age, lang, rng })  → talk
 *   NH.Content.validate(round)  → null | 'reason'
 *   NH.Content.topicsFor(age, rng?, lastTopics?)  → the 4 chapter topics (easiest first)
 *   NH.Content.ruleHolds(rule, thing, round?, row?)  → does this thing (in row `row`) match the rule
 *   NH.Content.sizeFor(topic, age, roundIndex, level, short)  → { k rows, m stones per row, mode }
 *
 * round = { topic, age, lang, roundIndex, level, short, surprise: null|'fish'|'frog'|'snow', mode: 'match'|'countSeq'|'countSel',
 *   rows: [ [ { id 's<j>_<i>', row j, i, thing, target: bool } ] ]  (k rows × m stones; EXACTLY one target per row),
 *   k (rows), m (stones per row), n (all stones), fruit (NH.FRUITS), promptKey, params, rule: { kind, value, nameKind }, key, seed, nameSrc }
 * thing = { kind 'obj'|'shape'|'dots'|'tile'|'animal', color?, obj?, shape?, n?, numeral?, animal?, home?, text?, big?, letter?, a?, b?, op?,
 *           nameKind, nameValue } — nameKind / nameValue name the thing the way THIS round's question is about:
 *   colors → 'color'/'red' · shapes → 'shape'/'star' · size → 'size'/'big'|'small' · count → 'number'/3 · animals p.animal → 'animal'/'cow'
 *   · animals p.home → 'home'/'farm' · letters / lower → 'letter'/'B' (the CAPITAL) · initial → 'letter'/'B' (thing.letter = its initial)
 *   · add → 'sum'/5 · sub → 'diff'/3 · oddeven → 'parity'/'even'
 * rule kinds: color · shape · size · seq (countSeq: row j's target has j + 1 dots; value = k) · n (countSel: dots) · animal · home ·
 *   letter · initial · sum · diff · parity
 * Prompt keys / params: p.colors {color, k} · p.shapes {shape, k} · p.shapes5 {shape, k} · p.size {big, k} · p.countSeq {n: k} ·
 *   p.countSel {n} · p.animal {animal, k} · p.home {home, k} · p.letters {letter, k} · p.lower {letter, k} · p.initial {letter, k} ·
 *   p.add {n, k} · p.sub {n, k} · p.oddeven {parity, k}
 * talk = { topic, promptKey, params, show: thing | null, choices: [{ id, thing, value }], answer (choice id), answerId }
 *   promptKeys: talk.colors {color} · talk.shapes {shape} · talk.size {size} · talk.count {n} (show = a dots thing) · talk.animals {animal}
 *   (where does it live; home badges) · talk.who {animal} (age 3) · talk.letters {letter} · talk.lower {letter, small} ·
 *   talk.initial {letter, nameKind, nameValue} · talk.add {a, b} · talk.sub {a, b} · talk.oddeven {parity}
 *   choice things: any stone thing, or { kind:'color', color } · { kind:'number', n } · { kind:'home', home } · { kind:'size', big }
 */
(function (NH) {
  'use strict';

  // DESIGN §3 answer palette (exact hex)
  NH.PALETTE = {
    red:    { base: '#E84A4A', dark: '#A8282E', light: '#F7A0A0' },
    blue:   { base: '#3C8DE8', dark: '#1F5BA8', light: '#A6CCF5' },
    yellow: { base: '#FFD23F', dark: '#C99A12', light: '#FFEB9C' },
    green:  { base: '#4CC26B', dark: '#2A8343', light: '#A8E6B8' },
    orange: { base: '#FF9A2E', dark: '#C4650C', light: '#FFCB8E' },
    purple: { base: '#8E44AD', dark: '#6840A8', light: '#D2BDF3' },
    pink:   { base: '#FF8FC0', dark: '#C9558A', light: '#FFCCE2' }      // an answer colour from age 5
  };
  for (var pk in NH.PALETTE) NH.PALETTE[pk].fill = NH.PALETTE[pk].base;
  NH.COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  var COLORS = NH.COLORS.slice(0, 6), COLORS5 = NH.COLORS.slice();
  NH.SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'oval', 'rect', 'diamond'];
  NH.OBJS = ['flower', 'mushroom', 'leaf', 'ball', 'duck'];
  NH.FRUITS = ['apple', 'pear', 'strawberry', 'mushroom', 'acorn'];
  NH.ANIMALS = { cow: 'farm', pig: 'farm', sheep: 'farm', duck: 'farm', hen: 'farm', horse: 'farm', goat: 'farm',
    crab: 'sea', fishbowl: 'sea', penguin: 'ice', lion: 'savanna', monkey: 'jungle' };
  NH.HOMES = ['farm', 'sea', 'ice', 'savanna', 'jungle'];
  NH.THING_KINDS = ['obj', 'shape', 'dots', 'tile', 'animal'];
  var ANIMAL_LIST = Object.keys(NH.ANIMALS);
  var FARM = ANIMAL_LIST.filter(function (a) { return NH.ANIMALS[a] === 'farm'; });
  var WILD = ANIMAL_LIST.filter(function (a) { return NH.ANIMALS[a] !== 'farm'; });
  function homeAnimals(h) { return ANIMAL_LIST.filter(function (a) { return NH.ANIMALS[a] === h; }); }

  NH.AGE_TOPICS = {
    3: ['colors', 'shapes', 'size', 'animals'],
    4: ['colors', 'shapes', 'count', 'animals'],
    5: ['shapes', 'count', 'letters', 'animals'],
    6: ['lower', 'initial', 'add', 'count'],
    7: ['initial', 'add', 'sub', 'oddeven']
  };
  /* Every age has a POOL of 5 topics in difficulty order; a session plays 4 of them (rotating between sessions). */
  NH.AGE_POOLS = {
    3: ['colors', 'shapes', 'size', 'animals', 'count'],
    4: ['colors', 'size', 'shapes', 'count', 'animals'],
    5: ['colors', 'shapes', 'count', 'letters', 'animals'],
    6: ['letters', 'lower', 'initial', 'add', 'count'],
    7: ['count', 'initial', 'add', 'sub', 'oddeven']
  };
  var ALL_TOPICS = ['colors', 'shapes', 'size', 'animals', 'count', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];

  // ---- tables (DESIGN §5.1)
  var SHAPES3 = ['circle', 'square', 'triangle', 'star', 'heart'];   // age 3
  var SHAPES4 = SHAPES3.concat(['rect']);                             // age 4 (oval + diamond are hard words: from age 5)
  var SIMILAR_SHAPES = [['square', 'rect'], ['circle', 'oval'], ['square', 'diamond'], ['heart', 'circle']];
  var LETTER_POOL = { en: 'ABCDEFGHIKLMNOPRSTUW', vi: 'ABCDEGHIKLMNOPSTUVXY' };
  var LOOKALIKE = ['EF', 'OQCG', 'MNW', 'PRB', 'ILT', 'UV'];          // capitals that never meet in one round
  var LOWER_SKIP = 'IL';                                              // capital I and small l look alike
  var SMALL_PAIRS = ['bdpq', 'nu', 'mw', 'co'];                       // small letters that never meet in one round
  var OTHER_VALUES = { 3: 1, 4: 2, 5: 3, 6: 3, 7: 3 };                // distinct distractor values per round (colours, shapes, animals, letters)
  var SEL_RANGE = { 3: [2, 5, 5], 4: [2, 5, 5], 5: [3, 8, 10], 6: [4, 12, 12], 7: [4, 12, 12] };   // countSel: [a min, a max, distractor max]
  var ADD_RANGE = { 6: [5, 10], 7: [6, 20] }, SUB_RANGE = [1, 6], SUB_TOP = 10, ODDEVEN_MAX = 20;
  var MINUS = '−';
  var VI_DIGRAPHS = ['ngh', 'ng', 'nh', 'ch', 'gh', 'kh', 'ph', 'th', 'tr', 'gi', 'qu'];
  var VI_ALPHABET = ['A', 'Ă', 'Â', 'B', 'C', 'D', 'Đ', 'E', 'Ê', 'G', 'H', 'I', 'K', 'L', 'M', 'N', 'O', 'Ô', 'Ơ', 'P', 'Q', 'R', 'S', 'T', 'U', 'Ư', 'V', 'X', 'Y'];
  /* Fallback names (DESIGN §6) when NH.I18N.name is not loaded / does not know a thing (headless tests). */
  NH.THING_NAMES = {
    en: { flower: 'flower', mushroom: 'mushroom', leaf: 'leaf', ball: 'ball', duck: 'rubber duck',
      cow: 'cow', pig: 'pig', sheep: 'sheep', duckA: 'duck', hen: 'hen', horse: 'horse', goat: 'goat', crab: 'crab', fishbowl: 'goldfish',
      penguin: 'penguin', lion: 'lion', monkey: 'monkey' },
    vi: { flower: 'bông hoa', mushroom: 'cây nấm', leaf: 'chiếc lá', ball: 'quả bóng', duck: 'con vịt cao su',
      cow: 'con bò', pig: 'con heo', sheep: 'con cừu', duckA: 'con vịt', hen: 'con gà mái', horse: 'con ngựa', goat: 'con dê', crab: 'con cua',
      fishbowl: 'bể cá vàng', penguin: 'chim cánh cụt', lion: 'sư tử', monkey: 'con khỉ' }
  };
  /* Things used by 'initial': the picture must say the word (the rubber duck — EN "rubber duck" vs a duck picture — and the goldfish
   * bowl are left out). */
  var INITIAL_OBJS = ['flower', 'mushroom', 'leaf', 'ball'];
  var INITIAL_ANIMALS = ANIMAL_LIST.filter(function (a) { return a !== 'fishbowl'; });
  var CLASSIFIERS = { en: ['the', 'a', 'an'], vi: ['con', 'cái', 'quả', 'chiếc', 'cây', 'bông'] };

  function langOf(l) { return l === 'vi' ? 'vi' : 'en'; }
  function ageOf(a) { a = Math.round(+a || 4); return a < 3 ? 3 : a > 7 ? 7 : a; }
  function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }
  function parityOf(n) { return n % 2 ? 'odd' : 'even'; }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
  function clone(t) { var o = {}; for (var k in t) o[k] = t[k]; return o; }

  // ---------------- names → initials ('initial' topic) ----------------
  /** The name of an obj / animal: NH.I18N.name(lang, kind, value) when loaded and it knows the thing, else NH.THING_NAMES. */
  function thingName(kind, value, lang, src) {
    lang = langOf(lang);
    var tableKey = kind === 'animal' && value === 'duck' ? 'duckA' : value;
    if (src !== 'table' && NH.I18N && typeof NH.I18N.name === 'function') {
      var kinds = kind === 'obj' ? ['obj', 'toy'] : [kind];
      for (var i = 0; i < kinds.length; i++) {
        try {
          var s = NH.I18N.name(lang, kinds[i], value);
          if (typeof s === 'string' && s.trim() && s.indexOf('{') < 0 && s !== String(value) + '?' && (lang === 'en' || s !== String(value))) return s;
        } catch (e) { /* fall back */ }
      }
    }
    return NH.THING_NAMES[lang][tableKey] || null;
  }
  function stripMarks(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC'); }
  /** The initial letter of a name (classifier / article dropped; VI tone marks dropped, Ă Â Ê Ô Ơ Ư Đ kept; VI words that start with
   *  a digraph (ch, ng, kh …) give null: never used in an 'initial' round). */
  function initialOfName(name, lang) {
    if (!name) return null;
    lang = langOf(lang);
    var words = String(name).trim().toLowerCase().split(/\s+/), cl = CLASSIFIERS[lang];
    while (words.length > 1 && cl.indexOf(words[0]) >= 0) words.shift();
    var w = words[0] || '';
    if (!w) return null;
    if (lang === 'vi') for (var i = 0; i < VI_DIGRAPHS.length; i++) if (w.indexOf(VI_DIGRAPHS[i]) === 0) return null;
    var c = w.charAt(0);
    if (c === 'đ') return 'Đ';
    var d = c.normalize('NFD').replace(/[̣̀́̃̉]/g, '').normalize('NFC').toUpperCase();
    if (lang === 'en') return /^[A-Z]$/.test(d) ? d : null;
    return VI_ALPHABET.indexOf(d) >= 0 ? d : null;
  }
  function baseLetter(L) { return L ? (L === 'Đ' ? 'D' : stripMarks(L)) : null; }
  function initialOf(thing, lang, src) {
    if (!thing) return null;
    var kind = thing.kind === 'animal' ? 'animal' : thing.kind === 'obj' ? 'obj' : null;
    if (!kind) return null;
    return initialOfName(thingName(kind, kind === 'animal' ? thing.animal : thing.obj, lang, src), lang);
  }

  // ---------------- colour safety (DESIGN §3) ----------------
  var COLOR_SAFE_BELOW = 5;
  var CLASH = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange'], ['red', 'orange']];
  function pairsFor(age) { return age < COLOR_SAFE_BELOW ? CLASH : []; }
  function clash(cs, pairs) {
    pairs = pairs || CLASH;
    for (var i = 0; i < pairs.length; i++) if (cs.indexOf(pairs[i][0]) >= 0 && cs.indexOf(pairs[i][1]) >= 0) return true;
    return false;
  }
  function colorPool(age) { return age < COLOR_SAFE_BELOW ? COLORS : COLORS5; }
  function shapesFor(age) { return age <= 3 ? SHAPES3.slice() : age === 4 ? SHAPES4.slice() : NH.SHAPES.slice(); }
  function similarShapes(a, b) { for (var i = 0; i < SIMILAR_SHAPES.length; i++) { var p = SIMILAR_SHAPES[i]; if ((p[0] === a && p[1] === b) || (p[0] === b && p[1] === a)) return true; } return false; }
  function anySimilar(list) { for (var i = 0; i < list.length; i++) for (var j = i + 1; j < list.length; j++) if (list[i] !== list[j] && similarShapes(list[i], list[j])) return true; return false; }
  function lookalike(a, b) {
    var A = String(a).toUpperCase(), B = String(b).toUpperCase();
    if (A === B) return true;
    for (var i = 0; i < LOOKALIKE.length; i++) if (LOOKALIKE[i].indexOf(A) >= 0 && LOOKALIKE[i].indexOf(B) >= 0) return true;
    var x = A.toLowerCase(), y = B.toLowerCase();
    for (i = 0; i < SMALL_PAIRS.length; i++) if (SMALL_PAIRS[i].indexOf(x) >= 0 && SMALL_PAIRS[i].indexOf(y) >= 0) return true;
    return false;
  }
  function letterPool(lang, topic) {
    var P = LETTER_POOL[langOf(lang)].split('');
    return topic === 'lower' ? P.filter(function (c) { return LOWER_SKIP.indexOf(c) < 0; }) : P;
  }

  // ---------------- things ----------------
  function obj(o, c) { return { kind: 'obj', obj: o, color: c, nameKind: 'color', nameValue: c }; }
  function shape(s, c) { return { kind: 'shape', shape: s, color: c, nameKind: 'shape', nameValue: s }; }
  function dots(n, numeral) { return { kind: 'dots', n: n, numeral: !!numeral, nameKind: 'number', nameValue: n }; }
  function animal(a) { return { kind: 'animal', animal: a, home: NH.ANIMALS[a], nameKind: 'animal', nameValue: a }; }
  function tileL(c) { return { kind: 'tile', text: String(c), nameKind: 'letter', nameValue: String(c).toUpperCase() }; }
  function tileN(n) { return { kind: 'tile', text: String(n), n: n, nameKind: 'parity', nameValue: parityOf(n) }; }
  function tileAdd(a, b) { return { kind: 'tile', text: a + '+' + b, a: a, b: b, op: '+', n: a + b, nameKind: 'sum', nameValue: a + b }; }
  function tileSub(a, b) { return { kind: 'tile', text: a + MINUS + b, a: a, b: b, op: MINUS, n: a - b, nameKind: 'diff', nameValue: a - b }; }
  function sized(t, big) { t.big = !!big; t.nameKind = 'size'; t.nameValue = big ? 'big' : 'small'; return t; }
  function thingKey(t) {
    return [t.kind, t.obj || '', t.color || '', t.shape || '', t.n === undefined ? '' : t.n, t.animal || '', t.text || '', t.big === false ? 's' : ''].join(':');
  }
  function roundKey(r) {
    return r.topic + '|' + r.mode + '|' + r.rows.map(function (row) {
      var tg = '', rest = [];
      row.forEach(function (s) { if (s.target) tg = thingKey(s.thing); else rest.push(thingKey(s.thing)); });
      return tg + '/' + rest.sort().join(',');
    }).join(';');
  }

  /** {k rows, m stones per row, mode} (DESIGN §5.1). The session warm-up (chapter 0, round 0) and short rounds are (2, 2). */
  function tableKM(age, ri, level, short) {
    if (short && ri > 0) return [2, 2];
    if (ri === 0 && level === 0) return [2, 2];
    var T = age <= 3 ? [[2, 2], [2, 2], [3, 2], [3, 2]]
      : age === 4 ? (level === 0 ? [[2, 2], [2, 3], [3, 2], [3, 3]] : [[2, 2], [3, 2], [3, 3], [3, 3]])
      : age === 5 ? [[3, 2], [3, 3], [3, 3], [4, 3]] : [[3, 3], [4, 3], [4, 3], [4, 3]];
    return T[Math.min(Math.max(0, ri | 0), 3)].slice();
  }
  function countMode(ri) { return ri % 2 === 0 ? 'countSeq' : 'countSel'; }
  /** maxK: the most rows the screen holds (World.maxRows: 3 on an iPad 4:3 portrait), default 4. */
  function sizeFor(topic, age, ri, level, short, maxK) {
    age = ageOf(age);
    var km = tableKM(age, ri, level, short);
    return { k: Math.min(km[0], Math.max(2, maxK || 4)), m: km[1], mode: topic === 'count' ? countMode(ri) : 'match' };
  }

  // ---------------- the rule ----------------
  function sizeOf(t) { return t.big === false ? 'small' : 'big'; }
  /** Does `thing` (standing in row `row`) match the rule? (`r` gives lang / nameSrc for 'initial'.) */
  function ruleHolds(rule, t, r, row) {
    if (!rule || !t) return false;
    var v = rule.value;
    switch (rule.kind) {
      case 'color': return t.color === v;
      case 'shape': return t.kind === 'shape' && t.shape === v;
      case 'size': return sizeOf(t) === v;
      case 'seq': return t.kind === 'dots' && t.n === (row | 0) + 1;
      case 'n': return t.kind === 'dots' && t.n === v;
      case 'animal': return t.kind === 'animal' && t.animal === v;
      case 'home': return t.kind === 'animal' && NH.ANIMALS[t.animal] === v;
      case 'letter': return t.kind === 'tile' && String(t.text).toUpperCase() === v;
      case 'initial': return initialOf(t, r ? r.lang : 'en', r ? r.nameSrc : undefined) === v;
      case 'sum': { var s = parseOp(t.text); return !!s && s.op === '+' && s.a + s.b === v; }
      case 'diff': { var d = parseOp(t.text); return !!d && d.op === MINUS && d.a - d.b === v; }
      case 'parity': return t.kind === 'tile' && /^\d+$/.test(t.text) && parityOf(+t.text) === v;
    }
    return false;
  }
  function parseOp(text) {
    var m = /^(\d+)([+−])(\d+)$/.exec(String(text || ''));
    return m ? { a: +m[1], op: m[2], b: +m[3] } : null;
  }
  function R(kind, value, nameKind) { return { kind: kind, value: value, nameKind: nameKind }; }
  /** The "value" of a distractor for this rule (distinct-values count, DESIGN §5.1). */
  function valueOf(rule, t, r) {
    switch (rule.kind) {
      case 'color': return t.color;
      case 'shape': return t.shape;
      case 'size': return sizeOf(t);
      case 'seq': case 'n': return t.n;
      case 'animal': return t.animal;
      case 'home': return t.home;
      case 'letter': return String(t.text).toUpperCase();
      case 'initial': return baseLetter(initialOf(t, r.lang, r.nameSrc));
      case 'sum': case 'diff': case 'parity': return t.n;
    }
    return null;
  }
  var LIMITED = { color: 1, shape: 1, animal: 1, home: 1, letter: 1, initial: 1 };   // rules whose distractor values are capped per age

  /* ---------------- sets
   * buildSet → { rule, promptKey, params, targets: [thing] (one per row), others: [[thing] × (m − 1)] per row }. `avoid` = the asked
   * value of the last round (the target value changes every round in a chapter). */
  function pickFresh(rng, list, avoid) { var f = list.filter(function (x) { return String(x) !== String(avoid); }); return rng.pick(f.length ? f : list); }
  /** Per-row distractor values: every value of `vals` used at least once over the round (when there is room), distinct inside a row
   *  when possible. → [[v × per] × k] */
  function rowValues(rng, vals, k, per) {
    var out = [], bag = rng.shuffle(vals.slice()), bi = 0;
    for (var j = 0; j < k; j++) {
      var row = [];
      for (var q = 0; q < per; q++) {
        var v = null;
        for (var tries = 0; tries < vals.length * 2 && v === null; tries++) {
          if (bi >= bag.length) { bag = rng.shuffle(vals.slice()); bi = 0; }
          var c = bag[bi++];
          if (row.indexOf(c) < 0 || vals.length < per) v = c;
        }
        row.push(v === null ? rng.pick(vals) : v);
      }
      out.push(row);
    }
    return out;
  }
  function buildSet(topic, age, lang, rng, ri, km, src, prev) {
    var k = km.k, m = km.m, per = m - 1, mv = OTHER_VALUES[age], tg = [], ot = [], rule, pk, pr, j, c, pool;
    var avoid = prev ? prev.value : null;
    switch (topic) {
      case 'colors': {
        pool = colorPool(age);
        c = pickFresh(rng, pool, avoid);
        // ≤ mv other colours, no clash pair among all of them (below age 5); orange below 5 has only blue / purple as safe partners
        // and they clash together → one other colour
        var oc = null;
        for (var mm = Math.min(mv, pool.length - 1); mm >= 1 && !oc; mm--) for (var tc = 0; tc < 60 && !oc; tc++) { var s = rng.sample(pool.filter(function (x) { return x !== c; }), mm); if (!clash(s.concat([c]), pairsFor(age))) oc = s; }
        if (!oc) throw new Error('no colour set');
        var dv = rowValues(rng, oc, k, per);
        if (ri === 0) {   // a chapter's warm-up: the same obj everywhere (only the colour differs)
          var o = rng.pick(NH.OBJS);
          for (j = 0; j < k; j++) { tg.push(obj(o, c)); ot.push(dv[j].map(function (x) { return obj(o, x); })); }
        } else {
          // mixed objs; targets share the colour (different objs at age ≥ 4); the obj is never a cue: in every row a distractor
          // wears that row's target obj
          var tt = age >= 4 ? (k <= NH.OBJS.length ? rng.sample(NH.OBJS, k) : rowValues(rng, NH.OBJS, 1, k)[0]) : rowValues(rng, [rng.pick(NH.OBJS)], 1, k)[0];
          for (j = 0; j < k; j++) {
            tg.push(obj(tt[j], c));
            var tj = tt[j];
            ot.push(dv[j].map(function (x, q) { return obj(q === 0 ? tj : rng.pick(NH.OBJS), x); }));
          }
        }
        rule = R('color', c, 'color'); pk = 'p.colors'; pr = { color: c, k: k };
        break;
      }
      case 'shapes': {
        var shp = shapesFor(age), sh = pickFresh(rng, shp, avoid), os = null;
        for (var ts = 0; ts < 80 && !os; ts++) { var cand = rng.sample(shp.filter(function (x) { return x !== sh; }), Math.min(mv, shp.length - 1)); if (!anySimilar(cand.concat([sh]))) os = cand; }
        if (!os) throw new Error('no shape set');
        var sv = rowValues(rng, os, k, per);
        if (age < 5) {
          c = rng.pick(colorPool(age));
          for (j = 0; j < k; j++) { tg.push(shape(sh, c)); ot.push(sv[j].map(function (x) { return shape(x, c); })); }
          pk = 'p.shapes';
        } else {   // shapes5: mixed colours — every stone of a row its own colour, a target colour also on a distractor (no cue)
          var tcols = [];
          for (j = 0; j < k; j++) {
            var cs = rng.sample(COLORS5, m);
            tg.push(shape(sh, cs[0])); tcols.push(cs[0]);
            ot.push(sv[j].map(function (x, q) { return shape(x, cs[q + 1]); }));
          }
          // the colour is no cue: one distractor somewhere wears a target's colour (swap within its row keeps the row distinct)
          var hasCue = ot.some(function (row) { return row.some(function (t) { return tcols.indexOf(t.color) >= 0; }); });
          if (!hasCue && k >= 2) { var r1 = ot[1][0], c0 = tcols[0]; if (tcols[1] !== c0) r1.color = c0; }
          pk = 'p.shapes5';
        }
        rule = R('shape', sh, 'shape'); pr = { shape: sh, k: k };
        break;
      }
      case 'size': {
        // the same obj in one colour; targets big, the others small — or the reverse; alternates every round
        var big = avoid === null || avoid === undefined ? rng.chance(0.5) : avoid !== 'big';
        var ob = rng.pick(NH.OBJS), col = rng.pick(colorPool(age));
        for (j = 0; j < k; j++) {
          tg.push(sized(obj(ob, col), big));
          var row = []; for (var q = 0; q < per; q++) row.push(sized(obj(ob, col), !big)); ot.push(row);
        }
        rule = R('size', big ? 'big' : 'small', 'size'); pk = 'p.size'; pr = { big: big, k: k };
        break;
      }
      case 'count': {
        if (km.mode === 'countSeq') {
          // row j: the target has j + 1 dots; distractors other numbers 1..k+2 (never j + 1; at age ≤ 4 never j + 2 — the NEXT number
          // would tempt to skip); every stone shows its numeral
          for (j = 0; j < k; j++) {
            tg.push(dots(j + 1, true));
            var dom = range(1, k + 2).filter(function (x) { return x !== j + 1 && !(age <= 4 && x === j + 2); });
            if (dom.length < per) throw new Error('no countSeq row');
            ot.push(rng.sample(dom, per).map(function (x) { return dots(x, true); }));
          }
          rule = R('seq', k, 'number'); pk = 'p.countSeq'; pr = { n: k };
          break;
        }
        var SR = selRange(age, _maxDots), a = null, okD = null;
        for (var t2 = 0; t2 < 200 && !okD; t2++) {
          a = rng.int(SR[0], SR[1]);
          if (String(a) === String(avoid) && t2 < 150) continue;
          var cands = range(1, SR[2]).filter(function (x) { return countPairOk(a, x, age, SR[2]); });
          if (cands.length >= per) okD = cands;
        }
        if (!okD) throw new Error('no count set');
        for (j = 0; j < k; j++) { tg.push(dots(a, false)); ot.push(rng.sample(okD, per).map(function (x) { return dots(x, false); })); }
        rule = R('n', a, 'number'); pk = 'p.countSel'; pr = { n: a };
        break;
      }
      case 'animals': {
        if (age <= 3 || ri === 0) {
          var x0 = pickFresh(rng, FARM, avoid), xs = rng.sample(FARM.filter(function (q2) { return q2 !== x0; }), Math.min(Math.max(mv, per), FARM.length - 1));
          var av = rowValues(rng, xs.slice(0, Math.max(1, Math.min(xs.length, age <= 3 ? mv : xs.length))), k, per);
          for (j = 0; j < k; j++) { tg.push(animal(x0)); ot.push(av[j].map(function (q2) { return animal(q2); })); }
          rule = R('animal', x0, 'animal'); pk = 'p.animal'; pr = { animal: x0, k: k };
        } else {
          // the home: farm or sea (DESIGN: the others have one animal each — a k-row round needs k distinct animals; the sea's two
          // animals take turns when k > 2), alternating with the last round's home
          var homes = ['farm', 'sea'].filter(function (h) { return h !== avoid; });
          var hm = rng.pick(homes), ha = homeAnimals(hm);
          var tl = k <= ha.length ? rng.sample(ha, k) : rowValues(rng, ha, 1, k)[0];
          var nOther = age <= 4 ? 2 : 3;
          var oh = rng.sample(NH.HOMES.filter(function (h) { return h !== hm; }), nOther);
          var hv = rowValues(rng, oh, k, per);
          for (j = 0; j < k; j++) {
            var t3 = animal(tl[j]); t3.nameKind = 'home'; t3.nameValue = hm; tg.push(t3);
            var usedA = [];
            ot.push(hv[j].map(function (h) {
              var list = homeAnimals(h).filter(function (q3) { return usedA.indexOf(q3) < 0; });
              var aa = rng.pick(list.length ? list : homeAnimals(h)); usedA.push(aa);
              var t4 = animal(aa); t4.nameKind = 'home'; t4.nameValue = h; return t4;
            }));
          }
          rule = R('home', hm, 'home'); pk = 'p.home'; pr = { home: hm, k: k };
        }
        break;
      }
      case 'letters': {
        pool = letterPool(lang, 'letters');
        var L0 = pickFresh(rng, pool, avoid), lo = pickLetters(rng, pool, L0, mv), lv = rowValues(rng, lo, k, per);
        for (j = 0; j < k; j++) { tg.push(tileL(L0)); ot.push(lv[j].map(function (x) { return tileL(x); })); }
        rule = R('letter', L0, 'letter'); pk = 'p.letters'; pr = { letter: L0, k: k };
        break;
      }
      case 'lower': {
        pool = letterPool(lang, 'lower');
        var L1 = pickFresh(rng, pool, avoid), l2 = pickLetters(rng, pool, L1, mv), lw = rowValues(rng, l2, k, per), up0 = rng.chance(0.5);
        for (j = 0; j < k; j++) {   // rows alternate the capital and the small form as the target
          var up = (j % 2 === 0) === up0;
          tg.push(tileL(up ? L1 : L1.toLowerCase()));
          ot.push(lw[j].map(function (x) { return tileL(rng.chance(0.5) ? x : x.toLowerCase()); }));
        }
        rule = R('letter', L1, 'letter'); pk = 'p.lower'; pr = { letter: L1, k: k };
        break;
      }
      case 'initial': {
        var g = initialGroups(lang, src), P0 = letterPool(lang, 'letters');
        var letters = Object.keys(g).filter(function (q4) { return P0.indexOf(q4) >= 0 && g[q4].length >= 2; });
        if (!letters.length) letters = Object.keys(g).filter(function (q4) { return P0.indexOf(q4) >= 0; });
        if (!letters.length) throw new Error('no initial groups');
        var IL = pickFresh(rng, letters, avoid), grp = g[IL];
        var picks = rowValues(rng, grp, 1, k)[0];
        var mk = function (q5, L) {
          var t5 = q5.kind === 'animal' ? animal(q5.value) : obj(q5.value, rng.pick(COLORS5));
          t5.letter = L; t5.nameKind = 'letter'; t5.nameValue = L; return t5;
        };
        var otherL = rng.shuffle(Object.keys(g).filter(function (q6) { return baseLetter(q6) !== IL; })).slice(0, mv);
        var iv = rowValues(rng, otherL, k, per);
        for (j = 0; j < k; j++) { tg.push(mk(picks[j], IL)); ot.push(iv[j].map(function (L) { return mk(rng.pick(g[L]), L); })); }
        rule = R('initial', IL, 'letter'); pk = 'p.initial'; pr = { letter: IL, k: k };
        break;
      }
      case 'add': {
        var rg = ADD_RANGE[age] || ADD_RANGE[6], hiA = ri === 0 ? Math.min(rg[1], age >= 7 ? 10 : 7) : rg[1];
        var sn = pickFresh(rng, range(Math.max(rg[0], k + 1), hiA), avoid), usedT = {};
        var parts = rng.sample(range(1, sn - 1), k);
        for (j = 0; j < k; j++) {
          tg.push(tileAdd(parts[j], sn - parts[j])); usedT[parts[j] + '+' + (sn - parts[j])] = 1;
          var sums = rng.sample(range(Math.max(2, sn - 3), Math.min(rg[1], sn + 3)).filter(function (x) { return x !== sn; }), per);
          ot.push(sums.map(function (x) {
            var aa, tries = 0;
            do { aa = rng.int(1, x - 1); tries++; } while (usedT[aa + '+' + (x - aa)] && tries < 30);
            usedT[aa + '+' + (x - aa)] = 1; return tileAdd(aa, x - aa);
          }));
        }
        rule = R('sum', sn, 'sum'); pk = 'p.add'; pr = { n: sn, k: k };
        break;
      }
      case 'sub': {
        var dn = pickFresh(rng, range(SUB_RANGE[0], ri === 0 ? 4 : SUB_RANGE[1]), avoid), usedS = {};
        var tops = rng.sample(range(dn + 1, SUB_TOP), k);
        for (j = 0; j < k; j++) {
          tg.push(tileSub(tops[j], tops[j] - dn)); usedS[tops[j] + '-' + dn] = 1;
          var diffs = rng.sample(range(Math.max(0, dn - 3), Math.min(SUB_TOP - 1, dn + 3)).filter(function (x) { return x !== dn; }), per);
          ot.push(diffs.map(function (x) {
            var top, tries = 0;
            do { top = rng.int(x + 1, SUB_TOP); tries++; } while (usedS[top + '-' + x] && tries < 30);
            usedS[top + '-' + x] = 1; return tileSub(top, top - x);
          }));
        }
        rule = R('diff', dn, 'diff'); pk = 'p.sub'; pr = { n: dn, k: k };
        break;
      }
      case 'oddeven': {
        var par = avoid === 'odd' ? 'even' : avoid === 'even' ? 'odd' : rng.pick(['odd', 'even']), topN = ri === 0 && k * per <= 5 ? 10 : ODDEVEN_MAX;
        var tn = rng.sample(range(1, topN).filter(function (x) { return parityOf(x) === par; }), k);
        var on = rng.sample(range(1, topN).filter(function (x) { return parityOf(x) !== par; }), k * per);
        for (j = 0; j < k; j++) { tg.push(tileN(tn[j])); ot.push(on.slice(j * per, (j + 1) * per).map(function (x) { return tileN(x); })); }
        rule = R('parity', par, 'parity'); pk = 'p.oddeven'; pr = { parity: par, k: k };
        break;
      }
      default: throw new Error('NH.Content: unknown topic ' + topic);
    }
    return { rule: rule, promptKey: pk, params: pr, targets: tg, others: ot };
  }
  function pickLetters(rng, pool, L0, m) {
    for (var t = 0; t < 80; t++) {
      var s = rng.sample(pool.filter(function (x) { return !lookalike(L0, x); }), m), ok = true;
      for (var i = 0; i < s.length && ok; i++) for (var j = i + 1; j < s.length; j++) if (lookalike(s[i], s[j])) { ok = false; break; }
      if (ok) return s;
    }
    throw new Error('no letter set');
  }
  /** countSel: may a distractor with b dots stand next to the target a? (gap ≥ 2 at ages ≤ 4; from 5: ≥ 1, ≥ 2 once a number ≥ 6) */
  /** countSel range [a min, a max, distractor max]; maxDots (phones: 10) caps it so the dots stay countable on a small screen */
  var _maxDots = 0;   // set by makeRound for one call (opts.maxDots)
  function selRange(age, maxDots) {
    var R = SEL_RANGE[age] || SEL_RANGE[6], m = maxDots > 0 ? maxDots : 99;
    return [Math.min(R[0], m), Math.min(R[1], m), Math.min(R[2], m)];
  }
  function countPairOk(a, b, age, hiCap) {
    var hi = hiCap || (SEL_RANGE[age] || SEL_RANGE[6])[2], g = Math.abs(a - b);
    if (a < 1 || b < 1 || a > hi || b > hi || g < 1) return false;
    if (age <= 4) return g >= 2;
    return Math.max(a, b) >= 6 ? g >= 2 : g >= 1;
  }
  /** { letter: [{kind 'obj'|'animal', value}] } for 'initial' in this language (null initials left out). */
  function initialGroups(lang, src) {
    var g = {};
    INITIAL_OBJS.forEach(function (o) { var L = initialOf({ kind: 'obj', obj: o }, lang, src); if (L) (g[L] = g[L] || []).push({ kind: 'obj', value: o }); });
    INITIAL_ANIMALS.forEach(function (a) { var L = initialOf({ kind: 'animal', animal: a }, lang, src); if (L) (g[L] = g[L] || []).push({ kind: 'animal', value: a }); });
    return g;
  }

  function buildRound(topic, age, lang, rng, ri, level, short, src, prev, prevFruit, maxK) {
    var km = sizeFor(topic, age, ri, level, short, maxK);
    var set = buildSet(topic, age, lang, rng, ri, km, src, prev);
    var k = km.k, m = km.m, rows = [], idx = [];
    for (var j = 0; j < k; j++) idx.push(rng.int(0, m - 1));
    // the target's place in a row is random, but never the same index in every row of a round
    if (k >= 2 && idx.every(function (x) { return x === idx[0]; })) { var jj = rng.int(0, k - 1); idx[jj] = (idx[jj] + rng.int(1, m - 1)) % m; }
    for (j = 0; j < k; j++) {
      var others = rng.shuffle(set.others[j].slice()), row = [], oi = 0;
      for (var i = 0; i < m; i++) {
        var isT = i === idx[j];
        row.push({ id: 's' + j + '_' + i, row: j, i: i, thing: clone(isT ? set.targets[j] : others[oi++]), target: isT });
      }
      rows.push(row);
    }
    var fruits = NH.FRUITS.filter(function (f) { return f !== prevFruit; });
    var r = { topic: topic, age: age, lang: lang, roundIndex: ri, level: level, short: !!short, surprise: null, nameSrc: src,
      mode: km.mode, rows: rows, k: k, m: m, n: k * m, maxK: maxK || 4, fruit: rng.pick(fruits),
      promptKey: set.promptKey, params: set.params, rule: set.rule };
    r.key = roundKey(r);
    return r;
  }

  /** makeRound(topic, o) → round. usedKeys: never the same set twice in a chapter; prevRule: the asked value differs from the last
   *  round's (countSeq's value is the row count of the table: exempt). prevFruit: the reward changes every round. */
  function makeRound(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new NH.RNG(1), ri = o.roundIndex || 0;
    var level = o.level === undefined || o.level === null ? 1 : o.level | 0;
    if (ALL_TOPICS.indexOf(topic) < 0) throw new Error('NH.Content: unknown topic ' + topic);
    var used = (o.usedKeys || []).slice();
    var src = NH.I18N && typeof NH.I18N.name === 'function' ? 'i18n' : 'table';
    if (topic === 'initial' && src === 'i18n') {   // the i18n names must give usable groups, else the table
      var gg = initialGroups(lang, src), P0 = letterPool(lang, 'letters');
      var big = Object.keys(gg).filter(function (q) { return P0.indexOf(q) >= 0 && gg[q].length >= 2; });
      if (big.length < 2 || Object.keys(gg).length < 5) src = 'table';
    }
    var r = null, err = null;
    for (var attempt = 0; attempt < 150; attempt++) {
      try {
        _maxDots = o.maxDots > 0 ? o.maxDots : 0;
        r = buildRound(topic, age, lang, rng, ri, level, !!o.short, src, o.prevRule || null, o.prevFruit || null, o.maxK || 4);
        if (_maxDots) r.maxDots = _maxDots;
        _maxDots = 0;
        err = validate(r);
        if (!err && attempt < 120 && used.indexOf(r.key) >= 0) err = 'the same set as an earlier round';
        if (!err && attempt < 100 && sameRule(r, o.prevRule)) err = 'the same ask as the previous round';
      } catch (e) { r = null; err = e.message; _maxDots = 0; }
      if (!err) break;
    }
    if (err) throw new Error('NH.Content: invalid round (' + topic + ', age ' + age + ', round ' + ri + '): ' + err);
    r.surprise = ri === 0 ? null : (o.surprise || null);
    r.seed = (rng.next() * 4294967296) >>> 0;
    return r;
  }
  function sameRule(r, prev) {
    if (!prev || r.mode === 'countSeq' || prev.kind === 'seq') return false;
    return String(prev.value) === String(r.rule.value) && (prev.kind === r.rule.kind || r.topic === 'count');
  }

  // ---------------- self-check (independent of the generator's bookkeeping) ----------------
  function thingOk(t) {
    if (!t || NH.THING_KINDS.indexOf(t.kind) < 0) return 'thing kind';
    if (!t.nameKind || t.nameValue === undefined || t.nameValue === null) return 'thing name';
    switch (t.kind) {
      case 'obj': if (NH.OBJS.indexOf(t.obj) < 0 || !NH.PALETTE[t.color]) return 'obj'; break;
      case 'shape': if (NH.SHAPES.indexOf(t.shape) < 0 || !NH.PALETTE[t.color]) return 'shape'; break;
      case 'dots': if (!(t.n >= 1 && t.n <= 12 && t.n === Math.floor(t.n)) || typeof t.numeral !== 'boolean') return 'dots n ' + t.n; break;
      case 'animal': if (!NH.ANIMALS[t.animal] || t.home !== NH.ANIMALS[t.animal]) return 'animal'; break;
      case 'tile': if (!t.text || String(t.text).length > 5) return 'tile text'; break;
    }
    if (t.big !== undefined && typeof t.big !== 'boolean') return 'big';
    return null;
  }
  /** null when the round follows every rule (DESIGN §5.1 / §3), else the reason. */
  function validate(r) {
    if (!r || !r.rows || !r.rule) return 'no rows / rule';
    var age = r.age, ri = r.roundIndex, rule = r.rule, i, j, e, km = sizeFor(r.topic, age, ri, r.level, r.short, r.maxK);
    if (r.mode !== km.mode) return 'mode ' + r.mode;
    if (r.rows.length !== km.k || r.k !== km.k) return 'rows ' + r.rows.length + ' (want ' + km.k + ')';
    if (r.m !== km.m || r.n !== km.k * km.m) return 'm / n';
    if (NH.FRUITS.indexOf(r.fruit) < 0) return 'fruit';
    if (!r.promptKey || !r.params) return 'prompt';
    var ids = {}, all = [], T = [], O = [], tIdx = [];
    for (j = 0; j < r.rows.length; j++) {
      var row = r.rows[j], nt = 0;
      if (row.length !== km.m) return 'row ' + j + ' has ' + row.length + ' stones';
      for (i = 0; i < row.length; i++) {
        var s = row[i];
        if (!s.id || ids[s.id] || s.row !== j || s.i !== i) return 'stone id ' + s.id;
        ids[s.id] = 1;
        if ((e = thingOk(s.thing))) return e;
        all.push(s.thing);
        if (s.target) {
          nt++; T.push(s.thing); tIdx.push(i);
          if (!ruleHolds(rule, s.thing, r, j)) return s.id + ' does not match ' + rule.kind + '=' + rule.value;
        } else {
          O.push({ t: s.thing, row: j });
          if (ruleHolds(rule, s.thing, r, j)) return s.id + ' matches but is no target';
        }
      }
      if (nt !== 1) return 'row ' + j + ': ' + nt + ' targets';
      // inside a row every stone is different (no two look-alike distractors next to each other where a choice exists)
      var keys = row.map(function (q) { return thingKey(q.thing); });
      if (uniq(keys).length !== keys.length && r.topic !== 'size') return 'row ' + j + ': two stones alike';
    }
    if (r.k >= 2 && tIdx.every(function (x) { return x === tIdx[0]; })) return 'the target in the same place in every row';
    if (LIMITED[rule.kind]) {
      var vals = uniq(O.map(function (q) { return String(valueOf(rule, q.t, r)); }));
      if (vals.length < 1 || vals.length > OTHER_VALUES[age]) return vals.length + ' distractor values';
    }
    var cs = uniq(all.filter(function (t) { return t.color; }).map(function (t) { return t.color; }));
    if (age < COLOR_SAFE_BELOW && (clash(cs, CLASH) || cs.indexOf('pink') >= 0)) return 'colour clash ' + cs.join('+');
    if (r.params.k !== undefined && r.params.k !== r.k) return 'params.k';
    function kinds(k) { return all.every(function (t) { return t.kind === k; }); }
    switch (r.topic) {
      case 'colors': {
        if (!kinds('obj') || rule.kind !== 'color' || r.promptKey !== 'p.colors' || r.params.color !== rule.value) return 'colors prompt / kind';
        if (ri === 0 && !all.every(function (t) { return t.obj === all[0].obj; })) return 'colors warm-up: the same obj';
        if (ri > 0 && age >= 4 && uniq(T.map(function (t) { return t.obj; })).length !== Math.min(T.length, NH.OBJS.length)) return 'colors: different objs';
        if (ri > 0) for (j = 0; j < r.rows.length; j++) {   // the obj is no cue: the row's target obj is also on a distractor of that row
          var tj = r.rows[j].filter(function (q) { return q.target; })[0].thing.obj;
          if (!r.rows[j].some(function (q) { return !q.target && q.thing.obj === tj; })) return 'colors: the obj is a cue in row ' + j;
        }
        break;
      }
      case 'shapes': {
        if (!kinds('shape') || rule.kind !== 'shape' || r.params.shape !== rule.value) return 'shapes prompt / kind';
        var shs = uniq(all.map(function (t) { return t.shape; }));
        if (anySimilar(shs)) return 'confusable shapes ' + shs.join('+');
        if (all.some(function (t) { return shapesFor(age).indexOf(t.shape) < 0; })) return 'shape at age ' + age;
        if (age < 5) { if (cs.length !== 1 || r.promptKey !== 'p.shapes') return 'shapes: one colour'; }
        else {
          if (r.promptKey !== 'p.shapes5') return 'shapes5 prompt';
          for (j = 0; j < r.rows.length; j++) { var rc = r.rows[j].map(function (q) { return q.thing.color; }); if (uniq(rc).length !== rc.length) return 'shapes5: one colour per stone in a row'; }
          if (r.k >= 2) {
            var tc = T.map(function (t) { return t.color; });
            if (!O.some(function (q) { return tc.indexOf(q.t.color) >= 0; })) return 'shapes5: the colour is a cue';
          }
        }
        break;
      }
      case 'size': {
        if (rule.kind !== 'size' || (rule.value !== 'big' && rule.value !== 'small') || r.promptKey !== 'p.size' || r.params.big !== (rule.value === 'big')) return 'size prompt';
        var a0 = all[0];
        if (!all.every(function (t) { return t.kind === 'obj' && t.obj === a0.obj && t.color === a0.color && typeof t.big === 'boolean'; })) return 'size: one obj';
        break;
      }
      case 'count': {
        if (!kinds('dots')) return 'count kind';
        if (r.mode === 'countSeq') {
          if (rule.kind !== 'seq' || rule.value !== r.k || r.promptKey !== 'p.countSeq' || r.params.n !== r.k) return 'countSeq prompt';
          for (j = 0; j < r.rows.length; j++) for (i = 0; i < r.rows[j].length; i++) {
            var st = r.rows[j][i], nn = st.thing.n;
            if (!st.thing.numeral) return 'countSeq: numerals';
            if (nn < 1 || nn > r.k + 2) return 'countSeq range ' + nn;
            if (!st.target && (nn === j + 1 || (age <= 4 && nn === j + 2))) return 'countSeq distractor ' + nn + ' in row ' + j;
          }
        } else {
          if (rule.kind !== 'n' || r.promptKey !== 'p.countSel' || r.params.n !== rule.value) return 'countSel prompt';
          var SR = selRange(age, r.maxDots);
          if (rule.value < SR[0] || rule.value > SR[1]) return 'countSel a ' + rule.value;
          if (all.some(function (t) { return t.numeral; })) return 'countSel: no numerals';
          for (i = 0; i < O.length; i++) if (!countPairOk(rule.value, O[i].t.n, age, SR[2])) return 'count pair ' + rule.value + '/' + O[i].t.n + ' at age ' + age;
        }
        break;
      }
      case 'animals': {
        if (!kinds('animal')) return 'animals kind';
        if (rule.kind === 'animal') {
          if (r.promptKey !== 'p.animal' || r.params.animal !== rule.value) return 'animal prompt';
          if (!(age <= 3 || ri === 0)) return 'p.animal after the warm-up';
          if (all.some(function (t) { return t.home !== 'farm'; })) return 'p.animal: farm animals';
        } else if (rule.kind === 'home') {
          if (r.promptKey !== 'p.home' || r.params.home !== rule.value || age <= 3 || ri === 0) return 'home prompt';
          if (rule.value !== 'farm' && rule.value !== 'sea') return 'home: farm or sea';
          var an = T.map(function (t) { return t.animal; }), have = homeAnimals(rule.value).length;
          if (uniq(an).length !== Math.min(an.length, have)) return 'home: different animals';
          if (all.some(function (t) { return t.nameKind !== 'home' || t.nameValue !== t.home; })) return 'home names';
          var oh = uniq(O.map(function (q) { return q.t.home; }));
          if (oh.length > (age <= 4 ? 2 : 3)) return 'home: distractor homes ' + oh.length;
        } else return 'animals rule';
        break;
      }
      case 'letters': case 'lower': {
        if (!kinds('tile') || rule.kind !== 'letter' || r.promptKey !== 'p.' + r.topic) return r.topic + ' prompt';
        var pool = letterPool(r.lang, r.topic);
        if (all.some(function (t) { return t.text.length !== 1 || pool.indexOf(t.text.toUpperCase()) < 0; })) return 'letter pool';
        if (r.topic === 'letters' && all.some(function (t) { return t.text !== t.text.toUpperCase(); })) return 'letters: capitals';
        var lt = uniq(all.map(function (t) { return t.text; }));
        for (i = 0; i < lt.length; i++) for (j = i + 1; j < lt.length; j++) if (lt[i].toUpperCase() !== lt[j].toUpperCase() && lookalike(lt[i], lt[j])) return 'lookalike letters ' + lt[i] + lt[j];
        if (r.topic === 'lower') {
          for (j = 1; j < T.length; j++) if ((T[j].text === rule.value) === (T[j - 1].text === rule.value)) return 'lower: rows alternate the case';
        }
        break;
      }
      case 'initial': {
        if (!all.every(function (t) { return t.kind === 'obj' || t.kind === 'animal'; }) || rule.kind !== 'initial' || r.promptKey !== 'p.initial') return 'initial prompt';
        if (letterPool(r.lang, 'letters').indexOf(rule.value) < 0) return 'initial letter pool';
        for (i = 0; i < all.length; i++) { var Li = initialOf(all[i], r.lang, r.nameSrc); if (!Li || Li !== all[i].letter) return 'initial of ' + (all[i].obj || all[i].animal); }
        for (i = 0; i < O.length; i++) if (baseLetter(O[i].t.letter) === rule.value) return 'initial: a look-alike letter';
        if (all.some(function (t) { return (t.kind === 'obj' && INITIAL_OBJS.indexOf(t.obj) < 0) || (t.kind === 'animal' && INITIAL_ANIMALS.indexOf(t.animal) < 0); })) return 'initial things';
        break;
      }
      case 'add': case 'sub': {
        var want = r.topic === 'add' ? 'sum' : 'diff', op = r.topic === 'add' ? '+' : MINUS;
        if (!kinds('tile') || rule.kind !== want || r.params.n !== rule.value) return r.topic + ' prompt';
        for (i = 0; i < all.length; i++) {
          var p = parseOp(all[i].text);
          if (!p || p.op !== op || p.a !== all[i].a || p.b !== all[i].b || p.b < 1) return 'tile ' + all[i].text;
          if (r.topic === 'add' && (p.a < 1 || p.a + p.b > (ADD_RANGE[age] || ADD_RANGE[6])[1])) return 'sum range';
          if (r.topic === 'sub' && (p.a > SUB_TOP || p.a - p.b < 0)) return 'difference range';
        }
        var tx = all.map(function (t) { return t.text; });
        if (uniq(tx).length !== tx.length) return r.topic + ': two tiles alike';
        break;
      }
      case 'oddeven': {
        if (!kinds('tile') || rule.kind !== 'parity' || r.params.parity !== rule.value) return 'oddeven prompt';
        var ns = all.map(function (t) { return +t.text; });
        if (ns.some(function (x, q) { return !(x >= 1 && x <= ODDEVEN_MAX) || ns.indexOf(x) !== q; })) return 'oddeven numbers';
        break;
      }
      default: return 'topic ' + r.topic;
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
  function nearNums(ans, lo, hi, rng) {
    var c = rng.shuffle(range(lo, hi).filter(function (x) { return x !== ans && Math.abs(x - ans) <= 3; }));
    if (c.length < 2) c = c.concat(rng.shuffle(range(lo, hi).filter(function (x) { return x !== ans && c.indexOf(x) < 0; })));
    return c;
  }
  /** makeTalk(topic, { age, lang, rng }) — one question per chapter; 2 picture choices at age 3, else 3. */
  function makeTalk(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new NH.RNG(1);
    var show = null, params = {}, ch, a, nC = age <= 3 ? 2 : 3, pk = 'talk.' + topic;
    switch (topic) {
      case 'colors': {
        var safe, pickC = null;
        for (var tc = 0; tc < 200 && !pickC; tc++) {
          a = rng.pick(colorPool(age));
          safe = colorPool(age).filter(function (c) { return c !== a && !clash([a, c], pairsFor(age)); });
          var sc = rng.sample(safe, nC - 1);
          if (sc.length === nC - 1 && !clash(sc.concat([a]), pairsFor(age))) pickC = sc;
        }
        params = { color: a }; show = obj(rng.pick(NH.OBJS), a);
        ch = choicesFrom(rng, a, pickC || safe.slice(0, 1), nC, function (c) { return { kind: 'color', color: c }; }); break;
      }
      case 'shapes': {
        var col = rng.pick(colorPool(age)), shp = shapesFor(age); a = rng.pick(shp); params = { shape: a };
        var others = rng.shuffle(shp.filter(function (s) { return s !== a && !similarShapes(a, s); })), sel = [];
        others.forEach(function (s) { if (sel.length < nC - 1 && sel.every(function (q) { return !similarShapes(q, s); })) sel.push(s); });
        ch = choicesFrom(rng, a, sel, nC, function (s) { return shape(s, col); }); break;
      }
      case 'size': {
        var ob = rng.pick(NH.OBJS), cz = rng.pick(colorPool(age)); a = rng.pick(['big', 'small']); params = { size: a };
        ch = choicesFrom(rng, a, ['big', 'small'], 2, function (s) { return sized(obj(ob, cz), s === 'big'); }); break;
      }
      case 'animals': {
        if (age <= 3) {
          pk = 'talk.who'; a = rng.pick(FARM); params = { animal: a }; show = animal(a);
          ch = choicesFrom(rng, a, FARM, nC, function (x) { return animal(x); });
        } else {
          var w = rng.pick(WILD.filter(function (q) { return q !== 'fishbowl'; })); a = NH.ANIMALS[w]; params = { animal: w }; show = animal(w);
          var hs = NH.HOMES.filter(function (h) { return h !== a && h !== 'farm'; }), pickH = ['farm'].concat(rng.shuffle(hs)).slice(0, nC - 1);
          ch = choicesFrom(rng, a, pickH, nC, function (h) { return { kind: 'home', home: h }; });
        }
        break;
      }
      case 'count': {
        var hi = { 3: 4, 4: 5, 5: 8, 6: 10, 7: 10 }[age]; a = rng.int(age <= 4 ? 1 : 2, hi); params = { n: a }; show = dots(a, false);
        var near = range(Math.max(1, a - 2), Math.min(age <= 4 ? 5 : 12, a + 2)).filter(function (x) { return x !== a; });
        ch = choicesFrom(rng, a, near, nC, function (x) { return { kind: 'number', n: x }; }); break;
      }
      case 'letters': case 'lower': {
        var P = letterPool(lang, topic); a = rng.pick(P);
        var Pl = P.filter(function (x) { return !lookalike(a, x); });
        if (topic === 'lower') { params = { letter: a, small: a.toLowerCase() }; show = tileL(a); }
        else params = { letter: a };
        ch = choicesFrom(rng, a, Pl, 3, function (x) { return tileL(topic === 'lower' ? x.toLowerCase() : x); }); break;
      }
      case 'initial': {
        var src = NH.I18N && typeof NH.I18N.name === 'function' ? 'i18n' : 'table', g = initialGroups(lang, src), cand = [], LP = letterPool(lang, 'letters');
        Object.keys(g).forEach(function (L) { if (LP.indexOf(L) >= 0) g[L].forEach(function (q) { cand.push({ L: L, q: q }); }); });
        if (!cand.length) { g = initialGroups(lang, 'table'); Object.keys(g).forEach(function (L) { if (LP.indexOf(L) >= 0) g[L].forEach(function (q) { cand.push({ L: L, q: q }); }); }); }
        var pc = rng.pick(cand); a = pc.L;
        show = pc.q.kind === 'animal' ? animal(pc.q.value) : obj(pc.q.value, rng.pick(COLORS5)); show.letter = a;
        params = { letter: a, nameKind: pc.q.kind, nameValue: pc.q.value };
        var lp = LP.filter(function (x) { return x !== a && !lookalike(a, x); });
        ch = choicesFrom(rng, a, lp, 3, function (x) { return tileL(x); }); break;
      }
      case 'add': {
        var top = (ADD_RANGE[age] || ADD_RANGE[6])[1], k;
        a = rng.int(age >= 7 ? 6 : 3, top); k = rng.int(1, a - 1); params = { a: k, b: a - k }; show = tileAdd(k, a - k);
        ch = choicesFrom(rng, a, nearNums(a, 1, top + 2, rng), 3, function (x) { return { kind: 'number', n: x }; }); break;
      }
      case 'sub': {
        a = rng.int(0, 8); var kk = rng.int(1, SUB_TOP - a); params = { a: a + kk, b: kk }; show = tileSub(a + kk, kk);
        ch = choicesFrom(rng, a, nearNums(a, 0, 10, rng), 3, function (x) { return { kind: 'number', n: x }; }); break;
      }
      case 'oddeven': {
        var par = rng.pick(['odd', 'even']); params = { parity: par };
        a = rng.pick(range(1, 20).filter(function (x) { return parityOf(x) === par; }));
        var oth = range(1, 20).filter(function (x) { return parityOf(x) !== par; });
        ch = choicesFrom(rng, a, oth, 3, function (x) { return { kind: 'number', n: x }; }); break;
      }
      default: throw new Error('NH.Content: unknown topic ' + topic);
    }
    return { topic: topic, promptKey: pk, params: params, show: show, choices: ch.choices, answer: ch.answer, answerId: ch.answer };
  }

  /** 4 chapter topics for a session. Without rng or `last`: NH.AGE_TOPICS (the first session). With both: chapter 1 rotates between
   *  the pool's two easiest topics; chapters 2–4 = 3 of the others (preferring topics left out of `last`), in difficulty order. */
  function topicsFor(age, rng, last) {
    age = ageOf(age);
    last = Array.isArray(last) ? last : [];
    if (!rng || !last.length) return NH.AGE_TOPICS[age].slice();
    var pool = NH.AGE_POOLS[age].slice(), ord = function (a, b) { return pool.indexOf(a) - pool.indexOf(b); };
    var first = last[0] === pool[0] ? pool[1] : pool[0];
    var rest = pool.filter(function (t) { return t !== first; });
    var fresh = rng.shuffle(rest.filter(function (t) { return last.indexOf(t) < 0; }));
    var old = rng.shuffle(rest.filter(function (t) { return last.indexOf(t) >= 0; }));
    return [first].concat(fresh.concat(old).slice(0, 3).sort(ord));
  }

  NH.Content = {
    makeRound: makeRound, makeTalk: makeTalk, validate: validate, topicsFor: topicsFor, ruleHolds: ruleHolds, sizeFor: sizeFor,
    tableKM: tableKM, valueOf: valueOf, ageOf: ageOf, langOf: langOf, clash: clash, pairsFor: pairsFor, colorPool: colorPool,
    shapesFor: shapesFor, similarShapes: similarShapes, lookalike: lookalike, letterPool: letterPool, parityOf: parityOf,
    initialOf: initialOf, initialOfName: initialOfName, thingName: thingName, baseLetter: baseLetter, initialGroups: initialGroups,
    thingKey: thingKey, roundKey: roundKey, parseOp: parseOp, countPairOk: countPairOk, sameRule: sameRule, homeAnimals: homeAnimals,
    TOPICS: ALL_TOPICS, COLORS: COLORS, COLORS5: COLORS5, SHAPES3: SHAPES3, SHAPES4: SHAPES4, SIMILAR_SHAPES: SIMILAR_SHAPES, LOOKALIKE: LOOKALIKE,
    SMALL_PAIRS: SMALL_PAIRS, LETTER_POOL: LETTER_POOL, CLASH: CLASH, COLOR_SAFE_BELOW: COLOR_SAFE_BELOW, OTHER_VALUES: OTHER_VALUES,
    SEL_RANGE: SEL_RANGE, ADD_RANGE: ADD_RANGE, SUB_RANGE: SUB_RANGE, SUB_TOP: SUB_TOP, ODDEVEN_MAX: ODDEVEN_MAX, MINUS: MINUS,
    FARM: FARM, WILD: WILD, INITIAL_OBJS: INITIAL_OBJS, INITIAL_ANIMALS: INITIAL_ANIMALS
  };
})(window.NH = window.NH || {});
