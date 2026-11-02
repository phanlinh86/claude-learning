/* Dee's Forest Memory — DM.I18N (English + Vietnamese). Dee the duckling talks to the child about memory cards.
 *
 *   DM.I18N.t(lang, key, params, rng?)     → string (variants picked with rng.next()/rng()/Math.random)
 *   DM.I18N.name(lang, kind, value)        → display + spoken name ("red"/"màu đỏ", 7 → "seven"/"bảy",
 *                                            fox → "fox"/"con cáo", dots 3 → "three acorns"/"ba hạt dẻ")
 *   DM.I18N.words(lang, kind, value)       → accepted spoken forms for speech recognition (lower-case, + no-diacritic forms)
 *   DM.I18N.speech(lang, text)             → text tuned for TTS (letter names, + − =). ("Dee" → "Đi" happens in voice.js)
 *
 *   Card lines (memory game). Every function copes with a missing / partial event and never returns '' or "{x}":
 *   DM.I18N.sayFlip(lang, ev, rng)         → name of the turned face: "Red!", "A red heart!", "One, two, three acorns!",
 *                                            "Three!", "A fox!", "A little fox!", "The letter B!", "Two plus three!"
 *   DM.I18N.sayMatch(lang, ev, rng)        → "Two foxes! A pair!", "Three and three acorns! A match!",
 *                                            "Seven and seven acorns! Seven is odd!", "Fox starts with the letter F! A pair!"
 *   DM.I18N.sayMismatch(lang, ev, rng)     → "A fox and an owl. Let's look again!" — kind, never negative
 *   DM.I18N.sayReward(lang, ev, rng)       → optional line for a `reward` event (ev.kind butterfly|lantern|acorns|animal|star)
 *   DM.I18N.sayCount(lang, n, need)        → "Two!" … at need "Three! Three acorns!"
 *   DM.I18N.cardPhrase(lang, card)         → "a fox" / "con cáo", "three acorns" / "ba hạt dẻ" (what mismatch lines use)
 *   DM.I18N.talkWrong(lang, kind, value)   → gentle "it's X" line for a missed Talk-time answer
 *   DM.I18N.setChild(name)                 → default {child} for every t() call
 *   DM.I18N.langs = ['en', 'vi'];  has(lang, key);  keys(lang);  raw(lang, key);  PARAMS (required params per key)
 *
 * Event fields read by sayFlip / sayMatch / sayMismatch (all optional):
 *   ev.nameKind, ev.nameValue, ev.face {kind, value, color, shape, sprite, text, n, scale, parity}, ev.topic, ev.parity,
 *   ev.size ('big'|'small', size rounds), ev.word (initial match);
 *   per card: ev.nameKindA/nameValueA/faceA/sizeA + …B (what DM.World sends), or ev.cardA / ev.cardB (card objects
 *   {nameKind, nameValue, face, size}), or ev.nameA / ev.nameB as {kind, value}; also ev.cards = [cardA, cardB].
 *
 * Name kinds: color, shape, size, animal, number, dots, letter, text, sum, diff, parity, word.
 * Params: values may be RAW ({animal:'fox'}, {color:'red'}) — keys named like a name kind (color, shape, size, animal,
 * parity) are named automatically; an object {kind, value} is always replaced by name(lang, kind, value).
 * Derived params: {letter}/{lower} from letter|text, {word} from word|animal|sprite, {expr} from expr|text|a,b,
 * {acorns} ("acorn"/"acorns", vi "hạt dẻ") and {num} (number word) from n, {animal} from a bare animal id in {sound}.
 * Keys with required params (PARAMS) fall back to a generic key when a param is missing (never "the !" on screen);
 * an unknown prompt key `p.<x>` falls back to `p.any`. {child}: if the child's name is empty, variants containing
 * {child} are skipped; if every variant has it, {child} becomes "friend" / "bé". Missing params are removed.
 *
 * Vietnamese letter names follow the kindergarten/grade-1 PHONICS convention ("đọc theo âm"):
 * B → "bờ", C → "cờ", K → "ca", Q → "quờ", Y → "i dài", Ă → "á", Â → "ớ" … (see LETTER_VI and docs/VOICE.md).
 */
