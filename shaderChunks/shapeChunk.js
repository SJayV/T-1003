import {
  CLUSTER_CYL_RADIUS, CLUSTER_CYL_HALF_HEIGHT, CLUSTER_CYL_CENTER_X, CLUSTER_CYL_CENTER_Y,
  CLUSTER_SPHERE_RADIUS, CLUSTER_BOX_HALF_EXTENT, CLUSTER_BOX_ROTATION_Y, CLUSTER_BOX_ROTATION_X, glslFloat,
} from '../src/constants.js';

export const CLUSTER_SHAPE_VARIANTS = [
  'clusterCylinderFull', 'clusterCylinderIntersect',
  'clusterSphereFull',   'clusterSphereIntersect',
  'clusterBoxFull',      'clusterBoxIntersect',
];

export function shapeChunk(clusterVariant = 'clusterCylinderIntersect') {
  return `


// ──── HELPER FUNCTIONS - PRIMITIVES ──────────────────────────────────────────────


float sphere(vec3 p, vec3 c, float r) { return length(p - c) - r; }

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float sdCappedCylinder(vec3 p, float r, float h) {
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float sdSphere(vec3 p, float r) { return length(p) - r; }

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}


// ──── HELPER FUNCTIONS - BALL UNION ──────────────────────────────


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

const float SURFACE_NOISE_FREQ       = 4.0;
const float SURFACE_NOISE_TIME_SCALE = 0.75;
const float SURFACE_NOISE_AMPLITUDE  = 0.15;

float _noisyBallUnion(vec3 p, float k) {
  float d     = _ballUnion(p, k);
  float noise = perlin3D(p * SURFACE_NOISE_FREQ + time * SURFACE_NOISE_TIME_SCALE);
  return d + noise * SURFACE_NOISE_AMPLITUDE;
}


// ──── CLUSTER SHAPE - SDFS ────────────────────────────────────────────────────────────────


const vec3 CLUSTER_CENTER = vec3(${glslFloat(CLUSTER_CYL_CENTER_X)}, ${glslFloat(CLUSTER_CYL_CENTER_Y)}, 0.0);

float _clusterCylinder(vec3 p) {
  const float RADIUS      = ${glslFloat(CLUSTER_CYL_RADIUS)};
  const float HALF_HEIGHT = ${glslFloat(CLUSTER_CYL_HALF_HEIGHT)};
  return sdCappedCylinder(p - CLUSTER_CENTER, RADIUS, HALF_HEIGHT);
}

float _clusterSphere(vec3 p) {
  const float RADIUS = ${glslFloat(CLUSTER_SPHERE_RADIUS)};
  return sdSphere(p - CLUSTER_CENTER, RADIUS);
}

float _clusterBox(vec3 p) {
  const float HALF_EXTENT = ${glslFloat(CLUSTER_BOX_HALF_EXTENT)};
  const float ROTATION_Y  = ${glslFloat(CLUSTER_BOX_ROTATION_Y)};
  const float ROTATION_X  = ${glslFloat(CLUSTER_BOX_ROTATION_X)};
  float cy = cos(ROTATION_Y), sy = sin(ROTATION_Y);
  float cx = cos(ROTATION_X), sx = sin(ROTATION_X);
  vec3  pr = p - CLUSTER_CENTER;
  pr.xz = mat2(cy, -sy, sy, cy) * pr.xz;
  pr.yz = mat2(cx, -sx, sx, cx) * pr.yz;
  return sdBox(pr, vec3(HALF_EXTENT));
}


// ──── CLUSTER SHAPE - VARIANTS ──────────────────────────────────────────────────────


const float CLUSTER_SMIN_K = 0.35;

float _clusterIntersect(float shapeD, vec3 p) {
  float ballD = _noisyBallUnion(p, CLUSTER_SMIN_K);
  return mix(ballD, max(shapeD, ballD), 1.0 - metaballBlend);
}

float clusterCylinderFull(vec3 p)      { return _clusterCylinder(p); }
float clusterCylinderIntersect(vec3 p) { return _clusterIntersect(_clusterCylinder(p), p); }
float clusterSphereFull(vec3 p)        { return _clusterSphere(p); }
float clusterSphereIntersect(vec3 p)   { return _clusterIntersect(_clusterSphere(p), p); }
float clusterBoxFull(vec3 p)           { return _clusterBox(p); }
float clusterBoxIntersect(vec3 p)      { return _clusterIntersect(_clusterBox(p), p); }


// ──── PHASE SHAPE ─────────────────────────────────────────────────


float _metaballShape(vec3 p) {
  const float SMIN_K = 0.35;
  return _noisyBallUnion(p, SMIN_K);
}

float _clusterShape(vec3 p) { return ${clusterVariant}(p); }

float _burstShape(vec3 p) {
  const float SMIN_K = 0.10;
  return _noisyBallUnion(p, SMIN_K);
}


// ──── WEIGHTED BLENDING ───────────────────────────────────────────────────────────


float blendShape(vec3 p) {
  return _metaballShape(p) * metaballBlend
       + _clusterShape(p)  * clusterBlend
       + _burstShape(p)    * burstBlend;
}


// ──── HELPER FUNCTIONS - NORMALS ─────────────────────────────────────────────────


float _centralDiff(vec3 p, vec3 offset) {
  return blendShape(p + offset) - blendShape(p - offset);
}

vec3 normal(vec3 p) {
  const float NORMAL_EPSILON = 0.001;
  vec2 e = vec2(NORMAL_EPSILON, 0.0);
  return normalize(vec3(
    _centralDiff(p, e.xyy),
    _centralDiff(p, e.yxy),
    _centralDiff(p, e.yyx)
  ));
}


// ──── RAYMARCHING ─────────────────────────────────────────────────────────────────


float raymarch(vec3 ro, vec3 rd) {
  const int   MAX_STEPS    = 90;
  const float HIT_EPSILON  = 0.001;
  const float MAX_DISTANCE = 10.0;

  float blendRisk  = clusterBlend * (metaballBlend + burstBlend);
  float stepSafety = mix(1.0, 0.85, min(blendRisk * 4.0, 1.0));

  float t = 0.0;
  for (int i = 0; i < MAX_STEPS; i++) {
    float d = blendShape(ro + rd * t);
    if (d < HIT_EPSILON) return t;
    t += d * stepSafety;
    if (t > MAX_DISTANCE) break;
  }
  return -1.0;
}
`;
}
