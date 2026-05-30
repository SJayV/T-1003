// Preconditions: uniforms stateTex (sampler2D), time (float) declared;
//                stateUV(int) defined in enclosing shader.
// Public GLSL: applyMetaball, applyCluster, applyBurst

export const simulationLibrary = `

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

vec3 computeCentroid() {
  vec3 c = vec3(0.0);
  for (int i = 0; i < 12; i++) c += texture2D(stateTex, stateUV(i * 3)).xyz;
  return c / 12.0;
}

void applyMetaball(inout vec3 pos, inout vec3 vel, float seed) {
  vel += vec3(rand(seed), rand(seed + 17.3), rand(seed + 31.7)) * 0.003;
  vel += vec3(-pos.y, pos.x, 0.0) * 0.00003;
  vel -= pos * 0.00003;
  pos += vel;
  reflectBounds(pos, vel);
  vel *= 0.998;
}

void applyCluster(inout vec3 pos, inout vec3 vel) {
  vec3 cen = computeCentroid();
  vel += (cen - pos) * 0.00008 - pos * 0.00003;
  pos += vel;
  reflectBounds(pos, vel);
  vel *= 0.995;
}

void applyBurst(inout vec3 pos, inout vec3 vel, float seed) {
  vec3 cen = computeCentroid();
  vel += (pos - cen) * 0.006 + vec3(rand(seed), rand(seed + 17.3), rand(seed + 31.7)) * 0.05;
  pos += vel;
  reflectBounds(pos, vel);
  vel *= 0.90;
}
`;
