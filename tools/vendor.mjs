#!/usr/bin/env node
// Copy the SymmHub engine files Orbiscope uses into vendor/symmhub/, following
// relative `import ... from '...'` / `export ... from '...'` statements transitively.
// Usage (from orbiscope/):  node tools/vendor.mjs ["/path/to/SymmHub"]
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const SYMMHUB = process.argv[2] || '~/Archive/Programming/ orbifold webgl/SymmHub';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'vendor', 'symmhub');
const ENTRIES = ['lib/orbilib/orbilib.js', 'lib/orbilib/modules.js'];
// Engine files replaced at load time by an import map in index.html. The walker
// follows the shim's imports instead of the original's, and does not copy the original.
const SHIMS = { 'lib/invlib/modules.js': 'js/shims/invlib-modules.js' };
const VENDOR_PREFIX = path.join(ROOT, 'vendor', 'symmhub') + path.sep;

const IMPORT_RE = /(?:import|export)\s*(?:[\w*{}\s,$]*?\s*from\s*)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"])\/\/.*$/gm, '$1');

const seen = new Set();
const queue = [...ENTRIES];
while (queue.length) {
  const rel = path.normalize(queue.shift());
  if (seen.has(rel)) continue;
  seen.add(rel);
  const shim = SHIMS[rel];
  const src = fs.readFileSync(shim ? path.join(ROOT, shim) : path.join(SYMMHUB, rel), 'utf8');
  for (const m of stripComments(src).matchAll(IMPORT_RE)) {
    const spec = m[1] || m[2];
    if (!spec || !spec.startsWith('.')) continue;
    if (shim) {
      const abs = path.resolve(path.join(ROOT, path.dirname(shim)), spec);
      if (!abs.startsWith(VENDOR_PREFIX)) throw new Error(`shim ${shim} imports outside vendor: ${spec}`);
      queue.push(abs.slice(VENDOR_PREFIX.length));
    } else {
      queue.push(path.join(path.dirname(rel), spec));
    }
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
let bytes = 0;
const copied = [...seen].filter(r => !SHIMS[r]).sort();
for (const rel of copied) {
  const dst = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(path.join(SYMMHUB, rel), dst);
  bytes += fs.statSync(dst).size;
}
const git = c => { try { return execSync(`git -C "${SYMMHUB}" ${c}`).toString().trim(); } catch { return '?'; } };
fs.writeFileSync(path.join(ROOT, 'vendor', 'SOURCE.md'),
`# Vendored SymmHub engine

- Source: \`${SYMMHUB}\`
- Branch: \`${git('branch --show-current')}\`
- Commit: \`${git('rev-parse HEAD')}\`${git('status --porcelain -- lib') ? ' (working tree had uncommitted changes under lib/)' : ''}
- Copied: ${new Date().toISOString().slice(0, 10)} — ${copied.size ?? copied.length} files, ${(bytes / 1024).toFixed(0)} KB
- Entries: ${ENTRIES.map(e => '`' + e + '`').join(', ')} (and everything they import, transitively)
- Re-run: \`node tools/vendor.mjs\` from \`orbiscope/\`

Do not edit these files; adapt in \`js/\` instead.

Shimmed (not copied; index.html's import map redirects them):
${Object.entries(SHIMS).map(([a, b]) => '- `' + a + '` → `' + b + '`').join('\n')}

## Files
${copied.map(f => '- ' + f).join('\n')}
`);
console.log(`${copied.length} files, ${(bytes / 1024).toFixed(0)} KB -> ${OUT}`);
