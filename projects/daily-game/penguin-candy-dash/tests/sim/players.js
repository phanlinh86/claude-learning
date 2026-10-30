// Pip's Candy Dash — human-like player models for the headless playtest.
//
// Every model plays ONLY through the public input API (setMove / setTarget / action),
// and it only "sees" the world as it was `reaction` ms ago (a ring buffer of snapshots),
// so a 6-year-old with a 350–600 ms reaction really reacts to stale bear positions.
//
//   const P = makePlayer(CD, world, 'kid6', seed);   P.step(dt)  // call before world.update(dt)
'use strict';

const hyp = (x, y) => Math.sqrt(x * x + y * y);

/* Model parameters
 *  rt          reaction delay range, s (perception latency)
 *  every       decision refresh range, s
 *  aim         'nearest' (closest gem) | 'smart' (distance + danger near the gem / the path)
 *  dangerW     weight of danger in 'smart' targeting
 *  avoidR      px gap inside which a noticed bear repels
 *  avoidW      repulsion strength (1 ≈ same weight as the pull to the target)
 *  notice      chance per decision that a given bear is noticed at all
 *  predict     s of bear extrapolation (0 = reacts to where the bear was)
 *  noise       heading noise, rad (sd)
 *  walls       wall-avoidance weight
 *  dashGap     px gap to a noticed bear at which a dash is considered; dashP = chance it is pressed
 *  pop         'never' | 'asap' | 'smart' (bear near or ≥2 in range) | 'late' (kid: rarely)
 *  popP        chance to press when a Pop! condition is met (per decision)
 *  popBored    s at max size after which a 'smart'/'late' player pops anyway (0 = never)
 *  comp        fraction of the own reaction delay compensated by extrapolating bears (0 kid … 0.8 strong);
 *              Pip's own position is always current (the player knows where they steered)
 *  pointer     true = holds the mouse / finger on the target (setTarget), else keys (setMove, 8-way)
 *  mashP       random action presses per decision (kids press buttons)
 */
const MODELS = {
  kid6: { rt: [0.35, 0.6], every: [0.25, 0.4], aim: 'nearest', dangerW: 0, avoidR: 45, avoidW: 1.1, notice: 0.55, predict: 0, comp: 0,
    noise: 0.35, walls: 0, dashGap: 18, dashP: 0.06, pop: 'late', popP: 0.06, popBored: 0, pointer: true, mashP: 0.01 },
  casual: { rt: [0.2, 0.35], every: [0.15, 0.25], aim: 'smart', dangerW: 0.8, avoidR: 90, avoidW: 2.0, notice: 0.85, predict: 0.2, comp: 0.5,
    noise: 0.18, walls: 0.5, dashGap: 24, dashP: 0.35, pop: 'smart', popP: 0.45, popBored: 8, pointer: false, mashP: 0 },
  strong: { rt: [0.15, 0.23], every: [0.1, 0.16], aim: 'smart', dangerW: 1.4, avoidR: 115, avoidW: 2.6, notice: 0.97, predict: 0.3, comp: 0.8,
    noise: 0.08, walls: 0.8, dashGap: 26, dashP: 0.7, pop: 'smart', popP: 0.9, popBored: 4, pointer: false, mashP: 0 }
};
// decision-comparison variants: same hands as `casual`, only the Pop! policy differs
MODELS.greedy = Object.assign({}, MODELS.casual, { pop: 'never' });
MODELS.popspam = Object.assign({}, MODELS.casual, { pop: 'asap', popP: 1 });
MODELS.balanced = Object.assign({}, MODELS.casual, { pop: 'smart', popP: 1, popBored: 3 });
MODELS.strongGreedy = Object.assign({}, MODELS.strong, { pop: 'never' });
MODELS.strongSpam = Object.assign({}, MODELS.strong, { pop: 'asap', popP: 1 });
MODELS.kidKeys = Object.assign({}, MODELS.kid6, { pointer: false });

const EXPLOITS = ['random', 'camper', 'strafer'];

/* --------------------------------------------------------------------------- */
function snapshot(w) {
  return {
    t: w.time, open: w.gate.open, size: w.size,
    pip: { x: w.pip.x, y: w.pip.y, vx: w.pip.vx, vy: w.pip.vy, r: w.pip.radius },
    bears: w.bears.map(b => ({ id: b.id, kind: b.kind, x: b.x, y: b.y, vx: b.vx, vy: b.vy, r: b.radius, stun: b.stun, on: b.spawnT >= 1 })),
    gems: w.gems.map(g => ({ id: g.id, x: g.x, y: g.y, appear: g.appear, loose: g.loose, life: g.life }))
  };
}

