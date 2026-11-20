// OrbifoldModel.js — signature → group geometry, parameters and feature map.
//
// Hyperbolic and spherical groups come from the SymmHub engine
// (WallPaperGroup_General, run headless through ParamStore). Euclidean groups
// use the engine's own lattice builders (iGroup_* in WallpaperGroups_NonNegative)
// with Orbiscope's lattice parameters, so their shape can be dragged.
//
// The derived geometry (this.geo) is what every view reads:
//   mode    'hyp' | 'euc' | 'sph'
//   faces   [{ wall, bounds[], tr[], parity, kind, pair, color, label, tokens[], params, ends }]
//   inner   [{ wall, A, B, label, tokens[], params }]  interior cuts (tubes, slices)
//   points  [{ pos, kind: 'cone'|'corner', n, tokens[], word }]
//   comma   { c, size, A | e1,e2 }    where the motif sits in the fundamental domain (see Motif.js)
//   handles [{ id, pos, label }]      Euclidean lattice handles (world coordinates)

import { WallPaperGroup_General } from '../vendor/symmhub/lib/orbilib/WallPaperGroup_General.js';
import {
  hashOrbifoldString, nonNegHashOrbifold, lengthKeys, twistKeys,
  iGroup_O, iGroup_S442, iGroup_442, iGroup_4S2, iGroup_S632, iGroup_632, iGroup_3S3,
  iGroup_S333, iGroup_333, iGroup_S2222, iGroup_2222, iGroup_2S22, iGroup_22S, iGroup_SS,
  iGroup_SX, iGroup_22X, iGroup_XX,
} from '../vendor/symmhub/lib/orbilib/modules.js';

// The engine's iWallpaperGroup() dispatcher calls getParam without importing it
// (SymmHub commit in vendor/SOURCE.md), so Orbiscope dispatches itself.
const EUC_BUILDERS = {
  '*442': () => iGroup_S442(1), '442': () => iGroup_442(1), '4*2': () => iGroup_4S2(1),
  '*632': () => iGroup_S632(1), '632': () => iGroup_632(1), '3*3': () => iGroup_3S3(1),
  '*333': () => iGroup_S333(1), '333': () => iGroup_333(1),
  '*2222': v => iGroup_S2222(1, v.lattice_b), '2222': v => iGroup_2222(1, v.lattice_b, v.lattice_c),
  '2*22': v => iGroup_2S22(1, v.lattice_b), '22*': v => iGroup_22S(1, v.lattice_b),
  '**': v => iGroup_SS(1, v.lattice_b), 'X*': v => iGroup_SX(1, v.lattice_b),
  '22X': v => iGroup_22X(1, v.lattice_b), 'XX': v => iGroup_XX(1, v.lattice_b),
  'O': v => iGroup_O([1, 0], [v.lattice_x, v.lattice_y]),
};
import { ParamStore, makeHeadlessFolder } from './ParamStore.js';
import { withDefaultFrame, settle } from './Motif.js';
import * as Sig from './Signature.js';
import {
  SPHERE, PLANE, wallFromSplane, wallFromSplane3, dist2, apply2, applyInv2, reflect2,
  dot3, cross3, norm3, reflect3, apply3, applyInv3, C,
} from './geom.js';

export const PAIR_COLORS = ['#3b5bdb', '#9c36b5', '#e8590c', '#2b8a3e', '#c2255c', '#1098ad', '#5f3dc4', '#a0522d', '#d6336c', '#0c8599'];
export const MIRROR_COLOR = '#d0352b';
export const CUT_COLOR = '#6b6a62';

// Euclidean families and their lattice parameters
const EUC_RIGID = ['*442', '442', '4*2', '*632', '632', '3*3', '*333', '333'];
const EUC_RATIO = ['*2222', '2*22', '22*', '**', 'X*', '22X', 'XX'];
export const LATTICE_DEFAULTS = { lattice_b: 0.7, lattice_c: 0.15, lattice_x: 0.3, lattice_y: 0.9 };
const LATTICE_RANGES = { lattice_b: [0.3, 3], lattice_c: [-1.5, 1.5], lattice_x: [-1.5, 2.5], lattice_y: [0.3, 3] };

const EPS = 1e-7;

export class OrbifoldModel {
  constructor() {
    this.values = { name: '' };            // shared with the engine as wg.guiParams
    this.params = new ParamStore(this.values);
    this._listeners = {};
    this.tokens = [];
    this.text = '';
    this.bad = false;
    this.error = '';
    this.geo = null;
    this.params.onChange(() => this._rebuildGeometry({ quick: true }));
  }

