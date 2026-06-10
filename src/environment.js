import * as THREE from 'three';
import { onPhaseTransition, getMetaballBlend, getClusterBlend, getBurstBlend, getTime } from './phase.js';
import { environmentVert, environmentFrag } from '../shaders/environmentShader.js';
import { makeGpuSetup } from './gpuSetup.js';

const EQUIRECT_W     = 512;
const EQUIRECT_H     = 256;
const REGEN_INTERVAL = 4;

let _renderer       = null;
let _pmremGen       = null;
let _equirectTarget = null;
let _equirectScene  = null;
let _equirectCamera = null;
let _equirectMat    = null;
let _currentPMREM   = null;
let _frameCount     = 0;
let _needsRegen     = true;

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

  _pmremGen = new THREE.PMREMGenerator(renderer);

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

  onPhaseTransition(() => { _needsRegen = true; });
  _needsRegen = true;
}

function _regenerate() {
  _equirectMat.uniforms.time.value          = getTime();
  _equirectMat.uniforms.metaballBlend.value = getMetaballBlend();
  _equirectMat.uniforms.clusterBlend.value  = getClusterBlend();
  _equirectMat.uniforms.burstBlend.value    = getBurstBlend();

  _renderer.setRenderTarget(_equirectTarget);
  _renderer.render(_equirectScene, _equirectCamera);
  _renderer.setRenderTarget(null);

  const old = _currentPMREM;
  _currentPMREM = _pmremGen.fromEquirectangular(_equirectTarget.texture);
  _currentPMREM.texture.anisotropy = _renderer.capabilities.getMaxAnisotropy();
  if (old) old.dispose();
}

export function getUniformDefs() {
  return { envMap: { value: null } };
}

export function applyStateToMaterial(material) {
  _frameCount++;
  if (_needsRegen || _frameCount % REGEN_INTERVAL === 0) {
    _regenerate();
    _needsRegen = false;
  }
  if (_currentPMREM) material.uniforms.envMap.value = _currentPMREM.texture;
}
