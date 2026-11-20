// SignatureEditor.js — the signature as a row of character cells, the chips
// that add or remove characters, keyboard typing, and the Magic Theorem price bar.

import * as Sig from './Signature.js';
import { KIND_COLORS } from './Highlight.js';

const KIND_NAMES = { o: 'handle', x: 'crosscap', '*': 'mirror boundary', cone: 'gyration point', corner: 'corner' };

export class SignatureEditor {
  /**
   * opts: root (element), model, highlight, presets, onChange(text, {commit}), onPreset(dir)
   */
  constructor(opts) {
    Object.assign(this, opts);
    this.tokens = [];
    this.caret = 0;
    this._build();
    this.highlight.on(h => this._showHighlight(h));
  }

  _build() {
    const r = this.root;
    r.innerHTML = `
      <div class="sig-row">
        <button class="step" data-act="prev" aria-label="previous example" title="previous example">‹</button>
        <div class="cells" tabindex="0" role="textbox" aria-label="orbifold signature: type o, x, *, 2 to 9; arrows move; Enter tidies"></div>
        <button class="step" data-act="next" aria-label="next example" title="next example">›</button>
      </div>
      <div class="chips" role="toolbar" aria-label="edit the signature">
        <button class="chip num" data-act="dec" aria-label="lower the selected number">−</button>
        <button class="chip num" data-act="inc" aria-label="raise the selected number">+</button>
        <span class="sep"></span>
        <button class="chip" data-add="o" title="add a handle"><b>o</b> handle</button>
        <button class="chip" data-add="cone" title="add a gyration point"><b>3</b> gyration</button>
        <button class="chip" data-add="*" title="add a mirror boundary"><b>*</b> mirror</button>
        <button class="chip" data-add="corner" title="add a corner (after a *)"><b>*2</b> corner</button>
        <button class="chip" data-add="x" title="add a crosscap"><b>x</b> crosscap</button>
        <button class="chip" data-act="del" aria-label="delete the selected character" title="delete">⌫</button>
        <button class="chip" data-act="tidy" title="usual order">usual order</button>
      </div>
      <div class="price" aria-live="polite">
        <div class="rail"><div class="zones"><span class="z-s"></span><span class="z-p"></span><span class="z-h"></span></div><div class="bar"></div><div class="tick" title="$2"></div></div>
        <div class="zone-labels"><span>under $2: a sphere</span><span>$2: the plane</span><span>over $2: hyperbolic</span></div>
        <div class="verdict"></div>
      </div>`;
    this.cellsEl = r.querySelector('.cells');
    this.barEl = r.querySelector('.bar');
    this.verdictEl = r.querySelector('.verdict');
    this.tickEl = r.querySelector('.tick');
    r.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.add) this.insert(b.dataset.add);
      const a = b.dataset.act;
      if (a === 'prev') this.onPreset(-1);
      if (a === 'next') this.onPreset(1);
      if (a === 'dec') this.bump(-1);
      if (a === 'inc') this.bump(1);
      if (a === 'del') this.del();
      if (a === 'tidy') this.tidy();
      if (!['prev', 'next'].includes(a)) this.cellsEl.focus({ preventScroll: true });
    });
    this.cellsEl.addEventListener('keydown', e => this._key(e));
    this.cellsEl.addEventListener('click', e => {
      const c = e.target.closest('.cell');
      if (c) { this.caret = +c.dataset.i + 1; this._render(); }
      else { this.caret = this.tokens.length; this._render(); }
    });
    this.cellsEl.addEventListener('pointerover', e => {
      const c = e.target.closest('.cell');
      if (c) this._hoverToken(+c.dataset.i);
    });
    this.cellsEl.addEventListener('pointerleave', () => this._hoverToken(-1));
    this.barEl.addEventListener('pointerover', e => {
      const s = e.target.closest('[data-i]');
      if (s) this._hoverToken(+s.dataset.i);
    });
    this.barEl.addEventListener('pointerleave', () => this._hoverToken(-1));
  }

  // external: show this signature (no change event)
  set(text) {
    this.tokens = Sig.parse(text) || [];
    this.caret = this.tokens.length;
    this._render();
  }

  _emit() {
    this.tokens = Sig.normalizeKinds(this.tokens);
    this._render();
    this.onChange(Sig.stringify(this.tokens), { commit: true });
  }

  insert(kind) {
    let t;
    if (kind === 'o' || kind === 'x' || kind === '*') t = { kind };
    else if (kind === 'cone') t = { kind: 'cone', n: 3 };
    else if (kind === 'corner') {
      const starBefore = this.tokens.slice(0, this.caret).some(t => t.kind === '*');
      if (!starBefore) { this.tokens.splice(this.caret, 0, { kind: '*' }); this.caret++; }
      t = { kind: 'corner', n: 2 };
    } else if (/^[2-9]$/.test(kind)) t = { kind: 'cone', n: +kind };
    if (!t) return;
    this.tokens.splice(this.caret, 0, t);
    this.caret++;
    this._emit();
  }

  del(forward = false) {
    const i = forward ? this.caret : this.caret - 1;
    if (i < 0 || i >= this.tokens.length) return;
    this.tokens.splice(i, 1);
    if (!forward) this.caret = i;
    this._emit();
  }

  // change the number of the selected cell (or the nearest digit)
  bump(dir) {
    let i = this.caret - 1;
    const isNum = k => this.tokens[k] && (this.tokens[k].kind === 'cone' || this.tokens[k].kind === 'corner');
    if (!isNum(i)) i = isNum(this.caret) ? this.caret : -1;
    if (i < 0) return;
    this.setOrderAt(i, this.tokens[i].n + dir);
  }

  setOrderAt(i, n) {
    const t = this.tokens[i];
    if (!t || !(t.kind === 'cone' || t.kind === 'corner')) return;
    t.n = Math.max(2, Math.min(Sig.MAX_ORDER, n));
    this.caret = i + 1;
    this._emit();
  }

  tidy() {
    this.tokens = Sig.canonical(this.tokens);
    this.caret = this.tokens.length;
    this._emit();
  }

  _key(e) {
    const k = e.key;
    if (e.metaKey || e.ctrlKey) return;              // leave undo etc. to the page
    if (/^[2-9]$/.test(k)) { this.insert(k); e.preventDefault(); return; }
    if (k === 'o' || k === 'O') { this.insert('o'); e.preventDefault(); return; }
    if (k === 'x' || k === 'X') { this.insert('x'); e.preventDefault(); return; }
    if (k === '*') { this.insert('*'); e.preventDefault(); return; }
    if (k === 'Backspace') { this.del(); e.preventDefault(); return; }
    if (k === 'Delete') { this.del(true); e.preventDefault(); return; }
    if (k === 'ArrowLeft') { this.caret = Math.max(0, this.caret - 1); this._render(); e.preventDefault(); return; }
    if (k === 'ArrowRight') { this.caret = Math.min(this.tokens.length, this.caret + 1); this._render(); e.preventDefault(); return; }
    if (k === 'ArrowUp' || k === '+' || k === '=') { this.bump(1); e.preventDefault(); return; }
    if (k === 'ArrowDown' || k === '-') { this.bump(-1); e.preventDefault(); return; }
    if (k === 'Home') { this.caret = 0; this._render(); e.preventDefault(); return; }
    if (k === 'End') { this.caret = this.tokens.length; this._render(); e.preventDefault(); return; }
    if (k === 'Enter') { this.tidy(); e.preventDefault(); return; }
  }

  _hoverToken(i) {
    if (i < 0) { if (this.highlight.current?.source === 'editor') this.highlight.clear(); return; }
    const f = this.model.featuresOfToken(i);
    this.highlight.set({ source: 'editor', tokens: [i], faces: f.faces, inner: f.inner, points: f.points });
  }

  _showHighlight(h) {
    const lit = new Set(h ? h.tokens : []);
    this.cellsEl.querySelectorAll('.cell').forEach(c => c.classList.toggle('lit', lit.has(+c.dataset.i)));
    this.barEl.querySelectorAll('[data-i]').forEach(c => c.classList.toggle('lit', lit.has(+c.dataset.i)));
  }

  _render() {
    const T = this.tokens;
    const cells = T.map((t, i) => {
      const txt = (t.kind === 'cone' || t.kind === 'corner') ? String(t.n) : t.kind === '*' ? '∗' : t.kind;
      const cls = `cell k-${t.kind === '*' ? 'star' : t.kind}${i === this.caret - 1 ? ' sel' : ''}`;
      return `${i === this.caret ? '<span class="caret"></span>' : ''}<span class="${cls}" data-i="${i}" title="${KIND_NAMES[t.kind]}${t.n ? ' ' + t.n : ''}" style="--kc:${KIND_COLORS[t.kind]}">${txt}</span>`;
    }).join('') + (this.caret === T.length ? '<span class="caret"></span>' : '');
    this.cellsEl.innerHTML = cells || '<span class="caret"></span><span class="empty">no symmetry</span>';

    // price bar
    const price = Sig.price(T);
    const max = Math.max(3, Math.ceil(price.value + 0.25));
    this.root.style.setProperty('--two', `${(2 / max) * 100}%`);
    this.barEl.innerHTML = T.map((t, i) => {
      const c = Sig.tokenCost(t).value;
      return `<span data-i="${i}" style="width:${(c / max) * 100}%;--kc:${KIND_COLORS[t.kind]}" title="${KIND_NAMES[t.kind]}${t.n ? ' ' + t.n : ''}: $${Sig.tokenCost(t).toString()}"></span>`;
    }).join('');
    const corners = this.tokens.slice(0, this.caret).some(t => t.kind === '*');
    this.root.querySelector('[data-add="corner"]').title = corners ? 'add a corner' : 'add a mirror and a corner';

    const bad = Sig.isBad(T);
    const curv = Sig.curvatureOf(T);
    let v = `<b>$${price.toString()}</b> `;
    if (bad) v += '— <span class="bad">No pattern has this signature.</span>';
    else if (T.length === 0) v += '— a pattern with no symmetry at all';
    else if (curv > 0) {
      const two = new Sig.Frac(2).sub(price);
      const n = Math.round(2 / two.value);
      v += `— under $2: it lives on a sphere, with <b>${n}</b> symmetr${n === 1 ? 'y' : 'ies'}`;
    } else if (curv === 0) v += '— exactly $2: a pattern of the flat plane';
    else v += '— over $2: a pattern of the hyperbolic plane';
    this.verdictEl.innerHTML = v;
    this.root.classList.toggle('is-bad', bad);
    this._showHighlight(this.highlight.current);
  }
}
