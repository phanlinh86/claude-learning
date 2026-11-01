#!/usr/bin/env node
// Mầm's Treasure Reef — headless unit tests for TR.Progress (progress.js) over the real TR.Storage (storage.js).
// Run from projects/education-game/mam-treasure-reef:   node tests/unit/progress.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', '..', 'game', 'js');
const J = v => JSON.parse(JSON.stringify(v));

/** localStorage shim: in-memory map with the Web Storage API surface storage.js uses. */
function makeLocalStorage(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    get length() { return m.size; },
    key(i) { return Array.from(m.keys())[i] ?? null; },
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
    _map: m
  };
}

/** Loads storage.js + progress.js into a sandbox with a fake window and the given localStorage contents. */
function boot(opts) {
  opts = opts || {};
  const sandbox = { console, Math, Date, JSON, localStorage: makeLocalStorage(opts.ls) };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const f of ['storage.js', 'progress.js']) {
    vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), sandbox, { filename: f });
  }
  return sandbox;
}
/** Same, but with a fake in-memory TR.Storage (no storage.js) to prove Progress only relies on the documented API. */
function bootFake() {
  const sandbox = { console, Math, Date, JSON };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`window.TR = { Storage: { cache: {},
    get(k, d) { return k in this.cache ? this.cache[k] : d; },
    getJSON(k, d) { try { const v = this.get(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { this.cache[k] = String(v); return Promise.resolve(true); },
    setJSON(k, v) { this.set(k, JSON.stringify(v)); },
    del(k) { delete this.cache[k]; } } };`, sandbox);
  vm.runInContext(fs.readFileSync(path.join(JS, 'progress.js'), 'utf8'), sandbox, { filename: 'progress.js' });
  return sandbox;
}
function stored(sb) { return JSON.parse(sb.localStorage.getItem('tr:progress')); }

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ---------------------------------------------------------------- tests
test('load on an empty store → safe defaults, no profiles, no current', async () => {
  const sb = boot(); await sb.TR.Storage.init();
  const d = sb.TR.Progress.load();
  assert.deepStrictEqual(J(d), { v: 1, current: null, profiles: [] });
  assert.strictEqual(sb.TR.Progress.current(), null);
  assert.deepStrictEqual(J(sb.TR.Progress.list()), []);
  assert.deepStrictEqual(J(sb.TR.Progress.totals(null)), { stars: 0, pearls: 0, lagoonsDone: 0 });
});

test('ensureDefault creates Mầm (4, turtle, sayAs Mum), selects her, persists, and is idempotent', async () => {
  const sb = boot(); await sb.TR.Storage.init();
  const P = sb.TR.Progress; P.load();
  const p = P.ensureDefault();
  assert.strictEqual(p.name, 'Mầm'); assert.strictEqual(p.age, 4);
  assert.strictEqual(p.avatar, 'turtle'); assert.strictEqual(p.sayAs, 'Mum');
  assert.ok(typeof p.id === 'string' && p.id.length >= 4);
  assert.ok(p.created > 0);
  assert.strictEqual(P.current().id, p.id);
  assert.deepStrictEqual(Object.keys(p.lagoons), ['1', '2', '3', '4', '5', '6']);
  for (const k in p.lagoons) assert.deepStrictEqual(J(p.lagoons[k]), { stars: [0, 0, 0, 0], done: false, best: 0 });
  assert.deepStrictEqual([p.pearls, p.totalStars, p.playSeconds, p.resume], [0, 0, 0, null]);
  const again = P.ensureDefault();
  assert.strictEqual(again.id, p.id); assert.strictEqual(P.list().length, 1);
  // persisted under tr:progress with the documented shape
  const s = stored(sb);
  assert.strictEqual(s.v, 1); assert.strictEqual(s.current, p.id); assert.strictEqual(s.profiles.length, 1);
  assert.deepStrictEqual(Object.keys(s.profiles[0]).sort(),
    ['age', 'avatar', 'created', 'id', 'lagoons', 'name', 'pearls', 'playSeconds', 'resume', 'sayAs', 'totalStars'].sort());
  // a fresh boot reads it back
  const sb2 = boot({ ls: Object.fromEntries(sb.localStorage._map) }); await sb2.TR.Storage.init();
  sb2.TR.Progress.load();
  assert.strictEqual(sb2.TR.Progress.current().name, 'Mầm');
  assert.strictEqual(sb2.TR.Progress.ensureDefault().id, p.id, 'no second default once one exists');
});

