# Coding Standards, Idioms & Architectural Style (Deduced from Code)

Observed conventions, inferred from consistent repetition across the codebase rather
than from any written style guide (none exists in the repo besides `eslint.config.js`).

## 1. Module-state-as-closure, not classes

Every stateful module (`phase.js`, `simulation.js`, `environment.js`, `input.js`) is a
plain ES module using top-level `let _privateVar` variables plus exported functions
that close over them — never a class, never an exported mutable object. Private
module state is always prefixed with a leading underscore (`_state`, `_bumps`,
`_renderer`, `_readTarget`, `_video`, `_ready`, ...). Public functions have no prefix.
This is a hard convention: there is not one exported `_`-prefixed name and not one
un-prefixed internal variable anywhere in `src/`.

Consequence for testing: since state lives in closures, not instances, tests reset it
via `vi.resetModules()` + dynamic re-`import()` rather than constructing a fresh
object per test (see `tests/phase.test.js`, `tests/input.test.js`).

## 2. Constants: hoisted, named, and commented with *why* not *what*

Every tunable numeric value is a top-of-file `UPPER_SNAKE_CASE` constant, never an
inline magic number in the logic below it. Comments on these constants consistently
explain the *reasoning* — why this value, why this shape of decay, why it's fixed
instead of derived — not what the constant is used for (that's implied by the name).
Examples of the pattern (not exhaustive): `phase.js`'s `LEAD`/`*_SIGMA`/`BURST_HOLD`
block, `positionChunk.js`'s force constants, `colorChunk.js`'s worley/key-light
tuning block.

`constants.js` enforces an explicit cross-file rule, stated in its own header
comment: values shared by *more than one file* live there; anything used by exactly
one file stays local to it. This rule is followed consistently — no shaderChunk
duplicates a numeric literal that's also defined in another file's local constants
unless it's genuinely independent tuning (e.g. `shapeChunk.js`'s own `CLUSTER_SMIN_K`
is local because only that file needs it, despite looking similar to shared values).

## 3. GLSL-in-JS: template literals with a documented ad hoc module contract

GLSL source lives as JS template-literal strings (`export const xChunk = \`...\``),
concatenated by the composing `shaders/*.js` files rather than using a `#include`
preprocessor. Because GLSL itself has no visibility modifiers, the convention
substitutes:

