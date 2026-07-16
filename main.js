import * as THREE from 'three';
import { scene, camera, renderer }                                    from './src/renderer.js';
import { tick, getTime, getWeights, getMotionSpeed, getShapeVariant } from './src/phase.js';
import { getUniformDefs as simDefs, initSimulation, stepSimulation, applyStateToMaterial as applySimState } from './src/simulation.js';
import {
  getUniformDefs as envDefs, initEnvMap, applyStateToMaterial as applyEnvState,
  ENV_MAP_FILES, CLUSTER_ENV_MAP_DEFAULT, METABALL_ENV_MAP_DEFAULT,
  setClusterEnvMapFile, setMetaballEnvMapFile,
} from './src/environment.js';
import { initCamera, updateCamera }                                   from './src/camera.js';
import { initInput,  updateInput  }                                   from './src/input.js';
import { initAudio,  updateAudio  }                                   from './src/audio.js';
import { mainVert, buildMainFrag }                                    from './shaders/raymarchShader.js';
import { CLUSTER_SHAPE_VARIANTS, CLUSTER_SHAPE_VARIANTS_EXPERIMENTAL } from './src/constants.js';
import { initClusterShapeUI, initClusterEnvMapUI, initMetaballEnvMapUI } from './src/ui.js';
import { makeBloomSetup }                                             from './src/gpuSetup.js';
import { brightExtractFrag, blurFrag, compositeFrag }                 from './shaders/bloomShader.js';

// ──── CONSTANTS ───────────────────────────────────────────────────────────────────


const BLOOM_INTENSITY_BASE        = 1.2;
const BLOOM_INTENSITY_BURST_BOOST = 1.5;
const BLOOM_THRESHOLD_BASE        = 0.65;
const BLOOM_THRESHOLD_BURST_DROP  = 0.25;


// ──── MATERIAL & UNIFORMS SETUP ───────────────────────────────────────────────────


const material = new THREE.ShaderMaterial({
  uniforms: {
    time:          { value: 0 },
    resolution:    { value: new THREE.Vector2() },
    camPos:        { value: new THREE.Vector3() },
    metaballBlend: { value: 1 },
    clusterBlend:  { value: 0 },
    burstBlend:    { value: 0 },
    motionSpeed:   { value: 0 },
    ...simDefs(),
    ...envDefs(),
  },
  vertexShader:   mainVert,
  fragmentShader: buildMainFrag(CLUSTER_SHAPE_VARIANTS[0]),
});


// ──── HELPER FUNCTIONS - INITIALIZATION ────────────────────────────────────────────


const _shapeShaderSources = new Map(CLUSTER_SHAPE_VARIANTS.map(variant => [variant, buildMainFrag(variant)]));

function _getShapeSource(variant) {
  return _shapeShaderSources.get(variant) ?? buildMainFrag(variant);
}

function initializeShapeShaders() {
  const startingVariant = _appliedShapeVariant;
  for (const variant of CLUSTER_SHAPE_VARIANTS) {
    material.fragmentShader = _shapeShaderSources.get(variant);
    material.needsUpdate = true;
    renderer.render(scene, camera);
  }
  material.fragmentShader = _shapeShaderSources.get(startingVariant);
  material.needsUpdate = true;
}


// ──── SCENE & MODULE INITIALIZATION ───────────────────────────────────────────────


scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

initEnvMap(renderer);
initCamera(camera);
initInput();
initAudio();
initSimulation(renderer);
let _appliedShapeVariant = CLUSTER_SHAPE_VARIANTS[0];

const shapeUI = initClusterShapeUI(CLUSTER_SHAPE_VARIANTS_EXPERIMENTAL, (variant) => {
  material.fragmentShader = _getShapeSource(variant);
  material.needsUpdate = true;
  _appliedShapeVariant = variant;
});
initClusterEnvMapUI(ENV_MAP_FILES, CLUSTER_ENV_MAP_DEFAULT, setClusterEnvMapFile);
initMetaballEnvMapUI(ENV_MAP_FILES, METABALL_ENV_MAP_DEFAULT, setMetaballEnvMapFile);
const bloom = makeBloomSetup(renderer, { brightExtractFrag, blurFrag, compositeFrag });
initializeShapeShaders();


// ──── ANIMATION LOOP ──────────────────────────────────────────────────────────────


function animate() {
  const t_now = performance.now() / 1000;
  tick(t_now);
  const t           = getTime();
  const motionSpeed = getMotionSpeed();

  const { clusterWeight: clusterBlend, metaballWeight: metaballBlend, burstWeight: burstBlend } = getWeights();

  const shapeVariant = getShapeVariant();
  if (shapeVariant !== _appliedShapeVariant) {
    material.fragmentShader = _getShapeSource(shapeVariant);
    material.needsUpdate = true;
    shapeUI.select(shapeVariant);
    _appliedShapeVariant = shapeVariant;
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
