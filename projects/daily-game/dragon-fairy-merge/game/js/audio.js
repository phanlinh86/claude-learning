/* MEG.Audio — every sound is synthesized with WebAudio (no audio files, nothing to license).
 * SFX: a little "hup" drop, a soft wooden "plonk" on landing (louder when faster), egg clicks, a bubbly merge "bloop"
 * that climbs the scale with the egg kind, combo chimes, a hatch fanfare, wind whooshes (warning + gust), a gentle warning
 * chime, a sparkly fairy rescue; a forest-breeze bed and a soft generative music-box tune per season. Unlocks on the first gesture (iOS). */
(function (MEG) {
  'use strict';
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
  // per weather level: root (MIDI), bar chords (semitones), tempo (beats/min), beats per bar, lead wave, extras
  const ZONE_MUSIC = [
    { root: 67, prog: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [7, 11, 14]], bpm: 92, beats: 4, lead: 'triangle', plink: true, whistle: true },  // Blossom Glade: light music box, G
    { root: 65, prog: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]], bpm: 104, beats: 4, lead: 'triangle', plink: true, bounce: true }, // Mushroom Meadow: bouncy, F
    { root: 62, prog: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -1, 2]], bpm: 96, beats: 6, lead: 'sine', bounce: true },                 // Lantern Woods: a gentle 6/8 in D minor-ish
    { root: 69, prog: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [7, 11, 14]], bpm: 80, beats: 4, lead: 'sine', bell: true }                       // Frost Hollow: sleigh-bell music box, A
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
        case 'drop': { const k = o.kind || 1; T(520 - k * 30, 0.12, { type: 'sine', vol: 0.09, slideTo: 300 - k * 20 }); this.noise(0.12, { vol: 0.03, freq: 1800, q: 0.8 }); break; }   // hup + a little swish
        case 'blocked': T(330, 0.12, { type: 'sine', vol: 0.1, slideTo: 260 }); T(262, 0.14, { type: 'sine', vol: 0.08, at: 0.1, slideTo: 220 }); break;   // soft boop-boop: no room here
        case 'land': { const v = Math.min(1, (o.speed || 4) / 12), k = o.kind || 1; if (v < 0.15) break;
          T(230 - k * 16, 0.14, { type: 'sine', vol: 0.06 + 0.12 * v, slideTo: 120 - k * 6 }); this.noise(0.08, { vol: 0.03 + 0.05 * v, freq: 700, q: 1.2, type: 'lowpass' }); break; }   // soft plonk on moss
        case 'bump': { const v = Math.min(1, (o.speed || 3) / 10); T(1400 + 300 * Math.random(), 0.04, { type: 'triangle', vol: 0.025 + 0.04 * v }); break; }   // egg tick
        case 'merge': { const k = Math.max(2, o.kind || 2), n = 64 + PENTA[Math.min(7, k - 1)];
          T(NOTE(n - 12), 0.18, { type: 'sine', vol: 0.14, slideTo: NOTE(n), attack: 0.01 });   // bloop
          T(NOTE(n), 0.22, { type: 'triangle', vol: 0.09, at: 0.06 }); T(NOTE(n + 12), 0.18, { type: 'sine', vol: 0.04, at: 0.1 });
          if (k >= 6) [4, 7, 12].forEach((d, i) => T(NOTE(n + d), 0.25, { type: 'triangle', vol: 0.06, at: 0.16 + i * 0.07 })); break; }
        case 'combo': { const c = Math.min(6, o.n || 2); [0, 4, 7].forEach((d, i) => T(NOTE(79 + c + d), 0.14, { type: 'sine', vol: 0.06, at: 0.12 + i * 0.05 })); break; }
        case 'newKind': [0, 7, 12, 16].forEach((d, i) => T(NOTE(76 + d), 0.2, { type: 'triangle', vol: 0.08, at: i * 0.07 })); break;
        case 'hatch': T(1200, 0.05, { type: 'square', vol: 0.04 }); T(900, 0.05, { type: 'square', vol: 0.04, at: 0.12 }); T(1500, 0.06, { type: 'square', vol: 0.05, at: 0.24 });   // crack crack CRACK
          [0, 4, 7, 12, 16, 19, 24].forEach((d, i) => T(NOTE(72 + d), 0.3, { type: 'triangle', vol: 0.13, at: 0.4 + i * 0.08 })); this.noise(0.6, { vol: 0.05, freq: 5000, q: 0.5, at: 0.4 }); break;
        case 'windWarn': this.noise(1.2, { vol: 0.05, freq: 500, slideTo: 1100, q: 0.9 }); T(NOTE(86), 0.12, { type: 'sine', vol: 0.04 }); T(NOTE(83), 0.16, { type: 'sine', vol: 0.04, at: 0.14 }); break;   // the leaves start to rustle
        case 'gust': { const v = Math.min(1, (o.strength || 3) / 5); this.noise(1.6, { vol: 0.06 + 0.07 * v, freq: 400, slideTo: 1500, q: 0.6 }); this.noise(1.2, { vol: 0.04, freq: 2200, slideTo: 700, q: 1.5, at: 0.4 }); break; }   // whoooosh
        case 'warn': T(NOTE(84), 0.18, { type: 'sine', vol: 0.08 }); T(NOTE(80), 0.24, { type: 'sine', vol: 0.08, at: 0.18 }); break;   // uh-oh (gentle)
        case 'rescue': [0, 4, 7, 11, 14, 19].forEach((d, i) => T(NOTE(84 + d), 0.2, { type: 'sine', vol: 0.07, at: i * 0.05 })); this.noise(0.8, { vol: 0.04, freq: 6000, q: 0.5 }); break;
        case 'level': this.noise(0.45, { vol: 0.07, freq: 2500, slideTo: 900, q: 0.6 }); [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => T(NOTE(72 + s), 0.24, { type: 'triangle', vol: 0.18, at: 0.3 + i * 0.1 })); break;
        case 'over': [12, 7, 4, 0].forEach((s, i) => T(NOTE(67 + s), 0.4, { type: 'sine', vol: 0.18, at: i * 0.2 })); break;
        case 'best': [0, 4, 7, 12, 16].forEach((s, i) => T(NOTE(84 + s), 0.3, { type: 'triangle', vol: 0.16, at: 0.6 + i * 0.08 })); break;
      }
    },

    // ---------- music ----------
    setLevel(zone, loop) { this.zone = ((zone || 0) % 4 + 4) % 4; this.loop = loop || 0; },
    _waveBed() {   // the forest breeze: low noise that swells and ebbs (music bus)
      const c = this.ctx; if (!c || this._waves) return;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380; f.Q.value = 0.4;
      const g = c.createGain(); g.gain.value = 0.03;
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
  MEG.Audio = A;
})(window.MEG = window.MEG || {});
