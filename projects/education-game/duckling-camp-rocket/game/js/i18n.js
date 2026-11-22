/* Mimi's Splash Rocket — DK.I18N (English + Vietnamese). Mimi (EN "Mimi", VI titles "Vịt Mimi", VI lines "Mimi") is a
 * cheerful fluffy duckling camping in the mountains with her water-bottle rocket. Each LAUNCH has 2–3 picnic mats with ONE
 * right mat (a thing on it: a coloured flower / mushroom / ball / mug / lantern, a shape, a wooden sign with pinecones, a
 * letter / number sign, an animal); the child taps it, pumps ×3 ("One! Two! Three! Blast off!"), the rocket flies, pops its
 * parachute and lands; the thing becomes a pennant on the camp flagpole. "Mimi" is spoken as written (no TTS rewrite).
 *
 *   DK.I18N.t(lang, key, params?, rng?)               → string (a random variant; rng.next() / rng() / Math.random)
 *   DK.I18N.ask(lang, promptKey, params, {first, rng}) → the question (once per round, before launch 0);
 *       first:true → the chapter's first-round form ("Let's launch the rocket! Land on the RED one!")
 *   DK.I18N.sayNext(lang, e, rng?)    → the reminder before launch j ≥ 1 ("Next one: red!", countSeq "Now 2!")
 *   DK.I18N.sayRight(lang, e, rng?)   → names the thing + "Now pump!" ("A red mug! Now pump!")
 *   DK.I18N.sayPump(lang, n, from?)   → "One!", "Two!", "Three! Blast off!"; from < n merges: "Two, three! Blast off!"
 *   DK.I18N.sayPennant(lang, e, rng?) → the thing going up the flagpole ("The red mug on the flagpole!")
 *   DK.I18N.sayCountUp(lang, n, kind) → "One, two, three, four! Four pinecones!" (kind 'pinecones' | 'flags' | 'mats')
 *   DK.I18N.sayCamp(lang, n, rng?)    → "All our flags! One, two, three! Three flags!"
 *   DK.I18N.sayWrong / sayWrongHint / sayName / sayCount / sayCountRun / talkWrong / countList / seqList / seqThen
 *   DK.I18N.name(lang, kind, value)   → kinds: color (vi "màu đỏ"), hue (bare "đỏ"), shape, shapes, obj (flower mushroom
 *       ball mug lantern → "bông hoa", "cây nấm", "quả bóng", "cái cốc", "chiếc đèn lồng"), objWord (bare noun), thing,
 *       dots / pinecones (n → "4 pinecones" / "4 quả thông"), animal, word, who, home, homeAt, lives, number / n, letter,
 *       sum, diff, parity, size, mood / weather / season (0..3 | sunny…), surprise (marmot goat bird), text / tile
 *   DK.I18N.words(lang, kind, value)  → accepted spoken forms (lower-case, + no-diacritic forms, digits)
 *   DK.I18N.choiceWords(lang, choice) → spoken forms of a Talk choice {id, thing}
 *   DK.I18N.initial / bareWord / initialOf / phrase / speech / setChild …
 *
 * Event `e` = the world event (right {thing, launch, k, left, home?, count?}, wrong {got, want, streak}, next {launch,
 * left}, pennant {thing, slot}) + {topic, promptKey, params, rule, mode} from main (round.rule = what the targets share
 * {kind, value}; mode 'match' | 'countSeq' | 'countSel'). countSeq: the number of a launch is e.need | e.count |
 * e.launch + 1 | e.row + 1 (never params.n: that is k). `row` is still accepted as an alias of `launch`.
 * {child}: with an empty name, variants containing {child} are skipped ("bé {child}" → "bé", ", {child}!" → "!").
 * Never negative: no "wrong", "no", "sai", "không đúng" … (tested).
 */
