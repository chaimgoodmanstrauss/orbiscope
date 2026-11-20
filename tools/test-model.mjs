// node --import ./tools/register.mjs tools/test-model.mjs
import { OrbifoldModel } from '../js/OrbifoldModel.js';
const m = new OrbifoldModel();
const sigs = process.argv.slice(2).length ? process.argv.slice(2) :
  ['*2223','2223','*632','2222','o','*532','23','xx','3*2x','*334','432','2*22','x','*','','22x','x*','**','*22','33','2*3','3*2','*2222','442','4*2','333','3*3','632','o2','xx2','23x','3333'];
for (const s of sigs) {
  const t0 = performance.now();
  m.setSignature(s);
  const g = m.geo, dt = (performance.now() - t0).toFixed(0);
  if (m.isBad()) { console.log(JSON.stringify(s), 'BAD', m.error, 'price', m.price().toString()); continue; }
  console.log(JSON.stringify(s), g.mode, `price ${m.price()}`, `${dt}ms`, 'params', m.params.names().join(','),
    '\n   faces', g.faces.map(f => `${f.kind}${f.pair ?? ''}[${f.tokens}]`).join(' '),
    '\n   points', g.points.map(p => `${p.kind}${p.n}[${p.tokens}]`).join(' '),
    '\n   comma', g.comma.c.map(x => x.toFixed(3)).join(','), g.comma.size.toFixed(3), 'handles', g.handles.map(h => h.id).join(','));
}
m.setSignature('*2223');
const before = JSON.stringify(m.geo.faces[0].wall);
m.params.set('cornerPair_1_l', 1.5);
console.log('cornerPair change moves walls:', before !== JSON.stringify(m.geo.faces[0].wall), m.curvature());
