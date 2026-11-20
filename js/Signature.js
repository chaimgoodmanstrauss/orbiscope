// Signature.js — Conway orbifold signatures as token lists, the Magic Theorem
// price as an exact fraction, and the "bad orbifold" test.

export const MAX_ORDER = 99;

// token: { kind: 'o' | 'x' | '*' | 'cone' | 'corner', n? }
export function parse(str) {
  const toks = [];
  let onStar = false;
  const s = String(str || '').replace(/\s+/g, '').replace(/∗/g, '*');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === 'o' || ch === 'O') { toks.push({ kind: 'o' }); onStar = false; }
    else if (ch === 'x' || ch === 'X' || ch === '×') { toks.push({ kind: 'x' }); onStar = false; }
    else if (ch === '*') { toks.push({ kind: '*' }); onStar = true; }
    else if (ch === '(') {
      const j = s.indexOf(')', i);
      if (j < 0) return null;
      const n = parseInt(s.slice(i + 1, j), 10);
      if (!(n >= 2)) return null;
      toks.push({ kind: onStar ? 'corner' : 'cone', n: Math.min(n, MAX_ORDER) });
      i = j;
    } else if (ch >= '2' && ch <= '9') {
      toks.push({ kind: onStar ? 'corner' : 'cone', n: +ch });
    } else return null;
  }
  return toks;
}

const numStr = n => (n >= 10 ? `(${n})` : String(n));

export function stringify(toks) {
  return toks.map(t => (t.kind === 'cone' || t.kind === 'corner') ? numStr(t.n) : t.kind).join('');
}

// Re-derive cone/corner kinds from position (a digit after * is a corner).
export function normalizeKinds(toks) {
  let onStar = false;
  return toks.map(t => {
    if (t.kind === '*') { onStar = true; return t; }
    if (t.kind === 'o' || t.kind === 'x') { onStar = false; return t; }
    return { ...t, kind: onStar ? 'corner' : 'cone' };
  });
}

// Usual order: handles, cones, then each * with its corners, then crosscaps.
// Digit order inside each group is kept as typed.
export function canonical(toks) {
  const o = [], cones = [], stars = [], x = [];
  let cur = null;
  for (const t of toks) {
    if (t.kind === 'o') { o.push(t); cur = null; }
    else if (t.kind === 'x') { x.push(t); cur = null; }
    else if (t.kind === 'cone') cones.push(t);
    else if (t.kind === '*') { cur = [t]; stars.push(cur); }
    else if (t.kind === 'corner') { if (cur) cur.push(t); else cones.push({ ...t, kind: 'cone' }); }
  }
  return [...o, ...cones, ...stars.flat(), ...x];
}

// ── exact fractions ──────────────────────────────────────────────────────
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
export class Frac {
  constructor(p, q = 1) { if (q < 0) { p = -p; q = -q; } const g = gcd(p, q); this.p = p / g; this.q = q / g; }
  add(o) { return new Frac(this.p * o.q + o.p * this.q, this.q * o.q); }
  sub(o) { return new Frac(this.p * o.q - o.p * this.q, this.q * o.q); }
  cmp(o) { return Math.sign(this.p * o.q - o.p * this.q); }
  get value() { return this.p / this.q; }
  toString() {
    if (this.q === 1) return String(this.p);
    const w = Math.trunc(this.p / this.q), r = Math.abs(this.p % this.q);
    return w ? `${w} ${r}/${this.q}` : `${this.p}/${this.q}`;
  }
}

export function tokenCost(t) {
  switch (t.kind) {
    case 'o': return new Frac(2);
    case 'x': case '*': return new Frac(1);
    case 'cone': return new Frac(t.n - 1, t.n);
    case 'corner': return new Frac(t.n - 1, 2 * t.n);
  }
  return new Frac(0);
}

export function price(toks) {
  return toks.reduce((s, t) => s.add(tokenCost(t)), new Frac(0));
}

// −1 hyperbolic, 0 Euclidean, +1 spherical
export function curvatureOf(toks) {
  const c = price(toks).cmp(new Frac(2));
  return c > 0 ? -1 : c === 0 ? 0 : 1;
}

// The four impossible families: N, MN, *N, *MN with M ≠ N.
export function isBad(toks) {
  const kinds = toks.map(t => t.kind);
  const cones = toks.filter(t => t.kind === 'cone').map(t => t.n);
  const corners = toks.filter(t => t.kind === 'corner').map(t => t.n);
  const nO = kinds.filter(k => k === 'o').length, nX = kinds.filter(k => k === 'x').length;
  const nS = kinds.filter(k => k === '*').length;
  if (nO || nX) return false;
  if (nS === 0) return cones.length === 1 || (cones.length === 2 && cones[0] !== cones[1]);
  if (nS === 1 && cones.length === 0) return corners.length === 1 || (corners.length === 2 && corners[0] !== corners[1]);
  return false;
}

// Topology of the underlying surface
export function topology(toks) {
  const h = toks.filter(t => t.kind === 'o').length;
  const x = toks.filter(t => t.kind === 'x').length;
  const b = toks.filter(t => t.kind === '*').length;
  return { handles: h, crosscaps: x, boundaries: b, euler: 2 - 2 * h - x - b, sides: x > 0 ? 1 : 2 };
}
