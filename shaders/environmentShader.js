import { vertexChunk } from '../shaderChunks/vertexChunk.js';
import { noiseChunk  } from '../shaderChunks/noiseChunk.js';
import { colorChunk  } from '../shaderChunks/colorChunk.js';

export const environmentVert = vertexChunk;

export const environmentFrag = `
precision highp float;

uniform float time;
uniform vec2  resolution;

${noiseChunk}
${colorChunk}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  gl_FragColor = vec4(blendEnvironment(uv), 1.0);
}
`;
