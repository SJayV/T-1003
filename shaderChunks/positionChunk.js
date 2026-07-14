import { BALL_COUNT, ORBIT_Z_SQUASH, FRAME_TIME_STEP, CLUSTER_CYL_RADIUS, CLUSTER_CYL_CENTER_X, CLUSTER_CYL_CENTER_Y, glslFloat } from '../src/constants.js';

export const positionChunk = `

const int   BALL_COUNT     = ${BALL_COUNT};
const float ORBIT_Z_SQUASH = ${glslFloat(ORBIT_Z_SQUASH)};

const float CLUSTER_CYL_RADIUS = ${glslFloat(CLUSTER_CYL_RADIUS)};
const vec3  CLUSTER_CENTER     = vec3(${glslFloat(CLUSTER_CYL_CENTER_X)}, ${glslFloat(CLUSTER_CYL_CENTER_Y)}, 0.0);


// ──── CONSTANTS ───────────────────────────────────────────────────────────────────


const float ORBIT_DT           = ${glslFloat(FRAME_TIME_STEP)};
const float ORBIT_SNAP_RATE    = 0.012;
const float ORBIT_OMEGA_SCALE  = 18.0;
const float ORBIT_OMEGA_MOTION = 9.0;

const float CENTRIPETAL_PULL = 0.00016;
const float ORIGIN_PULL      = 0.00006;

const float CLUSTER_NOISE_FREQ    = 3.0;
const float CLUSTER_NOISE_TIME_X1 = 0.18;
const float CLUSTER_NOISE_TIME_Z1 = 0.14;
const float CLUSTER_NOISE_TIME_Y2 = 0.15;
const float CLUSTER_NOISE_TIME_X2 = 0.10;
const float CLUSTER_NOISE_FORCE   = 0.00015;

const float BURST_DIST_EPSILON = 0.01;
const float BURST_FALLOFF      = 3.2;
const float BURST_FORCE_BASE   = 0.0020;
const float BURST_FORCE_SCALE  = 0.0070;
const float BURST_FORCE_OFFSET = 0.0015;

const float VEL_DECAY_META    = 0.99;
const float VEL_DECAY_CLUSTER = 0.995;


// ──── HELPER FUNCTIONS - ORBITING ───────────────────────────────────


vec3 _orbitBasisE2(float iSin) {
  float iCos = sqrt(max(0.0, 1.0 - iSin * iSin));
  return vec3(0.0, iSin, iCos * ORBIT_Z_SQUASH);
}

vec3 _computeCentroid() {
  vec3 c = vec3(0.0);
  for (int i = 0; i < BALL_COUNT; i++) c += texture2D(stateTex, stateUV(i * 3)).xyz;
  return c / float(BALL_COUNT);
}

vec3 _clusterTarget(int ballIdx) {
  const float TWO_PI = 6.28318530718;
  const float HELIX_HALF_HEIGHT = 0.9;
  float u   = (float(ballIdx) + 0.5) / float(BALL_COUNT);
  float phi = u * TWO_PI;
  float h   = mix(-HELIX_HALF_HEIGHT, HELIX_HALF_HEIGHT, u);
  return CLUSTER_CENTER + vec3(CLUSTER_CYL_RADIUS * cos(phi), h, CLUSTER_CYL_RADIUS * sin(phi));
}

float _nearestOrbitPhi(vec3 pos, vec3 e2norm) {
  return atan(dot(pos, e2norm), pos.x);
}

float _phiOnOrbit(vec3 pos, vec4 orb) {
  return _nearestOrbitPhi(pos, normalize(_orbitBasisE2(orb.a)));
}

vec3 orbitPoint(vec4 orb, float phi) {
  vec3 e2 = _orbitBasisE2(orb.a);
  return orb.r * (cos(phi) * vec3(1.0, 0.0, 0.0) + sin(phi) * e2);
}

vec3 _orbitTangentStep(vec3 pos, vec4 orb) {
  float omega    = orb.g * ORBIT_OMEGA_SCALE + motionSpeed * ORBIT_OMEGA_MOTION;
  float phi_near = _phiOnOrbit(pos, orb);
  return orbitPoint(orb, phi_near + omega * ORBIT_DT) - orbitPoint(orb, phi_near);
}


// ──── HELPER FUNCTIONS - BOUNDS ─────────────────────────────────────────


void _reflectBounds(inout vec3 pos, inout vec3 vel) {
  const float BX = 2.3;
  const float BY = 1.0;
  const float BZ = 0.6;
  if (pos.x >  BX) { pos.x =  BX; vel.x = -abs(vel.x); }
  if (pos.x < -BX) { pos.x = -BX; vel.x =  abs(vel.x); }
  if (pos.y >  BY) { pos.y =  BY; vel.y = -abs(vel.y); }
  if (pos.y < -BY) { pos.y = -BY; vel.y =  abs(vel.y); }
  if (pos.z >  BZ) { pos.z =  BZ; vel.z = -abs(vel.z); }
  if (pos.z < -BZ) { pos.z = -BZ; vel.z =  abs(vel.z); }
}


// ──── HELPER FUNCTIONS - RADIUS MODULATION ─────────────────────────────────────────


float radiusMod(vec3 c, float r0) {
  const float NOISE_FREQ         = 2.0;
  const float NOISE_TIME_SCALE_1 = 0.6;
  const float NOISE_TIME_SCALE_2 = 0.5;
  const float AMPLITUDE_METABALL = 0.3;
  const float AMPLITUDE_CLUSTER  = 0.5;
  const float AMPLITUDE_BURST    = 0.6;

  float n = dualOctaveNoise(c.xy * NOISE_FREQ + time * NOISE_TIME_SCALE_1, 1.0,
                            c.yz * NOISE_FREQ + time * NOISE_TIME_SCALE_2, 1.0);
  float ampFactor = metaballBlend * AMPLITUDE_METABALL + clusterBlend * AMPLITUDE_CLUSTER + burstBlend * AMPLITUDE_BURST;
  return r0 + n * 0.5 * ampFactor;
}


// ──── PHASE POSITION ──────────────────────────────────────────────────────


vec3 _metaballPosition(vec3 pos, vec4 orb) {
  float phi_near = _phiOnOrbit(pos, orb);
  vec3  nearPt   = orbitPoint(orb, phi_near);
  return (nearPt - pos) * ORBIT_SNAP_RATE;
}

vec3 _clusterPosition(vec3 pos) {
  float np = perlin2D(vec2(pos.x * CLUSTER_NOISE_FREQ + time * CLUSTER_NOISE_TIME_X1, pos.z * CLUSTER_NOISE_FREQ + time * CLUSTER_NOISE_TIME_Z1));
  float nq = perlin2D(vec2(pos.y * CLUSTER_NOISE_FREQ + time * CLUSTER_NOISE_TIME_Y2, pos.x * CLUSTER_NOISE_FREQ + time * CLUSTER_NOISE_TIME_X2));
  return vec3(np, nq, np * nq) * CLUSTER_NOISE_FORCE;
}

vec3 _burstPosition(vec3 pos, vec3 cen) {
  vec3  dir      = pos - cen;
  float dist     = length(dir) + BURST_DIST_EPSILON;
  float peak     = BURST_FORCE_BASE + motionSpeed * BURST_FORCE_SCALE;
  float force    = BURST_FORCE_OFFSET + peak * exp(-dist * BURST_FALLOFF);
  return normalize(dir) * force;
}


// ──── WEIGHTED BLENDING ───────────────────────────────────────────────────────────


void blendPosition(inout vec3 pos, inout vec3 vel, vec4 orb, int ballIdx) {
  vec3 cen = _computeCentroid();

  float primeBlend = clusterBlend + burstBlend;
  vel -= pos * ORIGIN_PULL * primeBlend;
  vel += (_clusterTarget(ballIdx) - pos) * CENTRIPETAL_PULL * primeBlend;

  vel += _clusterPosition(pos)    * clusterBlend
       + _burstPosition(pos, cen) * burstBlend;

  pos += vel * (clusterBlend + burstBlend);

  pos += (_metaballPosition(pos, orb) + _orbitTangentStep(pos, orb)) * metaballBlend;

  vel *= mix(mix(VEL_DECAY_META, VEL_DECAY_CLUSTER, clusterBlend), 1.0, burstBlend);

  _reflectBounds(pos, vel);
}
`;
