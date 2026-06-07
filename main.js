import * as THREE from 'three';
import { scene, camera, renderer }                                    from './src/renderer.js';
import { tick, getTime, getLogicalPhase, getVisualPhase,
         getMetaballBlend, getClusterBlend, getBurstBlend,
         getMotionSpeed }                                              from './src/phase.js';
import { getUniformDefs as simDefs, initSimulation, stepSimulation, applyStateToMaterial as applySimState } from './src/simulation.js';
import { getUniformDefs as envDefs, initEnvMap, applyStateToMaterial as applyEnvState }       from './src/environment.js';
import { initCamera, updateCamera }                                   from './src/camera.js';
import { initInput,  updateInput  }                                   from './src/input.js';
import { initAudio,  updateAudio  }                                   from './src/audio.js';
import { mainVert, mainFrag }                                         from './shaders/raymarchShader.js';

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

// ── init ──────────────────────────────────────────────────────────────────────

initEnvMap(renderer);
initCamera(camera);
initInput();
initAudio();
initSimulation(renderer);

// ── animate ───────────────────────────────────────────────────────────────────

function animate() {
  tick();
  const t            = getTime();
  const logicalPhase = getLogicalPhase();
  const visualPhase  = getVisualPhase();

  stepSimulation(logicalPhase, visualPhase, t, getMotionSpeed());
  applySimState(material);
  applyEnvState(material, t);
  updateInput();
  updateCamera(camera, logicalPhase, t);
  updateAudio(logicalPhase, t);

  material.uniforms.time.value          = t;
  material.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
  material.uniforms.camPos.value.copy(camera.position);
  material.uniforms.visualPhase.value   = visualPhase;
  material.uniforms.metaballBlend.value = getMetaballBlend();
  material.uniforms.clusterBlend.value  = getClusterBlend();
  material.uniforms.burstBlend.value    = getBurstBlend();
  material.uniforms.motionSpeed.value   = getMotionSpeed();

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
