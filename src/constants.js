// Single source of truth for constants needed in more than one file — either two
// JS modules, or a JS module and a GLSL chunk/shader interpolating it into its
// template-literal source (e.g. `const int BALL_COUNT = ${BALL_COUNT};`).
// Constants used in only one file stay local to that file, not here.

// Formats a JS number as a valid GLSL `float` literal. JS stringifies whole
// numbers without a decimal point (`String(1.0) === '1'`), but GLSL ES 1.00
// requires a decimal point on float literals — `const float x = 1;` is a type
// error on strict validators (e.g. ANGLE on Windows) even though some drivers
// silently tolerate it. Always wrap a JS number in this before interpolating
// it into a `float` (not `int`) context in a GLSL template string.
export function glslFloat(n) {
  return Number.isInteger(n) ? `${n}.0` : `${n}`;
}

// Formats a JS [r, g, b] array as a GLSL `vec3(...)` literal, each component through
// glslFloat() so whole numbers still get a valid decimal point.
export function glslVec3([r, g, b]) {
  return `vec3(${glslFloat(r)}, ${glslFloat(g)}, ${glslFloat(b)})`;
}

// ── metaball initial state ─────────────────────────────────────────────────────
// Shared by: simulation.js, tests/balls.test.js

export const balls = [
  { r0: 0.21, orbitRadius: 2.35, orbitSpeed: 0.5, orbitInclination:  0.35 },
  { r0: 0.11, orbitRadius: 2.35, orbitSpeed: 0.8, orbitInclination:  0.15 },
  { r0: 0.22, orbitRadius: 2.35, orbitSpeed: 0.5, orbitInclination:  0.55 },
  { r0: 0.26, orbitRadius: 1.55, orbitSpeed: 0.3, orbitInclination: -0.35 },
  { r0: 0.22, orbitRadius: 1.55, orbitSpeed: 0.4, orbitInclination: -0.15 },
  { r0: 0.12, orbitRadius: 1.55, orbitSpeed: 0.8, orbitInclination:  0.35 },
  { r0: 0.21, orbitRadius: 0.95, orbitSpeed: 0.4, orbitInclination:  0.35 },
  { r0: 0.23, orbitRadius: 0.95, orbitSpeed: 0.6, orbitInclination: -0.25 },
  { r0: 0.28, orbitRadius: 0.95, orbitSpeed: 0.8, orbitInclination:  0.45 },
  { r0: 0.19, orbitRadius: 0.55, orbitSpeed: 0.5, orbitInclination: -0.55 },
  { r0: 0.09, orbitRadius: 0.55, orbitSpeed: 0.9, orbitInclination: -0.35 },
  { r0: 0.13, orbitRadius: 0.55, orbitSpeed: 0.7, orbitInclination:  0.35 },
];

// ── simulation / phase timing ──────────────────────────────────────────────────
// Shared by: phase.js, simulation.js, shaderChunks/positionChunk.js,
// shaders/simulationShader.js, shaders/raymarchShader.js

export const BALL_COUNT  = 12;
export const STATE_TEX_W = BALL_COUNT * 3;

export const ORBIT_Z_SQUASH  = 0.28;   // flattens the orbit ellipse along z so the cluster stays camera-visible
export const FRAME_TIME_STEP = 0.004;  // simulation time advanced per frame, on both the CPU clock and the GPU orbit step

// camera.js's initCamera() must use this same position.
export const CAMERA_START_POSITION = [-0.4, -0.2, 3.0];

// Cluster's analytic cylinder shape (shaderChunks/shapeChunk.js) and the per-ball
// helix target balls converge toward while clustering (shaderChunks/positionChunk.js)
// must never drift apart, hence shared here rather than duplicated in each file.
//
// Centering offset is empirical, not derived from the camera model.
export const CLUSTER_CYL_CENTER_X   = 0.06;
export const CLUSTER_CYL_CENTER_Y   = 0;
export const CLUSTER_CYL_RADIUS      = 0.31;
export const CLUSTER_CYL_HALF_HEIGHT = 1.5;   // taller than the visible frame -- extends past top/bottom on purpose

// ── mood colors (ball surface + envMap tint per phase) ──────────────────────────
// Colocated here with the other visual-tuning constants above, though only colorChunk.js
// actually interpolates these into GLSL -- keeps every tunable color/geometry value in one place.

export const MOOD_METABALL = [0.32, 0.40, 0.48];  // darker, cool steel-blue metal
export const MOOD_CLUSTER  = [0.21, 0.56, 0.69];  // teal-cyan
export const MOOD_BURST    = [0.32, 0.40, 0.48];  // own constant; same value as MOOD_METABALL for now
export const MOOD_RIM      = [0.18, 0.50, 0.60];  // shared rim-light tint for Metaball + Burst
