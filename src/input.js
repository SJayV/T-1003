import * as faceapi from 'face-api.js';
import { reportGazeDetected, reportMotionEnergy } from './phase.js';


// ──── CONSTANTS ────────────────────────────────────────────────────────────


const ENERGY_SENSITIVITY = 20;
const ENERGY_PIXEL_THRESHOLD = 10;
export const CANVAS_WIDTH = 80;
export const CANVAS_HEIGHT = 60;

const FACE_MODEL_URL = './resources/weights';
const FACE_DETECT_INPUT_SIZE = 224;
const FACE_DETECT_SCORE_THRESHOLD = 0.5;
export const GAZE_DETECT_INTERVAL_FRAMES = 2;
export const GAZE_PERSIST_CYCLES = 2;
const GAZE_CENTER_FRACTION = 0.35;
const GAZE_FRONTAL_THRESHOLD = 0.15;


// ──── INITIALIZATION ───────────────────────────────────────────────────────


let _video = null;
let _context = null;
let _previousPixels = null;
let _ready = false;

let _modelsReady = false;
let _frameCount = 0;
let _detectionInFlight = false;
let _gazePersistCount = 0;
let _lastGazeDetected = false;

function _initializeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  _context = canvas.getContext('2d', { willReadFrequently: true });
}

function _initializeVideoStream() {
  _video = document.createElement('video');
  _video.autoplay = true;
  _video.playsInline = true;
  _video.muted = true;

  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: 'user' } })
    .then(stream => {
      _video.srcObject = stream;
      _video.onloadedmetadata = () => { _video.play(); _ready = true; };
    })
    .catch(error => console.warn('[input] camera unavailable:', error));
}

function _initializeFaceModels() {
  Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACE_MODEL_URL),
  ])
    .then(() => { _modelsReady = true; })
    .catch(error => console.warn('[input] face-api models unavailable:', error));
}


// ──── RAW MOTION ENERGY ────────────────────────────────────────────────────


function _updateContext() {
  _context.save();
  _context.scale(-1, 1);
  _context.drawImage(_video, -CANVAS_WIDTH, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  _context.restore();
}

function _computeDifference(pixels) {
  let difference = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    difference += Math.max(0, Math.abs(pixels[i] - _previousPixels[i]) - ENERGY_PIXEL_THRESHOLD)
                + Math.max(0, Math.abs(pixels[i+1] - _previousPixels[i+1]) - ENERGY_PIXEL_THRESHOLD)
                + Math.max(0, Math.abs(pixels[i+2] - _previousPixels[i+2]) - ENERGY_PIXEL_THRESHOLD);
  }
  return difference;
}

function _computeSpeed(difference) {
  const pixelCount = CANVAS_WIDTH * CANVAS_HEIGHT;
  return Math.min(1, (difference / (pixelCount * 3 * (255 - ENERGY_PIXEL_THRESHOLD))) * ENERGY_SENSITIVITY);
}

function _updateMotionEnergy() {
  _updateContext();

  const pixels = _context.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).data;

  if (_previousPixels) {
    reportMotionEnergy(_computeSpeed(_computeDifference(pixels)));
  }

  _previousPixels = new Uint8ClampedArray(pixels);
}


// ──── GAZE DETECTION ───────────────────────────────────────────────────────


function _gazeDetectionIsNotReady() {
  return !_modelsReady || _detectionInFlight || _frameCount % GAZE_DETECT_INTERVAL_FRAMES !== 0;
}

function _setOptions() {
  return new faceapi.TinyFaceDetectorOptions({
    inputSize: FACE_DETECT_INPUT_SIZE,
    scoreThreshold: FACE_DETECT_SCORE_THRESHOLD,
  });
}

function _updateGazePersistence(gazing) {
  if (gazing) {
    _gazePersistCount++;
    if (_gazePersistCount >= GAZE_PERSIST_CYCLES) _lastGazeDetected = true;
  } else {
    _gazePersistCount = 0;
    _lastGazeDetected = false;
  }
}

function _detectGaze(options) {
  _detectionInFlight = true;

  faceapi.detectAllFaces(_video, options).withFaceLandmarks(true)
    .then(detections => _updateGazePersistence(detections.some(_isGazing)))
    .catch(error => console.warn('[input] face detection failed:', error))
    .finally(() => { _detectionInFlight = false; });
}

function _updateGaze() {
  _frameCount++;
  if (_gazeDetectionIsNotReady()) return;

  _detectGaze(_setOptions());
}


// ──── HELPER FUNCTIONS - GAZE COMPUTATION ──────────────────────────────────


function _isGazing(detection) {
  return _isCentered(detection) && _isFrontal(detection);
}

function _isCentered({ detection }) {
  const { x, y, width, height } = detection.box;
  const videoWidth = _video.videoWidth;
  const videoHeight = _video.videoHeight;
  if (!videoWidth || !videoHeight) return false;

  const centerX = (x + width / 2) / videoWidth;
  const centerY = (y + height / 2) / videoHeight;

  const offsetX = 1 - centerX - 0.5;
  const offsetY = centerY - 0.5;

  return Math.abs(offsetX) < GAZE_CENTER_FRACTION / 2 && Math.abs(offsetY) < GAZE_CENTER_FRACTION / 2;
}

function _isFrontal({ landmarks }) {
  const leftEye = _averagePoint(landmarks.getLeftEye());
  const rightEye = _averagePoint(landmarks.getRightEye());
  const nose = _averagePoint(landmarks.getNose());

  const eyeCenterX = (leftEye.x + rightEye.x) / 2;
  const interEyeDistance = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);
  if (interEyeDistance === 0) return false;

  const frontalOffset = (nose.x - eyeCenterX) / interEyeDistance;
  return Math.abs(frontalOffset) < GAZE_FRONTAL_THRESHOLD;
}

function _averagePoint(points) {
  const sum = points.reduce((accumulator, point) => ({ x: accumulator.x + point.x, y: accumulator.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}


// ──── PUBLIC INTERFACE ─────────────────────────────────────────────────────


function _inputIsNotReady() {
  return !_ready || _video.readyState < 2;
}

export function initializeInput() {
  _initializeCanvas();
  _initializeVideoStream();
  _initializeFaceModels();
}

export function updateInput() {
  if (_inputIsNotReady()) return;

  _updateMotionEnergy();
  _updateGaze();

  if (_lastGazeDetected) reportGazeDetected();
}