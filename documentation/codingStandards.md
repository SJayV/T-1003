# Coding Standards — T-1003

## Module contracts

Each JS module owns its uniforms end-to-end:
- `getUniformDefs()` → initial `{ key: { value } }` object for `ShaderMaterial.uniforms`
- `applyStateToMaterial(material)` → updates uniforms each frame

`main.js` spreads these defs at setup and calls `applyStateToMaterial` each frame — it never touches individual uniform keys.

Phase values (`visualPhase`, blend weights, `motionSpeed`) are read **directly from `phase.js`** inside each module. They are not passed as function arguments through `main.js`.

Stubs for planned modules (`audio.js`, `camera.js`) define the interface but leave the body empty. When implemented, they follow the same direct-import pattern.

## Naming

| Scope | Convention | Example |
|---|---|---|
| JS private module-level symbols (vars + functions) | `_camelCase` | `_renderer`, `_firstFrame`, `_makeTarget`, `_enterState` |
| JS public exports | `camelCase` | `initSimulation`, `getVisualPhase` |
| JS module constants | `SCREAMING_SNAKE_CASE` | `BALL_COUNT`, `BURST_MIN_FRAMES` |
| GLSL internal helpers | `_camelCase` | `_envUV`, `_hash2`, `_computeCentroid` |
| GLSL public library functions | `camelCase` | `orbitPoint`, `shadeHit`, `perlin2D` |
| GLSL uniforms | `camelCase`, matches JS side | `visualPhase`, `burstBlend` |
| Files | `camelCase.js` | `gpuSetup.js`, `noiseLibrary.js` |

Underscore prefix marks all private module-level symbols: `let` state, `const` helpers, and unexported `function` declarations. It does not apply to block-scoped locals inside a function body.

## GPU passes

All fullscreen quad passes use `makeGpuSetup(material)` from `gpuSetup.js`. No ad-hoc `Scene`/`Camera` pairs elsewhere.

Render target types: `FloatType` for simulation state; `HalfFloatType` for post-processing.

## GLSL libraries

Library files export a single template-literal string injected via `${library}` into the enclosing shader. The chunk assumes the uniform declarations and helper functions of that shader are already in scope.

Document required preconditions (uniforms, functions) at the top of each library string.

Internal GLSL helpers use the `_` prefix; public API functions do not.

## Comments

- Write only **why-comments**: hidden constraints, non-obvious invariants, workarounds for specific bugs.
- Do not comment *what* the code does — well-named identifiers do that.
- No section-divider lines (`// ── section ──`) in JS files.
- GLSL: section headers are acceptable for major blocks; precondition comments on library entry points are required.