(function (DK) {
  'use strict';

  var LANGS = ['en', 'vi'];
  var COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'oval', 'rect', 'diamond'];
  var OBJS = ['flower', 'mushroom', 'ball', 'mug', 'lantern'];
  var ANIMALS = ['cow', 'pig', 'sheep', 'duck', 'hen', 'horse', 'goat', 'crab', 'penguin', 'lion', 'monkey', 'fishbowl'];
  var HOMES = ['farm', 'sea', 'ice', 'savanna', 'jungle'];
  var ANIMAL_HOME = { cow: 'farm', pig: 'farm', sheep: 'farm', duck: 'farm', hen: 'farm', horse: 'farm', goat: 'farm',
    crab: 'sea', fishbowl: 'sea', penguin: 'ice', lion: 'savanna', monkey: 'jungle' };
  var MOODS = ['sunny', 'breezy', 'rain', 'rainbow'];        // weather 0..3 (= level % 4)
  var SURPRISES = ['marmot', 'goat', 'bird'];
  var TOPICS = ['colors', 'shapes', 'size', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
  var RULE_KINDS = ['color', 'shape', 'size', 'seq', 'n', 'animal', 'home', 'letter', 'lower', 'initial', 'sum', 'diff', 'parity'];
  var THING_KINDS = ['obj', 'shape', 'dots', 'tile', 'animal'];
  var PUMP_COUNT = 3;
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
  NAMES.en.obj = { flower: 'flower', mushroom: 'mushroom', ball: 'ball', mug: 'mug', lantern: 'lantern' };
  NAMES.vi.obj = { flower: 'bông hoa', mushroom: 'cây nấm', ball: 'quả bóng', mug: 'cái cốc', lantern: 'chiếc đèn lồng' };
  NAMES.en.objWord = NAMES.en.obj;
  NAMES.vi.objWord = { flower: 'hoa', mushroom: 'nấm', ball: 'bóng', mug: 'cốc', lantern: 'đèn lồng' };
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
  NAMES.en.mood = { sunny: 'sunny', breezy: 'windy', rain: 'rainy', rainbow: 'rainbow' };
  NAMES.vi.mood = { sunny: 'trời nắng', breezy: 'trời gió', rain: 'trời mưa', rainbow: 'cầu vồng' };
  // the camp surprises (the goat is also an answer animal: name kind 'animal' keeps "goat" / "con dê")
  NAMES.en.surprise = { marmot: 'marmot', goat: 'mountain goat', bird: 'little bird' };
  NAMES.vi.surprise = { marmot: 'bạn sóc đất', goat: 'bạn dê núi', bird: 'bạn chim nhỏ' };
  // counted nouns: pinecones on a sign, pennants (flags) on the pole, picnic mats
  var NOUN = { en: { dot: ['pinecone', 'pinecones'], flag: ['flag', 'flags'], mat: ['mat', 'mats'] },
    vi: { dot: ['quả thông', 'quả thông'], flag: ['lá cờ', 'lá cờ'], mat: ['tấm thảm', 'tấm thảm'] } };

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
      obj: { flower: ['flower', 'flowers', 'daisy'], mushroom: ['mushroom', 'mushrooms', 'toadstool'],
        ball: ['ball', 'balls', 'bouncy ball'], mug: ['mug', 'mugs', 'cup', 'cups', 'camping mug'],
        lantern: ['lantern', 'lanterns', 'lamp', 'camping lantern', 'light'] },
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
      mood: { sunny: ['sunny', 'sun', 'sunshine'], breezy: ['windy', 'breezy', 'wind'], rain: ['rainy', 'rain', 'raining'],
        rainbow: ['rainbow', 'rainbows'] },
      surprise: { marmot: ['marmot', 'marmots', 'groundhog', 'woodchuck'], goat: ['mountain goat', 'goat', 'goats'],
        bird: ['bird', 'birdie', 'little bird', 'birds'] }
    },
    vi: {
      color: { red: ['đỏ', 'màu đỏ'], blue: ['xanh dương', 'xanh da trời', 'xanh nước biển', 'xanh lam', 'da trời', 'dương'],
        yellow: ['vàng', 'màu vàng'], green: ['xanh lá', 'xanh lá cây', 'xanh lục', 'lá cây'], orange: ['cam', 'màu cam'],
        purple: ['tím', 'màu tím'], pink: ['hồng', 'màu hồng'] },
      shape: { circle: ['hình tròn', 'tròn'], square: ['hình vuông', 'vuông'], triangle: ['tam giác', 'hình tam giác'],
        star: ['ngôi sao', 'sao', 'hình ngôi sao', 'hình sao'], heart: ['trái tim', 'tim', 'hình trái tim', 'hình tim'],
        rect: ['chữ nhật', 'hình chữ nhật'], oval: ['bầu dục', 'hình bầu dục'], diamond: ['hình thoi', 'thoi'] },
      size: { big: ['to', 'lớn', 'bự', 'to lắm', 'to hơn', 'to nhất'], small: ['nhỏ', 'bé', 'nhỏ xíu', 'nhỏ hơn', 'tí hon', 'nhỏ nhất'] },
      obj: { flower: ['bông hoa', 'hoa', 'đóa hoa', 'cái hoa', 'hoa nhỏ'], mushroom: ['cây nấm', 'nấm', 'cái nấm'],
        ball: ['quả bóng', 'bóng', 'trái bóng', 'quả banh', 'trái banh', 'banh'],
        mug: ['cái cốc', 'cốc', 'cái ly', 'ly', 'cái tách', 'tách', 'cốc cắm trại'],
        lantern: ['chiếc đèn lồng', 'đèn lồng', 'cái đèn', 'đèn', 'lồng đèn', 'đèn bão'] },
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
      mood: { sunny: ['trời nắng', 'nắng', 'nắng đẹp'], breezy: ['trời gió', 'gió', 'lộng gió'], rain: ['trời mưa', 'mưa'],
        rainbow: ['cầu vồng', 'cái cầu vồng'] },
      surprise: { marmot: ['bạn sóc đất', 'sóc đất', 'con sóc', 'sóc', 'mác mốt', 'marmot'], goat: ['bạn dê núi', 'dê núi', 'con dê', 'dê'],
        bird: ['bạn chim nhỏ', 'chim nhỏ', 'con chim', 'chim', 'chim non'] }
    }
  };

  // ---------------------------------------------------------------- strings
  // prompt keys content.js asks with (DESIGN §5.1 / §6) and their REQUIRED (derived) params
  var PROMPTS = {
    'p.colors': ['color'], 'p.shapes': ['shape'], 'p.shapes5': ['shape'], 'p.size': ['size'], 'p.countSeq': ['seq'],
    'p.countSel': ['n'], 'p.animal': ['animal'], 'p.home': ['home'], 'p.letters': ['letter'], 'p.lower': ['letter'],
    'p.initial': ['letter'], 'p.add': ['n'], 'p.sub': ['n'], 'p.oddeven': ['parity']
  };

  var STR = {
    en: {
      'ui.title': 'Mimi’s Splash Rocket',
      'ui.logo1': 'Mimi’s',
      'ui.logo2': 'Splash Rocket',
      'ui.subtitle': 'Pump, launch and land the water rocket!',
      'ui.tagline': 'Pump, launch and land the water rocket!',
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
      'ui.voice': 'Mimi’s voice',
      'ui.mic': 'Answer by talking',
      'ui.done': 'Done',
      'ui.stars': 'Stars',
      'ui.chapter': 'Chapter {n}',
      'ui.allDone': 'All done! {stars} stars',
      'ui.welcome': ['Hi {child}! I am Mimi. Let’s launch my water rocket!', 'Hi! I am Mimi. Let’s launch my water rocket!'],
      'ui.micUnsupported': 'Voice answers are not available here. Tap the pictures!',
      'ui.micDenied': 'The microphone is off. Tap the pictures instead!',
      'ui.voiceMissing': 'Tip for parents: add a voice in Settings › Accessibility › Spoken Content › Voices.',
      'ui.tapOrSay': 'Tap or say the answer!',
      'ui.listening': 'Mimi is listening…',
      'ui.tapMimi': 'Tap Mimi to hear it again',
      'ui.tapHint': 'Tap the right picnic mat',
      'ui.pumpHint': 'Tap anywhere to pump!',
      'ui.doorHint': 'Fly the rocket to the mat',
      'ui.skip': 'Skip',
      'ui.gallery': 'Our flags',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Colour Landing',
      'topic.shapes': 'Shape Landing',
      'topic.size': 'Big and Little',
      'topic.count': 'Pinecone Counting',
      'topic.animals': 'Animal Homes',
      'topic.letters': 'Letter Landing',
      'topic.lower': 'Big and Small Letters',
      'topic.initial': 'First Letters',
      'topic.add': 'Adding Up',
      'topic.sub': 'Take Away',
      'topic.oddeven': 'Odd and Even',

      'weather.0': ['A sunny day at camp!', 'A sunny day at camp! Look, butterflies!'],
      'weather.1': ['Whoosh, it’s windy!', 'Whoosh, it’s windy! The wind pushes the parachute!'],
      'weather.2': ['Pitter-patter, rain! Ducks love rain!', 'Pitter-patter, rain! Splish, splash!'],
      'weather.3': ['Look, a rainbow!', 'Look, a rainbow over the mountains!'],

      'unfold': ['Look, picnic mats!', 'Flap, flap! Here come the mats!', 'Out come the picnic mats!'],
      'wipe': ['Swoosh! New mats!', 'Here comes a new launch!', 'Look, new picnic mats!'],

      'p.any': ['Land on a mat!', 'Which mat will the rocket land on?', 'Find a mat and launch!'],
      'p.colors': ['Land on the {color} one!', 'Where is the {color} one? Fly there!', 'Find the {color} one and launch!'],
      'p.colors.first': ['Let’s launch the rocket! Land on the {COLOR} one!'],
      'p.shapes': ['Land on the {shape}!', 'Where is the {shape}? Fly there!', 'Find the {shape} and launch!'],
      'p.shapes.first': ['Let’s launch the rocket! Land on the {shape}!'],
      'p.shapes5': ['Look at the shape, any colour! Land on the {shape}!', 'Any colour is fine! Find the {shape} and launch!',
        'So many colours! Where is the {shape}? Fly there!'],
      'p.shapes5.first': ['Let’s launch the rocket! Lots of colours… but look at the shape! Land on the {shape}!'],
      'p.size': ['Land on the {size} one!', 'Where is the {size} one? Fly there!', 'Find the {size} one and launch!'],
      'p.size.first': ['Let’s launch the rocket! Big ones and little ones! Land on the {size} one!'],
      'p.countSeq': ['Land on {seqThen}!', 'Count with me and fly: {seqThen}!', 'Land in order: {seqThen}!'],
      'p.countSeq.first': ['Let’s launch the rocket! Count with me: land on {seqThen}!'],
      'p.countSel': ['Land on the sign with {n} {dotWord}!', 'Count the pinecones! Find {n} {dotWord} and launch!',
        'Which sign has {n} {dotWord}? Fly there!'],
      'p.countSel.first': ['Let’s launch the rocket! Count the pinecones on each sign! Land on the sign with {n} {dotWord}!'],
      'p.animal': ['Fly to the {animal}!', 'Where is the {animal}? Land there!', 'Find the {animal} and launch!'],
      'p.animal.first': ['Let’s launch the rocket! Look at the animals! Fly to the {animal}!'],
      'p.home': ['Who lives {home}? Land there!', 'Fly to the one who lives {home}!', 'Find who lives {home} and launch!'],
      'p.home.first': ['Let’s launch the rocket! Who lives {home}? Land there!'],
      'p.letters': ['Land on letter {letter}!', 'Where is letter {letter}? Fly there!', 'Find letter {letter} and launch!'],
      'p.letters.first': ['Let’s launch the rocket! Look at the letters! Land on letter {letter}!'],
      'p.lower': ['Land on big {letter} or small {lower}!', 'Big {letter}, small {lower}! Fly to them!',
        'Find big {letter} or small {lower} and launch!'],
      'p.lower.first': ['Let’s launch the rocket! Big letters and small letters! Land on big {letter} or small {lower}!'],
      'p.initial': ['Land on the one that starts with {letter}!', 'What starts with {letter}? Fly there!',
        'Listen: {letter}! Land on the one that starts with {letter}!'],
      'p.initial.first': ['Let’s launch the rocket! Listen to the names! Land on the one that starts with {letter}!'],
      'p.add': ['Land on the one that makes {n}!', 'Which one makes {n}? Fly there!', 'Let’s add! Land on the one that makes {n}!'],
      'p.add.first': ['Let’s launch the rocket! Let’s add up! Land on the one that makes {n}!'],
      'p.sub': ['Land on the one that makes {n}!', 'Which one makes {n}? Fly there!', 'Take away! Land on the one that makes {n}!'],
      'p.sub.first': ['Let’s launch the rocket! Let’s take away! Land on the one that makes {n}!'],
      'p.oddeven': ['Land on a {parity} number!', 'Which number is {parity}? Fly there!', 'Find a {parity} number and launch!'],
      'p.oddeven.first': ['Let’s launch the rocket! Look at the numbers! Land on a {parity} number!'],

      // before launch j ≥ 1 (event next): a short reminder of the goal
      'next': ['Next one: {what}!', 'Again: {what}!', 'One more: {what}!'],
      'next.home': ['Next one: who lives {home}?', 'Again! Who lives {home}?', 'One more: who lives {home}?'],
      'next.seq': ['Now {n}!', 'Next: number {n}!', 'Now find {n}!'],
      'next.any': ['Next one!', 'One more launch!', 'Here we go again!'],

      'right.thing': ['{thing}!', 'Yes! {thing}!', 'Splash! {thing}!'],
      'right.home': ['{who} lives {home}!', 'Yes! {who} lives {home}!', 'That’s it! {who} lives {home}!'],
      'right.initial': ['{thing}! {word} starts with {first}!', 'Yes! {word} starts with {first}!', '{thing}! {first} is for {word}!'],
      'right.sum': ['{expr} makes {ans}!', 'Yes! {expr} is {ans}!', '{expr} makes {ans}! Super adding!'],
      'right.diff': ['{expr} makes {ans}!', 'Yes! {expr} is {ans}!', '{expr} makes {ans}! Super thinking!'],
      'right.parity': ['{num} is {parity}!', 'Yes! {num} is {parity}!', '{num} is a {parity} number!'],
      'right.seq': ['Number {n}!', 'Yes, {n}!', '{n}! Good counting!'],
      'right.pump': ['Now pump!', 'Pump it up!', 'Now stomp the pump!'],
      'right.any': ['Yes! You got it!', 'That’s the one!', 'Yes! Let’s fly!'],

      'pumpAsk': ['Pump, pump, pump!', 'Stomp the pump three times!', 'Tap, tap, tap to pump!'],
      'pumpAuto': ['I’ll help!', 'Mimi will help! Stomp!', 'Let me pump!'],
      'pump.blast': ['Blast off!'],
      'chute': ['Parachute!', 'Pop goes the parachute!', 'Float down, rocket!'],
      'land': ['Touchdown!', 'Splash down!', 'We landed!'],
      'pennant': ['{thing} on the flagpole!', 'Hooray, {thing}!', 'Up the flagpole: {thing}!',
        '{thing} on the flagpole! Great job, {child}!'],
      'pennant.any': ['A new flag!', 'Up goes a flag!', 'Look, a flag!'],
      'camp': ['All our flags!', 'Look at our flags!', 'Our camp flags!'],

      'wrong.is': ['That’s {thing}.', 'This one is {thing}.', 'Look, {thing}.'],
      'wrong.dots': ['That’s {thing}.', 'This sign has {thing}.', 'Let’s count: {thing}.'],
      'wrong.seq': ['That’s {got}.', 'This one is {got}.', 'Look, {got}.'],
      'wrong.livesAt': ['It lives {home}.', 'It lives {home}!', 'That one lives {home}.'],
      'wrong.starts': ['{word} starts with {first}.', 'Listen: {word}, {first}.', '{first} is for {word}.'],
      'wrong.expr': ['{expr} makes {ans}.', '{expr} is {ans}.', 'Let’s count: {expr} makes {ans}.'],
      'wrong.parity': ['{num} is {parity}.', '{num} is a {parity} number.', 'Look, {num} is {parity}.'],
      'wrong.hint': ['Look at the shiny mat!', 'Watch the little hand!', 'The glowing mat! Tap it!'],
      'wrong.any': ['Let’s look again!', 'Let’s try another mat!', 'Hmm, let’s think again!', 'Keep going, you can do it!'],
      'goal.color': ['Find a {color} one!', 'Let’s find a {color} one!', 'Where is a {color} one?'],
      'goal.shape': ['Find the {shape}!', 'Let’s find a {shape}!', 'Where is the {shape}?'],
      'goal.size': ['Find a {size} one!', 'Let’s find a {size} one!', 'Where is a {size} one?'],
      'goal.seq': ['Which one is {want}?', 'Where is {want}?', 'Let’s find {want}!'],
      'goal.seqAny': ['Let’s count in order!', 'One, two, three… let’s count in order!', 'Let’s count together!'],
      'goal.n': ['Find the sign with {what}!', 'Let’s find {what}!', 'Which sign has {what}?'],
      'goal.animal': ['Find the {animal}!', 'Let’s find the {animal}!', 'Where is the {animal}?'],
      'goal.home': ['Who lives {home}?', 'Find who lives {home}!', 'Let’s find who lives {home}!'],
      'goal.letter': ['Find letter {letter}!', 'Let’s find letter {letter}!', 'Where is letter {letter}?'],
      'goal.lower': ['Find big {letter} or small {lower}!', 'Let’s find big {letter} or small {lower}!', 'Where are big {letter} and small {lower}?'],
      'goal.initial': ['Find one that starts with {letter}!', 'What starts with {letter}?', 'Let’s find one that starts with {letter}!'],
      'goal.sum': ['Find one that makes {n}!', 'Which one makes {n}?', 'Let’s find one that makes {n}!'],
      'goal.diff': ['Find one that makes {n}!', 'Which one makes {n}?', 'Let’s find one that makes {n}!'],
      'goal.parity': ['Find a {parity} number!', 'Let’s find a {parity} number!', 'Which number is {parity}?'],
      'goal.any': ['Let’s look again!', 'Let’s try another mat!', 'You can do it!'],

      'poke': ['Quack! That tickles!', 'Quack, quack! Hee hee!', 'Giggle, giggle!', 'Mimi is happy!'],
      'surprise.marmot': ['Look! A marmot!', 'Who is peeking out? A marmot!', 'A little marmot says hi!'],
      'marmot.tap': ['Tweeet! The marmot whistles!', 'Hello, little marmot!', 'Jump, marmot, jump!'],
      'surprise.goat': ['Look! A mountain goat!', 'Hop, hop! A goat on the rock!', 'A little goat came to say hi!'],
      'goat.tap': ['Baa, baa!', 'Hop, little goat!', 'The goat says baa!'],
      'surprise.bird': ['Look! A little bird on our flagpole!', 'Tweet! Who is that?', 'A little bird came to sing!'],
      'bird.tap': ['Tweet, tweet!', 'La-la-la! She sings!', 'What a pretty song!'],

      'praise': ['Yes!', 'Great job!', 'You got it!', 'Super!', 'Wonderful!', 'Hooray!', 'Well done!', 'Great flying!'],
      'great': ['Great job, {child}!', 'You did it, {child}!', 'Wow, {child}, super flying!', 'What a launch!',
        'You are so clever!', 'Hooray! Wonderful!'],
      'party': ['Look at all our flags!', 'Hooray! The flagpole is full of flags!', 'Let’s dance! Quack, quack!'],
      'hint': ['Psst! Look at the shiny mat!', 'Watch the little hand!', 'Mimi will help! Tap this mat!',
        'Look, this mat is glowing!', 'The glowing mat! Tap it!'],
      'idle': ['Mimi is waiting! Your turn!', 'The rocket is ready for you!', 'I am here, {child}! Let’s fly!',
        'Quack! Let’s play!', 'Your turn to launch!'],

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
      'talk.count': 'How many pinecones?',
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
      'talk.wrong.dots': 'There are {num} {dotWord}! Good try!',
      'talk.wrong.dot1': 'There is {num} {dotWord}! Good try!',
      'talk.wrong.home': '{who} lives {home}! Good try!',
      'talk.wrong.place': 'It lives {home}! Good try!',
      'talk.wrong.any': 'Good try! Let’s play more!',

      'session.done': ['What a splashy day! {stars} stars! Hooray!', 'Amazing, {child}! {stars} stars!',
        'So many flags! {stars} stars!']
    },
    vi: {
      'ui.title': 'Tên Lửa Nước Của Vịt Mimi',
      'ui.logo1': 'Vịt Mimi',
      'ui.logo2': 'Tên Lửa Nước',
      'ui.subtitle': 'Bé giúp Mimi bơm, phóng và đáp tên lửa nước nhé!',
      'ui.tagline': 'Bé giúp Mimi bơm, phóng và đáp tên lửa nước nhé!',
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
      'ui.voice': 'Giọng của Mimi',
      'ui.mic': 'Nói để trả lời',
      'ui.done': 'Xong',
      'ui.stars': 'Ngôi sao',
      'ui.chapter': 'Chương {n}',
      'ui.allDone': 'Hoàn thành! {stars} ngôi sao',
      'ui.welcome': ['Chào bé {child}! Mình là vịt Mimi. Mình cùng phóng tên lửa nước nhé!',
        'Chào bé! Mình là vịt Mimi. Mình cùng phóng tên lửa nước nhé!'],
      'ui.micUnsupported': 'Máy này chưa nghe được giọng nói. Bé chạm vào hình nhé!',
      'ui.micDenied': 'Micrô đang tắt. Bé chạm vào hình nhé!',
      'ui.voiceMissing': 'Mẹo cho bố mẹ: thêm giọng tiếng Việt trong Cài đặt › Trợ năng › Nội dung được đọc › Giọng nói.',
      'ui.tapOrSay': 'Bé chạm hoặc nói đáp án nhé!',
      'ui.listening': 'Mimi đang nghe…',
      'ui.tapMimi': 'Chạm vào Mimi để nghe lại nhé',
      'ui.tapHint': 'Bé chạm vào tấm thảm đúng nhé',
      'ui.pumpHint': 'Bé chạm vào đâu cũng được để bơm nhé!',
      'ui.doorHint': 'Bé cho tên lửa bay tới tấm thảm nhé',
      'ui.skip': 'Bỏ qua',
      'ui.gallery': 'Lá cờ của bé',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Đáp xuống sắc màu',
      'topic.shapes': 'Đáp xuống hình khối',
      'topic.size': 'To và nhỏ',
      'topic.count': 'Đếm quả thông',
      'topic.animals': 'Nhà của các bạn thú',
      'topic.letters': 'Đáp xuống chữ cái',
      'topic.lower': 'Chữ hoa, chữ thường',
      'topic.initial': 'Chữ cái đầu tiên',
      'topic.add': 'Phép cộng',
      'topic.sub': 'Phép trừ',
      'topic.oddeven': 'Số chẵn, số lẻ',

      'weather.0': ['Một ngày nắng đẹp ở khu cắm trại!', 'Một ngày nắng đẹp ở khu cắm trại! Bướm bay kìa!'],
      'weather.1': ['Vù vù, trời gió rồi!', 'Vù vù, trời gió rồi! Gió thổi chiếc dù bay kìa!'],
      'weather.2': ['Lộp độp, trời mưa! Vịt thích mưa lắm!', 'Lộp độp, trời mưa! Lách tách, lách tách!'],
      'weather.3': ['Nhìn kìa, cầu vồng!', 'Nhìn kìa, cầu vồng trên núi!'],

      'unfold': ['Nhìn kìa, tấm thảm đây rồi!', 'Phạch phạch! Tấm thảm mở ra rồi!', 'Các tấm thảm trải ra rồi kìa!'],
      'wipe': ['Vèo! Tấm thảm mới nè!', 'Mình phóng lượt mới nào!', 'Nhìn kìa, tấm thảm mới!'],

      'p.any': ['Bé cho tên lửa đáp xuống một tấm thảm nhé!', 'Tên lửa đáp xuống tấm thảm nào nhỉ?',
        'Bé tìm một tấm thảm rồi phóng tên lửa nhé!'],
      'p.colors': ['Bé cho tên lửa đáp xuống thứ {color} nhé!', 'Cái nào {color} nhỉ? Bé cho tên lửa bay tới đó nào!',
        'Bé tìm cái {color} rồi phóng tên lửa nhé!'],
      'p.colors.first': ['Mình phóng tên lửa nào! Bé cho tên lửa đáp xuống thứ {COLOR} nhé!'],
      'p.shapes': ['Bé cho tên lửa đáp xuống {shape} nhé!', '{shape} ở đâu nhỉ? Bé cho tên lửa bay tới nào!',
        'Bé tìm {shape} rồi phóng tên lửa nhé!'],
      'p.shapes.first': ['Mình phóng tên lửa nào! Bé cho tên lửa đáp xuống {shape} nhé!'],
      'p.shapes5': ['Bé nhìn hình chứ không nhìn màu nhé! Cho tên lửa đáp xuống {shape} nào!',
        'Màu nào cũng được! Bé tìm {shape} rồi phóng tên lửa nhé!', 'Nhiều màu quá! {shape} ở đâu nhỉ? Bé cho tên lửa bay tới nào!'],
      'p.shapes5.first': ['Mình phóng tên lửa nào! Nhiều màu quá… nhưng bé nhìn hình nhé! Bé cho tên lửa đáp xuống {shape} nhé!'],
      'p.size': ['Bé cho tên lửa đáp xuống cái {size} nhé!', 'Cái nào {size} nhỉ? Bé cho tên lửa bay tới đó nào!',
        'Bé tìm cái {size} rồi phóng tên lửa nhé!'],
      'p.size.first': ['Mình phóng tên lửa nào! Có cái to, có cái nhỏ! Bé cho tên lửa đáp xuống cái {size} nhé!'],
      'p.countSeq': ['Bé cho tên lửa đáp xuống {seqThen} nhé!', 'Mình vừa đếm vừa bay nhé: {seqThen}!',
        'Bé cho tên lửa đáp theo thứ tự nhé: {seqThen}!'],
      'p.countSeq.first': ['Mình phóng tên lửa nào! Bé đếm cùng Mimi và đáp xuống {seqThen} nhé!'],
      'p.countSel': ['Bé cho tên lửa đáp xuống tấm biển có {n} {dotWord} nhé!', 'Mình đếm quả thông nhé! Biển nào có {n} {dotWord} nhỉ?',
        'Tấm biển nào có {n} {dotWord}? Bé cho tên lửa bay tới nào!'],
      'p.countSel.first': ['Mình phóng tên lửa nào! Bé đếm quả thông trên mỗi tấm biển nhé! Bé cho tên lửa đáp xuống tấm biển có {n} {dotWord} nhé!'],
      'p.animal': ['Bé cho tên lửa bay tới {animal} nhé!', '{animal} ở đâu nhỉ? Bé cho tên lửa đáp xuống đó nào!',
        'Bé tìm {animal} rồi phóng tên lửa nhé!'],
      'p.animal.first': ['Mình phóng tên lửa nào! Bé xem các bạn thú kìa! Bé cho tên lửa bay tới {animal} nhé!'],
      'p.home': ['Ai sống {home}? Bé cho tên lửa đáp xuống đó nhé!', 'Bé cho tên lửa bay tới bạn sống {home} nhé!',
        'Bạn nào sống {home} nhỉ? Bé phóng tên lửa nào!'],
      'p.home.first': ['Mình phóng tên lửa nào! Ai sống {home}? Bé cho tên lửa đáp xuống đó nhé!'],
      'p.letters': ['Bé cho tên lửa đáp xuống chữ {letter} nhé!', 'Chữ {letter} ở đâu nhỉ? Bé cho tên lửa bay tới nào!',
        'Bé tìm chữ {letter} rồi phóng tên lửa nhé!'],
      'p.letters.first': ['Mình phóng tên lửa nào! Bé xem các chữ cái kìa! Bé cho tên lửa đáp xuống chữ {letter} nhé!'],
      'p.lower': ['Bé cho tên lửa đáp xuống chữ {letter} hoa hoặc chữ {lower} thường nhé!',
        'Chữ {letter} hoa, chữ {lower} thường ở đâu nhỉ? Bé cho tên lửa bay tới nào!',
        'Bé tìm chữ {letter} hoa hay chữ {lower} thường rồi phóng tên lửa nhé!'],
      'p.lower.first': ['Mình phóng tên lửa nào! Có chữ hoa, có chữ thường! Bé cho tên lửa đáp xuống chữ {letter} hoa hoặc chữ {lower} thường nhé!'],
      'p.initial': ['Bé cho tên lửa đáp xuống bạn có tên bắt đầu bằng chữ {letter} nhé!',
        'Tên nào bắt đầu bằng chữ {letter} nhỉ? Bé cho tên lửa bay tới nào!',
        'Bé nghe nè: chữ {letter}! Bé tìm bạn bắt đầu bằng chữ {letter} rồi phóng tên lửa nhé!'],
      'p.initial.first': ['Mình phóng tên lửa nào! Bé nghe tên các bạn nhé! Bé cho tên lửa đáp xuống bạn có tên bắt đầu bằng chữ {letter} nhé!'],
      'p.add': ['Bé cho tên lửa đáp xuống phép tính bằng {n} nhé!', 'Phép tính nào bằng {n} nhỉ? Bé cho tên lửa bay tới nào!',
        'Mình cộng nào! Bé cho tên lửa đáp xuống phép tính bằng {n} nhé!'],
      'p.add.first': ['Mình phóng tên lửa nào! Mình cùng làm phép cộng nhé! Bé cho tên lửa đáp xuống phép tính bằng {n} nhé!'],
      'p.sub': ['Bé cho tên lửa đáp xuống phép tính bằng {n} nhé!', 'Phép tính nào bằng {n} nhỉ? Bé cho tên lửa bay tới nào!',
        'Mình trừ nào! Bé cho tên lửa đáp xuống phép tính bằng {n} nhé!'],
      'p.sub.first': ['Mình phóng tên lửa nào! Mình cùng làm phép trừ nhé! Bé cho tên lửa đáp xuống phép tính bằng {n} nhé!'],
      'p.oddeven': ['Bé cho tên lửa đáp xuống số {parity} nhé!', 'Số nào là số {parity} nhỉ? Bé cho tên lửa bay tới nào!',
        'Bé tìm số {parity} rồi phóng tên lửa nhé!'],
      'p.oddeven.first': ['Mình phóng tên lửa nào! Bé xem các số kìa! Bé cho tên lửa đáp xuống số {parity} nhé!'],

      'next': ['Tiếp nè: {what} nhé!', 'Lần nữa nào: {what} nhé!', 'Thêm một lần: {what} nhé!'],
      'next.home': ['Tiếp nè: ai sống {home} nhỉ?', 'Lần nữa nào! Ai sống {home} nhỉ?', 'Thêm một lần: bạn nào sống {home} nhỉ?'],
      'next.seq': ['Giờ tới số {n} nào!', 'Tiếp theo: số {n} nhé!', 'Bé tìm số {n} nhé!'],
      'next.any': ['Lần tiếp theo nào!', 'Phóng thêm lần nữa nào!', 'Mình bay tiếp nhé!'],

      'right.thing': ['{thing}!', 'Đúng rồi! {thing}!', 'Tõm! {thing}!'],
      'right.home': ['{who} sống {home}!', 'Đúng rồi! {who} sống {home}!', 'Đúng rồi! {who} sống {home} đó!'],
      'right.initial': ['{thing}! {word} bắt đầu bằng chữ {first}!', 'Đúng rồi! {word} bắt đầu bằng chữ {first}!', '{thing}! Chữ {first}, {word}!'],
      'right.sum': ['{expr} bằng {ans}!', 'Đúng rồi! {expr} bằng {ans}!', '{expr} bằng {ans}! Bé cộng giỏi quá!'],
      'right.diff': ['{expr} bằng {ans}!', 'Đúng rồi! {expr} bằng {ans}!', '{expr} bằng {ans}! Bé trừ giỏi quá!'],
      'right.parity': ['{num} là số {parity}!', 'Đúng rồi! {num} là số {parity}!', '{num} là số {parity} đó!'],
      'right.seq': ['Số {n}!', 'Đúng rồi, số {n}!', 'Số {n}! Bé đếm giỏi quá!'],
      'right.pump': ['Giờ bé bơm nhé!', 'Bơm thôi nào!', 'Bé bơm cho tên lửa nhé!'],
      'right.any': ['Đúng rồi! Bé giỏi quá!', 'Đúng cái đó rồi!', 'Đúng rồi! Mình bay nào!'],

      'pumpAsk': ['Bé bơm đi nào!', 'Bơm, bơm, bơm!', 'Bé chạm ba lần để bơm nhé!'],
      'pumpAuto': ['Mimi giúp bé nhé!', 'Mimi bơm giúp nè!', 'Để Mimi bơm nào!'],
      'pump.blast': ['Bay nào!'],
      'chute': ['Bung dù!', 'Dù bung ra rồi!', 'Tên lửa bay xuống từ từ nào!'],
      'land': ['Đáp rồi!', 'Tõm, đáp rồi!', 'Mình đáp xuống rồi!'],
      'pennant': ['{thing} lên cột cờ rồi!', 'Hoan hô, {thing}!', 'Kéo lên cột cờ nào: {thing}!',
        '{thing} lên cột cờ rồi! Bé {child} giỏi quá!'],
      'pennant.any': ['Thêm một lá cờ!', 'Lá cờ lên rồi!', 'Nhìn kìa, lá cờ!'],
      'camp': ['Cờ của mình nè!', 'Nhìn các lá cờ kìa!', 'Cờ trại của mình đây!'],

      'wrong.is': ['Đây là {thing}.', 'Đây là {thing} nè.', 'Ồ, {thing}.'],
      'wrong.dots': ['Đây là {thing}.', 'Tấm biển này có {thing}.', 'Mình đếm nhé: {thing}.'],
      'wrong.seq': ['Đây là số {got}.', 'Cái này là số {got}.', 'Ồ, số {got}.'],
      'wrong.livesAt': ['Bạn ấy sống {home}.', 'Bạn ấy sống {home} đó!', 'Bạn này sống {home}.'],
      'wrong.starts': ['{word} bắt đầu bằng chữ {first}.', 'Bé nghe nè: {word}, chữ {first}.', 'Chữ {first}, {word}.'],
      'wrong.expr': ['{expr} bằng {ans}.', '{expr} bằng {ans} nè.', 'Mình đếm nhé: {expr} bằng {ans}.'],
      'wrong.parity': ['{num} là số {parity}.', '{num} là số {parity} nè.', 'Ồ, {num} là số {parity}.'],
      'wrong.hint': ['Bé nhìn tấm thảm đang sáng nè!', 'Bé xem bàn tay nhỏ chỉ nè!', 'Tấm thảm sáng đó! Bé chạm vào nhé!'],
      'wrong.any': ['Mình tìm lại nhé!', 'Bé thử tấm thảm khác nhé!', 'Bé nghĩ thêm chút nữa nhé!', 'Cố lên, bé làm được mà!'],
      'goal.color': ['Mình tìm cái {color} nhé!', 'Bé tìm cái {color} nhé!', 'Cái nào {color} nhỉ?'],
      'goal.shape': ['Mình tìm {shape} nhé!', 'Bé tìm {shape} nhé!', '{shape} đâu rồi nhỉ?'],
      'goal.size': ['Mình tìm cái {size} nhé!', 'Bé tìm cái {size} nhé!', 'Cái nào {size} nhỉ?'],
      'goal.seq': ['Số {want} đâu nhỉ?', 'Mình tìm số {want} nhé!', 'Cái nào là số {want} nhỉ?'],
      'goal.seqAny': ['Mình đếm theo thứ tự nhé!', 'Một, hai, ba… mình đếm theo thứ tự nhé!', 'Mình cùng đếm nhé!'],
      'goal.n': ['Mình tìm tấm biển có {what} nhé!', 'Bé tìm {what} nhé!', 'Tấm biển nào có {what} nhỉ?'],
      'goal.animal': ['Mình tìm {animal} nhé!', 'Bé tìm {animal} nhé!', '{animal} đâu rồi nhỉ?'],
      'goal.home': ['Bạn nào sống {home} nhỉ?', 'Mình tìm bạn sống {home} nhé!', 'Ai sống {home} nào?'],
      'goal.letter': ['Mình tìm chữ {letter} nhé!', 'Bé tìm chữ {letter} nhé!', 'Chữ {letter} đâu rồi nhỉ?'],
      'goal.lower': ['Mình tìm chữ {letter} hoa hoặc chữ {lower} thường nhé!', 'Bé tìm chữ {letter} hoa hay chữ {lower} thường nhé!',
        'Chữ {letter} hoa, chữ {lower} thường đâu rồi nhỉ?'],
      'goal.initial': ['Mình tìm bạn bắt đầu bằng chữ {letter} nhé!', 'Bạn nào bắt đầu bằng chữ {letter} nhỉ?',
        'Bé tìm bạn bắt đầu bằng chữ {letter} nhé!'],
      'goal.sum': ['Mình tìm phép tính bằng {n} nhé!', 'Phép tính nào bằng {n} nhỉ?', 'Bé tìm phép tính bằng {n} nhé!'],
      'goal.diff': ['Mình tìm phép tính bằng {n} nhé!', 'Phép tính nào bằng {n} nhỉ?', 'Bé tìm phép tính bằng {n} nhé!'],
      'goal.parity': ['Mình tìm số {parity} nhé!', 'Bé tìm số {parity} nhé!', 'Số nào là số {parity} nhỉ?'],
      'goal.any': ['Mình tìm lại nhé!', 'Bé thử tấm thảm khác nhé!', 'Bé làm được mà!'],

      'poke': ['Cạp cạp! Nhột quá!', 'Cạp cạp! Hi hi!', 'Khúc khích, khúc khích!', 'Mimi vui quá!'],
      'surprise.marmot': ['Nhìn kìa! Bạn sóc đất!', 'Ai ló đầu ra thế? Bạn sóc đất!', 'Bạn sóc đất nhỏ chào bé nè!'],
      'marmot.tap': ['Huýt! Bạn sóc đất huýt sáo!', 'Chào bạn sóc đất nhỏ!', 'Nhảy lên nào, sóc đất ơi!'],
      'surprise.goat': ['Nhìn kìa! Bạn dê núi!', 'Nhảy nhảy! Bạn dê trên tảng đá kìa!', 'Bạn dê nhỏ đến chơi nè!'],
      'goat.tap': ['Be be!', 'Bạn dê nhảy nè!', 'Bạn dê kêu be be!'],
      'surprise.bird': ['Nhìn kìa! Bạn chim nhỏ đậu trên cột cờ!', 'Líu lo! Ai thế nhỉ?', 'Bạn chim nhỏ đến hát nè!'],
      'bird.tap': ['Líu lo, líu lo!', 'La la la! Bạn chim hát nè!', 'Bạn chim hát hay quá!'],

      'praise': ['Đúng rồi!', 'Giỏi quá!', 'Tuyệt vời!', 'Hoan hô!', 'Bé giỏi lắm!', 'Chính xác!', 'Hay quá!', 'Bé bay giỏi quá!'],
      'great': ['Bé {child} giỏi quá!', 'Hoan hô bé {child}!', 'Oa, bé {child} bay siêu giỏi!', 'Phóng tên lửa giỏi quá!',
        'Bé thông minh quá!', 'Hoan hô! Tuyệt vời!'],
      'party': ['Nhìn nhiều cờ chưa kìa!', 'Hoan hô! Cột cờ đầy cờ rồi!', 'Mình cùng nhảy múa nào! Cạp cạp!'],
      'hint': ['Bé nhìn nè! Tấm thảm này đang sáng lên.', 'Bé xem bàn tay nhỏ chỉ nè!', 'Mimi giúp bé nhé! Bé chạm vào tấm thảm này nè!',
        'Nhìn kìa, tấm thảm này lấp lánh!', 'Tấm thảm sáng đó! Bé chạm vào nhé!'],
      'idle': ['Mimi đang chờ bé nè!', 'Tên lửa đang chờ bé nè!', 'Bé {child} ơi, mình chơi tiếp nhé!',
        'Cạp cạp! Mình chơi nào!', 'Tới lượt bé phóng tên lửa rồi nè!'],

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
      'talk.count': 'Có mấy quả thông nào?',
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
      'talk.wrong.dots': 'Có {num} {dotWord} đó! Bé cố gắng lắm!',
      'talk.wrong.dot1': 'Có {num} {dotWord} đó! Bé cố gắng lắm!',
      'talk.wrong.home': '{who} sống {home} đó! Bé cố gắng lắm!',
      'talk.wrong.place': 'Bạn ấy sống {home} đó! Bé cố gắng lắm!',
      'talk.wrong.any': 'Bé cố gắng lắm! Mình chơi tiếp nhé!',

      'session.done': ['Một ngày phóng tên lửa vui quá! {stars} ngôi sao!', 'Bé {child} giỏi quá! {stars} ngôi sao!',
        'Mimi có thật nhiều lá cờ! {stars} ngôi sao!']
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
    'wrong.is': ['thing'], 'wrong.dots': ['thing'], 'wrong.seq': ['got'], 'wrong.livesAt': ['home'], 'wrong.starts': ['word', 'first'],
    'wrong.expr': ['expr', 'ans'], 'wrong.parity': ['num', 'parity'],
    'goal.color': ['color'], 'goal.shape': ['shape'], 'goal.size': ['size'], 'goal.seq': ['want'], 'goal.n': ['what'],
    'goal.animal': ['animal'], 'goal.home': ['home'], 'goal.letter': ['letter'], 'goal.lower': ['letter', 'lower'],
    'goal.initial': ['letter'], 'goal.sum': ['n'], 'goal.diff': ['n'], 'goal.parity': ['parity'],
    'next': ['what'], 'next.home': ['home'], 'next.seq': ['n'], 'right.seq': ['n'], 'pennant': ['thing'],
    'talk.colorsWhich': ['color'], 'talk.shape': ['shape'], 'talk.shapes': ['shape'], 'talk.shapes5': ['shape'],
    'talk.size': ['size'], 'talk.sizeWhich': ['size'], 'talk.home': ['animal'], 'talk.animals': ['animal'],
    'talk.farm': ['animal'], 'talk.letters': ['letter'], 'talk.lower': ['letter'], 'talk.initial': ['word'],
    'talk.add': ['a', 'b'], 'talk.sub': ['a', 'b'], 'talk.oddeven': ['parity'],
    'talk.wrong': ['answer'], 'talk.wrong.a': ['answer'], 'talk.wrong.animal': ['answer'], 'talk.wrong.size': ['answer'],
    'talk.wrong.letter': ['letter'], 'talk.wrong.small': ['letter'], 'talk.wrong.number': ['answer'],
    'talk.wrong.dots': ['num', 'dotWord'], 'talk.wrong.dot1': ['num', 'dotWord'], 'talk.wrong.home': ['who', 'home'],
    'talk.wrong.place': ['home']
  };
  Object.keys(PROMPTS).forEach(function (k) {
    ['', '.first'].forEach(function (s) { if (STR.en[k + s] != null) NEEDS[k + s] = PROMPTS[k]; });
  });
  var FALLBACK = { 'p.shapes5': 'p.shapes', 'talk.colorsWhich': 'talk.colorsAny',
    'talk.shape': 'talk.shapesAny', 'talk.shapes': 'talk.shapesAny', 'talk.shapes5': 'talk.shapesAny', 'talk.size': 'talk.sizeAny',
    'talk.sizeWhich': 'talk.sizeAny', 'talk.home': 'talk.homeAny', 'talk.animals': 'talk.homeAny', 'talk.farm': 'talk.homeAny',
    'talk.letters': 'talk.lettersAny', 'talk.lower': 'talk.lowerAny', 'talk.initial': 'talk.initialAny',
    'talk.add': 'talk.calc', 'talk.sub': 'talk.calc', 'talk.oddeven': 'talk.oddevenAny', 'talk.wrong.home': 'talk.wrong.place',
    'goal.seq': 'goal.seqAny', 'next': 'next.any', 'next.home': 'next.any', 'next.seq': 'next.any', 'pennant': 'pennant.any' };
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
  // "1, 2, 3" — a plain list of the numbers 1..n (digits: the signs show numerals)
  function seqList(n) {
    var c = num(n);
    if (c == null || c < 1) return '';
    var out = [];
    for (var i = 1; i <= Math.min(c, MAX_COUNT); i++) out.push(String(i));
    return out.join(', ');
  }
  // "1, then 2, then 3" / "1, rồi 2, rồi 3" — the countSeq question (one number per launch, in order)
  function seqThen(lang, n) {
    var c = num(n);
    if (c == null || c < 1) return '';
    var out = [];
    for (var i = 1; i <= Math.min(c, MAX_COUNT); i++) out.push(String(i));
    return out.join(L(lang) === 'vi' ? ', rồi ' : ', then ');
  }
  function isLetter(s) { return typeof s === 'string' && /^\p{L}$/u.test(s); }
  function inTable(tbl, v) { var s = low(v); return tbl[s] != null ? s : null; }
  function colorOf(v) { var s = low(v); if (s === 'colour') return null; return NAMES.en.color[s] != null ? s : null; }
  function shapeOf(v) { var s = low(v); if (s === 'rectangle') s = 'rect'; return NAMES.en.shape[s] != null ? s : null; }
  function objOf(v) {
    var s = low(v).replace(/^(objs?|toys?)\//, '');
    if (s === 'cup' || s === 'camping mug') s = 'mug';
    if (s === 'lamp' || s === 'camping lantern') s = 'lantern';
    return NAMES.en.obj[s] != null ? s : null;
  }
  function homeOf(v) { return inTable(NAMES.en.home, v); }
  function moodOf(v) {   // weather 0..3 | 'sunny' | 'breezy' ('windy') | 'rain' ('rainy') | 'rainbow'
    if (num(v) != null) { var i = ((num(v) % 4) + 4) % 4; return MOODS[i]; }
    var s = low(v);
    if (s === 'windy' || s === 'wind') s = 'breezy';
    if (s === 'rainy') s = 'rain';
    return NAMES.en.mood[s] != null ? s : null;
  }
  function surpriseOf(v) { var s = low(v); if (s === 'mountain goat') s = 'goat'; return NAMES.en.surprise[s] != null ? s : null; }
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
    if (k === 'toy') k = 'obj';
    if (k === 'block') k = 'shape';
    if (k === 'stars' || k === 'crate' || k === 'dot') k = 'dots';
    if (THING_KINDS.indexOf(k) >= 0 || ['color', 'number', 'home', 'size', 'letter'].indexOf(k) >= 0) return k;
    if (t.animal != null) return 'animal';
    if (t.obj != null) return 'obj';
    if (t.shape != null) return 'shape';
    if (t.text != null) return 'tile';
    if (t.n != null) return 'dots';
    return null;
  }
  function tileText(t) { return t.text != null ? String(t.text) : (t.n != null ? String(t.n) : (t.nameValue != null ? String(t.nameValue) : '')); }
  function tileNumber(t) {
    if (thingKind(t) === 'dots') return num(t.n);
    var tx = tileText(t);
    if (splitOp(tx)) return exprValue(tx);
    return num(tx) != null ? num(tx) : num(t.n);
  }

  // ---------------------------------------------------------------- phrases: a thing named for a sentence
  // thing = { kind obj|shape|dots|tile|animal (or a Talk icon color|number|home|size), color?, obj?, shape?, n?,
  //           animal?, home?, text?, big?, nameKind?, nameValue? }
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
      case 'obj': case 'shape': {
        var o = k === 'obj' ? objOf(t.obj) : shapeOf(t.shape);
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
      case 'dots': {
        var n = num(t.n);
        if (n == null) return vi ? 'chấm' : 'dots';
        return n + ' ' + noun(lang, 'dot', n);
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
      case 'color': return { kind: 'obj', color: nv };
      case 'shape': return { kind: 'shape', shape: nv };
      case 'size': return { kind: 'obj', big: sizeOf(nv) !== 'small' };
      case 'n': case 'number': case 'count': case 'dots': case 'seq': return num(nv) != null ? { kind: 'dots', n: num(nv) } : null;
      case 'obj': case 'toy': return { kind: 'obj', obj: nv };
      case 'animal': case 'home': case 'farm': case 'word': case 'initial':
        if (animalOf(nv)) return { kind: 'animal', animal: animalOf(nv) };
        if (objOf(nv)) return { kind: 'obj', obj: objOf(nv) };
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
      if (['obj', 'toy', 'dots', 'tile', 'animal'].indexOf(kind) >= 0 || (kind === 'shape' && value.shape != null && value.kind)) return phrase(lang, value, { art: null });
    }
    value = rawVal(value);
    var vi = lang === 'vi', T = NAMES[lang], k;
    var S = function (v) { return String(v == null ? '' : v); };
    switch (kind) {
      case 'number': case 'n': case 'count': case 'seq': return num(value) != null ? numberName(lang, num(value)) : S(value);
      case 'dots': case 'pinecones': { var ns = num(value); return ns == null ? noun(lang, 'dot', 2) : ns + ' ' + noun(lang, 'dot', ns); }
      case 'flags': case 'mats': { var nf = num(value), w = kind === 'flags' ? 'flag' : 'mat'; return nf == null ? noun(lang, w, 2) : nf + ' ' + noun(lang, w, nf); }
      case 'color': case 'hue': k = colorOf(value); return k ? T[kind][k] : S(value);
      case 'shape': case 'shapes': k = shapeOf(value); return k ? T[kind][k] : S(value);
      case 'obj': case 'toy': case 'objWord': case 'toyWord': k = objOf(value); return k ? T[kind === 'objWord' || kind === 'toyWord' ? 'objWord' : 'obj'][k] : S(value);
      case 'surprise': k = surpriseOf(value); return k ? T.surprise[k] : S(value);
      case 'animal': case 'word': case 'who': case 'animals': k = animalOf(value); return k ? T[kind][k] : S(value);
      case 'home': case 'farm': case 'homeAt': k = homeOf(value); return k ? T[kind === 'farm' ? 'home' : kind][k] : S(value);
      case 'lives': k = homeOf(value) || (animalOf(value) ? ANIMAL_HOME[animalOf(value)] : null);
        return k ? (vi ? 'sống ' : 'lives ') + T.homeAt[k] : S(value);
      case 'size': k = sizeOf(value); return k ? T.size[k] : S(value);
      case 'mood': case 'weather': case 'season': k = moodOf(value); return k ? T.mood[k] : S(value);
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

  // the bare noun for the initial-letter topic: no classifier ("con bò" → "bò", "bông hoa" → "hoa"); things or (kind, value)
  function bareWord(lang, kind, value) {
    lang = L(lang);
    var t = (kind && typeof kind === 'object') ? kind : null;
    if (t && t.thing && typeof t.thing === 'object') t = t.thing;
    if (t) {
      if (animalOf(t.animal)) return NAMES[lang].word[animalOf(t.animal)];
      if (objOf(t.obj)) return NAMES[lang].objWord[objOf(t.obj)];
      if (shapeOf(t.shape)) return NAMES[lang].shape[shapeOf(t.shape)].replace(/^hình /, '');
      if (t.nameKind != null && t.nameKind !== 'initial' && t.nameKind !== 'letter') return bareWord(lang, t.nameKind, t.nameValue);
      return t.word != null ? String(t.word) : '';
    }
    value = rawVal(value);
    if ((kind === 'obj' || kind === 'toy') && objOf(value)) return NAMES[lang].objWord[objOf(value)];
    if (kind === 'shape' && shapeOf(value)) return NAMES[lang].shape[shapeOf(value)].replace(/^hình /, '');
    if (kind === 'color' && colorOf(value)) return NAMES[lang].hue[colorOf(value)];
    if (animalOf(value)) return NAMES[lang].word[animalOf(value)];
    if (objOf(value)) return NAMES[lang].objWord[objOf(value)];
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
    if (v >= 1 && v <= MAX_COUNT) addForms(out, [NUM[lang][v] + ' ' + noun(lang, 'dot', v), v + ' ' + noun(lang, 'dot', v)]);
    var alt = NUM_ALT[lang][v];
    if (alt) addForms(out, alt);
    return out;
  }
  function wordKind(k) {
    k = String(k == null ? '' : k);
    var A = { n: 'number', count: 'number', dots: 'number', stars: 'number', seq: 'number', farm: 'home', block: 'shape',
      hue: 'color', colour: 'color', toy: 'obj', lower: 'letter', initial: 'letter', word: 'animal', tile: 'text', blob: 'color',
      paint: 'color', add: 'sum', sub: 'diff', pinecones: 'number', season: 'mood', weather: 'mood' };
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
      case 'obj': case 'toy':
        if (t.obj != null) return ['obj', t.obj];
        if (t.color != null) return ['color', t.color];
        return ['size', thingSize(t)];
      case 'shape': case 'block': return ['shape', t.shape != null ? t.shape : t.value];
      case 'dots': case 'stars': return ['number', t.n != null ? t.n : t.value];
      case 'tile': case 'text': return ['text', t.text != null ? t.text : (t.n != null ? t.n : t.value)];
      case 'animal': return ['animal', t.animal != null ? t.animal : t.value];
      case 'surprise': return ['surprise', t.surprise != null ? t.surprise : t.value];
      case 'letter': return ['letter', t.text != null ? t.text : t.value];
      case 'parity': return ['parity', t.value];
      case 'mood': case 'weather': case 'season': return ['mood', t.mood != null ? t.mood : t.value];
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
      case 'obj': k = objOf(value); return k ? addForms(out, [T.obj[k], T.objWord[k]].concat(W.obj[k])) : addForms(out, [String(value)]);
      case 'surprise': k = surpriseOf(value); return k ? addForms(out, [T.surprise[k]].concat(W.surprise[k])) : addForms(out, [String(value)]);
      case 'animal': case 'who': k = animalOf(value); return k ? addForms(out, [T.animal[k], T.word[k], T.who[k]].concat(W.animal[k])) : addForms(out, [String(value)]);
      case 'home': case 'homeAt': k = homeOf(value); return k ? addForms(out, [T.home[k], T.homeAt[k]].concat(W.home[k])) : addForms(out, [String(value)]);
      case 'mood': k = moodOf(value); return k ? addForms(out, [T.mood[k]].concat(W.mood[k])) : addForms(out, [String(value)]);
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
    if (present(p.color)) {
      var cc = colorOf(p.color);
      if (cc && !present(p.COLOR)) p.COLOR = lang === 'vi' ? 'màu ' + NAMES.vi.hue[cc].toUpperCase() : NAMES.en.hue[cc].toUpperCase();
      p.color = name(lang, 'color', p.color);
      if (!present(p.COLOR)) p.COLOR = String(p.color).toUpperCase();
    }
    if (present(p.shape)) {
      var sh = shapeOf(p.shape);
      if (sh && !present(p.shapes)) p.shapes = NAMES[lang].shapes[sh];
      p.shape = name(lang, 'shape', p.shape);
    }
    if (present(p.shapes) && shapeOf(p.shapes)) p.shapes = NAMES[lang].shapes[shapeOf(p.shapes)];
    if (present(p.size) || p.big === true || p.big === false) p.size = name(lang, 'size', present(p.size) ? p.size : p.big);
    if (present(p.parity)) p.parity = name(lang, 'parity', parityOf(rawVal(p.parity)) || p.parity);
    if (present(p.home)) p.home = name(lang, 'homeAt', p.home);
    if (present(p.mood)) p.mood = name(lang, 'mood', p.mood);
    if (present(p.who) && animalOf(p.who)) p.who = phrase(lang, { kind: 'animal', animal: animalOf(p.who) }, { who: true });
    if (present(p.animal)) {
      var an = animalOf(p.animal);
      if (an && !present(p.word)) p.word = NAMES[lang].word[an];
      if (an && !present(p.animals)) p.animals = NAMES[lang].animals[an];
      p.animal = an ? NAMES[lang][isTalkHome(key) ? 'who' : 'animal'][an] : String(rawVal(p.animal));
    }
    // talk.initial {letter, nameKind, nameValue}: the word comes from the shown thing (never say the letter = the answer)
    if (!present(p.word) && p.nameValue != null && (animalOf(p.nameValue) || objOf(p.nameValue))) p.word = bareWord(lang, p.nameKind || null, p.nameValue);
    if (present(p.word) && animalOf(p.word)) p.word = NAMES[lang].word[animalOf(p.word)];
    else if (present(p.word) && objOf(p.word)) p.word = NAMES[lang].objWord[objOf(p.word)];
    if (present(p.letter)) {
      p.letter = String(rawVal(p.letter));
      if (/^(p|talk|goal)\.lower/.test(key)) { if (!present(p.lower)) p.lower = p.letter.toLowerCase(); p.letter = p.letter.toUpperCase(); }
      else if (!present(p.lower)) p.lower = p.letter.toLowerCase();
    }
    if (present(p.lower)) p.lower = String(rawVal(p.lower));
    var c = present(p.n) ? num(p.n) : null;
    if (!present(p.num) && c != null) p.num = numberName(lang, c);
    if (present(p.n) && typeof p.n === 'object') p.n = c != null ? c : '';
    if (!present(p.seq) && c != null && c >= 1) p.seq = seqList(c);
    if (!present(p.seqThen) && c != null && c >= 1) p.seqThen = seqThen(lang, c);
    if (!present(p.dotWord)) p.dotWord = noun(lang, 'dot', c == null ? 2 : c);
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

  // The question, asked once per round before launch 0 (later launches get sayNext). Every launch has ONE target ("Land
  // on the red one!"); params.k is ignored. opts.first → the chapter's round-0 form ("Let's launch the rocket! …").
  I18N.ask = function (lang, key, params, opts) {
    opts = opts || {};
    lang = L(lang);
    key = String(key == null ? '' : key);
    if (opts.first && STR[lang][key + '.first'] != null && needsMet(key + '.first', derive(lang, params, key + '.first'))) {
      return I18N.t(lang, key + '.first', params, opts.rng);
    }
    return I18N.t(lang, key, params, opts.rng);
  };

  // ---------------------------------------------------------------- game lines
  var KIND_ALIAS = { colour: 'color', number: 'n', countsel: 'n', countseq: 'seq', farm: 'home', add: 'sum', sub: 'diff',
    oddeven: 'parity', letters: 'letter', animals: 'animal', shapes: 'shape', colors: 'color', dots: 'n', stars: 'n' };
  function ruleKind(k) { k = low(k); k = KIND_ALIAS[k] || k; return RULE_KINDS.indexOf(k) >= 0 || k === 'count' ? k : null; }
  function kindFromPrompt(topic, pk, mode) {
    pk = String(pk || '');
    var m = /^p\.(\w+?)(5)?(\.first)?$/.exec(pk);
    var tp = m ? m[1] : topic;
    switch (tp) {
      case 'colors': return 'color';
      case 'shapes': return 'shape';
      case 'size': return 'size';
      case 'countSeq': return 'seq';
      case 'countSel': return 'n';
      case 'count': return mode === 'countSeq' ? 'seq' : 'n';
      case 'animals': case 'animal': return 'animal';
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
    if (ev.mode === 'countSeq' || /^p\.countSeq/.test(String(ev.promptKey || ''))) kind = 'seq';
    else if (ev.mode === 'countSel' || /^p\.countSel/.test(String(ev.promptKey || ''))) kind = 'n';
    if (kind === 'count') kind = 'n';
    if (kind === 'letter' && (ev.topic === 'lower' || /^p\.lower/.test(String(ev.promptKey || '')))) kind = 'lower';
    var value = r.value != null ? r.value : r.nameValue;
    var p = obj(ev.params);
    if (value == null) {
      switch (kind) {
        case 'color': value = p.color; break;
        case 'shape': value = p.shape; break;
        case 'animal': value = p.animal; break;
        case 'home': value = p.home; break;
        case 'n': case 'seq': case 'sum': case 'diff': value = p.n; break;
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
  function join(a, b) { a = a || ''; b = b || ''; return a && b ? a + ' ' + b : (a || b); }
  function countList(lang, n) {
    lang = L(lang);
    var c = num(n);
    if (c == null || c < 1) return '';
    var list = [];
    for (var i = 1; i <= c; i++) list.push(numberName(lang, i));
    return capFirst(list.join(', ')) + '!';
  }
  function launchNo(ev) {   // 1-based number of the launch the event is about (launch, or the legacy row)
    var j = num(ev.launch) != null ? num(ev.launch) : num(ev.row);
    return j != null ? j + 1 : null;
  }
  // countSeq: the number this launch needs (DESIGN §5.2 'wrong' / 'right' / 'next' payloads — defensive about missing fields).
  // Never round.params.n / rule.value: that is k (how many launches), not this launch's number.
  function seqWant(ev) {
    var w = obj(ev.want), wr = obj(w.rule);
    return firstNum(ev.need, w.n, w.need, w.count, wr.n, wr.need, ev.count, launchNo(ev));
  }
  function seqCount(ev, t) {
    return firstNum(ev.count, obj(ev.count).n, launchNo(ev), num(ev.i) != null ? num(ev.i) + 1 : null, t.n);
  }
  // the pump tail of a right line ("Now pump!") — main can turn it off with e.pump === false
  function pumpTail(lang, ev, rng) { return ev.pump === false ? '' : I18N.t(lang, 'right.pump', null, rng); }

  // `right {id, thing, x, y, launch, k, left, home?, count?}` (+ topic, promptKey, params, rule, mode) → names the thing,
  // then "Now pump!" ("A red mug! Now pump!" / "Cái cốc màu đỏ! Giờ bé bơm nhé!"). countSeq: "Number 2! Now pump!";
  // countSel: "4 pinecones! Now pump!" (the pinecones are counted aloud later, on collect: sayCountUp).
  I18N.sayRight = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var t = obj(evThing(ev)), r = ruleOf(ev), line = '';
    if (r.kind === 'seq') {
      var c = seqCount(ev, t);
      line = c == null ? I18N.t(lang, 'right.any', null, rng) : I18N.t(lang, 'right.seq', { n: String(c) }, rng);
      return join(line, pumpTail(lang, ev, rng));
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
    return join(line, pumpTail(lang, ev, rng));
  };

  // the short goal of a rule for the 'next' reminder ("red", "the star", "4 pinecones" / "màu đỏ", "ngôi sao", "4 quả thông")
  function nextWhat(lang, r) {
    var T = NAMES[lang], vi = lang === 'vi', v = r.value, k;
    switch (r.kind) {
      case 'color': k = colorOf(v); return k ? (vi ? T.color[k] : T.hue[k]) : '';
      case 'shape': k = shapeOf(v); return k ? (vi ? T.shape[k] : 'the ' + T.shape[k]) : '';
      case 'size': k = sizeOf(v); return k ? (vi ? 'cái ' + T.size[k] : 'the ' + T.size[k] + ' one') : '';
      case 'n': { var n = num(v); return n == null ? '' : n + ' ' + noun(lang, 'dot', n); }
      case 'animal': k = animalOf(v); return k ? (vi ? T.animal[k] : 'the ' + T.animal[k]) : '';
      case 'letter': return v != null && v !== '' ? (vi ? 'chữ ' : 'letter ') + String(v) : '';
      case 'lower': {
        if (v == null || v === '') return '';
        var U = String(v).toUpperCase(), lw = String(v).toLowerCase();
        return vi ? 'chữ ' + U + ' hoa hoặc chữ ' + lw + ' thường' : 'big ' + U + ' or small ' + lw;
      }
      case 'initial': return v != null && v !== '' ? (vi ? 'bạn bắt đầu bằng chữ ' : 'one that starts with ') + String(v).toUpperCase() : '';
      case 'sum': case 'diff': { var s = num(v); return s == null ? '' : (vi ? 'phép tính bằng ' : 'one that makes ') + s; }
      case 'parity': k = parityOf(v); return k ? (vi ? 'số ' + T.parity[k] : anFix('a ' + T.parity[k] + ' number')) : '';
    }
    return '';
  }
  // `next {launch, left}` (+ topic, promptKey, params, rule, mode): the reminder before launch j ≥ 1 — short, the full
  // question was asked before launch 0. "Next one: red!" / "Tiếp nè: màu đỏ nhé!"; countSeq "Now 2!" / "Giờ tới số 2 nào!";
  // home "Next one: who lives on the farm?".
  I18N.sayNext = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var r = ruleOf(ev);
    if (r.kind === 'seq') {
      var n = firstNum(ev.need, ev.count, launchNo(ev));
      return n == null ? I18N.t(lang, 'next.any', null, rng) : I18N.t(lang, 'next.seq', { n: String(n) }, rng);
    }
    if (r.kind === 'home') {
      var h = homeOf(r.value);
      return h ? I18N.t(lang, 'next.home', { home: h }, rng) : I18N.t(lang, 'next.any', null, rng);
    }
    var what = nextWhat(lang, r);
    return what ? I18N.t(lang, 'next', { what: what }, rng) : I18N.t(lang, 'next.any', null, rng);
  };

  // the pump count (DESIGN §6): n = 1..3 → "One!", "Two!", "Three! Blast off!" / "Một!", "Hai!", "Ba! Bay nào!".
  // from < n merges the numbers a fast pumper ran ahead of the voice into ONE line: sayPump(lang, 3, 2) → "Two, three!
  // Blast off!" (Voice.sayPump uses it: no number is skipped and the voice never lags behind the rocket).
  I18N.sayPump = function (lang, n, from) {
    lang = L(lang);
    var c = num(n);
    if (c == null || c < 1) return '';
    var f = num(from);
    if (f == null || f < 1 || f > c) f = c;
    var list = [];
    for (var i = f; i <= c; i++) list.push(numberName(lang, i));
    var s = capFirst(list.join(', ')) + '!';
    if (c >= PUMP_COUNT) s += ' ' + STR[lang]['pump.blast'][0];
    return s;
  };
  I18N.PUMP_COUNT = PUMP_COUNT;

  function goalParams(lang, r, ev) {
    var T = NAMES[lang];
    switch (r.kind) {
      case 'color': return { color: r.value };
      case 'shape': return { shape: r.value };
      case 'size': return { size: sizeOf(r.value) ? T.size[sizeOf(r.value)] : '' };
      case 'seq': { var sw = seqWant(ev || {}); return { want: sw == null ? '' : String(sw) }; }
      case 'n': { var n = num(r.value); return { what: n == null ? '' : n + ' ' + noun(lang, 'dot', n) }; }
      case 'animal': return { animal: r.value };
      case 'home': return { home: r.value };
      case 'letter': case 'initial': return { letter: r.value != null ? String(r.value).toUpperCase() : '' };
      case 'lower': return { letter: r.value != null ? String(r.value).toUpperCase() : '', lower: r.value != null ? String(r.value).toLowerCase() : '' };
      case 'sum': case 'diff': return { n: num(r.value) != null ? num(r.value) : '' };
      case 'parity': return { parity: r.value };
    }
    return {};
  }
  // the tapped thing named ("That’s a blue mushroom." / "Đây là cây nấm màu xanh dương.") + what it is about
  function wrongIs(lang, ev, r, t, rng) {
    switch (r.kind) {
      case 'seq': {
        var g = firstNum(t.n, tileNumber(t), obj(ev.got).nameValue);
        if (g == null) break;
        return I18N.t(lang, 'wrong.seq', { got: String(g) }, rng);
      }
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
    var line = I18N.t(lang, thingKind(t) === 'dots' ? 'wrong.dots' : 'wrong.is', { thing: th }, rng);
    if (r.kind === 'home') {
      var h = homeOfThing({}, t);
      if (h) line = join(line, I18N.t(lang, 'wrong.livesAt', { home: NAMES[lang].homeAt[h] }, rng));
    } else if (r.kind === 'initial') {
      var w = bareWord(lang, t);
      if (w) line = join(line, I18N.t(lang, 'wrong.starts', { word: w, first: initial(lang, t) }, rng));
    }
    return line;
  }
  function goalLine(lang, ev, r, rng) {
    if (!r.kind || !STR[lang]['goal.' + r.kind]) return I18N.t(lang, 'goal.any', null, rng);
    return I18N.t(lang, 'goal.' + r.kind, goalParams(lang, r, ev), rng);
  }
  // `wrong {id, got:{nameKind,nameValue}, want, streak, x, y}` (+ thing, topic, promptKey, params, rule) → names it, then
  // the goal, kindly ("That’s a blue mushroom. Find a red one!" / "Đây là cây nấm màu xanh dương. Mình tìm cái màu đỏ
  // nhé!"); countSeq: "That’s 4. Which one is 2?" / "Đây là số 4. Số 2 đâu nhỉ?"
  I18N.sayWrong = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var t = obj(evThing(ev)), r = ruleOf(ev);
    var line = join(wrongIs(lang, ev, r, t, rng), goalLine(lang, ev, r, rng));
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

  // `pennant {id, slot, thing}` (+ main's context): the thing goes up the camp flagpole — short, names it:
  // "The red mug on the flagpole!" / "Cái cốc màu đỏ lên cột cờ rồi!" (a {child} variant when the name is set)
  I18N.sayPennant = function (lang, ev, rng) {
    lang = L(lang);
    ev = obj(ev);
    var t = obj(evThing(ev)), r = ruleOf(ev);
    var th = phrase(lang, t, { art: 'the', size: r.kind === 'size' ? true : undefined });
    return th ? I18N.t(lang, 'pennant', { thing: th }, rng) : I18N.t(lang, 'pennant.any', null, rng);
  };

  // Counting aloud: i → "One!" … "Twenty!" (beyond: the digits)
  I18N.sayCount = function (lang, i) {
    lang = L(lang);
    var c = num(i);
    if (c == null) return I18N.t(lang, 'praise');
    if (STR[lang]['count.' + c]) return STR[lang]['count.' + c];
    return capFirst(String(c)) + '!';
  };
  function countNoun(kind) {
    var k = String(kind || '');
    if (/^(flag|pennant)/.test(k)) return 'flag';
    if (/^mat/.test(k)) return 'mat';
    return 'dot';                                   // 'pinecones' (default), legacy 'dots'
  }
  // The total after a count: "Four pinecones!" / "Three flags!" / "Bốn quả thông!" / "Ba lá cờ!";
  // kind 'pinecones' (default, alias 'dots') | 'flags' (alias 'pennants') | 'mats'
  I18N.sayCountRun = function (lang, n, kind) {
    lang = L(lang);
    var c = num(n);
    if (c == null) return I18N.t(lang, 'praise');
    return capFirst(numberName(lang, c) + ' ' + noun(lang, countNoun(kind), c)) + '!';
  };
  // the whole count as ONE line (the world's count {i} events come 0.35–0.4 s apart — too fast for one TTS line each):
  // "One, two, three, four! Four pinecones!" / "Một, hai, ba, bốn! Bốn quả thông!"
  I18N.sayCountUp = function (lang, n, kind) {
    lang = L(lang);
    var c = num(n);
    if (c == null || c < 1) return I18N.t(lang, 'praise');
    return join(countList(lang, c), I18N.sayCountRun(lang, c, kind || 'pinecones'));
  };
  // `camp` (after the last launch): "All our flags! One, two, three! Three flags!" / "Cờ của mình nè! Một, hai, ba! Ba lá cờ!"
  I18N.sayCamp = function (lang, n, rng) {
    lang = L(lang);
    var c = num(n);
    var head = I18N.t(lang, 'camp', null, rng);
    return c == null || c < 1 ? head : join(head, I18N.sayCountUp(lang, c, 'flags'));
  };
  I18N.countList = countList;
  I18N.seqList = seqList;
  I18N.seqThen = seqThen;

  // a thing's plain name: sayName(lang, thing | e) → "the red flower" / "bông hoa màu đỏ"
  I18N.sayName = function (lang, thing) { return phrase(L(lang), thing) || ''; };

  // missed Talk-time answer → "It is red! Good try!", "The penguin lives on the ice! Good try!", "There are 4 dots! …"
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
      case 'obj': return objOf(value) ? I18N.t(lang, 'talk.wrong.a', { answer: NAMES[lang].obj[objOf(value)] }) : I18N.t(lang, 'talk.wrong.any');
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
          return I18N.t(lang, n === 1 ? 'talk.wrong.dot1' : 'talk.wrong.dots', { num: String(n), dotWord: noun(lang, 'dot', n) });
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

  // Text → TTS-friendly text (Voice.say calls this). Display text stays untouched. "Mimi" / "Vịt Mimi" are read as written.
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
      s = s.replace(/(^|[\s!?.])([A-Z]) is for\b/g, function (m, pre, ch) { return pre + LETTER_SPEECH_EN[ch] + ' is for'; });
      s = s.replace(/\b(starts with|start with|with|Listen:) ([A-Z])(?![A-Za-z’'])/g, function (m, w, ch) { return w + ' ' + LETTER_SPEECH_EN[ch]; });
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
  I18N.OBJS = OBJS.slice();
  I18N.TOYS = OBJS.slice();             // sister-game compat (content.js may still read TOYS)
  I18N.ANIMALS = ANIMALS.slice();
  I18N.HOMES = HOMES.slice();
  I18N.MOODS = MOODS.slice();
  I18N.SURPRISES = SURPRISES.slice();
  I18N.NOUN = NOUN;
  I18N.ANIMAL_HOME = ANIMAL_HOME;
  I18N.RULE_KINDS = RULE_KINDS.slice();
  I18N.THING_KINDS = THING_KINDS.slice();
  I18N.PROMPTS = PROMPTS;
  I18N.PARAMS = NEEDS;
  I18N.NAME_TABLE = NAMES;
  I18N.LETTER_VI = LETTER_VI;
  I18N.MAX_COUNT = MAX_COUNT;

  DK.I18N = I18N;
})(window.DK = window.DK || {});
