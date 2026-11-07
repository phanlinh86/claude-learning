/* Nini's Sea Painting — SP.I18N (English + Vietnamese). Nini (vi lines "Nini", titles "Rùa Nini"; Vietnamese TTS says
 * "Ni Ni") is a cheerful baby sea turtle painter: the child taps a paint shell, then taps a part of a line drawing.
 *
 *   SP.I18N.t(lang, key, params, rng?)          → string (variants picked with rng.next()/rng()/Math.random)
 *   SP.I18N.name(lang, kind, value, opts?)      → display + spoken name. kinds: color (vi "màu đỏ"), hue (bare colour,
 *                                                 vi "đỏ"; or name(lang,'color',v,{bare:true})), shape, size, animal
 *                                                 (opts {size}: "big fish" / "con cá to"), word (animal without classifier),
 *                                                 part, spot (opts {n}: EN plural, VI counted form), number, dots, letter,
 *                                                 text, sum, diff, parity
 *   SP.I18N.words(lang, kind, value)            → accepted spoken forms (lower-case, + no-diacritic forms, digits)
 *   SP.I18N.phrase(lang, thing)                 → a thing named for a sentence: "the circle", "the big fish", "letter D",
 *                                                 "small b", "number five", "2 + 3", "yellow" / "hình tròn", "con cá to",
 *                                                 "chữ D", "chữ b thường", "số năm", "màu vàng".  thing = {nameKind, nameValue,
 *                                                 size?} | {kind, value} (also phrase(lang, kind, value))
 *   SP.I18N.sayPick(lang, ev, rng?)             → `pick {color}`: "Blue!" / "Màu xanh dương!"
 *   SP.I18N.sayPaint(lang, ev, rng?)            → `paint`: "Blue tail — beautiful!", "The crab! Hooray!", count → "Three!"
 *   SP.I18N.sayWrong(lang, ev, rng?)            → `wrong`: "That’s yellow. Let’s find blue!", "That’s the circle. Where is the
 *                                                 triangle?" (maths never gives the answer away)
 *   SP.I18N.sayNeedPaint(lang, ev) / sayNotThis(lang, ev) / sayAlive(lang, kind)
 *   SP.I18N.sayCount(lang, i)                   → "One!" … "Twenty!"
 *   SP.I18N.talkWrong(lang, kind, value)        → gentle "It is X! Good try!" for a missed Talk-time answer
 *   SP.I18N.speech(lang, text)                  → text tuned for TTS (letter names, + − =, vi "Nini" → "Ni Ni")
 *   SP.I18N.setChild(name)  has(lang, key)  keys(lang)  raw(lang, key)  langs  PARAMS  TOPICS  SEA_ANIMALS  PART_NAMES
 *
 * Params: values may be RAW ({color:'red'}, {animal:'crab'}, {part:'tail'}, {spot:'pearl', n:3}) — keys named like a
 * name kind are named automatically; an object {kind, value} or {nameKind, nameValue} is replaced by its name / phrase.
 * Derived params: {hue} (bare colour) from color, {word} from animal, {lower} from letter, {expr} from a,b / text,
 * {num} (number word) from n, {spot} plural-aware with n.
 * Keys with required params (PARAMS) fall back to a generic key when a param is missing (never "the !" on screen).
 * Optional params ({color} in p.shapes / p.animals / p.count …) simply vanish when missing.
 * {child}: if the child's name is empty, variants containing {child} are skipped.
 */
