/* Bim's Rainbow Rocket — RR.PALETTE, RR.ANIMALS, RR.SHAPES, RR.AGE_TOPICS, RR.WORDS, RR.Content (pure + deterministic; DESIGN §5.1)
 *
 *   RR.Content.makeRound(topic, { age, lang, rng, roundIndex, surprise, islands?, hops? }) → round
 *        islands / hops override the age tables (RR.CONFIG.islandsByAge / hopsPerRound, playtest tuning).
 *   RR.Content.makeTalk(topic,  { age, lang, rng }) → talk
 *   RR.Content.validate(round) → null | 'reason'   (self-check, called by makeRound: every hop has exactly one answer)
 *   RR.Content.matches(hop, token, lang) → bool    (independent re-derivation of "is this token what the prompt asks for")
 *   RR.Content.topicsFor(age, rng?, lastTopics?) → the 4 chapter topics
 *
 * round = { topic, age, lang, roundIndex, surprise, seed, hops:[ hop ] }
 * hop   = { promptKey:'p.<topic>' | 'p.countUp' | 'p.sound', params:{…}, answer /*index into tokens*\/, tokens:[ token ] }
 * token kinds (what RR.SkyArt.drawToken draws; every token also has nameKind / nameValue = what Bim says when it is tapped):
 *   color  { value:c, color:c }                                   nameKind 'color'  (the whole island is that colour)
 *   shape  { value:s, shape:s, color:c }                          nameKind 'shape'
 *   stars  { value:n, n }                 (stars only, dice-like)  nameKind 'stars'
 *   number { value:n, n, text:'3', showStars }                    nameKind 'number' (showStars: count-up → numeral + n little stars)
 *   animal { value:a, sprite:'animal_a', scale:1, word?, initial? } nameKind 'animal'
 *   size   { value:'big'|'small', size, animal:a, sprite, scale:1|0.6 }   nameKind 'size' (nameValue big|small, + token.animal)
 *   letter { value:'B', text:'B' }                                nameKind 'letter'
 * params per promptKey: p.colors {color} · p.shapes {shape} · p.size {size, animal} · p.animals / p.sound {animal} ·
 *   p.countUp {n, first} · p.count {n} · p.letters {letter} · p.lower {letter (capital), lower} · p.initial {letter} ·
 *   p.add {a, b, text:'2 + 3'} · p.sub {a, b, text:'5 − 2'} · p.oddeven {parity:'odd'|'even'}
 */
