import { noiseLibrary } from '../libraries/noiseLibrary.js';
import { moodLibrary  } from '../libraries/moodLibrary.js';

export const environmentVert = `
void main() {
  gl_Position = vec4(position, 1.0);
}
`;

export const environmentFrag = `
precision highp float;

uniform float time;
uniform vec2  resolution;

${noiseLibrary}
${moodLibrary}

const float PI = 3.14159265;

vec3 uvToDir(vec2 uv) {
  float phi   = (uv.x - 0.5) * 2.0 * PI;
  float theta = (uv.y - 0.5) * PI;
  float cosT  = cos(theta);
  return vec3(cosT * cos(phi), sin(theta), cosT * sin(phi));
}

void main() {
  vec2 uv  = gl_FragCoord.xy / resolution;
  vec3 dir = uvToDir(uv);

  float rot  = time * 0.018;
  float cosR = cos(rot); float sinR = sin(rot);
  vec3  rDir = vec3(dir.x * cosR - dir.z * sinR, dir.y, dir.x * sinR + dir.z * cosR);

  // Per-phase ambient: metaball gets silver-grey base; cluster and burst near-black.
  // Cluster PMREM is intentionally almost black — so glass refraction shows the dark
  // background (transparent) with only a few concentrated teal point sources visible.
  float ambientScale = metaballBlend * 0.28 + clusterBlend * 0.012 + burstBlend * 0.005;
  vec3 base = moodColor() * ambientScale;

  // Noise-modulate the metaball ambient for chromatic variation
  float amb = (perlin2D(rDir.xz * 2.0 + time * 0.12) * 0.65
             + perlin2D(rDir.yz * 3.5  + time * 0.28) * 0.35) * 0.5 + 0.5;
  base *= 0.40 + 0.60 * amb;

  // Cluster: two concentrated teal point sources — visible as bright spots
  // through the refracting glass. No top glow (would make glass look filled).
  vec3  spot1Dir = normalize(vec3( 0.3, 0.85,  0.2));
  vec3  spot2Dir = normalize(vec3(-0.5, 0.60, -0.3));
  float spot1    = pow(max(dot(dir, spot1Dir), 0.0), 6.0);
  float spot2    = pow(max(dot(dir, spot2Dir), 0.0), 4.0);
  base += MOOD_CLUSTER * (spot1 * 2.5 + spot2 * 1.2) * clusterBlend;

  // Metaball: drifting Worley blobs (two layers for variation)
  float wM1 = worley2D(rDir.xy * 1.8 + time * 0.06);
  float wM2 = worley2D(rDir.xz * 2.8 + time * 0.04);
  float bM  = pow(clamp(1.0 - min(wM1, wM2) * 1.2, 0.0, 1.0), 4.0);
  base += MOOD_METABALL * bM * metaballBlend * 1.2;

  // Burst: fast hard Worley spots + rotating key light (HDR)
  float wB  = worley2D(rDir.xz * 3.5 + time * 0.11);
  float bB  = pow(clamp(1.0 - wB * 1.6, 0.0, 1.0), 8.0);
  base += MOOD_BURST * bB * 6.0 * burstBlend;

  vec3 keyDir = normalize(vec3(cosR * 1.2 - sinR * 0.8, 1.8, sinR * 1.2 + cosR * 0.8));
  float key   = pow(max(dot(dir, keyDir), 0.0), 28.0);
  base += MOOD_BURST * key * 8.0 * burstBlend;

  gl_FragColor = vec4(base, 1.0);
}
`;
