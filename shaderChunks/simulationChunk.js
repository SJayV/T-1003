// Public GLSL: orbitPoint, reflectBounds, applySimulation

import { BALL_COUNT, ORBIT_Z_SQUASH, FRAME_TIME_STEP, CLUSTER_BLEND_START, CLUSTER_BLEND_END, BURST_BLEND_START, BURST_BLEND_END, glslFloat } from '../src/constants.js';

export const simulationChunk = `

const int   BALL_COUNT     = ${BALL_COUNT};
const float ORBIT_Z_SQUASH = ${glslFloat(ORBIT_Z_SQUASH)};  // flattens orbit ellipse along z — shared with simulation.js via src/constants.js

// Smoothstep ranges mapping visualPhase -> blend weights — shared with phase.js's
// identical shading blend (via src/constants.js) so physics and shading transition in lockstep.
const float CLUSTER_BLEND_START = ${glslFloat(CLUSTER_BLEND_START)};
const float CLUSTER_BLEND_END   = ${glslFloat(CLUSTER_BLEND_END)};
const float BURST_BLEND_START   = ${glslFloat(BURST_BLEND_START)};
const float BURST_BLEND_END     = ${glslFloat(BURST_BLEND_END)};

// Orbit basis vector e2 from the inclination's sine component (orb.a). Shared by
// orbitPoint() and applySimulation() so the two never drift out of sync.
vec3 _orbitBasisE2(float iSin) {
  float iCos = sqrt(max(0.0, 1.0 - iSin * iSin));
  return vec3(0.0, iSin, iCos * ORBIT_Z_SQUASH);
}

vec3 _computeCentroid() {
  vec3 c = vec3(0.0);
  for (int i = 0; i < BALL_COUNT; i++) c += texture2D(stateTex, stateUV(i * 3)).xyz;
  return c / float(BALL_COUNT);
}

// Orbit basis: e1=(1,0,0), e2=_orbitBasisE2(orb.a).
float _nearestOrbitPhi(vec3 pos, vec3 e2norm) {
  return atan(dot(pos, e2norm), pos.x);
}

vec3 orbitPoint(vec4 orb, float phi) {
  vec3 e2 = _orbitBasisE2(orb.a);
  return orb.r * (cos(phi) * vec3(1.0, 0.0, 0.0) + sin(phi) * e2);
}

// Reflects pos/vel at the visible scene boundary so balls never leave the screen.
// Bounds are set slightly beyond the natural orbit extents to allow burst drama
// while keeping all balls recoverable.
void reflectBounds(inout vec3 pos, inout vec3 vel) {
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

// ── per-phase physics ─────────────────────────────────────────────────────────
// One _simulate<Phase> function per regime, named consistently with shade<Phase>
// in raymarchChunk.js. Each owns its full contribution — including applying its
// own \`weight\` internally — so changing a phase's behavior (e.g. Cluster's goal
// shape) means editing only that one function. applySimulation() just composes
// them, weighted by the same smoothstep ranges the shading blend uses
// (CLUSTER_BLEND_*/BURST_BLEND_*). No hard switch anywhere: each contribution
// fades in/out continuously.

const float ORBIT_DT           = ${glslFloat(FRAME_TIME_STEP)};
const float ORBIT_SNAP_RATE    = 0.012;   // radial pull-in rate toward the nearest orbit point
const float ORBIT_OMEGA_SCALE  = 18.0;    // orbitSpeed -> angular velocity
const float ORBIT_OMEGA_MOTION = 9.0;     // motionSpeed contribution to angular velocity

const float CENTRIPETAL_PULL = 0.00016;   // Cluster's pull toward its target point (see _simulateCluster)
const float ORIGIN_PULL      = 0.00006;   // always active (not phase-weighted) — keeps the whole formation near the origin

const float CLUSTER_NOISE_FREQ    = 3.0;  // spatial frequency of the cluster-jitter noise field
const float CLUSTER_NOISE_TIME_X1 = 0.18;
const float CLUSTER_NOISE_TIME_Z1 = 0.14;
const float CLUSTER_NOISE_TIME_Y2 = 0.15;
const float CLUSTER_NOISE_TIME_X2 = 0.10;
const float CLUSTER_NOISE_FORCE   = 0.00015;

const float BURST_DIST_EPSILON = 0.01;    // avoids normalize(0) when a ball sits at the centroid
const float BURST_FALLOFF      = 3.2;     // exponential decay of burst force with distance
const float BURST_FORCE_BASE   = 0.010;
const float BURST_FORCE_SCALE  = 0.035;   // additional force scaled by input intensity

const float VEL_DECAY_META    = 0.99;
const float VEL_DECAY_CLUSTER = 0.995;
const float VEL_DECAY_BURST   = 0.90;

// Metaball regime: drives pos directly toward the nearest orbit point, weighted
// by weight (applySimulation passes metaballBlend). ORBIT_SNAP_RATE is tuned as
// fast as possible without breaking the orbit: _nearestOrbitPhi is only an
// approximation (projects onto the ellipse's basis plane rather than solving
// for the true nearest point), and a radial correction comparable in magnitude
// to the tangential step can resonate with that approximation error and get
// the ball permanently stuck instead of converging — verified empirically
// across offset directions/magnitudes before landing on this value.
void _simulateMetaball(inout vec3 pos, vec4 orb, float weight) {
  vec3 e2norm    = normalize(_orbitBasisE2(orb.a));
  float omega    = orb.g * ORBIT_OMEGA_SCALE + motionSpeed * ORBIT_OMEGA_MOTION;
  float phi_near = _nearestOrbitPhi(pos, e2norm);
  vec3 nearPt    = orbitPoint(orb, phi_near);
  vec3 nextPt    = orbitPoint(orb, phi_near + omega * ORBIT_DT);
  vec3 orbitDelta = (nearPt - pos) * ORBIT_SNAP_RATE + (nextPt - nearPt);

  pos += orbitDelta * weight;
}

// Cluster regime: pulls vel toward target (today: the centroid) plus organic
// noise jitter. The pull toward target is NOT scaled by weight — it stays
// active through Metaball too, priming vel ahead of the transition so Cluster
// inherits inward motion without a dead stop. A future alternate-shape regime
// (e.g. a line) only needs to change what the caller computes target as.
void _simulateCluster(inout vec3 vel, vec3 pos, vec3 target, float weight) {
  vel += (target - pos) * CENTRIPETAL_PULL;

  float np = perlin2D(vec2(pos.x * CLUSTER_NOISE_FREQ + time * CLUSTER_NOISE_TIME_X1, pos.z * CLUSTER_NOISE_FREQ + time * CLUSTER_NOISE_TIME_Z1));
  float nq = perlin2D(vec2(pos.y * CLUSTER_NOISE_FREQ + time * CLUSTER_NOISE_TIME_Y2, pos.x * CLUSTER_NOISE_FREQ + time * CLUSTER_NOISE_TIME_X2));
  vel += vec3(np, nq, np * nq) * CLUSTER_NOISE_FORCE * weight;
}

// Burst regime: exponentially-decaying outward force from the centroid, weighted by weight.
void _simulateBurst(inout vec3 vel, vec3 pos, vec3 cen, float weight) {
  float intensity = clamp(logicalPhase - 1.0, 0.0, 1.0);
  vec3 burstDir = pos - cen;
  float burstDist = length(burstDir) + BURST_DIST_EPSILON;
  vel += normalize(burstDir) * exp(-burstDist * BURST_FALLOFF) * (BURST_FORCE_BASE + intensity * BURST_FORCE_SCALE) * weight;
}

void applySimulation(inout vec3 pos, inout vec3 vel, vec4 orb) {
  float clusterBlend = smoothstep(CLUSTER_BLEND_START, CLUSTER_BLEND_END, visualPhase)
                      * (1.0 - smoothstep(BURST_BLEND_START, BURST_BLEND_END, visualPhase));
  float burstBlend    = smoothstep(BURST_BLEND_START, BURST_BLEND_END, visualPhase);
  float metaballBlend = 1.0 - clusterBlend - burstBlend;

  vec3 cen = _computeCentroid();

  // Always active regardless of phase — keeps the whole formation near the origin.
  vel -= pos * ORIGIN_PULL;

  // _simulateCluster/_simulateBurst read pos before _simulateMetaball mutates it,
  // matching the single frame-start position every force in this function sees.
  _simulateCluster(vel, pos, cen, clusterBlend);
  _simulateBurst(vel, pos, cen, burstBlend);
  _simulateMetaball(pos, orb, metaballBlend);

  pos += vel * (clusterBlend + burstBlend);

  float velDecay = mix(mix(VEL_DECAY_META, VEL_DECAY_CLUSTER, clusterBlend), VEL_DECAY_BURST, burstBlend);
  vel *= velDecay;

  reflectBounds(pos, vel);
}
`;
