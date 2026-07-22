import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { getWeights, getTime } from './phase.js';
import { environmentFragment } from '../shaders/environmentShader.js';
import { initializeGpuSetup, initializeRenderTarget, initializeFullscreenMaterial, renderPass } from './gpuSetup.js';


// ──── CONSTANTS ────────────────────────────────────────────────────────────


const CLUSTER_ENVIRONMENT_MAP_DEFAULT = 'neonStudio.hdr';
const METABALL_ENVIRONMENT_MAP_DEFAULT = 'neonStudio.hdr';

const EQUIRECTANGULAR_HEIGHT = 256;
const EQUIRECTANGULAR_WIDTH = EQUIRECTANGULAR_HEIGHT * 2;


// ──── INITIALIZATION ───────────────────────────────────────────────────────


let _renderer = null;
let _equirectangularTarget = null;
let _equirectangularScene = null;
let _equirectangularCamera = null;
let _equirectangularMaterial = null;
let _loader = null;

function _initializeEquirectangularTarget() {
  const target = initializeRenderTarget(EQUIRECTANGULAR_WIDTH, EQUIRECTANGULAR_HEIGHT);
  target.texture.colorSpace = THREE.LinearSRGBColorSpace;
  return target;
}

function _initializeEquirectangularMaterial() {
  return initializeFullscreenMaterial({
    time: { value: 0.0 },
    resolution: { value: new THREE.Vector2(EQUIRECTANGULAR_WIDTH, EQUIRECTANGULAR_HEIGHT) },
    metaballWeight: { value: 1.0 },
    clusterWeight: { value: 0.0 },
    burstWeight: { value: 0.0 },
    clusterSourceMap: { value: null },
    metaballSourceMap: { value: null },
  }, environmentFragment);
}

export function initializeEnvironmentMap(renderer, clusterFilename = CLUSTER_ENVIRONMENT_MAP_DEFAULT, metaballFilename = METABALL_ENVIRONMENT_MAP_DEFAULT) {
  _renderer = renderer;
  _equirectangularTarget = _initializeEquirectangularTarget();
  _equirectangularMaterial = _initializeEquirectangularMaterial();
  ({ scene: _equirectangularScene, camera: _equirectangularCamera } = initializeGpuSetup(_equirectangularMaterial));

  _loader = new RGBELoader();
  _applyEnvironmentMapFiles(clusterFilename, metaballFilename);
}


// ──── HELPER FUNCTIONS - ENVIRONMENT MAP LOADING ───────────────────────────


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


// ──── HELPER FUNCTIONS - REGENERATION ──────────────────────────────────────


function _applyWeightUniforms(weights) {
  const { clusterWeight, metaballWeight, burstWeight } = weights;
  _equirectangularMaterial.uniforms.metaballWeight.value = metaballWeight;
  _equirectangularMaterial.uniforms.clusterWeight.value = clusterWeight;
  _equirectangularMaterial.uniforms.burstWeight.value = burstWeight;
}

function _applyTimeUniform(time) {
  _equirectangularMaterial.uniforms.time.value = time;
}

function _regenerateEquirectangularMap() {
  _applyWeightUniforms(getWeights());
  _applyTimeUniform(getTime());
  renderPass(_renderer, _equirectangularTarget, { scene: _equirectangularScene, camera: _equirectangularCamera });
}


// ──── PUBLIC INTERFACE ─────────────────────────────────────────────────────


export function getUniformDefinitions() {
  return { environmentMap: { value: null } };
}

export function applyStateToMaterial(material) {
  _regenerateEquirectangularMap();
  material.uniforms.environmentMap.value = _equirectangularTarget.texture;
}