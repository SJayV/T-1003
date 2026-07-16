export const nets = {
  tinyFaceDetector:      { loadFromUri: () => Promise.resolve() },
  faceLandmark68TinyNet: { loadFromUri: () => Promise.resolve() },
};

export function TinyFaceDetectorOptions(opts) { Object.assign(this, opts); }

export function detectAllFaces() {
  return { withFaceLandmarks: () => Promise.resolve([]) };
}
