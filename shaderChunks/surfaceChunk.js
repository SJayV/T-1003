export const surfaceChunk = `


// ──── CONSTANTS ───────────────────────────────────────────────────────────────────


const vec3  KEY_LIGHT_DIR_RAW      = vec3(2.0, 2.5, 2.0);

const float SURFACE_ROUGHNESS  = 0.05;
const float ENV_CONE_SPREAD    = 0.18;


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

vec3 _fresnelSchlickRoughness(vec3 F0, float cosTheta, float roughness) {
  return F0 + (max(vec3(1.0 - roughness), F0) - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

float _fresnelFactor(float NdotV, float power) {
  return pow(1.0 - NdotV, power);
}


// ──── HELPER FUNCTIONS - REFLECTIVE SHADING ──────────────────────────────────


const float HIGHLIGHT_BRIGHTEN = 1.15;
const vec3  METAL_F0           = vec3(0.95);

vec3 _shadeReflective(vec3 n, vec3 rd, float NdotV) {
  vec3 highlightF0 = clamp(METAL_F0 * HIGHLIGHT_BRIGHTEN, 0.0, 1.0);

  vec3  ld    = normalize(KEY_LIGHT_DIR_RAW);
  vec3  v     = -rd;
  vec3  h     = normalize(ld + v);
  float NdotL = max(dot(n, ld), 0.0);
  float NdotH = max(dot(n, h),  0.0);
  float VdotH = max(dot(v, h),  0.0);

  float D   = _D_GGX(NdotH);
  float G   = _G_Smith(NdotV, NdotL);
  vec3  F   = _F_Schlick(highlightF0, VdotH);
  vec3 spec = (D * G * F) / max(4.0 * NdotV * NdotL, 0.001);

  vec3 F_ibl = _fresnelSchlickRoughness(METAL_F0, NdotV, SURFACE_ROUGHNESS);
  vec3 env   = _envSampleLod(reflect(rd, n));

  return spec * NdotL + env * F_ibl;
}


// ──── HELPER FUNCTIONS - GLASS SHADING ────────────────────────────────────────────


const float GLASS_IOR            = 1.35;
const float GLASS_ABSORPTION     = 0.6;
const int   GLASS_TRACE_STEPS    = 20;
const float GLASS_TRACE_EPSILON  = 0.002;
const float GLASS_TRACE_MAX_DIST = 3.0;
const vec3  GLASS_TINT_COLOR     = vec3(0.06, 0.1, 0.15);
const float GLASS_FRESNEL_POWER  = 2.5;

struct GlassExit { vec3 pos; vec3 normal; float dist; };

GlassExit _clusterTraceInterior(vec3 p, vec3 rd) {
  float t = GLASS_TRACE_EPSILON * 2.0;
  for (int i = 0; i < GLASS_TRACE_STEPS; i++) {
    float d = _clusterShape(p + rd * t);
    if (d > 0.0) break;
    t += max(-d, GLASS_TRACE_EPSILON);
    if (t > GLASS_TRACE_MAX_DIST) break;
  }
  vec3 exitPos = p + rd * t;
  return GlassExit(exitPos, normal(exitPos), t);
}

vec3 _clusterRefractedColor(vec3 p, vec3 n, vec3 rd) {
  vec3 rIn = refract(rd, n, 1.0 / GLASS_IOR);
  if (dot(rIn, rIn) < 0.0001) return _envSampleLod(reflect(rd, n));

  GlassExit ex = _clusterTraceInterior(p - n * GLASS_TRACE_EPSILON, rIn);
  vec3 rOut = refract(rIn, -ex.normal, GLASS_IOR);
  if (dot(rOut, rOut) < 0.0001) rOut = rIn;

  vec3  transmitted = _envSampleLod(rOut);
  float absorb      = exp(-ex.dist * GLASS_ABSORPTION);
  return mix(GLASS_TINT_COLOR, transmitted, absorb);
}


// ──── PHASE SHADING ───────────────────────────────────────────────────────────────────


vec3 _metaballShading(vec3 n, vec3 rd, float NdotV) {
  return _shadeReflective(n, rd, NdotV);
}

vec3 _clusterShading(vec3 p, vec3 n, vec3 rd, float NdotV) {
  float fresnel = _fresnelFactor(NdotV, GLASS_FRESNEL_POWER);

  vec3 reflected = _envSampleLod(reflect(rd, n));
  vec3 refracted = _clusterRefractedColor(p, n, rd);
  return mix(refracted, reflected, fresnel);
}

vec3 _burstShading(vec3 n, vec3 rd, float NdotV) {
  return _shadeReflective(n, rd, NdotV);
}


// ──── WEIGHTED BLENDING ───────────────────────────────────────────────────────────────


vec3 blendShading(vec3 p, vec3 n, vec3 rd) {
  float NdotV = max(dot(n, -rd), 0.0);
  return _metaballShading(n, rd, NdotV)   * metaballBlend
       + _clusterShading(p, n, rd, NdotV) * clusterBlend
       + _burstShading(n, rd, NdotV)      * burstBlend;
}
`;
