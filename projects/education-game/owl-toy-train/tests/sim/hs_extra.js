#!/usr/bin/env node
// Momo's Toy Train — EXTENDED high-speed playtest (report-only; never edits game/js). Adds to hs_playtest.js:
//   * more child models: nowhistle (never pulls the whistle), taponly (taps cargo, never drags until a ghost hand showed
//     dragging — then tries a drag with p 0.35), tapmost (70 % taps), rugdrop (half of the drags are let go on the rug),
//     bot0.5 / bot0.8 / bot1.0 (TT.Bot), plus typical, slow3, high, tapper, spammer from lib.js;
//   * pacing per round (arrive, deal→ask, ask→loaded, loaded→whistle, whistle→gone), dead time, warm-up stats,
//     "drops high" outcomes, repetition between consecutive trains, chapter-1 rotation over 3 sessions;
//   * sim-only patches for proposals that are not plain CONFIG: --patch tapHint (the 2nd tap in a round shows the drag
//     ghost hand; proposed CONFIG.tapHintAfter 2), tapAssist (the 4th tap on cargo in a round glides it into its car).
//   node tests/sim/hs_extra.js [--n 200] [--ages 3,4,5,6,7] [--models …] [--config '{…}'] [--patch tapHint] [--tag x] [--jobs 2]
'use strict';
const fs = require('fs'), path = require('path');
const { fork } = require('child_process');
const L = require('./lib');
const TT = L.TT;

const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 200), config = JSON.parse(get('config', '{}')), PATCH = get('patch', '').split(',').filter(Boolean);
const ALL = 'typical,slow3,high,rugdrop,nowhistle,taponly,tapmost,tapper,spammer,bot0.5,bot0.8,bot1.0';
const MODELS = get('models', ALL).split(','), AGES = get('ages', '3,4,5,6,7').split(',').map(Number);
const TAG = get('tag', 'extra'), JOBS = +get('jobs', 2), SESSIONS = +get('sessions', 1);
const VPS = Object.keys(L.VIEWPORTS);

/* ---------------------------------------------------------------- extra child models */
class KidX extends L.Kid {
  constructor(w, prof, seed, o) { super(w, prof, seed); this.o = o || {}; this.lastKind = null; this.sawDragHint = false; }
  onEvent(e) {
    super.onEvent(e);
    if (e.type === 'loaded' && this.o.noWhistle) this.wT = 1e9;
    if (e.type === 'whistleHint' && this.o.noWhistle) this.wT = 1e9;
    if (e.type === 'hint') this.sawDragHint = true;
    if (e.type === 'round') this.sawDragHint = false;
  }
  plan(it) {
    const w = this.w, r = this.r;
    if (this.o.rug && r.chance(this.o.rug)) {   // drags a bit, lets go on the rug
      this.lastKind = 'rug';
      const R = w.layout.rug, x = L.clamp(it.x + r.float(-220, 220), R.x0, R.x1), y = L.clamp(it.y + r.float(-60, 60), R.y0, R.y1);
      if (Math.hypot(x - it.x, y - it.y) < 60) return { x: L.clamp(it.x + 140, R.x0, R.x1), y };
      return { x, y };
    }
    const s0 = this.stats.high, s1 = this.stats.slips;
    const p = super.plan(it);
    this.lastKind = this.stats.high > s0 ? 'high' : this.stats.slips > s1 ? 'slip' : 'normal';
    return p;
  }
  step(dt) {
    const w = this.w, r = this.r, p = this.p;
    if (this.o.tapP != null && w.state === 'round' && w.phase === 'load' && !this.f.busy) {
      // tap-heavy child: replaces the decision of the base model with "tap" with p = tapP (taponly: 1 until a drag hint)
      const tp = this.o.tapP >= 1 ? (this.sawDragHint ? 0.65 : 1) : this.o.tapP;
      if (this.t < 0) this.t = this.rf(p.between);
      this.t -= dt;
      if (this.t > 0) return;
      const its = w.items.filter(i => i.state === 'rest' && !i._bye);
      if (its.length && r.chance(tp)) {
        const it = r.pick(its); this.stats.taps++; this.lastKind = 'tap';
        this.f.start(it.x, it.y, it.x + r.float(-6, 6), it.y + r.float(-6, 6), r.float(0.08, 0.2), 0);
        this.t = r.float(1.0, 2.2);
        return;
      }
      this.t = 0;   // fall through to a normal drag decision
      if (r.chance(p.pDistract)) { /* no distraction on this path */ }
    }
    return super.step(dt);
  }
}
function makeModel(name, w, age, seed) {
  if (name === 'rugdrop') return new KidX(w, L.typicalProfile(age), seed, { rug: 0.5 });
  if (name === 'nowhistle') return new KidX(w, L.typicalProfile(age), seed, { noWhistle: true });
  if (name === 'taponly') return new KidX(w, Object.assign(L.typicalProfile(age), { pTapFirst: 0 }), seed, { tapP: 1 });
  if (name === 'tapmost') return new KidX(w, Object.assign(L.typicalProfile(age), { pTapFirst: 0 }), seed, { tapP: 0.7 });
  if (name === 'typical') return new KidX(w, L.typicalProfile(age), seed, {});
  if (name === 'slow3') return new KidX(w, L.slowProfile(), seed, {});
  if (name === 'high') return new KidX(w, L.highProfile(age), seed, {});
  return L.makeModel(name, w, age, seed);
}

