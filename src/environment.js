import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { getWeights, getTime } from './phase.js';
import { environmentVert, environmentFrag } from '../shaders/environmentShader.js';
import { makeGpuSetup } from './gpuSetup.js';

export const ENV_MAP_FILES = [
  'neonStudio.hdr',
  'nightSky.hdr',
  'lightStudio.hdr',
  'aquarium.hdr',
];

export const CLUSTER_ENV_MAP_DEFAULT  = 'neonStudio.hdr';
export const METABALL_ENV_MAP_DEFAULT = 'neonStudio.hdr';

const EQUIRECT_W = 512;
const EQUIRECT_H = 256;

let _renderer       = null;
let _equirectTarget = null;
let _equirectScene  = null;
let _equirectCamera = null;
let _equirectMat    = null;
let _loader         = null;

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

export function initializeEnvMap(renderer, clusterFilename = CLUSTER_ENV_MAP_DEFAULT, metaballFilename = METABALL_ENV_MAP_DEFAULT) {
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
      time:              { value: 0.0 },
      resolution:        { value: new THREE.Vector2(EQUIRECT_W, EQUIRECT_H) },
      metaballBlend:     { value: 1.0 },
      clusterBlend:      { value: 0.0 },
      burstBlend:        { value: 0.0 },
      clusterSourceMap:  { value: null },
      metaballSourceMap: { value: null },
    },
    vertexShader:   environmentVert,
    fragmentShader: environmentFrag,
    depthTest:  false,
    depthWrite: false,
  });
  ({ scene: _equirectScene, camera: _equirectCamera } = makeGpuSetup(_equirectMat));

  _loader = new RGBELoader();
  setClusterEnvMapFile(clusterFilename);
  setMetaballEnvMapFile(metaballFilename);
}

function _loadSourceMap(uniformKey, filename) {
  _equirectMat.uniforms[uniformKey].value = _loader.load(
    `resources/${filename}`,
    (texture) => { texture.flipY = true; texture.needsUpdate = true; },
    undefined,
    () => console.warn(`envMapFile not found: resources/${filename}`)
  );
}

export function setClusterEnvMapFile(filename) {
  _loadSourceMap('clusterSourceMap', filename);
}

export function setMetaballEnvMapFile(filename) {
  _loadSourceMap('metaballSourceMap', filename);
}

export function getUniformDefs() {
  return { envMap: { value: null } };
}

export function applyStateToMaterial(material) {
  _regenerate();
  material.uniforms.envMap.value = _equirectTarget.texture;
}
