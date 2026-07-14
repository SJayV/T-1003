/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';

const CANVAS_W             = 80;
const CANVAS_H             = 60;
const INPUT_SPEED_THRESHOLD = 0.20;
const INPUT_PERSIST_FRAMES  = 2;
const INPUT_PIXEL_THRESHOLD = 10;
const INPUT_SENSITIVITY     = 20;

let updateInput;
let mockReportMotion, mockCameraInput, mockGetImageData;

function pixels(fill) {
  return { data: new Uint8ClampedArray(CANVAS_W * CANVAS_H * 4).fill(fill) };
}

function pixelsForSpeed(targetSpeed) {
  const perPixel = Math.floor(
    (targetSpeed * (255 - INPUT_PIXEL_THRESHOLD) * 3) / INPUT_SENSITIVITY
  );
  const delta = Math.ceil(perPixel / 3) + INPUT_PIXEL_THRESHOLD + 1;
  return { data: new Uint8ClampedArray(CANVAS_W * CANVAS_H * 4).fill(delta) };
}

beforeEach(async () => {
  vi.resetModules();

  mockReportMotion = vi.fn();
  mockCameraInput  = vi.fn();

  vi.doMock('../src/phase.js', () => ({ reportMotion: mockReportMotion }));
  vi.doMock('../src/camera.js', () => ({ onInput: mockCameraInput }));

  mockGetImageData = vi.fn().mockReturnValue(pixels(0));
  const mockCtx = {
    save: vi.fn(), scale: vi.fn(), drawImage: vi.fn(), restore: vi.fn(),
    getImageData: mockGetImageData,
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx);

  vi.spyOn(HTMLVideoElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);

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

  m.initInput();
  await Promise.resolve();
  capturedVideo?.onloadedmetadata?.();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('updateInput: kein Signal bei identischen Frames', () => {
  it('kein reportMotion, "absence" an cameraInput bei identischen Frames', () => {
    mockGetImageData.mockReturnValue(pixels(128));
    updateInput();
    mockGetImageData.mockReturnValue(pixels(128));
    updateInput();
    expect(mockReportMotion).not.toHaveBeenCalled();
    expect(mockCameraInput).toHaveBeenCalledWith('absence', {});
  });
});

describe('updateInput: Persist-Zähler', () => {
  it('kein reportMotion nach erster Erkennung (persistCount = 1 < 2)', () => {
    mockGetImageData.mockReturnValue(pixels(0));
    updateInput();
    mockGetImageData.mockReturnValue(pixels(255));
    updateInput();
    expect(mockReportMotion).not.toHaveBeenCalled();
  });

  it('reportMotion nach zweiter aufeinanderfolgender Erkennung (persistCount = 2)', () => {
    mockGetImageData.mockReturnValue(pixels(0));
    updateInput();
    mockGetImageData.mockReturnValue(pixels(255));
    updateInput();
    mockGetImageData.mockReturnValue(pixels(0));
    updateInput();
    expect(mockReportMotion).toHaveBeenCalledTimes(1);
  });
});

describe('updateInput: Speed-Schwellwert (INPUT_SPEED_THRESHOLD)', () => {
  it('kein reportMotion, "absence" bei Bewegung unterhalb des Schwellwerts', () => {
    mockGetImageData.mockReturnValue(pixels(0));
    updateInput();
    mockGetImageData.mockReturnValue(pixels(11));
    updateInput();
    expect(mockReportMotion).not.toHaveBeenCalled();
    expect(mockCameraInput).toHaveBeenCalledWith('absence', {});
  });
});

describe('updateInput: Speed-Bereich', () => {
  it('gemeldeter Speed liegt im Bereich (0, 1]', () => {
    mockGetImageData.mockReturnValue(pixels(0));
    updateInput();
    mockGetImageData.mockReturnValue(pixels(255));
    updateInput();
    mockGetImageData.mockReturnValue(pixels(0));
    updateInput();
    expect(mockReportMotion).toHaveBeenCalledTimes(1);
    const speed = mockReportMotion.mock.calls[0][0];
    expect(speed).toBeGreaterThan(0);
    expect(speed).toBeLessThanOrEqual(1.0);
  });
});
