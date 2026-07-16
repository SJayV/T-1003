import {
  CLUSTER_CYL_RADIUS, CLUSTER_CYL_HALF_HEIGHT, CLUSTER_CYL_CENTER_X, CLUSTER_CYL_CENTER_Y,
  CLUSTER_SPHERE_RADIUS,
  CLUSTER_BOX_HALF_EXTENT,
  CLUSTER_CYL_ROTATION_Y, CLUSTER_CYL_ROTATION_X,
  CLUSTER_BOX_ROTATION_Y, CLUSTER_BOX_ROTATION_X,
  CLUSTER_TORUS_RING_RADIUS, CLUSTER_TORUS_TUBE_RADIUS,
  CLUSTER_TORUS_ROTATION_Y, CLUSTER_TORUS_ROTATION_X,
  CLUSTER_CAPSULE_HALF_LENGTH, CLUSTER_CAPSULE_RADIUS,
  CLUSTER_CAPSULE_ROTATION_Y, CLUSTER_CAPSULE_ROTATION_X,
  CLUSTER_PYRAMID_SCALE, CLUSTER_PYRAMID_HEIGHT,
  CLUSTER_PYRAMID_ROTATION_Y, CLUSTER_PYRAMID_ROTATION_X,
  glslFloat,
} from '../src/constants.js';

export function shapeChunk(clusterVariant = 'clusterCylinderIntersect') {
  return `


// ──── HELPER FUNCTIONS - PRIMITIVES ──────────────────────────────────────────────


float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float _sdCappedCylinder(vec3 p, float r, float h) {
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float _sdSphere(vec3 p, float r) {
  return length(p) - r;
}

float _sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float _sdTorus(vec3 p, vec2 t) {
  vec2 q = vec2(length(p.xz) - t.x, p.y);
  return length(q) - t.y;
}

float _sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

float _sdPyramid(vec3 p, float h) {
  const float BASE_HALF_EXTENT = 0.5;
  float invNorm = 1.0 / sqrt(h * h + BASE_HALF_EXTENT * BASE_HALF_EXTENT);

  float x = abs(p.x);
  float z = abs(p.z);

  float faceX = (h * x + BASE_HALF_EXTENT * p.y - h * BASE_HALF_EXTENT) * invNorm;
  float faceZ = (h * z + BASE_HALF_EXTENT * p.y - h * BASE_HALF_EXTENT) * invNorm;
  float base  = -p.y;

  return max(max(faceX, faceZ), base);
}


// ──── HELPER FUNCTIONS - BALL UNION ──────────────────────────────


float _foldBall(float d, vec3 p, vec3 c, float r, float k) {
  return smin(d, _sdSphere(p - c, r), k);
}

float _ballUnion(vec3 p, float k) {
  float d = _sdSphere(p - gC0, gRad0);
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

vec3 _rotateYX(vec3 p, float ry, float rx) {
  float cy = cos(ry), sy = sin(ry);
  float cx = cos(rx), sx = sin(rx);
  p.xz = mat2(cy, -sy, sy, cy) * p.xz;
  p.yz = mat2(cx, -sx, sx, cx) * p.yz;
  return p;
}

float _clusterCylinder(vec3 p) {
  const float RADIUS      = ${glslFloat(CLUSTER_CYL_RADIUS)};
  const float HALF_HEIGHT = ${glslFloat(CLUSTER_CYL_HALF_HEIGHT)};
  const float ROTATION_Y  = ${glslFloat(CLUSTER_CYL_ROTATION_Y)};
  const float ROTATION_X  = ${glslFloat(CLUSTER_CYL_ROTATION_X)};

  vec3 pr = _rotateYX(p - CLUSTER_CENTER, ROTATION_Y, ROTATION_X);
  return _sdCappedCylinder(pr, RADIUS, HALF_HEIGHT);
}

float _clusterSphere(vec3 p) {
  const float RADIUS = ${glslFloat(CLUSTER_SPHERE_RADIUS)};
  return _sdSphere(p - CLUSTER_CENTER, RADIUS);
}

float _clusterBox(vec3 p) {
  const float HALF_EXTENT = ${glslFloat(CLUSTER_BOX_HALF_EXTENT)};
  const float ROTATION_Y  = ${glslFloat(CLUSTER_BOX_ROTATION_Y)};
  const float ROTATION_X  = ${glslFloat(CLUSTER_BOX_ROTATION_X)};

  vec3 pr = _rotateYX(p - CLUSTER_CENTER, ROTATION_Y, ROTATION_X);
  return _sdBox(pr, vec3(HALF_EXTENT));
}

float _clusterTorus(vec3 p) {
  const float RING_RADIUS = ${glslFloat(CLUSTER_TORUS_RING_RADIUS)};
  const float TUBE_RADIUS = ${glslFloat(CLUSTER_TORUS_TUBE_RADIUS)};
  const float ROTATION_Y  = ${glslFloat(CLUSTER_TORUS_ROTATION_Y)};
  const float ROTATION_X  = ${glslFloat(CLUSTER_TORUS_ROTATION_X)};

  vec3 pr = _rotateYX(p - CLUSTER_CENTER, ROTATION_Y, ROTATION_X);
  return _sdTorus(pr, vec2(RING_RADIUS, TUBE_RADIUS));
}

float _clusterCapsule(vec3 p) {
  const float HALF_LENGTH = ${glslFloat(CLUSTER_CAPSULE_HALF_LENGTH)};
  const float RADIUS      = ${glslFloat(CLUSTER_CAPSULE_RADIUS)};
  const float ROTATION_Y  = ${glslFloat(CLUSTER_CAPSULE_ROTATION_Y)};
  const float ROTATION_X  = ${glslFloat(CLUSTER_CAPSULE_ROTATION_X)};

  vec3 pr = _rotateYX(p - CLUSTER_CENTER, ROTATION_Y, ROTATION_X);
  return _sdCapsule(pr, vec3(0.0, -HALF_LENGTH, 0.0), vec3(0.0, HALF_LENGTH, 0.0), RADIUS);
}

float _clusterPyramid(vec3 p) {
  const float SCALE       = ${glslFloat(CLUSTER_PYRAMID_SCALE)};
  const float HEIGHT      = ${glslFloat(CLUSTER_PYRAMID_HEIGHT)};
  const float ROTATION_Y  = ${glslFloat(CLUSTER_PYRAMID_ROTATION_Y)};
  const float ROTATION_X  = ${glslFloat(CLUSTER_PYRAMID_ROTATION_X)};

  vec3 pr    = _rotateYX(p - CLUSTER_CENTER, ROTATION_Y, ROTATION_X);
  vec3 local = pr / SCALE;
  local.y   += HEIGHT * 0.5;
  return _sdPyramid(local, HEIGHT) * SCALE;
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
float clusterTorusFull(vec3 p)         { return _clusterTorus(p); }
float clusterCapsuleFull(vec3 p)       { return _clusterCapsule(p); }
float clusterPyramidFull(vec3 p)       { return _clusterPyramid(p); }


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
