/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { CANVAS_WIDTH, CANVAS_HEIGHT, GAZE_DETECT_INTERVAL_FRAMES, GAZE_PERSIST_CYCLES } from '../src/input.js';

const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;

let updateInput;
let mockReportGazeDetected, mockReportMotionEnergy, mockGetImageData;
let mockDetectAllFaces;

function pixels(fill) {
  return { data: new Uint8ClampedArray(CANVAS_WIDTH * CANVAS_HEIGHT * 4).fill(fill) };
}

function faceAt({ centered, frontal }) {
  const box = centered
    ? { x: 280, y: 200, width: 80, height: 80 } // center ≈ (320, 240)
    : { x: 0, y: 200, width: 80, height: 80 }; // center ≈ (40, 240) — near the left edge

  const leftEye = [{ x: 300, y: 230 }];
  const rightEye = [{ x: 340, y: 230 }];
  const nose = frontal ? [{ x: 320, y: 250 }] : [{ x: 340, y: 250 }];

  return {
    detection: { box },
    landmarks: {
      getLeftEye: () => leftEye,
      getRightEye: () => rightEye,
      getNose: () => nose,
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

  const phaseModule = await import('../src/phase.js');
  mockReportGazeDetected = vi.spyOn(phaseModule, 'reportGazeDetected');
  mockReportMotionEnergy = vi.spyOn(phaseModule, 'reportMotionEnergy');

  mockDetectAllFaces = vi.fn().mockReturnValue({ withFaceLandmarks: () => Promise.resolve([]) });
  vi.doMock('face-api.js', async () => {
    const actual = await vi.importActual('face-api.js');
    return { ...actual, detectAllFaces: (...args) => mockDetectAllFaces(...args) };
  });

  mockGetImageData = vi.fn().mockReturnValue(pixels(0));
  const mockContext = {
    save: vi.fn(), scale: vi.fn(), drawImage: vi.fn(), restore: vi.fn(),
    getImageData: mockGetImageData,
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockContext);

  vi.spyOn(HTMLVideoElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(VIDEO_WIDTH);
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(VIDEO_HEIGHT);

  let capturedVideo = null;
  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(tag => {
    const element = originalCreateElement(tag);
    if (tag === 'video') capturedVideo = element;
    return element;
  });

  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockResolvedValue({ id: 'mock-stream' }) },
    configurable: true, writable: true,
  });

  const inputModule = await import('../src/input.js');
  updateInput = inputModule.updateInput;

  inputModule.initializeInput();
  await flush();
  capturedVideo?.onloadedmetadata?.();
});


// ──── UPDATE INPUT ────────────────────────────────────────────────────────


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
    for (let frameIndex = 0; frameIndex < GAZE_DETECT_INTERVAL_FRAMES; frameIndex++) await tick([]);
    expect(mockReportGazeDetected).not.toHaveBeenCalled();
  });

  it('kein reportGazeDetected, wenn das Gesicht zentriert, aber nicht frontal ist (zur Seite blickend)', async () => {
    const face = faceAt({ centered: true, frontal: false });
    for (let cycleIndex = 0; cycleIndex < GAZE_PERSIST_CYCLES + 1; cycleIndex++) {
      for (let frameIndex = 0; frameIndex < GAZE_DETECT_INTERVAL_FRAMES; frameIndex++) await tick([face]);
    }
    expect(mockReportGazeDetected).not.toHaveBeenCalled();
  });

  it('kein reportGazeDetected, wenn das Gesicht frontal, aber am Bildrand ist ("hiding")', async () => {
    const face = faceAt({ centered: false, frontal: true });
    for (let cycleIndex = 0; cycleIndex < GAZE_PERSIST_CYCLES + 1; cycleIndex++) {
      for (let frameIndex = 0; frameIndex < GAZE_DETECT_INTERVAL_FRAMES; frameIndex++) await tick([face]);
    }
    expect(mockReportGazeDetected).not.toHaveBeenCalled();
  });

  it('kein reportGazeDetected vor Ablauf der Persist-Zyklen, auch bei zentriertem, frontalem Gesicht', async () => {
    const face = faceAt({ centered: true, frontal: true });
    for (let frameIndex = 0; frameIndex < GAZE_DETECT_INTERVAL_FRAMES; frameIndex++) await tick([face]);
    expect(mockReportGazeDetected).not.toHaveBeenCalled();
  });

  it('reportGazeDetected nach genügend aufeinanderfolgenden zentrierten, frontalen Erkennungen', async () => {
    const face = faceAt({ centered: true, frontal: true });
    for (let cycleIndex = 0; cycleIndex < GAZE_PERSIST_CYCLES; cycleIndex++) {
      for (let frameIndex = 0; frameIndex < GAZE_DETECT_INTERVAL_FRAMES; frameIndex++) await tick([face]);
    }
    await tick([face]);
    expect(mockReportGazeDetected).toHaveBeenCalled();
  });

  it('Gesichtserkennung wird gedrosselt (nicht jeden Frame aufgerufen)', async () => {
    for (let frameIndex = 0; frameIndex < GAZE_DETECT_INTERVAL_FRAMES; frameIndex++) await tick([]);
    expect(mockDetectAllFaces).toHaveBeenCalledTimes(1);
  });
});
