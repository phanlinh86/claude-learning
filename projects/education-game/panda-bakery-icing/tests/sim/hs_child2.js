#!/usr/bin/env node
// Mochi's Icing Bakery — playtester's EXTRA child models + per-trace metrics + sim-only patches (report-only; game/js untouched).
//   node tests/sim/hs_child2.js [--n 60] [--ages 3,4] [--models lifter,backwards,…] [--vps iphoneP,ipadL] [--config '{…}']
//                               [--patch anyPress,dragPick,bothWays] [--jobs 2] [--tag x]
// Models (on top of tests/sim/lib.js typical): lifter (lifts every 50–130 px), backwards (first try of every trace starts at the
// far end and slides backwards), farBag (first try: grabs the icing bag in Mochi's paw and drags it onto the start, then along),
// farTray (first try: presses the cookie centre and slides to the start, then along), dragPick (drags the right choice onto the
// tray instead of tapping it, 50 %), cornerCut (smooths the path over ±35 px of arc: cuts zigzag / star / letter corners),
// par<N> (typical, but the finger runs a steady N logical px beside the dots + a 12 px wobble), dev<N>[c] (typical, but the finger wobble is a FIXED N logical px peak, not a fraction of tol; "c" adds corner cutting ±30 px),
// plus every lib model (typical, slow3, wobbly, tapper, spammer, absent, perfect, bot0.8).
// Patches (monkeypatched into the sim world only — proposed code changes, re-simulated):
//   anyPress  — in a trace step a press anywhere except Mochi is a trace press (dragging the bag from Mochi's paw works)
//   dragPick  — in a pick step a drag that starts on a choice and ends on the tray picks that choice (like a tap)
//   slideNoProg — a press-slide-release on the tray in a trace step that made no progress counts as offPath (hint → magic)
//   offAfterNear — offPath only counts after the press has once been within tol of the dots (slideNoProg covers the rest)
//   bothWays  — a closed outline (shape / size circle) may be traced either way round (direction set by the first 30 px)
// Output: stdout + tests/sim/out/c2_<tag>.md / .json
'use strict';
const fs = require('fs'), path = require('path'), { fork } = require('child_process');
const L = require('./lib'), IB = L.IB;

const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 60), config = JSON.parse(get('config', '{}')), TAG = get('tag', 'c2'), JOBS = +get('jobs', 2);
const MODELS = get('models', 'typical,lifter,backwards,farBag,farTray,dragPick,cornerCut,dev25,dev35,dev45,dev35c,dev45c').split(',');
const AGES = get('ages', '3,4,5,6,7').split(',').map(Number), VPS = get('vps', Object.keys(L.VIEWPORTS).join(',')).split(',');
const PATCH = get('patch', '').split(',').filter(Boolean);

