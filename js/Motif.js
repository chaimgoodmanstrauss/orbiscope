// Motif.js — the art printed on every tile (for now: the comma), as an object
// the user can select and move. A motif lives in the fundamental domain's
// coordinates:
//   2D (disk, plane):  { c:[x,y], A:[a,b,c,d], size }   uv = A·(p − c) / size
//   sphere:            { c:[x,y,z], e1, e2, size }      uv = ((P − c)·e1, (P − c)·e2) / size
// uv ∈ [−1,1]² is the motif's square; texture v runs downwards (tuv = (u, −v)/2 + ½).
// When a move carries the centre out of the domain it is folded back in, and its
// frame (A or e1,e2) is carried along by the same group element, so the copy
// under the pointer never jumps or flips.

import { apply2, apply3, dot3 } from './geom.js';
import { makeCommaCanvas } from './textures.js';

export function applyWord(geo, word, p) {
  let q = p;
  for (const i of word) q = geo.mode === 'sph' ? apply3(geo.faces[i].tr, q).p : apply2(geo.faces[i].tr, q).p;
  return q;
}

export function withDefaultFrame(geo, m) {
  if (geo.mode === 'sph') {
    const c = m.c.length === 3 ? m.c : [0, 0, 1];
    const a = Math.abs(c[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const e1 = n3(cr3(a, c)), e2 = cr3(c, e1);
    return { ...m, c, e1, e2 };
  }
  return { ...m, A: [1, 0, 0, 1] };
}

// carry motif m by the group element `word` (its centre and frame together)
export function carry(geo, m, word) {
  if (!word.length) return m;
  if (geo.mode === 'sph') {
    // reflections through the origin are linear: apply them to the frame vectors too
    return { ...m, c: applyWord(geo, word, m.c), e1: applyWord(geo, word, m.e1), e2: applyWord(geo, word, m.e2) };
  }
  const eps = 1e-5 * Math.max(m.size, 1e-3);
  const q = applyWord(geo, word, m.c);
  const q1 = applyWord(geo, word, [m.c[0] + eps, m.c[1]]);
  const q2 = applyWord(geo, word, [m.c[0], m.c[1] + eps]);
  // D = d(word) at c (columns), A' = A·D⁻¹
  const D = [(q1[0] - q[0]) / eps, (q2[0] - q[0]) / eps, (q1[1] - q[1]) / eps, (q2[1] - q[1]) / eps];
  const det = D[0] * D[3] - D[1] * D[2];
  const Di = [D[3] / det, -D[1] / det, -D[2] / det, D[0] / det];
  const A = m.A;
  return { ...m, c: q, A: [A[0] * Di[0] + A[1] * Di[2], A[0] * Di[1] + A[1] * Di[3], A[2] * Di[0] + A[3] * Di[2], A[2] * Di[1] + A[3] * Di[3]] };
}

// fold a motif whose centre may have left the domain back into it
export function settle(geo, m) {
  const r = geo.reduce(m.c);
  if (!r.ok) return null;
  return { m: carry(geo, m, r.word), word: r.word };
}

export function motifUV(geo, m, p) {
  if (geo.mode === 'sph') {
    if (dot3(p, m.c) < 0) return null;
    const d = [p[0] - m.c[0], p[1] - m.c[1], p[2] - m.c[2]];
    return [dot3(d, m.e1) / m.size, dot3(d, m.e2) / m.size];
  }
  const d = [p[0] - m.c[0], p[1] - m.c[1]];
  return [(m.A[0] * d[0] + m.A[1] * d[1]) / m.size, (m.A[2] * d[0] + m.A[3] * d[1]) / m.size];
}

// coverage of the motif art at uv (0..1), from the same canvas the shader uses
let _px = null, _N = 128;
function coverage(uv) {
  if (!uv || Math.abs(uv[0]) >= 1 || Math.abs(uv[1]) >= 1) return 0;
  if (!_px) {
    if (typeof document === 'undefined') return Math.hypot(uv[0], uv[1]) < 0.6 ? 1 : 0;
    _px = makeCommaCanvas(_N).getContext('2d').getImageData(0, 0, _N, _N).data;
  }
  const x = Math.min(_N - 1, Math.floor((uv[0] * 0.5 + 0.5) * _N)), y = Math.min(_N - 1, Math.floor((-uv[1] * 0.5 + 0.5) * _N));
  const i = 4 * (y * _N + x);
  return Math.max(_px[i], _px[i + 1]) / 255;
}

// Is the folded point p on some copy of the motif? Copies in this tile and in
// the tiles one or two steps away (whose motifs can poke into it) are tried,
// the same set the shader draws. Returns the extra word that carries p into the
// frame of that copy (append it to p's reduction word), or null.
export function motifHit(geo, m, p) {
  if (!m) return null;
  if (coverage(motifUV(geo, m, p)) > 0.3) return [];
  const F = geo.faces.length;
  for (let i = 0; i < F; i++) {
    const q = applyWord(geo, [i], p);
    if (coverage(motifUV(geo, m, q)) > 0.3) return [i];
  }
  if (F <= 12) for (let i = 0; i < F; i++) for (let j = 0; j < F; j++) {
    const q = applyWord(geo, [i, j], p);
    if (coverage(motifUV(geo, m, q)) > 0.3) return [i, j];
  }
  return null;
}

function cr3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function n3(a) { const l = Math.hypot(...a) || 1; return a.map(x => x / l); }
