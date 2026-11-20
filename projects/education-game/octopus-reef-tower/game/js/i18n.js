/* Pip's Reef Tower — RT.I18N (English + Vietnamese). Pip, a cheerful little octopus, stacks shell blocks up to the
 * golden starfish under the sea (DESIGN §6). "Pip" is written and spoken "Pip" in both languages (VI "bạch tuộc Pip").
 *
 *   RT.I18N.t(lang, key, params, rng?)     → string (variants picked with rng.next()/rng()/Math.random)
 *   RT.I18N.name(lang, kind, value)        → display + spoken name ("red"/"màu đỏ", 7 → "seven"/"bảy",
 *                                            crab → "crab"/"con cua", dots 3 → "three pearls"/"ba viên ngọc")
 *   RT.I18N.sound(lang, animalOrClue)      → the CLUE phrase for an animal / a clue id (DESIGN §5.1: RT.ANIMAL_SOUND holds
 *                                            clue ids claws|shell|spout|tail): crab / 'claws' → "has big claws" /
 *                                            "có đôi càng to"; '' for fish / dolphin / jellyfish / shrimp.  hasSound(x)
 *   RT.I18N.clue(lang, animalOrClue)       → the SHORT clue ("big claws" / "đôi càng to") used after a right answer
 *   RT.I18N.words(lang, kind, value)       → accepted spoken forms for speech recognition (lower-case, + no-diacritic forms)
 *   RT.I18N.speech(lang, text)             → text tuned for TTS (letter names, + − =, "fffff").
 *
 *   Tower lines. Every function copes with a missing / partial event and never returns '' or "{x}":
 *   RT.I18N.sayStack(lang, ev, rng)        → `stack`: SHORT: "Red! Plonk!"; from the 2nd block on (ev.n ≥ 2) names the
 *                                            block AND counts the tower: "Red! Two blocks tall!" / "Màu đỏ! Tháp cao hai
 *                                            tầng rồi!" (numbers / sums / clue / initial / lower asks stay without it)
 *   RT.I18N.sayWrong(lang, ev, rng)        → `wrong`: "Bloop! That’s blue. Find red!" / "Tưng! Khối màu xanh dương.
 *                                            Tìm màu đỏ nhé!" — names what bounced, repeats the goal, never negative
 *   RT.I18N.sayTowerDone(lang, n, rng)     → `towerDone`: "One, two, three, four! We reached the starfish!" /
 *                                            "Một, hai, ba, bốn! Tới bạn sao biển rồi!"
 *   RT.I18N.sayTap(lang, ev, rng)          → `tapPiece` / `grab`: just the name — "Blue!", "Three pearls!", "Con cua!"
 *   RT.I18N.sayCount(lang, i)              → `count {i}` (block i glows, pearl i lights): "One!" … (= t('count.' + i))
 *   RT.I18N.phrase(lang, kind, value, block) → "the blue block" / "khối màu xanh dương"
 *   RT.I18N.talkWrong(lang, kind, value)   → gentle "it's X" line for a missed Talk-time answer
 *   RT.I18N.setChild(name)                 → default {child} for every t() call
 *   RT.I18N.langs = ['en', 'vi'];  has(lang, key);  keys(lang);  raw(lang, key);  PARAMS (required params per key)
 *   Aliases: sayFound / sayGo / sayCorrect (= sayStack), sayGrab / sayFlip (= sayTap), sayMismatch (= sayWrong).
 *   Text-key aliases kept for older main.js code (same text as the new key): monkey = crown, bloom = sprinkles,
 *   candles = pearls, candlesOut = pearlsOut, surprise.butterfly = surprise.puffer, butterfly.land = puffer,
 *   butterfly.tap = puffer.tap; ui.tapLulu = ui.tapPip.
 *
 * Event fields (all optional; main adds topic / promptKey / params of the current ask):
 *   stack  { n (tower height), nameKind, nameValue, block?, topic, promptKey, params }
 *   wrong  { nameKind, nameValue, want:{kind, value}, block?, topic, promptKey, params, streak }
 *   tap    { nameKind, nameValue, block? }
 *   block = { kind, value, color?, shape?, n?, text?, animal?, size?, word?, initial?, nameKind, nameValue }
 *
 * Name kinds: color, shape, size, animal, number, dots, stars, letter, text, sum, diff, parity, word.
 * Params: values may be RAW ({animal:'crab'}, {color:'red'}) — keys named like a name kind (color, shape, size, animal,
 * parity) are named automatically; an object {kind, value} is always replaced by name(lang, kind, value).
 * Derived params: {sound} (the clue phrase) + {clue} (short clue) from sound = clue id | animal id, or from animal;
 * {letter}/{lower} from letter|text, {word} from word|animal, {expr} from expr|text|sum|diff|a,b(,op), {dotWord}
 * ("pearl"/"pearls", vi "viên ngọc"), {starWord} and {num} from n.
 * Keys with required params (PARAMS) fall back to a generic key when a param is missing (never "the !" on screen);
 * an unknown prompt key `p.<x>` falls back to `p.any`; `p.sound` for an animal without a clue (fish…) → `p.animals`.
 * {child}: if the child's name is empty, variants containing {child} are skipped; if every variant has it, {child}
 * becomes "friend" / "bé". Missing params are removed.
 *
 * Vietnamese letter names follow the kindergarten/grade-1 PHONICS convention ("đọc theo âm"):
 * B → "bờ", C → "cờ", K → "ca", Q → "quờ", Y → "i dài", Ă → "á", Â → "ớ" … (see LETTER_VI and docs/VOICE.md).
 */
