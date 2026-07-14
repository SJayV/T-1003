// ──── HELPER FUNCTIONS - GLSL FORMATTING ────────────────────────────────────────


export function glslFloat(n) {
  return Number.isInteger(n) ? `${n}.0` : `${n}`;
}

// ──── METABALL INITIAL STATE ────────────────────────────────────────────────────


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


// ──── BALL COUNT & STATE TEXTURE ─────────────────────────────────────────


export const BALL_COUNT  = 12;
export const STATE_TEX_W = BALL_COUNT * 3;


// ──── SIMULATION TIMING ──────────────────────────────────────────────────────────


export const ORBIT_Z_SQUASH  = 0.28;
export const FRAME_TIME_STEP = 0.004;


// ──── CAMERA ─────────────────────────────────────────────────────────────────────


export const CAMERA_START_POSITION = [-0.4, -0.2, 3.0];


// ──── CLUSTER SHAPES ─────────────────────────────────────────────────────────────


export const CLUSTER_CYL_CENTER_X   = 0.06;
export const CLUSTER_CYL_CENTER_Y   = 0;
export const CLUSTER_CYL_RADIUS      = 0.35;
export const CLUSTER_CYL_HALF_HEIGHT = 0.5;
export const CLUSTER_CYL_ROTATION_Y = 0.4;
export const CLUSTER_CYL_ROTATION_X = 0.5;

export const CLUSTER_SPHERE_RADIUS   = 0.7;

export const CLUSTER_BOX_HALF_EXTENT = 0.46;
export const CLUSTER_BOX_ROTATION_Y = 0.4;
export const CLUSTER_BOX_ROTATION_X = 0.5;

export const CLUSTER_TORUS_RING_RADIUS = 0.5;
export const CLUSTER_TORUS_TUBE_RADIUS = 0.18;
export const CLUSTER_TORUS_ROTATION_Y  = -0.3;
export const CLUSTER_TORUS_ROTATION_X  = 0.8;

export const CLUSTER_CAPSULE_HALF_LENGTH = 0.35;
export const CLUSTER_CAPSULE_RADIUS      = 0.38;
export const CLUSTER_CAPSULE_ROTATION_Y  = -0.4;
export const CLUSTER_CAPSULE_ROTATION_X  = 0.5;

export const CLUSTER_PYRAMID_SCALE      = 1.1;
export const CLUSTER_PYRAMID_HEIGHT     = 0.9;
export const CLUSTER_PYRAMID_ROTATION_Y = 0.6;
export const CLUSTER_PYRAMID_ROTATION_X = -0.3;
