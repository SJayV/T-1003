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

// ── Cook-Torrance PBR helpers (metalness = 1, no diffuse) ─────────────────────

float _D_GGX(float roughness, float NdotH) {
  float a2 = roughness * roughness * roughness * roughness;
  float d  = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / (3.14159265 * d * d);
}

float _G_Smith(float roughness, float NdotV, float NdotL) {
  float k  = (roughness + 1.0); k = k * k / 8.0;
  float gV = NdotV / (NdotV * (1.0 - k) + k);
  float gL = NdotL / (NdotL * (1.0 - k) + k);
  return gV * gL;
}

vec3 _F_Schlick(vec3 F0, float cosTheta) {
  return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

vec3 _rimLight(float NdotV) {
  return moodColor() * pow(1.0 - NdotV, 2.5) * 1.5;
}

// ── metallic ──────────────────────────────────────────────────────────────────
// Cook-Torrance BRDF, metalness = 1: no diffuse, F0 = base colour.
// Matches Three.js MeshStandardMaterial(metalness:1, roughness:r).

vec3 shadeMetal(vec3 n, vec3 rd, float NdotV, float roughness) {
  vec3 F0 = vec3(0.92);           // neutral polished steel

  vec3  ld    = normalize(vec3(2.0, 2.5, 2.0));
  vec3  v     = -rd;
  vec3  h     = normalize(ld + v);
  float NdotL = max(dot(n, ld), 0.0);
  float NdotH = max(dot(n, h),  0.0);
  float VdotH = max(dot(v, h),  0.0);

  // Direct light: Cook-Torrance specular BRDF
  float D   = _D_GGX(roughness, NdotH);
  float G   = _G_Smith(roughness, NdotV, NdotL);
  vec3  F   = _F_Schlick(F0, VdotH);
  vec3 spec = (D * G * F) / max(4.0 * NdotV * NdotL, 0.001);

  // IBL: roughness-blurred reflection weighted by Fresnel
  vec3 F_ibl = _F_Schlick(F0, NdotV);
  vec3 env   = _envSampleLod(reflect(rd, n), roughness);

  return spec * NdotL + env * F_ibl + _rimLight(NdotV);
}

// ── glass ─────────────────────────────────────────────────────────────────────
// No PMREM: map()-thickness inner glow, Fresnel rim, backscatter.

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
  const float roughness = 0.15;
  return mix(shadeMetal(n, rd, NdotV, roughness), shadeGlass(p, n, rd, NdotV), clusterBlend);
}
`;
