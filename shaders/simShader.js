export const simVert = `
void main() {
  gl_Position = vec4(position, 1.0);
}
`;

// Sim pass: reads state texture (36x1 RGBA32F), computes one physics step, writes result.
// Layout: texel 3i = pos.xyz + r0, texel 3i+1 = vel.xyz + seed, texel 3i+2 = reserved.
// Each fragment corresponds to one texel; ballIdx = texelIdx / 3, subIdx = texelIdx % 3.
export const simFrag = `
precision highp float;
precision highp sampler2D;

uniform sampler2D stateTex;
uniform float time;
uniform float phase;

const int   N     = 12;
const float TEX_W = 36.0;

vec2 stateUV(int i) {
  return vec2((float(i) + 0.5) / TEX_W, 0.5);
}

vec3  readPos (int b) { return texture2D(stateTex, stateUV(b * 3    )).xyz; }
float readR0  (int b) { return texture2D(stateTex, stateUV(b * 3    )).w;   }
vec3  readVel (int b) { return texture2D(stateTex, stateUV(b * 3 + 1)).xyz; }
float readSeed(int b) { return texture2D(stateTex, stateUV(b * 3 + 1)).w;   }

// Deterministic per-ball-per-frame pseudo-random in [-1, 1].
// seed differentiates balls; time differentiates frames.
float rand(float seed) {
  return fract(sin(seed * 127.1 + time * 311.7) * 43758.5453123) * 2.0 - 1.0;
}

void reflectBounds(inout vec3 pos, inout vec3 vel) {
  if (pos.x >  1.8) { pos.x =  1.8; vel.x *= -0.9; }
  if (pos.x < -1.8) { pos.x = -1.8; vel.x *= -0.9; }
  if (pos.y >  1.0) { pos.y =  1.0; vel.y *= -0.9; }
  if (pos.y < -1.0) { pos.y = -1.0; vel.y *= -0.9; }
  if (pos.z >  0.5) { pos.z =  0.5; vel.z *= -0.9; }
  if (pos.z < -0.5) { pos.z = -0.5; vel.z *= -0.9; }
}

// Reads all N positions from stateTex — non-dependent reads (UVs from loop var, not tex result).
vec3 computeCentroid() {
  vec3 c = vec3(0.0);
  for (int i = 0; i < N; i++) c += readPos(i);
  return c / float(N);
}

void main() {
  int texelIdx = int(gl_FragCoord.x);
  int ballIdx  = texelIdx / 3;
  int subIdx   = texelIdx - ballIdx * 3;

  // Reserved texel: passthrough.
  if (subIdx == 2) {
    gl_FragColor = texture2D(stateTex, stateUV(texelIdx));
    return;
  }

  vec3  pos  = readPos(ballIdx);
  vec3  vel  = readVel(ballIdx);
  float r0   = readR0(ballIdx);
  float seed = readSeed(ballIdx);

  int phaseIdx = int(ceil(phase));

  if (phaseIdx == 0) {
    // Metaball: stochastic drift + weak circular rotation + centering
    vel += vec3(rand(seed), rand(seed + 17.3), rand(seed + 31.7)) * 0.003;
    vel += vec3(-pos.y, pos.x, 0.0) * 0.00003;
    vel -= pos * 0.00003;
    pos += vel;
    reflectBounds(pos, vel);
    vel *= 0.998;
  } else if (phaseIdx == 1) {
    // Cluster: centripetal force toward centroid + weak origin pull
    vec3 cen = computeCentroid();
    vel += (cen - pos) * 0.00008 - pos * 0.00003;
    pos += vel;
    reflectBounds(pos, vel);
    vel *= 0.995;
  } else {
    // Burst: centrifugal repulsion + random scatter
    vec3 cen = computeCentroid();
    vel += (pos - cen) * 0.006 + vec3(rand(seed), rand(seed + 17.3), rand(seed + 31.7)) * 0.05;
    pos += vel;
    reflectBounds(pos, vel);
    vel *= 0.90;
  }

  if (subIdx == 0) {
    gl_FragColor = vec4(pos, r0);
  } else {
    gl_FragColor = vec4(vel, seed);
  }
}
`;
