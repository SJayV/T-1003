export const raymarchLibrary = `

vec2 _envUV(vec3 dir) {
  const float PI = 3.14159265;
  return vec2(atan(dir.z, dir.x) / (2.0 * PI) + 0.5,
              asin(clamp(dir.y, -1.0, 1.0)) / PI + 0.5);
}

vec3 _envSample(vec3 dir) {
  vec3 raw = texture2D(envMap, _envUV(dir)).rgb;
  return raw / (raw + 1.0);
}

// Cone-sampling approximation of roughness-blurred reflection.
// Builds an orthonormal basis around dir and takes 5 samples spread by roughness.
vec3 _envSampleLod(vec3 dir, float roughness) {
  vec3  right  = normalize(cross(dir, vec3(0.0, 1.0, 0.001)));
  vec3  up     = cross(right, dir);
  float spread = roughness * 0.6;
  vec3 sum  = _envSample(dir);
  sum += _envSample(normalize(dir + right * spread));
  sum += _envSample(normalize(dir - right * spread));
  sum += _envSample(normalize(dir + up    * spread));
  sum += _envSample(normalize(dir - up    * spread));
  return sum * 0.2;
}

vec3 _rimLight(float NdotV) {
  return moodColor() * pow(1.0 - NdotV, 2.5) * 1.5;
}

// ── metallic ──────────────────────────────────────────────────────────────────
// roughness ∈ [0, 1] controls PMREM mip level (0 = mirror, 1 = fully diffuse).

vec3 shadeMetal(vec3 n, vec3 rd, float NdotV, float roughness) {
  vec3  ld      = normalize(vec3(2.0, 2.5, 2.0));
  float fresnel = pow(1.0 - NdotV, 4.0);
  float diffuse = max(dot(n, ld), 0.0);
  float spec    = pow(max(dot(n, normalize(ld - rd)), 0.0), 512.0);
  vec3 env   = _envSampleLod(reflect(rd, n), roughness);
  vec3 color = vec3(0.3, 0.3, 0.35) * diffuse * 0.08;
  color     += env * (0.5 + fresnel * 0.5);
  color     += spec * 4.0 * (1.0 - roughness * 3.0);
  color     += _rimLight(NdotV);
  return color;
}

// ── glass ─────────────────────────────────────────────────────────────────────
// No PMREM: thickness proxy via map(), inverted-Fresnel inner glow, back-scatter rim.

vec3 shadeGlass(vec3 p, vec3 n, vec3 rd, float NdotV) {
  vec3  ld              = normalize(vec3(2.0, 2.5, 2.0));
  float spec            = pow(max(dot(n, normalize(ld - rd)), 0.0), 192.0);
  float thickness = clamp(-map(p - n * 0.08), 0.0, 1.0);
  float innerGlow = smoothstep(0.0, 0.15, thickness) * 1.2;
  float fresnel   = pow(1.0 - NdotV, 2.5);
  float scatter   = pow(max(dot(-ld, n), 0.0), 2.0);

  vec3 color = vec3(0.0);
  color += MOOD_CLUSTER  * fresnel * 0.3;
  color += MOOD_METABALL * innerGlow * 0.1;
  color += spec * 0.8;
  color += MOOD_CLUSTER  * scatter * 0.25;
  color += _rimLight(NdotV) * 0.5;
  return color;
}

// ── entry point ───────────────────────────────────────────────────────────────

vec3 shadeHit(vec3 p, vec3 n, vec3 rd) {
  float NdotV   = max(dot(n, -rd), 0.0);
  float roughness = clamp(0.05 + perlin2D(p.xz * 0.8 + time * 0.04) * 0.28, 0.0, 1.0);
  return mix(shadeMetal(n, rd, NdotV, roughness), shadeGlass(p, n, rd, NdotV), clusterBlend);
}
`;
