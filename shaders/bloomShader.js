export const brightExtractFrag = `
precision highp float;
uniform sampler2D mainTex;
uniform vec2      resolution;
uniform float     threshold;
void main() {
  const vec3  LUMA_WEIGHTS = vec3(0.2126, 0.7152, 0.0722);  // Rec. 709 perceptual luminance
  vec2  uv    = gl_FragCoord.xy / resolution;
  vec3  color = texture2D(mainTex, uv).rgb;
  float luma  = dot(color, LUMA_WEIGHTS);
  float t     = max(luma - threshold, 0.0) / max(luma, 0.001);
  gl_FragColor = vec4(color * t, 1.0);
}
`;

// 9-tap separable Gaussian kernel (sigma tuned for bloom softness), normalized to sum to 1.
export const blurFrag = `
precision highp float;
uniform sampler2D blurTex;
uniform vec2      resolution;
uniform vec2      blurDir;
void main() {
  vec2 uv   = gl_FragCoord.xy / resolution;
  vec2 step = blurDir / resolution;
  vec4 sum  = vec4(0.0);
  sum += texture2D(blurTex, uv + step * -4.0) * 0.0162;
  sum += texture2D(blurTex, uv + step * -3.0) * 0.0540;
  sum += texture2D(blurTex, uv + step * -2.0) * 0.1216;
  sum += texture2D(blurTex, uv + step * -1.0) * 0.1945;
  sum += texture2D(blurTex, uv)               * 0.2270;
  sum += texture2D(blurTex, uv + step *  1.0) * 0.1945;
  sum += texture2D(blurTex, uv + step *  2.0) * 0.1216;
  sum += texture2D(blurTex, uv + step *  3.0) * 0.0540;
  sum += texture2D(blurTex, uv + step *  4.0) * 0.0162;
  gl_FragColor = sum;
}
`;

export const compositeFrag = `
precision highp float;
uniform sampler2D mainTex;
uniform sampler2D bloomTex;
uniform vec2      resolution;
uniform float     intensity;
void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  gl_FragColor = vec4(texture2D(mainTex, uv).rgb + texture2D(bloomTex, uv).rgb * intensity, 1.0);
}
`;
