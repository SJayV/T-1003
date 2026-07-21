// ──── BRIGHT-PASS EXTRACTION ───────────────────────────────────────────────────────


export const brightExtractFragment = `
precision highp float;
uniform sampler2D mainTexture;
uniform vec2      resolution;
uniform float     threshold;
void main() {
  const vec3  LUMA_WEIGHTS = vec3(0.2126, 0.7152, 0.0722);
  vec2  uv    = gl_FragCoord.xy / resolution;
  vec3  color = texture2D(mainTexture, uv).rgb;
  float luma  = dot(color, LUMA_WEIGHTS);
  float t     = max(luma - threshold, 0.0) / max(luma, 0.001);
  gl_FragColor = vec4(color * t, 1.0);
}
`;


// ──── GAUSSIAN BLUR ────────────────────────────────────────────────────────────────


export const blurFragment = `
precision highp float;
uniform sampler2D blurTexture;
uniform vec2      resolution;
uniform vec2      blurDirection;
void main() {
  vec2 uv   = gl_FragCoord.xy / resolution;
  vec2 step = blurDirection / resolution;
  vec4 sum  = vec4(0.0);
  sum += texture2D(blurTexture, uv + step * -4.0) * 0.0162;
  sum += texture2D(blurTexture, uv + step * -3.0) * 0.0540;
  sum += texture2D(blurTexture, uv + step * -2.0) * 0.1216;
  sum += texture2D(blurTexture, uv + step * -1.0) * 0.1945;
  sum += texture2D(blurTexture, uv)               * 0.2270;
  sum += texture2D(blurTexture, uv + step *  1.0) * 0.1945;
  sum += texture2D(blurTexture, uv + step *  2.0) * 0.1216;
  sum += texture2D(blurTexture, uv + step *  3.0) * 0.0540;
  sum += texture2D(blurTexture, uv + step *  4.0) * 0.0162;
  gl_FragColor = sum;
}
`;


// ──── COMPOSITE ────────────────────────────────────────────────────────────────────


export const compositeFragment = `
precision highp float;
uniform sampler2D mainTexture;
uniform sampler2D bloomTexture;
uniform vec2      resolution;
uniform float     intensity;
void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  gl_FragColor = vec4(texture2D(mainTexture, uv).rgb + texture2D(bloomTexture, uv).rgb * intensity, 1.0);
}
`;
