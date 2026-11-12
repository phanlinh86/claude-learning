/* Bo's Farm Parade — FP.PALETTE, FP.COLORS, FP.SHAPES, FP.OBJECTS, FP.ANIMALS, FP.HOMES, FP.AGE_TOPICS, FP.AGE_POOLS,
 * FP.Content (pure + deterministic odd-one-out round generator; DESIGN §5.1)
 *
 *   FP.Content.makeRound(topic, { age, lang, rng, roundIndex, level, surprise, short?, usedKeys?, prevKey?, prevRule?,
 *                                 prevRuleRun?, prevOddSlots? ([last, beforeLast]), usedOdd? (odd values met this chapter) })  → round (self-checked with validate; retries, throws if impossible)
 *   FP.Content.makeTalk(topic, { age, lang, rng })  → talk
 *   FP.Content.validate(round)  → null | 'reason'
 *   FP.Content.topicsFor(age, rng?, lastTopics?)  → the 4 chapter topics (easiest first)
 *   FP.Content.ruleHolds(rule, thing, round?)  → does this thing share the rule
 *   FP.Content.countFor(age, roundIndex, level, short)  → members in that round
 *
 * round = { topic, age, lang, roundIndex, level, short, surprise: null|'chick'|'rooster'|'fireflies', key, seed, nameSrc,
 *   members: [ { id 'm0'…, slot (0 = left / the tail of the parade), thing, odd: bool } ]   (array order = slot order)
 *   oddId, oddSlot, oddValue (the wild animal / odd colour, for usedOdd), promptKey, params, rule: { kind, value, nameKind } }
 * thing = { kind 'obj'|'block'|'crate'|'tile'|'animal', color?, obj?, shape?, n?, animal?, home?, text?, big?, letter?, a?, b?, op?,
 *           nameKind, nameValue }   — nameKind / nameValue name the member the way THIS round's question is about:
 *   colors → 'color'/'red' · shapes → 'shape'/'star' · size → 'size'/'big'|'small' · count → 'number'/3 ·
 *   animals (same animal) → 'animal'/'cow' · animals (farm) → 'home'/'farm'|'sea'… · letters / lower → 'letter'/'B' (the CAPITAL) ·
 *   initial → 'letter'/'B' (thing.letter = its initial) · add → 'sum'/5 · sub → 'diff'/3 · oddeven → 'parity'/'even'
 * rule kinds: color · shape · size · n · animal · home · letter · initial · sum · diff · parity  (rule.nameKind = the i18n name kind)
 * Prompt keys / params: p.colors {color} · p.shapes {shape} · p.shapes5 {shape} · p.size {} · p.count {n} · p.animal {animal} ·
 *   p.farm {} · p.letters {letter} · p.lower {letter} · p.initial {letter} · p.add {n} · p.sub {n} · p.oddeven {parity}
 * talk = { topic, promptKey, params, show: thing | null, choices: [{ id, thing, value }], answer (choice id), answerId }
 *   promptKeys: talk.colors {color} · talk.shapes {shape} · talk.size {size} · talk.count {n} · talk.animals {animal} (where does
 *   it live; choices home badges) · talk.who {animal} (age 3: "Who is this?") · talk.letters {letter} · talk.lower {letter, small} ·
 *   talk.initial {letter, nameKind, nameValue} · talk.add {a, b} · talk.sub {a, b} · talk.oddeven {parity}
 *   choice things: any member thing, or { kind:'color', color } · { kind:'number', n } · { kind:'home', home } · { kind:'size', big }
 */
