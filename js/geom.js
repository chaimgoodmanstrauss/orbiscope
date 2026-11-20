// geom.js — small, dependency-free geometry used by Orbiscope's JS side.
//
// Two "worlds":
//   2D  (hyperbolic Poincaré disk, Euclidean plane): a wall is an engine iSplane
//       restricted to z = 0:  {type:1 (circle), c:[x,y], r}  r>0 solid inside,
//       r<0 solid outside;  {type:2 (line), n:[x,y] unit, d}.  dist() > 0 is
//       "outside" (the side a transform moves points away from), as in the engine.
//   3D  (spherical groups): a wall is a great circle, stored as a unit normal
//       n (dist = n·p, > 0 outside); a reflection is p - 2(n·p)n.
// A transform is a list of walls applied left to right (as iTransformU4 does).

export const SPHERE = 1, PLANE = 2;

// ── 2D ────────────────────────────────────────────────────────────────────

export function wallFromSplane(sp) {
  const v = sp.v;
  if (sp.type === SPHERE) return { type: SPHERE, c: [v[0], v[1]], r: v[3] };
  const l = Math.hypot(v[0], v[1]) || 1;
  return { type: PLANE, n: [v[0] / l, v[1] / l], d: v[3] / l };
}

export function dist2(w, p) {
  if (w.type === SPHERE) {
    const d = Math.hypot(p[0] - w.c[0], p[1] - w.c[1]) - Math.abs(w.r);
    return w.r > 0 ? d : -d;
  }
  return p[0] * w.n[0] + p[1] * w.n[1] - w.d;
}

// reflect p in w; returns [x, y, scale] where scale = |d p'/d p|
export function reflect2(w, p) {
  if (w.type === SPHERE) {
    const dx = p[0] - w.c[0], dy = p[1] - w.c[1];
    const q = dx * dx + dy * dy || 1e-300, r2 = w.r * w.r;
    return [w.c[0] + r2 * dx / q, w.c[1] + r2 * dy / q, r2 / q];
  }
  const s = 2 * (p[0] * w.n[0] + p[1] * w.n[1] - w.d);
  return [p[0] - s * w.n[0], p[1] - s * w.n[1], 1];
}

export function apply2(tr, p) {
  let q = [p[0], p[1]], k = 1;
  for (const w of tr) { const r = reflect2(w, q); q = [r[0], r[1]]; k *= r[2]; }
  return { p: q, k };
}
export function applyInv2(tr, p) {
  let q = [p[0], p[1]];
  for (let i = tr.length - 1; i >= 0; i--) { const r = reflect2(tr[i], q); q = [r[0], r[1]]; }
  return q;
}

// outward unit normal (gradient of dist) of w at p
export function normal2(w, p) {
  if (w.type === PLANE) return w.n;
  const dx = p[0] - w.c[0], dy = p[1] - w.c[1], l = Math.hypot(dx, dy) || 1;
  const s = w.r > 0 ? 1 : -1;
  return [s * dx / l, s * dy / l];
}

// ── 3D (sphere) ──────────────────────────────────────────────────────────

// a spherical-group wall (engine iSplane, great circle in stereographic plane)
// as a unit normal in R^3 with the same inside/outside.
export function wallFromSplane3(sp) {
  const v = sp.v;
  if (sp.type === PLANE) {
    const l = Math.hypot(v[0], v[1]) || 1;
    return [v[0] / l, v[1] / l, 0];       // engine planes here all pass through 0
  }
  // circle |z-c| = r with |c|^2 = r^2 - 1  <->  plane  Z - c·(X,Y) = 0
  let n = [-v[0], -v[1], 1];
  const l = Math.hypot(...n);
  n = n.map(x => x / l);
  return v[3] > 0 ? n : n.map(x => -x);
}

export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm3 = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export function reflect3(n, p) { const s = 2 * dot3(n, p); return [p[0] - s * n[0], p[1] - s * n[1], p[2] - s * n[2]]; }
export function apply3(tr, p) { let q = p; for (const n of tr) q = reflect3(n, q); return { p: q, k: 1 }; }
export function applyInv3(tr, p) { let q = p; for (let i = tr.length - 1; i >= 0; i--) q = reflect3(tr[i], q); return q; }

// stereographic projection from the north pole (equator = unit circle)
export function toSphere(z) {
  const q = z[0] * z[0] + z[1] * z[1];
  return [2 * z[0] / (1 + q), 2 * z[1] / (1 + q), (q - 1) / (1 + q)];
}
export function fromSphere(S) {
  const d = 1 - S[2];
  if (d < 1e-12) return [1e12, 0];
  return [S[0] / d, S[1] / d];
}

// ── complex numbers & Möbius maps (2x2 complex matrices [a,b,c,d]) ────────

export const C = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
  mul: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]],
  div: (a, b) => { const q = b[0] * b[0] + b[1] * b[1] || 1e-300; return [(a[0] * b[0] + a[1] * b[1]) / q, (a[1] * b[0] - a[0] * b[1]) / q]; },
  conj: a => [a[0], -a[1]],
  abs: a => Math.hypot(a[0], a[1]),
  exp: t => [Math.cos(t), Math.sin(t)],
  scale: (a, s) => [a[0] * s, a[1] * s],
};

