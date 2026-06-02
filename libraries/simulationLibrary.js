// Preconditions: uniforms stateTex (sampler2D), time (float), logicalPhase (float) declared;
//                stateUV(int), readOrb(int) defined.
// Public GLSL: applyMetaball, applyCluster, applyBurst

export const simulationLibrary = `

vec3 computeCentroid() {
  vec3 c = vec3(0.0);
  for (int i = 0; i < 12; i++) c += texture2D(stateTex, stateUV(i * 3)).xyz;
  return c / 12.0;
}

void applyMetaball(inout vec3 pos, inout vec3 vel, vec4 orb) {
  float r        = orb.r;
  float phi0     = orb.b;
  float incl_sin = orb.a;
  float incl_cos = sqrt(max(0.0, 1.0 - incl_sin * incl_sin));

  float phi = phi0 + time * orb.g * 3.0;

  vec3 orbitPos = vec3(
    r * cos(phi),
    r * sin(phi) * incl_sin,
    r * sin(phi) * incl_cos * 0.28
  );

  // Position-based Perlin noise on target — orbit position already differentiates balls
  float np = perlin2D(vec2(orbitPos.x * 2.5 + time * 0.13, orbitPos.z * 2.5 + time * 0.09));
  float nq = perlin2D(vec2(orbitPos.y * 2.5 + time * 0.11, orbitPos.x * 2.5 + time * 0.08));
  orbitPos += vec3(np * 0.07, nq * 0.05, np * nq * 0.03);

  vel += (orbitPos - pos) * 0.00010;
  pos += vel;
  vel *= 0.998;
}

void applyCluster(inout vec3 pos, inout vec3 vel) {
  vec3 cen = computeCentroid();
  vel += (cen - pos) * 0.00008 - pos * 0.00003;
  pos += vel;
  vel *= 0.995;
}

void applyBurst(inout vec3 pos, inout vec3 vel, float lPhase) {
  float intensity  = clamp(lPhase - 1.0, 0.0, 1.0);
  vec3  dir        = pos - computeCentroid();
  float dist       = length(dir) + 0.01;
  vel += normalize(dir) * exp(-dist * 4.0) * (0.010 + intensity * 0.035);
  pos += vel;
  vel *= 0.90;
}
`;
