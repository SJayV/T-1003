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

vec3 envMetaball(vec3 dir, vec3 rDir) {
  float wM1 = worley2D(rDir.xy * 1.0 + time * 0.06);
  float wM2 = worley2D(rDir.xz * 1.6 + time * 0.04);
  float bM  = pow(clamp(1.0 - min(wM1, wM2) * 1.1, 0.0, 1.0), 3.5);
  return MOOD_METABALL * bM * 2.2;
}

vec3 envCluster(vec3 dir) {
  vec3  spot1Dir = normalize(vec3( 0.3, 0.85,  0.2));
  vec3  spot2Dir = normalize(vec3(-0.5, 0.60, -0.3));
  float spot1    = pow(max(dot(dir, spot1Dir), 0.0), 6.0);
  float spot2    = pow(max(dot(dir, spot2Dir), 0.0), 4.0);
  return MOOD_CLUSTER * (spot1 * 2.5 + spot2 * 1.2);
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

  float ambientScale = metaballBlend * 0.14 + clusterBlend * 0.012 + burstBlend * 0.005;
  vec3  base = moodColor() * ambientScale;

  float amb = (perlin2D(rDir.xz * 2.0 + time * 0.12) * 0.65
             + perlin2D(rDir.yz * 3.5  + time * 0.28) * 0.35) * 0.5 + 0.5;
  base *= 0.08 + 0.92 * amb;

  base += envMetaball(dir, rDir) * metaballBlend;
  base += envCluster(dir)        * clusterBlend;
  base += envBurst(dir, rDir, cosR, sinR) * burstBlend;

  gl_FragColor = vec4(base, 1.0);
}
`;
