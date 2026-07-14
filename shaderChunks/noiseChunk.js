export const noiseChunk = `


// ──── 2D PERLIN NOISE ─────────────────────────────────────────────────────────────


vec2  _fade(vec2 t)  { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
float _hash1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
vec2  _grad(vec2 p)  { float h = _hash1(p) * 6.2831853; return vec2(cos(h), sin(h)); }

float perlin2D(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = _fade(f);
  float a = dot(_grad(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
  float b = dot(_grad(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(_grad(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(_grad(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}


// ──── 3D PERLIN NOISE ─────────────────────────────────────────────────────────────


vec3 _fade3(vec3 t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }

vec3 _grad3(vec3 p) {
  vec3 h = fract(sin(vec3(
    dot(p, vec3(127.1, 311.7,  74.7)),
    dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6))
  )) * 43758.5453);
  return normalize(h * 2.0 - 1.0);
}

float perlin3D(vec3 p) {
  vec3 i  = floor(p);
  vec3 fr = fract(p);
  vec3 u  = _fade3(fr);
  float v000 = dot(_grad3(i + vec3(0,0,0)), fr - vec3(0,0,0));
  float v100 = dot(_grad3(i + vec3(1,0,0)), fr - vec3(1,0,0));
  float v010 = dot(_grad3(i + vec3(0,1,0)), fr - vec3(0,1,0));
  float v110 = dot(_grad3(i + vec3(1,1,0)), fr - vec3(1,1,0));
  float v001 = dot(_grad3(i + vec3(0,0,1)), fr - vec3(0,0,1));
  float v101 = dot(_grad3(i + vec3(1,0,1)), fr - vec3(1,0,1));
  float v011 = dot(_grad3(i + vec3(0,1,1)), fr - vec3(0,1,1));
  float v111 = dot(_grad3(i + vec3(1,1,1)), fr - vec3(1,1,1));
  return mix(
    mix(mix(v000, v100, u.x), mix(v010, v110, u.x), u.y),
    mix(mix(v001, v101, u.x), mix(v011, v111, u.x), u.y),
    u.z
  );
}


// ──── WORLEY NOISE ────────────────────────────────────────────────────────────────


vec2 _hash2(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 19.19);
  return fract(vec2(p.x * p.y, p.x + p.y));
}

float worley2D(vec2 p) {
  vec2  cell = floor(p);
  float minD = 1e10;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 nb = cell + vec2(float(x), float(y));
      minD = min(minD, length(p - nb - _hash2(nb)));
    }
  }
  return minD;
}


// ──── COMBINED NOISE ──────────────────────────────────────────────────────────────


float dualOctaveNoise(vec2 sampleA, float weightA, vec2 sampleB, float weightB) {
  return perlin2D(sampleA) * weightA + perlin2D(sampleB) * weightB;
}
`;
