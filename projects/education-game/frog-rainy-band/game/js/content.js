/* Bop's Rainy Band — RB.PALETTE, RB.ANIMALS, RB.SHAPES, RB.NOTE, RB.ANIMAL_SOUND, RB.AGE_TOPICS, RB.WORDS, RB.Content
 * (pure + deterministic; DESIGN §5.1)
 *
 *   RB.Content.makeRound(topic, { age, lang, rng, roundIndex, surprise, avoid?, prevMembers? }) → round
 *   RB.Content.makeTalk(topic,  { age, lang, rng }) → talk
 *   RB.Content.validate(round) → null | 'reason'   (self-check, called by makeRound)
 *   RB.Content.matches(ask, item, lang) → bool      (independent re-derivation of "is this member what the prompt asks for")
 *   RB.Content.topicsFor(age, rng?, lastTopics?) → the 4 chapter topics
 *
 * round = { topic, age, lang, roundIndex, n /*notes in the song = asks*\/, members:[ item ], band:[ item ] /*who sits on the
 *           stage: = members, or 2–3 plain drums in a drum-mode round*\/, asks:[ ask ×n ], mode:'pick'|'drum'|'listen',
 *           surprise, key /*identity of the member set*\/, seed }
 * ask   = { mode:'pick'|'drum'|'listen', promptKey, params, answer /*index into members; -1 in mode drum*\/, n? /*drum/listen
 *           count*\/, nameKind, nameValue }
 * item  = { kind, value, color?, shape?, n?, text?, animal?, size?, showDots?, word?, initial?, plain?, nameKind, nameValue,
 *           pitch /*MIDI*\/ }
 *   kind  color {color} nameKind 'color' · shape {shape, color} 'shape' · size {size:'big'|'small', color} 'size'
 *         animal {animal, word?, initial?} 'animal' · number {n, text, showDots} 'number' · letter {text} 'letter'
 *         text {text:'', plain:true} nameKind 'drum' — a plain wooden accompaniment drum (drum-mode rounds, never asked)
 * params per promptKey: p.colors {color} · p.shapes {shape} · p.size {size, color} · p.animals / p.sound {animal} ·
 *   p.drum {n} · p.listen {n} (n is NOT to be spoken: the child counts the booms) · p.letters {letter} ·
 *   p.lower {letter (capital), lower} · p.initial {letter} · p.add {a, b, text:'2 + 3'} · p.sub {a, b, text:'5 − 2'} ·
 *   p.oddeven {parity:'odd'|'even'}
 */
