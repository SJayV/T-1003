import { getWeights, getBumps, getPulse, getMotionSpeed, getTime, getShapeIndex, getStateName } from './phase.js';
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


// ──── STATE ────────────────────────────────────────────────────────────────


let _canvas = null;
let _context = null;
let _visible = false;


// ──── HELPER FUNCTIONS - SETUP ─────────────────────────────────────────────


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


// ──── HELPER FUNCTIONS - DRAWING PRIMITIVES ────────────────────────────────


function _clearOverlay() {
  _context.fillStyle = OVERLAY_BACKGROUND;
  _context.fillRect(0, 0, OVERLAY_WIDTH, OVERLAY_HEIGHT);
  _context.font = OVERLAY_FONT;
  _context.fillStyle = OVERLAY_TEXT_COLOR;
  _context.textBaseline = 'top';
}

function _drawText(text, x, y) {
  _context.fillStyle = OVERLAY_TEXT_COLOR;
  _context.fillText(text, x, y);
}

function _drawHeader(text, y) {
  _drawText(text, OVERLAY_MARGIN, y);
  return y + HEADER_TO_CONTENT_GAP;
}

function _drawBar(x, y, width, height, fraction, color) {
  _context.strokeStyle = OVERLAY_TEXT_COLOR;
  _context.strokeRect(x, y, width, height);
  _context.fillStyle = color;
  _context.fillRect(x, y, width * Math.max(0, Math.min(1, fraction)), height);
}


// ──── HELPER FUNCTIONS - FACE DETECTION PANEL ──────────────────────────────


function _drawVideoFrame(video, y) {
  const width = FACE_PANEL_HEIGHT * (video.videoWidth / video.videoHeight);
  _context.save();
  _context.translate(OVERLAY_MARGIN + width, y);
  _context.scale(-1, 1);
  _context.drawImage(video, 0, 0, width, FACE_PANEL_HEIGHT);
  _context.restore();
  return width;
}

function _videoToPanelScale(video, panelWidth) {
  return { scaleX: panelWidth / video.videoWidth, scaleY: FACE_PANEL_HEIGHT / video.videoHeight };
}

function _drawDetectionBox(detection, video, y, scale) {
  const { x, y: boxY, width, height } = detection.detection.box;
  const mirroredX = video.videoWidth - x - width;
  _context.strokeStyle = BOX_COLOR;
  _context.strokeRect(OVERLAY_MARGIN + mirroredX * scale.scaleX, y + boxY * scale.scaleY, width * scale.scaleX, height * scale.scaleY);
}

function _drawLandmarkPoints(points, video, y, scale) {
  _context.fillStyle = LANDMARK_COLOR;
  for (const point of points) {
    const mirroredX = video.videoWidth - point.x;
    _context.beginPath();
    _context.arc(OVERLAY_MARGIN + mirroredX * scale.scaleX, y + point.y * scale.scaleY, 1.5, 0, Math.PI * 2);
    _context.fill();
  }
}

function _drawDetections(detections, video, panelWidth, y) {
  const scale = _videoToPanelScale(video, panelWidth);
  for (const detection of detections) {
    _drawDetectionBox(detection, video, y, scale);
    _drawLandmarkPoints(detection.landmarks.positions, video, y, scale);
  }
}

function _drawFaceDetectionPanel(startY) {
  const snapshot = getDebugSnapshot();
  const contentY = _drawHeader('FACE DETECTION', startY);

  if (!snapshot.ready || !snapshot.video.videoWidth) {
    _drawText('camera not ready', OVERLAY_MARGIN, contentY);
    return contentY + LABEL_TO_BAR_GAP;
  }

  const panelWidth = _drawVideoFrame(snapshot.video, contentY);
  _drawDetections(snapshot.detections, snapshot.video, panelWidth, contentY);

  const textY = contentY + FACE_PANEL_HEIGHT + LABEL_TO_BAR_GAP;
  _drawText(`gazing: ${snapshot.isGazing}  faces: ${snapshot.detections.length}`, OVERLAY_MARGIN, textY);
  return textY + LABEL_TO_BAR_GAP;
}


// ──── HELPER FUNCTIONS - PHASE PANEL ───────────────────────────────────────


function _drawWeightBar(name, weight, y) {
  _drawText(`${name} ${weight.toFixed(2)}`, OVERLAY_MARGIN, y);
  const barY = y + LABEL_TO_BAR_GAP;
  _drawBar(OVERLAY_MARGIN, barY, OVERLAY_WIDTH - 2 * OVERLAY_MARGIN, PHASE_BAR_HEIGHT, weight, PHASE_COLORS[name]);
  return barY + PHASE_BAR_HEIGHT + BAR_ROW_GAP;
}

