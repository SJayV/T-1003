import { noiseChunk, sampleChunk, vertexChunk } from '../shaderChunks/helpersChunk.js';
import { shapeChunk } from '../shaderChunks/shapeChunk.js';
import { surfaceChunk } from '../shaderChunks/surfaceChunk.js';
import { STATE_TEXTURE_WIDTH, glslFloat } from '../src/constants.js';

export const mainVertex = vertexChunk;

export const mainFragment = `
precision highp float;
precision highp sampler2D;

uniform float time;
uniform vec2 resolution;
uniform vec3 cameraWorldPosition;
uniform sampler2D environmentMap;
uniform sampler2D stateTexture;
uniform float metaballBlend;
uniform float clusterBlend;
uniform float burstBlend;


// ──── HELPER FUNCTIONS - STATE TEXTURE UNPACKING ─────────────────────────────────


vec3 _ballCenter0, _ballCenter1, _ballCenter2, _ballCenter3, _ballCenter4, _ballCenter5, _ballCenter6, _ballCenter7, _ballCenter8, _ballCenter9, _ballCenter10, _ballCenter11;
float _ballRadius0, _ballRadius1, _ballRadius2, _ballRadius3, _ballRadius4, _ballRadius5, _ballRadius6, _ballRadius7, _ballRadius8, _ballRadius9, _ballRadius10, _ballRadius11;

void loadBalls() {
  const float texelSize = 1.0 / ${glslFloat(STATE_TEXTURE_WIDTH)};
  _ballCenter0 = texture2D(stateTexture, vec2(0.5 * texelSize, 0.5)).xyz; _ballRadius0 = texture2D(stateTexture, vec2(1.5 * texelSize, 0.5)).w;
  _ballCenter1 = texture2D(stateTexture, vec2(3.5 * texelSize, 0.5)).xyz; _ballRadius1 = texture2D(stateTexture, vec2(4.5 * texelSize, 0.5)).w;
  _ballCenter2 = texture2D(stateTexture, vec2(6.5 * texelSize, 0.5)).xyz; _ballRadius2 = texture2D(stateTexture, vec2(7.5 * texelSize, 0.5)).w;
  _ballCenter3 = texture2D(stateTexture, vec2(9.5 * texelSize, 0.5)).xyz; _ballRadius3 = texture2D(stateTexture, vec2(10.5 * texelSize, 0.5)).w;
  _ballCenter4 = texture2D(stateTexture, vec2(12.5 * texelSize, 0.5)).xyz; _ballRadius4 = texture2D(stateTexture, vec2(13.5 * texelSize, 0.5)).w;
  _ballCenter5 = texture2D(stateTexture, vec2(15.5 * texelSize, 0.5)).xyz; _ballRadius5 = texture2D(stateTexture, vec2(16.5 * texelSize, 0.5)).w;
  _ballCenter6 = texture2D(stateTexture, vec2(18.5 * texelSize, 0.5)).xyz; _ballRadius6 = texture2D(stateTexture, vec2(19.5 * texelSize, 0.5)).w;
  _ballCenter7 = texture2D(stateTexture, vec2(21.5 * texelSize, 0.5)).xyz; _ballRadius7 = texture2D(stateTexture, vec2(22.5 * texelSize, 0.5)).w;
  _ballCenter8 = texture2D(stateTexture, vec2(24.5 * texelSize, 0.5)).xyz; _ballRadius8 = texture2D(stateTexture, vec2(25.5 * texelSize, 0.5)).w;
  _ballCenter9 = texture2D(stateTexture, vec2(27.5 * texelSize, 0.5)).xyz; _ballRadius9 = texture2D(stateTexture, vec2(28.5 * texelSize, 0.5)).w;
  _ballCenter10 = texture2D(stateTexture, vec2(30.5 * texelSize, 0.5)).xyz; _ballRadius10 = texture2D(stateTexture, vec2(31.5 * texelSize, 0.5)).w;
  _ballCenter11 = texture2D(stateTexture, vec2(33.5 * texelSize, 0.5)).xyz; _ballRadius11 = texture2D(stateTexture, vec2(34.5 * texelSize, 0.5)).w;
}

${noiseChunk}
${sampleChunk}
${shapeChunk}
${surfaceChunk}


// ──── RAYMARCHING ─────────────────────────────────────────────────────────────────


float _computeStepSafety() {
  float blendRisk = clusterBlend * (metaballBlend + burstBlend);
  return mix(1.0, 0.85, min(blendRisk * 4.0, 1.0));
}

vec3 _primaryRayDirection() {
  const float CAMERA_FOCAL_LENGTH = 1.5;
  vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y;
  return normalize(vec3(uv, -CAMERA_FOCAL_LENGTH));
}

float raymarch(vec3 rayOrigin, vec3 rayDirection) {
  const int MAXIMUM_STEPS = 90;
  const float HIT_EPSILON = 0.001;
  const float MAXIMUM_DISTANCE = 10.0;

  float stepSafety = _computeStepSafety();

  float accumulatedDistance = 0.0;
  for (int stepIndex = 0; stepIndex < MAXIMUM_STEPS; stepIndex++) {
    float signedDistance = blendShape(rayOrigin + rayDirection * accumulatedDistance);
    if (signedDistance < HIT_EPSILON) return accumulatedDistance;
    accumulatedDistance += signedDistance * stepSafety;
    if (accumulatedDistance > MAXIMUM_DISTANCE) break;
  }
  return -1.0;
}


// ──── ENTRY POINT ─────────────────────────────────────────────────────────────────


void main() {
  loadBalls();

  vec3 rayOrigin = cameraWorldPosition;
  vec3 rayDirection = _primaryRayDirection();
  float hit = raymarch(rayOrigin, rayDirection);

  vec3 color = vec3(0.0);
  if (hit > 0.0) {
    vec3 point = rayOrigin + rayDirection * hit;
    color = blendShading(point, normal(point), rayDirection);
  }

  gl_FragColor = vec4(color, 1.0);
}
`;