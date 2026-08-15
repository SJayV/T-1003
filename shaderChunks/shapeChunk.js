import { CLUSTER_SHAPE_VARIANTS } from '../src/constants.js';

export const shapeChunk = `


// ──── HELPER FUNCTIONS - DISTANCE MATH ─────────────────────────────────────


float _generalizedNorm2D(float valueA, float valueB, float exponent) {
  return pow(pow(abs(valueA), exponent) + pow(abs(valueB), exponent), 1.0 / exponent);
}

float _faceDistance(float absoluteCoordinate, float pointY, float height, float baseHalfExtent, float inverseNormalization) {
  return (height * absoluteCoordinate + baseHalfExtent * pointY - height * baseHalfExtent) * inverseNormalization;
}


// ──── HELPER FUNCTIONS - SIGNED DISTANCES ──────────────────────────────────


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

float _signedDistanceSuperquadric(vec3 point, vec3 halfExtents, float exponentEastWest, float exponentNorthSouth) {
  vec3 scaled = point / halfExtents;
  float radialNorm = _generalizedNorm2D(scaled.x, scaled.y, 2.0 / exponentEastWest);
  float totalNorm = _generalizedNorm2D(radialNorm, scaled.z, 2.0 / exponentNorthSouth);
  return (totalNorm - 1.0) * min(halfExtents.x, min(halfExtents.y, halfExtents.z));
}

float _signedDistancePyramid(vec3 point, float height) {
  const float PYRAMID_BASE_HALF_EXTENT = 0.5;

  float inverseNormalization = 1.0 / sqrt(height * height + PYRAMID_BASE_HALF_EXTENT * PYRAMID_BASE_HALF_EXTENT);

  float faceX = _faceDistance(abs(point.x), point.y, height, PYRAMID_BASE_HALF_EXTENT, inverseNormalization);
  float faceZ = _faceDistance(abs(point.z), point.y, height, PYRAMID_BASE_HALF_EXTENT, inverseNormalization);
  float base = -point.y;

  return max(max(faceX, faceZ), base);
}


// ──── HELPER FUNCTIONS - TRANSFORMATIONS ───────────────────────────────────


vec3 _rotateYX(vec3 point, float speedY, float speedX) {
  float rotationY = speedY * time;
  float rotationX = speedX * time;
  float cosineY = cos(rotationY), sineY = sin(rotationY);
  float cosineX = cos(rotationX), sineX = sin(rotationX);
  point.xz = mat2(cosineY, -sineY, sineY, cosineY) * point.xz;
  point.yz = mat2(cosineX, -sineX, sineX, cosineX) * point.yz;
  return point;
}

float _pulse() {
  const float CYCLE_LENGTH = 1.4345;
  const float PULSE_GAP = 0.28;
  const float PULSE_SHARPNESS = 50.0;
  const float PULSE_AMPLITUDE = 0.02;
  const float PULSE_OFFSET = 0.5;

  float phase = fract(time / CYCLE_LENGTH);
  float beatA = pow(max(cos(PI * phase - PULSE_OFFSET), 0.0), PULSE_SHARPNESS);
  float beatB = pow(max(cos(PI * (phase - PULSE_GAP) - PULSE_OFFSET), 0.0), PULSE_SHARPNESS);
  return 1.0 + PULSE_AMPLITUDE * (beatA + beatB);
}


// ──── HELPER FUNCTIONS - BALL UNION ────────────────────────────────────────


float _smoothMin(float distanceA, float distanceB, float smoothing) {
  float blend = clamp(0.5 + 0.5 * (distanceB - distanceA) / smoothing, 0.0, 1.0);
  return mix(distanceB, distanceA, blend) - smoothing * blend * (1.0 - blend);
}

float _foldBall(float accumulatedDistance, vec3 point, vec3 center, float radius, float smoothing) {
  return _smoothMin(accumulatedDistance, _signedDistanceSphere(point - center, radius), smoothing);
}

float _ballUnion(vec3 point, float smoothing) {
  float distance = _signedDistanceSphere(point - _ballCenter0, _ballRadius0);
  distance = _foldBall(distance, point, _ballCenter1, _ballRadius1, smoothing);
  distance = _foldBall(distance, point, _ballCenter2, _ballRadius2, smoothing);
  distance = _foldBall(distance, point, _ballCenter3, _ballRadius3, smoothing);
  distance = _foldBall(distance, point, _ballCenter4, _ballRadius4, smoothing);
  distance = _foldBall(distance, point, _ballCenter5, _ballRadius5, smoothing);
  distance = _foldBall(distance, point, _ballCenter6, _ballRadius6, smoothing);
  distance = _foldBall(distance, point, _ballCenter7, _ballRadius7, smoothing);
  distance = _foldBall(distance, point, _ballCenter8, _ballRadius8, smoothing);
  distance = _foldBall(distance, point, _ballCenter9, _ballRadius9, smoothing);
  distance = _foldBall(distance, point, _ballCenter10, _ballRadius10, smoothing);
  distance = _foldBall(distance, point, _ballCenter11, _ballRadius11, smoothing);
  return distance;
}

float _noisyBallUnion(vec3 point, float smoothing) {
  const float SURFACE_NOISE_FREQUENCY = 4.0;
  const float SURFACE_NOISE_TIME_SCALE = 0.15;
  const float SURFACE_NOISE_AMPLITUDE = 0.15;

  float distance = _ballUnion(point, smoothing);
  float noise = perlin3D(point * SURFACE_NOISE_FREQUENCY + time * SURFACE_NOISE_TIME_SCALE);
  return distance + noise * SURFACE_NOISE_AMPLITUDE;
}


// ──── CLUSTER SHAPE - SDFS ─────────────────────────────────────────────────


float box(vec3 point) {
  const float HALF_EXTENT = 0.66;
  const float ROTATION_SPEED_Y = 0.025;
  const float ROTATION_SPEED_X = 0.05;

  float pulse = _pulse();
  vec3 rotatedPoint = _rotateYX(point, ROTATION_SPEED_Y, ROTATION_SPEED_X);
  return _signedDistanceBox(rotatedPoint / pulse, vec3(HALF_EXTENT)) * pulse;
}

float torus(vec3 point) {
  const float RING_RADIUS = 0.7;
  const float TUBE_RADIUS = 0.18;
  const float ROTATION_SPEED_Y = -0.025;
  const float ROTATION_SPEED_X = 0.06;

  float pulse = _pulse();
  vec3 rotatedPoint = _rotateYX(point, ROTATION_SPEED_Y, ROTATION_SPEED_X);
  return _signedDistanceTorus(rotatedPoint / pulse, vec2(RING_RADIUS, TUBE_RADIUS)) * pulse;
}

float pyramid(vec3 point) {
  const float SCALE = 1.8;
  const float HEIGHT = 0.9;
  const float ROTATION_SPEED_Y = 0.06;
  const float ROTATION_SPEED_X = -0.035;

  float totalScale = SCALE * _pulse();
  vec3 rotatedPoint = _rotateYX(point, ROTATION_SPEED_Y, ROTATION_SPEED_X);
  vec3 local = rotatedPoint / totalScale;
  local.y += HEIGHT * 0.5;
  return _signedDistancePyramid(local, HEIGHT) * totalScale;
}

float superquadric(vec3 point) {
  const vec3 HALF_EXTENTS = vec3(0.9);
  const float EXPONENT_MIN = 0.2;
  const float EXPONENT_RANGE = 2.3;
  const float FREQUENCY_EAST_WEST = 0.02;
  const float FREQUENCY_NORTH_SOUTH = 0.0282840492;
  const float ROTATION_SPEED = 0.02;
  const float STEP_SAFETY = 0.35;

  float exponentEastWest = EXPONENT_MIN + 0.5 * EXPONENT_RANGE * (1.0 + sin(FREQUENCY_EAST_WEST * time));
  float exponentNorthSouth = EXPONENT_MIN + 0.5 * EXPONENT_RANGE * (1.0 + sin(FREQUENCY_NORTH_SOUTH * time));

  float pulse = _pulse();
  vec3 rotatedPoint = _rotateYX(point, ROTATION_SPEED, ROTATION_SPEED);
  return _signedDistanceSuperquadric(rotatedPoint / pulse, HALF_EXTENTS, exponentEastWest, exponentNorthSouth) * STEP_SAFETY * pulse;
}


// ──── PHASE SHAPE ──────────────────────────────────────────────────────────


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


// ──── WEIGHTED BLENDING ────────────────────────────────────────────────────


float blendShape(vec3 point) {
  return _metaballShape(point) * metaballWeight
       + _clusterShape(point) * clusterWeight
       + _burstShape(point) * burstWeight;
}


// ──── HELPER FUNCTIONS - NORMALS ───────────────────────────────────────────


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