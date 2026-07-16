import {
  CLUSTER_CYL_RADIUS, CLUSTER_CYL_HALF_HEIGHT,
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
  CLUSTER_SHAPE_VARIANTS,
  glslFloat,
} from '../src/constants.js';

export const shapeChunk = `


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


// ──── HELPER FUNCTIONS - TRANSFORMATIONS ─────────────────────────────────────────


vec3 _rotateYX(vec3 p, float ry, float rx) {
  float cy = cos(ry), sy = sin(ry);
  float cx = cos(rx), sx = sin(rx);
  p.xz = mat2(cy, -sy, sy, cy) * p.xz;
  p.yz = mat2(cx, -sx, sx, cx) * p.yz;
  return p;
}

// Adapted from Inigo Quilez's opTwist (iquilezles.org/articles/distfunctions) -- GLSL ES 1.00 has no
// function types, so this can't take a primitive callback and return primitive(q) like the original.
// Instead it returns the twisted point for the caller to feed into any primitive fn, e.g.
// _sdCappedCylinder(_opTwist(p, k), r, h). Also keeps p.y as the height axis (matching every
// primitive above), unlike iq's q = vec3(m*p.xz, p.y), which swaps the height into q.z.
vec3 _opTwist(vec3 p, float k) {
  float c = cos(k * p.y);
  float s = sin(k * p.y);
  mat2  m = mat2(c, -s, s, c);
  vec2  q = m * p.xz;
  return vec3(q.x, p.y, q.y);
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


float clusterCylinder(vec3 p) {
  const float RADIUS      = ${glslFloat(CLUSTER_CYL_RADIUS)};
  const float HALF_HEIGHT = ${glslFloat(CLUSTER_CYL_HALF_HEIGHT)};
  const float ROTATION_Y  = ${glslFloat(CLUSTER_CYL_ROTATION_Y)};
  const float ROTATION_X  = ${glslFloat(CLUSTER_CYL_ROTATION_X)};

  vec3 pr = _rotateYX(p, ROTATION_Y, ROTATION_X);
  return _sdCappedCylinder(pr, RADIUS, HALF_HEIGHT);
}

float clusterSphere(vec3 p) {
  const float RADIUS = ${glslFloat(CLUSTER_SPHERE_RADIUS)};
  return _sdSphere(p, RADIUS);
}

float clusterBox(vec3 p) {
  const float HALF_EXTENT = ${glslFloat(CLUSTER_BOX_HALF_EXTENT)};
  const float ROTATION_Y  = ${glslFloat(CLUSTER_BOX_ROTATION_Y)};
  const float ROTATION_X  = ${glslFloat(CLUSTER_BOX_ROTATION_X)};

  vec3 pr = _rotateYX(p, ROTATION_Y, ROTATION_X);
  return _sdBox(pr, vec3(HALF_EXTENT));
}

float clusterTorus(vec3 p) {
  const float RING_RADIUS = ${glslFloat(CLUSTER_TORUS_RING_RADIUS)};
  const float TUBE_RADIUS = ${glslFloat(CLUSTER_TORUS_TUBE_RADIUS)};
  const float ROTATION_Y  = ${glslFloat(CLUSTER_TORUS_ROTATION_Y)};
  const float ROTATION_X  = ${glslFloat(CLUSTER_TORUS_ROTATION_X)};

  vec3 pr = _rotateYX(p, ROTATION_Y, ROTATION_X);
  return _sdTorus(pr, vec2(RING_RADIUS, TUBE_RADIUS));
}

float clusterCapsule(vec3 p) {
  const float HALF_LENGTH = ${glslFloat(CLUSTER_CAPSULE_HALF_LENGTH)};
  const float RADIUS      = ${glslFloat(CLUSTER_CAPSULE_RADIUS)};
  const float ROTATION_Y  = ${glslFloat(CLUSTER_CAPSULE_ROTATION_Y)};
  const float ROTATION_X  = ${glslFloat(CLUSTER_CAPSULE_ROTATION_X)};

  vec3 pr = _rotateYX(p, ROTATION_Y, ROTATION_X);
  return _sdCapsule(pr, vec3(0.0, -HALF_LENGTH, 0.0), vec3(0.0, HALF_LENGTH, 0.0), RADIUS);
}

float clusterPyramid(vec3 p) {
  const float SCALE       = ${glslFloat(CLUSTER_PYRAMID_SCALE)};
  const float HEIGHT      = ${glslFloat(CLUSTER_PYRAMID_HEIGHT)};
  const float ROTATION_Y  = ${glslFloat(CLUSTER_PYRAMID_ROTATION_Y)};
  const float ROTATION_X  = ${glslFloat(CLUSTER_PYRAMID_ROTATION_X)};

  vec3 pr    = _rotateYX(p, ROTATION_Y, ROTATION_X);
  vec3 local = pr / SCALE;
  local.y   += HEIGHT * 0.5;
  return _sdPyramid(local, HEIGHT) * SCALE;
}


// ──── PHASE SHAPE ─────────────────────────────────────────────────


float _metaballShape(vec3 p) {
  const float SMIN_K = 0.35;
  return _noisyBallUnion(p, SMIN_K);
}

// GLSL ES 1.00 has no function pointers/first-class functions, so a runtime index can't index
// into an array of function references the way CLUSTER_SHAPE_VARIANTS is indexed in JS -- the
// mapping is still reused, just one level up: this if-chain is generated from that very array,
// so the JS-side name list and the GLSL-side dispatch order can never drift apart.
uniform int clusterShapeIndex;

float _clusterShape(vec3 p) {
  ${CLUSTER_SHAPE_VARIANTS.map((variant, i) => `if (clusterShapeIndex == ${i}) return ${variant}(p);`).join('\n  ')}
  return ${CLUSTER_SHAPE_VARIANTS[0]}(p);
}

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
`;
