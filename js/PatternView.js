// PatternView.js — WebGL2 tiling of the current orbifold group.
//
// A slim renderer (instead of SymmHub's SymRenderer, which builds its own
// dat.gui): every pixel is mapped to the world, then folded into the
// fundamental domain by the same rule as the engine's shader — while the point
// is outside some face (and inside that face's bounds), apply the face's
// transform. The folded point tells the tile parity (teal / sand), where the
// comma motif sits, and how close the pixel is to each edge, cone and corner,
// so edges and highlights are drawn on every copy of the domain at once.
//
// Views: hyperbolic — Poincaré disk, Möbius pan; Euclidean — the plane;
// spherical — an orthographic globe, drag to turn.

import { Mob, C, M3, toSphere, fromSphere, norm3, cross3, dot3, hypLerp, apply2, apply3 } from './geom.js';
import { makeCommaCanvas } from './textures.js';
import { unreduce } from './OrbifoldModel.js';

const MAXF = 64, WIDTH = 16;

const VS = `#version 300 es
in vec2 aPos; void main(){ gl_Position = vec4(aPos, 0., 1.); }`;

const FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uData;
uniform sampler2D uMotif;
uniform int uMode, uNF, uNI, uNP;
uniform vec2 uCenter;      // canvas centre, device px
uniform float uS;          // device px per screen unit
uniform vec2 uOff;         // screen-unit offset (zoom about pointer)
uniform vec4 uV0, uV1;     // screen -> world Möbius  (a, b | c, d)
uniform mat3 uR;           // sphere: view -> world
uniform vec3 uCommaC, uCommaE1, uCommaE2;
uniform float uCommaSize;
uniform mat2 uCommaA;        // motif frame (2D): uv = A (p - c) / size
uniform int uCommaHL;        // 0 none, 1 hovered, 2 selected
uniform float uDpr;
uniform float uDim;
uniform int uHomeTint;
out vec4 outColor;

