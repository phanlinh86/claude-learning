# Owlet's Snow Garden — Voice, language and input

Files: `game/js/i18n.js` (`SG.I18N`), `game/js/voice.js` (`SG.Voice`), `game/js/input.js` (`SG.Input`).
Tests: `node tests/unit/i18n_voice.test.js` (≈ 11 000 checks: keys in both languages, every name, every prompt with the
real `content.js` rounds/talks, arctic-animal matcher EN/VI with and without diacritics, voice queue, input).
voice.js / input.js / storage.js / audio.js come from Puppy Garden Catch (all its iOS fixes kept); only the helper changed.

## 0. Wording principles (Lumi)
- **Lumi** is a gentle snowy owlet who keeps a flower garden in the snow. Same name in both languages; speaks in the
  first person ("I am Lumi" / "Lumi đây"), calls the child by name when the parent set one, otherwise "friend" / "bé".
- **Short and concrete**: ≤ 12 words per spoken line, one action per prompt, the key word last or repeated
  ("Plant a flower for the **seal**!", "Big seeds in the big pot, small seeds in the small pot!").
- **Garden vocabulary everywhere**: seed / pot / flower / plant / bloom — vi **hạt giống / chậu (hoa) / bông hoa / trồng / nở**.
- **Never negative.** Mistakes get "Hmm, let's try another pot!", "So close! One more try!" / "Ồ, bé thử chậu khác nhé!",
  "Không sao đâu, thử lại nhé!". The test bans no / not / wrong / bad / incorrect / fail and "sai / dở / tệ / hỏng".
  Talk-time misses say the answer warmly ("Here is the arctic fox! Good try!" / "Bạn cáo Bắc Cực ở đây nè! Bé cố gắng lắm!").
- **Vietnamese for a 4-year-old**: warm "Bé ơi, … nhé!", "nào!", "nè", "nhỉ?"; correct classifiers — *hạt giống màu đỏ*,
  *chậu hoa*, *bông hoa*; animals are friends: "bạn hải cẩu", "bạn gấu Bắc Cực" (the `animal` name has no classifier,
  templates add "bạn"; the mic also accepts "con …").
- Colour words: EN uses "colour" on screen (TTS reads it the same). VI colours always carry "màu" (màu đỏ, màu xanh dương).
- Every variant list has 5–8 entries and both a `{child}` and a no-name form, so repeated lines don't feel robotic.

### Arctic animals (`animal` kind, DESIGN §6)
| id | EN | VI (display + speech) | also accepted by the mic |
|---|---|---|---|
| bear | polar bear | gấu Bắc Cực | bear, polar, white bear, teddy · gấu, con gấu, gấu trắng |
| seal | seal | hải cẩu | baby seal, seal pup, sea lion · con hải cẩu |
| fox | arctic fox | cáo Bắc Cực | fox, white fox · cáo, con cáo, cáo trắng, cáo tuyết |
| hare | snow hare | thỏ tuyết | hare, bunny, rabbit · thỏ, con thỏ, thỏ trắng |
| reindeer | reindeer | tuần lộc | rain deer, deer, caribou · con tuần lộc, hươu, nai |
| walrus | walrus | hải mã | walruses · con hải mã |
| penguin | penguin | chim cánh cụt | penguins · cánh cụt |
| puffin | puffin | **chim cổ rụt** | puffins · cổ rụt, hải âu cổ rụt, chim hải âu cổ rụt, hải âu, puffin |
| whale | whale | cá voi | beluga, white whale · con cá voi, cá voi trắng |

Puffin: the textbook name is "hải âu cổ rụt"; a kindergarten teacher shortens it to **"chim cổ rụt"** (short, easy to
say, and the picture shows the bird). Every no-diacritic form ("gau bac cuc", "hai cau", "ca voi"…) is accepted too.
"bắc cực", "hải", "chim" alone are ambiguous and match nothing on purpose.

