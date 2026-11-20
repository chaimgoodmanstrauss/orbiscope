// Node resolve hook mirroring index.html's import map (for tests in tools/).
const SHIM = new URL('../js/shims/invlib-modules.js', import.meta.url).href;
export async function resolve(spec, ctx, next) {
  if (ctx.parentURL && spec.endsWith('modules.js')) {
    const u = new URL(spec, ctx.parentURL).href;
    if (u.endsWith('/vendor/symmhub/lib/invlib/modules.js')) return { url: SHIM, shortCircuit: true };
  }
  return next(spec, ctx);
}
