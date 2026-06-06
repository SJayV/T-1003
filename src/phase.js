// ── FSM constants ─────────────────────────────────────────────────────────────

const BURST_MIN_FRAMES          = 18;   // 0.3 s  — minimum burst duration
const BURST_MAX_FRAMES          = 60;   // 1.0 s  — maximum burst duration (random)
const METABALL_MIN_FRAMES       = 800;  // 12.0 s  — stays in Metaball regardless of input
const METABALL_NO_MOTION_FRAMES = 360;  // 6.0 s  — silence → return to Cluster
const CLUSTER_COOLDOWN_FRAMES   = 180;  // 3.0 s  — after Burst before next allowed

// ── state machine ─────────────────────────────────────────────────────────────

const S_CLUSTER  = 0;
const S_BURST    = 1;
const S_METABALL = 2;

let _state          = S_CLUSTER;
let _stateFrames    = 0;
let _noMotionFrames = 0;
let _cooldownFrames = 0;
let _burstDuration  = BURST_MIN_FRAMES;
let _burstIntensity = 0;
let _motionThisFrame = false;

function _enterState(s) {
  _state       = s;
  _stateFrames = 0;
  if (s === S_METABALL) _noMotionFrames = 0;
}

// Called by input.js when motion is detected.
// In Cluster (+ cooldown elapsed): triggers Burst → Metaball.
// In Metaball: resets the no-motion timer, extending stay.
export function reportMotion(speed) {
  _motionThisFrame = true;
  _motionSpeed     = Math.max(0, Math.min(1, speed));
  if (_state === S_CLUSTER && _cooldownFrames <= 0 && _visualPhase > 0.65) {
    _burstIntensity = _motionSpeed;
    _burstDuration  = BURST_MIN_FRAMES
      + Math.floor(Math.random() * (BURST_MAX_FRAMES - BURST_MIN_FRAMES + 1));
    _enterState(S_BURST);
  }
}

// ── time ──────────────────────────────────────────────────────────────────────

let _t = 0;
export function getTime() { return _t; }

// ── logical phase ─────────────────────────────────────────────────────────────

export function getLogicalPhase() {
  if (_state === S_METABALL) return 0.0;
  if (_state === S_BURST)    return 1.0 + _burstIntensity;
  return 1.0;  // S_CLUSTER — full clusterBlend at convergence
}

// ── visual phase & blend weights ──────────────────────────────────────────────

let _visualPhase   = 1.0;   // start in cluster visual state
let _metaballBlend = 0;
let _clusterBlend  = 1;
let _burstBlend    = 0;
let _motionSpeed   = 0;    // current detected motion speed, decays when no motion

function _ss(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function _updateVisualPhase() {
  const target = getLogicalPhase();
  // Burst arrives faster (energetic); Metaball and Cluster transitions are slow.
  const rate = target > 1.05 ? 0.025 : 0.012;
  _visualPhase += (target - _visualPhase) * rate;
}

function _updateBlends() {
  const v = _visualPhase;
  const l = getLogicalPhase();
  _clusterBlend  = _ss(0.25, 0.75, v) * (1 - _ss(1.0, 1.5, v)) * _ss(0.0, 0.15, l);
  _burstBlend    = _ss(1.0, 1.5, v);
  _metaballBlend = Math.max(0, 1 - _clusterBlend - _burstBlend);
}

export function getVisualPhase()   { return _visualPhase; }
export function getMetaballBlend() { return _metaballBlend; }
export function getMotionSpeed()   { return _motionSpeed; }
export function getClusterBlend()  { return _clusterBlend; }
export function getBurstBlend()    { return _burstBlend; }

// ── phase transition events ───────────────────────────────────────────────────

const _listeners = [];
let   _prevSlot  = 0;

function _checkSlot(logicalPhase) {
  const slot = Math.ceil(logicalPhase);
  if (slot !== _prevSlot) {
    _prevSlot = slot;
    _listeners.forEach(fn => fn(logicalPhase));
  }
}

export function onPhaseTransition(fn) {
  _listeners.push(fn);
}

// ── tick ──────────────────────────────────────────────────────────────────────

export function tick() {
  _t += 0.004;
  _stateFrames++;
  if (_cooldownFrames > 0) _cooldownFrames--;

  if (_state === S_BURST) {
    if (_stateFrames >= _burstDuration) {
      _cooldownFrames = CLUSTER_COOLDOWN_FRAMES;
      _enterState(S_METABALL);
    }
  } else if (_state === S_METABALL) {
    if (_motionThisFrame) {
      _noMotionFrames = 0;
    } else {
      _noMotionFrames++;
    }
    if (_stateFrames >= METABALL_MIN_FRAMES && _noMotionFrames >= METABALL_NO_MOTION_FRAMES) {
      _enterState(S_CLUSTER);
    }
  }

  if (!_motionThisFrame) _motionSpeed *= 0.97;  // exponential decay when silent
  _motionThisFrame = false;
  _updateVisualPhase();
  _updateBlends();
  _checkSlot(getLogicalPhase());
}