function _computeKernelWeight(bump, time) {
  return bump.activated ? Math.exp(-((time - bump.mu) ** 2) / (2 * bump.sigma * bump.sigma)) : 0;
}

function _drawKernelCurve(name, bump, currentTime, plotX, plotY, plotWidth, plotHeight) {
  _context.strokeStyle = PHASE_COLORS[name];
  _context.beginPath();
  for (let sample = 0; sample <= plotWidth; sample++) {
    const time = currentTime - PHASE_KERNEL_WINDOW / 2 + (sample / plotWidth) * PHASE_KERNEL_WINDOW;
    const weight = _computeKernelWeight(bump, time);
    const x = plotX + sample;
    const y = plotY + plotHeight - weight * plotHeight;
    if (sample === 0) _context.moveTo(x, y); else _context.lineTo(x, y);
  }
  _context.stroke();
}

function _drawKernelPlot(bumps, currentTime, y) {
  const plotX = OVERLAY_MARGIN;
  const plotWidth = OVERLAY_WIDTH - 2 * OVERLAY_MARGIN;
  _context.strokeStyle = OVERLAY_TEXT_COLOR;
  _context.strokeRect(plotX, y, plotWidth, PHASE_KERNEL_HEIGHT);

  for (const name of Object.keys(bumps)) {
    _drawKernelCurve(name, bumps[name], currentTime, plotX, y, plotWidth, PHASE_KERNEL_HEIGHT);
  }

  const nowX = plotX + plotWidth / 2;
  _context.strokeStyle = OVERLAY_TEXT_COLOR;
  _context.beginPath();
  _context.moveTo(nowX, y);
  _context.lineTo(nowX, y + PHASE_KERNEL_HEIGHT);
  _context.stroke();

  return y + PHASE_KERNEL_HEIGHT + LABEL_TO_BAR_GAP;
}

function _drawPhasePanel(startY) {
  const weights = getWeights();
  const bumps = getBumps();
  const currentTime = getTime();

  let cursor = _drawHeader('PHASE WEIGHTS', startY);
  cursor = _drawWeightBar('cluster', weights.clusterWeight, cursor);
  cursor = _drawWeightBar('metaball', weights.metaballWeight, cursor);
  cursor = _drawWeightBar('burst', weights.burstWeight, cursor);

  cursor = _drawHeader('PHASE KERNELS (mu / sigma over time)', cursor);
  cursor = _drawKernelPlot(bumps, currentTime, cursor);

  _drawText(`state: ${getStateName()}  shape: ${getShapeIndex()}  t: ${currentTime.toFixed(2)}`, OVERLAY_MARGIN, cursor);
  return cursor + LABEL_TO_BAR_GAP;
}


// ──── HELPER FUNCTIONS - PULSE PANEL ───────────────────────────────────────


function _drawPulsePanel(startY) {
  const pulse = getPulse();
  const fraction = (pulse - 1) / PULSE_DISPLAY_RANGE;

  const barY = _drawHeader(`PULSE ${pulse.toFixed(4)}`, startY);
  _drawBar(OVERLAY_MARGIN, barY, OVERLAY_WIDTH - 2 * OVERLAY_MARGIN, PHASE_BAR_HEIGHT, fraction, PHASE_COLORS.cluster);
  return barY + PHASE_BAR_HEIGHT;
}


// ──── HELPER FUNCTIONS - MOTION PANEL ──────────────────────────────────────


function _drawMotionPanel(startY) {
  const motionSpeed = getMotionSpeed();

  const barY = _drawHeader(`MOTION SPEED ${motionSpeed.toFixed(3)}`, startY);
  _drawBar(OVERLAY_MARGIN, barY, OVERLAY_WIDTH - 2 * OVERLAY_MARGIN, PHASE_BAR_HEIGHT, motionSpeed, OVERLAY_TEXT_COLOR);
  return barY + PHASE_BAR_HEIGHT;
}


// ──── PUBLIC INTERFACE ─────────────────────────────────────────────────────


export function initializeDebug() {
  _initializeOverlayContainer();
  _initializeToggleListener();
}

export function updateDebugOverlay() {
  if (!_visible) return;

  _clearOverlay();
  let cursor = PANEL_START_Y;
  cursor = _drawFaceDetectionPanel(cursor) + PANEL_GAP;
  cursor = _drawPhasePanel(cursor) + PANEL_GAP;
  cursor = _drawPulsePanel(cursor) + PANEL_GAP;
  _drawMotionPanel(cursor);
}