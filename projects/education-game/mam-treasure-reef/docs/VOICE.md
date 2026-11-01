# Mầm's Treasure Reef — Voice, language and input

Files: `game/js/i18n.js` (`TR.I18N`), `game/js/voice.js` (`TR.Voice`), `game/js/input.js` (`TR.Input`).
Tests: `node tests/unit/i18n_voice.test.js` (≈ 20 000 checks: every key in both languages with the same shape, every
name/word for every kind, every prompt with the real `content.js` rounds/talks (drag + dig, all ages, all lagoons),
sea-friend matcher EN/VI with and without diacritics, the name splitter with a mocked `speechSynthesis`, volume, queue
limits, input signature, the 2 s parent gate). Snow Garden's iOS fixes are all kept; what changed is listed in §1.

## 0. Wording principles (Tutu)
- **Tutu** is a bubbly baby sea turtle. Same name in both languages, first person ("I am Tutu" / "Tutu đây"), quick
  (rate 0.95) so **lines stay ≤ 12 words** (unit-tested for every non-`ui.*` string).
- **Sea vocabulary everywhere**: shell / pearl / tag / gem / treasure / chest / sand mound / dig — vi **vỏ sò / viên ngọc
  trai / thẻ kho báu / viên đá (quý) / kho báu / rương / ụ cát / đào**. No garden words are left (the test bans them).
- **By name.** Every `great[]` line (8 per language) has `{child}`: "You did it, {child}!", "Giỏi quá, {child} ơi!".
  The Vietnamese **dig prompts** start with "{child} ơi, …" ("Mầm ơi, đào vỏ sò màu đỏ lên nhé!"). Without a name,
  `{child}` becomes "friend" / "bé" ("Bé ơi, …", "Hoan hô bé!"); variant lists with a no-name alternative prefer it.
- **Never negative.** Mistakes: "Hmm, let's try another one!", "So close! One more try!" / "Ồ, bé thử cái khác nhé!",
  "Không sao đâu, thử lại nhé!". A wrong mound names the item kindly: "That's a blue shell! Let's look again!" /
  "Đó là vỏ sò màu xanh dương! Mình tìm lại nhé!". Test bans no/not/wrong/bad/fail/incorrect and sai/dở/tệ/hỏng.
- **Vietnamese for a 4-year-old**: "Bé ơi, … nhé!", "nào!", "nè", "nhỉ?"; classifiers — *vỏ sò màu đỏ*, *viên ngọc
  trai*, *rương*; sea friends carry **"con"** in the name itself ("con cua", "con cá heo") so templates use `{animal}`
  directly ("Tìm con cá ngựa nhé!", "Kho báu tặng con cua!"); the mic also accepts the bare word and "bạn …".
- Counting "một, hai, ba…" (`sayCount`): "Hai!" … "Ba! Bé tìm được 3 viên ngọc trai rồi!".

### Sea friends (`animal` kind, DESIGN §5.1)
| id | EN | VI (display + speech) | also accepted by the mic | initial-letter word (EN / VI) |
|---|---|---|---|---|
| crab | crab | con cua | crabs, little crab · cua, bạn cua, cua biển | crab C / cua C |
| octopus | octopus | con bạch tuộc | octopi, squid · bạch tuộc, bạch tuột, mực | octopus O / bạch tuộc B |
| seahorse | seahorse | con cá ngựa | sea horse, horse · cá ngựa, ngựa biển | seahorse S / cá ngựa C |
| clownfish | clownfish | con cá hề | clown fish, **fish**, orange fish · cá hề, cá hè | **fish F** / cá hề C |
| dolphin | dolphin | con cá heo | dolfin · cá heo, heo biển | dolphin D / cá heo C |
| jellyfish | jellyfish | con sứa | jelly fish, jelly · sứa, sứa biển | jellyfish J / sứa S |
| starfish | starfish | con sao biển | star fish, sea star, star · sao biển | starfish S / sao biển S |
| whale | whale | con cá voi | wail, big whale · cá voi, cá voi con | whale W / cá voi C |
| puffer | pufferfish | con cá nóc | puffer fish, puffer, blowfish, balloon fish · cá nóc, cá bóng | pufferfish P / cá nóc C |