(function (SP) {
  'use strict';

  var LANGS = ['en', 'vi'];
  var SEA_ANIMALS = ['fish', 'crab', 'octopus', 'starfish', 'jellyfish', 'seahorse', 'whale', 'dolphin'];
  var SPOTS = ['bubble', 'pearl', 'shell', 'starfish'];

  // ---------------------------------------------------------------- part names (every SP.PART_NAMES value)
  // [en, vi] — EN without "the" (lines add it), VI the natural kid word with its classifier where it helps
  // ("cái đuôi", "đôi càng", "mấy cái chân"); VI lines never add "màu" in front of {color}.
  var PARTS = {
    body: ['body', 'phần thân'], tail: ['tail', 'cái đuôi'], fin: ['fin', 'cái vây'], fins: ['fins', 'mấy cái vây'],
    sail: ['sail', 'cánh buồm'], hull: ['boat', 'thân thuyền'], flag: ['flag', 'lá cờ'], mast: ['mast', 'cột buồm'],
    shell: ['body', 'cái mai'], snailshell: ['shell', 'vỏ ốc'], claws: ['claws', 'đôi càng'], claw: ['claw', 'cái càng'],
    legs: ['legs', 'mấy cái chân'], bell: ['bell', 'đầu sứa'], tentacles: ['tentacles', 'mấy cái tua'],
    head: ['head', 'cái đầu'], arms: ['arms', 'mấy cái xúc tu'], hat: ['hat', 'cái mũ'], belly: ['belly', 'cái bụng'],
    tower: ['tower', 'cái tháp'], window: ['window', 'ô cửa sổ'], windows: ['windows', 'mấy ô cửa sổ'],
    roof: ['roof', 'mái nhà'], rock: ['rock', 'tảng đá'], rocks: ['rocks', 'mấy tảng đá'], door: ['door', 'cánh cửa'],
    spots: ['spots', 'mấy cái đốm'], star: ['star', 'ngôi sao'], bigstar: ['big star', 'ngôi sao to'],
    wheel: ['wheel', 'bánh lái'], cabin: ['cabin', 'khoang thuyền'], wave: ['wave', 'con sóng'], waves: ['waves', 'mấy con sóng'],
    sun: ['sun', 'ông mặt trời'], cloud: ['cloud', 'đám mây'], light: ['light', 'ngọn đèn'], lamp: ['lamp', 'cái đèn'],
    porthole: ['round window', 'ô cửa tròn'], propeller: ['propeller', 'chân vịt'], nose: ['nose', 'cái mũi'],
    snout: ['snout', 'cái mõm'], lid: ['lid', 'cái nắp'], chest: ['chest', 'cái rương'], box: ['box', 'cái hộp'],
    base: ['base', 'chân đế'], stripes: ['stripes', 'mấy cái sọc'], stripe: ['stripe', 'cái sọc'], crown: ['crown', 'vương miện'],
    castle: ['castle', 'lâu đài'], coral: ['coral', 'cây san hô'], seaweed: ['seaweed', 'cây rong biển'],
    sand: ['sand', 'bãi cát'], boat: ['boat', 'con thuyền'], top: ['top', 'phần trên'], bottom: ['bottom', 'phần dưới'],
    flower: ['flower', 'bông hoa'], leaf: ['leaf', 'chiếc lá'], bucket: ['bucket', 'cái xô'], spade: ['spade', 'cái xẻng'],
    bow: ['bow', 'cái nơ'], scarf: ['scarf', 'cái khăn'], cheeks: ['cheeks', 'đôi má'], wings: ['wings', 'đôi cánh'],
    eye: ['eye', 'con mắt'], mouth: ['mouth', 'cái miệng'], back: ['back', 'cái lưng'], crest: ['crest', 'cái mào'],
    ring: ['ring', 'cái phao'], buoy: ['buoy', 'cái phao'], balloon: ['balloon', 'quả bóng bay'], string: ['string', 'sợi dây'],
    house: ['house', 'ngôi nhà'], wall: ['wall', 'bức tường'], tube: ['tube', 'cái ống'], periscope: ['periscope', 'kính tiềm vọng'],
    blow: ['water spout', 'vòi nước'], spout: ['water spout', 'vòi nước'], pearl: ['pearl', 'viên ngọc trai'],
    gem: ['jewel', 'viên ngọc'], coin: ['coin', 'đồng xu'], handle: ['handle', 'tay cầm'], steps: ['steps', 'bậc thang'],
    gate: ['gate', 'cổng'], path: ['path', 'con đường'], hill: ['hill', 'ngọn đồi'], island: ['island', 'hòn đảo'],
    tree: ['tree', 'cái cây'], palm: ['palm tree', 'cây dừa'], trunk: ['trunk', 'thân cây'], hood: ['hood', 'cái mũ trùm']
  };

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
  NAMES.en.size = { big: 'big', small: 'small' };
  NAMES.vi.size = { big: 'to', small: 'nhỏ' };
  NAMES.en.animal = { fish: 'fish', crab: 'crab', octopus: 'octopus', starfish: 'starfish', jellyfish: 'jellyfish',
    seahorse: 'seahorse', whale: 'whale', dolphin: 'dolphin' };
  NAMES.vi.animal = { fish: 'con cá', crab: 'con cua', octopus: 'con bạch tuộc', starfish: 'con sao biển', jellyfish: 'con sứa',
    seahorse: 'con cá ngựa', whale: 'con cá voi', dolphin: 'con cá heo' };
  NAMES.en.word = NAMES.en.animal;
  NAMES.vi.word = { fish: 'cá', crab: 'cua', octopus: 'bạch tuộc', starfish: 'sao biển', jellyfish: 'sứa', seahorse: 'cá ngựa',
    whale: 'cá voi', dolphin: 'cá heo' };
  NAMES.en.part = {}; NAMES.vi.part = {};
  Object.keys(PARTS).forEach(function (k) { NAMES.en.part[k] = PARTS[k][0]; NAMES.vi.part[k] = PARTS[k][1]; });
  NAMES.en.spot = { bubble: 'bubble', pearl: 'pearl', shell: 'shell', starfish: 'starfish' };
  NAMES.vi.spot = { bubble: 'bong bóng', pearl: 'viên ngọc trai', shell: 'vỏ sò', starfish: 'con sao biển' };
  NAMES.en.parity = { odd: 'odd', even: 'even' };
  NAMES.vi.parity = { odd: 'lẻ', even: 'chẵn' };
  var SPOT_PLURAL = { bubble: 'bubbles', pearl: 'pearls', shell: 'shells', starfish: 'starfish' };
  var GENERIC_SPOT = { en: ['spot', 'spots'], vi: ['chấm tròn', 'chấm tròn'] };

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
        rect: ['rectangle', 'rectangles', 'long box'], rectangle: ['rectangle', 'rectangles'], oval: ['oval', 'egg', 'ovals'],
        diamond: ['diamond', 'kite', 'diamonds'] },
      size: { big: ['big', 'large', 'huge', 'bigger', 'giant'], small: ['small', 'little', 'tiny', 'smaller', 'baby'] },
      animal: { fish: ['fish', 'fishy', 'fishes', 'goldfish'], crab: ['crab', 'crabs', 'crabby'],
        octopus: ['octopus', 'octopuses', 'octopi', 'octo'], starfish: ['starfish', 'sea star', 'star fish'],
        jellyfish: ['jellyfish', 'jelly fish', 'jelly'], seahorse: ['seahorse', 'sea horse', 'seahorses'],
        whale: ['whale', 'whales', 'wail'], dolphin: ['dolphin', 'dolphins', 'dolfin'] },
      spot: { bubble: ['bubble', 'bubbles'], pearl: ['pearl', 'pearls'], shell: ['shell', 'shells', 'seashell'],
        starfish: ['starfish', 'star fish', 'sea star'] },
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
      // order matters only for the matcher's tie rule: "cá ngựa" beats "cá" because the longer form scores higher
      animal: { fish: ['con cá', 'cá', 'cá vàng', 'chú cá'], crab: ['con cua', 'cua', 'cua biển'],
        octopus: ['con bạch tuộc', 'bạch tuộc', 'bạch tuột'], starfish: ['con sao biển', 'sao biển'],
        jellyfish: ['con sứa', 'sứa', 'sứa biển'], seahorse: ['con cá ngựa', 'cá ngựa'],
        whale: ['con cá voi', 'cá voi'], dolphin: ['con cá heo', 'cá heo'] },
      spot: { bubble: ['bong bóng', 'bóng bóng', 'bọt biển'], pearl: ['ngọc trai', 'viên ngọc trai', 'ngọc'],
        shell: ['vỏ sò', 'con sò', 'sò'], starfish: ['sao biển', 'con sao biển'] },
      parity: { odd: ['lẻ', 'số lẻ', 'lẽ', 'lẹ'], even: ['chẵn', 'số chẵn', 'chặn', 'chắn'] }
    }
  };

  // Default SP.WORDS for the 'initial' topic (the sea animals are the pictures). content.js may replace it
  // ({en:[{word, initial, animal}], vi:[…]}). vi words are the animal names WITHOUT the classifier "con".
  var WORD_LIST = {
    en: [['fish', 'fish', 'F'], ['crab', 'crab', 'C'], ['octopus', 'octopus', 'O'], ['starfish', 'starfish', 'S'],
      ['jellyfish', 'jellyfish', 'J'], ['seahorse', 'seahorse', 'S'], ['whale', 'whale', 'W'], ['dolphin', 'dolphin', 'D']],
    vi: [['cá', 'fish', 'C'], ['cua', 'crab', 'C'], ['bạch tuộc', 'octopus', 'B'], ['sao biển', 'starfish', 'S'],
      ['sứa', 'jellyfish', 'S'], ['cá ngựa', 'seahorse', 'C'], ['cá voi', 'whale', 'C'], ['cá heo', 'dolphin', 'C']]
  };
  function defaultEntries(lang) {
    return WORD_LIST[lang].map(function (w) { return { id: w[1], word: w[0], animal: w[1], initial: w[2] }; });
  }
  if (!SP.WORDS) {
    SP.WORDS = {};
    LANGS.forEach(function (l) { SP.WORDS[l] = defaultEntries(l); });
  }

  // ---------------------------------------------------------------- strings
  var TOPICS = ['colors', 'shapes', 'size', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
  var NAME_KINDS = ['color', 'hue', 'shape', 'size', 'animal', 'word', 'part', 'spot', 'number', 'dots', 'letter', 'text',
    'sum', 'diff', 'parity'];
  // prompt keys content.js asks with (DESIGN §5.1) and their REQUIRED params (others are optional)
  var PROMPTS = {
    'p.colors': ['part', 'color'], 'p.tapPart': ['part'], 'p.shapes': ['shape'], 'p.shapes5': ['shape', 'color'],
    'p.size': ['size', 'animal'], 'p.animals': ['animal'], 'p.count': ['n'], 'p.letters': ['letter'], 'p.lower': ['letter'],
    'p.initial': ['letter'], 'p.add': ['a', 'b'], 'p.sub': ['a', 'b'], 'p.oddeven': ['parity']
  };
  var MAX_COUNT = 20;

  var STR = {
    en: {
      'ui.title': 'Nini’s Sea Painting',
      'ui.logo1': 'Nini’s',
      'ui.logo2': 'Sea Painting',
      'ui.subtitle': 'Pick a paint, tap the picture, watch it swim away!',
      'ui.tagline': 'Pick a paint, tap the picture, watch it swim away!',
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
      'ui.voice': 'Nini’s voice',
      'ui.mic': 'Answer by voice',
      'ui.done': 'Done',
      'ui.stars': 'Stars',
      'ui.chapter': 'Chapter {n}',
      'ui.allDone': 'All done! {stars} stars',
      'ui.welcome': ['Hi {child}! I am Nini. Let’s paint the sea!', 'Hi! I am Nini. Let’s paint the sea!'],
      'ui.micUnsupported': 'Voice answers are not available here. Tap the pictures!',
      'ui.micDenied': 'The microphone is off. Tap the pictures instead!',
      'ui.voiceMissing': 'Tip for parents: add a voice in Settings › Accessibility › Spoken Content › Voices.',
      'ui.tapOrSay': 'Tap or say the answer!',
      'ui.listening': 'Nini is listening…',
      'ui.tapNini': 'Tap Nini to hear it again',
      'ui.tapHint': 'Tap a paint, then tap the picture',
      'ui.skip': 'Skip',
      'ui.gallery': 'Our pictures',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Colour Painting',
      'topic.shapes': 'Shape Painting',
      'topic.size': 'Big and Small',
      'topic.count': 'Counting Bubbles',
      'topic.animals': 'Sea Animals',
      'topic.letters': 'ABC Bubbles',
      'topic.lower': 'Big and Small Letters',
      'topic.initial': 'First Letters',
      'topic.add': 'Adding Up',
      'topic.sub': 'Take Away',
      'topic.oddeven': 'Odd and Even',

      'weather.0': 'Spring petals on the water!',
      'weather.1': 'Sunny summer sea!',
      'weather.2': 'Autumn leaves are drifting down!',
      'weather.3': 'Brr, winter! Ice on top!',

      'enter': ['A new picture!', 'Look, a new picture is here!', 'Here comes a picture to paint!'],

      'p.any': ['Let’s paint the picture!', 'Pick a paint and tap the picture!', 'Time to paint!'],
      'p.colors': ['Let’s paint the {part} {color}!', 'Paint the {part} {color}! Find the {color} paint!',
        'Can you make the {part} {color}?'],
      'p.tapPart': ['Now tap the shining {part}!', 'Now paint the sparkly {part}!', 'Look! Tap the shining {part}!'],
      'p.shapes': ['Paint the {shape} {color}!', 'Find the {shape} and make it {color}!', 'Where is the {shape}? Paint it {color}!'],
      'p.shapes5': ['Paint the {shape} {color}! Pick the {color} paint first!', 'Find the {color} paint, then paint the {shape}!',
        'Let’s make the {shape} {color}!'],
      'p.size': ['Paint the {size} {animal} {color}!', 'Which {animal} is {size}? Paint it {color}!',
        'Find the {size} {animal} and paint it {color}!'],
      'p.animals': ['Can you paint the {animal} {color}?', 'Paint the {animal} {color}!', 'Where is the {animal}? Paint it {color}!'],
      'p.count': ['Paint {n} {spot} {color}!', 'Let’s count! Paint {n} {spot}!', 'Can you paint {n} {spot}? Let’s count!'],
      'p.letters': ['Paint the letter {letter}!', 'Where is the letter {letter}? Paint it!', 'Find letter {letter} and paint it!'],
      'p.lower': ['Big {letter} has a little friend. Paint small {lower}!', 'Find small {lower} and paint it!',
        'Where is small {lower}? It goes with big {letter}!'],
      'p.initial': ['Paint the animal that starts with {letter}!', 'Who starts with {letter}? Paint it!',
        'Listen: {letter}! Which animal starts with {letter}?'],
      'p.add': ['What is {a} + {b}? Paint the answer!', 'Let’s add! {a} + {b}. Find the answer and paint it!',
        'Count it up: {a} + {b}! Paint the answer!'],
      'p.sub': ['What is {a} − {b}? Paint the answer!', 'Take away! {a} − {b}. Find the answer and paint it!',
        'Start with {a}, take away {b}! Paint the answer!'],
      'p.oddeven': ['Paint all the {parity} numbers!', 'Find every {parity} number and paint it!', 'Let’s paint the {parity} numbers!'],

      'say.pick': ['{color}!', '{color} paint!', 'Yummy {color} paint!'],
      'say.pick.any': ['Splish!', 'Paint on the brush!'],
      'say.paint.part': ['{color} {part} — beautiful!', 'Lovely {color} {part}!', 'Look at the {color} {part}!'],
      'say.paint.shape': ['The {shape}! Beautiful!', 'A {color} {shape}! Lovely!', 'You found the {shape}!'],
      'say.paint.spot': ['Pop! A {color} {spot}!', 'Pretty {spot}!'],
      'say.paint.animal': ['The {animal}! Hooray!', 'What a {color} {animal}!', 'You painted the {animal}!'],
      'say.paint.label': ['{label}! Super!', 'You found {label}!', '{label}! Lovely!'],
      'say.paint.parity': ['{num} is {parity}!', 'Yes! {num} is {parity}!'],
      'say.paint.initial': ['{letter} is for {word}!', 'Yes! {letter} is for {word}!'],
      'say.paint.sum': ['{expr} is {ans}!', 'Yes! {expr} is {ans}!'],
      'say.paint.any': ['Beautiful!', 'Lovely colour!', 'So pretty!'],

      'wrong.color': ['That’s {got}. Let’s find {want}!', 'Hmm, that’s {got}. Where is {want}?', 'That one is {got}! Let’s look for {want}!'],
      'wrong.part': ['That’s {got}. Where is {want}?', 'That’s {got}! Let’s find {want}!', 'Hmm, that’s {got}. Can you find {want}?'],
      'wrong.math': ['That’s {got}. Let’s count again!', 'Hmm, {got}. Let’s count one more time!'],
      'wrong.parity': ['{num} is {parity}! Let’s look for another one!', '{num} is {parity}. Let’s find a different one!'],
      'wrong.initial': ['{word} starts with {first}! Let’s look again!', '{word} starts with {first}. Let’s find another one!'],
      'wrong.any': ['Let’s look again!', 'Let’s try another one!', 'Hmm, let’s think again!', 'Keep going, you can do it!'],
      'needPaint': ['First pick the {color} paint!', 'Let’s get {color} paint on the brush first!',
        'Tap the {color} paint first!'],
      'needPaint.any': ['First pick a paint!', 'Tap a paint first!', 'The brush needs paint first!'],
      'notThis': ['Paint the shining {part}!', 'Look for the sparkly {part}!', 'Tap the shining {part}!'],
      'notThis.any': ['Paint the shining part!', 'Look for the sparkly part!', 'Tap the part that shines!'],
      'already': ['That one is painted! Find another one!', 'Already painted! Let’s find a white one!',
        'This one is done! Try another one!'],
      'stepDone': ['Beautiful!', 'Lovely colour!', 'So pretty!', 'Wonderful painting!'],
      'finish': ['Nini finishes the rest!', 'Swish, swish! Nini paints the rest!', 'Let me finish the picture!'],
      'alive.swim': ['Look, it’s swimming!', 'Swish! It swims away!', 'Bye-bye! Off it swims!'],
      'alive.scuttle': ['Look, it scuttles away!', 'Click, click! Off it goes!', 'Bye-bye! Scuttle, scuttle!'],
      'alive.sail': ['Look, it’s sailing away!', 'Whoosh! Off it sails!', 'Bye-bye! Sail away!'],
      'alive.bob': ['Look, it bobs away!', 'Bob, bob! Up it goes!', 'Bye-bye! Bobbing away!'],
      'alive.float': ['Look, it floats up!', 'Up, up, up it floats!', 'Bye-bye! Floating away!'],
      // the same, naming the picture (and the child): a reward, said while it moves (playtest P2-3)
      'alive.swim.thing': ['Bye-bye, {thing}! Off it swims!', 'Look, your {thing} is swimming, {child}!', 'Swish! The {thing} swims away!'],
      'alive.scuttle.thing': ['Bye-bye, {thing}! Scuttle, scuttle!', 'Look, your {thing} runs away, {child}!', 'Click, click! The {thing} scuttles off!'],
      'alive.sail.thing': ['Bye-bye, {thing}! Sail away!', 'Look, your {thing} is sailing, {child}!', 'Whoosh! The {thing} sails away!'],
      'alive.bob.thing': ['Bye-bye, {thing}! Bob, bob!', 'Look, your {thing} bobs away, {child}!', 'Bob, bob! Up goes the {thing}!'],
      'alive.float.thing': ['Bye-bye, {thing}! Up it floats!', 'Look, your {thing} floats up, {child}!', 'Up, up! The {thing} floats away!'],
      'surprise.fishy': ['Look! A little fish with a paint bubble!', 'A little fish swims by! Tap it!'],
      'fishy.tap': ['Splish! Paint dots everywhere!', 'Hee hee! The little fish giggles!', 'Pop! Colourful dots!'],
      'surprise.pearl': ['A clam is sleeping on the sand!', 'Look! A clam! What is inside?'],
      'pearl.tap': ['A shiny pearl! So pretty!', 'Ooh! The clam opens! A pearl!', 'Sparkle! A little pearl!'],

      'praise': ['Yes!', 'Great job!', 'You got it!', 'Super!', 'Wonderful!', 'Nice one!', 'Hooray!', 'Well done!'],
      'great': ['Great painting, {child}!', 'You did it, {child}!', 'What a picture!', 'Wow, {child}, super painter!',
        'Hooray! The picture is done!', 'You are so clever!', 'Super painter!'],
      'party': ['Look at all our pictures!', 'Hooray! What a sea of colours!', 'So many pictures!'],
      'hint': ['Psst! Look at the shining one!', 'Watch the little hand!', 'Nini will help! This one!',
        'Look, this one is sparkling!', 'The shiny one! Tap it!'],
      'idle': ['Let’s paint!', 'Nini is waiting! Your turn!', 'Tap the picture!', 'I am here, {child}! Let’s paint!',
        'The picture wants some colour!', 'What shall we paint next?'],

      'talk.intro': 'Talk time!',
      'talk.colors': 'Which one is {color}?',
      'talk.colorsAny': 'What colour is this?',
      'talk.shapes': 'Where is the {shape}?',
      'talk.shapesAny': 'What shape is this?',
      'talk.size': 'Which {animal} is {size}?',
      'talk.sizeOne': 'Which one is {size}?',
      'talk.sizeAny': 'Which one is big?',
      'talk.count': 'How many {spot} are there?',
      'talk.countAny': 'How many dots are there?',
      'talk.animals': 'Where is the {animal}?',
      'talk.animalsAny': 'Which sea animal is this?',
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
      'talk.wrong.any': 'Good try! Let’s keep painting!',

      'session.done': ['What a sea of pictures! {stars} stars! Hooray!', 'Amazing, {child}! {stars} stars!',
        'So many pictures painted! {stars} stars!']
    },
    vi: {
      'ui.title': 'Rùa Nini — Tô Màu Đại Dương',
      'ui.logo1': 'Rùa Nini',
      'ui.logo2': 'Tô Màu Đại Dương',
      'ui.subtitle': 'Chọn màu, chạm vào tranh, xem tranh bơi đi nhé!',
      'ui.tagline': 'Chọn màu, chạm vào tranh, xem tranh bơi đi nhé!',
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
      'ui.voice': 'Giọng của Nini',
      'ui.mic': 'Nói để trả lời',
      'ui.done': 'Xong',
      'ui.stars': 'Ngôi sao',
      'ui.chapter': 'Chương {n}',
      'ui.allDone': 'Hoàn thành! {stars} ngôi sao',
      'ui.welcome': ['Chào bé {child}! Mình là rùa Nini. Mình cùng tô màu biển xanh nhé!',
        'Chào bé! Mình là rùa Nini. Mình cùng tô màu biển xanh nhé!'],
      'ui.micUnsupported': 'Máy này chưa nghe được giọng nói. Bé chạm vào hình nhé!',
      'ui.micDenied': 'Micrô đang tắt. Bé chạm vào hình nhé!',
      'ui.voiceMissing': 'Mẹo cho bố mẹ: thêm giọng tiếng Việt trong Cài đặt › Trợ năng › Nội dung được đọc › Giọng nói.',
      'ui.tapOrSay': 'Bé chạm hoặc nói đáp án nhé!',
      'ui.listening': 'Nini đang nghe…',
      'ui.tapNini': 'Chạm vào Nini để nghe lại nhé',
      'ui.tapHint': 'Bé chạm vào một màu, rồi chạm vào tranh nhé',
      'ui.skip': 'Bỏ qua',
      'ui.gallery': 'Tranh của bé',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Tô màu sắc',
      'topic.shapes': 'Tô hình khối',
      'topic.size': 'To và nhỏ',
      'topic.count': 'Đếm bong bóng',
      'topic.animals': 'Các con vật biển',
      'topic.letters': 'Bong bóng chữ cái',
      'topic.lower': 'Chữ hoa, chữ thường',
      'topic.initial': 'Chữ cái đầu tiên',
      'topic.add': 'Phép cộng',
      'topic.sub': 'Phép trừ',
      'topic.oddeven': 'Số chẵn, số lẻ',

      'weather.0': 'Mùa xuân, cánh hoa trôi trên mặt nước!',
      'weather.1': 'Mùa hè, biển nắng đẹp quá!',
      'weather.2': 'Mùa thu, lá vàng rơi xuống biển!',
      'weather.3': 'Brr, mùa đông! Trên kia có băng nè!',

      'enter': ['Một bức tranh mới nè!', 'Nhìn kìa, tranh mới tới rồi!', 'Tranh mới để tô đây rồi!'],

      'p.any': ['Bé ơi, mình tô tranh nhé!', 'Bé chọn màu rồi chạm vào tranh nào!', 'Tới giờ tô màu rồi!'],
      'p.colors': ['Bé ơi, tô {part} {color} nhé!', 'Mình tô {part} {color} nào! Bé chọn {color} nhé!',
        'Bé ơi, {part} muốn được tô {color} đó!'],
      'p.tapPart': ['Giờ bé chạm vào {part} đang lấp lánh nhé!', 'Bé tô {part} lấp lánh nào!', 'Bé chạm vào {part} đang sáng nhé!'],
      'p.shapes': ['Bé ơi, tô {shape} {color} nhé!', '{shape} ở đâu nhỉ? Bé tô {color} nào!', 'Mình tìm {shape} rồi tô {color} nhé!'],
      'p.shapes5': ['Bé ơi, tô {shape} {color} nhé! Bé chọn {color} trước nha!', 'Bé tìm {color}, rồi tô {shape} nhé!',
        'Mình tô {shape} {color} nào!'],
      'p.size': ['Bé ơi, tô {animal} {size} {color} nhé!', '{animal} nào {size} nhỉ? Bé tô {color} nào!',
        'Bé tìm {animal} {size} rồi tô {color} nhé!'],
      'p.animals': ['Bé ơi, tô {animal} {color} nhé!', 'Bé tô {animal} {color} được không nào?', '{animal} ở đâu nhỉ? Bé tô {color} nhé!'],
      'p.count': ['Bé ơi, tô {n} {spot} {color} nhé!', 'Mình đếm nhé! Bé tô {n} {spot} nào!', 'Bé tô {n} {spot} nhé! Mình cùng đếm!'],
      'p.letters': ['Bé ơi, tô chữ {letter} nhé!', 'Chữ {letter} ở đâu nhỉ? Bé tô nào!', 'Bé tìm chữ {letter} rồi tô nhé!'],
      'p.lower': ['Bé ơi, chữ {letter} hoa có một bạn nhỏ. Bé tô chữ {lower} thường nhé!', 'Bé tìm chữ {lower} thường rồi tô nào!',
        'Chữ {lower} thường ở đâu nhỉ? Bạn ấy đi cùng chữ {letter} hoa đó!'],
      'p.initial': ['Bé ơi, tô con vật bắt đầu bằng chữ {letter} nhé!', 'Bạn nào bắt đầu bằng chữ {letter}? Bé tô nào!',
        'Bé nghe nè, chữ {letter}! Con vật nào bắt đầu bằng chữ {letter}?'],
      'p.add': ['Bé ơi, {a} + {b} bằng mấy? Bé tô đáp án nhé!', 'Mình cộng nào! {a} + {b}. Bé tìm đáp án rồi tô nhé!',
        'Bé tính nhé: {a} + {b}! Tô đáp án nào!'],
      'p.sub': ['Bé ơi, {a} − {b} bằng mấy? Bé tô đáp án nhé!', 'Mình trừ nào! {a} − {b}. Bé tìm đáp án rồi tô nhé!',
        'Có {a}, bớt đi {b}! Bé tô đáp án nào!'],
      'p.oddeven': ['Bé ơi, tô tất cả các số {parity} nhé!', 'Bé tìm hết các số {parity} rồi tô nào!', 'Mình tô các số {parity} nhé!'],

      'say.pick': ['{color}!', '{color} nè!', 'Lấy {color} nào!'],
      'say.pick.any': ['Chấm màu nào!', 'Cọ có màu rồi!'],
      'say.paint.part': ['{part} {color}, đẹp quá!', '{part} {color} xinh quá!', '{part} có {color} rồi nè!'],
      'say.paint.shape': ['{shape}! Đẹp quá!', '{shape} {color} xinh quá!', 'Bé tìm ra {shape} rồi!'],
      'say.paint.spot': ['Bụp! {spot} {color}!', '{spot} xinh quá!'],
      'say.paint.animal': ['{animal}! Hoan hô!', '{animal} {color} đẹp quá!', 'Bé tô {animal} rồi nè!'],
      'say.paint.label': ['{label}! Giỏi quá!', 'Bé tìm ra {label} rồi!', '{label}! Đẹp quá!'],
      'say.paint.parity': ['{num} là số {parity}!', 'Đúng rồi! {num} là số {parity}!'],
      'say.paint.initial': ['Chữ {letter}, {word}!', 'Đúng rồi! Chữ {letter}, {word}!'],
      'say.paint.sum': ['{expr} bằng {ans}!', 'Đúng rồi! {expr} bằng {ans}!'],
      'say.paint.any': ['Đẹp quá!', 'Màu xinh quá!', 'Tuyệt vời!'],

      'wrong.color': ['Đây là {got}. Mình tìm {want} nhé!', 'Ồ, đây là {got}. {want} ở đâu nhỉ?', 'Cái này là {got}! Bé tìm {want} nào!'],
      'wrong.part': ['Đây là {got}. {want} ở đâu nhỉ?', 'Đây là {got}! Mình tìm {want} nhé!', 'Ồ, đây là {got}. Bé tìm {want} nào!'],
      'wrong.math': ['Đây là {got}. Mình đếm lại nhé!', 'Ồ, {got}. Bé đếm thêm lần nữa nào!'],
      'wrong.parity': ['{num} là số {parity}! Mình tìm số khác nhé!', '{num} là số {parity}. Bé tìm số khác nào!'],
      'wrong.initial': ['{word} bắt đầu bằng chữ {first}! Mình tìm lại nhé!', '{word} bắt đầu bằng chữ {first}. Bé tìm bạn khác nào!'],
      'wrong.any': ['Mình tìm lại nhé!', 'Bé thử cái khác nào!', 'Bé nghĩ thêm chút nữa nhé!', 'Cố lên, bé làm được mà!'],
      'needPaint': ['Bé chọn {color} trước nhé!', 'Mình chấm {color} lên cọ trước nào!', 'Bé chạm vào {color} trước nhé!'],
      'needPaint.any': ['Bé chọn màu trước nhé!', 'Bé chạm vào một màu trước nào!', 'Cọ cần có màu trước nhé!'],
      'notThis': ['Bé tô {part} đang lấp lánh nhé!', 'Bé tìm {part} lấp lánh nào!', '{part} đang sáng kìa! Bé chạm vào nhé!'],
      'notThis.any': ['Bé tô chỗ đang lấp lánh nhé!', 'Bé tìm chỗ lấp lánh nào!', 'Bé chạm vào chỗ đang sáng nhé!'],
      'already': ['Chỗ này tô rồi! Bé tìm chỗ khác nhé!', 'Tô rồi nè! Mình tìm chỗ còn trắng nhé!',
        'Cái này xong rồi! Bé thử cái khác nào!'],
      'stepDone': ['Đẹp quá!', 'Màu xinh quá!', 'Tuyệt vời!', 'Bé tô đẹp lắm!'],
      'finish': ['Nini tô nốt phần còn lại nhé!', 'Quẹt, quẹt! Nini tô nốt nè!', 'Để Nini tô cho xong bức tranh nhé!'],
      'alive.swim': ['Nhìn kìa, nó bơi rồi!', 'Vút! Bơi đi rồi!', 'Tạm biệt! Bơi đi nào!'],
      'alive.scuttle': ['Nhìn kìa, nó bò ngang đi rồi!', 'Lạch cạch! Bò đi rồi!', 'Tạm biệt! Bò ngang, bò ngang!'],
      'alive.sail': ['Nhìn kìa, thuyền ra khơi rồi!', 'Vù vù! Thuyền đi rồi!', 'Tạm biệt! Thuyền ra khơi nào!'],
      'alive.bob': ['Nhìn kìa, nó dập dềnh đi rồi!', 'Bập bềnh! Lên cao nào!', 'Tạm biệt! Dập dềnh, dập dềnh!'],
      'alive.float': ['Nhìn kìa, nó bay lên rồi!', 'Lên, lên, lên cao nào!', 'Tạm biệt! Bồng bềnh bay lên!'],
      'alive.swim.thing': ['Tạm biệt {thing}! Bơi đi nào!', 'Nhìn kìa bé {child}, {thing} bơi đi rồi!', 'Vút! {thing} bơi đi rồi!'],
      'alive.scuttle.thing': ['Tạm biệt {thing}! Bò ngang, bò ngang!', 'Nhìn kìa bé {child}, {thing} chạy mất rồi!', 'Lạch cạch! {thing} bò đi rồi!'],
      'alive.sail.thing': ['Tạm biệt {thing}! Ra khơi nào!', 'Nhìn kìa bé {child}, {thing} ra khơi rồi!', 'Vù vù! {thing} đi xa rồi!'],
      'alive.bob.thing': ['Tạm biệt {thing}! Dập dềnh, dập dềnh!', 'Nhìn kìa bé {child}, {thing} dập dềnh rồi!', 'Bập bềnh! {thing} lên cao nào!'],
      'alive.float.thing': ['Tạm biệt {thing}! Bay lên nào!', 'Nhìn kìa bé {child}, {thing} bay lên rồi!', 'Lên, lên! {thing} bay lên cao!'],
      'surprise.fishy': ['Nhìn kìa! Bạn cá nhỏ mang bong bóng màu!', 'Bạn cá nhỏ bơi qua kìa! Bé chạm vào nhé!'],
      'fishy.tap': ['Tách! Chấm màu bay khắp nơi!', 'Hi hi! Bạn cá nhỏ cười khúc khích!', 'Bụp! Chấm màu đủ màu!'],
      'surprise.pearl': ['Có bạn sò đang ngủ trên cát nè!', 'Nhìn kìa! Một con sò! Bên trong có gì nhỉ?'],
      'pearl.tap': ['Một viên ngọc trai lấp lánh! Đẹp quá!', 'Ồ! Bạn sò mở ra rồi! Ngọc trai nè!', 'Lấp lánh! Viên ngọc trai nhỏ xinh!'],

      'praise': ['Đúng rồi!', 'Giỏi quá!', 'Tuyệt vời!', 'Hoan hô!', 'Bé giỏi lắm!', 'Chính xác!', 'Siêu quá!', 'Hay lắm!'],
      'great': ['Bé {child} tô màu giỏi quá!', 'Hoan hô bé {child}!', 'Bức tranh đẹp quá!', 'Oa, bé {child} là họa sĩ tí hon!',
        'Hoan hô, tranh xong rồi!', 'Bé thông minh quá!', 'Bé là họa sĩ siêu giỏi!'],
      'party': ['Nhìn tranh của mình nè!', 'Hoan hô! Biển đầy màu sắc!', 'Bao nhiêu là tranh đẹp!'],
      'hint': ['Nhìn nè! Cái này đang lấp lánh.', 'Bé xem bàn tay nhỏ chỉ nè!', 'Nini giúp bé nhé! Cái này nè!',
        'Nhìn kìa, cái này sáng lên!', 'Cái lấp lánh đó! Bé chạm vào nhé!'],
      'idle': ['Mình tô màu nào!', 'Nini đang chờ bé nè!', 'Bé chạm vào tranh nhé!', 'Bé {child} ơi, mình tô tiếp nhé!',
        'Bức tranh đang chờ màu nè!', 'Mình tô gì tiếp đây nhỉ?'],

      'talk.intro': 'Giờ trò chuyện!',
      'talk.colors': 'Cái nào {color} nhỉ?',
      'talk.colorsAny': 'Cái này màu gì nhỉ?',
      'talk.shapes': '{shape} ở đâu nhỉ?',
      'talk.shapesAny': 'Cái này hình gì nhỉ?',
      'talk.size': '{animal} nào {size} nhỉ?',
      'talk.sizeOne': 'Bé chỉ con nào {size} nhé?',
      'talk.sizeAny': 'Bé chỉ con nào to nhé?',
      'talk.count': 'Có mấy {spot} nào?',
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
      'talk.wrong.size': 'Là con {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.letter': 'Là chữ {letter} đó! Bé cố gắng lắm!',
      'talk.wrong.small': 'Là chữ {letter} thường đó! Bé cố gắng lắm!',
      'talk.wrong.number': 'Là số {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.any': 'Bé cố gắng lắm! Mình tô tiếp nhé!',

      'session.done': ['Biển tranh đẹp quá! {stars} ngôi sao!', 'Bé {child} giỏi quá! {stars} ngôi sao!',
        'Bé tô bao nhiêu là tranh! {stars} ngôi sao!']
    }
  };
  // count.0 … count.20: "One!" / "Một!" (each painted spot in a count step)
  LANGS.forEach(function (l) {
    for (var i = 0; i <= MAX_COUNT; i++) {
      var w = NUM[l][i];
      STR[l]['count.' + i] = w.charAt(0).toUpperCase() + w.slice(1) + '!';
    }
  });

  // required params → fallback key when one is missing (checked AFTER derived params are filled in)
  var NEEDS = {
    'say.pick': ['color'], 'say.paint.part': ['part', 'color'], 'say.paint.shape': ['shape'], 'say.paint.spot': ['spot'],
    'say.paint.animal': ['animal'], 'say.paint.label': ['label'], 'say.paint.parity': ['num', 'parity'],
    'say.paint.initial': ['letter', 'word'], 'say.paint.sum': ['expr', 'ans'],
    'wrong.color': ['got', 'want'], 'wrong.part': ['got', 'want'], 'wrong.math': ['got'], 'wrong.parity': ['num', 'parity'],
    'wrong.initial': ['word', 'first'], 'needPaint': ['color'], 'notThis': ['part'],
    'talk.colors': ['color'], 'talk.shapes': ['shape'], 'talk.size': ['size', 'animal'], 'talk.sizeOne': ['size'],
    'talk.count': ['spot'], 'talk.animals': ['animal'], 'talk.letters': ['letter'], 'talk.lower': ['letter'],
    'talk.initial': ['word'], 'talk.add': ['a', 'b'], 'talk.sub': ['a', 'b'], 'talk.oddeven': ['parity'],
    'talk.wrong': ['answer'], 'talk.wrong.a': ['answer'], 'talk.wrong.animal': ['answer'], 'talk.wrong.size': ['answer'],
    'alive.swim.thing': ['thing'], 'alive.scuttle.thing': ['thing'], 'alive.sail.thing': ['thing'], 'alive.bob.thing': ['thing'],
    'alive.float.thing': ['thing'],
    'talk.wrong.letter': ['letter'], 'talk.wrong.small': ['letter'], 'talk.wrong.number': ['answer']
  };
  Object.keys(PROMPTS).forEach(function (k) { NEEDS[k] = PROMPTS[k]; });
  var FALLBACK = { 'say.pick': 'say.pick.any', 'needPaint': 'needPaint.any', 'notThis': 'notThis.any',
    'talk.colors': 'talk.colorsAny', 'talk.shapes': 'talk.shapesAny', 'talk.size': 'talk.sizeOne', 'talk.sizeOne': 'talk.sizeAny',
    'talk.count': 'talk.countAny', 'talk.animals': 'talk.animalsAny', 'talk.letters': 'talk.lettersAny',
    'talk.lower': 'talk.lowerAny', 'talk.initial': 'talk.initialAny', 'talk.add': 'talk.calc', 'talk.sub': 'talk.calc',
    'talk.oddeven': 'talk.oddevenAny', 'p.shapes5': 'p.shapes', 'p.tapPart': 'notThis.any' };
  Object.keys(NEEDS).forEach(function (k) {
    if (FALLBACK[k]) return;
    if (/^p\./.test(k)) FALLBACK[k] = 'p.any';
    else if (/^say\.paint\./.test(k)) FALLBACK[k] = 'say.paint.any';
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
  function exprAnswer(value) {
    var p = splitOp(value);
    if (!p) return null;
    return p[1] === '+' ? +p[0] + +p[2] : +p[0] - +p[2];
  }
  function isLetter(s) { return typeof s === 'string' && /^\p{L}$/u.test(s); }
  function low(v) { var r = rawVal(v); return String(r == null ? '' : r).toLowerCase(); }
  function keyOfVal(v) { return low(v).replace(/\.svg$/, '').replace(/[\s\-]+/g, '_'); }

  function animalOf(v) {
    if (v && typeof v === 'object') v = v.animal != null ? v.animal : rawVal(v);
    if (v == null) return null;
    var s = String(v).toLowerCase().replace(/\.svg$/, '').replace(/^animal_/, '');
    return SEA_ANIMALS.indexOf(s) >= 0 ? s : null;
  }
  function sizeOf(v) {
    var s = low(v);
    if (/(^|[_:\-\s])(big|large)($|[_:\-\s])/.test(s)) return 'big';
    if (/(^|[_:\-\s])(small|little)($|[_:\-\s])/.test(s)) return 'small';
    return null;
  }
  function partOf(v) {
    var s = keyOfVal(v);
    if (NAMES.en.part[s] != null) return s;
    var t = s.replace(/_/g, '');
    if (NAMES.en.part[t] != null) return t;
    return null;
  }
  function spotOf(v) { var s = keyOfVal(v).replace(/s$/, ''); return NAMES.en.spot[s] != null ? s : (s === 'starfishe' ? 'starfish' : null); }
  function spotName(lang, s, n) {
    if (!s) return GENERIC_SPOT[lang][n === 1 ? 0 : 1];
    if (lang === 'vi') return NAMES.vi.spot[s];
    return n != null && n !== 1 ? SPOT_PLURAL[s] : NAMES.en.spot[s];
  }

  // ---- words for the 'initial' topic: tolerant of whatever shape content.js gives SP.WORDS
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
    var src = SP.WORDS, list = [];
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
  function initialOf(lang, animalOrWord) {
    var w = wordName(lang, animalOrWord);
    if (!w) return null;
    var e = findEntry(lang, animalOrWord) || findEntry(lang, w);
    var f = e && e.initial ? e.initial : stripMarks(w).charAt(0).toUpperCase();
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
      case 'part': {
        var p = partOf(value);
        return p ? NAMES[lang].part[p] : String(value == null ? '' : value).replace(/_/g, ' ');
      }
      case 'spot': {
        var sp = spotOf(value), cn = opts.n != null ? num(opts.n) : null;
        if (!sp) return String(value == null ? '' : value).replace(/_/g, ' ');
        return spotName(lang, sp, cn);
      }
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
  // size}; {kind:'animal', animal}; {kind:'number'|'dots', n}; {kind:'letter', text}; {nameKind, nameValue}; {id, thing, value}
  function kvOf(t) {
    t = obj(t);
    if (t.thing && typeof t.thing === 'object') return kvOf(t.thing);
    if (t.nameKind != null) return [t.nameKind, t.nameValue];
    switch (t.kind) {
      case 'blob': case 'color': return ['color', t.color != null ? t.color : t.value];
      case 'shape': return ['shape', t.shape != null ? t.shape : t.value];
      case 'size': return ['size', t.size != null ? t.size : t.value];
      case 'animal': return ['animal', t.animal != null ? t.animal : t.value];
      case 'number': case 'dots': return ['number', t.n != null ? t.n : t.value];
      case 'letter': return ['letter', t.text != null ? t.text : t.value];
      case 'parity': return ['parity', t.value];
      case 'text': return ['text', t.text != null ? t.text : t.value];
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
      case 'part': {
        var pt = partOf(value);
        if (!pt) return addForms(out, [String(value).replace(/_/g, ' ')]);
        var pn = NAMES[lang].part[pt], forms = [pn];
        if (lang === 'vi') forms.push(pn.replace(/^(cái|mấy cái|mấy|đôi|con|phần|chiếc|lá|ô|viên|bông|cây|ngọn|tảng|ông|đám|bãi) /, ''));
        return addForms(out, forms);
      }
      case 'spot': {
        var sp = spotOf(value);
        if (!sp) return addForms(out, [String(value)]);
        var sl = [NAMES[lang].spot[sp]];
        if (lang === 'en') sl.push(SPOT_PLURAL[sp]);
        return addForms(out, sl.concat(WORDS[lang].spot[sp] || []));
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
    return { k: t.nameKind != null ? t.nameKind : t.kind, v: t.nameValue != null ? t.nameValue : t.value,
      size: t.size, animal: t.animal, text: t.text };
  }
  function phraseOf(lang, th) {
    var vi = lang === 'vi', k = th.k, v = th.v, out = '';
    switch (k) {
      case 'color': case 'hue': out = name(lang, 'color', v); break;
      case 'shape': out = vi ? name(lang, 'shape', v) : 'the ' + name(lang, 'shape', v); break;
      case 'animal': case 'word':
        out = vi ? name(lang, 'animal', v, { size: th.size }) : 'the ' + name(lang, 'animal', v, { size: th.size }); break;
      case 'size': {
        var a = animalOf(th.animal);
        if (a) out = vi ? name(lang, 'animal', a, { size: v }) : 'the ' + name(lang, 'animal', a, { size: v });
        else out = vi ? 'con ' + name(lang, 'size', v) : 'the ' + name(lang, 'size', v) + ' one';
        break;
      }
      case 'part': out = vi ? name(lang, 'part', v) : 'the ' + name(lang, 'part', v); break;
      case 'spot': out = vi ? name(lang, 'spot', v) : 'the ' + name(lang, 'spot', v); break;
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

  // ---------------------------------------------------------------- t()
  var I18N = { langs: LANGS.slice(), child: '' };

  function derive(lang, params, key) {
    var p = {}, k;
    if (params && typeof params === 'object') for (k in params) if (Object.prototype.hasOwnProperty.call(params, k)) p[k] = params[k];
    key = key || '';
    // {hue} = bare colour (vi "đỏ")
    if (!present(p.hue) && present(p.color)) p.hue = name(lang, 'hue', rawVal(p.color));
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
    // {num} from n
    var c = present(p.n) ? num(p.n) : null;
    if (!present(p.num) && c != null) p.num = numberName(lang, c);
    if (present(p.n) && typeof p.n === 'object') p.n = c != null ? c : '';
    // {spot}: plural-aware with n (talk questions always plural); a generic "spots" when only a count is known
    var sn = /^talk\./.test(key) ? 2 : (c != null ? c : 2);
    if (present(p.spot)) {
      var sid = spotOf(rawVal(p.spot));
      p.spot = sid ? spotName(lang, sid, sn) : String(rawVal(p.spot)).replace(/_/g, ' ');
    } else if (c != null && /^p\.count/.test(key)) p.spot = spotName(lang, null, sn);
    // {size} + {animal} stay separate (lines order them); {got}/{want}/{label}/{answer} objects → phrases
    ['got', 'want', 'label'].forEach(function (q) {
      if (p[q] && typeof p[q] === 'object') p[q] = present(p[q]) ? phraseOf(lang, thingOf(p[q])) : '';
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
      case 'color': case 'shape': case 'size': case 'animal': case 'parity': case 'part':
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
  I18N.SEA_ANIMALS = SEA_ANIMALS.slice();
  I18N.SPOTS = SPOTS.slice();
  I18N.PART_NAMES = Object.keys(PARTS);
  I18N.NAME_KINDS = NAME_KINDS.slice();
  I18N.PROMPTS = PROMPTS;
  I18N.PARAMS = NEEDS;
  I18N.NAME_TABLE = NAMES;
  I18N.LETTER_VI = LETTER_VI;
  I18N.WORD_LIST = WORD_LIST;
  I18N.MAX_COUNT = MAX_COUNT;

  // ---------------------------------------------------------------- game lines
  // what a world event says about the part it touched: ev.part (a pic part {role, nameKind, nameValue, size, text}) or
  // the event's own fields
  function partInfo(ev) {
    ev = obj(ev);
    var p = obj(ev.part && typeof ev.part === 'object' ? ev.part : ev);
    return { role: p.role || ev.role || null, k: p.nameKind != null ? p.nameKind : ev.nameKind,
      v: p.nameValue != null ? p.nameValue : ev.nameValue, size: p.size != null ? p.size : ev.size, text: p.text };
  }

  // `pick {color}` → "Blue!" / "Màu xanh dương!"
  I18N.sayPick = function (lang, ev, rng) {
    ev = obj(ev);
    return I18N.t(lang, 'say.pick', { color: ev.color != null ? ev.color : (ev.nameKind === 'color' ? ev.nameValue : null) }, rng);
  };

  // `paint {partId, color, count?}` (+ part info) → names what was painted. Count steps → just the count word so a fast
  // child hears "One! Two! Three!". ev.topic (main adds it) picks the initial / oddeven / add lines.
  I18N.sayPaint = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var cnt = obj(ev.count);
    if (num(cnt.i) != null && num(cnt.i) >= 0) return I18N.sayCount(lang, num(cnt.i));
    var pi = partInfo(ev), color = ev.color, topic = ev.topic;
    var role = pi.role || ({ part: 'part', shape: 'shape', spot: 'spot', animal: 'animal' }[pi.k]) ||
      (pi.k === 'letter' || pi.k === 'number' || pi.k === 'text' || pi.k === 'sum' || pi.k === 'diff' || pi.k === 'parity' ? 'label' : null);
    switch (role) {
      case 'part': return I18N.t(lang, 'say.paint.part', { part: pi.v, color: color }, rng);
      case 'shape': return I18N.t(lang, 'say.paint.shape', { shape: pi.v, color: color }, rng);
      case 'spot': return I18N.t(lang, 'say.paint.spot', { spot: pi.v || 'bubble', n: 1, color: color }, rng);
      case 'animal': {
        if (topic === 'initial' && animalOf(pi.v)) {
          var ini = initialOf(lang, animalOf(pi.v));
          return I18N.t(lang, 'say.paint.initial', { letter: ini.first, word: ini.word }, rng);
        }
        return I18N.t(lang, 'say.paint.animal', { animal: name(lang, 'animal', pi.v, { size: pi.size }), color: color }, rng);
      }
      case 'label': {
        var n = num(pi.v != null ? pi.v : pi.text);
        if (topic === 'oddeven' && n != null) return I18N.t(lang, 'say.paint.parity', { n: n, parity: n % 2 ? 'odd' : 'even' }, rng);
        if ((topic === 'add' || topic === 'sub') && n != null) {
          var pr = obj(ev.params), a = num(pr.a), b = num(pr.b);
          if (a != null && b != null) return I18N.t(lang, 'say.paint.sum', { expr: a + (topic === 'add' ? '+' : '−') + b, ans: numberName(lang, n) }, rng);
          return I18N.t(lang, 'say.paint.label', { label: numberName(lang, n) }, rng);
        }
        if (n != null) return I18N.t(lang, 'say.paint.label', { label: numberName(lang, n) }, rng);
        return I18N.t(lang, 'say.paint.label', { label: phraseOf(lang, { k: pi.k || 'text', v: pi.v != null ? pi.v : pi.text }) }, rng);
      }
    }
    return I18N.t(lang, 'say.paint.any', null, rng);
  };

  // `wrong {kind:'color'|'part', got:{nameKind,nameValue,size?}, want:{…}}` → names what was tapped, then the goal.
  // Maths never names the right answer; parity says what the tapped number is; initial says the word's first letter.
  I18N.sayWrong = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var got = thingOf(ev.got), want = thingOf(ev.want), topic = ev.topic;
    if (ev.kind === 'color' || got.k === 'color' || want.k === 'color') {
      return I18N.t(lang, 'wrong.color', { got: got.v != null ? { kind: 'color', value: got.v } : null,
        want: want.v != null ? { kind: 'color', value: want.v } : null }, rng);
    }
    var gotTx = got.v != null ? got.v : got.text, gn = num(gotTx);
    if (topic === 'add' || topic === 'sub' || want.k === 'sum' || want.k === 'diff' || (want.k === 'text' && splitOp(want.v))) {
      return I18N.t(lang, 'wrong.math', { got: gotTx != null ? (gn != null ? phraseOf(lang, { k: 'number', v: gn }) : phraseOf(lang, got)) : null }, rng);
    }
    if ((topic === 'oddeven' || want.k === 'parity') && gn != null)
      return I18N.t(lang, 'wrong.parity', { n: gn, parity: gn % 2 ? 'odd' : 'even' }, rng);
    if (topic === 'initial' && animalOf(got.v)) {
      var ini = initialOf(lang, animalOf(got.v));
      return I18N.t(lang, 'wrong.initial', { word: capFirst(ini.word), first: ini.first }, rng);
    }
    if (got.k && got.v != null && want.k && want.v != null) {
      // size rounds: the same animal twice — name it by size
      if (got.k === 'animal' && want.k === 'animal' && got.v === want.v && !(got.size && want.size)) return I18N.t(lang, 'wrong.any', null, rng);
      return I18N.t(lang, 'wrong.part', { got: phraseOf(lang, got), want: phraseOf(lang, want) }, rng);
    }
    return I18N.t(lang, 'wrong.any', null, rng);
  };

  // `needPaint` (main passes the step colour) / `notThis {partId}` (main passes the glowing target part)
  I18N.sayNeedPaint = function (lang, ev, rng) { ev = obj(ev); return I18N.t(lang, 'needPaint', { color: ev.color != null ? ev.color : ev.want }, rng); };
  I18N.sayNotThis = function (lang, ev, rng) {
    ev = obj(ev);
    var tp = ev.target && typeof ev.target === 'object' ? partInfo({ part: ev.target }) : partInfo(ev);
    var v = tp.k === 'part' || !tp.k ? tp.v : null;
    return I18N.t(lang, 'notThis', { part: v }, rng);
  };
  // the finished picture, as a child would call it ("the boat", "con thuyền"): template id → [en, vi]
  var THINGS = {
    fish: ['fish', 'con cá'], crab: ['crab', 'con cua'], sailboat: ['boat', 'con thuyền'], jellyfish: ['jellyfish', 'con sứa'],
    whale: ['whale', 'con cá voi'], octopus: ['octopus', 'con bạch tuộc'], submarine: ['submarine', 'thuyền ngầm'],
    seahorse: ['seahorse', 'con cá ngựa'], snail: ['snail', 'con ốc sên'], starfish: ['starfish', 'con sao biển'],
    lighthouse: ['lighthouse', 'ngọn hải đăng'], dolphin: ['dolphin', 'con cá heo'], sub_windows: ['submarine', 'thuyền ngầm'],
    sandcastle: ['sandcastle', 'lâu đài cát'], rock_wall: ['rock wall', 'bức tường đá'], flag_boat: ['boat', 'con thuyền'],
    whale_bubbles: ['whale', 'con cá voi'], fish_pearls: ['fish', 'con cá'], octopus_bubbles: ['octopus', 'con bạch tuộc'],
    chest_pearls: ['treasure chest', 'cái rương báu'], rock_starfish: ['starfish', 'con sao biển'], reef: ['picture', 'bức tranh'],
    kelp: ['picture', 'bức tranh'], rocks: ['picture', 'bức tranh'], fish_bubbles: ['fish', 'con cá'],
    buoy_balloons: ['buoy', 'cái phao'], whale_spout: ['whale', 'con cá voi'], lagoon: ['picture', 'bức tranh'],
    jelly_lanterns: ['jellyfish', 'con sứa']
  };
  I18N.THINGS = THINGS;
  I18N.thingName = function (lang, templateId) { var t = THINGS[templateId]; return t ? t[L(lang) === 'vi' ? 1 : 0] : ''; };
  // sayAlive(lang, kind) or sayAlive(lang, {kind, templateId?, thing?}): names the picture when it is known
  I18N.sayAlive = function (lang, kind, rng) {
    var thing = '';
    if (kind && typeof kind === 'object') { thing = kind.thing || I18N.thingName(lang, kind.templateId); kind = kind.kind; }
    var k = 'alive.' + kind;
    if (!STR.en[k]) k = 'alive.swim';
    if (thing && STR.en[k + '.thing']) return I18N.t(lang, k + '.thing', { thing: thing }, rng);
    return I18N.t(lang, k, null, rng);
  };

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
    if (kind === 'shape' || kind === 'spot') return I18N.t(lang, lang === 'en' ? 'talk.wrong.a' : 'talk.wrong', ans);
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
      s = s.replace(/(^|[\s!?.,])([A-Z]) is for\b/g, function (m, pre, ch) { return pre + LETTER_SPEECH_EN[ch] + ' is for'; });
      s = s.replace(/\bstarts with ([A-Z])\b/g, function (m, ch) { return 'starts with ' + LETTER_SPEECH_EN[ch]; });
      s = s.replace(/\bListen: ([A-Z])!/g, function (m, ch) { return 'Listen: ' + LETTER_SPEECH_EN[ch] + '!'; });
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 plus $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 minus $2')
        .replace(/\s=\s/g, ' equals ');
    } else {
      s = s.replace(RE_VI_LETTER, function (m, w, ch) { return w + ' ' + (LETTER_VI[ch.toUpperCase()] || ch.toLowerCase()); });
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 cộng $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 trừ $2')
        .replace(/\s=\s/g, ' bằng ');
      // Vietnamese voices read the Latin "Nini" as one clipped syllable; "Ni Ni" sounds like the name
      s = s.replace(/\bNini\b/g, 'Ni Ni');
    }
    return s.replace(/\s{2,}/g, ' ').trim();
  };

  SP.I18N = I18N;
})(window.SP = window.SP || {});