export const Mob = {
  id: () => [[1, 0], [0, 0], [0, 0], [1, 0]],
  apply(M, z) { return C.div(C.add(C.mul(M[0], z), M[1]), C.add(C.mul(M[2], z), M[3])); },
  // |f'(z)| for f = M
  deriv(M, z) {
    const det = C.sub(C.mul(M[0], M[3]), C.mul(M[1], M[2]));
    const den = C.add(C.mul(M[2], z), M[3]);
    const q = den[0] * den[0] + den[1] * den[1] || 1e-300;
    return C.abs(det) / q;
  },
  mul(A, B) { // A∘B
    return [
      C.add(C.mul(A[0], B[0]), C.mul(A[1], B[2])), C.add(C.mul(A[0], B[1]), C.mul(A[1], B[3])),
      C.add(C.mul(A[2], B[0]), C.mul(A[3], B[2])), C.add(C.mul(A[2], B[1]), C.mul(A[3], B[3])),
    ];
  },
  inv(M) { return [M[3], C.scale(M[1], -1), C.scale(M[2], -1), M[0]]; },
  normalize(M) {
    const det = C.sub(C.mul(M[0], M[3]), C.mul(M[1], M[2]));
    // sqrt of complex det
    const r = Math.sqrt(C.abs(det)), th = Math.atan2(det[1], det[0]) / 2;
    const s = [r * Math.cos(th), r * Math.sin(th)];
    return M.map(x => C.div(x, s));
  },
  // disk automorphism moving 0 to a:  z -> (z + a) / (conj(a) z + 1)
  diskTranslate(a) { return [[1, 0], a, C.conj(a), [1, 0]]; },
  rotate(t) { return [C.exp(t), [0, 0], [0, 0], [1, 0]]; },
  // spherical rotation moving 0 to a (stereographic coordinates)
  sphereTranslate(a) { return [[1, 0], a, C.scale(C.conj(a), -1), [1, 0]]; },
};

// hyperbolic distance in the Poincaré disk
export function hypDist(a, b) {
  const num = C.abs(C.sub(a, b));
  const den = C.abs(C.sub([1, 0], C.mul(C.conj(a), b)));
  const t = Math.min(num / den, 1 - 1e-15);
  return 2 * Math.atanh(t);
}
// the point a fraction t of the way along the geodesic from a to b (disk)
export function hypLerp(a, b, t) {
  const Tm = Mob.diskTranslate(C.scale(a, -1));
  const bb = Mob.apply(Tm, b);
  const l = C.abs(bb);
  if (l < 1e-15) return a;
  const d = 2 * Math.atanh(Math.min(l, 1 - 1e-15));
  const rr = Math.tanh(t * d / 2);
  return Mob.apply(Mob.diskTranslate(a), C.scale(bb, rr / l));
}

// ── 3x3 rotation matrices (row-major arrays of 9) ─────────────────────────

export const M3 = {
  id: () => [1, 0, 0, 0, 1, 0, 0, 0, 1],
  mul(A, B) {
    const R = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
      R[3 * i + j] = A[3 * i] * B[j] + A[3 * i + 1] * B[3 + j] + A[3 * i + 2] * B[6 + j];
    return R;
  },
  apply(A, v) { return [A[0] * v[0] + A[1] * v[1] + A[2] * v[2], A[3] * v[0] + A[4] * v[1] + A[5] * v[2], A[6] * v[0] + A[7] * v[1] + A[8] * v[2]]; },
  transpose(A) { return [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]]; },
  // rotation taking unit vector a to unit vector b (shortest arc)
  fromTo(a, b) {
    const v = cross3(a, b), c = dot3(a, b);
    if (c < -0.999999) return [-1, 0, 0, 0, 1, 0, 0, 0, -1];
    const k = 1 / (1 + c);
    return [
      v[0] * v[0] * k + c, v[0] * v[1] * k - v[2], v[0] * v[2] * k + v[1],
      v[1] * v[0] * k + v[2], v[1] * v[1] * k + c, v[1] * v[2] * k - v[0],
      v[2] * v[0] * k - v[1], v[2] * v[1] * k + v[0], v[2] * v[2] * k + c,
    ];
  },
  axisAngle(u, t) {
    const [x, y, z] = norm3(u), c = Math.cos(t), s = Math.sin(t), k = 1 - c;
    return [x * x * k + c, x * y * k - z * s, x * z * k + y * s,
      y * x * k + z * s, y * y * k + c, y * z * k - x * s,
      z * x * k - y * s, z * y * k + x * s, z * z * k + c];
  },
  orthonormalize(A) {
    let r0 = norm3([A[0], A[1], A[2]]);
    let r1 = [A[3], A[4], A[5]];
    const d = dot3(r0, r1); r1 = norm3([r1[0] - d * r0[0], r1[1] - d * r0[1], r1[2] - d * r0[2]]);
    const r2 = cross3(r0, r1);
    return [...r0, ...r1, ...r2];
  },
};
