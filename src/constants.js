// Simulation space bounds and camera position.
// Used by simulationLibrary.js (injected into GLSL) and camera.js.

export const BOUNDS_X = 1.8;
export const BOUNDS_Y = 1.0;
export const BOUNDS_Z = 0.5;

export const CAM_POS = { x: -0.4, y: -0.2, z: 3.0 };

// GLSL float literals — JavaScript drops .0 from integers (1.0 → "1"),
// which causes type errors in GLSL. Use these when injecting into shaders.
const _f = n => Number.isInteger(n) ? `${n}.0` : String(n);
export const GLSL_BOUNDS_X = _f(BOUNDS_X);  // "1.8"
export const GLSL_BOUNDS_Y = _f(BOUNDS_Y);  // "1.0"
export const GLSL_BOUNDS_Z = _f(BOUNDS_Z);  // "0.5"
