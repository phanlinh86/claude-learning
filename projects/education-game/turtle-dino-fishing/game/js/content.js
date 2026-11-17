/* Tibo's Dino Lake Fishing — TL.PALETTE, TL.COLORS, TL.SHAPES, TL.GUESTS, TL.HOMES, TL.AGE_TOPICS, TL.AGE_POOLS,
 * TL.Content (pure + deterministic "catch the X" round generator; DESIGN §5.1, docs/MECHANICS.md §7)
 *
 *   TL.Content.makeRound(topic, { age, lang, rng, roundIndex, level, surprise, short?, usedKeys?, prevRule?, prevRuleRun?,
 *                                 usedTargets? })  → round   (self-checked with validate; retries; throws if impossible)
 *   TL.Content.makeTalk(topic, { age, lang, rng })  → talk
 *   TL.Content.validate(round)  → null | 'reason'
 *   TL.Content.topicsFor(age, rng?, lastTopics?)  → the 4 chapter topics (easiest first)
 *   TL.Content.matches(rule, thing, round?)  → does this thing answer the question
 *   TL.Content.countFor(age, roundIndex, level, short)  → fish in that round
 *
 * round = { topic, age, lang, roundIndex, level, short, surprise: null|'ptero'|'bronto'|'frog'|'fireflies', key, seed, nameSrc,
 *   members: [ { id 'f0'…, thing, target: bool } ]  (exactly ONE target), targetId, targetValue, promptKey, params,
 *   rule: { kind, value, nameKind, a?, b? } }
 * thing = { kind 'fish'|'bubble', color?, mark?, big?, animal?, home?, letter?, nameKind, nameValue }
 *   kind 'fish'  : color → a colour fish (body in the answer colour); no color → a neutral pearly fish.
 *                  mark = null | {shape, color} | {n} (spots) | {text} (letter / number / "3+2" / "7−4")
 *                  big: false → the little fish (drawn × 0.6); undefined / true → normal.
 *   kind 'bubble': a soap bubble with TL.GUESTS animal inside (+ home).
 *   nameKind / nameValue name the thing the way THIS round's question is about (wrong-tap feedback: "That one is …"):
 *   color/'red' · shape/'star' · size/'big'|'small' · number/3 (spots, or the number on the fish for add/sub) · animal/'fox' ·
 *   home/'sea' (the animal's home; thing.animal too) · letter/'B' (letters: as printed; lower: the small letter 'b';
 *   initial: the animal's initial, thing.letter) · parity/'odd' (oddeven; the number is mark.text)
 * rule kinds: color · shape · size ('big'|'small') · n · animal · home · letter · lower · initial · sum · diff · parity
 * Prompt keys / params (DESIGN §5.1): p.color {color} · p.shape {shape} · p.size {big} · p.count {n} · p.animal {animal} ·
 *   p.home {home} · p.letter {letter} · p.lower {letter} (the capital; fish carry small letters) · p.initial {letter} ·
 *   p.add {a, b} · p.sub {a, b} · p.oddeven {parity}
 * talk = { topic, promptKey, params, show: thing | null, choices: [{ id, thing, value }], answer (choice id), answerId }
 *   talk.colors {color} · talk.shapes {shape} · talk.size {size} · talk.count {n} · talk.animals {animal} (where does it live;
 *   choices home badges) · talk.who {animal} (age 3) · talk.letters {letter} · talk.lower {letter, small} ·
 *   talk.initial {letter, nameKind, nameValue} · talk.add {a, b} · talk.sub {a, b} · talk.oddeven {parity}
 *   choice things: a fish / bubble thing, or { kind:'color', color } · { kind:'number', n } · { kind:'home', home } · { kind:'size', big }
 */