vec4 T(int c, int r) { return texelFetch(uData, ivec2(c, r), 0); }
vec2 cmul(vec2 a, vec2 b){ return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
vec2 cdiv(vec2 a, vec2 b){ float q = dot(b,b); return vec2(a.x*b.x + a.y*b.y, a.y*b.x - a.x*b.y)/q; }

// 2D walls: type 1 circle (c.xy, r in w), type 2 line (n.xy, d in w)
float dist2(vec4 v, float type, vec2 p){
  if (type < 1.5) { float d = length(p - v.xy) - abs(v.w); return v.w > 0. ? d : -d; }
  return dot(p, v.xy) - v.w;
}
vec3 refl2(vec4 v, float type, vec2 p){
  if (type < 1.5) { vec2 d = p - v.xy; float q = max(dot(d,d), 1e-30); float r2 = v.w*v.w; return vec3(v.xy + r2*d/q, r2/q); }
  float s = 2.*(dot(p, v.xy) - v.w); return vec3(p - s*v.xy, 1.);
}
float typeOf(int r, int slot){ // slot 0..3 bounds (texel 12), 4..9 transform (texel 13, 14)
  vec4 t = slot < 4 ? T(12, r) : (slot < 8 ? T(13, r) : T(14, r));
  int k = slot < 4 ? slot : (slot < 8 ? slot - 4 : slot - 8);
  return k == 0 ? t.x : k == 1 ? t.y : k == 2 ? t.z : t.w;
}

vec3 hex(vec3 c){ return c; }

void main(){
  vec2 px = gl_FragCoord.xy;
  vec2 u = (px - uCenter) / uS - uOff;
  vec3 paper = vec3(0.984, 0.980, 0.965);
  vec3 ink = vec3(0.10, 0.10, 0.12);

  vec2 p; vec3 P; float J = 1.;    // |d world / d screen unit|
  bool sph = uMode == 2;
  if (sph) {
    float r2 = dot(u,u);
    if (r2 > 1.) {
      float a = clamp((sqrt(r2) - 1.) * uS / uDpr, 0., 1.);
      outColor = vec4(mix(mix(ink, paper, 0.55), paper, a), 1.); return;
    }
    P = normalize(uR * vec3(u, sqrt(1. - r2)));
  } else {
    vec2 a = uV0.xy, b = uV0.zw, c = uV1.xy, d = uV1.zw;
    vec2 den = cmul(c, u) + d;
    p = cdiv(cmul(a, u) + b, den);
    J = 1. / dot(den, den);              // det = 1
    if (uMode == 0 && dot(u,u) >= 1.) {
      float e = abs(length(u) - 1.) * uS / uDpr;
      outColor = vec4(mix(mix(ink, paper, 0.45), paper, clamp(e - 0.5, 0., 1.)), 1.);
      return;
    }
  }

  // ── fold into the fundamental domain ──
  float k = 1.;
  int parity = 0, steps = 0;
  bool ok = true;
  for (int it = 0; it < 90; it++) {
    bool moved = false;
    for (int i = 0; i < ${MAXF}; i++) {
      if (i >= uNF) break;
      vec4 meta = T(11, i);
      vec4 w = T(0, i);
      float dd = sph ? dot(w.xyz, P) : dist2(w, meta.x, p);
      if (dd <= 0.) continue;
      bool inb = true;
      int nb = int(meta.y);
      for (int j = 0; j < 4; j++) { if (j >= nb) break; if (dist2(T(1 + j, i), typeOf(i, j), p) <= 0.) { inb = false; break; } }
      if (!inb) continue;
      int nt = int(meta.z);
      for (int j = 0; j < 6; j++) {
        if (j >= nt) break;
        vec4 s = T(5 + j, i);
        if (sph) P = P - 2. * dot(s.xyz, P) * s.xyz;
        else { vec3 r = refl2(s, typeOf(i, 4 + j), p); p = r.xy; k *= r.z; }
      }
      parity ^= (nt & 1);
      steps++;
      moved = true;
      break;
    }
    if (!moved) break;
    if (it == 89) ok = false;
  }

  // px per world unit at the folded point
  float scale = sph ? uS : uS / (k * J);
  scale /= uDpr;      // in CSS px for line widths

  vec3 fillF = vec3(0.604, 0.835, 0.800), inkF = vec3(0.180, 0.490, 0.443);
  vec3 fillB = vec3(0.961, 0.902, 0.776), inkB = vec3(0.722, 0.573, 0.353);
  vec3 col = parity == 0 ? fillF : fillB;
  if (uHomeTint == 1 && steps == 0) col = mix(col, vec3(1.), 0.35);

  // ── comma ── (this tile's own, and those of tiles one or two steps away that poke in)
  {
    vec4 best = vec4(0.); int bpar = parity;
    for (int pass = 0; pass < 1 + ${MAXF} + 144; pass++) {
      int i = -1, j = -1;
      if (pass > 0 && pass <= uNF) i = pass - 1;
      else if (pass > ${MAXF}) { if (uNF > 12) break; int q = pass - ${MAXF} - 1; i = q / 12; j = q - 12 * (q / 12); if (i >= uNF) break; if (j >= uNF) continue; }
      else if (pass > 0) continue;
      vec2 pp = p; vec3 PP = P; int par = parity;
      for (int s2 = 0; s2 < 2; s2++) {
        int f = s2 == 0 ? i : j;
        if (f < 0) continue;
        int nt = int(T(11, f).z);
        for (int t = 0; t < 6; t++) {
          if (t >= nt) break;
          vec4 sp = T(5 + t, f);
          if (sph) PP = PP - 2. * dot(sp.xyz, PP) * sp.xyz;
          else pp = refl2(sp, typeOf(f, 4 + t), pp).xy;
        }
        par ^= (nt & 1);
      }
      vec2 uv;
      if (sph) { vec3 dlt = PP - uCommaC; uv = vec2(dot(dlt, uCommaE1), dot(dlt, uCommaE2)) / uCommaSize; if (dot(PP, uCommaC) < 0.) uv = vec2(9.); }
      else uv = (uCommaA * (pp - uCommaC.xy)) / uCommaSize;
      vec2 tuv = vec2(uv.x, -uv.y) * 0.5 + 0.5;
      if (any(lessThanEqual(tuv, vec2(0.))) || any(greaterThanEqual(tuv, vec2(1.)))) continue;
      // explicit LOD: derivatives jump across tile seams, so texture() would blur there
      float lod = log2(max(256. / max(2. * uCommaSize * scale * uDpr, 1e-3), 1.));
      vec4 m = textureLod(uMotif, tuv, lod);
      if (max(m.r, m.g) > max(best.r, best.g)) { best = m; bpar = par; }
      if (best.r > 0.99) break;
    }
    if (max(best.r, best.g) > 0.) {
      vec3 ci = bpar == 0 ? inkF : inkB;
      vec3 oc = uCommaHL > 0 ? vec3(1., 0.75, 0.1) : mix(ci, ink, 0.25);
      col = mix(col, oc, best.g * (uCommaHL > 0 ? 1. : 0.9));
      col = mix(col, uCommaHL == 2 ? mix(ci, vec3(1., 0.84, 0.23), 0.35) : ci, best.r);
    }
  }

  // ── edges ── (thinner where tiles are tiny, e.g. near the rim of the disk)
  float tileFade = clamp(uCommaSize * scale / 22., 0.25, 1.);
  vec3 edgeCol = vec3(0.); float edgeA = 0.;
  vec3 glowCol = vec3(1., 0.84, 0.23); float glowA = 0.;
  for (int i = 0; i < ${MAXF}; i++) {
    if (i >= uNF) break;
    vec4 meta = T(11, i);
    vec4 w = T(0, i);
    float dd = abs(sph ? dot(w.xyz, P) : dist2(w, meta.x, p)) * scale;
    if (dd > 12.) continue;
    int nb = int(meta.y);
    bool inb = true;
    if (!sph) for (int j = 0; j < 4; j++) { if (j >= nb) break; if (dist2(T(1 + j, i), typeOf(i, j), p) <= -1e-7) { inb = false; break; } }
    if (!inb) continue;
    vec4 st = T(15, i);       // rgb, width
    st.w *= tileFade;
    vec4 hl = T(14, i);       // .w highlight
    float a = clamp(st.w * 0.5 - dd + 0.5, 0., 1.);
    if (a > edgeA) { edgeA = a; edgeCol = st.rgb; }
    if (hl.w > 0.5) glowA = max(glowA, clamp(4.5 * tileFade - dd + 0.5, 0., 1.));
  }
  // interior cuts
  for (int i = 0; i < 32; i++) {
    if (i >= uNI) break;
    int r = uNF + i;
    vec4 w = T(0, r), ab = T(1, r), meta = T(2, r), st = T(3, r);
    float dd = abs(dist2(w, meta.x, p)) * scale;
    if (dd > 12.) continue;
    // on the segment AB?
    bool on;
    if (meta.x < 1.5) {
      vec2 qa = normalize(ab.xy - w.xy), qb = normalize(ab.zw - w.xy), q = normalize(p - w.xy);
      vec2 bis = normalize(qa + qb);
      on = dot(q, bis) >= dot(qa, bis) - 1e-6;
    } else {
      vec2 d = ab.zw - ab.xy; float t = dot(p - ab.xy, d) / max(dot(d,d), 1e-12);
      on = t >= 0. && t <= 1.;
    }
    if (!on) continue;
    float a = clamp(st.w * tileFade * 0.5 - dd + 0.5, 0., 1.) * 0.7;
    if (a > edgeA) { edgeA = a; edgeCol = st.rgb; }
    if (meta.y > 0.5) glowA = max(glowA, clamp(4.5 - dd + 0.5, 0., 1.));
  }
  col = mix(col, glowCol, glowA * 0.9);
  col = mix(col, edgeCol, edgeA);

  // ── cone and corner points ──
  for (int i = 0; i < 48; i++) {
    if (i >= uNP) break;
    int r = uNF + uNI + i;
    vec4 pos = T(0, r), meta = T(1, r), st = T(2, r);
    float dd = sph ? length(P - pos.xyz) * scale : length(p - pos.xy) * scale;
    if (dd > 14.) continue;
    float R = (meta.z > 0.5 ? 6.5 : 4.5) * tileFade;
    if (R < 1.2) continue;
    if (meta.z > 0.5) col = mix(col, glowCol, clamp(R + 4. - dd, 0., 1.));
    float ring = clamp(1.2 - abs(dd - R + 0.6), 0., 1.);
    float disc = clamp(R - dd, 0., 1.);
    col = mix(col, meta.x < 0.5 ? vec3(1.) : st.rgb, disc * (meta.x < 0.5 ? 0.95 : 0.85));
    col = mix(col, st.rgb, ring);
  }

  if (!ok) col = mix(col, paper, 0.6);
  col = mix(col, paper, uDim);
  outColor = vec4(col, 1.);
}`;

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

export class PatternView {
  constructor(canvas, overlay, model, highlight) {
    this.canvas = canvas; this.overlay = overlay; this.model = model; this.highlight = highlight;
    this.octx = overlay.getContext('2d');
    this.view = { mode: null, V: Mob.id(), R: M3.id(), zoom: 1, off: [0, 0] };
    this.hover = null;        // set by FeatureTool for drawing tooltips/handles
    this.dim = 0;
    this._dirty = true;
    this._listeners = [];
    this._initGL();
    this._resize();
    new ResizeObserver(() => { this._resize(); this.requestRender(); }).observe(canvas.parentElement);
    highlight.on(() => { this._dataDirty = true; this.requestRender(); });
  }

  onViewChange(cb) { this._listeners.push(cb); }

  _initGL() {
    const gl = this.canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false });
    this.gl = gl;
    if (!gl) { this._fail('This browser has no WebGL2, so the pattern cannot be drawn.'); return; }
    this.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this._fail('The graphics context was lost. Reload the page to draw again.'); });
    this.canvas.addEventListener('webglcontextrestored', () => { this._initGL(); this._dataDirty = true; this.requestRender(); this._unfail(); });
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    this.prog = prog;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.uni = {};
    for (const n of ['uData', 'uMotif', 'uMode', 'uNF', 'uNI', 'uNP', 'uCenter', 'uS', 'uOff', 'uV0', 'uV1', 'uR', 'uCommaC', 'uCommaE1', 'uCommaE2', 'uCommaSize', 'uCommaA', 'uCommaHL', 'uDpr', 'uDim', 'uHomeTint'])
      this.uni[n] = gl.getUniformLocation(prog, n);
    this.dataTex = gl.createTexture();
    this.motifTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.motifTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, makeCommaCanvas(256));
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this._dataDirty = true;
  }

  _fail(msg) {
    let el = this.canvas.parentElement.querySelector('.gl-msg');
    if (!el) { el = document.createElement('div'); el.className = 'gl-msg'; this.canvas.parentElement.appendChild(el); }
    el.textContent = msg;
  }
  _unfail() { this.canvas.parentElement.querySelector('.gl-msg')?.remove(); }

  _resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.cssW = r.width; this.cssH = r.height;
    for (const c of [this.canvas, this.overlay]) {
      c.width = Math.max(1, Math.round(r.width * dpr));
      c.height = Math.max(1, Math.round(r.height * dpr));
    }
  }

  // ── view state ─────────────────────────────────────────────────────────
  resetView() {
    const g = this.model.geo;
    this.view.zoom = 1; this.view.off = [0, 0];
    this.view.V = Mob.id(); this.view.R = M3.id();
    if (!g) return;
    if (g.mode === 'euc') {
      const c = g.comma ? g.comma.c : [0, 0];
      // world z -> 0.32 (z - c)
      this.view.V = [[0.32, 0], C.scale(c, -0.32), [0, 0], [1, 0]];
    } else if (g.mode === 'sph') {
      const c = g.comma ? g.comma.c : [0, 0, 1];
      // world -> view: bring c to face the viewer, then tilt a little
      const Rwv = M3.mul(M3.axisAngle([1, 0, 0], -0.35), M3.fromTo(c, [0, 0, 1]));
      this.view.R = Rwv;
    }
    this.view.mode = g.mode;
    this._emitView();
  }

  baseScale() { return Math.min(this.canvas.width, this.canvas.height) / 2 * 0.96; }
  get S() { return this.baseScale() * this.view.zoom; }

  // CSS px (relative to canvas) -> screen units
  cssToScreen(x, y) {
    const d = this.dpr;
    return [(x * d - this.canvas.width / 2) / this.S - this.view.off[0], -((y * d - this.canvas.height / 2) / this.S) - this.view.off[1]];
  }
  screenToCss(u) {
    const d = this.dpr;
    return [((u[0] + this.view.off[0]) * this.S + this.canvas.width / 2) / d, (-(u[1] + this.view.off[1]) * this.S + this.canvas.height / 2) / d];
  }
  // world point at screen u (null if off the model)
  screenToWorld(u) {
    const g = this.model.geo;
    if (!g) return null;
    if (g.mode === 'sph') {
      const r2 = u[0] * u[0] + u[1] * u[1];
      if (r2 > 1) return null;
      const P = [u[0], u[1], Math.sqrt(1 - r2)];
      return norm3(M3.apply(M3.transpose(this.view.R), P));
    }
    const w = Mob.apply(Mob.inv(this.view.V), u);
    if (g.mode === 'hyp' && w[0] * w[0] + w[1] * w[1] >= 1) return null;
    return w;
  }
  worldToScreen(w) {
    const g = this.model.geo;
    if (g.mode === 'sph') { const P = M3.apply(this.view.R, w); return P[2] >= 0 ? [P[0], P[1]] : null; }
    return Mob.apply(this.view.V, w);
  }
  // CSS px per world unit at world point w
  cssPerWorld(w) {
    const g = this.model.geo;
    if (g.mode === 'sph') return this.S / this.dpr;
    return Mob.deriv(this.view.V, w) * this.S / this.dpr;
  }

  _emitView() { this._listeners.forEach(cb => cb()); }

  pan(u0, u1) {
    const g = this.model.geo; if (!g) return;
    if (g.mode === 'hyp') {
      const cl = u => { const l = Math.hypot(u[0], u[1]); return l > 0.97 ? C.scale(u, 0.97 / l) : u; };
      const a = cl(u0), b = cl(u1);
      const T = Mob.mul(Mob.diskTranslate(b), Mob.diskTranslate(C.scale(a, -1)));
      this.view.V = Mob.normalize(Mob.mul(T, this.view.V));
    } else if (g.mode === 'euc') {
      this.view.V = Mob.mul([[1, 0], C.sub(u1, u0), [0, 0], [1, 0]], this.view.V);
    } else {
      const toS = u => { const r2 = u[0] * u[0] + u[1] * u[1]; if (r2 >= 1) { const l = Math.sqrt(r2); return [u[0] / l, u[1] / l, 0]; } return [u[0], u[1], Math.sqrt(1 - r2)]; };
      this.view.R = M3.orthonormalize(M3.mul(M3.fromTo(toS(u0), toS(u1)), this.view.R));
    }
    this.requestRender(); this._emitView();
  }

  // zoom by factor f about css point (x, y)
  zoomAt(f, x, y) {
    const g = this.model.geo; if (!g) return;
    if (g.mode === 'euc') {
      const u = this.cssToScreen(x, y);
      // scale world about the pointer
      const Z = [[f, 0], C.scale(u, 1 - f), [0, 0], [1, 0]];
      this.view.V = Mob.mul(Z, this.view.V);
    } else {
      const before = this.cssToScreen(x, y);
      const nz = Math.min(Math.max(this.view.zoom * f, 0.5), 8);
      this.view.zoom = nz;
      const after = this.cssToScreen(x, y);
      this.view.off = [this.view.off[0] + (after[0] - before[0]), this.view.off[1] + (after[1] - before[1])];
      if (nz <= 1.0001) this.view.off = this.view.off.map(v => v * 0.8);
    }
    this.requestRender(); this._emitView();
  }

  // keep world point W (in the copy) at screen point target (hyperbolic only),
  // with direction toward W1 matching target1
  anchor(Vstash, W, W1, target, target1) {
    const s = Mob.apply(Vstash, W), s1 = Mob.apply(Vstash, W1);
    const A = Mob.diskTranslate(C.scale(s, -1));          // s -> 0
    const d0 = Mob.apply(A, s1);
    const B = Mob.diskTranslate(C.scale(target, -1));
    const d1 = Mob.apply(B, target1);
    const phi = Math.atan2(d1[1], d1[0]) - Math.atan2(d0[1], d0[0]);
    const Cm = Mob.mul(Mob.diskTranslate(target), Mob.mul(Mob.rotate(phi), A));
    this.view.V = Mob.normalize(Mob.mul(Cm, Vstash));
  }

  requestRender() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this.render(); });
  }
  markDataDirty() { this._dataDirty = true; this.requestRender(); }

  // ── data texture ───────────────────────────────────────────────────────
  _upload() {
    const g = this.model.geo, gl = this.gl;
    if (!g || !gl) return;
    const hl = this.highlight.current || {};
    const hf = new Set(hl.faces || []), hi = new Set(hl.inner || []), hp = new Set(hl.points || []);
    const faces = g.faces.slice(0, MAXF), inner = (g.inner || []).slice(0, 32), points = (g.points || []).slice(0, 48);
    const rows = Math.max(1, faces.length + inner.length + points.length);
    const data = new Float32Array(WIDTH * 4 * rows);
    const put = (row, col, v) => data.set(v, (row * WIDTH + col) * 4);
    const sph = g.mode === 'sph';
    const wv = w => sph ? [w[0], w[1], w[2], 0] : w.type === 1 ? [w.c[0], w.c[1], 0, w.r] : [w.n[0], w.n[1], 0, w.d];
    const wt = w => sph ? 2 : w.type;
    const widthOf = f => (f.kind === 'mirror' ? 3.2 : f.pair !== undefined ? 2.6 : 2.0);
    faces.forEach((f, r) => {
      put(r, 0, wv(f.wall));
      const nb = Math.min(f.bounds.length, 4), nt = Math.min(f.tr.length, 6);
      for (let j = 0; j < nb; j++) put(r, 1 + j, wv(f.bounds[j]));
      for (let j = 0; j < nt; j++) put(r, 5 + j, wv(f.tr[j]));
      put(r, 11, [wt(f.wall), nb, nt, 0]);
      const bt = [0, 0, 0, 0]; for (let j = 0; j < nb; j++) bt[j] = wt(f.bounds[j]);
      const tt = [0, 0, 0, 0, 0, 0]; for (let j = 0; j < nt; j++) tt[j] = wt(f.tr[j]);
      put(r, 12, bt);
      put(r, 13, tt.slice(0, 4));
      put(r, 14, [tt[4], tt[5], 0, hf.has(r) ? 1 : 0]);
      put(r, 15, [...hexToRgb(f.color), widthOf(f)]);
    });
    inner.forEach((e, i) => {
      const r = faces.length + i;
      put(r, 0, wv(e.wall));
      put(r, 1, [...(e.A || [0, 0]), ...(e.B || [0, 0])]);
      put(r, 2, [wt(e.wall), hi.has(i) ? 1 : 0, 0, 0]);
      put(r, 3, [...hexToRgb('#6b6a62'), 1.6]);
    });
    points.forEach((pt, i) => {
      const r = faces.length + inner.length + i;
      put(r, 0, sph ? [...pt.pos, 0] : [pt.pos[0], pt.pos[1], 0, 0]);
      put(r, 1, [pt.kind === 'cone' ? 0 : 1, pt.n, hp.has(i) ? 1 : 0, 0]);
      put(r, 2, [...hexToRgb(pt.kind === 'cone' ? '#e8590c' : '#c2255c'), 1]);
    });
    gl.bindTexture(gl.TEXTURE_2D, this.dataTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, WIDTH, rows, 0, gl.RGBA, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this._counts = [faces.length, inner.length, points.length];
    this._uploadedVersion = g.version;
    this._dataDirty = false;
  }

  render() {
    const gl = this.gl, g = this.model.geo;
    if (!gl || !this.prog || gl.isContextLost()) return;
    if (g && this.view.mode !== g.mode) this.resetView();
    if (g && (this._dataDirty || this._uploadedVersion !== g.version)) this._upload();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    const U = this.uni;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.dataTex); gl.uniform1i(U.uData, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.motifTex); gl.uniform1i(U.uMotif, 1);
    const mode = !g ? 2 : g.mode === 'hyp' ? 0 : g.mode === 'euc' ? 1 : 2;
    gl.uniform1i(U.uMode, mode);
    const [nf, ni, np] = g ? this._counts : [0, 0, 0];
    gl.uniform1i(U.uNF, nf); gl.uniform1i(U.uNI, ni); gl.uniform1i(U.uNP, np);
    gl.uniform2f(U.uCenter, this.canvas.width / 2, this.canvas.height / 2);
    gl.uniform1f(U.uS, this.S);
    gl.uniform2f(U.uOff, this.view.off[0], this.view.off[1]);
    const Vi = Mob.normalize(Mob.inv(this.view.V));
    gl.uniform4f(U.uV0, Vi[0][0], Vi[0][1], Vi[1][0], Vi[1][1]);
    gl.uniform4f(U.uV1, Vi[2][0], Vi[2][1], Vi[3][0], Vi[3][1]);
    // uR: view -> world = R^T ; GLSL mat3 is column-major, so pass R (row-major) untransposed
    gl.uniformMatrix3fv(U.uR, false, new Float32Array(this.view.R));
    const cm = g && g.comma ? g.comma : { c: [0, 0], size: 0.1 };
    if (mode === 2) {
      const c = cm.c.length === 3 ? cm.c : [0, 0, 1];
      let e1 = cm.e1, e2 = cm.e2;
      if (!e1) { const a = Math.abs(c[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]; e1 = norm3(cross3(a, c)); e2 = cross3(c, e1); }
      gl.uniform3f(U.uCommaC, ...c); gl.uniform3f(U.uCommaE1, ...e1); gl.uniform3f(U.uCommaE2, ...e2);
    } else {
      gl.uniform3f(U.uCommaC, cm.c[0], cm.c[1], 0);
      const A = cm.A || [1, 0, 0, 1];
      gl.uniformMatrix2fv(U.uCommaA, false, new Float32Array([A[0], A[2], A[1], A[3]]));   // column-major
    }
    gl.uniform1i(U.uCommaHL, this.motifState || 0);
    gl.uniform1f(U.uCommaSize, cm.size);
    gl.uniform1f(U.uDpr, this.dpr);
    gl.uniform1f(U.uDim, this.dim);
    gl.uniform1i(U.uHomeTint, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.drawOverlay();
  }

  // ── 2D overlay: glue arrows on the home tile, lattice handles ───────────
  drawOverlay() {
    const ctx = this.octx, g = this.model.geo, d = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    if (!g || this.dim > 0.3) return;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const toCss = w => { const s = this.worldToScreen(w); return s ? this.screenToCss(s) : null; };

    // arrows on paired edges of the home tile (not for the sphere)
    if (g.mode !== 'sph') {
      const lerp = (a, b, t) => g.mode === 'hyp' ? hypLerp(a, b, t) : [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const seen = new Map();
      g.faces.forEach((f, i) => {
        if (f.pair === undefined || !f.ends) return;
        const [A, B] = f.ends;
        let from = A, to = B;
        // arrows on the partner run from tr(A) to tr(B)
        if (seen.has(f.pair)) {
          const first = g.faces[seen.get(f.pair)];
          const ta = apply2(first.tr, first.ends[0]).p, tb = apply2(first.tr, first.ends[1]).p;
          from = ta; to = tb;
        } else seen.set(f.pair, i);
        const count = (f.pair % 3) + 1;
        for (let c = 0; c < count; c++) {
          const t = 0.5 + (c - (count - 1) / 2) * 0.07;
          const p0 = toCss(lerp(from, to, t - 0.02)), p1 = toCss(lerp(from, to, t + 0.02));
          if (!p0 || !p1) continue;
          this._chevron(ctx, p0, p1, f.color);
        }
      });
    }

    // lattice handles
    for (const h of g.handles || []) {
      const p = toCss(h.pos); if (!p) continue;
      if (h.from) {
        const o = toCss(h.from);
        if (o) {
          ctx.strokeStyle = h.fixed ? '#52514a' : '#1a1a1f'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
          const ang = Math.atan2(p[1] - o[1], p[0] - o[0]);
          ctx.beginPath(); ctx.moveTo(p[0], p[1]);
          ctx.lineTo(p[0] - 10 * Math.cos(ang - 0.4), p[1] - 10 * Math.sin(ang - 0.4));
          ctx.lineTo(p[0] - 10 * Math.cos(ang + 0.4), p[1] - 10 * Math.sin(ang + 0.4));
          ctx.closePath(); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
        }
      }
      if (h.fixed) continue;
      const active = this.hover && this.hover.type === 'handle' && this.hover.handle.id === h.id;
      ctx.beginPath(); ctx.arc(p[0], p[1], active ? 9 : 7, 0, 2 * Math.PI);
      ctx.fillStyle = active ? '#ffd43b' : '#fbfaf6'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#1a1a1f'; ctx.stroke();
    }
  }

  _chevron(ctx, p0, p1, color) {
    const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
    const m = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2], L = 6;
    ctx.beginPath();
    ctx.moveTo(m[0] - L * Math.cos(ang - 0.6), m[1] - L * Math.sin(ang - 0.6));
    ctx.lineTo(m[0] + 2 * Math.cos(ang), m[1] + 2 * Math.sin(ang));
    ctx.lineTo(m[0] - L * Math.cos(ang + 0.6), m[1] - L * Math.sin(ang + 0.6));
    ctx.lineWidth = 4.5; ctx.strokeStyle = '#fbfaf6'; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
    ctx.lineWidth = 2.2; ctx.strokeStyle = color; ctx.stroke();
  }

  // pixel distance helpers for FeatureTool: fold a CSS point
  probe(x, y) {
    const g = this.model.geo; if (!g) return null;
    const u = this.cssToScreen(x, y);
    const w = this.screenToWorld(u);
    if (!w) return null;
    const r = g.reduce(w);
    // CSS px per unit of folded coordinates
    const scale = g.mode === 'sph' ? this.S / this.dpr : this.cssPerWorld(w) / r.k;
    return { u, w, ...r, scale };
  }
}
