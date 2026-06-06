// Color palette + blend interpolation. Blend weights precomputed in phase.js; always sum to 1.
// Preconditions: uniforms metaballBlend, clusterBlend, burstBlend (float) declared.

export const moodLibrary = `

uniform float metaballBlend;
uniform float clusterBlend;
uniform float burstBlend;

const vec3 MOOD_METABALL = vec3(0.78, 0.83, 0.90);  // cold silver-grey
const vec3 MOOD_CLUSTER  = vec3(0.00, 0.78, 0.95);  // cyan-teal
const vec3 MOOD_BURST    = vec3(0.90, 0.10, 0.20);  // bright red

vec3 moodColor() {
  return MOOD_METABALL * metaballBlend
       + MOOD_CLUSTER  * clusterBlend
       + MOOD_BURST    * burstBlend;
}
`;
