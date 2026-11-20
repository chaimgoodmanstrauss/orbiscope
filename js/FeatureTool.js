// FeatureTool.js — all pointer input on the pattern canvas.
//
// Adapted from SymmHub's OrbifoldUITool (lib/orbilib/OrbifoldUITool.js):
// hovering an edge with a length parameter highlights it, dragging changes the
// length (shift: the twist), the wheel nudges it, and while the parameter
// changes the view is corrected so the grabbed point of the edge stays under
// the pointer (OrbifoldUITool.setShift). Unlike the original, any copy of the
// fundamental domain can be grabbed (the reduction word carries the grab back
// to the domain), cone and corner points take clicks, Euclidean lattices have
// handles, and the empty pattern pans and zooms.

import { dist2, dot3, hypLerp, hypDist, Mob, C } from './geom.js';
import { unreduce } from './OrbifoldModel.js';
import { motifHit, applyWord, carry } from './Motif.js';
import { M3 } from './geom.js';

const HIT_EDGE = 7, HIT_POINT = 10, HIT_HANDLE = 12;
const LENGTH_DRAG_SPEED = 0.005, TWIST_DRAG_SPEED = 0.002;
const LENGTH_WHEEL_STEP = 0.03, TWIST_WHEEL_STEP = 0.01;

export class FeatureTool {
  /**
   * opts: view (PatternView), model, highlight, tip (DOM element),
   *       onOrder(tokenIndex, delta), onCommit(), canvas (event target)
   */
  constructor(opts) {
    Object.assign(this, opts);
    this.drag = null;
    this.pointers = new Map();
    const el = this.canvas;
    el.addEventListener('pointerdown', e => this._down(e));
    el.addEventListener('pointermove', e => this._move(e));
    el.addEventListener('pointerup', e => this._up(e));
    el.addEventListener('pointercancel', e => this._up(e));
    el.addEventListener('pointerleave', e => { if (!this.drag && e.pointerType === 'mouse') this._setHover(null); });
    el.addEventListener('wheel', e => this._wheel(e), { passive: false });
    el.addEventListener('contextmenu', e => e.preventDefault());
  }

