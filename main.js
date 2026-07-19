import * as THREE from 'three';
import { scene, camera, renderer, initializeRenderer, getUniformDefinitions as getRendererUniformDefinitions, applyStateToMaterial as applyRendererState } from './src/renderer.js';
import { initializeInput, updateInput } from './src/input.js';
import { initializeAudio, updateAudio } from './src/audio.js';
import { tick, getWeights, getUniformDefinitions as getPhaseUniformDefinitions, applyStateToMaterial as applyPhaseState } from './src/phase.js';
import { getUniformDefinitions as getSimulationUniformDefinitions, initializeSimulation, stepSimulation, applyStateToMaterial as applySimulationState } from './src/simulation.js';
import { getUniformDefinitions as getEnvironmentUniformDefinitions, initializeEnvironmentMap, applyStateToMaterial as applyEnvironmentState } from './src/environment.js';
import { makeBloomSetup } from './src/gpuSetup.js';
import { mainVertex, mainFragment } from './shaders/raymarchShader.js';
import { brightExtractFragment, blurFragment, compositeFragment } from './shaders/bloomShader.js';


// ──── CONSTANTS ───────────────────────────────────────────────────────────────────


const BLOOM_INTENSITY_BASE = 1.2;
const BLOOM_INTENSITY_BURST_BOOST = 1.5;
const BLOOM_THRESHOLD_BASE = 0.65;
const BLOOM_THRESHOLD_BURST_DROP = 0.25;

const CAMERA_START_POSITION = [0.0, 0.0, 5.0];

const material = new THREE.ShaderMaterial({
  uniforms: {
    ...getPhaseUniformDefinitions(),
    ...getRendererUniformDefinitions(),
    ...getSimulationUniformDefinitions(),
    ...getEnvironmentUniformDefinitions(),
  },
  vertexShader: mainVertex,
  fragmentShader: mainFragment,
});


// ──── INITIALIZATION ───────────────────────────────────────────────


const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
mesh.frustumCulled = false;
scene.add(mesh);

camera.position.set(...CAMERA_START_POSITION);
initializeRenderer();
initializeEnvironmentMap(renderer);
initializeInput();
initializeAudio();
initializeSimulation(renderer);

const bloom = makeBloomSetup(renderer, { brightExtractFragment, blurFragment, compositeFragment });


// ──── ANIMATION LOOP ──────────────────────────────────────────────────────────────


function animate() {
  const currentTimeSeconds = performance.now() / 1000;
  tick(currentTimeSeconds);

  const { burstWeight } = getWeights();

  stepSimulation();
  applyPhaseState(material);
  applyRendererState(material);
  applySimulationState(material);
  applyEnvironmentState(material);
  updateInput();
  updateAudio();

  bloom.render(scene, camera, {
    intensity: BLOOM_INTENSITY_BASE + burstWeight * BLOOM_INTENSITY_BURST_BOOST,
    threshold: BLOOM_THRESHOLD_BASE - burstWeight * BLOOM_THRESHOLD_BURST_DROP
  });

  requestAnimationFrame(animate);
}

animate();