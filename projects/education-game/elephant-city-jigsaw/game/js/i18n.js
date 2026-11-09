/* Pom's Puzzle Town — PZ.I18N (English + Vietnamese). Pom (EN/VI lines "Pom", VI titles "Voi Pom") is a cheerful baby
 * elephant with a knitted scarf who loves jigsaw puzzles: the child picks up a puzzle piece ("mảnh ghép") from the tray
 * and drops it into its shadow on the picture board. "Pom" is read naturally by English and Vietnamese voices ("om" is a
 * normal Vietnamese rhyme, like "bom"), so no TTS rewrite is needed (docs/VOICE.md §0).
 *
 *   PZ.I18N.t(lang, key, params, rng?)            → string (variants picked with rng.next()/rng()/Math.random)
 *   PZ.I18N.ask(lang, promptKey, params, {next, rng}) → the step prompt; next:true → "Next one! Find the red piece!"
 *   PZ.I18N.name(lang, kind, value, opts?)        → a name. kinds: color (vi "màu đỏ"), hue (bare, vi "đỏ"), shape, size,
 *                                                   obj (vi with classifier "chiếc ô tô"), animal (opts {size}), word
 *                                                   (animal without classifier), number, dots, bunch, letter, text, sum,
 *                                                   diff, parity
 *   PZ.I18N.words(lang, kind, value)              → accepted spoken forms (lower-case, + no-diacritic forms, digits)
 *   PZ.I18N.choiceWords(lang, choice)             → spoken forms for a Talk choice {id, thing:{kind, …}}
 *   PZ.I18N.piecePhrase(lang, thing, opts?)       → a piece named for a sentence: "the red car", "the triangle", "three
 *                                                   balloons", "five dots", "the dog", "letter B", "small b", "number five"
 *                                                   / "chiếc ô tô màu đỏ", "hình tam giác", "ba quả bóng bay", "con chó" …
 *   PZ.I18N.phrase(lang, thing)                   → the same for any thing / icon / {nameKind, nameValue}
 *   PZ.I18N.sayPickup(lang, e)                    → `pickup`: "The red car!", "The triangle!", "Three balloons!", "The dog!"
 *   PZ.I18N.sayTap(lang, e, rng?)                 → `tapPiece`: "Look, the red car!" (a quick tap names the piece)
 *   PZ.I18N.sayPlaced(lang, e, rng?)              → `placed`: "Click! The red car fits!" (e.named: "Click! It fits!"); counting pieces → the count run
 *                                                   "One, two, three balloons!"; add/sub "Five! 2 + 3 is five!"; oddeven
 *                                                   "Seven is odd!"; initial "D is for dog!"
 *   PZ.I18N.sayWrong(lang, e, rng?)               → `wrong`: "That’s the blue kite. Let’s find the red one!" (names what was
 *                                                   dropped, then the goal; maths never gives the answer away)
 *   PZ.I18N.sayCount(lang, i)                     → "One!" … "Twenty!"
 *   PZ.I18N.sayCountRun(lang, n, kind?)           → "One, two, three balloons!" / "Một, hai, ba quả bóng!" (kind 'bunch' |
 *                                                   'dots' | a thing; default balloons)
 *   PZ.I18N.sayCountDone(lang, n, kind?, rng?)    → "Three balloons! Hooray!"
 *   PZ.I18N.talkWrong(lang, choice | kind, value) → gentle "It is red! Good try!" for a missed Talk-time answer
 *   PZ.I18N.speech(lang, text)                    → text tuned for TTS (letter names, + − =, " — " pause)
 *   PZ.I18N.setChild(name)  has(lang, key)  keys(lang)  raw(lang, key)  langs  PARAMS  TOPICS  ANIMALS  OBJECTS  SHAPES
 *
 * Event objects `e` (main passes the world event + { topic, params (the current step's params), thing (the piece's thing),
 * promptKey }): thing = { kind 'obj'|'shape'|'bunch'|'dots'|'animal'|'glyph', obj?, color?, shape?, n?, animal?, text?,
 * big?, nameKind, nameValue }.
 * Params: values may be RAW ({color:'red'}, {animal:'dog'}, {obj:'car'}, {n:3}) — keys named like a name kind are named
 * automatically; an object {kind, value} or {nameKind, nameValue} is replaced by its name / phrase; {thing: {...}} → its
 * piece phrase.
 * Derived params: {hue} (bare colour) from color, {obj} (the object noun) from obj / animal, {word} from animal, {lower}
 * from letter, {expr} from a,b / text, {num} (number word) and {items} ("balloons"/"balloon"/"dots", vi "quả bóng bay" /
 * "chấm") from n and kind ('bunch' default, 'dots').
 * Keys with required params (PARAMS) fall back to a generic key when a param is missing (never "the !" on screen).
 * {child}: if the child's name is empty, variants containing {child} are skipped.
 */
