import * as THREE from 'three';
import { simulationVert, simulationFrag } from '../shaders/simulationShader.js';
import { makeGpuSetup } from './gpuSetup.js';
import { getWeights, getTime, getMotionSpeed } from './phase.js';
import { balls, STATE_TEX_W } from './constants.js';

let _renderer   = null;
let _readTarget  = null;
let _writeTarget = null;
let _simScene    = null;
let _simCamera   = null;
let _simMat      = null;
let _initTex     = null;
let _firstFrame  = true;

function _makeTarget() {
  return new THREE.WebGLRenderTarget(STATE_TEX_W, 1, {
    type:          THREE.FloatType,
    format:        THREE.RGBAFormat,
    minFilter:     THREE.NearestFilter,
    magFilter:     THREE.NearestFilter,
    wrapS:         THREE.ClampToEdgeWrapping,
    wrapT:         THREE.ClampToEdgeWrapping,
    depthBuffer:   false,
    stencilBuffer: false,
  });
}

function _buildInitData() {
  const data = new Float32Array(STATE_TEX_W * 4);
  balls.forEach((b, i) => {
    const t    = i * 12;
    const phi0 = Math.random() * Math.PI * 2;
    const r    = b.orbitRadius;
    const iSin = b.orbitInclination;

    // texel 3i: pos, r0. Program starts in Cluster, so balls start collapsed onto the cylinder
    // axis (x=z=0) with only height (from each ball's own orbit inclination) differing --
    // not spread across their eventual orbit, which they only move onto once Metaball begins.
    data[t + 0] = 0;
    data[t + 1] = r * Math.sin(phi0) * iSin;
    data[t + 2] = 0;
    data[t + 3] = b.r0;
    // texel 3i+1: initial vel -- zero, since the ball isn't starting on its orbit to derive one from
    data[t + 4] = 0;
    data[t + 5] = 0;
    data[t + 6] = 0;
    data[t + 7] = 0;
    // texel 3i+2: orbit params (r, speed, phi0, inclination)
    data[t + 8]  = b.orbitRadius;
    data[t + 9]  = b.orbitSpeed;
    data[t + 10] = phi0;
    data[t + 11] = b.orbitInclination;
  });
  return data;
}

export function initSimulation(renderer) {
  _renderer   = renderer;
  _readTarget  = _makeTarget();
  _writeTarget = _makeTarget();

  _initTex = new THREE.DataTexture(_buildInitData(), STATE_TEX_W, 1, THREE.RGBAFormat, THREE.FloatType);
  _initTex.needsUpdate = true;

  _simMat = new THREE.ShaderMaterial({
    uniforms: {
      stateTex:      { value: _initTex },
      time:          { value: 0.0 },
      clusterBlend:  { value: 1.0 },
      metaballBlend: { value: 0.0 },
      burstBlend:    { value: 0.0 },
      motionSpeed:   { value: 0.0 },
    },
    vertexShader:   simulationVert,
    fragmentShader: simulationFrag,
    depthTest:      false,
    depthWrite:     false,
  });
  ({ scene: _simScene, camera: _simCamera } = makeGpuSetup(_simMat));
  _firstFrame = true;
}

export function stepSimulation() {
  const { clusterWeight, metaballWeight, burstWeight } = getWeights();
  _simMat.uniforms.stateTex.value      = _firstFrame ? _initTex : _readTarget.texture;
  _simMat.uniforms.clusterBlend.value  = clusterWeight;
  _simMat.uniforms.metaballBlend.value = metaballWeight;
  _simMat.uniforms.burstBlend.value    = burstWeight;
  _simMat.uniforms.time.value          = getTime();
  _simMat.uniforms.motionSpeed.value   = getMotionSpeed();

  _renderer.setRenderTarget(_writeTarget);
  _renderer.render(_simScene, _simCamera);
  _renderer.setRenderTarget(null);

  const tmp    = _readTarget;
  _readTarget  = _writeTarget;
  _writeTarget = tmp;
  _firstFrame  = false;
}

export function getUniformDefs() {
  return { stateTex: { value: null } };
}

export function applyStateToMaterial(material) {
  if (_readTarget) material.uniforms.stateTex.value = _readTarget.texture;
}
