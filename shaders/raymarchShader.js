import { vertexChunk   } from '../shaderChunks/vertexChunk.js';
import { noiseChunk    } from '../shaderChunks/noiseChunk.js';
import { moodChunk     } from '../shaderChunks/moodChunk.js';
import { raymarchChunk } from '../shaderChunks/raymarchChunk.js';
import { STATE_TEX_W, glslFloat } from '../src/constants.js';

export const mainVert = vertexChunk;

export const mainFrag = `
precision highp float;
precision highp sampler2D;

uniform float     time;
uniform vec2      resolution;
uniform vec3      camPos;
uniform float     visualPhase;
uniform sampler2D envMap;
uniform sampler2D stateTex;

// ── ball data cache (populated once per fragment) ─────────────────────────────
// loadBalls() reads all 24 position/radius/seed texels from stateTex up front.
// map() and all functions called from it use these globals — no texture reads
// inside the raymarch loop or the 6 normal() calls (finite differences).

vec3  gC0,  gC1,  gC2,  gC3,  gC4,  gC5,  gC6,  gC7,  gC8,  gC9,  gC10, gC11;
float gR_0, gR_1, gR_2, gR_3, gR_4, gR_5, gR_6, gR_7, gR_8, gR_9, gR_10, gR_11;

void loadBalls() {
  const float S = 1.0 / ${glslFloat(STATE_TEX_W)};
  vec4 p;
  p=texture2D(stateTex,vec2( 0.5*S,0.5)); gC0 =p.xyz; gR_0 =p.w;
  p=texture2D(stateTex,vec2( 3.5*S,0.5)); gC1 =p.xyz; gR_1 =p.w;
  p=texture2D(stateTex,vec2( 6.5*S,0.5)); gC2 =p.xyz; gR_2 =p.w;
  p=texture2D(stateTex,vec2( 9.5*S,0.5)); gC3 =p.xyz; gR_3 =p.w;
  p=texture2D(stateTex,vec2(12.5*S,0.5)); gC4 =p.xyz; gR_4 =p.w;
  p=texture2D(stateTex,vec2(15.5*S,0.5)); gC5 =p.xyz; gR_5 =p.w;
  p=texture2D(stateTex,vec2(18.5*S,0.5)); gC6 =p.xyz; gR_6 =p.w;
  p=texture2D(stateTex,vec2(21.5*S,0.5)); gC7 =p.xyz; gR_7 =p.w;
  p=texture2D(stateTex,vec2(24.5*S,0.5)); gC8 =p.xyz; gR_8 =p.w;
  p=texture2D(stateTex,vec2(27.5*S,0.5)); gC9 =p.xyz; gR_9 =p.w;
  p=texture2D(stateTex,vec2(30.5*S,0.5)); gC10=p.xyz; gR_10=p.w;
  p=texture2D(stateTex,vec2(33.5*S,0.5)); gC11=p.xyz; gR_11=p.w;
}

// ── noise (noiseChunk) ────────────────────────────────────────────────────────

${noiseChunk}
${moodChunk}

// ── radius modulation: r_i(t) = r_i^0 * (1 + alpha * N(c_i, t)) ──────────────

float radiusMod(vec3 c, float r0) {
  const float NOISE_FREQ         = 2.0;
  const float NOISE_TIME_SCALE_1 = 0.6;
  const float NOISE_TIME_SCALE_2 = 0.5;
  const float AMPLITUDE_BASE        = 0.3;
  const float AMPLITUDE_PHASE_SCALE = 0.2;

  float n = dualOctaveNoise(c.xy * NOISE_FREQ + time * NOISE_TIME_SCALE_1, 1.0,
                            c.yz * NOISE_FREQ + time * NOISE_TIME_SCALE_2, 1.0);
  return r0 + n * 0.5 * (AMPLITUDE_BASE + visualPhase * AMPLITUDE_PHASE_SCALE);
}

// ── SDF ───────────────────────────────────────────────────────────────────────

float sphere(vec3 p, vec3 c, float r) { return length(p - c) - r; }

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// Folds one ball's (radius-modulated) sphere into the running smin composition.
// Used once per ball in map() below — identical shape at every call site.
float _accumulateBall(float d, vec3 p, vec3 c, float r0, float k) {
  return smin(d, sphere(p, c, radiusMod(c, r0)), k);
}

// d_hat(x,t) = smin_k(sphere(x,c_i,r_i(t))) + beta*N(x,t); k = SMIN_K_CLUSTER*cB + SMIN_K_METABALL*mB + SMIN_K_BURST*bB
// Reads ball globals only — no texture fetches.
float map(vec3 p) {
  const float SMIN_K_CLUSTER  = 0.40;
  const float SMIN_K_METABALL = 0.35;
  const float SMIN_K_BURST    = 0.10;
  const float SURFACE_NOISE_FREQ       = 4.0;
  const float SURFACE_NOISE_TIME_SCALE = 0.75;
  const float SURFACE_NOISE_AMPLITUDE  = 0.15;

  float k = SMIN_K_CLUSTER * clusterBlend + SMIN_K_METABALL * metaballBlend + SMIN_K_BURST * burstBlend;
  float d = sphere(p, gC0, radiusMod(gC0, gR_0));
  d = _accumulateBall(d, p, gC1,  gR_1,  k);
  d = _accumulateBall(d, p, gC2,  gR_2,  k);
  d = _accumulateBall(d, p, gC3,  gR_3,  k);
  d = _accumulateBall(d, p, gC4,  gR_4,  k);
  d = _accumulateBall(d, p, gC5,  gR_5,  k);
  d = _accumulateBall(d, p, gC6,  gR_6,  k);
  d = _accumulateBall(d, p, gC7,  gR_7,  k);
  d = _accumulateBall(d, p, gC8,  gR_8,  k);
  d = _accumulateBall(d, p, gC9,  gR_9,  k);
  d = _accumulateBall(d, p, gC10, gR_10, k);
  d = _accumulateBall(d, p, gC11, gR_11, k);
  float noise = perlin3D(p * SURFACE_NOISE_FREQ + time * SURFACE_NOISE_TIME_SCALE);
  return d + noise * SURFACE_NOISE_AMPLITUDE;
}

// ── geometry ──────────────────────────────────────────────────────────────────

// Central-difference SDF gradient along one axis (offset is e.xyy/e.yxy/e.yyx).
float _centralDiff(vec3 p, vec3 offset) {
  return map(p + offset) - map(p - offset);
}

vec3 normal(vec3 p) {
  const float NORMAL_EPSILON = 0.001;  // finite-difference step for the SDF gradient
  vec2 e = vec2(NORMAL_EPSILON, 0.0);
  return normalize(vec3(
    _centralDiff(p, e.xyy),
    _centralDiff(p, e.yxy),
    _centralDiff(p, e.yyx)
  ));
}

float raymarch(vec3 ro, vec3 rd) {
  const int   MAX_STEPS    = 90;
  const float HIT_EPSILON  = 0.001;
  const float MAX_DISTANCE = 10.0;

  float t = 0.0;
  for (int i = 0; i < MAX_STEPS; i++) {
    float d = map(ro + rd * t);
    if (d < HIT_EPSILON) return t;
    t += d;
    if (t > MAX_DISTANCE) break;
  }
  return -1.0;
}

// ── shading ───────────────────────────────────────────────────────────────────
// Injected after map() so shadeCluster can call map() for the thickness proxy.

${raymarchChunk}

// ── main ──────────────────────────────────────────────────────────────────────

void main() {
  const float CAMERA_FOCAL_LENGTH = 1.5;  // controls the raymarch camera's FOV, independent of the THREE.PerspectiveCamera

  loadBalls();

  vec2  uv  = (gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y;
  vec3  ro  = camPos;
  vec3  rd  = normalize(vec3(uv, -CAMERA_FOCAL_LENGTH));
  float hit = raymarch(ro, rd);

  vec3 color = vec3(0.0);
  if (hit > 0.0) {
    vec3 p = ro + rd * hit;
    color  = shadeHit(p, normal(p), rd);
  }

  gl_FragColor = vec4(color, 1.0);
}
`;
