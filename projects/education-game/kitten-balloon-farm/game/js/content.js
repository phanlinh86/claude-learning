/* Kitten's Balloon Farm — KB.PALETTE, KB.ANIMALS, KB.AGE_TOPICS, KB.WORDS, KB.Content (pure + deterministic; DESIGN §5.1)
 *
 *   KB.Content.makeRound(topic, { age, lang, rng, roundIndex, history }) → round
 *        history (optional) = the summaries (round.sum) of the earlier rounds of THIS chapter, oldest first;
 *        the world passes it so a chapter never repeats a target (4 colours, 4 shapes …) and no two rounds are identical.
 *   KB.Content.makeTalk(topic,  { age, lang, rng })                     → talk
 *   KB.Content.validate(round)  → null | 'reason'   (self-check: called by makeRound; every round is completable)
 *   KB.Content.topicsFor(age)   → the 4 chapter topics for an age (age ≥ 7 uses 7, < 3 uses 3)
 *
 * round = { topic, mode:'find'|'count'|'ask', promptKey:'p.<topic>', params, sign:{type, value, need?},
 *           queue?:[balloonId], balloons:[{ id:'b0'…, shape, color, scale, sprite, text, answer, nameKind, nameValue }],
 *           seed (uint32 for the world's home packing), sum (variety summary) }
 * Content only emits kinds / values / keys (no words): KB.I18N turns them into speech and text.
 *
 * Prompt params per topic (what i18n receives):
 *   colors {color, n}   shapes {shape, n}   size {size, n, color}   count {n, color}   animals {animal}
 *   letters/lower {text, letter} (capital)  initial {animal, word, text:'C'}  add/sub {a, b, text:'2 + 3'}
 *   oddeven {parity:'odd'|'even', n}        (n = number of target balloons; 1 → singular wording)
 * Talk params: animals {sound: animalId} (i18n renders that animal's sound word); initial {word, animal}; others {}.
 */
