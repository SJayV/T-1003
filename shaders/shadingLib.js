// GLSL shading chunk — interpolated into mainFrag after map() by raymarchShader.js.
// Preconditions: uniforms envMap, envMapNext, envBlend, reflectAll, phase declared;
//                map(vec3) defined (used for thickness proxy in shadeCluster).
// Public GLSL interface: vec3 shadeHit(vec3 p, vec3 n, vec3 rd, float phase)

export const shadingLib = `

// ── shading: color palette ────────────────────────────────────────────────────

vec3 SH_BASE      = vec3(0.35, 0.47, 0.5 );
vec3 SH_INNER     = vec3(0.5,  0.75, 1.2 );
vec3 SH_OUTERGLOW = vec3(0.35, 0.9,  0.7 );
vec3 SH_INNERGLOW = vec3(0.2,  0.9,  0.8 );

vec2 _envUV(vec3 dir) {
  const float PI = 3.14159265;
  return vec2(atan(dir.z, dir.x) / (2.0 * PI) + 0.5,
              asin(clamp(dir.y, -1.0, 1.0)) / PI + 0.5);
}

// ── shading: metallic / reflective (Metaball + Burst) ─────────────────────────
// Environment map sampling + Reinhard tonemap.
// Roughness-dependent mip selection goes here once PMREM is implemented.

vec3 shadeMetal(vec3 n, vec3 rd, vec3 ld, float fresnel, float diffuse, float spec) {
  vec3 r   = reflect(rd, n);
  vec3 env = mix(texture2D(envMap, _envUV(r)).rgb, texture2D(envMapNext, _envUV(r)).rgb, envBlend);
  env      = env / (env + 1.0);

  vec3 color  = SH_BASE * diffuse * 0.4;
  color      += (vec3(0.02) + env) * (1.0 + fresnel);
  color      += spec * 2.3;
  return color;
}

// ── shading: translucent / luminescent (Cluster) ──────────────────────────────
// Fresnel inversion, thickness proxy via map(), scatter term.
// Replace thickness proxy with SSS or volume marching when desired.

vec3 shadeCluster(vec3 p, vec3 n, vec3 rd, vec3 ld, float spec) {
  float invFresnel = pow(max(dot(n, -rd), 0.0), 2.5);
  float thickness  = clamp(-map(p - n * 0.08), 0.0, 1.0);
  float innerGlow  = smoothstep(0.0, 0.15, thickness) * 1.2;
  float scatter    = pow(max(dot(-ld, n), 0.0), 2.0);

  vec3 color  = vec3(0.0);
  color += SH_INNER     * invFresnel * 3.0;
  color += SH_INNERGLOW * innerGlow  * 1.4;
  color += spec         * 1.8;
  color += SH_OUTERGLOW * scatter;

  float edgeFade = pow(1.0 - invFresnel, 1.5);
  return mix(vec3(0.0), color, 0.3) * (1.0 - edgeFade * 0.5);
}

// ── shading: main entry point ─────────────────────────────────────────────────
// Blends metal/cluster continuously via phase value.
// Callers need not know which shading model produces the result.

vec3 shadeHit(vec3 p, vec3 n, vec3 rd, float phase) {
  vec3  ld      = normalize(vec3(2.0, 2.5, 2.0));
  vec3  h       = normalize(ld - rd);
  float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 4.0);
  float diffuse = max(dot(n, ld), 0.0);
  float spec    = pow(max(dot(n, h), 0.0), 180.0);

  vec3 metal = shadeMetal(n, rd, ld, fresnel, diffuse, spec);
  if (reflectAll > 0.5) return metal;

  vec3  cluster = shadeCluster(p, n, rd, ld, spec);
  float blend   = smoothstep(0.0, 0.4, phase) * (1.0 - smoothstep(1.0, 2.0, phase));
  return mix(metal, cluster, blend);
}
`;