(function (RT) {
  'use strict';

  var LANGS = ['en', 'vi'];
  var ANIMALS = ['fish', 'crab', 'turtle', 'whale', 'seahorse', 'dolphin', 'jellyfish', 'shrimp'];   // sea animals (DESIGN §5.1)

  // ---------------------------------------------------------------- names
  // Vietnamese animal names carry their classifier ("con cua"), as a kindergarten teacher says them.
  var NAMES = {
    en: {
      color: { red: 'red', blue: 'blue', yellow: 'yellow', green: 'green', orange: 'orange', purple: 'purple', pink: 'pink',
        brown: 'brown', white: 'white', cream: 'white' },
      shape: { circle: 'circle', square: 'square', triangle: 'triangle', star: 'star', heart: 'heart', rect: 'rectangle',
        rectangle: 'rectangle', oval: 'oval', diamond: 'diamond' },
      size: { big: 'big', small: 'small', little: 'small' },
      animal: { fish: 'fish', crab: 'crab', turtle: 'turtle', whale: 'whale', seahorse: 'seahorse', dolphin: 'dolphin',
        jellyfish: 'jellyfish', shrimp: 'shrimp' },
      parity: { odd: 'odd', even: 'even' }
    },
    vi: {
      color: { red: 'màu đỏ', blue: 'màu xanh dương', yellow: 'màu vàng', green: 'màu xanh lá', orange: 'màu cam',
        purple: 'màu tím', pink: 'màu hồng', brown: 'màu nâu', white: 'màu trắng', cream: 'màu trắng' },
      shape: { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', star: 'hình ngôi sao',
        heart: 'hình trái tim', rect: 'hình chữ nhật', rectangle: 'hình chữ nhật', oval: 'hình bầu dục',
        diamond: 'hình thoi' },
      size: { big: 'to', small: 'nhỏ', little: 'nhỏ' },
      animal: { fish: 'con cá', crab: 'con cua', turtle: 'con rùa', whale: 'con cá voi', seahorse: 'con cá ngựa',
        dolphin: 'con cá heo', jellyfish: 'con sứa', shrimp: 'con tôm' },
      parity: { odd: 'lẻ', even: 'chẵn' }
    }
  };
  // CLUES (DESIGN §5.1 / §6): RT.ANIMAL_SOUND now holds a clue id per animal ("Who has big claws?"); a null clue is
  // never asked. SOUNDS = the clue phrase used in the question ("Who {sound}?" / "Bạn nào {sound} nhỉ?"), CLUE_SHORT =
  // the short form said after the right block landed ("The crab! Big claws!"). The phrase never names the animal.
  var CLUE_OF = { crab: 'claws', turtle: 'shell', whale: 'spout', seahorse: 'tail' };
  var CLUE_IDS = ['claws', 'shell', 'spout', 'tail'];
  var SOUNDS = {
    en: { claws: 'has big claws', shell: 'carries a shell on its back', spout: 'sprays water up high',
      tail: 'has a curly tail' },
    vi: { claws: 'có đôi càng to', shell: 'cõng mai trên lưng', spout: 'phun nước lên cao', tail: 'có đuôi xoăn' }
  };
  var CLUE_SHORT = {
    en: { claws: 'big claws', shell: 'a hard shell', spout: 'whoosh, a water spout', tail: 'a curly tail' },
    vi: { claws: 'đôi càng to', shell: 'chiếc mai cứng', spout: 'phun nước lên cao', tail: 'chiếc đuôi xoăn' }
  };
  // Count tokens: glowing PEARL dots on the shell blocks; stars only for the star count of a Talk-time picture / the score.
  var DOT = { en: ['pearl', 'pearls'], vi: ['viên ngọc', 'viên ngọc'] };   // vi "ba viên ngọc" (short; "ngọc trai" also accepted)
  var STAR = { en: ['star', 'stars'], vi: ['ngôi sao', 'ngôi sao'] };
  var LAYER = { en: 'block', vi: 'khối' };

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

  // English letter names for TTS ("letter B" → "letter bee")
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
    // not in the Vietnamese alphabet, but give them a friendly name anyway
    'F': 'ép', 'J': 'gi', 'W': 'vê kép', 'Z': 'dét' };
  // alphabet names ("bê, xê, dê…") that parents also use — accepted when listening
  var LETTER_WORDS_VI = { 'A': ['a'], 'Ă': ['á', 'ắ'], 'Â': ['ớ', 'â'], 'B': ['bê', 'bơ', 'bở'], 'C': ['xê', 'cơ', 'cở'],
    'D': ['dê', 'dơ'], 'Đ': ['đê', 'đơ'], 'E': ['e', 'é'], 'Ê': ['ê'], 'G': ['giê', 'gơ', 'gở'], 'H': ['hát', 'hắt', 'hơ'],
    'I': ['i', 'i ngắn'], 'K': ['ca', 'ka'], 'L': ['e lờ', 'lơ'], 'M': ['em mờ', 'mơ'], 'N': ['en nờ', 'nơ'], 'O': ['o'],
    'Ô': ['ô'], 'Ơ': ['ơ'], 'P': ['pê', 'pơ'], 'Q': ['quy', 'cu', 'quơ'], 'R': ['e rờ', 'rơ'], 'S': ['ét xì', 'sơ'],
    'T': ['tê', 'tơ'], 'U': ['u'], 'Ư': ['ư'], 'V': ['vê', 'vơ'], 'X': ['ích xì', 'xơ'], 'Y': ['i dài', 'i cờ rét'],
    'F': ['ép'], 'J': ['gi'], 'W': ['vê kép'], 'Z': ['dét'] };

  // extra accepted spoken forms per kind/value (names are always accepted automatically).
  // No form is shared by two animals. "cá" (fish) is a prefix of "cá voi" / "cá ngựa" / "cá heo": the matcher prefers
  // the LONGER form, and every "chú / bạn / con cá X" variant is listed so "chú cá heo" never lands on the fish.
  // The animal's clue is accepted too (a 3-year-old often answers "big claws!" / "đôi càng!").
  var WORDS = {
    en: {
      color: { red: ['red', 'read', 'reds'], blue: ['blue', 'blew', 'blues'], yellow: ['yellow', 'yello'],
        green: ['green', 'greens'], orange: ['orange', 'oranges'], purple: ['purple', 'violet', 'pupple'],
        pink: ['pink', 'pinks', 'pinky'], brown: ['brown'], white: ['white'], cream: ['white', 'cream'] },
      shape: { circle: ['circle', 'round', 'ring', 'circles', 'ball'], square: ['square', 'box', 'squares'],
        triangle: ['triangle', 'try angle', 'triangles'], star: ['star', 'stars'], heart: ['heart', 'hearts', 'hart', 'love'],
        rect: ['rectangle', 'rectangles', 'long box'], rectangle: ['rectangle', 'rectangles'], oval: ['oval', 'egg', 'ovals'],
        diamond: ['diamond', 'kite', 'diamonds'] },
      size: { big: ['big', 'large', 'huge', 'bigger', 'giant'], small: ['small', 'little', 'tiny', 'smaller', 'baby'],
        little: ['small', 'little', 'tiny', 'smaller', 'baby'] },
      animal: {
        fish: ['fish', 'fishy', 'fishes', 'little fish', 'fishie'],
        crab: ['crab', 'crabs', 'crabby', 'big claws', 'claws', 'pinchy'],
        turtle: ['turtle', 'turtles', 'sea turtle', 'tortoise', 'turtle shell'],
        whale: ['whale', 'whales', 'big whale', 'baby whale', 'water spout'],
        seahorse: ['seahorse', 'sea horse', 'seahorses', 'sea horses', 'horse', 'curly tail'],
        dolphin: ['dolphin', 'dolphins', 'dolphy', 'porpoise'],
        jellyfish: ['jellyfish', 'jelly fish', 'jelly', 'jellies', 'jellyfishes'],
        shrimp: ['shrimp', 'shrimps', 'shrimpy', 'prawn', 'prawns'] },
      parity: { odd: ['odd', 'odds'], even: ['even', 'evens'] }
    },
    vi: {
      color: { red: ['đỏ', 'màu đỏ'], blue: ['xanh dương', 'xanh da trời', 'xanh nước biển', 'xanh lam', 'da trời', 'dương'],
        yellow: ['vàng', 'màu vàng'], green: ['xanh lá', 'xanh lá cây', 'xanh lục', 'lá cây'], orange: ['cam', 'màu cam'],
        purple: ['tím', 'màu tím'], pink: ['hồng', 'màu hồng', 'hồng hồng'], brown: ['nâu', 'màu nâu'],
        white: ['trắng', 'màu trắng'], cream: ['trắng', 'màu trắng'] },
      shape: { circle: ['hình tròn', 'tròn'], square: ['hình vuông', 'vuông'], triangle: ['tam giác', 'hình tam giác'],
        star: ['ngôi sao', 'sao', 'hình ngôi sao', 'hình sao'], heart: ['trái tim', 'tim', 'hình trái tim', 'hình tim'],
        rect: ['chữ nhật', 'hình chữ nhật'], rectangle: ['chữ nhật', 'hình chữ nhật'], oval: ['bầu dục', 'hình bầu dục'],
        diamond: ['hình thoi', 'thoi'] },
      size: { big: ['to', 'lớn', 'bự', 'to lắm', 'to hơn', 'khối to', 'khối lớn'],
        small: ['nhỏ', 'bé', 'nhỏ xíu', 'nhỏ hơn', 'tí hon', 'khối nhỏ', 'khối bé'],
        little: ['nhỏ', 'bé', 'nhỏ xíu', 'nhỏ hơn', 'tí hon', 'khối nhỏ', 'khối bé'] },
      animal: {
        fish: ['con cá', 'cá', 'cá con', 'chú cá', 'bạn cá', 'chú cá nhỏ'],
        crab: ['con cua', 'cua', 'cua con', 'chú cua', 'bạn cua', 'cua biển', 'đôi càng', 'càng to'],
        turtle: ['con rùa', 'rùa', 'rùa con', 'chú rùa', 'bạn rùa', 'rùa biển', 'con rùa biển', 'mai rùa'],
        whale: ['con cá voi', 'cá voi', 'cá voi con', 'chú cá voi', 'bạn cá voi', 'phun nước'],
        seahorse: ['con cá ngựa', 'cá ngựa', 'cá ngựa con', 'chú cá ngựa', 'bạn cá ngựa', 'ngựa biển', 'đuôi xoăn'],
        dolphin: ['con cá heo', 'cá heo', 'cá heo con', 'chú cá heo', 'bạn cá heo'],
        jellyfish: ['con sứa', 'sứa', 'sứa con', 'chú sứa', 'bạn sứa', 'sứa biển'],
        shrimp: ['con tôm', 'tôm', 'tôm con', 'chú tôm', 'bạn tôm', 'con tép'] },
      parity: { odd: ['lẻ', 'số lẻ', 'lẽ', 'lẹ'], even: ['chẵn', 'số chẵn', 'chặn', 'chắn'] }
    }
  };

  // Default RT.WORDS (DESIGN §5.1) — sea-animal words for the 'initial' topic. content.js loads later and may replace
  // it (any shape: {en:[{word, initial, sprite|animal|id}], vi:[…]}; name(lang,'word',x) copes with whatever ids it uses).
  // vi: many words start with C (cá, cua, cá voi…) — content.js keeps initials unique inside one choice set.
  var WORD_LIST = {
    en: [['fish', 'fish', 'F'], ['crab', 'crab', 'C'], ['turtle', 'turtle', 'T'], ['whale', 'whale', 'W'],
      ['seahorse', 'seahorse', 'S'], ['dolphin', 'dolphin', 'D'], ['jellyfish', 'jellyfish', 'J'], ['shrimp', 'shrimp', 'S']],
    vi: [['cá', 'fish', 'C'], ['cua', 'crab', 'C'], ['rùa', 'turtle', 'R'], ['cá voi', 'whale', 'C'],
      ['cá ngựa', 'seahorse', 'C'], ['cá heo', 'dolphin', 'C'], ['sứa', 'jellyfish', 'S'], ['tôm', 'shrimp', 'T']]
  };
  function defaultEntries(lang) {
    return WORD_LIST[lang].map(function (w) {
      return { id: w[1], word: w[0], sprite: 'animal_' + w[1], animal: w[1], initial: w[2] };
    });
  }
  if (!RT.WORDS) {
    RT.WORDS = {};
    LANGS.forEach(function (l) { RT.WORDS[l] = defaultEntries(l); });
  }

  // ---------------------------------------------------------------- strings
  var TOPICS = ['colors', 'size', 'shapes', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
  var NAME_KINDS = ['color', 'shape', 'size', 'animal', 'number', 'dots', 'stars', 'letter', 'text', 'sum', 'diff', 'parity', 'word'];
  // prompt keys content.js can ask for (DESIGN §5.1) and their required params
  var PROMPTS = {
    'p.colors': ['color'], 'p.shapes': ['shape'], 'p.countUp': ['n'], 'p.count': ['n'], 'p.animals': ['animal'],
    'p.sound': ['sound'], 'p.size': ['size'], 'p.letters': ['letter'], 'p.lower': ['letter'], 'p.initial': ['letter'],
    'p.add': ['expr'], 'p.sub': ['expr'], 'p.oddeven': ['parity']
  };
  var MAX_COUNT = 12;

  var STR = {
    en: {
      'ui.title': 'Pip’s Reef Tower',
      'ui.logo1': 'Pip’s',
      'ui.logo2': 'Reef Tower',
      'ui.subtitle': 'Tap, stack and learn under the sea with Pip!',
      'ui.tagline': 'Tap, stack and learn under the sea with Pip!',
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
      'ui.voice': 'Pip’s voice',
      'ui.mic': 'Answer by voice',
      'ui.done': 'Done',
      'ui.stars': 'Stars',
      'ui.chapter': 'Chapter {n}',
      'ui.allDone': 'All done! {stars} stars',
      'ui.welcome': ['Hi {child}! I am Pip the little octopus. Let’s build a reef tower!',
        'Hi! I am Pip the little octopus. Let’s build a reef tower!'],
      'ui.micUnsupported': 'Voice answers are not available here. Tap the pictures!',
      'ui.micDenied': 'The microphone is off. Tap the pictures instead!',
      'ui.voiceMissing': 'Tip for parents: add a voice in Settings › Accessibility › Spoken Content › Voices.',
      'ui.tapOrSay': 'Tap or say the answer!',
      'ui.listening': 'Pip is listening…',
      'ui.tapPip': 'Tap Pip to hear it again',
      'ui.dragHint': 'Tap a block to send it up to the tower',
      'ui.skip': 'Skip',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Colour Shells',
      'topic.size': 'Big and Small',
      'topic.shapes': 'Shape Shells',
      'topic.count': 'Counting Pearls',
      'topic.animals': 'Sea Friends',
      'topic.letters': 'Letter Shells',
      'topic.lower': 'Big and Small Letters',
      'topic.initial': 'First Letters',
      'topic.add': 'Adding Up',
      'topic.sub': 'Take Away',
      'topic.oddeven': 'Odd and Even',

      'weather.0': 'Sunny day under the sea!',
      'weather.1': 'Whoosh, a sea current! Hold on, tower!',
      'weather.2': 'Pitter-patter, rain on the waves!',
      'weather.3': 'Look, a rainbow above the waves!',

      'deal': ['Let’s build a tower up to the starfish!', 'New tower! Up to the starfish!',
        'Let’s stack shells up to the starfish!'],

      'p.any': ['Tap a block to stack it!', 'Send a block up to the tower!', 'Pick a block and tap it!'],
      'p.colors': ['Find the {color} block!', 'Tap the {color} block!', 'Where is the {color} block? Tap it!'],
      'p.shapes': ['Put the {shape} block on top!', 'Tap the {shape} block!', 'Which block has a {shape}? Tap it!'],
      'p.countUp': ['Count up! Block number {n}!', 'Count up! Now tap number {n}!', 'Let’s count up! Find number {n}!'],
      'p.count': ['Find the block with {n} {dotWord}!', 'Tap the block with {n} {dotWord}!',
        'Count the pearls! Which block has {n}?'],
      'p.animals': ['Find the {animal} block!', 'Where is the {animal}? Tap it!', 'Tap the {animal} block!'],
      'p.sound': ['Who {sound}? Find that block!', 'Hmm! Who {sound}? Tap that block!', 'Which sea friend {sound}? Find it!'],
      'p.size': ['Find the {size} block!', 'Tap the {size} block!', 'Which block is {size}? Tap it!'],
      'p.letters': ['Find the letter {letter}!', 'Tap the letter {letter} block!', 'Where is the letter {letter}? Tap it!'],
      'p.lower': ['Big letter {letter}! Find its small letter!', 'Tap the small letter {lower}!',
        'Where is small letter {lower}? Tap it!'],
      'p.initial': ['Which one starts with the letter {letter}? Tap it!', 'Find a sea friend that starts with the letter {letter}!',
        'The letter {letter}! Which block starts with it?'],
      'p.add': ['What is {expr}? Tap the answer!', '{expr} makes how many? Find that block!', 'Add them up! {expr}!'],
      'p.sub': ['What is {expr}? Tap the answer!', 'Take away! {expr} leaves how many?', '{expr}… how many are left?'],
      'p.oddeven': ['Find a {parity} number!', 'Tap a {parity} number!', 'Which number is {parity}? Tap it!'],

      'stack.name': ['{it}! Plonk!', '{it}! Yes!', 'Yes, {it}!'],
      'stack.tall': ['{it}! {tall} blocks tall!', 'Yes, {it}! {tall} blocks tall!'],
      'stack.animal': ['{it}! Splash!', 'Yes, the {animal}!'],
      'stack.sound': ['The {animal}! {clue}!', 'Yes, the {animal}! {clue}!'],
      'stack.math': ['{expr} is {ans}!', 'Yes! {expr} is {ans}!'],
      'stack.oddeven': ['{ans} is {parity}!', 'Yes, {ans} is {parity}!'],
      'stack.initial': ['{letter} is for {word}!', 'Yes! {letter} is for {word}!'],
      'stack.lower': ['Small {lower}! Plonk!', 'Yes, small {lower}!'],
      'towerDone.count': ['{count}! We reached the starfish!', '{count}! Up to the starfish!'],

      'wrong.it': ['Bloop! That’s {it}.', 'Boing! That’s {it}.'],
      'wrong.oddeven': ['Bloop! {ans} is {parity}.', 'Boing! {ans} is {parity}.'],
      'wrong.initialIt': ['Bloop! {first} is for {word}.', 'Boing! {first} is for {word}.'],
      'wrong.find': ['Find {want}!', 'Let’s find {want}!'],
      'wrong.sound': ['Who {sound}?', 'Now, who {sound}?'],
      'wrong.math': ['What is {expr}?', 'Count again: {expr}!'],
      'wrong.initial': ['Find letter {letter}!', 'Now find letter {letter}!'],
      'wrong.lower': ['Find small {lower}!', 'Now find small {lower}!'],
      'wrong.parity': ['Find a {parity} one!', 'Now find a {parity} one!'],
      'wrong': ['Bloop! Let’s try another block!', 'Boing! Hmm, let’s look again!', 'So close! One more try!',
        'Let’s think again!', 'Keep going, you can do it!', 'Bloop! Try a different block!'],
      'stillDrag': ['Let go over the tower!', 'Up over the tower, then let go!', 'Let go, or just tap the block!'],
      'miss': ['Tap the block to send it up!', 'Let go above the tower!', 'Just tap a block, it floats up!',
        'Bring it up to the tower!', 'Up, up, over the tower, then let go!'],

      'towerDone': ['We reached the starfish!', 'Hooray! Up to the starfish!', 'So tall! What a reef tower!'],
      'crown': ['Plop! The starfish is on top!', 'Hooray! A starfish on top!'],
      'pearls': ['Pearls! Let’s count them!', 'Look, pearls! Count with me!'],
      'blow': ['Bubbles… fffff!', 'Big breath… fffff!'],
      'pearlsOut': ['Pop, pop! Up go the pearls!', 'Wheee! Bubbles everywhere!'],
      'sprinkles': ['Look, a fish parade!', 'Swish! The fish say hooray!'],
      'clear': ['Bye-bye, tower! Float away!', 'Up, up! Off they float!'],

      'surprise.breeze': ['A sea current is coming!', 'Feel the current? Hold on, tower!'],
      'gust': ['Whoa, a current! I’ve got it!', 'Whoosh! Pip holds the tower!'],
      'surprise.puffer': ['Look! A puffer fish is coming!', 'Here comes a little puffer fish!'],
      'puffer': ['A puffer fish is visiting our tower!', 'Hello, puffer fish! Tap it!'],
      'puffer.tap': ['Puff! Look how round! Bye-bye, puffer fish!', 'Puff! So round! Bye-bye, puffer fish!'],

      'praise': ['Yes!', 'Great job!', 'You got it!', 'Super!', 'Wonderful!', 'Nice one!', 'Hooray!', 'Well done!'],
      'great': ['Great building, {child}!', 'You did it, {child}!', 'What a tall tower!', 'Wow, {child}, super builder!',
        'Hooray! Tower done!', 'You are so clever!', 'Super reef builder!'],
      'party': ['Rainbow party time!', 'Hooray! A party under the sea!'],
      'hint': ['Psst! Look at the glowing block!', 'Watch the little hand!', 'Pip will help! Tap this one!',
        'The shiny block! Tap it!', 'Look, this one is sparkling!'],
      'idle': ['Tap a block to send it up!', 'Pip is waiting! Your turn!', 'Pick a block and tap it!',
        'I am here, {child}! Let’s build!', 'Up, up! Let’s make the tower tall!', 'Which block goes on top?'],

      'talk.intro': 'Talk time! Pip has a question.',
      'talk.colors': 'What colour is this?',
      'talk.size': 'Is it big or small?',
      'talk.shapes': 'What shape is this?',
      'talk.count': 'How many pearls?',
      'talk.animals': 'Where is the {animal}?',
      'talk.animalsAny': 'Which sea animal is this?',
      'talk.sound': 'Who {sound}?',
      'talk.letters': 'Which letter is this?',
      'talk.lower': 'Which letter is this?',
      'talk.initial': 'Which letter does it start with?',
      'talk.add': 'What is the answer?',
      'talk.sub': 'What is the answer?',
      'talk.oddeven': 'Is it odd or even?',
      'talk.right': ['Yes! You are right!', 'Correct! Hooray!', 'Wow, you know it!', 'That is it! Super!',
        'Clever you!', 'Yes, {child}! Great answer!'],
      'talk.wrong': 'It is {answer}! Good try!',
      'talk.wrong.a': 'It is a {answer}! Good try!',
      'talk.wrong.animal': 'It is the {answer}! Good try!',
      'talk.wrong.size': 'It is {answer}! Good try!',
      'talk.wrong.letter': 'It is the letter {letter}! Good try!',
      'talk.wrong.small': 'It is small letter {letter}! Good try!',
      'talk.wrong.number': 'It is {answer}! Good try!',

      'session.done': ['What a builder! {stars} stars! Hooray!', 'Amazing, {child}! {stars} stars!',
        'So many towers! {stars} stars!']
    },
    vi: {
      'ui.title': 'Tháp San Hô của Pip',
      'ui.logo1': 'Bạch Tuộc Pip',
      'ui.logo2': 'Tháp San Hô',
      'ui.subtitle': 'Cùng bạch tuộc Pip chạm, xếp tháp và học nhé!',
      'ui.tagline': 'Cùng bạch tuộc Pip chạm, xếp tháp và học nhé!',
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
      'ui.voice': 'Giọng của Pip',
      'ui.mic': 'Trả lời bằng giọng nói',
      'ui.done': 'Xong',
      'ui.stars': 'Ngôi sao',
      'ui.chapter': 'Chương {n}',
      'ui.allDone': 'Hoàn thành! {stars} ngôi sao',
      'ui.welcome': ['Chào bé {child}! Mình là bạch tuộc Pip. Mình cùng xây tháp san hô nhé!',
        'Chào bé! Mình là bạch tuộc Pip. Mình cùng xây tháp san hô nhé!'],
      'ui.micUnsupported': 'Máy này chưa nghe được giọng nói. Bé chạm vào hình nhé!',
      'ui.micDenied': 'Micrô đang tắt. Bé chạm vào hình nhé!',
      'ui.voiceMissing': 'Mẹo cho bố mẹ: thêm giọng tiếng Việt trong Cài đặt › Trợ năng › Nội dung được đọc › Giọng nói.',
      'ui.tapOrSay': 'Bé chạm hoặc nói đáp án nhé!',
      'ui.listening': 'Pip đang nghe…',
      'ui.tapPip': 'Chạm vào Pip để nghe lại nhé',
      'ui.dragHint': 'Bé chạm vào khối để gửi lên tháp nhé',
      'ui.skip': 'Bỏ qua',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Vỏ sò sắc màu',
      'topic.size': 'To và nhỏ',
      'topic.shapes': 'Hình trên vỏ sò',
      'topic.count': 'Đếm ngọc trai',
      'topic.animals': 'Bạn nhỏ dưới biển',
      'topic.letters': 'Chữ cái trên vỏ sò',
      'topic.lower': 'Chữ hoa, chữ thường',
      'topic.initial': 'Chữ cái đầu tiên',
      'topic.add': 'Phép cộng',
      'topic.sub': 'Phép trừ',
      'topic.oddeven': 'Số chẵn, số lẻ',

      'weather.0': 'Dưới biển nắng đẹp quá!',
      'weather.1': 'Vù vù, có dòng nước chảy! Tháp ơi, đứng vững nhé!',
      'weather.2': 'Tí tách, mưa rơi trên sóng biển!',
      'weather.3': 'Nhìn kìa, cầu vồng trên mặt biển!',

      'deal': ['Mình xây tháp lên tới bạn sao biển nhé!', 'Tháp mới nào! Xếp lên tới bạn sao biển nhé!',
        'Bé ơi, mình xếp khối vỏ sò thật cao nào!'],

      'p.any': ['Bé chạm vào một khối nhé!', 'Bé gửi một khối lên tháp nào!', 'Bé chọn một khối rồi chạm vào nhé!'],
      'p.colors': ['Bé ơi, tìm khối {color} nhé!', 'Bé chạm vào khối {color} nào!', 'Khối {color} đâu nhỉ? Bé chạm vào nhé!'],
      'p.shapes': ['Bé ơi, đặt khối có {shape} lên trên nhé!', 'Bé chạm vào khối có {shape} nào!',
        'Khối nào có {shape}? Bé chạm vào nhé!'],
      'p.countUp': ['Đếm lên nào! Bé tìm khối số {n} nhé!', 'Đếm lên nào! Giờ bé chạm số {n} nhé!',
        'Mình đếm lên nhé! Khối số {n} nào!'],
      'p.count': ['Bé tìm khối có {n} {dotWord} nhé!', 'Bé chạm vào khối có {n} {dotWord} nào!',
        'Bé đếm ngọc trai nhé! Khối nào có {n} viên?'],
      'p.animals': ['Bé ơi, tìm khối có {animal} nhé!', '{animal} đâu rồi? Bé chạm vào nhé!',
        'Bé chạm vào khối hình {animal} nào!'],
      'p.sound': ['Bé ơi, bạn nào {sound} nhỉ?', 'Đố bé, bạn nào {sound}? Bé tìm nhé!',
        'Ai {sound} thế nhỉ? Bé chạm vào nhé!'],
      'p.size': ['Bé ơi, tìm khối {size} nhé!', 'Bé chạm vào khối {size} nào!', 'Khối nào {size} nhỉ? Bé chạm vào nhé!'],
      'p.letters': ['Bé ơi, tìm khối chữ {letter} nhé!', 'Bé chạm vào khối có chữ {letter} nào!',
        'Chữ {letter} đâu nhỉ? Bé chạm vào nhé!'],
      'p.lower': ['Chữ {letter} in hoa! Bé tìm chữ thường của nó nhé!', 'Bé chạm vào chữ {lower} viết thường nhé!',
        'Chữ {lower} viết thường đâu nhỉ? Bé chạm vào nhé!'],
      'p.initial': ['Bạn nào bắt đầu bằng chữ {letter}? Bé chạm nhé!', 'Bé tìm khối bắt đầu bằng chữ {letter} nào!',
        'Chữ {letter}! Khối nào bắt đầu bằng chữ này?'],
      'p.add': ['{expr} bằng mấy? Bé chạm vào đáp số nhé!', 'Bé cộng nhé: {expr} bằng mấy?', '{expr} là bao nhiêu nhỉ? Bé tìm nào!'],
      'p.sub': ['{expr} bằng mấy? Bé chạm vào đáp số nhé!', 'Bé bớt đi nhé: {expr} còn mấy?', '{expr} còn lại bao nhiêu nhỉ?'],
      'p.oddeven': ['Bé ơi, tìm số {parity} nhé!', 'Bé chạm vào một số {parity} nào!', 'Số nào là số {parity} nhỉ? Bé chạm nhé!'],

      'stack.name': ['{it}! Bụp!', '{it}! Đúng rồi!', 'Đúng rồi, {it}!'],
      'stack.tall': ['{it}! Tháp cao {tall} tầng rồi!', '{it}! Cao {tall} tầng rồi!'],
      'stack.animal': ['{it}! Tõm!', 'Đúng rồi, {animal}!'],
      'stack.sound': ['{animal}! {clue}!', 'Đúng rồi, {animal}! {clue}!'],
      'stack.math': ['{expr} bằng {ans}!', 'Đúng rồi! {expr} bằng {ans}!'],
      'stack.oddeven': ['{ans} là số {parity}!', 'Đúng rồi, {ans} là số {parity}!'],
      'stack.initial': ['Chữ {letter}, {word}!', 'Đúng rồi! Chữ {letter}, {word}!'],
      'stack.lower': ['Chữ {lower} thường! Bụp!', 'Đúng rồi, chữ {lower} thường!'],
      'towerDone.count': ['{count}! Tới bạn sao biển rồi!', '{count}! Chạm tới sao biển rồi!'],

      'wrong.it': ['Tưng! {it}.', 'Tưng tưng! {it}.'],
      'wrong.oddeven': ['Tưng! {ans} là số {parity}.', 'Tưng tưng! {ans} là số {parity}.'],
      'wrong.initialIt': ['Tưng! {word}, chữ {first}.', 'Tưng tưng! {word}, chữ {first}.'],
      'wrong.find': ['Tìm {want} nhé!', 'Bé tìm {want} nhé!'],
      'wrong.sound': ['Bạn nào {sound} nhỉ?', 'Ai {sound} nhỉ?'],
      'wrong.math': ['{expr} bằng mấy?', 'Bé đếm lại nhé: {expr}!'],
      'wrong.initial': ['Tìm chữ {letter} nhé!', 'Bé tìm chữ {letter} nhé!'],
      'wrong.lower': ['Tìm chữ {lower} thường nhé!', 'Bé tìm chữ {lower} thường nhé!'],
      'wrong.parity': ['Tìm số {parity} nhé!', 'Bé tìm số {parity} nhé!'],
      'wrong': ['Tưng! Mình thử khối khác nhé!', 'Tưng! Mình tìm lại nào!', 'Suýt nữa thôi! Thử tiếp nhé!',
        'Bé nghĩ thêm chút nữa nhé!', 'Cố lên, bé làm được mà!', 'Bật ra rồi! Bé thử khối khác nào!'],
      'stillDrag': ['Bé thả khối lên trên tháp nhé!', 'Bé kéo lên trên tháp rồi thả nhé!', 'Bé thả tay ra, hoặc chạm vào khối nhé!'],
      'miss': ['Bé chạm vào khối để gửi lên nhé!', 'Thả tay ở trên tháp nhé!', 'Bé chỉ cần chạm, khối sẽ nổi lên!',
        'Bé đưa khối lên tháp nào!', 'Kéo lên, lên nữa, rồi thả nhé!'],

      'towerDone': ['Mình chạm tới bạn sao biển rồi!', 'Hoan hô! Tháp cao tới sao biển rồi!', 'Cao quá! Tháp san hô đẹp quá!'],
      'crown': ['Bụp! Bạn sao biển lên đỉnh rồi!', 'Oa! Sao biển ngồi trên đỉnh tháp!'],
      'pearls': ['Ngọc trai nè! Mình cùng đếm nhé!', 'Nhìn kìa, ngọc trai! Bé đếm với Pip nhé!'],
      'blow': ['Thổi bong bóng nào… phù!', 'Hít thật sâu… phù phù!'],
      'pearlsOut': ['Bụp bụp! Ngọc trai bay lên rồi!', 'Oa! Bong bóng khắp nơi!'],
      'sprinkles': ['Nhìn kìa, đàn cá bơi vòng vòng!', 'Đàn cá vui quá! Hoan hô!'],
      'clear': ['Tạm biệt tháp! Bay lên nào!', 'Lên, lên! Các khối nổi đi rồi!'],

      'surprise.breeze': ['Có dòng nước chảy tới đó!', 'Có dòng nước kìa! Tháp ơi, đứng vững nhé!'],
      'gust': ['Ui, dòng nước mạnh! Pip giữ tháp nè!', 'Vù vù! Pip đỡ tháp rồi!'],
      'surprise.puffer': ['Nhìn kìa! Bạn cá nóc bơi tới!', 'Có bạn cá nóc nhỏ ghé chơi nè!'],
      'puffer': ['Bạn cá nóc ghé thăm tháp rồi!', 'Chào bạn cá nóc! Bé chạm thử nhé!'],
      'puffer.tap': ['Phồng! Tròn xoe luôn! Tạm biệt cá nóc!', 'Phồng lên rồi! Tạm biệt bạn cá nóc!'],

      'praise': ['Đúng rồi!', 'Giỏi quá!', 'Tuyệt vời!', 'Hoan hô!', 'Bé giỏi lắm!', 'Chính xác!', 'Siêu quá!', 'Hay lắm!'],
      'great': ['Bé {child} xây tháp giỏi quá!', 'Hoan hô bé {child}!', 'Tháp cao quá!', 'Oa, bé {child} giỏi quá!',
        'Hoan hô, xong một tháp rồi!', 'Bé thông minh quá!', 'Bé là thợ xây tí hon!'],
      'party': ['Tiệc cầu vồng nào!', 'Hoan hô! Tiệc dưới đáy biển!'],
      'hint': ['Nhìn nè! Khối này đang sáng lên.', 'Bé xem bàn tay nhỏ chỉ nè!', 'Pip giúp bé nhé! Chạm khối này nào!',
        'Khối lấp lánh đó! Bé chạm vào nhé!', 'Nhìn kìa, khối này lấp lánh!'],
      'idle': ['Bé ơi, chạm vào một khối nào!', 'Pip đang chờ bé nè!', 'Bé chọn một khối rồi chạm nhé!',
        'Bé {child} ơi, mình xây tháp tiếp nhé!', 'Lên nào, lên nào! Xây tháp thật cao nhé!', 'Khối nào lên trên nhỉ?'],

      'talk.intro': 'Giờ trò chuyện! Pip hỏi bé nhé.',
      'talk.colors': 'Cái này màu gì nhỉ?',
      'talk.size': 'Cái này to hay nhỏ nhỉ?',
      'talk.shapes': 'Cái này hình gì nhỉ?',
      'talk.count': 'Có mấy viên ngọc trai nào?',
      'talk.animals': '{animal} đâu rồi nhỉ?',
      'talk.animalsAny': 'Đây là con gì nhỉ?',
      'talk.sound': 'Bạn nào {sound} nhỉ?',
      'talk.letters': 'Đây là chữ gì nào?',
      'talk.lower': 'Đây là chữ gì nào?',
      'talk.initial': 'Hình này bắt đầu bằng chữ gì nhỉ?',
      'talk.add': 'Kết quả là bao nhiêu nào?',
      'talk.sub': 'Kết quả là bao nhiêu nào?',
      'talk.oddeven': 'Số này chẵn hay lẻ nhỉ?',
      'talk.right': ['Đúng rồi! Bé giỏi quá!', 'Chính xác! Hoan hô!', 'Oa, bé biết rồi!', 'Đúng luôn! Siêu quá!',
        'Bé thông minh quá!', 'Đúng rồi, bé {child} ơi!'],
      'talk.wrong': 'Là {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.a': 'Là {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.animal': 'Là {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.size': 'Cái này {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.letter': 'Là chữ {letter} đó! Bé cố gắng lắm!',
      'talk.wrong.small': 'Là chữ {letter} thường đó! Bé cố gắng lắm!',
      'talk.wrong.number': 'Là số {answer} đó! Bé cố gắng lắm!',

      'session.done': ['Bé xây tháp giỏi quá! {stars} ngôi sao!', 'Bé {child} giỏi quá! {stars} ngôi sao!',
        'Bao nhiêu là tháp! {stars} ngôi sao!']
    }
  };
  // aliases for older main.js event / UI keys (same text as the new key — DESIGN §6: no cake words anywhere)
  var ALIAS = { 'monkey': 'crown', 'bloom': 'sprinkles', 'candles': 'pearls', 'candlesOut': 'pearlsOut',
    'surprise.butterfly': 'surprise.puffer', 'butterfly.land': 'puffer', 'butterfly.tap': 'puffer.tap', 'ui.tapLulu': 'ui.tapPip' };
  LANGS.forEach(function (l) { Object.keys(ALIAS).forEach(function (k) { STR[l][k] = STR[l][ALIAS[k]]; }); });
  // count.1 … count.12: "One!" / "Một!" (the count-up glow when the tower is done)
  LANGS.forEach(function (l) {
    for (var i = 1; i <= MAX_COUNT; i++) {
      var w = NUM[l][i];
      STR[l]['count.' + i] = w.charAt(0).toUpperCase() + w.slice(1) + '!';
    }
  });

  // required params → fallback key when one is missing (checked AFTER derived params are filled in)
  var NEEDS = {
    'talk.animals': ['animal'], 'talk.sound': ['sound'],
    'stack.name': ['it'], 'stack.tall': ['it', 'tall'], 'stack.animal': ['it', 'animal'], 'stack.sound': ['animal', 'clue'],
    'stack.math': ['expr', 'ans'], 'stack.oddeven': ['ans', 'parity'], 'stack.initial': ['word', 'letter'],
    'stack.lower': ['lower'], 'towerDone.count': ['count'],
    'wrong.it': ['it'], 'wrong.oddeven': ['ans', 'parity'], 'wrong.find': ['want'], 'wrong.sound': ['sound'],
    'wrong.math': ['expr'], 'wrong.initial': ['letter'], 'wrong.initialIt': ['word', 'first'], 'wrong.lower': ['lower'],
    'wrong.parity': ['parity'],
    'talk.wrong': ['answer'], 'talk.wrong.a': ['answer'], 'talk.wrong.animal': ['answer'],
    'talk.wrong.letter': ['letter'], 'talk.wrong.small': ['letter'], 'talk.wrong.number': ['answer'], 'talk.wrong.size': ['answer']
  };
  Object.keys(PROMPTS).forEach(function (k) { NEEDS[k] = PROMPTS[k]; });
  var FALLBACK = { 'talk.animals': 'talk.animalsAny', 'talk.sound': 'talk.animalsAny', 'towerDone.count': 'towerDone',
    'p.sound': 'p.animals', 'stack.sound': 'stack.animal', 'stack.animal': 'stack.name', 'stack.tall': 'stack.name' };
  Object.keys(PROMPTS).forEach(function (k) { if (!FALLBACK[k]) FALLBACK[k] = 'p.any'; });
  ['stack.name', 'stack.math', 'stack.oddeven', 'stack.initial', 'stack.lower'].forEach(function (k) { FALLBACK[k] = 'praise'; });
  ['wrong.it', 'wrong.initialIt', 'wrong.oddeven', 'wrong.find', 'wrong.sound', 'wrong.math', 'wrong.initial', 'wrong.lower', 'wrong.parity',
    'talk.wrong', 'talk.wrong.a', 'talk.wrong.animal', 'talk.wrong.letter', 'talk.wrong.small', 'talk.wrong.number', 'talk.wrong.size']
    .forEach(function (k) { FALLBACK[k] = 'wrong'; });

  var CHILD_FALLBACK = { en: 'friend', vi: 'bé' };
  // keys whose {child} variant is always used when a name is known
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
  function rawVal(v) { return (v && typeof v === 'object' && 'value' in v) ? v.value : v; }
  function present(v) { return v != null && v !== '' && !(typeof v === 'object' && 'value' in v && (v.value == null || v.value === '')); }
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
    if (v >= 0 && v <= 20) return NUM[lang === 'vi' ? 'vi' : 'en'][v];
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
  function dotWord(lang, n) { return DOT[lang][n === 1 ? 0 : 1]; }
  function starWord(lang, n) { return STAR[lang][n === 1 ? 0 : 1]; }
  function isLetter(s) { return typeof s === 'string' && /^\p{L}$/u.test(s); }

  function animalOf(v) {                  // 'cat' | 'animal_cat' | {kind:'animal', value:'cat'} → 'cat' | null
    if (v && typeof v === 'object') v = v.value != null ? v.value : v.animal != null ? v.animal : v.sprite;
    if (v == null) return null;
    var s = String(v).toLowerCase().replace(/^animal_/, '').replace(/_wave$/, '').replace(/\.svg$/, '');
    return ANIMALS.indexOf(s) >= 0 ? s : null;
  }
  function animalIn(v) {                   // finds an animal id inside 'cat_small', 'animal_cat', 'small:cat'
    var a = animalOf(v);
    if (a) return a;
    var s = String(rawVal(v) == null ? '' : rawVal(v)).toLowerCase();
    var parts = s.split(/[_:\-\s]+/);
    for (var i = 0; i < parts.length; i++) if (ANIMALS.indexOf(parts[i]) >= 0) return parts[i];
    return null;
  }
  // a clue id ('claws') or an animal ('crab', 'animal_crab', {value:'crab'}) → the clue id | null
  function clueIdOf(v) {
    v = rawVal(v);
    if (v && typeof v === 'object') v = v.animal != null ? v.animal : v.sprite;
    if (v == null || v === '') return null;
    var s = String(v).toLowerCase();
    if (CLUE_IDS.indexOf(s) >= 0) return s;
    var a = animalIn(s);
    return a && CLUE_OF[a] ? CLUE_OF[a] : null;
  }
  function soundOf(lang, a) { var c = clueIdOf(a); return c ? SOUNDS[L(lang)][c] : ''; }
  function clueOf(lang, a) { var c = clueIdOf(a); return c ? CLUE_SHORT[L(lang)][c] : ''; }
  function sizeOf(v) {                     // 'big' | 'small' | 'little' | 'red_small' → 'big'|'small'|null
    var s = String(rawVal(v) == null ? '' : rawVal(v)).toLowerCase();
    if (/(^|[_:\-\s])(big|large)($|[_:\-\s])/.test(s)) return 'big';
    if (/(^|[_:\-\s])(small|little)($|[_:\-\s])/.test(s)) return 'small';
    return null;
  }
  function bareAnimal(lang, a) { return NAMES[lang].animal[a].replace(/^con /, ''); }

  // ---- words for the 'initial' topic: tolerant of whatever shape content.js gives RT.WORDS
  function normEntry(e, lang) {
    if (e == null) return null;
    if (typeof e === 'string') return { word: e, id: e };
    if (typeof e !== 'object') return null;
    var w = e[lang], out = { id: e.id, sprite: e.sprite, animal: e.animal, initial: e.initial, word: e.word };
    if (typeof w === 'string') out.word = w;
    else if (w && typeof w === 'object') { out.word = w.word || w.text; if (w.initial) out.initial = w.initial; }
    if (out.initial && typeof out.initial === 'object') out.initial = out.initial[lang];
    if (out.word == null && e.text != null) out.word = e.text;
    if (out.word == null) return null;
    out.word = String(out.word);
    if (!out.animal) out.animal = animalOf(out.sprite) || animalOf(out.id) || null;
    return out;
  }
  function entries(lang) {
    var src = RT.WORDS, list = [];
    if (src && Array.isArray(src[lang])) list = src[lang];
    else if (Array.isArray(src)) list = src;
    var out = [];
    for (var i = 0; i < list.length; i++) { var e = normEntry(list[i], lang); if (e) out.push(e); }
    return out;
  }
  function keyOf(e) { return [e.id, e.sprite, e.animal].filter(function (x) { return x != null && x !== ''; }).map(String); }
  function entryMatch(e, s) {
    if (e.word === s) return true;
    var ks = keyOf(e);
    for (var i = 0; i < ks.length; i++) if (ks[i] === s) return true;
    return false;
  }
  function findEntry(lang, v) {            // the word entry for an id / word / sprite / animal, in THIS language
    if (v && typeof v === 'object') v = v.word != null ? v.word : v.value != null ? v.value : v.id;
    if (v == null || v === '') return null;
    var s = String(v), i, j, k;
    var pools = [entries(lang), defaultEntries(lang)];
    for (k = 0; k < pools.length; k++) for (i = 0; i < pools[k].length; i++) if (entryMatch(pools[k][i], s)) return pools[k][i];
    // an id / word from the other language → the same id in this one
    var other = lang === 'vi' ? 'en' : 'vi';
    var opools = [entries(other), defaultEntries(other)];
    for (k = 0; k < opools.length; k++) for (i = 0; i < opools[k].length; i++) {
      if (!entryMatch(opools[k][i], s)) continue;
      var ks = keyOf(opools[k][i]);
      for (var p = 0; p < pools.length; p++) for (j = 0; j < pools[p].length; j++) {
        var mine = keyOf(pools[p][j]);
        for (var q = 0; q < ks.length; q++) if (mine.indexOf(ks[q]) >= 0) return pools[p][j];
      }
    }
    var a = animalOf(s);
    if (a) {
      for (k = 0; k < pools.length; k++) for (i = 0; i < pools[k].length; i++) if (pools[k][i].animal === a) return pools[k][i];
    }
    return null;
  }
  function wordName(lang, v) {
    var e = findEntry(lang, v);
    if (e) return e.word;
    if (v && typeof v === 'object') v = v.word != null ? v.word : v.value;
    var a = animalOf(v);
    if (a) return bareAnimal(lang, a);
    return String(v == null ? '' : v).replace(/_/g, ' ');
  }

  function name(lang, kind, value) {
    lang = L(lang);
    if (value && typeof value === 'object' && 'value' in value) value = value.value;
    var tbl;
    switch (kind) {
      case 'number': return numberName(lang, value);
      case 'stars': case 'dots': {
        var n = num(value);
        return n == null ? String(value) : numberName(lang, n) + ' ' + (kind === 'dots' ? dotWord : starWord)(lang, n);
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
      case 'animal': {
        var a = animalIn(value);
        return a ? NAMES[lang].animal[a] : String(value);
      }
      case 'size': {
        var sz = sizeOf(value);
        return sz ? NAMES[lang].size[sz] : String(value);
      }
      case 'parity': {
        if (num(value) != null) return numberName(lang, num(value));
        tbl = NAMES[lang].parity;
        return tbl[value] != null ? tbl[value] : String(value);
      }
      default:
        tbl = NAMES[lang][kind];
        if (tbl && tbl[value] != null) return tbl[value];
        return String(value);
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
    // vi 0 = "không", which also means "no" → only accepted as the whole answer (see NUM_ALT '=không')
    if (v >= 0 && v <= 20 && !(lang === 'vi' && v === 0)) addForms(out, [NUM[lang][v]]);
    var alt = NUM_ALT[lang][v];
    if (alt) addForms(out, alt);
    return out;
  }

  function words(lang, kind, value) {
    lang = L(lang);
    if (value && typeof value === 'object' && 'value' in value) value = value.value;
    var out = [];
    switch (kind) {
      case 'number': return numberWords(lang, value);
      case 'stars': case 'dots': {
        var dn = num(value);
        out = numberWords(lang, value);
        if (dn != null) {
          addForms(out, [name(lang, kind, dn), dn + ' ' + (kind === 'dots' ? dotWord : starWord)(lang, dn)]);
          if (kind === 'dots') {               // "three dots" / "three pearls" / "ba chấm" / "ba viên ngọc" are fine too
            var nw = numberName(lang, dn);
            addForms(out, (lang === 'vi' ? ['chấm', 'hạt', 'viên', 'viên ngọc', 'ngọc trai', 'hạt ngọc', 'hạt ngọc trai']
              : ['dots', 'dot', 'spots', 'pearls', 'pearl', 'balls'])
              .map(function (x) { return nw + ' ' + x; }));
          }
        }
        return out;
      }
      case 'parity': {
        if (num(value) != null) return numberWords(lang, num(value));
        break;
      }
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
          // no stripped forms: Ă/Â≠A, Đ≠D, Ê≠E, Ô/Ơ≠O, Ư≠U (the matcher still tries a diacritic-free comparison,
          // but at a lower score than an exact match)
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
        addForms(out, [exprWords(lang, value), p[0] + ' ' + (p[1] === '+' ? (lang === 'vi' ? 'cộng' : 'plus') :
          (lang === 'vi' ? 'trừ' : 'minus')) + ' ' + p[2]]);
        return out;
      }
      case 'word': {
        var w = wordName(lang, value);
        var list = [w];
        var e = findEntry(lang, value);
        var a = (e && e.animal) || animalOf(value) || animalOf(w);
        if (a) list = list.concat([NAMES[lang].animal[a]], WORDS[lang].animal[a] || []);
        return addForms(out, list);
      }
      case 'animal': {
        var an = animalIn(value);
        if (!an) return addForms(out, [String(value)]);
        return addForms(out, [NAMES[lang].animal[an]].concat(WORDS[lang].animal[an] || []));
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

  // ---------------------------------------------------------------- t()
  var I18N = { langs: LANGS.slice(), child: '' };

  // Fill in the derived params ({animal}, {sound}, {letter}, {lower}, {word}, {expr}, {dotWord}, {starWord}, {num}).
  function derive(lang, params) {
    var p = {}, k;
    if (params && typeof params === 'object') for (k in params) if (Object.prototype.hasOwnProperty.call(params, k)) p[k] = params[k];
    // {sound} = the clue phrase, {clue} = the short clue. sound may be a clue id ('claws') or an animal id ('crab');
    // without it, the animal's own clue is used. An animal without a clue (fish…) leaves {sound} empty → fallback key.
    var cid = null;
    if (present(p.sound)) {
      var sv = rawVal(p.sound);
      cid = clueIdOf(sv);
      if (!present(p.animal) && animalOf(sv)) p.animal = animalOf(sv);
      if (!cid && animalOf(sv)) p.sound = '';                        // an animal without a clue
    }
    if (!present(p.animal) && present(p.sprite) && animalOf(rawVal(p.sprite))) p.animal = animalOf(rawVal(p.sprite));
    if (!cid && !present(p.sound) && present(p.animal)) cid = clueIdOf(animalIn(rawVal(p.animal)));
    if (cid) {
      p.sound = SOUNDS[lang][cid];
      if (!present(p.clue)) p.clue = CLUE_SHORT[lang][cid];
    } else if (present(p.sound)) p.sound = String(rawVal(p.sound));
    if (present(p.clue)) p.clue = String(rawVal(p.clue));
    // {letter} / {lower}
    if (!present(p.letter) && present(p.text) && isLetter(String(rawVal(p.text)))) p.letter = String(rawVal(p.text));
    if (present(p.letter)) {
      p.letter = String(rawVal(p.letter));
      if (!present(p.lower)) p.lower = p.letter.toLowerCase();
    }
    if (present(p.lower)) p.lower = String(rawVal(p.lower));
    // {word} (initial topic): word | animal | sprite
    if (present(p.word)) p.word = wordName(lang, rawVal(p.word));
    else {
      var src = present(p.sprite) ? rawVal(p.sprite) : present(p.animal) ? rawVal(p.animal) : null;
      if (src != null && animalIn(src)) p.word = wordName(lang, animalIn(src));
    }
    // {expr} ("2 + 3")
    if (!present(p.expr)) {
      var ex = present(p.text) && splitOp(rawVal(p.text)) ? rawVal(p.text) : present(p.sum) ? rawVal(p.sum) :
        present(p.diff) ? rawVal(p.diff) : null;
      if (ex == null && present(p.a) && present(p.b)) ex = rawVal(p.a) + (present(p.op) ? rawVal(p.op) : '+') + rawVal(p.b);
      if (ex != null) p.expr = exprText(ex);
    } else if (typeof p.expr !== 'string' || splitOp(p.expr)) p.expr = exprText(rawVal(p.expr));
    // {parity} may come as value
    if (!present(p.parity) && (rawVal(p.value) === 'odd' || rawVal(p.value) === 'even')) p.parity = rawVal(p.value);
    // {dotWord} / {starWord} + {num} from n
    var c = present(p.n) ? num(p.n) : null;
    if (!present(p.dotWord)) p.dotWord = dotWord(lang, c === 1 ? 1 : 2);
    if (!present(p.starWord)) p.starWord = starWord(lang, c === 1 ? 1 : 2);
    if (!present(p.num) && c != null) p.num = numberName(lang, c);
    if (present(p.n) && typeof p.n === 'object') p.n = c != null ? c : '';
    return p;
  }

  function resolveParam(lang, key, val) {
    if (!present(val)) return '';
    if (typeof val === 'object' && val.kind) return name(lang, val.kind, val.value);
    if (typeof val === 'object') return '';
    switch (key) {
      case 'color': case 'shape': case 'size': case 'animal': case 'parity':
        return name(lang, key, val);
      default: return String(val);
    }
  }

  // English "a oval" → "an oval", "a odd" → "an odd", but never the LETTER A. No regex look-behind (iOS < 16.4).
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
    out = out.replace(/\s+([,.!?…])/g, '$1').replace(/\s{2,}/g, ' ').replace(/,\s*([!?.])/g, '$1').trim();
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
    var p = derive(lang, params);
    if (STR[lang][key] == null && STR.en[key] == null && /^p\./.test(key)) key = 'p.any';
    for (var hop = 0; hop < 4 && !needsMet(key, p) && FALLBACK[key]; hop++) key = FALLBACK[key];
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
  I18N.sound = function (lang, animal) { return soundOf(lang, animal); };
  I18N.clue = function (lang, animal) { return clueOf(lang, animal); };
  I18N.hasSound = function (animal) { return !!clueIdOf(animal); };
  I18N.has = function (lang, key) { return STR[L(lang)][key] != null; };
  I18N.keys = function (lang) { return Object.keys(STR[L(lang)]); };
  I18N.raw = function (lang, key) { return STR[L(lang)][key]; };
  I18N.setChild = function (nm) { I18N.child = nm ? String(nm).trim().slice(0, 24) : ''; };
  I18N.wordEntry = function (lang, v) { return findEntry(L(lang), v); };
  I18N.TOPICS = TOPICS.slice();
  I18N.ANIMALS = ANIMALS.slice();
  I18N.NAME_KINDS = NAME_KINDS.slice();
  I18N.PROMPTS = PROMPTS;        // prompt keys + their required params (for tests / content)
  I18N.PARAMS = NEEDS;           // required params per key (for tests)
  I18N.NAME_TABLE = NAMES;       // read-only use (tests / UI)
  I18N.SOUNDS = SOUNDS;          // clue phrases per clue id
  I18N.CLUES = CLUE_SHORT;       // short clues per clue id
  I18N.CLUE_OF = CLUE_OF;        // animal → clue id (mirror of RT.ANIMAL_SOUND)
  I18N.LETTER_VI = LETTER_VI;
  I18N.WORD_LIST = WORD_LIST;
  I18N.MAX_COUNT = MAX_COUNT;

  // ---------------------------------------------------------------- shell blocks → meaning
  // sem = { k: 'color'|'shape'|'dots'|'stars'|'number'|'animal'|'size'|'letter'|'expr'|'word'|'parity'|null, … }
  function semOf(kind, value, blk, ctx) {
    blk = obj(blk); ctx = ctx || {};
    var lang = ctx.lang || 'en';
    if (value && typeof value === 'object' && 'value' in value) { if (kind == null) kind = value.kind; value = value.value; }
    if (kind == null) kind = blk.nameKind != null ? blk.nameKind : blk.kind;
    if (value == null || value === '') {
      value = blk.nameValue != null ? blk.nameValue : blk.value != null ? blk.value : blk.n != null ? blk.n :
        blk.text != null ? blk.text : null;
    }
    var topic = ctx.topic || null;
    var s = { k: null };
    switch (kind) {
      case 'color': {
        var col = NAMES.en.color[value] != null ? value : blk.color;
        if (col != null && NAMES.en.color[col] != null) s = { k: 'color', color: col };
        break;
      }
      case 'shape': {
        var sh = NAMES.en.shape[value] != null ? value : blk.shape;
        if (sh != null && NAMES.en.shape[sh] != null) {
          s = { k: 'shape', shape: sh };
          if (blk.color != null && NAMES.en.color[blk.color] != null) s.color = blk.color;
        }
        break;
      }
      case 'size': {
        var sz = sizeOf(value) || sizeOf(blk.size);
        if (sz) { s = { k: 'size', size: sz }; if (blk.color != null && NAMES.en.color[blk.color] != null) s.color = blk.color; }
        break;
      }
      case 'animal': {
        var an = animalIn(value) || animalIn(blk.animal) || animalIn(blk.sprite) || animalIn(blk.value);
        if (an) s = { k: 'animal', animal: an };
        break;
      }
      case 'stars': case 'dots': {
        var dn = num(value); if (dn == null) dn = num(blk.n);
        if (dn != null) s = { k: kind, n: dn };
        break;
      }
      case 'number': {
        var nn = num(value); if (nn == null) nn = num(blk.n); if (nn == null) nn = num(blk.text);
        if (nn != null) s = { k: 'number', n: nn };
        break;
      }
      case 'parity': {
        var pn = num(value); if (pn == null) pn = num(blk.n); if (pn == null) pn = num(blk.text);
        if (pn != null) s = { k: 'number', n: pn };
        else if (value === 'odd' || value === 'even') s = { k: 'parity', parity: value };
        break;
      }
      case 'letter': {
        var lt = isLetter(String(value)) ? String(value) : isLetter(String(blk.text)) ? String(blk.text) : null;
        if (lt) s = { k: 'letter', letter: lt, small: lt !== lt.toUpperCase() };
        break;
      }
      case 'sum': case 'diff': {
        var ex = splitOp(value) ? value : splitOp(blk.text) ? blk.text : null;
        if (ex != null) s = { k: 'expr', expr: String(ex) };
        else if (num(value) != null) s = { k: 'number', n: num(value) };
        break;
      }
      case 'text': {
        var tx = value != null ? String(value) : '';
        if (splitOp(tx)) s = { k: 'expr', expr: tx };
        else if (num(tx) != null) s = { k: 'number', n: num(tx) };
        else if (isLetter(tx)) return semOf('letter', tx, blk, ctx);
        else if (tx === 'odd' || tx === 'even') s = { k: 'parity', parity: tx };
        else if (animalIn(tx)) return semOf('animal', tx, blk, ctx);
        else if (tx) s = { k: 'word', word: wordName(lang, tx) };
        break;
      }
      case 'word': {
        var wv = value != null && value !== '' ? value : blk.word;
        if (wv != null && wv !== '' && typeof wv !== 'object') {
          var e = findEntry(lang, wv);
          s = { k: 'word', word: e ? e.word : wordName(lang, wv) };
          var wa = (e && e.animal) || animalOf(wv) || animalOf(blk.animal) || animalOf(blk.sprite);
          if (wa) s.animal = wa;
          if (e && e.initial) s.initial = e.initial;
        }
        break;
      }
      default: {
        if (value != null && value !== '' && typeof value !== 'object') {
          if (num(value) != null) s = { k: 'number', n: num(value) };
          else if (animalIn(value)) s = { k: 'animal', animal: animalIn(value) };
          else if (NAMES.en.color[value] != null) s = { k: 'color', color: value };
          else if (NAMES.en.shape[value] != null) s = { k: 'shape', shape: value };
          else if (splitOp(value)) s = { k: 'expr', expr: String(value) };
          else if (isLetter(String(value))) return semOf('letter', value, blk, ctx);
        }
      }
    }
    if (blk.word != null && s.k && !s.word) s.word = String(blk.word);
    if (blk.initial != null && s.k && !s.initial) s.initial = String(blk.initial);
    if ((s.k === 'number' || s.k === 'dots' || s.k === 'stars') && s.n != null &&
        (topic === 'oddeven' || kind === 'parity' || blk.parity === 'odd' || blk.parity === 'even'))
      s.parity = s.n % 2 ? 'odd' : 'even';
    return s;
  }

  // How a shell block is named. role 'tap' = a short exclamation ("Red", "Three pearls", "Con cua"),
  // 'it' / 'want' = full phrases ("the blue block" — I18N.phrase), 'bounced' / 'goal' = the SHORT forms of the wrong
  // line ("Bloop! That’s blue. Find red!" / "Tưng! Khối màu xanh dương. Tìm màu đỏ nhé!").
  // vi classifier for a block: "khối" ("khối màu đỏ", "khối có ba viên ngọc", "khối số năm").
  function shortOf(lang, s, role) {
    var vi = lang === 'vi', goal = role === 'goal', out = '';
    switch (s.k) {
      case 'color': out = vi ? (goal ? '' : LAYER.vi + ' ') + name(lang, 'color', s.color) : name(lang, 'color', s.color); break;
      case 'shape': out = vi ? (goal ? '' : LAYER.vi + ' ') + name(lang, 'shape', s.shape) : (goal ? 'the ' : 'a ') + name(lang, 'shape', s.shape); break;
      case 'size': out = vi ? LAYER.vi + ' ' + NAMES.vi.size[s.size] : 'the ' + NAMES.en.size[s.size] + ' one'; break;
      case 'dots': case 'stars': out = name(lang, s.k, s.n); break;
      case 'number': out = vi ? 'số ' + numberName(lang, s.n) : (goal ? 'number ' : '') + numberName(lang, s.n); break;
      case 'animal': out = vi ? NAMES.vi.animal[s.animal] : 'the ' + NAMES.en.animal[s.animal]; break;
      case 'letter':
        if (vi) out = 'chữ ' + s.letter + (s.small ? ' thường' : '');
        else out = (s.small ? 'small ' : 'letter ') + s.letter;
        break;
      case 'expr': out = exprText(s.expr); break;
      case 'word': out = String(s.word); break;
      case 'parity': out = vi ? 'số ' + name(lang, 'parity', s.parity) : name(lang, 'parity', s.parity); break;
    }
    return lang === 'en' ? anFix(out) : out;
  }
  function phraseOf(lang, s, role) {
    if (role === 'bounced' || role === 'goal') return shortOf(lang, s, role);
    var vi = lang === 'vi', out = '';
    var B = vi ? LAYER.vi + ' ' : '';
    switch (s.k) {
      case 'color':
        if (role === 'tap') out = name(lang, 'color', s.color);
        else out = vi ? B + name(lang, 'color', s.color) : 'the ' + name(lang, 'color', s.color) + ' block';
        break;
      case 'shape':
        if (role === 'tap') out = name(lang, 'shape', s.shape);
        else out = vi ? B + name(lang, 'shape', s.shape) : 'the ' + name(lang, 'shape', s.shape) + ' block';
        break;
      case 'size':
        out = vi ? B + NAMES.vi.size[s.size] : (role === 'tap' ? '' : 'the ') + NAMES.en.size[s.size] + ' block';
        break;
      case 'dots': case 'stars': {
        var cnt = name(lang, s.k, s.n);
        if (role === 'tap') out = cnt;
        else if (vi) out = LAYER.vi + ' có ' + cnt;
        else out = (role === 'want' ? '' : 'the block with ') + cnt;
        break;
      }
      case 'number':
        if (role === 'tap') out = vi ? 'số ' + numberName(lang, s.n) : numberName(lang, s.n);
        else out = vi ? (role === 'it' ? LAYER.vi + ' số ' : 'số ') + numberName(lang, s.n) : 'number ' + numberName(lang, s.n);
        break;
      case 'animal':
        if (vi) out = NAMES.vi.animal[s.animal];
        else out = (role === 'tap' ? '' : 'the ') + NAMES.en.animal[s.animal];
        break;
      case 'letter':
        if (vi) out = 'chữ ' + s.letter + (s.small ? ' thường' : '');
        else out = s.small ? 'small letter ' + s.letter : (role === 'tap' ? 'letter ' : 'the letter ') + s.letter;
        break;
      case 'expr': out = exprText(s.expr); break;
      case 'word': out = String(s.word); break;
      case 'parity':
        if (vi) out = 'số ' + name(lang, 'parity', s.parity);
        else out = (role === 'tap' ? '' : 'a ') + name(lang, 'parity', s.parity) + (role === 'tap' ? '' : ' number');
        break;
      default: out = '';
    }
    return lang === 'en' ? anFix(out) : out;
  }
  I18N.phrase = function (lang, kind, value, blk) {
    lang = L(lang);
    return phraseOf(lang, semOf(kind, value, blk, { lang: lang }), 'it');
  };

  function topicOf(ev) {
    var t = ev.topic, pk = String(ev.promptKey || '');
    if (!t && /^p\./.test(pk)) t = pk.slice(2).split('.')[0];
    if (t === 'sound' || t === 'countUp') t = t === 'sound' ? 'animals' : 'count';
    return t || null;
  }
  function blockOf(ev) { var b = ev.block != null ? ev.block : ev.token; return (b && typeof b === 'object') ? b : {}; }
  function semOfEvent(ev, lang) {
    var blk = blockOf(ev);
    return semOf(ev.nameKind != null ? ev.nameKind : null, ev.nameValue != null ? ev.nameValue : null, blk,
      { topic: topicOf(ev), lang: lang });
  }
  // the goal of the current ask, from ev.want or the prompt params
  function wantOf(ev, lang) {
    var w = obj(ev.want), p = obj(ev.params), topic = topicOf(ev), pk = String(ev.promptKey || '');
    var ctx = { topic: topic, lang: lang };
    if (w.kind != null || w.value != null) {
      var sw = semOf(w.kind, w.value, w.block || null, ctx);
      if (sw.k) return sw;
    }
    if (present(p.color) && pk !== 'p.size') return semOf('color', rawVal(p.color), null, ctx);
    if (present(p.shape)) return semOf('shape', rawVal(p.shape), null, ctx);
    if (present(p.size)) return semOf('size', rawVal(p.size), null, ctx);
    if (present(p.animal)) return semOf('animal', rawVal(p.animal), null, ctx);
    if (present(p.n)) return semOf(pk === 'p.count' ? 'dots' : 'number', rawVal(p.n), null, ctx);
    if (present(p.parity)) return { k: 'parity', parity: rawVal(p.parity) };
    if (present(p.letter)) {
      var L1 = String(rawVal(p.letter));
      if (pk === 'p.lower') return { k: 'letter', letter: present(p.lower) ? String(rawVal(p.lower)) : L1.toLowerCase(), small: true };
      return semOf('letter', L1, null, ctx);
    }
    return { k: null };
  }

  // initial topic: the word a block's sea animal stands for and its first letter ({word:'crab', first:'C'})
  function initialOf(lang, s) {
    var w = null;
    if (s.k === 'word') w = s.word;
    else if (s.word) w = s.word;
    else if (s.k === 'animal') w = wordName(lang, s.animal);
    if (!w) return null;
    var f = s.initial || null;
    if (!f) { var e = findEntry(lang, w); if (e && e.initial) f = e.initial; }
    if (!f) f = stripMarks(w).charAt(0).toUpperCase();
    return { word: w, first: String(f) };
  }
  function isSoundAsk(ev, topic) {
    return String(ev.promptKey || '') === 'p.sound' || (topic === 'animals' && present(obj(ev.params).sound));
  }

  // ---------------------------------------------------------------- tower lines
  // `stack` — the right block landed: names it; from the 2nd block on a plain name (colour, shape, size, sea animal,
  // letter) also counts the tower — "Red! Two blocks tall!" (DESIGN §6). Number / maths / clue / first-letter / small-
  // letter lines stay without the height so two numbers never collide ("Five! Two blocks tall!").
  I18N.sayStack = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var topic = topicOf(ev), pk = String(ev.promptKey || ''), p = derive(lang, ev.params);
    var s = semOfEvent(ev, lang), head;
    var nOf = s.n != null ? s.n : null;
    if (isSoundAsk(ev, topic) && s.k === 'animal') head = I18N.t(lang, 'stack.sound', { animal: s.animal }, rng);
    else if ((topic === 'add' || topic === 'sub' || pk === 'p.add' || pk === 'p.sub') && nOf != null && present(p.expr))
      head = I18N.t(lang, 'stack.math', { expr: p.expr, ans: numberName(lang, nOf) }, rng);
    else if (s.k === 'expr' && exprAnswer(s.expr) != null)
      head = I18N.t(lang, 'stack.math', { expr: exprText(s.expr), ans: numberName(lang, exprAnswer(s.expr)) }, rng);
    else if ((pk === 'p.oddeven' || (topic === 'oddeven' && !/^p\.(add|sub)$/.test(pk))) && nOf != null)
      head = I18N.t(lang, 'stack.oddeven', { ans: numberName(lang, nOf), parity: nOf % 2 ? 'odd' : 'even' }, rng);
    else if ((topic === 'initial' || pk === 'p.initial') && initialOf(lang, s)) {
      var ini = initialOf(lang, s);
      head = I18N.t(lang, 'stack.initial', { word: ini.word, letter: present(p.letter) ? upper(p.letter) : ini.first }, rng);
    } else if ((topic === 'lower' || pk === 'p.lower') && s.k === 'letter')
      head = I18N.t(lang, 'stack.lower', { lower: s.letter.toLowerCase() }, rng);
    else if (s.k) {
      var h = num(ev.n);
      var tallOk = h != null && h >= 2 && h <= 20 && ['color', 'shape', 'size', 'animal', 'letter'].indexOf(s.k) >= 0 &&
        ['count', 'add', 'sub', 'oddeven'].indexOf(topic) < 0;
      if (tallOk) head = I18N.t(lang, 'stack.tall', { it: phraseOf(lang, s, 'tap'), tall: numberName(lang, h) }, rng);
      else if (s.k === 'animal') head = I18N.t(lang, 'stack.animal', { animal: s.animal, it: phraseOf(lang, s, 'tap') }, rng);
      else head = I18N.t(lang, 'stack.name', { it: phraseOf(lang, s, 'tap') }, rng);
    } else head = I18N.t(lang, 'praise', null, rng);
    return head;   // short on purpose (playtest P1-1): ≤ 6 words so the next prompt is heard
  };

  // the finished tower: count every block, then the starfish — "One, two, three, four! We reached the starfish!"
  I18N.sayTowerDone = function (lang, n, rng) {
    lang = L(lang);
    var c = num(n && typeof n === 'object' ? n.n : n);
    if (c == null || c < 1) return I18N.t(lang, 'towerDone', null, rng);
    c = Math.min(c, 20);
    var parts = [];
    for (var i = 1; i <= c; i++) parts.push(numberName(lang, i));
    return I18N.t(lang, 'towerDone.count', { count: capFirst(parts.join(', ')) }, rng);
  };

  // `wrong` — the block bounced off: names it kindly ("Bloop! That’s blue."), then repeats the goal
  // ("Find red!"). Never negative, never gives a maths or clue answer away.
  I18N.sayWrong = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var s = semOfEvent(ev, lang), topic = topicOf(ev), pk = String(ev.promptKey || '');
    var p = derive(lang, ev.params), want = wantOf(ev, lang);
    var first = '';
    var isInit = topic === 'initial' || pk === 'p.initial';
    var ini = isInit ? initialOf(lang, s) : null;
    var isMath = /^p\.(add|sub)$/.test(pk);
    if ((pk === 'p.oddeven' || (topic === 'oddeven' && !isMath)) && s.n != null)
      first = I18N.t(lang, 'wrong.oddeven', { ans: numberName(lang, s.n), parity: s.n % 2 ? 'odd' : 'even' }, rng);
    else if (ini) first = I18N.t(lang, 'wrong.initialIt', ini, rng);
    else if (s.k) first = I18N.t(lang, 'wrong.it', { it: phraseOf(lang, s, 'bounced') }, rng);
    var goal;
    var wantAnimal = want.animal || animalIn(rawVal(obj(ev.params).animal));
    var wantClue = clueIdOf(wantAnimal) || clueIdOf(obj(ev.params).sound);
    if (isSoundAsk(ev, topic) && wantClue)
      goal = I18N.t(lang, 'wrong.sound', { sound: wantClue }, rng);
    else if ((topic === 'add' || topic === 'sub' || pk === 'p.add' || pk === 'p.sub') && present(p.expr))
      goal = I18N.t(lang, 'wrong.math', { expr: p.expr }, rng);
    else if (isInit && (present(p.letter) || want.k === 'letter'))
      goal = I18N.t(lang, 'wrong.initial', { letter: upper(present(p.letter) ? p.letter : want.letter) }, rng);
    else if ((topic === 'lower' || pk === 'p.lower') && (present(p.letter) || want.k === 'letter')) {
      var cap = upper(present(p.letter) ? p.letter : want.letter);
      goal = I18N.t(lang, 'wrong.lower', { lower: present(p.lower) ? String(p.lower) : cap.toLowerCase() }, rng);
    } else if ((pk === 'p.oddeven' || (topic === 'oddeven' && !isMath)) && (present(p.parity) || want.parity))
      goal = I18N.t(lang, 'wrong.parity', { parity: present(p.parity) ? rawVal(p.parity) : want.parity }, rng);
    else if (want.k) goal = I18N.t(lang, 'wrong.find', { want: phraseOf(lang, want, 'goal') }, rng);
    else goal = I18N.t(lang, 'wrong', null, rng);
    return first ? first + ' ' + goal : goal;
  };

  // `tapPiece` / `grab` — just the name: "Blue!", "Three pearls!", "Crab!", "Chữ B!"
  I18N.sayTap = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var s = semOfEvent(ev, lang);
    var it = phraseOf(lang, s, 'tap');
    return it ? capFirst(it) + '!' : I18N.t(lang, 'praise', null, rng);
  };

  // Counting the finished tower aloud: i → "One!" … "Twelve!" (numbers beyond that: the word / digits)
  I18N.sayCount = function (lang, i) {
    lang = L(lang);
    var c = num(i);
    if (c == null) return I18N.t(lang, 'praise');
    if (STR[lang]['count.' + c]) return STR[lang]['count.' + c];
    return capFirst(numberName(lang, c)) + '!';
  };

  // Aliases (shared main.js code of the sister games)
  I18N.sayFound = I18N.sayStack;
  I18N.sayGo = I18N.sayStack;
  I18N.sayCorrect = I18N.sayStack;
  I18N.sayGrab = I18N.sayTap;
  I18N.sayFlip = I18N.sayTap;
  I18N.sayMismatch = function (lang, ev, rng) { return I18N.sayWrong(lang, ev, rng); };

  I18N.talkWrong = function (lang, kind, value) {
    lang = L(lang);
    if (kind && typeof kind === 'object') { value = kind.value; kind = kind.kind; }
    if (value == null || value === '') return I18N.t(lang, 'wrong');
    var ans = { answer: { kind: kind, value: value } };
    if (kind === 'animal') {
      if (!animalIn(value)) return I18N.t(lang, 'talk.wrong', { answer: String(value) });
      return I18N.t(lang, 'talk.wrong.animal', ans);
    }
    if (kind === 'shape') return I18N.t(lang, lang === 'en' ? 'talk.wrong.a' : 'talk.wrong', ans);
    if (kind === 'size') return I18N.t(lang, 'talk.wrong.size', ans);
    if (kind === 'letter') {
      var lv = String(value);
      return I18N.t(lang, lv !== lv.toUpperCase() ? 'talk.wrong.small' : 'talk.wrong.letter', { letter: lv });
    }
    if (kind === 'number' || kind === 'stars' || kind === 'dots' || (kind === 'parity' && num(value) != null))
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
    s = s.replace(/[…]/g, '.').replace(/[›»«]/g, ',');
    if (lang === 'en') {
      s = s.replace(/\b(letter|Letter|big|Big|small|Small) ([A-Za-z])(?![A-Za-z’'])/g, function (m, w, ch) {
        return w + ' ' + (LETTER_SPEECH_EN[ch.toUpperCase()] || ch);
      });
      s = s.replace(/(^|[\s!?.,])([A-Z]) is for\b/g, function (m, pre, ch) { return pre + LETTER_SPEECH_EN[ch] + ' is for'; });
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 plus $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 minus $2')
        .replace(/\s=\s/g, ' equals ');
      // effects that TTS would spell out: "fffff" (Pip blowing bubbles) → "fooo"
      s = s.replace(/\b([Ff])f{2,}\b/g, '$1ooo');
    } else {
      s = s.replace(RE_VI_LETTER, function (m, w, ch) { return w + ' ' + (LETTER_VI[ch.toUpperCase()] || ch.toLowerCase()); });
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 cộng $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 trừ $2')
        .replace(/\s=\s/g, ' bằng ');
    }
    return s.replace(/\s{2,}/g, ' ').trim();
  };

  RT.I18N = I18N;
})(window.RT = window.RT || {});
