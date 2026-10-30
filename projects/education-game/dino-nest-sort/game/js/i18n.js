/* Dino Nest Sort — DN.I18N (English + Vietnamese)
 *
 *   DN.I18N.t(lang, key, params, rng?)   → string (variants picked with rng.next()/rng()/Math.random)
 *   DN.I18N.name(lang, kind, value)      → display + spoken name ("red"/"màu đỏ", 7 → "seven"/"bảy")
 *   DN.I18N.words(lang, kind, value)     → accepted spoken forms for speech recognition
 *   DN.I18N.speech(lang, text)           → text tuned for TTS (letter names, + − =)
 *   DN.I18N.sayCorrect(lang, ev, rng)    → Bo's line for a `correct` world event
 *   DN.I18N.talkWrong(lang, kind, value) → gentle "it's X" line for a missed Talk-time answer
 *   DN.I18N.setChild(name)               → default {child} for every t() call
 *   DN.I18N.langs = ['en', 'vi'];  DN.I18N.has(lang, key);  DN.I18N.keys(lang)
 *
 * Params: plain values are inserted as-is; an object {kind, value} is replaced by name(lang, kind, value);
 * {fruit} with a numeric {n} gets the plural-aware form ("3 apples" / "3 quả táo").
 * {child}: if the child's name is empty, variants containing {child} are skipped; if every variant has it,
 * {child} becomes "friend" / "bé". Missing params are removed (never a stray "{x}" on screen).
 *
 * Vietnamese letter names follow the kindergarten/grade-1 PHONICS convention ("đọc theo âm"):
 * B → "bờ", C → "cờ", K → "ca", Q → "quờ", Y → "i dài", Ă → "á", Â → "ớ" … (see LETTER_VI and docs/VOICE.md).
 */