`TR.WORDS` (default list in i18n, content.js may replace it) holds these `{word, sprite:'animal_<id>', initial}` entries.
Vietnamese words carry **no classifier** and never start with ch/th/ng (phonics digraphs); six of nine start with "cá"
→ **content must put at most one "cá …" word in a round** (i18n only supplies the list). "cá", "con", "sao", "chim"
alone are ambiguous and match nothing on purpose; "ca heo" ≠ "ca he" (token match, no fuzzy on 2–3-letter words).

### Items (`shell | pearl | tag | treasure` kinds; `seed` is accepted as an alias of `shell`)
`name(lang,'shell','red')` → "red shell" / "vỏ sò màu đỏ"; cream or no colour → "shell" / "vỏ sò". `pearl` → "pearl" /
"viên ngọc trai", `tag` → "tag" / "thẻ kho báu", `treasure` → "treasure" / "kho báu". Shapes are the gem names
("star" / "ngôi sao"). `{pearls}` / `{treasures}` in templates follow `{n}` ("1 pearl", "3 pearls"; vi "viên ngọc trai").

## 1. What integration must do (deltas from Snow Garden in bold)
1. Boot: `TR.Voice.init({ lang, enabled, volume })`, `TR.Input.kidProof()`, **`TR.Voice.setChild({ name, sayAs })`**
   (it forwards to `TR.I18N.setChild`, so `{child}` and the spoken name stay in sync; call it again when the profile changes).
2. **First `touchend`/`click` anywhere** (same handler that resumes the AudioContext): `TR.Voice.unlock()`.
3. **Volume**: settings slider / pause +/− → `TR.Voice.setVolume(v / 100)` (utterance.volume) and `TR.Audio.setVolume`.
4. Round prompt: `t(lang, e.promptKey, e.params)` with the `round` / `ask` / `next` event as is. Drag keys are `p.<topic>`
   (+ `p.colorsOne`, `p.shapesOne`, `p.animalsNext`); **dig keys `p.dig.<topic>`**, **next-target keys `p.next.<topic>`**
   (`e.nextKey`). Every parametrised key has a generic fallback (`p.dig.<topic>Any`, `p.next.any`) so a missing param never
   shows "the !".
