import * as THREE from 'three';
import { onPhaseTransition } from './phase.js';
import { environmentVert, environmentFrag } from '../shaders/environmentShader.js';

const EQUIRECT_W     = 512;
const EQUIRECT_H     = 256;
const REGEN_INTERVAL = 4;

let rendererRef    = null;
let pmremGenerator = null;
let equirectTarget = null;
let equirectScene  = null;
let equirectCamera = null;
let equirectMat    = null;
let currentPMREM   = null;
let frameCount     = 0;
let needsRegen     = true;

export function initEnvMap(renderer) {
  rendererRef = renderer;

  equirectTarget = new THREE.WebGLRenderTarget(EQUIRECT_W, EQUIRECT_H, {
    type:        THREE.HalfFloatType,
    format:      THREE.RGBAFormat,
    minFilter:   THREE.LinearFilter,
    magFilter:   THREE.LinearFilter,
    depthBuffer: false,
  });
  equirectTarget.texture.colorSpace = THREE.LinearSRGBColorSpace;

  pmremGenerator = new THREE.PMREMGenerator(renderer);

  equirectCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  equirectScene  = new THREE.Scene();
  equirectMat    = new THREE.ShaderMaterial({
    uniforms: {
      phase:      { value: 0.0 },
      time:       { value: 0.0 },
      resolution: { value: new THREE.Vector2(EQUIRECT_W, EQUIRECT_H) },
    },
    vertexShader:   environmentVert,
    fragmentShader: environmentFrag,
    depthTest:  false,
    depthWrite: false,
  });
  equirectScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), equirectMat));

  onPhaseTransition(() => { needsRegen = true; });
  needsRegen = true;
}

function _regenerate(phase, time) {
  equirectMat.uniforms.phase.value = phase;
  equirectMat.uniforms.time.value  = time;

  rendererRef.setRenderTarget(equirectTarget);
  rendererRef.render(equirectScene, equirectCamera);
  rendererRef.setRenderTarget(null);

  const old = currentPMREM;
  currentPMREM = pmremGenerator.fromEquirectangular(equirectTarget.texture);
  if (old) old.dispose();
}

export function getUniformDefs() {
  return { envMap: { value: null } };
}

export function applyStateToMaterial(material, phase, time) {
  frameCount++;
  if (needsRegen || frameCount % REGEN_INTERVAL === 0) {
    _regenerate(phase, time);
    needsRegen = false;
  }
  if (currentPMREM) material.uniforms.envMap.value = currentPMREM.texture;
}