/* ---------------------------------------------------------------- sim-only patches */
function applyPatches(w, R) {
  if (!PATCH.length) return;
  if (PATCH.includes('aim')) {
    // proposed CONFIG.zoneUpFar 200 + aimTravel 120: a release that is not in any zone but lies above a car's x-span
    // (± zoneSide), at most zoneUpFar px above its top, after the cargo travelled ≥ aimTravel px from home → that car.
    const carAt = w.carAt.bind(w);
    w._drop = (function (orig) {
      return function (it, fx, fy) {
        if (!carAt(fx, fy) && !carAt(it.x, it.y) && Math.hypot(fx - it.homeX, fy - it.homeY) >= (config.aimTravel || 120)) {
          const far = config.zoneUpFar || 200, cfg = this.cfg;
          let best = null, bd = 1e9;
          for (const c of this.cars) {
            const b = this.carBox(c), x0 = b.x - b.w / 2 - cfg.zoneSide, x1 = b.x + b.w / 2 + cfg.zoneSide;
            if (fx >= x0 && fx <= x1 && fy < b.y0 && fy >= b.y0 - far) { const dd = Math.abs(fx - b.x); if (dd < bd) { bd = dd; best = b; } }
          }
          if (best) { R.cur && (R.cur.aimed = (R.cur.aimed || 0) + 1); return orig.call(this, it, best.x, best.y0 + 5); }
        }
        return orig.call(this, it, fx, fy);
      };
    })(w._drop);
  }
  const up = w.pointerUp.bind(w);
  w._px_taps = 0;
  w.pointerUp = function (x, y) {
    const held = this.held;
    const res = up(x, y);
    if (res === 'tap' && this.phase === 'load') {
      this._px_taps++;
      const it = this.itemById(held);
      if (PATCH.includes('tapHint') && this._px_taps >= (config.tapHintAfter || 2) && it) this._autoHint(it, false);
      if (PATCH.includes('tapAssist') && this._px_taps >= (config.tapAssistAfter || 4) && it) {
        // glide it into its right car (as a drop by the game itself; not a mistake, no stars change)
        const cid = this.answerCarId(it.id); const b = cid && this.carBox(cid);
        if (b) { it.state = 'rest'; const st = this.pointerDown(it.x, it.y); if (st === it.id) { this.pointerMove(b.x, b.floorY - 20); up(b.x, b.floorY - 20); if (R.cur) R.cur.assist++; } }
      }
    }
    return res;
  };
}

function labelSig(c) { return c.label.type + ':' + (c.label.value != null ? c.label.value : '') + (c.label.color ? '/' + c.label.color : ''); }
function itemSig(it) { const i = it.item; return i.kind + ':' + (i.sprite || i.toy || i.shape || i.text || '') + ':' + (i.color || ''); }

