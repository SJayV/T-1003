# Coding Standards — T-1003

Organized into three levels, from smallest to largest scope:

- **Idioms** — local, language-level conventions applied at the level of a single symbol or statement (naming, comments, one function body).
- **Patterns** — recurring solution shapes reused across multiple modules (a contract two+ files implement, a factory, an injection mechanism).
- **Architectural Styles** — system-wide structural decisions that shape how the whole codebase is organized.

---

## Idioms

### Naming

| Scope | Convention | Example |
|---|---|---|
| JS private module-level symbols (vars + functions) | `_camelCase` | `_renderer`, `_firstFrame`, `_makeTarget`, `_enterState` |
| JS public exports | `camelCase` | `initSimulation`, `getWeights` |
| JS module constants | `SCREAMING_SNAKE_CASE` | `BALL_COUNT`, `BURST_MIN_FRAMES` |
| GLSL internal helpers | `_camelCase` | `_envUV`, `_hash2`, `_computeCentroid` |
| GLSL public chunk functions | `camelCase` | `orbitPoint`, `shadeHit`, `perlin2D` |
| GLSL uniforms | `camelCase`, matches JS side | `burstBlend`, `motionSpeed` |
| GLSL tunable constants | `SCREAMING_SNAKE_CASE` | `ORBIT_SNAP_RATE`, `VEL_DECAY_BURST` |
| Files | `camelCase.js` | `gpuSetup.js`, `noiseChunk.js` |

Underscore prefix marks all private module-level symbols: `let` state, `const` helpers, and unexported `function` declarations. It does not apply to block-scoped locals inside a function body.

### Extracting tunable constants

