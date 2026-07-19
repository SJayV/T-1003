import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { getWeights, getTime } from './phase.js';
import { environmentVertex, environmentFragment } from '../shaders/environmentShader.js';
import { makeGpuSetup } from './gpuSetup.js';

export const ENVIRONMENT_MAP_FILES = [
  'neonStudio.hdr',
  'nightSky.hdr',
  'lightStudio.hdr',
  'aquarium.hdr',
];

export const CLUSTER_ENVIRONMENT_MAP_DEFAULT = 'neonStudio.hdr';
export const METABALL_ENVIRONMENT_MAP_DEFAULT = 'neonStudio.hdr';

const EQUIRECT_W = 512;
const EQUIRECT_H = 256;

let _renderer = null;
let _equirectTarget = null;
let _equirectScene = null;
let _equirectCamera = null;
let _equirectMaterial = null;
let _loader = null;

function _regenerate() {
  const { clusterWeight, metaballWeight, burstWeight } = getWeights();
  _equirectMaterial.uniforms.time.value = getTime();
  _equirectMaterial.uniforms.metaballBlend.value = metaballWeight;
  _equirectMaterial.uniforms.clusterBlend.value = clusterWeight;
  _equirectMaterial.uniforms.burstBlend.value = burstWeight;

  _renderer.setRenderTarget(_equirectTarget);
  _renderer.render(_equirectScene, _equirectCamera);
  _renderer.setRenderTarget(null);
}

export function initializeEnvironmentMap(renderer, clusterFilename = CLUSTER_ENVIRONMENT_MAP_DEFAULT, metaballFilename = METABALL_ENVIRONMENT_MAP_DEFAULT) {
  _renderer = renderer;

  _equirectTarget = new THREE.WebGLRenderTarget(EQUIRECT_W, EQUIRECT_H, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });
  _equirectTarget.texture.colorSpace = THREE.LinearSRGBColorSpace;

  _equirectMaterial = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0.0 },
      resolution: { value: new THREE.Vector2(EQUIRECT_W, EQUIRECT_H) },
      metaballBlend: { value: 1.0 },
      clusterBlend: { value: 0.0 },
      burstBlend: { value: 0.0 },
      clusterSourceMap: { value: null },
      metaballSourceMap: { value: null },
    },
    vertexShader: environmentVertex,
    fragmentShader: environmentFragment,
    depthTest: false,
    depthWrite: false,
  });
  ({ scene: _equirectScene, camera: _equirectCamera } = makeGpuSetup(_equirectMaterial));

  _loader = new RGBELoader();
  setClusterEnvironmentMapFile(clusterFilename);
  setMetaballEnvironmentMapFile(metaballFilename);
}

function _loadSourceMap(uniformKey, filename) {
  _equirectMaterial.uniforms[uniformKey].value = _loader.load(
    `resources/environments/${filename}`,
    (texture) => { texture.flipY = true; texture.needsUpdate = true; },
    undefined,
    () => console.warn(`environmentMapFile not found: resources/environments/${filename}`)
  );
}

export function setClusterEnvironmentMapFile(filename) {
  _loadSourceMap('clusterSourceMap', filename);
}

export function setMetaballEnvironmentMapFile(filename) {
  _loadSourceMap('metaballSourceMap', filename);
}

export function getUniformDefinitions() {
  return { envMap: { value: null } };
}

export function applyStateToMaterial(material) {
  _regenerate();
  material.uniforms.envMap.value = _equirectTarget.texture;
}
