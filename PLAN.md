# Orbiscope — implementation plan

Follow this plan phase by phase. Each phase ends with a check you must pass before moving on.
Do not touch git (no commits, staging, branches). Never edit SymmHub; if you think a vendored
engine file must change, write the reason in `NOTES.md` first.

- **This project:** `~/Archive/Programming/claude-code-sessions/orbiscope/` (its own
  git repo, sitting alongside the other apps in `claude-code-sessions`). All paths below are relative to it
  unless they start with `SymmHub/`.
- **SymmHub** (engine source, read-only): `~/Archive/Programming/ orbifold webgl/SymmHub`
  — the path has a **leading space** in ` orbifold webgl`; always quote it. Below, `SymmHub/…`
  means a path inside it.

---

## 1. Goal

A single-page, browser-only orbifold explorer that combines:

| From | Take |
|---|---|
| **spacesheep "Classification of Surfaces"** (reference) | Clean, calm layout; a signature you edit as a line of characters; a "price" bar for the Magic Theorem (sphere / plane / hyperbolic zones); tap/hover a character and its feature lights up in the pattern *and* on the surface; teal/sand tiles printed with commas; short captions with book page references; collapsible `<details>` explanations; example presets with one-line captions. |
| **SymmHub orbifold engine** (`SymmHub/lib/orbilib`) | Any orbifold signature, not just a fixed list; continuous geometry changes — hyperbolic edge **lengths and twists**, Euclidean **lattice shape**; Möbius navigation of the pattern; WebGL rendering of the tiling. |

**No dat.gui anywhere.** Every parameter is changed by hovering and dragging the feature itself
(edges, cone points, corners, signature characters). **No server-side code**: static files only,
no PHP, no API calls, no `fetch` of anything that isn't a static file shipped with the app.

## 2. Reference material — study before coding

1. **Reference page.** Download it into a gitignored folder and read it (it is one self-contained
   HTML file with inline JS/CSS, MathJax pre-rendered as SVG):
   ```sh
   mkdir -p _reference   # already in .gitignore
   curl -sL -o _reference/surfaces.html \
     https://fb0e1499-d0f0-427a-b589-faa17083353c.spacesheep.app/v/96378069837a/
   ```
   It is someone else's work: study the layout and interaction, **do not copy its code, text or
   art**. Write our own. What to notice:
   - DOM: `header` with tabs → `main` with two `section.pane`s (2D pattern canvas, 3D surface
     canvas) → `aside.side` with per-tab panels (`data-tab-only="…"`) and `<details class="fold">`
     explanations.
   - Signature editor (`#sym-cells`): characters as cells, ‹ › to step through examples, − / + to
     change the selected number, chips to add `o`, a cone digit, `*`, a corner digit, `x`, and a
     delete chip. Keyboard: type `o 2–9 * x`, Backspace, arrows, Enter = canonical order.
   - Price bar (`.cost-rail`, `.cost-bar`, `.cost-zones`): running Magic Theorem cost against
     zones "under $2 sphere / $2 plane / over $2 hyperbolic". Message for bad orbifolds
     (`N`, `MN`, `*N`, `*MN` with M≠N): "No pattern has this signature."
   - Palette: ink `#1a1a1f`, muted `#52514a`; teal `#9ad5cc`/`#4fa397` (front, direct copies),
     sand `#f5e6c6`/`#d8bd85` (back, mirror images); red for mirror edges; same-colour edges with
     matching arrowheads = glued pairs.
   - Raw WebGL2 + Canvas2D, no framework. Pointer events everywhere (works with touch).
2. **SymmHub engine.** Read, in this order (all under `SymmHub/`):
   - `lib/orbilib/orbilib.js` (public exports) and `lib/orbilib/modules.js`.
   - `lib/orbilib/WallPaperGroup_General.js` — `updateTheGroup()`, `getParamsMap()/setParamsMap()`,
     `rebuildGui()`, `groupParamsChanged()`; param names are `<key>_<n>_l` (length) and
     `<key>_<n>_t` (twist); ranges `LENGTH{MIN,MAX}VALUE` = 0.3 to 4, `TWIST{MIN,MAX}VALUE` = −0.5 to 0.5.
   - `lib/orbilib/OrbifoldGeometrization.js` — `hashOrbifoldString`, `atomizeOrbifold`,
     `unfoldAtom`, `assembleFundamentalDomain`, `produceGenerators`; `keys`, `lengthKeys`,
     `twistKeys` (lines ~46–53).
   - `lib/orbilib/OrbifoldUITool.js` — the hover/drag/wheel editor this app's interaction is
     built from (hit-testing FD edges, `setShift` anchoring so the grabbed point stays put).
   - `lib/symhublib/OrbifoldEdgeGLRenderer.js` — exact, antialiased FD edges + interior in GL.
   - `lib/orbilib/WallpaperGroups_NonNegative.js` — spherical/Euclidean groups;
     `iWallpaperGroup` takes lattice params `a, b, c, angle_a, angle_b`.
   - `apps/sympix/js/sympix_orbifold.js` — how the current app wires `SymRenderer`,
     `InversiveNavigator`, `Group_Orbifold`. Run it (see §8) and play with it.
   - `apps/orbifold/uinotes` — the original intended mouse UI (hover highlights, wheel changes
     length/twist, click a cone point to bump it, drag moves texture).

