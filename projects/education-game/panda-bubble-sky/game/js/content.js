/* Bao's Bubble Sky — PB.PALETTE, PB.COLORS, PB.SHAPES, PB.TOYS, PB.ANIMALS, PB.HOMES, PB.AGE_TOPICS, PB.AGE_POOLS,
 * PB.Content (pure + deterministic bubble-round generator with a self-check; DESIGN §5.1)
 *
 *   PB.Content.makeRound(topic, { age, lang, rng, roundIndex, level, surprise, short?, usedKeys?, prevRule? })
 *       → round (validated with validate(); retries; throws if impossible)
 *   PB.Content.makeTalk(topic, { age, lang, rng })  → talk
 *   PB.Content.validate(round)  → null | 'reason'
 *   PB.Content.topicsFor(age, rng?, lastTopics?)  → the 4 chapter topics (easiest first)
 *   PB.Content.ruleHolds(rule, thing, round?)  → does this thing share the rule
 *   PB.Content.sizeFor(topic, age, roundIndex, level, short)  → { n, k, mode } (count rounds: n / k of the mode's table)
 *
 * round = { topic, age, lang, roundIndex, level, short, surprise: null|'bird'|'kite'|'snow', mode: 'match'|'countPop'|'countSel',
 *   bubbles: [ { id 'b0'…, i (blow order = array index), thing, target: bool } ], k (bubbles to pop), n,
 *   promptKey, params, rule: { kind, value, nameKind }, key, seed, nameSrc }
 *   mode 'countSel' is a match round (one target) whose things are stars; DESIGN names both count modes `countPop` / countSel.
 * thing = { kind 'toy'|'shape'|'stars'|'tile'|'animal', color?, obj? (toy), shape?, n?, animal?, home?, text?, big?, letter?, a?, b?,
 *           op?, nameKind, nameValue }   — nameKind / nameValue name the thing the way THIS round's question is about:
 *   colors → 'color'/'red' · shapes → 'shape'/'star' · size → 'size'/'big'|'small' · count → 'number'/3 · animals p.animal →
 *   'animal'/'cow' · animals p.home → 'home'/'farm'|'sea'… · letters / lower → 'letter'/'B' (the CAPITAL) · initial → 'letter'/'B'
 *   (thing.letter = its initial) · add → 'sum'/5 · sub → 'diff'/3 · oddeven → 'parity'/'even'
 * rule kinds: color · shape · size · n (stars on the thing) · pop (countPop: any bubble) · animal · home · letter · initial · sum ·
 *   diff · parity (rule.nameKind = the i18n name kind)
 * Prompt keys / params: p.colors {color, k} · p.shapes {shape, k} · p.shapes5 {shape, k} · p.size {big, k} · p.countPop {n} ·
 *   p.countSel {n} · p.animal {animal, k} · p.home {home, k} · p.letters {letter, k} · p.lower {letter, k} · p.initial {letter, k} ·
 *   p.add {n, k} · p.sub {n, k} · p.oddeven {parity, k}
 * talk = { topic, promptKey, params, show: thing | null, choices: [{ id, thing, value }], answer (choice id), answerId }
 *   promptKeys: talk.colors {color} · talk.shapes {shape} · talk.size {size} · talk.count {n} · talk.animals {animal} (where does
 *   it live; choices home badges) · talk.who {animal} (age 3: "Who is this?") · talk.letters {letter} · talk.lower {letter, small} ·
 *   talk.initial {letter, nameKind, nameValue} · talk.add {a, b} · talk.sub {a, b} · talk.oddeven {parity}
 *   choice things: any bubble thing, or { kind:'color', color } · { kind:'number', n } · { kind:'home', home } · { kind:'size', big }
 */