  on(ev, cb) { (this._listeners[ev] ||= []).push(cb); }
  emit(ev, data) { (this._listeners[ev] || []).forEach(cb => cb(data)); }

  // ── public API ─────────────────────────────────────────────────────────
  getSignature() { return this.text; }
  canonical() { return Sig.stringify(Sig.canonical(this.tokens)); }
  price() { return Sig.price(this.tokens); }
  curvature() { return Sig.curvatureOf(this.tokens); }
  isBad() { return this.bad; }
  group() { return this.wg ? this.wg.FD : this._eucFD; }
  topology() { return Sig.topology(this.tokens); }

  setSignature(str, opts = {}) {
    const toks = Sig.parse(str);
    if (!toks) { this.error = 'Use o, x, *, and the digits 2–9.'; this.emit('change', { kind: 'error' }); return false; }
    this.tokens = toks;
    this.text = Sig.stringify(toks);
    this.bad = Sig.isBad(toks);
    this.error = '';
    this.motif = opts.motif || null;      // user-placed motif; null = automatic
    if (opts.params) Object.assign(this.values, opts.params);
    if (this.bad) { this.emit('change', { kind: 'signature', bad: true }); return true; }
    try {
      this._buildGroup();
      this._rebuildGeometry({ quick: false });
    } catch (e) {
      console.error(e);
      this.error = 'This signature is too much for the engine.';
      this.bad = true;
    }
    this.emit('change', { kind: 'signature' });
    return true;
  }

  // set several params at once and rebuild once
  setParams(map, opts = {}) {
    let any = false;
    for (const [k, v] of Object.entries(map)) any = this.params.set(k, v, { silent: true }) || any;
    if (any) this._rebuildGeometry({ quick: !!opts.quick });
    return any;
  }

  // move the motif (m in Motif.js form); it is folded back into the domain
  setMotif(m, { silent = false } = {}) {
    if (!this.geo || this.bad) return null;
    const s = settle(this.geo, m);
    if (!s) return null;
    this.motif = s.m;
    this.geo.comma = s.m;
    if (!silent) this.emit('change', { kind: 'motif' });
    return s;
  }
  resetMotif() { this.motif = null; if (this.geo) { this.geo.comma = withDefaultFrame(this.geo, placeComma(this.geo)); this.emit('change', { kind: 'motif' }); } }

  // full re-detection of cone/corner points (after a drag ends)
  refresh() { if (!this.bad && this.geo) { this._rebuildGeometry({ quick: false }); this.emit('change', { kind: 'refresh' }); } }

  // ── group construction ─────────────────────────────────────────────────
  _buildGroup() {
    this.params.reset();
    this.wg = null; this._eucFD = null; this._eucName = null;
    const curv = this.curvature();
    this.mode = curv < 0 ? 'hyp' : curv === 0 ? 'euc' : 'sph';
    if (this.tokens.length === 0) { this.mode = 'sph'; this._trivial = true; return; }
    this._trivial = false;

    if (this.mode === 'euc') {
      this._eucName = euclideanName(this.tokens);
      const names = [];
      if (EUC_RATIO.includes(this._eucName)) names.push('lattice_b');
      if (this._eucName === '2222') names.push('lattice_b', 'lattice_c');
      if (this._eucName === 'O') names.push('lattice_x', 'lattice_y');
      for (const n of names) {
        this.params.define(n, LATTICE_RANGES[n]);
        if (typeof this.values[n] !== 'number') this.values[n] = LATTICE_DEFAULTS[n];
      }
      return;
    }

    const wg = new WallPaperGroup_General({ symmetryUI: { init() {}, setShift() {}, render() { return []; }, getUniforms: u => u, handleEvent() {} } });
    wg.guiParams = this.values;
    this.values.name = this.text;
    wg.paramGui = makeHeadlessFolder(this.params);
    wg.paramGuiFolder = null;
    const log = console.log; console.log = () => {};        // rebuildGui() logs on every call
    let ok;
    try { ok = wg.updateTheGroup(); } finally { console.log = log; }
    if (!ok) throw new Error(wg.errorLog || 'engine refused the signature');
    this.wg = wg;
  }

  _eucGroup() {
    const b = EUC_BUILDERS[this._eucName];
    if (!b) throw new Error('no Euclidean builder for ' + this._eucName);
    return b(this.values);
  }