## 3. Key facts about the engine you must work around

- **dat.gui is load-bearing today.** `OrbifoldUITool.applyParamValue()` changes a parameter by
  calling `wg.paramGuiFolderItems[ls].setValue(v)` — a dat.gui controller. `Group_Orbifold`
  hides this behind a mock folder. You will replace it with a headless **ParamStore** (§5.2);
  do not render any dat.gui.
- **On-canvas editing is hyperbolic-only.** `OrbifoldUITool.isActive()` requires
  `wg.curvature < 0`. Spherical groups are rigid (no continuous params, only view rotation);
  Euclidean groups have lattice params that the current UI exposes only via sliders — you add
  on-canvas handles for them (§5.5).
- **Edge labels are `[key, index]`** (e.g. `["tube", 1]`), from `unfoldAtom`. There is no map
  from an edge back to the signature character that produced it. You must build one (§5.4).
- Presets live as JSON under `SymmHub/apps/sympix/presets/orbifold/` and `SymmHub/apps/orbifold/presets/`.
  Ship ours as a JS module (`presets.js`) so nothing needs `fetch`.

## 4. Deliverable layout

```
orbiscope/
  vendor/symmhub/       copied engine files, same layout as SymmHub (lib/orbilib, lib/invlib, …)
  vendor/SOURCE.md      SymmHub branch + commit copied from, and the copy command
  index.html            page skeleton, all CSS inline or in css/orbiscope.css
  css/orbiscope.css
  js/main.js            boot, wiring, tab switching
  js/ParamStore.js      headless replacement for dat.gui controllers
  js/OrbifoldModel.js   signature → group, params, feature map; emits 'change'
  js/SignatureEditor.js character cells, chips, keyboard, price bar
  js/PatternView.js     WebGL tiling canvas (reuse SymRenderer pieces or a slim renderer)
  js/FeatureTool.js     hover / drag / wheel / click on FD edges, cones, corners, lattice
  js/SurfaceView.js     the folded-surface picture (§5.7)
  js/Highlight.js       one shared "currently highlighted feature" bus
  js/presets.js         examples with captions
  js/textures.js        comma motif generator (teal/sand)
  project.json          gallery registration, "live": false
  NOTES.md              your running notes / open questions
```
The app must be self-contained (it deploys on its own to chaimgoodmanstrauss.com), so it imports
the engine from `vendor/symmhub/lib/...`, never from the SymmHub folder.

## 5. Phases

### Phase 0 — Boot a blank page
- `index.html` with header (title + tabs: **Pattern**, **Surface**, **Examples**), `main` with
  `#pattern` canvas and `#surface` canvas side by side (stacked below 760px), `aside` for panels.
- CSS: palette tokens on `:root`; light theme only is fine for v1. 16px side gutters; no
  horizontal scroll at 375px width.
- `project.json` already exists (`"live": false`); leave it.
- **Vendor the engine:** copy from SymmHub into `vendor/symmhub/`, keeping relative paths, only the
  files actually reachable by `import` from the modules you use (start with `lib/orbilib/orbilib.js`
  and `lib/symhublib/OrbifoldEdgeGLRenderer.js`; add `SymRenderer.js` etc. only if Phase 2 reuses
  it). Write a small script `tools/vendor.mjs` that follows `import … from` statements
  transitively and copies each file, so it can be re-run when SymmHub changes. Do **not** copy all
  of `SymmHub/lib/symhublib` (32 MB). Record branch + `git rev-parse HEAD` in `vendor/SOURCE.md`.
- **Check:** page loads from a static server with zero console errors.

### Phase 1 — OrbifoldModel + ParamStore (no rendering)
1. `ParamStore`: `{ get(name), set(name, v), has(name), names(), onChange(cb) }`, clamps to the
   ranges in §2, wraps twist into its range like `OrbifoldUITool.onParamDrag` does.