(function (DM) {
  'use strict';

  var LANGS = ['en', 'vi'];
  var ANIMALS = ['fox', 'deer', 'hedgehog', 'squirrel', 'bunny', 'frog', 'bear', 'owl', 'mouse'];

  // ---------------------------------------------------------------- names
  // Vietnamese animal names carry their classifier ("con cáo"), as a kindergarten teacher says them.
  var NAMES = {
    en: {
      color: { red: 'red', blue: 'blue', yellow: 'yellow', green: 'green', orange: 'orange', purple: 'purple', pink: 'pink',
        brown: 'brown', white: 'white', cream: 'white' },
      shape: { circle: 'circle', square: 'square', triangle: 'triangle', star: 'star', heart: 'heart', rect: 'rectangle',
        rectangle: 'rectangle', oval: 'oval', diamond: 'diamond' },
      size: { big: 'big', small: 'little', little: 'little' },
      animal: { fox: 'fox', deer: 'deer', hedgehog: 'hedgehog', squirrel: 'squirrel', bunny: 'bunny', frog: 'frog',
        bear: 'bear', owl: 'owl', mouse: 'mouse' },
      parity: { odd: 'odd', even: 'even' }
    },
    vi: {
      color: { red: 'màu đỏ', blue: 'màu xanh dương', yellow: 'màu vàng', green: 'màu xanh lá', orange: 'màu cam',
        purple: 'màu tím', pink: 'màu hồng', brown: 'màu nâu', white: 'màu trắng', cream: 'màu trắng' },
      shape: { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', star: 'hình ngôi sao',
        heart: 'hình trái tim', rect: 'hình chữ nhật', rectangle: 'hình chữ nhật', oval: 'hình bầu dục',
        diamond: 'hình thoi' },
      size: { big: 'to', small: 'nhỏ', little: 'nhỏ' },
      animal: { fox: 'con cáo', deer: 'con hươu', hedgehog: 'con nhím', squirrel: 'con sóc', bunny: 'con thỏ',
        frog: 'con ếch', bear: 'con gấu', owl: 'con cú', mouse: 'con chuột' },
      parity: { odd: 'lẻ', even: 'chẵn' }
    }
  };
  var PLURAL_EN = {
    shape: { circle: 'circles', square: 'squares', triangle: 'triangles', star: 'stars', heart: 'hearts',
      rect: 'rectangles', rectangle: 'rectangles', oval: 'ovals', diamond: 'diamonds' },
    animal: { fox: 'foxes', deer: 'deer', hedgehog: 'hedgehogs', squirrel: 'squirrels', bunny: 'bunnies', frog: 'frogs',
      bear: 'bears', owl: 'owls', mouse: 'mice' }
  };
  // The dots on count cards are acorns. vi "hạt dẻ" is what Vietnamese children call an acorn (Scrat's "hạt dẻ").
  var ACORN = { en: ['acorn', 'acorns'], vi: ['hạt dẻ', 'hạt dẻ'] };

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

  // extra accepted spoken forms per kind/value (names are always accepted automatically)
  var WORDS = {
    en: {
      color: { red: ['red', 'read', 'reds'], blue: ['blue', 'blew', 'blues'], yellow: ['yellow', 'yello'],
        green: ['green', 'greens'], orange: ['orange', 'oranges'], purple: ['purple', 'violet', 'pupple'],
        pink: ['pink', 'pinks', 'pinky'], brown: ['brown'], white: ['white'], cream: ['white', 'cream'] },
      shape: { circle: ['circle', 'round', 'ring', 'circles', 'ball'], square: ['square', 'box', 'squares'],
        triangle: ['triangle', 'try angle', 'triangles'], star: ['star', 'stars'], heart: ['heart', 'hearts', 'hart', 'love'],
        rect: ['rectangle', 'rectangles', 'long box'], rectangle: ['rectangle', 'rectangles'], oval: ['oval', 'egg'],
        diamond: ['diamond', 'kite'] },
      size: { big: ['big', 'large', 'huge', 'bigger', 'giant'], small: ['little', 'small', 'tiny', 'smaller', 'baby'],
        little: ['little', 'small', 'tiny', 'smaller', 'baby'] },
      animal: {
        fox: ['fox', 'foxy', 'fox cub', 'foxes', 'foxie'],
        deer: ['deer', 'fawn', 'baby deer', 'dear', 'deers'],
        hedgehog: ['hedgehog', 'hedgie', 'hedge hog', 'hedgehogs', 'porcupine'],
        squirrel: ['squirrel', 'squirrels', 'squirrely', 'squirl', 'chipmunk'],
        bunny: ['bunny', 'rabbit', 'bunnies', 'bunny rabbit', 'bun'],
        frog: ['frog', 'froggy', 'frogs', 'froggie', 'toad'],
        bear: ['bear', 'teddy', 'teddy bear', 'bear cub', 'bears', 'bare'],
        owl: ['owl', 'owlet', 'owls', 'hoot owl', 'baby owl'],
        mouse: ['mouse', 'mice', 'mousey', 'mousie', 'little mouse'] },
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
      size: { big: ['to', 'lớn', 'bự', 'to lắm', 'to hơn'], small: ['nhỏ', 'bé', 'nhỏ xíu', 'nhỏ hơn', 'tí hon'],
        little: ['nhỏ', 'bé', 'nhỏ xíu', 'nhỏ hơn', 'tí hon'] },
      animal: {
        fox: ['con cáo', 'cáo', 'cáo con', 'chú cáo'],
        deer: ['con hươu', 'hươu', 'con nai', 'nai', 'hươu con', 'nai con', 'hươu sao'],
        hedgehog: ['con nhím', 'nhím', 'nhím con', 'chú nhím'],
        squirrel: ['con sóc', 'sóc', 'sóc con', 'chú sóc'],
        bunny: ['con thỏ', 'thỏ', 'thỏ con', 'thỏ trắng'],
        frog: ['con ếch', 'ếch', 'ếch con', 'con nhái', 'ếch xanh'],
        bear: ['con gấu', 'gấu', 'gấu con', 'gấu bông', 'gấu nâu'],
        owl: ['con cú', 'cú', 'cú mèo', 'con cú mèo', 'cú con'],
        mouse: ['con chuột', 'chuột', 'chuột con', 'chuột nhắt'] },
      parity: { odd: ['lẻ', 'số lẻ', 'lẽ', 'lẹ'], even: ['chẵn', 'số chẵn', 'chặn', 'chắn'] }
    }
  };

  // Default DM.WORDS (DESIGN §5.1) — word lists for the 'initial' topic. content.js loads later and may replace it.
  // vi: nhím (nh), thỏ (th), chuột (ch) are skipped — Vietnamese phonics teaches nh / th / ch as their own sounds.
  var WORD_LIST = {
    en: [['fox', 'animal_fox', 'F'], ['deer', 'animal_deer', 'D'], ['hedgehog', 'animal_hedgehog', 'H'],
      ['squirrel', 'animal_squirrel', 'S'], ['bunny', 'animal_bunny', 'B'], ['frog', 'animal_frog', 'F'],
      ['bear', 'animal_bear', 'B'], ['owl', 'animal_owl', 'O'], ['mouse', 'animal_mouse', 'M']],
    vi: [['cáo', 'animal_fox', 'C'], ['hươu', 'animal_deer', 'H'], ['sóc', 'animal_squirrel', 'S'],
      ['ếch', 'animal_frog', 'Ê'], ['gấu', 'animal_bear', 'G'], ['cú', 'animal_owl', 'C']]
  };
  if (!DM.WORDS) {
    DM.WORDS = {};
    LANGS.forEach(function (l) {
      DM.WORDS[l] = WORD_LIST[l].map(function (w) { return { word: w[0], sprite: w[1], initial: w[2] }; });
    });
  }
  function spriteOfWord(lang, w) {        // looks in content's DM.WORDS first, then the default list
    var cur = DM.WORDS && DM.WORDS[lang], i;
    if (Array.isArray(cur)) for (i = 0; i < cur.length; i++) if (cur[i] && cur[i].word === w) return cur[i].sprite || null;
    for (i = 0; i < WORD_LIST[lang].length; i++) if (WORD_LIST[lang][i][0] === w) return WORD_LIST[lang][i][1];
    return null;
  }
  function wordOfSprite(lang, spr) {
    var cur = DM.WORDS && DM.WORDS[lang], i;
    if (Array.isArray(cur)) for (i = 0; i < cur.length; i++) if (cur[i] && cur[i].sprite === spr) return cur[i].word;
    for (i = 0; i < WORD_LIST[lang].length; i++) if (WORD_LIST[lang][i][1] === spr) return WORD_LIST[lang][i][0];
    return null;
  }
  function animalOf(v) {                  // 'fox' | 'animal_fox' | {kind:'animal', value:'fox'} → 'fox' | null
    if (v && typeof v === 'object') v = v.value != null ? v.value : v.sprite;
    if (v == null) return null;
    var s = String(v).replace(/^animal_/, '').replace(/\.svg$/, '');
    return ANIMALS.indexOf(s) >= 0 ? s : null;
  }

  // ---------------------------------------------------------------- strings
  var TOPICS = ['colors', 'size', 'shapes', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
  var NAME_KINDS = ['color', 'shape', 'size', 'animal', 'number', 'dots', 'letter', 'text', 'sum', 'diff', 'parity', 'word'];

  var STR = {
    en: {
      'ui.title': 'Dee’s Forest Memory',
      'ui.logo1': 'Dee’s',
      'ui.logo2': 'Forest Memory',
      'ui.subtitle': 'Flip, match and learn with Dee!',
      'ui.tagline': 'Flip, match and learn with Dee!',
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
      'ui.voice': 'Dee’s voice',
      'ui.mic': 'Answer by voice',
      'ui.done': 'Done',
      'ui.stars': 'Stars',
      'ui.chapter': 'Chapter {n}',
      'ui.allDone': 'All done! {stars} stars',
      'ui.welcome': ['Hi {child}! I am Dee. Let’s find the pairs!', 'Hi! I am Dee. Let’s find the pairs!'],
      'ui.micUnsupported': 'Voice answers are not available here. Tap the pictures!',
      'ui.micDenied': 'The microphone is off. Tap the pictures instead!',
      'ui.voiceMissing': 'Tip for parents: add a voice in Settings › Accessibility › Spoken Content › Voices.',
      'ui.tapOrSay': 'Tap or say the answer!',
      'ui.listening': 'Dee is listening…',
      'ui.tapDee': 'Tap Dee to hear it again',
      'ui.skip': 'Skip',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Colour Butterflies',
      'topic.size': 'Big and Little',
      'topic.shapes': 'Shape Lanterns',
      'topic.count': 'Counting Acorns',
      'topic.animals': 'Forest Friends',
      'topic.letters': 'Letter Pairs',
      'topic.lower': 'Big and Small Letters',
      'topic.initial': 'First Letters',
      'topic.add': 'Adding Up',
      'topic.sub': 'Take Away',
      'topic.oddeven': 'Odd and Even',

      'weather.0': 'Spring is here! Look, blossoms!',
      'weather.1': 'Hello, summer! The sun is warm!',
      'weather.2': 'Autumn leaves! Red and gold!',
      'weather.3': 'Snowy winter! Brrr, so cold!',

      'p.any': ['Find two cards that match!', 'Which two cards are the same?', 'Let’s find the matching pairs!'],
      'p.colors': ['Find the colour pairs!', 'Find two butterflies of the same colour!', 'Which colours go together?'],
      'p.size': ['Find the big one and the little one!', 'Match each big animal with its little one!', 'Big and little friends go together!'],
      'p.shapes': ['Find the shape pairs!', 'Find two lanterns with the same shape!', 'Which shapes go together?'],
      'p.count': ['Match each number with its acorns!', 'Count the acorns and find the number!', 'Which number goes with the acorns?'],
      'p.animals': ['Find two of each animal!', 'Find the forest friends that match!', 'Every animal has a twin. Find them!'],
      'p.letters': ['Find the letter pairs!', 'Find two cards with the same letter!', 'Which letters are the same?'],
      'p.lower': ['Match each big letter with its small letter!', 'Find the big and small letter pairs!', 'Every big letter has a small friend!'],
      'p.initial': ['Match each letter with an animal that starts with it!', 'Which animal starts with this letter?', 'Find the letter and its animal!'],
      'p.add': ['Match each sum with its answer!', 'Add them up and find the answer!', 'Which number is the answer?'],
      'p.sub': ['Match each take-away with its answer!', 'Take away and find the answer!', 'How many are left? Find the pair!'],
      'p.oddeven': ['Match each number with its acorns! Odd or even?', 'Count the acorns and find the number!', 'Find the number pairs! Odd or even?'],

      'surprise.shuffle': ['Oh! Two cards are swapping places. Watch!', 'Whoosh! Two cards are moving. Keep your eyes on them!'],
      'surprise.golden': ['One pair is magic! Can you find it?', 'Psst! A magic pair is hiding here!'],
      'surprise.pond': ['The cards are floating on lily pads!', 'Splash! The cards are on the pond today!'],
      'golden': ['A rainbow! You found the magic pair!', 'Wow, the magic pair! Look at the rainbow!'],
      'peek': ['Look carefully!', 'Look at all the cards!', 'Remember where they are!', 'Peek! Look closely!',
        'Watch carefully, {child}!'],
      'hide': ['Now they hide!', 'Flip! They are hiding!', 'Now find the pairs!', 'Hide and seek! Your turn!',
        'They are hiding. Tap two cards!'],

      'flip.color': ['{name}!', 'A {name} butterfly!'],
      'flip.shape': 'A {name}!',
      'flip.shapeColor': 'A {color} {shape}!',
      'flip.animal': ['A {name}!', 'Hello, {name}!'],
      'flip.number': ['{num}!', 'Number {num}!'],
      'flip.letter': ['The letter {letter}!', 'Letter {letter}!'],
      'flip.capital': 'Big letter {letter}!',
      'flip.small': 'Small letter {lower}!',
      'flip.expr': '{expr}!',
      'flip.word': '{word}!',

      'match.color': ['{name} and {name}! A pair!', 'Two {name} butterflies! A pair!'],
      'match.shape': ['Two {plural}! A pair!', 'Two {plural}! They match!'],
      'match.animal': ['Two {plural}! A pair!', 'Two {plural}! Hooray!'],
      'match.size': ['A big {beast} and a little {beast}! A pair!'],
      'match.count': ['{num} and {num} {acorns}! A match!', '{num} {acorns}! Number {num}! A pair!'],
      'match.number': ['{num} and {num}! A pair!'],
      'match.oddeven': ['{num} and {num} {acorns}! {num} is {parity}!', '{num} is {parity}! A pair!'],
      'match.letter': ['Letter {letter} and letter {letter}! A pair!'],
      'match.lower': ['Big letter {letter} and small letter {lower}! A pair!'],
      'match.initial': ['{word} starts with the letter {letter}! A pair!'],
      'match.math': ['{expr} is {num}! A match!', 'Yes! {expr} makes {num}!'],
      'match.any': ['A pair!', 'A match! Hooray!', 'You found a pair!', 'They match!', 'Two the same! Yay!'],

      'mismatch.two': ['{A} and {B}. Let’s look again!', '{A} and {B}. Let’s remember them!',
        '{A} and {B}! Try two more cards!'],
      'wrong': ['Let’s look again!', 'Almost! Try two more!', 'Let’s remember those two!', 'Hmm, try another card!',
        'So close! One more try!', 'Let’s think again!', 'Keep trying, you can do it!'],
      'miss': ['Tap a card!', 'The cards are over here!', 'Try a card!', 'Touch a card to flip it!', 'Flip a card!'],

      'reward.butterfly': ['Flutter, butterfly!', 'A butterfly for the forest!'],
      'reward.lantern': ['A lantern lights up!', 'Look, a glowing lantern!'],
      'reward.acorns': ['Acorns for the forest!', 'Tumble, acorns!'],
      'reward.animal': ['A new forest friend!', 'Hop, hop! Hello, friend!'],
      'reward.star': ['A twinkly star!', 'Look, a little star!'],
      'say.countDone': '{num}! {num} {acorns}!',

      'praise': ['Yes!', 'Great job!', 'You got it!', 'Super!', 'Wonderful!', 'Nice one!', 'Hooray!', 'Well done!'],
      'great': ['Great job, {child}!', 'You did it, {child}!', 'You found all the pairs!', 'Wow, {child}, what a memory!',
        'Super finding!', 'Hooray! All pairs found!', 'You are so clever!'],
      'hint': ['Psst! Look at the glowing cards!', 'Here is a clue! Watch these two!', 'Dee will help! Look here!',
        'Look! These two are wiggling!', 'Try the sparkly cards!'],
      'idle': ['Tap a card to flip it!', 'Want to play? Tap a card!', 'Dee is waiting! Your turn!',
        'The cards are waiting for you!', 'Let’s find a pair! Tap one!', 'I am here, {child}! Let’s play!'],

      'talk.intro': 'Talk time! Dee has a question.',
      'talk.colors': 'What colour is this butterfly?',
      'talk.size': 'Is it big or little?',
      'talk.shapes': 'What shape is this lantern?',
      'talk.count': 'How many acorns?',
      'talk.animals': 'Where is the {animal}?',
      'talk.animalsAny': 'Which animal is this?',
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
      'talk.wrong.number': 'It is {answer}! Good try!',

      'session.done': ['You did it all! {stars} stars! Hooray!', 'Amazing, {child}! {stars} stars!',
        'What a forest party! {stars} stars!']
    },
    vi: {
      'ui.title': 'Vịt Dee Lật Thẻ Rừng Xanh',
      'ui.logo1': 'Vịt Dee',
      'ui.logo2': 'Lật Thẻ Rừng Xanh',
      'ui.subtitle': 'Cùng vịt Dee lật thẻ, ghép cặp và học nhé!',
      'ui.tagline': 'Cùng vịt Dee lật thẻ, ghép cặp và học nhé!',
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
      'ui.voice': 'Giọng của Dee',
      'ui.mic': 'Trả lời bằng giọng nói',
      'ui.done': 'Xong',
      'ui.stars': 'Ngôi sao',
      'ui.chapter': 'Chương {n}',
      'ui.allDone': 'Hoàn thành! {stars} ngôi sao',
      'ui.welcome': ['Chào bé {child}! Mình là vịt Dee. Mình cùng lật thẻ nhé!',
        'Chào bé! Mình là vịt Dee. Mình cùng lật thẻ nhé!'],
      'ui.micUnsupported': 'Máy này chưa nghe được giọng nói. Bé chạm vào hình nhé!',
      'ui.micDenied': 'Micrô đang tắt. Bé chạm vào hình nhé!',
      'ui.voiceMissing': 'Mẹo cho bố mẹ: thêm giọng tiếng Việt trong Cài đặt › Trợ năng › Nội dung được đọc › Giọng nói.',
      'ui.tapOrSay': 'Bé chạm hoặc nói đáp án nhé!',
      'ui.listening': 'Dee đang nghe…',
      'ui.tapDee': 'Chạm vào Dee để nghe lại nhé',
      'ui.skip': 'Bỏ qua',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Bướm sắc màu',
      'topic.size': 'To và nhỏ',
      'topic.shapes': 'Đèn lồng hình khối',
      'topic.count': 'Đếm hạt dẻ',
      'topic.animals': 'Bạn thú trong rừng',
      'topic.letters': 'Cặp chữ cái',
      'topic.lower': 'Chữ hoa, chữ thường',
      'topic.initial': 'Chữ cái đầu tiên',
      'topic.add': 'Phép cộng',
      'topic.sub': 'Phép trừ',
      'topic.oddeven': 'Số chẵn, số lẻ',

      'weather.0': 'Mùa xuân đến rồi! Hoa nở nè!',
      'weather.1': 'Chào mùa hè! Nắng ấm quá!',
      'weather.2': 'Mùa thu rồi! Lá vàng rơi nè!',
      'weather.3': 'Mùa đông tuyết rơi! Lạnh quá!',

      'p.any': ['Bé ơi, tìm hai thẻ giống nhau nhé!', 'Hai thẻ nào giống nhau nhỉ?', 'Mình cùng tìm các cặp giống nhau nào!'],
      'p.colors': ['Bé ơi, tìm hai thẻ cùng màu nhé!', 'Bé tìm hai chú bướm cùng màu nhé!', 'Màu nào đi cùng màu nào nhỉ?'],
      'p.size': ['Bé ơi, tìm bạn to và bạn nhỏ nhé!', 'Bé ghép bạn thú to với bạn nhỏ nhé!', 'Bạn to tìm bạn nhỏ nào!'],
      'p.shapes': ['Bé ơi, tìm hai thẻ cùng hình nhé!', 'Bé tìm hai đèn lồng cùng hình nhé!', 'Hình nào đi cùng hình nào nhỉ?'],
      'p.count': ['Bé ơi, ghép số với số hạt dẻ nhé!', 'Bé đếm hạt dẻ rồi tìm số nhé!', 'Số nào đi với hạt dẻ nhỉ?'],
      'p.animals': ['Bé ơi, tìm hai bạn thú giống nhau nhé!', 'Bé tìm các bạn thú sinh đôi nhé!', 'Bạn thú nào giống nhau nhỉ?'],
      'p.letters': ['Bé ơi, tìm hai chữ cái giống nhau nhé!', 'Bé tìm hai thẻ cùng chữ nhé!', 'Chữ nào giống chữ nào nhỉ?'],
      'p.lower': ['Bé ơi, ghép chữ hoa với chữ thường nhé!', 'Bé tìm cặp chữ hoa, chữ thường nhé!', 'Chữ hoa nào đi với chữ thường nào?'],
      'p.initial': ['Bé ghép chữ cái với tên con vật nhé!', 'Con vật nào bắt đầu bằng chữ này?', 'Bé tìm chữ cái và con vật nhé!'],
      'p.add': ['Bé ơi, ghép phép cộng với đáp số nhé!', 'Bé cộng lại rồi tìm đáp số nhé!', 'Đáp số là số nào nhỉ?'],
      'p.sub': ['Bé ơi, ghép phép trừ với đáp số nhé!', 'Bé bớt đi rồi tìm đáp số nhé!', 'Còn lại mấy nhỉ? Bé tìm cặp nhé!'],
      'p.oddeven': ['Bé ghép số với hạt dẻ! Chẵn hay lẻ nhỉ?', 'Bé đếm hạt dẻ rồi tìm số nhé!', 'Bé tìm cặp số nhé! Chẵn hay lẻ?'],

      'surprise.shuffle': ['Ồ! Hai thẻ đang đổi chỗ kìa. Bé nhìn nhé!', 'Vèo vèo! Hai thẻ chạy đi đâu đó. Bé nhìn kỹ nhé!'],
      'surprise.golden': ['Có một cặp thẻ thần kỳ! Bé tìm được không?', 'Suỵt! Một cặp thẻ thần kỳ đang trốn đây nè!'],
      'surprise.pond': ['Các thẻ đang nổi trên lá sen nè!', 'Tõm! Hôm nay các thẻ nằm trên mặt hồ đó!'],
      'golden': ['Cầu vồng nè! Bé tìm được cặp thẻ thần kỳ rồi!', 'Oa, cặp thẻ thần kỳ! Bé nhìn cầu vồng kìa!'],
      'peek': ['Bé nhìn kỹ nhé!', 'Bé nhớ kỹ các thẻ nhé!', 'Nhìn kỹ nào bé ơi!', 'Bé nhớ chỗ các thẻ nhé!',
        'Bé {child} nhìn kỹ nhé!'],
      'hide': ['Giờ các thẻ trốn rồi!', 'Úp lại rồi! Đến lượt bé nhé!', 'Trốn tìm nào! Bé lật hai thẻ nhé!',
        'Các thẻ đi trốn rồi!', 'Bé tìm các cặp nhé!'],

      'flip.color': ['{name}!', 'Bướm {name}!'],
      'flip.shape': '{name}!',
      'flip.shapeColor': '{shape} {color}!',
      'flip.animal': ['{name}!', '{name} nè!'],
      'flip.number': ['Số {num}!'],
      'flip.letter': ['Chữ {letter}!'],
      'flip.capital': 'Chữ {letter} in hoa!',
      'flip.small': 'Chữ {lower} viết thường!',
      'flip.expr': '{expr}!',
      'flip.word': '{word}!',

      'match.color': ['{name} và {name}! Một cặp rồi!', 'Hai con bướm {name}! Một cặp rồi!'],
      'match.shape': ['Hai {name}! Một cặp rồi!', 'Hai {name} giống nhau! Giỏi quá!'],
      'match.animal': ['Hai {name}! Một cặp rồi!', 'Hai {name} giống nhau! Giỏi quá!'],
      'match.size': ['{beast} to và {beast} nhỏ! Một cặp rồi!'],
      'match.count': ['Số {num} và {num} {acorns}! Đúng một cặp!', '{num} {acorns}! Số {num}! Một cặp rồi!'],
      'match.number': ['Số {num} và số {num}! Một cặp rồi!'],
      'match.oddeven': ['Số {num} và {num} {acorns}! {num} là số {parity}!', '{num} là số {parity}! Một cặp rồi!'],
      'match.letter': ['Chữ {letter} và chữ {letter}! Một cặp rồi!'],
      'match.lower': ['Chữ {letter} in hoa và chữ {lower} thường! Một cặp rồi!'],
      'match.initial': ['{word} bắt đầu bằng chữ {letter}! Một cặp rồi!'],
      'match.math': ['{expr} bằng {num}! Đúng rồi!', 'Đúng rồi! {expr} bằng {num}!'],
      'match.any': ['Một cặp rồi!', 'Giống nhau rồi! Hoan hô!', 'Bé tìm được một cặp!', 'Đúng một cặp rồi!',
        'Hai thẻ giống nhau! Giỏi quá!'],

      'mismatch.two': ['{A} và {B}. Mình nhìn lại nhé!', '{A} và {B}. Bé nhớ kỹ nhé!',
        '{A} và {B}! Bé thử hai thẻ khác nào!'],
      'wrong': ['Mình nhìn lại nhé!', 'Gần đúng rồi! Thử lại nào!', 'Bé nhớ hai thẻ đó nhé!', 'Hì, bé thử thẻ khác nào!',
        'Suýt nữa thôi! Thử tiếp nhé!', 'Không sao đâu, thử lại nhé!', 'Bé nghĩ thêm chút nữa nhé!'],
      'miss': ['Bé chạm vào một thẻ nhé!', 'Các thẻ ở đây nè!', 'Bé thử lật một thẻ nào!', 'Chạm vào thẻ để lật nhé!',
        'Lật một thẻ nào bé ơi!'],

      'reward.butterfly': ['Bướm bay rồi nè!', 'Một chú bướm cho khu rừng!'],
      'reward.lantern': ['Đèn lồng sáng rồi!', 'Nhìn kìa, đèn lồng lung linh!'],
      'reward.acorns': ['Hạt dẻ lăn nè!', 'Hạt dẻ cho khu rừng!'],
      'reward.animal': ['Thêm một bạn thú nè!', 'Nhảy nhảy! Chào bạn nhé!'],
      'reward.star': ['Ngôi sao lấp lánh!', 'Nhìn kìa, một ngôi sao nhỏ!'],
      'say.countDone': '{num}! {num} {acorns}!',

      'praise': ['Đúng rồi!', 'Giỏi quá!', 'Tuyệt vời!', 'Hoan hô!', 'Bé giỏi lắm!', 'Chính xác!', 'Siêu quá!', 'Hay lắm!'],
      'great': ['Bé {child} giỏi quá!', 'Hoan hô bé {child}!', 'Bé tìm được hết các cặp rồi!', 'Oa, bé {child} nhớ giỏi quá!',
        'Bé lật thẻ giỏi quá!', 'Hoan hô, tìm hết rồi!', 'Bé thông minh quá!'],
      'hint': ['Nhìn nè! Hai thẻ này đang sáng.', 'Bé thử hai thẻ lấp lánh nhé!', 'Dee gợi ý nè: nhìn hai thẻ này!',
        'Vịt Dee giúp bé nhé, nhìn đây!', 'Hai thẻ đang lắc lư đó bé!'],
      'idle': ['Bé ơi, lật thẻ tiếp nào!', 'Bé chạm vào một thẻ nhé!', 'Vịt Dee đang chờ bé nè!', 'Đến lượt bé rồi đó!',
        'Bé {child} ơi, mình chơi tiếp nhé!', 'Các thẻ đang chờ bé nè!'],

      'talk.intro': 'Giờ trò chuyện! Vịt Dee hỏi bé nhé.',
      'talk.colors': 'Con bướm này màu gì nhỉ?',
      'talk.size': 'Bạn này to hay nhỏ nhỉ?',
      'talk.shapes': 'Chiếc đèn lồng này hình gì nhỉ?',
      'talk.count': 'Có mấy hạt dẻ nào?',
      'talk.animals': '{animal} đâu rồi nhỉ?',
      'talk.animalsAny': 'Đây là con gì nhỉ?',
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
      'talk.wrong.size': 'Bạn này {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.letter': 'Là chữ {letter} đó! Bé cố gắng lắm!',
      'talk.wrong.number': 'Là số {answer} đó! Bé cố gắng lắm!',

      'session.done': ['Bé làm xong hết rồi! {stars} ngôi sao! Hoan hô!', 'Bé {child} giỏi quá! {stars} ngôi sao!',
        'Tiệc rừng xanh vui quá! {stars} ngôi sao!']
    }
  };

  // required params → fallback key when one is missing (checked AFTER derived params are filled in)
  var NEEDS = {
    'talk.animals': ['animal'], 'say.countDone': ['num'],
    'flip.color': ['name'], 'flip.shape': ['name'], 'flip.shapeColor': ['shape', 'color'], 'flip.animal': ['name'],
    'flip.number': ['num'], 'flip.letter': ['letter'], 'flip.capital': ['letter'], 'flip.small': ['lower'],
    'flip.expr': ['expr'], 'flip.word': ['word'],
    'match.color': ['name'], 'match.shape': ['name', 'plural'], 'match.animal': ['name', 'plural'],
    'match.size': ['beast'], 'match.count': ['num', 'acorns'], 'match.number': ['num'],
    'match.oddeven': ['num', 'acorns', 'parity'], 'match.letter': ['letter'], 'match.lower': ['letter', 'lower'],
    'match.initial': ['word', 'letter'], 'match.math': ['expr', 'num'],
    'mismatch.two': ['A', 'B'],
    'talk.wrong': ['answer'], 'talk.wrong.a': ['answer'], 'talk.wrong.animal': ['answer'],
    'talk.wrong.letter': ['letter'], 'talk.wrong.number': ['answer'], 'talk.wrong.size': ['answer']
  };
  var FALLBACK = { 'talk.animals': 'talk.animalsAny', 'say.countDone': 'praise', 'mismatch.two': 'wrong',
    'flip.shapeColor': 'flip.shape' };
  ['flip.color', 'flip.shape', 'flip.animal', 'flip.number', 'flip.letter', 'flip.capital', 'flip.small', 'flip.expr',
    'flip.word'].forEach(function (k) { FALLBACK[k] = 'praise'; });
  ['match.color', 'match.shape', 'match.animal', 'match.size', 'match.count', 'match.number', 'match.oddeven',
    'match.letter', 'match.lower', 'match.initial', 'match.math'].forEach(function (k) { FALLBACK[k] = 'match.any'; });
  ['talk.wrong', 'talk.wrong.a', 'talk.wrong.animal', 'talk.wrong.letter', 'talk.wrong.number', 'talk.wrong.size']
    .forEach(function (k) { FALLBACK[k] = 'wrong'; });

  var CHILD_FALLBACK = { en: 'friend', vi: 'bé' };
  // keys whose {child} variant is always used when a name is known
  var CHILD_PREFERRED = { 'ui.welcome': 1 };

  // ---------------------------------------------------------------- helpers
  function L(lang) { return lang === 'vi' ? 'vi' : 'en'; }
  function rnd(rng) {
    var v;
    if (rng && typeof rng.next === 'function') v = rng.next();
    else if (typeof rng === 'function') v = rng();
    else v = Math.random();
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
  function acorns(lang, n) { return ACORN[lang][n === 1 ? 0 : 1]; }
  function isLetter(s) { return typeof s === 'string' && /^\p{L}$/u.test(s); }

  function sizeOf(v) {                     // 'big' | 'small' | 'little' | 'fox_small' | 'small:fox' → 'big'|'small'|null
    var s = String(rawVal(v) == null ? '' : rawVal(v)).toLowerCase();
    if (/(^|[_:\-\s])big($|[_:\-\s])/.test(s) || s === 'large') return 'big';
    if (/(^|[_:\-\s])(small|little)($|[_:\-\s])/.test(s)) return 'small';
    return null;
  }
  function animalIn(v) {                   // finds an animal id inside 'fox_small', 'animal_fox', 'small:fox'
    var a = animalOf(v);
    if (a) return a;
    var s = String(rawVal(v) == null ? '' : rawVal(v)).toLowerCase();
    var parts = s.split(/[_:\-\s]+/);
    for (var i = 0; i < parts.length; i++) if (ANIMALS.indexOf(parts[i]) >= 0) return parts[i];
    return null;
  }

  function name(lang, kind, value) {
    lang = L(lang);
    if (value && typeof value === 'object' && 'value' in value) value = value.value;
    var tbl;
    switch (kind) {
      case 'number': return numberName(lang, value);
      case 'dots': {
        var n = num(value);
        return n == null ? String(value) : numberName(lang, n) + ' ' + acorns(lang, n);
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
        return tx;
      }
      case 'word': {
        var w = String(value);
        if (/^animal_/.test(w)) return wordOfSprite(lang, w) || name(lang, 'animal', w.slice(7));   // a sprite id
        return w;
      }
      case 'animal': {
        var a = animalIn(value);
        return a ? NAMES[lang].animal[a] : String(value);
      }
      case 'size': {
        var sz = sizeOf(value), an = animalIn(value);
        if (sz && an) return lang === 'vi' ? NAMES.vi.animal[an] + ' ' + NAMES.vi.size[sz] : NAMES.en.size[sz] + ' ' + an;
        if (sz) return NAMES[lang].size[sz];
        return String(value);
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
      case 'dots': {
        var dn = num(value);
        out = numberWords(lang, value);
        if (dn != null) addForms(out, [name(lang, 'dots', dn), dn + ' ' + acorns(lang, dn)]);
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
        var w = name(lang, 'word', value);
        var list = [w];
        var spr = /^animal_/.test(String(value)) ? String(value) : spriteOfWord(lang, w);
        var a = animalOf(spr) || animalOf(w);
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

  // Fill in the derived params ({letter}, {lower}, {word}, {expr}, {acorns}, {num}, {animal}) from what the caller passed.
  function derive(lang, params) {
    var p = {}, k;
    if (params && typeof params === 'object') for (k in params) if (Object.prototype.hasOwnProperty.call(params, k)) p[k] = params[k];
    // {animal} from a bare animal id in {sound} / {sprite} (Kitten-style talk params)
    if (!present(p.animal)) {
      var src0 = present(p.sound) ? animalOf(rawVal(p.sound)) : present(p.sprite) ? animalOf(rawVal(p.sprite)) : null;
      if (src0) p.animal = src0;
    }
    // {letter} / {lower}
    if (!present(p.letter) && present(p.text) && isLetter(String(rawVal(p.text)))) p.letter = String(rawVal(p.text));
    if (present(p.letter)) {
      p.letter = String(rawVal(p.letter));
      if (!present(p.lower)) p.lower = p.letter.toLowerCase();
    }
    // {word} (initial topic): word | animal | sprite
    if (!present(p.word)) {
      var src = present(p.sprite) ? rawVal(p.sprite) : present(p.animal) ? rawVal(p.animal) : null;
      if (src != null) {
        var a = animalOf(src);
        if (a) p.word = wordOfSprite(lang, 'animal_' + a) || NAMES[lang].animal[a];
      }
    } else p.word = name(lang, 'word', rawVal(p.word));
    // {expr} ("2 + 3")
    if (!present(p.expr)) {
      var ex = present(p.text) && splitOp(rawVal(p.text)) ? rawVal(p.text) : present(p.sum) ? rawVal(p.sum) :
        present(p.diff) ? rawVal(p.diff) : null;
      if (ex == null && present(p.a) && present(p.b)) ex = rawVal(p.a) + (present(p.op) ? rawVal(p.op) : '+') + rawVal(p.b);
      if (ex != null) p.expr = exprText(ex);
    } else if (typeof p.expr !== 'string' || splitOp(p.expr)) p.expr = exprText(rawVal(p.expr));
    // {parity} may come as value
    if (!present(p.parity) && (rawVal(p.value) === 'odd' || rawVal(p.value) === 'even')) p.parity = rawVal(p.value);
    // {acorns} + {num} from n
    var c = present(p.n) ? num(p.n) : null;
    if (!present(p.acorns)) p.acorns = acorns(lang, c === 1 ? 1 : 2);
    if (!present(p.num) && c != null) p.num = numberName(lang, c);
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

  // English "a owl" → "an owl", but never the LETTER A ("letter A and …"). No regex look-behind (iOS < 16.4).
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
    out = out.replace(/([.!?]\s+)(\p{Ll})/gu, function (m, pre, ch) { return pre + ch.toUpperCase(); });
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
    for (var hop = 0; hop < 3 && !needsMet(key, p) && FALLBACK[key]; hop++) key = FALLBACK[key];
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
  I18N.sound = function () { return ''; };          // forest animals have no "says …" questions (kept for old callers)
  I18N.hasSound = function () { return false; };
  I18N.has = function (lang, key) { return STR[L(lang)][key] != null; };
  I18N.keys = function (lang) { return Object.keys(STR[L(lang)]); };
  I18N.raw = function (lang, key) { return STR[L(lang)][key]; };
  I18N.setChild = function (nm) { I18N.child = nm ? String(nm).trim().slice(0, 24) : ''; };
  I18N.TOPICS = TOPICS.slice();
  I18N.ANIMALS = ANIMALS.slice();
  I18N.NAME_KINDS = NAME_KINDS.slice();
  I18N.PARAMS = NEEDS;           // required params per key (for tests)
  I18N.NAME_TABLE = NAMES;       // read-only use (tests / UI)
  I18N.LETTER_VI = LETTER_VI;
  I18N.WORD_LIST = WORD_LIST;

  // ---------------------------------------------------------------- cards → meaning
  // sem = { k: 'color'|'shape'|'animal'|'dots'|'number'|'letter'|'expr'|'word'|'parity'|null, … }
  function semOf(kind, value, face, ctx, size) {
    face = (face && typeof face === 'object') ? face : {};
    ctx = ctx || {};
    if (value && typeof value === 'object' && 'kind' in value && kind == null) { kind = value.kind; value = value.value; }
    else if (value && typeof value === 'object' && 'value' in value) value = value.value;
    if (kind == null) kind = face.kind;
    if (value == null || value === '') {
      value = face.value != null ? face.value : face.text != null ? face.text : face.n != null ? face.n :
        face.color != null && kind === 'color' ? face.color : face.shape != null && kind === 'shape' ? face.shape :
          face.sprite != null ? face.sprite : null;
    }
    var topic = ctx.topic || null;
    var scale = typeof face.scale === 'number' ? face.scale : null;
    var s = { k: null };
    switch (kind) {
      case 'color': {
        var col = NAMES.en.color[value] != null ? value : face.color;
        if (col != null && NAMES.en.color[col] != null) s = { k: 'color', color: col };
        break;
      }
      case 'shape': {
        var sh = NAMES.en.shape[value] != null ? value : face.shape;
        if (sh != null && NAMES.en.shape[sh] != null) {
          s = { k: 'shape', shape: sh };
          if (face.color != null && NAMES.en.color[face.color] != null) s.color = face.color;
        }
        break;
      }
      case 'size': case 'animal': {
        var an = animalIn(value) || animalIn(face.sprite) || animalIn(face.value) || animalIn(ctx.animal);
        if (!an) break;
        var sz = sizeOf(value) || sizeOf(size) || sizeOf(face.size) || null;
        if (!sz && scale != null && scale < 0.85) sz = 'small';
        if (!sz && (kind === 'size' || topic === 'size')) sz = scale != null && scale < 0.85 ? 'small' : 'big';
        s = { k: 'animal', animal: an };
        if (sz) s.size = sz;
        break;
      }
      case 'dots': {
        var dn = num(value); if (dn == null) dn = num(face.n);
        if (dn != null) s = { k: 'dots', n: dn };
        break;
      }
      case 'number': {
        var nn = num(value); if (nn == null) nn = num(face.n); if (nn == null) nn = num(face.text);
        if (nn != null) s = { k: 'number', n: nn };
        break;
      }
      case 'parity': {
        var pn = num(face.n); if (pn == null) pn = num(value); if (pn == null) pn = num(face.value); if (pn == null) pn = num(face.text);
        if (pn != null) s = { k: (face.dots || face.kind === 'dots' || face.show === 'dots') ? 'dots' : 'number', n: pn };
        else if (value === 'odd' || value === 'even') s = { k: 'parity', parity: value };
        if (s.n != null) s.parity = s.n % 2 ? 'odd' : 'even';
        break;
      }
      case 'letter': {
        var lt = isLetter(String(value)) ? String(value) : isLetter(String(face.text)) ? String(face.text) : null;
        if (lt) s = { k: 'letter', letter: lt, small: lt !== lt.toUpperCase(), capital: topic === 'lower' && lt === lt.toUpperCase() };
        break;
      }
      case 'sum': case 'diff': {
        var ex = splitOp(value) ? value : splitOp(face.text) ? face.text : null;
        if (ex != null) s = { k: 'expr', expr: String(ex) };
        else if (num(value) != null) s = { k: 'number', n: num(value) };
        break;
      }
      case 'text': {
        var tx = value != null ? String(value) : '';
        if (splitOp(tx)) s = { k: 'expr', expr: tx };
        else if (num(tx) != null) s = { k: 'number', n: num(tx) };
        else if (isLetter(tx)) return semOf('letter', tx, face, ctx);
        else if (animalIn(tx)) return semOf('animal', tx, face, ctx, size);
        else if (tx) s = { k: 'word', word: tx };
        break;
      }
      case 'word': {
        var wv = value != null ? String(value) : '';
        var wa = animalOf(wv) || animalOf(face.sprite) || animalOf(spriteOfWord(ctx.lang || 'en', wv)) ||
          animalOf(spriteOfWord('vi', wv)) || animalOf(spriteOfWord('en', wv));
        if (wa) s = { k: 'word', animal: wa };
        else if (wv) s = { k: 'word', word: wv };
        break;
      }
      default: {
        // unknown kind: try the face, then a guess from the value
        if (face.kind && face.kind !== kind) return semOf(face.kind, null, face, ctx, size);
        if (value != null && value !== '') {
          if (num(value) != null) s = { k: 'number', n: num(value) };
          else if (animalIn(value)) s = { k: 'animal', animal: animalIn(value) };
          else if (NAMES.en.color[value] != null) s = { k: 'color', color: value };
          else if (NAMES.en.shape[value] != null) s = { k: 'shape', shape: value };
          else if (splitOp(value)) s = { k: 'expr', expr: String(value) };
          else if (isLetter(String(value))) return semOf('letter', value, face, ctx);
        }
      }
    }
    if ((s.k === 'number' || s.k === 'dots') && s.n != null &&
        (topic === 'oddeven' || face.parity === 'odd' || face.parity === 'even' || ctx.parity === 'odd' || ctx.parity === 'even'))
      s.parity = s.n % 2 ? 'odd' : 'even';
    return s;
  }
  function semOfCard(c, ctx) {
    if (c == null) return { k: null };
    if (typeof c !== 'object') return semOf(null, c, null, ctx);
    if ('nameKind' in c || 'nameValue' in c || 'face' in c) return semOf(c.nameKind, c.nameValue, c.face, ctx, c.size);
    if ('kind' in c) {
      // either {kind, value} (a name) or a face object {kind:'dots', n:3, …}
      return semOf(c.kind, c.value != null ? c.value : null, c, ctx, c.size);
    }
    return { k: null };
  }
  function ctxOf(ev, lang) {
    return { topic: ev.topic || (ev.round && ev.round.topic) || null, parity: ev.parity, animal: ev.animal, lang: lang };
  }
  // the two cards of a match / mismatch event, as sems (0, 1 or 2 entries)
  function twoCards(ev, lang) {
    var ctx = ctxOf(ev, lang), out = [];
    var A = null, B = null;
    if (Array.isArray(ev.cards) && ev.cards.length >= 2) { A = ev.cards[0]; B = ev.cards[1]; }
    if (ev.cardA || ev.cardB) { A = ev.cardA || A; B = ev.cardB || B; }
    if (!A && (ev.nameKindA != null || ev.nameValueA != null || ev.faceA)) A = { nameKind: ev.nameKindA, nameValue: ev.nameValueA, face: ev.faceA, size: ev.sizeA };
    if (!B && (ev.nameKindB != null || ev.nameValueB != null || ev.faceB)) B = { nameKind: ev.nameKindB, nameValue: ev.nameValueB, face: ev.faceB, size: ev.sizeB };
    if (!A && ev.nameA != null) A = (typeof ev.nameA === 'object') ? ev.nameA : { nameKind: null, nameValue: ev.nameA };
    if (!B && ev.nameB != null) B = (typeof ev.nameB === 'object') ? ev.nameB : { nameKind: null, nameValue: ev.nameB };
    if (A && typeof A === 'object' && !('nameKind' in A) && !('kind' in A) && !('face' in A)) A = null;
    if (B && typeof B === 'object' && !('nameKind' in B) && !('kind' in B) && !('face' in B)) B = null;
    [A, B].forEach(function (c) { if (c != null) { var s = semOfCard(c, ctx); if (s.k) out.push(s); } });
    return out;
  }

  // "a fox" / "con cáo", "three acorns" / "ba hạt dẻ", "letter B" / "chữ B" …
  function phrase(lang, s) {
    var vi = lang === 'vi';
    switch (s.k) {
      case 'color': return name(lang, 'color', s.color);
      case 'shape': return vi ? name(lang, 'shape', s.shape) : 'a ' + name(lang, 'shape', s.shape);
      case 'animal':
        if (vi) return NAMES.vi.animal[s.animal] + (s.size ? ' ' + NAMES.vi.size[s.size] : '');
        return 'a ' + (s.size ? NAMES.en.size[s.size] + ' ' : '') + NAMES.en.animal[s.animal];
      case 'dots': return numberName(lang, s.n) + ' ' + acorns(lang, s.n);
      case 'number': return vi ? 'số ' + numberName(lang, s.n) : numberName(lang, s.n);
      case 'letter':
        if (vi) return 'chữ ' + s.letter + (s.small ? ' thường' : s.capital ? ' in hoa' : '');
        return (s.small ? 'small letter ' : s.capital ? 'big letter ' : 'letter ') + s.letter;
      case 'expr': return exprWords(lang, s.expr);
      case 'word':
        if (s.animal) return vi ? NAMES.vi.animal[s.animal] : 'a ' + NAMES.en.animal[s.animal];
        return String(s.word);
      case 'parity': return name(lang, 'parity', s.parity);
      default: return '';
    }
  }
  I18N.cardPhrase = function (lang, card) {
    lang = L(lang);
    var s = phrase(lang, semOfCard(card || {}, { lang: lang })) || '';
    return lang === 'en' ? anFix(s) : s;
  };

  function countLine(lang, n) {               // "One, two, three acorns!" (n ≤ 5) · "Seven acorns!"
    var head;
    if (n >= 1 && n <= 5) {
      var parts = [];
      for (var i = 1; i <= n; i++) parts.push(numberName(lang, i));
      head = parts.join(', ');
    } else head = numberName(lang, n);
    return capFirst(head + ' ' + acorns(lang, n) + '!');
  }

  // Name of a turned card: `flip` and `tap` events { nameKind, nameValue, face, topic? }
  I18N.sayFlip = function (lang, ev, rng) {
    lang = L(lang);
    ev = (ev && typeof ev === 'object') ? ev : {};
    var s = semOf(ev.nameKind, ev.nameValue, ev.face, ctxOf(ev, lang), ev.size);
    switch (s.k) {
      case 'color': return I18N.t(lang, 'flip.color', { name: name(lang, 'color', s.color) }, rng);
      case 'shape':
        if (s.color) return I18N.t(lang, 'flip.shapeColor', { shape: s.shape, color: s.color }, rng);
        return I18N.t(lang, 'flip.shape', { name: name(lang, 'shape', s.shape) }, rng);
      case 'animal': {
        var nm = lang === 'vi' ? phrase(lang, s) : (s.size ? NAMES.en.size[s.size] + ' ' : '') + NAMES.en.animal[s.animal];
        return I18N.t(lang, 'flip.animal', { name: nm }, rng);
      }
      case 'dots': return countLine(lang, s.n);
      case 'number': return I18N.t(lang, 'flip.number', { num: numberName(lang, s.n) }, rng);
      case 'letter':
        if (s.small) return I18N.t(lang, 'flip.small', { lower: s.letter }, rng);
        if (s.capital) return I18N.t(lang, 'flip.capital', { letter: s.letter }, rng);
        return I18N.t(lang, 'flip.letter', { letter: s.letter }, rng);
      case 'expr': return I18N.t(lang, 'flip.expr', { expr: exprWords(lang, s.expr) }, rng);
      case 'word':
        if (s.animal) return I18N.t(lang, 'flip.animal', { name: NAMES[lang].animal[s.animal] }, rng);
        return I18N.t(lang, 'flip.word', { word: String(s.word) }, rng);
      case 'parity': return capFirst(name(lang, 'parity', s.parity)) + '!';
      default: return I18N.t(lang, 'praise', null, rng);
    }
  };
  I18N.sayTap = I18N.sayFlip;

  // `match` event { nameKind, nameValue, topic?, cardA/cardB | nameKindA… | nameA/nameB, parity? }
  I18N.sayMatch = function (lang, ev, rng) {
    lang = L(lang);
    ev = (ev && typeof ev === 'object') ? ev : {};
    var ctx = ctxOf(ev, lang), topic = ctx.topic;
    var cs = twoCards(ev, lang);
    var main = semOf(ev.nameKind, ev.nameValue, ev.face, ctx);
    if (main.k) cs.push(main);
    function find(k) { for (var i = 0; i < cs.length; i++) if (cs[i].k === k) return cs[i]; return null; }
    var dots = find('dots'), numb = find('number'), expr = find('expr'), letter = find('letter'), word = find('word'),
      animal = find('animal'), color = find('color'), shape = find('shape'), par = find('parity');
    var n = dots ? dots.n : numb ? numb.n : null;
    var odd = topic === 'oddeven' || (dots && dots.parity) || (numb && numb.parity) || par ||
      ev.parity === 'odd' || ev.parity === 'even';
    // add / sub: "Two plus three is five!"
    if (expr) {
      var ans = exprAnswer(expr.expr);
      if (ans == null && numb) ans = numb.n;
      return I18N.t(lang, 'match.math', { expr: exprWords(lang, expr.expr), num: ans != null ? numberName(lang, ans) : '' }, rng);
    }
    if (topic === 'add' || topic === 'sub') return I18N.t(lang, 'match.any', null, rng);
    if (odd && n != null) {
      var parity = n % 2 ? 'odd' : 'even';
      return I18N.t(lang, 'match.oddeven', { num: numberName(lang, n), acorns: acorns(lang, n), parity: parity }, rng);
    }
    if ((dots || topic === 'count') && n != null)
      return I18N.t(lang, 'match.count', { num: numberName(lang, n), acorns: acorns(lang, n) }, rng);
    if (numb) return I18N.t(lang, 'match.number', { num: numberName(lang, numb.n) }, rng);
    // initial: letter ↔ animal picture
    if (letter && (word || animal || topic === 'initial')) {
      var wa = (word && word.animal) || (animal && animal.animal);
      var w = present(ev.word) && typeof rawVal(ev.word) === 'string' ? name(lang, 'word', rawVal(ev.word)) :
        wa ? (wordOfSprite(lang, 'animal_' + wa) || NAMES[lang].animal[wa]) : word ? String(word.word) : '';
      var L1 = letter.letter;
      if (w) return I18N.t(lang, 'match.initial', { word: w, letter: upper(L1) }, rng);
    }
    if (letter) {
      var hasSmall = cs.some(function (c) { return c.k === 'letter' && c.small; });
      var hasCap = cs.some(function (c) { return c.k === 'letter' && !c.small; });
      if ((hasSmall && hasCap) || topic === 'lower')
        return I18N.t(lang, 'match.lower', { letter: upper(letter.letter), lower: letter.letter.toLowerCase() }, rng);
      return I18N.t(lang, 'match.letter', { letter: letter.letter }, rng);
    }
    if (animal || (word && word.animal)) {
      var a = animal ? animal.animal : word.animal;
      var sized = cs.some(function (c) { return c.k === 'animal' && c.size; });
      if (topic === 'size' || (sized && cs.some(function (c) { return c.size === 'small'; }) &&
          (cs.some(function (c) { return c.size === 'big'; }) || topic === 'size' || ev.nameKind === 'size')))
        return I18N.t(lang, 'match.size', { beast: lang === 'vi' ? NAMES.vi.animal[a] : NAMES.en.animal[a] }, rng);
      return I18N.t(lang, 'match.animal', { name: NAMES[lang].animal[a], plural: PLURAL_EN.animal[a] }, rng);
    }
    if (color) return I18N.t(lang, 'match.color', { name: name(lang, 'color', color.color) }, rng);
    if (shape) return I18N.t(lang, 'match.shape', { name: name(lang, 'shape', shape.shape), plural: PLURAL_EN.shape[shape.shape] }, rng);
    return I18N.t(lang, 'match.any', null, rng);
  };

  // `mismatch` event: "A fox and an owl. Let's look again!" — names both cards, never negative.
  I18N.sayMismatch = function (lang, ev, rng) {
    lang = L(lang);
    ev = (ev && typeof ev === 'object') ? ev : {};
    var cs = twoCards(ev, lang);
    if (cs.length < 2) return I18N.t(lang, 'wrong', null, rng);
    var A = phrase(lang, cs[0]), B = phrase(lang, cs[1]);
    if (!A || !B) return I18N.t(lang, 'wrong', null, rng);
    return I18N.t(lang, 'mismatch.two', { A: A, B: B }, rng);
  };

  // optional: a short line when a reward flies out (ev.kind = butterfly | lantern | acorns | animal | star)
  I18N.sayReward = function (lang, ev, rng) {
    lang = L(lang);
    var k = ev && typeof ev === 'object' ? ev.kind : ev;
    if (!STR[lang]['reward.' + k]) return I18N.t(lang, 'praise', null, rng);
    return I18N.t(lang, 'reward.' + k, null, rng);
  };

  // Counting aloud (acorns): n < need → "Two!"; n ≥ need → "Three! Three acorns!" / "Ba! Ba hạt dẻ!"
  I18N.sayCount = function (lang, n, need, rng) {
    lang = L(lang);
    var c = num(n);
    if (c == null) return I18N.t(lang, 'praise', null, rng);
    var nd = num(need);
    if (nd == null || c < nd) return capFirst(numberName(lang, c)) + '!';
    return I18N.t(lang, 'say.countDone', { n: c }, rng);
  };

  // Back-compat aliases for Kitten-style callers: a `correct` → the card name; a `wrong` → the mismatch line.
  I18N.sayCorrect = function (lang, ev, rng) { return I18N.sayFlip(lang, ev, rng); };
  I18N.sayWrong = function (lang, ev, rng) { return I18N.sayMismatch(lang, ev, rng); };

  I18N.talkWrong = function (lang, kind, value) {
    lang = L(lang);
    if (kind && typeof kind === 'object') { value = kind.value; kind = kind.kind; }
    if (value == null || value === '') return I18N.t(lang, 'wrong');
    var ans = { answer: { kind: kind, value: value } };
    if (kind === 'animal' || kind === 'size' && animalIn(value)) {
      var a = animalIn(value);
      if (!a) return I18N.t(lang, 'talk.wrong', { answer: String(value) });
      return I18N.t(lang, 'talk.wrong.animal', { answer: { kind: kind, value: value } });
    }
    if (kind === 'shape') return I18N.t(lang, lang === 'en' ? 'talk.wrong.a' : 'talk.wrong', ans);
    if (kind === 'size') return I18N.t(lang, 'talk.wrong.size', ans);
    if (kind === 'letter') return I18N.t(lang, 'talk.wrong.letter', { letter: String(value) });
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
    s = s.replace(/[…]/g, '.').replace(/[›»«]/g, ',');
    if (lang === 'en') {
      s = s.replace(/\b(letter|Letter) ([A-Za-z])(?![A-Za-z’'])/g, function (m, w, ch) {
        return w + ' ' + (LETTER_SPEECH_EN[ch.toUpperCase()] || ch);
      });
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 plus $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 minus $2')
        .replace(/\s=\s/g, ' equals ');
      s = s.replace(/\bTa-da\b/g, 'Ta da').replace(/\bBrrr\b/g, 'Brr');
    } else {
      s = s.replace(RE_VI_LETTER, function (m, w, ch) { return w + ' ' + (LETTER_VI[ch.toUpperCase()] || ch.toLowerCase()); });
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 cộng $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 trừ $2')
        .replace(/\s=\s/g, ' bằng ');
    }
    return s.replace(/\s{2,}/g, ' ').trim();
  };

  DM.I18N = I18N;
})(window.DM = window.DM || {});
