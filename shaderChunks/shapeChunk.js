// Public GLSL: map, normal, raymarch
// Precondition: globals gC0..gC11/gRad0..gRad11 populated by loadBalls() (raymarchShader.js
// -- gRad_i is the radius already modulated by positionChunk.js's radiusMod() and stored in
// the state texture, not recomputed here); uniforms time, clusterBlend/metaballBlend/burstBlend
// (colorChunk) in scope; perlin3D (noiseChunk) in scope.

import { CLUSTER_CYL_RADIUS, CLUSTER_CYL_HALF_HEIGHT, CLUSTER_CYL_CENTER_X, CLUSTER_CYL_CENTER_Y, glslFloat } from '../src/constants.js';

export const shapeChunk = `

float sphere(vec3 p, vec3 c, float r) { return length(p - c) - r; }

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// Capped cylinder (iq), no cap rounding -- the caps sit well beyond the visible frame
// (CLUSTER_CYL_HALF_HEIGHT), so there's no seam ever on screen to round in the first place.
float sdCappedCylinder(vec3 p, float r, float h) {
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float _foldBall(float d, vec3 p, vec3 c, float r, float k) {
  return smin(d, sphere(p, c, r), k);
}

float _ballUnion(vec3 p, float k) {
  float d = sphere(p, gC0, gRad0);
  d = _foldBall(d, p, gC1,  gRad1,  k);
  d = _foldBall(d, p, gC2,  gRad2,  k);
  d = _foldBall(d, p, gC3,  gRad3,  k);
  d = _foldBall(d, p, gC4,  gRad4,  k);
  d = _foldBall(d, p, gC5,  gRad5,  k);
  d = _foldBall(d, p, gC6,  gRad6,  k);
  d = _foldBall(d, p, gC7,  gRad7,  k);
  d = _foldBall(d, p, gC8,  gRad8,  k);
  d = _foldBall(d, p, gC9,  gRad9,  k);
  d = _foldBall(d, p, gC10, gRad10, k);
  d = _foldBall(d, p, gC11, gRad11, k);
  return d;
}

// Cluster/Metaball/Burst each own a complete shape -- including noise, where relevant --
// mirroring _simulateCluster/_simulateMetaball/_simulateBurst in positionChunk.js.

const float SURFACE_NOISE_FREQ       = 4.0;
const float SURFACE_NOISE_TIME_SCALE = 0.75;
const float SURFACE_NOISE_AMPLITUDE  = 0.15;

// Ball union + noise-perturbed surface, parameterized by fusion tightness k -- Metaball, Burst
// and Cluster (below) differ only in how tightly the balls fuse (see SMIN_K at each call site).
float _noisyBallUnion(vec3 p, float k) {
  float d     = _ballUnion(p, k);
  float noise = perlin3D(p * SURFACE_NOISE_FREQ + time * SURFACE_NOISE_TIME_SCALE);
  return d + noise * SURFACE_NOISE_AMPLITUDE;
}

// Cylinder shrinks from an enclosing radius/height (wide enough to contain the balls' full
// orbit spread) down to its final CLUSTER_CYL_RADIUS/HALF_HEIGHT as Metaball fades out (driven
// by metaballBlend, not clusterBlend) -- so clusterSDF's intersection with the ball union below
// doesn't go hollow on the Metaball->Cluster handoff, while the balls are still spread across
// their real orbit and haven't caught up yet. Deliberately NOT tied to clusterBlend itself:
// that would also re-widen the cylinder on the way out into Burst, giving Burst an "expanding
// radius" instead of an immediate, already-thin one.
float _clusterCylinder(vec3 p) {
  const float RADIUS_FINAL      = ${glslFloat(CLUSTER_CYL_RADIUS)};
  const float HALF_HEIGHT_FINAL = ${glslFloat(CLUSTER_CYL_HALF_HEIGHT)};
  const float RADIUS_WIDE       = 2.5;  // encloses the widest ball orbit radius (2.35)
  const float HALF_HEIGHT_WIDE  = 1.0;  // matches reflectBounds' BY -- the balls' max y-extent
  const vec3  CENTER = vec3(${glslFloat(CLUSTER_CYL_CENTER_X)}, ${glslFloat(CLUSTER_CYL_CENTER_Y)}, 0.0);

  float shrink     = 1.0 - metaballBlend;
  float radius     = mix(RADIUS_WIDE,      RADIUS_FINAL,      shrink);
  float halfHeight = mix(HALF_HEIGHT_WIDE, HALF_HEIGHT_FINAL, shrink);
  return sdCappedCylinder(p - CENTER, radius, halfHeight);
}

// Intersection (max), not a union -- confines the balls to the cylinder's silhouette instead of
// letting them poke out past it, so Cluster reads as "metaballs cut off by the rod" rather than
// a rod with a separate blob cluster floating around it.
float clusterSDF(vec3 p) {
  const float SMIN_K = 0.35;
  return max(_clusterCylinder(p), _noisyBallUnion(p, SMIN_K));
}

float metaballSDF(vec3 p) {
  const float SMIN_K = 0.35;
  return _noisyBallUnion(p, SMIN_K);
}

float burstSDF(vec3 p) {
  const float SMIN_K = 0.10;  // tighter than metaball -- reads as "exploded" not "fused"
  return _noisyBallUnion(p, SMIN_K);
}

// Weighted crossfade, not a spatial union: clusterSDF is defined everywhere, so smin/min
// here would let the cylinder ghost through as solid geometry even at clusterBlend~0.
float map(vec3 p) {
  return clusterBlend * clusterSDF(p) + metaballBlend * metaballSDF(p) + burstBlend * burstSDF(p);
}

// Central-difference SDF gradient along one axis (offset is e.xyy/e.yxy/e.yyx).
float _centralDiff(vec3 p, vec3 offset) {
  return map(p + offset) - map(p - offset);
}

vec3 normal(vec3 p) {
  const float NORMAL_EPSILON = 0.001;  // finite-difference step for the SDF gradient
  vec2 e = vec2(NORMAL_EPSILON, 0.0);
  return normalize(vec3(
    _centralDiff(p, e.xyy),
    _centralDiff(p, e.yxy),
    _centralDiff(p, e.yyx)
  ));
}

float raymarch(vec3 ro, vec3 rd) {
  const int   MAX_STEPS    = 90;
  const float HIT_EPSILON  = 0.001;
  const float MAX_DISTANCE = 10.0;

  // map()'s cross-phase blend can misrepresent distance mid-crossfade (see map());
  // ease the step then. blendRisk ~0 once one phase dominates, so no cost normally.
  float blendRisk  = clusterBlend * (metaballBlend + burstBlend);
  float stepSafety = mix(1.0, 0.85, min(blendRisk * 4.0, 1.0));

  float t = 0.0;
  for (int i = 0; i < MAX_STEPS; i++) {
    float d = map(ro + rd * t);
    if (d < HIT_EPSILON) return t;
    t += d * stepSafety;
    if (t > MAX_DISTANCE) break;
  }
  return -1.0;
}
`;
