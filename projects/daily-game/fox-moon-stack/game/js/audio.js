/* MS.Audio — every sound is synthesized with WebAudio (no audio files, nothing to license).
 * SFX for drops, thunks, perfects (pitch rises with combo), coins, growing, rockets; plus a soft generative space lullaby per planet
 * (DESIGN §7), scheduled a little ahead with a lookahead timer. Unlocks on the first user gesture (iOS). */
(function (MS) {
  'use strict';
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
  // per planet: root (MIDI), bar chords (semitones), tempo (beats/min), beats per bar, lead wave, sparkle
  const ZONE_MUSIC = [
    { root: 64, prog: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [-5, -1, 2]], bpm: 84, beats: 4, lead: 'sine', bell: true },             // Moon Base: dreamy pad + music box, E major
    { root: 62, prog: [[0, 4, 7], [5, 9, 12], [-2, 2, 5], [7, 11, 14]], bpm: 104, beats: 4, lead: 'triangle', bell: false, plink: true }, // Rusty Dunes: warm marimba, D
    { root: 67, prog: [[0, 4, 7], [2, 5, 9], [-3, 0, 4], [5, 9, 12]], bpm: 92, beats: 3, lead: 'sine', bell: true },              // Ring World: glassy bells waltz, G
    { root: 69, prog: [[0, 4, 7], [-3, 0, 4], [-5, -1, 2], [5, 9, 12]], bpm: 112, beats: 4, lead: 'triangle', bell: true, plink: true } // Comet Garden: twinkly arps, A
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
        case 'spawn': T(NOTE(91), 0.08, { type: 'sine', vol: 0.04 }); break;
        case 'drop': this.noise(0.2, { vol: 0.09, freq: 1800, slideTo: 500, q: 0.8 }); T(880, 0.16, { type: 'sine', vol: 0.08, slideTo: 330 }); break;
        case 'land': {   // a crate thunk: heavier with size (grow) and speed
          const v = Math.min(1, (o.speed || 600) / 1200), k = 1 - Math.min(0.35, (o.grow || 0) * 0.07);
          T((120 + 50 * (1 - v)) * k, 0.16, { type: 'sine', vol: 0.12 + 0.16 * v, slideTo: 60 * k });
          this.noise(0.08, { vol: 0.06 + 0.08 * v, freq: 500 * k, q: 1.2 }); break;
        }
        case 'perfect': {   // clunk-ding: pitch rises with combo
          const n = 76 + Math.min(8, o.combo || 1) * 2;
          T(NOTE(n), 0.35, { type: 'triangle', vol: 0.18, at: 0.03 });
          T(NOTE(n + 7), 0.4, { type: 'sine', vol: 0.12, at: 0.08 });
          if ((o.combo || 0) >= 3) T(NOTE(n + 12), 0.4, { type: 'sine', vol: 0.09, at: 0.13 });
          break;
        }
        case 'edge': T(330, 0.25, { type: 'triangle', vol: 0.07, slideTo: 300 }); T(300, 0.25, { type: 'triangle', vol: 0.06, at: 0.18, slideTo: 340 }); break;   // wobble creak
        case 'miss': T(520, 0.45, { type: 'sine', vol: 0.16, slideTo: 140 }); T(NOTE(64), 0.15, { type: 'triangle', vol: 0.08, at: 0.45 }); T(NOTE(60), 0.25, { type: 'triangle', vol: 0.08, at: 0.6 }); break;   // boing-tumble + "oh-oh"
        case 'topple': for (let i = 0; i < 4; i++) { T(140 - i * 12, 0.12, { type: 'sine', vol: 0.1, at: i * 0.11, slideTo: 70 }); this.noise(0.06, { vol: 0.05, freq: 600, at: i * 0.11 }); } break;
        case 'heartLost': T(NOTE(69), 0.18, { type: 'sine', vol: 0.1 }); T(NOTE(65), 0.3, { type: 'sine', vol: 0.1, at: 0.16 }); break;
        case 'coin': { const n = 88 + ((o.total || 0) % 5); T(NOTE(n), 0.08, { type: 'square', vol: 0.05 }); T(NOTE(n + 5), 0.2, { type: 'sine', vol: 0.12, at: 0.06 }); break; }
        case 'grow': [0, 4, 7, 12, 16].forEach((s, i) => T(NOTE(67 + s), 0.14, { type: 'triangle', vol: 0.14, at: i * 0.05 })); T(200, 0.4, { type: 'sine', vol: 0.08, slideTo: 600 }); break;
        case 'shrink': T(700, 0.4, { type: 'sine', vol: 0.1, slideTo: 250 }); break;
        case 'combo': { const c = Math.min(8, o.combo || 2); [0, 4, 7].forEach((s, i) => T(NOTE(84 + c + s), 0.12, { type: 'sine', vol: 0.06, at: 0.25 + i * 0.05 })); break; }
        case 'rocket': this.noise(0.9, { vol: 0.1, freq: 400, q: 0.5, slideTo: 150 }); T(90, 0.5, { type: 'sine', vol: 0.12, at: 0.05, slideTo: 60 }); break;
        case 'liftoff': this.noise(1.1, { vol: 0.1, freq: 200, q: 0.5, slideTo: 2400 }); break;
        case 'goal': [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => T(NOTE(72 + s), 0.3, { type: 'triangle', vol: 0.16, at: i * 0.08 })); break;
        case 'level': [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => T(NOTE(72 + s), 0.24, { type: 'triangle', vol: 0.18, at: i * 0.1 })); break;
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
  MS.Audio = A;
})(window.MS = window.MS || {});