test('create: 4-profile cap, unique ids, first profile becomes current', async () => {
  const sb = boot(); await sb.TR.Storage.init();
  const P = sb.TR.Progress; P.load();
  const a = P.create({ name: 'Ana', age: 5, avatar: 'crab' });
  assert.strictEqual(P.current().id, a.id, 'first created is selected');
  const b = P.create({ name: 'Bao', age: 3, avatar: 'dolphin', sayAs: 'Bow' });
  const c = P.create({ name: 'Chi', age: 7, avatar: 'octopus' });
  const d = P.create({ name: 'Dương', age: 6, avatar: 'seahorse' });
  assert.ok(a && b && c && d);
  assert.strictEqual(P.create({ name: 'Em', age: 4, avatar: 'turtle' }), null, 'fifth refused');
  assert.strictEqual(P.list().length, 4);
  assert.strictEqual(new Set(P.list().map(p => p.id)).size, 4);
  assert.strictEqual(P.current().id, a.id, 'later creates do not steal selection');
  assert.strictEqual(P.setCurrent(c.id).id, c.id); assert.strictEqual(P.current().id, c.id);
  assert.strictEqual(P.setCurrent('nope'), null); assert.strictEqual(P.current().id, c.id);
  assert.strictEqual(stored(sb).profiles.length, 4);
  // ensureDefault with a full list just returns current
  assert.strictEqual(P.ensureDefault().id, c.id);
});

test('sanitization: name/sayAs strip <>{} and cap at 16, age clamps 3..7, bad avatar → turtle, update validates', async () => {
  const sb = boot(); await sb.TR.Storage.init();
  const P = sb.TR.Progress; P.load();
  const p = P.create({ name: '<b>Mầm{x}</b> is a very long name indeed', age: 12, avatar: 'shark', sayAs: '{Mum}<>' });
  assert.ok(!/[<>{}]/.test(p.name)); assert.ok(p.name.length <= 16); assert.strictEqual(p.name, 'bMầmx/b is a ver');
  assert.strictEqual(p.sayAs, 'Mum');
  assert.strictEqual(p.age, 7); assert.strictEqual(p.avatar, 'turtle');
  const q = P.create({ name: '', age: 1, avatar: 'crab' });
  assert.strictEqual(q.name, 'Mầm', 'empty name falls back'); assert.strictEqual(q.age, 3);
  const r = P.create({ name: 42, age: 'five', avatar: null });
  assert.strictEqual(r.name, 'Mầm'); assert.strictEqual(r.age, 4);
  P.update(p.id, { name: '  Tí <3 ', age: '6', avatar: 'clownfish', sayAs: '', pearls: 999, id: 'hack', lagoons: null });
  assert.strictEqual(p.name, 'Tí 3'); assert.strictEqual(p.age, 6); assert.strictEqual(p.avatar, 'clownfish');
  assert.strictEqual(p.sayAs, ''); assert.strictEqual(p.pearls, 0, 'patch cannot touch progress fields');
  assert.strictEqual(p.id, P.get(p.id).id); assert.ok(p.lagoons['1']);
  P.update(p.id, { name: '<>', avatar: 'kraken', age: 99 });
  assert.strictEqual(p.name, 'Tí 3', 'empty sanitized name is ignored'); assert.strictEqual(p.avatar, 'clownfish'); assert.strictEqual(p.age, 7);
  assert.strictEqual(P.update('ghost', { name: 'x' }), null);
  assert.strictEqual(stored(sb).profiles[0].name, 'Tí 3', 'update saved');
});

test('unlock chain: lagoon 1 always, k when k−1 done; recordLagoon marks done', async () => {
  const sb = boot(); await sb.TR.Storage.init();
  const P = sb.TR.Progress; P.load();
  const p = P.ensureDefault();
  assert.strictEqual(P.unlocked(p, 1), true);
  for (let k = 2; k <= 6; k++) assert.strictEqual(P.unlocked(p, k), false, 'locked ' + k);
  assert.strictEqual(P.unlocked(p, 0), false); assert.strictEqual(P.unlocked(p, 7), false);
  assert.strictEqual(P.unlocked(null, 2), false); assert.strictEqual(P.unlocked(null, 1), true);
  P.recordLagoon(p, 1, [5, 6, 7, 8]);
  assert.strictEqual(P.unlocked(p, 2), true); assert.strictEqual(P.unlocked(p, 3), false);
  P.recordLagoon(p.id, 2, [1, 1, 1, 1]);           // id form works too
  assert.strictEqual(P.unlocked(p, 3), true);
  P.recordLagoon(p, 4, [13, 13, 13, 13]);           // skipping ahead does not unlock 4's successor's predecessor
  assert.strictEqual(P.unlocked(p, 4), false, '3 not done'); assert.strictEqual(P.unlocked(p, 5), true);
  assert.deepStrictEqual(J(P.totals(p)), { stars: 26 + 4 + 52, pearls: 0, lagoonsDone: 3 });
  assert.strictEqual(stored(sb).profiles[0].lagoons['2'].done, true);
});

