export const colorChunk = `


// ──── PHASE ENVIRONMENT ─────────────────────────────────────────────────────────────


const float ENVIRONMENT_EXPOSURE = 4.0;

vec3 _clusterEnvironment(vec3 direction, sampler2D sourceMap) {
  return _sampleDirectionalTexture(sourceMap, direction) * ENVIRONMENT_EXPOSURE;
}

vec3 _metaballEnvironment(vec3 direction, sampler2D sourceMap) {
  return _sampleDirectionalTexture(sourceMap, direction) * ENVIRONMENT_EXPOSURE;
}

vec3 _burstEnvironment(vec3 direction, sampler2D sourceMap) {
  return _sampleDirectionalTexture(sourceMap, direction) * ENVIRONMENT_EXPOSURE;
}


// ──── WEIGHTED BLENDING ───────────────────────────────────────────────────────────


vec3 _rotateAroundYAxis(vec3 direction) {
  const float ROTATION_SPEED = 0.018;
  float angle = time * ROTATION_SPEED;

  float cosineRotation = cos(angle);
  float sineRotation = sin(angle);
  return vec3(direction.x * cosineRotation - direction.z * sineRotation, direction.y, direction.x * sineRotation + direction.z * cosineRotation);
}

vec3 blendEnvironment(vec2 uv, sampler2D clusterSourceMap, sampler2D metaballSourceMap) {
  vec3 direction = _uvToDirection(uv);
  vec3 rotatedDirection = _rotateAroundYAxis(direction);

  return _metaballEnvironment(rotatedDirection, metaballSourceMap) * metaballBlend
       + _clusterEnvironment(rotatedDirection, clusterSourceMap) * clusterBlend
       + _burstEnvironment(rotatedDirection, metaballSourceMap) * burstBlend;
}
`;