2. Make `WallPaperGroup_General` run headless: give it a fake folder whose `add(obj, key)`
   returns a controller object backed by ParamStore (`setValue` writes `obj[key]` and calls the
   registered `onChange`), and populate `wg.paramGuiFolderItems` from it. Study
   `Group_Orbifold.makeMockFolder()` and `rebuildGui()` to see exactly what is called. Put this
   adapter in `OrbifoldModel.js`, not in `vendor/`.
3. `OrbifoldModel`: `setSignature(str)`, `getSignature()`, `canonical()`, `price()` (Magic
   Theorem cost as an exact fraction), `curvature()` (−1/0/+1), `isBad()` (the four bad
   families), `params` (ParamStore), `group()` (the generated group / FD), and an event
   `'change'` fired on any edit.
- **Check:** in the browser console, `model.setSignature('*2223')`, then
  `model.params.set('cornerPair_1_l', 1.5)` changes `model.group()` FD splanes; `'*532'` has
  curvature +1 and no params; `'2222'` has curvature 0; `'23'` is bad.

### Phase 2 — Pattern view
- Render the tiling with WebGL. Preferred: reuse `SymRenderer`'s pattern pipeline and
  `InversiveNavigator` exactly as `sympix_orbifold.js` does, but pass a `menuBuilder` that builds
  nothing and never instantiate dat.gui (check how `SymRenderer` creates its GUI; if it can't be
  suppressed without editing vendored files, write a slim renderer that feeds the group's generators /
  FD into the same fragment-shader code path — record which in NOTES.md).
- Texture: `textures.js` draws commas (a shape with no symmetry) on a transparent canvas;
  tiles from direct isometries tinted teal, from reverse isometries sand (the shader already
  knows orientation parity per tile — find it; if not, compute parity from the generator word).
- Draw the FD with `OrbifoldEdgeGLRenderer` (edges + translucent interior), and colour edges by
  role: mirror = red; glued pairs share a colour and an arrowhead count.
- Navigation: drag on empty pattern = Möbius pan (navigator); wheel on empty area = zoom;
  `0`/Home resets. Hyperbolic: Poincaré disk. Spherical: stereographic with drag-to-rotate.
- **Check:** `*632`, `*2223`, `432`, `xx`, `2*22`, `o`, `*532` all render; panning works.

### Phase 3 — Signature editor + price bar
- `SignatureEditor` renders the signature as cells (`o`, digits, `*`, `x`), one selected.
  Chips: add handle `o`, add cone, add `*`, add corner (only after a `*`), add `x`, delete.
  − / + change the selected digit (2..∞; allow a large cap like 99; show ∞ as a cell too if the
  engine supports it, else omit). ‹ › step through presets. Keyboard as in §2.1. Enter or a
  "usual order" chip rewrites to canonical order.
- Price bar: one segment per character, coloured by kind, lengths = its cost; a $2 tick; label
  the zone (sphere / plane / hyperbolic) and, for the sphere, the number of symmetries
  `2 / (2 − price)`. Show "No pattern has this signature" for bad ones and keep the last good
  pattern dimmed.
- Every edit calls `model.setSignature`; views update on `'change'`.
- **Check:** typing `*2223` key by key never throws; stepping 3→4→5 on `*23N` moves the bar
  across the $2 line and the pattern switches geometry.

### Phase 4 — Hover-driven parameter editing (replaces dat.gui)
`FeatureTool` owns all pointer input on the pattern canvas. Base it on `OrbifoldUITool`
(copy and adapt into `js/`, keep its `setShift` anchoring logic).

