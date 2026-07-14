# Interfaces Between Modules (Deduced from Code)

This describes the actual call/data contracts observed between modules — what each
module exposes, who consumes it, and the conventions that hold those contracts
together. Three distinct "interface systems" coexist: plain JS function exports,
Three.js material uniforms, and GLSL chunks concatenated into shader source strings.

## 1. JS module exports — the CPU-side contract

### `src/renderer.js`
Exports three ready-made singletons, constructed as an import-time side effect:
`scene`, `camera`, `renderer`. No init function — importing the module *is* the
initialization. Consumers: `main.js` (adds meshes, drives `animate()`),
implicitly everything that receives `renderer`/`camera` as a parameter afterward
(`initEnvMap(renderer)`, `initSimulation(renderer)`, `initCamera(camera)`,
`updateCamera(camera)`).

### `src/phase.js` — the hub
This is the one module every other CPU module either feeds or reads from; nothing
communicates cross-module except through it.

- `tick(t_now)` — called once per frame by `main.js` only. Advances the internal
  clock and the Gaussian-bump scheduler.
- `getWeights()` -> `{ clusterWeight, metaballWeight, burstWeight }` — read by
  `main.js`, `simulation.js`, `environment.js` every frame. This triple *is* the
  cross-cutting interface for phase identity; no consumer ever asks "what phase is
  it" any other way.
- `getTime()` / `getMotionSpeed()` — read by the same three consumers to drive
  shader `time`/`motionSpeed` uniforms.
- `reportMotion(speed)` — the only write entry point from outside; called
  exclusively by `input.js`. Note this is a direct cross-module call, not mediated
  by `main.js` — `input.js` imports `phase.js` directly.
- `onPhaseTransition(fn)` — a subscriber-list hook fired on every internal regime
  change (Cluster<->Burst<->Metaball). No current subscribers exist in the codebase
  yet (`environment.js`/`audio.js` regenerate/would regenerate continuously instead),
  but the hook is exported and presumably intended for exactly that kind of listener
  (per the `clusterShapeUI.js` header comment planning to hook into it).

### `src/simulation.js` and `src/environment.js` — matching 4-function shape
Both GPU-state-owning modules expose the identical protocol, so `main.js` treats them
interchangeably during setup and per-frame update:

```
getUniformDefs()                 // -> plain object merged into the ShaderMaterial's
                                  //    uniforms at construction time
init<Name>(renderer)              // one-time GPU resource setup
step/no-step per-frame work       // simulation.js: stepSimulation(); environment.js:
                                  //    folded into applyStateToMaterial() itself
applyStateToMaterial(material)    // pushes this frame's result onto the *shared*
                                  //    material's uniforms (stateTex / envMap)
```

`getUniformDefs()` is the mechanism by which `main.js` never has to know the uniform
*names* each module needs — it just spreads `...simDefs()` and `...envDefs()` into its
own uniforms object at construction (see `main.js`). This is a deliberate ownership
boundary: `main.js` still separately sets phase-shared uniforms (`time`,
`clusterBlend`, etc.) itself because those aren't owned by any one module.

### `src/gpuSetup.js` — shared infrastructure, not a phase-aware module
`makeGpuSetup(material)` -> `{ scene, camera }`: a fullscreen-quad rig reused by
`simulation.js`, `environment.js`, and internally by `makeBloomSetup`. `simulation.js`
and `environment.js` both call it and hold on to the resulting scene/camera as private
module state.

`makeBloomSetup(renderer, { brightExtractFrag, blurFrag, compositeFrag })` -> an
object with one method, `render(scene, camera, { intensity, threshold })`. `main.js`
is the only consumer, calling `bloom.render(...)` once per frame instead of
`renderer.render(...)` directly. The three fragment shader strings are passed in from
`main.js`, imported from `shaders/bloomShader.js` — `gpuSetup.js` itself has no
dependency on any specific shader.

### `src/input.js`
Exports `initInput()` / `updateInput()` only; `main.js` calls both but never inspects
their innards. Internally, `input.js` calls two *other* modules directly rather than
returning a value for `main.js` to route:

```
input.js --reportMotion(speed)--> phase.js
input.js --onInput('presence'|'absence', {...})--> camera.js
```

This is the same "no central mediator" pattern as `phase.js`'s `reportMotion`: cross-
module wiring happens at the call site inside the producing module, not inside
`main.js`. `main.js`'s only relationship to `input.js` is lifecycle (`initInput()` /
`updateInput()` each frame).