(function (TL) {
  'use strict';

  // DESIGN §3 answer palette (exact hex)
  TL.PALETTE = {
    red:    { base: '#E84A4A', dark: '#A8282E', light: '#F7A0A0' },
    blue:   { base: '#3C8DE8', dark: '#1F5BA8', light: '#A6CCF5' },
    yellow: { base: '#FFD23F', dark: '#C99A12', light: '#FFEB9C' },
    green:  { base: '#4CC26B', dark: '#2A8343', light: '#A8E6B8' },
    orange: { base: '#FF9A2E', dark: '#C4650C', light: '#FFCB8E' },
    purple: { base: '#8E44AD', dark: '#6840A8', light: '#D2BDF3' },
    pink:   { base: '#FF8FC0', dark: '#C9558A', light: '#FFCCE2' }      // an answer colour from age 5
  };
  for (var pk in TL.PALETTE) TL.PALETTE[pk].fill = TL.PALETTE[pk].base;
  // DESIGN §3 neutral (non-answer) colours
  TL.NEUTRAL_FISH = { body: '#FFF4DE', shade: '#E9D3AE', outline: '#B08E62', fin: '#F7CBA8', mark: '#5A3B26' };
  TL.LILY = { pad: '#9CC08A', edge: '#6F9361', petal: '#FFF8EE', gold: '#FFD86B' };
  TL.COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  var COLORS = TL.COLORS.slice(0, 6), COLORS5 = TL.COLORS.slice();
  TL.SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'oval', 'rect', 'diamond'];
  TL.GUESTS = { bunny: 'forest', fox: 'forest', deer: 'forest', squirrel: 'forest', owl: 'forest', raccoon: 'forest', mouse: 'forest',
    hedgehog: 'forest', penguin: 'ice', crab: 'sea', goldfish: 'sea', camel: 'desert', lion: 'savanna' };
  TL.ANIMALS = TL.GUESTS;   // alias (i18n)
  TL.HOMES = ['forest', 'sea', 'ice', 'desert', 'savanna'];
  TL.MEMBER_KINDS = ['fish', 'bubble'];
  // goldfish: a freshwater pet and a FISH — never a bubble friend here (a fish in a bubble among fish, and its "sea" badge would
  // teach a wrong fact); it stays in TL.GUESTS for the shared art / i18n tables.
  var FRIENDS = Object.keys(TL.GUESTS).filter(function (a) { return a !== 'goldfish'; });
  var FOREST = FRIENDS.filter(function (a) { return TL.GUESTS[a] === 'forest'; });
  var HOMES_AT = { 4: ['sea', 'ice', 'forest'], 5: TL.HOMES.slice() };

  TL.AGE_TOPICS = {
    3: ['colors', 'shapes', 'size', 'animals'],
    4: ['colors', 'shapes', 'count', 'animals'],
    5: ['shapes', 'count', 'letters', 'animals'],
    6: ['lower', 'initial', 'add', 'count'],
    7: ['initial', 'add', 'sub', 'oddeven']
  };
  /* Every age has a POOL of 5 topics in difficulty order; a session plays 4 of them (rotating between sessions). */
  TL.AGE_POOLS = {
    3: ['colors', 'shapes', 'size', 'animals', 'count'],
    4: ['colors', 'size', 'shapes', 'count', 'animals'],
    5: ['colors', 'shapes', 'count', 'letters', 'animals'],
    6: ['letters', 'lower', 'initial', 'add', 'count'],
    7: ['count', 'initial', 'add', 'sub', 'oddeven']
  };
  var ALL_TOPICS = ['colors', 'shapes', 'size', 'animals', 'count', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];

  // ---- tables (DESIGN §5.1)
  var MAX_MEMBERS = 5, MIN_MEMBERS = 2;
  var SHAPES3 = ['circle', 'square', 'triangle', 'star', 'heart'];   // ages 3–4
  var SIMILAR_SHAPES = [['square', 'rect'], ['circle', 'oval'], ['square', 'diamond'], ['heart', 'circle'], ['oval', 'rect'], ['rect', 'diamond']];
  var FAR_SHAPES = { circle: ['triangle', 'star', 'square'], square: ['star', 'triangle', 'heart'], triangle: ['circle', 'heart', 'square'],
    star: ['circle', 'square'], heart: ['square', 'triangle'] };   // warm-up pairs: very different outlines
  var COLOR_SET = { 3: 2, 4: 3, 5: 4, 6: 4, 7: 4 };                  // distinct colours in a colours round
  var LETTER_POOL = { en: 'ABCDEFGHIKLMNOPRSTUW', vi: 'ABCDEGHIKLMNOPSTUVXY' };
  var LOOKALIKE = ['EF', 'OQCG', 'MNW', 'PRB', 'ILT', 'UV'];          // capitals that never meet in one round
  var LOWER_SKIP = 'IL';                                              // capital I / small l look alike: never in lower rounds
  var SMALL_PAIRS = ['bdpq', 'nu', 'mw', 'co', 'il'];                 // small letters that never meet in one round
  var COUNT_MAX = { 3: 4, 4: 5, 5: 10, 6: 12, 7: 12 };
  var ADD_TOP = { 6: 10, 7: 20 }, SUB_TOP = 10, ODDEVEN_MAX = 20, NUM_TOP = 20;
  var MINUS = '−';
  var VI_DIGRAPHS = ['ngh', 'ng', 'nh', 'ch', 'gh', 'kh', 'ph', 'th', 'tr', 'gi', 'qu'];
  var VI_ALPHABET = ['A', 'Ă', 'Â', 'B', 'C', 'D', 'Đ', 'E', 'Ê', 'G', 'H', 'I', 'K', 'L', 'M', 'N', 'O', 'Ô', 'Ơ', 'P', 'Q', 'R', 'S', 'T', 'U', 'Ư', 'V', 'X', 'Y'];
  /* Fallback names for 'initial' when TL.I18N.name is not loaded (headless tests). */
  TL.THING_NAMES = {
    en: { bunny: 'bunny', fox: 'fox', deer: 'deer', squirrel: 'squirrel', owl: 'owl', raccoon: 'raccoon', mouse: 'mouse', hedgehog: 'hedgehog',
      penguin: 'penguin', crab: 'crab', goldfish: 'goldfish', camel: 'camel', lion: 'lion' },
    vi: { bunny: 'con thỏ', fox: 'con cáo', deer: 'con nai', squirrel: 'con sóc', owl: 'con cú', raccoon: 'con gấu mèo', mouse: 'con chuột',
      hedgehog: 'con nhím', penguin: 'chim cánh cụt', crab: 'con cua', goldfish: 'con cá vàng', camel: 'con lạc đà', lion: 'con sư tử' }
  };
  var CLASSIFIERS = { en: ['the', 'a', 'an'], vi: ['con', 'cái', 'quả', 'chiếc'] };

  function langOf(l) { return l === 'vi' ? 'vi' : 'en'; }
  function ageOf(a) { a = Math.round(+a || 4); return a < 3 ? 3 : a > 7 ? 7 : a; }
  function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }
  function parityOf(n) { return n % 2 ? 'odd' : 'even'; }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }

  // ---------------- names → initials ('initial' topic) ----------------
  function thingName(value, lang, src) {
    lang = langOf(lang);
    if (src !== 'table' && TL.I18N && typeof TL.I18N.name === 'function') {
      try {
        var s = TL.I18N.name(lang, 'animal', value);
        if (typeof s === 'string' && s.trim() && s.indexOf('{') < 0 && s !== String(value) + '?') return s;
      } catch (e) { /* fall back */ }
    }
    return TL.THING_NAMES[lang][value] || null;
  }
  /** The initial letter of a name (classifier dropped; VI tone marks dropped, Ă Â Ê Ô Ơ Ư Đ kept; VI digraph words → null). */
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
  function initialOf(thing, lang, src) {
    if (!thing || thing.kind !== 'bubble') return null;
    return initialOfName(thingName(thing.animal, lang, src), lang);
  }
  /** { letter: [animal…] } for 'initial' in this language (goldfish excluded). */
  function initialGroups(lang, src) {
    var g = {};
    FRIENDS.forEach(function (a) { var L = initialOf({ kind: 'bubble', animal: a }, lang, src); if (L) (g[L] = g[L] || []).push(a); });
    return g;
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
  function shapesFor(age) { return age <= 4 ? SHAPES3.slice() : TL.SHAPES.slice(); }
  function similarShapes(a, b) { for (var i = 0; i < SIMILAR_SHAPES.length; i++) { var p = SIMILAR_SHAPES[i]; if ((p[0] === a && p[1] === b) || (p[0] === b && p[1] === a)) return true; } return false; }
  function lookalike(a, b) {
    a = String(a); b = String(b);
    if (a.toUpperCase() === b.toUpperCase()) return true;
    var A = a.toUpperCase(), B = b.toUpperCase();
    for (var i = 0; i < LOOKALIKE.length; i++) if (LOOKALIKE[i].indexOf(A) >= 0 && LOOKALIKE[i].indexOf(B) >= 0) return true;
    var x = a.toLowerCase(), y = b.toLowerCase();
    for (i = 0; i < SMALL_PAIRS.length; i++) if (SMALL_PAIRS[i].indexOf(x) >= 0 && SMALL_PAIRS[i].indexOf(y) >= 0) return true;
    return false;
  }
  function letterPool(lang, topic) {
    var P = LETTER_POOL[langOf(lang)].split('');
    return topic === 'lower' ? P.filter(function (c) { return LOWER_SKIP.indexOf(c) < 0; }) : P;
  }
  /** A clash-free colour set of size k drawn from the age's pool (below age 5 no CVD pair, no pink). */
  function colorSet(rng, age, k) {
    var pool = colorPool(age), pairs = pairsFor(age);
    for (var t = 0; t < 300; t++) {
      var s = rng.sample(pool, k);
      if (!clash(s, pairs)) return s;
    }
    throw new Error('no clash-free colour set of ' + k);
  }

  // ---------------- things ----------------
  function fishC(c) { return { kind: 'fish', color: c, mark: null, nameKind: 'color', nameValue: c }; }
  function fishShape(s, c) { return { kind: 'fish', mark: { shape: s, color: c }, nameKind: 'shape', nameValue: s }; }
  function fishSpots(n) { return { kind: 'fish', mark: { n: n }, nameKind: 'number', nameValue: n }; }
  function fishText(text, nameKind, nameValue) { return { kind: 'fish', mark: { text: String(text) }, nameKind: nameKind, nameValue: nameValue }; }
  function fishNum(n, kind) { return kind === 'parity' ? fishText(n, 'parity', parityOf(n)) : fishText(n, 'number', n); }
  function bubble(a) { return { kind: 'bubble', animal: a, home: TL.GUESTS[a], nameKind: 'animal', nameValue: a }; }
  function homeBubble(a) { var t = bubble(a); t.nameKind = 'home'; t.nameValue = t.home; return t; }
  function sized(t, big) { t.big = !!big; t.nameKind = 'size'; t.nameValue = big ? 'big' : 'small'; return t; }
  function markKey(m) { return !m ? '' : m.shape ? 's' + m.shape + '/' + (m.color || '') : m.n !== undefined ? 'n' + m.n : 't' + m.text; }
  function thingKey(t) { return [t.kind, t.color || '', markKey(t.mark), t.animal || '', t.big === false ? 's' : ''].join(':'); }
  function roundKey(r) {
    var tg = null, rest = [];
    r.members.forEach(function (m) { if (m.target) tg = thingKey(m.thing); else rest.push(thingKey(m.thing)); });
    return r.topic + '|' + tg + '|' + rest.sort().join(',');
  }
  function textOf(t) { return t && t.mark && t.mark.text !== undefined ? String(t.mark.text) : null; }
  function numOf(t) { var s = textOf(t); return s !== null && /^\d+$/.test(s) ? +s : null; }

  /** Fish per round (DESIGN §5.1): round 0 (each chapter's warm-up) 2; then age 3: 2, 3, 3 · 4: 3, 3, 4 · 5: 4, 4, 5 · 6+: 4, 5, 5.
   *  A short round (the chapter runs long) has ≤ 2 fish at ages ≤ 4, ≤ 3 from 5. */
  function countFor(age, ri, level, short) {
    age = ageOf(age);
    var T = age <= 3 ? [2, 2, 3, 3] : age === 4 ? [2, 3, 3, 4] : age === 5 ? [2, 4, 4, 5] : [2, 4, 5, 5];
    var n = T[Math.min(Math.max(0, ri | 0), 3)];
    if (short && ri > 0) n = Math.min(n, age <= 4 ? 2 : 3);
    return n;
  }

  // ---------------- the rule ----------------
  /** Does `t` answer the question `rule`? (`r` gives lang / nameSrc for 'initial'.) */
  function matches(rule, t, r) {
    if (!rule || !t) return false;
    var v = rule.value, mk = t.mark || {};
    switch (rule.kind) {
      case 'color': return t.kind === 'fish' && t.color === v;
      case 'shape': return t.kind === 'fish' && mk.shape === v;
      case 'size': return t.kind === 'fish' && (t.big === false ? 'small' : 'big') === v;
      case 'n': return t.kind === 'fish' && mk.n === v;
      case 'animal': return t.kind === 'bubble' && t.animal === v;
      case 'home': return t.kind === 'bubble' && TL.GUESTS[t.animal] === v;
      case 'letter': return textOf(t) === String(v);
      case 'lower': return textOf(t) === String(v).toLowerCase();
      case 'initial': return initialOf(t, r ? r.lang : 'en', r ? r.nameSrc : undefined) === v;
      case 'sum': case 'diff': return numOf(t) === v;
      case 'parity': { var n = numOf(t); return n !== null && parityOf(n) === v; }
    }
    return false;
  }
  function R(kind, value, nameKind) { return { kind: kind, value: value, nameKind: nameKind }; }

  // ---------------- rounds ----------------
  /** {rule, promptKey, params, target: thing, others: [thing]} for one round of n fish (k = n − 1 others), or throws. */
  function buildSet(topic, age, lang, rng, ri, k, src, usedT) {
    var others = [], target, rule, pk, pr, i, tv = null;
    usedT = usedT || [];
    var fresh = function (list) { var f = list.filter(function (x) { return usedT.indexOf(x) < 0; }); return f.length ? f : list; };
    switch (topic) {
      case 'colors': {
        var set = colorSet(rng, age, Math.max(2, Math.min(COLOR_SET[age] || 4, k + 1)));
        var tc = rng.pick(fresh(set)), oc = rng.shuffle(set.filter(function (x) { return x !== tc; }));
        for (i = 0; i < k; i++) others.push(fishC(oc[i % oc.length]));
        target = fishC(tc); tv = tc;
        rule = R('color', tc, 'color'); pk = 'p.color'; pr = { color: tc };
        break;
      }
      case 'shapes': {
        var shp = shapesFor(age), s, os;
        if (ri === 0 && FAR_SHAPES[shp[0]]) { s = rng.pick(fresh(Object.keys(FAR_SHAPES))); os = FAR_SHAPES[s].slice(); }
        else { s = rng.pick(fresh(shp)); os = shp.filter(function (x) { return x !== s && !similarShapes(s, x); }); }
        os = rng.shuffle(os);
        var mcs = age < COLOR_SAFE_BELOW ? [rng.pick(colorPool(age))] : rng.sample(COLORS5, k + 1);   // one mark colour ≤ 4, mixed at 5+
        target = fishShape(s, mcs[0]); tv = s;
        for (i = 0; i < k; i++) others.push(fishShape(os[i % os.length], mcs[(i + 1) % mcs.length]));
        rule = R('shape', s, 'shape'); pk = 'p.shape'; pr = { shape: s };
        break;
      }
      case 'size': {
        // even rounds: the one LITTLE fish among big ones; odd rounds: the one BIG among little ones (same colour fish)
        var big = ri % 2 === 1, col = rng.pick(colorPool(age));
        for (i = 0; i < k; i++) others.push(sized(fishC(col), !big));
        target = sized(fishC(col), big); tv = big ? 'big' : 'small';
        rule = R('size', big ? 'big' : 'small', 'size'); pk = 'p.size'; pr = { big: big };
        break;
      }
      case 'count': {
        var hi = COUNT_MAX[age] || 5, tn = null, ns = null;
        for (var t = 0; t < 400 && !ns; t++) {
          tn = rng.int(1, ri === 0 ? Math.min(hi, age <= 5 ? 4 : 6) : hi);
          var cand = rng.shuffle(range(1, ri === 0 ? Math.min(hi, age <= 5 ? 4 : 6) : hi).filter(function (x) { return countPairOk(tn, x, age, ri); }));
          if (cand.length >= k) ns = cand.slice(0, k);
        }
        if (!ns) throw new Error('no count set');
        target = fishSpots(tn); tv = tn;
        ns.forEach(function (x) { others.push(fishSpots(x)); });
        rule = R('n', tn, 'number'); pk = 'p.count'; pr = { n: tn };
        break;
      }
      case 'animals': {
        if (age <= 3 || ri === 0) {
          var as = rng.sample(age <= 3 ? FOREST.concat(['penguin', 'crab', 'lion']) : FRIENDS, k + 1);
          var ta = rng.pick(fresh(as));
          target = bubble(ta); tv = ta;
          as.filter(function (x) { return x !== ta; }).slice(0, k).forEach(function (x) { others.push(bubble(x)); });
          rule = R('animal', ta, 'animal'); pk = 'p.animal'; pr = { animal: ta };
        } else {
          var homes = HOMES_AT[age >= 5 ? 5 : 4], ok = homes.filter(function (h) {
            return FRIENDS.filter(function (a) { return TL.GUESTS[a] !== h && homes.indexOf(TL.GUESTS[a]) >= 0; }).length >= k;
          });
          var hh = rng.pick(fresh(ok)), ins = FRIENDS.filter(function (a) { return TL.GUESTS[a] === hh; });
          var outs = rng.shuffle(FRIENDS.filter(function (a) { return TL.GUESTS[a] !== hh && homes.indexOf(TL.GUESTS[a]) >= 0; }));
          // prefer friends from different homes (a forest round shows the penguin AND the crab, not two forest friends)
          var byHome = {}, picks = [];
          outs.forEach(function (a) { (byHome[TL.GUESTS[a]] = byHome[TL.GUESTS[a]] || []).push(a); });
          var hk = rng.shuffle(Object.keys(byHome));
          for (var round = 0; picks.length < k && round < 10; round++) hk.forEach(function (h) { var q = byHome[h][round]; if (q && picks.length < k) picks.push(q); });
          target = homeBubble(rng.pick(ins)); tv = hh;
          picks.forEach(function (a) { others.push(homeBubble(a)); });
          rule = R('home', hh, 'home'); pk = 'p.home'; pr = { home: hh };
        }
        break;
      }
      case 'letters': case 'lower': {
        var lower = topic === 'lower', pool = letterPool(lang, topic);
        var L0 = rng.pick(fresh(pool)), rest = rng.shuffle(pool.filter(function (x) { return !lookalike(L0, x); })), sel = [];
        rest.forEach(function (x) { if (sel.length < k && sel.every(function (q) { return !lookalike(q, x); })) sel.push(x); });
        for (i = 0; sel.length < k && i < rest.length; i++) if (sel.indexOf(rest[i]) < 0) sel.push(rest[i]);
        var show = function (c) { return lower ? c.toLowerCase() : c; };
        target = fishText(show(L0), 'letter', show(L0)); tv = L0;
        sel.forEach(function (x) { others.push(fishText(show(x), 'letter', show(x))); });
        rule = R(lower ? 'lower' : 'letter', L0, 'letter'); pk = lower ? 'p.lower' : 'p.letter'; pr = { letter: L0 };
        break;
      }
      case 'initial': {
        var g = initialGroups(lang, src), letters = Object.keys(g);
        if (letters.length < 2) throw new Error('no initial groups');
        var IL = rng.pick(fresh(letters)), ia = rng.pick(g[IL]);
        var mk = function (a, L) { var b = bubble(a); b.letter = L; b.nameKind = 'letter'; b.nameValue = L; return b; };
        target = mk(ia, IL); tv = IL;
        var oL = rng.shuffle(letters.filter(function (x) { return x !== IL; })), pickA = [];
        for (i = 0; pickA.length < k && i < 3 * k + 10; i++) {
          var LL = oL[i % oL.length], aa = rng.pick(g[LL]);
          if (pickA.every(function (q) { return q.a !== aa; })) pickA.push({ a: aa, L: LL });
        }
        if (pickA.length < k) throw new Error('not enough initial friends');
        pickA.forEach(function (q) { others.push(mk(q.a, q.L)); });
        rule = R('initial', IL, 'letter'); pk = 'p.initial'; pr = { letter: IL };
        break;
      }
      case 'add': case 'sub': {
        var add = topic === 'add', top = add ? (ADD_TOP[age] || ADD_TOP[6]) : SUB_TOP, a, b, n;
        if (add) { var hiS = ri === 0 ? Math.min(top, age >= 7 ? 10 : 6) : top; n = rng.int(age >= 7 && ri > 0 ? 6 : 3, hiS); a = rng.int(1, n - 1); b = n - a; }
        else { n = rng.int(1, ri === 0 ? 4 : 7); a = rng.int(n + 1, Math.min(SUB_TOP, n + (ri === 0 ? 4 : 9))); b = a - n; }
        var near = rng.shuffle(range(Math.max(add ? 2 : 1, n - 4), Math.min(add ? top + 2 : SUB_TOP, n + 4)).filter(function (x) { return x !== n; }));
        if (near.length < k) near = near.concat(rng.shuffle(range(1, NUM_TOP).filter(function (x) { return x !== n && near.indexOf(x) < 0; })));
        target = fishNum(n); tv = n;
        near.slice(0, k).forEach(function (x) { others.push(fishNum(x)); });
        rule = R(add ? 'sum' : 'diff', n, 'number'); rule.a = a; rule.b = b;
        pk = add ? 'p.add' : 'p.sub'; pr = { a: a, b: b };
        break;
      }
      case 'oddeven': {
        var par = rng.pick(['odd', 'even']), topN = ri === 0 ? 10 : ODDEVEN_MAX;
        var tnum = rng.pick(range(1, topN).filter(function (x) { return parityOf(x) === par; }));
        target = fishNum(tnum, 'parity'); tv = par;
        rng.sample(range(1, topN).filter(function (x) { return parityOf(x) !== par; }), k).forEach(function (x) { others.push(fishNum(x, 'parity')); });
        rule = R('parity', par, 'parity'); pk = 'p.oddeven'; pr = { parity: par };
        break;
      }
      default: throw new Error('TL.Content: unknown topic ' + topic);
    }
    return { rule: rule, promptKey: pk, params: pr, target: target, others: others, targetValue: tv };
  }
  /** Spot counts in one round: all different; warm-up (and ages ≤ 4) target vs other gap ≥ 2 in the warm-up; from 6 spots a gap ≥ 2. */
  function countPairOk(a, b, age, ri) {
    var hi = COUNT_MAX[ageOf(age)] || 5, g = Math.abs(a - b);
    if (a < 1 || b < 1 || a > hi || b > hi || g < 1) return false;
    if (ri === 0) return g >= 2;
    return Math.max(a, b) >= 6 ? g >= 2 : true;
  }

  function buildRound(topic, age, lang, rng, ri, level, short, src, usedT) {
    var n = countFor(age, ri, level, short), set = buildSet(topic, age, lang, rng, ri, n - 1, src, usedT);
    var things = rng.shuffle([set.target].concat(set.others)), members = [], tid = null;
    things.forEach(function (t, i) { var tg = t === set.target; members.push({ id: 'f' + i, thing: t, target: tg }); if (tg) tid = 'f' + i; });
    var r = { topic: topic, age: age, lang: lang, roundIndex: ri, level: level, short: !!short, surprise: null, nameSrc: src,
      members: members, targetId: tid, targetValue: set.targetValue, promptKey: set.promptKey, params: set.params, rule: set.rule };
    r.key = roundKey(r);
    return r;
  }

  /** makeRound(topic, o) → round. usedKeys: never the same set twice in a chapter; prevRule (+ prevRuleRun): the asked value differs
   *  from the last round's (parity at most 2 in a row); usedTargets: asked values met this chapter are avoided when possible. */
  function makeRound(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new TL.RNG(1), ri = o.roundIndex || 0;
    var level = o.level === undefined || o.level === null ? 1 : o.level | 0;
    if (ALL_TOPICS.indexOf(topic) < 0) throw new Error('TL.Content: unknown topic ' + topic);
    var used = (o.usedKeys || []).slice();
    var src = TL.I18N && typeof TL.I18N.name === 'function' ? 'i18n' : 'table';
    if (topic === 'initial' && src === 'i18n' && Object.keys(initialGroups(lang, src)).length < 4) src = 'table';
    var r = null, err = null;
    for (var attempt = 0; attempt < 150; attempt++) {
      try {
        r = buildRound(topic, age, lang, rng, ri, level, !!o.short, src, attempt < 60 ? (o.usedTargets || []) : []);
        err = validate(r);
        if (!err && attempt < 100 && used.indexOf(r.key) >= 0) err = 'the same set as an earlier round';
        if (!err && attempt < 80 && sameRule(r, o.prevRule, o.prevRuleRun)) err = 'the same ask as the previous round';
      } catch (e) { r = null; err = e.message; }
      if (!err) break;
    }
    if (err) throw new Error('TL.Content: invalid round (' + topic + ', age ' + age + ', round ' + ri + '): ' + err);
    r.surprise = ri === 0 ? null : (o.surprise || null);
    r.seed = (rng.next() * 4294967296) >>> 0;
    return r;
  }
  function sameRule(r, prev, run) {
    if (!prev || prev.kind !== r.rule.kind) return false;
    if (r.rule.kind === 'size') return false;   // two values only, they alternate by round
    if (String(prev.value) !== String(r.rule.value)) return false;
    return r.rule.kind === 'parity' ? (run || 1) >= 2 : true;
  }

  // ---------------- self-check ----------------
  function thingOk(t) {
    if (!t || TL.MEMBER_KINDS.indexOf(t.kind) < 0) return 'member kind';
    if (!t.nameKind || t.nameValue === undefined || t.nameValue === null) return 'member name';
    if (t.kind === 'bubble') { if (!TL.GUESTS[t.animal] || t.home !== TL.GUESTS[t.animal] || t.animal === 'goldfish') return 'bubble'; return null; }
    if (t.color !== undefined && !TL.PALETTE[t.color]) return 'fish colour';
    var m = t.mark;
    if (m) {
      if (m.shape !== undefined && (TL.SHAPES.indexOf(m.shape) < 0 || !TL.PALETTE[m.color])) return 'shape mark';
      if (m.n !== undefined && !(m.n >= 1 && m.n <= 12 && m.n === Math.floor(m.n))) return 'spots ' + m.n;
      if (m.text !== undefined && (!String(m.text).length || String(m.text).length > 5)) return 'text mark';
      if (m.shape === undefined && m.n === undefined && m.text === undefined) return 'empty mark';
    }
    if (t.big !== undefined && typeof t.big !== 'boolean') return 'big';
    return null;
  }
  /** null when the round follows every rule (DESIGN §5.1 / §3), else the reason. Independent of the generator's bookkeeping. */
  function validate(r) {
    if (!r || !r.members || !r.rule) return 'no members / rule';
    var ms = r.members, n = ms.length, age = r.age, ri = r.roundIndex, i, e;
    if (n < MIN_MEMBERS || n > MAX_MEMBERS) return n + ' members';
    if (n !== countFor(age, ri, r.level, r.short)) return n + ' members (want ' + countFor(age, ri, r.level, r.short) + ')';
    var ids = {}, tg = [];
    for (i = 0; i < n; i++) {
      var m = ms[i];
      if (!m.id || ids[m.id]) return 'member id ' + m.id;
      ids[m.id] = 1;
      if ((e = thingOk(m.thing))) return e;
      if (m.target) tg.push(m);
    }
    if (tg.length !== 1) return tg.length + ' targets';
    var T = tg[0], rest = ms.filter(function (q) { return !q.target; }), rule = r.rule;
    if (r.targetId !== T.id) return 'targetId';
    if (!matches(rule, T.thing, r)) return 'the target does not match ' + rule.kind + '=' + rule.value;
    for (i = 0; i < rest.length; i++) if (matches(rule, rest[i].thing, r)) return rest[i].id + ' also matches ' + rule.kind + '=' + rule.value;
    if (!r.promptKey || !r.params) return 'prompt';
    var all = ms.map(function (q) { return q.thing; }), O = rest.map(function (q) { return q.thing; }), X = T.thing;
    function kinds(k) { return all.every(function (t) { return t.kind === k; }); }
    var cs = [];
    all.forEach(function (t) { [t.color, t.mark && t.mark.color].forEach(function (c) { if (c && cs.indexOf(c) < 0) cs.push(c); }); });
    if (age < COLOR_SAFE_BELOW && (clash(cs, CLASH) || cs.indexOf('pink') >= 0)) return 'colour clash ' + cs.join('+');
    switch (r.topic) {
      case 'colors':
        if (!kinds('fish') || rule.kind !== 'color' || r.promptKey !== 'p.color' || r.params.color !== rule.value) return 'colors prompt / kind';
        if (all.some(function (t) { return !t.color || t.mark; })) return 'colors: plain colour fish';
        if (cs.length > Math.max(2, COLOR_SET[age] || 4)) return 'colors: ' + cs.length + ' colours at age ' + age;
        break;
      case 'shapes':
        if (!kinds('fish') || rule.kind !== 'shape' || r.promptKey !== 'p.shape' || r.params.shape !== rule.value) return 'shapes prompt / kind';
        if (all.some(function (t) { return t.color || !t.mark || !t.mark.shape || shapesFor(age).indexOf(t.mark.shape) < 0; })) return 'shape fish at age ' + age;
        if (O.some(function (t) { return similarShapes(rule.value, t.mark.shape); })) return 'confusable shapes';
        if (ri === 0 && FAR_SHAPES[rule.value] && O.some(function (t) { return FAR_SHAPES[rule.value].indexOf(t.mark.shape) < 0; })) return 'warm-up shapes not very different';
        if (age < COLOR_SAFE_BELOW && cs.length !== 1) return 'shapes: one mark colour';
        break;
      case 'size': {
        if (rule.kind !== 'size' || r.promptKey !== 'p.size' || r.params.big !== (rule.value === 'big')) return 'size prompt';
        if (!kinds('fish') || all.some(function (t) { return t.color !== X.color || t.mark; })) return 'size: one colour';
        var wantBig = rule.value === 'big';
        if ((X.big !== false) !== wantBig || O.some(function (t) { return (t.big !== false) === wantBig; })) return 'size: one ' + rule.value;
        break;
      }
      case 'count': {
        if (!kinds('fish') || rule.kind !== 'n' || r.params.n !== rule.value) return 'count prompt / kind';
        var cn = all.map(function (t) { return t.mark && t.mark.n; });
        if (cn.some(function (x, k) { return !(x >= 1) || cn.indexOf(x) !== k; })) return 'count: spot counts not distinct';
        for (i = 0; i < O.length; i++) if (!countPairOk(rule.value, O[i].mark.n, age, ri)) return 'count pair ' + rule.value + '/' + O[i].mark.n + ' at age ' + age;
        break;
      }
      case 'animals': {
        if (!kinds('bubble')) return 'animals kind';
        var an = all.map(function (t) { return t.animal; });
        if (an.some(function (x, k) { return an.indexOf(x) !== k; })) return 'animals: two alike';
        if (rule.kind === 'animal') {
          if (r.promptKey !== 'p.animal' || r.params.animal !== rule.value || !(age <= 3 || ri === 0)) return 'animal prompt';
        } else if (rule.kind === 'home') {
          if (r.promptKey !== 'p.home' || r.params.home !== rule.value || age <= 3 || ri === 0) return 'home prompt';
          var hs = HOMES_AT[age >= 5 ? 5 : 4];
          if (all.some(function (t) { return hs.indexOf(t.home) < 0 || t.nameKind !== 'home' || t.nameValue !== t.home; })) return 'home not taught at age ' + age;
        } else return 'animals rule';
        break;
      }
      case 'letters': case 'lower': {
        var lw = r.topic === 'lower';
        if (!kinds('fish') || rule.kind !== (lw ? 'lower' : 'letter') || r.promptKey !== (lw ? 'p.lower' : 'p.letter') || r.params.letter !== rule.value) return r.topic + ' prompt';
        var pool = letterPool(r.lang, r.topic), tx = all.map(textOf);
        if (tx.some(function (s) { return !s || s.length !== 1 || pool.indexOf(s.toUpperCase()) < 0 || (lw ? s !== s.toLowerCase() : s !== s.toUpperCase()); })) return r.topic + ' pool / case';
        if (lw && tx.some(function (s) { return s === 'i' || s === 'l'; })) return 'lower: i / l';
        if (tx.some(function (s, k) { return tx.indexOf(s) !== k; })) return r.topic + ': two alike';
        if (O.some(function (t) { return lookalike(rule.value, textOf(t)); })) return r.topic + ' lookalike';
        break;
      }
      case 'initial': {
        if (!kinds('bubble') || rule.kind !== 'initial' || r.promptKey !== 'p.initial') return 'initial prompt';
        for (i = 0; i < all.length; i++) { var Li = initialOf(all[i], r.lang, r.nameSrc); if (!Li || Li !== all[i].letter) return 'initial of ' + all[i].animal; }
        var ia = all.map(function (t) { return t.animal; });
        if (ia.some(function (x, k) { return ia.indexOf(x) !== k; })) return 'initial: two alike';
        break;
      }
      case 'add': case 'sub': {
        var add = r.topic === 'add';
        if (!kinds('fish') || rule.kind !== (add ? 'sum' : 'diff') || r.params.a !== rule.a || r.params.b !== rule.b) return r.topic + ' prompt';
        if ((add ? rule.a + rule.b : rule.a - rule.b) !== rule.value || rule.b < 1 || rule.a < 1) return r.topic + ' sum';
        if (add && rule.value > (ADD_TOP[age] || ADD_TOP[6])) return 'sum range';
        if (!add && (rule.a > SUB_TOP || rule.value < 1)) return 'difference range';
        var nn = all.map(numOf);
        if (nn.some(function (x, k) { return x === null || x < 0 || x > NUM_TOP || nn.indexOf(x) !== k; })) return r.topic + ' numbers';
        break;
      }
      case 'oddeven': {
        if (!kinds('fish') || rule.kind !== 'parity' || r.params.parity !== rule.value) return 'oddeven prompt';
        var on = all.map(numOf);
        if (on.some(function (x, k) { return !(x >= 1 && x <= ODDEVEN_MAX) || on.indexOf(x) !== k; })) return 'oddeven numbers';
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
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new TL.RNG(1);
    var show = null, params = {}, ch, a, nC = age <= 3 ? 2 : 3, pk = 'talk.' + topic;
    switch (topic) {
      case 'colors': {
        var set = colorSet(rng, age, nC); a = set[0]; params = { color: a }; show = fishC(a);
        ch = choicesFrom(rng, a, set, nC, function (c) { return { kind: 'color', color: c }; }); break;
      }
      case 'shapes': {
        var col = rng.pick(colorPool(age)), shp = shapesFor(age); a = rng.pick(shp); params = { shape: a };
        var others = rng.shuffle(shp.filter(function (s) { return s !== a && !similarShapes(a, s); })), sel = [];
        others.forEach(function (s) { if (sel.length < nC - 1 && sel.every(function (q) { return !similarShapes(q, s); })) sel.push(s); });
        ch = choicesFrom(rng, a, sel, nC, function (s) { return fishShape(s, col); }); break;
      }
      case 'size': {
        var cz = rng.pick(colorPool(age)); a = rng.pick(['big', 'small']); params = { size: a };
        ch = choicesFrom(rng, a, ['big', 'small'], 2, function (s) { return { kind: 'size', big: s === 'big', thing: sized(fishC(cz), s === 'big') }; }); break;
      }
      case 'animals': {
        if (age <= 3) {
          pk = 'talk.who'; a = rng.pick(FOREST.concat(['penguin', 'crab', 'lion'])); params = { animal: a }; show = bubble(a);
          ch = choicesFrom(rng, a, FOREST.concat(['penguin', 'crab', 'lion']), nC, function (x) { return bubble(x); });
        } else {
          var hs0 = HOMES_AT[age >= 5 ? 5 : 4], w = rng.pick(FRIENDS.filter(function (q) { return hs0.indexOf(TL.GUESTS[q]) >= 0; }));
          a = TL.GUESTS[w]; params = { animal: w }; show = bubble(w);
          ch = choicesFrom(rng, a, hs0, nC, function (h) { return { kind: 'home', home: h }; });
        }
        break;
      }
      case 'count': {
        var hi = { 3: 4, 4: 5, 5: 8, 6: 10, 7: 10 }[age]; a = rng.int(age <= 4 ? 1 : 2, hi); params = { n: a }; show = fishSpots(a);
        var near = range(Math.max(1, a - 2), Math.min(age <= 4 ? 5 : 12, a + 2)).filter(function (x) { return x !== a; });
        ch = choicesFrom(rng, a, near, nC, function (x) { return { kind: 'number', n: x }; }); break;
      }
      case 'letters': case 'lower': {
        var P = letterPool(lang, topic); a = rng.pick(P);
        var Pl = P.filter(function (x) { return !lookalike(a, x); });
        if (topic === 'lower') { params = { letter: a, small: a.toLowerCase() }; show = fishText(a, 'letter', a); }
        else params = { letter: a };
        ch = choicesFrom(rng, a, Pl, 3, function (x) { var s = topic === 'lower' ? x.toLowerCase() : x; return fishText(s, 'letter', s); }); break;
      }
      case 'initial': {
        var src = TL.I18N && typeof TL.I18N.name === 'function' ? 'i18n' : 'table', g = initialGroups(lang, src), cand = [];
        if (Object.keys(g).length < 3) g = initialGroups(lang, 'table');
        Object.keys(g).forEach(function (L) { g[L].forEach(function (q) { cand.push({ L: L, q: q }); }); });
        var pc = rng.pick(cand); a = pc.L;
        show = bubble(pc.q); show.letter = a;
        params = { letter: a, nameKind: 'animal', nameValue: pc.q };
        var lp = Object.keys(g).concat((lang === 'vi' ? LETTER_POOL.vi : LETTER_POOL.en).split('')).filter(function (x, i, arr) { return x !== a && arr.indexOf(x) === i && !lookalike(a, x); });
        ch = choicesFrom(rng, a, lp, 3, function (x) { return fishText(x, 'letter', x); }); break;
      }
      case 'add': {
        var top = ADD_TOP[age] || ADD_TOP[6], k;
        a = rng.int(age >= 7 ? 6 : 3, top); k = rng.int(1, a - 1); params = { a: k, b: a - k }; show = fishText(k + '+' + (a - k), 'number', a);
        ch = choicesFrom(rng, a, nearNums(a, 1, top + 2, rng), 3, function (x) { return { kind: 'number', n: x }; }); break;
      }
      case 'sub': {
        a = rng.int(1, 8); var kk = rng.int(1, SUB_TOP - a); params = { a: a + kk, b: kk }; show = fishText((a + kk) + MINUS + kk, 'number', a);
        ch = choicesFrom(rng, a, nearNums(a, 0, 10, rng), 3, function (x) { return { kind: 'number', n: x }; }); break;
      }
      case 'oddeven': {
        var par = rng.pick(['odd', 'even']); params = { parity: par };
        a = rng.pick(range(1, 20).filter(function (x) { return parityOf(x) === par; }));
        var oth = range(1, 20).filter(function (x) { return parityOf(x) !== par; });
        ch = choicesFrom(rng, a, oth, 3, function (x) { return fishNum(x, 'parity'); }); break;
      }
      default: throw new Error('TL.Content: unknown topic ' + topic);
    }
    return { topic: topic, promptKey: pk, params: params, show: show, choices: ch.choices, answer: ch.answer, answerId: ch.answer };
  }

  /** 4 chapter topics for a session. Without rng or `last`: TL.AGE_TOPICS (the first session). With both: chapter 1 rotates
   *  between the pool's two easiest topics (the one that did NOT open last time); chapters 2–4 = 3 of the others (preferring
   *  topics left out of `last`), in pool (difficulty) order. */
  function topicsFor(age, rng, last) {
    age = ageOf(age);
    last = Array.isArray(last) ? last : [];
    if (!rng || !last.length) return TL.AGE_TOPICS[age].slice();
    var pool = TL.AGE_POOLS[age].slice(), ord = function (a, b) { return pool.indexOf(a) - pool.indexOf(b); };
    var first = last[0] === pool[0] ? pool[1] : pool[0];
    var rest = pool.filter(function (t) { return t !== first; });
    var fresh = rng.shuffle(rest.filter(function (t) { return last.indexOf(t) < 0; }));
    var old = rng.shuffle(rest.filter(function (t) { return last.indexOf(t) >= 0; }));
    return [first].concat(fresh.concat(old).slice(0, 3).sort(ord));
  }

  TL.Content = {
    makeRound: makeRound, makeTalk: makeTalk, validate: validate, topicsFor: topicsFor, matches: matches, ruleHolds: matches, countFor: countFor,
    ageOf: ageOf, langOf: langOf, clash: clash, pairsFor: pairsFor, colorPool: colorPool, colorSet: colorSet, shapesFor: shapesFor,
    similarShapes: similarShapes, lookalike: lookalike, letterPool: letterPool, parityOf: parityOf, initialOf: initialOf,
    initialOfName: initialOfName, thingName: thingName, initialGroups: initialGroups, thingKey: thingKey, roundKey: roundKey,
    countPairOk: countPairOk, sameRule: sameRule, textOf: textOf, numOf: numOf, uniq: uniq,
    TOPICS: ALL_TOPICS, COLORS: COLORS, COLORS5: COLORS5, SHAPES3: SHAPES3, SIMILAR_SHAPES: SIMILAR_SHAPES, LOOKALIKE: LOOKALIKE,
    SMALL_PAIRS: SMALL_PAIRS, LETTER_POOL: LETTER_POOL, CLASH: CLASH, COLOR_SAFE_BELOW: COLOR_SAFE_BELOW, MAX_MEMBERS: MAX_MEMBERS,
    COUNT_MAX: COUNT_MAX, ADD_TOP: ADD_TOP, SUB_TOP: SUB_TOP, ODDEVEN_MAX: ODDEVEN_MAX, MINUS: MINUS, COLOR_SET: COLOR_SET,
    FOREST: FOREST, FRIENDS: FRIENDS, HOMES_AT: HOMES_AT, FAR_SHAPES: FAR_SHAPES
  };
})(window.TL = window.TL || {});