| Feature under pointer | Hover shows | Drag | Shift-drag | Wheel | Click |
|---|---|---|---|---|---|
| FD edge with a length param (hyperbolic) | yellow thick edge + tooltip `length 1.42` | change length | change twist (if `twistKeys`) | ±length (shift: twist) | — |
| Cone point | ring + tooltip `cone 3` | — | — | ±order | +1 (alt-click −1) |
| Corner point | wedge + tooltip `corner 2` | — | — | ±order | +1 (alt-click −1) |
| Euclidean lattice handle (two translation vectors from the FD corner) | arrow handles | move vector tip (keeps the group's constraints: square/hex lattices are rigid, rectangular has one free ratio, oblique has two) | — | scale | — |
| Empty pattern | nothing | pan | — | zoom | — |

- Changing a cone/corner order rewrites that digit in the signature (through the editor, so the
  price bar and undo see it).
- Tooltips: small, ink on paper, follow the pointer, never cover the grabbed point.
- Touch: long-press = hover; one-finger drag on a feature = drag; pinch = zoom.
- Undo/redo (Ctrl/Cmd-Z, Shift-Ctrl/Cmd-Z) over signature + params.
- **Check:** on `*2223` and `2223`, hovering each edge highlights exactly one edge; dragging it
  reshapes the tiling continuously while the grabbed point stays under the pointer; on `*632`
  nothing is draggable except panning; on `2222` the lattice handles reshape the tiling.

### Phase 5 — Linked highlighting (signature ↔ pattern ↔ surface)
- Build a **feature map** in `OrbifoldModel`: for each signature token (index into the string)
  the list of FD edges / vertices / surface parts it produced. Do this by instrumenting the
  model's own copy of the atomization: after `hashOrbifoldString`, record which token each
  cone/kaleidoscope/handle/crosscap came from, then follow it through `atomizeOrbifold` →
  `unfoldAtom` labels (`["slice",n]`, `["tube",n]`, `["handle",n]`, …). If an intermediate
  edge (slice/tube) belongs to two tokens, map it to both. Write the mapping logic in
  `js/`, calling engine functions; do not change `vendor/`.
- `Highlight` bus: `set({kind, token, edges})` / `clear()`; every view listens.
- Hovering a signature cell → its edges/points glow in the pattern (all copies, via the shader
  or by drawing the FD feature's images under the first few generator words) and its part of the
  surface lights up. Hovering a pattern feature → its signature cell lights up. Same colours as
  the price bar.
- **Check:** on `3*2x`, hovering `3` lights the gyration point, `*2` the mirror and corner,
  `x` the miracle; and back again from the pattern.

### Phase 6 — Surface view
Start simple, upgrade only after everything else works.
1. **v1 (required): tidy-surface schematic, SVG.** A sphere drawn as a rounded blob with
   `o` handles, `*` holes (boundary circles, red), `x` crosscaps (circle with a cross), cone
   points as dots with their number inside, corners as ticks on the hole rims. Placement is
   arbitrary but stable (seeded by index). Euler characteristic, boundaries, sides shown under it.
   Linked to the Highlight bus.
2. **v2 (stretch): 3D.** WebGL2 mesh of the tidy surface built procedurally (connect-sum of
   tori for handles, discs removed for holes, cross-cap = a Steiner-style or Möbius patch).
   Drag to turn, scroll to zoom, double-tap resets. Do not attempt "folding the tile into the
   surface" animation in this plan.
- **Check:** `o`, `xx`, `*`, `**`, `*x`, `2*22`, `o*` give the right counts (χ, boundaries,
  one/two-sided) — compare with the reference page's Tidy-surfaces tab.

### Phase 7 — Text and examples
- `presets.js`: ~20 examples, each `{signature, params, view, caption, page}` — cover all 17
  wallpaper groups' families plus the spherical families, plus hyperbolic `*2223`, `*334`,
  `2223`, `3333`, `23x`, `o2`, `xx2`, `*532`… (port params from the JSON presets listed in §3).
- Captions: one or two plain sentences each, our own words, with a "p. NN" pill linking to the
  page in *The Symmetries of Things* where relevant (look the page up; if unsure, omit it).
- `<details>` folds under the side panel: "What the characters mean", "The Magic Theorem",
  "What you can drag". Keep each under ~120 words.
- **Check:** every preset loads and renders; no caption overflows at 375px.

### Phase 8 — Polish and offline check
- Keyboard focus rings; `aria-label` on canvases and chips.
- Resize handling (devicePixelRatio, max 2); WebGL context-loss message.
- URL hash stores signature + params (`#*2223&cornerPair_1_l=1.5`) so a state can be shared;
  load from hash on boot.
- Confirm no network requests except same-origin static files (DevTools → Network).
- Optional: an `esbuild` bundle into one `orbiscope.html` that also opens from `file://`.

## 6. Out of scope
Image upload / photo textures, colour symmetry, recording/export of video, the "Zippers" and
"Zip it up" proof animations of the reference page, dark theme, any server code, any dat.gui.

## 7. Rules for the implementer
- Keep `NOTES.md` current: decisions, anything you could not do, open questions. When an item
  is resolved, move it from "Open" to "Decisions".
- Never edit `vendor/` or SymmHub; adapt by wrapping or by copying a file into `js/` with a
  header comment saying where it came from.
- After each phase run the phase's check in a real browser and record the result in NOTES.md.
- No git operations.

## 8. Running it
From `orbiscope/`: `python3 -m http.server <random 5-digit port>` then open it in a Chrome incognito
window to avoid cache: `open -na "Google Chrome" --args --incognito http://localhost:<port>/`.
The existing app for comparison: serve `SymmHub/` the same way (from its root) and open
`/apps/sympix/sympix_orbifold.html`.
