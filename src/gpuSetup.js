import * as THREE from 'three';
import { vertexChunk } from '../shaderChunks/vertexChunk.js';

// ──── CONSTANTS ───────────────────────────────────────────────────────────────────


const DEFAULT_BLOOM_INTENSITY = 1.5;
const DEFAULT_BLOOM_THRESHOLD = 0.6;


// ──── FULLSCREEN QUAD FACTORY ──────────────────────────────────────────────────────


export function makeGpuSetup(material) {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const scene  = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  return { scene, camera };
}


// ──── BLOOM PIPELINE ───────────────────────────────────────────────────────────────


export function makeBloomSetup(renderer, { brightExtractFrag, blurFrag, compositeFrag }) {
  const W  = renderer.domElement.width;
  const H  = renderer.domElement.height;
  const BW = Math.floor(W / 2);
  const BH = Math.floor(H / 2);

  function _rt(w, h) {
    return new THREE.WebGLRenderTarget(w, h, {
      type:        THREE.HalfFloatType,
      format:      THREE.RGBAFormat,
      minFilter:   THREE.LinearFilter,
      magFilter:   THREE.LinearFilter,
      depthBuffer: false,
    });
  }

  const mainTarget    = _rt(W,  H );
  const extractTarget = _rt(BW, BH);
  const blurATarget   = _rt(BW, BH);
  const blurBTarget   = _rt(BW, BH);

  const extractMat = new THREE.ShaderMaterial({
    uniforms: {
      mainTex:    { value: null },
      resolution: { value: new THREE.Vector2(BW, BH) },
      threshold:  { value: DEFAULT_BLOOM_THRESHOLD },
    },
    vertexShader:   vertexChunk,
    fragmentShader: brightExtractFrag,
    depthTest: false, depthWrite: false,
  });

  const blurMat = new THREE.ShaderMaterial({
    uniforms: {
      blurTex:    { value: null },
      resolution: { value: new THREE.Vector2(BW, BH) },
      blurDir:    { value: new THREE.Vector2(1, 0) },
    },
    vertexShader:   vertexChunk,
    fragmentShader: blurFrag,
    depthTest: false, depthWrite: false,
  });

  const compositeMat = new THREE.ShaderMaterial({
    uniforms: {
      mainTex:    { value: null },
      bloomTex:   { value: null },
      resolution: { value: new THREE.Vector2(W, H) },
      intensity:  { value: DEFAULT_BLOOM_INTENSITY },
    },
    vertexShader:   vertexChunk,
    fragmentShader: compositeFrag,
    depthTest: false, depthWrite: false,
  });

  const { scene: extractScene,   camera: extractCam   } = makeGpuSetup(extractMat);
  const { scene: blurScene,      camera: blurCam      } = makeGpuSetup(blurMat);
  const { scene: compositeScene, camera: compositeCam } = makeGpuSetup(compositeMat);

  return {
    render(scene, camera, { intensity = DEFAULT_BLOOM_INTENSITY, threshold = DEFAULT_BLOOM_THRESHOLD } = {}) {
      const cW = renderer.domElement.width;
      const cH = renderer.domElement.height;
      if (cW !== mainTarget.width || cH !== mainTarget.height) {
        const bW = Math.floor(cW / 2);
        const bH = Math.floor(cH / 2);
        mainTarget.setSize(cW, cH);
        extractTarget.setSize(bW, bH);
        blurATarget.setSize(bW, bH);
        blurBTarget.setSize(bW, bH);
        extractMat.uniforms.resolution.value.set(bW, bH);
        blurMat.uniforms.resolution.value.set(bW, bH);
        compositeMat.uniforms.resolution.value.set(cW, cH);
      }

      extractMat.uniforms.threshold.value   = threshold;
      compositeMat.uniforms.intensity.value = intensity;

      renderer.setRenderTarget(mainTarget);
      renderer.render(scene, camera);

      extractMat.uniforms.mainTex.value = mainTarget.texture;
      renderer.setRenderTarget(extractTarget);
      renderer.render(extractScene, extractCam);

      blurMat.uniforms.blurTex.value = extractTarget.texture;
      blurMat.uniforms.blurDir.value.set(1, 0);
      renderer.setRenderTarget(blurATarget);
      renderer.render(blurScene, blurCam);

      blurMat.uniforms.blurTex.value = blurATarget.texture;
      blurMat.uniforms.blurDir.value.set(0, 1);
      renderer.setRenderTarget(blurBTarget);
      renderer.render(blurScene, blurCam);

      compositeMat.uniforms.mainTex.value  = mainTarget.texture;
      compositeMat.uniforms.bloomTex.value = blurBTarget.texture;
      renderer.setRenderTarget(null);
      renderer.render(compositeScene, compositeCam);
    },
  };
}