  // ── derived geometry ───────────────────────────────────────────────────
  _rebuildGeometry({ quick }) {
    if (this.bad) return;
    const prev = this.geo;
    let geo;
    if (this._trivial) geo = { mode: 'sph', faces: [], inner: [], points: [] };
    else if (this.mode === 'hyp') geo = this._hypGeometry();
    else if (this.mode === 'euc') geo = this._eucGeometry();
    else geo = this._sphGeometry();

    geo.reduce = makeReducer(geo);
    if (quick && prev && prev.points && prev.mode === geo.mode && prev.faces.length === geo.faces.length) {
      const verts = fdVertices(geo);
      geo.points = prev.points.map(pt => {
        let pos = null;
        if (pt.word) pos = fixedPointOfWord(geo, pt.word, pt.pos);
        else if (pt.vertex) { const v = verts.find(v => v.walls.join() === pt.vertex.join()); pos = v ? v.p : null; }
        return pos ? { ...pt, pos } : pt;
      });
    } else {
      geo.points = findSpecialPoints(geo);
    }
    this._assignTokens(geo);
    geo.comma = null;
    if (this.motif && this.motif.c.length === (geo.mode === 'sph' ? 3 : 2)) {
      const s = settle(geo, this.motif);
      if (s) { geo.comma = s.m; this.motif = s.m; }
    }
    if (!geo.comma) { this.motif = null; geo.comma = withDefaultFrame(geo, placeComma(geo)); }
    geo.handles = this.mode === 'euc' ? this._latticeHandles(geo) : [];
    geo.version = (prev?.version || 0) + 1;
    this.geo = geo;
    if (quick) this.emit('change', { kind: 'params' });
  }

  _hypGeometry() {
    const wg = this.wg;
    wg.updateTheGroupGeometry();
    const FD = wg.FD, verts = wg.assembledFD[0][0];
    const faces = FD.s.map((face, i) => {
      const label = face[0].label || ['edge', 0];
      const a = verts[i], b = verts[(i + 1) % verts.length];
      return {
        wall: wallFromSplane(face[0]),
        bounds: face.slice(1).map(wallFromSplane),
        tr: FD.t[i].map(wallFromSplane),
        parity: FD.t[i].length % 2,
        label,
        ends: [[a.re, a.im], [b.re, b.im]],
        params: paramsForLabel(label, wg),
      };
    });
    // pairs from labels
    const pairIdx = {};
    let nextPair = 0;
    faces.forEach(f => {
      const [key, idx] = f.label;
      if (['mirror', 'mirrorRedundant', 'cornerPair'].includes(key)) f.kind = 'mirror';
      else if (key === 'conePair' || key === 'fold') f.kind = 'fold';
      else if (key === 'cap') f.kind = 'glideself';
      else {
        const id = key + ':' + idx;
        const twin = faces.filter(g => g.label[0] === key && g.label[1] === idx).length;
        f.kind = twin >= 2 ? (f.parity ? 'glide' : 'pair') : 'fold';
        if (twin >= 2) { if (!(id in pairIdx)) pairIdx[id] = nextPair++; f.pair = pairIdx[id]; }
      }
    });
    const inner = (FD.i || []).map(e => {
      const sp = e[0], label = sp.label || ['cut', 0];
      const x = wg.assembledFD[1].find(z => z[1] === label) || null;
      const A = x ? [x[0][0].re, x[0][0].im] : null, B = x ? [x[0][1].re, x[0][1].im] : null;
      return { wall: wallFromSplane(sp), A, B, label, params: paramsForLabel(label, wg) };
    });
    // interior cuts list order matches assembledFD[1]
    wg.assembledFD[1].forEach((x, k) => { if (inner[k]) { inner[k].A = [x[0][0].re, x[0][0].im]; inner[k].B = [x[0][1].re, x[0][1].im]; } });
    colorFaces(faces);
    return { mode: 'hyp', faces, inner };
  }

  _eucGeometry() {
    const g = this._eucGroup();
    this._eucFD = g;
    const faces = g.s.map((s, i) => ({
      wall: wallFromSplane(s), bounds: [], tr: g.t[i].map(wallFromSplane),
      parity: g.t[i].length % 2, label: ['edge', i], params: [],
    }));
    const verts = polygonVertices2(faces);
    faces.forEach((f, i) => { f.ends = segmentEnds(verts.filter(v => v.walls.includes(i)).map(v => v.p), f.wall); });
    classifyFacesByImage(faces, '2d');
    colorFaces(faces);
    return { mode: 'euc', faces, inner: [], verts };
  }

  _sphGeometry() {
    const wg = this.wg;
    wg.updateTheGroupGeometry();
    const FD = wg.FD;
    const faces = FD.s.map((face, i) => ({
      wall: wallFromSplane3(face[0]), bounds: [], tr: FD.t[i].map(wallFromSplane3),
      parity: FD.t[i].length % 2, label: ['edge', i], params: [],
    }));
    classifyFacesByImage(faces, '3d');
    colorFaces(faces);
    return { mode: 'sph', faces, inner: [] };
  }

