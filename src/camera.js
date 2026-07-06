const START_POSITION = [-0.4, -0.2, 3.0];

export function initCamera(camera) {
  camera.position.set(...START_POSITION);
  camera.lookAt(0, 0, 0);
}

export function updateCamera(camera) {}

export function onInput(type, data) {}
