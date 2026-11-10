/* Kiki's Camp Chimes — CC.I18N (English + Vietnamese). Kiki (EN/VI lines "Kiki", VI titles "Khỉ Kiki") is a cheerful
 * little monkey camping in the mountains who hung a row of wind chimes ("chuông gió") from a log beam over the campfire.
 * The child taps or swipes a chime, it swings and rings; a right note lights a paper lantern ("đèn lồng"). "Kiki" is read
 * naturally by English and Vietnamese voices ("ki" is an ordinary Vietnamese syllable), so no TTS rewrite (docs/VOICE.md §0).
 *
 *   CC.I18N.t(lang, key, params, rng?)            → string (variants picked with rng.next()/rng()/Math.random)
 *   CC.I18N.ask(lang, promptKey, params, {next, rng}) → the step prompt; next:true → "Next one! Ring the red bell!"
 *   CC.I18N.name(lang, kind, value, opts?)        → a name. kinds: color (vi "màu đỏ"), hue (bare, vi "đỏ"), shape, size,
 *                                                   bell (a colour or big/small → "red bell" / "chuông màu đỏ"), plate (a
 *                                                   shape → "star chime" / "chuông hình ngôi sao"), string (n → "three
 *                                                   bells" / "ba cái chuông"), dots (n), animal (vi "con gấu"), word
 *                                                   (animal without classifier), number, letter, text, sum, diff, parity
 *   CC.I18N.words(lang, kind, value)              → accepted spoken forms (lower-case, + no-diacritic forms, digits)
 *   CC.I18N.choiceWords(lang, choice)             → spoken forms for a Talk choice {id, thing:{kind, …}}
 *   CC.I18N.chimePhrase(lang, thing, opts?)       → a chime named for a sentence: "the red bell", "the big bell", "the
 *                                                   triangle", "three bells", "five dots", "the bear", "letter B", "small
 *                                                   b", "number five" / "chuông màu đỏ", "chuông to", "chuông hình tam
 *                                                   giác", "chùm ba cái chuông", "năm chấm", "con gấu" ({chime:true} →
 *                                                   "chuông con gấu"), "chữ B", "chữ b thường", "số năm"
 *                                                   (alias: piecePhrase)
 *   CC.I18N.phrase(lang, thing)                   → the same for any thing / icon / {nameKind, nameValue}
 *   CC.I18N.sayName(lang, thing)                  → a chime's plain name ("the red bell" / "chuông màu đỏ")
 *   CC.I18N.sayRight(lang, e, rng?)               → `right`: "Ding! The red bell!", "Ding-dong! The bear!" / "Đinh đoong!
 *                                                   Chuông màu đỏ!"; counting strings → the count run "One, two, three
 *                                                   bells!"; add/sub "Five! 2 + 3 is five!"; oddeven "Seven is odd!";
 *                                                   initial "B is for bear!"  (aliases: sayPlaced; sayPickup / sayTap
 *                                                   = "The red bell!" / "Look, the red bell!")
 *   CC.I18N.sayWrong(lang, e, rng?)               → `wrong`: "That’s the blue bell. Let’s ring the red one!" (names what
 *                                                   was rung, then the goal; maths never gives the answer away)
 *   CC.I18N.sayCount(lang, i)                     → "One!" … "Twenty!"
 *   CC.I18N.sayCountRun(lang, n, kind?)           → "One, two, three bells!" / "Một, hai, ba cái chuông!" (kind 'string'
 *                                                   default | 'dots' | a thing)
 *   CC.I18N.sayCountDone(lang, n, kind?, rng?)    → "Three bells! Hooray!"
 *   CC.I18N.talkWrong(lang, choice | kind, value) → gentle "It is red! Good try!" for a missed Talk-time answer
 *   CC.I18N.speech(lang, text)                    → text tuned for TTS (letter names, + − =, " — " pause)
 *   CC.I18N.setChild(name)  has(lang, key)  keys(lang)  raw(lang, key)  langs  PARAMS  TOPICS  ANIMALS  SHAPES  COLORS
 *
 * Event objects `e` (main passes the world event + { topic, params (the current step's params), promptKey, thing (the
 * chime's thing) }): thing = { kind 'bell'|'plate'|'string'|'dots'|'animal'|'glyph', color?, shape?, n?, animal?, text?,
 * big?, nameKind, nameValue }. When `thing` is missing, the chime is rebuilt from {nameKind, nameValue} + topic (`got`).
 * Params: values may be RAW ({color:'red'}, {animal:'bear'}, {n:3, kind:'string'}) — keys named like a name kind are named
 * automatically; an object {kind, value} or {nameKind, nameValue} is replaced by its name / phrase; {thing: {...}} → its
 * chime phrase.
 * Derived params: {hue} (bare colour) from color, {word} from animal, {lower} from letter, {expr} from a,b / text, {num}
 * (number word), {items} ("bells"/"bell"/"dots", vi "cái chuông" / "chấm"), {itemsPl} (always plural) and {holder} (EN
 * "one", vi "chùm" for a bell string / "chuông" for a dot plate) from n and kind ('string' default, 'dots').
 * Vietnamese shape prompts / Talk say "hình ngôi sao", "hình trái tim" ({shape} in p.shapes*, talk.shapes*).
 * Keys with required params (PARAMS) fall back to a generic key when a param is missing (never "the !" on screen).
 * {child}: if the child's name is empty, variants containing {child} are skipped (and "bé {child}" → "bé", ", {child}!" → "!").
 */
