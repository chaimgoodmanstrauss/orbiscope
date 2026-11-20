// SurfaceView.js — the tidy surface the pattern folds up into, drawn as an SVG
// schematic: a sphere with handles (o), holes with mirror rims (*), crosscaps
// (x), cone points (dots with their number) and corners (ticks on a rim).
// Every part is linked to its signature character through the Highlight bus.

import * as Sig from './Signature.js';
import { KIND_COLORS } from './Highlight.js';

const W = 360, H = 260, CX = 180, CY = 122, RX = 150, RY = 100;

// stable pseudo-random placement
function rng(seed) { let s = seed * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }

export class SurfaceView {
  constructor(svg, info, model, highlight) {
    this.svg = svg; this.info = info; this.model = model; this.highlight = highlight;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.addEventListener('pointerover', e => {
      const g = e.target.closest('[data-i]');
      if (g) {
        const i = +g.dataset.i, f = this.model.featuresOfToken(i);
        this.highlight.set({ source: 'surface', tokens: [i], faces: f.faces, inner: f.inner, points: f.points });
      }
    });
    svg.addEventListener('pointerleave', () => { if (this.highlight.current?.source === 'surface') this.highlight.clear(); });
    highlight.on(h => this._lit(h));
  }

  render() {
    const T = this.model.tokens;
    const top = Sig.topology(T);
    // slots for features along an ellipse inside the blob
    const parts = [];
    T.forEach((t, i) => { if (t.kind !== 'corner') parts.push({ t, i, corners: [] }); else if (parts.length) { const s = [...parts].reverse().find(p => p.t.kind === '*'); if (s) s.corners.push({ t, i }); } });
    const n = parts.length;
    const slots = [];
    const rand = rng(n + 7);
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (2 * Math.PI * (k + 0.5)) / Math.max(n, 1) + (rand() - 0.5) * 0.25;
      const rr = n <= 1 ? 0 : 0.56;
      slots.push([CX + RX * rr * Math.cos(a), CY + RY * rr * Math.sin(a)]);
    }
    const small = n > 6 ? 0.72 : 1;

    let body = `<defs>
      <radialGradient id="sv-g" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#e5f4f1"/><stop offset="0.7" stop-color="#9ad5cc"/><stop offset="1" stop-color="#6fb8ad"/></radialGradient>
    </defs>
    <ellipse cx="${CX}" cy="${CY}" rx="${RX}" ry="${RY}" fill="url(#sv-g)" stroke="#1a1a1f" stroke-width="1.5"/>
    <path d="M${CX - RX} ${CY} A ${RX} ${RY * 0.28} 0 0 0 ${CX + RX} ${CY}" fill="none" stroke="#1a1a1f" stroke-opacity="0.18" stroke-width="1"/>`;

    parts.forEach((p, k) => {
      const [x, y] = slots[k], s = small;
      const col = KIND_COLORS[p.t.kind];
      let g = '';
      if (p.t.kind === 'o') {
        // a handle: a raised arch with its hole
        g = `<path d="M${x - 26 * s} ${y + 6 * s} C ${x - 26 * s} ${y - 30 * s}, ${x + 26 * s} ${y - 30 * s}, ${x + 26 * s} ${y + 6 * s}" fill="none" stroke="#1a1a1f" stroke-width="${11 * s}" stroke-linecap="round"/>
             <path d="M${x - 26 * s} ${y + 6 * s} C ${x - 26 * s} ${y - 30 * s}, ${x + 26 * s} ${y - 30 * s}, ${x + 26 * s} ${y + 6 * s}" fill="none" stroke="#bfe3dd" stroke-width="${8 * s}" stroke-linecap="round"/>
             <ellipse cx="${x}" cy="${y + 6 * s}" rx="${22 * s}" ry="${6 * s}" fill="#4fa397" fill-opacity="0.5" stroke="#1a1a1f" stroke-width="1"/>`;
      } else if (p.t.kind === 'x') {
        g = `<circle cx="${x}" cy="${y}" r="${15 * s}" fill="#f5e6c6" stroke="#1a1a1f" stroke-width="1.4"/>
             <path d="M${x - 10 * s} ${y - 10 * s} L ${x + 10 * s} ${y + 10 * s} M ${x + 10 * s} ${y - 10 * s} L ${x - 10 * s} ${y + 10 * s}" stroke="#9c36b5" stroke-width="2.4" stroke-linecap="round"/>`;
      } else if (p.t.kind === '*') {
        const r = 19 * s;
        g = `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.72}" fill="#fbfaf6" stroke="${col}" stroke-width="3"/>`;
        p.corners.forEach((c, j) => {
          const a = -Math.PI / 2 + (2 * Math.PI * j) / Math.max(p.corners.length, 1);
          const ex = x + r * Math.cos(a), ey = y + r * 0.72 * Math.sin(a);
          const lx = x + (r + 11) * Math.cos(a), ly = y + (r * 0.72 + 10) * Math.sin(a);
          g += `<g data-i="${c.i}" class="sv-part"><circle cx="${ex}" cy="${ey}" r="4.5" fill="${KIND_COLORS.corner}" stroke="#fbfaf6" stroke-width="1.2"/>
                <text x="${lx}" y="${ly + 4}" text-anchor="middle" class="sv-num">${c.t.n}</text></g>`;
        });
      } else if (p.t.kind === 'cone') {
        g = `<circle cx="${x}" cy="${y}" r="${10 * s}" fill="${col}" stroke="#fbfaf6" stroke-width="1.5"/>
             <text x="${x}" y="${y + 4}" text-anchor="middle" class="sv-num on">${p.t.n}</text>`;
      }
      body += `<g data-i="${p.i}" class="sv-part">${g}</g>`;
    });
    if (!n) body += `<text x="${CX}" y="${CY + 4}" text-anchor="middle" class="sv-cap">the bare sphere</text>`;
    this.svg.innerHTML = body;

    const chiOrb = new Sig.Frac(2).sub(Sig.price(T));
    const name = top.sides === 2 ? (top.handles ? `sphere with ${top.handles} handle${top.handles > 1 ? 's' : ''}` : 'sphere')
      : `sphere with ${top.crosscaps + 2 * top.handles} crosscap${top.crosscaps + 2 * top.handles > 1 ? 's' : ''}`;
    this.info.innerHTML = `
      <div><span>Euler characteristic</span><b>${top.euler}</b></div>
      <div><span>Boundaries</span><b>${top.boundaries}</b></div>
      <div><span>Sides</span><b>${top.sides}</b></div>
      <div><span>Orbifold Euler char.</span><b>${chiOrb.toString()}</b></div>
      <p class="sv-name">Underlying surface: ${name}${top.boundaries ? ` with ${top.boundaries} hole${top.boundaries > 1 ? 's' : ''}` : ''}.</p>`;
    this._lit(this.highlight.current);
  }

  _lit(h) {
    const lit = new Set(h ? h.tokens : []);
    this.svg.querySelectorAll('[data-i]').forEach(g => g.classList.toggle('lit', lit.has(+g.dataset.i)));
  }
}
