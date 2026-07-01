import { vertexShaderLibrary } from '../libraries/vertexShaderLibrary.js';
import { noiseLibrary        } from '../libraries/noiseLibrary.js';
import { moodLibrary         } from '../libraries/moodLibrary.js';

export const environmentVert = vertexShaderLibrary;

export const environmentFrag = `
precision highp float;

uniform float time;
uniform vec2  resolution;
uniform float envSelect;  // 0=auto, 1=metaball, 2=cluster, 3=burst

${noiseLibrary}
${moodLibrary}

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
  float n = perlin2D(rDir.xz * 1.8 + time * 0.020) * 0.28
          + perlin2D(rDir.xy * 3.1 + time * 0.033) * 0.10;
  float bPos = dir.y + n;

  float aw1 = 1.0 - smoothstep(0.0, 0.22, abs(bPos + 0.70));
  float bw  = 1.0 - smoothstep(0.0, 0.32, abs(bPos));
  float aw2 = 1.0 - smoothstep(0.0, 0.22, abs(bPos - 0.70));

  vec3 grey     = vec3(0.88, 0.91, 0.96);
  vec3 bordeaux = vec3(0.3, 0.58, 0.82);
  vec3 azure    = vec3(0.04, 0.32, 1.0);

  vec3 color = grey;
  color = mix(color, azure,    aw1 * 0.75);
  color = mix(color, bordeaux, bw  * 0.80);
  color = mix(color, azure,    aw2 * 0.75);
  return color;
}

vec3 envMetaball(vec3 dir, vec3 rDir) {
  float grad       = smoothstep(-1.0, 1.0, dir.y * 0.7 + dir.z * 0.3);
  float brightness = 0.8 + 0.60 * grad;

  // Worley as brightness multiplier (floor 0.78) — variation without dark patches.
  float wM1      = worley2D(rDir.xy * 1.0 + time * 0.06);
  float wM2      = worley2D(rDir.xz * 1.6 + time * 0.04);
  float bM       = pow(clamp(1.0 - min(wM1, wM2) * 1.1, 0.0, 1.0), 2.0);
  float variation = 0.78 + 0.38 * bM;

  return _envBands(dir, rDir) * brightness * variation;
}

vec3 envCluster(vec3 dir) {
  float grad = smoothstep(-0.4, 1.0, dir.y * 0.75 + dir.z * 0.25);
  return MOOD_CLUSTER * grad * 0.55;
}

vec3 envBurst(vec3 dir, vec3 rDir, float cosR, float sinR) {
  float wB     = worley2D(rDir.xz * 3.5 + time * 0.11);
  float bB     = pow(clamp(1.0 - wB * 1.6, 0.0, 1.0), 8.0);
  vec3  keyDir = normalize(vec3(cosR * 1.2 - sinR * 0.8, 1.8, sinR * 1.2 + cosR * 0.8));
  float key    = pow(max(dot(dir, keyDir), 0.0), 28.0);
  return MOOD_BURST * (bB * 6.0 + key * 8.0);
}

void main() {
  vec2 uv  = gl_FragCoord.xy / resolution;
  vec3 dir = uvToDir(uv);

  float rot  = time * 0.018;
  float cosR = cos(rot); float sinR = sin(rot);
  vec3  rDir = vec3(dir.x * cosR - dir.z * sinR, dir.y, dir.x * sinR + dir.z * cosR);

  vec3 base;

  if (envSelect < 1.5) {
    // 0 = auto: phase-driven blend
    float ambientScale = metaballBlend * 0.35 + clusterBlend * 0.012 + burstBlend * 0.005;
    base = moodColor() * ambientScale;
    float amb = (perlin2D(rDir.xz * 2.0 + time * 0.12) * 0.65
               + perlin2D(rDir.yz * 3.5  + time * 0.28) * 0.35) * 0.5 + 0.5;
    float noiseFloor = mix(0.08, 0.55, metaballBlend);
    base *= noiseFloor + (1.0 - noiseFloor) * amb;
    base += envMetaball(dir, rDir) * metaballBlend;
    base += envCluster(dir)        * clusterBlend;
    base += envBurst(dir, rDir, cosR, sinR) * burstBlend;
  } else if (envSelect < 2.5) {
    // 2 = metaball
    base = envMetaball(dir, rDir);
  } else if (envSelect < 3.5) {
    // 3 = cluster
    base = envCluster(dir);
  } else {
    // 4 = burst
    base = envBurst(dir, rDir, cosR, sinR);
  }

  gl_FragColor = vec4(base, 1.0);
}
`;
