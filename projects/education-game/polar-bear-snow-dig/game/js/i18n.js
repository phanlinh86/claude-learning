/* Nuka's Snow Dig — NK.I18N (English + Vietnamese). Nuka (EN/VI lines "Nuka", VI titles "Gấu Nuka") is a chubby polar
 * bear cub in a brown knitted scarf: the child RUBS a snow drift (every stroke = one paw scoop; a tap works too), a
 * treasure pops out (knitted hat, shape ice gem, fish, plush toy animal, letter / number ice block) and floats up into
 * the aurora. Vietnamese TTS reads the Latin "Nuka" badly, so speech('vi') says "Nu Ca" (docs/VOICE.md §0).
 *
 *   NK.I18N.t(lang, key, params, rng?)          → string (variants picked with rng.next()/rng()/Math.random)
 *   NK.I18N.ask(lang, key, params, {next, rng}) → the prompt; next:true prefixes a "Next one!" line (2nd step)
 *   NK.I18N.name(lang, kind, value, opts?)      → display + spoken name. kinds: color (vi "màu đỏ"), hue (bare, vi "đỏ";
 *                                                 or {bare:true}), shape, size, animal (opts {size}), word (animal without
 *                                                 classifier), thing (hat/gem/fish/toy/tablet), number, dots, letter,
 *                                                 text, sum, diff, parity
 *   NK.I18N.words(lang, kind, value)            → accepted spoken forms (lower-case, + no-diacritic forms, digits)
 *   NK.I18N.choiceWords(lang, choice)           → spoken forms for a Talk choice {id, thing:{kind, …}, value?}
 *   NK.I18N.phrase(lang, thing)                 → a name for a sentence: "the circle", "letter D", "small b", "number five"
 *   NK.I18N.thingPhrase(lang, thing, opts)      → a dug thing named: "a red hat", "the star gem", "the big fish",
 *                                                 "the fox" / "cái mũ len màu đỏ", "viên đá băng hình ngôi sao", "con cá to"
 *   NK.I18N.sayFound(lang, ev, rng?)            → `found`: "A red hat — so cosy!", "The star gem!", "The fox! Hello!",
 *                                                 "The big fish! Hooray!", "Letter B! Super!", "Five! 2 + 3 is five!",
 *                                                 count (ev.count {i,n}) → "Three!"
 *   NK.I18N.sayWrong(lang, ev, rng?)            → `wrong`: "That’s a blue hat. Let’s find the red one!" (names what was dug,
 *                                                 then the goal; maths never gives the answer away)
 *   NK.I18N.sayCount(lang, i)                   → "One!" … "Twenty!"
 *   NK.I18N.sayCountDone(lang, n, rng?)         → "Three fish! Hooray!" / "Ba con cá! Hoan hô!"
 *   NK.I18N.talkWrong(lang, choice | kind, value) → gentle "It is red! Good try!" for a missed Talk-time answer
 *   NK.I18N.speech(lang, text)                  → text tuned for TTS (letter names, + − =, " — " pause, vi "Nuka" → "Nu Ca")
 *   NK.I18N.setChild(name)  has(lang, key)  keys(lang)  raw(lang, key)  langs  PARAMS  TOPICS  ANIMALS  THING_KINDS
 *
 * Params: values may be RAW ({color:'red'}, {animal:'fox'}, {kind:'fish'}) — keys named like a name kind are named
 * automatically; an object {kind, value} or {nameKind, nameValue} is replaced by its name / phrase.
 * Derived params: {hue} (bare colour) from color, {word} from animal, {lower} from letter, {expr} from a,b / text,
 * {num} (number word) and {fish} ("fish" — the EN plural is also "fish", vi "con cá") from n; {kind} = the thing noun
 * ("fish", "con cá"; a toy with {animal} → the animal: "fox", "con cáo").
 * Keys with required params (PARAMS) fall back to a generic key when a param is missing (never "the !" on screen).
 * {child}: if the child's name is empty, variants containing {child} are skipped.
 */
