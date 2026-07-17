import { getWeights, onPhaseTransition } from './phase.js';

// ──── CONSTANTS ───────────────────────────────────────────────────────────────────


const MASTER_GAIN = 0.35;

const SOUNDS_URL    = './resources/sounds';
const CLUSTER_FILE  = 'cluster.mp3';
const METABALL_FILE = 'metaball.mp3';
const BURST_FILE    = 'burst.mp3';

const GAIN_SMOOTHING_TIME_CONSTANT = 0.15;


// ──── INITIALIZATION ────────────────────────────────────────────────────────────────


let _ctx           = null;
let _masterGain     = null;
let _clusterGain   = null;
let _metaballGain  = null;
let _clusterSource  = null;
let _metaballSource = null;
let _burstBuffer    = null;

async function _loadBuffer(ctx, filename) {
  const response   = await fetch(`${SOUNDS_URL}/${filename}`);
  const arrayBuffer = await response.arrayBuffer();
  return ctx.decodeAudioData(arrayBuffer);
}

function _startLoop(ctx, buffer, destination) {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop   = true;
  source.connect(destination);
  source.start();
  return source;
}

export async function initializeAudio() {
  _ctx = new AudioContext();

  _masterGain = _ctx.createGain();
  _masterGain.gain.value = MASTER_GAIN;
  _masterGain.connect(_ctx.destination);

  _clusterGain = _ctx.createGain();
  _clusterGain.gain.value = 1;
  _clusterGain.connect(_masterGain);

  _metaballGain = _ctx.createGain();
  _metaballGain.gain.value = 0;
  _metaballGain.connect(_masterGain);

  onPhaseTransition(name => { if (name === 'burst') _triggerBurstSound(); });

  const [clusterBuffer, metaballBuffer, burstBuffer] = await Promise.all([
    _loadBuffer(_ctx, CLUSTER_FILE),
    _loadBuffer(_ctx, METABALL_FILE),
    _loadBuffer(_ctx, BURST_FILE),
  ]);

  _burstBuffer = burstBuffer;
  _clusterSource  = _startLoop(_ctx, clusterBuffer, _clusterGain);
  _metaballSource = _startLoop(_ctx, metaballBuffer, _metaballGain);
}


// ──── PUBLIC INTERFACE ────────────────────────────────────────────────────────────


export function updateAudio() {
  if (!_ctx || !_clusterSource || !_metaballSource) return;

  const weights = getWeights();
  const now      = _ctx.currentTime;

  _clusterGain.gain.setTargetAtTime(weights.clusterWeight, now, GAIN_SMOOTHING_TIME_CONSTANT);
  _metaballGain.gain.setTargetAtTime(weights.metaballWeight + weights.burstWeight, now, GAIN_SMOOTHING_TIME_CONSTANT);
}


// ──── BURST SOUND ─────────────────────────────────────────────────────────────────


function _triggerBurstSound() {
  if (!_ctx || !_burstBuffer) return;

  const source = _ctx.createBufferSource();
  source.buffer = _burstBuffer;
  source.connect(_masterGain);
  source.start();
}
