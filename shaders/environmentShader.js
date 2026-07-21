import { sampleChunk, vertexChunk } from '../shaderChunks/helpersChunk.js';
import { colorChunk } from '../shaderChunks/colorChunk.js';

export const environmentVertex = vertexChunk;

export const environmentFragment = `
precision highp float;

uniform float time;
uniform vec2 resolution;
uniform sampler2D clusterSourceMap;
uniform sampler2D metaballSourceMap;
uniform float metaballBlend;
uniform float clusterBlend;
uniform float burstBlend;

${sampleChunk}
${colorChunk}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  gl_FragColor = vec4(blendEnvironment(uv, clusterSourceMap, metaballSourceMap), 1.0);
}
`;
