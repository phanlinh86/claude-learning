/* PZ.Audio (Pom's Puzzle Town) — every sound is synthesized with WebAudio (no files to license or download).
 * Piece pickup "plip" (a note per piece colour), a soft drag swish (rate-limited), the snap "click-clack" + sparkle chime,
 * count chimes, a near-miss "hm?", a friendly boing, a whoosh home, the board's slide-in swoosh, the page-turn "fwip",
 * Pom's trumpet toot (synth brass), pigeon coo + flutter, bubble pops, a poof; ambience per season (birds in spring /
 * summer, soft wind in autumn, gentle bells in winter) and a little loop per season (marimba, ukulele, music box, bells),
 * ducked while Pom speaks.
 * Chain: sfx / music / amb → master (mute) → compressor → user volume × 1.6 makeup → speakers (phones are quiet).
 * iOS: call unlock() inside the first touchend/click (it also switches the audio session to 'playback'). */
(function (PZ) {
  'use strict';
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
  // one pentatonic "home" note per answer colour, so each piece has its own voice on pickup / snap
  const COLOR_NOTE = { red: 72, orange: 74, yellow: 76, green: 79, blue: 81, purple: 84, pink: 86 };
  const MUSIC = [
    { root: 62, tempo: 100, prog: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [7, 11, 14]], lead: 'marimba' },  // spring: D, light marimba
    { root: 65, tempo: 112, prog: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], lead: 'uke' },     // summer: F, ukulele-ish pluck
    { root: 60, tempo: 90, prog: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]], lead: 'box' },       // autumn: C, warm music box
    { root: 67, tempo: 80, prog: [[0, 4, 7], [-5, -1, 2], [-3, 0, 4], [-7, -3, 0]], lead: 'bell' }      // winter: G, soft bells
  ];
  // ambience per season: [noise lowpass Hz, bed gain, LFO depth] — a quiet street murmur, autumn wind, a hush of snow
  const AMB = [[520, 0.012, 0.008], [560, 0.012, 0.008], [700, 0.04, 0.03], [380, 0.018, 0.012]];
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const SCALE_C = [0, 0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19];

  const A = {
    ctx: null, master: null, comp: null, user: null, sfx: null, music: null, amb: null, noiseBuf: null,
    sfxOn: true, musicOn: true, muted: false, ducked: false, volume: 1,
    mood: 0, _timer: null, _next: 0, _step: 0, _phrase: null, _playing: false, _hum: null, _lastPlay: {}, _bubT: 0,

    ensure() {
      if (this.ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try { this.ctx = new AC(); } catch (e) { return false; }
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = 1;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
      this.comp = comp;   // exposed for QA (PZ.debug.audio().comp)
      this.user = c.createGain(); this.user.gain.value = this.volume * 1.6;
      this.master.connect(comp); comp.connect(this.user); this.user.connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
      this.music = c.createGain(); this.music.gain.value = 0; this.music.connect(this.master);
      this.amb = c.createGain(); this.amb.gain.value = 0; this.amb.connect(this.master);
      const len = c.sampleRate * 2;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.apply();
      return true;
    },
    unlock() {
      // iOS: use the media channel (media volume, plays with the side switch on) instead of the quiet ambient one
      try { if (navigator.audioSession && navigator.audioSession.type !== 'playback' && navigator.audioSession.type !== 'play-and-record') navigator.audioSession.type = 'playback'; } catch (e) {}
      if (!this.ensure()) return;
      const c = this.ctx;
      if (c.state !== 'running') c.resume().catch(() => {});
      // iOS needs a sound started inside the gesture: play one silent sample
      try { const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch (e) {}
    },
    suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); },
    resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); },
    apply() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.03);
      this.user.gain.setTargetAtTime(Math.max(0, Math.min(1, this.volume)) * 1.6, t, 0.03);
      this.sfx.gain.setTargetAtTime(this.sfxOn ? 0.9 : 0, t, 0.03);
      const mv = this.musicOn && this._playing ? (this.ducked ? 0.07 : 0.2) : 0;
      this.music.gain.setTargetAtTime(mv, t, this.ducked ? 0.08 : 0.5);
      // the amb bus: the season bed + birds / bells, a little lower under speech
      this.amb.gain.setTargetAtTime(this.sfxOn && this._playing ? (this.ducked ? 0.5 : 1) : 0, t, 0.3);
    },
    setVolume(v) { this.setOptions({ volume: v }); },
    setOptions({ sfx, music, muted, volume }) {
      if (volume !== undefined) this.volume = Math.max(0, Math.min(1, +volume || 0));
      if (sfx !== undefined) this.sfxOn = sfx;
      if (music !== undefined) this.musicOn = music;
      if (muted !== undefined) this.muted = muted;
      this.apply();
    },
    duck(on) { if (this.ducked !== !!on) { this.ducked = !!on; this.apply(); } },

    /* ---------- street ambience: a breathing bed of filtered noise (louder wind in autumn) + birds / bells now and then ---------- */
    _startHum() {
      if (!this.ctx || this._hum) return;
      const c = this.ctx;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const am = AMB[this.mood] || AMB[0];
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = am[0]; f.Q.value = 0.5;
      const g = c.createGain(); g.gain.value = am[1];
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.11; lg.gain.value = am[2];
      lfo.connect(lg); lg.connect(g.gain);
      const lfo2 = c.createOscillator(), lg2 = c.createGain(); lfo2.frequency.value = 0.07; lg2.gain.value = 80;
      lfo2.connect(lg2); lg2.connect(f.frequency);
      s.connect(f); f.connect(g); g.connect(this.amb);
      s.start(); lfo.start(); lfo2.start();
      this._hum = { s, lfo, lfo2, f, g, lg };
    },
    _stopHum() {
      const h = this._hum; if (!h) return;
      try { h.s.stop(); h.lfo.stop(); h.lfo2.stop(); } catch (e) {}
      this._hum = null;
    },
    /* call every frame (real seconds): birds in spring / summer, a gust in autumn, a bell tinkle in winter */
    tick(dt) {
      if (!this.ctx || !this._playing || this.muted || !this.sfxOn) return;
      this._bubT -= dt || 0;
      if (this._bubT > 0) return;
      if (this.mood === 3) {          // winter: a far little bell, two soft strikes
        this._bubT = 4 + Math.random() * 5;
        const f = NOTE([84, 86, 88, 91][(Math.random() * 4) | 0]);
        for (let i = 0; i < 2; i++) this.bell(f, 1.2, { vol: 0.03, at: i * 0.32, dest: this.amb });
      } else if (this.mood === 2) {   // autumn: a gust of wind sweeping through the leaves
        this._bubT = 5 + Math.random() * 5;
        this.noise(1.6, { vol: 0.035, type: 'bandpass', f0: 400, f1: 1100, q: 0.6, attack: 0.6, dest: this.amb });
      } else {                        // a little bird: two or three quick chirps (summer: a bit more often)
        this._bubT = (this.mood === 1 ? 2.5 : 3.2) + Math.random() * 4.5;
        const f = 2400 + Math.random() * 1200, n = 2 + (Math.random() * 2 | 0);
        for (let i = 0; i < n; i++) this.tone(f * (1 + i * 0.06), 0.07, { type: 'sine', vol: 0.04, at: i * 0.11, slideTo: f * 1.35, attack: 0.004, dest: this.amb });
      }
    },
    /* one bubble "bloop": a sine whose pitch rises fast (the classic bubble resonance) */
    bubble(at = 0, vol = 0.12, dest = null) {
      const f = 380 + Math.random() * 520;
      this.tone(f, 0.07 + Math.random() * 0.05, { type: 'sine', vol, at, slideTo: f * (1.8 + Math.random() * 0.8), attack: 0.004, dest });
    },
    /* a soft bell: sine + an inharmonic partial, long decay */
    bell(f, dur, { vol = 0.1, at = 0, dest = null } = {}) {
      this.tone(f, dur, { type: 'sine', vol, at, attack: 0.004, dest });
      this.tone(f * 2.76, dur * 0.5, { type: 'sine', vol: vol * 0.3, at, attack: 0.003, dest });
      this.tone(f * 5.4, dur * 0.2, { type: 'sine', vol: vol * 0.1, at, attack: 0.002, dest });
    },
    /* Pom's trumpet: a sawtooth through a lowpass whose cutoff opens with the note (brassy "blat"), a little vibrato */
    brass(f, dur, { vol = 0.2, at = 0, dest = null } = {}) {
      const c = this.ctx; if (!c) return;
      const t = c.currentTime + at;
      const o = c.createOscillator(), o2 = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
      const vib = c.createOscillator(), vg = c.createGain();
      o.type = 'sawtooth'; o2.type = 'square'; o.frequency.setValueAtTime(f * 0.94, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      o2.frequency.setValueAtTime(f * 0.5, t);
      vib.frequency.value = 5.5; vg.gain.value = f * 0.012; vib.connect(vg); vg.connect(o.frequency);
      lp.type = 'lowpass'; lp.Q.value = 2; lp.frequency.setValueAtTime(400, t); lp.frequency.exponentialRampToValueAtTime(2600, t + 0.06);
      lp.frequency.exponentialRampToValueAtTime(900, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
      g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const g2 = c.createGain(); g2.gain.value = 0.35;
      o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(dest || this.sfx);
      o.start(t); o2.start(t); vib.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
    },
    /* a ukulele-ish pluck: a triangle + a quick bright saw transient, fast decay */
    pluck(f, dur, { vol = 0.12, at = 0, dest = null } = {}) {
      this.tone(f, dur, { type: 'triangle', vol, at, attack: 0.002, dest });
      this.tone(f * 2, Math.min(0.12, dur * 0.4), { type: 'sawtooth', vol: vol * 0.12, at, attack: 0.001, dest });
    },

    tone(freq, dur, { type = 'sine', vol = 0.3, at = 0, slideTo = null, attack = 0.006, dest = null } = {}) {
      const c = this.ctx; if (!c) return;
      const t = c.currentTime + at;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || this.sfx);
      o.start(t); o.stop(t + dur + 0.05);
    },
    noise(dur, { vol = 0.2, at = 0, type = 'bandpass', f0 = 1200, f1 = null, q = 1.2, dest = null, attack = 0.012 } = {}) {
      const c = this.ctx; if (!c) return;
      const t = c.currentTime + at;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
      f.frequency.setValueAtTime(f0, t);
      if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(dest || this.sfx);
      s.start(t, Math.random()); s.stop(t + dur + 0.05);
    },
    /* a marimba-ish mallet note: sine fundamental + a quick 4th harmonic "tok" */
    mallet(f, dur, { vol = 0.2, at = 0, dest = null } = {}) {
      this.tone(f, dur, { type: 'sine', vol, at, attack: 0.003, dest });
      this.tone(f * 4, Math.min(0.08, dur * 0.3), { type: 'sine', vol: vol * 0.22, at, attack: 0.002, dest });
      this.tone(f * 2, dur * 0.5, { type: 'triangle', vol: vol * 0.12, at, attack: 0.003, dest });
    },

    play(name, opt = {}) {
      if (!this.ctx || this.muted || !this.sfxOn) return;
      const now = this.ctx.currentTime;
      const gap = { land: 0.05, pop: 0.05, plip: 0.04, whoosh: 0.08, swish: 0.28, bubbles: 0.12, pat: 0.25, poof: 0.06, coo: 0.4, flutter: 0.15, count: 0.08, hop: 0.06 }[name];
      if (gap && now - (this._lastPlay[name] || 0) < gap) return;   // staggered, never a buzz
      this._lastPlay[name] = now;
      const r = 1 + (Math.random() - 0.5) * 0.08;
      const cn = NOTE(COLOR_NOTE[opt.color] || 76);
      switch (name) {
        case 'pickup':   // a round, happy "plip" in the piece's own note (lifted off the tray)
          this.tone(cn * 0.5 * r, 0.12, { type: 'sine', vol: 0.28, slideTo: cn * 1.2 * r, attack: 0.003 });
          this.noise(0.04, { vol: 0.05, type: 'bandpass', f0: 2400, q: 2 });
          this.tone(cn * r, 0.16, { type: 'triangle', vol: 0.1, at: 0.05 }); break;
        case 'swish': this.noise(0.18, { vol: 0.05, type: 'bandpass', f0: 700, f1: 1900, q: 0.9, attack: 0.04 }); break;   // drag swish
        case 'snap':     // click-clack: two woody clicks + a low thunk, then a sparkle chime in the piece's note
          this.noise(0.03, { vol: 0.26, type: 'bandpass', f0: 2600, q: 4, attack: 0.001 });
          this.noise(0.035, { vol: 0.22, type: 'bandpass', f0: 1700, q: 4, at: 0.07, attack: 0.001 });
          this.tone(200 * r, 0.1, { type: 'sine', vol: 0.26, at: 0.07, slideTo: 120, attack: 0.002 });
          [0, 4, 7, 12].forEach((n, i) => this.tone(cn * Math.pow(2, n / 12), 0.32, { type: 'sine', vol: 0.1, at: 0.14 + i * 0.06, attack: 0.004 }));
          this.tone(cn * 4, 0.3, { type: 'sine', vol: 0.03, at: 0.36 }); break;
        case 'count': { const k = Math.min(opt.i || 1, 12); const f = NOTE(SCALE_C[k] + 72); this.mallet(f, 0.4, { vol: 0.26 }); this.tone(f * 2, 0.25, { vol: 0.08, at: 0.03 }); break; }
        case 'hm':       // the near miss: a curious rising two-note "hm?"
          this.tone(NOTE(67), 0.16, { type: 'triangle', vol: 0.16, attack: 0.02 });
          this.tone(NOTE(72), 0.22, { type: 'triangle', vol: 0.16, at: 0.16, slideTo: NOTE(74), attack: 0.02 }); break;
        case 'boing': this.tone(180 * r, 0.42, { type: 'triangle', vol: 0.24, slideTo: 520 * r }); this.tone(360 * r, 0.3, { type: 'sine', vol: 0.08, at: 0.05, slideTo: 260 * r }); break;
        case 'whoosh': this.noise(0.3, { vol: 0.09, type: 'bandpass', f0: 1800, f1: 500, q: 0.9, attack: 0.03 }); break;   // the piece glides home
        case 'swoosh':   // the board slides in
          this.noise(0.55, { vol: 0.12, type: 'bandpass', f0: 300, f1: 1400, q: 0.7, attack: 0.12 });
          this.tone(NOTE(60), 0.3, { type: 'sine', vol: 0.06, at: 0.3, slideTo: NOTE(67) }); break;
        case 'fwip':     // the page turns away
          this.noise(0.22, { vol: 0.13, type: 'highpass', f0: 1200, f1: 4200, q: 0.6, attack: 0.02 });
          this.noise(0.12, { vol: 0.07, type: 'bandpass', f0: 600, q: 1.2, at: 0.12 }); break;
        case 'land': this.tone((260 + (opt.i || 0) * 30) * r, 0.07, { type: 'sine', vol: 0.12, slideTo: 170 * r, attack: 0.002 }); this.noise(0.04, { vol: 0.05, type: 'bandpass', f0: 1500, q: 2 }); break;   // a piece lands in the tray
        case 'hop': this.tone(330 * r, 0.12, { vol: 0.12, slideTo: 620 * r, type: 'triangle' }); break;
        case 'toot':     // Pom trumpets: "toot-toot-tooo!"
          this.brass(NOTE(67), 0.14, { vol: 0.2 }); this.brass(NOTE(67), 0.14, { vol: 0.2, at: 0.18 }); this.brass(NOTE(72), 0.5, { vol: 0.22, at: 0.36 }); break;
        case 'coo':      // the pigeon: two soft "croo-oo" warbles
          for (let i = 0; i < 2; i++) {
            const t0 = i * 0.36;
            this.tone(NOTE(55) * r, 0.3, { type: 'sine', vol: 0.18, at: t0, slideTo: NOTE(52) * r, attack: 0.03 });
            this.tone(NOTE(62) * r, 0.12, { type: 'sine', vol: 0.06, at: t0 + 0.04, slideTo: NOTE(57) * r, attack: 0.02 });
          }
          break;
        case 'flutter': for (let i = 0; i < 6; i++) this.noise(0.05, { vol: 0.07, type: 'bandpass', f0: 1100, q: 1, at: i * 0.07, attack: 0.01 }); break;
        case 'pop': this.tone(520 * r, 0.08, { vol: 0.16, slideTo: 1100 * r, attack: 0.002 }); this.noise(0.03, { vol: 0.06, type: 'highpass', f0: 3000, q: 0.7 }); break;   // a bubble pops
        case 'bubbles': for (let i = 0; i < (opt.n || 3); i++) this.bubble(i * 0.08, 0.1); break;
        case 'poof': this.noise(0.2, { vol: 0.1, type: 'lowpass', f0: 1400, f1: 400, q: 0.7, attack: 0.01 }); this.tone(700 * r, 0.1, { vol: 0.06, slideTo: 1200 * r }); break;
        case 'complete': [0, 4, 7, 12, 16].forEach((n, i) => this.mallet(NOTE(72 + n), 0.35, { vol: 0.18, at: i * 0.07 })); break;   // the picture is done
        case 'alive':    // the picture comes alive: a shimmering swish + a rising arpeggio
          this.noise(0.5, { vol: 0.1, type: 'bandpass', f0: 600, f1: 3200, q: 0.7, attack: 0.08 });
          [0, 4, 7, 11, 14].forEach((n, i) => this.bell(NOTE(79 + n), 0.5, { vol: 0.07, at: 0.08 + i * 0.07 })); break;
        case 'stepDone': [0, 4, 7].forEach((n, i) => this.mallet(NOTE(79 + n), 0.3, { vol: 0.15, at: i * 0.07 })); break;
        case 'soft': this.tone(500 * r, 0.16, { vol: 0.1, slideTo: 380 * r }); break;
        case 'pat':   // a press on empty space / the board: a gentle muffled pat, no words
          this.tone(210 * r, 0.12, { type: 'sine', vol: 0.14, slideTo: 150 * r, attack: 0.004 });
          this.noise(0.06, { vol: 0.05, type: 'lowpass', f0: 700, q: 0.7 }); break;
        case 'hint': [0, 4, 7, 12].forEach((n, i) => this.tone(NOTE(88 + n), 0.2, { vol: 0.1, at: i * 0.07 })); break;
        case 'star': this.tone(NOTE(84 + (opt.i || 0) * 4), 0.35, { type: 'triangle', vol: 0.22 }); this.tone(NOTE(96 + (opt.i || 0) * 4), 0.3, { vol: 0.09, at: 0.03 }); break;
        case 'level': [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.mallet(NOTE(67 + n), 0.45, { vol: 0.2, at: i * 0.08 })); break;
        case 'fanfare':
          [[0, 0], [4, .14], [7, .28], [12, .42], [7, .62], [12, .76], [16, .9]].forEach(([n, t]) => {
            this.mallet(NOTE(72 + n), 0.5, { vol: 0.2, at: t }); this.tone(NOTE(60 + n), 0.4, { type: 'triangle', vol: 0.14, at: t });
          });
          this.brass(NOTE(72), 0.18, { vol: 0.14, at: 1.15 }); this.brass(NOTE(79), 0.5, { vol: 0.16, at: 1.35 });
          break;
        case 'chapter': [0, 7, 12].forEach((n, i) => this.mallet(NOTE(79 + n), 0.8, { vol: 0.14, at: i * 0.12 })); break;
        case 'click': this.tone(900, 0.05, { vol: 0.14, slideTo: 1300 }); break;
        case 'talkRight': [0, 4, 7, 12].forEach((n, i) => this.mallet(NOTE(76 + n), 0.3, { vol: 0.22, at: i * 0.08 })); break;
        case 'listen': this.tone(NOTE(81), 0.12, { vol: 0.18 }); this.tone(NOTE(88), 0.12, { vol: 0.18, at: 0.1 }); break;
      }
    },

    setMood(i) {
      i = ((i % 4) + 4) % 4;
      if (i === this.mood && this._phrase) return;
      this.mood = i;
      this._phrase = this._makePhrase(i);
      const h = this._hum, am = AMB[i];
      if (h && this.ctx) { const t = this.ctx.currentTime; h.f.frequency.setTargetAtTime(am[0], t, 1); h.g.gain.setTargetAtTime(am[1], t, 1); h.lg.gain.setTargetAtTime(am[2], t, 1); }
      this.apply();
    },
    _makePhrase(i) {
      let seed = 5151 + i * 733;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const notes = []; let deg = 4;
      for (let bar = 0; bar < 4; bar++) for (let s = 0; s < 8; s++) {
        const rest = (s % 2 === 1 && rnd() < 0.55) || (bar === 3 && s >= 5);
        deg = Math.max(1, Math.min(8, deg + Math.round((rnd() - 0.5) * 3)));
        notes.push(rest ? null : deg);
      }
      return notes;
    },
    startMusic() {
      if (!this.ensure()) return;
      if (!this._phrase) this._phrase = this._makePhrase(this.mood);
      this._playing = true;
      this._startHum();
      if (!this._timer) { this._next = this.ctx.currentTime + 0.15; this._step = 0; this._timer = setInterval(() => this._schedule(), 40); }
      this.apply();
    },
    stopMusic() {
      this._playing = false;
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
      this.apply();
      setTimeout(() => { if (!this._playing) this._stopHum(); }, 900);
    },
    _schedule() {
      const c = this.ctx; if (!c) return;
      if (c.state !== 'running') { this._next = c.currentTime + 0.1; return; }
      const m = MUSIC[this.mood];
      const eighth = 60 / m.tempo / 2;
      while (this._next < c.currentTime + 0.2) {
        this._playStep(this._step, this._next, m, eighth);
        this._next += eighth;
        this._step = (this._step + 1) % 32;
      }
    },
    _playStep(step, t, m, eighth) {
      if (!this.musicOn) return;
      const bar = Math.floor(step / 8), s = step % 8, chord = m.prog[bar];
      const at = Math.max(0, t - this.ctx.currentTime), D = this.music;
      if (s === 0 || s === 4) this.tone(NOTE(m.root - 12 + chord[0]), eighth * 3, { vol: 0.26, at, dest: D, attack: 0.01 });   // soft bass
      if (s === 2 || s === 6) chord.forEach(n => this.tone(NOTE(m.root + n), eighth * 1.4, { vol: 0.05, at, dest: D, attack: 0.008 }));
      const deg = this._phrase[step];
      if (deg != null) {
        const f = NOTE(m.root + 12 + SCALE[deg]);
        if (m.lead === 'uke') this.pluck(f, eighth * 1.6, { vol: 0.12, at, dest: D });
        else if (m.lead === 'bell') this.bell(f * 2, eighth * 3, { vol: 0.06, at, dest: D });
        else if (m.lead === 'box') { this.tone(f * 2, eighth * 2.4, { type: 'sine', vol: 0.08, at, dest: D, attack: 0.003 }); this.tone(f * 4.02, eighth, { type: 'sine', vol: 0.018, at, dest: D, attack: 0.003 }); }
        else this.mallet(f, eighth * 1.8, { vol: 0.12, at, dest: D });
      }
    }
  };
  PZ.Audio = A;
})(window.PZ = window.PZ || {});
