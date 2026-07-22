// ──── METABALL INITIAL STATE ───────────────────────────────────────────────


export const BALLS = [
  { initialRadius: 0.21, orbitRadius: 1.55, orbitSpeed: 0.5, orbitInclination: 0.85 },
  { initialRadius: 0.11, orbitRadius: 1.55, orbitSpeed: 0.8, orbitInclination: 0.65 },
  { initialRadius: 0.22, orbitRadius: 1.55, orbitSpeed: 0.5, orbitInclination: 0.75 },
  { initialRadius: 0.26, orbitRadius: 1.25, orbitSpeed: 0.6, orbitInclination: -0.35 },
  { initialRadius: 0.22, orbitRadius: 1.25, orbitSpeed: 0.4, orbitInclination: -0.55 },
  { initialRadius: 0.12, orbitRadius: 1.25, orbitSpeed: 0.8, orbitInclination: 0.35 },
  { initialRadius: 0.21, orbitRadius: 0.95, orbitSpeed: 0.9, orbitInclination: 0.35 },
  { initialRadius: 0.23, orbitRadius: 0.95, orbitSpeed: 0.9, orbitInclination: -0.25 },
  { initialRadius: 0.28, orbitRadius: 0.95, orbitSpeed: 0.8, orbitInclination: 0.45 },
  { initialRadius: 0.19, orbitRadius: 0.55, orbitSpeed: 1.5, orbitInclination: -0.55 },
  { initialRadius: 0.09, orbitRadius: 0.55, orbitSpeed: 1.2, orbitInclination: -0.35 },
  { initialRadius: 0.13, orbitRadius: 0.55, orbitSpeed: 0.7, orbitInclination: 0.35 },
];


// ──── BALL COUNT & STATE TEXTURE ───────────────────────────────────────────


export const BALL_COUNT = BALLS.length;
export const TEXELS_PER_BALL = 3;
export const STATE_TEXTURE_WIDTH = BALL_COUNT * TEXELS_PER_BALL;


// ──── SIMULATION PARAMETERS ────────────────────────────────────────────────


export const ORBIT_Z_SQUASH = 0.18;
export const FRAME_TIME_STEP = 0.004;


// ──── CLUSTER SHAPES ───────────────────────────────────────────────────────


export const CLUSTER_SHAPE_VARIANTS = [
  'cylinder',
  'sphere',
  'box',
  'torus',
  'capsule',
  'pyramid',
];


// ──── HELPER FUNCTIONS - GLSL FORMATTING ───────────────────────────────────


export function glslFloat(value) {
  return Number.isInteger(value) ? `${value}.0` : `${value}`;
}