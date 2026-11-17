/* Tibo's Dino Lake Fishing — TL.I18N (English + Vietnamese). Tibo (EN "Tibo", VI titles "Rùa Tibo", VI lines "Tibo") is a
 * cheerful baby turtle in a straw sun hat who fishes on a mossy rock in a dinosaur-valley lake. 2–5 fish (or soap bubbles with
 * an animal friend inside) swim by; Tibo asks for EXACTLY ONE of them ("Catch the red fish!"); the child taps it, the line
 * flies, the fish is reeled up, shown (spots counted aloud), released with a leap, and a water lily blooms. docs/VOICE.md is
 * the reference (API, keys, event → line table, speech policy).
 *
 *   TL.I18N.t(lang, key, params?, rng?)               → string (a random variant; rng.next() / rng() / Math.random)
 *   TL.I18N.ask(lang, promptKey, params, {first, rng}) → the "catch the X" question; first:true → the long first-time form
 *   TL.I18N.name(lang, kind, value)                   → kinds: color (vi "màu đỏ"), hue (bare "đỏ"), shape, shapeH (vi
 *       "hình ngôi sao"), animal / guest ("con thỏ" …), word (bare noun "thỏ"), who, home (sea ice forest desert savanna),
 *       homeAt ("in the sea" / "dưới biển"), number / n (0–20), spots (n → "three spots" / "ba chấm"), letter, lower,
 *       initial, sum, diff, parity, size, text, fish / thing (a member thing → its phrase without article)
 *   TL.I18N.words(lang, kind, value)                  → accepted spoken forms (lower-case, + no-diacritic forms, digits)
 *   TL.I18N.choiceWords(lang, choice)                 → spoken forms of a Talk choice {id, thing}
 *   TL.I18N.initial(lang, kind, value)                → first letter of the BARE noun, diacritics → base letter
 *       (en fox → "F"; vi "con cáo" → "C", "chim cánh cụt" → "C"); kind may be a thing
 *   TL.I18N.bareWord(lang, kind, value)               → that bare noun ("fox" / "cáo")
 *   TL.I18N.phrase(lang, thing, opts?) / sayName(lang, thing) → "the red fish" / "con cá màu đỏ", "the fish with the star" /
 *       "con cá có hình ngôi sao", "the fish with three spots" / "con cá có ba chấm", "the little fish" / "con cá nhỏ",
 *       "the fish with letter B" / "con cá có chữ B", "the penguin" / "chim cánh cụt"
 *   TL.I18N.sayRight(lang, e, rng?)                   → "A red fish! Well done!", "The crab! The crab lives in the sea."
 *   TL.I18N.sayWrong(lang, e, rng?)                   → names what was tapped kindly, then the goal ("That one is a blue
 *       fish. Let’s find the red fish!")
 *   TL.I18N.sayWrongHint(lang, e, rng?)               → the miss that brings the hint: "That’s the blue fish. Look at the glowing one!"
 *   TL.I18N.sayCount(lang, i)                         → "One!" … "Twenty!"
 *   TL.I18N.sayCountRun(lang, n)                      → "1, 2, 3 — three spots!" / "1, 2, 3 — ba chấm!"
 *   TL.I18N.talkWrong(lang, choice | kind, value, talk?) → "It is red! Good try!" / "The penguin lives on the ice! Good try!"
 *   TL.I18N.speech(lang, text)                        → text tuned for TTS (letter names, + − =, "…" / " — " → pause)
 *   TL.I18N.setChild(name)  has  keys  raw  langs  TOPICS  COLORS  SHAPES  ANIMALS (= GUESTS)  HOMES  ANIMAL_HOME  PROMPTS
 *
 * Event `e` for sayRight / sayWrong = the world event + { topic, promptKey, params, rule } from main (round.rule = what the
 * TARGET is: {kind, value}; wrong events carry it as `want`). e.thing = the member's thing (right carries it; for wrong main
 * adds world.memberById(e.id).thing — if missing it is rebuilt from e.got {nameKind, nameValue}).
 * Thing = { kind 'fish'|'bubble', color?, mark?: {shape, color} | {n} | {text}, animal?, home?, big?, nameKind?, nameValue? }.
 * Rule kinds: color, shape, size, n, animal, home, letter, lower, initial, sum, diff, parity (aliases: count / number / spots →
 * n, add → sum, sub → diff, oddeven → parity, colors → color …). Missing rule → derived from topic / promptKey / params.
 * {child}: with an empty name, variants containing {child} are skipped ("bé {child}" → "bé", ", {child}!" → "!").
 * Never negative: no "wrong", "no", "oops", "sai", "nhầm", "không đúng" … (tested).
 */