(function (NK) {
  'use strict';

  var LANGS = ['en', 'vi'];
  var ANIMALS = ['fox', 'hare', 'reindeer', 'walrus', 'whale', 'dog', 'goose', 'owl'];
  var THING_KINDS = ['hat', 'gem', 'fish', 'toy', 'tablet'];

  // ---------------------------------------------------------------- names
  var NAMES = { en: {}, vi: {} };
  NAMES.en.color = { red: 'red', blue: 'blue', yellow: 'yellow', green: 'green', orange: 'orange', purple: 'purple', pink: 'pink' };
  NAMES.vi.color = { red: 'màu đỏ', blue: 'màu xanh dương', yellow: 'màu vàng', green: 'màu xanh lá', orange: 'màu cam',
    purple: 'màu tím', pink: 'màu hồng' };
  NAMES.en.hue = NAMES.en.color;
  NAMES.vi.hue = { red: 'đỏ', blue: 'xanh dương', yellow: 'vàng', green: 'xanh lá', orange: 'cam', purple: 'tím', pink: 'hồng' };
  NAMES.en.shape = { circle: 'circle', square: 'square', triangle: 'triangle', star: 'star', heart: 'heart', rect: 'rectangle',
    rectangle: 'rectangle', diamond: 'diamond', oval: 'oval' };
  // "hình ngôi sao / hình trái tim" (not bare "ngôi sao") so "viên đá băng hình …" always reads as a shape gem
  NAMES.vi.shape = { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', star: 'hình ngôi sao',
    heart: 'hình trái tim', rect: 'hình chữ nhật', rectangle: 'hình chữ nhật', diamond: 'hình thoi', oval: 'hình bầu dục' };
  NAMES.en.size = { big: 'big', small: 'small' };
  NAMES.vi.size = { big: 'to', small: 'nhỏ' };
  NAMES.en.animal = { fox: 'fox', hare: 'hare', reindeer: 'reindeer', walrus: 'walrus', whale: 'whale', dog: 'dog',
    goose: 'goose', owl: 'owl' };
  NAMES.vi.animal = { fox: 'con cáo', hare: 'con thỏ', reindeer: 'con tuần lộc', walrus: 'con hải mã', whale: 'con cá voi',
    dog: 'con chó', goose: 'con ngỗng', owl: 'con cú' };
  NAMES.en.word = NAMES.en.animal;
  NAMES.vi.word = { fox: 'cáo', hare: 'thỏ', reindeer: 'tuần lộc', walrus: 'hải mã', whale: 'cá voi', dog: 'chó',
    goose: 'ngỗng', owl: 'cú' };
  NAMES.en.thing = { hat: 'hat', gem: 'gem', fish: 'fish', toy: 'toy', tablet: 'ice block' };
  NAMES.vi.thing = { hat: 'cái mũ len', gem: 'viên đá băng', fish: 'con cá', toy: 'thú bông', tablet: 'khối băng' };
  NAMES.en.parity = { odd: 'odd', even: 'even' };
  NAMES.vi.parity = { odd: 'lẻ', even: 'chẵn' };
  // the counted thing, singular / plural (EN "fish" is its own plural: "Dig up 3 fish!")
  var FISH = { en: ['fish', 'fish'], vi: ['con cá', 'con cá'] };

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
  // No form is shared by two values of the same kind.
  var WORDS = {
    en: {
      color: { red: ['red', 'read', 'reds'], blue: ['blue', 'blew', 'blues'], yellow: ['yellow', 'yello'],
        green: ['green', 'greens'], orange: ['orange', 'oranges'], purple: ['purple', 'violet', 'pupple'],
        pink: ['pink', 'pinks', 'pinky'] },
      shape: { circle: ['circle', 'round', 'ring', 'circles'], square: ['square', 'squares'],
        triangle: ['triangle', 'try angle', 'triangles'], star: ['star', 'stars'], heart: ['heart', 'hearts', 'hart', 'love'],
        rect: ['rectangle', 'rectangles', 'long box'], rectangle: ['rectangle', 'rectangles'], oval: ['oval', 'ovals'],
        diamond: ['diamond', 'kite', 'diamonds'] },
      size: { big: ['big', 'large', 'huge', 'bigger', 'giant'], small: ['small', 'little', 'tiny', 'smaller', 'baby'] },
      animal: { fox: ['fox', 'foxy', 'foxes', 'arctic fox'], hare: ['hare', 'hares', 'hair', 'bunny', 'rabbit'],
        reindeer: ['reindeer', 'rain deer', 'reindeers', 'deer'], walrus: ['walrus', 'walruses', 'wall russ'],
        whale: ['whale', 'whales', 'wail'], dog: ['dog', 'doggy', 'doggie', 'puppy', 'dogs', 'woof', 'husky'],
        goose: ['goose', 'geese', 'goosey', 'honk'], owl: ['owl', 'owls', 'owly', 'hoot', 'snowy owl'] },
      thing: { hat: ['hat', 'hats', 'beanie', 'woolly hat'], gem: ['gem', 'gems', 'ice gem', 'jewel'],
        fish: ['fish', 'fishes', 'fishy'], toy: ['toy', 'toys', 'teddy'], tablet: ['ice block', 'block'] },
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
      size: { big: ['to', 'lớn', 'bự', 'to lắm', 'to hơn'], small: ['nhỏ', 'bé', 'nhỏ xíu', 'nhỏ hơn', 'tí hon'] },
      animal: { fox: ['con cáo', 'cáo', 'cáo con', 'cáo tuyết'], hare: ['con thỏ', 'thỏ', 'thỏ con', 'thỏ trắng', 'thỏ tuyết'],
        reindeer: ['con tuần lộc', 'tuần lộc', 'con nai', 'nai'], walrus: ['con hải mã', 'hải mã', 'con moóc', 'moóc'],
        whale: ['con cá voi', 'cá voi', 'cá voi con'], dog: ['con chó', 'chó', 'cún', 'con cún', 'chó con', 'gâu gâu'],
        goose: ['con ngỗng', 'ngỗng', 'ngỗng con'], owl: ['con cú', 'cú', 'cú mèo', 'con cú mèo', 'cú tuyết'] },
      thing: { hat: ['mũ', 'mũ len', 'cái mũ', 'cái mũ len', 'nón len'], gem: ['đá băng', 'viên đá băng', 'viên đá', 'đá quý'],
        fish: ['cá', 'con cá'], toy: ['thú bông', 'đồ chơi'], tablet: ['khối băng'] },
      parity: { odd: ['lẻ', 'số lẻ', 'lẽ', 'lẹ'], even: ['chẵn', 'số chẵn', 'chặn', 'chắn'] }
    }
  };

  // Default NK.WORDS for the 'initial' topic (the toy animals are the pictures; DESIGN §5.1). content.js may replace it
  // ({en:[{word, initial, animal}], vi:[…]}). vi words are the animal names WITHOUT the classifier "con"; the VI initial
  // keeps the letter's own marks but never a tone mark (ngỗng → N, cú → C).
  var WORD_LIST = {
    en: [['fox', 'fox', 'F'], ['hare', 'hare', 'H'], ['reindeer', 'reindeer', 'R'], ['walrus', 'walrus', 'W'],
      ['whale', 'whale', 'W'], ['dog', 'dog', 'D'], ['goose', 'goose', 'G'], ['owl', 'owl', 'O']],
    vi: [['cáo', 'fox', 'C'], ['thỏ', 'hare', 'T'], ['tuần lộc', 'reindeer', 'T'], ['hải mã', 'walrus', 'H'],
      ['cá voi', 'whale', 'C'], ['chó', 'dog', 'C'], ['ngỗng', 'goose', 'N'], ['cú', 'owl', 'C']]
  };
  function defaultEntries(lang) {
    return WORD_LIST[lang].map(function (w) { return { id: w[1], word: w[0], animal: w[1], initial: w[2] }; });
  }
  if (!NK.WORDS) {
    NK.WORDS = {};
    LANGS.forEach(function (l) { NK.WORDS[l] = defaultEntries(l); });
  }

  // ---------------------------------------------------------------- strings
  var TOPICS = ['colors', 'shapes', 'size', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
  var NAME_KINDS = ['color', 'hue', 'shape', 'size', 'animal', 'word', 'thing', 'number', 'dots', 'letter', 'text',
    'sum', 'diff', 'parity'];
  // prompt keys content.js asks with (DESIGN §5.1) and their REQUIRED params (others are optional)
  var PROMPTS = {
    'p.colors': ['color'], 'p.shapes': ['shape'], 'p.shapes5': ['shape', 'color'], 'p.size': ['size', 'kind'],
    'p.animals': ['animal'], 'p.count': ['n'], 'p.letters': ['letter'], 'p.lower': ['letter'], 'p.initial': ['letter'],
    'p.add': ['a', 'b'], 'p.sub': ['a', 'b'], 'p.oddeven': ['parity']
  };
  var MAX_COUNT = 20;

  var STR = {
    en: {
      'ui.title': 'Nuka’s Snow Dig',
      'ui.logo1': 'Nuka’s',
      'ui.logo2': 'Snow Dig',
      'ui.subtitle': 'Rub the snow, dig up treasures, light up the sky!',
      'ui.tagline': 'Rub the snow, dig up treasures, light up the sky!',
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
      'ui.voice': 'Nuka’s voice',
      'ui.mic': 'Answer by voice',
      'ui.done': 'Done',
      'ui.stars': 'Stars',
      'ui.chapter': 'Chapter {n}',
      'ui.allDone': 'All done! {stars} stars',
      'ui.welcome': ['Hi {child}! I am Nuka. Let’s dig in the snow!', 'Hi! I am Nuka. Let’s dig in the snow!'],
      'ui.micUnsupported': 'Voice answers are not available here. Tap the pictures!',
      'ui.micDenied': 'The microphone is off. Tap the pictures instead!',
      'ui.voiceMissing': 'Tip for parents: add a voice in Settings › Accessibility › Spoken Content › Voices.',
      'ui.tapOrSay': 'Tap or say the answer!',
      'ui.listening': 'Nuka is listening…',
      'ui.tapNuka': 'Tap Nuka to hear it again',
      'ui.tapHint': 'Rub a snow drift to dig',
      'ui.skip': 'Skip',
      'ui.gallery': 'Our treasures',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Colourful Hats',
      'topic.shapes': 'Shape Gems',
      'topic.size': 'Big and Small',
      'topic.count': 'Counting Fish',
      'topic.animals': 'Toy Animals',
      'topic.letters': 'Ice Letters',
      'topic.lower': 'Big and Small Letters',
      'topic.initial': 'First Letters',
      'topic.add': 'Adding Up',
      'topic.sub': 'Take Away',
      'topic.oddeven': 'Odd and Even',

      'weather.0': 'Spring! The snow is melting!',
      'weather.1': 'Summer — the sun stays up all night!',
      'weather.2': 'Autumn colours!',
      'weather.3': 'Winter night — look, the northern lights!',

      'enter': ['New snow drifts!', 'Look, new snow drifts!', 'What is under the snow?'],
      'rub': ['Rub the snow! Swish, swish!', 'Swish, swish! Rub, rub, rub!', 'Rub it fast! Swish, swish!'],
      'fly': ['Up to the northern lights!', 'Float up, up, up!', 'Up it goes to the sky lights!'],
      'slide': ['Wheee! Belly slide!', 'Whoosh! Nuka slides on his tummy!', 'Slide, slide! Wheee!'],

      'p.any': ['Let’s dig!', 'Rub a snow drift and dig!', 'Time to dig in the snow!'],
      'p.next': ['Next one!', 'One more!', 'And now…'],
      'p.colors': ['Find the {color} hat!', 'Where is the {color} hat? Let’s dig!', 'Can you dig up the {color} hat?'],
      'p.shapes': ['Dig up the {shape}!', 'Find the {shape} gem!', 'Where is the {shape}? Let’s dig!'],
      'p.shapes5': ['Find the {color} {shape}!', 'Dig up the {color} {shape} gem!', 'Where is the {color} {shape}?'],
      'p.size': ['Find the {size} {kind}!', 'Which {kind} is {size}? Dig it up!', 'Dig up the {size} {kind}!'],
      'p.sizeAny': ['Find the {size} one!', 'Which one is {size}? Dig it up!', 'Dig up the {size} one!'],
      'p.animals': ['Where is the {animal}?', 'Find the {animal}!', 'Can you dig up the {animal}?'],
      'p.count': ['Dig up {n} {fish}!', 'Let’s count! Find {n} {fish}!', 'Can you dig up {n} {fish}?'],
      'p.letters': ['Find the letter {letter}!', 'Where is the letter {letter}? Let’s dig!', 'Dig up letter {letter}!'],
      'p.lower': ['Big {letter} has a little friend. Find small {lower}!', 'Dig up small {lower}!',
        'Where is small {lower}? It goes with big {letter}!'],
      'p.initial': ['Find the toy that starts with {letter}!', 'Who starts with {letter}? Let’s dig!',
        'Listen: {letter}! Which animal starts with {letter}?'],
      'p.add': ['What is {a} + {b}? Dig up the answer!', 'Let’s add! {a} + {b}. Find the answer!',
        'Count it up: {a} + {b}! Find the answer!'],
      'p.sub': ['What is {a} − {b}? Dig up the answer!', 'Take away! {a} − {b}. Find the answer!',
        'Start with {a}, take away {b}! Find the answer!'],
      'p.oddeven': ['Dig up all the {parity} numbers!', 'Find every {parity} number!', 'Let’s find the {parity} numbers!'],

      'scoop': ['Dig, dig, dig!', 'Scoop, scoop!', 'Paw, paw! Dig dig!'],
      'found.hat': ['{thing} — so cosy!', '{thing}! Look, it twirls!', 'Wow, {thing}! Warm and fluffy!'],
      'found.gem': ['{thing}!', 'You found {thing}!', '{thing}! So sparkly!'],
      'found.fish': ['{thing}! Hooray!', 'You found {thing}!', 'Wow, {thing}! Splish, splash!'],
      'found.toy': ['{thing}! Hello!', 'You found {thing}!', '{thing}! Hooray!'],
      'found.label': ['{label}! Super!', 'You found {label}!', '{label}! Hooray!'],
      'found.parity': ['{num} is {parity}!', 'Yes! {num} is {parity}!'],
      'found.initial': ['{letter} is for {word}!', 'Yes! {letter} is for {word}!'],
      'found.sum': ['{ans}! {expr} is {ans}!', 'Yes! {expr} is {ans}!'],
      'found.any': ['Hooray!', 'You found it!', 'Great digging!'],
      'countDone': ['{num} {fish}! Hooray!', 'We found {num} {fish}!', '{num} {fish}! Super counting!'],

      'wrong.thing': ['That’s {got}. Let’s find {want}!', 'Oh, {got}! Where is {want}?', 'That one is {got}! Let’s look for {want}!'],
      'wrong.math': ['That’s {got}. Let’s count again!', 'Hmm, {got}. Let’s count one more time!'],
      'wrong.parity': ['{num} is {parity}! Let’s look for another one!', '{num} is {parity}. Let’s find a different one!'],
      'wrong.initial': ['{word} starts with {first}! Let’s look again!', '{word} starts with {first}. Let’s find another one!'],
      'wrong.any': ['Let’s look again!', 'Let’s try another one!', 'Hmm, let’s think again!', 'Keep going, you can do it!'],
      'already': ['This one is dug up! Let’s try another drift!', 'All dug out! Find a snow drift!',
        'We dug here already! Try another one!'],
      'busy': ['One at a time! Nuka is digging!', 'Wait a moment, Nuka’s paws are busy!', 'Dig, dig! Almost there!'],
      'stepDone': ['Hooray!', 'Great digging!', 'Wonderful!', 'You found it!'],
      'surprise.seal': ['Look! A little seal!', 'Peekaboo! A seal pup popped up!', 'Who is that? A baby seal!'],
      'seal.tap': ['Hee hee! The seal giggles!', 'Spin, spin! Hello, little seal!', 'Ork, ork! The seal says hi!'],
      'surprise.tern': ['Look up! A little tern!', 'Whoosh! A little bird flies by!', 'Up in the sky! An arctic tern!'],
      'tern.tap': ['Wheee! A loop-the-loop!', 'Flap, flap! Round and round!', 'The little tern does a loop!'],

      'praise': ['Yes!', 'Great job!', 'You got it!', 'Super!', 'Wonderful!', 'Nice one!', 'Hooray!', 'Well done!'],
      'great': ['Great digging, {child}!', 'You did it, {child}!', 'What a snow explorer!', 'Wow, {child}, super digger!',
        'Hooray! All found!', 'You are so clever!', 'Super snow digger!'],
      'party': ['Look at our northern lights!', 'Hooray! What a snow dig!', 'So many treasures in the sky lights!'],
      'hint': ['Psst! Look at the shining drift!', 'Watch the little hand!', 'Nuka will help! This one!',
        'Look, this drift is sparkling!', 'The shiny one! Rub it!'],
      'idle': ['Let’s dig!', 'Nuka is waiting! Your turn!', 'Rub a snow drift!', 'I am here, {child}! Let’s dig!',
        'Treasures are hiding in the snow!', 'What shall we dig up next?'],

      'talk.intro': 'Talk time!',
      'talk.colors': 'What colour is this hat?',
      'talk.colorsWhich': 'Which hat is {color}?',
      'talk.shapes': 'Which one is the {shape}?',
      'talk.shapesAny': 'What shape is this gem?',
      'talk.size': 'Which {kind} is {size}?',
      'talk.sizeOne': 'Which one is {size}?',
      'talk.sizeAny': 'Which one is big?',
      'talk.count': 'How many fish?',
      'talk.countAny': 'How many dots are there?',
      'talk.animals': 'Where is the {animal}?',
      'talk.animalsAny': 'Who is this?',
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
      'talk.wrong.size': 'It is the {answer} one! Good try!',
      'talk.wrong.letter': 'It is the letter {letter}! Good try!',
      'talk.wrong.small': 'It is small letter {letter}! Good try!',
      'talk.wrong.number': 'It is {answer}! Good try!',
      'talk.wrong.any': 'Good try! Let’s keep digging!',

      'session.done': ['What a snow dig! {stars} stars! Hooray!', 'Amazing, {child}! {stars} stars!',
        'So many treasures! {stars} stars!']
    },
    vi: {
      'ui.title': 'Gấu Nuka Đào Tuyết',
      'ui.logo1': 'Gấu Nuka',
      'ui.logo2': 'Đào Tuyết',
      'ui.subtitle': 'Xoa tuyết, đào kho báu, thắp sáng bầu trời nhé!',
      'ui.tagline': 'Xoa tuyết, đào kho báu, thắp sáng bầu trời nhé!',
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
      'ui.voice': 'Giọng của Nuka',
      'ui.mic': 'Nói để trả lời',
      'ui.done': 'Xong',
      'ui.stars': 'Ngôi sao',
      'ui.chapter': 'Chương {n}',
      'ui.allDone': 'Hoàn thành! {stars} ngôi sao',
      'ui.welcome': ['Chào bé {child}! Mình là gấu Nuka. Mình cùng đào tuyết nhé!',
        'Chào bé! Mình là gấu Nuka. Mình cùng đào tuyết nhé!'],
      'ui.micUnsupported': 'Máy này chưa nghe được giọng nói. Bé chạm vào hình nhé!',
      'ui.micDenied': 'Micrô đang tắt. Bé chạm vào hình nhé!',
      'ui.voiceMissing': 'Mẹo cho bố mẹ: thêm giọng tiếng Việt trong Cài đặt › Trợ năng › Nội dung được đọc › Giọng nói.',
      'ui.tapOrSay': 'Bé chạm hoặc nói đáp án nhé!',
      'ui.listening': 'Nuka đang nghe…',
      'ui.tapNuka': 'Chạm vào Nuka để nghe lại nhé',
      'ui.tapHint': 'Bé xoa đống tuyết để đào nhé',
      'ui.skip': 'Bỏ qua',
      'ui.gallery': 'Kho báu của bé',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Mũ len sắc màu',
      'topic.shapes': 'Đá băng hình khối',
      'topic.size': 'To và nhỏ',
      'topic.count': 'Đếm con cá',
      'topic.animals': 'Thú bông',
      'topic.letters': 'Khối băng chữ cái',
      'topic.lower': 'Chữ hoa, chữ thường',
      'topic.initial': 'Chữ cái đầu tiên',
      'topic.add': 'Phép cộng',
      'topic.sub': 'Phép trừ',
      'topic.oddeven': 'Số chẵn, số lẻ',

      'weather.0': 'Mùa xuân rồi! Tuyết đang tan kìa!',
      'weather.1': 'Mùa hè — mặt trời thức suốt đêm luôn!',
      'weather.2': 'Mùa thu nhiều màu quá!',
      'weather.3': 'Đêm mùa đông — nhìn kìa, ánh sáng bắc cực!',

      'enter': ['Đống tuyết mới nè!', 'Nhìn kìa, mấy đống tuyết mới!', 'Dưới tuyết có gì nhỉ?'],
      'rub': ['Bé xoa xoa tuyết nào!', 'Xoa, xoa, xoa! Tuyết bay kìa!', 'Bé ơi, xoa thật nhanh nhé! Xoẹt, xoẹt!'],
      'fly': ['Bay lên ánh sáng bắc cực nào!', 'Bay lên, lên, lên nào!', 'Bay lên dải sáng trên trời nè!'],
      'slide': ['Trượt bụng nè, vui quá!', 'Vèo! Nuka trượt bằng bụng nè!', 'Trượt, trượt! Vui quá đi!'],

      'p.any': ['Bé ơi, mình đào nhé!', 'Bé xoa đống tuyết để đào nào!', 'Tới giờ đào tuyết rồi!'],
      'p.next': ['Tiếp nào!', 'Thêm một nữa nhé!', 'Giờ thì…'],
      'p.colors': ['Bé ơi, tìm cái mũ len {color} nhé!', 'Cái mũ len {color} ở đâu nhỉ? Mình đào nào!',
        'Bé đào cái mũ len {color} lên nào!'],
      'p.shapes': ['Bé ơi, đào viên đá băng {shape} nhé!', 'Bé tìm viên đá băng {shape} nào!',
        'Viên đá băng {shape} ở đâu nhỉ? Mình đào nhé!'],
      'p.shapes5': ['Bé ơi, tìm viên đá băng {shape} {color} nhé!', 'Bé đào viên đá băng {shape} {color} lên nào!',
        'Viên đá băng {shape} {color} ở đâu nhỉ?'],
      'p.size': ['Bé ơi, tìm {kind} {size} nhé!', '{kind} nào {size} nhỉ? Bé đào lên nào!', 'Bé đào {kind} {size} lên nhé!'],
      'p.sizeAny': ['Bé ơi, tìm cái {size} nhé!', 'Cái nào {size} nhỉ? Bé đào lên nào!', 'Bé đào cái {size} lên nhé!'],
      'p.animals': ['{animal} ở đâu nhỉ?', 'Bé ơi, tìm {animal} nhé!', 'Mình đào {animal} lên nào!'],
      'p.count': ['Bé ơi, đào {n} {fish} nhé!', 'Mình đếm nhé! Bé tìm {n} {fish} nào!', 'Bé đào {n} {fish} lên nào!'],
      'p.letters': ['Bé ơi, tìm chữ {letter} nhé!', 'Chữ {letter} ở đâu nhỉ? Mình đào nào!', 'Bé đào chữ {letter} lên nào!'],
      'p.lower': ['Bé ơi, chữ {letter} hoa có một bạn nhỏ. Bé tìm chữ {lower} thường nhé!', 'Bé đào chữ {lower} thường lên nào!',
        'Chữ {lower} thường ở đâu nhỉ? Bạn ấy đi cùng chữ {letter} hoa đó!'],
      'p.initial': ['Bé ơi, tìm con vật bắt đầu bằng chữ {letter} nhé!', 'Bạn nào bắt đầu bằng chữ {letter}? Mình đào nào!',
        'Bé nghe nè, chữ {letter}! Con vật nào bắt đầu bằng chữ {letter}?'],
      'p.add': ['Bé ơi, {a} + {b} bằng mấy? Bé đào đáp án nhé!', 'Mình cộng nào! {a} + {b}. Bé tìm đáp án nhé!',
        'Bé tính nhé: {a} + {b}! Tìm đáp án nào!'],
      'p.sub': ['Bé ơi, {a} − {b} bằng mấy? Bé đào đáp án nhé!', 'Mình trừ nào! {a} − {b}. Bé tìm đáp án nhé!',
        'Có {a}, bớt đi {b}! Bé tìm đáp án nào!'],
      'p.oddeven': ['Bé ơi, đào tất cả các số {parity} nhé!', 'Bé tìm hết các số {parity} nào!', 'Mình tìm các số {parity} nhé!'],

      'scoop': ['Đào, đào, đào!', 'Xúc, xúc nào!', 'Bới, bới! Đào đào!'],
      'found.hat': ['{thing} — ấm quá!', '{thing}! Nhìn kìa, nó xoay vòng!', 'Oa, {thing}! Mềm và ấm ghê!'],
      'found.gem': ['{thing}!', 'Bé tìm ra {thing} rồi!', '{thing}! Lấp lánh quá!'],
      'found.fish': ['{thing}! Hoan hô!', 'Bé tìm ra {thing} rồi!', 'Oa, {thing}! Tõm, tõm!'],
      'found.toy': ['{thing}! Chào bạn!', 'Bé tìm ra {thing} rồi!', '{thing}! Hoan hô!'],
      'found.label': ['{label}! Giỏi quá!', 'Bé tìm ra {label} rồi!', '{label}! Hoan hô!'],
      'found.parity': ['{num} là số {parity}!', 'Đúng rồi! {num} là số {parity}!'],
      'found.initial': ['Chữ {letter}, {word}!', 'Đúng rồi! Chữ {letter}, {word}!'],
      'found.sum': ['{ans}! {expr} bằng {ans}!', 'Đúng rồi! {expr} bằng {ans}!'],
      'found.any': ['Hoan hô!', 'Bé tìm ra rồi!', 'Bé đào giỏi quá!'],
      'countDone': ['{num} {fish}! Hoan hô!', 'Mình tìm được {num} {fish} rồi!', '{num} {fish}! Bé đếm giỏi quá!'],

      'wrong.thing': ['Đây là {got}. Mình tìm {want} nhé!', 'Ồ, {got} nè! {want} ở đâu nhỉ?', 'Cái này là {got}! Bé tìm {want} nào!'],
      'wrong.math': ['Đây là {got}. Mình đếm lại nhé!', 'Ồ, {got}. Bé đếm thêm lần nữa nào!'],
      'wrong.parity': ['{num} là số {parity}! Mình tìm số khác nhé!', '{num} là số {parity}. Bé tìm số khác nào!'],
      'wrong.initial': ['{word} bắt đầu bằng chữ {first}! Mình tìm lại nhé!', '{word} bắt đầu bằng chữ {first}. Bé tìm bạn khác nào!'],
      'wrong.any': ['Mình tìm lại nhé!', 'Bé thử chỗ khác nào!', 'Bé nghĩ thêm chút nữa nhé!', 'Cố lên, bé làm được mà!'],
      'already': ['Chỗ này đào rồi! Bé đào đống tuyết khác nhé!', 'Đào xong rồi nè! Bé tìm đống tuyết khác nào!',
        'Mình đào chỗ này rồi! Bé thử chỗ khác nhé!'],
      'busy': ['Từ từ nhé! Nuka đang đào nè!', 'Chờ chút nhé, Nuka đang bận đào!', 'Đào, đào! Sắp xong rồi!'],
      'stepDone': ['Hoan hô!', 'Bé đào giỏi quá!', 'Tuyệt vời!', 'Bé tìm ra rồi!'],
      'surprise.seal': ['Nhìn kìa! Bạn hải cẩu con!', 'Ú òa! Hải cẩu con ngoi lên rồi!', 'Ai đó nhỉ? Bạn hải cẩu con nè!'],
      'seal.tap': ['Hi hi! Hải cẩu con cười khúc khích!', 'Xoay, xoay! Chào hải cẩu con!', 'Hải cẩu con vẫy vây chào bé nè!'],
      'surprise.tern': ['Nhìn lên kìa! Bạn chim nhạn biển!', 'Vút! Chim nhạn biển bay qua kìa!',
        'Trên trời kìa! Bạn chim nhạn biển nhỏ!'],
      'tern.tap': ['Ồ ồ! Nhào lộn một vòng!', 'Vỗ cánh, vỗ cánh! Bay vòng vòng!', 'Chim nhạn biển nhào lộn nè!'],

      'praise': ['Đúng rồi!', 'Giỏi quá!', 'Tuyệt vời!', 'Hoan hô!', 'Bé giỏi lắm!', 'Chính xác!', 'Siêu quá!', 'Hay lắm!'],
      'great': ['Bé {child} đào giỏi quá!', 'Hoan hô bé {child}!', 'Nhà thám hiểm tuyết giỏi quá!',
        'Oa, bé {child} là nhà thám hiểm tí hon!', 'Hoan hô, tìm hết rồi!', 'Bé thông minh quá!', 'Bé đào tuyết siêu giỏi!'],
      'party': ['Nhìn ánh sáng bắc cực của mình nè!', 'Hoan hô! Chuyến đào tuyết tuyệt quá!', 'Bao nhiêu là kho báu trên dải sáng!'],
      'hint': ['Nhìn nè! Đống tuyết này đang lấp lánh.', 'Bé xem bàn tay nhỏ chỉ nè!', 'Nuka giúp bé nhé! Chỗ này nè!',
        'Nhìn kìa, đống tuyết này sáng lên!', 'Chỗ lấp lánh đó! Bé xoa vào nhé!'],
      'idle': ['Mình đào nào!', 'Nuka đang chờ bé nè!', 'Bé xoa đống tuyết nhé!', 'Bé {child} ơi, mình đào tiếp nhé!',
        'Kho báu đang trốn dưới tuyết nè!', 'Mình đào gì tiếp đây nhỉ?'],

      'talk.intro': 'Giờ trò chuyện!',
      'talk.colors': 'Cái mũ len này màu gì nhỉ?',
      'talk.colorsWhich': 'Cái mũ len nào {color} nhỉ?',
      'talk.shapes': '{shape} là cái nào nhỉ?',
      'talk.shapesAny': 'Viên đá băng này hình gì nhỉ?',
      'talk.size': '{kind} nào {size} nhỉ?',
      'talk.sizeOne': 'Cái nào {size} nhỉ?',
      'talk.sizeAny': 'Cái nào to nhỉ?',
      'talk.count': 'Có mấy con cá nào?',
      'talk.countAny': 'Có mấy chấm tròn nào?',
      'talk.animals': '{animal} ở đâu nhỉ?',
      'talk.animalsAny': 'Đây là con gì nhỉ?',
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
      'talk.wrong.size': 'Là cái {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.letter': 'Là chữ {letter} đó! Bé cố gắng lắm!',
      'talk.wrong.small': 'Là chữ {letter} thường đó! Bé cố gắng lắm!',
      'talk.wrong.number': 'Là số {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.any': 'Bé cố gắng lắm! Mình đào tiếp nhé!',

      'session.done': ['Chuyến đào tuyết tuyệt quá! {stars} ngôi sao!', 'Bé {child} giỏi quá! {stars} ngôi sao!',
        'Bé tìm được bao nhiêu là kho báu! {stars} ngôi sao!']
    }
  };
  // count.0 … count.20: "One!" / "Một!" (each fish found in a count step)
  LANGS.forEach(function (l) {
    for (var i = 0; i <= MAX_COUNT; i++) {
      var w = NUM[l][i];
      STR[l]['count.' + i] = w.charAt(0).toUpperCase() + w.slice(1) + '!';
    }
  });

  // required params → fallback key when one is missing (checked AFTER derived params are filled in)
  var NEEDS = {
    'p.sizeAny': ['size'],
    'found.hat': ['thing'], 'found.gem': ['thing'], 'found.fish': ['thing'], 'found.toy': ['thing'], 'found.label': ['label'],
    'found.parity': ['num', 'parity'], 'found.initial': ['letter', 'word'], 'found.sum': ['expr', 'ans'], 'countDone': ['n'],
    'wrong.thing': ['got', 'want'], 'wrong.math': ['got'], 'wrong.parity': ['num', 'parity'], 'wrong.initial': ['word', 'first'],
    'talk.colorsWhich': ['color'], 'talk.shapes': ['shape'], 'talk.size': ['size', 'kind'], 'talk.sizeOne': ['size'],
    'talk.animals': ['animal'], 'talk.letters': ['letter'], 'talk.lower': ['letter'],
    'talk.initial': ['word'], 'talk.add': ['a', 'b'], 'talk.sub': ['a', 'b'], 'talk.oddeven': ['parity'],
    'talk.wrong': ['answer'], 'talk.wrong.a': ['answer'], 'talk.wrong.animal': ['answer'], 'talk.wrong.size': ['answer'],
    'talk.wrong.letter': ['letter'], 'talk.wrong.small': ['letter'], 'talk.wrong.number': ['answer']
  };
  Object.keys(PROMPTS).forEach(function (k) { NEEDS[k] = PROMPTS[k]; });
  var FALLBACK = { 'p.shapes5': 'p.shapes', 'p.size': 'p.sizeAny', 'countDone': 'stepDone',
    'talk.colorsWhich': 'talk.colors', 'talk.shapes': 'talk.shapesAny', 'talk.size': 'talk.sizeOne', 'talk.sizeOne': 'talk.sizeAny',
    'talk.animals': 'talk.animalsAny', 'talk.letters': 'talk.lettersAny', 'talk.lower': 'talk.lowerAny',
    'talk.initial': 'talk.initialAny', 'talk.add': 'talk.calc', 'talk.sub': 'talk.calc', 'talk.oddeven': 'talk.oddevenAny' };
  Object.keys(NEEDS).forEach(function (k) {
    if (FALLBACK[k]) return;
    if (/^p\./.test(k)) FALLBACK[k] = 'p.any';
    else if (/^found\./.test(k)) FALLBACK[k] = 'found.any';
    else if (/^talk\.wrong/.test(k)) FALLBACK[k] = 'talk.wrong.any';
    else if (/^wrong/.test(k)) FALLBACK[k] = 'wrong.any';
  });

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
  // tone marks only (sắc huyền hỏi ngã nặng): "ếch" → "êch", so its first letter is Ê
  function stripTones(s) {
    return String(s).normalize('NFD').replace(/[\u0300\u0301\u0303\u0309\u0323]/g, '').normalize('NFC');
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
  function obj(o) { return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}; }
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

  function animalOf(v) {
    if (v && typeof v === 'object') v = v.animal != null ? v.animal : rawVal(v);
    if (v == null) return null;
    var s = String(v).toLowerCase().replace(/\.svg$/, '').replace(/^(animal|toy)_/, '');
    return ANIMALS.indexOf(s) >= 0 ? s : null;
  }
  function sizeOf(v) {
    var s = low(v);
    if (/(^|[_:\-\s])(big|large)($|[_:\-\s])/.test(s)) return 'big';
    if (/(^|[_:\-\s])(small|little)($|[_:\-\s])/.test(s)) return 'small';
    return null;
  }
  function kindOf(v) {
    var s = low(v);
    return THING_KINDS.indexOf(s) >= 0 ? s : null;
  }
  function shapeOf(v) { var s = low(v); return NAMES.en.shape[s] != null ? s : null; }
  function colorOf(v) { var s = low(v); return NAMES.en.color[s] != null ? s : null; }

  // ---- words for the 'initial' topic: tolerant of whatever shape content.js gives NK.WORDS
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
    var src = NK.WORDS, list = [];
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
    var e = findEntry(lang, v);
    if (e) return e.word;
    var a = animalOf(v);
    if (a) return NAMES[lang].word[a];
    var r = rawVal(v);
    return String(r == null ? '' : r).replace(/_/g, ' ');
  }
  function firstLetter(lang, w) {
    var s = lang === 'vi' ? stripTones(w) : stripMarks(w);
    return s.charAt(0).toUpperCase();
  }
  function initialOf(lang, animalOrWord) {
    var w = wordName(lang, animalOrWord);
    if (!w) return null;
    var e = findEntry(lang, animalOrWord) || findEntry(lang, w);
    var f = e && e.initial ? e.initial : firstLetter(lang, w);
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
      case 'size': { var sz2 = sizeOf(value); return sz2 ? NAMES[lang].size[sz2] : String(value); }
      case 'parity': {
        if (num(value) != null) return numberName(lang, num(value));
        tbl = NAMES[lang].parity;
        return tbl[value] != null ? tbl[value] : String(value);
      }
      default:
        tbl = NAMES[lang][kind];
        if (tbl && tbl[value] != null) return tbl[value];
        return String(value == null ? '' : value).replace(/_/g, ' ');
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

  // a Talk-time choice / picture thing → [kind, value]. Dig things: {kind:'hat'|'blob', color} → color;
  // {kind:'gem', shape, color} → shape (colour if no shape); {kind:'toy', animal} → animal; {kind:'size', size};
  // {kind:'number'|'dots', n}; {kind:'letter'|'tablet', text}; {kind:'fish'} → thing fish (size if it has one);
  // {nameKind, nameValue};
  // {id, thing, value}
  function kvOf(t) {
    var kv = kvRaw(t);
    return [kv[0], scalar(kv[1])];
  }
  function kvRaw(t) {
    t = obj(t);
    if (t.thing && typeof t.thing === 'object') return kvRaw(t.thing);
    if (t.nameKind != null) return [t.nameKind, t.nameValue];
    switch (t.kind) {
      case 'blob': case 'color': case 'hat':
        if (t.color != null || t.value != null) return ['color', t.color != null ? t.color : t.value];
        return ['thing', t.kind];
      case 'gem': case 'shape':
        if (t.shape != null) return ['shape', t.shape];
        if (t.kind === 'gem' && t.color != null) return ['color', t.color];
        return t.value != null ? ['shape', t.value] : ['thing', 'gem'];
      case 'size': return ['size', t.size != null ? t.size : t.value];
      case 'animal': case 'toy': return ['animal', t.animal != null ? t.animal : t.value];
      case 'number': case 'dots': return ['number', t.n != null ? t.n : t.value];
      case 'letter': return ['letter', t.text != null ? t.text : t.value];
      case 'tablet': return ['text', t.text != null ? t.text : t.value];
      case 'parity': return ['parity', t.value];
      case 'text': return ['text', t.text != null ? t.text : t.value];
      case 'fish': return t.size != null ? ['size', t.size] : ['thing', 'fish'];
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

  // ---------------------------------------------------------------- phrase: a name for a sentence
  // thing = {nameKind, nameValue, size?, animal?, kind?} | {kind, value}. EN gets "the" where natural; VI the plain name.
  function scalar(v) { return (typeof v === 'string' || (typeof v === 'number' && isFinite(v))) ? v : null; }
  function thingOf(a, b) {
    if (typeof a === 'string') return { k: a, v: scalar(b) };
    var t = obj(a);
    var hasName = t.nameKind != null;
    return { k: hasName ? scalar(t.nameKind) : scalar(t.kind), v: scalar(hasName ? t.nameValue : t.value),
      size: t.size, animal: t.animal, text: t.text, what: hasName ? kindOf(t.kind) : null };
  }
  function phraseOf(lang, th) {
    var vi = lang === 'vi', k = th.k, v = th.v, out = '';
    switch (k) {
      case 'color': case 'hue': out = name(lang, 'color', v); break;
      case 'shape': out = vi ? name(lang, 'shape', v) : 'the ' + name(lang, 'shape', v); break;
      case 'animal': case 'word':
        out = vi ? name(lang, 'animal', v, { size: th.size }) : 'the ' + name(lang, 'animal', v, { size: th.size }); break;
      case 'thing': out = vi ? name(lang, 'thing', v) : 'the ' + name(lang, 'thing', v); break;
      case 'size': {
        var a = animalOf(th.animal), w = th.what && th.what !== 'toy' ? th.what : null;
        if (a) out = vi ? name(lang, 'animal', a, { size: v }) : 'the ' + name(lang, 'animal', a, { size: v });
        else if (w) out = vi ? NAMES.vi.thing[w] + ' ' + name(lang, 'size', v) : 'the ' + name(lang, 'size', v) + ' ' + NAMES.en.thing[w];
        else out = vi ? 'cái ' + name(lang, 'size', v) : 'the ' + name(lang, 'size', v) + ' one';
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
      case 'text': {
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

  // ---------------------------------------------------------------- thingPhrase: a dug-up thing named
  // thing = { kind: hat|gem|fish|toy|tablet, color?, shape?, animal?, text?, size?, nameKind?, nameValue? }
  // opts = { art: 'a' | 'the' | null (EN article), color: bool (say the colour), size: bool (say big/small), bare: bool
  //          (VI bare hue: "cái mũ len đỏ"), noGem: bool (EN: a shape gem named by its shape only, "the blue star";
  //          the old name noStone is accepted too) }. Unknown things → their name phrase (or '').
  function tabletPhrase(lang, t) {
    var tx = t.text != null ? t.text : t.nameValue;
    if (tx == null) return lang === 'vi' ? 'khối băng' : 'the ice block';
    if (t.nameKind && t.nameKind !== 'text') return phraseOf(lang, { k: t.nameKind === 'parity' ? 'number' : t.nameKind, v: tx });
    return phraseOf(lang, { k: 'text', v: tx });
  }
  function thingPhrase(lang, t, opts) {
    lang = L(lang);
    t = obj(t);
    opts = opts || {};
    var kind = kindOf(t.kind);
    if (!kind) {
      if (t.nameKind != null) return phraseOf(lang, thingOf(t));
      return '';
    }
    if (kind === 'tablet') return tabletPhrase(lang, t);
    var vi = lang === 'vi';
    var col = opts.color && colorOf(t.color) ? colorOf(t.color) : null;
    var sz = opts.size && sizeOf(t.size) ? sizeOf(t.size) : null;
    var shp = kind === 'gem' ? shapeOf(t.shape) : null;
    var noGem = !!(opts.noGem || opts.noStone);
    var an = kind === 'toy' ? animalOf(t.animal) : null;
    var out;
    if (vi) {
      var noun = kind === 'toy' && an ? NAMES.vi.animal[an] : NAMES.vi.thing[kind];
      out = noun + (shp ? ' ' + NAMES.vi.shape[shp] : '') + (sz ? ' ' + NAMES.vi.size[sz] : '') +
        (col ? ' ' + (opts.bare ? NAMES.vi.hue[col] : NAMES.vi.color[col]) : '');
      return out;
    }
    var words2 = [];
    if (sz) words2.push(NAMES.en.size[sz]);
    if (col) words2.push(NAMES.en.color[col]);
    if (kind === 'gem') { if (shp) words2.push(NAMES.en.shape[shp]); if (!shp || !noGem) words2.push('gem'); }
    else if (kind === 'toy') words2.push(an ? NAMES.en.animal[an] : 'toy');
    else words2.push(NAMES.en.thing[kind]);
    out = words2.join(' ');
    if (opts.art === 'a' || opts.art === 'the') out = opts.art + ' ' + out;
    return anFix(out);
  }

  // ---------------------------------------------------------------- t()
  var I18N = { langs: LANGS.slice(), child: '' };

  function kindParam(lang, p) {     // {kind}: the thing noun; a toy with an animal → the animal
    var k = kindOf(rawVal(p.kind)) || (present(p.thing) && typeof p.thing !== 'object' ? kindOf(p.thing) : null);
    var a = animalOf(p.animal);
    if (a && (!k || k === 'toy')) return NAMES[lang].animal[a];
    if (k) return NAMES[lang].thing[k];
    if (present(p.kind)) return String(rawVal(p.kind)).replace(/_/g, ' ');
    return null;
  }

  function derive(lang, params, key) {
    var p = {}, k;
    if (params && typeof params === 'object') for (k in params) if (Object.prototype.hasOwnProperty.call(params, k)) p[k] = params[k];
    key = key || '';
    // {hue} = bare colour (vi "đỏ")
    if (!present(p.hue) && present(p.color)) p.hue = name(lang, 'hue', rawVal(p.color));
    // {kind} = thing noun
    var kn = kindParam(lang, p);
    if (kn != null) p.kind = kn; else delete p.kind;
    // {word} from animal
    if (present(p.animal) && animalOf(p.animal) && !present(p.word)) p.word = wordName(lang, animalOf(p.animal));
    if (present(p.word)) p.word = wordName(lang, p.word);
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
    // {num} + {fish} from n (EN "fish" is its own plural; the key stays plural-aware for other nouns)
    var c = present(p.n) ? num(p.n) : null;
    if (!present(p.num) && c != null) p.num = numberName(lang, c);
    if (present(p.n) && typeof p.n === 'object') p.n = c != null ? c : '';
    p.fish = FISH[lang][c === 1 ? 0 : 1];
    // {got}/{want}/{label}/{answer} objects → phrases
    ['got', 'want', 'label'].forEach(function (q) {
      if (p[q] && typeof p[q] === 'object') p[q] = present(p[q]) ? phraseOf(lang, thingOf(p[q])) : '';
    });
    if (typeof p.thing === 'object') p.thing = thingPhrase(lang, p.thing, { art: 'the' });
    return p;
  }

  function resolveParam(lang, key, val) {
    if (!present(val)) return '';
    if (typeof val === 'object') {
      var kd = val.kind != null ? val.kind : val.nameKind;
      return kd ? name(lang, kd, rawVal(val)) : '';
    }
    switch (key) {
      case 'color': case 'shape': case 'size': case 'animal': case 'parity':
        return name(lang, key, val);
      default: return String(val);
    }
  }

  // English "a oval" → "an oval", but never the LETTER A. No regex look-behind (iOS < 16.4).
  function anFix(s) {
    return String(s).replace(/(^|[\s"“(])([Aa]) (?=[aeiou]|8\b|11\b|18\b)/g, function (m, pre, a, off, str) {
      if (/letter\s*$/i.test(str.slice(0, off + pre.length))) return m;
      return pre + a + 'n ';
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

  // the step prompt; opts.next → "Next one! Find the red hat!" (main: 2nd step of a round)
  I18N.ask = function (lang, key, params, opts) {
    opts = opts || {};
    var line = I18N.t(lang, key, params, opts.rng);
    return opts.next ? I18N.t(lang, 'p.next', null, opts.rng) + ' ' + line : line;
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
  I18N.thingPhrase = thingPhrase;
  I18N.choiceWords = function (lang, choice) { return words(lang, choice); };   // Talk choice {id, thing} → spoken forms
  I18N.kindValue = kvOf;
  I18N.TOPICS = TOPICS.slice();
  I18N.ANIMALS = ANIMALS.slice();
  I18N.THING_KINDS = THING_KINDS.slice();
  I18N.NAME_KINDS = NAME_KINDS.slice();
  I18N.PROMPTS = PROMPTS;
  I18N.PARAMS = NEEDS;
  I18N.NAME_TABLE = NAMES;
  I18N.LETTER_VI = LETTER_VI;
  I18N.WORD_LIST = WORD_LIST;
  I18N.MAX_COUNT = MAX_COUNT;

  // ---------------------------------------------------------------- game lines
  // the dug thing of an event: ev.thing (the mound's thing) — or ev itself when it carries kind / nameKind
  function evThing(ev) {
    ev = obj(ev);
    if (ev.thing && typeof ev.thing === 'object') return ev.thing;
    if (kindOf(ev.kind) || ev.nameKind != null) return ev;
    return {};
  }
  function labelOf(lang, t, topic, params) {
    var tx = t.text != null ? t.text : t.nameValue;
    var n = num(tx);
    if (topic === 'oddeven' && n != null) return { key: 'found.parity', p: { n: n, parity: n % 2 ? 'odd' : 'even' } };
    if ((topic === 'add' || topic === 'sub') && n != null) {
      var pr = obj(params), a = num(pr.a), b = num(pr.b);
      if (a != null && b != null) return { key: 'found.sum', p: { expr: a + (topic === 'add' ? '+' : '−') + b, ans: numberName(lang, n) } };
    }
    if (n != null) return { key: 'found.label', p: { label: numberName(lang, n) } };
    if (tx == null) return null;
    var k = t.nameKind && t.nameKind !== 'text' && t.nameKind !== 'parity' ? t.nameKind : 'text';
    return { key: 'found.label', p: { label: phraseOf(lang, { k: k, v: tx }) } };
  }

  // `found {id, thing, count?}` (+ main adds topic, params = the step's params) → names what was dug up.
  // Count steps → just the count word so a fast child hears "One! Two! Three!".
  I18N.sayFound = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var cnt = obj(ev.count);
    if (num(cnt.i) != null && num(cnt.i) >= 0) return I18N.sayCount(lang, num(cnt.i));
    var t = evThing(ev), topic = ev.topic, params = obj(ev.params), kind = kindOf(t.kind);
    var sizeRound = topic === 'size' || t.nameKind === 'size';
    if (topic === 'initial' && animalOf(t.animal || (t.nameKind === 'animal' ? t.nameValue : null))) {
      var ini = initialOf(lang, animalOf(t.animal || t.nameValue));
      return I18N.t(lang, 'found.initial', { letter: ini.first, word: ini.word }, rng);
    }
    if (kind === 'tablet' || (!kind && ['letter', 'number', 'text', 'sum', 'diff', 'parity'].indexOf(t.nameKind) >= 0)) {
      var lb = labelOf(lang, t, topic, params);
      if (lb) return I18N.t(lang, lb.key, lb.p, rng);
    }
    if (kind === 'hat') {   // "A red hat — so cosy!" / "Cái mũ len đỏ — ấm quá!" (size round: "The big hat — so cosy!")
      var hatName = sizeRound ? thingPhrase(lang, t, { art: 'the', size: true }) :
        thingPhrase(lang, t, { art: 'a', color: !!colorOf(t.color), bare: true });
      return I18N.t(lang, 'found.hat', { thing: hatName }, rng);
    }
    if (kind === 'gem') {
      var withCol = topic === 'colors' || present(params.color) || (t.nameKind === 'color');
      return I18N.t(lang, 'found.gem', { thing: thingPhrase(lang, t, { art: 'the', color: withCol, size: sizeRound, noGem: withCol }) }, rng);
    }
    if (kind === 'fish') {
      return I18N.t(lang, 'found.fish', { thing: thingPhrase(lang, t, sizeRound ? { art: 'the', size: true } : { art: 'a' }) }, rng);
    }
    if (kind === 'toy') return I18N.t(lang, 'found.toy', { thing: thingPhrase(lang, t, { art: 'the', size: sizeRound }) }, rng);
    if (!kind && t.nameKind != null && t.nameValue != null) {
      var ph = phraseOf(lang, thingOf(t));
      if (ph) return I18N.t(lang, 'found.label', { label: ph }, rng);
    }
    return I18N.t(lang, 'found.any', null, rng);
  };

  // who the child dug up, named for the wrong line ("a blue hat", "the small fish", "letter D")
  // mix = a shapes-with-colours round (p.shapes5): the gem is named with its colour too ("a red star")
  function gotPhrase(lang, got, t, mix) {
    var kind = kindOf(t.kind);
    if (!kind || kind === 'tablet' || got.k === 'letter' || got.k === 'number' || got.k === 'text') return phraseOf(lang, got);
    var d = { kind: kind, color: t.color, shape: t.shape, animal: t.animal, size: t.size };
    if (got.k === 'color') d.color = got.v;
    if (got.k === 'shape') d.shape = got.v;
    if (got.k === 'animal') d.animal = got.v;
    if (got.k === 'size') d.size = got.v;
    return thingPhrase(lang, d, { art: got.k === 'size' ? 'the' : 'a', color: got.k === 'color' || !!mix,
      size: got.k === 'size', noGem: got.k === 'shape' });
  }
  // what we look for ("the red one", "the triangle", "the big one" / "cái mũ len màu đỏ", "con cá to")
  function wantPhrase(lang, want, t, topic, params) {
    var kind = kindOf(t.kind), vi = lang === 'vi';
    if (!kind || kind === 'tablet' || want.k === 'letter' || want.k === 'number' || want.k === 'text') return phraseOf(lang, want);
    var col = colorOf(params.color), mix = want.k === 'shape' && col && kind === 'gem' && topic === 'shapes';
    if (want.k === 'color') {
      if (!vi) return 'the ' + NAMES.en.color[colorOf(want.v)] + ' one';
      return thingPhrase(lang, { kind: kind, color: want.v, shape: t.shape, animal: t.animal }, { color: true });
    }
    if (want.k === 'size') {
      if (!vi) return 'the ' + NAMES.en.size[sizeOf(want.v)] + ' one';
      return thingPhrase(lang, { kind: kind, size: want.v, animal: t.animal, shape: t.shape }, { size: true });
    }
    if (want.k === 'shape') return thingPhrase(lang, { kind: kind, shape: want.v, color: col }, { art: 'the', color: !!mix, noGem: true });
    if (want.k === 'animal') return thingPhrase(lang, { kind: 'toy', animal: want.v }, { art: 'the' });
    return phraseOf(lang, want);
  }

  // `wrong {id, kind:'thing', got:{nameKind,nameValue}, want:{nameKind,nameValue}, streak}` (+ main adds thing = the dug
  // mound's thing, topic, params = the step's params) → names what was dug up, then the goal.
  // Maths never names the right answer; parity says what the dug number is; initial says the word's first letter.
  I18N.sayWrong = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var t = obj(ev.thing && typeof ev.thing === 'object' ? ev.thing : (ev.got && kindOf(ev.got.kind) ? ev.got : null));
    var got = thingOf(ev.got), want = thingOf(ev.want), topic = ev.topic, params = obj(ev.params);
    if (got.k == null && t.nameKind != null) got = thingOf(t);
    var gotTx = got.v != null ? got.v : (got.text != null ? got.text : t.text), gn = num(gotTx);
    if (topic === 'add' || topic === 'sub' || want.k === 'sum' || want.k === 'diff' || (want.k === 'text' && splitOp(want.v))) {
      return I18N.t(lang, 'wrong.math', { got: gotTx != null ? (gn != null ? phraseOf(lang, { k: 'number', v: gn }) : phraseOf(lang, got)) : null }, rng);
    }
    if ((topic === 'oddeven' || want.k === 'parity') && gn != null)
      return I18N.t(lang, 'wrong.parity', { n: gn, parity: gn % 2 ? 'odd' : 'even' }, rng);
    var gotAnimal = animalOf(t.animal) || (got.k === 'animal' ? animalOf(got.v) : null);
    if (topic === 'initial' && gotAnimal) {
      var ini = initialOf(lang, gotAnimal);
      return I18N.t(lang, 'wrong.initial', { word: capFirst(ini.word), first: ini.first }, rng);
    }
    if (got.k && got.v != null && want.k && want.v != null) {
      var mix = topic === 'shapes' && !!colorOf(params.color) && got.k === 'shape';
      if (!mix && got.k === want.k && String(got.v) === String(want.v) && !(got.size && want.size)) return I18N.t(lang, 'wrong.any', null, rng);
      var g = gotPhrase(lang, got, t, mix), w = wantPhrase(lang, want, t, topic, params);
      if (g && w && g !== w) return I18N.t(lang, 'wrong.thing', { got: g, want: w }, rng);
    }
    return I18N.t(lang, 'wrong.any', null, rng);
  };

  // Counting aloud: i → "One!" … "Twenty!" (beyond: the digits)
  I18N.sayCount = function (lang, i) {
    lang = L(lang);
    var c = num(i);
    if (c == null) return I18N.t(lang, 'praise');
    if (STR[lang]['count.' + c]) return STR[lang]['count.' + c];
    return capFirst(numberName(lang, c)) + '!';
  };
  // the count step is complete: "Three fish! Hooray!"
  I18N.sayCountDone = function (lang, n, rng) { return I18N.t(lang, 'countDone', { n: num(n) }, rng); };

  I18N.talkWrong = function (lang, kind, value) {
    lang = L(lang);
    if (kind && typeof kind === 'object') { var kv = kvOf(kind); kind = kv[0]; value = kv[1]; }
    if (kind === 'blob') kind = 'color';
    if (value == null || value === '') return I18N.t(lang, 'talk.wrong.any');
    var ans = { answer: { kind: kind, value: value } };
    if (kind === 'animal') return animalOf(value) ? I18N.t(lang, 'talk.wrong.animal', ans) : I18N.t(lang, 'talk.wrong', { answer: String(value) });
    if (kind === 'shape' || kind === 'thing') return I18N.t(lang, lang === 'en' ? 'talk.wrong.a' : 'talk.wrong', ans);
    if (kind === 'size') return I18N.t(lang, 'talk.wrong.size', ans);
    if (kind === 'letter' || (kind === 'text' && isLetter(String(value)))) {
      var lv = String(value);
      return I18N.t(lang, lv !== lv.toUpperCase() ? 'talk.wrong.small' : 'talk.wrong.letter', { letter: lv });
    }
    if (kind === 'number' || kind === 'dots' || ((kind === 'parity' || kind === 'text') && num(value) != null))
      return I18N.t(lang, 'talk.wrong.number', { answer: { kind: 'number', value: value } });
    if (kind === 'parity' && lang === 'vi') return I18N.t(lang, 'talk.wrong.number', ans);
    return I18N.t(lang, 'talk.wrong', ans);
  };

  // Text → TTS-friendly text (Voice.say calls this). Display text stays untouched.
  // "Nuka": English voices read it well (/ˈnuːkə/). Vietnamese voices (Linh, Google, HoaiMy) see an unknown Latin word —
  // "ka" is not a Vietnamese spelling (k only before i/e/ê/y) — and tend to clip or spell it. speech('vi') therefore
  // sends "Nu Ca": two ordinary level-tone syllables that every vi-VN voice reads as "nu-ca" (a space, not a hyphen:
  // some voices pause oddly or say "gạch ngang" at a hyphen). The display text keeps "Nuka". (docs/VOICE.md §0)
  var RE_NUKA = /(^|[^\p{L}\p{N}])Nuka(?![\p{L}\p{N}])/gu;
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
      s = s.replace(/(^|[\s!?.,])([A-Z]) is for\b/g, function (m, pre, ch) { return pre + LETTER_SPEECH_EN[ch] + ' is for'; });
      s = s.replace(/\bstarts with ([A-Z])\b/g, function (m, ch) { return 'starts with ' + LETTER_SPEECH_EN[ch]; });
      s = s.replace(/\bListen: ([A-Z])!/g, function (m, ch) { return 'Listen: ' + LETTER_SPEECH_EN[ch] + '!'; });
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 plus $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 minus $2')
        .replace(/\s=\s/g, ' equals ');
    } else {
      s = s.replace(RE_NUKA, '$1Nu Ca');
      s = s.replace(RE_VI_LETTER, function (m, w, ch) { return w + ' ' + (LETTER_VI[ch.toUpperCase()] || ch.toLowerCase()); });
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 cộng $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 trừ $2')
        .replace(/\s=\s/g, ' bằng ');
    }
    return s.replace(/\s{2,}/g, ' ').trim();
  };

  NK.I18N = I18N;
})(window.NK = window.NK || {});
