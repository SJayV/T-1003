import * as THREE from 'three';
import { scene, camera, renderer }                                    from './src/renderer.js';
import { tick, getTime, getWeights, getMotionSpeed }                  from './src/phase.js';
import { getUniformDefs as simDefs, initSimulation, stepSimulation, applyStateToMaterial as applySimState } from './src/simulation.js';
import { getUniformDefs as envDefs, initEnvMap, applyStateToMaterial as applyEnvState } from './src/environment.js';
import { initCamera, updateCamera }                                   from './src/camera.js';
import { initInput,  updateInput  }                                   from './src/input.js';
import { initAudio,  updateAudio  }                                   from './src/audio.js';
import { mainVert, buildMainFrag }                                    from './shaders/raymarchShader.js';
import { CLUSTER_SHAPE_VARIANTS }                                     from './shaderChunks/shapeChunk.js';
import { initClusterShapeUI }                                         from './src/clusterShapeUI.js';
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


// ──── SCENE & MODULE INITIALIZATION ───────────────────────────────────────────────


scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

initEnvMap(renderer);
initCamera(camera);
initInput();
initAudio();
initSimulation(renderer);
initClusterShapeUI(CLUSTER_SHAPE_VARIANTS, (variant) => {
  material.fragmentShader = buildMainFrag(variant);
  material.needsUpdate = true;
});
const bloom = makeBloomSetup(renderer, { brightExtractFrag, blurFrag, compositeFrag });


// ──── ANIMATION LOOP ──────────────────────────────────────────────────────────────


function animate() {
  const t_now = performance.now() / 1000;
  tick(t_now);
  const t           = getTime();
  const motionSpeed = getMotionSpeed();

  const { clusterWeight: clusterBlend, metaballWeight: metaballBlend, burstWeight: burstBlend } = getWeights();

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
