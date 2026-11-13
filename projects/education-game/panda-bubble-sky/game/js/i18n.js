/* Bao's Bubble Sky — PB.I18N (English + Vietnamese). Bao (EN "Bao", VI titles "Gấu trúc Bảo", VI lines "Bảo") is a
 * gentle little panda sitting on a cloud with a bubble wand. He blows bubbles with a thing inside (a toy, a shape, stars,
 * a letter / number tile, an animal); the child pops the bubble(s) with the asked thing (1–3 right ones per round), each
 * freed thing paints a piece of the rainbow. "Bao" / "Bảo" are ordinary syllables for the voices: no TTS rewrite.
 *
 *   PB.I18N.t(lang, key, params?, rng?)               → string (a random variant; rng.next() / rng() / Math.random)
 *   PB.I18N.ask(lang, promptKey, params, {first, rng}) → the question; params.k > 1 → the plural form (`.many`);
 *       first:true → the chapter's first-round form ("Look at the bubbles! Pop the red one!")
 *   PB.I18N.name(lang, kind, value)                   → kinds: color (vi "màu đỏ"), hue (bare "đỏ"), shape, toy (ball duck
 *       umbrella kite car → "quả bóng", "con vịt cao su", "cái ô", "con diều", "chiếc xe ô tô"), toyWord (bare noun), thing
 *       (a thing object → "red ball" / "quả bóng màu đỏ", "3 stars" / "3 ngôi sao", "blue star" / "ngôi sao màu xanh
 *       dương"), stars (n), animal, word (bare animal noun), who, home ("farm" / "nông trại"), homeAt ("on the farm" / "ở
 *       nông trại"), lives ("lives on the ice" / "sống ở xứ băng"), number / n (0–20), letter, sum, diff, parity, size,
 *       season (0..3 | spring…), text / tile
 *   PB.I18N.words(lang, kind, value)                  → accepted spoken forms (lower-case, + no-diacritic forms, digits)
 *   PB.I18N.choiceWords(lang, choice)                 → spoken forms of a Talk choice {id, thing}
 *   PB.I18N.initial(lang, kind, value | thing)        → first letter of the BARE noun (no classifier, diacritics → base)
 *   PB.I18N.bareWord(lang, kind, value | thing)       → that bare noun ("duck" / "vịt cao su", "cow" / "bò")
 *   PB.I18N.phrase(lang, thing, opts?) / sayName(lang, thing) → a thing named for a sentence
 *   PB.I18N.sayRight(lang, e, rng?)  sayWrong(lang, e, rng?)  sayWrongHint(lang, e, rng?)
 *   PB.I18N.sayCount(lang, i)  sayCountRun(lang, n, kind 'bubbles'|'stars')  countList(lang, n)
 *   PB.I18N.talkWrong(lang, choice | kind, value, talk?)  speech(lang, text)  setChild(name) …
 *
 * Event `e` for sayRight = the world `right` event {thing, left, k, i, home?, count?} + {topic, promptKey, params, rule, mode}
 * from main (round.rule = what the targets share {kind, value}). sayWrong: the world `wrong` event {got:{nameKind,
 * nameValue}, want:{rule} | rule, streak} + thing (main adds world.bubbleById(e.id).thing; if missing it is rebuilt from got).
 * Rule kinds: color, shape, size, count (countPop), n (countSel), animal, home, letter, lower, initial, sum, diff, parity.
 * {child}: with an empty name, variants containing {child} are skipped ("bé {child}" → "bé", ", {child}!" → "!").
 * Never negative: no "wrong", "no", "sai", "không đúng" … (tested).
 */