test('best-of stars: recordChapter never lowers, clamps 0..13, totals recomputed, pearls accumulate', async () => {
  const sb = boot(); await sb.TR.Storage.init();
  const P = sb.TR.Progress; P.load();
  const p = P.ensureDefault();
  P.recordChapter(p, 1, 0, 9, 30);
  assert.deepStrictEqual(J(p.lagoons['1'].stars), [9, 0, 0, 0]);
  assert.strictEqual(p.pearls, 30); assert.strictEqual(p.totalStars, 9);
  P.recordChapter(p, 1, 0, 4, 12);                  // worse replay: stars stay, pearls still add
  assert.strictEqual(p.lagoons['1'].stars[0], 9); assert.strictEqual(p.pearls, 42);
  P.recordChapter(p, 1, 0, 11, 0);
  assert.strictEqual(p.lagoons['1'].stars[0], 11);
  P.recordChapter(p, 1, 3, 99, -5);                 // out of range input
  assert.strictEqual(p.lagoons['1'].stars[3], 13); assert.strictEqual(p.pearls, 42, 'negative pearls ignored');
  assert.strictEqual(p.totalStars, 24);
  assert.strictEqual(p.lagoons['1'].done, false); assert.strictEqual(p.lagoons['1'].best, 0, 'best only counts once done');
  assert.strictEqual(P.recordChapter(p, 9, 0, 5, 0), null); assert.strictEqual(P.recordChapter(p, 1, 4, 5, 0), null);
  // recordLagoon merges best-of with the chapters already recorded
  P.recordLagoon(p, 1, [3, 7, 2, 1]);
  assert.deepStrictEqual(J(p.lagoons['1'].stars), [11, 7, 2, 13]);
  assert.strictEqual(p.lagoons['1'].best, 33); assert.strictEqual(p.totalStars, 33);
  P.recordLagoon(p, 1, [0, 0, 0, 0]);               // a bad replay never lowers best/stars
  assert.strictEqual(p.lagoons['1'].best, 33); assert.deepStrictEqual(J(p.lagoons['1'].stars), [11, 7, 2, 13]);
  P.recordChapter(p, 1, 2, 10, 1);                  // chapter replay after done bumps best too
  assert.strictEqual(p.lagoons['1'].best, 41);
  assert.strictEqual(stored(sb).profiles[0].lagoons['1'].best, 41);
  assert.strictEqual(sb.TR.Progress.MAX_LAGOON_STARS, 52);
});

test('trophies: null until done, bronze < 20, silver ≥ 20, gold ≥ 32', async () => {
  const sb = boot(); await sb.TR.Storage.init();
  const P = sb.TR.Progress; P.load();
  const p = P.ensureDefault();
  P.recordChapter(p, 1, 0, 13, 0); P.recordChapter(p, 1, 1, 13, 0);   // 26 stars but not done
  assert.strictEqual(P.trophy(p, 1), null);
  P.recordLagoon(p, 2, [5, 5, 5, 4]);  assert.strictEqual(P.trophy(p, 2), 'bronze');  // 19
  P.recordLagoon(p, 3, [5, 5, 5, 5]);  assert.strictEqual(P.trophy(p, 3), 'silver');  // 20
  P.recordLagoon(p, 4, [8, 8, 8, 7]);  assert.strictEqual(P.trophy(p, 4), 'silver');  // 31
  P.recordLagoon(p, 5, [8, 8, 8, 8]);  assert.strictEqual(P.trophy(p, 5), 'gold');    // 32
  P.recordLagoon(p, 6, [13, 13, 13, 13]); assert.strictEqual(P.trophy(p, 6), 'gold'); // 52
  P.recordLagoon(p, 1, [0, 0, 0, 0]);  assert.strictEqual(P.trophy(p, 1), 'silver');  // done; best = 26 from the earlier chapters
  assert.strictEqual(P.trophy(p, 7), null); assert.strictEqual(P.trophy(null, 1), null);
  // trophies move up with replays, never down
  P.recordChapter(p, 2, 3, 13, 0);     assert.strictEqual(P.trophy(p, 2), 'silver');  // 28
  assert.deepStrictEqual(J(P.totals(p)), { stars: 28 + 20 + 31 + 32 + 52 + 26, pearls: 0, lagoonsDone: 6 });
});

