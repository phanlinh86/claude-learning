/* Mochi's Icing Bakery — IB.I18N (English + Vietnamese). Mochi (vi lines "Mochi", titles "Gấu Trúc Mochi"; Vietnamese
 * TTS says "Mô Chi") is a cheerful little panda baker: the child taps an icing bag or a cookie, then TRACES the glowing
 * dotted path with a finger (icing flows), counts chocolate chips, pipes a road that takes an animal home.
 *
 *   IB.I18N.t(lang, key, params, rng?)          → string (variants picked with rng.next()/rng()/Math.random)
 *   IB.I18N.name(lang, kind, value, opts?)      → display + spoken name. kinds: color (vi "màu đỏ"), hue (bare colour, vi
 *                                                 "đỏ"; or {bare:true}), shape, stroke, size, animal (opts {size}), word
 *                                                 (animal without classifier), home, number, dots, letter, text, sum,
 *                                                 diff, parity
 *   IB.I18N.words(lang, kind, value)            → accepted spoken forms (lower-case, + no-diacritic forms, digits)
 *   IB.I18N.phrase(lang, thing)                 → a thing named for a sentence: "the circle", "the dog", "the kennel",
 *                                                 "the wave", "the big cookie", "letter D", "small b", "number five",
 *                                                 "2 + 3", "yellow" / "hình tròn", "con chó", "chuồng chó", "đường lượn
 *                                                 sóng", "cái bánh to", "chữ D", "chữ b thường", "số năm", "màu vàng"
 *   IB.I18N.sayPick(lang, ev, rng?)             → `pick`: bag "Red icing!" / "Kem màu đỏ!"; cookie "The triangle!",
 *                                                 "The dog! Woof woof!", "Letter B!", "D is for dog!", "2 + 3 is five!"
 *   IB.I18N.sayTraceDone(lang, ev, rng?)        → `traceDone` (ev = the step): "A red wave! Beautiful!", "A lovely
 *                                                 triangle!", "A beautiful three!", "The road to the kennel is ready!"
 *   IB.I18N.sayWrong(lang, ev, rng?)            → `wrong {kind:'bag'|'cookie', got, want}`: "That’s yellow icing. Let’s
 *                                                 find blue!", "Meow! That’s the cat. Where is the dog?" (maths never
 *                                                 gives the answer away)
 *   IB.I18N.sayNeedPick(lang, ev) / sayChipsDone(lang, ev) / sayHome(lang, ev) / sound(lang, animal)
 *   IB.I18N.sayCount(lang, i)                   → "One!" … "Twenty!"
 *   IB.I18N.talkWrong(lang, kind, value)        → gentle "It is X! Good try!" for a missed Talk-time answer
 *   IB.I18N.speech(lang, text)                  → text tuned for TTS (letter names, + − =, vi "Mochi" → "Mô Chi")
 *   IB.I18N.setChild(name)  has(lang, key)  keys(lang)  raw(lang, key)  langs  PARAMS  TOPICS  ANIMALS  HOMES  STROKES
 *
 * Params: values may be RAW ({color:'red'}, {animal:'dog'}, {stroke:'wave'}, {home:'kennel'}) — keys named like a name
 * kind are named automatically; an object {kind, value} or {nameKind, nameValue} is replaced by its name / phrase.
 * Derived params: {hue} from color, {word} + {sound} from animal, {home} from animal (p.road), {lower} from letter,
 * {expr} from a,b / text, {num} (number word) from n, {chips} ("chocolate chips" / "hạt sô-cô-la", plural-aware) from n.
 * Keys with required params (PARAMS) fall back to a generic key when a param is missing (never "the !" on screen).
 * {child}: if the child's name is empty, variants containing {child} are skipped.
 */