(function (TL) {
  'use strict';

  var LANGS = ['en', 'vi'];
  var COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'oval', 'rect', 'diamond'];
  var ANIMALS = ['bunny', 'fox', 'deer', 'squirrel', 'owl', 'raccoon', 'mouse', 'hedgehog', 'penguin', 'crab', 'goldfish',
    'camel', 'lion'];
  var HOMES = ['sea', 'ice', 'forest', 'desert', 'savanna'];
  // DESIGN §5.1 TL.GUESTS (content.js may keep the goldfish out of "who lives in the sea?" rounds — i18n just names it)
  var ANIMAL_HOME = { bunny: 'forest', fox: 'forest', deer: 'forest', squirrel: 'forest', owl: 'forest', raccoon: 'forest',
    mouse: 'forest', hedgehog: 'forest', penguin: 'ice', crab: 'sea', goldfish: 'sea', camel: 'desert', lion: 'savanna' };
  var TOPICS = ['colors', 'shapes', 'size', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
  var RULE_KINDS = ['color', 'shape', 'size', 'n', 'animal', 'home', 'letter', 'lower', 'initial', 'sum', 'diff', 'parity'];
  var MEMBER_KINDS = ['fish', 'bubble'];
  // thing kinds (+ aliases) → fish | bubble. Talk icons color/number/home/size/letter are handled apart; any other kind with a
  // mark / colour / size is named as a fish (markOf also reads flat shape / n / text fields).
  var KIND_OF = { fish: 'fish', bubble: 'bubble', guest: 'bubble', animal: 'bubble', friend: 'bubble' };
  var MAX_COUNT = 20;

  // ---------------------------------------------------------------- names
  var NAMES = { en: {}, vi: {} };
  NAMES.en.color = { red: 'red', blue: 'blue', yellow: 'yellow', green: 'green', orange: 'orange', purple: 'purple', pink: 'pink' };
  NAMES.vi.color = { red: 'màu đỏ', blue: 'màu xanh dương', yellow: 'màu vàng', green: 'màu xanh lá', orange: 'màu cam',
    purple: 'màu tím', pink: 'màu hồng' };
  NAMES.en.hue = NAMES.en.color;
  NAMES.vi.hue = { red: 'đỏ', blue: 'xanh dương', yellow: 'vàng', green: 'xanh lá', orange: 'cam', purple: 'tím', pink: 'hồng' };
  NAMES.en.shape = { circle: 'circle', square: 'square', triangle: 'triangle', star: 'star', heart: 'heart', oval: 'oval',
    rect: 'rectangle', diamond: 'diamond' };
  NAMES.vi.shape = { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', star: 'ngôi sao', heart: 'trái tim',
    oval: 'hình bầu dục', rect: 'hình chữ nhật', diamond: 'hình thoi' };
  NAMES.en.shapeH = NAMES.en.shape;
  // in lines VI always says "hình …": "con cá có hình ngôi sao"
  NAMES.vi.shapeH = { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', star: 'hình ngôi sao',
    heart: 'hình trái tim', oval: 'hình bầu dục', rect: 'hình chữ nhật', diamond: 'hình thoi' };
  // bubble friends (VI with the classifier kids use: con …; "chim cánh cụt" already is a classifier + noun)
  NAMES.en.animal = { bunny: 'bunny', fox: 'fox', deer: 'deer', squirrel: 'squirrel', owl: 'owl', raccoon: 'raccoon',
    mouse: 'mouse', hedgehog: 'hedgehog', penguin: 'penguin', crab: 'crab', goldfish: 'goldfish', camel: 'camel', lion: 'lion' };
  NAMES.vi.animal = { bunny: 'con thỏ', fox: 'con cáo', deer: 'con nai', squirrel: 'con sóc', owl: 'con cú',
    raccoon: 'con gấu mèo', mouse: 'con chuột', hedgehog: 'con nhím', penguin: 'chim cánh cụt', crab: 'con cua',
    goldfish: 'con cá vàng', camel: 'con lạc đà', lion: 'con sư tử' };
  NAMES.en.word = NAMES.en.animal;
  NAMES.vi.word = { bunny: 'thỏ', fox: 'cáo', deer: 'nai', squirrel: 'sóc', owl: 'cú', raccoon: 'gấu mèo', mouse: 'chuột',
    hedgehog: 'nhím', penguin: 'chim cánh cụt', crab: 'cua', goldfish: 'cá vàng', camel: 'lạc đà', lion: 'sư tử' };
  NAMES.en.who = NAMES.en.animal;
  NAMES.vi.who = NAMES.vi.animal;
  NAMES.en.home = { sea: 'sea', ice: 'ice', forest: 'forest', desert: 'desert', savanna: 'savanna' };
  NAMES.vi.home = { sea: 'biển', ice: 'xứ băng', forest: 'rừng', desert: 'sa mạc', savanna: 'đồng cỏ châu Phi' };
  // used after "lives" / "sống": the preposition is part of the phrase ("sống dưới biển", "sống ở xứ băng")
  NAMES.en.homeAt = { sea: 'in the sea', ice: 'on the ice', forest: 'in the forest', desert: 'in the desert', savanna: 'on the savanna' };
  NAMES.vi.homeAt = { sea: 'dưới biển', ice: 'ở xứ băng', forest: 'trong rừng', desert: 'ở sa mạc', savanna: 'ở đồng cỏ châu Phi' };
  NAMES.en.size = { big: 'big', small: 'little' };
  NAMES.vi.size = { big: 'to', small: 'nhỏ' };
  NAMES.en.parity = { odd: 'odd', even: 'even' };
  NAMES.vi.parity = { odd: 'lẻ', even: 'chẵn' };
  // the spots on a counting fish: EN spot / spots, VI "chấm" ("con cá có ba chấm")
  var SPOT = { en: ['spot', 'spots'], vi: ['chấm', 'chấm'] };
  var FISH = { en: 'fish', vi: 'con cá' };

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
  // No form is shared by two values of the same kind (tested).
  var WORDS = {
    en: {
      color: { red: ['red', 'read', 'reds', 'red fish'], blue: ['blue', 'blew', 'blues', 'blue fish'],
        yellow: ['yellow', 'yello', 'yellow fish'], green: ['green', 'greens', 'green fish'],
        orange: ['orange', 'oranges', 'orange fish'], purple: ['purple', 'violet', 'pupple', 'purple fish'],
        pink: ['pink', 'pinks', 'pinky', 'pink fish'] },
      shape: { circle: ['circle', 'round', 'ring', 'circles'], square: ['square', 'squares'],
        triangle: ['triangle', 'try angle', 'triangles'], star: ['star', 'stars'], heart: ['heart', 'hearts', 'hart', 'love'],
        rect: ['rectangle', 'rectangles', 'long box'], oval: ['oval', 'ovals', 'egg shape'], diamond: ['diamond', 'diamonds'] },
      size: { big: ['big', 'large', 'huge', 'bigger', 'giant', 'big fish', 'the big one'],
        small: ['little', 'small', 'tiny', 'smaller', 'baby', 'little fish', 'small fish', 'the little one'] },
      animal: { bunny: ['bunny', 'rabbit', 'bunnies', 'bunny rabbit', 'rabbits'], fox: ['fox', 'foxy', 'foxes'],
        deer: ['deer', 'fawn', 'reindeer', 'dear'], squirrel: ['squirrel', 'squirrels', 'squirl'],
        owl: ['owl', 'owls', 'owlet', 'hoot'], raccoon: ['raccoon', 'racoon', 'raccoons', 'coon'],
        mouse: ['mouse', 'mice', 'mousey', 'mousie'], hedgehog: ['hedgehog', 'hedgehogs', 'hedgie', 'hedge hog', 'porcupine'],
        penguin: ['penguin', 'penguins'], crab: ['crab', 'crabs', 'crabby'],
        goldfish: ['goldfish', 'gold fish', 'fish', 'fishy', 'golden fish'], camel: ['camel', 'camels', 'hump'],
        lion: ['lion', 'lions', 'roar'] },
      home: { forest: ['forest', 'the forest', 'in the forest', 'woods', 'the woods', 'trees', 'wood'],
        sea: ['sea', 'the sea', 'ocean', 'beach', 'water', 'in the sea'],
        ice: ['ice', 'the ice', 'snow', 'iceberg', 'cold', 'south pole', 'antarctica', 'on the ice'],
        desert: ['desert', 'the desert', 'dessert', 'sand', 'sandy', 'dunes'],
        savanna: ['savanna', 'savannah', 'africa', 'grassland', 'grass'] },
      parity: { odd: ['odd', 'odds'], even: ['even', 'evens'] }
    },
    vi: {
      color: { red: ['đỏ', 'màu đỏ', 'cá đỏ', 'con cá màu đỏ'], blue: ['xanh dương', 'xanh da trời', 'xanh nước biển', 'xanh lam', 'da trời', 'dương'],
        yellow: ['vàng', 'màu vàng', 'cá vàng'], green: ['xanh lá', 'xanh lá cây', 'xanh lục', 'lá cây'], orange: ['cam', 'màu cam'],
        purple: ['tím', 'màu tím'], pink: ['hồng', 'màu hồng'] },
      shape: { circle: ['hình tròn', 'tròn'], square: ['hình vuông', 'vuông'], triangle: ['tam giác', 'hình tam giác'],
        star: ['ngôi sao', 'sao', 'hình ngôi sao', 'hình sao'], heart: ['trái tim', 'tim', 'hình trái tim', 'hình tim'],
        rect: ['chữ nhật', 'hình chữ nhật'], oval: ['bầu dục', 'hình bầu dục'], diamond: ['hình thoi', 'thoi'] },
      size: { big: ['to', 'lớn', 'bự', 'to lắm', 'to hơn', 'to nhất', 'cá to', 'con cá to', 'cá lớn'],
        small: ['nhỏ', 'bé', 'nhỏ xíu', 'nhỏ hơn', 'tí hon', 'nhỏ nhất', 'cá nhỏ', 'con cá nhỏ', 'cá bé'] },
      animal: { bunny: ['con thỏ', 'thỏ', 'thỏ con', 'thỏ trắng'], fox: ['con cáo', 'cáo', 'cáo con'],
        deer: ['con nai', 'nai', 'nai con', 'con hươu', 'hươu'], squirrel: ['con sóc', 'sóc', 'sóc con'],
        owl: ['con cú', 'cú', 'cú mèo', 'chim cú', 'con cú mèo'], raccoon: ['con gấu mèo', 'gấu mèo', 'gấu trúc mỹ'],
        mouse: ['con chuột', 'chuột', 'chuột con', 'chuột nhắt'], hedgehog: ['con nhím', 'nhím', 'nhím con'],
        penguin: ['chim cánh cụt', 'cánh cụt', 'con chim cánh cụt'], crab: ['con cua', 'cua', 'cua biển'],
        goldfish: ['con cá vàng', 'cá vàng', 'con cá', 'cá'], camel: ['con lạc đà', 'lạc đà'],
        lion: ['con sư tử', 'sư tử', 'chúa sơn lâm'] },
      home: { forest: ['rừng', 'trong rừng', 'rừng xanh', 'khu rừng', 'rừng cây', 'ở rừng'],
        sea: ['biển', 'dưới biển', 'đại dương', 'bờ biển', 'nước', 'ở biển'],
        ice: ['xứ băng', 'băng', 'tuyết', 'băng tuyết', 'nam cực', 'bắc cực', 'xứ lạnh', 'ở xứ băng'],
        desert: ['sa mạc', 'xa mạc', 'cát', 'sa mạc cát', 'ở sa mạc'],
        savanna: ['đồng cỏ châu phi', 'đồng cỏ', 'châu phi', 'thảo nguyên'] },
      parity: { odd: ['lẻ', 'số lẻ', 'lẽ', 'lẹ'], even: ['chẵn', 'số chẵn', 'chặn', 'chắn'] }
    }
  };

  // ---------------------------------------------------------------- strings
  // prompt keys content.js asks with (DESIGN §5.1) and the RAW params content passes
  var PROMPTS = {
    'p.color': ['color'], 'p.shape': ['shape'], 'p.size': ['big'], 'p.count': ['n'], 'p.animal': ['animal'], 'p.home': ['home'],
    'p.letter': ['letter'], 'p.lower': ['letter'], 'p.initial': ['letter'], 'p.add': ['a', 'b'], 'p.sub': ['a', 'b'],
    'p.oddeven': ['parity']
  };
  // older / plural prompt names (sister games) → the fishing keys
  var PROMPT_ALIAS = { 'p.colors': 'p.color', 'p.shapes': 'p.shape', 'p.shapes5': 'p.shape', 'p.sizeBig': 'p.size',
    'p.letters': 'p.letter', 'p.forest': 'p.home', 'p.homes': 'p.home', 'p.animals': 'p.animal', 'p.spots': 'p.count',
    'p.sum': 'p.add', 'p.diff': 'p.sub', 'p.parity': 'p.oddeven' };

  var STR = {
    en: {
      'ui.title': 'Tibo’s Dino Lake Fishing',
      'ui.logo1': 'Tibo’s',
      'ui.logo2': 'Dino Lake Fishing',
      'ui.subtitle': 'Catch the fish Tibo asks for, and a water lily blooms!',
      'ui.tagline': 'Catch the fish Tibo asks for, and a water lily blooms!',
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
      'ui.voice': 'Tibo’s voice',
      'ui.mic': 'Answer by talking',
      'ui.done': 'Done',
      'ui.stars': 'Stars',
      'ui.chapter': 'Chapter {n}',
      'ui.allDone': 'All done! {stars} stars',
      'ui.welcome': ['Hi {child}! I am Tibo the turtle. Let’s go fishing at Dino Lake!',
        'Hi! I am Tibo the turtle. Let’s go fishing at Dino Lake!'],
      'ui.micUnsupported': 'Voice answers are not available here. Tap the pictures!',
      'ui.micDenied': 'The microphone is off. Tap the pictures instead!',
      'ui.voiceMissing': 'Tip for parents: add a voice in Settings › Accessibility › Spoken Content › Voices.',
      'ui.tapOrSay': 'Tap or say the answer!',
      'ui.listening': 'Tibo is listening…',
      'ui.tapTibo': 'Tap Tibo to hear it again',
      'ui.tapHint': 'Tap the fish Tibo asks for',
      'ui.skip': 'Skip',
      'ui.gallery': 'Our lily lake',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Colourful Fish',
      'topic.shapes': 'Fish Shapes',
      'topic.size': 'Big Fish, Little Fish',
      'topic.count': 'Counting Spots',
      'topic.animals': 'Bubble Friends',
      'topic.letters': 'Letter Fish',
      'topic.lower': 'Big and Small Letters',
      'topic.initial': 'First Letters',
      'topic.add': 'Adding Up',
      'topic.sub': 'Take Away',
      'topic.oddeven': 'Odd and Even',

      'weather.0': ['Good morning, lake!', 'Good morning! The lake is waking up!'],
      'weather.1': ['The sun is high — sparkly water!', 'Look how the water sparkles in the sun!'],
      'weather.2': ['What a pretty sunset!', 'The sky is glowing! What a pretty sunset!'],
      'weather.3': ['Look at the stars!', 'Good night, lake! Look at the twinkly stars!'],

      'enter': ['Here come the fish!', 'Swish, swish! Here come the fish!', 'Look who is swimming by!'],

      'p.any': ['Let’s catch a fish!', 'Which one shall Tibo catch?', 'Tap the one Tibo asks for!'],
      'p.number': ['Catch the fish with {num}!', 'Find the fish with {num}!', 'Which fish has {num}? Tap it!'],
      'p.color': ['Catch the {color} fish!', 'Can you find the {color} fish?', 'Where is the {color} fish? Tap it!'],
      'p.color.first': ['Tibo wants to catch a fish! Tap the {color} fish, and Tibo will catch it!'],
      'p.shape': ['Catch the fish with the {shape}!', 'Which fish has a {shape}? Tap it!', 'Find the fish with the {shape} on its side!'],
      'p.shape.first': ['Look at the shapes on the fish! Tap the fish with the {shape}, and Tibo will catch it!'],
      'p.size': ['Catch the {size} fish!', 'Where is the {size} fish? Tap it!', 'Can you find the {size} fish?'],
      'p.size.first': ['Some fish are big, some are little. Tap the {size} fish, and Tibo will catch it!'],
      'p.count': ['Catch the fish with {num} {spots}!', 'Count the spots! Which fish has {num} {spots}?', 'Find the fish with {num} {spots}!'],
      'p.count.first': ['Let’s count spots! Tap the fish with {num} {spots}, and Tibo will catch it!'],
      'p.animal': ['Catch the {animal}!', 'Where is the {animal}? Tap the bubble!', 'Can you find the {animal}?'],
      'p.animal.first': ['Friends are floating in bubbles! Tap the {animal}, and Tibo will catch the bubble!'],
      'p.home': ['Who lives {home}? Catch that friend!', 'Which friend lives {home}? Tap the bubble!', 'Find the friend who lives {home}!'],
      'p.home.first': ['Every friend has a home. Who lives {home}? Tap that friend, and Tibo will catch the bubble!'],
      'p.letter': ['Catch the fish with letter {letter}!', 'Which fish has letter {letter}? Tap it!', 'Find letter {letter}!'],
      'p.letter.first': ['The fish have letters! Tap the fish with letter {letter}, and Tibo will catch it!'],
      'p.lower': ['Here is big {letter}. Catch the fish with small {lower}!', 'Big {letter} has a little friend, small {lower}! Which fish has it?',
        'Find small {lower}, the friend of big {letter}!'],
      'p.lower.first': ['This is big {letter}. Its friend is small {lower}! Tap the fish with small {lower}, and Tibo will catch it!'],
      'p.initial': ['Who starts with {letter}? Catch that friend!', 'Listen: {letter}! Whose name starts with {letter}?',
        'Find the friend whose name starts with {letter}!'],
      'p.initial.first': ['Listen to the names! Whose name starts with {letter}? Tap that friend, and Tibo will catch the bubble!'],
      'p.add': ['What is {a} + {b}? Catch that number!', '{a} + {b} makes… which fish? Tap it!', 'Let’s add {a} + {b}! Find the fish with the answer!'],
      'p.add.first': ['Let’s add! {a} + {b} makes how many? Tap the fish with the answer, and Tibo will catch it!'],
      'p.sub': ['What is {a} − {b}? Catch that number!', '{a} − {b} makes… which fish? Tap it!', 'Let’s take away {a} − {b}! Find the fish with the answer!'],
      'p.sub.first': ['Let’s take away! {a} − {b} makes how many? Tap the fish with the answer, and Tibo will catch it!'],
      'p.oddeven': ['Catch the fish with a {parity} number!', 'Which fish has a {parity} number? Tap it!', 'Find a {parity} number!'],
      'p.oddeven.first': ['Odd or even? Tap the fish with a {parity} number, and Tibo will catch it!'],

      'right.color': ['A {color} fish! Well done!', 'You found the {color} fish! Hooray!', 'Yes! The {color} fish!'],
      'right.shape': ['The fish with the {shape}! Well done!', 'Yes! This fish has a {shape}!', 'A {shape}! You found it!'],
      'right.size': ['The {size} fish! Well done!', 'Yes! What a {size} fish!', 'You found the {size} fish! Hooray!'],
      'right.n': ['You caught it! Let’s count the spots!', 'Yes! Let’s count the spots together!', 'Hooray! How many spots? Let’s count!'],
      'right.animal': ['The {animal}! Well done!', 'You found the {animal}! Hooray!', 'Yes! Hello, little {word}!'],
      'right.home': ['The {animal}! The {animal} lives {home}.', 'Yes! The {animal} lives {home}!', 'You found it! The {animal} lives {home}.'],
      'right.letter': ['Letter {letter}! Well done!', 'Yes! The fish with letter {letter}!', 'You found letter {letter}! Hooray!'],
      'right.lower': ['Small {lower}! Big {letter} and small {lower} are friends!', 'Yes! Small {lower} goes with big {letter}!',
        'You found small {lower}! Hooray!'],
      'right.initial': ['The {animal}! {word} starts with {letter}!', 'Yes! {letter} is for {word}!',
        'You found the {animal}! {word} starts with {letter}.'],
      'right.sum': ['{a} + {b} makes {ans}! Well done!', 'Yes! {a} + {b} is {ans}!', '{ans}! Super adding!'],
      'right.diff': ['{a} − {b} makes {ans}! Well done!', 'Yes! {a} − {b} is {ans}!', '{ans}! Super thinking!'],
      'right.number': ['{ans}! Well done!', 'Yes! It’s {ans}!', 'You found {ans}! Hooray!'],
      'right.parity': ['{num} is {parity}! Well done!', 'Yes! {num} is a {parity} number!', 'You found a {parity} number! Hooray!'],
      'right.any': ['You caught it! Well done!', 'Hooray! That’s the one!', 'Yes! Well done!'],

      'wrong.color': ['That one is a {got} fish. Let’s find the {color} fish!', 'Oh, a {got} fish! Where is the {color} fish?',
        'This fish is {got}. Let’s look for the {color} one!'],
      'wrong.shape': ['That fish has a {got}. Let’s find the fish with the {shape}!', 'Oh, a {got}! Where is the fish with the {shape}?',
        'This one has a {got}. Let’s look for the {shape}!'],
      'wrong.size': ['That one is a {got} fish. Let’s find the {size} fish!', 'Oh, a {got} fish! Where is the {size} fish?',
        'This fish is {got}. Let’s look for the {size} one!'],
      'wrong.n': ['That fish has {gotNum} {gotSpots}. Let’s find the fish with {num} {spots}!',
        'Let’s count, {gotNum} {gotSpots}! Where is the fish with {num} {spots}?',
        'This one has {gotNum} {gotSpots}. Let’s look for {num} {spots}!'],
      'wrong.animal': ['That’s the {got}! Let’s find the {animal}!', 'Hello, {got}! Where is the {animal}?',
        'This is the {got}. Let’s look for the {animal}!'],
      'wrong.home': ['That’s the {got}. The {got} lives {gotHome}. Who lives {home}?', 'The {got} lives {gotHome}! Who lives {home}?',
        'Oh, the {got} lives {gotHome}. Let’s find who lives {home}!'],
      'wrong.letter': ['That’s {got}. Let’s find letter {letter}!', 'Oh, {got}! Where is letter {letter}?',
        'This fish has {got}. Let’s look for letter {letter}!'],
      'wrong.lower': ['That’s {got}. Let’s find small {lower}, the friend of big {letter}!', 'Oh, {got}! Where is small {lower}?',
        'This fish has {got}. Let’s look for small {lower}!'],
      'wrong.initial': ['That’s the {got}. {word} starts with {first}. Who starts with {letter}?',
        'Listen: {word} starts with {first}! Who starts with {letter}?',
        'The {got}! {word} starts with {first}. Let’s find who starts with {letter}!'],
      'wrong.sum': ['That fish has {got}. Let’s add {a} + {b} again!', 'Oh, {got}! What is {a} + {b}? Let’s count again!',
        'This one is {got}. Let’s count {a} + {b} on our fingers!'],
      'wrong.diff': ['That fish has {got}. Let’s take away {a} − {b} again!', 'Oh, {got}! What is {a} − {b}? Let’s count again!',
        'This one is {got}. Let’s count {a} − {b} on our fingers!'],
      'wrong.number': ['That fish has {got}. Let’s look again!', 'Oh, {got}! Let’s try another fish!', 'This one is {got}. Let’s count again!'],
      'wrong.parity': ['{got} is {gotParity}. Let’s find a {parity} number!', 'Oh, {got} is {gotParity}! Where is a {parity} number?',
        'That fish has {got}. Let’s look for a {parity} number!'],
      'wrong.hint': ['That’s {thing}. Look at the glowing one!', 'That’s {thing}. Watch the little hand!', 'Oh, {thing}! Look at the shiny one!'],
      'wrong.any': ['Let’s look again!', 'Hmm, let’s try another one!', 'Keep going, you can do it!'],

      'count.run': '{list} — {num} {spots}!',
      'cast': ['Swish!', 'Swish! Off goes the line!', 'Here goes!'],
      'bite': ['Got it!', 'A bite! Reel it in!', 'Nibble, nibble… got it!'],
      'release': ['Bye bye, little fish!', 'Off you go! Splash!', 'Swim home, little fish!'],
      'releaseFriend': ['Bye bye, little friend!', 'Off you go, little friend!', 'Float home, little friend!'],
      'lily': ['A water lily!', 'Look, a lily is blooming!', 'Pop! A pretty flower!'],
      'pond': ['Four lilies! The lake is so pretty!', 'Look at all the lilies! What a pretty lake!', 'Hooray! The lake is full of flowers!'],
      'joy': ['Hop, hop! The fish are happy!', 'Splash! Jump for joy!', 'Wheee! Everybody jumps!'],
      'surprise.ptero': ['Look! A baby pterosaur is flying by!', 'Whoosh! Who is that in the sky?', 'A little flying dinosaur says hello!'],
      'surprise.bronto': ['Look! A baby long-neck dinosaur!', 'Splish, splash! Who is wading in?', 'A baby dinosaur came to play in the lake!'],
      'surprise.frog': ['Look! A frog on a lily pad!', 'Ribbit! Who is that?', 'A little frog came to say hi!'],
      'surprise.fireflies': ['Look! Fireflies!', 'Twinkle, twinkle! Little fireflies!', 'The fireflies are dancing over the lake!'],
      'critter.ptero': ['Flap, flap! Wheee!', 'Bye-bye, little flyer!', 'Swoop! What a flyer!'],
      'critter.bronto': ['Whoosh! A water fountain!', 'Splash! Hee hee!', 'Pshhh! What a big spray!'],
      'critter.frog': ['Ribbit! Hop!', 'Boing! Hop, hop!', 'Ribbit, ribbit!'],
      'critter.fireflies': ['Twinkle!', 'Sparkle, sparkle!', 'Glow, little firefly!'],
      'tibo.poke': ['Hee hee! That tickles!', 'Hi there! Tibo is happy!', 'Shh! The fish are listening!'],

      'praise': ['Yes!', 'Great job!', 'You got it!', 'Super!', 'Wonderful!', 'Hooray!', 'Well done!', 'Great fishing!',
        'Yes, {child}!', 'Well done, {child}!', 'Super, {child}!'],
      'great': ['Great fishing, {child}!', 'You did it, {child}!', 'What a great fisher!', 'Wow, {child}, super catch!',
        'Hooray! Another lily!', 'You are so clever!', 'Wonderful!'],
      'party': ['Look at all our lilies!', 'Hooray! What a happy lake!', 'Everybody is jumping!'],
      'hint': ['Psst! Look at the glowing one!', 'Watch the little hand!', 'Tibo will help! Tap this one!',
        'Look, this one is sparkling!', 'The shiny one! Tap it!'],
      'idle': ['Tibo is waiting! Your turn!', 'Let’s catch a fish!', 'I am here, {child}! Let’s play!',
        'The fish are swimming by! Let’s play!', 'Ready to fish?'],

      'talk.intro': 'Talk time!',
      'talk.colors': 'What colour is this fish?',
      'talk.colorsAny': 'What colour is this fish?',
      'talk.colorsWhich': 'Which fish is {color}?',
      'talk.shapes': 'Which fish has the {shape}?',
      'talk.shapesAny': 'What shape is on this fish?',
      'talk.size': 'Which fish is {size}?',
      'talk.sizeAny': 'Which fish is the little one?',
      'talk.count': 'How many spots?',
      'talk.countAny': 'How many are there?',
      'talk.animals': 'Where does the {animal} live?',
      'talk.home': 'Where does the {animal} live?',
      'talk.homeAny': 'Where does this friend live?',
      'talk.who': 'Who is this?',
      'talk.letters': 'Which fish has letter {letter}?',
      'talk.lettersAny': 'Which letter is this?',
      'talk.lower': 'Which fish has small {lower}? It goes with big {letter}!',
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
      'talk.wrong.size': 'It is the {answer} fish! Good try!',
      'talk.wrong.letter': 'It is letter {letter}! Good try!',
      'talk.wrong.small': 'It is small {letter}! Good try!',
      'talk.wrong.number': 'It is {answer}! Good try!',
      'talk.wrong.spots': 'There are {num} {spots}! Good try!',
      'talk.wrong.home': '{thing} lives {home}! Good try!',
      'talk.wrong.place': 'It lives {home}! Good try!',
      'talk.wrong.any': 'Good try! Let’s play more!',

      'session.done': ['What a fishing day! {stars} stars! Hooray!', 'Amazing, {child}! {stars} stars!',
        'The lake is full of lilies! {stars} stars!']
    },
    vi: {
      'ui.title': 'Rùa Tibo Câu Cá Hồ Khủng Long',
      'ui.logo1': 'Rùa Tibo',
      'ui.logo2': 'Câu Cá Hồ Khủng Long',
      'ui.subtitle': 'Bé chạm đúng con cá Tibo nhờ, hoa súng sẽ nở trên hồ nhé!',
      'ui.tagline': 'Bé chạm đúng con cá Tibo nhờ, hoa súng sẽ nở trên hồ nhé!',
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
      'ui.voice': 'Giọng của Rùa Tibo',
      'ui.mic': 'Nói để trả lời',
      'ui.done': 'Xong',
      'ui.stars': 'Ngôi sao',
      'ui.chapter': 'Chương {n}',
      'ui.allDone': 'Hoàn thành! {stars} ngôi sao',
      'ui.welcome': ['Chào bé {child}! Mình là rùa Tibo. Mình cùng đi câu cá ở hồ khủng long nhé!',
        'Chào bé! Mình là rùa Tibo. Mình cùng đi câu cá ở hồ khủng long nhé!'],
      'ui.micUnsupported': 'Máy này chưa nghe được giọng nói. Bé chạm vào hình nhé!',
      'ui.micDenied': 'Micrô đang tắt. Bé chạm vào hình nhé!',
      'ui.voiceMissing': 'Mẹo cho bố mẹ: thêm giọng tiếng Việt trong Cài đặt › Trợ năng › Nội dung được đọc › Giọng nói.',
      'ui.tapOrSay': 'Bé chạm hoặc nói đáp án nhé!',
      'ui.listening': 'Tibo đang nghe…',
      'ui.tapTibo': 'Chạm vào Tibo để nghe lại nhé',
      'ui.tapHint': 'Bé chạm vào con cá Tibo nhờ nhé',
      'ui.skip': 'Bỏ qua',
      'ui.gallery': 'Hồ hoa súng của bé',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Cá sắc màu',
      'topic.shapes': 'Cá mang hình',
      'topic.size': 'Cá to, cá nhỏ',
      'topic.count': 'Cùng đếm chấm',
      'topic.animals': 'Bạn thú trong bong bóng',
      'topic.letters': 'Cá chữ cái',
      'topic.lower': 'Chữ hoa, chữ thường',
      'topic.initial': 'Chữ cái đầu tiên',
      'topic.add': 'Phép cộng',
      'topic.sub': 'Phép trừ',
      'topic.oddeven': 'Số chẵn, số lẻ',

      'weather.0': ['Chào buổi sáng, hồ ơi!', 'Chào buổi sáng! Mặt hồ thức dậy rồi!'],
      'weather.1': ['Mặt trời lên cao rồi, nước lấp lánh quá!', 'Bé xem nước hồ lấp lánh dưới nắng kìa!'],
      'weather.2': ['Hoàng hôn đẹp quá!', 'Bầu trời sáng rực rồi! Hoàng hôn đẹp quá!'],
      'weather.3': ['Bé nhìn các ngôi sao kìa!', 'Chúc hồ ngủ ngon! Bé nhìn sao lấp lánh kìa!'],

      'enter': ['Các bạn cá bơi tới rồi!', 'Bơi bơi, các bạn cá tới rồi nè!', 'Nhìn kìa, ai đang bơi tới thế?'],

      'p.any': ['Bé ơi, mình câu con cá nào nhỉ?', 'Bé chạm vào bạn Tibo nhờ nhé!', 'Mình cùng câu cá nào!'],
      'p.number': ['Bé ơi, câu con cá có số {num} nhé!', 'Bé tìm con cá có số {num} nhé!', 'Con cá nào có số {num} nhỉ?'],
      'p.color': ['Bé ơi, câu con cá {color} nhé!', 'Con cá {color} đâu rồi nhỉ? Bé chạm vào nhé!', 'Câu con cá {color} nhé!'],
      'p.color.first': ['Tibo muốn câu cá! Bé ơi, chạm vào con cá {color}, Tibo sẽ câu lên nhé!'],
      'p.shape': ['Bé ơi, câu con cá có {shape} nhé!', 'Con cá nào có {shape} nhỉ? Bé chạm vào nhé!', 'Bé tìm con cá có {shape} nhé!'],
      'p.shape.first': ['Bé nhìn hình trên mình cá nè! Bé ơi, chạm vào con cá có {shape}, Tibo sẽ câu lên nhé!'],
      'p.size': ['Bé ơi, câu con cá {size} nhé!', 'Con cá {size} đâu rồi nhỉ? Bé chạm vào nhé!', 'Bé tìm con cá {size} nhé!'],
      'p.size.first': ['Có cá to, có cá nhỏ! Bé ơi, chạm vào con cá {size}, Tibo sẽ câu lên nhé!'],
      'p.count': ['Bé ơi, câu con cá có {num} {spots} nhé!', 'Mình đếm chấm nào! Con cá nào có {num} {spots} nhỉ?',
        'Bé tìm con cá có {num} {spots} nhé!'],
      'p.count.first': ['Mình cùng đếm chấm nhé! Bé ơi, chạm vào con cá có {num} {spots}, Tibo sẽ câu lên nhé!'],
      'p.animal': ['Bé ơi, câu {animal} nhé!', '{animal} đâu rồi nhỉ? Bé chạm vào bong bóng nhé!', 'Bé tìm {animal} nhé!'],
      'p.animal.first': ['Các bạn thú đang ngồi trong bong bóng! Bé ơi, chạm vào {animal}, Tibo sẽ câu bong bóng lên nhé!'],
      'p.home': ['Bé ơi, bạn nào sống {home} nhỉ? Câu bạn ấy nhé!', 'Bạn nào sống {home}? Bé chạm vào bong bóng nhé!',
        'Bé tìm bạn sống {home} nhé!'],
      'p.home.first': ['Bạn nào cũng có nhà! Bạn nào sống {home} nhỉ? Bé ơi, chạm vào bạn ấy, Tibo sẽ câu bong bóng lên nhé!'],
      'p.letter': ['Bé ơi, câu con cá có chữ {letter} nhé!', 'Con cá nào có chữ {letter} nhỉ? Bé chạm vào nhé!', 'Bé tìm chữ {letter} nhé!'],
      'p.letter.first': ['Các bạn cá có chữ cái nè! Bé ơi, chạm vào con cá có chữ {letter}, Tibo sẽ câu lên nhé!'],
      'p.lower': ['Đây là chữ {letter} hoa. Bé ơi, câu con cá có chữ {lower} thường nhé!',
        'Chữ {letter} hoa có bạn là chữ {lower} thường! Con cá nào có chữ {lower} thường nhỉ?',
        'Bé tìm chữ {lower} thường, bạn của chữ {letter} hoa nhé!'],
      'p.lower.first': ['Đây là chữ {letter} hoa. Bạn của nó là chữ {lower} thường! Bé ơi, chạm vào con cá có chữ {lower} thường, Tibo sẽ câu lên nhé!'],
      'p.initial': ['Bé ơi, bạn nào có tên bắt đầu bằng chữ {letter} nhỉ? Câu bạn ấy nhé!',
        'Bé nghe nè, chữ {letter}! Tên bạn nào bắt đầu bằng chữ {letter} nhỉ?', 'Bé tìm bạn có tên bắt đầu bằng chữ {letter} nhé!'],
      'p.initial.first': ['Bé nghe tên các bạn nhé! Tên bạn nào bắt đầu bằng chữ {letter}? Bé ơi, chạm vào bạn ấy, Tibo sẽ câu bong bóng lên nhé!'],
      'p.add': ['Bé ơi, {a} + {b} bằng mấy nhỉ? Câu con cá có số đó nhé!', '{a} + {b} bằng mấy? Bé chạm vào con cá có đáp án nhé!',
        'Mình cộng nào, {a} + {b}! Bé tìm con cá có đáp án nhé!'],
      'p.add.first': ['Mình cùng cộng nhé! {a} + {b} bằng mấy? Bé ơi, chạm vào con cá có đáp án, Tibo sẽ câu lên nhé!'],
      'p.sub': ['Bé ơi, {a} − {b} bằng mấy nhỉ? Câu con cá có số đó nhé!', '{a} − {b} bằng mấy? Bé chạm vào con cá có đáp án nhé!',
        'Mình trừ nào, {a} − {b}! Bé tìm con cá có đáp án nhé!'],
      'p.sub.first': ['Mình cùng trừ nhé! {a} − {b} bằng mấy? Bé ơi, chạm vào con cá có đáp án, Tibo sẽ câu lên nhé!'],
      'p.oddeven': ['Bé ơi, câu con cá có số {parity} nhé!', 'Con cá nào có số {parity} nhỉ? Bé chạm vào nhé!', 'Bé tìm số {parity} nhé!'],
      'p.oddeven.first': ['Số chẵn hay số lẻ nhỉ? Bé ơi, chạm vào con cá có số {parity}, Tibo sẽ câu lên nhé!'],

      'right.color': ['Con cá {color}! Bé giỏi quá!', 'Bé tìm được con cá {color} rồi! Hoan hô!', 'Đúng rồi! Con cá {color} đây!'],
      'right.shape': ['Con cá có {shape}! Bé giỏi quá!', 'Đúng rồi! Con cá này có {shape}!', 'Bé tìm được {shape} rồi! Hoan hô!'],
      'right.size': ['Con cá {size}! Bé giỏi quá!', 'Đúng rồi! Con cá {size} đây!', 'Bé tìm được con cá {size} rồi! Hoan hô!'],
      'right.n': ['Bé câu được rồi! Mình cùng đếm chấm nhé!', 'Đúng rồi! Mình cùng đếm chấm nào!', 'Hoan hô! Có mấy chấm nhỉ? Mình đếm nhé!'],
      'right.animal': ['{animal} đây rồi! Bé giỏi quá!', 'Bé tìm được {animal} rồi! Hoan hô!', 'Đúng rồi! Chào bạn {word} nhé!'],
      'right.home': ['{animal}! {animal} sống {home}.', 'Đúng rồi! {animal} sống {home}!', 'Bé tìm được rồi! {animal} sống {home}.'],
      'right.letter': ['Chữ {letter}! Bé giỏi quá!', 'Đúng rồi! Con cá có chữ {letter}!', 'Bé tìm được chữ {letter} rồi! Hoan hô!'],
      'right.lower': ['Chữ {lower} thường! Chữ {letter} hoa và chữ {lower} thường là bạn của nhau!',
        'Đúng rồi! Chữ {lower} thường đi với chữ {letter} hoa!', 'Bé tìm được chữ {lower} thường rồi! Hoan hô!'],
      'right.initial': ['{animal}! {word} bắt đầu bằng chữ {letter}!', 'Đúng rồi! Chữ {letter} như trong tên {word}!',
        'Bé tìm được {animal} rồi! {word} bắt đầu bằng chữ {letter}.'],
      'right.sum': ['{a} + {b} bằng {ans}! Bé giỏi quá!', 'Đúng rồi! {a} + {b} bằng {ans}!', '{ans}! Bé cộng giỏi quá!'],
      'right.diff': ['{a} − {b} bằng {ans}! Bé giỏi quá!', 'Đúng rồi! {a} − {b} bằng {ans}!', '{ans}! Bé trừ giỏi quá!'],
      'right.number': ['Số {ans}! Bé giỏi quá!', 'Đúng rồi! Là số {ans}!', 'Bé tìm được số {ans} rồi! Hoan hô!'],
      'right.parity': ['Số {num} là số {parity}! Bé giỏi quá!', 'Đúng rồi! {num} là số {parity}!', 'Bé tìm được số {parity} rồi! Hoan hô!'],
      'right.any': ['Bé câu được rồi! Giỏi quá!', 'Hoan hô! Đúng con đó rồi!', 'Đúng rồi! Bé giỏi lắm!'],

      'wrong.color': ['Con này là con cá {got}. Mình tìm con cá {color} nhé!', 'Ồ, con cá {got}! Con cá {color} đâu rồi nhỉ?',
        'Con cá này {got}. Bé tìm con cá {color} nhé!'],
      'wrong.shape': ['Con cá này có {got}. Mình tìm con cá có {shape} nhé!', 'Ồ, {got}! Con cá có {shape} đâu rồi nhỉ?',
        'Con này có {got}. Bé tìm {shape} nhé!'],
      'wrong.size': ['Con này là con cá {got}. Mình tìm con cá {size} nhé!', 'Ồ, con cá {got}! Con cá {size} đâu rồi nhỉ?',
        'Con cá này {got} quá. Bé tìm con cá {size} nhé!'],
      'wrong.n': ['Con cá này có {gotNum} {gotSpots}. Mình tìm con cá có {num} {spots} nhé!',
        'Mình đếm nè, {gotNum} {gotSpots}! Con cá có {num} {spots} đâu rồi nhỉ?',
        'Con này có {gotNum} {gotSpots}. Bé tìm {num} {spots} nhé!'],
      'wrong.animal': ['Đây là {got}! Mình tìm {animal} nhé!', 'Chào {got}! {animal} đâu rồi nhỉ?', 'Bạn này là {got}. Bé tìm {animal} nhé!'],
      'wrong.home': ['Đây là {got}. {got} sống {gotHome}. Bạn nào sống {home} nhỉ?', '{got} sống {gotHome}! Bạn nào sống {home} nhỉ?',
        'Ồ, {got} sống {gotHome}. Mình tìm bạn sống {home} nhé!'],
      'wrong.letter': ['Đây là {got}. Mình tìm chữ {letter} nhé!', 'Ồ, {got}! Chữ {letter} đâu rồi nhỉ?',
        'Con cá này có {got}. Bé tìm chữ {letter} nhé!'],
      'wrong.lower': ['Đây là {got}. Mình tìm chữ {lower} thường, bạn của chữ {letter} hoa nhé!', 'Ồ, {got}! Chữ {lower} thường đâu rồi nhỉ?',
        'Con cá này có {got}. Bé tìm chữ {lower} thường nhé!'],
      'wrong.initial': ['Đây là {got}. {word} bắt đầu bằng chữ {first}. Bạn nào bắt đầu bằng chữ {letter} nhỉ?',
        'Bé nghe nè, {word} bắt đầu bằng chữ {first}! Bạn nào bắt đầu bằng chữ {letter} nhỉ?',
        '{got}! {word} bắt đầu bằng chữ {first}. Mình tìm bạn bắt đầu bằng chữ {letter} nhé!'],
      'wrong.sum': ['Con cá này có số {got}. Mình cộng lại {a} + {b} nhé!', 'Ồ, số {got}! {a} + {b} bằng mấy nhỉ? Mình đếm lại nhé!',
        'Con này là số {got}. Mình đếm {a} + {b} bằng ngón tay nhé!'],
      'wrong.diff': ['Con cá này có số {got}. Mình trừ lại {a} − {b} nhé!', 'Ồ, số {got}! {a} − {b} bằng mấy nhỉ? Mình đếm lại nhé!',
        'Con này là số {got}. Mình đếm {a} − {b} bằng ngón tay nhé!'],
      'wrong.number': ['Con cá này có số {got}. Mình tìm lại nhé!', 'Ồ, số {got}! Bé thử con cá khác nhé!', 'Con này là số {got}. Mình đếm lại nhé!'],
      'wrong.parity': ['Số {got} là số {gotParity}. Mình tìm số {parity} nhé!', 'Ồ, {got} là số {gotParity}! Số {parity} đâu rồi nhỉ?',
        'Con cá này có số {got}. Bé tìm số {parity} nhé!'],
      'wrong.hint': ['Đây là {thing}. Bé nhìn bạn đang sáng nhé!', 'Đây là {thing}. Bé xem bàn tay nhỏ chỉ nè!', 'Ồ, {thing}! Bé nhìn bạn lấp lánh kìa!'],
      'wrong.any': ['Mình tìm lại nhé!', 'Bé thử bạn khác nhé!', 'Cố lên, bé làm được mà!'],

      'count.run': '{list} — {num} {spots}!',
      'cast': ['Vút!', 'Vút! Quăng cần nào!', 'Câu nào!'],
      'bite': ['Dính rồi!', 'Cá cắn câu rồi! Kéo lên nào!', 'Rỉa rỉa… dính rồi!'],
      'release': ['Tạm biệt cá nhỏ!', 'Về nhà nhé! Tõm!', 'Bơi về nhà nhé, cá nhỏ!'],
      'releaseFriend': ['Tạm biệt bạn nhỏ!', 'Về nhà nhé, bạn nhỏ!', 'Bay về nhà nhé, bạn nhỏ!'],
      'lily': ['Một bông hoa súng!', 'Nhìn kìa, hoa súng nở rồi!', 'Bụp! Hoa súng xinh quá!'],
      'pond': ['Bốn bông hoa súng! Hồ đẹp quá!', 'Nhìn hoa súng nở khắp hồ kìa! Đẹp quá!', 'Hoan hô! Hồ đầy hoa rồi!'],
      'joy': ['Nhảy nhảy! Các bạn cá vui quá!', 'Tõm tõm! Các bạn cá nhảy mừng!', 'Oa! Cả nhà cùng nhảy nè!'],
      'surprise.ptero': ['Nhìn kìa! Bạn khủng long bay nhỏ đang bay qua!', 'Vù! Ai trên trời thế nhỉ?', 'Bạn khủng long bay nhỏ chào bé nè!'],
      'surprise.bronto': ['Nhìn kìa! Bạn khủng long cổ dài nhỏ!', 'Lội lội! Ai đang lội xuống hồ thế?', 'Bạn khủng long con xuống hồ chơi nè!'],
      'surprise.frog': ['Nhìn kìa! Bạn ếch ngồi trên lá súng!', 'Ộp ộp! Ai đó nhỉ?', 'Bạn ếch nhỏ đến chào bé nè!'],
      'surprise.fireflies': ['Nhìn kìa! Đom đóm!', 'Lấp lánh, lấp lánh! Các bạn đom đóm nhỏ!', 'Đom đóm nhảy múa trên mặt hồ kìa!'],
      'critter.ptero': ['Vỗ cánh, vỗ cánh! Oa!', 'Tạm biệt bạn khủng long bay!', 'Vút! Bay giỏi quá!'],
      'critter.bronto': ['Phụt! Vòi nước nè!', 'Tõm! Hi hi!', 'Xịt! Phun nước to quá!'],
      'critter.frog': ['Ộp ộp! Nhảy!', 'Tưng! Nhảy nhảy!', 'Ộp ộp, ộp ộp!'],
      'critter.fireflies': ['Lấp lánh!', 'Lung linh, lấp lánh!', 'Sáng lên nào, đom đóm nhỏ!'],
      'tibo.poke': ['Hi hi! Nhột quá!', 'Chào bé nè! Tibo vui quá!', 'Suỵt! Các bạn cá đang nghe đó!'],

      'praise': ['Đúng rồi!', 'Giỏi quá!', 'Tuyệt vời!', 'Hoan hô!', 'Bé giỏi lắm!', 'Chính xác!', 'Hay quá!', 'Câu giỏi quá!',
        'Đúng rồi, bé {child}!', 'Bé {child} giỏi quá!', 'Hoan hô bé {child}!'],
      'great': ['Bé {child} câu giỏi quá!', 'Hoan hô bé {child}!', 'Bé câu cá siêu quá!', 'Oa, bé {child} câu giỏi ghê!',
        'Hoan hô! Thêm một bông hoa súng!', 'Bé thông minh quá!', 'Tuyệt vời!'],
      'party': ['Nhìn hoa súng của mình nè!', 'Hoan hô! Hồ vui quá!', 'Cả nhà cùng nhảy nè!'],
      'hint': ['Nhìn nè! Bạn này đang sáng lên.', 'Bé xem bàn tay nhỏ chỉ nè!', 'Tibo giúp bé nhé! Chạm vào bạn này nè!',
        'Nhìn kìa, bạn này lấp lánh!', 'Bạn lấp lánh đó! Bé chạm vào nhé!'],
      'idle': ['Tibo đang chờ bé nè!', 'Mình câu cá nào!', 'Bé {child} ơi, mình chơi tiếp nhé!',
        'Các bạn cá đang bơi kìa! Mình chơi tiếp nhé!', 'Bé sẵn sàng câu cá chưa?'],

      'talk.intro': 'Mình cùng nói chuyện nhé!',
      'talk.colors': 'Con cá này màu gì nhỉ?',
      'talk.colorsAny': 'Con cá này màu gì nhỉ?',
      'talk.colorsWhich': 'Con cá nào {color} nhỉ?',
      'talk.shapes': 'Con cá nào có {shape} nhỉ?',
      'talk.shapesAny': 'Trên mình con cá này là hình gì nhỉ?',
      'talk.size': 'Con cá nào {size} nhỉ?',
      'talk.sizeAny': 'Con cá nào nhỏ nhỉ?',
      'talk.count': 'Có mấy chấm nào?',
      'talk.countAny': 'Có bao nhiêu cái nào?',
      'talk.animals': '{animal} sống ở đâu nhỉ?',
      'talk.home': '{animal} sống ở đâu nhỉ?',
      'talk.homeAny': 'Bạn này sống ở đâu nhỉ?',
      'talk.who': 'Đây là con gì nhỉ?',
      'talk.letters': 'Con cá nào có chữ {letter} nhỉ?',
      'talk.lettersAny': 'Đây là chữ gì nào?',
      'talk.lower': 'Con cá nào có chữ {lower} thường nhỉ? Bạn của chữ {letter} hoa đó!',
      'talk.lowerAny': 'Đây là chữ thường nào nhỉ?',
      'talk.initial': '{word} bắt đầu bằng chữ gì nhỉ?',
      'talk.initialAny': 'Bạn này bắt đầu bằng chữ gì nhỉ?',
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
      'talk.wrong.size': 'Là con cá {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.letter': 'Là chữ {letter} đó! Bé cố gắng lắm!',
      'talk.wrong.small': 'Là chữ {letter} thường đó! Bé cố gắng lắm!',
      'talk.wrong.number': 'Là số {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.spots': 'Có {num} {spots} đó! Bé cố gắng lắm!',
      'talk.wrong.home': '{thing} sống {home} đó! Bé cố gắng lắm!',
      'talk.wrong.place': 'Bạn ấy sống {home} đó! Bé cố gắng lắm!',
      'talk.wrong.any': 'Bé cố gắng lắm! Mình chơi tiếp nhé!',

      'session.done': ['Đi câu vui quá! {stars} ngôi sao!', 'Bé {child} giỏi quá! {stars} ngôi sao!',
        'Hồ đầy hoa súng rồi! {stars} ngôi sao!']
    }
  };
  // count.0 … count.20: "One!" / "Một!"
  LANGS.forEach(function (l) {
    for (var i = 0; i <= MAX_COUNT; i++) {
      var w = NUM[l][i];
      STR[l]['count.' + i] = w.charAt(0).toUpperCase() + w.slice(1) + '!';
    }
  });

  // required (DERIVED) params → fallback key when one is missing
  var NEEDS = {
    'p.number': ['num'], 'p.color': ['color'], 'p.shape': ['shape'], 'p.size': ['size'], 'p.count': ['num', 'spots'],
    'p.animal': ['animal'], 'p.home': ['home'], 'p.letter': ['letter'], 'p.lower': ['letter', 'lower'], 'p.initial': ['letter'],
    'p.add': ['a', 'b'], 'p.sub': ['a', 'b'], 'p.oddeven': ['parity'],
    'right.color': ['color'], 'right.shape': ['shape'], 'right.size': ['size'], 'right.animal': ['animal', 'word'],
    'right.home': ['animal', 'home'], 'right.letter': ['letter'], 'right.lower': ['letter', 'lower'],
    'right.initial': ['animal', 'word', 'letter'], 'right.sum': ['a', 'b', 'ans'], 'right.diff': ['a', 'b', 'ans'],
    'right.number': ['ans'], 'right.parity': ['num', 'parity'],
    'wrong.color': ['got', 'color'], 'wrong.shape': ['got', 'shape'], 'wrong.size': ['got', 'size'],
    'wrong.n': ['gotNum', 'gotSpots', 'num', 'spots'], 'wrong.animal': ['got', 'animal'], 'wrong.home': ['got', 'gotHome', 'home'],
    'wrong.letter': ['got', 'letter'], 'wrong.lower': ['got', 'letter', 'lower'], 'wrong.initial': ['got', 'word', 'first', 'letter'],
    'wrong.sum': ['got', 'a', 'b'], 'wrong.diff': ['got', 'a', 'b'], 'wrong.number': ['got'],
    'wrong.parity': ['got', 'gotParity', 'parity'], 'wrong.hint': ['thing'],
    'count.run': ['list', 'num', 'spots'],
    'talk.colorsWhich': ['color'], 'talk.shapes': ['shape'], 'talk.size': ['size'], 'talk.animals': ['animal'], 'talk.home': ['animal'],
    'talk.letters': ['letter'], 'talk.lower': ['letter', 'lower'], 'talk.initial': ['word'], 'talk.add': ['a', 'b'],
    'talk.sub': ['a', 'b'], 'talk.oddeven': ['parity'],
    'talk.wrong': ['answer'], 'talk.wrong.a': ['answer'], 'talk.wrong.animal': ['answer'], 'talk.wrong.size': ['answer'],
    'talk.wrong.letter': ['letter'], 'talk.wrong.small': ['letter'], 'talk.wrong.number': ['answer'],
    'talk.wrong.spots': ['num', 'spots'], 'talk.wrong.home': ['thing', 'home'], 'talk.wrong.place': ['home']
  };
  Object.keys(PROMPTS).forEach(function (k) { NEEDS[k + '.first'] = NEEDS[k]; });
  var FALLBACK = { 'p.add': 'p.number', 'p.sub': 'p.number', 'right.sum': 'right.number', 'right.diff': 'right.number',
    'wrong.sum': 'wrong.number', 'wrong.diff': 'wrong.number', 'wrong.parity': 'wrong.number',
    'talk.colorsWhich': 'talk.colorsAny', 'talk.shapes': 'talk.shapesAny', 'talk.size': 'talk.sizeAny', 'talk.animals': 'talk.homeAny',
    'talk.home': 'talk.homeAny', 'talk.letters': 'talk.lettersAny', 'talk.lower': 'talk.lowerAny', 'talk.initial': 'talk.initialAny',
    'talk.add': 'talk.calc', 'talk.sub': 'talk.calc', 'talk.oddeven': 'talk.oddevenAny',
    'talk.wrong.home': 'talk.wrong.place', 'wrong.hint': 'hint', 'count.run': 'praise' };
  Object.keys(NEEDS).forEach(function (k) {
    if (FALLBACK[k]) return;
    if (/^p\./.test(k)) FALLBACK[k] = 'p.any';
    else if (/^right\./.test(k)) FALLBACK[k] = 'right.any';
    else if (/^talk\.wrong/.test(k)) FALLBACK[k] = 'talk.wrong.any';
    else if (/^wrong\./.test(k)) FALLBACK[k] = 'wrong.any';
  });

  var CHILD_FALLBACK = { en: 'friend', vi: 'bé' };
  // with a name set: the share of lines that use it (else a uniform pick among the variants with and without {child})
  var CHILD_SHARE = { 'ui.welcome': 1, 'session.done': 1, 'praise': 1 / 3, 'great': 1 / 3 };

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
  function obj(o) { return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}; }
  function rawVal(v) {
    if (v && typeof v === 'object') { if ('value' in v) return v.value; if ('nameValue' in v) return v.nameValue; }
    return v;
  }
  function present(v) {
    if (v == null || v === '') return false;
    if (typeof v === 'object') { var r = rawVal(v); return r != null && r !== '' && r !== v; }
    return true;
  }
  function low(v) { var r = rawVal(v); return String(r == null ? '' : r).toLowerCase().trim(); }
  function num(v) {
    v = rawVal(v);
    if (typeof v === 'number') return isFinite(v) ? Math.round(v) : null;
    if (typeof v !== 'string' || !/^\s*-?\d+\s*$/.test(v)) return null;
    return parseInt(v, 10);
  }
  function numberName(lang, n) {
    var v = parseInt(n, 10);
    if (isNaN(v)) return String(n);
    if (v >= 0 && v <= MAX_COUNT) return NUM[L(lang)][v];
    return String(v);
  }
  function spots(lang, n) { return SPOT[L(lang)][n === 1 ? 0 : 1]; }
  function splitOp(value) { // '2+3' / '2 + 3' → ['2','+','3'];  '7−2' / '7-2' → ['7','−','2']
    var m = String(value == null ? '' : value).replace(/\s+/g, '').match(/^(\d+)([+−\-–])(\d+)(=.*)?$/);
    return m ? [m[1], m[2] === '+' ? '+' : '−', m[3]] : null;
  }
  function exprText(value) { var p = splitOp(value); return p ? p[0] + ' ' + p[1] + ' ' + p[2] : String(value); }
  function exprValue(value) {
    var p = splitOp(value);
    if (!p) return num(value);
    return p[1] === '+' ? (+p[0]) + (+p[2]) : (+p[0]) - (+p[2]);
  }
  function exprWords(lang, value) {
    var p = splitOp(value);
    if (!p) return num(value) != null ? numberName(lang, num(value)) : String(value);
    var op = p[1] === '+' ? (lang === 'vi' ? 'cộng' : 'plus') : (lang === 'vi' ? 'trừ' : 'minus');
    return numberName(lang, p[0]) + ' ' + op + ' ' + numberName(lang, p[2]);
  }
  function isLetter(s) { return typeof s === 'string' && /^\p{L}$/u.test(s); }
  function inTable(tbl, v) { var s = low(v); return tbl[s] != null ? s : null; }
  function colorOf(v) { return inTable(NAMES.en.color, v); }
  function shapeOf(v) { var s = low(v); if (s === 'rectangle') s = 'rect'; return NAMES.en.shape[s] != null ? s : null; }
  function homeOf(v) { var s = low(v); if (s === 'woods') s = 'forest'; if (s === 'ocean') s = 'sea'; return NAMES.en.home[s] != null ? s : null; }
  function animalOf(v) {
    if (v && typeof v === 'object') v = v.animal != null ? v.animal : rawVal(v);
    var s = low(v).replace(/\.svg$/, '').replace(/^(guests|animals?)\//, '').replace(/_(hop|step)$/, '');
    if (s === 'fishbowl' || s === 'gold fish') s = 'goldfish';
    if (s === 'rabbit') s = 'bunny';
    return ANIMALS.indexOf(s) >= 0 ? s : null;
  }
  function sizeOf(v) {
    if (v === true) return 'big';
    if (v === false) return 'small';
    var s = low(v);
    if (s === 'big' || s === 'large' || s === 'true') return 'big';
    if (s === 'small' || s === 'little' || s === 'false') return 'small';
    return null;
  }
  function parityOf(v) {
    if (num(v) != null) return Math.abs(num(v)) % 2 ? 'odd' : 'even';
    var s = low(v);
    return (s === 'odd' || s === 'even') ? s : null;
  }
  function thingSize(t) {
    t = obj(t);
    if (t.big === true || t.big === false) return t.big ? 'big' : 'small';
    return sizeOf(t.size);
  }
  function anFix(s) {   // English "a orange fish" → "an orange fish", never the LETTER A. No regex look-behind (iOS < 16.4).
    // a capital "A" is only an article at a sentence start; a small "a" is a letter after letter / big / small
    return String(s).replace(/(^|[\s"“(])([Aa]) (?=[aeiou]|8\b|11\b|18\b)/g, function (m, pre, a, off, str) {
      var before = str.slice(0, off + pre.length);
      if (a === 'A' && !/(^|[.!?]\s*|["“(])$/.test(before)) return m;
      if (a === 'a' && /(letter|big|small)\s*$/i.test(before)) return m;
      return pre + a + 'n ';
    });
  }

  // ---------------------------------------------------------------- things (fish / bubble)
  // the mark on a neutral fish: {shape, color} | {n} | {text}; older flat fields (shape / n / text) are accepted
  function markOf(t) {
    t = obj(t);
    var m = obj(t.mark);
    if (m.shape != null || m.n != null || m.text != null) return m;
    if (t.shape != null) return { shape: t.shape, color: t.markColor };
    if (t.n != null) return { n: t.n };
    if (t.text != null) return { text: t.text };
    return null;
  }
  function memberKind(t) {
    var k = low(t.kind);
    if (KIND_OF[k]) return KIND_OF[k];
    if (['color', 'number', 'home', 'size', 'letter', 'parity'].indexOf(k) >= 0) return k;
    if (t.animal != null) return 'bubble';
    if (t.color != null || markOf(t) || t.big != null) return 'fish';
    return null;
  }
  // a member thing rebuilt from {nameKind, nameValue} (when main did not pass e.thing)
  function thingFromName(nk, nv) {
    nk = String(nk == null ? '' : nk);
    nv = rawVal(nv);
    switch (nk) {
      case 'color': case 'colour': case 'hue': return colorOf(nv) ? { kind: 'fish', color: colorOf(nv) } : null;
      case 'shape': case 'shapeH': return shapeOf(nv) ? { kind: 'fish', mark: { shape: shapeOf(nv) } } : null;
      case 'size': return sizeOf(nv) ? { kind: 'fish', big: sizeOf(nv) === 'big' } : null;
      case 'n': case 'number': case 'count': case 'spots': return num(nv) != null ? { kind: 'fish', mark: { n: num(nv) } } : null;
      case 'animal': case 'guest': case 'home': case 'word': case 'who': case 'initial':
        if (animalOf(nv)) return { kind: 'bubble', animal: animalOf(nv), home: ANIMAL_HOME[animalOf(nv)] };
        return isLetter(String(nv)) ? { kind: 'fish', mark: { text: String(nv) } } : null;
      case 'letter': case 'lower': case 'text': case 'sum': case 'diff': return { kind: 'fish', mark: { text: String(nv) } };
      case 'parity': return num(nv) != null ? { kind: 'fish', mark: { text: String(num(nv)) } } : null;
    }
    return null;
  }
  function markText(t) { var m = markOf(t); return m && m.text != null ? String(m.text) : ''; }
  function markNumber(t) {           // the number a fish shows (a text mark "7", or "3+2" → 5)
    var tx = markText(t);
    if (tx) return splitOp(tx) ? exprValue(tx) : num(tx);
    var m = markOf(t);
    return m && m.n != null ? num(m.n) : null;
  }

  // ---------------------------------------------------------------- names
  function name(lang, kind, value) {
    lang = L(lang);
    if (kind === 'fish' || kind === 'thing' || kind === 'bubble' || (kind && typeof kind === 'object')) {
      return phrase(lang, typeof kind === 'object' ? kind : value, { art: null });
    }
    value = rawVal(value);
    var T = NAMES[lang], k;
    switch (kind) {
      case 'number': case 'n': case 'count': return num(value) != null ? numberName(lang, num(value)) : String(value == null ? '' : value);
      case 'spots': { var ns = num(value); return ns == null ? SPOT[lang][1] : numberName(lang, ns) + ' ' + spots(lang, ns); }
      case 'color': case 'colour': case 'hue': k = colorOf(value); return k ? T[kind === 'hue' ? 'hue' : 'color'][k] : String(value == null ? '' : value);
      case 'shape': case 'shapeH': k = shapeOf(value); return k ? T[kind][k] : String(value == null ? '' : value);
      case 'animal': case 'guest': case 'word': case 'who': k = animalOf(value); return k ? T[kind === 'guest' ? 'animal' : kind][k] : String(value == null ? '' : value);
      case 'home': case 'homeAt': k = homeOf(value); return k ? T[kind][k] : String(value == null ? '' : value);
      case 'size': k = sizeOf(value); return k ? T.size[k] : String(value == null ? '' : value);
      case 'parity': k = parityOf(value); return num(value) != null ? numberName(lang, num(value)) : (k ? T.parity[k] : String(value == null ? '' : value));
      case 'letter': case 'lower': case 'initial': return String(value == null ? '' : value);
      case 'sum': case 'diff': return exprWords(lang, value);
      case 'text': case 'card': case 'tile': {
        var tx = String(value == null ? '' : value);
        if (splitOp(tx)) return exprWords(lang, tx);
        if (num(tx) != null) return numberName(lang, num(tx));
        return tx;
      }
    }
    if (T[kind] && value != null && T[kind][value] != null) return T[kind][value];
    return String(value == null ? '' : value).replace(/_/g, ' ');
  }

  // the bare noun for the initial-letter topic: no classifier ("con cáo" → "cáo"); things or (kind, value)
  function bareWord(lang, kind, value) {
    lang = L(lang);
    var t = (kind && typeof kind === 'object') ? kind : null;
    if (t && t.thing && typeof t.thing === 'object') t = t.thing;
    if (t) {
      if (animalOf(t.animal)) return NAMES[lang].word[animalOf(t.animal)];
      if (t.nameKind != null && t.nameKind !== 'initial' && t.nameKind !== 'letter') return bareWord(lang, t.nameKind, t.nameValue);
      if (t.nameKind === 'initial' && animalOf(t.nameValue)) return NAMES[lang].word[animalOf(t.nameValue)];
      return t.word != null ? String(t.word) : '';
    }
    value = rawVal(value);
    if ((kind === 'shape' || kind === 'shapeH') && shapeOf(value)) return NAMES[lang].shape[shapeOf(value)].replace(/^hình /, '');
    if ((kind === 'color' || kind === 'hue') && colorOf(value)) return NAMES[lang].hue[colorOf(value)];
    if (animalOf(value)) return NAMES[lang].word[animalOf(value)];
    return String(value == null ? '' : value);
  }
  // first letter of the bare noun, diacritics stripped to the base letter (đ → D)
  function initial(lang, kind, value) {
    var w = bareWord(lang, kind, value);
    var s = stripMarks(String(w).trim());
    var m = /\p{L}/u.exec(s);
    return m ? m[0].toUpperCase() : '';
  }

  // ---------------------------------------------------------------- spoken forms
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
    var v = parseInt(rawVal(n), 10), out = [];
    if (isNaN(v)) return addForms(out, [String(rawVal(n))]);
    out.push(String(v));
    if (v >= 0 && v <= MAX_COUNT && !(lang === 'vi' && v === 0)) addForms(out, [NUM[lang][v]]);
    if (lang === 'vi' && v >= 0 && v <= MAX_COUNT) addForms(out, ['số ' + NUM.vi[v]]);
    if (v >= 0 && v <= MAX_COUNT && v !== 0) addForms(out, [name(lang, 'spots', v), v + ' ' + spots(lang, v)]);
    if (lang === 'en' && v >= 0 && v <= MAX_COUNT) addForms(out, ['number ' + NUM.en[v]]);
    var alt = NUM_ALT[lang][v];
    if (alt) addForms(out, alt);
    return out;
  }
  function wordKind(k) {
    k = String(k == null ? '' : k);
    var A = { n: 'number', count: 'number', spots: 'number', forest: 'home', shapeH: 'shape', hue: 'color', colour: 'color',
      lower: 'letter', initial: 'letter', word: 'animal', guest: 'animal', who: 'animal', bubble: 'animal', tile: 'text', card: 'text',
      blob: 'color', paint: 'color', add: 'sum', sub: 'diff', homeAt: 'home', oddeven: 'parity' };
    return A[k] || k;
  }
  // a Talk-time choice / picture thing → [kind, value]
  function kvOf(c) {
    var t = obj(c);
    if (t.thing && typeof t.thing === 'object') t = t.thing;
    // a parity choice that shows a number is answered by its number ("sixteen"), not by "even"
    if (t.nameKind === 'parity' && num(markText(t)) != null) return ['number', num(markText(t))];
    if (t.nameKind != null) return [wordKind(t.nameKind), rawVal(t.nameValue)];
    var tk = low(t.kind);
    if (tk === 'color' || tk === 'blob' || tk === 'paint') return ['color', t.color != null ? t.color : t.value];
    switch (KIND_OF[tk] || tk) {
      case 'number': return ['number', t.n != null ? t.n : t.value];
      case 'home': return ['home', t.home != null ? t.home : t.value];
      case 'size': return ['size', thingSize(t) || t.value];
      case 'letter': return ['letter', t.text != null ? t.text : t.value];
      case 'parity': return ['parity', t.value];
      case 'bubble': return ['animal', t.animal != null ? t.animal : t.value];
      case 'fish': {
        var m = markOf(t);
        if (m && m.shape != null) return ['shape', m.shape];
        if (m && m.n != null) return ['number', m.n];
        if (m && m.text != null) return ['text', m.text];
        if (t.big === false) return ['size', 'small'];
        if (t.color != null) return ['color', t.color];
        if (t.big === true) return ['size', 'big'];
        return ['fish', null];
      }
    }
    if (t.animal != null) return ['animal', t.animal];
    return [t.kind, t.value];
  }
  function words(lang, kind, value) {
    lang = L(lang);
    if (kind && typeof kind === 'object') { var kv = kvOf(kind); kind = kv[0]; value = kv[1]; }
    kind = wordKind(kind);
    value = rawVal(value);
    var out = [], W = WORDS[lang], T = NAMES[lang], k;
    switch (kind) {
      case 'number': return numberWords(lang, value);
      case 'color': k = colorOf(value); return k ? addForms(out, [T.color[k], T.hue[k], lang === 'vi' ? FISH.vi + ' ' + T.color[k] : T.color[k] + ' fish'].concat(W.color[k])) : addForms(out, [String(value)]);
      case 'shape': k = shapeOf(value); return k ? addForms(out, [T.shape[k], T.shapeH[k]].concat(W.shape[k])) : addForms(out, [String(value)]);
      case 'size': k = sizeOf(value); return k ? addForms(out, [T.size[k]].concat(W.size[k])) : addForms(out, [String(value)]);
      case 'animal': k = animalOf(value); return k ? addForms(out, [T.animal[k], T.word[k]].concat(W.animal[k])) : addForms(out, [String(value)]);
      case 'home': k = homeOf(value); return k ? addForms(out, [T.home[k], T.homeAt[k]].concat(W.home[k])) : addForms(out, [String(value)]);
      case 'parity': if (num(value) != null) return numberWords(lang, num(value));
        k = parityOf(value); return k ? addForms(out, [T.parity[k]].concat(W.parity[k])) : addForms(out, [String(value)]);
      case 'text': {
        var tx = String(value);
        if (splitOp(tx)) return words(lang, 'sum', tx);
        if (num(tx) != null) return numberWords(lang, num(tx));
        if (isLetter(tx)) return words(lang, 'letter', tx);
        return addForms(out, [tx]);
      }
      case 'letter': {
        var U = String(value).toUpperCase(), lw = U.toLowerCase();
        var base = [lw, 'letter ' + lw, 'chữ ' + lw];
        if (lang === 'vi') {
          if (LETTER_VI[U]) base.push(LETTER_VI[U], 'chữ ' + LETTER_VI[U]);
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
        if (!p) return num(value) != null ? numberWords(lang, num(value)) : addForms(out, [String(value)]);
        var op = p[1] === '+' ? (lang === 'vi' ? 'cộng' : 'plus') : (lang === 'vi' ? 'trừ' : 'minus');
        return addForms(out, [exprWords(lang, value), p[0] + ' ' + op + ' ' + p[2], p[0] + p[1] + p[2]]);
      }
    }
    var nm = T[kind] && T[kind][value];
    return addForms(out, [nm || String(value == null ? '' : value)]);
  }

  // ---------------------------------------------------------------- phrases: a member named for a sentence
  // opts = { art: 'the' (default) | 'a' | null, color: bool (default true for a colour fish), size: bool (default: only when
  //          little), markColor: bool (default false: "the fish with the star", true: "the fish with the red star") }
  function phrase(lang, t, opts) {
    lang = L(lang);
    t = obj(t);
    if (t.thing && typeof t.thing === 'object') t = t.thing;
    opts = opts || {};
    var vi = lang === 'vi', T = NAMES[lang];
    var art = opts.art === undefined ? 'the' : opts.art;
    var k = memberKind(t);
    if ((!k || k === 'fish' && !t.color && !markOf(t) && t.big == null) && t.nameKind != null) {
      var rb = thingFromName(t.nameKind, t.nameValue);
      if (rb) { t = rb; k = memberKind(t); }
    }
    if (!k) return '';
    var col = colorOf(t.color), sz = thingSize(t);
    var showSize = sz && (opts.size === true || (opts.size !== false && sz === 'small'));
    function en(s) { return anFix((art ? art + ' ' : '') + s); }
    switch (k) {
      case 'fish': {
        var m = markOf(t), useCol = col && opts.color !== false;
        var suffix = '';
        if (m && m.shape != null && shapeOf(m.shape)) {
          var mc = opts.markColor && colorOf(m.color) ? colorOf(m.color) : null;
          suffix = vi ? ' có ' + T.shapeH[shapeOf(m.shape)] + (mc ? ' ' + T.color[mc] : '')
            : ' with the ' + (mc ? T.color[mc] + ' ' : '') + T.shape[shapeOf(m.shape)];
        } else if (m && m.n != null && num(m.n) != null) {
          suffix = (vi ? ' có ' : ' with ') + name(lang, 'spots', num(m.n));
        } else if (m && m.text != null && String(m.text) !== '') {
          var tx = String(m.text);
          if (isLetter(tx)) {
            var small = tx !== tx.toUpperCase();
            suffix = vi ? ' có chữ ' + tx + (small ? ' thường' : '') : ' with ' + (small ? 'small ' : 'letter ') + tx;
          } else if (splitOp(tx)) suffix = (vi ? ' có ' : ' with ') + exprText(tx);
          else if (num(tx) != null) suffix = vi ? ' có số ' + numberName(lang, num(tx)) : ' with number ' + numberName(lang, num(tx));
          else suffix = (vi ? ' có ' : ' with ') + tx;
        }
        if (vi) return FISH.vi + (showSize ? ' ' + T.size[sz] : '') + (useCol ? ' ' + T.color[col] : '') + suffix;
        return en((showSize ? T.size[sz] + ' ' : '') + (useCol ? T.color[col] + ' ' : '') + FISH.en + suffix);
      }
      case 'bubble': {
        var a = animalOf(t.animal);
        var noun = a ? T.animal[a] : (vi ? 'bạn nhỏ' : 'friend');
        if (vi) return noun + (showSize ? ' ' + T.size[sz] : '');
        return en((showSize ? T.size[sz] + ' ' : '') + noun);
      }
      case 'letter': {
        var lt = t.text != null ? String(t.text) : String(t.value == null ? '' : t.value);
        if (!lt) return '';
        var sm = lt !== lt.toUpperCase();
        return vi ? 'chữ ' + lt + (sm ? ' thường' : '') : (sm ? 'small ' : 'letter ') + lt;
      }
      case 'color': return col ? T.color[col] : '';
      case 'number': { var nn = num(t.n != null ? t.n : t.value); return nn == null ? '' : numberName(lang, nn); }
      case 'parity': { var pv = parityOf(t.value); return pv ? T.parity[pv] : ''; }
      case 'home': { var h = homeOf(t.home != null ? t.home : t.value); return h ? (vi ? T.home[h] : en(T.home[h])) : ''; }
      case 'size': { var zz = sz || sizeOf(t.value); return zz ? (vi ? FISH.vi + ' ' + T.size[zz] : en(T.size[zz] + ' ' + FISH.en)) : ''; }
    }
    return '';
  }

  // ---------------------------------------------------------------- t()
  var I18N = { langs: LANGS.slice(), child: '' };

  // raw params → named strings (pre-named strings pass through untouched)
  function derive(lang, params, key) {
    var p = {}, k;
    if (params && typeof params === 'object') for (k in params) if (Object.prototype.hasOwnProperty.call(params, k)) p[k] = params[k];
    key = key || '';
    if (present(p.color)) p.color = name(lang, 'color', p.color);
    if (present(p.shape)) p.shape = name(lang, lang === 'vi' ? 'shapeH' : 'shape', p.shape);
    if (present(p.size) || p.big === true || p.big === false) p.size = name(lang, 'size', present(p.size) ? p.size : p.big);
    if (present(p.parity)) p.parity = name(lang, 'parity', parityOf(rawVal(p.parity)) || p.parity);
    if (present(p.home)) p.home = name(lang, 'homeAt', p.home);
    if (present(p.animal)) {
      var an = animalOf(p.animal);
      if (an && !present(p.word)) p.word = NAMES[lang].word[an];
      p.animal = an ? NAMES[lang].animal[an] : String(rawVal(p.animal));
    }
    // talk.initial {letter, nameKind, nameValue}: the word comes from the shown thing (never say the letter = the answer)
    if (!present(p.word) && p.nameValue != null && animalOf(p.nameValue)) p.word = NAMES[lang].word[animalOf(p.nameValue)];
    if (present(p.word) && animalOf(p.word)) p.word = NAMES[lang].word[animalOf(p.word)];
    if (present(p.letter)) {
      p.letter = String(rawVal(p.letter));
      if (/^(p|talk)\.lower/.test(key)) { if (!present(p.lower)) p.lower = p.letter.toLowerCase(); p.letter = p.letter.toUpperCase(); }
      else if (!present(p.lower)) p.lower = p.letter.toLowerCase();
    }
    if (present(p.lower)) p.lower = String(rawVal(p.lower));
    var c = present(p.n) ? num(p.n) : null;
    if (!present(p.num) && c != null) p.num = numberName(lang, c);
    if (!present(p.spots)) p.spots = spots(lang, c == null ? 2 : c);
    // {a, b} or an expression {expr: '3+2'}
    if ((!present(p.a) || !present(p.b)) && present(p.expr) && splitOp(rawVal(p.expr))) {
      var sp = splitOp(rawVal(p.expr)); p.a = sp[0]; p.b = sp[2];
    }
    if (present(p.a)) p.a = String(rawVal(p.a));
    if (present(p.b)) p.b = String(rawVal(p.b));
    if (p.thing && typeof p.thing === 'object') p.thing = phrase(lang, p.thing);
    if (p.answer && typeof p.answer === 'object') p.answer = present(p.answer) ? name(lang, p.answer.kind || p.answer.nameKind, rawVal(p.answer)) : '';
    if (present(p.n) && typeof p.n === 'object') p.n = c != null ? c : '';
    return p;
  }

  function fill(lang, str, params, child) {
    if (!child) str = str.replace(/(bé|Bé) \{child\}/g, '$1').replace(/, \{child\}([!?.])/g, '$1');
    var out = str.replace(/\{(\w+)\}/g, function (m, k) {
      if (k === 'child') return child || CHILD_FALLBACK[lang];
      var v = params ? params[k] : null;
      return present(v) ? String(typeof v === 'object' ? rawVal(v) : v) : '';
    });
    out = out.replace(/\s+([,.!?…])/g, '$1').replace(/\s{2,}/g, ' ').replace(/,\s*([!?.])/g, '$1').trim();
    if (lang === 'en') out = anFix(out);
    out = out.replace(/([.!?]\s+)(\p{Ll})/gu, function (m, pre, ch) { return pre + ch.toUpperCase(); });
    return capFirst(out);
  }

  function needsMet(key, params) {
    var need = NEEDS[key];
    if (!need) return true;
    for (var i = 0; i < need.length; i++) if (!present(params ? params[need[i]] : null)) return false;
    return true;
  }
  function resolveKey(lang, key, params) {
    if (STR[lang][key] == null && STR.en[key] == null) {
      var base = key.replace(/\.first$/, ''), first = base !== key;
      if (PROMPT_ALIAS[base]) {
        if (base === 'p.sizeBig' && params && params.big == null && params.size == null) params.big = true;
        key = PROMPT_ALIAS[base] + (first ? '.first' : '');
      } else if (/^p\./.test(key)) key = 'p.any';
    }
    return key;
  }

  I18N.t = function (lang, key, params, rng) {
    lang = L(lang);
    key = String(key == null ? '' : key);
    if (params && typeof params === 'object') params = Object.assign({}, params);
    key = resolveKey(lang, key, params);
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
      else if (CHILD_SHARE[key] != null && withChild.length) pool = !noChild.length || rnd(rng) < CHILD_SHARE[key] ? withChild : noChild;
      v = pool[Math.min(pool.length - 1, Math.floor(rnd(rng) * pool.length))];
    }
    return fill(lang, v, p, child);
  };

  // the "catch the X" question; opts.first → the long first-time form (a chapter's round 0)
  I18N.ask = function (lang, key, params, opts) {
    opts = opts || {};
    lang = L(lang);
    key = String(key == null ? '' : key);
    var pp = params && typeof params === 'object' ? Object.assign({}, params) : {};
    key = resolveKey(lang, key, pp);
    if (opts.first && STR[lang][key + '.first'] != null) {
      var p = derive(lang, pp, key);
      if (needsMet(key + '.first', p)) return I18N.t(lang, key + '.first', pp, opts.rng);
    }
    return I18N.t(lang, key, pp, opts.rng);
  };

  // ---------------------------------------------------------------- game lines
  var KIND_ALIAS = { colour: 'color', colors: 'color', hue: 'color', count: 'n', number: 'n', spots: 'n', shapes: 'shape',
    shapeH: 'shape', big: 'size', animals: 'animal', guest: 'animal', homes: 'home', forest: 'home', letters: 'letter',
    add: 'sum', sub: 'diff', oddeven: 'parity' };
  function ruleKind(k) { k = String(k == null ? '' : k).trim(); k = KIND_ALIAS[k] || KIND_ALIAS[k.toLowerCase()] || k.toLowerCase(); return RULE_KINDS.indexOf(k) >= 0 ? k : null; }
  var PROMPT_KIND = { 'p.color': 'color', 'p.shape': 'shape', 'p.size': 'size', 'p.count': 'n', 'p.animal': 'animal',
    'p.home': 'home', 'p.letter': 'letter', 'p.lower': 'lower', 'p.initial': 'initial', 'p.add': 'sum', 'p.sub': 'diff',
    'p.oddeven': 'parity' };
  var TOPIC_KIND = { colors: 'color', shapes: 'shape', size: 'size', count: 'n', animals: 'animal', letters: 'letter',
    lower: 'lower', initial: 'initial', add: 'sum', sub: 'diff', oddeven: 'parity' };
  function kindFromPrompt(topic, pk, params) {
    pk = String(pk || '').replace(/\.first$/, '');
    if (PROMPT_ALIAS[pk]) pk = PROMPT_ALIAS[pk];
    if (PROMPT_KIND[pk]) return PROMPT_KIND[pk];
    if (topic === 'animals' && obj(params).home != null) return 'home';
    return TOPIC_KIND[topic] || null;
  }
  // what the TARGET is: e.rule | e.want ({kind, value} or {nameKind, nameValue}) | topic + promptKey + params
  function ruleOf(ev) {
    var r = obj(ev.rule);
    if (r.kind == null && r.nameKind == null) r = obj(ev.want);
    if (r.kind == null && r.nameKind == null && obj(ev.want).rule) r = obj(ev.want.rule);
    var kind = ruleKind(r.kind != null ? r.kind : r.nameKind) || kindFromPrompt(ev.topic, ev.promptKey, ev.params);
    if (kind === 'letter' && (ev.topic === 'lower' || /^p\.lower/.test(String(ev.promptKey || '')))) kind = 'lower';
    if (kind === 'animal' && /^p\.home/.test(String(ev.promptKey || ''))) kind = 'home';
    var value = r.value != null ? r.value : r.nameValue;
    var p = obj(ev.params);
    if (value == null) {
      switch (kind) {
        case 'color': value = p.color; break;
        case 'shape': value = p.shape; break;
        case 'size': value = p.big != null ? p.big : p.size; break;
        case 'animal': value = p.animal; break;
        case 'home': value = p.home; break;
        case 'n': value = p.n; break;
        case 'sum': case 'diff': value = p.n != null ? p.n : p.ans; break;
        case 'letter': case 'lower': case 'initial': value = p.letter; break;
        case 'parity': value = p.parity; break;
      }
    }
    return { kind: kind, value: rawVal(value), params: p };
  }
  function evThing(ev) {
    if (ev.thing && typeof ev.thing === 'object') return ev.thing;
    if (KIND_OF[low(ev.kind)]) return ev;
    var g = obj(ev.got);
    if (g.kind != null && KIND_OF[low(g.kind)]) return g;
    if (g.nameKind != null) return thingFromName(g.nameKind, g.nameValue) || {};
    if (ev.nameKind != null) return thingFromName(ev.nameKind, ev.nameValue) || {};
    return {};
  }
  function gotValue(ev, t, kind) {   // the tapped member's value for this rule kind (thing first, then e.got)
    var g = obj(ev.got), gv = g.nameKind != null && ruleKind(g.nameKind) === kind ? rawVal(g.nameValue) : null;
    var m = markOf(t);
    switch (kind) {
      case 'color': return colorOf(t.color) || colorOf(gv);
      case 'shape': return (m && shapeOf(m.shape)) || shapeOf(gv);
      case 'size': return thingSize(t) || sizeOf(gv);
      case 'n': return m && num(m.n) != null ? num(m.n) : num(gv);
      case 'animal': case 'initial': return animalOf(t.animal) || animalOf(gv) || animalOf(g.nameValue);
      case 'home': return animalOf(t.animal) || animalOf(g.nameValue);
      case 'letter': case 'lower': { var tx = markText(t) || (gv != null ? String(gv) : ''); return isLetter(tx) ? tx : null; }
      case 'sum': case 'diff': case 'parity': { var v = markNumber(t); return v != null ? v : (num(gv) != null ? num(gv) : exprValue(gv)); }
    }
    return null;
  }
  function homeOfThing(t, a) { return homeOf(t.home) || (a ? ANIMAL_HOME[a] : null); }
  function letterName(lang, tx) {     // "letter B" / "small b" · "chữ B" / "chữ b thường"
    var small = tx !== tx.toUpperCase();
    return lang === 'vi' ? 'chữ ' + tx + (small ? ' thường' : '') : (small ? 'small ' : 'letter ') + tx;
  }
  function opParams(lang, r, t) {     // {a, b, ans} for sum / diff
    var p = r.params, a = num(p.a), b = num(p.b), sp = null;
    if ((a == null || b == null) && splitOp(r.value)) { sp = splitOp(r.value); a = +sp[0]; b = +sp[2]; }
    if ((a == null || b == null) && splitOp(p.expr)) { sp = splitOp(p.expr); a = +sp[0]; b = +sp[2]; }
    var ans = num(r.value);
    if (ans == null && a != null && b != null) ans = r.kind === 'diff' ? a - b : a + b;
    if (ans == null && t) ans = markNumber(t);
    return { a: a != null ? String(a) : '', b: b != null ? String(b) : '', ans: ans };
  }

  // `right {id, thing, x, y}` (+ topic, promptKey, params, rule) → names the caught member + why it is the one.
  I18N.sayRight = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var t = obj(evThing(ev)), r = ruleOf(ev), p = null, key = 'right.' + r.kind, T = NAMES[lang];
    switch (r.kind) {
      case 'n': return I18N.t(lang, 'right.n', null, rng);
      case 'color': { var c = colorOf(t.color) || colorOf(r.value); p = { color: c ? T.color[c] : '' }; break; }
      case 'shape': { var m = markOf(t), s = (m && shapeOf(m.shape)) || shapeOf(r.value); p = { shape: s ? T.shapeH[s] : '' }; break; }
      case 'size': { var z = thingSize(t) || sizeOf(r.value); p = { size: z ? T.size[z] : '' }; break; }
      case 'animal': { var a = animalOf(t.animal) || animalOf(r.value); p = a ? { animal: T.animal[a], word: T.word[a] } : {}; break; }
      case 'home': {
        var ah = animalOf(t.animal), h = homeOfThing(t, ah) || homeOf(r.value);
        p = { animal: ah ? T.animal[ah] : '', home: h ? T.homeAt[h] : '' };
        break;
      }
      case 'letter': { var lt = markText(t) || (r.value != null ? String(r.value) : ''); p = { letter: lt }; break; }
      case 'lower': {
        var lw = markText(t) || (r.value != null ? String(r.value) : '');
        p = lw ? { letter: lw.toUpperCase(), lower: lw.toLowerCase() } : {};
        break;
      }
      case 'initial': {
        // the letter said is the real initial of the word in THIS language (truthful even after a language switch)
        var ai = animalOf(t.animal) || animalOf(t.nameValue);
        var L0 = ai ? initial(lang, null, ai) : (r.value != null ? String(r.value).toUpperCase() : '');
        p = ai ? { animal: T.animal[ai], word: T.word[ai], letter: L0 } : {};
        break;
      }
      case 'sum': case 'diff': {
        var op = opParams(lang, r, t);
        p = { a: op.a, b: op.b, ans: op.ans != null ? numberName(lang, op.ans) : '' };
        break;
      }
      case 'parity': {
        var pv = markNumber(t), pr = pv != null ? parityOf(pv) : parityOf(r.value);
        p = { num: pv != null ? numberName(lang, pv) : '', parity: pr ? T.parity[pr] : '' };
        break;
      }
      default: return I18N.t(lang, 'right.any', null, rng);
    }
    return I18N.t(lang, key, p, rng);
  };

  // `wrong {id, got:{nameKind,nameValue}, want:{rule}, streak, x, y}` (+ thing = the tapped member's thing, topic, promptKey,
  // params, rule) → names what was tapped kindly, then the goal ("That one is a blue fish. Let’s find the red fish!").
  I18N.sayWrong = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var t = obj(evThing(ev)), r = ruleOf(ev), p = null, key = 'wrong.' + r.kind, T = NAMES[lang];
    var g = gotValue(ev, t, r.kind);
    switch (r.kind) {
      case 'color': { var c = colorOf(r.value); p = { got: g ? T.color[g] : '', color: c ? T.color[c] : '' }; break; }
      case 'shape': { var s = shapeOf(r.value); p = { got: g ? T.shapeH[g] : '', shape: s ? T.shapeH[s] : '' }; break; }
      case 'size': {
        var want = sizeOf(r.value) || (g === 'big' ? 'small' : g === 'small' ? 'big' : null);
        p = { got: g ? T.size[g] : '', size: want ? T.size[want] : '' };
        break;
      }
      case 'n': {
        var n = num(r.value);
        p = { gotNum: g != null ? numberName(lang, g) : '', gotSpots: g != null ? spots(lang, g) : '',
          num: n != null ? numberName(lang, n) : '', spots: n != null ? spots(lang, n) : '' };
        break;
      }
      case 'animal': { var a = animalOf(r.value); p = { got: g ? T.animal[g] : '', animal: a ? T.animal[a] : '' }; break; }
      case 'home': {
        var gh = g ? homeOfThing(t, g) : null, h = homeOf(r.value);
        p = { got: g ? T.animal[g] : '', gotHome: gh ? T.homeAt[gh] : '', home: h ? T.homeAt[h] : '' };
        break;
      }
      case 'letter': p = { got: g ? letterName(lang, g) : '', letter: r.value != null ? String(r.value) : '' }; break;
      case 'lower': {
        var lv = r.value != null ? String(r.value) : '';
        p = { got: g ? letterName(lang, g) : '', letter: lv.toUpperCase(), lower: lv.toLowerCase() };
        break;
      }
      case 'initial': {
        var w = g ? T.word[g] : '';
        p = { got: g ? T.animal[g] : '', word: w, first: g ? initial(lang, null, g) : '', letter: r.value != null ? String(r.value).toUpperCase() : '' };
        break;
      }
      case 'sum': case 'diff': {
        var op = opParams(lang, r, null);
        p = { got: g != null ? numberName(lang, g) : '', a: op.a, b: op.b };
        break;
      }
      case 'parity': {
        var gp = g != null ? parityOf(g) : null, wp = parityOf(r.value) || (gp === 'odd' ? 'even' : gp === 'even' ? 'odd' : null);
        p = { got: g != null ? numberName(lang, g) : '', gotParity: gp ? T.parity[gp] : '', parity: wp ? T.parity[wp] : '' };
        break;
      }
      default: return I18N.t(lang, 'wrong.any', null, rng);
    }
    return I18N.t(lang, key, p, rng);
  };

  // The miss that triggers the hint: ONE short line — what was tapped + look at the glowing one
  I18N.sayWrongHint = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var t = obj(evThing(ev)), th = '';
    try { th = phrase(lang, t, { size: false }); } catch (e) { th = ''; }
    if (!th) return I18N.t(lang, 'hint', null, rng);
    return I18N.t(lang, 'wrong.hint', { thing: th }, rng);
  };

  // Counting aloud: i → "One!" … "Twenty!" (beyond: the digits)
  I18N.sayCount = function (lang, i) {
    lang = L(lang);
    var c = num(i);
    if (c == null) return I18N.t(lang, 'praise');
    if (STR[lang]['count.' + c]) return STR[lang]['count.' + c];
    return capFirst(numberName(lang, c)) + '!';
  };
  // "1, 2, 3 — three spots!" / "1, 2, 3 — ba chấm!" (the second arg of the sister games is accepted and ignored)
  I18N.sayCountRun = function (lang, n) {
    lang = L(lang);
    var c = num(n);
    if (c == null || c < 1) return c === 0 ? I18N.sayCount(lang, 0) : I18N.t(lang, 'praise');
    var list = [];
    for (var i = 1; i <= c; i++) list.push(String(i));
    return I18N.t(lang, 'count.run', { list: list.join(', '), num: numberName(lang, c), spots: spots(lang, c) });
  };

  // a member's plain name: sayName(lang, thing | e) → "the red fish" / "con cá màu đỏ"
  I18N.sayName = function (lang, thing) { return phrase(L(lang), thing) || ''; };

  // missed Talk-time answer → "It is red! Good try!", "The penguin lives on the ice! Good try!"
  // talkWrong(lang, choice, talk?) or talkWrong(lang, kind, value, talk?)
  I18N.talkWrong = function (lang, kind, value, ctx) {
    lang = L(lang);
    if (kind && typeof kind === 'object') { ctx = value; var kv = kvOf(kind); kind = kv[0]; value = kv[1]; }
    kind = wordKind(kind);
    value = rawVal(value);
    ctx = obj(ctx);
    if (value == null || value === '') return I18N.t(lang, 'talk.wrong.any');
    var vi = lang === 'vi', T = NAMES[lang];
    switch (kind) {
      case 'color': return colorOf(value) ? I18N.t(lang, 'talk.wrong', { answer: T.color[colorOf(value)] }) : I18N.t(lang, 'talk.wrong.any');
      case 'shape': return shapeOf(value) ? I18N.t(lang, 'talk.wrong.a', { answer: T[vi ? 'shapeH' : 'shape'][shapeOf(value)] }) : I18N.t(lang, 'talk.wrong.any');
      case 'size': return sizeOf(value) ? I18N.t(lang, 'talk.wrong.size', { answer: T.size[sizeOf(value)] }) : I18N.t(lang, 'talk.wrong.any');
      case 'animal': return animalOf(value) ? I18N.t(lang, 'talk.wrong.animal', { answer: T.animal[animalOf(value)] }) : I18N.t(lang, 'talk.wrong.any');
      case 'home': {
        var h = homeOf(value);
        if (!h) return I18N.t(lang, 'talk.wrong.any');
        var a = animalOf(obj(ctx.show).animal) || animalOf(obj(ctx.params).animal) || animalOf(ctx.animal);
        if (a) return I18N.t(lang, 'talk.wrong.home', { thing: phrase(lang, { kind: 'bubble', animal: a }), home: T.homeAt[h] });
        return I18N.t(lang, 'talk.wrong.place', { home: T.homeAt[h] });
      }
      case 'letter': { var lv = String(value); return I18N.t(lang, lv !== lv.toUpperCase() ? 'talk.wrong.small' : 'talk.wrong.letter', { letter: lv }); }
      case 'number': {
        var n = num(value);
        if (n == null) return I18N.t(lang, 'talk.wrong.any');
        if (ctx.topic === 'count' || /count/.test(String(ctx.promptKey || ''))) return I18N.t(lang, 'talk.wrong.spots', { num: numberName(lang, n), spots: spots(lang, n) });
        return I18N.t(lang, 'talk.wrong.number', { answer: numberName(lang, n) });
      }
      case 'text': {
        var tx = String(value);
        if (isLetter(tx)) return I18N.talkWrong(lang, 'letter', tx);
        if (splitOp(tx) || num(tx) != null) return I18N.talkWrong(lang, 'number', splitOp(tx) ? exprValue(tx) : num(tx), ctx);
        return I18N.t(lang, 'talk.wrong', { answer: tx });
      }
      case 'sum': case 'diff': { var ev2 = exprValue(value); return ev2 != null ? I18N.talkWrong(lang, 'number', ev2) : I18N.t(lang, 'talk.wrong.any'); }
      case 'parity':
        if (num(value) != null) return I18N.talkWrong(lang, 'number', num(value));
        return parityOf(value) ? I18N.t(lang, 'talk.wrong', { answer: (vi ? 'số ' : '') + T.parity[parityOf(value)] }) : I18N.t(lang, 'talk.wrong.any');
    }
    return I18N.t(lang, 'talk.wrong.any');
  };

  // Text → TTS-friendly text (Voice.say calls this). Display text stays untouched.
  // "Tibo": EN as written (/ˈtiːboʊ/, like "TiVo"); VI → "Ti Bô" (two Vietnamese syllables, so a vi-VN voice never spells it).
  var VI_UP = 'A-ZĂÂĐÊÔƠƯ', VI_LO = 'a-zăâđêôơư';
  var RE_VI_LETTER = new RegExp('(chữ|Chữ) ([' + VI_UP + VI_LO + '])(?![\\p{L}\\p{N}])', 'gu');
  var TIBO_VI = 'Ti Bô';
  I18N.speech = function (lang, text) {
    lang = L(lang);
    var s = String(text == null ? '' : text);
    s = s.replace(/\s*…\s*$/, '.').replace(/\s*…\s*/g, ', ').replace(/[›»«]/g, ',').replace(/\s+—\s+/g, ', ').replace(/,\s*([!?.])/g, '$1');
    if (lang === 'en') {
      s = s.replace(/\bNOT\b/g, 'not');
      s = s.replace(/\b(letter|Letter|big|Big|small|Small) ([A-Za-z])(?![A-Za-z’'])/g, function (m, w, ch) {
        return w + ' ' + (LETTER_SPEECH_EN[ch.toUpperCase()] || ch);
      });
      s = s.replace(/(^|[\s!?.,])([A-Z]) is for\b/g, function (m, pre, ch) { return pre + LETTER_SPEECH_EN[ch] + ' is for'; });
      s = s.replace(/\b(starts with|start with|with|not|Listen:) ([A-Z])(?![A-Za-z’'])/g, function (m, w, ch) { return w + ' ' + LETTER_SPEECH_EN[ch]; });
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 plus $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 minus $2')
        .replace(/\s=\s/g, ' equals ');
    } else {
      s = s.replace(RE_VI_LETTER, function (m, w, ch) { return w + ' ' + (LETTER_VI[ch.toUpperCase()] || ch.toLowerCase()); });
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 cộng $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 trừ $2')
        .replace(/\s=\s/g, ' bằng ');
      s = s.replace(/\bTibo\b/g, TIBO_VI);
    }
    return s.replace(/\s{2,}/g, ' ').trim();
  };

  I18N.name = name;
  I18N.words = words;
  I18N.choiceWords = function (lang, choice) { return words(lang, choice); };
  I18N.kindValue = kvOf;
  I18N.initial = initial;
  I18N.bareWord = bareWord;
  I18N.initialOf = function (lang, v) { var w = bareWord(lang, null, v); return { word: w, first: initial(lang, null, v) }; };
  I18N.phrase = function (lang, thing, opts) { return phrase(L(lang), thing, opts); };
  I18N.thingFromName = thingFromName;
  I18N.numberName = numberName;
  I18N.spotsWord = spots;
  I18N.stripMarks = stripMarks;
  I18N.homeOf = function (animal) { var a = animalOf(animal); return a ? ANIMAL_HOME[a] : null; };
  I18N.ruleOf = function (e) { var r = ruleOf(obj(e)); return { kind: r.kind, value: r.value }; };
  I18N.has = function (lang, key) { return STR[L(lang)][key] != null; };
  I18N.keys = function (lang) { return Object.keys(STR[L(lang)]); };
  I18N.raw = function (lang, key) { return STR[L(lang)][key]; };
  I18N.setChild = function (nm) { I18N.child = nm ? String(nm).trim().slice(0, 24) : ''; };
  I18N.TOPICS = TOPICS.slice();
  I18N.COLORS = COLORS.slice();
  I18N.SHAPES = SHAPES.slice();
  I18N.ANIMALS = ANIMALS.slice();
  I18N.GUESTS = ANIMALS.slice();
  I18N.HOMES = HOMES.slice();
  I18N.ANIMAL_HOME = ANIMAL_HOME;
  I18N.RULE_KINDS = RULE_KINDS.slice();
  I18N.MEMBER_KINDS = MEMBER_KINDS.slice();
  I18N.PROMPTS = PROMPTS;
  I18N.PROMPT_ALIAS = PROMPT_ALIAS;
  I18N.PARAMS = NEEDS;
  I18N.NAME_TABLE = NAMES;
  I18N.LETTER_VI = LETTER_VI;
  I18N.MAX_COUNT = MAX_COUNT;
  I18N.TIBO_VI = TIBO_VI;

  TL.I18N = I18N;
})(window.TL = window.TL || {});
