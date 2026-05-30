import { noiseLib } from './noiseLib.js';

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

${noiseLib}

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

  // ── phase blend weights ───────────────────────────────────────────────────
  // tCluster: peaks at phase ≈ 0.5 (mid-Cluster)
  // tBurst:   ramps up from phase = 1.0 (Burst onset)
  float tCluster = smoothstep(0.0, 0.5, phase) * (1.0 - smoothstep(0.5, 1.8, phase));
  float tBurst   = smoothstep(1.0, 2.0, phase);
  float tMeta    = 1.0 - tCluster - tBurst * 0.6;

  // ── base color per phase (linear HDR) ────────────────────────────────────
  // Metaball:  cool blue-grey, medium ambient
  // Cluster:   warm dim amber, low brightness (gläsern)
  // Burst:     near-black, high-contrast highlights added below
  vec3 cMeta    = vec3(0.10, 0.15, 0.26) * 1.4;
  vec3 cCluster = vec3(0.28, 0.14, 0.06) * 0.45;
  vec3 cBurst   = vec3(0.01, 0.01, 0.015);

  vec3 base = mix(mix(cMeta, cCluster, tCluster), cBurst, tBurst);

  // ── ambient Perlin variation (slow within-phase animation) ───────────────
  float amb = perlin2D(dir.xz * 2.0 + time * 0.07) * 0.5 + 0.5;
  base *= 0.75 + 0.25 * amb;

  // ── Cluster: soft top glow ────────────────────────────────────────────────
  float topGlow = smoothstep(-0.4, 0.9, dir.y) * tCluster;
  base += vec3(0.35, 0.18, 0.07) * topGlow * 0.9;

  // ── Metaball: scattered soft Worley blobs (cool, diffuse) ─────────────────
  float wMeta = worley2D(dir.xy * 1.8 + time * 0.025);
  float bMeta = pow(clamp(1.0 - wMeta * 1.3, 0.0, 1.0), 5.0);
  base += vec3(0.3, 0.45, 0.8) * bMeta * 0.7 * tMeta;

  // ── Burst: hard Worley spots + directional key light (HDR) ───────────────
  float wBurst = worley2D(dir.xz * 3.5 + time * 0.04);
  float bBurst = pow(clamp(1.0 - wBurst * 1.6, 0.0, 1.0), 8.0);
  base += vec3(1.1, 0.9, 0.65) * bBurst * 6.0 * tBurst;

  // Single hard key light for burst (directional highlight)
  float key = pow(max(dot(dir, normalize(vec3(1.2, 1.8, 0.8))), 0.0), 28.0);
  base += vec3(1.4, 1.15, 0.85) * key * 8.0 * tBurst;

  gl_FragColor = vec4(base, 1.0);
}
`;