test('resume: set validates, replaces, clears; survives reload', async () => {
  const sb = boot(); await sb.TR.Storage.init();
  const P = sb.TR.Progress; P.load();
  const p = P.ensureDefault();
  assert.strictEqual(p.resume, null);
  const r = P.setResume(p, { lagoon: 2, level: 1, levelStars: [7, 9], pearls: 33 });
  assert.deepStrictEqual(J(r), { lagoon: 2, level: 1, levelStars: [7, 9], pearls: 33 });
  assert.deepStrictEqual(J(p.resume), J(r));
  assert.deepStrictEqual(J(stored(sb).profiles[0].resume), J(r));
  P.setResume(p, { lagoon: '3', level: 2, levelStars: [20, -1, 5, 5, 5, 5], pearls: 'x' });
  assert.deepStrictEqual(J(p.resume), { lagoon: 3, level: 2, levelStars: [13, 0, 5, 5], pearls: 0 });
  assert.strictEqual(P.setResume(p, { lagoon: 9, level: 0 }), null, 'invalid lagoon → cleared');
  P.setResume(p, { lagoon: 1, level: 3 });
  assert.deepStrictEqual(J(p.resume), { lagoon: 1, level: 3, levelStars: [], pearls: 0 });
  const sb2 = boot({ ls: Object.fromEntries(sb.localStorage._map) }); await sb2.TR.Storage.init();
  sb2.TR.Progress.load();
  assert.deepStrictEqual(J(sb2.TR.Progress.current().resume), { lagoon: 1, level: 3, levelStars: [], pearls: 0 });
  assert.strictEqual(P.setResume(p, null), null);
  assert.strictEqual(p.resume, null); assert.strictEqual(stored(sb).profiles[0].resume, null);
  assert.strictEqual(P.setResume(null, { lagoon: 1, level: 0 }), null);
});

test('remove: deletes, fixes current (falls to first remaining, then null), persists', async () => {
  const sb = boot(); await sb.TR.Storage.init();
  const P = sb.TR.Progress; P.load();
  const a = P.create({ name: 'A', age: 4, avatar: 'crab' });
  const b = P.create({ name: 'B', age: 4, avatar: 'crab' });
  const c = P.create({ name: 'C', age: 4, avatar: 'crab' });
  P.setCurrent(b.id);
  assert.strictEqual(P.remove(c.id), true, 'removing a non-current keeps current');
  assert.strictEqual(P.current().id, b.id);
  assert.strictEqual(P.remove(b), true, 'profile object accepted');
  assert.strictEqual(P.current().id, a.id, 'current falls to the first remaining');
  assert.strictEqual(P.remove('ghost'), false);
  assert.strictEqual(P.remove(a.id), true);
  assert.strictEqual(P.current(), null); assert.deepStrictEqual(J(P.list()), []);
  assert.deepStrictEqual(J(stored(sb)), { v: 1, current: null, profiles: [] });
  assert.strictEqual(P.get(a.id), null);
});

test('addTime accumulates whole seconds, ignores junk; totals() shape', async () => {
  const sb = boot(); await sb.TR.Storage.init();
  const P = sb.TR.Progress; P.load();
  const p = P.ensureDefault();
  assert.strictEqual(P.addTime(p, 12.4), 12); P.addTime(p, 0.6); assert.strictEqual(p.playSeconds, 13);
  P.addTime(p, -5); P.addTime(p, NaN); P.addTime(p, 'x'); assert.strictEqual(p.playSeconds, 13);
  assert.strictEqual(P.addTime(null, 5), 0);
  assert.strictEqual(stored(sb).profiles[0].playSeconds, 13);
  P.recordChapter(p, 1, 0, 5, 7);
  assert.deepStrictEqual(J(P.totals(p)), { stars: 5, pearls: 7, lagoonsDone: 0 });
});

