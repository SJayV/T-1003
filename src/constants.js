// ──── HELPER FUNCTIONS - GLSL FORMATTING ────────────────────────────────────────


export function glslFloat(n) {
  return Number.isInteger(n) ? `${n}.0` : `${n}`;
}


// ──── METABALL INITIAL STATE ────────────────────────────────────────────────────


export const balls = [
  { initialRadius: 0.21, orbitRadius: 2.35, orbitSpeed: 0.5, orbitInclination:  0.35 },
  { initialRadius: 0.11, orbitRadius: 2.35, orbitSpeed: 0.8, orbitInclination:  0.15 },
  { initialRadius: 0.22, orbitRadius: 2.35, orbitSpeed: 0.5, orbitInclination:  0.55 },
  { initialRadius: 0.26, orbitRadius: 1.55, orbitSpeed: 0.3, orbitInclination: -0.35 },
  { initialRadius: 0.22, orbitRadius: 1.55, orbitSpeed: 0.4, orbitInclination: -0.15 },
  { initialRadius: 0.12, orbitRadius: 1.55, orbitSpeed: 0.8, orbitInclination:  0.35 },
  { initialRadius: 0.21, orbitRadius: 0.95, orbitSpeed: 0.4, orbitInclination:  0.35 },
  { initialRadius: 0.23, orbitRadius: 0.95, orbitSpeed: 0.6, orbitInclination: -0.25 },
  { initialRadius: 0.28, orbitRadius: 0.95, orbitSpeed: 0.8, orbitInclination:  0.45 },
  { initialRadius: 0.19, orbitRadius: 0.55, orbitSpeed: 0.5, orbitInclination: -0.55 },
  { initialRadius: 0.09, orbitRadius: 0.55, orbitSpeed: 0.9, orbitInclination: -0.35 },
  { initialRadius: 0.13, orbitRadius: 0.55, orbitSpeed: 0.7, orbitInclination:  0.35 },
];


// ──── BALL COUNT & STATE TEXTURE ─────────────────────────────────────────


export const BALL_COUNT = 12;
export const STATE_TEXTURE_WIDTH = BALL_COUNT * 3;


// ──── SIMULATION TIMING ──────────────────────────────────────────────────────────


export const ORBIT_Z_SQUASH  = 0.28;
export const FRAME_TIME_STEP = 0.004;


// ──── CLUSTER SHAPES ─────────────────────────────────────────────────────────────


export const CLUSTER_SHAPE_VARIANTS = [
  'clusterCylinder',
  'clusterSphere',
  'clusterBox',
  'clusterTorus',
  'clusterCapsule',
  'clusterPyramid',
];
