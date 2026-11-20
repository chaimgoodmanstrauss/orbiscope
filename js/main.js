// main.js — boot Orbiscope and wire the pieces together.

import { OrbifoldModel } from './OrbifoldModel.js';
import { Highlight } from './Highlight.js';
import { PatternView } from './PatternView.js';
import { FeatureTool } from './FeatureTool.js';
import { SignatureEditor } from './SignatureEditor.js';
import { SurfaceView } from './SurfaceView.js';
import { PRESETS } from './presets.js';
import { commaSVG } from './textures.js';
import * as Sig from './Signature.js';

const $ = s => document.querySelector(s);
const DEFAULT = '*2223';

const model = new OrbifoldModel();
const highlight = new Highlight();
const view = new PatternView($('#pattern'), $('#overlay'), model, highlight);
const surface = new SurfaceView($('#surface'), $('#surface-info'), model, highlight);

// ── history (signature + parameters) ────────────────────────────────────
const undo = [], redo = [];
const snap = () => ({ sig: model.getSignature(), params: model.bad ? (undo[undo.length - 1]?.params || {}) : model.params.snapshot(), motif: model.bad ? null : model.motif });
const same = (a, b) => a && b && a.sig === b.sig && JSON.stringify(a.params) === JSON.stringify(b.params) && JSON.stringify(a.motif) === JSON.stringify(b.motif);
function commit() {
  const s = snap();
  if (!same(undo[undo.length - 1], s)) { undo.push(s); if (undo.length > 200) undo.shift(); redo.length = 0; }
  writeHash();
  updateUndoButtons();
}
function restore(s) {
  applySignature(s.sig, { params: s.params, motif: s.motif, history: false });
  editor.set(s.sig);
}
function updateUndoButtons() { $('#undo').disabled = undo.length < 2; $('#redo').disabled = redo.length === 0; }
$('#undo').onclick = () => doUndo();
$('#redo').onclick = () => doRedo();
function doUndo() { if (undo.length < 2) return; redo.push(undo.pop()); restore(undo[undo.length - 1]); writeHash(); updateUndoButtons(); }
function doRedo() { if (!redo.length) return; const s = redo.pop(); undo.push(s); restore(s); writeHash(); updateUndoButtons(); }

// ── URL hash: #<signature>&name=value… ──────────────────────────────────
function writeHash() {
  const p = model.bad ? {} : model.params.snapshot();
  const parts = [encodeURIComponent(model.getSignature()).replace(/%2A/gi, '*') || '-'];
  const num = v => (+v).toFixed(4).replace(/\.?0+$/, '') || '0';
  for (const [k, v] of Object.entries(p)) parts.push(`${k}=${num(v)}`);
  const m = model.bad ? null : model.motif;      // user-placed comma: m=c…,frame…,size
  if (m) parts.push('m=' + [...m.c, ...(m.A || [...m.e1, ...m.e2]), m.size].map(num).join(','));
  history.replaceState(null, '', '#' + parts.join('&'));
}
function readHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (!h) return null;
  const [sig, ...rest] = h.split('&');
  const params = {};
  let motif = null;
  for (const kv of rest) {
    const [k, v] = kv.split('=');
    if (k === 'm' && v) {
      const a = v.split(',').map(Number);
      if (a.every(Number.isFinite)) {
        if (a.length === 7) motif = { c: a.slice(0, 2), A: a.slice(2, 6), size: a[6] };
        else if (a.length === 10) motif = { c: a.slice(0, 3), e1: a.slice(3, 6), e2: a.slice(6, 9), size: a[9] };
      }
    } else if (k && v !== undefined && Number.isFinite(+v)) params[k] = +v;
  }
  return { sig: sig === '-' ? '' : sig, params, motif };
}

// ── signature changes ───────────────────────────────────────────────────
function applySignature(text, { params, motif = null, history: hist = true, resetView = false } = {}) {
  const prevMode = model.geo?.mode;
  if (text !== model.getSignature() || !motif) tool?.select(false);
  model.setSignature(text, { params, motif });
  if (!model.bad && (resetView || model.geo.mode !== prevMode)) view.resetView();
  if (hist) commit();
}

const editor = new SignatureEditor({
  root: $('#sig-editor'), model, highlight,
  onChange: (text) => applySignature(text),
  onPreset: dir => {
    const cur = PRESETS.findIndex(p => p.signature === model.getSignature());
    const i = cur < 0 ? (dir > 0 ? 0 : PRESETS.length - 1) : (cur + dir + PRESETS.length) % PRESETS.length;
    loadPreset(PRESETS[i]);
  },
});

function loadPreset(p) {
  applySignature(p.signature, { params: p.params || {}, resetView: true });
  editor.set(model.getSignature());
}

const tool = new FeatureTool({
  view, model, highlight, canvas: $('#pattern'), tip: $('#tip'),
  onOrder: (i, d) => { const t = model.tokens[i]; if (t) editor.setOrderAt(i, t.n + d); },
  onCommit: () => commit(),
});

// ── reacting to model changes ───────────────────────────────────────────
model.on('change', ev => {
  const bad = model.isBad();
  view.dim = bad ? 0.55 : 0;
  $('.pane-pattern').classList.toggle('is-bad', bad);
  view.markDataDirty();
  if (ev.kind === 'motif') { writeHash(); return; }
  if (ev.kind !== 'params') {
    surface.render();
    renderCaption();
    renderExamples();
    highlight.clear();
  }
  renderParams();
  renderHint();
});