**Open point (vi `initial` words):** Vietnamese kindergartens teach **"ch"** (chờ) and **"th"** (thờ) as their own sounds, so
"chim cánh cụt → C" and "thỏ → T" (DESIGN §5.1) contradict the phonics Lumi uses ("Thỏ bắt đầu bằng chữ tờ!").
Recommendation for content: drop those two from `SG.WORDS.vi` (C still has cáo + cá voi, T has tuần lộc). i18n handles
either list.

## 1. What integration must do
1. Boot: `SG.Voice.init({ lang, enabled })`, `SG.Input.kidProof()`, `SG.I18N.setChild(settings.name)`.
2. **First `touchend`/`click` anywhere** (same handler that resumes the AudioContext): `SG.Voice.unlock()`.
   Before that, `say()` keeps only the newest line and speaks it right after unlock (so the welcome line is not lost).
3. Round prompt: `SG.I18N.t(lang, e.promptKey, e.params)` with the world's `round` / `ask` event **as is** — params are raw
   values (`{animal:'seal'}`, `{n:3, color:'red'}`) and `t()` names them. The Dino `fruitName`/`nName` helpers are not needed.
   - **Ask mode** (`animals`): the `round` event and every `ask` event carry `promptKey:'p.animals', params:{animal}`.
     Speak the full prompt on the first ask of a round; for the following asks you may use the shorter
     `t(lang, 'p.animalsNext', { animal })` ("Now the walrus!" / "Giờ đến bạn hải mã nhé!"). Bubble text = the same string.
