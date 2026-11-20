// ParamStore.js — headless replacement for the dat.gui controllers that
// WallPaperGroup_General creates. Values live in a plain object (the engine's
// guiParams), so the engine reads them exactly as before.

import { LENGTHMINVALUE, LENGTHMAXVALUE, TWISTMINVALUE, TWISTMAXVALUE }
  from '../vendor/symmhub/lib/orbilib/WallPaperGroup_General.js';

export const RANGES = {
  l: [LENGTHMINVALUE, LENGTHMAXVALUE],
  t: [TWISTMINVALUE, TWISTMAXVALUE],
};

export function clampParam(name, v) {
  const suffix = name.split('_').pop();
  if (suffix === 't') {                    // twists wrap around, like OrbifoldUITool.onParamDrag
    const [lo, hi] = RANGES.t, w = hi - lo;
    while (v > hi) v -= w;
    while (v < lo) v += w;
    return v;
  }
  if (suffix === 'l') return Math.min(Math.max(v, RANGES.l[0]), RANGES.l[1]);
  return v;
}

export class ParamStore {
  constructor(values = {}) {
    this.values = values;          // shared with the engine (wg.guiParams)
    this._names = [];
    this._ranges = {};
    this._listeners = [];
  }
  // called while (re)building a group
  define(name, range) { if (!this._names.includes(name)) this._names.push(name); if (range) this._ranges[name] = range; }
  reset() { this._names = []; this._ranges = {}; }
  has(name) { return this._names.includes(name); }
  names() { return [...this._names]; }
  range(name) { return this._ranges[name] || RANGES[name.split('_').pop()] || [-Infinity, Infinity]; }
  get(name) { return this.values[name]; }
  set(name, v, opts = {}) {
    if (!this.has(name)) return false;
    let nv = clampParam(name, +v);
    const r = this._ranges[name];
    if (r) nv = Math.min(Math.max(nv, r[0]), r[1]);
    if (this.values[name] === nv) return false;
    this.values[name] = nv;
    if (!opts.silent) this._listeners.forEach(cb => cb(name, nv));
    return true;
  }
  onChange(cb) { this._listeners.push(cb); return () => { this._listeners = this._listeners.filter(f => f !== cb); }; }
  snapshot() { const o = {}; for (const n of this._names) o[n] = this.values[n]; return o; }
}

// A fake dat.gui folder whose controllers write through to a ParamStore.
// WallPaperGroup_General calls: add(obj, key[, min, max, step]).onChange(fn),
// addFolder(name), removeFolder(f), open(), and gpname.setValue(v).
export function makeHeadlessFolder(store, onAny) {
  const folder = {
    add(obj, key, min, max) {
      if (key !== 'name') store.define(key, (min !== undefined && max !== undefined) ? [min, max] : undefined);
      const ctrl = {
        _cb: null,
        setValue(v) { obj[key] = v; if (ctrl._cb) ctrl._cb(v); return ctrl; },
        onChange(fn) { ctrl._cb = fn; return ctrl; },
        updateDisplay() { return ctrl; },
        name() { return ctrl; },
      };
      if (onAny && key !== 'name') ctrl.onChange(onAny);
      return ctrl;
    },
    addFolder() { return makeHeadlessFolder(store, onAny); },
    removeFolder() {},
    open() {}, close() {},
  };
  folder.gpname = { setValue() { return folder.gpname; }, onChange() { return folder.gpname; } };
  return folder;
}
