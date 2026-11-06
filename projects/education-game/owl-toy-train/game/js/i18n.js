/* Momo's Toy Train — TT.I18N (English + Vietnamese). Momo (vi "Momo"; titles "Cú Momo") is a cheerful little owl who
 * drives a wooden toy train; the child drags cargo into the right train car, then toots the whistle.
 *
 *   TT.I18N.t(lang, key, params, rng?)          → string (variants picked with rng.next()/rng()/Math.random)
 *   TT.I18N.name(lang, kind, value, opts?)      → display + spoken name. kinds: color, shape, size, animal, home, cargo
 *                                                 (opts {n}: EN plural, VI classifier form), toy, number, dots, letter,
 *                                                 text, sum, diff, parity, word
 *   TT.I18N.words(lang, kind, value)            → accepted spoken forms (lower-case, + no-diacritic forms, digits)
 *   TT.I18N.itemPhrase(lang, item, role?)       → "red block" / "khối gỗ màu đỏ" (role 'grab' | 'item')
 *   TT.I18N.carPhrase(lang, label)              → "the red car" / "toa màu đỏ"  (label {type|nameKind, value|nameValue})
 *   TT.I18N.sayGrab(lang, ev, rng?)             → `grab`: "Red block!", "The cow!", "Teddy bear!" / "Khối gỗ màu đỏ!", "Con bò!"
 *   TT.I18N.sayCorrect(lang, ev, label?, rng?)  → `correct`: "Yes! The red car!", "Moo! The cow lives in the barn!";
 *                                                 count mode (ev.count {i, n}) → "Three!" (= count.<i>)
 *   TT.I18N.sayWrong(lang, ev, rng?)            → `wrong`: "Boing! That’s the blue car. The red block wants the red car!"
 *                                                 (maths never gives the answer away)
 *   TT.I18N.sayCarDone(lang, ev, label?, rng?)  → `carDone`: count car "That makes three teddy bears!", else "This car is ready!"
 *   TT.I18N.sayCount(lang, i)                   → "One!" … "Twenty!"
 *   TT.I18N.talkWrong(lang, kind, value)        → gentle "It is X! Good try!" for a missed Talk-time answer
 *   TT.I18N.speech(lang, text)                  → text tuned for TTS (letter names, + − =, vi "Momo" → "Mô Mô")
 *   TT.I18N.sound(lang, animal)                 → "moo" / "ò ò" ('' when the animal has no sound)
 *   TT.I18N.setChild(name)  has(lang, key)  keys(lang)  raw(lang, key)  langs  PARAMS  TOPICS  ANIMALS  HOMES  CARGO  TOYS
 *   Aliases: sayTap = sayGrab, sayPlay = sayCorrect.
 *
 * Event fields (all optional):
 *   grab / tap { nameKind, nameValue, item? }      item = a round item { kind, toy?, shape?, color?, sprite?, text?, nameKind, nameValue }
 *   correct    { nameKind, nameValue, item?, label? | car?, count?: {i, n} }   label = the car's label {type, value, color?}
 *   wrong      { item:{nameKind, nameValue, …}, want:{nameKind, nameValue}, got?|car?|label?: the car it was dropped into }
 * Params: values may be RAW ({color:'red'}, {animal:'cow'}, {cargo:'teddy', n:3}) — keys named like a name kind are
 * named automatically; an object {kind, value} is always replaced by name(lang, kind, value).
 * Derived params: {sound} and {word} from animal, {where} ("in the barn" / "trong chuồng") from home, {lower} from
 * letter, {expr} from expr|text|a,b(,op), {num} (number word) from n, {cargo} plural-aware with n (or a).
 * Keys with required params (PARAMS) fall back to a generic key when a param is missing (never "the !" on screen).
 * {child}: if the child's name is empty, variants containing {child} are skipped.
 */
