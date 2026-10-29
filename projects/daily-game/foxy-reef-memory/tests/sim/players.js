// Foxy's Reef Memory — human-like player models for the headless playtest sim.
//
// A model only uses what a person can SEE:
//  - a face is learned only when that card is shown face-up (its own flip, the open pair, the peek);
//  - memory is a list of "this face is in that CELL" notes, with a capacity, per-move forgetting
//    and occasional off-by-one location errors;
//  - on a gravity 'slide' event, each remembered card that moved is followed with probability
//    `track`; otherwise the note is dropped, or (staleFrac) it stays at the OLD cell, which is
//    what really happens to a child who did not watch the slide;
//  - think time between picks is drawn per pick; a child usually watches the mismatch until the
//    cards flip back, an adult often taps straight through it.
'use strict';

const MODELS = {
  // 6-year-old: slow, small memory, easily loses cards that slide
  kid6:   { think: [1.5, 3.0], second: 0.8, cap: 5,  forget: 0.10, locErr: 0.12, track: 0.30, staleFrac: 0.6, impulsive: 0.12, waitMismatch: 0.9, peekRate: 1.0 },
  // 9-year-old: in between
  kid9:   { think: [1.0, 2.0], second: 0.8, cap: 6,  forget: 0.07, locErr: 0.07, track: 0.45, staleFrac: 0.5, impulsive: 0.07, waitMismatch: 0.7, peekRate: 1.5 },
  // casual adult
  casual: { think: [0.8, 1.5], second: 0.75, cap: 8, forget: 0.04, locErr: 0.04, track: 0.65, staleFrac: 0.4, impulsive: 0.04, waitMismatch: 0.4, peekRate: 2.0 },
  // strong player
  strong: { think: [0.5, 0.9], second: 0.7, cap: 14, forget: 0.01, locErr: 0.01, track: 0.92, staleFrac: 0.2, impulsive: 0.0, waitMismatch: 0.1, peekRate: 3.5 },
  // exploit checks (no memory at all)
  random:     { kind: 'random', think: [0.25, 0.45], waitMismatch: 0 },   // fast masher
  randomSlow: { kind: 'random', think: [0.7, 1.2],  waitMismatch: 0.5 }, // a toddler poking cards
  sweeper:    { kind: 'sweep',  think: [0.3, 0.5],  waitMismatch: 0 }    // flips in reading order, no memory
};

const key = (c, r) => c + ',' + r;

class Human {
  constructor(world, model, rng) {
    this.w = world; this.p = model; this.rng = rng;
    this.wait = 0.4; this.watching = false;
    this.mem = new Map();        // cellKey -> { face, t }
    this.sweep = 0;
    this.picks = 0;
  }
  think(mul) { return this.rng.range(this.p.think[0], this.p.think[1]) * (mul || 1); }

  remember(col, row, face) {
    if (this.p.kind) return;
    const k = key(col, row);
    this.mem.delete(k);
    this.mem.set(k, { face, t: this.w.time });
    while (this.mem.size > this.p.cap) this.mem.delete(this.mem.keys().next().value);   // oldest out
  }
  forgetRoll() {
    if (this.p.kind) return;
    for (const k of [...this.mem.keys()]) if (this.rng.chance(this.p.forget)) this.mem.delete(k);
  }

