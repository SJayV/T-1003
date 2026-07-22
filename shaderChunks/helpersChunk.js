export const noiseChunk = `


// ──── 3D PERLIN NOISE ──────────────────────────────────────────────────────


vec3 _fade3(vec3 fractionalPosition) {
  return fractionalPosition * fractionalPosition * fractionalPosition * (fractionalPosition * (fractionalPosition * 6.0 - 15.0) + 10.0);
}

vec3 _gradient3(vec3 cellCorner) {
  vec3 hash = fract(sin(vec3(
    dot(cellCorner, vec3(127.1, 311.7,  74.7)),
    dot(cellCorner, vec3(269.5, 183.3, 246.1)),
    dot(cellCorner, vec3(113.5, 271.9, 124.6))
  )) * 43758.5453);
  return normalize(hash * 2.0 - 1.0);
}

float perlin3D(vec3 position) {
  vec3 cell = floor(position);
  vec3 fractionalPosition = fract(position);
  vec3 fade = _fade3(fractionalPosition);
  float corner000 = dot(_gradient3(cell + vec3(0, 0, 0)), fractionalPosition - vec3(0, 0, 0));
  float corner100 = dot(_gradient3(cell + vec3(1, 0, 0)), fractionalPosition - vec3(1, 0, 0));
  float corner010 = dot(_gradient3(cell + vec3(0, 1, 0)), fractionalPosition - vec3(0, 1, 0));
  float corner110 = dot(_gradient3(cell + vec3(1, 1, 0)), fractionalPosition - vec3(1, 1, 0));
  float corner001 = dot(_gradient3(cell + vec3(0, 0, 1)), fractionalPosition - vec3(0, 0, 1));
  float corner101 = dot(_gradient3(cell + vec3(1, 0, 1)), fractionalPosition - vec3(1, 0, 1));
  float corner011 = dot(_gradient3(cell + vec3(0, 1, 1)), fractionalPosition - vec3(0, 1, 1));
  float corner111 = dot(_gradient3(cell + vec3(1, 1, 1)), fractionalPosition - vec3(1, 1, 1));
  return mix(
    mix(mix(corner000, corner100, fade.x), mix(corner010, corner110, fade.x), fade.y),
    mix(mix(corner001, corner101, fade.x), mix(corner011, corner111, fade.x), fade.y),
    fade.z
  );
}
`;


// ──── RAYS & SAMPLING ──────────────────────────────────────────────────────


export const sampleChunk = `
const float PI = 3.14159265;

vec2 _directionToUV(vec3 direction) {
  return vec2(atan(direction.z, direction.x) / (2.0 * PI) + 0.5,
              asin(clamp(direction.y, -1.0, 1.0)) / PI + 0.5);
}

vec3 _uvToDirection(vec2 uv) {
  float phi = (uv.x - 0.5) * 2.0 * PI;
  float theta = (uv.y - 0.5) * PI;
  float cosineTheta = cos(theta);
  return vec3(cosineTheta * cos(phi), sin(theta), cosineTheta * sin(phi));
}

vec3 _fetchDirectionalTexture(sampler2D map, vec3 direction) {
  return texture2D(map, _directionToUV(direction)).rgb;
}
`;


// ──── SCREEN SPACE ─────────────────────────────────────────────────────────


export const screenChunk = `
vec2 _screenUV() {
  return gl_FragCoord.xy / resolution;
}
`;


// ──── VERTEX SHADER ────────────────────────────────────────────────────────


export const vertexChunk = `
void main() {
  gl_Position = vec4(position, 1.0);
}
`;