/* RF.Storage — tiny key/value store.
 * In the Windows app it is backed by files in %APPDATA%\BoltsRooftopFlip\data (via functions the
 * Go host binds: ffStoreAll / ffStoreSet / ffStoreDel). In a plain browser it falls back to
 * localStorage. Values are strings; helpers for JSON. All reads come from an in-memory cache. */
(function (RF) {
  'use strict';
  const PREFIX = 'brf:';
  const S = {
    native: false,
    cache: {},
    _seq: {},
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
      const seq = (this._seq[k] = (this._seq[k] || 0) + 1);
      // roll back only if this is still the latest write for that key (an older write failing late
      // must not wipe a newer, successful value)
      const fail = () => {
        if (this._seq[k] === seq) { if (prev === undefined) delete this.cache[k]; else this.cache[k] = prev; }
        return false;
      };
      if (this.native) {
        return Promise.resolve(window.ffStoreSet(k, v))
          .then(ok => ok === false ? fail() : true)
          .catch(e => { console.warn('store set', k, e); return fail(); });
      }
      try { localStorage.setItem(PREFIX + k, v); return Promise.resolve(true); }
      catch (e) { console.warn('localStorage full or blocked', e); return Promise.resolve(fail()); }
    },
    setJSON(k, v) { return this.set(k, JSON.stringify(v)); },
    /* Delete a value. Returns a Promise<boolean>. */
    del(k) {
      delete this.cache[k];
      this._seq[k] = (this._seq[k] || 0) + 1;
      if (this.native) {
        return Promise.resolve(window.ffStoreDel(k)).then(ok => ok !== false)
          .catch(e => { console.warn('store del', k, e); return false; });
      }
      try { localStorage.removeItem(PREFIX + k); return Promise.resolve(true); } catch (e) { return Promise.resolve(false); }
    }
  };
  RF.Storage = S;
})(window.RF = window.RF || {});
