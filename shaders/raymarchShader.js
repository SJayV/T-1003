export const mainVert = `
void main() {
  gl_Position = vec4(position, 1.0);
}
`;

export const mainFrag = `
precision highp float;

uniform float time;
uniform vec2  resolution;
uniform vec3  camPos;
uniform float phase;
uniform sampler2D envMap;
uniform sampler2D envMapNext;
uniform float envBlend;
uniform float reflectAll;

uniform vec3 p1;
uniform vec3 p2;
uniform vec3 p3;
uniform vec3 p4;
uniform vec3 p5;
uniform vec3 p6;
uniform vec3 p7;
uniform vec3 p8;
uniform vec3 p9;
uniform vec3 p10;
uniform vec3 p11;
uniform vec3 p12;

// ── env map ──────────────────────────────────────────────────────────────────

vec2 envUV(vec3 dir) {
  const float PI = 3.14159265;
  float phi   = atan(dir.z, dir.x);
  float theta = asin(clamp(dir.y, -1.0, 1.0));
  return vec2(phi / (2.0 * PI) + 0.5, theta / PI + 0.5);
}

// ── constants ─────────────────────────────────────────────────────────────────

vec3 backgroundColor  = vec3(0.0);
vec3 lightDirection   = normalize(vec3(2.0, 2.5, 2.0));

vec3 base             = vec3(0.35, 0.47, 0.5);
vec3 innerColor       = vec3(0.5,  0.75, 1.2);
vec3 outerGlowColor   = vec3(0.35, 0.9,  0.7);
vec3 innerGlowColor   = vec3(0.2,  0.9,  0.8);

// ── perlin noise ──────────────────────────────────────────────────────────────

vec2 fade(vec2 t) {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec2 grad(vec2 p) {
  float h = hash(p) * 6.2831853;
  return vec2(cos(h), sin(h));
}

float perlin2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = fade(f);
  float a = dot(grad(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
  float b = dot(grad(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(grad(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(grad(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// ── radius modulation: r_i(t) = r_i^0 * (1 + alpha * N(c_i, t)) ──────────────

float radiusMod(vec3 c, float r0, float seed) {
  float n = perlin2D(c.xy * 2.0 + seed       + time * 0.6)
          + perlin2D(c.yz * 2.0 + seed * 1.3 + time * 0.5);
  n = n * 0.5 + 0.5;
  return r0 + (n - 0.5) * (0.3 + phase * 0.2);
}

// ── SDF ───────────────────────────────────────────────────────────────────────

float sphere(vec3 p, vec3 c, float r) {
  return length(p - c) - r;
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// d_hat(x,t) = smin(...) + beta * N(x,t)
float map(vec3 p) {
  float d = smin(sphere(p, p1,  radiusMod(p1,  0.20, 1.0)),
                 sphere(p, p2,  radiusMod(p2,  0.17, 2.0)), 0.35);
  d = smin(d, sphere(p, p3,  radiusMod(p3,  0.13, 3.0)),  0.35);
  d = smin(d, sphere(p, p4,  radiusMod(p4,  0.15, 4.0)),  0.35);
  d = smin(d, sphere(p, p5,  radiusMod(p5,  0.18, 5.0)),  0.35);
  d = smin(d, sphere(p, p6,  radiusMod(p6,  0.14, 6.0)),  0.35);
  d = smin(d, sphere(p, p7,  radiusMod(p7,  0.16, 7.0)),  0.35);
  d = smin(d, sphere(p, p8,  radiusMod(p8,  0.19, 8.0)),  0.35);
  d = smin(d, sphere(p, p9,  radiusMod(p9,  0.12, 9.0)),  0.35);
  d = smin(d, sphere(p, p10, radiusMod(p10, 0.21, 10.0)), 0.35);
  d = smin(d, sphere(p, p11, radiusMod(p11, 0.15, 11.0)), 0.35);
  d = smin(d, sphere(p, p12, radiusMod(p12, 0.17, 12.0)), 0.35);

  float noise = perlin2D(p.xy * 4.0 + time * 0.30)
              + perlin2D(p.yz * 4.0 + time * 0.25);
  d += noise * 0.15;

  return d;
}

// ── normal (finite differences) ───────────────────────────────────────────────

vec3 normal(vec3 p) {
  vec2 e = vec2(0.001, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)
  ));
}

// ── raymarcher ────────────────────────────────────────────────────────────────

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

// ── main ──────────────────────────────────────────────────────────────────────

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y;
  vec3 ro  = camPos;
  vec3 rd  = normalize(vec3(uv, -1.5));
  float t  = raymarch(ro, rd);

  vec3 color = backgroundColor;

  if (t > 0.0) {
    vec3  p       = ro + rd * t;
    vec3  n       = normal(p);
    vec3  r       = reflect(rd, n);
    vec3  h       = normalize(lightDirection - rd);
    float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 4.0);
    float diffuse = max(dot(n, lightDirection), 0.0);
    float spec    = pow(max(dot(n, h), 0.0), 180.0);

    // metallic / reflective appearance
    vec3 envA      = texture2D(envMap,     envUV(r)).rgb;
    vec3 envB      = texture2D(envMapNext, envUV(r)).rgb;
    vec3 envSample = mix(envA, envB, envBlend);
    envSample      = envSample / (envSample + 1.0);

    vec3 metalColor = base * diffuse * 0.4;
    metalColor     += (vec3(0.02) + envSample) * (1.0 + fresnel);
    metalColor     += spec * 2.3;

    if (reflectAll > 0.5) {
      color = metalColor;
    } else {
      // translucent / luminescent appearance
      float invFresnel = pow(max(dot(n, -rd), 0.0), 2.5);
      float thickness  = clamp(-map(p - n * 0.08), 0.0, 1.0);
      float innerGlow  = smoothstep(0.0, 0.15, thickness) * 1.2;
      float scatter    = pow(max(dot(-lightDirection, n), 0.0), 2.0);

      vec3 clusterColor = backgroundColor;
      clusterColor += innerColor     * invFresnel * 3.0;
      clusterColor += innerGlowColor * innerGlow  * 1.4;
      clusterColor += spec           * 1.8;
      clusterColor += outerGlowColor * scatter;

      float edgeFade  = pow(1.0 - invFresnel, 1.5);
      clusterColor    = mix(backgroundColor, clusterColor, 0.3);
      clusterColor   *= (1.0 - edgeFade * 0.5);

      float blend = smoothstep(0.0, 0.4, phase) * (1.0 - smoothstep(1.0, 2.0, phase));
      color = mix(metalColor, clusterColor, blend);
    }
  }

  gl_FragColor = vec4(color, 1.0);
}
`;
