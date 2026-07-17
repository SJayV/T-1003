import * as faceapi                       from 'face-api.js';
import { reportGazeDetected, reportMotionEnergy } from './phase.js';

// ──── CONSTANTS ───────────────────────────────────────────────────────────────────


const ENERGY_SENSITIVITY     = 20;
const ENERGY_PIXEL_THRESHOLD = 10;
const CANVAS_W                = 80;
const CANVAS_H                = 60;

const FACE_MODEL_URL           = './resources/weights';
const FACE_DETECT_INPUT_SIZE   = 224;
const FACE_DETECT_SCORE_THRESHOLD = 0.5;
const GAZE_DETECT_INTERVAL_FRAMES = 4;   
const GAZE_PERSIST_CYCLES      = 2;
const GAZE_CENTER_FRACTION     = 0.30;
const GAZE_FRONTAL_THRESHOLD   = 0.15;


// ──── INITIALIZATION ────────────────────────────────────────────────────────────────


let _video        = null;
let _canvas       = null;
let _ctx          = null;
let _prevPixels   = null;
let _ready        = false;

let _modelsReady        = false;
let _frameCount          = 0;
let _detectionInFlight   = false;
let _gazePersistCount    = 0;
let _lastGazeDetected    = false;


// ──── PUBLIC INTERFACE ────────────────────────────────────────────────────────────


export function initializeInput() {
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

  Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACE_MODEL_URL),
  ])
    .then(() => { _modelsReady = true; })
    .catch(err => console.warn('[input] face-api models unavailable:', err));
}

export function updateInput() {
  if (!_ready || _video.readyState < 2) return;

  _updateMotionEnergy();
  _updateGaze();

  if (_lastGazeDetected) reportGazeDetected();
}


// ──── RAW MOTION ENERGY ─────────────────────────────────────


function _updateMotionEnergy() {
  _ctx.save();
  _ctx.scale(-1, 1);
  _ctx.drawImage(_video, -CANVAS_W, 0, CANVAS_W, CANVAS_H);
  _ctx.restore();

  const pixels = _ctx.getImageData(0, 0, CANVAS_W, CANVAS_H).data;

  if (_prevPixels) {
    let diff = 0;
    const n = CANVAS_W * CANVAS_H;
    for (let i = 0; i < pixels.length; i += 4) {
      diff += Math.max(0, Math.abs(pixels[i]   - _prevPixels[i])   - ENERGY_PIXEL_THRESHOLD)
            + Math.max(0, Math.abs(pixels[i+1] - _prevPixels[i+1]) - ENERGY_PIXEL_THRESHOLD)
            + Math.max(0, Math.abs(pixels[i+2] - _prevPixels[i+2]) - ENERGY_PIXEL_THRESHOLD);
    }
    const speed = Math.min(1, (diff / (n * 3 * (255 - ENERGY_PIXEL_THRESHOLD))) * ENERGY_SENSITIVITY);
    reportMotionEnergy(speed);
  }

  _prevPixels = new Uint8ClampedArray(pixels);
}


// ──── GAZE DETECTION ────────────────────────────────────


function _updateGaze() {
  _frameCount++;
  if (!_modelsReady || _detectionInFlight || _frameCount % GAZE_DETECT_INTERVAL_FRAMES !== 0) return;

  _detectionInFlight = true;
  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: FACE_DETECT_INPUT_SIZE,
    scoreThreshold: FACE_DETECT_SCORE_THRESHOLD,
  });

  faceapi.detectAllFaces(_video, options).withFaceLandmarks(true)
    .then(detections => {
      const gazing = detections.some(_isGazing);

      if (gazing) {
        _gazePersistCount++;
        if (_gazePersistCount >= GAZE_PERSIST_CYCLES) _lastGazeDetected = true;
      } else {
        _gazePersistCount = 0;
        _lastGazeDetected = false;
      }
    })
    .catch(err => console.warn('[input] face detection failed:', err))
    .finally(() => { _detectionInFlight = false; });
}

function _isGazing(detection) {
  return _isCentered(detection) && _isFrontal(detection);
}

function _isCentered({ detection }) {
  const { x, y, width, height } = detection.box;
  const videoW = _video.videoWidth;
  const videoH = _video.videoHeight;
  if (!videoW || !videoH) return false;

  const cx = (x + width  / 2) / videoW;
  const cy = (y + height / 2) / videoH;

  const nx = 1 - cx - 0.5;
  const ny = cy - 0.5;

  return Math.abs(nx) < GAZE_CENTER_FRACTION / 2 && Math.abs(ny) < GAZE_CENTER_FRACTION / 2;
}

function _isFrontal({ landmarks }) {
  const leftEye  = _averagePoint(landmarks.getLeftEye());
  const rightEye = _averagePoint(landmarks.getRightEye());
  const nose     = _averagePoint(landmarks.getNose());

  const eyeMidX     = (leftEye.x + rightEye.x) / 2;
  const interEyeDist = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);
  if (interEyeDist === 0) return false;

  const frontalOffset = (nose.x - eyeMidX) / interEyeDist;
  return Math.abs(frontalOffset) < GAZE_FRONTAL_THRESHOLD;
}

function _averagePoint(points) {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}
