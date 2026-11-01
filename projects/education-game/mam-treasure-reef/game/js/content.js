/* Mầm's Treasure Reef — TR.PALETTE, TR.ANIMALS, TR.LAGOONS, TR.WORDS, TR.Content (pure + deterministic)
 *
 *   TR.Content.planFor(age, lagoon) → [{ topic, mech:'dig'|'drag', n?, range? }, ×4]   (REQUIREMENT table)
 *   TR.Content.topicsFor(age)      → planFor(age, 1).map(c => c.topic)
 *   TR.Content.makeRound(topic, { age, lang, rng, roundIndex, layout, mech, n, range, prev }) → round   (DESIGN §5.1)
 *   TR.Content.makeTalk(topic,  { age, lang, rng })                                       → talk
 *   TR.Content.validate(round)  → null | 'error text'   (self-check: every round completable)
 *   TR.Content.digParams(round, itemId) → prompt params for that target ({color} / {n} / {animal} / {letter} / …)
 *   TR.Content.chestsFor(topic, age) → default number of chests for a drag round (count → 1 long chest)
 *   TR.Content.placeBaskets(baskets, layout, mech) → x, y, w, h, top, bottom for chests / the long chest
 *
 * Content only emits kinds / values / keys (no text): TR.I18N turns them into words.
 * Every item carries `gem` (a palette key, never cream): the colour of its landing sparkle.
 *
 * DRAG rounds (mode sort / count / ask) are Snow Garden's rounds with sea sprites:
 *   shell_<color> (coloured scallop shells), pearl (count rounds), tag (plain cream tag + text),
 *   procedural shapes (sprite null, shape, color), animal_<x> stickers (initial topic). kind 'chest' | 'long'.
 * DIG rounds (mode 'dig'): round.mounds = [{ id:'m0'…, slot (index into layout.moundGrid), x, y, w, item|null, crab }]
 *   (4–6 mounds; warm-up 4), round.queue = [itemId…] = the targets in order (warm-up 1, later 2–3; count: N pearl ids,
 *   round.need = N, N + 2 pearl mounds (≥ 4), N ≤ 4), one chest ('chest', or 'long' with need N for count). Every dig item carries
 *   `label {type, value}` = the taught attribute it answers (color / shape / size / animal / pearl / letter / number / parity).
 *   RULE: a tap is correct when the tapped item's label equals the current target's label (two red shells are
 *   interchangeable — a child cannot tell them apart), so decoys are exactly the mounds whose label differs from the
 *   current target. Consecutive targets always differ in label. Optional round.crab = moundId (never warm-up, never ≤ 4
 *   mounds): that mound has item null and crab true.
 *
 * Warm-up rule: roundIndex 0 of every chapter uses 1 item per chest for the sort topics (2 for oddeven), each chest once
 * in an animals queue, count warm-up N 1–3 (2–4 from age 6; dig: ≤ 2); dig warm-up = 4 mounds, 1 target.
 * Variety: `prev` = { sig, n, color } of the previous round of the chapter; a round with the same `sig` is re-rolled
 * (up to 12 times) and a count round never repeats the previous count round's N (drag: nor its colour).
 */