test('corrupted / hostile stored JSON → load never throws and yields safe, repaired data', async () => {
  const cases = [
    '{not json',
    '[]', 'null', '"str"', '42',
    '{"v":1,"current":"x","profiles":"nope"}',
    JSON.stringify({ v: 7, current: 'zz', profiles: [null, 5, 'a', { id: 'dup' }, { id: 'dup', name: '<script>', age: -3, avatar: 'wolf',
      lagoons: { 1: { stars: [99, -1, 'x'], done: 'yes', best: 'big' }, 2: 'bad', 9: {} }, pearls: -10, playSeconds: 'z',
      resume: { lagoon: 0 } }, {}, {}, {}, {}] })
  ];
  for (const raw of cases) {
    const sb = boot({ ls: { 'tr:progress': raw } }); await sb.TR.Storage.init();
    const P = sb.TR.Progress;
    let d; assert.doesNotThrow(() => { d = P.load(); }, raw);
    assert.strictEqual(d.v, 1); assert.ok(Array.isArray(d.profiles)); assert.ok(d.profiles.length <= 4, raw);
    if (d.profiles.length) assert.ok(d.profiles.some(p => p.id === d.current), 'current points at a profile');
    else assert.strictEqual(d.current, null);
    for (const p of d.profiles) {
      assert.ok(typeof p.id === 'string' && p.id);
      assert.ok(p.name && !/[<>{}]/.test(p.name) && p.name.length <= 16);
      assert.ok(p.age >= 3 && p.age <= 7); assert.ok(P.AVATARS.includes(p.avatar));
      for (const k of ['1', '2', '3', '4', '5', '6']) {
        const L = p.lagoons[k];
        assert.strictEqual(L.stars.length, 4); for (const s of L.stars) assert.ok(Number.isInteger(s) && s >= 0 && s <= 13);
        assert.strictEqual(typeof L.done, 'boolean'); assert.ok(Number.isInteger(L.best) && L.best >= 0 && L.best <= 52);
      }
      assert.ok(p.pearls >= 0 && p.playSeconds >= 0 && p.resume === null || typeof p.resume === 'object');
    }
    assert.doesNotThrow(() => P.ensureDefault());
    assert.ok(P.current());
  }
  // the hostile record in detail
  const sb = boot({ ls: { 'tr:progress': cases[6] } }); await sb.TR.Storage.init();
  const d = sb.TR.Progress.load();
  assert.strictEqual(d.profiles.length, 4, 'junk entries dropped, capped at 4');
  const ids = d.profiles.map(p => p.id); assert.strictEqual(new Set(ids).size, 4, 'duplicate ids repaired');
  const h = d.profiles[1];
  assert.strictEqual(h.name, 'script'); assert.strictEqual(h.age, 3); assert.strictEqual(h.avatar, 'turtle');
  assert.deepStrictEqual(J(h.lagoons['1']), { stars: [13, 0, 0, 0], done: false, best: 0 });
  assert.deepStrictEqual(J(h.lagoons['2']), { stars: [0, 0, 0, 0], done: false, best: 0 });
  assert.strictEqual(h.lagoons['9'], undefined);
  assert.strictEqual(h.pearls, 0); assert.strictEqual(h.playSeconds, 0); assert.strictEqual(h.resume, null);
  assert.strictEqual(h.totalStars, 13);
  assert.strictEqual(d.current, d.profiles[0].id);
  // a lagoon that claims done with low best is lifted to the sum of its chapters
  const sb3 = boot({ ls: { 'tr:progress': JSON.stringify({ profiles: [{ name: 'Z', lagoons: { 3: { stars: [10, 10, 10, 10], done: true, best: 2 } } }] }) } });
  await sb3.TR.Storage.init();
  const z = sb3.TR.Progress.load().profiles[0];
  assert.strictEqual(z.lagoons['3'].best, 40); assert.strictEqual(sb3.TR.Progress.trophy(z, 3), 'gold');
  assert.strictEqual(sb3.TR.Progress.unlocked(z, 4), true);
});

test('load works with no TR.Storage at all and with a fake in-memory TR.Storage', async () => {
  const sb = boot(); // storage not init'ed → empty cache, fine
  assert.doesNotThrow(() => sb.TR.Progress.load());
  delete sb.TR.Storage;
  assert.doesNotThrow(() => { sb.TR.Progress.load(); sb.TR.Progress.ensureDefault(); sb.TR.Progress.save(); });
  const f = bootFake();
  const P = f.TR.Progress; P.load();
  const p = P.ensureDefault(); P.recordChapter(p, 1, 0, 8, 20);
  const raw = JSON.parse(f.TR.Storage.cache.progress);
  assert.strictEqual(raw.profiles[0].pearls, 20); assert.strictEqual(raw.current, p.id);
  P.load();                                        // reload from the fake store
  assert.strictEqual(P.current().lagoons['1'].stars[0], 8);
});