// ---------------------------------------------------------------- sim-only patches
function resample(pts, step) {
  const out = [pts[0]], cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = cum[cum.length - 1];
  let j = 1;
  for (let s = step; s < len - 1e-6; s += step) {
    while (j < cum.length - 1 && cum[j] < s) j++;
    const u = (s - cum[j - 1]) / ((cum[j] - cum[j - 1]) || 1), a = pts[j - 1], b = pts[j];
    out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  out.push(pts[pts.length - 1].slice());
  return { pts: out, len };
}
function applyPatches(w) {
  if (PATCH.includes('offAfterNear')) {   // offPath only counts once this press has been on the dots (a drag from the bag to the start is not "off")
    w._stepTraceHelp = function (h) {
      const cfg = this.cfg, p = this._press, st = this.traceState;
      this._noProgT += h;
      if (p && p.kind === 'trace' && !st.off) p.near = true;
      if (p && p.kind === 'trace' && st.off && !this._magic && p.near) {
        this._offT += h;
        if (this._offT >= cfg.offPathTime && this.time - this._lastOffT >= cfg.offPathGap) {
          this._offT = 0; this._lastOffT = this.time; this._offN++;
          const hd = this._headScreen();
          this._emit({ type: 'offPath', n: this._offN, x: p.lx, y: p.ly, hx: hd.x, hy: hd.y });
          this._traceNoProg();
        }
      } else this._offT = 0;
      if (this._noProgT >= cfg.traceHintIdle) { this._noProgT = 0; this._autoHint(!p); }
    };
  }
  if (PATCH.includes('slideNoProg')) {   // a slide on the tray that made no progress counts like offPath (→ hint → magic)
    const tu = w._traceUp.bind(w);
    w._traceUp = function (p) {
      const st = this.traceState, r = tu(p);
      if (r === null && st && !st.complete && this.interactive && !p.prog && p.moved >= this.cfg.traceTapMove && !this._magic && this._lastOffT < p.t) {
        this._offN++; this._lastOffT = this.time;
        const hd = this._headScreen();
        this._emit({ type: 'offPath', n: this._offN, slide: true, x: p.lx, y: p.ly, hx: hd.x, hy: hd.y });
        this._traceNoProg();
      }
      return r;
    };
  }
  if (PATCH.includes('anyPress')) {
    const down = w.pointerDown.bind(w);
    w.pointerDown = function (x, y) {
      const s = this.stepInfo, b = this._mochiBox ? this._mochiBox() : null;
      const onMochi = b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
      const bagHit = Math.hypot(x - this.layout.bag.x, y - (this.layout.bag.y - 40)) < 90;   // the bag Mochi holds up
      if (this.state === 'round' && !this._press && this.interactive && s && s.mode === 'trace' && !this._onTray(x, y) && (!onMochi || bagHit) && !this.birdHit() && !this.mouseHit()) {
        const ot = this._onTray; this._onTray = () => true;
        try { return down(x, y); } finally { this._onTray = ot; }
      }
      return down(x, y);
    };
  }
  if (PATCH.includes('dragPick')) {
    const up = w.pointerUp.bind(w);
    w.pointerUp = function (x, y) {
      const p = this._press, s = this.stepInfo;
      if (p && p.kind === 'press' && this.interactive && s && (s.mode === 'pickBag' || s.mode === 'pickCookie')) {
        if (x !== undefined) this.pointerMove(x, y);
        const c = this._choiceAt(p.x, p.y);
        if (c && p.maxD >= this.cfg.tapMovePx && this._onTray(x, y, 90)) { this._press = null; return this._tapChoice(c); }
      }
      return up(x, y);
    };
  }
}
if (PATCH.includes('bothWays')) {
  // closed outline, no progress yet: the direction is set by the finger's first 40 px of movement from the press point
  // (dot product with the outline's starting tangent); going the other way round reverses the outline (start unchanged).
  const track = IB.Trace.track;
  IB.Trace.track = function (p, state, x, y, tol, look) {
    if (state && !state.complete && p.strokes.length === 1 && p.strokes[0].closed && state.done < 1e-9 && !p._dirSet) {
      if (state.fx === null || state.fx === undefined) p._bw = [x, y];
      else if (p._bw && Math.hypot(x - p._bw[0], y - p._bw[1]) >= 40) {
        const st = p.strokes[0], P0 = st.pts[0], P1 = st.pts[Math.min(st.pts.length - 1, 6)];
        const nearStart = Math.hypot(p._bw[0] - P0[0], p._bw[1] - P0[1]) <= 1.4 * tol;
        if (nearStart && (x - p._bw[0]) * (P1[0] - P0[0]) + (y - p._bw[1]) * (P1[1] - P0[1]) < 0) { st.pts = resample(st.pts.slice().reverse(), 4).pts; p._reversed = true; }
        p._dirSet = true;
      }
    }
    return track(p, state, x, y, tol, look);
  };
}

// ---------------------------------------------------------------- extra child models
function smoothPts(pts, S) {   // moving average over ±S px of arc; the ends keep their exact place (the window shrinks)
  const r = resample(pts, 4), P = r.pts, n = P.length, k = Math.round(S / 4), out = [];
  for (let i = 0; i < n; i++) {
    const h = Math.min(k, i, n - 1 - i); let sx = 0, sy = 0;
    for (let j = i - h; j <= i + h; j++) { sx += P[j][0]; sy += P[j][1]; }
    out.push([sx / (2 * h + 1), sy / (2 * h + 1)]);
  }
  return out;
}
function offsetPts(P, d) { return P.map((q, i) => { const a = P[Math.max(0, i - 3)], b = P[Math.min(P.length - 1, i + 3)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [q[0] - dy / l * d, q[1] + dx / l * d]; }); }
function line(a, b) { const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(d / 8)), o = []; for (let i = 0; i < n; i++) o.push([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]); return o; }

class Kid2 extends L.Kid {
  constructor(w, prof, seed, o) { super(w, prof, seed); this.o = o || {}; this.sk = ''; this.first = false; Object.assign(this.stats, { firstTries: 0 }); }
  traceAttempt() {
    const w = this.w, r = this.r, p = this.p, o = this.o;
    const key = w.level + ':' + w.round + ':' + w.step;
    if (key !== this.sk) { this.sk = key; this.first = true; }
    const pts0 = w.pathScreen();
    if (!pts0.length) return;
    const tolPx = w.tol * w.layout.tray.s, glow = !!w.hintHand, calm = this.calm || glow;
    if (this.first && o.first && !calm) {
      this.first = false; this.stats.firstTries++;
      let pts;
      if (o.first === 'backwards') pts = pts0.slice().reverse();
      else if (o.first === 'farBag') { const B = w.layout.bag; pts = line([B.x, B.y - 30], pts0[0]).concat(pts0); }
      else if (o.first === 'farTray') { const c = w.cookieScreen() || { x: w.layout.tray.x + w.layout.tray.w / 2, y: w.layout.tray.y + w.layout.tray.h / 2 }; const a = [c.x + r.float(-30, 30), c.y + r.float(-30, 30)]; pts = Math.hypot(a[0] - pts0[0][0], a[1] - pts0[0][1]) > 60 ? line(a, pts0[0]).concat(pts0) : pts0; }
      this.stats.strokes++;
      this.f.stroke(pts, { speed: this.rf(p.speed), amp: p.wobble * tolPx, jit: p.jit, liftAt: -1, excAt: -1 });
      return;
    }
    this.first = false;
    if (o.devPx === undefined && !o.smooth && !o.liftEvery && !o.par) return super.traceAttempt();
    this.calm = 0;
    // a careful/normal attempt with the model's finger
    if (!calm && r.chance(p.pTapTrace)) { this.stats.tapTraces++; const c = w.cookieScreen(), T = w.layout.tray; this.doTap(this.jit(c || { x: T.x + T.w / 2, y: T.y + T.h / 2 })); return; }
    let pts = o.smooth ? smoothPts(pts0, o.smooth) : pts0;
    if (o.par) pts = offsetPts(resample(pts, 4).pts, o.par * (r.chance(0.5) ? 1 : -1));
    this.stats.strokes++;
    const len = pts.reduce((s, q, i) => s + (i ? Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) : 0), 0);
    const se = p.startErr * tolPx * (calm ? 0.5 : 1), ang = r.float(0, 6.28);
    let lift = -1;
    if (o.liftEvery) { if (len > o.liftEvery[1]) lift = this.rf(o.liftEvery); }
    else if (r.chance(p.pLift) && len > 160) lift = r.float(0.3, 0.7) * len;
    const exc = !calm && r.chance(p.pExc) && len > 120 ? r.float(0.1, 0.7) * len : -1;
    if (lift > 0) this.stats.lifts++; if (exc > 0) this.stats.excursions++;
    const amp = o.devPx !== undefined ? o.devPx * (calm ? 0.8 : 1) : p.wobble * tolPx * (calm ? 0.7 : 1);
    this.f.stroke(pts, { speed: this.rf(p.speed), amp, jit: o.devPx !== undefined ? 5 : p.jit, startOff: [se * Math.cos(ang), se * Math.sin(ang)],
      liftAt: lift, excAt: exc, excT: r.float(0.6, 1.4), excAmp: 1.6 * tolPx * (r.chance(0.5) ? 1 : -1) });
  }
  step(dt) {
    const w = this.w, s = w.stepInfo;
    // dragPick: in a pick step, when about to tap the right choice, drag it onto the tray instead (50 %)
    if (this.o.dragPick && w.state === 'round' && w.interactive && s && (s.mode === 'pickBag' || s.mode === 'pickCookie') && !this.f.busy && this.t - dt <= 0 && this.t > 0 && this.r.chance(0.5) && !w.hintHand) {
      const a = w.answer();
      if (a && a.choice) {
        const h = w.choiceHit(a.choice), c = w.cookieScreen() || { x: w.layout.tray.x + w.layout.tray.w / 2, y: w.layout.tray.y + w.layout.tray.h / 2 };
        this.t = this.rf(this.p.between); this.stats.drags = (this.stats.drags || 0) + 1;
        this.f.stroke(line([h.x, h.y], [c.x, c.y]).concat([[c.x, c.y]]), { speed: 400, amp: 3, jit: 2, liftAt: -1, excAt: -1 });
        this.f.s.pick = true;
        return;
      }
    }
    if (this.f.s && this.f.s.pick) { this.stepPickDrag(dt); return; }
    return super.step(dt);
  }
  stepPickDrag(dt) {   // Finger.step ends strokes only in trace steps; a pick drag ends at its last point
    const s = this.f.s; s.t += dt; s.d = Math.min(s.len, s.d + s.speed * dt);
    let i = 1; while (i < s.cum.length - 1 && s.cum[i] < s.d) i++;
    const a = s.pts[i - 1], b = s.pts[Math.min(i, s.pts.length - 1)], u = L.clamp((s.d - s.cum[i - 1]) / ((s.cum[i] - s.cum[i - 1]) || 1), 0, 1);
    const x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u;
    this.w.pointerMove(x, y);
    if (s.d >= s.len || !this.w.interactive) { this.f.s = null; this.w.pointerUp(x, y); }
  }
}
function makeModel(name, w, age, seed) {
  const T = L.typicalProfile(age);
  if (name === 'lifter') return new Kid2(w, Object.assign(T, { pLift: 0 }), seed, { liftEvery: [50, 130] });
  if (name === 'backwards') return new Kid2(w, T, seed, { first: 'backwards' });
  if (name === 'farBag') return new Kid2(w, T, seed, { first: 'farBag' });
  if (name === 'farTray') return new Kid2(w, T, seed, { first: 'farTray' });
  if (name === 'dragPick') return new Kid2(w, T, seed, { dragPick: true });
  if (name === 'cornerCut') return new Kid2(w, T, seed, { smooth: 35 });
  const pm = /^par(\d+)(?:w(\d+))?$/.exec(name);   // a steady sideways bias of N logical px (finger pad / occlusion) + a 12 px (or wY) wobble
  if (pm) return new Kid2(w, T, seed, { par: +pm[1], devPx: pm[2] ? +pm[2] : 12 });
  const m = /^dev(\d+)(c?)$/.exec(name);
  if (m) return new Kid2(w, T, seed, { devPx: +m[1], smooth: m[2] ? 30 : 0 });
  return L.makeModel(name, w, age, seed);
}