function segDist(ax, ay, cx, cy, bx, by) {
  const dx = cx - ax, dy = cy - ay, l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((bx - ax) * dx + (by - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return hyp(ax + dx * t - bx, ay + dy * t - by);
}

class Human {
  constructor(CD, w, m, seed) {
    this.w = w; this.m = m; this.rng = new CD.RNG(seed);
    this.buf = []; this.wait = 0; this.mx = 0; this.my = 0; this.tgt = null; this.targetId = -1;
    this.atMaxT = 0; this.wantAction = -1; this.noiseA = 0;
  }
  // the world as the player perceives it now (rt seconds ago)
  seen(rt) {
    const k = Math.max(0, this.buf.length - 1 - Math.round(rt * 60));
    return this.buf[k];
  }
  step(dt) {
    const w = this.w, m = this.m, r = this.rng;
    if (w.state !== 'playing') { this.buf.length = 0; w.setMove(0, 0); w.setTarget(null); this.atMaxT = 0; this.wantAction = -1; return; }
    this.buf.push(snapshot(w)); if (this.buf.length > 60) this.buf.shift();
    this.atMaxT = w.size >= w.sizeMax ? this.atMaxT + dt : 0;
    // a planned press lands after the reaction delay
    if (this.wantAction >= 0) { this.wantAction -= dt; if (this.wantAction < 0) { this.pressed(); } }
    this.wait -= dt;
    if (this.wait <= 0) { this.wait = r.range(m.every[0], m.every[1]); this.decide(); }
    if (m.pointer) { w.setMove(0, 0); w.setTarget(this.tgt ? this.tgt.x : null, this.tgt ? this.tgt.y : null); }
    else { w.setTarget(null); w.setMove(this.mx, this.my); }
  }
  pressed() {
    const w = this.w, m = this.m;
    // a greedy grower never presses at max size (that would be a Pop!)
    if (m.pop === 'never' && w.size >= w.sizeMax) return;
    w.action();
  }
  plan(delay) { if (this.wantAction < 0) this.wantAction = delay; }
  decide() {
    const w = this.w, m = this.m, r = this.rng, rt = r.range(m.rt[0], m.rt[1]);
    const S = this.seen(rt); if (!S) return;
    const p = { x: w.pip.x, y: w.pip.y, r: w.pip.radius }, sp = w.pipMaxSpeed(S.size), ahead = m.predict + m.comp * rt;
    // ---- target
    let tx, ty, kind = 'gem';
    if (S.open) { tx = w.gate.x; ty = w.gate.y; kind = 'gate'; }
    else {
      let best = null, bc = 1e9, cur = 1e9;
      for (const g of S.gems) {
        if (g.appear < 0.6) continue;
        const d = hyp(g.x - p.x, g.y - p.y), t = d / sp;
        if (g.loose && g.life < t) continue;
        let c = t;
        if (m.aim === 'smart') {
          for (const b of S.bears) {
            if (!b.on || b.stun > t) continue;
            const bd = hyp(g.x - b.x, g.y - b.y);
            c += m.dangerW * Math.exp(-bd / 85) * (b.kind === 'orange' ? 1.3 : 1);
            const sd = segDist(p.x, p.y, g.x, g.y, b.x, b.y);
            if (sd < 70) c += (70 - sd) / 70 * 0.6 * m.dangerW;
          }
          if (g.loose) c -= 0.2;
        }
        if (g.id === this.targetId) cur = c;
        if (c < bc) { bc = c; best = g; }
      }
      if (best && cur < 1e9 && cur <= bc + 0.3) best = S.gems.find(g => g.id === this.targetId) || best;
      if (best) { tx = best.x; ty = best.y; this.targetId = best.id; }
      else { tx = 480; ty = 300; kind = 'roam'; }
    }
    let dx = tx - p.x, dy = ty - p.y, dd = hyp(dx, dy) || 1;
    let mx = dx / dd, my = dy / dd;
    if (kind === 'roam' && dd < 40) { mx = 0; my = 0; }
    // ---- avoidance from noticed bears
    let ax = 0, ay = 0, nearGap = 1e9, inPop = 0, close = 0;
    for (const b of S.bears) {
      if (!b.on || b.stun > 0.3) continue;
      if (!r.chance(m.notice)) continue;
      const bx = b.x + b.vx * ahead, by = b.y + b.vy * ahead;
      const rx = p.x - bx, ry = p.y - by, d = hyp(rx, ry) || 1, gap = d - p.r - b.r;
      nearGap = Math.min(nearGap, gap);
      const d0 = hyp(p.x - (b.x + b.vx * m.comp * rt), p.y - (b.y + b.vy * m.comp * rt));
      if (d0 < w.cfg.popRadius - 15) inPop++;
      if (d0 < 115) close++;
      if (gap > m.avoidR) continue;
      const k = Math.pow((m.avoidR - Math.max(0, gap)) / m.avoidR, 2) * m.avoidW;
      const ux = rx / d, uy = ry / d, side = (mx * -uy + my * ux) >= 0 ? 1 : -1;
      ax += (ux - uy * side * 0.8) * k; ay += (uy + ux * side * 0.8) * k;
    }
    if (m.walls > 0 && kind !== 'gate') {
      const a = w.arena, M = 50;
      if (p.x < a.x + M) ax += (a.x + M - p.x) / M * m.walls;
      if (p.x > a.x + a.w - M) ax -= (p.x - (a.x + a.w - M)) / M * m.walls;
      if (p.y < a.y + M) ay += (a.y + M - p.y) / M * m.walls;
      if (p.y > a.y + a.h - M) ay -= (p.y - (a.y + a.h - M)) / M * m.walls;
    }
    mx += ax; my += ay;
    const l = hyp(mx, my);
    this.noiseA += (r.gauss() * m.noise - this.noiseA) * 0.5;
    if (l > 1e-6) {
      const ang = Math.atan2(my, mx) + this.noiseA;
      mx = Math.cos(ang); my = Math.sin(ang);
    }
    if (m.pointer) {
      // the finger sits on the target, nudged away from bears; the hand is a bit off
      const off = 8 + 12 * Math.abs(this.noiseA) * 3;
      const sx = l > 1e-6 && (ax || ay) ? p.x + mx * Math.min(dd, 90) : tx + r.gauss() * off;
      const sy = l > 1e-6 && (ax || ay) ? p.y + my * Math.min(dd, 90) : ty + r.gauss() * off;
      this.tgt = (kind === 'roam' && dd < 40) ? null : { x: sx, y: sy };
    } else {
      // keyboard: 8-way (arrow keys)
      if (l > 1e-6) { const a8 = Math.round(Math.atan2(my, mx) / (Math.PI / 4)) * (Math.PI / 4); mx = Math.cos(a8); my = Math.sin(a8); }
      this.mx = mx; this.my = my;
    }
    // ---- action button (the press lands after another reaction delay)
    const atMax = S.size >= w.sizeMax;
    if (atMax) {
      let go = false;
      if (m.pop === 'asap') go = true;
      else if (m.pop === 'smart') go = ((close >= 1 || inPop >= 2) && r.chance(m.popP)) || (m.popBored > 0 && this.atMaxT > m.popBored);
      else if (m.pop === 'late') go = r.chance(m.popP) || (close >= 1 && r.chance(0.12));
      if (go) this.plan(rt * 0.5);
    } else if (nearGap < m.dashGap && r.chance(m.dashP)) this.plan(rt * 0.3);
    else if (m.mashP > 0 && r.chance(m.mashP)) this.plan(0);
  }
}

/* ---------------- exploits ---------------- */
class Random {   // a random masher: new direction every 0.3–1 s, action 3 % of frames
  constructor(CD, w, seed) { this.w = w; this.rng = new CD.RNG(seed); this.t = 0; this.mx = 0; this.my = 0; }
  step(dt) {
    const w = this.w, r = this.rng;
    if (w.state !== 'playing') { w.setMove(0, 0); return; }
    this.t -= dt;
    if (this.t <= 0) { this.t = r.range(0.3, 1); const a = r.range(0, Math.PI * 2); this.mx = Math.cos(a); this.my = Math.sin(a); }
    w.setTarget(null); w.setMove(this.mx, this.my);
    if (r.chance(0.03)) w.action();
  }
}
// sits in the bottom-left corner, only darts out for gems within 220 px, dashes when a bear is close
class Camper {
  constructor(CD, w, seed) { this.w = w; this.rng = new CD.RNG(seed); }
  step(dt) {
    const w = this.w, p = w.pip, a = w.arena;
    if (w.state !== 'playing') { w.setTarget(null); return; }
    const cx = a.x + 24, cy = a.y + a.h - 10;
    let t = { x: cx, y: cy };
    if (w.gate.open) t = w.gate;
    else for (const g of w.gems) if (g.appear >= 0.6 && hyp(g.x - cx, g.y - cy) < 220) { t = g; break; }
    w.setMove(0, 0); w.setTarget(t.x, t.y);
    for (const b of w.bears) if (b.spawnT >= 1 && b.stun <= 0 && hyp(b.x - p.x, b.y - p.y) < 50 && this.rng.chance(0.2)) { w.action(); break; }
  }
}
// runs a big ellipse round the arena forever, ignoring bears and gems; Pops whenever full
class Strafer {
  constructor(CD, w, seed) { this.w = w; this.a = 0; this.dir = new CD.RNG(seed).sign(); }
  step(dt) {
    const w = this.w, p = w.pip;
    if (w.state !== 'playing') { w.setTarget(null); return; }
    if (w.gate.open) { w.setMove(0, 0); w.setTarget(w.gate.x, w.gate.y); return; }
    const ang = Math.atan2((p.y - 300) / 170, (p.x - 480) / 360) + this.dir * 0.5;
    w.setMove(0, 0); w.setTarget(480 + Math.cos(ang) * 360, 300 + Math.sin(ang) * 170);
    if (w.size >= w.sizeMax) w.action();
  }
}

function makePlayer(CD, w, model, seed) {
  if (model === 'bot') return new CD.Bot(w, { skill: 1, seed });
  if (model === 'bot0.3') return new CD.Bot(w, { skill: 0.3, seed });
  if (model === 'random') return new Random(CD, w, seed);
  if (model === 'camper') return new Camper(CD, w, seed);
  if (model === 'strafer') return new Strafer(CD, w, seed);
  if (!MODELS[model]) throw new Error('unknown model ' + model);
  return new Human(CD, w, MODELS[model], seed);
}

module.exports = { makePlayer, MODELS, EXPLOITS };