function runOne(o) {
  const vp = L.VIEWPORTS[o.vp];
  const w = new TT.World({ seed: o.seed, age: o.age, lang: o.lang, config });
  w.setViewport(vp.W, vp.H, vp.ins);
  const d = makeModel(o.model, w, o.age, o.seed + 1);
  const R = { cur: null };
  applyPatches(w, R);
  const S = { model: o.model, age: o.age, sessions: [] };
  let last = null;
  for (let sIdx = 0; sIdx < o.sessions; sIdx++) {
    w.newSession({ lastTopics: last });
    const ss = { done: false, time: 0, rounds: [], chapters: [], topics: w.levels.slice(), stuck: false };
    const dt = 1 / 30, cap = o.cap || 1500;
    let r = null, chap = null, t = 0, t0 = w.time, prevSig = null, prevCount = null, lastChange = 0, sig = '';
    const up0 = w.pointerUp.bind(w);
    w.pointerUp = function (x, y) { const res = up0(x, y); if (r && d.lastKind && res && res !== 'tap') { r.drops.push({ kind: d.lastKind, res }); } return res; };
    while (w.state !== 'sessionDone' && t < cap) {
      d.step(dt); w.update(dt); t += dt;
      const s2 = w.state + ':' + w.phase + ':' + w.level + ':' + w.round + ':' + w.items.filter(i => i.state === 'in').length;
      if (s2 !== sig) { sig = s2; lastChange = t; } else if (t - lastChange > 300) { ss.stuck = s2; break; }
      for (const e of w.drainEvents()) {
        if (d.onEvent) d.onEvent(e);
        switch (e.type) {
          case 'level': chap = { topic: e.topic, t0: w.time, rounds: 0 }; break;
          case 'round': r = R.cur = { ri: e.round, topic: w.topic, t0: w.time, cars: e.cars, items: e.items, mode: e.mode, wrong: 0, miss: 0, taps: 0, hint: 0, hintIdle: 0, idle: 0, assist: 0,
            whistleHint: false, auto: false, drops: [], stillDrag: 0, surprise: e.surprise, short: e.short }; break;
          case 'arrive': if (r) r.arrive = w.time - r.t0; break;
          case 'ask': if (r) {
            r.ask = w.time;
            const sigC = w.cars.map(labelSig).sort().join(','), sigI = w.items.map(itemSig).sort();
            r.sameCarsAsPrev = prevSig && prevSig.c === sigC; r.carOverlap = prevSig ? w.cars.filter(c => prevSig.cs.includes(labelSig(c))).length / w.cars.length : null;
            r.itemOverlap = prevSig ? sigI.filter(x => prevSig.is.includes(x)).length / sigI.length : null;
            if (e.mode === 'count') { const cg = w.items[0] && w.items[0].item.sprite; r.sameCargoAsPrevCount = prevCount === cg; prevCount = cg; r.needs = w.cars.map(c => c.need).join('+'); }
            prevSig = { c: sigC, cs: w.cars.map(labelSig), is: sigI };
          } break;
          case 'wrong': if (r) r.wrong++; break;
          case 'miss': if (r) r.miss++; break;
          case 'tap': if (r) r.taps++; break;
          case 'hint': if (r) { if (e.idle) r.hintIdle++; else r.hint++; } break;
          case 'idle': if (r) r.idle++; break;
          case 'stillDrag': if (r) r.stillDrag++; break;
          case 'loaded': if (r) r.loaded = w.time; break;
          case 'whistleHint': if (r) r.whistleHint = true; break;
          case 'whistle': if (r) { r.whistle = w.time; r.auto = !!e.auto; } break;
          case 'roundDone': if (r) { r.done = w.time; r.dur = w.time - r.t0; r.stars = e.stars; ss.rounds.push(r); if (chap) chap.rounds++; } r = R.cur = null; break;
          case 'levelDone': if (chap) { chap.dur = w.time - chap.t0; ss.chapters.push(chap); } chap = null; break;
          case 'sessionDone': ss.done = true; break;
        }
      }
    }
    w.pointerUp = up0;
    if (r && !ss.done) { r.dur = w.time - r.t0; r.unfinished = true; ss.rounds.push(r); }
    ss.time = w.time - t0;
    last = w.lastTopics || w.levels.slice();
    S.sessions.push(ss);
    if (!ss.done) break;
  }
  return S;
}

