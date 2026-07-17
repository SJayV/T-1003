import { noiseChunk, sampleChunk, vertexChunk } from '../shaderChunks/helpersChunk.js';
import { shapeChunk    } from '../shaderChunks/shapeChunk.js';
import { surfaceChunk  } from '../shaderChunks/surfaceChunk.js';
import { STATE_TEX_W, glslFloat } from '../src/constants.js';

export const mainVert = vertexChunk;

export function buildMainFrag() {
  return `
precision highp float;
precision highp sampler2D;

uniform float     time;
uniform vec2      resolution;
uniform vec3      camPos;
uniform sampler2D envMap;
uniform sampler2D stateTex;
uniform float     metaballBlend;
uniform float     clusterBlend;
uniform float     burstBlend;


// ──── HELPER FUNCTIONS - STATE TEXTURE UNPACKING ─────────────────────────────────


vec3  gC0,  gC1,  gC2,  gC3,  gC4,  gC5,  gC6,  gC7,  gC8,  gC9,  gC10, gC11;
float gRad0, gRad1, gRad2, gRad3, gRad4, gRad5, gRad6, gRad7, gRad8, gRad9, gRad10, gRad11;

void loadBalls() {
  const float S = 1.0 / ${glslFloat(STATE_TEX_W)};
  gC0 =texture2D(stateTex,vec2( 0.5*S,0.5)).xyz; gRad0 =texture2D(stateTex,vec2( 1.5*S,0.5)).w;
  gC1 =texture2D(stateTex,vec2( 3.5*S,0.5)).xyz; gRad1 =texture2D(stateTex,vec2( 4.5*S,0.5)).w;
  gC2 =texture2D(stateTex,vec2( 6.5*S,0.5)).xyz; gRad2 =texture2D(stateTex,vec2( 7.5*S,0.5)).w;
  gC3 =texture2D(stateTex,vec2( 9.5*S,0.5)).xyz; gRad3 =texture2D(stateTex,vec2(10.5*S,0.5)).w;
  gC4 =texture2D(stateTex,vec2(12.5*S,0.5)).xyz; gRad4 =texture2D(stateTex,vec2(13.5*S,0.5)).w;
  gC5 =texture2D(stateTex,vec2(15.5*S,0.5)).xyz; gRad5 =texture2D(stateTex,vec2(16.5*S,0.5)).w;
  gC6 =texture2D(stateTex,vec2(18.5*S,0.5)).xyz; gRad6 =texture2D(stateTex,vec2(19.5*S,0.5)).w;
  gC7 =texture2D(stateTex,vec2(21.5*S,0.5)).xyz; gRad7 =texture2D(stateTex,vec2(22.5*S,0.5)).w;
  gC8 =texture2D(stateTex,vec2(24.5*S,0.5)).xyz; gRad8 =texture2D(stateTex,vec2(25.5*S,0.5)).w;
  gC9 =texture2D(stateTex,vec2(27.5*S,0.5)).xyz; gRad9 =texture2D(stateTex,vec2(28.5*S,0.5)).w;
  gC10=texture2D(stateTex,vec2(30.5*S,0.5)).xyz; gRad10=texture2D(stateTex,vec2(31.5*S,0.5)).w;
  gC11=texture2D(stateTex,vec2(33.5*S,0.5)).xyz; gRad11=texture2D(stateTex,vec2(34.5*S,0.5)).w;
}

${noiseChunk}
${sampleChunk}
${shapeChunk}
${surfaceChunk}


// ──── RAYMARCHING ─────────────────────────────────────────────────────────────────


float raymarch(vec3 ro, vec3 rd) {
  const int   MAX_STEPS    = 90;
  const float HIT_EPSILON  = 0.001;
  const float MAX_DISTANCE = 10.0;

  float blendRisk  = clusterBlend * (metaballBlend + burstBlend);
  float stepSafety = mix(1.0, 0.85, min(blendRisk * 4.0, 1.0));

  float t = 0.0;
  for (int i = 0; i < MAX_STEPS; i++) {
    float d = blendShape(ro + rd * t);
    if (d < HIT_EPSILON) return t;
    t += d * stepSafety;
    if (t > MAX_DISTANCE) break;
  }
  return -1.0;
}


// ──── ENTRY POINT ─────────────────────────────────────────────────────────────────


void main() {
  const float CAMERA_FOCAL_LENGTH = 1.5;

  loadBalls();

  vec2  uv  = (gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y;
  vec3  ro  = camPos;
  vec3  rd  = normalize(vec3(uv, -CAMERA_FOCAL_LENGTH));
  float hit = raymarch(ro, rd);

  vec3 color = vec3(0.0);
  if (hit > 0.0) {
    vec3 p = ro + rd * hit;
    color  = blendShading(p, normal(p), rd);
  }

  gl_FragColor = vec4(color, 1.0);
}
`;
}
