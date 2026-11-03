/* EG.Audio — every sound is synthesized with WebAudio (no audio files, nothing to license).
 * SFX for drops, landings, merges (pitch rises with tier and combo), Boo, pumpkins; plus a soft generative music-box + pad loop per castle place
 * (DESIGN §7), scheduled a little ahead with a lookahead timer. Unlocks on the first user gesture (iOS). */
(function (EG) {
  'use strict';
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
  // per zone: root (MIDI), bar chords (semitones), tempo (beats/min), beats per bar, lead wave, sparkle
  const ZONE_MUSIC = [
    { root: 65, prog: [[0, 4, 7], [5, 9, 12], [2, 5, 9], [7, 11, 14]], bpm: 132, beats: 3, lead: 'triangle', bell: false },   // Courtyard: lullaby waltz in F
    { root: 62, prog: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -2, 2]], bpm: 104, beats: 4, lead: 'sine', bell: true, plink: true }, // Cellar: drippy marimba, D minor
    { root: 67, prog: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [2, 5, 9]], bpm: 88, beats: 4, lead: 'sine', bell: true },            // Library: warm celesta, G major
    { root: 69, prog: [[0, 4, 7], [-3, 0, 4], [-5, -1, 2], [5, 9, 12]], bpm: 76, beats: 4, lead: 'sine', bell: true }             // Tower: twinkly A major
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
        case 'aim': T(1500, 0.03, { type: 'sine', vol: 0.05 }); break;
        case 'drop': this.noise(0.18, { vol: 0.1, freq: 900, slideTo: 2400, q: 0.7 }); T(660, 0.12, { type: 'sine', vol: 0.08, slideTo: 440 }); break;
        case 'land': { const v = Math.min(1, (o.speed || 600) / 1400); T(150 + 40 * (1 - v), 0.14, { type: 'sine', vol: 0.08 + 0.16 * v, slideTo: 80 }); this.noise(0.06, { vol: 0.05 + 0.08 * v, freq: 700, q: 1 }); break; }
        case 'bounce': T(240, 0.08, { type: 'sine', vol: 0.06, slideTo: 150 }); break;
        case 'merge': {   // pop-glow: pitch rises with tier and combo
          const n = 60 + (o.tier || 2) * 3 + Math.min(10, o.combo || 0) * 2;
          this.noise(0.06, { vol: 0.12, freq: 2500, q: 2 });
          T(NOTE(n), 0.16, { type: 'triangle', vol: 0.2, slideTo: NOTE(n + 12) });
          T(NOTE(n + 7), 0.3, { type: 'sine', vol: 0.12, at: 0.05 });
          if (o.cascade) T(NOTE(n + 19), 0.3, { type: 'sine', vol: 0.08, at: 0.1 });
          if (o.super) [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => T(NOTE(84 + s), 0.25, { type: 'sine', vol: 0.12, at: 0.1 + i * 0.05 }));
          break;
        }
        case 'combo': { const c = Math.min(8, o.combo || 2); [0, 4, 7].forEach((s, i) => T(NOTE(79 + c + s), 0.14, { type: 'triangle', vol: 0.1, at: 0.12 + i * 0.05 })); break; }
        case 'comboBreak': T(NOTE(67), 0.12, { type: 'sine', vol: 0.06 }); break;
        case 'helper': T(420, 0.6, { type: 'sine', vol: 0.15, slideTo: 760, attack: 0.08 }); T(760, 0.55, { type: 'sine', vol: 0.12, at: 0.45, slideTo: 380, attack: 0.05 }); break;
        case 'helperCarry': [0, 7, 12].forEach((s, i) => T(NOTE(88 + s), 0.15, { type: 'sine', vol: 0.08, at: i * 0.04 })); break;
        case 'pumpkinDrop': T(110, 0.2, { type: 'triangle', vol: 0.22, slideTo: 70 }); this.noise(0.4, { vol: 0.05, freq: 400, at: 0.3, q: 0.5, slideTo: 250 }); break;
        case 'pumpkinWake': T(300, 0.35, { type: 'triangle', vol: 0.2, slideTo: 900 }); T(900, 0.2, { type: 'sine', vol: 0.08, at: 0.2, slideTo: 600 }); break;
        case 'rise': T(90, 0.35, { type: 'sine', vol: 0.12, slideTo: 140 }); this.noise(0.3, { vol: 0.04, freq: 300, q: 0.6 }); break;
        case 'refuse': T(260, 0.09, { type: 'square', vol: 0.06 }); T(200, 0.12, { type: 'square', vol: 0.06, at: 0.12 }); break;
        case 'newTier': [0, 7, 12, 19].forEach((s, i) => T(NOTE(84 + s), 0.22, { type: 'sine', vol: 0.09, at: i * 0.06 })); break;
        case 'goal': [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => T(NOTE(72 + s), 0.3, { type: 'triangle', vol: 0.16, at: i * 0.08 })); this.noise(1.0, { vol: 0.06, freq: 800, slideTo: 6000, q: 0.6, at: 0.2 }); break;
        case 'level': [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => T(NOTE(72 + s), 0.24, { type: 'triangle', vol: 0.18, at: i * 0.1 })); break;
        case 'danger': T(NOTE(57), 0.3, { type: 'sine', vol: 0.08 }); T(NOTE(56), 0.3, { type: 'sine', vol: 0.08, at: 0.18 }); break;
        case 'over': [12, 7, 4, 0].forEach((s, i) => T(NOTE(67 + s), 0.4, { type: 'sine', vol: 0.18, at: i * 0.2 })); break;
        case 'best': [0, 4, 7, 12, 16].forEach((s, i) => T(NOTE(84 + s), 0.3, { type: 'triangle', vol: 0.16, at: 0.6 + i * 0.08 })); break;
      }
    },

    // ---------- music ----------
    setLevel(zone, loop) { this.zone = ((zone || 0) % 4 + 4) % 4; this.loop = loop || 0; },
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
        if (m.plink && inBar === 2) this.tone(NOTE(m.root + 24 + chord[1]), 0.12, { type: 'sine', vol: 0.03, dest: this.music, when: t + spb / 2 });
        if (m.beats === 6 && inBar === 3) this.tone(NOTE(m.root - 24 + chord[0]), spb * 2, { type: 'triangle', vol: 0.07, dest: this.music, when: t });
        // music-box melody: a deterministic but varied walk on the pentatonic scale
        const h = Math.sin(b * 12.9898 + this.zone * 78.233) * 43758.5453, r = h - Math.floor(h);
        if (r < 0.62 || inBar === 0) {
          const s = PENTA[Math.floor(r * 997) % PENTA.length];
          this.tone(NOTE(m.root + 12 + s), spb * 1.4, { type: m.lead, vol: 0.07, dest: this.music, when: t });
        }
        if (m.bell && r > 0.8) this.tone(NOTE(m.root + 31), spb * 2, { type: 'sine', vol: 0.03, dest: this.music, when: t + spb / 2 });
        this._next += spb; this._beat++;
      }
    }
  };
  EG.Audio = A;
})(window.EG = window.EG || {});
