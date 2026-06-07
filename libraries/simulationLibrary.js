// Public GLSL: orbitPoint, reflectBounds, applySimulation

export const simulationLibrary = `

vec3 computeCentroid() {
  vec3 c = vec3(0.0);
  for (int i = 0; i < 12; i++) c += texture2D(stateTex, stateUV(i * 3)).xyz;
  return c / 12.0;
}

// Angle of the nearest point on the orbit ring to pos.
// Orbit basis: e1=(1,0,0), e2=(0,incl_sin,incl_cos*0.28).
float nearestOrbitPhi(vec3 pos, vec3 e2norm) {
  return atan(dot(pos, e2norm), pos.x);
}

// 3D position on the orbit ellipse at angle phi.
vec3 orbitPoint(vec4 orb, float phi) {
  float iSin = orb.a;
  float iCos = sqrt(max(0.0, 1.0 - iSin * iSin));
  vec3 e2 = vec3(0.0, iSin, iCos * 0.28);
  return orb.r * (cos(phi) * vec3(1.0, 0.0, 0.0) + sin(phi) * e2);
}

// Reflects pos/vel at the visible scene boundary so balls never leave the screen.
// Bounds are set slightly beyond the natural orbit extents to allow burst drama
// while keeping all balls recoverable.
void reflectBounds(inout vec3 pos, inout vec3 vel) {
  const float BX = 2.3;
  const float BY = 1.0;
  const float BZ = 0.6;
  if (pos.x >  BX) { pos.x =  BX; vel.x = -abs(vel.x); }
  if (pos.x < -BX) { pos.x = -BX; vel.x =  abs(vel.x); }
  if (pos.y >  BY) { pos.y =  BY; vel.y = -abs(vel.y); }
  if (pos.y < -BY) { pos.y = -BY; vel.y =  abs(vel.y); }
  if (pos.z >  BZ) { pos.z =  BZ; vel.z = -abs(vel.z); }
  if (pos.z < -BZ) { pos.z = -BZ; vel.z =  abs(vel.z); }
}

// ── unified physics ───────────────────────────────────────────────────────────
// Blends metaball / cluster / burst physics using visualPhase so all transitions
// are continuous. No hard switch: orbit contribution fades out while vel-based
// cluster motion fades in, preventing any speed discontinuity.
//
//   metaT    = weight of direct orbit update (pos += orbitDelta)
//   clusterT = weight of vel-based cluster pull (pos += vel)
//   burstT   = weight of outward burst force   (pos += vel)

void applySimulation(inout vec3 pos, inout vec3 vel, vec4 orb) {
  float clusterT = smoothstep(0.25, 0.75, visualPhase) * (1.0 - smoothstep(1.0, 1.5, visualPhase));
  float burstT   = smoothstep(1.0, 1.5, visualPhase);
  float metaT    = 1.0 - clusterT - burstT;

  // ── orbit delta (metaball) ──────────────────────────────────────────────
  float incl_sin = orb.a;
  float incl_cos = sqrt(max(0.0, 1.0 - incl_sin * incl_sin));
  vec3 e2     = vec3(0.0, incl_sin, incl_cos * 0.28);
  vec3 e2norm = normalize(e2);
  float omega    = orb.g * 18.0 + motionSpeed * 9.0;
  float phi_near = nearestOrbitPhi(pos, e2norm);
  vec3 nearPt    = orbitPoint(orb, phi_near);
  vec3 nextPt    = orbitPoint(orb, phi_near + omega * 0.004);
  vec3 orbitDelta = (nearPt - pos) * 0.002 + (nextPt - nearPt);

  // ── velocity forces ─────────────────────────────────────────────────────
  vec3 cen = computeCentroid();

  // Centripetal pull — always active; primes vel during metaball so cluster
  // inherits inward motion without a dead stop at the transition.
  vel += (cen - pos) * 0.00016 - pos * 0.00006;

  // Cluster noise (fades in with clusterT)
  float np = perlin2D(vec2(pos.x * 3.0 + time * 0.18, pos.z * 3.0 + time * 0.14));
  float nq = perlin2D(vec2(pos.y * 3.0 + time * 0.15, pos.x * 3.0 + time * 0.10));
  vel += vec3(np, nq, np * nq) * 0.00015 * clusterT;

  // Burst outward force (fades in with burstT)
  float intensity = clamp(logicalPhase - 1.0, 0.0, 1.0);
  vec3 burstDir = pos - cen;
  float burstDist = length(burstDir) + 0.01;
  vel += normalize(burstDir) * exp(-burstDist * 1.5) * (0.010 + intensity * 0.035) * burstT;

  // ── blended position update ─────────────────────────────────────────────
  pos += orbitDelta * metaT + vel * (clusterT + burstT);

  // ── blended velocity decay ──────────────────────────────────────────────
  float velDecay = mix(mix(0.99, 0.995, clusterT), 0.90, burstT);
  vel *= velDecay;

  reflectBounds(pos, vel);
}
`;
