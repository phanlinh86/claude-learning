/* POG.Audio — every sound is synthesized with WebAudio (no audio files, nothing to license).
 * SFX: a soft "plip" when a friend peeks out (a sleepy hum for a napper, a shimmer for gold), a springy frog "boing" on each hop,
 * a ribbit-y boop that climbs the scale with the combo, a golden fanfare, a little splash when Pip lands home, and a gentle
 * "shh-oh" when a napper is woken. Music: a storybook groove per chapter (hand drum, plucked oud-ish lead, music-box bells),
 * scheduled ahead with a lookahead timer over a soft desert-breeze bed. Unlocks on the first gesture (iOS). */
(function (POG) {
  'use strict';
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
  // per chapter: root (MIDI), bar chords (semitones), tempo, beats per bar, lead wave, melody scale, extras
  const ZONE_MUSIC = [
    { root: 62, prog: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [7, 11, 14]], bpm: 100, beats: 4, lead: 'triangle', plink: true, whistle: true },              // Ch1 The Morning Spring: bright, birdsong, D
    { root: 65, prog: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], bpm: 108, beats: 4, lead: 'triangle', bounce: true, bazaar: true },             // Ch2 The Palm Grove: bouncy, F
    { root: 64, prog: [[0, 4, 7], [1, 5, 8], [0, 4, 7], [-2, 2, 5]], bpm: 104, beats: 4, lead: 'triangle', bazaar: true, scale: [0, 1, 4, 5, 7, 8, 12, 13] }, // Ch3 The Sunset Dunes: a soft desert mode, E
    { root: 60, prog: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]], bpm: 88, beats: 6, lead: 'sine', bell: true }                                     // Ch4 The Starlit Oasis: a 6/8 lullaby with bells, C
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

    play(name, o = {}) {
      if (!this.ctx || this.muted || !this.sfxOn || !this.running()) return;
      const T = (f, d, p) => this.tone(f, d, p);
      switch (name) {
        case 'click': T(880, 0.06, { type: 'triangle', vol: 0.18 }); break;
        case 'start': [0, 4, 7, 12].forEach((s, i) => T(NOTE(72 + s), 0.18, { type: 'triangle', vol: 0.2, at: i * 0.07 })); break;
        case 'pop':
          if (o.sleepy) T(NOTE(64), 0.25, { type: 'sine', vol: 0.05, slideTo: NOTE(60), attack: 0.05 });   // a sleepy "mmm"
          else T(NOTE(76), 0.09, { type: 'sine', vol: 0.06, slideTo: NOTE(83) });                      // a little "plip"
          if (o.gold) [0, 4, 7, 12].forEach((s, i) => T(NOTE(91 + s), 0.08, { type: 'sine', vol: 0.035, at: 0.05 + i * 0.04 }));
          this.noise(0.06, { vol: 0.02, freq: 1800, q: 1.2 }); break;
        case 'launch': T(180, 0.18, { type: 'sine', vol: 0.12, slideTo: 520 }); this.noise(0.12, { vol: 0.03, freq: 1600, slideTo: 3000, q: 0.8 }); break;   // springy frog leap "bwoing"
        case 'hopHome': T(240, 0.22, { type: 'sine', vol: 0.07, slideTo: 460 }); break;
        case 'land': T(150, 0.08, { type: 'sine', vol: 0.1, slideTo: 90 }); break;   // soft "pat"
        case 'splash': this.noise(0.25, { vol: 0.05, freq: 900, slideTo: 2400, q: 0.7 }); T(NOTE(84), 0.06, { type: 'sine', vol: 0.03, at: 0.05 }); T(NOTE(88), 0.06, { type: 'sine', vol: 0.025, at: 0.1 }); break;
        case 'boop': { const c = Math.min(9, o.combo || 1), n = 74 + PENTA[c % PENTA.length] + (c >= PENTA.length ? 12 : 0);
          T(330, 0.1, { type: 'square', vol: 0.05, slideTo: 230 }); T(420, 0.1, { type: 'sine', vol: 0.14, slideTo: 700, at: 0.02 });   // "rib-bip"
          T(NOTE(n), 0.22, { type: 'triangle', vol: 0.12, at: 0.08 }); T(NOTE(n + 7), 0.2, { type: 'sine', vol: 0.06, at: 0.13 });
          for (let i = 0; i < 3; i++) T(NOTE(84 + (i % 2) * 4), 0.05, { type: 'triangle', vol: 0.04, at: 0.22 + i * 0.06 });   // giggle
          break; }
        case 'gold': [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => T(NOTE(76 + s), 0.2, { type: i % 2 ? 'sine' : 'triangle', vol: 0.11, at: i * 0.05 })); this.noise(0.5, { vol: 0.04, freq: 7000, q: 0.5, at: 0.1 }); break;
        case 'wrong': this.noise(0.28, { vol: 0.05, freq: 3500, q: 0.6 }); T(NOTE(67), 0.16, { type: 'sine', vol: 0.1, at: 0.18, slideTo: NOTE(64) }); T(NOTE(60), 0.26, { type: 'triangle', vol: 0.07, at: 0.32 }); break;   // "shh… oh"
        case 'empty': T(520, 0.05, { type: 'sine', vol: 0.05, slideTo: 420 }); break;
        case 'nap': T(NOTE(67), 0.5, { type: 'sine', vol: 0.08, slideTo: NOTE(60), attack: 0.08 }); this.noise(0.5, { vol: 0.03, freq: 500, q: 0.5, type: 'lowpass', at: 0.1 }); break;   // a sleepy yawn
        case 'miss': T(NOTE(79), 0.1, { type: 'sine', vol: 0.05, slideTo: NOTE(72) }); break;
        case 'combo': [0, 4, 7, 12].forEach((s, i) => T(NOTE(84 + s + Math.min(5, ((o.n || 5) / 5) | 0)), 0.12, { type: 'triangle', vol: 0.08, at: i * 0.045 })); break;
        case 'leafLost': T(NOTE(69), 0.18, { type: 'sine', vol: 0.1 }); T(NOTE(65), 0.3, { type: 'sine', vol: 0.1, at: 0.16 }); break;
        case 'leafGained': [0, 4, 7].forEach((s, i) => T(NOTE(79 + s), 0.18, { type: 'sine', vol: 0.1, at: 0.25 + i * 0.07 })); break;
        case 'clear': [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => T(NOTE(72 + s), 0.24, { type: 'triangle', vol: 0.17, at: i * 0.1 })); this.noise(0.6, { vol: 0.05, freq: 6000, q: 0.5, at: 0.6 }); break;
        case 'level': this.noise(0.45, { vol: 0.06, freq: 2500, slideTo: 900, q: 0.6 }); [0, 7, 12].forEach((s, i) => T(NOTE(79 + s), 0.3, { type: 'sine', vol: 0.1, at: 0.2 + i * 0.12 })); break;
        case 'over': [12, 7, 4, 0].forEach((s, i) => T(NOTE(67 + s), 0.4, { type: 'sine', vol: 0.18, at: i * 0.2 })); break;
        case 'best': [0, 4, 7, 12, 16].forEach((s, i) => T(NOTE(84 + s), 0.3, { type: 'triangle', vol: 0.16, at: 0.6 + i * 0.08 })); break;
      }
    },

    // ---------- music ----------
    setLevel(zone, loop) { this.zone = ((zone || 0) % 4 + 4) % 4; this.loop = loop || 0; },
    _waveBed() {   // desert breeze: soft low noise that swells and ebbs (music bus)
      const c = this.ctx; if (!c || this._waves) return;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380; f.Q.value = 0.4;
      const g = c.createGain(); g.gain.value = 0.03;
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.13; lg.gain.value = 0.025;
      lfo.connect(lg); lg.connect(g.gain); lfo.start();
      s.connect(f); f.connect(g); g.connect(this.music); s.start();
      this._waves = s;
    },
    startMusic() {
      if (!this.ensure()) return;
      this._waveBed();
      this._musicPlaying = true; this.applyMute();
      if (this._timer) return;
      this._next = null; this._beat = 0;
      this._timer = setInterval(() => this._schedule(), 90);
    },
    stopMusic() {
      this._musicPlaying = false; this.applyMute();
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
    },
    _tek(t, vol) {
      const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3200;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      s.connect(f); f.connect(g); g.connect(this.music); s.start(t, Math.random() * 0.5); s.stop(t + 0.1);
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
        // hand drum: "dum" on 1, "tek" on the off-beats
        if (inBar === 0) { this.tone(95, 0.22, { type: 'sine', vol: 0.12, slideTo: 60, dest: this.music, when: t }); }
        else if (m.beats === 4 && inBar === 2) this.tone(110, 0.16, { type: 'sine', vol: 0.07, slideTo: 70, dest: this.music, when: t });
        this._tek(t + spb / 2, inBar === m.beats - 1 ? 0.05 : 0.03);
        if (m.bazaar && inBar === 3) this._tek(t + spb * 0.75, 0.025);
        if (m.bounce) { this.tone(NOTE(m.root - 12 + chord[inBar % 3]), spb * 0.35, { type: 'triangle', vol: 0.04, dest: this.music, when: t + spb / 2 }); }
        if (m.plink && inBar === 2) this.tone(NOTE(m.root + 24 + chord[1]), 0.12, { type: 'sine', vol: 0.03, dest: this.music, when: t + spb / 2 });
        if (m.beats === 6 && inBar === 3) this.tone(NOTE(m.root - 24 + chord[0]), spb * 2, { type: 'triangle', vol: 0.07, dest: this.music, when: t });
        // music-box melody: a deterministic but varied walk on the pentatonic scale
        const h = Math.sin(b * 12.9898 + this.zone * 78.233) * 43758.5453, r = h - Math.floor(h);
        if (r < 0.62 || inBar === 0) {
          const SC = m.scale || PENTA, s = SC[Math.floor(r * 997) % SC.length];
          this.tone(NOTE(m.root + 12 + s), spb * 1.4, { type: m.lead, vol: 0.07, dest: this.music, when: t });
        }
        if (m.whistle && inBar === 1 && bar % 2 === 1) this.tone(NOTE(m.root + 19 + chord[2]), spb * 0.9, { type: 'sine', vol: 0.03, attack: 0.06, slideTo: NOTE(m.root + 24 + chord[2]), dest: this.music, when: t });
        if (m.bell && r > 0.8) this.tone(NOTE(m.root + 31), spb * 2, { type: 'sine', vol: 0.03, dest: this.music, when: t + spb / 2 });
        this._next += spb; this._beat++;
      }
    }
  };
  POG.Audio = A;
})(window.POG = window.POG || {});