(function (TR) {
  'use strict';

  TR.PALETTE = {
    red:    { fill: '#E84A4A', dark: '#A8282E' },
    blue:   { fill: '#3C8DE8', dark: '#1F5BA8' },
    yellow: { fill: '#FFD23F', dark: '#C99A12' },
    green:  { fill: '#4CC26B', dark: '#2A8343' },
    orange: { fill: '#FF9A2E', dark: '#C4650C' },
    purple: { fill: '#9B6BE0', dark: '#6840A8' },
    cream:  { fill: '#FFF4DC', dark: '#C9A877' }
  };
  var COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple'];

  TR.ANIMALS = ['crab', 'octopus', 'seahorse', 'clownfish', 'dolphin', 'jellyfish', 'starfish', 'whale', 'puffer'];
  TR.LAGOONS = [{ id: 1, key: 'beach' }, { id: 2, key: 'coral' }, { id: 3, key: 'cave' }, { id: 4, key: 'bay' }, { id: 5, key: 'ship' }, { id: 6, key: 'rainbow' }];

  var ALL_TOPICS = ['colors', 'shapes', 'size', 'animals', 'count', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];

  // REQUIREMENT learning-goal table: 'topic', 'topic:n' (n chests / colours / animals), 'count:lo-hi', or 'mixed'
  var PLAN = {
    3: [['colors:2', 'colors:2', 'size', 'colors:2'], ['shapes:2', 'colors', 'shapes', 'size'], ['size', 'colors', 'shapes', 'size'],
        ['animals:2', 'colors', 'animals', 'shapes'], ['colors', 'shapes', 'size', 'animals'], ['colors', 'shapes', 'size', 'animals']],
    4: [['colors:2', 'colors:3', 'shapes:2', 'colors:3'], ['shapes:3', 'colors', 'shapes', 'count:1-3'], ['count:1-5', 'shapes', 'count', 'colors'],
        ['animals:3', 'count', 'animals', 'shapes'], ['colors', 'shapes', 'count', 'animals'], 'mixed'],
    5: [['shapes', 'colors', 'shapes', 'count:1-5'], ['count:3-10', 'shapes', 'count', 'size'], ['letters', 'count', 'letters', 'shapes'],
        ['animals:4', 'letters', 'animals', 'count'], ['letters', 'count', 'animals', 'shapes'], 'mixed'],
    6: [['lower', 'count', 'letters', 'initial'], ['initial', 'add', 'count:1-12', 'letters'], ['add', 'count', 'add', 'initial'],
        ['animals', 'add', 'letters', 'count'], ['initial', 'add', 'count', 'animals'], 'mixed'],
    7: [['initial', 'add', 'count', 'add'], ['add', 'sub', 'oddeven', 'add'], ['sub', 'add', 'oddeven', 'initial'],
        ['animals', 'sub', 'add', 'oddeven'], 'mixed', 'mixed']
  };
  var MECH = { odd: ['dig', 'drag', 'dig', 'drag'], even: ['drag', 'dig', 'drag', 'dig'] };

  function W(word, animal, initial) { return { word: word, sprite: 'animal_' + animal, initial: initial }; }
  TR.WORDS = {   // DESIGN §5.1: clownfish → "fish" F; vi: at most one "cá" word per round, never ch/th/ng split
    en: [W('crab', 'crab', 'C'), W('octopus', 'octopus', 'O'), W('seahorse', 'seahorse', 'S'), W('fish', 'clownfish', 'F'),
      W('dolphin', 'dolphin', 'D'), W('jellyfish', 'jellyfish', 'J'), W('starfish', 'starfish', 'S'), W('whale', 'whale', 'W'),
      W('puffer', 'puffer', 'P')],
    vi: [W('cua', 'crab', 'C'), W('bạch tuộc', 'octopus', 'B'), W('cá ngựa', 'seahorse', 'C'), W('cá hề', 'clownfish', 'C'),
      W('cá heo', 'dolphin', 'C'), W('sứa', 'jellyfish', 'S'), W('sao biển', 'starfish', 'S'), W('cá voi', 'whale', 'C'),
      W('cá nóc', 'puffer', 'C')]
  };
  function isCa(w) { return w.word.indexOf('cá ') === 0; }

  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart'];
  var LETTER_POOL = { en: 'ABCDEFGHIKLMNOPRSTUW', vi: 'ABCDEGHIKLMNOPSTUVXY' };
  var MINUS = '−';
  // base drawn sizes (logical px) before the world's fit-shrink; shells are drawn 100–130 (DESIGN §4.1)
  var SIZE = { shell: 116, shellMany: 104, animal: 112, shape: 106, pearl: 110, tag: 116 };
  var SIZE_SCALE = { big: 1.3, small: 0.72 };
  var COUNT_RANGE = { 3: [1, 5], 4: [1, 5], 5: [3, 10], 6: [4, 12], 7: [4, 12] };
  var DIG_COUNT_MAX = 4;          // dig count rounds: N ≤ 4 (N + 2 pearl mounds on a 6-point grid)
  var SMALL_CHEST = 0.72;         // size topic: the 'small' chest is 0.72 × (same x, same bottom); keep = TR.CONFIG.sizeSmallChest
  // the long chest (DESIGN §2): w = min(safe width − 80, 120 + 96·N), h = min(0.42 w, 170); opening line 60/200
  var LONG = { margin: 80, base: 120, perSlot: 96, aspect: 0.42, maxH: 170, openFrac: 0.30 };
  var CHEST_OPEN = 0.27;          // chest_back opening centre (128, 54) in 256×200

  function ageOf(a) { a = Math.round(+a || 4); return a < 3 ? 3 : a > 7 ? 7 : a; }
  function langOf(l) { return l === 'vi' ? 'vi' : 'en'; }
  function lagoonOf(l) { l = Math.round(+l || 1); return l < 1 ? 1 : l > 6 ? 6 : l; }
  function pool(lang, topic) {   // lower-case l and capital I look identical in rounded fonts: no I when lower case is shown
    var P = LETTER_POOL[langOf(lang)].split('');
    return topic === 'lower' ? P.filter(function (c) { return c !== 'I'; }) : P;
  }
  function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }

  // colour-blind safety: below age 5 never blue+purple, red+green (nor yellow+orange, QA P2-6) in one round
  function clash(cs) {
    return (cs.indexOf('blue') >= 0 && cs.indexOf('purple') >= 0) || (cs.indexOf('red') >= 0 && cs.indexOf('green') >= 0) ||
      (cs.indexOf('yellow') >= 0 && cs.indexOf('orange') >= 0);
  }
  var PAIRS = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange']];
  /** A colour set safe for `age`: below 5 one colour of every confusable pair is dropped (3 colours left).
   *  `keep` (optional) is always kept (its partner is the one dropped). */
  function safeColors(rng, age, keep) {
    if (age >= 5) return COLORS.slice();
    var drop = PAIRS.map(function (p) { return p.indexOf(keep) >= 0 ? p[1 - p.indexOf(keep)] : rng.pick(p); });
    return COLORS.filter(function (c) { return drop.indexOf(c) < 0; });
  }

  // ---------------------------------------------------------------- plan
  function parseChapter(s) {
    var m = /^(\w+)(?::(\d+)(?:-(\d+))?)?$/.exec(s), c = { topic: m[1] };
    if (m[3]) c.range = [+m[2], +m[3]]; else if (m[2]) c.n = +m[2];
    return c;
  }
  /** Topics an age knows = every topic of its non-mixed rows (first-appearance order ≈ easiest first). */
  function knownTopics(age) {
    var rows = PLAN[age], out = [];
    rows.forEach(function (row) { if (row !== 'mixed') row.forEach(function (s) { var t = parseChapter(s).topic; if (out.indexOf(t) < 0) out.push(t); }); });
    return out;
  }
  function planFor(age, lagoon) {
    age = ageOf(age); lagoon = lagoonOf(lagoon);
    var row = PLAN[age][lagoon - 1], mech = MECH[lagoon % 2 ? 'odd' : 'even'], chapters;
    if (row === 'mixed') {
      var known = knownTopics(age), r = new TR.RNG('plan:' + age + ':' + lagoon);
      var pick = r.sample(known, 4).sort(function (a, b) { return known.indexOf(a) - known.indexOf(b); });
      chapters = pick.map(function (t) { return { topic: t }; });
    } else chapters = row.map(parseChapter);
    return chapters.map(function (c, i) { c.mech = mech[i]; return c; });
  }

  // ---------------------------------------------------------------- item factories
  function item(o) {
    return { id: null, sprite: o.sprite || null, shape: o.shape || null, color: o.color || null, text: o.text === undefined ? null : o.text,
      scale: o.scale || 1, size: o.size, nameKind: o.nameKind, nameValue: o.nameValue, answer: o.answer,
      gem: o.gem || (o.color && o.color !== 'cream' ? o.color : null) };
  }
  function shell(color, scale, answer, nameKind, nameValue) {
    return item({ sprite: 'shell_' + color, color: color, scale: scale, size: SIZE.shell, nameKind: nameKind, nameValue: nameValue, answer: answer });   // drawn = size · scale
  }
  function tag(text, answer, nameKind, nameValue, gem) {
    return item({ sprite: 'tag', color: 'cream', text: text, size: SIZE.tag, nameKind: nameKind, nameValue: nameValue, answer: answer, gem: gem });
  }
  function pearl(answer, size) {
    return item({ sprite: 'pearl', size: size || SIZE.pearl, nameKind: 'pearl', nameValue: 'pearl', answer: answer, gem: 'blue' });
  }

  function chestsFor(topic, age) {
    if (topic === 'colors' || topic === 'shapes' || topic === 'animals') return age <= 3 ? 2 : age === 4 ? 3 : 4;
    if (topic === 'size' || topic === 'oddeven') return 2;
    if (topic === 'count') return 1;
    return 3;
  }

  /** Queue of chest indices: each chest `counts[i]` times, shuffled, no chest twice in a row when avoidable. */
  function makeQueue(rng, counts) {
    var base = [], i, k, best = null;
    for (i = 0; i < counts.length; i++) for (k = 0; k < counts[i]; k++) base.push(i);
    for (var tries = 0; tries < 80; tries++) {
      var q = rng.shuffle(base.slice()), ok = true;
      for (i = 1; i < q.length; i++) if (q[i] === q[i - 1]) { ok = false; break; }
      if (ok) return q;
      if (!best) best = q;
    }
    return best;
  }

  // ---------------------------------------------------------------- drag rounds (sort / count / ask)
  function buildDrag(topic, age, lang, rng, ri, o) {
    var warm = ri === 0, per = warm ? 1 : 2;
    var n = o.n || chestsFor(topic, age), labels = [], items = [], mode = 'sort', params = {}, need = null, queue = null, i, j, k;
    var add = function (it) { items.push(it); };
    var gemPick = function () { return rng.pick(COLORS); };
    if (topic === 'colors' || topic === 'shapes' || topic === 'animals') n = Math.max(2, Math.min(n, age < 5 ? 3 : 6));

    switch (topic) {
      case 'colors': {
        var cs = rng.sample(safeColors(rng, age), n);
        for (i = 0; i < n; i++) {
          labels.push({ type: 'color', value: cs[i] });
          for (j = 0; j < per; j++) add(shell(cs[i], 1, i, 'color', cs[i]));
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
            if (age >= 5) {             // colours mixed: only the shape matters; the 2 in a chest differ
              do { col = rng.pick(COLORS); } while (used.indexOf(col) >= 0);
              used.push(col);
            }
            add(item({ sprite: null, shape: ss[i], color: col, size: SIZE.shape, nameKind: 'shape', nameValue: ss[i], answer: i }));
          }
        }
        break;
      }
      case 'size': {
        var c = rng.pick(COLORS), order = rng.shuffle(['big', 'small']), cnts = warm ? [1, 1] : rng.pick([[2, 2], [1, 3], [3, 1]]);
        params = { color: c };
        for (i = 0; i < 2; i++) {
          labels.push({ type: 'size', value: order[i] });
          for (j = 0; j < cnts[i]; j++) add(shell(c, SIZE_SCALE[order[i]], i, 'size', order[i]));
        }
        break;
      }
      case 'animals': {
        mode = 'ask';
        var an = rng.sample(TR.ANIMALS, n), counts = [];
        for (i = 0; i < n; i++) { labels.push({ type: 'animal', value: an[i] }); counts.push(warm ? 1 : rng.int(1, 2)); }
        queue = makeQueue(rng, counts);
        var apal = rng.shuffle(safeColors(rng, age));
        for (i = 0; i < queue.length; i++) {
          var sc = apal[i % apal.length];
          add(item({ sprite: 'shell_' + sc, color: sc, size: SIZE.shell, nameKind: 'color', nameValue: sc, answer: null }));
        }
        params = { animal: an[queue[0]] };
        break;
      }
      case 'count': {
        mode = 'count';
        var r = o.range || COUNT_RANGE[age];
        var nlo = warm ? Math.max(r[0], age >= 6 ? 2 : 1) : Math.max(2, r[0]), nhi = warm ? Math.max(nlo, Math.min(r[1], age >= 6 ? 4 : 3)) : Math.max(nlo, r[1]);
        var prev = o.prev || {}, nPool = range(nlo, nhi).filter(function (v) { return v !== prev.n; });
        var N = nPool.length ? rng.pick(nPool) : nlo;                                            // never the previous N
        var extra = N <= 3 ? 3 : 2;
        params = { n: N }; need = N;
        labels.push({ type: 'number', value: N });
        var csz = N + extra > 10 ? SIZE.shellMany : SIZE.pearl;     // 11–14 pearls: a bit smaller so they fit iPad landscape
        for (i = 0; i < N + extra; i++) add(pearl(0, csz));
        break;
      }
      case 'letters':
      case 'lower': {
        var ls = rng.sample(pool(lang, topic), 3);
        for (i = 0; i < 3; i++) {
          labels.push({ type: 'letter', value: ls[i] });
          var t = topic === 'lower' ? ls[i].toLowerCase() : ls[i];
          for (j = 0; j < per; j++) add(tag(t, i, 'letter', t, gemPick()));
        }
        break;
      }
      case 'initial': {
        var words = TR.WORDS[lang], byInit = {}, inits = [];
        for (i = 0; i < words.length; i++) {
          var w0 = words[i];
          if (!byInit[w0.initial]) { byInit[w0.initial] = []; inits.push(w0.initial); }
          byInit[w0.initial].push(w0);
        }
        var chosen = rng.sample(inits, 3), caUsed = false;
        for (i = 0; i < 3; i++) {
          labels.push({ type: 'letter', value: chosen[i] });
          var cnt = Math.min(byInit[chosen[i]].length, warm ? 1 : rng.int(1, 2));
          var ws = rng.shuffle(byInit[chosen[i]].slice()), got = 0;
          for (j = 0; j < ws.length && got < cnt; j++) {
            if (lang === 'vi' && isCa(ws[j])) { if (caUsed) continue; caUsed = true; }   // at most one "cá" word per round
            add(item({ sprite: ws[j].sprite, size: SIZE.animal, nameKind: 'word', nameValue: ws[j].word, answer: i, gem: gemPick() }));
            got++;
          }
          if (!got) add(item({ sprite: ws[0].sprite, size: SIZE.animal, nameKind: 'word', nameValue: ws[0].word, answer: i, gem: gemPick() }));
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
          for (j = 0; j < exprs.length; j++) add(tag(exprs[j], i, isAdd ? 'sum' : 'diff', exprs[j], gemPick()));
        }
        break;
      }
      case 'oddeven': {
        var cntP = warm ? 2 : 3, nums = rng.shuffle(range(1, 20));
        var par = rng.shuffle(['odd', 'even']);
        for (i = 0; i < 2; i++) {
          labels.push({ type: 'parity', value: par[i] });
          var want = par[i] === 'odd' ? 1 : 0, got2 = 0;
          for (j = 0; j < nums.length && got2 < cntP; j++) {
            if (nums[j] % 2 === want) { add(tag(String(nums[j]), i, 'number', nums[j], gemPick())); got2++; nums[j] = -1; }
          }
        }
        break;
      }
      default: throw new Error('TR.Content: unknown topic ' + topic);
    }

    var baskets = [];
    for (i = 0; i < labels.length; i++) {
      var bk = { id: 'b' + i, label: labels[i], kind: mode === 'count' ? 'long' : 'chest', x: 0, y: 0, w: 0, h: 0 };
      if (need !== null) bk.need = need;
      baskets.push(bk);
    }
    rng.shuffle(items);     // so the same answers don't sit together
    for (i = 0; i < items.length; i++) { items[i].id = 'i' + i; items[i].answer = items[i].answer === null ? null : 'b' + items[i].answer; }
    var round = { topic: topic, mech: 'drag', mode: mode, promptKey: 'p.' + topic, params: params, baskets: baskets, items: items };
    if (queue) round.queue = queue.map(function (q) { return 'b' + q; });
    round.sig = mode + '|' + labels.map(function (l) { return l.type + ':' + l.value; }).join(',') + '|' +
      items.map(function (it) { return (it.sprite || it.shape) + ':' + it.nameValue + ':' + it.scale; }).sort().join(',') + (queue ? '|' + round.queue.join('') : '');
    return round;
  }

  // ---------------------------------------------------------------- dig rounds
  /** Candidate dig items for a topic: [{ item, label }] with `n` distinct label values (repeats fill K slots). */
  function digPool(topic, age, lang, rng, K, n, o) {
    var vals, mk, i, out = [];
    switch (topic) {
      case 'colors':
        vals = rng.sample(safeColors(rng, age), Math.min(n, age < 5 ? 3 : 6));
        mk = function (v) { return { item: shell(v, 1, 0, 'color', v), label: { type: 'color', value: v } }; };
        break;
      case 'shapes': {
        var sp = age >= 5 ? SHAPES.concat(['rectangle']) : SHAPES;
        vals = rng.sample(sp, Math.min(n, sp.length));
        var pal = rng.sample(safeColors(rng, age), vals.length), fixed = {};
        vals.forEach(function (v, k) { fixed[v] = pal[k]; });
        mk = function (v) {
          var col = age >= 5 ? rng.pick(COLORS) : fixed[v];     // below 5: one colour per shape (the shape is the only difference that matters)
          return { item: item({ sprite: null, shape: v, color: col, size: SIZE.shape, nameKind: 'shape', nameValue: v, answer: 0 }), label: { type: 'shape', value: v } };
        };
        break;
      }
      case 'size': {
        var c = rng.pick(COLORS);
        vals = rng.shuffle(['big', 'small']);
        mk = function (v) { return { item: shell(c, SIZE_SCALE[v], 0, 'size', v), label: { type: 'size', value: v } }; };
        break;
      }
      case 'animals':
        vals = rng.sample(TR.ANIMALS, Math.min(n, TR.ANIMALS.length));
        mk = function (v) { return { item: item({ sprite: 'animal_' + v, size: SIZE.animal, nameKind: 'animal', nameValue: v, answer: 0, gem: rng.pick(COLORS) }), label: { type: 'animal', value: v } }; };
        break;
      case 'letters':
      case 'lower':
        vals = rng.sample(pool(lang, topic), K);
        mk = function (v) { var t = topic === 'lower' ? v.toLowerCase() : v; return { item: tag(t, 0, 'letter', t, rng.pick(COLORS)), label: { type: 'letter', value: v } }; };
        break;
      case 'initial': {
        var words = rng.shuffle(TR.WORDS[lang].slice()), chosenW = [], caUsed = false;
        for (i = 0; i < words.length && chosenW.length < K; i++) {
          if (lang === 'vi' && isCa(words[i])) { if (caUsed) continue; caUsed = true; }
          chosenW.push(words[i]);
        }
        vals = chosenW;
        mk = function (w) { return { item: item({ sprite: w.sprite, size: SIZE.animal, nameKind: 'word', nameValue: w.word, answer: 0, gem: rng.pick(COLORS) }), label: { type: 'letter', value: w.initial } }; };
        break;
      }
      case 'add':
      case 'sub': {
        var isAdd = topic === 'add', lo = isAdd ? (age >= 7 ? 4 : 2) : 0, hi = isAdd ? (age >= 7 ? 20 : 10) : 9;
        vals = rng.sample(range(lo, hi), K);
        mk = function (s) {
          var e; if (isAdd) { var a = rng.int(1, s - 1); e = a + '+' + (s - a); } else { var b = rng.int(1, 10 - s); e = (s + b) + MINUS + b; }
          return { item: tag(e, 0, isAdd ? 'sum' : 'diff', e, rng.pick(COLORS)), label: { type: 'number', value: s } };
        };
        break;
      }
      case 'oddeven': {
        var nums = rng.shuffle(range(1, 20)), odd = nums.filter(function (v) { return v % 2; }), even = nums.filter(function (v) { return !(v % 2); });
        vals = rng.shuffle(['odd', 'even']);
        mk = function (p) { var v = (p === 'odd' ? odd : even).pop(); return { item: tag(String(v), 0, 'number', v, rng.pick(COLORS)), label: { type: 'parity', value: p } }; };
        break;
      }
      default: throw new Error('TR.Content: unknown dig topic ' + topic);
    }
    // targets first (T distinct-consecutive values), then the rest cycling through the values
    var T = o.T;
    for (i = 0; i < K; i++) out.push(mk(vals[i % vals.length]));
    for (i = 1; i < T && i < K; i++) {          // consecutive targets must differ in label (words may share an initial)
      if (!sameLabel(out[i].label, out[i - 1].label)) continue;
      for (var j = i + 1; j < K; j++) if (!sameLabel(out[j].label, out[i - 1].label)) { var tmp = out[i]; out[i] = out[j]; out[j] = tmp; break; }
    }
    return out;
  }

  function buildDig(topic, age, lang, rng, ri, o) {
    var warm = ri === 0, grid = o.layout && o.layout.moundGrid ? o.layout.moundGrid.length : 6, i;
    var need = null, params, pearlN = null, entries, M, T, crab = false, K;
    if (topic === 'count') {
      var r = o.range || COUNT_RANGE[age], lo = Math.max(1, Math.min(DIG_COUNT_MAX - 1, r[0])), hi = Math.max(lo, Math.min(DIG_COUNT_MAX, r[1]));   // dig: N ≤ 4, lo ≤ 3 so N can vary
      var nlo = warm ? Math.min(lo, 2) : Math.max(lo, 2), nhi = warm ? Math.max(nlo, Math.min(hi, 2)) : hi;   // warm-up: 1–2 pearls
      var prev = o.prev || {}, nPool = range(nlo, nhi).filter(function (v) { return v !== prev.n; });
      pearlN = nPool.length ? rng.pick(nPool) : nlo;
      need = pearlN; K = Math.max(4, pearlN + 2); T = pearlN;      // N + 2 pearl mounds, at least 4
      crab = !warm && K + 1 <= grid && K + 1 >= 5 && rng.chance(0.35);
      entries = [];
      for (i = 0; i < K; i++) entries.push({ item: pearl(0), label: { type: 'pearl', value: 'pearl' } });
      params = { n: pearlN };
    } else {
      M = warm ? 4 : rng.int(5, Math.max(5, grid));
      T = warm ? 1 : rng.int(2, 3);
      crab = !warm && M >= 5 && rng.chance(0.35);
      K = M - (crab ? 1 : 0);
      if (topic === 'initial') { var maxW = lang === 'vi' ? 5 : TR.WORDS.en.length; if (K > maxW) { K = maxW; if (!crab) M = K; } }
      var n = o.n || chestsFor(topic, age);
      entries = digPool(topic, age, lang, rng, K, n, { T: T });
    }
    var items = entries.map(function (e) { return e.item; });
    for (i = 0; i < items.length; i++) { items[i].id = 'i' + i; items[i].answer = 'b0'; items[i].label = entries[i].label; }
    var queue = items.slice(0, T).map(function (it) { return it.id; });
    // mounds: items shuffled over the first M grid anchors (grid order = priority: low rows first)
    var order = rng.shuffle(items.slice());
    if (crab) order.splice(rng.int(0, order.length), 0, null);
    var mounds = order.map(function (it, k) { return { id: 'm' + k, slot: k, x: 0, y: 0, w: 0, item: it, crab: it === null }; });
    var crabId = null;
    mounds.forEach(function (m) { if (m.crab) crabId = m.id; });
    var chest = { id: 'b0', label: need !== null ? { type: 'number', value: need } : { type: 'dig', value: topic }, kind: need !== null ? 'long' : 'chest', x: 0, y: 0, w: 0, h: 0 };
    if (need !== null) chest.need = need;
    var round = { topic: topic, mech: 'dig', mode: 'dig', promptKey: 'p.dig.' + topic, params: null, baskets: [chest], items: items, mounds: mounds, queue: queue };
    if (need !== null) round.need = need;
    if (crabId) round.crab = crabId;
    round.params = params || digParams(round, queue[0]);
    round.sig = 'dig|' + items.map(function (it) { return (it.sprite || it.shape) + ':' + it.nameValue + ':' + it.scale; }).sort().join(',') + '|' + queue.map(function (q) { var it = items[+q.slice(1)]; return it.label.type + ':' + it.label.value; }).join(',');
    return round;
  }

  /** Prompt params for a dig target (p.dig.<topic>): colours {color}, shapes {shape}, size {size, color}, animals {animal},
   *  count {n}, letters/lower {letter: shown text}, initial {letter}, add/sub {n}, oddeven {parity}. */
  function digParams(round, itemId) {
    var it = null, i;
    for (i = 0; i < round.items.length; i++) if (round.items[i].id === itemId) it = round.items[i];
    if (!it || !it.label) return round.need ? { n: round.need } : {};
    switch (it.label.type) {
      case 'color': return { color: it.label.value };
      case 'shape': return { shape: it.label.value };
      case 'size': return { size: it.label.value, color: it.color };
      case 'animal': return { animal: it.label.value };
      case 'pearl': return { n: round.need };
      case 'letter': return { letter: round.topic === 'initial' ? it.label.value : it.text };
      case 'number': return { n: it.label.value };
      case 'parity': return { parity: it.label.value };
    }
    return {};
  }

  // ---------------------------------------------------------------- makeRound
  function makeRound(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new TR.RNG(1), ri = o.roundIndex || 0;
    var mech = o.mech === 'dig' ? 'dig' : 'drag', prev = o.prev || null, round = null;
    for (var tries = 0; tries < 12; tries++) {
      round = mech === 'dig' ? buildDig(topic, age, lang, rng, ri, o) : buildDrag(topic, age, lang, rng, ri, o);
      if (!prev || prev.sig !== round.sig) break;      // no two identical rounds in a chapter
    }
    if (o.layout && (o.layout.chest || o.layout.pot)) placeBaskets(round.baskets, o.layout, mech);
    if (round.mounds && o.layout && o.layout.moundGrid) placeMounds(round.mounds, o.layout);
    round.seed = (rng.next() * 4294967296) >>> 0;
    var err = validate(round);
    if (err) throw new Error('TR.Content: invalid round (' + topic + '/' + mech + '): ' + err);
    return round;
  }

  // ---------------------------------------------------------------- placement
  /** Long chest geometry for `need` slots (DESIGN §2): centred in the safe area, bottom on the chest bottom line. */
  function longRect(layout, need, mech) {
    var ins = layout.ins, sw = layout.W - ins.left - ins.right, chest = mech === 'dig' && layout.dig ? layout.dig.chest : (layout.chest || layout.pot);
    var w = Math.min(sw - LONG.margin, LONG.base + need * LONG.perSlot), h = Math.min(LONG.aspect * w, LONG.maxH, chest.h || 1e9);
    var bottom = chest.bottom !== undefined ? chest.bottom : layout.groundY + 8;
    return { x: ins.left + sw / 2, y: bottom - h + LONG.openFrac * h, w: w, h: h, top: bottom - h, bottom: bottom };
  }

  /** Chests at layout.chest.xs[i] (layout made for this many chests); a long chest gets longRect; dig: layout.dig.chest. */
  function placeBaskets(baskets, layout, mech) {
    var chest = layout.chest || layout.pot, i, b;
    if (baskets.length === 1 && baskets[0].kind === 'long') {
      var pr = longRect(layout, baskets[0].need || 1, mech);
      b = baskets[0]; b.x = pr.x; b.y = pr.y; b.w = pr.w; b.h = pr.h; b.top = pr.top; b.bottom = pr.bottom;
      return;
    }
    if (mech === 'dig' && layout.dig && baskets.length === 1) {
      var dc = layout.dig.chest; b = baskets[0];
      b.x = dc.x; b.y = dc.y; b.w = dc.w; b.h = dc.h; b.top = dc.top; b.bottom = dc.bottom;
      return;
    }
    var xs = chest.xs && chest.xs.length === baskets.length ? chest.xs : chestXs(layout, baskets.length);
    for (i = 0; i < baskets.length; i++) {
      b = baskets[i];
      var k = b.label && b.label.type === 'size' && b.label.value === 'small' ? SMALL_CHEST : 1;   // size topic: a small chest
      b.bottom = chest.bottom !== undefined ? chest.bottom : chest.y + 0.73 * chest.h;
      b.x = xs[i]; b.w = chest.w * k; b.h = chest.h * k;
      b.top = b.bottom - b.h; b.y = b.top + CHEST_OPEN * b.h;
    }
  }
  function chestXs(layout, n) {
    var l = layout.ins.left, aw = layout.W - l - layout.ins.right - 40, sp = aw / n, xs = [];
    for (var i = 0; i < n; i++) xs.push(l + 20 + sp * (i + 0.5));
    return xs;
  }
  /** Mounds onto layout.moundGrid[slot] (x = centre, y = ground contact, w = mound width). */
  function placeMounds(mounds, layout) {
    var g = layout.moundGrid, mw = layout.mound ? layout.mound.w : 170;
    for (var i = 0; i < mounds.length; i++) {
      var p = g[Math.min(mounds[i].slot, g.length - 1)];
      mounds[i].x = p.x; mounds[i].y = p.y; mounds[i].w = mw;
    }
  }

  // ---------------------------------------------------------------- validation
  function sameLabel(a, b) { return !!a && !!b && a.type === b.type && a.value === b.value; }

  /** null when the round is valid and completable, else a reason. */
  function validate(r) {
    if (!r || !r.baskets || !r.baskets.length) return 'no baskets';
    if (!r.items || !r.items.length) return 'no items';
    var ids = {}, perB = {}, i, isCount = r.mode === 'count' || (r.mode === 'dig' && r.need);
    for (i = 0; i < r.baskets.length; i++) {
      var bb = r.baskets[i];
      ids[bb.id] = bb; perB[bb.id] = 0;
      if (bb.kind !== (isCount ? 'long' : 'chest')) return 'bad basket kind';
    }
    var itemIds = {}, byId = {};
    for (i = 0; i < r.items.length; i++) {
      var it = r.items[i];
      if (itemIds[it.id]) return 'duplicate item id';
      itemIds[it.id] = 1; byId[it.id] = it;
      if (r.mode === 'ask') { if (it.answer !== null) return 'ask items have no fixed chest'; }
      else if (!ids[it.answer]) return 'item ' + it.id + ' has no chest';
      if (!(it.size > 0)) return 'bad size';
      if (it.nameKind === undefined || it.nameValue === undefined) return 'no name';
      if (!it.sprite && !it.shape) return 'nothing to draw';
      if (!TR.PALETTE[it.gem] || it.gem === 'cream') return 'no gem colour';
      if (r.mode !== 'ask') perB[it.answer]++;
    }
    var labs = {};
    for (i = 0; i < r.baskets.length; i++) {
      var b = r.baskets[i], key = b.label.type + ':' + b.label.value;
      if (labs[key]) return 'duplicate label ' + key;
      labs[key] = 1;
    }
    if (r.mode === 'dig') return validateDig(r, byId);
    if (r.mode === 'count') {
      if (r.baskets.length !== 1) return 'count needs 1 long chest';
      var need = r.baskets[0].need;
      if (!(need >= 1)) return 'bad need';
      if (r.items.length < need + 2) return 'not enough pearls';
    } else if (r.mode === 'ask') {
      var q = r.queue;
      if (!q || q.length !== r.items.length) return 'queue length must equal the items';
      for (i = 0; i < q.length; i++) { if (!ids[q[i]]) return 'queue names no chest'; perB[q[i]]++; }
      for (var k0 in perB) if (perB[k0] < 1) return 'chest never asked ' + k0;
      for (i = 0; i < r.baskets.length; i++) if (r.baskets[i].label.type !== 'animal' || TR.ANIMALS.indexOf(r.baskets[i].label.value) < 0) return 'bad animal label';
      if (r.params.animal !== ids[q[0]].label.value) return 'params.animal is not the first target';
    } else {
      for (var k in perB) if (perB[k] < 1) return 'empty chest ' + k;
      for (i = 0; i < r.items.length; i++) if (!matches(r.items[i], ids[r.items[i].answer].label)) return 'mismatch ' + r.items[i].id;
    }
    return null;
  }

  function validateDig(r, byId) {
    var i, m = r.mounds, q = r.queue;
    if (!m || m.length < 4 || m.length > 6) return 'dig needs 4–6 mounds';
    if (r.baskets.length !== 1) return 'dig needs one chest';
    if (!q || !q.length) return 'empty queue';
    var seen = {}, inMound = {}, crabs = 0, mids = {};
    for (i = 0; i < m.length; i++) {
      if (mids[m[i].id]) return 'duplicate mound id'; mids[m[i].id] = 1;
      if (m[i].crab) { crabs++; if (m[i].item) return 'crab mound with an item'; continue; }
      if (!m[i].item || !byId[m[i].item.id]) return 'mound without an item';
      if (inMound[m[i].item.id]) return 'item in two mounds'; inMound[m[i].item.id] = 1;
    }
    if (crabs > 1) return 'two crabs';
    if (crabs && (m.length <= 4 || !r.crab || !mids[r.crab])) return 'bad crab';
    if (!crabs && r.crab) return 'crab id without a crab mound';
    for (i = 0; i < r.items.length; i++) { if (!inMound[r.items[i].id]) return 'item ' + r.items[i].id + ' not in a mound'; if (!r.items[i].label) return 'dig item without a label'; }
    for (i = 0; i < q.length; i++) {
      if (!byId[q[i]]) return 'queue names no item'; if (seen[q[i]]) return 'target twice'; seen[q[i]] = 1;
      if (i && !r.need && sameLabel(byId[q[i]].label, byId[q[i - 1]].label)) return 'consecutive targets alike';
    }
    if (r.need) {
      if (q.length !== r.need || r.baskets[0].need !== r.need) return 'count queue ≠ need';
      if (r.items.length < r.need + 2) return 'not enough pearl mounds';
      for (i = 0; i < r.items.length; i++) if (r.items[i].sprite !== 'pearl') return 'count dig: pearls only';
    } else {
      var labels = {};
      for (i = 0; i < r.items.length; i++) labels[r.items[i].label.type + ':' + r.items[i].label.value] = 1;
      if (Object.keys(labels).length < 2) return 'no decoys (one label only)';
      // decoys differ from the target in the taught attribute: for every target some other mound differs (guaranteed by ≥ 2 labels),
      // and no non-target mound is a look-alike of a *different* target value without being that value (labels are exact)
      for (i = 0; i < q.length; i++) { var t = byId[q[i]]; if (!matches(t, t.label)) return 'target does not match its own label'; }
      for (i = 0; i < r.items.length; i++) if (!matches(r.items[i], r.items[i].label)) return 'item label mismatch ' + r.items[i].id;
    }
    return null;
  }

  var WORD_INIT = {};
  (function () { for (var l in TR.WORDS) { WORD_INIT[l] = {}; TR.WORDS[l].forEach(function (w) { WORD_INIT[l][w.word] = w.initial; }); } })();
  function evalExpr(t) {
    var m = /^(\d+)([+−])(\d+)$/.exec(t); if (!m) return NaN;
    return m[2] === '+' ? +m[1] + +m[3] : +m[1] - +m[3];
  }
  function matches(it, label) {
    switch (label.type) {
      case 'color': return it.color === label.value;
      case 'shape': return it.shape === label.value;
      case 'size': return it.nameValue === label.value && Math.abs(it.scale - SIZE_SCALE[label.value]) < 1e-9;
      case 'animal': return it.nameKind === 'animal' ? it.nameValue === label.value : true;    // ask mode: any shell may go to the asked animal
      case 'pearl': return it.sprite === 'pearl';
      case 'letter':
        if (it.nameKind === 'word') return WORD_INIT.en[it.nameValue] === label.value || WORD_INIT.vi[it.nameValue] === label.value;
        return String(it.text).toUpperCase() === label.value;
      case 'number': return evalExpr(it.text) === label.value || (it.sprite === 'pearl');
      case 'parity': return (it.nameValue % 2 === 1) === (label.value === 'odd');
      case 'dig': return true;
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
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new TR.RNG(1);
    var show = { sprite: null, shape: null, color: null, text: null, count: 1, scale: 1 }, params = {}, ch, a, k;
    switch (topic) {
      case 'colors': {
        a = rng.pick(COLORS); show.sprite = 'shell_' + a; show.color = a;
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
        show.sprite = 'shell_' + c; show.color = c; show.scale = SIZE_SCALE[a];
        ch = choicesFrom(rng, 'size', a, ['big', 'small'], 2); break;
      }
      case 'animals': {
        a = rng.pick(TR.ANIMALS); params = { animal: a };    // "Where is the {animal}?" — 3 animal picture choices
        ch = choicesFrom(rng, 'animal', a, TR.ANIMALS, 3); break;
      }
      case 'count': {
        var r = { 3: [1, 5], 4: [1, 5], 5: [2, 10], 6: [3, 12], 7: [3, 12] }[age];
        a = rng.int(r[0], r[1]); show.sprite = 'pearl'; show.count = a;
        ch = choicesFrom(rng, 'number', a, numberDistractors(a, 1, Math.max(r[1], a + 2)), 3); break;
      }
      case 'letters':
      case 'lower': {
        var P = pool(lang, topic); a = rng.pick(P);
        show.sprite = 'tag'; show.color = 'cream'; show.text = topic === 'lower' ? a.toLowerCase() : a;
        ch = choicesFrom(rng, 'letter', a, P, 3); break;
      }
      case 'initial': {
        var words = TR.WORDS[lang], inits = [];
        words.forEach(function (w) { if (inits.indexOf(w.initial) < 0) inits.push(w.initial); });
        a = rng.pick(inits);
        var w0 = rng.pick(words.filter(function (w) { return w.initial === a; }));
        show.sprite = w0.sprite; params = { word: w0.word };
        ch = choicesFrom(rng, 'letter', a, inits, 3); break;
      }
      case 'add': {
        var hi = age >= 7 ? 20 : 10; a = rng.int(age >= 7 ? 4 : 2, hi); k = rng.int(1, a - 1);
        show.sprite = 'tag'; show.color = 'cream'; show.text = k + '+' + (a - k);
        ch = choicesFrom(rng, 'number', a, numberDistractors(a, 0, hi + 2), 3); break;
      }
      case 'sub': {
        a = rng.int(0, 9); k = rng.int(1, 10 - a);
        show.sprite = 'tag'; show.color = 'cream'; show.text = (a + k) + MINUS + k;
        ch = choicesFrom(rng, 'number', a, numberDistractors(a, 0, 10), 3); break;
      }
      case 'oddeven': {
        var nn = rng.int(1, 20); a = nn % 2 ? 'odd' : 'even';
        show.sprite = 'tag'; show.color = 'cream'; show.text = String(nn);
        ch = choicesFrom(rng, 'parity', a, ['odd', 'even'], 2); break;
      }
      default: throw new Error('TR.Content: unknown topic ' + topic);
    }
    return { topic: topic, promptKey: 'talk.' + topic, params: params, show: show, choices: ch.choices, answerId: ch.answerId };
  }

  TR.Content = {
    planFor: planFor, knownTopics: knownTopics, makeRound: makeRound, makeTalk: makeTalk, validate: validate, matches: matches, sameLabel: sameLabel,
    digParams: digParams, placeBaskets: placeBaskets, placeMounds: placeMounds, longRect: longRect, planterRect: longRect,
    topicsFor: function (age) { return planFor(age, 1).map(function (c) { return c.topic; }); },
    chestsFor: function (topic, age) { return chestsFor(topic, ageOf(age)); },
    TOPICS: ALL_TOPICS, COLORS: COLORS, SHAPES: SHAPES.concat(['rectangle']), ANIMALS: TR.ANIMALS, PLAN: PLAN,
    LETTER_POOL: LETTER_POOL, SIZE: SIZE, SIZE_SCALE: SIZE_SCALE, COUNT_RANGE: COUNT_RANGE, LONG: LONG, PLANTER: LONG, DIG_COUNT_MAX: DIG_COUNT_MAX,
    ageOf: ageOf, clash: clash, safeColors: safeColors
  };
  TR.Content.potsFor = TR.Content.nestsFor = TR.Content.chestsFor;   // old names
})(window.TR = window.TR || {});
