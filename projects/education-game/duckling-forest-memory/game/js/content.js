/* Dee's Forest Memory — DM.PALETTE, DM.ANIMALS, DM.AGE_TOPICS, DM.WORDS, DM.Content (pure + deterministic; DESIGN §5.1)
 *
 *   DM.Content.makeRound(topic, { age, lang, rng, roundIndex, history, pairs?, peek? }) → round
 *        history (optional) = the summaries (round.sum) of the earlier rounds of THIS chapter, oldest first; the world
 *        passes it so no two consecutive rounds show the same set of faces. pairs / peek override the age tables
 *        (DM.CONFIG.pairsByAge / peekByAge, playtest tuning).
 *   DM.Content.makeTalk(topic,  { age, lang, rng })  → talk
 *   DM.Content.validate(round)  → null | 'reason'     (self-check, called by makeRound: every round is solvable)
 *   DM.Content.topicsFor(age)   → the 4 chapter topics (age ≥ 7 uses 7, < 3 uses 3)
 *
 * round = { topic, promptKey:'p.<topic>', params:{ n (pairs) }, pairs:N, peek (s),
 *   cards:[{ id:'c0'…, key, face, nameKind, nameValue, size? }],          // 2·N cards, shuffled = grid slot order
 *   pairInfo:{ <key>: { nameKind, nameValue, parity?, animal?, text?, lower?, reward:{kind, color?, shape?, sprite?, n?, text?} } },
 *   reward:{ kind:'butterfly'|'lantern'|'acorns'|'animal'|'star' }, seed (uint32), sum:{ set, key } }
 *
 * Faces (what DM.CardArt draws):
 *   color  {kind, value:c, color:c}                      -> a butterfly in that colour
 *   shape  {kind, value:s, shape:s, color:c}             → a lantern-style shape (circle square triangle star heart rect)
 *   animal {kind, value:a, sprite:'animal_<a>', scale:1|0.6, size?:'big'|'small'}
 *   dots   {kind, value:n, n, parity?}                   → n acorns in a dice layout (≤ 12)
 *   number {kind, value:n, n, text:'7', parity?}         → numeral   (parity 'odd'|'even' → coloured card frame, oddeven only)
 *   letter {kind, value:'A', text:'A'}                    text {kind, value:'2 + 3', text:'2 + 3'}
 * Card names (what Dee says on a flip): color/color, shape/shape, animal/animal (+ card.size 'big'|'small' in size rounds),
 *   dots/dots (n — "one, two, three acorns"), number/number, letter/letter (as shown: 'a' on a small-letter card),
 *   sum/'2 + 3', diff/'5 − 2'. pairInfo names the PAIR for the match line (count: number n; initial: letter + animal …).
 */
