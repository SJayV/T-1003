import * as THREE from 'three';
import { scene, camera, renderer, controls } from './src/renderer.js';
import { tick, getTime, getPhase }           from './src/phase.js';
import { stepSimulation, applyBallUniforms } from './src/simulation.js';
import { initEnvMap, updateEnvMap, getEnvUniforms, fallbackEnvMap } from './src/envmap.js';
import { initCamera, updateCamera }          from './src/camera.js';
import { initAudio,  updateAudio  }          from './src/audio.js';
import { mainVert, mainFrag }                from './shaders/raymarchShader.js';

// ── material ──────────────────────────────────────────────────────────────────

const material = new THREE.ShaderMaterial({
  uniforms: {
    time:       { value: 0 },
    resolution: { value: new THREE.Vector2() },
    camPos:     { value: new THREE.Vector3() },
    p1:         { value: new THREE.Vector3() },
    p2:         { value: new THREE.Vector3() },
    p3:         { value: new THREE.Vector3() },
    p4:         { value: new THREE.Vector3() },
    p5:         { value: new THREE.Vector3() },
    p6:         { value: new THREE.Vector3() },
    p7:         { value: new THREE.Vector3() },
    p8:         { value: new THREE.Vector3() },
    p9:         { value: new THREE.Vector3() },
    p10:        { value: new THREE.Vector3() },
    p11:        { value: new THREE.Vector3() },
    p12:        { value: new THREE.Vector3() },
    phase:      { value: 0 },
    envMap:     { value: fallbackEnvMap },
    envMapNext: { value: fallbackEnvMap },
    envBlend:   { value: 0.0 },
    reflectAll: { value: 0.0 },
  },
  vertexShader:   mainVert,
  fragmentShader: mainFrag,
});

scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

// ── init ──────────────────────────────────────────────────────────────────────

initEnvMap();
initCamera(camera);
initAudio();

// ── animate ───────────────────────────────────────────────────────────────────

function animate() {
  tick();
  const t     = getTime();
  const phase = getPhase();

  stepSimulation(phase);
  applyBallUniforms(material.uniforms);

  updateEnvMap(phase, t);
  const { envMap, envMapNext, envBlend } = getEnvUniforms();
  material.uniforms.envMap.value     = envMap;
  material.uniforms.envMapNext.value = envMapNext;
  material.uniforms.envBlend.value   = envBlend;

  updateCamera(camera, phase, t);
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
