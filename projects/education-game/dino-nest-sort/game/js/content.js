/* Dino Nest Sort — DN.PALETTE, DN.AGE_TOPICS, DN.WORDS, DN.Content (pure + deterministic)
 *
 *   DN.Content.makeRound(topic, { age, lang, rng, roundIndex, layout }) → round   (DESIGN §5.1)
 *   DN.Content.makeTalk(topic,  { age, lang, rng })                     → talk
 *   DN.Content.validate(round)  → null | 'error text'   (self-check: every round completable)
 *   DN.Content.topicsFor(age)   → the 4 chapter topics for an age (age ≥ 7 uses 7, < 3 uses 3)
 *
 * Content only emits kinds / values / keys (no text): DN.I18N turns them into words.
 * Positions: baskets get x,y,w,h from layout.nest when a layout is given; item
 * rest positions (homeX/homeY) are packed by DN.World (it owns the play rect and
 * shrinks items down to 0.75× if needed).
 *
 * Warm-up rule (small deviation, see MECHANICS.md): roundIndex 0 of every chapter
 * uses 1 item per nest for the sort topics (colors, shapes, homes, letters, lower,
 * initial, add, sub) and 2 per nest for oddeven, so the first round of each chapter
 * (and the first chapter at age 4) is trivially easy.
 */
