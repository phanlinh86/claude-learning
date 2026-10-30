// Variants for playtest.js. NOTHING here edits game/js: `config` goes to new PG.World({ config }); `patch` names are
// monkey-patches applied inside the sim sandbox only, as stand-ins for small proposed content/code changes.
//   node tests/sim/playtest.js --variant <name> --n 8 --name pt_<name>
'use strict';

function aimAway(w, it, extra) {
  const L = w.layout, b = w.basket, edge = 0.5 * b.w + 0.25 * it.size + extra;
  const vT = w._fallV(w.age), fallT = (L.sky.bottom - L.spawnY) / vT + 1 / w.cfg.dragRate, land = it.xb + w.windVx * fallT;
  const d = land - w.pup.x;
  if (Math.abs(d) >= edge) return;
  let nl = w.pup.x + (d >= 0 ? 1 : -1) * edge;
  if (nl < L.lanes.x0 || nl > L.lanes.x1) nl = w.pup.x - (d >= 0 ? 1 : -1) * edge;
  const sh = Math.max(L.lanes.x0, Math.min(L.lanes.x1, nl - w.windVx * fallT)) - it.xb;
  it.x += sh; it.xb += sh; it._px = it.x;
}

const PATCHES = {
  // CONTENT: chapter 1 (level 0) has one kind fewer in the air at ages >= 4 (colours: 2 balls instead of 3)
  easyCh1(PG) {
    const P = PG.World.prototype, br = P._beginRound, mk = PG.Content.makeRound;
    P._beginRound = function () { PG.__lvl = this.level; return br.call(this); };
    PG.Content.makeRound = function (topic, o) {
      const r = mk(topic, o);
      if (PG.__lvl === 0 && PG.Content.ageOf(o.age) >= 4 && r.mode === 'catch') {
        const wr = r.pool.filter(t => !t.right);
        if (wr.length >= 2) r.pool.splice(r.pool.indexOf(wr[wr.length - 1]), 1);
      }
      return r;
    };
  },
  // CONTENT: never the same target twice in a row within a chapter (size: never the same colour+size twice)
  noRepeat(PG) {
    const mk = PG.Content.makeRound, last = {};
    PG.Content.makeRound = function (topic, o) {
      let r = mk(topic, o);
      const key = (x) => (topic === 'size' ? x.target.value + '|' + x.pool[0].color : String(x.target.value));
      if ((o.roundIndex || 0) > 0) for (let k = 0; k < 8 && last[topic] === key(r); k++) r = mk(topic, o);
      last[topic] = key(r);
      return r;
    };
  },
  // CONTENT: Talk-time colour choices obey the same colour-blind rule as the rounds below age 5
  talkCvd(PG) {
    const mk = PG.Content.makeTalk, C = PG.Content.COLORS;
    const bad = { red: 'green', green: 'red', blue: 'purple', purple: 'blue' };
    PG.Content.makeTalk = function (topic, o) {
      const t = mk(topic, o);
      if (topic !== 'colors' || PG.Content.ageOf(o.age) >= 5) return t;
      const ans = t.choices.find(c => c.id === t.answerId).value, used = [ans];
      for (const c of t.choices) {
        if (c.id === t.answerId) continue;
        let v = c.value;
        if (used.some(u => bad[u] === v) || used.indexOf(v) >= 0) v = C.find(x => used.indexOf(x) < 0 && !used.some(u => bad[u] === x));
        c.value = v; used.push(v);
      }
      return t;
    };
  },
  // CONTENT: smaller "catch N" counts at 5–6 (COUNT_RANGE is the live object used by makeRound)
  countRange(PG) { PG.Content.COUNT_RANGE[5] = [3, 6]; PG.Content.COUNT_RANGE[6] = [4, 8]; },
  // CODE: a wrong bubble is never aimed at a basket that has stood still for > 1 s (no "oops" for doing nothing)
  wrongAvoidStill(PG) {
    const P = PG.World.prototype, sp = P._spawn, stp = P._stepPup;
    P._stepPup = function (h) { stp.call(this, h); if (Math.abs(this.pup.vx) > 25 || this._pmT === undefined) this._pmT = this.time; };
    P._spawn = function (f) {
      const it = sp.call(this, f);
      if (it && !it.right && this.time - (this._pmT || 0) > 1.0) {
        const L = this.layout, b = this.basket, edge = 0.5 * b.w + 0.25 * it.size + 40;
        const vT = this._fallV(this.age), fallT = (L.sky.bottom - L.spawnY) / vT + 1 / this.cfg.dragRate, land = it.xb + this.windVx * fallT;
        const d = land - this.pup.x;
        if (Math.abs(d) < edge) {
          let nl = this.pup.x + (d >= 0 ? 1 : -1) * edge;
          if (nl < L.lanes.x0 || nl > L.lanes.x1) nl = this.pup.x - (d >= 0 ? 1 : -1) * edge;
          const sh = Math.max(L.lanes.x0, Math.min(L.lanes.x1, nl - this.windVx * fallT)) - it.xb;
          it.x += sh; it.xb += sh; it._px = it.x;
        }
      }
      return it;
    };
  },
  // CODE: hands off the screen for idleHold s (finger up, no touch) → no NEW bubbles until the next touch
  //       (Pip keeps saying the idle line; the bubbles already in the air finish their fall)
  idlePause(PG) {
    const P = PG.World.prototype, ss = P._stepSpawner, pd = P.pointerDown, pm = P.pointerMove, pu = P.pointerUp;
    const touch = (w) => { w._lastTouch = w.time; };
    P.pointerDown = function (x, y) { touch(this); return pd.call(this, x, y); };
    P.pointerMove = function (x, y) { touch(this); return pm.call(this, x, y); };
    P.pointerUp = function (x, y) { touch(this); return pu.call(this, x, y); };
    P._stepSpawner = function (h) {
      if (this._lastTouch === undefined) this._lastTouch = this.time;
      if (this._spawnCount > 0 && !this.finger.down && this.time - this._lastTouch > (this.cfg.idleHold || 15)) {
        // hold: at most ONE bubble (a right one) in the air, at most every idleTrickle s, so a returning child sees one
        let air = 0; for (const it of this.items) if (this._isAir(it)) air++;
        this._sinceSpawn += h; this._noRightT += h;
        if (air === 0 && this._sinceSpawn >= (this.cfg.idleTrickle || 8) && this.basket.reserved < this.basket.need) {
          const it = this._spawn(true);          // aimed beside Pip, outside catch + magnet reach: the child has to come back and move
          if (it) aimAway(this, it, this.cfg.magnetX + 40);
        }
        return;
      }
      return ss.call(this, h);
    };
  },
  // CODE (option, conflicts with REQUIREMENT "a tap is not a move-and-catch decision"): a tap on a RIGHT bubble
  //       sends Pip under it; a tap on a wrong one only names it (Pip stays)
  tapRunsRight(PG) {
    const P = PG.World.prototype, pu = P.pointerUp;
    P.pointerUp = function (x, y) {
      const s = this._steer, n0 = this.counters.taps, r = pu.call(this, x, y);
      if (s && s.hitId && this.counters.taps > n0) { const it = this.itemById(s.hitId); if (it && it.right) { const L = this.layout; this.pup.targetX = Math.max(L.pup.minX, Math.min(L.pup.maxX, it.xb)); } }
      return r;
    };
  },
  // CODE: a child who IS touching but has had no right catch for 20 s gets the next right bubble aimed at Pip
  rescue(PG) {
    const P = PG.World.prototype, sp = P._spawn, em = P._emit, pd = P.pointerDown, br = P._beginRound;
    P.pointerDown = function (x, y) { this._lastTouch = this.time; return pd.call(this, x, y); };
    P._beginRound = function () { const r = br.call(this); this._lastProg = this.time; return r; };
    P._emit = function (e) { if (e.type === 'correct') this._lastProg = this.time; return em.call(this, e); };
    P._spawn = function (f) {
      const it = sp.call(this, f);
      if (it && it.right && this.time - (this._lastProg || 0) > 20 && this.time - (this._lastTouch || -99) < 5) {
        const L = this.layout, vT = this._fallV(this.age), fallT = (L.sky.bottom - L.spawnY) / vT + 1 / this.cfg.dragRate;
        const land = Math.max(L.lanes.x0, Math.min(L.lanes.x1, this.pup.x + (this._srng.next() < 0.5 ? -1 : 1) * 50));
        const sh = Math.max(L.lanes.x0, Math.min(L.lanes.x1, land - this.windVx * fallT)) - it.xb;
        it.x += sh; it.xb += sh; it._px = it.x; this._lastProg = this.time;      // one rescue per 20 s
      }
      return it;
    };
  }
};

