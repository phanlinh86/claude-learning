/* OF.Audio — every sound is synthesized with WebAudio (no audio files, nothing to license).
 * SFX (DESIGN §8): flip swoosh, soft landing fwump, leaf rustle-pling (pitch rises with the combo), streak chime, boing,
 * whee + puffin flaps and peep, rescue pop, hearts, lamps-on click-hum, door creak + fanfare, level up, game over, best.
 * Music: one generative loop per floor (dawn marimba, noon plucks, sunset warm keys, night music-box bells), scheduled a
 * little ahead with a lookahead timer, crossfaded on a floor change. Unlocks on the first user gesture (iOS). */
(function (OF) {
  'use strict';
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
  // per planet: root (MIDI), bar chords (semitones), tempo (beats/min), beats per bar, lead wave, sparkle
  // per floor: root (MIDI), bar chords (semitones), tempo, beats per bar, lead voice, extras
  const ZONE_MUSIC = [
    { root: 65, prog: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]], bpm: 100, beats: 4, lead: 'marimba', plink: true },             // Boot Room (dawn): soft marimba, F
    { root: 67, prog: [[0, 4, 7], [5, 9, 12], [2, 5, 9], [7, 11, 14]], bpm: 116, beats: 4, lead: 'pluck', plink: true, bounce: true },  // Greenhouse (noon): bright plucks, G
    { root: 62, prog: [[0, 4, 7], [-3, 0, 4], [-5, -1, 2], [5, 9, 12]], bpm: 96, beats: 4, lead: 'keys', bell: true, bounce: true },     // Map Library (sunset): warm keys, D
    { root: 69, prog: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -2, 2]], bpm: 88, beats: 3, lead: 'bell', bell: true }                  // Lantern Deck (night): music box, A minor, waltz
  ];
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];

  const A = {
    ctx: null, master: null, sfx: null, music: null, noiseBuf: null,
    sfxOn: true, musicOn: true, muted: false, zone: 0, loop: 0, _musicPlaying: false,

    ensure() {
      if (this.ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try { this.ctx = new AC(); } catch (e) { return false; }
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = 1;
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
      // phones are quiet: compressor (−18 dB, knee 12, 4:1) then a make-up gain = the player's volume × 1.7
      comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
      this.user = c.createGain(); this.user.gain.value = (this.volume == null ? 1 : this.volume) * 1.7;
      this.master.connect(comp); comp.connect(this.user); this.user.connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = 0.8; this.sfx.connect(this.master);
      this.music = c.createGain(); this.music.gain.value = 0; this.music.connect(this.master);
      const len = c.sampleRate;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyMute();
      return true;
    },
    /* the player's volume 0..1 (Settings slider), applied after the compressor */
    setVolume(v) {
      this.volume = Math.max(0, Math.min(1, +v || 0));
      if (this.user && this.ctx) this.user.gain.setTargetAtTime(this.volume * 1.7, this.ctx.currentTime, 0.03);
    },
    /* iOS Safari: Web Audio defaults to the quiet 'ambient' channel that the side switch silences; ask for 'playback'
     * (Safari 16.4+) and play a silent buffer inside the gesture so the output really wakes up. */
    _iosKick() {
      try { if (navigator.audioSession && navigator.audioSession.type !== 'playback' && navigator.audioSession.type !== 'play-and-record') navigator.audioSession.type = 'playback'; } catch (e) { /* older Safari */ }
      if (!this.ensure()) return;
      if (this.ctx.state !== 'running' && !this._hidden) this.ctx.resume().catch(() => {});
      if (!this._kicked) { try { const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0); this._kicked = true; } catch (e) { /* ignore */ } }
    },
    unlock() {
      this._iosKick();
      if (!this.ensure()) return;
      const c = this.ctx;
      if (c.state !== 'running' && !this._hidden) c.resume().catch(() => {});
      if (!this._silentDone || c.state !== 'running') {
        try { const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); this._silentDone = true; } catch (e) {}
      }
    },
    suspend() { this._hidden = true; if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); },
    resume() { this._hidden = false; if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); },
    applyMute() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.03);
      this.sfx.gain.setTargetAtTime(this.sfxOn ? 0.8 : 0, t, 0.03);
      this.music.gain.setTargetAtTime(this.musicOn && this._musicPlaying ? 0.3 : 0, t, 0.2);
    },
    setOptions({ sfx, music, muted }) {
      if (sfx !== undefined) this.sfxOn = sfx;
      if (music !== undefined) this.musicOn = music;
      if (muted !== undefined) this.muted = muted;
      this.applyMute();
    },
    running() { return this.ctx && this.ctx.state === 'running'; },

    // ---------- primitives ----------
    tone(freq, dur, { type = 'sine', vol = 0.3, at = 0, slideTo = null, attack = 0.005, dest = null, when = null } = {}) {
      const c = this.ctx; if (!c) return;
      const t = when != null ? when : c.currentTime + at;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || this.sfx);
      o.start(t); o.stop(t + dur + 0.05);
    },
    noise(dur, { vol = 0.2, at = 0, freq = 1200, q = 1, type = 'bandpass', slideTo = null, dest = null } = {}) {
      const c = this.ctx; if (!c) return;
      const t = c.currentTime + at;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
      if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(dest || this.sfx);
      s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
    },

    /* one melodic note in a floor's voice */
    voice(kind, freq, dur, vol, when, dest) {
      const T = (f, d, p) => this.tone(f, d, Object.assign({ dest, when }, p));
      switch (kind) {
        case 'marimba': T(freq, Math.min(dur, 0.45), { type: 'sine', vol }); T(freq * 4, 0.06, { type: 'sine', vol: vol * 0.25 }); break;
        case 'pluck': T(freq, Math.min(dur, 0.3), { type: 'triangle', vol }); T(freq * 2, 0.08, { type: 'square', vol: vol * 0.12 }); break;
        case 'keys': T(freq, dur, { type: 'triangle', vol: vol * 0.8, attack: 0.03 }); T(freq * 2, dur * 0.6, { type: 'sine', vol: vol * 0.3, attack: 0.03 }); break;
        case 'bell': T(freq, dur * 1.4, { type: 'sine', vol }); T(freq * 2.76, dur * 0.5, { type: 'sine', vol: vol * 0.22 }); T(freq * 5.4, 0.12, { type: 'sine', vol: vol * 0.08 }); break;
        default: T(freq, dur, { type: kind, vol });
      }
    },

    play(name, o = {}) {
      if (!this.ctx || this.muted || !this.sfxOn || !this.running()) return;
      const T = (f, d, p) => this.tone(f, d, p);
      switch (name) {
        case 'click': T(880, 0.06, { type: 'triangle', vol: 0.18 }); break;
        case 'start': [0, 4, 7, 12].forEach((s, i) => T(NOTE(72 + s), 0.18, { type: 'triangle', vol: 0.2, at: i * 0.07 })); break;
        case 'flip': {   // "swoosh": rising when Ollie flips up to the ceiling, falling when he drops to the floor
          const up = (o.grav || 1) < 0;
          this.noise(0.22, { vol: 0.09, freq: up ? 700 : 2400, slideTo: up ? 2600 : 600, q: 0.9 });
          T(up ? 330 : 700, 0.18, { type: 'sine', vol: 0.07, slideTo: up ? 760 : 300 }); break;
        }
        case 'land': {   // soft "fwump": a padded thud + a dusty puff, stronger with impact speed
          const v = Math.min(1, (o.speed || 600) / 1000);
          T(140, 0.14, { type: 'sine', vol: 0.12 + 0.12 * v, slideTo: 60 });
          this.noise(0.12, { vol: 0.05 + 0.07 * v, freq: 500, q: 0.8, type: 'lowpass', slideTo: 200 }); break;
        }
        case 'catch': {   // leaf "rustle-pling": a papery rustle and a bright note that climbs with the combo
          const n = 79 + PENTA[Math.min(7, ((o.combo || 1) - 1) % 8)];
          this.noise(0.09, { vol: 0.05, freq: 4200, q: 1.2 });
          T(NOTE(n), 0.08, { type: 'triangle', vol: 0.06, at: 0.02 });
          T(NOTE(n + 12), 0.24, { type: 'sine', vol: 0.12, at: 0.05 }); break;
        }
        case 'combo': { const c = Math.min(5, o.mult || 2); [0, 4, 7, 12].forEach((s, i) => T(NOTE(80 + c * 2 + s), 0.16, { type: 'sine', vol: 0.09, at: 0.12 + i * 0.05 })); break; }
        case 'comboBreak': T(NOTE(67), 0.15, { type: 'sine', vol: 0.06, slideTo: NOTE(60) }); break;
        case 'bump': T(330, 0.3, { type: 'sine', vol: 0.15, slideTo: 140 }); T(200, 0.2, { type: 'triangle', vol: 0.06, at: 0.08, slideTo: 420 }); this.noise(0.08, { vol: 0.06, freq: 500 }); break;   // soft boing
        case 'fall': T(700, 0.5, { type: 'sine', vol: 0.12, slideTo: 200 }); T(NOTE(64), 0.15, { type: 'triangle', vol: 0.07, at: 0.4 }); break;   // "wheee"
        case 'puffin':   // Pip: three wing flaps and a cheerful "peep"
          for (let i = 0; i < 3; i++) this.noise(0.09, { vol: 0.07, freq: 900, q: 1.4, at: i * 0.13, slideTo: 500 });
          T(NOTE(91), 0.08, { type: 'sine', vol: 0.11, at: 0.42, slideTo: NOTE(96) }); T(NOTE(93), 0.1, { type: 'sine', vol: 0.09, at: 0.52, slideTo: NOTE(98) }); break;
        case 'rescue': T(NOTE(76), 0.1, { type: 'triangle', vol: 0.1 }); T(NOTE(83), 0.18, { type: 'triangle', vol: 0.1, at: 0.08 }); T(520, 0.05, { type: 'sine', vol: 0.12, slideTo: 1200 }); break;
        case 'heartLost': T(NOTE(69), 0.18, { type: 'sine', vol: 0.1 }); T(NOTE(65), 0.3, { type: 'sine', vol: 0.1, at: 0.16 }); break;
        case 'heartGain': [0, 4, 7].forEach((s, i) => T(NOTE(79 + s), 0.18, { type: 'sine', vol: 0.1, at: 0.4 + i * 0.07 })); break;
        case 'lamps':    // a switch "click" and a warm electric hum swelling in
          this.noise(0.03, { vol: 0.12, freq: 3000, q: 3 });
          T(120, 0.9, { type: 'sine', vol: 0.05, at: 0.04, attack: 0.25 }); T(240, 0.9, { type: 'triangle', vol: 0.02, at: 0.04, attack: 0.25 });
          T(NOTE(84), 0.4, { type: 'sine', vol: 0.05, at: 0.3 }); break;
        case 'finish':   // a wooden door creak, then a little fanfare
          T(180, 0.45, { type: 'sawtooth', vol: 0.025, slideTo: 260 }); this.noise(0.4, { vol: 0.03, freq: 700, q: 8, slideTo: 1100 });
          [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => T(NOTE(72 + s), 0.3, { type: 'triangle', vol: 0.14, at: 0.4 + i * 0.07 })); break;
        case 'level': [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => T(NOTE(72 + s), 0.24, { type: 'triangle', vol: 0.16, at: i * 0.1 })); break;
        case 'over': [12, 7, 4, 0].forEach((s, i) => T(NOTE(67 + s), 0.4, { type: 'sine', vol: 0.18, at: i * 0.2 })); break;
        case 'best': [0, 4, 7, 12, 16].forEach((s, i) => T(NOTE(84 + s), 0.3, { type: 'triangle', vol: 0.16, at: 0.6 + i * 0.08 })); break;
      }
    },

    // ---------- music ----------
    /* a floor change: fade the old loop out, switch, fade the new one in (≈ 1.2 s crossfade) */
    setLevel(zone, loop) {
      const z = ((zone || 0) % 4 + 4) % 4; this.loop = loop || 0;
      if (z === this.zone) return;
      if (!this._musicPlaying || !this.ctx) { this.zone = z; return; }
      const t = this.ctx.currentTime;
      this.music.gain.cancelScheduledValues(t);
      this.music.gain.setTargetAtTime(0, t, 0.18);
      clearTimeout(this._xfT);
      this._xfT = setTimeout(() => { this.zone = z; this._beat = 0; this.applyMute(); }, 650);
    },
    startMusic() {
      if (!this.ensure()) return;
      this._musicPlaying = true; this.applyMute();
      if (this._timer) return;
      this._next = null; this._beat = 0;
      this._timer = setInterval(() => this._schedule(), 90);
    },
    stopMusic() {
      this._musicPlaying = false; this.applyMute();
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
    },
    _schedule() {
      const c = this.ctx; if (!c || !this._musicPlaying || c.state !== 'running') { this._next = null; return; }
      const m = ZONE_MUSIC[this.zone], spb = 60 / (m.bpm * (1 + Math.min(0.2, this.loop * 0.05)));
      if (this._next == null || this._next < c.currentTime) this._next = c.currentTime + 0.08;
      while (this._next < c.currentTime + 0.4) {
        const t = this._next, b = this._beat, bar = Math.floor(b / m.beats), inBar = b % m.beats;
        const chord = m.prog[bar % m.prog.length];
        if (inBar === 0) {   // soft pad: chord tones
          chord.forEach(s => this.tone(NOTE(m.root - 12 + s), spb * m.beats * 0.95, { type: 'sine', vol: 0.05, attack: 0.25, dest: this.music, when: t }));
          this.tone(NOTE(m.root - 24 + chord[0]), spb * 2, { type: 'triangle', vol: 0.09, attack: 0.02, dest: this.music, when: t });
        }
        if (m.bounce) { this.tone(NOTE(m.root - 12 + chord[inBar % 3]), spb * 0.35, { type: 'triangle', vol: 0.04, dest: this.music, when: t + spb / 2 }); }
        if (m.plink && inBar === 2) this.tone(NOTE(m.root + 24 + chord[1]), 0.12, { type: 'sine', vol: 0.03, dest: this.music, when: t + spb / 2 });
        if (m.beats === 6 && inBar === 3) this.tone(NOTE(m.root - 24 + chord[0]), spb * 2, { type: 'triangle', vol: 0.07, dest: this.music, when: t });
        // music-box melody: a deterministic but varied walk on the pentatonic scale
        const h = Math.sin(b * 12.9898 + this.zone * 78.233) * 43758.5453, r = h - Math.floor(h);
        if (r < 0.62 || inBar === 0) {
          const s = PENTA[Math.floor(r * 997) % PENTA.length];
          this.voice(m.lead, NOTE(m.root + 12 + s), spb * 1.4, m.lead === 'bell' ? 0.06 : 0.07, t, this.music);
        }
        if (m.bell && r > 0.8) this.tone(NOTE(m.root + 31), spb * 2, { type: 'sine', vol: 0.03, dest: this.music, when: t + spb / 2 });
        this._next += spb; this._beat++;
      }
    }
  };
  OF.Audio = A;
})(window.OF = window.OF || {});
