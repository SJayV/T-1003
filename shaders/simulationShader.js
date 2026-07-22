import { vertexChunk } from '../shaderChunks/helpersChunk.js';
import { positionChunk } from '../shaderChunks/positionChunk.js';
import { STATE_TEXTURE_WIDTH, TEXELS_PER_BALL, glslFloat } from '../src/constants.js';

export const simulationVertex = vertexChunk;

export const simulationFragment = `
precision highp float;
precision highp sampler2D;

uniform sampler2D stateTexture;
uniform float clusterWeight;
uniform float metaballWeight;
uniform float burstWeight;
uniform float motionSpeed;

const float TEXTURE_WIDTH = ${glslFloat(STATE_TEXTURE_WIDTH)};
const int TEXELS_PER_BALL = ${TEXELS_PER_BALL};


// ──── HELPER FUNCTIONS - STATE TEXTURE ACCESS ──────────────────────────────


vec2 stateUV(int index) {
  return vec2((float(index) + 0.5) / TEXTURE_WIDTH, 0.5);
}

vec3 fetchPosition(int ball) {
  return texture2D(stateTexture, stateUV(ball * TEXELS_PER_BALL)).xyz;
}

float fetchInitialRadius(int ball) {
  return texture2D(stateTexture, stateUV(ball * TEXELS_PER_BALL)).w;
}

vec3 fetchVelocity(int ball) {
  return texture2D(stateTexture, stateUV(ball * TEXELS_PER_BALL + 1)).xyz;
}

vec4 fetchOrbit(int ball) {
  return texture2D(stateTexture, stateUV(ball * TEXELS_PER_BALL + 2));
}

${positionChunk}


// ──── HELPER FUNCTIONS - ENTRY POINT ───────────────────────────────────────


struct TexelIndices { int texelIndex; int ballIndex; int subIndex; };

TexelIndices _computeIndices() {
  int texelIndex = int(gl_FragCoord.x);
  int ballIndex = texelIndex / TEXELS_PER_BALL;
  int subIndex = texelIndex - ballIndex * TEXELS_PER_BALL;
  return TexelIndices(texelIndex, ballIndex, subIndex);
}

struct BallState { vec3 position; vec3 velocity; float initialRadius; vec4 orbit; };

BallState _fetchBallState(int ball) {
  return BallState(fetchPosition(ball), fetchVelocity(ball), fetchInitialRadius(ball), fetchOrbit(ball));
}

bool _isOrbitTexel(int subIndex) {
  return subIndex == TEXELS_PER_BALL - 1;
}

bool _isPositionTexel(int subIndex) {
  return subIndex == 0;
}


// ──── ENTRY POINT ──────────────────────────────────────────────────────────


void main() {
  TexelIndices indices = _computeIndices();

  if (_isOrbitTexel(indices.subIndex)) {
    gl_FragColor = texture2D(stateTexture, stateUV(indices.texelIndex));
    return;
  }

  BallState ballState = _fetchBallState(indices.ballIndex);

  blendPosition(ballState.position, ballState.velocity, ballState.orbit);

  if (_isPositionTexel(indices.subIndex)) {
    gl_FragColor = vec4(ballState.position, ballState.initialRadius);
  } else {
    gl_FragColor = vec4(ballState.velocity, ballState.initialRadius);
  }
}
`;