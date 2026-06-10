// Color palette and phase blend weights. Declares own uniforms (metaballBlend, clusterBlend, burstBlend).
// Preconditions: none.

export const moodLibrary = `

uniform float metaballBlend;
uniform float clusterBlend;
uniform float burstBlend;

const vec3 MOOD_METABALL = vec3(0.588, 0.914, 0.949);  // very light cyan-blue
const vec3 MOOD_CLUSTER  = vec3(0.275, 0.745, 0.920);  // teal-cyan
const vec3 MOOD_BURST    = vec3(0.922, 0.298, 0.110);  // vivid orange-red

vec3 moodColor() {
  return MOOD_METABALL * metaballBlend
       + MOOD_CLUSTER  * clusterBlend
       + MOOD_BURST    * burstBlend;
}
`;