4. Feedback:
   - `correct` → `SG.Voice.say(SG.I18N.sayCorrect(lang, ev), { interrupt: true })` where `ev` = the event plus
     `label` of its basket (as Dino). Ask mode gives "A flower for the seal!" / "Bông hoa tặng bạn hải cẩu!".
   - `wrong` → `SG.I18N.sayWrong(lang, { label: potLabel, target: targetBasket.label })` — in ask mode this says
     "That’s the seal’s pot. Where is the polar bear?" / "Chậu của bạn hải cẩu đó. Bạn gấu Bắc Cực đâu nhỉ?";
     anything else falls back to a `wrong[]` variant (so `t('wrong')` is also fine).
   - **`bloom`**: count rounds → `SG.I18N.sayCount(lang, n, need)` with `interrupt: true` — returns "One!", "Two!" … and at
     `n === need` "Three! You planted 3 flowers!" / "Ba! Bé trồng được 3 bông hoa rồi!" (so the last count and the praise
     are one line; then skip the `roundDone` `great` line or queue it). Other rounds: optionally
     `SG.I18N.sayBloom(lang)` ("Pop! A flower!") — only when Lumi is not already talking (it's decoration).
     If you prefer counting on `land` as in Dino, `sayCount` works there too; `sayCorrect` in count mode also returns it.
   - `miss` → `t('miss')`; `hint` → `t('hint')`; `idle` → `t('idle') + ' ' + current prompt`; `roundDone` → `t('great')`;
     `tap`/`grab` → `SG.I18N.name(lang, e.nameKind, e.nameValue)` — seeds in animal/count rounds have kind `seed` with the
     colour as value → "red seed" / "hạt giống màu đỏ".
   - Time of day change (`level` event): `t('weather.' + level)` ("Good morning, garden!" … "Good night, stars! Look at the
     lights!") can follow the chapter title. `session.done {stars}` for the celebration.
   Use `interrupt: true` for answers to the child's action; `priority: true` for lines that must not be dropped (round prompt,
   ask prompt, talk question).
5. `SG.Voice.onStart / onEnd` → Lumi's talk frames and music ducking. `SG.Voice.onVoicesChanged(fn)` → refresh the
   "voice missing" hint in Settings.
6. Talk time: question = `t(lang, talk.promptKey, talk.params)` (`talk.animals` needs `{animal}`, which content passes;
   missing → "Tap an animal friend!"). Mic button tap handler:
   `SG.Voice.listen({ lang, choices: talk.choices.map(c => ({ id: c.id, kind: c.kind, value: c.value })), timeoutMs: 7000 })`.
   Hide the mic when `!SG.Voice.canListen()`; show `ui.micUnsupported` / `ui.micDenied`. Missed answer:
   `SG.I18N.talkWrong(lang, kind, value)`.
7. Settings → language: `SG.Voice.setLang(l)`; voice toggle: `SG.Voice.setEnabled(b)`. If `!SG.Voice.hasVoice('vi')`,
   show `ui.voiceMissing` to the parent. `ui.tapLumi` is available as a hint label.
8. `?novoice=1` → `SG.Voice.setEnabled(false)` (lines are still logged in `SG.Voice.log` / `SG.debug.voiceLog`).
9. `SG.Input.attach(canvas, { toLogical, down, move, up, cancel })` — **handlers get `(x, y, ev)`**: two numbers in
   logical px, then the DOM event. `SG.Input.holdButton(gearBtn, 2000, openSettings, setRing)`.

### 1.1 Params contract (`SG.I18N.PARAMS` = required params; missing → fallback key)
| key | params (raw) | EN | VI | fallback |
|---|---|---|---|---|
| `p.colors` | – | Plant each seed in the pot of the same colour! | Bé ơi, trồng mỗi hạt giống vào chậu cùng màu nhé! | |
| `p.colorsOne` | `color` | Plant the orange seed in the orange pot! | Bé ơi, trồng hạt giống màu đỏ vào chậu màu đỏ nhé! | p.colors |
| `p.shapes` / `p.shapesOne` | – / `shape` | Plant each shape in the pot with the same shape! | Bé ơi, trồng mỗi hình vào chậu có hình giống nhé! | p.shapes |
| `p.size` | (`color` ignored) | Big seeds in the big pot, small seeds in the small pot! | Hạt to vào chậu to, hạt nhỏ vào chậu nhỏ nhé! | |
| `p.count` | `n` (`color` ignored) | Plant 3 flowers! (1 → "1 flower") | Bé ơi, trồng 3 bông hoa nhé! | p.countAny |
| `p.animals` | `animal` | Plant a flower for the polar bear! | Bé ơi, trồng một bông hoa cho bạn gấu Bắc Cực nhé! | p.animalsAll |
| `p.animalsNext` | `animal` | Now the walrus! | Giờ đến bạn hải mã nhé! | p.animalsAll |
| `p.letters` `p.lower` `p.initial` `p.add` `p.sub` `p.oddeven` | – | garden versions of Dino's | | |
| `talk.animals` | `animal` | Where is the snow hare? | Bạn tuần lộc ở đâu nhỉ? | talk.animalsAny |
| `talk.colors` / `talk.count` / `talk.size` | – | What colour is this flower? / How many flowers? / Is it big or small? | Bông hoa này màu gì nhỉ? / Có bao nhiêu bông hoa nào? / Cái này to hay nhỏ nhỉ? | |
| `say.countDone` | `n` | You planted 3 flowers! | Bé trồng được 3 bông hoa rồi! | praise |
| `say.wrong.animal` | `name`, `target` (animal ids) | That’s the seal’s pot. Where is the polar bear? | Chậu của bạn hải cẩu đó. Bạn gấu Bắc Cực đâu nhỉ? | wrong |

Rules: keys `color shape size animal parity` (and `name`/`target` with animal ids) are named automatically; an object
`{kind, value}` is always named; `{flowers}` follows `{n}`; `{sum}`/`{diff}` show as "2 + 3"; English "a" → "an" before a vowel.

### 1.2 `sayCorrect(lang, ev)` by label type
| label | EN | VI |
|---|---|---|
| color | Yes! Red! · A red flower! | Đúng rồi! Màu đỏ đó! · Bông hoa màu đỏ! |
| shape | Yes! The star! · A heart flower! | Đúng rồi! Ngôi sao đó! |
| size | Yes! The big pot! · Small seed, small pot! | Đúng rồi! Chậu to! · Hạt nhỏ vào chậu nhỏ! |
| animal | A flower for the seal! · The seal says thank you! | Bông hoa tặng bạn hải cẩu! · Bạn hải cẩu cảm ơn bé! |
| number (sum/diff) | Yes! Two plus three makes five! | Đúng rồi! Hai cộng ba bằng năm! |
| number (count, nameKind seed) | = `sayCount(count, need)` | |
| letter / word | The letter B! · Walrus starts with the letter W! | Chữ bờ! · Gấu bắt đầu bằng chữ gờ! |
| parity | Yes! Seven is odd! | Đúng rồi! Bảy là số lẻ! |

## 2. How voices are chosen
`speechSynthesis.getVoices()` is read at init, on `voiceschanged` (both `onvoiceschanged` and `addEventListener`) and by
polling every 250 ms for 6 s (iOS fills the list late and may never fire the event). Each voice whose `lang` starts with
the target language is scored:

| rule | score |
|---|---|
| language prefix matches (`en`, `vi`) | base 10 (others are excluded) |
| exact region (`en-US`, `vi-VN`) / `en-GB`, `en-AU` | +6 / +3 |
| preferred name (best first) — en: Samantha, Nicky, Karen, Ava, Allison, Susan, Zoe, Serena, Moira, Tessa, Kate, Google US English, Microsoft Aria/Jenny… · vi: **Linh**, Google Tiếng Việt, Microsoft HoaiMy, Microsoft An | +40 … +23 |
| name contains Enhanced / Premium / Natural / Neural | +12 |
| Google voice on a non-iOS browser | +8 |
| `localService` / `default` | +3 / +2 |
| Apple novelty or Eloquence voices (Fred, Albert, Bubbles, Zarvox, Eddy, Flo, Grandma, Rocko, Sandy…) | −60 |

Utterances: `lang` `en-US` / `vi-VN`, rate **0.9**, pitch **1.2** (Lumi, a gentle little owlet: bright and young but calm; above ≈ 1.3
the iOS voices get squeaky, below ≈ 0.85 rate Vietnamese tones smear), volume 1. If no voice matches, the utterance is still spoken with `lang` set (the system picks
its default voice for that language) and `hasVoice(lang)` is false so the UI can tell the parent.

Queue: one line speaking + at most **2** waiting; when full the oldest non-priority line is dropped; non-priority lines older
than 5 s are dropped when they reach the front. `interrupt` cancels everything and speaks after a 50–90 ms gap (`speak()`
straight after `cancel()` is silently dropped on Safari and sometimes Chrome). A watchdog ends a line after its estimated
duration + 4 s because iOS sometimes never fires `onend` (and historically fired nothing on `cancel()`, WebKit 211776 —
we finish the line ourselves). Desktop Chrome: 10 s `pause()/resume()` keep-alive against the ~15 s cut-off. Speech stops
when the page is hidden; when it becomes visible again the synthesizer is reset (`cancel()` + `resume()`), because iOS can
leave it paused/stuck after the app was in the background.

Text → speech: `SG.I18N.speech(lang, text)` (applied by `say`): EN `letter B` → "bee"; VI `chữ B` →
"chữ bờ" (phonics); `2 + 3` → "2 plus 3" / "2 cộng 3", `=` → "equals" / "bằng", `…` → `.`. The bubble shows the original.

## 3. Vietnamese letter names (convention)
Lumi uses the **phonics names taught in Vietnamese kindergartens and grade 1** ("đọc theo âm") in speech; the screen
shows the capital letter ("chữ B"):

a · ă→**á** · â→**ớ** · b→**bờ** · c→**cờ** · d→**dờ** · đ→**đờ** · e · ê · g→**gờ** · h→**hờ** · i · k→**ca** · l→**lờ** ·
m→**mờ** · n→**nờ** · o · ô · ơ · p→**pờ** · q→**quờ** · r→**rờ** · s→**sờ** · t→**tờ** · u · ư · v→**vờ** · x→**xờ** · y→**i dài**
(non-Vietnamese letters: f→ép, j→gi, w→vê kép, z→dét). `name('vi','letter','B')` returns "bờ" (Talk-time labels).

When listening we also accept the alphabet names parents often use (bê, xê, dê, đê, giê, hát, ca, e-lờ, em-mờ, en-nờ, pê,
quy, e-rờ, ét-xì, tê, vê, ích-xì, i-cờ-rét) and "chữ …" forms. Vietnamese letters are matched with diacritics first, so
"ê" → Ê and "e" → E.

## 4. Speech recognition
`listen()` uses `SpeechRecognition || webkitSpeechRecognition`, `lang` `en-US`/`vi-VN`, `interimResults`, `maxAlternatives 5`,
`continuous false`. It stops TTS first (Lumi must not talk into the mic). A **final** result that matches resolves at once;
an interim match waits 450 ms for more words ("mười" may become "mười hai"). Ends with `{id:null, reason}` on
`no-speech`, `nomatch`, `timeout` (default 7 s), `aborted`, errors. `not-allowed` / `service-not-allowed` turn
`canListen()` off for the session (no retry loops — the child just taps).
While the mic is open `navigator.audioSession.type` (Safari 16.4+) is set to `'play-and-record'` and put back to its previous
value afterwards — on iOS the record route otherwise leaves speech and WebAudio quiet / on the earpiece.

Matcher (`SG.Voice.match(transcripts, choices, lang)`, pure):
- lower-case, NFC, punctuation → spaces; tokens.
- per choice word (from `SG.I18N.words`): exact token sequence (with diacritics) scores 30+len; diacritic-free (`đ`→`d`)
  20+len; number words of **both** languages are also turned into digits ("three", "ba", "mười hai" → 3, 3, 12) 20+len;
  edit distance ≤1 (≤2 for 8+ letters) on single words of 5+ letters with the same first letter, 10+len.
- words written `=to` match only when they are the whole utterance (en "to"→2, "for"→4, vi "không"→0).
- best score wins; equal score → the word said **later** wins ("it's a B" → B); same score and position → ambiguous, try the
  next alternative. First transcript alternative with a match wins; no match → `null`.

## 5. iOS / Safari caveats (carried forward from Puppy Garden Catch, checked 30 Oct 2026, iOS 18 / iOS 26)
- **Only built-in voices reach the web.** Apple: Web Speech exposes pre-installed voices only; voices downloaded in
  Settings (many Enhanced/Premium ones) are often *not* in `getVoices()` in Safari on iOS 16–18
  ([Apple forum 723503](https://developer.apple.com/forums/thread/723503)). Linh (vi-VN) and Samantha (en-US) are
  built in, so the scoring still finds them; if a parent "adds a voice" and nothing changes, that is why. Setting `lang`
  as well as `voice` lets the system fall back to its default voice for the language.
- **iOS 26 voice-preference regression** (native `AVSpeechSynthesisVoice(language:)` returns the default voice instead of
  the one chosen in Settings, [Apple forum 804648](https://developer.apple.com/forums/thread/804648)). We never rely on
  the system preference: we always pick a voice object by name, which the thread confirms still works.
- **Ducking:** Safari ducks other audio (incl. WebAudio) while speaking and for ≈ 1 s after, and
  `navigator.audioSession.type` does not stop it ([WebKit 278598](https://bugs.webkit.org/show_bug.cgi?id=278598)).
  The game's own music duck should be gentle so the two don't stack into silence.
- **Speech recognition needs Siri / dictation** and fails on managed devices (Screen Time / MDM). Errors: `not-allowed`
  = permission/policy, `service-not-allowed` = service off, `no-speech` = silence. Start recognition directly from a tap
  ([WebKit 225298](https://bugs.webkit.org/show_bug.cgi?id=225298), [WebKit 239816](https://bugs.webkit.org/show_bug.cgi?id=239816)).
- **Home-screen web app:** recognition works in Safari tabs but still not in installed web apps
  ([What PWA Can Do Today](https://whatpwacando.today/speech-recognition)). `canListen()` returns false when
  `navigator.standalone` / `display-mode: standalone` on iOS, so the big choice buttons are used. TTS works in both.
- **First utterance must come from a gesture** (iOS, and Chrome autoplay rules): `unlock()` speaks a silent `' '` inside the
  first touchend (iOS ignores `volume`, a single space is silent anyway).
- **Voices load late:** `getVoices()` is often empty at load; we listen for `voiceschanged` and poll
  ([codersblock: TTS quirks](https://codersblock.com/blog/javascript-text-to-speech-and-its-many-quirks/)).
- **Silent switch:** the ring/silent switch mutes WebAudio (SFX/music) in Safari; TTS may or may not be muted depending on the
  iOS version and route — tell parents to turn the switch off and the volume up.
- **Vietnamese voice:** if Linh is missing, parents can add it in Settings › Accessibility › Spoken Content › Voices ›
  Vietnamese. Desktop Chrome has "Google Tiếng Việt" (network voice); Windows Edge has Microsoft HoaiMy/NamMinh (online).
- iOS fires `pointercancel` on system gestures (Control Centre, home swipe) — `SG.Input` turns that into `cancel()`.
- A Bluetooth headset changes the mic route; test with the built-in mic first.

## 6. Input and kid-proofing (`SG.Input`)
- `attach(canvas, h)`: Pointer Events, pointer capture, one finger at a time (a second finger is ignored), ignores targets
  matching `button, .screen, #hud, .no-game-input` (and their children); `pointercancel`, `lostpointercapture`, window blur
  and page hide → `h.cancel()`. Touch + mouse fallback when `PointerEvent` is missing. Optional `hover(x, y)` for a mouse.
- **Signature:** `h.down(x, y, ev)`, `h.move(x, y, ev)`, `h.up(x, y, ev)` — `x`, `y` are the numbers returned by
  `h.toLogical(clientX, clientY)` (logical px, see DESIGN §2). Points that are not finite are dropped (an `up` with a bad
  point becomes `cancel()`). The sister game had a bug where `main.js` treated the first argument as `{x, y}`; the unit
  test now pins `(x, y, ev)`.
- `kidProof()`: injects CSS (`touch-action: manipulation`, no callout/selection, `overscroll-behavior: none`), blocks
  `gesturestart/change/end`, multi-touch `touchstart/touchmove`, single-finger `touchmove` outside `.scroll` and range inputs
  (stops rubber-band and pull-to-refresh), fast double-tap zoom on non-interactive areas, `dblclick`, `contextmenu`,
  `selectstart`, `dragstart`, Ctrl/⌘+wheel, Ctrl/⌘ + `+ − = 0`, F5 and Ctrl/⌘+R. Form fields keep selection and menus.
- `holdButton(el, ms, onDone, onProgress)`: progress 0..1 via rAF; cancels on release, finger sliding > 24 px off the button,
  pointercancel, mouse leave or window blur; Enter/Space also work; a quick tap does nothing. Returns `off()`.

## 7. Adding a language
1. `i18n.js`: add the code to `LANGS`, a `NAMES[xx]` table (same kinds/values), `NUM[xx]` (0–20), optional `NUM_ALT[xx]`,
   letter names, `WORDS[xx]` (accepted spoken forms), `WORD_LIST[xx]` for the `initial` topic and a complete `STR[xx]`
   (the test requires identical key sets) plus `CHILD_FALLBACK[xx]`.
2. `voice.js`: add `LANG_TAG[xx]` (BCP-47, e.g. `fr-FR`) and `PREFERRED[xx]` voice names.
3. Plurals / articles: `{flowers}` and the a→an rule in `fill()` are English-only; add rules there if needed.
4. Run `node tests/unit/i18n_voice.test.js` and add prompt + matcher cases for the new language.
