import { noiseLibrary }       from '../libraries/noiseLibrary.js';
import { simulationLibrary } from '../libraries/simulationLibrary.js';

export const simulationVert = `
void main() {
  gl_Position = vec4(position, 1.0);
}
`;

export const simulationFrag = `
precision highp float;
precision highp sampler2D;

uniform sampler2D stateTex;
uniform float     time;
uniform float     logicalPhase;
uniform float     motionSpeed;

const float TEX_W = 36.0;

vec2 stateUV(int i) { return vec2((float(i) + 0.5) / TEX_W, 0.5); }

vec3  readPos(int b) { return texture2D(stateTex, stateUV(b * 3    )).xyz; }
float readR0 (int b) { return texture2D(stateTex, stateUV(b * 3    )).w;   }
vec3  readVel(int b) { return texture2D(stateTex, stateUV(b * 3 + 1)).xyz; }
vec4  readOrb(int b) { return texture2D(stateTex, stateUV(b * 3 + 2));     }

${noiseLibrary}
${simulationLibrary}

void main() {
  int texelIdx = int(gl_FragCoord.x);
  int ballIdx  = texelIdx / 3;
  int subIdx   = texelIdx - ballIdx * 3;

  if (subIdx == 2) { gl_FragColor = texture2D(stateTex, stateUV(texelIdx)); return; }

  vec3 pos = readPos(ballIdx);
  vec3 vel = readVel(ballIdx);
  float r0 = readR0(ballIdx);
  vec4 orb = readOrb(ballIdx);

  int phaseIdx = int(ceil(logicalPhase));
  if      (phaseIdx == 0) applyMetaball(pos, vel, orb);
  else if (phaseIdx == 1) applyCluster(pos, vel);
  else                    applyBurst(pos, vel, logicalPhase);

  if (subIdx == 0) { gl_FragColor = vec4(pos, r0);  }
  else             { gl_FragColor = vec4(vel, 0.0); }
}
`;