(function (IB) {
  'use strict';

  var LANGS = ['en', 'vi'];
  var ANIMALS = ['dog', 'cat', 'bee', 'bird', 'frog', 'cow', 'rabbit', 'fish', 'duck', 'pig'];
  var HOMES = ['kennel', 'hive', 'nest', 'pond', 'barn', 'burrow', 'bowl', 'basket'];
  var HOME_OF = { dog: 'kennel', bee: 'hive', bird: 'nest', frog: 'pond', duck: 'pond', cow: 'barn', pig: 'barn',
    rabbit: 'burrow', fish: 'bowl', cat: 'basket' };
  var STROKES = ['line', 'wave', 'zigzag', 'arc', 'loop', 'swirl', 'circle'];

  // ---------------------------------------------------------------- names
  var NAMES = { en: {}, vi: {} };
  NAMES.en.color = { red: 'red', blue: 'blue', yellow: 'yellow', green: 'green', orange: 'orange', purple: 'purple', pink: 'pink' };
  NAMES.vi.color = { red: 'màu đỏ', blue: 'màu xanh dương', yellow: 'màu vàng', green: 'màu xanh lá', orange: 'màu cam',
    purple: 'màu tím', pink: 'màu hồng' };
  NAMES.en.hue = NAMES.en.color;
  NAMES.vi.hue = { red: 'đỏ', blue: 'xanh dương', yellow: 'vàng', green: 'xanh lá', orange: 'cam', purple: 'tím', pink: 'hồng' };
  NAMES.en.shape = { circle: 'circle', square: 'square', triangle: 'triangle', star: 'star', heart: 'heart', rect: 'rectangle',
    rectangle: 'rectangle', diamond: 'diamond', oval: 'oval' };
  NAMES.vi.shape = { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', star: 'hình ngôi sao',
    heart: 'hình trái tim', rect: 'hình chữ nhật', rectangle: 'hình chữ nhật', diamond: 'hình thoi', oval: 'hình bầu dục' };
  NAMES.en.stroke = { line: 'straight line', wave: 'wave', zigzag: 'zigzag', arc: 'rainbow arch', loop: 'loop', swirl: 'swirl',
    circle: 'circle' };
  NAMES.vi.stroke = { line: 'đường thẳng', wave: 'đường lượn sóng', zigzag: 'đường zíc zắc', arc: 'cầu vồng', loop: 'vòng xoắn',
    swirl: 'hình xoáy ốc', circle: 'vòng tròn' };
  NAMES.en.size = { big: 'big', small: 'small' };
  NAMES.vi.size = { big: 'to', small: 'nhỏ' };
  NAMES.en.animal = { dog: 'dog', cat: 'cat', bee: 'bee', bird: 'bird', frog: 'frog', cow: 'cow', rabbit: 'rabbit', fish: 'fish',
    duck: 'duck', pig: 'pig' };
  NAMES.vi.animal = { dog: 'con chó', cat: 'con mèo', bee: 'con ong', bird: 'con chim', frog: 'con ếch', cow: 'con bò',
    rabbit: 'con thỏ', fish: 'con cá', duck: 'con vịt', pig: 'con heo' };
  NAMES.en.word = NAMES.en.animal;
  NAMES.vi.word = { dog: 'chó', cat: 'mèo', bee: 'ong', bird: 'chim', frog: 'ếch', cow: 'bò', rabbit: 'thỏ', fish: 'cá',
    duck: 'vịt', pig: 'heo' };
  NAMES.en.home = { kennel: 'kennel', hive: 'beehive', nest: 'nest', pond: 'pond', barn: 'barn', burrow: 'burrow',
    bowl: 'fish bowl', basket: 'basket' };
  NAMES.vi.home = { kennel: 'chuồng chó', hive: 'tổ ong', nest: 'tổ chim', pond: 'cái ao', barn: 'cái chuồng', burrow: 'cái hang',
    bowl: 'bể cá', basket: 'cái giỏ' };
  NAMES.en.parity = { odd: 'odd', even: 'even' };
  NAMES.vi.parity = { odd: 'lẻ', even: 'chẵn' };
  // animal sounds (prompts "Find the dog cookie! Woof woof!", wrong lines, home lines)
  var SOUNDS = {
    en: { dog: 'Woof woof!', cat: 'Meow!', bee: 'Buzz buzz!', bird: 'Tweet tweet!', frog: 'Ribbit!', cow: 'Moo!',
      rabbit: 'Hop hop!', fish: 'Blub blub!', duck: 'Quack quack!', pig: 'Oink oink!' },
    vi: { dog: 'Gâu gâu!', cat: 'Meo meo!', bee: 'Vo ve!', bird: 'Chíp chíp!', frog: 'Ộp ộp!', cow: 'Ụm bò!',
      rabbit: 'Nhảy tưng tưng!', fish: 'Lúp búp!', duck: 'Cạp cạp!', pig: 'Ụt ịt!' }
  };
  var CHIPS = { en: ['chocolate chip', 'chocolate chips'], vi: ['hạt sô-cô-la', 'hạt sô-cô-la'] };

  var NUM = {
    en: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
      'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'],
    vi: ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười', 'mười một', 'mười hai',
      'mười ba', 'mười bốn', 'mười lăm', 'mười sáu', 'mười bảy', 'mười tám', 'mười chín', 'hai mươi']
  };
  // extra spoken forms / common mishearings. Entries starting with '=' only match the WHOLE utterance.
  var NUM_ALT = {
    en: { 0: ['oh', 'nothing'], 1: ['won'], 2: ['too', '=to', '=tu'], 3: ['tree', 'free'], 4: ['=for', 'fore'],
      6: ['sicks'], 8: ['ate'], 10: ['tin'] },
    vi: { 0: ['số không', '=không'], 1: ['mốt'], 2: ['hài'], 3: ['bà'], 4: ['tư'], 5: ['lăm'], 7: ['bẩy'], 10: ['chục'],
      11: ['mười mốt'], 14: ['mười tư'], 15: ['mười năm'], 17: ['mười bẩy'], 20: ['hai chục'] }
  };
  var DOT = { en: ['dot', 'dots'], vi: ['chấm', 'chấm'] };

  var LETTER_SPEECH_EN = { A: 'ay', B: 'bee', C: 'see', D: 'dee', E: 'ee', F: 'eff', G: 'jee', H: 'aitch', I: 'eye',
    J: 'jay', K: 'kay', L: 'ell', M: 'em', N: 'en', O: 'oh', P: 'pee', Q: 'cue', R: 'ar', S: 'ess', T: 'tee', U: 'you',
    V: 'vee', W: 'double you', X: 'ex', Y: 'why', Z: 'zee' };
  var LETTER_WORDS_EN = { A: ['ay', 'eh', 'hey'], B: ['bee', 'be'], C: ['see', 'sea', 'si'], D: ['dee'], E: ['ee'],
    F: ['ef', 'eff'], G: ['gee', 'jee'], H: ['aitch', 'age', 'h'], I: ['eye', 'aye'], J: ['jay'], K: ['kay'],
    L: ['el', 'ell', 'elle'], M: ['em'], N: ['en'], O: ['oh', 'owe'], P: ['pee', 'pea'], Q: ['cue', 'queue'],
    R: ['are', 'ar'], S: ['ess'], T: ['tee', 'tea'], U: ['you'], V: ['vee'], W: ['double you', 'double u'],
    X: ['ex'], Y: ['why'], Z: ['zee', 'zed'] };
  // Vietnamese letters, phonics names as taught in kindergarten / grade 1 ("âm"), used for speech.
  var LETTER_VI = { 'A': 'a', 'Ă': 'á', 'Â': 'ớ', 'B': 'bờ', 'C': 'cờ', 'D': 'dờ', 'Đ': 'đờ', 'E': 'e', 'Ê': 'ê',
    'G': 'gờ', 'H': 'hờ', 'I': 'i', 'K': 'ca', 'L': 'lờ', 'M': 'mờ', 'N': 'nờ', 'O': 'o', 'Ô': 'ô', 'Ơ': 'ơ', 'P': 'pờ',
    'Q': 'quờ', 'R': 'rờ', 'S': 'sờ', 'T': 'tờ', 'U': 'u', 'Ư': 'ư', 'V': 'vờ', 'X': 'xờ', 'Y': 'i dài',
    'F': 'ép', 'J': 'gi', 'W': 'vê kép', 'Z': 'dét' };
  var LETTER_WORDS_VI = { 'A': ['a'], 'Ă': ['á', 'ắ'], 'Â': ['ớ', 'â'], 'B': ['bê', 'bơ', 'bở'], 'C': ['xê', 'cơ', 'cở'],
    'D': ['dê', 'dơ'], 'Đ': ['đê', 'đơ'], 'E': ['e', 'é'], 'Ê': ['ê'], 'G': ['giê', 'gơ', 'gở'], 'H': ['hát', 'hắt', 'hơ'],
    'I': ['i', 'i ngắn'], 'K': ['ca', 'ka'], 'L': ['e lờ', 'lơ'], 'M': ['em mờ', 'mơ'], 'N': ['en nờ', 'nơ'], 'O': ['o'],
    'Ô': ['ô'], 'Ơ': ['ơ'], 'P': ['pê', 'pơ'], 'Q': ['quy', 'cu', 'quơ'], 'R': ['e rờ', 'rơ'], 'S': ['ét xì', 'sơ'],
    'T': ['tê', 'tơ'], 'U': ['u'], 'Ư': ['ư'], 'V': ['vê', 'vơ'], 'X': ['ích xì', 'xơ'], 'Y': ['i dài', 'i cờ rét'],
    'F': ['ép'], 'J': ['gi'], 'W': ['vê kép'], 'Z': ['dét'] };

  // extra accepted spoken forms per kind/value (names are always accepted automatically).
  // No form is shared by two values of the same kind (a longer form beats its shorter prefix: "chuồng chó" > "chuồng").
  var WORDS = {
    en: {
      color: { red: ['red', 'read', 'reds'], blue: ['blue', 'blew', 'blues'], yellow: ['yellow', 'yello'],
        green: ['green', 'greens'], orange: ['orange', 'oranges'], purple: ['purple', 'violet', 'pupple'],
        pink: ['pink', 'pinks', 'pinky'] },
      shape: { circle: ['circle', 'round', 'ring', 'circles'], square: ['square', 'squares'],
        triangle: ['triangle', 'try angle', 'triangles'], star: ['star', 'stars'], heart: ['heart', 'hearts', 'hart', 'love'],
        rect: ['rectangle', 'rectangles', 'long box'], rectangle: ['rectangle', 'rectangles'], oval: ['oval', 'egg', 'ovals'],
        diamond: ['diamond', 'kite', 'diamonds'] },
      stroke: { line: ['line', 'straight', 'straight line'], wave: ['wave', 'wavy', 'waves'], zigzag: ['zigzag', 'zig zag'],
        arc: ['arch', 'rainbow', 'arc'], loop: ['loop', 'loops', 'loopy'], swirl: ['swirl', 'spiral', 'swirly'],
        circle: ['circle', 'round'] },
      size: { big: ['big', 'large', 'huge', 'bigger', 'giant'], small: ['small', 'little', 'tiny', 'smaller', 'baby'] },
      animal: { dog: ['dog', 'doggy', 'doggie', 'puppy'], cat: ['cat', 'kitty', 'kitten'], bee: ['bee', 'bees', 'honeybee'],
        bird: ['bird', 'birdie', 'birds'], frog: ['frog', 'froggy', 'frogs'], cow: ['cow', 'cows'],
        rabbit: ['rabbit', 'bunny', 'rabbits'], fish: ['fish', 'fishy', 'goldfish'], duck: ['duck', 'ducky', 'duckling'],
        pig: ['pig', 'piggy', 'piglet'] },
      home: { kennel: ['kennel', 'doghouse', 'dog house'], hive: ['hive', 'beehive', 'bee hive'], nest: ['nest', 'bird nest'],
        pond: ['pond', 'lake', 'water'], barn: ['barn', 'farm'], burrow: ['burrow', 'hole', 'rabbit hole'],
        bowl: ['bowl', 'fish bowl', 'fishbowl', 'tank'], basket: ['basket', 'bed', 'cat basket'] },
      parity: { odd: ['odd', 'odds'], even: ['even', 'evens'] }
    },
    vi: {
      color: { red: ['đỏ', 'màu đỏ'], blue: ['xanh dương', 'xanh da trời', 'xanh nước biển', 'xanh lam', 'da trời', 'dương'],
        yellow: ['vàng', 'màu vàng'], green: ['xanh lá', 'xanh lá cây', 'xanh lục', 'lá cây'], orange: ['cam', 'màu cam'],
        purple: ['tím', 'màu tím'], pink: ['hồng', 'màu hồng'] },
      shape: { circle: ['hình tròn', 'tròn'], square: ['hình vuông', 'vuông'], triangle: ['tam giác', 'hình tam giác'],
        star: ['ngôi sao', 'sao', 'hình ngôi sao', 'hình sao'], heart: ['trái tim', 'tim', 'hình trái tim', 'hình tim'],
        rect: ['chữ nhật', 'hình chữ nhật'], rectangle: ['chữ nhật', 'hình chữ nhật'], oval: ['bầu dục', 'hình bầu dục'],
        diamond: ['hình thoi', 'thoi'] },
      stroke: { line: ['đường thẳng', 'thẳng'], wave: ['lượn sóng', 'sóng', 'đường sóng'], zigzag: ['zíc zắc', 'zic zac', 'zigzag'],
        arc: ['cầu vồng', 'vòng cung'], loop: ['vòng xoắn', 'xoắn'], swirl: ['xoáy ốc', 'xoáy', 'hình xoáy'],
        circle: ['vòng tròn', 'tròn'] },
      size: { big: ['to', 'lớn', 'bự', 'to lắm', 'to hơn'], small: ['nhỏ', 'bé', 'nhỏ xíu', 'nhỏ hơn', 'tí hon'] },
      animal: { dog: ['con chó', 'chó', 'cún', 'con cún', 'chó con'], cat: ['con mèo', 'mèo', 'mèo con'], bee: ['con ong', 'ong'],
        bird: ['con chim', 'chim'], frog: ['con ếch', 'ếch'], cow: ['con bò', 'bò'], rabbit: ['con thỏ', 'thỏ'],
        fish: ['con cá', 'cá', 'cá vàng'], duck: ['con vịt', 'vịt'], pig: ['con heo', 'heo', 'con lợn', 'lợn'] },
      home: { kennel: ['chuồng chó', 'nhà cún', 'nhà của cún'], hive: ['tổ ong'], nest: ['tổ chim'], pond: ['cái ao', 'ao', 'hồ'],
        barn: ['cái chuồng', 'chuồng', 'chuồng bò', 'chuồng heo'], burrow: ['cái hang', 'hang', 'hang thỏ'],
        bowl: ['bể cá', 'bể', 'hồ cá'], basket: ['cái giỏ', 'giỏ', 'giỏ mèo'] },
      parity: { odd: ['lẻ', 'số lẻ', 'lẽ', 'lẹ'], even: ['chẵn', 'số chẵn', 'chặn', 'chắn'] }
    }
  };

  // Vietnamese first letter: keep the letter's own marks (Ê, Ô, Ơ, Ư, Ă, Â, Đ) but drop the tone ("ếch" → Ê).
  function viInitial(w) {
    var c = String(w).normalize('NFD').replace(/[̣̀́̃̉]/g, '').normalize('NFC').charAt(0);
    return c.toUpperCase();
  }
  // Default IB.WORDS for the 'initial' topic (the animal cookies are the pictures). content.js may replace it
  // ({en:[{word, initial, animal}], vi:[…]}). vi words are the animal names WITHOUT the classifier "con".
  var WORD_LIST = { en: [], vi: [] };
  ANIMALS.forEach(function (a) {
    WORD_LIST.en.push([NAMES.en.word[a], a, NAMES.en.word[a].charAt(0).toUpperCase()]);
    WORD_LIST.vi.push([NAMES.vi.word[a], a, viInitial(NAMES.vi.word[a])]);
  });
  function defaultEntries(lang) {
    return WORD_LIST[lang].map(function (w) { return { id: w[1], word: w[0], animal: w[1], initial: w[2] }; });
  }
  if (!IB.WORDS) {
    IB.WORDS = {};
    LANGS.forEach(function (l) { IB.WORDS[l] = defaultEntries(l); });
  }

  // ---------------------------------------------------------------- strings
  var TOPICS = ['colors', 'shapes', 'size', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
  var NAME_KINDS = ['color', 'hue', 'shape', 'stroke', 'size', 'animal', 'word', 'home', 'number', 'dots', 'letter', 'text',
    'sum', 'diff', 'parity'];
  // prompt keys content.js asks with (DESIGN §5.2) and their REQUIRED params (others are optional)
  var PROMPTS = {
    'p.colors': ['color', 'stroke'], 'p.colors.any': ['color'], 'p.shapes': ['shape'], 'p.size': ['size'], 'p.count': ['n'],
    'p.chips': ['n'], 'p.animals': ['animal'], 'p.road': ['home'], 'p.letters': ['letter'], 'p.lower': ['letter'],
    'p.initial': ['word'], 'p.add': ['a', 'b'], 'p.sub': ['a', 'b'], 'p.oddeven': ['parity'], 'p.trace': ['what']
  };
  var MAX_COUNT = 20;

  var STR = {
    en: {
      'ui.title': 'Mochi’s Icing Bakery',
      'ui.logo1': 'Mochi’s',
      'ui.logo2': 'Icing Bakery',
      'ui.subtitle': 'Pick the icing, follow the dots, bake yummy cookies!',
      'ui.tagline': 'Pick the icing, follow the dots, bake yummy cookies!',
      'ui.play': 'Play',
      'ui.playAgain': 'Play again',
      'ui.home': 'Home',
      'ui.paused': 'Paused',
      'ui.resume': 'Keep playing',
      'ui.settings': 'Settings',
      'ui.holdForParents': 'Hold for parents',
      'ui.age': 'Age',
      'ui.years': '{n} years',
      'ui.language': 'Language',
      'ui.name': 'Child’s name',
      'ui.namePlaceholder': 'e.g. Mai',
      'ui.sound': 'Sound effects',
      'ui.music': 'Music',
      'ui.volume': 'Volume',
      'ui.quieter': 'Quieter',
      'ui.louder': 'Louder',
      'ui.voice': 'Mochi’s voice',
      'ui.mic': 'Answer by voice',
      'ui.done': 'Done',
      'ui.stars': 'Stars',
      'ui.chapter': 'Chapter {n}',
      'ui.allDone': 'All done! {stars} stars',
      'ui.welcome': ['Hi {child}! I am Mochi. Let’s decorate cookies!', 'Hi! I am Mochi. Let’s decorate cookies!'],
      'ui.micUnsupported': 'Voice answers are not available here. Tap the pictures!',
      'ui.micDenied': 'The microphone is off. Tap the pictures instead!',
      'ui.voiceMissing': 'Tip for parents: add a voice in Settings › Accessibility › Spoken Content › Voices.',
      'ui.tapOrSay': 'Tap or say the answer!',
      'ui.listening': 'Mochi is listening…',
      'ui.tapMochi': 'Tap Mochi to hear it again',
      'ui.tapHint': 'Tap the icing, then slide your finger along the dots',
      'ui.skip': 'Skip',
      'ui.pause': 'Pause',
      'ui.parentsHold': 'Parents: hold to open settings',
      'ui.gallery': 'Our cookies',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Colourful Icing',
      'topic.shapes': 'Shape Cookies',
      'topic.size': 'Big and Small',
      'topic.count': 'Counting Chips',
      'topic.animals': 'Animal Cookies',
      'topic.letters': 'ABC Cookies',
      'topic.lower': 'Big and Small Letters',
      'topic.initial': 'First Letters',
      'topic.add': 'Adding Up',
      'topic.sub': 'Take Away',
      'topic.oddeven': 'Odd and Even',

      'weather.0': 'Spring blossoms outside!',
      'weather.1': 'Sunny summer kitchen!',
      'weather.2': 'Autumn leaves outside!',
      'weather.3': 'Snow outside, cosy inside!',

      'enter': ['A new cookie!', 'Look, a fresh cookie!', 'Here comes a cookie to decorate!'],

      'p.any': ['Let’s decorate the cookie!', 'Pick the icing and follow the dots!', 'Time to bake!'],
      'p.colors': ['Tap the {color} icing! Let’s pipe a {stroke}!', 'Let’s pipe a {color} {stroke}! Tap the {color} icing bag!',
        'Can you make a {color} {stroke}? Tap the {color} icing bag!'],
      'p.colors.any': ['Pick the {color} icing!', 'Find the {color} icing bag!', 'Where is the {color} icing?'],
      'p.shapes': ['Which cookie is the {shape}?', 'Find the {shape} cookie!', 'Where is the {shape}? Tap that cookie!'],
      'p.size': ['Find the {size} cookie!', 'Which cookie is {size}?', 'Tap the {size} cookie!'],
      'p.count': ['Find the cookie with number {n}!', 'Where is number {n}? Tap that cookie!', 'Which cookie has a {n}?'],
      'p.chips': ['Let’s count! Tap {n} {chips} onto the cookie!', 'Now put {n} {chips} on the cookie!',
        'Tap the cookie {n} times! Chocolate chips!'],
      'p.chips.any': ['Tap the cookie to add chocolate chips!', 'Chocolate chips! Tap the cookie!', 'Let’s count chocolate chips! Tap the cookie!'],
      'p.animals': ['Find the {animal} cookie! {sound}', '{sound} Where is the {animal} cookie?', 'Which cookie is the {animal}? {sound}'],
      'p.road': ['Pipe a road to the {home}!', 'Let’s pipe a road home to the {home}!', 'Follow the dots to the {home}!'],
      'p.letters': ['Find the cookie with letter {letter}!', 'Where is letter {letter}? Tap that cookie!',
        'Which cookie has letter {letter}?'],
      'p.lower': ['Big {letter} has a little friend. Find small {lower}!', 'Find the cookie with small {lower}!',
        'Where is small {lower}? It goes with big {letter}!'],
      'p.initial': ['What letter does {word} start with? Find that cookie!', 'Listen: {word}! Which letter does it start with?',
        'Find the first letter of {word}!'],
      'p.add': ['What is {a} + {b}? Find the answer cookie!', 'Let’s add! {a} + {b}. Tap the answer!',
        'Count it up: {a} + {b}! Which cookie is the answer?'],
      'p.sub': ['What is {a} − {b}? Find the answer cookie!', 'Take away! {a} − {b}. Tap the answer!',
        'Start with {a}, take away {b}! Which cookie is the answer?'],
      'p.oddeven': ['Find an {parity} number!', 'Which cookie has an {parity} number?', 'Tap a cookie with an {parity} number!'],
      'p.trace': ['Now pipe {what}! Follow the dots!', 'Let’s pipe {what}! Press on the shining dot!',
        'Follow the dots to pipe {what}!'],
      'p.trace.any': ['Now follow the dots!', 'Press on the shining dot and slide!', 'Let’s pipe! Follow the dots!'],

      'say.pick': ['{color} icing!', 'Yummy {color} icing!', '{color}! Squish!'],
      'say.pick.any': ['Squish!', 'Yummy!', 'This one!'],
      'say.pick.shape': ['The {shape}!', 'Yes, the {shape}!', 'A {shape} cookie!'],
      'say.pick.size': ['The {size} cookie!', 'Yes, the {size} one!', 'That cookie is {size}!'],
      'say.pick.animal': ['The {animal}! {sound}', '{sound} The {animal}!', 'Yes, the {animal}! {sound}'],
      'say.pick.home': ['The {home}!', 'Yes, the {home}!'],
      'say.pick.label': ['{label}!', 'Yes, {label}!', '{label}! Super!'],
      'say.pick.parity': ['{num} is {parity}!', 'Yes! {num} is {parity}!'],
      'say.pick.initial': ['{letter} is for {word}!', 'Yes! {letter} is for {word}!'],
      'say.pick.sum': ['{expr} is {ans}!', 'Yes! {expr} is {ans}!'],

      'trace.start': ['Press on the shining dot and slide!', 'Put your finger on the shining dot and slide along!',
        'Start at the sparkly dot and slide!'],
      'trace.progress': ['Yummy!', 'Keep going!', 'Halfway there!', 'Lovely icing!'],
      'trace.stroke': ['Now the next line!', 'Next one! Start at the shining dot!', 'Great! One more line!'],
      'trace.pause': ['Keep going! Start at the shining dot!', 'Press the shining dot again!', 'More icing! Slide on!'],
      'trace.done.stroke': ['A {color} {stroke}! Beautiful!', 'What a lovely {color} {stroke}!', 'Look at your {color} {stroke}!'],
      'trace.done.shape': ['A {shape}! Beautiful icing!', 'What a lovely {shape}!', 'You piped all around the {shape}!'],
      'trace.done.size': ['All around the {size} cookie! Beautiful!', 'The {size} cookie looks yummy!', 'Lovely icing on the {size} cookie!'],
      'trace.done.number': ['A beautiful {num}!', 'You piped number {num}!', '{num}! Lovely icing!'],
      'trace.done.letter': ['{label}! Beautiful icing!', 'You piped {label}!', 'What a lovely {label}!'],
      'trace.done.initial': ['{letter} for {word}! Beautiful!', 'You piped {letter}! {letter} is for {word}!'],
      'trace.done.sum': ['{expr} is {ans}! Beautiful!', 'You piped {ans}! {expr} is {ans}!'],
      'trace.done.parity': ['{num} is {parity}! Beautiful icing!', 'You piped {num}! {num} is {parity}!'],
      'trace.done.road': ['The road to the {home} is ready!', 'What a yummy road to the {home}!', 'Road done! Off to the {home}!'],
      'trace.done.any': ['Beautiful icing!', 'So pretty!', 'What a lovely cookie!'],
      'offPath': ['Follow the dots!', 'Stay on the shiny dots!', 'Slide along the dots!'],
      'traceTap': ['Keep your finger down and slide!', 'Press and slide along the dots!', 'Hold your finger on it and slide!'],
      'assist': ['Magic icing! Slide anywhere!', 'Sparkle magic! Slide your finger on the cookie!', 'Magic icing time! Just slide!'],

      'chipsDone': ['{num} {chips}! Yummy!', '{num} {chips}! Just right!', 'Yummy! {num} {chips}!'],
      'chipsDone.any': ['Chocolate chips! Yummy!', 'Just right! Yummy!'],
      'already': ['That’s enough chips! Just right!', 'All the chips are on! Yummy!', 'The cookie is full of chips!'],
      'wrong.bag': ['That’s {got} icing. Let’s find {want}!', 'Hmm, that’s {got}. Where is {want}?',
        'That one is {got}! Let’s look for {want}!'],
      'wrong.cookie': ['That’s {got}. Where is {want}?', 'That’s {got}! Let’s find {want}!', 'Hmm, that’s {got}. Can you find {want}?'],
      'wrong.animal': ['{sound} That’s {got}. Where is {want}?', '{sound} That’s {got}! Let’s find {want}!',
        '{sound} Hmm, that’s {got}. Can you find {want}?'],
      'wrong.math': ['That’s {got}. Let’s count again!', 'Hmm, {got}. Let’s count one more time!', 'That’s {got}. Let’s think again!'],
      'wrong.parity': ['{num} is {parity}! Let’s look for another one!', '{num} is {parity}. Let’s find a different one!'],
      'wrong.initial': ['That’s {got}. Listen: {word}! Let’s look again!', 'Hmm, that’s {got}. Say it slowly: {word}!'],
      'wrong.any': ['Let’s look again!', 'Let’s try another one!', 'Hmm, let’s think again!', 'Keep going, you can do it!'],
      'needPick.bag': ['First tap the {color} icing bag!', 'The {color} icing first! Down here!', 'Let’s pick the {color} icing first!'],
      'needPick.cookie': ['First find the right cookie down here!', 'Pick a cookie first!', 'Which cookie? Tap one down here!'],
      'needPick.any': ['Pick one down here first!', 'Tap one down here first!', 'First pick one!'],
      'finish': ['Sprinkles!', 'Sparkle, sparkle! Sprinkles!', 'Shake, shake! Sprinkles on top!'],
      'hop': ['Onto the cooling rack!', 'Hop, hop! Onto the rack!', 'Off it hops to cool down!'],
      'surprise.bird': ['Look! A little bird at the window! Tap it!', 'A little bird flies by! Tap it!'],
      'bird.tap': ['Tweet tweet! Sprinkles everywhere!', 'Hee hee! The bird says hello!', 'Tweet! A sprinkle shower!'],
      'surprise.mouse': ['Who is peeking out of the flour sack?', 'Look! A little mouse! Tap it!'],
      'mouse.tap': ['Poof! Flour everywhere! Hee hee!', 'Squeak! The mouse giggles!', 'Poof! A cloud of flour!'],
      'pokeMochi': ['Hee hee! That tickles!', 'Hi! I am Mochi!'],

      'praise': ['Yes!', 'Great job!', 'You got it!', 'Super!', 'Wonderful!', 'Nice one!', 'Hooray!', 'Well done!'],
      'great': ['Great baking, {child}!', 'You did it, {child}!', 'What a yummy cookie!', 'Wow, {child}, super baker!',
        'Hooray! The cookie is done!', 'You are so clever!', 'Super baker!'],
      'party': ['Look at all our cookies!', 'Hooray! What a yummy bakery!', 'So many cookies!'],
      'hint': ['Psst! Look at the shining one!', 'Watch the little hand!', 'Mochi will help! This one!',
        'Look, this one is sparkling!', 'The shiny one! Tap it!'],
      'hint.path': ['Watch the little hand! Slide like this!', 'Follow the little hand along the dots!',
        'Look, the dots are glowing! Slide along them!'],
      'idle': ['Let’s bake!', 'Mochi is waiting! Your turn!', 'The cookie is waiting!', 'I am here, {child}! Let’s bake!',
        'The cookie wants some icing!', 'What shall we pipe next?'],

      'talk.intro': 'Talk time!',
      'talk.colors': 'Which one is {color}?',
      'talk.colorsAny': 'What colour is this?',
      'talk.shapes': 'Where is the {shape}?',
      'talk.shapesAny': 'What shape is this?',
      'talk.size': 'Which cookie is {size}?',
      'talk.sizeAny': 'Which cookie is big?',
      'talk.count': 'How many chocolate chips are there?',
      'talk.countAny': 'How many dots are there?',
      'talk.animals': 'Where does the {animal} live?',
      'talk.animalsFind': 'Where is the {animal}?',
      'talk.animalsAny': 'Who is this?',
      'talk.home': 'Who lives in the {home}?',
      'talk.letters': 'Where is the letter {letter}?',
      'talk.lettersAny': 'Which letter is this?',
      'talk.lower': 'Where is small {lower}? It goes with big {letter}!',
      'talk.lowerAny': 'Which small letter is this?',
      'talk.initial': 'Which letter does {word} start with?',
      'talk.initialAny': 'Which letter does it start with?',
      'talk.add': 'What is {a} + {b}?',
      'talk.sub': 'What is {a} − {b}?',
      'talk.calc': 'What is the answer?',
      'talk.oddeven': 'Which number is {parity}?',
      'talk.oddevenAny': 'Is it odd or even?',
      'talk.right': ['Yes! You are right!', 'Correct! Hooray!', 'Wow, you know it!', 'That is it! Super!',
        'Clever you!', 'Yes, {child}! Great answer!'],
      'talk.wrong': 'It is {answer}! Good try!',
      'talk.wrong.a': 'It is a {answer}! Good try!',
      'talk.wrong.animal': 'It is the {answer}! Good try!',
      'talk.wrong.home': 'It is the {answer}! Good try!',
      'talk.wrong.size': 'It is the {answer} one! Good try!',
      'talk.wrong.letter': 'It is the letter {letter}! Good try!',
      'talk.wrong.small': 'It is small letter {letter}! Good try!',
      'talk.wrong.number': 'It is {answer}! Good try!',
      'talk.wrong.any': 'Good try! Let’s keep baking!',

      'session.done': ['What a yummy bakery! {stars} stars! Hooray!', 'Amazing, {child}! {stars} stars!',
        'So many cookies baked! {stars} stars!']
    },
    vi: {
      'ui.title': 'Tiệm Bánh Quy Của Gấu Trúc Mochi',
      'ui.logo1': 'Gấu Trúc Mochi',
      'ui.logo2': 'Tiệm Bánh Quy',
      'ui.subtitle': 'Chọn kem, vẽ theo chấm, làm bánh quy xinh nhé!',
      'ui.tagline': 'Chọn kem, vẽ theo chấm, làm bánh quy xinh nhé!',
      'ui.play': 'Chơi',
      'ui.playAgain': 'Chơi lại',
      'ui.home': 'Trang chủ',
      'ui.paused': 'Tạm dừng',
      'ui.resume': 'Chơi tiếp',
      'ui.settings': 'Cài đặt',
      'ui.holdForParents': 'Nhấn giữ (dành cho bố mẹ)',
      'ui.age': 'Tuổi',
      'ui.years': '{n} tuổi',
      'ui.language': 'Ngôn ngữ',
      'ui.name': 'Tên của bé',
      'ui.namePlaceholder': 'Ví dụ: Mai',
      'ui.sound': 'Âm thanh',
      'ui.music': 'Nhạc nền',
      'ui.volume': 'Âm lượng',
      'ui.quieter': 'Nhỏ hơn',
      'ui.louder': 'To hơn',
      'ui.voice': 'Giọng của Mochi',
      'ui.mic': 'Nói để trả lời',
      'ui.done': 'Xong',
      'ui.stars': 'Ngôi sao',
      'ui.chapter': 'Chương {n}',
      'ui.allDone': 'Hoàn thành! {stars} ngôi sao',
      'ui.welcome': ['Chào bé {child}! Mình là gấu trúc Mochi. Mình cùng trang trí bánh quy nhé!',
        'Chào bé! Mình là gấu trúc Mochi. Mình cùng trang trí bánh quy nhé!'],
      'ui.micUnsupported': 'Máy này chưa nghe được giọng nói. Bé chạm vào hình nhé!',
      'ui.micDenied': 'Micrô đang tắt. Bé chạm vào hình nhé!',
      'ui.voiceMissing': 'Mẹo cho bố mẹ: thêm giọng tiếng Việt trong Cài đặt › Trợ năng › Nội dung được đọc › Giọng nói.',
      'ui.tapOrSay': 'Bé chạm hoặc nói đáp án nhé!',
      'ui.listening': 'Mochi đang nghe…',
      'ui.tapMochi': 'Chạm vào Mochi để nghe lại nhé',
      'ui.tapHint': 'Bé chạm vào túi kem, rồi miết ngón tay theo các chấm nhé',
      'ui.skip': 'Bỏ qua',
      'ui.pause': 'Tạm dừng',
      'ui.parentsHold': 'Bố mẹ: nhấn giữ để mở cài đặt',
      'ui.gallery': 'Bánh của bé',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Kem nhiều màu',
      'topic.shapes': 'Bánh quy hình khối',
      'topic.size': 'To và nhỏ',
      'topic.count': 'Đếm hạt sô-cô-la',
      'topic.animals': 'Bánh quy con vật',
      'topic.letters': 'Bánh quy chữ cái',
      'topic.lower': 'Chữ hoa, chữ thường',
      'topic.initial': 'Chữ cái đầu tiên',
      'topic.add': 'Phép cộng',
      'topic.sub': 'Phép trừ',
      'topic.oddeven': 'Số chẵn, số lẻ',

      'weather.0': 'Mùa xuân, ngoài cửa sổ hoa nở rồi!',
      'weather.1': 'Mùa hè, căn bếp đầy nắng!',
      'weather.2': 'Mùa thu, lá vàng bay ngoài cửa sổ!',
      'weather.3': 'Ngoài trời tuyết rơi, trong bếp ấm áp ghê!',

      'enter': ['Một chiếc bánh mới nè!', 'Nhìn kìa, bánh mới ra lò!', 'Bánh mới để trang trí đây rồi!'],

      'p.any': ['Bé ơi, mình trang trí bánh nhé!', 'Bé chọn kem rồi vẽ theo chấm nào!', 'Tới giờ làm bánh rồi!'],
      'p.colors': ['Bé ơi, chạm vào túi kem {color} nhé, mình vẽ {stroke}!', 'Mình vẽ {stroke} {color} nào! Bé chạm vào túi kem {color} nhé!',
        'Bé vẽ được một {stroke} {color} không nào? Bé chạm vào túi kem {color} nhé!'],
      'p.colors.any': ['Bé ơi, chọn túi kem {color} nhé!', 'Túi kem {color} ở đâu nhỉ? Bé chạm vào nào!', 'Bé tìm kem {color} nhé!'],
      'p.shapes': ['Bé ơi, bánh quy nào là {shape} nhỉ?', 'Bé tìm bánh quy {shape} nhé!', '{shape} ở đâu nhỉ? Bé chạm vào bánh đó nào!'],
      'p.size': ['Bé ơi, tìm cái bánh {size} nhé!', 'Cái bánh nào {size} nhỉ? Bé chạm vào nào!', 'Bé chạm vào cái bánh {size} nhé!'],
      'p.count': ['Bé ơi, tìm bánh quy có số {n} nhé!', 'Số {n} ở đâu nhỉ? Bé chạm vào bánh đó nào!', 'Bánh nào có số {n} nhỉ? Bé tìm nhé!'],
      'p.chips': ['Bé ơi, mình đếm nhé! Bé chạm {n} lần để thả {n} {chips} lên bánh nào!', 'Giờ bé thả {n} {chips} lên bánh nhé!',
        'Bé chạm vào bánh {n} lần nhé! Sô-cô-la nè!'],
      'p.chips.any': ['Bé ơi, chạm vào bánh để thả sô-cô-la nhé!', 'Sô-cô-la nè! Bé chạm vào bánh nào!', 'Mình đếm hạt sô-cô-la nào! Bé chạm vào bánh nhé!'],
      'p.animals': ['Bé ơi, tìm bánh quy hình {animal} nhé! {sound}', '{sound} Bánh quy hình {animal} ở đâu nhỉ? Bé tìm nào!',
        'Bánh nào là {animal} nhỉ? {sound} Bé chạm vào nhé!'],
      'p.road': ['Bé ơi, vẽ con đường tới {home} nhé!', 'Mình vẽ đường về {home} nào!', 'Bé vẽ theo chấm tới {home} nhé!'],
      'p.letters': ['Bé ơi, tìm bánh quy có chữ {letter} nhé!', 'Chữ {letter} ở đâu nhỉ? Bé chạm vào bánh đó nào!',
        'Bánh nào có chữ {letter} nhỉ? Bé tìm nhé!'],
      'p.lower': ['Bé ơi, chữ {letter} hoa có một bạn nhỏ. Bé tìm chữ {lower} thường nhé!', 'Bé tìm bánh có chữ {lower} thường nào!',
        'Chữ {lower} thường ở đâu nhỉ? Bạn ấy đi cùng chữ {letter} hoa đó!'],
      'p.initial': ['Bé ơi, {word} bắt đầu bằng chữ gì nhỉ? Bé tìm bánh đó nhé!', 'Bé nghe nè: {word}! Bắt đầu bằng chữ gì nào?',
        'Bé tìm chữ cái đầu tiên của {word} nhé!'],
      'p.add': ['Bé ơi, {a} + {b} bằng mấy? Bé tìm bánh đáp án nhé!', 'Mình cộng nào! {a} + {b}. Bé chạm vào đáp án nhé!',
        'Bé tính nhé: {a} + {b}! Bánh nào là đáp án nào?'],
      'p.sub': ['Bé ơi, {a} − {b} bằng mấy? Bé tìm bánh đáp án nhé!', 'Mình trừ nào! {a} − {b}. Bé chạm vào đáp án nhé!',
        'Có {a}, bớt đi {b}! Bánh nào là đáp án nào?'],
      'p.oddeven': ['Bé ơi, tìm một số {parity} nhé!', 'Bánh nào có số {parity} nhỉ? Bé tìm nào!', 'Bé chạm vào bánh có số {parity} nhé!'],
      'p.trace': ['Giờ bé vẽ {what} nhé! Theo các chấm nào!', 'Bé ơi, mình vẽ {what} nào! Bé ấn vào chấm sáng nhé!',
        'Bé vẽ theo chấm để có {what} nhé!'],
      'p.trace.any': ['Giờ bé vẽ theo các chấm nhé!', 'Bé ấn vào chấm sáng rồi miết theo nào!', 'Mình bắt kem nào! Bé vẽ theo chấm nhé!'],

      'say.pick': ['Kem {color}!', 'Kem {color} ngon quá!', '{color} nè! Bóp kem nào!'],
      'say.pick.any': ['Bóp kem nào!', 'Ngon quá!', 'Cái này nè!'],
      'say.pick.shape': ['{shape}!', 'Đúng rồi, {shape}!', 'Bánh quy {shape} nè!'],
      'say.pick.size': ['Cái bánh {size}!', 'Đúng rồi, cái bánh {size}!', 'Bánh này {size} nè!'],
      'say.pick.animal': ['{animal}! {sound}', '{sound} {animal} nè!', 'Đúng rồi, {animal}! {sound}'],
      'say.pick.home': ['{home}!', 'Đúng rồi, {home}!'],
      'say.pick.label': ['{label}!', 'Đúng rồi, {label}!', '{label}! Giỏi quá!'],
      'say.pick.parity': ['{num} là số {parity}!', 'Đúng rồi! {num} là số {parity}!'],
      'say.pick.initial': ['Chữ {letter}, {word}!', 'Đúng rồi! Chữ {letter}, {word}!'],
      'say.pick.sum': ['{expr} bằng {ans}!', 'Đúng rồi! {expr} bằng {ans}!'],

      'trace.start': ['Bé ấn vào chấm sáng rồi miết theo nhé!', 'Bé đặt ngón tay lên chấm sáng rồi kéo theo các chấm nào!',
        'Bắt đầu từ chấm lấp lánh, rồi miết theo nhé!'],
      'trace.progress': ['Ngon quá!', 'Tiếp đi bé!', 'Được nửa rồi nè!', 'Kem đẹp quá!'],
      'trace.stroke': ['Giờ tới nét tiếp theo nhé!', 'Nét nữa nè! Bắt đầu ở chấm sáng nhé!', 'Giỏi quá! Thêm một nét nữa nào!'],
      'trace.pause': ['Tiếp đi bé! Bắt đầu ở chấm sáng nhé!', 'Bé ấn lại vào chấm sáng nào!', 'Thêm kem nữa nè! Miết tiếp nhé!'],
      'trace.done.stroke': ['Một {stroke} {color}! Đẹp quá!', '{stroke} {color} xinh quá!', 'Nhìn {stroke} {color} của bé nè!'],
      'trace.done.shape': ['{shape}! Kem đẹp quá!', '{shape} xinh quá!', 'Bé vẽ kem quanh {shape} rồi nè!'],
      'trace.done.size': ['Kem quanh cái bánh {size}! Đẹp quá!', 'Cái bánh {size} trông ngon quá!', 'Cái bánh {size} có kem xinh rồi!'],
      'trace.done.number': ['Số {num} đẹp quá!', 'Bé vẽ được số {num} rồi!', 'Số {num}! Kem xinh quá!'],
      'trace.done.letter': ['{label}! Kem đẹp quá!', 'Bé vẽ được {label} rồi!', '{label} xinh quá!'],
      'trace.done.initial': ['Chữ {letter}, {word}! Đẹp quá!', 'Bé vẽ chữ {letter} rồi! Chữ {letter}, {word}!'],
      'trace.done.sum': ['{expr} bằng {ans}! Đẹp quá!', 'Bé vẽ số {ans} rồi! {expr} bằng {ans}!'],
      'trace.done.parity': ['{num} là số {parity}! Kem đẹp quá!', 'Bé vẽ số {num} rồi! {num} là số {parity}!'],
      'trace.done.road': ['Đường tới {home} xong rồi!', 'Con đường kem tới {home} ngon quá!', 'Xong đường rồi! Về {home} nào!'],
      'trace.done.any': ['Kem đẹp quá!', 'Xinh quá!', 'Bánh đẹp quá!'],
      'offPath': ['Bé vẽ theo các chấm nhé!', 'Bé miết trên các chấm sáng nhé!', 'Theo các chấm nào bé ơi!'],
      'traceTap': ['Bé giữ ngón tay rồi miết nhé!', 'Bé ấn và kéo theo các chấm nào!', 'Giữ ngón tay trên bánh rồi miết nhé!'],
      'assist': ['Kem phép thuật! Bé miết chỗ nào cũng được!', 'Phép màu lấp lánh! Bé miết ngón tay trên bánh nhé!',
        'Kem phép thuật nè! Bé cứ miết nhé!'],

      'chipsDone': ['{num} {chips}! Ngon quá!', '{num} {chips}! Vừa đủ luôn!', 'Ngon quá! {num} {chips}!'],
      'chipsDone.any': ['Hạt sô-cô-la! Ngon quá!', 'Vừa đủ luôn! Ngon quá!'],
      'already': ['Đủ sô-cô-la rồi! Vừa xinh luôn!', 'Sô-cô-la lên bánh hết rồi! Ngon quá!', 'Bánh đầy sô-cô-la rồi nè!'],
      'wrong.bag': ['Đây là kem {got}. Mình tìm kem {want} nhé!', 'Ồ, đây là {got}. Kem {want} ở đâu nhỉ?',
        'Túi này là {got}! Bé tìm kem {want} nào!'],
      'wrong.cookie': ['Đây là {got}. {want} ở đâu nhỉ?', 'Đây là {got}! Mình tìm {want} nhé!', 'Ồ, đây là {got}. Bé tìm {want} nào!'],
      'wrong.animal': ['{sound} Đây là {got}. {want} ở đâu nhỉ?', '{sound} Đây là {got}! Mình tìm {want} nhé!',
        '{sound} Ồ, đây là {got}. Bé tìm {want} nào!'],
      'wrong.math': ['Đây là {got}. Mình đếm lại nhé!', 'Ồ, {got}. Bé đếm thêm lần nữa nào!', 'Đây là {got}. Bé nghĩ thêm chút nhé!'],
      'wrong.parity': ['{num} là số {parity}! Mình tìm số khác nhé!', '{num} là số {parity}. Bé tìm số khác nào!'],
      'wrong.initial': ['Đây là {got}. Bé nghe nè: {word}! Mình tìm lại nhé!', 'Ồ, đây là {got}. Bé đọc chậm nhé: {word}!'],
      'wrong.any': ['Mình tìm lại nhé!', 'Bé thử cái khác nào!', 'Bé nghĩ thêm chút nữa nhé!', 'Cố lên, bé làm được mà!'],
      'needPick.bag': ['Bé chạm vào túi kem {color} trước nhé!', 'Kem {color} trước nè! Ở dưới này nè!', 'Mình chọn kem {color} trước nào!'],
      'needPick.cookie': ['Bé tìm đúng bánh ở dưới này trước nhé!', 'Bé chọn một cái bánh trước nào!', 'Bánh nào nhỉ? Bé chạm vào bánh ở dưới nhé!'],
      'needPick.any': ['Bé chọn ở dưới này trước nhé!', 'Bé chạm vào một cái ở dưới trước nào!', 'Bé chọn trước nhé!'],
      'finish': ['Rắc cốm nào!', 'Lấp lánh, lấp lánh! Cốm màu nè!', 'Lắc, lắc! Rắc cốm lên bánh nào!'],
      'hop': ['Lên giá cho nguội nào!', 'Nhảy, nhảy! Lên giá bánh nào!', 'Bánh nhảy lên giá cho nguội nè!'],
      'surprise.bird': ['Nhìn kìa! Có bạn chim nhỏ bên cửa sổ! Bé chạm vào nhé!', 'Bạn chim nhỏ bay qua kìa! Bé chạm vào nhé!'],
      'bird.tap': ['Chíp chíp! Cốm màu bay khắp nơi!', 'Hi hi! Bạn chim chào bé nè!', 'Chíp! Mưa cốm màu nè!'],
      'surprise.mouse': ['Ai đang ló ra từ bao bột nhỉ?', 'Nhìn kìa! Một bạn chuột nhắt! Bé chạm vào nhé!'],
      'mouse.tap': ['Phụt! Bột bay khắp nơi! Hi hi!', 'Chít chít! Bạn chuột cười khúc khích!', 'Phụt! Một đám mây bột!'],
      'pokeMochi': ['Hi hi! Nhột quá!', 'Chào bé! Mình là Mochi nè!'],

      'praise': ['Đúng rồi!', 'Giỏi quá!', 'Tuyệt vời!', 'Hoan hô!', 'Bé giỏi lắm!', 'Chính xác!', 'Siêu quá!', 'Hay lắm!'],
      'great': ['Bé {child} làm bánh giỏi quá!', 'Hoan hô bé {child}!', 'Bánh ngon quá!', 'Oa, bé {child} là thợ làm bánh tí hon!',
        'Hoan hô, bánh xong rồi!', 'Bé thông minh quá!', 'Bé là thợ làm bánh siêu giỏi!'],
      'party': ['Nhìn bánh của mình nè!', 'Hoan hô! Tiệm bánh ngon quá!', 'Bao nhiêu là bánh quy!'],
      'hint': ['Nhìn nè! Cái này đang lấp lánh.', 'Bé xem bàn tay nhỏ chỉ nè!', 'Mochi giúp bé nhé! Cái này nè!',
        'Nhìn kìa, cái này sáng lên!', 'Cái lấp lánh đó! Bé chạm vào nhé!'],
      'hint.path': ['Bé xem bàn tay nhỏ nè! Miết như vậy nhé!', 'Bé miết theo bàn tay nhỏ trên các chấm nhé!',
        'Nhìn kìa, các chấm đang sáng! Bé miết theo nhé!'],
      'idle': ['Mình làm bánh nào!', 'Mochi đang chờ bé nè!', 'Bánh đang chờ bé nè!', 'Bé {child} ơi, mình làm bánh tiếp nhé!',
        'Bánh muốn có kem nè!', 'Mình vẽ gì tiếp đây nhỉ?'],

      'talk.intro': 'Giờ trò chuyện!',
      'talk.colors': 'Cái nào {color} nhỉ?',
      'talk.colorsAny': 'Cái này màu gì nhỉ?',
      'talk.shapes': '{shape} ở đâu nhỉ?',
      'talk.shapesAny': 'Cái này hình gì nhỉ?',
      'talk.size': 'Cái bánh nào {size} nhỉ?',
      'talk.sizeAny': 'Cái bánh nào to nhỉ?',
      'talk.count': 'Có mấy hạt sô-cô-la nào?',
      'talk.countAny': 'Có mấy chấm tròn nào?',
      'talk.animals': '{animal} sống ở đâu nhỉ?',
      'talk.animalsFind': '{animal} ở đâu nhỉ?',
      'talk.animalsAny': 'Đây là con gì nhỉ?',
      'talk.home': 'Ai sống ở {home} nhỉ?',
      'talk.letters': 'Chữ {letter} ở đâu nhỉ?',
      'talk.lettersAny': 'Đây là chữ gì nào?',
      'talk.lower': 'Chữ {lower} thường ở đâu nhỉ? Bạn của chữ {letter} hoa đó!',
      'talk.lowerAny': 'Đây là chữ thường nào nhỉ?',
      'talk.initial': '{word} bắt đầu bằng chữ gì nhỉ?',
      'talk.initialAny': 'Con này bắt đầu bằng chữ gì nhỉ?',
      'talk.add': '{a} + {b} bằng mấy nhỉ?',
      'talk.sub': '{a} − {b} bằng mấy nhỉ?',
      'talk.calc': 'Kết quả là bao nhiêu nào?',
      'talk.oddeven': 'Số nào là số {parity} nhỉ?',
      'talk.oddevenAny': 'Số này chẵn hay lẻ nhỉ?',
      'talk.right': ['Đúng rồi! Bé giỏi quá!', 'Chính xác! Hoan hô!', 'Oa, bé biết rồi!', 'Đúng luôn! Siêu quá!',
        'Bé thông minh quá!', 'Đúng rồi, bé {child} ơi!'],
      'talk.wrong': 'Là {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.a': 'Là {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.animal': 'Là {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.home': 'Là {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.size': 'Là cái bánh {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.letter': 'Là chữ {letter} đó! Bé cố gắng lắm!',
      'talk.wrong.small': 'Là chữ {letter} thường đó! Bé cố gắng lắm!',
      'talk.wrong.number': 'Là số {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.any': 'Bé cố gắng lắm! Mình làm bánh tiếp nhé!',

      'session.done': ['Tiệm bánh ngon quá! {stars} ngôi sao!', 'Bé {child} giỏi quá! {stars} ngôi sao!',
        'Bé làm bao nhiêu là bánh! {stars} ngôi sao!']
    }
  };
  // count.0 … count.20: "One!" / "Một!" (each chocolate chip in a chips step)
  LANGS.forEach(function (l) {
    for (var i = 0; i <= MAX_COUNT; i++) {
      var w = NUM[l][i];
      STR[l]['count.' + i] = w.charAt(0).toUpperCase() + w.slice(1) + '!';
    }
  });
  // sound.<animal> ("Woof woof!" / "Gâu gâu!") and home.<animal> (the animal arrives home along the icing road)
  var HOME_LINES = {
    en: { dog: ['{s} The dog is home!', '{s} Home to the kennel!', '{s} Thank you!'],
      cat: ['{s} The cat is home!', '{s} A cosy basket!', '{s} Thank you!'],
      bee: ['{s} The bee is home!', '{s} Home to the beehive!', '{s} Thank you!'],
      bird: ['{s} The bird is home!', '{s} Home to the nest!', '{s} Thank you!'],
      frog: ['{s} The frog is home!', '{s} Splash! Into the pond!', '{s} Thank you!'],
      cow: ['{s} The cow is home!', '{s} Home to the barn!', '{s} Thank you!'],
      rabbit: ['{s} The rabbit is home!', '{s} Into the burrow!', '{s} Thank you!'],
      fish: ['{s} The fish is home!', '{s} Splash! Into the fish bowl!', '{s} Thank you!'],
      duck: ['{s} The duck is home!', '{s} Splash! Into the pond!', '{s} Thank you!'],
      pig: ['{s} The pig is home!', '{s} Home to the barn!', '{s} Thank you!'] },
    vi: { dog: ['{s} Cún về tới nhà rồi!', '{s} Về chuồng chó rồi nè!', '{s} Cảm ơn bé nhé!'],
      cat: ['{s} Mèo về tới nhà rồi!', '{s} Cái giỏ ấm áp quá!', '{s} Cảm ơn bé nhé!'],
      bee: ['{s} Ong về tới nhà rồi!', '{s} Về tổ ong rồi nè!', '{s} Cảm ơn bé nhé!'],
      bird: ['{s} Chim về tới nhà rồi!', '{s} Về tổ chim rồi nè!', '{s} Cảm ơn bé nhé!'],
      frog: ['{s} Ếch về tới nhà rồi!', '{s} Tõm! Nhảy xuống ao rồi!', '{s} Cảm ơn bé nhé!'],
      cow: ['{s} Bò về tới nhà rồi!', '{s} Về chuồng rồi nè!', '{s} Cảm ơn bé nhé!'],
      rabbit: ['{s} Thỏ về tới nhà rồi!', '{s} Chui vào hang rồi nè!', '{s} Cảm ơn bé nhé!'],
      fish: ['{s} Cá về tới nhà rồi!', '{s} Tõm! Vào bể cá rồi!', '{s} Cảm ơn bé nhé!'],
      duck: ['{s} Vịt về tới nhà rồi!', '{s} Tõm! Xuống ao rồi!', '{s} Cảm ơn bé nhé!'],
      pig: ['{s} Heo về tới nhà rồi!', '{s} Về chuồng rồi nè!', '{s} Cảm ơn bé nhé!'] }
  };
  LANGS.forEach(function (l) {
    ANIMALS.forEach(function (a) {
      STR[l]['sound.' + a] = SOUNDS[l][a];
      STR[l]['home.' + a] = HOME_LINES[l][a].map(function (s) { return s.replace('{s}', SOUNDS[l][a]); });
    });
  });
  STR.en['home.any'] = ['Home sweet home!', 'The {animal} is home!', 'Hooray! Home at last!'];
  STR.vi['home.any'] = ['Về tới nhà rồi!', '{animal} về tới nhà rồi!', 'Hoan hô! Về nhà rồi!'];

  // required params → fallback key when one is missing (checked AFTER derived params are filled in)
  var NEEDS = {
    'say.pick': ['color'], 'say.pick.shape': ['shape'], 'say.pick.size': ['size'], 'say.pick.animal': ['animal'],
    'say.pick.home': ['home'], 'say.pick.label': ['label'], 'say.pick.parity': ['num', 'parity'],
    'say.pick.initial': ['letter', 'word'], 'say.pick.sum': ['expr', 'ans'],
    'trace.done.stroke': ['color', 'stroke'], 'trace.done.shape': ['shape'], 'trace.done.size': ['size'],
    'trace.done.number': ['num'], 'trace.done.letter': ['label'], 'trace.done.initial': ['letter', 'word'],
    'trace.done.sum': ['expr', 'ans'], 'trace.done.parity': ['num', 'parity'], 'trace.done.road': ['home'],
    'chipsDone': ['num', 'chips'],
    'wrong.bag': ['got', 'want'], 'wrong.cookie': ['got', 'want'], 'wrong.animal': ['got', 'want', 'sound'], 'wrong.math': ['got'],
    'wrong.parity': ['num', 'parity'], 'wrong.initial': ['got', 'word'], 'needPick.bag': ['color'], 'home.any': ['animal'],
    'talk.colors': ['color'], 'talk.shapes': ['shape'], 'talk.size': ['size'], 'talk.animals': ['animal'],
    'talk.animalsFind': ['animal'], 'talk.home': ['home'], 'talk.letters': ['letter'], 'talk.lower': ['letter'],
    'talk.initial': ['word'], 'talk.add': ['a', 'b'], 'talk.sub': ['a', 'b'], 'talk.oddeven': ['parity'],
    'talk.wrong': ['answer'], 'talk.wrong.a': ['answer'], 'talk.wrong.animal': ['answer'], 'talk.wrong.home': ['answer'],
    'talk.wrong.size': ['answer'], 'talk.wrong.letter': ['letter'], 'talk.wrong.small': ['letter'], 'talk.wrong.number': ['answer']
  };
  Object.keys(PROMPTS).forEach(function (k) { NEEDS[k] = PROMPTS[k]; });
  var FALLBACK = { 'say.pick': 'say.pick.any', 'needPick.bag': 'needPick.any', 'home.any': 'home.any.0', 'chipsDone': 'chipsDone.any',
    'wrong.animal': 'wrong.cookie', 'p.colors': 'p.colors.any', 'p.trace': 'p.trace.any', 'p.road': 'p.trace.any',
    'p.chips': 'p.chips.any',
    'talk.colors': 'talk.colorsAny', 'talk.shapes': 'talk.shapesAny', 'talk.size': 'talk.sizeAny',
    'talk.animals': 'talk.animalsAny', 'talk.animalsFind': 'talk.animalsAny', 'talk.home': 'talk.animalsAny',
    'talk.letters': 'talk.lettersAny', 'talk.lower': 'talk.lowerAny', 'talk.initial': 'talk.initialAny',
    'talk.add': 'talk.calc', 'talk.sub': 'talk.calc', 'talk.oddeven': 'talk.oddevenAny' };
  STR.en['home.any.0'] = ['Home sweet home!', 'Hooray! Home at last!'];
  STR.vi['home.any.0'] = ['Về tới nhà rồi!', 'Hoan hô! Về nhà rồi!'];
  Object.keys(NEEDS).forEach(function (k) {
    if (FALLBACK[k]) return;
    if (/^p\./.test(k)) FALLBACK[k] = 'p.any';
    else if (/^say\.pick\./.test(k)) FALLBACK[k] = 'say.pick.any';
    else if (/^trace\.done\./.test(k)) FALLBACK[k] = 'trace.done.any';
    else if (/^talk\.wrong/.test(k)) FALLBACK[k] = 'talk.wrong.any';
    else if (/^wrong/.test(k)) FALLBACK[k] = 'wrong.any';
  });

  // p.trace {what:<kind word>} → the name kind and the params that may hold the value
  var WHAT_KIND = { stroke: { kind: 'stroke', from: ['stroke'] }, shape: { kind: 'shape', from: ['shape'] },
    number: { kind: 'number', from: ['n', 'num'] }, letter: { kind: 'letter', from: ['letter', 'text'] },
    home: { kind: 'home', from: ['home'] }, road: { kind: 'home', from: ['home'] }, animal: { kind: 'animal', from: ['animal'] },
    size: { kind: 'size', from: ['size'] }, glyph: { kind: 'text', from: ['text', 'letter', 'n'] } };
  var CHILD_FALLBACK = { en: 'friend', vi: 'bé' };
  var CHILD_PREFERRED = { 'ui.welcome': 1 };

  // ---------------------------------------------------------------- helpers
  function L(lang) { return lang === 'vi' ? 'vi' : 'en'; }
  function rnd(rng) {
    var v;
    try {
      if (rng && typeof rng.next === 'function') v = rng.next();
      else if (typeof rng === 'function') v = rng();
      else v = Math.random();
    } catch (e) { v = 0; }
    v = +v;
    return isFinite(v) ? Math.max(0, Math.min(0.999999, v)) : 0;
  }
  function stripMarks(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFC');
  }
  function capFirst(s) {
    return String(s).replace(/^(\s*[“"'(¡¿]*)(\p{Ll})/u, function (m, pre, ch) { return pre + ch.toUpperCase(); });
  }
  function upper(v) { return String(v).toUpperCase(); }
  function rawVal(v) {
    if (v && typeof v === 'object') { if ('value' in v) return v.value; if ('nameValue' in v) return v.nameValue; }
    return v;
  }
  function present(v) {
    if (v == null || v === '') return false;
    if (typeof v === 'object') { var r = rawVal(v); return r != null && r !== '' && r !== v; }
    return true;
  }
  function obj(o) { return (o && typeof o === 'object') ? o : {}; }
  function num(v) {
    v = rawVal(v);
    if (typeof v === 'number') return isFinite(v) ? Math.round(v) : null;
    if (typeof v !== 'string' || !/^\s*-?\d+\s*$/.test(v)) return null;
    return parseInt(v, 10);
  }
  function numberName(lang, n) {
    var v = parseInt(n, 10);
    if (isNaN(v)) return String(n);
    if (v >= 0 && v <= 20) return NUM[L(lang)][v];
    return String(v);
  }
  function splitOp(value) { // '2+3' / '2 + 3' → ['2','+','3'];  '7−2' / '7-2' → ['7','−','2']
    var m = String(value == null ? '' : value).replace(/\s+/g, '').match(/^(\d+)([+−\-–])(\d+)(=.*)?$/);
    return m ? [m[1], m[2] === '+' ? '+' : '−', m[3]] : null;
  }
  function exprText(value) { var p = splitOp(value); return p ? p[0] + ' ' + p[1] + ' ' + p[2] : String(value); }
  function exprWords(lang, value) {
    var p = splitOp(value);
    if (!p) return String(value);
    var op = p[1] === '+' ? (lang === 'vi' ? 'cộng' : 'plus') : (lang === 'vi' ? 'trừ' : 'minus');
    return numberName(lang, p[0]) + ' ' + op + ' ' + numberName(lang, p[2]);
  }
  function isLetter(s) { return typeof s === 'string' && /^\p{L}$/u.test(s); }
  function low(v) { var r = rawVal(v); return String(r == null ? '' : r).toLowerCase(); }
  function keyOf(v) { return low(v).replace(/\.svg$/, '').replace(/[\s\-]+/g, '_'); }

  function animalOf(v) {
    if (v && typeof v === 'object') v = v.animal != null ? v.animal : rawVal(v);
    if (v == null) return null;
    var s = keyOf(v).replace(/^animal_/, '').replace(/^cookie_/, '');
    return ANIMALS.indexOf(s) >= 0 ? s : null;
  }
  function homeOf(v) {
    if (v && typeof v === 'object') v = v.home != null ? v.home : rawVal(v);
    if (v == null) return null;
    var s = keyOf(v).replace(/^home_/, '');
    return HOMES.indexOf(s) >= 0 ? s : null;
  }
  function strokeOf(v) { var s = keyOf(v); return STROKES.indexOf(s) >= 0 ? s : null; }
  function sizeOf(v) {
    var s = low(v);
    if (/(^|[_:\-\s])(big|large)($|[_:\-\s])/.test(s)) return 'big';
    if (/(^|[_:\-\s])(small|little)($|[_:\-\s])/.test(s)) return 'small';
    return null;
  }
  function chipsName(lang, n) { return CHIPS[lang][n === 1 ? 0 : 1]; }

  // ---- words for the 'initial' topic: tolerant of whatever shape content.js gives IB.WORDS
  function normEntry(e, lang) {
    if (e == null) return null;
    if (typeof e === 'string') return { word: e, id: e };
    if (typeof e !== 'object') return null;
    var w = e[lang], out = { id: e.id, animal: e.animal, initial: e.initial, word: e.word };
    if (typeof w === 'string') out.word = w;
    else if (w && typeof w === 'object') { out.word = w.word || w.text; if (w.initial) out.initial = w.initial; }
    if (out.initial && typeof out.initial === 'object') out.initial = out.initial[lang];
    if (out.word == null && e.text != null) out.word = e.text;
    if (out.word == null) return null;
    out.word = String(out.word);
    if (!out.animal) out.animal = animalOf(e.sprite) || animalOf(out.id) || null;
    return out;
  }
  function entries(lang) {
    var src = IB.WORDS, list = [];
    if (src && Array.isArray(src[lang])) list = src[lang];
    else if (Array.isArray(src)) list = src;
    var out = [];
    for (var i = 0; i < list.length; i++) { var e = normEntry(list[i], lang); if (e) out.push(e); }
    return out;
  }
  function findEntry(lang, v) {
    if (v && typeof v === 'object') v = v.word != null ? v.word : rawVal(v) != null ? rawVal(v) : v.id;
    if (v == null || v === '') return null;
    var s = String(v), i, k;
    var pools = [entries(lang), defaultEntries(lang)];
    for (k = 0; k < pools.length; k++) for (i = 0; i < pools[k].length; i++) {
      var e = pools[k][i];
      if (e.word === s || String(e.id) === s || e.animal === s) return e;
    }
    return null;
  }
  function wordName(lang, v) {
    var a = animalOf(v);
    if (a) return NAMES[lang].word[a];
    var e = findEntry(lang, v);
    if (e) return e.word;
    var r = rawVal(v);
    return String(r == null ? '' : r).replace(/_/g, ' ');
  }
  function initialOf(lang, animalOrWord) {
    var w = wordName(lang, animalOrWord);
    if (!w) return null;
    var e = findEntry(lang, animalOrWord) || findEntry(lang, w);
    var f = e && e.initial ? e.initial : (lang === 'vi' ? viInitial(w) : stripMarks(w).charAt(0).toUpperCase());
    return { word: w, first: String(f) };
  }

  function name(lang, kind, value, opts) {
    lang = L(lang);
    opts = opts || {};
    value = rawVal(value);
    var tbl;
    switch (kind) {
      case 'number': return numberName(lang, value);
      case 'dots': {
        var n = num(value);
        return n == null ? String(value) : numberName(lang, n) + ' ' + DOT[lang][n === 1 ? 0 : 1];
      }
      case 'letter': {
        var s = String(value);
        if (lang === 'vi') return LETTER_VI[upper(s)] || s.toLowerCase();
        return s;
      }
      case 'sum': case 'diff': return exprWords(lang, value);
      case 'text': {
        var tx = String(value);
        if (splitOp(tx)) return exprWords(lang, tx);
        if (num(tx) != null) return numberName(lang, num(tx));
        if (isLetter(tx)) return name(lang, 'letter', tx);
        if (animalOf(tx)) return NAMES[lang].animal[animalOf(tx)];
        if (tx === 'odd' || tx === 'even') return NAMES[lang].parity[tx];
        return tx;
      }
      case 'word': return wordName(lang, value);
      case 'color': case 'hue': {
        var c = low(value);
        tbl = (kind === 'hue' || opts.bare) ? NAMES[lang].hue : NAMES[lang].color;
        return tbl[c] != null ? tbl[c] : String(value);
      }
      case 'animal': {
        var a = animalOf(value);
        if (!a) return String(value == null ? '' : value).replace(/_/g, ' ');
        var sz = opts.size ? sizeOf(opts.size) : null;
        if (!sz) return NAMES[lang].animal[a];
        return lang === 'vi' ? NAMES.vi.animal[a] + ' ' + NAMES.vi.size[sz] : NAMES.en.size[sz] + ' ' + NAMES.en.animal[a];
      }
      case 'home': { var h = homeOf(value); return h ? NAMES[lang].home[h] : String(value == null ? '' : value).replace(/_/g, ' '); }
      case 'stroke': { var st = strokeOf(value); return st ? NAMES[lang].stroke[st] : String(value == null ? '' : value).replace(/_/g, ' '); }
      case 'size': { var sz2 = sizeOf(value); return sz2 ? NAMES[lang].size[sz2] : String(value); }
      case 'parity': {
        if (num(value) != null) return numberName(lang, num(value));
        tbl = NAMES[lang].parity;
        return tbl[value] != null ? tbl[value] : String(value);
      }
      default:
        tbl = NAMES[lang][kind];
        if (tbl && tbl[value] != null) return tbl[value];
        return String(value == null ? '' : value);
    }
  }

  function addForms(out, list) {
    for (var i = 0; i < list.length; i++) {
      var w = String(list[i]).toLowerCase();
      if (!w) continue;
      if (out.indexOf(w) < 0) out.push(w);
      var s = stripMarks(w);
      if (out.indexOf(s) < 0) out.push(s);
    }
    return out;
  }
  function numberWords(lang, n) {
    var v = parseInt(n, 10), out = [];
    if (isNaN(v)) return addForms(out, [String(n)]);
    out.push(String(v));
    if (v >= 0 && v <= 20 && !(lang === 'vi' && v === 0)) addForms(out, [NUM[lang][v]]);
    if (lang === 'vi') addForms(out, ['số ' + NUM.vi[v]]);
    var alt = NUM_ALT[lang][v];
    if (alt) addForms(out, alt);
    return out;
  }

  // a Talk-time choice / picture thing → [kind, value]: {kind:'blob', color} → color; {kind:'shape', shape}; {kind:'size',
  // size}; {kind:'animal', animal}; {kind:'home', home}; {kind:'number'|'dots', n}; {kind:'letter', text};
  // {kind:'cookie', ck|…ck} (shape / animal / home / glyph cookie); {nameKind, nameValue}; {id, thing, value}
  function kvOf(t) {
    t = obj(t);
    if (t.thing && typeof t.thing === 'object') return kvOf(t.thing);
    if (t.nameKind != null) return [t.nameKind, t.nameValue];
    switch (t.kind) {
      case 'blob': case 'color': case 'bag': return ['color', t.color != null ? t.color : t.value];
      case 'shape': return ['shape', t.shape != null ? t.shape : t.value];
      case 'stroke': return ['stroke', t.stroke != null ? t.stroke : (t.id != null ? t.id : t.value)];
      case 'size': return ['size', t.size != null ? t.size : t.value];
      case 'animal': return ['animal', t.animal != null ? t.animal : t.value];
      case 'home': return ['home', t.home != null ? t.home : t.value];
      case 'number': case 'dots': return ['number', t.n != null ? t.n : t.value];
      case 'letter': return ['letter', t.text != null ? t.text : t.value];
      case 'parity': return ['parity', t.value];
      case 'text': return ['text', t.text != null ? t.text : t.value];
      case 'glyph': {
        var g = t.text != null ? t.text : t.value;
        return num(g) != null ? ['number', num(g)] : ['letter', g];
      }
      case 'round': return ['size', t.size != null ? t.size : t.value];
      case 'cookie': {
        var ck = obj(t.ck && typeof t.ck === 'object' ? t.ck : null);
        if (!ck.kind) ck = Object.assign({}, t, { kind: t.shape ? 'shape' : t.animal ? 'animal' : t.home ? 'home' : t.text != null ? 'glyph' : 'round' });
        if (ck.kind === 'cookie') ck.kind = 'round';
        if (ck.size == null && t.size != null) ck.size = t.size;
        return kvOf(ck);
      }
    }
    return [t.kind, t.value];
  }
  function words(lang, kind, value) {
    lang = L(lang);
    if (kind && typeof kind === 'object') { var kv = kvOf(kind); kind = kv[0]; value = kv[1]; }
    if (kind === 'blob') kind = 'color';
    value = rawVal(value);
    var out = [];
    switch (kind) {
      case 'number': return numberWords(lang, value);
      case 'dots': {
        var dn = num(value);
        out = numberWords(lang, value);
        if (dn != null) addForms(out, [name(lang, 'dots', dn), dn + ' ' + DOT[lang][dn === 1 ? 0 : 1]]);
        return out;
      }
      case 'parity': if (num(value) != null) return numberWords(lang, num(value)); break;
      case 'text': {
        var tx = String(value);
        if (splitOp(tx)) return words(lang, 'sum', tx);
        if (num(tx) != null) return numberWords(lang, num(tx));
        if (isLetter(tx)) return words(lang, 'letter', tx);
        if (animalOf(tx)) return words(lang, 'animal', tx);
        if (tx === 'odd' || tx === 'even') return words(lang, 'parity', tx);
        return addForms(out, [tx]);
      }
      case 'letter': {
        var U = upper(value);
        var base = [U.toLowerCase(), 'letter ' + U.toLowerCase(), 'chữ ' + U.toLowerCase()];
        if (lang === 'vi') {
          base.push(LETTER_VI[U] || U.toLowerCase());
          if (LETTER_VI[U]) base.push('chữ ' + LETTER_VI[U]);
          base = base.concat(LETTER_WORDS_VI[U] || []);
          // no stripped forms: Ă/Â≠A, Đ≠D, Ê≠E, Ô/Ơ≠O, Ư≠U
          base.forEach(function (w) { w = w.toLowerCase(); if (out.indexOf(w) < 0) out.push(w); });
          return out;
        }
        base = base.concat(LETTER_WORDS_EN[U] || []);
        if (LETTER_SPEECH_EN[U]) base.push(LETTER_SPEECH_EN[U]);
        return addForms(out, base);
      }
      case 'sum': case 'diff': {
        var p = splitOp(value);
        if (!p) return addForms(out, [String(value)]);
        return addForms(out, [exprWords(lang, value), p[0] + ' ' + (p[1] === '+' ? (lang === 'vi' ? 'cộng' : 'plus') :
          (lang === 'vi' ? 'trừ' : 'minus')) + ' ' + p[2]]);
      }
      case 'word': {
        var a = animalOf(value) || (findEntry(lang, value) || {}).animal;
        var list = [wordName(lang, value)];
        if (a) list = list.concat([NAMES[lang].animal[a]], WORDS[lang].animal[a] || []);
        return addForms(out, list);
      }
      case 'animal': {
        var an = animalOf(value);
        if (!an) return addForms(out, [String(value)]);
        return addForms(out, [NAMES[lang].animal[an], NAMES[lang].word[an]].concat(WORDS[lang].animal[an] || []));
      }
      case 'home': {
        var hm = homeOf(value);
        if (!hm) return addForms(out, [String(value)]);
        return addForms(out, [NAMES[lang].home[hm]].concat(WORDS[lang].home[hm] || []));
      }
      case 'stroke': {
        var sk = strokeOf(value);
        if (!sk) return addForms(out, [String(value)]);
        return addForms(out, [NAMES[lang].stroke[sk]].concat(WORDS[lang].stroke[sk] || []));
      }
      case 'color': case 'hue': {
        var c = low(value);
        if (NAMES.en.color[c] == null) return addForms(out, [String(value)]);
        return addForms(out, [NAMES[lang].color[c], NAMES[lang].hue[c]].concat(WORDS[lang].color[c] || []));
      }
      case 'size': {
        var sz = sizeOf(value);
        if (!sz) return addForms(out, [String(value)]);
        return addForms(out, [NAMES[lang].size[sz]].concat(WORDS[lang].size[sz] || []));
      }
    }
    var nm = NAMES[lang][kind] && NAMES[lang][kind][value];
    var extra = WORDS[lang][kind] && WORDS[lang][kind][value];
    var l2 = [];
    if (nm) l2.push(nm);
    if (extra) l2 = l2.concat(extra);
    if (!l2.length) l2.push(String(value));
    return addForms(out, l2);
  }

  // ---------------------------------------------------------------- phrase: a thing named for a sentence
  // thing = {nameKind, nameValue, size?, animal?} | {kind, value}. EN gets "the" where natural; VI the plain name.
  function thingOf(a, b) {
    if (typeof a === 'string') return { k: a, v: b };
    var t = obj(a);
    if (t.nameKind == null && t.kind != null && !('value' in t)) { var kv = kvOf(t); return { k: kv[0], v: kv[1], size: t.size }; }
    return { k: t.nameKind != null ? t.nameKind : t.kind, v: t.nameValue != null ? t.nameValue : t.value,
      size: t.size, animal: t.animal, text: t.text };
  }
  function phraseOf(lang, th) {
    var vi = lang === 'vi', k = th.k, v = th.v, out = '';
    switch (k) {
      case 'color': case 'hue': out = name(lang, 'color', v); break;
      case 'shape': out = vi ? name(lang, 'shape', v) : 'the ' + name(lang, 'shape', v); break;
      case 'stroke': out = vi ? name(lang, 'stroke', v) : 'the ' + name(lang, 'stroke', v); break;
      case 'home': out = vi ? name(lang, 'home', v) : 'the ' + name(lang, 'home', v); break;
      case 'animal': case 'word':
        out = vi ? name(lang, 'animal', v, { size: th.size }) : 'the ' + name(lang, 'animal', v, { size: th.size }); break;
      case 'size': {
        var a = animalOf(th.animal);
        if (a) out = vi ? name(lang, 'animal', a, { size: v }) : 'the ' + name(lang, 'animal', a, { size: v });
        else out = vi ? 'cái bánh ' + name(lang, 'size', v) : 'the ' + name(lang, 'size', v) + ' cookie';
        break;
      }
      case 'letter': {
        var s = String(v == null ? th.text : v);
        var small = s !== s.toUpperCase();
        out = vi ? 'chữ ' + s + (small ? ' thường' : '') : (small ? 'small ' : 'letter ') + s;
        break;
      }
      case 'number': case 'parity':
        if (num(v) != null) out = vi ? 'số ' + numberName(lang, num(v)) : 'number ' + numberName(lang, num(v));
        else out = vi ? 'số ' + name(lang, 'parity', v) : name(lang, 'parity', v);
        break;
      case 'sum': case 'diff': out = exprText(v); break;
      case 'text': case 'glyph': {
        var tx = String(v == null ? th.text : v);
        if (splitOp(tx)) out = exprText(tx);
        else if (num(tx) != null) return phraseOf(lang, { k: 'number', v: num(tx) });
        else if (isLetter(tx)) return phraseOf(lang, { k: 'letter', v: tx });
        else out = tx;
        break;
      }
      default: out = v == null ? '' : String(v).replace(/_/g, ' ');
    }
    return lang === 'en' ? anFix(out) : out;
  }

  // ---------------------------------------------------------------- t()
  var I18N = { langs: LANGS.slice(), child: '' };

  function derive(lang, params, key) {
    var p = {}, k;
    if (params && typeof params === 'object') for (k in params) if (Object.prototype.hasOwnProperty.call(params, k)) p[k] = params[k];
    key = key || '';
    // {hue} = bare colour (vi "đỏ")
    if (!present(p.hue) && present(p.color)) p.hue = name(lang, 'hue', rawVal(p.color));
    // {word} + {sound} from animal; {home} from animal (p.road / trace.done.road)
    var an = present(p.animal) ? animalOf(p.animal) : null;
    if (an && !present(p.word)) p.word = wordName(lang, an);
    if (present(p.word)) p.word = wordName(lang, p.word);
    if (an && !present(p.sound)) p.sound = SOUNDS[lang][an];
    if (an && !present(p.home) && /road|^talk\.home/.test(key)) p.home = HOME_OF[an];
    // {letter} / {lower}
    if (!present(p.letter) && present(p.text) && isLetter(String(rawVal(p.text)))) p.letter = String(rawVal(p.text));
    if (present(p.letter)) {
      p.letter = String(rawVal(p.letter));
      if (/^(p|talk)\.lower$/.test(key)) { p.lower = p.letter.toLowerCase(); p.letter = p.letter.toUpperCase(); }
      if (!present(p.lower)) p.lower = p.letter.toLowerCase();
    }
    if (present(p.lower)) p.lower = String(rawVal(p.lower));
    // {expr}
    if (!present(p.expr)) {
      var ex = present(p.text) && splitOp(rawVal(p.text)) ? rawVal(p.text) : present(p.sum) ? rawVal(p.sum) :
        present(p.diff) ? rawVal(p.diff) : null;
      if (ex == null && present(p.a) && present(p.b) && present(p.op)) ex = rawVal(p.a) + rawVal(p.op) + rawVal(p.b);
      if (ex != null) p.expr = exprText(ex);
    } else p.expr = exprText(rawVal(p.expr));
    if (present(p.a)) p.a = String(rawVal(p.a));
    if (present(p.b)) p.b = String(rawVal(p.b));
    // {num} from n; {chips} plural-aware with n
    var c = present(p.n) ? num(p.n) : null;
    if (!present(p.num) && c != null) p.num = numberName(lang, c);
    if (present(p.n) && typeof p.n === 'object') p.n = c != null ? c : '';
    if (!present(p.chips) && c != null) p.chips = chipsName(lang, c);
    // {what} as a bare name-kind word (content.js: {what:'stroke', value:'wave', stroke:'wave'}): name the thing from
    // `value` or from the param named like the kind (stroke / shape / n / letter / home / animal / size)
    if (typeof p.what === 'string' && WHAT_KIND[p.what]) {
      var wk = WHAT_KIND[p.what], wv = present(p.value) ? rawVal(p.value) : null;
      if (wv == null) for (var wi = 0; wi < wk.from.length && wv == null; wi++) if (present(p[wk.from[wi]])) wv = rawVal(p[wk.from[wi]]);
      if (wv == null && p.what === 'road' && an) wv = HOME_OF[an];
      if (wv != null && p.what === 'road' && homeOf(wv)) p.what = lang === 'vi' ? 'con đường tới ' + name(lang, 'home', wv) : 'the road to the ' + name(lang, 'home', wv);
      else p.what = wv != null ? { nameKind: wk.kind, nameValue: wv } : null;
    }
    // {got}/{want}/{label}/{what}/{answer-as-thing} objects → phrases
    ['got', 'want', 'label', 'what'].forEach(function (q) {
      if (p[q] && typeof p[q] === 'object') p[q] = present(p[q]) || p[q].kind ? phraseOf(lang, thingOf(p[q])) : '';
    });
    return p;
  }

  function resolveParam(lang, key, val) {
    if (!present(val)) return '';
    if (typeof val === 'object') {
      var kd = val.kind != null ? val.kind : val.nameKind;
      return kd ? name(lang, kd, rawVal(val)) : '';
    }
    switch (key) {
      case 'color': case 'shape': case 'size': case 'animal': case 'parity': case 'home': case 'stroke':
        return name(lang, key, val);
      default: return String(val);
    }
  }

  // English "a oval" → "an oval", but never the LETTER A. No regex look-behind (iOS < 16.4).
  function anFix(s) {
    return String(s).replace(/(^|[\s"“(])([Aa]) (?=[aeiou]|8\b|11\b|18\b)/g, function (m, pre, a, off, str) {
      if (/letter\s*$/i.test(str.slice(0, off + pre.length))) return m;
      return pre + a + 'n ';
    }).replace(/(^|[\s"“(])([Aa])n (?=[bcdfghjklmnpqrstvwxyz]|even\b)/g, function (m, pre, a, off, str) {
      // "an even" stays "an even"; "an {parity}" with parity "even" is right; only "an" before a consonant word → "a"
      if (/^even\b/.test(str.slice(off + m.length))) return m;
      return pre + a + ' ';
    });
  }

  function fill(lang, str, params, child) {
    if (!child) str = str.replace(/(bé|Bé) \{child\}/g, '$1').replace(/, \{child\}([!?.])/g, '$1');
    var out = str.replace(/\{(\w+)\}/g, function (m, k) {
      if (k === 'child') return child || CHILD_FALLBACK[lang];
      return resolveParam(lang, k, params ? params[k] : null);
    });
    out = out.replace(/\s+([,.!?…])/g, '$1').replace(/\s{2,}/g, ' ').replace(/,\s*([!?.])/g, '$1')
      .replace(/(^|[.!?]\s*)—\s*/g, '$1').replace(/\s—\s*([!?.])/g, '$1').trim();
    if (lang === 'en') out = anFix(out);
    out = out.replace(/([.!?:]\s+)(\p{Ll})/gu, function (m, pre, ch) { return pre + ch.toUpperCase(); });
    return capFirst(out);
  }

  function needsMet(key, params) {
    var need = NEEDS[key];
    if (!need) return true;
    for (var i = 0; i < need.length; i++) if (!present(params ? params[need[i]] : null)) return false;
    return true;
  }

  I18N.t = function (lang, key, params, rng) {
    lang = L(lang);
    key = String(key == null ? '' : key);
    if (STR[lang][key] == null && STR.en[key] == null && /^p\./.test(key)) key = 'p.any';
    var p = derive(lang, params, key);
    for (var hop = 0; hop < 4 && !needsMet(key, p) && FALLBACK[key]; hop++) {
      key = FALLBACK[key];
      p = derive(lang, params, key);
    }
    var v = STR[lang][key];
    if (v == null) v = STR.en[key];
    if (v == null) return key;
    var child = p.child != null ? String(p.child).trim() : String(I18N.child || '').trim();
    if (Array.isArray(v)) {
      var withChild = v.filter(function (s) { return s.indexOf('{child}') >= 0; });
      var noChild = v.filter(function (s) { return s.indexOf('{child}') < 0; });
      var pool = v;
      if (!child) { if (noChild.length) pool = noChild; }
      else if (CHILD_PREFERRED[key] && withChild.length) pool = withChild;
      v = pool[Math.min(pool.length - 1, Math.floor(rnd(rng) * pool.length))];
    }
    return fill(lang, v, p, child);
  };

  I18N.name = name;
  I18N.words = words;
  I18N.numberName = numberName;
  I18N.stripMarks = stripMarks;
  I18N.has = function (lang, key) { return STR[L(lang)][key] != null; };
  I18N.keys = function (lang) { return Object.keys(STR[L(lang)]); };
  I18N.raw = function (lang, key) { return STR[L(lang)][key]; };
  I18N.setChild = function (nm) { I18N.child = nm ? String(nm).trim().slice(0, 24) : ''; };
  I18N.wordEntry = function (lang, v) { return findEntry(L(lang), v); };
  I18N.initialOf = function (lang, v) { return initialOf(L(lang), v); };
  I18N.phrase = function (lang, a, b) { return phraseOf(L(lang), thingOf(a, b)); };
  I18N.choiceWords = function (lang, choice) { return words(lang, choice); };   // Talk choice {id, thing} → spoken forms
  I18N.kindValue = kvOf;
  I18N.TOPICS = TOPICS.slice();
  I18N.ANIMALS = ANIMALS.slice();
  I18N.HOMES = HOMES.slice();
  I18N.HOME_OF = HOME_OF;
  I18N.STROKES = STROKES.slice();
  I18N.NAME_KINDS = NAME_KINDS.slice();
  I18N.PROMPTS = PROMPTS;
  I18N.PARAMS = NEEDS;
  I18N.NAME_TABLE = NAMES;
  I18N.SOUNDS = SOUNDS;
  I18N.LETTER_VI = LETTER_VI;
  I18N.WORD_LIST = WORD_LIST;
  I18N.MAX_COUNT = MAX_COUNT;

  // ---------------------------------------------------------------- game lines
  // the thing an event / choice / step is about: {k, v, size, text}
  function infoOf(ev) {
    ev = obj(ev);
    var c = obj(ev.choice && typeof ev.choice === 'object' ? ev.choice : ev);
    if (c.nameKind != null) return { k: c.nameKind, v: c.nameValue, size: c.size };
    if (c.ck && typeof c.ck === 'object') { var kv = kvOf({ kind: 'cookie', ck: c.ck, size: c.size }); return { k: kv[0], v: kv[1], size: c.size }; }
    if (ev.nameKind != null) return { k: ev.nameKind, v: ev.nameValue, size: ev.size };
    return { k: null, v: null };
  }
  function topicLine(lang, prefix, info, ev, rng) {
    // the know-it / write-it lines that depend on the chapter topic (initial / oddeven / add / sub)
    var topic = ev.topic, n = num(info.v), pr = obj(ev.params);
    if (topic === 'oddeven' && n != null) return I18N.t(lang, prefix + '.parity', { n: n, parity: n % 2 ? 'odd' : 'even' }, rng);
    if ((topic === 'add' || topic === 'sub') && n != null) {
      var a = num(pr.a), b = num(pr.b);
      if (a != null && b != null) return I18N.t(lang, prefix + '.sum', { expr: a + (topic === 'add' ? '+' : '−') + b, ans: numberName(lang, n) }, rng);
    }
    if (topic === 'initial' && info.k === 'letter' && info.v != null) {
      var w = pr.word != null ? pr.word : pr.animal;
      if (w != null && wordName(lang, w)) return I18N.t(lang, prefix + '.initial', { letter: String(info.v), word: wordName(lang, w) }, rng);
    }
    return null;
  }

  // `pick {id, kind:'bag'|'cookie', color?}` + the choice ({nameKind, nameValue} or ck) → "Red icing!", "The triangle!",
  // "The dog! Woof woof!", "Letter B!", "Number three!", "D is for dog!", "2 + 3 is five!", "Seven is odd!"
  I18N.sayPick = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var info = infoOf(ev);
    var color = ev.color != null ? ev.color : obj(ev.choice).color;
    if (ev.kind === 'bag' || info.k === 'color' || (!info.k && color != null)) {
      return I18N.t(lang, 'say.pick', { color: color != null ? color : (info.k === 'color' ? info.v : null) }, rng);
    }
    var tl = topicLine(lang, 'say.pick', info, ev, rng);
    if (tl) return tl;
    switch (info.k) {
      case 'shape': return I18N.t(lang, 'say.pick.shape', { shape: info.v }, rng);
      case 'size': return I18N.t(lang, 'say.pick.size', { size: info.v }, rng);
      case 'animal': return I18N.t(lang, 'say.pick.animal', { animal: info.v }, rng);
      case 'home': return I18N.t(lang, 'say.pick.home', { home: info.v }, rng);
      case 'letter': case 'number': case 'text': case 'glyph': case 'sum': case 'diff': case 'parity':
        if (info.v == null) break;
        return I18N.t(lang, 'say.pick.label', { label: phraseOf(lang, { k: info.k, v: info.v }) }, rng);
    }
    return I18N.t(lang, 'say.pick.any', null, rng);
  };

  // `traceDone` — ev = the trace step (main: world.stepInfo / round.steps[i]) {path:{kind,id|shape|text}, color,
  // nameKind?, nameValue?} + topic + params. "A red wave! Beautiful!", "A lovely triangle!", "You piped number three!"
  I18N.sayTraceDone = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var path = obj(ev.path), pr = obj(ev.params), topic = ev.topic;
    var kind = path.kind;
    if (!kind && ev.nameKind === 'stroke') kind = 'stroke';
    if (topic === 'size' || (ev.nameKind === 'size' && kind !== 'stroke')) {
      var sz = sizeOf(pr.size || (ev.nameKind === 'size' ? ev.nameValue : null) || ev.size);
      if (sz) return I18N.t(lang, 'trace.done.size', { size: sz }, rng);
    }
    switch (kind) {
      case 'stroke': return I18N.t(lang, 'trace.done.stroke', { color: ev.color || pr.color, stroke: path.id || pr.stroke || ev.nameValue }, rng);
      case 'shape': return I18N.t(lang, 'trace.done.shape', { shape: path.shape || pr.shape }, rng);
      case 'road': {
        var hm = path.home || pr.home || ev.home || (animalOf(pr.animal) ? HOME_OF[animalOf(pr.animal)] : null);
        return I18N.t(lang, 'trace.done.road', { home: hm }, rng);
      }
      case 'glyph': {
        var tx = path.text != null ? String(path.text) : null;
        if (tx == null) break;
        var info = num(tx) != null ? { k: 'number', v: num(tx) } : { k: 'letter', v: tx };
        var tl = topicLine(lang, 'trace.done', info, ev, rng);
        if (tl) return tl;
        if (info.k === 'number') return I18N.t(lang, 'trace.done.number', { n: info.v }, rng);
        return I18N.t(lang, 'trace.done.letter', { label: phraseOf(lang, info) }, rng);
      }
    }
    if (ev.nameKind === 'shape') return I18N.t(lang, 'trace.done.shape', { shape: ev.nameValue }, rng);
    return I18N.t(lang, 'trace.done.any', null, rng);
  };

  // `wrong {kind:'bag'|'cookie', got:{nameKind,nameValue,size?}, want:{…}}` → names what was tapped, then the goal.
  // Maths never names the right answer; parity says what the tapped number is; initial says the word again.
  I18N.sayWrong = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var got = thingOf(ev.got), want = thingOf(ev.want), topic = ev.topic, pr = obj(ev.params);
    if (ev.kind === 'bag' || ev.kind === 'color' || got.k === 'color' || want.k === 'color') {
      return I18N.t(lang, 'wrong.bag', { got: got.v != null ? { kind: 'color', value: got.v } : null,
        want: want.v != null ? { kind: 'color', value: want.v } : null }, rng);
    }
    var gotTx = got.v != null ? got.v : got.text, gn = num(gotTx);
    if (topic === 'add' || topic === 'sub' || want.k === 'sum' || want.k === 'diff' || (want.k === 'text' && splitOp(want.v))) {
      return I18N.t(lang, 'wrong.math', { got: gotTx != null ? (gn != null ? phraseOf(lang, { k: 'number', v: gn }) : phraseOf(lang, got)) : null }, rng);
    }
    if ((topic === 'oddeven' || want.k === 'parity') && gn != null)
      return I18N.t(lang, 'wrong.parity', { n: gn, parity: gn % 2 ? 'odd' : 'even' }, rng);
    if (topic === 'initial' && got.k && got.v != null) {
      var w = pr.word != null ? pr.word : pr.animal != null ? pr.animal : (want.k === 'animal' || want.k === 'word' ? want.v : null);
      if (w != null && wordName(lang, w)) return I18N.t(lang, 'wrong.initial', { got: phraseOf(lang, got), word: wordName(lang, w) }, rng);
    }
    if (got.k && got.v != null && want.k && want.v != null) {
      if (got.k === 'animal' && want.k === 'animal' && got.v === want.v && !(got.size && want.size)) return I18N.t(lang, 'wrong.any', null, rng);
      if (got.k === 'animal' && animalOf(got.v) && !got.size)
        return I18N.t(lang, 'wrong.animal', { got: phraseOf(lang, got), want: phraseOf(lang, want), sound: SOUNDS[lang][animalOf(got.v)] }, rng);
      return I18N.t(lang, 'wrong.cookie', { got: phraseOf(lang, got), want: phraseOf(lang, want) }, rng);
    }
    return I18N.t(lang, 'wrong.any', null, rng);
  };

  // `needPick` — main passes the step: {mode:'pickBag'|'pickCookie', color?} → "First tap the red icing bag!"
  I18N.sayNeedPick = function (lang, ev, rng) {
    ev = obj(ev);
    var mode = ev.mode || '';
    var color = ev.color != null ? ev.color : (obj(ev.want).nameKind === 'color' ? ev.want.nameValue : null);
    if (/bag/i.test(mode) || (color != null && !/cookie/i.test(mode))) return I18N.t(lang, 'needPick.bag', { color: color }, rng);
    if (/cookie/i.test(mode)) return I18N.t(lang, 'needPick.cookie', null, rng);
    return I18N.t(lang, 'needPick.any', null, rng);
  };
  // `chipsDone {n}` → "Three chocolate chips! Yummy!"
  I18N.sayChipsDone = function (lang, ev, rng) {
    ev = obj(ev);
    var n = num(ev.n != null ? ev.n : ev.need);
    return I18N.t(lang, 'chipsDone', n != null ? { n: n } : null, rng);
  };
  // `home {animal}` → "Woof woof! The dog is home!"
  I18N.sayHome = function (lang, ev, rng) {
    lang = L(lang);
    var a = animalOf(ev && typeof ev === 'object' ? (ev.animal != null ? ev.animal : ev) : ev);
    if (a) return I18N.t(lang, 'home.' + a, null, rng);
    return I18N.t(lang, 'home.any.0', null, rng);
  };
  I18N.sound = function (lang, animal) { var a = animalOf(animal); return a ? SOUNDS[L(lang)][a] : ''; };

  // Counting aloud: i → "One!" … "Twenty!" (beyond: the digits)
  I18N.sayCount = function (lang, i) {
    lang = L(lang);
    var c = num(i);
    if (c == null) return I18N.t(lang, 'praise');
    if (STR[lang]['count.' + c]) return STR[lang]['count.' + c];
    return capFirst(numberName(lang, c)) + '!';
  };

  I18N.talkWrong = function (lang, kind, value) {
    lang = L(lang);
    if (kind && typeof kind === 'object') { var kv = kvOf(kind); kind = kv[0]; value = kv[1]; }
    if (kind === 'blob') kind = 'color';
    if (value == null || value === '') return I18N.t(lang, 'talk.wrong.any');
    var ans = { answer: { kind: kind, value: value } };
    if (kind === 'animal') return animalOf(value) ? I18N.t(lang, 'talk.wrong.animal', ans) : I18N.t(lang, 'talk.wrong', { answer: String(value) });
    if (kind === 'home') return homeOf(value) ? I18N.t(lang, 'talk.wrong.home', ans) : I18N.t(lang, 'talk.wrong', { answer: String(value) });
    if (kind === 'shape' || kind === 'stroke') return I18N.t(lang, lang === 'en' ? 'talk.wrong.a' : 'talk.wrong', ans);
    if (kind === 'size') return I18N.t(lang, 'talk.wrong.size', ans);
    if (kind === 'letter') {
      var lv = String(value);
      return I18N.t(lang, lv !== lv.toUpperCase() ? 'talk.wrong.small' : 'talk.wrong.letter', { letter: lv });
    }
    if (kind === 'number' || kind === 'dots' || (kind === 'parity' && num(value) != null))
      return I18N.t(lang, 'talk.wrong.number', { answer: { kind: 'number', value: value } });
    if (kind === 'parity' && lang === 'vi') return I18N.t(lang, 'talk.wrong.number', ans);
    return I18N.t(lang, 'talk.wrong', ans);
  };

  // Text → TTS-friendly text (Voice.say calls this). Display text stays untouched.
  var VI_UP = 'A-ZĂÂĐÊÔƠƯ', VI_LO = 'a-zăâđêôơư';
  var RE_VI_LETTER = new RegExp('(chữ|Chữ) ([' + VI_UP + VI_LO + '])(?![\\p{L}\\p{N}])', 'gu');
  I18N.speech = function (lang, text) {
    lang = L(lang);
    var s = String(text == null ? '' : text);
    s = s.replace(/[…]/g, '.').replace(/[›»«]/g, ',').replace(/\s+—\s+/g, ', ');
    if (lang === 'en') {
      s = s.replace(/\b(letter|Letter|big|Big|small|Small) ([A-Za-z])(?![A-Za-z’'])/g, function (m, w, ch) {
        return w + ' ' + (LETTER_SPEECH_EN[ch.toUpperCase()] || ch);
      });
      s = s.replace(/(^|[\s!?.,])([A-Z]) (is for|for)\b/g, function (m, pre, ch, f) { return pre + LETTER_SPEECH_EN[ch] + ' ' + f; });
      s = s.replace(/\bstarts with ([A-Z])\b/g, function (m, ch) { return 'starts with ' + LETTER_SPEECH_EN[ch]; });
      s = s.replace(/\bListen: ([A-Z])!/g, function (m, ch) { return 'Listen: ' + LETTER_SPEECH_EN[ch] + '!'; });
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 plus $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 minus $2')
        .replace(/\s=\s/g, ' equals ');
    } else {
      s = s.replace(RE_VI_LETTER, function (m, w, ch) { return w + ' ' + (LETTER_VI[ch.toUpperCase()] || ch.toLowerCase()); });
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 cộng $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 trừ $2')
        .replace(/\s=\s/g, ' bằng ');
      // Vietnamese voices read the Latin "Mochi" as "mo-ch(i)" with an English ch; "Mô Chi" sounds like the name
      s = s.replace(/\bMochi\b/g, 'Mô Chi');
      // "sô-cô-la", "zíc-zắc": hyphens make some voices pause or say "gạch ngang"
      s = s.replace(/(\p{L})-(?=\p{L})/gu, '$1 ');
    }
    return s.replace(/\s{2,}/g, ' ').trim();
  };

  IB.I18N = I18N;
})(window.IB = window.IB || {});
