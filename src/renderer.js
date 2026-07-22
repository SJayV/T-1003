import * as THREE from 'three';


// ──── CONSTANTS ────────────────────────────────────────────────────────────


const MAXIMUM_PIXEL_RATIO = 2;
const CAMERA_START_POSITION = [0.0, 0.0, 5.0];

export const scene = new THREE.Scene();

export const camera = new THREE.Camera();

export const renderer = new THREE.WebGLRenderer({ antialias: true });


// ──── INITIALIZATION ───────────────────────────────────────────────────────


function _initializeCameraPosition() {
  camera.position.set(...CAMERA_START_POSITION);
}

function _initializeRenderer() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAXIMUM_PIXEL_RATIO));
  document.body.appendChild(renderer.domElement);

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

export function initializeRendering() {
  _initializeCameraPosition();
  _initializeRenderer();
}


// ──── PUBLIC INTERFACE ─────────────────────────────────────────────────────


export function applyMeshToScene(mesh) {
  scene.add(mesh);
}

export function getUniformDefinitions() {
  return {
    cameraWorldPosition: { value: new THREE.Vector3() },
    resolution: { value: new THREE.Vector2() },
  };
}

export function applyStateToMaterial(material) {
  material.uniforms.cameraWorldPosition.value.copy(camera.position);
  material.uniforms.resolution.value.set(renderer.domElement.width, renderer.domElement.height);
}