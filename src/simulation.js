import * as THREE from 'three';
import { balls } from './balls.js';
import { simulationVert, simulationFrag } from '../shaders/simulationShader.js';

const N = 12;
const W = N * 3; // 36 texels wide, 1 texel tall

let rendererRef  = null;
let readTarget   = null;
let writeTarget  = null;
let simScene     = null;
let simCamera    = null;
let simMaterial  = null;
let initTex      = null;
let isFirstFrame = true;

function makeTarget() {
  return new THREE.WebGLRenderTarget(W, 1, {
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

function buildInitData() {
  const data = new Float32Array(W * 4);
  balls.forEach((b, i) => {
    const t = i * 12;
    const phi      = b.orbitPhase;
    const r        = b.orbitRadius;
    const iSin     = b.orbitInclination;
    const iCos     = Math.sqrt(Math.max(0, 1 - iSin * iSin));
    const dPhi     = b.orbitSpeed * 3.0 * 0.004; // Δphi per frame at t=0

    // texel 3i: initial pos on orbit, r0
    data[t + 0] = r * Math.cos(phi);
    data[t + 1] = r * Math.sin(phi) * iSin;
    data[t + 2] = r * Math.sin(phi) * iCos * 0.28;
    data[t + 3] = b.r0;
    // texel 3i+1: initial vel = analytic orbit derivative, noise_seed
    data[t + 4] = -r * Math.sin(phi)          * dPhi;
    data[t + 5] =  r * Math.cos(phi) * iSin   * dPhi;
    data[t + 6] =  r * Math.cos(phi) * iCos   * 0.28 * dPhi;
    data[t + 7] = i + 1.0;
    // texel 3i+2: orbit params (metaball analytic orbit)
    data[t + 8]  = b.orbitRadius;
    data[t + 9]  = b.orbitSpeed;
    data[t + 10] = b.orbitPhase;
    data[t + 11] = b.orbitInclination;
  });
  return data;
}

export function initSimulation(renderer) {
  rendererRef = renderer;
  readTarget  = makeTarget();
  writeTarget = makeTarget();

  initTex = new THREE.DataTexture(buildInitData(), W, 1, THREE.RGBAFormat, THREE.FloatType);
  initTex.needsUpdate = true;

  simCamera   = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  simScene    = new THREE.Scene();
  simMaterial = new THREE.ShaderMaterial({
    uniforms: {
      stateTex:     { value: initTex },
      time:         { value: 0.0 },
      logicalPhase: { value: 0.0 },
    },
    vertexShader:   simulationVert,
    fragmentShader: simulationFrag,
    depthTest:      false,
    depthWrite:     false,
  });
  simScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMaterial));
  isFirstFrame = true;
}

export function stepSimulation(logicalPhase, time) {
  simMaterial.uniforms.stateTex.value     = isFirstFrame ? initTex : readTarget.texture;
  simMaterial.uniforms.logicalPhase.value = logicalPhase;
  simMaterial.uniforms.time.value         = time;

  rendererRef.setRenderTarget(writeTarget);
  rendererRef.render(simScene, simCamera);
  rendererRef.setRenderTarget(null);

  const tmp  = readTarget;
  readTarget  = writeTarget;
  writeTarget = tmp;
  isFirstFrame = false;
}

export function getUniformDefs() {
  return { stateTex: { value: null } };
}

export function applyStateToMaterial(material) {
  if (readTarget) material.uniforms.stateTex.value = readTarget.texture;
}
