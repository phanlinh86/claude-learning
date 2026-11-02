/* Bim's Rainbow Rocket — RR.I18N (English + Vietnamese). Bim the baby elephant flies a rocket from cloud to cloud.
 *
 *   RR.I18N.t(lang, key, params, rng?)     → string (variants picked with rng.next()/rng()/Math.random)
 *   RR.I18N.name(lang, kind, value)        → display + spoken name ("red"/"màu đỏ", 7 → "seven"/"bảy",
 *                                            cow → "cow"/"con bò", stars 3 → "three stars"/"ba ngôi sao")
 *   RR.I18N.sound(lang, animal)            → "moo" / "ùm bò" ('' for an unknown animal);  hasSound(animal)
 *   RR.I18N.words(lang, kind, value)       → accepted spoken forms for speech recognition (lower-case, + no-diacritic forms)
 *   RR.I18N.speech(lang, text)             → text tuned for TTS (letter names, + − =). "Bim" needs no substitution.
 *
 *   Flight lines. Every function copes with a missing / partial event and never returns '' or "{x}":
 *   RR.I18N.sayGo(lang, ev, rng)           → `go`: "Red! Blast off!", "The cow says moo! Blast off!", "2 + 3 is five! Blast off!"
 *   RR.I18N.sayWrong(lang, ev, rng)        → `wrong`: "That's blue. Let's find red!", "That's the cat. Who says moo?"
 *                                            — names what was tapped, repeats the goal, never negative
 *   RR.I18N.sayCollect(lang, ev, rng)      → `collect`: "One, two, three stars!", "Hello, cow! Moo!", "Got it!"
 *   RR.I18N.sayCount(lang, n, need, rng)   → "Two!" … at need "Three! Three stars!"
 *   RR.I18N.phrase(lang, kind, value, tok) → "the cow" / "con bò", "three stars" / "ba ngôi sao" (what sayWrong uses)
 *   RR.I18N.talkWrong(lang, kind, value)   → gentle "it's X" line for a missed Talk-time answer
 *   RR.I18N.setChild(name)                 → default {child} for every t() call
 *   RR.I18N.langs = ['en', 'vi'];  has(lang, key);  keys(lang);  raw(lang, key);  PARAMS (required params per key)
 *   Back-compat (Dee's card game): sayFlip/sayTap (name of a token), sayMatch/sayCorrect (= sayGo),
 *   sayMismatch (= sayWrong), sayReward (= sayCollect), cardPhrase (= phrase of a token).
 *
 * Event fields (all optional):
 *   go      { topic, nameKind, nameValue, token, promptKey, params }
 *   wrong   { topic, nameKind, nameValue, token, want:{kind, value}, promptKey, params }
 *   collect { topic, token }   token = hop token { kind, value, color?, shape?, n?, scale?, text?, animal?, nameKind, nameValue }
 *
 * Name kinds: color, shape, size, animal, number, stars, letter, text, sum, diff, parity, word ('dots' = old alias of stars).
 * Params: values may be RAW ({animal:'cow'}, {color:'red'}) — keys named like a name kind (color, shape, size, animal,
 * parity) are named automatically; an object {kind, value} is always replaced by name(lang, kind, value).
 * Derived params: {sound} from animal ({sound:'cow'} also works), {animal} from a bare animal id in {sound},
 * {letter}/{lower} from letter|text, {word} from word|animal|sprite, {expr} from expr|text|sum|diff|a,b(,op),
 * {starWord} ("star"/"stars", vi "ngôi sao") and {num} (number word) from n.
 * Keys with required params (PARAMS) fall back to a generic key when a param is missing (never "the !" on screen);
 * an unknown prompt key `p.<x>` falls back to `p.any`. {child}: if the child's name is empty, variants containing
 * {child} are skipped; if every variant has it, {child} becomes "friend" / "bé". Missing params are removed.
 *
 * Vietnamese letter names follow the kindergarten/grade-1 PHONICS convention ("đọc theo âm"):
 * B → "bờ", C → "cờ", K → "ca", Q → "quờ", Y → "i dài", Ă → "á", Â → "ớ" … (see LETTER_VI and docs/VOICE.md).
 */
