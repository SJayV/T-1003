export const surfaceChunk = `


// ──── CONSTANTS ───────────────────────────────────────────────────────────────────


const float SURFACE_ROUGHNESS = 0.05;


// ──── HELPER FUNCTIONS - ENVIRONMENT MAPPING ─────────────────────────────────────


vec3 _environmentSample(vec3 direction) {
  vec3 raw = _sampleDirectionalTexture(environmentMap, direction);
  return raw / (raw + 1.0);
}


// ──── HELPER FUNCTIONS - COOK-TORRANCE PHYSICALLY-BASED RENDERING ───────────────────


float _distributionGGX(float normalDotHalf) {
  const float ALPHA_SQUARED = SURFACE_ROUGHNESS * SURFACE_ROUGHNESS * SURFACE_ROUGHNESS * SURFACE_ROUGHNESS;
  float denominator = normalDotHalf * normalDotHalf * (ALPHA_SQUARED - 1.0) + 1.0;
  return ALPHA_SQUARED / (PI * denominator * denominator);
}

float _geometrySchlickGGX(float normalDot) {
  const float ROUGHNESS_REMAP = (SURFACE_ROUGHNESS + 1.0) * (SURFACE_ROUGHNESS + 1.0) / 8.0;
  return normalDot / (normalDot * (1.0 - ROUGHNESS_REMAP) + ROUGHNESS_REMAP);
}

float _geometrySmith(float normalDotView, float normalDotLight) {
  return _geometrySchlickGGX(normalDotView) * _geometrySchlickGGX(normalDotLight);
}


// ──── HELPER FUNCTIONS - REFLECTIVE SHADING ──────────────────────────────────


vec3 _shadeReflective(vec3 surfaceNormal, vec3 rayDirection, float normalDotView) {
  const vec3 KEY_LIGHT_DIRECTION_RAW = vec3(2.0, 2.5, 2.0);
  const vec3 HIGHLIGHT_FRESNEL = vec3(1.0);
  const vec3 AMBIENT_FRESNEL = vec3(0.95);

  vec3 lightDirection = normalize(KEY_LIGHT_DIRECTION_RAW);
  vec3 viewDirection = -rayDirection;
  vec3 halfVector = normalize(lightDirection + viewDirection);
  float normalDotLight = max(dot(surfaceNormal, lightDirection), 0.0);
  float normalDotHalf = max(dot(surfaceNormal, halfVector), 0.0);

  float distribution = _distributionGGX(normalDotHalf);
  float geometry = _geometrySmith(normalDotView, normalDotLight);
  vec3 specular = (distribution * geometry * HIGHLIGHT_FRESNEL) / max(4.0 * normalDotView * normalDotLight, 0.001);

  vec3 environmentColor = _environmentSample(reflect(rayDirection, surfaceNormal));

  return specular * normalDotLight + environmentColor * AMBIENT_FRESNEL;
}


// ──── HELPER FUNCTIONS - GLASS SHADING ────────────────────────────────────────────


const float GLASS_INDEX_OF_REFRACTION = 1.35;
const float GLASS_TRACE_EPSILON = 0.002;

float _fresnelFactor(float normalDotView, float power) {
  return pow(1.0 - normalDotView, power);
}

struct GlassExit { vec3 position; vec3 normal; float distance; };

GlassExit _clusterTraceInterior(vec3 point, vec3 rayDirection) {
  const int GLASS_TRACE_STEPS = 20;
  const float GLASS_TRACE_MAX_DISTANCE = 3.0;

  float accumulatedDistance = GLASS_TRACE_EPSILON * 2.0;
  for (int stepIndex = 0; stepIndex < GLASS_TRACE_STEPS; stepIndex++) {
    float signedDistance = _clusterShape(point + rayDirection * accumulatedDistance);
    if (signedDistance > 0.0) break;
    accumulatedDistance += max(-signedDistance, GLASS_TRACE_EPSILON);
    if (accumulatedDistance > GLASS_TRACE_MAX_DISTANCE) break;
  }
  vec3 exitPosition = point + rayDirection * accumulatedDistance;
  return GlassExit(exitPosition, normal(exitPosition), accumulatedDistance);
}

bool _isDegenerateRefraction(vec3 refractedRay) {
  return dot(refractedRay, refractedRay) < 0.0001;
}

vec3 _exitRefractedRay(vec3 incomingRay, GlassExit glassExit) {
  vec3 exitingRay = refract(incomingRay, -glassExit.normal, GLASS_INDEX_OF_REFRACTION);
  return _isDegenerateRefraction(exitingRay) ? incomingRay : exitingRay;
}

vec3 _clusterRefractedColor(vec3 point, vec3 surfaceNormal, vec3 rayDirection) {
  const float GLASS_ABSORPTION = 0.6;
  const vec3 GLASS_TINT_COLOR = vec3(0.06, 0.1, 0.15);

  vec3 incomingRay = refract(rayDirection, surfaceNormal, 1.0 / GLASS_INDEX_OF_REFRACTION);
  if (_isDegenerateRefraction(incomingRay)) return _environmentSample(reflect(rayDirection, surfaceNormal));

  GlassExit glassExit = _clusterTraceInterior(point - surfaceNormal * GLASS_TRACE_EPSILON, incomingRay);
  vec3 exitingRay = _exitRefractedRay(incomingRay, glassExit);

  vec3 transmitted = _environmentSample(exitingRay);
  float absorption = exp(-glassExit.distance * GLASS_ABSORPTION);
  return mix(GLASS_TINT_COLOR, transmitted, absorption);
}


// ──── PHASE SHADING ───────────────────────────────────────────────────────────────────


vec3 _metaballShading(vec3 surfaceNormal, vec3 rayDirection, float normalDotView) {
  return _shadeReflective(surfaceNormal, rayDirection, normalDotView);
}

vec3 _clusterShading(vec3 point, vec3 surfaceNormal, vec3 rayDirection, float normalDotView) {
  const float GLASS_FRESNEL_POWER = 2.5;
  float fresnel = _fresnelFactor(normalDotView, GLASS_FRESNEL_POWER);

  vec3 reflected = _environmentSample(reflect(rayDirection, surfaceNormal));
  vec3 refracted = _clusterRefractedColor(point, surfaceNormal, rayDirection);
  return mix(refracted, reflected, fresnel);
}

vec3 _burstShading(vec3 surfaceNormal, vec3 rayDirection, float normalDotView) {
  return _shadeReflective(surfaceNormal, rayDirection, normalDotView);
}


// ──── WEIGHTED BLENDING ───────────────────────────────────────────────────────────────


vec3 blendShading(vec3 point, vec3 surfaceNormal, vec3 rayDirection) {
  float normalDotView = max(dot(surfaceNormal, -rayDirection), 0.0);
  return _metaballShading(surfaceNormal, rayDirection, normalDotView) * metaballBlend
       + _clusterShading(point, surfaceNormal, rayDirection, normalDotView) * clusterBlend
       + _burstShading(surfaceNormal, rayDirection, normalDotView) * burstBlend;
}
`;