test('memory mode: nothing is read from or written to storage; switching back reloads saved data', async () => {
  const sb = boot(); await sb.TR.Storage.init();
  const P = sb.TR.Progress; P.load();
  const real = P.ensureDefault(); P.recordChapter(real, 1, 0, 6, 10);
  const before = sb.localStorage.getItem('tr:progress');
  assert.strictEqual(P.useMemory(true), true); assert.strictEqual(P.memory(), true);
  assert.deepStrictEqual(J(P.list()), [], 'memory mode starts empty (the ?profile=test profile)');
  const t = P.ensureDefault();
  P.recordLagoon(t, 1, [13, 13, 13, 13]); P.create({ name: 'Sim', age: 5, avatar: 'crab' }); P.addTime(t, 100); P.setResume(t, { lagoon: 2, level: 0 });
  assert.strictEqual(P.trophy(t, 1), 'gold'); assert.strictEqual(P.list().length, 2);
  assert.strictEqual(P.save(), true);
  P.load();
  assert.strictEqual(P.list().length, 2, 'load in memory mode keeps the RAM data');
  assert.strictEqual(sb.localStorage.getItem('tr:progress'), before, 'localStorage untouched');
  assert.strictEqual(sb.TR.Storage.get('progress'), before, 'Storage cache untouched');
  P.useMemory(false); P.load();
  assert.strictEqual(P.list().length, 1); assert.strictEqual(P.current().id, real.id);
  assert.strictEqual(P.current().lagoons['1'].stars[0], 6);
});

test('export / import: round-trips, validates, rejects junk, saves', async () => {
  const sb = boot(); await sb.TR.Storage.init();
  const P = sb.TR.Progress; P.load();
  const p = P.ensureDefault(); P.recordLagoon(p, 1, [9, 9, 9, 9]); P.recordChapter(p, 2, 1, 4, 55); P.addTime(p, 77);
  const json = P.export();
  assert.strictEqual(typeof json, 'string');
  assert.deepStrictEqual(JSON.parse(json), stored(sb));
  const sb2 = boot(); await sb2.TR.Storage.init();
  const P2 = sb2.TR.Progress; P2.load();
  P2.create({ name: 'Old', age: 3, avatar: 'crab' });
  const d = P2.import(json);
  assert.ok(d); assert.deepStrictEqual(J(P2.list()), J(P.list()), 'imported replaces the old store');
  assert.strictEqual(P2.current().id, p.id); assert.strictEqual(P2.trophy(p.id, 1), 'gold');
  assert.deepStrictEqual(stored(sb2), JSON.parse(json), 'import saved');
  assert.strictEqual(P2.import('{bad'), null); assert.strictEqual(P2.import('[]'), null); assert.strictEqual(P2.import({ profiles: 'x' }), null);
  assert.strictEqual(P2.list().length, 1, 'rejected imports change nothing');
  const d2 = P2.import({ profiles: [{ name: '<Hack>', age: 50, avatar: 'x', lagoons: { 1: { stars: [50] } } }] });
  assert.strictEqual(d2.profiles[0].name, 'Hack'); assert.strictEqual(d2.profiles[0].age, 7); assert.deepStrictEqual(J(d2.profiles[0].lagoons['1'].stars), [13, 0, 0, 0]);
});

test('live objects: get/list/current return the same objects the mutators update', async () => {
  const sb = boot(); await sb.TR.Storage.init();
  const P = sb.TR.Progress; P.load();
  const p = P.ensureDefault();
  assert.strictEqual(P.get(p.id), p); assert.strictEqual(P.current(), p); assert.strictEqual(P.list()[0], p);
  P.recordChapter(p.id, 1, 1, 3, 1);
  assert.strictEqual(p.lagoons['1'].stars[1], 3);
  const copy = { id: p.id };                       // a stale/partial object resolves by id
  P.addTime(copy, 9); assert.strictEqual(p.playSeconds, 9);
});

// ---------------------------------------------------------------- runner
(async () => {
  let fail = 0;
  for (const t of tests) {
    try { await t.fn(); console.log('  ok   ' + t.name); }
    catch (e) { fail++; console.log('  FAIL ' + t.name + '\n       ' + (e && e.stack || e)); }
  }
  console.log(fail ? `\n${fail}/${tests.length} failed` : `\nall ${tests.length} progress tests passed`);
  process.exit(fail ? 1 : 0);
})();
