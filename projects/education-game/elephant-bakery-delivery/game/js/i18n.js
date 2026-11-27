/* Tupi's Bakery Delivery — BD.I18N (English + Vietnamese). Tupi (written and spoken "Tupi" in both languages; VI titles
 * "Voi Tupi") is a cheerful baby elephant baker. She drives a little bakery cart along an icing road from her bakery to the
 * gingerbread houses of a cookie town; every order goes to EXACTLY ONE house (DESIGN §5.1). The child drags the cart to the
 * right house (a tap on a house / the road also drives there). "Tupi" is two ordinary syllables for every voice: no TTS rewrite.
 *
 *   BD.I18N.t(lang, key, params?, rng?)               → string (a random wording; rng.next() / rng() / Math.random)
 *   BD.I18N.ask(lang, promptKey, params, {first, rng, cargo}) → the order ("Take the red cupcake to the red house!");
 *       first:true → the chapter's round-0 form ("Ding! A red cupcake is ready! Drive it to the RED house!")
 *   BD.I18N.name(lang, kind, value)                   → kinds: color (vi "màu đỏ"), hue (bare "đỏ"), shape, shapes, treat
 *       (obj / toy aliases: "cupcake" / "bánh cupcake"), treatWord / objWord (the bare noun: "cupcake"), thing (a thing object),
 *       cookies (n → "3 cookies" / "3 cái bánh quy"), dots (n), animal, animals, word (bare animal noun), who, home, homeAt,
 *       lives, number / n (0–20), letter, lower, initial (a thing / animal / treat → its FIRST LETTER), sum, diff, parity,
 *       size, season (0..3 | spring…), text / tile, house (a house sign thing → "the red house" / "nhà màu đỏ")
 *   BD.I18N.words(lang, kind, value)                  → accepted spoken forms (lower-case, + no-diacritic forms, digits)
 *   BD.I18N.choiceWords(lang, choice)                 → spoken forms of a Talk choice {id, thing}
 *   BD.I18N.initial(lang, kind, value | thing)        → first letter of the BARE noun (no classifier, diacritics → base)
 *   BD.I18N.bareWord(lang, kind, value | thing)       → that bare noun ("cow" / "bò", "cupcake" / "cupcake")
 *   BD.I18N.phrase(lang, thing, opts?) / sayName(lang, thing) → a thing named for a sentence
 *   BD.I18N.house(lang, sign, ruleKind?)              → a house named by its sign ("house number 3", "the cow’s house")
 *   BD.I18N.sayRight(lang, e, rng?)  sayWrong(lang, e, rng?)  sayWrongHint(lang, e, rng?)
 *   BD.I18N.sayCount(lang, i)  sayCountRun(lang, n, kind 'cookies'|'dots')  countList(lang, n)
 *   BD.I18N.talkWrong(lang, choice | kind, value, talk?)  speech(lang, text)  setChild(name) …
 *
 * Event `e` for sayRight = the world `right` event {houseId, cargo, left, home?, count?} + from main {topic, promptKey, params,
 * sign (world.houseById(e.houseId).sign), cargo (world.orderObj.cargo when the event has none)}.
 * sayWrong: the world `wrong` event {houseId, got:{nameKind, nameValue}, want, streak} + sign + cargo + topic/promptKey/params.
 * Without `sign` the house is rebuilt from `got`; without `cargo` the cargo is rebuilt from the order's params.
 * Rule kinds: color, shape, size, n (count), animal, home, letter, lower, initial, sum, diff, parity.
 * {child}: with an empty name, wordings containing {child} are skipped ("bé {child}" → "bé", ", {child}!" → "!").
 * Never negative: no "wrong", "no", "sai", "không đúng" … (tested).
 */
