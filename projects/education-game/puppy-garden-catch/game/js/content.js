/* Puppy Garden Catch — PG.PALETTE, PG.AGE_TOPICS, PG.WORDS, PG.ANIMAL_SOUNDS, PG.Content (pure + deterministic)
 *
 *   PG.Content.makeRound(topic, { age, lang, rng, roundIndex }) → round   (DESIGN §5.1)
 *   PG.Content.makeTalk(topic,  { age, lang, rng })             → talk    (same format as the sister game)
 *   PG.Content.validate(round)  → null | 'reason'   (self-check: every round completable)
 *   PG.Content.matches(tpl, target) → bool          (is this item template a right answer for the target?)
 *   PG.Content.topicsFor(age)   → the 4 chapter topics (age ≥ 7 uses 7, < 3 uses 3)
 *
 * A round is a TARGET + a POOL of item templates that may fall:
 *   round = { topic, mode:'catch'|'count', promptKey, params, need, target:{kind,value},
 *             pool:[{ sprite|null, shape, color, anyColor, text, scale, size, nameKind, nameValue, right }],
 *             rightShare, maxAir, seed }
 *   size = drawn item width in px INCLUDING scale (the bubble is drawn 1.35 × size).
 *   anyColor = true → PG.World picks a random palette colour for every spawn (shapes, age 5+).
 * Content only emits kinds / values / keys (no text): PG.I18N turns them into words.
 */
