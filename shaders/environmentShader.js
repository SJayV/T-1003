import { sampleChunk, screenChunk, vertexChunk } from '../shaderChunks/helpersChunk.js';
import { colorChunk } from '../shaderChunks/colorChunk.js';

export const environmentVertex = vertexChunk;

export const environmentFragment = `
precision highp float;

uniform float time;
uniform vec2 resolution;
uniform sampler2D clusterSourceMap;
uniform sampler2D metaballSourceMap;
uniform float metaballWeight;
uniform float clusterWeight;
uniform float burstWeight;

${sampleChunk}
${screenChunk}
${colorChunk}

void main() {
  vec2 uv = _screenUV();
  gl_FragColor = vec4(blendEnvironment(uv, clusterSourceMap, metaballSourceMap), 1.0);
}
`;