// Input module: system camera → motion detection → FSM + camera reactions.
// Forwards detected motion to phase.js (FSM) and camera.js independently.

import { reportMotion }           from './phase.js';
import { onInput as cameraInput } from './camera.js';

// ── constants ─────────────────────────────────────────────────────────────────

const INPUT_SPEED_THRESHOLD = 0.10;  // min normalized speed to count as motion
const INPUT_PERSIST_FRAMES  = 3;     // consecutive motion frames before reporting

// ── state ─────────────────────────────────────────────────────────────────────

let _persistCount = 0;

// ── public ────────────────────────────────────────────────────────────────────

export function initInput() {
  // TODO: navigator.mediaDevices.getUserMedia({ video: true })
  // TODO: set up MediaPipe Pose / optical flow processor
}

export function updateInput() {
  // TODO: per-frame motion analysis → speed ∈ [0, 1]
  //
  // const speed = _detectMotion();
  // if (speed > INPUT_SPEED_THRESHOLD) {
  //   if (++_persistCount >= INPUT_PERSIST_FRAMES) {
  //     reportMotion(speed);               // → phase FSM
  //     cameraInput('presence', { speed }); // → camera reaction
  //   }
  // } else {
  //   _persistCount = 0;
  //   cameraInput('absence', {});
  // }
}

// Callback for camera.js to receive input events (called from updateInput above).
export function onInput(type, data) {}
