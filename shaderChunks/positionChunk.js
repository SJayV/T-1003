import { BALL_COUNT, ORBIT_Z_SQUASH, FRAME_TIME_STEP, glslFloat } from '../src/constants.js';

export const positionChunk = `

const int BALL_COUNT = ${BALL_COUNT};
const float ORBIT_Z_SQUASH = ${glslFloat(ORBIT_Z_SQUASH)};


// ──── CONSTANTS ───────────────────────────────────────────────────────────────────


const float ORBIT_DT = ${glslFloat(FRAME_TIME_STEP)};
const float ORBIT_SNAP_RATE = 0.004;
const float ORBIT_OMEGA_SCALE = 18.0;
const float ORBIT_OMEGA_MOTION = 9.0;

const float ORIGIN_PULL = 0.00012;

const float BURST_DIST_EPSILON = 0.01;
const float BURST_FALLOFF = 1.3;
const float BURST_FORCE_BASE = 0.0002;
const float BURST_FORCE_SCALE = 0.0002;
const float BURST_FORCE_OFFSET = 0.0055;
const float BURST_ORBIT_NUDGE = 0.7;

const float VELOCITY_DECAY = 0.99;


// ──── HELPER FUNCTIONS - ORBIT ───────────────────────────────────


vec3 _orbitBasisE2(float inclinationSine) {
  float inclinationCosine = sqrt(max(0.0, 1.0 - inclinationSine * inclinationSine));
  return vec3(0.0, inclinationSine, inclinationCosine * ORBIT_Z_SQUASH);
}

vec3 _orbitPoint(vec4 orbit, float phi, vec3 basisE2) {
  return orbit.r * (vec3(cos(phi), 0.0, 0.0) + sin(phi) * basisE2);
}

struct OrbitState { vec3 point; vec3 tangentStep; };

OrbitState _computeOrbitState(vec3 position, vec4 orbit) {
  vec3 normalizedBasisE2 = normalize(_orbitBasisE2(orbit.a));
  float nearestPhi = atan(dot(position, normalizedBasisE2), position.x);
  vec3 nearestPoint = _orbitPoint(orbit, nearestPhi, normalizedBasisE2);
  float omega = orbit.g * ORBIT_OMEGA_SCALE + motionSpeed * ORBIT_OMEGA_MOTION;
  vec3 tangentStep = _orbitPoint(orbit, nearestPhi + omega * ORBIT_DT, normalizedBasisE2) - nearestPoint;
  return OrbitState(nearestPoint, tangentStep);
}


// ──── HELPER FUNCTIONS - BURST ───────────────────────────────────


vec3 _computeCenter() {
  vec3 center = vec3(0.0);
  for (int ballIndex = 0; ballIndex < BALL_COUNT; ballIndex++) {
    center += texture2D(stateTexture, stateUV(ballIndex * TEXELS_PER_BALL)).xyz;
  }
  return center / float(BALL_COUNT);
}

vec3 _burstNudgedDirection(vec3 direction, vec3 position, vec4 orbit) {
  vec3 outwardDirection = normalize(direction);
  vec3 orbitDirection = normalize(_computeOrbitState(position, orbit).tangentStep);
  return normalize(mix(outwardDirection, orbitDirection, BURST_ORBIT_NUDGE));
}

float _burstForceMagnitude(float distance) {
  float peak = BURST_FORCE_BASE + motionSpeed * BURST_FORCE_SCALE;
  return BURST_FORCE_OFFSET + peak * exp(-distance * BURST_FALLOFF);
}


// ──── PHASE VELOCITY ──────────────────────────────────────────────────────


vec3 _metaballVelocity(vec3 position, vec3 velocity, vec4 orbit) {
  OrbitState orbitState = _computeOrbitState(position, orbit);
  vec3 targetVelocity = (orbitState.point - position) * ORBIT_SNAP_RATE + orbitState.tangentStep;
  return targetVelocity - velocity;
}

vec3 _clusterVelocity(vec3 position) {
  return -position * ORIGIN_PULL;
}

vec3 _burstVelocity(vec3 position, vec3 center, vec4 orbit) {
  vec3 direction = position - center;
  float distance = length(direction) + BURST_DIST_EPSILON;
  return _burstNudgedDirection(direction, position, orbit) * _burstForceMagnitude(distance) + _clusterVelocity(position);
}


// ──── WEIGHTED BLENDING ───────────────────────────────────────────────────────────


vec3 _blendVelocity(vec3 position, vec3 velocity, vec3 center, vec4 orbit) {
  return velocity + _metaballVelocity(position, velocity, orbit) * metaballBlend
                   + _clusterVelocity(position) * clusterBlend
                   + _burstVelocity(position, center, orbit) * burstBlend;
}

void _decayVelocity(inout vec3 velocity) {
  velocity *= VELOCITY_DECAY * (metaballBlend + clusterBlend) + burstBlend;
}

void blendPosition(inout vec3 position, inout vec3 velocity, vec4 orbit) {
  vec3 center = _computeCenter();
  velocity = _blendVelocity(position, velocity, center, orbit);
  position += velocity;
  _decayVelocity(velocity);
}
`;