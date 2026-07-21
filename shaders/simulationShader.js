import { noiseChunk, vertexChunk } from '../shaderChunks/helpersChunk.js';
import { positionChunk } from '../shaderChunks/positionChunk.js';
import { STATE_TEXTURE_WIDTH, TEXELS_PER_BALL, glslFloat } from '../src/constants.js';

export const simulationVertex = vertexChunk;

export const simulationFragment = `
precision highp float;
precision highp sampler2D;

uniform sampler2D stateTexture;
uniform float     time;
uniform float     clusterBlend;
uniform float     metaballBlend;
uniform float     burstBlend;
uniform float     motionSpeed;

const float TEXTURE_WIDTH   = ${glslFloat(STATE_TEXTURE_WIDTH)};
const int   TEXELS_PER_BALL = ${TEXELS_PER_BALL};


// ──── HELPER FUNCTIONS - STATE TEXTURE ACCESS ────────────────────────────────────


vec2 stateUV(int i) { return vec2((float(i) + 0.5) / TEXTURE_WIDTH, 0.5); }

vec3  readPos(int ball) { return texture2D(stateTexture, stateUV(ball * TEXELS_PER_BALL    )).xyz; }
float readInitialRadius(int ball) { return texture2D(stateTexture, stateUV(ball * TEXELS_PER_BALL    )).w; }
vec3  readVel(int ball) { return texture2D(stateTexture, stateUV(ball * TEXELS_PER_BALL + 1)).xyz; }
vec4  readOrb(int ball) { return texture2D(stateTexture, stateUV(ball * TEXELS_PER_BALL + 2));     }

${noiseChunk}
${positionChunk}


// ──── ENTRY POINT ─────────────────────────────────────────────────────────────────


void main() {
  int texelIndex = int(gl_FragCoord.x);
  int ballIndex  = texelIndex / TEXELS_PER_BALL;
  int subIndex   = texelIndex - ballIndex * TEXELS_PER_BALL;

  if (subIndex == TEXELS_PER_BALL - 1) { gl_FragColor = texture2D(stateTexture, stateUV(texelIndex)); return; }

  vec3 pos = readPos(ballIndex);
  vec3 vel = readVel(ballIndex);
  float initialRadius = readInitialRadius(ballIndex);
  vec4 orb = readOrb(ballIndex);

  blendPosition(pos, vel, orb);

  if (subIndex == 0) { gl_FragColor = vec4(pos, initialRadius); }
  else             { gl_FragColor = vec4(vel, radiusMod(pos, initialRadius)); }
}
`;
