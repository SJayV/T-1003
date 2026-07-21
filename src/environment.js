import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { getWeights, getTime } from './phase.js';
import { environmentVertex, environmentFragment } from '../shaders/environmentShader.js';
import { makeGpuSetup } from './gpuSetup.js';


// ──── CONSTANTS ───────────────────────────────────────────────────────────────────


const CLUSTER_ENVIRONMENT_MAP_DEFAULT = 'neonStudio.hdr';
const METABALL_ENVIRONMENT_MAP_DEFAULT = 'neonStudio.hdr';

const EQUIRECTANGULAR_HEIGHT = 256;
const EQUIRECTANGULAR_WIDTH = EQUIRECTANGULAR_HEIGHT * 2;


// ──── INITIALIZATION ────────────────────────────────────────────────────────────────


let _renderer = null;
let _equirectangularTarget = null;
let _equirectangularScene = null;
let _equirectangularCamera = null;
let _equirectangularMaterial = null;
let _loader = null;

function _initializeEquirectangularTarget() {
  const target = new THREE.WebGLRenderTarget(EQUIRECTANGULAR_WIDTH, EQUIRECTANGULAR_HEIGHT, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });
  target.texture.colorSpace = THREE.LinearSRGBColorSpace;
  return target;
}

function _initializeEquirectangularMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0.0 },
      resolution: { value: new THREE.Vector2(EQUIRECTANGULAR_WIDTH, EQUIRECTANGULAR_HEIGHT) },
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
}

export function initializeEnvironmentMap(renderer, clusterFilename = CLUSTER_ENVIRONMENT_MAP_DEFAULT, metaballFilename = METABALL_ENVIRONMENT_MAP_DEFAULT) {
  _renderer = renderer;
  _equirectangularTarget = _initializeEquirectangularTarget();
  _equirectangularMaterial = _initializeEquirectangularMaterial();
  ({ scene: _equirectangularScene, camera: _equirectangularCamera } = makeGpuSetup(_equirectangularMaterial));

  _loader = new RGBELoader();
  _applyEnvironmentMapFiles(clusterFilename, metaballFilename);
}


// ──── ENVIRONMENT MAP LOADING ───────────────────────────────────────────────────────


function _loadSourceMap(uniformKey, filename) {
  _equirectangularMaterial.uniforms[uniformKey].value = _loader.load(
    `resources/environments/${filename}`,
    (texture) => { texture.flipY = true; texture.needsUpdate = true; },
    undefined,
    () => console.warn(`environmentMapFile not found: resources/environments/${filename}`)
  );
}

function _applyEnvironmentMapFiles(clusterFilename, metaballFilename) {
  _loadSourceMap('clusterSourceMap', clusterFilename);
  _loadSourceMap('metaballSourceMap', metaballFilename);
}


// ──── REGENERATION ──────────────────────────────────────────────────────────────────


function _regenerateEquirectangularMap() {
  _applyWeightUniforms(getWeights());
  _applyTimeUniform(getTime());
  _renderEquirectangularPass();
}

function _applyWeightUniforms(weights) {
  const { clusterWeight, metaballWeight, burstWeight } = weights;
  _equirectangularMaterial.uniforms.metaballBlend.value = metaballWeight;
  _equirectangularMaterial.uniforms.clusterBlend.value = clusterWeight;
  _equirectangularMaterial.uniforms.burstBlend.value = burstWeight;
}

function _applyTimeUniform(time) {
  _equirectangularMaterial.uniforms.time.value = time;
}

function _renderEquirectangularPass() {
  _renderer.setRenderTarget(_equirectangularTarget);
  _renderer.render(_equirectangularScene, _equirectangularCamera);
  _renderer.setRenderTarget(null);
}


// ──── PUBLIC INTERFACE ──────────────────────────────────────────────────────────────


export function getUniformDefinitions() {
  return { environmentMap: { value: null } };
}

export function applyStateToMaterial(material) {
  _regenerateEquirectangularMap();
  material.uniforms.environmentMap.value = _equirectangularTarget.texture;
}