(function (PZ) {
  'use strict';

  var LANGS = ['en', 'vi'];
  var ANIMALS = ['duck', 'cat', 'dog', 'cow', 'pig', 'frog', 'lion', 'rabbit'];
  var OBJECTS = ['car', 'bus', 'balloon', 'kite', 'umbrella', 'house', 'flower', 'hat'];
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
  var COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  var PIECE_KINDS = ['obj', 'shape', 'bunch', 'dots', 'animal', 'glyph'];

  // ---------------------------------------------------------------- names
  var NAMES = { en: {}, vi: {} };
  NAMES.en.color = { red: 'red', blue: 'blue', yellow: 'yellow', green: 'green', orange: 'orange', purple: 'purple', pink: 'pink' };
  NAMES.vi.color = { red: 'màu đỏ', blue: 'màu xanh dương', yellow: 'màu vàng', green: 'màu xanh lá', orange: 'màu cam',
    purple: 'màu tím', pink: 'màu hồng' };
  NAMES.en.hue = NAMES.en.color;
  NAMES.vi.hue = { red: 'đỏ', blue: 'xanh dương', yellow: 'vàng', green: 'xanh lá', orange: 'cam', purple: 'tím', pink: 'hồng' };
  NAMES.en.shape = { circle: 'circle', square: 'square', triangle: 'triangle', star: 'star', heart: 'heart', rect: 'rectangle',
    rectangle: 'rectangle', diamond: 'diamond', oval: 'oval' };
  // DESIGN §6: "ngôi sao", "trái tim" without "hình" (a star piece IS a star); the others keep "hình"
  NAMES.vi.shape = { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', star: 'ngôi sao',
    heart: 'trái tim', rect: 'hình chữ nhật', rectangle: 'hình chữ nhật', diamond: 'hình thoi', oval: 'hình bầu dục' };
  NAMES.en.size = { big: 'big', small: 'small' };
  NAMES.vi.size = { big: 'to', small: 'nhỏ' };
  NAMES.en.obj = { car: 'car', bus: 'bus', balloon: 'balloon', kite: 'kite', umbrella: 'umbrella', house: 'house',
    flower: 'flower', hat: 'hat' };
  NAMES.vi.obj = { car: 'chiếc ô tô', bus: 'chiếc xe buýt', balloon: 'quả bóng bay', kite: 'con diều', umbrella: 'chiếc ô',
    house: 'ngôi nhà', flower: 'bông hoa', hat: 'chiếc mũ' };
  NAMES.en.animal = { duck: 'duck', cat: 'cat', dog: 'dog', cow: 'cow', pig: 'pig', frog: 'frog', lion: 'lion', rabbit: 'rabbit' };
  NAMES.vi.animal = { duck: 'con vịt', cat: 'con mèo', dog: 'con chó', cow: 'con bò', pig: 'con heo', frog: 'con ếch',
    lion: 'con sư tử', rabbit: 'con thỏ' };
  NAMES.en.word = NAMES.en.animal;
  NAMES.vi.word = { duck: 'vịt', cat: 'mèo', dog: 'chó', cow: 'bò', pig: 'heo', frog: 'ếch', lion: 'sư tử', rabbit: 'thỏ' };
  NAMES.en.parity = { odd: 'odd', even: 'even' };
  NAMES.vi.parity = { odd: 'lẻ', even: 'chẵn' };
  // counted things: [singular, plural]; RUN = the shorter word used when counting aloud ("Một, hai, ba quả bóng!")
  var ITEMS = { en: { bunch: ['balloon', 'balloons'], dots: ['dot', 'dots'] },
    vi: { bunch: ['quả bóng bay', 'quả bóng bay'], dots: ['chấm', 'chấm'] } };
  var RUN = { en: { bunch: ['balloon', 'balloons'], dots: ['dot', 'dots'] },
    vi: { bunch: ['quả bóng', 'quả bóng'], dots: ['chấm', 'chấm'] } };

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
      obj: { car: ['car', 'cars', 'auto', 'vroom'], bus: ['bus', 'buses', 'school bus'], balloon: ['balloon', 'balloons', 'baloon'],
        kite: ['kite', 'kites'], umbrella: ['umbrella', 'umbrellas', 'brolly'], house: ['house', 'houses', 'home'],
        flower: ['flower', 'flowers', 'flour'], hat: ['hat', 'hats', 'cap'] },
      animal: { duck: ['duck', 'ducky', 'duckie', 'ducks', 'quack'], cat: ['cat', 'kitty', 'kitten', 'cats', 'meow'],
        dog: ['dog', 'doggy', 'doggie', 'puppy', 'dogs', 'woof'], cow: ['cow', 'cows', 'moo'],
        pig: ['pig', 'piggy', 'piglet', 'pigs', 'oink'], frog: ['frog', 'froggy', 'frogs', 'ribbit'],
        lion: ['lion', 'lions', 'roar'], rabbit: ['rabbit', 'rabbits', 'bunny', 'bunnies', 'rabit'] },
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
      obj: { car: ['ô tô', 'xe ô tô', 'xe hơi', 'oto', 'xe con'], bus: ['xe buýt', 'buýt', 'xe bus', 'xe buyt'],
        balloon: ['bóng bay', 'quả bóng', 'bong bóng', 'trái bóng bay'], kite: ['diều', 'cái diều', 'con diều'],
        umbrella: ['cái ô', 'chiếc ô', 'cây dù', 'cái dù', 'dù'], house: ['nhà', 'cái nhà', 'căn nhà', 'ngôi nhà'],
        flower: ['hoa', 'bông hoa', 'đóa hoa', 'cái hoa'], hat: ['mũ', 'cái mũ', 'nón', 'cái nón'] },
      animal: { duck: ['con vịt', 'vịt', 'vịt con', 'cạp cạp'], cat: ['con mèo', 'mèo', 'mèo con', 'meo meo'],
        dog: ['con chó', 'chó', 'cún', 'con cún', 'chó con', 'gâu gâu'], cow: ['con bò', 'bò', 'bò sữa', 'con bò sữa'],
        pig: ['con heo', 'heo', 'con lợn', 'lợn', 'heo con'], frog: ['con ếch', 'ếch', 'ếch con', 'con nhái'],
        lion: ['con sư tử', 'sư tử'], rabbit: ['con thỏ', 'thỏ', 'thỏ con', 'thỏ trắng'] },
      parity: { odd: ['lẻ', 'số lẻ', 'lẽ', 'lẹ'], even: ['chẵn', 'số chẵn', 'chặn', 'chắn'] }
    }
  };

  // Default PZ.WORDS for the 'initial' topic (animal pieces are the pictures). content.js may replace it
  // ({en:[{word, initial, animal}], vi:[…]}). vi words are the animal names WITHOUT the classifier "con"; the VI initial
  // keeps the letter's own marks (ếch → Ê) but never a tone mark.
  var WORD_LIST = {
    en: [['duck', 'duck', 'D'], ['cat', 'cat', 'C'], ['dog', 'dog', 'D'], ['cow', 'cow', 'C'], ['pig', 'pig', 'P'],
      ['frog', 'frog', 'F'], ['lion', 'lion', 'L'], ['rabbit', 'rabbit', 'R']],
    vi: [['vịt', 'duck', 'V'], ['mèo', 'cat', 'M'], ['chó', 'dog', 'C'], ['bò', 'cow', 'B'], ['heo', 'pig', 'H'],
      ['ếch', 'frog', 'Ê'], ['sư tử', 'lion', 'S'], ['thỏ', 'rabbit', 'T']]
  };
  function defaultEntries(lang) {
    return WORD_LIST[lang].map(function (w) { return { id: w[1], word: w[0], animal: w[1], initial: w[2] }; });
  }
  if (!PZ.WORDS) {
    PZ.WORDS = {};
    LANGS.forEach(function (l) { PZ.WORDS[l] = defaultEntries(l); });
  }

  // ---------------------------------------------------------------- strings
  var TOPICS = ['colors', 'shapes', 'size', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
  var NAME_KINDS = ['color', 'hue', 'shape', 'size', 'obj', 'animal', 'word', 'number', 'dots', 'bunch', 'letter', 'text',
    'sum', 'diff', 'parity'];
  // prompt keys content.js asks with (DESIGN §5.1) and their REQUIRED params (others are optional)
  var PROMPTS = {
    'p.colors': ['color'], 'p.shapes': ['shape'], 'p.shapes5': ['shape', 'color'], 'p.size': ['size', 'obj'],
    'p.animals': ['animal'], 'p.count': ['n'], 'p.letters': ['letter'], 'p.lower': ['letter'], 'p.initial': ['letter'],
    'p.add': ['a', 'b'], 'p.sub': ['a', 'b'], 'p.oddeven': ['parity']
  };
  var MAX_COUNT = 20;

  var STR = {
    en: {
      'ui.title': 'Pom’s Puzzle Town',
      'ui.logo1': 'Pom’s',
      'ui.logo2': 'Puzzle Town',
      'ui.subtitle': 'Pick up a piece, fit it in its shadow, watch the picture come to life!',
      'ui.tagline': 'Pick up a piece, fit it in its shadow, watch the picture come to life!',
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
      'ui.voice': 'Pom’s voice',
      'ui.mic': 'Answer by talking',
      'ui.done': 'Done',
      'ui.stars': 'Stars',
      'ui.chapter': 'Chapter {n}',
      'ui.allDone': 'All done! {stars} stars',
      'ui.welcome': ['Hi {child}! I am Pom. Let’s do puzzles!', 'Hi! I am Pom. Let’s do puzzles!'],
      'ui.micUnsupported': 'Voice answers are not available here. Tap the pictures!',
      'ui.micDenied': 'The microphone is off. Tap the pictures instead!',
      'ui.voiceMissing': 'Tip for parents: add a voice in Settings › Accessibility › Spoken Content › Voices.',
      'ui.tapOrSay': 'Tap or say the answer!',
      'ui.listening': 'Pom is listening…',
      'ui.tapPom': 'Tap Pom to hear it again',
      'ui.tapHint': 'Drag a piece into its shadow',
      'ui.skip': 'Skip',
      'ui.gallery': 'Our pictures',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Colour Pieces',
      'topic.shapes': 'Shape Puzzles',
      'topic.size': 'Big and Small',
      'topic.count': 'Let’s Count',
      'topic.animals': 'Animal Park',
      'topic.letters': 'Letter Puzzles',
      'topic.lower': 'Big and Small Letters',
      'topic.initial': 'First Letters',
      'topic.add': 'Adding Up',
      'topic.sub': 'Take Away',
      'topic.oddeven': 'Odd and Even',

      'weather.0': 'Spring flowers!',
      'weather.1': 'Sunny summer!',
      'weather.2': 'Autumn leaves!',
      'weather.3': 'Snowy winter!',

      'enter': ['A new picture!', 'Look, a new puzzle!', 'Here comes a new picture!'],

      'p.any': ['Let’s do the puzzle!', 'Pick up a piece and find its shadow!', 'Which piece goes here?'],
      'p.next': ['Next one!', 'One more!', 'Now,'],
      'p.colors': ['Find the {color} piece!', 'Where is the {color} piece?', 'Can you find the {color} piece?'],
      'p.shapes': ['Find the {shape}!', 'Where is the {shape}?', 'Can you find the {shape} piece?'],
      'p.shapes5': ['Find the {color} {shape}!', 'Where is the {color} {shape}?', 'Can you find the {color} {shape}?'],
      'p.size': ['Find the {size} {obj}!', 'Which {obj} is {size}? Find it!', 'Can you find the {size} {obj}?'],
      'p.sizeAny': ['Find the {size} piece!', 'Which piece is {size}? Find it!', 'Can you find the {size} one?'],
      'p.animals': ['Where is the {animal}?', 'Find the {animal}!', 'Can you find the {animal} piece?'],
      'p.count': ['Find the piece with {num} {items}!', 'Let’s count! Which piece has {num} {items}?',
        'Can you find {num} {items}?'],
      'p.letters': ['Find the letter {letter}!', 'Where is the letter {letter}?', 'Can you find letter {letter}?'],
      'p.lower': ['Big {letter} has a little friend. Find small {lower}!', 'Find small {lower}!',
        'Where is small {lower}? It goes with big {letter}!'],
      'p.initial': ['Find the animal that starts with {letter}!', 'Who starts with {letter}? Find the piece!',
        'Listen: {letter}! Which animal starts with {letter}?'],
      'p.add': ['What is {a} + {b}? Find the answer piece!', 'Let’s add! {a} + {b}. Find the answer!',
        'Count it up: {a} + {b}! Find the answer!'],
      'p.sub': ['What is {a} − {b}? Find the answer piece!', 'Take away! {a} − {b}. Find the answer!',
        'Start with {a}, take away {b}! Find the answer!'],
      'p.oddeven': ['Put in all the {parity} numbers!', 'Find every {parity} number!', 'Let’s fit all the {parity} numbers!'],

      'pickup': ['{thing}!'],
      'tap': ['{thing}!', 'Look, {thing}!', 'This is {thing}!'],
      'placed': ['Click! {thing} fits!', 'Click! Just right — {thing}!', '{thing} fits! Hooray!'],
      'placed.label': ['Click! {label}!', '{label} fits! Super!', 'Click! {label}! Hooray!'],
      'placed.parity': ['{num} is {parity}!', 'Yes! {num} is {parity}!', 'Click! {num} is {parity}!'],
      'placed.initial': ['{letter} is for {word}!', 'Yes! {letter} is for {word}!', 'Click! {letter} is for {word}!'],
      'placed.sum': ['{ans}! {expr} is {ans}!', 'Yes! {expr} is {ans}!', 'Click! {expr} is {ans}!'],
      'placed.any': ['Click! It fits!', 'Just right!', 'Click! Hooray!'],
      'countDone': ['{num} {items}! Hooray!', 'We counted {num} {items}!', '{num} {items}! Super counting!'],

      'nearMiss': ['It goes here — look at the shadow!', 'Almost! It fits in this shadow!', 'Look, here is its shadow!'],
      'wrong.thing': ['That’s {got}. Let’s find {want}!', 'Oh, {got}! Where is {want}?', 'This one is {got}! Let’s look for {want}!'],
      'wrong.count': ['That one has {got}. Let’s find {want}!', 'Oh, {got}! Let’s look for {want}!',
        'Let’s count: {got}! We need {want}!'],
      'wrong.math': ['That’s {got}. Let’s count again!', 'Hmm, {got}. Let’s count one more time!', 'That’s {got}! Let’s think again!'],
      'wrong.parity': ['{num} is {parity}! Let’s look for another one!', '{num} is {parity}. Let’s find a different one!',
        '{num} is {parity}! Let’s try another number!'],
      'wrong.initial': ['{word} starts with {first}! Let’s look again!', '{word} starts with {first}. Let’s find another one!',
        '{word} starts with {first}! Let’s try another animal!'],
      'wrong.any': ['Let’s look again!', 'Let’s try another one!', 'Hmm, let’s think again!', 'Keep going, you can do it!'],
      'stepDone': ['Hooray!', 'Great puzzling!', 'Wonderful!', 'It fits!'],
      'alive': ['The picture is done — look, it moves!', 'All the pieces fit! Look!', 'Hooray! The picture comes to life!'],
      'toot': ['Toot toot!', 'Toot! Hooray!', 'Toot-toot! Pom is so happy!'],
      'surprise.pigeon': ['Look! A little pigeon!', 'Coo coo! Who is that?', 'A pigeon is taking a walk!'],
      'pigeon.tap': ['Flap, flap! Coo coo!', 'The pigeon says hello!', 'Up it goes! Coo!'],
      'surprise.bubbles': ['Look! Soap bubbles!', 'Bubbles! Can you pop them?', 'So many bubbles!'],
      'bubble.pop': ['Pop!', 'Pop, pop!', 'Pop! Sparkle!'],

      'praise': ['Yes!', 'Great job!', 'You got it!', 'Super!', 'Wonderful!', 'Nice one!', 'Hooray!', 'Well done!'],
      'great': ['Great puzzling, {child}!', 'You did it, {child}!', 'What a puzzle star!', 'Wow, {child}, super puzzler!',
        'Hooray! The picture is done!', 'You are so clever!', 'Super puzzling!'],
      'party': ['Look at all our pictures!', 'Hooray! What a puzzle day!', 'So many finished pictures!'],
      'hint': ['Psst! Look at the shining piece!', 'Watch the little hand!', 'Pom will help! This one goes here!',
        'Look, this piece is sparkling!', 'The shiny one! Carry it to its shadow!'],
      'idle': ['Let’s do the puzzle!', 'Pom is waiting! Your turn!', 'Pick up a piece!', 'I am here, {child}! Let’s play!',
        'The picture needs its pieces!', 'Which piece goes next?'],

      'talk.intro': 'Talk time!',
      'talk.colors': 'What colour is this {obj}?',
      'talk.colorsAny': 'What colour is this piece?',
      'talk.colorsWhich': 'Which piece is {color}?',
      'talk.shapes': 'Which one is the {shape}?',
      'talk.shapesAny': 'What shape is this?',
      'talk.shapes5': 'Which one is the {color} {shape}?',
      'talk.size': 'Which {obj} is {size}?',
      'talk.sizeOne': 'Which one is {size}?',
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
      'talk.wrong.any': 'Good try! Let’s keep puzzling!',

      'session.done': ['What a puzzle day! {stars} stars! Hooray!', 'Amazing, {child}! {stars} stars!',
        'So many pictures! {stars} stars!']
    },
    vi: {
      'ui.title': 'Voi Pom Ghép Hình',
      'ui.logo1': 'Voi Pom',
      'ui.logo2': 'Ghép Hình',
      'ui.subtitle': 'Bé nhặt mảnh ghép, đặt vào cái bóng, xem bức tranh chuyển động nhé!',
      'ui.tagline': 'Bé nhặt mảnh ghép, đặt vào cái bóng, xem bức tranh chuyển động nhé!',
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
      'ui.voice': 'Giọng của Pom',
      'ui.mic': 'Nói để trả lời',
      'ui.done': 'Xong',
      'ui.stars': 'Ngôi sao',
      'ui.chapter': 'Chương {n}',
      'ui.allDone': 'Hoàn thành! {stars} ngôi sao',
      'ui.welcome': ['Chào bé {child}! Mình là voi Pom. Mình cùng ghép hình nhé!',
        'Chào bé! Mình là voi Pom. Mình cùng ghép hình nhé!'],
      'ui.micUnsupported': 'Máy này chưa nghe được giọng nói. Bé chạm vào hình nhé!',
      'ui.micDenied': 'Micrô đang tắt. Bé chạm vào hình nhé!',
      'ui.voiceMissing': 'Mẹo cho bố mẹ: thêm giọng tiếng Việt trong Cài đặt › Trợ năng › Nội dung được đọc › Giọng nói.',
      'ui.tapOrSay': 'Bé chạm hoặc nói đáp án nhé!',
      'ui.listening': 'Pom đang nghe…',
      'ui.tapPom': 'Chạm vào Pom để nghe lại nhé',
      'ui.tapHint': 'Bé kéo mảnh ghép vào cái bóng của nó nhé',
      'ui.skip': 'Bỏ qua',
      'ui.gallery': 'Tranh của bé',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Mảnh ghép sắc màu',
      'topic.shapes': 'Ghép hình khối',
      'topic.size': 'To và nhỏ',
      'topic.count': 'Cùng đếm nào',
      'topic.animals': 'Công viên thú',
      'topic.letters': 'Ghép chữ cái',
      'topic.lower': 'Chữ hoa, chữ thường',
      'topic.initial': 'Chữ cái đầu tiên',
      'topic.add': 'Phép cộng',
      'topic.sub': 'Phép trừ',
      'topic.oddeven': 'Số chẵn, số lẻ',

      'weather.0': 'Mùa xuân hoa nở rồi!',
      'weather.1': 'Mùa hè nắng đẹp quá!',
      'weather.2': 'Mùa thu lá vàng bay!',
      'weather.3': 'Mùa đông tuyết trắng xóa!',

      'enter': ['Bức tranh mới nè!', 'Nhìn kìa, một bức tranh mới!', 'Tranh mới tới rồi!'],

      'p.any': ['Bé ơi, mình ghép hình nhé!', 'Bé nhặt một mảnh ghép, tìm cái bóng của nó nào!', 'Mảnh nào vào đây nhỉ?'],
      'p.next': ['Tiếp nào!', 'Thêm một mảnh nữa nhé!', 'Giờ thì'],
      'p.colors': ['Bé ơi, tìm mảnh ghép {color} nhé!', 'Mảnh ghép {color} ở đâu nhỉ?', 'Bé tìm mảnh ghép {color} nào!'],
      'p.shapes': ['Bé ơi, tìm {shape} nhé!', '{shape} ở đâu nhỉ?', 'Bé tìm mảnh ghép {shape} nào!'],
      'p.shapes5': ['Bé ơi, tìm {shape} {color} nhé!', '{shape} {color} ở đâu nhỉ?', 'Bé tìm mảnh ghép {shape} {color} nào!'],
      'p.size': ['Bé ơi, tìm {obj} {size} nhé!', '{obj} nào {size} nhỉ? Bé tìm nào!', 'Bé tìm {obj} {size} nào!'],
      'p.sizeAny': ['Bé ơi, tìm mảnh ghép {size} nhé!', 'Mảnh nào {size} nhỉ? Bé tìm nào!', 'Bé tìm mảnh {size} nào!'],
      'p.animals': ['{animal} đâu rồi nhỉ?', 'Bé ơi, tìm {animal} nhé!', 'Bé tìm mảnh ghép {animal} nào!'],
      'p.count': ['Bé ơi, tìm mảnh có {num} {items} nhé!', 'Mình đếm nhé! Mảnh nào có {num} {items}?',
        'Bé tìm {num} {items} nào!'],
      'p.letters': ['Bé ơi, tìm chữ {letter} nhé!', 'Chữ {letter} ở đâu nhỉ?', 'Bé tìm chữ {letter} nào!'],
      'p.lower': ['Bé ơi, chữ {letter} hoa có một bạn nhỏ. Bé tìm chữ {lower} thường nhé!', 'Bé tìm chữ {lower} thường nào!',
        'Chữ {lower} thường ở đâu nhỉ? Bạn ấy đi cùng chữ {letter} hoa đó!'],
      'p.initial': ['Bé ơi, tìm con vật bắt đầu bằng chữ {letter} nhé!', 'Bạn nào bắt đầu bằng chữ {letter}? Bé tìm nào!',
        'Bé nghe nè, chữ {letter}! Con vật nào bắt đầu bằng chữ {letter}?'],
      'p.add': ['Bé ơi, {a} + {b} bằng mấy? Bé tìm mảnh đáp án nhé!', 'Mình cộng nào! {a} + {b}. Bé tìm đáp án nhé!',
        'Bé tính nhé: {a} + {b}! Tìm đáp án nào!'],
      'p.sub': ['Bé ơi, {a} − {b} bằng mấy? Bé tìm mảnh đáp án nhé!', 'Mình trừ nào! {a} − {b}. Bé tìm đáp án nhé!',
        'Có {a}, bớt đi {b}! Bé tìm đáp án nào!'],
      'p.oddeven': ['Bé ơi, ghép hết các số {parity} vào nhé!', 'Bé tìm hết các số {parity} nào!', 'Mình ghép các số {parity} nhé!'],

      'pickup': ['{thing}!'],
      'tap': ['{thing}!', 'Nhìn nè, {thing}!', 'Đây là {thing} nè!'],
      'placed': ['Cạch! {thing} vừa khít rồi!', 'Cạch! Vừa khít — {thing}!', '{thing} vào đúng chỗ rồi! Hoan hô!'],
      'placed.label': ['Cạch! {label}!', '{label} vừa khít! Giỏi quá!', 'Cạch! {label}! Hoan hô!'],
      'placed.parity': ['{num} là số {parity}!', 'Đúng rồi! {num} là số {parity}!', 'Cạch! {num} là số {parity}!'],
      'placed.initial': ['Chữ {letter}, {word}!', 'Đúng rồi! Chữ {letter}, {word}!', 'Cạch! Chữ {letter}, {word}!'],
      'placed.sum': ['{ans}! {expr} bằng {ans}!', 'Đúng rồi! {expr} bằng {ans}!', 'Cạch! {expr} bằng {ans}!'],
      'placed.any': ['Cạch! Vừa khít rồi!', 'Vừa khít luôn!', 'Cạch! Hoan hô!'],
      'countDone': ['{num} {items}! Hoan hô!', 'Mình đếm được {num} {items} rồi!', '{num} {items}! Bé đếm giỏi quá!'],

      'nearMiss': ['Mảnh này ở đây nè — bé nhìn cái bóng nhé!', 'Gần tới rồi! Nó vừa với cái bóng này nè!',
        'Nhìn nè, cái bóng của nó ở đây!'],
      'wrong.thing': ['Đây là {got}. Mình tìm {want} nhé!', 'Ồ, {got} nè! {want} ở đâu nhỉ?', 'Mảnh này là {got}! Bé tìm {want} nào!'],
      'wrong.count': ['Mảnh này có {got}. Mình tìm mảnh có {want} nhé!', 'Ồ, {got} nè! Bé tìm mảnh có {want} nào!',
        'Mình đếm nhé: {got}! Mình cần {want} nè!'],
      'wrong.math': ['Đây là {got}. Mình đếm lại nhé!', 'Ồ, {got}. Bé đếm thêm lần nữa nào!', 'Đây là {got}! Bé nghĩ thêm chút nhé!'],
      'wrong.parity': ['{num} là số {parity}! Mình tìm số khác nhé!', '{num} là số {parity}. Bé tìm số khác nào!',
        '{num} là số {parity}! Bé thử số khác nhé!'],
      'wrong.initial': ['{word} bắt đầu bằng chữ {first}! Mình tìm lại nhé!', '{word} bắt đầu bằng chữ {first}. Bé tìm bạn khác nào!',
        '{word} bắt đầu bằng chữ {first}! Bé thử bạn khác nhé!'],
      'wrong.any': ['Mình tìm lại nhé!', 'Bé thử mảnh khác nào!', 'Bé nghĩ thêm chút nữa nhé!', 'Cố lên, bé làm được mà!'],
      'stepDone': ['Hoan hô!', 'Bé ghép giỏi quá!', 'Tuyệt vời!', 'Vừa khít rồi!'],
      'alive': ['Bức tranh xong rồi — nhìn kìa, nó chuyển động!', 'Ghép đủ hết rồi! Bé nhìn nè!', 'Hoan hô! Bức tranh sống động quá!'],
      'toot': ['Tò te tò te!', 'Tò te! Hoan hô!', 'Tò te tí te! Pom vui quá!'],
      'surprise.pigeon': ['Nhìn kìa! Một bạn chim bồ câu!', 'Gù gù! Ai đó nhỉ?', 'Bạn bồ câu đi dạo kìa!'],
      'pigeon.tap': ['Vỗ cánh, vỗ cánh! Gù gù!', 'Bồ câu chào bé nè!', 'Bay lên rồi! Gù gù!'],
      'surprise.bubbles': ['Nhìn kìa! Bong bóng xà phòng!', 'Bong bóng nè! Bé chạm thử nhé!', 'Bao nhiêu là bong bóng!'],
      'bubble.pop': ['Bụp!', 'Bụp, bụp!', 'Bụp! Lấp lánh quá!'],

      'praise': ['Đúng rồi!', 'Giỏi quá!', 'Tuyệt vời!', 'Hoan hô!', 'Bé giỏi lắm!', 'Chính xác!', 'Siêu quá!', 'Hay lắm!'],
      'great': ['Bé {child} ghép giỏi quá!', 'Hoan hô bé {child}!', 'Ngôi sao ghép hình đây rồi!', 'Oa, bé {child} ghép hình siêu giỏi!',
        'Hoan hô! Bức tranh xong rồi!', 'Bé thông minh quá!', 'Bé ghép giỏi quá!'],
      'party': ['Nhìn tranh của mình nè!', 'Hoan hô! Một ngày ghép hình tuyệt quá!', 'Bao nhiêu là bức tranh đẹp!'],
      'hint': ['Nhìn nè! Mảnh này đang lấp lánh.', 'Bé xem bàn tay nhỏ chỉ nè!', 'Pom giúp bé nhé! Mảnh này vào đây nè!',
        'Nhìn kìa, mảnh này sáng lên!', 'Mảnh lấp lánh đó! Bé kéo nó vào cái bóng nhé!'],
      'idle': ['Mình ghép hình nào!', 'Pom đang chờ bé nè!', 'Bé nhặt một mảnh ghép nhé!', 'Bé {child} ơi, mình chơi tiếp nhé!',
        'Bức tranh đang chờ mảnh ghép nè!', 'Mảnh nào vào tiếp đây nhỉ?'],

      'talk.intro': 'Giờ trò chuyện!',
      'talk.colors': '{obj} này màu gì nhỉ?',
      'talk.colorsAny': 'Mảnh ghép này màu gì nhỉ?',
      'talk.colorsWhich': 'Mảnh nào {color} nhỉ?',
      'talk.shapes': '{shape} là mảnh nào nhỉ?',
      'talk.shapesAny': 'Mảnh này hình gì nhỉ?',
      'talk.shapes5': '{shape} {color} là mảnh nào nhỉ?',
      'talk.size': '{obj} nào {size} nhỉ?',
      'talk.sizeOne': 'Mảnh nào {size} nhỉ?',
      'talk.sizeAny': 'Mảnh nào to nhỉ?',
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
      'talk.wrong.size': 'Là mảnh {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.letter': 'Là chữ {letter} đó! Bé cố gắng lắm!',
      'talk.wrong.small': 'Là chữ {letter} thường đó! Bé cố gắng lắm!',
      'talk.wrong.number': 'Là số {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.any': 'Bé cố gắng lắm! Mình ghép tiếp nhé!',

      'session.done': ['Một ngày ghép hình tuyệt quá! {stars} ngôi sao!', 'Bé {child} giỏi quá! {stars} ngôi sao!',
        'Bé ghép được bao nhiêu là tranh! {stars} ngôi sao!']
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
    'p.sizeAny': ['size'],
    'pickup': ['thing'], 'tap': ['thing'], 'placed': ['thing'], 'placed.label': ['label'],
    'placed.parity': ['num', 'parity'], 'placed.initial': ['letter', 'word'], 'placed.sum': ['expr', 'ans'], 'countDone': ['n'],
    'wrong.thing': ['got', 'want'], 'wrong.count': ['got', 'want'], 'wrong.math': ['got'], 'wrong.parity': ['num', 'parity'],
    'wrong.initial': ['word', 'first'],
    'talk.colors': ['obj'], 'talk.colorsWhich': ['color'], 'talk.shapes': ['shape'], 'talk.shapes5': ['shape', 'color'],
    'talk.size': ['size', 'obj'], 'talk.sizeOne': ['size'],
    'talk.animals': ['animal'], 'talk.letters': ['letter'], 'talk.lower': ['letter'],
    'talk.initial': ['word'], 'talk.add': ['a', 'b'], 'talk.sub': ['a', 'b'], 'talk.oddeven': ['parity'],
    'talk.wrong': ['answer'], 'talk.wrong.a': ['answer'], 'talk.wrong.animal': ['answer'], 'talk.wrong.size': ['answer'],
    'talk.wrong.letter': ['letter'], 'talk.wrong.small': ['letter'], 'talk.wrong.number': ['answer']
  };
  Object.keys(PROMPTS).forEach(function (k) { NEEDS[k] = PROMPTS[k]; });
  var FALLBACK = { 'p.shapes5': 'p.shapes', 'p.size': 'p.sizeAny', 'countDone': 'stepDone',
    'pickup': 'praise', 'tap': 'praise', 'placed': 'placed.any',
    'talk.colors': 'talk.colorsAny', 'talk.colorsWhich': 'talk.colorsAny', 'talk.shapes': 'talk.shapesAny',
    'talk.shapes5': 'talk.shapes', 'talk.size': 'talk.sizeOne', 'talk.sizeOne': 'talk.sizeAny',
    'talk.animals': 'talk.animalsAny', 'talk.letters': 'talk.lettersAny', 'talk.lower': 'talk.lowerAny',
    'talk.initial': 'talk.initialAny', 'talk.add': 'talk.calc', 'talk.sub': 'talk.calc', 'talk.oddeven': 'talk.oddevenAny' };
  Object.keys(NEEDS).forEach(function (k) {
    if (FALLBACK[k]) return;
    if (/^p\./.test(k)) FALLBACK[k] = 'p.any';
    else if (/^placed\./.test(k)) FALLBACK[k] = 'placed.any';
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
    return String(s).normalize('NFD').replace(/[̣̀́̃̉]/g, '').normalize('NFC');
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
    if (s === 'bunny') s = 'rabbit';
    return ANIMALS.indexOf(s) >= 0 ? s : null;
  }
  function objOf(v) {
    if (v && typeof v === 'object') v = v.obj != null ? v.obj : rawVal(v);
    var s = low(v);
    return OBJECTS.indexOf(s) >= 0 ? s : null;
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
  function pieceKind(v) { var s = low(v); return PIECE_KINDS.indexOf(s) >= 0 ? s : null; }
  // the counted-items kind: 'bunch' (balloons, default) | 'dots'
  function itemsKind(v) {
    if (v && typeof v === 'object') v = v.kind != null ? v.kind : v.items;
    var s = low(v);
    return (s === 'dots' || s === 'dot') ? 'dots' : 'bunch';
  }
  function itemsWord(lang, kind, n, run) {
    var tbl = (run ? RUN : ITEMS)[L(lang)][itemsKind(kind)];
    return tbl[n === 1 ? 0 : 1];
  }

  // ---- words for the 'initial' topic: tolerant of whatever shape content.js gives PZ.WORDS
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
    var src = PZ.WORDS, list = [];
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
      case 'dots': case 'bunch': {
        var n = num(value);
        return n == null ? String(value) : numberName(lang, n) + ' ' + itemsWord(lang, kind, n);
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
        if (objOf(tx)) return NAMES[lang].obj[objOf(tx)];
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
      case 'obj': {
        var o = objOf(value);
        if (!o) return String(value == null ? '' : value).replace(/_/g, ' ');
        var sz3 = opts.size ? sizeOf(opts.size) : null;
        if (!sz3) return NAMES[lang].obj[o];
        return lang === 'vi' ? NAMES.vi.obj[o] + ' ' + NAMES.vi.size[sz3] : NAMES.en.size[sz3] + ' ' + NAMES.en.obj[o];
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
  // Piece things: obj {obj, color} → color when coloured (a colours question) else obj; shape {shape} → shape;
  // bunch / dots / number {n} → number; animal {animal} → animal; glyph {text} → text; icons: color {color},
  // number {n}, size {big|size, obj}; {nameKind, nameValue} wins; {id, thing, value}.
  function kvOf(t) {
    var kv = kvRaw(t);
    return [kv[0], scalar(kv[1])];
  }
  function kvRaw(t) {
    t = obj(t);
    if (t.thing && typeof t.thing === 'object') return kvRaw(t.thing);
    if (t.nameKind != null) return [t.nameKind, t.nameValue];
    switch (t.kind) {
      case 'color': case 'blob': case 'paint':
        return ['color', t.color != null ? t.color : t.value];
      case 'obj':
        if (t.big === true || t.big === false) return ['size', t.big ? 'big' : 'small'];
        if (t.color != null) return ['color', t.color];
        return ['obj', t.obj != null ? t.obj : t.value];
      case 'shape':
        if (t.shape != null) return ['shape', t.shape];
        return t.value != null ? ['shape', t.value] : ['color', t.color];
      case 'size': {
        var sz = thingSize(t);
        return ['size', sz != null ? sz : t.value];
      }
      case 'animal': case 'toy':
        if (t.big === true || t.big === false) return ['size', t.big ? 'big' : 'small'];
        return ['animal', t.animal != null ? t.animal : t.value];
      case 'number': case 'dots': case 'bunch': return ['number', t.n != null ? t.n : t.value];
      case 'letter': return ['letter', t.text != null ? t.text : t.value];
      case 'glyph': case 'text': case 'tablet': return ['text', t.text != null ? t.text : t.value];
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
      case 'dots': case 'bunch': {
        var dn = num(value);
        out = numberWords(lang, value);
        if (dn != null) addForms(out, [name(lang, kind, dn), dn + ' ' + itemsWord(lang, kind, dn)]);
        return out;
      }
      case 'parity': if (num(value) != null) return numberWords(lang, num(value)); break;
      case 'text': {
        var tx = String(value);
        if (splitOp(tx)) return words(lang, 'sum', tx);
        if (num(tx) != null) return numberWords(lang, num(tx));
        if (isLetter(tx)) return words(lang, 'letter', tx);
        if (animalOf(tx)) return words(lang, 'animal', tx);
        if (objOf(tx)) return words(lang, 'obj', tx);
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
      case 'obj': {
        var ob = objOf(value);
        if (!ob) return addForms(out, [String(value)]);
        return addForms(out, [NAMES[lang].obj[ob]].concat(WORDS[lang].obj[ob] || []));
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
  // {nameKind, nameValue} | {kind, value} | (kind, value). EN gets "the" where natural; VI the plain name.
  function scalar(v) { return (typeof v === 'string' || (typeof v === 'number' && isFinite(v))) ? v : null; }
  function thingOf(a, b) {
    if (typeof a === 'string') return { k: a, v: scalar(b) };
    var t = obj(a);
    var hasName = t.nameKind != null;
    return { k: hasName ? scalar(t.nameKind) : scalar(t.kind), v: scalar(hasName ? t.nameValue : t.value),
      size: t.size, animal: t.animal, obj: t.obj, text: t.text };
  }
  function phraseOf(lang, th) {
    var vi = lang === 'vi', k = th.k, v = th.v, out = '';
    switch (k) {
      case 'color': case 'hue': out = name(lang, 'color', v); break;
      case 'shape': out = vi ? name(lang, 'shape', v) : 'the ' + name(lang, 'shape', v); break;
      case 'animal': case 'word':
        out = vi ? name(lang, 'animal', v, { size: th.size }) : 'the ' + name(lang, 'animal', v, { size: th.size }); break;
      case 'obj': out = vi ? name(lang, 'obj', v, { size: th.size }) : 'the ' + name(lang, 'obj', v, { size: th.size }); break;
      case 'size': {
        var a = animalOf(th.animal), o = objOf(th.obj);
        if (a) out = vi ? name(lang, 'animal', a, { size: v }) : 'the ' + name(lang, 'animal', a, { size: v });
        else if (o) out = vi ? name(lang, 'obj', o, { size: v }) : 'the ' + name(lang, 'obj', o, { size: v });
        else out = vi ? 'mảnh ' + name(lang, 'size', v) : 'the ' + name(lang, 'size', v) + ' one';
        break;
      }
      case 'dots': case 'bunch': out = num(v) != null ? name(lang, k, num(v)) : ''; break;
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

  // ---------------------------------------------------------------- piecePhrase: a puzzle piece named
  // thing = { kind: obj|shape|bunch|dots|animal|glyph (or a Talk icon: color|number|size), obj?, color?, shape?, n?,
  //           animal?, text?, big?, nameKind?, nameValue? }
  // opts = { art: 'the' (default) | 'a' | null (EN article), color: true|false (default: obj → yes, shape → no),
  //          size: bool (say big/small; default: when nameKind is 'size'), bare: bool (numbers / glyphs without
  //          "number"/"letter": "five") }. Unknown things → their name phrase (or '').
  function piecePhrase(lang, t, opts) {
    lang = L(lang);
    t = obj(t);
    opts = opts || {};
    var vi = lang === 'vi';
    var art = opts.art === undefined ? 'the' : opts.art;
    var kind = pieceKind(t.kind) || (['color', 'number', 'size', 'letter', 'text'].indexOf(t.kind) >= 0 ? t.kind : null);
    if (!kind) return t.nameKind != null ? phraseOf(lang, thingOf(t)) : '';
    var sz = (opts.size === true || (opts.size !== false && t.nameKind === 'size')) ? thingSize(t) : null;
    var col = colorOf(t.color);
    var out;
    function withArt(s) { return art ? art + ' ' + s : s; }
    switch (kind) {
      case 'obj': case 'size': {
        var o = objOf(t.obj), a = animalOf(t.animal);
        if (kind === 'size') sz = thingSize(t);
        var useCol = col && (opts.color === true || (opts.color !== false && !sz));
        if (!o && a) return piecePhrase(lang, { kind: 'animal', animal: a, big: sz ? sz === 'big' : undefined }, { art: art, size: !!sz });
        if (!o) {
          if (sz) return phraseOf(lang, { k: 'size', v: sz });
          return useCol ? (vi ? 'mảnh ' + NAMES.vi.color[col] : anFix(withArt(NAMES.en.color[col] + ' one'))) : '';
        }
        if (vi) return NAMES.vi.obj[o] + (sz ? ' ' + NAMES.vi.size[sz] : '') + (useCol ? ' ' + NAMES.vi.color[col] : '');
        out = (sz ? NAMES.en.size[sz] + ' ' : '') + (useCol ? NAMES.en.color[col] + ' ' : '') + NAMES.en.obj[o];
        return anFix(withArt(out));
      }
      case 'shape': {
        var sh = shapeOf(t.shape);
        var useC = col && opts.color === true;
        if (!sh) return useC ? (vi ? 'mảnh ' + NAMES.vi.color[col] : anFix(withArt(NAMES.en.color[col] + ' one'))) : '';
        if (vi) return NAMES.vi.shape[sh] + (sz ? ' ' + NAMES.vi.size[sz] : '') + (useC ? ' ' + NAMES.vi.color[col] : '');
        return anFix(withArt((sz ? NAMES.en.size[sz] + ' ' : '') + (useC ? NAMES.en.color[col] + ' ' : '') + NAMES.en.shape[sh]));
      }
      case 'bunch': case 'dots': {
        var n = num(t.n != null ? t.n : (t.nameKind === 'number' || t.nameKind === kind ? t.nameValue : null));
        if (n == null) return vi ? (kind === 'dots' ? 'mảnh có chấm' : 'chùm bóng bay') : withArt(kind === 'dots' ? 'dot piece' : 'balloon bunch');
        return name(lang, kind, n);
      }
      case 'animal': {
        var an = animalOf(t.animal != null ? t.animal : (t.nameKind === 'animal' ? t.nameValue : null));
        if (!an) return '';
        if (vi) return NAMES.vi.animal[an] + (sz ? ' ' + NAMES.vi.size[sz] : '');
        return anFix(withArt((sz ? NAMES.en.size[sz] + ' ' : '') + NAMES.en.animal[an]));
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
    // {obj} = the object noun ("car" / "chiếc ô tô"); an animal stands in (size rounds of animals)
    var o = objOf(p.obj) || objOf(pth.obj) || objOf(p.kind);
    var an0 = animalOf(p.animal) || animalOf(pth.animal);
    if (o) p.obj = NAMES[lang].obj[o];
    else if (an0 && /^(p\.size|talk\.(size|colors))$/.test(key)) p.obj = NAMES[lang].animal[an0];
    else if (present(p.obj)) p.obj = String(rawVal(p.obj)).replace(/_/g, ' ');
    else delete p.obj;
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
    // {num} + {items} from n (+ kind 'bunch' | 'dots')
    var c = present(p.n) ? num(p.n) : null;
    if (!present(p.num) && c != null) p.num = numberName(lang, c);
    if (present(p.n) && typeof p.n === 'object') p.n = c != null ? c : '';
    if (!present(p.items) || typeof p.items !== 'string' || /^(dots?|bunch|balloons?)$/.test(p.items)) {
      var ik = present(p.items) ? p.items : (present(p.kind) ? p.kind : (pth.kind || (p.dots ? 'dots' : 'bunch')));
      p.items = itemsWord(lang, ik, c == null ? 2 : c);
    }
    // {itemsPl}: always the plural ("How many balloons?" even when the shown piece has one balloon)
    if (!present(p.itemsPl)) p.itemsPl = itemsWord(lang, present(p.kind) ? p.kind : (pth.kind || (p.dots ? 'dots' : 'bunch')), 2);
    // {got}/{want}/{label} objects → phrases; {thing} object → its piece phrase
    ['got', 'want', 'label'].forEach(function (q) {
      if (p[q] && typeof p[q] === 'object') p[q] = present(p[q]) ? phraseOf(lang, thingOf(p[q])) : (piecePhrase(lang, p[q]) || '');
    });
    if (p.thing && typeof p.thing === 'object') p.thing = piecePhrase(lang, p.thing);
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

  // the step prompt; opts.next → "Next one! Find the red piece!" / "Now, where is the dog?" (main: the 2nd+ step).
  // A p.next variant without end punctuation ("Now," / "Giờ thì") runs into the prompt (its first letter lower-cased).
  I18N.ask = function (lang, key, params, opts) {
    opts = opts || {};
    var line = I18N.t(lang, key, params, opts.rng);
    if (!opts.next) return line;
    var pre = I18N.t(lang, 'p.next', null, opts.rng);
    if (L(lang) === 'vi') {
      // no "Bé ơi," in mid-sentence after a prefix ("Thêm một mảnh nữa nhé! Bé tìm …", "Giờ thì bé tìm …")
      if (/^Bé ơi, (tìm|ghép) /.test(line)) line = line.replace(/^Bé ơi, (tìm|ghép) /, 'Bé $1 ');
      else if (/^Bé ơi, /.test(line)) { line = line.slice(7); line = line.charAt(0).toUpperCase() + line.slice(1); }
      // never the same particle twice ("Tiếp nào! … nào!", "… nữa nhé! … nhé!"): take another prefix
      var PT = /(nhé|nào|nhỉ)[!?]$/, pp = PT.exec(pre), has = function (q) { var m = PT.exec(q); return !!m && line.indexOf(m[1] + q.slice(-1)) >= 0; };
      if (pp && has(pre)) {
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
  I18N.piecePhrase = piecePhrase;
  // any thing → a phrase: piece things / Talk icons via piecePhrase, else {nameKind, nameValue} / (kind, value)
  I18N.phrase = function (lang, a, b) {
    lang = L(lang);
    if (a && typeof a === 'object' && a.thing && typeof a.thing === 'object') a = a.thing;
    if (a && typeof a === 'object' && a.kind != null) { var s = piecePhrase(lang, a); if (s) return s; }
    return phraseOf(lang, thingOf(a, b));
  };
  I18N.choiceWords = function (lang, choice) { return words(lang, choice); };   // Talk choice {id, thing} → spoken forms
  I18N.kindValue = kvOf;
  I18N.TOPICS = TOPICS.slice();
  I18N.ANIMALS = ANIMALS.slice();
  I18N.OBJECTS = OBJECTS.slice();
  I18N.SHAPES = SHAPES.slice();
  I18N.COLORS = COLORS.slice();
  I18N.PIECE_KINDS = PIECE_KINDS.slice();
  I18N.NAME_KINDS = NAME_KINDS.slice();
  I18N.PROMPTS = PROMPTS;
  I18N.PARAMS = NEEDS;
  I18N.NAME_TABLE = NAMES;
  I18N.LETTER_VI = LETTER_VI;
  I18N.WORD_LIST = WORD_LIST;
  I18N.MAX_COUNT = MAX_COUNT;

  // ---------------------------------------------------------------- game lines
  // the piece thing of an event: e.thing — or e itself when it carries kind / nameKind
  function evThing(ev) {
    ev = obj(ev);
    if (ev.thing && typeof ev.thing === 'object') return ev.thing;
    if (pieceKind(ev.kind) || ev.nameKind != null) return ev;
    return {};
  }
  // what the current step is about: size round? shapes-with-colours round? counting?
  function ctxOf(ev) {
    ev = obj(ev);
    var params = obj(ev.params), topic = ev.topic, pk = String(ev.promptKey || '');
    var want = thingOf(ev.want);
    return {
      topic: topic, params: params,
      size: topic === 'size' || pk === 'p.size' || want.k === 'size' || present(params.size),
      mix: pk === 'p.shapes5' || (present(params.shape) && present(params.color)) || (topic === 'shapes' && present(params.color))
    };
  }
  function nameOpts(t, cx) {
    var k = pieceKind(t.kind);
    return { size: cx.size || undefined, color: k === 'shape' ? cx.mix : (cx.size ? false : undefined) };
  }
  // the spoken name of a piece for pickup / tap ("the red car", "three balloons", "letter B", "five")
  function pickName(lang, ev) {
    var t = evThing(ev), cx = ctxOf(ev);
    var k = pieceKind(t.kind);
    if (k === 'glyph') {
      var tx = t.text != null ? t.text : t.nameValue;
      if (num(tx) != null) return numberName(lang, num(tx));
    }
    var s = piecePhrase(lang, t, nameOpts(t, cx));
    if (!s && t.nameKind != null) s = phraseOf(lang, thingOf(t));
    return s;
  }

  // `pickup {id, thing, x, y}` (+ topic, params) → "The red car!", "The triangle!" (shapes5 "The blue star!"), "Three
  // balloons!", "The dog!", "Letter B!", "Five!" / "Chiếc ô tô màu đỏ!", "Ba quả bóng bay!", "Con chó!"
  I18N.sayPickup = function (lang, ev, rng) {
    lang = L(lang);
    var s = pickName(lang, ev);
    return s ? I18N.t(lang, 'pickup', { thing: s }, rng) : I18N.t(lang, 'praise', null, rng);
  };
  // `tapPiece {id, thing}` → "Look, the red car!" / "Nhìn nè, chiếc ô tô màu đỏ!"
  I18N.sayTap = function (lang, ev, rng) {
    lang = L(lang);
    var s = pickName(lang, ev);
    return s ? I18N.t(lang, 'tap', { thing: s }, rng) : I18N.t(lang, 'p.any', null, rng);
  };

  // `placed {id, slot, thing, x, y, count?: {n}}` (+ topic, params) → the fit line.
  I18N.sayPlaced = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var t = evThing(ev), cx = ctxOf(ev), k = pieceKind(t.kind), topic = cx.topic, params = cx.params;
    var cnt = obj(ev.count);
    // counting pieces: the count run is the line ("One, two, three balloons!")
    if (k === 'bunch' || k === 'dots' || num(cnt.n) != null) {
      var n = num(cnt.n) != null ? num(cnt.n) : num(t.n != null ? t.n : t.nameValue);
      if (n != null) return I18N.sayCountRun(lang, n, k || params.kind);
    }
    var an = animalOf(t.animal || (t.nameKind === 'animal' ? t.nameValue : null));
    if (topic === 'initial' && an) {
      var ini = initialOf(lang, an);
      return I18N.t(lang, 'placed.initial', { letter: ini.first, word: ini.word }, rng);
    }
    if (k === 'glyph' || (!k && ['letter', 'number', 'text', 'sum', 'diff', 'parity'].indexOf(t.nameKind) >= 0)) {
      var tx = t.text != null ? t.text : t.nameValue, gn = num(tx);
      if (topic === 'oddeven' && gn != null) return I18N.t(lang, 'placed.parity', { n: gn, parity: gn % 2 ? 'odd' : 'even' }, rng);
      if ((topic === 'add' || topic === 'sub') && gn != null) {
        var a = num(params.a), b = num(params.b);
        if (a != null && b != null) return I18N.t(lang, 'placed.sum', { expr: a + (topic === 'add' ? '+' : '−') + b, ans: numberName(lang, gn) }, rng);
      }
      if (gn != null) return I18N.t(lang, 'placed.label', { label: numberName(lang, gn) }, rng);
      if (tx != null) return I18N.t(lang, 'placed.label', { label: phraseOf(lang, { k: isLetter(String(tx)) ? 'letter' : 'text', v: String(tx) }) }, rng);
    }
    // colours / shapes / size / animals: Pom just said the piece's name at pickup (ev.named) — a short "Click! It fits!" then,
    // not the name again (playtest P3-1: Pom talked 91 % of the time)
    if (ev.named) return I18N.t(lang, 'placed.any', null, rng);
    var s = piecePhrase(lang, t, nameOpts(t, cx));
    if (!s && t.nameKind != null) s = phraseOf(lang, thingOf(t));
    return s ? I18N.t(lang, 'placed', { thing: s }, rng) : I18N.t(lang, 'placed.any', null, rng);
  };

  // what we look for, named for the wrong line ("the red one", "the triangle", "the big one" / "mảnh màu đỏ", "chiếc ô tô
  // to", "hình tam giác")
  function wantPhrase(lang, want, t, cx) {
    var vi = lang === 'vi', params = cx.params;
    switch (want.k) {
      case 'color': {
        var c = colorOf(want.v);
        if (!c) break;
        return vi ? 'mảnh ' + NAMES.vi.color[c] : 'the ' + NAMES.en.color[c] + ' one';
      }
      case 'size': {
        var sz = sizeOf(want.v);
        if (!sz) break;
        var o = objOf(params.obj) || objOf(t.obj), a = animalOf(params.animal) || animalOf(t.animal);
        if (!vi) return 'the ' + NAMES.en.size[sz] + ' one';
        if (o) return NAMES.vi.obj[o] + ' ' + NAMES.vi.size[sz];
        if (a) return NAMES.vi.animal[a] + ' ' + NAMES.vi.size[sz];
        return 'mảnh ' + NAMES.vi.size[sz];
      }
      case 'shape': {
        var col = cx.mix ? colorOf(params.color) : null;
        return piecePhrase(lang, { kind: 'shape', shape: want.v, color: col }, { color: !!col });
      }
      case 'animal': return piecePhrase(lang, { kind: 'animal', animal: want.v });
      case 'obj': return piecePhrase(lang, { kind: 'obj', obj: want.v }, { color: false });
    }
    return phraseOf(lang, want);
  }

  // `wrong {id, got:{nameKind,nameValue}, want:{nameKind,nameValue}, streak, x, y}` (+ main adds thing = the dropped
  // piece's thing, topic, params = the step's params) → names what was dropped, then the goal.
  // Maths never names the right answer; parity says what the dropped number is; initial says the word's first letter.
  I18N.sayWrong = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var t = obj(ev.thing && typeof ev.thing === 'object' ? ev.thing : (ev.got && pieceKind(ev.got.kind) ? ev.got : null));
    var got = thingOf(ev.got), want = thingOf(ev.want), cx = ctxOf(ev), topic = cx.topic, params = cx.params;
    if (got.k == null && t.nameKind != null) got = thingOf(t);
    var k = pieceKind(t.kind);
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
    // counting pieces: "That one has four balloons. Let's find three balloons!"
    if (k === 'bunch' || k === 'dots' || topic === 'count') {
      var gN = num(t.n != null ? t.n : got.v), wN = num(want.v != null ? want.v : params.n);
      var ik = k || params.kind;
      if (gN != null && wN != null && gN !== wN)
        return I18N.t(lang, 'wrong.count', { got: name(lang, itemsKind(ik), gN), want: name(lang, itemsKind(ik), wN) }, rng);
      if (gN == null || wN == null) return I18N.t(lang, 'wrong.any', null, rng);
    }
    var g = k ? piecePhrase(lang, t, nameOpts(t, cx)) : '';
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
  // the whole count in one line: "One, two, three balloons!" / "Một, hai, ba quả bóng!" (n = 1: "One balloon!")
  I18N.sayCountRun = function (lang, n, kind) {
    lang = L(lang);
    var c = num(n);
    if (c == null || c < 1) return c === 0 ? I18N.sayCount(lang, 0) : I18N.t(lang, 'praise');
    var list = [];
    for (var i = 1; i <= c; i++) list.push(numberName(lang, i));
    return capFirst(list.join(', ') + ' ' + itemsWord(lang, kind, c, true)) + '!';
  };
  // the count is complete: "Three balloons! Hooray!"
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
    if (kind === 'obj') return objOf(value) ? I18N.t(lang, lang === 'en' ? 'talk.wrong.animal' : 'talk.wrong', ans) : I18N.t(lang, 'talk.wrong.any');
    if (kind === 'shape') return I18N.t(lang, lang === 'en' ? 'talk.wrong.a' : 'talk.wrong', ans);
    if (kind === 'size') return I18N.t(lang, 'talk.wrong.size', ans);
    if (kind === 'letter' || (kind === 'text' && isLetter(String(value)))) {
      var lv = String(value);
      return I18N.t(lang, lv !== lv.toUpperCase() ? 'talk.wrong.small' : 'talk.wrong.letter', { letter: lv });
    }
    if (kind === 'number' || kind === 'dots' || kind === 'bunch' || ((kind === 'parity' || kind === 'text') && num(value) != null))
      return I18N.t(lang, 'talk.wrong.number', { answer: { kind: 'number', value: value } });
    if (kind === 'parity' && lang === 'vi') return I18N.t(lang, 'talk.wrong.number', ans);
    return I18N.t(lang, 'talk.wrong', ans);
  };

  // Text → TTS-friendly text (Voice.say calls this). Display text stays untouched.
  // "Pom" is read well by English and Vietnamese voices ("om" as in "bom"): no rewrite.
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

  PZ.I18N = I18N;
})(window.PZ = window.PZ || {});