  _latticeHandles(geo) {
    const n = this._eucName, v = this.values, hs = [];
    if (n === 'O') {
      hs.push({ id: 'lattice_xy', pos: [v.lattice_x, v.lattice_y], from: [0, 0], label: 'lattice vector' });
      hs.push({ id: 'fixed_a', pos: [1, 0], from: [0, 0], fixed: true });
      return hs;
    }
    if (EUC_RATIO.includes(n) || n === '2222') {
      const vs = (geo.verts || []).map(x => x.p);
      if (vs.length) {
        // the highest vertex (rightmost; leftmost for 2222, whose right edge carries the offset handle)
        const sx = n === '2222' ? -1 : 1;
        const top = vs.reduce((a, b) => (b[1] > a[1] + 1e-9 || (Math.abs(b[1] - a[1]) < 1e-9 && sx * b[0] > sx * a[0])) ? b : a);
        hs.push({ id: 'lattice_b', pos: top, label: 'lattice shape' });
      }
    }
    if (n === '2222') hs.push({ id: 'lattice_c', pos: [1, v.lattice_c], label: 'gyration offset' });
    return hs;
  }

  // drag a lattice handle to world position p (Euclidean only)
  dragHandle(h, p, start) {
    const v = this.values;
    if (h.id === 'lattice_xy') return this.setParams({ lattice_x: p[0], lattice_y: Math.max(p[1], 0.3) }, { quick: true });
    if (h.id === 'lattice_b') {
      const y0 = start.pos[1];
      if (Math.abs(y0) < 1e-6) return false;
      return this.setParams({ lattice_b: start.value * (p[1] / y0) }, { quick: true });
    }
    if (h.id === 'lattice_c') {
      const lim = v.lattice_b / 2;
      return this.setParams({ lattice_c: Math.max(-lim, Math.min(lim, p[1])) }, { quick: true });
    }
    return false;
  }

  // ── which signature character each feature came from ───────────────────
  _assignTokens(geo) {
    const T = this.tokens;
    const idxOf = kind => T.map((t, i) => (t.kind === kind ? i : -1)).filter(i => i >= 0);
    const stars = idxOf('*'), handles = idxOf('o'), caps = idxOf('x');
    const cones = idxOf('cone'), corners = idxOf('corner');
    const cones2 = cones.filter(i => T[i].n === 2);

    for (const f of geo.faces) {
      let tk = [];
      if (geo.mode === 'hyp') {
        const [key, idx] = f.label;
        if (key === 'handle') tk = handles[idx - 1] !== undefined ? [handles[idx - 1]] : [];
        else if (key === 'cap') tk = caps[idx - 1] !== undefined ? [caps[idx - 1]] : [];
        else if (key === 'band') tk = stars[idx] !== undefined ? [stars[idx]] : [];
        else if (['mirror', 'mirrorRedundant', 'cornerPair'].includes(key)) tk = [...stars];
        else if (key === 'fold') tk = [...stars, ...(cones2.length ? [cones2[cones2.length - 1]] : [])];
        else if (key === 'conePair') tk = cones2.slice(2 * idx - 2, 2 * idx);
      } else {
        if (f.kind === 'mirror') tk = [...stars];
        else if (f.kind === 'glide' || f.kind === 'glideself') tk = caps.length ? [...caps] : [];
        else if (f.kind === 'pair' && !f.rotation) tk = handles.length ? [...handles] : [...caps];
      }
      f.tokens = tk;
    }
    for (const e of geo.inner) e.tokens = [];
    for (const p of geo.points) {
      const pool = p.kind === 'cone' ? cones : corners;
      p.tokens = pool.filter(i => T[i].n === p.n);
      if (p.kind === 'corner') p.tokens.push(...stars.slice(0, stars.length === 1 ? 1 : 0));
    }
  }

  // features (faces, inner edges, points) that came from token i
  featuresOfToken(i) {
    const g = this.geo;
    if (!g) return { faces: [], inner: [], points: [] };
    const tk = this.tokens[i];
    const pick = arr => arr.map((x, k) => (x.tokens || []).includes(i) ? k : -1).filter(k => k >= 0);
    let points = pick(g.points);
    if (tk && tk.kind === '*') points = g.points.map((p, k) => (p.kind === 'corner' ? k : -1)).filter(k => k >= 0);
    return { faces: pick(g.faces), inner: [], points };
  }
}

// ── helpers ──────────────────────────────────────────────────────────────