(function (FP) {
  'use strict';

  // DESIGN §3 answer palette (exact hex)
  FP.PALETTE = {
    red:    { base: '#E84A4A', dark: '#A8282E', light: '#F7A0A0' },
    blue:   { base: '#3C8DE8', dark: '#1F5BA8', light: '#A6CCF5' },
    yellow: { base: '#FFD23F', dark: '#C99A12', light: '#FFEB9C' },
    green:  { base: '#4CC26B', dark: '#2A8343', light: '#A8E6B8' },
    orange: { base: '#FF9A2E', dark: '#C4650C', light: '#FFCB8E' },
    purple: { base: '#8E44AD', dark: '#6840A8', light: '#D2BDF3' },
    pink:   { base: '#FF8FC0', dark: '#C9558A', light: '#FFCCE2' }      // an answer colour from age 5
  };
  for (var pk in FP.PALETTE) FP.PALETTE[pk].fill = FP.PALETTE[pk].base;
  FP.WOOD = { base: '#B98552', dark: '#7A5130', light: '#DDB07E' };
  FP.HAY = { base: '#E9C46A', dark: '#B8913A', light: '#F6E2A6' };
  FP.APPLE = '#D9483B';
  FP.METAL = { base: '#9AA4AE', dark: '#636C75' };
  FP.COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  var COLORS = FP.COLORS.slice(0, 6), COLORS5 = FP.COLORS.slice();
  FP.SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'oval', 'rect', 'diamond'];
  FP.OBJECTS = ['bucket', 'boot', 'can', 'tractor', 'flower'];
  FP.ANIMALS = { cow: 'farm', pig: 'farm', sheep: 'farm', duck: 'farm', hen: 'farm', horse: 'farm', goat: 'farm',
    crab: 'sea', fishbowl: 'sea', penguin: 'ice', lion: 'savanna', monkey: 'jungle' };
  FP.HOMES = ['farm', 'sea', 'ice', 'savanna', 'jungle'];
  FP.MEMBER_KINDS = ['obj', 'block', 'crate', 'tile', 'animal'];
  var FARM = Object.keys(FP.ANIMALS).filter(function (a) { return FP.ANIMALS[a] === 'farm'; });
  var WILD = Object.keys(FP.ANIMALS).filter(function (a) { return FP.ANIMALS[a] !== 'farm' && a !== 'fishbowl'; });  // goldfish are not sea animals: the bowl only appears in non-home rounds
  var ANIMAL_LIST = Object.keys(FP.ANIMALS);

  FP.AGE_TOPICS = {
    3: ['colors', 'shapes', 'size', 'animals'],
    4: ['colors', 'shapes', 'count', 'animals'],
    5: ['shapes', 'count', 'letters', 'animals'],
    6: ['lower', 'initial', 'add', 'count'],
    7: ['initial', 'add', 'sub', 'oddeven']
  };
  /* Every age has a POOL of 5 topics in difficulty order; a session plays 4 of them (rotating between sessions). */
  FP.AGE_POOLS = {
    3: ['colors', 'shapes', 'size', 'animals', 'count'],
    4: ['colors', 'size', 'shapes', 'count', 'animals'],
    5: ['colors', 'shapes', 'count', 'letters', 'animals'],
    6: ['letters', 'lower', 'initial', 'add', 'count'],
    7: ['count', 'initial', 'add', 'sub', 'oddeven']
  };
  var ALL_TOPICS = ['colors', 'shapes', 'size', 'animals', 'count', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];

  // ---- tables (DESIGN §5.1)
  var MAX_MEMBERS = 5, MIN_MEMBERS = 3;
  var SHAPES3 = ['circle', 'square', 'triangle', 'star', 'heart'];   // age 3
  var SHAPES4 = SHAPES3.concat(['rect']);                             // age 4 (oval + diamond are hard words: from age 5)
  var SIMILAR_SHAPES = [['square', 'rect'], ['circle', 'oval'], ['square', 'diamond'], ['heart', 'circle']];
  var LETTER_POOL = { en: 'ABCDEFGHIKLMNOPRSTUW', vi: 'ABCDEGHIKLMNOPSTUVXY' };
  var LOOKALIKE = ['EF', 'OQCG', 'MNW', 'PRB', 'ILT', 'UV'];          // capitals that never meet in one round
  var LOWER_SKIP = 'IL';                                              // capital I and small l look alike
  var SMALL_PAIRS = ['bdpq', 'nu', 'mw', 'co'];                       // small letters that never meet in one round
  var COUNT_MAX = { 3: 5, 4: 5, 5: 10, 6: 12, 7: 12 };
  var ADD_RANGE = { 6: [5, 10], 7: [6, 20] }, SUB_RANGE = [1, 6], SUB_TOP = 10, ODDEVEN_MAX = 20;
  var MINUS = '−';
  var VI_DIGRAPHS = ['ngh', 'ng', 'nh', 'ch', 'gh', 'kh', 'ph', 'th', 'tr', 'gi', 'qu'];
  var VI_ALPHABET = ['A', 'Ă', 'Â', 'B', 'C', 'D', 'Đ', 'E', 'Ê', 'G', 'H', 'I', 'K', 'L', 'M', 'N', 'O', 'Ô', 'Ơ', 'P', 'Q', 'R', 'S', 'T', 'U', 'Ư', 'V', 'X', 'Y'];
  /* Fallback names for 'initial' (DESIGN §6) when FP.I18N.name is not loaded (headless tests). */
  FP.THING_NAMES = {
    en: { bucket: 'bucket', boot: 'boot', can: 'watering can', tractor: 'tractor', flower: 'flower', cow: 'cow', pig: 'pig', sheep: 'sheep',
      duck: 'duck', hen: 'hen', horse: 'horse', goat: 'goat', crab: 'crab', fishbowl: 'goldfish', penguin: 'penguin', lion: 'lion', monkey: 'monkey' },
    vi: { bucket: 'cái xô', boot: 'chiếc ủng', can: 'bình tưới', tractor: 'xe máy cày', flower: 'chậu hoa', cow: 'con bò', pig: 'con heo',
      sheep: 'con cừu', duck: 'con vịt', hen: 'con gà mái', horse: 'con ngựa', goat: 'con dê', crab: 'con cua', fishbowl: 'bể cá vàng',
      penguin: 'chim cánh cụt', lion: 'sư tử', monkey: 'con khỉ' }
  };
  var CLASSIFIERS = { en: ['the', 'a', 'an'], vi: ['con', 'cái', 'quả', 'chiếc'] };

  function langOf(l) { return l === 'vi' ? 'vi' : 'en'; }
  function ageOf(a) { a = Math.round(+a || 4); return a < 3 ? 3 : a > 7 ? 7 : a; }
  function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }
  function parityOf(n) { return n % 2 ? 'odd' : 'even'; }

  // ---------------- names → initials ('initial' topic) ----------------
  /** The name of an obj / animal: FP.I18N.name(lang, kind, value) when loaded (src 'i18n'), else FP.THING_NAMES (src 'table'). */
  function thingName(kind, value, lang, src) {
    lang = langOf(lang);
    if (src !== 'table' && FP.I18N && typeof FP.I18N.name === 'function') {
      try {
        var s = FP.I18N.name(lang, kind, value);
        if (typeof s === 'string' && s.trim() && s.indexOf('{') < 0 && s !== String(value) + '?') return s;
      } catch (e) { /* fall back */ }
    }
    return FP.THING_NAMES[lang][value] || null;
  }
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
  function shapesFor(age) { return age <= 3 ? SHAPES3.slice() : age === 4 ? SHAPES4.slice() : FP.SHAPES.slice(); }
  function similarShapes(a, b) { for (var i = 0; i < SIMILAR_SHAPES.length; i++) { var p = SIMILAR_SHAPES[i]; if ((p[0] === a && p[1] === b) || (p[0] === b && p[1] === a)) return true; } return false; }
  function lookalike(a, b) {
    a = String(a).toUpperCase(); b = String(b).toUpperCase();
    if (a === b) return true;
    for (var i = 0; i < LOOKALIKE.length; i++) if (LOOKALIKE[i].indexOf(a) >= 0 && LOOKALIKE[i].indexOf(b) >= 0) return true;
    var x = a.toLowerCase(), y = b.toLowerCase();
    for (i = 0; i < SMALL_PAIRS.length; i++) if (SMALL_PAIRS[i].indexOf(x) >= 0 && SMALL_PAIRS[i].indexOf(y) >= 0) return true;
    return false;
  }
  function letterPool(lang, topic) {
    var P = LETTER_POOL[langOf(lang)].split('');
    return topic === 'lower' ? P.filter(function (c) { return LOWER_SKIP.indexOf(c) < 0; }) : P;
  }

  // ---------------- things ----------------
  function obj(o, c) { return { kind: 'obj', obj: o, color: c, nameKind: 'color', nameValue: c }; }
  function block(s, c) { return { kind: 'block', shape: s, color: c, nameKind: 'shape', nameValue: s }; }
  function crate(n) { return { kind: 'crate', n: n, nameKind: 'number', nameValue: n }; }
  function animal(a) { return { kind: 'animal', animal: a, home: FP.ANIMALS[a], nameKind: 'animal', nameValue: a }; }
  function tileL(c) { return { kind: 'tile', text: String(c), nameKind: 'letter', nameValue: String(c).toUpperCase() }; }
  function tileN(n) { return { kind: 'tile', text: String(n), n: n, nameKind: 'parity', nameValue: parityOf(n) }; }
  function tileAdd(a, b) { return { kind: 'tile', text: a + '+' + b, a: a, b: b, op: '+', n: a + b, nameKind: 'sum', nameValue: a + b }; }
  function tileSub(a, b) { return { kind: 'tile', text: a + MINUS + b, a: a, b: b, op: MINUS, n: a - b, nameKind: 'diff', nameValue: a - b }; }
  function sized(t, big) { t.big = !!big; t.nameKind = 'size'; t.nameValue = big ? 'big' : 'small'; return t; }
  function thingKey(t) {
    return [t.kind, t.obj || '', t.color || '', t.shape || '', t.n === undefined ? '' : t.n, t.animal || '', t.text || '', t.big === false ? 's' : ''].join(':');
  }
  function roundKey(r) {
    var odd = null, rest = [];
    r.members.forEach(function (m) { if (m.odd) odd = thingKey(m.thing); else rest.push(thingKey(m.thing)); });
    return r.topic + '|' + rest.sort().join(',') + '|' + odd;
  }

  /** Members per round (DESIGN §5.1). Age 4 counting crates stay at 3, 3, 4, 4 (comparing 25 apples is too slow at 4). */
  function countFor(age, ri, level, short, topic) {
    var T = age <= 3 ? [3, 3, 3, 4] : age === 4 ? (level === 0 || topic === 'count' ? [3, 3, 4, 4] : [3, 4, 4, 5]) : age === 5 ? [3, 4, 5, 5] : [4, 5, 5, 5];
    var n = T[Math.min(Math.max(0, ri | 0), 3)];
    if (short && ri > 0) n = Math.min(n, age <= 4 ? 3 : 4);
    return n;
  }

  // ---------------- the rule ----------------
  function sizeOf(t) { return t.big === false ? 'small' : 'big'; }
  /** Does `thing` share the rule? (`r` gives lang / nameSrc for 'initial'.) */
  function ruleHolds(rule, t, r) {
    if (!rule || !t) return false;
    var v = rule.value;
    switch (rule.kind) {
      case 'color': return t.color === v;
      case 'shape': return t.kind === 'block' && t.shape === v;
      case 'size': return sizeOf(t) === v;
      case 'n': return t.kind === 'crate' && t.n === v;
      case 'animal': return t.kind === 'animal' && t.animal === v;
      case 'home': return t.kind === 'animal' && FP.ANIMALS[t.animal] === v;
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

  // ---------------- rounds ----------------
  /** Builds {rule, promptKey, params, majority: [thing], odd: thing} for one round, or throws. */
  function buildSet(topic, age, lang, rng, ri, k, src, usedOdd) {
    var maj = [], odd, rule, pk, pr = {}, i, pool, c, d, oddValue = null;
    usedOdd = usedOdd || [];
    var fresh = function (list) { var f = list.filter(function (x) { return usedOdd.indexOf(x) < 0; }); return f.length ? f : list; };
    switch (topic) {
      case 'colors': {
        // the odd colour first (balanced, never one already odd in this chapter), then the friends' colour
        pool = colorPool(age);
        d = rng.pick(fresh(pool));
        var oc = pool.filter(function (x) { return x !== d && !clash([d, x], pairsFor(age)); });
        c = rng.pick(oc);
        oddValue = d;
        var same = ri === 0 || age <= 3 || (age === 4 && ri < 2);
        if (same) { var o = rng.pick(FP.OBJECTS); for (i = 0; i < k; i++) maj.push(obj(o, c)); odd = obj(o, d); }
        else {
          var os = rng.sample(FP.OBJECTS, k);
          os.forEach(function (x) { maj.push(obj(x, c)); });
          odd = obj(rng.chance(0.7) ? rng.pick(os) : rng.pick(FP.OBJECTS), d);   // the object is never a cue
        }
        rule = R('color', c, 'color'); pk = 'p.colors'; pr = { color: c };
        break;
      }
      case 'shapes': {
        var shp = shapesFor(age), s = rng.pick(shp), so = rng.pick(shp.filter(function (x) { return x !== s && !similarShapes(s, x); }));
        if (age < 5) {
          c = rng.pick(colorPool(age));
          for (i = 0; i < k; i++) maj.push(block(s, c));
          odd = block(so, c); pk = 'p.shapes';
        } else {   // shapes5: mixed colours; the odd one wears one of its friends' colours
          var cs = rng.sample(COLORS5, k);
          cs.forEach(function (x) { maj.push(block(s, x)); });
          odd = block(so, rng.pick(cs)); pk = 'p.shapes5';
        }
        rule = R('shape', s, 'shape'); pr = { shape: s };
        break;
      }
      case 'size': {
        // rounds 0 and 2: one LITTLE among big ones ("Which one is the little one?"); rounds 1 and 3: one BIG among little ones
        var mk, bigOdd = ri % 2 === 1;
        if (rng.chance(0.5)) { var ob = rng.pick(FP.OBJECTS), col = rng.pick(colorPool(age)); mk = function () { return obj(ob, col); }; }
        else { var an = rng.pick(FARM); mk = function () { return animal(an); }; }
        for (i = 0; i < k; i++) maj.push(sized(mk(), !bigOdd));
        odd = sized(mk(), bigOdd);
        rule = R('size', bigOdd ? 'small' : 'big', 'size'); pk = bigOdd ? 'p.sizeBig' : 'p.size'; pr = {};
        break;
      }
      case 'count': {
        var a, b, hi = COUNT_MAX[age] || 5;
        for (var t = 0; t < 400; t++) {
          if (age <= 4 && ri === 0) { var wp = rng.pick([[1, 3], [3, 1], [2, 4], [4, 2]]); a = wp[0]; b = wp[1]; }
          else { var top = ri === 0 ? Math.min(hi, age <= 5 ? 5 : 6) : hi; a = rng.int(1, top); b = rng.int(1, top); }
          if (countPairOk(a, b, age)) break;
        }
        for (i = 0; i < k; i++) maj.push(crate(a));
        odd = crate(b);
        rule = R('n', a, 'number'); pk = 'p.count'; pr = { n: a };
        break;
      }
      case 'animals': {
        if (age <= 3 || ri === 0) {
          var x0 = rng.pick(FARM), x1 = rng.pick(FARM.filter(function (q) { return q !== x0; }));
          for (i = 0; i < k; i++) maj.push(animal(x0));
          odd = animal(x1);
          rule = R('animal', x0, 'animal'); pk = 'p.animal'; pr = { animal: x0 };
        } else {
          rng.sample(FARM, k).forEach(function (q) { var t2 = animal(q); t2.nameKind = 'home'; t2.nameValue = 'farm'; maj.push(t2); });
          var w = rng.pick(fresh(WILD)); odd = animal(w); odd.nameKind = 'home'; odd.nameValue = FP.ANIMALS[w]; oddValue = w;
          rule = R('home', 'farm', 'home'); pk = 'p.farm'; pr = {};
        }
        break;
      }
      case 'letters': {
        pool = letterPool(lang, 'letters');
        var L0 = rng.pick(pool), Lo = rng.pick(pool.filter(function (x) { return !lookalike(L0, x); }));
        for (i = 0; i < k; i++) maj.push(tileL(L0));
        odd = tileL(Lo);
        rule = R('letter', L0, 'letter'); pk = 'p.letters'; pr = { letter: L0 };
        break;
      }
      case 'lower': {
        pool = letterPool(lang, 'lower');
        var L1 = rng.pick(pool), L2 = rng.pick(pool.filter(function (x) { return !lookalike(L1, x); }));
        var cases = [];
        for (i = 0; i < k; i++) cases.push(i % 2 === 0);
        rng.shuffle(cases);
        cases.forEach(function (up) { maj.push(tileL(up ? L1 : L1.toLowerCase())); });
        odd = tileL(rng.chance(0.5) ? L2 : L2.toLowerCase());
        rule = R('letter', L1, 'letter'); pk = 'p.lower'; pr = { letter: L1 };
        break;
      }
      case 'initial': {
        // a letter whose group has ≥ 2 different things (cow + crab, bucket + boot …); the majority = every thing of the group once,
        // then repeats (an object again in another colour, an animal again) — so the friends never are just one picture
        var g = initialGroups(lang, src), letters = Object.keys(g).filter(function (q) { return g[q].length >= Math.min(2, k); });
        if (!letters.length) letters = Object.keys(g);
        if (Object.keys(g).length < 2) throw new Error('no initial groups');
        var IL = rng.pick(letters), grp = g[IL];
        var picks = rng.shuffle(grp.slice()).slice(0, k), used = {};
        while (picks.length < k) picks.push(rng.pick(grp));
        picks.forEach(function (q) {
          var t3;
          if (q.kind === 'animal') t3 = animal(q.value);
          else { var cc = rng.shuffle(COLORS5.slice()).filter(function (x) { return !used[q.value + x]; })[0] || 'red'; used[q.value + cc] = 1; t3 = obj(q.value, cc); }
          t3.letter = IL; t3.nameKind = 'letter'; t3.nameValue = IL; maj.push(t3);
        });
        var others = [];
        Object.keys(g).forEach(function (q) { if (q !== IL) g[q].forEach(function (e) { others.push({ e: e, L: q }); }); });
        var oq = rng.pick(others);
        odd = oq.e.kind === 'animal' ? animal(oq.e.value) : obj(oq.e.value, rng.pick(COLORS5));
        odd.letter = oq.L; odd.nameKind = 'letter'; odd.nameValue = oq.L;
        rule = R('initial', IL, 'letter'); pk = 'p.initial'; pr = { letter: IL };
        break;
      }
      case 'add': {
        var rg = ADD_RANGE[age] || ADD_RANGE[6], lo = rg[0], hi2 = ri === 0 ? Math.min(rg[1], age >= 7 ? 10 : 7) : rg[1];
        var n = rng.int(lo, hi2), as = rng.sample(range(1, n - 1), k);
        as.forEach(function (x) { maj.push(tileAdd(x, n - x)); });
        var m = rng.pick(range(Math.max(2, n - 3), Math.min(rg[1] + 2, n + 3)).filter(function (x) { return x !== n; }));
        var a2 = rng.int(1, m - 1); odd = tileAdd(a2, m - a2);
        rule = R('sum', n, 'sum'); pk = 'p.add'; pr = { n: n };
        break;
      }
      case 'sub': {
        var n2 = rng.int(SUB_RANGE[0], ri === 0 ? 4 : SUB_RANGE[1]), tops = rng.sample(range(n2 + 1, SUB_TOP), k);
        tops.forEach(function (x) { maj.push(tileSub(x, x - n2)); });
        var m2 = rng.pick(range(Math.max(0, n2 - 2), Math.min(SUB_TOP - 1, n2 + 2)).filter(function (x) { return x !== n2; }));
        var a3 = rng.int(m2 + 1, SUB_TOP); odd = tileSub(a3, a3 - m2);
        rule = R('diff', n2, 'diff'); pk = 'p.sub'; pr = { n: n2 };
        break;
      }
      case 'oddeven': {
        var par = rng.pick(['odd', 'even']), topN = ri === 0 ? 10 : ODDEVEN_MAX;
        var nums = rng.sample(range(1, topN).filter(function (x) { return parityOf(x) === par; }), k);
        nums.forEach(function (x) { maj.push(tileN(x)); });
        odd = tileN(rng.pick(range(1, topN).filter(function (x) { return parityOf(x) !== par; })));
        rule = R('parity', par, 'parity'); pk = 'p.oddeven'; pr = { parity: par };
        break;
      }
      default: throw new Error('FP.Content: unknown topic ' + topic);
    }
    return { rule: rule, promptKey: pk, params: pr, majority: maj, odd: odd, oddValue: oddValue };
  }
  function countPairOk(a, b, age) {
    var hi = COUNT_MAX[age] || 5, g = Math.abs(a - b);
    if (a < 1 || b < 1 || a > hi || b > hi || g < 1) return false;
    if (age <= 4) return g >= 2;
    return Math.max(a, b) >= 6 ? g >= 2 : g >= 1;
  }
  /** { letter: [{kind 'obj'|'animal', value}] } for 'initial' in this language. */
  function initialGroups(lang, src) {
    var g = {};
    FP.OBJECTS.forEach(function (o) { var L = initialOf({ kind: 'obj', obj: o }, lang, src); if (L) (g[L] = g[L] || []).push({ kind: 'obj', value: o }); });
    ANIMAL_LIST.forEach(function (a) { var L = initialOf({ kind: 'animal', animal: a }, lang, src); if (L) (g[L] = g[L] || []).push({ kind: 'animal', value: a }); });
    return g;
  }
  function groupSize(list) { return list.some(function (q) { return q.kind === 'obj'; }) ? 99 : list.length; }

  function buildRound(topic, age, lang, rng, ri, level, short, prevOddSlots, src, usedOdd) {
    var n = countFor(age, ri, level, short, topic), set = buildSet(topic, age, lang, rng, ri, n - 1, src, usedOdd);
    // the odd one's place is no clue: any slot, uniformly — only never the same slot 3 rounds in a row
    var p0 = prevOddSlots[0], p1 = prevOddSlots[1];
    var slots = range(0, n - 1).filter(function (s) { return !(p0 !== undefined && s === p0 && s === p1); });
    var oddSlot = rng.pick(slots);
    var maj = rng.shuffle(set.majority.slice()), members = [], j = 0;
    for (var s = 0; s < n; s++) {
      var odd = s === oddSlot;
      members.push({ id: 'm' + s, slot: s, thing: odd ? set.odd : maj[j++], odd: odd });
    }
    var r = { topic: topic, age: age, lang: lang, roundIndex: ri, level: level, short: !!short, surprise: null, nameSrc: src,
      members: members, oddId: 'm' + oddSlot, oddSlot: oddSlot, oddValue: set.oddValue, promptKey: set.promptKey, params: set.params, rule: set.rule };
    r.key = roundKey(r);
    return r;
  }

  /** makeRound(topic, o) → round. usedKeys / prevKey: never the same set twice in a chapter; prevRule (+ prevRuleRun): the asked
   *  value differs from the last round's (farm / size have one value; parity at most 2 in a row); prevOddSlot: never the same slot. */
  function makeRound(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new FP.RNG(1), ri = o.roundIndex || 0;
    var level = o.level === undefined || o.level === null ? 1 : o.level | 0;
    if (ALL_TOPICS.indexOf(topic) < 0) throw new Error('FP.Content: unknown topic ' + topic);
    var used = (o.usedKeys || []).slice(); if (o.prevKey) used.push(o.prevKey);
    var pos = Array.isArray(o.prevOddSlots) ? o.prevOddSlots.slice(0, 2) : [];   // [last round's slot, the one before]
    var src = FP.I18N && typeof FP.I18N.name === 'function' ? 'i18n' : 'table';
    if (topic === 'initial' && src === 'i18n') {   // the i18n names must give at least one usable group, else the table
      var gg = initialGroups(lang, src), okG = Object.keys(gg).some(function (q) { return groupSize(gg[q]) >= 4; }) && Object.keys(gg).length >= 2;
      if (!okG || Object.keys(gg).filter(function (q) { return gg[q].length >= 2; }).length < 2) src = 'table';
    }
    var r = null, err = null;
    for (var attempt = 0; attempt < 120; attempt++) {
      try {
        r = buildRound(topic, age, lang, rng, ri, level, !!o.short, pos, src, o.usedOdd || []);
        err = validate(r);
        if (!err && attempt < 100 && used.indexOf(r.key) >= 0) err = 'the same set as an earlier round';
        if (!err && attempt < 80 && sameRule(r, o.prevRule, o.prevRuleRun)) err = 'the same ask as the previous round';
      } catch (e) { r = null; err = e.message; }
      if (!err) break;
    }
    if (err) throw new Error('FP.Content: invalid round (' + topic + ', age ' + age + ', round ' + ri + '): ' + err);
    r.surprise = ri === 0 ? null : (o.surprise || null);
    r.seed = (rng.next() * 4294967296) >>> 0;
    return r;
  }
  function sameRule(r, prev, run) {
    if (!prev || prev.kind !== r.rule.kind) return false;
    if (r.rule.kind === 'home' || r.rule.kind === 'size') return false;
    if (String(prev.value) !== String(r.rule.value)) return false;
    return r.rule.kind === 'parity' ? (run || 1) >= 2 : true;
  }

  // ---------------- self-check ----------------
  function thingOk(t) {
    if (!t || FP.MEMBER_KINDS.indexOf(t.kind) < 0) return 'member kind';
    if (!t.nameKind || t.nameValue === undefined || t.nameValue === null) return 'member name';
    switch (t.kind) {
      case 'obj': if (FP.OBJECTS.indexOf(t.obj) < 0 || !FP.PALETTE[t.color]) return 'obj'; break;
      case 'block': if (FP.SHAPES.indexOf(t.shape) < 0 || !FP.PALETTE[t.color]) return 'block'; break;
      case 'crate': if (!(t.n >= 1 && t.n <= 12 && t.n === Math.floor(t.n))) return 'crate n ' + t.n; break;
      case 'animal': if (!FP.ANIMALS[t.animal] || t.home !== FP.ANIMALS[t.animal]) return 'animal'; break;
      case 'tile': if (!t.text || String(t.text).length > 5) return 'tile text'; break;
    }
    if (t.big !== undefined && typeof t.big !== 'boolean') return 'big';
    return null;
  }
  /** null when the round follows every rule (DESIGN §5.1 / §3), else the reason. Independent of the generator's bookkeeping. */
  function validate(r) {
    if (!r || !r.members || !r.rule) return 'no members / rule';
    var ms = r.members, n = ms.length, age = r.age, ri = r.roundIndex, i, e;
    if (n < MIN_MEMBERS || n > MAX_MEMBERS) return n + ' members';
    if (n !== countFor(age, ri, r.level, r.short, r.topic)) return n + ' members (want ' + countFor(age, ri, r.level, r.short, r.topic) + ')';
    var ids = {}, odds = [];
    for (i = 0; i < n; i++) {
      var m = ms[i];
      if (!m.id || ids[m.id]) return 'member id ' + m.id;
      ids[m.id] = 1;
      if (m.slot !== i) return 'slot order';
      if ((e = thingOk(m.thing))) return e;
      if (m.odd) odds.push(m);
    }
    if (odds.length !== 1) return odds.length + ' odd members';
    var odd = odds[0], rest = ms.filter(function (q) { return !q.odd; }), rule = r.rule;
    if (r.oddId !== odd.id || r.oddSlot !== odd.slot) return 'oddId / oddSlot';
    for (i = 0; i < rest.length; i++) if (!ruleHolds(rule, rest[i].thing, r)) return rest[i].id + ' does not share the rule ' + rule.kind + '=' + rule.value;
    if (ruleHolds(rule, odd.thing, r)) return 'the odd one shares the rule';
    if (!r.promptKey || !r.params) return 'prompt';
    var T = rest.map(function (q) { return q.thing; }), O = odd.thing, all = ms.map(function (q) { return q.thing; });
    function kinds(k) { return all.every(function (t) { return t.kind === k; }); }
    var cs = [];
    all.forEach(function (t) { if (t.color && cs.indexOf(t.color) < 0) cs.push(t.color); });
    // CVD pairs below age 5 (topics where colour is shown on answer-coloured members; 'initial' is ages 6+)
    if (age < COLOR_SAFE_BELOW && (clash(cs, CLASH) || cs.indexOf('pink') >= 0)) return 'colour clash ' + cs.join('+');
    switch (r.topic) {
      case 'colors': {
        if (!kinds('obj') || rule.kind !== 'color' || r.promptKey !== 'p.colors' || r.params.color !== rule.value) return 'colors prompt / kind';
        if (cs.length !== 2) return 'colors: 2 colours';
        var objsM = T.map(function (t) { return t.obj; }), sameObj = ri === 0 || age <= 3 || (age === 4 && ri < 2);
        if (sameObj && !all.every(function (t) { return t.obj === all[0].obj; })) return 'colors: the same object';
        if (!sameObj && objsM.some(function (x, k) { return objsM.indexOf(x) !== k; })) return 'colors: mixed objects';
        break;
      }
      case 'shapes': {
        if (!kinds('block') || rule.kind !== 'shape' || r.params.shape !== rule.value) return 'shapes prompt / kind';
        if (similarShapes(rule.value, O.shape)) return 'confusable shapes';
        if (all.some(function (t) { return shapesFor(age).indexOf(t.shape) < 0; })) return 'shape at age ' + age;
        if (age < 5) { if (cs.length !== 1 || r.promptKey !== 'p.shapes') return 'shapes: one colour'; }
        else {
          var tc = T.map(function (t) { return t.color; });
          if (r.promptKey !== 'p.shapes5' || tc.some(function (x, k) { return tc.indexOf(x) !== k; }) || tc.indexOf(O.color) < 0) return 'shapes5 colours';
        }
        break;
      }
      case 'size': {
        var bigAsk = rule.value === 'small';
        if (rule.kind !== 'size' || (rule.value !== 'big' && !bigAsk) || r.promptKey !== (bigAsk ? 'p.sizeBig' : 'p.size')) return 'size prompt';
        var k0 = all[0], same = all.every(function (t) { return t.kind === k0.kind && t.obj === k0.obj && t.color === k0.color && t.animal === k0.animal; });
        if (!same || (k0.kind !== 'obj' && k0.kind !== 'animal')) return 'size: one thing';
        if (O.big !== bigAsk || T.some(function (t) { return t.big !== !bigAsk; })) return bigAsk ? 'size: one big' : 'size: one little';
        break;
      }
      case 'count': {
        if (!kinds('crate') || rule.kind !== 'n' || r.params.n !== rule.value) return 'count prompt / kind';
        if (!countPairOk(rule.value, O.n, age)) return 'count pair ' + rule.value + '/' + O.n + ' at age ' + age;
        if (age <= 4 && ri === 0 && Math.max(rule.value, O.n) > 4) return 'count warm-up';
        break;
      }
      case 'animals': {
        if (!kinds('animal')) return 'animals kind';
        if (rule.kind === 'animal') {
          if (r.promptKey !== 'p.animal' || r.params.animal !== rule.value) return 'animal prompt';
          if (!(age <= 3 || ri === 0)) return 'p.animal after the warm-up';
          if (all.some(function (t) { return t.home !== 'farm'; })) return 'p.animal: farm animals';
        } else if (rule.kind === 'home') {
          if (r.promptKey !== 'p.farm' || rule.value !== 'farm' || age <= 3 || ri === 0) return 'farm prompt';
          var an = T.map(function (t) { return t.animal; });
          if (an.some(function (x, k) { return an.indexOf(x) !== k; })) return 'farm: different animals';
          if (O.home === 'farm' || O.nameValue !== O.home) return 'farm: the odd one';
        } else return 'animals rule';
        break;
      }
      case 'letters': {
        if (!kinds('tile') || rule.kind !== 'letter' || r.promptKey !== 'p.letters') return 'letters prompt';
        if (all.some(function (t) { return letterPool(r.lang, 'letters').indexOf(t.text) < 0; })) return 'letter pool';
        if (lookalike(rule.value, O.text)) return 'lookalike letters';
        break;
      }
      case 'lower': {
        if (!kinds('tile') || rule.kind !== 'letter' || r.promptKey !== 'p.lower') return 'lower prompt';
        if (all.some(function (t) { return t.text.length !== 1 || letterPool(r.lang, 'lower').indexOf(t.text.toUpperCase()) < 0; })) return 'lower pool';
        if (lookalike(rule.value, O.text)) return 'lower lookalike';
        if (T.length >= 2 && !(T.some(function (t) { return t.text === rule.value; }) && T.some(function (t) { return t.text === rule.value.toLowerCase(); }))) return 'lower: both cases';
        break;
      }
      case 'initial': {
        if (!all.every(function (t) { return t.kind === 'obj' || t.kind === 'animal'; }) || rule.kind !== 'initial' || r.promptKey !== 'p.initial') return 'initial prompt';
        for (i = 0; i < all.length; i++) { var Li = initialOf(all[i], r.lang, r.nameSrc); if (!Li || Li !== all[i].letter) return 'initial of ' + (all[i].obj || all[i].animal); }
        var tk = T.map(function (t) { return t.obj || t.animal; }), grpN = (initialGroups(r.lang, r.nameSrc)[rule.value] || []).length;
        if (tk.filter(function (x, k) { return tk.indexOf(x) === k; }).length < Math.min(2, T.length, grpN)) return 'initial: the friends are one picture';
        break;
      }
      case 'add': case 'sub': {
        var want = r.topic === 'add' ? 'sum' : 'diff', op = r.topic === 'add' ? '+' : MINUS;
        if (!kinds('tile') || rule.kind !== want || r.params.n !== rule.value) return r.topic + ' prompt';
        for (i = 0; i < all.length; i++) {
          var p = parseOp(all[i].text);
          if (!p || p.op !== op || p.a !== all[i].a || p.b !== all[i].b || p.b < 1) return 'tile ' + all[i].text;
          if (r.topic === 'add' && (p.a < 1 || p.a + p.b > (ADD_RANGE[age] || ADD_RANGE[6])[1] + 2)) return 'sum range';
          if (r.topic === 'sub' && (p.a > SUB_TOP || p.a - p.b < 0)) return 'difference range';
        }
        var tx = T.map(function (t) { return t.text; });
        if (tx.some(function (x, k) { return tx.indexOf(x) !== k; })) return r.topic + ': two tiles alike';
        break;
      }
      case 'oddeven': {
        if (!kinds('tile') || rule.kind !== 'parity' || r.params.parity !== rule.value) return 'oddeven prompt';
        var nn = all.map(function (t) { return +t.text; });
        if (nn.some(function (x, k) { return !(x >= 1 && x <= ODDEVEN_MAX) || nn.indexOf(x) !== k; })) return 'oddeven numbers';
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
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new FP.RNG(1);
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
        params = { color: a }; show = obj(rng.pick(FP.OBJECTS), a);
        ch = choicesFrom(rng, a, pickC || safe.slice(0, 1), nC, function (c) { return { kind: 'color', color: c }; }); break;
      }
      case 'shapes': {
        var col = rng.pick(colorPool(age)), shp = shapesFor(age); a = rng.pick(shp); params = { shape: a };
        var others = rng.shuffle(shp.filter(function (s) { return s !== a && !similarShapes(a, s); })), sel = [];
        others.forEach(function (s) { if (sel.length < nC - 1 && sel.every(function (q) { return !similarShapes(q, s); })) sel.push(s); });
        ch = choicesFrom(rng, a, sel, nC, function (s) { return block(s, col); }); break;
      }
      case 'size': {
        var ob = rng.pick(FP.OBJECTS), cz = rng.pick(colorPool(age)); a = rng.pick(['big', 'small']); params = { size: a };
        ch = choicesFrom(rng, a, ['big', 'small'], 2, function (s) { return sized(obj(ob, cz), s === 'big'); }); break;
      }
      case 'animals': {
        if (age <= 3) {
          pk = 'talk.who'; a = rng.pick(FARM); params = { animal: a }; show = animal(a);
          ch = choicesFrom(rng, a, FARM, nC, function (x) { return animal(x); });
        } else {
          var w = rng.pick(WILD); a = FP.ANIMALS[w]; params = { animal: w }; show = animal(w);
          var hs = FP.HOMES.filter(function (h) { return h !== a; }), pickH = ['farm'].concat(rng.shuffle(hs.filter(function (h) { return h !== 'farm'; }))).slice(0, nC - 1);
          ch = choicesFrom(rng, a, pickH, nC, function (h) { return { kind: 'home', home: h }; });
        }
        break;
      }
      case 'count': {
        var hi = { 3: 4, 4: 5, 5: 8, 6: 10, 7: 10 }[age]; a = rng.int(age <= 4 ? 1 : 2, hi); params = { n: a }; show = crate(a);
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
        var src = FP.I18N && typeof FP.I18N.name === 'function' ? 'i18n' : 'table', g = initialGroups(lang, src), cand = [];
        Object.keys(g).forEach(function (L) { g[L].forEach(function (q) { cand.push({ L: L, q: q }); }); });
        var pc = rng.pick(cand); a = pc.L;
        show = pc.q.kind === 'animal' ? animal(pc.q.value) : obj(pc.q.value, rng.pick(COLORS5)); show.letter = a;
        params = { letter: a, nameKind: pc.q.kind, nameValue: pc.q.value };
        var lp = (lang === 'vi' ? LETTER_POOL.vi : LETTER_POOL.en).split('').filter(function (x) { return x !== a; });
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
      default: throw new Error('FP.Content: unknown topic ' + topic);
    }
    return { topic: topic, promptKey: pk, params: params, show: show, choices: ch.choices, answer: ch.answer, answerId: ch.answer };
  }

  /** 4 chapter topics for a session. Without rng or `last`: FP.AGE_TOPICS (the first session). With both: chapter 1 rotates
   *  between the pool's two easiest topics (the one that did NOT open last time); chapters 2–4 = 3 of the others (preferring
   *  topics left out of `last`, so the left-out topic always comes back), in pool (difficulty) order. */
  function topicsFor(age, rng, last) {
    age = ageOf(age);
    last = Array.isArray(last) ? last : [];
    if (!rng || !last.length) return FP.AGE_TOPICS[age].slice();
    var pool = FP.AGE_POOLS[age].slice(), ord = function (a, b) { return pool.indexOf(a) - pool.indexOf(b); };
    var first = last[0] === pool[0] ? pool[1] : pool[0];
    var rest = pool.filter(function (t) { return t !== first; });
    var fresh = rng.shuffle(rest.filter(function (t) { return last.indexOf(t) < 0; }));
    var old = rng.shuffle(rest.filter(function (t) { return last.indexOf(t) >= 0; }));
    return [first].concat(fresh.concat(old).slice(0, 3).sort(ord));
  }

  FP.Content = {
    makeRound: makeRound, makeTalk: makeTalk, validate: validate, topicsFor: topicsFor, ruleHolds: ruleHolds, countFor: countFor,
    ageOf: ageOf, langOf: langOf, clash: clash, pairsFor: pairsFor, colorPool: colorPool, shapesFor: shapesFor, similarShapes: similarShapes,
    lookalike: lookalike, letterPool: letterPool, parityOf: parityOf, initialOf: initialOf, initialOfName: initialOfName, thingName: thingName,
    initialGroups: initialGroups, thingKey: thingKey, roundKey: roundKey, parseOp: parseOp, countPairOk: countPairOk, sameRule: sameRule,
    TOPICS: ALL_TOPICS, COLORS: COLORS, COLORS5: COLORS5, SHAPES3: SHAPES3, SHAPES4: SHAPES4, SIMILAR_SHAPES: SIMILAR_SHAPES, LOOKALIKE: LOOKALIKE,
    SMALL_PAIRS: SMALL_PAIRS, LETTER_POOL: LETTER_POOL, CLASH: CLASH, COLOR_SAFE_BELOW: COLOR_SAFE_BELOW, MAX_MEMBERS: MAX_MEMBERS,
    COUNT_MAX: COUNT_MAX, ADD_RANGE: ADD_RANGE, SUB_RANGE: SUB_RANGE, SUB_TOP: SUB_TOP, ODDEVEN_MAX: ODDEVEN_MAX, MINUS: MINUS,
    FARM: FARM, WILD: WILD
  };
})(window.FP = window.FP || {});
