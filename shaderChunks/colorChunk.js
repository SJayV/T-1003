export const colorChunk = `

uniform float metaballBlend;
uniform float clusterBlend;
uniform float burstBlend;


// ──── HELPER FUNCTIONS - EQUIRECTANGULAR PROJECTION ─────────────────────────────────────


vec3 _uvToDir(vec2 uv) {
  const float PI = 3.14159265;
  float phi   = (uv.x - 0.5) * 2.0 * PI;
  float theta = (uv.y - 0.5) * PI;
  float cosT  = cos(theta);
  return vec3(cosT * cos(phi), sin(theta), cosT * sin(phi));
}

vec2 _dirToUV(vec3 dir) {
  const float PI = 3.14159265;
  return vec2(atan(dir.z, dir.x) / (2.0 * PI) + 0.5,
              asin(clamp(dir.y, -1.0, 1.0)) / PI + 0.5);
}

vec3 _sampleEquirect(vec3 dir, sampler2D sourceMap) {
  return texture2D(sourceMap, _dirToUV(dir)).rgb;
}


// ──── PHASE ENVIRONMENT ─────────────────────────────────────────────────────────────


const float CLUSTER_ENV_EXPOSURE = 2.5;
const float METABALL_ENV_EXPOSURE = 3.0;

vec3 _clusterEnvironment(vec3 dir, sampler2D sourceMap) {
  return _sampleEquirect(dir, sourceMap) * CLUSTER_ENV_EXPOSURE;
}

vec3 _metaballEnvironment(vec3 rDir, sampler2D sourceMap) {
  return _sampleEquirect(rDir, sourceMap) * METABALL_ENV_EXPOSURE;
}

vec3 _burstEnvironment(vec3 rDir, sampler2D sourceMap) {
  return _sampleEquirect(rDir, sourceMap) * METABALL_ENV_EXPOSURE;
}


// ──── WEIGHTED BLENDING ───────────────────────────────────────────────────────────


vec3 blendEnvironment(vec2 uv, sampler2D clusterSourceMap, sampler2D metaballSourceMap) {
  const float ROTATION_SPEED = 0.018;

  vec3  dir  = _uvToDir(uv);
  float rot  = time * ROTATION_SPEED;
  float cosR = cos(rot);
  float sinR = sin(rot);
  vec3  rDir = vec3(dir.x * cosR - dir.z * sinR, dir.y, dir.x * sinR + dir.z * cosR);

  return _metaballEnvironment(rDir, metaballSourceMap) * metaballBlend
       + _clusterEnvironment(rDir, clusterSourceMap)   * clusterBlend
       + _burstEnvironment(rDir, metaballSourceMap)    * burstBlend;
}
`;
