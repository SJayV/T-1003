export const noiseLibrary = `

vec2  _fade(vec2 t)  { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
float _hash1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
vec2  _grad(vec2 p)  { float h = _hash1(p) * 6.2831853; return vec2(cos(h), sin(h)); }

vec2 _hash2(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 19.19);
  return fract(vec2(p.x * p.y, p.x + p.y));
}

float perlin2D(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = _fade(f);
  float a = dot(_grad(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
  float b = dot(_grad(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(_grad(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(_grad(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
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
`;
