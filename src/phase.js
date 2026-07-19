import { FRAME_TIME_STEP, CLUSTER_SHAPE_VARIANTS } from './constants.js';


// ──── CONSTANTS ───────────────────────────────────────────────────────────


const LEAD_BURST = 4;
const LEAD_METABALL = -2.0;

const SIGMA_CLUSTER = 0.6;
const SIGMA_METABALL = 6.0;
const SIGMA_BURST = 0.5;

const HOLD_BURST = LEAD_BURST * SIGMA_BURST;
const HOLD_METABALL = 10.0;
const SILENCE_METABALL = 3.2;

const MOTION_SPEED_DECAY = 0.97;

const STATE_CLUSTER = 0;
const STATE_BURST = 1;
const STATE_METABALL = 2;


// ──── INITIALIZATION ────────────────────────────────────────────


let _state = STATE_CLUSTER;
let _metaballActivationStart = 0;
let _burstActivationStart = 0;
let _bumps = {
  cluster: { mu: 0, sigma: SIGMA_CLUSTER, activated: true },
  metaball: { mu: -Infinity, sigma: SIGMA_METABALL, activated: false },
  burst: { mu: -Infinity, sigma: SIGMA_BURST, activated: false },
};


// ──── INPUT - GAZE & MOTION ─────────────────────────────────────────────────────


let _gazeThisFrame = false;
let _energyThisFrame = false;
let _motionSpeed = 0;

export function reportGazeDetected() {
  _gazeThisFrame = true;
}

export function reportMotionEnergy(speed) {
  _energyThisFrame = true;
  _motionSpeed = Math.max(0, Math.min(1, speed));
}

function _updateMotionSpeed() {
  if (!_energyThisFrame) _motionSpeed *= MOTION_SPEED_DECAY;
}

function _resetFrameInputs() {
  _gazeThisFrame = false;
  _energyThisFrame = false;
}


// ──── PHASE TRANSITION LISTENERS ─────────────────────────────────────────────────


const _listeners = [];

export function onPhaseTransition(listener) {
  _listeners.push(listener);
}

function _fireTransition(name) {
  _listeners.forEach(listener => listener(name));
}


// ──── SHAPES ──────────────────────────────────────────────────────────────────


let _shapeIndex = 0;

function _pickRandomShapeIndex() {
  return Math.floor(Math.random() * CLUSTER_SHAPE_VARIANTS.length);
}


// ──── DISPATCHER ─────────────────────────────────────────────────────────────────


function _activate(bump, currentTime, lead = LEAD_BURST) {
  bump.mu = currentTime + lead * bump.sigma;
  bump.activated = true;
}

function _metaballShouldExit(currentTime) {
  const silenceDuration = currentTime - _bumps.metaball.mu;
  return currentTime > _metaballActivationStart + HOLD_METABALL && silenceDuration > SILENCE_METABALL;
}

function _clusterShouldExit(gazeDetected) {
  return gazeDetected;
}

function _burstShouldExit(currentTime) {
  return currentTime > _burstActivationStart + HOLD_BURST;
}

function _metaballShouldHold(currentTime, gazeDetected) {
  return currentTime <= _metaballActivationStart + HOLD_METABALL || gazeDetected;
}

function _metaballStart(currentTime) {
  _metaballActivationStart = currentTime;
  _activate(_bumps.metaball, currentTime, LEAD_METABALL);
  _state = STATE_METABALL;
  _shapeIndex = _pickRandomShapeIndex();
  _fireTransition('metaball');
}

function _clusterStart(currentTime) {
  _activate(_bumps.cluster, currentTime);
  _state = STATE_CLUSTER;
  _fireTransition('cluster');
}

function _burstStart(currentTime) {
  _burstActivationStart = currentTime;
  _activate(_bumps.burst, currentTime);
  _state = STATE_BURST;
  _fireTransition('burst');
}

