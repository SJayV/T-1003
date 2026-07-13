import * as THREE from 'three';
import { getWeights, getTime } from './phase.js';
import { environmentVert, environmentFrag } from '../shaders/environmentShader.js';
import { makeGpuSetup } from './gpuSetup.js';

const EQUIRECT_W     = 512;
const EQUIRECT_H     = 256;

let _renderer       = null;
let _equirectTarget = null;
let _equirectScene  = null;
let _equirectCamera = null;
let _equirectMat    = null;

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

export function getUniformDefs() {
  return { envMap: { value: null } };
}

// Regenerated every frame, not throttled -- envMap feeds both the sky background and the
// balls' own metallic reflections (surfaceChunk.js's _envSampleLod), so it has to track
// clusterBlend/metaballBlend/burstBlend just as continuously as the ball's own shape/color do.
// A throttled regen (the previous design: every 4th frame + on phase transitions) left the env
// map stale in between, so it visibly stepped instead of blending during fast transitions.
export function applyStateToMaterial(material) {
  _regenerate();
  material.uniforms.envMap.value = _equirectTarget.texture;
}
