import { getWeights, getPulse, onPhaseTransition } from './phase.js';


// ──── CONSTANTS ────────────────────────────────────────────────────────────


const SOUNDS_URL = './resources/sounds';
const METABALL_FILE = 'metaball.mp3';
const BURST_FILE = 'burst.mp3';
const BURST_SIGNAL_FILE = 'burstSound.mp3';

const MASTER_GAIN = 0.35;
const GAIN_SMOOTHING_TIME_CONSTANT = 0.15;

const CLUSTER_VOLUME = 8.0;

const HEARTBEAT_NOISE_BUFFER_DURATION = 2.0;
const HEARTBEAT_LOWPASS_FREQUENCY = 120;
const HEARTBEAT_ENVELOPE_SMOOTHING_TIME_CONSTANT = 0.03;
const HEARTBEAT_VOLUME = 40.0;


// ──── INITIALIZATION ───────────────────────────────────────────────────────


let _audioContext = null;
let _masterGain = null;
let _clusterGain = null;
let _metaballGain = null;
let _burstGain = null;
let _heartbeatEnvelopeGain = null;
let _burstSignalBuffer = null;
let _ready = false;

function _initializeAudioContext() {
  try {
    _audioContext = new AudioContext();
  } catch (error) {
    console.warn('[audio] AudioContext unavailable:', error);
    return;
  }
  _audioContext.resume();
  _unlockAudioContextOnGesture();
}

function _unlockAudioContextOnGesture() {
  const resume = () => {
    _audioContext.resume();
    window.removeEventListener('pointerdown', resume);
    window.removeEventListener('keydown', resume);
  };
  window.addEventListener('pointerdown', resume);
  window.addEventListener('keydown', resume);
}

function _initializeGains() {
  _masterGain = _initializeGain(_audioContext.destination, MASTER_GAIN);
  _clusterGain = _initializeGain(_masterGain, 1);
  _metaballGain = _initializeGain(_masterGain, 0);
  _burstGain = _initializeGain(_masterGain, 0);
}

function _fireBurstSound() {
  if (_audioIsNotReady()) return;
  _playBuffer(_audioContext, _burstSignalBuffer, _masterGain);
}

function _registerBurstSignalListener() {
  onPhaseTransition(name => { if (name === 'burst') _fireBurstSound(); });
}

function _loadBuffers() {
  return Promise.all([
    _loadBuffer(_audioContext, METABALL_FILE),
    _loadBuffer(_audioContext, BURST_FILE),
    _loadBuffer(_audioContext, BURST_SIGNAL_FILE)
  ]);
}

function _startLoops(metaballBuffer, burstBuffer) {
  _startLoop(_audioContext, metaballBuffer, _metaballGain);
  _startLoop(_audioContext, burstBuffer, _burstGain);
}

export async function initializeAudio() {
  _initializeAudioContext();
  if (_audioContextIsNotReady()) return;
  _initializeGains();
  _registerBurstSignalListener();
  _initializeHeartbeat(_audioContext, _clusterGain);

  const [metaballBuffer, burstBuffer, burstSignalBuffer] = await _loadBuffers();

  _burstSignalBuffer = burstSignalBuffer;
  _startLoops(metaballBuffer, burstBuffer);

  _ready = true;
}


// ──── HELPER FUNCTIONS - SETUP ─────────────────────────────────────────────


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

function _initializeGain(destination, initialValue) {
  const gain = _audioContext.createGain();
  gain.gain.value = initialValue;
  gain.connect(destination);
  return gain;
}


// ──── HELPER FUNCTIONS - SYNTHETIC HEARTBEAT ───────────────────────────────


function _createNoiseBuffer(audioContext) {
  const buffer = audioContext.createBuffer(1, audioContext.sampleRate * HEARTBEAT_NOISE_BUFFER_DURATION, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let sampleIndex = 0; sampleIndex < data.length; sampleIndex++) {
    data[sampleIndex] = Math.random() * 2 - 1;
  }
  return buffer;
}

function _initializeLowpassFilter(audioContext) {
  const lowpassFilter = audioContext.createBiquadFilter();
  lowpassFilter.type = 'lowpass';
  lowpassFilter.frequency.value = HEARTBEAT_LOWPASS_FREQUENCY;
  return lowpassFilter;
}

function _initializeHeartbeat(audioContext, destination) {
  const lowpassFilter = _initializeLowpassFilter(audioContext);
  _heartbeatEnvelopeGain = _initializeGain(destination, 0);
  lowpassFilter.connect(_heartbeatEnvelopeGain);

  _playBuffer(audioContext, _createNoiseBuffer(audioContext), lowpassFilter, true);
}


// ──── HELPER FUNCTIONS - RUNTIME STATE ─────────────────────────────────────


function _audioIsNotReady() {
  return !_ready;
}

function _audioContextIsNotReady() {
  return !_audioContext;
}


// ──── HELPER FUNCTIONS - GAIN UPDATE ───────────────────────────────────────


function _applyGain(gain, value, time) {
  gain.gain.setTargetAtTime(value, time, GAIN_SMOOTHING_TIME_CONSTANT);
}

function _applyGainWeights(weights, time) {
  _applyGain(_clusterGain, CLUSTER_VOLUME * weights.clusterWeight, time);
  _applyGain(_metaballGain, weights.metaballWeight, time);
  _applyGain(_burstGain, weights.burstWeight, time);
}

function _applyHeartbeatEnvelope(pulse, time) {
  const envelope = Math.max(0, pulse - 1) * HEARTBEAT_VOLUME;
  _heartbeatEnvelopeGain.gain.setTargetAtTime(envelope, time, HEARTBEAT_ENVELOPE_SMOOTHING_TIME_CONSTANT);
}


// ──── PUBLIC INTERFACE ─────────────────────────────────────────────────────


export function getAudioTime() {
  return _audioContextIsNotReady() ? performance.now() / 1000 : _audioContext.currentTime;
}

export function updateAudio() {
  if (_audioIsNotReady()) return;
  const time = getAudioTime();
  _applyGainWeights(getWeights(), time);
  _applyHeartbeatEnvelope(getPulse(), time);
}