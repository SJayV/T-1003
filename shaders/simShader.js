export const simVert = `
void main() {
  gl_Position = vec4(position, 1.0);
}
`;

// Placeholder — GPU simulation not yet implemented.
// Will read state texture, compute next ball positions/velocities, write output.
export const simFrag = `
precision highp float;
void main() {
  gl_FragColor = vec4(0.0);
}
`;
