/* Lulu's Jungle Tower — JT.PALETTE, JT.ANIMALS, JT.SHAPES, JT.ANIMAL_SOUND, JT.AGE_TOPICS, JT.WORDS, JT.Content
 * (pure + deterministic; DESIGN §5.1)
 *
 *   JT.Content.makeRound(topic, { age, lang, rng, roundIndex, surprise, avoid? }) → round
 *   JT.Content.makeTalk(topic,  { age, lang, rng }) → talk
 *   JT.Content.validate(round) → null | 'reason'   (self-check, called by makeRound)
 *   JT.Content.matches(ask, block, lang) → bool      (independent re-derivation of "is this block what the prompt asks for")
 *   JT.Content.topicsFor(age, rng?, lastTopics?) → the 4 chapter topics
 *
 * round = { topic, age, lang, roundIndex, n /*blocks to stack*\/, asks:[ ask ×n ], surprise, seed }
 * ask   = { promptKey, params, choices:[ block ], answer /*index into choices*\/, nameKind, nameValue }
 * block = { kind, value, color?, shape?, n?, text?, animal?, size?, showDots?, word?, initial?, nameKind, nameValue }
 *   kind  color  {color}                 nameKind 'color'   · shape {shape, color}  'shape'
 *         number {n, text, showDots}     'number'           · dots  {n}            'dots'
 *         animal {animal, word?, initial?} 'animal'         · size  {size:'big'|'small', color}  'size'
 *         letter {text}                  'letter'
 * params per promptKey: p.colors {color} · p.shapes {shape} · p.size {size, color} · p.animals / p.sound {animal} ·
 *   p.countUp {n, first} · p.count {n} · p.letters {letter} · p.lower {letter (capital), lower} · p.initial {letter} ·
 *   p.add {a, b, text:'2 + 3'} · p.sub {a, b, text:'5 − 2'} · p.oddeven {parity:'odd'|'even'}
 */
