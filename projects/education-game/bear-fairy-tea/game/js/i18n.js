/* Moka's Fairy Tea Party — FT.I18N (English + Vietnamese). Moka (EN "Moka", VI titles "Gấu Moka", VI lines "Moka") is a
 * gentle little honey-brown bear cub who hosts a fairy tea party on a mossy log table. 3–5 things float down on dandelion
 * fluff and land on leaf placemats; exactly ONE is different (odd one out). The child taps it, a tiny fairy carries it up to
 * the flower-lantern garland, the others ring a chime wave and Moka says "Cheers!". "Moka" is two ordinary syllables for
 * English and Vietnamese voices: no TTS rewrite (docs/VOICE.md §0).
 *
 *   FT.I18N.t(lang, key, params?, rng?)               → string (a random variant; rng.next() / rng() / Math.random)
 *   FT.I18N.ask(lang, promptKey, params, {first, rng}) → the table question; first:true → the long first-time form
 *   FT.I18N.name(lang, kind, value)                   → kinds: color (vi "màu đỏ"), hue (bare "đỏ"), shape, shapeH (vi
 *       "hình ngôi sao"), obj (cup teapot jar bowl cupcake → "cái tách" …), objWord (bare "tách"), cookie (a shape →
 *       "bánh quy hình tròn"), plate (n → "đĩa có ba quả dâu"), berries (n), animal / guest ("con thỏ" …), word (bare noun
 *       "thỏ"), who (home-line subject), home (forest sea ice desert savanna), homeAt ("on the ice" / "ở xứ băng"),
 *       number / n (0–20), letter, sum, diff, parity, size, text / card
 *   FT.I18N.words(lang, kind, value)                  → accepted spoken forms (lower-case, + no-diacritic forms, digits)
 *   FT.I18N.choiceWords(lang, choice)                 → spoken forms of a Talk choice {id, thing}
 *   FT.I18N.initial(lang, kind, value)                → first letter of the BARE noun (no classifier, diacritics → base
 *       letter): en bunny → "B", jam jar → "J"; vi "con thỏ" → "T", "chim cánh cụt" → "C", "ấm trà" → "A". kind may be a thing.
 *   FT.I18N.bareWord(lang, kind, value)               → that bare noun ("bunny" / "thỏ")
 *   FT.I18N.phrase(lang, thing, opts?) / sayName(lang, thing) → a thing named for a sentence ("the blue cup" / "cái tách
 *       màu xanh dương", "the star cookie" / "bánh quy hình ngôi sao", "the plate with three berries" / "đĩa có ba quả dâu",
 *       "letter B" / "thẻ chữ B", "the penguin" / "chim cánh cụt")
 *   FT.I18N.sayRight(lang, e, rng?)                   → names the odd one and why, per rule kind
 *   FT.I18N.sayWrong(lang, e, rng?)                   → names what was tapped + that it matches its friends, then the goal
 *   FT.I18N.sayWrongHint(lang, e, rng?)               → the miss that brings the hint: one short line
 *   FT.I18N.sayCount(lang, i)                         → "One!" … "Twenty!"
 *   FT.I18N.sayCountRun(lang, n, othersN?)            → "One, two, three, four berries! The others have two."
 *   FT.I18N.talkWrong(lang, choice | kind, value | talk) → gentle "It is red! Good try!" / "The penguin lives on the ice!"
 *   FT.I18N.speech(lang, text)                        → text tuned for TTS (letter names, + − =, "…" → pause, NOT → not)
 *   FT.I18N.setChild(name)  has  keys  raw  langs  TOPICS  COLORS  SHAPES  OBJECTS  ANIMALS (= GUESTS)  HOMES  ANIMAL_HOME  PROMPTS
 *
 * Event `e` for sayRight / sayWrong = the world event + { topic, promptKey, params, rule } from main (round.rule = what the
 * majority shares {kind, value}; wrong events carry it as `want`). e.thing = the member's thing (right carries it; for wrong
 * main adds world.memberById(e.id).thing — if missing it is rebuilt from e.got {nameKind, nameValue}).
 * Thing kinds: obj, cookie, plate, card, guest (older aliases block / crate / tile / animal are accepted too).
 * Rule kinds: color, shape, size, n (count), animal, home (forest), letter, lower, initial, sum, diff, parity (aliases: count /
 * number → n, forest → home, add → sum, sub → diff, oddeven → parity). Missing rule → derived from topic / promptKey / params.
 * {child}: with an empty name, variants containing {child} are skipped ("bé {child}" → "bé", ", {child}!" → "!").
 * Never negative: no "wrong", "no", "sai", "không đúng" … (tested). "not" / "không phải" is the game's own question.
 */
