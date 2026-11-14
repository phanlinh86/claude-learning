# Daily games: mobile sound, volume and Score Card layer

Shared source for a small layer every game in `projects/daily-game/` carries (each game keeps its own copy, so it stays
self-contained and could move to its own repo).

- `extras.js` — copied to `<game>/game/js/extras.js` and loaded last (`<script src="js/extras.js" data-ns="NS" data-prefix="xx:">`):
  - **Volume** slider (0–100 %, − / + buttons, saved per game) in Settings → `NS.Audio.setVolume(v)`.
  - **Score Card** button on the game-over screen: draws a 1080×1350 PNG (game name, hero, score, best, medal, stats,
    date, play link) and opens the iPhone/iPad share sheet (`navigator.share` with the file); **Save picture** and
    **Copy text** fallbacks elsewhere.
- `apply.py` — applies the layer to every game (idempotent): copies `extras.js`, adds the script tag, and patches
  `audio.js` for loud sound on phones:
  - iOS: `navigator.audioSession.type = 'playback'` + a silent buffer inside the first gesture (`_iosKick`), so Web Audio
    uses the media volume instead of the quiet "ambient" channel that the side switch mutes;
  - chain sfx/music → master → compressor (−18 dB, knee 12, 4:1, 4 ms / 180 ms) → player volume × 1.7 → speakers;
    sfx bus 0.55 → 0.8.
  - Measured with a bot playing (headless Chromium, analyser on the output): before −17.8 dBFS peak / −37 dBFS RMS,
    after −4.8 dBFS peak / −24 dBFS RMS — the same loudness as the education games (−25 dBFS RMS).
- `test_extras.js` — `node shared/daily-mobile/test_extras.js projects/daily-game/<slug>`: volume slider + saving, audio
  chain, Score Card picture/text/buttons, Play Again still works, and the card fits at iPhone/iPad sizes.

New daily games: run `python3 shared/daily-mobile/apply.py <slug>` after integration, then `test_extras.js`.
