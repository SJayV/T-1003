import { noiseLibrary } from '../libraries/noiseLibrary.js';

export const environmentVert = `
void main() {
  gl_Position = vec4(position, 1.0);
}
`;

export const environmentFrag = `
precision highp float;

uniform float phase;
uniform float time;
uniform vec2  resolution;

${noiseLibrary}

const float PI = 3.14159265;

vec3 uvToDir(vec2 uv) {
  float phi  = (uv.x - 0.5) * 2.0 * PI;
  float theta = (uv.y - 0.5) * PI;
  float cosT  = cos(theta);
  return vec3(cosT * cos(phi), sin(theta), cosT * sin(phi));
}

void main() {
  vec2 uv  = gl_FragCoord.xy / resolution;
  vec3 dir = uvToDir(uv);

  // Slow rotation of the environment sphere over time — adds life within a phase.
  float rot  = time * 0.018;
  float cosR = cos(rot); float sinR = sin(rot);
  vec3 rDir  = vec3(dir.x * cosR - dir.z * sinR, dir.y, dir.x * sinR + dir.z * cosR);

  // Phase blend weights
  float tCluster = smoothstep(0.0, 0.5, phase) * (1.0 - smoothstep(0.5, 1.8, phase));
  float tBurst   = smoothstep(1.0, 2.0, phase);
  float tMeta    = 1.0 - tCluster - tBurst * 0.6;

  // Base color per phase (linear HDR)
  vec3 cMeta    = vec3(0.10, 0.15, 0.26) * 1.4;
  vec3 cCluster = vec3(0.28, 0.14, 0.06) * 0.45;
  vec3 cBurst   = vec3(0.01, 0.01, 0.015);
  vec3 base = mix(mix(cMeta, cCluster, tCluster), cBurst, tBurst);

  // Layered ambient Perlin — one slow, one faster for texture
  float amb1 = perlin2D(rDir.xz * 2.0  + time * 0.12) * 0.5 + 0.5;
  float amb2 = perlin2D(rDir.yz * 3.5  + time * 0.28) * 0.5 + 0.5;
  float amb  = amb1 * 0.65 + amb2 * 0.35;
  base *= 0.55 + 0.45 * amb;

  // Cluster: soft top glow (also animates with Perlin)
  float clusterRipple = perlin2D(rDir.xy * 1.5 + time * 0.09) * 0.5 + 0.5;
  float topGlow = smoothstep(-0.4, 0.9, dir.y) * tCluster * (0.7 + 0.3 * clusterRipple);
  base += vec3(0.35, 0.18, 0.07) * topGlow * 1.1;

  // Metaball: drifting Worley blobs (two layers at different frequencies)
  float wMeta1 = worley2D(rDir.xy * 1.8 + time * 0.06);
  float wMeta2 = worley2D(rDir.xz * 2.8 + time * 0.04);
  float bMeta  = pow(clamp(1.0 - min(wMeta1, wMeta2) * 1.2, 0.0, 1.0), 4.0);
  base += vec3(0.3, 0.45, 0.8) * bMeta * 1.0 * tMeta;

  // Burst: fast-moving hard Worley spots + rotating key light
  float wBurst = worley2D(rDir.xz * 3.5 + time * 0.11);
  float bBurst = pow(clamp(1.0 - wBurst * 1.6, 0.0, 1.0), 8.0);
  base += vec3(1.1, 0.9, 0.65) * bBurst * 6.0 * tBurst;

  vec3 keyDir = normalize(vec3(cosR * 1.2 - sinR * 0.8, 1.8, sinR * 1.2 + cosR * 0.8));
  float key   = pow(max(dot(dir, keyDir), 0.0), 28.0);
  base += vec3(1.4, 1.15, 0.85) * key * 8.0 * tBurst;

  gl_FragColor = vec4(base, 1.0);
}
`;
