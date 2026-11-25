/* Tumi's Flower Farm — FT.PALETTE, FT.SHAPES, FT.ANIMALS, FT.HOMES, FT.HOME_OF, FT.AGE_TOPICS, FT.AGE_POOLS,
 * FT.ANIMAL_WORDS, FT.Content (pure + deterministic; DESIGN §5.2). Needs FT.RNG + FT.Trace.
 *
 *   FT.Content.makeRound(topic, { age, lang, rng, roundIndex, level?, surprise?, prev?, short? }) → round (self-checked)
 *   FT.Content.makeTalk(topic,  { age, lang, rng }) → talk
 *   FT.Content.validate(round) → null | 'reason'
 *   FT.Content.topicsFor(age, rng?, lastTopics?) → the 4 chapter topics (easiest first)
 *
 * ALL positions / sizes are TRAY PICTURE px (600 × 400 box).
 * round = { topic, age, lang, roundIndex, level, surprise, short, key, seed, answers: [values asked this round],
 * Farm theme (DESIGN §1, internal names kept): tray = the garden bed, cookie = a soil patch (on the bed) / a wooden sign
 * (a choice), bag = a seed packet, icing = a planted row (trace), chips = carrots, road = the pebble path home.
 *   board: { cookie: ck | null   — the patch on the bed from the start (colors: a round raked patch; count round 0: the
 *                                  numeral sign; initial: the animal),
 *            at: {x, y, size}    — where `board.cookie` sits (and where a picked cookie lands unless its step says `land`),
 *            home?: home, homeAt?: {x, y, size}   — animals: the home cookie on the right of the tray from the start },
 *   steps: [step] }
 * step (all) = { mode, promptKey, params, nameKind, nameValue }
 *   pickBag    + choices [{id, kind:'bag', color, nameKind:'color', nameValue}], answer (id)
 *   pickCookie + choices [{id, kind:'cookie', ck, nameKind, nameValue, scale?}], answer, land {x, y, size} (the picked
 *                cookie flies there and grows), side? {x, y, size} (initial: the board animal moves aside to there)
 *   trace      + path (FT.Trace spec), color (palette name), on {x, y, r} | null (the cookie circle the icing lies on), follow
 *   chips      + need N, on {x, y, r}
 * `short` rounds (a long chapter): colours keep one bag + trace pair; counting skips the pick (the numeral is on the tray).
 * ck = { kind:'round'|'shape'|'glyph'|'animal'|'home', shape?, text?, animal?, home?, size? ('big'|'small') }
 * Prompt keys (DESIGN §5.2): p.colors {color, stroke} · p.shapes {shape, color} · p.size {size} · p.count {n} ·
 *   p.chips {n} · p.animals {animal} · p.road {home, animal, color} · p.letters {letter} · p.lower {letter (capital), small} ·
 *   p.initial {word (= animal key), animal, letter} · p.add {a, b} · p.sub {a, b} · p.oddeven {parity} ·
 *   p.trace {what: 'stroke'|'shape'|'number'|'letter', value, color, stroke?|shape?|size?|n?|letter?, intro?}
 *     (intro: true = the first step of a round without a pick: "Let's plant the number 1!", else "Now follow the dots!")
 */