  _xy(e) { const r = this.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

  // ── hit testing ────────────────────────────────────────────────────────
  hitTest(x, y) {
    const g = this.model.geo;
    if (!g || this.model.isBad()) return null;
    // lattice handles (home copy only)
    for (const h of g.handles || []) {
      if (h.fixed) continue;
      const s = this.view.worldToScreen(h.pos); if (!s) continue;
      const c = this.view.screenToCss(s);
      if (Math.hypot(c[0] - x, c[1] - y) < HIT_HANDLE) return { type: 'handle', handle: h, tokens: [] };
    }
    const pr = this.view.probe(x, y);
    if (!pr || !pr.ok) return null;
    const sph = g.mode === 'sph';
    let best = null;
    g.points.forEach((pt, i) => {
      const d = (sph ? Math.hypot(...pt.pos.map((v, k) => v - pr.p[k])) : Math.hypot(pt.pos[0] - pr.p[0], pt.pos[1] - pr.p[1])) * pr.scale;
      if (d < HIT_POINT && (!best || d < best.d)) best = { type: 'point', index: i, d, probe: pr, tokens: pt.tokens };
    });
    if (best) return best;
    const mw = motifHit(g, g.comma, pr.p);
    if (mw) return { type: 'motif', word: [...pr.word, ...mw], probe: pr, tokens: [] };
    g.faces.forEach((f, i) => {
      const d = Math.abs(sph ? dot3(f.wall, pr.p) : dist2(f.wall, pr.p)) * pr.scale;
      if (d >= HIT_EDGE) return;
      if (!sph && !f.bounds.every(b => dist2(b, pr.p) > -1e-7)) return;
      if (!best || d < best.d) best = { type: 'face', index: i, d, probe: pr, tokens: f.tokens, params: f.params };
    });
    (g.inner || []).forEach((e, i) => {
      const d = Math.abs(dist2(e.wall, pr.p)) * pr.scale;
      if (d >= HIT_EDGE || !onSegment(e, pr.p)) return;
      if (!best || d < best.d - 1) best = { type: 'inner', index: i, d, probe: pr, tokens: [], params: e.params };
    });
    return best;
  }

  _highlightFor(hit) {
    if (!hit) return null;
    const g = this.model.geo;
    const h = { source: 'pattern', tokens: hit.tokens || [], faces: [], inner: [], points: [] };
    if (hit.type === 'face') {
      const f = g.faces[hit.index];
      h.faces = g.faces.map((x, i) => (i === hit.index || (f.pair !== undefined && x.pair === f.pair)) ? i : -1).filter(i => i >= 0);
    } else if (hit.type === 'inner') h.inner = [hit.index];
    else if (hit.type === 'point') {
      const p = g.points[hit.index];
      h.points = g.points.map((q, i) => (q.kind === p.kind && q.n === p.n) ? i : -1).filter(i => i >= 0);
    } else if (hit.type === 'handle') h.handle = hit.handle.id;
    return h;
  }

  _setHover(hit, x, y) {
    this.hoverHit = hit;
    this.view.hover = hit;
    this.highlight.set(this._highlightFor(hit));
    this._motifState(hit && hit.type === 'motif');
    this._cursor(hit);
    this._tip(hit, x, y);
    this.view.drawOverlay();
  }

  _motifState(hover) {
    const v = this.selected ? 2 : hover || (this.drag && this.drag.kind === 'motif') ? 1 : 0;
    if (v !== this.view.motifState) { this.view.motifState = v; this.view.requestRender(); }
  }
  select(on) { this.selected = !!on; this._motifState(this.hoverHit && this.hoverHit.type === 'motif'); }

  _cursor(hit) {
    const c = this.canvas;
    if (this.drag && this.drag.kind !== 'pan') { c.style.cursor = 'grabbing'; return; }
    if (!hit) { c.style.cursor = this.drag ? 'grabbing' : 'grab'; return; }
    if (hit.type === 'motif') { c.style.cursor = this.drag ? 'grabbing' : 'grab'; return; }
    if (hit.type === 'handle' || ((hit.type === 'face' || hit.type === 'inner') && hit.params?.length)) c.style.cursor = 'move';
    else if (hit.type === 'point') c.style.cursor = 'pointer';
    else c.style.cursor = 'help';
  }

  _describe(hit) {
    const g = this.model.geo, v = this.model.values;
    const num = n => (Math.round(v[n] * 100) / 100).toFixed(2);
    const lt = params => {
      const L = params.find(n => n.endsWith('_l')), T = params.find(n => n.endsWith('_t'));
      const parts = [];
      if (L) parts.push(`length ${num(L)}`);
      if (T) parts.push(`twist ${num(T)}`);
      return parts.join(' · ');
    };
    if (hit.type === 'handle') return `${hit.handle.label} — drag to reshape`;
    if (hit.type === 'motif') return this.selected ? 'the comma (selected) — drag to move every copy; Esc deselects' : 'the comma — click to select, drag to move every copy';
    if (hit.type === 'point') {
      const p = g.points[hit.index];
      return p.kind === 'cone' ? `gyration point ${p.n} — click +1, alt-click −1` : `corner ${p.n}: ${p.n} mirrors meet — click +1, alt-click −1`;
    }
    if (hit.type === 'inner') return `cut · ${lt(hit.params)} — drag${hit.params.length > 1 ? ', shift-drag twists' : ''}`;
    const f = g.faces[hit.index];
    const what = f.kind === 'mirror' ? 'mirror' : f.kind === 'fold' ? 'edge folded onto itself by a half-turn'
      : f.kind === 'glideself' ? 'crosscap edge: glued to itself by a glide' : f.kind === 'glide' ? 'edge glued by a glide' : 'edge glued to its twin';
    if (f.params && f.params.length) return `${what} · ${lt(f.params)} — drag${f.params.length > 1 ? ', shift-drag twists' : ''}`;
    return what;
  }

  _tip(hit, x, y) {
    const t = this.tip;
    if (!hit || x === undefined) { t.hidden = true; return; }
    t.textContent = this._describe(hit);
    t.hidden = false;
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    const tw = t.offsetWidth, th = t.offsetHeight;
    let tx = x + 16, ty = y + 18;
    if (tx + tw > W - 4) tx = x - tw - 16;
    if (ty + th > H - 4) ty = y - th - 18;
    t.style.transform = `translate(${Math.max(4, tx)}px, ${Math.max(4, ty)}px)`;
  }

  // ── pointer handling ───────────────────────────────────────────────────
  _down(e) {
    try { this.canvas.setPointerCapture(e.pointerId); } catch {}
    const [x, y] = this._xy(e);
    this.pointers.set(e.pointerId, [x, y]);
    if (this.pointers.size === 2) { this._startPinch(); return; }
    if (e.button !== undefined && e.button !== 0) return;
    const hit = this.hitTest(x, y);
    const touch = e.pointerType !== 'mouse';
    if (hit && hit.type === 'motif') {
      const g = this.model.geo;
      this.drag = { kind: 'motif', word: hit.word, qPrev: applyWord(g, hit.word, hit.probe.w), x, y, moved: false };
    } else if (hit && hit.type === 'handle') {
      const h = hit.handle;
      this.drag = { kind: 'handle', handle: h, start: { pos: [...h.pos], value: this.model.values.lattice_b } };
    } else if (hit && (hit.type === 'face' || hit.type === 'inner') && hit.params?.length && this.model.geo.mode === 'hyp') {
      this.drag = this._startParamDrag(hit, x, y, e);
    } else if (hit && hit.type === 'point') {
      this.drag = { kind: 'click', hit, x, y, alt: e.altKey || e.metaKey };
    } else {
      this.drag = { kind: 'pan', last: this.view.cssToScreen(x, y), x, y, moved: false };
      if (touch) {
        clearTimeout(this._lp);
        this._lp = setTimeout(() => { if (this.drag && this.drag.kind === 'pan' && !this.drag.moved) { this.drag = null; this._setHover(this.hitTest(x, y), x, y); } }, 450);
      }
    }
    this._setHover(hit, x, y);
    e.preventDefault();
  }

  _startParamDrag(hit, x, y, e) {
    const g = this.model.geo;
    const seg = hit.type === 'face' ? g.faces[hit.index].ends : [g.inner[hit.index].A, g.inner[hit.index].B];
    const [A, B] = seg;
    const L = hypDist(A, B);
    let t = L > 1e-9 ? hypDist(A, hit.probe.p) / L : 0.5;
    t = Math.min(Math.max(t, 0.02), 0.98);
    const t1 = t < 0.5 ? t + 0.25 : t - 0.25;
    const word = hit.probe.word;
    const Vstash = this.view.view.V.map(z => [...z]);
    const P1 = unreduce(g, word, hypLerp(A, B, t1));
    const P0 = unreduce(g, word, hypLerp(A, B, t));
    const start = {};
    for (const n of hit.params) start[n] = this.model.values[n];
    return {
      kind: 'param', hit, t, t1, word, Vstash, x, y, start,
      target: Mob.apply(Vstash, P0), target1: Mob.apply(Vstash, P1),
    };
  }

  _applyParam(d, values) {
    const { hit } = d;
    this.model.setParams(values, { quick: true });
    // keep the grabbed point where it was on the screen
    const g = this.model.geo;
    const seg = hit.type === 'face' ? g.faces[hit.index].ends : [g.inner[hit.index].A, g.inner[hit.index].B];
    if (!seg || !seg[0]) return;
    const W = unreduce(g, d.word, hypLerp(seg[0], seg[1], d.t));
    const W1 = unreduce(g, d.word, hypLerp(seg[0], seg[1], d.t1));
    this.view.anchor(d.Vstash, W, W1, d.target, d.target1);
    this.view.requestRender();
  }

  _move(e) {
    const [x, y] = this._xy(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, [x, y]);
    if (this.pinch && this.pointers.size === 2) { this._pinchMove(); return; }
    const d = this.drag;
    if (!d) { this._setHover(this.hitTest(x, y), x, y); return; }
    if (d.kind === 'pan') {
      if (Math.hypot(x - d.x, y - d.y) > 3) { d.moved = true; clearTimeout(this._lp); this._tip(null); }
      const u = this.view.cssToScreen(x, y);
      this.view.pan(d.last, u);
      d.last = u;
      this.canvas.style.cursor = 'grabbing';
    } else if (d.kind === 'param') {
      const delta = (x - d.x) - (y - d.y);
      const tn = d.hit.params.find(n => n.endsWith('_t')), ln = d.hit.params.find(n => n.endsWith('_l'));
      const vals = {};
      if (e.shiftKey && tn) vals[tn] = d.start[tn] + delta * TWIST_DRAG_SPEED;
      else if (ln) vals[ln] = d.start[ln] + delta * LENGTH_DRAG_SPEED;
      if (e.shiftKey && tn && ln) vals[ln] = d.start[ln];
      if (!e.shiftKey && tn) vals[tn] = d.start[tn];
      this._applyParam(d, vals);
      this._tip(d.hit, x, y);
    } else if (d.kind === 'motif') {
      if (Math.hypot(x - d.x, y - d.y) > 2) d.moved = true;
      this._moveMotif(d, x, y);
      this._tip(null);
    } else if (d.kind === 'handle') {
      const w = this.view.screenToWorld(this.view.cssToScreen(x, y));
      if (w) this.model.dragHandle(d.handle, w, d.start);
      this.view.hover = { type: 'handle', handle: d.handle };
      this._tip({ type: 'handle', handle: d.handle }, x, y);
    } else if (d.kind === 'click') {
      if (Math.hypot(x - d.x, y - d.y) > 6) { this.drag = { kind: 'pan', last: this.view.cssToScreen(x, y), x, y, moved: true }; }
    }
  }

  _up(e) {
    this.pointers.delete(e.pointerId);
    clearTimeout(this._lp);
    if (this.pinch) { if (this.pointers.size < 2) this.pinch = null; this.drag = null; return; }
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    const [x, y] = this._xy(e);
    if (d.kind === 'motif') {
      this.select(true);
      if (d.moved) this.onCommit();
    } else if (d.kind === 'pan' && !d.moved && e.type === 'pointerup' && this.selected) {
      this.select(false);
    }
    if (d.kind === 'click' && e.type === 'pointerup') {
      const p = this.model.geo.points[d.hit.index];
      const tk = (p.tokens || []).find(i => ['cone', 'corner'].includes(this.model.tokens[i]?.kind));
      if (tk !== undefined) this.onOrder(tk, d.alt ? -1 : 1);
    } else if (d.kind === 'param' || d.kind === 'handle') {
      this.model.refresh();
      this.onCommit();
    }
    if (e.pointerType === 'mouse') this._setHover(this.hitTest(x, y), x, y);
    else this._setHover(null);
  }

  // drag the comma: the pointer, carried into the grabbed copy's frame, moves the
  // motif's centre by the same amount; it is folded back into the domain as it goes.
  _moveMotif(d, x, y) {
    const g = this.model.geo, m = g.comma;
    const w = this.view.screenToWorld(this.view.cssToScreen(x, y));
    if (!w || !m) return;
    if (g.mode === 'hyp' && w[0] * w[0] + w[1] * w[1] > 0.999) return;
    const q = applyWord(g, d.word, w);
    let next;
    if (g.mode === 'sph') {
      const R = M3.fromTo(d.qPrev, q);
      next = { ...m, c: M3.apply(R, m.c), e1: M3.apply(R, m.e1), e2: M3.apply(R, m.e2) };
    } else {
      next = { ...m, c: [m.c[0] + q[0] - d.qPrev[0], m.c[1] + q[1] - d.qPrev[1]] };
    }
    const s = this.model.setMotif(next);
    if (!s) return;
    if (s.word.length) { d.word = [...d.word, ...s.word]; d.qPrev = applyWord(g, s.word, q); }
    else d.qPrev = q;
  }

  _startPinch() {
    const [a, b] = [...this.pointers.values()];
    this.drag = null;
    this.pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) };
  }
  _pinchMove() {
    const [a, b] = [...this.pointers.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (this.pinch.d > 0) this.view.zoomAt(d / this.pinch.d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    this.pinch.d = d;
  }

  _wheel(e) {
    e.preventDefault();
    const [x, y] = this._xy(e);
    const hit = this.hitTest(x, y);
    const dir = -Math.sign(e.deltaY);
    if (hit && (hit.type === 'face' || hit.type === 'inner') && hit.params?.length && this.model.geo.mode === 'hyp') {
      const d = this._startParamDrag(hit, x, y, e);
      const tn = hit.params.find(n => n.endsWith('_t')), ln = hit.params.find(n => n.endsWith('_l'));
      const vals = {};
      if (e.shiftKey && tn) vals[tn] = d.start[tn] + dir * TWIST_WHEEL_STEP;
      else if (ln) vals[ln] = d.start[ln] + dir * LENGTH_WHEEL_STEP;
      this._applyParam(d, vals);
      this._tip(hit, x, y);
      clearTimeout(this._wheelCommit);
      this._wheelCommit = setTimeout(() => { this.model.refresh(); this.onCommit(); }, 350);
      return;
    }
    if (hit && hit.type === 'point') {
      const now = performance.now();
      if (now - (this._lastOrderWheel || 0) < 180) return;
      this._lastOrderWheel = now;
      const p = this.model.geo.points[hit.index];
      const tk = (p.tokens || []).find(i => ['cone', 'corner'].includes(this.model.tokens[i]?.kind));
      if (tk !== undefined) this.onOrder(tk, dir);
      return;
    }
    if (hit && hit.type === 'handle' && this.model.geo.mode === 'euc') {
      const h = hit.handle;
      const f = Math.exp(dir * 0.05);
      this.model.dragHandle(h, [h.pos[0] * (h.id === 'lattice_xy' ? f : 1), h.pos[1] * f], { pos: [...h.pos], value: this.model.values.lattice_b });
      clearTimeout(this._wheelCommit);
      this._wheelCommit = setTimeout(() => { this.model.refresh(); this.onCommit(); }, 350);
      return;
    }
    this.view.zoomAt(Math.exp(-e.deltaY * 0.0015), x, y);
  }
}

function onSegment(e, p) {
  if (!e.A || !e.B) return true;
  const w = e.wall;
  if (w.type === 1) {
    const n = v => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
    const qa = n([e.A[0] - w.c[0], e.A[1] - w.c[1]]), qb = n([e.B[0] - w.c[0], e.B[1] - w.c[1]]), q = n([p[0] - w.c[0], p[1] - w.c[1]]);
    const bis = n([qa[0] + qb[0], qa[1] + qb[1]]);
    return q[0] * bis[0] + q[1] * bis[1] >= qa[0] * bis[0] + qa[1] * bis[1] - 1e-6;
  }
  const d = [e.B[0] - e.A[0], e.B[1] - e.A[1]];
  const t = ((p[0] - e.A[0]) * d[0] + (p[1] - e.A[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1] || 1);
  return t >= 0 && t <= 1;
}
