// Preconditions: uniforms stateTex (sampler2D), time (float), logicalPhase (float) declared;
//                stateUV(int), readOrb(int), perlin2D defined.
// Public GLSL: applyMetaball, applyCluster, applyBurst

export const simulationLibrary = `

float rand(float seed) {
  return fract(sin(seed * 127.1 + time * 311.7) * 43758.5453123) * 2.0 - 1.0;
}

// Bounds: X = ±1.8, Y = ±1.0, Z = ±0.5 — only needed for cluster/burst
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

// ── metaball: analytic individual orbits ──────────────────────────────────────
// orb.r = radius, orb.g = speed, orb.b = initial phase, orb.a = sin(inclination)
//
// Orbit formula — stays within bounds by construction:
//   X = r * cos(phi)                          max = r ≤ 1.72 < 1.8  ✓
//   Y = r * sin(phi) * incl_sin               max = r * incl_sin ≤ 1.0 (enforced in balls.js)
//   Z = r * sin(phi) * incl_cos * 0.28       max = r * 0.28 ≤ 0.48 < 0.5  ✓
// No reflectBounds needed.
// vel set to analytic derivative × dt so cluster/burst transitions start smoothly.

void applyMetaball(inout vec3 pos, inout vec3 vel, float seed, vec4 orb) {
  float r        = orb.r;
  float spd      = orb.g;
  float phi0     = orb.b;
  float incl_sin = orb.a;
  float incl_cos = sqrt(max(0.0, 1.0 - incl_sin * incl_sin));

  float omega = spd * 3.0;
  float phi   = phi0 + time * omega;

  vec3 orbitPos = vec3(
    r * cos(phi),
    r * sin(phi) * incl_sin,
    r * sin(phi) * incl_cos * 0.28
  );

  float np = perlin2D(vec2(phi * 0.6, seed));
  float nq = perlin2D(vec2(phi * 0.4, seed + 11.3));
  orbitPos += vec3(
    np * 0.07,
    nq * 0.05 * incl_sin,
    np * nq * 0.04 * incl_cos
  );

  vel  = vel * 0.97 + (orbitPos - pos) * 0.02;
  pos += vel;
}

// ── cluster: centripetal force ────────────────────────────────────────────────

void applyCluster(inout vec3 pos, inout vec3 vel) {
  vec3 cen = computeCentroid();
  vel += (cen - pos) * 0.00008 - pos * 0.00003;
  pos += vel;
  reflectBounds(pos, vel);
  vel *= 0.995;
}

// ── burst: exponential repulsion — strong locally, asymptotically 0 at distance
// logicalPhase - 1.0 encodes input motion speed (set by triggerPhase(1.0 + speed)).
// Force decays as exp(-dist * 1.5): at dist=1.0 → 22% of peak, dist=2.0 → 5%.

void applyBurst(inout vec3 pos, inout vec3 vel, float seed, float lPhase) {
  float intensity  = clamp(lPhase - 1.0, 0.0, 1.0);
  vec3  dir        = pos - computeCentroid();
  float dist       = length(dir) + 0.01;
  // exp decay k=2.0: near 0 at dist≈2.1 (half-diagonal of bounds)
  float localForce = exp(-dist * 2.0) * (0.02 + intensity * 0.08);

  vel += normalize(dir) * localForce
       + vec3(rand(seed), rand(seed + 17.3), rand(seed + 31.7)) * 0.008;
  pos += vel;
  reflectBounds(pos, vel);
  vel *= 0.90;
}
`;