(function (BD) {
  'use strict';

  var LANGS = ['en', 'vi'];
  var COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'oval', 'rect', 'diamond'];
  var TREATS = ['cupcake', 'macaron', 'donut', 'cakepop', 'jelly'];
  var TREATS_ALL = TREATS.concat(['cake', 'cookie']);          // + the size topic's cake and the plain cookie
  var ANIMALS = ['cow', 'pig', 'sheep', 'duck', 'hen', 'horse', 'goat', 'crab', 'penguin', 'lion', 'monkey', 'fishbowl'];
  var HOMES = ['farm', 'sea', 'ice', 'savanna', 'jungle'];
  var ANIMAL_HOME = { cow: 'farm', pig: 'farm', sheep: 'farm', duck: 'farm', hen: 'farm', horse: 'farm', goat: 'farm',
    crab: 'sea', fishbowl: 'sea', penguin: 'ice', lion: 'savanna', monkey: 'jungle' };
  var SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  var TOPICS = ['colors', 'shapes', 'size', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
  var RULE_KINDS = ['color', 'shape', 'size', 'n', 'animal', 'home', 'letter', 'lower', 'initial', 'sum', 'diff', 'parity'];
  var THING_KINDS = ['treat', 'shape', 'cookies', 'dots', 'tile', 'animal', 'home', 'blob'];
  var MAX_COUNT = 20;
  // VI classifiers dropped for the 'initial' topic (DESIGN §5.1); EN articles
  var CLASSIFIERS = { en: ['the', 'a', 'an'], vi: ['con', 'cái', 'quả', 'chiếc', 'cây', 'bông', 'bánh'] };

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
  NAMES.en.treat = { cupcake: 'cupcake', macaron: 'macaron', donut: 'donut', cakepop: 'cake pop', jelly: 'jelly', cake: 'cake',
    cookie: 'cookie', treat: 'treat' };
  NAMES.vi.treat = { cupcake: 'bánh cupcake', macaron: 'bánh macaron', donut: 'bánh donut', cakepop: 'kẹo bánh',
    jelly: 'thạch rau câu', cake: 'bánh kem', cookie: 'bánh quy', treat: 'bánh' };
  NAMES.en.treats = { cupcake: 'cupcakes', macaron: 'macarons', donut: 'donuts', cakepop: 'cake pops', jelly: 'jellies',
    cake: 'cakes', cookie: 'cookies', treat: 'treats' };
  NAMES.vi.treats = NAMES.vi.treat;
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
  // the subject of a home line ("Chim cánh cụt sống ở xứ băng!"): the fish lives in the sea, not its bowl
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
  var NOUN = { en: { dot: ['dot', 'dots'], cookie: ['cookie', 'cookies'] },
    vi: { dot: ['chấm', 'chấm'], cookie: ['cái bánh quy', 'cái bánh quy'] } };

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
  // Vietnamese letters, phonics names as taught in kindergarten / grade 1 ("âm": a, bờ, cờ …), used for speech.
  var LETTER_VI = { 'A': 'a', 'Ă': 'á', 'Â': 'ớ', 'B': 'bờ', 'C': 'cờ', 'D': 'dờ', 'Đ': 'đờ', 'E': 'e', 'Ê': 'ê',
    'G': 'gờ', 'H': 'hờ', 'I': 'i', 'K': 'ca', 'L': 'lờ', 'M': 'mờ', 'N': 'nờ', 'O': 'o', 'Ô': 'ô', 'Ơ': 'ơ', 'P': 'pờ',
    'Q': 'quờ', 'R': 'rờ', 'S': 'sờ', 'T': 'tờ', 'U': 'u', 'Ư': 'ư', 'V': 'vờ', 'X': 'xờ', 'Y': 'i dài',
    'F': 'ép', 'J': 'gi', 'W': 'vê kép', 'Z': 'dét' };
  // the alphabet names ("bê", "xê" …) are accepted from the mic too
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
      treat: { cupcake: ['cupcake', 'cup cake', 'cupcakes', 'muffin'], macaron: ['macaron', 'macaroon', 'macarons'],
        donut: ['donut', 'doughnut', 'donuts', 'doughnuts'], cakepop: ['cake pop', 'cakepop', 'cake pops', 'lollipop'],
        jelly: ['jelly', 'jello', 'jelly cup', 'jellies'], cake: ['cake', 'birthday cake', 'cakes'],
        cookie: ['cookie', 'cookies', 'biscuit'] },
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
      treat: { cupcake: ['bánh cupcake', 'cupcake', 'bánh cốc', 'cắp kếch'], macaron: ['bánh macaron', 'macaron', 'ma ca rông'],
        donut: ['bánh donut', 'donut', 'bánh vòng', 'đô nắt', 'bánh rán'], cakepop: ['kẹo bánh', 'cake pop', 'bánh que'],
        jelly: ['thạch rau câu', 'thạch', 'rau câu'], cake: ['bánh kem', 'bánh sinh nhật', 'bánh gato', 'bánh ga tô'],
        cookie: ['bánh quy', 'quy'] },
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
    'p.colors': ['color', 'cargo'], 'p.shapes': ['shape'], 'p.shapes5': ['shape'], 'p.size': ['size', 'cargoWord'], 'p.count': ['n'],
    'p.animal': ['animal'], 'p.home': ['animal'], 'p.letters': ['letter'], 'p.lower': ['letter', 'lower'],
    'p.initial': ['word'], 'p.add': ['expr'], 'p.sub': ['expr'], 'p.oddeven': []
  };

  var STR = {
    en: {
      'ui.title': 'Tupi’s Bakery Delivery',
      'ui.logo1': 'Tupi’s',
      'ui.logo2': 'Bakery Delivery',
      'ui.subtitle': 'Drive the treats to the right houses!',
      'ui.tagline': 'Drive the treats to the right houses!',
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
      'ui.voice': 'Tupi’s voice',
      'ui.mic': 'Answer by talking',
      'ui.done': 'Done',
      'ui.stars': 'Stars',
      'ui.chapter': 'Chapter {n}',
      'ui.allDone': 'All done! {stars} stars',
      'ui.welcome': ['Hi {child}! I am Tupi. Let’s deliver some treats!', 'Hi! I am Tupi. Let’s deliver some treats!'],
      'ui.micUnsupported': 'Voice answers are off on this device. Tap the pictures!',
      'ui.micDenied': 'The microphone is off. Tap the pictures instead!',
      'ui.voiceMissing': 'Tip for parents: add a voice in Settings › Accessibility › Spoken Content › Voices.',
      'ui.tapOrSay': 'Tap or say the answer!',
      'ui.listening': 'Tupi is listening…',
      'ui.tapTupi': 'Tap Tupi to hear it again',
      'ui.tapHint': 'Hold the cart and drive along the road',
      'ui.doorHint': 'Drive to the right house',
      'ui.skip': 'Skip',
      'ui.gallery': 'Our deliveries',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Colour Treats',
      'topic.shapes': 'Shape Cookies',
      'topic.size': 'Big and Little',
      'topic.count': 'Counting Cookies',
      'topic.animals': 'Animal Friends',
      'topic.letters': 'Letter Cookies',
      'topic.lower': 'Big and Small Letters',
      'topic.initial': 'First Letters',
      'topic.add': 'Adding Up',
      'topic.sub': 'Take Away',
      'topic.oddeven': 'Odd and Even',

      'weather.0': ['Spring in the bakery!', 'Spring in the bakery! Look, blossoms in the window!'],
      'weather.1': ['Sunny summer!', 'Sunny summer! Warm sunbeams in the bakery!'],
      'weather.2': ['Windy autumn!', 'Windy autumn! Leaves blow in through the window!'],
      'weather.3': ['Snowy winter!', 'Snowy winter! Snow is falling outside!'],

      'odd': 'odd',
      'even': 'even',

      'roadDone': ['Look, a new road!', 'Here is the cookie town!', 'The road is ready!'],
      'wipe': ['Swish! A new town!', 'Here comes a new road!', 'Look, new houses!'],
      'load': ['Ding! Ready!', 'Ding! Fresh from the oven!', 'Ding! Into the cart!'],
      'back': ['Back to the bakery!', 'Toot toot, back we go!', 'Back for the next treat!'],
      'reverse': ['Beep beep! Back to the fork!', 'Beep beep! Let’s try another road!', 'Beep beep! Backing up!'],
      'fork': ['Which way?', 'Left or right?', 'Which road now?'],
      'drag': ['Hold Tupi’s cart and drive along the road!', 'Put your finger on the cart and drive!',
        'Hold the cart and follow the road to the house!'],
      'honk': ['Toot toot!', 'Toot toot! Here we go!', 'Toot! Toot!'],
      'thanks': ['Thank you!', 'Thank you, Tupi!', 'Yummy, thank you!'],

      'p.any': ['Drive the cart to a house!', 'Which house will you drive to?', 'Toot toot! Find the right house!'],
      'p.colors': ['Take the {cargo} to the {color} house!', 'Where does the {cargo} go? Drive to the {color} house!',
        'Vroom! The {cargo} goes to the {color} house!'],
      'p.colors.first': ['Ding! A {cargo} is ready! Drive it to the {COLOR} house!'],
      'p.shapes': ['Take the {shape} cookie to the {shape} house!', 'Who ordered the {shape} cookie? Drive to the {shape} house!',
        'Find the house with the {shape}! Drive the cookie there!'],
      'p.shapes.first': ['Ding! A {shape} cookie is ready! Drive it to the {shape} house!'],
      'p.shapes5': ['Any colour is fine! Take the {shape} cookie to the {shape} house!',
        'Look at the shapes! Drive the {shape} cookie to the {shape} house!',
        'So many colours! Find the {shape} house and drive there!'],
      'p.shapes5.first': ['Ding! A {shape} cookie! Lots of colours… look at the shapes! Drive to the {shape} house!'],
      'p.size': ['Take the {size} {cargoWord} to the {size} house!', 'Vroom! The {size} {cargoWord} goes to the {size} house!',
        'Where does the {size} {cargoWord} go? To the {size} house!'],
      'p.size.first': ['Ding! A {SIZE} {cargoWord} is ready! Take it to the {size} house!'],
      'p.count': ['Take {n} {cookieWord} to house number {n}!', 'We counted {n} {cookieWord}! Drive to house number {n}!',
        'Who wants {n} {cookieWord}? House number {n}!'],
      'p.count.first': ['Ding! The cookies are ready! Take {n} {cookieWord} to house number {n}!'],
      'p.animal': ['Take the {animal} to her friend!', 'The {animal} wants to visit a friend! Find the {word} house!',
        'Where is the {word}’s friend? Drive there!'],
      'p.animal.first': ['Ding! A friend jumps in! Take the {animal} to the {word} house!'],
      'p.home': ['Take the {animal} home!', 'Where does the {animal} live? Drive there!',
        'The {animal} wants to go home! Which house?'],
      'p.home.first': ['Ding! A friend jumps in! Take the {animal} home!'],
      'p.letters': ['Take letter {letter} to the house with letter {letter}!',
        'Letter {letter} is ready! Drive to the letter {letter} house!', 'Who has letter {letter}? Drive the cookie there!'],
      'p.letters.first': ['Ding! A letter cookie! Take letter {letter} to the house with letter {letter}!'],
      'p.lower': ['Take big {letter} to small {lower}!', 'Big {letter} goes to the house with small {lower}!',
        'Where is small {lower}? Drive big {letter} there!'],
      'p.lower.first': ['Ding! Big letters and small letters! Take big {letter} to the house with small {lower}!'],
      'p.initial': ['Listen: {word}! Drive to its first letter!', 'What does {word} start with? Find that letter house!',
        'Take the {word} to the house with its first letter!'],
      'p.initial.first': ['Ding! Listen to the name: {word}! Drive to the house with its first letter!'],
      'p.add': ['Take {expr} to the house with the answer!', 'How much is {expr}? Drive to that number!',
        'Let’s add! {expr} makes… which house?'],
      'p.add.first': ['Ding! An adding cookie: {expr}! Drive it to the house with the answer!'],
      'p.sub': ['Take {expr} to the house with the answer!', 'How much is {expr}? Drive to that number!',
        'Let’s take away! {expr} makes… which house?'],
      'p.sub.first': ['Ding! A take-away cookie: {expr}! Drive it to the house with the answer!'],
      'p.oddeven': ['Count the cookies! Odd or even? Drive to the right house!',
        'Odd or even? Take the cookies to the right house!', 'Let’s count the cookies! Is it odd or even?'],
      'p.oddeven.first': ['Ding! The cookies are ready! Count them: odd or even? Drive to the right house!'],

      'right.deliver': ['{cargo} for {house}!', 'Here you go! {cargo} for {house}!', 'Yum! {cargo} for {house}!'],
      'right.count': ['{num} {cookieWord} for house number {n}!', 'Here you go! {num} {cookieWord} for house number {n}!',
        'Yum! {num} {cookieWord} for house number {n}!'],
      'right.friend': ['The {animal} found her friend!', 'Hello, friend! The {animal} is here!', 'Hooray! The {word} friends are together!'],
      'right.home': ['{who} lives {home}!', 'Home sweet home! {who} lives {home}!', 'Yes! {who} lives {home}!'],
      'right.initial': ['{thing}! {word} starts with {first}!', 'Yes! {word} starts with {first}!', '{thing}! {first} is for {word}!'],
      'right.sum': ['{expr} makes {ans}!', 'Yes! {expr} is {ans}!', '{expr} makes {ans}! Super adding!'],
      'right.diff': ['{expr} makes {ans}!', 'Yes! {expr} is {ans}!', '{expr} makes {ans}! Super thinking!'],
      'right.parity': ['{num} is {parity}!', 'Yes! {num} is {parity}!', '{num} is an {parity} number!'],
      'right.one': ['One more!', 'One more treat!', 'Just one more!'],
      'right.more': ['More to deliver!', 'Next order!', 'Back for more!'],
      'right.all': ['All delivered!', 'Every treat is delivered!', 'All done! Toot toot!'],
      'right.any': ['Delivered! Yes!', 'You got it!', 'Yes! Here you go!'],

      'wrong.is': ['This is {house}.', 'Look, this is {house}.', 'Knock knock! This is {house}.'],
      'wrong.hint': ['Look at the glowing road!', 'Follow the little hand!', 'The shiny road goes there! Drive along it!'],
      'wrong.any': ['Let’s look again!', 'Let’s try another house!', 'Hmm, let’s think again!', 'Keep going, you can do it!'],
      'goal.color': ['The {cargoWord} is {color}!', 'Our {cargoWord} is {color}! Find the {color} house!', 'Let’s find the {color} house!'],
      'goal.shape': ['We have a {shape} cookie!', 'Our cookie is a {shape}! Find the {shape} house!', 'Let’s find the {shape} house!'],
      'goal.size': ['This {cargoWord} is {size}!', 'Our {cargoWord} is {size}! Find the {size} house!', 'Let’s find the {size} house!'],
      'goal.n': ['We have {n} {cookieWord}!', 'Let’s count: {n} {cookieWord}! Find house number {n}!', 'Let’s find house number {n}!'],
      'goal.animal': ['Let’s find the {word} house!', 'The {animal} wants her friend! Where is the {word} house?',
        'Where is the {word}’s friend?'],
      'goal.home': ['{who} lives {home}!', '{who} lives {home}! Let’s find that house!', 'Where does {who} live? {home}!'],
      'goal.letter': ['We have letter {letter}!', 'Our cookie is letter {letter}! Find letter {letter}!', 'Let’s find letter {letter}!'],
      'goal.lower': ['Big {letter} goes with small {lower}!', 'Let’s find small {lower}!', 'Where is small {lower}?'],
      'goal.initial': ['Listen: {word}! What does it start with?', 'Let’s say it slowly: {word}!', 'Listen again: {word}!'],
      'goal.sum': ['How much is {expr}?', 'Let’s count again: {expr}!', 'How much is {expr}? Let’s count on our fingers!'],
      'goal.diff': ['How much is {expr}?', 'Let’s count again: {expr}!', 'How much is {expr}? Let’s count on our fingers!'],
      'goal.parity': ['We have {n} {cookieWord}!', 'Let’s count the cookies again!', 'We have {n} {cookieWord}! Odd or even?'],
      'goal.any': ['Let’s look again!', 'Let’s try another house!', 'You can do it!'],

      'poke': ['Hee hee! That tickles!', 'Hee hee! My trunk is wiggly!', 'Giggle, giggle!', 'Tupi is happy!'],
      'surprise.mouse': ['Look! A little mouse in the flour!', 'Who is peeking out of the flour sack?', 'A little mouse says hello!'],
      'mouse.tap': ['Squeak squeak!', 'Hello, little mouse!', 'Squeak! A flour puff!'],
      'surprise.bird': ['Look! A bird on the window!', 'Tweet! Who is that?', 'A little bird came to say hi!'],
      'bird.tap': ['Tweet tweet!', 'The bird sings a song!', 'Tweet tweet! What a pretty song!'],
      'surprise.snow': ['Look! Big snowflakes!', 'Snowflakes are falling!', 'Brr! Snowflakes!'],
      'snow.tap': ['Twinkle!', 'Sparkle, sparkle!', 'So pretty!'],

      'praise': ['Yes!', 'Great job!', 'You got it!', 'Super!', 'Wonderful!', 'Hooray!', 'Well done!', 'Lovely driving!'],
      'great': ['Great job, {child}!', 'You did it, {child}!', 'Wow, {child}, super driving!', 'What a delivery!',
        'You are so clever!', 'Hooray! Wonderful!'],
      'party': ['Hooray, all delivered!', 'All the treats are delivered! Toot toot!', 'Hooray! Sprinkles for everyone!'],
      'hint': ['Psst! Look at the glowing road!', 'Follow the little hand!', 'Tupi will help! Drive this way!',
        'Look, this house is glowing!', 'The shiny road! Drive along it!'],
      'idle': ['Tupi is waiting! Your turn!', 'The treats are waiting for you!', 'I am here, {child}! Let’s drive!',
        'Toot toot! Let’s play!', 'Your turn to drive!'],

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
      'talk.count': 'How many cookies?',
      'talk.countAny': 'How many are there?',
      'talk.home': 'Where does the {animal} live?',
      'talk.animals': 'Where does the {animal} live?',
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
      'talk.wrong.cookies': 'There are {num} {cookieWord}! Good try!',
      'talk.wrong.cookie1': 'There is {num} {cookieWord}! Good try!',
      'talk.wrong.home': '{who} lives {home}! Good try!',
      'talk.wrong.place': 'It lives {home}! Good try!',
      'talk.wrong.any': 'Good try! Let’s play more!',

      'session.done': ['What a busy bakery day! {stars} stars! Hooray!', 'Amazing, {child}! {stars} stars!',
        'So many treats delivered! {stars} stars!']
    },
    vi: {
      'ui.title': 'Voi Tupi Giao Bánh Ngọt',
      'ui.logo1': 'Voi Tupi',
      'ui.logo2': 'Giao Bánh Ngọt',
      'ui.subtitle': 'Bé giúp Tupi giao bánh đến đúng nhà nhé!',
      'ui.tagline': 'Bé giúp Tupi giao bánh đến đúng nhà nhé!',
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
      'ui.voice': 'Giọng của Tupi',
      'ui.mic': 'Nói để trả lời',
      'ui.done': 'Xong',
      'ui.stars': 'Ngôi sao',
      'ui.chapter': 'Chương {n}',
      'ui.allDone': 'Hoàn thành! {stars} ngôi sao',
      'ui.welcome': ['Chào bé {child}! Mình là voi Tupi. Mình cùng đi giao bánh nhé!',
        'Chào bé! Mình là voi Tupi. Mình cùng đi giao bánh nhé!'],
      'ui.micUnsupported': 'Máy này chưa nghe được giọng nói. Bé chạm vào hình nhé!',
      'ui.micDenied': 'Micrô đang tắt. Bé chạm vào hình nhé!',
      'ui.voiceMissing': 'Mẹo cho bố mẹ: thêm giọng tiếng Việt trong Cài đặt › Trợ năng › Nội dung được đọc › Giọng nói.',
      'ui.tapOrSay': 'Bé chạm hoặc nói đáp án nhé!',
      'ui.listening': 'Tupi đang nghe…',
      'ui.tapTupi': 'Chạm vào Tupi để nghe lại nhé',
      'ui.tapHint': 'Bé giữ xe rồi chạy theo con đường nhé',
      'ui.doorHint': 'Bé chạy đến đúng nhà nhé',
      'ui.skip': 'Bỏ qua',
      'ui.gallery': 'Bánh bé đã giao',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Bánh sắc màu',
      'topic.shapes': 'Bánh quy hình khối',
      'topic.size': 'To và nhỏ',
      'topic.count': 'Đếm bánh quy',
      'topic.animals': 'Các bạn thú',
      'topic.letters': 'Bánh quy chữ cái',
      'topic.lower': 'Chữ hoa, chữ thường',
      'topic.initial': 'Chữ cái đầu tiên',
      'topic.add': 'Phép cộng',
      'topic.sub': 'Phép trừ',
      'topic.oddeven': 'Số chẵn, số lẻ',

      'weather.0': ['Mùa xuân ở tiệm bánh!', 'Mùa xuân ở tiệm bánh! Hoa nở ngoài cửa sổ kìa!'],
      'weather.1': ['Mùa hè nắng đẹp!', 'Mùa hè nắng đẹp! Nắng chiếu vào tiệm bánh nè!'],
      'weather.2': ['Mùa thu lộng gió!', 'Mùa thu lộng gió! Lá bay vào cửa sổ kìa!'],
      'weather.3': ['Mùa đông có tuyết!', 'Mùa đông có tuyết! Ngoài trời tuyết rơi kìa!'],

      'odd': 'lẻ',
      'even': 'chẵn',

      'roadDone': ['Nhìn kìa, đường mới nè!', 'Thị trấn bánh quy đây rồi!', 'Con đường xong rồi nè!'],
      'wipe': ['Vèo! Thị trấn mới nè!', 'Con đường mới đến rồi!', 'Nhìn kìa, nhà mới!'],
      'load': ['Ting! Xong rồi!', 'Ting! Bánh mới ra lò!', 'Ting! Lên xe nào!'],
      'back': ['Về tiệm bánh nào!', 'Bim bim, mình về nhé!', 'Về lấy bánh tiếp nào!'],
      'reverse': ['Bíp bíp! Lùi về ngã ba nào!', 'Bíp bíp! Mình thử đường khác nhé!', 'Bíp bíp! Lùi xe nào!'],
      'fork': ['Đi đường nào nhỉ?', 'Bên này hay bên kia?', 'Đường nào đây bé?'],
      'drag': ['Bé giữ xe của Tupi rồi chạy theo con đường nhé!', 'Bé đặt ngón tay lên xe rồi chạy nhé!',
        'Bé giữ xe và đi theo con đường đến ngôi nhà nhé!'],
      'honk': ['Bim bim!', 'Bim bim! Đi nào!', 'Bim! Bim!'],
      'thanks': ['Cảm ơn Tupi!', 'Cảm ơn bé nhé!', 'Ngon quá, cảm ơn nha!'],

      'p.any': ['Bé chạy xe đến một ngôi nhà nhé!', 'Bé chạy đến nhà nào nhỉ?', 'Bim bim! Bé tìm đúng nhà nhé!'],
      'p.colors': ['Bé chở {cargo} đến ngôi nhà {color} nhé!', '{cargo} đi đâu nhỉ? Bé chạy đến ngôi nhà {color} nhé!',
        'Bim bim! Bé giao {cargo} đến nhà {color} nào!'],
      'p.colors.first': ['Ting! {cargo} xong rồi! Bé chở đến ngôi nhà {COLOR} nhé!'],
      'p.shapes': ['Bé chở bánh quy {shape} đến nhà {shape} nhé!', 'Nhà nào có {shape} nhỉ? Bé chở bánh quy {shape} đến đó nhé!',
        'Bé tìm ngôi nhà có {shape} rồi chạy đến đó nào!'],
      'p.shapes.first': ['Ting! Bánh quy {shape} xong rồi! Bé chở đến nhà {shape} nhé!'],
      'p.shapes5': ['Màu nào cũng được! Bé chở bánh quy {shape} đến nhà {shape} nhé!',
        'Bé nhìn hình nhé! Chở bánh quy {shape} đến nhà {shape} nào!',
        'Nhiều màu quá! Bé tìm nhà {shape} rồi chạy đến đó nhé!'],
      'p.shapes5.first': ['Ting! Bánh quy {shape} xong rồi! Nhiều màu quá… bé nhìn hình nhé! Chạy đến nhà {shape} nào!'],
      'p.size': ['Bé chở {cargoWord} {size} đến ngôi nhà {size} nhé!', 'Bim bim! {cargoWord} {size} đi đến nhà {size} nào!',
        '{cargoWord} {size} đi đâu nhỉ? Bé chở đến nhà {size} nhé!'],
      'p.size.first': ['Ting! {cargoWord} {SIZE} xong rồi! Bé chở đến ngôi nhà {size} nhé!'],
      'p.count': ['Bé chở {n} {cookieWord} đến nhà số {n} nhé!', 'Mình đếm được {n} {cookieWord}! Bé chạy đến nhà số {n} nào!',
        'Ai đặt {n} {cookieWord} nhỉ? Nhà số {n} đó bé!'],
      'p.count.first': ['Ting! Bánh quy ra lò rồi! Bé chở {n} {cookieWord} đến nhà số {n} nhé!'],
      'p.animal': ['Bé chở {animal} đến nhà bạn {word} nhé!', '{animal} muốn đi thăm bạn! Nhà bạn {word} ở đâu nhỉ?',
        'Bạn {word} đang chờ đó! Bé chở {animal} đến nhé!'],
      'p.animal.first': ['Ting! Có bạn lên xe rồi! Bé chở {animal} đến nhà bạn {word} nhé!'],
      'p.home': ['Đưa {animal} về nhà nào!', '{animal} sống ở đâu nhỉ? Bé chở bạn ấy về nhé!',
        '{animal} muốn về nhà! Bé chạy đến nhà nào nhỉ?'],
      'p.home.first': ['Ting! Có bạn lên xe rồi! Bé đưa {animal} về nhà nhé!'],
      'p.letters': ['Bé chở chữ {letter} đến nhà có chữ {letter} nhé!', 'Chữ {letter} xong rồi! Bé tìm nhà chữ {letter} nào!',
        'Nhà nào có chữ {letter} nhỉ? Bé chở bánh đến đó nhé!'],
      'p.letters.first': ['Ting! Bánh quy chữ cái xong rồi! Bé chở chữ {letter} đến nhà có chữ {letter} nhé!'],
      'p.lower': ['Bé chở chữ {letter} hoa đến nhà chữ {lower} thường nhé!', 'Chữ {letter} hoa đi tìm chữ {lower} thường! Bé chạy đến đó nào!',
        'Chữ {lower} thường ở đâu nhỉ? Bé chở chữ {letter} hoa đến nhé!'],
      'p.lower.first': ['Ting! Có chữ hoa, có chữ thường! Bé chở chữ {letter} hoa đến nhà chữ {lower} thường nhé!'],
      'p.initial': ['Bé nghe nè: {word}! Bé chạy đến chữ cái đầu tiên nhé!', '{word} bắt đầu bằng chữ gì nhỉ? Bé tìm nhà chữ đó nào!',
        'Bé chở {word} đến nhà có chữ cái đầu của tên nhé!'],
      'p.initial.first': ['Ting! Bé nghe tên nhé: {word}! Bé chạy đến nhà có chữ cái đầu tiên nhé!'],
      'p.add': ['Bé chở {expr} đến nhà có kết quả nhé!', '{expr} bằng mấy nhỉ? Bé chạy đến số đó nào!',
        'Mình cộng nào! {expr} bằng… nhà nào nhỉ?'],
      'p.add.first': ['Ting! Bánh quy phép cộng: {expr}! Bé chở đến nhà có kết quả nhé!'],
      'p.sub': ['Bé chở {expr} đến nhà có kết quả nhé!', '{expr} bằng mấy nhỉ? Bé chạy đến số đó nào!',
        'Mình trừ nào! {expr} bằng… nhà nào nhỉ?'],
      'p.sub.first': ['Ting! Bánh quy phép trừ: {expr}! Bé chở đến nhà có kết quả nhé!'],
      'p.oddeven': ['Bé đếm bánh quy nhé! Số chẵn hay số lẻ? Bé chạy đến đúng nhà nào!',
        'Chẵn hay lẻ nhỉ? Bé chở bánh quy đến đúng nhà nhé!', 'Mình đếm bánh quy nào! Chẵn hay lẻ đây bé?'],
      'p.oddeven.first': ['Ting! Bánh quy ra lò rồi! Bé đếm xem chẵn hay lẻ rồi chạy đến đúng nhà nhé!'],

      'right.deliver': ['{cargo} cho {house}!', 'Của bạn đây! {cargo} cho {house}!', 'Ngon quá! {cargo} cho {house}!'],
      'right.count': ['{num} {cookieWord} cho nhà số {n}!', 'Của bạn đây! {num} {cookieWord} cho nhà số {n}!',
        'Ngon quá! {num} {cookieWord} cho nhà số {n}!'],
      'right.friend': ['{animal} gặp bạn rồi!', 'Chào bạn! {animal} đến chơi nè!', 'Hoan hô! Hai bạn {word} gặp nhau rồi!'],
      'right.home': ['{who} sống {home}!', 'Về nhà rồi! {who} sống {home}!', 'Đúng rồi! {who} sống {home} đó!'],
      'right.initial': ['{thing}! {word} bắt đầu bằng chữ {first}!', 'Đúng rồi! {word} bắt đầu bằng chữ {first}!', '{thing}! Chữ {first}, {word}!'],
      'right.sum': ['{expr} bằng {ans}!', 'Đúng rồi! {expr} bằng {ans}!', '{expr} bằng {ans}! Bé cộng giỏi quá!'],
      'right.diff': ['{expr} bằng {ans}!', 'Đúng rồi! {expr} bằng {ans}!', '{expr} bằng {ans}! Bé trừ giỏi quá!'],
      'right.parity': ['{num} là số {parity}!', 'Đúng rồi! {num} là số {parity}!', '{num} là số {parity} đó!'],
      'right.one': ['Còn một đơn nữa!', 'Còn một cái bánh nữa thôi!', 'Một đơn nữa nào!'],
      'right.more': ['Giao tiếp nào!', 'Còn bánh nữa nè!', 'Về lấy bánh tiếp nào!'],
      'right.all': ['Giao hết bánh rồi!', 'Bánh đã giao xong hết rồi!', 'Xong hết rồi! Bim bim!'],
      'right.any': ['Giao xong rồi!', 'Bé giỏi quá!', 'Đúng rồi! Của bạn đây!'],

      'wrong.is': ['Đây là {house}.', 'Ồ, đây là {house}.', 'Cốc cốc! Đây là {house} nè.'],
      'wrong.hint': ['Bé nhìn con đường đang sáng nè!', 'Bé đi theo bàn tay nhỏ nhé!', 'Con đường lấp lánh dẫn đến đó! Bé chạy theo nhé!'],
      'wrong.any': ['Mình tìm lại nhé!', 'Bé thử nhà khác nhé!', 'Bé nghĩ thêm chút nữa nhé!', 'Cố lên, bé làm được mà!'],
      'goal.color': ['{cargoWord} này {color} cơ!', '{cargoWord} của mình {color} cơ! Bé tìm nhà {color} nhé!', 'Mình tìm nhà {color} nhé!'],
      'goal.shape': ['Bánh quy của mình là {shape} cơ!', 'Bánh quy này là {shape}! Bé tìm nhà {shape} nhé!', 'Mình tìm nhà {shape} nhé!'],
      'goal.size': ['{cargoWord} này {size} cơ!', '{cargoWord} của mình {size}! Bé tìm nhà {size} nhé!', 'Mình tìm nhà {size} nhé!'],
      'goal.n': ['Mình có {n} {cookieWord} cơ!', 'Mình đếm nhé: {n} {cookieWord}! Bé tìm nhà số {n} nhé!', 'Mình tìm nhà số {n} nhé!'],
      'goal.animal': ['Mình tìm nhà bạn {word} nhé!', '{animal} muốn gặp bạn! Nhà bạn {word} đâu nhỉ?',
        'Bạn của {word} ở đâu nhỉ?'],
      'goal.home': ['{who} sống {home} cơ!', '{who} sống {home}! Mình tìm nhà đó nhé!', '{who} sống ở đâu nhỉ? {home} đó!'],
      'goal.letter': ['Mình có chữ {letter} cơ!', 'Bánh quy này là chữ {letter}! Bé tìm chữ {letter} nhé!', 'Mình tìm chữ {letter} nhé!'],
      'goal.lower': ['Chữ {letter} hoa đi với chữ {lower} thường!', 'Mình tìm chữ {lower} thường nhé!', 'Chữ {lower} thường đâu rồi nhỉ?'],
      'goal.initial': ['Bé nghe nè: {word}! Bắt đầu bằng chữ gì nhỉ?', 'Mình đọc chậm nhé: {word}!', 'Bé nghe lại nhé: {word}!'],
      'goal.sum': ['{expr} bằng mấy nhỉ?', 'Mình đếm lại nhé: {expr}!', '{expr} bằng mấy nhỉ? Mình đếm ngón tay nhé!'],
      'goal.diff': ['{expr} bằng mấy nhỉ?', 'Mình đếm lại nhé: {expr}!', '{expr} bằng mấy nhỉ? Mình đếm ngón tay nhé!'],
      'goal.parity': ['Mình có {n} {cookieWord} nè!', 'Mình đếm lại bánh quy nhé!', 'Mình có {n} {cookieWord}! Chẵn hay lẻ nhỉ?'],
      'goal.any': ['Mình tìm lại nhé!', 'Bé thử nhà khác nhé!', 'Bé làm được mà!'],

      'poke': ['Hi hi! Nhột quá!', 'Hi hi! Vòi của Tupi ngọ nguậy nè!', 'Khúc khích, khúc khích!', 'Tupi vui quá!'],
      'surprise.mouse': ['Nhìn kìa! Một bạn chuột trong bao bột!', 'Ai đang ló ra khỏi bao bột thế nhỉ?', 'Bạn chuột nhỏ chào bé nè!'],
      'mouse.tap': ['Chít chít!', 'Chào bạn chuột nhỏ!', 'Chít! Bột bay tung tóe!'],
      'surprise.bird': ['Nhìn kìa! Bạn chim trên cửa sổ!', 'Líu lo! Ai thế nhỉ?', 'Bạn chim nhỏ đến chơi nè!'],
      'bird.tap': ['Líu lo, líu lo!', 'Bạn chim hót một bài nè!', 'Líu lo! Bạn chim hót hay quá!'],
      'surprise.snow': ['Nhìn kìa! Bông tuyết to quá!', 'Bông tuyết rơi rồi!', 'Brr! Bông tuyết nè!'],
      'snow.tap': ['Lấp lánh!', 'Lung linh quá!', 'Đẹp quá đi!'],

      'praise': ['Đúng rồi!', 'Giỏi quá!', 'Tuyệt vời!', 'Hoan hô!', 'Bé giỏi lắm!', 'Chính xác!', 'Hay quá!', 'Bé lái xe giỏi quá!'],
      'great': ['Bé {child} giỏi quá!', 'Hoan hô bé {child}!', 'Oa, bé {child} lái xe siêu giỏi!', 'Giao bánh giỏi quá!',
        'Bé thông minh quá!', 'Hoan hô! Tuyệt vời!'],
      'party': ['Giao hết bánh rồi! Giỏi quá!', 'Hoan hô! Giao hết bánh rồi! Bim bim!', 'Hoan hô! Rắc kẹo cho cả nhà nào!'],
      'hint': ['Bé nhìn nè! Con đường này đang sáng lên.', 'Bé đi theo bàn tay nhỏ nhé!', 'Tupi giúp bé nhé! Chạy đường này nè!',
        'Nhìn kìa, ngôi nhà này lấp lánh!', 'Con đường sáng đó! Bé chạy theo nhé!'],
      'idle': ['Tupi đang chờ bé nè!', 'Bánh đang chờ bé giao nè!', 'Bé {child} ơi, mình chơi tiếp nhé!',
        'Bim bim! Mình chơi nào!', 'Tới lượt bé lái xe rồi nè!'],

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
      'talk.count': 'Có mấy cái bánh quy nào?',
      'talk.countAny': 'Có bao nhiêu cái nào?',
      'talk.home': '{animal} sống ở đâu nhỉ?',
      'talk.animals': '{animal} sống ở đâu nhỉ?',
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
      'talk.wrong.cookies': 'Có {num} {cookieWord} đó! Bé cố gắng lắm!',
      'talk.wrong.cookie1': 'Có {num} {cookieWord} đó! Bé cố gắng lắm!',
      'talk.wrong.home': '{who} sống {home} đó! Bé cố gắng lắm!',
      'talk.wrong.place': 'Bạn ấy sống {home} đó! Bé cố gắng lắm!',
      'talk.wrong.any': 'Bé cố gắng lắm! Mình chơi tiếp nhé!',

      'session.done': ['Một ngày giao bánh thật vui! {stars} ngôi sao!', 'Bé {child} giỏi quá! {stars} ngôi sao!',
        'Tupi giao được thật nhiều bánh! {stars} ngôi sao!']
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
    'right.deliver': ['cargo', 'house'], 'right.count': ['num', 'n', 'cookieWord'], 'right.friend': ['animal', 'word'],
    'right.home': ['who', 'home'], 'right.initial': ['thing', 'word', 'first'], 'right.sum': ['expr', 'ans'],
    'right.diff': ['expr', 'ans'], 'right.parity': ['num', 'parity'],
    'wrong.is': ['house'],
    'goal.color': ['color', 'cargoWord'], 'goal.shape': ['shape'], 'goal.size': ['size', 'cargoWord'], 'goal.n': ['n', 'cookieWord'],
    'goal.animal': ['animal', 'word'], 'goal.home': ['who', 'home'], 'goal.letter': ['letter'], 'goal.lower': ['letter', 'lower'],
    'goal.initial': ['word'], 'goal.sum': ['expr'], 'goal.diff': ['expr'], 'goal.parity': ['n', 'cookieWord'],
    'talk.colorsWhich': ['color'], 'talk.shape': ['shape'], 'talk.shapes': ['shape'], 'talk.shapes5': ['shape'],
    'talk.size': ['size'], 'talk.sizeWhich': ['size'], 'talk.home': ['animal'], 'talk.animals': ['animal'],
    'talk.letters': ['letter'], 'talk.lower': ['letter'], 'talk.initial': ['word'],
    'talk.add': ['a', 'b'], 'talk.sub': ['a', 'b'], 'talk.oddeven': ['parity'],
    'talk.wrong': ['answer'], 'talk.wrong.a': ['answer'], 'talk.wrong.animal': ['answer'], 'talk.wrong.size': ['answer'],
    'talk.wrong.letter': ['letter'], 'talk.wrong.small': ['letter'], 'talk.wrong.number': ['answer'],
    'talk.wrong.cookies': ['num', 'cookieWord'], 'talk.wrong.cookie1': ['num', 'cookieWord'], 'talk.wrong.home': ['who', 'home'],
    'talk.wrong.place': ['home']
  };
  Object.keys(PROMPTS).forEach(function (k) {
    ['', '.first'].forEach(function (s) { if (STR.en[k + s] != null) NEEDS[k + s] = PROMPTS[k]; });
  });
  var FALLBACK = { 'p.shapes5': 'p.shapes', 'talk.colorsWhich': 'talk.colorsAny',
    'talk.shape': 'talk.shapesAny', 'talk.shapes': 'talk.shapesAny', 'talk.shapes5': 'talk.shapesAny', 'talk.size': 'talk.sizeAny',
    'talk.sizeWhich': 'talk.sizeAny', 'talk.home': 'talk.homeAny', 'talk.animals': 'talk.homeAny',
    'talk.letters': 'talk.lettersAny', 'talk.lower': 'talk.lowerAny', 'talk.initial': 'talk.initialAny',
    'talk.add': 'talk.calc', 'talk.sub': 'talk.calc', 'talk.oddeven': 'talk.oddevenAny', 'talk.wrong.home': 'talk.wrong.place',
    'goal.parity': 'goal.any' };
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
  function isThing(o) { return !!o && typeof o === 'object' && !Array.isArray(o) && (o.kind != null || o.nameKind != null); }
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
  function firstNum() { for (var i = 0; i < arguments.length; i++) { var n = num(arguments[i]); if (n != null) return n; } return null; }
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
  function treatOf(v) {
    if (v && typeof v === 'object') v = v.obj != null ? v.obj : (v.treat != null ? v.treat : rawVal(v));
    var s = low(v).replace(/^(treats?|objs?)\//, '').replace(/[\s_-]+/g, '');
    if (s === 'doughnut') s = 'donut';
    if (s === 'macaroon') s = 'macaron';
    if (s === 'cookies' || s === 'biscuit') s = 'cookie';
    return NAMES.en.treat[s] != null ? s : null;
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
    var s = low(v).replace(/^@/, '');
    return (s === 'odd' || s === 'even') ? s : null;
  }
  function thingSize(t) {
    t = obj(t);
    if (t.big === true || t.big === false) return t.big ? 'big' : 'small';
    return sizeOf(t.size);
  }
  function anFix(s) {   // English "a orange" → "an orange", never the LETTER A. No regex look-behind (iOS < 16.4).
    return String(s).replace(/(^|[\s"“(])([Aa]) (?=[aeiou]|8\b|11\b|18\b)/g, function (m, pre, a, off, str) {
      var before = str.slice(0, off + pre.length);
      if (a === 'A' && !/(^|[.!?]\s*|["“(])$/.test(before)) return m;
      if (a === 'a' && /(letter|big|small)\s*$/i.test(before)) return m;
      return pre + a + 'n ';
    });
  }
  function stripClassifier(lang, s) {
    var w = String(s == null ? '' : s).trim().split(/\s+/), cl = CLASSIFIERS[L(lang)];
    while (w.length > 1 && cl.indexOf(w[0].toLowerCase()) >= 0) w.shift();
    return w.join(' ');
  }

  // ---------------------------------------------------------------- thing kinds
  function thingKind(t) {
    var k = low(t.kind);
    if (k === 'obj' || k === 'toy' || k === 'cake' || k === 'cookie') k = 'treat';
    if (k === 'block') k = 'shape';
    if (k === 'stars' || k === 'crate' || k === 'dot') k = 'dots';
    if (k === 'paint') k = 'blob';
    if (THING_KINDS.indexOf(k) >= 0 || ['color', 'number', 'size', 'letter'].indexOf(k) >= 0) return k;
    if (t.animal != null) return 'animal';
    if (t.obj != null || t.treat != null) return 'treat';
    if (t.shape != null) return 'shape';
    if (t.text != null) return 'tile';
    if (t.home != null) return 'home';
    if (t.n != null) return 'dots';
    if (t.color != null) return 'blob';
    return null;
  }
  function tileText(t) { return t.text != null ? String(t.text) : (t.n != null ? String(t.n) : (t.nameValue != null ? String(t.nameValue) : '')); }
  function tileNumber(t) {
    var k = thingKind(t);
    if (k === 'dots' || k === 'cookies') return num(t.n);
    var tx = tileText(t);
    if (splitOp(tx)) return exprValue(tx);
    return num(tx) != null ? num(tx) : num(t.n);
  }
  function parityText(tx) { var m = /^@?(odd|even)$/i.exec(String(tx).trim()); return m ? m[1].toLowerCase() : null; }

  // ---------------------------------------------------------------- phrases: a thing named for a sentence
  // thing = { kind treat|shape|cookies|dots|tile|animal|home|blob (or a Talk icon color|number|size), color?, obj?, shape?,
  //           n?, animal?, home?, text?, big?, nameKind?, nameValue? }
  // opts = { art: 'the' (default) | 'a' | null, color: bool (default true), size: bool (default: only when little), who }
  function phrase(lang, t, opts) {
    lang = L(lang);
    t = obj(t);
    if (t.thing && typeof t.thing === 'object') t = t.thing;
    opts = opts || {};
    var vi = lang === 'vi', T = NAMES[lang];
    var art = opts.art === undefined ? 'the' : opts.art;
    var k = thingKind(t);
    if (!k && t.nameKind != null) { t = thingFromName(t.nameKind, t.nameValue) || {}; k = thingKind(t); }
    if (!k) return '';
    var col = colorOf(t.color), sz = thingSize(t);
    var showSize = sz && (opts.size === true || (opts.size !== false && sz === 'small'));
    var useCol = col && opts.color !== false;
    function en(s) { return anFix((art ? art + ' ' : '') + s); }
    switch (k) {
      case 'treat': {
        var tr = treatOf(t.obj != null ? t.obj : (t.treat != null ? t.treat : (low(t.kind) === 'cake' ? 'cake' : low(t.kind) === 'cookie' ? 'cookie' : 'treat'))) || 'treat';
        var nn = T.treat[tr];
        if (vi) return nn + (showSize ? ' ' + T.size[sz] : '') + (useCol ? ' ' + T.color[col] : '');
        return en((showSize ? T.size[sz] + ' ' : '') + (useCol ? T.color[col] + ' ' : '') + nn);
      }
      case 'shape': {   // a shape cookie: "a red star cookie" / "bánh quy ngôi sao màu đỏ"
        var o = shapeOf(t.shape);
        var sn = o ? T.shape[o] : (vi ? 'hình' : 'shape');
        if (vi) return 'bánh quy ' + sn + (showSize ? ' ' + T.size[sz] : '') + (useCol ? ' ' + T.color[col] : '');
        return en((showSize ? T.size[sz] + ' ' : '') + (useCol ? T.color[col] + ' ' : '') + sn + ' cookie');
      }
      case 'cookies': {
        var c = num(t.n);
        if (c == null) return vi ? 'bánh quy' : 'cookies';
        return c + ' ' + noun(lang, 'cookie', c);
      }
      case 'animal': {
        var a = animalOf(t.animal);
        var an = a ? T[opts.who ? 'who' : 'animal'][a] : (vi ? 'bạn' : 'friend');
        if (vi) return an + (showSize ? ' ' + T.size[sz] : '');
        return en((showSize ? T.size[sz] + ' ' : '') + an);
      }
      case 'dots': {
        var n = num(t.n);
        if (n == null) return vi ? 'chấm' : 'dots';
        return n + ' ' + noun(lang, 'dot', n);
      }
      case 'tile': case 'letter': {
        var tx = t.text != null ? String(t.text) : (t.n != null ? String(t.n) : '');
        if (!tx) return '';
        if (parityText(tx)) return T.parity[parityText(tx)];
        if (isLetter(tx)) {
          var small = tx !== tx.toUpperCase();
          return vi ? 'chữ ' + tx + (small ? ' thường' : '') : (small ? 'small ' : 'letter ') + tx;
        }
        if (splitOp(tx)) return exprText(tx);
        if (num(tx) != null) return vi ? 'số ' + num(tx) : 'number ' + num(tx);
        return tx;
      }
      case 'blob': case 'color': return col ? T.color[col] : '';
      case 'number': { var nb = num(t.n != null ? t.n : t.value); return nb == null ? '' : numberName(lang, nb); }
      case 'home': { var h = homeOf(t.home != null ? t.home : t.value); return h ? (vi ? T.home[h] : en(T.home[h])) : ''; }
      case 'size': return sz ? (vi ? 'cái ' + T.size[sz] : en(T.size[sz] + ' one')) : '';
    }
    return '';
  }
  // a thing rebuilt from {nameKind, nameValue} (a house sign or a cargo when main did not pass the thing)
  function thingFromName(nk, nv) {
    nk = String(nk == null ? '' : nk);
    nv = rawVal(nv);
    switch (nk) {
      case 'color': case 'colour': case 'blob': return colorOf(nv) ? { kind: 'blob', color: colorOf(nv) } : null;
      case 'shape': return shapeOf(nv) ? { kind: 'shape', shape: shapeOf(nv) } : null;
      case 'size': return sizeOf(nv) ? { kind: 'treat', obj: 'cake', big: sizeOf(nv) === 'big' } : null;
      case 'n': case 'number': case 'count': case 'dots': return num(nv) != null ? { kind: 'dots', n: num(nv), numeral: true } : null;
      case 'cookies': return num(nv) != null ? { kind: 'cookies', n: num(nv) } : null;
      case 'treat': case 'obj': return treatOf(nv) ? { kind: 'treat', obj: treatOf(nv) } : null;
      case 'home': case 'farm':
        if (homeOf(nv)) return { kind: 'home', home: homeOf(nv) };
        return animalOf(nv) ? { kind: 'animal', animal: animalOf(nv) } : null;
      case 'animal': case 'word': case 'initial':
        if (animalOf(nv)) return { kind: 'animal', animal: animalOf(nv) };
        if (treatOf(nv)) return { kind: 'treat', obj: treatOf(nv) };
        return isLetter(String(nv)) ? { kind: 'tile', text: String(nv) } : null;
      case 'letter': case 'lower': case 'text': case 'tile': case 'sum': case 'diff':
        return nv == null || nv === '' ? null : { kind: 'tile', text: String(nv) };
      case 'parity':
        if (num(nv) != null) return { kind: 'tile', text: String(num(nv)), n: num(nv) };
        return parityOf(nv) ? { kind: 'tile', text: '@' + parityOf(nv) } : null;
    }
    return null;
  }

  // ---------------------------------------------------------------- houses (named by the sign over the door)
  // ruleKind decides when a sign could be read two ways (a coloured treat sign: colour / size / treat)
  function house(lang, sign, ruleKind) {
    lang = L(lang);
    var t = obj(sign);
    if (t.sign && typeof t.sign === 'object') t = t.sign;
    if (!thingKind(t) && t.nameKind != null) t = thingFromName(t.nameKind, t.nameValue) || {};
    var k = thingKind(t), vi = lang === 'vi', T = NAMES[lang];
    if (!k) return '';
    var col = colorOf(t.color), sz = thingSize(t);
    function the(s) { return vi ? 'nhà ' + s : 'the ' + s + ' house'; }
    if (ruleKind === 'color' && col) return the(T.color[col]);
    if (ruleKind === 'size' && sz) return the(T.size[sz]);
    switch (k) {
      case 'blob': case 'color': return col ? the(T.color[col]) : '';
      case 'shape': { var s = shapeOf(t.shape); return s ? the(T.shape[s]) : (col ? the(T.color[col]) : ''); }
      case 'treat': {
        if (sz && (t.big === true || t.big === false)) return the(T.size[sz]);
        var tr = treatOf(t.obj != null ? t.obj : t.treat);
        if (tr) return the(T.treat[tr]);
        return col ? the(T.color[col]) : '';
      }
      case 'dots': case 'cookies': case 'number': {
        var n = num(t.n != null ? t.n : t.value);
        return n == null ? '' : (vi ? 'nhà số ' + n : 'house number ' + n);
      }
      case 'tile': case 'letter': {
        var tx = tileText(t);
        if (!tx) return '';
        var pt = parityText(tx);
        if (pt) return vi ? 'nhà số ' + T.parity[pt] : 'the ' + T.parity[pt] + ' house';
        if (isLetter(tx)) {
          var small = tx !== tx.toUpperCase();
          return vi ? 'nhà chữ ' + tx + (small ? ' thường' : '') : 'the house with ' + (small ? 'small ' : 'letter ') + tx;
        }
        if (splitOp(tx)) return vi ? 'nhà có ' + exprText(tx) : 'the house with ' + exprText(tx);
        if (num(tx) != null) return vi ? 'nhà số ' + num(tx) : 'house number ' + num(tx);
        return '';
      }
      case 'animal': {
        var a = animalOf(t.animal);
        return a ? (vi ? 'nhà bạn ' + T.word[a] : 'the ' + T.animal[a] + '’s house') : '';
      }
      case 'home': {
        var h = homeOf(t.home != null ? t.home : t.value);
        return h ? (vi ? 'nhà ' + T.homeAt[h] : 'the ' + T.home[h] + ' house') : '';
      }
      case 'size': return sz ? the(T.size[sz]) : '';
    }
    return '';
  }

  // ---------------------------------------------------------------- names
  function name(lang, kind, value) {
    lang = L(lang);
    if (kind === 'thing') return phrase(lang, value, { art: null });
    if (kind === 'house') return house(lang, value);
    if (kind === 'initial') {   // a thing / animal / treat → its first letter; a letter stays itself
      var iv = rawVal(isThing(value) && value.kind != null ? null : value);
      if (isThing(value) || animalOf(iv) || treatOf(iv)) return initial(lang, isThing(value) ? value : null, iv);
      return String(iv == null ? '' : iv);
    }
    if (isThing(value) && value.kind != null && ['obj', 'toy', 'treat', 'dots', 'cookies', 'tile', 'animal'].indexOf(kind) >= 0) {
      return phrase(lang, value, { art: null });
    }
    value = rawVal(value);
    var vi = lang === 'vi', T = NAMES[lang], k;
    var S = function (v) { return String(v == null ? '' : v); };
    switch (kind) {
      case 'number': case 'n': case 'count': return num(value) != null ? numberName(lang, num(value)) : S(value);
      case 'dots': { var ns = num(value); return ns == null ? noun(lang, 'dot', 2) : ns + ' ' + noun(lang, 'dot', ns); }
      case 'cookies': { var nc = num(value); return nc == null ? noun(lang, 'cookie', 2) : nc + ' ' + noun(lang, 'cookie', nc); }
      case 'color': case 'hue': k = colorOf(value); return k ? T[kind][k] : S(value);
      case 'shape': case 'shapes': k = shapeOf(value); return k ? T[kind][k] : S(value);
      case 'treat': case 'obj': case 'toy': case 'treats': k = treatOf(value); return k ? T[kind === 'treats' ? 'treats' : 'treat'][k] : S(value);
      case 'treatWord': case 'objWord': case 'toyWord': k = treatOf(value); return k ? stripClassifier(lang, T.treat[k]) : S(value);
      case 'animal': case 'word': case 'who': case 'animals': k = animalOf(value); return k ? T[kind][k] : S(value);
      case 'home': case 'farm': case 'homeAt': k = homeOf(value); return k ? T[kind === 'farm' ? 'home' : kind][k] : S(value);
      case 'lives': k = homeOf(value) || (animalOf(value) ? ANIMAL_HOME[animalOf(value)] : null);
        return k ? (vi ? 'sống ' : 'lives ') + T.homeAt[k] : S(value);
      case 'size': k = sizeOf(value); return k ? T.size[k] : S(value);
      case 'season': k = seasonOf(value); return k ? T.season[k] : S(value);
      case 'parity': k = parityOf(value); return num(value) != null ? numberName(lang, num(value)) : (k ? T.parity[k] : S(value));
      case 'letter': case 'lower': return S(value);
      case 'sum': case 'diff': return exprWords(lang, value);
      case 'text': case 'tile': {
        var tx = S(value);
        if (parityText(tx)) return T.parity[parityText(tx)];
        if (splitOp(tx)) return exprWords(lang, tx);
        if (num(tx) != null) return numberName(lang, num(tx));
        return tx;
      }
    }
    if (T[kind] && value != null && T[kind][value] != null) return T[kind][value];
    return S(value).replace(/_/g, ' ');
  }

  // the bare noun for the initial topic: no classifier ("con bò" → "bò", "bánh cupcake" → "cupcake"); things or (kind, value)
  function bareWord(lang, kind, value) {
    lang = L(lang);
    var t = (kind && typeof kind === 'object') ? kind : null;
    if (t && t.thing && typeof t.thing === 'object') t = t.thing;
    if (t) {
      if (animalOf(t.animal)) return NAMES[lang].word[animalOf(t.animal)];
      if (thingKind(t) === 'treat') { var tt = treatOf(t.obj != null ? t.obj : t.treat); if (tt) return stripClassifier(lang, NAMES[lang].treat[tt]); }
      if (shapeOf(t.shape)) return NAMES[lang].shape[shapeOf(t.shape)].replace(/^hình /, '');
      if (t.nameKind != null && t.nameKind !== 'initial' && t.nameKind !== 'letter') return bareWord(lang, t.nameKind, t.nameValue);
      return t.word != null ? String(t.word) : '';
    }
    value = rawVal(value);
    if ((kind === 'treat' || kind === 'obj' || kind === 'toy') && treatOf(value)) return stripClassifier(lang, NAMES[lang].treat[treatOf(value)]);
    if (kind === 'shape' && shapeOf(value)) return NAMES[lang].shape[shapeOf(value)].replace(/^hình /, '');
    if (kind === 'color' && colorOf(value)) return NAMES[lang].hue[colorOf(value)];
    if (animalOf(value)) return NAMES[lang].word[animalOf(value)];
    if (treatOf(value)) return stripClassifier(lang, NAMES[lang].treat[treatOf(value)]);
    return stripClassifier(lang, String(value == null ? '' : value));
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
    if (v >= 1 && v <= MAX_COUNT) {
      addForms(out, [NUM[lang][v] + ' ' + noun(lang, 'dot', v), v + ' ' + noun(lang, 'dot', v),
        NUM[lang][v] + ' ' + noun(lang, 'cookie', v), v + ' ' + noun(lang, 'cookie', v)]);
      if (lang === 'vi') addForms(out, [NUM.vi[v] + ' cái', NUM.vi[v] + ' bánh', 'nhà số ' + NUM.vi[v]]);
      else addForms(out, ['number ' + NUM.en[v], 'house ' + NUM.en[v]]);
    }
    var alt = NUM_ALT[lang][v];
    if (alt) addForms(out, alt);
    return out;
  }
  function wordKind(k) {
    k = String(k == null ? '' : k);
    var A = { n: 'number', count: 'number', dots: 'number', cookies: 'number', stars: 'number', farm: 'home', block: 'shape',
      hue: 'color', colour: 'color', toy: 'treat', obj: 'treat', lower: 'letter', initial: 'letter', word: 'animal', tile: 'text',
      blob: 'color', paint: 'color', add: 'sum', sub: 'diff' };
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
      case 'treat': case 'obj': case 'toy':
        if (t.obj != null || t.treat != null) return ['treat', t.obj != null ? t.obj : t.treat];
        if (t.color != null) return ['color', t.color];
        return ['size', thingSize(t)];
      case 'shape': case 'block': return ['shape', t.shape != null ? t.shape : t.value];
      case 'dots': case 'cookies': case 'stars': return ['number', t.n != null ? t.n : t.value];
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
      case 'treat': k = treatOf(value); return k && W.treat[k] ? addForms(out, [T.treat[k]].concat(W.treat[k])) : addForms(out, [String(value)]);
      case 'animal': case 'who': k = animalOf(value); return k ? addForms(out, [T.animal[k], T.word[k], T.who[k]].concat(W.animal[k])) : addForms(out, [String(value)]);
      case 'home': case 'homeAt': k = homeOf(value); return k ? addForms(out, [T.home[k], T.homeAt[k]].concat(W.home[k])) : addForms(out, [String(value)]);
      case 'season': k = seasonOf(value); return k ? addForms(out, [T.season[k]].concat(W.season[k])) : addForms(out, [String(value)]);
      case 'parity': if (num(value) != null) return numberWords(lang, num(value));
        k = parityOf(value); return k ? addForms(out, [T.parity[k]].concat(W.parity[k])) : addForms(out, [String(value)]);
      case 'text': {
        var tx = String(value);
        if (parityText(tx)) return words(lang, 'parity', parityText(tx));
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

  function isTalkHome(key) { return /^(talk\.(animals|home)|p\.home)/.test(key); }
  // the cargo of an order, from a thing or from the order's params (DESIGN §5.1)
  function cargoFromParams(p, key) {
    p = obj(p);
    if (isThing(p.cargo)) return p.cargo;
    if (isThing(p.thing) && /^p\./.test(key || '')) return p.thing;
    var kind = kindFromPrompt(null, key);
    if (kind === 'color' || (colorOf(p.color) && !kind)) return { kind: 'treat', obj: treatOf(p.treat) || 'treat', color: colorOf(p.color) };
    if (kind === 'shape' && shapeOf(p.shape)) return { kind: 'shape', shape: shapeOf(p.shape), color: colorOf(p.color) || undefined };
    if (kind === 'size') { var sz = sizeOf(p.big != null ? p.big : p.size); return sz ? { kind: 'treat', obj: treatOf(p.treat) || 'cake', big: sz === 'big' } : null; }
    if ((kind === 'n' || kind === 'parity') && num(p.n) != null) return { kind: 'cookies', n: num(p.n) };
    if ((kind === 'animal' || kind === 'home') && animalOf(p.animal)) return { kind: 'animal', animal: animalOf(p.animal) };
    if ((kind === 'letter' || kind === 'lower') && p.letter != null) return { kind: 'tile', text: String(rawVal(p.letter)).toUpperCase() };
    if (kind === 'initial') {
      if (animalOf(p.animal)) return { kind: 'animal', animal: animalOf(p.animal) };
      if (treatOf(p.treat || p.obj)) return { kind: 'treat', obj: treatOf(p.treat || p.obj) };
      if (p.nameValue != null && (animalOf(p.nameValue) || treatOf(p.nameValue))) return thingFromName('animal', p.nameValue);
    }
    if ((kind === 'sum' || kind === 'diff')) { var ex = exprOfParams(p, kind); return ex ? { kind: 'tile', text: ex } : null; }
    return null;
  }
  function exprOfParams(p, kind) {
    p = obj(p);
    if (present(p.expr) && splitOp(rawVal(p.expr))) return exprText(rawVal(p.expr));
    if (present(p.text) && splitOp(rawVal(p.text))) return exprText(rawVal(p.text));
    if (isThing(p.cargo) && splitOp(tileText(p.cargo))) return exprText(tileText(p.cargo));
    if (num(p.a) != null && num(p.b) != null) {
      var op = p.op != null ? (String(p.op) === '+' ? '+' : '−') : (kind === 'diff' ? '−' : '+');
      return num(p.a) + ' ' + op + ' ' + num(p.b);
    }
    return null;
  }
  // raw params → named strings (pre-named strings pass through untouched)
  function derive(lang, params, key) {
    var p = {}, k, T = NAMES[lang];
    if (params && typeof params === 'object') for (k in params) if (Object.prototype.hasOwnProperty.call(params, k)) p[k] = params[k];
    key = key || '';
    var isPrompt = /^p\./.test(key);
    var cargoThing = isPrompt ? cargoFromParams(params, key) : (isThing(p.cargo) ? p.cargo : null);
    if (cargoThing && /^p\.colors/.test(key) && !present(p.color) && colorOf(cargoThing.color)) p.color = cargoThing.color;
    if (present(p.color)) {
      var cc = colorOf(p.color);
      if (cc && !present(p.COLOR)) p.COLOR = lang === 'vi' ? 'màu ' + T.hue[cc].toUpperCase() : T.hue[cc].toUpperCase();
      p.color = name(lang, 'color', p.color);
      if (!present(p.COLOR)) p.COLOR = String(p.color).toUpperCase();
    }
    if (cargoThing) {
      if (!present(p.cargo) || typeof p.cargo === 'object') p.cargo = phrase(lang, cargoThing, { art: null });
      if (!present(p.cargoWord)) p.cargoWord = phrase(lang, cargoThing, { art: null, color: false, size: false });
      if (!present(p.shape) && shapeOf(cargoThing.shape) && /^p\.shapes/.test(key)) p.shape = cargoThing.shape;
    } else if (present(p.cargo) && typeof p.cargo === 'object') p.cargo = '';
    if (present(p.treat) && !present(p.cargoWord) && treatOf(p.treat)) p.cargoWord = T.treat[treatOf(p.treat)];
    if (present(p.shape)) {
      var sh = shapeOf(p.shape);
      if (sh && !present(p.shapes)) p.shapes = T.shapes[sh];
      p.shape = name(lang, 'shape', p.shape);
    }
    if (present(p.shapes) && shapeOf(p.shapes)) p.shapes = T.shapes[shapeOf(p.shapes)];
    if (present(p.size) || p.big === true || p.big === false) {
      p.size = name(lang, 'size', present(p.size) ? p.size : p.big);
      if (!present(p.SIZE)) p.SIZE = String(p.size).toUpperCase();
    }
    if (present(p.parity)) p.parity = name(lang, 'parity', parityOf(rawVal(p.parity)) || p.parity);
    if (present(p.home)) p.home = name(lang, 'homeAt', p.home);
    if (present(p.season)) p.season = name(lang, 'season', p.season);
    if (present(p.who) && animalOf(p.who)) p.who = phrase(lang, { kind: 'animal', animal: animalOf(p.who) }, { who: true });
    if (present(p.animal)) {
      var an = animalOf(p.animal);
      if (an && !present(p.word)) p.word = T.word[an];
      if (an && !present(p.animals)) p.animals = T.animals[an];
      p.animal = an ? T[isTalkHome(key) ? 'who' : 'animal'][an] : String(rawVal(p.animal));
    }
    // p.initial / talk.initial: the word comes from the cargo / shown thing (never say the letter = the answer)
    if (!present(p.word) && /initial/.test(key)) {
      if (cargoThing) p.word = bareWord(lang, cargoThing);
      else if (p.nameValue != null && (animalOf(p.nameValue) || treatOf(p.nameValue))) p.word = bareWord(lang, null, p.nameValue);
      else if (treatOf(p.treat)) p.word = bareWord(lang, 'treat', p.treat);
    }
    if (present(p.word) && animalOf(p.word)) p.word = T.word[animalOf(p.word)];
    else if (present(p.word) && treatOf(p.word)) p.word = bareWord(lang, 'treat', p.word);
    if (present(p.letter)) {
      p.letter = String(rawVal(p.letter));
      if (/^(p|talk|goal)\.lower/.test(key)) { if (!present(p.lower)) p.lower = p.letter.toLowerCase(); p.letter = p.letter.toUpperCase(); }
      else if (!present(p.lower)) p.lower = p.letter.toLowerCase();
    }
    if (present(p.lower)) p.lower = String(rawVal(p.lower));
    var c = present(p.n) ? num(p.n) : null;
    if (!present(p.num) && c != null) p.num = numberName(lang, c);
    if (present(p.n) && typeof p.n === 'object') p.n = c != null ? c : '';
    if (!present(p.cookieWord)) p.cookieWord = noun(lang, 'cookie', c == null ? 2 : c);
    if (!present(p.dotWord)) p.dotWord = noun(lang, 'dot', c == null ? 2 : c);
    if (/^p\.(add|sub)/.test(key) && !present(p.expr)) { var ex = exprOfParams(params, /sub/.test(key) ? 'diff' : 'sum'); if (ex) p.expr = ex; }
    if (present(p.a)) p.a = String(rawVal(p.a));
    if (present(p.b)) p.b = String(rawVal(p.b));
    if (present(p.expr)) p.expr = exprText(rawVal(p.expr));
    if (p.thing && typeof p.thing === 'object') p.thing = phrase(lang, p.thing, { art: 'a' });
    if (p.house && typeof p.house === 'object') p.house = house(lang, p.house);
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
    for (var step = 0; step < 4 && !needsMet(key, p) && FALLBACK[key]; step++) {
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

  // The order. opts.first → the chapter's round-0 form ("Ding! A red cupcake is ready! …").
  // opts.cargo (the order's cargo thing) is used when params has none: p.initial / p.oddeven orders carry no params of their own.
  I18N.ask = function (lang, key, params, opts) {
    opts = opts || {};
    lang = L(lang);
    key = String(key == null ? '' : key);
    if (isThing(opts.cargo) && !isThing(obj(params).cargo)) params = Object.assign({}, obj(params), { cargo: opts.cargo });
    if (opts.first && STR[lang][key + '.first'] != null && needsMet(key + '.first', derive(lang, params, key + '.first'))) {
      return I18N.t(lang, key + '.first', params, opts.rng);
    }
    return I18N.t(lang, key, params, opts.rng);
  };

  // ---------------------------------------------------------------- game lines
  var KIND_ALIAS = { colour: 'color', colors: 'color', blob: 'color', number: 'n', count: 'n', dots: 'n', cookies: 'n',
    farm: 'home', add: 'sum', sub: 'diff', oddeven: 'parity', letters: 'letter', animals: 'animal', shapes: 'shape' };
  function ruleKind(k) { k = low(k); k = KIND_ALIAS[k] || k; return RULE_KINDS.indexOf(k) >= 0 ? k : null; }
  function kindFromPrompt(topic, pk) {
    pk = String(pk || '');
    var m = /^p\.(\w+?)(5)?(\.first)?$/.exec(pk);
    var tp = m ? m[1] : topic;
    switch (tp) {
      case 'colors': return 'color';
      case 'shapes': return 'shape';
      case 'size': return 'size';
      case 'count': return 'n';
      case 'animal': return 'animal';
      case 'home': return 'home';
      case 'letters': return 'letter';
      case 'lower': return 'lower';
      case 'initial': return 'initial';
      case 'add': return 'sum';
      case 'sub': return 'diff';
      case 'oddeven': return 'parity';
      case 'animals': return 'animal';
    }
    if (tp !== topic && topic) return kindFromPrompt(topic, '');
    return null;
  }
  // what the order is about: e.rule | e.want.rule | the prompt key (+ topic) | e.want {kind / nameKind}
  function ruleOf(ev) {
    ev = obj(ev);
    var r = obj(ev.rule);
    if (r.kind == null && r.nameKind == null) r = obj(obj(ev.want).rule);
    var kind = ruleKind(r.kind != null ? r.kind : r.nameKind);
    var pk = ev.promptKey || obj(ev.order).promptKey;
    if (!kind) kind = kindFromPrompt(ev.topic, pk);
    if (!kind) { var w = obj(ev.want); kind = ruleKind(w.kind != null ? w.kind : w.nameKind); }
    if (kind === 'letter' && (ev.topic === 'lower' || /^p\.lower/.test(String(pk || '')))) kind = 'lower';
    if (kind === 'animal' && /^p\.home/.test(String(pk || ''))) kind = 'home';
    return { kind: kind };
  }
  function paramsOf(ev) { return obj(ev.params || obj(ev.order).params); }
  function promptKeyOf(ev, kind) {
    var pk = ev.promptKey || obj(ev.order).promptKey;
    if (pk) return String(pk);
    var M = { color: 'p.colors', shape: 'p.shapes', size: 'p.size', n: 'p.count', animal: 'p.animal', home: 'p.home',
      letter: 'p.letters', lower: 'p.lower', initial: 'p.initial', sum: 'p.add', diff: 'p.sub', parity: 'p.oddeven' };
    return M[kind] || '';
  }
  function cargoOf(ev, r) {
    if (isThing(ev.cargo)) return thingKind(ev.cargo) ? ev.cargo : (thingFromName(ev.cargo.nameKind, ev.cargo.nameValue) || {});
    var o = obj(ev.order);
    if (isThing(o.cargo)) return o.cargo;
    var c = cargoFromParams(paramsOf(ev), promptKeyOf(ev, r.kind));
    if (c) return c;
    var w = obj(ev.want);
    if (w.nameKind != null) return thingFromName(w.nameKind, w.nameValue) || {};
    return {};
  }
  function signOf(ev) {
    if (isThing(ev.sign)) return ev.sign;
    var h = obj(ev.house);
    if (isThing(h.sign)) return h.sign;
    if (isThing(ev.thing)) return ev.thing;
    var g = obj(ev.got);
    if (g.kind != null && thingKind(g)) return g;
    if (g.nameKind != null) return thingFromName(g.nameKind, g.nameValue) || {};
    return {};
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
  // after a delivery: one order left → "One more!", more → "More to deliver!", none → "All delivered!"; unknown → nothing
  function tailLine(lang, ev, rng) {
    var left = num(ev.left);
    if (left == null || left < 0) return '';
    return I18N.t(lang, left === 0 ? 'right.all' : (left === 1 ? 'right.one' : 'right.more'), null, rng);
  }
  function cargoNumber(cargo, sign, ev) {
    return firstNum(cargo.n, obj(ev.count).n, ev.count, paramsOf(ev).n, tileNumber(obj(sign)));
  }

  // `right {houseId, cargo, left, home?, count?}` (+ sign, topic, promptKey, params) → names the delivery.
  I18N.sayRight = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var r = ruleOf(ev), cargo = obj(cargoOf(ev, r)), sign = obj(signOf(ev)), T = NAMES[lang], line = '';
    switch (r.kind) {
      case 'n': {
        var n = cargoNumber(cargo, sign, ev);
        if (n != null) line = I18N.t(lang, 'right.count', { num: numberName(lang, n), n: n, cookieWord: noun(lang, 'cookie', n) }, rng);
        break;
      }
      case 'animal': {
        var a = animalOf(cargo.animal) || animalOf(sign.animal) || animalOf(paramsOf(ev).animal);
        if (a) line = I18N.t(lang, 'right.friend', { animal: T.animal[a], word: T.word[a] }, rng);
        break;
      }
      case 'home': {
        var ah = animalOf(cargo.animal) || animalOf(paramsOf(ev).animal);
        var h = homeOf(ev.home) || homeOf(sign.home) || (ah ? ANIMAL_HOME[ah] : null);
        if (ah && h) line = I18N.t(lang, 'right.home', { who: phrase(lang, { kind: 'animal', animal: ah }, { who: true }), home: T.homeAt[h] }, rng);
        break;
      }
      case 'initial': {
        var w = bareWord(lang, cargo);
        if (w) line = I18N.t(lang, 'right.initial', { thing: phrase(lang, cargo, { art: 'a', size: false, color: false }), word: w, first: initial(lang, cargo) }, rng);
        break;
      }
      case 'sum': case 'diff': {
        var tx = tileText(cargo), v = splitOp(tx) ? exprValue(tx) : tileNumber(sign);
        if (splitOp(tx) && v != null) line = I18N.t(lang, 'right.' + r.kind, { expr: exprText(tx), ans: String(v) }, rng);
        break;
      }
      case 'parity': {
        var pv = cargoNumber(cargo, sign, ev);
        if (pv != null) line = I18N.t(lang, 'right.parity', { num: String(pv), parity: T.parity[parityOf(pv)] }, rng);
        break;
      }
      default: {
        var cg = phrase(lang, cargo, r.kind === 'size' ? { art: 'a', size: true, color: false } : { art: 'a' });
        var hs = house(lang, sign, r.kind);
        if (cg && hs) line = I18N.t(lang, 'right.deliver', { cargo: cg, house: hs }, rng);
      }
    }
    if (!line) line = I18N.t(lang, 'right.any', null, rng);
    return join(line, tailLine(lang, ev, rng));
  };

  function goalParams(lang, r, cargo, ev) {
    var T = NAMES[lang], p = paramsOf(ev);
    switch (r.kind) {
      case 'color': {
        var col = colorOf(cargo.color) || colorOf(p.color);
        return { color: col || '', cargoWord: phrase(lang, cargo, { art: null, color: false, size: false }) };
      }
      case 'shape': return { shape: shapeOf(cargo.shape) || shapeOf(p.shape) || '' };
      case 'size': {
        var sz = thingSize(cargo) || sizeOf(p.big != null ? p.big : p.size);
        var cw = thingKind(cargo) ? phrase(lang, cargo, { art: null, color: false, size: false }) : T.treat[treatOf(p.treat) || 'cake'];
        return { size: sz ? T.size[sz] : '', cargoWord: cw };
      }
      case 'n': case 'parity': { var n = firstNum(cargo.n, p.n); return { n: n == null ? '' : n, cookieWord: noun(lang, 'cookie', n == null ? 2 : n) }; }
      case 'animal': { var a = animalOf(cargo.animal) || animalOf(p.animal); return a ? { animal: T.animal[a], word: T.word[a] } : {}; }
      case 'home': {
        var ah = animalOf(cargo.animal) || animalOf(p.animal);
        return ah ? { who: phrase(lang, { kind: 'animal', animal: ah }, { who: true }), home: T.homeAt[ANIMAL_HOME[ah]] } : {};
      }
      case 'letter': case 'lower': {
        var lt = tileText(cargo) || (p.letter != null ? String(rawVal(p.letter)) : '');
        return { letter: lt ? lt.toUpperCase() : '', lower: lt ? lt.toLowerCase() : '' };
      }
      case 'initial': return { word: bareWord(lang, cargo) };   // the letter is never given away before the hint
      case 'sum': case 'diff': { var tx = tileText(cargo); return { expr: splitOp(tx) ? exprText(tx) : (exprOfParams(p, r.kind) || '') }; }
    }
    return {};
  }
  function wrongIs(lang, ev, r, rng) {
    var hs = house(lang, signOf(ev), r.kind);
    return hs ? I18N.t(lang, 'wrong.is', { house: hs }, rng) : '';
  }
  function goalLine(lang, ev, r, rng) {
    if (!r.kind || !STR[lang]['goal.' + r.kind]) return I18N.t(lang, 'goal.any', null, rng);
    return I18N.t(lang, 'goal.' + r.kind, goalParams(lang, r, obj(cargoOf(ev, r)), ev), rng);
  }
  // `wrong {houseId, got:{nameKind,nameValue}, want, streak}` (+ sign, cargo, topic, promptKey, params) → names the house,
  // then the goal, kindly ("This is the blue house. The cupcake is red!" / "Đây là nhà màu xanh dương. Bánh cupcake này màu
  // đỏ cơ!"); count: "This is house number 4. We have 2 cookies!"
  I18N.sayWrong = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var r = ruleOf(ev);
    var line = join(wrongIs(lang, ev, r, rng), goalLine(lang, ev, r, rng));
    return line || I18N.t(lang, 'wrong.any', null, rng);
  };
  // the miss that brings the hint: name the house + look at the glowing road
  I18N.sayWrongHint = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var is = '';
    try { is = wrongIs(lang, ev, ruleOf(ev), rng); } catch (e) { is = ''; }
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
  // The total after a count: "Three cookies!" / "Ba cái bánh quy!" (default) · kind 'dots' → "Four dots!" / "Bốn chấm!"
  I18N.sayCountRun = function (lang, n, kind) {
    lang = L(lang);
    var c = num(n);
    if (c == null) return I18N.t(lang, 'praise');
    var which = /^dot/.test(String(kind || '')) ? 'dot' : 'cookie';
    return capFirst(numberName(lang, c) + ' ' + noun(lang, which, c)) + '!';
  };
  I18N.countList = countList;

  // a thing's plain name: sayName(lang, thing | e) → "the red cupcake" / "bánh cupcake màu đỏ"
  I18N.sayName = function (lang, thing) { return phrase(L(lang), thing) || ''; };

  // missed Talk-time answer → "It is red! Good try!", "The penguin lives on the ice! Good try!", "There are 4 cookies! …"
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
      case 'treat': return treatOf(value) ? I18N.t(lang, 'talk.wrong.a', { answer: NAMES[lang].treat[treatOf(value)] }) : I18N.t(lang, 'talk.wrong.any');
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
          return I18N.t(lang, n === 1 ? 'talk.wrong.cookie1' : 'talk.wrong.cookies', { num: String(n), cookieWord: noun(lang, 'cookie', n) });
        }
        return I18N.t(lang, 'talk.wrong.number', { answer: String(n) });
      }
      case 'text': {
        var tx = String(value);
        if (parityText(tx)) return I18N.talkWrong(lang, 'parity', parityText(tx));
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

  // Text → TTS-friendly text (Voice.say calls this). Display text stays untouched. "Tupi" / "Voi Tupi" are read as written.
  var VI_UP = 'A-ZĂÂĐÊÔƠƯ', VI_LO = 'a-zăâđêôơư';
  var RE_VI_LETTER = new RegExp('(chữ|Chữ) ([' + VI_UP + VI_LO + '])(?![\\p{L}\\p{N}])', 'gu');
  var RE_CAPS = /(^|[^\p{L}])(\p{Lu}{2,})(?![\p{L}])/gu;   // display emphasis "RED" → "red"
  // English loan words in Vietnamese lines: the vi-VN voice reads them letter by letter otherwise
  var VI_LOAN = [[/\bcupcake\b/gi, 'cắp kếch'], [/\bmacaron\b/gi, 'ma ca rông'], [/\bdonut\b/gi, 'đô nắt']];
  I18N.speech = function (lang, text) {
    lang = L(lang);
    var s = String(text == null ? '' : text);
    s = s.replace(/\s*…\s*$/, '.').replace(/\s*…\s*/g, ', ').replace(/[›»«]/g, ',').replace(/\s+—\s+/g, ', ').replace(/,\s*([!?.])/g, '$1');
    s = s.replace(RE_CAPS, function (m, pre, w) { return pre + w.toLowerCase(); });
    if (lang === 'en') {
      s = s.replace(/\b(letter|Letter|big|Big|small|Small) ([A-Za-z])(?![A-Za-z’'])/g, function (m, w, ch) {
        return w + ' ' + (LETTER_SPEECH_EN[ch.toUpperCase()] || ch);
      });
      s = s.replace(/(^|[\s!?.])([A-Z]) is for\b/g, function (m, pre, ch) { return pre + LETTER_SPEECH_EN[ch] + ' is for'; });
      s = s.replace(/\b(starts with|start with|with|Listen:) ([A-Z])(?![A-Za-z’'])/g, function (m, w, ch) { return w + ' ' + LETTER_SPEECH_EN[ch]; });
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 plus $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 minus $2')
        .replace(/\s=\s/g, ' equals ');
    } else {
      s = s.replace(RE_VI_LETTER, function (m, w, ch) { return w + ' ' + (LETTER_VI[ch.toUpperCase()] || ch.toLowerCase()); });
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 cộng $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 trừ $2')
        .replace(/\s=\s/g, ' bằng ');
      VI_LOAN.forEach(function (r) { s = s.replace(r[0], r[1]); });
    }
    return s.replace(/\s{2,}/g, ' ').trim();
  };

  I18N.name = name;
  I18N.house = house;
  I18N.words = words;
  I18N.choiceWords = function (lang, choice) { return words(lang, choice); };
  I18N.kindValue = kvOf;
  I18N.initial = initial;
  I18N.bareWord = bareWord;
  I18N.initialOf = function (lang, v) { var w = bareWord(lang, null, v); return { word: w, first: initial(lang, null, v) }; };
  I18N.phrase = function (lang, thing, opts) { return phrase(L(lang), thing, opts); };
  I18N.cargo = function (lang, params, promptKey) { var c = cargoFromParams(params, promptKey); return c ? phrase(L(lang), c, { art: null }) : ''; };
  I18N.thingFromName = thingFromName;
  I18N.ruleOf = ruleOf;
  I18N.numberName = numberName;
  I18N.stripMarks = stripMarks;
  I18N.stripClassifier = stripClassifier;
  I18N.homeOf = function (animal) { var a = animalOf(animal); return a ? ANIMAL_HOME[a] : null; };
  I18N.has = function (lang, key) { return STR[L(lang)][key] != null; };
  I18N.keys = function (lang) { return Object.keys(STR[L(lang)]); };
  I18N.raw = function (lang, key) { return STR[L(lang)][key]; };
  I18N.setChild = function (nm) { I18N.child = nm ? String(nm).trim().slice(0, 24) : ''; };
  I18N.TOPICS = TOPICS.slice();
  I18N.COLORS = COLORS.slice();
  I18N.SHAPES = SHAPES.slice();
  I18N.TREATS = TREATS.slice();
  I18N.TREATS_ALL = TREATS_ALL.slice();
  I18N.OBJS = TREATS.slice();           // sister-game compat (content.js may still read OBJS)
  I18N.ANIMALS = ANIMALS.slice();
  I18N.HOMES = HOMES.slice();
  I18N.SEASONS = SEASONS.slice();
  I18N.ANIMAL_HOME = ANIMAL_HOME;
  I18N.CLASSIFIERS = CLASSIFIERS;
  I18N.RULE_KINDS = RULE_KINDS.slice();
  I18N.THING_KINDS = THING_KINDS.slice();
  I18N.PROMPTS = PROMPTS;
  I18N.PARAMS = NEEDS;
  I18N.NAME_TABLE = NAMES;
  I18N.LETTER_VI = LETTER_VI;
  I18N.MAX_COUNT = MAX_COUNT;

  BD.I18N = I18N;
})(window.BD = window.BD || {});
