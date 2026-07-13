// Color palette and phase blend weights. Declares own uniforms (metaballBlend, clusterBlend, burstBlend).
// Preconditions: none.

export const moodChunk = `

uniform float metaballBlend;
uniform float clusterBlend;
uniform float burstBlend;

const float MOOD_DARKEN = 0.75;  // overall darkening applied to every mood colour below

const vec3 MOOD_METABALL = vec3(0.188, 0.514, 0.649) * MOOD_DARKEN;  // cyan
const vec3 MOOD_CLUSTER  = vec3(0.275, 0.745, 0.920) * MOOD_DARKEN;  // teal-cyan
const vec3 MOOD_BURST    = vec3(0.622, 0.298, 0.110) * MOOD_DARKEN;  // vivid orange-red

// Metaball's metallic F0 tint (shadeMetaball in raymarchChunk.js). Placeholder
// grey — tune this one value; _shadeReflective derives its own highlight
// variant from it, no second constant needed.
const vec3 MOOD_METABALL_METAL = vec3(0.5, 0.65, 0.65) * MOOD_DARKEN;

vec3 moodColor() {
  return MOOD_METABALL * metaballBlend
       + MOOD_CLUSTER  * clusterBlend
       + MOOD_BURST    * burstBlend;
}
`;