### `src/camera.js`
Exports `initCamera(camera)` (consumes `CAMERA_START_POSITION` from `constants.js`),
`updateCamera(camera)` (stub, called every frame by `main.js` but currently a no-op),
and `onInput(type, data)` (stub, the receiving end of `input.js`'s direct call).

### `src/clusterShapeUI.js`
`initClusterShapeUI(variants, onSelect)` — takes the list of valid variant names
(`CLUSTER_SHAPE_VARIANTS`, itself exported from `shaderChunks/shapeChunk.js`) and a
callback. `main.js` supplies a closure as `onSelect` that rebuilds the fragment shader
string and flips `material.needsUpdate = true` — the UI module itself never touches
`THREE.ShaderMaterial` at all; it only reports the user's choice back up.

### `src/audio.js`
Exports `initAudio()`/`updateAudio()`, both empty. Same lifecycle shape as
`input.js`, called unconditionally by `main.js` every frame — establishes the call-
site contract in advance of any real implementation.

### `src/constants.js`
Not a runtime interface in the init/update sense — a value + helper-function module.
Two kinds of exports:
1. Plain JS values/arrays (`balls`, `BALL_COUNT`, `CAMERA_START_POSITION`, mood
   colors, cluster-shape dimensions, timing constants) consumed both by other `.js`
   files (e.g. `camera.js` reads `CAMERA_START_POSITION`) and by `shaderChunks/*.js`,
   which `import` them purely to interpolate into GLSL template strings at module-load
   time (not at shader-compile time — the values are baked into the generated GLSL
   source once, when the JS module runs).
2. `glslFloat(n)` / `glslVec3([r,g,b])` — formatting helpers that convert a JS number/
   array into syntactically valid GLSL literal text. Every shaderChunk that
   interpolates a `constants.js` numeric constant into a `float`/`vec3` GLSL context
   routes it through one of these first. This is the seam that bridges the "JS
   constant" and "GLSL literal" interface types.

## 2. Three.js material uniforms — the CPU->GPU contract

`main.js` owns exactly one `THREE.ShaderMaterial` for the visible scene and merges
uniforms from three sources: its own literals (`time`, `resolution`, `camPos`,
`metaballBlend`, `clusterBlend`, `burstBlend`, `motionSpeed`), `simulation.js`'s
`getUniformDefs()` (`stateTex`), and `environment.js`'s `getUniformDefs()` (`envMap`).
Every frame, `main.js`:

1. Calls `stepSimulation()` (mutates `simulation.js`'s internal ping-pong buffers).
2. Calls `applySimState(material)` / `applyEnvState(material)` (push `stateTex` /
   `envMap` onto the *shared* material).
3. Sets the phase-shared uniforms itself (`time`, `resolution`, `camPos`,
   `metaballBlend`, `clusterBlend`, `burstBlend`, `motionSpeed`) directly from
   `phase.js`/`camera`/`window`.

The uniform *names* `time`, `clusterBlend`, `metaballBlend`, `burstBlend`,
`motionSpeed` are literally repeated across three independent `ShaderMaterial`
instances (main render material in `main.js`, sim material in `simulation.js`, env
material in `environment.js`) — there is no shared constant listing these name
strings; the convention is maintained by hand across the three call sites and their
corresponding GLSL `uniform` declarations. This is a soft/implicit interface: renaming
one side without the others would silently break at runtime (undefined uniform),
not at compile time.

## 3. GLSL chunks — string-concatenation "modules"

Because GLSL (as used here, via raw template-literal strings, not `#include`) has no
module system, each `shaderChunks/*.js` file documents its own public/precondition
contract in a header comment, e.g. `positionChunk.js`:

```
// Public GLSL: orbitPoint, reflectBounds, radiusMod, applySimulation
// Precondition: uniforms stateTex, time, clusterBlend/metaballBlend/burstBlend,
// motionSpeed declared; stateUV(int) and perlin2D/dualOctaveNoise (noiseChunk) in scope.
```

This is the interface mechanism in lieu of imports: a chunk assumes certain uniforms
and certain other chunks' public functions are already in scope by the time it is
concatenated in, and the composing `shaders/*.js` file is responsible for getting the
concatenation order right. Concretely:

- `noiseChunk` has no preconditions (leaf dependency) — used by `positionChunk`,
  `colorChunk`, `raymarchShader.js`'s assembly (via `shapeChunk`/`surfaceChunk`),
  `environmentShader.js`.
- `positionChunk` depends on `noiseChunk` being in scope + `stateTex`/blend/time
  uniforms declared by the composing shader (`simulationShader.js`). It is *only*
  used by the simulation pass.
- `colorChunk` declares its own uniforms (`metaballBlend`, `clusterBlend`,
  `burstBlend`) rather than assuming the composing shader already did — the one
  chunk that owns uniform declarations itself. Used by both `raymarchShader.js`
  (indirectly, before `shapeChunk`/`surfaceChunk`) and `environmentShader.js`.
- `shapeChunk(clusterVariant)` is a *factory*, not a static string — it must be
  called with the chosen Cluster shape variant name, which gets spliced in as
  `clusterSDF(p) { return ${clusterVariant}(p); }`. Depends on `noiseChunk` (perlin3D)
  and `constants.js` shape-dimension values; used only by `raymarchShader.js`.
- `surfaceChunk` depends on an `envMap` sampler uniform and on `map()` (from
  `shapeChunk`) being already defined — its header comment states it must be injected
  *after* `shapeChunk` for that reason. Used only by `raymarchShader.js`.
- `vertexChunk` has no preconditions and is reused verbatim as the vertex shader for
  every material in the codebase (main, sim, env, and all three bloom stages) — the
  only shader logic lives in fragment shaders; every vertex stage is an identity
  passthrough for a fullscreen quad.

### `shaders/*.js` — the assembly layer
Each file in `shaders/` is the only place that knows the concatenation order and
which chunks a given pass needs:

- `simulationShader.js`: declares its own uniforms + `stateUV`/`readPos`/`readVel`/
  `readOrb` helpers, then concatenates `noiseChunk` + `positionChunk`, then a `main()`
  that dispatches per-texel (`texelIdx`/`ballIdx`/`subIdx`) to either passthrough
  (orbit-param texel) or `applySimulation` + radius-modulation output.
- `environmentShader.js`: concatenates `noiseChunk` + `colorChunk`, `main()` just
  computes a UV and calls `colorChunk`'s `blendEnvironment(uv)`.
- `raymarchShader.js`: exports `buildMainFrag(clusterVariant)`, concatenating
  `noiseChunk` + `colorChunk` + `shapeChunk(clusterVariant)` + `surfaceChunk` in that
  fixed order (order is load-bearing, per the chunks' own precondition comments), plus
  its own `loadBalls()` helper that reads the state texture into named globals
  (`gC0..gC11`, `gRad0..gRad11`) that `shapeChunk`'s `map()`/`_ballUnion` consume.
- `bloomShader.js`: three independent, chunk-free fragment shaders (extract/blur/
  composite), each pairing with `vertexChunk` directly via `gpuSetup.js`.

## 4. The state texture — an implicit binary data contract

`simulation.js` allocates two `RGBA32F`, `STATE_TEX_W x 1` (`STATE_TEX_W = BALL_COUNT
* 3`) render targets and ping-pongs between them. The texel layout is a contract
shared by four places that must agree on it without any shared schema/type:

| Texel    | .r  | .g  | .b  | .a                                    |
|----------|-----|-----|-----|----------------------------------------|
| `3i`     | pos.x | pos.y | pos.z | `r0` (base radius, written once, passthrough) |
| `3i+1`   | vel.x | vel.y | vel.z | noise-modulated radius (`radiusMod`, written every frame by the sim pass) |
| `3i+2`   | orbitRadius | orbitSpeed | phi0 (randomized at init) | orbitInclination (passthrough) |

Writers: `simulation.js`'s `_buildInitData()` (initial values), `simulationShader.js`'s
`main()` (every frame, via `positionChunk.js`'s `applySimulation`/`radiusMod`).
Readers: `raymarchShader.js`'s `loadBalls()` (positions + precomputed radius only,
skipping velocity/orbit texels entirely at render time), `positionChunk.js`'s
`_computeCentroid()`/`readPos`/`readVel`/`readOrb` accessor functions (sim pass only).
There is no runtime validation that all four sides agree on this layout — it is
purely convention, documented in `positionChunk.js`'s and `simulationShader.js`'s
comments and in `constants.js`'s `STATE_TEX_W` definition.

## 5. Tests as consumers

`tests/*.test.js` are themselves interface consumers worth noting: they import
`src/phase.js` and `src/constants.js`'s public exports directly (no shader/GPU code is
reachable from tests at all — the GLSL side of every contract above is untested).
`tests/input.test.js` additionally mocks `src/phase.js` and `src/camera.js` via
`vi.doMock`, which only works because `input.js` imports them as ES module bindings
rather than receiving them as constructor/init parameters — a structural consequence
of the "call directly, no mediator" pattern described in section 1.
