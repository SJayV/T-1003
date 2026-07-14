export const surfaceChunk = `


// ──── CONSTANTS ───────────────────────────────────────────────────────────────────


const vec3  KEY_LIGHT_DIR_RAW      = vec3(2.0, 2.5, 2.0);
const float RIM_LIGHT_POWER     = 2.0;
const float RIM_LIGHT_INTENSITY = 2.2;

const float SURFACE_ROUGHNESS  = 0.3;
const float ENV_CONE_SPREAD    = 0.18;
const float RIM_WEIGHT         = 0.5;


// ──── HELPER FUNCTIONS - ENVIRONMENT MAPPING ─────────────────────────────────────


vec2 _envUV(vec3 dir) {
  const float PI = 3.14159265;
  return vec2(atan(dir.z, dir.x) / (2.0 * PI) + 0.5,
              asin(clamp(dir.y, -1.0, 1.0)) / PI + 0.5);
}

vec3 _envSample(vec3 dir) {
  vec3 raw = texture2D(envMap, _envUV(dir)).rgb;
  return raw / (raw + 1.0);
}

vec3 _envSampleLod(vec3 dir) {
  vec3  right  = normalize(cross(dir, vec3(0.0, 1.0, 0.001)));
  vec3  up     = cross(right, dir);
  float spread = ENV_CONE_SPREAD;
  vec3 sum  = _envSample(dir);
  sum += _envSample(normalize(dir + right * spread));
  sum += _envSample(normalize(dir - right * spread));
  sum += _envSample(normalize(dir + up    * spread));
  sum += _envSample(normalize(dir - up    * spread));
  return sum / 5.0;
}


// ──── HELPER FUNCTIONS - COOK-TORRANCE PBR ───────────────────────────────────


float _D_GGX(float NdotH) {
  float a2 = SURFACE_ROUGHNESS * SURFACE_ROUGHNESS * SURFACE_ROUGHNESS * SURFACE_ROUGHNESS;
  float d  = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / (3.14159265 * d * d);
}

float _G_Smith(float NdotV, float NdotL) {
  float k  = (SURFACE_ROUGHNESS + 1.0); k = k * k / 8.0;
  float gV = NdotV / (NdotV * (1.0 - k) + k);
  float gL = NdotL / (NdotL * (1.0 - k) + k);
  return gV * gL;
}

vec3 _F_Schlick(vec3 F0, float cosTheta) {
  return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

vec3 _rimLight(vec3 tint, float NdotV) {
  return tint * pow(1.0 - NdotV, RIM_LIGHT_POWER) * RIM_LIGHT_INTENSITY;
}


// ──── HELPER FUNCTIONS - REFLECTIVE SHADING ──────────────────────────────────


const float HIGHLIGHT_BRIGHTEN = 1.15;

vec3 _shadeReflective(vec3 n, vec3 rd, float NdotV, vec3 tint) {
  vec3 highlightTint = clamp(tint * HIGHLIGHT_BRIGHTEN, 0.0, 1.0);

  vec3  ld    = normalize(KEY_LIGHT_DIR_RAW);
  vec3  v     = -rd;
  vec3  h     = normalize(ld + v);
  float NdotL = max(dot(n, ld), 0.0);
  float NdotH = max(dot(n, h),  0.0);
  float VdotH = max(dot(v, h),  0.0);

  float D   = _D_GGX(NdotH);
  float G   = _G_Smith(NdotV, NdotL);
  vec3  F   = _F_Schlick(highlightTint, VdotH);
  vec3 spec = (D * G * F) / max(4.0 * NdotV * NdotL, 0.001);

  vec3 F_ibl = _F_Schlick(tint, NdotV);
  vec3 env   = _envSampleLod(reflect(rd, n));

  return spec * NdotL + env * F_ibl + _rimLight(RIMLIGHT_COLOR, NdotV) * RIM_WEIGHT;
}


// ──── PHASE SHADING ───────────────────────────────────────────────────────────────────


vec3 _metaballShading(vec3 n, vec3 rd, float NdotV) {
  return _shadeReflective(n, rd, NdotV, METABALL_COLOR);
}

vec3 _clusterShading(vec3 p, vec3 n, vec3 rd, float NdotV) {
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

  vec3  ld        = normalize(KEY_LIGHT_DIR_RAW);
  float spec      = pow(max(dot(n, normalize(ld - rd)), 0.0), SPECULAR_POWER);
  float thickness = clamp(-blendShape(p - n * THICKNESS_SAMPLE_OFFSET), 0.0, 1.0);
  float innerGlow = smoothstep(INNER_GLOW_RANGE_START, INNER_GLOW_RANGE_END, thickness) * INNER_GLOW_INTENSITY;
  float fresnel   = pow(1.0 - NdotV, FRESNEL_POWER);
  float scatter   = pow(max(dot(-ld, n), 0.0), SCATTER_POWER);

  vec3 color = vec3(0.0);
  color += CLUSTER_COLOR  * fresnel * FRESNEL_WEIGHT;
  color += METABALL_COLOR * innerGlow * INNER_GLOW_WEIGHT;
  color += spec * SPEC_WEIGHT;
  color += CLUSTER_COLOR  * scatter * SCATTER_WEIGHT;
  color += _rimLight(CLUSTER_COLOR, NdotV) * RIM_WEIGHT;
  return color;
}

vec3 _burstShading(vec3 n, vec3 rd, float NdotV) {
  return _shadeReflective(n, rd, NdotV, BURST_COLOR);
}


// ──── WEIGHTED BLENDING ───────────────────────────────────────────────────────────────


vec3 shadeHit(vec3 p, vec3 n, vec3 rd) {
  float NdotV = max(dot(n, -rd), 0.0);
  return _metaballShading(n, rd, NdotV) * metaballBlend
       + _clusterShading(p, n, rd, NdotV) * clusterBlend
       + _burstShading(n, rd, NdotV)      * burstBlend;
}
`;
