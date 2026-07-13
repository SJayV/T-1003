// Public GLSL: MOOD_*, moodColor, blendEnvironment
// Everything that outputs a color from the three phase weights -- ball surface tint
// (moodColor, consumed by surfaceChunk.js) and sky color (blendEnvironment, consumed
// by environmentShader.js) are the same kind of thing, just different fragments.
// Declares own uniforms (metaballBlend, clusterBlend, burstBlend). Preconditions:
// worley2D, dualOctaveNoise (noiseChunk) in scope.

import { MOOD_METABALL, MOOD_CLUSTER, MOOD_BURST, MOOD_RIM, glslVec3 } from '../src/constants.js';

export const colorChunk = `

uniform float metaballBlend;
uniform float clusterBlend;
uniform float burstBlend;

// Each phase's own mood/envMap color, named directly after its phase -- ambient sky tint
// (moodColor() below) and env-map "key light" tint (envMetaball/envBurst below). Metaball and
// Burst also use these directly as their Cook-Torrance F0 surface tint in surfaceChunk.js's
// _shadeReflective -- no separate "metal" constant needed.
const vec3 MOOD_METABALL = ${glslVec3(MOOD_METABALL)};
const vec3 MOOD_CLUSTER  = ${glslVec3(MOOD_CLUSTER)};
const vec3 MOOD_BURST    = ${glslVec3(MOOD_BURST)};

// Rim light tint for Metaball and Burst (surfaceChunk.js's _shadeReflective) -- one shared
// constant so their rim light is identical by construction. Cluster uses MOOD_CLUSTER for its
// own rim call in shadeCluster instead, since it isn't part of this pairing.
const vec3 MOOD_RIM = ${glslVec3(MOOD_RIM)};

// Cross-phase blend of each phase's mood color, for blendEnvironment()'s ambient sky tint below.
// Per-phase shading functions read MOOD_METABALL/MOOD_CLUSTER/MOOD_BURST directly instead --
// shadeHit() already weights each of their full return values by the same three weights, so
// blending again inside would double up the weighting.
vec3 moodColor() {
  return MOOD_METABALL * metaballBlend
       + MOOD_CLUSTER  * clusterBlend
       + MOOD_BURST    * burstBlend;
}

// Equirectangular UV -> world direction. Only environmentShader.js needs this, but it's
// small and purely a function of colorChunk's own inputs -- kept local to blendEnvironment's
// call graph rather than duplicated in that shader file.
vec3 _uvToDir(vec2 uv) {
  const float PI = 3.14159265;
  float phi   = (uv.x - 0.5) * 2.0 * PI;
  float theta = (uv.y - 0.5) * PI;
  float cosT  = cos(theta);
  return vec3(cosT * cos(phi), sin(theta), cosT * sin(phi));
}

// Remaps a worley distance into a high-contrast [0,1] band.
float _worleyContrast(float w, float scale, float contrast) {
  return pow(clamp(1.0 - w * scale, 0.0, 1.0), contrast);
}

// Worley-speckled directional "key light", tinted by tint. Shared by Metaball and
// Burst's sky color. AMBIENT_FLOOR keeps the background above black between
// speckles/key light, so Burst reads as tinted orange throughout rather than
// orange highlights on black.
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

vec3 envMetaball(vec3 dir, vec3 rDir, float cosR, float sinR) {
  return _envKeyLight(dir, rDir, cosR, sinR, MOOD_METABALL);
}

vec3 envCluster(vec3 dir) {
  const float GRAD_LOW      = -0.4;
  const float GRAD_HIGH     = 1.0;
  const float GRAD_Y_WEIGHT = 0.75;
  const float GRAD_Z_WEIGHT = 0.25;
  const float BRIGHTNESS    = 0.55;

  float grad = smoothstep(GRAD_LOW, GRAD_HIGH, dir.y * GRAD_Y_WEIGHT + dir.z * GRAD_Z_WEIGHT);
  return MOOD_CLUSTER * grad * BRIGHTNESS;
}

vec3 envBurst(vec3 dir, vec3 rDir, float cosR, float sinR) {
  return _envKeyLight(dir, rDir, cosR, sinR, MOOD_BURST);
}

// Always-on 3-way blend of the per-phase sky colors -- no hard switch, mirroring
// moodColor()/shadeHit(). Preset overrides are applied by forcing these uniforms
// to 0/1 before this shader runs (see src/environment.js), not by branching here.
// Takes the raw equirectangular uv (environmentShader.js's only job is computing that
// from gl_FragCoord/resolution) and owns the rest -- direction, sky rotation, blend.
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
  vec3 base = moodColor() * ambientScale;
  float amb = dualOctaveNoise(rDir.xz * AMBIENT_NOISE_FREQ_1 + time * AMBIENT_NOISE_TIME_1, AMBIENT_NOISE_WEIGHT_1,
                              rDir.yz * AMBIENT_NOISE_FREQ_2 + time * AMBIENT_NOISE_TIME_2, AMBIENT_NOISE_WEIGHT_2) * 0.5 + 0.5;
  float noiseFloor = mix(AMBIENT_NOISE_FLOOR_MIN, AMBIENT_NOISE_FLOOR_MAX, metaballBlend);
  base *= noiseFloor + (1.0 - noiseFloor) * amb;
  base += envMetaball(dir, rDir, cosR, sinR) * metaballBlend;
  base += envCluster(dir)                    * clusterBlend;
  base += envBurst(dir, rDir, cosR, sinR)    * burstBlend;
  return base;
}
`;
