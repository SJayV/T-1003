import { FRAME_TIME_STEP, CLUSTER_SHAPE_VARIANTS } from './constants.js';


// ──── CONSTANTS ───────────────────────────────────────────────────────────


const LEAD_BURST = 3;
const LEAD_METABALL = -2.0;

const SIGMA_CLUSTER  = 0.6;
const SIGMA_METABALL = 4.5;
const SIGMA_BURST    = 0.5;

const HOLD_BURST = LEAD_BURST * SIGMA_BURST;
const HOLD_METABALL = 15.0;
const SILENCE_METABALL = 3.2;

const CLUSTER_COOLDOWN = 0;

const MOTION_SPEED_DECAY = 0.97;

const S_CLUSTER  = 0;
const S_BURST    = 1;
const S_METABALL = 2;


// ──── INITIALIZATION ────────────────────────────────────────────


let _state                   = S_CLUSTER;
let _lastBurstTrigger        = -Infinity;
let _metaballActivationStart = 0;
let _burstActivationStart    = 0;
let _bumps = {
  cluster:  { mu: 0,         sigma: SIGMA_CLUSTER,  activated: true  },
  metaball: { mu: -Infinity, sigma: SIGMA_METABALL, activated: false },
  burst:    { mu: -Infinity, sigma: SIGMA_BURST,     activated: false },
};


// ──── GAZE & MOTION INPUT ─────────────────────────────────────────────────────────


let _gazeThisFrame   = false;
let _energyThisFrame = false;
let _motionSpeed     = 0;

export function reportGazeDetected() {
  _gazeThisFrame = true;
}

export function reportMotionEnergy(speed) {
  _energyThisFrame = true;
  _motionSpeed      = Math.max(0, Math.min(1, speed));
}


// ──── PHASE TRANSITION LISTENERS ─────────────────────────────────────────────────


const _listeners = [];

export function onPhaseTransition(fn) {
  _listeners.push(fn);
}

function _fireTransition(name) {
  _listeners.forEach(fn => fn(name));
}


// ──── SHAPES ──────────────────────────────────────────────────────────────────


let _shapeIndex = 0;

function _pickRandomShapeIndex() {
  return Math.floor(Math.random() * CLUSTER_SHAPE_VARIANTS.length);
}

export function getShapeVariant() {
  return CLUSTER_SHAPE_VARIANTS[_shapeIndex];
}

export function getShapeIndex() {
  return _shapeIndex;
}


// ──── DISPATCHER ─────────────────────────────────────────────────────────────────


function _activate(bump, t_now, lead = LEAD_BURST) {
  bump.mu        = t_now + lead * bump.sigma;
  bump.activated = true;
}

function _metaballShouldExit(t_now) {
  const silenceDuration = t_now - _bumps.metaball.mu;
  return t_now > _metaballActivationStart + HOLD_METABALL && silenceDuration > SILENCE_METABALL;
}

function _clusterShouldExit(t_now, gazeDetected) {
  return gazeDetected && (t_now - _lastBurstTrigger) > CLUSTER_COOLDOWN;
}

function _burstShouldExit(t_now) {
  return t_now > _burstActivationStart + HOLD_BURST;
}

function _metaballShouldHold(t_now, gazeDetected) {
  return t_now <= _metaballActivationStart + HOLD_METABALL || gazeDetected;
}

function _clusterStart(t_now) {
  _activate(_bumps.cluster, t_now);
  _state = S_CLUSTER;
  _fireTransition('cluster');
}

function _metaballStart(t_now) {
  _metaballActivationStart = t_now;
  _activate(_bumps.metaball, t_now, LEAD_METABALL);
  _state = S_METABALL;
  _shapeIndex = _pickRandomShapeIndex();
  _fireTransition('metaball');
}

function _burstStart(t_now) {
  _burstActivationStart = t_now;
  _lastBurstTrigger = t_now;
  _activate(_bumps.burst, t_now);
  _state = S_BURST;
  _fireTransition('burst');
}

function _metaballHold(t_now) {
  _bumps.metaball.mu = Math.max(_bumps.metaball.mu, t_now);
}

function _clusterHold(t_now) {
  _bumps.cluster.mu = Math.max(_bumps.cluster.mu, t_now);
}

function _burstHold(t_now) {
  _bumps.burst.mu = Math.max(_bumps.burst.mu, t_now);
}


// ──── SCHEDULER ──────────────────────────────────────────────────────────────────


function _scheduleTick(t_now, gazeDetected) {
  if (_state === S_CLUSTER) {
    if (_clusterShouldExit(t_now, gazeDetected)) {
      _burstStart(t_now);
    } else {
      _clusterHold(t_now);
    }
  } else if (_state === S_BURST) {
    if (_burstShouldExit(t_now)) {
      _metaballStart(t_now);
    }
    else {
      _burstHold(t_now);
    }
  } else if (_state === S_METABALL) {
    if (_metaballShouldHold(t_now, gazeDetected)) {
      _metaballHold(t_now);
    }
    if (_metaballShouldExit(t_now)) {
      _clusterStart(t_now);
    }
  }
}


// ──── WEIGHT EVALUATION ──────────────────────────────────────────────────────────


function _evaluateWeights(t_now, bumps) {
  const EPS = 1e-6;
  const raw = {};
  for (const key of ['cluster', 'metaball', 'burst']) {
    const b = bumps[key];
    raw[key] = b.activated ? Math.exp(-((t_now - b.mu) ** 2) / (2 * b.sigma * b.sigma)) : 0;
  }
  const sum = raw.cluster + raw.metaball + raw.burst + EPS;
  return {
    clusterWeight:  raw.cluster  / sum,
    metaballWeight: raw.metaball / sum,
    burstWeight:    raw.burst    / sum,
  };
}


// ──── PUBLIC INTERFACE ───────────────────────────────────────────────────────────


let _weights = { clusterWeight: 1, metaballWeight: 0, burstWeight: 0 };

export function tick(t_now) {
  const gazeDetected = _gazeThisFrame;
  _scheduleTick(t_now, gazeDetected);
  _weights = _evaluateWeights(t_now, _bumps);

  if (!_energyThisFrame) _motionSpeed *= MOTION_SPEED_DECAY;
  _gazeThisFrame   = false;
  _energyThisFrame = false;

  _t += FRAME_TIME_STEP;
}

export function getWeights() { return _weights; }

export function getMotionSpeed() { return _motionSpeed; }

let _t = 0;
export function getTime() { return _t; }
