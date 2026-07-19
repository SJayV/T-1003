import * as THREE from 'three';
import { vertexChunk } from '../shaderChunks/helpersChunk.js';


// ──── FULLSCREEN QUAD FACTORY ──────────────────────────────────────────────────────


export function makeGpuSetup(material) {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const scene  = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  return { scene, camera };
}


// ──── BLOOM PIPELINE ───────────────────────────────────────────────────────────────


export function makeBloomSetup(renderer, { brightExtractFragment, blurFragment, compositeFragment }) {
  const W = renderer.domElement.width;
  const H = renderer.domElement.height;
  const BW = Math.floor(W / 2);
  const BH = Math.floor(H / 2);

  function _rt(w, h) {
    return new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
  }

  const mainTarget = _rt(W, H);
  const extractTarget = _rt(BW, BH);
  const blurATarget = _rt(BW, BH);
  const blurBTarget = _rt(BW, BH);

  const extractMaterial = new THREE.ShaderMaterial({
    uniforms: {
      mainTexture: { value: null },
      resolution: { value: new THREE.Vector2(BW, BH) },
      threshold: { value: 0 },
    },
    vertexShader: vertexChunk,
    fragmentShader: brightExtractFragment,
    depthTest: false, depthWrite: false,
  });

  const blurMaterial = new THREE.ShaderMaterial({
    uniforms: {
      blurTexture: { value: null },
      resolution: { value: new THREE.Vector2(BW, BH) },
      blurDir: { value: new THREE.Vector2(1, 0) },
    },
    vertexShader: vertexChunk,
    fragmentShader: blurFragment,
    depthTest: false, depthWrite: false,
  });

  const compositeMaterial = new THREE.ShaderMaterial({
    uniforms: {
      mainTexture: { value: null },
      bloomTexture: { value: null },
      resolution: { value: new THREE.Vector2(W, H) },
      intensity: { value: 0 },
    },
    vertexShader: vertexChunk,
    fragmentShader: compositeFragment,
    depthTest: false, depthWrite: false,
  });

  const { scene: extractScene, camera: extractCamera } = makeGpuSetup(extractMaterial);
  const { scene: blurScene, camera: blurCamera } = makeGpuSetup(blurMaterial);
  const { scene: compositeScene, camera: compositeCamera } = makeGpuSetup(compositeMaterial);

  return {
    render(scene, camera, { intensity, threshold }) {
      const cW = renderer.domElement.width;
      const cH = renderer.domElement.height;
      if (cW !== mainTarget.width || cH !== mainTarget.height) {
        const bW = Math.floor(cW / 2);
        const bH = Math.floor(cH / 2);
        mainTarget.setSize(cW, cH);
        extractTarget.setSize(bW, bH);
        blurATarget.setSize(bW, bH);
        blurBTarget.setSize(bW, bH);
        extractMaterial.uniforms.resolution.value.set(bW, bH);
        blurMaterial.uniforms.resolution.value.set(bW, bH);
        compositeMaterial.uniforms.resolution.value.set(cW, cH);
      }

      extractMaterial.uniforms.threshold.value = threshold;
      compositeMaterial.uniforms.intensity.value = intensity;

      renderer.setRenderTarget(mainTarget);
      renderer.render(scene, camera);

      extractMaterial.uniforms.mainTexture.value = mainTarget.texture;
      renderer.setRenderTarget(extractTarget);
      renderer.render(extractScene, extractCamera);

      blurMaterial.uniforms.blurTexture.value = extractTarget.texture;
      blurMaterial.uniforms.blurDir.value.set(1, 0);
      renderer.setRenderTarget(blurATarget);
      renderer.render(blurScene, blurCamera);

      blurMaterial.uniforms.blurTexture.value = blurATarget.texture;
      blurMaterial.uniforms.blurDir.value.set(0, 1);
      renderer.setRenderTarget(blurBTarget);
      renderer.render(blurScene, blurCamera);

      compositeMaterial.uniforms.mainTexture.value = mainTarget.texture;
      compositeMaterial.uniforms.bloomTexture.value = blurBTarget.texture;
      renderer.setRenderTarget(null);
      renderer.render(compositeScene, compositeCamera);
    },
  };
}