(function (RB) {
  'use strict';

  // DESIGN §3 answer palette (exact hex)
  RB.PALETTE = {
    red:    { base: '#E84A4A', dark: '#A8282E', light: '#F7A0A0' },
    blue:   { base: '#3C8DE8', dark: '#1F5BA8', light: '#A6CCF5' },
    yellow: { base: '#FFD23F', dark: '#C99A12', light: '#FFEB9C' },
    green:  { base: '#4CC26B', dark: '#2A8343', light: '#A8E6B8' },
    orange: { base: '#FF9A2E', dark: '#C4650C', light: '#FFCB8E' },
    purple: { base: '#8E44AD', dark: '#6840A8', light: '#D2BDF3' },
    pink:   { base: '#FF8FC0', dark: '#C9558A', light: '#FFCCE2' }      // an answer colour from age 5
  };
  for (var pk in RB.PALETTE) RB.PALETTE[pk].fill = RB.PALETTE[pk].base;   // old field name (shared code)
  var COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple'];
  var COLORS5 = COLORS.concat(['pink']);

  RB.ANIMALS = ['duck', 'cat', 'dog', 'cow', 'sheep', 'hen', 'bird', 'pig'];
  RB.SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
  RB.ANIMAL_SOUND = { duck: 'quack', cat: 'meow', dog: 'woof', cow: 'moo', sheep: 'baa', hen: 'cluck', bird: 'tweet', pig: 'oink' };
  RB.NOTE = { red: 60, orange: 62, yellow: 64, green: 65, blue: 67, purple: 69, pink: 71 };   // MIDI pitch per colour
  var PENTA = [60, 62, 64, 67, 69];                // C D E G A: pitch by slot for non-colour members
  var SIZE_PITCH = { big: 53, small: 72 };         // big drum low, small drum high
  var NOTE_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];   // note colours of a count round (by n)
  var SOUND_ANIMALS = RB.ANIMALS.filter(function (a) { return !!RB.ANIMAL_SOUND[a]; });

  RB.AGE_TOPICS = {
    3: ['colors', 'shapes', 'size', 'animals'],
    4: ['colors', 'shapes', 'count', 'animals'],
    5: ['shapes', 'count', 'letters', 'animals'],
    6: ['lower', 'initial', 'add', 'count'],
    7: ['initial', 'add', 'sub', 'oddeven']
  };
  var ALL_TOPICS = ['colors', 'size', 'shapes', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
  // every age has a POOL of 5 topics; a session plays 4 of them (rotating between sessions, so "Play again" differs)
  RB.AGE_POOLS = {
    3: ['colors', 'animals', 'size', 'shapes', 'count'],
    4: ['colors', 'animals', 'shapes', 'count', 'size'],
    5: ['shapes', 'count', 'letters', 'animals', 'colors'],
    6: ['lower', 'initial', 'add', 'count', 'letters'],
    7: ['initial', 'add', 'sub', 'oddeven', 'count']
  };
  var DIFFICULTY = ['colors', 'animals', 'size', 'shapes', 'letters', 'count', 'lower', 'initial', 'add', 'sub', 'oddeven'];

  // ---- tables (DESIGN §5.1)
  var NOTES = { 3: [2, 2, 3, 3], 4: [2, 3, 4, 4], 5: [3, 4, 4, 5], 6: [4, 4, 5, 5], 7: [4, 4, 5, 5] };   // notes (asks) per round
  // counting rounds: every note is a whole counting task (n drum taps / n beats + the answer), so fewer notes per song
  // (sim: count chapters at the general table took 105 s at age 4 and 150–160 s at ages 6–7)
  var COUNT_NOTES = { 3: [2, 2, 2, 2], 4: [2, 3, 3, 3], 5: [2, 3, 3, 3], 6: [3, 3, 3, 3], 7: [3, 3, 3, 3] };
  var MAX_NOTES = 5, MAX_MEMBERS = 4;
  var DRUM_RANGE = { 3: [1, 3], 4: [1, 5], 5: [1, 6], 6: [2, 7], 7: [3, 8] };       // "drum N times" (mode drum)
  var LISTEN_RANGE = { 3: [1, 3], 4: [1, 5], 5: [1, 10], 6: [2, 12], 7: [3, 12] };  // "how many booms?" (mode listen)
  var DOTS_MAX = 5;                                // number drums show dots for n ≤ 5 at ages ≤ 5 (none from 6)
  var SMALL_SCALE = 0.68;                          // a small drum is drawn at 0.68·S
  var ODDEVEN_MAX = { 6: 12, 7: 20 };
  var ADD_MAX = { 6: 10, 7: 20 };
  var SUB_MAX = 10;
  var SHAPES4 = ['circle', 'square', 'triangle', 'star', 'heart'];   // ages ≤ 4; all 8 from age 5
  var LETTER_POOL = { en: 'ABCDEFGHIKLMNOPRSTUW', vi: 'ABCDEGHIKLMNOPSTUVXY' };
  var LOWER_SKIP = 'IL';                                            // capital I and small l look alike
  var MINUS = '−';
  var KIND_OF = { colors: ['color'], shapes: ['shape'], count: ['number'], animals: ['animal'], size: ['size'], initial: ['animal'],
    letters: ['letter'], lower: ['letter'], add: ['number'], sub: ['number'], oddeven: ['number'] };

  /* 'initial' words: the garden animals of the band. vi skips digraph words (chó, chim start with "ch", taught as its own
   * sound): an animal without a word is never a member of an initial round. */
  function Wd(word, animal, initial) { return { word: word, sprite: 'animal_' + animal, animal: animal, initial: initial }; }
  RB.WORDS = {
    en: [Wd('duck', 'duck', 'D'), Wd('cat', 'cat', 'C'), Wd('dog', 'dog', 'D'), Wd('cow', 'cow', 'C'),
      Wd('sheep', 'sheep', 'S'), Wd('hen', 'hen', 'H'), Wd('bird', 'bird', 'B'), Wd('pig', 'pig', 'P')],
    vi: [Wd('vịt', 'duck', 'V'), Wd('mèo', 'cat', 'M'), Wd('bò', 'cow', 'B'), Wd('cừu', 'sheep', 'C'),
      Wd('gà', 'hen', 'G'), Wd('heo', 'pig', 'H')]
  };
  var WORD_OF = {};
  (function () { for (var l in RB.WORDS) { WORD_OF[l] = {}; RB.WORDS[l].forEach(function (w) { WORD_OF[l][w.animal] = w; }); } })();

  /* Colour-blind / toddler safety (DESIGN §3): below age 5 the whole band (every member is asked, so every pair matters)
   * never holds blue+purple, red+green, yellow+orange or green+orange, and no pink. */
  var COLOR_SAFE_BELOW = 5;
  var CLASH = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange']];
  function clashPair(a, b) {
    for (var i = 0; i < CLASH.length; i++) if ((CLASH[i][0] === a && CLASH[i][1] === b) || (CLASH[i][0] === b && CLASH[i][1] === a)) return true;
    return false;
  }
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
  function shapesFor(age) { return age >= 5 ? RB.SHAPES.slice() : SHAPES4.slice(); }
  function letterPool(lang, topic) {
    var P = LETTER_POOL[langOf(lang)].split('');
    return topic === 'lower' ? P.filter(function (c) { return LOWER_SKIP.indexOf(c) < 0; }) : P;
  }
  function parityOf(n) { return n % 2 ? 'odd' : 'even'; }
  function initialsOf(lang) { var s = []; RB.WORDS[langOf(lang)].forEach(function (w) { if (s.indexOf(w.initial) < 0) s.push(w.initial); }); return s; }

  // ---------------- items (band members)
  function B(kind, value, nameKind, nameValue, extra) {
    var b = { kind: kind, value: value, nameKind: nameKind, nameValue: nameValue };
    if (extra) for (var k in extra) b[k] = extra[k];
    return b;
  }
  function bColor(c) { return B('color', c, 'color', c, { color: c, pitch: RB.NOTE[c] }); }
  function bShape(s, c) { return B('shape', s, 'shape', s, { shape: s, color: c }); }
  function bNumber(n, showDots) { return B('number', n, 'number', n, { n: n, text: String(n), showDots: !!showDots }); }
  function bDots(n) { return B('dots', n, 'dots', n, { n: n }); }
  function bAnimal(a, lang) {
    var w = lang && WORD_OF[langOf(lang)][a], b = B('animal', a, 'animal', a, { animal: a, sprite: 'animal_' + a });
    if (w) { b.word = w.word; b.initial = w.initial; }
    return b;
  }
  function bSize(size, c) { return B('size', size, 'size', size, { size: size, color: c, scale: size === 'big' ? 1 : SMALL_SCALE, pitch: SIZE_PITCH[size] }); }
  function bLetter(L) { return B('letter', L, 'letter', L, { text: L }); }
  function bText(t, nameKind) { return B('text', t, nameKind || 'text', t, { text: t }); }
  function bPlain() { return B('text', '', 'drum', '', { text: '', plain: true }); }
  /** Identity of an item (distinct members, "same band twice"). */
  function itemKey(b) { return [b.kind, b.value, b.color || '', b.shape || '', b.animal || '', b.size || ''].join('|'); }
  function setKey(items) { return items.map(itemKey).sort().join(','); }
  /** Pitches: colour members their colour note, others the pentatonic scale by slot. */
  function pitchUp(items) { items.forEach(function (b, i) { if (typeof b.pitch !== 'number') b.pitch = PENTA[i % PENTA.length]; }); return items; }

  function notesFor(topic, age, ri) {
    var t = (topic === 'count' ? COUNT_NOTES : NOTES)[ageOf(age)];
    return t[Math.min(ri | 0, t.length - 1)];
  }
  /** Mode of a round: count rounds 0–1 drum, 2–3 listen; everything else pick. */
  function modeFor(topic, ri) { return topic === 'count' ? ((ri | 0) <= 1 ? 'drum' : 'listen') : 'pick'; }
  /** Members per round: age 3: 2; 4–5: 3; 6–7: 3 (4 from round 2); warm-up round 0: 2; size: 2; listen: ≤ 3; drum: 0. */
  function membersFor(topic, age, ri) {
    age = ageOf(age);
    var mode = modeFor(topic, ri);
    if (mode === 'drum') return 0;
    if (topic === 'size' || (ri | 0) === 0 || age <= 3) return 2;
    if (mode === 'listen') return 3;
    if (age >= 6 && ri >= 2) return 4;
    return 3;
  }
  /** Plain accompaniment drums in a drum-mode round (they sit on the stage, never asked). */
  function bandFor(age, ri) { return (ri | 0) === 0 || ageOf(age) <= 3 ? 2 : 3; }
  /** The most members any round of this age has (layout planning). */
  function maxMembers(age) { return ageOf(age) >= 6 ? 4 : ageOf(age) <= 3 ? 2 : 3; }

  /**
   * makeRound(topic, { age, lang, rng, roundIndex, surprise, avoid?, prevMembers? }) → round.
   * `avoid` = the previous round's last ask (this round's first ask never repeats its prompt); `prevMembers` = the previous
   * round's member key (no identical band twice in a row).
   */
  function makeRound(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new RB.RNG(1), ri = o.roundIndex || 0;
    if (ALL_TOPICS.indexOf(topic) < 0) throw new Error('RB.Content: unknown topic ' + topic);
    var n = o.notes ? Math.max(1, Math.min(MAX_NOTES, o.notes)) : notesFor(topic, age, ri);
    // (a drum ask may repeat the last count of the previous round: counting up again is the point)
    var av = o.avoid && o.avoid.mode !== 'drum' ? o.avoid.promptKey + JSON.stringify(o.avoid.params) : null;
    var r = null, err = null;
    for (var attempt = 0; attempt < 80; attempt++) {
      r = buildRound(topic, age, lang, rng, ri, n);
      r.surprise = o.surprise || null;
      if (o.notes) r._free = true;
      err = validate(r);
      if (!err && attempt < 79) {
        if (av && r.asks[0].promptKey + JSON.stringify(r.asks[0].params) === av) { err = 'repeats the previous ask'; continue; }
        if (o.prevMembers && r.members.length && r.key === o.prevMembers) { err = 'same band as the previous round'; continue; }
      }
      if (!err) break;
    }
    if (err) throw new Error('RB.Content: invalid round (' + topic + ', age ' + age + '): ' + err);
    r.seed = (rng.next() * 4294967296) >>> 0;
    return r;
  }

  /** The order members are asked in: n answers, no two in a row the same, every member at least once when n ≥ k. */
  function askOrder(rng, k, n) {
    var out = [], i;
    if (k <= 0) return out;
    if (k === 1) { for (i = 0; i < n; i++) out.push(0); return out; }
    var perm = rng.shuffle(range(0, k - 1));
    for (i = 0; i < n; i++) {
      if (i < k) { out.push(perm[i]); continue; }
      var prev = out[i - 1], c = rng.int(0, k - 2);
      out.push(c >= prev ? c + 1 : c);
    }
    return out;
  }

  /** k distinct colours (below age 5: a clash-free set, no pink). */
  function colourSet(rng, age, k) {
    if (age < COLOR_SAFE_BELOW) return rng.shuffle(rng.pick(SAFE[k]).slice());
    return rng.sample(COLORS5, k);
  }

  function buildRound(topic, age, lang, rng, ri, n) {
    var mode = modeFor(topic, ri), k = membersFor(topic, age, ri), members = [], asks = [], order, i, q;
    var R;
    if (mode === 'drum') {
      // drum N times: round 0 counts up from 1, round 1 ascending distinct counts from 2 … (range top, ≥ 4)
      R = DRUM_RANGE[age];
      var vals;
      if (ri === 0) { vals = []; for (q = 0; q < n; q++) vals.push(Math.min(R[1], R[0] + q)); }
      else {
        var lo = Math.min(R[1], R[0] + 1), hi = Math.max(R[1] - (age === 4 ? 1 : 0), lo + n - 1);
        vals = rng.sample(range(lo, hi), n).sort(function (a, b) { return a - b; });
      }
      for (q = 0; q < n; q++) {
        if (q && vals[q] === vals[q - 1]) vals[q] = Math.min(R[1], vals[q] + 1);
        asks.push({ mode: 'drum', promptKey: 'p.drum', params: { n: vals[q] }, answer: -1, n: vals[q], nameKind: 'number', nameValue: vals[q] });
      }
      var band = [];
      for (i = 0; i < bandFor(age, ri); i++) band.push(bPlain());
      return finishRound(topic, age, lang, ri, n, mode, [], pitchUp(band), asks);
    }
    switch (topic) {
      case 'colors': {
        colourSet(rng, age, k).forEach(function (c) { members.push(bColor(c)); });
        break;
      }
      case 'shapes': {
        var sp = rng.sample(shapesFor(age), k), cols;
        if (age <= 4) cols = colourSet(rng, age, k);          // every shape in its own colour, a clash-free band
        else {                                                // age 5+: mixed colours, two members share one colour
          var c0 = rng.pick(COLORS5); cols = [c0, c0];
          for (i = 2; i < k; i++) cols.push(rng.pick(COLORS5));
          rng.shuffle(cols);
        }
        for (i = 0; i < k; i++) members.push(bShape(sp[i], cols[i]));
        break;
      }
      case 'size': {
        var col = rng.pick(age < COLOR_SAFE_BELOW ? COLORS : COLORS5);
        members = rng.shuffle([bSize('big', col), bSize('small', col)]);
        break;
      }
      case 'animals': {
        rng.sample(RB.ANIMALS, k).forEach(function (a) { members.push(bAnimal(a, lang)); });
        break;
      }
      case 'initial': {   // animals with words, distinct first letters
        var W = rng.shuffle(RB.WORDS[lang].slice()), seen = {};
        for (i = 0; i < W.length && members.length < k; i++) if (!seen[W[i].initial]) { seen[W[i].initial] = 1; members.push(bAnimal(W[i].animal, lang)); }
        break;
      }
      case 'letters': case 'lower': {
        rng.sample(letterPool(lang, topic), k).forEach(function (L) { members.push(bLetter(topic === 'lower' ? L.toLowerCase() : L)); });
        break;
      }
      case 'count': {    // listen mode: number drums
        R = LISTEN_RANGE[age];
        rng.sample(range(R[0], R[1]), k).sort(function (a, b) { return a - b; }).forEach(function (v) {
          members.push(bNumber(v, age <= 5 && v <= DOTS_MAX));
        });
        rng.shuffle(members);
        break;
      }
      case 'add': {
        var top = ADD_MAX[age] || 10, hiA = ri === 0 ? Math.min(6, top) : top;
        rng.sample(range(2, hiA), k).forEach(function (v) { members.push(bNumber(v, false)); });
        break;
      }
      case 'sub': {
        var hiS = ri === 0 ? 5 : SUB_MAX - 1;
        rng.sample(range(0, hiS), k).forEach(function (v) { members.push(bNumber(v, false)); });
        break;
      }
      case 'oddeven': {  // exactly one member of the "lonely" parity (asked by parity); the others are asked as sums
        var hiO = ODDEVEN_MAX[age] || 12, lonely = rng.chance(0.5) ? 'odd' : 'even';
        var one = rng.pick(range(1, hiO).filter(function (x) { return parityOf(x) === lonely; }));
        var rest = rng.sample(range(2, Math.min(10, hiO)).filter(function (x) { return parityOf(x) !== lonely; }), k - 1);
        members = rng.shuffle([bNumber(one, false)].concat(rest.map(function (v) { return bNumber(v, false); })));
        break;
      }
    }
    pitchUp(members);
    order = askOrder(rng, members.length, n);
    var soundOff = rng.int(0, 1), prevSum = null;
    for (q = 0; q < n; q++) {
      var ai = order[q], A = members[ai], key, params;
      switch (topic) {
        case 'colors': key = 'p.colors'; params = { color: A.color }; break;
        case 'shapes': key = 'p.shapes'; params = { shape: A.shape }; break;
        case 'size': key = 'p.size'; params = { size: A.size, color: A.color }; break;
        case 'animals': {
          var bySound = age >= 4 && ri >= 2 && (q + soundOff) % 2 === 0;
          key = bySound ? 'p.sound' : 'p.animals'; params = { animal: A.animal };
          break;
        }
        case 'initial': key = 'p.initial'; params = { letter: A.initial }; break;
        case 'letters': key = 'p.letters'; params = { letter: A.text }; break;
        case 'lower': key = 'p.lower'; params = { letter: A.text.toUpperCase(), lower: A.text }; break;
        case 'count': key = 'p.listen'; params = { n: A.n }; break;
        case 'add': key = 'p.add'; params = sumFor(rng, A.n, prevSum); break;
        case 'sub': {
          var kk = rng.int(1, SUB_MAX - A.n), big = A.n + kk;
          if (prevSum && prevSum.a === big && kk === prevSum.b && kk < SUB_MAX - A.n) { kk++; big++; }
          key = 'p.sub'; params = { a: big, b: kk, text: big + ' ' + MINUS + ' ' + kk };
          break;
        }
        case 'oddeven': {
          var lone = members.filter(function (m) { return parityOf(m.n) === parityOf(A.n); }).length === 1;
          if (lone) { key = 'p.oddeven'; params = { parity: parityOf(A.n) }; }
          else { key = 'p.add'; params = sumFor(rng, A.n, prevSum); }
          break;
        }
      }
      prevSum = params;
      var ask = { mode: topic === 'count' ? 'listen' : 'pick', promptKey: key, params: params, answer: ai, nameKind: A.nameKind, nameValue: A.nameValue };
      if (topic === 'count') ask.n = A.n;
      asks.push(ask);
    }
    return finishRound(topic, age, lang, ri, n, topic === 'count' ? 'listen' : 'pick', members, members, asks);
  }
  function sumFor(rng, s, prev) {
    var x1 = rng.int(1, Math.max(1, s - 1));
    if (prev && prev.a === x1 && s > 2) x1 = x1 === 1 ? 2 : x1 - 1;   // the same member twice: a different sum
    return { a: x1, b: s - x1, text: x1 + ' + ' + (s - x1) };
  }
  function finishRound(topic, age, lang, ri, n, mode, members, band, asks) {
    return { topic: topic, age: age, lang: lang, roundIndex: ri, n: n, mode: mode, members: members, band: band, asks: asks,
      surprise: null, key: setKey(band) };
  }

  // ---------------- self-check ----------------
  function evalText(t) {
    var m = /^(\d+) ([+−]) (\d+)$/.exec(t); if (!m) return NaN;
    return m[2] === '+' ? +m[1] + +m[3] : +m[1] - +m[3];
  }
  /** Does the member answer the ask's prompt? (re-derived from promptKey + params + item fields only) */
  function matches(ask, b, lang) {
    var p = ask.params || {};
    if (!b || b.plain) return false;
    switch (ask.promptKey) {
      case 'p.colors': return b.kind === 'color' && b.color === p.color && b.value === p.color;
      case 'p.shapes': return b.kind === 'shape' && b.shape === p.shape;
      case 'p.size': return b.kind === 'size' && b.size === p.size;
      case 'p.animals': return b.kind === 'animal' && b.animal === p.animal;
      case 'p.sound': return b.kind === 'animal' && b.animal === p.animal && !!RB.ANIMAL_SOUND[p.animal];
      case 'p.listen': return b.kind === 'number' && b.n === p.n && b.text === String(p.n);
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
  var ITEM_KINDS = ['color', 'shape', 'number', 'animal', 'size', 'letter', 'text'];

  /** null when the round is solvable and follows every rule, else the reason. */
  function validate(r) {
    if (!r || !r.asks || !r.members || !r.band) return 'no asks / members';
    if (r.asks.length !== r.n || r.n < 1 || r.n > MAX_NOTES) return r.asks.length + ' asks for ' + r.n + ' notes';
    if (r.n !== notesFor(r.topic, r.age, r.roundIndex) && !r._free) return 'notes ' + r.n + ' vs table ' + notesFor(r.topic, r.age, r.roundIndex);
    var k = r.members.length, q, i;
    if (r.mode === 'drum') {
      if (k !== 0) return 'drum round with members';
      if (r.band.length < 2 || r.band.length > 3 || r.band.some(function (b) { return !b.plain; })) return 'drum round band';
      var R = DRUM_RANGE[r.age];
      for (q = 0; q < r.n; q++) {
        var d = r.asks[q];
        if (d.mode !== 'drum' || d.promptKey !== 'p.drum' || d.answer !== -1) return 'ask ' + q + ': not a drum ask';
        if (!(d.n >= R[0] && d.n <= R[1]) || d.params.n !== d.n || d.nameValue !== d.n) return 'ask ' + q + ': drum count ' + d.n;
        if (q && d.n === r.asks[q - 1].n) return 'ask ' + q + ': same count twice';
      }
      return null;
    }
    if (k !== membersFor(r.topic, r.age, r.roundIndex)) return k + ' members, want ' + membersFor(r.topic, r.age, r.roundIndex);
    if (k < 2 || k > MAX_MEMBERS) return k + ' members';
    if (r.band !== r.members) return 'band ≠ members';
    var keys = {}, cs = [];
    for (i = 0; i < k; i++) {
      var b = r.members[i];
      if (!b || ITEM_KINDS.indexOf(b.kind) < 0) return 'bad member';
      if (KIND_OF[r.topic].indexOf(b.kind) < 0) return 'member ' + b.kind + ' for topic ' + r.topic;
      if (b.value === undefined || b.value === null || b.nameKind === undefined || b.nameValue === undefined) return 'member without value / name';
      if (typeof b.pitch !== 'number' || !(b.pitch >= 36 && b.pitch <= 96)) return 'member without pitch';
      if (b.color && !RB.PALETTE[b.color]) return 'bad colour ' + b.color;
      if (b.kind === 'color' && b.pitch !== RB.NOTE[b.color]) return 'colour pitch';
      if (b.animal && RB.ANIMALS.indexOf(b.animal) < 0) return 'bad animal ' + b.animal;
      if (b.kind === 'number' && (!(b.n >= 0 && b.n <= 20) || b.text !== String(b.n))) return 'number member';
      if (b.kind === 'number' && b.showDots && b.n > DOTS_MAX) return 'dots above ' + DOTS_MAX;
      if (b.color) cs.push(b.color);
      var key = itemKey(b);
      if (keys[key]) return 'duplicate member ' + key;
      keys[key] = 1;
    }
    if (r.age < COLOR_SAFE_BELOW && cs.length) {
      var uniq = cs.filter(function (c, j) { return cs.indexOf(c) === j; });
      if (clash(uniq) || uniq.indexOf('pink') >= 0) return 'colour clash in ' + uniq.join('+');
      if (r.topic === 'shapes' && uniq.length !== cs.length) return 'shape colours repeat below age 5';
    }
    if (r.topic === 'shapes' && r.age === 5 && cs.filter(function (c, j) { return cs.indexOf(c) !== j; }).length < 1) return 'age 5 shapes without a same-colour pair';
    if (r.topic === 'size' && (r.members[0].color !== r.members[1].color || r.members[0].size === r.members[1].size)) return 'size: not one colour big + small';
    var asked = {}, prev = -1;
    for (q = 0; q < r.n; q++) {
      var a = r.asks[q];
      if (!a) return 'ask ' + q + ' missing';
      if (a.mode !== (r.topic === 'count' ? 'listen' : 'pick')) return 'ask ' + q + ': mode ' + a.mode;
      if (!(a.answer >= 0 && a.answer < k)) return 'ask ' + q + ': bad answer index';
      var hits = 0;
      for (i = 0; i < k; i++) if (matches(a, r.members[i], r.lang)) hits++;
      if (hits !== 1) return 'ask ' + q + ': ' + hits + ' members match ' + a.promptKey + ' ' + JSON.stringify(a.params);
      var A = r.members[a.answer];
      if (!matches(a, A, r.lang)) return 'ask ' + q + ': answer does not match';
      if (a.nameKind !== A.nameKind || a.nameValue !== A.nameValue) return 'ask ' + q + ': name fields';
      if (a.mode === 'listen' && a.n !== A.n) return 'ask ' + q + ': listen n';
      if (a.promptKey === 'p.sound' && !RB.ANIMAL_SOUND[a.params.animal]) return 'sound ask without a sound';
      if (a.answer === prev) return 'ask ' + q + ': same member twice in a row';
      prev = a.answer; asked[a.answer] = 1;
    }
    if (r.n >= k && Object.keys(asked).length !== k) return 'a member is never asked';
    return null;
  }

  // ---------------- Talk time ----------------
  /* talk = { topic, promptKey:'talk.<topic>', params, show: an item (or null), choices:[ item + {id} ], answerId }
   * Choices are pictures BandArt can draw (kinds color, shape, number, dots, animal, letter, size; parity from age 7). */
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
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new RB.RNG(1);
    var show = null, params = {}, ch, a, k;
    switch (topic) {
      case 'colors': {
        var set = colourSet(rng, age, 3); a = set[0]; show = bColor(a);
        ch = choicesFrom(rng, a, set, 3, bColor); break;
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
        a = rng.pick(RB.ANIMALS); params = { animal: a };
        ch = choicesFrom(rng, a, RB.ANIMALS, 3, function (x) { return bAnimal(x, lang); }); break;
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
        var w0 = rng.pick(RB.WORDS[lang]); a = w0.initial;
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
      default: throw new Error('RB.Content: unknown topic ' + topic);
    }
    return { topic: topic, promptKey: 'talk.' + topic, params: params, show: show, choices: ch.choices, answerId: ch.answerId };
  }

  /** 4 chapter topics for a session. Without rng: RB.AGE_TOPICS. With rng: chapter 1 = the easiest pool topic that was not
   * chapter 1 last time; chapters 2–4 = 3 of the others (preferring topics left out of `last`), sorted easiest first. */
  function topicsFor(age, rng, last) {
    age = ageOf(age);
    if (!rng) return RB.AGE_TOPICS[age].slice();
    var pool = RB.AGE_POOLS[age].slice().sort(function (a, b) { return DIFFICULTY.indexOf(a) - DIFFICULTY.indexOf(b); });
    last = Array.isArray(last) ? last : [];
    var first = pool[0];
    for (var i = 0; i < pool.length; i++) if (pool[i] !== last[0]) { first = pool[i]; break; }
    var rest = pool.filter(function (t) { return t !== first; });
    var fresh = rng.shuffle(rest.filter(function (t) { return last.indexOf(t) < 0; }));
    var old = rng.shuffle(rest.filter(function (t) { return last.indexOf(t) >= 0; }));
    var pick = fresh.concat(old).slice(0, 3).sort(function (a, b) { return DIFFICULTY.indexOf(a) - DIFFICULTY.indexOf(b); });
    return [first].concat(pick);
  }

  /** Colour + pitch of the note a count-round drum ask puts on the sheet (n taps / beats). */
  function countNote(n) { return { color: NOTE_COLORS[(n - 1) % NOTE_COLORS.length], pitch: PENTA[(n - 1) % PENTA.length] + 12 * Math.floor((n - 1) / PENTA.length) }; }

  RB.Content = {
    makeRound: makeRound, makeTalk: makeTalk, validate: validate, matches: matches, itemKey: itemKey, blockKey: itemKey, setKey: setKey,
    topicsFor: topicsFor, notesFor: notesFor, membersFor: membersFor, modeFor: modeFor, bandFor: bandFor, maxMembers: maxMembers,
    askOrder: askOrder, countNote: countNote,
    TOPICS: ALL_TOPICS, DIFFICULTY: DIFFICULTY, COLORS: COLORS, COLORS5: COLORS5, SHAPES: RB.SHAPES, SHAPES4: SHAPES4,
    ANIMALS: RB.ANIMALS, SOUND_ANIMALS: SOUND_ANIMALS, NOTES: NOTES, COUNT_NOTES: COUNT_NOTES, MAX_NOTES: MAX_NOTES, MAX_MEMBERS: MAX_MEMBERS,
    DRUM_RANGE: DRUM_RANGE, LISTEN_RANGE: LISTEN_RANGE, DOTS_MAX: DOTS_MAX, SMALL_SCALE: SMALL_SCALE, LETTER_POOL: LETTER_POOL,
    CLASH: CLASH, SAFE_SETS: SAFE[3], PENTA: PENTA, SIZE_PITCH: SIZE_PITCH, NOTE_COLORS: NOTE_COLORS,
    COLOR_SAFE_BELOW: COLOR_SAFE_BELOW, KIND_OF: KIND_OF, ageOf: ageOf, clash: clash, clashPair: clashPair, safeSetsOf: safeSetsOf,
    shapesFor: shapesFor, initialsOf: initialsOf, parityOf: parityOf
  };
})(window.RB = window.RB || {});
