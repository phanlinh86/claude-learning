/* Owlet's Snow Garden — SG.PALETTE, SG.ANIMALS, SG.AGE_TOPICS, SG.WORDS, SG.Content (pure + deterministic)
 *
 *   SG.Content.makeRound(topic, { age, lang, rng, roundIndex, layout }) → round   (DESIGN §5.1)
 *   SG.Content.makeTalk(topic,  { age, lang, rng })                     → talk
 *   SG.Content.validate(round)  → null | 'error text'   (self-check: every round completable)
 *   SG.Content.topicsFor(age)   → the 4 chapter topics for an age (age ≥ 7 uses 7, < 3 uses 3)
 *   SG.Content.potsFor(topic, age) → number of pots (count → 1 planter)
 *   SG.Content.placeBaskets(baskets, layout) → x, y, w, h, top, bottom for pots (layout.pot) / the planter
 *
 * Content only emits kinds / values / keys (no text): SG.I18N turns them into words.
 * Every item carries `flower` (a palette key): the colour of the flower it grows into.
 *
 * Warm-up rule (see MECHANICS.md): roundIndex 0 of every chapter uses 1 seed per pot for the sort
 * topics (2 for oddeven), each pot once in an animals queue; count warm-up N is 1–3 (2–4 from age 6).
 */