(function (PB) {
  'use strict';

  // DESIGN §3 answer palette (exact hex)
  PB.PALETTE = {
    red:    { base: '#E84A4A', dark: '#A8282E', light: '#F7A0A0' },
    blue:   { base: '#3C8DE8', dark: '#1F5BA8', light: '#A6CCF5' },
    yellow: { base: '#FFD23F', dark: '#C99A12', light: '#FFEB9C' },
    green:  { base: '#4CC26B', dark: '#2A8343', light: '#A8E6B8' },
    orange: { base: '#FF9A2E', dark: '#C4650C', light: '#FFCB8E' },
    purple: { base: '#8E44AD', dark: '#6840A8', light: '#D2BDF3' },
    pink:   { base: '#FF8FC0', dark: '#C9558A', light: '#FFCCE2' }      // an answer colour from age 5
  };
  for (var pk in PB.PALETTE) PB.PALETTE[pk].fill = PB.PALETTE[pk].base;
  PB.STAR_COLOR = { base: '#FFC23A', dark: '#C98A12' };
  PB.RAINBOW = ['#F6A6A6', '#F8C49A', '#F7E19A', '#B9E3A8', '#A9D2F2', '#B9B2EE', '#E2B6E8'];
  PB.COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  var COLORS = PB.COLORS.slice(0, 6), COLORS5 = PB.COLORS.slice();
  PB.SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'oval', 'rect', 'diamond'];
  PB.TOYS = ['ball', 'duck', 'umbrella', 'kite', 'car'];
  PB.ANIMALS = { cow: 'farm', pig: 'farm', sheep: 'farm', duck: 'farm', hen: 'farm', horse: 'farm', goat: 'farm',
    crab: 'sea', fishbowl: 'sea', penguin: 'ice', lion: 'savanna', monkey: 'jungle' };
  PB.HOMES = ['farm', 'sea', 'ice', 'savanna', 'jungle'];
  PB.THING_KINDS = ['toy', 'shape', 'stars', 'tile', 'animal'];
  var ANIMAL_LIST = Object.keys(PB.ANIMALS);
  var FARM = ANIMAL_LIST.filter(function (a) { return PB.ANIMALS[a] === 'farm'; });
  var WILD = ANIMAL_LIST.filter(function (a) { return PB.ANIMALS[a] !== 'farm'; });
  function homeAnimals(h) { return ANIMAL_LIST.filter(function (a) { return PB.ANIMALS[a] === h; }); }

  PB.AGE_TOPICS = {
    3: ['colors', 'shapes', 'size', 'animals'],
    4: ['colors', 'shapes', 'count', 'animals'],
    5: ['shapes', 'count', 'letters', 'animals'],
    6: ['lower', 'initial', 'add', 'count'],
    7: ['initial', 'add', 'sub', 'oddeven']
  };
  /* Every age has a POOL of 5 topics in difficulty order; a session plays 4 of them (rotating between sessions, as the parade). */
  PB.AGE_POOLS = {
    3: ['colors', 'shapes', 'size', 'animals', 'count'],
    4: ['colors', 'size', 'shapes', 'count', 'animals'],
    5: ['colors', 'shapes', 'count', 'letters', 'animals'],
    6: ['letters', 'lower', 'initial', 'add', 'count'],
    7: ['count', 'initial', 'add', 'sub', 'oddeven']
  };
  var ALL_TOPICS = ['colors', 'shapes', 'size', 'animals', 'count', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];

  // ---- tables (DESIGN §5.1)
  var MAX_BUBBLES = 9, MIN_BUBBLES = 3;
  var SHAPES3 = ['circle', 'square', 'triangle', 'star', 'heart'];   // age 3
  var SHAPES4 = SHAPES3.concat(['rect']);                             // age 4 (oval + diamond are hard words: from age 5)
  var SIMILAR_SHAPES = [['square', 'rect'], ['circle', 'oval'], ['square', 'diamond'], ['heart', 'circle']];
  var LETTER_POOL = { en: 'ABCDEFGHIKLMNOPRSTUW', vi: 'ABCDEGHIKLMNOPSTUVXY' };
  var LOOKALIKE = ['EF', 'OQCG', 'MNW', 'PRB', 'ILT', 'UV'];          // capitals that never meet in one round
  var LOWER_SKIP = 'IL';                                              // capital I and small l look alike
  var SMALL_PAIRS = ['bdpq', 'nu', 'mw', 'co'];                       // small letters that never meet in one round
  var OTHER_VALUES = { 3: 1, 4: 2, 5: 3, 6: 3, 7: 3 };                // distinct non-target values per round
  var SEL_RANGE = { 3: 5, 4: 5, 5: 10, 6: 12, 7: 12 };                // countSel star counts 1..max
  var ADD_RANGE = { 6: [5, 10], 7: [6, 20] }, SUB_RANGE = [1, 6], SUB_TOP = 10, ODDEVEN_MAX = 20;
  var MINUS = '−';
  var VI_DIGRAPHS = ['ngh', 'ng', 'nh', 'ch', 'gh', 'kh', 'ph', 'th', 'tr', 'gi', 'qu'];
  var VI_ALPHABET = ['A', 'Ă', 'Â', 'B', 'C', 'D', 'Đ', 'E', 'Ê', 'G', 'H', 'I', 'K', 'L', 'M', 'N', 'O', 'Ô', 'Ơ', 'P', 'Q', 'R', 'S', 'T', 'U', 'Ư', 'V', 'X', 'Y'];
  /* Fallback names (DESIGN §6) when PB.I18N.name is not loaded / does not know a thing (headless tests). */
  PB.THING_NAMES = {
    en: { ball: 'ball', duck: 'rubber duck', umbrella: 'umbrella', kite: 'kite', car: 'toy car',
      cow: 'cow', pig: 'pig', sheep: 'sheep', duckA: 'duck', hen: 'hen', horse: 'horse', goat: 'goat', crab: 'crab', fishbowl: 'goldfish',
      penguin: 'penguin', lion: 'lion', monkey: 'monkey' },
    vi: { ball: 'quả bóng', duck: 'con vịt cao su', umbrella: 'cái ô', kite: 'con diều', car: 'xe ô tô đồ chơi',
      cow: 'con bò', pig: 'con heo', sheep: 'con cừu', duckA: 'con vịt', hen: 'con gà mái', horse: 'con ngựa', goat: 'con dê', crab: 'con cua',
      fishbowl: 'bể cá vàng', penguin: 'chim cánh cụt', lion: 'sư tử', monkey: 'con khỉ' }
  };
  /* Things used by the 'initial' topic: the picture must say the word. The rubber duck (EN "rubber duck" vs a duck picture), the toy
   * car ("toy car") and the goldfish bowl are left out. */
  var INITIAL_TOYS = ['ball', 'umbrella', 'kite'];
  var INITIAL_ANIMALS = ANIMAL_LIST.filter(function (a) { return a !== 'fishbowl'; });
  var CLASSIFIERS = { en: ['the', 'a', 'an'], vi: ['con', 'cái', 'quả', 'chiếc'] };

  function langOf(l) { return l === 'vi' ? 'vi' : 'en'; }
  function ageOf(a) { a = Math.round(+a || 4); return a < 3 ? 3 : a > 7 ? 7 : a; }
  function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }
  function parityOf(n) { return n % 2 ? 'odd' : 'even'; }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }

  // ---------------- names → initials ('initial' topic) ----------------
  /** The name of a toy / animal: PB.I18N.name(lang, kind, value) when loaded and it knows the thing (src 'i18n'), else
   *  PB.THING_NAMES (src 'table'). Defensive: any throw / placeholder / untranslated id falls back to the table. */
  function thingName(kind, value, lang, src) {
    lang = langOf(lang);
    var tableKey = kind === 'animal' && value === 'duck' ? 'duckA' : value;
    if (src !== 'table' && PB.I18N && typeof PB.I18N.name === 'function') {
      var kinds = kind === 'toy' ? ['toy', 'obj'] : [kind];
      for (var i = 0; i < kinds.length; i++) {
        try {
          var s = PB.I18N.name(lang, kinds[i], value);
          if (typeof s === 'string' && s.trim() && s.indexOf('{') < 0 && s !== String(value) + '?' && (lang === 'en' || s !== String(value))) return s;
        } catch (e) { /* fall back */ }
      }
    }
    return PB.THING_NAMES[lang][tableKey] || null;
  }
  function stripMarks(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC'); }
  /** The initial letter of a name (classifier / article dropped; VI tone marks dropped, Ă Â Ê Ô Ơ Ư Đ kept; VI words that start with
   *  a digraph (ch, ng, kh …) give null: they are never used in an 'initial' round). */
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
    var d = c.normalize('NFD').replace(/[̣̀́̃̉]/g, '').normalize('NFC').toUpperCase();
    if (lang === 'en') return /^[A-Z]$/.test(d) ? d : null;
    return VI_ALPHABET.indexOf(d) >= 0 ? d : null;
  }
  /** The bare base letter (every diacritic dropped: Ô → O, Đ → D) — a distractor's base letter never equals the asked letter. */
  function baseLetter(L) { return L ? (L === 'Đ' ? 'D' : stripMarks(L)) : null; }
  function initialOf(thing, lang, src) {
    if (!thing) return null;
    var kind = thing.kind === 'animal' ? 'animal' : thing.kind === 'toy' ? 'toy' : null;
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
  function shapesFor(age) { return age <= 3 ? SHAPES3.slice() : age === 4 ? SHAPES4.slice() : PB.SHAPES.slice(); }
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
  function toy(o, c) { return { kind: 'toy', obj: o, color: c, nameKind: 'color', nameValue: c }; }
  function shape(s, c) { return { kind: 'shape', shape: s, color: c, nameKind: 'shape', nameValue: s }; }
  function stars(n) { return { kind: 'stars', n: n, nameKind: 'number', nameValue: n }; }
  function animal(a) { return { kind: 'animal', animal: a, home: PB.ANIMALS[a], nameKind: 'animal', nameValue: a }; }
  function tileL(c) { return { kind: 'tile', text: String(c), nameKind: 'letter', nameValue: String(c).toUpperCase() }; }
  function tileN(n) { return { kind: 'tile', text: String(n), n: n, nameKind: 'parity', nameValue: parityOf(n) }; }
  function tileAdd(a, b) { return { kind: 'tile', text: a + '+' + b, a: a, b: b, op: '+', n: a + b, nameKind: 'sum', nameValue: a + b }; }
  function tileSub(a, b) { return { kind: 'tile', text: a + MINUS + b, a: a, b: b, op: MINUS, n: a - b, nameKind: 'diff', nameValue: a - b }; }
  function sized(t, big) { t.big = !!big; t.nameKind = 'size'; t.nameValue = big ? 'big' : 'small'; return t; }
  function thingKey(t) {
    return [t.kind, t.obj || '', t.color || '', t.shape || '', t.n === undefined ? '' : t.n, t.animal || '', t.text || '', t.big === false ? 's' : ''].join(':');
  }
  function roundKey(r) {
    var tg = [], rest = [];
    r.bubbles.forEach(function (b) { (b.target ? tg : rest).push(thingKey(b.thing)); });
    return r.topic + '|' + r.mode + '|' + tg.sort().join(',') + '|' + rest.sort().join(',');
  }

  /** {n bubbles, k to pop, mode} (DESIGN §5.1). The first round of the session (chapter 0, round 0) is the warm-up (3, 1).
   *  count: rounds 0 / 2 countPop (k chosen by the generator: see countPopK), rounds 1 / 3 countSel (one target, 3 / 4 bubbles).
   *  lower: always both cases → k ≥ 2 (n ≥ k + 2). short rounds: (4, 1). */
  function tableNK(age, ri, level) {
    if (ri === 0 && level === 0) return [3, 1];
    var T = age <= 3 ? [[3, 1], [4, 1], [4, 2], [4, 2]]
      : age === 4 ? (level === 0 ? [[3, 1], [4, 1], [5, 2], [5, 2]] : [[3, 1], [5, 2], [5, 2], [6, 3]])
      : age === 5 ? [[4, 1], [5, 2], [6, 2], [6, 3]] : [[5, 1], [6, 2], [6, 2], [6, 3]];
    return T[Math.min(Math.max(0, ri | 0), 3)].slice();
  }
  function countMode(ri) { return ri % 2 === 0 ? 'countPop' : 'countSel'; }
  function sizeFor(topic, age, ri, level, short) {
    age = ageOf(age);
    var nk = short && ri > 0 ? [4, 1] : tableNK(age, ri, level), n = nk[0], k = nk[1];
    if (topic === 'count') {
      if (countMode(ri) === 'countSel') return { n: short ? 3 : (ri % 4 === 1 ? 3 : 4), k: 1, mode: 'countSel' };
      return { n: n, k: 0, mode: 'countPop' };   // k / n from countPopK
    }
    if (topic === 'lower') { k = Math.max(2, k); n = Math.max(n, k + 2); }
    return { n: n, k: k, mode: 'match' };
  }
  /** countPop: the asked number k and the bubble count n (> k). Age ≤ 4: round 0 → 2, round 2 → 3 | 4; age 5: round 0 → 3,
   *  round 2 → 4–6; age 6+: round 0 → 4, round 2 → 5–8 (n ≤ 9); short: k 3 (2 when the last ask was 3), n 4. */
  function countPopChoices(age, ri, short) {
    if (short && ri > 0) return [3, 2];
    if (age <= 4) return ri === 0 ? [2] : [3, 4];
    if (age === 5) return ri === 0 ? [3] : [4, 5, 6];
    return ri === 0 ? [4] : [5, 6, 7, 8];
  }
  function countPopN(age, ri, level, short, k) {
    if (short && ri > 0) return 4;
    return Math.min(MAX_BUBBLES, Math.max(tableNK(age, ri, level)[0], k + 1));
  }

  // ---------------- the rule ----------------
  function sizeOf(t) { return t.big === false ? 'small' : 'big'; }
  /** Does `thing` share the rule? (`r` gives lang / nameSrc for 'initial'.) */
  function ruleHolds(rule, t, r) {
    if (!rule || !t) return false;
    var v = rule.value;
    switch (rule.kind) {
      case 'color': return t.color === v;
      case 'shape': return t.kind === 'shape' && t.shape === v;
      case 'size': return sizeOf(t) === v;
      case 'n': return t.kind === 'stars' && t.n === v;
      case 'pop': return true;
      case 'animal': return t.kind === 'animal' && t.animal === v;
      case 'home': return t.kind === 'animal' && PB.ANIMALS[t.animal] === v;
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
  /** The "value" a non-target bubble has for this rule (distinct-values count, DESIGN §5.1). */
  function valueOf(rule, t, r) {
    switch (rule.kind) {
      case 'color': return t.color;
      case 'shape': return t.shape;
      case 'size': return sizeOf(t);
      case 'n': return t.n;
      case 'animal': return t.animal;
      case 'home': return t.home;
      case 'letter': return String(t.text).toUpperCase();
      case 'initial': return baseLetter(initialOf(t, r.lang, r.nameSrc));
      case 'sum': case 'diff': return t.n;
      case 'parity': return t.n;
    }
    return null;
  }

  /* ---------------- sets
   * buildSet → { rule, promptKey, params, targets: [thing] (k), others: [thing] (n − k) }. `avoid(value)` = the asked value of the
   * last round (so the target value changes every round). m = how many distinct non-target values. */
  function pickFresh(rng, list, avoid) { var f = list.filter(function (x) { return String(x) !== String(avoid); }); return rng.pick(f.length ? f : list); }
  /** Fill `count` slots from `vals` (m distinct values; every value at least once), shuffled. */
  function spread(rng, vals, count) { var out = vals.slice(0, count); while (out.length < count) out.push(rng.pick(vals)); return rng.shuffle(out); }
  function buildSet(topic, age, lang, rng, ri, nk, src, prev) {
    var n = nk.n, k = nk.k, m = Math.min(OTHER_VALUES[age], n - k), tg = [], ot = [], rule, pk, pr, i, c, pool;
    var avoid = prev ? prev.value : null;
    switch (topic) {
      case 'colors': {
        pool = colorPool(age);
        c = pickFresh(rng, pool, avoid);
        // m other colours, no clash pair among all of them (below age 5)
        // (orange below age 5 has only blue / purple as safe partners and they clash together → one other colour)
        var oc = null;
        for (var mm = m; mm >= 1 && !oc; mm--) for (var tc = 0; tc < 60 && !oc; tc++) { var s = rng.sample(pool.filter(function (x) { return x !== c; }), mm); if (!clash(s.concat([c]), pairsFor(age))) oc = s; }
        if (!oc) throw new Error('no colour set');
        var same = ri === 0;   // the warm-up: all the same toy
        if (same) {
          var o = rng.pick(PB.TOYS);
          for (i = 0; i < k; i++) tg.push(toy(o, c));
          spread(rng, oc, n - k).forEach(function (x) { ot.push(toy(o, x)); });
        } else {
          // mixed toys; targets share the colour (different toys at age ≥ 4); the toy is never a cue: a distractor wears a
          // target's toy whenever there is one
          var tt = age >= 4 ? rng.sample(PB.TOYS, k) : spread(rng, [rng.pick(PB.TOYS)], k);
          tt.forEach(function (x) { tg.push(toy(x, c)); });
          var cols = spread(rng, oc, n - k);
          cols.forEach(function (x, j) { ot.push(toy(j === 0 ? rng.pick(tt) : rng.pick(PB.TOYS), x)); });
        }
        rule = R('color', c, 'color'); pk = 'p.colors'; pr = { color: c, k: k };
        break;
      }
      case 'shapes': {
        var shp = shapesFor(age), sh = pickFresh(rng, shp, avoid), os = null;
        for (var ts = 0; ts < 60 && !os; ts++) { var cand = rng.sample(shp.filter(function (x) { return x !== sh; }), m); if (!anySimilar(cand.concat([sh]))) os = cand; }
        if (!os) throw new Error('no shape set');
        var others = spread(rng, os, n - k);
        if (age < 5) {
          c = rng.pick(colorPool(age));
          for (i = 0; i < k; i++) tg.push(shape(sh, c));
          others.forEach(function (x) { ot.push(shape(x, c)); });
          pk = 'p.shapes';
        } else {   // shapes5: mixed colours, every bubble its own colour
          var cs = rng.sample(COLORS5, n);
          for (i = 0; i < k; i++) tg.push(shape(sh, cs[i]));
          others.forEach(function (x, j) { ot.push(shape(x, cs[k + j])); });
          pk = 'p.shapes5';
        }
        rule = R('shape', sh, 'shape'); pr = { shape: sh, k: k };
        break;
      }
      case 'size': {
        // the same toy in one colour; targets big, the others small — or the reverse; alternates every round
        var big = avoid === null || avoid === undefined ? rng.chance(0.5) : avoid !== 'big';
        var ob = rng.pick(PB.TOYS), col = rng.pick(colorPool(age));
        for (i = 0; i < k; i++) tg.push(sized(toy(ob, col), big));
        for (i = 0; i < n - k; i++) ot.push(sized(toy(ob, col), !big));
        rule = R('size', big ? 'big' : 'small', 'size'); pk = 'p.size'; pr = { big: big, k: k };
        break;
      }
      case 'count': {
        if (nk.mode === 'countPop') {
          var ch = countPopChoices(age, ri, nk.short), kk = pickFresh(rng, ch, avoid), nn = countPopN(age, ri, nk.level, nk.short, kk);
          var th = rng.chance(0.5) ? stars(1) : toy(rng.pick(PB.TOYS), rng.pick(colorPool(age)));
          for (i = 0; i < nn; i++) tg.push(JSON.parse(JSON.stringify(th)));
          rule = R('pop', kk, 'number'); pk = 'p.countPop'; pr = { n: kk };
          return { rule: rule, promptKey: pk, params: pr, targets: tg, others: [], k: kk, n: nn };
        }
        var hi = SEL_RANGE[age], a = null, ds = null;
        for (var t2 = 0; t2 < 200 && !ds; t2++) {
          a = rng.int(1, hi);
          if (String(a) === String(avoid) && t2 < 150) continue;
          var okD = range(1, hi).filter(function (x) { return countPairOk(a, x, age); });
          if (okD.length >= n - 1) ds = rng.sample(okD, n - 1);
        }
        if (!ds) throw new Error('no count set');
        tg.push(stars(a)); ds.forEach(function (x) { ot.push(stars(x)); });
        rule = R('n', a, 'number'); pk = 'p.countSel'; pr = { n: a };
        break;
      }
      case 'animals': {
        if (age <= 3 || ri === 0) {
          var x0 = pickFresh(rng, FARM, avoid), xs = rng.sample(FARM.filter(function (q) { return q !== x0; }), m);
          for (i = 0; i < k; i++) tg.push(animal(x0));
          spread(rng, xs, n - k).forEach(function (q) { ot.push(animal(q)); });
          rule = R('animal', x0, 'animal'); pk = 'p.animal'; pr = { animal: x0, k: k };
        } else {
          // the target home: farm (k ≤ 3), sea (k ≤ 2), ice / savanna / jungle (k 1); not the last round's home when possible
          var homes = PB.HOMES.filter(function (h) { return homeAnimals(h).length >= k && h !== avoid; });
          if (!homes.length) homes = ['farm'];
          // look ahead: a later k ≥ 3 round needs the farm, so the round before it is not the farm (farm → sea → farm)
          var kAt = function (j) { return j <= 3 && !nk.short ? tableNK(age, j, nk.level)[1] : 0; };
          var nonFarm = homes.filter(function (h) { return h !== 'farm'; });
          if (kAt(ri + 1) >= 3 && nonFarm.length) homes = nonFarm;
          else if (kAt(ri + 2) >= 3 && homes.indexOf('farm') >= 0 && k >= 2) homes = ['farm'];
          var hm = rng.pick(homes), ha = homeAnimals(hm);
          rng.sample(ha, k).forEach(function (q) { var t3 = animal(q); t3.nameKind = 'home'; t3.nameValue = hm; tg.push(t3); });
          var oh = rng.sample(PB.HOMES.filter(function (h) { return h !== hm; }), m);
          spread(rng, oh, n - k).forEach(function (h) { var t4 = animal(rng.pick(homeAnimals(h))); t4.nameKind = 'home'; t4.nameValue = h; ot.push(t4); });
          rule = R('home', hm, 'home'); pk = 'p.home'; pr = { home: hm, k: k };
        }
        break;
      }
      case 'letters': {
        pool = letterPool(lang, 'letters');
        var L0 = pickFresh(rng, pool, avoid), lo = pickLetters(rng, pool, L0, m);
        for (i = 0; i < k; i++) tg.push(tileL(L0));
        spread(rng, lo, n - k).forEach(function (x) { ot.push(tileL(x)); });
        rule = R('letter', L0, 'letter'); pk = 'p.letters'; pr = { letter: L0, k: k };
        break;
      }
      case 'lower': {
        pool = letterPool(lang, 'lower');
        var L1 = pickFresh(rng, pool, avoid), l2 = pickLetters(rng, pool, L1, m);
        var cases = [];
        for (i = 0; i < k; i++) cases.push(i % 2 === 0);
        rng.shuffle(cases);
        cases.forEach(function (up) { tg.push(tileL(up ? L1 : L1.toLowerCase())); });
        spread(rng, l2, n - k).forEach(function (x) { ot.push(tileL(rng.chance(0.5) ? x : x.toLowerCase())); });
        rule = R('letter', L1, 'letter'); pk = 'p.lower'; pr = { letter: L1, k: k };
        break;
      }
      case 'initial': {
        var g = initialGroups(lang, src), P0 = letterPool(lang, 'letters');
        var letters = Object.keys(g).filter(function (q) { return P0.indexOf(q) >= 0 && g[q].length >= Math.min(2, k); });
        if (!letters.length) throw new Error('no initial groups');
        var IL = pickFresh(rng, letters, avoid), grp = g[IL];
        var picks = rng.shuffle(grp.slice()).slice(0, k), used = {};
        while (picks.length < k) picks.push(rng.pick(grp));
        function mk(q, L) {
          var t5;
          if (q.kind === 'animal') t5 = animal(q.value);
          else { var cc = rng.shuffle(COLORS5.slice()).filter(function (x) { return !used[q.value + x]; })[0] || 'red'; used[q.value + cc] = 1; t5 = toy(q.value, cc); }
          t5.letter = L; t5.nameKind = 'letter'; t5.nameValue = L; return t5;
        }
        picks.forEach(function (q) { tg.push(mk(q, IL)); });
        var otherL = rng.shuffle(Object.keys(g).filter(function (q) { return baseLetter(q) !== IL; })).slice(0, m);
        spread(rng, otherL, n - k).forEach(function (q) { ot.push(mk(rng.pick(g[q]), q)); });
        rule = R('initial', IL, 'letter'); pk = 'p.initial'; pr = { letter: IL, k: k };
        break;
      }
      case 'add': {
        var rg = ADD_RANGE[age] || ADD_RANGE[6], hiA = ri === 0 ? Math.min(rg[1], age >= 7 ? 10 : 7) : rg[1];
        var sn = pickFresh(rng, range(rg[0], hiA), avoid);
        rng.sample(range(1, sn - 1), k).forEach(function (x) { tg.push(tileAdd(x, sn - x)); });
        var sums = rng.sample(range(Math.max(2, sn - 3), Math.min(rg[1], sn + 3)).filter(function (x) { return x !== sn; }), m);
        var usedT = {};
        spread(rng, sums, n - k).forEach(function (x) {
          var aa, tries = 0;
          do { aa = rng.int(1, x - 1); tries++; } while (usedT[aa + '+' + (x - aa)] && tries < 20);
          usedT[aa + '+' + (x - aa)] = 1; ot.push(tileAdd(aa, x - aa));
        });
        rule = R('sum', sn, 'sum'); pk = 'p.add'; pr = { n: sn, k: k };
        break;
      }
      case 'sub': {
        var dn = pickFresh(rng, range(SUB_RANGE[0], ri === 0 ? 4 : SUB_RANGE[1]), avoid);
        rng.sample(range(dn + 1, SUB_TOP), k).forEach(function (x) { tg.push(tileSub(x, x - dn)); });
        var diffs = rng.sample(range(Math.max(0, dn - 3), Math.min(SUB_TOP - 1, dn + 3)).filter(function (x) { return x !== dn; }), m);
        var usedS = {};
        spread(rng, diffs, n - k).forEach(function (x) {
          var top, tries = 0;
          do { top = rng.int(x + 1, SUB_TOP); tries++; } while (usedS[top + '-' + x] && tries < 20);
          usedS[top + '-' + x] = 1; ot.push(tileSub(top, top - x));
        });
        rule = R('diff', dn, 'diff'); pk = 'p.sub'; pr = { n: dn, k: k };
        break;
      }
      case 'oddeven': {
        var par = avoid === 'odd' ? 'even' : avoid === 'even' ? 'odd' : rng.pick(['odd', 'even']), topN = ri === 0 ? 10 : ODDEVEN_MAX;
        rng.sample(range(1, topN).filter(function (x) { return parityOf(x) === par; }), k).forEach(function (x) { tg.push(tileN(x)); });
        rng.sample(range(1, topN).filter(function (x) { return parityOf(x) !== par; }), n - k).forEach(function (x) { ot.push(tileN(x)); });
        rule = R('parity', par, 'parity'); pk = 'p.oddeven'; pr = { parity: par, k: k };
        break;
      }
      default: throw new Error('PB.Content: unknown topic ' + topic);
    }
    return { rule: rule, promptKey: pk, params: pr, targets: tg, others: ot, k: k, n: n };
  }
  function pickLetters(rng, pool, L0, m) {
    for (var t = 0; t < 80; t++) {
      var s = rng.sample(pool.filter(function (x) { return !lookalike(L0, x); }), m), ok = true;
      for (var i = 0; i < s.length && ok; i++) for (var j = i + 1; j < s.length; j++) if (lookalike(s[i], s[j])) { ok = false; break; }
      if (ok) return s;
    }
    throw new Error('no letter set');
  }
  function countPairOk(a, b, age) {
    var hi = SEL_RANGE[age] || 5, g = Math.abs(a - b);
    if (a < 1 || b < 1 || a > hi || b > hi || g < 1) return false;
    if (age <= 4) return g >= 2;
    return Math.max(a, b) >= 6 ? g >= 2 : g >= 1;
  }
  /** { letter: [{kind 'toy'|'animal', value}] } for 'initial' in this language (null initials left out). */
  function initialGroups(lang, src) {
    var g = {};
    INITIAL_TOYS.forEach(function (o) { var L = initialOf({ kind: 'toy', obj: o }, lang, src); if (L) (g[L] = g[L] || []).push({ kind: 'toy', value: o }); });
    INITIAL_ANIMALS.forEach(function (a) { var L = initialOf({ kind: 'animal', animal: a }, lang, src); if (L) (g[L] = g[L] || []).push({ kind: 'animal', value: a }); });
    return g;
  }

  function buildRound(topic, age, lang, rng, ri, level, short, src, prev) {
    var nk = sizeFor(topic, age, ri, level, short);
    nk.short = !!short; nk.level = level;
    var set = buildSet(topic, age, lang, rng, ri, nk, src, prev);
    var list = set.targets.map(function (t) { return { thing: t, target: true }; }).concat(set.others.map(function (t) { return { thing: t, target: false }; }));
    rng.shuffle(list);
    var bubbles = list.map(function (q, i) { return { id: 'b' + i, i: i, thing: q.thing, target: q.target }; });
    var r = { topic: topic, age: age, lang: lang, roundIndex: ri, level: level, short: !!short, surprise: null, nameSrc: src,
      mode: topic === 'count' ? nk.mode : 'match', bubbles: bubbles, n: bubbles.length, k: set.k,
      promptKey: set.promptKey, params: set.params, rule: set.rule };
    r.key = roundKey(r);
    return r;
  }

  /** makeRound(topic, o) → round. usedKeys: never the same set twice in a chapter; prevRule: the asked value differs from the
   *  last round's (DESIGN: "the target value changes every round in a chapter"). */
  function makeRound(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new PB.RNG(1), ri = o.roundIndex || 0;
    var level = o.level === undefined || o.level === null ? 1 : o.level | 0;
    if (ALL_TOPICS.indexOf(topic) < 0) throw new Error('PB.Content: unknown topic ' + topic);
    var used = (o.usedKeys || []).slice();
    var src = PB.I18N && typeof PB.I18N.name === 'function' ? 'i18n' : 'table';
    if (topic === 'initial' && src === 'i18n') {   // the i18n names must give usable groups, else the table
      var gg = initialGroups(lang, src), P0 = letterPool(lang, 'letters');
      var big = Object.keys(gg).filter(function (q) { return P0.indexOf(q) >= 0 && gg[q].length >= 2; });
      if (big.length < 2 || Object.keys(gg).length < 5) src = 'table';
    }
    var r = null, err = null;
    for (var attempt = 0; attempt < 150; attempt++) {
      try {
        r = buildRound(topic, age, lang, rng, ri, level, !!o.short, src, o.prevRule || null);
        err = validate(r);
        if (!err && attempt < 120 && used.indexOf(r.key) >= 0) err = 'the same set as an earlier round';
        if (!err && attempt < 100 && sameRule(r, o.prevRule)) err = 'the same ask as the previous round';
      } catch (e) { r = null; err = e.message; }
      if (!err) break;
    }
    if (err) throw new Error('PB.Content: invalid round (' + topic + ', age ' + age + ', round ' + ri + '): ' + err);
    r.surprise = ri === 0 ? null : (o.surprise || null);
    r.seed = (rng.next() * 4294967296) >>> 0;
    return r;
  }
  function sameRule(r, prev) { return !!prev && String(prev.value) === String(r.rule.value) && (prev.kind === r.rule.kind || r.topic === 'count'); }

  // ---------------- self-check ----------------
  function thingOk(t) {
    if (!t || PB.THING_KINDS.indexOf(t.kind) < 0) return 'thing kind';
    if (!t.nameKind || t.nameValue === undefined || t.nameValue === null) return 'thing name';
    switch (t.kind) {
      case 'toy': if (PB.TOYS.indexOf(t.obj) < 0 || !PB.PALETTE[t.color]) return 'toy'; break;
      case 'shape': if (PB.SHAPES.indexOf(t.shape) < 0 || !PB.PALETTE[t.color]) return 'shape'; break;
      case 'stars': if (!(t.n >= 1 && t.n <= 12 && t.n === Math.floor(t.n))) return 'stars n ' + t.n; break;
      case 'animal': if (!PB.ANIMALS[t.animal] || t.home !== PB.ANIMALS[t.animal]) return 'animal'; break;
      case 'tile': if (!t.text || String(t.text).length > 5) return 'tile text'; break;
    }
    if (t.big !== undefined && typeof t.big !== 'boolean') return 'big';
    return null;
  }
  /** null when the round follows every rule (DESIGN §5.1 / §3), else the reason. Independent of the generator's bookkeeping. */
  function validate(r) {
    if (!r || !r.bubbles || !r.rule) return 'no bubbles / rule';
    var bs = r.bubbles, n = bs.length, age = r.age, ri = r.roundIndex, i, e;
    if (n < MIN_BUBBLES || n > MAX_BUBBLES || n !== r.n) return n + ' bubbles';
    var ids = {}, tg = [], ot = [];
    for (i = 0; i < n; i++) {
      var b = bs[i];
      if (!b.id || ids[b.id]) return 'bubble id ' + b.id;
      ids[b.id] = 1;
      if (b.i !== i) return 'bubble order';
      if ((e = thingOk(b.thing))) return e;
      (b.target ? tg : ot).push(b);
    }
    var rule = r.rule, nk = sizeFor(r.topic, age, ri, r.level, r.short);
    if (r.mode !== nk.mode) return 'mode ' + r.mode;
    if (r.mode === 'countPop') {
      if (ot.length || rule.kind !== 'pop' || r.promptKey !== 'p.countPop' || r.params.n !== r.k || rule.value !== r.k) return 'countPop';
      if (countPopChoices(age, ri, r.short).indexOf(r.k) < 0) return 'countPop k ' + r.k;
      if (r.k >= n || n !== countPopN(age, ri, r.level, r.short, r.k)) return 'countPop n ' + n;
      var k0 = thingKey(bs[0].thing);
      if (bs.some(function (q) { return thingKey(q.thing) !== k0; })) return 'countPop: the same thing';
      if (!(bs[0].thing.kind === 'toy' || (bs[0].thing.kind === 'stars' && bs[0].thing.n === 1))) return 'countPop thing';
    } else {
      if (n !== nk.n || r.k !== nk.k) return 'n / k ' + n + '/' + r.k + ' (want ' + nk.n + '/' + nk.k + ')';
      if (tg.length !== r.k) return tg.length + ' targets (k ' + r.k + ')';
      for (i = 0; i < tg.length; i++) if (!ruleHolds(rule, tg[i].thing, r)) return tg[i].id + ' does not share the rule ' + rule.kind + '=' + rule.value;
      for (i = 0; i < ot.length; i++) if (ruleHolds(rule, ot[i].thing, r)) return ot[i].id + ' shares the rule but is no target';
      var vals = uniq(ot.map(function (q) { return String(valueOf(rule, q.thing, r)); }));
      if (rule.kind !== 'size' && rule.kind !== 'n' && rule.kind !== 'parity' && (vals.length < 1 || vals.length > OTHER_VALUES[age])) return vals.length + ' other values';
    }
    if (!r.promptKey || !r.params) return 'prompt';
    var T = tg.map(function (q) { return q.thing; }), all = bs.map(function (q) { return q.thing; });
    function kinds(k) { return all.every(function (t) { return t.kind === k; }); }
    var cs = uniq(all.filter(function (t) { return t.color; }).map(function (t) { return t.color; }));
    if (age < COLOR_SAFE_BELOW && (clash(cs, CLASH) || cs.indexOf('pink') >= 0)) return 'colour clash ' + cs.join('+');
    if (r.mode !== 'countPop' && r.params.k !== undefined && r.params.k !== r.k) return 'params.k';
    switch (r.topic) {
      case 'colors': {
        if (!kinds('toy') || rule.kind !== 'color' || r.promptKey !== 'p.colors' || r.params.color !== rule.value) return 'colors prompt / kind';
        if (ri === 0 && !all.every(function (t) { return t.obj === all[0].obj; })) return 'colors warm-up: the same toy';
        if (ri > 0 && age >= 4 && uniq(T.map(function (t) { return t.obj; })).length !== T.length) return 'colors: different toys';
        if (ri > 0 && ot.length && !ot.some(function (q) { return T.some(function (t) { return t.obj === q.thing.obj; }); })) return 'colors: the toy is a cue';
        break;
      }
      case 'shapes': {
        if (!kinds('shape') || rule.kind !== 'shape' || r.params.shape !== rule.value) return 'shapes prompt / kind';
        var shs = uniq(all.map(function (t) { return t.shape; }));
        if (anySimilar(shs)) return 'confusable shapes ' + shs.join('+');
        if (all.some(function (t) { return shapesFor(age).indexOf(t.shape) < 0; })) return 'shape at age ' + age;
        if (age < 5) { if (cs.length !== 1 || r.promptKey !== 'p.shapes') return 'shapes: one colour'; }
        else if (r.promptKey !== 'p.shapes5' || cs.length !== n) return 'shapes5: mixed colours';
        break;
      }
      case 'size': {
        if (rule.kind !== 'size' || (rule.value !== 'big' && rule.value !== 'small') || r.promptKey !== 'p.size' || r.params.big !== (rule.value === 'big')) return 'size prompt';
        var a0 = all[0];
        if (!all.every(function (t) { return t.kind === 'toy' && t.obj === a0.obj && t.color === a0.color && typeof t.big === 'boolean'; })) return 'size: one toy';
        break;
      }
      case 'count': {
        if (r.mode === 'countSel') {
          if (!kinds('stars') || rule.kind !== 'n' || r.promptKey !== 'p.countSel' || r.params.n !== rule.value || r.k !== 1) return 'countSel prompt / kind';
          var ns = all.map(function (t) { return t.n; });
          if (uniq(ns).length !== n) return 'countSel: different star counts';
          for (i = 0; i < ot.length; i++) if (!countPairOk(rule.value, ot[i].thing.n, age)) return 'count pair ' + rule.value + '/' + ot[i].thing.n + ' at age ' + age;
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
          if (rule.value !== 'farm' && r.k > homeAnimals(rule.value).length) return 'home k';
          var an = T.map(function (t) { return t.animal; });
          if (uniq(an).length !== an.length) return 'home: different animals';
          if (all.some(function (t) { return t.nameKind !== 'home' || t.nameValue !== t.home; })) return 'home names';
        } else return 'animals rule';
        break;
      }
      case 'letters': case 'lower': {
        if (!kinds('tile') || rule.kind !== 'letter' || r.promptKey !== 'p.' + r.topic) return r.topic + ' prompt';
        var pool = letterPool(r.lang, r.topic);
        if (all.some(function (t) { return t.text.length !== 1 || pool.indexOf(t.text.toUpperCase()) < 0; })) return 'letter pool';
        if (r.topic === 'letters' && all.some(function (t) { return t.text !== t.text.toUpperCase(); })) return 'letters: capitals';
        var lt = uniq(all.map(function (t) { return t.text; }));
        for (i = 0; i < lt.length; i++) for (var j = i + 1; j < lt.length; j++) if (lt[i].toUpperCase() !== lt[j].toUpperCase() && lookalike(lt[i], lt[j])) return 'lookalike letters ' + lt[i] + lt[j];
        if (r.topic === 'lower' && !(T.some(function (t) { return t.text === rule.value; }) && T.some(function (t) { return t.text === rule.value.toLowerCase(); }))) return 'lower: both cases';
        break;
      }
      case 'initial': {
        if (!all.every(function (t) { return t.kind === 'toy' || t.kind === 'animal'; }) || rule.kind !== 'initial' || r.promptKey !== 'p.initial') return 'initial prompt';
        if (letterPool(r.lang, 'letters').indexOf(rule.value) < 0) return 'initial letter pool';
        for (i = 0; i < all.length; i++) { var Li = initialOf(all[i], r.lang, r.nameSrc); if (!Li || Li !== all[i].letter) return 'initial of ' + (all[i].obj || all[i].animal); }
        for (i = 0; i < ot.length; i++) if (baseLetter(ot[i].thing.letter) === rule.value) return 'initial: a look-alike letter';
        if (all.some(function (t) { return (t.kind === 'toy' && INITIAL_TOYS.indexOf(t.obj) < 0) || (t.kind === 'animal' && INITIAL_ANIMALS.indexOf(t.animal) < 0); })) return 'initial things';
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
        var nn = all.map(function (t) { return +t.text; });
        if (nn.some(function (x, q) { return !(x >= 1 && x <= ODDEVEN_MAX) || nn.indexOf(x) !== q; })) return 'oddeven numbers';
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
  /** makeTalk(topic, { age, lang, rng }) — one question per chapter; 2 picture choices at age 3, else 3 (ages ≤ 5: pictures only). */
  function makeTalk(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new PB.RNG(1);
    var show = null, params = {}, ch, a, nC = age <= 3 ? 2 : 3, pk = 'talk.' + topic;
    switch (topic) {
      case 'colors': {
        var safe, pickC = null;
        for (var tc = 0; tc < 200 && !pickC; tc++) {   // a colour + nC − 1 others, no clash pair among them (below age 5)
          a = rng.pick(colorPool(age));
          safe = colorPool(age).filter(function (c) { return c !== a && !clash([a, c], pairsFor(age)); });
          var sc = rng.sample(safe, nC - 1);
          if (sc.length === nC - 1 && !clash(sc.concat([a]), pairsFor(age))) pickC = sc;
        }
        params = { color: a }; show = toy(rng.pick(PB.TOYS), a);
        ch = choicesFrom(rng, a, pickC || safe.slice(0, 1), nC, function (c) { return { kind: 'color', color: c }; }); break;
      }
      case 'shapes': {
        var col = rng.pick(colorPool(age)), shp = shapesFor(age); a = rng.pick(shp); params = { shape: a };
        var others = rng.shuffle(shp.filter(function (s) { return s !== a && !similarShapes(a, s); })), sel = [];
        others.forEach(function (s) { if (sel.length < nC - 1 && sel.every(function (q) { return !similarShapes(q, s); })) sel.push(s); });
        ch = choicesFrom(rng, a, sel, nC, function (s) { return shape(s, col); }); break;
      }
      case 'size': {
        var ob = rng.pick(PB.TOYS), cz = rng.pick(colorPool(age)); a = rng.pick(['big', 'small']); params = { size: a };
        ch = choicesFrom(rng, a, ['big', 'small'], 2, function (s) { return sized(toy(ob, cz), s === 'big'); }); break;
      }
      case 'animals': {
        if (age <= 3) {
          pk = 'talk.who'; a = rng.pick(FARM); params = { animal: a }; show = animal(a);
          ch = choicesFrom(rng, a, FARM, nC, function (x) { return animal(x); });
        } else {
          var w = rng.pick(WILD.filter(function (q) { return q !== 'fishbowl'; })); a = PB.ANIMALS[w]; params = { animal: w }; show = animal(w);
          var hs = PB.HOMES.filter(function (h) { return h !== a && h !== 'farm'; }), pickH = ['farm'].concat(rng.shuffle(hs)).slice(0, nC - 1);
          ch = choicesFrom(rng, a, pickH, nC, function (h) { return { kind: 'home', home: h }; });
        }
        break;
      }
      case 'count': {
        var hi = { 3: 4, 4: 5, 5: 8, 6: 10, 7: 10 }[age]; a = rng.int(age <= 4 ? 1 : 2, hi); params = { n: a }; show = stars(a);
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
        var src = PB.I18N && typeof PB.I18N.name === 'function' ? 'i18n' : 'table', g = initialGroups(lang, src), cand = [], LP = letterPool(lang, 'letters');
        Object.keys(g).forEach(function (L) { if (LP.indexOf(L) >= 0) g[L].forEach(function (q) { cand.push({ L: L, q: q }); }); });
        if (!cand.length) { g = initialGroups(lang, 'table'); Object.keys(g).forEach(function (L) { if (LP.indexOf(L) >= 0) g[L].forEach(function (q) { cand.push({ L: L, q: q }); }); }); }
        var pc = rng.pick(cand); a = pc.L;
        show = pc.q.kind === 'animal' ? animal(pc.q.value) : toy(pc.q.value, rng.pick(COLORS5)); show.letter = a;
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
      default: throw new Error('PB.Content: unknown topic ' + topic);
    }
    return { topic: topic, promptKey: pk, params: params, show: show, choices: ch.choices, answer: ch.answer, answerId: ch.answer };
  }

  /** 4 chapter topics for a session. Without rng or `last`: PB.AGE_TOPICS (the first session). With both: chapter 1 rotates
   *  between the pool's two easiest topics (the one that did NOT open last time); chapters 2–4 = 3 of the others (preferring
   *  topics left out of `last`, so the left-out topic always comes back), in pool (difficulty) order. */
  function topicsFor(age, rng, last) {
    age = ageOf(age);
    last = Array.isArray(last) ? last : [];
    if (!rng || !last.length) return PB.AGE_TOPICS[age].slice();
    var pool = PB.AGE_POOLS[age].slice(), ord = function (a, b) { return pool.indexOf(a) - pool.indexOf(b); };
    var first = last[0] === pool[0] ? pool[1] : pool[0];
    var rest = pool.filter(function (t) { return t !== first; });
    var fresh = rng.shuffle(rest.filter(function (t) { return last.indexOf(t) < 0; }));
    var old = rng.shuffle(rest.filter(function (t) { return last.indexOf(t) >= 0; }));
    return [first].concat(fresh.concat(old).slice(0, 3).sort(ord));
  }

  PB.Content = {
    makeRound: makeRound, makeTalk: makeTalk, validate: validate, topicsFor: topicsFor, ruleHolds: ruleHolds, sizeFor: sizeFor,
    tableNK: tableNK, countPopChoices: countPopChoices, countPopN: countPopN, valueOf: valueOf,
    ageOf: ageOf, langOf: langOf, clash: clash, pairsFor: pairsFor, colorPool: colorPool, shapesFor: shapesFor, similarShapes: similarShapes,
    lookalike: lookalike, letterPool: letterPool, parityOf: parityOf, initialOf: initialOf, initialOfName: initialOfName, thingName: thingName,
    baseLetter: baseLetter, initialGroups: initialGroups, thingKey: thingKey, roundKey: roundKey, parseOp: parseOp, countPairOk: countPairOk,
    sameRule: sameRule, homeAnimals: homeAnimals,
    TOPICS: ALL_TOPICS, COLORS: COLORS, COLORS5: COLORS5, SHAPES3: SHAPES3, SHAPES4: SHAPES4, SIMILAR_SHAPES: SIMILAR_SHAPES, LOOKALIKE: LOOKALIKE,
    SMALL_PAIRS: SMALL_PAIRS, LETTER_POOL: LETTER_POOL, CLASH: CLASH, COLOR_SAFE_BELOW: COLOR_SAFE_BELOW, MAX_BUBBLES: MAX_BUBBLES,
    OTHER_VALUES: OTHER_VALUES, SEL_RANGE: SEL_RANGE, ADD_RANGE: ADD_RANGE, SUB_RANGE: SUB_RANGE, SUB_TOP: SUB_TOP, ODDEVEN_MAX: ODDEVEN_MAX,
    MINUS: MINUS, FARM: FARM, WILD: WILD, INITIAL_TOYS: INITIAL_TOYS, INITIAL_ANIMALS: INITIAL_ANIMALS
  };
})(window.PB = window.PB || {});