(function (CC) {
  'use strict';

  var LANGS = ['en', 'vi'];
  var ANIMALS = ['bear', 'fox', 'owl', 'deer', 'rabbit', 'squirrel', 'frog', 'duck'];
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
  var COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  var CHIME_KINDS = ['bell', 'plate', 'string', 'dots', 'animal', 'glyph'];
  var KIND_ALIAS = { shape: 'plate', bunch: 'string', bells: 'string', obj: 'bell', tag: 'glyph', number: 'glyph' };

  // ---------------------------------------------------------------- names
  var NAMES = { en: {}, vi: {} };
  NAMES.en.color = { red: 'red', blue: 'blue', yellow: 'yellow', green: 'green', orange: 'orange', purple: 'purple', pink: 'pink' };
  NAMES.vi.color = { red: 'màu đỏ', blue: 'màu xanh dương', yellow: 'màu vàng', green: 'màu xanh lá', orange: 'màu cam',
    purple: 'màu tím', pink: 'màu hồng' };
  NAMES.en.hue = NAMES.en.color;
  NAMES.vi.hue = { red: 'đỏ', blue: 'xanh dương', yellow: 'vàng', green: 'xanh lá', orange: 'cam', purple: 'tím', pink: 'hồng' };
  NAMES.en.shape = { circle: 'circle', square: 'square', triangle: 'triangle', star: 'star', heart: 'heart', rect: 'rectangle',
    rectangle: 'rectangle', diamond: 'diamond', oval: 'oval' };
  // DESIGN §6: "ngôi sao", "trái tim" without "hình" as a bare name; a chime plate is "chuông hình ngôi sao" (shapeH)
  NAMES.vi.shape = { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', star: 'ngôi sao',
    heart: 'trái tim', rect: 'hình chữ nhật', rectangle: 'hình chữ nhật', diamond: 'hình thoi', oval: 'hình bầu dục' };
  NAMES.en.shapeH = NAMES.en.shape;
  NAMES.vi.shapeH = { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', star: 'hình ngôi sao',
    heart: 'hình trái tim', rect: 'hình chữ nhật', rectangle: 'hình chữ nhật', diamond: 'hình thoi', oval: 'hình bầu dục' };
  NAMES.en.size = { big: 'big', small: 'small' };
  NAMES.vi.size = { big: 'to', small: 'nhỏ' };
  NAMES.en.animal = { bear: 'bear', fox: 'fox', owl: 'owl', deer: 'deer', rabbit: 'rabbit', squirrel: 'squirrel', frog: 'frog',
    duck: 'duck' };
  NAMES.vi.animal = { bear: 'con gấu', fox: 'con cáo', owl: 'con cú', deer: 'con hươu', rabbit: 'con thỏ', squirrel: 'con sóc',
    frog: 'con ếch', duck: 'con vịt' };
  NAMES.en.word = NAMES.en.animal;
  NAMES.vi.word = { bear: 'gấu', fox: 'cáo', owl: 'cú', deer: 'hươu', rabbit: 'thỏ', squirrel: 'sóc', frog: 'ếch', duck: 'vịt' };
  NAMES.en.parity = { odd: 'odd', even: 'even' };
  NAMES.vi.parity = { odd: 'lẻ', even: 'chẵn' };
  // counted things: [singular, plural]; RUN = the word used when counting aloud ("Một, hai, ba cái chuông!")
  var ITEMS = { en: { string: ['bell', 'bells'], dots: ['dot', 'dots'] },
    vi: { string: ['cái chuông', 'cái chuông'], dots: ['chấm', 'chấm'] } };
  var RUN = ITEMS;
  // what holds the counted things: EN "the one with three bells"; VI "chùm có ba cái chuông" / "chuông có năm chấm"
  var HOLDER = { en: { string: 'one', dots: 'one' }, vi: { string: 'chùm', dots: 'chuông' } };

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
        rect: ['rectangle', 'rectangles', 'long box'], rectangle: ['rectangle', 'rectangles'], oval: ['oval', 'ovals', 'egg shape'],
        diamond: ['diamond', 'diamonds'] },
      size: { big: ['big', 'large', 'huge', 'bigger', 'giant'], small: ['small', 'little', 'tiny', 'smaller', 'baby'] },
      animal: { bear: ['bear', 'bears', 'teddy', 'teddy bear', 'bare'], fox: ['fox', 'foxy', 'foxes', 'fax'],
        owl: ['owl', 'owls', 'hoot', 'hoo hoo'], deer: ['deer', 'dear', 'fawn', 'reindeer', 'deers'],
        rabbit: ['rabbit', 'rabbits', 'bunny', 'bunnies', 'rabit'], squirrel: ['squirrel', 'squirrels', 'squirl', 'squirrelly'],
        frog: ['frog', 'froggy', 'frogs', 'ribbit'], duck: ['duck', 'ducky', 'duckie', 'ducks', 'quack'] },
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
      size: { big: ['to', 'lớn', 'bự', 'to lắm', 'to hơn', 'chuông to'], small: ['nhỏ', 'bé', 'nhỏ xíu', 'nhỏ hơn', 'tí hon', 'chuông nhỏ'] },
      animal: { bear: ['con gấu', 'gấu', 'gấu con', 'gấu nâu', 'chú gấu'], fox: ['con cáo', 'cáo', 'cáo con', 'chồn cáo'],
        owl: ['con cú', 'cú', 'cú mèo', 'con cú mèo'], deer: ['con hươu', 'hươu', 'con nai', 'nai', 'hươu con'],
        rabbit: ['con thỏ', 'thỏ', 'thỏ con', 'thỏ trắng'], squirrel: ['con sóc', 'sóc', 'sóc con', 'chú sóc'],
        frog: ['con ếch', 'ếch', 'ếch con', 'con nhái'], duck: ['con vịt', 'vịt', 'vịt con', 'cạp cạp'] },
      parity: { odd: ['lẻ', 'số lẻ', 'lẽ', 'lẹ'], even: ['chẵn', 'số chẵn', 'chặn', 'chắn'] }
    }
  };

  // Default CC.WORDS for the 'initial' topic (animal chimes are the pictures). content.js may replace it
  // ({en:[{word, initial, animal}], vi:[…]}). vi words are the animal names WITHOUT the classifier "con"; the VI initial
  // keeps the letter's own marks (ếch → Ê) but never a tone mark.
  var WORD_LIST = {
    en: [['bear', 'bear', 'B'], ['fox', 'fox', 'F'], ['owl', 'owl', 'O'], ['deer', 'deer', 'D'], ['rabbit', 'rabbit', 'R'],
      ['squirrel', 'squirrel', 'S'], ['frog', 'frog', 'F'], ['duck', 'duck', 'D']],
    vi: [['gấu', 'bear', 'G'], ['cáo', 'fox', 'C'], ['cú', 'owl', 'C'], ['hươu', 'deer', 'H'], ['thỏ', 'rabbit', 'T'],
      ['sóc', 'squirrel', 'S'], ['ếch', 'frog', 'Ê'], ['vịt', 'duck', 'V']]
  };
  function defaultEntries(lang) {
    return WORD_LIST[lang].map(function (w) { return { id: w[1], word: w[0], animal: w[1], initial: w[2] }; });
  }
  if (!CC.WORDS) {
    CC.WORDS = {};
    LANGS.forEach(function (l) { CC.WORDS[l] = defaultEntries(l); });
  }

  // ---------------------------------------------------------------- strings
  var TOPICS = ['colors', 'shapes', 'size', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
  var NAME_KINDS = ['color', 'hue', 'shape', 'size', 'bell', 'plate', 'string', 'dots', 'animal', 'word', 'number', 'letter',
    'text', 'sum', 'diff', 'parity'];
  // prompt keys content.js asks with (DESIGN §5.1 / §6) and their REQUIRED params (others are optional)
  var PROMPTS = {
    'p.colors': ['color'], 'p.shapes': ['shape'], 'p.shapes5': ['shape', 'color'], 'p.size': ['size'],
    'p.animals': ['animal'], 'p.count': ['n'], 'p.letters': ['letter'], 'p.lower': ['letter'], 'p.initial': ['letter'],
    'p.add': ['a', 'b'], 'p.sub': ['a', 'b'], 'p.oddeven': ['parity']
  };
  var MAX_COUNT = 20;

  var STR = {
    en: {
      'ui.title': 'Kiki’s Camp Chimes',
      'ui.logo1': 'Kiki’s',
      'ui.logo2': 'Camp Chimes',
      'ui.subtitle': 'Tap a chime, hear it ring, light up the lanterns!',
      'ui.tagline': 'Tap a chime, hear it ring, light up the lanterns!',
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
      'ui.voice': 'Kiki’s voice',
      'ui.mic': 'Answer by talking',
      'ui.done': 'Done',
      'ui.stars': 'Stars',
      'ui.chapter': 'Chapter {n}',
      'ui.allDone': 'All done! {stars} stars',
      'ui.welcome': ['Hi {child}! I am Kiki. Let’s ring the chimes!', 'Hi! I am Kiki. Let’s ring the chimes!'],
      'ui.micUnsupported': 'Voice answers are not available here. Tap the pictures!',
      'ui.micDenied': 'The microphone is off. Tap the pictures instead!',
      'ui.voiceMissing': 'Tip for parents: add a voice in Settings › Accessibility › Spoken Content › Voices.',
      'ui.tapOrSay': 'Tap or say the answer!',
      'ui.listening': 'Kiki is listening…',
      'ui.tapKiki': 'Tap Kiki to hear it again',
      'ui.tapHint': 'Tap a chime to ring it',
      'ui.swipeHint': 'Swipe across the chimes',
      'ui.skip': 'Skip',
      'ui.gallery': 'Our songs',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Colour Bells',
      'topic.shapes': 'Shape Chimes',
      'topic.size': 'Big and Small',
      'topic.count': 'Let’s Count',
      'topic.animals': 'Forest Friends',
      'topic.letters': 'Letter Chimes',
      'topic.lower': 'Big and Small Letters',
      'topic.initial': 'First Letters',
      'topic.add': 'Adding Up',
      'topic.sub': 'Take Away',
      'topic.oddeven': 'Odd and Even',

      'weather.0': 'Good morning, mountains!',
      'weather.1': 'Sunny noon!',
      'weather.2': 'Sunset time!',
      'weather.3': 'Starry night!',

      'enter': ['New chimes!', 'Look, new chimes!', 'Here come new chimes!'],

      'p.any': ['Let’s ring a chime!', 'Tap a chime and hear it sing!', 'Which chime shall we ring?'],
      'p.next': ['Next one!', 'One more!', 'Now,'],
      'p.colors': ['Ring the {color} bell!', 'Where is the {color} bell? Ring it!', 'Can you ring the {color} bell?'],
      'p.shapes': ['Ring the {shape}!', 'Where is the {shape} chime? Ring it!', 'Can you ring the {shape}?'],
      'p.shapes5': ['Ring the {color} {shape}!', 'Where is the {color} {shape}? Ring it!', 'Can you ring the {color} {shape}?'],
      'p.size': ['Ring the {size} bell!', 'Which bell is {size}? Ring it!', 'Can you ring the {size} bell?'],
      'p.sizeAny': ['Ring the big bell!', 'Which bell is big? Ring it!', 'Can you ring the big bell?'],
      'p.animals': ['Ring the {animal}!', 'Where is the {animal}? Ring it!', 'Can you ring the {animal} chime?'],
      'p.count': ['Ring the {holder} with {num} {items}!', 'Let’s count! Which {holder} has {num} {items}? Ring it!',
        'Can you find {num} {items}? Ring that {holder}!'],
      'p.letters': ['Ring the letter {letter}!', 'Where is the letter {letter}? Ring it!', 'Can you ring letter {letter}?'],
      'p.lower': ['Big {letter} has a little friend. Ring small {lower}!', 'Ring small {lower}!',
        'Where is small {lower}? It goes with big {letter}!'],
      'p.initial': ['Ring the animal that starts with {letter}!', 'Who starts with {letter}? Ring it!',
        'Listen: {letter}! Which animal starts with {letter}?'],
      'p.add': ['What is {a} + {b}? Ring the answer!', 'Let’s add! {a} + {b}. Ring the answer!',
        'Count it up: {a} + {b}! Ring the answer!'],
      'p.sub': ['What is {a} − {b}? Ring the answer!', 'Take away! {a} − {b}. Ring the answer!',
        'Start with {a}, take away {b}! Ring the answer!'],
      'p.oddeven': ['Ring all the {parity} numbers!', 'Find every {parity} number and ring it!', 'Let’s ring all the {parity} numbers!'],

      'name.say': ['{thing}!'],
      'tap': ['{thing}!', 'Look, {thing}!', 'This is {thing}!'],
      'right': ['Ding! {thing}!', 'Ding-dong! {thing}!', '{thing}! Lovely!'],
      'right.label': ['Ding! {label}!', '{label}! Lovely!', 'Ding-dong! {label}!'],
      'right.parity': ['{num} is {parity}!', 'Yes! {num} is {parity}!', 'Ding! {num} is {parity}!'],
      'right.initial': ['{letter} is for {word}!', 'Yes! {letter} is for {word}!', 'Ding! {letter} is for {word}!'],
      'right.sum': ['{ans}! {expr} is {ans}!', 'Yes! {expr} is {ans}!', 'Ding! {expr} is {ans}!'],
      'right.any': ['Ding! Lovely!', 'Ding-dong! Just right!', 'Ding! Hooray!'],
      'countDone': ['{num} {items}! Hooray!', 'We counted {num} {items}!', '{num} {items}! Super counting!'],
      'lantern': ['A lantern lights up!', 'Look, the lantern glows!', 'One more lantern!'],

      'wrong.thing': ['That’s {got}. Let’s ring {want}!', 'Oh, {got}! Where is {want}?', 'This one is {got}! Let’s look for {want}!'],
      'wrong.count': ['That {holder} has {got}. Let’s ring the {holder} with {want}!', 'Oh, {got}! Let’s look for {want}!',
        'Let’s count: {got}! We need {want}!'],
      'wrong.math': ['That’s {got}. Let’s count again!', 'Hmm, {got}. Let’s count one more time!', 'That’s {got}! Let’s think again!'],
      'wrong.parity': ['{num} is {parity}! Let’s look for another one!', '{num} is {parity}. Let’s ring a different one!',
        '{num} is {parity}! Let’s try another number!'],
      'wrong.initial': ['{word} starts with {first}! Let’s look again!', '{word} starts with {first}. Let’s ring another one!',
        '{word} starts with {first}! Let’s try another animal!'],
      'wrong.any': ['Let’s look again!', 'Let’s try another chime!', 'Hmm, let’s think again!', 'Keep going, you can do it!'],
      'stepDone': ['Hooray!', 'Lovely ringing!', 'Wonderful!', 'Ding!'],
      'song': ['Now play our song — swipe across the chimes!', 'Song time! Swipe across all the chimes!',
        'Let’s play our song! Swipe over the chimes!'],
      'songShort': ['Now our song!', 'Swipe for our song!', 'Song time!'],
      'songDone': ['Beautiful music!', 'What a lovely song, {child}!', 'Ding-a-ling! Beautiful!', 'Wow, what a song!'],
      'surprise.hedgehog': ['Look! A little hedgehog!', 'Sniff, sniff! Who is that?', 'A hedgehog is going for a walk!'],
      'hedgehog.tap': ['Roll, roll! A spiky ball!', 'The hedgehog curls up! Hee hee!', 'Sniff! Hello, hedgehog!'],
      'surprise.bird': ['Look! A little bird!', 'Tweet tweet! Who is that?', 'A songbird came to listen!'],
      'bird.tap': ['Tweet! The bird sings your note!', 'Tweet tweet! What a song!', 'The bird sings along!'],
      'surprise.fireflies': ['Look! Fireflies!', 'Twinkle, twinkle! Fireflies!', 'The fireflies came to play!'],
      'firefly.tap': ['Twinkle!', 'Zip! Twinkle!', 'Sparkle, sparkle!'],
      'kiki.poke': ['Hee hee! That tickles!', 'Ooh ooh! Hi there!', 'Kiki is happy!'],

      'praise': ['Yes!', 'Great job!', 'You got it!', 'Super!', 'Wonderful!', 'Lovely!', 'Hooray!', 'Well done!'],
      'great': ['Beautiful music, {child}!', 'You did it, {child}!', 'What a music star!', 'Wow, {child}, super ringing!',
        'Hooray! Our song is ready!', 'You are so clever!', 'Lovely music!'],
      'party': ['Look at all our lanterns!', 'Hooray! What a music day!', 'All the lanterns are glowing!'],
      'hint': ['Psst! Look at the shining chime!', 'Watch the little hand!', 'Kiki will help! Ring this one!',
        'Look, this chime is sparkling!', 'The shiny one! Tap it!'],
      'idle': ['Let’s ring a chime!', 'Kiki is waiting! Your turn!', 'Tap a chime!', 'I am here, {child}! Let’s play!',
        'The chimes want to sing!', 'Which chime is next?'],

      'talk.intro': 'Talk time!',
      'talk.colors': 'What colour is this bell?',
      'talk.colorsAny': 'What colour is this?',
      'talk.colorsWhich': 'Which bell is {color}?',
      'talk.shapes': 'Which one is the {shape}?',
      'talk.shapesAny': 'What shape is this?',
      'talk.shapes5': 'Which one is the {color} {shape}?',
      'talk.size': 'Which bell is {size}?',
      'talk.sizeAny': 'Which one is big?',
      'talk.count': 'How many {itemsPl}?',
      'talk.countAny': 'How many are there?',
      'talk.animals': 'Where is the {animal}?',
      'talk.animalsAny': 'Who is this?',
      'talk.animalsWho': 'Who is this?',
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
      'talk.wrong.any': 'Good try! Let’s ring more chimes!',

      'session.done': ['What a music day! {stars} stars! Hooray!', 'Amazing, {child}! {stars} stars!',
        'So many songs! {stars} stars!']
    },
    vi: {
      'ui.title': 'Chuông Gió Lửa Trại Của Khỉ Kiki',
      'ui.logo1': 'Khỉ Kiki',
      'ui.logo2': 'Chuông Gió Lửa Trại',
      'ui.subtitle': 'Bé chạm chuông gió, nghe chuông reo, thắp sáng đèn lồng nhé!',
      'ui.tagline': 'Bé chạm chuông gió, nghe chuông reo, thắp sáng đèn lồng nhé!',
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
      'ui.voice': 'Giọng của Kiki',
      'ui.mic': 'Nói để trả lời',
      'ui.done': 'Xong',
      'ui.stars': 'Ngôi sao',
      'ui.chapter': 'Chương {n}',
      'ui.allDone': 'Hoàn thành! {stars} ngôi sao',
      'ui.welcome': ['Chào bé {child}! Mình là khỉ Kiki. Mình cùng rung chuông nhé!',
        'Chào bé! Mình là khỉ Kiki. Mình cùng rung chuông nhé!'],
      'ui.micUnsupported': 'Máy này chưa nghe được giọng nói. Bé chạm vào hình nhé!',
      'ui.micDenied': 'Micrô đang tắt. Bé chạm vào hình nhé!',
      'ui.voiceMissing': 'Mẹo cho bố mẹ: thêm giọng tiếng Việt trong Cài đặt › Trợ năng › Nội dung được đọc › Giọng nói.',
      'ui.tapOrSay': 'Bé chạm hoặc nói đáp án nhé!',
      'ui.listening': 'Kiki đang nghe…',
      'ui.tapKiki': 'Chạm vào Kiki để nghe lại nhé',
      'ui.tapHint': 'Bé chạm vào chuông để chuông reo nhé',
      'ui.swipeHint': 'Bé vuốt tay qua các chuông nhé',
      'ui.skip': 'Bỏ qua',
      'ui.gallery': 'Bài hát của bé',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Chuông sắc màu',
      'topic.shapes': 'Chuông hình khối',
      'topic.size': 'To và nhỏ',
      'topic.count': 'Cùng đếm nào',
      'topic.animals': 'Bạn thú rừng xanh',
      'topic.letters': 'Chuông chữ cái',
      'topic.lower': 'Chữ hoa, chữ thường',
      'topic.initial': 'Chữ cái đầu tiên',
      'topic.add': 'Phép cộng',
      'topic.sub': 'Phép trừ',
      'topic.oddeven': 'Số chẵn, số lẻ',

      'weather.0': 'Chào buổi sáng, núi ơi!',
      'weather.1': 'Buổi trưa nắng đẹp quá!',
      'weather.2': 'Hoàng hôn đến rồi!',
      'weather.3': 'Đêm đầy sao lấp lánh!',

      'enter': ['Chuông mới nè!', 'Nhìn kìa, chuông mới!', 'Chuông mới tới rồi!'],

      'p.any': ['Bé ơi, mình rung chuông nhé!', 'Bé chạm một cái chuông, nghe chuông hát nào!', 'Mình rung chuông nào đây nhỉ?'],
      'p.next': ['Tiếp nào!', 'Thêm nữa nhé!', 'Giờ thì'],
      'p.colors': ['Bé ơi, rung chuông {color} nhé!', 'Chuông {color} đâu rồi nhỉ? Bé rung nào!', 'Bé rung chuông {color} nào!'],
      'p.shapes': ['Bé ơi, rung chuông {shape} nhé!', 'Chuông {shape} đâu rồi nhỉ? Bé rung nào!', 'Bé rung chuông {shape} nào!'],
      'p.shapes5': ['Bé ơi, rung chuông {shape} {color} nhé!', 'Chuông {shape} {color} đâu rồi nhỉ? Bé rung nào!',
        'Bé rung chuông {shape} {color} nào!'],
      'p.size': ['Bé ơi, rung chuông {size} nhé!', 'Chuông nào {size} nhỉ? Bé rung nào!', 'Bé rung cái chuông {size} nào!'],
      'p.sizeAny': ['Bé ơi, rung chuông to nhé!', 'Chuông nào to nhỉ? Bé rung nào!', 'Bé rung cái chuông to nào!'],
      'p.animals': ['Bé ơi, rung chuông {animal} nhé!', 'Chuông {animal} đâu rồi nhỉ? Bé rung nào!', 'Rung chuông {animal} nào!'],
      'p.count': ['Bé ơi, rung {holder} có {num} {items} nhé!', 'Mình đếm nhé! {holder} nào có {num} {items}? Bé rung nào!',
        'Bé tìm {holder} có {num} {items} rồi rung nào!'],
      'p.letters': ['Bé ơi, rung chuông chữ {letter} nhé!', 'Chữ {letter} ở đâu nhỉ? Bé rung nào!', 'Bé rung chuông chữ {letter} nào!'],
      'p.lower': ['Bé ơi, chữ {letter} hoa có một bạn nhỏ. Bé rung chữ {lower} thường nhé!', 'Bé rung chữ {lower} thường nào!',
        'Chữ {lower} thường ở đâu nhỉ? Bạn ấy đi cùng chữ {letter} hoa đó!'],
      'p.initial': ['Bé ơi, rung con vật bắt đầu bằng chữ {letter} nhé!', 'Bạn nào bắt đầu bằng chữ {letter}? Bé rung nào!',
        'Bé nghe nè, chữ {letter}! Con vật nào bắt đầu bằng chữ {letter}?'],
      'p.add': ['Bé ơi, {a} + {b} bằng mấy? Bé rung chuông đáp án nhé!', 'Mình cộng nào! {a} + {b}. Bé rung đáp án nhé!',
        'Bé tính nhé: {a} + {b}! Rung đáp án nào!'],
      'p.sub': ['Bé ơi, {a} − {b} bằng mấy? Bé rung chuông đáp án nhé!', 'Mình trừ nào! {a} − {b}. Bé rung đáp án nhé!',
        'Có {a}, bớt đi {b}! Bé rung đáp án nào!'],
      'p.oddeven': ['Bé ơi, rung hết các số {parity} nhé!', 'Bé tìm hết các số {parity} rồi rung nào!', 'Mình rung các số {parity} nhé!'],

      'name.say': ['{thing}!'],
      'tap': ['{thing}!', 'Nhìn nè, {thing}!', 'Đây là {thing} nè!'],
      'right': ['Đinh đoong! {thing}!', 'Leng keng! {thing} nè!', '{thing}! Hay quá!'],
      'right.label': ['Đinh đoong! {label}!', '{label}! Hay quá!', 'Leng keng! {label} nè!'],
      'right.parity': ['{num} là số {parity}!', 'Đúng rồi! {num} là số {parity}!', 'Đinh đoong! {num} là số {parity}!'],
      'right.initial': ['Chữ {letter}, {word}!', 'Đúng rồi! Chữ {letter}, {word}!', 'Đinh đoong! Chữ {letter}, {word}!'],
      'right.sum': ['{ans}! {expr} bằng {ans}!', 'Đúng rồi! {expr} bằng {ans}!', 'Đinh đoong! {expr} bằng {ans}!'],
      'right.any': ['Đinh đoong! Hay quá!', 'Leng keng! Đúng rồi!', 'Đinh đoong! Hoan hô!'],
      'countDone': ['{num} {items}! Hoan hô!', 'Mình đếm được {num} {items} rồi!', '{num} {items}! Bé đếm giỏi quá!'],
      'lantern': ['Đèn lồng sáng lên rồi!', 'Nhìn kìa, đèn lồng sáng rồi!', 'Thêm một chiếc đèn lồng!'],

      'wrong.thing': ['Đây là {got}. Mình rung {want} nhé!', 'Ồ, {got} nè! {want} ở đâu nhỉ?', 'Cái này là {got}! Bé tìm {want} nào!'],
      'wrong.count': ['{holder} này có {got}. Mình rung {holder} có {want} nhé!', 'Ồ, {got} nè! Bé tìm {holder} có {want} nào!',
        'Mình đếm nhé: {got}! Mình cần {want} nè!'],
      'wrong.math': ['Đây là {got}. Mình đếm lại nhé!', 'Ồ, {got}. Bé đếm thêm lần nữa nào!', 'Đây là {got}! Bé nghĩ thêm chút nhé!'],
      'wrong.parity': ['{num} là số {parity}! Mình tìm số khác nhé!', '{num} là số {parity}. Bé rung số khác nào!',
        '{num} là số {parity}! Bé thử số khác nhé!'],
      'wrong.initial': ['{word} bắt đầu bằng chữ {first}! Mình tìm lại nhé!', '{word} bắt đầu bằng chữ {first}. Bé rung bạn khác nào!',
        '{word} bắt đầu bằng chữ {first}! Bé thử bạn khác nhé!'],
      'wrong.any': ['Mình tìm lại nhé!', 'Bé thử chuông khác nào!', 'Bé nghĩ thêm chút nữa nhé!', 'Cố lên, bé làm được mà!'],
      'stepDone': ['Hoan hô!', 'Bé rung chuông giỏi quá!', 'Tuyệt vời!', 'Leng keng, hay quá!'],
      'song': ['Giờ mình cùng hát nhé — bé vuốt qua các chuông nào!', 'Đến giờ hát rồi! Bé vuốt qua tất cả các chuông nhé!',
        'Mình cùng chơi nhạc nào! Bé vuốt tay qua các chuông nhé!'],
      'songShort': ['Giờ mình hát nào!', 'Bé vuốt để hát nhé!', 'Đến giờ hát rồi!'],
      'songDone': ['Bé chơi nhạc hay quá!', 'Bài hát hay quá, bé {child} ơi!', 'Leng keng! Hay quá đi!', 'Oa, bài hát tuyệt quá!'],
      'surprise.hedgehog': ['Nhìn kìa! Một bạn nhím nhỏ!', 'Khụt khịt! Ai đó nhỉ?', 'Bạn nhím đi dạo kìa!'],
      'hedgehog.tap': ['Lăn, lăn! Một quả bóng gai!', 'Bạn nhím cuộn tròn rồi! Hi hi!', 'Khụt khịt! Chào bạn nhím!'],
      'surprise.bird': ['Nhìn kìa! Một bạn chim nhỏ!', 'Chíp chíp! Ai đó nhỉ?', 'Bạn chim đến nghe nhạc nè!'],
      'bird.tap': ['Chíp chíp! Bạn chim hát theo bé nè!', 'Chíp chíp! Hay quá!', 'Bạn chim hát cùng bé nè!'],
      'surprise.fireflies': ['Nhìn kìa! Đom đóm!', 'Lấp lánh, lấp lánh! Đom đóm nè!', 'Các bạn đom đóm đến chơi nè!'],
      'firefly.tap': ['Lấp lánh!', 'Vụt! Lấp lánh!', 'Lung linh quá!'],
      'kiki.poke': ['Hi hi! Nhột quá!', 'Úp úp! Chào bé nè!', 'Kiki vui quá!'],

      'praise': ['Đúng rồi!', 'Giỏi quá!', 'Tuyệt vời!', 'Hoan hô!', 'Bé giỏi lắm!', 'Chính xác!', 'Hay quá!', 'Hay lắm!'],
      'great': ['Bé {child} chơi nhạc hay quá!', 'Hoan hô bé {child}!', 'Ngôi sao âm nhạc đây rồi!', 'Oa, bé {child} rung chuông siêu giỏi!',
        'Hoan hô! Bài hát xong rồi!', 'Bé thông minh quá!', 'Bé chơi nhạc hay quá!'],
      'party': ['Nhìn đèn lồng của mình nè!', 'Hoan hô! Một ngày âm nhạc tuyệt quá!', 'Đèn lồng sáng hết rồi!'],
      'hint': ['Nhìn nè! Chuông này đang lấp lánh.', 'Bé xem bàn tay nhỏ chỉ nè!', 'Kiki giúp bé nhé! Rung chuông này nè!',
        'Nhìn kìa, chuông này sáng lên!', 'Chuông lấp lánh đó! Bé chạm vào nhé!'],
      'idle': ['Mình rung chuông nào!', 'Kiki đang chờ bé nè!', 'Bé chạm vào một cái chuông nhé!', 'Bé {child} ơi, mình chơi tiếp nhé!',
        'Các chuông muốn hát nè!', 'Chuông nào tiếp theo đây nhỉ?'],

      'talk.intro': 'Mình cùng nói chuyện nhé!',
      'talk.colors': 'Chuông này màu gì nhỉ?',
      'talk.colorsAny': 'Cái này màu gì nhỉ?',
      'talk.colorsWhich': 'Chuông nào {color} nhỉ?',
      'talk.shapes': '{shape} là cái nào nhỉ?',
      'talk.shapesAny': 'Cái này hình gì nhỉ?',
      'talk.shapes5': '{shape} {color} là cái nào nhỉ?',
      'talk.size': 'Chuông nào {size} nhỉ?',
      'talk.sizeAny': 'Cái nào to nhỉ?',
      'talk.count': 'Có mấy {itemsPl} nào?',
      'talk.countAny': 'Có bao nhiêu cái nào?',
      'talk.animals': '{animal} ở đâu nhỉ?',
      'talk.animalsAny': 'Đây là con gì nhỉ?',
      'talk.animalsWho': 'Đây là con gì nhỉ?',
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
      'talk.wrong.size': 'Là chuông {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.letter': 'Là chữ {letter} đó! Bé cố gắng lắm!',
      'talk.wrong.small': 'Là chữ {letter} thường đó! Bé cố gắng lắm!',
      'talk.wrong.number': 'Là số {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.any': 'Bé cố gắng lắm! Mình rung chuông tiếp nhé!',

      'session.done': ['Một ngày âm nhạc tuyệt quá! {stars} ngôi sao!', 'Bé {child} giỏi quá! {stars} ngôi sao!',
        'Bé chơi được bao nhiêu là bài hát! {stars} ngôi sao!']
    }
  };
  // count.0 … count.20: "One!" / "Một!"
  LANGS.forEach(function (l) {
    for (var i = 0; i <= MAX_COUNT; i++) {
      var w = NUM[l][i];
      STR[l]['count.' + i] = w.charAt(0).toUpperCase() + w.slice(1) + '!';
    }
  });

  // required params → fallback key when one is missing (checked AFTER derived params are filled in)
  var NEEDS = {
    'name.say': ['thing'], 'tap': ['thing'], 'right': ['thing'], 'right.label': ['label'],
    'right.parity': ['num', 'parity'], 'right.initial': ['letter', 'word'], 'right.sum': ['expr', 'ans'], 'countDone': ['n'],
    'wrong.thing': ['got', 'want'], 'wrong.count': ['got', 'want'], 'wrong.math': ['got'], 'wrong.parity': ['num', 'parity'],
    'wrong.initial': ['word', 'first'],
    'talk.colorsWhich': ['color'], 'talk.shapes': ['shape'], 'talk.shapes5': ['shape', 'color'],
    'talk.size': ['size'], 'talk.animals': ['animal'], 'talk.letters': ['letter'], 'talk.lower': ['letter'],
    'talk.initial': ['word'], 'talk.add': ['a', 'b'], 'talk.sub': ['a', 'b'], 'talk.oddeven': ['parity'],
    'talk.wrong': ['answer'], 'talk.wrong.a': ['answer'], 'talk.wrong.animal': ['answer'], 'talk.wrong.size': ['answer'],
    'talk.wrong.letter': ['letter'], 'talk.wrong.small': ['letter'], 'talk.wrong.number': ['answer']
  };
  Object.keys(PROMPTS).forEach(function (k) { NEEDS[k] = PROMPTS[k]; });
  var FALLBACK = { 'p.shapes5': 'p.shapes', 'p.size': 'p.sizeAny', 'countDone': 'stepDone',
    'name.say': 'praise', 'tap': 'praise', 'right': 'right.any',
    'talk.colorsWhich': 'talk.colorsAny', 'talk.shapes': 'talk.shapesAny', 'talk.shapes5': 'talk.shapes',
    'talk.size': 'talk.sizeAny', 'talk.animals': 'talk.animalsAny', 'talk.letters': 'talk.lettersAny',
    'talk.lower': 'talk.lowerAny', 'talk.initial': 'talk.initialAny', 'talk.add': 'talk.calc', 'talk.sub': 'talk.calc',
    'talk.oddeven': 'talk.oddevenAny' };
  Object.keys(NEEDS).forEach(function (k) {
    if (FALLBACK[k]) return;
    if (/^p\./.test(k)) FALLBACK[k] = 'p.any';
    else if (/^right\./.test(k)) FALLBACK[k] = 'right.any';
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
    return String(s).normalize('NFD').replace(/[̣̀́̃̉]/g, '').normalize('NFC');
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
    var s = String(v).toLowerCase().replace(/\.svg$/, '').replace(/^(animal|chime)_/, '');
    if (s === 'bunny') s = 'rabbit';
    return ANIMALS.indexOf(s) >= 0 ? s : null;
  }
  function sizeOf(v) {
    if (v === true) return 'big';
    if (v === false) return 'small';
    var s = low(v);
    if (/(^|[_:\-\s])(big|large)($|[_:\-\s])/.test(s)) return 'big';
    if (/(^|[_:\-\s])(small|little)($|[_:\-\s])/.test(s)) return 'small';
    return null;
  }
  // a thing's size: big true/false, or size 'big'/'small'
  function thingSize(t) {
    t = obj(t);
    if (t.big === true || t.big === false) return t.big ? 'big' : 'small';
    if (t.nameKind === 'size' && sizeOf(t.nameValue)) return sizeOf(t.nameValue);
    return sizeOf(t.size);
  }
  function shapeOf(v) { var s = low(v); return NAMES.en.shape[s] != null ? s : null; }
  function colorOf(v) { var s = low(v); return NAMES.en.color[s] != null ? s : null; }
  function chimeKind(v) {
    var s = low(v);
    if (KIND_ALIAS[s]) s = KIND_ALIAS[s];
    return CHIME_KINDS.indexOf(s) >= 0 ? s : null;
  }
  // the counted-items kind: 'string' (little bells on a bar, default) | 'dots'
  function itemsKind(v) {
    if (v && typeof v === 'object') v = v.kind != null ? v.kind : v.items;
    var s = low(v);
    return (s === 'dots' || s === 'dot') ? 'dots' : 'string';
  }
  function itemsWord(lang, kind, n, run) {
    var tbl = (run ? RUN : ITEMS)[L(lang)][itemsKind(kind)];
    return tbl[n === 1 ? 0 : 1];
  }

  // ---- words for the 'initial' topic: tolerant of whatever shape content.js gives CC.WORDS
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
    var src = CC.WORDS, list = [];
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
    var tbl, vi = lang === 'vi';
    switch (kind) {
      case 'number': return numberName(lang, value);
      case 'dots': case 'string': case 'bunch': {
        var n = num(value);
        return n == null ? String(value) : numberName(lang, n) + ' ' + itemsWord(lang, kind, n);
      }
      case 'bell': {
        var bc = colorOf(value), bs = sizeOf(value);
        if (bs) return vi ? 'chuông ' + NAMES.vi.size[bs] : NAMES.en.size[bs] + ' bell';
        if (bc) return vi ? 'chuông ' + NAMES.vi.color[bc] : NAMES.en.color[bc] + ' bell';
        return vi ? 'chuông' : 'bell';
      }
      case 'plate': {
        var ps = shapeOf(value);
        if (!ps) return vi ? 'chuông' : 'chime';
        return vi ? 'chuông ' + NAMES.vi.shapeH[ps] : NAMES.en.shape[ps] + ' chime';
      }
      case 'letter': {
        var s = String(value);
        if (vi) return LETTER_VI[upper(s)] || s.toLowerCase();
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
        return NAMES[lang].animal[a];
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

  // a Talk-time choice / picture thing → [kind, value].
  // Chime things: bell {color} → colour (with `big` → size); plate {shape} → shape; string / dots / number {n} → number;
  // animal → animal; glyph {text} → text; icons: color {color}, number {n}, size {big}; {nameKind, nameValue} wins;
  // {id, thing, value}.
  function kvOf(t) {
    var kv = kvRaw(t);
    return [kv[0], scalar(kv[1])];
  }
  function kvRaw(t) {
    t = obj(t);
    if (t.thing && typeof t.thing === 'object') return kvRaw(t.thing);
    if (t.nameKind != null) return [t.nameKind, t.nameValue];
    switch (low(t.kind)) {
      case 'color': case 'blob': case 'paint':
        return ['color', t.color != null ? t.color : t.value];
      case 'bell': case 'obj':
        if (t.big === true || t.big === false) return ['size', t.big ? 'big' : 'small'];
        if (t.color != null) return ['color', t.color];
        return ['bell', t.value];
      case 'plate': case 'shape':
        if (t.shape != null) return ['shape', t.shape];
        return t.value != null ? ['shape', t.value] : ['color', t.color];
      case 'size': {
        var sz = thingSize(t);
        return ['size', sz != null ? sz : t.value];
      }
      case 'animal':
        if (t.big === true || t.big === false) return ['size', t.big ? 'big' : 'small'];
        return ['animal', t.animal != null ? t.animal : t.value];
      case 'number': case 'dots': case 'string': case 'bunch': return ['number', t.n != null ? t.n : t.value];
      case 'letter': return ['letter', t.text != null ? t.text : t.value];
      case 'glyph': case 'text': case 'tag': return ['text', t.text != null ? t.text : (t.n != null ? t.n : t.value)];
      case 'parity': return ['parity', t.value];
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
      case 'dots': case 'string': case 'bunch': {
        var dn = num(value);
        out = numberWords(lang, value);
        if (dn != null) addForms(out, [name(lang, kind, dn), dn + ' ' + itemsWord(lang, kind, dn)]);
        return out;
      }
      case 'bell': {
        if (colorOf(value)) return words(lang, 'color', value).concat(addForms([], [name(lang, 'bell', value)]));
        if (sizeOf(value)) return words(lang, 'size', value).concat(addForms([], [name(lang, 'bell', value)]));
        return addForms(out, [name(lang, 'bell', value)]);
      }
      case 'plate': return words(lang, 'shape', value);
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
      case 'shape': {
        var sh = shapeOf(value);
        if (!sh) return addForms(out, [String(value)]);
        return addForms(out, [NAMES[lang].shape[sh], NAMES[lang].shapeH[sh]].concat(WORDS[lang].shape[sh] || []));
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
  // {nameKind, nameValue} | {kind, value} | (kind, value). EN gets "the" where natural; VI the plain name.
  function scalar(v) { return (typeof v === 'string' || (typeof v === 'number' && isFinite(v))) ? v : null; }
  function thingOf(a, b) {
    if (typeof a === 'string') return { k: a, v: scalar(b) };
    var t = obj(a);
    var hasName = t.nameKind != null;
    return { k: hasName ? scalar(t.nameKind) : scalar(t.kind), v: scalar(hasName ? t.nameValue : t.value),
      size: t.size, animal: t.animal, text: t.text };
  }
  function phraseOf(lang, th) {
    var vi = lang === 'vi', k = th.k, v = th.v, out = '';
    switch (k) {
      case 'color': case 'hue': out = name(lang, 'color', v); break;
      case 'shape': out = vi ? name(lang, 'shape', v) : 'the ' + name(lang, 'shape', v); break;
      case 'animal': case 'word': out = vi ? name(lang, 'animal', v) : 'the ' + name(lang, 'animal', v); break;
      case 'bell': case 'plate': out = vi ? name(lang, k, v) : 'the ' + name(lang, k, v); break;
      case 'size': out = vi ? 'chuông ' + name(lang, 'size', v) : 'the ' + name(lang, 'size', v) + ' one'; break;
      case 'dots': case 'string': case 'bunch': out = num(v) != null ? name(lang, k, num(v)) : ''; break;
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

  // ---------------------------------------------------------------- chimePhrase: a hanging chime named
  // thing = { kind: bell|plate|string|dots|animal|glyph (or a Talk icon: color|number|size), color?, shape?, n?, animal?,
  //           text?, big?, nameKind?, nameValue? }
  // opts = { art: 'the' (default) | 'a' | null (EN article), color: true|false (plate: say its colour; default no),
  //          size: bool (bell: say big/small; default when nameKind is 'size' or big is set), chime: bool (VI animal:
  //          "chuông con gấu"), bare: bool (numbers without "number": "five") }. Unknown things → their name phrase (or '').
  function chimePhrase(lang, t, opts) {
    lang = L(lang);
    t = obj(t);
    opts = opts || {};
    var vi = lang === 'vi';
    var art = opts.art === undefined ? 'the' : opts.art;
    var kind = chimeKind(t.kind) || (['color', 'size', 'letter', 'text'].indexOf(t.kind) >= 0 ? t.kind : null);
    if (t.kind === 'number' && t.text == null && t.n != null) kind = 'number';
    if (!kind) return t.nameKind != null ? phraseOf(lang, thingOf(t)) : '';
    var col = colorOf(t.color);
    function withArt(s) { return art ? art + ' ' + s : s; }
    switch (kind) {
      case 'bell': {
        var sz = opts.size === false ? null : thingSize(t);
        if (opts.size !== true && t.nameKind !== 'size' && t.big !== true && t.big !== false) sz = null;
        var useCol = col && (opts.color === true || (opts.color !== false && !sz));
        if (vi) return 'chuông' + (sz ? ' ' + NAMES.vi.size[sz] : '') + (useCol ? ' ' + NAMES.vi.color[col] : '');
        return anFix(withArt((sz ? NAMES.en.size[sz] + ' ' : '') + (useCol ? NAMES.en.color[col] + ' ' : '') + 'bell'));
      }
      case 'plate': {
        var sh = shapeOf(t.shape != null ? t.shape : (t.nameKind === 'shape' ? t.nameValue : null));
        var useC = col && opts.color === true;
        if (!sh) return useC ? (vi ? 'chuông ' + NAMES.vi.color[col] : anFix(withArt(NAMES.en.color[col] + ' chime'))) : (vi ? 'chuông' : withArt('chime'));
        if (vi) return 'chuông ' + NAMES.vi.shapeH[sh] + (useC ? ' ' + NAMES.vi.color[col] : '');
        return anFix(withArt((useC ? NAMES.en.color[col] + ' ' : '') + NAMES.en.shape[sh]));
      }
      case 'string': case 'dots': {
        var n = num(t.n != null ? t.n : (t.nameKind === 'number' || t.nameKind === kind ? t.nameValue : null));
        if (n == null) return vi ? (kind === 'dots' ? 'chuông có chấm' : 'chùm chuông') : withArt(kind === 'dots' ? 'dot chime' : 'bell string');
        if (vi && kind === 'string') return 'chùm ' + name(lang, kind, n);
        return name(lang, kind, n);
      }
      case 'animal': {
        var an = animalOf(t.animal != null ? t.animal : (t.nameKind === 'animal' ? t.nameValue : null));
        if (!an) return '';
        if (vi) return (opts.chime ? 'chuông ' : '') + NAMES.vi.animal[an];
        return anFix(withArt(NAMES.en.animal[an]));
      }
      case 'glyph': case 'text': case 'letter': case 'number': {
        var tx = t.text != null ? t.text : (t.n != null ? t.n : t.nameValue);
        if (tx == null) return '';
        var k2 = kind === 'number' || num(tx) != null ? 'number' : (isLetter(String(tx)) ? 'letter' : 'text');
        if (opts.bare && k2 === 'number') return numberName(lang, num(tx));
        return phraseOf(lang, { k: k2, v: k2 === 'number' ? num(tx) : String(tx) });
      }
      case 'color':
        return col ? name(lang, 'color', col) : '';
      case 'size': {
        var s2 = thingSize(t);
        return s2 ? phraseOf(lang, { k: 'size', v: s2 }) : '';
      }
    }
    return '';
  }

  // ---------------------------------------------------------------- t()
  var I18N = { langs: LANGS.slice(), child: '' };

  function derive(lang, params, key) {
    var p = {}, k;
    if (params && typeof params === 'object') for (k in params) if (Object.prototype.hasOwnProperty.call(params, k)) p[k] = params[k];
    key = key || '';
    var pth = obj(p.thing);
    // {hue} = bare colour (vi "đỏ")
    if (!present(p.hue) && present(p.color)) p.hue = name(lang, 'hue', rawVal(p.color));
    // VI chime shapes: "chuông hình ngôi sao", "Hình trái tim là cái nào nhỉ?"
    if (lang === 'vi' && present(p.shape) && /^(p\.shapes|talk\.shapes)/.test(key) && shapeOf(rawVal(p.shape)))
      p.shape = { kind: 'shapeH', value: shapeOf(rawVal(p.shape)) };
    // {size} from big
    if (!present(p.size) && (p.big === true || p.big === false)) p.size = p.big ? 'big' : 'small';
    // {word} from animal
    if (present(p.animal) && animalOf(p.animal) && !present(p.word)) p.word = wordName(lang, animalOf(p.animal));
    if (present(p.word)) p.word = wordName(lang, p.word);
    // {letter} / {lower}
    if (!present(p.letter) && present(p.text) && isLetter(String(rawVal(p.text)))) p.letter = String(rawVal(p.text));
    if (present(p.letter)) {
      p.letter = String(rawVal(p.letter));
      if (/^(p|talk)\.lower$/.test(key)) { p.lower = p.letter.toLowerCase(); p.letter = p.letter.toUpperCase(); }
      if (!present(p.lower)) p.lower = present(p.small) ? String(rawVal(p.small)) : p.letter.toLowerCase();
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
    // {num} + {items} + {holder} from n (+ kind 'string' | 'dots')
    var c = present(p.n) ? num(p.n) : null;
    if (!present(p.num) && c != null) p.num = numberName(lang, c);
    if (present(p.n) && typeof p.n === 'object') p.n = c != null ? c : '';
    var ik = present(p.kind) ? p.kind : (pth.kind || (p.dots ? 'dots' : 'string'));
    if (!present(p.items) || typeof p.items !== 'string' || /^(dots?|string|bunch|bells?)$/.test(p.items)) {
      p.items = itemsWord(lang, present(p.items) ? p.items : ik, c == null ? 2 : c);
    }
    // {itemsPl}: always the plural ("How many bells?" even when the shown chime has one bell)
    if (!present(p.itemsPl)) p.itemsPl = itemsWord(lang, ik, 2);
    if (!present(p.holder)) p.holder = HOLDER[lang][itemsKind(ik)];
    // {got}/{want}/{label} objects → phrases; {thing} object → its chime phrase
    ['got', 'want', 'label'].forEach(function (q) {
      if (p[q] && typeof p[q] === 'object') p[q] = present(p[q]) ? phraseOf(lang, thingOf(p[q])) : (chimePhrase(lang, p[q]) || '');
    });
    if (p.thing && typeof p.thing === 'object') p.thing = chimePhrase(lang, p.thing);
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

  // the step prompt; opts.next → "Next one! Ring the red bell!" / "Now, ring the bear!" (main: the 2nd+ step).
  // A p.next variant without end punctuation ("Now," / "Giờ thì") runs into the prompt (its first letter lower-cased).
  I18N.ask = function (lang, key, params, opts) {
    opts = opts || {};
    var line = I18N.t(lang, key, params, opts.rng);
    if (!opts.next) return line;
    var pre = I18N.t(lang, 'p.next', null, opts.rng);
    if (L(lang) === 'vi') {
      // no "Bé ơi," in mid-sentence after a prefix ("Thêm một chuông nữa nhé! Bé rung …", "Giờ thì bé rung …")
      if (/^Bé ơi, (rung|tìm|chạm) /.test(line)) line = line.replace(/^Bé ơi, (rung|tìm|chạm) /, 'Bé $1 ');
      else if (/^Bé ơi, /.test(line)) { line = line.slice(7); line = line.charAt(0).toUpperCase() + line.slice(1); }
      // never the same particle twice ("Tiếp nào! … nào!", "… nữa nhé! … nhé!"): take another prefix
      var PT = /(nhé|nào|nhỉ)[!?]$/, has = function (q) { var m = PT.exec(q); return !!m && line.indexOf(m[1] + q.slice(-1)) >= 0; };
      if (PT.exec(pre) && has(pre)) {
        var alts = [].concat(I18N.raw(lang, 'p.next') || []).filter(function (q) { return !has(q); });
        if (alts.length) pre = alts[0];
      }
    }
    if (/[!?.…]$/.test(pre)) return pre + ' ' + line;
    var lowered = /^\p{Lu}\p{Ll}/u.test(line) ? line.charAt(0).toLowerCase() + line.slice(1) : line;
    return pre + ' ' + lowered;
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
  I18N.chimePhrase = chimePhrase;
  I18N.piecePhrase = chimePhrase;
  // any thing → a phrase: chime things / Talk icons via chimePhrase, else {nameKind, nameValue} / (kind, value)
  I18N.phrase = function (lang, a, b) {
    lang = L(lang);
    if (a && typeof a === 'object' && a.thing && typeof a.thing === 'object') a = a.thing;
    if (a && typeof a === 'object' && a.kind != null) { var s = chimePhrase(lang, a); if (s) return s; }
    return phraseOf(lang, thingOf(a, b));
  };
  I18N.choiceWords = function (lang, choice) { return words(lang, choice); };   // Talk choice {id, thing} → spoken forms
  I18N.kindValue = kvOf;
  I18N.TOPICS = TOPICS.slice();
  I18N.ANIMALS = ANIMALS.slice();
  I18N.SHAPES = SHAPES.slice();
  I18N.COLORS = COLORS.slice();
  I18N.CHIME_KINDS = CHIME_KINDS.slice();
  I18N.NAME_KINDS = NAME_KINDS.slice();
  I18N.PROMPTS = PROMPTS;
  I18N.PARAMS = NEEDS;
  I18N.NAME_TABLE = NAMES;
  I18N.LETTER_VI = LETTER_VI;
  I18N.WORD_LIST = WORD_LIST;
  I18N.MAX_COUNT = MAX_COUNT;

  // ---------------------------------------------------------------- game lines
  // a chime thing rebuilt from {nameKind, nameValue} + topic (when main did not pass e.thing)
  function thingFromName(nk, nv, topic, params) {
    params = obj(params);
    switch (nk) {
      case 'color': return { kind: topic === 'shapes' ? 'plate' : 'bell', color: nv, nameKind: nk, nameValue: nv };
      case 'size': return { kind: 'bell', big: sizeOf(nv) === 'big', color: params.color, nameKind: nk, nameValue: nv };
      case 'shape': return { kind: 'plate', shape: nv, color: params.color, nameKind: nk, nameValue: nv };
      case 'animal': case 'word': return { kind: 'animal', animal: nv, nameKind: 'animal', nameValue: nv };
      case 'number':
        if (topic === 'count') return { kind: itemsKind(params.kind) === 'dots' ? 'dots' : 'string', n: num(nv), nameKind: nk, nameValue: nv };
        return { kind: 'glyph', text: String(nv), n: num(nv), nameKind: nk, nameValue: nv };
      case 'letter': case 'text': case 'parity':
        return { kind: 'glyph', text: String(nv), n: num(nv) != null ? num(nv) : undefined, nameKind: nk, nameValue: nv };
    }
    return null;
  }
  // the chime thing of an event: e.thing — or e itself when it carries kind / nameKind — or rebuilt from e.got
  function evThing(ev, from) {
    ev = obj(ev);
    if (ev.thing && typeof ev.thing === 'object') return ev.thing;
    if (chimeKind(ev.kind)) return ev;
    var src = obj(from != null ? from : ev);
    if (src.nameKind != null) return thingFromName(src.nameKind, src.nameValue, ev.topic, ev.params) || src;
    return {};
  }
  // what the current step is about: size round? shapes-with-colours round?
  function ctxOf(ev) {
    ev = obj(ev);
    var params = obj(ev.params), topic = ev.topic, pk = String(ev.promptKey || '');
    var want = thingOf(ev.want);
    return {
      topic: topic, params: params,
      size: topic === 'size' || pk === 'p.size' || want.k === 'size' || present(params.size),
      // shapes with colours (age 5): only p.shapes5 names the colour — content.js also sends {color} with p.shapes
      // (the round's one plate colour), which must not be said
      mix: pk ? pk === 'p.shapes5' : (present(params.shape) && present(params.color))
    };
  }
  function nameOpts(t, cx, chime) {
    var k = chimeKind(t.kind);
    return { size: k === 'bell' ? (cx.size || undefined) : undefined,
      color: k === 'plate' ? cx.mix : (k === 'bell' && cx.size ? false : undefined), chime: !!chime };
  }
  // the spoken name of a chime ("the red bell", "three bells", "letter B", "five")
  function plainName(lang, ev, chime) {
    var t = evThing(ev), cx = ctxOf(ev);
    var k = chimeKind(t.kind);
    if (k === 'glyph') {
      var tx = t.text != null ? t.text : t.nameValue;
      if (num(tx) != null) return numberName(lang, num(tx));
    }
    var s = chimePhrase(lang, t, nameOpts(t, cx, chime));
    if (!s && t.nameKind != null) s = phraseOf(lang, thingOf(t));
    return s;
  }

  // a chime's plain name: sayName(lang, thing | e) → "the red bell" / "chuông màu đỏ"
  I18N.sayName = function (lang, thing) {
    lang = L(lang);
    var e = obj(thing);
    if (!e.thing && !chimeKind(e.kind) && e.nameKind == null) return '';
    return plainName(lang, e.thing || chimeKind(e.kind) ? e : { thing: e }, false) || '';
  };
  // "The red bell!" / "Chuông màu đỏ!" (a brush, a Talk picture tap)
  I18N.sayPickup = function (lang, ev, rng) {
    lang = L(lang);
    var s = plainName(lang, ev, false);
    return s ? I18N.t(lang, 'name.say', { thing: s }, rng) : I18N.t(lang, 'praise', null, rng);
  };
  // "Look, the red bell!" / "Nhìn nè, chuông màu đỏ!"
  I18N.sayTap = function (lang, ev, rng) {
    lang = L(lang);
    var s = plainName(lang, ev, false);
    return s ? I18N.t(lang, 'tap', { thing: s }, rng) : I18N.t(lang, 'p.any', null, rng);
  };

  // `right {id, thing, x, y, count?: {n}}` (+ topic, params, promptKey) → the ding line.
  I18N.sayRight = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var t = evThing(ev), cx = ctxOf(ev), k = chimeKind(t.kind), topic = cx.topic, params = cx.params;
    var cnt = obj(ev.count);
    // a counting string: the count run is the line ("One, two, three bells!")
    if (k === 'string' || (k === 'dots' && num(cnt.n) != null) || (!k && num(cnt.n) != null)) {
      var n = num(cnt.n) != null ? num(cnt.n) : num(t.n != null ? t.n : t.nameValue);
      if (n != null) return I18N.sayCountRun(lang, n, k || params.kind);
    }
    var an = animalOf(t.animal || (t.nameKind === 'animal' ? t.nameValue : null));
    if (topic === 'initial' && an) {
      var ini = initialOf(lang, an);
      return I18N.t(lang, 'right.initial', { letter: ini.first, word: ini.word }, rng);
    }
    if (k === 'glyph' || (!k && ['letter', 'number', 'text', 'sum', 'diff', 'parity'].indexOf(t.nameKind) >= 0)) {
      var tx = t.text != null ? t.text : t.nameValue, gn = num(tx);
      if (topic === 'oddeven' && gn != null) return I18N.t(lang, 'right.parity', { n: gn, parity: gn % 2 ? 'odd' : 'even' }, rng);
      if ((topic === 'add' || topic === 'sub') && gn != null) {
        var a = num(params.a), b = num(params.b);
        if (a != null && b != null) return I18N.t(lang, 'right.sum', { expr: a + (topic === 'add' ? '+' : '−') + b, ans: numberName(lang, gn) }, rng);
      }
      if (gn != null) return I18N.t(lang, 'right.label', { label: numberName(lang, gn) }, rng);
      if (tx != null) return I18N.t(lang, 'right.label', { label: phraseOf(lang, { k: isLetter(String(tx)) ? 'letter' : 'text', v: String(tx) }) }, rng);
    }
    var s = chimePhrase(lang, t, nameOpts(t, cx, false));
    if (!s && t.nameKind != null) s = phraseOf(lang, thingOf(t));
    return s ? I18N.t(lang, 'right', { thing: s }, rng) : I18N.t(lang, 'right.any', null, rng);
  };
  I18N.sayPlaced = I18N.sayRight;

  // what we ring for, named for the wrong line ("the red one", "the triangle", "the big one" / "chuông màu đỏ",
  // "chuông to", "chuông hình tam giác", "chuông con gấu")
  function wantPhrase(lang, want, t, cx) {
    var vi = lang === 'vi', params = cx.params;
    switch (want.k) {
      case 'color': {
        var c = colorOf(want.v);
        if (!c) break;
        return vi ? 'chuông ' + NAMES.vi.color[c] : 'the ' + NAMES.en.color[c] + ' one';
      }
      case 'size': {
        var sz = sizeOf(want.v);
        if (!sz) break;
        return vi ? 'chuông ' + NAMES.vi.size[sz] : 'the ' + NAMES.en.size[sz] + ' one';
      }
      case 'shape': {
        var col = cx.mix ? colorOf(params.color) : null;
        return chimePhrase(lang, { kind: 'plate', shape: want.v, color: col }, { color: !!col });
      }
      case 'animal': return chimePhrase(lang, { kind: 'animal', animal: want.v }, { chime: true });
    }
    return phraseOf(lang, want);
  }

  // `wrong {id, got:{nameKind,nameValue}, want:{nameKind,nameValue}, streak, x, y}` (+ main adds thing = the rung
  // chime's thing, topic, params = the step's params) → names what was rung, then the goal.
  // Maths never names the right answer; parity says what the rung number is; initial says the word's first letter.
  I18N.sayWrong = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var t = obj(ev.thing && typeof ev.thing === 'object' ? ev.thing : (ev.got && chimeKind(ev.got.kind) ? ev.got : evThing(ev, ev.got)));
    var got = thingOf(ev.got), want = thingOf(ev.want), cx = ctxOf(ev), topic = cx.topic, params = cx.params;
    if (got.k == null && t.nameKind != null) got = thingOf(t);
    var k = chimeKind(t.kind);
    var gotTx = t.text != null ? t.text : (got.v != null ? got.v : got.text), gn = num(gotTx);
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
    // counting: "That one has four bells. Let's ring the one with three bells!"
    if (k === 'string' || k === 'dots' || topic === 'count') {
      var gN = num(t.n != null ? t.n : got.v), wN = num(want.v != null ? want.v : params.n);
      var ik = itemsKind(k === 'dots' || k === 'string' ? k : params.kind);
      if (gN != null && wN != null && gN !== wN)
        return I18N.t(lang, 'wrong.count', { got: name(lang, ik, gN), want: name(lang, ik, wN), kind: ik }, rng);
      if (gN == null || wN == null) return I18N.t(lang, 'wrong.any', null, rng);
    }
    var g = k ? chimePhrase(lang, t, nameOpts(t, cx, true)) : '';
    if (!g && got.k && got.v != null) g = phraseOf(lang, got);
    if (g && want.k && want.v != null) {
      var w = wantPhrase(lang, want, t, cx);
      if (w && g !== w) return I18N.t(lang, 'wrong.thing', { got: g, want: w }, rng);
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
  // the whole count in one line: "One, two, three bells!" / "Một, hai, ba cái chuông!" (n = 1: "One bell!")
  I18N.sayCountRun = function (lang, n, kind) {
    lang = L(lang);
    var c = num(n);
    if (c == null || c < 1) return c === 0 ? I18N.sayCount(lang, 0) : I18N.t(lang, 'praise');
    var list = [];
    for (var i = 1; i <= c; i++) list.push(numberName(lang, i));
    return capFirst(list.join(', ') + ' ' + itemsWord(lang, kind, c, true)) + '!';
  };
  // the count is complete: "Three bells! Hooray!"
  I18N.sayCountDone = function (lang, n, kind, rng) {
    if (rng === undefined && kind && typeof kind !== 'string' && typeof kind.kind !== 'string') { rng = kind; kind = null; }
    return I18N.t(lang, 'countDone', { n: num(n), kind: itemsKind(kind) }, rng);
  };

  I18N.talkWrong = function (lang, kind, value) {
    lang = L(lang);
    if (kind && typeof kind === 'object') { var kv = kvOf(kind); kind = kv[0]; value = kv[1]; }
    if (kind === 'blob') kind = 'color';
    if (value == null || value === '') return I18N.t(lang, 'talk.wrong.any');
    var ans = { answer: { kind: kind, value: value } };
    if (kind === 'animal') return animalOf(value) ? I18N.t(lang, 'talk.wrong.animal', ans) : I18N.t(lang, 'talk.wrong', { answer: String(value) });
    if (kind === 'shape' || kind === 'plate') return shapeOf(value) ? I18N.t(lang, lang === 'en' ? 'talk.wrong.a' : 'talk.wrong', { answer: { kind: 'shape', value: value } }) : I18N.t(lang, 'talk.wrong.any');
    if (kind === 'size') return sizeOf(value) ? I18N.t(lang, 'talk.wrong.size', ans) : I18N.t(lang, 'talk.wrong.any');
    if (kind === 'color' || kind === 'hue') return colorOf(value) ? I18N.t(lang, 'talk.wrong', { answer: { kind: 'color', value: value } }) : I18N.t(lang, 'talk.wrong.any');
    if (kind === 'bell') return colorOf(value) ? I18N.talkWrong(lang, 'color', value) : sizeOf(value) ? I18N.talkWrong(lang, 'size', value) : I18N.t(lang, 'talk.wrong.any');
    if (kind === 'letter' || (kind === 'text' && isLetter(String(value)))) {
      var lv = String(value);
      return I18N.t(lang, lv !== lv.toUpperCase() ? 'talk.wrong.small' : 'talk.wrong.letter', { letter: lv });
    }
    if (kind === 'number' || kind === 'dots' || kind === 'string' || kind === 'bunch' || ((kind === 'parity' || kind === 'text') && num(value) != null))
      return num(value) != null ? I18N.t(lang, 'talk.wrong.number', { answer: { kind: 'number', value: num(value) } }) : I18N.t(lang, 'talk.wrong.any');
    if (kind === 'parity' && lang === 'vi') return I18N.t(lang, 'talk.wrong.number', ans);
    return I18N.t(lang, 'talk.wrong', ans);
  };

  // Text → TTS-friendly text (Voice.say calls this). Display text stays untouched.
  // "Kiki" is read well by English and Vietnamese voices ("ki" is an ordinary Vietnamese syllable): no rewrite.
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
      s = s.replace(RE_VI_LETTER, function (m, w, ch) { return w + ' ' + (LETTER_VI[ch.toUpperCase()] || ch.toLowerCase()); });
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 cộng $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 trừ $2')
        .replace(/\s=\s/g, ' bằng ');
    }
    return s.replace(/\s{2,}/g, ' ').trim();
  };

  CC.I18N = I18N;
})(window.CC = window.CC || {});
