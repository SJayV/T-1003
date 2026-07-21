import { getWeights, onPhaseTransition } from './phase.js';


// ──── CONSTANTS ───────────────────────────────────────────────────────────────────


const SOUNDS_URL = './resources/sounds';
const CLUSTER_FILE = 'cluster.mp3';
const METABALL_FILE = 'metaball.mp3';
const BURST_FILE = 'burst.mp3';
const BURST_SIGNAL_FILE = 'burstSound.mp3';

const MASTER_GAIN = 0.35;
const GAIN_SMOOTHING_TIME_CONSTANT = 0.15;

const CLUSTER_VOLUME = 3.0;


// ──── INITIALIZATION ────────────────────────────────────────────────────────────────


let _audioContext = null;
let _masterGain = null;
let _clusterGain = null;
let _metaballGain = null;
let _burstGain = null;
let _burstSignalBuffer = null;
let _ready = false;

export async function initializeAudio() {
  _makeAudioContext();
  _makeGains();
  _registerBurstSignalListener();

  const [clusterBuffer, metaballBuffer, burstBuffer, burstSignalBuffer] = await _loadBuffers();

  _burstSignalBuffer = burstSignalBuffer;
  _startLoops(clusterBuffer, metaballBuffer, burstBuffer);

  _ready = true;
}

function _makeAudioContext() {
  _audioContext = new AudioContext();
}

function _makeGains() {
  _masterGain = _makeGain(_audioContext.destination, MASTER_GAIN);
  _clusterGain = _makeGain(_masterGain, 1);
  _metaballGain = _makeGain(_masterGain, 0);
  _burstGain = _makeGain(_masterGain, 0);
}

function _registerBurstSignalListener() {
  onPhaseTransition(name => { if (name === 'burst') _triggerBurstSignal(); });
}

function _loadBuffers() {
  return Promise.all([
    _loadBuffer(_audioContext, CLUSTER_FILE),
    _loadBuffer(_audioContext, METABALL_FILE),
    _loadBuffer(_audioContext, BURST_FILE),
    _loadBuffer(_audioContext, BURST_SIGNAL_FILE)
  ]);
}

function _startLoops(clusterBuffer, metaballBuffer, burstBuffer) {
  _startLoop(_audioContext, clusterBuffer, _clusterGain);
  _startLoop(_audioContext, metaballBuffer, _metaballGain);
  _startLoop(_audioContext, burstBuffer, _burstGain);
}


// ──── HELPER FUNCTIONS - SETUP ─────────────────────────────────────────────────────────────


async function _loadBuffer(audioContext, filename) {
  const response = await fetch(`${SOUNDS_URL}/${filename}`);
  const arrayBuffer = await response.arrayBuffer();
  return audioContext.decodeAudioData(arrayBuffer);
}

function _playBuffer(audioContext, buffer, destination, loop = false) {
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.loop = loop;
  source.connect(destination);
  source.start();
  return source;
}

function _startLoop(audioContext, buffer, destination) {
  return _playBuffer(audioContext, buffer, destination, true);
}

function _makeGain(destination, initialValue) {
  const gain = _audioContext.createGain();
  gain.gain.value = initialValue;
  gain.connect(destination);
  return gain;
}


// ──── HELPER FUNCTIONS - RUNTIME STATE ─────────────────────────────────────────────


function _audioIsNotReady() {
  return !_ready;
}

function _getTime() {
  return _audioContext.currentTime;
}


// ──── HELPER FUNCTIONS - GAIN UPDATE ─────────────────────────────────────────────────────────────────


function _setGain(gain, value, time) {
  gain.gain.setTargetAtTime(value, time, GAIN_SMOOTHING_TIME_CONSTANT);
}

function _applyGainWeights(weights, time) {
  _setGain(_clusterGain, CLUSTER_VOLUME * weights.clusterWeight, time);
  _setGain(_metaballGain, weights.metaballWeight, time);
  _setGain(_burstGain, weights.burstWeight, time);
}


// ──── PUBLIC INTERFACE ────────────────────────────────────────────────────────────


export function updateAudio() {
  if (_audioIsNotReady()) return;
  _applyGainWeights(getWeights(), _getTime());
}


// ──── BURST SIGNAL ────────────────────────────────────────────────────────────────


function _triggerBurstSignal() {
  if (_audioIsNotReady()) return;
  _playBuffer(_audioContext, _burstSignalBuffer, _masterGain);
}