(function (PG) {
  'use strict';

  PG.PALETTE = {
    red:    { fill: '#E84A4A', dark: '#A8282E' },
    blue:   { fill: '#3C8DE8', dark: '#1F5BA8' },
    yellow: { fill: '#FFD23F', dark: '#C99A12' },
    green:  { fill: '#4CC26B', dark: '#2A8343' },
    orange: { fill: '#FF9A2E', dark: '#C4650C' },
    purple: { fill: '#9B6BE0', dark: '#6840A8' },
    cream:  { fill: '#FFF4DC', dark: '#C9A877' }
  };
  var COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple'];

  PG.AGE_TOPICS = {
    3: ['colors', 'shapes', 'size', 'animals'],
    4: ['colors', 'shapes', 'count', 'animals'],
    5: ['shapes', 'count', 'letters', 'animals'],
    6: ['lower', 'initial', 'add', 'count'],
    7: ['add', 'sub', 'initial', 'oddeven']
  };
  var ALL_TOPICS = ['colors', 'shapes', 'size', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];

  function W(word, sprite, initial) { return { word: word, sprite: sprite, initial: initial }; }
  PG.WORDS = {
    en: [W('apple', 'fruit_apple', 'A'), W('bear', 'animal_bear', 'B'), W('bat', 'animal_bat', 'B'), W('bird', 'animal_bird', 'B'),
      W('banana', 'fruit_banana', 'B'), W('cat', 'animal_cat', 'C'), W('cow', 'animal_cow', 'C'), W('carrot', 'fruit_carrot', 'C'),
      W('duck', 'animal_duck', 'D'), W('fish', 'animal_fish', 'F'), W('frog', 'animal_frog', 'F'), W('hen', 'animal_hen', 'H'),
      W('owl', 'animal_owl', 'O'), W('orange', 'fruit_orange', 'O'), W('pig', 'animal_pig', 'P'), W('pear', 'fruit_pear', 'P'),
      W('rabbit', 'animal_rabbit', 'R'), W('sheep', 'animal_sheep', 'S'), W('squirrel', 'animal_squirrel', 'S'),
      W('strawberry', 'fruit_strawberry', 'S')],
    vi: [W('bò', 'animal_cow', 'B'), W('cá', 'animal_fish', 'C'), W('cú', 'animal_owl', 'C'), W('cừu', 'animal_sheep', 'C'),
      W('cam', 'fruit_orange', 'C'), W('dơi', 'animal_bat', 'D'), W('dâu', 'fruit_strawberry', 'D'), W('gấu', 'animal_bear', 'G'),
      W('gà', 'animal_hen', 'G'), W('heo', 'animal_pig', 'H'), W('lê', 'fruit_pear', 'L'), W('mèo', 'animal_cat', 'M'),
      W('sóc', 'animal_squirrel', 'S'), W('táo', 'fruit_apple', 'T'), W('vịt', 'animal_duck', 'V'), W('ếch', 'animal_frog', 'Ê')]
  };

  // animals that make a sound (the sound text lives in i18n: 'sound.<animal>'); value = an English onomatopoeia id
  PG.ANIMAL_SOUNDS = { cow: 'moo', duck: 'quack', sheep: 'baa', cat: 'meow', hen: 'cluck', frog: 'ribbit', bird: 'tweet', owl: 'hoot', pig: 'oink' };
  var ANIMALS = Object.keys(PG.ANIMAL_SOUNDS);

  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart'];
  var FRUITS = ['apple', 'banana', 'strawberry', 'orange', 'pear', 'cherry', 'carrot'];
  var LETTER_POOL = { en: 'ABCDEFGHKLMNOPRSTUW', vi: 'ABCDEGHKLMNOPSTUVXY' };
  var MINUS = '−';
  // base drawn item sizes (px, logical) — balls 90–120 (DESIGN §4.1); the bubble is 1.35× this
  var SIZE = { ball: 104, animal: 108, fruit: 100, shape: 100 };
  var SIZE_SCALE = { big: 1.3, small: 0.7 };
  var COUNT_RANGE = { 3: [1, 3], 4: [1, 5], 5: [3, 6], 6: [4, 8], 7: [4, 8] };   // QA playtest row 2 (was 5: 3–10, 6+: 4–12)
  var MAX_AIR = { 3: 2, 4: 3, 5: 3, 6: 4, 7: 4 };

  function ageOf(a) { a = Math.round(+a || 4); return a < 3 ? 3 : a > 7 ? 7 : a; }
  function langOf(l) { return l === 'vi' ? 'vi' : 'en'; }
  function letterPool(lang, topic) {   // lower-case l and capital I look alike in rounded fonts
    var P = LETTER_POOL[langOf(lang)].split('');
    return topic === 'lower' ? P.filter(function (c) { return c !== 'I' && c !== 'L'; }) : P;
  }
  function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }
  // colour-blind safety below age 5: never blue+purple, red+green or yellow+orange together (rounds and Talk time)
  var CLASH = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange']];
  function clash(cs) {
    for (var i = 0; i < CLASH.length; i++) if (cs.indexOf(CLASH[i][0]) >= 0 && cs.indexOf(CLASH[i][1]) >= 0) return true;
    return false;
  }
  function safeColors(rng, n, age) {
    var cs = rng.sample(COLORS, n), tries = 0;
    while (age < 5 && clash(cs) && tries++ < 60) cs = rng.sample(COLORS, n);
    return cs;
  }

  function tpl(o) {
    return { sprite: o.sprite || null, shape: o.shape || null, color: o.color || null, anyColor: !!o.anyColor,
      text: o.text === undefined || o.text === null ? null : String(o.text), scale: o.scale || 1, size: o.size,
      nameKind: o.nameKind, nameValue: o.nameValue, right: !!o.right };
  }
  function ball(color, scale, right, nameKind, nameValue) {
    return tpl({ sprite: 'ball_' + color, color: color, scale: scale, size: SIZE.ball * scale, nameKind: nameKind, nameValue: nameValue, right: right });
  }
  function plainBall(text, right, nameKind, nameValue) {
    return tpl({ sprite: 'ball_plain', color: 'cream', text: text, size: SIZE.ball, nameKind: nameKind, nameValue: nameValue, right: right });
  }
  function spriteSize(sprite) { return sprite.indexOf('fruit_') === 0 ? SIZE.fruit : SIZE.animal; }

  /** distinct kinds in the air (incl. the target) */
  function kindsFor(topic, age) {
    if (topic === 'colors' || topic === 'shapes' || topic === 'animals') return age <= 3 ? 2 : age === 4 ? 3 : 4;
    if (topic === 'size') return 2;
    if (topic === 'count') return 2;
    return 3;
  }
  function needFor(ri, rng) { return ri <= 0 ? 1 : ri === 1 ? 2 : ri === 2 ? rng.int(2, 3) : 3; }

  /** What a child hears as "the same round again": the target (size: size + colour). */
  function roundKey(r) { return r.topic === 'size' ? r.target.value + '|' + r.pool[0].color : r.topic + ':' + String(r.target.value); }

  /** o.avoid = roundKey of the previous round: re-rolled (same rng stream, ≤ 8 tries) so the target is not repeated. */
  function makeRound(topic, o) {
    o = o || {};
    if (!o.rng) o = { age: o.age, lang: o.lang, roundIndex: o.roundIndex, avoid: o.avoid, rng: new PG.RNG(1) };
    var r = makeRound1(topic, o);
    for (var k = 0; k < 8 && o.avoid && roundKey(r) === o.avoid; k++) r = makeRound1(topic, o);
    return r;
  }

  function makeRound1(topic, o) {
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new PG.RNG(1), ri = o.roundIndex || 0;
    var warm = ri === 0, n = kindsFor(topic, age), pool = [], params = {}, target, mode = 'catch', promptKey = 'p.' + topic;
    var need = needFor(ri, rng), rightShare = warm ? 0.7 : 0.55, i, k;

    switch (topic) {
      case 'colors': {
        var cs = safeColors(rng, n, age);
        target = { kind: 'color', value: cs[0] }; params = { color: cs[0] };
        for (i = 0; i < n; i++) pool.push(ball(cs[i], 1, i === 0, 'color', cs[i]));
        break;
      }
      case 'shapes': {
        var shp = age >= 5 ? SHAPES.concat(['rectangle']) : SHAPES;
        var ss = rng.sample(shp, n), sc = safeColors(rng, n, age);
        target = { kind: 'shape', value: ss[0] }; params = { shape: ss[0] };
        for (i = 0; i < n; i++) {
          pool.push(tpl({ shape: ss[i], color: age >= 5 ? null : sc[i], anyColor: age >= 5, size: SIZE.shape,
            nameKind: 'shape', nameValue: ss[i], right: i === 0 }));
        }
        break;
      }
      case 'size': {
        var c = rng.pick(COLORS), want = rng.pick(['big', 'small']);
        target = { kind: 'size', value: want }; params = { size: want };
        pool.push(ball(c, SIZE_SCALE[want], true, 'size', want));
        var other = want === 'big' ? 'small' : 'big';
        pool.push(ball(c, SIZE_SCALE[other], false, 'size', other));
        break;
      }
      case 'count': {
        mode = 'count'; rightShare = 0.7;
        var r = COUNT_RANGE[age], N;
        if (warm) N = age <= 4 ? rng.int(1, 2) : age === 5 ? 3 : rng.int(r[0], r[0] + 1);
        else N = rng.int(Math.max(2, r[0]), r[1]);
        var fr = rng.sample(FRUITS, 2);
        need = N; target = { kind: 'fruit', value: fr[0] }; params = { n: N, fruit: fr[0] };
        pool.push(tpl({ sprite: 'fruit_' + fr[0], size: SIZE.fruit, nameKind: 'fruit', nameValue: fr[0], right: true }));
        pool.push(tpl({ sprite: 'fruit_' + fr[1], size: SIZE.fruit, nameKind: 'fruit', nameValue: fr[1], right: false }));
        break;
      }
      case 'animals': {
        var an = rng.sample(ANIMALS, n);
        target = { kind: 'animal', value: an[0] }; params = { animal: an[0], sound: an[0] };
        if (age >= 5 && !warm) promptKey = 'p.animalsSound';     // "Who says moo? Catch it!" (warm-up names it)
        for (i = 0; i < n; i++) pool.push(tpl({ sprite: 'animal_' + an[i], size: SIZE.animal, nameKind: 'animal', nameValue: an[i], right: i === 0 }));
        break;
      }
      case 'letters':
      case 'lower': {
        var ls = rng.sample(letterPool(lang, topic), 3);
        target = { kind: 'letter', value: ls[0] }; params = { letter: ls[0] };
        for (i = 0; i < 3; i++) {
          var t = topic === 'lower' ? ls[i].toLowerCase() : ls[i];
          pool.push(plainBall(t, i === 0, 'letter', t));
        }
        break;
      }
      case 'initial': {
        var words = PG.WORDS[lang], byInit = {}, inits = [];
        for (i = 0; i < words.length; i++) {
          var w0 = words[i];
          if (!byInit[w0.initial]) { byInit[w0.initial] = []; inits.push(w0.initial); }
          byInit[w0.initial].push(w0);
        }
        var ch = rng.sample(inits, 3);
        target = { kind: 'letter', value: ch[0] }; params = { letter: ch[0] };
        for (i = 0; i < 3; i++) {
          var cnt = Math.min(byInit[ch[i]].length, i === 0 ? 2 : 1);
          var ws = rng.sample(byInit[ch[i]], cnt);
          for (k = 0; k < ws.length; k++) pool.push(tpl({ sprite: ws[k].sprite, size: spriteSize(ws[k].sprite), nameKind: 'word', nameValue: ws[k].word, right: i === 0 }));
        }
        break;
      }
      case 'add':
      case 'sub': {
        var isAdd = topic === 'add', s, a, b, expr;
        if (isAdd) { var hi = age >= 7 ? 20 : 10; s = rng.int(age >= 7 ? 4 : 2, hi); a = rng.int(1, s - 1); expr = a + '+' + (s - a); }
        else { s = rng.int(0, 9); b = rng.int(1, 10 - s); expr = (s + b) + MINUS + b; }
        target = { kind: 'number', value: s }; params = { sum: expr };
        var nums = [s], cand = rng.shuffle([s - 1, s + 1, s - 2, s + 2, s + 3, s - 3, s + 4]);
        for (i = 0; i < cand.length && nums.length < 3; i++) if (cand[i] >= 0 && nums.indexOf(cand[i]) < 0) nums.push(cand[i]);
        for (i = 0; i < 3; i++) pool.push(plainBall(String(nums[i]), i === 0, 'number', nums[i]));
        break;
      }
      case 'oddeven': {
        var par = rng.pick(['odd', 'even']), want2 = par === 'odd' ? 1 : 0;
        target = { kind: 'parity', value: par }; params = { parity: par };
        var all = rng.shuffle(range(1, 20)), gotR = 0, gotW = 0, cntR = warm ? 2 : 3, cntW = 3;
        for (i = 0; i < all.length; i++) {
          var isR = all[i] % 2 === want2;
          if (isR && gotR < cntR) { pool.push(plainBall(String(all[i]), true, 'number', all[i])); gotR++; }
          else if (!isR && gotW < cntW) { pool.push(plainBall(String(all[i]), false, 'number', all[i])); gotW++; }
        }
        break;
      }
      default: throw new Error('PG.Content: unknown topic ' + topic);
    }

    var maxAir = MAX_AIR[age];
    if (warm) maxAir = Math.max(2, maxAir - 1);
    var round = { topic: topic, mode: mode, promptKey: promptKey, params: params, need: need, target: target,
      pool: pool, rightShare: rightShare, maxAir: maxAir, seed: (rng.next() * 4294967296) >>> 0 };
    var err = validate(round);
    if (err) throw new Error('PG.Content: invalid round (' + topic + '): ' + err);
    return round;
  }

  /** null when the round is valid and completable, else a reason. */
  function validate(r) {
    if (!r || !r.target || !r.target.kind) return 'no target';
    if (!r.pool || !r.pool.length) return 'no pool';
    if (!(r.need >= 1) || Math.floor(r.need) !== r.need) return 'bad need';
    if (!(r.maxAir >= 2)) return 'bad maxAir';
    if (!(r.rightShare > 0 && r.rightShare < 1)) return 'bad rightShare';
    var nr = 0, nw = 0, seen = {};
    for (var i = 0; i < r.pool.length; i++) {
      var t = r.pool[i];
      if (!(t.size > 0)) return 'bad size';
      if (t.nameKind === undefined || t.nameValue === undefined || t.nameValue === null) return 'no name';
      if (!t.sprite && !t.shape) return 'nothing to draw';
      if (t.shape && !t.color && !t.anyColor) return 'shape without colour';
      var key = t.sprite + '|' + t.shape + '|' + t.text + '|' + t.scale + '|' + t.color;
      if (seen[key]) return 'duplicate template';
      seen[key] = 1;
      if (!!t.right !== matches(t, r.target)) return 'right flag mismatch ' + key;
      if (t.right) nr++; else nw++;
    }
    if (nr < 1) return 'no right item';
    if (nw < 1) return 'no wrong item';
    return null;
  }

  var WORD_INIT = {};
  (function () { for (var l in PG.WORDS) PG.WORDS[l].forEach(function (w) { WORD_INIT[w.word] = w.initial; }); })();
  function matches(t, target) {
    switch (target.kind) {
      case 'color': return t.color === target.value;
      case 'shape': return t.shape === target.value;
      case 'size': return t.nameValue === target.value && Math.abs(t.scale - SIZE_SCALE[target.value]) < 1e-9;
      case 'fruit': return t.sprite === 'fruit_' + target.value;
      case 'animal': return t.sprite === 'animal_' + target.value;
      case 'letter':
        if (t.nameKind === 'word') return WORD_INIT[t.nameValue] === target.value;
        return String(t.text).toUpperCase() === target.value;
      case 'number': return +t.text === target.value;
      case 'parity': return (+t.text % 2 === 1) === (target.value === 'odd');
    }
    return false;
  }

  // ---------------- Talk time ----------------
  function choicesFrom(rng, kind, answer, distractorPool, count) {
    var vals = [answer], pool2 = rng.shuffle(distractorPool.filter(function (v) { return v !== answer; }));
    for (var i = 0; vals.length < count && i < pool2.length; i++) if (vals.indexOf(pool2[i]) < 0) vals.push(pool2[i]);
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

  function makeTalk(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new PG.RNG(1);
    var show = { sprite: null, shape: null, color: null, text: null, count: 1, scale: 1 }, params = {}, ch, a, k;
    switch (topic) {
      case 'colors': {
        a = rng.pick(COLORS); show.sprite = 'ball_' + a; show.color = a;
        ch = choicesFrom(rng, 'color', a, COLORS, 3);
        for (var tr = 0; tr < 60 && age < 5 && clash(ch.choices.map(function (c) { return c.value; })); tr++) ch = choicesFrom(rng, 'color', a, COLORS, 3);
        break;
      }
      case 'shapes': {
        var sp = age >= 5 ? SHAPES.concat(['rectangle']) : SHAPES;
        a = rng.pick(sp); show.shape = a; show.color = rng.pick(COLORS);
        ch = choicesFrom(rng, 'shape', a, sp, 3); break;
      }
      case 'size': {
        var c = rng.pick(COLORS); a = rng.pick(['big', 'small']);
        show.sprite = 'ball_' + c; show.color = c; show.scale = SIZE_SCALE[a];
        ch = choicesFrom(rng, 'size', a, ['big', 'small'], 2); break;
      }
      case 'count': {
        var r = { 3: [1, 5], 4: [1, 5], 5: [2, 10], 6: [3, 12], 7: [3, 12] }[age];
        a = rng.int(r[0], r[1]); show.sprite = 'fruit_' + rng.pick(FRUITS); show.count = a;
        ch = choicesFrom(rng, 'number', a, numberDistractors(a, 1, Math.max(r[1], a + 2)), 3); break;
      }
      case 'animals': {
        // "Who says moo?" — the question is heard, not seen: show a plain bubble, choices are animal pictures
        a = rng.pick(ANIMALS); show.sprite = 'bubble'; params = { sound: a };
        ch = choicesFrom(rng, 'animal', a, ANIMALS, 3); break;
      }
      case 'letters':
      case 'lower': {
        var P = letterPool(lang, topic); a = rng.pick(P);
        show.sprite = 'ball_plain'; show.color = 'cream'; show.text = topic === 'lower' ? a.toLowerCase() : a;
        ch = choicesFrom(rng, 'letter', a, P, 3); break;
      }
      case 'initial': {
        // letter first (uniform), then one of its words — otherwise a letter with many words dominates
        var words = PG.WORDS[lang], inits = [];
        words.forEach(function (w) { if (inits.indexOf(w.initial) < 0) inits.push(w.initial); });
        a = rng.pick(inits);
        var w0 = rng.pick(words.filter(function (w) { return w.initial === a; }));
        show.sprite = w0.sprite;
        ch = choicesFrom(rng, 'letter', a, inits, 3); break;
      }
      case 'add': {
        var hi = age >= 7 ? 20 : 10; a = rng.int(age >= 7 ? 4 : 2, hi); k = rng.int(1, a - 1);
        show.sprite = 'ball_plain'; show.color = 'cream'; show.text = k + '+' + (a - k);
        ch = choicesFrom(rng, 'number', a, numberDistractors(a, 0, hi + 2), 3); break;
      }
      case 'sub': {
        a = rng.int(0, 9); k = rng.int(1, 10 - a);
        show.sprite = 'ball_plain'; show.color = 'cream'; show.text = (a + k) + MINUS + k;
        ch = choicesFrom(rng, 'number', a, numberDistractors(a, 0, 10), 3); break;
      }
      case 'oddeven': {
        var nn = rng.int(1, 20); a = nn % 2 ? 'odd' : 'even';
        show.sprite = 'ball_plain'; show.color = 'cream'; show.text = String(nn);
        ch = choicesFrom(rng, 'parity', a, ['odd', 'even'], 2); break;
      }
      default: throw new Error('PG.Content: unknown topic ' + topic);
    }
    return { topic: topic, promptKey: 'talk.' + topic, params: params, show: show, choices: ch.choices, answerId: ch.answerId };
  }

  PG.Content = {
    makeRound: makeRound, makeTalk: makeTalk, validate: validate, matches: matches, roundKey: roundKey, clash: clash,
    topicsFor: function (age) { return PG.AGE_TOPICS[ageOf(age)].slice(); },
    kindsFor: function (topic, age) { return kindsFor(topic, ageOf(age)); },
    TOPICS: ALL_TOPICS, COLORS: COLORS, SHAPES: SHAPES.concat(['rectangle']), FRUITS: FRUITS, ANIMALS: ANIMALS,
    LETTER_POOL: LETTER_POOL, SIZE: SIZE, SIZE_SCALE: SIZE_SCALE, COUNT_RANGE: COUNT_RANGE, MAX_AIR: MAX_AIR,
    ageOf: ageOf, letterPool: letterPool
  };
})(window.PG = window.PG || {});
