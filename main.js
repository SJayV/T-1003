import * as THREE from 'three';
import { scene, camera, renderer, controls }                          from './src/renderer.js';
import { tick, getTime, getPhase }                                    from './src/phase.js';
import { getUniformDefs as simDefs, initSimulation, stepSimulation, applyStateToMaterial as applySimState } from './src/simulation.js';
import { getUniformDefs as envDefs, initEnvMap, applyStateToMaterial as applyEnvState }       from './src/environment.js';
import { initCamera, updateCamera }                                   from './src/camera.js';
import { initAudio,  updateAudio  }                                   from './src/audio.js';
import { mainVert, mainFrag }                                         from './shaders/raymarchShader.js';

// ── material ──────────────────────────────────────────────────────────────────
// Uniforms owned by each module are spread in via getUniformDefs().

const material = new THREE.ShaderMaterial({
  uniforms: {
    time:       { value: 0 },
    resolution: { value: new THREE.Vector2() },
    camPos:     { value: new THREE.Vector3() },
    phase:      { value: 0 },
    reflectAll: { value: 0.0 },
    ...simDefs(),
    ...envDefs(),
  },
  vertexShader:   mainVert,
  fragmentShader: mainFrag,
});

scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

// ── init ──────────────────────────────────────────────────────────────────────

initEnvMap(renderer);
initCamera(camera, controls);
initAudio();
initSimulation(renderer);

// ── animate ───────────────────────────────────────────────────────────────────

function animate() {
  tick();
  const t     = getTime();
  const phase = getPhase();

  stepSimulation(phase, t);
  applySimState(material);
  applyEnvState(material, phase, t);
  updateCamera(camera, controls, phase, t);
  updateAudio(phase, t);

  material.uniforms.time.value = t;
  material.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
  material.uniforms.camPos.value.copy(camera.position);
  material.uniforms.phase.value = phase;

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

// ── mode toggle ───────────────────────────────────────────────────────────────

document.getElementById('modeBtn').addEventListener('click', () => {
  const next = material.uniforms.reflectAll.value < 0.5;
  material.uniforms.reflectAll.value = next ? 1.0 : 0.0;
  document.getElementById('modeBtn').textContent = next ? 'Mode: Reflect All' : 'Mode: Phase';
});
