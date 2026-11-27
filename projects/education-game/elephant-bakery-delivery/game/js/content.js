/* Tupi's Bakery Delivery — BD.PALETTE, BD.COLORS, BD.SHAPES, BD.TREATS, BD.ANIMALS, BD.HOMES, BD.AGE_TOPICS, BD.AGE_POOLS,
 * BD.Content (pure + deterministic delivery-round generator with an independent self-check; DESIGN §5.1)
 *
 *   BD.Content.makeRound(topic, { age, lang, rng, roundIndex, level, surprise, short?, usedKeys?, prevRule?, maxN? (World.maxHouses) })
 *       → round (validated with validate(); retries; throws if impossible)
 *   BD.Content.makeTalk(topic, { age, lang, rng })  → talk
 *   BD.Content.validate(round)  → null | 'reason'
 *   BD.Content.topicsFor(age, rng?, lastTopics?)  → the 4 chapter topics (easiest first)
 *   BD.Content.matches(round, cargo, sign)  → does this cargo belong to the house with this sign (the round's rule)
 *   BD.Content.sizeFor(topic, age, roundIndex, level, short)  → { n houses, d deliveries, forks }
 *
 * round = { topic, age, lang, roundIndex, level, short, surprise: null|'mouse'|'bird'|'snow',
 *   houses: [ { id 'h<i>', i, sign: thing, color: answer colour (colours topic: roof + door) | null, value } ]  (n; random order),
 *   orders: [ { cargo: thing, target: houseId, promptKey, params, rule: { kind, value, nameKind }, count?: n, home? } ]  (d; distinct
 *             targets; exactly ONE house matches each cargo),
 *   map: { seed, forks: 1|2 }, n, d, promptKey, params (= orders[0]), rule (= orders[0].rule), key, nameSrc }
 * thing = { kind 'treat'|'shape'|'cookies'|'dots'|'tile'|'animal'|'home'|'blob', color?, obj?, shape?, n?, numeral?, animal?, home?,
 *           text?, big?, letter?, a?, b?, op?, nameKind, nameValue } — nameKind / nameValue name the thing the way THIS round is about:
 *   colors 'color'/'red' · shapes 'shape'/'star' · size 'size'/'big'|'small' · count 'number'/3 · animals 'animal'/'cow' (signs + cargo)
 *   or 'home'/'farm' (home signs; the cargo animal: 'animal') · letters / lower / initial 'letter'/'B' (the CAPITAL) · add 'sum'/5
 *   (cargo) · sub 'diff'/3 (cargo) · add / sub signs 'number'/5 · oddeven 'parity'/'odd' (signs) · cookies 'number'/n
 * Prompt keys / params (per order): p.colors {color, treat} · p.shapes {shape} · p.shapes5 {shape, color} · p.size {big, treat} ·
 *   p.count {n} · p.animal {animal} · p.home {animal, home} · p.letters {letter} · p.lower {letter, small} · p.initial {nameKind,
 *   nameValue, letter} · p.add {a, b, n} · p.sub {a, b, n} · p.oddeven {n, parity}
 * talk = { topic, promptKey, params, show: thing | null, choices: [{ id, thing, value }], answer (choice id), answerId }
 *   promptKeys: talk.colors {color} · talk.shapes {shape} · talk.size {size} · talk.count {n} (show = a cookies thing) · talk.animals
 *   {animal} (where does it live; home badges) · talk.who {animal} (age 3) · talk.letters {letter} · talk.lower {letter, small} ·
 *   talk.initial {letter, nameKind, nameValue} · talk.add {a, b} · talk.sub {a, b} · talk.oddeven {parity}
 *   choice things: any thing, or { kind:'color', color } · { kind:'number', n } · { kind:'home', home } · { kind:'size', big }
 */
