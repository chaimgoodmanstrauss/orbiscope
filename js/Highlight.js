// Highlight.js — the one "currently highlighted feature", shared by every view.
// A highlight is { source, tokens:[signature indices], faces:[], inner:[], points:[], color }.

export class Highlight {
  constructor() { this.current = null; this._ls = []; }
  set(h) {
    const key = h ? JSON.stringify([h.tokens, h.faces, h.inner, h.points]) : '';
    const old = this.current ? JSON.stringify([this.current.tokens, this.current.faces, this.current.inner, this.current.points]) : '';
    this.current = h;
    if (key !== old) this._ls.forEach(cb => cb(h));
  }
  clear() { this.set(null); }
  on(cb) { this._ls.push(cb); }
}

export const KIND_COLORS = {
  o: '#3b5bdb',
  x: '#9c36b5',
  '*': '#d0352b',
  cone: '#e8590c',
  corner: '#c2255c',
};
