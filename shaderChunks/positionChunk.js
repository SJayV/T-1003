import { BALL_COUNT, ORBIT_Z_SQUASH, FRAME_TIME_STEP, glslFloat } from '../src/constants.js';

export const positionChunk = `

const int   BALL_COUNT     = ${BALL_COUNT};
const float ORBIT_Z_SQUASH = ${glslFloat(ORBIT_Z_SQUASH)};


// ──── CONSTANTS ───────────────────────────────────────────────────────────────────


const float ORBIT_DT           = ${glslFloat(FRAME_TIME_STEP)};
const float ORBIT_SNAP_RATE    = 0.004;
const float ORBIT_OMEGA_SCALE  = 18.0;
const float ORBIT_OMEGA_MOTION = 9.0;

const float ORIGIN_PULL      = 0.00012;

const float BURST_DIST_EPSILON = 0.01;
const float BURST_FALLOFF      = 1.2;
const float BURST_FORCE_BASE   = 0.002;
const float BURST_FORCE_SCALE  = 0.017;
const float BURST_FORCE_OFFSET = 0.009;

const float VELOCITY_DECAY    = 0.99;


// ──── HELPER FUNCTIONS - ORBITING ───────────────────────────────────


vec3 _orbitBasisE2(float iSin) {
  float iCos = sqrt(max(0.0, 1.0 - iSin * iSin));
  return vec3(0.0, iSin, iCos * ORBIT_Z_SQUASH);
}

vec3 _computeCentroid() {
  vec3 c = vec3(0.0);
  for (int i = 0; i < BALL_COUNT; i++) c += texture2D(stateTexture, stateUV(i * 3)).xyz;
  return c / float(BALL_COUNT);
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


float radiusMod(vec3 c, float initialRadius) {
  const float NOISE_FREQ         = 2.0;
  const float NOISE_TIME_SCALE_1 = 0.6;
  const float NOISE_TIME_SCALE_2 = 0.5;
  const float AMPLITUDE_METABALL = 0.3;
  const float AMPLITUDE_CLUSTER  = 0.5;
  const float AMPLITUDE_BURST    = 0.6;

  float n = dualOctaveNoise(c.xy * NOISE_FREQ + time * NOISE_TIME_SCALE_1, 1.0,
                            c.yz * NOISE_FREQ + time * NOISE_TIME_SCALE_2, 1.0);
  float ampFactor = metaballBlend * AMPLITUDE_METABALL + clusterBlend * AMPLITUDE_CLUSTER + burstBlend * AMPLITUDE_BURST;
  return initialRadius + n * 0.5 * ampFactor;
}


// ──── PHASE VELOCITY ──────────────────────────────────────────────────────


vec3 _metaballVelocity(vec3 pos, vec3 vel, vec4 orb) {
  float phi_near  = _phiOnOrbit(pos, orb);
  vec3  nearPt    = orbitPoint(orb, phi_near);
  vec3  targetVel = (nearPt - pos) * ORBIT_SNAP_RATE + _orbitTangentStep(pos, orb);
  return targetVel - vel;
}

vec3 _clusterVelocity(vec3 pos) {
  return -pos * ORIGIN_PULL;
}

vec3 _burstVelocity(vec3 pos, vec3 cen) {
  vec3  dir      = pos - cen;
  float dist     = length(dir) + BURST_DIST_EPSILON;
  float peak     = BURST_FORCE_BASE + motionSpeed * BURST_FORCE_SCALE;
  float force    = BURST_FORCE_OFFSET + peak * exp(-dist * BURST_FALLOFF);
  return normalize(dir) * force - pos * ORIGIN_PULL;
}


// ──── WEIGHTED BLENDING ───────────────────────────────────────────────────────────


void blendPosition(inout vec3 pos, inout vec3 vel, vec4 orb) {
  vec3 cen = _computeCentroid();

  vel += _metaballVelocity(pos, vel, orb) * metaballBlend
       + _clusterVelocity(pos)            * clusterBlend
       + _burstVelocity(pos, cen)         * burstBlend;

  pos += vel;

  vel *= VELOCITY_DECAY    * metaballBlend
       + VELOCITY_DECAY * clusterBlend
       + 1.0               * burstBlend;

  _reflectBounds(pos, vel);
}
`;