function _metaballHold(currentTime) {
  _bumps.metaball.mu = Math.max(_bumps.metaball.mu, currentTime);
}

function _clusterHold(currentTime) {
  _bumps.cluster.mu = Math.max(_bumps.cluster.mu, currentTime);
}

function _burstHold(currentTime) {
  _bumps.burst.mu = Math.max(_bumps.burst.mu, currentTime);
}


// ──── SCHEDULER ──────────────────────────────────────────────────────────────────


function _scheduleTick(currentTime, gazeDetected) {
  if (_state === STATE_METABALL) {
    _scheduleMetaball(currentTime, gazeDetected);
  } else if (_state === STATE_CLUSTER) {
    _scheduleCluster(currentTime, gazeDetected);
  } else if (_state === STATE_BURST) {
    _scheduleBurst(currentTime, gazeDetected);
  }
}

function _scheduleMetaball(currentTime, gazeDetected) {
  if (_metaballShouldHold(currentTime, gazeDetected)) {
    _metaballHold(currentTime);
  } else if (_metaballShouldExit(currentTime)) {
    _clusterStart(currentTime);
  }
}

function _scheduleCluster(currentTime, gazeDetected) {
  if (_clusterShouldExit(gazeDetected)) {
    _burstStart(currentTime);
  } else {
    _clusterHold(currentTime);
  }
}

function _scheduleBurst(currentTime, gazeDetected) {
  if (_burstShouldExit(currentTime)) {
    _metaballStart(currentTime);
  } else {
    _burstHold(currentTime);
  }
}


// ──── WEIGHT EVALUATION ──────────────────────────────────────────────────────────


function _evaluateWeight(bump, currentTime) {
  return bump.activated ? Math.exp(-((currentTime - bump.mu) ** 2) / (2 * bump.sigma * bump.sigma)) : 0;
}

function _evaluateWeights(currentTime, bumps) {
  const EPSILON = 1e-6;
  const raw = {};
  for (const key of ['cluster', 'metaball', 'burst']) {
    raw[key] = _evaluateWeight(bumps[key], currentTime);
  }
  const sum = raw.cluster + raw.metaball + raw.burst + EPSILON;
  return {
    clusterWeight: raw.cluster / sum,
    metaballWeight: raw.metaball / sum,
    burstWeight: raw.burst / sum,
  };
}


// ──── PUBLIC INTERFACE ───────────────────────────────────────────────────────────


let _weights = { clusterWeight: 1, metaballWeight: 0, burstWeight: 0 };

export function tick(currentTime) {
  const gazeDetected = _gazeThisFrame;
  _scheduleTick(currentTime, gazeDetected);
  _weights = _evaluateWeights(currentTime, _bumps);
  _updateMotionSpeed();
  _resetFrameInputs();

  _time += FRAME_TIME_STEP;
}

export function getWeights() { return _weights; }

export function getMotionSpeed() { return _motionSpeed; }

let _time = 0;
export function getTime() { return _time; }

export function getSimulationUniformDefinitions() {
  return {
    time: { value: 0 },
    metaballBlend: { value: 1 },
    clusterBlend: { value: 0 },
    burstBlend: { value: 0 },
    motionSpeed: { value: 0 },
  };
}

export function getUniformDefinitions() {
  return {
    ...getSimulationUniformDefinitions(),
    clusterShapeIndex: { value: 0 },
  };
}

export function applySimulationState(material) {
  const { clusterWeight, metaballWeight, burstWeight } = getWeights();
  material.uniforms.time.value = getTime();
  material.uniforms.metaballBlend.value = metaballWeight;
  material.uniforms.clusterBlend.value = clusterWeight;
  material.uniforms.burstBlend.value = burstWeight;
  material.uniforms.motionSpeed.value = getMotionSpeed();
}

export function applyStateToMaterial(material) {
  applySimulationState(material);
  material.uniforms.clusterShapeIndex.value = _shapeIndex;
}