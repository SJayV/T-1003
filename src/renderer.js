import * as THREE from 'three';

const CAMERA_FOV_DEG   = 60;
const CAMERA_NEAR      = 0.1;
const CAMERA_FAR       = 100;
const MAX_PIXEL_RATIO  = 2;

export const scene = new THREE.Scene();

export const camera = new THREE.PerspectiveCamera(
  CAMERA_FOV_DEG,
  window.innerWidth / window.innerHeight,
  CAMERA_NEAR,
  CAMERA_FAR
);

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
document.body.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
