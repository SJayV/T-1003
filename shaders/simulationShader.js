import { vertexChunk   } from '../shaderChunks/vertexChunk.js';
import { noiseChunk    } from '../shaderChunks/noiseChunk.js';
import { positionChunk } from '../shaderChunks/positionChunk.js';
import { STATE_TEX_W, glslFloat } from '../src/constants.js';

export const simulationVert = vertexChunk;

export const simulationFrag = `
precision highp float;
precision highp sampler2D;

uniform sampler2D stateTex;
uniform float     time;
uniform float     clusterBlend;
uniform float     metaballBlend;
uniform float     burstBlend;
uniform float     motionSpeed;

const float TEX_W = ${glslFloat(STATE_TEX_W)};


// ──── HELPER FUNCTIONS - STATE TEXTURE ACCESS ────────────────────────────────────


vec2 stateUV(int i) { return vec2((float(i) + 0.5) / TEX_W, 0.5); }

vec3  readPos(int b) { return texture2D(stateTex, stateUV(b * 3    )).xyz; }
float readR0 (int b) { return texture2D(stateTex, stateUV(b * 3    )).w;   }
vec3  readVel(int b) { return texture2D(stateTex, stateUV(b * 3 + 1)).xyz; }
vec4  readOrb(int b) { return texture2D(stateTex, stateUV(b * 3 + 2));     }

${noiseChunk}
${positionChunk}


// ──── ENTRY POINT ─────────────────────────────────────────────────────────────────


void main() {
  int texelIdx = int(gl_FragCoord.x);
  int ballIdx  = texelIdx / 3;
  int subIdx   = texelIdx - ballIdx * 3;

  if (subIdx == 2) { gl_FragColor = texture2D(stateTex, stateUV(texelIdx)); return; }

  vec3 pos = readPos(ballIdx);
  vec3 vel = readVel(ballIdx);
  float r0 = readR0(ballIdx);
  vec4 orb = readOrb(ballIdx);

  blendPosition(pos, vel, orb, ballIdx);

  if (subIdx == 0) { gl_FragColor = vec4(pos, r0); }
  else             { gl_FragColor = vec4(vel, radiusMod(pos, r0)); }
}
`;