// Name of a Euclidean signature in the engine's iGroup_* vocabulary. (The
// engine's nonNegHashOrbifold names 2*22 as "*NN", so this is done here.)
function euclideanName(toks) {
  const desc = a => a.sort((x, y) => y - x).join('');
  const o = toks.filter(t => t.kind === 'o').length, x = toks.filter(t => t.kind === 'x').length;
  const s = toks.filter(t => t.kind === '*').length;
  const cones = desc(toks.filter(t => t.kind === 'cone').map(t => t.n));
  const corners = desc(toks.filter(t => t.kind === 'corner').map(t => t.n));
  if (o) return 'O';
  if (x === 2) return 'XX';
  if (x === 1 && s) return 'X*';
  if (x === 1) return '22X';
  if (s === 2) return '**';
  return cones + (s ? '*' + corners : '');
}

function paramsForLabel(label, wg) {
  const [key, idx] = label;
  const out = [];
  if (!wg.parCounts || !(wg.parCounts[key] >= idx) || idx < 1) return out;
  if (lengthKeys.includes(key)) out.push(`${key}_${idx}_l`);
  if (twistKeys.includes(key)) out.push(`${key}_${idx}_t`);
  return out;
}

function colorFaces(faces) {
  for (const f of faces) {
    f.color = f.kind === 'mirror' ? MIRROR_COLOR
      : f.pair !== undefined ? PAIR_COLORS[f.pair % PAIR_COLORS.length]
        : f.kind === 'glideself' ? '#8c2f8c' : '#3d3c36';
  }
}

// vertices of a 2D polygon bounded by line walls: pairwise intersections inside all walls
function polygonVertices2(faces) {
  const out = [];
  for (let i = 0; i < faces.length; i++) for (let j = i + 1; j < faces.length; j++) {
    const a = faces[i].wall, b = faces[j].wall;
    if (a.type !== PLANE || b.type !== PLANE) continue;
    const det = a.n[0] * b.n[1] - a.n[1] * b.n[0];
    if (Math.abs(det) < 1e-12) continue;
    const p = [(a.d * b.n[1] - b.d * a.n[1]) / det, (a.n[0] * b.d - b.n[0] * a.d) / det];
    if (faces.every(f => dist2(f.wall, p) <= 1e-9)) {
      const ex = out.find(v => Math.hypot(v.p[0] - p[0], v.p[1] - p[1]) < 1e-9);
      if (ex) { for (const w of [i, j]) if (!ex.walls.includes(w)) ex.walls.push(w); }
      else out.push({ p, walls: [i, j] });
    }
  }
  return out;
}

function segmentEnds(pts, wall) {
  if (pts.length < 2) return pts.length ? [pts[0], pts[0]] : null;
  if (wall.type !== PLANE) return [pts[0], pts[1]];
  const t = [-wall.n[1], wall.n[0]];
  const proj = p => p[0] * t[0] + p[1] * t[1];
  const s = [...pts].sort((a, b) => proj(a) - proj(b));
  return [s[0], s[s.length - 1]];
}

// For groups without engine labels: decide what each face's transform does
// to its wall (mirror, fold, pair with another wall, glide).
function classifyFacesByImage(faces, dim) {
  let nextPair = 0;
  const pairOf = new Map();
  faces.forEach((f, i) => {
    let img = -1;
    if (dim === '2d') {
      const w = f.wall, pts = [];
      const base = [w.n[0] * w.d, w.n[1] * w.d], t = [-w.n[1], w.n[0]];
      for (const s of [-0.7, 0.1, 0.9]) pts.push([base[0] + s * t[0], base[1] + s * t[1]]);
      const ims = pts.map(p => apply2(f.tr, p).p);
      img = faces.findIndex(g => ims.every(q => Math.abs(dist2(g.wall, q)) < 1e-7));
      f.rotation = !f.parity && isRotation2(f.tr);
    } else {
      let n = f.wall;
      for (const r of f.tr) n = reflect3(r, n);
      img = faces.findIndex(g => Math.abs(Math.abs(dot3(g.wall, n)) - 1) < 1e-7);
      f.rotation = !f.parity;
    }
    if (img === i) f.kind = f.parity ? (f.tr.length === 1 ? 'mirror' : 'glideself') : 'fold';
    else if (img >= 0) {
      f.kind = f.parity ? 'glide' : 'pair';
      const key = [i, img].sort().join(':');
      if (!pairOf.has(key)) pairOf.set(key, nextPair++);
      f.pair = pairOf.get(key);
    } else f.kind = f.parity ? 'glide' : 'pair';
  });
}

function isRotation2(tr) {
  const M = toMobius(tr);
  if (M.anti) return false;
  const [a, b, c, d] = M.m;
  if (C.abs(c) < 1e-12) { const r = C.div(a, d); return Math.abs(r[0] - 1) > 1e-9 || Math.abs(r[1]) > 1e-9; }
  return true;
}