const FAST = { fallSpeed: { 3: 66, 4: 72, 5: 78, 6: 88, 7: 98 }, firstSpawn: 0.5 };
const FAST2 = { fallSpeed: { 3: 62, 4: 68, 5: 78, 6: 88, 7: 98 }, firstSpawn: 0.6 };
const ALLP = ['countRange', 'noRepeat', 'talkCvd', 'wrongAvoidStill', 'idlePause', 'rescue'];
const VARIANTS = {
  baseline: {},
  fastStart: { config: FAST },
  chapter95: { config: { chapterTimeLimit: 95 } },
  countRange: { patch: ['countRange'] },
  noRepeat: { patch: ['noRepeat'] },
  talkCvd: { patch: ['talkCvd'] },
  wrongAvoidStill: { patch: ['wrongAvoidStill'] },
  idlePause: { patch: ['idlePause'] },
  rescue: { patch: ['rescue'] },
  magnet5: { config: { magnetMaxAge: 5 } },
  proposal: { config: Object.assign({ chapterTimeLimit: 95 }, FAST), patch: ['countRange', 'noRepeat', 'talkCvd', 'wrongAvoidStill', 'idlePause', 'rescue'] },
  fastStart2: { config: FAST2 },
  chapter85: { config: { chapterTimeLimit: 85 } },
  proposal2: { config: Object.assign({}, FAST2), patch: ALLP },
  proposal3: { config: Object.assign({ chapterTimeLimit: 85 }, FAST2), patch: ALLP },
  tapRunsRight: { patch: ['tapRunsRight'] },
  magnet6: { config: { magnetMaxAge: 6 } },
  // the recommended set: config (FAST2 + magnet to age 5, chapter limit unchanged) + content/code patches (no rescue)
  final: { config: Object.assign({ magnetMaxAge: 5 }, FAST2), patch: ['countRange', 'noRepeat', 'talkCvd', 'wrongAvoidStill', 'idlePause'] },
  final2: { config: Object.assign({ magnetMaxAge: 6 }, FAST2), patch: ['countRange', 'noRepeat', 'talkCvd', 'wrongAvoidStill', 'idlePause'] },
  final2Cfg: { config: Object.assign({ magnetMaxAge: 6 }, FAST2) },
  final2Tap: { config: Object.assign({ magnetMaxAge: 6 }, FAST2), patch: ['countRange', 'noRepeat', 'talkCvd', 'wrongAvoidStill', 'idlePause', 'tapRunsRight'] },
  easyCh1: { patch: ['easyCh1'] },
  finalCfg: { config: Object.assign({ magnetMaxAge: 5 }, FAST2) },
  proposalCfgOnly: { config: Object.assign({ chapterTimeLimit: 95 }, FAST) }
};

let applied = null;
function apply(name, PG) {
  if (applied === name) return VARIANTS[name];
  if (applied) throw new Error('variant already applied: ' + applied);
  for (const p of VARIANTS[name].patch || []) PATCHES[p](PG);
  applied = name; return VARIANTS[name];
}
module.exports = { VARIANTS, PATCHES, apply };
