// Manual mock for 'face-api.js' — it isn't an installed package (see vitest.config.js's
// alias), so this file is what 'face-api.js' actually resolves to during tests.
// input.test.js reuses these exports via vi.importActual instead of duplicating them.
export const nets = {
  tinyFaceDetector: { loadFromUri: () => Promise.resolve() },
  faceLandmark68TinyNet: { loadFromUri: () => Promise.resolve() },
};

export function TinyFaceDetectorOptions(options) { Object.assign(this, options); }

export function detectAllFaces() {
  return { withFaceLandmarks: () => Promise.resolve([]) };
}
