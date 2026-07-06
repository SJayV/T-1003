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

// ── metaball initial state ─────────────────────────────────────────────────────
// Shared by: simulation.js, tests/balls.test.js

export const balls = [
  { r0: 0.11, orbitRadius: 2.35, orbitSpeed: 0.5, orbitInclination:  0.35 },
  { r0: 0.08, orbitRadius: 2.35, orbitSpeed: 0.8, orbitInclination:  0.15 },
  { r0: 0.12, orbitRadius: 2.35, orbitSpeed: 0.5, orbitInclination:  0.55 },
  { r0: 0.16, orbitRadius: 1.55, orbitSpeed: 0.3, orbitInclination: -0.35 },
  { r0: 0.12, orbitRadius: 1.55, orbitSpeed: 0.4, orbitInclination: -0.15 },
  { r0: 0.06, orbitRadius: 1.55, orbitSpeed: 0.8, orbitInclination:  0.35 },
  { r0: 0.11, orbitRadius: 0.95, orbitSpeed: 0.4, orbitInclination:  0.35 },
  { r0: 0.13, orbitRadius: 0.95, orbitSpeed: 0.6, orbitInclination: -0.25 },
  { r0: 0.18, orbitRadius: 0.95, orbitSpeed: 0.8, orbitInclination:  0.45 },
  { r0: 0.09, orbitRadius: 0.55, orbitSpeed: 0.5, orbitInclination: -0.55 },
  { r0: 0.06, orbitRadius: 0.55, orbitSpeed: 0.9, orbitInclination: -0.35 },
  { r0: 0.08, orbitRadius: 0.55, orbitSpeed: 0.7, orbitInclination:  0.35 },
];

// ── simulation / phase timing ──────────────────────────────────────────────────
// Shared by: phase.js, simulation.js, shaderChunks/simulationChunk.js,
// shaders/simulationShader.js, shaders/raymarchShader.js

export const BALL_COUNT  = 12;
export const STATE_TEX_W = BALL_COUNT * 3;

export const ORBIT_Z_SQUASH  = 0.28;   // flattens the orbit ellipse along z so the cluster stays camera-visible
export const FRAME_TIME_STEP = 0.004;  // simulation time advanced per frame, on both the CPU clock and the GPU orbit step

// Smoothstep ranges mapping visualPhase -> blend weights. Shared so the CPU-side
// shading blend (phase.js) and the GPU-side physics blend (simulationChunk.js)
// transition in lockstep.
export const CLUSTER_BLEND_START = 0.25;
export const CLUSTER_BLEND_END   = 0.75;
export const BURST_BLEND_START   = 1.0;
export const BURST_BLEND_END     = 1.5;
