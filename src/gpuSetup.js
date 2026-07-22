import * as THREE from 'three';
import { vertexChunk } from '../shaderChunks/helpersChunk.js';


// ──── CONSTANTS ────────────────────────────────────────────────────────────


const BLUR_DIRECTION_HORIZONTAL = new THREE.Vector2(1, 0);
const BLUR_DIRECTION_VERTICAL = new THREE.Vector2(0, 1);


// ──── HELPER FUNCTIONS - RESOURCE FACTORIES ────────────────────────────────


export function initializeGpuSetup(material) {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  return { scene, camera };
}

export function initializeRenderTarget(width, height) {
  return new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });
}

export function initializeFullscreenMaterial(uniforms, fragmentShader) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vertexChunk,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
}


// ──── HELPER FUNCTIONS - BLOOM SETUP ───────────────────────────────────────


function _initializeBloomTargets({ width, height, bloomWidth, bloomHeight }) {
  const mainTarget = initializeRenderTarget(width, height);
  const extractTarget = initializeRenderTarget(bloomWidth, bloomHeight);
  const blurATarget = initializeRenderTarget(bloomWidth, bloomHeight);
  const blurBTarget = initializeRenderTarget(bloomWidth, bloomHeight);

  return { mainTarget, extractTarget, blurATarget, blurBTarget };
}

function _initializeBloomMaterials({ width, height, bloomWidth, bloomHeight }, { brightExtractFragment, blurFragment, compositeFragment }) {
  const extractMaterial = initializeFullscreenMaterial({
    mainTexture: { value: null },
    resolution: { value: new THREE.Vector2(bloomWidth, bloomHeight) },
    threshold: { value: 0 },
  }, brightExtractFragment);
  const blurMaterial = initializeFullscreenMaterial({
    blurTexture: { value: null },
    resolution: { value: new THREE.Vector2(bloomWidth, bloomHeight) },
    blurDirection: { value: BLUR_DIRECTION_HORIZONTAL.clone() },
  }, blurFragment);
  const compositeMaterial = initializeFullscreenMaterial({
    mainTexture: { value: null },
    bloomTexture: { value: null },
    resolution: { value: new THREE.Vector2(width, height) },
    intensity: { value: 0 },
  }, compositeFragment);

  return { extractMaterial, blurMaterial, compositeMaterial };
}

function _initializeBloomPasses(materials) {
  const extractPass = initializeGpuSetup(materials.extractMaterial);
  const blurPass = initializeGpuSetup(materials.blurMaterial);
  const compositePass = initializeGpuSetup(materials.compositeMaterial);

  return { extractPass, blurPass, compositePass };
}


// ──── HELPER FUNCTIONS - BLOOM UPDATE ──────────────────────────────────────


function _rendererSizeChanged(renderer, mainTarget) {
  return renderer.domElement.width !== mainTarget.width || renderer.domElement.height !== mainTarget.height;
}

function _computeBloomDimensions(renderer) {
  const { width, height } = renderer.domElement;
  return { width, height, bloomWidth: Math.floor(width / 2), bloomHeight: Math.floor(height / 2) };
}

function _applyBloomDimensions(targets, materials, { width, height, bloomWidth, bloomHeight }) {
  targets.mainTarget.setSize(width, height);
  targets.extractTarget.setSize(bloomWidth, bloomHeight);
  targets.blurATarget.setSize(bloomWidth, bloomHeight);
  targets.blurBTarget.setSize(bloomWidth, bloomHeight);
  materials.extractMaterial.uniforms.resolution.value.set(bloomWidth, bloomHeight);
  materials.blurMaterial.uniforms.resolution.value.set(bloomWidth, bloomHeight);
  materials.compositeMaterial.uniforms.resolution.value.set(width, height);
}

function _resizeBloomTargets(renderer, targets, materials) {
  _applyBloomDimensions(targets, materials, _computeBloomDimensions(renderer));
}

function _applyBloomParameters(materials, { intensity, threshold }) {
  materials.extractMaterial.uniforms.threshold.value = threshold;
  materials.compositeMaterial.uniforms.intensity.value = intensity;
}


// ──── HELPER FUNCTIONS - BLOOM PASSES ──────────────────────────────────────


export function renderPass(renderer, target, pass, applyUniforms) {
  if (applyUniforms) applyUniforms();
  renderer.setRenderTarget(target);
  renderer.render(pass.scene, pass.camera);
  renderer.setRenderTarget(null);
}

function _renderMainPass(renderer, scene, camera, mainTarget) {
  renderPass(renderer, mainTarget, { scene, camera });
}

function _renderExtractPass(renderer, materials, targets, extractPass) {
  renderPass(renderer, targets.extractTarget, extractPass, () => {
    materials.extractMaterial.uniforms.mainTexture.value = targets.mainTarget.texture;
  });
}

function _renderBlurPass(renderer, materials, blurPass, sourceTexture, target, direction) {
  renderPass(renderer, target, blurPass, () => {
    materials.blurMaterial.uniforms.blurTexture.value = sourceTexture;
    materials.blurMaterial.uniforms.blurDirection.value.copy(direction);
  });
}

function _renderBlurPasses(renderer, materials, targets, blurPass) {
  _renderBlurPass(renderer, materials, blurPass, targets.extractTarget.texture, targets.blurATarget, BLUR_DIRECTION_HORIZONTAL);
  _renderBlurPass(renderer, materials, blurPass, targets.blurATarget.texture, targets.blurBTarget, BLUR_DIRECTION_VERTICAL);
}

function _renderCompositePass(renderer, materials, targets, compositePass) {
  renderPass(renderer, null, compositePass, () => {
    materials.compositeMaterial.uniforms.mainTexture.value = targets.mainTarget.texture;
    materials.compositeMaterial.uniforms.bloomTexture.value = targets.blurBTarget.texture;
  });
}


// ──── BLOOM PIPELINE ───────────────────────────────────────────────────────


export function initializeBloomSetup(renderer, fragments) {
  const dimensions = _computeBloomDimensions(renderer);

  const targets = _initializeBloomTargets(dimensions);
  const materials = _initializeBloomMaterials(dimensions, fragments);
  const passes = _initializeBloomPasses(materials);

  return {
    render(scene, camera, { intensity, threshold }) {
      if (_rendererSizeChanged(renderer, targets.mainTarget)) _resizeBloomTargets(renderer, targets, materials);

      _applyBloomParameters(materials, { intensity, threshold });
      _renderMainPass(renderer, scene, camera, targets.mainTarget);
      _renderExtractPass(renderer, materials, targets, passes.extractPass);
      _renderBlurPasses(renderer, materials, targets, passes.blurPass);
      _renderCompositePass(renderer, materials, targets, passes.compositePass);
    },
  };
}