// ---------------------------------------------------------------- one session
function runOne(o) {
  const w = L.mkWorld(o); applyPatches(w);
  const d = makeModel(o.model, w, o.age, o.seed + 1), quiet = o.model === 'absent';
  const S = { model: o.model, age: o.age, vp: o.vp, done: false, time: 0, rounds: [], chapters: [], traces: [], picks: [], topics: null, lines: 0, stuck: false };
  w.newSession();
  const dt = 1 / 30, cap = quiet ? 300 : 1800;
  let R = null, chap = null, t = 0, TR = null, PK = null, lastProg = 0;
  while (w.state !== 'sessionDone' && t < cap) {
    d.step(dt); w.update(dt); t += dt;
    for (const e of w.drainEvents()) {
      if (d.onEvent) d.onEvent(e);
      switch (e.type) {
        case 'session': S.topics = e.levels; break;
        case 'level': chap = { topic: e.topic, t0: w.time, rounds: 0 }; break;
        case 'round': R = { topic: w.topic, ri: e.round, t0: w.time, steps: e.steps, modes: e.modes, magic: 0, hints: 0, idle: 0, stars: 0, maxGap: 0, lastProg: w.time }; break;
        case 'ask':
          if (e.mode === 'trace') TR = { t0: w.time, what: e.what, strokes: e.strokes, topic: w.topic, ri: w.round, off: 0, taps: 0, hints: 0, soft: 0, magic: false, starts: 0, fromStart: 0 };
          else if (e.mode === 'pickBag' || e.mode === 'pickCookie') PK = { t0: w.time, wrong: 0, soft: 0, needPick: 0 };
          else PK = null;
          break;
        case 'traceStart': if (TR) { TR.starts++; if (!e.resume) TR.fromStart++; } break;
        case 'offPath': if (TR) TR.off++; break;
        case 'traceTap': if (TR) TR.taps++; break;
        case 'soft': if (TR) TR.soft++; if (PK) PK.soft++; break;
        case 'wrong': if (PK) PK.wrong++; break;
        case 'needPick': if (PK) PK.needPick++; break;
        case 'hint': if (R) R.hints++; if (TR && e.target === 'path') TR.hints++; break;
        case 'assist': if (e.magic) { if (R) R.magic++; if (TR) TR.magic = true; } break;
        case 'idle': if (R) R.idle++; break;
        case 'pick': if (PK) { PK.dur = w.time - PK.t0; S.picks.push(PK); PK = null; } if (R) { R.maxGap = Math.max(R.maxGap, w.time - R.lastProg); R.lastProg = w.time; } break;
        case 'traceProgress': case 'chip': if (R) { R.maxGap = Math.max(R.maxGap, w.time - R.lastProg); R.lastProg = w.time; } break;
        case 'traceDone': if (TR) { TR.dur = w.time - TR.t0; S.traces.push(TR); TR = null; } if (R) { R.maxGap = Math.max(R.maxGap, w.time - R.lastProg); R.lastProg = w.time; } break;
        case 'roundDone': if (R) { R.dur = w.time - R.t0; R.stars = e.stars; S.rounds.push(R); if (chap) chap.rounds++; } R = null; break;
        case 'levelDone': if (chap) { chap.dur = w.time - chap.t0; S.chapters.push(chap); } chap = null; break;
        case 'sessionDone': S.done = true; break;
      }
    }
  }
  S.time = w.time;
  return S;
}

