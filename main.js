import * as THREE from 'three';
import { scene, camera, renderer }                                    from './src/renderer.js';
import { tick, getTime, getVisualPhase,
         getMetaballBlend, getClusterBlend, getBurstBlend,
         getMotionSpeed }                                              from './src/phase.js';
import { getUniformDefs as simDefs, initSimulation, stepSimulation, applyStateToMaterial as applySimState } from './src/simulation.js';
import { getUniformDefs as envDefs, initEnvMap, applyStateToMaterial as applyEnvState, setEnvPreset } from './src/environment.js';
import { initCamera, updateCamera }                                   from './src/camera.js';
import { initInput,  updateInput  }                                   from './src/input.js';
import { initAudio,  updateAudio  }                                   from './src/audio.js';
import { mainVert, mainFrag }                                         from './shaders/raymarchShader.js';
import { makeBloomSetup }                                             from './src/gpuSetup.js';
import { brightExtractFrag, blurFrag, compositeFrag }                 from './shaders/bloomShader.js';

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
initSimulation(renderer);
const bloom = makeBloomSetup(renderer, { brightExtractFrag, blurFrag, compositeFrag });

function animate() {
  tick();
  const t            = getTime();
  const visualPhase  = getVisualPhase();
  const metaballBlend = getMetaballBlend();
  const clusterBlend  = getClusterBlend();
  const burstBlend    = getBurstBlend();
  const motionSpeed  = getMotionSpeed();

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
    intensity: 1.2 + burstBlend * 1.5,
    threshold: 0.65 - burstBlend * 0.25,
  });
  requestAnimationFrame(animate);
}

document.querySelectorAll('#env-ui button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#env-ui button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    setEnvPreset(Number(btn.dataset.preset));
  });
});

animate();
