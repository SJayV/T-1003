import { getWeights, getBumps, getPulse, getMotionSpeed, getTime, getShapeIndex, getStateName, computeBumpWeight } from './phase.js';
import { getDebugSnapshot } from './input.js';


// ──── CONSTANTS ────────────────────────────────────────────────────────────


const TOGGLE_KEY = 'Tab';

const OVERLAY_WIDTH = 340;
const OVERLAY_HEIGHT = 700;
const OVERLAY_MARGIN = 12;
const OVERLAY_BACKGROUND = 'rgba(10, 10, 10, 0.82)';
const OVERLAY_TEXT_COLOR = '#e8e8e8';
const OVERLAY_FONT = '12px monospace';

const PHASE_COLORS = { cluster: '#5ac8fa', metaball: '#ffb74d', burst: '#ff4d4d' };
const LANDMARK_COLOR = '#8bff8b';
const BOX_COLOR = '#8bff8b';

const PANEL_START_Y = 32;
const PANEL_GAP = 24;
const HEADER_TO_CONTENT_GAP = 16;
const LABEL_TO_BAR_GAP = 12;
const BAR_ROW_GAP = 16;

const FACE_PANEL_HEIGHT = 180;

const PHASE_BAR_HEIGHT = 14;
const PHASE_KERNEL_HEIGHT = 90;
const PHASE_KERNEL_WINDOW = 6.0;

const PULSE_DISPLAY_RANGE = 0.05;


// ──── INITIALIZATION ────────────────────────────────────────────────────────


let _canvas = null;
let _context = null;
let _visible = false;

function _initializeOverlayContainer() {
  _canvas = document.createElement('canvas');
  _canvas.width = OVERLAY_WIDTH;
  _canvas.height = OVERLAY_HEIGHT;
  _canvas.style.position = 'fixed';
  _canvas.style.top = '0';
  _canvas.style.left = '0';
  _canvas.style.zIndex = '1000';
  _canvas.style.pointerEvents = 'none';
  _canvas.style.display = 'none';
  _context = _canvas.getContext('2d');
  document.body.appendChild(_canvas);
}

function _initializeToggleListener() {
  window.addEventListener('keydown', event => {
    if (event.key !== TOGGLE_KEY) return;
    event.preventDefault();
    _visible = !_visible;
    _canvas.style.display = _visible ? 'block' : 'none';
  });
}

export function initializeDebug() {
  _initializeOverlayContainer();
  _initializeToggleListener();
}


// ──── HELPER FUNCTIONS - DRAWING PRIMITIVES ────────────────────────────────


function _withStroke(color, draw) {
  _context.strokeStyle = color;
  draw();
}

function _withFill(color, draw) {
  _context.fillStyle = color;
  draw();
}

function _clearOverlay() {
  _withFill(OVERLAY_BACKGROUND, () => _context.fillRect(0, 0, OVERLAY_WIDTH, OVERLAY_HEIGHT));
  _context.font = OVERLAY_FONT;
  _context.fillStyle = OVERLAY_TEXT_COLOR;
  _context.textBaseline = 'top';
}

function _drawText(text, x, y) {
  _withFill(OVERLAY_TEXT_COLOR, () => _context.fillText(text, x, y));
}

function _drawLabel(text, y, gap) {
  _drawText(text, OVERLAY_MARGIN, y);
  return y + gap;
}

function _drawHeader(text, y) {
  return _drawLabel(text, y, HEADER_TO_CONTENT_GAP);
}

function _drawBar(x, y, width, height, fraction, color) {
  _withStroke(OVERLAY_TEXT_COLOR, () => _context.strokeRect(x, y, width, height));
  _withFill(color, () => _context.fillRect(x, y, width * Math.max(0, Math.min(1, fraction)), height));
}

function _drawLabeledBar(label, fraction, color, y, labelGap = HEADER_TO_CONTENT_GAP, trailingGap = 0) {
  const barY = _drawLabel(label, y, labelGap);
  _drawBar(OVERLAY_MARGIN, barY, OVERLAY_WIDTH - 2 * OVERLAY_MARGIN, PHASE_BAR_HEIGHT, fraction, color);
  return barY + PHASE_BAR_HEIGHT + trailingGap;
}

function _strokePath(color, buildPath) {
  _withStroke(color, () => {
    _context.beginPath();
    buildPath();
    _context.stroke();
  });
}


// ──── HELPER FUNCTIONS - FACE DETECTION PANEL ──────────────────────────────


function _computeVideoScale(video) {
  const scale = FACE_PANEL_HEIGHT / video.videoHeight;
  return { scaleX: scale, scaleY: scale };
}

function _drawVideoFrame(video, y, scale) {
  const width = video.videoWidth * scale.scaleX;
  _context.save();
  _context.translate(OVERLAY_MARGIN + width, y);
  _context.scale(-1, 1);
  _context.drawImage(video, 0, 0, width, FACE_PANEL_HEIGHT);
  _context.restore();
}

function _drawDetectionBox(detection, video, y, scale) {
  const { x, y: boxY, width, height } = detection.detection.box;
  const mirroredX = video.videoWidth - x - width;
  _withStroke(BOX_COLOR, () => {
    _context.strokeRect(OVERLAY_MARGIN + mirroredX * scale.scaleX, y + boxY * scale.scaleY, width * scale.scaleX, height * scale.scaleY);
  });
}

function _drawLandmarkPoints(points, video, y, scale) {
  _withFill(LANDMARK_COLOR, () => {
    for (const point of points) {
      const mirroredX = video.videoWidth - point.x;
      _context.beginPath();
      _context.arc(OVERLAY_MARGIN + mirroredX * scale.scaleX, y + point.y * scale.scaleY, 1.5, 0, Math.PI * 2);
      _context.fill();
    }
  });
}