// ── reduction to the fundamental domain (same rule as the shader) ─────────

export function makeReducer(geo) {
  const faces = geo.faces;
  if (geo.mode === 'sph') {
    return (p, maxIter = 120) => {
      let q = p, parity = 0; const word = [];
      for (let k = 0; k < maxIter; k++) {
        let moved = false;
        for (let i = 0; i < faces.length; i++) {
          if (dot3(faces[i].wall, q) > 1e-12) {
            q = apply3(faces[i].tr, q).p; parity ^= faces[i].parity; word.push(i); moved = true; break;
          }
        }
        if (!moved) return { p: q, k: 1, parity, word, ok: true };
      }
      return { p: q, k: 1, parity, word, ok: false };
    };
  }
  return (p, maxIter = 200) => {
    let q = [p[0], p[1]], kk = 1, parity = 0; const word = [];
    if (geo.mode === 'hyp' && q[0] * q[0] + q[1] * q[1] >= 1) return { p: q, k: 1, parity, word, ok: false };
    for (let it = 0; it < maxIter; it++) {
      let moved = false;
      for (let i = 0; i < faces.length; i++) {
        const f = faces[i];
        if (dist2(f.wall, q) > 0 && f.bounds.every(b => dist2(b, q) > 0)) {
          const r = apply2(f.tr, q); q = r.p; kk *= r.k; parity ^= f.parity; word.push(i); moved = true; break;
        }
      }
      if (!moved) return { p: q, k: kk, parity, word, ok: true };
    }
    return { p: q, k: kk, parity, word, ok: false };
  };
}

// inverse of a reduction word: world point of the copy whose FD point is p
export function unreduce(geo, word, p) {
  let q = p;
  const inv = geo.mode === 'sph' ? applyInv3 : applyInv2;
  for (let i = word.length - 1; i >= 0; i--) q = inv(geo.faces[word[i]].tr, q);
  return q;
}

function insideFD(geo, p, tol = 1e-7) {
  if (geo.mode === 'sph') return geo.faces.every(f => dot3(f.wall, p) <= tol);
  if (geo.mode === 'hyp' && p[0] * p[0] + p[1] * p[1] >= 1 - 1e-9) return false;
  return geo.faces.every(f => !(dist2(f.wall, p) > tol && f.bounds.every(b => dist2(b, p) > tol)));
}

// ── (anti-)Möbius form of a reflection list, fixed points ────────────────

function reflMobius(w) {
  if (w.type === SPHERE) {
    const c = w.c, r2 = w.r * w.r;
    return { m: [c, [r2 - (c[0] * c[0] + c[1] * c[1]), 0], [1, 0], C.conj(C.scale(c, 1)).map(x => -x)], anti: true };
  }
  const nu = w.n;
  return { m: [C.scale(C.mul(nu, nu), -1), C.scale(nu, 2 * w.d), [0, 0], [1, 0]], anti: true };
}
const conjM = m => m.map(C.conj);
const mulM = (A, B) => [
  C.add(C.mul(A[0], B[0]), C.mul(A[1], B[2])), C.add(C.mul(A[0], B[1]), C.mul(A[1], B[3])),
  C.add(C.mul(A[2], B[0]), C.mul(A[3], B[2])), C.add(C.mul(A[2], B[1]), C.mul(A[3], B[3])),
];
// g = tr[last] ∘ … ∘ tr[0]
function toMobius(tr) {
  let g = { m: [[1, 0], [0, 0], [0, 0], [1, 0]], anti: false };
  for (const w of tr) {
    const r = reflMobius(w);
    g = { m: mulM(r.m, r.anti ? conjM(g.m) : g.m), anti: r.anti !== g.anti };
  }
  return g;
}

function fixedPoints2(tr) {
  const g = toMobius(tr);
  if (g.anti) return [];
  let [a, b, c, d] = g.m;
  if (C.abs(c) < 1e-12) {
    const den = C.sub(d, a);
    if (C.abs(den) < 1e-12) return [];
    return [C.div(b, den)];
  }
  // c z^2 + (d - a) z - b = 0
  const B = C.sub(d, a), disc = C.add(C.mul(B, B), C.scale(C.mul(c, b), 4));
  const r = Math.sqrt(C.abs(disc)), th = Math.atan2(disc[1], disc[0]) / 2;
  const sq = [r * Math.cos(th), r * Math.sin(th)];
  const two_c = C.scale(c, 2);
  return [C.div(C.add(C.scale(B, -1), sq), two_c), C.div(C.sub(C.scale(B, -1), sq), two_c)];
}

