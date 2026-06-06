// Preconditions: uniforms stateTex (sampler2D), time (float), logicalPhase (float) declared;
//                stateUV(int), readOrb(int), perlin2D defined.
// Public GLSL: applyMetaball, applyCluster, applyBurst

export const simulationLibrary = `

vec3 computeCentroid() {
  vec3 c = vec3(0.0);
  for (int i = 0; i < 12; i++) c += texture2D(stateTex, stateUV(i * 3)).xyz;
  return c / 12.0;
}

// Returns the phi (angle) of the nearest point on the orbit ring to pos.
// Orbit basis: e1 = (1,0,0), e2 = (0, incl_sin, incl_cos*0.28).
// Projects pos onto the orbit plane and reads off the angle.
float nearestOrbitPhi(vec3 pos, vec3 e2norm) {
  return atan(dot(pos, e2norm), pos.x);
}

// ── metaball ─────────────────────────────────────────────────────────────────
// Finds the nearest point on the ball's orbit ring, advances N frames ahead
// (creating orbital motion), adds Perlin noise, attracts ball toward target.
// No direct position assignment; smooth return from any phase.

void applyMetaball(inout vec3 pos, inout vec3 vel, vec4 orb) {
  float r        = orb.r;
  float omega    = orb.g * 3.0 * (1.0 + motionSpeed * 0.8);
  float incl_sin = orb.a;
  float incl_cos = sqrt(max(0.0, 1.0 - incl_sin * incl_sin));

  vec3 e2     = vec3(0.0, incl_sin, incl_cos * 0.28);
  vec3 e2norm = normalize(e2);

  // Nearest phi on ring from current position
  float phi_near   = nearestOrbitPhi(pos, e2norm);
  // Advance N frames ahead along the ring to keep ball orbiting
  float phi_target = phi_near + omega * 0.004 * 12.0;

  // Target point on ring
  vec3 target = r * cos(phi_target) * vec3(1.0, 0.0, 0.0)
              + r * sin(phi_target) * e2;

  // Noise — incl_sin differentiates balls (no seed needed)
  float np = perlin2D(vec2(phi_near * 1.5 + time * 0.12, incl_sin * 5.1 + time * 0.09));
  float nq = perlin2D(vec2(phi_near * 1.0 + time * 0.09, incl_sin * 7.3 + time * 0.07));
  target += vec3(np * 0.06, nq * 0.04, np * nq * 0.03);

  vel += (target - pos) * 0.00018;
  pos += vel;
  vel *= 0.998;
}

// ── cluster ───────────────────────────────────────────────────────────────────
// Pull toward centroid (mass center) + pull toward origin (0,0,0).

void applyCluster(inout vec3 pos, inout vec3 vel) {
  vec3 cen = computeCentroid();
  vel += (cen - pos) * 0.00008 - pos * 0.00003;

  float np = perlin2D(vec2(pos.x * 3.0 + time * 0.18, pos.z * 3.0 + time * 0.14));
  float nq = perlin2D(vec2(pos.y * 3.0 + time * 0.15, pos.x * 3.0 + time * 0.10));
  vel += vec3(np, nq, np * nq) * 0.00015;

  pos += vel;
  vel *= 0.995;
}

// ── burst ─────────────────────────────────────────────────────────────────────

void applyBurst(inout vec3 pos, inout vec3 vel, float lPhase) {
  float intensity  = clamp(lPhase - 1.0, 0.0, 1.0);
  vec3  dir        = pos - computeCentroid();
  float dist       = length(dir) + 0.01;
  vel += normalize(dir) * exp(-dist * 3.5) * (0.010 + intensity * 0.035);
  pos += vel;
  vel *= 0.90;
}
`;