function _drawDetections(detections, video, y, scale) {
  for (const detection of detections) {
    _drawDetectionBox(detection, video, y, scale);
    _drawLandmarkPoints(detection.landmarks.positions, video, y, scale);
  }
}

function _cameraIsNotReady(snapshot) {
  return !snapshot.ready || !snapshot.video.videoWidth;
}

function _drawCameraNotReady(contentY) {
  _drawText('camera not ready', OVERLAY_MARGIN, contentY);
  return contentY + LABEL_TO_BAR_GAP;
}

function _drawFaceDetectionPanel(startY) {
  const snapshot = getDebugSnapshot();
  const contentY = _drawHeader('FACE DETECTION', startY);

  if (_cameraIsNotReady(snapshot)) return _drawCameraNotReady(contentY);

  const scale = _computeVideoScale(snapshot.video);
  _drawVideoFrame(snapshot.video, contentY, scale);
  _drawDetections(snapshot.detections, snapshot.video, contentY, scale);

  return _drawLabel(`gazing: ${snapshot.isGazing}  faces: ${snapshot.detections.length}`, contentY + FACE_PANEL_HEIGHT, LABEL_TO_BAR_GAP);
}


// ──── HELPER FUNCTIONS - PHASE PANEL ───────────────────────────────────────


function _drawKernelCurve(name, bump, currentTime, plotX, plotY, plotWidth, plotHeight) {
  _strokePath(PHASE_COLORS[name], () => {
    for (let sample = 0; sample <= plotWidth; sample++) {
      const time = currentTime - PHASE_KERNEL_WINDOW / 2 + (sample / plotWidth) * PHASE_KERNEL_WINDOW;
      const weight = computeBumpWeight(bump, time);
      const x = plotX + sample;
      const y = plotY + plotHeight - weight * plotHeight;
      if (sample === 0) _context.moveTo(x, y); else _context.lineTo(x, y);
    }
  });
}

function _drawKernelCurves(bumps, currentTime, x, y, width, height) {
  for (const name of Object.keys(bumps)) {
    _drawKernelCurve(name, bumps[name], currentTime, x, y, width, height);
  }
}

function _drawPlotFrame(x, y, width, height) {
  _withStroke(OVERLAY_TEXT_COLOR, () => _context.strokeRect(x, y, width, height));

  const nowX = x + width / 2;
  _strokePath(OVERLAY_TEXT_COLOR, () => {
    _context.moveTo(nowX, y);
    _context.lineTo(nowX, y + height);
  });
}

function _drawKernelPlot(bumps, currentTime, y) {
  const plotWidth = OVERLAY_WIDTH - 2 * OVERLAY_MARGIN;
  _drawPlotFrame(OVERLAY_MARGIN, y, plotWidth, PHASE_KERNEL_HEIGHT);
  _drawKernelCurves(bumps, currentTime, OVERLAY_MARGIN, y, plotWidth, PHASE_KERNEL_HEIGHT);
  return y + PHASE_KERNEL_HEIGHT + LABEL_TO_BAR_GAP;
}

function _drawPhasePanel(startY) {
  const weights = getWeights();
  const currentTime = getTime();

  let cursor = _drawHeader('PHASE WEIGHTS', startY);
  cursor = _drawLabeledBar(`cluster ${weights.clusterWeight.toFixed(2)}`, weights.clusterWeight, PHASE_COLORS.cluster, cursor, LABEL_TO_BAR_GAP, BAR_ROW_GAP);
  cursor = _drawLabeledBar(`metaball ${weights.metaballWeight.toFixed(2)}`, weights.metaballWeight, PHASE_COLORS.metaball, cursor, LABEL_TO_BAR_GAP, BAR_ROW_GAP);
  cursor = _drawLabeledBar(`burst ${weights.burstWeight.toFixed(2)}`, weights.burstWeight, PHASE_COLORS.burst, cursor, LABEL_TO_BAR_GAP, BAR_ROW_GAP);

  cursor = _drawHeader('GAUSSIAN PHASE KERNELS', cursor);
  cursor = _drawKernelPlot(getBumps(), currentTime, cursor);

  _drawText(`state: ${getStateName()}  shape: ${getShapeIndex()}  t: ${currentTime.toFixed(2)}`, OVERLAY_MARGIN, cursor);
  return cursor + LABEL_TO_BAR_GAP;
}


// ──── HELPER FUNCTIONS - PULSE PANEL ───────────────────────────────────────


function _drawPulsePanel(startY) {
  const pulse = getPulse();
  const fraction = (pulse - 1) / PULSE_DISPLAY_RANGE;

  return _drawLabeledBar(`PULSE ${pulse.toFixed(4)}`, fraction, PHASE_COLORS.cluster, startY);
}


// ──── HELPER FUNCTIONS - MOTION PANEL ──────────────────────────────────────


function _drawMotionPanel(startY) {
  const motionSpeed = getMotionSpeed();

  return _drawLabeledBar(`MOTION SPEED ${motionSpeed.toFixed(3)}`, motionSpeed, OVERLAY_TEXT_COLOR, startY);
}


// ──── PUBLIC INTERFACE ─────────────────────────────────────────────────────


export function updateDebugOverlay() {
  if (!_visible) return;

  _clearOverlay();
  let cursor = PANEL_START_Y;
  cursor = _drawFaceDetectionPanel(cursor) + PANEL_GAP;
  cursor = _drawPhasePanel(cursor) + PANEL_GAP;
  cursor = _drawPulsePanel(cursor) + PANEL_GAP;
  _drawMotionPanel(cursor);
}