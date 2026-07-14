import { FRAME_TIME_STEP } from './constants.js';


// ──── CONSTANTS ───────────────────────────────────────────────────────────


const LEAD = 3;

const CLUSTER_SIGMA  = 0.6;
const METABALL_SIGMA = 3.0;
const BURST_SIGMA    = 1.2;

const BURST_HOLD        = LEAD * BURST_SIGMA;
const METABALL_MIN_HOLD = 13.3;
const METABALL_SILENCE_HOLD = 1.2;

const METABALL_HANDOFF_LEAD = 0;

const CLUSTER_COOLDOWN = 0;

const MOTION_SPEED_DECAY = 0.97;

const S_CLUSTER  = 0;
const S_BURST    = 1;
const S_METABALL = 2;


// ──── MODULE STATE - SCHEDULER ───────────────────────────────────────────────────


let _state                   = S_CLUSTER;
let _lastBurstTrigger        = -Infinity;
let _metaballActivationStart = 0;
let _burstActivationStart    = 0;


// ──── MODULE STATE - BUMPS ────────────────────────────────────────────────────────


let _bumps = {
  cluster:  { mu: 0,         sigma: CLUSTER_SIGMA,  activated: true  },
  metaball: { mu: -Infinity, sigma: METABALL_SIGMA, activated: false },
  burst:    { mu: -Infinity, sigma: BURST_SIGMA,     activated: false },
};

function _activate(bump, t_now, lead = LEAD) {
  bump.mu        = t_now + lead * bump.sigma;
  bump.activated = true;
}


// ──── MOTION INPUT ───────────────────────────────────────────────────────────────


let _motionThisFrame = false;
let _motionSpeed     = 0;

export function reportMotion(speed) {
  _motionThisFrame = true;
  _motionSpeed      = Math.max(0, Math.min(1, speed));
}


// ──── PHASE TRANSITION LISTENERS ─────────────────────────────────────────────────


const _listeners = [];

export function onPhaseTransition(fn) {
  _listeners.push(fn);
}

function _fireTransition() {
  _listeners.forEach(fn => fn());
}


// ──── SCHEDULER ──────────────────────────────────────────────────────────────────


function _scheduleTick(t_now, motionDetected) {
  if (_state === S_CLUSTER) {
    if (motionDetected && (t_now - _lastBurstTrigger) > CLUSTER_COOLDOWN) {
      _burstActivationStart = t_now;
      _lastBurstTrigger = t_now;
      _activate(_bumps.burst, t_now);
      _state = S_BURST;
      _fireTransition();
    }
  } else if (_state === S_BURST) {
    if (t_now <= _burstActivationStart + BURST_HOLD) {
      _bumps.burst.mu = Math.max(_bumps.burst.mu, t_now);
    }
    if (t_now > _burstActivationStart + BURST_HOLD) {
      _metaballActivationStart = t_now;
      _activate(_bumps.metaball, t_now, METABALL_HANDOFF_LEAD);
      _state = S_METABALL;
      _fireTransition();
    }
  } else if (_state === S_METABALL) {
    if (t_now <= _metaballActivationStart + METABALL_MIN_HOLD || motionDetected) {
      _bumps.metaball.mu = Math.max(_bumps.metaball.mu, t_now);
    }
    const silenceDuration = t_now - _bumps.metaball.mu;
    if (t_now > _metaballActivationStart + METABALL_MIN_HOLD && silenceDuration > METABALL_SILENCE_HOLD) {
      _activate(_bumps.cluster, t_now);
      _state = S_CLUSTER;
      _fireTransition();
    }
  }

  if (_state === S_CLUSTER) {
    _bumps.cluster.mu = Math.max(_bumps.cluster.mu, t_now);
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
  const motionDetected = _motionThisFrame;
  _scheduleTick(t_now, motionDetected);
  _weights = _evaluateWeights(t_now, _bumps);

  if (!_motionThisFrame) _motionSpeed *= MOTION_SPEED_DECAY;
  _motionThisFrame = false;

  _t += FRAME_TIME_STEP;
}

export function getWeights() { return _weights; }

export function getMotionSpeed() { return _motionSpeed; }

let _t = 0;
export function getTime() { return _t; }