(function (RR) {
  'use strict';

  var LANGS = ['en', 'vi'];
  var ANIMALS = ['cat', 'dog', 'cow', 'pig', 'sheep', 'duck', 'lion', 'frog'];

  // ---------------------------------------------------------------- names
  // Vietnamese animal names carry their classifier ("con bò"), as a kindergarten teacher says them.
  var NAMES = {
    en: {
      color: { red: 'red', blue: 'blue', yellow: 'yellow', green: 'green', orange: 'orange', purple: 'purple', pink: 'pink',
        brown: 'brown', white: 'white', cream: 'white' },
      shape: { circle: 'circle', square: 'square', triangle: 'triangle', star: 'star', heart: 'heart', rect: 'rectangle',
        rectangle: 'rectangle', oval: 'oval', diamond: 'diamond' },
      size: { big: 'big', small: 'little', little: 'little' },
      animal: { cat: 'cat', dog: 'dog', cow: 'cow', pig: 'pig', sheep: 'sheep', duck: 'duck', lion: 'lion', frog: 'frog' },
      parity: { odd: 'odd', even: 'even' }
    },
    vi: {
      color: { red: 'màu đỏ', blue: 'màu xanh dương', yellow: 'màu vàng', green: 'màu xanh lá', orange: 'màu cam',
        purple: 'màu tím', pink: 'màu hồng', brown: 'màu nâu', white: 'màu trắng', cream: 'màu trắng' },
      shape: { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', star: 'hình ngôi sao',
        heart: 'hình trái tim', rect: 'hình chữ nhật', rectangle: 'hình chữ nhật', oval: 'hình bầu dục',
        diamond: 'hình thoi' },
      size: { big: 'to', small: 'nhỏ', little: 'nhỏ' },
      animal: { cat: 'con mèo', dog: 'con chó', cow: 'con bò', pig: 'con heo', sheep: 'con cừu', duck: 'con vịt',
        lion: 'con sư tử', frog: 'con ếch' },
      parity: { odd: 'lẻ', even: 'chẵn' }
    }
  };
  // What each animal says (DESIGN §6). Vietnamese onomatopoeia as Vietnamese children say them.
  var SOUNDS = {
    en: { cat: 'meow', dog: 'woof', cow: 'moo', pig: 'oink', sheep: 'baa', duck: 'quack', lion: 'roar', frog: 'ribbit' },
    vi: { cat: 'meo meo', dog: 'gâu gâu', cow: 'ùm bò', pig: 'ụt ịt', sheep: 'be be', duck: 'cạp cạp', lion: 'gừm gừm',
      frog: 'ộp ộp' }
  };
  // The count tokens are little gold stars.
  var STAR = { en: ['star', 'stars'], vi: ['ngôi sao', 'ngôi sao'] };

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
        rect: ['rectangle', 'rectangles', 'long box'], rectangle: ['rectangle', 'rectangles'], oval: ['oval', 'egg', 'ovals'],
        diamond: ['diamond', 'kite', 'diamonds'] },
      size: { big: ['big', 'large', 'huge', 'bigger', 'giant'], small: ['little', 'small', 'tiny', 'smaller', 'baby'],
        little: ['little', 'small', 'tiny', 'smaller', 'baby'] },
      animal: {
        cat: ['cat', 'kitty', 'kitten', 'cats', 'kitty cat', 'pussycat'],
        dog: ['dog', 'doggy', 'puppy', 'dogs', 'doggie', 'pup', 'puppies'],
        cow: ['cow', 'cows', 'calf', 'moo cow'],
        pig: ['pig', 'piggy', 'piglet', 'pigs', 'piggie'],
        sheep: ['sheep', 'lamb', 'lambie', 'sheeps', 'little lamb'],
        duck: ['duck', 'ducky', 'duckling', 'ducks', 'duckie'],
        lion: ['lion', 'lions', 'lion cub', 'cub'],
        frog: ['frog', 'froggy', 'frogs', 'froggie', 'toad'] },
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
        cat: ['con mèo', 'mèo', 'mèo con', 'bạn mèo', 'mèo mèo'],
        dog: ['con chó', 'chó', 'chó con', 'con cún', 'cún', 'cún con'],
        cow: ['con bò', 'bò', 'bò sữa', 'con bê', 'bò con'],
        pig: ['con heo', 'heo', 'con lợn', 'lợn', 'heo con', 'lợn con'],
        sheep: ['con cừu', 'cừu', 'cừu con', 'cừu non'],
        duck: ['con vịt', 'vịt', 'vịt con'],
        lion: ['con sư tử', 'sư tử', 'sư tử con'],
        frog: ['con ếch', 'ếch', 'ếch con', 'con nhái', 'ếch xanh'] },
      parity: { odd: ['lẻ', 'số lẻ', 'lẽ', 'lẹ'], even: ['chẵn', 'số chẵn', 'chặn', 'chắn'] }
    }
  };

  // Default RR.WORDS (DESIGN §5.1) — word lists for the 'initial' topic. content.js loads later and may replace it.
  // vi: chó (ch) is skipped — Vietnamese phonics teaches ch / nh / th as their own sounds.
  var WORD_LIST = {
    en: [['cat', 'animal_cat', 'C'], ['dog', 'animal_dog', 'D'], ['cow', 'animal_cow', 'C'], ['pig', 'animal_pig', 'P'],
      ['sheep', 'animal_sheep', 'S'], ['duck', 'animal_duck', 'D'], ['lion', 'animal_lion', 'L'], ['frog', 'animal_frog', 'F']],
    vi: [['mèo', 'animal_cat', 'M'], ['bò', 'animal_cow', 'B'], ['heo', 'animal_pig', 'H'], ['cừu', 'animal_sheep', 'C'],
      ['vịt', 'animal_duck', 'V'], ['sư tử', 'animal_lion', 'S'], ['ếch', 'animal_frog', 'Ê']]
  };
  if (!RR.WORDS) {
    RR.WORDS = {};
    LANGS.forEach(function (l) {
      RR.WORDS[l] = WORD_LIST[l].map(function (w) { return { word: w[0], sprite: w[1], initial: w[2] }; });
    });
  }
  function spriteOfWord(lang, w) {        // looks in content's RR.WORDS first, then the default list
    var cur = RR.WORDS && RR.WORDS[lang], i;
    if (Array.isArray(cur)) for (i = 0; i < cur.length; i++) if (cur[i] && cur[i].word === w) return cur[i].sprite || null;
    for (i = 0; i < WORD_LIST[lang].length; i++) if (WORD_LIST[lang][i][0] === w) return WORD_LIST[lang][i][1];
    return null;
  }
  function wordOfSprite(lang, spr) {
    var cur = RR.WORDS && RR.WORDS[lang], i;
    if (Array.isArray(cur)) for (i = 0; i < cur.length; i++) if (cur[i] && cur[i].sprite === spr) return cur[i].word;
    for (i = 0; i < WORD_LIST[lang].length; i++) if (WORD_LIST[lang][i][1] === spr) return WORD_LIST[lang][i][0];
    return null;
  }
  function animalOf(v) {                  // 'cow' | 'animal_cow' | {kind:'animal', value:'cow'} → 'cow' | null
    if (v && typeof v === 'object') v = v.value != null ? v.value : v.sprite;
    if (v == null) return null;
    var s = String(v).replace(/^animal_/, '').replace(/_wave$/, '').replace(/\.svg$/, '');
    return ANIMALS.indexOf(s) >= 0 ? s : null;
  }

  // ---------------------------------------------------------------- strings
  var TOPICS = ['colors', 'size', 'shapes', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
  var NAME_KINDS = ['color', 'shape', 'size', 'animal', 'number', 'stars', 'letter', 'text', 'sum', 'diff', 'parity', 'word'];
  // prompt keys content.js can ask for (DESIGN §5.1) and their required params
  var PROMPTS = {
    'p.colors': ['color'], 'p.colors.night': ['color'], 'p.shapes': ['shape'], 'p.countUp': ['n'], 'p.count': ['n'],
    'p.animals': ['animal'], 'p.sound': ['animal', 'sound'], 'p.size': ['size', 'animal'], 'p.letters': ['letter'],
    'p.lower': ['letter'], 'p.initial': ['letter'], 'p.add': ['expr'], 'p.sub': ['expr'], 'p.oddeven': ['parity']
  };

  var STR = {
    en: {
      'ui.title': 'Bim’s Rainbow Rocket',
      'ui.logo1': 'Bim’s',
      'ui.logo2': 'Rainbow Rocket',
      'ui.subtitle': 'Fly, find and learn with Bim!',
      'ui.tagline': 'Fly, find and learn with Bim!',
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
      'ui.voice': 'Bim’s voice',
      'ui.mic': 'Answer by voice',
      'ui.done': 'Done',
      'ui.stars': 'Stars',
      'ui.chapter': 'Chapter {n}',
      'ui.allDone': 'All done! {stars} stars',
      'ui.welcome': ['Hi {child}! I am Bim. Let’s fly my rocket!', 'Hi! I am Bim. Let’s fly my rocket!'],
      'ui.micUnsupported': 'Voice answers are not available here. Tap the pictures!',
      'ui.micDenied': 'The microphone is off. Tap the pictures instead!',
      'ui.voiceMissing': 'Tip for parents: add a voice in Settings › Accessibility › Spoken Content › Voices.',
      'ui.tapOrSay': 'Tap or say the answer!',
      'ui.listening': 'Bim is listening…',
      'ui.tapBim': 'Tap Bim to hear it again',
      'ui.skip': 'Skip',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Rainbow Clouds',
      'topic.size': 'Big and Little',
      'topic.shapes': 'Shape Gems',
      'topic.count': 'Counting Stars',
      'topic.animals': 'Sky Friends',
      'topic.letters': 'Letter Clouds',
      'topic.lower': 'Big and Small Letters',
      'topic.initial': 'First Letters',
      'topic.add': 'Adding Up',
      'topic.sub': 'Take Away',
      'topic.oddeven': 'Odd and Even',

      'weather.0': 'Good morning, sky!',
      'weather.1': 'Hello, sunshine!',
      'weather.2': 'What a pretty sunset!',
      'weather.3': 'Look at all the stars!',

      'p.any': ['Where shall we fly? Tap a cloud!', 'Pick a cloud and let’s fly!', 'Tap a cloud to fly there!'],
      'p.colors': ['Fly to the {color} cloud!', 'Where is the {color} cloud? Fly there!', 'Let’s find {color}! Tap the {color} cloud!'],
      'p.colors.night': ['Fly to the {color} planet!', 'Where is the {color} planet? Fly there!', 'Let’s find {color}! Tap the {color} planet!'],
      'p.shapes': ['Find the {shape}!', 'Fly to the {shape}!', 'Where is the {shape}? Let’s fly!'],
      'p.countUp': ['Let’s count up! Fly to {n}!', 'Now {n}!', 'Next is {n}! Fly to {n}!'],
      'p.count': ['Find {n} {starWord}! Fly there!', 'Which one has {n} {starWord}? Let’s fly!', 'Count the stars! Fly to {n} {starWord}!'],
      'p.animals': ['Let’s pick up the {animal}!', 'Fly to the {animal}!', 'Where is the {animal}? Let’s fly there!'],
      'p.sound': ['Who says {sound}? Fly to them!', 'Listen! {sound}! Who says that?', 'Who says {sound}? Let’s pick them up!'],
      'p.size': ['Fly to the {size} {animal}!', 'Find the {size} {animal}!', 'Where is the {size} {animal}? Let’s fly!'],
      'p.letters': ['Fly to the letter {letter}!', 'Find the letter {letter}!', 'Where is the letter {letter}? Let’s fly!'],
      'p.lower': ['Big letter {letter}! Find its small letter!', 'Fly to the small letter {lower}!', 'Where is the small letter {lower}?'],
      'p.initial': ['Who starts with the letter {letter}? Fly there!', 'Find the friend whose name starts with the letter {letter}!',
        'The letter {letter}! Which friend starts with it?'],
      'p.add': ['What is {expr}? Fly to the answer!', '{expr} makes how many? Let’s fly!', 'Add them up! {expr}!'],
      'p.sub': ['What is {expr}? Fly to the answer!', 'Take away! {expr} leaves how many?', '{expr}… how many are left?'],
      'p.oddeven': ['Fly to a {parity} number!', 'Find the {parity} number!', 'Which number is {parity}? Let’s fly!'],

      'go': ['{it}! Blast off!', '{it}! Let’s fly!', '{it}! Zoom, zoom!'],
      'go.sound': ['The {animal} says {sound}! Blast off!', 'Yes, {sound}! Let’s fly to the {animal}!'],
      'go.math': ['{expr} is {num}! Blast off!', 'Yes! {expr} makes {num}! Let’s fly!'],
      'go.oddeven': ['{num} is {parity}! Blast off!', 'Yes, {num} is {parity}! Let’s fly!'],
      'go.initial': ['{word} starts with the letter {letter}! Blast off!', 'Yes! {word} starts with the letter {letter}!'],
      'go.lower': ['Big {letter}, small {lower}! Blast off!', 'Yes, small letter {lower}! Let’s fly!'],

      'collect': ['Got it!', 'Into the wagon!', 'In it goes!', 'Yay, one more!', 'Wheee! Got it!'],
      'collect.number': ['{num}! Into the wagon!', '{num}! Got it!'],
      'collect.animal': ['Hello, {animal}! {sound}!', 'Hop in, {animal}! {sound}!', 'Welcome aboard, {animal}! {sound}!'],
      'say.countDone': '{num}! {num} {starWord}!',

      'wrong.it': ['That’s {it}.', 'Hmm, that’s {it}.', 'This one is {it}.'],
      'wrong.oddeven': ['That’s {num}, an {parity} number.', 'Hmm, {num} is {parity}.'],
      'wrong.find': ['Let’s find {want}!', 'Can you find {want}?', 'Now let’s look for {want}!'],
      'wrong.sound': ['Who says {sound}?', 'Listen! Who says {sound}?'],
      'wrong.math': ['What is {expr}?', 'Let’s count again: {expr}!'],
      'wrong.initialIt': ['{word} starts with the letter {first}.', 'Hmm, {word} starts with the letter {first}.'],
      'wrong.initial': ['Who starts with the letter {letter}?', 'Let’s find a friend for the letter {letter}!'],
      'wrong.lower': ['Big letter {letter}! Let’s find its small letter!', 'Let’s find the small letter for big {letter}!'],
      'wrong.parity': ['Let’s find a {parity} number!', 'Can you find the {parity} number?'],
      'wrong': ['Let’s try another one!', 'Hmm, let’s look again!', 'So close! One more try!', 'Let’s think again!',
        'Keep trying, you can do it!', 'Try another cloud!'],
      'miss': ['Tap a cloud!', 'The clouds are up there!', 'Try a cloud!', 'Touch a cloud to fly!', 'Pick a cloud!'],
      'tapPad': ['We are here already! Pick a new cloud!', 'This is our launch pad! Tap another cloud!'],

      'boost': ['Tap the rocket! Blast off!', 'Ready? Tap the rocket!', 'Big boost! Tap the rocket!',
        'Tap, tap! Time to zoom up!', 'Tap the rocket, {child}!'],
      'boostGo': ['Three, two, one… whoosh!', 'Blast off!', 'Up, up and away!', 'Zoom! Higher and higher!'],
      'surprise.drift': ['Whoosh! The wind is moving the clouds!', 'The clouds are drifting! Watch them float!'],
      'surprise.shooting': ['Look up! A shooting star might fly by!', 'Psst! Watch for a shooting star!'],
      'shooting.tap': ['You caught a shooting star! Sparkles!', 'Wow! Star sparkles for you!'],

      'praise': ['Yes!', 'Great job!', 'You got it!', 'Super!', 'Wonderful!', 'Nice one!', 'Hooray!', 'Well done!'],
      'great': ['Great flying, {child}!', 'You did it, {child}!', 'What a pilot!', 'Wow, {child}, super flying!',
        'Hooray! Round done!', 'You are so clever!', 'Super pilot!'],
      'hint': ['Psst! Look at the glowing one!', 'Here is a clue! The sparkly one!', 'Bim will help! Look here!',
        'Look! That one is bouncing!', 'Try the shiny one!'],
      'idle': ['Tap a cloud to fly!', 'Want to fly? Tap a cloud!', 'Bim is waiting! Your turn!',
        'Where shall we fly? Tap one!', 'I am here, {child}! Let’s fly!', 'Draw a line from the rocket!'],

      'talk.intro': 'Talk time! Bim has a question.',
      'talk.colors': 'What colour is this?',
      'talk.size': 'Is it big or little?',
      'talk.shapes': 'What shape is this?',
      'talk.count': 'How many stars?',
      'talk.animals': 'Where is the {animal}?',
      'talk.animalsAny': 'Which animal is this?',
      'talk.sound': 'Who says {sound}?',
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
        'We flew to the moon! {stars} stars!']
    },
    vi: {
      'ui.title': 'Tên Lửa Cầu Vồng Của Voi Bim',
      'ui.logo1': 'Voi Bim',
      'ui.logo2': 'Tên Lửa Cầu Vồng',
      'ui.subtitle': 'Cùng voi Bim bay lên, tìm và học nhé!',
      'ui.tagline': 'Cùng voi Bim bay lên, tìm và học nhé!',
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
      'ui.voice': 'Giọng của Bim',
      'ui.mic': 'Trả lời bằng giọng nói',
      'ui.done': 'Xong',
      'ui.stars': 'Ngôi sao',
      'ui.chapter': 'Chương {n}',
      'ui.allDone': 'Hoàn thành! {stars} ngôi sao',
      'ui.welcome': ['Chào bé {child}! Mình là voi Bim. Mình cùng bay tên lửa nhé!',
        'Chào bé! Mình là voi Bim. Mình cùng bay tên lửa nhé!'],
      'ui.micUnsupported': 'Máy này chưa nghe được giọng nói. Bé chạm vào hình nhé!',
      'ui.micDenied': 'Micrô đang tắt. Bé chạm vào hình nhé!',
      'ui.voiceMissing': 'Mẹo cho bố mẹ: thêm giọng tiếng Việt trong Cài đặt › Trợ năng › Nội dung được đọc › Giọng nói.',
      'ui.tapOrSay': 'Bé chạm hoặc nói đáp án nhé!',
      'ui.listening': 'Bim đang nghe…',
      'ui.tapBim': 'Chạm vào Bim để nghe lại nhé',
      'ui.skip': 'Bỏ qua',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Mây sắc màu',
      'topic.size': 'To và nhỏ',
      'topic.shapes': 'Viên ngọc hình khối',
      'topic.count': 'Đếm ngôi sao',
      'topic.animals': 'Bạn thú trên mây',
      'topic.letters': 'Chữ cái trên mây',
      'topic.lower': 'Chữ hoa, chữ thường',
      'topic.initial': 'Chữ cái đầu tiên',
      'topic.add': 'Phép cộng',
      'topic.sub': 'Phép trừ',
      'topic.oddeven': 'Số chẵn, số lẻ',

      'weather.0': 'Chào buổi sáng, bầu trời ơi!',
      'weather.1': 'Chào ông mặt trời!',
      'weather.2': 'Hoàng hôn đẹp quá!',
      'weather.3': 'Nhìn kìa, bao nhiêu là sao!',

      'p.any': ['Mình bay đi đâu nhỉ? Bé chạm một đám mây nhé!', 'Bé chọn một đám mây rồi bay nào!',
        'Bé chạm vào đám mây để bay tới đó nhé!'],
      'p.colors': ['Bé ơi, bay tới đám mây {color} nhé!', 'Đám mây {color} ở đâu nhỉ? Bay tới đó nào!',
        'Tìm {color} nào! Bé chạm đám mây {color} nhé!'],
      'p.colors.night': ['Bé ơi, bay tới hành tinh {color} nhé!', 'Hành tinh {color} ở đâu nhỉ? Bay tới đó nào!',
        'Tìm {color} nào! Bé chạm hành tinh {color} nhé!'],
      'p.shapes': ['Bé ơi, tìm {shape} nhé!', 'Bay tới {shape} nào!', '{shape} ở đâu nhỉ? Bay thôi!'],
      'p.countUp': ['Mình đếm lên nhé! Bay tới số {n}!', 'Giờ tới số {n}!', 'Tiếp theo là số {n}! Bay nào!'],
      'p.count': ['Bé ơi, tìm {n} {starWord} nhé!', 'Chỗ nào có {n} {starWord} nhỉ? Bay nào!',
        'Bé đếm sao nhé! Bay tới {n} {starWord}!'],
      'p.animals': ['Bé ơi, mình đón {animal} nhé!', 'Bay tới {animal} nào!', '{animal} ở đâu nhỉ? Bay tới đó nào!'],
      'p.sound': ['Con gì kêu {sound}? Bé bay tới đó nhé!', 'Nghe nè! {sound}! Con gì kêu thế nhỉ?',
        'Bạn nào kêu {sound} nhỉ? Mình đón bạn ấy nhé!'],
      'p.size': ['Bé ơi, bay tới {animal} {size} nhé!', 'Bé tìm {animal} {size} nào!', '{animal} {size} ở đâu nhỉ? Bay nào!'],
      'p.letters': ['Bé ơi, bay tới chữ {letter} nhé!', 'Bé tìm chữ {letter} nào!', 'Chữ {letter} ở đâu nhỉ? Bay nào!'],
      'p.lower': ['Chữ {letter} in hoa! Bé tìm chữ thường của nó nhé!', 'Bé bay tới chữ {lower} viết thường nhé!',
        'Chữ {lower} viết thường ở đâu nhỉ?'],
      'p.initial': ['Bạn nào bắt đầu bằng chữ {letter}? Bé bay tới đó nhé!', 'Bé tìm bạn có tên bắt đầu bằng chữ {letter} nhé!',
        'Chữ {letter}! Bạn nào bắt đầu bằng chữ này nhỉ?'],
      'p.add': ['{expr} bằng mấy? Bé bay tới đáp số nhé!', 'Bé cộng nhé: {expr} bằng mấy?', '{expr} là bao nhiêu nhỉ? Bay nào!'],
      'p.sub': ['{expr} bằng mấy? Bé bay tới đáp số nhé!', 'Bé bớt đi nhé: {expr} còn mấy?', '{expr} còn lại bao nhiêu nhỉ?'],
      'p.oddeven': ['Bé ơi, bay tới số {parity} nhé!', 'Bé tìm số {parity} nào!', 'Số nào là số {parity} nhỉ? Bay nào!'],

      'go': ['{it}! Bay nào!', '{it}! Phóng lên nào!', '{it}! Vút vút!'],
      'go.sound': ['{animal} kêu {sound}! Bay nào!', 'Đúng rồi, {sound}! Bay tới {animal} nào!'],
      'go.math': ['{expr} bằng {num}! Bay nào!', 'Đúng rồi! {expr} bằng {num}! Phóng lên nào!'],
      'go.oddeven': ['Số {num} là số {parity}! Bay nào!', 'Đúng rồi, {num} là số {parity}! Phóng lên nào!'],
      'go.initial': ['{word} bắt đầu bằng chữ {letter}! Bay nào!', 'Đúng rồi! {word} bắt đầu bằng chữ {letter}!'],
      'go.lower': ['Chữ {letter} in hoa, chữ {lower} thường! Bay nào!', 'Đúng rồi, chữ {lower} thường! Phóng lên nào!'],

      'collect': ['Lấy được rồi!', 'Vào xe mây nào!', 'Thêm một cái nè!', 'Hay quá, lấy rồi!', 'A ha, vào xe rồi!'],
      'collect.number': ['Số {num}! Vào xe mây nào!', 'Số {num}! Lấy được rồi!'],
      'collect.animal': ['Chào {animal}! {sound}!', '{animal} lên xe nào! {sound}!', 'Chào bạn nhé, {animal}! {sound}!'],
      'say.countDone': '{num}! {num} {starWord}!',

      'wrong.it': ['Đây là {it} nè.', 'À, đây là {it}.', 'Ồ, {it} đó.'],
      'wrong.oddeven': ['Đây là số {num}, số {parity} đó.', 'À, số {num} là số {parity}.'],
      'wrong.find': ['Mình tìm {want} nhé!', 'Bé tìm {want} nào!', '{want} ở đâu nhỉ?'],
      'wrong.sound': ['Con gì kêu {sound} nhỉ?', 'Bé nghe nè! Con gì kêu {sound}?'],
      'wrong.math': ['{expr} bằng mấy nhỉ?', 'Bé đếm lại nhé: {expr}!'],
      'wrong.initialIt': ['{word} bắt đầu bằng chữ {first} đó.', 'À, {word} bắt đầu bằng chữ {first}.'],
      'wrong.initial': ['Bạn nào bắt đầu bằng chữ {letter} nhỉ?', 'Mình tìm bạn của chữ {letter} nhé!'],
      'wrong.lower': ['Chữ {letter} in hoa! Mình tìm chữ thường của nó nhé!', 'Bé tìm chữ thường của chữ {letter} nhé!'],
      'wrong.parity': ['Mình tìm số {parity} nhé!', 'Bé tìm số {parity} nào!'],
      'wrong': ['Mình thử đám mây khác nhé!', 'Hì, mình nhìn lại nào!', 'Suýt nữa thôi! Thử tiếp nhé!',
        'Bé nghĩ thêm chút nữa nhé!', 'Cố lên, bé làm được mà!', 'Bé thử lại nào!'],
      'miss': ['Bé chạm vào một đám mây nhé!', 'Các đám mây ở trên kia nè!', 'Bé thử chạm một đám mây nào!',
        'Chạm vào đám mây để bay nhé!', 'Chọn một đám mây nào bé ơi!'],
      'tapPad': ['Mình đang ở đây rồi! Bé chọn đám mây mới nhé!', 'Đây là bệ phóng! Bé chạm đám mây khác nào!'],

      'boost': ['Bé chạm tên lửa nhé! Phóng nào!', 'Sẵn sàng chưa? Chạm vào tên lửa nào!', 'Tăng tốc nè! Bé chạm tên lửa nhé!',
        'Chạm chạm! Bay vút lên nào!', 'Bé {child} chạm tên lửa nhé!'],
      'boostGo': ['Ba, hai, một… vút!', 'Phóng nào!', 'Bay lên, bay lên cao!', 'Vút! Cao nữa, cao nữa!'],
      'surprise.drift': ['Vù vù! Gió đang đẩy các đám mây kìa!', 'Mây trôi rồi! Bé nhìn mây bay nè!'],
      'surprise.shooting': ['Bé nhìn lên nhé! Sắp có sao băng đó!', 'Suỵt! Bé chờ sao băng bay qua nhé!'],
      'shooting.tap': ['Bé bắt được sao băng rồi! Lấp lánh quá!', 'Oa! Sao lấp lánh cho bé nè!'],

      'praise': ['Đúng rồi!', 'Giỏi quá!', 'Tuyệt vời!', 'Hoan hô!', 'Bé giỏi lắm!', 'Chính xác!', 'Siêu quá!', 'Hay lắm!'],
      'great': ['Bé {child} bay giỏi quá!', 'Hoan hô bé {child}!', 'Phi công tí hon giỏi quá!', 'Oa, bé {child} giỏi quá!',
        'Hoan hô, xong một chặng rồi!', 'Bé thông minh quá!', 'Bé lái tên lửa giỏi quá!'],
      'hint': ['Nhìn nè! Cái này đang sáng lên.', 'Bé thử cái lấp lánh nhé!', 'Bim gợi ý nè: nhìn đây!',
        'Voi Bim giúp bé nhé, nhìn đây!', 'Cái này đang nhún nhảy đó bé!'],
      'idle': ['Bé ơi, chạm đám mây để bay nào!', 'Bé muốn bay không? Chạm một đám mây nhé!', 'Voi Bim đang chờ bé nè!',
        'Mình bay đi đâu nhỉ? Bé chọn nhé!', 'Bé {child} ơi, mình bay tiếp nhé!', 'Bé kéo một đường từ tên lửa nhé!'],

      'talk.intro': 'Giờ trò chuyện! Voi Bim hỏi bé nhé.',
      'talk.colors': 'Cái này màu gì nhỉ?',
      'talk.size': 'Bạn này to hay nhỏ nhỉ?',
      'talk.shapes': 'Cái này hình gì nhỉ?',
      'talk.count': 'Có mấy ngôi sao nào?',
      'talk.animals': '{animal} đâu rồi nhỉ?',
      'talk.animalsAny': 'Đây là con gì nhỉ?',
      'talk.sound': 'Con gì kêu {sound} nhỉ?',
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
        'Mình bay tới mặt trăng rồi! {stars} ngôi sao!']
    }
  };

  // required params → fallback key when one is missing (checked AFTER derived params are filled in)
  var NEEDS = {
    'talk.animals': ['animal'], 'talk.sound': ['sound'], 'say.countDone': ['num'],
    'go': ['it'], 'go.sound': ['animal', 'sound'], 'go.math': ['expr', 'num'], 'go.oddeven': ['num', 'parity'],
    'go.initial': ['word', 'letter'], 'go.lower': ['letter', 'lower'], 'collect.animal': ['animal', 'sound'], 'collect.number': ['num'],
    'wrong.it': ['it'], 'wrong.oddeven': ['num', 'parity'], 'wrong.find': ['want'], 'wrong.sound': ['sound'],
    'wrong.math': ['expr'], 'wrong.initial': ['letter'], 'wrong.initialIt': ['word', 'first'], 'wrong.lower': ['letter'], 'wrong.parity': ['parity'],
    'talk.wrong': ['answer'], 'talk.wrong.a': ['answer'], 'talk.wrong.animal': ['answer'],
    'talk.wrong.letter': ['letter'], 'talk.wrong.number': ['answer'], 'talk.wrong.size': ['answer']
  };
  Object.keys(PROMPTS).forEach(function (k) { NEEDS[k] = PROMPTS[k]; });
  var FALLBACK = { 'talk.animals': 'talk.animalsAny', 'talk.sound': 'talk.animalsAny', 'say.countDone': 'praise',
    'p.colors.night': 'p.colors', 'go': 'praise', 'collect.animal': 'collect', 'collect.number': 'collect' };
  Object.keys(PROMPTS).forEach(function (k) { if (!FALLBACK[k]) FALLBACK[k] = 'p.any'; });
  ['go.sound', 'go.math', 'go.oddeven', 'go.initial', 'go.lower'].forEach(function (k) { FALLBACK[k] = 'praise'; });
  ['wrong.it', 'wrong.initialIt', 'wrong.oddeven', 'wrong.find', 'wrong.sound', 'wrong.math', 'wrong.initial', 'wrong.lower', 'wrong.parity',
    'talk.wrong', 'talk.wrong.a', 'talk.wrong.animal', 'talk.wrong.letter', 'talk.wrong.number', 'talk.wrong.size']
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
  function starWord(lang, n) { return STAR[lang][n === 1 ? 0 : 1]; }
  function isLetter(s) { return typeof s === 'string' && /^\p{L}$/u.test(s); }
  function soundOf(lang, a) { a = animalOf(a); return a ? SOUNDS[L(lang)][a] : ''; }

  function sizeOf(v) {                     // 'big' | 'small' | 'little' | 'cow_small' | 'small:cow' → 'big'|'small'|null
    var s = String(rawVal(v) == null ? '' : rawVal(v)).toLowerCase();
    if (/(^|[_:\-\s])big($|[_:\-\s])/.test(s) || s === 'large') return 'big';
    if (/(^|[_:\-\s])(small|little)($|[_:\-\s])/.test(s)) return 'small';
    return null;
  }
  function animalIn(v) {                   // finds an animal id inside 'cow_small', 'animal_cow', 'small:cow'
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
      case 'stars': case 'dots': {
        var n = num(value);
        return n == null ? String(value) : numberName(lang, n) + ' ' + starWord(lang, n);
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
      case 'stars': case 'dots': {
        var dn = num(value);
        out = numberWords(lang, value);
        if (dn != null) addForms(out, [name(lang, 'stars', dn), dn + ' ' + starWord(lang, dn)]);
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

  // Fill in the derived params ({animal}, {sound}, {letter}, {lower}, {word}, {expr}, {starWord}, {num}).
  function derive(lang, params) {
    var p = {}, k;
    if (params && typeof params === 'object') for (k in params) if (Object.prototype.hasOwnProperty.call(params, k)) p[k] = params[k];
    // {sound}: an animal id in {sound} (Kitten-style) → {animal} + the real sound
    if (present(p.sound) && animalOf(rawVal(p.sound))) {
      if (!present(p.animal)) p.animal = animalOf(rawVal(p.sound));
      p.sound = soundOf(lang, rawVal(p.sound));
    }
    if (!present(p.animal) && present(p.sprite) && animalOf(rawVal(p.sprite))) p.animal = animalOf(rawVal(p.sprite));
    if (!present(p.sound) && present(p.animal) && animalIn(rawVal(p.animal))) p.sound = soundOf(lang, animalIn(rawVal(p.animal)));
    if (present(p.sound)) p.sound = String(rawVal(p.sound));
    // {letter} / {lower}
    if (!present(p.letter) && present(p.text) && isLetter(String(rawVal(p.text)))) p.letter = String(rawVal(p.text));
    if (present(p.letter)) {
      p.letter = String(rawVal(p.letter));
      if (!present(p.lower)) p.lower = p.letter.toLowerCase();
    }
    if (present(p.lower)) p.lower = String(rawVal(p.lower));
    // {word} (initial topic): word | animal | sprite
    if (!present(p.word)) {
      var src = present(p.sprite) ? rawVal(p.sprite) : present(p.animal) ? rawVal(p.animal) : null;
      if (src != null) {
        var a = animalIn(src);
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
    // {starWord} + {num} from n
    var c = present(p.n) ? num(p.n) : null;
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
  I18N.sound = function (lang, animal) { return soundOf(lang, animal && typeof animal === 'object' ? animalIn(animal.value) : animal); };
  I18N.hasSound = function (animal) { return !!animalOf(animal); };
  I18N.has = function (lang, key) { return STR[L(lang)][key] != null; };
  I18N.keys = function (lang) { return Object.keys(STR[L(lang)]); };
  I18N.raw = function (lang, key) { return STR[L(lang)][key]; };
  I18N.setChild = function (nm) { I18N.child = nm ? String(nm).trim().slice(0, 24) : ''; };
  I18N.TOPICS = TOPICS.slice();
  I18N.ANIMALS = ANIMALS.slice();
  I18N.NAME_KINDS = NAME_KINDS.slice();
  I18N.PROMPTS = PROMPTS;        // prompt keys + their required params (for tests / content)
  I18N.PARAMS = NEEDS;           // required params per key (for tests)
  I18N.NAME_TABLE = NAMES;       // read-only use (tests / UI)
  I18N.SOUNDS = SOUNDS;
  I18N.LETTER_VI = LETTER_VI;
  I18N.WORD_LIST = WORD_LIST;

  // ---------------------------------------------------------------- tokens → meaning
  // sem = { k: 'color'|'shape'|'animal'|'size'|'stars'|'number'|'letter'|'expr'|'word'|'parity'|null, … }
  function semOf(kind, value, tok, ctx) {
    tok = obj(tok); ctx = ctx || {};
    if (value && typeof value === 'object' && 'value' in value) { if (kind == null) kind = value.kind; value = value.value; }
    if (kind == null) kind = tok.nameKind != null ? tok.nameKind : tok.kind;
    if (value == null || value === '') {
      value = tok.nameValue != null ? tok.nameValue : tok.value != null ? tok.value : tok.n != null ? tok.n :
        tok.text != null ? tok.text : null;
    }
    var topic = ctx.topic || null;
    var scale = typeof tok.scale === 'number' ? tok.scale : null;
    var s = { k: null };
    switch (kind) {
      case 'color': {
        var col = NAMES.en.color[value] != null ? value : tok.color;
        if (col != null && NAMES.en.color[col] != null) s = { k: 'color', color: col };
        break;
      }
      case 'shape': {
        var sh = NAMES.en.shape[value] != null ? value : tok.shape;
        if (sh != null && NAMES.en.shape[sh] != null) {
          s = { k: 'shape', shape: sh };
          if (tok.color != null && NAMES.en.color[tok.color] != null) s.color = tok.color;
        }
        break;
      }
      case 'size': case 'animal': {
        var an = animalIn(value) || animalIn(tok.animal) || animalIn(tok.sprite) || animalIn(tok.value) || animalIn(ctx.animal);
        var sz = sizeOf(value) || sizeOf(tok.size) || null;
        if (!sz && kind === 'size' && sizeOf(tok.value)) sz = sizeOf(tok.value);
        if (!sz && scale != null && (kind === 'size' || topic === 'size')) sz = scale < 0.85 ? 'small' : 'big';
        if (an) { s = { k: 'animal', animal: an }; if (sz) s.size = sz; }
        else if (sz) s = { k: 'size', size: sz };
        break;
      }
      case 'stars': case 'dots': {
        var dn = num(value); if (dn == null) dn = num(tok.n);
        if (dn != null) s = { k: 'stars', n: dn };
        break;
      }
      case 'number': {
        var nn = num(value); if (nn == null) nn = num(tok.n); if (nn == null) nn = num(tok.text);
        if (nn != null) s = { k: 'number', n: nn };
        break;
      }
      case 'parity': {
        var pn = num(value); if (pn == null) pn = num(tok.n); if (pn == null) pn = num(tok.text);
        if (pn != null) s = { k: 'number', n: pn };
        else if (value === 'odd' || value === 'even') s = { k: 'parity', parity: value };
        break;
      }
      case 'letter': {
        var lt = isLetter(String(value)) ? String(value) : isLetter(String(tok.text)) ? String(tok.text) : null;
        if (lt) s = { k: 'letter', letter: lt, small: lt !== lt.toUpperCase() };
        break;
      }
      case 'sum': case 'diff': {
        var ex = splitOp(value) ? value : splitOp(tok.text) ? tok.text : null;
        if (ex != null) s = { k: 'expr', expr: String(ex) };
        else if (num(value) != null) s = { k: 'number', n: num(value) };
        break;
      }
      case 'text': {
        var tx = value != null ? String(value) : '';
        if (splitOp(tx)) s = { k: 'expr', expr: tx };
        else if (num(tx) != null) s = { k: 'number', n: num(tx) };
        else if (isLetter(tx)) return semOf('letter', tx, tok, ctx);
        else if (animalIn(tx)) return semOf('animal', tx, tok, ctx);
        else if (tx) s = { k: 'word', word: tx };
        break;
      }
      case 'word': {
        var wv = value != null ? String(value) : '';
        var wa = animalOf(wv) || animalOf(tok.sprite) || animalOf(spriteOfWord(ctx.lang || 'en', wv)) ||
          animalOf(spriteOfWord('vi', wv)) || animalOf(spriteOfWord('en', wv));
        if (wa) s = { k: 'word', animal: wa };
        else if (wv) s = { k: 'word', word: wv };
        break;
      }
      default: {
        if (value != null && value !== '' && typeof value !== 'object') {
          if (num(value) != null) s = { k: 'number', n: num(value) };
          else if (animalIn(value)) s = { k: 'animal', animal: animalIn(value) };
          else if (NAMES.en.color[value] != null) s = { k: 'color', color: value };
          else if (NAMES.en.shape[value] != null) s = { k: 'shape', shape: value };
          else if (splitOp(value)) s = { k: 'expr', expr: String(value) };
          else if (isLetter(String(value))) return semOf('letter', value, tok, ctx);
        }
      }
    }
    if ((s.k === 'number' || s.k === 'stars') && s.n != null &&
        (topic === 'oddeven' || kind === 'parity' || tok.parity === 'odd' || tok.parity === 'even'))
      s.parity = s.n % 2 ? 'odd' : 'even';
    return s;
  }
  function ctxOf(ev, lang) {
    var p = obj(ev.params);
    return { topic: ev.topic || null, lang: lang, animal: ev.animal || p.animal || null };
  }
  // the tapped / flown-to thing of an event
  function semOfEvent(ev, lang) {
    var tok = obj(ev.token);
    var kind = ev.nameKind != null ? ev.nameKind : tok.nameKind != null ? tok.nameKind : tok.kind;
    var value = ev.nameValue != null ? ev.nameValue : null;
    var ctx = ctxOf(ev, lang);
    ctx.animal = null;                     // the tapped token names its own animal
    return semOf(kind, value, tok, ctx);
  }

  // How a thing is named inside a sentence. role 'it' = what was tapped ("a red circle"), 'want' = the goal ("the star"),
  // 'go' = a short exclamation ("Star", "The cow", "Three stars").
  function phraseOf(lang, s, role) {
    var vi = lang === 'vi', out;
    switch (s.k) {
      case 'color': out = name(lang, 'color', s.color); break;
      case 'shape':
        if (vi) out = name(lang, 'shape', s.shape) + (role === 'it' && s.color ? ' ' + name(lang, 'color', s.color) : '');
        else if (role === 'go') out = name(lang, 'shape', s.shape);
        else out = (role === 'want' ? 'the ' : 'a ') + (role === 'it' && s.color ? name(lang, 'color', s.color) + ' ' : '') +
          name(lang, 'shape', s.shape);
        break;
      case 'animal':
        if (vi) out = NAMES.vi.animal[s.animal] + (s.size ? ' ' + NAMES.vi.size[s.size] : '');
        else out = 'the ' + (s.size ? NAMES.en.size[s.size] + ' ' : '') + NAMES.en.animal[s.animal];
        break;
      case 'size': out = (vi ? 'bạn ' : 'the ') + NAMES[lang].size[s.size] + (vi ? '' : ' one'); break;
      case 'stars': out = numberName(lang, s.n) + ' ' + starWord(lang, s.n); break;
      case 'number': out = vi ? 'số ' + numberName(lang, s.n) : numberName(lang, s.n); break;
      case 'letter':
        if (vi) out = 'chữ ' + s.letter + (s.small ? ' thường' : '');
        else out = s.small ? 'small letter ' + s.letter : (role === 'go' ? 'letter ' : 'the letter ') + s.letter;
        break;
      case 'expr': out = exprText(s.expr); break;
      case 'word':
        if (s.animal) out = vi ? NAMES.vi.animal[s.animal] : 'the ' + NAMES.en.animal[s.animal];
        else out = String(s.word);
        break;
      case 'parity': out = (vi ? 'số ' : '') + name(lang, 'parity', s.parity); break;
      default: out = '';
    }
    return lang === 'en' ? anFix(out) : out;
  }
  I18N.phrase = function (lang, kind, value, tok) {
    lang = L(lang);
    return phraseOf(lang, semOf(kind, value, tok, { lang: lang }), 'it');
  };
  I18N.cardPhrase = function (lang, card) {
    lang = L(lang);
    card = obj(card);
    return phraseOf(lang, semOf(card.nameKind, card.nameValue, card.face || card.token || card, { lang: lang }), 'it');
  };

  function countLine(lang, n) {               // "One, two, three stars!" (n ≤ 5) · "Seven stars!"
    var head;
    if (n >= 1 && n <= 5) {
      var parts = [];
      for (var i = 1; i <= n; i++) parts.push(numberName(lang, i));
      head = parts.join(', ');
    } else head = numberName(lang, n);
    return capFirst(head + ' ' + starWord(lang, n) + '!');
  }
  function topicOf(ev) {
    var t = ev.topic, pk = String(ev.promptKey || '');
    if (!t && /^p\./.test(pk)) t = pk.slice(2).split('.')[0];
    if (t === 'sound' || t === 'countUp') t = t === 'sound' ? 'animals' : 'count';
    return t || null;
  }
  // the goal of the current hop, from ev.want or the prompt params
  function wantOf(ev, lang) {
    var w = obj(ev.want), p = obj(ev.params), topic = topicOf(ev);
    var ctx = { topic: topic, lang: lang, animal: p.animal || null };
    if (w.kind != null || w.value != null) return semOf(w.kind, w.value, w.token || null, ctx);
    var pk = String(ev.promptKey || '');
    if (present(p.color)) return semOf('color', rawVal(p.color), null, ctx);
    if (present(p.shape)) return semOf('shape', rawVal(p.shape), null, ctx);
    if (present(p.size) && present(p.animal)) return semOf('size', rawVal(p.size), null, ctx);
    if (present(p.animal)) return semOf('animal', rawVal(p.animal), null, ctx);
    if (present(p.n)) return semOf(pk === 'p.count' ? 'stars' : 'number', rawVal(p.n), null, ctx);
    if (present(p.parity)) return { k: 'parity', parity: rawVal(p.parity) };
    if (present(p.letter)) return semOf('letter', rawVal(p.letter), null, ctx);
    return { k: null };
  }

  // initial topic: the word an animal token stands for and its first letter ({word:'cat', first:'C'})
  function initialOf(lang, s, tok) {
    tok = obj(tok);
    var a = s.animal || animalIn(tok.value) || animalIn(tok.sprite);
    if (!a) return null;
    var w = present(tok.word) ? String(tok.word) : (wordOfSprite(lang, 'animal_' + a) || NAMES[lang].animal[a]);
    var f = present(tok.initial) ? String(tok.initial) : null;
    if (!f) {
      var cur = (RR.WORDS && RR.WORDS[lang]) || [];
      for (var i = 0; i < cur.length; i++) if (cur[i] && cur[i].word === w && cur[i].initial) f = cur[i].initial;
    }
    if (!f) f = stripMarks(w).charAt(0).toUpperCase();
    return { word: w, first: f };
  }

  // ---------------------------------------------------------------- flight lines
  // `go` — the right island was chosen: "Red! Blast off!"
  I18N.sayGo = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var s = semOfEvent(ev, lang), topic = topicOf(ev), p = derive(lang, ev.params), pk = String(ev.promptKey || '');
    if ((pk === 'p.sound' || (topic === 'animals' && present(obj(ev.params).sound))) && s.animal)
      return I18N.t(lang, 'go.sound', { animal: s.animal }, rng);
    if ((topic === 'add' || topic === 'sub') && s.n != null && present(p.expr))
      return I18N.t(lang, 'go.math', { expr: p.expr, num: numberName(lang, s.n) }, rng);
    if (s.k === 'expr' && exprAnswer(s.expr) != null)
      return I18N.t(lang, 'go.math', { expr: exprText(s.expr), num: numberName(lang, exprAnswer(s.expr)) }, rng);
    if (topic === 'oddeven' && s.n != null)
      return I18N.t(lang, 'go.oddeven', { num: numberName(lang, s.n), parity: s.n % 2 ? 'odd' : 'even' }, rng);
    if (topic === 'initial' && s.k === 'letter' && present(p.word))
      return I18N.t(lang, 'go.initial', { word: p.word, letter: upper(s.letter) }, rng);
    if ((topic === 'initial' || pk === 'p.initial') && s.animal) {
      var ini = initialOf(lang, s, ev.token);
      if (ini) return I18N.t(lang, 'go.initial', { word: ini.word, letter: present(p.letter) ? upper(p.letter) : ini.first }, rng);
    }
    if (topic === 'lower' && s.k === 'letter')
      return I18N.t(lang, 'go.lower', { letter: upper(s.letter), lower: s.letter.toLowerCase() }, rng);
    var it = phraseOf(lang, s, 'go');
    return I18N.t(lang, 'go', { it: it }, rng);
  };

  // `wrong` — names what was tapped, kindly, then repeats the goal. Never negative.
  I18N.sayWrong = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var s = semOfEvent(ev, lang), topic = topicOf(ev), pk = String(ev.promptKey || '');
    var p = derive(lang, ev.params), want = wantOf(ev, lang);
    var first = '';
    var ini = (topic === 'initial' || pk === 'p.initial') && s.animal ? initialOf(lang, s, ev.token) : null;
    if (topic === 'oddeven' && s.n != null) first = I18N.t(lang, 'wrong.oddeven', { num: numberName(lang, s.n), parity: s.n % 2 ? 'odd' : 'even' }, rng);
    else if (ini) first = I18N.t(lang, 'wrong.initialIt', ini, rng);
    else if (s.k) first = I18N.t(lang, 'wrong.it', { it: phraseOf(lang, s, 'it') }, rng);
    var goal;
    var wantAnimal = want.animal || animalIn(rawVal(obj(ev.params).animal));
    if ((pk === 'p.sound' || (topic === 'animals' && present(obj(ev.params).sound))) && wantAnimal)
      goal = I18N.t(lang, 'wrong.sound', { animal: wantAnimal }, rng);
    else if ((topic === 'add' || topic === 'sub' || pk === 'p.add' || pk === 'p.sub') && present(p.expr))
      goal = I18N.t(lang, 'wrong.math', { expr: p.expr }, rng);
    else if ((topic === 'initial' || pk === 'p.initial') && present(p.letter))
      goal = I18N.t(lang, 'wrong.initial', { letter: upper(p.letter) }, rng);
    else if ((topic === 'lower' || pk === 'p.lower') && (present(p.letter) || want.k === 'letter'))
      goal = I18N.t(lang, 'wrong.lower', { letter: upper(present(p.letter) ? p.letter : want.letter) }, rng);
    else if ((topic === 'oddeven' || pk === 'p.oddeven') && (present(p.parity) || want.parity))
      goal = I18N.t(lang, 'wrong.parity', { parity: present(p.parity) ? rawVal(p.parity) : want.parity }, rng);
    else if (want.k) goal = I18N.t(lang, 'wrong.find', { want: phraseOf(lang, want, 'want') }, rng);
    else goal = I18N.t(lang, 'wrong', null, rng);
    return first ? first + ' ' + goal : goal;
  };

  // `collect` — the token lands in the wagon: counting, animal hello, or a short cheer
  I18N.sayCollect = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var tok = obj(ev.token && typeof ev.token === 'object' ? ev.token : ev);
    var s = semOf(tok.nameKind != null ? tok.nameKind : tok.kind, tok.nameValue, tok, { topic: topicOf(ev), lang: lang });
    // stars are counted aloud; so are count-up numbers (numeral + that many little stars)
    var counted = s.k === 'stars' || (s.k === 'number' && (topicOf(ev) === 'count' || tok.showStars));
    var n = counted ? (num(tok.n) != null ? num(tok.n) : s.n) : null;
    if (n != null && n >= 1) return countLine(lang, n);
    if (s.k === 'number' && s.n != null) return I18N.t(lang, 'collect.number', { num: numberName(lang, s.n) }, rng);
    if (s.k === 'animal' || (s.k === 'word' && s.animal)) return I18N.t(lang, 'collect.animal', { animal: s.animal }, rng);
    return I18N.t(lang, 'collect', null, rng);
  };

  // Counting aloud (stars): n < need → "Two!"; n ≥ need → "Three! Three stars!" / "Ba! Ba ngôi sao!"
  I18N.sayCount = function (lang, n, need, rng) {
    lang = L(lang);
    var c = num(n);
    if (c == null) return I18N.t(lang, 'praise', null, rng);
    var nd = num(need);
    if (nd == null || c < nd) return capFirst(numberName(lang, c)) + '!';
    return I18N.t(lang, 'say.countDone', { n: c }, rng);
  };

  // Back-compat aliases (Dee's card game API)
  I18N.sayFlip = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var s = semOf(ev.nameKind, ev.nameValue, ev.face || ev.token, { topic: ev.topic, lang: lang });
    var it = phraseOf(lang, s, 'go');
    return it ? capFirst(it) + '!' : I18N.t(lang, 'praise', null, rng);
  };
  I18N.sayTap = I18N.sayFlip;
  I18N.sayMatch = function (lang, ev, rng) { return I18N.sayGo(lang, ev, rng); };
  I18N.sayCorrect = I18N.sayMatch;
  I18N.sayMismatch = function (lang, ev, rng) { return I18N.sayWrong(lang, ev, rng); };
  I18N.sayReward = function (lang, ev, rng) { return I18N.sayCollect(lang, ev, rng); };

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
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 plus $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 minus $2')
        .replace(/\s=\s/g, ' equals ');
    } else {
      s = s.replace(RE_VI_LETTER, function (m, w, ch) { return w + ' ' + (LETTER_VI[ch.toUpperCase()] || ch.toLowerCase()); });
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 cộng $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 trừ $2')
        .replace(/\s=\s/g, ' bằng ');
    }
    return s.replace(/\s{2,}/g, ' ').trim();
  };

  RR.I18N = I18N;
})(window.RR = window.RR || {});
