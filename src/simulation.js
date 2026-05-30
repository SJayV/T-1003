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
    const t = i * 12; // 3 texels × 4 floats per texel
    // texel 3i:   pos.xyz, r0
    data[t + 0] = b.x;  data[t + 1] = b.y;  data[t + 2] = b.z;  data[t + 3] = b.r0;
    // texel 3i+1: vel.xyz, noise_seed
    data[t + 4] = b.vx; data[t + 5] = b.vy; data[t + 6] = b.vz; data[t + 7] = i + 1.0;
    // texel 3i+2: reserved (zeros)
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
      stateTex: { value: initTex },
      time:     { value: 0.0 },
      phase:    { value: 0.0 },
    },
    vertexShader:   simulationVert,
    fragmentShader: simulationFrag,
    depthTest:      false,
    depthWrite:     false,
  });
  simScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMaterial));
  isFirstFrame = true;
}

export function stepSimulation(phase, time) {
  simMaterial.uniforms.stateTex.value = isFirstFrame ? initTex : readTarget.texture;
  simMaterial.uniforms.phase.value    = phase;
  simMaterial.uniforms.time.value     = time;

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
