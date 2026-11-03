/* Pip's Camp Hide & Seek — FC.PALETTE, FC.ANIMALS, FC.SHAPES, FC.AGE_TOPICS, FC.SEASON_SPOTS, FC.WORDS, FC.Content
 * (pure + deterministic; DESIGN §5.1)
 *
 *   FC.Content.makeRound(topic, { age, lang, rng, roundIndex, season, surprise, places?, placesByAge? }) → round
 *   FC.Content.makeTalk(topic,  { age, lang, rng }) → talk
 *   FC.Content.validate(round) → null | 'reason'   (self-check, called by makeRound: every ask has exactly one match
 *                                                   among the places still hidden, and it is its answer)
 *   FC.Content.matches(ask, clue, lang) → bool       (independent re-derivation of "is this clue what the prompt asks for")
 *   FC.Content.topicsFor(age, rng?, lastTopics?) → the 4 chapter topics
 *
 * round = { topic, age, lang, roundIndex, season, surprise, seed, places:[ { kind, friend, clue } ], asks:[ ask ] }
 * ask   = { promptKey, params, answer /*index into places*\/ }
 * params per promptKey: p.colors {color} · p.shapes {shape} · p.size {size, animal} · p.animals / p.sound {animal} ·
 *   p.countUp {n, first} · p.count {n} · p.letters {letter} · p.lower {letter (capital), lower} · p.initial {letter} ·
 *   p.add {a, b, text:'2 + 3'} · p.sub {a, b, text:'5 − 2'} · p.oddeven {parity:'odd'|'even'}
 */
