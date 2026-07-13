export const raymarchChunk = `

const vec3  KEY_LIGHT_DIR_RAW      = vec3(2.0, 2.5, 2.0);  // shared directional light, metal + glass (normalize at use site)
const float ENV_CONE_SPREAD_SCALE = 0.6;  // roughness -> cone-sample spread; higher = blurrier reflections
const float RIM_LIGHT_POWER     = 2.0;  // lower power = wider, lighter falloff
const float RIM_LIGHT_INTENSITY = 2.2;

vec2 _envUV(vec3 dir) {
  const float PI = 3.14159265;
  return vec2(atan(dir.z, dir.x) / (2.0 * PI) + 0.5,
              asin(clamp(dir.y, -1.0, 1.0)) / PI + 0.5);
}

vec3 _envSample(vec3 dir) {
  vec3 raw = texture2D(envMap, _envUV(dir)).rgb;
  return raw / (raw + 1.0);
}

// Cone-sampling approximation of roughness-blurred reflection (no PMREM/prefiltered mips).
vec3 _envSampleLod(vec3 dir, float roughness) {
  vec3  right  = normalize(cross(dir, vec3(0.0, 1.0, 0.001)));
  vec3  up     = cross(right, dir);
  float spread = roughness * ENV_CONE_SPREAD_SCALE;
  vec3 sum  = _envSample(dir);
  sum += _envSample(normalize(dir + right * spread));
  sum += _envSample(normalize(dir - right * spread));
  sum += _envSample(normalize(dir + up    * spread));
  sum += _envSample(normalize(dir - up    * spread));
  return sum / 5.0;
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
  return moodColor() * pow(1.0 - NdotV, RIM_LIGHT_POWER) * RIM_LIGHT_INTENSITY;
}

// ── reflective (shared by Metaball + Burst) ────────────────────────────────────
// Cook-Torrance BRDF, metalness = 1: no diffuse, F0 = tint. Carries a much
// fainter rim light than Cluster (its main rim-light role) — just enough to
// read as the same creature, tinted by the current moodColor() like Cluster's.
// Matches Three.js MeshStandardMaterial(metalness:1, roughness:r).

const float HIGHLIGHT_BRIGHTEN     = 1.15;  // derives the direct-specular tone from the base tint; IBL uses the base tone as-is
const float REFLECTIVE_RIM_WEIGHT  = 0.35;  // fainter than Cluster's RIM_WEIGHT (0.65)

vec3 _shadeReflective(vec3 n, vec3 rd, float NdotV, float roughness, vec3 tint) {
  vec3 highlightTint = clamp(tint * HIGHLIGHT_BRIGHTEN, 0.0, 1.0);

  vec3  ld    = normalize(KEY_LIGHT_DIR_RAW);
  vec3  v     = -rd;
  vec3  h     = normalize(ld + v);
  float NdotL = max(dot(n, ld), 0.0);
  float NdotH = max(dot(n, h),  0.0);
  float VdotH = max(dot(v, h),  0.0);

  // Direct light: Cook-Torrance specular BRDF
  float D   = _D_GGX(roughness, NdotH);
  float G   = _G_Smith(roughness, NdotV, NdotL);
  vec3  F   = _F_Schlick(highlightTint, VdotH);
  vec3 spec = (D * G * F) / max(4.0 * NdotV * NdotL, 0.001);

  // IBL: roughness-blurred reflection weighted by Fresnel
  vec3 F_ibl = _F_Schlick(tint, NdotV);
  vec3 env   = _envSampleLod(reflect(rd, n), roughness);

  return spec * NdotL + env * F_ibl + _rimLight(NdotV) * REFLECTIVE_RIM_WEIGHT;
}

const float METABALL_ROUGHNESS = 0.15;

vec3 shadeMetaball(vec3 n, vec3 rd, float NdotV) {
  return _shadeReflective(n, rd, NdotV, METABALL_ROUGHNESS, MOOD_METABALL_METAL);
}

const float BURST_ROUGHNESS = 1.0;  // maximum — diffuse-like scatter, matches Burst's harsh/chaotic mood

vec3 shadeBurst(vec3 n, vec3 rd, float NdotV) {
  return _shadeReflective(n, rd, NdotV, BURST_ROUGHNESS, MOOD_BURST);
}

// ── cluster ───────────────────────────────────────────────────────────────────
// No env-map sampling: map()-thickness inner glow, Fresnel rim, backscatter.
// Rim light is much stronger here than in _shadeReflective (RIM_WEIGHT vs.
// REFLECTIVE_RIM_WEIGHT) — Cluster is the primary rim-light carrier.

vec3 shadeCluster(vec3 p, vec3 n, vec3 rd, float NdotV) {
  const float SPECULAR_POWER        = 192.0;
  const float THICKNESS_SAMPLE_OFFSET = 0.08;
  const float INNER_GLOW_RANGE_START  = 0.0;
  const float INNER_GLOW_RANGE_END    = 0.15;
  const float INNER_GLOW_INTENSITY    = 1.2;
  const float FRESNEL_POWER         = 2.5;
  const float SCATTER_POWER         = 2.0;
  const float FRESNEL_WEIGHT        = 0.3;
  const float INNER_GLOW_WEIGHT     = 0.1;
  const float SPEC_WEIGHT           = 0.8;
  const float SCATTER_WEIGHT        = 0.25;
  const float RIM_WEIGHT            = 0.65;

  vec3  ld        = normalize(KEY_LIGHT_DIR_RAW);
  float spec      = pow(max(dot(n, normalize(ld - rd)), 0.0), SPECULAR_POWER);
  float thickness = clamp(-map(p - n * THICKNESS_SAMPLE_OFFSET), 0.0, 1.0);
  float innerGlow = smoothstep(INNER_GLOW_RANGE_START, INNER_GLOW_RANGE_END, thickness) * INNER_GLOW_INTENSITY;
  float fresnel   = pow(1.0 - NdotV, FRESNEL_POWER);
  float scatter   = pow(max(dot(-ld, n), 0.0), SCATTER_POWER);

  vec3 color = vec3(0.0);
  color += MOOD_CLUSTER  * fresnel * FRESNEL_WEIGHT;
  color += MOOD_METABALL * innerGlow * INNER_GLOW_WEIGHT;
  color += spec * SPEC_WEIGHT;
  color += MOOD_CLUSTER  * scatter * SCATTER_WEIGHT;
  color += _rimLight(NdotV) * RIM_WEIGHT;
  return color;
}

// Always a full 3-way blend, no early-out branches (no hard switches, ever).
vec3 shadeHit(vec3 p, vec3 n, vec3 rd) {
  float NdotV = max(dot(n, -rd), 0.0);
  return shadeMetaball(n, rd, NdotV)   * metaballBlend
       + shadeCluster(p, n, rd, NdotV) * clusterBlend
       + shadeBurst(n, rd, NdotV)      * burstBlend;
}
`;
