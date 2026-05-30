// GLSL noise library — interpolated into fragment shaders via template literal.
// Public GLSL functions: perlin2D, worley2D, worley3D  (internal helpers prefixed _)

export const noiseLib = `

// ── internal helpers ──────────────────────────────────────────────────────────

vec2  _fade(vec2 t)  { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
float _hash1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
vec2  _grad(vec2 p)  { float h = _hash1(p) * 6.2831853; return vec2(cos(h), sin(h)); }

vec2 _hash2(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 19.19);
  return fract(vec2(p.x * p.y, p.x + p.y));
}

vec3 _hash3(vec3 p) {
  p = fract(p * vec3(127.1, 311.7, 74.7));
  p += dot(p, p + 19.19);
  return fract(vec3(p.x * p.y, p.y * p.z, p.z * p.x));
}

// ── perlin2D ──────────────────────────────────────────────────────────────────
// Classic gradient noise. Output ∈ [−1, 1]; mean ≈ 0.
// Frequency set by caller: perlin2D(p * freq + offset)

float perlin2D(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = _fade(f);
  float a = dot(_grad(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
  float b = dot(_grad(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(_grad(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(_grad(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// ── worley2D ──────────────────────────────────────────────────────────────────
// F1 Voronoi distance noise — cellular / organic patterns.
// Output: F1 distance to nearest feature point ∈ [0, ~1.0] for typical frequencies.
// Searches 3×3 neighbourhood; one random feature point placed per unit cell.

float worley2D(vec2 p) {
  vec2  cell = floor(p);
  float minD = 1e10;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 nb = cell + vec2(float(x), float(y));
      vec2 fp = nb + _hash2(nb);
      minD = min(minD, length(p - fp));
    }
  }
  return minD;
}

// ── worley3D ──────────────────────────────────────────────────────────────────
// F1 Voronoi distance noise in 3D.
// Output: F1 distance ∈ [0, ~1.2] for typical frequencies.
// Searches 3×3×3 neighbourhood (27 cells).

float worley3D(vec3 p) {
  vec3  cell = floor(p);
  float minD = 1e10;
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 nb = cell + vec3(float(x), float(y), float(z));
    vec3 fp = nb + _hash3(nb);
    minD = min(minD, length(p - fp));
  }
  return minD;
}
`;