5. Feedback (speak with `interrupt: true` for answers to the child's action, `priority: true` for prompts):
   - `correct` → `TR.I18N.sayCorrect(lang, ev)` (`ev` = event + the chest's `label`). Count rounds → `sayCount(n, need)`.
   - `wrong` drag → `sayWrong(lang, { label, target })` (ask mode: "That's the crab's chest. Where is the whale?");
     **`wrong` dig → `sayWrongDig(lang, e.nameKind, e.nameValue)`** ("That's a blue shell! Let's look again!").
   - **`dig`** → `t('say.dig')` ("Poof!") — decoration, skip while Tutu talks; **`crab`** → `t('say.crab')`;
     **`photobomb`** → `t('say.photobomb')`; `land`/`sparkle` (non-count) → `sayLand` optional.
   - `miss` → `t('miss')`; `hint` → `t('hint')`; `idle` → `t('idle') + ' ' + prompt`; `roundDone` → `t('great')`
     (always by name); `levelDone` → `say.levelDone`; lagoon done → `session.done {stars}` + `ui.unlocked {lagoon}` /
     `say.lagoonDone`; chapter start → `lagoon.<key>.intro` (first chapter) + `weather.<0..3>`.
6. Talk time as before (`talk.*`, `listen({ lang, choices: talk.choices.map(c => ({ id, kind, value })) })`, `talkWrong`).
7. Settings: `setLang`, `setEnabled`; `hasVoice('vi')` false → show `ui.voiceMissing`.
8. `TR.Input.attach(canvas, { toLogical, down, move, up, cancel })` — handlers get **`(x, y, ev)`**; dig taps are decided
   by the world (move > 24 px = drag). `TR.Input.holdButton(gearBtn, 2000, openSettings, setRing)` is the parent gate.

### 1.1 Params contract (`TR.I18N.PARAMS` = required params; missing → fallback key)
| key | params | EN | VI | fallback |
|---|---|---|---|---|
| `p.colorsOne` | `color` | Put the orange shell in the orange chest! | Bé ơi, bỏ vỏ sò màu đỏ vào rương màu đỏ nhé! | p.colors |
| `p.count` | `n` | Put 3 pearls in the chest! | Bé ơi, bỏ 3 viên ngọc trai vào rương nhé! | p.countAny |
| `p.animals` / `p.animalsNext` | `animal` | Put a treasure in the crab's chest! / Now the whale! | Bé ơi, bỏ kho báu vào rương của con cua nhé! / Giờ đến con cá heo nhé! | p.animalsAll |
| `p.dig.colors` | `color` | Dig up the red shell! | Mầm ơi, đào vỏ sò màu đỏ lên nhé! | p.dig.colorsAny |
| `p.dig.shapes` | `shape` | Dig up the star! | Mầm ơi, đào ngôi sao lên nhé! | p.dig.shapesAny |
| `p.dig.size` | `size` | Dig up a big shell! | Mầm ơi, đào một vỏ sò to lên nhé! | p.dig.sizeAny |
| `p.dig.count` | `n` | Dig up 3 pearls! | Mầm ơi, đào 3 viên ngọc trai lên nhé! | p.dig.countAny |
| `p.dig.animals` | `animal` | Find the seahorse! | Mầm ơi, tìm con cá ngựa nhé! | p.dig.animalsAny |
| `p.dig.letters` / `p.dig.lower` | `letter` | Dig up the letter B! / Dig up the small letter b! | Mầm ơi, đào chữ B lên nhé! (spoken "chữ bờ") | …Any |
| `p.dig.initial` | `letter` | Dig up the one that starts with the letter C! | Mầm ơi, đào hình bắt đầu bằng chữ C lên nhé! | p.dig.initialAny |
| `p.dig.add` / `p.dig.sub` | `n` (the answer) | Dig up the one that makes 5! | Mầm ơi, đào phép tính bằng 5 lên nhé! | …Any |
| `p.dig.oddeven` | `parity` | Dig up an odd number! | Mầm ơi, đào một số lẻ lên nhé! | p.dig.oddevenAny |
| `p.next.<topic>` | same param as the dig key (`count`: none) | Now the blue one! / Now the letter M! | Giờ đến vỏ sò màu xanh dương nhé! | p.next.any |
| `talk.animals` | `animal` | Where is the starfish? | Con cá voi ở đâu nhỉ? | talk.animalsAny |
| `say.countDone` | `n` | You found 3 pearls! | Bé tìm được 3 viên ngọc trai rồi! | praise |
| `say.wrong.animal` | `name`, `target` | That's the crab's chest. Where is the whale? | Rương của con cua đó. Con cá voi đâu nhỉ? | wrong |
| `say.wrong.item(.a/.letter)` | `name` ({kind,value}) | That's a blue shell! / That's the letter B! | Đó là vỏ sò màu xanh dương! | wrong |
| `ui.unlocked` | `lagoon` (name) | Coral Garden is open now! | Vườn San Hô mở rồi! | |
| `ui.treasureIntro` | `stars` | Your Treasure Room! 12 stars so far! | Phòng kho báu của bé! Đã có 12 ngôi sao! | |

Rules: `color shape size animal parity` (and `name`/`target` with animal ids) are named automatically; `{kind, value}` is
always named; `letter` stays a letter on screen — `speech()` turns "letter B" → "letter bee", "chữ B" → "chữ bờ".

## 2. How the child's name is pronounced (DESIGN §6)
Mầm must hear "Mầm", not "Mam". `TR.Voice.setChild({ name, sayAs })` stores the profile's name and the parent's
"say it as" spelling; `TR.Voice.say(text)` then splits each line (`TR.Voice.segments(text, lang)` is the pure version):

| situation | what is spoken |
|---|---|
| Vietnamese mode | one utterance, vi-VN voice (the name is Vietnamese anyway) |
| English mode, name has Vietnamese letters (ầ ơ đ …, `I18N.hasVietnamese`) and a vi voice exists | "Great job," (en) → **"Mầm!"** (best vi-VN voice) → "You did it!" (en) |
| English mode, Vietnamese name, **no** vi voice, `sayAs` set | one utterance with `sayAs` substituted: "Great job, Mum! You did it!" |
| English mode, Vietnamese name, no vi voice, no `sayAs` | split anyway with `lang = vi-VN` (the system's default voice for the language) |
| English mode, plain name ("Anna", "Linh") | one utterance; `sayAs` substituted if the parent set one ("Ah-na") |

- Whole-word match only (Unicode letters; "Annabelle" is not "Anna"); every occurrence is split; punctuation right after
  the name travels with it ("Mầm!" is one segment — never a punctuation-only utterance).
- **All segments are ONE queue item**: one promise, one `onStart`/`onEnd`, one log entry with the **full** text
  (`TR.Voice.log`, `TR.debug.voiceLog` — the sims read those), one slot in the ≤ 2 queue. Segments are chained in
  `onend` (synchronous `speak()` of the next utterance → no audible gap; iOS needs this rather than pre-queuing several
  utterances, which it may reorder or drop after `cancel()`). A segment that errors (`synthesis-failed`, unknown voice) is
  skipped and the line goes on; `interrupted`/`canceled` ends the whole item. The watchdog covers the whole line
  (estimate + 250 ms per extra segment + 4 s).
- Tutu's rate/pitch (0.95 / 1.2) and the volume apply to every segment, so the name sounds like Tutu too.
- `{child}` in texts is always the real name (never `sayAs`); the substitution happens only in the spoken text.

## 3. How voices are chosen
Same scoring as Snow Garden (read at init, on `voiceschanged` — both `onvoiceschanged` and `addEventListener` — and
polled every 250 ms for 6 s): language prefix (base 10), exact region +6, preferred names +40…, Enhanced/Premium/
Natural/Neural +12, Google on non-iOS +8, localService +3, default +2, Apple novelty/Eloquence voices −60.
Preferred: en Samantha, Nicky, Karen, Ava, Allison, Susan, Zoe, Serena, Moira, Tessa, Kate, Google US English,
Microsoft Aria/Jenny…; vi **Linh**, Google Tiếng Việt, Microsoft HoaiMy/An/NamMinh.

Utterances: `lang` `en-US` / `vi-VN`, rate **0.95**, pitch **1.2**, volume = `setVolume(0..1)` (default 1; the pause-menu
+/− and the settings slider map 0–100 → 0–1). If no voice matches, the utterance is still spoken with `lang` set and
`hasVoice(lang)` is false so Settings can show `ui.voiceMissing`.

Queue: one line speaking + at most **2** waiting; when full the oldest non-priority line is dropped; non-priority lines
older than 5 s are dropped when they reach the front; `interrupt` cancels everything and speaks after a 50–90 ms gap
(`speak()` right after `cancel()` is dropped on Safari); watchdog ends a stuck line; desktop Chrome 10 s
`pause()/resume()` keep-alive against the ~15 s cut-off; page hidden → stop; visible again → `cancel()` + `resume()`.

## 4. Vietnamese letter names, speech recognition, matcher
Unchanged from Snow Garden: phonics names (b → bờ, c → cờ, k → ca, q → quờ, y → i dài, ă → á, â → ớ …) in speech and
Talk-time labels, alphabet names (bê, xê, dê…) accepted when listening; `listen()` with `interimResults`,
`maxAlternatives 5`, 450 ms grace after an interim match, 7 s timeout, `audioSession.type = 'play-and-record'` while
the mic is open; matcher: exact tokens 30+len, diacritic-free 20+len, number words of both languages → digits,
edit distance ≤ 1–2 on single words of 5+ letters, `=word` only as the whole utterance, later word wins ties,
same-score ambiguity → next alternative.

## 5. iOS / Safari findings (checked 30–31 Oct 2026, iOS 18 / iOS 26)
- **Only built-in voices reach the web.** Safari exposes pre-installed voices; many downloaded Enhanced/Premium voices
  are not in `getVoices()` ([Apple forum 723503](https://developer.apple.com/forums/thread/723503)). Linh (vi-VN) and
  Samantha (en-US) are built in on iOS 16+, so the scoring finds them. iOS 26 ignores the system voice preference for
  a language ([Apple forum 804648](https://developer.apple.com/forums/thread/804648)) — we always pick a voice object
  by name, which still works.
- **Enabling a Vietnamese voice:** iPhone/iPad → Settings › Accessibility › Spoken Content › Voices › Vietnamese › Linh
  (download if offered; the compact voice is built in). macOS Safari: System Settings › Accessibility › Spoken Content ›
  System voice › Manage voices › Vietnamese. Desktop Chrome has "Google Tiếng Việt" (network voice, needs internet);
  Windows Edge has Microsoft HoaiMy / NamMinh (online). Android Chrome: Google TTS › Install voice data › Vietnamese.
  If `hasVoice('vi')` is still false after adding a voice, that is the iOS built-in-only limitation above; the name then
  falls back to `sayAs` in English mode.
- **Voice switch inside one line** (en → vi → en) works on iOS 17/18/26 Safari with chained `onend`; a ~60–120 ms seam is
  audible when the two voices have different sample rates (Samantha + Linh compact). Queuing all three utterances at
  once is *not* used: after `cancel()` iOS sometimes drops the second queued utterance.
- **`utterance.volume`** is honoured on iOS 15+ (older iOS ignored it); `0` still "speaks" silently (our unlock trick).
- **Ducking:** Safari ducks WebAudio while speaking and ≈ 1 s after ([WebKit 278598](https://bugs.webkit.org/show_bug.cgi?id=278598));
  keep the game's own music duck gentle.
- **Speech recognition needs Siri/dictation**, fails on managed devices (Screen Time/MDM: `not-allowed` /
  `service-not-allowed`), must start from a tap ([WebKit 225298](https://bugs.webkit.org/show_bug.cgi?id=225298)), and
  still does not work in **home-screen web apps** — `canListen()` is false there (standalone), so Talk time shows buttons
  only. Bluetooth headsets change the mic route; test with the built-in mic.
- **First utterance from a gesture** (`unlock()` speaks `' '` in the first touchend); **voices load late** (poll);
  **silent switch** mutes WebAudio and may mute TTS depending on route; `pointercancel` on system gestures → `cancel()`.

## 6. Input and kid-proofing (`TR.Input`) — unchanged
`attach` (Pointer Events, pointer capture, one finger, `button, .screen, #hud, .no-game-input` ignored, pointercancel /
lostpointercapture / blur / hidden → `cancel()`, touch + mouse fallback, `hover`); `kidProof()` (no zoom / callout /
selection / rubber-band / refresh keys); `holdButton(el, 2000, onDone, onProgress)` (rAF progress, cancels on release,
sliding off > 24 px, pointercancel, blur; Enter/Space; a quick tap does nothing).

## 7. Adding a language
As before: `LANGS`, `NAMES[xx]`, `ITEM[xx]`, `NUM[xx]`, `NUM_ALT[xx]`, letter names, `WORDS[xx]`, `WORD_LIST[xx]`, a
complete `STR[xx]` (identical key set, same string/list shape — unit-tested), `CHILD_FALLBACK[xx]`; `voice.js`
`LANG_TAG[xx]` + `PREFERRED[xx]`; plurals/articles in `fill()` are English-only.
