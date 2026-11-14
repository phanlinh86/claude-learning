#!/usr/bin/env python3
"""Apply the daily-game mobile/audio/score-card layer to every game under projects/daily-game/ (idempotent).

  python3 shared/daily-mobile/apply.py [slug ...]

For each game it:
  1. copies shared/daily-mobile/extras.js → game/js/extras.js (volume slider + Score Card button),
  2. loads it last in game/index.html with the game's namespace and storage prefix,
  3. patches game/js/audio.js for loud, clear sound on phones:
       - iOS: navigator.audioSession.type = 'playback' on the first gesture (media volume; plays with the side
         switch on) + a silent buffer to wake the output,
       - chain sfx/music → master (mute) → compressor (−18 dB, knee 12, 4:1, 4 ms / 180 ms) → user volume × 1.7 → out,
       - sfx bus 0.55 → 0.8, master 0.9 → 1,
       - Audio.setVolume(v) (0..1) used by the Settings slider.
"""
import os, re, shutil, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
GAMES = os.path.join(ROOT, 'projects', 'daily-game')
SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'extras.js')
MAKEUP = 1.7


def patch_audio(p):
    s = open(p, encoding='utf-8').read()
    if 'setVolume(v)' in s and 'audioSession' in s:
        return 'audio: already patched'
    o = s
    s = s.replace('this.master = c.createGain(); this.master.gain.value = 0.9;', 'this.master = c.createGain(); this.master.gain.value = 1;')
    s = s.replace('this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, t, 0.03);', 'this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.03);')
    s = s.replace('this.sfx = c.createGain(); this.sfx.gain.value = 0.55;', 'this.sfx = c.createGain(); this.sfx.gain.value = 0.8;')
    s = s.replace('this.sfx.gain.setTargetAtTime(this.sfxOn ? 0.55 : 0, t, 0.03);', 'this.sfx.gain.setTargetAtTime(this.sfxOn ? 0.8 : 0, t, 0.03);')
    chain_old = 'this.master.connect(comp); comp.connect(c.destination);'
    assert chain_old in s, 'no master→comp→destination chain in ' + p
    s = s.replace(chain_old,
                  "// phones are quiet: compressor (−18 dB, knee 12, 4:1) then a make-up gain = the player's volume × %s\n"
                  "      comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;\n"
                  "      this.user = c.createGain(); this.user.gain.value = (this.volume == null ? 1 : this.volume) * %s;\n"
                  "      this.master.connect(comp); comp.connect(this.user); this.user.connect(c.destination);" % (MAKEUP, MAKEUP))
    # unlock(): iOS playback session + silent buffer, and the setVolume method
    m = re.search(r'\n(\s*)unlock\(\)\s*\{', s)
    assert m, 'no unlock() in ' + p
    ind = m.group(1)
    method = (
        "\n%s/* the player's volume 0..1 (Settings slider), applied after the compressor */\n"
        "%ssetVolume(v) {\n"
        "%s  this.volume = Math.max(0, Math.min(1, +v || 0));\n"
        "%s  if (this.user && this.ctx) this.user.gain.setTargetAtTime(this.volume * %s, this.ctx.currentTime, 0.03);\n"
        "%s},\n"
        "%s/* iOS Safari: Web Audio defaults to the quiet 'ambient' channel that the side switch silences; ask for 'playback'\n"
        "%s * (Safari 16.4+) and play a silent buffer inside the gesture so the output really wakes up. */\n"
        "%s_iosKick() {\n"
        "%s  try { if (navigator.audioSession && navigator.audioSession.type !== 'playback' && navigator.audioSession.type !== 'play-and-record') navigator.audioSession.type = 'playback'; } catch (e) { /* older Safari */ }\n"
        "%s  if (!this.ensure()) return;\n"
        "%s  if (this.ctx.state !== 'running' && !this._hidden) this.ctx.resume().catch(() => {});\n"
        "%s  if (!this._kicked) { try { const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0); this._kicked = true; } catch (e) { /* ignore */ } }\n"
        "%s},"
    ) % ((ind,) * 4 + (MAKEUP,) + (ind,) * 9)
    s = s[:m.start()] + method + s[m.start():]
    s = re.sub(r'(\n\s*unlock\(\)\s*\{)', r'\1\n' + ind + '  this._iosKick();', s, count=1)
    assert s != o
    open(p, 'w', encoding='utf-8').write(s)
    return 'audio: patched'


def ns_and_prefix(game):
    main = open(os.path.join(game, 'game', 'js', 'main.js'), encoding='utf-8').read()
    m = re.search(r'\}\)\(window\.([A-Za-z]+) = window\.\1 \|\| \{\}\);\s*$', main.strip() + '\n') or re.search(r'window\.([A-Z]{2,4}) = window\.\1', main)
    ns = m.group(1)
    st = open(os.path.join(game, 'game', 'js', 'storage.js'), encoding='utf-8').read()
    prefix = re.search(r"PREFIX = '([^']+)'", st).group(1)
    return ns, prefix


def patch_index(game, ns, prefix):
    p = os.path.join(game, 'game', 'index.html')
    s = open(p, encoding='utf-8').read()
    if 'js/extras.js' in s:
        return 'index: already has extras.js'
    tag = '<script src="js/extras.js" data-ns="%s" data-prefix="%s"></script>' % (ns, prefix)
    m = re.search(r'<script src="js/main\.js"></script>', s)
    assert m, 'no main.js tag in ' + p
    s = s[:m.end()] + '\n' + tag + s[m.end():]
    open(p, 'w', encoding='utf-8').write(s)
    return 'index: extras.js added'


def main():
    slugs = sys.argv[1:] or sorted(d for d in os.listdir(GAMES) if os.path.isdir(os.path.join(GAMES, d, 'game')))
    for slug in slugs:
        game = os.path.join(GAMES, slug)
        ns, prefix = ns_and_prefix(game)
        shutil.copyfile(SRC, os.path.join(game, 'game', 'js', 'extras.js'))
        r1 = patch_index(game, ns, prefix)
        r2 = patch_audio(os.path.join(game, 'game', 'js', 'audio.js'))
        print('%-22s ns=%-4s prefix=%-5s %s; %s' % (slug, ns, prefix, r1, r2))


if __name__ == '__main__':
    main()
