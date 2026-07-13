import * as THREE from 'three';
import { scene, camera, renderer }                                    from './src/renderer.js';
import { tick, getTime, getVisualPhase,
         getMetaballBlend, getClusterBlend, getBurstBlend,
         getMotionSpeed }                                              from './src/phase.js';
import { getUniformDefs as simDefs, initSimulation, stepSimulation, applyStateToMaterial as applySimState } from './src/simulation.js';
import { getUniformDefs as envDefs, initEnvMap, applyStateToMaterial as applyEnvState, getEnvPreset } from './src/environment.js';
import { initCamera, updateCamera }                                   from './src/camera.js';
import { initInput,  updateInput  }                                   from './src/input.js';
import { initAudio,  updateAudio  }                                   from './src/audio.js';
import { initUI }                                                     from './src/ui.js';
import { mainVert, mainFrag }                                         from './shaders/raymarchShader.js';
import { makeBloomSetup }                                             from './src/gpuSetup.js';
import { brightExtractFrag, blurFrag, compositeFrag }                 from './shaders/bloomShader.js';

const BLOOM_INTENSITY_BASE        = 1.2;
const BLOOM_INTENSITY_BURST_BOOST = 1.5;
const BLOOM_THRESHOLD_BASE        = 0.65;
const BLOOM_THRESHOLD_BURST_DROP  = 0.25;

const ENV_PRESET_AUTO     = 0;
const ENV_PRESET_METABALL = 2;
const ENV_PRESET_CLUSTER  = 3;
const ENV_PRESET_BURST    = 4;

// When a specific env preset is selected via the UI, force the *shading* blend
// to match it too — otherwise selecting e.g. Burst only recolors the sky while
// the ball surfaces keep showing whatever phase.js's real FSM state is in,
// which looks like the metallic/rim shading "isn't applied." Auto keeps the
// real, continuously blended weights.
function resolvePhaseBlend(preset, presetForThisPhase, realBlend) {
  if (preset === ENV_PRESET_AUTO) return realBlend;
  return preset === presetForThisPhase ? 1 : 0;
}

const material = new THREE.ShaderMaterial({
  uniforms: {
    time:          { value: 0 },
    resolution:    { value: new THREE.Vector2() },
    camPos:        { value: new THREE.Vector3() },
    visualPhase:   { value: 0 },
    metaballBlend: { value: 1 },
    clusterBlend:  { value: 0 },
    burstBlend:    { value: 0 },
    motionSpeed:   { value: 0 },
    ...simDefs(),
    ...envDefs(),
  },
  vertexShader:   mainVert,
  fragmentShader: mainFrag,
});

scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

initEnvMap(renderer);
initCamera(camera);
initInput();
initAudio();
initUI();
initSimulation(renderer);
const bloom = makeBloomSetup(renderer, { brightExtractFrag, blurFrag, compositeFrag });

function animate() {
  tick();
  const t           = getTime();
  const visualPhase = getVisualPhase();
  const motionSpeed = getMotionSpeed();

  const preset = getEnvPreset();
  const metaballBlend = resolvePhaseBlend(preset, ENV_PRESET_METABALL, getMetaballBlend());
  const clusterBlend  = resolvePhaseBlend(preset, ENV_PRESET_CLUSTER,  getClusterBlend());
  const burstBlend    = resolvePhaseBlend(preset, ENV_PRESET_BURST,   getBurstBlend());

  stepSimulation();
  applySimState(material);
  applyEnvState(material);
  updateInput();
  updateCamera(camera);
  updateAudio();

  material.uniforms.time.value          = t;
  material.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
  material.uniforms.camPos.value.copy(camera.position);
  material.uniforms.visualPhase.value   = visualPhase;
  material.uniforms.metaballBlend.value = metaballBlend;
  material.uniforms.clusterBlend.value  = clusterBlend;
  material.uniforms.burstBlend.value    = burstBlend;
  material.uniforms.motionSpeed.value   = motionSpeed;

  bloom.render(scene, camera, {
    intensity: BLOOM_INTENSITY_BASE + burstBlend * BLOOM_INTENSITY_BURST_BOOST,
    threshold: BLOOM_THRESHOLD_BASE - burstBlend * BLOOM_THRESHOLD_BURST_DROP,
  });
  requestAnimationFrame(animate);
}

animate();