function summarize(list) {
  const by = {};
  for (const s of list) (by[s.model + '|' + s.age] = by[s.model + '|' + s.age] || []).push(s);
  const rows = [];
  for (const k of Object.keys(by)) {
    const ss = by[k], [model, age] = k.split('|'), rounds = ss.flatMap(s => s.rounds), chaps = ss.flatMap(s => s.chapters), tr = ss.flatMap(s => s.traces), pk = ss.flatMap(s => s.picks);
    const done = ss.filter(s => s.done);
    rows.push({ model, age: +age, n: ss.length, done: done.length / ss.length * 100, sess: L.mean(done.map(s => s.time)) / 60, sessP90: L.pct(done.map(s => s.time), 0.9) / 60,
      chap: L.mean(chaps.map(c => c.dur)), chapP90: L.pct(chaps.map(c => c.dur), 0.9), round: L.mean(rounds.map(r => r.dur)), roundP90: L.pct(rounds.map(r => r.dur), 0.9),
      trace: L.mean(tr.map(x => x.dur)), traceP90: L.pct(tr.map(x => x.dur), 0.9), traces: tr.length,
      offPer: L.mean(tr.map(x => x.off)), offAny: tr.filter(x => x.off > 0).length / Math.max(1, tr.length) * 100,
      off2: tr.filter(x => x.off >= 2).length / Math.max(1, tr.length) * 100,
      tapPer: L.mean(tr.map(x => x.taps)), softPer: L.mean(tr.map(x => x.soft)), hintTr: tr.filter(x => x.hints > 0).length / Math.max(1, tr.length) * 100,
      magicTr: tr.filter(x => x.magic).length / Math.max(1, tr.length) * 100, magicRounds: rounds.filter(r => r.magic).length / Math.max(1, rounds.length) * 100,
      st3: rounds.filter(r => r.stars === 3).length / Math.max(1, rounds.length) * 100, gap60: rounds.filter(r => r.maxGap > 60).length, maxGap: Math.max(0, ...rounds.map(r => r.maxGap)),
      pickDur: L.mean(pk.map(x => x.dur)), pickSoft: L.mean(pk.map(x => x.soft)),
      byWhat: (() => { const o = {}; for (const x of tr) { const q = o[x.what] = o[x.what] || { n: 0, off: 0, any: 0, dur: 0, magic: 0 }; q.n++; q.off += x.off; q.any += x.off > 0 ? 1 : 0; q.dur += x.dur; q.magic += x.magic ? 1 : 0; } return o; })(),
      topics: (() => { const o = {}; for (const s of ss) for (const t of s.topics || []) o[t] = (o[t] || 0) + 1; return o; })() });
  }
  rows.sort((a, b) => a.model.localeCompare(b.model) || a.age - b.age);
  return rows;
}
function table(rows) {
  const f = L.f1, out = ['| model | age | n | done % | session min (p90) | chapter s (p90) | round s (p90) | trace s (p90) | offPath / trace | traces with offPath % (≥ 2 %) | traceTap / trace | soft (ignored drag) / trace | traces with a path hint % | magic icing traces % (rounds %) | 3★ rounds % | rounds no progress > 60 s (max) | pick s / ignored drags per pick |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of rows) out.push(`| ${r.model} | ${r.age} | ${r.n} | ${f(r.done)} | ${f(r.sess)} (${f(r.sessP90)}) | ${f(r.chap)} (${f(r.chapP90)}) | ${f(r.round)} (${f(r.roundP90)}) | ${f(r.trace)} (${f(r.traceP90)}) | ${r.offPer.toFixed(2)} | ${f(r.offAny)} (${f(r.off2)}) | ${r.tapPer.toFixed(2)} | ${r.softPer.toFixed(2)} | ${f(r.hintTr)} | ${f(r.magicTr)} (${f(r.magicRounds)}) | ${f(r.st3)} | ${r.gap60} (${f(r.maxGap)}) | ${f(r.pickDur)} / ${r.pickSoft.toFixed(2)} |`);
  out.push('', '| model | age | trace kind: n · offPath/trace · with offPath % · s · magic % |', '|---|---|---|');
  for (const r of rows) out.push(`| ${r.model} | ${r.age} | ${Object.entries(r.byWhat).map(([k, q]) => `${k}: ${q.n} · ${(q.off / q.n).toFixed(2)} · ${(q.any / q.n * 100).toFixed(0)} % · ${(q.dur / q.n).toFixed(1)} · ${(q.magic / q.n * 100).toFixed(0)} %`).join('; ')} |`);
  return out.join('\n');
}

if (process.argv.includes('--worker')) {
  process.on('message', jobs => {
    const res = [];
    for (const j of jobs) { try { res.push(runOne(j)); } catch (e) { console.error('session failed', JSON.stringify(j), e.stack); } }
    process.send(res, () => process.exit(0));
  });
} else if (require.main === module) {
  const jobs = [];
  for (const model of MODELS) for (const age of AGES) for (let i = 0; i < (model === 'absent' ? Math.min(N, 4) : N); i++)
    jobs.push({ model, age, seed: 5000 + i * 41 + age * 11, vp: VPS[i % VPS.length], lang: i % 2 ? 'vi' : 'en', config });
  const parts = Array.from({ length: JOBS }, () => []); jobs.forEach((j, i) => parts[i % JOBS].push(j));
  const t0 = Date.now(), fwd = process.argv.slice(2);
  Promise.all(parts.filter(p => p.length).map(p => new Promise((res, rej) => {
    const c = fork(__filename, fwd.concat(['--worker'])); let got = false;
    c.on('message', m => { got = true; res(m); }); c.on('error', rej); c.on('exit', code => { if (!got) rej(new Error('worker exit ' + code)); });
    c.send(p);
  }))).then(rs => {
    const list = rs.flat(), rows = summarize(list), md = table(rows);
    const head = `# hs_child2 ${TAG} — ${list.length} sessions, vps ${VPS.join(',')}, patch [${PATCH.join(',')}], config ${JSON.stringify(config)} (${((Date.now() - t0) / 1000).toFixed(0)} s)\n\n`;
    console.log(head + md);
    const dir = path.join(__dirname, 'out'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'c2_' + TAG + '.md'), head + md + '\n');
    fs.writeFileSync(path.join(dir, 'c2_' + TAG + '.json'), JSON.stringify({ config, PATCH, rows }, null, 1));
  }).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { runOne, makeModel, applyPatches, summarize };
