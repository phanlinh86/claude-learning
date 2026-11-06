/* Momo's Toy Train — TT.PALETTE, TT.ANIMALS, TT.SHAPES, TT.TOYS, TT.CARGO, TT.HOMES, TT.AGE_TOPICS, TT.WORDS, TT.Content
 * (pure + deterministic; DESIGN §5.1)
 *
 *   TT.Content.makeRound(topic, { age, lang, rng, roundIndex, surprise, prevKey? }) → round   (self-checked: completable)
 *   TT.Content.makeTalk(topic,  { age, lang, rng }) → talk
 *   TT.Content.validate(round) → null | 'reason'
 *   TT.Content.fits(car, item, lang) → bool     (independent re-derivation: does this cargo belong in this car?)
 *   TT.Content.topicsFor(age, rng?, lastTopics?) → the 4 chapter topics (easiest first)
 *
 * round = { topic, age, lang, roundIndex, mode:'sort'|'count', promptKey, params, surprise, cars:[car], items:[item], key, seed }
 * car   = { id, label:{ type, value, color?, showDots?, a?, b?, op? }, need? (count), nameKind, nameValue }
 *   label.type: 'color' {value: colour} · 'shape' {value: shape, color} · 'size' {value:'big'|'small', color} ·
 *               'home' {value: barn|pond|tree|burrow} · 'number' {value: N, showDots} (count) · 'letter' {value: capital} ·
 *               'text' {value:'2+3' | '5−2', a, b, op:'+'|'−'} · 'parity' {value:'odd'|'even'}
 *   nameKind / nameValue: color/colour · shape/shape · size/big|small · home/home · number/N · letter/capital · sum|diff/text ·
 *               parity/odd|even
 * item  = { id, kind, toy?, shape?, color?, sprite?, text?, n?, animal?, size?, cargo?, scale, answer (car id | null in count
 *           mode: any count car with room), nameKind, nameValue }
 *   kind 'block'  {toy ∈ TT.TOYS, color}             nameKind 'color'  nameValue colour   (colours)
 *        'shape'  {shape, color}                      'shape'  shape
 *        'size'   {size:'big'|'small', color, scale 1 | 0.68}  'size' big|small
 *        'sprite' {sprite:'animal_<a>', animal}       'animal' animal   (homes, initial; + word, initial for 'initial')
 *        'sprite' {sprite:'cargo_<c>', cargo}         'cargo'  cargo    (count)
 *        'letter' {text, color}                       'letter' text     (letters: capital, lower: small)
 *        'number' {n, text, color}                    'number' n        (add, sub, oddeven)
 * prompt keys / params: p.colors {} · p.shapes {} · p.size {color} · p.homes {} · p.count {n, cargo} · p.count2 {a, b, cargo} ·
 *   p.letters {} · p.lower {} · p.initial {} · p.add {} · p.sub {} · p.oddeven {}
 */
