import { noiseLibrary    } from '../libraries/noiseLibrary.js';
import { moodLibrary     } from '../libraries/moodLibrary.js';
import { raymarchLibrary } from '../libraries/raymarchLibrary.js';

export const mainVert = `
void main() {
  gl_Position = vec4(position, 1.0);
}
`;

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
float gS_0, gS_1, gS_2, gS_3, gS_4, gS_5, gS_6, gS_7, gS_8, gS_9, gS_10, gS_11;

void loadBalls() {
  const float S = 1.0 / 36.0;
  vec4 p; vec4 v;
  p=texture2D(stateTex,vec2( 0.5*S,0.5)); v=texture2D(stateTex,vec2( 1.5*S,0.5)); gC0 =p.xyz; gR_0 =p.w; gS_0 =v.w;
  p=texture2D(stateTex,vec2( 3.5*S,0.5)); v=texture2D(stateTex,vec2( 4.5*S,0.5)); gC1 =p.xyz; gR_1 =p.w; gS_1 =v.w;
  p=texture2D(stateTex,vec2( 6.5*S,0.5)); v=texture2D(stateTex,vec2( 7.5*S,0.5)); gC2 =p.xyz; gR_2 =p.w; gS_2 =v.w;
  p=texture2D(stateTex,vec2( 9.5*S,0.5)); v=texture2D(stateTex,vec2(10.5*S,0.5)); gC3 =p.xyz; gR_3 =p.w; gS_3 =v.w;
  p=texture2D(stateTex,vec2(12.5*S,0.5)); v=texture2D(stateTex,vec2(13.5*S,0.5)); gC4 =p.xyz; gR_4 =p.w; gS_4 =v.w;
  p=texture2D(stateTex,vec2(15.5*S,0.5)); v=texture2D(stateTex,vec2(16.5*S,0.5)); gC5 =p.xyz; gR_5 =p.w; gS_5 =v.w;
  p=texture2D(stateTex,vec2(18.5*S,0.5)); v=texture2D(stateTex,vec2(19.5*S,0.5)); gC6 =p.xyz; gR_6 =p.w; gS_6 =v.w;
  p=texture2D(stateTex,vec2(21.5*S,0.5)); v=texture2D(stateTex,vec2(22.5*S,0.5)); gC7 =p.xyz; gR_7 =p.w; gS_7 =v.w;
  p=texture2D(stateTex,vec2(24.5*S,0.5)); v=texture2D(stateTex,vec2(25.5*S,0.5)); gC8 =p.xyz; gR_8 =p.w; gS_8 =v.w;
  p=texture2D(stateTex,vec2(27.5*S,0.5)); v=texture2D(stateTex,vec2(28.5*S,0.5)); gC9 =p.xyz; gR_9 =p.w; gS_9 =v.w;
  p=texture2D(stateTex,vec2(30.5*S,0.5)); v=texture2D(stateTex,vec2(31.5*S,0.5)); gC10=p.xyz; gR_10=p.w; gS_10=v.w;
  p=texture2D(stateTex,vec2(33.5*S,0.5)); v=texture2D(stateTex,vec2(34.5*S,0.5)); gC11=p.xyz; gR_11=p.w; gS_11=v.w;
}

// ── noise (noiseLib) ──────────────────────────────────────────────────────────
// Provides: perlin2D, worley2D, worley3D

${noiseLibrary}
${moodLibrary}

// ── radius modulation: r_i(t) = r_i^0 * (1 + alpha * N(c_i, t)) ──────────────

float radiusMod(vec3 c, float r0, float seed) {
  float n = perlin2D(c.xy * 2.0 + seed       + time * 0.6)
          + perlin2D(c.yz * 2.0 + seed * 1.3 + time * 0.5);
  return r0 + (n * 0.5 + 0.5 - 0.5) * (0.3 + visualPhase * 0.2);
}

// ── SDF ───────────────────────────────────────────────────────────────────────

float sphere(vec3 p, vec3 c, float r) { return length(p - c) - r; }

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// d_hat(x,t) = smin_i(sphere(x, c_i, r_i(t))) + beta * N(x,t)
// Reads ball globals only — no texture fetches.
float map(vec3 p) {
  float d = sphere(p, gC0,  radiusMod(gC0,  gR_0,  gS_0));
  d = smin(d, sphere(p, gC1,  radiusMod(gC1,  gR_1,  gS_1)),  0.35);
  d = smin(d, sphere(p, gC2,  radiusMod(gC2,  gR_2,  gS_2)),  0.35);
  d = smin(d, sphere(p, gC3,  radiusMod(gC3,  gR_3,  gS_3)),  0.35);
  d = smin(d, sphere(p, gC4,  radiusMod(gC4,  gR_4,  gS_4)),  0.35);
  d = smin(d, sphere(p, gC5,  radiusMod(gC5,  gR_5,  gS_5)),  0.35);
  d = smin(d, sphere(p, gC6,  radiusMod(gC6,  gR_6,  gS_6)),  0.35);
  d = smin(d, sphere(p, gC7,  radiusMod(gC7,  gR_7,  gS_7)),  0.35);
  d = smin(d, sphere(p, gC8,  radiusMod(gC8,  gR_8,  gS_8)),  0.35);
  d = smin(d, sphere(p, gC9,  radiusMod(gC9,  gR_9,  gS_9)),  0.35);
  d = smin(d, sphere(p, gC10, radiusMod(gC10, gR_10, gS_10)), 0.35);
  d = smin(d, sphere(p, gC11, radiusMod(gC11, gR_11, gS_11)), 0.35);
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