(function (RR) {
  'use strict';

  RR.PALETTE = {
    red:    { base: '#E84A4A', dark: '#A8282E', light: '#F7A3A3' },
    blue:   { base: '#3C8DE8', dark: '#1F5BA8', light: '#A6CBF5' },
    yellow: { base: '#FFD23F', dark: '#C99A12', light: '#FFEBA6' },
    green:  { base: '#4CC26B', dark: '#2A8343', light: '#A9E3B8' },
    orange: { base: '#FF9A2E', dark: '#C4650C', light: '#FFCE99' },
    purple: { base: '#9B6BE0', dark: '#6840A8', light: '#D0B9F2' },
    pink:   { base: '#FF8FC0', dark: '#C9558A', light: '#FFCDE3' }     // an answer colour from age 5 (DESIGN §3)
  };
  for (var pk in RR.PALETTE) RR.PALETTE[pk].fill = RR.PALETTE[pk].base;   // old field name (shared code)
  var COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple'];
  var COLORS5 = COLORS.concat(['pink']);

  RR.ANIMALS = ['cat', 'dog', 'cow', 'pig', 'sheep', 'duck', 'lion', 'frog'];
  RR.SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
  RR.ANIMAL_SOUND = { cat: 'meow', dog: 'woof', cow: 'moo', pig: 'oink', sheep: 'baa', duck: 'quack', lion: 'roar', frog: 'ribbit' };

  RR.AGE_TOPICS = {
    3: ['colors', 'shapes', 'size', 'animals'],
    4: ['colors', 'shapes', 'count', 'animals'],
    5: ['shapes', 'count', 'letters', 'animals'],
    6: ['lower', 'initial', 'add', 'count'],
    7: ['initial', 'add', 'sub', 'oddeven']
  };
  var ALL_TOPICS = ['colors', 'size', 'shapes', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
  // every age has a POOL of 5 topics; a session plays 4 of them (rotating between sessions, so "Play again" differs)
  RR.AGE_POOLS = {
    3: ['colors', 'animals', 'size', 'shapes', 'count'],
    4: ['colors', 'animals', 'shapes', 'count', 'size'],
    5: ['shapes', 'count', 'letters', 'animals', 'colors'],
    6: ['lower', 'initial', 'add', 'count', 'letters'],
    7: ['initial', 'add', 'sub', 'oddeven', 'count']
  };
  var DIFFICULTY = ['colors', 'animals', 'size', 'shapes', 'letters', 'count', 'lower', 'initial', 'add', 'sub', 'oddeven'];

  // ---- tables (DESIGN §5.1)
  var ISLANDS = { 3: [2, 2, 2, 3], 4: [2, 3, 3, 3], 5: [3, 3, 4, 4], 6: [3, 4, 4, 4], 7: [3, 4, 4, 4] };   // islands per row, per round
  var HOPS = [2, 3, 3, 3];                                          // hops per round (warm-up 2); count-up rounds: N
  var COUNT_UP = { 3: [2, 3], 4: [3, 4], 5: [4, 5], 6: [4, 5], 7: [4, 5] };   // count-up rounds 0–1: hop k asks k = 1…N
  var COUNT_RANGE = { 3: [1, 4], 4: [1, 5], 5: [1, 10], 6: [1, 12], 7: [1, 12] };
  var SMALL_SCALE = 0.6;
  var MAX_TOKENS = 4;
  var ODDEVEN_MAX = { 6: 12, 7: 20 };
  var ADD_MAX = { 6: 10, 7: 20 };
  var SUB_MAX = 10;
  var SHAPES4 = ['circle', 'square', 'triangle', 'star', 'heart'];   // ages ≤ 4; all 8 from age 5
  var LETTER_POOL = { en: 'ABCDEFGHIKLMNOPRSTUW', vi: 'ABCDEGHIKLMNOPSTUVXY' };
  var LOWER_SKIP = 'IL';                                            // capital I and small l look alike
  var MINUS = '−';

  /* 'initial' words: the 8 animal friends. vi skips digraph words (chó starts with "ch", taught as its own sound);
   * en skips sheep ("sh"). */
  function Wd(word, animal, initial) { return { word: word, sprite: 'animal_' + animal, animal: animal, initial: initial }; }
  RR.WORDS = {
    en: [Wd('cat', 'cat', 'C'), Wd('dog', 'dog', 'D'), Wd('cow', 'cow', 'C'), Wd('pig', 'pig', 'P'), Wd('duck', 'duck', 'D'),
      Wd('lion', 'lion', 'L'), Wd('frog', 'frog', 'F')],
    vi: [Wd('mèo', 'cat', 'M'), Wd('bò', 'cow', 'B'), Wd('heo', 'pig', 'H'), Wd('cừu', 'sheep', 'C'), Wd('vịt', 'duck', 'V'),
      Wd('sư tử', 'lion', 'S'), Wd('ếch', 'frog', 'Ê')]
  };
  var WORD_INIT = {};
  (function () { for (var l in RR.WORDS) { WORD_INIT[l] = {}; RR.WORDS[l].forEach(function (w) { WORD_INIT[l][w.animal] = w.initial; }); } })();

  /* Colour-blind / toddler safety (DESIGN §5.1): below age 5 never blue+purple, red+green, yellow+orange or green+orange in
   * one row, and no pink. */
  var COLOR_SAFE_BELOW = 5;
  var CLASH = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange'], ['red', 'orange']];   // red+orange: visual QA (deuteranopia ΔE 15)
  function clash(cs) {
    for (var i = 0; i < CLASH.length; i++) if (cs.indexOf(CLASH[i][0]) >= 0 && cs.indexOf(CLASH[i][1]) >= 0) return true;
    return false;
  }
  var SAFE_SETS = (function () {     // every largest clash-free set of the 6 base colours (3 colours each)
    var sets = [], best = 0;
    for (var m = 1; m < 64; m++) {
      var cs = COLORS.filter(function (c, i) { return m & (1 << i); });
      if (clash(cs)) continue;
      if (cs.length > best) { best = cs.length; sets = []; }
      if (cs.length === best) sets.push(cs);
    }
    return sets;
  })();
  function safeSetsOf(n) {          // every clash-free set of exactly n base colours
    var out = [];
    for (var m = 1; m < 64; m++) {
      var cs = COLORS.filter(function (c, i) { return m & (1 << i); });
      if (cs.length === n && !clash(cs)) out.push(cs);
    }
    return out;
  }

  function ageOf(a) { a = Math.round(+a || 4); return a < 3 ? 3 : a > 7 ? 7 : a; }
  function langOf(l) { return l === 'vi' ? 'vi' : 'en'; }
  function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }
  function shapesFor(age) { return age >= 5 ? RR.SHAPES.slice() : SHAPES4.slice(); }
  function letterPool(lang, topic) {
    var P = LETTER_POOL[langOf(lang)].split('');
    return topic === 'lower' ? P.filter(function (c) { return LOWER_SKIP.indexOf(c) < 0; }) : P;
  }
  function parityOf(n) { return n % 2 ? 'odd' : 'even'; }
  function initialsOf(lang) { var s = []; RR.WORDS[langOf(lang)].forEach(function (w) { if (s.indexOf(w.initial) < 0) s.push(w.initial); }); return s; }

  // ---- tokens
  function T(kind, value, nameKind, nameValue, extra) {
    var t = { kind: kind, value: value, nameKind: nameKind, nameValue: nameValue };
    if (extra) for (var k in extra) t[k] = extra[k];
    return t;
  }
  function tColor(c) { return T('color', c, 'color', c, { color: c }); }
  function tShape(s, c) { return T('shape', s, 'shape', s, { shape: s, color: c }); }
  function tStars(n) { return T('stars', n, 'stars', n, { n: n }); }
  function tNumber(n, showStars) { return T('number', n, 'number', n, { n: n, text: String(n), showStars: !!showStars }); }
  function tAnimal(a, word, initial) {
    var t = T('animal', a, 'animal', a, { sprite: 'animal_' + a, scale: 1 });
    if (word) { t.word = word; t.initial = initial; }
    return t;
  }
  function tSize(a, size) { return T('size', size, 'size', size, { size: size, animal: a, sprite: 'animal_' + a, scale: size === 'big' ? 1 : SMALL_SCALE }); }
  function tLetter(L) { return T('letter', L, 'letter', L, { text: L }); }
  /** Identity of a token (distinctness within a row, "same answer twice in a row"). */
  function tokenKey(t) { return [t.kind, t.value, t.color || '', t.shape || '', t.animal || ''].join('|'); }

  function hop(rng, promptKey, params, answer, distractors) {
    var tokens = rng.shuffle([answer].concat(distractors));
    return { promptKey: promptKey, params: params, answer: tokens.indexOf(answer), tokens: tokens };
  }
  /** k values from pool (no repeats), excluding `not`. */
  function sampleNot(rng, pool, k, not) { return rng.shuffle(pool.filter(function (v) { return not.indexOf(v) < 0; })).slice(0, k); }
  function pickNot(rng, pool, not) { var p = pool.filter(function (v) { return v !== not; }); return rng.pick(p.length ? p : pool); }
  /** Number distractors: nearest first (ages ≥ 5) or ≥ 2 away from the answer when possible (ages ≤ 4). */
  function numDistractors(rng, ans, lo, hi, k, far) {
    var cands = range(lo, hi).filter(function (v) { return v !== ans; });
    var good = cands.filter(function (v) { return far ? Math.abs(v - ans) >= 2 : Math.abs(v - ans) <= 3; });
    var rest = cands.filter(function (v) { return good.indexOf(v) < 0; });
    return rng.shuffle(good).concat(rng.shuffle(rest)).slice(0, k);
  }

  function islandsFor(topic, age, ri, tbl) {
    var t = (tbl && tbl[age]) || ISLANDS[age];
    var n = t[Math.min(ri, t.length - 1)];
    var cap = MAX_TOKENS;
    if (topic === 'colors' && age < COLOR_SAFE_BELOW) cap = SAFE_SETS[0].length;
    return Math.max(2, Math.min(n, cap));
  }
  function hopsFor(topic, age, ri, tbl) {
    if (topic === 'count' && ri < 2) return COUNT_UP[age][ri];
    var t = tbl || HOPS;
    return t[Math.min(ri, t.length - 1)];
  }

  function makeRound(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new RR.RNG(1), ri = o.roundIndex || 0;
    if (ALL_TOPICS.indexOf(topic) < 0) throw new Error('RR.Content: unknown topic ' + topic);
    var n = o.islands ? Math.max(2, Math.min(MAX_TOKENS, o.islands)) : islandsFor(topic, age, ri, o.islandsByAge);
    if (topic === 'colors' && age < COLOR_SAFE_BELOW) n = Math.min(n, SAFE_SETS[0].length);
    var H = o.hops ? o.hops : hopsFor(topic, age, ri, o.hopsPerRound);
    if (topic === 'count' && ri < 2) H = COUNT_UP[age][ri];
    var hops = [], prev = null, soundOff = rng.int(0, 1);
    for (var k = 0; k < H; k++) {
      var hp = null;
      for (var attempt = 0; attempt < 30; attempt++) {
        hp = buildHop(topic, age, lang, rng, ri, k, n, prev, soundOff);
        if (!prev || tokenKey(hp.tokens[hp.answer]) !== prev) break;
      }
      hops.push(hp); prev = tokenKey(hp.tokens[hp.answer]);
    }
    var r = { topic: topic, age: age, lang: lang, roundIndex: ri, surprise: o.surprise || null,
      seed: (rng.next() * 4294967296) >>> 0, hops: hops };
    var err = validate(r);
    if (err) throw new Error('RR.Content: invalid round (' + topic + ', age ' + age + '): ' + err);
    return r;
  }

  /** prevKey = tokenKey of the previous hop's answer (never asked twice in a row). */
  function buildHop(topic, age, lang, rng, ri, k, n, prevKey, soundOff) {
    var prevVal = prevKey ? prevKey.split('|')[1] : null, a, d;
    var notPrev = function (v) { return String(v) !== prevVal; };
    switch (topic) {
      case 'colors': {
        // balanced answers (playtest P3-4): pick the answer colour uniformly first, then a row that can hold it
        var pool = COLORS5;
        if (age < COLOR_SAFE_BELOW) {
          var sets = safeSetsOf(n), okc = COLORS.filter(function (c) { return notPrev(c) && sets.some(function (st) { return st.indexOf(c) >= 0; }); });
          a = rng.pick(okc);
          pool = rng.pick(sets.filter(function (st) { return st.indexOf(a) >= 0; }));
        } else a = rng.pick(pool.filter(notPrev));
        d = sampleNot(rng, pool, n - 1, [a]);
        return hop(rng, 'p.colors', { color: a }, tColor(a), d.map(tColor));
      }
      case 'shapes': {
        var sp = shapesFor(age);
        a = rng.pick(sp.filter(notPrev));
        d = sampleNot(rng, sp, n - 1, [a]);
        var cols;
        if (age <= 4) cols = rng.shuffle(COLORS.slice());                    // every gem in the row its own colour
        else { cols = []; for (var i = 0; i < n; i++) cols.push(rng.pick(COLORS5)); }   // mixed, may repeat
        return hop(rng, 'p.shapes', { shape: a }, tShape(a, cols[0]), d.map(function (s, j) { return tShape(s, cols[j + 1]); }));
      }
      case 'size': {
        var an = rng.pick(RR.ANIMALS.filter(function (x) { return !prevKey || prevKey.split('|')[4] !== x; }));
        var sz = rng.chance(0.5) ? 'big' : 'small', other = sz === 'big' ? 'small' : 'big';
        var ds = [tSize(an, other)];
        var others = sampleNot(rng, RR.ANIMALS, n - 2, [an]);
        others.forEach(function (b) { ds.push(tSize(b, rng.chance(0.5) ? 'big' : 'small')); });
        return hop(rng, 'p.size', { size: sz, animal: an }, tSize(an, sz), ds);
      }
      case 'animals': {
        a = rng.pick(RR.ANIMALS.filter(notPrev));
        d = sampleNot(rng, RR.ANIMALS, n - 1, [a]);
        var bySound = age >= 4 && ri >= 2 && (k + soundOff) % 2 === 0;
        return hop(rng, bySound ? 'p.sound' : 'p.animals', { animal: a }, tAnimal(a), d.map(function (x) { return tAnimal(x); }));
      }
      case 'count': {
        var R = COUNT_RANGE[age];
        if (ri < 2) {     // count up: hop k asks k + 1
          var N = COUNT_UP[age][ri], m = k + 1, hi = Math.max(R[1], N, n);
          d = numDistractors(rng, m, 1, Math.min(hi, Math.max(N + 1, n + 1, 5)), n - 1, false);
          return hop(rng, 'p.countUp', { n: m, first: k === 0 }, tNumber(m, true), d.map(function (v) { return tNumber(v, true); }));
        }
        a = rng.pick(range(R[0], R[1]).filter(notPrev));
        d = numDistractors(rng, a, R[0], R[1], n - 1, age <= 4);
        return hop(rng, 'p.count', { n: a }, tStars(a), d.map(tStars));
      }
      case 'letters': {
        var P = letterPool(lang, topic);
        a = rng.pick(P.filter(notPrev));
        return hop(rng, 'p.letters', { letter: a }, tLetter(a), sampleNot(rng, P, n - 1, [a]).map(tLetter));
      }
      case 'lower': {
        var Pl = letterPool(lang, topic);
        a = rng.pick(Pl.filter(function (c) { return notPrev(c.toLowerCase()); }));
        d = sampleNot(rng, Pl, n - 1, [a]).map(function (c) { return tLetter(c.toLowerCase()); });
        return hop(rng, 'p.lower', { letter: a, lower: a.toLowerCase() }, tLetter(a.toLowerCase()), d);
      }
      case 'initial': {
        var W = RR.WORDS[lang], prevAnimal = prevKey ? prevKey.split('|')[1] : null;
        var w = rng.pick(W.filter(function (x) { return x.animal !== prevAnimal; }));
        var od = rng.shuffle(W.filter(function (x) { return x.initial !== w.initial; }));
        var used = [], dd = [];       // distractors: other initials (each animal once)
        for (var j = 0; j < od.length && dd.length < n - 1; j++) if (used.indexOf(od[j].animal) < 0) { used.push(od[j].animal); dd.push(od[j]); }
        return hop(rng, 'p.initial', { letter: w.initial }, tAnimal(w.animal, w.word, w.initial),
          dd.map(function (x) { return tAnimal(x.animal, x.word, x.initial); }));
      }
      case 'add': {
        var top = ADD_MAX[age] || 10, lo = 2, hiA = ri === 0 ? Math.min(6, top) : top;
        a = rng.pick(range(lo, hiA).filter(notPrev));
        var x = rng.int(1, a - 1);
        d = numDistractors(rng, a, 0, top + 2, n - 1, false);
        return hop(rng, 'p.add', { a: x, b: a - x, text: x + ' + ' + (a - x) }, tNumber(a), d.map(function (v) { return tNumber(v); }));
      }
      case 'sub': {
        a = rng.pick(range(0, ri === 0 ? 4 : SUB_MAX - 1).filter(notPrev));
        var kk = rng.int(1, SUB_MAX - a), big = a + kk;
        d = numDistractors(rng, a, 0, SUB_MAX, n - 1, false);
        return hop(rng, 'p.sub', { a: big, b: kk, text: big + ' ' + MINUS + ' ' + kk }, tNumber(a), d.map(function (v) { return tNumber(v); }));
      }
      case 'oddeven': {
        var hiO = ODDEVEN_MAX[age] || 12, par = rng.chance(0.5) ? 'odd' : 'even';
        var same = range(1, hiO).filter(function (v) { return parityOf(v) === par && notPrev(v); });
        var opp = range(1, hiO).filter(function (v) { return parityOf(v) !== par; });
        a = rng.pick(same);
        return hop(rng, 'p.oddeven', { parity: par }, tNumber(a), rng.shuffle(opp).slice(0, n - 1).map(function (v) { return tNumber(v); }));
      }
    }
    throw new Error('RR.Content: unknown topic ' + topic);
  }

  // ---------------- self-check ----------------
  function evalText(t) {
    var m = /^(\d+) ([+−]) (\d+)$/.exec(t); if (!m) return NaN;
    return m[2] === '+' ? +m[1] + +m[3] : +m[1] - +m[3];
  }
  /** Does the token answer the hop's prompt? (re-derived from promptKey + params + token fields only) */
  function matches(h, t, lang) {
    var p = h.params || {};
    switch (h.promptKey) {
      case 'p.colors': return t.kind === 'color' && t.color === p.color && t.value === p.color;
      case 'p.shapes': return t.kind === 'shape' && t.shape === p.shape;
      case 'p.size': return t.kind === 'size' && t.animal === p.animal && t.size === p.size && t.scale === (p.size === 'big' ? 1 : SMALL_SCALE);
      case 'p.animals': case 'p.sound': return t.kind === 'animal' && t.value === p.animal;
      case 'p.countUp': return t.kind === 'number' && t.n === p.n && t.text === String(p.n);
      case 'p.count': return t.kind === 'stars' && t.n === p.n;
      case 'p.letters': return t.kind === 'letter' && t.text === p.letter && p.letter === p.letter.toUpperCase();
      case 'p.lower': return t.kind === 'letter' && t.text === p.letter.toLowerCase() && t.text !== p.letter && LOWER_SKIP.indexOf(p.letter) < 0;
      case 'p.initial': return t.kind === 'animal' && WORD_INIT[langOf(lang)][t.value] === p.letter;
      case 'p.add': return t.kind === 'number' && t.n === p.a + p.b && evalText(p.text) === t.n;
      case 'p.sub': return t.kind === 'number' && t.n === p.a - p.b && t.n >= 0 && evalText(p.text) === t.n;
      case 'p.oddeven': return t.kind === 'number' && parityOf(t.n) === p.parity;
    }
    return false;
  }
  var KINDS = ['color', 'shape', 'stars', 'number', 'animal', 'size', 'letter', 'text'];

  function validate(r) {
    if (!r || !r.hops || !r.hops.length) return 'no hops';
    var prev = null;
    for (var i = 0; i < r.hops.length; i++) {
      var h = r.hops[i], ts = h.tokens, keys = {};
      if (!ts || ts.length < 2 || ts.length > MAX_TOKENS) return 'hop ' + i + ': ' + (ts ? ts.length : 0) + ' tokens';
      if (!(h.answer >= 0 && h.answer < ts.length)) return 'hop ' + i + ': bad answer index';
      var hits = 0;
      for (var j = 0; j < ts.length; j++) {
        var t = ts[j], key = tokenKey(t);
        if (KINDS.indexOf(t.kind) < 0) return 'bad token kind ' + t.kind;
        if (t.value === undefined || t.value === null || t.nameKind === undefined || t.nameValue === undefined) return 'token without value / name';
        if (keys[key]) return 'hop ' + i + ': duplicate token ' + key;
        keys[key] = 1;
        if (t.color && !RR.PALETTE[t.color]) return 'bad colour ' + t.color;
        if ((t.kind === 'animal' || t.kind === 'size') && RR.ANIMALS.indexOf(t.kind === 'animal' ? t.value : t.animal) < 0) return 'bad animal';
        if ((t.kind === 'stars') && !(t.n >= 1 && t.n <= 12)) return 'stars out of 1–12';
        if (t.kind === 'number' && t.text !== String(t.n)) return 'number text';
        if (matches(h, t, r.lang)) hits++;
      }
      if (hits !== 1) return 'hop ' + i + ': ' + hits + ' tokens match ' + h.promptKey + ' ' + JSON.stringify(h.params);
      if (!matches(h, ts[h.answer], r.lang)) return 'hop ' + i + ': answer index does not match';
      if (r.topic === 'colors' && r.age < COLOR_SAFE_BELOW) {
        var cs = ts.map(function (x) { return x.color; });
        if (clash(cs) || cs.indexOf('pink') >= 0) return 'colour clash ' + cs.join('+');
      }
      if (r.topic === 'shapes' && r.age <= 4) {
        var sc = ts.map(function (x) { return x.color; });
        if (sc.some(function (c, q) { return sc.indexOf(c) !== q; })) return 'shape colours repeat below age 5';
      }
      var ak = tokenKey(ts[h.answer]);
      if (ak === prev) return 'hop ' + i + ': same answer as the previous hop';
      prev = ak;
    }
    if (r.hops[0].promptKey === 'p.countUp') {
      for (var c = 0; c < r.hops.length; c++) if (r.hops[c].params.n !== c + 1) return 'count-up sequence';
    }
    return null;
  }

  // ---------------- Talk time ----------------
  function choicesFrom(rng, kind, answer, pool, count) {
    var vals = [answer], p2 = rng.shuffle(pool.filter(function (v) { return v !== answer; }));
    for (var i = 0; vals.length < count && i < p2.length; i++) if (vals.indexOf(p2[i]) < 0) vals.push(p2[i]);
    rng.shuffle(vals);
    var ch = [], ans = null;
    for (var j = 0; j < vals.length; j++) { ch.push({ id: 'c' + j, kind: kind, value: vals[j] }); if (vals[j] === answer) ans = 'c' + j; }
    return { choices: ch, answerId: ans };
  }
  function nearNumbers(ans, lo, hi) {
    var d = [], c = [ans - 1, ans + 1, ans - 2, ans + 2, ans + 3, ans - 3];
    for (var i = 0; i < c.length; i++) if (c[i] >= lo && c[i] <= hi) d.push(c[i]);
    return d;
  }

  /* talk = { topic, promptKey:'talk.<topic>', params, show: a token (or null), choices:[{id, kind, value}], answerId }
   *   colors: show color → which colour? · shapes: show shape → which shape? · size: show a big / small animal → big or small?
   *   (kind 'size', choices also carry sprite + scale) · count: show stars (n ≤ 5 at ages ≤ 4) → how many? (kind 'number')
   *   animals: "Where is the {animal}?" params {animal}, show null, 3 animal pictures · letters: show capital → which letter?
   *   lower: show small letter → which capital? · initial: show animal, params {word, animal} → which letter?
   *   add / sub: show text {kind:'text', text:'2 + 3'} → which number? · oddeven: show number → odd or even? (kind 'parity') */
  function makeTalk(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new RR.RNG(1);
    var show = null, params = {}, ch, a, k;
    switch (topic) {
      case 'colors': {
        var pool = age < COLOR_SAFE_BELOW ? rng.pick(SAFE_SETS) : COLORS5;
        a = rng.pick(pool); show = tColor(a);
        ch = choicesFrom(rng, 'color', a, pool, 3); break;
      }
      case 'shapes': {
        var sp = shapesFor(age); a = rng.pick(sp); show = tShape(a, rng.pick(COLORS));
        ch = choicesFrom(rng, 'shape', a, sp, 3); break;
      }
      case 'size': {
        a = rng.pick(['big', 'small']); var an = rng.pick(RR.ANIMALS);
        show = tSize(an, a); params = { animal: an };
        ch = choicesFrom(rng, 'size', a, ['big', 'small'], 2);
        ch.choices.forEach(function (c) { c.sprite = show.sprite; c.animal = an; c.scale = c.value === 'big' ? 1 : SMALL_SCALE; });
        break;
      }
      case 'animals': {
        a = rng.pick(RR.ANIMALS); params = { animal: a };
        ch = choicesFrom(rng, 'animal', a, RR.ANIMALS, 3); break;
      }
      case 'count': {
        var rr = { 3: [1, 4], 4: [1, 5], 5: [2, 8], 6: [3, 10], 7: [3, 10] }[age];
        a = rng.int(rr[0], rr[1]); show = tStars(a);
        ch = choicesFrom(rng, 'number', a, nearNumbers(a, 1, Math.max(rr[1], a + 2)), 3); break;
      }
      case 'letters':
      case 'lower': {
        var P = letterPool(lang, topic); a = rng.pick(P);
        show = tLetter(topic === 'lower' ? a.toLowerCase() : a);
        ch = choicesFrom(rng, 'letter', a, P, 3); break;
      }
      case 'initial': {
        var w0 = rng.pick(RR.WORDS[lang]); a = w0.initial;
        show = tAnimal(w0.animal, w0.word, w0.initial); params = { word: w0.word, animal: w0.animal };
        var lp = LETTER_POOL[lang].split('').concat(initialsOf(lang).filter(function (x) { return LETTER_POOL[lang].indexOf(x) < 0; }));
        ch = choicesFrom(rng, 'letter', a, lp, 3); break;
      }
      case 'add': {
        var hi = ADD_MAX[age] || 10; a = rng.int(age >= 7 ? 4 : 2, hi); k = rng.int(1, a - 1);
        var t1 = k + ' + ' + (a - k); show = T('text', t1, 'sum', t1, { text: t1 });
        ch = choicesFrom(rng, 'number', a, nearNumbers(a, 0, hi + 2), 3); break;
      }
      case 'sub': {
        a = rng.int(0, 9); k = rng.int(1, 10 - a);
        var t2 = (a + k) + ' ' + MINUS + ' ' + k; show = T('text', t2, 'diff', t2, { text: t2 });
        ch = choicesFrom(rng, 'number', a, nearNumbers(a, 0, 10), 3); break;
      }
      case 'oddeven': {
        var nn = rng.int(1, 20); a = parityOf(nn);
        show = tNumber(nn);
        ch = choicesFrom(rng, 'parity', a, ['odd', 'even'], 2); break;
      }
      default: throw new Error('RR.Content: unknown topic ' + topic);
    }
    return { topic: topic, promptKey: 'talk.' + topic, params: params, show: show, choices: ch.choices, answerId: ch.answerId };
  }

  /** 4 chapter topics for a session. Without rng: RR.AGE_TOPICS. With rng: chapter 1 = the easiest pool topic that was not
   * chapter 1 last time; chapters 2–4 = 3 of the others (preferring topics left out of `last`), sorted easiest first. */
  function topicsFor(age, rng, last) {
    age = ageOf(age);
    if (!rng) return RR.AGE_TOPICS[age].slice();
    var pool = RR.AGE_POOLS[age].slice().sort(function (a, b) { return DIFFICULTY.indexOf(a) - DIFFICULTY.indexOf(b); });
    last = Array.isArray(last) ? last : [];
    var first = pool[0];
    for (var i = 0; i < pool.length; i++) if (pool[i] !== last[0]) { first = pool[i]; break; }
    var rest = pool.filter(function (t) { return t !== first; });
    var fresh = rng.shuffle(rest.filter(function (t) { return last.indexOf(t) < 0; }));
    var old = rng.shuffle(rest.filter(function (t) { return last.indexOf(t) >= 0; }));
    var pick = fresh.concat(old).slice(0, 3).sort(function (a, b) { return DIFFICULTY.indexOf(a) - DIFFICULTY.indexOf(b); });
    return [first].concat(pick);
  }

  RR.Content = {
    makeRound: makeRound, makeTalk: makeTalk, validate: validate, matches: matches, tokenKey: tokenKey,
    topicsFor: topicsFor, islandsFor: islandsFor, hopsFor: hopsFor,
    TOPICS: ALL_TOPICS, DIFFICULTY: DIFFICULTY, COLORS: COLORS, COLORS5: COLORS5, SHAPES: RR.SHAPES, SHAPES4: SHAPES4,
    ANIMALS: RR.ANIMALS, ISLANDS: ISLANDS, HOPS: HOPS, COUNT_UP: COUNT_UP, COUNT_RANGE: COUNT_RANGE, SMALL_SCALE: SMALL_SCALE,
    LETTER_POOL: LETTER_POOL, CLASH: CLASH, SAFE_SETS: SAFE_SETS, COLOR_SAFE_BELOW: COLOR_SAFE_BELOW, MAX_TOKENS: MAX_TOKENS,
    ageOf: ageOf, clash: clash, safeSetsOf: safeSetsOf, shapesFor: shapesFor, initialsOf: initialsOf, parityOf: parityOf
  };
})(window.RR = window.RR || {});