/* ---------------------------------------------------------------- summary */
const mean = L.mean, pct = L.pct, f1 = L.f1;
function summarize(list) {
  const by = {};
  for (const s of list) (by[s.model + '|' + s.age] = by[s.model + '|' + s.age] || []).push(s);
  const rows = [];
  for (const k of Object.keys(by)) {
    const [model, age] = k.split('|'); const ss = by[k].flatMap(s => s.sessions);
    const rounds = ss.flatMap(s => s.rounds), fin = rounds.filter(r => !r.unfinished), chaps = ss.flatMap(s => s.chapters), done = ss.filter(s => s.done);
    const drops = rounds.flatMap(r => r.drops);
    const dk = kind => { const a = drops.filter(x => x.kind === kind); return a.length ? { n: a.length, miss: a.filter(x => x.res === 'miss').length / a.length * 100, ok: a.filter(x => x.res === 'correct').length / a.length * 100 } : null; };
    const hi = dk('high'), rug = dk('rug');
    const r0 = fin.filter(r => r.ri % 4 === 0), rN = fin.filter(r => r.ri % 4 !== 0);
    const st = n => fin.filter(r => r.stars === n).length / Math.max(1, fin.length) * 100;
    const ov = fin.filter(r => r.carOverlap != null && r.ri % 4 !== 0);
    rows.push({ model, age: +age, sessions: ss.length, done: done.length / ss.length * 100, stuck: ss.filter(s => s.stuck).length,
      sess: mean(done.map(s => s.time)) / 60, sessP90: pct(done.map(s => s.time), 0.9) / 60, chap: mean(chaps.map(c => c.dur)), chapP90: pct(chaps.map(c => c.dur), 0.9),
      trains: mean(done.map(s => s.rounds.length)),
      round: mean(fin.map(r => r.dur)), roundP90: pct(fin.map(r => r.dur), 0.9), r120: rounds.filter(r => r.dur > 120).length, rMax: Math.max(0, ...rounds.map(r => r.dur)),
      arrive: mean(fin.map(r => r.arrive)), toAsk: mean(fin.map(r => r.ask - r.t0)), load: mean(fin.map(r => r.loaded - r.ask)),
      wWait: mean(fin.map(r => r.whistle - r.loaded)), gone: mean(fin.map(r => r.done - r.whistle)), loadedToGone: mean(fin.map(r => r.done - r.loaded)),
      dead: mean(fin.map(r => (r.dur - (r.loaded - r.ask)) / r.dur * 100)),
      st3: st(3), st2: st(2), st1: st(1), wrong: mean(fin.map(r => r.wrong)), miss: mean(fin.map(r => r.miss)), taps: mean(rounds.map(r => r.taps)),
      hint: mean(rounds.map(r => r.hint)), hintIdle: mean(rounds.map(r => r.hintIdle)), idle: mean(rounds.map(r => r.idle)), assist: mean(rounds.map(r => r.assist)),
      wHint: fin.filter(r => r.whistleHint).length / Math.max(1, fin.length) * 100, wAuto: fin.filter(r => r.auto).length / Math.max(1, fin.length) * 100,
      hiN: hi ? hi.n : 0, hiMiss: hi ? hi.miss : 0, rugN: rug ? rug.n : 0, aimed: mean(rounds.map(r => r.aimed || 0)), rugWrong: rug ? drops.filter(x => x.kind === 'rug' && x.res === 'wrong').length / rug.n * 100 : 0, rugMiss: rug ? rug.miss : 0,
      r0load: mean(r0.map(r => r.loaded - r.ask)), r0wrong: mean(r0.map(r => r.wrong)), rNload: mean(rN.map(r => r.loaded - r.ask)), r03: r0.filter(r => r.stars === 3).length / Math.max(1, r0.length) * 100,
      carOv: mean(ov.map(r => r.carOverlap)) * 100, sameCars: ov.filter(r => r.sameCarsAsPrev).length / Math.max(1, ov.length) * 100, itemOv: mean(ov.map(r => r.itemOverlap)) * 100,
      sameCargo: fin.filter(r => r.mode === 'count' && r.sameCargoAsPrevCount).length / Math.max(1, fin.filter(r => r.mode === 'count' && r.ri % 4 !== 0).length) * 100,
      rot: rotation(by[k]) });
  }
  rows.sort((a, b) => a.model.localeCompare(b.model) || a.age - b.age);
  return rows;
}
function rotation(list) {   // over consecutive sessions of one child: chapter-1 topic repeats, same 4 topics repeats
  let pairs = 0, same1 = 0, sameSet = 0;
  for (const s of list) for (let i = 1; i < s.sessions.length; i++) {
    pairs++; const a = s.sessions[i - 1].topics, b = s.sessions[i].topics;
    if (a[0] === b[0]) same1++;
    if (a.slice().sort().join() === b.slice().sort().join()) sameSet++;
  }
  return pairs ? `${f1(same1 / pairs * 100)}/${f1(sameSet / pairs * 100)}` : '';
}
function table(rows) {
  const o = [];
  o.push('### A. Flow and pacing', '', '| model | age | sess | done % | stuck | session min (p90) | trains | chapter s (p90) | round s (p90) | >120 s (max) | arrive s | round→ask s | ask→loaded s | loaded→whistle s | whistle→gone s | dead time % |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) o.push(`| ${r.model} | ${r.age} | ${r.sessions} | ${f1(r.done)} | ${r.stuck} | ${f1(r.sess)} (${f1(r.sessP90)}) | ${f1(r.trains)} | ${f1(r.chap)} (${f1(r.chapP90)}) | ${f1(r.round)} (${f1(r.roundP90)}) | ${r.r120} (${f1(r.rMax)}) | ${f1(r.arrive)} | ${f1(r.toAsk)} | ${f1(r.load)} | ${f1(r.wWait)} | ${f1(r.gone)} | ${f1(r.dead)} |`);
  o.push('', '### B. Help, mistakes, stars', '', '| model | age | stars 3/2/1 % | wrong/rd | miss/rd | taps/rd | hints (miss / idle) /rd | idle nudges/rd | assists/rd | whistle nudge / auto % | high drops n → miss % | rug drops n → miss % (→ wrong %) | aim-caught/rd |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) o.push(`| ${r.model} | ${r.age} | ${f1(r.st3)}/${f1(r.st2)}/${f1(r.st1)} | ${r.wrong.toFixed(2)} | ${r.miss.toFixed(2)} | ${r.taps.toFixed(2)} | ${r.hint.toFixed(2)} / ${r.hintIdle.toFixed(2)} | ${r.idle.toFixed(2)} | ${r.assist.toFixed(2)} | ${f1(r.wHint)} / ${f1(r.wAuto)} | ${r.hiN} → ${f1(r.hiMiss)} | ${r.rugN} → ${f1(r.rugMiss)} (${f1(r.rugWrong)}) | ${r.aimed.toFixed(2)} |`);
  o.push('', '### C. Warm-up and variety', '', '| model | age | warm-up ask→loaded s | later rounds ask→loaded s | warm-up 3★ % | warm-up wrong/rd | car labels shared with previous train % | identical car set % | cargo shared % | count: same cargo toy as previous count train % | sessions: same chapter 1 / same 4 topics % |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) o.push(`| ${r.model} | ${r.age} | ${f1(r.r0load)} | ${f1(r.rNload)} | ${f1(r.r03)} | ${r.r0wrong.toFixed(2)} | ${f1(r.carOv)} | ${f1(r.sameCars)} | ${f1(r.itemOv)} | ${f1(r.sameCargo)} | ${r.rot} |`);
  return o.join('\n');
}

if (process.argv.includes('--worker')) {
  process.on('message', jobs => {
    const res = [];
    for (const j of jobs) { try { res.push(runOne(j)); } catch (e) { console.error('session failed', JSON.stringify(j), e.stack); } }
    process.send(res, () => process.exit(0));
  });
} else {
  const jobs = [];
  for (const model of MODELS) for (const age of AGES) for (let i = 0; i < N; i++)
    jobs.push({ model, age, seed: 5000 + i * 41 + age * 11, vp: VPS[i % VPS.length], lang: i % 2 ? 'vi' : 'en', sessions: SESSIONS, cap: model === 'taponly' ? 900 : 1500 });
  const per = Math.ceil(jobs.length / JOBS), parts = [];
  for (let k = 0; k < JOBS; k++) parts.push(jobs.slice(k * per, (k + 1) * per));
  const t0 = Date.now();
  Promise.all(parts.filter(p => p.length).map(p => new Promise((res, rej) => {
    const c = fork(__filename, process.argv.slice(2).concat(['--worker'])); let got = false;
    c.on('message', m => { got = true; res(m); }); c.on('error', rej);
    c.on('exit', code => { if (!got) rej(new Error('worker exited ' + code)); });
    c.send(p);
  }))).then(rs => {
    const list = rs.flat(), rows = summarize(list), md = table(rows);
    const head = `# hs_extra ${TAG} — ${list.length} children × ${SESSIONS} session(s), config ${JSON.stringify(config)}, patch ${PATCH.join(',') || '-'} (${((Date.now() - t0) / 1000).toFixed(0)} s)\n\n`;
    console.log(head + md);
    fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, 'out', 'hsx_' + TAG + '.md'), head + md + '\n');
    fs.writeFileSync(path.join(__dirname, 'out', 'hsx_' + TAG + '.json'), JSON.stringify(rows, null, 1));
  }).catch(e => { console.error(e); process.exit(1); });
}
