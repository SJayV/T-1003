# Requirements (Deduced from Code)

This document describes what the system *is* and *does*, inferred purely by reading
the code, without relying on `documentation/`. It records structure, modules, and the
functional/non-functional requirements the implementation satisfies (or leaves
explicitly open).

## 1. What the application is

A single-page, browser-based WebGL piece built on Three.js. It renders one continuously
animated, raymarched implicit-surface "creature" made of 12 metaballs, which behaves
according to a webcam-driven motion signal. There is no UI in the conventional sense
(no menus, no game state, no persistence) — it is a perpetual `requestAnimationFrame`
loop with one temporary developer control (a shape-picker overlay).

The creature has three continuously-blended visual/behavioral regimes rather than
discrete states:

- **Cluster** — idle/resting: balls converge onto a helix wrapped around an analytic
  shape (cylinder, sphere, or box; six variants total), translucent/glass shading.
- **Burst** — triggered by detected motion: balls are explosively repelled from their
  centroid, metallic shading.
- **Metaball** — the sustained aftermath of a burst: balls settle onto independent
  orbits and drift/fuse as a classic metaball blob, metallic shading.

Regime identity is never exposed as a hard switch to any rendering or physics code;
everything downstream consumes three continuous weights (`clusterBlend`,
`metaballBlend`, `burstBlend`, summing to 1) computed from a Gaussian bump scheduler.
This continuity is a first-class requirement, evidenced by comments throughout the
shader code explicitly rejecting hard-switch alternatives (e.g. `map()`, `shadeHit()`,
`blendEnvironment()` all do a full 3-way weighted sum, never an early return).

## 2. Runtime/platform requirements

- Runs entirely client-side as native ES modules; `index.html` loads Three.js and
  `three/addons/` via an `importmap` pointing at a CDN (`three@0.160.0`) — no bundler,
  no `node_modules` dependency at runtime.
- Because it uses ES module imports, it must be served over HTTP(S) (`file://` will
  not satisfy module MIME/CORS requirements) — a local dev server or the GitHub Pages
  deployment target (see CI) is required to run it.
- Requires WebGL (via `THREE.WebGLRenderer`) and, functionally, camera/webcam access
  (`navigator.mediaDevices.getUserMedia`) — the motion-input feature degrades silently
  (logs a warning, never calls `reportMotion`) if permission is denied or unavailable,
  so the creature is still viewable (frozen in Cluster) without a camera.
- Targets a full-viewport canvas (`body { margin:0; overflow:hidden }`, canvas sized to
  `window.innerWidth/innerHeight`), pixel ratio capped at 2 for performance
  (`renderer.js`).

## 3. Module inventory and responsibility split

```
index.html            entry HTML + import map (Three.js CDN pin)
main.js                composition root: builds the one visible ShaderMaterial,
                        owns the animate() loop, wires every module together

src/
  renderer.js           owns THREE.Scene / PerspectiveCamera / WebGLRenderer singletons
                         and the window resize handler
  gpuSetup.js            generic fullscreen-quad scene/camera factory (makeGpuSetup),
                         plus the multi-pass bloom pipeline (makeBloomSetup)
  phase.js               the regime scheduler: Gaussian-bump weight system, motion
                         intake, phase-transition event source, global time clock
  simulation.js           GPU ping-pong metaball physics: owns the state texture,
                         steps the simulation shader once per frame
  environment.js          GPU-generated equirectangular environment map, regenerated
                         every frame from the current phase weights
  input.js                webcam motion detection (frame differencing) -> feeds phase.js
  camera.js               camera positioning; currently static (most of its surface is
                         stubbed for future input-driven camera behavior)
  audio.js                stub; no implementation yet
  clusterShapeUI.js       temporary manual DOM UI for picking Cluster's shape variant
  constants.js            single source of truth for values shared across >1 file
                         (JS-JS or JS-GLSL), plus GLSL literal-formatting helpers

shaders/                 fully assembled GLSL programs (vertex+fragment strings),
                         each pairing with one src/*.js orchestrator:
  simulationShader.js     physics pass -> pairs with simulation.js
  environmentShader.js    env-map pass -> pairs with environment.js
  raymarchShader.js       main visible pass -> pairs with main.js / gpuSetup.js
  bloomShader.js          3-stage post-process (extract/blur/composite) -> gpuSetup.js

shaderChunks/             reusable GLSL fragments injected (as template-literal string
                         concatenation) into one or more of the shaders/ programs:
  vertexChunk.js          shared passthrough vertex shader
  noiseChunk.js           perlin2D/perlin3D/worley2D primitives
  positionChunk.js         per-phase physics functions (applySimulation) - simulation pass only
  shapeChunk.js            per-phase SDFs, map(), raymarch() - main pass only
  surfaceChunk.js          per-phase shading (shadeHit) - main pass only
  colorChunk.js            phase mood colors, moodColor(), blendEnvironment() -
                         shared between the main pass and the env pass

tests/                   vitest unit tests for the CPU-side logic only (phase.js,
                         input.js, constants.js's `balls` data) - nothing shader-side
                         is tested (no way to unit test GLSL in this setup)
```