(function (FC) {
  'use strict';

  FC.PALETTE = {
    red:    { base: '#E84A4A', dark: '#A8282E', light: '#F7A3A3' },
    blue:   { base: '#3C8DE8', dark: '#1F5BA8', light: '#A6CBF5' },
    yellow: { base: '#FFD23F', dark: '#C99A12', light: '#FFEBA6' },
    green:  { base: '#4CC26B', dark: '#2A8343', light: '#A9E3B8' },
    orange: { base: '#FF9A2E', dark: '#C4650C', light: '#FFCE99' },
    purple: { base: '#9B6BE0', dark: '#6840A8', light: '#D0B9F2' },
    pink:   { base: '#FF8FC0', dark: '#C9558A', light: '#FFCDE3' }     // an answer colour from age 5 (DESIGN §3)
  };
  for (var pk in FC.PALETTE) FC.PALETTE[pk].fill = FC.PALETTE[pk].base;   // old field name (shared code)
  var COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple'];
  var COLORS5 = COLORS.concat(['pink']);

  FC.ANIMALS = ['cat', 'dog', 'cow', 'pig', 'sheep', 'duck', 'lion', 'frog'];
  FC.SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
  FC.ANIMAL_SOUND = { cat: 'meow', dog: 'woof', cow: 'moo', pig: 'oink', sheep: 'baa', duck: 'quack', lion: 'roar', frog: 'ribbit' };

  FC.AGE_TOPICS = {
    3: ['colors', 'shapes', 'size', 'animals'],
    4: ['colors', 'shapes', 'count', 'animals'],
    5: ['shapes', 'count', 'letters', 'animals'],
    6: ['lower', 'initial', 'add', 'count'],
    7: ['initial', 'add', 'sub', 'oddeven']
  };
  var ALL_TOPICS = ['colors', 'size', 'shapes', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
  // every age has a POOL of 5 topics; a session plays 4 of them (rotating between sessions, so "Play again" differs)
  FC.AGE_POOLS = {
    3: ['colors', 'animals', 'size', 'shapes', 'count'],
    4: ['colors', 'animals', 'shapes', 'count', 'size'],
    5: ['shapes', 'count', 'letters', 'animals', 'colors'],
    6: ['lower', 'initial', 'add', 'count', 'letters'],
    7: ['initial', 'add', 'sub', 'oddeven', 'count']
  };
  var DIFFICULTY = ['colors', 'animals', 'size', 'shapes', 'letters', 'count', 'lower', 'initial', 'add', 'sub', 'oddeven'];

  FC.SEASON_SPOTS = [['bush', 'stump'], ['tent', 'rock'], ['leaves', 'log'], ['snowman', 'drift']];

  // ---- tables (DESIGN §5.1)
  var PLACES = { 3: [2, 2, 3, 3], 4: [2, 3, 4, 4], 5: [3, 4, 5, 5], 6: [4, 5, 6, 6], 7: [4, 5, 6, 6] };   // places (= friends) per round
  var MAX_PLACES = 6;
  var COUNT_RANGE = { 3: [1, 4], 4: [1, 5], 5: [1, 10], 6: [1, 12], 7: [1, 12] };   // star signs (rounds 2–3)
  var SMALL_SCALE = 0.62;
  var ODDEVEN_MAX = { 6: 12, 7: 20 };
  var ADD_MAX = { 6: 10, 7: 20 };
  var SUB_MAX = 10;
  var SHAPES4 = ['circle', 'square', 'triangle', 'star', 'heart'];   // ages ≤ 4; all 8 from age 5
  var LETTER_POOL = { en: 'ABCDEFGHIKLMNOPRSTUW', vi: 'ABCDEGHIKLMNOPSTUVXY' };
  var LOWER_SKIP = 'IL';                                            // capital I and small l look alike
  var MINUS = '−';
  var CLUE_OF = { colors: 'hat', shapes: 'flag', count: 'sign', animals: 'ears', size: 'size', initial: 'ears',
    letters: 'badge', lower: 'badge', add: 'badge', sub: 'badge', oddeven: 'badge' };

  /* 'initial' words: the 8 animal friends. vi skips digraph words (chó starts with "ch", taught as its own sound);
   * en skips sheep ("sh"). A friend without a word never matches an initial ask (a safe leftover). */
  function Wd(word, animal, initial) { return { word: word, sprite: 'animal_' + animal, animal: animal, initial: initial }; }
  FC.WORDS = {
    en: [Wd('cat', 'cat', 'C'), Wd('dog', 'dog', 'D'), Wd('cow', 'cow', 'C'), Wd('pig', 'pig', 'P'), Wd('duck', 'duck', 'D'),
      Wd('lion', 'lion', 'L'), Wd('frog', 'frog', 'F')],
    vi: [Wd('mèo', 'cat', 'M'), Wd('bò', 'cow', 'B'), Wd('heo', 'pig', 'H'), Wd('cừu', 'sheep', 'C'), Wd('vịt', 'duck', 'V'),
      Wd('sư tử', 'lion', 'S'), Wd('ếch', 'frog', 'Ê')]
  };
  var WORD_OF = {};
  (function () { for (var l in FC.WORDS) { WORD_OF[l] = {}; FC.WORDS[l].forEach(function (w) { WORD_OF[l][w.animal] = w; }); } })();

  /* Colour-blind / toddler safety (DESIGN §5.1): below age 5 never blue+purple, red+green, yellow+orange, green+orange
   * (+ red+orange: visual QA of the sister game, deuteranopia ΔE 15) in one round, and no pink. The largest clash-free set
   * has 3 colours, so colour rounds below age 5 have at most 3 places (two equal hats can never be told apart by an ask). */
  var COLOR_SAFE_BELOW = 5;
  var CLASH = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange'], ['red', 'orange']];
  function clash(cs) {
    for (var i = 0; i < CLASH.length; i++) if (cs.indexOf(CLASH[i][0]) >= 0 && cs.indexOf(CLASH[i][1]) >= 0) return true;
    return false;
  }
  function safeSetsOf(n) {          // every clash-free set of exactly n base colours
    var out = [];
    for (var m = 1; m < 64; m++) {
      var cs = COLORS.filter(function (c, i) { return m & (1 << i); });
      if (cs.length === n && !clash(cs)) out.push(cs);
    }
    return out;
  }
  var SAFE_SETS = safeSetsOf(3);
  var SAFE_MAX = 3;

  function ageOf(a) { a = Math.round(+a || 4); return a < 3 ? 3 : a > 7 ? 7 : a; }
  function langOf(l) { return l === 'vi' ? 'vi' : 'en'; }
  function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }
  function shapesFor(age) { return age >= 5 ? FC.SHAPES.slice() : SHAPES4.slice(); }
  function letterPool(lang, topic) {
    var P = LETTER_POOL[langOf(lang)].split('');
    return topic === 'lower' ? P.filter(function (c) { return LOWER_SKIP.indexOf(c) < 0; }) : P;
  }
  function parityOf(n) { return n % 2 ? 'odd' : 'even'; }
  function initialsOf(lang) { var s = []; FC.WORDS[langOf(lang)].forEach(function (w) { if (s.indexOf(w.initial) < 0) s.push(w.initial); }); return s; }

  // ---- tokens (Talk time + old shared code) — the round itself uses clues (below)
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
  function tokenKey(t) { return [t.kind, t.value, t.color || '', t.shape || '', t.animal || ''].join('|'); }

  /* ---- clues (what peeks out above a hiding place; DESIGN §5.1, drawn by FC.CampArt.drawClue)
   *   hat   { value:c, color:c }                       nameKind 'color'
   *   flag  { value:s, shape:s, color:c }              nameKind 'shape'
   *   sign  { value:n, n, text:'3'|null, stars:true }  nameKind 'number' (count up: numeral + n stars) | 'stars' (stars only)
   *   ears  { value:a, animal:a, word?, initial? }     nameKind 'animal' (the friend's own head is the clue)
   *   size  { value:'big'|'small', size, animal, scale:1|0.62 }   nameKind 'size' (+ animal)
   *   badge { value, text, n? }                        nameKind 'letter' | 'number'                                    */
  function C(kind, value, nameKind, nameValue, extra) {
    var c = { kind: kind, value: value, nameKind: nameKind, nameValue: nameValue };
    if (extra) for (var k in extra) c[k] = extra[k];
    return c;
  }
  function cHat(c) { return C('hat', c, 'color', c, { color: c }); }
  function cFlag(s, c) { return C('flag', s, 'shape', s, { shape: s, color: c }); }
  function cSign(n, numeral) { return C('sign', n, numeral ? 'number' : 'stars', n, { n: n, text: numeral ? String(n) : null, stars: true }); }
  function cEars(a, lang) {
    var w = lang && WORD_OF[lang][a];
    var c = C('ears', a, 'animal', a, { animal: a });
    if (w) { c.word = w.word; c.initial = w.initial; }
    return c;
  }
  function cSize(a, size) { return C('size', size, 'size', size, { size: size, animal: a, scale: size === 'big' ? 1 : SMALL_SCALE }); }
  function cLetter(L) { return C('badge', L, 'letter', L, { text: L }); }
  function cNumber(n) { return C('badge', n, 'number', n, { n: n, text: String(n) }); }
  /** Identity of a clue (distinctness, "same value twice in a row"). */
  function clueKey(c) { return [c.kind, c.value, c.color || '', c.shape || '', c.animal || ''].join('|'); }

  function placesFor(topic, age, ri, tbl) {
    var t = (tbl && tbl[age]) || PLACES[age];
    var n = t[Math.min(ri, t.length - 1)];
    if (topic === 'colors' && age < COLOR_SAFE_BELOW) n = Math.min(n, SAFE_MAX);
    return Math.max(2, Math.min(MAX_PLACES, n));
  }

  /** Values far apart (ages ≤ 4: "≥ 2 apart when possible"): the best of a few random subsets by its smallest gap. */
  function spreadPick(rng, pool, k, tries) {
    var best = null, bg = -1;
    for (var t = 0; t < (tries || 24); t++) {
      var s = rng.shuffle(pool.slice()).slice(0, k).sort(function (a, b) { return a - b; }), g = 1e9;
      for (var i = 1; i < s.length; i++) g = Math.min(g, s[i] - s[i - 1]);
      if (g > bg) { bg = g; best = s; }
      if (bg >= 2) break;
    }
    return rng.shuffle(best);
  }

  /**
   * makeRound(topic, { age, lang, rng, roundIndex, season, surprise, places?, placesByAge? }) → round
   * round = { topic, age, lang, roundIndex, season, surprise, seed, places:[{kind, friend, clue}], asks:[{promptKey, params, answer}] }
   * The order of `places` is the left-to-right order the world lays them out in (kinds alternate); `asks` find all
   * friends but one (the leftover pops out by itself at the party).
   */
  function makeRound(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new FC.RNG(1), ri = o.roundIndex || 0;
    var season = ((o.season | 0) % 4 + 4) % 4;
    if (ALL_TOPICS.indexOf(topic) < 0) throw new Error('FC.Content: unknown topic ' + topic);
    var n = o.places ? Math.max(2, Math.min(MAX_PLACES, o.places)) : placesFor(topic, age, ri, o.placesByAge);
    if (topic === 'colors' && age < COLOR_SAFE_BELOW) n = Math.min(n, SAFE_MAX);
    var r = null, err = null;
    for (var attempt = 0; attempt < 40; attempt++) {
      r = buildRound(topic, age, lang, rng, ri, n, season);
      r.surprise = o.surprise || null;
      err = validate(r);
      if (!err) break;
    }
    if (err) throw new Error('FC.Content: invalid round (' + topic + ', age ' + age + '): ' + err);
    r.seed = (rng.next() * 4294967296) >>> 0;
    return r;
  }

  function friendsFor(rng, n, need) {   // n distinct animals, `need` first (in that order)
    var rest = rng.shuffle(FC.ANIMALS.filter(function (a) { return need.indexOf(a) < 0; }));
    return need.concat(rest).slice(0, n);
  }

  function buildRound(topic, age, lang, rng, ri, n, season) {
    var clues = [], friends = [], asks = [], i, order;
    var A = n - 1;                       // asks per round
    // ask order: a random permutation of the friends; the last one is the leftover
    order = rng.shuffle(range(0, n - 1));
    switch (topic) {
      case 'colors': {
        var cs;
        if (age < COLOR_SAFE_BELOW) {   // balanced: a colour first (uniform), then a clash-free set that holds it
          var sets = safeSetsOf(n), able = COLORS.filter(function (c) { return sets.some(function (st) { return st.indexOf(c) >= 0; }); });
          var c0 = rng.pick(able);
          cs = rng.shuffle(rng.pick(sets.filter(function (st) { return st.indexOf(c0) >= 0; })).slice());
        } else cs = rng.shuffle(COLORS5.slice());
        for (i = 0; i < n; i++) clues.push(cHat(cs[i]));
        friends = friendsFor(rng, n, []);
        break;
      }
      case 'shapes': {
        var sp = rng.shuffle(shapesFor(age)), cols = rng.shuffle(COLORS.slice());
        for (i = 0; i < n; i++) clues.push(cFlag(sp[i], age <= 4 ? cols[i] : rng.pick(COLORS5)));
        friends = friendsFor(rng, n, []);
        break;
      }
      case 'count': {
        if (ri < 2) {                    // count up: signs 1…n (numeral + stars), asks 1, 2, … n−1 in order
          var vals = range(1, n);
          for (i = 0; i < n; i++) clues.push(cSign(vals[i], true));
          // places in a random left-to-right order; asks by value
          var perm = rng.shuffle(range(0, n - 1)), cl2 = [];
          for (i = 0; i < n; i++) cl2[perm[i]] = clues[i];
          clues = cl2;
          order = []; for (i = 1; i <= n; i++) order.push(perm[i - 1]);
        } else {
          var R = COUNT_RANGE[age], pool = range(R[0], R[1]);
          var vs = age <= 4 ? spreadPick(rng, pool, n) : rng.shuffle(pool).slice(0, n);
          for (i = 0; i < n; i++) clues.push(cSign(vs[i], false));
        }
        friends = friendsFor(rng, n, []);
        break;
      }
      case 'animals': {
        friends = friendsFor(rng, n, []);
        for (i = 0; i < n; i++) clues.push(cEars(friends[i], lang));
        break;
      }
      case 'size': {
        // the same animal big AND small (+ other animals with a random size)
        var an = rng.pick(FC.ANIMALS), others = friendsFor(rng, n - 1, [an]).slice(1);
        friends = [an, an].concat(others);
        clues = [cSize(an, 'big'), cSize(an, 'small')];
        others.forEach(function (b) { clues.push(cSize(b, rng.chance(0.5) ? 'big' : 'small')); });
        // shuffle the positions together
        var ps = rng.shuffle(range(0, n - 1)), f2 = [], c2 = [];
        for (i = 0; i < n; i++) { f2[ps[i]] = friends[i]; c2[ps[i]] = clues[i]; }
        friends = f2; clues = c2;
        // ask the pair early: the first ask is one of the pair (big vs small is the lesson)
        var pair = [ps[0], ps[1]], first = rng.pick(pair);
        order = [first].concat(rng.shuffle(range(0, n - 1).filter(function (k) { return k !== first; })));
        break;
      }
      case 'initial': {
        // asked friends: pairwise different initials; the leftover: a different initial or no word at all
        var W = rng.shuffle(FC.WORDS[lang].slice()), pick = [], used = [];
        for (i = 0; i < W.length && pick.length < A; i++) if (used.indexOf(W[i].initial) < 0) { used.push(W[i].initial); pick.push(W[i].animal); }
        var left = rng.shuffle(FC.ANIMALS.filter(function (a) {
          return pick.indexOf(a) < 0 && (!WORD_OF[lang][a] || used.indexOf(WORD_OF[lang][a].initial) < 0);
        }))[0];
        var fr = pick.concat([left]), pos = rng.shuffle(range(0, n - 1));
        friends = []; clues = []; order = [];
        for (i = 0; i < n; i++) { friends[pos[i]] = fr[i]; clues[pos[i]] = cEars(fr[i], lang); }
        for (i = 0; i < A; i++) order.push(pos[i]);
        order.push(pos[n - 1]);
        break;
      }
      case 'letters': case 'lower': {
        var P = rng.shuffle(letterPool(lang, topic)).slice(0, n);
        for (i = 0; i < n; i++) clues.push(cLetter(topic === 'lower' ? P[i].toLowerCase() : P[i]));
        friends = friendsFor(rng, n, []);
        break;
      }
      case 'add': {
        var top = ADD_MAX[age] || 10, hiA = ri === 0 ? Math.min(Math.max(6, n + 2), top) : top;
        var sums = rng.shuffle(range(2, hiA)).slice(0, n);
        for (i = 0; i < n; i++) clues.push(cNumber(sums[i]));
        friends = friendsFor(rng, n, []);
        break;
      }
      case 'sub': {
        var hiS = ri === 0 ? Math.max(4, n) : SUB_MAX - 1, ds = rng.shuffle(range(0, hiS)).slice(0, n);
        for (i = 0; i < n; i++) clues.push(cNumber(ds[i]));
        friends = friendsFor(rng, n, []);
        break;
      }
      case 'oddeven': {
        // one parity ask per round (it can only be unique once: see MECHANICS §5); the other asks are sums (p.add)
        var hiO = ODDEVEN_MAX[age] || 12, par = rng.chance(0.5) ? 'odd' : 'even', k = rng.int(0, A - 1);
        var same = rng.shuffle(range(1, hiO).filter(function (v) { return parityOf(v) === par; }));
        var opp = rng.shuffle(range(1, hiO).filter(function (v) { return parityOf(v) !== par; }));
        var seq = [];                    // values in ask order (leftover last)
        for (i = 0; i < n; i++) {
          if (i === k) seq.push(same.pop());
          else if (i > k) seq.push(opp.pop());
          else seq.push(rng.chance(0.5) && same.length > 1 ? same.pop() : opp.length > n - 1 - k ? opp.pop() : same.pop());
        }
        var pos2 = rng.shuffle(range(0, n - 1));
        clues = []; order = [];
        for (i = 0; i < n; i++) { clues[pos2[i]] = cNumber(seq[i]); order.push(pos2[i]); }
        friends = friendsFor(rng, n, []);
        clues._parityAt = k; clues._parity = par;
        break;
      }
    }
    // asks
    var soundOff = rng.int(0, 1);
    for (var q = 0; q < A; q++) {
      var ix = order[q], c = clues[ix], pk, pr;
      switch (topic) {
        case 'colors': pk = 'p.colors'; pr = { color: c.color }; break;
        case 'shapes': pk = 'p.shapes'; pr = { shape: c.shape }; break;
        case 'count': if (ri < 2) { pk = 'p.countUp'; pr = { n: c.n, first: q === 0 }; } else { pk = 'p.count'; pr = { n: c.n }; } break;
        case 'animals': pk = age >= 4 && ri >= 2 && (q + soundOff) % 2 === 0 ? 'p.sound' : 'p.animals'; pr = { animal: c.animal }; break;
        case 'size': pk = 'p.size'; pr = { size: c.size, animal: c.animal }; break;
        case 'initial': pk = 'p.initial'; pr = { letter: c.initial }; break;
        case 'letters': pk = 'p.letters'; pr = { letter: c.text }; break;
        case 'lower': pk = 'p.lower'; pr = { letter: c.text.toUpperCase(), lower: c.text }; break;
        case 'add': { var x = rng.int(1, Math.max(1, c.n - 1)); pk = 'p.add'; pr = { a: x, b: c.n - x, text: x + ' + ' + (c.n - x) }; break; }
        case 'sub': { var kk = rng.int(1, SUB_MAX - c.n), big = c.n + kk; pk = 'p.sub'; pr = { a: big, b: kk, text: big + ' ' + MINUS + ' ' + kk }; break; }
        case 'oddeven':
          if (q === clues._parityAt) { pk = 'p.oddeven'; pr = { parity: clues._parity }; }
          else { var y = rng.int(c.n > 1 ? 1 : 0, Math.max(0, c.n - 1)); pk = 'p.add'; pr = { a: y, b: c.n - y, text: y + ' + ' + (c.n - y) }; }
          break;
      }
      asks.push({ promptKey: pk, params: pr, answer: ix });
    }
    delete clues._parityAt; delete clues._parity;
    // hiding place kinds alternate left to right between the season's two kinds
    var kinds = FC.SEASON_SPOTS[season], off = rng.int(0, 1), places = [];
    for (i = 0; i < n; i++) places.push({ kind: kinds[(i + off) % 2], friend: friends[i], clue: clues[i] });
    return { topic: topic, age: age, lang: lang, roundIndex: ri, season: season, surprise: null, places: places, asks: asks };
  }

  // ---------------- self-check ----------------
  function evalText(t) {
    var m = /^(\d+) ([+−]) (\d+)$/.exec(t); if (!m) return NaN;
    return m[2] === '+' ? +m[1] + +m[3] : +m[1] - +m[3];
  }
  /** Does the clue answer the ask's prompt? (re-derived from promptKey + params + clue fields only) */
  function matches(ask, c, lang) {
    var p = ask.params || {};
    if (!c) return false;
    switch (ask.promptKey) {
      case 'p.colors': return c.kind === 'hat' && c.color === p.color && c.value === p.color;
      case 'p.shapes': return c.kind === 'flag' && c.shape === p.shape;
      case 'p.size': return c.kind === 'size' && c.animal === p.animal && c.size === p.size && c.scale === (p.size === 'big' ? 1 : SMALL_SCALE);
      case 'p.animals': case 'p.sound': return c.kind === 'ears' && c.animal === p.animal;
      case 'p.countUp': return c.kind === 'sign' && c.n === p.n && c.text === String(p.n);
      case 'p.count': return c.kind === 'sign' && c.n === p.n && !c.text;
      case 'p.letters': return c.kind === 'badge' && c.text === p.letter && p.letter === p.letter.toUpperCase();
      case 'p.lower': return c.kind === 'badge' && c.text === p.letter.toLowerCase() && c.text !== p.letter && LOWER_SKIP.indexOf(p.letter) < 0;
      case 'p.initial': { var w = WORD_OF[langOf(lang)][c.animal]; return c.kind === 'ears' && !!w && w.initial === p.letter; }
      case 'p.add': return c.kind === 'badge' && c.n === p.a + p.b && evalText(p.text) === c.n;
      case 'p.sub': return c.kind === 'badge' && c.n === p.a - p.b && c.n >= 0 && evalText(p.text) === c.n;
      case 'p.oddeven': return c.kind === 'badge' && typeof c.n === 'number' && parityOf(c.n) === p.parity;
    }
    return false;
  }
  var CLUE_KINDS = ['hat', 'flag', 'sign', 'ears', 'size', 'badge'];

  /** null when the round is solvable and follows every rule, else the reason. */
  function validate(r) {
    if (!r || !r.places || !r.asks) return 'no places / asks';
    var n = r.places.length, keys = {}, i;
    if (n < 2 || n > MAX_PLACES) return n + ' places';
    if (r.asks.length !== n - 1) return r.asks.length + ' asks for ' + n + ' places';
    var kinds = FC.SEASON_SPOTS[r.season || 0];
    for (i = 0; i < n; i++) {
      var p = r.places[i], c = p.clue;
      if (kinds.indexOf(p.kind) < 0) return 'spot kind ' + p.kind + ' not of season ' + r.season;
      if (i > 0 && p.kind === r.places[i - 1].kind) return 'spot kinds do not alternate';
      if (FC.ANIMALS.indexOf(p.friend) < 0) return 'bad friend ' + p.friend;
      if (!c || CLUE_KINDS.indexOf(c.kind) < 0) return 'bad clue';
      if (c.kind !== CLUE_OF[r.topic]) return 'clue ' + c.kind + ' for topic ' + r.topic;
      if (c.value === undefined || c.value === null || c.nameKind === undefined || c.nameValue === undefined) return 'clue without value / name';
      if (c.color && !FC.PALETTE[c.color]) return 'bad colour ' + c.color;
      if ((c.kind === 'ears' || c.kind === 'size') && c.animal !== p.friend) return 'clue animal is not the friend';
      if (c.kind === 'sign' && !(c.n >= 1 && c.n <= 12)) return 'stars out of 1–12';
      if (c.kind === 'badge' && c.n !== undefined && c.text !== String(c.n)) return 'number text';
      var key = clueKey(c);
      if (keys[key]) return 'duplicate clue ' + key;
      keys[key] = 1;
    }
    if (r.topic !== 'size') {
      var fs = r.places.map(function (x) { return x.friend; });
      if (fs.some(function (a, q) { return fs.indexOf(a) !== q; })) return 'friends repeat';
    } else {
      var pair = r.places.some(function (a, q) { return r.places.some(function (b, j) { return j !== q && b.friend === a.friend && b.clue.size !== a.clue.size; }); });
      if (!pair) return 'size round without a big + small pair';
    }
    if (r.topic === 'colors' && r.age < COLOR_SAFE_BELOW) {
      var cs = r.places.map(function (x) { return x.clue.color; });
      if (clash(cs) || cs.indexOf('pink') >= 0) return 'colour clash ' + cs.join('+');
    }
    if (r.topic === 'shapes' && r.age <= 4) {
      var sc = r.places.map(function (x) { return x.clue.color; });
      if (sc.some(function (c2, q) { return sc.indexOf(c2) !== q; })) return 'flag colours repeat below age 5';
    }
    // every ask: exactly one match among the places still hidden, and that is its answer
    var found = [], prevKey = null;
    for (var k = 0; k < r.asks.length; k++) {
      var a = r.asks[k];
      if (!(a.answer >= 0 && a.answer < n)) return 'ask ' + k + ': bad answer index';
      if (found.indexOf(a.answer) >= 0) return 'ask ' + k + ': answer already found';
      var hits = 0;
      for (i = 0; i < n; i++) if (found.indexOf(i) < 0 && matches(a, r.places[i].clue, r.lang)) hits++;
      if (hits !== 1) return 'ask ' + k + ': ' + hits + ' hidden places match ' + a.promptKey + ' ' + JSON.stringify(a.params);
      if (!matches(a, r.places[a.answer].clue, r.lang)) return 'ask ' + k + ': answer does not match';
      var ak = clueKey(r.places[a.answer].clue);
      if (ak === prevKey) return 'ask ' + k + ': same value as the previous ask';
      prevKey = ak; found.push(a.answer);
    }
    if (r.asks[0].promptKey === 'p.countUp') {
      for (k = 0; k < r.asks.length; k++) if (r.asks[k].params.n !== k + 1) return 'count-up sequence';
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
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new FC.RNG(1);
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
        a = rng.pick(['big', 'small']); var an = rng.pick(FC.ANIMALS);
        show = tSize(an, a); params = { animal: an };
        ch = choicesFrom(rng, 'size', a, ['big', 'small'], 2);
        ch.choices.forEach(function (c) { c.sprite = show.sprite; c.animal = an; c.scale = c.value === 'big' ? 1 : SMALL_SCALE; });
        break;
      }
      case 'animals': {
        a = rng.pick(FC.ANIMALS); params = { animal: a };
        ch = choicesFrom(rng, 'animal', a, FC.ANIMALS, 3); break;
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
        var w0 = rng.pick(FC.WORDS[lang]); a = w0.initial;
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
      default: throw new Error('FC.Content: unknown topic ' + topic);
    }
    return { topic: topic, promptKey: 'talk.' + topic, params: params, show: show, choices: ch.choices, answerId: ch.answerId };
  }

  /** 4 chapter topics for a session. Without rng: FC.AGE_TOPICS. With rng: chapter 1 = the easiest pool topic that was not
   * chapter 1 last time; chapters 2–4 = 3 of the others (preferring topics left out of `last`), sorted easiest first. */
  function topicsFor(age, rng, last) {
    age = ageOf(age);
    if (!rng) return FC.AGE_TOPICS[age].slice();
    var pool = FC.AGE_POOLS[age].slice().sort(function (a, b) { return DIFFICULTY.indexOf(a) - DIFFICULTY.indexOf(b); });
    last = Array.isArray(last) ? last : [];
    var first = pool[0];
    for (var i = 0; i < pool.length; i++) if (pool[i] !== last[0]) { first = pool[i]; break; }
    var rest = pool.filter(function (t) { return t !== first; });
    var fresh = rng.shuffle(rest.filter(function (t) { return last.indexOf(t) < 0; }));
    var old = rng.shuffle(rest.filter(function (t) { return last.indexOf(t) >= 0; }));
    var pick = fresh.concat(old).slice(0, 3).sort(function (a, b) { return DIFFICULTY.indexOf(a) - DIFFICULTY.indexOf(b); });
    return [first].concat(pick);
  }

  FC.Content = {
    makeRound: makeRound, makeTalk: makeTalk, validate: validate, matches: matches, clueKey: clueKey, tokenKey: tokenKey,
    topicsFor: topicsFor, placesFor: placesFor,
    TOPICS: ALL_TOPICS, DIFFICULTY: DIFFICULTY, COLORS: COLORS, COLORS5: COLORS5, SHAPES: FC.SHAPES, SHAPES4: SHAPES4,
    ANIMALS: FC.ANIMALS, PLACES: PLACES, MAX_PLACES: MAX_PLACES, COUNT_RANGE: COUNT_RANGE, SMALL_SCALE: SMALL_SCALE,
    LETTER_POOL: LETTER_POOL, CLASH: CLASH, SAFE_SETS: SAFE_SETS, COLOR_SAFE_BELOW: COLOR_SAFE_BELOW, CLUE_OF: CLUE_OF,
    SEASON_SPOTS: FC.SEASON_SPOTS, ageOf: ageOf, clash: clash, safeSetsOf: safeSetsOf, shapesFor: shapesFor,
    initialsOf: initialsOf, parityOf: parityOf
  };
})(window.FC = window.FC || {});