(function (TT) {
  'use strict';

  // DESIGN §3 answer palette (exact hex)
  TT.PALETTE = {
    red:    { base: '#E84A4A', dark: '#A8282E', light: '#F7A0A0' },
    blue:   { base: '#3C8DE8', dark: '#1F5BA8', light: '#A6CCF5' },
    yellow: { base: '#FFD23F', dark: '#C99A12', light: '#FFEB9C' },
    green:  { base: '#4CC26B', dark: '#2A8343', light: '#A8E6B8' },
    orange: { base: '#FF9A2E', dark: '#C4650C', light: '#FFCB8E' },
    purple: { base: '#8E44AD', dark: '#6840A8', light: '#D2BDF3' },
    pink:   { base: '#FF8FC0', dark: '#C9558A', light: '#FFCCE2' }      // an answer colour from age 5
  };
  for (var pk in TT.PALETTE) TT.PALETTE[pk].fill = TT.PALETTE[pk].base;   // old field name (shared code)
  var COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple'];
  var COLORS5 = COLORS.concat(['pink']);

  TT.ANIMALS = ['cow', 'pig', 'sheep', 'duck', 'frog', 'fish', 'bird', 'squirrel', 'butterfly', 'bunny', 'mouse', 'fox'];
  TT.SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
  TT.TOYS = ['cube', 'ball', 'cone', 'cylinder'];
  TT.CARGO = ['teddy', 'ball', 'duckie', 'rocket', 'boat', 'drum'];
  TT.HOMES = { barn: ['cow', 'pig', 'sheep'], pond: ['duck', 'frog', 'fish'], tree: ['bird', 'squirrel', 'butterfly'], burrow: ['bunny', 'mouse', 'fox'] };
  TT.ANIMAL_SOUND = { cow: 'moo', pig: 'oink', sheep: 'baa', duck: 'quack', frog: 'ribbit', fish: 'blub', bird: 'tweet',
    squirrel: 'chitter', butterfly: 'flutter', bunny: 'sniff', mouse: 'squeak', fox: 'yip' };
  var HOME_LIST = ['barn', 'pond', 'tree', 'burrow'];
  var HOME_OF = {};
  HOME_LIST.forEach(function (h) { TT.HOMES[h].forEach(function (a) { HOME_OF[a] = h; }); });

  TT.AGE_TOPICS = {
    3: ['colors', 'shapes', 'size', 'homes'],
    4: ['colors', 'shapes', 'count', 'homes'],
    5: ['shapes', 'count', 'letters', 'homes'],
    6: ['lower', 'initial', 'add', 'count'],
    7: ['initial', 'add', 'sub', 'oddeven']
  };
  var ALL_TOPICS = ['colors', 'size', 'shapes', 'count', 'homes', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
  /* Every age has a POOL of 5 topics in difficulty order (= the AGE_TOPICS order + one extra); a session plays 4 of them
   * (rotating between sessions, so "Play again" differs). */
  TT.AGE_POOLS = {
    3: ['colors', 'shapes', 'size', 'homes', 'count'],
    4: ['colors', 'size', 'shapes', 'count', 'homes'],
    5: ['colors', 'shapes', 'count', 'letters', 'homes'],
    6: ['letters', 'lower', 'initial', 'add', 'count'],
    7: ['count', 'initial', 'add', 'sub', 'oddeven']
  };

  // ---- tables (DESIGN §5.1)
  var ITEM_CAP = { 3: 5, 4: 5, 5: 6, 6: 6, 7: 6 };          // sort rounds: total cargo
  var PER_CAR_MAX = 2;                                        // sort rounds: cargo per car (round 0: 1)
  var COUNT_EXTRA = 2, COUNT_EXTRA_SMALL = 3;                 // count rounds: spare cargo (≥ 3 when ΣN ≤ 3)
  var COUNT_SUM_MAX = { 3: 6, 4: 6, 5: 10, 6: 12, 7: 12 };
  var MAX_NEED = 12, MAX_ITEMS = 14, MAX_CARS = 4;
  var DOTS_MAX = 5;                                           // number plates show dots for N ≤ 5 at ages ≤ 4
  var SMALL_SCALE = 0.68;
  var ODDEVEN_MAX = { 5: 10, 6: 12, 7: 20 };
  var ADD_MAX = { 5: 10, 6: 10, 7: 20 };
  var SUB_MAX = 10;
  var SHAPES4 = ['circle', 'square', 'triangle', 'star', 'heart'];   // ages ≤ 4; all 8 from age 5
  var LETTER_POOL = { en: 'ABCDEFGHIKLMNOPRSTUW', vi: 'ABCDEGHIKLMNOPSTUVXY' };
  var LOWER_SKIP = 'IL';                                             // capital I and small l look alike
  var MINUS = '−';
  var BLOCK_TINTS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple'];   // ABC / number block faces (no meaning)

  /* 'initial' words: the toy animals. VI skips words starting with a digraph (ch/th/nh/ph/kh/gi/ng/tr) and ếch (Ê). */
  function Wd(word, animal, initial) { return { word: word, sprite: 'animal_' + animal, animal: animal, initial: initial }; }
  TT.WORDS = {
    en: [Wd('cow', 'cow', 'C'), Wd('pig', 'pig', 'P'), Wd('sheep', 'sheep', 'S'), Wd('duck', 'duck', 'D'), Wd('frog', 'frog', 'F'),
      Wd('fish', 'fish', 'F'), Wd('bird', 'bird', 'B'), Wd('squirrel', 'squirrel', 'S'), Wd('butterfly', 'butterfly', 'B'),
      Wd('bunny', 'bunny', 'B'), Wd('mouse', 'mouse', 'M'), Wd('fox', 'fox', 'F')],
    vi: [Wd('bò', 'cow', 'B'), Wd('heo', 'pig', 'H'), Wd('cừu', 'sheep', 'C'), Wd('vịt', 'duck', 'V'), Wd('cá', 'fish', 'C'),
      Wd('sóc', 'squirrel', 'S'), Wd('bướm', 'butterfly', 'B'), Wd('cáo', 'fox', 'C')]
  };
  var WORD_OF = {};
  (function () { for (var l in TT.WORDS) { WORD_OF[l] = {}; TT.WORDS[l].forEach(function (w) { WORD_OF[l][w.animal] = w; }); } })();

  /* Colour-blind / toddler safety (DESIGN §3): below age 5 one round never holds blue+purple, red+green, yellow+orange or
   * green+orange (cars and cargo together), and no pink. */
  var COLOR_SAFE_BELOW = 5;
  var CLASH = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange']];
  function clash(cs) {
    for (var i = 0; i < CLASH.length; i++) if (cs.indexOf(CLASH[i][0]) >= 0 && cs.indexOf(CLASH[i][1]) >= 0) return true;
    return false;
  }
  function safeSetsOf(n) {
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
  function shapesFor(age) { return age >= 5 ? TT.SHAPES.slice() : SHAPES4.slice(); }
  function letterPool(lang, topic) {
    var P = LETTER_POOL[langOf(lang)].split('');
    return topic === 'lower' ? P.filter(function (c) { return LOWER_SKIP.indexOf(c) < 0; }) : P;
  }
  function parityOf(n) { return n % 2 ? 'odd' : 'even'; }
  function initialsOf(lang) { var s = []; TT.WORDS[langOf(lang)].forEach(function (w) { if (s.indexOf(w.initial) < 0) s.push(w.initial); }); return s; }
  function evalText(t) {
    var m = /^(\d+)([+−])(\d+)$/.exec(String(t).replace(/\s+/g, '')); if (!m) return NaN;
    return m[2] === '+' ? +m[1] + +m[3] : +m[1] - +m[3];
  }
  function colourSet(rng, age, k) {
    if (age < COLOR_SAFE_BELOW) return rng.shuffle(rng.pick(SAFE[k]).slice());
    return rng.sample(COLORS5, k);
  }

  // ---------------- cars and cargo
  function O(base, extra) { if (extra) for (var k in extra) base[k] = extra[k]; return base; }
  function carOf(label, nameKind, nameValue, extra) { return O({ label: label, nameKind: nameKind, nameValue: nameValue }, extra); }
  function iBlock(color, toy) { return { kind: 'block', toy: toy, color: color, scale: 1, nameKind: 'color', nameValue: color }; }
  function iShape(shape, color) { return { kind: 'shape', shape: shape, color: color, scale: 1, nameKind: 'shape', nameValue: shape }; }
  function iSize(size, color) { return { kind: 'size', size: size, color: color, toy: 'cube', scale: size === 'big' ? 1 : SMALL_SCALE, nameKind: 'size', nameValue: size }; }
  function iAnimal(a, lang) {
    var it = { kind: 'sprite', sprite: 'animal_' + a, animal: a, scale: 1, nameKind: 'animal', nameValue: a }, w = WORD_OF[langOf(lang)][a];
    if (w) { it.word = w.word; it.initial = w.initial; }
    return it;
  }
  function iCargo(c) { return { kind: 'sprite', sprite: 'cargo_' + c, cargo: c, scale: 1, nameKind: 'cargo', nameValue: c }; }
  function iLetter(t, color) { return { kind: 'letter', text: t, color: color, scale: 1, nameKind: 'letter', nameValue: t }; }
  function iNumber(n, color) { return { kind: 'number', n: n, text: String(n), color: color, scale: 1, nameKind: 'number', nameValue: n }; }
  function itemKey(it) { return [it.kind, it.toy || '', it.color || '', it.shape || '', it.size || '', it.sprite || '', it.text || ''].join('|'); }
  function labelKey(c) { var L = c.label; return [L.type, L.value, L.color || '', c.need || ''].join('|'); }
  function roundKey(r) {
    return r.cars.map(labelKey).sort().join(',') + '#' + r.items.map(function (it) { return itemKey(it) + '>' + (it.answer === null ? '*' : labelKey(carById(r, it.answer))); }).sort().join(',');
  }
  function carById(r, id) { for (var i = 0; i < r.cars.length; i++) if (r.cars[i].id === id) return r.cars[i]; return null; }

  /** Cars per round (DESIGN §5.1). */
  function carsFor(topic, age, ri, cap) {
    age = ageOf(age); ri = ri | 0;
    var k;
    if (topic === 'count') k = ri <= 2 || age === 5 ? 1 : 2;
    else if (ri === 0 || topic === 'size' || topic === 'oddeven' || age <= 3) k = 2;
    else if (age === 5 && ri >= 2) k = 4;
    else k = 3;
    return cap ? Math.min(k, Math.max(2, cap | 0)) : k;   // cap: iPhone portrait shows at most 3 readable cars (visual QA P1-2)
  }
  function modeFor(topic) { return topic === 'count' ? 'count' : 'sort'; }
  /** The most cars any round of this age / topic list has (layout planning before the first round). */
  function maxCars(age) { return ageOf(age) === 5 ? 4 : ageOf(age) <= 3 ? 2 : 3; }

  /** How many cargo items each car of a sort round gets (round 0: 1 each; later 1–2 each, total ≤ ITEM_CAP). */
  function perCar(rng, age, ri, k, short, warm3) {
    var out = [], i;
    for (i = 0; i < k; i++) out.push(1);
    if (ri === 0 && warm3) { out[rng.int(0, k - 1)]++; return out; }   // later chapters' warm-up: 3 toys (playtest P3)
    if (ri === 0 || short) return out;
    var cap = Math.min(ITEM_CAP[age], k * PER_CAR_MAX);
    var total = ri === 1 ? Math.min(cap, k + 1) : rng.int(Math.min(cap, k + 1), cap);
    var idx = rng.shuffle(range(0, k - 1));
    for (i = 0; out.reduce(function (s, x) { return s + x; }, 0) < total; i++) out[idx[i % k]]++;
    return out;
  }

  /** count rounds: the need of each car. */
  function needsFor(rng, age, ri) {
    if (ri === 0) return [rng.int(1, 2)];
    if (ri === 1) return [rng.int(2, age <= 3 ? 3 : 4)];
    if (age <= 4) {
      if (ri === 2) return [rng.int(3, age <= 3 ? 4 : 5)];
      var a = rng.int(1, 4), b; do { b = rng.int(1, 5); } while (b === a || a + b > COUNT_SUM_MAX[age] || a + b < 4);
      return [a, b];
    }
    if (age === 5) return ri === 2 ? [rng.int(4, 7)] : [rng.int(6, 10)];
    if (ri === 2) return [rng.int(5, 9)];
    var c = rng.int(3, 8), d; do { d = rng.int(3, 8); } while (d === c || c + d > COUNT_SUM_MAX[age]);
    return [c, d];
  }

  /**
   * makeRound(topic, { age, lang, rng, roundIndex, surprise, prevKey?, short? }) → round. `prevKey` = the previous round's key
   * (never the same train twice in a row). `short` (the world sets it when a chapter runs long): sort rounds get 1 cargo per car.
   */
  function makeRound(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new TT.RNG(1), ri = o.roundIndex || 0;
    if (ALL_TOPICS.indexOf(topic) < 0) throw new Error('TT.Content: unknown topic ' + topic);
    var r = null, err = null;
    for (var attempt = 0; attempt < 80; attempt++) {
      r = buildRound(topic, age, lang, rng, ri, !!o.short, o.maxCars || 0, !!o.warm3 && age >= 4);
      r.surprise = ri === 0 ? null : (o.surprise || null);
      err = validate(r);
      if (!err && o.prevKey && r.key === o.prevKey && attempt < 79) { err = 'same train as the previous round'; continue; }
      // never the same set of cars twice in a row (size / oddeven only have one set), never the same counting toy twice
      if (!err && attempt < 60 && o.prevKey && topic !== 'size' && topic !== 'oddeven' && r.key.split('#')[0] === String(o.prevKey).split('#')[0]) { err = 'same cars as the previous round'; continue; }
      if (!err && attempt < 60 && o.prevToy && r.mode === 'count' && r.params && r.params.cargo === o.prevToy) { err = 'same counting toy'; continue; }
      if (!err) break;
    }
    if (err) throw new Error('TT.Content: invalid round (' + topic + ', age ' + age + ', round ' + ri + '): ' + err);
    r.seed = (rng.next() * 4294967296) >>> 0;
    return r;
  }

  function buildRound(topic, age, lang, rng, ri, short, capCars, warm3) {
    var mode = modeFor(topic), k = carsFor(topic, age, ri, capCars), cars = [], items = [], i, j, per, promptKey = 'p.' + topic, params = {};
    function add(carIdx, it) { it.answer = carIdx === null ? null : 'k' + carIdx; items.push(it); }
    switch (topic) {
      case 'colors': {
        var cs = colourSet(rng, age, k); per = perCar(rng, age, ri, k, short, warm3);
        for (i = 0; i < k; i++) {
          cars.push(carOf({ type: 'color', value: cs[i], color: cs[i] }, 'color', cs[i]));
          var toys = rng.shuffle(TT.TOYS.slice());
          for (j = 0; j < per[i]; j++) add(i, iBlock(cs[i], toys[j % toys.length]));
        }
        break;
      }
      case 'shapes': {
        var sp = rng.sample(shapesFor(age), k), sc = age <= 4 ? colourSet(rng, age, k) : null; per = perCar(rng, age, ri, k, short, warm3);
        for (i = 0; i < k; i++) {
          var signC = sc ? sc[i] : rng.pick(COLORS5);
          cars.push(carOf({ type: 'shape', value: sp[i], color: signC }, 'shape', sp[i]));
          for (j = 0; j < per[i]; j++) add(i, iShape(sp[i], sc ? sc[i] : rng.pick(COLORS5)));
        }
        break;
      }
      case 'size': {
        var col = rng.pick(age < COLOR_SAFE_BELOW ? COLORS : COLORS5), sz = rng.shuffle(['big', 'small']); per = perCar(rng, age, ri, 2, short, warm3);
        for (i = 0; i < 2; i++) {
          cars.push(carOf({ type: 'size', value: sz[i], color: col }, 'size', sz[i]));
          for (j = 0; j < per[i]; j++) add(i, iSize(sz[i], col));
        }
        params = { color: col };
        break;
      }
      case 'homes': {
        var hs = rng.sample(HOME_LIST, k); per = perCar(rng, age, ri, k, short, warm3);
        for (i = 0; i < k; i++) {
          cars.push(carOf({ type: 'home', value: hs[i] }, 'home', hs[i]));
          var an = rng.sample(TT.HOMES[hs[i]], per[i]);
          for (j = 0; j < per[i]; j++) add(i, iAnimal(an[j], lang));
        }
        break;
      }
      case 'initial': {   // letters that have enough animals; distinct animals
        var byL = {};
        TT.WORDS[lang].forEach(function (w) { (byL[w.initial] = byL[w.initial] || []).push(w.animal); });
        var Ls = rng.sample(Object.keys(byL), k); per = perCar(rng, age, ri, k, short, warm3);
        for (i = 0; i < k; i++) {
          cars.push(carOf({ type: 'letter', value: Ls[i] }, 'letter', Ls[i]));
          var pool = rng.shuffle(byL[Ls[i]].slice());
          for (j = 0; j < Math.min(per[i], pool.length); j++) add(i, iAnimal(pool[j], lang));
        }
        break;
      }
      case 'letters': case 'lower': {
        var LL = rng.sample(letterPool(lang, topic), k); per = perCar(rng, age, ri, k, short, warm3);
        for (i = 0; i < k; i++) {
          cars.push(carOf({ type: 'letter', value: LL[i] }, 'letter', LL[i]));
          for (j = 0; j < per[i]; j++) add(i, iLetter(topic === 'lower' ? LL[i].toLowerCase() : LL[i], rng.pick(BLOCK_TINTS)));
        }
        break;
      }
      case 'add': {
        var top = ADD_MAX[age] || 10, hiA = ri === 0 ? Math.min(6, top) : top, sums = rng.sample(range(2, hiA), k); per = perCar(rng, age, ri, k, short, warm3);
        for (i = 0; i < k; i++) {
          var a1 = rng.int(1, sums[i] - 1), b1 = sums[i] - a1, t1 = a1 + '+' + b1;
          cars.push(carOf({ type: 'text', value: t1, a: a1, b: b1, op: '+' }, 'sum', t1));
          for (j = 0; j < per[i]; j++) add(i, iNumber(sums[i], rng.pick(BLOCK_TINTS)));
        }
        break;
      }
      case 'sub': {
        var res = rng.sample(range(0, ri === 0 ? 5 : SUB_MAX - 1), k); per = perCar(rng, age, ri, k, short, warm3);
        for (i = 0; i < k; i++) {
          var kk = rng.int(1, SUB_MAX - res[i]), big = res[i] + kk, t2 = big + MINUS + kk;
          cars.push(carOf({ type: 'text', value: t2, a: big, b: kk, op: MINUS }, 'diff', t2));
          for (j = 0; j < per[i]; j++) add(i, iNumber(res[i], rng.pick(BLOCK_TINTS)));
        }
        break;
      }
      case 'oddeven': {
        var hiO = ODDEVEN_MAX[age] || 12, par = rng.shuffle(['odd', 'even']); per = perCar(rng, age, ri, 2, short, warm3);
        for (i = 0; i < 2; i++) {
          cars.push(carOf({ type: 'parity', value: par[i] }, 'parity', par[i]));
          var nums = rng.sample(range(1, hiO).filter(function (x) { return parityOf(x) === par[i]; }), per[i]);
          for (j = 0; j < per[i]; j++) add(i, iNumber(nums[j], rng.pick(BLOCK_TINTS)));
        }
        break;
      }
      case 'count': {
        var needs = needsFor(rng, age, ri), cargo = rng.pick(TT.CARGO), sum = 0;
        for (i = 0; i < needs.length; i++) {
          cars.push(carOf({ type: 'number', value: needs[i], showDots: age <= 4 && needs[i] <= DOTS_MAX }, 'number', needs[i], { need: needs[i] }));
          sum += needs[i];
        }
        var extra = sum <= 3 ? COUNT_EXTRA_SMALL : COUNT_EXTRA, n = Math.min(MAX_ITEMS, sum + extra);
        for (i = 0; i < n; i++) add(null, iCargo(cargo));
        if (needs.length === 1) params = { n: needs[0], cargo: cargo };
        else { promptKey = 'p.count2'; params = { a: needs[0], b: needs[1], cargo: cargo }; }
        break;
      }
    }
    cars.forEach(function (c, ci) { c.id = 'k' + ci; });
    rng.shuffle(items);
    items.forEach(function (it, ii) { it.id = 'i' + ii; });
    var r = { topic: topic, age: age, lang: lang, roundIndex: ri, mode: mode, promptKey: promptKey, params: params, surprise: null,
      cars: cars, items: items, short: !!short && mode === 'sort', maxCars: capCars || 0, warm3: !!warm3 && mode === 'sort' };
    r.key = roundKey(r);
    return r;
  }

  // ---------------- self-check ----------------
  /** Does the cargo `it` belong in `car`? Re-derived from the label and the item fields only (sort rounds). */
  function fits(car, it, lang) {
    var L = car && car.label;
    if (!L || !it) return false;
    switch (L.type) {
      case 'color': return it.kind === 'block' && it.color === L.value && L.color === L.value;
      case 'shape': return it.kind === 'shape' && it.shape === L.value;
      case 'size': return it.kind === 'size' && it.size === L.value && it.color === L.color && it.scale === (L.value === 'big' ? 1 : SMALL_SCALE);
      case 'home': return it.kind === 'sprite' && !!it.animal && HOME_OF[it.animal] === L.value;
      case 'letter':
        if (it.kind === 'letter') return it.text === L.value || (it.text === String(L.value).toLowerCase() && it.text !== L.value && LOWER_SKIP.indexOf(L.value) < 0);
        if (it.kind === 'sprite' && it.animal) { var w = WORD_OF[langOf(lang)][it.animal]; return !!w && w.initial === L.value; }
        return false;
      case 'text': return it.kind === 'number' && it.n === evalText(L.value) && it.n >= 0 && it.text === String(it.n) &&
        (L.op === '+' ? L.a + L.b : L.a - L.b) === it.n;
      case 'parity': return it.kind === 'number' && typeof it.n === 'number' && parityOf(it.n) === L.value;
      case 'number': return it.kind === 'sprite' && !!it.cargo;
    }
    return false;
  }

  /** null when the round is completable and follows every rule (DESIGN §5.1), else the reason. */
  function validate(r) {
    if (!r || !r.cars || !r.items) return 'no cars / items';
    var k = r.cars.length, n = r.items.length, i, j;
    if (k !== carsFor(r.topic, r.age, r.roundIndex, r.maxCars)) return k + ' cars, want ' + carsFor(r.topic, r.age, r.roundIndex, r.maxCars);
    if (k < 1 || k > MAX_CARS) return k + ' cars';
    if (n < 1 || n > MAX_ITEMS) return n + ' items';
    var ids = {}, labels = {}, cs = [];
    for (i = 0; i < k; i++) {
      var c = r.cars[i];
      if (!c.id || ids[c.id]) return 'car id';
      ids[c.id] = 1;
      if (!c.label || c.label.value === undefined || c.label.value === null || !c.nameKind || c.nameValue === undefined) return 'car without label / name';
      var lk = labelKey(c).replace(/\|\d*$/, '');
      if (labels[lk] && r.mode !== 'count') return 'two cars with label ' + lk;
      labels[lk] = 1;
      if (c.label.color) { if (!TT.PALETTE[c.label.color]) return 'bad colour'; cs.push(c.label.color); }
    }
    for (i = 0; i < n; i++) {
      var it = r.items[i];
      if (!it.id || ids[it.id]) return 'item id';
      ids[it.id] = 1;
      if (['block', 'shape', 'size', 'sprite', 'letter', 'number'].indexOf(it.kind) < 0) return 'item kind ' + it.kind;
      if (!it.nameKind || it.nameValue === undefined || !(it.scale > 0)) return 'item without name / scale';
      if (it.color) { if (!TT.PALETTE[it.color]) return 'bad item colour'; if (it.kind === 'block' || it.kind === 'shape' || it.kind === 'size') cs.push(it.color); }
      if (it.animal && TT.ANIMALS.indexOf(it.animal) < 0) return 'bad animal';
      if (it.kind === 'block' && TT.TOYS.indexOf(it.toy) < 0) return 'bad toy';
    }
    if (r.age < COLOR_SAFE_BELOW && cs.length) {
      var uniq = cs.filter(function (x, q) { return cs.indexOf(x) === q; });
      if (clash(uniq) || uniq.indexOf('pink') >= 0) return 'colour clash in ' + uniq.join('+');
    }
    if (r.mode === 'count') {
      var sum = 0, cargo = null;
      for (i = 0; i < k; i++) {
        var nd = r.cars[i].need;
        if (!(nd >= 1 && nd <= MAX_NEED) || r.cars[i].label.type !== 'number' || r.cars[i].label.value !== nd || r.cars[i].nameValue !== nd) return 'count car need';
        if (r.cars[i].label.showDots && nd > DOTS_MAX) return 'dots above ' + DOTS_MAX;
        sum += nd;
      }
      if (k === 2 && r.cars[0].need === r.cars[1].need) return 'two cars with the same N';
      if (sum > COUNT_SUM_MAX[r.age]) return 'ΣN ' + sum + ' > ' + COUNT_SUM_MAX[r.age];
      if (r.roundIndex === 0 && (k !== 1 || sum > 2)) return 'count warm-up';
      if (r.roundIndex === 1 && (k !== 1 || sum < 2 || sum > 4)) return 'count round 1';
      for (i = 0; i < n; i++) {
        var q = r.items[i];
        if (q.answer !== null || q.kind !== 'sprite' || !q.cargo) return 'count item';
        if (cargo && q.cargo !== cargo) return 'two cargo kinds';
        cargo = q.cargo;
        for (j = 0; j < k; j++) if (!fits(r.cars[j], q, r.lang)) return 'count item does not fit';
      }
      if (n < sum + (sum <= 3 ? COUNT_EXTRA_SMALL : COUNT_EXTRA) && n < MAX_ITEMS) return 'not enough spare cargo';
      if (n < sum) return 'not enough cargo';
      var pp = r.params || {};
      if (k === 1 ? (r.promptKey !== 'p.count' || pp.n !== sum) : (r.promptKey !== 'p.count2' || pp.a !== r.cars[0].need || pp.b !== r.cars[1].need)) return 'count prompt';
      if (pp.cargo !== cargo) return 'count prompt cargo';
      return null;
    }
    // sort: every item has exactly one right car, every car gets ≥ 1 item, round 0 = 1 item per car
    var cnt = {};
    for (i = 0; i < n; i++) {
      var s = r.items[i], hits = 0, hit = null;
      for (j = 0; j < k; j++) if (fits(r.cars[j], s, r.lang)) { hits++; hit = r.cars[j].id; }
      if (hits !== 1) return 'item ' + itemKey(s) + ' fits ' + hits + ' cars';
      if (s.answer !== hit) return 'item answer ≠ its car';
      cnt[hit] = (cnt[hit] || 0) + 1;
    }
    for (j = 0; j < k; j++) {
      var m = cnt[r.cars[j].id] || 0;
      if (m < 1) return 'car ' + r.cars[j].id + ' gets no cargo';
      if (m > (r.roundIndex === 0 && !r.warm3 ? 1 : PER_CAR_MAX)) return 'car ' + r.cars[j].id + ' gets ' + m;
    }
    if (n > ITEM_CAP[r.age]) return n + ' items > ' + ITEM_CAP[r.age];
    if (r.topic === 'size' && (r.cars[0].label.color !== r.cars[1].label.color || r.cars[0].label.value === r.cars[1].label.value)) return 'size cars';
    if (r.topic === 'shapes' && r.age <= 4) for (i = 0; i < n; i++) if (r.items[i].color !== carById(r, r.items[i].answer).label.color) return 'shape colour ≠ its sign below age 5';
    if (r.topic === 'lower') for (i = 0; i < n; i++) if (r.items[i].text === 'l' || r.items[i].text === 'i') return 'lower-case i / l';
    if (r.promptKey !== 'p.' + r.topic) return 'prompt key';
    return null;
  }

  // ---------------- Talk time ----------------
  /* talk = { topic, promptKey:'talk.<topic>', params, show: an item (or null), choices:[ item + {id} ], answerId }
   * Choice / show kinds: block, shape, size, sprite (animal_* / home_* / cargo_*), letter, number, text ('2 + 3'), parity, dots. */
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
  function iHome(h) { return { kind: 'sprite', sprite: 'home_' + h, home: h, scale: 1, nameKind: 'home', nameValue: h }; }
  function iText(t, nk) { return { kind: 'text', text: t, scale: 1, nameKind: nk, nameValue: t }; }

  function makeTalk(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new TT.RNG(1);
    var show = null, params = {}, ch, a, k;
    switch (topic) {
      case 'colors': {
        var set = colourSet(rng, age, 3), toy = rng.pick(TT.TOYS); a = set[0]; params = { color: a };
        show = iBlock(a, rng.pick(TT.TOYS.filter(function (x) { return x !== toy; })));   // "What colour is this?" shows a toy
        ch = choicesFrom(rng, a, set, 3, function (c) { return iBlock(c, toy); }); break;
      }
      case 'shapes': {
        var sp = shapesFor(age), col = rng.pick(COLORS); a = rng.pick(sp); params = { shape: a }; show = iShape(a, col);
        ch = choicesFrom(rng, a, sp, 3, function (s) { return iShape(s, col); }); break;
      }
      case 'size': {
        a = rng.pick(['big', 'small']); var c2 = rng.pick(COLORS);
        params = { size: a, color: c2 };
        ch = choicesFrom(rng, a, ['big', 'small'], 2, function (s) { return iSize(s, c2); });
        break;
      }
      case 'homes': {
        var an = rng.pick(TT.ANIMALS); a = HOME_OF[an]; params = { animal: an, home: a }; show = iAnimal(an, lang);
        ch = choicesFrom(rng, a, HOME_LIST, 3, iHome); break;
      }
      case 'count': {
        var rr = { 3: [1, 4], 4: [1, 5], 5: [2, 8], 6: [3, 10], 7: [3, 10] }[age], cg = rng.pick(TT.CARGO);
        a = rng.int(rr[0], rr[1]); params = { n: a, cargo: cg };
        show = { kind: 'dots', n: a, cargo: cg, sprite: 'cargo_' + cg, scale: 1, nameKind: 'number', nameValue: a };
        ch = choicesFrom(rng, a, nearNumbers(a, 1, Math.max(rr[1], a + 2)), 3, function (x) { return iNumber(x, null); }); break;
      }
      case 'letters':
      case 'lower': {
        var P = letterPool(lang, topic); a = rng.pick(P); params = { letter: a };
        show = iLetter(topic === 'lower' ? a.toLowerCase() : a, null);
        ch = choicesFrom(rng, a, P, 3, function (x) { return iLetter(x, null); }); break;
      }
      case 'initial': {
        var w0 = rng.pick(TT.WORDS[lang]); a = w0.initial;
        show = iAnimal(w0.animal, lang); params = { word: w0.word, animal: w0.animal, letter: a };
        var lp = LETTER_POOL[lang].split('').concat(initialsOf(lang).filter(function (x) { return LETTER_POOL[lang].indexOf(x) < 0; }));
        ch = choicesFrom(rng, a, lp, 3, function (x) { return iLetter(x, null); }); break;
      }
      case 'add': {
        var hi = ADD_MAX[age] || 10; a = rng.int(age >= 7 ? 4 : 2, hi); k = rng.int(1, a - 1);
        var t1 = k + ' + ' + (a - k); show = iText(t1, 'sum'); params = { a: k, b: a - k, text: t1 };
        ch = choicesFrom(rng, a, nearNumbers(a, 0, hi + 2), 3, function (x) { return iNumber(x, null); }); break;
      }
      case 'sub': {
        a = rng.int(0, 9); k = rng.int(1, 10 - a);
        var t2 = (a + k) + ' ' + MINUS + ' ' + k; show = iText(t2, 'diff'); params = { a: a + k, b: k, text: t2 };
        ch = choicesFrom(rng, a, nearNumbers(a, 0, 10), 3, function (x) { return iNumber(x, null); }); break;
      }
      case 'oddeven': {
        var nn = rng.int(1, 20); a = parityOf(nn); params = { n: nn };
        show = iNumber(nn, null);
        ch = choicesFrom(rng, a, ['odd', 'even'], 2, function (x) { return { kind: 'parity', value: x, scale: 1, nameKind: 'parity', nameValue: x }; }); break;
      }
      default: throw new Error('TT.Content: unknown topic ' + topic);
    }
    return { topic: topic, promptKey: 'talk.' + topic, params: params, show: show, choices: ch.choices, answerId: ch.answerId };
  }

  /** 4 chapter topics for a session, easiest first. Without rng or without `last`: TT.AGE_TOPICS (the first session).
   * With both: chapter 1 = the easiest pool topic that was not chapter 1 last time; chapters 2–4 = 3 of the others
   * (preferring topics left out of `last`), in pool (difficulty) order. */
  function topicsFor(age, rng, last) {
    age = ageOf(age);
    last = Array.isArray(last) ? last : [];
    if (!rng || !last.length) return TT.AGE_TOPICS[age].slice();
    var pool = TT.AGE_POOLS[age].slice(), ord = function (a, b) { return pool.indexOf(a) - pool.indexOf(b); };
    // the topic left out last time opens this session (playtest P2-6: chapter 1 alternated between two topics)
    var unused = pool.filter(function (t) { return last.indexOf(t) < 0; });
    var first = unused.length ? unused[0] : pool[0];
    if (!unused.length) for (var i = 0; i < pool.length; i++) if (pool[i] !== last[0]) { first = pool[i]; break; }
    var rest = pool.filter(function (t) { return t !== first; });
    var fresh = rng.shuffle(rest.filter(function (t) { return last.indexOf(t) < 0; }));
    var old = rng.shuffle(rest.filter(function (t) { return last.indexOf(t) >= 0; }));
    var pick = fresh.concat(old).slice(0, 3).sort(ord);
    return [first].concat(pick);
  }

  TT.Content = {
    makeRound: makeRound, makeTalk: makeTalk, validate: validate, fits: fits, itemKey: itemKey, roundKey: roundKey,
    topicsFor: topicsFor, carsFor: carsFor, modeFor: modeFor, maxCars: maxCars, ageOf: ageOf, clash: clash, safeSetsOf: safeSetsOf,
    shapesFor: shapesFor, initialsOf: initialsOf, parityOf: parityOf, evalText: evalText, letterPool: letterPool, homeOf: function (a) { return HOME_OF[a] || null; },
    TOPICS: ALL_TOPICS, COLORS: COLORS, COLORS5: COLORS5, SHAPES: TT.SHAPES, SHAPES4: SHAPES4, HOME_LIST: HOME_LIST,
    ITEM_CAP: ITEM_CAP, PER_CAR_MAX: PER_CAR_MAX, COUNT_SUM_MAX: COUNT_SUM_MAX, MAX_NEED: MAX_NEED, MAX_ITEMS: MAX_ITEMS, MAX_CARS: MAX_CARS,
    DOTS_MAX: DOTS_MAX, SMALL_SCALE: SMALL_SCALE, LETTER_POOL: LETTER_POOL, CLASH: CLASH, COLOR_SAFE_BELOW: COLOR_SAFE_BELOW, MINUS: MINUS
  };
})(window.TT = window.TT || {});
