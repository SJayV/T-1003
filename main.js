import * as THREE from 'three';
import { scene, camera, renderer }                                    from './src/renderer.js';
import { tick, getTime, getWeights, getMotionSpeed, getShapeVariant, getShapeIndex } from './src/phase.js';
import { getUniformDefs as simDefs, initializeSimulation, stepSimulation, applyStateToMaterial as applySimState } from './src/simulation.js';
import {
  getUniformDefs as envDefs, initializeEnvMap, applyStateToMaterial as applyEnvState,
  ENV_MAP_FILES, CLUSTER_ENV_MAP_DEFAULT, METABALL_ENV_MAP_DEFAULT,
  setClusterEnvMapFile, setMetaballEnvMapFile,
} from './src/environment.js';
import { initializeCamera, updateCamera }                                   from './src/camera.js';
import { initializeInput,  updateInput  }                                   from './src/input.js';
import { initializeAudio, updateAudio }                               from './src/audio.js';
import { mainVert, buildMainFrag }                                    from './shaders/raymarchShader.js';
import { CLUSTER_SHAPE_VARIANTS } from './src/constants.js';
import { initializeClusterShapeUI, initializeClusterEnvMapUI, initializeMetaballEnvMapUI } from './src/ui.js';
import { makeBloomSetup }                                             from './src/gpuSetup.js';
import { brightExtractFrag, blurFrag, compositeFrag }                 from './shaders/bloomShader.js';

// ──── CONSTANTS ───────────────────────────────────────────────────────────────────


const BLOOM_INTENSITY_BASE        = 1.2;
const BLOOM_INTENSITY_BURST_BOOST = 1.5;
const BLOOM_THRESHOLD_BASE        = 0.65;
const BLOOM_THRESHOLD_BURST_DROP  = 0.25;


// ──── INITIALIZATION - MATERIAL & UNIFORMS ───────────────────────────────────────────────────


const material = new THREE.ShaderMaterial({
  uniforms: {
    time:          { value: 0 },
    resolution:    { value: new THREE.Vector2() },
    camPos:        { value: new THREE.Vector3() },
    metaballBlend: { value: 1 },
    clusterBlend:  { value: 0 },
    burstBlend:    { value: 0 },
    motionSpeed:   { value: 0 },
    clusterShapeIndex: { value: 0 },
    ...simDefs(),
    ...envDefs(),
  },
  vertexShader:   mainVert,
  fragmentShader: buildMainFrag(),
});


// ──── INITIALIZATION - SCENE & MODULE ───────────────────────────────────────────────


scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

initializeEnvMap(renderer);
initializeCamera(camera);
initializeInput();
initializeAudio();
initializeSimulation(renderer);
let _appliedShapeIndex = getShapeIndex();

const shapeUI = initializeClusterShapeUI(CLUSTER_SHAPE_VARIANTS, (variant) => {
  const idx = CLUSTER_SHAPE_VARIANTS.indexOf(variant);
  material.uniforms.clusterShapeIndex.value = idx;
  _appliedShapeIndex = idx;
});
initializeClusterEnvMapUI(ENV_MAP_FILES, CLUSTER_ENV_MAP_DEFAULT, setClusterEnvMapFile);
initializeMetaballEnvMapUI(ENV_MAP_FILES, METABALL_ENV_MAP_DEFAULT, setMetaballEnvMapFile);
const bloom = makeBloomSetup(renderer, { brightExtractFrag, blurFrag, compositeFrag });


// ──── ANIMATION LOOP ──────────────────────────────────────────────────────────────


function animate() {
  const t_now = performance.now() / 1000;
  tick(t_now);
  const t           = getTime();
  const motionSpeed = getMotionSpeed();

  const { clusterWeight: clusterBlend, metaballWeight: metaballBlend, burstWeight: burstBlend } = getWeights();

  const shapeIndex = getShapeIndex();
  if (shapeIndex !== _appliedShapeIndex) {
    material.uniforms.clusterShapeIndex.value = shapeIndex;
    shapeUI.select(getShapeVariant());
    _appliedShapeIndex = shapeIndex;
  }

  stepSimulation();
  applySimState(material);
  applyEnvState(material);
  updateInput();
  updateCamera(camera);
  updateAudio();

  material.uniforms.time.value          = t;
  material.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
  material.uniforms.camPos.value.copy(camera.position);
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