  onEvent(e) {
    const w = this.w;
    switch (e.type) {
      case 'deal': this.mem.clear(); this.sweep = 0; this.watching = false; this.wait = 0.3; break;
      case 'peek':
        if (e.on && !this.p.kind) {
          // learn some cards during the peek (reading rate × peek time, capped by memory)
          const n = Math.min(this.p.cap, Math.round(this.p.peekRate * w.cfg.peekTime));
          const cards = w.cards.filter(c => c.state !== 'gone').slice();
          for (let i = 0; i < n && cards.length; i++) {
            const c = cards.splice(Math.floor(this.rng.next() * cards.length), 1)[0];
            this.remember(c.col, c.row, c.face);
          }
        }
        break;
      case 'flip': { const c = w.card(e.id); if (c) this.remember(c.col, c.row, c.face); break; }
      case 'match':
        for (const id of e.ids) { const c = w.card(id); if (c) this.mem.delete(key(c.col, c.row)); }
        this.forgetRoll(); this.watching = false; this.wait = this.think(); break;
      case 'mismatch':
        this.forgetRoll();
        if (this.rng.chance(this.p.waitMismatch)) { this.watching = true; this.wait = 0; }
        else { this.watching = false; this.wait = this.think(); }
        break;
      case 'unflip': if (this.watching) { this.watching = false; this.wait = this.think(); } break;
      case 'slide': {
        if (this.p.kind) break;
        const moved = new Map();
        for (const m of e.moves) {
          const k = key(m.fromCol, m.fromRow), n = this.mem.get(k);
          if (!n) continue;
          if (this.rng.chance(this.p.track)) { this.mem.delete(k); moved.set(key(m.col, m.row), n); }
          else if (!this.rng.chance(this.p.staleFrac)) this.mem.delete(k);   // else: stale note stays at old cell
        }
        for (const [k, n] of moved) this.mem.set(k, n);
        break;
      }
    }
  }

  downCards() { return this.w.cards.filter(c => c.state === 'down'); }

  /** Pick a cell from memory; maybe slip to a neighbour. */
  recall(k) {
    const [c, r] = k.split(',').map(Number);
    if (this.rng.chance(this.p.locErr)) {
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => this.w._cardIn(c + dx, r + dy)).filter(x => x && x.state === 'down');
      if (nb.length) return this.rng.pick(nb);
    }
    return this.w._cardIn(c, r);
  }

  choose() {
    const w = this.w, down = this.downCards();
    if (!down.length) return null;
    const open = w._mismatch ? [] : w.cards.filter(c => c.state === 'up');
    if (this.p.kind === 'random') return this.rng.pick(down);
    if (this.p.kind === 'sweep') {
      const order = down.slice().sort((a, b) => (a.row - b.row) || (a.col - b.col));
      const idx = order.findIndex(c => c.row * 100 + c.col >= this.sweep);
      // on a wrap, start one card later so the pairings change (else it repeats the same pairs forever)
      if (idx < 0) this.wraps = (this.wraps || 0) + 1;
      const c = order[idx >= 0 ? idx : (this.wraps % 2) % order.length];
      this.sweep = c.row * 100 + c.col + 1;
      return c;
    }
    if (this.rng.chance(this.p.impulsive)) return this.rng.pick(down);
    // what the memory says about the board
    const byFace = new Map(), unknown = [];
    for (const c of down) {
      const n = this.mem.get(key(c.col, c.row));
      if (n) { if (!byFace.has(n.face)) byFace.set(n.face, []); byFace.get(n.face).push(key(c.col, c.row)); }
      else unknown.push(c);
    }
    if (open.length === 1) {
      const f = open[0].face, ks = (byFace.get(f) || []).filter(k => k !== key(open[0].col, open[0].row));
      if (ks.length) return this.recall(ks[0]);
      return unknown.length ? this.rng.pick(unknown) : this.rng.pick(down);
    }
    for (const [, ks] of byFace) if (ks.length >= 2) return this.recall(ks[0]);
    return unknown.length ? this.rng.pick(unknown) : this.rng.pick(down);
  }

  step(dt) {
    const w = this.w;
    if (w.state !== 'playing') return;
    if (this.watching) return;
    if (this.wait > 0) { this.wait -= dt; return; }
    const openUp = w.cards.filter(c => c.state === 'up').length;
    if (openUp === 2 && !w._mismatch) { this.wait = 0.03; return; }   // being judged
    const c = this.choose();
    if (!c) { this.wait = 0.1; return; }
    if (c.moving || c.state !== 'down') { this.wait = 0.12; return; }   // waits for the slide to finish
    const wasOne = openUp === 1 && !w._mismatch;
    if (w.select(c.id)) {
      this.picks++;
      // 1st pick: look at the face, then pick the 2nd card. 2nd pick: the match/mismatch event sets the next wait.
      this.wait = wasOne ? 0.5 : Math.max(0.25, this.think(this.p.second || 1));
    } else this.wait = 0.1;
  }
}

module.exports = { MODELS, Human };
