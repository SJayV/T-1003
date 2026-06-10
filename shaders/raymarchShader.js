import { vertexShaderLibrary } from '../libraries/vertexShaderLibrary.js';
import { noiseLibrary        } from '../libraries/noiseLibrary.js';
import { moodLibrary         } from '../libraries/moodLibrary.js';
import { raymarchLibrary     } from '../libraries/raymarchLibrary.js';

export const mainVert = vertexShaderLibrary;

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
  const float S = 1.0 / 36.0;  // must match STATE_TEX_W in simulation.js
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

// ── noise (noiseLib) ──────────────────────────────────────────────────────────

${noiseLibrary}
${moodLibrary}

// ── radius modulation: r_i(t) = r_i^0 * (1 + alpha * N(c_i, t)) ──────────────

float radiusMod(vec3 c, float r0) {
  float n = perlin2D(c.xy * 2.0 + time * 0.6)
          + perlin2D(c.yz * 2.0 + time * 0.5);
  return r0 + (n * 0.5 + 0.5 - 0.5) * (0.3 + visualPhase * 0.2);
}

// ── SDF ───────────────────────────────────────────────────────────────────────

float sphere(vec3 p, vec3 c, float r) { return length(p - c) - r; }

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// d_hat(x,t) = smin_k(sphere(x,c_i,r_i(t))) + beta*N(x,t); k = 0.40*cB + 0.35*mB + 0.10*bB
// Reads ball globals only — no texture fetches.
float map(vec3 p) {
  float k = 0.40 * clusterBlend + 0.35 * metaballBlend + 0.10 * burstBlend;
  float d = sphere(p, gC0,  radiusMod(gC0,  gR_0));
  d = smin(d, sphere(p, gC1,  radiusMod(gC1,  gR_1)),  k);
  d = smin(d, sphere(p, gC2,  radiusMod(gC2,  gR_2)),  k);
  d = smin(d, sphere(p, gC3,  radiusMod(gC3,  gR_3)),  k);
  d = smin(d, sphere(p, gC4,  radiusMod(gC4,  gR_4)),  k);
  d = smin(d, sphere(p, gC5,  radiusMod(gC5,  gR_5)),  k);
  d = smin(d, sphere(p, gC6,  radiusMod(gC6,  gR_6)),  k);
  d = smin(d, sphere(p, gC7,  radiusMod(gC7,  gR_7)),  k);
  d = smin(d, sphere(p, gC8,  radiusMod(gC8,  gR_8)),  k);
  d = smin(d, sphere(p, gC9,  radiusMod(gC9,  gR_9)),  k);
  d = smin(d, sphere(p, gC10, radiusMod(gC10, gR_10)), k);
  d = smin(d, sphere(p, gC11, radiusMod(gC11, gR_11)), k);
  float noise = perlin2D(p.xy * 4.0 + time * 0.30)
              + perlin2D(p.yz * 4.0 + time * 0.25);
  return d + noise * 0.15;
}

// ── geometry ──────────────────────────────────────────────────────────────────

vec3 normal(vec3 p) {
  vec2 e = vec2(0.001, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)
  ));
}

float raymarch(vec3 ro, vec3 rd) {
  float t = 0.0;
  for (int i = 0; i < 90; i++) {
    float d = map(ro + rd * t);
    if (d < 0.001) return t;
    t += d;
    if (t > 10.0) break;
  }
  return -1.0;
}

// ── shading ───────────────────────────────────────────────────────────────────
// Injected after map() so shadeGlass can call map() for the thickness proxy.

${raymarchLibrary}

// ── main ──────────────────────────────────────────────────────────────────────

void main() {
  loadBalls();

  vec2  uv  = (gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y;
  vec3  ro  = camPos;
  vec3  rd  = normalize(vec3(uv, -1.5));
  float hit = raymarch(ro, rd);

  vec3 color = vec3(0.0);
  if (hit > 0.0) {
    vec3 p = ro + rd * hit;
    color  = shadeHit(p, normal(p), rd);
  }

  gl_FragColor = vec4(color, 1.0);
}
`;