(function (JT) {
  'use strict';

  // DESIGN §3 answer palette (exact hex)
  JT.PALETTE = {
    red:    { base: '#E84A4A', dark: '#A8282E', light: '#F7A0A0' },
    blue:   { base: '#3C8DE8', dark: '#1F5BA8', light: '#A6CCF5' },
    yellow: { base: '#FFD23F', dark: '#C99A12', light: '#FFEB9C' },
    green:  { base: '#4CC26B', dark: '#2A8343', light: '#A8E6B8' },
    orange: { base: '#FF9A2E', dark: '#C4650C', light: '#FFCB8E' },
    purple: { base: '#8E44AD', dark: '#5E2A78', light: '#C9A0DC' },
    pink:   { base: '#FF8FC0', dark: '#C9558A', light: '#FFCCE2' }      // an answer colour from age 5
  };
  for (var pk in JT.PALETTE) JT.PALETTE[pk].fill = JT.PALETTE[pk].base;   // old field name (shared code)
  var COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple'];
  var COLORS5 = COLORS.concat(['pink']);

  JT.ANIMALS = ['monkey', 'elephant', 'tiger', 'parrot', 'lion', 'frog', 'snake', 'hippo'];
  JT.SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
  JT.ANIMAL_SOUND = { monkey: 'ooh-ooh', elephant: 'toot', tiger: 'grr', parrot: 'squawk', lion: 'roar', frog: 'ribbit', snake: 'hiss', hippo: null };
  var SOUND_ANIMALS = JT.ANIMALS.filter(function (a) { return !!JT.ANIMAL_SOUND[a]; });

  JT.AGE_TOPICS = {
    3: ['colors', 'shapes', 'size', 'animals'],
    4: ['colors', 'shapes', 'count', 'animals'],
    5: ['shapes', 'count', 'letters', 'animals'],
    6: ['lower', 'initial', 'add', 'count'],
    7: ['initial', 'add', 'sub', 'oddeven']
  };
  var ALL_TOPICS = ['colors', 'size', 'shapes', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
  // every age has a POOL of 5 topics; a session plays 4 of them (rotating between sessions, so "Play again" differs)
  JT.AGE_POOLS = {
    3: ['colors', 'animals', 'size', 'shapes', 'count'],
    4: ['colors', 'animals', 'shapes', 'count', 'size'],
    5: ['shapes', 'count', 'letters', 'animals', 'colors'],
    6: ['lower', 'initial', 'add', 'count', 'letters'],
    7: ['initial', 'add', 'sub', 'oddeven', 'count']
  };
  var DIFFICULTY = ['colors', 'animals', 'size', 'shapes', 'letters', 'count', 'lower', 'initial', 'add', 'sub', 'oddeven'];

  // ---- tables (DESIGN §5.1)
  var BLOCKS = { 3: [2, 2, 3, 3], 4: [2, 3, 3, 4], 5: [3, 4, 4, 5], 6: [4, 5, 5, 5], 7: [4, 5, 5, 5] };   // blocks to stack per round (QA: the 4th tower is the big one)
  var MAX_BLOCKS = 5, MAX_CHOICES = 4;
  var COUNT_RANGE = { 3: [1, 4], 4: [1, 5], 5: [1, 10], 6: [2, 10], 7: [3, 10] };   // dots rounds (dice dots 1–10)
  var SMALL_SCALE = 0.7;                                                   // a small block is drawn at 0.7·S
  var ODDEVEN_MAX = { 6: 12, 7: 20 };
  var ADD_MAX = { 6: 10, 7: 20 };
  var SUB_MAX = 10;
  var SHAPES4 = ['circle', 'square', 'triangle', 'star', 'heart'];   // ages ≤ 4; all 8 from age 5
  var LETTER_POOL = { en: 'ABCDEFGHIKLMNOPRSTUW', vi: 'ABCDEGHIKLMNOPSTUVXY' };
  var LOWER_SKIP = 'IL';                                            // capital I and small l look alike
  var MINUS = '−';
  var KIND_OF = { colors: ['color'], shapes: ['shape'], count: ['number', 'dots'], animals: ['animal'], size: ['size'], initial: ['animal'],
    letters: ['letter'], lower: ['letter'], add: ['number'], sub: ['number'], oddeven: ['number'] };

  /* 'initial' words: jungle animals. vi skips digraph words (khỉ starts with "kh", taught as its own sound): a block
   * without a word never matches an initial ask (a safe distractor). */
  function Wd(word, animal, initial) { return { word: word, sprite: 'animal_' + animal, animal: animal, initial: initial }; }
  JT.WORDS = {
    en: [Wd('monkey', 'monkey', 'M'), Wd('elephant', 'elephant', 'E'), Wd('tiger', 'tiger', 'T'), Wd('parrot', 'parrot', 'P'),
      Wd('lion', 'lion', 'L'), Wd('frog', 'frog', 'F'), Wd('snake', 'snake', 'S'), Wd('hippo', 'hippo', 'H')],
    vi: [Wd('voi', 'elephant', 'V'), Wd('hổ', 'tiger', 'H'), Wd('vẹt', 'parrot', 'V'), Wd('sư tử', 'lion', 'S'),
      Wd('ếch', 'frog', 'Ê'), Wd('rắn', 'snake', 'R'), Wd('hà mã', 'hippo', 'H')]
  };
  var WORD_OF = {};
  (function () { for (var l in JT.WORDS) { WORD_OF[l] = {}; JT.WORDS[l].forEach(function (w) { WORD_OF[l][w.animal] = w; }); } })();

  /* Colour-blind / toddler safety (DESIGN §3): below age 5 the ANSWER never sits next to a distractor that clashes with it
   * (blue+purple, red+green, yellow+orange, green+orange, + red+orange: visual QA of the sister game, deuteranopia ΔE 15),
   * and no pink. Two distractors may resemble each other (QA: checking the whole set put yellow in every 3-set and orange
   * was never asked). */
  var COLOR_SAFE_BELOW = 5;
  var CLASH = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange'], ['red', 'orange']];
  function clashPair(a, b) {
    for (var i = 0; i < CLASH.length; i++) if ((CLASH[i][0] === a && CLASH[i][1] === b) || (CLASH[i][0] === b && CLASH[i][1] === a)) return true;
    return false;
  }
  /** Does the answer colour clash with any other colour of the set? */
  function clashAns(ans, cs) { for (var i = 0; i < cs.length; i++) if (cs[i] !== ans && clashPair(ans, cs[i])) return true; return false; }
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
  var SAFE = { 1: safeSetsOf(1), 2: safeSetsOf(2), 3: safeSetsOf(3), 4: safeSetsOf(4) };

  function ageOf(a) { a = Math.round(+a || 4); return a < 3 ? 3 : a > 7 ? 7 : a; }
  function langOf(l) { return l === 'vi' ? 'vi' : 'en'; }
  function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }
  function shapesFor(age) { return age >= 5 ? JT.SHAPES.slice() : SHAPES4.slice(); }
  function letterPool(lang, topic) {
    var P = LETTER_POOL[langOf(lang)].split('');
    return topic === 'lower' ? P.filter(function (c) { return LOWER_SKIP.indexOf(c) < 0; }) : P;
  }
  function parityOf(n) { return n % 2 ? 'odd' : 'even'; }
  function initialsOf(lang) { var s = []; JT.WORDS[langOf(lang)].forEach(function (w) { if (s.indexOf(w.initial) < 0) s.push(w.initial); }); return s; }

  // ---------------- blocks
  function B(kind, value, nameKind, nameValue, extra) {
    var b = { kind: kind, value: value, nameKind: nameKind, nameValue: nameValue };
    if (extra) for (var k in extra) b[k] = extra[k];
    return b;
  }
  function bColor(c) { return B('color', c, 'color', c, { color: c }); }
  function bShape(s, c) { return B('shape', s, 'shape', s, { shape: s, color: c }); }
  function bNumber(n, showDots) { return B('number', n, 'number', n, { n: n, text: String(n), showDots: !!showDots }); }
  function bDots(n) { return B('dots', n, 'dots', n, { n: n }); }
  function bAnimal(a, lang) {
    var w = lang && WORD_OF[langOf(lang)][a], b = B('animal', a, 'animal', a, { animal: a, sprite: 'animal_' + a });
    if (w) { b.word = w.word; b.initial = w.initial; }
    return b;
  }
  function bSize(size, c) { return B('size', size, 'size', size, { size: size, color: c, scale: size === 'big' ? 1 : SMALL_SCALE }); }
  function bLetter(L) { return B('letter', L, 'letter', L, { text: L }); }
  function bText(t, nameKind) { return B('text', t, nameKind || 'text', t, { text: t }); }
  /** Identity of a block (distinct choices, "same block twice in a row"). */
  function blockKey(b) { return [b.kind, b.value, b.color || '', b.shape || '', b.animal || '', b.size || ''].join('|'); }

  function blocksFor(topic, age, ri) {
    var t = BLOCKS[age];
    return t[Math.min(ri, t.length - 1)];
  }
  /** Choices per ask: age 3: 2; 4–5: 3; 6–7: 3 (4 from round 2); warm-up round 0: 2; size: 2 (big + small). */
  function choicesFor(topic, age, ri) {
    if (topic === 'size' || ri === 0 || age <= 3) return 2;
    if (age >= 6 && ri >= 2) return 4;
    return 3;
  }

  /** Numbers near `ans` (±1, ±2, ±3 …) inside [lo, hi], in random order within each distance band. */
  function nearPool(rng, ans, lo, hi) {
    var out = [];
    for (var d = 1; d <= hi - lo; d++) {
      var band = [ans - d, ans + d].filter(function (v) { return v >= lo && v <= hi; });
      rng.shuffle(band); out = out.concat(band);
    }
    return out;
  }

  /**
   * makeRound(topic, { age, lang, rng, roundIndex, surprise, avoid? }) → round. `avoid` = the previous round's last ask:
   * the first ask of this round never repeats it (count-up excepted).
   */
  function makeRound(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new JT.RNG(1), ri = o.roundIndex || 0;
    if (ALL_TOPICS.indexOf(topic) < 0) throw new Error('JT.Content: unknown topic ' + topic);
    var n = o.blocks ? Math.max(1, Math.min(MAX_BLOCKS, o.blocks)) : blocksFor(topic, age, ri);
    var k = o.choices ? Math.max(2, Math.min(MAX_CHOICES, o.choices)) : choicesFor(topic, age, ri);
    var av = o.avoid && o.avoid.promptKey !== 'p.countUp' ? o.avoid.promptKey + JSON.stringify(o.avoid.params) : null;
    var r = null, err = null;
    for (var attempt = 0; attempt < 60; attempt++) {
      r = buildRound(topic, age, lang, rng, ri, n, k);
      r.surprise = o.surprise || null;
      err = validate(r);
      if (!err && av && attempt < 59 && r.asks[0].promptKey + JSON.stringify(r.asks[0].params) === av) { err = 'repeats the previous ask'; continue; }
      if (!err) break;
    }
    if (err) throw new Error('JT.Content: invalid round (' + topic + ', age ' + age + '): ' + err);
    r.seed = (rng.next() * 4294967296) >>> 0;
    return r;
  }

  function finishAsk(promptKey, params, answerBlock, distractors, rng) {
    var choices = rng.shuffle([answerBlock].concat(distractors));
    return { promptKey: promptKey, params: params, choices: choices, answer: choices.indexOf(answerBlock),
      nameKind: answerBlock.nameKind, nameValue: answerBlock.nameValue };
  }

  /** k distinct colours holding `ans`: below age 5 every distractor is clash-free WITH THE ANSWER (null if too few). */
  function colourSet(rng, age, ans, k, pool) {
    var cand = (age < COLOR_SAFE_BELOW ? COLORS : pool).filter(function (c) { return c !== ans && (age >= COLOR_SAFE_BELOW || !clashPair(ans, c)); });
    if (cand.length < k - 1) return null;
    return rng.shuffle([ans].concat(rng.shuffle(cand).slice(0, k - 1)));
  }
  function ableColours(age, k) {
    if (age >= COLOR_SAFE_BELOW) return COLORS5.slice();
    return COLORS.filter(function (c) { return COLORS.filter(function (x) { return x !== c && !clashPair(c, x); }).length >= k - 1; });
  }

  function buildRound(topic, age, lang, rng, ri, n, k) {
    var asks = [], prev = null, prevD = null, q, i;
    var soundOff = rng.int(0, 1), parityOff = rng.int(0, 2);
    var countUp = topic === 'count' && ri <= 2;   // towers 0–2 count up, tower 3 dice dots (ascending)
    var dotVals = topic === 'count' && !countUp ? dotSequence(rng, age, n) : null;
    var start = countUp ? (age >= 6 ? rng.int(2, 10 - n) : 1) : 1;
    for (q = 0; q < n; q++) {
      var ask = null;
      for (var t = 0; t < 30 && !ask; t++) {
        ask = buildAsk(topic, age, lang, rng, ri, k, q, prev, { soundOff: soundOff, parityOff: parityOff, start: start, n: n, countUp: countUp, dotVals: dotVals });
        if (!ask) continue;
        // distractors vary every ask (a different set from the previous ask's)
        var dk = ask.choices.filter(function (c, j) { return j !== ask.answer; }).map(blockKey).sort().join(',');
        if (prevD !== null && dk === prevD && t < 29) { ask = null; continue; }
        prevD = dk;
      }
      asks.push(ask);
      prev = ask;
    }
    return { topic: topic, age: age, lang: lang, roundIndex: ri, n: n, choices: k, surprise: null, asks: asks };
  }

  /** n distinct dot counts in ascending order from the age's range (spread out when the range allows it). */
  function dotSequence(rng, age, n) {
    var R = COUNT_RANGE[age], pool = range(R[0], R[1]);
    return rng.shuffle(pool).slice(0, n).sort(function (a, b) { return a - b; });
  }
  function prevAns(prev) { return prev ? prev.choices[prev.answer] : null; }

  function buildAsk(topic, age, lang, rng, ri, k, q, prev, st) {
    var pa = prevAns(prev), ans, ds = [], i, pool;
    switch (topic) {
      case 'colors': {
        pool = ableColours(age, k).filter(function (c) { return !pa || c !== pa.color; });
        var c = rng.pick(pool), cs = colourSet(rng, age, c, k, COLORS5);
        if (!cs) return null;
        ans = bColor(c);
        cs.forEach(function (x) { if (x !== c) ds.push(bColor(x)); });
        return finishAsk('p.colors', { color: c }, ans, ds, rng);
      }
      case 'shapes': {
        var sp = rng.shuffle(shapesFor(age).filter(function (s) { return !pa || s !== pa.shape; }));
        var s0 = sp[0], others = rng.shuffle(shapesFor(age).filter(function (s) { return s !== s0; })).slice(0, k - 1);
        var cols;
        if (age <= 4) {   // every shape in its own colour; no distractor colour clashes with the answer's (below age 5)
          var ca0 = rng.pick(ableColours(age, k));
          cols = colourSet(rng, age, ca0, k, COLORS);
          cols.splice(cols.indexOf(ca0), 1); cols.unshift(ca0);
        } else {          // age 5+: mixed colours, one distractor in the SAME colour as the answer (colour is no cue)
          var ca = rng.pick(COLORS5);
          cols = [ca, ca];
          for (i = 2; i < k; i++) cols.push(rng.pick(COLORS5));
        }
        ans = bShape(s0, cols[0]);
        for (i = 0; i < k - 1; i++) ds.push(bShape(others[i], cols[i + 1]));
        return finishAsk('p.shapes', { shape: s0 }, ans, ds, rng);
      }
      case 'count': {
        var R = COUNT_RANGE[age];
        if (st.countUp) {   // count up: numeral + dots, the tower reads start, start+1, … from the bottom
          var v = st.start + q, hiC = Math.max(R[1], st.start + st.n + 1, 5), loC = 1;
          ans = bNumber(v, true);
          pool = nearPool(rng, v, loC, Math.min(10, hiC));
          for (i = 0; i < k - 1; i++) ds.push(bNumber(pool[i], true));
          return finishAsk('p.countUp', { n: v, first: q === 0 }, ans, ds, rng);
        }
        var a = st.dotVals[q];   // ascending: the tower reads 1-2-4-5 dots from the bottom (the closing count matches the order)
        if (age <= 4) {  // ≥ 2 apart from the answer when possible
          var far = rng.shuffle(range(R[0], R[1]).filter(function (x) { return Math.abs(x - a) >= 2; }));
          var near = rng.shuffle(range(R[0], R[1]).filter(function (x) { return Math.abs(x - a) === 1; }));
          pool = far.concat(near);
        } else pool = nearPool(rng, a, R[0], R[1]).slice(0, Math.max(k + 1, 4));
        if (age > 4) rng.shuffle(pool);
        if (pool.length < k - 1) return null;
        ans = bDots(a);
        for (i = 0; i < k - 1; i++) ds.push(bDots(pool[i]));
        return finishAsk('p.count', { n: a }, ans, ds, rng);
      }
      case 'animals': {
        var bySound = age >= 4 && ri >= 2 && (q + st.soundOff) % 2 === 0;
        pool = (bySound ? SOUND_ANIMALS : JT.ANIMALS).filter(function (x) { return !pa || x !== pa.animal; });
        var an = rng.pick(pool);
        var rest = rng.shuffle(JT.ANIMALS.filter(function (x) { return x !== an; })).slice(0, k - 1);
        ans = bAnimal(an, lang);
        rest.forEach(function (x) { ds.push(bAnimal(x, lang)); });
        return finishAsk(bySound ? 'p.sound' : 'p.animals', { animal: an }, ans, ds, rng);
      }
      case 'size': {
        // two blocks of the SAME colour, one big + one small; a new colour every ask; never 3× the same size in a row
        pool = (age < COLOR_SAFE_BELOW ? COLORS : COLORS5).filter(function (c) { return !pa || c !== pa.color; });
        var col = rng.pick(pool), sz = rng.chance(0.5) ? 'big' : 'small';
        if (prev && prev._run >= 2 && pa.size === sz) sz = sz === 'big' ? 'small' : 'big';
        ans = bSize(sz, col);
        ds.push(bSize(sz === 'big' ? 'small' : 'big', col));
        var A = finishAsk('p.size', { size: sz, color: col }, ans, ds, rng);
        A._run = prev && pa.size === sz ? (prev._run || 1) + 1 : 1;
        return A;
      }
      case 'initial': {
        var W = JT.WORDS[lang].filter(function (w) { return !pa || w.animal !== pa.animal; });
        var w0 = rng.pick(W);
        // distractors: animals whose initial differs (or that have no word in this language)
        var cand = rng.shuffle(JT.ANIMALS.filter(function (x) {
          if (x === w0.animal) return false;
          var wx = WORD_OF[lang][x];
          return !wx || wx.initial !== w0.initial;
        })).slice(0, k - 1);
        if (cand.length < k - 1) return null;
        ans = bAnimal(w0.animal, lang);
        cand.forEach(function (x) { ds.push(bAnimal(x, lang)); });
        return finishAsk('p.initial', { letter: w0.initial }, ans, ds, rng);
      }
      case 'letters': case 'lower': {
        var P = rng.shuffle(letterPool(lang, topic).filter(function (x) { return !pa || x !== pa.text.toUpperCase(); }));
        var Ls = P.slice(0, k), L0 = Ls[0];
        var mk = function (x) { return bLetter(topic === 'lower' ? x.toLowerCase() : x); };
        ans = mk(L0);
        for (i = 1; i < k; i++) ds.push(mk(Ls[i]));
        return finishAsk(topic === 'lower' ? 'p.lower' : 'p.letters',
          topic === 'lower' ? { letter: L0, lower: L0.toLowerCase() } : { letter: L0 }, ans, ds, rng);
      }
      case 'add': {
        var top = ADD_MAX[age] || 10, lo = 2, hiA = ri === 0 ? Math.min(6, top) : top;
        var sum = rng.pick(range(lo, hiA).filter(function (x) { return !pa || x !== pa.n; }));
        var x1 = rng.int(1, sum - 1);
        pool = nearPool(rng, sum, 0, top + 2);
        ans = bNumber(sum, false);
        for (i = 0; i < k - 1; i++) ds.push(bNumber(pool[i], false));
        return finishAsk('p.add', { a: x1, b: sum - x1, text: x1 + ' + ' + (sum - x1) }, ans, ds, rng);
      }
      case 'sub': {
        var hiS = ri === 0 ? 5 : SUB_MAX - 1;
        var d = rng.pick(range(0, hiS).filter(function (x) { return !pa || x !== pa.n; }));
        var kk = rng.int(1, SUB_MAX - d), big = d + kk;
        pool = nearPool(rng, d, 0, SUB_MAX);
        ans = bNumber(d, false);
        for (i = 0; i < k - 1; i++) ds.push(bNumber(pool[i], false));
        return finishAsk('p.sub', { a: big, b: kk, text: big + ' ' + MINUS + ' ' + kk }, ans, ds, rng);
      }
      case 'oddeven': {
        var hiO = ODDEVEN_MAX[age] || 12;
        if ((q + st.parityOff) % 3 === 2) {   // every 3rd ask a sum (variety; the tower still reads numbers)
          var s2 = rng.pick(range(2, Math.min(10, hiO)).filter(function (x) { return !pa || x !== pa.n; })), y1 = rng.int(1, s2 - 1);
          pool = nearPool(rng, s2, 0, hiO);
          ans = bNumber(s2, false);
          for (i = 0; i < k - 1; i++) ds.push(bNumber(pool[i], false));
          return finishAsk('p.add', { a: y1, b: s2 - y1, text: y1 + ' + ' + (s2 - y1) }, ans, ds, rng);
        }
        var par = rng.chance(0.5) ? 'odd' : 'even';
        var same = range(1, hiO).filter(function (x) { return parityOf(x) === par && (!pa || x !== pa.n); });
        var opp = rng.shuffle(range(1, hiO).filter(function (x) { return parityOf(x) !== par; }));
        ans = bNumber(rng.pick(same), false);
        for (i = 0; i < k - 1; i++) ds.push(bNumber(opp[i], false));
        return finishAsk('p.oddeven', { parity: par }, ans, ds, rng);
      }
    }
    return null;
  }

  // ---------------- self-check ----------------
  function evalText(t) {
    var m = /^(\d+) ([+−]) (\d+)$/.exec(t); if (!m) return NaN;
    return m[2] === '+' ? +m[1] + +m[3] : +m[1] - +m[3];
  }
  /** Does the block answer the ask's prompt? (re-derived from promptKey + params + block fields only) */
  function matches(ask, b, lang) {
    var p = ask.params || {};
    if (!b) return false;
    switch (ask.promptKey) {
      case 'p.colors': return b.kind === 'color' && b.color === p.color && b.value === p.color;
      case 'p.shapes': return b.kind === 'shape' && b.shape === p.shape;
      case 'p.size': return b.kind === 'size' && b.size === p.size;
      case 'p.animals': return b.kind === 'animal' && b.animal === p.animal;
      case 'p.sound': return b.kind === 'animal' && b.animal === p.animal && !!JT.ANIMAL_SOUND[p.animal];
      case 'p.countUp': return b.kind === 'number' && b.n === p.n && b.text === String(p.n) && b.showDots;
      case 'p.count': return b.kind === 'dots' && b.n === p.n;
      case 'p.letters': return b.kind === 'letter' && b.text === p.letter && p.letter === p.letter.toUpperCase();
      case 'p.lower': return b.kind === 'letter' && b.text === p.letter.toLowerCase() && b.text !== p.letter && LOWER_SKIP.indexOf(p.letter) < 0;
      case 'p.initial': { var w = WORD_OF[langOf(lang)][b.animal]; return b.kind === 'animal' && !!w && w.initial === p.letter; }
      case 'p.add': return b.kind === 'number' && b.n === p.a + p.b && evalText(p.text) === b.n;
      case 'p.sub': return b.kind === 'number' && b.n === p.a - p.b && b.n >= 0 && evalText(p.text) === b.n;
      case 'p.oddeven': return b.kind === 'number' && typeof b.n === 'number' && parityOf(b.n) === p.parity;
    }
    return false;
  }
  var BLOCK_KINDS = ['color', 'shape', 'number', 'dots', 'animal', 'size', 'letter', 'text'];

  /** null when the round is solvable and follows every rule, else the reason. */
  function validate(r) {
    if (!r || !r.asks) return 'no asks';
    if (r.asks.length !== r.n || r.n < 1 || r.n > MAX_BLOCKS) return r.asks.length + ' asks for ' + r.n + ' blocks';
    var prevKey = null, prevVal = null, prevD = null;
    for (var q = 0; q < r.asks.length; q++) {
      var a = r.asks[q];
      if (!a || !a.choices) return 'ask ' + q + ' missing';
      var k = a.choices.length;
      if (k < 2 || k > MAX_CHOICES) return 'ask ' + q + ': ' + k + ' choices';
      if (r.choices && k !== r.choices) return 'ask ' + q + ': ' + k + ' choices, want ' + r.choices;
      if (!(a.answer >= 0 && a.answer < k)) return 'ask ' + q + ': bad answer index';
      var keys = {}, hits = 0, cs = [];
      for (var i = 0; i < k; i++) {
        var b = a.choices[i];
        if (!b || BLOCK_KINDS.indexOf(b.kind) < 0) return 'ask ' + q + ': bad block';
        if (KIND_OF[r.topic].indexOf(b.kind) < 0) return 'block ' + b.kind + ' for topic ' + r.topic;
        if (b.value === undefined || b.value === null || b.nameKind === undefined || b.nameValue === undefined) return 'block without value / name';
        if (b.color && !JT.PALETTE[b.color]) return 'bad colour ' + b.color;
        if (b.animal && JT.ANIMALS.indexOf(b.animal) < 0) return 'bad animal ' + b.animal;
        if ((b.kind === 'dots' || b.kind === 'number') && !(b.n >= 0 && b.n <= 20)) return 'number out of range';
        if (b.kind === 'dots' && !(b.n >= 1 && b.n <= 10)) return 'dots out of 1–10';
        if (b.kind === 'number' && b.text !== String(b.n)) return 'number text';
        if (b.color) cs.push(b.color);
        var key = blockKey(b);
        if (keys[key]) return 'ask ' + q + ': duplicate block ' + key;
        keys[key] = 1;
        if (matches(a, b, r.lang)) hits++;
      }
      if (hits !== 1) return 'ask ' + q + ': ' + hits + ' blocks match ' + a.promptKey + ' ' + JSON.stringify(a.params);
      var A = a.choices[a.answer];
      if (!matches(a, A, r.lang)) return 'ask ' + q + ': answer does not match';
      if (a.nameKind !== A.nameKind || a.nameValue !== A.nameValue) return 'ask ' + q + ': name fields';
      if (r.age < COLOR_SAFE_BELOW && cs.length) {
        var uniq = cs.filter(function (c, j) { return cs.indexOf(c) === j; });
        var ac = a.choices[a.answer].color;
        if ((ac && clashAns(ac, uniq)) || uniq.indexOf('pink') >= 0) return 'ask ' + q + ': colour clash ' + ac + ' vs ' + uniq.join('+');
        if (r.topic === 'shapes' && uniq.length !== cs.length) return 'ask ' + q + ': shape colours repeat below age 5';
      }
      if (r.topic === 'size') {
        if (a.choices[0].color !== a.choices[1].color || a.choices[0].size === a.choices[1].size) return 'size: not one colour big + small';
      }
      if (a.promptKey === 'p.sound' && !JT.ANIMAL_SOUND[a.params.animal]) return 'sound ask without a sound';
      var ak = blockKey(A), av = String(A.value) + '|' + (A.color || '');
      if (ak === prevKey) return 'ask ' + q + ': same block as the previous ask';
      if (r.topic !== 'size' && av === prevVal) return 'ask ' + q + ': same value as the previous ask';
      var dk = a.choices.filter(function (c, j) { return j !== a.answer; }).map(blockKey).sort().join(',');
      if (dk === prevD) return 'ask ' + q + ': same distractors as the previous ask';
      prevKey = ak; prevVal = av; prevD = dk;
    }
    if (r.asks[0].promptKey === 'p.count') {
      for (q = 1; q < r.asks.length; q++) if (!(r.asks[q].params.n > r.asks[q - 1].params.n)) return 'dot asks not ascending';
    }
    if (r.asks[0].promptKey === 'p.countUp') {
      var s0 = r.asks[0].params.n;
      for (q = 0; q < r.asks.length; q++) if (r.asks[q].promptKey !== 'p.countUp' || r.asks[q].params.n !== s0 + q) return 'count-up sequence';
      if (r.age <= 5 && s0 !== 1) return 'count-up starts at ' + s0;
    }
    return null;
  }

  // ---------------- Talk time ----------------
  /* talk = { topic, promptKey:'talk.<topic>', params, show: a block (or null), choices:[ block + {id} ], answerId }
   * Choices are pictures the BlockArt can draw (kinds color, shape, number, dots, animal, letter, size; parity from age 7). */
  function choicesFrom(rng, answer, pool, count, mk) {
    var vals = [answer], p2 = rng.shuffle(pool.filter(function (v) { return v !== answer; }));
    for (var i = 0; vals.length < count && i < p2.length; i++) if (vals.indexOf(p2[i]) < 0) vals.push(p2[i]);
    rng.shuffle(vals);
    var ch = [], ans = null;
    for (var j = 0; j < vals.length; j++) {
      var b = mk(vals[j]); b.id = 'c' + j;
      ch.push(b); if (vals[j] === answer) ans = 'c' + j;
    }
    return { choices: ch, answerId: ans };
  }
  function nearNumbers(ans, lo, hi) {
    var d = [], c = [ans - 1, ans + 1, ans - 2, ans + 2, ans + 3, ans - 3];
    for (var i = 0; i < c.length; i++) if (c[i] >= lo && c[i] <= hi) d.push(c[i]);
    return d;
  }

  function makeTalk(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new JT.RNG(1);
    var show = null, params = {}, ch, a, k;
    switch (topic) {
      case 'colors': {
        a = rng.pick(ableColours(age, 3)); show = bColor(a);
        var pool = age < COLOR_SAFE_BELOW ? colourSet(rng, age, a, 3, COLORS) : COLORS5;
        ch = choicesFrom(rng, a, pool, 3, bColor); break;
      }
      case 'shapes': {
        var sp = shapesFor(age), col = rng.pick(COLORS); a = rng.pick(sp); show = bShape(a, col);
        ch = choicesFrom(rng, a, sp, 3, function (s) { return bShape(s, col); }); break;
      }
      case 'size': {
        a = rng.pick(['big', 'small']); var c2 = rng.pick(COLORS);
        show = bSize(a, c2); params = { color: c2 };
        ch = choicesFrom(rng, a, ['big', 'small'], 2, function (s) { return bSize(s, c2); });
        break;
      }
      case 'animals': {
        a = rng.pick(JT.ANIMALS); params = { animal: a };
        ch = choicesFrom(rng, a, JT.ANIMALS, 3, function (x) { return bAnimal(x, lang); }); break;
      }
      case 'count': {
        var rr = { 3: [1, 4], 4: [1, 5], 5: [2, 8], 6: [3, 10], 7: [3, 10] }[age];
        a = rng.int(rr[0], rr[1]); show = bDots(a);
        ch = choicesFrom(rng, a, nearNumbers(a, 1, Math.max(rr[1], a + 2)), 3, function (x) { return bNumber(x, false); }); break;
      }
      case 'letters':
      case 'lower': {
        var P = letterPool(lang, topic); a = rng.pick(P);
        show = bLetter(topic === 'lower' ? a.toLowerCase() : a);
        ch = choicesFrom(rng, a, P, 3, bLetter); break;
      }
      case 'initial': {
        var w0 = rng.pick(JT.WORDS[lang]); a = w0.initial;
        show = bAnimal(w0.animal, lang); params = { word: w0.word, animal: w0.animal };
        var lp = LETTER_POOL[lang].split('').concat(initialsOf(lang).filter(function (x) { return LETTER_POOL[lang].indexOf(x) < 0; }));
        ch = choicesFrom(rng, a, lp, 3, bLetter); break;
      }
      case 'add': {
        var hi = ADD_MAX[age] || 10; a = rng.int(age >= 7 ? 4 : 2, hi); k = rng.int(1, a - 1);
        var t1 = k + ' + ' + (a - k); show = bText(t1, 'sum');
        ch = choicesFrom(rng, a, nearNumbers(a, 0, hi + 2), 3, function (x) { return bNumber(x, false); }); break;
      }
      case 'sub': {
        a = rng.int(0, 9); k = rng.int(1, 10 - a);
        var t2 = (a + k) + ' ' + MINUS + ' ' + k; show = bText(t2, 'diff');
        ch = choicesFrom(rng, a, nearNumbers(a, 0, 10), 3, function (x) { return bNumber(x, false); }); break;
      }
      case 'oddeven': {
        var nn = rng.int(1, 20); a = parityOf(nn);
        show = bNumber(nn, false);
        ch = choicesFrom(rng, a, ['odd', 'even'], 2, function (x) { return B('parity', x, 'parity', x, {}); }); break;
      }
      default: throw new Error('JT.Content: unknown topic ' + topic);
    }
    return { topic: topic, promptKey: 'talk.' + topic, params: params, show: show, choices: ch.choices, answerId: ch.answerId };
  }

  /** 4 chapter topics for a session. Without rng: JT.AGE_TOPICS. With rng: chapter 1 = the easiest pool topic that was not
   * chapter 1 last time; chapters 2–4 = 3 of the others (preferring topics left out of `last`), sorted easiest first. */
  function topicsFor(age, rng, last) {
    age = ageOf(age);
    if (!rng) return JT.AGE_TOPICS[age].slice();
    var pool = JT.AGE_POOLS[age].slice().sort(function (a, b) { return DIFFICULTY.indexOf(a) - DIFFICULTY.indexOf(b); });
    last = Array.isArray(last) ? last : [];
    var first = pool[0];
    for (var i = 0; i < pool.length; i++) if (pool[i] !== last[0]) { first = pool[i]; break; }
    var rest = pool.filter(function (t) { return t !== first; });
    var fresh = rng.shuffle(rest.filter(function (t) { return last.indexOf(t) < 0; }));
    var old = rng.shuffle(rest.filter(function (t) { return last.indexOf(t) >= 0; }));
    var pick = fresh.concat(old).slice(0, 3).sort(function (a, b) { return DIFFICULTY.indexOf(a) - DIFFICULTY.indexOf(b); });
    return [first].concat(pick);
  }

  JT.Content = {
    makeRound: makeRound, makeTalk: makeTalk, validate: validate, matches: matches, blockKey: blockKey,
    topicsFor: topicsFor, blocksFor: blocksFor, choicesFor: choicesFor,
    TOPICS: ALL_TOPICS, DIFFICULTY: DIFFICULTY, COLORS: COLORS, COLORS5: COLORS5, SHAPES: JT.SHAPES, SHAPES4: SHAPES4,
    ANIMALS: JT.ANIMALS, SOUND_ANIMALS: SOUND_ANIMALS, BLOCKS: BLOCKS, MAX_BLOCKS: MAX_BLOCKS, MAX_CHOICES: MAX_CHOICES,
    COUNT_RANGE: COUNT_RANGE, SMALL_SCALE: SMALL_SCALE, LETTER_POOL: LETTER_POOL, CLASH: CLASH, SAFE_SETS: SAFE[3],
    COLOR_SAFE_BELOW: COLOR_SAFE_BELOW, KIND_OF: KIND_OF, ageOf: ageOf, clash: clash, clashPair: clashPair, clashAns: clashAns, safeSetsOf: safeSetsOf,
    shapesFor: shapesFor, initialsOf: initialsOf, parityOf: parityOf, maxBlocks: function (age) { return Math.max.apply(null, BLOCKS[ageOf(age)]); }
  };
})(window.JT = window.JT || {});