function fixedPoints3(tr) {
  if (tr.length % 2) return [];
  // build the rotation matrix by applying to basis vectors
  const cols = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(e => apply3(tr, e).p);
  const R = [[cols[0][0], cols[1][0], cols[2][0]], [cols[0][1], cols[1][1], cols[2][1]], [cols[0][2], cols[1][2], cols[2][2]]];
  let ax = [R[2][1] - R[1][2], R[0][2] - R[2][0], R[1][0] - R[0][1]];
  if (Math.hypot(...ax) < 1e-9) {
    const tr3 = R[0][0] + R[1][1] + R[2][2];
    if (tr3 > 2.999) return [];
    // rotation by pi: axis is a column of R + I
    const M = [[R[0][0] + 1, R[0][1], R[0][2]], [R[1][0], R[1][1] + 1, R[1][2]], [R[2][0], R[2][1], R[2][2] + 1]];
    const colsI = [0, 1, 2].map(j => [M[0][j], M[1][j], M[2][j]]);
    ax = colsI.reduce((a, b) => (Math.hypot(...b) > Math.hypot(...a) ? b : a));
  }
  const u = norm3(ax);
  return [u, u.map(x => -x)];
}

// vertices of the fundamental domain: [{p, walls:[i,j]}]
function fdVertices(geo) {
  if (geo.mode === 'hyp') return geo.faces.map((f, i) => ({ p: f.ends[0], walls: [(i + geo.faces.length - 1) % geo.faces.length, i] }));
  if (geo.mode === 'euc') return geo.verts || [];
  const out = [], F = geo.faces;
  for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) {
    const c = cross3(F[i].wall, F[j].wall);
    if (Math.hypot(...c) < 1e-9) continue;
    for (const p of [norm3(c), norm3(c).map(x => -x)])
      if (F.every(f => dot3(f.wall, p) <= 1e-9) && !out.some(v => Math.hypot(...v.p.map((x, k) => x - p[k])) < 1e-9)) out.push({ p, walls: [i, j] });
  }
  return out;
}

function wordTransform(geo, word) { return word.flatMap(i => geo.faces[i].tr); }

function fixedPointOfWord(geo, word, near) {
  const fps = geo.mode === 'sph' ? fixedPoints3(wordTransform(geo, word)) : fixedPoints2(wordTransform(geo, word));
  if (!fps.length) return null;
  const d = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
  return fps.reduce((a, b) => (d(b, near) < d(a, near) ? b : a));
}

// Cone and corner points: fixed points of short words in the generators that
// lie in the fundamental domain, classified by how a small circle round them folds up.
function findSpecialPoints(geo) {
  const F = geo.faces.length;
  if (!F) return [];
  const words = [];
  for (let i = 0; i < F; i++) words.push([i]);
  for (let i = 0; i < F; i++) for (let j = 0; j < F; j++) words.push([i, j]);
  if (F <= 10) for (let i = 0; i < F; i++) for (let j = 0; j < F; j++) for (let k = 0; k < F; k++) words.push([i, j, k]);

  const cands = [];
  const close = (a, b) => Math.hypot(...a.map((x, i) => x - b[i])) < 1e-6;
  for (const v of fdVertices(geo)) if (!cands.some(c => close(c.pos, v.p))) cands.push({ pos: v.p, vertex: v.walls });
  for (const w of words) {
    const tr = wordTransform(geo, w);
    if (tr.length % 2) continue;
    const fps = geo.mode === 'sph' ? fixedPoints3(tr) : fixedPoints2(tr);
    for (const p of fps) {
      if (!p.every(Number.isFinite)) continue;
      if (geo.mode !== 'sph' && Math.hypot(p[0], p[1]) > 1e6) continue;
      if (!insideFD(geo, p, 1e-6)) continue;
      if (cands.some(c => close(c.pos, p))) continue;
      cands.push({ pos: p, word: w });
    }
  }
  const out = [];
  for (const c of cands) {
    const cls = classifyPoint(geo, c.pos);
    if (cls && cls.n >= 2) out.push({ pos: c.pos, word: c.word, vertex: c.vertex, kind: cls.kind, n: cls.n });
  }
  return out;
}

