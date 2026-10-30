/* CD.Storage — tiny key/value store.
 * In the Windows app it is backed by files in %APPDATA%\PipsCandyDash\data (via functions the
 * Go host binds: ffStoreAll / ffStoreSet / ffStoreDel). In a plain browser it falls back to
 * localStorage. Values are strings; helpers for JSON. All reads come from an in-memory cache. */
(function (CD) {
  'use strict';
  const PREFIX = 'cd:';
  const S = {
    native: false,
    cache: {},
    async init() {
      this.native = typeof window.ffStoreSet === 'function' && typeof window.ffStoreAll === 'function';
      if (this.native) {
        try { this.cache = (await window.ffStoreAll()) || {}; }
        catch (e) { console.warn('native store failed, using localStorage', e); this.native = false; }
      }
      if (!this.native) {
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(PREFIX)) this.cache[k.slice(PREFIX.length)] = localStorage.getItem(k);
          }
        } catch (e) { /* storage blocked: memory only */ }
      }
    },
    get(k, def) { return Object.prototype.hasOwnProperty.call(this.cache, k) ? this.cache[k] : def; },
    getJSON(k, def) { try { const v = this.get(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
    /* Save a value. Returns a Promise<boolean>; on failure the value is NOT kept in memory either,
     * so what the player sees always matches what will be there after a restart. */
    set(k, v) {
      v = String(v);
      const prev = this.cache[k];
      this.cache[k] = v;
      const fail = () => { if (prev === undefined) delete this.cache[k]; else this.cache[k] = prev; return false; };
      if (this.native) {
        return Promise.resolve(window.ffStoreSet(k, v))
          .then(ok => ok === false ? fail() : true)
          .catch(e => { console.warn('store set', k, e); return fail(); });
      }
      try { localStorage.setItem(PREFIX + k, v); return Promise.resolve(true); }
      catch (e) { console.warn('localStorage full or blocked', e); return Promise.resolve(fail()); }
    },
    setJSON(k, v) { this.set(k, JSON.stringify(v)); },
    del(k) {
      delete this.cache[k];
      if (this.native) { Promise.resolve(window.ffStoreDel(k)).catch(() => {}); return; }
      try { localStorage.removeItem(PREFIX + k); } catch (e) {}
    }
  };
  CD.Storage = S;
})(window.CD = window.CD || {});
