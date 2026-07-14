import * as THREE from 'three';
import { getWeights, getTime } from './phase.js';
import { environmentVert, environmentFrag } from '../shaders/environmentShader.js';
import { makeGpuSetup } from './gpuSetup.js';

// ──── CONSTANTS ───────────────────────────────────────────────────────────────────


const EQUIRECT_W     = 512;
const EQUIRECT_H     = 256;


// ──── MODULE STATE ────────────────────────────────────────────────────────────────


let _renderer       = null;
let _equirectTarget = null;
let _equirectScene  = null;
let _equirectCamera = null;
let _equirectMat    = null;


// ──── HELPER FUNCTIONS - REGENERATION ────────────────────────────────────────────


function _regenerate() {
  const { clusterWeight, metaballWeight, burstWeight } = getWeights();
  _equirectMat.uniforms.time.value          = getTime();
  _equirectMat.uniforms.metaballBlend.value = metaballWeight;
  _equirectMat.uniforms.clusterBlend.value  = clusterWeight;
  _equirectMat.uniforms.burstBlend.value    = burstWeight;

  _renderer.setRenderTarget(_equirectTarget);
  _renderer.render(_equirectScene, _equirectCamera);
  _renderer.setRenderTarget(null);
}


// ──── PUBLIC INTERFACE ────────────────────────────────────────────────────────────


export function initEnvMap(renderer) {
  _renderer = renderer;

  _equirectTarget = new THREE.WebGLRenderTarget(EQUIRECT_W, EQUIRECT_H, {
    type:        THREE.HalfFloatType,
    format:      THREE.RGBAFormat,
    minFilter:   THREE.LinearFilter,
    magFilter:   THREE.LinearFilter,
    depthBuffer: false,
  });
  _equirectTarget.texture.colorSpace = THREE.LinearSRGBColorSpace;

  _equirectMat = new THREE.ShaderMaterial({
    uniforms: {
      time:          { value: 0.0 },
      resolution:    { value: new THREE.Vector2(EQUIRECT_W, EQUIRECT_H) },
      metaballBlend: { value: 1.0 },
      clusterBlend:  { value: 0.0 },
      burstBlend:    { value: 0.0 },
    },
    vertexShader:   environmentVert,
    fragmentShader: environmentFrag,
    depthTest:  false,
    depthWrite: false,
  });
  ({ scene: _equirectScene, camera: _equirectCamera } = makeGpuSetup(_equirectMat));
}

export function getUniformDefs() {
  return { envMap: { value: null } };
}

export function applyStateToMaterial(material) {
  _regenerate();
  material.uniforms.envMap.value = _equirectTarget.texture;
}