(function (SG) {
  'use strict';

  SG.PALETTE = {
    red:    { fill: '#E84A4A', dark: '#A8282E' },
    blue:   { fill: '#3C8DE8', dark: '#1F5BA8' },
    yellow: { fill: '#FFD23F', dark: '#C99A12' },
    green:  { fill: '#4CC26B', dark: '#2A8343' },
    orange: { fill: '#FF9A2E', dark: '#C4650C' },
    purple: { fill: '#9B6BE0', dark: '#6840A8' },
    cream:  { fill: '#FFF4DC', dark: '#C9A877' }
  };
  var COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple'];

  SG.ANIMALS = ['bear', 'seal', 'fox', 'hare', 'reindeer', 'walrus', 'penguin', 'puffin', 'whale'];

  SG.AGE_TOPICS = {
    3: ['colors', 'size', 'shapes', 'animals'],
    4: ['colors', 'shapes', 'count', 'animals'],
    5: ['shapes', 'count', 'letters', 'animals'],
    6: ['lower', 'initial', 'add', 'count'],
    7: ['initial', 'add', 'sub', 'oddeven']
  };
  var ALL_TOPICS = ['colors', 'shapes', 'size', 'animals', 'count', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];

  function W(word, animal, initial) { return { word: word, sprite: 'animal_' + animal, initial: initial }; }
  SG.WORDS = {
    en: [W('bear', 'bear', 'B'), W('fox', 'fox', 'F'), W('hare', 'hare', 'H'), W('penguin', 'penguin', 'P'),
      W('puffin', 'puffin', 'P'), W('reindeer', 'reindeer', 'R'), W('seal', 'seal', 'S'), W('walrus', 'walrus', 'W'),
      W('whale', 'whale', 'W')],
    vi: [W('gấu', 'bear', 'G'), W('cáo', 'fox', 'C'), W('cá voi', 'whale', 'C'), // no 'chim cánh cụt'/'thỏ': VN kindergartens teach ch/th as their own sounds
       W('tuần lộc', 'reindeer', 'T'), W('hải cẩu', 'seal', 'H'), W('hải mã', 'walrus', 'H')]
  };

  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart'];
  var LETTER_POOL = { en: 'ABCDEFGHIKLMNOPRSTUW', vi: 'ABCDEGHIKLMNOPSTUVXY' };
  var MINUS = '−';
  // base drawn sizes (logical px) before the world's fit-shrink; seeds are drawn 100–130 (DESIGN §4.1)
  var SIZE = { seed: 116, seedMany: 104, animal: 112, shape: 106 };
  var SIZE_SCALE = { big: 1.3, small: 0.72 };
  var COUNT_RANGE = { 3: [1, 5], 4: [1, 5], 5: [3, 10], 6: [4, 12], 7: [4, 12] };
  // the count planter (DESIGN §2): w = min(safe width − 80, 120 + 96·N), h = min(0.42 w, 170); soil line 54/200
  var SMALL_POT = 0.72;   // size topic: the 'small' pot is 0.72 × (same x, same bottom); keep = SG.CONFIG.sizeSmallPot
  var PLANTER = { margin: 80, base: 120, perHole: 96, aspect: 0.42, maxH: 170, soilFrac: 0.27 };

  function ageOf(a) { a = Math.round(+a || 4); return a < 3 ? 3 : a > 7 ? 7 : a; }
  function langOf(l) { return l === 'vi' ? 'vi' : 'en'; }
  function pool(lang, topic) {   // lower-case l and capital I look identical in rounded fonts: no I when lower case is shown
    var P = LETTER_POOL[langOf(lang)].split('');
    return topic === 'lower' ? P.filter(function (c) { return c !== 'I'; }) : P;
  }

  // colour-blind safety (visual QA): below age 5 never blue+purple or red+green in one round
  function clash(cs) {
    return (cs.indexOf('blue') >= 0 && cs.indexOf('purple') >= 0) || (cs.indexOf('red') >= 0 && cs.indexOf('green') >= 0) ||
      (cs.indexOf('yellow') >= 0 && cs.indexOf('orange') >= 0);
  }
  // pairs a colour-blind child (or a toddler) confuses: blue/purple, red/green, yellow/orange (QA P2-6: deutan ΔE 12)
  var PAIRS = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange']];
  /** A colour set safe for `age`: below 5 one colour of every confusable pair is dropped (3 colours left).
   *  `keep` (optional) is always kept (its partner is the one dropped). */
  function safeColors(rng, age, keep) {
    if (age >= 5) return COLORS.slice();
    var drop = PAIRS.map(function (p) { return p.indexOf(keep) >= 0 ? p[1 - p.indexOf(keep)] : rng.pick(p); });
    return COLORS.filter(function (c) { return drop.indexOf(c) < 0; });
  }

  function item(o) {
    return { id: null, sprite: o.sprite || null, shape: o.shape || null, color: o.color || null, text: o.text === undefined ? null : o.text,
      scale: o.scale || 1, size: o.size, nameKind: o.nameKind, nameValue: o.nameValue, answer: o.answer,
      flower: o.flower || (o.color && o.color !== 'cream' ? o.color : null) };
  }
  function seed(color, scale, answer, nameKind, nameValue) {
    return item({ sprite: 'seed_' + color, color: color, scale: scale, size: SIZE.seed, nameKind: nameKind, nameValue: nameValue, answer: answer });   // drawn = size · scale
  }
  function plainSeed(text, answer, nameKind, nameValue, flower) {
    return item({ sprite: 'seed_plain', color: 'cream', text: text, size: SIZE.seed, nameKind: nameKind, nameValue: nameValue, answer: answer, flower: flower });
  }

  function potsFor(topic, age) {
    if (topic === 'colors' || topic === 'shapes' || topic === 'animals') return age <= 3 ? 2 : age === 4 ? 3 : 4;
    if (topic === 'size' || topic === 'oddeven') return 2;
    if (topic === 'count') return 1;
    return 3;
  }

  /** Queue of pot indices: each pot `counts[i]` times, shuffled, no pot twice in a row when avoidable. */
  function makeQueue(rng, counts) {
    var base = [], i, k, best = null;
    for (i = 0; i < counts.length; i++) for (k = 0; k < counts[i]; k++) base.push(i);
    for (var tries = 0; tries < 80; tries++) {
      var q = rng.shuffle(base.slice()), ok = true;
      for (i = 1; i < q.length; i++) if (q[i] === q[i - 1]) { ok = false; break; }
      if (ok) return q;
      if (!best) best = q;
    }
    return best;   // unreachable for counts within 1 of each other with ≥ 2 pots (kept as a safe fallback)
  }

  function makeRound(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new SG.RNG(1), ri = o.roundIndex || 0;
    var warm = ri === 0, per = warm ? 1 : 2;
    var n = potsFor(topic, age), labels = [], items = [], mode = 'sort', params = {}, need = null, queue = null, i, j, k;
    var add = function (it) { items.push(it); };
    var flowerPick = function () { return rng.pick(COLORS); };

    switch (topic) {
      case 'colors': {
        var cs = rng.sample(safeColors(rng, age), n);
        for (i = 0; i < n; i++) {
          labels.push({ type: 'color', value: cs[i] });
          for (j = 0; j < per; j++) add(seed(cs[i], 1, i, 'color', cs[i]));
        }
        break;
      }
      case 'shapes': {
        var shapePool = age >= 5 ? SHAPES.concat(['rectangle']) : SHAPES;
        var ss = rng.sample(shapePool, n), pal = safeColors(rng, age), shapeCol = rng.sample(pal, n);
        for (i = 0; i < n; i++) {
          labels.push({ type: 'shape', value: ss[i] });
          var used = [];
          for (j = 0; j < per; j++) {
            var col = shapeCol[i];
            if (age >= 5) {             // colours mixed: only the shape matters; the 2 in a pot differ
              do { col = rng.pick(COLORS); } while (used.indexOf(col) >= 0);
              used.push(col);
            }
            add(item({ sprite: null, shape: ss[i], color: col, size: SIZE.shape, nameKind: 'shape', nameValue: ss[i], answer: i }));
          }
        }
        break;
      }
      case 'size': {
        // warm-up 1 seed per pot; later 2–3 per pot (≤ 5 seeds so big seeds fit), one colour per round
        var c = rng.pick(COLORS), order = rng.shuffle(['big', 'small']), cnts = warm ? [1, 1] : rng.pick([[2, 2], [1, 3], [3, 1]]);   // QA C1: always 4
        params = { color: c };
        for (i = 0; i < 2; i++) {
          labels.push({ type: 'size', value: order[i] });
          for (j = 0; j < cnts[i]; j++) add(seed(c, SIZE_SCALE[order[i]], i, 'size', order[i]));
        }
        break;
      }
      case 'animals': {
        mode = 'ask';
        var an = rng.sample(SG.ANIMALS, n), counts = [];
        for (i = 0; i < n; i++) { labels.push({ type: 'animal', value: an[i] }); counts.push(warm ? 1 : rng.int(1, 2)); }
        queue = makeQueue(rng, counts);
        var apal = rng.shuffle(safeColors(rng, age));
        for (i = 0; i < queue.length; i++) {
          var sc = apal[i % apal.length];
          add(item({ sprite: 'seed_' + sc, color: sc, size: SIZE.seed, nameKind: 'seed', nameValue: sc, answer: null }));
        }
        params = { animal: an[queue[0]] };
        break;
      }
      case 'count': {
        mode = 'count';
        var r = COUNT_RANGE[age];
        var nlo = warm ? (age >= 6 ? 2 : 1) : Math.max(2, r[0]), nhi = warm ? (age >= 6 ? 4 : Math.min(3, r[1])) : r[1];
        var prev = o.prev || {}, nPool = range(nlo, nhi).filter(function (v) { return v !== prev.n; });
        var N = nPool.length ? rng.pick(nPool) : nlo;                                            // QA C2: never the previous N
        var cc = rng.pick(COLORS.filter(function (v) { return v !== prev.color; })), extra = N <= 3 ? 3 : 2;   // … nor its colour
        params = { n: N, color: cc }; need = N;
        labels.push({ type: 'number', value: N });
        var csz = N + extra > 10 ? SIZE.seedMany : SIZE.seed;     // 11–14 seeds: a bit smaller so they fit iPad landscape
        for (i = 0; i < N + extra; i++) add(item({ sprite: 'seed_' + cc, color: cc, size: csz, nameKind: 'seed', nameValue: cc, answer: 0 }));
        break;
      }
      case 'letters':
      case 'lower': {
        var ls = rng.sample(pool(lang, topic), 3);
        for (i = 0; i < 3; i++) {
          labels.push({ type: 'letter', value: ls[i] });
          var t = topic === 'lower' ? ls[i].toLowerCase() : ls[i];
          for (j = 0; j < per; j++) add(plainSeed(t, i, 'letter', t, flowerPick()));
        }
        break;
      }
      case 'initial': {
        var words = SG.WORDS[lang], byInit = {}, inits = [];
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
          for (j = 0; j < ws.length; j++) add(item({ sprite: ws[j].sprite, size: SIZE.animal, nameKind: 'word', nameValue: ws[j].word, answer: i, flower: flowerPick() }));
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
          for (j = 0; j < exprs.length; j++) add(plainSeed(exprs[j], i, isAdd ? 'sum' : 'diff', exprs[j], flowerPick()));
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
            if (nums[j] % 2 === want) { add(plainSeed(String(nums[j]), i, 'number', nums[j], flowerPick())); got++; nums[j] = -1; }
          }
        }
        break;
      }
      default: throw new Error('SG.Content: unknown topic ' + topic);
    }

    var baskets = [];
    for (i = 0; i < labels.length; i++) {
      var bk = { id: 'b' + i, label: labels[i], kind: mode === 'count' ? 'planter' : 'pot', x: 0, y: 0, w: 0, h: 0 };
      if (need !== null) bk.need = need;
      baskets.push(bk);
    }
    if (o.layout && (o.layout.pot || o.layout.nest)) placeBaskets(baskets, o.layout);
    // shuffle item order (so the same answers don't sit together), then give ids
    rng.shuffle(items);
    for (i = 0; i < items.length; i++) { items[i].id = 'i' + i; items[i].answer = items[i].answer === null ? null : 'b' + items[i].answer; }

    var round = { topic: topic, mode: mode, promptKey: 'p.' + topic, params: params, baskets: baskets, items: items,
      seed: (rng.next() * 4294967296) >>> 0 };
    if (queue) round.queue = queue.map(function (q) { return 'b' + q; });
    var err = validate(round);
    if (err) throw new Error('SG.Content: invalid round (' + topic + '): ' + err);
    return round;
  }

  function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }

  /** Planter geometry for `need` holes (DESIGN §2): centred in the safe area, bottom on the pot bottom line. */
  function planterRect(layout, need) {
    var ins = layout.ins, sw = layout.W - ins.left - ins.right, pot = layout.pot || layout.nest;
    var w = Math.min(sw - PLANTER.margin, PLANTER.base + need * PLANTER.perHole), h = Math.min(PLANTER.aspect * w, PLANTER.maxH, pot.h || 1e9);   // never taller than the (n = 1) pot: the seed band ends above it
    var bottom = pot.bottom !== undefined ? pot.bottom : layout.groundY + 8;
    return { x: ins.left + sw / 2, y: bottom - h + PLANTER.soilFrac * h, w: w, h: h, top: bottom - h, bottom: bottom };
  }

  /** Pots at layout.pot.xs[i] (layout made for this many pots); a planter gets planterRect. */
  function placeBaskets(baskets, layout) {
    var pot = layout.pot || layout.nest, i, b;
    if (baskets.length === 1 && baskets[0].kind === 'planter') {
      var pr = planterRect(layout, baskets[0].need || 1);
      b = baskets[0]; b.x = pr.x; b.y = pr.y; b.w = pr.w; b.h = pr.h; b.top = pr.top; b.bottom = pr.bottom;
      return;
    }
    var xs = pot.xs && pot.xs.length === baskets.length ? pot.xs : potXs(layout, baskets.length);
    for (i = 0; i < baskets.length; i++) {
      b = baskets[i];
      var k = b.label && b.label.type === 'size' && b.label.value === 'small' ? SMALL_POT : 1;   // size topic: a small pot
      b.bottom = pot.bottom !== undefined ? pot.bottom : pot.y + 0.76 * pot.h;
      b.x = xs[i]; b.w = pot.w * k; b.h = pot.h * k;
      b.top = b.bottom - b.h; b.y = b.top + 0.24 * b.h;
    }
  }
  function potXs(layout, n) {
    var l = layout.ins.left, aw = layout.W - l - layout.ins.right - 40, sp = aw / n, xs = [];
    for (var i = 0; i < n; i++) xs.push(l + 20 + sp * (i + 0.5));
    return xs;
  }

  /** null when the round is valid and completable, else a reason. */
  function validate(r) {
    if (!r || !r.baskets || !r.baskets.length) return 'no baskets';
    if (!r.items || !r.items.length) return 'no items';
    var ids = {}, perB = {}, i;
    for (i = 0; i < r.baskets.length; i++) {
      var bb = r.baskets[i];
      ids[bb.id] = bb; perB[bb.id] = 0;
      if (bb.kind !== (r.mode === 'count' ? 'planter' : 'pot')) return 'bad basket kind';
    }
    var itemIds = {};
    for (i = 0; i < r.items.length; i++) {
      var it = r.items[i];
      if (itemIds[it.id]) return 'duplicate item id';
      itemIds[it.id] = 1;
      if (r.mode === 'ask') { if (it.answer !== null) return 'ask items have no fixed pot'; }
      else if (!ids[it.answer]) return 'item ' + it.id + ' has no pot';
      if (!(it.size > 0)) return 'bad size';
      if (it.nameKind === undefined || it.nameValue === undefined) return 'no name';
      if (!it.sprite && !it.shape) return 'nothing to draw';
      if (!SG.PALETTE[it.flower] || it.flower === 'cream') return 'no flower colour';
      if (r.mode !== 'ask') perB[it.answer]++;
    }
    var labs = {};
    for (i = 0; i < r.baskets.length; i++) {
      var b = r.baskets[i], key = b.label.type + ':' + b.label.value;
      if (labs[key]) return 'duplicate label ' + key;
      labs[key] = 1;
    }
    if (r.mode === 'count') {
      if (r.baskets.length !== 1) return 'count needs 1 planter';
      var need = r.baskets[0].need;
      if (!(need >= 1)) return 'bad need';
      if (r.items.length < need + 2) return 'not enough seeds';
    } else if (r.mode === 'ask') {
      var q = r.queue;
      if (!q || q.length !== r.items.length) return 'queue length must equal the seeds';
      for (i = 0; i < q.length; i++) { if (!ids[q[i]]) return 'queue names no pot'; perB[q[i]]++; }
      for (var k0 in perB) if (perB[k0] < 1) return 'pot never asked ' + k0;
      for (i = 0; i < r.baskets.length; i++) if (r.baskets[i].label.type !== 'animal' || SG.ANIMALS.indexOf(r.baskets[i].label.value) < 0) return 'bad animal label';
      if (r.params.animal !== ids[q[0]].label.value) return 'params.animal is not the first target';
    } else {
      for (var k in perB) if (perB[k] < 1) return 'empty pot ' + k;
      // every item's label must truly match it (catches generator bugs)
      for (i = 0; i < r.items.length; i++) if (!matches(r.items[i], ids[r.items[i].answer].label)) return 'mismatch ' + r.items[i].id;
    }
    return null;
  }

  var WORD_INIT = {};
  (function () { for (var l in SG.WORDS) { WORD_INIT[l] = {}; SG.WORDS[l].forEach(function (w) { WORD_INIT[l][w.word] = w.initial; }); } })();
  function evalExpr(t) {
    var m = /^(\d+)([+−])(\d+)$/.exec(t); if (!m) return NaN;
    return m[2] === '+' ? +m[1] + +m[3] : +m[1] - +m[3];
  }
  function matches(it, label) {
    switch (label.type) {
      case 'color': return it.color === label.value;
      case 'shape': return it.shape === label.value;
      case 'size': return it.nameValue === label.value && Math.abs(it.scale - SIZE_SCALE[label.value]) < 1e-9;
      case 'animal': return true;    // ask mode: any seed may be planted for the asked animal
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
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new SG.RNG(1);
    var show = { sprite: null, flower: null, shape: null, color: null, text: null, count: 1, scale: 1 }, params = {}, ch, a, k;
    switch (topic) {
      case 'colors': {
        a = rng.pick(COLORS); show.flower = a; show.color = a;
        var dp = safeColors(rng, age, a);   // below 5: no confusable pair among the choices (3 colours incl. the answer)
        ch = choicesFrom(rng, 'color', a, dp, 3); break;
      }
      case 'shapes': {
        var sp = age >= 5 ? SHAPES.concat(['rectangle']) : SHAPES;
        a = rng.pick(sp); show.shape = a; show.color = rng.pick(COLORS);
        ch = choicesFrom(rng, 'shape', a, sp, 3); break;
      }
      case 'size': {
        var c = rng.pick(COLORS); a = rng.pick(['big', 'small']);
        show.sprite = 'seed_' + c; show.color = c; show.scale = SIZE_SCALE[a];
        ch = choicesFrom(rng, 'size', a, ['big', 'small'], 2); break;
      }
      case 'animals': {
        a = rng.pick(SG.ANIMALS); params = { animal: a };    // show nothing: the prompt names the animal
        ch = choicesFrom(rng, 'animal', a, SG.ANIMALS, 3); break;
      }
      case 'count': {
        var r = { 3: [1, 5], 4: [1, 5], 5: [2, 10], 6: [3, 12], 7: [3, 12] }[age];
        a = rng.int(r[0], r[1]); show.flower = rng.pick(COLORS); show.color = show.flower; show.count = a;
        ch = choicesFrom(rng, 'number', a, numberDistractors(a, 1, Math.max(r[1], a + 2)), 3); break;
      }
      case 'letters':
      case 'lower': {
        var P = pool(lang, topic); a = rng.pick(P);
        show.sprite = 'seed_plain'; show.color = 'cream'; show.text = topic === 'lower' ? a.toLowerCase() : a;
        ch = choicesFrom(rng, 'letter', a, P, 3); break;
      }
      case 'initial': {
        // letter first (uniform), then one of its words
        var words = SG.WORDS[lang], inits = [];
        words.forEach(function (w) { if (inits.indexOf(w.initial) < 0) inits.push(w.initial); });
        a = rng.pick(inits);
        var w0 = rng.pick(words.filter(function (w) { return w.initial === a; }));
        show.sprite = w0.sprite; params = { word: w0.word };
        ch = choicesFrom(rng, 'letter', a, inits, 3); break;
      }
      case 'add': {
        var hi = age >= 7 ? 20 : 10; a = rng.int(age >= 7 ? 4 : 2, hi); k = rng.int(1, a - 1);
        show.sprite = 'seed_plain'; show.color = 'cream'; show.text = k + '+' + (a - k);
        ch = choicesFrom(rng, 'number', a, numberDistractors(a, 0, hi + 2), 3); break;
      }
      case 'sub': {
        a = rng.int(0, 9); k = rng.int(1, 10 - a);
        show.sprite = 'seed_plain'; show.color = 'cream'; show.text = (a + k) + MINUS + k;
        ch = choicesFrom(rng, 'number', a, numberDistractors(a, 0, 10), 3); break;
      }
      case 'oddeven': {
        var nn = rng.int(1, 20); a = nn % 2 ? 'odd' : 'even';
        show.sprite = 'seed_plain'; show.color = 'cream'; show.text = String(nn);
        ch = choicesFrom(rng, 'parity', a, ['odd', 'even'], 2); break;
      }
      default: throw new Error('SG.Content: unknown topic ' + topic);
    }
    return { topic: topic, promptKey: 'talk.' + topic, params: params, show: show, choices: ch.choices, answerId: ch.answerId };
  }

  SG.Content = {
    makeRound: makeRound, makeTalk: makeTalk, validate: validate, matches: matches, placeBaskets: placeBaskets, planterRect: planterRect,
    topicsFor: function (age) { return SG.AGE_TOPICS[ageOf(age)].slice(); },
    potsFor: function (topic, age) { return potsFor(topic, ageOf(age)); },
    TOPICS: ALL_TOPICS, COLORS: COLORS, SHAPES: SHAPES.concat(['rectangle']), ANIMALS: SG.ANIMALS,
    LETTER_POOL: LETTER_POOL, SIZE: SIZE, SIZE_SCALE: SIZE_SCALE, COUNT_RANGE: COUNT_RANGE, PLANTER: PLANTER,
    ageOf: ageOf, clash: clash
  };
  SG.Content.nestsFor = SG.Content.potsFor;   // old name (Dino code)
})(window.SG = window.SG || {});