- A file-header comment stating `// Public GLSL: name1, name2, ...` and
  `// Precondition: ...` for anything the chunk assumes is already in scope
  (uniforms, other chunks' functions).
- Leading-underscore function/variable names *inside the GLSL source itself*
  (`_fade`, `_hash1`, `_grad`, `_clusterCylinder`, `_envKeyLight`, `_D_GGX`, ...) to
  mark GLSL helpers as private to that chunk, mirroring the JS closure convention
  exactly, despite GLSL having no actual encapsulation to enforce it.
- Cross-language constant sharing goes through `glslFloat()`/`glslVec3()`
  (`constants.js`) rather than ever hand-writing a JS number into a GLSL `float`
  context — this exists specifically because `String(1.0) === '1'` in JS is invalid
  GLSL ES 1.00 float syntax; every numeric interpolation into a `float`/`vec3` slot in
  a shader chunk goes through one of these two helpers.

## 4. "Compute raw, blend centrally" — the repeated compositional pattern

The single most consistent architectural idiom in the codebase: whenever three
phase-specific behaviors need to combine into one output, each phase function
returns its own complete, *unweighted* contribution, and exactly one caller applies
the `clusterBlend`/`metaballBlend`/`burstBlend` weights and sums them. This shape
recurs independently in at least four places, each commented as deliberately
following the same pattern as the others:

- `shapeChunk.js`'s `map(p)` sums `clusterSDF`/`metaballSDF`/`burstSDF`.
- `surfaceChunk.js`'s `shadeHit(p,n,rd)` sums `shadeCluster`/`shadeMetaball`/`shadeBurst`.
- `colorChunk.js`'s `moodColor()`/`blendEnvironment(uv)` sum `MOOD_*`/`env*` per phase.
- `positionChunk.js`'s `applySimulation(...)` sums `_simulateCluster`/`_simulateMetaball`/
  `_simulateBurst`'s raw deltas, weighted at the force level before accumulating into
  `vel`/`pos`.

The corollary rule, also stated explicitly in comments: **no hard switches on phase
identity outside `phase.js`'s own private `_state`.** Nothing downstream of
`getWeights()` ever branches on "which phase is active" — only on the continuous
weight values. `phase.js` itself is the one exception, and it is structured so that
`_state` is read/written exclusively inside `_scheduleTick` and is not a parameter
anywhere else — `_evaluateWeights(t_now, bumps)` is pure and structurally cannot see
`_state`.

## 5. Factories over runtime branches, when the choice is compile-time-static

Where a variant genuinely cannot change per-frame without a shader recompile anyway
(the Cluster shape variant), the code makes that explicit by using a JS factory
function that returns a *different generated GLSL string* per call
(`shapeChunk(clusterVariant)`, `buildMainFrag(clusterVariant)`) rather than adding a
runtime `uniform int` branch inside the shader. The six shape-variant combinations
themselves are each written as one small, non-branching GLSL function
(`clusterCylinderFull`, `clusterSphereIntersect`, etc.) that only composes shared
helpers — no shape function contains an `if`.

## 6. Lifecycle-function naming convention

GPU-resource-owning modules share one exact 4-shape lifecycle, used consistently
across `simulation.js`/`environment.js` (and mirrored partially by `input.js`/
`audio.js`/`camera.js` even where some functions are stubs):

```
init<Name>(dependency)      // one-time setup, takes external deps as params (renderer)
<verb>()                    // per-frame work (stepSimulation, updateInput, updateCamera, updateAudio)
getUniformDefs()            // (only for material-uniform-owning modules)
applyStateToMaterial(mat)   // (only for material-uniform-owning modules)
```

This lets `main.js` treat every module identically at the call site without needing
per-module special-casing — it's a convention rather than an enforced interface
(no shared base class/type), but zero deviations from it exist in `src/`.

## 7. Comment style: rationale-heavy, anti-restatement

Comments across the codebase consistently avoid describing *what* a line does (which
is left to naming) and instead record *why* — a rejected alternative, a past bug, a
non-obvious invariant, or a derivation. Recurring phrasings: "-- not X, because Y",
"was a bug: ...", "see Git-Historie" / "previous design" style regression notes, and
explicit call-outs of self-limiting/self-correcting behavior (e.g. `_simulateMetaball`
"self-limits to ~0 once the ball is on the orbit"). Several files carry a short header
comment block up front stating their public surface and preconditions in prose (see
Interfaces doc, §3) instead of scattering that context across individual functions.

## 8. Formatting idioms

- Consistent vertical alignment of `:`/`=`/`from` across adjacent lines in object
  literals and import blocks (visible throughout `main.js`, `constants.js`,
  `gpuSetup.js`, every shaderChunk's uniform block) — a manual/deliberate style, not
  produced by a formatter run (no Prettier config exists in the repo).
- Two-space indentation throughout, both JS and the embedded GLSL strings.
- GLSL inside template literals is written and indented as if it were a normal
  standalone `.glsl` file (comments, constant blocks, blank-line section dividers with
  `// ── section ──` banners), not squeezed to save JS characters.
- Section-divider comments (`// ── metaball initial state ──...`) are used inside
  larger single-purpose files (`constants.js`, `phase.js`, GLSL chunks) to group
  related constants/functions, in lieu of splitting into more files.

## 9. Linting & test conventions

- `eslint.config.js` scopes its ruleset to `src/**/*.js` and `main.js` only — shaders,
  shaderChunks, and tests are excluded from lint, consistent with them being either
  generated-string GLSL (not real JS syntax rules apply) or test files with their own
  conventions.
- Enabled rules are minimal and safety-oriented: `eqeqeq`, `no-var`,
  `no-unused-vars` (with `args: 'none'`, i.e. unused function *parameters* are allowed
  — consistent with the many stub functions like `updateCamera(camera)` that
  intentionally ignore their argument).
- Tests (`tests/*.test.js`) are written with German `describe`/`it` prose despite the
  rest of the codebase (identifiers, comments) being English — the test *descriptions*
  document behavior in natural language for a German-speaking audience, while code
  identifiers stay English throughout.
- Tests favor behavioral/black-box assertions over implementation inspection: e.g.
  `tests/phase.test.js` never reads `_state`/`_bumps` directly (they're not exported),
  only observes `getWeights()`/`getMotionSpeed()`/`getTime()`/`onPhaseTransition`
  callbacks — consistent with the closure-privacy convention in §1.
- Mocking browser APIs is done via `vi.spyOn`/`vi.doMock` at the prototype or module
  level (`HTMLCanvasElement.prototype.getContext`, `navigator.mediaDevices`) rather
  than dependency injection — a consequence of `src/input.js` calling browser globals
  and other modules directly instead of receiving them as constructor arguments.

## 10. Dependency direction

Shared/leaf modules never import upward: `constants.js` and `noiseChunk.js` import
nothing from the rest of the codebase. `gpuSetup.js` depends only on Three.js and
`vertexChunk.js`. `phase.js` depends only on `constants.js` (for `FRAME_TIME_STEP`)
and has zero knowledge of rendering, GPU state, or input — it is the most "core"
module, imported by three others but importing almost nothing itself. Cross-module
side-effect calls (`reportMotion`, `onInput`) flow strictly from
input-detecting/leaf-adjacent modules toward `phase.js`/`camera.js`, never the reverse.