(function (KB) {
  'use strict';

  KB.PALETTE = {
    red:    { fill: '#E84A4A', dark: '#A8282E' },
    blue:   { fill: '#3C8DE8', dark: '#1F5BA8' },
    yellow: { fill: '#FFD23F', dark: '#C99A12' },
    green:  { fill: '#4CC26B', dark: '#2A8343' },
    orange: { fill: '#FF9A2E', dark: '#C4650C' },
    purple: { fill: '#9B6BE0', dark: '#6840A8' },
    pink:   { fill: '#FF8FC0', dark: '#C9558A' },   // text / animal balloons only, never an answer
    cream:  { fill: '#FFF4DC', dark: '#C9A877' }    // text balloons
  };
  var COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple'];   // answer colours
  var TEXT_COLORS = ['cream', 'pink', 'yellow'];                          // light balloons for letters / numbers

  KB.ANIMALS = ['cow', 'pig', 'sheep', 'duck', 'horse', 'goat', 'chick', 'bunny', 'puppy'];

  KB.AGE_TOPICS = {
    3: ['colors', 'size', 'shapes', 'animals'],
    4: ['colors', 'shapes', 'count', 'animals'],
    5: ['shapes', 'count', 'letters', 'animals'],
    6: ['lower', 'initial', 'add', 'count'],
    7: ['initial', 'add', 'sub', 'oddeven']
  };
  var ALL_TOPICS = ['colors', 'shapes', 'size', 'animals', 'count', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];

  function Wd(word, animal, initial) { return { word: word, sprite: 'animal_' + animal, animal: animal, initial: initial }; }
  KB.WORDS = {
    en: [Wd('cow', 'cow', 'C'), Wd('pig', 'pig', 'P'), Wd('sheep', 'sheep', 'S'), Wd('duck', 'duck', 'D'), Wd('horse', 'horse', 'H'),
      Wd('goat', 'goat', 'G'), Wd('chick', 'chick', 'C'), Wd('bunny', 'bunny', 'B'), Wd('puppy', 'puppy', 'P')],
    // th / ng / ch are taught as their own sounds in VN kindergartens: thỏ, ngựa, chó are left out
    vi: [Wd('bò', 'cow', 'B'), Wd('lợn', 'pig', 'L'), Wd('cừu', 'sheep', 'C'), Wd('vịt', 'duck', 'V'), Wd('dê', 'goat', 'D'),
      Wd('gà con', 'chick', 'G')]
  };

  /* Animal sounds (DESIGN §6). Value = a sound GROUP: two choices of one Talk question never share a group
   * (en sheep "baa" and goat "maa" sound alike → same group). null = no sound → never the answer. */
  var SOUND = {
    en: { cow: 'moo', pig: 'oink', sheep: 'baa', duck: 'quack', horse: 'neigh', goat: 'baa', chick: 'cheep', puppy: 'woof', bunny: null },
    vi: { cow: 'mo', pig: 'ut', sheep: 'be', duck: 'cap', horse: 'hi', goat: null, chick: 'chip', puppy: 'gau', bunny: null }
  };

  var SHAPES = ['circle', 'heart', 'star', 'square', 'triangle'];   // + 'rect' from age 5
  var LETTER_POOL = { en: 'ABCDEFGHIKLMNOPRSTUW', vi: 'ABCDEGHIKLMNOPSTUVXY' };
  var MINUS = '−';
  var SIZE_SCALE = { big: 1.3, small: 0.8 };   // QA: small 0.72 → 0.8 so a small balloon stays ≥ 100 px at every age
  var COUNT_RANGE = { 3: [1, 5], 4: [1, 5], 5: [3, 10], 6: [4, 12], 7: [4, 12] };
  var NCHOICE = { 3: 2, 4: 3, 5: 4, 6: 4, 7: 4 };   // colours / shapes / animals in one round
  var MAXB = { 3: 5, 4: 6, 5: 8, 6: 8, 7: 8 };      // find-mode balloons per round

  function ageOf(a) { a = Math.round(+a || 4); return a < 3 ? 3 : a > 7 ? 7 : a; }
  function langOf(l) { return l === 'vi' ? 'vi' : 'en'; }
  function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }
  function shapesFor(age) { return age >= 5 ? SHAPES.concat(['rect']) : SHAPES.slice(); }
  function letterPool(lang, topic) {   // lower-case l and capital I look alike: no I when lower case is shown
    var P = LETTER_POOL[langOf(lang)].split('');
    return topic === 'lower' ? P.filter(function (c) { return c !== 'I'; }) : P;
  }

  /* Colour-blind / toddler safety: below age 5 never blue+purple, red+green (DESIGN), yellow+orange nor green+orange
   * (deutan / protan confusion, QA) in one round. */
  var PAIRS = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange']];
  function clash(cs) {
    for (var i = 0; i < PAIRS.length; i++) if (cs.indexOf(PAIRS[i][0]) >= 0 && cs.indexOf(PAIRS[i][1]) >= 0) return true;
    return false;
  }
  /** Colours safe for `age`; below 5 one colour of every confusable pair is dropped; `keep` always stays. */
  var SAFE_SETS = (function () {   // every largest clash-free colour set (size 3 with the 4 pairs)
    var sets = [], best = 0;
    for (var m = 1; m < 64; m++) {
      var cs = COLORS.filter(function (c, i) { return m & (1 << i); });
      if (clash(cs)) continue;
      if (cs.length > best) { best = cs.length; sets = []; }
      if (cs.length === best) sets.push(cs);
    }
    return sets;
  })();
  function safeColors(rng, age, keep) {
    if (age >= 5) return COLORS.slice();
    var ok = SAFE_SETS.filter(function (s) { return !keep || s.indexOf(keep) >= 0; });
    return rng.pick(ok.length ? ok : SAFE_SETS).slice();
  }
  /** Colours not used yet in this chapter (falls back to "not the last one", then to all). */
  function freshColors(hist, pool) {
    pool = pool || COLORS;
    var used = hist.map(function (h) { return h.color; }), f = pool.filter(function (v) { return used.indexOf(v) < 0; });
    if (!f.length) { var last = hist.length ? hist[hist.length - 1].color : null; f = pool.filter(function (v) { return v !== last; }); }
    return f.length ? f : pool.slice();
  }

  function balloon(o) {
    return { id: null, shape: o.shape || 'circle', color: o.color, scale: o.scale || 1, sprite: o.sprite || null,
      text: o.text === undefined ? null : o.text, answer: !!o.answer, nameKind: o.nameKind, nameValue: o.nameValue };
  }
  /** Distractor counts: one entry per distractor kind, 1–2 each, total + k ≤ max. */
  function distractorCounts(rng, kinds, k, max) {
    var c = kinds.map(function () { return rng.int(1, 2); }), tot = function () { return c.reduce(function (s, v) { return s + v; }, k); };
    var guard = 0;
    while (tot() > max && guard++ < 50) { var twos = []; for (var i = 0; i < c.length; i++) if (c[i] > 1) twos.push(i); if (!twos.length) break; c[rng.pick(twos)]--; }
    return c;
  }
  /** k = number of targets: warm-up 1, later 2–3 (limited by the round maximum). */
  function targetsK(rng, warm, age, nOther) {
    if (warm) return 1;
    return Math.min(rng.int(2, 3), MAXB[age] - nOther);
  }
  /** Values used as the target in earlier rounds of this chapter. */
  function usedTargets(hist) { return (hist || []).map(function (h) { return h.target; }); }
  function freshPick(rng, pool, hist, alsoAvoid) {
    var used = usedTargets(hist), fresh = pool.filter(function (v) { return used.indexOf(v) < 0 && v !== alsoAvoid; });
    if (!fresh.length) { var last = hist && hist.length ? hist[hist.length - 1].target : null; fresh = pool.filter(function (v) { return v !== last; }); }
    return rng.pick(fresh.length ? fresh : pool);
  }

  function makeRound(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new KB.RNG(1), ri = o.roundIndex || 0, hist = o.history || [];
    var prev = hist.length ? hist[hist.length - 1] : null;
    var r = null;
    for (var attempt = 0; attempt < 40; attempt++) {     // re-roll until the round differs from the previous one
      r = build(topic, age, lang, rng, ri, hist);
      if (!prev) break;
      var sameTarget = r.sum.target === prev.target && topic !== 'size' && topic !== 'oddeven';   // two-valued targets may repeat
      if (r.sum.key !== prev.key && !sameTarget) break;
    }
    var err = validate(r);
    if (err) throw new Error('KB.Content: invalid round (' + topic + '): ' + err);
    return r;
  }

  function build(topic, age, lang, rng, ri, hist) {
    var warm = ri === 0, list = [], mode = 'find', params = {}, sign = null, queue = null, target = null, i, j, k;
    var add = function (b) { list.push(b); };
    switch (topic) {
      case 'colors': {
        var tc = freshPick(rng, COLORS, hist);                         // 4 rounds → 4 different target colours
        var pal = safeColors(rng, age, tc).filter(function (c) { return c !== tc; });
        var others = rng.sample(pal, NCHOICE[age] - 1);
        var dc = distractorCounts(rng, others, warm ? 1 : 2, MAXB[age]);
        k = targetsK(rng, warm, age, dc.reduce(function (s, v) { return s + v; }, 0));
        for (i = 0; i < k; i++) add(balloon({ color: tc, answer: true, nameKind: 'color', nameValue: tc }));
        for (i = 0; i < others.length; i++) for (j = 0; j < dc[i]; j++) add(balloon({ color: others[i], nameKind: 'color', nameValue: others[i] }));
        params = { color: tc, n: k }; sign = { type: 'color', value: tc }; target = tc;
        break;
      }
      case 'shapes': {
        var sp = shapesFor(age), ts = freshPick(rng, sp, hist);
        var os = rng.sample(sp.filter(function (s) { return s !== ts; }), NCHOICE[age] - 1);
        var dcs = distractorCounts(rng, os, warm ? 1 : 2, MAXB[age]);
        k = targetsK(rng, warm, age, dcs.reduce(function (s, v) { return s + v; }, 0));
        var prevCol = hist.length ? hist[hist.length - 1].color : null;
        var one = rng.pick(COLORS.filter(function (c) { return c !== prevCol; }));   // age ≤ 4: one colour per round (shape is the only cue)
        var col = function () { return age <= 4 ? one : rng.pick(COLORS); };
        for (i = 0; i < k; i++) add(balloon({ shape: ts, color: col(), answer: true, nameKind: 'shape', nameValue: ts }));
        for (i = 0; i < os.length; i++) for (j = 0; j < dcs[i]; j++) add(balloon({ shape: os[i], color: col(), nameKind: 'shape', nameValue: os[i] }));
        params = { shape: ts, n: k }; sign = { type: 'shape', value: ts }; target = ts;
        break;
      }
      case 'size': {
        var c = rng.pick(freshColors(hist));   // a new colour every round
        var prevSize = hist.length ? hist[hist.length - 1].target : null;
        var tsz = prevSize ? (rng.chance(0.65) ? (prevSize === 'big' ? 'small' : 'big') : prevSize) : rng.pick(['big', 'small']);
        var osz = tsz === 'big' ? 'small' : 'big';
        var cnt = warm ? [1, 1] : rng.pick([[1, 2], [2, 1], [2, 2], [1, 3]]);
        for (i = 0; i < cnt[0]; i++) add(balloon({ color: c, scale: SIZE_SCALE[tsz], answer: true, nameKind: 'size', nameValue: tsz }));
        for (i = 0; i < cnt[1]; i++) add(balloon({ color: c, scale: SIZE_SCALE[osz], nameKind: 'size', nameValue: osz }));
        params = { size: tsz, n: cnt[0], color: c }; sign = { type: 'size', value: tsz }; target = tsz;
        break;
      }
      case 'count': {
        mode = 'count';
        var rr = COUNT_RANGE[age], lo, hi;
        if (warm) { lo = age >= 5 ? 2 : 1; hi = 3; } else { lo = Math.max(2, rr[0]); hi = rr[1]; }
        var usedN = hist.map(function (h) { return h.target; });
        var nPool = range(lo, hi).filter(function (v) { return usedN.indexOf(v) < 0; });
        var N = rng.pick(nPool.length ? nPool : range(lo, hi));
        var cc = rng.pick(freshColors(hist));
        var extra = N <= 3 ? 3 : 2;
        for (i = 0; i < N + extra; i++) add(balloon({ color: cc, answer: true, nameKind: 'balloon', nameValue: cc }));
        params = { n: N, color: cc }; sign = { type: 'number', value: N, need: N }; target = N;
        break;
      }
      case 'animals': {
        mode = 'ask';
        var na = warm ? 2 : NCHOICE[age];
        var an = rng.sample(KB.ANIMALS, na);
        var apal = rng.shuffle(safeColors(rng, age).concat(['pink']));
        for (i = 0; i < na; i++) add(balloon({ color: apal[i % apal.length], sprite: 'animal_' + an[i], answer: true, nameKind: 'animal', nameValue: an[i] }));
        queue = 'all';
        target = an.slice().sort().join(',');
        break;
      }
      case 'letters':
      case 'lower': {
        var P = letterPool(lang, topic), tl = freshPick(rng, P, hist), ol = rng.sample(P.filter(function (v) { return v !== tl; }), rng.int(2, 3));
        k = warm ? 1 : rng.int(1, 2);
        var show = function (L) { return topic === 'lower' ? L.toLowerCase() : L; };
        for (i = 0; i < k; i++) add(balloon({ color: rng.pick(TEXT_COLORS), text: show(tl), answer: true, nameKind: 'letter', nameValue: show(tl) }));
        for (i = 0; i < ol.length; i++) add(balloon({ color: rng.pick(TEXT_COLORS), text: show(ol[i]), nameKind: 'letter', nameValue: show(ol[i]) }));
        params = { text: tl, letter: tl, n: k }; sign = { type: 'text', value: tl }; target = tl;
        break;
      }
      case 'initial': {
        var words = KB.WORDS[lang], usedW = usedTargets(hist).map(function (t) { return String(t).split(':')[0]; });
        var fresh = words.filter(function (w0) { return usedW.indexOf(w0.animal) < 0; });
        var wd = rng.pick(fresh.length ? fresh : words);
        var pool = LETTER_POOL[lang].split('').filter(function (v) { return v !== wd.initial; });
        var dl = rng.sample(pool, 2);
        add(balloon({ color: rng.pick(TEXT_COLORS), text: wd.initial, answer: true, nameKind: 'letter', nameValue: wd.initial }));
        for (i = 0; i < dl.length; i++) add(balloon({ color: rng.pick(TEXT_COLORS), text: dl[i], nameKind: 'letter', nameValue: dl[i] }));
        params = { animal: wd.animal, word: wd.word, text: wd.initial, n: 1 }; sign = { type: 'animal', value: wd.animal }; target = wd.animal + ':' + wd.initial;
        break;
      }
      case 'add':
      case 'sub': {
        var isAdd = topic === 'add', ans, a, b;
        if (isAdd) { var hiS = age >= 7 ? 20 : 10, loS = warm ? 2 : (age >= 7 ? 5 : 3); ans = rng.int(loS, warm ? Math.min(5, hiS) : hiS); a = rng.int(1, ans - 1); b = ans - a; }
        else { a = rng.int(warm ? 2 : 3, warm ? 5 : 10); b = rng.int(1, a - 1); ans = a - b; }
        // plausible distractors: 2 of the 4 nearest valid values (±1–3, ≥ 0)
        var cand = [ans - 1, ans + 1, ans - 2, ans + 2, ans - 3, ans + 3].filter(function (v) { return v >= 0; }).slice(0, 4);
        var dist = rng.sample(cand, 2);
        add(balloon({ color: rng.pick(TEXT_COLORS), text: String(ans), answer: true, nameKind: 'number', nameValue: ans }));
        for (i = 0; i < dist.length; i++) add(balloon({ color: rng.pick(TEXT_COLORS), text: String(dist[i]), nameKind: 'number', nameValue: dist[i] }));
        var txt = a + (isAdd ? ' + ' : ' ' + MINUS + ' ') + b;
        params = { a: a, b: b, text: txt, n: 1 }; sign = { type: 'text', value: txt }; target = txt;
        break;
      }
      case 'oddeven': {
        var par = hist.length ? (rng.chance(0.6) ? (hist[hist.length - 1].target === 'odd' ? 'even' : 'odd') : hist[hist.length - 1].target) : rng.pick(['odd', 'even']);
        var tot = rng.int(5, 6), kk = warm ? 1 : rng.int(2, 3), want = par === 'odd' ? 1 : 0;
        var nums = rng.shuffle(range(1, 20)), got = 0, gotO = 0;
        for (i = 0; i < nums.length && (got < kk || gotO < tot - kk); i++) {
          var isT = nums[i] % 2 === want;
          if (isT && got < kk) { got++; add(balloon({ color: rng.pick(TEXT_COLORS), text: String(nums[i]), answer: true, nameKind: 'number', nameValue: nums[i] })); }
          else if (!isT && gotO < tot - kk) { gotO++; add(balloon({ color: rng.pick(TEXT_COLORS), text: String(nums[i]), nameKind: 'number', nameValue: nums[i] })); }
        }
        params = { parity: par, n: kk }; sign = { type: 'text', value: par === 'odd' ? '1 3 5' : '2 4 6', parity: par }; target = par;
        break;
      }
      default: throw new Error('KB.Content: unknown topic ' + topic);
    }

    rng.shuffle(list);
    for (i = 0; i < list.length; i++) list[i].id = 'b' + i;
    if (queue === 'all') {
      queue = rng.shuffle(list.map(function (q) { return q.id; }));
      var first = list[+queue[0].slice(1)];
      params = { animal: first.nameValue }; sign = { type: 'animal', value: first.nameValue };
    }
    var round = { topic: topic, mode: mode, promptKey: 'p.' + topic, params: params, sign: sign, balloons: list,
      seed: (rng.next() * 4294967296) >>> 0 };
    if (queue) round.queue = queue;
    var sig = list.map(function (q) { return q.nameValue + '/' + q.color + '/' + q.shape + '/' + q.scale; }).sort().join('|');
    round.sum = { target: target, color: params.color || (list[0] && list[0].color), set: mode === 'ask' ? target : null,
      key: topic + ':' + String(target) + ':' + sig };
    return round;
  }

  // ---------------- self-check ----------------
  var WORD_INIT = {};
  (function () { for (var l in KB.WORDS) { WORD_INIT[l] = {}; KB.WORDS[l].forEach(function (w) { WORD_INIT[l][w.animal] = w.initial; }); } })();
  function evalText(t) {
    var m = /^(\d+) ([+−]) (\d+)$/.exec(t); if (!m) return NaN;
    return m[2] === '+' ? +m[1] + +m[3] : +m[1] - +m[3];
  }
  /** Is balloon `b` a right answer for `round` (find mode)? Independent re-derivation from the sign/params. */
  function matches(r, b) {
    var p = r.params;
    switch (r.topic) {
      case 'colors': return b.color === p.color;
      case 'shapes': return b.shape === p.shape;
      case 'size': return Math.abs(b.scale - SIZE_SCALE[p.size]) < 1e-9;
      case 'letters': return b.text === p.text;
      case 'lower': return b.text === p.text.toLowerCase();
      case 'initial': return b.text === p.text && (WORD_INIT.en[p.animal] === p.text || WORD_INIT.vi[p.animal] === p.text);
      case 'add': case 'sub': return +b.text === evalText(p.text);
      case 'oddeven': return (+b.text % 2 === 1) === (p.parity === 'odd');
      case 'count': return true;
      case 'animals': return true;
    }
    return false;
  }

  var KINDS = ['color', 'shape', 'size', 'animal', 'number', 'letter', 'parity', 'sum', 'diff', 'word', 'sound', 'balloon'];
  function validate(r) {
    if (!r || !r.balloons || !r.balloons.length) return 'no balloons';
    if (!r.sign || !r.sign.type) return 'no sign';
    var ids = {}, nAns = 0, i, b;
    for (i = 0; i < r.balloons.length; i++) {
      b = r.balloons[i];
      if (!b.id || ids[b.id]) return 'bad / duplicate id';
      ids[b.id] = b;
      if (!KB.PALETTE[b.color]) return 'bad colour ' + b.color;
      if (SHAPES.concat(['rect']).indexOf(b.shape) < 0) return 'bad shape';
      if (!(b.scale > 0)) return 'bad scale';
      if (KINDS.indexOf(b.nameKind) < 0 || b.nameValue === undefined || b.nameValue === null) return 'no name';
      if (b.answer) nAns++;
      if (r.mode === 'find' && b.answer !== matches(r, b)) return 'answer flag wrong on ' + b.id;
    }
    if (r.balloons.length > 14) return 'too many balloons';
    if (r.mode === 'find') {
      if (nAns < 1) return 'no target';
      if (nAns === r.balloons.length) return 'no distractor';
      if (r.params.n !== nAns) return 'params.n ≠ targets';
      for (i = 0; i < r.balloons.length; i++) if (r.topic === 'colors' && COLORS.indexOf(r.balloons[i].color) < 0) return 'pink/cream in colours';
    } else if (r.mode === 'count') {
      var need = r.sign.need;
      if (!(need >= 1) || need !== r.params.n) return 'bad need';
      if (r.balloons.length < need + 2) return 'not enough balloons';
      if (need <= 3 && r.balloons.length < need + 3) return 'need ≥ 3 extra';
      if (nAns !== r.balloons.length) return 'count balloons are all answers';
    } else if (r.mode === 'ask') {
      var q = r.queue;
      if (!q || q.length !== r.balloons.length) return 'queue must hold every balloon';
      var seen = {}, an = {};
      for (i = 0; i < q.length; i++) { if (!ids[q[i]] || seen[q[i]]) return 'bad queue'; seen[q[i]] = 1; }
      for (i = 0; i < r.balloons.length; i++) {
        b = r.balloons[i];
        if (!b.sprite || b.sprite !== 'animal_' + b.nameValue || KB.ANIMALS.indexOf(b.nameValue) < 0) return 'bad animal balloon';
        if (an[b.nameValue]) return 'duplicate animal'; an[b.nameValue] = 1;
      }
      if (r.params.animal !== ids[q[0]].nameValue) return 'params.animal is not the first target';
    } else return 'bad mode';
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
  /** Animals that can be the answer of "Which animal says …?" in `lang`. */
  function soundAnimals(lang) { var S = SOUND[langOf(lang)]; return KB.ANIMALS.filter(function (a) { return !!S[a]; }); }

  function makeTalk(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new KB.RNG(1);
    var show = {}, params = {}, ch, a, k;
    switch (topic) {
      case 'colors': {
        a = rng.pick(COLORS); show = { shape: 'circle', color: a };
        ch = choicesFrom(rng, 'color', a, safeColors(rng, age, a), 3); break;   // below 5: no confusable pair among the choices
      }
      case 'shapes': {
        var sp = shapesFor(age); a = rng.pick(sp); show = { shape: a, color: rng.pick(COLORS) };
        ch = choicesFrom(rng, 'shape', a, sp, 3); break;
      }
      case 'size': {
        a = rng.pick(['big', 'small']); show = { shape: 'circle', color: rng.pick(COLORS), size: a, scale: SIZE_SCALE[a] };
        ch = choicesFrom(rng, 'size', a, ['big', 'small'], 2); break;
      }
      case 'animals': {
        var S = SOUND[lang];
        a = rng.pick(soundAnimals(lang)); params = { sound: a };
        var groups = [S[a]], vals = [a], pool = rng.shuffle(KB.ANIMALS.filter(function (x) { return x !== a; }));
        for (var i = 0; i < pool.length && vals.length < 3; i++) {
          var g = S[pool[i]] || 'none:' + pool[i];          // soundless animals may be distractors (one at most)
          if (!S[pool[i]] && groups.some(function (q) { return String(q).indexOf('none:') === 0; })) continue;
          if (groups.indexOf(g) >= 0) continue;
          groups.push(g); vals.push(pool[i]);
        }
        rng.shuffle(vals);
        ch = { choices: vals.map(function (v, j) { return { id: 'c' + j, kind: 'animal', value: v }; }), answerId: 'c' + vals.indexOf(a) };
        break;
      }
      case 'count': {
        var rr = { 3: [1, 4], 4: [1, 5], 5: [2, 8], 6: [3, 10], 7: [3, 10] }[age];
        a = rng.int(rr[0], rr[1]); show = { shape: 'circle', color: rng.pick(COLORS), count: a };
        ch = choicesFrom(rng, 'number', a, numberDistractors(a, 1, Math.max(rr[1], a + 2)), 3); break;
      }
      case 'letters':
      case 'lower': {
        var P = letterPool(lang, topic); a = rng.pick(P);
        show = { shape: 'circle', color: 'cream', text: topic === 'lower' ? a.toLowerCase() : a };
        ch = choicesFrom(rng, 'letter', a, P, 3); break;
      }
      case 'initial': {
        var words = KB.WORDS[lang], inits = [];
        words.forEach(function (w) { if (inits.indexOf(w.initial) < 0) inits.push(w.initial); });
        a = rng.pick(inits);
        var w0 = rng.pick(words.filter(function (w) { return w.initial === a; }));
        show = { sprite: w0.sprite }; params = { word: w0.word, animal: w0.animal };
        ch = choicesFrom(rng, 'letter', a, LETTER_POOL[lang].split(''), 3); break;
      }
      case 'add': {
        var hi = age >= 7 ? 20 : 10; a = rng.int(age >= 7 ? 4 : 2, hi); k = rng.int(1, a - 1);
        show = { shape: 'circle', color: 'cream', text: k + ' + ' + (a - k) };
        ch = choicesFrom(rng, 'number', a, numberDistractors(a, 0, hi + 2), 3); break;
      }
      case 'sub': {
        a = rng.int(0, 9); k = rng.int(1, 10 - a);
        show = { shape: 'circle', color: 'cream', text: (a + k) + ' ' + MINUS + ' ' + k };
        ch = choicesFrom(rng, 'number', a, numberDistractors(a, 0, 10), 3); break;
      }
      case 'oddeven': {
        var nn = rng.int(1, 20); a = nn % 2 ? 'odd' : 'even';
        show = { shape: 'circle', color: 'cream', text: String(nn) };
        ch = choicesFrom(rng, 'parity', a, ['odd', 'even'], 2); break;
      }
      default: throw new Error('KB.Content: unknown topic ' + topic);
    }
    return { topic: topic, promptKey: 'talk.' + topic, params: params, show: show, choices: ch.choices, answerId: ch.answerId };
  }

  KB.Content = {
    makeRound: makeRound, makeTalk: makeTalk, validate: validate, matches: matches,
    topicsFor: function (age) { return KB.AGE_TOPICS[ageOf(age)].slice(); },
    TOPICS: ALL_TOPICS, COLORS: COLORS, TEXT_COLORS: TEXT_COLORS, SHAPES: SHAPES.concat(['rect']), ANIMALS: KB.ANIMALS,
    SOUND: SOUND, soundAnimals: soundAnimals, LETTER_POOL: LETTER_POOL, SIZE_SCALE: SIZE_SCALE, COUNT_RANGE: COUNT_RANGE,
    NCHOICE: NCHOICE, MAXB: MAXB, PAIRS: PAIRS, ageOf: ageOf, clash: clash, safeColors: safeColors
  };
})(window.KB = window.KB || {});
