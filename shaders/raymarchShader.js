import { vertexChunk   } from '../shaderChunks/vertexChunk.js';
import { noiseChunk    } from '../shaderChunks/noiseChunk.js';
import { colorChunk    } from '../shaderChunks/colorChunk.js';
import { shapeChunk    } from '../shaderChunks/shapeChunk.js';
import { surfaceChunk  } from '../shaderChunks/surfaceChunk.js';
import { STATE_TEX_W, glslFloat } from '../src/constants.js';

export const mainVert = vertexChunk;

export const mainFrag = `
precision highp float;
precision highp sampler2D;

uniform float     time;
uniform vec2      resolution;
uniform vec3      camPos;
uniform sampler2D envMap;
uniform sampler2D stateTex;

// loadBalls() populates these from stateTex once per fragment; shapeChunk's map() and
// everything it calls read them -- no texture access inside the raymarch loop or normal().
// gRad_i is read straight from the state texture's vel-texel .w channel -- the sim pass
// (positionChunk.js) already computed the noise-modulated radius once per ball there,
// so this pass never recomputes it per screen pixel.
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
${colorChunk}
${shapeChunk}

// Injected after map()/raymarch() (shapeChunk) so shadeCluster can call map() for the thickness proxy.
${surfaceChunk}

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
    color  = shadeHit(p, normal(p), rd);
  }

  gl_FragColor = vec4(color, 1.0);
}
`;
