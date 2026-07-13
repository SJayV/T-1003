// Public GLSL: orbitPoint, reflectBounds, radiusMod, applySimulation
// Precondition: uniforms stateTex, time, clusterBlend/metaballBlend/burstBlend, motionSpeed
// declared; stateUV(int) and perlin2D/dualOctaveNoise (noiseChunk) in scope.

import { BALL_COUNT, ORBIT_Z_SQUASH, FRAME_TIME_STEP, CLUSTER_CYL_RADIUS, CLUSTER_CYL_CENTER_X, CLUSTER_CYL_CENTER_Y, glslFloat } from '../src/constants.js';

export const positionChunk = `

const int   BALL_COUNT     = ${BALL_COUNT};
const float ORBIT_Z_SQUASH = ${glslFloat(ORBIT_Z_SQUASH)};  // flattens orbit ellipse along z — shared with simulation.js via src/constants.js

// Cluster's convergence target -- shared with the cylinder SDF in shapeChunk.js via
// src/constants.js so the shape and the point balls converge toward never drift apart.
const float CLUSTER_CYL_RADIUS = ${glslFloat(CLUSTER_CYL_RADIUS)};
const vec3  CLUSTER_CENTER     = vec3(${glslFloat(CLUSTER_CYL_CENTER_X)}, ${glslFloat(CLUSTER_CYL_CENTER_Y)}, 0.0);

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

// Cluster's per-ball convergence point: a single-turn helix around the cylinder's
// barrel, keyed on ballIdx so every ball gets a unique angle *and* height at once --
// balls visibly fan out onto the barrel during the crossfade instead of collapsing
// onto one ring or one side.
vec3 _clusterTarget(int ballIdx) {
  const float TWO_PI = 6.28318530718;
  // Capped well within reflectBounds' BY=1.0, independent of the cylinder's own (much
  // taller) visual half-height -- balls only need to converge near the shape, not trace
  // its full extent, since the shape itself is what's actually visible once clusterBlend~1.
  const float HELIX_HALF_HEIGHT = 0.9;
  float u   = (float(ballIdx) + 0.5) / float(BALL_COUNT);
  float phi = u * TWO_PI;
  float h   = mix(-HELIX_HALF_HEIGHT, HELIX_HALF_HEIGHT, u);
  return CLUSTER_CENTER + vec3(CLUSTER_CYL_RADIUS * cos(phi), h, CLUSTER_CYL_RADIUS * sin(phi));
}

// Orbit basis: e1=(1,0,0), e2=_orbitBasisE2(orb.a).
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

// r_i(t) = r_i^0 * (1 + alpha*N(c_i,t)). Computed once per ball here (the sim pass runs one
// fragment per ball already) and written into the state texture (see simulationShader.js) --
// the raymarch pass reads it back instead of recomputing this noise per screen pixel.
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

// ── per-phase physics ─────────────────────────────────────────────────────────
// One _simulate<Phase> function per regime, named consistently with shade<Phase>
// in surfaceChunk.js and <phase>SDF in shapeChunk.js. Each returns its own raw,
// unweighted contribution; applySimulation() blends them centrally by
// clusterBlend/metaballBlend/burstBlend -- the same "compute raw, blend centrally"
// shape as map() and shadeHit(). No hard switch anywhere: each contribution fades
// in/out continuously.

const float ORBIT_DT           = ${glslFloat(FRAME_TIME_STEP)};
const float ORBIT_SNAP_RATE    = 0.012;   // radial pull-in rate toward the nearest orbit point
const float ORBIT_OMEGA_SCALE  = 18.0;    // orbitSpeed -> angular velocity
const float ORBIT_OMEGA_MOTION = 9.0;     // motionSpeed contribution to angular velocity

const float CENTRIPETAL_PULL = 0.00016;   // pull toward the cluster target, weighted by (clusterBlend+burstBlend) in applySimulation
const float ORIGIN_PULL      = 0.00006;   // weighted by (clusterBlend+burstBlend) in applySimulation — keeps the formation near the origin outside Metaball

const float CLUSTER_NOISE_FREQ    = 3.0;  // spatial frequency of the cluster-jitter noise field
const float CLUSTER_NOISE_TIME_X1 = 0.18;
const float CLUSTER_NOISE_TIME_Z1 = 0.14;
const float CLUSTER_NOISE_TIME_Y2 = 0.15;
const float CLUSTER_NOISE_TIME_X2 = 0.10;
const float CLUSTER_NOISE_FORCE   = 0.00015;

const float BURST_DIST_EPSILON = 0.01;    // avoids normalize(0) when a ball sits at the centroid
const float BURST_FALLOFF      = 3.2;     // exponential decay rate of the near-center force with distance
// Added into vel every frame with zero damping during pure Burst (see VEL_DECAY below), so it's
// plain undecayed integration -- keep these small, the accumulation itself does the rest.
const float BURST_FORCE_BASE   = 0.0010;
const float BURST_FORCE_SCALE  = 0.0035;  // additional near-center force scaled by live motionSpeed
const float BURST_FORCE_OFFSET = 0.0015;  // constant floor the force asymptotically settles to at
                                           // large distance -- deliberately large relative to
                                           // BURST_FORCE_BASE so the outward drift never gets close
                                           // to 0, not just "eventually decays less"

const float VEL_DECAY_META    = 0.99;
const float VEL_DECAY_CLUSTER = 0.995;
// No named Burst decay rate: Burst applies none at all (see applySimulation) -- vel keeps its
// full momentum into Metaball's takeover, so the two blend rather than one overwriting the other.

// Metaball's own orbit target, split into two pieces with different self-limiting behavior:
//
// _simulateMetaball -- the RADIAL pull back toward the orbit (nearPt-pos scaled by a rate). This
// self-limits to ~0 once the ball is on the orbit, so "pull back in if Burst pushed it too far"
// falls out for free.
//
// _orbitTangentStep -- the orbit's own angular advance this tick, independent of the radial
// term: runs at full strength whenever Metaball is weighted in, not gated by radial catch-up.
//
// Both apply directly to pos (weighted by metaballBlend), NOT through vel: vel only decays a few
// % per tick, so accumulating either into it compounds every frame instead of resolving to the
// tuned correction each is meant to be -- the tangent step especially, since it never reaches
// zero (the orbit never stops advancing) and would spiral outward unbounded. The Burst->Metaball
// handoff is smoothed instead via the Gaussian overlap and Burst's own force staying above a
// constant floor at distance (see _simulateBurst), not by sharing an accumulator between the two.
//
// ORBIT_SNAP_RATE is tuned as fast as possible without breaking the orbit: _nearestOrbitPhi only
// approximates the true nearest point, and a radial correction comparable in magnitude to the
// tangential step can resonate with that error and get a ball permanently stuck instead of converging.
vec3 _simulateMetaball(vec3 pos, vec4 orb) {
  float phi_near = _phiOnOrbit(pos, orb);
  vec3  nearPt   = orbitPoint(orb, phi_near);
  return (nearPt - pos) * ORBIT_SNAP_RATE;
}

vec3 _orbitTangentStep(vec3 pos, vec4 orb) {
  float omega    = orb.g * ORBIT_OMEGA_SCALE + motionSpeed * ORBIT_OMEGA_MOTION;
  float phi_near = _phiOnOrbit(pos, orb);
  return orbitPoint(orb, phi_near + omega * ORBIT_DT) - orbitPoint(orb, phi_near);
}

// Cluster regime: raw (unweighted) organic noise jitter on vel. The pull toward the
// cluster target is a separate force applied in applySimulation(), weighted by
// (clusterBlend+burstBlend) rather than clusterBlend alone -- it keeps charging through
// Burst too, priming vel ahead of Cluster's takeover so Cluster inherits inward motion
// without a dead stop, but contributes ~0 during Metaball so it can't drag balls off their orbit.
vec3 _simulateCluster(vec3 pos) {
  float np = perlin2D(vec2(pos.x * CLUSTER_NOISE_FREQ + time * CLUSTER_NOISE_TIME_X1, pos.z * CLUSTER_NOISE_FREQ + time * CLUSTER_NOISE_TIME_Z1));
  float nq = perlin2D(vec2(pos.y * CLUSTER_NOISE_FREQ + time * CLUSTER_NOISE_TIME_Y2, pos.x * CLUSTER_NOISE_FREQ + time * CLUSTER_NOISE_TIME_X2));
  return vec3(np, nq, np * nq) * CLUSTER_NOISE_FORCE;
}

// Burst regime: raw (unweighted) outward force from the centroid, exponentially decaying with
// distance down to a constant floor (BURST_FORCE_OFFSET) rather than all the way to zero -- balls
// get the strongest push near the centroid, but keep drifting outward at a steady rate afterward
// instead of the push fully running out once they're far away. Force scale reads motionSpeed live
// (not a snapshot at trigger) -- decoupled from phase.js's hold-duration bookkeeping entirely.
vec3 _simulateBurst(vec3 pos, vec3 cen) {
  vec3 burstDir = pos - cen;
  float burstDist = length(burstDir) + BURST_DIST_EPSILON;
  float nearForce = exp(-burstDist * BURST_FALLOFF) * (BURST_FORCE_BASE + motionSpeed * BURST_FORCE_SCALE);
  return normalize(burstDir) * (BURST_FORCE_OFFSET + nearForce);
}

void applySimulation(inout vec3 pos, inout vec3 vel, vec4 orb, int ballIdx) {
  vec3 cen = _computeCentroid();

  // Priming pull toward the cluster target -- weighted by (clusterBlend+burstBlend) at the
  // force level (not just at pos-application) so it contributes ~0 to vel while Metaball
  // dominates, rather than charging vel unweighted and dumping that pent-up pull into pos the
  // instant Cluster/Burst next take over.
  float primeBlend = clusterBlend + burstBlend;
  vel -= pos * ORIGIN_PULL * primeBlend;
  vel += (_clusterTarget(ballIdx) - pos) * CENTRIPETAL_PULL * primeBlend;

  // Cluster/Burst each read this same frame-start pos and return a raw delta, blended into
  // vel by weight -- same pattern as map() and shadeHit().
  vel += _simulateCluster(pos) * clusterBlend + _simulateBurst(pos, cen) * burstBlend;

  pos += vel * (clusterBlend + burstBlend);

  // Metaball's orbit correction stays a direct pos update, not routed through vel -- see the
  // comment above _simulateMetaball for why.
  pos += (_simulateMetaball(pos, orb) + _orbitTangentStep(pos, orb)) * metaballBlend;

  // No named Burst decay rate -- inlined as 1.0 (no damping at all) rather than its own
  // constant, since Burst leaving vel fully undamped is the whole point.
  vel *= mix(mix(VEL_DECAY_META, VEL_DECAY_CLUSTER, clusterBlend), 1.0, burstBlend);

  reflectBounds(pos, vel);
}
`;
