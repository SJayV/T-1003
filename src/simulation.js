import * as THREE from 'three';
import { balls } from './balls.js';

const BOUND_X = 1.8;
const BOUND_Y = 1.0;
const BOUND_Z = 0.5;

function reflectBounds(b) {
  if (b.x >  BOUND_X) { b.x =  BOUND_X; b.vx *= -0.9; }
  if (b.x < -BOUND_X) { b.x = -BOUND_X; b.vx *= -0.9; }
  if (b.y >  BOUND_Y) { b.y =  BOUND_Y; b.vy *= -0.9; }
  if (b.y < -BOUND_Y) { b.y = -BOUND_Y; b.vy *= -0.9; }
  if (b.z >  BOUND_Z) { b.z =  BOUND_Z; b.vz *= -0.9; }
  if (b.z < -BOUND_Z) { b.z = -BOUND_Z; b.vz *= -0.9; }
}

function centroid() {
  let cx = 0, cy = 0, cz = 0;
  for (const b of balls) { cx += b.x; cy += b.y; cz += b.z; }
  const n = balls.length;
  return { cx: cx / n, cy: cy / n, cz: cz / n };
}

function metaballPhase() {
  for (const b of balls) {
    b.vx += (Math.random() - 0.5) * 0.003;
    b.vy += (Math.random() - 0.5) * 0.003;
    b.vz += (Math.random() - 0.5) * 0.003;

    b.vx += -b.y * 0.00003;
    b.vy +=  b.x * 0.00003;

    b.vx += -b.x * 0.00003;
    b.vy += -b.y * 0.00003;
    b.vz += -b.z * 0.00003;

    b.x += b.vx; b.y += b.vy; b.z += b.vz;
    reflectBounds(b);

    b.vx *= 0.998; b.vy *= 0.998; b.vz *= 0.998;
  }
}

function clusterPhase() {
  const { cx, cy, cz } = centroid();
  for (const b of balls) {
    b.vx += (cx - b.x) * 0.00008 + (0 - b.x) * 0.00003;
    b.vy += (cy - b.y) * 0.00008 + (0 - b.y) * 0.00003;
    b.vz += (cz - b.z) * 0.00008 + (0 - b.z) * 0.00003;

    b.x += b.vx; b.y += b.vy; b.z += b.vz;
    reflectBounds(b);

    b.vx *= 0.995; b.vy *= 0.995; b.vz *= 0.995;
  }
}

function burstPhase() {
  const { cx, cy, cz } = centroid();
  for (const b of balls) {
    b.vx += (b.x - cx) * 0.006 + (Math.random() - 0.5) * 0.05;
    b.vy += (b.y - cy) * 0.006 + (Math.random() - 0.5) * 0.05;
    b.vz += (b.z - cz) * 0.006 + (Math.random() - 0.5) * 0.05;

    b.x += b.vx; b.y += b.vy; b.z += b.vz;
    reflectBounds(b);

    b.vx *= 0.90; b.vy *= 0.90; b.vz *= 0.90;
  }
}

export function stepSimulation(phase) {
  const phaseIdx = Math.ceil(phase);
  if      (phaseIdx === 0) metaballPhase();
  else if (phaseIdx === 1) clusterPhase();
  else                     burstPhase();
}

// Returns the uniform definitions this module needs — spread into ShaderMaterial uniforms.
// When switching to GPU simulation, only this function and applyStateToMaterial change;
// main.js and the material setup stay untouched.
export function getUniformDefs() {
  const defs = {};
  for (let i = 1; i <= 12; i++) defs[`p${i}`] = { value: new THREE.Vector3() };
  return defs;
}

export function applyStateToMaterial(material) {
  balls.forEach((b, i) => material.uniforms[`p${i + 1}`].value.set(b.x, b.y, b.z));
}