(function (DN) {
  'use strict';

  DN.PALETTE = {
    red:    { fill: '#E84A4A', dark: '#A8282E' },
    blue:   { fill: '#3C8DE8', dark: '#1F5BA8' },
    yellow: { fill: '#FFD23F', dark: '#C99A12' },
    green:  { fill: '#4CC26B', dark: '#2A8343' },
    orange: { fill: '#FF9A2E', dark: '#C4650C' },
    purple: { fill: '#9B6BE0', dark: '#6840A8' },
    cream:  { fill: '#FFF4DC', dark: '#C9A877' }
  };
  var COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple'];

  DN.AGE_TOPICS = {
    3: ['colors', 'shapes', 'size', 'homes'],
    4: ['colors', 'shapes', 'count', 'homes'],
    5: ['shapes', 'count', 'letters', 'homes'],
    6: ['lower', 'initial', 'add', 'count'],
    7: ['add', 'sub', 'initial', 'oddeven']
  };
  var ALL_TOPICS = ['colors', 'shapes', 'size', 'homes', 'count', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];

  function W(word, sprite, initial) { return { word: word, sprite: sprite, initial: initial }; }
  DN.WORDS = {
    en: [W('apple', 'fruit_apple', 'A'), W('bear', 'animal_bear', 'B'), W('bat', 'animal_bat', 'B'), W('bird', 'animal_bird', 'B'),
      W('banana', 'fruit_banana', 'B'), W('cat', 'animal_cat', 'C'), W('cow', 'animal_cow', 'C'), W('duck', 'animal_duck', 'D'),
      W('fish', 'animal_fish', 'F'), W('frog', 'animal_frog', 'F'), W('hen', 'animal_hen', 'H'), W('owl', 'animal_owl', 'O'),
      W('orange', 'fruit_orange', 'O'), W('rabbit', 'animal_rabbit', 'R'), W('sheep', 'animal_sheep', 'S'),
      W('squirrel', 'animal_squirrel', 'S'), W('strawberry', 'fruit_strawberry', 'S')],
    vi: [W('bò', 'animal_cow', 'B'), W('cá', 'animal_fish', 'C'), W('cú', 'animal_owl', 'C'), W('cừu', 'animal_sheep', 'C'),
      W('cam', 'fruit_orange', 'C'), W('dơi', 'animal_bat', 'D'), W('dâu', 'fruit_strawberry', 'D'), W('gấu', 'animal_bear', 'G'),
      W('gà', 'animal_hen', 'G'), W('mèo', 'animal_cat', 'M'), W('sóc', 'animal_squirrel', 'S'), W('táo', 'fruit_apple', 'T'),
      W('vịt', 'animal_duck', 'V'), W('ếch', 'animal_frog', 'Ê')]
  };

  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart'];
  var HOMES = { pond: ['fish', 'frog', 'duck'], tree: ['bird', 'owl', 'squirrel'], field: ['rabbit', 'cow', 'sheep', 'hen'], cave: ['bat', 'bear'] };
  var HOME_IDS = ['pond', 'tree', 'field', 'cave'];
  var FRUITS = ['apple', 'banana', 'strawberry', 'orange'];
  var LETTER_POOL = { en: 'ABCDEFGHIKLMNOPRSTUW', vi: 'ABCDEGHIKLMNOPSTUVXY' };
  var MINUS = '−';
  // base drawn sizes (px, logical) before the world's fit-shrink; eggs are drawn 100–130 (DESIGN §4.1)
  var SIZE = { egg: 116, animal: 112, fruit: 100, shape: 106 };
  var SIZE_SCALE = { big: 1.3, small: 0.72 };
  var COUNT_RANGE = { 3: [1, 5], 4: [1, 5], 5: [1, 10], 6: [1, 12], 7: [1, 12] };

  function ageOf(a) { a = Math.round(+a || 4); return a < 3 ? 3 : a > 7 ? 7 : a; }
  function langOf(l) { return l === 'vi' ? 'vi' : 'en'; }
  function pool(lang) { return LETTER_POOL[langOf(lang)].split(''); }

  function item(o) {
    return { id: null, sprite: o.sprite || null, shape: o.shape || null, color: o.color || null, text: o.text === undefined ? null : o.text,
      scale: o.scale || 1, size: o.size, nameKind: o.nameKind, nameValue: o.nameValue, answer: o.answer };
  }
  function egg(color, scale, answer, nameKind, nameValue) {
    return item({ sprite: 'egg_' + color, color: color, scale: scale, size: SIZE.egg * scale, nameKind: nameKind, nameValue: nameValue, answer: answer });
  }
  function plainEgg(text, answer, nameKind, nameValue) {
    return item({ sprite: 'egg_plain', color: 'cream', text: text, size: SIZE.egg, nameKind: nameKind, nameValue: nameValue, answer: answer });
  }

  // nests per age for the n-nest sort topics
  function nestsFor(topic, age) {
    if (topic === 'colors' || topic === 'shapes' || topic === 'homes') return age <= 3 ? 2 : age === 4 ? 3 : 4;
    if (topic === 'size' || topic === 'oddeven') return 2;
    if (topic === 'count') return 1;
    return 3;
  }

  function makeRound(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new DN.RNG(1), ri = o.roundIndex || 0;
    var warm = ri === 0, per = warm ? 1 : 2;
    var n = nestsFor(topic, age), labels = [], items = [], mode = 'sort', params = {}, need = null, i, j, k;
    var add = function (it) { items.push(it); };

    switch (topic) {
      case 'colors': {
        var cs = rng.sample(COLORS, n);
        for (i = 0; i < n; i++) {
          labels.push({ type: 'color', value: cs[i] });
          for (j = 0; j < per; j++) add(egg(cs[i], 1, i, 'color', cs[i]));
        }
        break;
      }
      case 'shapes': {
        var shapePool = age >= 5 ? SHAPES.concat(['rectangle']) : SHAPES;
        var ss = rng.sample(shapePool, n), shapeCol = rng.sample(COLORS, n);
        for (i = 0; i < n; i++) {
          labels.push({ type: 'shape', value: ss[i] });
          var used = [];
          for (j = 0; j < per; j++) {
            var col = shapeCol[i];
            if (age >= 5) {             // colours mixed: only the shape matters; the 2 in a nest differ
              do { col = rng.pick(COLORS); } while (used.indexOf(col) >= 0);
              used.push(col);
            }
            add(item({ sprite: null, shape: ss[i], color: col, size: SIZE.shape, nameKind: 'shape', nameValue: ss[i], answer: i }));
          }
        }
        break;
      }
      case 'size': {
        var c = rng.pick(COLORS), order = rng.shuffle(['big', 'small']);
        for (i = 0; i < 2; i++) {
          labels.push({ type: 'size', value: order[i] });
          for (j = 0; j < 2; j++) add(egg(c, SIZE_SCALE[order[i]], i, 'size', order[i]));
        }
        break;
      }
      case 'homes': {
        var hs = rng.sample(HOME_IDS, n);
        for (i = 0; i < n; i++) {
          labels.push({ type: 'home', value: hs[i] });
          var an = rng.sample(HOMES[hs[i]], per);
          for (j = 0; j < an.length; j++) add(item({ sprite: 'animal_' + an[j], size: SIZE.animal, nameKind: 'animal', nameValue: an[j], answer: i }));
        }
        break;
      }
      case 'count': {
        mode = 'count';
        var r = COUNT_RANGE[age];
        var N = warm ? rng.int(1, Math.min(3, r[1])) : rng.int(Math.min(2, r[1]), r[1]);
        var fruit = rng.pick(FRUITS), extra = N <= 3 ? 3 : 2;
        params = { n: N, fruit: fruit }; need = N;
        labels.push({ type: 'number', value: N });
        for (i = 0; i < N + extra; i++) add(item({ sprite: 'fruit_' + fruit, size: SIZE.fruit, nameKind: 'fruit', nameValue: fruit, answer: 0 }));
        break;
      }
      case 'letters':
      case 'lower': {
        var ls = rng.sample(pool(lang), 3);
        for (i = 0; i < 3; i++) {
          labels.push({ type: 'letter', value: ls[i] });
          var t = topic === 'lower' ? ls[i].toLowerCase() : ls[i];
          for (j = 0; j < per; j++) add(plainEgg(t, i, 'letter', t));
        }
        break;
      }
      case 'initial': {
        var words = DN.WORDS[lang], byInit = {}, inits = [];
        for (i = 0; i < words.length; i++) {
          var w0 = words[i];
          if (!byInit[w0.initial]) { byInit[w0.initial] = []; inits.push(w0.initial); }
          byInit[w0.initial].push(w0);
        }
        var chosen = rng.sample(inits, 3);
        for (i = 0; i < 3; i++) {
          labels.push({ type: 'letter', value: chosen[i] });
          var cnt = Math.min(byInit[chosen[i]].length, warm ? 1 : rng.int(1, 2));
          var ws = rng.sample(byInit[chosen[i]], cnt);
          for (j = 0; j < ws.length; j++) add(item({ sprite: ws[j].sprite, size: ws[j].sprite.indexOf('fruit_') === 0 ? SIZE.fruit : SIZE.animal,
            nameKind: 'word', nameValue: ws[j].word, answer: i }));
        }
        break;
      }
      case 'add':
      case 'sub': {
        var answers = [], isAdd = topic === 'add';
        var lo = isAdd ? (age >= 7 ? 4 : 2) : 0, hi = isAdd ? (age >= 7 ? 20 : 10) : 9;
        while (answers.length < 3) { k = rng.int(lo, hi); if (answers.indexOf(k) < 0) answers.push(k); }
        for (i = 0; i < 3; i++) {
          labels.push({ type: 'number', value: answers[i] });
          var exprs = [], s = answers[i], tries = 0;
          while (exprs.length < per && tries++ < 50) {
            var e;
            if (isAdd) { var a = rng.int(1, s - 1); e = a + '+' + (s - a); }
            else { var b = rng.int(1, 10 - s); e = (s + b) + MINUS + b; }
            if (exprs.indexOf(e) < 0) exprs.push(e);
          }
          for (j = 0; j < exprs.length; j++) add(plainEgg(exprs[j], i, isAdd ? 'sum' : 'diff', exprs[j]));
        }
        break;
      }
      case 'oddeven': {
        var cntP = warm ? 2 : 3, nums = rng.shuffle(range(1, 20));
        var par = rng.shuffle(['odd', 'even']);
        for (i = 0; i < 2; i++) {
          labels.push({ type: 'parity', value: par[i] });
          var want = par[i] === 'odd' ? 1 : 0, got = 0;
          for (j = 0; j < nums.length && got < cntP; j++) {
            if (nums[j] % 2 === want) { add(plainEgg(String(nums[j]), i, 'number', nums[j])); got++; nums[j] = -1; }
          }
        }
        break;
      }
      default: throw new Error('DN.Content: unknown topic ' + topic);
    }

    var baskets = [];
    for (i = 0; i < labels.length; i++) {
      var bk = { id: 'b' + i, label: labels[i], x: 0, y: 0, w: 0, h: 0 };
      if (need !== null) bk.need = need;
      baskets.push(bk);
    }
    if (o.layout && o.layout.nest) placeBaskets(baskets, o.layout);
    // shuffle item order (so the same answers don't sit together), then give ids
    rng.shuffle(items);
    for (i = 0; i < items.length; i++) { items[i].id = 'i' + i; items[i].answer = 'b' + items[i].answer; }

    var round = { topic: topic, mode: mode, promptKey: 'p.' + topic, params: params, baskets: baskets, items: items,
      seed: (rng.next() * 4294967296) >>> 0 };
    var err = validate(round);
    if (err) throw new Error('DN.Content: invalid round (' + topic + '): ' + err);
    return round;
  }

  function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }

  /** Puts basket i at layout.nest.xs[i] (layout must have been made for this many nests). */
  function placeBaskets(baskets, layout) {
    var ne = layout.nest, xs = ne.xs && ne.xs.length === baskets.length ? ne.xs : nestXs(layout, baskets.length);
    for (var i = 0; i < baskets.length; i++) { baskets[i].x = xs[i]; baskets[i].y = ne.y; baskets[i].w = ne.w; baskets[i].h = ne.h; }
  }
  function nestXs(layout, n) {
    var l = layout.ins.left, aw = layout.W - l - layout.ins.right - 40, sp = aw / n, xs = [];
    for (var i = 0; i < n; i++) xs.push(l + 20 + sp * (i + 0.5));
    return xs;
  }

  /** null when the round is valid and completable, else a reason. */
  function validate(r) {
    if (!r || !r.baskets || !r.baskets.length) return 'no baskets';
    if (!r.items || !r.items.length) return 'no items';
    var ids = {}, perB = {}, i;
    for (i = 0; i < r.baskets.length; i++) { ids[r.baskets[i].id] = r.baskets[i]; perB[r.baskets[i].id] = 0; }
    var itemIds = {};
    for (i = 0; i < r.items.length; i++) {
      var it = r.items[i];
      if (itemIds[it.id]) return 'duplicate item id';
      itemIds[it.id] = 1;
      if (!ids[it.answer]) return 'item ' + it.id + ' has no nest';
      if (!(it.size > 0)) return 'bad size';
      if (it.nameKind === undefined || it.nameValue === undefined) return 'no name';
      if (!it.sprite && !it.shape) return 'nothing to draw';
      perB[it.answer]++;
    }
    var labs = {};
    for (i = 0; i < r.baskets.length; i++) {
      var b = r.baskets[i], key = b.label.type + ':' + b.label.value;
      if (labs[key]) return 'duplicate label ' + key;
      labs[key] = 1;
    }
    if (r.mode === 'count') {
      if (r.baskets.length !== 1) return 'count needs 1 nest';
      var need = r.baskets[0].need;
      if (!(need >= 1)) return 'bad need';
      if (r.items.length < need + 2) return 'not enough fruit';
    } else {
      for (var k in perB) if (perB[k] < 1) return 'empty nest ' + k;
      // every item's label must truly match it (catches generator bugs)
      for (i = 0; i < r.items.length; i++) if (!matches(r.items[i], ids[r.items[i].answer].label)) return 'mismatch ' + r.items[i].id;
    }
    return null;
  }

  var WORD_INIT = {};
  (function () { for (var l in DN.WORDS) { WORD_INIT[l] = {}; DN.WORDS[l].forEach(function (w) { WORD_INIT[l][w.word] = w.initial; }); } })();
  function evalExpr(t) {
    var m = /^(\d+)([+−])(\d+)$/.exec(t); if (!m) return NaN;
    return m[2] === '+' ? +m[1] + +m[3] : +m[1] - +m[3];
  }
  function homeOf(animal) { for (var h in HOMES) if (HOMES[h].indexOf(animal) >= 0) return h; return null; }
  function matches(it, label) {
    switch (label.type) {
      case 'color': return it.color === label.value;
      case 'shape': return it.shape === label.value;
      case 'size': return it.nameValue === label.value && Math.abs(it.scale - SIZE_SCALE[label.value]) < 1e-9;
      case 'home': return homeOf(it.nameValue) === label.value;
      case 'letter':
        if (it.nameKind === 'word') return WORD_INIT.en[it.nameValue] === label.value || WORD_INIT.vi[it.nameValue] === label.value;
        return String(it.text).toUpperCase() === label.value;
      case 'number': return evalExpr(it.text) === label.value;
      case 'parity': return (it.nameValue % 2 === 1) === (label.value === 'odd');
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
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new DN.RNG(1);
    var show = { sprite: null, shape: null, color: null, text: null, count: 1, scale: 1 }, ch, a, k;
    switch (topic) {
      case 'colors':
        a = rng.pick(COLORS); show.sprite = 'egg_' + a; show.color = a;
        ch = choicesFrom(rng, 'color', a, COLORS, 3); break;
      case 'shapes': {
        var sp = age >= 5 ? SHAPES.concat(['rectangle']) : SHAPES;
        a = rng.pick(sp); show.shape = a; show.color = rng.pick(COLORS);
        ch = choicesFrom(rng, 'shape', a, sp, 3); break;
      }
      case 'size': {
        var c = rng.pick(COLORS); a = rng.pick(['big', 'small']);
        show.sprite = 'egg_' + c; show.color = c; show.scale = SIZE_SCALE[a];
        ch = choicesFrom(rng, 'size', a, ['big', 'small'], 2); break;
      }
      case 'homes': {
        var h = rng.pick(HOME_IDS), an = rng.pick(HOMES[h]); show.sprite = 'animal_' + an; a = h;
        ch = choicesFrom(rng, 'home', h, HOME_IDS, 3); break;
      }
      case 'count': {
        var r = { 3: [1, 5], 4: [1, 5], 5: [2, 10], 6: [3, 12], 7: [3, 12] }[age];
        a = rng.int(r[0], r[1]); show.sprite = 'fruit_' + rng.pick(FRUITS); show.count = a;
        ch = choicesFrom(rng, 'number', a, numberDistractors(a, 1, Math.max(r[1], a + 2)), 3); break;
      }
      case 'letters':
      case 'lower': {
        var P = pool(lang); a = rng.pick(P);
        show.sprite = 'egg_plain'; show.color = 'cream'; show.text = topic === 'lower' ? a.toLowerCase() : a;
        ch = choicesFrom(rng, 'letter', a, P, 3); break;
      }
      case 'initial': {
        var words = DN.WORDS[lang], w0 = rng.pick(words), inits = [];
        words.forEach(function (w) { if (inits.indexOf(w.initial) < 0) inits.push(w.initial); });
        show.sprite = w0.sprite; a = w0.initial;
        ch = choicesFrom(rng, 'letter', a, inits, 3); break;
      }
      case 'add': {
        var hi = age >= 7 ? 20 : 10; a = rng.int(age >= 7 ? 4 : 2, hi); k = rng.int(1, a - 1);
        show.sprite = 'egg_plain'; show.color = 'cream'; show.text = k + '+' + (a - k);
        ch = choicesFrom(rng, 'number', a, numberDistractors(a, 0, hi + 2), 3); break;
      }
      case 'sub': {
        a = rng.int(0, 9); k = rng.int(1, 10 - a);
        show.sprite = 'egg_plain'; show.color = 'cream'; show.text = (a + k) + MINUS + k;
        ch = choicesFrom(rng, 'number', a, numberDistractors(a, 0, 10), 3); break;
      }
      case 'oddeven': {
        var nn = rng.int(1, 20); a = nn % 2 ? 'odd' : 'even';
        show.sprite = 'egg_plain'; show.color = 'cream'; show.text = String(nn);
        ch = choicesFrom(rng, 'parity', a, ['odd', 'even'], 2); break;
      }
      default: throw new Error('DN.Content: unknown topic ' + topic);
    }
    return { topic: topic, promptKey: 'talk.' + topic, params: {}, show: show, choices: ch.choices, answerId: ch.answerId };
  }

  DN.Content = {
    makeRound: makeRound, makeTalk: makeTalk, validate: validate, matches: matches, placeBaskets: placeBaskets,
    topicsFor: function (age) { return DN.AGE_TOPICS[ageOf(age)].slice(); },
    nestsFor: function (topic, age) { return nestsFor(topic, ageOf(age)); },
    TOPICS: ALL_TOPICS, COLORS: COLORS, SHAPES: SHAPES.concat(['rectangle']), HOMES: HOMES, FRUITS: FRUITS,
    LETTER_POOL: LETTER_POOL, SIZE: SIZE, SIZE_SCALE: SIZE_SCALE, ageOf: ageOf
  };
})(window.DN = window.DN || {});
