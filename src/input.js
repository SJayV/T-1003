import { reportMotion }           from './phase.js';
import { onInput as cameraInput } from './camera.js';

const INPUT_SPEED_THRESHOLD  = 0.20;
const INPUT_PERSIST_FRAMES   = 2;
const INPUT_SENSITIVITY      = 20;
const INPUT_PIXEL_THRESHOLD  = 10;
const CANVAS_W               = 80;
const CANVAS_H               = 60;

let _video        = null;
let _canvas       = null;
let _ctx          = null;
let _prevPixels   = null;
let _persistCount = 0;
let _ready        = false;

export function initInput() {
  _canvas = document.createElement('canvas');
  _canvas.width  = CANVAS_W;
  _canvas.height = CANVAS_H;
  _ctx = _canvas.getContext('2d', { willReadFrequently: true });

  _video = document.createElement('video');
  _video.autoplay    = true;
  _video.playsInline = true;
  _video.muted       = true;

  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: 'user' } })
    .then(stream => {
      _video.srcObject = stream;
      _video.onloadedmetadata = () => { _video.play(); _ready = true; };
    })
    .catch(err => console.warn('[input] camera unavailable:', err));
}

export function updateInput() {
  if (!_ready || _video.readyState < 2) return;

  // Draw mirrored frame at reduced resolution
  _ctx.save();
  _ctx.scale(-1, 1);
  _ctx.drawImage(_video, -CANVAS_W, 0, CANVAS_W, CANVAS_H);
  _ctx.restore();

  const pixels = _ctx.getImageData(0, 0, CANVAS_W, CANVAS_H).data;

  if (_prevPixels) {
    // Thresholded mean absolute diff — values below INPUT_PIXEL_THRESHOLD per
    // channel are treated as noise and ignored.
    let diff = 0;
    const n = CANVAS_W * CANVAS_H;
    for (let i = 0; i < pixels.length; i += 4) {
      diff += Math.max(0, Math.abs(pixels[i]   - _prevPixels[i])   - INPUT_PIXEL_THRESHOLD)
            + Math.max(0, Math.abs(pixels[i+1] - _prevPixels[i+1]) - INPUT_PIXEL_THRESHOLD)
            + Math.max(0, Math.abs(pixels[i+2] - _prevPixels[i+2]) - INPUT_PIXEL_THRESHOLD);
    }
    // Normalise: max possible thresholded diff per pixel = 3*(255-threshold)
    const speed = Math.min(1, (diff / (n * 3 * (255 - INPUT_PIXEL_THRESHOLD))) * INPUT_SENSITIVITY);

    if (speed > INPUT_SPEED_THRESHOLD) {
      if (++_persistCount >= INPUT_PERSIST_FRAMES) {
        reportMotion(speed);
        cameraInput('presence', { speed });
      }
    } else {
      _persistCount = 0;
      cameraInput('absence', {});
    }
  }

  _prevPixels = new Uint8ClampedArray(pixels);
}