(function (DM) {
  'use strict';

  DM.PALETTE = {
    red:    { fill: '#E84A4A', dark: '#A8282E' },
    blue:   { fill: '#3C8DE8', dark: '#1F5BA8' },
    yellow: { fill: '#FFD23F', dark: '#C99A12' },
    green:  { fill: '#4CC26B', dark: '#2A8343' },
    orange: { fill: '#FF9A2E', dark: '#C4650C' },
    purple: { fill: '#9B6BE0', dark: '#6840A8' },
    pink:   { fill: '#FF8FC0', dark: '#C9558A' }     // an answer colour from age 5 (DESIGN §3)
  };
  var COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple'];
  var COLORS5 = COLORS.concat(['pink']);

  DM.ANIMALS = ['fox', 'deer', 'hedgehog', 'squirrel', 'bunny', 'frog', 'bear', 'owl', 'mouse'];

  DM.AGE_TOPICS = {
    3: ['colors', 'size', 'shapes', 'animals'],
    4: ['colors', 'shapes', 'count', 'animals'],
    5: ['shapes', 'count', 'letters', 'animals'],
    6: ['lower', 'initial', 'add', 'count'],
    7: ['initial', 'add', 'sub', 'oddeven']
  };
  var ALL_TOPICS = ['colors', 'size', 'shapes', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];

  // ---- tables (DESIGN §5.1)
  var PAIRS = { 3: [2, 2, 3, 3], 4: [2, 3, 4, 4], 5: [3, 4, 5, 5], 6: [3, 4, 5, 6], 7: [3, 4, 5, 6] };   // pairs per round
  var PEEK = { 3: 3.5, 4: 2.5, 5: 2.0, 6: 1.5, 7: 1.5 };            // s all cards stay face up at the round start
  var MAX_PAIRS = 6;                                                // ≤ 12 cards (DESIGN §8)
  var SMALL_SCALE = 0.6;                                            // 'size' topic: the small animal is 0.6× the big one
  var COUNT_RANGE = { 3: [1, 5], 4: [1, 5], 5: [1, 10], 6: [1, 12], 7: [1, 12] };
  var WARM_COUNT_MAX = 3;                                           // warm-up count round (ages ≤ 4) uses 1–3 only
  var ODDEVEN_MAX = 12;
  var ADD_MAX = { 6: 10, 7: 20 };                                   // sums within 10 (age 6) / 20 (age 7)
  var SUB_MAX = 10;                                                 // take away within 10
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart'];   // + 'rect' from age 5
  var LETTER_POOL = { en: 'ABCDEFGHIKLMNOPRSTUW', vi: 'ABCDEGHIKLMNOPSTUVXY' };
  var LOWER_SKIP = 'IL';                                            // capital I and small l look alike: neither in 'lower'
  var MINUS = '−';

  function Wd(word, animal, initial) { return { word: word, sprite: 'animal_' + animal, animal: animal, initial: initial }; }
  DM.WORDS = {
    en: [Wd('fox', 'fox', 'F'), Wd('deer', 'deer', 'D'), Wd('hedgehog', 'hedgehog', 'H'), Wd('squirrel', 'squirrel', 'S'),
      Wd('bunny', 'bunny', 'B'), Wd('frog', 'frog', 'F'), Wd('bear', 'bear', 'B'), Wd('owl', 'owl', 'O'), Wd('mouse', 'mouse', 'M')],
    // VN kindergartens teach th / nh / ch as their own sounds: thỏ, nhím, chuột are left out. ếch starts with the letter Ê.
    vi: [Wd('cáo', 'fox', 'C'), Wd('hươu', 'deer', 'H'), Wd('sóc', 'squirrel', 'S'), Wd('gấu', 'bear', 'G'), Wd('cú', 'owl', 'C'),
      Wd('ếch', 'frog', 'Ê')]
  };

  /* Colour-blind / toddler safety: below age 5 never blue+purple, red+green, yellow+orange or green+orange in one round. */
  var CLASH = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange']];
  function clash(cs) {
    for (var i = 0; i < CLASH.length; i++) if (cs.indexOf(CLASH[i][0]) >= 0 && cs.indexOf(CLASH[i][1]) >= 0) return true;
    return false;
  }
  var SAFE_SETS = (function () {     // every largest clash-free set (6 sets of 3 colours)
    var sets = [], best = 0;
    for (var m = 1; m < 64; m++) {
      var cs = COLORS.filter(function (c, i) { return m & (1 << i); });
      if (clash(cs)) continue;
      if (cs.length > best) { best = cs.length; sets = []; }
      if (cs.length === best) sets.push(cs);
    }
    return sets;
  })();
  var SAFE_MAX = SAFE_SETS[0].length;   // 3: a colour round below age 5 has at most 3 pairs

  function ageOf(a) { a = Math.round(+a || 4); return a < 3 ? 3 : a > 7 ? 7 : a; }
  function langOf(l) { return l === 'vi' ? 'vi' : 'en'; }
  function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }
  function shapesFor(age) { return age >= 5 ? SHAPES.concat(['rect']) : SHAPES.slice(); }
  function letterPool(lang, topic) {
    var P = LETTER_POOL[langOf(lang)].split('');
    return topic === 'lower' ? P.filter(function (c) { return LOWER_SKIP.indexOf(c) < 0; }) : P;
  }
  function parityOf(n) { return n % 2 ? 'odd' : 'even'; }
  /** Distinct initials available for 'initial' in a language (one word per initial in a round). */
  function initialsOf(lang) { var s = []; DM.WORDS[langOf(lang)].forEach(function (w) { if (s.indexOf(w.initial) < 0) s.push(w.initial); }); return s; }

  /** The most pairs a topic can hold at an age / language (colour safety, word lists). */
  function maxPairs(topic, age, lang) {
    if (topic === 'colors') return age < 5 ? SAFE_MAX : COLORS5.length;
    if (topic === 'shapes') return shapesFor(age).length;
    if (topic === 'initial') return initialsOf(lang).length;
    if (topic === 'size' || topic === 'animals') return DM.ANIMALS.length;
    return MAX_PAIRS;
  }
  function pairsFor(topic, age, lang, ri, tbl) {
    var t = (tbl && tbl[age]) || PAIRS[age];
    var n = t[Math.min(ri, t.length - 1)];
    return Math.max(2, Math.min(n, MAX_PAIRS, maxPairs(topic, age, lang)));
  }

  /** Prefer values the previous round did not show (variety), filling up with the rest. */
  function freshSample(rng, pool, n, prevVals) {
    var fresh = rng.shuffle(pool.filter(function (v) { return prevVals.indexOf(v) < 0; }));
    var old = rng.shuffle(pool.filter(function (v) { return prevVals.indexOf(v) >= 0; }));
    // keep ~1/3 of a round's values from the previous one when the pool is small, so sets still differ
    return fresh.concat(old).slice(0, n);
  }

  function card(key, face, nameKind, nameValue, extra) {
    var c = { id: null, key: key, face: face, nameKind: nameKind, nameValue: nameValue };
    if (extra) for (var k in extra) c[k] = extra[k];
    return c;
  }

  function makeRound(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new DM.RNG(1), ri = o.roundIndex || 0, hist = o.history || [];
    if (ALL_TOPICS.indexOf(topic) < 0) throw new Error('DM.Content: unknown topic ' + topic);
    var prev = hist.length ? hist[hist.length - 1] : null;
    var N = o.pairs ? Math.max(2, Math.min(o.pairs, MAX_PAIRS, maxPairs(topic, age, lang))) : pairsFor(topic, age, lang, ri, o.pairsByAge);
    var r = null;
    for (var attempt = 0; attempt < 40; attempt++) {     // re-roll until the faces differ from the previous round's
      r = build(topic, age, lang, rng, ri, N, prev);
      if (!prev || r.sum.set !== prev.set) break;
    }
    r.age = age;
    r.peek = o.peek !== undefined ? o.peek : (o.peekByAge && o.peekByAge[age] !== undefined ? o.peekByAge[age] : PEEK[age]);
    var err = validate(r);
    if (err) throw new Error('DM.Content: invalid round (' + topic + '): ' + err);
    return r;
  }

  function build(topic, age, lang, rng, ri, N, prev) {
    var cards = [], info = {}, rewardKind, i, warm = ri === 0;
    var pv = prev ? prev.values : [];
    var add = function (c) { cards.push(c); };
    switch (topic) {
      case 'colors': {
        var pool = age < 5 ? rng.pick(SAFE_SETS).slice() : COLORS5.slice();
        var cs = freshSample(rng, pool, N, pv);
        rewardKind = 'butterfly';
        for (i = 0; i < N; i++) {
          var c = cs[i], k = 'c:' + c;
          for (var t = 0; t < 2; t++) add(card(k, { kind: 'color', value: c, color: c }, 'color', c));
          info[k] = { nameKind: 'color', nameValue: c, reward: { kind: 'butterfly', color: c } };
        }
        break;
      }
      case 'shapes': {
        var sp = freshSample(rng, shapesFor(age), N, pv);
        var cols = rng.shuffle((age >= 5 ? COLORS5 : COLORS).slice());
        rewardKind = 'lantern';
        for (i = 0; i < N; i++) {
          var s = sp[i], ks = 's:' + s, ca, cb;
          if (age <= 4) { ca = cb = cols[i % cols.length]; }       // every shape its own colour, the pair shares it
          else {                                                   // real shape matching: the two cards differ in colour
            ca = cols[(2 * i) % cols.length]; cb = cols[(2 * i + 1) % cols.length];
            if (rng.chance(0.5)) { var tmp = ca; ca = cb; cb = tmp; }
          }
          add(card(ks, { kind: 'shape', value: s, shape: s, color: ca }, 'shape', s));
          add(card(ks, { kind: 'shape', value: s, shape: s, color: cb }, 'shape', s));
          info[ks] = { nameKind: 'shape', nameValue: s, reward: { kind: 'lantern', shape: s, color: ca } };
        }
        break;
      }
      case 'size':
      case 'animals': {
        var an = freshSample(rng, DM.ANIMALS, N, pv);
        rewardKind = 'animal';
        for (i = 0; i < N; i++) {
          var a = an[i], ka = (topic === 'size' ? 'z:' : 'a:') + a, spr = 'animal_' + a;
          if (topic === 'size') {
            add(card(ka, { kind: 'animal', value: a, sprite: spr, scale: 1, size: 'big' }, 'animal', a, { size: 'big' }));
            add(card(ka, { kind: 'animal', value: a, sprite: spr, scale: SMALL_SCALE, size: 'small' }, 'animal', a, { size: 'small' }));
          } else {
            for (var u = 0; u < 2; u++) add(card(ka, { kind: 'animal', value: a, sprite: spr, scale: 1 }, 'animal', a));
          }
          info[ka] = { nameKind: 'animal', nameValue: a, reward: { kind: 'animal', sprite: spr } };
        }
        break;
      }
      case 'count':
      case 'oddeven': {
        var lo = 1, hi = topic === 'oddeven' ? ODDEVEN_MAX : COUNT_RANGE[age][1];
        if (topic === 'count' && warm && age <= 4) hi = Math.min(hi, WARM_COUNT_MAX);
        var nums;
        if (topic === 'oddeven') {        // both parities in every round
          var odd = rng.shuffle(range(lo, hi).filter(function (v) { return v % 2; })), even = rng.shuffle(range(lo, hi).filter(function (v) { return !(v % 2); }));
          var nOdd = Math.max(1, Math.min(N - 1, rng.int(Math.floor(N / 2), Math.ceil(N / 2))));
          nums = freshSample(rng, odd, nOdd, pv).concat(freshSample(rng, even, N - nOdd, pv));
        } else nums = freshSample(rng, range(lo, Math.max(hi, lo + N - 1)), N, pv);
        rewardKind = 'acorns';
        for (i = 0; i < N; i++) {
          var n = nums[i], kn = 'n:' + n, ex = topic === 'oddeven' ? { parity: parityOf(n) } : null;
          var fn = { kind: 'number', value: n, n: n, text: String(n) }, fd = { kind: 'dots', value: n, n: n };
          if (ex) { fn.parity = fd.parity = ex.parity; }
          add(card(kn, fn, 'number', n));
          add(card(kn, fd, 'dots', n));
          info[kn] = { nameKind: 'number', nameValue: n, reward: { kind: 'acorns', n: n } };
          if (ex) info[kn].parity = ex.parity;
        }
        break;
      }
      case 'letters':
      case 'lower': {
        var ls = freshSample(rng, letterPool(lang, topic), N, pv);
        rewardKind = 'star';
        for (i = 0; i < N; i++) {
          var L = ls[i], kl = 'L:' + L;
          add(card(kl, { kind: 'letter', value: L, text: L }, 'letter', L));
          var L2 = topic === 'lower' ? L.toLowerCase() : L;
          add(card(kl, { kind: 'letter', value: L2, text: L2 }, 'letter', L2));
          info[kl] = { nameKind: 'letter', nameValue: L, reward: { kind: 'star', text: L } };
          if (topic === 'lower') info[kl].lower = L2;
        }
        break;
      }
      case 'initial': {
        // one word per initial: pick N initials, then a word for each
        var W = DM.WORDS[lang], inits = freshSample(rng, initialsOf(lang), N, pv);
        rewardKind = 'animal';
        for (i = 0; i < N; i++) {
          var I = inits[i], wd = rng.pick(W.filter(function (w) { return w.initial === I; })), ki = 'I:' + I;
          add(card(ki, { kind: 'letter', value: I, text: I }, 'letter', I));
          add(card(ki, { kind: 'animal', value: wd.animal, sprite: wd.sprite, scale: 1 }, 'animal', wd.animal, { word: wd.word }));
          info[ki] = { nameKind: 'letter', nameValue: I, animal: wd.animal, word: wd.word, reward: { kind: 'animal', sprite: wd.sprite } };
        }
        break;
      }
      case 'add':
      case 'sub': {
        var isAdd = topic === 'add', top = isAdd ? ADD_MAX[age] || 10 : SUB_MAX;
        var answers = isAdd ? range(2, top) : range(0, top - 1);
        if (warm) answers = answers.filter(function (v) { return isAdd ? v <= 6 : v <= 4; });
        var ans = freshSample(rng, answers, N, pv);
        rewardKind = 'star';
        for (i = 0; i < N; i++) {
          var v = ans[i], x, y;
          if (isAdd) { x = rng.int(1, v - 1); y = v - x; }
          else { x = rng.int(Math.max(v + 1, warm ? 2 : 3), warm ? Math.min(top, v + 4) : top); if (x <= v) x = v + 1; y = x - v; }
          var txt = x + (isAdd ? ' + ' : ' ' + MINUS + ' ') + y, kv = 'v:' + v;
          add(card(kv, { kind: 'text', value: txt, text: txt }, isAdd ? 'sum' : 'diff', txt));
          add(card(kv, { kind: 'number', value: v, n: v, text: String(v) }, 'number', v));
          info[kv] = { nameKind: 'number', nameValue: v, text: txt, reward: { kind: 'star', text: String(v) } };
        }
        break;
      }
    }
    rng.shuffle(cards);
    for (i = 0; i < cards.length; i++) cards[i].id = 'c' + i;
    var keys = Object.keys(info).sort();
    var values = keys.map(function (k) { return info[k].nameValue; });
    var set = topic + ':' + cards.map(function (c) { return c.key + '/' + JSON.stringify(c.face); }).sort().join('|');
    return { topic: topic, promptKey: 'p.' + topic, params: { n: N }, pairs: N, peek: 0, cards: cards, pairInfo: info,
      reward: { kind: rewardKind }, seed: (rng.next() * 4294967296) >>> 0, sum: { set: set, values: values } };
  }

  // ---------------- self-check ----------------
  var FACE_KINDS = ['color', 'shape', 'dots', 'number', 'letter', 'text', 'animal'];
  var NAME_KINDS = ['color', 'shape', 'animal', 'dots', 'number', 'letter', 'sum', 'diff'];
  var WORD_INIT = {};
  (function () { for (var l in DM.WORDS) { WORD_INIT[l] = {}; DM.WORDS[l].forEach(function (w) { WORD_INIT[l][w.animal + '|' + w.word] = w.initial; }); } })();
  function evalText(t) {
    var m = /^(\d+) ([+−]) (\d+)$/.exec(t); if (!m) return NaN;
    return m[2] === '+' ? +m[1] + +m[3] : +m[1] - +m[3];
  }
  /** Do two faces really "go together" for the topic? Independent re-derivation from the faces alone. */
  function facesMatch(topic, a, b) {
    var A = a.face, B = b.face;
    switch (topic) {
      case 'colors': return A.kind === 'color' && B.kind === 'color' && A.color === B.color;
      case 'shapes': return A.kind === 'shape' && B.kind === 'shape' && A.shape === B.shape;
      case 'animals': return A.kind === 'animal' && B.kind === 'animal' && A.sprite === B.sprite && A.scale === B.scale;
      case 'size': return A.kind === 'animal' && B.kind === 'animal' && A.sprite === B.sprite && A.scale !== B.scale;
      case 'count': case 'oddeven': {
        var num = A.kind === 'number' ? A : B.kind === 'number' ? B : null, dot = A.kind === 'dots' ? A : B.kind === 'dots' ? B : null;
        if (!num || !dot || num.n !== dot.n || +num.text !== num.n) return false;
        return topic === 'count' || (num.parity === parityOf(num.n) && dot.parity === num.parity);
      }
      case 'letters': return A.kind === 'letter' && B.kind === 'letter' && A.text === B.text && A.text === A.text.toUpperCase();
      case 'lower': {
        if (A.kind !== 'letter' || B.kind !== 'letter') return false;
        var up = A.text === A.text.toUpperCase() ? A : B, lo = up === A ? B : A;
        return up.text !== lo.text && lo.text === up.text.toLowerCase() && LOWER_SKIP.indexOf(up.text) < 0;
      }
      case 'initial': {
        var le = A.kind === 'letter' ? a : B.kind === 'letter' ? b : null, pic = le === a ? b : a;
        if (!le || pic.face.kind !== 'animal') return false;
        for (var l in WORD_INIT) if (WORD_INIT[l][pic.face.value + '|' + pic.word] === le.face.text) return true;
        return false;
      }
      case 'add': case 'sub': {
        var tx = A.kind === 'text' ? A : B.kind === 'text' ? B : null, nb = tx === A ? B : A;
        return !!tx && nb.kind === 'number' && evalText(tx.text) === nb.n && evalText(tx.text) >= 0;
      }
    }
    return false;
  }

  function validate(r) {
    if (!r || !r.cards || !r.cards.length) return 'no cards';
    if (r.cards.length !== 2 * r.pairs) return 'cards ≠ 2·pairs';
    if (r.cards.length > 2 * MAX_PAIRS) return 'too many cards';
    if (r.pairs < 2) return 'fewer than 2 pairs';
    if (!(r.peek > 0)) return 'no peek time';
    var ids = {}, byKey = {}, i, c;
    for (i = 0; i < r.cards.length; i++) {
      c = r.cards[i];
      if (!c.id || ids[c.id]) return 'bad / duplicate id';
      ids[c.id] = 1;
      if (!c.key) return 'no key';
      if (!c.face || FACE_KINDS.indexOf(c.face.kind) < 0) return 'bad face kind';
      if (c.face.value === undefined || c.face.value === null) return 'face without value';
      if (c.face.color && !DM.PALETTE[c.face.color]) return 'bad colour ' + c.face.color;
      if (c.face.kind === 'animal' && (DM.ANIMALS.indexOf(c.face.value) < 0 || c.face.sprite !== 'animal_' + c.face.value)) return 'bad animal';
      if (c.face.kind === 'dots' && !(c.face.n >= 1 && c.face.n <= 12)) return 'dots out of 1–12';
      if (NAME_KINDS.indexOf(c.nameKind) < 0 || c.nameValue === undefined || c.nameValue === null) return 'no name';
      (byKey[c.key] = byKey[c.key] || []).push(c);
    }
    var keys = Object.keys(byKey);
    if (keys.length !== r.pairs) return 'keys ≠ pairs';
    for (i = 0; i < keys.length; i++) {
      var pr = byKey[keys[i]];
      if (pr.length !== 2) return 'key ' + keys[i] + ' on ' + pr.length + ' cards';
      if (!facesMatch(r.topic, pr[0], pr[1])) return 'pair ' + keys[i] + ' does not match';
      if (!r.pairInfo[keys[i]] || !r.pairInfo[keys[i]].reward) return 'no pair info';
      // no card may also match a card of another pair (every pair is unambiguous)
      for (var j = 0; j < keys.length; j++) if (j !== i) {
        var q = byKey[keys[j]];
        for (var x = 0; x < 2; x++) for (var y = 0; y < 2; y++) if (facesMatch(r.topic, pr[x], q[y])) return 'ambiguous ' + keys[i] + '/' + keys[j];
      }
    }
    if (r.topic === 'colors') {
      var cs = keys.map(function (k) { return r.pairInfo[k].nameValue; });
      if (r.age < 5 && clash(cs)) return 'colour clash';
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
  function numberDistractors(ans, lo, hi) {
    var d = [], c = [ans - 1, ans + 1, ans - 2, ans + 2, ans + 3, ans - 3];
    for (var i = 0; i < c.length; i++) if (c[i] >= lo && c[i] <= hi) d.push(c[i]);
    return d;
  }

  /* talk = { topic, promptKey:'talk.<topic>', params, show: a card face (or null), choices:[{id, kind, value}], answerId }
   *   colors   show color face → which colour?        shapes  show shape face → which shape?
   *   size     show a big / small animal → big or small? (kind 'size')
   *   count    show dots face (k ≤ 5 at ages ≤ 4) → how many?      oddeven show number face → odd or even? (kind 'parity')
   *   animals  "Where is the {animal}?" params {animal}, show null, 3 animal picture choices
   *   letters  show capital → which letter?   lower show small letter → which capital?   initial show animal, params {word, animal}
   *   add/sub  show text face → which number? */
  function makeTalk(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new DM.RNG(1);
    var show = null, params = {}, ch, a, k;
    switch (topic) {
      case 'colors': {
        var pool = age < 5 ? rng.pick(SAFE_SETS) : COLORS5;
        a = rng.pick(pool); show = { kind: 'color', value: a, color: a };
        ch = choicesFrom(rng, 'color', a, pool, 3); break;
      }
      case 'shapes': {
        var sp = shapesFor(age); a = rng.pick(sp); show = { kind: 'shape', value: a, shape: a, color: rng.pick(COLORS) };
        ch = choicesFrom(rng, 'shape', a, sp, 3); break;
      }
      case 'size': {
        a = rng.pick(['big', 'small']); var an = rng.pick(DM.ANIMALS);
        show = { kind: 'animal', value: an, sprite: 'animal_' + an, scale: a === 'big' ? 1 : SMALL_SCALE, size: a };
        ch = choicesFrom(rng, 'size', a, ['big', 'small'], 2); break;
      }
      case 'animals': {
        a = rng.pick(DM.ANIMALS); params = { animal: a };
        ch = choicesFrom(rng, 'animal', a, DM.ANIMALS, 3); break;
      }
      case 'count': {
        var rr = { 3: [1, 4], 4: [1, 5], 5: [2, 8], 6: [3, 10], 7: [3, 10] }[age];
        a = rng.int(rr[0], rr[1]); show = { kind: 'dots', value: a, n: a };
        ch = choicesFrom(rng, 'number', a, numberDistractors(a, 1, Math.max(rr[1], a + 2)), 3); break;
      }
      case 'letters':
      case 'lower': {
        var P = letterPool(lang, topic); a = rng.pick(P);
        var shown = topic === 'lower' ? a.toLowerCase() : a;
        show = { kind: 'letter', value: shown, text: shown };
        ch = choicesFrom(rng, 'letter', a, P, 3); break;
      }
      case 'initial': {
        var inits = initialsOf(lang); a = rng.pick(inits);
        var w0 = rng.pick(DM.WORDS[lang].filter(function (w) { return w.initial === a; }));
        show = { kind: 'animal', value: w0.animal, sprite: w0.sprite, scale: 1 }; params = { word: w0.word, animal: w0.animal };
        var lp = LETTER_POOL[lang].split('').concat(inits.filter(function (x) { return LETTER_POOL[lang].indexOf(x) < 0; }));
        // distractors are never another listed word's initial for the same picture
        ch = choicesFrom(rng, 'letter', a, lp, 3); break;
      }
      case 'add': {
        var hi = ADD_MAX[age] || 10; a = rng.int(age >= 7 ? 4 : 2, hi); k = rng.int(1, a - 1);
        var t1 = k + ' + ' + (a - k); show = { kind: 'text', value: t1, text: t1 };
        ch = choicesFrom(rng, 'number', a, numberDistractors(a, 0, hi + 2), 3); break;
      }
      case 'sub': {
        a = rng.int(0, 9); k = rng.int(1, 10 - a);
        var t2 = (a + k) + ' ' + MINUS + ' ' + k; show = { kind: 'text', value: t2, text: t2 };
        ch = choicesFrom(rng, 'number', a, numberDistractors(a, 0, 10), 3); break;
      }
      case 'oddeven': {
        var nn = rng.int(1, 20); a = parityOf(nn);
        show = { kind: 'number', value: nn, n: nn, text: String(nn) };
        ch = choicesFrom(rng, 'parity', a, ['odd', 'even'], 2); break;
      }
      default: throw new Error('DM.Content: unknown topic ' + topic);
    }
    return { topic: topic, promptKey: 'talk.' + topic, params: params, show: show, choices: ch.choices, answerId: ch.answerId };
  }

  DM.Content = {
    makeRound: makeRound, makeTalk: makeTalk, validate: validate, facesMatch: facesMatch,
    topicsFor: function (age) { return DM.AGE_TOPICS[ageOf(age)].slice(); },
    pairsFor: pairsFor, maxPairs: maxPairs,
    TOPICS: ALL_TOPICS, COLORS: COLORS, COLORS5: COLORS5, SHAPES: SHAPES.concat(['rect']), ANIMALS: DM.ANIMALS,
    PAIRS: PAIRS, PEEK: PEEK, MAX_PAIRS: MAX_PAIRS, SMALL_SCALE: SMALL_SCALE, COUNT_RANGE: COUNT_RANGE, LETTER_POOL: LETTER_POOL,
    CLASH: CLASH, SAFE_SETS: SAFE_SETS, ageOf: ageOf, clash: clash, shapesFor: shapesFor, initialsOf: initialsOf, parityOf: parityOf
  };
})(window.DM = window.DM || {});