Any numeric literal that encodes an artistic or behavioral tuning decision — a force, a rate, a blend weight, a frequency, a threshold — gets hoisted into a `SCREAMING_SNAKE_CASE` constant named for its *intent*, not its value (`BURST_FALLOFF`, not `THREE_POINT_TWO`). In JS this is a module-level `const`; in GLSL, a `const` declared at the top of the function that uses it (matching the existing local-`const` idiom already used in `reflectBounds`'s `BX`/`BY`/`BZ`). This keeps every dial in one place, named, and grep-able for experimentation — the point isn't just readability, it's making the file itself the control panel.

**Leave inline** (do not manufacture a name):
- Mathematical necessities whose value is fixed by the algorithm, not by taste — a `0.5` texel-center offset, a finite-difference epsilon required for correctness, a `min(..., 0.001)` divide-by-zero guard.
- Normalization divisors tied directly to a literal count in the same expression (`sum / 5.0` for 5 samples).
- Universally-named mathematical constants (`PI`) and standards with an established name in the literature (Rec. 709 luma weights — these *do* get named, since the standard itself supplies the name: `LUMA_WEIGHTS`).
- Noise-hash decorrelation seeds (`127.1`, `311.7`, `43758.5453...`) — arbitrary by design; naming them would imply a meaning they don't have. Leave a one-line comment identifying the idiom instead (see `noiseChunk.js`).

When the same conceptual constant is needed in more than one file — whether two JS modules or a JS module and a GLSL chunk/shader interpolating it into its template-literal source — define it once in `src/constants.js` and import it everywhere it's used (see [Shared cross-file constants](#shared-cross-file-constants)). Reach for a `// must match X in Y` comment only where the value can't be interpolated (e.g. it's derived differently on each side, as with `INIT_ANGULAR_RATE_SCALE` vs. `ORBIT_OMEGA_SCALE`, which are deliberately different approximations, not the same constant).

### Comments

- Write only **why-comments**: hidden constraints, non-obvious invariants, workarounds for specific bugs.
- Do not comment *what* the code does — well-named identifiers do that.
- No section-divider lines (`// ── section ──`) in JS files.
- GLSL: section headers are acceptable for major blocks; precondition comments on chunk entry points are required.

### GLSL loop unrolling

WebGL1 (GLSL ES 1.00) requires loop bounds to be constant expressions to unroll a `for` loop. Declare a `const int` for the bound (e.g. `const int BALL_COUNT = 12;`) rather than a bare literal — this both documents intent and matches the SCREAMING_SNAKE_CASE constant convention above.

---

## Patterns

### Module contract: `getUniformDefs()` / `applyStateToMaterial()`

Each JS module owns its uniforms end-to-end:
- `getUniformDefs()` → initial `{ key: { value } }` object for `ShaderMaterial.uniforms`
- `applyStateToMaterial(material)` → updates uniforms each frame

`main.js` spreads these defs at setup and calls `applyStateToMaterial` each frame — it never touches individual uniform keys.

Stubs for planned modules (`audio.js`, `camera.js`) define the interface but leave the body empty. When implemented, they follow the same pattern.

### Direct import of shared phase state

Phase values (`getWeights()`, `motionSpeed`) are read **directly from `phase.js`** inside each consuming module (`simulation.js`, `environment.js`, and the equivalent GLSL uniforms). They are not passed as function arguments through `main.js`. See [Architectural Styles](#architectural-styles) for the tradeoff this implies.

### GPU fullscreen-quad factory

All fullscreen quad passes use `makeGpuSetup(material)` from `gpuSetup.js`. No ad-hoc `Scene`/`Camera` pairs elsewhere.

Render target types: `FloatType` for simulation state; `HalfFloatType` for post-processing.

### GLSL chunk injection

Chunk files (`shaderChunks/`) export a single template-literal string injected via `${chunk}` into the enclosing shader. The chunk assumes the uniform declarations and helper functions of that shader are already in scope. Since chunks are concatenated into one GLSL compilation unit, top-level `const` names declared by one chunk must not collide with names declared by another chunk or shader in the same file — check before adding a new global constant.

Document required preconditions (uniforms, functions) at the top of each chunk string.

### Shared cross-file constants

`src/constants.js` is the single source of truth for constants needed in **more than one file**. A JS module imports and uses the value directly; a GLSL chunk/shader imports it and interpolates it into its template-literal source (`` const int BALL_COUNT = ${BALL_COUNT}; ``), turning it into a compiled-in literal. A constant used in only one file stays local to that file — do not preemptively move things here "just in case." This mirrors how `moodChunk.js` already centralizes the phase colors for its multiple GLSL consumers, extended across the JS/GLSL boundary.

**Gotcha — always use `glslFloat(n)` when interpolating a number into a `float` context.** JS stringifies whole numbers without a decimal point (`` `${1.0}` === '1' ``), but GLSL ES 1.00 requires a decimal point on `float` literals; `const float x = 1;` is a type error on strict validators (ANGLE on Windows enforces this — other drivers may silently tolerate it, which is exactly what makes this bug easy to miss and hard to reproduce across machines). `glslFloat()` in `src/constants.js` guarantees a valid literal. Interpolating into an `int` context (`const int BALL_COUNT = ${BALL_COUNT};`) needs no such wrapping — use the raw value there.

### Internal vs. external helper extraction

When the same computation appears more than once, extract it — but the *scope* of the extraction should match the scope of the duplication:

- **Duplicated only within one file** (e.g. `_envSample` used solely by `_envSampleLod` inside `raymarchChunk.js`, or the `pow(clamp(1-w*scale,0,1),contrast)` shape used twice inside `environmentShader.js`): a `_camelCase` internal helper defined in that same file, next to its callers.
- **Duplicated across files/chunks** (e.g. `perlin2D`, or `dualOctaveNoise`, the "two weighted perlin octaves" shape shared by `raymarchShader.js` and `environmentShader.js`): a public `camelCase` function added to the relevant shared chunk (`noiseChunk.js` for noise primitives) so every consumer imports the one definition instead of re-deriving it.

Not every superficially similar expression is worth extracting — if two call sites only *look* alike but don't share an invariant that could drift out of sync, and a shared helper would need as many parameters as the inline expression has terms, leaving them inline is the better call.

### Ping-pong render targets

GPU-resident state that must persist across frames (ball positions/velocities in `simulation.js`) uses two `WebGLRenderTarget`s swapped each frame: the sim shader reads last frame's texture and writes the other, then the two are swapped. No CPU roundtrip.

---

## Architectural Styles

### Three-layer architecture

- **Application layer (CPU):** control logic, phase transitions, user input, uniform hand-off.
- **Simulation layer (GPU):** render-to-texture, 1D state texture, ping-pong buffering.
- **Shader layer (GPU):** raymarching, SDF evaluation, normal computation, lighting.

Ball state stays entirely on the GPU — no per-frame CPU roundtrip.

### `phase.js` as a central FSM and implicit event bus

`phase.js` holds module-level mutable state (a singleton, not a class) and is consumed by direct import rather than dependency injection through `main.js`. This avoids prop-drilling through the top-level `animate()` loop as more modules subscribe to phase state, at the cost of implicit global coupling: any module can read (and tests must reset) this shared state. Tests pay this cost explicitly via `vi.resetModules()` per test. This is a deliberate tradeoff for a project at this scale, not an oversight — worth re-evaluating if the module count or team size grows.

### No build step

Vanilla ES modules loaded via an `importmap` pointing at a CDN (`index.html`). No bundler, no transpilation. Trades convenience (no local `node_modules` for the runtime, works from any static file server) for the inability to use non-standard syntax or npm packages that aren't already ES-module-native.