(function (PB) {
  'use strict';

  var LANGS = ['en', 'vi'];
  var COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'oval', 'rect', 'diamond'];
  var TOYS = ['ball', 'duck', 'umbrella', 'kite', 'car'];
  var ANIMALS = ['cow', 'pig', 'sheep', 'duck', 'hen', 'horse', 'goat', 'crab', 'penguin', 'lion', 'monkey', 'fishbowl'];
  var HOMES = ['farm', 'sea', 'ice', 'savanna', 'jungle'];
  var ANIMAL_HOME = { cow: 'farm', pig: 'farm', sheep: 'farm', duck: 'farm', hen: 'farm', horse: 'farm', goat: 'farm',
    crab: 'sea', fishbowl: 'sea', penguin: 'ice', lion: 'savanna', monkey: 'jungle' };
  var SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  var TOPICS = ['colors', 'shapes', 'size', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
  var RULE_KINDS = ['color', 'shape', 'size', 'count', 'n', 'animal', 'home', 'letter', 'lower', 'initial', 'sum', 'diff', 'parity'];
  var THING_KINDS = ['toy', 'shape', 'stars', 'tile', 'animal'];
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
  NAMES.en.shapes = { circle: 'circles', square: 'squares', triangle: 'triangles', star: 'stars', heart: 'hearts', oval: 'ovals',
    rect: 'rectangles', diamond: 'diamonds' };
  NAMES.vi.shapes = NAMES.vi.shape;
  NAMES.en.shapeH = NAMES.en.shape;     // parade compat
  NAMES.vi.shapeH = NAMES.vi.shape;
  NAMES.en.toy = { ball: 'ball', duck: 'duck', umbrella: 'umbrella', kite: 'kite', car: 'car' };
  NAMES.vi.toy = { ball: 'quả bóng', duck: 'con vịt cao su', umbrella: 'cái ô', kite: 'con diều', car: 'chiếc xe ô tô' };
  NAMES.en.toyWord = NAMES.en.toy;
  NAMES.vi.toyWord = { ball: 'bóng', duck: 'vịt cao su', umbrella: 'ô', kite: 'diều', car: 'xe ô tô' };
  NAMES.en.animal = { cow: 'cow', pig: 'pig', sheep: 'sheep', duck: 'duck', hen: 'hen', horse: 'horse', goat: 'goat',
    crab: 'crab', penguin: 'penguin', lion: 'lion', monkey: 'monkey', fishbowl: 'goldfish' };
  NAMES.vi.animal = { cow: 'con bò', pig: 'con heo', sheep: 'con cừu', duck: 'con vịt', hen: 'con gà mái', horse: 'con ngựa',
    goat: 'con dê', crab: 'con cua', penguin: 'chim cánh cụt', lion: 'sư tử', monkey: 'con khỉ', fishbowl: 'bể cá vàng' };
  NAMES.en.animals = { cow: 'cows', pig: 'pigs', sheep: 'sheep', duck: 'ducks', hen: 'hens', horse: 'horses', goat: 'goats',
    crab: 'crabs', penguin: 'penguins', lion: 'lions', monkey: 'monkeys', fishbowl: 'goldfish' };
  NAMES.vi.animals = NAMES.vi.animal;
  NAMES.en.word = NAMES.en.animal;
  NAMES.vi.word = { cow: 'bò', pig: 'heo', sheep: 'cừu', duck: 'vịt', hen: 'gà mái', horse: 'ngựa', goat: 'dê', crab: 'cua',
    penguin: 'chim cánh cụt', lion: 'sư tử', monkey: 'khỉ', fishbowl: 'cá vàng' };
  // the subject of a home line ("Chim cánh cụt sống ở xứ băng!"): the fish lives somewhere, not its bowl
  NAMES.en.who = NAMES.en.animal;
  NAMES.vi.who = {};
  ANIMALS.forEach(function (a) { NAMES.vi.who[a] = NAMES.vi.animal[a]; });
  NAMES.vi.who.fishbowl = 'bạn cá vàng';
  NAMES.en.home = { farm: 'farm', sea: 'sea', ice: 'ice', savanna: 'savanna', jungle: 'jungle' };
  NAMES.vi.home = { farm: 'nông trại', sea: 'biển', ice: 'xứ băng', savanna: 'đồng cỏ châu Phi', jungle: 'rừng rậm' };
  NAMES.en.homeAt = { farm: 'on the farm', sea: 'in the sea', ice: 'on the ice', savanna: 'on the savanna', jungle: 'in the jungle' };
  NAMES.vi.homeAt = {};
  HOMES.forEach(function (h) { NAMES.vi.homeAt[h] = 'ở ' + NAMES.vi.home[h]; });   // after "sống": "sống ở xứ băng"
  NAMES.en.size = { big: 'big', small: 'little' };
  NAMES.vi.size = { big: 'to', small: 'nhỏ' };
  NAMES.en.parity = { odd: 'odd', even: 'even' };
  NAMES.vi.parity = { odd: 'lẻ', even: 'chẵn' };
  NAMES.en.season = { spring: 'spring', summer: 'summer', autumn: 'autumn', winter: 'winter' };
  NAMES.vi.season = { spring: 'mùa xuân', summer: 'mùa hè', autumn: 'mùa thu', winter: 'mùa đông' };
  var NOUN = { en: { star: ['star', 'stars'], bubble: ['bubble', 'bubbles'] },
    vi: { star: ['ngôi sao', 'ngôi sao'], bubble: ['bong bóng', 'bong bóng'] } };

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
      color: { red: ['red', 'read', 'reds'], blue: ['blue', 'blew', 'blues'], yellow: ['yellow', 'yello'],
        green: ['green', 'greens'], orange: ['orange', 'oranges'], purple: ['purple', 'violet', 'pupple'],
        pink: ['pink', 'pinks', 'pinky'] },
      shape: { circle: ['circle', 'round', 'ring', 'circles'], square: ['square', 'squares'],
        triangle: ['triangle', 'try angle', 'triangles'], star: ['star', 'stars'], heart: ['heart', 'hearts', 'hart', 'love'],
        rect: ['rectangle', 'rectangles', 'long box'], oval: ['oval', 'ovals', 'egg shape'], diamond: ['diamond', 'diamonds'] },
      size: { big: ['big', 'large', 'huge', 'bigger', 'giant'], small: ['little', 'small', 'tiny', 'smaller', 'baby'] },
      toy: { ball: ['ball', 'balls', 'bouncy ball'], duck: ['duck', 'ducky', 'duckie', 'rubber duck', 'rubber ducky'],
        umbrella: ['umbrella', 'umbrellas', 'brolly'], kite: ['kite', 'kites'], car: ['car', 'cars', 'toy car', 'vroom'] },
      animal: { cow: ['cow', 'cows', 'moo', 'moo cow'], pig: ['pig', 'piggy', 'pigs', 'oink', 'piglet'],
        sheep: ['sheep', 'lamb', 'baa', 'sheepy'], duck: ['duck', 'ducky', 'duckie', 'ducks', 'quack'],
        hen: ['hen', 'chicken', 'hens', 'cluck'], horse: ['horse', 'horsey', 'horsie', 'horses', 'pony', 'neigh'],
        goat: ['goat', 'goats', 'billy goat'], crab: ['crab', 'crabs', 'crabby'], penguin: ['penguin', 'penguins'],
        lion: ['lion', 'lions', 'roar'], monkey: ['monkey', 'monkeys', 'chimp'],
        fishbowl: ['goldfish', 'gold fish', 'fish', 'fishy', 'fish bowl', 'fishbowl'] },
      home: { farm: ['farm', 'on the farm', 'the farm', 'barn'], sea: ['sea', 'the sea', 'ocean', 'beach', 'water', 'in the sea'],
        ice: ['ice', 'the ice', 'snow', 'iceberg', 'cold', 'south pole', 'antarctica', 'on the ice'],
        savanna: ['savanna', 'savannah', 'africa', 'grassland', 'on the savanna'],
        jungle: ['jungle', 'the jungle', 'rainforest', 'forest', 'trees', 'in the jungle'] },
      parity: { odd: ['odd', 'odds'], even: ['even', 'evens'] },
      season: { spring: ['spring'], summer: ['summer'], autumn: ['autumn', 'fall'], winter: ['winter'] }
    },
    vi: {
      color: { red: ['đỏ', 'màu đỏ'], blue: ['xanh dương', 'xanh da trời', 'xanh nước biển', 'xanh lam', 'da trời', 'dương'],
        yellow: ['vàng', 'màu vàng'], green: ['xanh lá', 'xanh lá cây', 'xanh lục', 'lá cây'], orange: ['cam', 'màu cam'],
        purple: ['tím', 'màu tím'], pink: ['hồng', 'màu hồng'] },
      shape: { circle: ['hình tròn', 'tròn'], square: ['hình vuông', 'vuông'], triangle: ['tam giác', 'hình tam giác'],
        star: ['ngôi sao', 'sao', 'hình ngôi sao', 'hình sao'], heart: ['trái tim', 'tim', 'hình trái tim', 'hình tim'],
        rect: ['chữ nhật', 'hình chữ nhật'], oval: ['bầu dục', 'hình bầu dục'], diamond: ['hình thoi', 'thoi'] },
      size: { big: ['to', 'lớn', 'bự', 'to lắm', 'to hơn', 'to nhất'], small: ['nhỏ', 'bé', 'nhỏ xíu', 'nhỏ hơn', 'tí hon', 'nhỏ nhất'] },
      toy: { ball: ['quả bóng', 'bóng', 'trái bóng', 'quả banh', 'trái banh', 'banh'],
        duck: ['con vịt cao su', 'vịt cao su', 'vịt', 'con vịt', 'vịt con'], umbrella: ['cái ô', 'cái dù', 'dù', 'chiếc ô'],
        kite: ['con diều', 'diều', 'cánh diều'], car: ['chiếc xe ô tô', 'xe ô tô', 'ô tô', 'xe hơi', 'xe', 'oto', 'xe đồ chơi'] },
      animal: { cow: ['con bò', 'bò', 'bò sữa', 'bò con'], pig: ['con heo', 'heo', 'con lợn', 'lợn', 'heo con', 'ụt ịt'],
        sheep: ['con cừu', 'cừu', 'cừu non', 'cừu con'], duck: ['con vịt', 'vịt', 'vịt con', 'cạp cạp'],
        hen: ['con gà mái', 'gà mái', 'con gà', 'gà', 'gà mẹ', 'cục tác'], horse: ['con ngựa', 'ngựa', 'ngựa con'],
        goat: ['con dê', 'dê', 'dê con'], crab: ['con cua', 'cua', 'cua biển'],
        penguin: ['chim cánh cụt', 'cánh cụt', 'con chim cánh cụt'], lion: ['sư tử', 'con sư tử', 'chúa sơn lâm'],
        monkey: ['con khỉ', 'khỉ', 'khỉ con'], fishbowl: ['bể cá vàng', 'cá vàng', 'con cá vàng', 'con cá', 'cá', 'bể cá'] },
      home: { farm: ['nông trại', 'trang trại', 'nông trường', 'chuồng', 'đồng quê', 'ở nông trại'],
        sea: ['biển', 'dưới biển', 'đại dương', 'bờ biển', 'nước', 'ở biển'],
        ice: ['xứ băng', 'băng', 'tuyết', 'băng tuyết', 'nam cực', 'bắc cực', 'xứ lạnh', 'ở xứ băng'],
        savanna: ['đồng cỏ châu phi', 'đồng cỏ', 'châu phi', 'thảo nguyên'],
        jungle: ['rừng rậm', 'rừng', 'rừng xanh', 'rừng nhiệt đới', 'trong rừng', 'ở rừng rậm'] },
      parity: { odd: ['lẻ', 'số lẻ', 'lẽ', 'lẹ'], even: ['chẵn', 'số chẵn', 'chặn', 'chắn'] },
      season: { spring: ['mùa xuân', 'xuân'], summer: ['mùa hè', 'hè', 'mùa hạ'], autumn: ['mùa thu', 'thu'], winter: ['mùa đông', 'đông'] }
    }
  };

  // ---------------------------------------------------------------- strings
  // prompt keys content.js asks with (DESIGN §5.1 / §6) and their REQUIRED (derived) params
  var PROMPTS = {
    'p.colors': ['color'], 'p.shapes': ['shape'], 'p.shapes5': ['shape'], 'p.size': ['size'], 'p.countPop': ['n'],
    'p.countSel': ['n'], 'p.animal': ['animal'], 'p.home': ['home'], 'p.letters': ['letter'], 'p.lower': ['letter'],
    'p.initial': ['letter'], 'p.add': ['n'], 'p.sub': ['n'], 'p.oddeven': ['parity']
  };

  var STR = {
    en: {
      'ui.title': 'Bao’s Bubble Sky',
      'ui.logo1': 'Bao’s',
      'ui.logo2': 'Bubble Sky',
      'ui.subtitle': 'Pop the bubbles and paint a rainbow!',
      'ui.tagline': 'Pop the bubbles and paint a rainbow!',
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
      'ui.voice': 'Bao’s voice',
      'ui.mic': 'Answer by talking',
      'ui.done': 'Done',
      'ui.stars': 'Stars',
      'ui.chapter': 'Chapter {n}',
      'ui.allDone': 'All done! {stars} stars',
      'ui.welcome': ['Hi {child}! I am Bao. Let’s blow some bubbles!', 'Hi! I am Bao. Let’s blow some bubbles!'],
      'ui.micUnsupported': 'Voice answers are not available here. Tap the pictures!',
      'ui.micDenied': 'The microphone is off. Tap the pictures instead!',
      'ui.voiceMissing': 'Tip for parents: add a voice in Settings › Accessibility › Spoken Content › Voices.',
      'ui.tapOrSay': 'Tap or say the answer!',
      'ui.listening': 'Bao is listening…',
      'ui.tapBo': 'Tap Bao to hear it again',
      'ui.tapBao': 'Tap Bao to hear it again',
      'ui.tapHint': 'Pop the right bubble',
      'ui.doorHint': 'Pop the bubbles',
      'ui.skip': 'Skip',
      'ui.gallery': 'Our bubbles',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Colour Bubbles',
      'topic.shapes': 'Shape Bubbles',
      'topic.size': 'Big and Little',
      'topic.count': 'Counting Bubbles',
      'topic.animals': 'Animal Homes',
      'topic.letters': 'Letter Bubbles',
      'topic.lower': 'Big and Small Letters',
      'topic.initial': 'First Letters',
      'topic.add': 'Adding Up',
      'topic.sub': 'Take Away',
      'topic.oddeven': 'Odd and Even',

      'weather.0': ['Spring in the clouds!', 'Spring in the clouds! Look at the blossoms!'],
      'weather.1': ['Sunny summer!', 'Sunny summer! The sun is warm!'],
      'weather.2': ['Windy autumn!', 'Windy autumn! Whoo, the leaves are flying!'],
      'weather.3': ['Snowy winter!', 'Snowy winter! Brr, snowflakes!'],

      'blow': ['Here come the bubbles!', 'Blow, blow… bubbles!', 'Look, new bubbles!'],
      'enter': ['Here come the bubbles!', 'Blow, blow… bubbles!', 'Look, new bubbles!'],

      'p.any': ['Pop a bubble!', 'Which bubble will you pop?', 'Pop, pop! Find the bubble!'],
      'p.colors': ['Pop the {color} one!', 'Can you find the {color} one? Pop it!', 'Where is the {color} one? Pop it!'],
      'p.colors.first': ['Look at the bubbles! Pop the {color} one!'],
      'p.colors.many': ['Pop the {color} ones!', 'Pop all the {color} ones!', 'Find the {color} ones! Pop, pop!'],
      'p.colors.many.first': ['Look at the bubbles! Pop all the {color} ones!'],
      'p.shapes': ['Pop the {shape}!', 'Where is the {shape}? Pop it!', 'Can you find the {shape}? Pop it!'],
      'p.shapes.first': ['Look at the bubbles! Pop the {shape}!'],
      'p.shapes.many': ['Pop the {shapes}!', 'Pop all the {shapes}!', 'Find the {shapes}! Pop, pop!'],
      'p.shapes.many.first': ['Look at the bubbles! Pop all the {shapes}!'],
      'p.shapes5': ['Look at the shapes, any colour! Pop the {shape}!', 'Find the {shape}, any colour! Pop it!',
        'So many colours! Where is the {shape}?'],
      'p.shapes5.first': ['Lots of colours… but look at the shapes! Pop the {shape}!'],
      'p.shapes5.many': ['Look at the shapes, any colour! Pop the {shapes}!', 'Pop all the {shapes}, every colour!',
        'So many colours! Pop the {shapes}!'],
      'p.shapes5.many.first': ['Lots of colours… but look at the shapes! Pop all the {shapes}!'],
      'p.size': ['Pop the {size} one!', 'Where is the {size} one? Pop it!', 'Find the {size} one and pop it!'],
      'p.size.first': ['Big ones and little ones! Pop the {size} one!'],
      'p.size.many': ['Pop the {size} ones!', 'Pop all the {size} ones!', 'Find the {size} ones! Pop, pop!'],
      'p.size.many.first': ['Big ones and little ones! Pop all the {size} ones!'],
      'p.countPop': ['Pop {n} {bubbleWord}!', 'Let’s count! Pop {n} {bubbleWord}!', 'Can you pop {n} {bubbleWord}?'],
      'p.countPop.first': ['Let’s count bubbles! Pop {n} {bubbleWord}!'],
      'p.countSel': ['Which bubble has {n} {starWord} inside? Pop it!', 'Find the bubble with {n} {starWord} inside! Pop it!',
        'Count the stars! Which bubble has {n} {starWord}? Pop it!'],
      'p.countSel.first': ['Count the stars in each bubble! Which bubble has {n} {starWord} inside? Pop it!'],
      'p.animal': ['Pop the {animal}!', 'Where is the {animal}? Pop it!', 'Can you find the {animal}? Pop it!'],
      'p.animal.first': ['Look at the animals! Pop the {animal}!'],
      'p.animal.many': ['Pop the {animals}!', 'Pop all the {animals}!', 'Find the {animals}! Pop, pop!'],
      'p.animal.many.first': ['Look at the animals! Pop all the {animals}!'],
      'p.home': ['Pop the one who lives {home}!', 'Who lives {home}? Pop it!', 'Find the friend who lives {home}!'],
      'p.home.first': ['Look at the animals! Pop the one who lives {home}!'],
      'p.home.many': ['Who lives {home}? Pop them!', 'Pop everyone who lives {home}!', 'Find the friends who live {home}! Pop, pop!'],
      'p.home.many.first': ['Look at the animals! Who lives {home}? Pop them!'],
      'p.letters': ['Pop letter {letter}!', 'Where is letter {letter}? Pop it!', 'Find letter {letter} and pop it!'],
      'p.letters.first': ['Look at the letters! Pop letter {letter}!'],
      'p.letters.many': ['Pop every letter {letter}!', 'Find all the letter {letter} bubbles!', 'Letter {letter}, letter {letter}! Pop them all!'],
      'p.letters.many.first': ['Look at the letters! Pop every letter {letter}!'],
      'p.lower': ['Pop big {letter} and small {lower}!', 'Find big {letter} and small {lower}! Pop them!',
        'Big {letter}, small {lower}! Pop them both!'],
      'p.lower.first': ['Big letters and small letters! Pop big {letter} and small {lower}!'],
      'p.initial': ['Pop the one that starts with {letter}!', 'What starts with {letter}? Pop it!',
        'Listen: {letter}! Pop the one that starts with {letter}!'],
      'p.initial.first': ['Listen to the names! Pop the one that starts with {letter}!'],
      'p.initial.many': ['Pop the ones that start with {letter}!', 'What starts with {letter}? Pop them!',
        'Listen: {letter}! Pop all the ones that start with {letter}!'],
      'p.initial.many.first': ['Listen to the names! Pop all the ones that start with {letter}!'],
      'p.add': ['Pop the one that makes {n}!', 'Which one makes {n}? Pop it!', 'Let’s add! Pop the one that makes {n}!'],
      'p.add.first': ['Let’s add up! Pop the one that makes {n}!'],
      'p.add.many': ['Pop the ones that make {n}!', 'Which ones make {n}? Pop them!', 'Let’s add! Pop the ones that make {n}!'],
      'p.add.many.first': ['Let’s add up! Pop all the ones that make {n}!'],
      'p.sub': ['Pop the one that makes {n}!', 'Which one makes {n}? Pop it!', 'Take away! Pop the one that makes {n}!'],
      'p.sub.first': ['Let’s take away! Pop the one that makes {n}!'],
      'p.sub.many': ['Pop the ones that make {n}!', 'Which ones make {n}? Pop them!', 'Take away! Pop the ones that make {n}!'],
      'p.sub.many.first': ['Let’s take away! Pop all the ones that make {n}!'],
      'p.oddeven': ['Pop the {parity} number!', 'Which number is {parity}? Pop it!', 'Find the {parity} number and pop it!'],
      'p.oddeven.first': ['Look at the numbers! Pop the {parity} number!'],
      'p.oddeven.many': ['Pop the {parity} numbers!', 'Pop all the {parity} numbers!', 'Which numbers are {parity}? Pop them!'],
      'p.oddeven.many.first': ['Look at the numbers! Pop all the {parity} numbers!'],

      'right.thing': ['{thing}!', 'Pop! {thing}!', 'Yes! {thing}!'],
      'right.home': ['{who} lives {home}!', 'Yes! {who} lives {home}!', 'Pop! {who} lives {home}!'],
      'right.initial': ['{thing}! {word} starts with {first}!', 'Yes! {word} starts with {first}!', '{thing}! {first} is for {word}!'],
      'right.sum': ['{expr} makes {ans}!', 'Yes! {expr} is {ans}!', '{expr} makes {ans}! Super adding!'],
      'right.diff': ['{expr} makes {ans}!', 'Yes! {expr} is {ans}!', '{expr} makes {ans}! Super thinking!'],
      'right.parity': ['{num} is {parity}!', 'Yes! {num} is {parity}!', '{num} is a {parity} number!'],
      'right.more1': ['One more!', 'One more to go!', 'Just one more!'],
      'right.moreN': ['{num} more!', '{num} more to go!', 'Find {num} more!'],
      'right.more1.who': ['One more!', 'One more to go!', 'Just one more!'],
      'right.moreN.who': ['{num} more!', '{num} more to go!', 'Find {num} more!'],
      'right.more1.color': ['One more {color} one!', 'One more {color} one to go!', 'Find one more {color} one!'],
      'right.moreN.color': ['{num} more {color} ones!', '{num} more {color} ones to go!', 'Find {num} more {color} ones!'],
      'right.any': ['Pop! Yes!', 'You got it!', 'Yes! Pop!'],

      'wrong.is': ['That’s {thing}.', 'This one is {thing}.', 'Look, {thing}.'],
      'wrong.stars': ['That’s {thing}.', 'This bubble has {thing}.', 'Let’s count: {thing}.'],
      'wrong.livesAt': ['It lives {home}.', 'It lives {home}!', 'That one lives {home}.'],
      'wrong.starts': ['{word} starts with {first}.', 'Listen: {word}, {first}.', '{first} is for {word}.'],
      'wrong.expr': ['{expr} makes {ans}.', '{expr} is {ans}.', 'Let’s count: {expr} makes {ans}.'],
      'wrong.parity': ['{num} is {parity}.', '{num} is a {parity} number.', 'Look, {num} is {parity}.'],
      'wrong.hint': ['Look at the shiny one!', 'Watch the little hand!', 'The glowing one! Pop it!'],
      'wrong.any': ['Let’s look again!', 'Let’s try another bubble!', 'Hmm, let’s think again!', 'Keep going, you can do it!'],
      'goal.color': ['Find a {color} one!', 'Let’s find a {color} one!', 'Where is a {color} one?'],
      'goal.shape': ['Find the {shape}!', 'Let’s find a {shape}!', 'Where is the {shape}?'],
      'goal.size': ['Find a {size} one!', 'Let’s find a {size} one!', 'Where is a {size} one?'],
      'goal.n': ['Find {what}!', 'Let’s find {what}!', 'Where are {what}?'],
      'goal.animal': ['Find the {animal}!', 'Let’s find the {animal}!', 'Where is the {animal}?'],
      'goal.home': ['Who lives {home}?', 'Find who lives {home}!', 'Let’s find who lives {home}!'],
      'goal.letter': ['Find letter {letter}!', 'Let’s find letter {letter}!', 'Where is letter {letter}?'],
      'goal.lower': ['Find big {letter} and small {lower}!', 'Let’s find big {letter} or small {lower}!', 'Where are big {letter} and small {lower}?'],
      'goal.initial': ['Find one that starts with {letter}!', 'What starts with {letter}?', 'Let’s find one that starts with {letter}!'],
      'goal.sum': ['Find one that makes {n}!', 'Which one makes {n}?', 'Let’s find one that makes {n}!'],
      'goal.diff': ['Find one that makes {n}!', 'Which one makes {n}?', 'Let’s find one that makes {n}!'],
      'goal.parity': ['Find a {parity} number!', 'Let’s find a {parity} number!', 'Which number is {parity}?'],
      'goal.any': ['Let’s look again!', 'Let’s try another bubble!', 'You can do it!'],

      'rainbow': ['Rainbow!', 'Look, a rainbow!', 'A rainbow! Hooray!', 'Rainbow! Great job, {child}!'],
      'whoosh': ['Whoosh!', 'Whoosh! Bye-bye, bubbles!', 'Fly away, bubbles!'],
      'poke': ['Hee hee! That tickles!', 'Hee hee! Hi there!', 'Giggle, giggle!', 'Bao is happy!'],
      'surprise.bird': ['Look! A little bird!', 'Tweet tweet! Who is that?', 'A little bird came to visit!'],
      'bird.tap': ['Tweet tweet!', 'Loop-the-loop! Wheee!', 'The bird says tweet tweet!'],
      'surprise.kite': ['Look! A kite in the sky!', 'Wow, a kite is flying!', 'Here comes a kite!'],
      'kite.tap': ['Wheee! A loop!', 'Round and round!', 'Up, up goes the kite!'],
      'surprise.snow': ['Look! Big snowflakes!', 'Snowflakes are falling!', 'Brr! Snowflakes!'],
      'snow.tap': ['Twinkle!', 'Sparkle, sparkle!', 'Tiny bubbles!'],

      'praise': ['Yes!', 'Great job!', 'You got it!', 'Super!', 'Wonderful!', 'Hooray!', 'Well done!', 'Lovely popping!'],
      'great': ['Great job, {child}!', 'You did it, {child}!', 'Wow, {child}, super popping!', 'What a rainbow!',
        'You are so clever!', 'Hooray! Wonderful!'],
      'party': ['Look at all the bubbles!', 'Hooray! A sky full of bubbles!', 'Let’s dance! Pop, pop!'],
      'hint': ['Psst! Look at the shiny bubble!', 'Watch the little hand!', 'Bao will help! Pop this one!',
        'Look, this bubble is sparkling!', 'The glowing one! Pop it!'],
      'idle': ['Bao is waiting! Your turn!', 'The bubbles are waiting for you!', 'I am here, {child}! Let’s play!',
        'Pop, pop! Let’s play!', 'Your turn to pop!'],

      'talk.intro': 'Talk time!',
      'talk.color': 'What colour is this?',
      'talk.colors': 'What colour is this?',
      'talk.colorsAny': 'What colour is this?',
      'talk.colorsWhich': 'Which one is {color}?',
      'talk.shape': 'Which one is the {shape}?',
      'talk.shapes': 'Which one is the {shape}?',
      'talk.shapesAny': 'What shape is this?',
      'talk.shapes5': 'Which one is the {shape}?',
      'talk.size': 'Which one is {size}?',
      'talk.sizeAny': 'Which one is the little one?',
      'talk.sizeWhich': 'Which one is {size}?',
      'talk.count': 'How many stars?',
      'talk.countAny': 'How many are there?',
      'talk.home': 'Where does the {animal} live?',
      'talk.animals': 'Where does the {animal} live?',
      'talk.farm': 'Where does the {animal} live?',
      'talk.homeAny': 'Where does it live?',
      'talk.who': 'Who is this?',
      'talk.animalsWho': 'Who is this?',
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
      'talk.wrong.small': 'It is small {letter}! Good try!',
      'talk.wrong.number': 'It is {answer}! Good try!',
      'talk.wrong.stars': 'There are {num} {starWord}! Good try!',
      'talk.wrong.star1': 'There is {num} {starWord}! Good try!',
      'talk.wrong.home': '{who} lives {home}! Good try!',
      'talk.wrong.place': 'It lives {home}! Good try!',
      'talk.wrong.any': 'Good try! Let’s play more!',

      'session.done': ['What a bubbly day! {stars} stars! Hooray!', 'Amazing, {child}! {stars} stars!',
        'So many rainbows! {stars} stars!']
    },
    vi: {
      'ui.title': 'Gấu Trúc Bảo Thổi Bong Bóng',
      'ui.logo1': 'Gấu Trúc Bảo',
      'ui.logo2': 'Thổi Bong Bóng',
      'ui.subtitle': 'Bé chọc bong bóng và tô cầu vồng nhé!',
      'ui.tagline': 'Bé chọc bong bóng và tô cầu vồng nhé!',
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
      'ui.voice': 'Giọng của Bảo',
      'ui.mic': 'Nói để trả lời',
      'ui.done': 'Xong',
      'ui.stars': 'Ngôi sao',
      'ui.chapter': 'Chương {n}',
      'ui.allDone': 'Hoàn thành! {stars} ngôi sao',
      'ui.welcome': ['Chào bé {child}! Mình là gấu trúc Bảo. Mình cùng thổi bong bóng nhé!',
        'Chào bé! Mình là gấu trúc Bảo. Mình cùng thổi bong bóng nhé!'],
      'ui.micUnsupported': 'Máy này chưa nghe được giọng nói. Bé chạm vào hình nhé!',
      'ui.micDenied': 'Micrô đang tắt. Bé chạm vào hình nhé!',
      'ui.voiceMissing': 'Mẹo cho bố mẹ: thêm giọng tiếng Việt trong Cài đặt › Trợ năng › Nội dung được đọc › Giọng nói.',
      'ui.tapOrSay': 'Bé chạm hoặc nói đáp án nhé!',
      'ui.listening': 'Bảo đang nghe…',
      'ui.tapBo': 'Chạm vào Bảo để nghe lại nhé',
      'ui.tapBao': 'Chạm vào Bảo để nghe lại nhé',
      'ui.tapHint': 'Bé chọc đúng bong bóng nhé',
      'ui.doorHint': 'Bé chọc bong bóng nhé',
      'ui.skip': 'Bỏ qua',
      'ui.gallery': 'Bong bóng của bé',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Bong bóng sắc màu',
      'topic.shapes': 'Bong bóng hình khối',
      'topic.size': 'To và nhỏ',
      'topic.count': 'Cùng đếm bong bóng',
      'topic.animals': 'Nhà của các bạn thú',
      'topic.letters': 'Bong bóng chữ cái',
      'topic.lower': 'Chữ hoa, chữ thường',
      'topic.initial': 'Chữ cái đầu tiên',
      'topic.add': 'Phép cộng',
      'topic.sub': 'Phép trừ',
      'topic.oddeven': 'Số chẵn, số lẻ',

      'weather.0': ['Mùa xuân trên mây!', 'Mùa xuân trên mây! Hoa nở rồi nè!'],
      'weather.1': ['Mùa hè nắng đẹp!', 'Mùa hè nắng đẹp! Ông mặt trời ấm áp quá!'],
      'weather.2': ['Mùa thu lộng gió!', 'Mùa thu lộng gió! Lá bay vèo vèo!'],
      'weather.3': ['Mùa đông có tuyết!', 'Mùa đông có tuyết! Brr, bông tuyết rơi nè!'],

      'blow': ['Bong bóng tới rồi!', 'Thổi, thổi… bong bóng nè!', 'Nhìn kìa, bong bóng mới!'],
      'enter': ['Bong bóng tới rồi!', 'Thổi, thổi… bong bóng nè!', 'Nhìn kìa, bong bóng mới!'],

      'p.any': ['Bé chọc bong bóng nhé!', 'Bé chọc bong bóng nào nhỉ?', 'Bụp bụp! Bé tìm bong bóng nhé!'],
      'p.colors': ['Bé ơi, chọc bong bóng có đồ chơi {color} nhé!', 'Cái nào {color} nhỉ? Bé chọc đi nào!',
        'Bé tìm cái {color} rồi chọc nhé!'],
      'p.colors.first': ['Bé xem bong bóng kìa! Bé chọc bong bóng có đồ chơi {color} nhé!'],
      'p.colors.many': ['Bé chọc các bong bóng {color} nhé!', 'Bé tìm hết những cái {color} nhé!',
        'Những cái nào {color} nhỉ? Bé chọc hết nhé!'],
      'p.colors.many.first': ['Bé xem bong bóng kìa! Bé chọc hết các bong bóng có đồ chơi {color} nhé!'],
      'p.shapes': ['Bé ơi, chọc bong bóng có {shape} nhé!', '{shape} ở đâu nhỉ? Bé chọc đi nào!', 'Bé tìm {shape} rồi chọc nhé!'],
      'p.shapes.first': ['Bé xem bong bóng kìa! Bé chọc bong bóng có {shape} nhé!'],
      'p.shapes.many': ['Bé chọc các bong bóng có {shapes} nhé!', 'Bé tìm hết các {shapes} nhé!', 'Các {shapes} ở đâu nhỉ? Bé chọc hết nhé!'],
      'p.shapes.many.first': ['Bé xem bong bóng kìa! Bé chọc hết các bong bóng có {shapes} nhé!'],
      'p.shapes5': ['Bé nhìn hình chứ không nhìn màu nhé! Chọc {shape} nào!', 'Bé tìm {shape}, màu nào cũng được nhé!',
        'Nhiều màu quá! {shape} ở đâu nhỉ?'],
      'p.shapes5.first': ['Nhiều màu quá… nhưng bé nhìn hình nhé! Bé chọc {shape} nhé!'],
      'p.shapes5.many': ['Bé nhìn hình chứ không nhìn màu nhé! Chọc các {shapes} nào!', 'Bé chọc hết các {shapes}, màu nào cũng được nhé!',
        'Nhiều màu quá! Bé chọc các {shapes} nhé!'],
      'p.shapes5.many.first': ['Nhiều màu quá… nhưng bé nhìn hình nhé! Bé chọc hết các {shapes} nhé!'],
      'p.size': ['Bé ơi, chọc cái {size} nhé!', 'Cái nào {size} nhỉ? Bé chọc đi nào!', 'Bé tìm cái {size} rồi chọc nhé!'],
      'p.size.first': ['Có cái to, có cái nhỏ! Bé chọc cái {size} nhé!'],
      'p.size.many': ['Bé chọc hết những cái {size} nhé!', 'Những cái nào {size} nhỉ? Bé chọc hết nhé!',
        'Bé tìm những cái {size} rồi chọc nhé!'],
      'p.size.many.first': ['Có cái to, có cái nhỏ! Bé chọc hết những cái {size} nhé!'],
      'p.countPop': ['Bé chọc {n} {bubbleWord} nhé!', 'Mình đếm nhé! Bé chọc {n} {bubbleWord} nào!', 'Bé chọc đúng {n} {bubbleWord} nhé!'],
      'p.countPop.first': ['Mình cùng đếm bong bóng nhé! Bé chọc {n} {bubbleWord} nào!'],
      'p.countSel': ['Bé tìm bong bóng có {n} {starWord} rồi chọc nhé!', 'Bong bóng nào có {n} {starWord} bên trong nhỉ? Bé chọc nhé!',
        'Mình đếm sao nhé! Bong bóng nào có {n} {starWord}? Bé chọc đi nào!'],
      'p.countSel.first': ['Bé đếm sao trong mỗi bong bóng nhé! Bong bóng nào có {n} {starWord} bên trong? Bé chọc nhé!'],
      'p.animal': ['Bé ơi, chọc bong bóng có {animal} nhé!', '{animal} ở đâu nhỉ? Bé chọc đi nào!', 'Bé tìm {animal} rồi chọc nhé!'],
      'p.animal.first': ['Bé xem các bạn thú kìa! Bé chọc bong bóng có {animal} nhé!'],
      'p.animal.many': ['Bé chọc các bong bóng có {animals} nhé!', 'Bé tìm hết các bạn {animals} nhé!', 'Các bạn {animals} ở đâu nhỉ? Bé chọc hết nhé!'],
      'p.animal.many.first': ['Bé xem các bạn thú kìa! Bé chọc hết các bong bóng có {animals} nhé!'],
      'p.home': ['Bé chọc bạn sống {home} nhé!', 'Bạn nào sống {home} nhỉ? Bé chọc nhé!', 'Bé tìm bạn sống {home} nào!'],
      'p.home.first': ['Bé xem các bạn thú kìa! Bé chọc bạn sống {home} nhé!'],
      'p.home.many': ['Ai sống {home}? Bé chọc nào!', 'Bé chọc hết các bạn sống {home} nhé!', 'Các bạn nào sống {home} nhỉ? Bé chọc hết nhé!'],
      'p.home.many.first': ['Bé xem các bạn thú kìa! Ai sống {home}? Bé chọc nào!'],
      'p.letters': ['Bé ơi, chọc chữ {letter} nhé!', 'Chữ {letter} ở đâu nhỉ? Bé chọc đi nào!', 'Bé tìm chữ {letter} rồi chọc nhé!'],
      'p.letters.first': ['Bé xem các chữ cái kìa! Bé chọc chữ {letter} nhé!'],
      'p.letters.many': ['Bé chọc hết các chữ {letter} nhé!', 'Bé tìm tất cả chữ {letter} nhé!', 'Các chữ {letter} ở đâu nhỉ? Bé chọc hết nhé!'],
      'p.letters.many.first': ['Bé xem các chữ cái kìa! Bé chọc hết các chữ {letter} nhé!'],
      'p.lower': ['Bé chọc chữ {letter} hoa và chữ {lower} thường nhé!', 'Chữ {letter} hoa, chữ {lower} thường ở đâu nhỉ? Bé chọc cả hai nhé!',
        'Bé tìm chữ {letter} hoa và chữ {lower} thường nào!'],
      'p.lower.first': ['Có chữ hoa, có chữ thường! Bé chọc chữ {letter} hoa và chữ {lower} thường nhé!'],
      'p.initial': ['Bé chọc bạn có tên bắt đầu bằng chữ {letter} nhé!', 'Tên nào bắt đầu bằng chữ {letter} nhỉ? Bé chọc nhé!',
        'Bé nghe nè: chữ {letter}! Bé chọc bạn bắt đầu bằng chữ {letter} nhé!'],
      'p.initial.first': ['Bé nghe tên các bạn nhé! Bé chọc bạn có tên bắt đầu bằng chữ {letter} nhé!'],
      'p.initial.many': ['Bé chọc các bạn có tên bắt đầu bằng chữ {letter} nhé!', 'Tên nào bắt đầu bằng chữ {letter} nhỉ? Bé chọc hết nhé!',
        'Bé nghe nè: chữ {letter}! Bé chọc hết các bạn bắt đầu bằng chữ {letter} nhé!'],
      'p.initial.many.first': ['Bé nghe tên các bạn nhé! Bé chọc hết các bạn có tên bắt đầu bằng chữ {letter} nhé!'],
      'p.add': ['Bé chọc phép tính bằng {n} nhé!', 'Phép tính nào bằng {n} nhỉ? Bé chọc nhé!', 'Mình cộng nào! Bé chọc phép tính bằng {n} nhé!'],
      'p.add.first': ['Mình cùng làm phép cộng nhé! Bé chọc phép tính bằng {n} nhé!'],
      'p.add.many': ['Bé chọc các phép tính bằng {n} nhé!', 'Những phép tính nào bằng {n} nhỉ? Bé chọc hết nhé!',
        'Mình cộng nào! Bé chọc hết các phép tính bằng {n} nhé!'],
      'p.add.many.first': ['Mình cùng làm phép cộng nhé! Bé chọc hết các phép tính bằng {n} nhé!'],
      'p.sub': ['Bé chọc phép tính bằng {n} nhé!', 'Phép tính nào bằng {n} nhỉ? Bé chọc nhé!', 'Mình trừ nào! Bé chọc phép tính bằng {n} nhé!'],
      'p.sub.first': ['Mình cùng làm phép trừ nhé! Bé chọc phép tính bằng {n} nhé!'],
      'p.sub.many': ['Bé chọc các phép tính bằng {n} nhé!', 'Những phép tính nào bằng {n} nhỉ? Bé chọc hết nhé!',
        'Mình trừ nào! Bé chọc hết các phép tính bằng {n} nhé!'],
      'p.sub.many.first': ['Mình cùng làm phép trừ nhé! Bé chọc hết các phép tính bằng {n} nhé!'],
      'p.oddeven': ['Bé chọc số {parity} nhé!', 'Số nào là số {parity} nhỉ? Bé chọc nhé!', 'Bé tìm số {parity} rồi chọc nhé!'],
      'p.oddeven.first': ['Bé xem các số kìa! Bé chọc số {parity} nhé!'],
      'p.oddeven.many': ['Bé chọc các số {parity} nhé!', 'Bé chọc hết các số {parity} nhé!', 'Những số nào là số {parity} nhỉ? Bé chọc hết nhé!'],
      'p.oddeven.many.first': ['Bé xem các số kìa! Bé chọc hết các số {parity} nhé!'],

      'right.thing': ['{thing}!', 'Bụp! {thing}!', 'Đúng rồi! {thing}!'],
      'right.home': ['{who} sống {home}!', 'Đúng rồi! {who} sống {home}!', 'Bụp! {who} sống {home} đó!'],
      'right.initial': ['{thing}! {word} bắt đầu bằng chữ {first}!', 'Đúng rồi! {word} bắt đầu bằng chữ {first}!', '{thing}! Chữ {first}, {word}!'],
      'right.sum': ['{expr} bằng {ans}!', 'Đúng rồi! {expr} bằng {ans}!', '{expr} bằng {ans}! Bé cộng giỏi quá!'],
      'right.diff': ['{expr} bằng {ans}!', 'Đúng rồi! {expr} bằng {ans}!', '{expr} bằng {ans}! Bé trừ giỏi quá!'],
      'right.parity': ['{num} là số {parity}!', 'Đúng rồi! {num} là số {parity}!', '{num} là số {parity} đó!'],
      'right.more1': ['Còn một cái nữa!', 'Còn một cái nữa nhé!', 'Còn một cái nữa thôi!'],
      'right.moreN': ['Còn {num} cái nữa!', 'Còn {num} cái nữa nhé!', 'Bé tìm thêm {num} cái nữa nhé!'],
      'right.more1.who': ['Còn một bạn nữa!', 'Còn một bạn nữa nhé!', 'Còn một bạn nữa thôi!'],
      'right.moreN.who': ['Còn {num} bạn nữa!', 'Còn {num} bạn nữa nhé!', 'Bé tìm thêm {num} bạn nữa nhé!'],
      'right.more1.color': ['Còn một cái {color} nữa!', 'Còn một cái {color} nữa nhé!', 'Bé tìm thêm một cái {color} nữa nhé!'],
      'right.moreN.color': ['Còn {num} cái {color} nữa!', 'Còn {num} cái {color} nữa nhé!', 'Bé tìm thêm {num} cái {color} nữa nhé!'],
      'right.any': ['Bụp! Đúng rồi!', 'Bé giỏi quá!', 'Đúng rồi! Bụp!'],

      'wrong.is': ['Đây là {thing}.', 'Đây là {thing} nè.', 'Ồ, {thing}.'],
      'wrong.stars': ['Đây là {thing}.', 'Bong bóng này có {thing}.', 'Mình đếm nhé: {thing}.'],
      'wrong.livesAt': ['Bạn ấy sống {home}.', 'Bạn ấy sống {home} đó!', 'Bạn này sống {home}.'],
      'wrong.starts': ['{word} bắt đầu bằng chữ {first}.', 'Bé nghe nè: {word}, chữ {first}.', 'Chữ {first}, {word}.'],
      'wrong.expr': ['{expr} bằng {ans}.', '{expr} bằng {ans} nè.', 'Mình đếm nhé: {expr} bằng {ans}.'],
      'wrong.parity': ['{num} là số {parity}.', '{num} là số {parity} nè.', 'Ồ, {num} là số {parity}.'],
      'wrong.hint': ['Bé nhìn bong bóng đang sáng nè!', 'Bé xem bàn tay nhỏ chỉ nè!', 'Bong bóng sáng đó! Bé chọc nhé!'],
      'wrong.any': ['Mình tìm lại nhé!', 'Bé thử bong bóng khác nhé!', 'Bé nghĩ thêm chút nữa nhé!', 'Cố lên, bé làm được mà!'],
      'goal.color': ['Mình tìm cái {color} nhé!', 'Bé tìm cái {color} nhé!', 'Cái nào {color} nhỉ?'],
      'goal.shape': ['Mình tìm {shape} nhé!', 'Bé tìm {shape} nhé!', '{shape} đâu rồi nhỉ?'],
      'goal.size': ['Mình tìm cái {size} nhé!', 'Bé tìm cái {size} nhé!', 'Cái nào {size} nhỉ?'],
      'goal.n': ['Mình tìm bong bóng có {what} nhé!', 'Bé tìm {what} nhé!', 'Bong bóng nào có {what} nhỉ?'],
      'goal.animal': ['Mình tìm {animal} nhé!', 'Bé tìm {animal} nhé!', '{animal} đâu rồi nhỉ?'],
      'goal.home': ['Bạn nào sống {home} nhỉ?', 'Mình tìm bạn sống {home} nhé!', 'Ai sống {home} nào?'],
      'goal.letter': ['Mình tìm chữ {letter} nhé!', 'Bé tìm chữ {letter} nhé!', 'Chữ {letter} đâu rồi nhỉ?'],
      'goal.lower': ['Mình tìm chữ {letter} hoa và chữ {lower} thường nhé!', 'Bé tìm chữ {letter} hoa hay chữ {lower} thường nhé!',
        'Chữ {letter} hoa, chữ {lower} thường đâu rồi nhỉ?'],
      'goal.initial': ['Mình tìm bạn bắt đầu bằng chữ {letter} nhé!', 'Bạn nào bắt đầu bằng chữ {letter} nhỉ?',
        'Bé tìm bạn bắt đầu bằng chữ {letter} nhé!'],
      'goal.sum': ['Mình tìm phép tính bằng {n} nhé!', 'Phép tính nào bằng {n} nhỉ?', 'Bé tìm phép tính bằng {n} nhé!'],
      'goal.diff': ['Mình tìm phép tính bằng {n} nhé!', 'Phép tính nào bằng {n} nhỉ?', 'Bé tìm phép tính bằng {n} nhé!'],
      'goal.parity': ['Mình tìm số {parity} nhé!', 'Bé tìm số {parity} nhé!', 'Số nào là số {parity} nhỉ?'],
      'goal.any': ['Mình tìm lại nhé!', 'Bé thử bong bóng khác nhé!', 'Bé làm được mà!'],

      'rainbow': ['Cầu vồng rồi!', 'Nhìn kìa, cầu vồng!', 'Cầu vồng rồi! Hoan hô!', 'Cầu vồng rồi! Bé {child} giỏi quá!'],
      'whoosh': ['Vù!', 'Vù vù! Tạm biệt bong bóng!', 'Bong bóng bay đi nào!'],
      'poke': ['Hi hi! Nhột quá!', 'Hi hi! Chào bé nè!', 'Khúc khích, khúc khích!', 'Bảo vui quá!'],
      'surprise.bird': ['Nhìn kìa! Một bạn chim nhỏ!', 'Chíp chíp! Ai thế nhỉ?', 'Bạn chim nhỏ đến chơi nè!'],
      'bird.tap': ['Chíp chíp!', 'Nhào lộn nè! Vui quá!', 'Bạn chim hót chíp chíp!'],
      'surprise.kite': ['Nhìn kìa! Con diều trên trời!', 'Oa, con diều bay cao quá!', 'Con diều bay tới rồi!'],
      'kite.tap': ['Ui! Diều nhào lộn!', 'Vòng vòng, vòng vòng!', 'Diều bay cao, cao nữa!'],
      'surprise.snow': ['Nhìn kìa! Bông tuyết to quá!', 'Bông tuyết rơi rồi!', 'Brr! Bông tuyết nè!'],
      'snow.tap': ['Lấp lánh!', 'Lung linh quá!', 'Bong bóng tí hon nè!'],

      'praise': ['Đúng rồi!', 'Giỏi quá!', 'Tuyệt vời!', 'Hoan hô!', 'Bé giỏi lắm!', 'Chính xác!', 'Hay quá!', 'Bé chọc giỏi quá!'],
      'great': ['Bé {child} giỏi quá!', 'Hoan hô bé {child}!', 'Oa, bé {child} chọc bong bóng siêu giỏi!', 'Cầu vồng đẹp quá!',
        'Bé thông minh quá!', 'Hoan hô! Tuyệt vời!'],
      'party': ['Nhìn bong bóng nhiều chưa kìa!', 'Hoan hô! Cả bầu trời bong bóng!', 'Mình cùng nhảy múa nào! Bụp bụp!'],
      'hint': ['Bé nhìn nè! Bong bóng này đang sáng lên.', 'Bé xem bàn tay nhỏ chỉ nè!', 'Bảo giúp bé nhé! Chọc bong bóng này nè!',
        'Nhìn kìa, bong bóng này lấp lánh!', 'Bong bóng sáng đó! Bé chọc nhé!'],
      'idle': ['Bảo đang chờ bé nè!', 'Bong bóng đang chờ bé nè!', 'Bé {child} ơi, mình chơi tiếp nhé!',
        'Bụp bụp! Mình chơi nào!', 'Tới lượt bé chọc rồi nè!'],

      'talk.intro': 'Mình cùng nói chuyện nhé!',
      'talk.color': 'Cái này màu gì nhỉ?',
      'talk.colors': 'Cái này màu gì nhỉ?',
      'talk.colorsAny': 'Cái này màu gì nhỉ?',
      'talk.colorsWhich': 'Cái nào {color} nhỉ?',
      'talk.shape': '{shape} là cái nào nhỉ?',
      'talk.shapes': '{shape} là cái nào nhỉ?',
      'talk.shapesAny': 'Đây là hình gì nhỉ?',
      'talk.shapes5': '{shape} là cái nào nhỉ?',
      'talk.size': 'Cái nào {size} nhỉ?',
      'talk.sizeAny': 'Cái nào nhỏ xíu nhỉ?',
      'talk.sizeWhich': 'Cái nào {size} nhỉ?',
      'talk.count': 'Có mấy ngôi sao nào?',
      'talk.countAny': 'Có bao nhiêu cái nào?',
      'talk.home': '{animal} sống ở đâu nhỉ?',
      'talk.animals': '{animal} sống ở đâu nhỉ?',
      'talk.farm': '{animal} sống ở đâu nhỉ?',
      'talk.homeAny': 'Bạn ấy sống ở đâu nhỉ?',
      'talk.who': 'Đây là con gì nhỉ?',
      'talk.animalsWho': 'Đây là con gì nhỉ?',
      'talk.animalsAny': 'Đây là con gì nhỉ?',
      'talk.letters': 'Chữ {letter} ở đâu nhỉ?',
      'talk.lettersAny': 'Đây là chữ gì nào?',
      'talk.lower': 'Chữ {lower} thường ở đâu nhỉ? Bạn của chữ {letter} hoa đó!',
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
      'talk.wrong.size': 'Là cái {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.letter': 'Là chữ {letter} đó! Bé cố gắng lắm!',
      'talk.wrong.small': 'Là chữ {letter} thường đó! Bé cố gắng lắm!',
      'talk.wrong.number': 'Là số {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.stars': 'Có {num} {starWord} đó! Bé cố gắng lắm!',
      'talk.wrong.star1': 'Có {num} {starWord} đó! Bé cố gắng lắm!',
      'talk.wrong.home': '{who} sống {home} đó! Bé cố gắng lắm!',
      'talk.wrong.place': 'Bạn ấy sống {home} đó! Bé cố gắng lắm!',
      'talk.wrong.any': 'Bé cố gắng lắm! Mình chơi tiếp nhé!',

      'session.done': ['Một ngày thổi bong bóng vui quá! {stars} ngôi sao!', 'Bé {child} giỏi quá! {stars} ngôi sao!',
        'Bao nhiêu là cầu vồng! {stars} ngôi sao!']
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
    'right.thing': ['thing'], 'right.home': ['who', 'home'], 'right.initial': ['thing', 'word', 'first'],
    'right.sum': ['expr', 'ans'], 'right.diff': ['expr', 'ans'], 'right.parity': ['num', 'parity'],
    'right.moreN': ['num'], 'right.moreN.who': ['num'], 'right.more1.color': ['color'], 'right.moreN.color': ['num', 'color'],
    'wrong.is': ['thing'], 'wrong.stars': ['thing'], 'wrong.livesAt': ['home'], 'wrong.starts': ['word', 'first'], 'wrong.expr': ['expr', 'ans'],
    'wrong.parity': ['num', 'parity'],
    'goal.color': ['color'], 'goal.shape': ['shape'], 'goal.size': ['size'], 'goal.n': ['what'], 'goal.animal': ['animal'],
    'goal.home': ['home'], 'goal.letter': ['letter'], 'goal.lower': ['letter', 'lower'], 'goal.initial': ['letter'],
    'goal.sum': ['n'], 'goal.diff': ['n'], 'goal.parity': ['parity'],
    'talk.colorsWhich': ['color'], 'talk.shape': ['shape'], 'talk.shapes': ['shape'], 'talk.shapes5': ['shape'],
    'talk.size': ['size'], 'talk.sizeWhich': ['size'], 'talk.home': ['animal'], 'talk.animals': ['animal'],
    'talk.farm': ['animal'], 'talk.letters': ['letter'], 'talk.lower': ['letter'], 'talk.initial': ['word'],
    'talk.add': ['a', 'b'], 'talk.sub': ['a', 'b'], 'talk.oddeven': ['parity'],
    'talk.wrong': ['answer'], 'talk.wrong.a': ['answer'], 'talk.wrong.animal': ['answer'], 'talk.wrong.size': ['answer'],
    'talk.wrong.letter': ['letter'], 'talk.wrong.small': ['letter'], 'talk.wrong.number': ['answer'],
    'talk.wrong.stars': ['num', 'starWord'], 'talk.wrong.star1': ['num', 'starWord'], 'talk.wrong.home': ['who', 'home'],
    'talk.wrong.place': ['home']
  };
  Object.keys(PROMPTS).forEach(function (k) {
    ['', '.first', '.many', '.many.first'].forEach(function (s) { if (STR.en[k + s] != null) NEEDS[k + s] = PROMPTS[k]; });
  });
  var FALLBACK = { 'p.shapes5': 'p.shapes', 'p.shapes5.many': 'p.shapes.many', 'talk.colorsWhich': 'talk.colorsAny',
    'talk.shape': 'talk.shapesAny', 'talk.shapes': 'talk.shapesAny', 'talk.shapes5': 'talk.shapesAny', 'talk.size': 'talk.sizeAny',
    'talk.sizeWhich': 'talk.sizeAny', 'talk.home': 'talk.homeAny', 'talk.animals': 'talk.homeAny', 'talk.farm': 'talk.homeAny',
    'talk.letters': 'talk.lettersAny', 'talk.lower': 'talk.lowerAny', 'talk.initial': 'talk.initialAny',
    'talk.add': 'talk.calc', 'talk.sub': 'talk.calc', 'talk.oddeven': 'talk.oddevenAny', 'talk.wrong.home': 'talk.wrong.place',
    'right.moreN': 'right.more1', 'right.moreN.who': 'right.more1.who', 'right.more1.color': 'right.more1',
    'right.moreN.color': 'right.moreN' };
  Object.keys(NEEDS).forEach(function (k) {
    if (FALLBACK[k]) return;
    if (/^p\./.test(k)) FALLBACK[k] = 'p.any';
    else if (/^right\./.test(k)) FALLBACK[k] = 'right.any';
    else if (/^talk\.wrong/.test(k)) FALLBACK[k] = 'talk.wrong.any';
    else if (/^goal\./.test(k)) FALLBACK[k] = 'goal.any';
    else if (/^wrong\./.test(k)) FALLBACK[k] = 'wrong.any';
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
  function obj(o) { return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}; }
  function rawVal(v) {
    if (v && typeof v === 'object') { if ('value' in v) return v.value; if ('nameValue' in v) return v.nameValue; }
    return v;
  }
  function present(v) {
    if (v == null || v === '') return false;
    if (typeof v === 'object') { var r = rawVal(v); return r != null && r !== '' && r !== v; }
    if (typeof v === 'number') return isFinite(v);
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
    if (isNaN(v)) return String(n == null ? '' : n);
    if (v >= 0 && v <= MAX_COUNT) return NUM[L(lang)][v];
    return String(v);
  }
  function noun(lang, which, n) { return NOUN[L(lang)][which][n === 1 ? 0 : 1]; }
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
  function colorOf(v) { var s = low(v); if (s === 'colour') return null; return NAMES.en.color[s] != null ? s : null; }
  function shapeOf(v) { var s = low(v); if (s === 'rectangle') s = 'rect'; return NAMES.en.shape[s] != null ? s : null; }
  function toyOf(v) {
    var s = low(v).replace(/^toys?\//, '');
    if (s === 'rubber duck' || s === 'rubberduck' || s === 'toy duck') s = 'duck';
    if (s === 'toy car') s = 'car';
    return NAMES.en.toy[s] != null ? s : null;
  }
  function homeOf(v) { return inTable(NAMES.en.home, v); }
  function seasonOf(v) {
    if (num(v) != null) { var i = ((num(v) % 4) + 4) % 4; return SEASONS[i]; }
    var s = low(v); if (s === 'fall') s = 'autumn';
    return NAMES.en.season[s] != null ? s : null;
  }
  function animalOf(v) {
    if (v && typeof v === 'object') v = v.animal != null ? v.animal : rawVal(v);
    var s = low(v).replace(/\.svg$/, '').replace(/^animals?\//, '').replace(/_step$/, '');
    if (s === 'goldfish' || s === 'fish') s = 'fishbowl';
    if (s === 'chicken') s = 'hen';
    return NAMES.en.animal[s] != null ? s : null;
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
  function anFix(s) {   // English "a oval" → "an oval", never the LETTER A. No regex look-behind (iOS < 16.4).
    return String(s).replace(/(^|[\s"“(])([Aa]) (?=[aeiou]|8\b|11\b|18\b)/g, function (m, pre, a, off, str) {
      var before = str.slice(0, off + pre.length);
      if (a === 'A' && !/(^|[.!?]\s*|["“(])$/.test(before)) return m;
      if (a === 'a' && /(letter|big|small)\s*$/i.test(before)) return m;
      return pre + a + 'n ';
    });
  }

  // ---------------------------------------------------------------- thing kinds
  function thingKind(t) {
    var k = low(t.kind);
    if (k === 'obj') k = 'toy';
    if (k === 'block') k = 'shape';
    if (k === 'crate') k = 'stars';
    if (THING_KINDS.indexOf(k) >= 0 || ['color', 'number', 'home', 'size', 'letter'].indexOf(k) >= 0) return k;
    if (t.animal != null) return 'animal';
    if (t.obj != null) return 'toy';
    if (t.shape != null) return 'shape';
    if (t.text != null) return 'tile';
    if (t.n != null) return 'stars';
    return null;
  }
  function tileText(t) { return t.text != null ? String(t.text) : (t.n != null ? String(t.n) : (t.nameValue != null ? String(t.nameValue) : '')); }
  function tileNumber(t) {
    if (thingKind(t) === 'stars') return num(t.n);
    var tx = tileText(t);
    if (splitOp(tx)) return exprValue(tx);
    return num(tx) != null ? num(tx) : num(t.n);
  }

  // ---------------------------------------------------------------- phrases: a thing named for a sentence
  // thing = { kind toy|shape|stars|tile|animal (or a Talk icon color|number|home|size), color?, obj?, shape?, n?, animal?,
  //           home?, text?, big?, nameKind?, nameValue? }
  // opts = { art: 'the' (default) | 'a' | null, color: bool (default true), size: bool (default: only when little), who }
  function phrase(lang, t, opts) {
    lang = L(lang);
    t = obj(t);
    if (t.thing && typeof t.thing === 'object') t = t.thing;
    opts = opts || {};
    var vi = lang === 'vi', T = NAMES[lang];
    var art = opts.art === undefined ? 'the' : opts.art;
    var k = thingKind(t);
    if (!k && t.nameKind != null) { t = thingFromName(t.nameKind, t.nameValue); k = t ? thingKind(t) : null; }
    if (!k) return '';
    var col = colorOf(t.color), sz = thingSize(t);
    var showSize = sz && (opts.size === true || (opts.size !== false && sz === 'small'));
    var useCol = col && opts.color !== false;
    function en(s) { return anFix((art ? art + ' ' : '') + s); }
    switch (k) {
      case 'toy': case 'shape': {
        var o = k === 'toy' ? toyOf(t.obj) : shapeOf(t.shape);
        var nn = o ? T[k][o] : (vi ? 'cái' : 'one');
        if (vi) return nn + (showSize ? ' ' + T.size[sz] : '') + (useCol ? ' ' + T.color[col] : '');
        return en((showSize ? T.size[sz] + ' ' : '') + (useCol ? T.color[col] + ' ' : '') + nn);
      }
      case 'animal': {
        var a = animalOf(t.animal);
        var an = a ? T[opts.who ? 'who' : 'animal'][a] : (vi ? 'bạn' : 'friend');
        if (vi) return an + (showSize ? ' ' + T.size[sz] : '');
        return en((showSize ? T.size[sz] + ' ' : '') + an);
      }
      case 'stars': {
        var n = num(t.n);
        if (n == null) return vi ? 'ngôi sao' : en('star');
        return n + ' ' + noun(lang, 'star', n);
      }
      case 'tile': case 'letter': {
        var tx = t.text != null ? String(t.text) : (t.n != null ? String(t.n) : '');
        if (!tx) return '';
        if (isLetter(tx)) {
          var small = tx !== tx.toUpperCase();
          return vi ? 'chữ ' + tx + (small ? ' thường' : '') : (small ? 'small ' : 'letter ') + tx;
        }
        if (splitOp(tx)) return exprText(tx);
        if (num(tx) != null) return vi ? 'số ' + num(tx) : 'number ' + num(tx);
        return tx;
      }
      case 'color': return col ? T.color[col] : '';
      case 'number': { var nb = num(t.n != null ? t.n : t.value); return nb == null ? '' : numberName(lang, nb); }
      case 'home': { var h = homeOf(t.home != null ? t.home : t.value); return h ? (vi ? T.home[h] : en(T.home[h])) : ''; }
      case 'size': return sz ? (vi ? 'cái ' + T.size[sz] : en(T.size[sz] + ' one')) : '';
    }
    return '';
  }
  // a thing rebuilt from {nameKind, nameValue} (when main did not pass e.thing)
  function thingFromName(nk, nv) {
    nk = String(nk == null ? '' : nk);
    nv = rawVal(nv);
    switch (nk) {
      case 'color': return { kind: 'toy', color: nv };
      case 'shape': return { kind: 'shape', shape: nv };
      case 'size': return { kind: 'toy', big: sizeOf(nv) !== 'small' };
      case 'n': case 'number': case 'count': case 'stars': return num(nv) != null ? { kind: 'stars', n: num(nv) } : null;
      case 'toy': case 'obj': return { kind: 'toy', obj: nv };
      case 'animal': case 'home': case 'farm': case 'word': case 'initial':
        if (animalOf(nv)) return { kind: 'animal', animal: animalOf(nv) };
        if (toyOf(nv)) return { kind: 'toy', obj: toyOf(nv) };
        return isLetter(String(nv)) ? { kind: 'tile', text: String(nv) } : null;
      case 'letter': case 'lower': case 'text': case 'tile': case 'sum': case 'diff': return { kind: 'tile', text: String(nv) };
      case 'parity': return num(nv) != null ? { kind: 'tile', text: String(num(nv)), n: num(nv) } : null;
    }
    return null;
  }

  // ---------------------------------------------------------------- names
  function name(lang, kind, value) {
    lang = L(lang);
    if (kind === 'thing') return phrase(lang, value, { art: null });
    if (value && typeof value === 'object' && (value.kind != null || value.thing) && kind !== 'answer') {
      if (['toy', 'obj', 'stars', 'tile', 'animal'].indexOf(kind) >= 0 || (kind === 'shape' && value.shape != null && value.kind)) return phrase(lang, value, { art: null });
    }
    value = rawVal(value);
    var vi = lang === 'vi', T = NAMES[lang], k;
    var S = function (v) { return String(v == null ? '' : v); };
    switch (kind) {
      case 'number': case 'n': case 'count': return num(value) != null ? numberName(lang, num(value)) : S(value);
      case 'stars': { var ns = num(value); return ns == null ? noun(lang, 'star', 2) : ns + ' ' + noun(lang, 'star', ns); }
      case 'color': case 'hue': k = colorOf(value); return k ? T[kind][k] : S(value);
      case 'shape': case 'shapeH': case 'shapes': k = shapeOf(value); return k ? T[kind][k] : S(value);
      case 'toy': case 'obj': case 'toyWord': case 'objWord': k = toyOf(value); return k ? T[kind === 'toyWord' || kind === 'objWord' ? 'toyWord' : 'toy'][k] : S(value);
      case 'animal': case 'word': case 'who': case 'animals': k = animalOf(value); return k ? T[kind][k] : S(value);
      case 'home': case 'farm': case 'homeAt': k = homeOf(value); return k ? T[kind === 'farm' ? 'home' : kind][k] : S(value);
      case 'lives': k = homeOf(value) || (animalOf(value) ? ANIMAL_HOME[animalOf(value)] : null);
        return k ? (vi ? 'sống ' : 'lives ') + T.homeAt[k] : S(value);
      case 'size': k = sizeOf(value); return k ? T.size[k] : S(value);
      case 'season': k = seasonOf(value); return k ? T.season[k] : S(value);
      case 'parity': k = parityOf(value); return num(value) != null ? numberName(lang, num(value)) : (k ? T.parity[k] : S(value));
      case 'letter': case 'lower': case 'initial': return S(value);
      case 'sum': case 'diff': return exprWords(lang, value);
      case 'text': case 'tile': {
        var tx = S(value);
        if (splitOp(tx)) return exprWords(lang, tx);
        if (num(tx) != null) return numberName(lang, num(tx));
        return tx;
      }
    }
    if (T[kind] && value != null && T[kind][value] != null) return T[kind][value];
    return S(value).replace(/_/g, ' ');
  }

  // the bare noun for the initial-letter topic: no classifier ("con bò" → "bò", "quả bóng" → "bóng"); things or (kind, value)
  function bareWord(lang, kind, value) {
    lang = L(lang);
    var t = (kind && typeof kind === 'object') ? kind : null;
    if (t && t.thing && typeof t.thing === 'object') t = t.thing;
    if (t) {
      if (animalOf(t.animal)) return NAMES[lang].word[animalOf(t.animal)];
      if (toyOf(t.obj)) return NAMES[lang].toyWord[toyOf(t.obj)];
      if (shapeOf(t.shape)) return NAMES[lang].shape[shapeOf(t.shape)].replace(/^hình /, '');
      if (t.nameKind != null && t.nameKind !== 'initial' && t.nameKind !== 'letter') return bareWord(lang, t.nameKind, t.nameValue);
      return t.word != null ? String(t.word) : '';
    }
    value = rawVal(value);
    if ((kind === 'toy' || kind === 'obj') && toyOf(value)) return NAMES[lang].toyWord[toyOf(value)];
    if (kind === 'shape' && shapeOf(value)) return NAMES[lang].shape[shapeOf(value)].replace(/^hình /, '');
    if (kind === 'color' && colorOf(value)) return NAMES[lang].hue[colorOf(value)];
    if (animalOf(value)) return NAMES[lang].word[animalOf(value)];
    if (toyOf(value)) return NAMES[lang].toyWord[toyOf(value)];
    return String(value == null ? '' : value);
  }
  // first letter of the bare noun, diacritics stripped to the base letter (ô → O, đ → D)
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
    if (v >= 1 && v <= MAX_COUNT) addForms(out, [NUM[lang][v] + ' ' + noun(lang, 'star', v), v + ' ' + noun(lang, 'star', v)]);
    var alt = NUM_ALT[lang][v];
    if (alt) addForms(out, alt);
    return out;
  }
  function wordKind(k) {
    k = String(k == null ? '' : k);
    var A = { n: 'number', count: 'number', stars: 'number', crate: 'number', farm: 'home', block: 'shape', hue: 'color',
      colour: 'color', obj: 'toy', lower: 'letter', initial: 'letter', word: 'animal', tile: 'text', blob: 'color',
      paint: 'color', add: 'sum', sub: 'diff' };
    return A[k] || k;
  }
  // a Talk-time choice / picture thing → [kind, value]
  function kvOf(c) {
    var t = obj(c);
    if (t.thing && typeof t.thing === 'object') t = t.thing;
    if (t.nameKind != null) return [wordKind(t.nameKind), rawVal(t.nameValue)];
    switch (low(t.kind)) {
      case 'color': case 'blob': case 'paint': return ['color', t.color != null ? t.color : t.value];
      case 'number': return ['number', t.n != null ? t.n : t.value];
      case 'home': return ['home', t.home != null ? t.home : t.value];
      case 'size': return ['size', thingSize(t) || t.value];
      case 'toy': case 'obj':
        if (t.obj != null) return ['toy', t.obj];
        if (t.color != null) return ['color', t.color];
        return ['size', thingSize(t)];
      case 'shape': case 'block': return ['shape', t.shape != null ? t.shape : t.value];
      case 'stars': case 'crate': return ['number', t.n != null ? t.n : t.value];
      case 'tile': case 'text': return ['text', t.text != null ? t.text : (t.n != null ? t.n : t.value)];
      case 'animal': return ['animal', t.animal != null ? t.animal : t.value];
      case 'letter': return ['letter', t.text != null ? t.text : t.value];
      case 'parity': return ['parity', t.value];
      case 'season': return ['season', t.value];
    }
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
      case 'color': k = colorOf(value); return k ? addForms(out, [T.color[k], T.hue[k]].concat(W.color[k])) : addForms(out, [String(value)]);
      case 'shape': k = shapeOf(value); return k ? addForms(out, [T.shape[k]].concat(W.shape[k])) : addForms(out, [String(value)]);
      case 'size': k = sizeOf(value); return k ? addForms(out, [T.size[k]].concat(W.size[k])) : addForms(out, [String(value)]);
      case 'toy': k = toyOf(value); return k ? addForms(out, [T.toy[k], T.toyWord[k]].concat(W.toy[k])) : addForms(out, [String(value)]);
      case 'animal': case 'who': k = animalOf(value); return k ? addForms(out, [T.animal[k], T.word[k], T.who[k]].concat(W.animal[k])) : addForms(out, [String(value)]);
      case 'home': case 'homeAt': k = homeOf(value); return k ? addForms(out, [T.home[k], T.homeAt[k]].concat(W.home[k])) : addForms(out, [String(value)]);
      case 'season': k = seasonOf(value); return k ? addForms(out, [T.season[k]].concat(W.season[k])) : addForms(out, [String(value)]);
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
    return addForms(out, [nm || String(value)]);
  }

  // ---------------------------------------------------------------- t()
  var I18N = { langs: LANGS.slice(), child: '' };

  function isTalkHome(key) { return /^talk\.(animals|farm|home)$/.test(key); }
  // raw params → named strings (pre-named strings pass through untouched)
  function derive(lang, params, key) {
    var p = {}, k;
    if (params && typeof params === 'object') for (k in params) if (Object.prototype.hasOwnProperty.call(params, k)) p[k] = params[k];
    key = key || '';
    if (present(p.color)) p.color = name(lang, 'color', p.color);
    if (present(p.shape)) {
      var sh = shapeOf(p.shape);
      if (sh && !present(p.shapes)) p.shapes = NAMES[lang].shapes[sh];
      p.shape = name(lang, 'shape', p.shape);
    }
    if (present(p.size) || p.big === true || p.big === false) p.size = name(lang, 'size', present(p.size) ? p.size : p.big);
    if (present(p.parity)) p.parity = name(lang, 'parity', parityOf(rawVal(p.parity)) || p.parity);
    if (present(p.home)) p.home = name(lang, 'homeAt', p.home);
    if (present(p.season)) p.season = name(lang, 'season', p.season);
    if (present(p.who) && animalOf(p.who)) p.who = phrase(lang, { kind: 'animal', animal: animalOf(p.who) }, { who: true });
    if (present(p.animal)) {
      var an = animalOf(p.animal);
      if (an && !present(p.word)) p.word = NAMES[lang].word[an];
      if (an && !present(p.animals)) p.animals = NAMES[lang].animals[an];
      p.animal = an ? NAMES[lang][isTalkHome(key) ? 'who' : 'animal'][an] : String(rawVal(p.animal));
    }
    // talk.initial {letter, nameKind, nameValue}: the word comes from the shown thing (never say the letter = the answer)
    if (!present(p.word) && p.nameValue != null && (animalOf(p.nameValue) || toyOf(p.nameValue))) p.word = bareWord(lang, p.nameKind || null, p.nameValue);
    if (present(p.word) && animalOf(p.word)) p.word = NAMES[lang].word[animalOf(p.word)];
    else if (present(p.word) && toyOf(p.word)) p.word = NAMES[lang].toyWord[toyOf(p.word)];
    if (present(p.letter)) {
      p.letter = String(rawVal(p.letter));
      if (/^(p|talk|goal)\.lower/.test(key)) { if (!present(p.lower)) p.lower = p.letter.toLowerCase(); p.letter = p.letter.toUpperCase(); }
      else if (!present(p.lower)) p.lower = p.letter.toLowerCase();
    }
    if (present(p.lower)) p.lower = String(rawVal(p.lower));
    var c = present(p.n) ? num(p.n) : null;
    if (!present(p.num) && c != null) p.num = numberName(lang, c);
    if (present(p.n) && typeof p.n === 'object') p.n = c != null ? c : '';
    if (!present(p.starWord)) p.starWord = noun(lang, 'star', c == null ? 2 : c);
    if (!present(p.bubbleWord)) p.bubbleWord = noun(lang, 'bubble', c == null ? 2 : c);
    if (present(p.a)) p.a = String(rawVal(p.a));
    if (present(p.b)) p.b = String(rawVal(p.b));
    if (present(p.expr)) p.expr = exprText(rawVal(p.expr));
    if (p.thing && typeof p.thing === 'object') p.thing = phrase(lang, p.thing, { art: 'a' });
    if (p.answer && typeof p.answer === 'object') p.answer = present(p.answer) ? name(lang, p.answer.kind || p.answer.nameKind, rawVal(p.answer)) : '';
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

  // The question. params.k > 1 → the plural `.many` form (when the key has one; p.countPop / p.countSel / p.lower decide
  // plural words from n themselves); opts.first → the chapter's round-0 form.
  I18N.ask = function (lang, key, params, opts) {
    opts = opts || {};
    lang = L(lang);
    key = String(key == null ? '' : key);
    var pr = obj(params), many = num(pr.k) != null && num(pr.k) > 1;
    var cands = [];
    if (many && opts.first) cands.push(key + '.many.first');
    if (many) cands.push(key + '.many');
    if (opts.first) cands.push(key + '.first');
    cands.push(key);
    for (var i = 0; i < cands.length; i++) {
      var ck = cands[i];
      if (STR[lang][ck] == null) continue;
      if (i < cands.length - 1 && !needsMet(ck, derive(lang, params, ck))) continue;
      return I18N.t(lang, ck, params, opts.rng);
    }
    return I18N.t(lang, key, params, opts.rng);
  };

  // ---------------------------------------------------------------- game lines
  var KIND_ALIAS = { colour: 'color', number: 'n', countsel: 'n', countpop: 'count', farm: 'home', add: 'sum', sub: 'diff',
    oddeven: 'parity', letters: 'letter', animals: 'animal', shapes: 'shape', colors: 'color', stars: 'n' };
  function ruleKind(k) { k = low(k); k = KIND_ALIAS[k] || k; return RULE_KINDS.indexOf(k) >= 0 ? k : null; }
  function kindFromPrompt(topic, pk, mode) {
    pk = String(pk || '');
    var m = /^p\.(\w+?)(5)?(\.many)?(\.first)?$/.exec(pk);
    var tp = m ? m[1] : topic;
    switch (tp) {
      case 'colors': return 'color';
      case 'shapes': return 'shape';
      case 'size': return 'size';
      case 'countPop': return 'count';
      case 'countSel': return 'n';
      case 'count': return mode === 'countPop' ? 'count' : 'n';
      case 'animals': return 'animal';
      case 'animal': return 'animal';
      case 'home': case 'farm': return 'home';
      case 'letters': return 'letter';
      case 'lower': return 'lower';
      case 'initial': return 'initial';
      case 'add': return 'sum';
      case 'sub': return 'diff';
      case 'oddeven': return 'parity';
    }
    if (tp !== topic && topic) return kindFromPrompt(topic, '', mode);
    return null;
  }
  // what the targets share: e.rule | e.want.rule | e.want ({kind, value} or {nameKind, nameValue}) | promptKey + params
  function ruleOf(ev) {
    var r = obj(ev.rule);
    if (r.kind == null && r.nameKind == null) r = obj(obj(ev.want).rule);
    if (r.kind == null && r.nameKind == null) r = obj(ev.want);
    var kind = ruleKind(r.kind != null ? r.kind : r.nameKind) || kindFromPrompt(ev.topic, ev.promptKey, ev.mode);
    if (ev.mode === 'countPop') kind = 'count';
    if (kind === 'letter' && (ev.topic === 'lower' || /^p\.lower/.test(String(ev.promptKey || '')))) kind = 'lower';
    var value = r.value != null ? r.value : r.nameValue;
    var p = obj(ev.params);
    if (value == null) {
      switch (kind) {
        case 'color': value = p.color; break;
        case 'shape': value = p.shape; break;
        case 'animal': value = p.animal; break;
        case 'home': value = p.home; break;
        case 'n': case 'count': case 'sum': case 'diff': value = p.n; break;
        case 'letter': case 'lower': case 'initial': value = p.letter; break;
        case 'parity': value = p.parity; break;
        case 'size': value = p.big != null ? p.big : (p.size != null ? p.size : null); break;
      }
    }
    return { kind: kind, value: rawVal(value) };
  }
  function evThing(ev) {
    if (ev.thing && typeof ev.thing === 'object') return ev.thing;
    var g = obj(ev.got);
    if (g.kind != null && thingKind(g)) return g;
    if (g.nameKind != null) return thingFromName(g.nameKind, g.nameValue) || {};
    if (ev.nameKind != null) return thingFromName(ev.nameKind, ev.nameValue) || {};
    return {};
  }
  function homeOfThing(ev, t) {
    return homeOf(ev.home) || homeOf(t.home) || (animalOf(t.animal) ? ANIMAL_HOME[animalOf(t.animal)] : null);
  }
  function letterParams(r, t) {
    var L0 = r.value != null && r.value !== '' ? String(r.value) : tileText(t);
    return { letter: L0.toUpperCase(), lower: L0.toLowerCase() };
  }
  function join(a, b) { a = a || ''; b = b || ''; return a && b ? a + ' ' + b : (a || b); }
  function countList(lang, n) {
    lang = L(lang);
    var c = num(n);
    if (c == null || c < 1) return '';
    var list = [];
    for (var i = 1; i <= c; i++) list.push(numberName(lang, i));
    return capFirst(list.join(', ')) + '!';
  }
  function moreLine(lang, ev, r, t, rng) {
    var left = num(ev.left);
    if (left == null || left <= 0) return '';
    var who = thingKind(t) === 'animal';
    var key = left === 1 ? 'right.more1' : 'right.moreN';
    if (r.kind === 'color' && colorOf(r.value)) key += '.color';
    else if (who) key += '.who';
    return I18N.t(lang, key, { num: numberName(lang, left), color: r.value }, rng);
  }

  // `right {id, thing, x, y, i, k, left, home?, count?}` (+ topic, promptKey, params, rule, mode) → names the popped thing.
  I18N.sayRight = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var t = obj(evThing(ev)), r = ruleOf(ev), line = '';
    var left = num(ev.left);
    if (r.kind === 'count') {   // countPop: every pop is counted: "Two!" … the last one "Three! Three bubbles!"
      var c = num(ev.count);
      if (c == null) c = num(obj(ev.count).n);
      if (c == null && num(ev.i) != null) c = num(ev.i) + 1;
      if (c == null) return I18N.t(lang, 'praise', null, rng);
      line = I18N.sayCount(lang, c);
      if (left === 0 || (left == null && num(r.value) === c)) line += ' ' + I18N.sayCountRun(lang, c, 'bubbles');
      return line;
    }
    var k = thingKind(t);
    if (k === 'stars') {        // countSel: the stars are counted aloud on the freed thing: "One, two, three, four! Four stars!"
      var n = num(t.n);
      if (n == null) n = num(r.value);
      if (n == null) return I18N.t(lang, 'right.any', null, rng);
      return join(join(countList(lang, n), I18N.sayCountRun(lang, n, 'stars')), moreLine(lang, ev, r, t, rng));
    }
    switch (r.kind) {
      case 'home': {
        var h = homeOfThing(ev, t);
        line = I18N.t(lang, 'right.home', { who: phrase(lang, t, { who: true, size: false }), home: h ? NAMES[lang].homeAt[h] : '' }, rng);
        break;
      }
      case 'initial': {
        var w = bareWord(lang, t);
        line = I18N.t(lang, 'right.initial', { thing: phrase(lang, t, { art: 'a', size: false }), word: w, first: w ? initial(lang, t) : '' }, rng);
        break;
      }
      case 'sum': case 'diff': {
        var tx = tileText(t), v = tileNumber(t);
        line = I18N.t(lang, 'right.' + r.kind, { expr: splitOp(tx) ? exprText(tx) : '', ans: v != null ? String(v) : '' }, rng);
        break;
      }
      case 'parity': {
        var pv = tileNumber(t), pp = pv != null ? parityOf(pv) : parityOf(r.value);
        line = I18N.t(lang, 'right.parity', { num: pv != null ? String(pv) : '', parity: pp ? NAMES[lang].parity[pp] : '' }, rng);
        break;
      }
      default: {
        var th = phrase(lang, t, { art: 'a', size: r.kind === 'size' ? true : undefined });
        line = th ? I18N.t(lang, 'right.thing', { thing: th }, rng) : I18N.t(lang, 'right.any', null, rng);
      }
    }
    return join(line, moreLine(lang, ev, r, t, rng));
  };

  function goalParams(lang, r) {
    var T = NAMES[lang];
    switch (r.kind) {
      case 'color': return { color: r.value };
      case 'shape': return { shape: r.value };
      case 'size': return { size: sizeOf(r.value) ? T.size[sizeOf(r.value)] : '' };
      case 'n': { var n = num(r.value); return { what: n == null ? '' : n + ' ' + noun(lang, 'star', n) }; }
      case 'animal': return { animal: r.value };
      case 'home': return { home: r.value };
      case 'letter': case 'initial': return { letter: r.value != null ? String(r.value).toUpperCase() : '' };
      case 'lower': return { letter: r.value != null ? String(r.value).toUpperCase() : '', lower: r.value != null ? String(r.value).toLowerCase() : '' };
      case 'sum': case 'diff': return { n: num(r.value) != null ? num(r.value) : '' };
      case 'parity': return { parity: r.value };
    }
    return {};
  }
  // the tapped thing named ("That’s a blue duck." / "Đây là con vịt cao su màu xanh dương.") + what it is about
  function wrongIs(lang, ev, r, t, rng) {
    switch (r.kind) {
      case 'sum': case 'diff': {
        var tx = tileText(t), v = tileNumber(t);
        if (!splitOp(tx) || v == null) break;
        return I18N.t(lang, 'wrong.expr', { expr: exprText(tx), ans: String(v) }, rng);
      }
      case 'parity': {
        var pv = tileNumber(t);
        if (pv == null) break;
        return I18N.t(lang, 'wrong.parity', { num: String(pv), parity: NAMES[lang].parity[parityOf(pv)] }, rng);
      }
    }
    var th = phrase(lang, t, { art: 'a', size: r.kind === 'size' ? true : undefined });
    if (!th) return '';
    var line = I18N.t(lang, thingKind(t) === 'stars' ? 'wrong.stars' : 'wrong.is', { thing: th }, rng);
    if (r.kind === 'home') {
      var h = homeOfThing({}, t);
      if (h) line = join(line, I18N.t(lang, 'wrong.livesAt', { home: NAMES[lang].homeAt[h] }, rng));
    } else if (r.kind === 'initial') {
      var w = bareWord(lang, t);
      if (w) line = join(line, I18N.t(lang, 'wrong.starts', { word: w, first: initial(lang, t) }, rng));
    }
    return line;
  }
  // `wrong {id, got:{nameKind,nameValue}, want, streak, x, y}` (+ thing, topic, promptKey, params, rule) → names it, then
  // the goal, kindly ("That’s a blue duck. Find a red one!" / "Đây là con vịt cao su màu xanh dương. Mình tìm cái màu đỏ nhé!")
  I18N.sayWrong = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var t = obj(evThing(ev)), r = ruleOf(ev);
    var goal = r.kind && STR[lang]['goal.' + r.kind] ? I18N.t(lang, 'goal.' + r.kind, goalParams(lang, r), rng) : I18N.t(lang, 'goal.any', null, rng);
    var line = join(wrongIs(lang, ev, r, t, rng), goal);
    return line || I18N.t(lang, 'wrong.any', null, rng);
  };
  // the miss that brings the hint: name it + look at the glowing one
  I18N.sayWrongHint = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var t = obj(evThing(ev)), r = ruleOf(ev);
    var is = '';
    try { is = wrongIs(lang, ev, r, t, rng); } catch (e) { is = ''; }
    return join(is, I18N.t(lang, 'wrong.hint', null, rng));
  };

  // Counting aloud: i → "One!" … "Twenty!" (beyond: the digits)
  I18N.sayCount = function (lang, i) {
    lang = L(lang);
    var c = num(i);
    if (c == null) return I18N.t(lang, 'praise');
    if (STR[lang]['count.' + c]) return STR[lang]['count.' + c];
    return capFirst(String(c)) + '!';
  };
  // The total after a count: "Three bubbles!" / "Four stars!" / "Ba bong bóng!" / "Bốn ngôi sao!"; kind 'bubbles' (default) | 'stars'
  I18N.sayCountRun = function (lang, n, kind) {
    lang = L(lang);
    var c = num(n);
    if (c == null) return I18N.t(lang, 'praise');
    var which = /^star/.test(String(kind || '')) ? 'star' : 'bubble';
    return capFirst(numberName(lang, c) + ' ' + noun(lang, which, c)) + '!';
  };
  I18N.countList = countList;

  // a thing's plain name: sayName(lang, thing | e) → "the red ball" / "quả bóng màu đỏ"
  I18N.sayName = function (lang, thing) { return phrase(L(lang), thing) || ''; };

  // missed Talk-time answer → "It is red! Good try!", "The penguin lives on the ice! Good try!", "There are 4 stars! …"
  // talkWrong(lang, choice, talk?) or talkWrong(lang, kind, value, talk?)
  I18N.talkWrong = function (lang, kind, value, ctx) {
    lang = L(lang);
    if (kind && typeof kind === 'object') { ctx = value; var kv = kvOf(kind); kind = kv[0]; value = kv[1]; }
    kind = wordKind(kind);
    value = rawVal(value);
    ctx = obj(ctx);
    if (value == null || value === '') return I18N.t(lang, 'talk.wrong.any');
    var vi = lang === 'vi';
    switch (kind) {
      case 'color': return colorOf(value) ? I18N.t(lang, 'talk.wrong', { answer: name(lang, 'color', value) }) : I18N.t(lang, 'talk.wrong.any');
      case 'shape': return shapeOf(value) ? I18N.t(lang, 'talk.wrong.a', { answer: name(lang, 'shape', value) }) : I18N.t(lang, 'talk.wrong.any');
      case 'size': return sizeOf(value) ? I18N.t(lang, 'talk.wrong.size', { answer: name(lang, 'size', value) }) : I18N.t(lang, 'talk.wrong.any');
      case 'animal': return animalOf(value) ? I18N.t(lang, 'talk.wrong.animal', { answer: NAMES[lang].animal[animalOf(value)] }) : I18N.t(lang, 'talk.wrong.any');
      case 'toy': return toyOf(value) ? I18N.t(lang, 'talk.wrong.animal', { answer: NAMES[lang].toy[toyOf(value)] }) : I18N.t(lang, 'talk.wrong.any');
      case 'home': {
        var h = homeOf(value);
        if (!h) return I18N.t(lang, 'talk.wrong.any');
        var a = animalOf(obj(ctx.show).animal) || animalOf(obj(ctx.params).animal) || animalOf(ctx.animal);
        if (a) return I18N.t(lang, 'talk.wrong.home', { who: phrase(lang, { kind: 'animal', animal: a }, { who: true }), home: NAMES[lang].homeAt[h] });
        return I18N.t(lang, 'talk.wrong.place', { home: NAMES[lang].homeAt[h] });
      }
      case 'letter': { var lv = String(value); return I18N.t(lang, lv !== lv.toUpperCase() ? 'talk.wrong.small' : 'talk.wrong.letter', { letter: lv }); }
      case 'number': {
        var n = num(value);
        if (n == null) return I18N.t(lang, 'talk.wrong.any');
        if (ctx.topic === 'count' || /count/.test(String(ctx.promptKey || ''))) {
          return I18N.t(lang, n === 1 ? 'talk.wrong.star1' : 'talk.wrong.stars', { num: String(n), starWord: noun(lang, 'star', n) });
        }
        return I18N.t(lang, 'talk.wrong.number', { answer: String(n) });
      }
      case 'text': {
        var tx = String(value);
        if (isLetter(tx)) return I18N.talkWrong(lang, 'letter', tx);
        if (splitOp(tx) || num(tx) != null) return I18N.talkWrong(lang, 'number', splitOp(tx) ? exprValue(tx) : num(tx), ctx);
        return I18N.t(lang, 'talk.wrong', { answer: tx });
      }
      case 'parity':
        if (num(value) != null) return I18N.talkWrong(lang, 'number', num(value));
        return parityOf(value) ? I18N.t(lang, 'talk.wrong', { answer: (vi ? 'số ' : '') + NAMES[lang].parity[parityOf(value)] }) : I18N.t(lang, 'talk.wrong.any');
    }
    return I18N.t(lang, 'talk.wrong.any');
  };

  // Text → TTS-friendly text (Voice.say calls this). Display text stays untouched. "Bao" / "Bảo" are read as written.
  var VI_UP = 'A-ZĂÂĐÊÔƠƯ', VI_LO = 'a-zăâđêôơư';
  var RE_VI_LETTER = new RegExp('(chữ|Chữ) ([' + VI_UP + VI_LO + '])(?![\\p{L}\\p{N}])', 'gu');
  var RE_CAPS = /(^|[^\p{L}])(\p{Lu}{2,})(?![\p{L}])/gu;   // display emphasis "RED" → "red"
  I18N.speech = function (lang, text) {
    lang = L(lang);
    var s = String(text == null ? '' : text);
    s = s.replace(/\s*…\s*$/, '.').replace(/\s*…\s*/g, ', ').replace(/[›»«]/g, ',').replace(/\s+—\s+/g, ', ').replace(/,\s*([!?.])/g, '$1');
    s = s.replace(RE_CAPS, function (m, pre, w) { return pre + w.toLowerCase(); });
    if (lang === 'en') {
      s = s.replace(/\b(letter|Letter|big|Big|small|Small) ([A-Za-z])(?![A-Za-z’'])/g, function (m, w, ch) {
        return w + ' ' + (LETTER_SPEECH_EN[ch.toUpperCase()] || ch);
      });
      s = s.replace(/(^|[\s!?.,])([A-Z]) is for\b/g, function (m, pre, ch) { return pre + LETTER_SPEECH_EN[ch] + ' is for'; });
      s = s.replace(/\b(starts with|start with|with|not|Listen:) ([A-Z])(?![A-Za-z’'])/g, function (m, w, ch) { return w + ' ' + LETTER_SPEECH_EN[ch]; });
      s = s.replace(/(, )([A-Z])([.!?])/g, function (m, pre, ch, end) { return pre + LETTER_SPEECH_EN[ch] + end; });   // "Listen: duck, D."
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 plus $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 minus $2')
        .replace(/\s=\s/g, ' equals ');
    } else {
      s = s.replace(RE_VI_LETTER, function (m, w, ch) { return w + ' ' + (LETTER_VI[ch.toUpperCase()] || ch.toLowerCase()); });
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 cộng $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 trừ $2')
        .replace(/\s=\s/g, ' bằng ');
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
  I18N.ruleOf = ruleOf;
  I18N.numberName = numberName;
  I18N.stripMarks = stripMarks;
  I18N.homeOf = function (animal) { var a = animalOf(animal); return a ? ANIMAL_HOME[a] : null; };
  I18N.has = function (lang, key) { return STR[L(lang)][key] != null; };
  I18N.keys = function (lang) { return Object.keys(STR[L(lang)]); };
  I18N.raw = function (lang, key) { return STR[L(lang)][key]; };
  I18N.setChild = function (nm) { I18N.child = nm ? String(nm).trim().slice(0, 24) : ''; };
  I18N.TOPICS = TOPICS.slice();
  I18N.COLORS = COLORS.slice();
  I18N.SHAPES = SHAPES.slice();
  I18N.TOYS = TOYS.slice();
  I18N.OBJECTS = TOYS.slice();          // parade compat
  I18N.ANIMALS = ANIMALS.slice();
  I18N.HOMES = HOMES.slice();
  I18N.SEASONS = SEASONS.slice();
  I18N.ANIMAL_HOME = ANIMAL_HOME;
  I18N.RULE_KINDS = RULE_KINDS.slice();
  I18N.THING_KINDS = THING_KINDS.slice();
  I18N.MEMBER_KINDS = THING_KINDS.slice();   // parade compat
  I18N.PROMPTS = PROMPTS;
  I18N.PARAMS = NEEDS;
  I18N.NAME_TABLE = NAMES;
  I18N.LETTER_VI = LETTER_VI;
  I18N.MAX_COUNT = MAX_COUNT;

  PB.I18N = I18N;
})(window.PB = window.PB || {});
