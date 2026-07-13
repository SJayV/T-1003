import { CAMERA_START_POSITION } from './constants.js';

export function initCamera(camera) {
  camera.position.set(...CAMERA_START_POSITION);
  camera.lookAt(0, 0, 0);
}

export function updateCamera(camera) {}

export function onInput(type, data) {}
