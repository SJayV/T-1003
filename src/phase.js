import { FRAME_TIME_STEP } from './constants.js';

// LEAD*sigma is the ramp-up time from "just triggered" (raw~0.011) to "fully weighted" (raw~1)
// for any bump -- LEAD=3 balances a visibly gradual onset against dragging the ramp out.
const LEAD = 3;

const CLUSTER_SIGMA  = 0.6;    // seconds; Cluster's own bump width (rise on entry, decay once left)
// Wide -- METABALL_HANDOFF_LEAD=0 (below) already pins the Burst->Metaball crossing to an exact
// peak-to-peak 50/50 regardless of sigma, so widening this doesn't move that crossing point,
// only how gradually Metaball's own weight decays into Cluster once it starts leaving.
const METABALL_SIGMA = 3.0;
// Wide -- Burst's own decay tail stretches well into Metaball's rise instead of handing off
// quickly, giving the two time to visibly coexist rather than snapping over.
const BURST_SIGMA    = 1.2;

// BURST_HOLD is derived, not tuned directly: it must be >= LEAD*BURST_SIGMA so Burst's bump
// has genuinely finished ramping (raw==1, not partway) by the moment hold ends. Combined with
// METABALL_HANDOFF_LEAD=0 below, that makes the Burst->Metaball handoff a real peak-to-peak
// crossing -- raw_burst==raw_metaball==1, an exact 50/50 split -- rather than an approximation.
// Fixed, not motion-speed-scaled: the previous speed-interpolated span was barely noticeable
// and made the bump harder to tune for no visible benefit.
const BURST_HOLD        = LEAD * BURST_SIGMA;
const METABALL_MIN_HOLD = 13.3;   // seconds; from old METABALL_MIN_FRAMES=800 @ ~60fps
const METABALL_SILENCE_HOLD = 1.2; // seconds of continuous no-motion (post min-hold) before leaving

// Metaball's activation lead when taking over from Burst is 0, not LEAD: its mu lands exactly at
// the handoff instant, so raw_metaball starts at 1 (not the usual ~1% floor) precisely when
// raw_burst is also still 1. From there Metaball's mu keeps tracking t_now (staying at raw==1)
// while Burst's is frozen and decaying -- the weight ratio shifts from 50/50 toward Metaball
// purely as a function of Burst's own decay, with no jump anywhere.
const METABALL_HANDOFF_LEAD = 0;

const CLUSTER_COOLDOWN = 0;    // seconds; no lockout for now -- the check lives inside _scheduleTick
                                // (the only place _state is touched), so reinstating one later is a
                                // one-constant change

const MOTION_SPEED_DECAY = 0.97;   // exponential decay of motionSpeed per tick() call when silent

const S_CLUSTER  = 0;
const S_BURST    = 1;
const S_METABALL = 2;

// ── State A: scheduler-only. Read/written exclusively inside _scheduleTick. ────
let _state                   = S_CLUSTER;
let _lastBurstTrigger        = -Infinity;
let _metaballActivationStart = 0;
let _burstActivationStart    = 0;

// ── State B: bumps. Written by _scheduleTick, read-only in _evaluateWeights. ──
let _bumps = {
  cluster:  { mu: 0,         sigma: CLUSTER_SIGMA,  activated: true  },
  metaball: { mu: -Infinity, sigma: METABALL_SIGMA, activated: false },
  burst:    { mu: -Infinity, sigma: BURST_SIGMA,     activated: false },
};

function _activate(bump, t_now, lead = LEAD) {
  bump.mu        = t_now + lead * bump.sigma;
  bump.activated = true;
}

let _motionThisFrame = false;
let _motionSpeed     = 0;

// From input.js: sets the flags _scheduleTick consumes (and resets) on the next tick().
export function reportMotion(speed) {
  _motionThisFrame = true;
  _motionSpeed      = Math.max(0, Math.min(1, speed));
}

const _listeners = [];

export function onPhaseTransition(fn) {
  _listeners.push(fn);
}

function _fireTransition() {
  _listeners.forEach(fn => fn());
}

// Schedules bump activations from the current regime. This is the ONLY function in this
// file that reads or writes _state -- everything downstream only ever sees _bumps.
//
// Each regime activates the next the INSTANT its own hold ends, never after an extra
// "let it decay first" delay -- otherwise the incoming bump only competes against an
// already-decayed outgoing one and the crossfade collapses into a snap rather than a blend.
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
    } // else: frozen, decay begins
    if (t_now > _burstActivationStart + BURST_HOLD) {
      _metaballActivationStart = t_now;
      _activate(_bumps.metaball, t_now, METABALL_HANDOFF_LEAD);
      _state = S_METABALL;
      _fireTransition();
    }
  } else if (_state === S_METABALL) {
    if (t_now <= _metaballActivationStart + METABALL_MIN_HOLD || motionDetected) {
      _bumps.metaball.mu = Math.max(_bumps.metaball.mu, t_now);
    } // else: frozen -- _bumps.metaball.mu now doubles as "time silence began"
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

// Pure: takes only (t_now, bumps) -- _state is not a parameter and is therefore
// structurally unreachable here. No consumer of getWeights() can ever see regime identity.
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
