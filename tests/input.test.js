/**
 * @vitest-environment jsdom
 *
 * Testet die Bewegungserfassungslogik in input.js mit Mock-Objekten statt
 * echter Kamera. Eine Mock-Canvas liefert steuerbare Pixeldaten; reportMotion
 * und cameraInput werden über vi.doMock abgefangen.
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';

// Interne Konstanten aus input.js (nicht exportiert — hier gespiegelt).
const CANVAS_W             = 80;
const CANVAS_H             = 60;
const INPUT_SPEED_THRESHOLD = 0.20;
const INPUT_PERSIST_FRAMES  = 2;
const INPUT_PIXEL_THRESHOLD = 10;
const INPUT_SENSITIVITY     = 20;

let updateInput;
let mockReportMotion, mockCameraInput, mockGetImageData;

// Erzeugt flache Pixeldaten (RGBA) mit einheitlichem Füllwert.
function pixels(fill) {
  return { data: new Uint8ClampedArray(CANVAS_W * CANVAS_H * 4).fill(fill) };
}

// Erzeugt Pixeldaten, bei denen der Diff zwischen zwei Frames genau `speed` ergibt.
// speed = min(1, (diff / (n * 3 * (255 - threshold))) * sensitivity)
// → diff_per_pixel = speed * (255 - threshold) * 3 / sensitivity
// Wir geben Frame A = 0 und Frame B = floor(diff_per_pixel) zurück.
function pixelsForSpeed(targetSpeed) {
  const perPixel = Math.floor(
    (targetSpeed * (255 - INPUT_PIXEL_THRESHOLD) * 3) / INPUT_SENSITIVITY
  );
  // Wir verteilen perPixel gleichmäßig auf R, G, B (je perPixel/3 ≥ threshold+1).
  const delta = Math.ceil(perPixel / 3) + INPUT_PIXEL_THRESHOLD + 1;
  return { data: new Uint8ClampedArray(CANVAS_W * CANVAS_H * 4).fill(delta) };
}

beforeEach(async () => {
  vi.resetModules();

  mockReportMotion = vi.fn();
  mockCameraInput  = vi.fn();

  vi.doMock('../src/phase.js', () => ({ reportMotion: mockReportMotion }));
  vi.doMock('../src/camera.js', () => ({ onInput: mockCameraInput }));

  // Canvas-Kontext-Mock mit steuerbaren Pixeldaten
  mockGetImageData = vi.fn().mockReturnValue(pixels(0));
  const mockCtx = {
    save: vi.fn(), scale: vi.fn(), drawImage: vi.fn(), restore: vi.fn(),
    getImageData: mockGetImageData,
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx);

  // Video-Element: play() und readyState mocken
  vi.spyOn(HTMLVideoElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);

  // Video-Element beim Erstellen abfangen, um onloadedmetadata manuell zu feuern
  let capturedVideo = null;
  const origCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(tag => {
    const el = origCreate(tag);
    if (tag === 'video') capturedVideo = el;
    return el;
  });

  // getUserMedia sofort auflösen
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockResolvedValue({ id: 'mock-stream' }) },
    configurable: true, writable: true,
  });

  const m = await import('../src/input.js');
  updateInput = m.updateInput;

  // Kamera initialisieren und _ready = true setzen
  m.initInput();
  await Promise.resolve(); // .then() mit getUserMedia-Ergebnis ausführen
  capturedVideo?.onloadedmetadata?.(); // _ready = true, _video.play() abgerufen
});

// ─────────────────────────────────────────────────────────────────────────────

describe('updateInput: kein Signal bei identischen Frames', () => {
  it('kein reportMotion, "absence" an cameraInput bei identischen Frames', () => {
    mockGetImageData.mockReturnValue(pixels(128));
    updateInput(); // prevPixels = null → speichert ersten Frame
    mockGetImageData.mockReturnValue(pixels(128));
    updateInput(); // diff = 0 → kein reportMotion, "absence"
    expect(mockReportMotion).not.toHaveBeenCalled();
    expect(mockCameraInput).toHaveBeenCalledWith('absence', {});
  });
});

describe('updateInput: Persist-Zähler', () => {
  // Erst nach INPUT_PERSIST_FRAMES (=2) aufeinanderfolgenden Erkennungen
  // wird reportMotion aufgerufen.
  // Abwechselnde Frames (0↔255) erzeugen dauerhaft einen großen Diff.

  it('kein reportMotion nach erster Erkennung (persistCount = 1 < 2)', () => {
    mockGetImageData.mockReturnValue(pixels(0));
    updateInput(); // Frame gespeichert, kein Diff
    mockGetImageData.mockReturnValue(pixels(255));
    updateInput(); // persistCount = 1 < 2 → kein reportMotion
    expect(mockReportMotion).not.toHaveBeenCalled();
  });

  it('reportMotion nach zweiter aufeinanderfolgender Erkennung (persistCount = 2)', () => {
    mockGetImageData.mockReturnValue(pixels(0));
    updateInput(); // Frame gespeichert
    mockGetImageData.mockReturnValue(pixels(255));
    updateInput(); // persistCount = 1
    mockGetImageData.mockReturnValue(pixels(0));
    updateInput(); // persistCount = 2 ≥ INPUT_PERSIST_FRAMES → reportMotion
    expect(mockReportMotion).toHaveBeenCalledTimes(1);
  });
});

describe('updateInput: Speed-Schwellwert (INPUT_SPEED_THRESHOLD)', () => {
  // Pixel-Diff knapp über dem Rauschen (11 vs. 0) → thresholded diff = 1/Kanal
  // → speed ≈ 0.08 < INPUT_SPEED_THRESHOLD (0.20) → kein reportMotion.

  it('kein reportMotion, "absence" bei Bewegung unterhalb des Schwellwerts', () => {
    mockGetImageData.mockReturnValue(pixels(0));
    updateInput();
    mockGetImageData.mockReturnValue(pixels(11)); // speed ≈ 0.08 < 0.20
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
    updateInput(); // persistCount = 1
    mockGetImageData.mockReturnValue(pixels(0));
    updateInput(); // persistCount = 2 → reportMotion
    expect(mockReportMotion).toHaveBeenCalledTimes(1);
    const speed = mockReportMotion.mock.calls[0][0];
    expect(speed).toBeGreaterThan(0);
    expect(speed).toBeLessThanOrEqual(1.0);
  });
});
