/* TR.Progress — player profiles and progress, pure data over TR.Storage (key 'progress').
 * Stored JSON: { v:1, current: profileId|null, profiles:[ profile, … ] }
 * profile = { id, name, sayAs, age, avatar, created,
 *             lagoons: { "1".."6": { stars:[4 ints 0..13], done, best } },
 *             pearls, totalStars, playSeconds, resume: null | { lagoon, level, levelStars:[…], pearls } }
 * Every mutator validates its input and saves immediately. Stars never go down.
 * useMemory(true) keeps everything in RAM (tests, sims, `?profile=test`) and never touches TR.Storage.
 * Works in node when `window` is a provided global object (see tests/unit/load.js). */
(function (TR) {
  'use strict';

  const KEY = 'progress';
  const VERSION = 1;
  const MAX_PROFILES = 4;
  const LAGOON_IDS = [1, 2, 3, 4, 5, 6];
  const CHAPTERS = 4;
  const MAX_CHAPTER_STARS = 13;                       // 12 + 1 bonus
  const MAX_LAGOON_STARS = CHAPTERS * MAX_CHAPTER_STARS; // 52
  const SILVER = 20, GOLD = 32;
  const AVATARS = ['turtle', 'crab', 'octopus', 'seahorse', 'clownfish', 'dolphin'];
  const NAME_MAX = 16, AGE_MIN = 3, AGE_MAX = 7;

  let data = null;          // { v, current, profiles }
  let memory = false;       // RAM-only mode

  // ---------- helpers ----------
  const now = () => Date.now();
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const clampInt = (v, lo, hi, def) => {
    const n = typeof v === 'string' ? parseInt(v, 10) : v;
    if (typeof n !== 'number' || !isFinite(n)) return def;
    return Math.min(hi, Math.max(lo, Math.round(n)));
  };
  // strict integer in [lo, hi] → the int, else null (ids and indices are never clamped, only rejected)
  function intIn(v, lo, hi) {
    const n = typeof v === 'string' ? parseInt(v, 10) : v;
    if (typeof n !== 'number' || !isFinite(n) || Math.round(n) !== n || n < lo || n > hi) return null;
    return n;
  }
  function sanitizeName(v, max) {
    if (typeof v !== 'string') return '';
    return v.replace(/[<>{}]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  }
  function randomId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let s = 'p';
    for (let i = 0; i < 7; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }
  function uniqueId(list) {
    let id = randomId();
    while (list.some(p => p.id === id)) id = randomId();
    return id;
  }
  function freshLagoon() { return { stars: [0, 0, 0, 0], done: false, best: 0 }; }
  function sumStars(arr) { return arr.reduce((a, b) => a + b, 0); }

  function normalizeLagoon(raw) {
    const L = freshLagoon();
    if (!isObj(raw)) return L;
    const src = Array.isArray(raw.stars) ? raw.stars : [];
    for (let i = 0; i < CHAPTERS; i++) L.stars[i] = clampInt(src[i], 0, MAX_CHAPTER_STARS, 0);
    L.done = raw.done === true;
    L.best = clampInt(raw.best, 0, MAX_LAGOON_STARS, 0);
    if (L.done) L.best = Math.max(L.best, sumStars(L.stars));   // never below the best chapters
    return L;
  }
  function normalizeResume(raw) {
    if (!isObj(raw)) return null;
    const lagoon = intIn(raw.lagoon, 1, 6);
    const level = intIn(raw.level, 0, CHAPTERS - 1);
    if (lagoon === null || level === null) return null;
    const src = Array.isArray(raw.levelStars) ? raw.levelStars : [];
    const levelStars = [];
    for (let i = 0; i < Math.min(src.length, CHAPTERS); i++) levelStars.push(clampInt(src[i], 0, MAX_CHAPTER_STARS, 0));
    return { lagoon, level, levelStars, pearls: clampInt(raw.pearls, 0, 1e9, 0) };
  }
  function recomputeTotals(p) {
    let stars = 0;
    for (const id of LAGOON_IDS) stars += sumStars(p.lagoons[String(id)].stars);
    p.totalStars = stars;
    return p;
  }
  function normalizeProfile(raw, list) {
    if (!isObj(raw)) return null;
    const p = {
      id: typeof raw.id === 'string' && raw.id && !list.some(q => q.id === raw.id) ? raw.id.slice(0, 24) : uniqueId(list),
      name: sanitizeName(raw.name, NAME_MAX),
      sayAs: sanitizeName(raw.sayAs, NAME_MAX),
      age: clampInt(raw.age, AGE_MIN, AGE_MAX, 4),
      avatar: AVATARS.includes(raw.avatar) ? raw.avatar : AVATARS[0],
      created: clampInt(raw.created, 0, 8.64e15, 0) || now(),
      lagoons: {},
      pearls: clampInt(raw.pearls, 0, 1e9, 0),
      totalStars: 0,
      playSeconds: clampInt(raw.playSeconds, 0, 1e9, 0),
      resume: normalizeResume(raw.resume)
    };
    if (!p.name) p.name = 'Mầm';
    const rawL = isObj(raw.lagoons) ? raw.lagoons : {};
    for (const id of LAGOON_IDS) p.lagoons[String(id)] = normalizeLagoon(rawL[String(id)]);
    return recomputeTotals(p);
  }
  function normalizeData(raw) {
    const d = { v: VERSION, current: null, profiles: [] };
    if (!isObj(raw)) return d;
    const src = Array.isArray(raw.profiles) ? raw.profiles : [];
    for (const r of src) {
      if (d.profiles.length >= MAX_PROFILES) break;
      const p = normalizeProfile(r, d.profiles);
      if (p) d.profiles.push(p);
    }
    if (typeof raw.current === 'string' && d.profiles.some(p => p.id === raw.current)) d.current = raw.current;
    else d.current = d.profiles.length ? d.profiles[0].id : null;
    return d;
  }
  function storage() { return TR.Storage && typeof TR.Storage.getJSON === 'function' ? TR.Storage : null; }
  function ensureLoaded() { if (!data) P.load(); return data; }
  function resolve(p) {
    // accept a profile object or an id; always return the live object from `data`
    const d = ensureLoaded();
    const id = isObj(p) ? p.id : p;
    return d.profiles.find(q => q.id === id) || null;
  }

  // ---------- API ----------
  const P = {
    MAX_PROFILES, AVATARS, LAGOON_IDS, CHAPTERS, MAX_CHAPTER_STARS, MAX_LAGOON_STARS, SILVER, GOLD,

    /* RAM-only mode: nothing is read from or written to TR.Storage. Switching on starts with empty data. */
    useMemory(on) {
      memory = !!on;
      data = normalizeData(null);
      return memory;
    },
    memory() { return memory; },

    load() {
      if (memory) { if (!data) data = normalizeData(null); return data; }   // RAM is the store
      let raw = null;
      try { const s = storage(); raw = s ? s.getJSON(KEY, null) : null; } catch (e) { raw = null; }
      data = normalizeData(raw);
      return data;
    },
    save() {
      ensureLoaded();
      if (memory) return true;
      try { const s = storage(); if (s) s.setJSON(KEY, data); return true; }
      catch (e) { return false; }
    },

    list() { return ensureLoaded().profiles.slice(); },
    get(id) { return resolve(id); },
    current() { const d = ensureLoaded(); return d.current ? resolve(d.current) : null; },
    setCurrent(id) {
      const p = resolve(id);
      if (!p) return null;
      data.current = p.id;
      P.save();
      return p;
    },

    create(opts) {
      const d = ensureLoaded();
      if (d.profiles.length >= MAX_PROFILES) return null;
      const o = isObj(opts) ? opts : {};
      const p = normalizeProfile({ name: o.name, age: o.age, avatar: o.avatar, sayAs: o.sayAs, created: now() }, d.profiles);
      d.profiles.push(p);
      if (!d.current) d.current = p.id;
      P.save();
      return p;
    },
    update(id, patch) {
      const p = resolve(id);
      if (!p || !isObj(patch)) return p;
      if ('name' in patch) { const n = sanitizeName(patch.name, NAME_MAX); if (n) p.name = n; }
      if ('sayAs' in patch) p.sayAs = sanitizeName(patch.sayAs, NAME_MAX);
      if ('age' in patch) p.age = clampInt(patch.age, AGE_MIN, AGE_MAX, p.age);
      if ('avatar' in patch && AVATARS.includes(patch.avatar)) p.avatar = patch.avatar;
      P.save();
      return p;
    },
    remove(id) {
      const d = ensureLoaded();
      const i = d.profiles.findIndex(q => q.id === (isObj(id) ? id.id : id));
      if (i < 0) return false;
      d.profiles.splice(i, 1);
      if (!d.profiles.some(q => q.id === d.current)) d.current = d.profiles.length ? d.profiles[0].id : null;
      P.save();
      return true;
    },
    ensureDefault() {
      const d = ensureLoaded();
      if (d.profiles.length) {
        if (!d.current) { d.current = d.profiles[0].id; P.save(); }
        return P.current();
      }
      const p = P.create({ name: 'Mầm', age: 4, avatar: 'turtle', sayAs: 'Mum' });
      d.current = p.id;
      P.save();
      return p;
    },

    unlocked(p, lagoonId) {
      const k = intIn(lagoonId, 1, 6);
      if (k === null) return false;
      if (k === 1) return true;
      const q = resolve(p);
      return !!(q && q.lagoons[String(k - 1)].done);
    },
    recordChapter(p, lagoonId, level, stars, pearlsDelta) {
      const q = resolve(p);
      const k = intIn(lagoonId, 1, 6);
      const lv = intIn(level, 0, CHAPTERS - 1);
      if (!q || k === null || lv === null) return null;
      const L = q.lagoons[String(k)];
      L.stars[lv] = Math.max(L.stars[lv], clampInt(stars, 0, MAX_CHAPTER_STARS, 0));
      if (L.done) L.best = Math.max(L.best, sumStars(L.stars));
      q.pearls += clampInt(pearlsDelta, 0, 1e9, 0);
      recomputeTotals(q);
      P.save();
      return q;
    },
    recordLagoon(p, lagoonId, levelStars) {
      const q = resolve(p);
      const k = intIn(lagoonId, 1, 6);
      if (!q || k === null) return null;
      const L = q.lagoons[String(k)];
      const src = Array.isArray(levelStars) ? levelStars : [];
      for (let i = 0; i < CHAPTERS; i++) L.stars[i] = Math.max(L.stars[i], clampInt(src[i], 0, MAX_CHAPTER_STARS, 0));
      L.done = true;
      L.best = Math.max(L.best, sumStars(L.stars));
      recomputeTotals(q);
      P.save();
      return q;
    },
    setResume(p, r) {
      const q = resolve(p);
      if (!q) return null;
      q.resume = normalizeResume(r);
      P.save();
      return q.resume;
    },
    trophy(p, lagoonId) {
      const q = resolve(p);
      const k = intIn(lagoonId, 1, 6);
      if (!q || k === null) return null;
      const L = q.lagoons[String(k)];
      if (!L.done) return null;
      if (L.best >= GOLD) return 'gold';
      if (L.best >= SILVER) return 'silver';
      return 'bronze';
    },
    addTime(p, seconds) {
      const q = resolve(p);
      if (!q) return 0;
      const s = typeof seconds === 'number' && isFinite(seconds) && seconds > 0 ? seconds : 0;
      q.playSeconds = Math.min(1e9, Math.round(q.playSeconds + s));
      P.save();
      return q.playSeconds;
    },
    totals(p) {
      const q = resolve(p);
      if (!q) return { stars: 0, pearls: 0, lagoonsDone: 0 };
      let lagoonsDone = 0;
      for (const id of LAGOON_IDS) if (q.lagoons[String(id)].done) lagoonsDone++;
      return { stars: q.totalStars, pearls: q.pearls, lagoonsDone };
    },

    /* Backup: export() → JSON string of the whole store; import(json) validates and replaces it (saves). Returns the data or null. */
    export() { return JSON.stringify(ensureLoaded()); },
    import(json) {
      let raw;
      try { raw = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { return null; }
      if (!isObj(raw) || !Array.isArray(raw.profiles)) return null;
      data = normalizeData(raw);
      P.save();
      return data;
    }
  };

  TR.Progress = P;
})(window.TR = window.TR || {});