(function (DN) {
  'use strict';

  var LANGS = ['en', 'vi'];

  // ---------------------------------------------------------------- names
  var NAMES = {
    en: {
      color: { red: 'red', blue: 'blue', yellow: 'yellow', green: 'green', orange: 'orange', purple: 'purple', cream: 'white' },
      shape: { circle: 'circle', square: 'square', triangle: 'triangle', star: 'star', heart: 'heart', rectangle: 'rectangle' },
      size: { big: 'big', small: 'small' },
      animal: { fish: 'fish', frog: 'frog', duck: 'duck', bird: 'bird', owl: 'owl', squirrel: 'squirrel', rabbit: 'rabbit',
        cow: 'cow', sheep: 'sheep', bat: 'bat', bear: 'bear', hen: 'hen', cat: 'cat' },
      fruit: { apple: 'apple', banana: 'banana', strawberry: 'strawberry', orange: 'orange' },
      home: { pond: 'pond', tree: 'tree', field: 'field', cave: 'cave' },
      parity: { odd: 'odd', even: 'even' }
    },
    vi: {
      color: { red: 'màu đỏ', blue: 'màu xanh dương', yellow: 'màu vàng', green: 'màu xanh lá', orange: 'màu cam',
        purple: 'màu tím', cream: 'màu trắng' },
      shape: { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', star: 'ngôi sao', heart: 'trái tim',
        rectangle: 'hình chữ nhật' },
      size: { big: 'to', small: 'nhỏ' },
      animal: { fish: 'con cá', frog: 'con ếch', duck: 'con vịt', bird: 'con chim', owl: 'con cú', squirrel: 'con sóc',
        rabbit: 'con thỏ', cow: 'con bò', sheep: 'con cừu', bat: 'con dơi', bear: 'con gấu', hen: 'con gà', cat: 'con mèo' },
      fruit: { apple: 'quả táo', banana: 'quả chuối', strawberry: 'quả dâu', orange: 'quả cam' },
      home: { pond: 'cái ao', tree: 'cái cây', field: 'cánh đồng', cave: 'cái hang' },
      parity: { odd: 'lẻ', even: 'chẵn' }
    }
  };
  // where an animal lives ("The duck lives in the pond!" / "Con vịt sống dưới ao!")
  var HOME_AT = {
    en: { pond: 'in the pond', tree: 'in the tree', field: 'in the field', cave: 'in the cave' },
    vi: { pond: 'dưới ao', tree: 'trên cây', field: 'ngoài cánh đồng', cave: 'trong hang' }
  };
  var PLURAL_EN = { apple: 'apples', banana: 'bananas', strawberry: 'strawberries', orange: 'oranges' };

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
  // Vietnamese letters, phonics names as taught in kindergarten / grade 1 ("âm"), used for display AND speech.
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

  // word kind ('initial' topic) — bare word, no classifier, so the first letter is what Bo says
  var WORD_NAMES = { en: {}, vi: {} };

  // extra accepted spoken forms per kind/value (names are always accepted automatically)
  var WORDS = {
    en: {
      color: { red: ['red', 'read', 'reds'], blue: ['blue', 'blew', 'blues'], yellow: ['yellow', 'yello'],
        green: ['green', 'greens'], orange: ['orange', 'oranges'], purple: ['purple', 'violet', 'pupple'],
        cream: ['white', 'cream'] },
      shape: { circle: ['circle', 'round', 'ring', 'circles'], square: ['square', 'box', 'squares'],
        triangle: ['triangle', 'try angle', 'triangles'], star: ['star', 'stars'], heart: ['heart', 'hearts', 'hart', 'love'],
        rectangle: ['rectangle', 'rectangles'] },
      size: { big: ['big', 'large', 'huge', 'bigger', 'giant'], small: ['small', 'little', 'tiny', 'smaller', 'baby'] },
      animal: { fish: ['fish', 'fishy'], frog: ['frog', 'froggy'], duck: ['duck', 'ducky', 'duckie'], bird: ['bird', 'birdie'],
        owl: ['owl'], squirrel: ['squirrel'], rabbit: ['rabbit', 'bunny'], cow: ['cow'], sheep: ['sheep', 'lamb'],
        bat: ['bat'], bear: ['bear', 'teddy'], hen: ['hen', 'chicken'], cat: ['cat', 'kitty', 'kitten'] },
      fruit: { apple: ['apple', 'apples'], banana: ['banana', 'bananas'], strawberry: ['strawberry', 'strawberries'],
        orange: ['orange', 'oranges'] },
      home: { pond: ['pond', 'water', 'lake', 'pound'], tree: ['tree', 'trees', 'forest'], field: ['field', 'farm', 'grass', 'meadow'],
        cave: ['cave', 'caves'] },
      parity: { odd: ['odd', 'odds'], even: ['even', 'evens'] }
    },
    vi: {
      color: { red: ['đỏ', 'màu đỏ'], blue: ['xanh dương', 'xanh da trời', 'xanh nước biển', 'xanh lam', 'da trời', 'dương'],
        yellow: ['vàng', 'màu vàng'], green: ['xanh lá', 'xanh lá cây', 'xanh lục', 'lá cây'], orange: ['cam', 'màu cam'],
        purple: ['tím', 'màu tím'], cream: ['trắng', 'màu trắng'] },
      shape: { circle: ['hình tròn', 'tròn'], square: ['hình vuông', 'vuông'], triangle: ['tam giác', 'hình tam giác'],
        star: ['ngôi sao', 'sao', 'hình ngôi sao'], heart: ['trái tim', 'tim', 'hình trái tim'],
        rectangle: ['chữ nhật', 'hình chữ nhật'] },
      size: { big: ['to', 'lớn', 'bự', 'to lắm', 'to hơn'], small: ['nhỏ', 'bé', 'nhỏ xíu', 'nhỏ hơn', 'tí hon'] },
      animal: { fish: ['cá', 'con cá'], frog: ['ếch', 'con ếch'], duck: ['vịt', 'con vịt'], bird: ['chim', 'con chim'],
        owl: ['cú', 'con cú', 'cú mèo'], squirrel: ['sóc', 'con sóc'], rabbit: ['thỏ', 'con thỏ'], cow: ['bò', 'con bò'],
        sheep: ['cừu', 'con cừu'], bat: ['dơi', 'con dơi'], bear: ['gấu', 'con gấu'], hen: ['gà', 'con gà', 'gà mái'],
        cat: ['mèo', 'con mèo'] },
      fruit: { apple: ['táo', 'quả táo', 'trái táo'], banana: ['chuối', 'quả chuối', 'trái chuối'],
        strawberry: ['dâu', 'quả dâu', 'dâu tây', 'trái dâu'], orange: ['cam', 'quả cam', 'trái cam'] },
      home: { pond: ['ao', 'cái ao', 'hồ', 'dưới ao', 'dưới nước'], tree: ['cây', 'cái cây', 'trên cây', 'rừng'],
        field: ['cánh đồng', 'đồng cỏ', 'ngoài đồng', 'nông trại', 'cỏ'], cave: ['hang', 'cái hang', 'trong hang', 'hang động'] },
      parity: { odd: ['lẻ', 'số lẻ', 'lẽ', 'lẹ'], even: ['chẵn', 'số chẵn', 'chặn', 'chắn'] }
    }
  };

  // DN.WORDS (spec §5.1) — word lists for the 'initial' topic; content.js may already define it
  var WORD_LIST = {
    en: [['apple', 'fruit_apple', 'A'], ['bear', 'animal_bear', 'B'], ['bat', 'animal_bat', 'B'], ['bird', 'animal_bird', 'B'],
      ['banana', 'fruit_banana', 'B'], ['cat', 'animal_cat', 'C'], ['cow', 'animal_cow', 'C'], ['duck', 'animal_duck', 'D'],
      ['fish', 'animal_fish', 'F'], ['frog', 'animal_frog', 'F'], ['hen', 'animal_hen', 'H'], ['owl', 'animal_owl', 'O'],
      ['orange', 'fruit_orange', 'O'], ['rabbit', 'animal_rabbit', 'R'], ['sheep', 'animal_sheep', 'S'],
      ['squirrel', 'animal_squirrel', 'S'], ['strawberry', 'fruit_strawberry', 'S']],
    vi: [['bò', 'animal_cow', 'B'], ['cá', 'animal_fish', 'C'], ['cú', 'animal_owl', 'C'], ['cừu', 'animal_sheep', 'C'],
      ['cam', 'fruit_orange', 'C'], ['dơi', 'animal_bat', 'D'], ['dâu', 'fruit_strawberry', 'D'], ['gấu', 'animal_bear', 'G'],
      ['gà', 'animal_hen', 'G'], ['mèo', 'animal_cat', 'M'], ['sóc', 'animal_squirrel', 'S'], ['táo', 'fruit_apple', 'T'],
      ['vịt', 'animal_duck', 'V'], ['ếch', 'animal_frog', 'Ê']]
  };
  var WORDS_BY_SPRITE = { en: {}, vi: {} };
  LANGS.forEach(function (l) {
    WORD_LIST[l].forEach(function (w) {
      WORD_NAMES[l][w[0]] = w[0];
      WORDS_BY_SPRITE[l][w[1]] = w[0];
    });
  });
  if (!DN.WORDS) {
    DN.WORDS = {};
    LANGS.forEach(function (l) {
      DN.WORDS[l] = WORD_LIST[l].map(function (w) { return { word: w[0], sprite: w[1], initial: w[2] }; });
    });
  }

  // ---------------------------------------------------------------- strings
  var TOPICS = ['colors', 'shapes', 'size', 'homes', 'count', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
  var LABEL_TYPES = ['color', 'shape', 'size', 'home', 'number', 'letter', 'parity'];

  var STR = {
    en: {
      'ui.title': 'Dino Nest Sort',
      'ui.subtitle': 'Sort, count and learn with Bo!',
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
      'ui.name': "Child's name",
      'ui.namePlaceholder': 'e.g. Mai',
      'ui.sound': 'Sound effects',
      'ui.music': 'Music',
      'ui.voice': "Bo's voice",
      'ui.mic': 'Answer by voice',
      'ui.done': 'Done',
      'ui.stars': 'Stars',
      'ui.chapter': 'Chapter {n}',
      'ui.allDone': 'All done! {stars} stars',
      'ui.welcome': ['Hi {child}! I am Bo. Let’s play!', 'Hi! I am Bo. Let’s play!'],
      'ui.micUnsupported': 'Voice answers are not available here. Tap the buttons!',
      'ui.micDenied': 'The microphone is off. Tap the buttons instead!',
      'ui.voiceMissing': 'Tip for parents: add a voice in Settings › Accessibility › Spoken Content › Voices.',
      'ui.tapOrSay': 'Tap or say the answer!',
      'ui.listening': 'Bo is listening…',
      'ui.skip': 'Skip',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Color Nests',
      'topic.shapes': 'Shape Sort',
      'topic.size': 'Big and Small',
      'topic.homes': 'Animal Homes',
      'topic.count': 'Counting Fruit',
      'topic.letters': 'Letter Eggs',
      'topic.lower': 'Small Letters',
      'topic.initial': 'First Letters',
      'topic.add': 'Adding Eggs',
      'topic.sub': 'Take Away',
      'topic.oddeven': 'Odd and Even',

      'weather.0': 'Sunny morning',
      'weather.1': 'Breezy afternoon',
      'weather.2': 'Soft rain',
      'weather.3': 'Rainbow evening',

      'p.colors': 'Put each egg in the nest of the same color!',
      'p.shapes': 'Put each shape in its matching nest!',
      'p.size': 'Big eggs in the big nest, small eggs in the small one!',
      'p.homes': 'Help each animal find its home!',
      'p.count': 'Put {n} {fruit} in the nest!',
      'p.letters': 'Put each egg in the nest with the same letter!',
      'p.lower': 'Find the big letter for each small letter!',
      'p.initial': 'Which letter does each picture start with?',
      'p.add': 'Add them up! Find the nest with the answer.',
      'p.sub': 'Take away! Find the nest with the answer.',
      'p.oddeven': 'Odd numbers here, even numbers there!',

      'say.correct.color': ['Yes! It is {answer}!', '{answer}! Just right!', 'Yes, {answer} goes here!'],
      'say.correct.shape': ['Yes! A {answer}!', 'That is a {answer}!', '{answer}! Well done!'],
      'say.correct.size': ['Yes! That one is {answer}!', '{answer}! You got it!'],
      'say.correct.home': ['The {name} lives {homeAt}!', 'Yes! The {name} lives {homeAt}!'],
      'say.correct.number': ['Yes! {name} makes {answer}!', '{name} is {answer}!'],
      'say.correct.letter': ['Yes! The letter {answer}!', 'That is the letter {answer}!'],
      'say.correct.word': ['{name} starts with the letter {answer}!'],
      'say.correct.parity': ['Yes! {name} is {answer}!', '{name} is an {answer} number!'],
      'say.correct.count': ['{n}!'],
      'say.countDone': ['Yes! {n} {fruit}!', 'You counted {n} {fruit}!'],

      'praise': ['Yes!', 'Great job!', 'You got it!', 'Super!', 'Wonderful!', 'Nice one!', 'Hooray!', 'Well done!'],
      'great': ['Great job, {child}!', 'You did it, {child}!', 'All sorted! Amazing!', 'Wow, {child}, you are a star!',
        'Super sorting!', 'Hooray! All done!', 'You are so clever!'],
      'wrong': ['Hmm, let’s try another nest!', 'Almost! Try again!', 'Ooh, let’s look again!', 'Try a different nest!',
        'So close! One more try!', 'Let’s think again!', 'Keep trying, you can do it!'],
      'miss': ['Oops! Drop it in a nest!', 'Into a nest, please!', 'Whee! Let’s put it in a nest!',
        'Bring it to a nest!', 'The nests are down here!'],
      'hint': ['Look! This nest is glowing.', 'Psst! Try the shiny nest!', 'Here is a clue: the glowing nest!',
        'Bo will help! Look here!', 'Try the sparkly one!'],
      'idle': ['Pick one up and move it!', 'Want to play? Drag one to a nest!', 'Bo is waiting! Your turn!',
        'Touch one and slide it!', 'Let’s play! Pick one up!', 'I am here, {child}! Let’s sort!'],

      'talk.intro': 'Talk time! Bo has a question.',
      'talk.colors': 'What color is this egg?',
      'talk.shapes': 'What shape is this?',
      'talk.size': 'Is this egg big or small?',
      'talk.homes': 'Where does it live?',
      'talk.count': 'How many can you see?',
      'talk.letters': 'Which letter is this?',
      'talk.lower': 'Which letter is this?',
      'talk.initial': 'Which letter does it start with?',
      'talk.add': 'What is the answer?',
      'talk.sub': 'What is the answer?',
      'talk.oddeven': 'Is it odd or even?',
      'talk.right': ['Yes! You are right!', 'Correct! Hooray!', 'Wow, you know it!', 'That is it! Super!',
        'Clever you!', 'Yes, {child}! Great answer!'],
      'talk.wrong': 'It is {answer}! Good try!',
      'talk.wrong.home': 'It lives {answer}! Good try!',
      'talk.wrong.letter': 'It is the letter {answer}! Good try!',
      'talk.wrong.parity': 'It is {answer}! Good try!',

      'session.done': ['You did it all! {stars} stars! Hooray!', 'Amazing, {child}! {stars} stars!']
    },
    vi: {
      'ui.title': 'Khủng Long Bo Xếp Tổ',
      'ui.subtitle': 'Cùng Bo xếp, đếm và học nhé!',
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
      'ui.voice': 'Giọng của Bo',
      'ui.mic': 'Trả lời bằng giọng nói',
      'ui.done': 'Xong',
      'ui.stars': 'Ngôi sao',
      'ui.chapter': 'Chương {n}',
      'ui.allDone': 'Hoàn thành! {stars} ngôi sao',
      'ui.welcome': ['Chào bé {child}! Bo đây. Mình cùng chơi nhé!', 'Chào bé! Bo đây. Mình cùng chơi nhé!'],
      'ui.micUnsupported': 'Máy này chưa nghe được giọng nói. Bé chạm nút nhé!',
      'ui.micDenied': 'Micrô đang tắt. Bé chạm nút nhé!',
      'ui.voiceMissing': 'Mẹo cho bố mẹ: thêm giọng tiếng Việt trong Cài đặt › Trợ năng › Nội dung được đọc › Giọng nói.',
      'ui.tapOrSay': 'Bé chạm hoặc nói đáp án nhé!',
      'ui.listening': 'Bo đang nghe…',
      'ui.skip': 'Bỏ qua',
      'ui.langName.en': 'English',
      'ui.langName.vi': 'Tiếng Việt',

      'topic.colors': 'Màu sắc',
      'topic.shapes': 'Các hình',
      'topic.size': 'To và nhỏ',
      'topic.homes': 'Nhà của các con vật',
      'topic.count': 'Đếm trái cây',
      'topic.letters': 'Chữ cái',
      'topic.lower': 'Chữ thường',
      'topic.initial': 'Chữ cái đầu tiên',
      'topic.add': 'Phép cộng',
      'topic.sub': 'Phép trừ',
      'topic.oddeven': 'Số chẵn, số lẻ',

      'weather.0': 'Buổi sáng nắng đẹp',
      'weather.1': 'Buổi chiều gió mát',
      'weather.2': 'Mưa nhẹ',
      'weather.3': 'Buổi tối cầu vồng',

      'p.colors': 'Bé ơi, hãy đặt mỗi quả trứng vào tổ cùng màu nhé!',
      'p.shapes': 'Bé xếp mỗi hình vào tổ có hình giống nhé!',
      'p.size': 'Trứng to vào tổ to, trứng nhỏ vào tổ nhỏ nhé!',
      'p.homes': 'Bé giúp các con vật về nhà nhé!',
      'p.count': 'Bé đặt {n} {fruit} vào tổ nhé!',
      'p.letters': 'Bé đặt trứng vào tổ có chữ giống nhé!',
      'p.lower': 'Bé tìm chữ in hoa cho mỗi chữ thường nhé!',
      'p.initial': 'Mỗi hình bắt đầu bằng chữ gì nào?',
      'p.add': 'Bé tính phép cộng rồi tìm tổ có đáp số nhé!',
      'p.sub': 'Bé tính phép trừ rồi tìm tổ có đáp số nhé!',
      'p.oddeven': 'Số lẻ vào tổ lẻ, số chẵn vào tổ chẵn nhé!',

      'say.correct.color': ['Đúng rồi! {answer} đó!', '{answer}! Bé giỏi quá!', 'Đúng rồi, {answer}!'],
      'say.correct.shape': ['Đúng rồi! {answer} đó!', '{answer}! Bé giỏi quá!'],
      'say.correct.size': ['Đúng rồi! Trứng {answer}!', 'Trứng {answer} vào tổ {answer}!'],
      'say.correct.home': ['{name} sống {homeAt}!', 'Đúng rồi! {name} sống {homeAt} đó!'],
      'say.correct.number': ['Đúng rồi! {name} bằng {answer}!', '{name} bằng {answer}!'],
      'say.correct.letter': ['Đúng rồi! Chữ {answer}!', 'Đây là chữ {answer} đó!'],
      'say.correct.word': ['{name} bắt đầu bằng chữ {answer}!'],
      'say.correct.parity': ['Đúng rồi! {name} là số {answer}!', '{name} là số {answer} đó!'],
      'say.correct.count': ['{n}!'],
      'say.countDone': ['Đúng rồi! {n} {fruit}!', 'Bé đếm được {n} {fruit} rồi!'],

      'praise': ['Đúng rồi!', 'Giỏi quá!', 'Tuyệt vời!', 'Hoan hô!', 'Bé giỏi lắm!', 'Chính xác!', 'Siêu quá!', 'Hay lắm!'],
      'great': ['Bé {child} giỏi quá!', 'Hoan hô bé {child}!', 'Xong rồi! Bé tuyệt lắm!', 'Oa, bé {child} là ngôi sao đó!',
        'Bé xếp giỏi quá!', 'Hoan hô, xong hết rồi!', 'Bé thông minh quá!'],
      'wrong': ['Ồ, bé thử tổ khác nhé!', 'Gần đúng rồi! Thử lại nào!', 'Mình nhìn lại nhé!', 'Bé thử lại lần nữa nào!',
        'Suýt nữa thôi! Thử tiếp nhé!', 'Không sao đâu, thử lại nhé!', 'Bé nghĩ thêm chút nữa nhé!'],
      'miss': ['Ối! Bé thả vào tổ nhé!', 'Đặt vào tổ nào bé ơi!', 'Tổ ở dưới này nè!', 'Bé kéo vào tổ nhé!',
        'Thả vào một cái tổ nào!'],
      'hint': ['Nhìn nè! Tổ này đang sáng.', 'Bé thử tổ lấp lánh nhé!', 'Bo gợi ý nè: tổ đang sáng!',
        'Bo giúp bé nhé, nhìn đây!', 'Tổ sáng lấp lánh đó bé!'],
      'idle': ['Bé ơi, chơi tiếp nào!', 'Bé chạm vào một món rồi kéo nhé!', 'Bo đang chờ bé nè!', 'Đến lượt bé rồi đó!',
        'Bé {child} ơi, mình chơi tiếp nhé!', 'Kéo một món vào tổ nào!'],

      'talk.intro': 'Giờ trò chuyện! Bo hỏi bé nhé.',
      'talk.colors': 'Quả trứng này màu gì nhỉ?',
      'talk.shapes': 'Đây là hình gì nào?',
      'talk.size': 'Quả trứng này to hay nhỏ?',
      'talk.homes': 'Con vật này sống ở đâu nhỉ?',
      'talk.count': 'Bé đếm xem có bao nhiêu nào?',
      'talk.letters': 'Đây là chữ gì nào?',
      'talk.lower': 'Đây là chữ gì nào?',
      'talk.initial': 'Hình này bắt đầu bằng chữ gì nhỉ?',
      'talk.add': 'Kết quả là bao nhiêu nào?',
      'talk.sub': 'Kết quả là bao nhiêu nào?',
      'talk.oddeven': 'Số này chẵn hay lẻ nhỉ?',
      'talk.right': ['Đúng rồi! Bé giỏi quá!', 'Chính xác! Hoan hô!', 'Oa, bé biết rồi!', 'Đúng luôn! Siêu quá!',
        'Bé thông minh quá!', 'Đúng rồi, bé {child} ơi!'],
      'talk.wrong': 'Là {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.home': 'Nó sống {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.letter': 'Là chữ {answer} đó! Bé cố gắng lắm!',
      'talk.wrong.parity': 'Là số {answer} đó! Bé cố gắng lắm!',

      'session.done': ['Bé làm xong hết rồi! {stars} ngôi sao! Hoan hô!', 'Bé {child} giỏi quá! {stars} ngôi sao!']
    }
  };

  var CHILD_FALLBACK = { en: 'friend', vi: 'bé' };
  // keys whose {child} variant is always used when a name is known
  var CHILD_PREFERRED = { 'ui.welcome': 1 };

  // ---------------------------------------------------------------- helpers
  function L(lang) { return lang === 'vi' ? 'vi' : 'en'; }
  function rnd(rng) {
    if (rng && typeof rng.next === 'function') return rng.next();
    if (typeof rng === 'function') return rng();
    return Math.random();
  }
  function stripMarks(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFC');
  }
  function capFirst(s) {
    return s.replace(/^(\s*[“"'(¡¿]*)(\p{Ll})/u, function (m, pre, ch) { return pre + ch.toUpperCase(); });
  }
  function upper(v) { return String(v).toUpperCase(); }

  function numberName(lang, n) {
    var v = parseInt(n, 10);
    if (isNaN(v)) return String(n);
    if (v >= 0 && v <= 20) return NUM[lang][v];
    return String(v);
  }
  function splitOp(value) { // '2+3' → ['2','+','3'];  '7−2' / '7-2' → ['7','−','2']
    var m = String(value).replace(/\s+/g, '').match(/^(\d+)([+−\-])(\d+)$/);
    return m ? [m[1], m[2] === '+' ? '+' : '−', m[3]] : null;
  }

  function name(lang, kind, value) {
    lang = L(lang);
    var tbl;
    switch (kind) {
      case 'number': return numberName(lang, value);
      case 'letter': {
        if (lang === 'vi') return LETTER_VI[upper(value)] || String(value).toLowerCase();
        return String(value);
      }
      case 'sum': case 'diff': {
        var p = splitOp(value);
        if (!p) return String(value);
        var op = p[1] === '+' ? (lang === 'vi' ? 'cộng' : 'plus') : (lang === 'vi' ? 'trừ' : 'minus');
        return numberName(lang, p[0]) + ' ' + op + ' ' + numberName(lang, p[2]);
      }
      case 'word': {
        var w = String(value);
        if (WORD_NAMES[lang][w]) return w;
        if (WORDS_BY_SPRITE[lang][w]) return WORDS_BY_SPRITE[lang][w];
        return w;
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
    var out = [];
    switch (kind) {
      case 'number': return numberWords(lang, value);
      case 'letter': {
        var U = upper(value);
        var base = [U.toLowerCase(), 'letter ' + U.toLowerCase(), 'chữ ' + U.toLowerCase()];
        if (lang === 'vi') {
          base.push(LETTER_VI[U] || U.toLowerCase());
          if (LETTER_VI[U]) base.push('chữ ' + LETTER_VI[U]);
          base = base.concat(LETTER_WORDS_VI[U] || []);
        } else {
          base = base.concat(LETTER_WORDS_EN[U] || []);
          if (LETTER_SPEECH_EN[U]) base.push(LETTER_SPEECH_EN[U]);
        }
        if (lang === 'vi') {          // no stripped forms: Ă/Â≠A, Đ≠D, Ê≠E, Ô/Ơ≠O, Ư≠U (the matcher still tries
          base.forEach(function (w) { // diacritic-free comparison, but at a lower score than an exact match)
            w = w.toLowerCase(); if (out.indexOf(w) < 0) out.push(w);
          });
          return out;
        }
        return addForms(out, base);
      }
      case 'sum': case 'diff': {
        var p = splitOp(value);
        if (!p) return addForms(out, [String(value)]);
        addForms(out, [name(lang, kind, value), p[0] + ' ' + (p[1] === '+' ? (lang === 'vi' ? 'cộng' : 'plus') :
          (lang === 'vi' ? 'trừ' : 'minus')) + ' ' + p[2]]);
        return out;
      }
      case 'word': {
        var w = name(lang, 'word', value);
        var list = [w];
        var spr = null;
        WORD_LIST[lang].forEach(function (e) { if (e[0] === w) spr = e[1]; });
        if (spr) {
          var parts = spr.split('_'), k = parts[0], id = parts[1];
          if (WORDS[lang][k] && WORDS[lang][k][id]) list = list.concat(WORDS[lang][k][id]);
        }
        return addForms(out, list);
      }
      default: {
        var nm = NAMES[lang][kind] && NAMES[lang][kind][value];
        var extra = WORDS[lang][kind] && WORDS[lang][kind][value];
        var l2 = [];
        if (nm) l2.push(nm);
        if (extra) l2 = l2.concat(extra);
        if (!l2.length) l2.push(String(value));
        return addForms(out, l2);
      }
    }
  }

  // ---------------------------------------------------------------- t()
  var I18N = { langs: LANGS.slice(), child: '' };

  function resolveParam(lang, key, val, params) {
    if (val == null) return '';
    if (typeof val === 'object' && val.kind) return name(lang, val.kind, val.value);
    if (key === 'fruit') {
      var id = String(val);
      if (NAMES.en.fruit[id]) {
        var n = params && params.n != null ? (typeof params.n === 'object' ? params.n.value : params.n) : null;
        if (lang === 'en') return (n != null && Number(n) !== 1) ? PLURAL_EN[id] : NAMES.en.fruit[id];
        return NAMES.vi.fruit[id];
      }
    }
    if (key === 'homeAt' && HOME_AT[lang][val]) return HOME_AT[lang][val];
    return String(val);
  }

  function fill(lang, str, params, child) {
    if (!child) str = str.replace(/(bé|Bé) \{child\}/g, '$1');
    var out = str.replace(/\{(\w+)\}/g, function (m, k) {
      if (k === 'child') return child || CHILD_FALLBACK[lang];
      return resolveParam(lang, k, params ? params[k] : null, params);
    });
    out = out.replace(/\s+([,.!?…])/g, '$1').replace(/\s{2,}/g, ' ').replace(/,\s*([!?.])/g, '$1').trim();
    out = out.replace(/([.!?]\s+)(\p{Ll})/gu, function (m, pre, ch) { return pre + ch.toUpperCase(); });
    return capFirst(out);
  }

  I18N.t = function (lang, key, params, rng) {
    lang = L(lang);
    var v = STR[lang][key];
    if (v == null) v = STR.en[key];
    if (v == null) return key;
    var child = params && params.child != null ? String(params.child).trim() : String(I18N.child || '').trim();
    if (Array.isArray(v)) {
      var withChild = v.filter(function (s) { return s.indexOf('{child}') >= 0; });
      var noChild = v.filter(function (s) { return s.indexOf('{child}') < 0; });
      var pool = v;
      if (!child) { if (noChild.length) pool = noChild; }
      else if (CHILD_PREFERRED[key] && withChild.length) pool = withChild;
      v = pool[Math.min(pool.length - 1, Math.floor(rnd(rng) * pool.length))];
    }
    return fill(lang, v, params, child);
  };

  I18N.name = name;
  I18N.words = words;
  I18N.numberName = numberName;
  I18N.stripMarks = stripMarks;
  I18N.has = function (lang, key) { return STR[L(lang)][key] != null; };
  I18N.keys = function (lang) { return Object.keys(STR[L(lang)]); };
  I18N.raw = function (lang, key) { return STR[L(lang)][key]; };
  I18N.setChild = function (nm) { I18N.child = nm ? String(nm).trim().slice(0, 24) : ''; };
  I18N.TOPICS = TOPICS.slice();
  I18N.LABEL_TYPES = LABEL_TYPES.slice();
  I18N.NAME_TABLE = NAMES;     // read-only use (tests / UI)
  I18N.LETTER_VI = LETTER_VI;
  I18N.HOME_AT = HOME_AT;

  // Bo's line for a `correct` event {nameKind, nameValue, label:{type, value}} (count mode: pass {count} for the number)
  I18N.sayCorrect = function (lang, ev, rng) {
    lang = L(lang);
    ev = ev || {};
    var lab = ev.label || {};
    var item = { kind: ev.nameKind, value: ev.nameValue };
    var key = 'say.correct.' + lab.type;
    var params = { name: item.kind ? item : '', answer: lab.type ? { kind: lab.type, value: lab.value } : '' };
    if (lab.type === 'home') {
      params.homeAt = lab.value;
      params.answer = { kind: 'home', value: lab.value };
    } else if (lab.type === 'letter' && ev.nameKind === 'word') {
      key = 'say.correct.word';
    } else if (lab.type === 'number' && ev.nameKind === 'fruit') {
      key = 'say.correct.count';
      params.n = { kind: 'number', value: ev.count != null ? ev.count : lab.value };
    } else if (lab.type === 'parity') {
      params.name = { kind: 'number', value: ev.nameValue };
    }
    if (!I18N.has(lang, key)) return I18N.t(lang, 'praise', null, rng);
    return I18N.t(lang, key, params, rng);
  };

  I18N.talkWrong = function (lang, kind, value) {
    lang = L(lang);
    if (kind && typeof kind === 'object') { value = kind.value; kind = kind.kind; }
    if (kind === 'home') return I18N.t(lang, 'talk.wrong.home', { answer: HOME_AT[lang][value] || name(lang, 'home', value) });
    if (kind === 'letter') return I18N.t(lang, 'talk.wrong.letter', { answer: { kind: kind, value: value } });
    if (kind === 'parity') return I18N.t(lang, 'talk.wrong.parity', { answer: { kind: kind, value: value } });
    return I18N.t(lang, 'talk.wrong', { answer: { kind: kind, value: value } });
  };

  // Text → TTS-friendly text (Voice.say calls this). Display text stays untouched.
  I18N.speech = function (lang, text) {
    lang = L(lang);
    var s = String(text == null ? '' : text);
    s = s.replace(/[…]/g, '.').replace(/[›»«]/g, ',');
    if (lang === 'en') {
      s = s.replace(/\bletter ([A-Za-z])\b/g, function (m, ch) { return 'letter ' + (LETTER_SPEECH_EN[ch.toUpperCase()] || ch); });
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 plus $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 minus $2')
        .replace(/\s=\s/g, ' equals ');
      s = s.replace(/\bBo\b/g, 'Bo');
    } else {
      s = s.replace(/(\d)\s*\+\s*(\d)/g, '$1 cộng $2').replace(/(\d)\s*[−\-]\s*(\d)/g, '$1 trừ $2')
        .replace(/\s=\s/g, ' bằng ');
    }
    return s.replace(/\s{2,}/g, ' ').trim();
  };

  DN.I18N = I18N;
})(window.DN = window.DN || {});