(function (FT) {
  'use strict';

  // DESIGN §3 answer palette (exact hex; unchanged from Nini's Sea Painting)
  FT.PALETTE = {
    red:    { base: '#E84A4A', dark: '#A8282E', light: '#F7A0A0' },
    blue:   { base: '#3C8DE8', dark: '#1F5BA8', light: '#A6CCF5' },
    yellow: { base: '#FFD23F', dark: '#C99A12', light: '#FFEB9C' },
    green:  { base: '#4CC26B', dark: '#2A8343', light: '#A8E6B8' },
    orange: { base: '#FF9A2E', dark: '#C4650C', light: '#FFCB8E' },
    purple: { base: '#8E44AD', dark: '#6840A8', light: '#D2BDF3' },
    pink:   { base: '#FF8FC0', dark: '#C9558A', light: '#FFCCE2' }      // an answer colour from age 5
  };
  for (var pk in FT.PALETTE) FT.PALETTE[pk].fill = FT.PALETTE[pk].base;
  var COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple'];
  var COLORS5 = COLORS.concat(['pink']);
  FT.SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
  // DESIGN §5.1: the farm animals and their homes (frog + duck share the pond, cow + sheep the barn: never in one round)
  FT.ANIMALS = ['dog', 'bee', 'bird', 'frog', 'duck', 'cow', 'sheep', 'rabbit', 'hen', 'pig'];
  FT.HOMES = ['kennel', 'hive', 'nest', 'pond', 'barn', 'burrow', 'coop', 'sty'];
  FT.HOME_OF = { dog: 'kennel', bee: 'hive', bird: 'nest', frog: 'pond', duck: 'pond', cow: 'barn', sheep: 'barn', rabbit: 'burrow', hen: 'coop', pig: 'sty' };
  FT.AGE_TOPICS = {
    3: ['colors', 'shapes', 'size', 'animals'],
    4: ['colors', 'shapes', 'count', 'animals'],
    5: ['shapes', 'count', 'letters', 'animals'],
    6: ['lower', 'initial', 'add', 'count'],
    7: ['initial', 'add', 'sub', 'oddeven']
  };
  /* Every age has a POOL of 5 topics in difficulty order; a session plays 4 of them (rotating between sessions). */
  FT.AGE_POOLS = {
    3: ['colors', 'shapes', 'size', 'animals', 'count'],
    4: ['colors', 'size', 'shapes', 'count', 'animals'],
    5: ['colors', 'shapes', 'count', 'letters', 'animals'],
    6: ['letters', 'lower', 'initial', 'add', 'count'],
    7: ['count', 'initial', 'add', 'sub', 'oddeven']
  };
  var ALL_TOPICS = ['colors', 'shapes', 'size', 'animals', 'count', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
  /* 'initial' words. VI without the classifier "con"; words starting with a digraph (ch, th) or a marked vowel letter (ê)
   * are left out, so the first letter is always a plain A–Z glyph the child can trace. */
  FT.ANIMAL_WORDS = {
    en: { dog: 'dog', bee: 'bee', bird: 'bird', frog: 'frog', duck: 'duck', cow: 'cow', sheep: 'sheep', rabbit: 'rabbit', hen: 'hen', pig: 'pig' },
    vi: { dog: 'chó', bee: 'ong', bird: 'chim', frog: 'ếch', duck: 'vịt', cow: 'bò', sheep: 'cừu', rabbit: 'thỏ', hen: 'gà', pig: 'heo' }
  };
  var VI_NO_INITIAL = { dog: 1, bird: 1, frog: 1, rabbit: 1 };

  // ---- tables
  var STROKES_BY_AGE = { 3: ['line', 'wave', 'zigzag', 'arc'], 4: ['line', 'wave', 'zigzag', 'arc', 'loop'] };
  var STROKES_ALL = ['line', 'wave', 'zigzag', 'arc', 'loop', 'swirl'];
  var SHAPES4 = ['circle', 'square', 'triangle', 'star', 'heart'];   // ages ≤ 4; all 8 from age 5
  var EASY_SHAPES = { 3: ['circle', 'square'], 4: ['circle', 'square'], 5: ['circle', 'square', 'oval', 'rect'] };
  var LETTER_POOL = { en: 'ABCDEFGHIJKLMNOPRSTUVWYZ', vi: 'ABCDEGHIKLMNOPQRSTUVXY' };
  var LOWER_SKIP = 'IL';                                             // capital I and small l look alike
  var ADD_MAX = { 3: 10, 4: 10, 5: 10, 6: 10, 7: 20 }, SUB_MAX = 10, ODDEVEN_MAX = { 3: 10, 4: 10, 5: 10, 6: 12, 7: 20 };
  var COLOR_SAFE_BELOW = 5;
  var CLASH = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange']];

  // ---- garden-bed placements (picture px)
  var C0 = { x: 300, y: 200 };
  var ROUND_COOKIE = 340, GLYPH_COOKIE = 350, SHAPE_COOKIE = 340, SHAPE_OUTLINE = 290, SMALL_COOKIE = 210, SMALL_OUTLINE = 166;
  var ANIMAL_AT = { x: 112, y: 268, size: 150 }, HOME_AT = { x: 482, y: 236, size: 190 };
  var INITIAL_SIDE = { x: 102, y: 300, size: 130 }, INITIAL_LAND = { x: 352, y: 200, size: 330 };
  /* QA visual P2-4: the shape outline is piped ≈ 16 px INSIDE the cookie's edge. CookieArt.drawCookie draws the body at
   * BODY_FRAC of its size (size − 2·(0.045 + 0.018)·size); per shape: ext = the body's largest side, inr = the distance from
   * the centre to its nearest edge (both as fractions of the body, from cookie_art SHAPE_B). The outline is the unit shape
   * scaled so its nearest edge sits INSET px inside the body: size = (1 − INSET / (inr·body))·ext·body. */
  var BODY_FRAC = 0.874, SHAPE_INSET = 16;
  var SHAPE_FIT = { circle: [1, 0.5], oval: [1, 0.36], square: [0.88, 0.44], rect: [1, 0.31], triangle: [1.04, 0.298], diamond: [1, 0.312],
    star: [1.008, 0.217], heart: [1.04, 0.3] };
  function outlineSize(shape, cookie) {
    var f = SHAPE_FIT[shape] || SHAPE_FIT.circle, body = BODY_FRAC * cookie;
    return Math.round((1 - SHAPE_INSET / (f[1] * body)) * f[0] * body);
  }
  var ICING_W = 22, EDGE = 14;   // icing stroke width; the icing centre line stays ≥ EDGE px inside the cookie edge
  var MARGIN = 30, VALIDATE_TOL = 42;

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
  var SAFE = { 1: safeSetsOf(1), 2: safeSetsOf(2), 3: safeSetsOf(3) };   // no clash-free set of 4 exists
  /** Colours: rounds ≥ 2 plant two small pairs (upper + lower row) below age 5; from age 5 one large pair (QA playtest). */
  function pairsFor(age, ri, short) { return ri >= 2 && !short && age < 5 ? 2 : 1; }
  function ageOf(a) { a = Math.round(+a || 4); return a < 3 ? 3 : a > 7 ? 7 : a; }
  function langOf(l) { return l === 'vi' ? 'vi' : 'en'; }
  function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }
  function parityOf(n) { return n % 2 ? 'odd' : 'even'; }
  function shapesFor(age) { return age >= 5 ? FT.SHAPES.slice() : SHAPES4.slice(); }
  function strokesFor(age) { return age >= 5 ? STROKES_ALL.slice() : STROKES_BY_AGE[age === 3 ? 3 : 4].slice(); }
  function letterPool(lang, topic) {
    var P = LETTER_POOL[langOf(lang)].split('');
    return topic === 'lower' ? P.filter(function (c) { return LOWER_SKIP.indexOf(c) < 0; }) : P;
  }
  function initialOf(animal, lang) {
    lang = langOf(lang);
    if (lang === 'vi' && VI_NO_INITIAL[animal]) return null;
    var w = FT.ANIMAL_WORDS[lang][animal];
    return w ? w.charAt(0).normalize('NFD').charAt(0).toUpperCase() : null;
  }
  /** k distinct colours; below age 5 a clash-free set (k ≤ 3), never pink. `avoid` = a colour not to put first. */
  function colourSet(rng, age, k) {
    if (age < COLOR_SAFE_BELOW) return rng.shuffle(rng.pick(SAFE[Math.min(3, k)]).slice()).slice(0, k);
    return rng.sample(COLORS5, k);
  }
  function icingColour(rng, age, prev) {
    var pool = (age < COLOR_SAFE_BELOW ? COLORS : COLORS5).filter(function (c) { return !prev || prev.indexOf(c) < 0; });
    return rng.pick(pool.length ? pool : COLORS);
  }
  /** Pick from pool avoiding `prev` values when possible. */
  function pickFresh(rng, pool, prev) {
    var f = pool.filter(function (v) { return !prev || prev.indexOf(v) < 0; });
    return rng.pick(f.length ? f : pool);
  }
  function choiceCount(topic, age, ri) {
    if (ri === 0) return 2;
    if (topic === 'size') return 2;
    if (topic === 'count') return 3;
    if (topic === 'colors' || topic === 'shapes' || topic === 'animals') return age <= 3 ? 2 : age === 4 ? 3 : 4;
    return age <= 5 ? 3 : age === 6 ? 3 : 4;
  }
  function countN(rng, age, ri) {
    var lo, hi;
    if (ri === 0) { lo = 1; hi = 2; } else if (ri === 1) { lo = 2; hi = 3; } else if (age <= 4) { lo = 3; hi = 5; } else if (age === 5) { lo = 4; hi = 10; } else { lo = 4; hi = 12; }   // QA playtest: 4 carrots can be asked at ages 6–7 too
    return rng.int(lo, hi);
  }
  function nearNums(ans, lo, hi, k, rng, ok) {
    ok = ok || function () { return true; };
    var c = rng.shuffle(range(lo, hi).filter(function (x) { return x !== ans && Math.abs(x - ans) <= 3 && ok(x); }));
    if (c.length < k) c = c.concat(rng.shuffle(range(lo, hi).filter(function (x) { return x !== ans && c.indexOf(x) < 0 && ok(x); })));
    return c.slice(0, k);
  }

  // ---- path fitting: the largest scale ≤ 1 at which every icing point lies on the cookie (and inside the tray margin)
  function fits(spec, on) {
    var p = FT.Trace.path(spec), b = p.box;
    if (b.x0 < MARGIN || b.y0 < MARGIN || b.x1 > 600 - MARGIN || b.y1 > 400 - MARGIN) return false;
    if (!on) return true;
    var R = on.r - EDGE;
    for (var i = 0; i < p.strokes.length; i++) for (var j = 0; j < p.strokes[i].pts.length; j++) {
      var q = p.strokes[i].pts[j]; if (Math.sqrt((q[0] - on.x) * (q[0] - on.x) + (q[1] - on.y) * (q[1] - on.y)) > R) return false;
    }
    return true;
  }
  /** mk(k) → spec at scale k; tries 1, 0.95, … 0.5 → the first spec that fits. */
  function fitSpec(mk, on) {
    for (var k = 1; k >= 0.5 - 1e-9; k -= 0.05) { var s = mk(k); if (fits(s, on)) return s; }
    return mk(0.5);
  }
  function strokeSpec(id, cx, cy, w, h, on) {
    return fitSpec(function (k) { return { kind: 'stroke', id: id, cx: cx, cy: cy, w: Math.round(w * k), h: Math.round(h * k) }; }, on);
  }
  function glyphSpec(text, at, on) {
    var two = String(text).length > 1, h0 = two ? 0.6 * at.size : 0.72 * at.size;
    return fitSpec(function (k) { return { kind: 'glyph', text: String(text), cx: at.x, cy: at.y, h: Math.round(h0 * k), maxW: Math.round(0.86 * at.size * k) }; }, on);
  }
  function circleOn(at) { return { x: at.x, y: at.y, r: at.size / 2 }; }
  /** The wooden numeral sign lying on the bed (FarmArt flatSignLook: 0.96 × 0.9 of its size), picture px. */
  var SIGN_W = 0.96, SIGN_H = 0.9;
  function signBox(at) { return { x0: at.x - SIGN_W * at.size / 2, y0: at.y - SIGN_H * at.size / 2, x1: at.x + SIGN_W * at.size / 2, y1: at.y + SIGN_H * at.size / 2 }; }

  // ---- step builders
  function S(mode, promptKey, params, nameKind, nameValue, extra) {
    var s = { mode: mode, promptKey: promptKey, params: params, nameKind: nameKind, nameValue: nameValue };
    if (extra) for (var k in extra) s[k] = extra[k];
    return s;
  }
  function cookieChoices(rng, list, mkCk, nameKind, extra) {
    rng.shuffle(list);
    return list.map(function (v, i) { var c = { id: 'c' + i, kind: 'cookie', ck: mkCk(v), nameKind: nameKind, nameValue: v }; if (extra) extra(c, v); return c; });
  }
  function idOf(choices, v) { for (var i = 0; i < choices.length; i++) if (choices[i].nameValue === v) return choices[i].id; return null; }
  function glyphCk(v) { return { kind: 'glyph', text: String(v) }; }
  function traceGlyph(value, what, color, at, intro, extraParams) {
    var on = circleOn(at), params = { what: what, value: value, color: color };
    if (what === 'number') params.n = value; else params.letter = String(value);
    if (intro) params.intro = true;
    if (extraParams) for (var k in extraParams) params[k] = extraParams[k];
    return S('trace', 'p.trace', params, what, value, { path: glyphSpec(value, at, on), color: color, on: on, follow: !intro });
  }
  /** A pick-cookie step among glyph values + the trace of the right one. */
  function glyphRound(rng, values, answer, pickKey, pickParams, nameKind, color, at, what, traceValue) {
    var ch = cookieChoices(rng, values.slice(), glyphCk, nameKind);
    return [
      S('pickCookie', pickKey, pickParams, nameKind, answer, { choices: ch, answer: idOf(ch, answer), land: { x: at.x, y: at.y, size: at.size } }),
      traceGlyph(traceValue !== undefined ? traceValue : answer, what, color, at, false)
    ];
  }

  function buildRound(topic, age, lang, rng, ri, prev, short) {
    var steps = [], board = { cookie: null, at: { x: C0.x, y: C0.y, size: ROUND_COOKIE } }, n = choiceCount(topic, age, ri), answers = [], color, i;
    prev = prev || [];
    switch (topic) {
      case 'colors': {
        board.cookie = { kind: 'round' }; board.at = { x: C0.x, y: C0.y, size: ROUND_COOKIE };
        var on = circleOn(board.at), bags = colourSet(rng, age, n), pairs = pairsFor(age, ri, short);
        // the asked colours: different from the last round's first colour when possible
        var asked = rng.shuffle(bags.slice()), fresh = asked.filter(function (c) { return prev.indexOf(c) < 0; });
        asked = fresh.concat(asked.filter(function (c) { return fresh.indexOf(c) < 0; }));
        var pool = strokesFor(age), st = [];
        if (ri === 0) st = ['line'];
        else {
          var p1 = pool.filter(function (s) { return s !== 'line' && (pairs === 1 || s !== 'swirl'); });
          if (ri === 1) p1 = p1.filter(function (s) { return s !== 'loop' && s !== 'swirl'; });
          st.push(pickFresh(rng, p1, prev));
          if (pairs === 2) st.push(pickFresh(rng, p1.filter(function (s) { return s !== st[0]; }), prev));
        }
        var choices = bags.map(function (c, k) { return { id: 'b' + k, kind: 'bag', color: c, nameKind: 'color', nameValue: c }; });
        for (i = 0; i < pairs; i++) {
          var c = asked[i], sid = st[i], spec;
          // QA playtest P3-14: the single wave is 170 tall, so a straight swipe can no longer ice it
          // QA playtest 2026-11-25: from age 5 one LARGE pair (the zigzag 150 tall), so a straight swipe cannot plant it
          if (pairs === 1) spec = strokeSpec(sid, C0.x, C0.y, 250, sid === 'swirl' ? 200 : sid === 'arc' ? 120 : sid === 'wave' ? 170 : sid === 'zigzag' && age >= 5 ? 150 : 110, on);
          else spec = strokeSpec(sid, C0.x, i === 0 ? 132 : 266, 220, sid === 'arc' ? 80 : 74, on);
          steps.push(S('pickBag', 'p.colors', { color: c, stroke: sid }, 'color', c, { choices: choices, answer: idOf(choices, c) }));
          steps.push(S('trace', 'p.trace', { what: 'stroke', value: sid, stroke: sid, color: c }, 'stroke', sid, { path: spec, color: c, on: on, follow: true }));
          answers.push(c, sid);
        }
        break;
      }
      case 'shapes': {
        var pool2 = shapesFor(Math.min(age, 5)), ans = ri === 0 ? pickFresh(rng, EASY_SHAPES[Math.min(5, age)], prev) : pickFresh(rng, pool2, prev);
        var others = rng.shuffle(pool2.filter(function (s) { return s !== ans; })).slice(0, n - 1);
        color = icingColour(rng, age, prev);
        var at = { x: C0.x, y: C0.y, size: SHAPE_COOKIE };
        var ch = cookieChoices(rng, [ans].concat(others), function (s) { return { kind: 'shape', shape: s }; }, 'shape');
        steps.push(S('pickCookie', 'p.shapes', { shape: ans, color: color }, 'shape', ans, { choices: ch, answer: idOf(ch, ans), land: at }));
        steps.push(S('trace', 'p.trace', { what: 'shape', value: ans, shape: ans, color: color }, 'shape', ans,
          { path: { kind: 'shape', shape: ans, cx: at.x, cy: at.y, size: outlineSize(ans, SHAPE_COOKIE) }, color: color, on: null, follow: true }));
        answers.push(ans, color);
        break;
      }
      case 'size': {
        var sz = ri === 0 ? 'big' : rng.pick(['big', 'small']);
        if (ri > 0 && prev.indexOf(sz) >= 0 && rng.chance(0.6)) sz = sz === 'big' ? 'small' : 'big';
        color = icingColour(rng, age, prev);
        var atS = sz === 'big' ? { x: C0.x, y: C0.y, size: ROUND_COOKIE } : { x: C0.x, y: C0.y, size: SMALL_COOKIE };
        var chS = cookieChoices(rng, ['big', 'small'], function (s) { return { kind: 'round', size: s }; }, 'size', function (c, v) { c.scale = v === 'big' ? 1 : 0.62; });
        steps.push(S('pickCookie', 'p.size', { size: sz }, 'size', sz, { choices: chS, answer: idOf(chS, sz), land: atS }));
        steps.push(S('trace', 'p.trace', { what: 'shape', value: 'circle', shape: 'circle', size: sz, color: color }, 'shape', 'circle',
          { path: { kind: 'shape', shape: 'circle', cx: atS.x, cy: atS.y, size: sz === 'big' ? SHAPE_OUTLINE : SMALL_OUTLINE }, color: color, on: null, follow: true }));
        answers.push(sz, color);
        break;
      }
      case 'count': {
        var N = countN(rng, age, ri);
        if (prev.indexOf(N) >= 0) { var N2 = countN(rng, age, ri); if (N2 !== N) N = N2; }
        color = icingColour(rng, age, prev);
        var atC = { x: C0.x, y: C0.y, size: GLYPH_COOKIE };
        if (ri === 0 || short) {   // warm-up / a late round in a long chapter: the numeral is already on the tray
          board.cookie = glyphCk(N); board.at = atC;
          steps.push(traceGlyph(N, 'number', color, atC, true));
        } else {
          var hiC = age <= 4 ? 6 : age === 5 ? 10 : 12, vals = [N].concat(nearNums(N, 1, hiC, n - 1, rng));
          steps = glyphRound(rng, vals, N, 'p.count', { n: N }, 'number', color, atC, 'number');
        }
        // the carrots grow in the SOIL around the numeral sign (QA visual P2-2): `avoid` = the sign board lying on the bed
        steps.push(S('chips', 'p.chips', { n: N }, 'number', N, { need: N, on: circleOn(atC), avoid: signBox(atC) }));
        answers.push(N, color);
        break;
      }
      case 'animals': {
        var an = pickFresh(rng, FT.ANIMALS, prev), home = FT.HOME_OF[an];
        var restA = rng.shuffle(FT.ANIMALS.filter(function (a) { return FT.HOME_OF[a] !== home; })), pickA = [an], usedH = [home];
        for (i = 0; i < restA.length && pickA.length < n; i++) if (usedH.indexOf(FT.HOME_OF[restA[i]]) < 0) { pickA.push(restA[i]); usedH.push(FT.HOME_OF[restA[i]]); }
        color = icingColour(rng, age, prev);
        board.home = home;
        var ay = ANIMAL_AT.y + rng.int(-14, 14), hy = HOME_AT.y + rng.int(-12, 12);
        board.homeAt = { x: HOME_AT.x, y: hy, size: HOME_AT.size };
        board.at = { x: ANIMAL_AT.x, y: ay, size: ANIMAL_AT.size };
        var chA = cookieChoices(rng, pickA, function (a) { return { kind: 'animal', animal: a }; }, 'animal');
        steps.push(S('pickCookie', 'p.animals', { animal: an }, 'animal', an, { choices: chA, answer: idOf(chA, an), land: board.at }));
        var bumps = ri === 0 ? 1 : rng.int(1, 2);
        var road = { kind: 'road', from: { x: board.at.x + 0.42 * board.at.size, y: ay }, to: { x: board.homeAt.x - 0.44 * board.homeAt.size, y: hy + 0.18 * board.homeAt.size }, bumps: bumps };
        steps.push(S('trace', 'p.road', { home: home, animal: an, color: color }, 'home', home, { path: road, color: color, on: null, follow: true, what: 'road' }));
        answers.push(an, color);
        break;
      }
      case 'letters': case 'lower': {
        var LP = letterPool(lang, topic), L = pickFresh(rng, LP, prev), vL = [L].concat(rng.sample(LP.filter(function (x) { return x !== L; }), n - 1));
        color = icingColour(rng, age, prev);
        var atL = { x: C0.x, y: C0.y, size: GLYPH_COOKIE };
        if (topic === 'letters') steps = glyphRound(rng, vL, L, 'p.letters', { letter: L }, 'letter', color, atL, 'letter');
        else {
          var small = L.toLowerCase();
          steps = glyphRound(rng, vL.map(function (x) { return x.toLowerCase(); }), small, 'p.lower', { letter: L, small: small }, 'letter', color, atL, 'letter');
        }
        answers.push(L, color);
        break;
      }
      case 'initial': {
        var cand = FT.ANIMALS.filter(function (a) { return initialOf(a, lang); }), a0 = pickFresh(rng, cand, prev), I0 = initialOf(a0, lang);
        var LP2 = letterPool(lang, 'letters').filter(function (x) { return x !== I0; });
        color = icingColour(rng, age, prev);
        board.cookie = { kind: 'animal', animal: a0 }; board.at = { x: C0.x, y: C0.y, size: 300 };
        var chI = cookieChoices(rng, [I0].concat(rng.sample(LP2, n - 1)), glyphCk, 'letter');
        steps.push(S('pickCookie', 'p.initial', { word: a0, animal: a0, letter: I0 }, 'letter', I0, { choices: chI, answer: idOf(chI, I0), land: INITIAL_LAND, side: INITIAL_SIDE }));
        steps.push(traceGlyph(I0, 'letter', color, INITIAL_LAND, false, { animal: a0 }));
        answers.push(a0, color);
        break;
      }
      case 'add': case 'sub': {
        var a, b, res, tries = 0;
        do {
          if (topic === 'add') { var top = ADD_MAX[age], hi = ri === 0 ? Math.min(6, top) : top; res = rng.int(2, hi); a = rng.int(1, res - 1); b = res - a; }
          else { res = rng.int(0, ri === 0 ? 5 : SUB_MAX - 1); b = rng.int(1, SUB_MAX - res); a = res + b; }
        } while (prev.indexOf(res) >= 0 && ++tries < 20);
        color = icingColour(rng, age, prev);
        var hiN = topic === 'add' ? ADD_MAX[age] : SUB_MAX;
        steps = glyphRound(rng, [res].concat(nearNums(res, topic === 'add' ? 1 : 0, hiN, n - 1, rng)), res, 'p.' + topic, { a: a, b: b }, 'number', color,
          { x: C0.x, y: C0.y, size: GLYPH_COOKIE }, 'number');
        steps[0].a = a; steps[0].b = b;
        answers.push(res, color);
        break;
      }
      case 'oddeven': {
        var par = rng.pick(['odd', 'even']), hiO = ODDEVEN_MAX[age];
        var right = pickFresh(rng, range(1, hiO).filter(function (x) { return parityOf(x) === par; }), prev);
        var wrong = rng.sample(range(1, hiO).filter(function (x) { return parityOf(x) !== par; }), n - 1);
        color = icingColour(rng, age, prev);
        steps = glyphRound(rng, [right].concat(wrong), right, 'p.oddeven', { parity: par }, 'number', color, { x: C0.x, y: C0.y, size: GLYPH_COOKIE }, 'number');
        steps[0].parity = par;
        answers.push(right, color);
        break;
      }
      default: throw new Error('FT.Content: unknown topic ' + topic);
    }
    var r = { topic: topic, age: age, lang: lang, roundIndex: ri, surprise: null, short: !!short, board: board, steps: steps, answers: answers };
    r.key = roundKey(r);
    return r;
  }
  function roundKey(r) {
    return r.topic + '#' + r.steps.map(function (s) { return s.mode + ':' + s.nameValue + (s.color ? ':' + s.color : '') + (s.choices ? ':' + s.choices.map(function (c) { return c.nameValue; }).join('+') : ''); }).join(',');
  }

  /**
   * makeRound(topic, { age, lang, rng, roundIndex, level?, surprise?, prev?, short? }) → round.
   * `prev` = the previous round's `answers` (values not to ask again back to back); `short` (a long chapter): colours keep
   * one bag + trace pair. Up to 30 attempts, each validated.
   */
  function makeRound(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new FT.RNG(1), ri = o.roundIndex || 0;
    if (ALL_TOPICS.indexOf(topic) < 0) throw new Error('FT.Content: unknown topic ' + topic);
    var r = null, err = null;
    for (var attempt = 0; attempt < 30; attempt++) {
      try { r = buildRound(topic, age, lang, rng, ri, attempt < 20 ? o.prev : null, !!o.short); err = validate(r); }
      catch (e) { r = null; err = e.message; }
      if (!err) break;
    }
    if (err) throw new Error('FT.Content: invalid round (' + topic + ', age ' + age + ', round ' + ri + '): ' + err);
    r.level = o.level === undefined || o.level === null ? null : o.level | 0;
    r.surprise = ri === 0 ? null : (o.surprise || null);
    r.seed = (rng.next() * 4294967296) >>> 0;
    return r;
  }

  // ---------------- self-check ----------------
  var PATH_OK = {}, PATH_N = 0;
  /** null when the trace spec builds, stays inside the tray margin (+ on the cookie) and a finger following it completes. */
  function pathCheck(spec, on) {
    var key = JSON.stringify(spec) + '|' + (on ? on.x + ',' + on.y + ',' + on.r : '');
    if (PATH_OK[key] !== undefined) return PATH_OK[key] || null;
    var err = '';
    try {
      var p = FT.Trace.path(spec);
      if (!(p.len > 0)) err = 'empty path';
      else if (!fits(spec, on)) err = 'path outside the tray margin / off the cookie';
      else {
        for (var i = 0; i < p.strokes.length && !err; i++) if (p.strokes[i].len < 60) err = 'stroke ' + i + ' shorter than 60 px';
        if (!err && !FT.Trace.follow(p, { tol: VALIDATE_TOL }).complete) err = 'a finger following the dots does not complete it';
      }
    } catch (e) { err = 'path: ' + e.message; }
    if (++PATH_N > 5000) { PATH_OK = {}; PATH_N = 1; }
    PATH_OK[key] = err;
    return err || null;
  }
  var MODES = { colors: 'pickBag', shapes: 'pickCookie', size: 'pickCookie', animals: 'pickCookie', count: 'pickCookie', letters: 'pickCookie',
    lower: 'pickCookie', initial: 'pickCookie', add: 'pickCookie', sub: 'pickCookie', oddeven: 'pickCookie' };
  /** null when the round is completable and follows every rule (DESIGN §5.2 / §3), else the reason. */
  function validate(r) {
    if (!r || !r.steps || !r.steps.length || !r.board) return 'no steps / board';
    var i, j, n = r.steps.length, cols = [], s;
    if (n > 5) return n + ' steps';
    var first = r.steps[0];
    if (r.topic === 'count' && (r.roundIndex === 0 || r.short)) {
      if (first.mode !== 'trace' || !first.params.intro || !r.board.cookie) return 'count warm-up / short round must start with the numeral on the tray';
    } else if (first.mode !== MODES[r.topic]) return 'first step ' + first.mode;
    for (i = 0; i < n; i++) {
      s = r.steps[i];
      if (!s.promptKey || !s.params) return 'step prompt';
      if (s.mode === 'pickBag' || s.mode === 'pickCookie') {
        var ch = s.choices;
        if (!ch || ch.length < 2 || ch.length > 5) return 'choices ' + (ch && ch.length);
        if (r.roundIndex === 0 && ch.length !== 2) return 'warm-up with ' + ch.length + ' choices';
        var ids = {}, match = 0;
        for (j = 0; j < ch.length; j++) {
          if (ids[ch[j].id]) return 'duplicate choice id'; ids[ch[j].id] = 1;
          if (s.mode === 'pickBag' ? ch[j].kind !== 'bag' || !FT.PALETTE[ch[j].color] : ch[j].kind !== 'cookie' || !ch[j].ck) return 'choice kind';
          if (String(ch[j].nameValue) === String(s.nameValue)) match++;
          if (s.mode === 'pickBag') cols.push(ch[j].color);
        }
        var right = ch.filter(function (c) { return c.id === s.answer; })[0];
        if (!right) return 'answer not among the choices';
        if (s.mode === 'pickBag' ? right.color !== s.params.color : String(right.nameValue) !== String(s.nameValue)) return 'answer does not match the prompt';
        if (r.topic === 'oddeven') {
          if (ch.filter(function (c) { return parityOf(+c.nameValue) === s.parity; }).length !== 1) return 'oddeven: not exactly one ' + s.parity;
        } else if (match !== 1) return 'the asked ' + s.nameKind + ' ' + s.nameValue + ' is on ' + match + ' choices';
        if (r.topic === 'animals') {
          var hs = ch.map(function (c) { return FT.HOME_OF[c.nameValue]; });
          if (hs.filter(function (h, k) { return hs.indexOf(h) !== k; }).length) return 'two animals share a home';
          if (FT.HOME_OF[s.nameValue] !== r.board.home) return 'home of the answer';
        }
        if (r.topic === 'add' && s.a + s.b !== +s.nameValue) return 'add';
        if (r.topic === 'sub' && (s.a - s.b !== +s.nameValue || s.a > SUB_MAX || +s.nameValue < 0)) return 'sub';
        if (r.topic === 'initial' && initialOf(s.params.animal, r.lang) !== s.nameValue) return 'initial letter';
        if (r.topic === 'lower' && /[il]/.test(String(s.nameValue))) return 'lower-case i / l';
        if (s.mode === 'pickCookie' && (!s.land || !(s.land.size > 0))) return 'no landing place';
        var nx = r.steps[i + 1];
        if (!nx || nx.mode !== 'trace') return 'a pick must be followed by a trace';
      } else if (s.mode === 'trace') {
        if (!s.path || !s.color || !FT.PALETTE[s.color]) return 'trace without path / colour';
        cols.push(s.color);
        var pe = pathCheck(s.path, s.on);
        if (pe) return pe + ' (' + JSON.stringify(s.path) + ')';
        var pv = r.steps[i - 1];
        if (pv && (pv.mode === 'pickBag') && pv.params.color !== s.color) return 'icing colour ≠ the picked bag';
        if (pv && pv.mode === 'pickCookie' && s.path.kind === 'glyph' && String(s.path.text) !== String(s.nameValue)) return 'traced glyph ≠ the answer';
      } else if (s.mode === 'chips') {
        if (!(s.need >= 1 && s.need <= 12) || !s.on || !s.avoid) return 'chips need';
        var tr = r.steps[i - 1];
        if (!tr || tr.mode !== 'trace' || +tr.nameValue !== s.need) return 'chips need ≠ the traced number';
      } else return 'unknown mode ' + s.mode;
    }
    // warm-up: the easiest
    if (r.roundIndex === 0) {
      var t0 = r.steps.filter(function (x) { return x.mode === 'trace'; })[0];
      if (r.topic === 'colors' && t0.nameValue !== 'line') return 'colours warm-up is not a line';
      if (r.topic === 'count' && t0.nameValue > 2) return 'count warm-up N ' + t0.nameValue;
      if (r.topic === 'shapes' && EASY_SHAPES[Math.min(5, r.age)].indexOf(t0.nameValue) < 0) return 'shapes warm-up ' + t0.nameValue;
    }
    if (r.topic === 'colors') {
      var pairs = r.steps.length / 2;
      if (pairs !== pairsFor(r.age, r.roundIndex, r.short)) return 'colours pairs ' + pairs;
      var bagN = r.steps[0].choices.length, want = r.roundIndex === 0 ? 2 : r.age <= 3 ? 2 : r.age === 4 ? 3 : 4;
      if (bagN !== want) return 'bags ' + bagN + ' ≠ ' + want;
      if (pairs === 2 && (r.steps[0].params.color === r.steps[2].params.color || r.steps[1].nameValue === r.steps[3].nameValue)) return 'second pair repeats';
      var strokes = strokesFor(r.age);
      for (i = 1; i < r.steps.length; i += 2) if (strokes.indexOf(r.steps[i].nameValue) < 0) return 'stroke ' + r.steps[i].nameValue + ' at age ' + r.age;
    }
    if (r.topic === 'shapes') {
      var pool = shapesFor(Math.min(r.age, 5));
      if (r.steps[0].choices.some(function (c) { return pool.indexOf(c.nameValue) < 0; })) return 'shape not for age ' + r.age;
    }
    if (r.topic === 'count') {
      var Nn = r.steps[r.steps.length - 1].need, ri = r.roundIndex;
      if (ri === 1 && (Nn < 2 || Nn > 3)) return 'count round 1 N ' + Nn;
      if (ri >= 2 && r.age <= 4 && (Nn < 3 || Nn > 5)) return 'count N ' + Nn + ' at age ' + r.age;
    }
    if (r.age < COLOR_SAFE_BELOW) {
      var u = cols.filter(function (x, q) { return cols.indexOf(x) === q; });
      if (clash(u) || u.indexOf('pink') >= 0) return 'colour clash in ' + u.join('+');
    }
    return null;
  }

  // ---------------- Talk time ----------------
  function choicesFrom(rng, answer, pool, count, mk) {
    var vals = [answer], p2 = rng.shuffle(pool.filter(function (v) { return v !== answer; }));
    for (var i = 0; vals.length < count && i < p2.length; i++) if (vals.indexOf(p2[i]) < 0) vals.push(p2[i]);
    rng.shuffle(vals);
    var ch = [], ans = null;
    for (var j = 0; j < vals.length; j++) { ch.push({ id: 'c' + j, thing: mk(vals[j]), value: vals[j] }); if (vals[j] === answer) ans = 'c' + j; }
    return { choices: ch, answer: ans };
  }
  /**
   * makeTalk(topic, { age, lang, rng }) → { topic, promptKey 'talk.<topic>', params, show, choices [{id, thing, value}], answer }
   *   things = CookieArt.drawIcon kinds: blob{color} · shape{shape, color} · animal{animal} · home{home} · number{n} ·
   *   letter{text} · dots{n} · size{size}
   *   colors "Which one is {color}?" (flowers) · shapes "Where is the {shape}?" · size "Which flower is {size}?" ·
   *   animals "Where does the {animal} live?" (show the animal, choices homes) · count "How many carrots?" {n}
   *   (show dots) · letters "Where is the letter {letter}?" · lower "Find small {small}" (show the capital) ·
   *   initial "Which letter does {word} start with?" {word, animal, letter} (show the animal) · add / sub {a, b} ·
   *   oddeven "Which number is {parity}?" (exactly one of that parity). 2 choices at age 3, else 3.
   */
  function makeTalk(topic, o) {
    o = o || {};
    var age = ageOf(o.age), lang = langOf(o.lang), rng = o.rng || new FT.RNG(1);
    var show = null, params = {}, ch, a, nC = age <= 3 ? 2 : 3;
    switch (topic) {
      case 'colors': { var set = colourSet(rng, age, 3); a = set[0]; params = { color: a }; ch = choicesFrom(rng, a, set, nC, function (c) { return { kind: 'blob', color: c }; }); break; }
      case 'shapes': { var col = rng.pick(COLORS); a = rng.pick(shapesFor(Math.min(age, 5))); params = { shape: a }; ch = choicesFrom(rng, a, shapesFor(Math.min(age, 5)), nC, function (s) { return { kind: 'shape', shape: s, color: col }; }); break; }
      case 'size': { a = rng.pick(['big', 'small']); params = { size: a }; ch = choicesFrom(rng, a, ['big', 'small'], 2, function (s) { return { kind: 'size', size: s }; }); break; }
      case 'animals': {
        var an = rng.pick(FT.ANIMALS); a = FT.HOME_OF[an]; params = { animal: an, home: a }; show = { kind: 'animal', animal: an };
        ch = choicesFrom(rng, a, FT.HOMES, nC, function (h) { return { kind: 'home', home: h }; }); break;
      }
      case 'count': {
        var rr = { 3: [1, 4], 4: [1, 5], 5: [2, 8], 6: [3, 10], 7: [3, 10] }[age];
        a = rng.int(rr[0], rr[1]); params = { n: a }; show = { kind: 'dots', n: a };
        ch = choicesFrom(rng, a, range(Math.max(1, a - 3), a + 3).filter(function (x) { return x !== a; }), 3, function (x) { return { kind: 'number', n: x }; }); break;
      }
      case 'letters': case 'lower': {
        var P = letterPool(lang, topic); a = rng.pick(P);
        if (topic === 'lower') { params = { letter: a, small: a.toLowerCase() }; show = { kind: 'letter', text: a }; } else params = { letter: a };
        ch = choicesFrom(rng, a, P, 3, function (x) { return { kind: 'letter', text: topic === 'lower' ? x.toLowerCase() : x }; }); break;
      }
      case 'initial': {
        var an2 = rng.pick(FT.ANIMALS.filter(function (x) { return initialOf(x, lang); })); a = initialOf(an2, lang);
        show = { kind: 'animal', animal: an2 }; params = { word: an2, animal: an2, letter: a };
        ch = choicesFrom(rng, a, letterPool(lang, 'letters').filter(function (x) { return x !== a; }), 3, function (x) { return { kind: 'letter', text: x }; }); break;
      }
      case 'add': { var hi = ADD_MAX[age], k; a = rng.int(age >= 7 ? 4 : 2, hi); k = rng.int(1, a - 1); params = { a: k, b: a - k }; ch = choicesFrom(rng, a, nearNums(a, 1, hi + 2, 4, rng), 3, function (x) { return { kind: 'number', n: x }; }); break; }
      case 'sub': { a = rng.int(0, 9); var kk = rng.int(1, 10 - a); params = { a: a + kk, b: kk }; ch = choicesFrom(rng, a, nearNums(a, 0, 10, 4, rng), 3, function (x) { return { kind: 'number', n: x }; }); break; }
      case 'oddeven': {
        var par = rng.pick(['odd', 'even']), hiO = ODDEVEN_MAX[age]; params = { parity: par };
        a = rng.pick(range(1, hiO).filter(function (x) { return parityOf(x) === par; }));
        ch = choicesFrom(rng, a, range(1, hiO).filter(function (x) { return parityOf(x) !== par; }), 3, function (x) { return { kind: 'number', n: x }; }); break;
      }
      default: throw new Error('FT.Content: unknown topic ' + topic);
    }
    return { topic: topic, promptKey: 'talk.' + topic, params: params, show: show, choices: ch.choices, answer: ch.answer, answerId: ch.answer };
  }

  /** 4 chapter topics for a session, easiest first. Without rng or `last`: FT.AGE_TOPICS (the first session). With both:
   *  chapter 1 = the pool topic left out last time (else the easiest one that did not open last time); chapters 2–4 =
   *  3 of the others (preferring topics left out of `last`), in pool (difficulty) order. */
  function topicsFor(age, rng, last) {
    age = ageOf(age);
    last = Array.isArray(last) ? last : [];
    if (!rng || !last.length) return FT.AGE_TOPICS[age].slice();
    var pool = FT.AGE_POOLS[age].slice(), ord = function (a, b) { return pool.indexOf(a) - pool.indexOf(b); };
    var unused = pool.filter(function (t) { return last.indexOf(t) < 0; });
    var first = unused.length ? unused[0] : pool[0];
    if (!unused.length) for (var i = 0; i < pool.length; i++) if (pool[i] !== last[0]) { first = pool[i]; break; }
    var rest = pool.filter(function (t) { return t !== first; });
    var fresh = rng.shuffle(rest.filter(function (t) { return last.indexOf(t) < 0; }));
    var old = rng.shuffle(rest.filter(function (t) { return last.indexOf(t) >= 0; }));
    return [first].concat(fresh.concat(old).slice(0, 3)).sort(ord);   // QA playtest P2-8: all four in pool (difficulty) order
  }

  FT.Content = {
    makeRound: makeRound, makeTalk: makeTalk, validate: validate, roundKey: roundKey, topicsFor: topicsFor, ageOf: ageOf, langOf: langOf,
    clash: clash, safeSetsOf: safeSetsOf, shapesFor: shapesFor, strokesFor: strokesFor, parityOf: parityOf, letterPool: letterPool,
    initialOf: initialOf, countN: countN, pairsFor: pairsFor, signBox: signBox, outlineSize: outlineSize, SHAPE_FIT: SHAPE_FIT, choiceCount: choiceCount, pathCheck: pathCheck, fits: fits,
    /** Most choices a round of this age can show (layout planning). */
    maxChoices: function (age) { return ageOf(age) >= 5 ? 4 : ageOf(age) === 4 ? 3 : 3; },
    TOPICS: ALL_TOPICS, COLORS: COLORS, COLORS5: COLORS5, SHAPES4: SHAPES4, LETTER_POOL: LETTER_POOL, CLASH: CLASH,
    COLOR_SAFE_BELOW: COLOR_SAFE_BELOW, ADD_MAX: ADD_MAX, SUB_MAX: SUB_MAX, ODDEVEN_MAX: ODDEVEN_MAX, ICING_W: ICING_W,
    PLACE: { ROUND_COOKIE: ROUND_COOKIE, GLYPH_COOKIE: GLYPH_COOKIE, SHAPE_COOKIE: SHAPE_COOKIE, SMALL_COOKIE: SMALL_COOKIE, ANIMAL_AT: ANIMAL_AT,
      HOME_AT: HOME_AT, INITIAL_SIDE: INITIAL_SIDE, INITIAL_LAND: INITIAL_LAND }
  };
})(window.FT = window.FT || {});