function renderCaption() {
  const p = PRESETS.find(p => p.signature === model.getSignature());
  $('#caption').textContent = model.error ? model.error : p ? p.caption : '';
}

function renderHint() {
  const g = model.geo;
  if (model.isBad()) { $('#hint').textContent = 'No pattern has this signature — the last good one is shown faded.'; return; }
  if (!g) return;
  const m = g.mode === 'hyp' ? 'Poincaré disk: drag empty space to slide the plane, hover edges to reshape'
    : g.mode === 'euc' ? 'The flat plane: drag to slide, wheel to zoom' + (g.handles.some(h => !h.fixed) ? ', round handles reshape the lattice' : '; this lattice is rigid')
      : 'A sphere: drag to turn it, wheel to zoom';
  $('#hint').textContent = m + ' · drag a comma to move them all · 0 resets the view.';
}

function renderParams() {
  const el = $('#params');
  const g = model.geo;
  if (model.isBad() || !g) { el.innerHTML = ''; return; }
  const names = model.params.names();
  if (!names.length) {
    el.innerHTML = `<p class="none">${g.mode === 'sph' ? 'Spherical patterns are rigid: nothing to reshape, only to turn.' : g.mode === 'euc' ? 'This lattice is rigid: only its size could change, and that is just zoom.' : 'This pattern is rigid: its shape is fixed by its corners.'}</p>`;
    return;
  }
  const label = n => {
    const [key, idx, s] = n.split('_');
    if (key === 'lattice') return { b: 'lattice shape', c: 'gyration offset', x: 'lattice arrow, across', y: 'lattice arrow, up' }[idx];
    const nice = { cornerPair: 'mirror edge', conePair: 'folded edge', fold: 'fold', handle: 'handle', cap: 'crosscap', tube: 'cut (tube)', slice: 'cut (slice)', band: 'band' }[key] || key;
    return `${nice} ${idx} · ${s === 'l' ? 'length' : 'twist'}`;
  };
  el.innerHTML = `<table>${names.map(n => `<tr data-p="${n}"><td>${label(n)}</td><td class="v">${(+model.values[n]).toFixed(3)}</td></tr>`).join('')}</table>`;
}
$('#params').addEventListener('pointerover', e => {
  const tr = e.target.closest('tr[data-p]'); if (!tr) return;
  const n = tr.dataset.p, g = model.geo;
  highlight.set({
    source: 'params', tokens: [],
    faces: g.faces.map((f, i) => (f.params || []).includes(n) ? i : -1).filter(i => i >= 0),
    inner: (g.inner || []).map((f, i) => (f.params || []).includes(n) ? i : -1).filter(i => i >= 0), points: [],
  });
});
$('#params').addEventListener('pointerleave', () => highlight.clear());

// ── examples ────────────────────────────────────────────────────────────
function renderExamples() {
  const el = $('#examples');
  const groups = { plane: 'The plane: the 17 wallpaper groups', sphere: 'The sphere', hyperbolic: 'The hyperbolic plane' };
  const cur = model.getSignature();
  el.innerHTML = Object.entries(groups).map(([g, title]) => `<section><h3>${title}</h3>${PRESETS.map((p, i) => p.group !== g ? '' :
    `<button class="ex${p.signature === cur ? ' cur' : ''}" data-i="${i}"><code>${p.signature ? p.signature.replace(/\*/g, '∗') : '—'}</code><span>${p.caption}</span></button>`).join('')}</section>`).join('');
}
$('#examples').addEventListener('click', e => { const b = e.target.closest('.ex'); if (b) loadPreset(PRESETS[+b.dataset.i]); });

// ── tabs ────────────────────────────────────────────────────────────────
document.querySelectorAll('.tabs [data-tab]').forEach(b => b.addEventListener('click', () => {
  const t = b.dataset.tab;
  document.querySelectorAll('.tabs [data-tab]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  document.querySelectorAll('[data-tab-only]').forEach(p => { p.hidden = p.dataset.tabOnly !== t; });
  if (t === 'surface') $('.pane-surface').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}));

// ── keyboard ────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return; }
  if (mod && (e.key === 'y')) { e.preventDefault(); doRedo(); return; }
  const inEditor = document.activeElement?.closest?.('.cells');
  if (e.key === 'Escape' && tool.selected) { tool.select(false); return; }
  if (!inEditor && !mod && (e.key === '0' || (e.key === 'Home' && document.activeElement === $('#pattern')))) { view.resetView(); view.requestRender(); }
});
$('#home').onclick = () => { view.resetView(); view.requestRender(); };

$('#lg-front').innerHTML = commaSVG('#4fa397', '#2e7d71');
$('#lg-back').innerHTML = commaSVG('#d8bd85', '#a8844e');

// ── boot ────────────────────────────────────────────────────────────────
const fromHash = readHash();
const start = fromHash && Sig.parse(fromHash.sig) ? fromHash : (() => { const p = PRESETS.find(p => p.signature === DEFAULT); return { sig: p.signature, params: p.params || {} }; })();
applySignature(start.sig, { params: start.params, motif: start.motif, resetView: true });
editor.set(model.getSignature());
updateUndoButtons();
view.requestRender();

window.addEventListener('hashchange', () => {
  const h = readHash();
  if (h && (h.sig !== model.getSignature() || JSON.stringify(h.params) !== JSON.stringify(model.params.snapshot()))) {
    applySignature(h.sig, { params: h.params, motif: h.motif, resetView: true });
    editor.set(model.getSignature());
  }
});

// console access for checks
window.orbiscope = { model, view, highlight, editor, tool, presets: PRESETS };
window.model = model;
