// Stub — will implement autonomous camera movement and external device input.
// controls is passed so this module can disable/override OrbitControls when needed.

export function initCamera(camera, controls) {}

export function updateCamera(camera, controls, phase, time) {}

// Called by a future input module when the external device detects presence/motion.
export function onInput(type, data) {}
