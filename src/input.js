// External input device (webcam / motion sensor).
// Calls triggerPhase() / releasePhase() and camera.onInput() directly — no coupling through main.js.

import { triggerPhase, releasePhase, getPhase } from './phase.js';
import { onInput as cameraInput }               from './camera.js';

// ── stub ──────────────────────────────────────────────────────────────────────

export function initInput() {
  // TODO: initialise device (webcam stream, MediaPipe / pose detection, etc.)
  // On detection event: call _onPresence(speed) or _onAbsence()
}

export function updateInput() {
  // TODO: poll sensor state if event-based model is not used
}

// ── internal handlers (called by device callbacks) ────────────────────────────

// speed: normalised motion magnitude [0, 1] — scales burst centrifugal force
function _onPresence(speed) {
  const phase = getPhase();
  if (phase >= 0.5 && phase < 1.0) {
    // Cluster phase: motion triggers Burst; speed scales intensity (1.0–2.0)
    triggerPhase(1.0 + Math.max(0.1, speed));
  }
  cameraInput('presence', { speed });
}

function _onAbsence() {
  releasePhase();
  cameraInput('absence', {});
}
