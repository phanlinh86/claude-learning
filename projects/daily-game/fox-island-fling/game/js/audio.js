/* FIF.Audio — every sound is synthesized with WebAudio (no audio files, nothing to license).
 * SFX: the band stretching (pitch rises with the pull), the fling whoosh, leaf chimes (climbing the scale within a flight),
 * tail flutter, a gull "honk-bonk", the landing thump + bullseye fanfare, a soft "bloop" splash; a sea-wave bed and a
 * soft generative island tune per level, scheduled ahead with a lookahead timer. Unlocks on the first gesture (iOS). */
(function (FIF) {
  'use strict';
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
  // per weather level: root (MIDI), bar chords (semitones), tempo (beats/min), beats per bar, lead wave, extras
  const ZONE_MUSIC = [
    { root: 67, prog: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], bpm: 104, beats: 4, lead: 'triangle', plink: true, bounce: true },  // Sunny Cove: calypso plucks, G
    { root: 65, prog: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], bpm: 96, beats: 4, lead: 'sine', plink: true, bell: true },     // Jungle Isle: marimba, F
    { root: 69, prog: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [7, 11, 14]], bpm: 90, beats: 4, lead: 'sine', bell: true, whistle: true },     // Coral Lagoon: dreamy bells, A
    { root: 62, prog: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-5, -1, 2]], bpm: 132, beats: 6, lead: 'triangle', bounce: true }            // Lantern Bay: a gentle shanty in 6/8, D minor
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
      this.master = c.createGain(); this.master.gain.value = 0.9;
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
      this.master.connect(comp); comp.connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = 0.55; this.sfx.connect(this.master);
      this.music = c.createGain(); this.music.gain.value = 0; this.music.connect(this.master);
      const len = c.sampleRate;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyMute();
      return true;
    },
    unlock() {
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
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, t, 0.03);
      this.sfx.gain.setTargetAtTime(this.sfxOn ? 0.55 : 0, t, 0.03);
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
        case 'pull': T(180, 0.35, { type: 'sawtooth', vol: 0.025, slideTo: 260 }); T(90, 0.3, { type: 'sine', vol: 0.05, slideTo: 130 }); break;   // creak of the band
        case 'launch': { const k = 0.7 + (o.power || 0.6) * 0.6; T(140 * k, 0.16, { type: 'sine', vol: 0.18, slideTo: 420 * k }); this.noise(0.4, { vol: 0.09 * k, freq: 600, slideTo: 2600, q: 0.7 }); break; }   // thwang + whoosh
        case 'leaf': { const c = Math.min(7, Math.max(0, (o.count || 1) - 1)); const n = 81 + PENTA[c]; T(NOTE(n), 0.22, { type: 'sine', vol: 0.11 }); T(NOTE(n + 12), 0.16, { type: 'sine', vol: 0.035, at: 0.03 }); if (o.kind === 'moon') T(NOTE(n + 19), 0.4, { type: 'sine', vol: 0.05, at: 0.07 }); break; }
        case 'flutter': [0, 1, 2, 3, 4].forEach(i => T(300 + i * 40, 0.05, { type: 'triangle', vol: 0.05, at: i * 0.045 })); this.noise(0.25, { vol: 0.05, freq: 1500, q: 1.5 }); break;   // brrrp
        case 'bump': T(520, 0.09, { type: 'square', vol: 0.04, slideTo: 380 }); T(390, 0.12, { type: 'square', vol: 0.035, at: 0.1, slideTo: 300 }); T(700, 0.08, { type: 'sine', vol: 0.06, at: 0.02, slideTo: 1200 }); break;   // honk-bonk
        case 'land': T(120, 0.18, { type: 'sine', vol: 0.2, slideTo: 70 }); this.noise(0.12, { vol: 0.06, freq: 500, q: 0.8, type: 'lowpass' }); [0, 4, 7].forEach((s, i) => T(NOTE(76 + s), 0.16, { type: 'triangle', vol: 0.1, at: 0.08 + i * 0.06 })); break;
        case 'bull': [0, 4, 7, 12, 16].forEach((s, i) => T(NOTE(79 + s), 0.2, { type: 'triangle', vol: 0.13, at: 0.25 + i * 0.06 })); this.noise(0.35, { vol: 0.05, freq: 5000, q: 0.5, at: 0.25 }); break;
        case 'splash': T(420, 0.25, { type: 'sine', vol: 0.16, slideTo: 140 }); T(260, 0.2, { type: 'sine', vol: 0.1, at: 0.12, slideTo: 520 }); this.noise(0.5, { vol: 0.1, freq: 900, slideTo: 300, q: 0.6, type: 'lowpass' }); break;   // bloop
        case 'flop': T(200, 0.12, { type: 'triangle', vol: 0.1, slideTo: 120 }); this.noise(0.15, { vol: 0.05, freq: 700, q: 0.7, type: 'lowpass' }); break;   // a soft pat on the sand
        case 'night': [12, 7, 4, 0].forEach((s, i) => T(NOTE(84 + s), 0.5, { type: 'sine', vol: 0.05, at: i * 0.18 })); break;
        case 'dawn': [0, 4, 7, 12].forEach((s, i) => T(NOTE(79 + s), 0.25, { type: 'triangle', vol: 0.07, at: i * 0.1 })); T(NOTE(96), 0.1, { type: 'sine', vol: 0.04, at: 0.5, slideTo: NOTE(100) }); break;
        case 'heartLost': T(NOTE(69), 0.18, { type: 'sine', vol: 0.1 }); T(NOTE(65), 0.3, { type: 'sine', vol: 0.1, at: 0.16 }); break;
        case 'heartGain': [0, 4, 7].forEach((s, i) => T(NOTE(79 + s), 0.18, { type: 'sine', vol: 0.1, at: 0.4 + i * 0.07 })); break;
        case 'level': this.noise(0.45, { vol: 0.07, freq: 2500, slideTo: 900, q: 0.6 }); [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => T(NOTE(72 + s), 0.24, { type: 'triangle', vol: 0.18, at: 0.3 + i * 0.1 })); break;
        case 'over': [12, 7, 4, 0].forEach((s, i) => T(NOTE(67 + s), 0.4, { type: 'sine', vol: 0.18, at: i * 0.2 })); break;
        case 'best': [0, 4, 7, 12, 16].forEach((s, i) => T(NOTE(84 + s), 0.3, { type: 'triangle', vol: 0.16, at: 0.6 + i * 0.08 })); break;
      }
    },

    // ---------- music ----------
    setLevel(zone, loop) { this.zone = ((zone || 0) % 4 + 4) % 4; this.loop = loop || 0; },
    _waveBed() {   // the sea: low noise that swells and ebbs like waves (music bus)
      const c = this.ctx; if (!c || this._waves) return;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520; f.Q.value = 0.4;
      const g = c.createGain(); g.gain.value = 0.05;
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.13; lg.gain.value = 0.04;
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
          const s = PENTA[Math.floor(r * 997) % PENTA.length];
          this.tone(NOTE(m.root + 12 + s), spb * 1.4, { type: m.lead, vol: 0.07, dest: this.music, when: t });
        }
        if (m.whistle && inBar === 1 && bar % 2 === 1) this.tone(NOTE(m.root + 19 + chord[2]), spb * 0.9, { type: 'sine', vol: 0.03, attack: 0.06, slideTo: NOTE(m.root + 24 + chord[2]), dest: this.music, when: t });
        if (m.bell && r > 0.8) this.tone(NOTE(m.root + 31), spb * 2, { type: 'sine', vol: 0.03, dest: this.music, when: t + spb / 2 });
        this._next += spb; this._beat++;
      }
    }
  };
  FIF.Audio = A;
})(window.FIF = window.FIF || {});