(function (BD) {
  'use strict';

  // DESIGN §3 answer palette (exact hex)
  BD.PALETTE = {
    red:    { base: '#E84A4A', dark: '#A8282E', light: '#F7A0A0' },
    blue:   { base: '#3C8DE8', dark: '#1F5BA8', light: '#A6CCF5' },
    yellow: { base: '#FFD23F', dark: '#C99A12', light: '#FFEB9C' },
    green:  { base: '#4CC26B', dark: '#2A8343', light: '#A8E6B8' },
    orange: { base: '#FF9A2E', dark: '#C4650C', light: '#FFCB8E' },
    purple: { base: '#8E44AD', dark: '#6840A8', light: '#D2BDF3' },
    pink:   { base: '#FF8FC0', dark: '#C9558A', light: '#FFCCE2' }      // an answer colour from age 5
  };
  for (var pk in BD.PALETTE) BD.PALETTE[pk].fill = BD.PALETTE[pk].base;
  BD.COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  var COLORS = BD.COLORS.slice(0, 6), COLORS5 = BD.COLORS.slice();
  BD.SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'oval', 'rect', 'diamond'];
  BD.TREATS = ['cupcake', 'macaron', 'donut', 'cakepop', 'jelly'];
  BD.ANIMALS = { cow: 'farm', pig: 'farm', sheep: 'farm', duck: 'farm', hen: 'farm', horse: 'farm', goat: 'farm',
    crab: 'sea', fishbowl: 'sea', penguin: 'ice', lion: 'savanna', monkey: 'jungle' };
  BD.HOMES = ['farm', 'sea', 'ice', 'savanna', 'jungle'];
  BD.THING_KINDS = ['treat', 'shape', 'cookies', 'dots', 'tile', 'animal', 'home', 'blob'];
  var ANIMAL_LIST = Object.keys(BD.ANIMALS);
  var FARM = ANIMAL_LIST.filter(function (a) { return BD.ANIMALS[a] === 'farm'; });
  var WILD = ANIMAL_LIST.filter(function (a) { return BD.ANIMALS[a] !== 'farm'; });
  function homeAnimals(h) { return ANIMAL_LIST.filter(function (a) { return BD.ANIMALS[a] === h; }); }

  BD.AGE_TOPICS = {
    3: ['colors', 'shapes', 'size', 'animals'],
    4: ['colors', 'shapes', 'count', 'animals'],
    5: ['shapes', 'count', 'letters', 'animals'],
    6: ['lower', 'initial', 'add', 'count'],
    7: ['initial', 'add', 'sub', 'oddeven']
  };
  /* Every age has a POOL of 5 topics in difficulty order; a later session plays 4 of them (rotating between sessions). */
  BD.AGE_POOLS = {
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
  var COUNT_RANGE = { 3: [1, 4], 4: [1, 5], 5: [1, 8], 6: [4, 12], 7: [4, 12] };   // house numbers (cookies)
  var ADD_RANGE = { 6: [2, 10], 7: [4, 20] }, SUB_TOP = 10, ODDEVEN = [2, 10];
  var MINUS = '−';
  var VI_DIGRAPHS = ['ngh', 'ng', 'nh', 'ch', 'gh', 'kh', 'ph', 'th', 'tr', 'gi', 'qu'];
  var VI_ALPHABET = ['A', 'Ă', 'Â', 'B', 'C', 'D', 'Đ', 'E', 'Ê', 'G', 'H', 'I', 'K', 'L', 'M', 'N', 'O', 'Ô', 'Ơ', 'P', 'Q', 'R', 'S', 'T', 'U', 'Ư', 'V', 'X', 'Y'];
  /* Fallback names (DESIGN §6) when BD.I18N.name is not loaded / does not know a thing (headless tests). */
  BD.THING_NAMES = {
    en: { cupcake: 'cupcake', macaron: 'macaron', donut: 'donut', cakepop: 'cake pop', jelly: 'jelly',
      cow: 'cow', pig: 'pig', sheep: 'sheep', duck: 'duck', hen: 'hen', horse: 'horse', goat: 'goat', crab: 'crab', fishbowl: 'goldfish',
      penguin: 'penguin', lion: 'lion', monkey: 'monkey' },
    vi: { cupcake: 'bánh cupcake', macaron: 'bánh macaron', donut: 'bánh donut', cakepop: 'kẹo bánh', jelly: 'thạch rau câu',
      cow: 'con bò', pig: 'con heo', sheep: 'con cừu', duck: 'con vịt', hen: 'con gà mái', horse: 'con ngựa', goat: 'con dê', crab: 'con cua',
      fishbowl: 'bể cá vàng', penguin: 'chim cánh cụt', lion: 'sư tử', monkey: 'con khỉ' }
  };
  /* Things used by 'initial': the picture must say the word (the goldfish bowl is left out). */
  var INITIAL_TREATS = BD.TREATS.slice();
  var INITIAL_ANIMALS = ANIMAL_LIST.filter(function (a) { return a !== 'fishbowl'; });
  var CLASSIFIERS = { en: ['the', 'a', 'an'], vi: ['con', 'cái', 'quả', 'chiếc', 'cây', 'bông', 'bánh'] };

  function langOf(l) { return l === 'vi' ? 'vi' : 'en'; }
  function ageOf(a) { a = Math.round(+a || 4); return a < 3 ? 3 : a > 7 ? 7 : a; }
  function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }
  function parityOf(n) { return n % 2 ? 'odd' : 'even'; }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
  function clone(t) { var o = {}; for (var k in t) o[k] = t[k]; return o; }

  // ---------------- names → initials ('initial' topic) ----------------
  /** The name of a treat / animal: BD.I18N.name(lang, kind, value) when loaded and it knows the thing, else BD.THING_NAMES. */
  function thingName(kind, value, lang, src) {
    lang = langOf(lang);
    if (src !== 'table' && BD.I18N && typeof BD.I18N.name === 'function') {
      try {
        var s = BD.I18N.name(lang, kind, value);
        if (typeof s === 'string' && s.trim() && s.indexOf('{') < 0 && s !== String(value) + '?' && s !== String(value)) return s;
      } catch (e) { /* fall back */ }
    }
    return BD.THING_NAMES[lang][value] || null;
  }
  function stripMarks(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC'); }
  /** The initial letter of a name (classifier / article dropped; VI tone marks dropped, Ă Â Ê Ô Ơ Ư Đ kept; VI words that start with
   *  a digraph (ch, ng, kh, th …) give null: never used in an 'initial' round). */
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
    var kind = thing.kind === 'animal' ? 'animal' : thing.kind === 'treat' ? 'treat' : null;
    if (!kind) return null;
    return baseLetter(initialOfName(thingName(kind, kind === 'animal' ? thing.animal : thing.obj, lang, src), lang));
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
  /** n distinct colours (no CVD clash below age 5), one of them `must` when given. */
  function safeColors(rng, age, n, must, avoidFirst) {
    var pool = colorPool(age);
    for (var t = 0; t < 200; t++) {
      var s = rng.sample(pool, n);
      if (must && s.indexOf(must) < 0) s[rng.int(0, n - 1)] = must;
      if (uniq(s).length !== n || clash(s, pairsFor(age))) continue;
      if (avoidFirst && t < 150 && s.indexOf(avoidFirst) >= 0 && s.length === 1) continue;
      return s;
    }
    throw new Error('no colour set');
  }
  function shapesFor(age) { return age <= 3 ? SHAPES3.slice() : age === 4 ? SHAPES4.slice() : BD.SHAPES.slice(); }
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
  /** m letters from the pool, none a look-alike of another (incl. the `must` letters). */
  function pickLetters(rng, pool, must, m) {
    must = must || [];
    for (var t = 0; t < 120; t++) {
      var s = must.slice(), cand = rng.shuffle(pool.slice());
      for (var i = 0; i < cand.length && s.length < m; i++) {
        var c = cand[i];
        if (s.every(function (x) { return !lookalike(x, c); })) s.push(c);
      }
      if (s.length === m) return s;
    }
    throw new Error('no letter set');
  }

  // ---------------- things ----------------
  function treat(o, c, big) { var t = { kind: 'treat', obj: o, color: c, nameKind: 'color', nameValue: c }; if (big !== undefined) { t.big = !!big; t.nameKind = 'size'; t.nameValue = big ? 'big' : 'small'; } return t; }
  function blob(c) { return { kind: 'blob', color: c, nameKind: 'color', nameValue: c }; }
  function shape(s, c) { return { kind: 'shape', shape: s, color: c, nameKind: 'shape', nameValue: s }; }
  function dots(n) { return { kind: 'dots', n: n, numeral: true, nameKind: 'number', nameValue: n }; }
  function cookies(n) { return { kind: 'cookies', n: n, nameKind: 'number', nameValue: n }; }
  function animal(a) { return { kind: 'animal', animal: a, home: BD.ANIMALS[a], nameKind: 'animal', nameValue: a }; }
  function homeT(h) { return { kind: 'home', home: h, nameKind: 'home', nameValue: h }; }
  function tileL(c) { return { kind: 'tile', text: String(c), nameKind: 'letter', nameValue: String(c).toUpperCase() }; }
  function tileN(n) { return { kind: 'tile', text: String(n), n: n, nameKind: 'number', nameValue: n }; }
  function tileP(p) { return { kind: 'tile', text: '@' + p, parity: p, nameKind: 'parity', nameValue: p }; }
  function tileAdd(a, b) { return { kind: 'tile', text: a + '+' + b, a: a, b: b, op: '+', n: a + b, nameKind: 'sum', nameValue: a + b }; }
  function tileSub(a, b) { return { kind: 'tile', text: a + MINUS + b, a: a, b: b, op: MINUS, n: a - b, nameKind: 'diff', nameValue: a - b }; }
  function thingKey(t) {
    return [t.kind, t.obj || '', t.color || '', t.shape || '', t.n === undefined ? '' : t.n, t.animal || '', t.home || '', t.text || '', t.big === false ? 's' : t.big ? 'b' : ''].join(':');
  }
  function roundKey(r) {
    return r.topic + '|' + r.houses.map(function (h) { return thingKey(h.sign); }).sort().join(',') + '|' + r.orders.map(function (o) { return thingKey(o.cargo); }).join(',');
  }

  /** {n houses, d deliveries, forks} (DESIGN §5.1). The session warm-up (chapter 0, round 0) and short rounds are (2, 1). */
  function tableND(age, ri, level, short) {
    if (short && ri > 0) return [2, 1];
    if (ri === 0 && level === 0) return [2, 1];
    var T = age <= 3 ? [[2, 1], [2, 2], [3, 1], [3, 2]]
      : age === 4 ? (level === 0 ? [[2, 1], [2, 2], [3, 2], [3, 2]] : [[2, 1], [3, 2], [3, 2], [3, 2]])
      : age === 5 ? [[3, 2], [3, 2], [4, 2], [4, 3]] : [[3, 2], [4, 2], [4, 3], [4, 3]];
    return T[Math.min(Math.max(0, ri | 0), 3)].slice();
  }
  function sizeFor(topic, age, ri, level, short, maxN) {
    age = ageOf(age);
    var nd = tableND(age, ri, level, short), n = Math.min(nd[0], Math.max(2, maxN || 4)), d = nd[1];
    if (topic === 'size' || topic === 'oddeven') { n = 2; d = Math.min(d, 2); }   // two houses: big / small, odd / even
    d = Math.min(d, n);
    var forks = age >= 5 && n >= 3 && ((ri | 0) >= 2 || n >= 4) && !short ? 2 : 1;   // 4 houses always split twice
    return { n: n, d: d, forks: forks };
  }

  // ---------------- the rule ----------------
  /** Does `cargo` belong to the house showing `sign` under the round's topic? (`r` gives topic / lang / nameSrc.) */
  function matches(r, c, s) {
    if (!r || !c || !s) return false;
    switch (r.topic) {
      case 'colors': return s.kind === 'blob' && c.color === s.color;
      case 'shapes': return s.kind === 'shape' && c.kind === 'shape' && c.shape === s.shape;
      case 'size': return typeof c.big === 'boolean' && c.big === s.big;
      case 'count': return s.kind === 'dots' && c.kind === 'cookies' && c.n === s.n;
      case 'animals':
        if (s.kind === 'animal') return c.kind === 'animal' && c.animal === s.animal;
        return s.kind === 'home' && c.kind === 'animal' && BD.ANIMALS[c.animal] === s.home;
      case 'letters': return s.kind === 'tile' && c.kind === 'tile' && c.text === s.text;
      case 'lower': return s.kind === 'tile' && c.kind === 'tile' && c.text.toLowerCase() === s.text && c.text !== s.text;
      case 'initial': return s.kind === 'tile' && initialOf(c, r.lang, r.nameSrc) === s.text;
      case 'add': case 'sub': return s.kind === 'tile' && c.kind === 'tile' && parseOp(c.text) !== null && s.n === c.n && String(s.n) === s.text;
      case 'oddeven': return s.kind === 'tile' && c.kind === 'cookies' && s.parity === parityOf(c.n);
    }
    return false;
  }
  function parseOp(text) {
    var m = /^(\d+)([+−])(\d+)$/.exec(String(text || ''));
    return m ? { a: +m[1], op: m[2], b: +m[3] } : null;
  }
  function R(kind, value, nameKind) { return { kind: kind, value: value, nameKind: nameKind }; }

  /* ---------------- sets
   * buildSet → { signs: [thing × n], colors?: [houseColour × n], orders: [{ cargo, ti (index of the target sign), promptKey, params,
   * rule }] }. `avoid` = the last order's asked value of the previous round (the target changes every round in a chapter). */
  function pickFresh(rng, list, avoid) { var f = list.filter(function (x) { return String(x) !== String(avoid); }); return rng.pick(f.length ? f : list); }
  /** d distinct sign indices out of n; the first one's value is not `avoid` (values = per-sign rule values). */
  function pickTargets(rng, values, d, avoid) {
    for (var t = 0; t < 40; t++) {
      var idx = rng.sample(range(0, values.length - 1), d);
      if (avoid === null || avoid === undefined || String(values[idx[0]]) !== String(avoid) || t >= 30) return idx;
    }
    return rng.sample(range(0, values.length - 1), d);
  }
  function buildSet(topic, age, lang, rng, ri, nd, src, prev) {
    var n = nd.n, d = nd.d, avoid = prev ? prev.value : null, signs = [], cols = null, orders = [], idx, i, vals;
    switch (topic) {
      case 'colors': {
        var cs = safeColors(rng, age, n);
        if (avoid && cs.length > 1 && cs.indexOf(avoid) >= 0 && rng.chance(0.3)) { /* keep: the target simply is another one */ }
        signs = cs.map(blob); cols = cs.slice();
        idx = pickTargets(rng, cs, d, avoid);
        var treats = ri === 0 ? ['cupcake'] : rng.shuffle(BD.TREATS.slice());
        idx.forEach(function (ti, q) {
          var tr = ri === 0 ? 'cupcake' : age >= 4 ? treats[q % treats.length] : treats[0];
          orders.push({ cargo: treat(tr, cs[ti]), ti: ti, promptKey: 'p.colors', params: { color: cs[ti], treat: tr }, rule: R('color', cs[ti], 'color') });
        });
        break;
      }
      case 'shapes': {
        var shp = shapesFor(age), set = null;
        for (var ts = 0; ts < 80 && !set; ts++) { var cand = rng.sample(shp, n); if (!anySimilar(cand)) set = cand; }
        if (!set) throw new Error('no shape set');
        idx = pickTargets(rng, set, d, avoid);
        if (age < 5) {
          var c = rng.pick(colorPool(age));
          signs = set.map(function (s) { return shape(s, c); });
          idx.forEach(function (ti) { orders.push({ cargo: shape(set[ti], c), ti: ti, promptKey: 'p.shapes', params: { shape: set[ti] }, rule: R('shape', set[ti], 'shape') }); });
        } else {   // shapes5: the house signs in mixed colours, the cargo in yet another colour — the shape is the rule
          var c5 = rng.sample(COLORS5, n + 1);
          signs = set.map(function (s, q) { return shape(s, c5[q]); });
          idx.forEach(function (ti) { orders.push({ cargo: shape(set[ti], c5[n]), ti: ti, promptKey: 'p.shapes5', params: { shape: set[ti], color: c5[n] }, rule: R('shape', set[ti], 'shape') }); });
        }
        break;
      }
      case 'size': {
        var tr2 = rng.pick(BD.TREATS), col = rng.pick(colorPool(age)), bigFirst = avoid === null || avoid === undefined ? rng.chance(0.5) : avoid !== 'big';
        var ord = rng.chance(0.5) ? [true, false] : [false, true];
        signs = ord.map(function (b) { return treat(tr2, col, b); });
        var want = bigFirst ? [true, false] : [false, true];
        for (i = 0; i < d; i++) {
          var b = want[i], ti2 = ord.indexOf(b);
          orders.push({ cargo: treat(tr2, col, b), ti: ti2, promptKey: 'p.size', params: { big: b, treat: tr2 }, rule: R('size', b ? 'big' : 'small', 'size') });
        }
        break;
      }
      case 'count': {
        var CR = COUNT_RANGE[age], nums = null;
        for (var tc = 0; tc < 200 && !nums; tc++) {
          var nn = rng.sample(range(CR[0], CR[1]), n).sort(function (a, b) { return a - b; }), ok = true;
          // the warm-up: never neighbours (1 / 2); ages ≤ 4 later: never ALL neighbours
          for (i = 1; i < nn.length; i++) if (ri === 0 && nn[i] - nn[i - 1] < 2) ok = false;
          if (n >= 2 && age <= 4 && nn[nn.length - 1] - nn[0] === nn.length - 1 && tc < 150) ok = false;
          if (ok) nums = rng.shuffle(nn);
        }
        if (!nums) throw new Error('no count set');
        signs = nums.map(dots);
        idx = pickTargets(rng, nums, d, avoid);
        idx.forEach(function (ti) { orders.push({ cargo: cookies(nums[ti]), ti: ti, count: nums[ti], promptKey: 'p.count', params: { n: nums[ti] }, rule: R('n', nums[ti], 'number') }); });
        break;
      }
      case 'animals': {
        if (age <= 3 || ri === 0) {   // match the same animal (a picture of the friend on the sign)
          var an = rng.sample(FARM, n);
          signs = an.map(animal);
          idx = pickTargets(rng, an, d, avoid);
          idx.forEach(function (ti) { orders.push({ cargo: animal(an[ti]), ti: ti, promptKey: 'p.animal', params: { animal: an[ti] }, rule: R('animal', an[ti], 'animal') }); });
        } else {                      // take the animal home (home badges)
          var hs = rng.sample(BD.HOMES, n);
          signs = hs.map(homeT);
          idx = pickTargets(rng, hs, d, avoid);
          var usedA = [];
          idx.forEach(function (ti) {
            var list = homeAnimals(hs[ti]).filter(function (a) { return usedA.indexOf(a) < 0; }), a = rng.pick(list.length ? list : homeAnimals(hs[ti]));
            usedA.push(a);
            orders.push({ cargo: animal(a), ti: ti, home: hs[ti], promptKey: 'p.home', params: { animal: a, home: hs[ti] }, rule: R('home', hs[ti], 'home') });
          });
        }
        break;
      }
      case 'letters': {
        var pool = letterPool(lang, 'letters'), Ls = pickLetters(rng, pool, [], n);
        signs = Ls.map(tileL);
        idx = pickTargets(rng, Ls, d, avoid);
        idx.forEach(function (ti) { orders.push({ cargo: tileL(Ls[ti]), ti: ti, promptKey: 'p.letters', params: { letter: Ls[ti] }, rule: R('letter', Ls[ti], 'letter') }); });
        break;
      }
      case 'lower': {
        var pl = letterPool(lang, 'lower'), Ll = pickLetters(rng, pl, [], n);
        signs = Ll.map(function (x) { var t = tileL(x.toLowerCase()); return t; });
        idx = pickTargets(rng, Ll, d, avoid);
        idx.forEach(function (ti) { orders.push({ cargo: tileL(Ll[ti]), ti: ti, promptKey: 'p.lower', params: { letter: Ll[ti], small: Ll[ti].toLowerCase() }, rule: R('letter', Ll[ti], 'letter') }); });
        break;
      }
      case 'initial': {
        var g = initialGroups(lang, src), P0 = letterPool(lang, 'letters');
        var have = Object.keys(g).filter(function (q) { return P0.indexOf(q) >= 0; });
        if (have.length < d) throw new Error('no initial groups');
        // the target letters (each with a picture), then other non-look-alike letters for the remaining houses
        var tl = null;
        for (var tt = 0; tt < 60 && !tl; tt++) {
          var s0 = rng.sample(have, d), okL = true;
          for (i = 0; i < s0.length; i++) for (var j = i + 1; j < s0.length; j++) if (lookalike(s0[i], s0[j])) okL = false;
          if (okL && (!avoid || tt > 40 || s0[0] !== avoid)) tl = s0;
        }
        if (!tl) throw new Error('no initial letters');
        var all = pickLetters(rng, P0, tl, n);
        all = rng.shuffle(all.slice());
        signs = all.map(tileL);
        var usedQ = [];
        tl.forEach(function (Lt) {
          var opts = g[Lt].filter(function (q) { return usedQ.indexOf(q.value) < 0; }), q = rng.pick(opts.length ? opts : g[Lt]);
          usedQ.push(q.value);
          var cg = q.kind === 'animal' ? animal(q.value) : treat(q.value, rng.pick(COLORS5));
          cg.letter = Lt; cg.nameKind = q.kind === 'animal' ? 'animal' : 'treat'; cg.nameValue = q.value;
          orders.push({ cargo: cg, ti: all.indexOf(Lt), promptKey: 'p.initial', params: { nameKind: cg.nameKind, nameValue: q.value, letter: Lt }, rule: R('initial', Lt, 'letter') });
        });
        break;
      }
      case 'add': case 'sub': {
        var isAdd = topic === 'add', lo, hi;
        if (isAdd) { var ar = ADD_RANGE[age] || ADD_RANGE[6]; lo = ar[0]; hi = ri === 0 ? Math.min(ar[1], age >= 7 ? 10 : 7) : ar[1]; }
        else { lo = 0; hi = ri === 0 ? 5 : 9; }
        var res = null;
        for (var ta = 0; ta < 200 && !res; ta++) {
          var c0 = rng.int(lo, hi), cand2 = range(Math.max(lo, c0 - 3), Math.min(hi, c0 + 3)).filter(function (x) { return x !== c0; });
          if (cand2.length < n - 1) continue;
          res = [c0].concat(rng.sample(cand2, n - 1));
        }
        if (!res) throw new Error('no ' + topic + ' set');
        res = rng.shuffle(res);
        vals = res;
        signs = res.map(tileN);
        idx = pickTargets(rng, res, d, avoid);
        var usedT = {};
        idx.forEach(function (ti) {
          var v = res[ti], tile, tries = 0;
          do {
            if (isAdd) { var a1 = rng.int(1, Math.max(1, v - 1)); tile = tileAdd(a1, v - a1); }
            else { var top = rng.int(Math.max(v + 1, 2), SUB_TOP); tile = tileSub(top, top - v); }
            tries++;
          } while (usedT[tile.text] && tries < 30);
          usedT[tile.text] = 1;
          orders.push({ cargo: tile, ti: ti, promptKey: 'p.' + topic, params: { a: tile.a, b: tile.b, n: v }, rule: R(isAdd ? 'sum' : 'diff', v, isAdd ? 'sum' : 'diff') });
        });
        break;
      }
      case 'oddeven': {
        var par = rng.chance(0.5) ? ['odd', 'even'] : ['even', 'odd'];
        signs = par.map(tileP);
        var firstP = avoid === 'odd' ? 'even' : avoid === 'even' ? 'odd' : rng.pick(['odd', 'even']), wantP = [firstP, firstP === 'odd' ? 'even' : 'odd'];
        var usedN = [];
        for (i = 0; i < d; i++) {
          var pp = wantP[i], ns = range(ODDEVEN[0], ODDEVEN[1]).filter(function (x) { return parityOf(x) === pp && usedN.indexOf(x) < 0; }), nv = rng.pick(ns);
          usedN.push(nv);
          orders.push({ cargo: cookies(nv), ti: par.indexOf(pp), count: nv, promptKey: 'p.oddeven', params: { n: nv, parity: pp }, rule: R('parity', pp, 'parity') });
        }
        break;
      }
      default: throw new Error('BD.Content: unknown topic ' + topic);
    }
    return { signs: signs, colors: cols, orders: orders };
  }
  /** { letter: [{kind 'treat'|'animal', value}] } for 'initial' in this language (null initials left out). */
  function initialGroups(lang, src) {
    var g = {};
    INITIAL_TREATS.forEach(function (o) { var L = initialOf({ kind: 'treat', obj: o }, lang, src); if (L) (g[L] = g[L] || []).push({ kind: 'treat', value: o }); });
    INITIAL_ANIMALS.forEach(function (a) { var L = initialOf({ kind: 'animal', animal: a }, lang, src); if (L) (g[L] = g[L] || []).push({ kind: 'animal', value: a }); });
    return g;
  }

  function buildRound(topic, age, lang, rng, ri, level, short, src, prev, maxN) {
    var nd = sizeFor(topic, age, ri, level, short, maxN);
    var set = buildSet(topic, age, lang, rng, ri, nd, src, prev);
    // the houses in a random order (the map places them by index); ids follow the order
    var perm = rng.shuffle(range(0, nd.n - 1)), houses = [], where = [];
    for (var i = 0; i < nd.n; i++) {
      var si = perm[i];
      where[si] = i;
      houses.push({ id: 'h' + i, i: i, sign: clone(set.signs[si]), color: set.colors ? set.colors[si] : null });
    }
    var orders = set.orders.map(function (o) {
      var q = { cargo: clone(o.cargo), target: 'h' + where[o.ti], promptKey: o.promptKey, params: o.params, rule: o.rule };
      if (o.count !== undefined) q.count = o.count;
      if (o.home !== undefined) q.home = o.home;
      return q;
    });
    var r = { topic: topic, age: age, lang: lang, roundIndex: ri, level: level, short: !!short, surprise: null, nameSrc: src,
      houses: houses, orders: orders, n: nd.n, d: nd.d, maxN: maxN || 4, map: { seed: 0, forks: nd.forks },
      promptKey: orders[0].promptKey, params: orders[0].params, rule: orders[0].rule };
    r.key = roundKey(r);
    return r;
  }

  /** makeRound(topic, o) → round. usedKeys: never the same round twice in a chapter; prevRule: the first ask differs from the
   *  previous round's last ask. */
  function makeRound(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new BD.RNG(1), ri = o.roundIndex || 0;
    var level = o.level === undefined || o.level === null ? 1 : o.level | 0;
    if (ALL_TOPICS.indexOf(topic) < 0) throw new Error('BD.Content: unknown topic ' + topic);
    var used = (o.usedKeys || []).slice();
    var src = BD.I18N && typeof BD.I18N.name === 'function' ? 'i18n' : 'table';
    if (topic === 'initial' && src === 'i18n') {   // the i18n names must give usable groups, else the table
      var gg = initialGroups(lang, src), P0 = letterPool(lang, 'letters');
      if (Object.keys(gg).filter(function (q) { return P0.indexOf(q) >= 0; }).length < 5) src = 'table';
    }
    var r = null, err = null;
    for (var attempt = 0; attempt < 150; attempt++) {
      try {
        r = buildRound(topic, age, lang, rng, ri, level, !!o.short, src, o.prevRule || null, o.maxN || 4);
        err = validate(r);
        if (!err && attempt < 120 && used.indexOf(r.key) >= 0) err = 'the same round as an earlier one';
        if (!err && attempt < 100 && sameRule(r, o.prevRule)) err = 'the same ask as the previous round';
      } catch (e) { r = null; err = e.message; }
      if (!err) break;
    }
    if (err) throw new Error('BD.Content: invalid round (' + topic + ', age ' + age + ', round ' + ri + '): ' + err);
    r.surprise = ri === 0 ? null : (o.surprise || null);
    r.map.seed = (rng.next() * 4294967296) >>> 0;
    r.seed = r.map.seed;
    return r;
  }
  function sameRule(r, prev) {
    if (!prev) return false;
    return String(prev.value) === String(r.orders[0].rule.value) && prev.kind === r.orders[0].rule.kind;
  }

  // ---------------- self-check (independent of the generator's bookkeeping) ----------------
  function thingOk(t) {
    if (!t || BD.THING_KINDS.indexOf(t.kind) < 0) return 'thing kind ' + (t && t.kind);
    if (!t.nameKind || t.nameValue === undefined || t.nameValue === null) return 'thing name';
    switch (t.kind) {
      case 'treat': if (BD.TREATS.indexOf(t.obj) < 0 || !BD.PALETTE[t.color]) return 'treat'; break;
      case 'blob': if (!BD.PALETTE[t.color]) return 'blob'; break;
      case 'shape': if (BD.SHAPES.indexOf(t.shape) < 0 || !BD.PALETTE[t.color]) return 'shape'; break;
      case 'dots': case 'cookies': if (!(t.n >= 1 && t.n <= 12 && t.n === Math.floor(t.n))) return t.kind + ' n ' + t.n; break;
      case 'animal': if (!BD.ANIMALS[t.animal] || t.home !== BD.ANIMALS[t.animal]) return 'animal'; break;
      case 'home': if (BD.HOMES.indexOf(t.home) < 0) return 'home'; break;
      case 'tile': if (!t.text || String(t.text).length > 5) return 'tile text'; break;
    }
    if (t.big !== undefined && typeof t.big !== 'boolean') return 'big';
    return null;
  }
  /** null when the round follows every rule (DESIGN §5.1 / §3), else the reason. */
  function validate(r) {
    if (!r || !r.houses || !r.orders) return 'no houses / orders';
    var age = r.age, ri = r.roundIndex, nd = sizeFor(r.topic, age, ri, r.level, r.short, r.maxN), i, j, e;
    if (r.houses.length !== nd.n || r.n !== nd.n) return 'houses ' + r.houses.length + ' (want ' + nd.n + ')';
    if (r.orders.length !== nd.d || r.d !== nd.d) return 'orders ' + r.orders.length + ' (want ' + nd.d + ')';
    if (!r.map || r.map.forks !== nd.forks) return 'forks';
    var ids = {}, signs = [];
    for (i = 0; i < r.houses.length; i++) {
      var h = r.houses[i];
      if (h.id !== 'h' + i || h.i !== i || ids[h.id]) return 'house id ' + h.id;
      ids[h.id] = 1;
      if ((e = thingOk(h.sign))) return 'sign: ' + e;
      signs.push(h.sign);
    }
    var keys = signs.map(thingKey);
    if (uniq(keys).length !== keys.length) return 'two houses alike';
    var targets = [], cargos = [];
    for (j = 0; j < r.orders.length; j++) {
      var o = r.orders[j];
      if ((e = thingOk(o.cargo))) return 'cargo: ' + e;
      if (!o.promptKey || !o.params || !o.rule) return 'order prompt';
      if (!ids[o.target]) return 'order target ' + o.target;
      var hit = r.houses.filter(function (q) { return matches(r, o.cargo, q.sign); });
      if (hit.length !== 1) return 'order ' + j + ' matches ' + hit.length + ' houses';
      if (hit[0].id !== o.target) return 'order ' + j + ' matches ' + hit[0].id + ' not ' + o.target;
      if (targets.indexOf(o.target) >= 0) return 'two orders to one house';
      targets.push(o.target); cargos.push(o.cargo);
    }
    if (r.promptKey !== r.orders[0].promptKey || r.params !== r.orders[0].params) return 'round prompt';
    var all = signs.concat(cargos);
    var cs = uniq(all.filter(function (t) { return t.color; }).map(function (t) { return t.color; }));
    if (age < COLOR_SAFE_BELOW && (clash(cs, CLASH) || cs.indexOf('pink') >= 0)) return 'colour clash ' + cs.join('+');
    function kinds(list, k) { return list.every(function (t) { return t.kind === k; }); }
    switch (r.topic) {
      case 'colors': {
        if (!kinds(signs, 'blob') || !kinds(cargos, 'treat')) return 'colors kinds';
        if (r.houses.some(function (h) { return h.color !== h.sign.color; })) return 'colors: the house colour = its sign';
        if (r.orders.some(function (o) { return o.promptKey !== 'p.colors' || o.params.color !== o.cargo.color || o.params.treat !== o.cargo.obj; })) return 'colors prompt';
        if (ri === 0 && cargos.some(function (t) { return t.obj !== 'cupcake'; })) return 'colors warm-up: a cupcake';
        if (ri > 0 && age >= 4 && uniq(cargos.map(function (t) { return t.obj; })).length !== cargos.length) return 'colors: a different treat per order';
        break;
      }
      case 'shapes': {
        if (!kinds(signs, 'shape') || !kinds(cargos, 'shape')) return 'shapes kinds';
        var shs = signs.map(function (t) { return t.shape; });
        if (anySimilar(shs)) return 'confusable shapes ' + shs.join('+');
        if (all.some(function (t) { return shapesFor(age).indexOf(t.shape) < 0; })) return 'shape at age ' + age;
        if (age < 5) { if (cs.length !== 1 || r.orders.some(function (o) { return o.promptKey !== 'p.shapes'; })) return 'shapes: one colour'; }
        else {
          var sc = signs.map(function (t) { return t.color; });
          if (uniq(sc).length !== sc.length) return 'shapes5: one colour per house';
          if (cargos.some(function (t) { return sc.indexOf(t.color) >= 0; })) return 'shapes5: the cargo colour is on a house';
          if (r.orders.some(function (o) { return o.promptKey !== 'p.shapes5'; })) return 'shapes5 prompt';
        }
        break;
      }
      case 'size': {
        var a0 = all[0];
        if (!all.every(function (t) { return t.kind === 'treat' && t.obj === a0.obj && t.color === a0.color && typeof t.big === 'boolean'; })) return 'size: one treat';
        if (signs[0].big === signs[1].big) return 'size: a big and a small house';
        break;
      }
      case 'count': {
        if (!kinds(signs, 'dots') || !kinds(cargos, 'cookies')) return 'count kinds';
        var CR = COUNT_RANGE[age];
        if (all.some(function (t) { return t.n < CR[0] || t.n > CR[1]; })) return 'count range';
        if (signs.some(function (t) { return !t.numeral; })) return 'count: numerals on the signs';
        if (ri === 0) { var sn = signs.map(function (t) { return t.n; }).sort(function (a, b) { return a - b; }); for (i = 1; i < sn.length; i++) if (sn[i] - sn[i - 1] < 2) return 'count warm-up: neighbours'; }
        if (r.orders.some(function (o) { return o.count !== o.cargo.n || o.params.n !== o.cargo.n; })) return 'count prompt';
        break;
      }
      case 'animals': {
        if (!kinds(cargos, 'animal')) return 'animals cargo';
        if (age <= 3 || ri === 0) {
          if (!kinds(signs, 'animal') || r.orders.some(function (o) { return o.promptKey !== 'p.animal'; })) return 'p.animal';
          if (all.some(function (t) { return t.home !== 'farm'; })) return 'p.animal: farm animals';
        } else {
          if (!kinds(signs, 'home') || r.orders.some(function (o) { return o.promptKey !== 'p.home' || o.params.home !== BD.ANIMALS[o.cargo.animal]; })) return 'p.home';
          if (uniq(cargos.map(function (t) { return t.animal; })).length !== cargos.length) return 'home: different animals';
        }
        break;
      }
      case 'letters': case 'lower': {
        if (!kinds(all, 'tile')) return r.topic + ' kinds';
        var pool = letterPool(r.lang, r.topic), lt = signs.map(function (t) { return t.text; });
        if (all.some(function (t) { return t.text.length !== 1 || pool.indexOf(t.text.toUpperCase()) < 0; })) return 'letter pool';
        if (r.topic === 'letters' && all.some(function (t) { return t.text !== t.text.toUpperCase(); })) return 'letters: capitals';
        if (r.topic === 'lower' && (signs.some(function (t) { return t.text !== t.text.toLowerCase(); }) || cargos.some(function (t) { return t.text !== t.text.toUpperCase(); }))) return 'lower: small signs, capital cargo';
        for (i = 0; i < lt.length; i++) for (j = i + 1; j < lt.length; j++) if (lookalike(lt[i], lt[j])) return 'lookalike letters ' + lt[i] + lt[j];
        break;
      }
      case 'initial': {
        if (!kinds(signs, 'tile') || !cargos.every(function (t) { return t.kind === 'animal' || t.kind === 'treat'; })) return 'initial kinds';
        var P0 = letterPool(r.lang, 'letters'), il = signs.map(function (t) { return t.text; });
        if (il.some(function (x) { return P0.indexOf(x) < 0; })) return 'initial letter pool';
        for (i = 0; i < il.length; i++) for (j = i + 1; j < il.length; j++) if (lookalike(il[i], il[j])) return 'lookalike letters ' + il[i] + il[j];
        for (i = 0; i < cargos.length; i++) { var Li = initialOf(cargos[i], r.lang, r.nameSrc); if (!Li || Li !== cargos[i].letter) return 'initial of ' + (cargos[i].obj || cargos[i].animal); }
        if (cargos.some(function (t) { return (t.kind === 'treat' && INITIAL_TREATS.indexOf(t.obj) < 0) || (t.kind === 'animal' && INITIAL_ANIMALS.indexOf(t.animal) < 0); })) return 'initial things';
        break;
      }
      case 'add': case 'sub': {
        var op = r.topic === 'add' ? '+' : MINUS;
        if (!kinds(all, 'tile')) return r.topic + ' kinds';
        for (i = 0; i < cargos.length; i++) {
          var p = parseOp(cargos[i].text);
          if (!p || p.op !== op || p.a !== cargos[i].a || p.b !== cargos[i].b || p.b < 1 || p.a < 1) return 'tile ' + cargos[i].text;
          if (r.topic === 'add' && p.a + p.b > (ADD_RANGE[age] || ADD_RANGE[6])[1]) return 'sum range';
          if (r.topic === 'sub' && (p.a > SUB_TOP || p.a - p.b < 0)) return 'difference range';
        }
        if (signs.some(function (t) { return !/^\d+$/.test(t.text) || +t.text !== t.n; })) return r.topic + ' signs';
        break;
      }
      case 'oddeven': {
        if (!kinds(signs, 'tile') || !kinds(cargos, 'cookies')) return 'oddeven kinds';
        if (uniq(signs.map(function (t) { return t.parity; })).length !== 2) return 'oddeven: odd + even';
        if (cargos.some(function (t) { return t.n < ODDEVEN[0] || t.n > ODDEVEN[1]; })) return 'oddeven range';
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
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new BD.RNG(1);
    var show = null, params = {}, ch, a, nC = age <= 3 ? 2 : 3, pk = 'talk.' + topic;
    switch (topic) {
      case 'colors': {
        var cs = safeColors(rng, age, nC);
        a = rng.pick(cs); params = { color: a }; show = treat(rng.pick(BD.TREATS), a);
        ch = choicesFrom(rng, a, cs, nC, function (c) { return { kind: 'color', color: c }; }); break;
      }
      case 'shapes': {
        var col = rng.pick(colorPool(age)), shp = shapesFor(age); a = rng.pick(shp); params = { shape: a };
        var others = rng.shuffle(shp.filter(function (s) { return s !== a && !similarShapes(a, s); })), sel = [];
        others.forEach(function (s) { if (sel.length < nC - 1 && sel.every(function (q) { return !similarShapes(q, s); })) sel.push(s); });
        ch = choicesFrom(rng, a, sel, nC, function (s) { return shape(s, col); }); break;
      }
      case 'size': {
        var ob = rng.pick(BD.TREATS), cz = rng.pick(colorPool(age)); a = rng.pick(['big', 'small']); params = { size: a };
        ch = choicesFrom(rng, a, ['big', 'small'], 2, function (s) { return treat(ob, cz, s === 'big'); }); break;
      }
      case 'animals': {
        if (age <= 3) {
          pk = 'talk.who'; a = rng.pick(FARM); params = { animal: a }; show = animal(a);
          ch = choicesFrom(rng, a, FARM, nC, function (x) { return animal(x); });
        } else {
          var w = rng.pick(WILD.filter(function (q) { return q !== 'fishbowl'; })); a = BD.ANIMALS[w]; params = { animal: w }; show = animal(w);
          var hs = BD.HOMES.filter(function (h) { return h !== a && h !== 'farm'; }), pickH = ['farm'].concat(rng.shuffle(hs)).slice(0, nC - 1);
          ch = choicesFrom(rng, a, pickH, nC, function (h) { return { kind: 'home', home: h }; });
        }
        break;
      }
      case 'count': {
        var hi = { 3: 4, 4: 5, 5: 8, 6: 10, 7: 10 }[age]; a = rng.int(age <= 4 ? 1 : 2, hi); params = { n: a }; show = cookies(a);
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
        var src = BD.I18N && typeof BD.I18N.name === 'function' ? 'i18n' : 'table', g = initialGroups(lang, src), cand = [], LP = letterPool(lang, 'letters');
        Object.keys(g).forEach(function (L) { if (LP.indexOf(L) >= 0) g[L].forEach(function (q) { cand.push({ L: L, q: q }); }); });
        if (!cand.length) { g = initialGroups(lang, 'table'); Object.keys(g).forEach(function (L) { if (LP.indexOf(L) >= 0) g[L].forEach(function (q) { cand.push({ L: L, q: q }); }); }); }
        var pc = rng.pick(cand); a = pc.L;
        show = pc.q.kind === 'animal' ? animal(pc.q.value) : treat(pc.q.value, rng.pick(COLORS5)); show.letter = a;
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
      default: throw new Error('BD.Content: unknown topic ' + topic);
    }
    return { topic: topic, promptKey: pk, params: params, show: show, choices: ch.choices, answer: ch.answer, answerId: ch.answer };
  }

  /** 4 chapter topics for a session. Without rng or `last`: BD.AGE_TOPICS (the first session). With both: chapter 1 rotates between
   *  the pool's two easiest topics; chapters 2–4 = 3 of the others (preferring topics left out of `last`), in difficulty order. */
  function topicsFor(age, rng, last) {
    age = ageOf(age);
    last = Array.isArray(last) ? last : [];
    if (!rng || !last.length) return BD.AGE_TOPICS[age].slice();
    var pool = BD.AGE_POOLS[age].slice(), ord = function (a, b) { return pool.indexOf(a) - pool.indexOf(b); };
    var first = last[0] === pool[0] ? pool[1] : pool[0];
    var rest = pool.filter(function (t) { return t !== first; });
    var fresh = rng.shuffle(rest.filter(function (t) { return last.indexOf(t) < 0; }));
    var old = rng.shuffle(rest.filter(function (t) { return last.indexOf(t) >= 0; }));
    return [first].concat(fresh.concat(old).slice(0, 3).sort(ord));
  }

  BD.Content = {
    makeRound: makeRound, makeTalk: makeTalk, validate: validate, topicsFor: topicsFor, matches: matches, sizeFor: sizeFor,
    tableND: tableND, ageOf: ageOf, langOf: langOf, clash: clash, pairsFor: pairsFor, colorPool: colorPool,
    shapesFor: shapesFor, similarShapes: similarShapes, lookalike: lookalike, letterPool: letterPool, parityOf: parityOf,
    initialOf: initialOf, initialOfName: initialOfName, thingName: thingName, baseLetter: baseLetter, initialGroups: initialGroups,
    thingKey: thingKey, roundKey: roundKey, parseOp: parseOp, sameRule: sameRule, homeAnimals: homeAnimals,
    TOPICS: ALL_TOPICS, COLORS: COLORS, COLORS5: COLORS5, SHAPES3: SHAPES3, SHAPES4: SHAPES4, SIMILAR_SHAPES: SIMILAR_SHAPES, LOOKALIKE: LOOKALIKE,
    SMALL_PAIRS: SMALL_PAIRS, LETTER_POOL: LETTER_POOL, CLASH: CLASH, COLOR_SAFE_BELOW: COLOR_SAFE_BELOW, COUNT_RANGE: COUNT_RANGE,
    ADD_RANGE: ADD_RANGE, SUB_TOP: SUB_TOP, ODDEVEN: ODDEVEN, MINUS: MINUS, FARM: FARM, WILD: WILD,
    INITIAL_TREATS: INITIAL_TREATS, INITIAL_ANIMALS: INITIAL_ANIMALS
  };
})(window.BD = window.BD || {});
