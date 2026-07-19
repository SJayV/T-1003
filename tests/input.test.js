/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';

const CANVAS_W = 80;
const CANVAS_H = 60;
const VIDEO_W  = 640;
const VIDEO_H  = 480;

const GAZE_DETECT_INTERVAL_FRAMES = 2;
const GAZE_PERSIST_CYCLES         = 2;

let updateInput;
let mockReportGazeDetected, mockReportMotionEnergy, mockGetImageData;
let mockDetectAllFaces;
let _gazingResult;

function pixels(fill) {
  return { data: new Uint8ClampedArray(CANVAS_W * CANVAS_H * 4).fill(fill) };
}

function faceAt({ centered, frontal }) {
  const box = centered
    ? { x: 280, y: 200, width: 80, height: 80 }   // center ≈ (320, 240)
    : { x: 0,   y: 200, width: 80, height: 80 };  // center ≈ (40, 240) — near the left edge

  const leftEye  = [{ x: 300, y: 230 }];
  const rightEye = [{ x: 340, y: 230 }];
  const nose     = frontal ? [{ x: 320, y: 250 }] : [{ x: 340, y: 250 }];

  return {
    detection: { box },
    landmarks: {
      getLeftEye:  () => leftEye,
      getRightEye: () => rightEye,
      getNose:     () => nose,
    },
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function tick(faces = []) {
  mockDetectAllFaces.mockReturnValue({ withFaceLandmarks: () => Promise.resolve(faces) });
  updateInput();
  await flush();
}

beforeEach(async () => {
  vi.resetModules();

  mockReportGazeDetected = vi.fn();
  mockReportMotionEnergy = vi.fn();

  vi.doMock('../src/phase.js', () => ({
    reportGazeDetected: mockReportGazeDetected,
    reportMotionEnergy: mockReportMotionEnergy,
  }));

  mockDetectAllFaces = vi.fn().mockReturnValue({ withFaceLandmarks: () => Promise.resolve([]) });
  vi.doMock('face-api.js', () => ({
    nets: {
      tinyFaceDetector:     { loadFromUri: vi.fn().mockResolvedValue(undefined) },
      faceLandmark68TinyNet: { loadFromUri: vi.fn().mockResolvedValue(undefined) },
    },
    TinyFaceDetectorOptions: function TinyFaceDetectorOptions(opts) { Object.assign(this, opts); },
    detectAllFaces: (...args) => mockDetectAllFaces(...args),
  }));

  mockGetImageData = vi.fn().mockReturnValue(pixels(0));
  const mockCtx = {
    save: vi.fn(), scale: vi.fn(), drawImage: vi.fn(), restore: vi.fn(),
    getImageData: mockGetImageData,
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx);

  vi.spyOn(HTMLVideoElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(VIDEO_W);
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(VIDEO_H);

  let capturedVideo = null;
  const origCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(tag => {
    const el = origCreate(tag);
    if (tag === 'video') capturedVideo = el;
    return el;
  });

  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockResolvedValue({ id: 'mock-stream' }) },
    configurable: true, writable: true,
  });

  const m = await import('../src/input.js');
  updateInput = m.updateInput;

  m.initializeInput();
  await flush();
  capturedVideo?.onloadedmetadata?.();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('updateInput: Motion-Energie (frame-differencing, unabhängig von Gaze)', () => {
  it('meldet reportMotionEnergy(0) bei identischen Frames', async () => {
    mockGetImageData.mockReturnValue(pixels(128));
    await tick();
    mockGetImageData.mockReturnValue(pixels(128));
    await tick();
    expect(mockReportMotionEnergy).toHaveBeenCalledWith(0);
  });

  it('meldet einen positiven Wert bei unterschiedlichen Frames', async () => {
    mockGetImageData.mockReturnValue(pixels(0));
    await tick();
    mockGetImageData.mockReturnValue(pixels(255));
    await tick();
    const lastSpeed = mockReportMotionEnergy.mock.calls.at(-1)[0];
    expect(lastSpeed).toBeGreaterThan(0);
    expect(lastSpeed).toBeLessThanOrEqual(1.0);
  });
});

describe('updateInput: Gaze-Erkennung (face-api.js, zentriert + frontal)', () => {
  it('kein reportGazeDetected ohne erkanntes Gesicht', async () => {
    for (let i = 0; i < GAZE_DETECT_INTERVAL_FRAMES; i++) await tick([]);
    expect(mockReportGazeDetected).not.toHaveBeenCalled();
  });

  it('kein reportGazeDetected, wenn das Gesicht zentriert, aber nicht frontal ist (zur Seite blickend)', async () => {
    const face = faceAt({ centered: true, frontal: false });
    for (let cycle = 0; cycle < GAZE_PERSIST_CYCLES + 1; cycle++) {
      for (let i = 0; i < GAZE_DETECT_INTERVAL_FRAMES; i++) await tick([face]);
    }
    expect(mockReportGazeDetected).not.toHaveBeenCalled();
  });

  it('kein reportGazeDetected, wenn das Gesicht frontal, aber am Bildrand ist ("hiding")', async () => {
    const face = faceAt({ centered: false, frontal: true });
    for (let cycle = 0; cycle < GAZE_PERSIST_CYCLES + 1; cycle++) {
      for (let i = 0; i < GAZE_DETECT_INTERVAL_FRAMES; i++) await tick([face]);
    }
    expect(mockReportGazeDetected).not.toHaveBeenCalled();
  });

  it('kein reportGazeDetected vor Ablauf der Persist-Zyklen, auch bei zentriertem, frontalem Gesicht', async () => {
    const face = faceAt({ centered: true, frontal: true });
    for (let i = 0; i < GAZE_DETECT_INTERVAL_FRAMES; i++) await tick([face]);
    expect(mockReportGazeDetected).not.toHaveBeenCalled();
  });

  it('reportGazeDetected nach genügend aufeinanderfolgenden zentrierten, frontalen Erkennungen', async () => {
    const face = faceAt({ centered: true, frontal: true });
    for (let cycle = 0; cycle < GAZE_PERSIST_CYCLES; cycle++) {
      for (let i = 0; i < GAZE_DETECT_INTERVAL_FRAMES; i++) await tick([face]);
    }
    await tick([face]);
    expect(mockReportGazeDetected).toHaveBeenCalled();
  });

  it('Gesichtserkennung wird gedrosselt (nicht jeden Frame aufgerufen)', async () => {
    for (let i = 0; i < GAZE_DETECT_INTERVAL_FRAMES; i++) await tick([]);
    expect(mockDetectAllFaces).toHaveBeenCalledTimes(1);
  });
});