(function (FT) {
  'use strict';

  var LANGS = ['en', 'vi'];
  var COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'oval', 'rect', 'diamond'];
  var OBJECTS = ['cup', 'teapot', 'jar', 'bowl', 'cupcake'];
  var ANIMALS = ['bunny', 'fox', 'deer', 'squirrel', 'owl', 'raccoon', 'mouse', 'hedgehog', 'penguin', 'crab', 'goldfish',
    'camel', 'lion'];
  var HOMES = ['forest', 'sea', 'ice', 'desert', 'savanna'];
  var ANIMAL_HOME = { bunny: 'forest', fox: 'forest', deer: 'forest', squirrel: 'forest', owl: 'forest', raccoon: 'forest',
    mouse: 'forest', hedgehog: 'forest', penguin: 'ice', crab: 'sea', goldfish: 'sea', camel: 'desert', lion: 'savanna' };
  var TOPICS = ['colors', 'shapes', 'size', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
  var RULE_KINDS = ['color', 'shape', 'size', 'n', 'animal', 'home', 'letter', 'lower', 'initial', 'sum', 'diff', 'parity'];
  var MEMBER_KINDS = ['obj', 'cookie', 'plate', 'card', 'guest'];
  var KIND_OF = { obj: 'obj', cookie: 'cookie', plate: 'plate', card: 'card', guest: 'guest',
    block: 'cookie', shape: 'cookie', crate: 'plate', tile: 'card', animal: 'guest' };   // older names → thing kinds
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
  NAMES.vi.shapeH = { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', star: 'hình ngôi sao',
    heart: 'hình trái tim', oval: 'hình bầu dục', rect: 'hình chữ nhật', diamond: 'hình thoi' };
  // tea things. VI: "cái tách" (teacup), "ấm trà", "hũ mứt" (jam jar), "cái bát" (southern kids say "cái chén" / "cái tô" —
  // accepted as spoken forms), cupcake = "bánh cupcake" (what Vietnamese kindergarten kids actually say; "bánh nướng nhỏ"
  // would collide with the size word: "bánh nướng nhỏ nhỏ")
  NAMES.en.obj = { cup: 'cup', teapot: 'teapot', jar: 'jam jar', bowl: 'bowl', cupcake: 'cupcake' };
  NAMES.vi.obj = { cup: 'cái tách', teapot: 'ấm trà', jar: 'hũ mứt', bowl: 'cái bát', cupcake: 'bánh cupcake' };
  NAMES.en.objWord = NAMES.en.obj;
  NAMES.vi.objWord = { cup: 'tách', teapot: 'ấm trà', jar: 'hũ mứt', bowl: 'bát', cupcake: 'bánh cupcake' };
  // guests (VI with the classifier kids use: con …; "chim cánh cụt" already is a classifier + noun)
  NAMES.en.animal = { bunny: 'bunny', fox: 'fox', deer: 'deer', squirrel: 'squirrel', owl: 'owl', raccoon: 'raccoon',
    mouse: 'mouse', hedgehog: 'hedgehog', penguin: 'penguin', crab: 'crab', goldfish: 'goldfish', camel: 'camel', lion: 'lion' };
  NAMES.vi.animal = { bunny: 'con thỏ', fox: 'con cáo', deer: 'con nai', squirrel: 'con sóc', owl: 'con cú',
    raccoon: 'con gấu mèo', mouse: 'con chuột', hedgehog: 'con nhím', penguin: 'chim cánh cụt', crab: 'con cua',
    goldfish: 'con cá vàng', camel: 'con lạc đà', lion: 'con sư tử' };
  NAMES.en.word = NAMES.en.animal;
  NAMES.vi.word = { bunny: 'thỏ', fox: 'cáo', deer: 'nai', squirrel: 'sóc', owl: 'cú', raccoon: 'gấu mèo', mouse: 'chuột',
    hedgehog: 'nhím', penguin: 'chim cánh cụt', crab: 'cua', goldfish: 'cá vàng', camel: 'lạc đà', lion: 'sư tử' };
  NAMES.en.who = NAMES.en.animal;           // the subject of a home line ("The penguin lives on the ice.")
  NAMES.vi.who = NAMES.vi.animal;
  NAMES.en.home = { forest: 'forest', sea: 'sea', ice: 'ice', desert: 'desert', savanna: 'savanna' };
  NAMES.vi.home = { forest: 'rừng', sea: 'biển', ice: 'xứ băng', desert: 'sa mạc', savanna: 'đồng cỏ châu Phi' };
  // used after "lives" / "sống": the preposition is part of the phrase ("sống trong rừng", "sống dưới biển", "sống ở xứ băng")
  NAMES.en.homeAt = { forest: 'in the forest', sea: 'in the sea', ice: 'on the ice', desert: 'in the desert', savanna: 'on the savanna' };
  NAMES.vi.homeAt = { forest: 'trong rừng', sea: 'dưới biển', ice: 'ở xứ băng', desert: 'ở sa mạc', savanna: 'ở đồng cỏ châu Phi' };
  NAMES.en.size = { big: 'big', small: 'little' };
  NAMES.vi.size = { big: 'to', small: 'nhỏ' };
  NAMES.en.parity = { odd: 'odd', even: 'even' };
  NAMES.vi.parity = { odd: 'lẻ', even: 'chẵn' };
  // the count counters: raspberries — EN "berries", VI "quả dâu" (what kids call them; "quả mâm xôi" is too hard)
  var BERRY = { en: ['berry', 'berries'], vi: ['quả dâu', 'quả dâu'] };

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
      obj: { cup: ['cup', 'teacup', 'tea cup', 'cups', 'mug'], teapot: ['teapot', 'tea pot', 'pot', 'kettle'],
        jar: ['jam jar', 'jar', 'jam', 'jars', 'honey jar'], bowl: ['bowl', 'bowls', 'dish'],
        cupcake: ['cupcake', 'cup cake', 'cupcakes', 'cake', 'muffin'] },
      animal: { bunny: ['bunny', 'rabbit', 'bunnies', 'bunny rabbit', 'rabbits'], fox: ['fox', 'foxy', 'foxes'],
        deer: ['deer', 'fawn', 'reindeer', 'dear'], squirrel: ['squirrel', 'squirrels', 'squirl'],
        owl: ['owl', 'owls', 'owlet', 'hoot'], raccoon: ['raccoon', 'racoon', 'raccoons', 'coon'],
        mouse: ['mouse', 'mice', 'mousey', 'mousie'], hedgehog: ['hedgehog', 'hedgehogs', 'hedgie', 'hedge hog', 'porcupine'],
        penguin: ['penguin', 'penguins'], crab: ['crab', 'crabs', 'crabby'],
        goldfish: ['goldfish', 'gold fish', 'fish', 'fishy', 'fish bowl', 'fishbowl'], camel: ['camel', 'camels', 'hump'],
        lion: ['lion', 'lions', 'roar'] },
      home: { forest: ['forest', 'the forest', 'in the forest', 'woods', 'the woods', 'trees', 'wood'],
        sea: ['sea', 'the sea', 'ocean', 'beach', 'water'],
        ice: ['ice', 'the ice', 'snow', 'iceberg', 'cold', 'south pole', 'antarctica'],
        desert: ['desert', 'the desert', 'dessert', 'sand', 'sandy', 'dunes'],
        savanna: ['savanna', 'savannah', 'africa', 'grassland', 'grass'] },
      parity: { odd: ['odd', 'odds'], even: ['even', 'evens'] }
    },
    vi: {
      color: { red: ['đỏ', 'màu đỏ'], blue: ['xanh dương', 'xanh da trời', 'xanh nước biển', 'xanh lam', 'da trời', 'dương'],
        yellow: ['vàng', 'màu vàng'], green: ['xanh lá', 'xanh lá cây', 'xanh lục', 'lá cây'], orange: ['cam', 'màu cam'],
        purple: ['tím', 'màu tím'], pink: ['hồng', 'màu hồng'] },
      shape: { circle: ['hình tròn', 'tròn'], square: ['hình vuông', 'vuông'], triangle: ['tam giác', 'hình tam giác'],
        star: ['ngôi sao', 'sao', 'hình ngôi sao', 'hình sao'], heart: ['trái tim', 'tim', 'hình trái tim', 'hình tim'],
        rect: ['chữ nhật', 'hình chữ nhật'], oval: ['bầu dục', 'hình bầu dục'], diamond: ['hình thoi', 'thoi'] },
      size: { big: ['to', 'lớn', 'bự', 'to lắm', 'to hơn', 'to nhất'], small: ['nhỏ', 'bé', 'nhỏ xíu', 'nhỏ hơn', 'tí hon', 'nhỏ nhất'] },
      obj: { cup: ['cái tách', 'tách', 'tách trà', 'cái cốc', 'cốc', 'cái ly', 'ly'],
        teapot: ['ấm trà', 'ấm', 'cái ấm', 'bình trà', 'ấm pha trà'], jar: ['hũ mứt', 'hũ', 'cái hũ', 'lọ mứt', 'mứt', 'hủ mứt'],
        bowl: ['cái bát', 'bát', 'cái chén', 'chén', 'cái tô', 'tô'],
        cupcake: ['bánh cupcake', 'cupcake', 'bánh kem', 'bánh nướng', 'bánh nướng nhỏ', 'cấp kếch'] },
      animal: { bunny: ['con thỏ', 'thỏ', 'thỏ con', 'thỏ trắng'], fox: ['con cáo', 'cáo', 'cáo con'],
        deer: ['con nai', 'nai', 'nai con', 'con hươu', 'hươu'], squirrel: ['con sóc', 'sóc', 'sóc con'],
        owl: ['con cú', 'cú', 'cú mèo', 'chim cú', 'con cú mèo'], raccoon: ['con gấu mèo', 'gấu mèo', 'gấu trúc mỹ'],
        mouse: ['con chuột', 'chuột', 'chuột con', 'chuột nhắt'], hedgehog: ['con nhím', 'nhím', 'nhím con'],
        penguin: ['chim cánh cụt', 'cánh cụt', 'con chim cánh cụt'], crab: ['con cua', 'cua', 'cua biển'],
        goldfish: ['con cá vàng', 'cá vàng', 'con cá', 'cá', 'bể cá'], camel: ['con lạc đà', 'lạc đà'],
        lion: ['con sư tử', 'sư tử', 'chúa sơn lâm'] },
      home: { forest: ['rừng', 'trong rừng', 'rừng xanh', 'khu rừng', 'rừng cây', 'ở rừng'],
        sea: ['biển', 'dưới biển', 'đại dương', 'bờ biển', 'nước', 'ở biển'],
        ice: ['xứ băng', 'băng', 'tuyết', 'băng tuyết', 'nam cực', 'bắc cực', 'xứ lạnh'],
        desert: ['sa mạc', 'xa mạc', 'cát', 'sa mạc cát', 'ở sa mạc'],
        savanna: ['đồng cỏ châu phi', 'đồng cỏ', 'châu phi', 'thảo nguyên'] },
      parity: { odd: ['lẻ', 'số lẻ', 'lẽ', 'lẹ'], even: ['chẵn', 'số chẵn', 'chặn', 'chắn'] }
    }
  };

  // ---------------------------------------------------------------- strings
  // prompt keys content.js asks with (DESIGN §5.1 / §6) and their REQUIRED params
  var PROMPTS = {
    'p.colors': ['color'], 'p.shapes': ['shape'], 'p.shapes5': ['shape'], 'p.size': [], 'p.sizeBig': [], 'p.count': ['n'],
    'p.animal': ['animal'], 'p.forest': [], 'p.letters': ['letter'], 'p.lower': ['letter'], 'p.initial': ['letter'],
    'p.add': ['n'], 'p.sub': ['n'], 'p.oddeven': ['parity']
  };

  var STR = {
    en: {
      'ui.title': 'Moka’s Fairy Tea Party',
      'ui.logo1': 'Moka’s',
      'ui.logo2': 'Fairy Tea Party',
      'ui.subtitle': 'Find the one that’s different, and the fairy lights a lantern!',
      'ui.tagline': 'Find the one that’s different, and the fairy lights a lantern!',
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
      'ui.voice': 'Moka’s voice',
      'ui.mic': 'Answer by talking',
      'ui.done': 'Done',
      'ui.stars': 'Stars',
      'ui.chapter': 'Chapter {n}',
      'ui.allDone': 'All done! {stars} stars',
      'ui.welcome': ['Hi {child}! I am Moka. Welcome to my fairy tea party!', 'Hi! I am Moka. Welcome to my fairy tea party!'],
      'ui.micUnsupported': 'Voice answers are not available here. Tap the pictures!',
      'ui.micDenied': 'The microphone is off. Tap the pictures instead!',
      'ui.voiceMissing': 'Tip for parents: add a voice in Settings › Accessibility › Spoken Content › Voices.',
      'ui.tapOrSay': 'Tap or say the answer!',
      'ui.listening': 'Moka is listening…',
      'ui.tapBo': 'Tap Moka to hear it again',
      'ui.tapMoka': 'Tap Moka to hear it again',
      'ui.tapHint': 'Tap the one that’s different',
      'ui.doorHint': 'Tap the glowing one',
      'ui.skip': 'Skip',
      'ui.gallery': 'Our tea party',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Colourful Tea Things',
      'topic.shapes': 'Cookie Shapes',
      'topic.size': 'Big and Little',
      'topic.count': 'Berry Counting',
      'topic.animals': 'Forest Friends',
      'topic.letters': 'Letter Cards',
      'topic.lower': 'Big and Small Letters',
      'topic.initial': 'First Letters',
      'topic.add': 'Adding Up',
      'topic.sub': 'Take Away',
      'topic.oddeven': 'Odd and Even',

      'weather.0': ['What a sunny day for tea!', 'Sunshine in the forest! What a day for tea!'],
      'weather.1': ['Whoosh, a breezy day!', 'Whoosh! The wind is playing with the leaves!'],
      'weather.2': ['Pitter-patter, it’s raining!', 'Pitter-patter! Moka has a mushroom umbrella!'],
      'weather.3': ['Look, a rainbow!', 'Look up! A beautiful rainbow!'],

      'enter': ['Here come the tea things!', 'Look, they float down from the sky!', 'Whee! Float, float, here they come!'],

      'p.any': ['Which one is different?', 'Find the one that doesn’t belong!', 'Which one is the odd one out?'],
      'p.colors': ['Which one is not {color}?', 'Find the one that’s not {color}!', 'Look at the colours! Which one is not {color}?'],
      'p.colors.first': ['They’re all {color}… but one! Which one is NOT {color}?'],
      'p.shapes': ['Which cookie is not a {shape}?', 'Find the cookie that’s not a {shape}!', 'Look at the cookies! Which one is not a {shape}?'],
      'p.shapes.first': ['Every cookie is a {shape}… but one! Which cookie is NOT a {shape}?'],
      'p.shapes5': ['Look at the shapes, not the colours! Which cookie is not a {shape}?', 'Find the cookie that’s not a {shape}!',
        'So many colours! Which cookie is not a {shape}?'],
      'p.shapes5.first': ['Lots of colours… but look at the shapes! Every cookie is a {shape}, but one. Which cookie is NOT a {shape}?'],
      'p.size': ['Which one is the little one?', 'Find the little one!', 'One of them is little. Which one?'],
      'p.size.first': ['They’re all big… but one! Which one is the little one?'],
      'p.sizeBig': ['Which one is the big one?', 'Find the big one!', 'One of them is big. Which one?'],
      'p.sizeBig.first': ['They’re all little… but one! Which one is the big one?'],
      'p.count': ['Which plate does not have {num} {berries}?', 'Find the plate that doesn’t have {num} {berries}!',
        'Let’s count! Which plate has a different number of berries?'],
      'p.count.first': ['Count the berries! Every plate has {num} {berries}… but one! Which plate does NOT have {num} {berries}?'],
      'p.animal': ['Which one is not a {animal}?', 'Find the friend who is not a {animal}!', 'Look at our guests! Who is not a {animal}?'],
      'p.animal.first': ['Almost every guest is a {animal}… but one! Who is NOT a {animal}?'],
      'p.forest': ['Who doesn’t live in the forest?', 'Find the guest who lives far away!', 'Which friend doesn’t live in the forest?'],
      'p.forest.first': ['These friends live in the forest… but one! Who doesn’t live in the forest?'],
      'p.letters': ['Which card is not letter {letter}?', 'Find the card that’s not letter {letter}!', 'Look at the cards! Which one is not letter {letter}?'],
      'p.letters.first': ['The cards all say letter {letter}… but one! Which card is NOT letter {letter}?'],
      'p.lower': ['Which card is not big {letter} or small {lower}?', 'Find the card that’s not big {letter} or small {lower}!',
        'Big {letter}, small {lower}… and one other letter! Which card?'],
      'p.lower.first': ['Here are big {letter} and small {lower}… and one other letter! Which card is NOT big {letter} or small {lower}?'],
      'p.initial': ['Which one does not start with {letter}?', 'Find the one that doesn’t start with {letter}!',
        'Listen: {letter}! Which one does not start with {letter}?'],
      'p.initial.first': ['Almost every name starts with {letter}… but one! Which one does NOT start with {letter}?'],
      'p.add': ['Which card does not make {num}?', 'Find the card that doesn’t make {num}!', 'Let’s add! Which card is not {num}?'],
      'p.add.first': ['Almost all of these cards make {num}… but one! Which card does NOT make {num}?'],
      'p.sub': ['Which card does not make {num}?', 'Find the card that doesn’t make {num}!', 'Take away! Which card is not {num}?'],
      'p.sub.first': ['Almost all of these cards make {num}… but one! Which card does NOT make {num}?'],
      'p.oddeven': ['Which number is not {parity}?', 'Find the number that’s not {parity}!', 'Look at the numbers! Which one is not {parity}?'],
      'p.oddeven.first': ['These numbers are all {parity}… but one! Which number is NOT {parity}?'],

      'right.color': ['{thing}! It’s not {rule}.', 'Yes! {thing} is not {rule}.', '{thing}! The others are all {rule}.'],
      'right.shape': ['{thing}! It’s not a {rule}.', 'Yes! {thing} is not a {rule}.', 'Look, {thing}! Every other cookie is a {rule}.'],
      'right.size': ['{thing}! It’s the {size} one.', 'Yes! {thing} is {size}. The others are {rule}.', '{thing}! So {size}!'],
      'right.animal': ['{thing}! It’s not a {rule}.', 'Yes! {thing} is not a {rule}.', 'Look, {thing}! Every other guest is a {rule}.'],
      'right.home': ['{thing}! {thing} lives {home}.', 'Yes! {thing} lives {home}, far from the forest.',
        '{thing} lives {home}! What a long trip to tea!'],
      'right.letter': ['{thing}! It’s not {rule}.', 'Yes! {thing} is not {rule}.', '{thing}! The others are all {rule}.'],
      'right.lower': ['{thing}! It’s not big {letter} or small {lower}.', 'Yes! {thing} is a different letter.',
        '{thing}! The others are big {letter} and small {lower}.'],
      'right.initial': ['{thing}! {word} starts with {first}, not {letter}.', 'Yes! {word} starts with {first}. The others start with {letter}.',
        '{thing}! {first} is for {word}!'],
      'right.sum': ['{expr} makes {ans}! The others make {num}.', 'Yes! {expr} is {ans}, not {num}.', '{expr} makes {ans}! Super adding!'],
      'right.diff': ['{expr} makes {ans}! The others make {num}.', 'Yes! {expr} is {ans}, not {num}.', '{expr} makes {ans}! Super thinking!'],
      'right.parity': ['{num}! {num} is {parity}. The others are {rule}.', 'Yes! {num} is {parity}, not {rule}.', '{num} is an {parity} number!'],
      'right.any': ['You found it!', 'That’s the one!', 'Yes! That one is different!'],
      'countOthers': 'The others have {num}.',

      'wrong.color': ['{thing} is {rule} like its friends! Which one isn’t {rule}?',
        '{thing} is {rule} too, just like the others. Which one is not {rule}?',
        'Look, {thing} is {rule}, like its friends! Which one isn’t?'],
      'wrong.shape': ['{thing}, like its friends! Which cookie isn’t a {rule}?',
        'That one is a {rule} too, just like the others. Which cookie is not a {rule}?',
        'Look, another {rule}, like its friends! Find the different cookie!'],
      'wrong.size': ['{thing} is {rule} like its friends! Find the {size} one!',
        '{thing} is {rule} too, just like the others. Which one is {size}?',
        'Look, {thing} is {rule}, like its friends! Where is the {size} one?'],
      'wrong.n': ['{num} {berries}, like its friends! Which plate is different?',
        '{num} {berries} here too, just like the others! Which plate is different?',
        'This plate has {num} {berries} too, like its friends. Find another one!'],
      'wrong.animal': ['That’s {thing}, like its friends! Who isn’t a {rule}?',
        'That’s a {rule} too, just like the others. Who is not a {rule}?',
        'Look, another {rule}, like its friends! Who is different?'],
      'wrong.home': ['{thing} lives here, like its friends! Who doesn’t?',
        '{thing} lives in the forest too, just like the others. Who lives far away?',
        'Look, {thing} is a forest friend, like the others! Who lives far away?'],
      'wrong.letter': ['{thing}, like its friends! Which card isn’t {rule}?',
        '{thing} is {rule} too, just like the others. Which card is different?',
        'Look, {thing}, like its friends! Find the other letter!'],
      'wrong.lower': ['{thing}! Big {letter} and small {lower} are friends. Find another!',
        '{thing} goes with big {letter} and small {lower}. Which letter is different?',
        'Look, {thing}! Big {letter} and small {lower} are friends. Which is new?'],
      'wrong.initial': ['{word} starts with {first}, like its friends! Which one doesn’t?',
        '{word} starts with {first} too, just like the others. Which one is different?',
        'Listen: {word}, {first}, like its friends! Who starts differently?'],
      'wrong.sum': ['{expr} makes {num}, like its friends! Which card doesn’t?',
        '{expr} is {num} too, just like the others. Let’s count again!',
        'Let’s add: {expr} makes {num}, like its friends! Which card is different?'],
      'wrong.diff': ['{expr} makes {num}, like its friends! Which card doesn’t?',
        '{expr} is {num} too, just like the others. Let’s count again!',
        'Let’s take away: {expr} makes {num}, like its friends! Which card is different?'],
      'wrong.parity': ['{num} is {parity}, like its friends! Which number isn’t?',
        '{num} is {parity} too, just like the others. Which number is different?',
        'Look, {num} is {parity}, like its friends! Which one isn’t {parity}?'],
      'wrong.hint': ['{thing}, like its friends! Look at the glowing one!', '{thing}, just like the others! Look at the shiny one!',
        '{thing}, like its friends! Watch the little hand!'],
      'wrong.any': ['Let’s look again!', 'Let’s find the one that’s different!', 'Hmm, let’s think again!', 'Keep going, you can do it!'],

      'lantern': ['Up you go, little lantern!', 'The lantern is glowing!', 'Twinkle! A new light!'],
      'cheers': ['Cheers!', 'Cheers, everyone!', 'Clink! Cheers!'],
      'garland': ['All the lanterns are glowing!', 'Look, every lantern is shining!', 'Hooray! The whole garland is twinkling!'],
      'surprise.ladybug': ['Look! A little ladybug is coming to tea!', 'Tiptoe, tiptoe! Who is that?', 'A ladybug wants to join the party!'],
      'surprise.butterfly': ['Look! A butterfly!', 'Flutter, flutter! A butterfly is here!', 'A butterfly came to the tea party!'],
      'surprise.snail': ['Look! A snail is peeking out!', 'Who is under the table?', 'A little snail with a leaf umbrella!'],
      'surprise.fairies': ['Look! More fairies came to dance!', 'Twinkle, twinkle! Little fairies!', 'The fairies are dancing around the lanterns!'],
      'critter.ladybug': ['Whirr! Off she flies!', 'Bye-bye, little ladybug!', 'Zoom! The ladybug flies!'],
      'critter.butterfly': ['Flutter, flutter!', 'Whee! Loop the loop!', 'Hello, pretty butterfly!'],
      'critter.snail': ['Boing! Hello, snail!', 'Peekaboo!', 'The snail says hello!'],
      'critter.fairies': ['Twirl!', 'Twinkle, twirl!', 'Sparkle, sparkle!'],
      'moka.poke': ['Hee hee! That tickles!', 'Hi there! Moka is happy!', 'Hello! Would you like some tea?'],

      'praise': ['Yes!', 'Great job!', 'You got it!', 'Super!', 'Wonderful!', 'Lovely!', 'Hooray!', 'Well done!',
        'Yes, {child}!', 'Well done, {child}!', 'Super, {child}!'],
      'great': ['Great finding, {child}!', 'You did it, {child}!', 'What sharp eyes!', 'Wow, {child}, super finding!',
        'Hooray! Another lantern!', 'You are so clever!', 'Wonderful! Cheers!'],
      'party': ['Look at all our lanterns!', 'Hooray! What a lovely tea party!', 'Everyone is dancing!'],
      'hint': ['Psst! Look at the glowing one!', 'Watch the little hand!', 'Moka will help! Tap this one!',
        'Look, this one is sparkling!', 'The shiny one! Tap it!'],
      'idle': ['Moka is waiting! Your turn!', 'Let’s find the different one!', 'I am here, {child}! Let’s play!',
        'The tea is getting cold! Let’s play!', 'Which one is different?'],

      'talk.intro': 'Talk time!',
      'talk.colors': 'What colour is this?',
      'talk.colorsAny': 'What colour is this?',
      'talk.colorsWhich': 'Which one is {color}?',
      'talk.shapes': 'Which one is the {shape}?',
      'talk.shapesAny': 'What shape is this?',
      'talk.shapes5': 'Which one is the {shape}?',
      'talk.size': 'Which one is {size}?',
      'talk.sizeAny': 'Which one is the little one?',
      'talk.sizeWhich': 'Which one is {size}?',
      'talk.count': 'How many berries?',
      'talk.countAny': 'How many are there?',
      'talk.animals': 'Where does the {animal} live?',
      'talk.forest': 'Where does the {animal} live?',
      'talk.farm': 'Where does the {animal} live?',
      'talk.home': 'Where does the {animal} live?',
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
      'talk.wrong.berries': 'There are {num} {berries}! Good try!',
      'talk.wrong.home': '{thing} lives {home}! Good try!',
      'talk.wrong.place': 'It lives {home}! Good try!',
      'talk.wrong.any': 'Good try! Let’s play more!',

      'session.done': ['What a tea party! {stars} stars! Hooray!', 'Amazing, {child}! {stars} stars!',
        'All the lanterns are shining! {stars} stars!']
    },
    vi: {
      'ui.title': 'Tiệc Trà Trong Rừng Của Gấu Moka',
      'ui.logo1': 'Gấu Moka',
      'ui.logo2': 'Tiệc Trà Trong Rừng',
      'ui.subtitle': 'Bé tìm bạn khác các bạn kia, bạn tiên nhỏ sẽ thắp sáng đèn hoa nhé!',
      'ui.tagline': 'Bé tìm bạn khác các bạn kia, bạn tiên nhỏ sẽ thắp sáng đèn hoa nhé!',
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
      'ui.voice': 'Giọng của Gấu Moka',
      'ui.mic': 'Nói để trả lời',
      'ui.done': 'Xong',
      'ui.stars': 'Ngôi sao',
      'ui.chapter': 'Chương {n}',
      'ui.allDone': 'Hoàn thành! {stars} ngôi sao',
      'ui.welcome': ['Chào bé {child}! Mình là gấu Moka. Mời bé đến dự tiệc trà trong rừng nhé!',
        'Chào bé! Mình là gấu Moka. Mời bé đến dự tiệc trà trong rừng nhé!'],
      'ui.micUnsupported': 'Máy này chưa nghe được giọng nói. Bé chạm vào hình nhé!',
      'ui.micDenied': 'Micrô đang tắt. Bé chạm vào hình nhé!',
      'ui.voiceMissing': 'Mẹo cho bố mẹ: thêm giọng tiếng Việt trong Cài đặt › Trợ năng › Nội dung được đọc › Giọng nói.',
      'ui.tapOrSay': 'Bé chạm hoặc nói đáp án nhé!',
      'ui.listening': 'Moka đang nghe…',
      'ui.tapBo': 'Chạm vào Moka để nghe lại nhé',
      'ui.tapMoka': 'Chạm vào Moka để nghe lại nhé',
      'ui.tapHint': 'Bé chạm vào bạn khác các bạn kia nhé',
      'ui.doorHint': 'Bé chạm vào bạn đang sáng nhé',
      'ui.skip': 'Bỏ qua',
      'ui.gallery': 'Tiệc trà của bé',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Đồ trà sắc màu',
      'topic.shapes': 'Bánh quy đủ hình',
      'topic.size': 'To và nhỏ',
      'topic.count': 'Cùng đếm dâu',
      'topic.animals': 'Bạn thú trong rừng',
      'topic.letters': 'Thẻ chữ cái',
      'topic.lower': 'Chữ hoa, chữ thường',
      'topic.initial': 'Chữ cái đầu tiên',
      'topic.add': 'Phép cộng',
      'topic.sub': 'Phép trừ',
      'topic.oddeven': 'Số chẵn, số lẻ',

      'weather.0': ['Trời nắng đẹp quá, mình uống trà nào!', 'Nắng vàng trong rừng rồi! Tiệc trà bắt đầu nhé!'],
      'weather.1': ['Vù vù, gió thổi mát quá!', 'Vù vù! Gió đang đùa với lá cây nè!'],
      'weather.2': ['Tí tách, tí tách, trời mưa rồi!', 'Tí tách! Moka có cái ô nấm nè!'],
      'weather.3': ['Nhìn kìa, cầu vồng!', 'Bé nhìn lên kìa! Cầu vồng đẹp quá!'],

      'enter': ['Các bạn bay xuống rồi!', 'Nhìn kìa, các bạn bay từ trên trời xuống!', 'Ôi, bay bay, các bạn tới rồi nè!'],

      'p.any': ['Bé ơi, bạn nào khác các bạn kia nhỉ?', 'Bé tìm bạn khác các bạn kia nhé!', 'Bạn nào khác các bạn kia nào?'],
      'p.colors': ['Bé ơi, bạn nào không phải {color} nhỉ?', 'Bé tìm bạn không phải {color} nhé!',
        'Nhìn màu nè! Bạn nào không phải {color}?'],
      'p.colors.first': ['Các bạn đều {color}… trừ một bạn! Bạn nào không phải {color}?'],
      'p.shapes': ['Bé ơi, bánh quy nào không phải {shape} nhỉ?', 'Bé tìm bánh quy không phải {shape} nhé!',
        'Nhìn các bánh quy nè! Bánh nào không phải {shape}?'],
      'p.shapes.first': ['Các bánh quy đều là {shape}… trừ một cái! Bánh nào không phải {shape}?'],
      'p.shapes5': ['Bé ơi, nhìn hình chứ không nhìn màu nhé! Bánh quy nào không phải {shape} nhỉ?', 'Bé tìm bánh quy không phải {shape} nhé!',
        'Nhiều màu quá! Bánh quy nào không phải {shape} nhỉ?'],
      'p.shapes5.first': ['Nhiều màu quá… nhưng bé nhìn hình nhé! Các bánh quy đều là {shape}, trừ một cái. Bánh nào không phải {shape}?'],
      'p.size': ['Bé ơi, bạn nào nhỏ xíu nhỉ?', 'Bé tìm bạn nhỏ nhất nhé!', 'Có một bạn nhỏ xíu. Bạn nào thế?'],
      'p.size.first': ['Các bạn đều to… trừ một bạn! Bạn nào nhỏ xíu nhỉ?'],
      'p.sizeBig': ['Bé ơi, bạn nào to nhất nhỉ?', 'Bé tìm bạn to nhất nhé!', 'Có một bạn thật to. Bạn nào thế?'],
      'p.sizeBig.first': ['Các bạn đều nhỏ xíu… trừ một bạn! Bạn nào to nhất nhỉ?'],
      'p.count': ['Bé ơi, đĩa nào không có {num} {berries} nhỉ?', 'Bé tìm đĩa không có {num} {berries} nhé!',
        'Mình đếm nào! Đĩa nào có số dâu khác các đĩa kia?'],
      'p.count.first': ['Bé đếm dâu nhé! Các đĩa đều có {num} {berries}… trừ một đĩa! Đĩa nào không có {num} {berries}?'],
      'p.animal': ['Bé ơi, bạn nào không phải {animal} nhỉ?', 'Bé tìm bạn không phải {animal} nhé!',
        'Nhìn các bạn khách nè! Bạn nào không phải {animal}?'],
      'p.animal.first': ['Các bạn khách đều là {animal}… trừ một bạn! Bạn nào không phải {animal}?'],
      'p.forest': ['Bé ơi, bạn nào không sống trong rừng nhỉ?', 'Bé tìm bạn ở xa đến dự tiệc nhé!',
        'Bạn nào không sống trong rừng thế?'],
      'p.forest.first': ['Các bạn này sống trong rừng… trừ một bạn! Bạn nào không sống trong rừng?'],
      'p.letters': ['Bé ơi, thẻ nào không phải chữ {letter} nhỉ?', 'Bé tìm thẻ không phải chữ {letter} nhé!',
        'Nhìn các thẻ nè! Thẻ nào không phải chữ {letter}?'],
      'p.letters.first': ['Các thẻ đều là chữ {letter}… trừ một thẻ! Thẻ nào không phải chữ {letter}?'],
      'p.lower': ['Bé ơi, thẻ nào không phải chữ {letter} hoa hay chữ {lower} thường nhỉ?',
        'Bé tìm thẻ không phải chữ {letter} hoa hay chữ {lower} thường nhé!',
        'Chữ {letter} hoa, chữ {lower} thường… và một chữ khác! Thẻ nào thế?'],
      'p.lower.first': ['Đây là chữ {letter} hoa và chữ {lower} thường… và một chữ khác! Thẻ nào không phải chữ {letter} hoa hay chữ {lower} thường?'],
      'p.initial': ['Bé ơi, bạn nào không bắt đầu bằng chữ {letter} nhỉ?', 'Bé tìm bạn không bắt đầu bằng chữ {letter} nhé!',
        'Bé nghe nè: chữ {letter}! Bạn nào không bắt đầu bằng chữ {letter}?'],
      'p.initial.first': ['Tên các bạn đều bắt đầu bằng chữ {letter}… trừ một bạn! Bạn nào không bắt đầu bằng chữ {letter}?'],
      'p.add': ['Bé ơi, thẻ nào không bằng {num} nhỉ?', 'Bé tìm thẻ không bằng {num} nhé!',
        'Mình cộng nào! Thẻ nào không bằng {num}?'],
      'p.add.first': ['Các thẻ đều bằng {num}… trừ một thẻ! Thẻ nào không bằng {num}?'],
      'p.sub': ['Bé ơi, thẻ nào không bằng {num} nhỉ?', 'Bé tìm thẻ không bằng {num} nhé!',
        'Mình trừ nào! Thẻ nào không bằng {num}?'],
      'p.sub.first': ['Các thẻ đều bằng {num}… trừ một thẻ! Thẻ nào không bằng {num}?'],
      'p.oddeven': ['Bé ơi, số nào không phải số {parity} nhỉ?', 'Bé tìm số không phải số {parity} nhé!',
        'Nhìn các số nè! Số nào không phải số {parity}?'],
      'p.oddeven.first': ['Các số đều là số {parity}… trừ một số! Số nào không phải số {parity}?'],

      'right.color': ['{thing}! Nó không phải {rule}.', 'Đúng rồi! {thing} không phải {rule}.', '{thing}! Các bạn kia đều {rule}.'],
      'right.shape': ['{thing}! Nó không phải {rule}.', 'Đúng rồi! {thing} không phải {rule}.', '{thing}! Các bánh kia đều là {rule}.'],
      'right.size': ['{thing}! Bạn ấy là bạn {size} nè.', 'Đúng rồi! {thing} {size}, các bạn kia {rule}.', '{thing}! Bạn ấy {size} hơn các bạn kia.'],
      'right.animal': ['{thing}! Bạn ấy không phải {rule}.', 'Đúng rồi! {thing} không phải {rule}.', '{thing}! Các bạn khách kia đều là {rule}.'],
      'right.home': ['{thing}! {thing} sống {home}.', 'Đúng rồi! {thing} sống {home}, xa khu rừng lắm.',
        '{thing} sống {home} đó! Bạn ấy đi thật xa đến dự tiệc trà!'],
      'right.letter': ['{thing}! Nó không phải {rule}.', 'Đúng rồi! {thing} không phải {rule}.', '{thing}! Các thẻ kia đều là {rule}.'],
      'right.lower': ['{thing}! Nó không phải chữ {letter} hoa hay chữ {lower} thường.', 'Đúng rồi! {thing} là một chữ khác.',
        '{thing}! Các thẻ kia là chữ {letter} hoa và chữ {lower} thường.'],
      'right.initial': ['{thing}! {word} bắt đầu bằng chữ {first}, không phải chữ {letter}.',
        'Đúng rồi! {word} bắt đầu bằng chữ {first}. Các bạn kia bắt đầu bằng chữ {letter}.', '{thing}! Chữ {first}, {word}!'],
      'right.sum': ['{expr} bằng {ans}! Các thẻ kia bằng {num}.', 'Đúng rồi! {expr} bằng {ans}, không phải {num}.', '{expr} bằng {ans}! Bé cộng giỏi quá!'],
      'right.diff': ['{expr} bằng {ans}! Các thẻ kia bằng {num}.', 'Đúng rồi! {expr} bằng {ans}, không phải {num}.', '{expr} bằng {ans}! Bé trừ giỏi quá!'],
      'right.parity': ['{num}! {num} là số {parity}. Các số kia là số {rule}.', 'Đúng rồi! {num} là số {parity}, không phải số {rule}.',
        '{num} là số {parity} đó!'],
      'right.any': ['Bé tìm ra rồi!', 'Đúng bạn đó rồi!', 'Đúng rồi! Bạn ấy khác các bạn kia!'],
      'countOthers': 'Các đĩa kia có {num} quả.',

      'wrong.color': ['{thing} {rule} giống các bạn! Bạn nào khác màu nhỉ?',
        '{thing} cũng {rule} giống các bạn nè. Bạn nào không phải {rule} nhỉ?',
        'Ồ, {thing} {rule} giống các bạn kia! Bạn nào khác màu nào?'],
      'wrong.shape': ['{thing} giống các bạn! Bánh nào khác hình nhỉ?',
        '{thing} cũng giống các bạn nè. Bánh nào không phải {rule} nhỉ?',
        'Ồ, thêm một {rule} giống các bạn kia! Bánh nào khác nhỉ?'],
      'wrong.size': ['{thing} {rule} giống các bạn! Bạn nào {size} nhỉ?',
        '{thing} cũng {rule} giống các bạn nè. Bạn nào {size} nhỉ?',
        'Ồ, {thing} {rule} giống các bạn kia! Bé tìm bạn {size} nhé!'],
      'wrong.n': ['Có {num} {berries}, giống các đĩa kia! Đĩa nào khác nhỉ?',
        'Bé đếm nè, {num} {berries}, giống các đĩa kia! Đĩa nào khác nhỉ?',
        'Đĩa này cũng có {num} {berries} giống các bạn nè. Mình tìm đĩa khác nhé!'],
      'wrong.animal': ['Đây là {thing}, giống các bạn! Bạn nào không phải {rule}?',
        'Bạn này cũng là {rule} giống các bạn nè. Bạn nào không phải {rule} nhỉ?',
        'Ồ, thêm một {rule} giống các bạn kia! Bạn nào khác nhỉ?'],
      'wrong.home': ['{thing} ở rừng giống các bạn! Bạn nào ở xa nhỉ?',
        '{thing} cũng sống trong rừng giống các bạn nè. Mình tìm bạn ở xa đến nhé!',
        'Ồ, {thing} là bạn trong rừng giống các bạn kia! Bạn nào ở xa nhỉ?'],
      'wrong.letter': ['{thing}, giống các bạn kia! Thẻ nào không phải {rule}?',
        '{thing} cũng là {rule} giống các bạn nè. Thẻ nào khác nhỉ?',
        'Ồ, {thing} giống các bạn kia rồi! Mình tìm thẻ khác nhé!'],
      'wrong.lower': ['Chữ {letter} và chữ {lower} là bạn của nhau! Tìm thẻ khác nhé!',
        '{thing} đi cùng chữ {letter} hoa và chữ {lower} thường nè. Thẻ nào khác nhỉ?',
        'Ồ, {thing}! Cũng là chữ {letter} giống các bạn kia. Mình tìm thẻ khác nhé!'],
      'wrong.initial': ['{word} bắt đầu bằng chữ {first} giống các bạn! Bạn nào khác nhỉ?',
        '{word} cũng bắt đầu bằng chữ {first} giống các bạn nè. Bạn nào khác nhỉ?',
        'Bé nghe nè, {word}, chữ {first}, giống các bạn kia! Bạn nào khác nhỉ?'],
      'wrong.sum': ['{expr} bằng {num}, giống các bạn kia! Thẻ nào khác?',
        '{expr} cũng bằng {num} giống các bạn nè. Mình đếm lại nhé!',
        'Mình cộng nhé: {expr} bằng {num}, giống các bạn kia! Thẻ nào khác nhỉ?'],
      'wrong.diff': ['{expr} bằng {num}, giống các bạn kia! Thẻ nào khác?',
        '{expr} cũng bằng {num} giống các bạn nè. Mình đếm lại nhé!',
        'Mình trừ nhé: {expr} bằng {num}, giống các bạn kia! Thẻ nào khác nhỉ?'],
      'wrong.parity': ['{num} là số {parity}, giống các bạn kia! Số nào khác nhỉ?',
        '{num} cũng là số {parity} giống các bạn nè. Số nào khác nhỉ?',
        'Ồ, {num} là số {parity} giống các bạn kia! Số nào không phải số {parity}?'],
      'wrong.hint': ['{thing} giống các bạn! Bé nhìn bạn đang sáng nè!', '{thing} giống các bạn rồi! Bé xem bàn tay nhỏ chỉ nè!',
        '{thing} giống các bạn kia! Bạn lấp lánh kìa!'],
      'wrong.any': ['Mình tìm lại nhé!', 'Bé tìm bạn khác các bạn kia nhé!', 'Bé nghĩ thêm chút nữa nhé!', 'Cố lên, bé làm được mà!'],

      'lantern': ['Bay lên nào, lên đèn hoa nhé!', 'Đèn hoa sáng lên rồi!', 'Lấp lánh! Thêm một ngọn đèn!'],
      'cheers': ['Cụng ly nào!', 'Cụng ly nào các bạn ơi!', 'Keng! Cụng ly nào!'],
      'garland': ['Tất cả đèn hoa đều sáng rồi!', 'Nhìn kìa, đèn hoa nào cũng lung linh!', 'Hoan hô! Cả dây đèn lấp lánh rồi!'],
      'surprise.ladybug': ['Nhìn kìa! Bạn bọ rùa nhỏ đến dự tiệc trà!', 'Rón rén, rón rén! Ai đó nhỉ?', 'Bạn bọ rùa muốn dự tiệc nè!'],
      'surprise.butterfly': ['Nhìn kìa! Một bạn bướm!', 'Chập chờn, chập chờn! Bạn bướm đến rồi!', 'Bạn bướm đến dự tiệc trà nè!'],
      'surprise.snail': ['Nhìn kìa! Bạn ốc sên đang ló ra!', 'Ai ở dưới gầm bàn thế nhỉ?', 'Bạn ốc sên nhỏ có cái ô lá nè!'],
      'surprise.fairies': ['Nhìn kìa! Thêm các bạn tiên nhỏ đến nhảy múa!', 'Lấp lánh, lấp lánh! Các bạn tiên nhỏ!',
        'Các bạn tiên nhỏ nhảy múa quanh đèn hoa nè!'],
      'critter.ladybug': ['Vù! Bọ rùa bay đi rồi!', 'Tạm biệt bọ rùa nhỏ!', 'Vù vù! Bọ rùa bay nè!'],
      'critter.butterfly': ['Bay bay, chập chờn!', 'Oa! Bướm bay vòng vòng!', 'Chào bạn bướm xinh!'],
      'critter.snail': ['Tưng! Chào ốc sên!', 'Ú òa! Ốc sên đây!', 'Ốc sên chào bé nè!'],
      'critter.fairies': ['Xoay tròn!', 'Lấp lánh, xoay vòng!', 'Lung linh quá!'],
      'moka.poke': ['Hi hi! Nhột quá!', 'Chào bé nè! Moka vui quá!', 'Chào bé! Bé uống trà với Moka không?'],

      'praise': ['Đúng rồi!', 'Giỏi quá!', 'Tuyệt vời!', 'Hoan hô!', 'Bé giỏi lắm!', 'Chính xác!', 'Hay quá!', 'Hay lắm!',
        'Đúng rồi, bé {child}!', 'Bé {child} giỏi quá!', 'Hoan hô bé {child}!'],
      'great': ['Bé {child} tìm giỏi quá!', 'Hoan hô bé {child}!', 'Mắt bé tinh quá!', 'Oa, bé {child} tìm siêu giỏi!',
        'Hoan hô! Thêm một đèn hoa!', 'Bé thông minh quá!', 'Tuyệt vời! Cụng ly nào!'],
      'party': ['Nhìn đèn hoa của mình nè!', 'Hoan hô! Tiệc trà vui quá!', 'Các bạn cùng nhảy múa nè!'],
      'hint': ['Nhìn nè! Bạn này đang sáng lên.', 'Bé xem bàn tay nhỏ chỉ nè!', 'Moka giúp bé nhé! Chạm vào bạn này nè!',
        'Nhìn kìa, bạn này lấp lánh!', 'Bạn lấp lánh đó! Bé chạm vào nhé!'],
      'idle': ['Moka đang chờ bé nè!', 'Mình tìm bạn khác các bạn kia nào!', 'Bé {child} ơi, mình chơi tiếp nhé!',
        'Trà sắp nguội rồi! Mình chơi tiếp nhé!', 'Bạn nào khác các bạn kia nhỉ?'],

      'talk.intro': 'Mình cùng nói chuyện nhé!',
      'talk.colors': 'Cái này màu gì nhỉ?',
      'talk.colorsAny': 'Cái này màu gì nhỉ?',
      'talk.colorsWhich': 'Cái nào {color} nhỉ?',
      'talk.shapes': 'Cái nào là {shape} nhỉ?',
      'talk.shapesAny': 'Cái này hình gì nhỉ?',
      'talk.shapes5': 'Cái nào là {shape} nhỉ?',
      'talk.size': 'Bạn nào {size} nhỉ?',
      'talk.sizeAny': 'Bạn nào nhỏ xíu nhỉ?',
      'talk.sizeWhich': 'Bạn nào {size} nhỉ?',
      'talk.count': 'Có mấy quả dâu nào?',
      'talk.countAny': 'Có bao nhiêu cái nào?',
      'talk.animals': '{animal} sống ở đâu nhỉ?',
      'talk.forest': '{animal} sống ở đâu nhỉ?',
      'talk.farm': '{animal} sống ở đâu nhỉ?',
      'talk.home': '{animal} sống ở đâu nhỉ?',
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
      'talk.wrong.size': 'Là bạn {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.letter': 'Là chữ {letter} đó! Bé cố gắng lắm!',
      'talk.wrong.small': 'Là chữ {letter} thường đó! Bé cố gắng lắm!',
      'talk.wrong.number': 'Là số {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.berries': 'Có {num} {berries} đó! Bé cố gắng lắm!',
      'talk.wrong.home': '{thing} sống {home} đó! Bé cố gắng lắm!',
      'talk.wrong.place': 'Bạn ấy sống {home} đó! Bé cố gắng lắm!',
      'talk.wrong.any': 'Bé cố gắng lắm! Mình chơi tiếp nhé!',

      'session.done': ['Tiệc trà vui quá! {stars} ngôi sao!', 'Bé {child} giỏi quá! {stars} ngôi sao!',
        'Đèn hoa sáng lung linh! {stars} ngôi sao!']
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
    'right.color': ['thing', 'rule'], 'right.shape': ['thing', 'rule'], 'right.size': ['thing', 'size', 'rule'],
    'right.animal': ['thing', 'rule'], 'right.home': ['thing', 'home'], 'right.letter': ['thing', 'rule'],
    'right.lower': ['thing', 'letter', 'lower'], 'right.initial': ['thing', 'word', 'first', 'letter'],
    'right.sum': ['expr', 'ans', 'num'], 'right.diff': ['expr', 'ans', 'num'], 'right.parity': ['num', 'parity', 'rule'],
    'countOthers': ['num'],
    'wrong.color': ['thing', 'rule'], 'wrong.shape': ['thing', 'rule'], 'wrong.size': ['thing', 'rule', 'size'],
    'wrong.n': ['num', 'berries'], 'wrong.animal': ['thing', 'rule'], 'wrong.home': ['thing'], 'wrong.letter': ['thing', 'rule'],
    'wrong.lower': ['thing', 'letter', 'lower'], 'wrong.initial': ['thing', 'word', 'first'], 'wrong.sum': ['expr', 'num'],
    'wrong.diff': ['expr', 'num'], 'wrong.parity': ['num', 'parity'], 'wrong.hint': ['thing'],
    'talk.colorsWhich': ['color'], 'talk.shapes': ['shape'], 'talk.shapes5': ['shape'], 'talk.size': ['size'], 'talk.sizeWhich': ['size'],
    'talk.animals': ['animal'], 'talk.forest': ['animal'], 'talk.farm': ['animal'], 'talk.home': ['animal'], 'talk.letters': ['letter'],
    'talk.lower': ['letter'], 'talk.initial': ['word'], 'talk.add': ['a', 'b'], 'talk.sub': ['a', 'b'],
    'talk.oddeven': ['parity'],
    'talk.wrong': ['answer'], 'talk.wrong.a': ['answer'], 'talk.wrong.animal': ['answer'], 'talk.wrong.size': ['answer'],
    'talk.wrong.letter': ['letter'], 'talk.wrong.small': ['letter'], 'talk.wrong.number': ['answer'],
    'talk.wrong.berries': ['num', 'berries'], 'talk.wrong.home': ['thing', 'home'], 'talk.wrong.place': ['home']
  };
  Object.keys(PROMPTS).forEach(function (k) { NEEDS[k] = PROMPTS[k]; NEEDS[k + '.first'] = PROMPTS[k]; });
  var FALLBACK = { 'p.shapes5': 'p.shapes', 'talk.colorsWhich': 'talk.colorsAny', 'talk.shapes': 'talk.shapesAny',
    'talk.shapes5': 'talk.shapesAny', 'talk.size': 'talk.sizeAny', 'talk.sizeWhich': 'talk.sizeAny', 'talk.animals': 'talk.homeAny',
    'talk.forest': 'talk.homeAny', 'talk.farm': 'talk.homeAny',
    'talk.home': 'talk.homeAny', 'talk.letters': 'talk.lettersAny', 'talk.lower': 'talk.lowerAny',
    'talk.initial': 'talk.initialAny', 'talk.add': 'talk.calc', 'talk.sub': 'talk.calc', 'talk.oddeven': 'talk.oddevenAny',
    'talk.wrong.home': 'talk.wrong.place', 'countOthers': 'praise', 'wrong.hint': 'hint' };
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
  function berries(lang, n) { return BERRY[L(lang)][n === 1 ? 0 : 1]; }
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
  var OBJ_ALIAS = { teacup: 'cup', 'tea cup': 'cup', 'tea pot': 'teapot', 'jam jar': 'jar', jamjar: 'jar', jam: 'jar', 'cup cake': 'cupcake' };
  function objOf(v) {
    if (v && typeof v === 'object') v = v.obj != null ? v.obj : rawVal(v);
    var s = low(v); if (OBJ_ALIAS[s]) s = OBJ_ALIAS[s];
    return OBJECTS.indexOf(s) >= 0 ? s : null;
  }
  function homeOf(v) { var s = low(v); if (s === 'woods') s = 'forest'; return NAMES.en.home[s] != null ? s : null; }
  function animalOf(v) {
    if (v && typeof v === 'object') v = v.animal != null ? v.animal : rawVal(v);
    var s = low(v).replace(/\.svg$/, '').replace(/^(guests|animals?)\//, '').replace(/_(hop|step)$/, '');
    if (s === 'fish' || s === 'fishbowl') s = 'goldfish';
    if (s === 'rabbit') s = 'bunny';
    return ANIMALS.indexOf(s) >= 0 ? s : null;
  }
  function sizeOf(v) {
    if (v === true) return 'big';
    if (v === false) return 'small';
    var s = low(v);
    if (s === 'big' || s === 'large') return 'big';
    if (s === 'small' || s === 'little') return 'small';
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
    // a capital "A" is only an article at a sentence start; a small "a" is a letter after letter / big / small
    return String(s).replace(/(^|[\s"“(])([Aa]) (?=[aeiou]|8\b|11\b|18\b)/g, function (m, pre, a, off, str) {
      var before = str.slice(0, off + pre.length);
      if (a === 'A' && !/(^|[.!?]\s*|["“(])$/.test(before)) return m;
      if (a === 'a' && /(letter|big|small)\s*$/i.test(before)) return m;
      return pre + a + 'n ';
    });
  }

  // ---------------------------------------------------------------- names
  function name(lang, kind, value) {
    lang = L(lang);
    value = rawVal(value);
    var vi = lang === 'vi', T = NAMES[lang], k;
    switch (kind) {
      case 'number': case 'n': case 'count': return num(value) != null ? numberName(lang, num(value)) : String(value == null ? '' : value);
      case 'berries': case 'apples': { var na = num(value); return na == null ? BERRY[lang][1] : numberName(lang, na) + ' ' + berries(lang, na); }
      case 'color': case 'hue': k = colorOf(value); return k ? T[kind][k] : String(value == null ? '' : value);
      case 'shape': case 'shapeH': k = shapeOf(value); return k ? T[kind][k] : String(value == null ? '' : value);
      case 'cookie': case 'block': k = shapeOf(value); return k ? (vi ? 'bánh quy ' + T.shapeH[k] : T.shape[k] + ' cookie') : (vi ? 'bánh quy' : 'cookie');
      case 'obj': case 'objWord': k = objOf(value); return k ? T[kind][k] : String(value == null ? '' : value);
      case 'plate': case 'crate': {
        var nc = num(value);
        if (nc == null) return vi ? 'đĩa dâu' : 'berry plate';
        return vi ? 'đĩa có ' + name(lang, 'berries', nc) : 'plate with ' + name(lang, 'berries', nc);
      }
      case 'guest': k = animalOf(value); return k ? T.animal[k] : String(value == null ? '' : value);
      case 'animal': case 'word': case 'who': k = animalOf(value); return k ? T[kind][k] : String(value == null ? '' : value);
      case 'home': case 'forest': case 'homeAt': k = homeOf(value); return k ? T[kind === 'forest' ? 'home' : kind][k] : String(value == null ? '' : value);
      case 'size': k = sizeOf(value); return k ? T.size[k] : String(value == null ? '' : value);
      case 'parity': k = parityOf(value); return num(value) != null ? numberName(lang, num(value)) : (k ? T.parity[k] : String(value == null ? '' : value));
      case 'letter': case 'lower': case 'initial': return String(value == null ? '' : value);
      case 'sum': case 'diff': return exprWords(lang, value);
      case 'text': case 'tile': case 'card': {
        var tx = String(value == null ? '' : value);
        if (splitOp(tx)) return exprWords(lang, tx);
        if (num(tx) != null) return numberName(lang, num(tx));
        return tx;
      }
    }
    if (T[kind] && value != null && T[kind][value] != null) return T[kind][value];
    return String(value == null ? '' : value).replace(/_/g, ' ');
  }

  // the bare noun for the initial-letter topic: no classifier ("con bò" → "bò"); things or (kind, value)
  function bareWord(lang, kind, value) {
    lang = L(lang);
    var t = (kind && typeof kind === 'object') ? kind : null;
    if (t && t.thing && typeof t.thing === 'object') t = t.thing;
    if (t) {
      if (animalOf(t.animal)) return NAMES[lang].word[animalOf(t.animal)];
      if (objOf(t.obj)) return NAMES[lang].objWord[objOf(t.obj)];
      if (t.nameKind != null && t.nameKind !== 'initial' && t.nameKind !== 'letter') return bareWord(lang, t.nameKind, t.nameValue);
      if (KIND_OF[low(t.kind)] === 'cookie' && shapeOf(t.shape)) return bareWord(lang, 'shape', t.shape);
      return t.word != null ? String(t.word) : '';
    }
    value = rawVal(value);
    if (objOf(value) && (kind === 'obj' || kind === 'objWord')) return NAMES[lang].objWord[objOf(value)];
    if ((kind === 'shape' || kind === 'block' || kind === 'cookie') && shapeOf(value)) return NAMES[lang].shape[shapeOf(value)].replace(/^hình /, '');
    if (kind === 'color' && colorOf(value)) return NAMES[lang].hue[colorOf(value)];
    if (animalOf(value)) return NAMES[lang].word[animalOf(value)];
    if (objOf(value)) return NAMES[lang].objWord[objOf(value)];
    return String(value == null ? '' : value);
  }
  // first letter of the bare noun, diacritics stripped to the base letter (ủng → U, đ → D)
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
    if (v >= 0 && v <= MAX_COUNT && v !== 0) addForms(out, [name(lang, 'berries', v), v + ' ' + berries(lang, v)]);
    if (lang === 'vi' && v >= 1 && v <= MAX_COUNT) addForms(out, [NUM.vi[v] + ' quả']);
    var alt = NUM_ALT[lang][v];
    if (alt) addForms(out, alt);
    return out;
  }
  function wordKind(k) {
    k = String(k == null ? '' : k);
    var A = { n: 'number', count: 'number', crate: 'number', plate: 'number', berries: 'number', forest: 'home', block: 'shape',
      cookie: 'shape', hue: 'color', colour: 'color', lower: 'letter', initial: 'letter', word: 'animal', guest: 'animal',
      tile: 'text', card: 'text', blob: 'color', paint: 'color', add: 'sum', sub: 'diff', objWord: 'obj' };
    return A[k] || k;
  }
  // a Talk-time choice / picture thing → [kind, value]
  function kvOf(c) {
    var t = obj(c);
    if (t.thing && typeof t.thing === 'object') t = t.thing;
    if (t.nameKind != null) return [wordKind(t.nameKind), rawVal(t.nameValue)];
    var tk = low(t.kind);
    if (tk === 'color' || tk === 'blob' || tk === 'paint') return ['color', t.color != null ? t.color : t.value];
    switch (KIND_OF[tk] || tk) {
      case 'number': return ['number', t.n != null ? t.n : t.value];
      case 'home': return ['home', t.home != null ? t.home : t.value];
      case 'size': return ['size', thingSize(t) || t.value];
      case 'obj':
        if (t.big === false) return ['size', 'small'];
        if (t.color != null) return ['color', t.color];
        if (t.big === true) return ['size', 'big'];
        return ['obj', t.obj];
      case 'cookie': return ['shape', t.shape != null ? t.shape : t.value];
      case 'plate': return ['number', t.n != null ? t.n : t.value];
      case 'card': case 'text': return ['text', t.text != null ? t.text : (t.n != null ? t.n : t.value)];
      case 'guest':
        if (t.big === false) return ['size', 'small'];
        return ['animal', t.animal != null ? t.animal : t.value];
      case 'letter': return ['letter', t.text != null ? t.text : t.value];
      case 'parity': return ['parity', t.value];
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
      case 'shape': k = shapeOf(value); return k ? addForms(out, [T.shape[k], T.shapeH[k], 'bánh quy ' + T.shapeH[k]].slice(0, lang === 'vi' ? 3 : 2).concat(W.shape[k])) : addForms(out, [String(value)]);
      case 'size': k = sizeOf(value); return k ? addForms(out, [T.size[k]].concat(W.size[k])) : addForms(out, [String(value)]);
      case 'obj': k = objOf(value); return k ? addForms(out, [T.obj[k], T.objWord[k]].concat(W.obj[k])) : addForms(out, [String(value)]);
      case 'animal': case 'who': k = animalOf(value); return k ? addForms(out, [T.animal[k], T.word[k], T.who[k]].concat(W.animal[k])) : addForms(out, [String(value)]);
      case 'home': case 'homeAt': k = homeOf(value); return k ? addForms(out, [T.home[k]].concat(W.home[k])) : addForms(out, [String(value)]);
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

  // ---------------------------------------------------------------- phrases: a member named for a sentence
  // thing = { kind obj|cookie|plate|card|guest (or a Talk icon color|number|home|size), color?, obj?, shape?, n?, animal?,
  //           home?, text?, big?, nameKind?, nameValue? }   (older kinds block|crate|tile|animal are mapped)
  // opts = { color: bool (obj default true, cookie default false), size: bool (default: only when little), art: 'the'|null }
  function memberKind(t) {
    var k = low(t.kind);
    if (KIND_OF[k]) return KIND_OF[k];
    if (['color', 'number', 'home', 'size', 'letter'].indexOf(k) >= 0) return k;
    if (t.animal != null) return 'guest';
    if (t.obj != null) return 'obj';
    if (t.shape != null) return 'cookie';
    if (t.text != null) return 'card';
    if (t.n != null) return 'plate';
    return null;
  }
  function phrase(lang, t, opts) {
    lang = L(lang);
    t = obj(t);
    if (t.thing && typeof t.thing === 'object') t = t.thing;
    opts = opts || {};
    var vi = lang === 'vi', T = NAMES[lang];
    var art = opts.art === undefined ? 'the' : opts.art;
    var k = memberKind(t);
    if (!k && t.nameKind != null) { t = thingFromName(t.nameKind, t.nameValue); k = t ? memberKind(t) : null; }
    if (!k) return '';
    var col = colorOf(t.color), sz = thingSize(t);
    var showSize = sz && (opts.size === true || (opts.size !== false && sz === 'small'));
    function en(s) { return anFix((art ? art + ' ' : '') + s); }
    switch (k) {
      case 'obj': case 'guest': {
        var o = k === 'obj' ? objOf(t.obj) : animalOf(t.animal);
        var useCol = col && (k === 'obj' ? opts.color !== false : opts.color === true);
        var noun = o ? T[opts.who && k === 'guest' ? 'who' : (k === 'obj' ? 'obj' : 'animal')][o] : (vi ? 'bạn' : 'one');
        if (vi) return noun + (showSize ? ' ' + T.size[sz] : '') + (useCol ? ' ' + T.color[col] : '');
        return en((showSize ? T.size[sz] + ' ' : '') + (useCol ? T.color[col] + ' ' : '') + noun);
      }
      case 'cookie': {
        var sh = shapeOf(t.shape), useC = col && opts.color === true;
        if (vi) return 'bánh quy' + (sh ? ' ' + T.shapeH[sh] : '') + (showSize ? ' ' + T.size[sz] : '') + (useC ? ' ' + T.color[col] : '');
        return en((showSize ? T.size[sz] + ' ' : '') + (useC ? T.color[col] + ' ' : '') + (sh ? T.shape[sh] + ' ' : '') + 'cookie');
      }
      case 'plate': {
        var n = num(t.n);
        if (n == null) return vi ? 'đĩa dâu' : en('berry plate');
        return vi ? 'đĩa có ' + name(lang, 'berries', n) : en('plate with ' + name(lang, 'berries', n));
      }
      case 'card': case 'letter': {
        // a place card: VI "thẻ chữ B" / "thẻ số bảy" (k === 'letter' is a Talk letter icon: "chữ B")
        var tx = t.text != null ? String(t.text) : (t.n != null ? String(t.n) : '');
        if (!tx) return '';
        var card = vi && k === 'card' ? 'thẻ ' : '';
        if (isLetter(tx)) {
          var small = tx !== tx.toUpperCase();
          return vi ? card + 'chữ ' + tx + (small ? ' thường' : '') : (small ? 'small ' : 'letter ') + tx;
        }
        if (splitOp(tx)) return exprText(tx);
        if (num(tx) != null) return vi ? card + 'số ' + numberName(lang, num(tx)) : 'number ' + numberName(lang, num(tx));
        return tx;
      }
      case 'color': return col ? T.color[col] : '';
      case 'number': { var nn = num(t.n != null ? t.n : t.value); return nn == null ? '' : numberName(lang, nn); }
      case 'home': { var h = homeOf(t.home != null ? t.home : t.value); return h ? (vi ? T.home[h] : en(T.home[h])) : ''; }
      case 'size': return sz ? (vi ? 'bạn ' + T.size[sz] : en(T.size[sz] + ' one')) : '';
    }
    return '';
  }
  // a member thing rebuilt from {nameKind, nameValue} (when main did not pass e.thing)
  function thingFromName(nk, nv) {
    nk = String(nk == null ? '' : nk);
    nv = rawVal(nv);
    switch (nk) {
      case 'color': return { kind: 'obj', color: nv };
      case 'shape': return { kind: 'cookie', shape: nv };
      case 'size': return { kind: 'obj', big: sizeOf(nv) !== 'small' };
      case 'n': case 'number': case 'count': return { kind: 'plate', n: num(nv) };
      case 'animal': case 'guest': case 'home': case 'forest': case 'word':
        if (animalOf(nv)) return { kind: 'guest', animal: animalOf(nv) };
        if (objOf(nv)) return { kind: 'obj', obj: objOf(nv) };
        return null;
      case 'obj': return { kind: 'obj', obj: nv };
      case 'initial':
        if (animalOf(nv)) return { kind: 'guest', animal: animalOf(nv) };
        if (objOf(nv)) return { kind: 'obj', obj: objOf(nv) };
        return isLetter(String(nv)) ? { kind: 'card', text: String(nv) } : null;
      case 'letter': case 'lower': case 'text': case 'sum': case 'diff': return { kind: 'card', text: String(nv) };
      case 'parity': return num(nv) != null ? { kind: 'card', text: String(num(nv)), n: num(nv) } : null;
    }
    return null;
  }

  // ---------------------------------------------------------------- t()
  var I18N = { langs: LANGS.slice(), child: '' };

  function isTalkHome(key) { return /^talk\.(animals|forest|farm|home)$/.test(key); }
  // raw params → named strings (pre-named strings pass through untouched)
  function derive(lang, params, key) {
    var p = {}, k, vi = lang === 'vi';
    if (params && typeof params === 'object') for (k in params) if (Object.prototype.hasOwnProperty.call(params, k)) p[k] = params[k];
    key = key || '';
    if (present(p.color)) p.color = name(lang, 'color', p.color);
    if (present(p.shape)) p.shape = name(lang, vi ? 'shapeH' : 'shape', p.shape);
    if (present(p.size) || p.big === true || p.big === false) p.size = name(lang, 'size', present(p.size) ? p.size : p.big);
    if (present(p.parity)) p.parity = name(lang, 'parity', parityOf(rawVal(p.parity)) || p.parity);
    if (present(p.home)) p.home = name(lang, 'homeAt', p.home);
    if (present(p.animal)) {
      var an = animalOf(p.animal);
      if (an && !present(p.word)) p.word = NAMES[lang].word[an];
      p.animal = an ? NAMES[lang][isTalkHome(key) ? 'who' : 'animal'][an] : String(rawVal(p.animal));
    }
    // talk.initial {letter, nameKind, nameValue}: the word comes from the shown thing (never say the letter = the answer)
    if (!present(p.word) && p.nameValue != null && (animalOf(p.nameValue) || objOf(p.nameValue))) p.word = bareWord(lang, p.nameKind || null, p.nameValue);
    if (present(p.word) && animalOf(p.word)) p.word = NAMES[lang].word[animalOf(p.word)];
    else if (present(p.word) && objOf(p.word)) p.word = NAMES[lang].objWord[objOf(p.word)];
    if (present(p.letter)) {
      p.letter = String(rawVal(p.letter));
      if (/^(p|talk)\.lower/.test(key)) { if (!present(p.lower)) p.lower = p.letter.toLowerCase(); p.letter = p.letter.toUpperCase(); }
      else if (!present(p.lower)) p.lower = p.letter.toLowerCase();
    }
    if (present(p.lower)) p.lower = String(rawVal(p.lower));
    var c = present(p.n) ? num(p.n) : null;
    if (!present(p.num) && c != null) p.num = numberName(lang, c);
    if (!present(p.berries)) p.berries = berries(lang, c == null ? 2 : c);
    if (present(p.a)) p.a = String(rawVal(p.a));
    if (present(p.b)) p.b = String(rawVal(p.b));
    if (present(p.expr)) p.expr = exprText(rawVal(p.expr));
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
      else if (CHILD_SHARE[key] != null && withChild.length) pool = !noChild.length || rnd(rng) < CHILD_SHARE[key] ? withChild : noChild;
      v = pool[Math.min(pool.length - 1, Math.floor(rnd(rng) * pool.length))];
    }
    return fill(lang, v, p, child);
  };

  // the table question; opts.first → the long first-time form ("They’re all red… but one! Which one is NOT red?")
  I18N.ask = function (lang, key, params, opts) {
    opts = opts || {};
    lang = L(lang);
    key = String(key == null ? '' : key);
    if (opts.first && STR[lang][key + '.first'] != null) {
      var p = derive(lang, params, key);
      if (needsMet(key + '.first', p)) return I18N.t(lang, key + '.first', params, opts.rng);
    }
    return I18N.t(lang, key, params, opts.rng);
  };

  // ---------------------------------------------------------------- game lines
  var KIND_ALIAS = { colour: 'color', count: 'n', number: 'n', forest: 'home', add: 'sum', sub: 'diff', oddeven: 'parity', guest: 'animal',
    letters: 'letter', animals: 'animal', shapes: 'shape', colors: 'color' };
  function ruleKind(k) { k = low(k); k = KIND_ALIAS[k] || k; return RULE_KINDS.indexOf(k) >= 0 ? k : null; }
  function kindFromTopic(topic, pk) {
    pk = String(pk || '');
    if (pk === 'p.forest' || pk === 'p.forest.first') return 'home';
    if (pk === 'p.animal') return 'animal';
    var m = /^p\.(\w+?)(5)?(\.first)?$/.exec(pk);
    var tp = topic || (m ? m[1] : null);
    switch (tp) {
      case 'colors': return 'color';
      case 'shapes': return 'shape';
      case 'size': return 'size';
      case 'count': return 'n';
      case 'animals': case 'animal': return 'animal';
      case 'forest': return 'home';
      case 'letters': return 'letter';
      case 'lower': return 'lower';
      case 'initial': return 'initial';
      case 'add': return 'sum';
      case 'sub': return 'diff';
      case 'oddeven': return 'parity';
    }
    return null;
  }
  // what the majority shares: e.rule | e.want ({kind, value} or {nameKind, nameValue}) | topic + params
  function ruleOf(ev) {
    var r = obj(ev.rule);
    if (r.kind == null && r.nameKind == null) r = obj(ev.want);
    var kind = ruleKind(r.kind != null ? r.kind : r.nameKind) || kindFromTopic(ev.topic, ev.promptKey);
    if (kind === 'letter' && (ev.topic === 'lower' || /^p\.lower/.test(String(ev.promptKey || '')))) kind = 'lower';
    var value = r.value != null ? r.value : r.nameValue;
    var p = obj(ev.params);
    if (value == null) {
      switch (kind) {
        case 'color': value = p.color; break;
        case 'shape': value = p.shape; break;
        case 'animal': value = p.animal; break;
        case 'n': case 'sum': case 'diff': value = p.n; break;
        case 'letter': case 'lower': case 'initial': value = p.letter; break;
        case 'parity': value = p.parity; break;
        case 'size': value = 'big'; break;
        case 'home': value = 'forest'; break;
      }
    }
    return { kind: kind, value: rawVal(value) };
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
  function tileText(t) { return t.text != null ? String(t.text) : (t.n != null ? String(t.n) : (t.nameValue != null ? String(t.nameValue) : '')); }
  function tileNumber(t) {
    if (KIND_OF[low(t.kind)] === 'plate') return num(t.n);
    var tx = tileText(t);
    if (splitOp(tx)) return exprValue(tx);
    return num(t.n) != null ? num(t.n) : num(tx);
  }
  function ruleName(lang, r) {
    var vi = lang === 'vi';
    switch (r.kind) {
      case 'color': return name(lang, 'color', r.value);
      case 'shape': return name(lang, vi ? 'shapeH' : 'shape', r.value);
      case 'animal': return animalOf(r.value) ? NAMES[lang].animal[animalOf(r.value)] : '';
      case 'size': return name(lang, 'size', r.value);
      case 'letter': return r.value != null && r.value !== '' ? (vi ? 'chữ ' : 'letter ') + String(r.value) : '';
      case 'parity': return parityOf(r.value) ? NAMES[lang].parity[parityOf(r.value)] : '';
    }
    return r.value == null ? '' : String(r.value);
  }
  function homeOfThing(ev, t) {
    return homeOf(ev.home) || homeOf(t.home) || (animalOf(t.animal) ? ANIMAL_HOME[animalOf(t.animal)] : null);
  }
  function letterParams(r, t) {
    var L0 = r.value != null && r.value !== '' ? String(r.value) : tileText(t);
    return { letter: L0.toUpperCase(), lower: L0.toLowerCase() };
  }

  // `right {id, thing, x, y, count?: {n}, home?}` (+ topic, promptKey, params, rule) → names the odd one and why.
  I18N.sayRight = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var t = obj(evThing(ev)), r = ruleOf(ev), p = null, key = 'right.' + r.kind;
    switch (r.kind) {
      case 'n': {
        var n = num(obj(ev.count).n);
        if (n == null) n = num(t.n);
        if (n == null) return I18N.t(lang, 'right.any', null, rng);
        return I18N.sayCountRun(lang, n, num(r.value) != null ? num(r.value) : (num(ev.othersN) != null ? num(ev.othersN) : null));
      }
      case 'color': p = { thing: phrase(lang, t, { color: true, size: false }), rule: ruleName(lang, r) }; break;
      case 'shape': p = { thing: phrase(lang, t, { color: false, size: false }), rule: ruleName(lang, r) }; break;
      case 'size': {
        var osz = thingSize(t) || (sizeOf(r.value) === 'small' ? 'big' : 'small');
        var maj = sizeOf(r.value) || (osz === 'small' ? 'big' : 'small');
        p = { thing: phrase(lang, t, { size: false, color: false }), size: NAMES[lang].size[osz], rule: NAMES[lang].size[maj] };
        break;
      }
      case 'animal': p = { thing: phrase(lang, t, { size: false }), rule: ruleName(lang, r) }; break;
      case 'home': {
        var h = homeOfThing(ev, t);
        p = { thing: phrase(lang, t, { who: true, size: false }), home: h ? NAMES[lang].homeAt[h] : '' };
        break;
      }
      case 'letter': p = { thing: phrase(lang, t), rule: ruleName(lang, r) }; break;
      case 'lower': { var lp = letterParams(r, {}); p = { thing: phrase(lang, t), letter: lp.letter, lower: lp.lower }; break; }
      case 'initial': {
        var w = bareWord(lang, t);
        p = { thing: phrase(lang, t, { size: false, color: false }), word: w, first: w ? initial(lang, t) : '', letter: r.value != null ? String(r.value).toUpperCase() : '' };
        break;
      }
      case 'sum': case 'diff': {
        var tx = tileText(t), v = tileNumber(t);
        p = { expr: splitOp(tx) ? exprText(tx) : '', ans: v != null ? numberName(lang, v) : '', num: num(r.value) != null ? numberName(lang, num(r.value)) : '' };
        break;
      }
      case 'parity': {
        var pv = tileNumber(t), maj2 = parityOf(r.value);
        var op = pv != null ? parityOf(pv) : (maj2 === 'odd' ? 'even' : 'odd');
        if (!maj2 && op) maj2 = op === 'odd' ? 'even' : 'odd';
        p = { num: pv != null ? numberName(lang, pv) : '', parity: op ? NAMES[lang].parity[op] : '', rule: maj2 ? NAMES[lang].parity[maj2] : '' };
        break;
      }
      default: return I18N.t(lang, 'right.any', null, rng);
    }
    return I18N.t(lang, key, p, rng);
  };

  // `wrong {id, got:{nameKind,nameValue}, want:{rule}, streak, x, y}` (+ thing = the tapped member's thing, topic,
  // promptKey, params, rule) → names what was tapped + that it matches its friends, then the goal.
  I18N.sayWrong = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var t = obj(evThing(ev)), r = ruleOf(ev), p = null, key = 'wrong.' + r.kind;
    switch (r.kind) {
      case 'color': p = { thing: phrase(lang, t, { color: false, size: false }), rule: ruleName(lang, r) }; break;
      case 'shape': p = { thing: phrase(lang, t, { color: false, size: false }), rule: ruleName(lang, r) }; break;
      case 'size': {
        var maj = sizeOf(r.value) || thingSize(t) || 'big';
        p = { thing: phrase(lang, t, { size: false, color: false }), rule: NAMES[lang].size[maj],
          size: NAMES[lang].size[maj === 'big' ? 'small' : 'big'] };
        break;
      }
      case 'n': {
        var n = num(t.n) != null ? num(t.n) : num(r.value);
        p = n != null ? { num: numberName(lang, n), berries: berries(lang, n) } : {};
        break;
      }
      case 'animal': p = { thing: phrase(lang, t, { size: false }), rule: ruleName(lang, r) }; break;
      case 'home': p = { thing: phrase(lang, t, { who: true, size: false }) }; break;
      case 'letter': p = { thing: phrase(lang, t), rule: ruleName(lang, r) }; break;
      case 'lower': { var lp = letterParams(r, t); p = { thing: phrase(lang, t), letter: lp.letter, lower: lp.lower }; break; }
      case 'initial': {
        var w = bareWord(lang, t);
        p = { thing: phrase(lang, t, { size: false, color: false }), word: w, first: w ? initial(lang, t) : '' };
        break;
      }
      case 'sum': case 'diff': {
        var tx = tileText(t), v = tileNumber(t);
        if (v == null) v = num(r.value);
        p = { expr: splitOp(tx) ? exprText(tx) : '', num: v != null ? numberName(lang, v) : '' };
        break;
      }
      case 'parity': {
        var pv = tileNumber(t), pp = pv != null ? parityOf(pv) : parityOf(r.value);
        p = { num: pv != null ? numberName(lang, pv) : '', parity: pp ? NAMES[lang].parity[pp] : '' };
        break;
      }
      default: return I18N.t(lang, 'wrong.any', null, rng);
    }
    return I18N.t(lang, key, p, rng);
  };

  // The miss that triggers the hint: ONE short line — the tapped thing matches its friends + look at the glowing one
  I18N.sayWrongHint = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var t = obj(evThing(ev)), k = KIND_OF[low(t.kind)] || low(t.kind), th = '';
    try { th = k === 'plate' ? '' : phrase(lang, t, { color: false, size: false }); } catch (e) { th = ''; }
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
  // "One, two, three, four berries! The others have two." / "Một, hai, ba, bốn quả dâu! Các đĩa kia có hai quả."
  I18N.sayCountRun = function (lang, n, othersN) {
    lang = L(lang);
    var c = num(n);
    if (c == null || c < 1) return c === 0 ? I18N.sayCount(lang, 0) : I18N.t(lang, 'praise');
    var list = [];
    for (var i = 1; i <= c; i++) list.push(numberName(lang, i));
    var line = capFirst(list.join(', ') + ' ' + berries(lang, c)) + '!';
    var o = num(othersN);
    if (o != null && o !== c) line += ' ' + I18N.t(lang, 'countOthers', { num: numberName(lang, o) });
    return line;
  };

  // a member's plain name: sayName(lang, thing | e) → "the blue cup" / "cái tách màu xanh dương"
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
    var vi = lang === 'vi';
    switch (kind) {
      case 'color': return colorOf(value) ? I18N.t(lang, 'talk.wrong', { answer: name(lang, 'color', value) }) : I18N.t(lang, 'talk.wrong.any');
      case 'shape': return shapeOf(value) ? I18N.t(lang, 'talk.wrong.a', { answer: name(lang, vi ? 'shapeH' : 'shape', value) }) : I18N.t(lang, 'talk.wrong.any');
      case 'size': return sizeOf(value) ? I18N.t(lang, 'talk.wrong.size', { answer: name(lang, 'size', value) }) : I18N.t(lang, 'talk.wrong.any');
      case 'animal': return animalOf(value) ? I18N.t(lang, 'talk.wrong.animal', { answer: NAMES[lang].animal[animalOf(value)] }) : I18N.t(lang, 'talk.wrong.any');
      case 'home': {
        var h = homeOf(value);
        if (!h) return I18N.t(lang, 'talk.wrong.any');
        var a = animalOf(obj(ctx.show).animal) || animalOf(obj(ctx.params).animal) || animalOf(ctx.animal);
        if (a) return I18N.t(lang, 'talk.wrong.home', { thing: phrase(lang, { kind: 'guest', animal: a }, { who: true }), home: NAMES[lang].homeAt[h] });
        return I18N.t(lang, 'talk.wrong.place', { home: NAMES[lang].homeAt[h] });
      }
      case 'letter': { var lv = String(value); return I18N.t(lang, lv !== lv.toUpperCase() ? 'talk.wrong.small' : 'talk.wrong.letter', { letter: lv }); }
      case 'number': {
        var n = num(value);
        if (n == null) return I18N.t(lang, 'talk.wrong.any');
        if (ctx.topic === 'count' || /count/.test(String(ctx.promptKey || ''))) return I18N.t(lang, 'talk.wrong.berries', { num: numberName(lang, n), berries: berries(lang, n) });
        return I18N.t(lang, 'talk.wrong.number', { answer: numberName(lang, n) });
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
      case 'obj': return objOf(value) ? I18N.t(lang, 'talk.wrong.animal', { answer: NAMES[lang].obj[objOf(value)] }) : I18N.t(lang, 'talk.wrong.any');
    }
    return I18N.t(lang, 'talk.wrong.any');
  };

  // Text → TTS-friendly text (Voice.say calls this). Display text stays untouched. "Moka" is read as written.
  var VI_UP = 'A-ZĂÂĐÊÔƠƯ', VI_LO = 'a-zăâđêôơư';
  var RE_VI_LETTER = new RegExp('(chữ|Chữ) ([' + VI_UP + VI_LO + '])(?![\\p{L}\\p{N}])', 'gu');
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
  I18N.OBJECTS = OBJECTS.slice();
  I18N.ANIMALS = ANIMALS.slice();
  I18N.GUESTS = ANIMALS.slice();
  I18N.HOMES = HOMES.slice();
  I18N.ANIMAL_HOME = ANIMAL_HOME;
  I18N.RULE_KINDS = RULE_KINDS.slice();
  I18N.MEMBER_KINDS = MEMBER_KINDS.slice();
  I18N.PROMPTS = PROMPTS;
  I18N.PARAMS = NEEDS;
  I18N.NAME_TABLE = NAMES;
  I18N.LETTER_VI = LETTER_VI;
  I18N.MAX_COUNT = MAX_COUNT;

  FT.I18N = I18N;
})(window.FT = window.FT || {});
