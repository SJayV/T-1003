import { vertexChunk } from '../shaderChunks/vertexChunk.js';
import { noiseChunk  } from '../shaderChunks/noiseChunk.js';
import { moodChunk   } from '../shaderChunks/moodChunk.js';

export const environmentVert = vertexChunk;

export const environmentFrag = `
precision highp float;

uniform float time;
uniform vec2  resolution;
uniform float envSelect;  // 0=auto, 1=unused, 2=metaball, 3=cluster, 4=burst — set via setEnvPreset()

${noiseChunk}
${moodChunk}

const float PI = 3.14159265;

vec3 uvToDir(vec2 uv) {
  float phi   = (uv.x - 0.5) * 2.0 * PI;
  float theta = (uv.y - 0.5) * PI;
  float cosT  = cos(theta);
  return vec3(cosT * cos(phi), sin(theta), cosT * sin(phi));
}

// Returns a normalised colour direction: vec3(1) = grey, tinted toward band colours.
// Mix weight controls saturation; output is always a positive, bounded colour vector.
vec3 _envBands(vec3 dir, vec3 rDir) {
  const float NOISE_FREQ_1   = 1.8;
  const float NOISE_TIME_1   = 0.020;
  const float NOISE_WEIGHT_1 = 0.28;
  const float NOISE_FREQ_2   = 3.1;
  const float NOISE_TIME_2   = 0.033;
  const float NOISE_WEIGHT_2 = 0.10;
  const float BAND_OFFSET        = 0.70;  // vertical offset of the two outer bands from center
  const float OUTER_BAND_SOFTNESS  = 0.22;
  const float CENTER_BAND_SOFTNESS = 0.32;
  const float OUTER_BAND_TINT_STRENGTH  = 0.75;
  const float CENTER_BAND_TINT_STRENGTH = 0.80;

  float n = dualOctaveNoise(rDir.xz * NOISE_FREQ_1 + time * NOISE_TIME_1, NOISE_WEIGHT_1,
                            rDir.xy * NOISE_FREQ_2 + time * NOISE_TIME_2, NOISE_WEIGHT_2);
  float bPos = dir.y + n;

  float aw1 = 1.0 - smoothstep(0.0, OUTER_BAND_SOFTNESS, abs(bPos + BAND_OFFSET));
  float bw  = 1.0 - smoothstep(0.0, CENTER_BAND_SOFTNESS, abs(bPos));
  float aw2 = 1.0 - smoothstep(0.0, OUTER_BAND_SOFTNESS, abs(bPos - BAND_OFFSET));

  vec3 grey     = vec3(0.88, 0.91, 0.96);
  vec3 paleBlue = vec3(0.3, 0.58, 0.82);   // named "bordeaux" pre-refactor despite being a light blue, not maroon — renamed to match its actual colour
  vec3 azure    = vec3(0.04, 0.32, 1.0);

  vec3 color = grey;
  color = mix(color, azure,    aw1 * OUTER_BAND_TINT_STRENGTH);
  color = mix(color, paleBlue, bw  * CENTER_BAND_TINT_STRENGTH);
  color = mix(color, azure,    aw2 * OUTER_BAND_TINT_STRENGTH);
  return color;
}

// Remaps a worley distance into a high-contrast [0,1] band: pow(clamp(1 - w*scale, 0, 1), contrast).
// Same shape used by envMetaball (on min of two samples) and envBurst (on one).
float _worleyContrast(float w, float scale, float contrast) {
  return pow(clamp(1.0 - w * scale, 0.0, 1.0), contrast);
}

vec3 envMetaball(vec3 dir, vec3 rDir) {
  const float GRAD_Y_WEIGHT     = 0.7;
  const float GRAD_Z_WEIGHT     = 0.3;
  const float BRIGHTNESS_BASE   = 0.8;
  const float BRIGHTNESS_RANGE  = 0.60;
  const float WORLEY_FREQ_1     = 1.0;
  const float WORLEY_TIME_1     = 0.06;
  const float WORLEY_FREQ_2     = 1.6;
  const float WORLEY_TIME_2     = 0.04;
  const float WORLEY_SCALE      = 1.1;
  const float WORLEY_CONTRAST   = 2.0;
  const float VARIATION_FLOOR   = 0.78;
  const float VARIATION_RANGE   = 0.38;

  float grad       = smoothstep(-1.0, 1.0, dir.y * GRAD_Y_WEIGHT + dir.z * GRAD_Z_WEIGHT);
  float brightness = BRIGHTNESS_BASE + BRIGHTNESS_RANGE * grad;

  // Worley as brightness multiplier (floor VARIATION_FLOOR) — variation without dark patches.
  float wM1       = worley2D(rDir.xy * WORLEY_FREQ_1 + time * WORLEY_TIME_1);
  float wM2       = worley2D(rDir.xz * WORLEY_FREQ_2 + time * WORLEY_TIME_2);
  float bM        = _worleyContrast(min(wM1, wM2), WORLEY_SCALE, WORLEY_CONTRAST);
  float variation = VARIATION_FLOOR + VARIATION_RANGE * bM;

  return _envBands(dir, rDir) * brightness * variation;
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

  float wB     = worley2D(rDir.xz * WORLEY_FREQ + time * WORLEY_TIME);
  float bB     = _worleyContrast(wB, WORLEY_SCALE, WORLEY_CONTRAST);
  vec3  keyDir = normalize(vec3(cosR * KEY_DIR_X_ROT - sinR * KEY_DIR_X_CROSS, KEY_DIR_Y, sinR * KEY_DIR_X_ROT + cosR * KEY_DIR_X_CROSS));
  float key    = pow(max(dot(dir, keyDir), 0.0), KEY_POWER);
  return MOOD_BURST * (bB * WORLEY_WEIGHT + key * KEY_WEIGHT);
}

void main() {
  const float ROTATION_SPEED = 0.018;

  // envSelect preset-ID boundaries (see uniform comment above for the ID -> preset mapping)
  const float ENV_SELECT_AUTO_MAX     = 1.5;
  const float ENV_SELECT_METABALL_MAX = 2.5;
  const float ENV_SELECT_CLUSTER_MAX  = 3.5;

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

  vec2 uv  = gl_FragCoord.xy / resolution;
  vec3 dir = uvToDir(uv);

  float rot  = time * ROTATION_SPEED;
  float cosR = cos(rot); float sinR = sin(rot);
  vec3  rDir = vec3(dir.x * cosR - dir.z * sinR, dir.y, dir.x * sinR + dir.z * cosR);

  vec3 base;

  if (envSelect < ENV_SELECT_AUTO_MAX) {
    // 0 = auto: phase-driven blend
    float ambientScale = metaballBlend * AMBIENT_METABALL_WEIGHT + clusterBlend * AMBIENT_CLUSTER_WEIGHT + burstBlend * AMBIENT_BURST_WEIGHT;
    base = moodColor() * ambientScale;
    float amb = dualOctaveNoise(rDir.xz * AMBIENT_NOISE_FREQ_1 + time * AMBIENT_NOISE_TIME_1, AMBIENT_NOISE_WEIGHT_1,
                                rDir.yz * AMBIENT_NOISE_FREQ_2 + time * AMBIENT_NOISE_TIME_2, AMBIENT_NOISE_WEIGHT_2) * 0.5 + 0.5;
    float noiseFloor = mix(AMBIENT_NOISE_FLOOR_MIN, AMBIENT_NOISE_FLOOR_MAX, metaballBlend);
    base *= noiseFloor + (1.0 - noiseFloor) * amb;
    base += envMetaball(dir, rDir) * metaballBlend;
    base += envCluster(dir)        * clusterBlend;
    base += envBurst(dir, rDir, cosR, sinR) * burstBlend;
  } else if (envSelect < ENV_SELECT_METABALL_MAX) {
    // 2 = metaball
    base = envMetaball(dir, rDir);
  } else if (envSelect < ENV_SELECT_CLUSTER_MAX) {
    // 3 = cluster
    base = envCluster(dir);
  } else {
    // 4 = burst
    base = envBurst(dir, rDir, cosR, sinR);
  }

  gl_FragColor = vec4(base, 1.0);
}
`;
