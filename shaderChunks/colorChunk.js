import { METABALL_COLOR, CLUSTER_COLOR, BURST_COLOR, RIMLIGHT_COLOR, glslVec3 } from '../src/constants.js';

export const colorChunk = `

uniform float metaballBlend;
uniform float clusterBlend;
uniform float burstBlend;


// ──── PHASE COLORS ────────────────────────────────────────────────────────────────


const vec3 METABALL_COLOR = ${glslVec3(METABALL_COLOR)};
const vec3 CLUSTER_COLOR  = ${glslVec3(CLUSTER_COLOR)};
const vec3 BURST_COLOR    = ${glslVec3(BURST_COLOR)};

const vec3 RIMLIGHT_COLOR = ${glslVec3(RIMLIGHT_COLOR)};


// ──── HELPER FUNCTIONS - EQUIRECTANGULAR PROJECTION ─────────────────────────────────────


vec3 _uvToDir(vec2 uv) {
  const float PI = 3.14159265;
  float phi   = (uv.x - 0.5) * 2.0 * PI;
  float theta = (uv.y - 0.5) * PI;
  float cosT  = cos(theta);
  return vec3(cosT * cos(phi), sin(theta), cosT * sin(phi));
}

float _worleyContrast(float w, float scale, float contrast) {
  return pow(clamp(1.0 - w * scale, 0.0, 1.0), contrast);
}


// ──── HELPER FUNCTIONS - KEY LIGHT ───────────────────────────────────────────────


vec3 _envKeyLight(vec3 dir, vec3 rDir, float cosR, float sinR, vec3 tint) {
  const float WORLEY_FREQ     = 3.5;
  const float WORLEY_TIME     = 0.11;
  const float WORLEY_SCALE    = 1.6;
  const float WORLEY_CONTRAST = 8.0;
  const float KEY_DIR_X_ROT   = 1.2;
  const float KEY_DIR_X_CROSS = 0.8;
  const float KEY_DIR_Y       = 1.8;
  const float KEY_POWER       = 28.0;
  const float WORLEY_WEIGHT   = 6.0;
  const float KEY_WEIGHT      = 8.0;
  const float AMBIENT_FLOOR   = 1.5;

  float wB     = worley2D(rDir.xz * WORLEY_FREQ + time * WORLEY_TIME);
  float bB     = _worleyContrast(wB, WORLEY_SCALE, WORLEY_CONTRAST);
  vec3  keyDir = normalize(vec3(cosR * KEY_DIR_X_ROT - sinR * KEY_DIR_X_CROSS, KEY_DIR_Y, sinR * KEY_DIR_X_ROT + cosR * KEY_DIR_X_CROSS));
  float key    = pow(max(dot(dir, keyDir), 0.0), KEY_POWER);
  return tint * (AMBIENT_FLOOR + bB * WORLEY_WEIGHT + key * KEY_WEIGHT);
}


// ──── PHASE ENVIRONMENT ─────────────────────────────────────────────────────────────


vec3 _metaballEnvironment(vec3 dir, vec3 rDir, float cosR, float sinR) {
  return _envKeyLight(dir, rDir, cosR, sinR, METABALL_COLOR);
}

vec3 _clusterEnvironment(vec3 dir) {
  const float GRAD_LOW      = -0.4;
  const float GRAD_HIGH     = 1.0;
  const float GRAD_Y_WEIGHT = 0.75;
  const float GRAD_Z_WEIGHT = 0.25;
  const float BRIGHTNESS    = 0.55;

  float grad = smoothstep(GRAD_LOW, GRAD_HIGH, dir.y * GRAD_Y_WEIGHT + dir.z * GRAD_Z_WEIGHT);
  return CLUSTER_COLOR * grad * BRIGHTNESS;
}

vec3 _burstEnvironment(vec3 dir, vec3 rDir, float cosR, float sinR) {
  return _envKeyLight(dir, rDir, cosR, sinR, BURST_COLOR);
}


// ──── WEIGHTED BLENDING ───────────────────────────────────────────────────────────


vec3 blendColor() {
  return METABALL_COLOR * metaballBlend
       + CLUSTER_COLOR  * clusterBlend
       + BURST_COLOR    * burstBlend;
}

vec3 blendEnvironment(vec2 uv) {
  const float ROTATION_SPEED = 0.018;
  const float AMBIENT_METABALL_WEIGHT = 0.35;
  const float AMBIENT_CLUSTER_WEIGHT  = 0.012;
  const float AMBIENT_BURST_WEIGHT    = 0.005;
  const float AMBIENT_NOISE_FREQ_1    = 2.0;
  const float AMBIENT_NOISE_TIME_1    = 0.12;
  const float AMBIENT_NOISE_WEIGHT_1  = 0.65;
  const float AMBIENT_NOISE_FREQ_2    = 3.5;
  const float AMBIENT_NOISE_TIME_2    = 0.28;
  const float AMBIENT_NOISE_WEIGHT_2  = 0.35;
  const float AMBIENT_NOISE_FLOOR_MIN = 0.08;
  const float AMBIENT_NOISE_FLOOR_MAX = 0.55;

  vec3  dir  = _uvToDir(uv);
  float rot  = time * ROTATION_SPEED;
  float cosR = cos(rot);
  float sinR = sin(rot);
  vec3  rDir = vec3(dir.x * cosR - dir.z * sinR, dir.y, dir.x * sinR + dir.z * cosR);

  float ambientScale = metaballBlend * AMBIENT_METABALL_WEIGHT + clusterBlend * AMBIENT_CLUSTER_WEIGHT + burstBlend * AMBIENT_BURST_WEIGHT;
  vec3 base = blendColor() * ambientScale;
  float amb = dualOctaveNoise(rDir.xz * AMBIENT_NOISE_FREQ_1 + time * AMBIENT_NOISE_TIME_1, AMBIENT_NOISE_WEIGHT_1,
                              rDir.yz * AMBIENT_NOISE_FREQ_2 + time * AMBIENT_NOISE_TIME_2, AMBIENT_NOISE_WEIGHT_2) * 0.5 + 0.5;
  float noiseFloor = mix(AMBIENT_NOISE_FLOOR_MIN, AMBIENT_NOISE_FLOOR_MAX, metaballBlend);
  base *= noiseFloor + (1.0 - noiseFloor) * amb;
  base += _metaballEnvironment(dir, rDir, cosR, sinR) * metaballBlend
        + _clusterEnvironment(dir)                    * clusterBlend
        + _burstEnvironment(dir, rDir, cosR, sinR)    * burstBlend;
  return base;
}
`;