(function (TT) {
  'use strict';

  var LANGS = ['en', 'vi'];
  var ANIMALS = ['cow', 'pig', 'sheep', 'duck', 'frog', 'fish', 'bird', 'squirrel', 'butterfly', 'bunny', 'mouse', 'fox'];
  var HOMES = { barn: ['cow', 'pig', 'sheep'], pond: ['duck', 'frog', 'fish'], tree: ['bird', 'squirrel', 'butterfly'],
    burrow: ['bunny', 'mouse', 'fox'] };
  var CARGO = ['teddy', 'ball', 'duckie', 'rocket', 'boat', 'drum'];
  var TOYS = ['cube', 'ball', 'cone', 'cylinder'];

  // ---------------------------------------------------------------- names
  var NAMES = {
    en: {
      color: { red: 'red', blue: 'blue', yellow: 'yellow', green: 'green', orange: 'orange', purple: 'purple', pink: 'pink',
        brown: 'brown', white: 'white' },
      shape: { circle: 'circle', square: 'square', triangle: 'triangle', star: 'star', heart: 'heart', rect: 'rectangle',
        rectangle: 'rectangle', oval: 'oval', diamond: 'diamond' },
      size: { big: 'big', small: 'small' },
      animal: { cow: 'cow', pig: 'pig', sheep: 'sheep', duck: 'duck', frog: 'frog', fish: 'fish', bird: 'bird',
        squirrel: 'squirrel', butterfly: 'butterfly', bunny: 'bunny', mouse: 'mouse', fox: 'fox' },
      home: { barn: 'the barn', pond: 'the pond', tree: 'the tree', burrow: 'the burrow' },
      cargo: { teddy: 'teddy bear', ball: 'ball', duckie: 'rubber duck', rocket: 'toy rocket', boat: 'toy boat', drum: 'toy drum' },
      toy: { cube: 'block', ball: 'ball', cone: 'cone', cylinder: 'tube' },
      parity: { odd: 'odd', even: 'even' }
    },
    vi: {
      color: { red: 'màu đỏ', blue: 'màu xanh dương', yellow: 'màu vàng', green: 'màu xanh lá', orange: 'màu cam',
        purple: 'màu tím', pink: 'màu hồng', brown: 'màu nâu', white: 'màu trắng' },
      shape: { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', star: 'hình ngôi sao',
        heart: 'hình trái tim', rect: 'hình chữ nhật', rectangle: 'hình chữ nhật', oval: 'hình bầu dục', diamond: 'hình thoi' },
      size: { big: 'to', small: 'nhỏ' },
      animal: { cow: 'con bò', pig: 'con heo', sheep: 'con cừu', duck: 'con vịt', frog: 'con ếch', fish: 'con cá',
        bird: 'con chim', squirrel: 'con sóc', butterfly: 'con bướm', bunny: 'con thỏ', mouse: 'con chuột', fox: 'con cáo' },
      home: { barn: 'chuồng', pond: 'cái ao', tree: 'cái cây', burrow: 'cái hang' },
      cargo: { teddy: 'gấu bông', ball: 'quả bóng', duckie: 'vịt cao su', rocket: 'tên lửa đồ chơi', boat: 'thuyền đồ chơi',
        drum: 'cái trống' },
      toy: { cube: 'khối gỗ', ball: 'quả bóng', cone: 'khối nón', cylinder: 'khối trụ' },
      parity: { odd: 'lẻ', even: 'chẵn' }
    }
  };
  var CARGO_PLURAL = { teddy: 'teddy bears', ball: 'balls', duckie: 'rubber ducks', rocket: 'toy rockets', boat: 'toy boats',
    drum: 'toy drums' };
  // Vietnamese counted form (classifier + noun): "3 con gấu bông", "3 chiếc thuyền"
  var CARGO_VI_COUNT = { teddy: 'con gấu bông', ball: 'quả bóng', duckie: 'con vịt cao su', rocket: 'chiếc tên lửa',
    boat: 'chiếc thuyền', drum: 'cái trống' };
  var GENERIC_CARGO = { en: ['toy', 'toys'], vi: ['món đồ chơi', 'món đồ chơi'] };
  // home car signs and "lives in …"
  var HOME_CAR = { en: { barn: 'barn', pond: 'pond', tree: 'tree', burrow: 'burrow' },
    vi: { barn: 'chuồng', pond: 'ao', tree: 'cây', burrow: 'hang' } };
  var WHERE = { en: { barn: 'in the barn', pond: 'in the pond', tree: 'in the tree', burrow: 'in the burrow' },
    vi: { barn: 'trong chuồng', pond: 'dưới ao', tree: 'trên cây', burrow: 'trong hang' } };
  // animal voices for the home line ("Moo! The cow lives in the barn!") — animals without a voice get no sound word
  var SOUNDS = {
    en: { cow: 'moo', pig: 'oink', sheep: 'baa', duck: 'quack', frog: 'ribbit', bird: 'tweet', mouse: 'squeak' },
    vi: { cow: 'ò ò', pig: 'ụt ịt', sheep: 'be be', duck: 'cạp cạp', frog: 'ộp ộp', bird: 'chíp chíp', mouse: 'chít chít' }
  };

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
        pink: ['pink', 'pinks', 'pinky'], brown: ['brown'], white: ['white'] },
      shape: { circle: ['circle', 'round', 'ring', 'circles'], square: ['square', 'squares'],
        triangle: ['triangle', 'try angle', 'triangles'], star: ['star', 'stars'], heart: ['heart', 'hearts', 'hart', 'love'],
        rect: ['rectangle', 'rectangles', 'long box'], rectangle: ['rectangle', 'rectangles'], oval: ['oval', 'egg', 'ovals'],
        diamond: ['diamond', 'kite', 'diamonds'] },
      size: { big: ['big', 'large', 'huge', 'bigger', 'giant'], small: ['small', 'little', 'tiny', 'smaller', 'baby'] },
      animal: {
        cow: ['cow', 'cows', 'calf', 'moo cow'], pig: ['pig', 'pigs', 'piggy', 'piggie', 'piglet'],
        sheep: ['sheep', 'lamb', 'lamby', 'lambie'], duck: ['duck', 'ducks', 'ducky', 'duckling'],
        frog: ['frog', 'frogs', 'froggy', 'toad'], fish: ['fish', 'fishy', 'fishes', 'goldfish'],
        bird: ['bird', 'birds', 'birdie', 'birdy'], squirrel: ['squirrel', 'squirrels', 'chipmunk'],
        butterfly: ['butterfly', 'butterflies', 'butter fly'], bunny: ['bunny', 'bunnies', 'rabbit', 'rabbits'],
        mouse: ['mouse', 'mice', 'mousey', 'mousie'], fox: ['fox', 'foxes', 'foxy'] },
      home: { barn: ['barn', 'barns', 'farm', 'stable'], pond: ['pond', 'ponds', 'water', 'lake'],
        tree: ['tree', 'trees', 'in the tree'], burrow: ['burrow', 'hole', 'den', 'underground', 'rabbit hole'] },
      cargo: { teddy: ['teddy', 'teddies', 'teddy bear', 'teddy bears', 'bear'], ball: ['ball', 'balls'],
        duckie: ['rubber duck', 'rubber ducks', 'duckie', 'rubber ducky', 'duck'], rocket: ['rocket', 'rockets', 'spaceship'],
        boat: ['boat', 'boats', 'ship'], drum: ['drum', 'drums'] },
      toy: { cube: ['block', 'blocks', 'cube'], ball: ['ball', 'balls'], cone: ['cone', 'cones'],
        cylinder: ['tube', 'tubes', 'cylinder'] },
      parity: { odd: ['odd', 'odds'], even: ['even', 'evens'] }
    },
    vi: {
      color: { red: ['đỏ', 'màu đỏ'], blue: ['xanh dương', 'xanh da trời', 'xanh nước biển', 'xanh lam', 'da trời', 'dương'],
        yellow: ['vàng', 'màu vàng'], green: ['xanh lá', 'xanh lá cây', 'xanh lục', 'lá cây'], orange: ['cam', 'màu cam'],
        purple: ['tím', 'màu tím'], pink: ['hồng', 'màu hồng'], brown: ['nâu', 'màu nâu'], white: ['trắng', 'màu trắng'] },
      shape: { circle: ['hình tròn', 'tròn'], square: ['hình vuông', 'vuông'], triangle: ['tam giác', 'hình tam giác'],
        star: ['ngôi sao', 'sao', 'hình ngôi sao', 'hình sao'], heart: ['trái tim', 'tim', 'hình trái tim', 'hình tim'],
        rect: ['chữ nhật', 'hình chữ nhật'], rectangle: ['chữ nhật', 'hình chữ nhật'], oval: ['bầu dục', 'hình bầu dục'],
        diamond: ['hình thoi', 'thoi'] },
      size: { big: ['to', 'lớn', 'bự', 'to lắm', 'to hơn'], small: ['nhỏ', 'bé', 'nhỏ xíu', 'nhỏ hơn', 'tí hon'] },
      animal: {
        cow: ['con bò', 'bò', 'bò sữa'], pig: ['con heo', 'heo', 'con lợn', 'lợn', 'heo con'], sheep: ['con cừu', 'cừu', 'cừu con'],
        duck: ['con vịt', 'vịt', 'vịt con'], frog: ['con ếch', 'ếch', 'ếch xanh', 'con nhái'], fish: ['con cá', 'cá', 'cá vàng'],
        bird: ['con chim', 'chim', 'chim non', 'chim sẻ'], squirrel: ['con sóc', 'sóc', 'sóc con'],
        butterfly: ['con bướm', 'bướm', 'bươm bướm'], bunny: ['con thỏ', 'thỏ', 'thỏ con', 'thỏ trắng'],
        mouse: ['con chuột', 'chuột', 'chuột nhắt'], fox: ['con cáo', 'cáo', 'cáo con'] },
      home: { barn: ['chuồng', 'cái chuồng', 'trong chuồng', 'chuồng trại', 'trang trại'],
        pond: ['ao', 'cái ao', 'dưới ao', 'hồ nước', 'hồ'], tree: ['cây', 'cái cây', 'trên cây', 'cây xanh'],
        burrow: ['hang', 'cái hang', 'trong hang', 'hang thỏ'] },
      cargo: { teddy: ['gấu bông', 'con gấu', 'gấu'], ball: ['quả bóng', 'bóng', 'trái banh', 'banh'],
        duckie: ['vịt cao su', 'con vịt', 'vịt'], rocket: ['tên lửa', 'hỏa tiễn', 'phi thuyền'],
        boat: ['thuyền', 'con thuyền', 'chiếc thuyền', 'tàu thủy'], drum: ['trống', 'cái trống'] },
      toy: { cube: ['khối gỗ', 'khối vuông', 'hình hộp'], ball: ['quả bóng', 'bóng', 'banh'], cone: ['khối nón', 'nón', 'cái nón'],
        cylinder: ['khối trụ', 'hình trụ', 'ống'] },
      parity: { odd: ['lẻ', 'số lẻ', 'lẽ', 'lẹ'], even: ['chẵn', 'số chẵn', 'chặn', 'chắn'] }
    }
  };

  // Default TT.WORDS for the 'initial' topic (the animal stickers are the pictures). content.js may replace it
  // ({en:[{word, initial, sprite|animal|id}], vi:[…]}). vi: chim / chuột (ch), thỏ (th) are left out — Vietnamese phonics
  // teaches ch / th as their own sounds.
  var WORD_LIST = {
    en: [['cow', 'cow', 'C'], ['pig', 'pig', 'P'], ['sheep', 'sheep', 'S'], ['duck', 'duck', 'D'], ['frog', 'frog', 'F'],
      ['fish', 'fish', 'F'], ['bird', 'bird', 'B'], ['squirrel', 'squirrel', 'S'], ['butterfly', 'butterfly', 'B'],
      ['bunny', 'bunny', 'B'], ['mouse', 'mouse', 'M'], ['fox', 'fox', 'F']],
    vi: [['bò', 'cow', 'B'], ['heo', 'pig', 'H'], ['cừu', 'sheep', 'C'], ['vịt', 'duck', 'V'], ['cá', 'fish', 'C'],
      ['sóc', 'squirrel', 'S'], ['bướm', 'butterfly', 'B'], ['cáo', 'fox', 'C']]
  };
  function defaultEntries(lang) {
    return WORD_LIST[lang].map(function (w) {
      return { id: w[1], word: w[0], sprite: 'animal_' + w[1], animal: w[1], initial: w[2] };
    });
  }
  if (!TT.WORDS) {
    TT.WORDS = {};
    LANGS.forEach(function (l) { TT.WORDS[l] = defaultEntries(l); });
  }

  // ---------------------------------------------------------------- strings
  var TOPICS = ['colors', 'shapes', 'size', 'homes', 'count', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
  var NAME_KINDS = ['color', 'shape', 'size', 'animal', 'home', 'cargo', 'toy', 'number', 'dots', 'letter', 'text', 'sum',
    'diff', 'parity', 'word'];
  var LABEL_TYPES = ['color', 'shape', 'size', 'home', 'number', 'letter', 'text', 'parity'];
  // prompt keys content.js asks with (DESIGN §5.1) and their required params
  var PROMPTS = {
    'p.colors': [], 'p.shapes': [], 'p.size': [], 'p.homes': [], 'p.count': ['n'], 'p.count2': ['a', 'b'],
    'p.letters': [], 'p.lower': [], 'p.initial': [], 'p.add': [], 'p.sub': [], 'p.oddeven': []
  };
  var MAX_COUNT = 20;

  var STR = {
    en: {
      'ui.title': 'Momo’s Toy Train',
      'ui.logo1': 'Momo’s',
      'ui.logo2': 'Toy Train',
      'ui.subtitle': 'Load the train, toot the whistle, learn with Momo!',
      'ui.tagline': 'Load the train, toot the whistle, learn with Momo!',
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
      'ui.voice': 'Momo’s voice',
      'ui.mic': 'Answer by voice',
      'ui.done': 'Done',
      'ui.stars': 'Stars',
      'ui.chapter': 'Chapter {n}',
      'ui.allDone': 'All done! {stars} stars',
      'ui.welcome': ['Hi {child}! I am Momo. All aboard the toy train!', 'Hi! I am Momo. All aboard the toy train!'],
      'ui.micUnsupported': 'Voice answers are not available here. Tap the pictures!',
      'ui.micDenied': 'The microphone is off. Tap the pictures instead!',
      'ui.voiceMissing': 'Tip for parents: add a voice in Settings › Accessibility › Spoken Content › Voices.',
      'ui.tapOrSay': 'Tap or say the answer!',
      'ui.listening': 'Momo is listening…',
      'ui.tapMomo': 'Tap Momo to hear it again',
      'ui.tapHint': 'Drag a toy into a train car',
      'ui.dragHint': 'Hold a toy and drag it into a car',
      'ui.whistle': 'Toot the whistle',
      'ui.skip': 'Skip',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Colour Cars',
      'topic.shapes': 'Shape Cars',
      'topic.size': 'Big and Small',
      'topic.homes': 'Animal Homes',
      'topic.count': 'Counting Cargo',
      'topic.letters': 'ABC Blocks',
      'topic.lower': 'Big and Small Letters',
      'topic.initial': 'First Letters',
      'topic.add': 'Adding Up',
      'topic.sub': 'Take Away',
      'topic.oddeven': 'Odd and Even',

      'weather.0': 'Good morning, train!',
      'weather.1': 'Sunny noon!',
      'weather.2': 'Look, the sunset!',
      'weather.3': 'Good night, stars! Lights on!',

      'deal': ['Here comes the train!', 'Choo choo! A new train is here!', 'Toot! The train stops for our toys!'],

      'p.any': ['Load the toys onto the train!', 'Put the toys in the train cars!', 'All toys into the train!'],
      'p.colors': ['Put each toy in the car of the same colour!', 'Every colour has its own car! Load them all!',
        'Match the colours! Each toy goes in its colour car!'],
      'p.shapes': ['Put each shape in the car with the same shape!', 'Match the shapes! Load each one in its car!',
        'Find the car with the same shape for each one!'],
      'p.size': ['Big toys in the big car, small toys in the small car!', 'Which car is big? Which is small? Load them!',
        'Big ones go in the big car, small ones in the small car!'],
      'p.homes': ['Who lives where? Take each animal to its home car!', 'Help the animals ride home! Find each home car!',
        'Each animal wants its home car. Load them!'],
      'p.count': ['Load {n} {cargo} into the car!', 'Count {n} {cargo} into the car!', 'Let’s count! Put {n} {cargo} in the car!'],
      'p.count2': ['Put {a} {cargo} in one car and {b} in the other!', 'Count them in! {a} {cargo} here, {b} there!',
        'One car wants {a} {cargo}, the other wants {b}!'],
      'p.letters': ['Put each letter block in the car with the same letter!', 'Match the letters! Load each block in its car!',
        'Find the car with the same letter for each block!'],
      'p.lower': ['Small letters ride with big letters! Find each one its car!', 'Match small and big letters! Load them!',
        'Each small letter wants its big letter car!'],
      'p.initial': ['Who starts with which letter? Take each animal to its letter car!',
        'Listen to the first sound! Find each animal its letter car!', 'Each animal rides in the car of its first letter!'],
      'p.add': ['Add it up! Put each number in the car that makes it!', 'Which car makes this number? Load them all!',
        'Count it up! Each number rides with its sum!'],
      'p.sub': ['Take away! Put each number in the car that leaves it!', 'Which car leaves this number? Load them all!',
        'Take away and count! Each number rides with its car!'],
      'p.oddeven': ['Odd numbers in the odd car, even numbers in the even car!', 'Is it odd or even? Load each number!',
        'Sort the numbers! Odd car or even car?'],

      'say.grab.any': ['Up it goes!', 'Whee!'],
      'say.grab.block': ['{it}!', '{it}! Where does it go?'],
      'say.grab.shape': ['{it}!', '{it}! Where does it go?'],
      'say.grab.size': ['{it}!', '{it}! Where does it go?'],
      'say.grab.animal': ['{it}!', '{it}! Where does it live?'],
      'say.grab.cargo': ['{it}!', 'Up you go, {it}!'],
      'say.grab.letter': ['{it}!', '{it}! Where does it go?'],
      'say.grab.number': ['{it}!', '{it}! Where does it go?'],
      'say.grab.text': ['{it}!', '{it}! Where does it go?'],

      'say.correct.color': ['Yes! The {color} car!', '{color} car — yes!', 'Yes! {color} goes with {color}!'],
      'say.correct.shape': ['Yes! The {shape} car!', '{shape} car — yes!', 'Yes! Same shape!'],
      'say.correct.size': ['Yes! The {size} car!', '{size} car — yes!', 'Yes! {size} toy, {size} car!'],
      'say.correct.home': ['The {animal} lives {where}!', 'Yes! The {animal} goes {where}!', 'Home {where}, little {animal}!'],
      'say.correct.number': ['Yes! Number {num}!', 'Number {num} — yes!'],
      'say.correct.letter': ['Yes! Letter {letter}!', 'Letter {letter} — yes!', 'Yes! {letter} goes with {letter}!'],
      'say.correct.lower': ['Small {lower}, big {letter}! Yes!', 'Yes! Small {lower} rides with big {letter}!'],
      'say.correct.initial': ['{letter} is for {word}!', 'Yes! {letter} is for {word}!'],
      'say.correct.text': ['{expr} is {ans}!', 'Yes! {expr} is {ans}!'],
      'say.correct.parity': ['{num} is {parity}!', 'Yes! {num} is {parity}!'],
      'say.carDone.count': ['That makes {num} {cargo}!', '{num} {cargo}! Well counted!'],
      'carDone': ['This car is ready!', 'All loaded here!', 'This car is done!'],
      'full': ['This car is full! Try another one.', 'Full up! Let’s find another car.', 'This one is full! Another car, please!'],

      'wrong.boing': ['Boing!', 'Bounce!'],
      'wrong.got': ['Boing! That’s {got}.', 'Bounce! That’s {got}.'],
      'wrong': ['{item} wants {want}!', 'Let’s take {item} to {want}!', '{item} goes in {want}!'],
      'wrong.math': ['Which car makes {item}?', 'Count again! Which car makes {item}?'],
      'wrong.parity': ['{num} is {parity}. It wants the {parity} car!', '{num} is {parity}! Let’s find the {parity} car!'],
      'wrong.initial': ['{word} starts with {first}. It wants the letter {first} car!',
        '{word} starts with {first}! Let’s find the letter {first} car!'],
      'wrong.lower': ['Small {lower} goes with big {letter}!', 'Small {lower} wants big {letter}!'],
      'wrong.any': ['Boing! Let’s try another car!', 'Bounce! Hmm, let’s look again!', 'So close! One more try!',
        'Let’s think again!', 'Keep going, you can do it!'],
      'miss': ['Pop it into a car!', 'Drag it all the way into a car!', 'Bring it to the train!'],
      'dragHint': ['Hold it and drag it into a car!', 'Slide it into the train!', 'Keep your finger on it and pull it to a car!'],

      'loaded': ['All aboard! Pull the whistle!', 'All loaded! Toot the whistle!', 'The train is ready! Tap the whistle!'],
      'whistleHint': ['Tap the shiny whistle!', 'Look at the whistle! Tap it!', 'Toot toot? Tap the whistle!'],
      'whistleAuto': ['Toot toot! Off we go!', 'I will toot it! Off we go!', 'Toot! Here we go!'],
      'depart': ['Choo choo! Bye-bye!', 'Off we go! Bye-bye, toys!', 'Chugga chugga, choo choo!'],
      'toot': ['Toot toot!', 'Toot!', 'Choo choo!'],
      'surprise.hitch': ['Look! Bunny wants a ride!', 'A little bunny hops on the train!'],
      'hitch.tap': ['Hee hee! Hello, bunny!', 'Bunny waves at you!', 'Hold on tight, bunny!'],
      'surprise.balloon': ['A balloon on our train!', 'Look, a balloon is riding with us!'],
      'balloon.tap': ['Boop! A sparkle star!', 'Bob, bob! Pretty balloon!', 'Sparkles! Up it bobs!'],

      'praise': ['Yes!', 'Great job!', 'You got it!', 'Super!', 'Wonderful!', 'Nice one!', 'Hooray!', 'Well done!'],
      'great': ['Great loading, {child}!', 'You did it, {child}!', 'What a train!', 'Wow, {child}, super driver!',
        'Hooray! Train loaded!', 'You are so clever!', 'Super train driver!'],
      'party': ['Night train party!', 'Hooray! Every toy is riding!', 'What a train ride!'],
      'hint': ['Psst! Look at the glowing car!', 'Watch the little hand!', 'Momo will help! This way!',
        'The shiny car! Drag it there!', 'Look, this car is sparkling!'],
      'idle': ['Drag a toy into a car!', 'Momo is waiting! Your turn!', 'Let’s load the train!',
        'I am here, {child}! Let’s load the train!', 'The train wants its toys!', 'Which toy goes next?'],

      'talk.intro': 'Talk time! Momo has a question.',
      'talk.colors': 'What colour is this?',
      'talk.shapes': 'What shape is this?',
      'talk.size': 'Which one is {size}?',
      'talk.homes': 'Where does the {animal} live?',
      'talk.homesAny': 'Where does it live?',
      'talk.count': 'How many {cargo}?',
      'talk.countAny': 'How many are there?',
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
      'talk.wrong.home': 'It lives {where}! Good try!',
      'talk.wrong.size': 'It is {answer}! Good try!',
      'talk.wrong.letter': 'It is the letter {letter}! Good try!',
      'talk.wrong.small': 'It is small letter {letter}! Good try!',
      'talk.wrong.number': 'It is {answer}! Good try!',

      'session.done': ['What a train ride! {stars} stars! Hooray!', 'Amazing, {child}! {stars} stars!',
        'So many toys loaded! {stars} stars!']
    },
    vi: {
      'ui.title': 'Cú Momo — Tàu Đồ Chơi',
      'ui.logo1': 'Cú Momo',
      'ui.logo2': 'Tàu Đồ Chơi',
      'ui.subtitle': 'Chất hàng lên tàu, kéo còi, học cùng Momo nhé!',
      'ui.tagline': 'Chất hàng lên tàu, kéo còi, học cùng Momo nhé!',
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
      'ui.voice': 'Giọng của Momo',
      'ui.mic': 'Trả lời bằng giọng nói',
      'ui.done': 'Xong',
      'ui.stars': 'Ngôi sao',
      'ui.chapter': 'Chương {n}',
      'ui.allDone': 'Hoàn thành! {stars} ngôi sao',
      'ui.welcome': ['Chào bé {child}! Mình là Momo. Mình cùng lên tàu đồ chơi nhé!',
        'Chào bé! Mình là Momo. Mình cùng lên tàu đồ chơi nhé!'],
      'ui.micUnsupported': 'Máy này chưa nghe được giọng nói. Bé chạm vào hình nhé!',
      'ui.micDenied': 'Micrô đang tắt. Bé chạm vào hình nhé!',
      'ui.voiceMissing': 'Mẹo cho bố mẹ: thêm giọng tiếng Việt trong Cài đặt › Trợ năng › Nội dung được đọc › Giọng nói.',
      'ui.tapOrSay': 'Bé chạm hoặc nói đáp án nhé!',
      'ui.listening': 'Momo đang nghe…',
      'ui.tapMomo': 'Chạm vào Momo để nghe lại nhé',
      'ui.tapHint': 'Bé kéo đồ chơi vào toa tàu nhé',
      'ui.dragHint': 'Bé giữ đồ chơi rồi kéo vào toa nhé',
      'ui.whistle': 'Kéo còi tàu',
      'ui.skip': 'Bỏ qua',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Toa tàu sắc màu',
      'topic.shapes': 'Toa tàu hình khối',
      'topic.size': 'To và nhỏ',
      'topic.homes': 'Nhà của các con vật',
      'topic.count': 'Đếm hàng lên tàu',
      'topic.letters': 'Khối chữ cái',
      'topic.lower': 'Chữ hoa, chữ thường',
      'topic.initial': 'Chữ cái đầu tiên',
      'topic.add': 'Phép cộng',
      'topic.sub': 'Phép trừ',
      'topic.oddeven': 'Số chẵn, số lẻ',

      'weather.0': 'Chào buổi sáng, tàu ơi!',
      'weather.1': 'Buổi trưa nắng đẹp quá!',
      'weather.2': 'Nhìn kìa, hoàng hôn!',
      'weather.3': 'Chúc ngủ ngon, các vì sao! Bật đèn nào!',

      'deal': ['Tàu tới rồi!', 'Xình xịch! Tàu mới tới rồi!', 'Tu tu! Tàu dừng lại chở đồ chơi nè!'],

      'p.any': ['Bé ơi, chất đồ chơi lên tàu nhé!', 'Bé xếp đồ chơi vào toa tàu nào!', 'Đồ chơi lên tàu hết nhé!'],
      'p.colors': ['Bé ơi, xếp đồ chơi vào toa cùng màu nhé!', 'Mỗi màu có một toa riêng! Bé xếp hết nhé!',
        'Bé tìm toa cùng màu cho từng món đồ chơi nhé!'],
      'p.shapes': ['Bé ơi, xếp mỗi hình vào toa có hình giống nó nhé!', 'Bé ghép hình nào! Mỗi hình lên toa của nó nhé!',
        'Bé tìm toa cùng hình cho từng khối nhé!'],
      'p.size': ['Đồ chơi to vào toa to, đồ chơi nhỏ vào toa nhỏ nhé!', 'Toa nào to? Toa nào nhỏ? Bé xếp nhé!',
        'Bé ơi, cái to vào toa to, cái nhỏ vào toa nhỏ nhé!'],
      'p.homes': ['Bạn nào sống ở đâu? Bé đưa các con vật về toa nhà nhé!', 'Bé ơi, giúp các con vật đi tàu về nhà nhé!',
        'Mỗi con vật lên toa nhà của mình nhé!'],
      'p.count': ['Bé ơi, chất {n} {cargo} lên toa nhé!', 'Bé đếm {n} {cargo} lên toa nào!', 'Mình đếm nhé! Bé xếp {n} {cargo} vào toa!'],
      'p.count2': ['Bé xếp {a} {cargo} vào một toa, {b} vào toa kia nhé!', 'Bé đếm nhé! {a} {cargo} toa này, {b} toa kia!',
        'Một toa cần {a} {cargo}, toa kia cần {b} nhé!'],
      'p.letters': ['Bé ơi, xếp mỗi khối chữ vào toa có chữ giống nó nhé!', 'Bé ghép chữ nào! Mỗi khối lên toa của nó nhé!',
        'Bé tìm toa cùng chữ cho từng khối nhé!'],
      'p.lower': ['Chữ thường đi cùng chữ hoa! Bé tìm toa cho từng chữ nhé!', 'Bé ơi, ghép chữ thường với chữ hoa nhé!',
        'Mỗi chữ thường lên toa chữ hoa của nó nhé!'],
      'p.initial': ['Bạn nào bắt đầu bằng chữ nào? Bé đưa từng bạn lên toa chữ nhé!',
        'Bé ơi, nghe âm đầu nhé! Đưa từng con vật lên toa chữ của nó!', 'Mỗi con vật lên toa có chữ cái đầu của mình nhé!'],
      'p.add': ['Bé cộng nhé! Xếp mỗi số vào toa có phép cộng bằng nó!', 'Toa nào bằng số này? Bé xếp hết nhé!',
        'Bé ơi, tính nhé! Mỗi số lên toa có phép tính của nó!'],
      'p.sub': ['Bé trừ nhé! Xếp mỗi số vào toa có phép trừ bằng nó!', 'Toa nào còn lại số này? Bé xếp hết nhé!',
        'Bé ơi, bớt đi rồi đếm nhé! Mỗi số lên toa của nó!'],
      'p.oddeven': ['Số lẻ vào toa số lẻ, số chẵn vào toa số chẵn nhé!', 'Số này chẵn hay lẻ? Bé xếp từng số nhé!',
        'Bé ơi, xếp các số nhé! Toa số lẻ hay toa số chẵn?'],

      'say.grab.any': ['Nhấc lên nào!', 'A lê hấp!'],
      'say.grab.block': ['{it}!', '{it}! Đi toa nào nhỉ?'],
      'say.grab.shape': ['{it}!', '{it}! Đi toa nào nhỉ?'],
      'say.grab.size': ['{it}!', '{it}! Đi toa nào nhỉ?'],
      'say.grab.animal': ['{it}!', '{it}! Nhà ở đâu nhỉ?'],
      'say.grab.cargo': ['{it}!', 'Lên tàu nào, {it}!'],
      'say.grab.letter': ['{it}!', '{it}! Đi toa nào nhỉ?'],
      'say.grab.number': ['{it}!', '{it}! Đi toa nào nhỉ?'],
      'say.grab.text': ['{it}!', '{it}! Đi toa nào nhỉ?'],

      'say.correct.color': ['Đúng rồi! Toa {color}!', 'Toa {color}, đúng rồi!', 'Đúng rồi! {color} đi với {color}!'],
      'say.correct.shape': ['Đúng rồi! Toa {shape}!', 'Toa {shape}, đúng rồi!', 'Đúng rồi! Cùng hình luôn!'],
      'say.correct.size': ['Đúng rồi! Toa {size}!', 'Toa {size}, đúng rồi!', 'Đúng rồi! Đồ chơi {size}, toa {size}!'],
      'say.correct.home': ['{animal} sống {where}!', 'Đúng rồi! {animal} về {where}!', 'Hoan hô! {animal} về {where} rồi!'],
      'say.correct.number': ['Đúng rồi! Số {num}!', 'Số {num}, đúng rồi!'],
      'say.correct.letter': ['Đúng rồi! Chữ {letter}!', 'Chữ {letter}, đúng rồi!', 'Đúng rồi! Chữ {letter} đi với chữ {letter}!'],
      'say.correct.lower': ['Chữ {lower} thường, chữ {letter} hoa! Đúng rồi!', 'Đúng rồi! Chữ {lower} thường đi với chữ {letter} hoa!'],
      'say.correct.initial': ['Chữ {letter}, {word}!', 'Đúng rồi! Chữ {letter}, {word}!'],
      'say.correct.text': ['{expr} bằng {ans}!', 'Đúng rồi! {expr} bằng {ans}!'],
      'say.correct.parity': ['{num} là số {parity}!', 'Đúng rồi! {num} là số {parity}!'],
      'say.carDone.count': ['Đủ {num} {cargo} rồi!', '{num} {cargo}! Bé đếm giỏi quá!'],
      'carDone': ['Toa này xong rồi!', 'Toa này chất đủ rồi!', 'Toa này sẵn sàng rồi!'],
      'full': ['Toa này đầy rồi! Bé thử toa khác nhé.', 'Đầy ắp rồi! Mình tìm toa khác nhé.', 'Toa này hết chỗ rồi! Bé chọn toa khác nhé!'],

      'wrong.boing': ['Tưng!', 'Tưng tưng!'],
      'wrong.got': ['Tưng! Đây là {got}.', 'Tưng tưng! Đây là {got}.'],
      'wrong': ['{item} muốn lên {want} cơ!', 'Mình đưa {item} lên {want} nhé!', '{item} đi {want} nhé!'],
      'wrong.math': ['Toa nào bằng {item} nhỉ?', 'Bé đếm lại nhé! Toa nào bằng {item}?'],
      'wrong.parity': ['{num} là số {parity}. Số này đi toa số {parity} nhé!', '{num} là số {parity}! Mình tìm toa số {parity} nhé!'],
      'wrong.initial': ['{word} bắt đầu bằng chữ {first}. Mình tìm toa chữ {first} nhé!',
        '{word} bắt đầu bằng chữ {first}! Bé tìm toa chữ {first} nhé!'],
      'wrong.lower': ['Chữ {lower} thường đi với chữ {letter} hoa nhé!', 'Chữ {lower} thường muốn tìm chữ {letter} hoa!'],
      'wrong.any': ['Tưng! Mình thử toa khác nhé!', 'Tưng! Mình tìm lại nào!', 'Suýt nữa thôi! Thử tiếp nhé!',
        'Bé nghĩ thêm chút nữa nhé!', 'Cố lên, bé làm được mà!'],
      'miss': ['Bé thả vào toa tàu nhé!', 'Bé kéo vào tận toa nhé!', 'Mang lên tàu nào!'],
      'dragHint': ['Bé giữ rồi kéo vào toa nhé!', 'Bé kéo nó lên tàu nào!', 'Bé giữ ngón tay rồi kéo tới toa nhé!'],

      'loaded': ['Lên tàu nào! Bé kéo còi đi!', 'Chất xong rồi! Bé kéo còi nhé!', 'Tàu sẵn sàng rồi! Bé chạm vào còi nhé!'],
      'whistleHint': ['Bé chạm vào cái còi sáng lấp lánh nhé!', 'Nhìn cái còi kìa! Bé chạm nhé!', 'Tu tu? Bé chạm vào còi nào!'],
      'whistleAuto': ['Tu tu! Mình đi nào!', 'Momo kéo còi nhé! Đi nào!', 'Tu! Tàu chạy nào!'],
      'depart': ['Xình xịch! Tạm biệt!', 'Tàu chạy rồi! Tạm biệt các bạn đồ chơi!', 'Xình xịch, xình xịch, tu tu!'],
      'toot': ['Tu tu!', 'Tu!', 'Xình xịch!'],
      'surprise.hitch': ['Nhìn kìa! Bạn thỏ muốn đi nhờ tàu!', 'Bạn thỏ bông nhảy lên tàu rồi!'],
      'hitch.tap': ['Hi hi! Chào bạn thỏ!', 'Bạn thỏ vẫy tay chào bé nè!', 'Bám chắc nhé, bạn thỏ!'],
      'surprise.balloon': ['Có bóng bay trên tàu mình nè!', 'Nhìn kìa, bóng bay đi tàu cùng mình!'],
      'balloon.tap': ['Búp! Một ngôi sao lấp lánh!', 'Bồng bềnh! Bóng bay đẹp quá!', 'Lấp lánh! Bóng bay nhún nhảy!'],

      'praise': ['Đúng rồi!', 'Giỏi quá!', 'Tuyệt vời!', 'Hoan hô!', 'Bé giỏi lắm!', 'Chính xác!', 'Siêu quá!', 'Hay lắm!'],
      'great': ['Bé {child} chất hàng giỏi quá!', 'Hoan hô bé {child}!', 'Đoàn tàu đẹp quá!', 'Oa, bé {child} lái tàu giỏi quá!',
        'Hoan hô, tàu chất đầy rồi!', 'Bé thông minh quá!', 'Bé là bác lái tàu tí hon!'],
      'party': ['Tiệc tàu đêm nào!', 'Hoan hô! Đồ chơi nào cũng được đi tàu!', 'Chuyến tàu vui quá!'],
      'hint': ['Nhìn nè! Toa này đang sáng lên.', 'Bé xem bàn tay nhỏ chỉ nè!', 'Momo giúp bé nhé! Lối này nè!',
        'Toa lấp lánh đó! Bé kéo vào nhé!', 'Nhìn kìa, toa này lấp lánh!'],
      'idle': ['Bé kéo đồ chơi vào toa nhé!', 'Momo đang chờ bé nè!', 'Mình chất hàng lên tàu nào!',
        'Bé {child} ơi, mình chất hàng tiếp nhé!', 'Tàu đang chờ đồ chơi nè!', 'Món nào lên tàu tiếp đây nhỉ?'],

      'talk.intro': 'Giờ trò chuyện! Momo hỏi bé nhé.',
      'talk.colors': 'Cái này màu gì nhỉ?',
      'talk.shapes': 'Cái này hình gì nhỉ?',
      'talk.size': 'Bé chỉ cái nào {size} nhé?',
      'talk.homes': '{animal} sống ở đâu nhỉ?',
      'talk.homesAny': 'Bạn này sống ở đâu nhỉ?',
      'talk.count': 'Có mấy {cargo} nào?',
      'talk.countAny': 'Có bao nhiêu cái nào?',
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
      'talk.wrong.home': 'Bạn ấy sống {where} đó! Bé cố gắng lắm!',
      'talk.wrong.size': 'Cái này {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.letter': 'Là chữ {letter} đó! Bé cố gắng lắm!',
      'talk.wrong.small': 'Là chữ {letter} thường đó! Bé cố gắng lắm!',
      'talk.wrong.number': 'Là số {answer} đó! Bé cố gắng lắm!',

      'session.done': ['Chuyến tàu vui quá! {stars} ngôi sao!', 'Bé {child} giỏi quá! {stars} ngôi sao!',
        'Chất bao nhiêu là đồ chơi! {stars} ngôi sao!']
    }
  };
  // count.1 … count.20: "One!" / "Một!" (each correct drop in a count car)
  LANGS.forEach(function (l) {
    for (var i = 1; i <= MAX_COUNT; i++) {
      var w = NUM[l][i];
      STR[l]['count.' + i] = w.charAt(0).toUpperCase() + w.slice(1) + '!';
    }
  });

  // required params → fallback key when one is missing (checked AFTER derived params are filled in)
  var NEEDS = {
    'talk.homes': ['animal'], 'talk.count': ['cargo'],
    'say.grab.block': ['it'], 'say.grab.shape': ['it'], 'say.grab.size': ['it'], 'say.grab.animal': ['it'],
    'say.grab.cargo': ['it'], 'say.grab.letter': ['it'], 'say.grab.number': ['it'], 'say.grab.text': ['it'],
    'say.correct.color': ['color'], 'say.correct.shape': ['shape'], 'say.correct.size': ['size'],
    'say.correct.home': ['animal', 'where'], 'say.correct.number': ['num'], 'say.correct.letter': ['letter'],
    'say.correct.lower': ['letter', 'lower'], 'say.correct.initial': ['letter', 'word'], 'say.correct.text': ['expr', 'ans'],
    'say.correct.parity': ['num', 'parity'], 'say.carDone.count': ['num', 'cargo'],
    'wrong': ['item', 'want'], 'wrong.got': ['got'], 'wrong.math': ['item'], 'wrong.parity': ['num', 'parity'],
    'wrong.initial': ['word', 'first'], 'wrong.lower': ['lower', 'letter'],
    'talk.wrong': ['answer'], 'talk.wrong.a': ['answer'], 'talk.wrong.animal': ['answer'], 'talk.wrong.home': ['where'],
    'talk.wrong.letter': ['letter'], 'talk.wrong.small': ['letter'], 'talk.wrong.number': ['answer'], 'talk.wrong.size': ['answer']
  };
  Object.keys(PROMPTS).forEach(function (k) { if (PROMPTS[k].length) NEEDS[k] = PROMPTS[k]; });
  var FALLBACK = { 'talk.homes': 'talk.homesAny', 'talk.count': 'talk.countAny', 'p.count2': 'p.count', 'p.count': 'p.any',
    'wrong.got': 'wrong.boing', 'say.carDone.count': 'carDone' };
  Object.keys(NEEDS).forEach(function (k) {
    if (FALLBACK[k]) return;
    if (/^say\.grab\./.test(k)) FALLBACK[k] = 'say.grab.any';
    else if (/^say\.correct\./.test(k)) FALLBACK[k] = 'praise';
    else if (/^wrong/.test(k) || /^talk\.wrong/.test(k)) FALLBACK[k] = 'wrong.any';
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
  function low(v) { return String(rawVal(v) == null ? '' : rawVal(v)).toLowerCase(); }

  // 'cow' | 'animal_cow' | 'animal_cow.svg' → 'cow' | null
  function animalOf(v) {
    if (v && typeof v === 'object') v = v.value != null ? v.value : v.animal != null ? v.animal : v.sprite;
    if (v == null) return null;
    var s = String(v).toLowerCase().replace(/\.svg$/, '').replace(/^animal_/, '').replace(/_wave$/, '');
    return ANIMALS.indexOf(s) >= 0 ? s : null;
  }
  function cargoOf(v) {
    if (v && typeof v === 'object') v = v.value != null ? v.value : v.cargo != null ? v.cargo : v.sprite;
    if (v == null) return null;
    var s = String(v).toLowerCase().replace(/\.svg$/, '').replace(/^cargo_/, '');
    return CARGO.indexOf(s) >= 0 ? s : null;
  }
  function homeOf(v) {
    var s = low(v).replace(/^home_/, '').replace(/\.svg$/, '');
    return HOMES[s] ? s : null;
  }
  function homeOfAnimal(a) {
    for (var h in HOMES) if (HOMES[h].indexOf(a) >= 0) return h;
    return null;
  }
  function sizeOf(v) {
    var s = low(v);
    if (/(^|[_:\-\s])(big|large)($|[_:\-\s])/.test(s)) return 'big';
    if (/(^|[_:\-\s])(small|little)($|[_:\-\s])/.test(s)) return 'small';
    return null;
  }
  function toyOf(v) { var s = low(v); return TOYS.indexOf(s) >= 0 ? s : null; }
  function soundOf(lang, a) { a = animalOf(a); return a && SOUNDS[L(lang)][a] ? SOUNDS[L(lang)][a] : ''; }
  function bareAnimal(lang, a) { return NAMES[lang].animal[a].replace(/^con /, ''); }
  function cargoName(lang, c, n) {
    if (lang === 'vi') return n != null ? CARGO_VI_COUNT[c] : NAMES.vi.cargo[c];
    return n != null && n !== 1 ? CARGO_PLURAL[c] : NAMES.en.cargo[c];
  }

  // ---- words for the 'initial' topic: tolerant of whatever shape content.js gives TT.WORDS
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
    var src = TT.WORDS, list = [];
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
  function findEntry(lang, v) {
    if (v && typeof v === 'object') v = v.word != null ? v.word : v.value != null ? v.value : v.id;
    if (v == null || v === '') return null;
    var s = String(v), i, k;
    var pools = [entries(lang), defaultEntries(lang)];
    for (k = 0; k < pools.length; k++) for (i = 0; i < pools[k].length; i++) if (entryMatch(pools[k][i], s)) return pools[k][i];
    var a = animalOf(s);
    if (a) for (k = 0; k < pools.length; k++) for (i = 0; i < pools[k].length; i++) if (pools[k][i].animal === a) return pools[k][i];
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

  function name(lang, kind, value, opts) {
    lang = L(lang);
    if (value && typeof value === 'object' && 'value' in value) value = value.value;
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
      case 'animal': { var a = animalOf(value); return a ? NAMES[lang].animal[a] : String(value); }
      case 'home': { var h = homeOf(value); return h ? NAMES[lang].home[h] : String(value); }
      case 'cargo': {
        var c = cargoOf(value);
        if (!c) return String(value);
        var cn = opts && opts.n != null ? num(opts.n) : null;
        return cargoName(lang, c, cn);
      }
      case 'size': { var sz = sizeOf(value); return sz ? NAMES[lang].size[sz] : String(value); }
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
        var w = wordName(lang, value), list = [w];
        var e = findEntry(lang, value);
        var a = (e && e.animal) || animalOf(value) || animalOf(w);
        if (a) list = list.concat([NAMES[lang].animal[a]], WORDS[lang].animal[a] || []);
        return addForms(out, list);
      }
      case 'animal': {
        var an = animalOf(value);
        if (!an) return addForms(out, [String(value)]);
        return addForms(out, [NAMES[lang].animal[an]].concat(WORDS[lang].animal[an] || []));
      }
      case 'home': {
        var h = homeOf(value);
        if (!h) return addForms(out, [String(value)]);
        return addForms(out, [NAMES[lang].home[h], HOME_CAR[lang][h], WHERE[lang][h]].concat(WORDS[lang].home[h] || []));
      }
      case 'cargo': {
        var c = cargoOf(value);
        if (!c) return addForms(out, [String(value)]);
        var cl = [NAMES[lang].cargo[c]];
        if (lang === 'vi') cl.push(CARGO_VI_COUNT[c]); else cl.push(CARGO_PLURAL[c]);
        return addForms(out, cl.concat(WORDS[lang].cargo[c] || []));
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

  function derive(lang, params, key) {
    var p = {}, k;
    if (params && typeof params === 'object') for (k in params) if (Object.prototype.hasOwnProperty.call(params, k)) p[k] = params[k];
    // {animal} from sprite, {sound}, {word}
    if (!present(p.animal) && present(p.sprite) && animalOf(rawVal(p.sprite))) p.animal = animalOf(rawVal(p.sprite));
    if (present(p.animal) && animalOf(rawVal(p.animal))) {
      var an = animalOf(rawVal(p.animal));
      if (!present(p.sound) && soundOf(lang, an)) p.sound = soundOf(lang, an);
      if (!present(p.word)) p.word = wordName(lang, an);
      if (!present(p.home) && !present(p.where) && /^talk\.wrong\.home$/.test(key || '')) p.home = homeOfAnimal(an);
    }
    if (present(p.word)) p.word = wordName(lang, rawVal(p.word));
    // {where} from home
    if (!present(p.where) && present(p.home) && homeOf(rawVal(p.home))) p.where = WHERE[lang][homeOf(rawVal(p.home))];
    // {letter} / {lower}
    if (!present(p.letter) && present(p.text) && isLetter(String(rawVal(p.text)))) p.letter = String(rawVal(p.text));
    if (present(p.letter)) {
      p.letter = String(rawVal(p.letter));
      if (!present(p.lower)) p.lower = p.letter.toLowerCase();
    }
    if (present(p.lower)) p.lower = String(rawVal(p.lower));
    // {expr}
    if (!present(p.expr)) {
      var ex = present(p.text) && splitOp(rawVal(p.text)) ? rawVal(p.text) : present(p.sum) ? rawVal(p.sum) :
        present(p.diff) ? rawVal(p.diff) : null;
      if (ex == null && present(p.a) && present(p.b) && present(p.op)) ex = rawVal(p.a) + rawVal(p.op) + rawVal(p.b);
      if (ex != null) p.expr = exprText(ex);
    } else if (typeof p.expr !== 'string' || splitOp(p.expr)) p.expr = exprText(rawVal(p.expr));
    // {num} from n
    var c = present(p.n) ? num(p.n) : null;
    if (!present(p.num) && c != null) p.num = numberName(lang, c);
    if (present(p.n) && typeof p.n === 'object') p.n = c != null ? c : '';
    // {cargo}: plural-aware with n (or a); a generic "toys" when only a count is known
    var cn = c != null ? c : present(p.a) ? num(p.a) : null;
    if (present(p.cargo)) {
      var cid = cargoOf(rawVal(p.cargo));
      if (cid) p.cargo = cargoName(lang, cid, cn != null ? cn : 2);
      else if (typeof p.cargo === 'object' && p.cargo.kind) p.cargo = name(lang, p.cargo.kind, p.cargo.value, { n: cn != null ? cn : 2 });
    } else if (cn != null && /^(p\.count|say\.carDone)/.test(key || '')) {
      p.cargo = GENERIC_CARGO[lang][cn === 1 ? 0 : 1];
    }
    return p;
  }

  function resolveParam(lang, key, val) {
    if (!present(val)) return '';
    if (typeof val === 'object' && val.kind) return name(lang, val.kind, val.value);
    if (typeof val === 'object') return '';
    switch (key) {
      case 'color': case 'shape': case 'size': case 'animal': case 'parity': case 'home': case 'toy':
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

  // ---------------------------------------------------------------- items and cars → meaning
  // sem = { k: 'color'|'shape'|'size'|'animal'|'cargo'|'number'|'letter'|'expr'|'parity'|'home'|null, … }
  function semOfItem(src) {
    var it = obj(src);
    var kind = it.nameKind != null ? it.nameKind : it.type != null ? it.type : it.kind;
    var value = it.nameValue != null ? it.nameValue : it.value != null ? it.value : null;
    var s = { k: null };
    var col = NAMES.en.color[it.color] != null ? it.color : null;
    switch (kind) {
      case 'color': case 'block': case 'toy': {
        var c = NAMES.en.color[value] != null ? value : col;
        if (c) s = { k: 'color', color: c, toy: toyOf(it.toy) || (kind === 'toy' ? toyOf(value) : null) };
        else if (toyOf(value) || toyOf(it.toy)) s = { k: 'toy', toy: toyOf(value) || toyOf(it.toy) };
        break;
      }
      case 'shape': {
        var sh = NAMES.en.shape[value] != null ? value : NAMES.en.shape[it.shape] != null ? it.shape : null;
        if (sh) s = { k: 'shape', shape: sh, color: col };
        break;
      }
      case 'size': {
        var sz = sizeOf(value) || sizeOf(it.size);
        if (sz) s = { k: 'size', size: sz, color: col };
        break;
      }
      case 'home': { var h = homeOf(value); if (h) s = { k: 'home', home: h }; break; }
      case 'animal': case 'sprite': case 'cargo': case 'word': {
        var a = animalOf(value) || animalOf(it.animal) || animalOf(it.sprite);
        var cg = cargoOf(value) || cargoOf(it.sprite) || cargoOf(it.cargo);
        if (a) s = { k: 'animal', animal: a, word: kind === 'word' && value != null ? String(value) : null };
        else if (cg) s = { k: 'cargo', cargo: cg };
        else if (kind === 'word' && value != null) s = { k: 'word', word: String(value) };
        break;
      }
      case 'number': {
        var n = num(value); if (n == null) n = num(it.text); if (n == null) n = num(it.n);
        if (n != null) s = { k: 'number', n: n };
        break;
      }
      case 'parity': {
        var pn = num(value); if (pn == null) pn = num(it.text);
        if (pn != null) s = { k: 'number', n: pn };
        else if (value === 'odd' || value === 'even') s = { k: 'parity', parity: value };
        break;
      }
      case 'letter': {
        var lt = isLetter(String(value)) ? String(value) : isLetter(String(it.text)) ? String(it.text) : null;
        if (lt) s = { k: 'letter', letter: lt, small: lt !== lt.toUpperCase() };
        break;
      }
      case 'sum': case 'diff': case 'text': {
        var tx = value != null ? String(value) : it.text != null ? String(it.text) : '';
        if (splitOp(tx)) s = { k: 'expr', expr: tx };
        else if (num(tx) != null) s = { k: 'number', n: num(tx) };
        else if (isLetter(tx)) s = { k: 'letter', letter: tx, small: tx !== tx.toUpperCase() };
        else if (tx === 'odd' || tx === 'even') s = { k: 'parity', parity: tx };
        else if (animalOf(tx)) s = { k: 'animal', animal: animalOf(tx) };
        break;
      }
      default: {
        var v = value != null ? value : it.sprite != null ? it.sprite : it.text;
        if (v != null && typeof v !== 'object') {
          if (animalOf(v)) s = { k: 'animal', animal: animalOf(v) };
          else if (cargoOf(v)) s = { k: 'cargo', cargo: cargoOf(v) };
          else if (num(v) != null) s = { k: 'number', n: num(v) };
          else if (NAMES.en.color[v] != null) s = { k: 'color', color: v, toy: toyOf(it.toy) };
          else if (NAMES.en.shape[v] != null) s = { k: 'shape', shape: v };
          else if (homeOf(v)) s = { k: 'home', home: homeOf(v) };
          else if (splitOp(v)) s = { k: 'expr', expr: String(v) };
          else if (isLetter(String(v))) s = { k: 'letter', letter: String(v), small: String(v) !== upper(v) };
        }
      }
    }
    if (s.k && it.word != null && !s.word) s.word = String(it.word);
    if (s.k && it.initial != null) s.initial = String(it.initial);
    return s;
  }
  function labelOf(src) {
    var l = obj(src);
    if (l.label && typeof l.label === 'object') l = l.label;
    var s = semOfItem({ nameKind: l.type != null ? l.type : l.nameKind != null ? l.nameKind : l.kind,
      nameValue: l.value != null ? l.value : l.nameValue, color: l.color });
    // a number label is a car sign, never a parity
    return s;
  }

  // How an item is named: role 'grab' = a short exclamation ("Red block", "The cow", "Teddy bear"),
  // 'item' = a phrase for a sentence ("the red block" / "khối gỗ màu đỏ").
  function itemPhraseOf(lang, s, role) {
    var vi = lang === 'vi', grab = role === 'grab', out = '';
    switch (s.k) {
      case 'color': {
        var toy = s.toy ? NAMES[lang].toy[s.toy] : (vi ? 'đồ chơi' : 'toy');
        out = vi ? toy + ' ' + NAMES.vi.color[s.color] : (grab ? '' : 'the ') + NAMES.en.color[s.color] + ' ' + toy;
        break;
      }
      case 'toy': out = vi ? NAMES.vi.toy[s.toy] : (grab ? '' : 'the ') + NAMES.en.toy[s.toy]; break;
      case 'shape': out = vi ? NAMES.vi.shape[s.shape] : (grab ? '' : 'the ') + NAMES.en.shape[s.shape]; break;
      case 'size': out = vi ? 'khối gỗ ' + NAMES.vi.size[s.size] : (grab ? '' : 'the ') + NAMES.en.size[s.size] + ' block'; break;
      case 'animal': out = vi ? NAMES.vi.animal[s.animal] : 'the ' + NAMES.en.animal[s.animal]; break;
      case 'cargo': out = vi ? NAMES.vi.cargo[s.cargo] : (grab ? '' : 'the ') + NAMES.en.cargo[s.cargo]; break;
      case 'home': out = vi ? NAMES.vi.home[s.home] : NAMES.en.home[s.home]; break;
      case 'number': out = vi ? 'số ' + numberName(lang, s.n) : (grab ? '' : 'number ') + numberName(lang, s.n); break;
      case 'letter':
        if (vi) out = 'chữ ' + s.letter + (s.small ? ' thường' : '');
        else out = (s.small ? 'small ' : 'letter ') + s.letter;
        break;
      case 'expr': out = exprText(s.expr); break;
      case 'parity': out = vi ? 'số ' + NAMES.vi.parity[s.parity] : NAMES.en.parity[s.parity]; break;
      case 'word': out = String(s.word); break;
    }
    return lang === 'en' ? anFix(out) : out;
  }
  // A car, by its label: "the red car" / "toa màu đỏ"
  function carPhraseOf(lang, s) {
    var vi = lang === 'vi', out = '';
    switch (s.k) {
      case 'color': out = vi ? 'toa ' + NAMES.vi.color[s.color] : 'the ' + NAMES.en.color[s.color] + ' car'; break;
      case 'shape': out = vi ? 'toa ' + NAMES.vi.shape[s.shape] : 'the ' + NAMES.en.shape[s.shape] + ' car'; break;
      case 'size': out = vi ? 'toa ' + NAMES.vi.size[s.size] : 'the ' + NAMES.en.size[s.size] + ' car'; break;
      case 'home': out = vi ? 'toa ' + HOME_CAR.vi[s.home] : 'the ' + HOME_CAR.en[s.home] + ' car'; break;
      case 'number': out = vi ? 'toa số ' + numberName(lang, s.n) : 'the number ' + numberName(lang, s.n) + ' car'; break;
      case 'letter': out = vi ? 'toa chữ ' + upper(s.letter) : 'the letter ' + upper(s.letter) + ' car'; break;
      case 'expr': out = vi ? 'toa ' + exprText(s.expr) : 'the ' + exprText(s.expr) + ' car'; break;
      case 'parity': out = vi ? 'toa số ' + NAMES.vi.parity[s.parity] : 'the ' + NAMES.en.parity[s.parity] + ' car'; break;
      case 'animal': out = vi ? 'toa ' + NAMES.vi.animal[s.animal] : 'the ' + NAMES.en.animal[s.animal] + ' car'; break;
      case 'cargo': out = vi ? 'toa ' + NAMES.vi.cargo[s.cargo] : 'the ' + NAMES.en.cargo[s.cargo] + ' car'; break;
    }
    return lang === 'en' ? anFix(out) : out;
  }
  // initial topic: the word an animal stands for and its first letter ({word:'cow', first:'C'})
  function initialOf(lang, s) {
    var w = null;
    if (s.k === 'animal') w = wordName(lang, s.animal);
    else if (s.word) w = s.word;
    if (!w) return null;
    var f = null;
    var e = findEntry(lang, s.k === 'animal' ? s.animal : w);
    if (e && e.initial) f = e.initial;
    if (!f && s.initial) f = s.initial;
    if (!f) f = stripMarks(w).charAt(0).toUpperCase();
    return { word: w, first: String(f) };
  }
  function itemOfEv(ev) {
    ev = obj(ev);
    if (ev.item && typeof ev.item === 'object') {
      var it = ev.item;
      if (it.nameKind == null && ev.nameKind != null) it = Object.assign({}, it, { nameKind: ev.nameKind, nameValue: ev.nameValue });
      return it;
    }
    return ev;
  }
  function grabKey(s) {
    switch (s.k) {
      case 'color': case 'toy': return 'say.grab.block';
      case 'shape': return 'say.grab.shape';
      case 'size': return 'say.grab.size';
      case 'animal': case 'word': return 'say.grab.animal';
      case 'cargo': return 'say.grab.cargo';
      case 'letter': return 'say.grab.letter';
      case 'number': case 'parity': return 'say.grab.number';
      case 'expr': return 'say.grab.text';
      default: return 'say.grab.any';
    }
  }

  I18N.name = name;
  I18N.words = words;
  I18N.numberName = numberName;
  I18N.stripMarks = stripMarks;
  I18N.sound = function (lang, animal) { return soundOf(lang, animal && typeof animal === 'object' ? (animal.value || animal.animal) : animal); };
  I18N.hasSound = function (animal) { var a = animalOf(animal); return !!(a && SOUNDS.en[a]); };
  I18N.homeOf = function (animal) { var a = animalOf(animal); return a ? homeOfAnimal(a) : null; };
  I18N.has = function (lang, key) { return STR[L(lang)][key] != null; };
  I18N.keys = function (lang) { return Object.keys(STR[L(lang)]); };
  I18N.raw = function (lang, key) { return STR[L(lang)][key]; };
  I18N.setChild = function (nm) { I18N.child = nm ? String(nm).trim().slice(0, 24) : ''; };
  I18N.wordEntry = function (lang, v) { return findEntry(L(lang), v); };
  I18N.itemPhrase = function (lang, item, role) { lang = L(lang); return itemPhraseOf(lang, semOfItem(item), role || 'item'); };
  I18N.carPhrase = function (lang, label) { lang = L(lang); return carPhraseOf(lang, labelOf(label)); };
  I18N.phrase = function (lang, kind, value, role) {
    lang = L(lang);
    var s = semOfItem({ nameKind: kind, nameValue: value });
    return role === 'car' ? carPhraseOf(lang, s) : itemPhraseOf(lang, s, role || 'item');
  };
  I18N.TOPICS = TOPICS.slice();
  I18N.ANIMALS = ANIMALS.slice();
  I18N.HOMES = HOMES;
  I18N.CARGO = CARGO.slice();
  I18N.TOYS = TOYS.slice();
  I18N.NAME_KINDS = NAME_KINDS.slice();
  I18N.LABEL_TYPES = LABEL_TYPES.slice();
  I18N.PROMPTS = PROMPTS;
  I18N.PARAMS = NEEDS;
  I18N.NAME_TABLE = NAMES;
  I18N.SOUNDS = SOUNDS;
  I18N.LETTER_VI = LETTER_VI;
  I18N.WORD_LIST = WORD_LIST;
  I18N.MAX_COUNT = MAX_COUNT;

  // ---------------------------------------------------------------- game lines
  // `grab` / `tap` — names the item: "Red block!", "The cow!", "Teddy bear!" / "Khối gỗ màu đỏ!", "Con bò!"
  I18N.sayGrab = function (lang, ev, rng) {
    lang = L(lang);
    var s = semOfItem(itemOfEv(ev));
    var key = grabKey(s);
    return I18N.t(lang, key, { it: itemPhraseOf(lang, s, 'grab') }, rng);
  };

  // `correct` — the item landed in the right car. label = the car's label ({type, value}); also read from ev.label /
  // ev.car(.label). Count mode (ev.count {i, n}) → just the count word, so a fast child hears "One! Two! Three!".
  I18N.sayCorrect = function (lang, ev, label, rng) {
    lang = L(lang);
    ev = obj(ev);
    if (typeof label === 'function' || (label && typeof label.next === 'function')) { rng = label; label = null; }
    var cnt = obj(ev.count);
    if (num(cnt.i) != null && num(cnt.i) > 0) return I18N.sayCount(lang, num(cnt.i));
    var lab = labelOf(label || ev.label || ev.car || ev.want || null);
    var s = semOfItem(itemOfEv(ev));
    switch (lab.k) {
      case 'color': return I18N.t(lang, 'say.correct.color', { color: lab.color }, rng);
      case 'shape': return I18N.t(lang, 'say.correct.shape', { shape: lab.shape }, rng);
      case 'size': return I18N.t(lang, 'say.correct.size', { size: lab.size }, rng);
      case 'home': {
        if (s.k !== 'animal') return I18N.t(lang, 'praise', null, rng);
        var line = I18N.t(lang, 'say.correct.home', { animal: s.animal, home: lab.home }, rng);
        var snd = soundOf(lang, s.animal);
        return snd ? capFirst(snd) + '! ' + line : line;
      }
      case 'number': return I18N.t(lang, 'say.correct.number', { n: lab.n }, rng);
      case 'letter': {
        if (s.k === 'animal' || s.k === 'word') {
          var ini = initialOf(lang, s);
          return I18N.t(lang, 'say.correct.initial', { letter: upper(lab.letter), word: ini ? ini.word : null }, rng);
        }
        if (s.k === 'letter' && s.small) return I18N.t(lang, 'say.correct.lower', { letter: upper(lab.letter), lower: s.letter }, rng);
        return I18N.t(lang, 'say.correct.letter', { letter: lab.letter }, rng);
      }
      case 'expr': {
        var ans = exprAnswer(lab.expr);
        return I18N.t(lang, 'say.correct.text', { expr: exprText(lab.expr), ans: ans != null ? numberName(lang, ans) : null }, rng);
      }
      case 'parity': {
        var n = s.k === 'number' ? s.n : null;
        return I18N.t(lang, 'say.correct.parity', { n: n, parity: lab.parity }, rng);
      }
    }
    return I18N.t(lang, 'praise', null, rng);
  };

  // `wrong` — the car wiggled, the item boinged home. Names the car it hit (when main passes ev.got / ev.car / ev.label),
  // then the goal: "Boing! That’s the blue car. The red block wants the red car!". Maths never gives the answer away.
  I18N.sayWrong = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var s = semOfItem(itemOfEv(ev));
    var want = labelOf(ev.want);
    var gotSrc = ev.got || ev.car || ev.label || ev.carLabel || null;
    var got = gotSrc ? labelOf(gotSrc) : { k: null };
    var boing = I18N.t(lang, 'wrong.boing', null, rng);
    var head = got.k ? I18N.t(lang, 'wrong.got', { got: carPhraseOf(lang, got) }, rng) : boing;
    if (want.k === 'expr' || got.k === 'expr') {
      var it = s.k === 'number' ? numberName(lang, s.n) : null;
      return head + ' ' + I18N.t(lang, 'wrong.math', { item: it }, rng);
    }
    if ((want.k === 'parity' || got.k === 'parity') && s.k === 'number')
      return boing + ' ' + I18N.t(lang, 'wrong.parity', { n: s.n, parity: s.n % 2 ? 'odd' : 'even' }, rng);
    if (want.k === 'letter' && (s.k === 'animal' || s.k === 'word')) {
      var ini = initialOf(lang, s);
      if (ini) return boing + ' ' + I18N.t(lang, 'wrong.initial', { word: capFirst(ini.word), first: ini.first }, rng);
    }
    if (want.k === 'letter' && s.k === 'letter' && s.small)
      return boing + ' ' + I18N.t(lang, 'wrong.lower', { lower: s.letter, letter: upper(want.letter) }, rng);
    if (s.k && want.k)
      return head + ' ' + I18N.t(lang, 'wrong', { item: itemPhraseOf(lang, s, 'item'), want: carPhraseOf(lang, want) }, rng);
    return I18N.t(lang, 'wrong.any', null, rng);
  };

  // `carDone` — a count car reached its need: "That makes three teddy bears!"; other cars: "This car is ready!"
  I18N.sayCarDone = function (lang, ev, label, rng) {
    lang = L(lang);
    ev = obj(ev);
    if (typeof label === 'function' || (label && typeof label.next === 'function')) { rng = label; label = null; }
    var lab = labelOf(label || ev.label || ev.car || null);
    var n = lab.k === 'number' ? lab.n : num(ev.need != null ? ev.need : ev.n);
    if (n != null) {
      var s = semOfItem(itemOfEv(ev));
      var cargo = s.k === 'cargo' ? s.cargo : (ev.cargo != null ? cargoOf(ev.cargo) : null);
      return I18N.t(lang, 'say.carDone.count', { n: n, cargo: cargo }, rng);
    }
    return I18N.t(lang, 'carDone', null, rng);
  };

  // Counting aloud: i → "One!" … "Twenty!" (beyond: the digits)
  I18N.sayCount = function (lang, i) {
    lang = L(lang);
    var c = num(i);
    if (c == null) return I18N.t(lang, 'praise');
    if (STR[lang]['count.' + c]) return STR[lang]['count.' + c];
    return capFirst(numberName(lang, c)) + '!';
  };

  I18N.sayTap = I18N.sayGrab;
  I18N.sayPlay = I18N.sayCorrect;

  I18N.talkWrong = function (lang, kind, value) {
    lang = L(lang);
    if (kind && typeof kind === 'object') { value = kind.value; kind = kind.kind; }
    if (value == null || value === '') return I18N.t(lang, 'wrong.any');
    var ans = { answer: { kind: kind, value: value } };
    if (kind === 'animal') return animalOf(value) ? I18N.t(lang, 'talk.wrong.animal', ans) : I18N.t(lang, 'talk.wrong', { answer: String(value) });
    if (kind === 'home') return homeOf(value) ? I18N.t(lang, 'talk.wrong.home', { home: homeOf(value) }) : I18N.t(lang, 'talk.wrong', { answer: String(value) });
    if (kind === 'shape') return I18N.t(lang, lang === 'en' ? 'talk.wrong.a' : 'talk.wrong', ans);
    if (kind === 'size') return I18N.t(lang, 'talk.wrong.size', ans);
    if (kind === 'letter') {
      var lv = String(value);
      return I18N.t(lang, lv !== lv.toUpperCase() ? 'talk.wrong.small' : 'talk.wrong.letter', { letter: lv });
    }
    if (kind === 'number' || kind === 'dots' || (kind === 'parity' && num(value) != null))
      return I18N.t(lang, 'talk.wrong.number', { answer: { kind: 'number', value: value } });
    if (kind === 'cargo') return I18N.t(lang, lang === 'en' ? 'talk.wrong.a' : 'talk.wrong', ans);
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
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 plus $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 minus $2')
        .replace(/\s=\s/g, ' equals ');
      s = s.replace(/\b([Bb])aa\b/g, '$1aaa');
    } else {
      s = s.replace(RE_VI_LETTER, function (m, w, ch) { return w + ' ' + (LETTER_VI[ch.toUpperCase()] || ch.toLowerCase()); });
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 cộng $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 trừ $2')
        .replace(/\s=\s/g, ' bằng ');
      // Vietnamese voices read the Latin "Momo" oddly; "Mô Mô" sounds like the English name
      s = s.replace(/\bMomo\b/g, 'Mô Mô');
    }
    return s.replace(/\s{2,}/g, ' ').trim();
  };

  TT.I18N = I18N;
})(window.TT = window.TT || {});
