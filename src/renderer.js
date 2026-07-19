import * as THREE from 'three';


// ──── CONSTANTS ───────────────────────────────────────────────────────────────────


const MAX_PIXEL_RATIO = 2;

export const scene = new THREE.Scene();

export const camera = new THREE.Camera();

export const renderer = new THREE.WebGLRenderer({ antialias: true });


// ──── INITIALIZATION ────────────────────────────────────────────────────────────


export function initializeRenderer() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  document.body.appendChild(renderer.domElement);

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}


// ──── PUBLIC INTERFACE ────────────────────────────────────────────────────────────


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
