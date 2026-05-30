const PERIOD       = 10.0;
const METABALL_END = PERIOD * 0.15;
const CLUSTER_END  = METABALL_END + PERIOD * 0.83;

let t             = 0;
let phaseOverride = null;

// ── logical phase ─────────────────────────────────────────────────────────────
// Hard phase value for physics and event detection.
// Jumps from 2→0 at cycle reset; 0.0 exactly during Metaball.

export function getLogicalPhase() {
  if (phaseOverride !== null) return phaseOverride;
  const c = t % PERIOD;
  if (c < METABALL_END) return 0.0;
  if (c < CLUSTER_END)  return (c - METABALL_END) / (CLUSTER_END - METABALL_END);
  return 1.0 + (c - CLUSTER_END) / (PERIOD - CLUSTER_END);
}

// ── visual phase ──────────────────────────────────────────────────────────────
// Exponential lerp toward logical phase (rate 0.08/frame, half-life ~8 frames).
// The hard 2→0 reset becomes a ~25-frame gradual cross-fade.

let _visualPhase = 0;

function _updateVisualPhase() {
  _visualPhase += (getLogicalPhase() - _visualPhase) * 0.08;
}

export function getVisualPhase() {
  return _visualPhase;
}

// ── blend weights ─────────────────────────────────────────────────────────────
// Precomputed per frame; passed as uniforms so all shaders share one source of truth.
// clusterBlend is gated by smoothstep(0, 0.15, logicalPhase) — 0 when logicalPhase=0.
// metaballBlend = max(0, 1 - cluster - burst): fills any gap, ensures no black frames.

let _metaballBlend = 1;
let _clusterBlend  = 0;
let _burstBlend    = 0;

function _ss(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function _updateBlends() {
  const v = _visualPhase;
  const l = getLogicalPhase();
  _clusterBlend  = _ss(0.2, 0.5, v) * (1 - _ss(1.1, 1.65, v)) * _ss(0.0, 0.15, l);
  _burstBlend    = _ss(1.3, 2.0, v);
  _metaballBlend = Math.max(0, 1 - _clusterBlend - _burstBlend);
}

export function getMetaballBlend()    { return _metaballBlend; }
export function getClusterBlend() { return _clusterBlend; }
export function getBurstBlend()   { return _burstBlend; }

// ── phase transitions ─────────────────────────────────────────────────────────

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

// ── time & controls ───────────────────────────────────────────────────────────

export function tick() {
  t += 0.004;
  _updateVisualPhase();
  _updateBlends();
  _checkSlot(getLogicalPhase());
}

export function getTime() { return t; }

export function triggerPhase(value) {
  phaseOverride = value;
  _checkSlot(value);
}

export function releasePhase() {
  phaseOverride = null;
  _checkSlot(getLogicalPhase());
}
