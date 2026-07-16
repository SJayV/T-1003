import { getWeights, getMotionSpeed, onPhaseTransition } from './phase.js';

// ──── CONSTANTS ───────────────────────────────────────────────────────────────────


const MASTER_GAIN = 0.35;
const DRONE_GAIN   = 1.2;

const DRONE_OSCILLATOR_TYPE = 'triangle';
const FREQ_SMOOTHING_TIME_CONSTANT = 0.15;

const F_CLUSTER  = 70;
const F_METABALL_BASE            = 140;
const F_METABALL_SPREAD_OCTAVES  = 1.5;
const F_BURST_BASE               = 150;
const F_BURST_SPREAD_OCTAVES     = 1.0;

const BREATH_RATE_CLUSTER          = 0.25;
const BREATH_DEPTH_CLUSTER_OCTAVES = 0.03;
const BREATH_RATE_METABALL          = 0.4;
const BREATH_DEPTH_METABALL_OCTAVES = 0.04;

const BURST_PING_OSCILLATOR_TYPE = 'triangle';
const BURST_PING_FREQUENCY       = 520;
const BURST_PING_FREQUENCY_END   = 120;
const BURST_PING_GAIN            = 0.8;
const BURST_PING_ATTACK_TIME     = 0.005;
const BURST_PING_DECAY_TIME      = 7.2;


// ──── INITIALIZATION ────────────────────────────────────────────────────────────────


let _ctx        = null;
let _masterGain = null;
let _droneOsc   = null;
let _droneGain  = null;

export function initializeAudio() {
  _ctx = new AudioContext();

  _masterGain = _ctx.createGain();
  _masterGain.gain.value = MASTER_GAIN;
  _masterGain.connect(_ctx.destination);

  _droneGain = _ctx.createGain();
  _droneGain.gain.value = DRONE_GAIN;
  _droneGain.connect(_masterGain);

  _droneOsc = _ctx.createOscillator();
  _droneOsc.type = DRONE_OSCILLATOR_TYPE;
  _droneOsc.frequency.value = F_CLUSTER;
  _droneOsc.connect(_droneGain);
  _droneOsc.start();

  onPhaseTransition(name => { if (name === 'burst') _triggerBurstSound(); });
}


// ──── PUBLIC INTERFACE ────────────────────────────────────────────────────────────


export function updateAudio() {
  if (!_ctx) return;

  const weights     = getWeights();
  const motionSpeed = getMotionSpeed();
  const now         = _ctx.currentTime;

  const pulseOctaves = _blendPulse(weights, now);
  const targetFreq   = _blendFrequency(weights, motionSpeed) * Math.pow(2, pulseOctaves);
  _droneOsc.frequency.setTargetAtTime(targetFreq, now, FREQ_SMOOTHING_TIME_CONSTANT);
}


// ──── BURST SOUND ─────────────────────────────────────────────────────────────────


function _triggerBurstSound() {
  if (!_ctx) return;

  const now = _ctx.currentTime;

  const ping = _ctx.createOscillator();
  ping.type = BURST_PING_OSCILLATOR_TYPE;
  ping.frequency.setValueAtTime(BURST_PING_FREQUENCY, now);
  ping.frequency.exponentialRampToValueAtTime(BURST_PING_FREQUENCY_END, now + BURST_PING_DECAY_TIME);

  const envelope = _ctx.createGain();
  envelope.gain.setValueAtTime(0, now);
  envelope.gain.linearRampToValueAtTime(BURST_PING_GAIN, now + BURST_PING_ATTACK_TIME);
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + BURST_PING_ATTACK_TIME + BURST_PING_DECAY_TIME);

  ping.connect(envelope);
  envelope.connect(_masterGain);

  ping.start(now);
  ping.stop(now + BURST_PING_ATTACK_TIME + BURST_PING_DECAY_TIME + 0.05);
}


// ──── WEIGHTED BLENDING ───────────────────────────────────────────────────────────


function _blendFrequency(weights, motionSpeed) {
  const metaballFreq = F_METABALL_BASE * Math.pow(2, motionSpeed * F_METABALL_SPREAD_OCTAVES);
  const burstFreq    = F_BURST_BASE    * Math.pow(2, motionSpeed * F_BURST_SPREAD_OCTAVES);

  return weights.clusterWeight  * F_CLUSTER
       + weights.metaballWeight * metaballFreq
       + weights.burstWeight    * burstFreq;
}

function _blendPulse(weights, t) {
  return weights.clusterWeight  * BREATH_DEPTH_CLUSTER_OCTAVES  * Math.sin(2 * Math.PI * BREATH_RATE_CLUSTER  * t)
       + weights.metaballWeight * BREATH_DEPTH_METABALL_OCTAVES * Math.sin(2 * Math.PI * BREATH_RATE_METABALL * t);
}