## 4. Functional requirements (as implemented)

- **Continuous phase blending.** Exactly three weights drive color, shape, and physics
  simultaneously; no module ever branches on "which phase am I in" except `phase.js`'s
  own private scheduler state.
- **Motion-driven triggering.** A webcam feed is diffed frame-to-frame at reduced
  resolution (80x60); a thresholded, persistence-gated motion signal
  (`INPUT_SPEED_THRESHOLD`, `INPUT_PERSIST_FRAMES`) is the only external trigger that
  can move the system out of Cluster.
- **12-ball metaball simulation**, entirely GPU-resident: initial per-ball orbit
  parameters live in `constants.js`; per-frame integration happens in a render-to-
  texture pass (`simulationShader.js` + `positionChunk.js`); no per-ball state is ever
  read back to the CPU.
- **Raymarched rendering** of a signed-distance field composed of the three phases'
  SDFs, with PBR-ish (Cook-Torrance, metalness=1) shading for Metaball/Burst and a
  custom translucent shading model for Cluster.
- **Selectable Cluster target shape.** Six shape variants (cylinder/sphere/box, each
  full or ball-intersected) are selectable at runtime via a manual button UI; the
  choice requires reassembling and recompiling the fragment shader string
  (`buildMainFrag`), since the choice is baked in at shader-assembly time, not passed
  as a uniform.
- **Dynamic environment map**, regenerated every frame (not throttled) from the same
  three phase weights, feeding both the sky background and the balls' own reflections.
- **Bloom post-processing** whose intensity/threshold react to `burstBlend`, giving
  Burst extra brightness.
- **Static camera** with a fixed start position; no orbit/free-look controls.

## 5. Explicitly unfinished / stubbed requirements

These are present as call sites and/or empty function bodies, indicating planned but
not-yet-implemented behavior:

- `audio.js` — `initAudio()`/`updateAudio()` are both empty. The per-frame call site
  exists in `main.js`, so audio is wired into the loop but produces nothing.
- `camera.js` — `updateCamera(camera)` and `onInput(type, data)` are empty stubs;
  `input.js` already calls `onInput('presence'|'absence', {...})` every frame, so the
  camera module is a documented extension point that currently does nothing with that
  data.
- `clusterShapeUI.js` — the file's own header comment states it is a temporary manual
  picker "to be replaced by a random pick made once per Cluster entry" via
  `phase.js`'s `onPhaseTransition` hook.
- Presence-vs-motion distinction: `input.js` only ever reports a motion *speed*; there
  is no separate "someone is present but not moving" signal anywhere in the pipeline.

## 6. Tooling / process requirements

- **Package management**: plain `npm`, devDependencies only (`eslint`, `globals`,
  `jsdom`, `vitest`) — no runtime dependency is installed locally; Three.js is CDN-only.
- **Linting**: `eslint.config.js` restricts rules (`no-unused-vars` with args ignored,
  `eqeqeq`, `no-var`) to `src/**/*.js` and `main.js` only — shaders, shaderChunks, and
  tests are not linted.
- **Testing**: `vitest`, default Node environment except `tests/input.test.js` which
  opts into `jsdom` (`@vitest-environment jsdom`) because it exercises
  canvas/video/DOM APIs. `vitest.config.js` sets `restoreMocks: true` globally.
- **CI** (`.github/workflows/ci.yml`): on every push/PR to `master`, installs deps,
  runs lint then test. On a push to `master` (not PRs), a second job deploys the
  entire repository root as a static site to GitHub Pages — meaning `index.html` +
  CDN import map must keep working unmodified as a static deployment, with no build
  step between source and deployed artifact.
