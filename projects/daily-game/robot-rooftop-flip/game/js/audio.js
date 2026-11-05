/* RF.Audio — every sound is synthesized with WebAudio (no audio files, nothing to license).
 * SFX for flips, magnet clanks, fireflies (pitch rises with combo), gates, bumps, the rescue drone; plus a bouncy generative loop per time of day
 * (DESIGN §7), scheduled a little ahead with a lookahead timer. Unlocks on the first user gesture (iOS). */
(function (RF) {
  'use strict';
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
  // per planet: root (MIDI), bar chords (semitones), tempo (beats/min), beats per bar, lead wave, sparkle
  const ZONE_MUSIC = [
    { root: 65, prog: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]], bpm: 104, beats: 4, lead: 'triangle', bell: false, plink: true }, // Dawn: soft marimba, F
    { root: 67, prog: [[0, 4, 7], [5, 9, 12], [2, 5, 9], [7, 11, 14]], bpm: 118, beats: 4, lead: 'square', bell: false, plink: true, bounce: true }, // Noon: bright pluck, G
    { root: 62, prog: [[0, 4, 7], [-3, 0, 4], [-5, -1, 2], [5, 9, 12]], bpm: 108, beats: 4, lead: 'triangle', bell: true, bounce: true }, // Sunset: warm keys, D
    { root: 69, prog: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -2, 2]], bpm: 112, beats: 4, lead: 'sine', bell: true, plink: true, bounce: true }  // Night: dreamy bells, A minor
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
        case 'flip': {   // "zoop": rising when Bolt flips up to the rail, falling when he drops to the roof
          const up = (o.grav || 1) < 0;
          T(up ? 300 : 760, 0.17, { type: 'triangle', vol: 0.11, slideTo: up ? 820 : 280 });
          this.noise(0.12, { vol: 0.04, freq: up ? 1400 : 2200, slideTo: up ? 2600 : 900, q: 1.5 }); break;
        }
        case 'land': {   // magnet clank: stronger with impact speed
          const v = Math.min(1, (o.speed || 600) / 1000);
          T(NOTE(84), 0.09, { type: 'square', vol: 0.025 + 0.03 * v });
          T(NOTE(91), 0.14, { type: 'triangle', vol: 0.05 + 0.05 * v, at: 0.005 });
          this.noise(0.05, { vol: 0.04 + 0.06 * v, freq: 3200, q: 2 });
          T(150, 0.08, { type: 'sine', vol: 0.06 * v, slideTo: 70 }); break;
        }
        case 'catch': {   // pling: pitch rises with combo
          const n = 79 + PENTA[Math.min(7, ((o.combo || 1) - 1) % 8)];
          T(NOTE(n), 0.07, { type: 'square', vol: 0.035 });
          T(NOTE(n + 12), 0.22, { type: 'sine', vol: 0.12, at: 0.04 }); break;
        }
        case 'wrong': T(220, 0.12, { type: 'square', vol: 0.03 }); T(196, 0.16, { type: 'square', vol: 0.03, at: 0.1 }); break;   // soft "nuh-uh"
        case 'combo': { const c = Math.min(5, o.mult || 2); [0, 4, 7, 12].forEach((s, i) => T(NOTE(80 + c * 2 + s), 0.12, { type: 'triangle', vol: 0.08, at: 0.12 + i * 0.05 })); break; }
        case 'comboBreak': T(NOTE(67), 0.15, { type: 'sine', vol: 0.06, slideTo: NOTE(60) }); break;
        case 'gate': [0, 7, 12, 19].forEach((s, i) => T(NOTE(84 + s), 0.25, { type: 'sine', vol: 0.06, at: i * 0.035 })); this.noise(0.3, { vol: 0.03, freq: 5000, q: 3 }); break;
        case 'bump': T(330, 0.3, { type: 'sine', vol: 0.15, slideTo: 140 }); T(200, 0.2, { type: 'triangle', vol: 0.06, at: 0.08, slideTo: 420 }); this.noise(0.08, { vol: 0.06, freq: 500 }); break;   // soft boing
        case 'fall': T(700, 0.5, { type: 'sine', vol: 0.12, slideTo: 200 }); T(NOTE(64), 0.15, { type: 'triangle', vol: 0.07, at: 0.4 }); break;   // "wheee"
        case 'drone': this.noise(0.9, { vol: 0.05, freq: 900, q: 6, slideTo: 1100 }); T(110, 0.9, { type: 'sawtooth', vol: 0.015 }); break;
        case 'rescue': T(NOTE(76), 0.1, { type: 'triangle', vol: 0.1 }); T(NOTE(83), 0.18, { type: 'triangle', vol: 0.1, at: 0.08 }); break;
        case 'heartLost': T(NOTE(69), 0.18, { type: 'sine', vol: 0.1 }); T(NOTE(65), 0.3, { type: 'sine', vol: 0.1, at: 0.16 }); break;
        case 'heartGain': [0, 4, 7].forEach((s, i) => T(NOTE(79 + s), 0.18, { type: 'sine', vol: 0.1, at: 0.4 + i * 0.07 })); break;
        case 'finish': [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => T(NOTE(72 + s), 0.3, { type: 'triangle', vol: 0.15, at: i * 0.07 })); break;
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
        if (m.bounce) { this.tone(NOTE(m.root - 12 + chord[inBar % 3]), spb * 0.35, { type: 'triangle', vol: 0.04, dest: this.music, when: t + spb / 2 }); }
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
  RF.Audio = A;
})(window.RF = window.RF || {});