function classifyPoint(geo, x, K = 840) {
  const red = geo.reduce;
  let samples;
  if (geo.mode === 'sph') {
    const a = Math.abs(x[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const e1 = norm3(cross3(x, a)), e2 = cross3(x, e1), eps = 1e-4;
    samples = k => { const t = 0.123 + 2 * Math.PI * k / K; return norm3([x[0] + eps * (Math.cos(t) * e1[0] + Math.sin(t) * e2[0]), x[1] + eps * (Math.cos(t) * e1[1] + Math.sin(t) * e2[1]), x[2] + eps * (Math.cos(t) * e1[2] + Math.sin(t) * e2[2])]); };
    var step = 2 * Math.PI * 1e-4 / K;
  } else {
    const eps = 1e-4 * (geo.mode === 'hyp' ? Math.max(1 - (x[0] * x[0] + x[1] * x[1]), 1e-3) : 1);
    samples = k => { const t = 0.123 + 2 * Math.PI * k / K; return [x[0] + eps * Math.cos(t), x[1] + eps * Math.sin(t)]; };
    var step = 2 * Math.PI * eps / K;
  }
  const r0 = red(samples(0));
  if (!r0.ok) return null;
  const tol = 0.75 * step * r0.k;
  // count runs of consecutive hits (one run per orbit point on the circle)
  let even = 0, odd = 0, prev = null;
  const hits = [];
  for (let k = 0; k < K; k++) {
    const r = red(samples(k));
    const d = r.ok ? Math.hypot(...r.p.map((v, i) => v - r0.p[i])) : Infinity;
    hits.push(d < tol * Math.max(1, r.k / r0.k) ? (r.parity === r0.parity ? 'e' : 'o') : null);
  }
  for (let k = 0; k < K; k++) {
    const h = hits[k], before = hits[(k + K - 1) % K];
    if (h && h !== before) { if (h === 'e') even++; else odd++; }
  }
  if (even === 0 && odd === 0) return null;
  if (odd > 0) return { kind: 'corner', n: Math.round((even + odd) / 2) };
  return { kind: 'cone', n: even };
}

// Where the comma motif sits: a smooth "deep point" of the fundamental domain.
function placeComma(geo) {
  if (geo.mode === 'sph') {
    const pts = [];
    const N = 1500;
    for (let i = 0; i < N; i++) {
      const z = 1 - 2 * (i + 0.5) / N, r = Math.sqrt(1 - z * z), t = i * 2.399963229728653;
      const p = [r * Math.cos(t), r * Math.sin(t), z];
      if (!insideFD(geo, p, 0)) continue;
      const m = geo.faces.length ? Math.min(...geo.faces.map(f => -dot3(f.wall, p))) : 1;
      pts.push([p, m]);
    }
    if (!pts.length) return { c: [0, 0, -1], size: 0.2 };
    let acc = [0, 0, 0], wsum = 0, best = 0;
    for (const [p, m] of pts) { const w = m ** 6; acc = acc.map((v, i) => v + w * p[i]); wsum += w; best = Math.max(best, m); }
    const c = norm3(acc);
    const m = geo.faces.length ? Math.min(...geo.faces.map(f => -dot3(f.wall, c))) : 1;
    return { c, size: Math.max(0.02, Math.min(0.6 * Math.asin(Math.min(1, m)), 0.45)) };
  }
  let lo = [-1, -1], hi = [1, 1];
  if (geo.mode === 'euc') {
    const vs = (geo.verts || []).map(v => v.p);
    if (vs.length) {
      lo = [Math.min(...vs.map(v => v[0])), Math.min(...vs.map(v => v[1]))];
      hi = [Math.max(...vs.map(v => v[0])), Math.max(...vs.map(v => v[1]))];
    }
  }
  const N = 48, pts = [];
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const p = [lo[0] + (hi[0] - lo[0]) * i / N, lo[1] + (hi[1] - lo[1]) * j / N];
    if (!insideFD(geo, p, 0)) continue;
    let m = Math.min(...geo.faces.map(f => -dist2(f.wall, p)));
    if (geo.mode === 'hyp') m = Math.min(m, 1 - Math.hypot(p[0], p[1]));
    for (const pt of geo.points || []) m = Math.min(m, 1.4 * Math.hypot(...pt.pos.map((v, k) => v - p[k])));
    if (m > 0) pts.push([p, m]);
  }
  if (!pts.length) return { c: [0, 0], size: 0.05 };
  let acc = [0, 0], wsum = 0;
  for (const [p, m] of pts) { const w = m ** 6; acc[0] += w * p[0]; acc[1] += w * p[1]; wsum += w; }
  const c = [acc[0] / wsum, acc[1] / wsum];
  let m = Math.min(...geo.faces.map(f => -dist2(f.wall, c)));
  if (geo.mode === 'hyp') m = Math.min(m, 1 - Math.hypot(c[0], c[1]));
  if (!(m > 0)) { const best = pts.reduce((a, b) => (b[1] > a[1] ? b : a)); return { c: best[0], size: best[1] * 0.85 }; }
  return { c, size: m * 0.85 };
}
