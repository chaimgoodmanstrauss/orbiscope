# Vendored SymmHub engine

- Source: `~/Archive/Programming/ orbifold webgl/SymmHub`
- Branch: `sympix-orbifold2`
- Commit: `004327efdb59358adf105f3574fee5aa1fd62568`
- Copied: 2026-11-17 — 26 files, 298 KB
- Entries: `lib/orbilib/orbilib.js`, `lib/orbilib/modules.js` (and everything they import, transitively)
- Re-run: `node tools/vendor.mjs` from `orbiscope/`

Do not edit these files; adapt in `js/` instead.

Shimmed (not copied; index.html's import map redirects them):
- `lib/invlib/modules.js` → `js/shims/invlib-modules.js`

## Files
- lib/invlib/CSSColors.js
- lib/invlib/CanvasTransform.js
- lib/invlib/ComplexArithmetic.js
- lib/invlib/EventProcessor.js
- lib/invlib/Globals.js
- lib/invlib/Group.js
- lib/invlib/GroupUtils.js
- lib/invlib/IDrawing.js
- lib/invlib/ISplane.js
- lib/invlib/ITransform.js
- lib/invlib/IdentityWorldTransform.js
- lib/invlib/Inversive.js
- lib/invlib/LinearAlgebra.js
- lib/invlib/ObjectId.js
- lib/invlib/PlaneNavigator.js
- lib/invlib/SpatialHashMap.js
- lib/invlib/U4.js
- lib/invlib/Utilities.js
- lib/orbilib/Group_Orbifold.js
- lib/orbilib/OrbifoldGeometrization.js
- lib/orbilib/OrbifoldUITool.js
- lib/orbilib/WallPaperGroup_General.js
- lib/orbilib/WallpaperGroups_NonNegative.js
- lib/orbilib/distancetable45.js
- lib/orbilib/modules.js
- lib/orbilib/orbilib.js
