import * as THREE from 'three';
import { simulationVertex, simulationFragment } from '../shaders/simulationShader.js';
import { makeGpuSetup } from './gpuSetup.js';
import { getSimulationUniformDefinitions, applySimulationState } from './phase.js';
import { balls, STATE_TEXTURE_WIDTH, ORBIT_Z_SQUASH } from './constants.js';


// ──── INITIALIZATION ──────────────────────────────


let _renderer = null;
let _readTarget = null;
let _writeTarget = null;
let _simulationScene = null;
let _simulationCamera = null;
let _simulationMaterial = null;
let _initializationTexture = null;
let _firstFrame = true;

function _initializeData() {
  const data = new Float32Array(STATE_TEXTURE_WIDTH * 4);
  balls.forEach((ball, index) => {
    const offset = index * 12;
    const initialPhi = Math.random() * Math.PI * 2;
    const radius = ball.orbitRadius;
    const inclinationSin = ball.orbitInclination;
    const inclinationCos = Math.sqrt(Math.max(0, 1 - inclinationSin * inclinationSin));

    data[offset + 0] = radius * Math.cos(initialPhi);
    data[offset + 1] = radius * Math.sin(initialPhi) * inclinationSin;
    data[offset + 2] = radius * Math.sin(initialPhi) * inclinationCos * ORBIT_Z_SQUASH;
    data[offset + 3] = ball.initialRadius;
    data[offset + 4] = 0;
    data[offset + 5] = 0;
    data[offset + 6] = 0;
    data[offset + 7] = 0;
    data[offset + 8] = ball.orbitRadius;
    data[offset + 9] = ball.orbitSpeed;
    data[offset + 10] = initialPhi;
    data[offset + 11] = ball.orbitInclination;
  });
  return data;
}

function _initializeTexture() {
  const texture = new THREE.DataTexture(_initializeData(), STATE_TEXTURE_WIDTH, 1, THREE.RGBAFormat, THREE.FloatType);
  texture.needsUpdate = true;
  return texture;
}


// ──── HELPER FUNCTIONS ─────────────────────────────────────────────────────────────


function _makeTarget() {
  return new THREE.WebGLRenderTarget(STATE_TEXTURE_WIDTH, 1, {
    type: THREE.FloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

function _makeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      stateTexture: { value: _initializationTexture },
      ...getSimulationUniformDefinitions(),
    },
    vertexShader: simulationVertex,
    fragmentShader: simulationFragment,
    depthTest: false,
    depthWrite: false,
  });
}

function _swap() {
  const temporary = _readTarget;
  _readTarget = _writeTarget;
  _writeTarget = temporary;
}

function _renderToTarget(target) {
  _renderer.setRenderTarget(target);
  _renderer.render(_simulationScene, _simulationCamera);
  _renderer.setRenderTarget(null);
}


// ──── PUBLIC INTERFACE ────────────────────────────────────────────────────────────


export function initializeSimulation(renderer) {
  _renderer = renderer;
  _readTarget = _makeTarget();
  _writeTarget = _makeTarget();

  _initializationTexture = _initializeTexture();

  _simulationMaterial = _makeMaterial();
  ({ scene: _simulationScene, camera: _simulationCamera } = makeGpuSetup(_simulationMaterial));
  _firstFrame = true;
}

export function stepSimulation() {
  _simulationMaterial.uniforms.stateTexture.value = _firstFrame ? _initializationTexture : _readTarget.texture;
  applySimulationState(_simulationMaterial);

  _renderToTarget(_writeTarget);

  _swap();
  _firstFrame = false;
}

export function getUniformDefinitions() {
  return { stateTexture: { value: null } };
}

export function applyStateToMaterial(material) {
  material.uniforms.stateTexture.value = _readTarget.texture;
}