import { CLUSTER_SHAPE_VARIANTS } from '../src/constants.js';

export const shapeChunk = `


// ──── HELPER FUNCTIONS - PRIMITIVES ──────────────────────────────────────────────


float _smoothMin(float distanceA, float distanceB, float smoothing) {
  float blend = clamp(0.5 + 0.5 * (distanceB - distanceA) / smoothing, 0.0, 1.0);
  return mix(distanceB, distanceA, blend) - smoothing * blend * (1.0 - blend);
}

float _signedDistanceCylinder(vec3 point, float radius, float halfHeight) {
  vec2 outsideDistance = abs(vec2(length(point.xz), point.y)) - vec2(radius, halfHeight);
  return min(max(outsideDistance.x, outsideDistance.y), 0.0) + length(max(outsideDistance, 0.0));
}

float _signedDistanceSphere(vec3 point, float radius) {
  return length(point) - radius;
}

float _signedDistanceBox(vec3 point, vec3 halfExtents) {
  vec3 edgeDistance = abs(point) - halfExtents;
  return length(max(edgeDistance, 0.0)) + min(max(edgeDistance.x, max(edgeDistance.y, edgeDistance.z)), 0.0);
}

float _signedDistanceTorus(vec3 point, vec2 radii) {
  vec2 torusOffset = vec2(length(point.xz) - radii.x, point.y);
  return length(torusOffset) - radii.y;
}

float _signedDistanceCapsule(vec3 point, vec3 segmentStart, vec3 segmentEnd, float radius) {
  vec3 pointOffset = point - segmentStart;
  vec3 segmentVector = segmentEnd - segmentStart;
  float projection = clamp(dot(pointOffset, segmentVector) / dot(segmentVector, segmentVector), 0.0, 1.0);
  return length(pointOffset - segmentVector * projection) - radius;
}

const float PYRAMID_BASE_HALF_EXTENT = 0.5;

float _faceDistance(float absoluteCoordinate, float pointY, float height, float inverseNormalization) {
  return (height * absoluteCoordinate + PYRAMID_BASE_HALF_EXTENT * pointY - height * PYRAMID_BASE_HALF_EXTENT) * inverseNormalization;
}

float _signedDistancePyramid(vec3 point, float height) {
  float inverseNormalization = 1.0 / sqrt(height * height + PYRAMID_BASE_HALF_EXTENT * PYRAMID_BASE_HALF_EXTENT);

  float faceX = _faceDistance(abs(point.x), point.y, height, inverseNormalization);
  float faceZ = _faceDistance(abs(point.z), point.y, height, inverseNormalization);
  float base = -point.y;

  return max(max(faceX, faceZ), base);
}


// ──── HELPER FUNCTIONS - TRANSFORMATIONS ─────────────────────────────────────────


vec3 _rotateYX(vec3 point, float rotationY, float rotationX) {
  float cosineY = cos(rotationY), sineY = sin(rotationY);
  float cosineX = cos(rotationX), sineX = sin(rotationX);
  point.xz = mat2(cosineY, -sineY, sineY, cosineY) * point.xz;
  point.yz = mat2(cosineX, -sineX, sineX, cosineX) * point.yz;
  return point;
}


// ──── HELPER FUNCTIONS - BALL UNION ──────────────────────────────


float _foldBall(float accumulatedDistance, vec3 point, vec3 center, float radius, float smoothing) {
  return _smoothMin(accumulatedDistance, _signedDistanceSphere(point - center, radius), smoothing);
}

float _ballUnion(vec3 point, float smoothing) {
  float distance = _signedDistanceSphere(point - gC0, gRad0);
  distance = _foldBall(distance, point, gC1, gRad1, smoothing);
  distance = _foldBall(distance, point, gC2, gRad2, smoothing);
  distance = _foldBall(distance, point, gC3, gRad3, smoothing);
  distance = _foldBall(distance, point, gC4, gRad4, smoothing);
  distance = _foldBall(distance, point, gC5, gRad5, smoothing);
  distance = _foldBall(distance, point, gC6, gRad6, smoothing);
  distance = _foldBall(distance, point, gC7, gRad7, smoothing);
  distance = _foldBall(distance, point, gC8, gRad8, smoothing);
  distance = _foldBall(distance, point, gC9, gRad9, smoothing);
  distance = _foldBall(distance, point, gC10, gRad10, smoothing);
  distance = _foldBall(distance, point, gC11, gRad11, smoothing);
  return distance;
}

const float SURFACE_NOISE_FREQUENCY = 4.0;
const float SURFACE_NOISE_TIME_SCALE = 0.75;
const float SURFACE_NOISE_AMPLITUDE = 0.15;

float _noisyBallUnion(vec3 point, float smoothing) {
  float distance = _ballUnion(point, smoothing);
  float noise = perlin3D(point * SURFACE_NOISE_FREQUENCY + time * SURFACE_NOISE_TIME_SCALE);
  return distance + noise * SURFACE_NOISE_AMPLITUDE;
}


// ──── CLUSTER SHAPE - SDFS ────────────────────────────────────────────────────────────────


float cylinder(vec3 point) {
  const float RADIUS = 0.5;
  const float HALF_HEIGHT = 0.7;
  const float ROTATION_Y = 0.4;
  const float ROTATION_X = 0.5;

  vec3 rotatedPoint = _rotateYX(point, ROTATION_Y, ROTATION_X);
  return _signedDistanceCylinder(rotatedPoint, RADIUS, HALF_HEIGHT);
}

float sphere(vec3 point) {
  const float RADIUS = 0.7;
  return _signedDistanceSphere(point, RADIUS);
}

float box(vec3 point) {
  const float HALF_EXTENT = 0.66;
  const float ROTATION_Y = 0.4;
  const float ROTATION_X = 0.5;

  vec3 rotatedPoint = _rotateYX(point, ROTATION_Y, ROTATION_X);
  return _signedDistanceBox(rotatedPoint, vec3(HALF_EXTENT));
}

float torus(vec3 point) {
  const float RING_RADIUS = 0.7;
  const float TUBE_RADIUS = 0.18;
  const float ROTATION_Y = -0.3;
  const float ROTATION_X = 0.8;

  vec3 rotatedPoint = _rotateYX(point, ROTATION_Y, ROTATION_X);
  return _signedDistanceTorus(rotatedPoint, vec2(RING_RADIUS, TUBE_RADIUS));
}

float capsule(vec3 point) {
  const float HALF_LENGTH = 0.45;
  const float RADIUS = 0.56;
  const float ROTATION_Y = -0.4;
  const float ROTATION_X = 0.5;

  vec3 rotatedPoint = _rotateYX(point, ROTATION_Y, ROTATION_X);
  return _signedDistanceCapsule(rotatedPoint, vec3(0.0, -HALF_LENGTH, 0.0), vec3(0.0, HALF_LENGTH, 0.0), RADIUS);
}

float pyramid(vec3 point) {
  const float SCALE = 1.3;
  const float HEIGHT = 0.9;
  const float ROTATION_Y = 0.6;
  const float ROTATION_X = -0.3;

  vec3 rotatedPoint = _rotateYX(point, ROTATION_Y, ROTATION_X);
  vec3 local = rotatedPoint / SCALE;
  local.y += HEIGHT * 0.5;
  return _signedDistancePyramid(local, HEIGHT) * SCALE;
}


// ──── PHASE SHAPE ─────────────────────────────────────────────────


float _metaballShape(vec3 point) {
  const float SMIN_K = 0.35;
  return _noisyBallUnion(point, SMIN_K);
}

uniform int clusterShapeIndex;

float _clusterShape(vec3 point) {
  ${CLUSTER_SHAPE_VARIANTS.map((variant, index) => `if (clusterShapeIndex == ${index}) return ${variant}(point);`).join('\n  ')}
  return ${CLUSTER_SHAPE_VARIANTS[0]}(point);
}

float _burstShape(vec3 point) {
  const float SMIN_K = 0.10;
  return _noisyBallUnion(point, SMIN_K);
}


// ──── WEIGHTED BLENDING ───────────────────────────────────────────────────────────


float blendShape(vec3 point) {
  return _metaballShape(point) * metaballBlend
       + _clusterShape(point) * clusterBlend
       + _burstShape(point) * burstBlend;
}


// ──── HELPER FUNCTIONS - NORMALS ─────────────────────────────────────────────────


float _centralDifference(vec3 point, vec3 offset) {
  return blendShape(point + offset) - blendShape(point - offset);
}

vec3 normal(vec3 point) {
  const float NORMAL_EPSILON = 0.001;
  vec2 epsilonOffset = vec2(NORMAL_EPSILON, 0.0);
  return normalize(vec3(
    _centralDifference(point, epsilonOffset.xyy),
    _centralDifference(point, epsilonOffset.yxy),
    _centralDifference(point, epsilonOffset.yyx)
  ));
}
`;